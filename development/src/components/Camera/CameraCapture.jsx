// ═══════════════════════════════════════════════════════
//  CameraCapture — Live Camera with Front/Back Flip
//  Family & Friends  ·  Built by Ishrit Sachdeva
// ═══════════════════════════════════════════════════════
import { useState, useRef, useEffect, useCallback } from 'react';
import { X, RefreshCw, AlertCircle } from 'lucide-react';

export default function CameraCapture({ onCapture, onClose }) {
  const videoRef   = useRef(null);
  const canvasRef  = useRef(null);
  const streamRef  = useRef(null);
  const mountedRef = useRef(true);
  const genRef     = useRef(0);   // incremented on each startCamera call; stale callbacks bail out

  const [facing, setFacing]         = useState('user');
  const [hasBack, setHasBack]       = useState(false);
  const [ready, setReady]           = useState(false);
  const [capturing, setCapturing]   = useState(false);
  const [noBackMsg, setNoBackMsg]   = useState(false);
  const [permDenied, setPermDenied] = useState(false);

  // ── Kill stream: detach srcObject FIRST, then stop tracks ──
  const killStream = () => {
    genRef.current++;  // invalidate any in-flight getUserMedia calls
    const v = videoRef.current;
    if (v) {
      try { v.pause(); } catch {}
      try { v.srcObject = null; } catch {}
    }
    const s = streamRef.current;
    if (s) {
      s.getTracks().forEach(t => { try { t.stop(); } catch {} });
      streamRef.current = null;
    }
  };

  // ── Mount / unmount lifecycle ──
  useEffect(() => {
    mountedRef.current = true;
    startCamera('user');
    // Return cleanup: runs when component is REMOVED from DOM
    return () => {
      mountedRef.current = false;
      killStream();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startCamera = async (facingMode) => {
    killStream();
    if (!mountedRef.current) return;
    setReady(false);
    const thisGen = ++genRef.current;  // stale callbacks will see thisGen !== genRef.current

    const isMobile = /Mobi|Android/i.test(navigator.userAgent);
    const videoConstraints = isMobile
      ? { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }
      : { width: { ideal: 1280 }, height: { ideal: 720 } };

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: videoConstraints });
    } catch (err) {
      if (!mountedRef.current || thisGen !== genRef.current) return;
      const name = err?.name || '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setPermDenied(true); return;
      }
      if (facingMode === 'environment') {
        setHasBack(false); showNoBackNotice(); startCamera('user'); return;
      }
      setPermDenied(true); return;
    }

    // Stale — kill was called while getUserMedia was pending; stop and exit
    if (!mountedRef.current || thisGen !== genRef.current) {
      stream.getTracks().forEach(t => t.stop());
      return;
    }

    streamRef.current = stream;

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      if (mountedRef.current && thisGen === genRef.current)
        setHasBack(devices.filter(d => d.kind === 'videoinput').length > 1);
    } catch {}

    if (!videoRef.current || !mountedRef.current || thisGen !== genRef.current) return;
    videoRef.current.srcObject = stream;
    videoRef.current.play().catch(() => {
      if (videoRef.current && mountedRef.current) {
        videoRef.current.muted = true;
        videoRef.current.play().catch(() => {});
      }
    });
  };

  const showNoBackNotice = () => {
    setNoBackMsg(true);
    setTimeout(() => { if (mountedRef.current) setNoBackMsg(false); }, 3000);
  };

  const flipCamera = () => {
    if (!hasBack) { showNoBackNotice(); return; }
    const next = facing === 'user' ? 'environment' : 'user';
    setFacing(next);
    startCamera(next);
  };

  // ── Close: kill stream THEN notify parent ──
  const handleClose = () => {
    killStream();
    onClose();
  };

  const capture = () => {
    if (!videoRef.current || !canvasRef.current || capturing || !ready) return;
    setCapturing(true);
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width  = video.videoWidth  || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (facing === 'user') { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(blob => {
      if (blob) {
        const reader = new FileReader();
        reader.onload = () => {
          killStream();           // LED off before handing back
          onCapture(reader.result);
          onClose();
        };
        reader.readAsDataURL(blob);
      } else {
        if (mountedRef.current) setCapturing(false);
      }
    }, 'image/jpeg', 0.85);
  };

  // ── Permission denied screen ──
  if (permDenied) return (
    <div className="fixed inset-0 z-[300] bg-black flex flex-col items-center justify-center gap-4 animate-fade-in p-6">
      <AlertCircle size={48} className="text-yellow-400"/>
      <p className="text-white text-center text-lg font-semibold">Camera Permission Required</p>
      <p className="text-white/60 text-center text-sm max-w-xs">
        Click the 🔒 lock icon in the address bar → Camera → Allow, then try again.
      </p>
      <button onClick={handleClose}
        className="mt-2 px-6 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-2xl transition-all">
        Close
      </button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[300] bg-black flex flex-col animate-fade-in">
      <div className="flex-1 relative overflow-hidden">
        <video
          ref={videoRef}
          autoPlay playsInline muted
          className="absolute inset-0 w-full h-full object-cover"
          style={{ transform: facing === 'user' ? 'scaleX(-1)' : 'none' }}
          onCanPlay={() => { if (mountedRef.current) setReady(true); }}
          onLoadedData={() => { if (mountedRef.current) setReady(true); }}
        />
        <canvas ref={canvasRef} className="hidden"/>

        {/* Loading overlay */}
        {!ready && (
          <div className="absolute inset-0 bg-black flex flex-col items-center justify-center gap-3">
            <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin"/>
            <p className="text-white/50 text-sm">Opening camera…</p>
          </div>
        )}

        {/* No back camera notice */}
        {noBackMsg && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-black/80 text-white text-sm px-4 py-2 rounded-xl flex items-center gap-2 animate-fade-in">
            <AlertCircle size={15} className="text-yellow-400 flex-shrink-0"/>
            Back camera not detected
          </div>
        )}

        {/* Close */}
        <button onClick={handleClose}
          className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-black/70 transition-all active:scale-95 z-10">
          <X size={20}/>
        </button>

        {/* Flip */}
        <button onClick={flipCamera}
          className="absolute top-4 left-4 w-10 h-10 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-black/70 transition-all active:scale-95 z-10">
          <RefreshCw size={18}/>
        </button>

        <div className="absolute top-5 left-1/2 -translate-x-1/2 text-white/60 text-xs font-medium pointer-events-none">
          {facing === 'user' ? 'Front Camera' : 'Back Camera'}
        </div>
      </div>

      {/* Capture bar */}
      <div className="h-28 bg-black flex items-center justify-center gap-12">
        <div className="w-12"/>
        <button onClick={capture} disabled={!ready || capturing}
          className="w-16 h-16 rounded-full border-4 border-white bg-white/10 hover:bg-white/20 active:scale-95 transition-all flex items-center justify-center disabled:opacity-40">
          {capturing
            ? <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
            : <div className="w-12 h-12 rounded-full bg-white"/>}
        </button>
        <button onClick={flipCamera}
          className={`w-12 h-12 rounded-full flex items-center justify-center text-white transition-all ${hasBack ? 'bg-white/10 hover:bg-white/20' : 'bg-white/5 opacity-40 cursor-not-allowed'}`}>
          <RefreshCw size={20}/>
        </button>
      </div>
    </div>
  );
}
