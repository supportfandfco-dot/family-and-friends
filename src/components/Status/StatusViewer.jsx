// ═══════════════════════════════════════════════════════
//  StatusViewer — Story-style Moment Viewer
//  Family & Friends · Built by Ishrit Sachdeva
// ═══════════════════════════════════════════════════════
import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Eye, Music, Trash2, MoreVertical } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { db, doc, updateDoc, arrayUnion, deleteDoc, getDoc } from '../../firebase';
import { formatMsgTime } from '../../utils/timestamp';

const STATUS_DURATION = 5000;

export default function StatusViewer({ groups, startGroupIndex = 0, onClose }) {
  const { user } = useAuth();
  const [groupIdx, setGroupIdx]       = useState(startGroupIndex);
  const [statusIdx, setStatusIdx]     = useState(0);
  const [progress, setProgress]       = useState(0);
  const [paused, setPaused]           = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [viewerProfiles, setViewerProfiles] = useState({});
  const [closing, setClosing] = useState(false);

  const rafRef        = useRef(null);
  const musicAudioRef = useRef(null);
  const [musicPlaying, setMusicPlaying] = useState(false);
  const startTimeRef  = useRef(null);
  const pausedAtRef   = useRef(0);
  const touchStartX   = useRef(0);
  const touchStartT   = useRef(0);
  const longPressRef  = useRef(null);

  const currentGroup  = groups[groupIdx];
  const currentStatus = currentGroup?.statuses[statusIdx];
  const isOwn         = currentStatus?.uid === user?.uid;

  // ── Mark viewed ───────────────────────────────────────
  useEffect(() => {
    if (!currentStatus || !user) return;
    if (!currentStatus.viewers?.includes(user.uid)) {
      updateDoc(doc(db, 'statuses', currentStatus.id), { viewers: arrayUnion(user.uid) }).catch(() => {});
    }
  }, [currentStatus?.id]);

  // ── Fetch viewer profiles ─────────────────────────────
  useEffect(() => {
    if (!showViewers || !currentStatus?.viewers?.length) return;
    const missing = currentStatus.viewers.filter(uid => !viewerProfiles[uid]);
    if (!missing.length) return;
    Promise.all(missing.map(uid => getDoc(doc(db, 'users', uid)))).then(snaps => {
      const p = {};
      snaps.forEach(s => { if (s.exists()) p[s.id] = s.data(); });
      setViewerProfiles(prev => ({ ...prev, ...p }));
    }).catch(() => {});
  }, [showViewers, currentStatus?.id]);

  // ── Music playback ───────────────────────────────────
  useEffect(() => {
    const s = currentStatus;
    if (!s?.music?.previewUrl) {
      if (musicAudioRef.current) { musicAudioRef.current.pause(); musicAudioRef.current.src = ''; }
      setMusicPlaying(false);
      return;
    }
    const audio = new Audio(s.music.previewUrl);
    musicAudioRef.current = audio;
    audio.currentTime = s.music.segmentStart || 0;
    audio.play().then(() => setMusicPlaying(true)).catch(() => setMusicPlaying(false));
    audio.addEventListener('ended', () => setMusicPlaying(false));
    return () => { audio.pause(); audio.src = ''; setMusicPlaying(false); };
  }, [currentStatus?.id]);

  // ── Navigation ────────────────────────────────────────
  const goNext = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    pausedAtRef.current = 0;
    if (statusIdx < (groups[groupIdx]?.statuses.length ?? 1) - 1) {
      setStatusIdx(i => i + 1);
    } else if (groupIdx < groups.length - 1) {
      setGroupIdx(g => g + 1);
      setStatusIdx(0);
    } else {
      onClose();
    }
  }, [groupIdx, statusIdx, groups, onClose]);

  const goPrev = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    pausedAtRef.current = 0;
    if (statusIdx > 0) {
      setStatusIdx(i => i - 1);
    } else if (groupIdx > 0) {
      setGroupIdx(g => g - 1);
      setStatusIdx(groups[groupIdx - 1].statuses.length - 1);
    }
  }, [groupIdx, statusIdx, groups]);

  // ── Progress bar ──────────────────────────────────────
  useEffect(() => {
    setProgress(0);
    pausedAtRef.current = 0;
  }, [groupIdx, statusIdx]);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    if (paused) { pausedAtRef.current = (Date.now() - (startTimeRef.current ?? Date.now())); return; }
    startTimeRef.current = Date.now() - pausedAtRef.current;
    const tick = () => {
      const pct = Math.min(100, ((Date.now() - startTimeRef.current) / STATUS_DURATION) * 100);
      setProgress(pct);
      if (pct < 100) rafRef.current = requestAnimationFrame(tick);
      else { pausedAtRef.current = 0; goNext(); }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [paused, groupIdx, statusIdx, goNext]);

  // ── Touch handlers ────────────────────────────────────
  const onTouchStart = (e) => {
    // Don't handle touches on overlay UI elements
    touchStartX.current = e.touches?.[0]?.clientX ?? e.clientX;
    touchStartT.current = Date.now();
    longPressRef.current = setTimeout(() => setPaused(true), 300);
  };

  const onTouchEnd = (e) => {
    clearTimeout(longPressRef.current);
    if (paused) { setPaused(false); return; }
    const elapsed = Date.now() - touchStartT.current;
    const endX = e.changedTouches?.[0]?.clientX ?? e.clientX;
    const dx = endX - touchStartX.current;
    if (Math.abs(dx) > 50) { dx > 0 ? goPrev() : goNext(); return; }
    if (elapsed < 250) { endX < window.innerWidth / 2 ? goPrev() : goNext(); }
  };

  // ── Delete ────────────────────────────────────────────
  const animatedClose = useCallback(() => {
    setClosing(true);
    setTimeout(() => onClose(), 280);
  }, [onClose]);

  const handleDelete = async () => {
    try { await deleteDoc(doc(db, 'statuses', currentStatus.id)); goNext(); } catch {}
  };

  if (!currentGroup || !currentStatus) return null;

  // ── Content renderer ──────────────────────────────────
  const renderContent = () => {
    const s = currentStatus;
    if (s.type === 'text') return (
      <div className="absolute inset-0 flex items-center justify-center p-8"
        style={{ background: s.bg || 'linear-gradient(135deg,#052e16,#16a34a)' }}>
        {s.stickers?.map((st, i) => (
          <span key={i} className="absolute text-4xl select-none pointer-events-none"
            style={{ left:`${st.x}%`, top:`${st.y}%`, transform:'translate(-50%,-50%)' }}>{st.emoji}</span>
        ))}
        <p style={{
          color: s.textColor||'#fff', fontSize: s.fontSize||24,
          textAlign: s.align||'center', fontFamily: s.font||'Nunito',
          fontWeight: s.isBold?'bold':'normal', fontStyle: s.isItalic?'italic':'normal',
          lineHeight:1.4, wordBreak:'break-word', maxWidth:'100%', position:'relative', zIndex:1
        }}>{s.text}</p>
      </div>
    );
    if (s.type === 'image') return (
      <div className="absolute inset-0 bg-black overflow-hidden">
        {/* Blurred background */}
        <img src={s.mediaUrl} alt="" className="absolute inset-0 w-full h-full object-cover scale-110 blur-xl opacity-40" />
        {/* Actual image - contain */}
        <img src={s.mediaUrl} alt="" className="absolute inset-0 w-full h-full object-contain" />
        {s.stickers?.map((st, i) => (
          <span key={i} className="absolute text-4xl select-none pointer-events-none"
            style={{ left:`${st.x}%`, top:`${st.y}%`, transform:'translate(-50%,-50%)' }}>{st.emoji}</span>
        ))}
        {s.textOverlay && (
          <div className="absolute px-3 py-1 rounded-lg font-bold" style={{
            left:`${s.overlayPos?.x||50}%`, top:`${s.overlayPos?.y||80}%`,
            transform:'translate(-50%,-50%)', color:s.overlayColor||'#fff',
            background:s.overlayBg?'rgba(0,0,0,0.5)':'transparent',
            fontSize:18, maxWidth:'80%', wordBreak:'break-word', textAlign:'center'
          }}>{s.textOverlay}</div>
        )}
      </div>
    );
    return <div className="absolute inset-0 bg-gray-900 flex items-center justify-center"><p className="text-white/40">Media unavailable</p></div>;
  };

  // ══════════════════════════════════════════════════════
  return (
    <div className={`fixed inset-0 z-[300] bg-black ${closing ? 'animate-fade-out' : 'animate-zoom-in'}`}
      onMouseDown={onTouchStart} onMouseUp={onTouchEnd}
      onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
      style={{ userSelect:'none' }}>

      {/* ── CONTENT ── */}
      {renderContent()}

      {/* ── PROGRESS BARS ── */}
      <div className="absolute top-0 left-0 right-0 z-10 flex gap-1 p-3 pt-4">
        {currentGroup.statuses.map((_, i) => (
          <div key={i} className="flex-1 h-0.5 bg-white/30 rounded-full overflow-hidden">
            <div className="h-full bg-white rounded-full"
              style={{ width: i < statusIdx ? '100%' : i === statusIdx ? `${progress}%` : '0%', transition: 'none' }} />
          </div>
        ))}
      </div>

      {/* ── TOP BAR ── */}
      <div className="absolute top-6 left-0 right-0 z-10 px-4 pt-2 flex items-center gap-3"
        onMouseDown={e=>e.stopPropagation()} onMouseUp={e=>e.stopPropagation()}
        onTouchStart={e=>e.stopPropagation()} onTouchEnd={e=>e.stopPropagation()}>
        {/* Avatar */}
        <div className="w-9 h-9 rounded-full overflow-hidden border-2 border-brand-400 flex-shrink-0">
          {currentGroup.avatar
            ? <img src={currentGroup.avatar} alt="" className="w-full h-full object-cover"/>
            : <div className="w-full h-full bg-brand-800 flex items-center justify-center text-white font-bold text-sm">
                {currentGroup.name?.[0]?.toUpperCase()}
              </div>}
        </div>
        {/* Name + time */}
        <div className="flex-1">
          <div className="text-white font-bold text-sm">{currentGroup.name}</div>
          <div className="text-white/60 text-xs">
            {formatMsgTime(currentStatus.createdAt) || 'Just now'}
          </div>
        </div>
        {/* Music badge */}
        {currentStatus.music && (
          <div className="flex items-center gap-1 bg-black/40 rounded-full px-2 py-1">
            <Music size={10} className="text-brand-400 animate-pulse"/>
            <span className="text-white text-xs truncate max-w-[80px]">{currentStatus.music.title}</span>
          </div>
        )}
        {/* 3-dots (only for own — shows delete) */}
        {isOwn && (
          <button onClick={e=>{e.stopPropagation(); setShowOptions(v=>!v);}}
            className="w-8 h-8 rounded-full bg-black/30 flex items-center justify-center">
            <MoreVertical size={16} className="text-white"/>
          </button>
        )}
        {/* Close */}
        <button onClick={e=>{e.stopPropagation(); animatedClose();}}
          className="w-8 h-8 rounded-full bg-black/30 flex items-center justify-center">
          <X size={16} className="text-white"/>
        </button>
      </div>

      {/* ── OPTIONS MENU ── */}
      {showOptions && isOwn && (
        <div className="absolute top-20 right-4 z-20 bg-[var(--sidebar-bg)] rounded-2xl shadow-2xl border border-[var(--border)] overflow-hidden min-w-[140px] animate-slide-down"
          onMouseDown={e=>e.stopPropagation()} onMouseUp={e=>e.stopPropagation()}
          onTouchStart={e=>e.stopPropagation()} onTouchEnd={e=>e.stopPropagation()}
          onClick={e=>e.stopPropagation()}>
          <button onClick={handleDelete}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-500/10 text-red-500 text-sm">
            <Trash2 size={14}/> Delete
          </button>
        </div>
      )}

      {/* ── VIEWS BUTTON (bottom center, own only) ── */}
      {isOwn && (
        <div className="absolute bottom-10 left-0 right-0 z-10 flex justify-center animate-slide-up"
          onMouseDown={e=>e.stopPropagation()} onMouseUp={e=>e.stopPropagation()}
          onTouchStart={e=>e.stopPropagation()} onTouchEnd={e=>e.stopPropagation()}>
          <button onClick={e=>{e.stopPropagation(); setShowViewers(true);}}
            className="flex items-center gap-2 bg-black/50 backdrop-blur-sm border border-white/20 rounded-full px-5 py-2.5 active:scale-95 transition-transform">
            <Eye size={16} className="text-white"/>
            <span className="text-white font-bold text-sm">{currentStatus.viewers?.length || 0}</span>
            <span className="text-white/70 text-sm">{currentStatus.viewers?.length === 1 ? 'view' : 'views'}</span>
          </button>
        </div>
      )}

      {/* ── PAUSED INDICATOR ── */}
      {paused && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <div className="bg-black/40 rounded-full px-5 py-2">
            <span className="text-white text-sm font-bold">Paused</span>
          </div>
        </div>
      )}

      {/* ── VIEWER LIST SHEET ── */}
      {showViewers && (
        <div className="absolute inset-0 z-30 flex items-end"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onMouseDown={e=>e.stopPropagation()} onMouseUp={e=>e.stopPropagation()}
          onTouchStart={e=>e.stopPropagation()} onTouchEnd={e=>e.stopPropagation()}
          onClick={()=>setShowViewers(false)}>
          <div className="w-full bg-[var(--sidebar-bg)] rounded-t-3xl p-6 max-h-[55vh] overflow-y-auto animate-sheet-up"
            onClick={e=>e.stopPropagation()}>
            {/* Handle bar */}
            <div className="w-10 h-1 bg-[var(--border)] rounded-full mx-auto mb-5"/>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-[var(--text-primary)] flex items-center gap-2">
                <Eye size={16} className="text-brand-500"/>
                {currentStatus.viewers?.length || 0} {currentStatus.viewers?.length === 1 ? 'View' : 'Views'}
              </h3>
              <button onClick={()=>setShowViewers(false)}
                className="w-8 h-8 rounded-full bg-[var(--input-bg)] flex items-center justify-center">
                <X size={16} className="text-[var(--text-secondary)]"/>
              </button>
            </div>
            {currentStatus.viewers?.length > 0
              ? currentStatus.viewers.map(uid => (
                <div key={uid} className="flex items-center gap-3 py-3 border-b border-[var(--border)] last:border-0">
                  <div className="w-10 h-10 rounded-full bg-brand-500/20 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {viewerProfiles[uid]?.avatar
                      ? <img src={viewerProfiles[uid].avatar} alt="" className="w-full h-full object-cover"/>
                      : <span className="text-brand-500 font-bold text-sm">
                          {uid === user?.uid ? 'Y' : (viewerProfiles[uid]?.name?.[0] || '?').toUpperCase()}
                        </span>}
                  </div>
                  <span className="text-sm text-[var(--text-primary)]">
                    {uid === user?.uid ? 'You' : (viewerProfiles[uid]?.name || uid.slice(0,8)+'...')}
                  </span>
                </div>
              ))
              : <p className="text-[var(--text-secondary)] text-sm text-center py-8">No views yet</p>
            }
          </div>
        </div>
      )}
    </div>
  );
}
