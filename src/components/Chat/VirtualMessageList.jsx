// ═══════════════════════════════════════════════════════
//  VirtualMessageList — Stable, crash-free message list
//  Simple implementation without virtualization complexity
//  to eliminate crashes. Performance optimization later.
// ═══════════════════════════════════════════════════════
import { useRef, useEffect, useState, useCallback, memo } from 'react';
import MessageBubble from './MessageBubble';

// Date separator
const DateSeparator = memo(function DateSeparator({ label }) {
  return (
    <div className="flex justify-center my-3 pointer-events-none">
      <span className="text-[11px] text-[var(--text-secondary)] bg-[var(--sidebar-bg)]/80 backdrop-blur-sm px-3 py-1 rounded-full border border-[var(--border)]/50 select-none">
        {label}
      </span>
    </div>
  );
});

function isSameDay(a, b) {
  if (!a?.timestamp || !b?.timestamp) return true;
  const da = a.timestamp.toDate?.() || new Date(a.timestamp);
  const db = b.timestamp.toDate?.() || new Date(b.timestamp);
  return da.toDateString() === db.toDateString();
}

function getDateLabel(msg) {
  if (!msg?.timestamp) return null;
  const d = msg.timestamp.toDate?.() || new Date(msg.timestamp);
  const now = new Date();
  const diff = Math.floor((now - d) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

export default function VirtualMessageList({
  messages = [],
  user,
  chatPartner,
  selectedMsgs = [],
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
  onLoadOlder,
  loadingOlder,
  hasMore,
}) {
  const containerRef    = useRef(null);
  const bottomRef       = useRef(null);
  const prevCountRef    = useRef(0);
  const initialDoneRef  = useRef(false);
  const [showJump, setShowJump] = useState(false);

  // Scroll to bottom on first load; smart-scroll for new messages
  useEffect(() => {
    const n = messages.length;
    if (n === 0) return;

    if (!initialDoneRef.current) {
      initialDoneRef.current = true;
      requestAnimationFrame(() => {
        const el = containerRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      });
    } else if (n > prevCountRef.current) {
      const el = containerRef.current;
      const nearBottom = !el || (el.scrollHeight - el.scrollTop - el.clientHeight < 250);
      if (nearBottom) {
        requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }));
      }
    }
    prevCountRef.current = n;
  }, [messages.length]);

  // Jump to search result
  useEffect(() => {
    if (!searchCurrentMsg?.id) return;
    const el = document.getElementById(`msg-${searchCurrentMsg.id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [searchCurrentMsg?.id]);

  // Jump-to-bottom button visibility
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    setShowJump(!atBottom);
    // Load older messages when near top
    if (el.scrollTop < 80 && !loadingOlder && hasMore && onLoadOlder) {
      onLoadOlder();
    }
  }, [loadingOlder, hasMore, onLoadOlder]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const jumpToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const uid = user?.uid;

  return (
    <div className="flex-1 relative flex flex-col" style={{ minHeight: 0 }}>
      {/* Jump to bottom */}
      {showJump && (
        <button
          onClick={jumpToBottom}
          className="absolute bottom-4 right-4 z-20 w-10 h-10 rounded-full bg-[var(--sidebar-bg)] border border-[var(--border)] shadow-lg flex items-center justify-center hover:bg-[var(--hover)] transition-colors active:scale-95"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text-secondary)]">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
      )}

      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto px-4 pt-3 pb-2"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}
      >
        {/* Load older indicator */}
        {loadingOlder && (
          <div className="flex justify-center py-3">
            <div className="w-5 h-5 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
          </div>
        )}
        {!hasMore && messages.length > 30 && (
          <p className="text-center text-[11px] text-[var(--text-secondary)] py-2 select-none">
            Beginning of conversation
          </p>
        )}

        {/* Messages with date separators */}
        {messages.map((msg, i) => {
          if (!msg?.id) return null;

          const showDate = i === 0 || !isSameDay(messages[i - 1], msg);
          const dateLabel = showDate ? getDateLabel(msg) : null;

          const isSearchMatch = searchMode && searchQuery?.trim().length > 1 &&
            (msg.content || '').toLowerCase().includes(searchQuery.toLowerCase());
          const isCurrentResult = searchCurrentMsg?.id === msg.id;

          return (
            <div key={msg.id} id={`msg-${msg.id}`}>
              {dateLabel && <DateSeparator label={dateLabel} />}
              <div className={isCurrentResult ? 'ring-2 ring-brand-400 ring-offset-1 ring-offset-transparent rounded-2xl' : isSearchMatch ? 'bg-brand-500/8 rounded-2xl' : ''}>
                <MessageBubble
                  msg={msg}
                  isOwn={msg.senderId === uid}
                  selected={selectedMsgs.some(m => m.id === msg.id)}
                  selectionMode={selectionMode}
                  onSelect={onSelect}
                  onLongPress={onLongPress}
                  onReaction={onReaction}
                  onSwipeReply={onSwipeReply}
                  onImageClick={onImageClick}
                  chatPartner={chatPartner}
                />
              </div>
            </div>
          );
        })}

        {/* Typing indicator */}
        {partnerTyping && (
          <div className="flex justify-start mb-2">
            <div className="bg-[var(--input-bg)] rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-2 h-2 rounded-full bg-brand-400"
                  style={{ animation: `bounce 1s infinite ${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} style={{ height: 4 }} />
      </div>
    </div>
  );
}
