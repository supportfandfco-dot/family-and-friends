// ═══════════════════════════════════════════════════════
//  StatusCreator — Create Text & Image Moments
//  Family & Friends · Built by Ishrit Sachdeva
// ═══════════════════════════════════════════════════════
import { useState, useRef, useCallback, useEffect } from 'react';
import {
  X, Type, Image, Video, Palette, AlignLeft, AlignCenter,
  AlignRight, Bold, Italic, ChevronRight
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { db, addDoc, collection, serverTimestamp, getUserById } from '../../firebase';
import toast from 'react-hot-toast';

const BG_GRADIENTS = [
  { label:'Forest',  value:'linear-gradient(135deg,#052e16,#16a34a)' },
  { label:'Ocean',   value:'linear-gradient(135deg,#0c4a6e,#0ea5e9)' },
  { label:'Sunset',  value:'linear-gradient(135deg,#7c2d12,#f97316,#fbbf24)' },
  { label:'Purple',  value:'linear-gradient(135deg,#3b0764,#a855f7)' },
  { label:'Rose',    value:'linear-gradient(135deg,#881337,#f43f5e)' },
  { label:'Slate',   value:'linear-gradient(135deg,#0f172a,#334155)' },
  { label:'Teal',    value:'linear-gradient(135deg,#134e4a,#14b8a6)' },
  { label:'Amber',   value:'linear-gradient(135deg,#78350f,#f59e0b)' },
  { label:'Black',   value:'linear-gradient(135deg,#000000,#1f2937)' },
];
const TEXT_COLORS = ['#ffffff','#000000','#fbbf24','#f87171','#34d399','#60a5fa','#c084fc','#fb7185'];
const FONTS       = ['Nunito','Poppins','Georgia','Courier New','Arial'];
const STICKERS    = ['😀','❤️','🔥','✨','🎉','😎','🌟','💯','🎵','🌈','👑','💪','🙏','😂','🥳'];

async function compressImage(file) {
  return new Promise((resolve) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const maxW = 1080;
      const scale = Math.min(1, maxW / img.width);
      canvas.width  = img.width  * scale;
      canvas.height = img.height * scale;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.src = url;
  });
}

