// ═══════════════════════════════════════════════════════════
//  Synthesis Engine — Multi-model parallel execution + merge
//  Produces ONE coherent answer, never exposes model names
// ═══════════════════════════════════════════════════════════
import { askDeep, askFast, askAnalytical } from './groqClient.js';
import { SYSTEM_BASE, TEMPLATES } from './promptTemplates.js';
import { getCached, setCache } from './responseCache.js';

// ── Run all 3 models in parallel ──────────────────────────────
async function runParallel(prompt, signal) {
  const [deepRes, analyticalRes, fastRes] = await Promise.allSettled([
    askDeep(prompt, SYSTEM_BASE, signal),
    askAnalytical(prompt, SYSTEM_BASE, signal),
    askFast(prompt, SYSTEM_BASE, signal),
  ]);

  return {
    deep:       deepRes.status       === 'fulfilled' ? deepRes.value       : null,
    analytical: analyticalRes.status === 'fulfilled' ? analyticalRes.value : null,
    fast:       fastRes.status       === 'fulfilled' ? fastRes.value       : null,
  };
}

// ── Merge responses into one coherent answer ──────────────────
async function mergeResponses(question, responses, signal) {
  const available = Object.values(responses).filter(Boolean);

  // Only one succeeded — return it directly
  if (available.length === 1) return available[0];

  // All failed
  if (available.length === 0) throw new Error('All models failed');

  // Build synthesis prompt — don't expose model names
  const parts = available
    .map((r, i) => `Response ${i + 1}:\n${r}`)
    .join('\n\n');

  const synthesisPrompt = TEMPLATES.synthesis(question, parts);

  // Use fast model for synthesis (it's just merging text)
  try {
    return await askFast(synthesisPrompt, 'You are a synthesis engine. Merge the provided responses into one clear, coherent answer. Remove repetition. Prioritize clarity. Do not mention "responses" or "synthesis" in your output. Start directly with the answer.', signal);
  } catch {
    // Fallback: return the longest response (likely most complete)
    return available.sort((a, b) => b.length - a.length)[0];
  }
}

// ── Main synthesis function ───────────────────────────────────
export async function synthesize(prompt, signal, onProgress) {
  const cacheKey = `synthesis:${prompt.slice(0, 150)}`;
  const cached = getCached(cacheKey, 'synthesis');
  if (cached) {
    onProgress?.({ done: true, text: cached, fromCache: true });
    return cached;
  }

  onProgress?.({ phase: 'thinking' });

  const responses = await runParallel(prompt, signal);
  const succeeded = Object.values(responses).filter(Boolean).length;

  onProgress?.({ phase: 'merging', succeeded });

  const unified = await mergeResponses(prompt, responses, signal);

  setCache(cacheKey, unified, 'synthesis');
  onProgress?.({ done: true, text: unified });
  return unified;
}
