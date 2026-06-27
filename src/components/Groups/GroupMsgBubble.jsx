// ═══════════════════════════════════════════════════════
//  GroupMsgBubble — extracted to break circular import
//  GroupChat ↔ GroupVirtualList
// ═══════════════════════════════════════════════════════
import { useRef, memo } from 'react';
import { Check, CheckCheck, Trash2, Share2, ZoomIn, FileText } from 'lucide-react';
import { Crown } from 'lucide-react';
import { VoiceMessage } from '../Chat/VoiceNote';

export const GroupMsgBubble = memo(function GroupMsgBubble({ msg, isOwn, sender, isAdmin, onLongPress, onReaction, selected, selectionMode, onSelect, onImageClick }) {
  const timerRef  = useRef(null);
  const isDeleted = msg.type === 'deleted';
  const isSystem  = msg.type === 'system';
  const hasReactions = msg.reactions && Object.keys(msg.reactions).some(e => msg.reactions[e]?.length > 0);
  const ts = msg.timestamp?.toDate ? msg.timestamp.toDate().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : '';

  const onDown = () => { timerRef.current = setTimeout(() => { if(selectionMode) onSelect(msg); else onLongPress(msg); }, 480); };
  const onUp = () => clearTimeout(timerRef.current);
  const onTap = () => { if(selectionMode) onSelect(msg); };

  if (isSystem) return (
    <div className="flex justify-center my-2 animate-fade-in">
      <span className="text-[11px] text-[var(--text-secondary)] bg-[var(--input-bg)] px-3 py-1 rounded-full opacity-70">
        {msg.content}
      </span>
    </div>
  );

  return (
    <div className={`flex gap-2 mb-1 animate-fade-in relative ${isOwn?'justify-end':'justify-start'}`}
      onMouseDown={onDown} onMouseUp={onUp} onTouchStart={onDown} onTouchEnd={onUp} onClick={onTap}>
      {selectionMode && (
        <div className={`absolute w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all z-10 ${selected?'bg-brand-500 border-brand-500':'border-[var(--border)] bg-[var(--input-bg)]'}`}
          style={{left: isOwn ? 'auto' : '-24px', right: isOwn ? '-24px' : 'auto', top:'50%', transform:'translateY(-50%)'}}>
          {selected && <Check size={12} className="text-white"/>}
        </div>
      )}
      {!isOwn && (
        <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0 self-end">
          {sender?.avatar ? <img src={sender.avatar} alt="" className="w-full h-full object-cover"/>
            : <div className="w-full h-full bg-brand-500 flex items-center justify-center text-white text-xs font-bold">{sender?.name?.[0]||'?'}</div>}
        </div>
      )}
      <div className={`max-w-[72%] flex flex-col ${isOwn?'items-end':'items-start'}`}>
        {!isOwn && !isDeleted && (
          <span className="text-xs font-semibold ml-2 mb-0.5 flex items-center gap-1" style={{color:`hsl(${(sender?.name||'?').charCodeAt(0)*4}deg 60% 55%)`}}>
            {sender?.name||'Member'} {isAdmin && <Crown size={9} className="text-yellow-500"/>}
          </span>
        )}
        {msg.forwarded && !isDeleted && (
          <div className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)] mb-0.5 px-1">
            <Share2 size={9}/> Forwarded
          </div>
        )}
        {msg.replyTo && !isDeleted && (
          <div className={`text-xs px-2.5 py-1.5 rounded-t-xl mb-0.5 max-w-full border-l-[3px] border-brand-400 ${isOwn?'bg-brand-600/30':'bg-black/5 dark:bg-white/5'}`}>
            <p className="text-brand-400 font-semibold text-[10px] mb-0.5">Reply</p>
            <p className="truncate opacity-80 max-w-[200px]">{msg.replyTo.content?.slice(0,60)||'📎 Media'}</p>
          </div>
        )}
        <div className={`px-3 py-2 rounded-2xl text-sm break-words shadow-sm ${
          isDeleted ? 'italic opacity-40 bg-[var(--input-bg)] text-[var(--text-secondary)]'
          : isOwn ? 'bg-brand-500 text-white rounded-br-sm' : 'bg-[var(--input-bg)] text-[var(--text-primary)] rounded-bl-sm'
        } ${selected ? 'ring-2 ring-brand-400' : ''}`}>
          {isDeleted ? <span className="flex items-center gap-1.5"><Trash2 size={12}/> This message was deleted</span>
          : msg.type === 'image' ? (
            <div className="relative group cursor-pointer" onClick={e => { e.stopPropagation(); onImageClick?.(msg); }}>
              <img src={msg.content} alt="img" className="rounded-xl max-w-[220px] block" style={{maxHeight:220,objectFit:'cover'}}/>
              <div className="absolute inset-0 rounded-xl bg-black/0 group-hover:bg-black/15 transition-all flex items-center justify-center">
                <ZoomIn size={22} className="text-white opacity-0 group-hover:opacity-100 drop-shadow-lg transition-all scale-75 group-hover:scale-100"/>
              </div>
            </div>
          )
          : msg.type === 'voice' ? <VoiceMessage url={msg.content} duration={msg.duration} isOwn={isOwn}/>
          : msg.type === 'file' ? (
            <a href={msg.content} download={msg.fileName} className="flex items-center gap-2 hover:opacity-80">
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0"><FileText size={16}/></div>
              <div className="min-w-0">
                <p className="text-xs font-medium truncate max-w-[140px]">{msg.fileName||'File'}</p>
                <p className="text-[10px] opacity-60">{msg.fileSize}</p>
              </div>
            </a>
          ) : <span style={{whiteSpace:'pre-wrap'}}>{msg.content}</span>}
          {msg.edited && !isDeleted && <span className="text-[10px] opacity-40 ml-1">· edited</span>}
          {!isDeleted && (
            <div className="flex items-center justify-end gap-1 mt-0.5">
              <span className="text-[10px]" style={{opacity:0.55}}>{ts}</span>
              {isOwn && msg.seenBy?.length > 1 && <CheckCheck size={13} style={{color:'#60d8f0'}}/>}
            </div>
          )}
        </div>
        {hasReactions && (
          <div className={`flex flex-wrap gap-1 mt-0.5 px-1 ${isOwn?'justify-end':'justify-start'}`}>
            {Object.entries(msg.reactions).filter(([,v])=>v?.length>0).map(([emoji,uids]) => (
              <button key={emoji} onClick={() => onReaction(msg.id, emoji)}
                className="flex items-center gap-0.5 bg-[var(--input-bg)] border border-[var(--border)] rounded-full px-1.5 py-0.5 text-xs hover:bg-[var(--hover)] transition-all">
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
  return (
    prev.msg.id        === next.msg.id &&
    prev.msg.content   === next.msg.content &&
    prev.msg.type      === next.msg.type &&
    prev.msg.edited    === next.msg.edited &&
    prev.selected      === next.selected &&
    prev.selectionMode === next.selectionMode &&
    JSON.stringify(prev.msg.reactions) === JSON.stringify(next.msg.reactions)
  );
});

export default GroupMsgBubble;
