// ═══════════════════════════════════════════════════════════
//  Groq Client — Fast inference via Vercel proxy
//  Timeout protection, error normalization
// ═══════════════════════════════════════════════════════════
import { GROQ_ENDPOINT, GROQ_MODELS, ROUTING } from './aiConfig.js';
import { getCached, setCache } from './responseCache.js';
import { SYSTEM_BASE } from './promptTemplates.js';

// ── Core request with timeout + retry ────────────────────────
async function groqRequest(model, messages, maxTokens, signal, attempt = 0) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ROUTING.TIMEOUT_MS);
  if (signal) signal.addEventListener('abort', () => controller.abort());

  const safeMessages = messages.map(m => {
    if (m.role === 'user' && m.content?.length > 1500)
      return { ...m, content: m.content.slice(0, 1500) + '\n[truncated]' };
    return m;
  });

  try {
    const res = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({ model, messages: safeMessages, max_tokens: maxTokens, temperature: 0.7 }),
    });
    clearTimeout(timeoutId);

    // Retry on rate limit or server error
    if ((res.status === 429 || res.status >= 500) && attempt < (ROUTING.MAX_RETRIES || 2)) {
      await new Promise(r => setTimeout(r, (ROUTING.RETRY_DELAY_MS || 1000) * (attempt + 1)));
      return groqRequest(model, messages, maxTokens, signal, attempt + 1);
    }

    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error?.message || `Groq ${res.status}`);
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('Empty response from Groq');
    return text;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') throw new Error('timeout');

    // Retry on transient network error
    if (attempt < (ROUTING.MAX_RETRIES || 2) && err.message !== 'timeout') {
      await new Promise(r => setTimeout(r, ROUTING.RETRY_DELAY_MS || 1000));
      return groqRequest(model, messages, maxTokens, signal, attempt + 1);
    }

    // Fallback to Gemini after all retries exhausted
    try {
      const gRes = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: messages.filter(m => m.role !== 'system').map(m => m.content).join('\n'),
          system: messages.find(m => m.role === 'system')?.content || '',
          model: 'gemini-2.5-flash',
          max_tokens: maxTokens,
        }),
      });
      const gData = await gRes.json();
      if (!gRes.ok || gData.error) throw new Error(gData.error?.message || 'Gemini error');
      if (gData.text) return gData.text.trim();
    } catch (gErr) {
      console.warn('Gemini fallback failed:', gErr.message);
    }
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
