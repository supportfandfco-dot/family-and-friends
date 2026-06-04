// ═══════════════════════════════════════════════════════════
//  UnifyAI Service — Main orchestrator
//  Layer 1 (local) → Layer 2 (Groq single) → Layer 3 (synthesis)
//  Invisible to users. Never shows failures as errors.
// ═══════════════════════════════════════════════════════════

import {
  generateLocalReplies, localGroupPulse, localChatSummary,
  localSemanticSearch, analyzeConversationMood, extractKeywords,
  findUnansweredQuestions,
} from './localIntelligence.js';
import { askFast, askDeep, askAnalytical, askVision } from './groqClient.js';
import { classifyPrompt, pickModel, shouldSynthesize, ROUTE } from './aiRouter.js';
import { synthesize } from './synthesisEngine.js';
import { getCached, setCache } from './responseCache.js';
import { TEMPLATES, SYSTEM_BASE } from './promptTemplates.js';

export { generateLocalReplies, localSemanticSearch };

// ── Model display configs (for UI only) ───────────────────────
export const MODELS = {
  groq_fast:       { id: 'groq_fast',       label: 'Llama 3.1',  sublabel: 'Groq', color: '#f97316', icon: '◆' },
  groq_deep:       { id: 'groq_deep',       label: 'Llama 3.3',  sublabel: 'Groq', color: '#8b5cf6', icon: '◈' },
  groq_analytical: { id: 'groq_analytical', label: 'DeepSeek R1',sublabel: 'Groq', color: '#06b6d4', icon: '◉' },
};

// ── Core ask — picks model, handles fallback ──────────────────
async function askGroq(prompt, systemPrompt, signal) {
  const model = pickModel(prompt);
  const askFn = model === 'analytical' ? askAnalytical : model === 'deep' ? askDeep : askFast;
  return askFn(prompt, systemPrompt, signal);
}

// ── Layer 2 enhancement with local fallback ───────────────────
export async function enhance(prompt, systemPrompt, localFallback, signal) {
  const cached = getCached(prompt, 'enhance');
  if (cached) return { text: cached, source: 'cache' };

  try {
    const text = await askGroq(prompt, systemPrompt, signal);
    setCache(prompt, text, 'enhance');
    return { text, source: 'groq' };
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    // Silent fallback — never show error to user
    return { text: localFallback || '', source: 'local', isFallback: true };
  }
}

// ── Smart replies ─────────────────────────────────────────────
// Layer 1 instant → Layer 2 enhancement in background
export async function suggestReplies(messages, myName) {
  // Always return local instantly (caller gets this first)
  const localReplies = generateLocalReplies(messages);

  const last5 = messages.slice(-5)
    .map(m => `${m.senderName || 'Them'}: ${m.content?.slice(0, 120) || '[media]'}`)
    .join('\n');

  try {
    const text = await askFast(
      TEMPLATES.smartReplies(last5, myName),
      'Return ONLY a valid JSON array of 3 short reply strings. No explanation, no markdown.',
    );
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    if (Array.isArray(parsed) && parsed.length === 3) return parsed;
    return localReplies;
  } catch {
    return localReplies;
  }
}

// ── Group pulse ───────────────────────────────────────────────
export async function analyzeGroupPulse(messages, groupName) {
  const local = localGroupPulse(messages, groupName);

  const transcript = messages.slice(-12)
    .map(m => `${m.senderName || 'Member'}: ${m.content?.slice(0, 70) || '[media]'}`)
    .join('\n');

  if (!transcript.trim()) return local;

  const cached = getCached(transcript, 'pulse');
  if (cached) { try { return { ...JSON.parse(cached), isLocal: false }; } catch {} }

  try {
    const text = await askFast(
      `Group "${groupName}":\n${transcript}\n\nReturn ONLY JSON: {"summary":"1 sentence","mood":"word","topics":["t1","t2"],"action_items":[]}`,
      'Return ONLY valid compact JSON.'
    );
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    setCache(transcript, JSON.stringify(parsed), 'pulse');
    return { ...parsed, isLocal: false };
  } catch {
    return local;
  }
}

// ── Chat summary ──────────────────────────────────────────────
export async function summarizeMessages(messages, chatName) {
  const localSummary = localChatSummary(messages, chatName);
  const transcript = messages.slice(-15)
    .map(m => `${m.senderName || 'User'}: ${m.content?.slice(0, 80) || '[media]'}`)
    .join('\n');

  if (!transcript.trim()) return { text: localSummary, source: 'local' };

  return enhance(
    `Summarize this chat with ${chatName} in 2 sentences:\n\n${transcript}`,
    'Brief summary only. Max 2 sentences.',
    localSummary
  );
}

// ── Overlay ask — routes by complexity ───────────────────────
export async function overlayAsk({ question, context, onProgress, onDone, onError, signal }) {
  const prompt = context
    ? TEMPLATES.overlayQuestion(question, context)
    : question;

  try {
    if (shouldSynthesize(prompt)) {
      // Layer 3 — multi-model synthesis
      const text = await synthesize(prompt, signal, onProgress);
      onDone?.(text, false);
    } else {
      // Layer 2 — single model
      onProgress?.({ phase: 'thinking' });
      const model = pickModel(prompt);
      const askFn = model === 'deep' ? askDeep : model === 'analytical' ? askAnalytical : askFast;
      const text = await askFn(prompt, SYSTEM_BASE, signal);
      onProgress?.({ done: true });
      onDone?.(text, false);
    }
  } catch (err) {
    if (err.name === 'AbortError') return;
    onError?.(err);
  }
}

