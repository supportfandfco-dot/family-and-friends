// ═══════════════════════════════════════════════════════
//  AIMeetingAssistant — LiveKit-powered AI participant
//  that joins existing meetings (via existing WebRTC)
//  and provides: transcription, action item extraction,
//  live summary, follow-up generation.
//  Never interferes with meeting participants.
// ═══════════════════════════════════════════════════════
import { useState, useRef, useCallback, useEffect } from 'react';
import { Brain, Mic, X, FileText, CheckSquare } from 'lucide-react';
import useConversationIntelligenceLive from './useConversationIntelligenceLive';
import { askFast } from '../ai/groqClient';

export default function AIMeetingAssistant({ meetingCode, participants = [], onClose }) {
  const [transcript,   setTranscript]   = useState([]);
  const [isActive,     setIsActive]     = useState(false);
  const [activeTab,    setActiveTab]    = useState('transcript');
  const [followUps,    setFollowUps]    = useState([]);
  const recognitionRef = useRef(null);
  const ci = useConversationIntelligenceLive();

  // ── Build recogniser for ambient transcription ───────
  const startTranscription = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    const r = new SR();
    r.continuous     = true;
    r.interimResults = true;
    r.lang           = 'en-US';
    recognitionRef.current = r;

    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const text = e.results[i][0].transcript.trim();
        if (!text) continue;
        const isFinal = e.results[i].isFinal;
        if (isFinal) {
          setTranscript(prev => [...prev, {
            text,
            ts: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            id: Date.now(),
          }]);
          ci.feedTurn('user', text);
        }
      }
    };

    r.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      setTimeout(() => { try { r.start(); } catch {} }, 1500);
    };

    r.onend = () => {
      if (isActive) { try { r.start(); } catch {} }
    };

    r.start();
    setIsActive(true);
  }, [isActive, ci]);

  const stopTranscription = useCallback(() => {
    try { recognitionRef.current?.abort(); } catch {}
    recognitionRef.current = null;
    setIsActive(false);
  }, []);

  // ── Generate follow-ups from conversation ────────────
  const generateFollowUps = useCallback(async () => {
    if (transcript.length < 3) return;
    const text = transcript.map(t => t.text).join(' ');
    try {
      const raw = await askFast(
        `Based on this meeting transcript, generate 3-5 specific follow-up action items:\n${text}\n\nReturn only a JSON array of strings.`,
        'Return only a valid JSON array of strings, no markdown.'
      );
      const items = JSON.parse(raw.trim());
      if (Array.isArray(items)) setFollowUps(items);
    } catch {}
  }, [transcript]);

  useEffect(() => () => stopTranscription(), []);

  return (
    <div className="flex flex-col h-full bg-[var(--sidebar-bg)] rounded-2xl border border-[var(--border)] overflow-hidden" style={{ minWidth: 280, maxWidth: 320 }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center">
            <Brain size={14} className="text-white" />
          </div>
          <div>
            <p className="text-xs font-bold text-[var(--text-primary)]">AI Assistant</p>
            <p className={`text-[10px] ${isActive ? 'text-green-400' : 'text-[var(--text-secondary)]'}`}>
              {isActive ? '● Recording' : '○ Standby'}
            </p>
          </div>
        </div>
        <button onClick={onClose} className="w-6 h-6 rounded-lg hover:bg-[var(--hover)] flex items-center justify-center">
          <X size={13} className="text-[var(--text-secondary)]" />
        </button>
      </div>

      {/* Start/stop */}
      <div className="px-4 py-2 flex gap-2 flex-shrink-0">
        {!isActive ? (
          <button
            onClick={startTranscription}
            className="flex-1 py-2 rounded-xl bg-brand-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5"
          >
            <Mic size={13} /> Start Recording
          </button>
        ) : (
          <>
            <button
              onClick={stopTranscription}
              className="flex-1 py-2 rounded-xl bg-red-500/15 text-red-400 text-xs font-semibold"
            >
              Stop
            </button>
            <button
              onClick={generateFollowUps}
              className="flex-1 py-2 rounded-xl bg-[var(--input-bg)] text-[var(--text-primary)] text-xs font-semibold"
            >
              Follow-ups
            </button>
          </>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--border)] px-4 flex-shrink-0">
        {[
          { id: 'transcript', icon: FileText,   label: 'Transcript' },
          { id: 'insights',   icon: CheckSquare, label: 'Insights' },
        ].map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-1 px-2 py-2 text-[10px] font-semibold border-b-2 -mb-px ${
              activeTab === id ? 'border-brand-500 text-brand-500' : 'border-transparent text-[var(--text-secondary)]'
            }`}
          >
            <Icon size={11} /> {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-3 py-2" style={{ minHeight: 0 }}>
        {activeTab === 'transcript' ? (
          transcript.length === 0 ? (
            <p className="text-[11px] text-[var(--text-secondary)] text-center py-6">
              {isActive ? 'Listening for speech…' : 'Start recording to transcribe'}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {transcript.map(t => (
                <div key={t.id} className="flex gap-2">
                  <span className="text-[10px] text-[var(--text-secondary)] flex-shrink-0 mt-0.5">{t.ts}</span>
                  <p className="text-xs text-[var(--text-primary)] leading-relaxed">{t.text}</p>
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="flex flex-col gap-3 py-1">
            {ci.summary && (
              <div>
                <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wide mb-1">Summary</p>
                <p className="text-xs text-[var(--text-primary)]">{ci.summary}</p>
              </div>
            )}
            {ci.actionItems.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wide mb-1">Actions</p>
                {ci.actionItems.map((item, i) => (
                  <div key={i} className="flex items-start gap-1.5 mb-1">
                    <CheckSquare size={11} className="text-brand-500 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-[var(--text-primary)]">{item}</p>
                  </div>
                ))}
              </div>
            )}
            {followUps.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wide mb-1">Follow-ups</p>
                {followUps.map((item, i) => (
                  <div key={i} className="flex items-start gap-1.5 mb-1">
                    <span className="text-[10px] text-brand-400 font-bold flex-shrink-0">{i+1}.</span>
                    <p className="text-xs text-[var(--text-primary)]">{item}</p>
                  </div>
                ))}
              </div>
            )}
            {!ci.summary && ci.actionItems.length === 0 && (
              <p className="text-[11px] text-[var(--text-secondary)] text-center py-4">
                Insights appear as conversation grows
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
