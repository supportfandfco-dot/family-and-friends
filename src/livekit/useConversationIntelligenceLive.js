// ═══════════════════════════════════════════════════════
//  useConversationIntelligenceLive — Real-time CI during
//  AI Voice sessions. Extracts action items, decisions,
//  tasks, deadlines, key topics + emotional tone live.
//  Non-blocking — runs in background, never blocks speech.
// ═══════════════════════════════════════════════════════
import { useState, useRef, useCallback, useEffect } from 'react';
import { askFast } from '../ai/groqClient';

const ANALYSIS_DEBOUNCE_MS = 4000; // analyse every 4s of new conversation
const MAX_HISTORY_FOR_CI   = 10;   // last 10 turns fed to CI

export default function useConversationIntelligenceLive() {
  const [actionItems,  setActionItems]  = useState([]);
  const [decisions,    setDecisions]    = useState([]);
  const [keyTopics,    setKeyTopics]    = useState([]);
  const [emotionalTone, setTone]        = useState('neutral');
  const [summary,      setSummary]      = useState('');
  const [isAnalysing,  setIsAnalysing]  = useState(false);

  const timerRef    = useRef(null);
  const pendingRef  = useRef([]); // turns queued for analysis

  // ── Feed new turns into the CI engine ───────────────
  const feedTurn = useCallback((role, text) => {
    pendingRef.current.push({ role, text, ts: Date.now() });

    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      const turns = pendingRef.current.slice(-MAX_HISTORY_FOR_CI);
      if (turns.length < 2) return; // need at least one exchange
      pendingRef.current = [];

      setIsAnalysing(true);
      const transcript = turns
        .map(t => `${t.role === 'user' ? 'User' : 'AI'}: ${t.text}`)
        .join('\n');

      const prompt = `Analyse this voice conversation excerpt and respond ONLY with valid JSON:
${transcript}

Return exactly this shape (no markdown, no explanation):
{
  "actionItems": ["..."],
  "decisions": ["..."],
  "keyTopics": ["..."],
  "emotionalTone": "positive|neutral|concerned|excited|frustrated",
  "summary": "one sentence"
}`;

      try {
        const raw = await askFast(prompt, 'You are a conversation intelligence engine. Return only valid JSON.');
        const data = JSON.parse(raw.trim());
        if (Array.isArray(data.actionItems)) setActionItems(prev => [...new Set([...prev, ...data.actionItems])]);
        if (Array.isArray(data.decisions))   setDecisions(prev  => [...new Set([...prev, ...data.decisions])]);
        if (Array.isArray(data.keyTopics))   setKeyTopics(data.keyTopics);
        if (data.emotionalTone)              setTone(data.emotionalTone);
        if (data.summary)                    setSummary(data.summary);
      } catch {
        // CI is non-critical — never crash voice session
      } finally {
        setIsAnalysing(false);
      }
    }, ANALYSIS_DEBOUNCE_MS);
  }, []);

  const reset = useCallback(() => {
    clearTimeout(timerRef.current);
    pendingRef.current = [];
    setActionItems([]);
    setDecisions([]);
    setKeyTopics([]);
    setTone('neutral');
    setSummary('');
  }, []);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return {
    actionItems,
    decisions,
    keyTopics,
    emotionalTone,
    summary,
    isAnalysing,
    feedTurn,
    reset,
  };
}
