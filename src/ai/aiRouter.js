// ═══════════════════════════════════════════════════════════
//  AI Router — Decides which layer/model to use per request
//  Invisible to the user. Never exposes routing decisions.
// ═══════════════════════════════════════════════════════════
import { ROUTING, DEEP_REASONING_TRIGGERS, ANALYTICAL_TRIGGERS } from './aiConfig.js';

export const ROUTE = {
  LOCAL:      'local',       // Layer 1 — no API call
  SINGLE:     'single',      // Layer 2 — one fast model
  MULTI:      'multi',       // Layer 3 — full synthesis
};

// ── Classify prompt complexity ────────────────────────────────
export function classifyPrompt(prompt, context = '') {
  const text = (prompt + ' ' + context).toLowerCase();
  const len  = prompt.length;

  // Short simple prompts → single fast model
  if (len < ROUTING.SIMPLE_PROMPT_LENGTH) {
    const needsDeep = DEEP_REASONING_TRIGGERS.some(t => text.includes(t));
    return needsDeep ? ROUTE.SINGLE : ROUTE.SINGLE; // still single, just picks different model
  }

  // Long or analytically complex → multi-model synthesis
  if (len > ROUTING.COMPLEX_PROMPT_LENGTH) return ROUTE.MULTI;
  if (DEEP_REASONING_TRIGGERS.filter(t => text.includes(t)).length >= 2) return ROUTE.MULTI;

  return ROUTE.SINGLE;
}

// ── Pick the right model for a prompt ────────────────────────
export function pickModel(prompt, context = '') {
  const text = (prompt + ' ' + context).toLowerCase();

  const needsAnalytical = ANALYTICAL_TRIGGERS.some(t => text.includes(t));
  if (needsAnalytical) return 'analytical';

  const needsDeep = DEEP_REASONING_TRIGGERS.some(t => text.includes(t));
  if (needsDeep || prompt.length > 300) return 'deep';

  return 'fast';
}

// ── Should this go to multi-model synthesis? ──────────────────
export function shouldSynthesize(prompt) {
  return false;
}
