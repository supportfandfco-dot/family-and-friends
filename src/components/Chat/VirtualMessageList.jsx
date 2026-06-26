// ═══════════════════════════════════════════════════════
//  VirtualMessageList — High-performance virtualized list
//  Renders only visible messages. Handles 50k+ messages.
// ═══════════════════════════════════════════════════════
import { useRef, useEffect, useCallback, useState, memo } from 'react';
import useVirtualMessages from '../../hooks/useVirtualMessages';
import MessageBubble from './MessageBubble';

// Date separator row
const DateSeparator = memo(function DateSeparator({ label }) {
  return (
    <div className="flex justify-center my-2 pointer-events-none">
      <span className="text-[11px] text-[var(--text-secondary)] bg-[var(--sidebar-bg)]/80 backdrop-blur-sm px-3 py-1 rounded-full border border-[var(--border)]/50">
        {label}
      </span>
    </div>
  );
});

// Auto-measure wrapper — reports actual height back to virtualizer
const MeasuredRow = memo(function MeasuredRow({ id, onMeasure, children }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([entry]) => {
      onMeasure(id, Math.ceil(entry.contentRect.height));
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [id, onMeasure]);

  return <div ref={ref}>{children}</div>;
});

export default function VirtualMessageList({
  messages,
  user,
  chatPartner,
  selectedMsgs,
  selectionMode,
  searchMode,
  searchQuery,
  searchCurrentMsg,
  partnerTyping,
  onLongPress,
  onReaction,
  onSelect,
  onImageClick,
  onSwipeReply,
  enterSelectionMode,
  toggleMsgSelect,
}) {
  const containerRef = useRef(null);
  const bottomRef    = useRef(null);
  const prevCountRef = useRef(0);

  const {
    rows,
    visibleRows,
    offsets,
    totalHeight,
    startIdx,
    measureRow,
  } = useVirtualMessages(messages, containerRef);

  // Scroll to bottom only when a NEW message arrives and user is near bottom
  useEffect(() => {
    const newCount = messages.length;
    if (newCount > prevCountRef.current) {
      const el = containerRef.current;
      const nearBottom = !el || (el.scrollHeight - el.scrollTop - el.clientHeight < 200);
      if (nearBottom) {
        requestAnimationFrame(() => {
          bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        });
      }
    }
    prevCountRef.current = newCount;
  }, [messages.length]);

  // Jump to search result
  useEffect(() => {
    if (!searchCurrentMsg?.id) return;
    const idx = rows.findIndex(r => r.id === searchCurrentMsg.id);
    if (idx === -1 || !containerRef.current) return;
    // We'll scroll to bring the target row into center view
    // The offset is approximate — good enough for search jump
    const el = containerRef.current;
    const targetScrollTop = (offsets[idx] || 0) - el.clientHeight / 2 + 40;
    el.scrollTo({ top: Math.max(0, targetScrollTop), behavior: 'smooth' });
  }, [searchCurrentMsg?.id]);

  const handleSelect = useCallback((msg) => {
    if (selectionMode) toggleMsgSelect(msg);
    else enterSelectionMode(msg);
  }, [selectionMode, toggleMsgSelect, enterSelectionMode]);

  // Stable handler references to prevent child rerenders
  const stableOnLongPress  = useCallback(onLongPress,  []);
  const stableOnReaction   = useCallback(onReaction,   []);
  const stableOnImageClick = useCallback(onImageClick, []);
  const stableOnSwipeReply = useCallback(onSwipeReply, []);

  // Track whether user is near bottom to show jump button
  const [showJumpBtn, setShowJumpBtn] = useState(false);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    setShowJumpBtn(!atBottom);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const jumpToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  return (
    <div className="flex-1 relative overflow-hidden flex flex-col">
    {/* Jump to bottom button */}
    {showJumpBtn && (
      <button
        onClick={jumpToBottom}
        className="absolute bottom-4 right-4 z-20 w-10 h-10 rounded-full bg-[var(--sidebar-bg)] border border-[var(--border)] shadow-lg flex items-center justify-center hover:bg-[var(--hover)] transition-all active:scale-95"
        style={{ transform: 'translateZ(0)' }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text-secondary)]">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
    )}
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto px-4"
      style={{ scrollbarWidth: 'thin', WebkitOverflowScrolling: 'touch' }}
    >
      {/* Total height spacer — gives scrollbar correct size */}
      <div style={{ height: totalHeight, position: 'relative' }}>
        {/* Padding top for the visible block */}
        <div style={{ position: 'absolute', top: offsets[startIdx] || 0, left: 0, right: 0 }}>
          {visibleRows.map((row, i) => {
            const rowIdx = startIdx + i;
            const isSearchMatch = searchMode && searchQuery.trim().length > 1
              && row.type === 'msg'
              && (row.msg?.content || '').toLowerCase().includes(searchQuery.toLowerCase());
            const isCurrentResult = row.id === searchCurrentMsg?.id;

            if (row.type === 'date') {
              return (
                <MeasuredRow key={row.id} id={row.id} onMeasure={measureRow}>
                  <DateSeparator label={row.label} />
                </MeasuredRow>
              );
            }

            return (
              <MeasuredRow key={row.id} id={row.id} onMeasure={measureRow}>
                <div
                  className={isCurrentResult
                    ? 'ring-2 ring-brand-400 ring-offset-2 ring-offset-[var(--chat-bg)] rounded-2xl transition-all'
                    : isSearchMatch
                      ? 'bg-brand-500/10 rounded-2xl'
                      : ''}
                >
                  <MessageBubble
                    msg={row.msg}
                    isOwn={row.msg.senderId === user.uid}
                    selected={selectedMsgs.some(m => m.id === row.msg.id)}
                    selectionMode={selectionMode}
                    onSelect={handleSelect}
                    onLongPress={stableOnLongPress}
                    onReaction={stableOnReaction}
                    onSwipeReply={stableOnSwipeReply}
                    onImageClick={stableOnImageClick}
                    chatPartner={chatPartner}
                  />
                </div>
              </MeasuredRow>
            );
          })}

          {/* Typing indicator — always at end */}
          {partnerTyping && (
            <div className="flex justify-start mb-1">
              <div className="bg-[var(--input-bg)] rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5">
                {[0, 1, 2].map(i => (
                  <div
                    key={i}
                    className="w-2 h-2 rounded-full bg-brand-400"
                    style={{ animation: `bounce 1s infinite ${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Scroll anchor */}
          <div ref={bottomRef} style={{ height: 12 }} />
        </div>
      </div>
    </div>
    </div>
  );
}
