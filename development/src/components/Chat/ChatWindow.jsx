// ═══════════════════════════════════════════════════════
//  ChatWindow — Private Chat (Full Features)
//  Family & Friends  ·  Built by Ishrit Sachdeva
// ═══════════════════════════════════════════════════════
import { useState, useEffect, useRef, useCallback } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import {
  ArrowLeft, Phone, Video, MoreVertical, Send, Paperclip,
  Image, FileText, Smile, Mic, Search, X, Check, CheckCheck,
  Edit3, Trash2, Camera, Reply, Share2, Volume2, VolumeX,
  Users, ZoomIn, ChevronLeft, ChevronRight, Download, Info, Sparkles
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  db, getOrCreateChat, sendMessage, subscribeToMessages,
  setTyping, clearTyping, markMessagesRead,
  deleteMessageForMe, deleteMessageForEveryone, deleteMultipleMessages,
  editMessage, forwardMessage, muteChat, blockUser, clearChat,
  subscribeToPresence, setOnline, checkIsBlocked,
  addReaction, getUserById, subscribeToGroups,
  doc, onSnapshot, addDoc, collection, serverTimestamp,
  sendPushNotification, makePreview,
} from '../../firebase';
import { VoiceRecorder, VoiceMessage } from './VoiceNote';
import CameraCapture from '../Camera/CameraCapture';
import toast from 'react-hot-toast';
import UnifyAIOverlay from '../../ai/UnifyAIOverlay';
import UnifyAIChatBar from '../../ai/UnifyAIChatBar';
import UnifiedAnswerCard from '../../ai/UnifiedAnswerCard';
import VoiceAI from '../../ai/VoiceAI';
import MediaIntelligence from '../../ai/MediaIntelligence';
import useAIStore from '../../ai/useAIStore';
import { summarizeMessages, unifiedAnswer } from '../../ai/unifyService';

// ── Emoji data ─────────────────────────────────────────
const EMOJI_CATEGORIES = {
  'Faces': ['😀','😃','😄','😁','😆','😅','😂','🤣','🥲','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😜','🤪','😝','🤑','🤗','🫡','🤔','🫣','🤭','🤫','🤥','😶','😐','😑','😬','🙄','😯','😦','😧','😲','🥱','😴','🤤','😵','😵‍💫','🤯','😳','🥵','🥶','😱','😰','😟','😕','🫤','☹️','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','👿','💀','☠️','🤡','👻','👾','🤖','😺','😸','😹','😻','😼','😽','🙀','😿','😾'],
  'Love': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','❤️‍🩹','💕','💞','💓','💗','💖','💘','💝','💟','☮️','🫶','🤝','🙏','💏','💑','🥂','💋','💌','🫀','😍','🥰','😘'],
  'Hands': ['👍','👎','👊','✊','🤛','🤜','🤞','🫰','🤟','🤘','🤙','💪','🦾','✋','🤚','🖐','🖖','👋','🤌','🤏','✌️','🫳','🫴','🫵','👌','👈','👉','👆','👇','☝️','🖕','💅','🤳','🤲','🫱','🫲','👐','🤜','🫶','👏','🙌','🤝','🤙'],
  'People': ['🧑','👶','🧒','👦','👧','🧑','👱','👩','🧔','👴','👵','💁','🙋','🤷','🙆','🙅','🧏','💆','💇','🚶','🧍','🧎','🏃','💃','🕺','🧖','🧗','🤸','🏋️','🤼','🤺','⛹️','🤾','🏌️','🧘','👼','🎅','🤶'],
  'Celebration': ['🎉','🎊','🎈','🎁','🎂','🍰','🥂','🎶','🎵','🏆','🥇','🥈','🥉','🎯','🎮','🕹','🎭','🎪','🎨','🎬','🎤','🎧','🎸','🎹','🥁','🎺','🎻','🪗','🎷','🎙','🪅','🎠','🎡','🎢','✨','🎇','🧨','🎆'],
  'Nature': ['🌈','⭐','🌟','💫','✨','☀️','🌙','🌤','⛅','☁️','🌧','⛈','🌩','🌪','❄️','⛄','🌊','🌋','🔥','💧','🌺','🌸','🌼','🌻','🌹','🌷','🌱','🌿','🍀','🍃','🍂','🍁','🌴','🌵','🎋','🎍','🦋','🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🐧','🐦','🦆','🦅','🦉','🦇','🐺','🐴','🦄','🐝','🐛','🦗','🐌','🐞','🦂','🐠','🐙'],
  'Food': ['🍕','🍔','🌮','🌯','🥙','🥪','🍜','🍝','🍛','🍣','🍱','🥘','🫕','🍲','🍤','🥗','🥚','🧀','🥓','🌭','🍟','🧆','🥞','🧇','🍳','🥐','🥨','🥯','🍞','🧁','🍩','🍪','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍦','🍨','🍧','🍡','🧃','☕','🧋','🍵','🥤','🧉','🍺','🍻','🥂','🍷','🥃','🍸','🍹','🍾'],
  'Travel': ['🚀','✈️','🛸','🚂','🚌','🚗','🏎','🚕','🚙','🛺','🚲','🛵','🏍','🛻','🚓','🚑','🚒','🚜','🏗','🚢','⛴','🛥','🚁','🛩','🪂','🚤','🛶','🗺','🌍','🌎','🌏','🏔','⛰','🗻','🏕','🏖','🏜','🏝','🏛','🏗','🏠','🏡','🏢','🗼','🗽','🏰','🏯','⛩','🕌','🕍','🌁','🌃','🌆','🌇','🌉','🎠'],
  'Objects': ['📱','💻','⌨️','🖥','🖨','📷','📸','📹','🎥','📺','📻','🎙','📡','🔭','🔬','🧬','💊','🔧','🔨','⚙️','🔑','🗝','🔐','🔒','🔓','💡','🔦','🕯','📚','📖','📰','📦','📬','📋','📌','✏️','🖊','📏','📐','✂️','🧵','🧸','🎭','🪆','🧩','♟','🎲','🃏','🎴','💈','🪒','🛁','🚿','🪴','🛋'],
  'Symbols': ['✅','❌','💯','🔥','💡','🔔','🔕','💬','📝','🔐','🔑','🚀','💎','💰','💳','🆕','♾️','‼️','❓','❗','⭕','🚫','⚠️','🆘','🆙','🆒','🆓','🆖','🅰️','🅱️','🆗','🆚','🈵','🉐','♻️','⚡','🌀','💤','🔞','🚩','⛔','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🟤'],
};

const ALL_EMOJIS = Object.values(EMOJI_CATEGORIES).flat();
const QUICK_REACTIONS = ['❤️','😂','😮','😢','😡','👍','👎','🙏'];

