// ═══════════════════════════════════════════════════════════
//  Groq Client — Fast inference via Vercel proxy
//  Timeout protection, error normalization
// ═══════════════════════════════════════════════════════════
import { GROQ_ENDPOINT, GROQ_MODELS, ROUTING } from './aiConfig.js';
import { getCached, setCache } from './responseCache.js';
import { SYSTEM_BASE } from './promptTemplates.js';

// ── Core request with timeout ─────────────────────────────────
async function groqRequest(model, messages, maxTokens, signal) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ROUTING.TIMEOUT_MS);
  const combinedSignal = signal || controller.signal;

  // Hard cap: truncate user message content to prevent context_length_exceeded
  const safeMessages = messages.map(m => {
    if (m.role === 'user' && m.content?.length > 1500) {
      return { ...m, content: m.content.slice(0, 1500) + '\n[truncated]' };
    }
    return m;
  });

  try {
    const res = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: combinedSignal,
      body: JSON.stringify({ model, messages: safeMessages, max_tokens: maxTokens, temperature: 0.7 }),
    });

    clearTimeout(timeoutId);

    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(data.error?.message || `Groq ${res.status}`);
    }

    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('Empty response from Groq');
    return text;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') throw new Error('timeout');
    throw err;
  }
}

// ── Fast model (llama-3.1-8b-instant) ────────────────────────
export async function askFast(prompt, systemPrompt, signal) {
  const cached = getCached(prompt, 'fast');
  if (cached) return cached;

  const text = await groqRequest(
    GROQ_MODELS.fast.id,
    [
      { role: 'system', content: systemPrompt || SYSTEM_BASE },
      { role: 'user',   content: prompt },
    ],
    GROQ_MODELS.fast.maxTokens,
    signal
  );

  setCache(prompt, text, 'fast');
  return text;
}

// ── Deep reasoning model (llama-3.3-70b-versatile) ───────────
export async function askDeep(prompt, systemPrompt, signal) {
  const cached = getCached(prompt, 'deep');
  if (cached) return cached;

  const text = await groqRequest(
    GROQ_MODELS.deep.id,
    [
      { role: 'system', content: systemPrompt || SYSTEM_BASE },
      { role: 'user',   content: prompt },
    ],
    GROQ_MODELS.deep.maxTokens,
    signal
  );

  setCache(prompt, text, 'deep');
  return text;
}

// ── Analytical model (deepseek-r1-distill-llama-70b) ─────────
export async function askAnalytical(prompt, systemPrompt, signal) {
  const cached = getCached(prompt, 'analytical');
  if (cached) return cached;

  const text = await groqRequest(
    GROQ_MODELS.analytical.id,
    [
      { role: 'system', content: systemPrompt || SYSTEM_BASE },
      { role: 'user',   content: prompt },
    ],
    GROQ_MODELS.analytical.maxTokens,
    signal
  );

  setCache(prompt, text, 'analytical');
  return text;
}

// ── Vision via Gemini (Groq doesn't support images) ───────────
export async function askVision(prompt, imageBase64, mimeType, signal) {
  try {
    const res = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        prompt,
        system: SYSTEM_BASE,
        model: 'gemini-2.0-flash',
        max_tokens: 300,
        imageBase64,
        imageMimeType: mimeType,
      }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error);
    return data.text?.trim() || '';
  } catch (err) {
    if (err.name === 'AbortError' || err.message === 'timeout') throw err;
    throw new Error('Vision unavailable');
  }
}
