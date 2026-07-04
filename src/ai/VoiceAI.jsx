// ═══════════════════════════════════════════════════════════
//  VoiceAI — Voice interaction overlay.
//  Uses the EXISTING overlayAsk() pipeline — same as text overlay.
//  Auto-starts listening on open. Continuous conversation loop.
//
//  Bug fixed in this version: buildRecognition() was memoized with
//  an EMPTY dependency array, so its internal rec.onend callback
//  permanently captured the FIRST-render versions of handleAsk and
//  startRecognition. Every render after that created new versions
//  of those functions (since they depend on state), but the stale
//  closure inside the recognizer never saw them — causing the loop
//  to randomly break after one exchange. Fixed by routing all calls
//  through refs that are kept in sync on every render, so the
//  recognizer's callbacks always invoke the LATEST version.
// ═══════════════════════════════════════════════════════════
import { useEffect, useRef, useState, useCallback } from 'react';
import { X, Mic, MicOff, Sparkles } from 'lucide-react';
import useAIStore from './useAIStore';
import { overlayAsk } from './unifyService';
import { tryExecuteVoiceAction } from './voiceActions';
import { useAuth } from '../contexts/AuthContext';

function Waveform({ active }) {
  const bars = [3, 5, 8, 12, 16, 20, 16, 12, 8, 5, 3];
  return (
    <div className="flex items-center justify-center gap-1 h-10">
      {bars.map((h, i) => (
        <div key={i} className="rounded-full"
          style={{
            width: 3,
            height: active ? h * 2 : 4,
            background: active
              ? 'linear-gradient(to top, #4cd7f6, #d0bcff)'
              : 'rgba(255,255,255,0.2)',
            animation: active ? `wave-bar 0.8s ease-in-out ${i * 0.07}s infinite alternate` : 'none',
            transition: 'height 0.3s ease',
          }}/>
      ))}
    </div>
  );
}

function waitForVoices() {
  return new Promise(resolve => {
    const voices = window.speechSynthesis?.getVoices() || [];
    if (voices.length > 0) { resolve(voices); return; }
    const handler = () => resolve(window.speechSynthesis.getVoices());
    window.speechSynthesis.addEventListener('voiceschanged', handler, { once: true });
    setTimeout(() => { window.speechSynthesis.removeEventListener('voiceschanged', handler); resolve(window.speechSynthesis.getVoices()); }, 1500);
  });
}

