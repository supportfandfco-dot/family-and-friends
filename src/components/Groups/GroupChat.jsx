// ═══════════════════════════════════════════════════════
//  GroupChat — Group Conversations
//  Family & Friends  ·  Built by Ishrit Sachdeva
// ═══════════════════════════════════════════════════════
import { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import {
  db, createGroup, sendGroupMessage, subscribeToGroupMessages, subscribeToGroups,
  setTyping, clearTyping, markMessagesRead,
  deleteMessageForMe, deleteMessageForEveryone, deleteMultipleMessages,
  editMessage, forwardMessage, clearChat, exitGroupWithNotice,
  removeGroupMember, addGroupMember, updateGroupDescription,
  getUserById, addReaction, sendPushNotification, makePreview,
  doc, onSnapshot, updateDoc, serverTimestamp, uploadMedia
} from '../../firebase';
import {
  ArrowLeft, Users, MoreVertical, Send, Mic, Paperclip,
  Image, Plus, X, Check, Crown, Camera, Search, Smile,
  FileText, Edit3, Trash2, Reply, Share2, CheckCheck,
  UserMinus, UserPlus, ZoomIn, ChevronLeft, ChevronRight, Download,
  Phone, Video, Sparkles, ListTodo, Target, Clock, Calendar
} from 'lucide-react';
import toast from 'react-hot-toast';
import { VoiceRecorder, VoiceMessage } from '../Chat/VoiceNote';
import UnifyAIOverlay from '../../ai/UnifyAIOverlay';
import UnifyAIChatBar from '../../ai/UnifyAIChatBar';
import UnifiedAnswerCard from '../../ai/UnifiedAnswerCard';
import GroupVirtualList from './GroupVirtualList';
import { GroupMsgBubble } from './GroupMsgBubble';
import VoiceAI from '../../ai/VoiceAI';
import MediaIntelligence from '../../ai/MediaIntelligence';
import useAIStore from '../../ai/useAIStore';
import { analyzeGroupPulse, summarizeMessages, askUnify } from '../../ai/unifyService';
import CameraCapture from '../Camera/CameraCapture';
import { formatMsgTime } from '../../utils/timestamp';

// ── Shared emoji data ──────────────────────────────────
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
const QUICK_REACTIONS = ['❤️','😂','😮','😢','😡','👍','👎','🙏'];

// ── Create Group Modal ─────────────────────────────────
export function CreateGroupModal({ contacts, onClose, onCreate }) {
  const { user } = useAuth();
  const [step, setStep]           = useState('select');
  const [selected, setSelected]   = useState([]);
  const [groupName, setGroupName] = useState('');
  const [groupPhoto, setGroupPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [loading, setLoading]     = useState(false);
  const fileRef = useRef(null);

  const toggle = id => setSelected(p => p.includes(id) ? p.filter(x=>x!==id) : [...p,id]);

  const handleCreate = async () => {
    if (!groupName.trim()) return toast.error('Enter a group name');
    if (selected.length === 0) return toast.error('Add at least one member');
    setLoading(true);
    try {
      let photoURL = null;
      if (groupPhoto) {
        photoURL = await new Promise((res,rej) => {
          const r = new FileReader(); r.onload = ()=>res(r.result); r.onerror=rej; r.readAsDataURL(groupPhoto);
        });
      }
      const gid = await createGroup(groupName, user.uid, selected, photoURL);
      toast.success(`Group "${groupName}" created!`);
      onCreate?.(gid);
      onClose?.();
    } catch { toast.error('Failed to create group'); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in"
      onClick={e => e.target === e.currentTarget && onClose?.()}>
      <div className="bg-[var(--sidebar-bg)] border border-[var(--border)] rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-bounce-in">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-3">
            {step === 'details' && (
              <button onClick={() => setStep('select')} className="w-8 h-8 rounded-full hover:bg-[var(--hover)] flex items-center justify-center">
                <ArrowLeft size={16} className="text-[var(--text-secondary)]"/>
              </button>
            )}
            <div className="w-9 h-9 rounded-2xl bg-brand-500/10 flex items-center justify-center">
              <Users size={18} className="text-brand-500"/>
            </div>
            <div>
              <h2 className="font-display font-semibold text-[var(--text-primary)]">{step==='select'?'New Group':'Group Details'}</h2>
              <p className="text-xs text-[var(--text-secondary)]">{step==='select'?`${selected.length} selected`:'Name your group'}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-[var(--hover)] flex items-center justify-center">
            <X size={16} className="text-[var(--text-secondary)]"/>
          </button>
        </div>

        {step === 'select' && (
          <div>
            {selected.length > 0 && (
              <div className="flex gap-2 overflow-x-auto px-4 py-3 border-b border-[var(--border)]">
                {selected.map(id => {
                  const c = contacts.find(x=>x.id===id);
                  return c ? (
                    <button key={id} onClick={() => toggle(id)}
                      className="flex-shrink-0 flex items-center gap-1.5 bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 rounded-full px-3 py-1 text-sm">
                      {c.name} <X size={12}/>
                    </button>
                  ) : null;
                })}
              </div>
            )}
            <div className="max-h-64 overflow-y-auto">
              {contacts.length === 0 ? (
                <p className="text-center py-8 text-[var(--text-secondary)] text-sm">Add contacts first</p>
              ) : contacts.map(c => (
                <button key={c.id} onClick={() => toggle(c.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--hover)] transition-all">
                  <div className="relative">
                    {c.avatar ? <img src={c.avatar} alt="" className="w-10 h-10 rounded-full object-cover"/>
                      : <div className="w-10 h-10 rounded-full bg-brand-500 flex items-center justify-center text-white font-bold">{c.name?.[0]?.toUpperCase()}</div>}
                    {selected.includes(c.id) && (
                      <div className="absolute inset-0 rounded-full bg-brand-500/70 flex items-center justify-center">
                        <Check size={16} className="text-white"/>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-medium text-[var(--text-primary)]">{c.name}</p>
                    <p className="text-xs text-[var(--text-secondary)]">{c.about||c.phone}</p>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${selected.includes(c.id)?'bg-brand-500 border-brand-500':'border-[var(--border)]'}`}>
                    {selected.includes(c.id) && <Check size={12} className="text-white"/>}
                  </div>
                </button>
              ))}
            </div>
            <div className="p-4 border-t border-[var(--border)]">
              <button onClick={() => setStep('details')} disabled={selected.length===0}
                className="w-full py-3 rounded-2xl bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white font-semibold transition-all flex items-center justify-center gap-2">
                Next <ArrowLeft size={16} className="rotate-180"/>
              </button>
            </div>
          </div>
        )}

        {step === 'details' && (
          <div className="p-6 space-y-5">
            <div className="flex justify-center">
              <div className="relative">
                <div className="w-20 h-20 rounded-2xl overflow-hidden border-2 border-brand-400 cursor-pointer"
                  onClick={() => fileRef.current?.click()}>
                  {photoPreview ? <img src={photoPreview} alt="" className="w-full h-full object-cover"/>
                    : <div className="w-full h-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center"><Users size={28} className="text-brand-500"/></div>}
                </div>
                <button onClick={() => fileRef.current?.click()}
                  className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-brand-500 flex items-center justify-center border-2 border-[var(--sidebar-bg)]">
                  <Camera size={12} className="text-white"/>
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden"
                  onChange={e => { const f=e.target.files[0]; if(f){setGroupPhoto(f);setPhotoPreview(URL.createObjectURL(f));} }}/>
              </div>
            </div>
            <div>
              <label className="text-xs text-[var(--text-secondary)] font-medium mb-1.5 block">Group Name *</label>
              <input type="text" value={groupName} onChange={e=>setGroupName(e.target.value)}
                placeholder="e.g. Family Chat, Squad 🎉" maxLength={50}
                className="w-full bg-[var(--input-bg)] border border-[var(--border)] rounded-2xl px-4 py-3 text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] outline-none focus:border-brand-500 transition-all"/>
            </div>
            <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <Users size={14}/><span>{selected.length+1} participants (including you)</span>
            </div>
            <button onClick={handleCreate} disabled={loading || !groupName.trim()}
              className="w-full py-3 rounded-2xl bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white font-display font-semibold transition-all flex items-center justify-center gap-2">
              {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : <><Check size={18}/> Create Group</>}
            </button>
          </div>
        )}
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
        <button onClick={onClose}><X size={13} className="text-[var(--text-secondary)]"/></button>
      </div>
      <div className="flex gap-0.5 px-2 mb-2 overflow-x-auto">
        {Object.keys(EMOJI_CATEGORIES).map(c => (
          <button key={c} onClick={() => setCat(c)}
            className={`text-xs px-2 py-1 rounded-lg flex-shrink-0 transition-all ${cat===c?'bg-brand-500 text-white':'text-[var(--text-secondary)] hover:bg-[var(--hover)]'}`}>
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

// ── Confirm Sheet ───────────────────────────────────────
function ConfirmSheet({ title, message, confirmLabel = 'Confirm', confirmDanger = false, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-[500] flex items-end justify-center animate-fade-in"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={onCancel}>
      <div className="bg-[var(--sidebar-bg)] rounded-t-3xl w-full max-w-sm pb-8 animate-sheet-up shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-[var(--border)] rounded-full mx-auto mt-3 mb-4"/>
        <div className="px-6 pb-2">
          <p className="text-base font-bold text-[var(--text-primary)] mb-1">{title}</p>
          {message && <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{message}</p>}
        </div>
        <div className="px-4 pt-3 flex flex-col gap-2">
          <button onClick={onConfirm}
            className={`w-full py-3.5 rounded-2xl font-semibold text-sm transition-all active:scale-[0.98] ${
              confirmDanger ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-brand-500 hover:bg-brand-600 text-white'
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

// ── Photo Viewer ────────────────────────────────────────
function PhotoViewer({ images, startIndex, onClose, onAnalyze }) {
  const [idx, setIdx]         = useState(startIndex);
  const [dir, setDir]         = useState(0);
  const [animating, setAnim]  = useState(false);
  const [imgLoaded, setLoaded]= useState(false);
  const [naturalSize, setNat] = useState({ w: 0, h: 0 });
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);
  const SWIPE_THRESHOLD = 50;
  const total = images.length;
  const cur   = images[idx];

  const onImgLoad = (e) => {
    setLoaded(true);
    setNat({ w: e.target.naturalWidth, h: e.target.naturalHeight });
  };

  const goTo = (newIdx, direction) => {
    if (animating || newIdx < 0 || newIdx >= total) return;
    setAnim(true);
    setDir(direction);
    setLoaded(false);
    setTimeout(() => {
      setIdx(newIdx);
      setDir(0);
      setTimeout(() => setAnim(false), 20);
    }, 220);
  };

  const prev = () => { if (idx > 0) goTo(idx - 1, -1); };
  const next = () => { if (idx < total - 1) goTo(idx + 1, 1); };

  useEffect(() => {
    const h = (e) => {
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [idx, animating]);

  const onTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };
  const onTouchEnd = (e) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > SWIPE_THRESHOLD) {
      if (dx < 0) next(); else prev();
    }
    touchStartX.current = null;
  };

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
    <div className="fixed inset-0 z-[400] flex items-center justify-center animate-fade-in"
      style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(8px)' }}
      onClick={onClose} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {isSmall && imgLoaded && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <img src={cur.content} alt="" className="absolute inset-0 w-full h-full object-cover scale-110"
            style={{ filter: 'blur(30px) brightness(0.3)', opacity: 0.8 }}/>
        </div>
      )}
      <div className="relative max-w-full max-h-full flex items-center justify-center p-4"
        style={{ width: '100vw', height: '100vh' }} onClick={e => e.stopPropagation()}>
        <img key={idx} src={cur.content} alt={`Photo ${idx + 1}`} onLoad={onImgLoad}
          className="max-w-full max-h-full rounded-2xl shadow-2xl select-none"
          style={{ maxWidth:'95vw', maxHeight:'92vh', objectFit:'contain',
            transition:'transform 0.22s cubic-bezier(0.4,0,0.2,1), opacity 0.22s ease', ...slideStyle }}
          draggable={false}/>
        {!imgLoaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin"/>
          </div>
        )}
      </div>
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-4 z-10"
        style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)' }}
        onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="w-10 h-10 rounded-full bg-black/40 hover:bg-black/60 flex items-center justify-center text-white transition-all active:scale-95 backdrop-blur-sm">
          <X size={20}/>
        </button>
        <span className="text-white/70 text-sm font-medium">{total > 1 ? `${idx + 1} / ${total}` : ''}</span>
        <div className="flex gap-3 items-center">
          {onAnalyze && (
            <button onClick={() => { onClose(); onAnalyze(cur.content); }}
              className="w-9 h-9 rounded-full bg-brand-500 hover:bg-brand-400 flex items-center justify-center text-white transition-all active:scale-95 shadow-[0_0_15px_rgba(99,14,212,0.6)]">
              <Sparkles size={16}/>
            </button>
          )}
          <button onClick={downloadImg} className="w-10 h-10 rounded-full bg-black/40 hover:bg-black/60 flex items-center justify-center text-white transition-all active:scale-95 backdrop-blur-sm">
            <Download size={18}/>
          </button>
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 px-4 py-4 z-10"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.6), transparent)' }}
        onClick={e => e.stopPropagation()}>
        <p className="text-white/60 text-xs text-center">{cur.senderName} · {cur.ts}</p>
        {total > 1 && (
          <div className="flex justify-center gap-1.5 mt-2">
            {images.map((_, i) => (
              <button key={i} onClick={() => goTo(i, i > idx ? 1 : -1)}
                className={`rounded-full transition-all ${i === idx ? 'w-4 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-white/40 hover:bg-white/60'}`}/>
            ))}
          </div>
        )}
      </div>
      {idx > 0 && (
        <button onClick={e => { e.stopPropagation(); prev(); }}
          className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/40 hover:bg-black/70 flex items-center justify-center text-white transition-all active:scale-95 backdrop-blur-sm z-10">
          <ChevronLeft size={22}/>
        </button>
      )}
      {idx < total - 1 && (
        <button onClick={e => { e.stopPropagation(); next(); }}
          className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/40 hover:bg-black/70 flex items-center justify-center text-white transition-all active:scale-95 backdrop-blur-sm z-10">
          <ChevronRight size={22}/>
        </button>
      )}
    </div>
  );
}

// ── Message Menu ───────────────────────────────────────
function MsgMenu({ msg, isOwn, onClose, onReply, onEdit, onDeleteMe, onDeleteAll, onForward, onReact }) {
  const items = [
    { label:'Reply', icon:<Reply size={15} className="text-brand-500"/>, fn:onReply, show:msg.type!=='deleted' },
    { label:'Edit', icon:<Edit3 size={15} className="text-blue-400"/>, fn:onEdit, show:isOwn&&msg.type==='text' },
    { label:'Forward', icon:<Share2 size={15} className="text-purple-400"/>, fn:onForward, show:msg.type!=='deleted' },
    { label:'Delete for Me', icon:<Trash2 size={15} className="text-orange-400"/>, fn:onDeleteMe, show:true },
    { label:'Delete for Everyone', icon:<Trash2 size={15} className="text-red-500"/>, fn:onDeleteAll, show:isOwn&&msg.type!=='deleted', danger:true },
  ];
  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className="bg-[var(--sidebar-bg)] rounded-t-3xl w-full max-w-sm p-4 pb-8 animate-sheet-up" onClick={e=>e.stopPropagation()}>
        <div className="w-10 h-1 bg-[var(--border)] rounded-full mx-auto mb-4"/>
        <div className="flex justify-center gap-2 mb-4">
          {QUICK_REACTIONS.map(e => (
            <button key={e} onClick={() => { onReact(msg.id, e); onClose(); }}
              className="w-10 h-10 flex items-center justify-center text-2xl hover:scale-125 transition-transform rounded-full hover:bg-[var(--hover)]">
              {e}
            </button>
          ))}
        </div>
        <div className="h-px bg-[var(--border)] mb-2"/>
        <div className="space-y-0.5">
          {items.filter(i=>i.show).map(item => (
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
function ForwardSheet({ msgs, contacts, groups: allGroups, onClose, onForward }) {
  const [sel, setSel] = useState([]);
  const MAX = 8;
  const allTargets = [
    ...(contacts||[]).map(c => ({ id:c.id, name:c.name, avatar:c.avatar, isGroup:false, label:'Contact' })),
    ...(allGroups||[]).map(g => ({ id:g.id, name:g.name, avatar:g.photoURL, isGroup:true, label:'Group' })),
  ];
  const toggle = t => setSel(s => {
    const exists = s.find(x => x.id === t.id);
    if (exists) return s.filter(x => x.id !== t.id);
    if (s.length >= MAX) { toast.error(`Max ${MAX} chats`); return s; }
    return [...s, t];
  });
  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className="bg-[var(--sidebar-bg)] rounded-t-3xl w-full max-w-sm p-4 pb-8 animate-sheet-up max-h-[65vh] flex flex-col" onClick={e=>e.stopPropagation()}>
        <div className="w-10 h-1 bg-[var(--border)] rounded-full mx-auto mb-3"/>
        <div className="flex items-center justify-between mb-3">
          <p className="font-bold text-[var(--text-primary)]">Forward {msgs?.length > 1 ? `${msgs.length} messages` : 'message'}</p>
          <span className="text-xs text-[var(--text-secondary)]">{sel.length}/{MAX} selected</span>
        </div>
        <div className="flex-1 overflow-y-auto space-y-0.5">
          {allTargets.map(t => {
            const isSel = sel.find(x => x.id === t.id);
            return (
              <button key={t.id+t.isGroup} onClick={() => toggle(t)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-all text-sm ${isSel?'bg-brand-500/10 border border-brand-500/30':'hover:bg-[var(--hover)]'}`}>
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${isSel?'bg-brand-500':t.isGroup?'bg-gradient-to-br from-brand-500 to-brand-700':'bg-gray-400'}`}>
                  {isSel ? <Check size={14}/> : t.avatar ? <img src={t.avatar} className="w-full h-full rounded-full object-cover" alt=""/> : t.name?.[0]?.toUpperCase()}
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
            className="mt-3 w-full py-3.5 rounded-2xl bg-brand-500 hover:bg-brand-600 text-white font-semibold transition-all">
            Forward to {sel.length} chat{sel.length>1?'s':''}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Group Info Panel ───────────────────────────────────
function GroupInfoPanel({ group, memberProfiles, isAdmin, currentUserId, contacts: propContacts, onClose, onMemberRemove, onMemberAdd }) {
  const { profile } = useAuth();
  const [desc, setDesc]               = useState(group.description || '');
  const [editingDesc, setEditingDesc] = useState(false);
  const [saving, setSaving]           = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [addSearch, setAddSearch]     = useState('');
  // Load contacts fresh when panel opens — don't rely on prop being populated
  const [allContacts, setAllContacts] = useState(propContacts || []);
  useEffect(() => {
    if (propContacts?.length) { setAllContacts(propContacts); return; }
    if (!profile?.contacts?.length) return;
    Promise.all(profile.contacts.map(id => getUserById(id)))
      .then(ps => setAllContacts(ps.filter(Boolean)));
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const saveDesc = async () => {
    setSaving(true);
    await updateGroupDescription(group.id, desc).catch(()=>{});
    setSaving(false);
    setEditingDesc(false);
    toast.success('Description updated');
  };

  const members = group.members || [];

  // Contacts not already in the group
  const eligibleContacts = allContacts.filter(c => !members.includes(c.id));
  const filteredContacts = eligibleContacts.filter(c =>
    !addSearch || c.name?.toLowerCase().includes(addSearch.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-[250] bg-[var(--chat-bg)] flex flex-col animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-[var(--border)] bg-[var(--sidebar-bg)]">
        <button onClick={onClose} className="w-9 h-9 rounded-xl hover:bg-[var(--hover)] flex items-center justify-center">
          <ArrowLeft size={20} className="text-[var(--text-secondary)]"/>
        </button>
        <h2 className="font-bold text-[var(--text-primary)] flex-1">Group Info</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Group photo + name */}
        <div className="flex flex-col items-center pt-8 pb-6 bg-[var(--sidebar-bg)] border-b border-[var(--border)]">
          {group.photoURL
            ? <img src={group.photoURL} alt="" className="w-20 h-20 rounded-full object-cover border-4 border-brand-500/30"/>
            : <div className="w-20 h-20 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center border-4 border-brand-500/30">
                <Users size={32} className="text-white"/>
              </div>
          }
          <h3 className="mt-3 text-xl font-bold text-[var(--text-primary)]">{group.name}</h3>
          <p className="text-sm text-[var(--text-secondary)] mt-1">{members.length} members</p>
        </div>

        {/* Description */}
        <div className="mx-4 mt-4 bg-[var(--sidebar-bg)] border border-[var(--border)] rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-[var(--text-secondary)] tracking-wider">DESCRIPTION</span>
            {isAdmin && !editingDesc && (
              <button onClick={() => setEditingDesc(true)} className="text-brand-500 text-xs font-medium flex items-center gap-1">
                <Edit3 size={12}/> Edit
              </button>
            )}
          </div>
          {editingDesc ? (
            <div className="space-y-2">
              <textarea value={desc} onChange={e => setDesc(e.target.value)} maxLength={300} rows={3}
                placeholder="Add a group description..."
                className="w-full bg-[var(--input-bg)] border border-brand-500 rounded-xl p-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] outline-none resize-none"/>
              <div className="flex gap-2 justify-end">
                <button onClick={() => { setEditingDesc(false); setDesc(group.description||''); }}
                  className="px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--hover)] rounded-lg transition-all">Cancel</button>
                <button onClick={saveDesc} disabled={saving}
                  className="px-3 py-1.5 text-xs bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-all">
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-[var(--text-primary)]">
              {desc || <span className="text-[var(--text-secondary)] italic">No description</span>}
            </p>
          )}
        </div>

        {/* Members */}
        <div className="mx-4 mt-4 mb-6 bg-[var(--sidebar-bg)] border border-[var(--border)] rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
            <span className="text-xs font-bold text-[var(--text-secondary)] tracking-wider">{members.length} MEMBERS</span>
            {isAdmin && (
              <button onClick={() => setShowAddMember(true)}
                className="flex items-center gap-1 text-brand-500 text-xs font-medium hover:text-brand-400 transition-colors">
                <UserPlus size={13}/> Add
              </button>
            )}
          </div>
          {members.map((uid, i) => {
            const p = memberProfiles[uid];
            const isSelf = uid === currentUserId;
            const isGroupAdmin = uid === group.adminId;
            return (
              <div key={uid} className={`flex items-center gap-3 px-4 py-3 ${i < members.length-1 ? 'border-b border-[var(--border)]' : ''} animate-fade-in`}
                style={{animationDelay:`${i*0.04}s`}}>
                {p?.avatar ? <img src={p.avatar} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0"/>
                  : <div className="w-10 h-10 rounded-full bg-brand-500 flex items-center justify-center text-white font-bold flex-shrink-0">{p?.name?.[0]||'?'}</div>}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-[var(--text-primary)] truncate">{p?.name || 'Unknown'}</span>
                    {isSelf && <span className="text-[10px] text-brand-500 font-medium">(You)</span>}
                    {isGroupAdmin && <Crown size={12} className="text-yellow-500 flex-shrink-0"/>}
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] truncate">{p?.about || 'Family & Friends user'}</p>
                </div>
                {isAdmin && !isSelf && !isGroupAdmin && (
                  <button onClick={() => onMemberRemove(uid, p?.name||'Member')}
                    className="w-8 h-8 rounded-full hover:bg-red-500/10 flex items-center justify-center text-red-400 transition-all flex-shrink-0">
                    <UserMinus size={15}/>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Add Member Sheet */}
      {showAddMember && (
        <div className="fixed inset-0 z-[300] flex items-end justify-center animate-fade-in"
          style={{background:'rgba(0,0,0,0.5)',backdropFilter:'blur(4px)'}}
          onClick={() => setShowAddMember(false)}>
          <div className="bg-[var(--sidebar-bg)] rounded-t-3xl w-full max-w-sm pb-8 animate-sheet-up max-h-[70vh] flex flex-col shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-[var(--border)] rounded-full mx-auto mt-3 mb-1"/>
            <div className="px-4 py-3 border-b border-[var(--border)] flex items-center gap-3">
              <p className="font-bold text-[var(--text-primary)] flex-1">Add Member</p>
              <button onClick={() => setShowAddMember(false)}
                className="w-8 h-8 rounded-full hover:bg-[var(--hover)] flex items-center justify-center">
                <X size={16} className="text-[var(--text-secondary)]"/>
              </button>
            </div>
            <div className="px-4 py-2">
              <input
                value={addSearch} onChange={e => setAddSearch(e.target.value)}
                placeholder="Search contacts…"
                className="w-full bg-[var(--input-bg)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] outline-none focus:border-brand-500 transition-colors"
                autoFocus
              />
            </div>
            <div className="flex-1 overflow-y-auto px-2 pb-2">
              {filteredContacts.length === 0 ? (
                <p className="text-center text-[var(--text-secondary)] text-sm py-8">
                  {eligibleContacts.length === 0 ? 'All contacts are already in this group' : 'No contacts found'}
                </p>
              ) : filteredContacts.map(c => (
                <button key={c.id} onClick={() => { onMemberAdd(c.id, c.name); setShowAddMember(false); setAddSearch(''); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-[var(--hover)] transition-all text-sm">
                  {c.avatar
                    ? <img src={c.avatar} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0"/>
                    : <div className="w-10 h-10 rounded-full bg-brand-500 flex items-center justify-center text-white font-bold flex-shrink-0">{c.name?.[0]?.toUpperCase()}</div>}
                  <div className="flex-1 text-left min-w-0">
                    <p className="font-medium text-[var(--text-primary)] truncate">{c.name}</p>
                    <p className="text-xs text-[var(--text-secondary)] truncate">{c.about || 'Family & Friends user'}</p>
                  </div>
                  <UserPlus size={15} className="text-brand-500 flex-shrink-0"/>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Selection Bar ──────────────────────────────────────
function SelectionBar({ count, onCancel, onDeleteMe, onForward }) {
  return (
    <div className="absolute top-0 left-0 right-0 bg-brand-600 text-white flex items-center px-4 py-3 z-20 animate-slide-down">
      <button onClick={onCancel} className="mr-3 w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center">
        <X size={18}/>
      </button>
      <span className="flex-1 font-semibold">{count} selected</span>
      <button onClick={onForward} className="w-9 h-9 rounded-xl hover:bg-white/10 flex items-center justify-center" title="Forward">
        <Share2 size={18}/>
      </button>
      <button onClick={onDeleteMe} className="w-9 h-9 rounded-xl hover:bg-white/10 flex items-center justify-center" title="Delete">
        <Trash2 size={18}/>
      </button>
    </div>
  );
}

// ══════════════════════════════════════════════════════
//  Group Chat Window
// ══════════════════════════════════════════════════════
export function GroupChatWindow({ group: initialGroup, onBack, contacts: propContacts, groups: allGroups, onGroupVoiceCall, onGroupVideoCall, onMemberProfilesLoaded }) {
  const { user, profile } = useAuth();
  const { wallpaperBg } = useTheme();
  const [group, setGroup]                   = useState(initialGroup);   // live-updated
  const [messages, setMessages]             = useState([]);
  const [text, setText]                     = useState('');
  const [memberProfiles, setMemberProfiles] = useState({});
  // contacts: use prop if provided, otherwise load from own profile
  const [contacts, setContacts] = useState(propContacts || []);
  const [ownGroups, setOwnGroups] = useState([]);

  // Load own contacts if not passed via prop
  useEffect(() => {
    if (propContacts) { setContacts(propContacts); return; }
    if (!profile?.contacts?.length) { setContacts([]); return; }
    Promise.all(profile.contacts.map(id => getUserById(id)))
      .then(profiles => setContacts(profiles.filter(Boolean)));
  }, [profile?.contacts, propContacts]);

  // Subscribe to groups the user belongs to (for forward sheet)
  useEffect(() => {
    if (!user?.uid) return;
    return subscribeToGroups(user.uid, setOwnGroups);
  }, [user?.uid]);

  // Live-subscribe to the group document so member list updates in real-time
  useEffect(() => {
    if (!initialGroup?.id) return;
    const unsub = onSnapshot(doc(db, 'groups', initialGroup.id), snap => {
      if (!snap.exists()) { onBack?.(); return; }
      const data = { id: snap.id, ...snap.data() };
      setGroup(data);
      if (user?.uid && !(data.members || []).includes(user.uid)) {
        toast('You were removed from this group', { icon: '👋' });
        onBack?.();
      }
    });
    return unsub;
  }, [initialGroup?.id, user?.uid]);
  const [showMenu, setShowMenu]             = useState(false);
  const [showSearch, setShowSearch]         = useState(false);
  const [searchQ, setSearchQ]               = useState('');
  const [showAttach, setShowAttach]         = useState(false);
  const [showEmoji, setShowEmoji]           = useState(false);
  const [showVoice, setShowVoice]           = useState(false);
  const [showCamera, setShowCamera]         = useState(false);
  const [photoViewer, setPhotoViewer]       = useState(null);
  const [mediaAIImage, setMediaAIImage]     = useState(null);
  const [confirmSheet, setConfirmSheet]     = useState(null);

  const askConfirm = ({ title, message, label = 'Confirm', danger = false }) =>
    new Promise(resolve => {
      setConfirmSheet({
        title, message, label, danger,
        onConfirm: () => { setConfirmSheet(null); resolve(true); },
        onCancel:  () => { setConfirmSheet(null); resolve(false); },
      });
    });
  const [showGroupInfo, setShowGroupInfo]   = useState(false);
  const [replyTo, setReplyTo]               = useState(null);
  const [selectedMsg, setSelectedMsg]       = useState(null);
  const [editingMsg, setEditingMsg]         = useState(null);
  const [editText, setEditText]             = useState('');
  const [forwardMsgs, setForwardMsgs]       = useState(null);
  const [typingUsers, setTypingUsers]       = useState([]);
  const [selectionMode, setSelectionMode]   = useState(false);
  const [selectedMsgs, setSelectedMsgs]     = useState([]);

  // ── UnifyAI ────────────────────────────────────────────────
  const { openOverlay, openVoiceAI, voiceAIOpen,
          unifiedAnswer, setUnifiedAnswer, clearUnifiedAnswer,
          groupPulse, setGroupPulse, clearGroupPulse,
          getSummaryCache, setSummaryCache } = useAIStore();

  const getGroupAIContext = () => ({
    type: 'group',
    data: {
      messages: messages.map(m => ({
        ...m,
        isOwn: m.senderId === user.uid,
        senderName: m.senderName || (m.senderId === user.uid ? profile?.name : 'Member'),
      })),
      groupName: group?.name,
      groupId: group?.id,
    },
  });

  const handleOpenGroupOverlay = () => openOverlay(getGroupAIContext());

  const handleGroupSummarize = async () => {
    setShowMenu(false);
    const cacheKey = `group-${group?.id}`;
    const cached = getSummaryCache(cacheKey);
    if (cached) { setUnifiedAnswer({ unified: cached, loading: false, contextType: 'group-summary', responses: {} }); return; }
    setUnifiedAnswer({ loading: true, responses: {}, unified: null, contextType: 'group-summary' });
    try {
      // Enrich senderNames before building transcript
      const memberMap = {};
      if (group?.members) {
        await Promise.all(group.members.map(async (mid) => {
          if (!memberMap[mid]) {
            try {
              const { getUserById } = await import('../../firebase');
              const p = await getUserById(mid);
              if (p) memberMap[mid] = p.name || p.displayName || 'Member';
            } catch {}
          }
        }));
      }
      const msgsWithNames = messages.map(m => ({
        ...m,
        senderName: m.senderName || memberMap[m.senderId] || (m.senderId === user.uid ? profile?.name : 'Member'),
      }));
      const transcript = msgsWithNames.slice(-20)
        .filter(m => m.content && m.type !== 'system')
        .map(m => `${m.senderName}: ${m.content.slice(0, 120)}`)
        .join('\n');

      if (!transcript.trim()) {
        setUnifiedAnswer({ unified: 'Not enough messages to summarize.', loading: false, contextType: 'group-summary', responses: {} });
        return;
      }

      await askUnify({
        prompt: `Summarize this group chat "${group?.name || 'Group'}" in 2-3 sentences. Topics, decisions, mood.\n\n${transcript}`,
        system: 'Brief insightful summary. Flowing prose, max 3 sentences. Use real names from the transcript.',
        onModelResult: (r) => {
          setUnifiedAnswer(prev => ({
            ...(prev || { contextType: 'group-summary', responses: {}, unified: null }),
            responses: { ...(prev?.responses || {}), [r.id]: r },
          }));
        },
        onUnifiedStart: () => {
          setUnifiedAnswer(prev => ({
            ...(prev || { contextType: 'group-summary', responses: {}, unified: null }),
            loading: true,
          }));
        },
        onDone: (merged) => {
          setUnifiedAnswer({ contextType: 'group-summary', responses: {}, unified: merged, loading: false });
          setSummaryCache(cacheKey, merged);
        },
      });
    } catch (e) {
      // Silent — AI summarize errors are non-critical
      setUnifiedAnswer({ text: null, loading: false, error: 'Could not summarize. Check your GROQ_API_KEY in Cloudflare settings.', contextType: 'group-summary' });
    }
  };

  const handleGroupPulse = async () => {
    setShowMenu(false);
    setGroupPulse({ loading: true });
    try {
      // Enrich messages with real sender names — fetch missing profiles
      const memberMap = {};
      if (group?.members) {
        await Promise.all(group.members.map(async (mid) => {
          if (!memberMap[mid]) {
            try {
              const { getUserById } = await import('../../firebase');
              const p = await getUserById(mid);
              if (p) memberMap[mid] = p.name || p.displayName || 'Member';
            } catch {}
          }
        }));
      }
      const msgsWithNames = messages.map(m => ({
        ...m,
        senderName: m.senderName
          || memberMap[m.senderId]
          || (m.senderId === user.uid ? profile?.name : null)
          || 'Member',
      }));
      const pulse = await analyzeGroupPulse(msgsWithNames, group?.name || 'Group');
      setGroupPulse({ ...pulse, loading: false });
    } catch (e) {
      // Silent — AI pulse errors are non-critical
      setGroupPulse({ loading: false, error: 'Could not analyze group. Check your API key in Cloudflare settings.' });
    }
  };

  const bottomRef   = useRef(null);
  const typingTimer = useRef(null);
  const isAdmin     = group?.adminId === user?.uid;

  // Member profiles — reload whenever members list changes
  useEffect(() => {
    if (!group?.members?.length) return;
    Promise.all(group.members.map(id => getUserById(id))).then(profiles => {
      const map = {};
      profiles.filter(Boolean).forEach(p => { map[p.id] = p; });
      setMemberProfiles(map);
      // Notify App so group call screen shows real names
      onMemberProfilesLoaded?.(map);
    });
  }, [group?.id, group?.members?.join(',')]);  // re-run when member list changes

  // Messages
  useEffect(() => {
    if (!group) return;
    const unsub = subscribeToGroupMessages(group.id, msgs => {
      setMessages(msgs);
      markMessagesRead(group.id, user.uid, true).catch(()=>{});
    });
    return unsub;
  }, [group?.id]);

  // Typing
  useEffect(() => {
    if (!group) return;
    const unsub = onSnapshot(doc(db, 'groups', group.id), snap => {
      const typing = snap.data()?.typing || {};
      const now = Date.now();
      const active = Object.entries(typing)
        .filter(([uid, ts]) => uid !== user.uid && ts && now - (ts?.seconds ? ts.seconds*1000 : ts) < 4000)
        .map(([uid]) => memberProfiles[uid]?.name || 'Someone');
      setTypingUsers(active);
    });
    return unsub;
  }, [group?.id, memberProfiles]);

  // Smart scroll: only auto-scroll when a NEW message arrives AND user is near the bottom
  // Scroll handled by GroupVirtualList internally

  const handleTextChange = val => {
    setText(val);
    setTyping(group.id, user.uid, true).catch(()=>{});
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => clearTyping(group.id, user.uid, true).catch(()=>{}), 2500);
  };

  const handleSend = async () => {
    const content = text.trim();
    if (!content || !group) return;
    // Capture reply before clearing — optimistic clear
    const currentReply = replyTo;
    setText(''); setReplyTo(null); setShowEmoji(false);
    clearTyping(group.id, user.uid, true).catch(()=>{});
    try {
      await sendGroupMessage(group.id, user.uid, content, 'text',
        currentReply ? { replyTo: { id: currentReply.id, content: currentReply.content } } : {},
        group.members || [], profile?.name || '');
      // Push to all other members
      const preview = makePreview(content, 'text');
      const senderName = profile?.name || 'Someone';
      (group.members || []).filter(id => id !== user.uid).forEach(memberId => {
        sendPushNotification(memberId, `${group.name}: ${senderName}`, preview,
          { groupId: group.id, tag: `group-${group.id}` }).catch(() => {});
      });
    } catch { setText(content); toast.error('Failed to send — tap to retry'); }
  };

  const handleFile = async e => {
    const file = e.target.files[0];
    if (!file || !group) return;
    e.target.value = '';
    setShowAttach(false);
    if (file.size > 8*1024*1024) { toast.error('Max 8MB'); return; }
    const isImage = file.type.startsWith('image/');
    const tid = toast.loading(isImage?'Sending image...':'Sending file...');
    try {
      const b64 = await uploadMedia(file, `groups/${group.id}/${Date.now()}_${file.name || 'media'}`);
      await sendGroupMessage(group.id, user.uid, b64, isImage?'image':'file', { fileName:file.name, fileSize:`${(file.size/1024).toFixed(1)} KB` }, group.members || [], profile?.name || '');
      const senderName = profile?.name || 'Someone';
      const msgType = isImage ? 'image' : 'file';
      (group.members || []).filter(id => id !== user.uid).forEach(memberId => {
        sendPushNotification(memberId, `${group.name}: ${senderName}`, makePreview(b64, msgType),
          { groupId: group.id, tag: `group-${group.id}` }).catch(() => {});
      });
      toast.dismiss(tid);
    } catch { toast.dismiss(tid); toast.error('Failed to send'); }
  };

  const handleImageClick = (clickedMsg) => {
    const visibleMsgs = messages.filter(m => !m.deletedFor?.includes(user.uid));
    const imgs = visibleMsgs
      .filter(m => m.type === 'image' && m.content)
      .map(m => ({
        content: m.content,
        fileName: m.fileName || 'photo.jpg',
        senderName: m.senderId === user.uid ? 'You' : (memberProfiles[m.senderId]?.name || 'Member'),
        ts: formatMsgTime(m.timestamp),
      }));
    const imgMsgs = visibleMsgs.filter(m => m.type === 'image' && m.content);
    const startIndex = imgMsgs.findIndex(m => m.id === clickedMsg.id);
    setPhotoViewer({ images: imgs, startIndex: Math.max(0, startIndex) });
  };

  const handleCameraCapture = async dataUrl => {
    setShowCamera(false);  // ← close immediately
    if (!group || !dataUrl) return;
    const tid = toast.loading('Sending photo...');
    try {
      await sendGroupMessage(group.id, user.uid, dataUrl, 'image', { fileName: 'camera.jpg' }, group.members || [], profile?.name || '');
      (group.members || []).filter(id => id !== user.uid).forEach(memberId => {
        sendPushNotification(memberId, `${group.name}: ${profile?.name || 'Someone'}`, '📷 Photo',
          { groupId: group.id, tag: `group-${group.id}` }).catch(() => {});
      });
      toast.dismiss(tid);
    } catch { toast.dismiss(tid); toast.error('Failed to send photo'); }
  };

  const handleVoice = async (blob, dur) => {
    setShowVoice(false);
    if (!blob || !group) return;
    const tid = toast.loading('Sending voice note...');
    try {
      const b64 = await uploadMedia(blob, `groups/${group.id}/${Date.now()}_voice.webm`);
      await sendGroupMessage(group.id, user.uid, b64, 'voice', { duration:dur }, group.members || [], profile?.name || '');
      (group.members || []).filter(id => id !== user.uid).forEach(memberId => {
        sendPushNotification(memberId, `${group.name}: ${profile?.name || 'Someone'}`, '🎙 Voice note',
          { groupId: group.id, tag: `group-${group.id}` }).catch(() => {});
      });
      toast.dismiss(tid);
    } catch { toast.dismiss(tid); toast.error('Failed to send'); }
  };

  const handleDelete = async (msg, forAll) => {
    try {
      if (forAll) { await deleteMessageForEveryone(group.id, msg.id, true); toast.success('Deleted for everyone'); }
      else await deleteMessageForMe(group.id, msg.id, user.uid, true);
    } catch { toast.error('Delete failed'); }
  };

  const handleDeleteSelected = async (forAll = false) => {
    const ids = selectedMsgs.map(m => m.id);
    try {
      await deleteMultipleMessages(group.id, ids, user.uid, forAll, true);
      toast.success(`${ids.length} message${ids.length>1?'s':''} deleted`);
    } catch { toast.error('Delete failed'); }
    exitSelectionMode();
  };

  const handleEditSave = async () => {
    if (!editingMsg || !editText.trim()) return;
    await editMessage(group.id, editingMsg.id, editText.trim(), true).catch(()=>{});
    setEditingMsg(null); setEditText('');
  };

  const handleExit = async (deleteGroup = false) => {
    const ok = await askConfirm(deleteGroup ? {
      title: `Delete "${group.name}"?`,
      message: 'This will permanently delete the group and all messages for everyone.',
      label: 'Delete Group',
      danger: true,
    } : {
      title: `Leave "${group.name}"?`,
      message: 'You will be removed from this group and won\'t receive new messages.',
      label: 'Leave Group',
      danger: true,
    });
    if (!ok) return;
    try {
      await exitGroupWithNotice(group.id, user.uid, profile?.name || 'Someone', isAdmin, deleteGroup && isAdmin);
      toast.success(deleteGroup ? 'Group deleted' : 'Left group');
      onBack?.();
    } catch { toast.error('Failed to exit group'); }
  };

  const handleClearChat = async () => {
    const ok = await askConfirm({
      title: 'Clear Chat?',
      message: 'All messages will be removed for you only. This cannot be undone.',
      label: 'Clear Chat',
      danger: true,
    });
    if (!ok) return;
    await clearChat(group.id, user.uid, true).catch(()=>{});
    toast.success('Chat cleared');
    setShowMenu(false);
  };

  const handleReaction = useCallback((msgId, emoji) => {
    if (!group?.id || !msgId) return;
    addReaction(group.id, msgId, user.uid, emoji, true)
      .catch(() => { toast.error('Could not add reaction'); });
  }, [group?.id, user?.uid]);

  const handleForward = async targets => {
    const msgs = forwardMsgs?.length ? forwardMsgs : (selectedMsg ? [selectedMsg] : []);
    setForwardMsgs(null);
    setSelectedMsg(null);
    exitSelectionMode();
    if (!msgs.length || !targets.length) return;
    const tid = toast.loading('Forwarding…');
    try {
      await Promise.all(msgs.map(msg => forwardMessage(msg, targets, user.uid)));
      toast.success(`Forwarded to ${targets.length} chat${targets.length > 1 ? 's' : ''}!`, { id: tid });
    } catch (e) {
      // Silent — forward error shown to user via toast
      toast.error('Failed to forward', { id: tid });
    }
  };

  const handleMemberRemove = async (memberId, memberName) => {
    const ok = await askConfirm({
      title: `Remove ${memberName}?`,
      message: `${memberName} will be removed from the group and notified.`,
      label: 'Remove',
      danger: true,
    });
    if (!ok) return;
    await removeGroupMember(group.id, memberId, user.uid, profile?.name || 'Admin', memberName);
    toast.success(`${memberName} removed`);
    setShowGroupInfo(false);
    setTimeout(() => setShowGroupInfo(true), 100); // refresh
  };

  const handleMemberAdd = async (memberId, memberName) => {
    await addGroupMember(group.id, memberId, profile?.name || 'Admin', memberName).catch(()=>{});
    toast.success(`${memberName} added to group`);
  };

  const enterSelectionMode = msg => { setSelectionMode(true); setSelectedMsgs([msg]); setSelectedMsg(null); };
  const exitSelectionMode  = () => { setSelectionMode(false); setSelectedMsgs([]); };
  const toggleMsgSelect    = msg => setSelectedMsgs(p => p.find(m=>m.id===msg.id) ? p.filter(m=>m.id!==msg.id) : [...p,msg]);

  const visible = useMemo(() =>
    messages
      .filter(m => !m.deletedFor?.includes(user.uid))
      .filter(m => !searchQ || m.content?.toLowerCase().includes(searchQ.toLowerCase())),
    [messages, user?.uid, searchQ]
  );

  const typingLabel = typingUsers.length===1 ? `${typingUsers[0]} is typing...`
    : typingUsers.length > 1 ? `${typingUsers[0]} and ${typingUsers.length-1} more typing...` : '';

  const closeAll = () => { setShowMenu(false); setShowAttach(false); setShowEmoji(false); };

  if (!group) return null;

  return (
    <div className="flex flex-col h-full chat-bg relative" style={{ background: wallpaperBg }} onClick={closeAll}>

      {/* GROUP INFO PANEL */}
      {showGroupInfo && (
        <GroupInfoPanel
          group={group}
          memberProfiles={memberProfiles}
          isAdmin={isAdmin}
          currentUserId={user.uid}
          contacts={contacts}
          onClose={() => setShowGroupInfo(false)}
          onMemberRemove={handleMemberRemove}
          onMemberAdd={handleMemberAdd}/>
      )}

      {/* SELECTION BAR */}
      {selectionMode && (
        <SelectionBar
          count={selectedMsgs.length}
          onCancel={exitSelectionMode}
          onDeleteMe={() => handleDeleteSelected(false)}
          onForward={() => setForwardMsgs(selectedMsgs)}/>
      )}

      {/* HEADER */}
      <div className={`flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] bg-[var(--sidebar-bg)] flex-shrink-0 ${selectionMode?'pt-16':''}`}
        onClick={e=>e.stopPropagation()}>
        <button onClick={onBack} className="lg:hidden w-9 h-9 rounded-xl hover:bg-[var(--hover)] flex items-center justify-center">
          <ArrowLeft size={20} className="text-[var(--text-secondary)]"/>
        </button>
        <button className="flex items-center gap-3 flex-1 min-w-0 text-left" onClick={() => setShowGroupInfo(true)}>
          {group.photoURL ? <img src={group.photoURL} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0"/>
            : <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white font-bold flex-shrink-0"><Users size={18}/></div>}
          <div className="min-w-0">
            <p className="font-bold text-[var(--text-primary)] truncate text-[15px] leading-tight">{group.name}</p>
            <p className="text-xs text-[var(--text-secondary)] truncate">{typingLabel || `${group.members?.length||0} members`}</p>
          </div>
        </button>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => { setShowSearch(v=>!v); setSearchQ(''); }} className="w-9 h-9 rounded-xl hover:bg-[var(--hover)] flex items-center justify-center">
            <Search size={18} className="text-[var(--text-secondary)]"/>
          </button>
          <button onClick={() => onGroupVoiceCall?.(group)} className="w-9 h-9 rounded-xl hover:bg-[var(--hover)] flex items-center justify-center">
            <Phone size={18} className="text-[var(--text-secondary)]"/>
          </button>
          <button onClick={() => onGroupVideoCall?.(group)} className="w-9 h-9 rounded-xl hover:bg-[var(--hover)] flex items-center justify-center">
            <Video size={18} className="text-[var(--text-secondary)]"/>
          </button>
          <div className="relative">
            <button onClick={e => { e.stopPropagation(); setShowMenu(v=>!v); }} className="w-9 h-9 rounded-xl hover:bg-[var(--hover)] flex items-center justify-center">
              <MoreVertical size={18} className="text-[var(--text-secondary)]"/>
            </button>
            {showMenu && (
              <div className="absolute right-0 top-10 bg-[var(--sidebar-bg)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden z-50 min-w-[200px] animate-slide-down"
                onClick={e=>e.stopPropagation()}>
                {[
                  { label:'✨ Ask UnifyAI', action:() => { setShowMenu(false); handleOpenGroupOverlay(); } },
                  { label:'📋 Summarize Group', action:handleGroupSummarize },
                  { label:'📊 Conversation Intelligence', action:handleGroupPulse },
                  { label:'ℹ️ Group Info', action:() => { setShowGroupInfo(true); setShowMenu(false); } },
                  { label:'🔕 Mute', action:() => toast('Muted!') },
                  { label:'🗑 Clear Chat', action:handleClearChat },
                  { label:'🚪 Exit Group', action:()=>handleExit(false), danger:true },
                  isAdmin && { label:'💣 Exit & Delete Group', action:()=>handleExit(true), danger:true },
                ].filter(Boolean).map(item => (
                  <button key={item.label} onClick={() => { item.action(); setShowMenu(false); }}
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
          <input autoFocus value={searchQ} onChange={e=>setSearchQ(e.target.value)} placeholder="Search messages..."
            className="flex-1 bg-transparent text-[var(--text-primary)] text-sm outline-none placeholder:text-[var(--text-secondary)]"/>
          <button onClick={() => { setShowSearch(false); setSearchQ(''); }}><X size={15} className="text-[var(--text-secondary)]"/></button>
        </div>
      )}

      {/* MESSAGES — virtualized */}
      <GroupVirtualList
        messages={visible}
        user={user}
        group={group}
        memberProfiles={memberProfiles}
        selectedMsgs={selectedMsgs}
        selectionMode={selectionMode}
        typingLabel={typingLabel}
        bottomRef={bottomRef}
        onLongPress={msg => { if(!selectionMode) setSelectedMsg(msg); else enterSelectionMode(msg); }}
        onReaction={handleReaction}
        onSelect={selectionMode ? toggleMsgSelect : enterSelectionMode}
        onImageClick={handleImageClick}
        enterSelectionMode={enterSelectionMode}
        toggleMsgSelect={toggleMsgSelect}
      />

      {/* UNIFYAI — Summary / Answer Card */}
      {unifiedAnswer && (
        <div className="px-3 pt-2 flex-shrink-0">
          <UnifiedAnswerCard
            title={unifiedAnswer.contextType === 'group-summary' ? 'Group Summary' : 'UnifyAI'}
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

      {/* UNIFYAI — Conversation Intelligence */}
      {groupPulse && !groupPulse.loading && !groupPulse.error && (
        <section className="mx-3 mt-2 rounded-xl p-4 flex flex-col gap-2 relative overflow-hidden"
          style={{
            background: 'var(--input-bg)',
            border: '1px solid var(--border)',
          }}>
          <div className="absolute inset-0 rounded-xl pointer-events-none" style={{ padding: 1, background: 'linear-gradient(90deg, #d0bcff, #4cd7f6, #ffb0cd) border-box', WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)', WebkitMaskComposite: 'xor', maskComposite: 'exclude', opacity: 0.4 }}/>

          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-brand-500" />
              <span className="font-bold text-[11px] text-[var(--text-secondary)] uppercase tracking-[0.1em]">Conversation Intelligence</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="bg-brand-500/10 px-2 py-0.5 rounded-full border border-brand-500/20">
                <span className="text-[10px] text-brand-500 font-bold tracking-wider uppercase">LIVE ANALYSIS</span>
              </div>
              <button onClick={clearGroupPulse} className="w-5 h-5 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover)] transition-all">
                <X size={12} />
              </button>
            </div>
          </div>
          <div className="flex gap-4 items-center mt-1 relative z-10">
            <div className="flex-1">
              <p className="text-sm text-[var(--text-primary)] leading-snug">
                {groupPulse.summary?.replace(/\*+/g, '')}
              </p>
            </div>
            {groupPulse.mood && (
              <div className="px-3 py-1.5 rounded-full flex-shrink-0"
                style={{ background: 'var(--hover)', border: '1px solid var(--border)' }}>
                <span className="text-[11px] font-bold text-brand-500 capitalize">{groupPulse.mood}</span>
              </div>
            )}
          </div>
          {groupPulse.topics?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2 relative z-10">
              {groupPulse.topics.map((t, i) => (
                <span key={i} className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-[var(--hover)] text-[var(--text-primary)] border border-[var(--border)]">
                  {t}
                </span>
              ))}
            </div>
          )}
          {/* DECISIONS MADE */}
          {groupPulse.decisions?.length > 0 && (
            <div className="mt-3 relative z-10 pt-3 border-t border-[var(--border)] flex flex-col gap-2">
              <div className="flex items-center gap-1.5 text-[var(--text-primary)] font-bold text-xs uppercase tracking-widest">
                <Target size={12} className="text-brand-500" />
                <span>Decisions Made</span>
              </div>
              <ul className="flex flex-col gap-1.5">
                {groupPulse.decisions.map((d, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                    <span className="text-brand-500 mt-0.5 flex-shrink-0">✓</span>
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ACTION ITEMS */}
          {groupPulse.action_items?.length > 0 && (
            <div className="mt-3 relative z-10 pt-3 border-t border-[var(--border)] flex flex-col gap-2">
              <div className="flex items-center gap-1.5 text-[var(--text-primary)] font-bold text-xs uppercase tracking-widest">
                <ListTodo size={12} className="text-brand-500" />
                <span>Action Items</span>
              </div>
              <div className="flex flex-col gap-2">
                {groupPulse.action_items.map((t, i) => (
                  <div key={i} className="flex justify-between items-center bg-[var(--bg)] p-2 px-3 rounded-xl border border-[var(--border)] shadow-sm">
                    <span className="text-sm font-medium text-[var(--text-primary)] flex-1 mr-2">{t}</span>
                    <button
                      onClick={async () => {
                        const toastId = toast.loading('Adding task...');
                        try {
                          const { createFFTask } = await import('../../firebase');
                          await createFFTask({ title: t, source: group.name, chatId: group.id, type: 'group' });
                          toast.success('Task created', { id: toastId });
                        } catch (e) {
                          toast.error('Failed to create task', { id: toastId });
                        }
                      }}
                      className="text-xs bg-brand-500 text-white px-3 py-1.5 rounded-lg hover:bg-brand-600 transition-colors flex-shrink-0"
                    >
                      + Task
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PENDING QUESTIONS */}
          {groupPulse.pending_questions?.length > 0 && (
            <div className="mt-3 relative z-10 pt-3 border-t border-[var(--border)] flex flex-col gap-2">
              <div className="flex items-center gap-1.5 text-[var(--text-primary)] font-bold text-xs uppercase tracking-widest">
                <Clock size={12} className="text-orange-500" />
                <span>Pending Questions</span>
              </div>
              <ul className="flex flex-col gap-1.5">
                {groupPulse.pending_questions.map((q, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                    <span className="text-orange-400 mt-0.5 flex-shrink-0">?</span>
                    <span>{q}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* DEADLINES */}
          {groupPulse.deadlines?.length > 0 && (
            <div className="mt-3 relative z-10 pt-3 border-t border-[var(--border)] flex flex-col gap-2">
              <div className="flex items-center gap-1.5 text-[var(--text-primary)] font-bold text-xs uppercase tracking-widest">
                <Calendar size={12} className="text-red-400" />
                <span>Deadlines</span>
              </div>
              <ul className="flex flex-col gap-1.5">
                {groupPulse.deadlines.map((d, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                    <span className="text-red-400 mt-0.5 flex-shrink-0">⏰</span>
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* UNIFYAI CHAT BAR */}
      {!showVoice && (
        <div className="border-t border-[var(--border)] bg-[var(--sidebar-bg)] flex-shrink-0"
          onClick={e => e.stopPropagation()}>
          <UnifyAIChatBar
            messages={messages.map(m => ({
              ...m,
              isOwn: m.senderId === user.uid,
              senderName: m.senderName || (m.senderId === user.uid ? profile?.name : 'Member'),
            }))}
            myName={profile?.name}
            onReply={r => setText(r)}
            onOpenOverlay={handleOpenGroupOverlay}
            onOpenVoice={() => openVoiceAI(getGroupAIContext())}
            context={{ groupId: group?.id }}
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
          <input value={editText} onChange={e=>setEditText(e.target.value)} autoFocus
            onKeyDown={e=>{if(e.key==='Enter')handleEditSave();if(e.key==='Escape'){setEditingMsg(null);setEditText('');}}}
            className="flex-1 bg-transparent text-[var(--text-primary)] text-sm outline-none"/>
          <button onClick={handleEditSave} className="text-blue-400 font-bold text-xs px-2 py-1 rounded-lg hover:bg-blue-500/10">Save</button>
          <button onClick={() => { setEditingMsg(null); setEditText(''); }}><X size={14} className="text-[var(--text-secondary)]"/></button>
        </div>
      )}

      {/* INPUT */}
      <div className="px-3 py-3 border-t border-[var(--border)] bg-[var(--sidebar-bg)] flex-shrink-0"
        onClick={e=>e.stopPropagation()}>
        {showVoice ? (
          <VoiceRecorder onSend={handleVoice} onCancel={() => setShowVoice(false)}/>
        ) : (
          <div className="flex items-end gap-2">
            <div className="relative flex-shrink-0">
              <button onClick={() => { setShowAttach(v=>!v); setShowEmoji(false); }}
                className="w-10 h-10 rounded-full hover:bg-[var(--hover)] flex items-center justify-center text-[var(--text-secondary)] transition-colors">
                <Paperclip size={20}/>
              </button>
              {showAttach && (
                <div className="absolute bottom-12 left-0 bg-[var(--sidebar-bg)] border border-[var(--border)] rounded-2xl shadow-2xl p-3 grid grid-cols-3 gap-2 w-48 animate-scale-in z-10">
                  <label className="flex flex-col items-center gap-1.5 cursor-pointer group">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center group-hover:scale-105 transition-transform" style={{background:'#8b5cf622'}}><Image size={20} style={{color:'#8b5cf6'}}/></div>
                    <span className="text-[11px] text-[var(--text-secondary)]">Photo</span>
                    <input type="file" accept="image/*" className="hidden" onChange={handleFile}/>
                  </label>
                  <button className="flex flex-col items-center gap-1.5 group"
                    onClick={() => { setShowAttach(false); setShowCamera(true); }}>
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center group-hover:scale-105 transition-transform" style={{background:'#0ea5e922'}}><Camera size={20} style={{color:'#0ea5e9'}}/></div>
                    <span className="text-[11px] text-[var(--text-secondary)]">Camera</span>
                  </button>
                  <label className="flex flex-col items-center gap-1.5 cursor-pointer group">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center group-hover:scale-105 transition-transform" style={{background:'#f9731622'}}><FileText size={20} style={{color:'#f97316'}}/></div>
                    <span className="text-[11px] text-[var(--text-secondary)]">Document</span>
                    <input type="file" accept="*/*" className="hidden" onChange={handleFile}/>
                  </label>
                </div>
              )}
            </div>
            <div className="flex-1 flex items-end bg-[var(--input-bg)] border border-[var(--border)] rounded-2xl px-3 py-2.5 gap-2 focus-within:border-brand-400 transition-all relative">
              <div className="relative flex-shrink-0 self-center">
                <button onClick={e => { e.stopPropagation(); setShowEmoji(v=>!v); setShowAttach(false); }}
                  className="text-[var(--text-secondary)] hover:text-brand-500 transition-colors">
                  <Smile size={20}/>
                </button>
                {showEmoji && <EmojiPicker onSelect={e => setText(t=>t+e)} onClose={() => setShowEmoji(false)}/>}
              </div>
              <textarea value={text} onChange={e=>handleTextChange(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();handleSend();}}}
                placeholder={`Message ${group.name}...`} rows={1}
                className="flex-1 bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] resize-none outline-none text-[15px] max-h-32 leading-relaxed self-center"
                style={{scrollbarWidth:'none'}}/>
            </div>
            {text.trim() ? (
              <button onClick={handleSend}
                className="w-10 h-10 rounded-full bg-brand-500 hover:bg-brand-600 flex items-center justify-center transition-all flex-shrink-0 shadow-lg active:scale-95">
                <Send size={18} className="text-white"/>
              </button>
            ) : (
              <button onClick={() => setShowVoice(true)}
                className="w-10 h-10 rounded-full bg-brand-500 hover:bg-brand-600 flex items-center justify-center transition-all flex-shrink-0 shadow-lg active:scale-95">
                <Mic size={18} className="text-white"/>
              </button>
            )}
          </div>
        )}
      </div>

      {/* MESSAGE MENU */}
      {selectedMsg && !selectionMode && (
        <MsgMenu msg={selectedMsg} isOwn={selectedMsg.senderId===user.uid}
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
        <ForwardSheet msgs={forwardMsgs} contacts={contacts} groups={ownGroups}
          onClose={() => setForwardMsgs(null)} onForward={handleForward}/>
      )}

      {/* CAMERA */}
      {showCamera && (
        <CameraCapture onCapture={handleCameraCapture} onClose={() => setShowCamera(false)}/>
      )}

      {/* PHOTO VIEWER */}
      {photoViewer && photoViewer.images.length > 0 && (
        <PhotoViewer
          images={photoViewer.images}
          startIndex={photoViewer.startIndex}
          onClose={() => setPhotoViewer(null)}
          onAnalyze={b64 => setMediaAIImage(b64)} />
      )}

      {/* MEDIA INTELLIGENCE / IMAGE ANALYSIS */}
      {mediaAIImage && (
        <MediaIntelligence imageBase64={mediaAIImage} onClose={() => setMediaAIImage(null)} />
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

      {/* UNIFYAI OVERLAYS */}
      <UnifyAIOverlay />
      <VoiceAI />
    </div>
  );
}
