// ═══════════════════════════════════════════════════════
//  useAIVoicePipeline — Streaming voice ↔ AI pipeline.
//  Fully debugged and instrumented.
//
//  Confirmed bugs fixed in this version:
//  1. enhance() returns {text, source} — was treating as string
//  2. onspeechend + onend race — isProcessingRef not set before onend fires
//  3. continuous:true + onspeechend doesn't reliably fire on all browsers
//  4. VAD barge-in used stale isSpeaking state (not ref)
//  5. speak() isSpeakingRef.current never cleared on resolve path
//  6. TTS voices not loaded yet on first call (async onvoiceschanged)
// ═══════════════════════════════════════════════════════
import { useState, useRef, useCallback, useEffect } from 'react';
import { enhance } from '../ai/unifyService';

// ── Direct Groq fallback for AI Voice ──────────────────────────
// Used when the /api/groq proxy isn't available (local dev, etc.)
// Falls back gracefully — never blocks the voice session.
async function callGroqDirect(prompt, systemPrompt, signal) {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY;
  if (!apiKey) return null;

  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    signal,
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model:      'llama-3.1-8b-instant',
      max_tokens: 150,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: prompt },
      ],
    }),
  });

  if (!resp.ok) return null;
  const data = await resp.json();
  return data?.choices?.[0]?.message?.content?.trim() || null;
}

// Structured logger — kept for debugging, no-op in production if needed
const log = (stage, msg, data) => {
  if (import.meta.env.DEV) {
    const style = 'color:#7c3aed;font-weight:bold';
    if (data !== undefined) console.info(`%c[VOICE:${stage}]`, style, msg, data);
    else                    console.info(`%c[VOICE:${stage}]`, style, msg);
  }
};

// ── Load TTS voices (async — must wait for onvoiceschanged) ──
function getVoices() {
  return new Promise(resolve => {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) { resolve(voices); return; }
    window.speechSynthesis.onvoiceschanged = () => resolve(window.speechSynthesis.getVoices());
    // Timeout fallback — some browsers never fire onvoiceschanged
    setTimeout(() => resolve(window.speechSynthesis.getVoices()), 1000);
  });
}

// Pick the best available TTS voice
async function pickVoice() {
  const voices = await getVoices();
  log('TTS', `${voices.length} voices available`, voices.map(v => v.name));
  return (
    voices.find(v => v.name === 'Samantha') ||
    voices.find(v => v.name.includes('Google UK English Female')) ||
    voices.find(v => v.name.includes('Google US English')) ||
    voices.find(v => v.lang === 'en-US' && !v.localService === false) ||
    voices.find(v => v.lang.startsWith('en')) ||
    null
  );
}

