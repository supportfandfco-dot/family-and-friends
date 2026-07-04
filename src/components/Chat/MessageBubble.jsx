// ═══════════════════════════════════════════════════════
//  MessageBubble — Isolated, memoized message component
//  Never rerenders unless its own data changes.
// ═══════════════════════════════════════════════════════
import { useState, useRef, useEffect, memo } from 'react';
import { Check, CheckCheck, Trash2, Share2, Edit3, FileText, ZoomIn } from 'lucide-react';
import { VoiceMessage } from './VoiceNote';
import { formatMsgTime } from '../../utils/timestamp';

const QUICK_REACTIONS = ['❤️','😂','😮','😢','😡','👍','👎','🙏'];

// Read appearance settings once per app session, not once per bubble
const getChatAppearance = (() => {
  let cache = null;
  return () => {
    if (cache) return cache;
    try { cache = JSON.parse(localStorage.getItem('ff_chat_settings')) || {}; }
    catch { cache = {}; }
    return cache;
  };
})();

function getBubbleRadius(own, shape) {
  if (shape === 'pill')      return '999px';
  if (shape === 'ios')       return '22px';
  if (shape === 'brutalist') return '4px';
  return own ? '18px 18px 4px 18px' : '18px 18px 18px 4px';
}

function getTimestamp(msg) {
  return formatMsgTime(msg.timestamp);
}

// ── LazyImage — only loads when in viewport ─────────────
function LazyImage({ src, alt, onClick }) {
  const [loaded, setLoaded] = useState(false);
  const [inView, setInView] = useState(false);
  const nodeRef = useRef(null);

  // useEffect with proper cleanup — no leaked observers
  useEffect(() => {
    const node = nodeRef.current;
    if (!node) return;
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setInView(true); io.disconnect(); } },
      { rootMargin: '300px' }
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={nodeRef}
      className="relative group cursor-pointer"
      onClick={onClick}
      style={{ minHeight: loaded ? 'auto' : '120px', minWidth: '120px' }}
    >
      {inView && (
        <img
          src={src}
          alt={alt || 'image'}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          className="rounded-xl block transition-opacity duration-200"
          style={{
            maxWidth: 220,
            maxHeight: 220,
            objectFit: 'cover',
            opacity: loaded ? 1 : 0,
            display: 'block',
          }}
        />
      )}
      {!loaded && (
        <div
          className="rounded-xl bg-[var(--input-bg)] animate-pulse"
          style={{ width: 180, height: 120 }}
        />
      )}
      {loaded && (
        <div className="absolute inset-0 rounded-xl bg-black/0 group-hover:bg-black/15 transition-opacity flex items-center justify-center">
          <ZoomIn size={22} className="text-white opacity-0 group-hover:opacity-100 drop-shadow-lg transition-[opacity,transform] scale-75 group-hover:scale-100" />
        </div>
      )}
    </div>
  );
}

