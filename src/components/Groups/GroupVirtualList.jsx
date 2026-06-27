// ═══════════════════════════════════════════════════════
//  GroupVirtualList — Virtualized group message list
// ═══════════════════════════════════════════════════════
import { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import { GroupMsgBubble } from './GroupMsgBubble';

function estimateHeight(msg) {
  if (!msg || msg.type === 'system') return 36;
  if (msg.type === 'image')  return 290;
  if (msg.type === 'voice')  return 90;
  if (msg.type === 'file')   return 90;
  const len = msg.content?.length || 0;
  const senderLine = 18; // sender name line in groups
  if (len < 40)  return senderLine + (msg.replyTo ? 110 : 60);
  if (len < 120) return senderLine + (msg.replyTo ? 130 : 80);
  if (len < 300) return senderLine + (msg.replyTo ? 160 : 110);
  return senderLine + (msg.replyTo ? 200 : 150);
}

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

const OVERSCAN = 5;
const DATE_H   = 40;

const DateSep = memo(({ label }) => (
  <div className="flex justify-center my-2">
    <span className="text-[11px] text-[var(--text-secondary)] bg-[var(--sidebar-bg)]/80 backdrop-blur-sm px-3 py-1 rounded-full border border-[var(--border)]/50">
      {label}
    </span>
  </div>
));

const MeasuredRow = memo(({ id, onMeasure, children }) => {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => onMeasure(id, Math.ceil(e.contentRect.height)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [id, onMeasure]);
  return <div ref={ref}>{children}</div>;
});

export default function GroupVirtualList({
  messages, user, group, memberProfiles,
  selectedMsgs, selectionMode, typingLabel, bottomRef,
  onLongPress, onReaction, onSelect, onImageClick,
  enterSelectionMode, toggleMsgSelect,
}) {
  const containerRef = useRef(null);
  const heightCache  = useRef(new Map());
  const rafRef       = useRef(null);
  const prevCount    = useRef(0);
  const [scrollTop,  setScrollTop]  = useState(0);
  const [clientH,    setClientH]    = useState(600);
  const [showJump,   setShowJump]   = useState(false);

  // Build rows with date separators
  const rows = useMemo(() => {
    const result = [];
    messages.forEach((msg, i) => {
      if (i === 0 || !isSameDay(messages[i - 1], msg)) {
        result.push({ type: 'date', id: `date-${msg.id}`, label: getDateLabel(msg) });
      }
      result.push({ type: 'msg', id: msg.id, msg });
    });
    return result;
  }, [messages]);

  // Cumulative offsets
  const { offsets, totalHeight } = useMemo(() => {
    let off = 0;
    const offsets = [];
    for (const row of rows) {
      offsets.push(off);
      off += row.type === 'date' ? DATE_H : (heightCache.current.get(row.id) ?? estimateHeight(row.msg));
    }
    return { offsets, totalHeight: off };
  }, [rows]);

  const handleScroll = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const el = containerRef.current;
      if (!el) return;
      setScrollTop(el.scrollTop);
      setShowJump(el.scrollHeight - el.scrollTop - el.clientHeight > 150);
    });
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setClientH(e.contentRect.height));
    ro.observe(el);
    el.addEventListener('scroll', handleScroll, { passive: true });
    setClientH(el.clientHeight);
    return () => { ro.disconnect(); el.removeEventListener('scroll', handleScroll); if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [handleScroll]);

  // Scroll: instant jump to bottom on first load; smooth for new messages
  const initialDone = useRef(false);
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
      const near = !el || (el.scrollHeight - el.scrollTop - el.clientHeight < 200);
      if (near) requestAnimationFrame(() => bottomRef?.current?.scrollIntoView({ behavior: 'smooth' }));
    }
    prevCount.current = n;
  }, [messages.length]);

  const { startIdx, endIdx } = useMemo(() => {
    if (!offsets.length) return { startIdx: 0, endIdx: 0 };
    const vs = scrollTop, ve = scrollTop + clientH;
    let lo = 0, hi = offsets.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (offsets[m] < vs) lo = m + 1; else hi = m; }
    const start = Math.max(0, lo - OVERSCAN);
    let end = lo;
    while (end < rows.length && offsets[end] < ve) end++;
    return { startIdx: start, endIdx: Math.min(rows.length - 1, end + OVERSCAN) };
  }, [scrollTop, clientH, offsets, rows.length]);

  const measureRow = useCallback((id, h) => {
    if (heightCache.current.get(id) === h) return;
    heightCache.current.set(id, h);
    setScrollTop(t => t); // trigger re-layout
  }, []);

  const visibleRows = useMemo(() => rows.slice(startIdx, endIdx + 1), [rows, startIdx, endIdx]);

  return (
    <div className="flex-1 relative flex flex-col" style={{ minHeight: 0 }}>
      {showJump && (
        <button
          onClick={() => bottomRef?.current?.scrollIntoView({ behavior: 'smooth' })}
          className="absolute bottom-4 right-4 z-20 w-10 h-10 rounded-full bg-[var(--sidebar-bg)] border border-[var(--border)] shadow-lg flex items-center justify-center hover:bg-[var(--hover)] transition-all active:scale-95"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text-secondary)]">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
      )}
      <div ref={containerRef} className="flex-1 overflow-y-auto px-4" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}>
        <div style={{ height: totalHeight, position: 'relative' }}>
          <div style={{ position: 'absolute', top: offsets[startIdx] || 0, left: 0, right: 0 }}>
            {visibleRows.map((row, i) => {
              if (row.type === 'date') return (
                <MeasuredRow key={row.id} id={row.id} onMeasure={measureRow}>
                  <DateSep label={row.label} />
                </MeasuredRow>
              );
              return (
                <MeasuredRow key={row.id} id={row.id} onMeasure={measureRow}>
                  <GroupMsgBubble
                    msg={row.msg}
                    isOwn={row.msg.senderId === user.uid}
                    sender={memberProfiles[row.msg.senderId]}
                    isAdmin={row.msg.senderId === group.adminId}
                    selected={selectedMsgs.some(m => m.id === row.msg.id)}
                    selectionMode={selectionMode}
                    onSelect={onSelect}
                    onLongPress={onLongPress}
                    onReaction={onReaction}
                    onImageClick={onImageClick}
                  />
                </MeasuredRow>
              );
            })}
            {typingLabel && (
              <div className="flex justify-start mb-1">
                <div className="bg-[var(--input-bg)] rounded-2xl rounded-bl-sm px-4 py-2 flex items-center gap-2">
                  <div className="flex gap-1">{[0,1,2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-brand-400" style={{ animation: `bounce 1s infinite ${i * 0.15}s` }}/>)}</div>
                  <span className="text-xs text-[var(--text-secondary)]">{typingLabel}</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} style={{ height: 12 }} />
          </div>
        </div>
      </div>
    </div>
  );
}