export default function useAIVoicePipeline({ uid, profile, onTranscript, onAIResponse }) {
  const [isListening,   setIsListening]   = useState(false);
  const [isProcessing,  setIsProcessing]  = useState(false);
  const [isSpeaking,    setIsSpeaking]    = useState(false);
  const [transcript,    setTranscript]    = useState('');
  const [aiText,        setAiText]        = useState('');
  const [conversationHistory, setHistory] = useState([]);

  // Refs — immune to stale closures
  const recognitionRef  = useRef(null);
  const vadCleanupRef   = useRef(null);
  const abortRef        = useRef(null);
  const interruptedRef  = useRef(false);
  const historyRef      = useRef([]);
  const isListeningRef  = useRef(false);
  const isProcessingRef = useRef(false);
  const isSpeakingRef   = useRef(false);
  const preferredVoiceRef = useRef(null);
  // Pending text accumulates across multiple onresult events
  const pendingTextRef  = useRef('');

  // Pre-load voices on mount
  useEffect(() => {
    pickVoice().then(v => {
      preferredVoiceRef.current = v;
      log('TTS', 'Voice pre-loaded', v?.name || 'default');
    });
  }, []);

  // ── Interrupt AI speech ──────────────────────────────
  const interrupt = useCallback(() => {
    log('INTERRUPT', 'Barge-in — cancelling TTS + AI request');
    interruptedRef.current = true;
    window.speechSynthesis.cancel();
    abortRef.current?.abort();
    isSpeakingRef.current   = false;
    isProcessingRef.current = false;
    setIsSpeaking(false);
    setIsProcessing(false);
  }, []);

  // ── Speak AI response ────────────────────────────────
  const speak = useCallback((text) => {
    return new Promise((resolve) => {
      if (!text?.trim()) { resolve(); return; }

      window.speechSynthesis.cancel();
      interruptedRef.current = false;
      isSpeakingRef.current  = true;
      setIsSpeaking(true);
      log('TTS', 'Starting speech', text.slice(0, 80));

      // Split into sentences for streaming feel
      const sentences = text.match(/[^.!?]+[.!?]*/g)?.filter(s => s.trim()) || [text];
      let idx = 0;

      const speakNext = () => {
        if (idx >= sentences.length || interruptedRef.current) {
          isSpeakingRef.current = false;
          setIsSpeaking(false);
          log('TTS', idx >= sentences.length ? 'Finished speaking' : 'Interrupted');
          resolve();
          return;
        }

        const sentence = sentences[idx++].trim();
        if (!sentence) { speakNext(); return; }

        const utt    = new SpeechSynthesisUtterance(sentence);
        utt.rate     = 1.0;
        utt.pitch    = 1.0;
        utt.volume   = 1.0;
        utt.lang     = 'en-US';

        if (preferredVoiceRef.current) utt.voice = preferredVoiceRef.current;

        utt.onstart = () => log('TTS', `Speaking sentence ${idx}/${sentences.length}`, sentence.slice(0, 50));
        utt.onend   = speakNext;
        utt.onerror = (e) => {
          log('TTS', 'Utterance error', e.error);
          // Don't block on TTS error — continue to next sentence
          speakNext();
        };

        window.speechSynthesis.speak(utt);
      };

      speakNext();
    });
  }, []);

  // ── Route text to Multi-AI Router ───────────────────
  const routeToAIWithContext = useCallback(async (userText) => {
    const text = userText?.trim();
    if (!text) { log('AI', 'Empty transcript — skipping'); return; }

    log('AI', 'Received transcript', text);
    isProcessingRef.current = true;
    setIsProcessing(true);
    setTranscript('');

    // Build context from history
    const historyLines = historyRef.current
      .map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.text}`)
      .join('\n');

    const prompt = historyLines
      ? `${historyLines}\nUser: ${text}`
      : text;

    const systemPrompt = `You are a helpful, conversational AI voice assistant in the Family & Friends messaging app. Be warm, concise, and natural. Respond in 1-3 sentences max unless the user asks for more. The user's name is ${profile?.name || 'there'}.`;

    abortRef.current = new AbortController();
    log('AI', 'Calling AI', { promptLen: prompt.length });

    let aiResponse = '';
    try {
      // Try the proxy-based enhance() first
      const result = await enhance(prompt, systemPrompt, null, abortRef.current.signal);
      log('AI', 'enhance() raw result', result);

      if (abortRef.current.signal.aborted) {
        log('AI', 'Aborted after response');
        isProcessingRef.current = false;
        setIsProcessing(false);
        return;
      }

      // enhance() returns { text, source } — extract the string
      if (typeof result === 'string') {
        aiResponse = result;
      } else if (result?.text) {
        aiResponse = result.text;
      }

      log('AI', 'enhance() response', { text: aiResponse?.slice(0, 80), source: result?.source });

      // If proxy returned empty (not configured, or /api/groq not available in dev),
      // try calling Groq directly with VITE_GROQ_API_KEY
      if (!aiResponse?.trim() && !abortRef.current.signal.aborted) {
        log('AI', 'Proxy returned empty — trying direct Groq call');
        const direct = await callGroqDirect(prompt, systemPrompt, abortRef.current.signal);
        if (direct) {
          aiResponse = direct;
          log('AI', 'Direct Groq response', aiResponse.slice(0, 80));
        }
      }

      if (!aiResponse?.trim()) {
        log('AI', 'All AI providers returned empty — check API keys');
        aiResponse = "I couldn't reach the AI right now. Please check your API configuration.";
      }

      setAiText(aiResponse);
      onAIResponse?.(aiResponse);

      // Update history
      const newHistory = [
        ...historyRef.current.slice(-20),
        { role: 'user', text },
        { role: 'ai',   text: aiResponse },
      ];
      historyRef.current = newHistory;
      setHistory(newHistory);

    } catch (err) {
      log('AI', 'Error', err.name + ': ' + err.message);
      if (err.name === 'AbortError') {
        isProcessingRef.current = false;
        setIsProcessing(false);
        return;
      }
      aiResponse = "I'm having trouble right now. Please try again.";
      setAiText(aiResponse);
    }

    isProcessingRef.current = false;
    setIsProcessing(false);

    // Speak the response
    if (aiResponse && !abortRef.current?.signal.aborted) {
      await speak(aiResponse);
    }

    // Restart recognition after AI finishes speaking
    log('STT', 'Restarting recognition after AI response');
    if (isListeningRef.current && !abortRef.current?.signal.aborted) {
      pendingTextRef.current = '';
      try { recognitionRef.current?.start(); }
      catch (e) { log('STT', 'Restart error (already running?)', e.message); }
    }
  }, [profile, speak, onAIResponse]);

  // ── Start listening ──────────────────────────────────
  const startListening = useCallback(async (micStream) => {
    log('STT', 'Building recogniser');
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      log('STT', 'SpeechRecognition NOT SUPPORTED in this browser');
      return;
    }

    const recognition = new SR();
    // KEY: Use continuous=false — far more reliable cross-browser.
    // We restart it manually after each utterance.
    recognition.continuous      = false;
    recognition.interimResults  = true;
    recognition.lang            = 'en-US';
    recognition.maxAlternatives = 1;

    recognitionRef.current = recognition;
    pendingTextRef.current = '';

    recognition.onstart = () => log('STT', 'Recognition started — listening');

    recognition.onaudiostart = () => log('STT', 'Audio capture started');

    recognition.onspeechstart = () => log('STT', 'Speech detected');

    recognition.onresult = (e) => {
      let interimText = '';
      let finalText   = '';

      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText   += t;
        else                       interimText += t;
      }

      const displayText = (pendingTextRef.current + finalText + interimText).trim();
      log('STT', 'Result', { final: finalText, interim: interimText, display: displayText });
      setTranscript(displayText);
      onTranscript?.(displayText);

      if (finalText) pendingTextRef.current += finalText;
    };

    recognition.onspeechend = () => log('STT', 'Speech ended — waiting for onend');

    recognition.onaudioend = () => log('STT', 'Audio capture ended');

    recognition.onend = () => {
      const captured = pendingTextRef.current.trim();
      log('STT', 'Recognition ended', { captured, isListening: isListeningRef.current, isProcessing: isProcessingRef.current });
      pendingTextRef.current = '';

      if (!isListeningRef.current) {
        log('STT', 'Not listening anymore — stop');
        return;
      }

      if (captured) {
        log('STT', 'Sending to AI', captured);
        // isProcessingRef set inside routeToAIWithContext before it returns
        routeToAIWithContext(captured);
        // Don't restart here — routeToAIWithContext restarts after TTS finishes
      } else {
        // No speech captured — restart immediately to keep listening
        log('STT', 'No speech — restarting');
        if (!isProcessingRef.current && !isSpeakingRef.current) {
          try { recognition.start(); }
          catch (e) { log('STT', 'Restart error', e.message); }
        }
      }
    };

    recognition.onerror = (e) => {
      log('STT', 'Error', e.error);
      if (e.error === 'aborted' || !isListeningRef.current) return;
      if (e.error === 'not-allowed') {
        log('STT', 'MICROPHONE PERMISSION DENIED');
        return;
      }
      // no-speech, network, audio-capture etc — restart after brief delay
      if (!isProcessingRef.current && !isSpeakingRef.current) {
        setTimeout(() => {
          if (isListeningRef.current) {
            log('STT', 'Restarting after error');
            try { recognition.start(); } catch {}
          }
        }, 300);
      }
    };

    // VAD — barge-in support
    if (micStream) {
      vadCleanupRef.current = (() => {
        try {
          const ctx     = new AudioContext();
          const source  = ctx.createMediaStreamSource(micStream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          source.connect(analyser);
          const buf = new Uint8Array(analyser.frequencyBinCount);
          let rafId;
          const tick = () => {
            analyser.getByteFrequencyData(buf);
            const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
            // Barge-in: if AI is speaking and user makes noise, interrupt
            if (avg > 15 && isSpeakingRef.current) {
              log('VAD', 'Barge-in detected — interrupting AI');
              interrupt();
              setTimeout(() => {
                if (isListeningRef.current && !isProcessingRef.current) {
                  log('STT', 'Restarting after barge-in');
                  try { recognition.start(); } catch {}
                }
              }, 200);
            }
            rafId = requestAnimationFrame(tick);
          };
          tick();
          return () => {
            cancelAnimationFrame(rafId);
            try { source.disconnect(); ctx.close(); } catch {}
          };
        } catch (e) {
          log('VAD', 'AudioContext failed', e.message);
          return () => {};
        }
      })();
    }

    log('STT', 'Starting recognition');
    recognition.start();
    isListeningRef.current = true;
    setIsListening(true);
  }, [buildRecogniser, routeToAIWithContext, interrupt, onTranscript]);

  // buildRecogniser no longer needed — inlined above
  const buildRecogniser = useCallback(() => null, []);

  // ── Stop listening ───────────────────────────────────
  const stopListening = useCallback(() => {
    log('STT', 'Stopping');
    interrupt();
    vadCleanupRef.current?.();
    vadCleanupRef.current = null;
    isListeningRef.current  = false;
    isProcessingRef.current = false;
    isSpeakingRef.current   = false;
    try { recognitionRef.current?.abort(); } catch {}
    recognitionRef.current = null;
    pendingTextRef.current  = '';
    setIsListening(false);
    setTranscript('');
    setAiText('');
    setHistory([]);
    historyRef.current = [];
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
    clearHistory: () => { historyRef.current = []; setHistory([]); },
  };
}
