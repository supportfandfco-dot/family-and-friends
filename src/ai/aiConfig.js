// ═══════════════════════════════════════════════════════════
//  AI Config — Model definitions and routing thresholds
// ═══════════════════════════════════════════════════════════

export const GROQ_ENDPOINT = '/api/groq';
export const GEMINI_ENDPOINT = '/api/gemini';

// ── Groq models ───────────────────────────────────────────────
export const GROQ_MODELS = {
  fast: {
    id: 'llama-3.1-8b-instant',
    label: 'Llama 3.1',
    description: 'Fast lightweight model',
    maxTokens: 1024,
    // Use for: quick summaries, reply refinement, short tasks
  },
  deep: {
    id: 'llama-3.3-70b-versatile',
    label: 'Llama 3.3',
    description: 'Deep reasoning model',
    maxTokens: 2048,
    // Use for: complex questions, emotional nuance, synthesis
  },
  analytical: {
    id: 'deepseek-r1-distill-llama-70b',
    label: 'DeepSeek R1',
    description: 'Analytical reasoning model',
    maxTokens: 2048,
    // Use for: structured outputs, comparisons, insights
  },
};

// ── Routing thresholds ────────────────────────────────────────
export const ROUTING = {
  // Prompts shorter than this → single fast model only
  SIMPLE_PROMPT_LENGTH: 200,
  // Prompts longer than this → full multi-model synthesis
  COMPLEX_PROMPT_LENGTH: 400,
  // AI timeout — 15s for large models, was 5s which caused too many fallbacks
  TIMEOUT_MS: 15000,
  // Cache TTL
  CACHE_TTL_MS: 10 * 60 * 1000, // 10 minutes
  // Debounce for typing-triggered AI
  DEBOUNCE_MS: 800,
  // Max retries on 429/503
  MAX_RETRIES: 2,
  RETRY_DELAY_MS: 1000,
};

// ── Keywords that trigger deep reasoning ──────────────────────
export const DEEP_REASONING_TRIGGERS = [
  'plan', 'planning', 'should i', 'best option', 'compare', 'decide',
  'decision', 'advice', 'recommend', 'reason', 'explain', 'analyse',
  'analyze', 'strategy', 'approach', 'debate', 'brainstorm', 'pros and cons',
  'how to', 'step by step', 'research', 'understand', 'complex',
];

export const ANALYTICAL_TRIGGERS = [
  'extract', 'structure', 'list', 'summarize all', 'key points',
  'action items', 'insights', 'patterns', 'contradictions', 'compare',
  'rank', 'prioritize', 'categorize',
];
