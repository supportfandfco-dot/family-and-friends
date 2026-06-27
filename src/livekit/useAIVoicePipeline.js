// ═══════════════════════════════════════════════════════
//  useAIVoicePipeline — Streaming voice ↔ AI pipeline.
//
//  Flow:
//    Microphone → LiveKit Room → Web Speech STT →
//    Multi-AI Router → Groq/Gemini/Claude synthesis →
//    Web Speech TTS → Speaker
//
//  The existing AI router remains the intelligence layer.
//  LiveKit only provides the low-latency audio transport.
// ═══════════════════════════════════════════════════════
import { useState, useRef, useCallback, useEffect } from 'react';
import { enhance } from '../ai/unifyService';
// localIntelligence is used indirectly via CI hook

// ── Voice Activity Detection ─────────────────────────
// Detects when user starts/stops speaking via AudioContext
function createVAD(stream, { onSpeechStart, onSpeechEnd, silenceMs = 800 } = {}) {
  const ctx     = new AudioContext();
  const source  = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  source.connect(analyser);

  const buffer   = new Uint8Array(analyser.frequencyBinCount);
  let   speaking = false;
  let   silenceTimer = null;
  let   rafId    = null;

  const tick = () => {
    analyser.getByteFrequencyData(buffer);
    const avg = buffer.reduce((a, b) => a + b, 0) / buffer.length;
    const loud = avg > 12; // threshold — tune for noise floor

    if (loud && !speaking) {
      speaking = true;
      clearTimeout(silenceTimer);
      onSpeechStart?.();
    } else if (!loud && speaking) {
      clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => {
        speaking = false;
        onSpeechEnd?.();
      }, silenceMs);
    }
    rafId = requestAnimationFrame(tick);
  };

  tick();
  return () => {
    cancelAnimationFrame(rafId);
    clearTimeout(silenceTimer);
    try { source.disconnect(); ctx.close(); } catch {}
  };
}

