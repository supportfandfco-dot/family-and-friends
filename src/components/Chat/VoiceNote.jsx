// ═══════════════════════════════════════════════════════
//  VoiceNote — Record & Playback Voice Messages
//  Family & Friends  ·  Built by Ishrit Sachdeva
// ═══════════════════════════════════════════════════════
import { useState, useRef, useEffect } from 'react';
import { Square, Play, Pause, Trash2, Send } from 'lucide-react';

const fmt = s => {
  const total = Math.max(0, Math.floor(s));
  return `${Math.floor(total/60).toString().padStart(2,'0')}:${(total%60).toString().padStart(2,'0')}`;
};

function getBestMime() {
  // Prefer mp4/aac as it has widest support for data URLs and playback
  const types = [
    'audio/mp4',
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
  ];
  for (const t of types) {
    try { if (MediaRecorder.isTypeSupported(t)) return t; } catch {}
  }
  return '';
}

// Convert a data URL back to a Blob URL for reliable <audio> playback
function dataUrlToBlobUrl(dataUrl) {
  try {
    const [header, b64] = dataUrl.split(',');
    const mimeMatch = header.match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'audio/webm';
    const bytes = atob(b64);
    const buf = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i);
    const blob = new Blob([buf], { type: mime });
    return URL.createObjectURL(blob);
  } catch {
    return dataUrl; // fallback
  }
}