export default function StatusCreator({ onClose, onPosted }) {
  const { user, profile } = useAuth();
  const [contactProfiles, setContactProfiles] = useState([]);

  useEffect(() => {
    if (!profile?.contacts?.length) return;
    Promise.all(profile.contacts.map(id => getUserById(id)))
      .then(ps => setContactProfiles(ps.filter(Boolean)));
  }, [profile?.contacts]);
  const [step, setStep] = useState('type');
  const [type, setType] = useState(null);

  const [text, setText]           = useState('');
  const [bg, setBg]               = useState(BG_GRADIENTS[0].value);
  const [textColor, setTextColor] = useState('#ffffff');
  const [font, setFont]           = useState('Nunito');
  const [align, setAlign]         = useState('center');
  const [isBold, setIsBold]       = useState(false);
  const [isItalic, setIsItalic]   = useState(false);
  const [fontSize, setFontSize]   = useState(24);
  const [stickers, setStickers]   = useState([]);

  const [mediaPreview, setMediaPreview] = useState(null);
  const [mediaBase64, setMediaBase64]   = useState(null);
  const [textOverlay, setTextOverlay]   = useState('');
  const [overlayColor, setOverlayColor] = useState('#ffffff');
  const [overlayBg, setOverlayBg]       = useState(false);

  const [privacy, setPrivacy]               = useState('contacts');
  const [privacyContacts, setPrivacyContacts] = useState([]); // UIDs for except/only modes
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [posting, setPosting] = useState(false);
  const fileInputRef = useRef(null);

  const handleMediaSelect = useCallback(async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.type.startsWith('image/')) {
      const b64 = await compressImage(file);
      setMediaBase64(b64);
      setMediaPreview(b64);
      setStep('create');
    } else {
      toast.error('Video requires Firebase Storage.');
    }
  }, []);

  const addSticker = (emoji) =>
    setStickers(s => [...s, { emoji, x: 40 + Math.random()*20, y: 30 + Math.random()*40, id: Date.now(), size: 40 }]);

  const updateSticker = (id, updates) =>
    setStickers(s => s.map(st => st.id === id ? { ...st, ...updates } : st));

  const removeSticker = (id) =>
    setStickers(s => s.filter(st => st.id !== id));

  const startStickerDrag = (e, id) => {
    e.stopPropagation(); e.preventDefault();
    const container = e.currentTarget.closest('[data-preview]');
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const sx = e.clientX, sy = e.clientY;
    const sticker = stickers.find(s => s.id === id);
    if (!sticker) return;
    const spx = sticker.x, spy = sticker.y;
    const move = (ev) => updateSticker(id, {
      x: Math.max(5, Math.min(95, spx + ((ev.clientX - sx) / rect.width)  * 100)),
      y: Math.max(5, Math.min(95, spy + ((ev.clientY - sy) / rect.height) * 100)),
    });
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const handlePost = async () => {
    if (type === 'text' && !text.trim()) { toast.error('Write something first!'); return; }
    if (type === 'image' && !mediaBase64) { toast.error('Select an image first'); return; }
    setPosting(true);
    try {
      const data = {
        uid: user.uid, authorName: profile.name, authorAvatar: profile.avatar || null,
        type, createdAt: serverTimestamp(),
        expiresAt: new Date(Date.now() + 24*60*60*1000).toISOString(),
        viewers: [], privacy, privacyContacts, music: null,
      };
      if (type === 'text')  Object.assign(data, { text, bg, textColor, font, align, isBold, isItalic, fontSize, stickers });
      if (type === 'image') Object.assign(data, { mediaUrl: mediaBase64, textOverlay, overlayColor, overlayBg, stickers });
      await addDoc(collection(db, 'statuses'), data);
      toast.success('Moment posted! 🎉');
      onPosted?.(); onClose();
    } catch (err) { toast.error('Failed to post'); console.error(err); }
    finally { setPosting(false); }
  };

  const renderStickers = () => stickers.map(s => (
    <div key={s.id} className="absolute group select-none"
      style={{ left:`${s.x}%`, top:`${s.y}%`, transform:'translate(-50%,-50%)', zIndex:10, cursor:'grab' }}
      onMouseDown={(e) => startStickerDrag(e, s.id)}>
      <span style={{ fontSize: s.size || 40 }}>{s.emoji}</span>
      <button onMouseDown={e=>e.stopPropagation()} onClick={()=>removeSticker(s.id)}
        className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] items-center justify-center hidden group-hover:flex">✕</button>
      <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-white rounded-full border border-gray-400 cursor-se-resize hidden group-hover:block"
        onMouseDown={e => {
          e.stopPropagation(); e.preventDefault();
          const startSize = s.size || 40, startX = e.clientX;
          const move = ev => updateSticker(s.id, { size: Math.max(20, Math.min(90, startSize + (ev.clientX - startX))) });
          const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
          window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
        }} />
    </div>
  ));

  return (
    <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-[var(--sidebar-bg)] rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[95vh] animate-scale-in">

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)] flex-shrink-0">
          <button onClick={step === 'type' ? onClose : () => setStep('type')}
            className="w-9 h-9 rounded-full hover:bg-[var(--hover)] flex items-center justify-center">
            <X size={20} className="text-[var(--text-secondary)]" />
          </button>
          <h2 className="font-display font-bold text-[var(--text-primary)]">
            {step === 'type' ? 'New Moment' : 'Create Moment'}
          </h2>
          {step === 'create' ? (
            <button onClick={handlePost} disabled={posting}
              className="bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-full text-sm font-bold disabled:opacity-50">
              {posting ? '...' : 'Post'}
            </button>
          ) : <div className="w-16" />}
        </div>

        <div className="flex-1 overflow-y-auto">

          {/* STEP 1: Type selector */}
          {step === 'type' && (
            <div className="p-5 space-y-3">
              <p className="text-[var(--text-secondary)] text-sm text-center">What would you like to share?</p>
              {[
                { t:'text',  Icon:Type,  label:'Text',  desc:'Custom background & typography' },
                { t:'image', Icon:Image, label:'Image', desc:'Photo with text overlay & stickers' },
                { t:'video', Icon:Video, label:'Video', desc:'Requires Firebase Storage' },
              ].map(({ t, Icon, label, desc }) => (
                <button key={t} onClick={() => { setType(t); if (t==='text') setStep('create'); else fileInputRef.current.click(); }}
                  className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-[var(--border)] hover:border-brand-400 hover:bg-brand-500/5 transition-all text-left group">
                  <div className="w-12 h-12 rounded-2xl bg-brand-500/10 group-hover:bg-brand-500/20 flex items-center justify-center text-brand-500">
                    <Icon size={24} />
                  </div>
                  <div>
                    <div className="font-bold text-[var(--text-primary)]">{label}</div>
                    <div className="text-xs text-[var(--text-secondary)]">{desc}</div>
                  </div>
                  <ChevronRight size={16} className="ml-auto text-[var(--text-secondary)]" />
                </button>
              ))}
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleMediaSelect} />

              <div className="p-4 rounded-2xl bg-[var(--input-bg)] border border-[var(--border)]">
                <div className="text-xs font-bold text-[var(--text-secondary)] mb-3">WHO CAN SEE</div>
                {[{v:'contacts',label:'My contacts'},{v:'except',label:'Contacts except...'},{v:'only',label:'Only share with...'}].map(({v,label}) => (
                  <label key={v} className="flex items-center gap-3 py-1.5 cursor-pointer" onClick={() => {
                    setPrivacy(v);
                    if (v !== 'except' && v !== 'only') { setPrivacyContacts([]); setShowContactPicker(false); }
                    else setShowContactPicker(true);
                  }}>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${privacy===v?'border-brand-500 bg-brand-500':'border-[var(--border)]'}`}>
                      {privacy===v && <div className="w-2 h-2 rounded-full bg-white"/>}
                    </div>
                    <span className="text-sm text-[var(--text-primary)]">{label}</span>
                    {privacy===v && privacyContacts.length > 0 && (
                      <span className="text-xs text-brand-400 ml-auto">{privacyContacts.length} selected</span>
                    )}
                  </label>
                ))}

                {/* Contact picker for except / only modes */}
                {showContactPicker && (privacy === 'except' || privacy === 'only') && (
                  <div className="mt-2 border border-[var(--border)] rounded-2xl overflow-hidden">
                    <div className="px-3 py-2 bg-[var(--bg-secondary)] text-xs font-semibold text-[var(--text-secondary)]">
                      {privacy === 'except' ? 'Hide from:' : 'Show only to:'}
                    </div>
                    <div className="max-h-36 overflow-y-auto">
                      {contactProfiles.length === 0 && (
                        <p className="text-xs text-[var(--text-secondary)] p-3">No contacts yet</p>
                      )}
                      {contactProfiles.map(c => (
                        <label key={c.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-[var(--hover)]">
                          <input type="checkbox"
                            checked={privacyContacts.includes(c.id)}
                            onChange={e => setPrivacyContacts(prev =>
                              e.target.checked ? [...prev, c.id] : prev.filter(id => id !== c.id)
                            )}
                            className="w-4 h-4 accent-brand-500"
                          />
                          <div className="w-7 h-7 rounded-full bg-brand-500 flex items-center justify-center overflow-hidden flex-shrink-0">
                            {c.avatar
                              ? <img src={c.avatar} className="w-full h-full object-cover" alt={c.name}/>
                              : <span className="text-white text-xs font-bold">{c.name?.[0]?.toUpperCase()}</span>}
                          </div>
                          <span className="text-sm text-[var(--text-primary)]">{c.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 2: Create */}
          {step === 'create' && (
            <div>
              {/* Preview */}
              <div className="relative w-full bg-black" data-preview="true" style={{aspectRatio:'9/16',maxHeight:'320px'}}>
                {type === 'text' && (
                  <div className="absolute inset-0 flex items-center justify-center p-6 overflow-hidden" style={{background:bg}}>
                    {renderStickers()}
                    {text
                      ? <p style={{color:textColor,fontSize,textAlign:align,fontFamily:font,fontWeight:isBold?'bold':'normal',fontStyle:isItalic?'italic':'normal',lineHeight:1.4,wordBreak:'break-word',maxWidth:'100%',position:'relative',zIndex:1}}>{text}</p>
                      : <p className="text-white/30 text-lg pointer-events-none">Your text here...</p>
                    }
                  </div>
                )}
                {type === 'image' && mediaPreview && (
                  <div className="absolute inset-0 bg-black overflow-hidden">
                    <img src={mediaPreview} alt="" className="absolute inset-0 w-full h-full object-cover scale-110 blur-xl opacity-40" />
                    <img src={mediaPreview} alt="" className="absolute inset-0 w-full h-full object-contain" />
                    {renderStickers()}
                    {textOverlay && (
                      <div className="absolute bottom-8 left-4 right-4 text-center px-3 py-1 rounded-lg font-bold"
                        style={{color:overlayColor,background:overlayBg?'rgba(0,0,0,0.5)':'transparent',fontSize:18}}>
                        {textOverlay}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Controls */}
              <div className="p-4 space-y-4">
                {type === 'text' && (
                  <textarea value={text} onChange={e=>setText(e.target.value)} placeholder="What's on your mind?"
                    className="w-full p-3 rounded-2xl bg-[var(--input-bg)] border border-[var(--border)] text-[var(--text-primary)] text-sm resize-none focus:outline-none focus:border-brand-400"
                    rows={3} />
                )}

                {type === 'image' && (
                  <div className="space-y-2">
                    <input value={textOverlay} onChange={e=>setTextOverlay(e.target.value)} placeholder="Add text overlay (optional)"
                      className="w-full p-3 rounded-2xl bg-[var(--input-bg)] border border-[var(--border)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-brand-400" />
                    <label className="flex items-center gap-2 cursor-pointer">
                      <div onClick={()=>setOverlayBg(v=>!v)}
                        className={`w-9 h-5 rounded-full transition-colors ${overlayBg?'bg-brand-500':'bg-[var(--border)]'}`}>
                        <div className={`w-4 h-4 bg-white rounded-full mt-0.5 transition-transform ${overlayBg?'translate-x-4':'translate-x-0.5'}`} />
                      </div>
                      <span className="text-xs text-[var(--text-secondary)]">Background behind text</span>
                    </label>
                  </div>
                )}

                {type === 'text' && (
                  <>
                    <div className="flex gap-2 items-center flex-wrap">
                      <button onClick={()=>setIsBold(v=>!v)}
                        className={`w-9 h-9 rounded-xl flex items-center justify-center ${isBold?'bg-brand-500 text-white':'bg-[var(--input-bg)] text-[var(--text-secondary)]'}`}>
                        <Bold size={15}/>
                      </button>
                      <button onClick={()=>setIsItalic(v=>!v)}
                        className={`w-9 h-9 rounded-xl flex items-center justify-center ${isItalic?'bg-brand-500 text-white':'bg-[var(--input-bg)] text-[var(--text-secondary)]'}`}>
                        <Italic size={15}/>
                      </button>
                      {[['left',AlignLeft],['center',AlignCenter],['right',AlignRight]].map(([a,Icon])=>(
                        <button key={a} onClick={()=>setAlign(a)}
                          className={`w-9 h-9 rounded-xl flex items-center justify-center ${align===a?'bg-brand-500 text-white':'bg-[var(--input-bg)] text-[var(--text-secondary)]'}`}>
                          <Icon size={15}/>
                        </button>
                      ))}
                      <select value={font} onChange={e=>setFont(e.target.value)}
                        className="flex-1 min-w-0 p-2 rounded-xl bg-[var(--input-bg)] border border-[var(--border)] text-[var(--text-primary)] text-xs focus:outline-none">
                        {FONTS.map(f=><option key={f} value={f}>{f}</option>)}
                      </select>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs text-[var(--text-secondary)] mb-1">
                        <span>Font Size</span><span>{fontSize}px</span>
                      </div>
                      <input type="range" min={14} max={48} value={fontSize} onChange={e=>setFontSize(Number(e.target.value))}
                        className="w-full accent-brand-500" />
                    </div>

                    <div>
                      <div className="text-xs text-[var(--text-secondary)] mb-2">Text Color</div>
                      <div className="flex gap-2 flex-wrap">
                        {TEXT_COLORS.map(c=>(
                          <button key={c} onClick={()=>setTextColor(c)}
                            className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110"
                            style={{background:c,borderColor:textColor===c?'#22c55e':'transparent'}}/>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center gap-1 text-xs text-[var(--text-secondary)] mb-2">
                        <Palette size={12}/> Background
                      </div>
                      <div className="flex gap-2 overflow-x-auto pb-1" style={{scrollbarWidth:'none'}}>
                        {BG_GRADIENTS.map(g=>(
                          <button key={g.label} onClick={()=>setBg(g.value)}
                            className="w-10 h-10 flex-shrink-0 rounded-xl border-2 transition-all"
                            style={{background:g.value,borderColor:bg===g.value?'#22c55e':'transparent',transform:bg===g.value?'scale(1.15)':'scale(1)'}}/>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                <div>
                  <div className="text-xs text-[var(--text-secondary)] mb-2">Stickers — drag to move, resize from corner</div>
                  <div className="flex gap-2 flex-wrap">
                    {STICKERS.map(e=>(
                      <button key={e} onClick={()=>addSticker(e)}
                        className="w-9 h-9 rounded-xl bg-[var(--input-bg)] hover:bg-[var(--hover)] flex items-center justify-center text-lg">
                        {e}
                      </button>
                    ))}
                  </div>
                </div>

              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
