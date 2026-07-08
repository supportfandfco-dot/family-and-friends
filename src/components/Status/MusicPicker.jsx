// ═══════════════════════════════════════════════════════
//  MusicPicker — Deezer Music Browser + Preview Player
//  Family & Friends · Built by Ishrit Sachdeva
// ═══════════════════════════════════════════════════════
import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Search, Play, Pause, Check, Music, Loader } from 'lucide-react';

// All requests go through Vite's local proxy → api.deezer.com
const API = '/deezer';

const CATEGORIES = [
  { id: 'trending',  label: '🔥 Trending',  query: null },          // uses /chart
  { id: 'bollywood', label: '🎬 Bollywood', query: 'bollywood' },
  { id: 'punjabi',   label: '🎵 Punjabi',   query: 'punjabi hits' },
  { id: 'hindi',     label: '🎶 Hindi',     query: 'hindi songs' },
  { id: 'english',   label: '🌍 English',   query: 'pop hits' },
  { id: 'indie',     label: '🎸 Indie',     query: 'indie pop' },
  { id: 'classics',  label: '👑 Classics',  query: 'classic hits' },
];

async function fetchTracks(query) {
  const url = query
    ? `${API}/search?q=${encodeURIComponent(query)}&limit=40`
    : `${API}/chart/0/tracks?limit=40`;
  const res  = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const list = json.data || json.tracks?.data || [];
  return list.filter(t => t.preview);
}