export default function VoiceAI({ context }) {
  const { user } = useAuth();
  const {
    voiceAIOpen, closeVoiceAI,
    voiceTranscript, setVoiceTranscript,
    voiceResponse,  setVoiceResponse,
    voiceListening, setVoiceListening,
  } = useAIStore();

  const [phase,   setPhase]   = useState('idle');   // idle | listening | thinking | speaking
  const [error,   setError]   = useState(null);
  const [muted,   setMuted]   = useState(false);

  const recognitionRef  = useRef(null);
  const abortRef        = useRef(null);
  const transcriptRef   = useRef('');
  const isSpeakingRef   = useRef(false);
  const isProcessingRef = useRef(false);
  const isActiveRef     = useRef(false);
  const mutedRef        = useRef(false);
  const contextRef      = useRef(context);

  // Refs that always point to the LATEST function — read inside
  // the recognizer's event handlers, which are otherwise frozen
  // by useCallback's dependency array at creation time.
  const handleAskRef        = useRef(() => {});
  const startRecognitionRef = useRef(() => {});

  useEffect(() => { mutedRef.current = muted; }, [muted]);
  useEffect(() => { contextRef.current = context; }, [context]);

  // ── Speak AI response, then restart listening ───────────
  const speak = useCallback(async (text) => {
    if (!text?.trim() || !('speechSynthesis' in window)) return;
    isSpeakingRef.current = true;
    setPhase('speaking');

    window.speechSynthesis.cancel();
    const voices = await waitForVoices();
    const preferred = voices.find(v =>
      v.name.includes('Google UK English Female') ||
      v.name.includes('Google US English') ||
      v.name === 'Samantha' ||
      (v.lang.startsWith('en') && !v.name.includes('Male'))
    ) || null;

    return new Promise(resolve => {
      const utt   = new SpeechSynthesisUtterance(text.slice(0, 500));
      utt.rate    = 1.05;
      utt.pitch   = 1.0;
      utt.volume  = 1.0;
      if (preferred) utt.voice = preferred;

      const finishAndRestart = () => {
        isSpeakingRef.current = false;
        setPhase('idle');
        resolve();
        setTimeout(() => {
          if (isActiveRef.current && !mutedRef.current) startRecognitionRef.current();
        }, 400);
      };

      utt.onend   = finishAndRestart;
      utt.onerror = finishAndRestart;

      window.speechSynthesis.speak(utt);
    });
  }, []);

  // ── AI ask — uses the EXACT same pipeline as the text overlay ──
  const handleAsk = useCallback(async (question) => {
    if (!question?.trim()) { setPhase('idle'); return; }

    setPhase('thinking');
    isProcessingRef.current = true;
    setVoiceTranscript('');
    setVoiceResponse('');
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    // Check if this is a real actionable request (e.g. "add a task to...")
    // before falling through to plain conversation. This is what makes
    // Voice AI actually DO things instead of just talking about them.
    try {
      const action = await tryExecuteVoiceAction(question, user?.uid);
      if (action.handled) {
        setVoiceResponse(action.responseText);
        isProcessingRef.current = false;
        await speak(action.responseText);
        return;
      }
    } catch {
      // Action detection failed — fall through to normal conversation
    }

    await overlayAsk({
      question,
      context: contextRef.current || null,
      signal:  abortRef.current.signal,
      onProgress: () => {},
      onDone: async (full) => {
        if (!full?.trim()) {
          isProcessingRef.current = false;
          setError('No response — check your AI provider API key configuration.');
          setPhase('idle');
          setTimeout(() => { if (isActiveRef.current && !mutedRef.current) startRecognitionRef.current(); }, 800);
          return;
        }
        setVoiceResponse(full);
        isProcessingRef.current = false;
        await speak(full);
      },
      onError: (err) => {
        if (err?.name === 'AbortError') { isProcessingRef.current = false; return; }
        isProcessingRef.current = false;
        setError('AI request failed. Please try again.');
        setPhase('idle');
        setTimeout(() => { if (isActiveRef.current && !mutedRef.current) startRecognitionRef.current(); }, 1000);
      },
    });
  }, [speak, user?.uid]);

  // Keep refs in sync with the latest function instances on every render
  useEffect(() => { handleAskRef.current = handleAsk; }, [handleAsk]);

  // ── Build recogniser — only ever reads from refs, never stale ──
  const buildRecognition = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;
    const rec = new SR();
    rec.continuous     = false;
    rec.interimResults = true;
    rec.lang           = 'en-US';

    rec.onstart = () => {
      setPhase('listening');
      setVoiceListening(true);
      transcriptRef.current = '';
      setVoiceTranscript('');
    };

    rec.onresult = (e) => {
      const t = Array.from(e.results).map(r => r[0].transcript).join('');
      transcriptRef.current = t;
      setVoiceTranscript(t);
    };

    rec.onend = () => {
      setVoiceListening(false);
      const finalText = transcriptRef.current.trim();
      transcriptRef.current = '';

      if (!isActiveRef.current) return;

      if (finalText) {
        // Always calls the LATEST handleAsk — never a stale first-render version
        handleAskRef.current(finalText);
      } else {
        // No transcript captured — this fires routinely because
        // continuous=false makes the browser stop listening the instant
        // it detects a pause, often before the final onresult has landed
        // in transcriptRef. This is NOT the user going idle, it's an
        // automatic restart — so we deliberately do NOT setPhase('idle')
        // here. Flipping to idle (which renders "TAP TO SPEAK") for the
        // ~300ms restart window is exactly what caused the
        // listening -> tap to speak -> listening flicker.
        setTimeout(() => {
          if (isActiveRef.current && !isSpeakingRef.current) startRecognitionRef.current();
        }, 300);
      }
    };

    rec.onerror = (e) => {
      setVoiceListening(false);
      if (!isActiveRef.current || e.error === 'aborted') return;
      if (e.error === 'not-allowed') {
        setError('Microphone access denied. Allow mic in browser settings.');
        setPhase('idle');
        return;
      }
      // Recoverable error (e.g. "no-speech", "network") — silently retry
      // without flashing the idle/"tap to speak" state; same reasoning as
      // the empty-transcript branch above.
      setTimeout(() => {
        if (isActiveRef.current && !isSpeakingRef.current) startRecognitionRef.current();
      }, 500);
    };

    return rec;
  }, []);

  // ── Start recognition ───────────────────────────────────
  const startRecognition = useCallback(() => {
    if (mutedRef.current || isSpeakingRef.current || isProcessingRef.current || !isActiveRef.current) return;
    try {
      const rec = buildRecognition();
      if (!rec) {
        setError('Speech recognition not supported. Use Chrome or Edge.');
        return;
      }
      recognitionRef.current = rec;
      rec.start();
    } catch {
      // Already started — ignore
    }
  }, [buildRecognition]);

  useEffect(() => { startRecognitionRef.current = startRecognition; }, [startRecognition]);

  // ── Open/close lifecycle ────────────────────────────────
  useEffect(() => {
    if (!voiceAIOpen) {
      isActiveRef.current = false;
      try { recognitionRef.current?.abort(); } catch {}
      abortRef.current?.abort();
      window.speechSynthesis?.cancel();
      isSpeakingRef.current = false;
      isProcessingRef.current = false;
      setPhase('idle');
      setError(null);
      return;
    }

    isActiveRef.current = true;
    setPhase('idle');
    setError(null);
    setVoiceResponse('');
    setVoiceTranscript('');

    setTimeout(() => {
      if (isActiveRef.current) startRecognitionRef.current();
    }, 300);

    return () => {
      isActiveRef.current = false;
      try { recognitionRef.current?.abort(); } catch {}
      abortRef.current?.abort();
      window.speechSynthesis?.cancel();
    };
  }, [voiceAIOpen]);

  // ── Mute toggle ─────────────────────────────────────────
  const handleMuteToggle = () => {
    const next = !muted;
    setMuted(next);
    mutedRef.current = next;
    if (next) {
      try { recognitionRef.current?.abort(); } catch {}
      window.speechSynthesis?.cancel();
      isSpeakingRef.current = false;
      setPhase('idle');
    } else {
      setTimeout(() => { if (isActiveRef.current) startRecognitionRef.current(); }, 200);
    }
  };

  const handleClose = () => {
    isActiveRef.current = false;
    try { recognitionRef.current?.abort(); } catch {}
    abortRef.current?.abort();
    window.speechSynthesis?.cancel();
    isSpeakingRef.current = false;
    closeVoiceAI();
    setPhase('idle');
    setMuted(false);
    setError(null);
  };

  if (!voiceAIOpen) return null;

  const isListening = phase === 'listening';
  const isThinking  = phase === 'thinking';
  const isSpeaking  = phase === 'speaking';

  const statusText = muted ? 'MUTED'
    : isListening ? 'LISTENING'
    : isThinking  ? 'THINKING…'
    : isSpeaking  ? 'SPEAKING…'
    : 'TAP TO SPEAK';

  return (
    <div className="fixed inset-0 z-[500]"
      style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(20px)' }}>

      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full blur-[120px] opacity-20 transition-all duration-1000"
          style={{ background: isListening
            ? 'radial-gradient(circle, #4cd7f6, transparent)'
            : isThinking || isSpeaking
            ? 'radial-gradient(circle, #ffb0cd, transparent)'
            : 'radial-gradient(circle, #d0bcff, transparent)' }}/>
      </div>

      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 h-16 z-10">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full animate-pulse"
            style={{ background: isListening ? '#4cd7f6' : isSpeaking ? '#ffb0cd' : '#d0bcff' }}/>
          <span className="text-[11px] font-bold tracking-widest"
            style={{ color: isListening ? '#4cd7f6' : isSpeaking ? '#ffb0cd' : '#d0bcff', letterSpacing: '0.15em' }}>
            {statusText}
          </span>
        </div>
        <button onClick={handleClose}
          className="w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-90"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <X size={18} style={{ color: 'rgba(229,226,225,0.8)' }} />
        </button>
      </div>

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-8">
        <div className="relative flex items-center justify-center">
          {isListening && (
            <>
              <div className="absolute w-56 h-56 rounded-full border opacity-20 animate-ping"
                style={{ borderColor: '#4cd7f6', animationDuration: '2s' }}/>
              <div className="absolute w-72 h-72 rounded-full border opacity-10 animate-ping"
                style={{ borderColor: '#d0bcff', animationDuration: '3s' }}/>
            </>
          )}
          <button
            onClick={handleMuteToggle}
            className="relative w-44 h-44 rounded-full flex items-center justify-center transition-transform active:scale-95"
            style={{
              background: 'rgba(20,20,20,0.8)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,255,255,0.1)',
              boxShadow: isListening
                ? '0 0 60px rgba(76,215,246,0.4), inset 0 0 40px rgba(76,215,246,0.1)'
                : isThinking || isSpeaking
                ? '0 0 60px rgba(255,176,205,0.3), inset 0 0 40px rgba(255,176,205,0.05)'
                : '0 0 40px rgba(208,188,255,0.2), inset 0 0 30px rgba(208,188,255,0.05)',
            }}>
            <div className="absolute inset-4 rounded-full opacity-30"
              style={{
                background: 'conic-gradient(from 0deg, #d0bcff, #4cd7f6, #ffb0cd, #d0bcff)',
                animation: 'orb-spin 4s linear infinite',
                filter: 'blur(12px)',
              }}/>
            <div className="relative z-10 flex flex-col items-center gap-2">
              {muted
                ? <MicOff size={28} style={{ color: 'rgba(255,255,255,0.4)' }} />
                : isThinking || isSpeaking
                  ? <Sparkles size={28} style={{ color: '#ffb0cd' }} className="animate-pulse" />
                  : isListening
                  ? <Mic size={28} style={{ color: '#4cd7f6' }} />
                  : <Mic size={28} style={{ color: '#d0bcff' }} />}
              <Waveform active={isListening} />
            </div>
          </button>
        </div>

        {voiceTranscript ? (
          <div className="px-5 py-3 rounded-2xl text-center max-w-[80%]"
            style={{ background: 'rgba(32,31,31,0.7)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e2e1', fontSize: 15, lineHeight: 1.5 }}>
            {voiceTranscript}
          </div>
        ) : null}

        {voiceResponse && (
          <div className="px-6 max-w-sm mx-auto w-full">
            <div className="px-5 py-4 rounded-2xl"
              style={{ background: 'rgba(14,14,14,0.8)', backdropFilter: 'blur(24px)', border: '1px solid rgba(208,188,255,0.15)', boxShadow: '0 0 30px rgba(208,188,255,0.1)' }}>
              <div className="flex items-center gap-2 mb-2">
                <Sparkles size={12} style={{ color: '#d0bcff' }} />
                <span className="text-[10px] font-bold tracking-widest" style={{ color: '#d0bcff' }}>UNIFYAI</span>
              </div>
              <p className="text-[14px] leading-relaxed" style={{ color: '#e5e2e1' }}>{voiceResponse}</p>
            </div>
          </div>
        )}

        {error && <p className="text-[13px] px-6 text-center" style={{ color: '#ffb4ab' }}>{error}</p>}

        <p className="text-[11px]" style={{ color: 'rgba(203,195,215,0.35)' }}>
          {muted ? 'Tap orb to unmute' : isListening ? 'Speak now…' : isSpeaking ? 'AI is responding…' : 'Tap orb to mute / unmute'}
        </p>
      </div>

      <style>{`
        @keyframes orb-spin  { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes wave-bar  { from { transform: scaleY(0.4); } to { transform: scaleY(1.2); } }
      `}</style>
    </div>
  );
}
