// ═══════════════════════════════════════════════════════════
//  UnifyAIChatBar — Instant local replies + AI enhancement
//  Layer 1 shows instantly, Layer 2 upgrades silently
// ═══════════════════════════════════════════════════════════
import { useEffect, useState, useRef } from 'react';
import { Sparkles, RefreshCw, Mic, Zap } from 'lucide-react';
import { generateLocalReplies } from './localIntelligence.js';
import { suggestReplies } from './unifyService';
import useAIStore from './useAIStore';

export default function UnifyAIChatBar({ messages, myName, onReply, onOpenOverlay, onOpenVoice, context }) {
  const { smartReplies, smartRepliesLoading, setSmartReplies, setSmartRepliesLoading, clearSmartReplies } = useAIStore();
  const [enhanced, setEnhanced] = useState(false);
  const loadRef = useRef(false);

  useEffect(() => {
    if (!messages?.length) return;
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.isOwn) return;

    // Layer 1 — show local replies instantly (no delay, no API)
    const localReplies = generateLocalReplies(messages);
    setSmartReplies(localReplies);
    setEnhanced(false);

    // Layer 2 — upgrade with AI after a short delay
    const timer = setTimeout(async () => {
      if (loadRef.current) return;
      loadRef.current = true;
      setSmartRepliesLoading(true);
      try {
        const aiReplies = await suggestReplies(
          messages.map(m => ({ ...m, senderName: m.isOwn ? myName : (m.senderName || 'Them') })),
          myName
        );
        if (aiReplies.length > 0) {
          setSmartReplies(aiReplies);
          setEnhanced(true);
        }
      } catch {
        // Keep local replies — no error shown
      } finally {
        setSmartRepliesLoading(false);
        loadRef.current = false;
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [messages?.length]);

  useEffect(() => {
    clearSmartReplies();
    setEnhanced(false);
    loadRef.current = false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context?.chatId, context?.groupId]);

  const handleRefresh = async () => {
    if (loadRef.current || !messages?.length) return;
    loadRef.current = true;
    setSmartRepliesLoading(true);
    try {
      const replies = await suggestReplies(
        messages.map(m => ({ ...m, senderName: m.isOwn ? myName : (m.senderName || 'Them') })),
        myName
      );
      if (replies.length > 0) { setSmartReplies(replies); setEnhanced(true); }
    } catch {
      setSmartReplies(generateLocalReplies(messages));
    } finally {
      setSmartRepliesLoading(false);
      loadRef.current = false;
    }
  };

  return (
    <div className="px-3 py-2 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {/* Ask UnifyAI button */}
        <button onClick={onOpenOverlay}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all active:scale-95 flex-shrink-0"
          style={{
            background: 'linear-gradient(135deg, rgba(99,14,212,0.12), rgba(0,103,128,0.08))',
            border: '1px solid rgba(99,14,212,0.25)',
          }}>
          <Sparkles size={12} style={{ color: '#630ed4' }}/>
          <span className="text-[11px] font-bold" style={{ color: '#630ed4', fontFamily: 'Geist,system-ui' }}>
            Ask UnifyAI
          </span>
        </button>

        {onOpenVoice && (
          <button onClick={onOpenVoice}
            className="w-7 h-7 rounded-full flex items-center justify-center transition-all active:scale-90 flex-shrink-0"
            style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }}>
            <Mic size={12} style={{ color: '#22c55e' }}/>
          </button>
        )}

        {/* Smart reply chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto flex-1" style={{ scrollbarWidth: 'none' }}>
          {smartRepliesLoading && smartReplies.length === 0 ? (
            [60, 80, 50].map((w, i) => (
              <div key={i} className="h-7 rounded-full flex-shrink-0 animate-pulse"
                style={{ width: w, background: 'var(--hover)' }}/>
            ))
          ) : (
            smartReplies.map((r, i) => (
              <button key={i} onClick={() => onReply?.(r)}
                className="flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] transition-all active:scale-95"
                style={{
                  background: 'var(--hover)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                  fontFamily: 'Geist,system-ui',
                  whiteSpace: 'nowrap',
                }}>
                {r}
              </button>
            ))
          )}
          {smartReplies.length > 0 && (
            <button onClick={handleRefresh}
              className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all active:scale-90"
              style={{ background: 'var(--hover)', border: '1px solid var(--border)' }}>
              {enhanced
                ? <Zap size={11} style={{ color: '#630ed4' }}/>
                : <RefreshCw size={11} style={{ color: 'var(--text-secondary)' }}/>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
