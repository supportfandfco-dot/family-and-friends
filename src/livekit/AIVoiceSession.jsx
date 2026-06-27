// ═══════════════════════════════════════════════════════
//  AIVoiceSession — Enterprise AI Voice Mode UI
//  Connects LiveKit room + AI pipeline + live CI
//  in a single, self-contained overlay.
// ═══════════════════════════════════════════════════════
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Mic, MicOff, X, Zap, Brain, CheckSquare, MessageSquare } from 'lucide-react';
import useLiveKitRoom, { RoomStatus } from './useLiveKitRoom';
import useAIVoicePipeline from './useAIVoicePipeline';
import useConversationIntelligenceLive from './useConversationIntelligenceLive';
import { isLiveKitConfigured, LIVEKIT_CONFIG } from './livekitConfig';

const TONE_COLOUR = {
  positive:   'text-green-400',
  excited:    'text-brand-400',
  neutral:    'text-[var(--text-secondary)]',
  concerned:  'text-yellow-400',
  frustrated: 'text-red-400',
};

export default function AIVoiceSession({ user, profile, onClose }) {
  const liveKitConfigured = isLiveKitConfigured();

  // LiveKit room (audio transport)
  const {
    status: roomStatus, error: roomError,
    localAudioTrack, connect, disconnect, setMuted,
  } = useLiveKitRoom();

  // AI pipeline (STT → router → TTS)
  const {
    isListening, isProcessing, isSpeaking,
    transcript, aiText, conversationHistory,
    startListening, stopListening, interrupt, clearHistory,
  } = useAIVoicePipeline({
    uid:     user?.uid,
    profile,
    onTranscript:  (t)   => ci.feedTurn('user', t),
    onAIResponse:  (txt) => ci.feedTurn('ai', txt),
    onInsight:     () => {},
  });

  // Real-time Conversation Intelligence
  const ci = useConversationIntelligenceLive();

  const [muted,      setMutedState]  = useState(false);
  const [micError,   setMicError]    = useState(null);
  const [activeTab,  setActiveTab]   = useState('chat'); // chat | insights
  const micStreamRef    = useRef(null);
  const chatBottomRef   = useRef(null);
  const hasSpeechSupport = useMemo(() =>
    typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition),
  []);

  // ── Auto-scroll conversation ────────────────────────
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversationHistory.length, isProcessing]);

  // ── Connect on mount ─────────────────────────────────
  useEffect(() => {
    const start = async () => {
      // Request microphone permission upfront with user-friendly error
      try {
        micStreamRef.current = await navigator.mediaDevices.getUserMedia({
          audio: LIVEKIT_CONFIG.audioConstraints,
        });
      } catch (err) {
        // Permission denied or no mic — still open UI, show error state
        micStreamRef.current = null;
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setMicError('Microphone access denied. Please allow mic access and try again.');
          return;
        }
      }

      // Connect to LiveKit room if configured (non-blocking — works without it)
      if (liveKitConfigured && user?.uid) {
        const roomName = `${LIVEKIT_CONFIG.aiRoomPrefix}${user.uid}`;
        connect(roomName, user.uid, profile?.name || user.uid).catch(() => {});
      }

      // Auto-start AI pipeline immediately — no extra tap needed
      await startListening(micStreamRef.current);
    };

    start();

    return () => {
      stopListening();
      disconnect();
      micStreamRef.current?.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    };
  }, []);

  // ── Mute toggle ──────────────────────────────────────
  const handleMuteToggle = useCallback(async () => {
    const next = !muted;
    setMutedState(next);
    if (liveKitConfigured) await setMuted(next);
    if (next) interrupt();
  }, [muted, setMuted, interrupt, liveKitConfigured]);

  // ── Status label ─────────────────────────────────────
  const statusLabel = () => {
    if (!hasSpeechSupport) return '⚠️ Browser STT not supported — use Chrome';
    if (muted)          return '🔇 Muted';
    if (isSpeaking)     return '🔊 AI is speaking…';
    if (isProcessing)   return '⚡ Thinking…';
    if (isListening)    return '🎤 Listening…';
    if (roomStatus === RoomStatus.CONNECTING)   return '⟳ Connecting…';
    if (roomStatus === RoomStatus.RECONNECTING) return '↻ Reconnecting…';
    return '⏸ Paused';
  };

  return (
    <div
      className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
    >
      <div
        className="w-full sm:w-[420px] rounded-t-3xl sm:rounded-3xl flex flex-col overflow-hidden"
        style={{
          background: 'var(--sidebar-bg)',
          maxHeight: '85vh',
          boxShadow: '0 -4px 40px rgba(0,0,0,0.4)',
        }}
      >
        {/* ── Header ──────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center shadow-lg">
              <Brain size={20} className="text-white" />
            </div>
            <div>
              <p className="font-bold text-[var(--text-primary)]">AI Voice</p>
              <p className={`text-xs font-medium ${
                roomStatus === RoomStatus.CONNECTED || !liveKitConfigured
                  ? 'text-green-400' : 'text-yellow-400'
              }`}>
                {statusLabel()}
              </p>
            </div>
          </div>
          <button
            onClick={() => { stopListening(); disconnect(); onClose(); }}
            className="w-9 h-9 rounded-xl hover:bg-[var(--hover)] flex items-center justify-center transition-colors"
          >
            <X size={18} className="text-[var(--text-secondary)]" />
          </button>
        </div>

        {/* ── Mic error ───────────────────────────────── */}
        {micError && (
          <div className="mx-4 mb-2 px-4 py-3 rounded-2xl bg-red-500/10 border border-red-500/20 flex-shrink-0">
            <p className="text-sm text-red-400 text-center">{micError}</p>
            <button
              onClick={() => { setMicError(null); }}
              className="mt-2 w-full text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* ── Visualiser orb ──────────────────────────── */}
        <div className="flex justify-center py-4 flex-shrink-0">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center relative"
            style={{
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              boxShadow: isListening && !muted && !isProcessing
                ? '0 0 0 8px rgba(99,102,241,0.15), 0 0 0 16px rgba(99,102,241,0.08)'
                : isSpeaking
                  ? '0 0 0 8px rgba(139,92,246,0.2), 0 0 0 20px rgba(139,92,246,0.1)'
                  : 'none',
              animation: isSpeaking ? 'pulse 1.5s ease-in-out infinite' : 'none',
              transition: 'box-shadow 0.3s ease',
            }}
          >
            {isProcessing
              ? <Zap size={28} className="text-white animate-pulse" />
              : <Mic  size={28} className={`text-white ${muted ? 'opacity-40' : ''}`} />
            }
          </div>
        </div>

        {/* ── Live transcript ──────────────────────────── */}
        {transcript && (
          <div className="mx-4 mb-3 px-4 py-2.5 rounded-2xl bg-[var(--input-bg)] flex-shrink-0">
            <p className="text-xs text-[var(--text-secondary)] mb-0.5 font-medium">You</p>
            <p className="text-sm text-[var(--text-primary)] italic">{transcript}</p>
          </div>
        )}

        {/* ── Tab bar ─────────────────────────────────── */}
        <div className="flex border-b border-[var(--border)] px-4 flex-shrink-0">
          {[
            { id: 'chat',     icon: MessageSquare, label: 'Conversation' },
            { id: 'insights', icon: CheckSquare,   label: 'Insights' },
          ].map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-b-2 -mb-px transition-colors ${
                activeTab === id
                  ? 'border-brand-500 text-brand-500'
                  : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>

        {/* ── Tab content ─────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-4 py-3" style={{ minHeight: 0 }}>
          {activeTab === 'chat' ? (
            <div className="flex flex-col gap-2">
              {conversationHistory.length === 0 && (
                <div className="text-center text-[var(--text-secondary)] text-sm py-8">
                  <p className="text-2xl mb-2">🎤</p>
                  <p>Start speaking — I'm listening</p>
                  {!hasSpeechSupport && (
                    <p className="text-xs mt-2 text-red-400 font-medium">
                      ⚠️ Voice recognition requires Chrome or Edge
                    </p>
                  )}
                  {hasSpeechSupport && !liveKitConfigured && (
                    <p className="text-xs mt-2 opacity-60">
                      Using browser voice — configure LiveKit for lower latency
                    </p>
                  )}
                </div>
              )}
              {conversationHistory.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[80%] px-3.5 py-2 rounded-2xl text-sm ${
                      msg.role === 'user'
                        ? 'bg-brand-500 text-white rounded-br-sm'
                        : 'bg-[var(--input-bg)] text-[var(--text-primary)] rounded-bl-sm'
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              ))}
              {isProcessing && (
                <div className="flex justify-start">
                  <div className="bg-[var(--input-bg)] px-4 py-2.5 rounded-2xl rounded-bl-sm flex gap-1.5">
                    {[0,1,2].map(i => (
                      <div key={i} className="w-2 h-2 rounded-full bg-brand-400"
                        style={{ animation: `bounce 1s infinite ${i*0.15}s` }} />
                    ))}
                  </div>
                </div>
              )}
              <div ref={chatBottomRef} />
            </div>
          ) : (
            <div className="flex flex-col gap-4 py-1">
              {/* Emotional tone */}
              <div>
                <p className="text-xs font-semibold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wide">Tone</p>
                <span className={`text-sm font-semibold capitalize ${TONE_COLOUR[ci.emotionalTone] || 'text-[var(--text-secondary)]'}`}>
                  {ci.emotionalTone}
                </span>
              </div>

              {/* Summary */}
              {ci.summary && (
                <div>
                  <p className="text-xs font-semibold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wide">Summary</p>
                  <p className="text-sm text-[var(--text-primary)]">{ci.summary}</p>
                </div>
              )}

              {/* Action Items */}
              {ci.actionItems.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wide">Action Items</p>
                  <div className="flex flex-col gap-1">
                    {ci.actionItems.map((item, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm text-[var(--text-primary)]">
                        <CheckSquare size={14} className="text-brand-500 mt-0.5 flex-shrink-0" />
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Key Topics */}
              {ci.keyTopics.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wide">Topics</p>
                  <div className="flex flex-wrap gap-1.5">
                    {ci.keyTopics.map((t, i) => (
                      <span key={i} className="px-2.5 py-1 rounded-full bg-[var(--input-bg)] text-xs text-[var(--text-primary)] border border-[var(--border)]">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {ci.actionItems.length === 0 && !ci.summary && (
                <p className="text-sm text-[var(--text-secondary)] text-center py-6">
                  Insights will appear as the conversation progresses
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Controls ─────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-[var(--border)] flex-shrink-0">
          <button
            onClick={ci.reset}
            className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors px-2 py-1 rounded-lg hover:bg-[var(--hover)]"
          >
            Clear
          </button>

          {/* Mute button */}
          <button
            onClick={handleMuteToggle}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-95 shadow-lg ${
              muted
                ? 'bg-red-500/20 border-2 border-red-500'
                : 'bg-brand-500 shadow-brand-500/30'
            }`}
          >
            {muted
              ? <MicOff size={24} className="text-red-400" />
              : <Mic    size={24} className="text-white" />
            }
          </button>

          {isSpeaking && (
            <button
              onClick={interrupt}
              className="text-xs text-brand-500 font-semibold px-2 py-1 rounded-lg hover:bg-brand-500/10 transition-colors"
            >
              Stop
            </button>
          )}
          {!isSpeaking && <div className="w-12" />}
        </div>
      </div>
    </div>
  );
}
