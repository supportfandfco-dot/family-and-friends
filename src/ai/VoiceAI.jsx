// ═══════════════════════════════════════════════════════════
//  VoiceAI — Cinematic voice interaction overlay
//  Orb animation · Web Speech API · Streaming response
// ═══════════════════════════════════════════════════════════
import { useEffect, useRef, useState } from 'react';
import { X, Mic, MicOff, Sparkles } from 'lucide-react';
import useAIStore from './useAIStore';
import { overlayAsk } from './unifyService';

// ── Animated waveform bars ───────────────────────────────────
function Waveform({ active }) {
  const bars = [3, 5, 8, 12, 16, 20, 16, 12, 8, 5, 3];
  return (
    <div className="flex items-center justify-center gap-1 h-10">
      {bars.map((h, i) => (
        <div key={i} className="rounded-full transition-all"
          style={{
            width: 3,
            height: active ? h * 2 : 4,
            background: active
              ? `linear-gradient(to top, #4cd7f6, #d0bcff)`
              : 'rgba(255,255,255,0.2)',
            animation: active ? `wave-bar 0.8s ease-in-out ${i * 0.07}s infinite alternate` : 'none',
            transition: 'height 0.3s ease',
          }}/>
      ))}
    </div>
  );
}

// ── Floating transcript ──────────────────────────────────────
function TranscriptBubble({ text }) {
  if (!text) return null;
  return (
    <div className="px-5 py-3 rounded-2xl text-center animate-fade-in max-w-[80%]"
      style={{
        background: 'rgba(32,31,31,0.7)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.08)',
        color: '#e5e2e1',
        fontSize: 15,
        fontFamily: 'Geist, system-ui',
        lineHeight: '1.5',
      }}>
      {text}
    </div>
  );
}

