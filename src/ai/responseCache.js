// ═══════════════════════════════════════════════════════════
//  Response Cache — TTL-based, size-limited cache
// ═══════════════════════════════════════════════════════════
import { ROUTING } from './aiConfig.js';

const cache = new Map();
const MAX_SIZE = 60;

function makeKey(prompt, model = '', systemPrompt = '') {
  // IMPORTANT: the key must include the system prompt, not just the tier
  // name ("fast"/"deep"/"analytical"). Two totally different callers (e.g.
  // the voice intent classifier and the normal conversational pipeline) can
  // both call askFast() with the exact same user text but different system
  // prompts. If the key only depends on (model, prompt), the second caller
  // silently receives the first caller's cached response — this is what
  // caused Voice AI to answer with a raw '{"intent":"none"}' JSON blob
  // instead of a real reply.
  const combined = model + '|' + systemPrompt + '|' + prompt;
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `${model}:${hash}`;
}

export function getCached(prompt, model = '', systemPrompt = '') {
  const key = makeKey(prompt, model, systemPrompt);
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > ROUTING.CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

export function setCache(prompt, value, model = '', systemPrompt = '') {
  const key = makeKey(prompt, model, systemPrompt);
  // Evict oldest entry when full
  if (cache.size >= MAX_SIZE) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
    if (oldest) cache.delete(oldest[0]);
  }
  cache.set(key, { value, ts: Date.now() });
}

export function clearCache() {
  cache.clear();
}
