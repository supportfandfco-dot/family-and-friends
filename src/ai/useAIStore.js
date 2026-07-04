// ═══════════════════════════════════════════════════════════
//  useAIStore — Zustand store for UnifyAI 2.0
// ═══════════════════════════════════════════════════════════
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

const useAIStore = create(subscribeWithSelector((set, get) => ({
  // ── Overlay ──────────────────────────────────────────────
  overlayOpen: false,
  overlayContext: null,
  overlayHistory: [],
  overlayStreaming: false,

  openOverlay:  (ctx) => set({ overlayOpen: true, overlayContext: ctx }),
  closeOverlay: ()    => set({ overlayOpen: false, overlayContext: null, overlayHistory: [], overlayStreaming: false }),
  appendOverlayHistory: (e) => set(s => ({ overlayHistory: [...s.overlayHistory, e] })),
  setOverlayStreaming:   (v) => set({ overlayStreaming: v }),

  // ── Unified answer ───────────────────────────────────────
  unifiedAnswer: null,
  setUnifiedAnswer:   (u) => set({ unifiedAnswer: u }),
  clearUnifiedAnswer: ()  => set({ unifiedAnswer: null }),

  // ── Smart replies ────────────────────────────────────────
  smartReplies: [],
  smartRepliesLoading: false,
  setSmartReplies:        (r) => set({ smartReplies: r }),
  setSmartRepliesLoading: (v) => set({ smartRepliesLoading: v }),
  clearSmartReplies:      ()  => set({ smartReplies: [], smartRepliesLoading: false }),

  // ── Voice AI ─────────────────────────────────────────────
  voiceAIOpen: false,
  voiceContext: null,
  voiceTranscript: '',
  voiceResponse: '',
  voiceListening: false,
  // ctx is the SAME {type, data:{messages, partnerName|groupName, ...}}
  // shape the text overlay uses (see getAIContext() in ChatWindow/
  // GroupChat) — this is what gives Voice AI real chat awareness.
  openVoiceAI:        (ctx = null) => set({ voiceAIOpen: true, voiceContext: ctx, voiceTranscript: '', voiceResponse: '' }),
  closeVoiceAI:       () => set({ voiceAIOpen: false, voiceContext: null, voiceTranscript: '', voiceResponse: '', voiceListening: false }),
  setVoiceTranscript: (t) => set({ voiceTranscript: t }),
  setVoiceResponse:   (t) => set({ voiceResponse: t }),
  setVoiceListening:  (v) => set({ voiceListening: v }),

  // ── Media analysis ───────────────────────────────────────
  mediaAnalysis: {},
  setMediaAnalysis:   (k, v) => set(s => ({ mediaAnalysis: { ...s.mediaAnalysis, [k]: v } })),
  clearMediaAnalysis: (k)    => set(s => { const m = { ...s.mediaAnalysis }; delete m[k]; return { mediaAnalysis: m }; }),

  // ── Group pulse ──────────────────────────────────────────
  groupPulse: null,
  setGroupPulse:   (p) => set({ groupPulse: p }),
  clearGroupPulse: ()  => set({ groupPulse: null }),

  // ── Priority inbox ───────────────────────────────────────
  priorityChats: [],
  priorityLoading: false,
  setPriorityChats:   (c) => set({ priorityChats: c }),
  setPriorityLoading: (v) => set({ priorityLoading: v }),

  // ── AI memory layer ──────────────────────────────────────
  aiMemory: {
    prefersConcise: false,
    commonTopics: [],
    writingTone: 'casual',
    activePeriods: [],
  },
  updateMemory: (patch) => set(s => ({ aiMemory: { ...s.aiMemory, ...patch } })),

  // ── Cache ────────────────────────────────────────────────
  summaryCache: {},
  setSummaryCache: (id, text) => set(s => ({ summaryCache: { ...s.summaryCache, [id]: { text, ts: Date.now() } } })),
  getSummaryCache: (id) => {
    const e = get().summaryCache[id];
    if (!e || Date.now() - e.ts > 5 * 60 * 1000) return null;
    return e.text;
  },
})));

export default useAIStore;
