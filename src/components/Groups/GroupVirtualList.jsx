// ═══════════════════════════════════════════════════════
//  GroupVirtualList — Stable, crash-free group message list
// ═══════════════════════════════════════════════════════
import { useRef, useEffect, useState, useCallback, memo } from 'react';
import { GroupMsgBubble } from './GroupMsgBubble';

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

export default function GroupVirtualList({
  messages = [],
  user,
  group,
  memberProfiles = {},
  selectedMsgs = [],
  selectionMode,
  typingLabel,
  bottomRef: externalBottomRef,
  onLongPress,
  onReaction,
  onSelect,
  onImageClick,
  enterSelectionMode,
  toggleMsgSelect,
}) {
  const containerRef   = useRef(null);
  const internalBottom = useRef(null);
  const bottomRef = externalBottomRef || internalBottom;
  const prevCount      = useRef(0);
  const initialDone    = useRef(false);
  const [showJump, setShowJump] = useState(false);

  useEffect(() => {
    const n = messages.length;
    if (n === 0) return;
    if (!initialDone.current) {
      initialDone.current = true;
      requestAnimationFrame(() => {
        const el = containerRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      });
    } else if (n > prevCount.current) {
      const el = containerRef.current;
      const near = !el || (el.scrollHeight - el.scrollTop - el.clientHeight < 250);
      if (near) requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }));
    }
    prevCount.current = n;
  }, [messages.length]);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    setShowJump(el.scrollHeight - el.scrollTop - el.clientHeight > 150);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const uid = user?.uid;

  return (
    <div className="flex-1 relative flex flex-col" style={{ minHeight: 0 }}>
      {showJump && (
        <button
          onClick={() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' })}
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
        {messages.map((msg, i) => {
          if (!msg?.id) return null;
          const showDate = i === 0 || !isSameDay(messages[i - 1], msg);
          const dateLabel = showDate ? getDateLabel(msg) : null;
          return (
            <div key={msg.id}>
              {dateLabel && <DateSeparator label={dateLabel} />}
              <GroupMsgBubble
                msg={msg}
                isOwn={msg.senderId === uid}
                sender={memberProfiles[msg.senderId]}
                isAdmin={msg.senderId === group?.adminId}
                selected={selectedMsgs.some(m => m.id === msg.id)}
                selectionMode={selectionMode}
                onSelect={onSelect}
                onLongPress={onLongPress}
                onReaction={onReaction}
                onImageClick={onImageClick}
              />
            </div>
          );
        })}

        {typingLabel && (
          <div className="flex justify-start mb-2">
            <div className="bg-[var(--input-bg)] rounded-2xl rounded-bl-sm px-4 py-2 flex items-center gap-2">
              <div className="flex gap-1">
                {[0,1,2].map(i => (
                  <div key={i} className="w-2 h-2 rounded-full bg-brand-400"
                    style={{ animation: `bounce 1s infinite ${i * 0.15}s` }} />
                ))}
              </div>
              <span className="text-xs text-[var(--text-secondary)]">{typingLabel}</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} style={{ height: 4 }} />
      </div>
    </div>
  );
}