// ── unifiedAnswer — kept for compatibility with existing components
export async function unifiedAnswer({ prompt, system, signal, onModelResult, onUnifiedStart, onDone, localFallback }) {
  // Build mock responses object for UI compatibility
  const responses = {
    groq_fast:       { id: 'groq_fast',       text: null, error: null },
    groq_deep:       { id: 'groq_deep',       text: null, error: null },
    groq_analytical: { id: 'groq_analytical', text: null, error: null },
  };

  try {
    if (shouldSynthesize(prompt)) {
      // Multi-model
      const [fastRes, deepRes, analyticalRes] = await Promise.allSettled([
        askFast(prompt, system || SYSTEM_BASE, signal),
        askDeep(prompt, system || SYSTEM_BASE, signal),
        askAnalytical(prompt, system || SYSTEM_BASE, signal),
      ]);

      if (fastRes.status       === 'fulfilled') { responses.groq_fast.text       = fastRes.value;       onModelResult?.({ id: 'groq_fast',       text: fastRes.value,       ms: 0 }); }
      else { responses.groq_fast.error = fastRes.reason?.message;       onModelResult?.({ id: 'groq_fast',       text: null, error: fastRes.reason?.message }); }

      if (deepRes.status       === 'fulfilled') { responses.groq_deep.text       = deepRes.value;       onModelResult?.({ id: 'groq_deep',       text: deepRes.value,       ms: 0 }); }
      else { responses.groq_deep.error = deepRes.reason?.message;       onModelResult?.({ id: 'groq_deep',       text: null, error: deepRes.reason?.message }); }

      if (analyticalRes.status === 'fulfilled') { responses.groq_analytical.text = analyticalRes.value; onModelResult?.({ id: 'groq_analytical', text: analyticalRes.value, ms: 0 }); }
      else { responses.groq_analytical.error = analyticalRes.reason?.message; onModelResult?.({ id: 'groq_analytical', text: null, error: analyticalRes.reason?.message }); }

      onUnifiedStart?.();

      const available = Object.values(responses).filter(r => r.text).map(r => r.text);
      if (!available.length) {
        const fallback = localFallback || 'Could not process. Using local intelligence.';
        onDone?.(fallback, true);
        return { responses, unified: fallback, isFallback: true };
      }

      // Merge if multiple succeeded
      let unified = available[0];
      if (available.length > 1) {
        const parts = available.map((r, i) => `Response ${i+1}:\n${r}`).join('\n\n');
        try {
          unified = await askFast(TEMPLATES.synthesis(prompt, parts), 'Merge these into one clear answer. Start directly.', signal);
        } catch { unified = available.sort((a,b) => b.length - a.length)[0]; }
      }

      onDone?.(unified, false);
      return { responses, unified };
    } else {
      // Single model
      onUnifiedStart?.();
      const text = await askGroq(prompt, system || SYSTEM_BASE, signal);
      const modelId = pickModel(prompt) === 'deep' ? 'groq_deep' : pickModel(prompt) === 'analytical' ? 'groq_analytical' : 'groq_fast';
      responses[modelId].text = text;
      onModelResult?.({ id: modelId, text, ms: 0 });
      onDone?.(text, false);
      return { responses, unified: text };
    }
  } catch (err) {
    if (err.name === 'AbortError') return { responses, unified: '' };
    const fallback = localFallback || 'Enhanced synthesis unavailable — using local intelligence.';
    onDone?.(fallback, true);
    return { responses, unified: fallback, isFallback: true };
  }
}

// ── Image analysis ────────────────────────────────────────────
export async function analyzeImageBase64(base64Data, mimeType = 'image/jpeg', onChunk, onDone, signal) {
  const b64  = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
  const mime = base64Data.startsWith('data:') ? base64Data.split(';')[0].split(':')[1] : mimeType;

  let text = 'Image received.';
  try {
    text = await askVision(TEMPLATES.captionGenerate() + ' Also describe what you see in 2 sentences.', b64, mime, signal);
  } catch {}

  const words = text.split(' ');
  let built = '';
  for (const word of words) {
    built += (built ? ' ' : '') + word;
    onChunk?.(word + ' ', built);
    await new Promise(r => setTimeout(r, 16));
  }
  onDone?.(text);
  return text;
}

export async function generateCaption(base64Data, mimeType = 'image/jpeg') {
  const b64  = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
  const mime = base64Data.startsWith('data:') ? base64Data.split(';')[0].split(':')[1] : mimeType;
  try { return await askVision(TEMPLATES.captionGenerate(), b64, mime); } catch { return ''; }
}

export async function enhanceStatusCaption(caption) {
  if (!caption?.trim()) return caption;
  try {
    const result = await enhance(TEMPLATES.captionEnhance(caption), SYSTEM_BASE, caption);
    return result.text;
  } catch { return caption; }
}