// ── Contact Info Panel ──────────────────────────────────
function ContactInfoPanel({ partner, isOnline, presenceLabel, onClose }) {
  return (
    <div className="fixed inset-0 z-[250] bg-[var(--chat-bg)] flex flex-col animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-[var(--border)] bg-[var(--sidebar-bg)]">
        <button onClick={onClose} className="w-9 h-9 rounded-xl hover:bg-[var(--hover)] flex items-center justify-center">
          <ArrowLeft size={20} className="text-[var(--text-secondary)]"/>
        </button>
        <h2 className="font-bold text-[var(--text-primary)] flex-1">Contact Info</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Avatar + name */}
        <div className="flex flex-col items-center pt-10 pb-7 bg-[var(--sidebar-bg)] border-b border-[var(--border)]">
          <div className="relative">
            {partner.avatar
              ? <img src={partner.avatar} alt="" className="w-24 h-24 rounded-full object-cover border-4 border-brand-500/30"/>
              : <div className="w-24 h-24 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center border-4 border-brand-500/30">
                  <span className="text-4xl font-bold text-white">{partner.name?.[0]?.toUpperCase() || '?'}</span>
                </div>}
            <div className={`absolute bottom-1 right-1 w-4 h-4 rounded-full border-2 border-[var(--sidebar-bg)] ${isOnline ? 'bg-green-500' : 'bg-gray-400'}`}/>
          </div>
          <h3 className="mt-4 text-2xl font-bold text-[var(--text-primary)]">{partner.name}</h3>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{presenceLabel}</p>
          {partner.phone && (
            <p className="mt-1 text-sm text-brand-500 font-medium">{partner.phone}</p>
          )}
        </div>

        {/* About */}
        <div className="mx-4 mt-4 bg-[var(--sidebar-bg)] border border-[var(--border)] rounded-2xl p-4">
          <p className="text-xs font-bold text-[var(--text-secondary)] tracking-wider mb-2">ABOUT</p>
          <p className="text-sm text-[var(--text-primary)]">
            {partner.about || <span className="text-[var(--text-secondary)] italic">No status set</span>}
          </p>
        </div>

        {/* Phone */}
        {partner.phone && (
          <div className="mx-4 mt-3 bg-[var(--sidebar-bg)] border border-[var(--border)] rounded-2xl p-4">
            <p className="text-xs font-bold text-[var(--text-secondary)] tracking-wider mb-2">PHONE</p>
            <p className="text-sm text-[var(--text-primary)] font-medium">{partner.phone}</p>
          </div>
        )}

        {/* Unique code */}
        {partner.code && (
          <div className="mx-4 mt-3 mb-6 bg-[var(--sidebar-bg)] border border-[var(--border)] rounded-2xl p-4">
            <p className="text-xs font-bold text-[var(--text-secondary)] tracking-wider mb-2">FRIEND CODE</p>
            <p className="text-lg font-bold text-brand-500 tracking-widest">{partner.code}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Confirm Sheet ───────────────────────────────────────
// Replaces window.confirm() — smooth bottom sheet, works on mobile/PWA
function ConfirmSheet({ title, message, confirmLabel = 'Confirm', confirmDanger = false, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-[500] flex items-end justify-center animate-fade-in"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={onCancel}>
      <div className="bg-[var(--sidebar-bg)] rounded-t-3xl w-full max-w-sm pb-8 animate-sheet-up shadow-2xl"
        onClick={e => e.stopPropagation()}>
        {/* Handle bar */}
        <div className="w-10 h-1 bg-[var(--border)] rounded-full mx-auto mt-3 mb-4"/>
        <div className="px-6 pb-2">
          <p className="text-base font-bold text-[var(--text-primary)] mb-1">{title}</p>
          {message && <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{message}</p>}
        </div>
        <div className="px-4 pt-3 flex flex-col gap-2">
          <button onClick={onConfirm}
            className={`w-full py-3.5 rounded-2xl font-semibold text-sm transition-all active:scale-[0.98] ${
              confirmDanger
                ? 'bg-red-500 hover:bg-red-600 text-white'
                : 'bg-brand-500 hover:bg-brand-600 text-white'
            }`}>
            {confirmLabel}
          </button>
          <button onClick={onCancel}
            className="w-full py-3.5 rounded-2xl font-semibold text-sm bg-[var(--hover)] hover:bg-[var(--border)] text-[var(--text-primary)] transition-all active:scale-[0.98]">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Emoji Picker ───────────────────────────────────────
function EmojiPicker({ onSelect, onClose }) {
  const [cat, setCat] = useState('Faces');
  return (
    <div className="absolute bottom-full left-0 mb-2 bg-[var(--sidebar-bg)] border border-[var(--border)] rounded-2xl shadow-2xl z-30 w-72 animate-scale-in overflow-hidden">
      <div className="flex justify-between items-center px-3 pt-3 mb-2">
        <span className="text-xs font-bold text-[var(--text-secondary)] tracking-wider">EMOJI</span>
        <button onClick={onClose} className="hover:bg-[var(--hover)] rounded-lg p-0.5"><X size={13} className="text-[var(--text-secondary)]"/></button>
      </div>
      {/* Category tabs */}
      <div className="flex gap-0.5 px-2 mb-2 overflow-x-auto scrollbar-none">
        {Object.keys(EMOJI_CATEGORIES).map(c => (
          <button key={c} onClick={() => setCat(c)}
            className={`text-xs px-2 py-1 rounded-lg flex-shrink-0 transition-all ${cat===c ? 'bg-brand-500 text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--hover)]'}`}>
            {c}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-8 gap-0.5 px-2 pb-3 max-h-44 overflow-y-auto">
        {(EMOJI_CATEGORIES[cat]||[]).map(e => (
          <button key={e} onClick={() => onSelect(e)}
            className="w-8 h-8 flex items-center justify-center text-xl hover:bg-[var(--hover)] rounded-lg transition-colors">
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Reaction Bar (quick reactions on long-press) ────────
function ReactionBar({ onReact, onClose }) {
  return (
    <div className="absolute bottom-full left-0 mb-1 bg-[var(--sidebar-bg)] border border-[var(--border)] rounded-full shadow-2xl px-2 py-1.5 flex gap-1 z-30 animate-scale-in">
      {QUICK_REACTIONS.map(e => (
        <button key={e} onClick={() => { onReact(e); onClose(); }}
          className="w-8 h-8 flex items-center justify-center text-xl hover:scale-125 transition-transform">
          {e}
        </button>
      ))}
    </div>
  );
}

// ── Message bubble ─────────────────────────────────────
// ── Photo Viewer ────────────────────────────────────────
function PhotoViewer({ images, startIndex, onClose }) {
  const [idx, setIdx]         = useState(startIndex);
  const [dir, setDir]         = useState(0);    // -1 left  +1 right  0 initial
  const [animating, setAnim]  = useState(false);
  const [imgLoaded, setLoaded]= useState(false);
  const [naturalSize, setNat] = useState({ w: 0, h: 0 });

  const touchStartX = useRef(null);
  const touchStartY = useRef(null);
  const SWIPE_THRESHOLD = 50;

  const total = images.length;
  const cur   = images[idx];

  // Pre-measure image to decide bg treatment
  const onImgLoad = (e) => {
    setLoaded(true);
    setNat({ w: e.target.naturalWidth, h: e.target.naturalHeight });
  };

  const goTo = useCallback((newIdx, direction) => {
    if (animating || newIdx < 0 || newIdx >= total) return;
    setAnim(true);
    setDir(direction);
    setLoaded(false);
    setTimeout(() => {
      setIdx(newIdx);
      setDir(0);
      setTimeout(() => setAnim(false), 20);
    }, 220);
  }, [animating, total]);

  const prev = () => { if (idx > 0) goTo(idx - 1, -1); };
  const next = () => { if (idx < total - 1) goTo(idx + 1, 1); };

  // Keyboard
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'ArrowLeft')  prev();
      if (e.key === 'ArrowRight') next();
      if (e.key === 'Escape')     onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [idx, animating]);

  // Touch swipe
  const onTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };
  const onTouchEnd = (e) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > SWIPE_THRESHOLD) {
      if (dx < 0) next();  // swipe left → next
      else         prev(); // swipe right → prev
    }
    touchStartX.current = null;
    touchStartY.current = null;
  };

  // Animation styles
  const slideStyle = (() => {
    if (dir === -1) return { transform: 'translateX(60px)', opacity: 0 };
    if (dir === 1)  return { transform: 'translateX(-60px)', opacity: 0 };
    return { transform: 'translateX(0)', opacity: imgLoaded ? 1 : 0 };
  })();

  const isSmall = naturalSize.w > 0 && naturalSize.w < 400 && naturalSize.h < 400;

  const downloadImg = () => {
    const a = document.createElement('a');
    a.href = cur.content;
    a.download = cur.fileName || `photo-${idx + 1}.jpg`;
    a.click();
  };

  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center animate-fade-in"
      style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}>

      {/* Blurred background copy for small images */}
      {isSmall && imgLoaded && (
        <div className="absolute inset-0 overflow-hidden">
          <img src={cur.content} alt=""
            className="absolute inset-0 w-full h-full object-cover scale-110"
            style={{ filter: 'blur(30px) brightness(0.3)', opacity: 0.8 }}/>
        </div>
      )}

      {/* Image container */}
      <div
        className="relative max-w-full max-h-full flex items-center justify-center p-4"
        style={{ width: '100vw', height: '100vh' }}
        onClick={e => e.stopPropagation()}>

        {/* Actual photo */}
        <img
          key={idx}
          src={cur.content}
          alt={`Photo ${idx + 1}`}
          onLoad={onImgLoad}
          className="max-w-full max-h-full rounded-2xl shadow-2xl select-none"
          style={{
            maxWidth: '95vw',
            maxHeight: '92vh',
            objectFit: 'contain',
            transition: 'transform 0.22s cubic-bezier(0.4,0,0.2,1), opacity 0.22s ease',
            ...slideStyle,
          }}
          draggable={false}
        />

        {/* Loading shimmer */}
        {!imgLoaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin"/>
          </div>
        )}
      </div>

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-4 z-10"
        style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)' }}
        onClick={e => e.stopPropagation()}>
        <button onClick={onClose}
          className="w-10 h-10 rounded-full bg-black/40 hover:bg-black/60 flex items-center justify-center text-white transition-all active:scale-95 backdrop-blur-sm">
          <X size={20}/>
        </button>
        <span className="text-white/70 text-sm font-medium">
          {total > 1 ? `${idx + 1} / ${total}` : ''}
        </span>
        <button onClick={downloadImg}
          className="w-10 h-10 rounded-full bg-black/40 hover:bg-black/60 flex items-center justify-center text-white transition-all active:scale-95 backdrop-blur-sm">
          <Download size={18}/>
        </button>
      </div>

      {/* Sender + time bar at bottom */}
      <div className="absolute bottom-0 left-0 right-0 px-4 py-4 z-10"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.6), transparent)' }}
        onClick={e => e.stopPropagation()}>
        <p className="text-white/60 text-xs text-center">
          {cur.senderName} · {cur.ts}
        </p>
        {/* Dot indicators */}
        {total > 1 && (
          <div className="flex justify-center gap-1.5 mt-2">
            {images.map((_, i) => (
              <button key={i} onClick={() => goTo(i, i > idx ? 1 : -1)}
                className={`rounded-full transition-all ${i === idx ? 'w-4 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-white/40 hover:bg-white/60'}`}/>
            ))}
          </div>
        )}
      </div>

      {/* Prev button */}
      {idx > 0 && (
        <button
          onClick={e => { e.stopPropagation(); prev(); }}
          className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/40 hover:bg-black/70 flex items-center justify-center text-white transition-all active:scale-95 backdrop-blur-sm z-10">
          <ChevronLeft size={22}/>
        </button>
      )}

      {/* Next button */}
      {idx < total - 1 && (
        <button
          onClick={e => { e.stopPropagation(); next(); }}
          className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/40 hover:bg-black/70 flex items-center justify-center text-white transition-all active:scale-95 backdrop-blur-sm z-10">
          <ChevronRight size={22}/>
        </button>
      )}
    </div>
  );
}

function MessageBubble({ msg, isOwn, onLongPress, onReaction, selected, selectionMode, onSelect, onImageClick }) {
  const longPressRef = useRef(null);
  const [showReactions, setShowReactions] = useState(false);
  const isDeleted   = msg.type === 'deleted';
  const isSystem    = msg.type === 'system';
  const hasReactions = msg.reactions && Object.keys(msg.reactions).some(e => msg.reactions[e]?.length > 0);

  const ts = msg.timestamp?.toDate
    ? msg.timestamp.toDate().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})
    : '';

  const handleDown = () => {
    longPressRef.current = setTimeout(() => {
      if (selectionMode) { onSelect(msg); return; }
      setShowReactions(true);
      setTimeout(() => setShowReactions(false), 3000);
      onLongPress(msg);
    }, 480);
  };
  const handleUp = () => clearTimeout(longPressRef.current);
  const handleTap = () => {
    if (selectionMode) { onSelect(msg); return; }
  };

  // System message
  if (isSystem) return (
    <div className="flex justify-center my-2 animate-fade-in">
      <span className="text-[11px] text-[var(--text-secondary)] bg-[var(--input-bg)] px-3 py-1 rounded-full opacity-70">
        {msg.content}
      </span>
    </div>
  );

  return (
    <div className={`flex mb-1 animate-fade-in relative ${isOwn?'justify-end':'justify-start'}`}
      onMouseDown={handleDown} onMouseUp={handleUp}
      onTouchStart={handleDown} onTouchEnd={handleUp}
      onClick={handleTap}>
      {/* Selection indicator */}
      {selectionMode && (
        <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all z-10 ${
          selected ? 'bg-brand-500 border-brand-500' : 'border-[var(--border)] bg-[var(--input-bg)]'
        }`} style={{left: isOwn ? 'auto' : '-24px', right: isOwn ? '-24px' : 'auto'}}>
          {selected && <Check size={12} className="text-white"/>}
        </div>
      )}
      <div className={`max-w-[78%] flex flex-col ${isOwn?'items-end':'items-start'} relative`}>
        {/* Forwarded label */}
        {msg.forwarded && !isDeleted && (
          <div className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)] mb-0.5 px-1">
            <Share2 size={9}/> Forwarded
          </div>
        )}
        {/* Reply preview */}
        {msg.replyTo && !isDeleted && (
          <div className={`text-xs px-2.5 py-1.5 rounded-t-xl mb-0.5 max-w-full border-l-[3px] border-brand-400 ${isOwn?'bg-brand-600/30':'bg-black/5 dark:bg-white/5'}`}>
            <p className="text-brand-400 font-semibold text-[10px] mb-0.5">Reply</p>
            <p className="truncate opacity-80 max-w-[200px]">{msg.replyTo.content?.slice(0,60)||'📎 Media'}</p>
          </div>
        )}
        {/* Bubble */}
        <div className={`px-3 py-2 rounded-2xl text-sm break-words shadow-sm ${
          isDeleted
            ? 'italic opacity-40 bg-[var(--input-bg)] text-[var(--text-secondary)]'
            : isOwn
              ? 'bg-brand-500 text-white rounded-br-sm'
              : 'bg-[var(--input-bg)] text-[var(--text-primary)] rounded-bl-sm'
        } ${selected ? 'ring-2 ring-brand-400' : ''}`}>
          {isDeleted ? (
            <span className="flex items-center gap-1.5"><Trash2 size={12}/> This message was deleted</span>
          ) : msg.type === 'image' ? (
            <div className="relative group cursor-pointer" onClick={e => { e.stopPropagation(); onImageClick?.(msg); }}>
              <img src={msg.content} alt="img" className="rounded-xl max-w-[220px] block" style={{maxHeight:220,objectFit:'cover'}}/>
              <div className="absolute inset-0 rounded-xl bg-black/0 group-hover:bg-black/15 transition-all flex items-center justify-center">
                <ZoomIn size={22} className="text-white opacity-0 group-hover:opacity-100 drop-shadow-lg transition-all scale-75 group-hover:scale-100"/>
              </div>
            </div>
          ) : msg.type === 'voice' ? (
            <VoiceMessage url={msg.content} duration={msg.duration} isOwn={isOwn}/>
          ) : msg.type === 'file' ? (
            <a href={msg.content} download={msg.fileName} className="flex items-center gap-2 hover:opacity-80">
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                <FileText size={16}/>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium truncate max-w-[140px]">{msg.fileName||'File'}</p>
                <p className="text-[10px] opacity-60">{msg.fileSize}</p>
              </div>
            </a>
          ) : (
            <span style={{whiteSpace:'pre-wrap'}}>{msg.content}</span>
          )}
          {msg.edited && !isDeleted && <span className="text-[10px] opacity-40 ml-1">· edited</span>}
          {/* Timestamp + ticks */}
          {!isDeleted && (
            <div className={`flex items-center gap-1 mt-0.5 ${isOwn?'justify-end':'justify-start'}`}>
              <span className="text-[10px]" style={{opacity:0.55}}>{ts}</span>
              {isOwn && (
                <span className="flex-shrink-0 flex items-center" title={msg.status}>
                  {msg.status === 'seen'
                    ? <CheckCheck size={16} strokeWidth={2.5} style={{color:'#34d8ff', filter:'drop-shadow(0 0 2px #34d8ff55)'}}/>
                    : msg.status === 'delivered'
                      ? <CheckCheck size={16} strokeWidth={2.5} style={{color:'rgba(255,255,255,0.95)'}}/>
                      : <Check size={15} strokeWidth={2.5} style={{color:'rgba(255,255,255,0.75)'}}/>
                  }
                </span>
              )}
            </div>
          )}
        </div>
        {/* Reactions display */}
        {hasReactions && (
          <div className={`flex flex-wrap gap-1 mt-0.5 px-1 ${isOwn?'justify-end':'justify-start'}`}>
            {Object.entries(msg.reactions).filter(([,v]) => v?.length > 0).map(([emoji, uids]) => (
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
}

// ── Message Context Menu ───────────────────────────────
function MsgMenu({ msg, isOwn, onClose, onReply, onEdit, onDeleteMe, onDeleteAll, onForward, onReact }) {
  const items = [
    { label:'React', icon:'😊', fn: () => {}, special: 'react', show: msg.type !== 'deleted' },
    { label:'Reply', icon:<Reply size={15} className="text-brand-500"/>, fn: onReply, show: msg.type !== 'deleted' },
    { label:'Edit', icon:<Edit3 size={15} className="text-blue-400"/>, fn: onEdit, show: isOwn && msg.type === 'text' },
    { label:'Forward', icon:<Share2 size={15} className="text-purple-400"/>, fn: onForward, show: msg.type !== 'deleted' },
    { label:'Delete for Me', icon:<Trash2 size={15} className="text-orange-400"/>, fn: onDeleteMe, show: true },
    { label:'Delete for Everyone', icon:<Trash2 size={15} className="text-red-500"/>, fn: onDeleteAll, show: isOwn && msg.type !== 'deleted', danger: true },
  ];
  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 backdrop-blur-sm animate-fade-in"
      onClick={onClose}>
      <div className="bg-[var(--sidebar-bg)] rounded-t-3xl w-full max-w-sm p-4 pb-8 animate-sheet-up"
        onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-[var(--border)] rounded-full mx-auto mb-4"/>
        {/* Quick reactions */}
        <div className="flex justify-center gap-2 mb-4">
          {QUICK_REACTIONS.map(e => (
            <button key={e} onClick={() => { onReact(msg.id, e); onClose(); }}
              className="w-10 h-10 flex items-center justify-center text-2xl hover:scale-125 active:scale-110 transition-transform rounded-full hover:bg-[var(--hover)]">
              {e}
            </button>
          ))}
        </div>
        <div className="h-px bg-[var(--border)] mb-2"/>
        <div className="space-y-0.5">
          {items.filter(i => i.show && !i.special).map(item => (
            <button key={item.label} onClick={() => { item.fn(); onClose(); }}
              className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl hover:bg-[var(--hover)] transition-all text-sm ${item.danger?'text-red-500 font-medium':'text-[var(--text-primary)]'}`}>
              {item.icon} {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Forward Sheet ──────────────────────────────────────
function ForwardSheet({ msgs, contacts, groups, currentChat, onClose, onForward }) {
  const [sel, setSel] = useState([]);
  const [search, setSearch] = useState('');
  const MAX = 8;

  // Current chat always appears first so you can easily forward back to same person
  const allTargets = [
    ...(currentChat ? [{ ...currentChat, isGroup: false, label: 'This chat' }] : []),
    ...(contacts||[])
      .filter(c => !currentChat || c.id !== currentChat.id)
      .map(c => ({ id: c.id, name: c.name, avatar: c.avatar, isGroup: false, label: 'Contact' })),
    ...(groups||[]).map(g => ({ id: g.id, name: g.name, avatar: g.photoURL, isGroup: true, label: 'Group' })),
  ];

  const filtered = search
    ? allTargets.filter(t => t.name?.toLowerCase().includes(search.toLowerCase()))
    : allTargets;

  const toggle = t => {
    setSel(s => {
      const exists = s.find(x => x.id === t.id);
      if (exists) return s.filter(x => x.id !== t.id);
      if (s.length >= MAX) { toast.error(`Max ${MAX} chats`); return s; }
      return [...s, t];
    });
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 backdrop-blur-sm animate-fade-in"
      onClick={onClose}>
      <div className="bg-[var(--sidebar-bg)] rounded-t-3xl w-full max-w-sm p-4 pb-8 animate-sheet-up max-h-[70vh] flex flex-col"
        onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-[var(--border)] rounded-full mx-auto mb-3"/>
        <div className="flex items-center justify-between mb-2">
          <p className="font-bold text-[var(--text-primary)]">
            Forward {msgs?.length > 1 ? `${msgs.length} messages` : 'message'}
          </p>
          <span className="text-xs text-[var(--text-secondary)]">{sel.length}/{MAX} selected</span>
        </div>
        <div className="mb-2">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search chats…"
            className="w-full bg-[var(--input-bg)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] outline-none focus:border-brand-500 transition-colors"/>
        </div>
        <div className="flex-1 overflow-y-auto space-y-0.5">
          {filtered.map(t => {
            const isSel = sel.find(x => x.id === t.id);
            return (
              <button key={t.id + (t.isGroup ? '-g' : '-c')} onClick={() => toggle(t)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-all text-sm ${isSel?'bg-brand-500/10 border border-brand-500/30':'hover:bg-[var(--hover)]'}`}>
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 overflow-hidden ${isSel?'bg-brand-500':t.isGroup?'bg-gradient-to-br from-brand-500 to-brand-700':'bg-gray-400'}`}>
                  {isSel ? <Check size={14}/> : t.avatar
                    ? <img src={t.avatar} className="w-full h-full object-cover" alt=""/>
                    : t.name?.[0]?.toUpperCase()}
                </div>
                <div className="flex-1 text-left">
                  <span className="text-[var(--text-primary)]">{t.name}</span>
                  <span className="text-[10px] text-[var(--text-secondary)] ml-2">{t.label}</span>
                </div>
                {isSel && <Check size={14} className="text-brand-500"/>}
              </button>
            );
          })}
        </div>
        {sel.length > 0 && (
          <button onClick={() => { onForward(sel); onClose(); }}
            className="mt-3 w-full py-3.5 rounded-2xl bg-brand-500 hover:bg-brand-600 text-white font-semibold transition-all active:scale-[0.98]">
            Forward to {sel.length} chat{sel.length>1?'s':''}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Selection action bar ───────────────────────────────
function SelectionBar({ count, onCancel, onDeleteMe, onDeleteAll, onForward }) {
  return (
    <div className="absolute top-0 left-0 right-0 bg-brand-600 text-white flex items-center px-4 py-3 z-20 animate-slide-down">
      <button onClick={onCancel} className="mr-3 w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center">
        <X size={18}/>
      </button>
      <span className="flex-1 font-semibold">{count} selected</span>
      <button onClick={onForward} className="w-9 h-9 rounded-xl hover:bg-white/10 flex items-center justify-center" title="Forward">
        <Share2 size={18}/>
      </button>
      <button onClick={onDeleteMe} className="w-9 h-9 rounded-xl hover:bg-white/10 flex items-center justify-center" title="Delete for me">
        <Trash2 size={18}/>
      </button>
    </div>
  );
}

// ══════════════════════════════════════════════════════
//  Main ChatWindow
// ══════════════════════════════════════════════════════
export default function ChatWindow({ chatPartner, onBack, onVoiceCall, onVideoCall, onOpenSettings, contacts, groups }) {
  const { user, profile } = useAuth();
  const { wallpaperBg } = useTheme();
  const [messages, setMessages]           = useState([]);
  const [text, setText]                   = useState('');
  const [chatId, setChatId]               = useState(null);
  const [sending, setSending]             = useState(false);
  const [showVoice, setShowVoice]         = useState(false);
  const [showCamera, setShowCamera]       = useState(false);
  const [photoViewer, setPhotoViewer]     = useState(null); // { images, startIndex }
  const [confirmSheet, setConfirmSheet]   = useState(null); // { title, message, label, danger, onConfirm }
  const [showContactInfo, setShowContactInfo] = useState(false);

  // Helper — shows the confirm sheet and returns a Promise<boolean>
  const askConfirm = ({ title, message, label = 'Confirm', danger = false }) =>
    new Promise(resolve => {
      setConfirmSheet({
        title, message, label, danger,
        onConfirm: () => { setConfirmSheet(null); resolve(true); },
        onCancel:  () => { setConfirmSheet(null); resolve(false); },
      });
    });
  const [replyTo, setReplyTo]             = useState(null);
  const [showAttach, setShowAttach]       = useState(false);
  const [showEmoji, setShowEmoji]         = useState(false);
  const [showSearch, setShowSearch]       = useState(false);
  const [searchQ, setSearchQ]             = useState('');
  const [isOnline, setIsOnline]           = useState(false);
  const [lastSeen, setLastSeen]           = useState(null);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [showMenu, setShowMenu]           = useState(false);
  const [selectedMsg, setSelectedMsg]     = useState(null);
  const [editingMsg, setEditingMsg]       = useState(null);
  const [editText, setEditText]           = useState('');
  const [forwardMsgs, setForwardMsgs]     = useState(null); // array of msgs to forward
  const [muted, setMuted]                 = useState(false);
  const [blocked, setBlocked]             = useState(false);     // I blocked them
  // Contacts + groups for ForwardSheet — load from current user's profile
  const [ownContacts, setOwnContacts]     = useState(contacts || []);
  const [ownGroups,   setOwnGroups]       = useState(groups   || []);

  useEffect(() => {
    if (contacts) { setOwnContacts(contacts); return; }
    if (!profile?.contacts?.length) { setOwnContacts([]); return; }
    Promise.all(profile.contacts.map(id => getUserById(id)))
      .then(ps => setOwnContacts(ps.filter(Boolean)));
  }, [profile?.contacts, contacts]);

  useEffect(() => {
    if (!user) return;
    return subscribeToGroups(user.uid, setOwnGroups);
  }, [user?.uid]);
  // NOTE: blockedByThem is intentionally NOT tracked in UI — user should not know they are blocked
  // Multi-select
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMsgs, setSelectedMsgs]   = useState([]);

  // ── UnifyAI state ──────────────────────────────────────────
  const { openOverlay, openVoiceAI, voiceAIOpen, overlayOpen,
          unifiedAnswer, setUnifiedAnswer, clearUnifiedAnswer,
          getSummaryCache, setSummaryCache } = useAIStore();
  const [showMediaAI, setShowMediaAI]       = useState(false);
  const [mediaAIImage, setMediaAIImage]     = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const bottomRef   = useRef(null);
  const inputRef    = useRef(null);
  const typingTimer = useRef(null);

  // Init chat
  useEffect(() => {
    if (!user || !chatPartner) return;
    getOrCreateChat(user.uid, chatPartner.id)
      .then(id => setChatId(id))
      .catch(e => { console.error('getOrCreateChat failed:', e); toast.error('Could not open chat'); });
    setOnline(user.uid).catch(()=>{});
  }, [user, chatPartner?.id]);

  // Load block status — only watch MY own blocked list
  // We intentionally do NOT subscribe to the other person's blocked list —
  // if they blocked us, we should NOT show any indicator (WhatsApp-style privacy)
  useEffect(() => {
    if (!user?.uid || !chatPartner?.id) return;
    const unsub = onSnapshot(doc(db, 'users', user.uid), snap => {
      const myBlocked = snap.data()?.blocked || [];
      setBlocked(myBlocked.includes(chatPartner.id));
    });
    return unsub;
  }, [user?.uid, chatPartner?.id]);

  // Messages
  useEffect(() => {
    if (!chatId) return;
    const unsub = subscribeToMessages(chatId, msgs => {
      setMessages(msgs);
      markMessagesRead(chatId, user.uid, false).catch(()=>{});
    });
    return unsub;
  }, [chatId]);

  // Presence — RTDB last_changed is stored as ms timestamp (number)
  useEffect(() => {
    if (!chatPartner) return;
    const unsub = subscribeToPresence(chatPartner.id, status => {
      setIsOnline(status?.state === 'online');
      setLastSeen(status?.last_changed || null);
    });
    return unsub;
  }, [chatPartner?.id]);

  // Typing subscription
  useEffect(() => {
    if (!chatId || !chatPartner) return;
    const unsub = onSnapshot(doc(db, 'chats', chatId), snap => {
      const theirTyping = snap.data()?.typing?.[chatPartner.id];
      const ts = theirTyping?.seconds ? theirTyping.seconds * 1000 : theirTyping;
      setPartnerTyping(!!(ts && Date.now() - ts < 4000));
    });
    return unsub;
  }, [chatId, chatPartner?.id]);

  // Scroll
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // Typing handler
  const handleTextChange = val => {
    setText(val);
    if (!chatId) return;
    setTyping(chatId, user.uid, false).catch(()=>{});
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => clearTyping(chatId, user.uid, false).catch(()=>{}), 2500);
  };

  // ── Push notification helper ──────────────────────────
  const pushToPartner = (content, type) => {
    if (!chatPartner?.id || !profile?.name) return;
    sendPushNotification(
      chatPartner.id,
      profile.name,
      makePreview(content, type),
      { chatId, tag: `chat-${chatId}` }
    ).catch(() => {});
  };

  // Send text
  const handleSend = async () => {
    const content = text.trim();
    if (!content || !chatId) return;
    if (blocked) { toast.error(`You have blocked ${chatPartner.name}`); return; }
    // (silently allow send even if they blocked us — they just won't see it)
    setSending(true); setText(''); setReplyTo(null); setShowEmoji(false);
    clearTyping(chatId, user.uid, false).catch(()=>{});
    try {
      await sendMessage(chatId, user.uid, content, 'text',
        replyTo ? { replyTo: { id: replyTo.id, content: replyTo.content } } : {});
      pushToPartner(content, 'text');
    } catch (e) { console.error('Send failed:', e); toast.error('Failed to send'); }
    finally { setSending(false); }
  };

  // File (base64)
  const handleFile = async e => {
    const file = e.target.files[0];
    if (!file || !chatId) return;
    e.target.value = '';
    setShowAttach(false);
    if (file.size > 8 * 1024 * 1024) { toast.error('File too large (max 8MB)'); return; }
    if (blocked) { toast.error(`You blocked ${chatPartner.name}. Unblock to send files.`); return; }
    const isImage = file.type.startsWith('image/');
    const tid = toast.loading(isImage ? 'Sending image...' : 'Sending file...');
    try {
      const b64 = await new Promise((res, rej) => {
        const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file);
      });
      await sendMessage(chatId, user.uid, b64, isImage?'image':'file',
        { fileName: file.name, fileSize: `${(file.size/1024).toFixed(1)} KB` });
      pushToPartner(b64, isImage ? 'image' : 'file');
      toast.dismiss(tid);
    } catch { toast.dismiss(tid); toast.error('Failed to send file'); }
  };

  // Photo viewer — build list of all image messages and open at the clicked one
  const handleImageClick = useCallback((clickedMsg) => {
    // Build from messages directly (visible is defined later in render scope)
    const imgMsgs = messages
      .filter(m => !m.deletedFor?.includes(user.uid) && m.type === 'image' && m.content);
    const imgs = imgMsgs.map(m => ({
      content: m.content,
      fileName: m.fileName || 'photo.jpg',
      senderName: m.senderId === user.uid ? 'You' : chatPartner?.name || 'Them',
      ts: m.timestamp?.toDate
        ? m.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : '',
    }));
    const startIndex = imgMsgs.findIndex(m => m.id === clickedMsg.id);
    setPhotoViewer({ images: imgs, startIndex: Math.max(0, startIndex) });
  }, [messages, user?.uid, chatPartner]);

  // Camera capture — close camera immediately, then send in background
  const handleCameraCapture = async (dataUrl) => {
    setShowCamera(false);   // ← close immediately on capture
    if (!chatId || !dataUrl) return;
    if (blocked) { toast.error(`You blocked ${chatPartner.name}. Unblock first.`); return; }
    const tid = toast.loading('Sending photo...');
    try {
      await sendMessage(chatId, user.uid, dataUrl, 'image', { fileName: 'camera.jpg' });
      pushToPartner(dataUrl, 'image');
      toast.dismiss(tid);
    } catch { toast.dismiss(tid); toast.error('Failed to send photo'); }
  };

  // Voice (base64)
  const handleVoice = async (blob, dur) => {
    setShowVoice(false);
    if (!chatId || !blob) return;
    if (blocked) { toast.error(`You blocked ${chatPartner.name}. Unblock first.`); return; }
    const tid = toast.loading('Sending voice note...');
    try {
      const b64 = await new Promise((res, rej) => {
        const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob);
      });
      await sendMessage(chatId, user.uid, b64, 'voice', { duration: dur });
      pushToPartner(b64, 'voice');
      toast.dismiss(tid);
    } catch { toast.dismiss(tid); toast.error('Failed to send voice note'); }
  };

  // Delete single msg
  const handleDelete = async (msg, forAll) => {
    if (!chatId) return;
    try {
      if (forAll) { await deleteMessageForEveryone(chatId, msg.id, false); toast.success('Deleted for everyone'); }
      else await deleteMessageForMe(chatId, msg.id, user.uid, false);
    } catch { toast.error('Delete failed'); }
  };

  // Delete selected msgs
  const handleDeleteSelected = async (forAll = false) => {
    if (!chatId || !selectedMsgs.length) return;
    const ids = selectedMsgs.map(m => m.id);
    try {
      await deleteMultipleMessages(chatId, ids, user.uid, forAll, false);
      toast.success(`${ids.length} message${ids.length>1?'s':''} deleted`);
    } catch { toast.error('Delete failed'); }
    exitSelectionMode();
  };

  // Edit save
  const handleEditSave = async () => {
    if (!editingMsg || !editText.trim() || !chatId) return;
    await editMessage(chatId, editingMsg.id, editText.trim(), false).catch(()=>{});
    setEditingMsg(null); setEditText('');
  };

  // Mute
  const handleMute = async () => {
    if (!chatId) return;
    const next = !muted;
    setMuted(next);
    await muteChat(user.uid, chatId, next).catch(()=>{});
    toast.success(next ? 'Chat muted' : 'Chat unmuted');
    setShowMenu(false);
  };

  // Block / Unblock — silent, no system message visible to the other person
  const handleBlock = async () => {
    const newBlocked = !blocked;
    const ok = await askConfirm({
      title: newBlocked ? `Block ${chatPartner.name}?` : `Unblock ${chatPartner.name}?`,
      message: newBlocked
        ? `${chatPartner.name} won't be able to send you messages.`
        : `${chatPartner.name} will be able to message you again.`,
      label: newBlocked ? 'Block' : 'Unblock',
      danger: newBlocked,
    });
    if (!ok) return;
    try {
      await blockUser(user.uid, chatPartner.id, newBlocked);
      toast.success(newBlocked ? chatPartner.name + ' blocked' : chatPartner.name + ' unblocked');
    } catch { toast.error('Action failed'); }
    setShowMenu(false);
  };

  // Clear chat
  const handleClearChat = async () => {
    if (!chatId) return;
    const ok = await askConfirm({
      title: 'Clear Chat?',
      message: 'All messages will be removed for you only. This cannot be undone.',
      label: 'Clear Chat',
      danger: true,
    });
    if (!ok) return;
    await clearChat(chatId, user.uid, false).catch(()=>{});
    toast.success('Chat cleared');
    setShowMenu(false);
  };

  // Reaction
  const handleReaction = (msgId, emoji) => {
    if (!chatId || !msgId) return;
    addReaction(chatId, msgId, user.uid, emoji, false)
      .then(() => {})
      .catch(err => {
        console.error('Reaction error:', err);
        toast.error('Could not add reaction');
      });
  };

  // Forward
  const handleForward = async (targets) => {
    const msgs = forwardMsgs?.length ? forwardMsgs : (selectedMsg ? [selectedMsg] : []);
    // Clear state immediately so sheets close
    setForwardMsgs(null);
    setSelectedMsg(null);
    exitSelectionMode();
    if (!msgs.length || !targets.length) return;
    const tid = toast.loading('Forwarding…');
    try {
      await Promise.all(msgs.map(msg => forwardMessage(msg, targets, user.uid)));
      toast.success(
        `Forwarded to ${targets.length} chat${targets.length > 1 ? 's' : ''}!`,
        { id: tid }
      );
    } catch (e) {
      console.error('Forward failed:', e);
      toast.error('Failed to forward', { id: tid });
    }
  };

  // Multi-select
  const enterSelectionMode = (msg) => {
    setSelectionMode(true);
    setSelectedMsgs([msg]);
    setSelectedMsg(null);
  };
  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedMsgs([]);
  };
  const toggleMsgSelect = (msg) => {
    setSelectedMsgs(prev => {
      const exists = prev.find(m => m.id === msg.id);
      return exists ? prev.filter(m => m.id !== msg.id) : [...prev, msg];
    });
  };

  // Filters
  const visible = messages
    .filter(m => !m.deletedFor?.includes(user.uid))
    .filter(m => !searchQ || m.content?.toLowerCase().includes(searchQ.toLowerCase()));

  // Last seen label — RTDB stores timestamps as ms numbers
  const formatLastSeen = ts => {
    if (!ts) return 'Family & Friends';
    // RTDB serverTimestamp() comes back as ms when read via onValue
    const ms = typeof ts === 'number' ? ts : Number(ts);
    if (!ms || isNaN(ms)) return 'Family & Friends';
    const d = new Date(ms);
    const now = Date.now();
    const diffMs = now - ms;
    // Guard against clock skew (future timestamps)
    if (diffMs < 0) return 'last seen just now';
    if (diffMs < 45000) return 'last seen just now';
    if (diffMs < 3600000) return `last seen ${Math.floor(diffMs/60000)}m ago`;
    const todayStart = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime();
    if (ms >= todayStart) return `last seen today at ${d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`;
    const yestStart = todayStart - 86400000;
    if (ms >= yestStart) return `last seen yesterday at ${d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`;
    return `last seen ${d.toLocaleDateString([],{day:'numeric',month:'short'})}`;
  };

  const presenceLabel = isOnline ? 'online' : formatLastSeen(lastSeen);
  const isBlocking = blocked; // only disable UI when I blocked them
  const closeAll = () => { setShowMenu(false); setShowAttach(false); setShowEmoji(false); };

  // ── UnifyAI helpers ────────────────────────────────────────
  const getAIContext = () => ({
    type: 'chat',
    data: {
      messages: messages.map(m => ({
        ...m,
        isOwn: m.senderId === user.uid,
        senderName: m.senderId === user.uid ? profile?.name : chatPartner?.name,
      })),
      partnerName: chatPartner?.name,
      chatId,
    },
  });

  const handleOpenOverlay = () => openOverlay(getAIContext());
  const handleOpenVoice   = () => openVoiceAI();

  const handleSummarize = async () => {
    setShowMenu(false);
    const cached = getSummaryCache(chatId);
    if (cached) { setUnifiedAnswer({ unified: cached, loading: false, contextType: 'summary', responses: {} }); return; }
    setSummaryLoading(true);
    setUnifiedAnswer({ loading: true, responses: {}, unified: null, contextType: 'summary' });
    try {
      const msgsWithNames = messages.map(m => ({
        ...m,
        senderName: m.senderId === user.uid ? profile?.name : chatPartner?.name,
      }));
      const transcript = msgsWithNames.slice(-15)
        .map(m => `${m.senderName}: ${m.content?.slice(0, 80) || '[media]'}`)
        .join('\n');
      await unifiedAnswer({
        prompt: `Summarize this conversation with "${chatPartner?.name || 'contact'}" in 2-3 sentences. Topics, decisions, mood.\n\n${transcript}`,
        system: 'Brief insightful summary. Flowing prose, max 3 sentences.',
        onModelResult: (r) => {
          setUnifiedAnswer(prev => prev ? { ...prev, responses: { ...prev.responses, [r.id]: r } } : prev);
        },
        onUnifiedStart: () => {
          setUnifiedAnswer(prev => prev ? { ...prev, loading: true } : prev);
        },
        onDone: (merged) => {
          setUnifiedAnswer(prev => prev ? { ...prev, loading: false, unified: merged } : prev);
          setSummaryCache(chatId, merged);
        },
      });
    } catch (e) {
      setUnifiedAnswer({ text: null, loading: false, error: 'Could not summarize. Try again.', contextType: 'summary' });
    } finally {
      setSummaryLoading(false);
    }
  };

  const handleImageClickWithAI = (img) => {
    handleImageClick(img);
    // Optionally trigger AI analysis
    if (img?.src) {
      setMediaAIImage(img.src);
    }
  };

  // ══════════════════════════════════════════════════
  return (
    <div className="flex flex-col h-full chat-bg relative" style={{ background: wallpaperBg }} onClick={closeAll}>

      {/* SELECTION BAR */}
      {selectionMode && (
        <SelectionBar
          count={selectedMsgs.length}
          onCancel={exitSelectionMode}
          onDeleteMe={() => handleDeleteSelected(false)}
          onDeleteAll={() => handleDeleteSelected(true)}
          onForward={() => { setForwardMsgs(selectedMsgs); }}
        />
      )}

      {/* HEADER */}
      <div className={`flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] bg-[var(--sidebar-bg)] flex-shrink-0 ${selectionMode?'pt-16':''}`}
        onClick={e => e.stopPropagation()}>
        <button onClick={onBack} className="lg:hidden w-9 h-9 rounded-xl hover:bg-[var(--hover)] flex items-center justify-center">
          <ArrowLeft size={20} className="text-[var(--text-secondary)]"/>
        </button>
        <div className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer" onClick={() => setShowContactInfo(true)}>
          <div className="relative flex-shrink-0">
            {chatPartner.avatar
              ? <img src={chatPartner.avatar} alt="" className="w-10 h-10 rounded-full object-cover"/>
              : <div className="w-10 h-10 rounded-full bg-brand-500 flex items-center justify-center text-white font-bold">{chatPartner.name?.[0]?.toUpperCase()}</div>}
            <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[var(--sidebar-bg)] transition-colors ${isOnline?'bg-green-500':'bg-gray-400'}`}/>
          </div>
          <div className="min-w-0">
            <p className="font-bold text-[var(--text-primary)] truncate text-[15px] leading-tight">{chatPartner.name}</p>
            <p className="text-xs truncate">
              {partnerTyping
                ? <span className="text-brand-500 italic">typing...</span>
                : <span className="text-[var(--text-secondary)]">{presenceLabel}</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => { setShowSearch(v=>!v); setSearchQ(''); }} className="w-9 h-9 rounded-xl hover:bg-[var(--hover)] flex items-center justify-center">
            <Search size={18} className="text-[var(--text-secondary)]"/>
          </button>
          <button onClick={() => onVoiceCall?.(chatPartner)} className="w-9 h-9 rounded-xl hover:bg-[var(--hover)] flex items-center justify-center">
            <Phone size={18} className="text-[var(--text-secondary)]"/>
          </button>
          <button onClick={() => onVideoCall?.(chatPartner)} className="w-9 h-9 rounded-xl hover:bg-[var(--hover)] flex items-center justify-center">
            <Video size={18} className="text-[var(--text-secondary)]"/>
          </button>
          <div className="relative">
            <button onClick={e => { e.stopPropagation(); setShowMenu(v=>!v); }}
              className="w-9 h-9 rounded-xl hover:bg-[var(--hover)] flex items-center justify-center">
              <MoreVertical size={18} className="text-[var(--text-secondary)]"/>
            </button>
            {showMenu && (
              <div className="absolute right-0 top-10 bg-[var(--sidebar-bg)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden z-50 min-w-[190px] animate-slide-down"
                onClick={e => e.stopPropagation()}>
                {[
                  { label: '✨ Ask UnifyAI', action: () => { setShowMenu(false); handleOpenOverlay(); } },
                  { label: '📋 Summarize Chat', action: handleSummarize },
                  { label: muted ? '🔔 Unmute' : '🔕 Mute', action: handleMute },
                  { label: '🎨 Wallpaper', action: () => { onOpenSettings?.('appearance'); setShowMenu(false); } },
                  { label: '🗑 Clear Chat', action: handleClearChat },
                  { label: blocked ? '✅ Unblock' : '🚫 Block', action: handleBlock, danger: !blocked },
                ].map(item => (
                  <button key={item.label} onClick={item.action}
                    className={`w-full text-left px-4 py-3 text-sm hover:bg-[var(--hover)] transition-colors ${item.danger?'text-red-400':'text-[var(--text-primary)]'}`}>
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SEARCH BAR */}
      {showSearch && (
        <div className="px-4 py-2 bg-[var(--sidebar-bg)] border-b border-[var(--border)] flex items-center gap-2 animate-slide-down flex-shrink-0">
          <Search size={15} className="text-[var(--text-secondary)] flex-shrink-0"/>
          <input autoFocus value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search messages..."
            className="flex-1 bg-transparent text-[var(--text-primary)] text-sm outline-none placeholder:text-[var(--text-secondary)]"/>
          <button onClick={() => { setShowSearch(false); setSearchQ(''); }}>
            <X size={15} className="text-[var(--text-secondary)]"/>
          </button>
        </div>
      )}

      {/* Blocked banner — only shown when YOU blocked them, never revealed to the blocked person */}
      {blocked && (
        <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20 flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-red-400 flex-1">
            You blocked {chatPartner.name}. They cannot send you messages.
          </span>
          <button onClick={handleBlock} className="text-xs text-red-400 underline font-medium">Unblock</button>
        </div>
      )}

      {/* MESSAGES */}
      <div className="flex-1 overflow-y-auto px-4 py-3" style={{scrollbarWidth:'thin'}}>
        {visible.map(msg => (
          <MessageBubble
            key={msg.id} msg={msg}
            isOwn={msg.senderId === user.uid}
            selected={selectedMsgs.some(m => m.id === msg.id)}
            selectionMode={selectionMode}
            onSelect={selectionMode ? toggleMsgSelect : enterSelectionMode}
            onLongPress={msg => {
              if (!selectionMode) { setSelectedMsg(msg); }
              else enterSelectionMode(msg);
            }}
            onReaction={handleReaction}
            onImageClick={handleImageClick}/>
        ))}
        {partnerTyping && (
          <div className="flex justify-start mb-1 animate-fade-in">
            <div className="bg-[var(--input-bg)] rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5">
              {[0,1,2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-brand-400" style={{animation:`bounce 1s infinite ${i*0.15}s`}}/>)}
            </div>
          </div>
        )}
        <div ref={bottomRef}/>
      </div>

      {/* UNIFY AI — Summary Answer Card */}
      {unifiedAnswer && (
        <div className="px-3 pt-2 flex-shrink-0">
          <UnifiedAnswerCard
            title={unifiedAnswer.contextType === 'summary' ? 'Chat Summary' : 'UnifyAI'}
            responses={unifiedAnswer.responses}
            unified={unifiedAnswer.unified}
            unifiedLoading={unifiedAnswer.loading}
            text={unifiedAnswer.text}
            loading={unifiedAnswer.loading}
            error={unifiedAnswer.error}
            onClose={clearUnifiedAnswer}
          />
        </div>
      )}

      {/* REPLY PREVIEW */}
      {replyTo && (
        <div className="mx-4 mb-1 flex items-center gap-2 bg-brand-500/10 border-l-4 border-brand-500 rounded-r-xl px-3 py-2 flex-shrink-0 animate-slide-up">
          <Reply size={14} className="text-brand-500 flex-shrink-0"/>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold text-brand-500">Replying</p>
            <p className="text-xs text-[var(--text-secondary)] truncate">{replyTo.content?.slice(0,80)||'📎 Media'}</p>
          </div>
          <button onClick={() => setReplyTo(null)}><X size={14} className="text-[var(--text-secondary)]"/></button>
        </div>
      )}

      {/* EDIT BAR */}
      {editingMsg && (
        <div className="mx-4 mb-1 flex items-center gap-2 bg-blue-500/10 border-l-4 border-blue-500 rounded-r-xl px-3 py-2 flex-shrink-0 animate-slide-up">
          <Edit3 size={14} className="text-blue-400 flex-shrink-0"/>
          <input value={editText} onChange={e => setEditText(e.target.value)} autoFocus
            onKeyDown={e => { if(e.key==='Enter') handleEditSave(); if(e.key==='Escape') { setEditingMsg(null); setEditText(''); } }}
            className="flex-1 bg-transparent text-[var(--text-primary)] text-sm outline-none"/>
          <button onClick={handleEditSave} className="text-blue-400 font-bold text-xs px-2 py-1 rounded-lg hover:bg-blue-500/10 transition-all">Save</button>
          <button onClick={() => { setEditingMsg(null); setEditText(''); }}><X size={14} className="text-[var(--text-secondary)]"/></button>
        </div>
      )}

      {/* UNIFY AI CHAT BAR */}
      {!isBlocking && !showVoice && (
        <div className="border-t border-[var(--border)] bg-[var(--sidebar-bg)] flex-shrink-0"
          onClick={e => e.stopPropagation()}>
          <UnifyAIChatBar
            messages={messages.map(m => ({
              ...m,
              isOwn: m.senderId === user.uid,
              senderName: m.senderId === user.uid ? profile?.name : chatPartner?.name,
            }))}
            myName={profile?.name}
            onReply={r => setText(r)}
            onOpenOverlay={handleOpenOverlay}
            onOpenVoice={handleOpenVoice}
            context={{ chatId }}
          />
        </div>
      )}

      {/* INPUT BAR */}
      <div className="px-3 py-3 border-t border-[var(--border)] bg-[var(--sidebar-bg)] flex-shrink-0"
        onClick={e => e.stopPropagation()}>
        {showVoice ? (
          <VoiceRecorder onSend={handleVoice} onCancel={() => setShowVoice(false)}/>
        ) : (
          <div className="flex items-end gap-2">
            {/* Attach */}
            <div className="relative flex-shrink-0">
              <button onClick={() => { setShowAttach(v=>!v); setShowEmoji(false); }}
                className="w-10 h-10 rounded-full hover:bg-[var(--hover)] flex items-center justify-center text-[var(--text-secondary)] transition-colors">
                <Paperclip size={20}/>
              </button>
              {showAttach && (
                <div className="absolute bottom-12 left-0 bg-[var(--sidebar-bg)] border border-[var(--border)] rounded-2xl shadow-2xl p-3 grid grid-cols-3 gap-2 w-48 animate-scale-in z-10">
                  {/* Photo from gallery */}
                  <label className="flex flex-col items-center gap-1.5 cursor-pointer group">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center group-hover:scale-105 transition-transform" style={{background:'#8b5cf622'}}>
                      <Image size={20} style={{color:'#8b5cf6'}}/>
                    </div>
                    <span className="text-[11px] text-[var(--text-secondary)]">Photo</span>
                    <input type="file" accept="image/*" className="hidden" onChange={handleFile}/>
                  </label>
                  {/* Camera — uses our custom CameraCapture UI */}
                  <button className="flex flex-col items-center gap-1.5 group"
                    onClick={() => { setShowAttach(false); setShowCamera(true); }}>
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center group-hover:scale-105 transition-transform" style={{background:'#0ea5e922'}}>
                      <Camera size={20} style={{color:'#0ea5e9'}}/>
                    </div>
                    <span className="text-[11px] text-[var(--text-secondary)]">Camera</span>
                  </button>
                  {/* Document */}
                  <label className="flex flex-col items-center gap-1.5 cursor-pointer group">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center group-hover:scale-105 transition-transform" style={{background:'#f9731622'}}>
                      <FileText size={20} style={{color:'#f97316'}}/>
                    </div>
                    <span className="text-[11px] text-[var(--text-secondary)]">Document</span>
                    <input type="file" accept="*/*" className="hidden" onChange={handleFile}/>
                  </label>
                </div>
              )}
            </div>

            {/* Text + emoji */}
            <div className="flex-1 flex items-end bg-[var(--input-bg)] border border-[var(--border)] rounded-2xl px-3 py-2.5 gap-2 focus-within:border-brand-400 transition-all relative">
              <div className="relative flex-shrink-0 self-center">
                <button onClick={e => { e.stopPropagation(); setShowEmoji(v=>!v); setShowAttach(false); }}
                  className="text-[var(--text-secondary)] hover:text-brand-500 transition-colors">
                  <Smile size={20}/>
                </button>
                {showEmoji && (
                  <EmojiPicker
                    onSelect={e => { setText(t => t+e); inputRef.current?.focus(); }}
                    onClose={() => setShowEmoji(false)}/>
                )}
              </div>
              <textarea ref={inputRef} value={text}
                onChange={e => handleTextChange(e.target.value)}
                onKeyDown={e => { if(e.key==='Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder={isBlocking ? 'Chat is blocked' : 'Message'}
                disabled={isBlocking}
                rows={1}
                className="flex-1 bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] resize-none outline-none text-[15px] max-h-32 leading-relaxed self-center disabled:opacity-50"
                style={{scrollbarWidth:'none'}}/>
            </div>

            {/* Send / Mic */}
            {text.trim() ? (
              <button onClick={handleSend} disabled={sending || isBlocking}
                className="w-10 h-10 rounded-full bg-brand-500 hover:bg-brand-600 flex items-center justify-center transition-all flex-shrink-0 shadow-lg shadow-brand-900/20 active:scale-95 disabled:opacity-50">
                <Send size={18} className="text-white"/>
              </button>
            ) : (
              <button onClick={() => { if (!isBlocking) setShowVoice(true); }}
                disabled={isBlocking}
                className="w-10 h-10 rounded-full bg-brand-500 hover:bg-brand-600 flex items-center justify-center transition-all flex-shrink-0 shadow-lg shadow-brand-900/20 active:scale-95 disabled:opacity-50">
                <Mic size={18} className="text-white"/>
              </button>
            )}
          </div>
        )}
      </div>

      {/* MESSAGE MENU */}
      {selectedMsg && !selectionMode && (
        <MsgMenu
          msg={selectedMsg}
          isOwn={selectedMsg.senderId === user.uid}
          onClose={() => setSelectedMsg(null)}
          onReply={() => { setReplyTo(selectedMsg); setSelectedMsg(null); }}
          onEdit={() => { setEditingMsg(selectedMsg); setEditText(selectedMsg.content); setSelectedMsg(null); }}
          onDeleteMe={() => handleDelete(selectedMsg, false)}
          onDeleteAll={() => handleDelete(selectedMsg, true)}
          onForward={() => { setForwardMsgs([selectedMsg]); setSelectedMsg(null); }}
          onReact={handleReaction}/>
      )}

      {/* FORWARD SHEET */}
      {forwardMsgs && (
        <ForwardSheet
          msgs={forwardMsgs}
          contacts={ownContacts}
          groups={ownGroups}
          currentChat={chatPartner}
          onClose={() => setForwardMsgs(null)}
          onForward={handleForward}/>
      )}

      {/* CAMERA CAPTURE */}
      {showCamera && (
        <CameraCapture
          onCapture={handleCameraCapture}
          onClose={() => setShowCamera(false)}/>
      )}

      {/* PHOTO VIEWER */}
      {photoViewer && photoViewer.images.length > 0 && (
        <PhotoViewer
          images={photoViewer.images}
          startIndex={photoViewer.startIndex}
          onClose={() => setPhotoViewer(null)}/>
      )}

      {/* CONFIRM SHEET */}
      {confirmSheet && (
        <ConfirmSheet
          title={confirmSheet.title}
          message={confirmSheet.message}
          confirmLabel={confirmSheet.label}
          confirmDanger={confirmSheet.danger}
          onConfirm={confirmSheet.onConfirm}
          onCancel={confirmSheet.onCancel}/>
      )}

      {/* CONTACT INFO PANEL */}
      {showContactInfo && (
        <ContactInfoPanel
          partner={chatPartner}
          isOnline={isOnline}
          presenceLabel={presenceLabel}
          onClose={() => setShowContactInfo(false)}/>
      )}

      {/* UNIFYAI OVERLAYS */}
      <UnifyAIOverlay />
      <VoiceAI />

      {/* MEDIA AI SHEET */}
      {showMediaAI && mediaAIImage && (
        <>
          <div className="fixed inset-0 z-[350]" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
            onClick={() => setShowMediaAI(false)}/>
          <div className="fixed bottom-0 left-0 right-0 z-[351] rounded-t-3xl overflow-y-auto p-4"
            style={{ maxHeight: '85vh', background: 'rgba(14,14,14,0.95)', backdropFilter: 'blur(40px)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles size={15} style={{ color: '#d0bcff' }}/>
                <span className="font-bold text-[15px]" style={{ color: '#d0bcff', fontFamily: 'Geist, system-ui' }}>Media Intelligence</span>
              </div>
              <button onClick={() => setShowMediaAI(false)} className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.06)' }}>
                <X size={15} style={{ color: 'rgba(229,226,225,0.7)' }}/>
              </button>
            </div>
            <MediaIntelligence imageBase64={mediaAIImage} onClose={() => setShowMediaAI(false)} />
          </div>
        </>
      )}
    </div>
  );
}