export default function VoiceAI({ context }) {
  const {
    voiceAIOpen, closeVoiceAI,
    voiceTranscript, setVoiceTranscript,
    voiceResponse, setVoiceResponse,
    voiceListening, setVoiceListening,
  } = useAIStore();

  const [phase, setPhase] = useState('idle'); // idle | listening | thinking | responding
  const [error, setError] = useState(null);
  const recognitionRef = useRef(null);
  const abortRef = useRef(null);
  const streamTextRef = useRef('');

  // Setup Web Speech API
  useEffect(() => {
    if (!voiceAIOpen) return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('Speech recognition not supported in this browser.');
      return;
    }
    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = 'en-US';

    rec.onstart = () => { setPhase('listening'); setVoiceListening(true); };
    rec.onresult = (e) => {
      const transcript = Array.from(e.results).map(r => r[0].transcript).join('');
      setVoiceTranscript(transcript);
    };
    rec.onend = () => {
      setVoiceListening(false);
      if (streamTextRef.current === '' && voiceTranscript) {
        handleAsk(voiceTranscript);
      }
    };
    rec.onerror = (e) => {
      setVoiceListening(false);
      setPhase('idle');
      if (e.error !== 'no-speech') setError(`Mic error: ${e.error}`);
    };
    recognitionRef.current = rec;

    return () => {
      rec.abort();
      recognitionRef.current = null;
    };
  }, [voiceAIOpen]);

  const startListening = () => {
    if (!recognitionRef.current) return;
    setVoiceTranscript('');
    setVoiceResponse('');
    streamTextRef.current = '';
    setError(null);
    try { recognitionRef.current.start(); } catch {}
  };

  const stopListening = () => {
    try { recognitionRef.current?.stop(); } catch {}
  };

  const handleAsk = async (question) => {
    if (!question?.trim()) return;
    setPhase('thinking');
    streamTextRef.current = '';
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      setPhase('responding');
      await overlayAsk({
        question,
        context: null,
        signal: abortRef.current.signal,
        onChunk: (_, full) => {
          streamTextRef.current = full;
          setVoiceResponse(full);
        },
        onDone: (full) => {
          setVoiceResponse(full);
          streamTextRef.current = full;
          setPhase('idle');
          // Speak response if supported
          if ('speechSynthesis' in window && full) {
            const utter = new SpeechSynthesisUtterance(full.slice(0, 300));
            utter.rate = 1.05;
            utter.pitch = 1;
            window.speechSynthesis.speak(utter);
          }
        },
        onError: () => { setPhase('idle'); },
      });
    } catch {
      setPhase('idle');
    }
  };

  const handleClose = () => {
    recognitionRef.current?.abort();
    abortRef.current?.abort();
    window.speechSynthesis?.cancel();
    closeVoiceAI();
    setPhase('idle');
  };

  if (!voiceAIOpen) return null;

  const isActive = phase === 'listening';
  const isThinking = phase === 'thinking' || phase === 'responding';

  return (
    <>
      <div className="fixed inset-0 z-[500]" style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(20px)' }}>
        {/* Cinematic background glows */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full blur-[120px] opacity-20 transition-all duration-1000"
            style={{ background: isActive ? 'radial-gradient(circle, #4cd7f6, transparent)' : isThinking ? 'radial-gradient(circle, #ffb0cd, transparent)' : 'radial-gradient(circle, #d0bcff, transparent)' }}/>
        </div>

        {/* Header */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 h-16 z-10">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#4cd7f6' }}/>
            <span className="text-[11px] font-bold tracking-widest" style={{ color: '#4cd7f6', fontFamily: 'Geist, system-ui', letterSpacing: '0.15em' }}>
              {isActive ? 'LISTENING' : isThinking ? 'THINKING' : 'VOICE AI'}
            </span>
          </div>
          <button onClick={handleClose}
            className="w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-90"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <X size={18} style={{ color: 'rgba(229,226,225,0.8)' }}/>
          </button>
        </div>

        {/* Main orb area */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-8">
          {/* Orb */}
          <div className="relative flex items-center justify-center">
            {/* Outer pulse rings */}
            {isActive && (
              <>
                <div className="absolute w-56 h-56 rounded-full border opacity-20 animate-ping"
                  style={{ borderColor: '#4cd7f6', animationDuration: '2s' }}/>
                <div className="absolute w-72 h-72 rounded-full border opacity-10 animate-ping"
                  style={{ borderColor: '#d0bcff', animationDuration: '3s' }}/>
              </>
            )}
            {/* Core orb */}
            <button
              onClick={isActive ? stopListening : startListening}
              disabled={isThinking}
              className="relative w-44 h-44 rounded-full flex items-center justify-center transition-transform active:scale-95"
              style={{
                background: 'rgba(20,20,20,0.8)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(255,255,255,0.1)',
                boxShadow: isActive
                  ? '0 0 60px rgba(76,215,246,0.4), inset 0 0 40px rgba(76,215,246,0.1)'
                  : isThinking
                  ? '0 0 60px rgba(255,176,205,0.3), inset 0 0 40px rgba(255,176,205,0.05)'
                  : '0 0 40px rgba(208,188,255,0.2), inset 0 0 30px rgba(208,188,255,0.05)',
              }}>
              {/* Rotating gradient inside */}
              <div className="absolute inset-4 rounded-full opacity-30"
                style={{
                  background: 'conic-gradient(from 0deg, #d0bcff, #4cd7f6, #ffb0cd, #d0bcff)',
                  animation: 'orb-spin 4s linear infinite',
                  filter: 'blur(12px)',
                }}/>
              <div className="relative z-10 flex flex-col items-center gap-2">
                {isThinking
                  ? <Sparkles size={28} style={{ color: '#ffb0cd' }} className="animate-pulse"/>
                  : isActive
                  ? <MicOff size={28} style={{ color: '#4cd7f6' }}/>
                  : <Mic size={28} style={{ color: '#d0bcff' }}/>}
                <Waveform active={isActive}/>
              </div>
            </button>
          </div>

          {/* Transcript */}
          <TranscriptBubble text={voiceTranscript}/>

          {/* AI Response */}
          {voiceResponse && (
            <div className="px-6 max-w-sm mx-auto">
              <div className="px-5 py-4 rounded-2xl"
                style={{
                  background: 'rgba(14,14,14,0.8)',
                  backdropFilter: 'blur(24px)',
                  border: '1px solid rgba(208,188,255,0.15)',
                  boxShadow: '0 0 30px rgba(208,188,255,0.1)',
                }}>
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles size={12} style={{ color: '#d0bcff' }}/>
                  <span className="text-[10px] font-bold tracking-widest" style={{ color: '#d0bcff', fontFamily: 'Geist, system-ui' }}>UNIFYAI</span>
                </div>
                <p className="text-[14px] leading-relaxed" style={{ color: '#e5e2e1', fontFamily: 'Geist, system-ui' }}>
                  {voiceResponse}
                  {isThinking && (
                    <span className="inline-block w-0.5 h-3.5 ml-0.5 align-middle animate-pulse"
                      style={{ background: '#d0bcff', borderRadius: 1 }}/>
                  )}
                </p>
              </div>
            </div>
          )}

          {error && (
            <p className="text-[13px] px-6 text-center" style={{ color: '#ffb4ab', fontFamily: 'Geist, system-ui' }}>{error}</p>
          )}

          {/* Hint */}
          {phase === 'idle' && !voiceTranscript && !voiceResponse && (
            <p className="text-[13px]" style={{ color: 'rgba(203,195,215,0.4)', fontFamily: 'Geist, system-ui' }}>
              Tap the orb to speak
            </p>
          )}
        </div>

        <style>{`
          @keyframes orb-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          @keyframes wave-bar {
            from { transform: scaleY(0.4); }
            to   { transform: scaleY(1.2); }
          }
        `}</style>
      </div>
    </>
  );
}