function fmt(sec) {
  const s = Math.floor(sec || 0);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function MusicPicker({ onSelect, onClose, momentDuration = 30 }) {
  const [category, setCategory] = useState('trending');
  const [tracks,   setTracks]   = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [searchQ,  setSearchQ]  = useState('');
  const [searching,setSearching]= useState(false);
  const [selected, setSelected] = useState(null); // track object to attach

  // Playback state
  const [playingId,    setPlayingId]    = useState(null);
  const [currentTime,  setCurrentTime]  = useState(0);
  const [audioDuration,setAudioDuration]= useState(30);
  const [segStart,     setSegStart]     = useState(0);
  const audioRef = useRef(new Audio());
  const segLen   = Math.min(30, momentDuration);

  // ── Load category tracks ──────────────────────────────
  const loadCategory = useCallback(async (cat) => {
    setLoading(true); setError(null); setTracks([]);
    try {
      const q = CATEGORIES.find(c => c.id === cat)?.query ?? null;
      setTracks(await fetchTracks(q));
    } catch (e) {
      setError(`Could not load songs. Error: ${e.message}. Open DevTools console for details.`);
    }
    setLoading(false);
  }, []);

  useEffect(() => { if (!searchQ) loadCategory(category); }, [category, searchQ]);

  // ── Search ────────────────────────────────────────────
  useEffect(() => {
    if (!searchQ.trim()) return;
    const t = setTimeout(async () => {
      setSearching(true); setError(null);
      try { setTracks(await fetchTracks(searchQ)); }
      catch { setError('Search failed.'); }
      setSearching(false);
    }, 500);
    return () => clearTimeout(t);
  }, [searchQ]);

  // ── Audio setup ───────────────────────────────────────
  useEffect(() => {
    const audio = audioRef.current;

    const onMeta  = () => { setAudioDuration(audio.duration); audio.currentTime = segStart; };
    const onTime  = () => {
      setCurrentTime(audio.currentTime);
      if (audio.currentTime >= segStart + segLen) {
        audio.currentTime = segStart; // loop segment
      }
    };
    const onEnded = () => { audio.currentTime = segStart; audio.play().catch(() => {}); };

    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('ended', onEnded);
    };
  }, [segStart, segLen]);

  // ── Cleanup on unmount ────────────────────────────────
  useEffect(() => {
    return () => { audioRef.current.pause(); audioRef.current.src = ''; };
  }, []);

  // ── Play / pause track ────────────────────────────────
  const handlePlay = (track) => {
    const audio = audioRef.current;
    if (playingId === track.id) {
      if (audio.paused) { audio.play().catch(() => {}); setPlayingId(track.id); }
      else              { audio.pause(); setPlayingId(null); }
      return;
    }
    setPlayingId(track.id);
    setSegStart(0);
    setCurrentTime(0);
    audio.src = track.preview;
    audio.load();
    // play starts via onMeta → sets currentTime → plays
    audio.addEventListener('loadedmetadata', () => audio.play().catch(() => {}), { once: true });
  };

  const stopAudio = () => {
    audioRef.current.pause();
    audioRef.current.src = '';
    setPlayingId(null);
    setCurrentTime(0);
  };

  // ── Seekbar click ─────────────────────────────────────
  const handleSeek = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct  = (e.clientX - rect.left) / rect.width;
    const t    = Math.max(0, Math.min(pct * audioDuration, audioDuration));
    audioRef.current.currentTime = t;
    setCurrentTime(t);
    setSegStart(Math.max(0, Math.min(t, audioDuration - segLen)));
  };

  // ── Segment drag ──────────────────────────────────────
  const handleSegDrag = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct  = Math.max(0, Math.min((e.clientX - rect.left) / rect.width, 1));
    const t    = Math.max(0, Math.min(pct * audioDuration, audioDuration - segLen));
    setSegStart(t);
    audioRef.current.currentTime = t;
  };

  const startSegDrag = (e) => {
    e.preventDefault();
    handleSegDrag(e);
    const move = (ev) => handleSegDrag(ev);
    const up   = ()   => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup',   up);
  };

  // ── Confirm ───────────────────────────────────────────
  const handleConfirm = () => {
    if (!selected) return;
    stopAudio();
    onSelect({
      title:           selected.title,
      artist:          selected.artist?.name,
      cover:           selected.album?.cover_small,
      previewUrl:      selected.preview,
      segmentStart:    segStart,
      segmentDuration: segLen,
    });
  };

  const playingTrack = tracks.find(t => t.id === playingId);

  // ══════════════════════════════════════════════════════
  return (
    <div className="fixed inset-0 z-[400] flex flex-col bg-[var(--sidebar-bg)] animate-slide-up">

      {/* ── HEADER ── */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-[var(--border)] flex-shrink-0">
        <button onClick={() => { stopAudio(); onClose(); }}
          className="w-9 h-9 rounded-full hover:bg-[var(--hover)] flex items-center justify-center">
          <X size={20} className="text-[var(--text-secondary)]" />
        </button>
        <h2 className="flex-1 font-display font-bold text-[var(--text-primary)]">Add Music</h2>
        {selected && (
          <button onClick={handleConfirm}
            className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-full text-sm font-bold transition-colors">
            <Check size={14} /> Add to Moment
          </button>
        )}
      </div>

      {/* ── SEARCH ── */}
      <div className="px-4 py-3 border-b border-[var(--border)] flex-shrink-0">
        <div className="flex items-center gap-2 bg-[var(--input-bg)] rounded-2xl px-3 py-2.5">
          <Search size={15} className="text-[var(--text-secondary)]" />
          <input value={searchQ} onChange={e => setSearchQ(e.target.value)}
            placeholder="Search songs, artists..."
            className="flex-1 bg-transparent text-[var(--text-primary)] text-sm outline-none placeholder:text-[var(--text-secondary)]" />
          {searching && <Loader size={14} className="text-brand-500 animate-spin" />}
          {searchQ && (
            <button onClick={() => setSearchQ('')}>
              <X size={14} className="text-[var(--text-secondary)]" />
            </button>
          )}
        </div>
      </div>

      {/* ── CATEGORIES ── */}
      {!searchQ && (
        <div className="flex gap-2 px-4 py-3 overflow-x-auto flex-shrink-0 border-b border-[var(--border)]"
          style={{ scrollbarWidth: 'none' }}>
          {CATEGORIES.map(c => (
            <button key={c.id} onClick={() => setCategory(c.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                category === c.id
                  ? 'bg-brand-500 text-white'
                  : 'bg-[var(--input-bg)] text-[var(--text-secondary)] hover:bg-[var(--hover)]'
              }`}>{c.label}</button>
          ))}
        </div>
      )}

      {/* ── TRACK LIST ── */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader size={32} className="text-brand-500 animate-spin" />
            <span className="text-sm text-[var(--text-secondary)]">Loading songs...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 px-8 text-center gap-3">
            <Music size={40} className="text-[var(--text-secondary)]" />
            <p className="text-[var(--text-secondary)] text-sm">{error}</p>
            <button onClick={() => loadCategory(category)}
              className="px-4 py-2 rounded-full bg-brand-500 text-white text-sm font-bold">
              Retry
            </button>
          </div>
        ) : tracks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-8 gap-3">
            <Music size={40} className="text-[var(--text-secondary)]" />
            <p className="text-[var(--text-secondary)] text-sm">No songs found</p>
          </div>
        ) : (
          <div>
            {tracks.map(track => {
              const isPlaying  = playingId === track.id && !audioRef.current.paused;
              const isPaused   = playingId === track.id && audioRef.current.paused;
              const isSelected = selected?.id === track.id;

              return (
                <div key={track.id}
                  className={`flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] transition-colors ${
                    isSelected ? 'bg-brand-500/10' : 'hover:bg-[var(--hover)]'
                  }`}>

                  {/* Album art + play button */}
                  <div className="relative w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-[var(--input-bg)]">
                    {track.album?.cover_small
                      ? <img src={track.album.cover_small} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center">
                          <Music size={18} className="text-[var(--text-secondary)]" />
                        </div>
                    }
                    <button onClick={() => handlePlay(track)}
                      className="absolute inset-0 flex items-center justify-center bg-black/50 hover:bg-black/70 transition-colors">
                      {isPlaying
                        ? <Pause size={18} className="text-white" />
                        : <Play  size={18} className="text-white"  />}
                    </button>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handlePlay(track)}>
                    <div className={`font-bold text-sm truncate ${isSelected ? 'text-brand-500' : 'text-[var(--text-primary)]'}`}>
                      {track.title}
                    </div>
                    <div className="text-xs text-[var(--text-secondary)] truncate">{track.artist?.name}</div>
                    {/* Live waveform when playing */}
                    {isPlaying && (
                      <div className="flex gap-0.5 items-end h-3 mt-1">
                        {[2,4,3,5,2,4,3,5,2,4].map((h, i) => (
                          <div key={i} className="w-0.5 bg-brand-500 rounded-full"
                            style={{ height: `${h * 2}px`, animation: `bounce 0.55s ease-in-out ${i * 0.07}s infinite` }} />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Select toggle */}
                  <button onClick={() => setSelected(isSelected ? null : track)}
                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-all flex-shrink-0 ${
                      isSelected
                        ? 'bg-brand-500 text-white'
                        : 'border-2 border-[var(--border)] text-[var(--text-secondary)] hover:border-brand-400'
                    }`}>
                    {isSelected ? <Check size={14} /> : <span className="text-base leading-none">+</span>}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── MINI PLAYER + SEGMENT PICKER ── */}
      {playingTrack && (
        <div className="flex-shrink-0 border-t-2 border-brand-500/30 bg-[var(--sidebar-bg)] p-4 space-y-4 animate-slide-up">

          {/* Track info row */}
          <div className="flex items-center gap-3">
            {playingTrack.album?.cover_small && (
              <img src={playingTrack.album.cover_small} alt=""
                className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm text-[var(--text-primary)] truncate">{playingTrack.title}</div>
              <div className="text-xs text-[var(--text-secondary)]">{playingTrack.artist?.name}</div>
            </div>
            <button onClick={stopAudio}
              className="w-7 h-7 rounded-full bg-[var(--input-bg)] flex items-center justify-center">
              <X size={13} className="text-[var(--text-secondary)]" />
            </button>
          </div>

          {/* Seekbar */}
          <div>
            <div className="relative h-8 flex items-center cursor-pointer select-none" onClick={handleSeek}>
              <div className="absolute inset-x-0 h-1.5 bg-[var(--border)] rounded-full">
                {/* Played progress */}
                <div className="absolute h-full bg-[var(--border)] rounded-full"
                  style={{ width: `${(currentTime / audioDuration) * 100}%`, background: 'rgba(34,197,94,0.3)' }} />
                {/* Selected segment highlight */}
                <div className="absolute h-full bg-brand-500 rounded-full"
                  style={{ left: `${(segStart / audioDuration) * 100}%`, width: `${(segLen / audioDuration) * 100}%` }} />
                {/* Playhead dot */}
                <div className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white border-2 border-brand-500 shadow-md"
                  style={{ left: `calc(${(currentTime / audioDuration) * 100}% - 7px)` }} />
              </div>
            </div>
            <div className="flex justify-between text-xs mt-1">
              <span className="text-[var(--text-secondary)]">{fmt(currentTime)}</span>
              <span className="text-brand-500 font-bold">
                ✂ {fmt(segStart)} – {fmt(segStart + segLen)}
              </span>
              <span className="text-[var(--text-secondary)]">{fmt(audioDuration)}</span>
            </div>
          </div>

          {/* Segment drag */}
          <div>
            <p className="text-xs text-[var(--text-secondary)] mb-2">
              Drag to pick your <span className="text-brand-500 font-bold">{segLen}s</span> clip
            </p>
            <div className="relative h-10 flex items-center select-none cursor-ew-resize"
              onMouseDown={startSegDrag}>
              {/* Track background */}
              <div className="absolute inset-x-0 h-3 bg-[var(--input-bg)] rounded-full overflow-hidden">
                {/* Segment fill */}
                <div className="absolute h-full bg-brand-500/30 rounded-full"
                  style={{ left: `${(segStart / audioDuration) * 100}%`, width: `${(segLen / audioDuration) * 100}%` }} />
              </div>
              {/* Draggable segment handle */}
              <div className="absolute h-8 bg-brand-500 rounded-xl border-2 border-white shadow-lg flex items-center justify-center gap-1"
                style={{
                  left:     `${(segStart / audioDuration) * 100}%`,
                  width:    `${(segLen / audioDuration) * 100}%`,
                  minWidth: '44px'
                }}>
                <span className="text-white text-[10px] font-bold">{segLen}s</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
