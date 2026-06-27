// ═══════════════════════════════════════════════════════
//  LiveKit Configuration — All config isolated here.
//  Switch between Cloud Free / Pro / self-hosted by
//  changing env vars only — no code changes needed.
// ═══════════════════════════════════════════════════════

export const LIVEKIT_CONFIG = {
  // LiveKit server URL — set VITE_LIVEKIT_URL in .env
  // Cloud Free:  wss://your-project.livekit.cloud
  // Self-hosted: wss://your-server.example.com
  url: import.meta.env.VITE_LIVEKIT_URL || '',

  // Token endpoint — your Cloudflare Pages Function
  tokenEndpoint: import.meta.env.VITE_LIVEKIT_TOKEN_ENDPOINT || '/api/livekit-token',

  // Room name prefix for AI voice sessions
  aiRoomPrefix: 'ai-voice-',

  // AI meeting assistant identity
  aiAssistantIdentity: 'ff-ai-assistant',

  // Audio constraints optimised for <150ms latency
  audioConstraints: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl:  true,
    sampleRate:       16000, // 16kHz — sufficient for speech, minimal latency
    channelCount:     1,     // mono
  },

  // Timeouts
  connectTimeoutMs:   10_000,
  reconnectTimeoutMs: 30_000,
};

export const isLiveKitConfigured = () =>
  Boolean(LIVEKIT_CONFIG.url && LIVEKIT_CONFIG.url.startsWith('wss://'));