// ══════════════════════════════════════════════════════
//  VoiceRecorder
// ══════════════════════════════════════════════════════
export function VoiceRecorder({ onSend, onCancel }) {
  const [phase, setPhase]       = useState('idle');
  const [seconds, setSeconds]   = useState(0);
  const [finalSec, setFinalSec] = useState(0);
  const [blobUrl, setBlobUrl]   = useState(null);
  const [playing, setPlaying]   = useState(false);
  const [progress, setProgress] = useState(0);
  const [errMsg, setErrMsg]     = useState('');

  const mrRef      = useRef(null);
  const chunksRef  = useRef([]);
  const streamRef  = useRef(null);
  const blobRef    = useRef(null);
  const audioRef   = useRef(null);
  const tickRef    = useRef(null);
  const secRef     = useRef(0);
  const initedRef  = useRef(false);
  const blobUrlRef = useRef(null); // track for cleanup

  useEffect(() => { startRec(); return doCleanup; }, []);

  function doCleanup() {
    clearTick();
    streamRef.current?.getTracks().forEach(t => t.stop());
    // revoke blob URL to free memory
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
  }

  function clearTick() {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
  }

  async function startRec() {
    if (initedRef.current) return;
    initedRef.current = true;
    chunksRef.current = [];
    secRef.current = 0;
    setSeconds(0);

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch {
      setErrMsg('Microphone access denied. Check browser permissions.');
      setPhase('error');
      return;
    }
    streamRef.current = stream;

    const mime = getBestMime();
    let mr;
    try { mr = new MediaRecorder(stream, mime ? { mimeType: mime } : {}); }
    catch { mr = new MediaRecorder(stream); }
    mrRef.current = mr;

    mr.ondataavailable = e => {
      if (e.data?.size > 0) chunksRef.current.push(e.data);
    };

    mr.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      if (!chunksRef.current.length) {
        setErrMsg('No audio captured. Try again.');
        setPhase('error');
        return;
      }
      const recordedMime = mr.mimeType || mime || 'audio/webm';
      const blob = new Blob(chunksRef.current, { type: recordedMime });
      if (blob.size < 100) {
        setErrMsg('Recording too short. Try again.');
        setPhase('error');
        return;
      }
      blobRef.current = blob;
      const url = URL.createObjectURL(blob);
      blobUrlRef.current = url;
      setBlobUrl(url);
      setPhase('preview');
    };

    mr.onerror = () => { setErrMsg('Recording error.'); setPhase('error'); };
    mr.start(150); // small chunks for smoother waveform
    setPhase('recording');

    tickRef.current = setInterval(() => {
      secRef.current += 1;
      setSeconds(s => s + 1);
      if (secRef.current >= 300) stopRec();
    }, 1000);
  }

  function stopRec() {
    clearTick();
    const dur = secRef.current;
    setFinalSec(dur < 1 ? 1 : dur);
    if (mrRef.current?.state !== 'inactive') {
      try { mrRef.current.requestData(); } catch {}
      setTimeout(() => {
        try { mrRef.current?.stop(); } catch {}
      }, 150);
    }
    setPhase('stopping');
  }

  function handleSend() {
    if (!blobRef.current || blobRef.current.size < 100) return;
    onSend(blobRef.current, finalSec || secRef.current || 1);
  }

  function handleDiscard() {
    clearTick();
    if (mrRef.current?.state !== 'inactive') try { mrRef.current.stop(); } catch {}
    streamRef.current?.getTracks().forEach(t => t.stop());
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    onCancel();
  }

  function togglePlay() {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play().catch(() => {});
      setPlaying(true);
    }
  }

  if (phase === 'error') return (
    <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/40 rounded-2xl px-4 py-2.5 animate-slide-up">
      <span className="text-sm text-red-400 flex-1">{errMsg}</span>
      <button onClick={onCancel} className="text-xs text-red-400 underline">Dismiss</button>
    </div>
  );

  if (phase === 'idle') return (
    <div className="flex items-center gap-3 bg-[var(--input-bg)] border border-brand-400/40 rounded-2xl px-4 py-2.5">
      <div className="w-5 h-5 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin flex-shrink-0"/>
      <span className="text-sm text-[var(--text-secondary)] flex-1">Starting mic…</span>
      <button onClick={onCancel}><Trash2 size={15} className="text-[var(--text-secondary)]"/></button>
    </div>
  );

  if (phase === 'recording') return (
    <div className="flex items-center gap-3 bg-[var(--input-bg)] border border-red-500/40 rounded-2xl px-4 py-2.5 animate-slide-up">
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse flex-shrink-0"/>
        <div className="flex items-end gap-0.5 h-6">
          {[3,6,9,5,8,4,7,10,5,8,6,9,4,7,3].map((h,i) => (
            <div key={i} className="rounded-full bg-red-400"
              style={{width:'2.5px',height:`${h*2}px`,animation:`wave 0.8s ease-in-out ${i*0.06}s infinite`}}/>
          ))}
        </div>
        <span className="text-sm font-mono text-red-500 ml-1 flex-shrink-0 tabular-nums">{fmt(seconds)}</span>
      </div>
      <button onClick={stopRec}
        className="w-9 h-9 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white transition-all flex-shrink-0 active:scale-95">
        <Square size={13} fill="white"/>
      </button>
    </div>
  );

  if (phase === 'stopping') return (
    <div className="flex items-center gap-3 bg-[var(--input-bg)] border border-brand-400/40 rounded-2xl px-4 py-2.5">
      <div className="w-5 h-5 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin flex-shrink-0"/>
      <span className="text-sm text-[var(--text-secondary)] flex-1">Processing…</span>
      <span className="text-sm font-mono text-[var(--text-secondary)] tabular-nums">{fmt(finalSec)}</span>
    </div>
  );

  if (phase === 'preview') return (
    <div className="flex items-center gap-3 bg-[var(--input-bg)] border border-brand-400/40 rounded-2xl px-4 py-2.5 animate-slide-up">
      {/* Hidden audio player — uses blob URL for reliable playback */}
      <audio
        ref={audioRef}
        src={blobUrl}
        preload="auto"
        onTimeUpdate={() => {
          if (!audioRef.current) return;
          const d = audioRef.current.duration;
          if (d && isFinite(d) && d > 0) {
            setProgress(audioRef.current.currentTime / d * 100);
          }
        }}
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
          if (audioRef.current) audioRef.current.currentTime = 0;
        }}
        onLoadedMetadata={() => {
          const d = audioRef.current?.duration;
          if (d && isFinite(d) && d > 0) {
            setFinalSec(Math.ceil(d));
          }
        }}
      />
      <button onClick={togglePlay}
        className="w-9 h-9 rounded-full bg-brand-500 hover:bg-brand-600 flex items-center justify-center text-white flex-shrink-0 active:scale-95">
        {playing ? <Pause size={14}/> : <Play size={14}/>}
      </button>
      <div className="flex-1 flex flex-col gap-1.5">
        <div className="h-1.5 bg-[var(--border)] rounded-full overflow-hidden cursor-pointer"
          onClick={e => {
            if (!audioRef.current?.duration || !isFinite(audioRef.current.duration)) return;
            const r = e.currentTarget.getBoundingClientRect();
            const p = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
            audioRef.current.currentTime = p * audioRef.current.duration;
            setProgress(p * 100);
          }}>
          <div className="h-full bg-brand-500 rounded-full transition-all duration-100" style={{width:progress+'%'}}/>
        </div>
        <span className="text-xs font-mono text-[var(--text-secondary)] tabular-nums">{fmt(finalSec)}</span>
      </div>
      <button onClick={handleDiscard}
        className="w-8 h-8 rounded-full hover:bg-red-500/10 flex items-center justify-center text-red-500 flex-shrink-0 transition-all">
        <Trash2 size={15}/>
      </button>
      <button onClick={handleSend}
        className="w-9 h-9 rounded-full bg-brand-500 hover:bg-brand-600 flex items-center justify-center text-white flex-shrink-0 active:scale-95 transition-all">
        <Send size={14}/>
      </button>
    </div>
  );

  return null;
}

