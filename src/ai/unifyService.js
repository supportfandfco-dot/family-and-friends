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

// ── Shared chat-context string builder ─────────────────────────
// Single source of truth for turning an overlay/voice context object
// ({type, data:{messages, partnerName|groupName, ...}}) into the transcript
// string TEMPLATES.overlayQuestion embeds in the prompt. Used identically
// by UnifyAIOverlay (text) and VoiceAI (voice) so a chat-aware question
// gets the exact same context — and therefore the same answer quality —
// regardless of which surface asked it.
export function buildChatContextString(overlayContext) {
  if (!overlayContext?.data?.messages?.length) return null;
  const { type, data } = overlayContext;
  const recent = data.messages.slice(-15)
    .map(m => `${m.senderName || 'User'}: ${m.content?.slice(0, 150) || '[media]'}`)
    .join('\n');
  return `${type === 'group' ? 'Group' : 'Chat'} "${data.partnerName || data.groupName || ''}":\n${recent}`;
}

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
  // Layer 1 — local replies instantly (shown immediately, no API)
  const localReplies = generateLocalReplies(messages).map(r => ({ type: 'reply', value: r }));

  // Only call Groq if there are enough messages for context
  if (!messages?.length) return localReplies;
  const lastMsg = messages[messages.length - 1];
  if (!lastMsg || lastMsg.isOwn) return localReplies;

  // Use last 8 messages for better context (not just 5)
  const context = messages.slice(-8)
    .map(m => `${m.isOwn ? myName || 'Me' : (m.senderName || 'Them')}: ${(m.content || '').slice(0, 150)}`)
    .filter(l => l.split(': ')[1]?.trim())
    .join('\n');

  try {
    const text = await askFast(
      TEMPLATES.smartActions(context, myName || 'Me'),
      'Return ONLY a valid JSON array of strings. No objects, no explanation, no markdown.',
    );
    const clean = text.replace(/```json|```/g, '').trim();

    // Handle both flat string array ["a","b"] and object array [{type,value}]
    const parsed = JSON.parse(clean);
    if (!Array.isArray(parsed) || !parsed.length) return localReplies;

    if (typeof parsed[0] === 'string') {
      // New format: flat strings
      return parsed.filter(s => s && s.trim().length > 0).map(s => ({ type: 'reply', value: s.trim() }));
    } else if (typeof parsed[0] === 'object') {
      // Old format fallback
      return parsed.filter(r => r?.value);
    }
    return localReplies;
  } catch {
    return localReplies;
  }
}

// ── Conversation Intelligence (Meeting-intelligence mode) ──────
export async function analyzeGroupPulse(messages, groupName) {
  // ── Layer 1: local extraction — always runs, zero latency ──
  const local = localGroupPulse(messages, groupName);

  // Not enough messages to warrant Groq
  const recent = messages.slice(-40);
  const transcript = recent
    .map(m => `${m.senderName || 'Member'}: ${(m.content || m.text || '').slice(0, 180)}`)
    .filter(l => l.split(': ')[1]?.trim())
    .join('\n');

  if (!transcript.trim() || messages.length < 3) return local;

  // ── Cache check ──────────────────────────────────────────────
  const cacheKey = transcript.slice(0, 300); // cache on first 300 chars of transcript
  const cached = getCached(cacheKey, 'pulse2');
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      return mergeLocalAndGroq(local, parsed);
    } catch {}
  }

  // ── Layer 2: Groq refinement — only when messages warrant it ─
  try {
    const text = await askFast(
      TEMPLATES.groupPulse(transcript, groupName, local._raw),
      'You are a strict meeting intelligence extractor. Return ONLY raw JSON. No markdown. No invented content. Every item must come directly from the chat transcript provided.'
    );

    let clean = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
    const start = clean.indexOf('{');
    const end   = clean.lastIndexOf('}');
    if (start === -1 || end === -1) return local;
    clean = clean.slice(start, end + 1).replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ');

    const parsed = JSON.parse(clean);

    // Filter out generic/useless outputs
    const filtered = filterGenericOutputs(parsed, groupName);

    setCache(cacheKey, JSON.stringify(filtered), 'pulse2');
    return mergeLocalAndGroq(local, filtered);
  } catch (e) {
    // Group pulse Groq failed — using local fallback
    return local;
  }
}

// Merge local extraction with Groq refinement
// Groq wins if it has specific content; local wins otherwise
function mergeLocalAndGroq(local, groq) {
  const pick = (groqArr, localArr) => {
    const g = (groqArr || []).filter(s => s && s.trim().length > 5);
    const l = (localArr || []).filter(s => s && s.trim().length > 5);
    // Prefer Groq if it has more specific results, else use local
    if (g.length > 0 && g.some(s => s.length > 15)) return g;
    return l.length ? l : g;
  };

  return {
    summary:           groq.summary?.length > 20 ? groq.summary : local.summary,
    mood:              local.mood, // always from local (pattern-based, more reliable)
    topics:            pick(groq.topics, local.topics),
    decisions:         pick(groq.decisions, local.decisions),
    action_items:      pick(groq.action_items, local.action_items),
    pending_questions: pick(groq.pending_questions, local.pending_questions),
    deadlines:         pick(groq.deadlines, local.deadlines),
    unanswered:        local.unanswered, // backward compat
    isLocal: false,
  };
}

// Remove generic outputs that add no value
const GENERIC_PHRASES = [
  /^group has \d+ members/i,
  /^members are (talking|chatting|discussing)/i,
  /^the group is (active|talking|chatting)/i,
  /^(positive|casual|active|general) (vibe|conversation|discussion)$/i,
  /^no (major |specific )?(decisions?|action items?|deadlines?) (found|detected|mentioned)?$/i,
];