// ── The memoized bubble ──────────────────────────────────
const MessageBubble = memo(function MessageBubble({
  msg, isOwn, onLongPress, onReaction, selected,
  selectionMode, onSelect, onImageClick, onSwipeReply,
  chatPartner,
}) {
  const appearance = getChatAppearance();
  const shape      = appearance.bubbleShape || 'classic';
  const fontSize   = { small: 12, medium: 15, large: 17, xl: 20 }[
    appearance.fontSize || appearance.fontSizeId || 'medium'
  ] || 15;

  // Swipe-to-reply state
  const touchStartX  = useRef(0);
  const [swipeDx, setSwipeDx] = useState(0);
  const longPressRef = useRef(null);

  const handleTouchStart = (e) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchMove  = (e) => {
    const dx = e.touches[0].clientX - touchStartX.current;
    const max = 60;
    if (isOwn && dx < 0)  setSwipeDx(Math.max(dx, -max));
    else if (!isOwn && dx > 0) setSwipeDx(Math.min(dx, max));
  };
  const handleTouchEnd = () => {
    if (Math.abs(swipeDx) >= 50) onSwipeReply?.(msg);
    setSwipeDx(0);
  };

  // Clear long-press timer on unmount to prevent calling setState on unmounted component
  useEffect(() => () => clearTimeout(longPressRef.current), []);

  const handleDown = () => {
    longPressRef.current = setTimeout(() => {
      if (selectionMode) { onSelect(msg); return; }
      onLongPress(msg);
    }, 480);
  };
  const handleUp  = () => clearTimeout(longPressRef.current);
  const handleTap = () => { if (selectionMode) onSelect(msg); };

  const isDeleted   = msg.type === 'deleted';
  const isSystem    = msg.type === 'system';
  const hasReactions = msg.reactions && Object.keys(msg.reactions).some(e => msg.reactions[e]?.length > 0);
  const ts = getTimestamp(msg);

  // System message — minimal DOM
  if (isSystem) return (
    <div className="flex justify-center my-2">
      <span className="text-[11px] text-[var(--text-secondary)] bg-[var(--input-bg)] px-3 py-1 rounded-full opacity-70">
        {msg.content}
      </span>
    </div>
  );

  return (
    <div
      className={`flex mb-1 relative ${isOwn ? 'justify-end' : 'justify-start'}`}
      onTouchStart={(e) => { handleTouchStart(e); handleDown(e); }}
      onTouchMove={handleTouchMove}
      onTouchEnd={(e) => { handleTouchEnd(e); handleUp(e); }}
      style={{
        transform: swipeDx !== 0 ? `translateX(${swipeDx}px)` : undefined,
        transition: swipeDx === 0 ? 'transform 0.2s ease' : 'none',
        // GPU hint — only when swiping
        willChange: swipeDx !== 0 ? 'transform' : 'auto',
      }}
      onMouseDown={handleDown}
      onMouseUp={handleUp}
      onClick={handleTap}
    >
      {/* Selection indicator */}
      {selectionMode && (
        <div
          className={`absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-[background,border-color] z-10 ${
            selected ? 'bg-brand-500 border-brand-500' : 'border-[var(--border)] bg-[var(--input-bg)]'
          }`}
          style={{ left: isOwn ? 'auto' : '-24px', right: isOwn ? '-24px' : 'auto' }}
        >
          {selected && <Check size={12} className="text-white" />}
        </div>
      )}

      <div className={`max-w-[78%] flex flex-col ${isOwn ? 'items-end' : 'items-start'} relative`}>
        {/* Forwarded label */}
        {msg.forwarded && !isDeleted && (
          <div className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)] mb-0.5 px-1">
            <Share2 size={9} /> Forwarded
          </div>
        )}
        {/* AI Agent label */}
        {msg.isAgentMsg && !isDeleted && (
          <div className="flex items-center gap-1 text-[10px] text-brand-500 mb-0.5 px-1 font-semibold">
            <span>🤖</span> Sent by AI Agent
          </div>
        )}
        {/* Reply preview */}
        {msg.replyTo && !isDeleted && (
          <div className={`text-xs px-2.5 py-1.5 rounded-t-xl mb-0.5 max-w-full border-l-[3px] border-brand-400 ${isOwn ? 'bg-brand-600/30' : 'bg-black/5 dark:bg-white/5'}`}>
            <p className="text-brand-400 font-semibold text-[10px] mb-0.5">Reply</p>
            <p className="truncate opacity-80 max-w-[200px]">{msg.replyTo.content?.slice(0, 60) || '📎 Media'}</p>
          </div>
        )}

        {/* Bubble */}
        <div
          className={`px-3 py-2 text-sm break-words shadow-sm ${
            isDeleted
              ? 'italic opacity-40 bg-[var(--input-bg)] text-[var(--text-secondary)]'
              : isOwn
                ? 'bg-brand-500 text-white'
                : 'bg-[var(--input-bg)] text-[var(--text-primary)]'
          } ${selected ? 'ring-2 ring-brand-400' : ''}`}
          style={{ borderRadius: getBubbleRadius(isOwn, shape), fontSize }}
        >
          {isDeleted ? (
            <span className="flex items-center gap-1.5"><Trash2 size={12} /> This message was deleted</span>
          ) : msg.type === 'image' ? (
            <LazyImage
              src={msg.content}
              alt="img"
              onClick={(e) => { e.stopPropagation(); onImageClick?.(msg); }}
            />
          ) : msg.type === 'voice' ? (
            <VoiceMessage url={msg.content} duration={msg.duration} isOwn={isOwn} />
          ) : msg.type === 'file' ? (
            <a href={msg.content} download={msg.fileName} className="flex items-center gap-2 hover:opacity-80">
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                <FileText size={16} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium truncate max-w-[140px]">{msg.fileName || 'File'}</p>
                <p className="text-[10px] opacity-60">{msg.fileSize}</p>
              </div>
            </a>
          ) : (
            <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
              {msg.content}
            </span>
          )}

          {msg.edited && !isDeleted && <span className="text-[10px] opacity-40 ml-1">· edited</span>}

          {/* Timestamp + ticks */}
          {!isDeleted && (
            <div className={`flex items-center gap-1 mt-0.5 ${isOwn ? 'justify-end' : 'justify-start'}`}>
              <span className="text-[10px]" style={{ opacity: 0.55 }}>{ts}</span>
              {isOwn && (() => {
                const partnerReadReceipts = chatPartner?.privacy?.readReceipts !== false;
                const displayStatus = (!partnerReadReceipts && msg.status === 'seen') ? 'delivered' : msg.status;
                return (
                  <span className="flex-shrink-0 flex items-center" title={displayStatus}>
                    {displayStatus === 'seen'
                      ? <CheckCheck size={16} strokeWidth={2.5} style={{ color: '#34d8ff', filter: 'drop-shadow(0 0 2px #34d8ff55)' }} />
                      : displayStatus === 'delivered'
                        ? <CheckCheck size={16} strokeWidth={2.5} style={{ color: 'rgba(255,255,255,0.95)' }} />
                        : <Check size={15} strokeWidth={2.5} style={{ color: 'rgba(255,255,255,0.75)' }} />
                    }
                  </span>
                );
              })()}
            </div>
          )}
        </div>

        {/* Reactions */}
        {hasReactions && (
          <div className={`flex flex-wrap gap-1 mt-0.5 px-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
            {Object.entries(msg.reactions)
              .filter(([, v]) => v?.length > 0)
              .map(([emoji, uids]) => (
                <button
                  key={emoji}
                  onClick={() => onReaction(msg.id, emoji)}
                  className="flex items-center gap-0.5 bg-[var(--input-bg)] border border-[var(--border)] rounded-full px-1.5 py-0.5 text-xs hover:bg-[var(--hover)] transition-colors"
                >
                  <span>{emoji}</span>
                  {uids.length > 1 && <span className="text-[10px] text-[var(--text-secondary)]">{uids.length}</span>}
                </button>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}, (prev, next) => {
  // Custom comparison — only rerender on meaningful data changes
  return (
    prev.msg.id        === next.msg.id        &&
    prev.msg.content   === next.msg.content   &&
    prev.msg.type      === next.msg.type      &&
    prev.msg.status    === next.msg.status    &&
    prev.msg.edited    === next.msg.edited    &&
    prev.msg.deletedFor === next.msg.deletedFor &&
    prev.selected      === next.selected      &&
    prev.selectionMode === next.selectionMode &&
    JSON.stringify(prev.msg.reactions) === JSON.stringify(next.msg.reactions) &&
    JSON.stringify(prev.msg.replyTo)   === JSON.stringify(next.msg.replyTo)
  );
});

export default MessageBubble;