// ══════════════════════════════════════════════════════
//  VoiceMessage — Playback bubble (for received messages)
// ══════════════════════════════════════════════════════
export function VoiceMessage({ url, duration, isOwn }) {
  const [playing, setPlaying]   = useState(false);
  const [progress, setProgress] = useState(0);
  const [current, setCurrent]   = useState(0);
  const [errored, setErrored]   = useState(false);
  const [blobUrl, setBlobUrl]   = useState(null);
  const audioRef  = useRef(null);
  const blobRef   = useRef(null); // track for cleanup
  const bars = [4,8,12,6,14,10,5,9,13,7,11,8,15,6,10,12,4,9,7,11,6,8,5,9];
  const filled = Math.round((progress / 100) * bars.length);

  // Convert data URL → blob URL once for reliable cross-browser playback
  useEffect(() => {
    if (!url) return;
    let objUrl;
    if (url.startsWith('data:')) {
      objUrl = dataUrlToBlobUrl(url);
      blobRef.current = objUrl;
      setBlobUrl(objUrl);
    } else {
      setBlobUrl(url); // already a regular URL
    }
    return () => {
      if (objUrl) URL.revokeObjectURL(objUrl);
    };
  }, [url]);

  function togglePlay() {
    if (!audioRef.current || errored || !blobUrl) return;
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play().catch(() => setErrored(true));
      setPlaying(true);
    }
  }

  if (!blobUrl) return (
    <div className="flex items-center gap-2 opacity-50" style={{minWidth:'180px'}}>
      <div className="w-10 h-10 rounded-full bg-brand-500/30 flex items-center justify-center">
        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
      </div>
      <span className="text-xs text-[var(--text-secondary)]">Loading…</span>
    </div>
  );

  return (
    <div className="flex items-center gap-2.5" style={{minWidth:'180px',maxWidth:'260px'}}>
      <audio
        ref={audioRef}
        src={blobUrl}
        preload="auto"
        onTimeUpdate={() => {
          if (!audioRef.current) return;
          const d = audioRef.current.duration;
          if (d && isFinite(d) && d > 0) {
            setCurrent(audioRef.current.currentTime);
            setProgress(audioRef.current.currentTime / d * 100);
          }
        }}
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
          setCurrent(0);
          if (audioRef.current) audioRef.current.currentTime = 0;
        }}
        onError={(e) => {
          console.warn('VoiceMessage audio error:', e);
          setErrored(true);
        }}
      />
      <button onClick={togglePlay} disabled={errored}
        className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-white transition-all active:scale-95
          ${errored ? 'opacity-40 cursor-not-allowed' : ''}
          ${isOwn ? 'bg-white/20 hover:bg-white/30' : 'bg-brand-500 hover:bg-brand-600'}`}>
        {playing ? <Pause size={16}/> : <Play size={16}/>}
      </button>
      <div className="flex-1">
        <div className="flex items-center gap-[2px] h-8 cursor-pointer"
          onClick={e => {
            if (!audioRef.current?.duration || !isFinite(audioRef.current.duration)) return;
            const r = e.currentTarget.getBoundingClientRect();
            const p = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
            audioRef.current.currentTime = p * audioRef.current.duration;
            setProgress(p * 100);
          }}>
          {bars.map((h, i) => {
            const isFilled = i < filled;
            const isActive = playing && Math.abs(i - filled) <= 2;
            const animatedH = isActive ? h * (1 + 0.4 * Math.sin(Date.now() / 150 + i)) : h;
            return (
              <div key={i} className="rounded-full flex-shrink-0 transition-all duration-75" style={{
                width: '2.5px',
                height: `${Math.max(3, isActive ? animatedH : h)}px`,
                background: isFilled
                  ? (isOwn ? 'rgba(255,255,255,0.9)' : '#16a34a')
                  : (isOwn ? 'rgba(255,255,255,0.3)' : 'rgba(22,163,74,0.3)'),
                animation: isActive ? `voice-pulse ${0.3 + i * 0.05}s ease-in-out infinite alternate` : 'none',
              }}/>
            );
          })}
        </div>
        <span className="text-[11px] font-mono tabular-nums block" style={{opacity:0.55}}>
          {errored ? '⚠ error' : playing ? fmt(current) : fmt(duration || 0)}
        </span>
      </div>
    </div>
  );
}
