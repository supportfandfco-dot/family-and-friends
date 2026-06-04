// ═══════════════════════════════════════════════════════════
//  Response Cache — TTL-based, size-limited cache
// ═══════════════════════════════════════════════════════════
import { ROUTING } from './aiConfig.js';

const cache = new Map();
const MAX_SIZE = 60;

function makeKey(prompt, model = '') {
  let hash = 0;
  for (let i = 0; i < prompt.length; i++) {
    const char = prompt.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `${model}:${hash}`;
}

export function getCached(prompt, model = '') {
  const key = makeKey(prompt, model);
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > ROUTING.CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

export function setCache(prompt, value, model = '') {
  const key = makeKey(prompt, model);
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