export default function useAIVoicePipeline({ uid, profile, onTranscript, onAIResponse, onInsight }) {
  const [isListening,   setIsListening]   = useState(false);
  const [isProcessing,  setIsProcessing]  = useState(false);
  const [isSpeaking,    setIsSpeaking]    = useState(false);
  const [transcript,    setTranscript]    = useState('');
  const [aiText,        setAiText]        = useState('');
  const [conversationHistory, setHistory] = useState([]);

  const recognitionRef  = useRef(null);
  const vadCleanupRef   = useRef(null);
  const abortRef        = useRef(null);
  const streamRef       = useRef(null);
  const utteranceRef    = useRef(null);
  const interruptedRef  = useRef(false);

  // ── Build Web Speech recogniser ──────────────────────
  const buildRecogniser = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;
    const r = new SR();
    r.continuous      = true;
    r.interimResults  = true;
    r.lang            = 'en-US';
    r.maxAlternatives = 1;
    return r;
  }, []);

  // ── Interrupt AI speech ──────────────────────────────
  const interrupt = useCallback(() => {
    interruptedRef.current = true;
    window.speechSynthesis.cancel();
    abortRef.current?.abort();
    setIsSpeaking(false);
    setIsProcessing(false);
  }, []);

  // ── Speak AI response via streaming TTS ─────────────
  const speak = useCallback((text) => {
    return new Promise((resolve) => {
      window.speechSynthesis.cancel();
      interruptedRef.current = false;
      setIsSpeaking(true);

      // Chunk into sentences for streaming feel
      const sentences = text.match(/[^.!?]+[.!?]*/g) || [text];
      let idx = 0;

      const speakNext = () => {
        if (idx >= sentences.length || interruptedRef.current) {
          setIsSpeaking(false);
          resolve();
          return;
        }
        const utt = new SpeechSynthesisUtterance(sentences[idx++].trim());
        utt.rate   = 1.05;
        utt.pitch  = 1.0;
        utt.volume = 1.0;

        // Prefer a natural voice if available
        const voices = window.speechSynthesis.getVoices();
        const preferred = voices.find(v =>
          v.name.toLowerCase().includes('samantha') ||
          v.name.toLowerCase().includes('karen')    ||
          v.name.toLowerCase().includes('google')
        );
        if (preferred) utt.voice = preferred;

        utt.onend = speakNext;
        utt.onerror = () => { setIsSpeaking(false); resolve(); };
        utteranceRef.current = utt;
        window.speechSynthesis.speak(utt);
      };

      speakNext();
    });
  }, []);

  // ── Route text to Multi-AI Router ───────────────────
  const routeToAIWithContext = useCallback(async (userText) => {
    if (!userText.trim()) return;
    setIsProcessing(true);

    // Build conversation context for the AI router
    const history = conversationHistory.map(m =>
      `${m.role === 'user' ? 'User' : 'AI'}: ${m.text}`
    ).join('\n');

    const context = history
      ? `Previous conversation:\n${history}\n\nUser: ${userText}`
      : userText;

    // Create abort controller so user can interrupt mid-generation
    abortRef.current = new AbortController();

    let aiResponse = '';
    try {
      const systemPrompt = `You are a helpful AI voice assistant integrated into Family & Friends, a messaging app. Be conversational, concise, and warm. Keep responses under 3 sentences unless asked for more detail. The user's name is ${profile?.name || 'there'}.`;
      aiResponse = await enhance(context, systemPrompt, null, abortRef.current.signal);

      if (!aiResponse || abortRef.current.signal.aborted) {
        setIsProcessing(false);
        return;
      }

      setAiText(aiResponse);
      onAIResponse?.(aiResponse);

      // Update conversation history
      setHistory(prev => [
        ...prev.slice(-20), // keep last 20 turns
        { role: 'user', text: userText },
        { role: 'ai',   text: aiResponse },
      ]);

      // Conversation Intelligence runs via onTranscript/onAIResponse callbacks

    } catch (err) {
      if (err.name !== 'AbortError') {
        aiResponse = "I'm having trouble connecting right now. Please try again.";
        setAiText(aiResponse);
      }
    }

    setIsProcessing(false);

    // Speak the response
    if (aiResponse && !abortRef.current?.signal.aborted) {
      await speak(aiResponse);
    }

    // Resume listening after AI finishes speaking
    if (!abortRef.current?.signal.aborted) {
      recognitionRef.current?.start();
    }
  }, [conversationHistory, profile, speak, onAIResponse, onInsight]);

  // ── Start listening ──────────────────────────────────
  const startListening = useCallback(async (micStream) => {
    const recognition = buildRecogniser();
    if (!recognition) return;
    recognitionRef.current = recognition;

    let pendingText = '';

    recognition.onresult = (e) => {
      let interim = '';
      let final   = '';
      for (const res of e.results) {
        if (res.isFinal) final   += res[0].transcript;
        else             interim += res[0].transcript;
      }
      const full = (pendingText + final + interim).trim();
      setTranscript(full);
      onTranscript?.(full);
      if (final) pendingText = pendingText + final;
    };

    recognition.onspeechend = () => {
      recognition.stop();
      const text = pendingText.trim();
      pendingText = '';
      setTranscript('');
      if (text) routeToAIWithContext(text);
    };

    recognition.onerror = (e) => {
      if (e.error === 'no-speech') { recognition.start(); return; }
      if (e.error === 'aborted')   return;
      // Auto-restart on recoverable errors
      setTimeout(() => { try { recognition.start(); } catch {} }, 1000);
    };

    recognition.onend = () => {
      // Restart unless we're processing or user stopped
      if (isListening && !isProcessing && !isSpeaking) {
        try { recognition.start(); } catch {}
      }
    };

    // Voice Activity Detection on the mic stream for instant speech detection
    if (micStream) {
      vadCleanupRef.current = createVAD(micStream, {
        onSpeechStart: () => {
          // Interrupt AI if it's currently speaking (barge-in)
          if (isSpeaking) interrupt();
        },
      });
    }

    recognition.start();
    setIsListening(true);
  }, [buildRecogniser, routeToAIWithContext, interrupt, isListening, isProcessing, isSpeaking, onTranscript]);

  // ── Stop listening ───────────────────────────────────
  const stopListening = useCallback(() => {
    interrupt();
    vadCleanupRef.current?.();
    vadCleanupRef.current = null;
    try { recognitionRef.current?.abort(); } catch {}
    recognitionRef.current = null;
    setIsListening(false);
    setTranscript('');
    setAiText('');
    setHistory([]);
  }, [interrupt]);

  // ── Cleanup on unmount ───────────────────────────────
  useEffect(() => () => {
    vadCleanupRef.current?.();
    try { recognitionRef.current?.abort(); } catch {}
    abortRef.current?.abort();
    window.speechSynthesis.cancel();
  }, []);

  return {
    isListening,
    isProcessing,
    isSpeaking,
    transcript,
    aiText,
    conversationHistory,
    startListening,
    stopListening,
    interrupt,
    clearHistory: () => setHistory([]),
  };
}