function filterGenericOutputs(parsed, groupName) {
  const filter = (arr) => (arr || []).filter(item => {
    if (!item || item.trim().length < 8) return false;
    return !GENERIC_PHRASES.some(p => p.test(item.trim()));
  });

  return {
    ...parsed,
    decisions:         filter(parsed.decisions),
    action_items:      filter(parsed.action_items),
    pending_questions: filter(parsed.pending_questions),
    deadlines:         filter(parsed.deadlines),
    topics:            filter(parsed.topics),
  };
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
export async function askUnify(args) { return unifiedAnswer(args); }
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

  let text;
  let failed = false;
  try {
    text = await askVision(TEMPLATES.mediaAnalyze() + ' Also describe what you see in 2 sentences.', b64, mime, signal);
    if (!text?.trim()) { text = 'Vision API returned an empty response.'; failed = true; }
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    // Show the ACTUAL error from the API/proxy — this is what was hidden before
    text = err.message || 'Could not analyze this image right now.';
    failed = true;
  }

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
  // Propagate the REAL error message — was being replaced with a generic
  // string that hid the actual cause (e.g. missing API key, quota, bad model).
  const result = await askVision(TEMPLATES.captionWrite(), b64, mime);
  if (!result?.trim()) throw new Error('Vision API returned an empty caption');
  return result;
}

export async function enhanceStatusCaption(caption) {
  if (!caption?.trim()) return caption;
  try {
    const result = await enhance(TEMPLATES.captionEnhance(caption), SYSTEM_BASE, caption);
    return result.text;
  } catch { return caption; }
}

export async function generateCommandCenterInsights(chats, groups, myUid) {
  const safeChats = chats.slice(0, 10).map(c => ({ name: c.contactName, msg: c.lastMessage ? (c.lastMessage.type === 'text' ? c.lastMessage.content : `[${c.lastMessage.type}]`) : '' }));
  const safeGroups = groups.slice(0, 5).map(g => ({ name: g.name, msg: g.lastMessage ? (g.lastMessage.type === 'text' ? g.lastMessage.content : `[${g.lastMessage.type}]`) : '' }));

  const promptText = `Analyze recent communication and return strict JSON representing a Command Center dashboard. Data to process:
  Chats: ${JSON.stringify(safeChats)}
  Groups: ${JSON.stringify(safeGroups)}
  
  Must return EXACTLY this JSON format with NO markdown formatting, just raw JSON:
  {
    "unreadCount": 0, "waitingCount": 0, "tasksCount": 0, "updatesCount": 0,
    "awayUpdates": [ { "source": "Group or Person name", "points": ["What happened", "Action required"] } ],
    "waiting": [ { "person": "Name", "duration": "e.g. 2 hours", "context": "What they asked about" } ],
    "tasks": [ { "title": "Task name", "dueDate": "e.g. Tomorrow", "source": "Source name" } ],
    "timeline": [ { "time": "hh:mm", "description": "What happened" } ],
    "decisions": [ { "topic": "Decision made", "source": "Source name" } ],
    "commitments": [ { "promise": "I'll do X", "dueDate": "e.g. Tonight", "source": "Source name" } ]
  }`;

  try {
    const cached = getCached(promptText, 'cmdcenter');
    if (cached) return JSON.parse(cached);

    const txt = await askDeep(promptText, "You are a data extraction AI. Respond ONLY with raw, valid JSON. DO NOT use markdown code blocks like ```json. Return exactly one valid JSON object. Avoid trailing commas. ALL interior double quotes inside strings MUST be escaped. DO NOT escape single quotes.");
    // Attempt to extract JSON from markdown if present
    const firstBrace = txt.indexOf('{');
    const lastBrace = txt.lastIndexOf('}');
    let clean = txt;
    if (firstBrace !== -1 && lastBrace !== -1) {
      clean = txt.slice(firstBrace, lastBrace + 1);
    }
    
    // clean up common JSON format issues from LLMs
    clean = clean.replace(/```json/g, '').replace(/```/g, '').trim();
    // Sometimes LLMs wrongly escape single quotes in JSON string values. JSON string values should not escape single quotes.
    clean = clean.replace(/\\'/g, "'");

    let data;
    try {
      data = JSON.parse(clean);
    } catch (parseError) {
      // JSON parse error in command center gen
      // Try to remove trailing commas before closing braces/brackets
      clean = clean.replace(/,\s*([\}\]])/g, '$1');
      // Fix unescaped line breaks in values by replacing structural line breaks with space? No, let's just attempt to parse again.
      // Often trailing comma is the culprit.
      try {
        data = JSON.parse(clean);
      } catch (e2) {
        // Last resort: strip structural newlines to string escaping
        // (this is risky, better to return fallback on failure)
        throw e2;
      }
    }

    let unreadCount = 0;
    chats.forEach(c => c.unread && c.unread[myUid] ? unreadCount += c.unread[myUid] : 0);
    groups.forEach(g => g.unread && g.unread[myUid] ? unreadCount += g.unread[myUid] : 0);
    
    data.unreadCount = unreadCount || data.unreadCount || 0;
    
    setCache(promptText, JSON.stringify(data), 'cmdcenter', 1000 * 60 * 5); // 5 min cache
    return data;
  } catch (err) {
    // Command Center gen error
    return {
      unreadCount: 0, waitingCount: 0, tasksCount: 0, updatesCount: 0,
      awayUpdates: [], waiting: [], tasks: [], timeline: []
    };
  }
}
