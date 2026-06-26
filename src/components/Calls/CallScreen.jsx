// ═══════════════════════════════════════════════════════
//  CallScreen — Voice & Video Calls (WebRTC)
//  Family & Friends  ·  Built by Ishrit Sachdeva
// ═══════════════════════════════════════════════════════

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  PhoneOff, Mic, MicOff, Video, VideoOff,
  Volume2, VolumeX, RotateCcw, Phone
} from 'lucide-react';
import { useCallSounds } from '../../hooks/useCallSounds';

// ── Snap to nearest corner ───────────────────────────
function snapToCorner(x, y, pipW, pipH, margin = 16) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const corners = [
    { x: margin,          y: margin },           // top-left
    { x: vw - pipW - margin, y: margin },        // top-right
    { x: margin,          y: vh - pipH - margin },// bottom-left
    { x: vw - pipW - margin, y: vh - pipH - margin }, // bottom-right
  ];
  // Find closest corner
  let best = corners[0], bestDist = Infinity;
  corners.forEach(c => {
    const d = Math.hypot(x - c.x, y - c.y);
    if (d < bestDist) { bestDist = d; best = c; }
  });
  return best;
}

// ── Clamp position within screen ─────────────────────
function clamp(x, y, pipW, pipH, margin = 16) {
  return {
    x: Math.max(margin, Math.min(window.innerWidth  - pipW - margin, x)),
    y: Math.max(margin, Math.min(window.innerHeight - pipH - margin, y)),
  };
}

export default function CallScreen({
  callStatus, callType, remoteUser,
  isMuted, isVideoOff, isSpeaker, callDuration,
  localVideoRef, remoteVideoRef,
  onEndCall, onToggleMute, onToggleCamera, onToggleSpeaker, onSwitchCamera,
  onAnswer, onDecline, isIncoming, formatDuration
}) {
  const audioRef         = useRef(null);
  const streamCheckRef   = useRef(null);
  const hideTimerRef     = useRef(null);
  const pipClickCountRef = useRef(0);

  // Drag state — all refs to avoid re-renders during drag (which causes video flicker)
  const isDraggingRef    = useRef(false);
  const dragStartRef     = useRef({ x: 0, y: 0 });
  const pipStartRef      = useRef({ x: 0, y: 0 });
  const didDragRef       = useRef(false);
  const pipRef           = useRef(null);
  const pipLivePos       = useRef({ x: window.innerWidth - 128, y: 16 }); // live pos during drag (no re-render)

  // Swapped PiP remote video ref — separate element, synced via useEffect
  const pipRemoteVideoRef = useRef(null);
  const pipLocalVideoRef  = useRef(null);   // PiP local video — separate from fullscreen localVideoRef

  const { startRing, startCalling, stopSounds } = useCallSounds();

  const [remoteVideoReady, setRemoteVideoReady] = useState(false);
  const [controlsVisible, setControlsVisible]   = useState(true);
  const [swapped, setSwapped]                   = useState(false);
  const [pipEnlarged, setPipEnlarged]           = useState(false);
  // pip position — only updated on mouseup (snap), never during drag
  const [pipPos, setPipPos] = useState({ x: window.innerWidth - 128, y: 16 });
  const [isDragging, setIsDragging] = useState(false);

  const PIP_W = pipEnlarged ? 160 : 112;
  const PIP_H = pipEnlarged ? 220 : 160;

  const isVideoConnected = callType === 'video' && callStatus === 'connected' && remoteVideoReady;

  // ── Auto-hide controls ────────────────────────────────
  const resetHideTimer = useCallback(() => {
    setControlsVisible(true);
    clearTimeout(hideTimerRef.current);
    if (callStatus === 'connected' && callType === 'video' && remoteVideoReady) {
      hideTimerRef.current = setTimeout(() => setControlsVisible(false), 4000);
    }
  }, [callStatus, callType, remoteVideoReady]);

  useEffect(() => {
    resetHideTimer();
    return () => clearTimeout(hideTimerRef.current);
  }, [callStatus, remoteVideoReady, resetHideTimer]);

  useEffect(() => {
    if (callStatus !== 'connected') { setControlsVisible(true); clearTimeout(hideTimerRef.current); }
  }, [callStatus]);

  useEffect(() => {
    if (callStatus === 'idle') {
      setSwapped(false); setPipEnlarged(false); pipClickCountRef.current = 0;
      setPipPos({ x: window.innerWidth - 128, y: 16 });
      stopSounds();
    } else if (callStatus === 'ringing' && isIncoming) {
      startRing();
    } else if (callStatus === 'ringing' && !isIncoming) {
      startCalling();
    } else if (callStatus === 'connected') {
      stopSounds();
    }
    return () => {};
  }, [callStatus, isIncoming]);

  // ── Drag handlers — update DOM transform directly, no setState during drag ──
  const handlePipMouseDown = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    isDraggingRef.current = true;
    didDragRef.current    = false;
    dragStartRef.current  = { x: e.clientX, y: e.clientY };
    pipStartRef.current   = { x: pipLivePos.current.x, y: pipLivePos.current.y };
    setIsDragging(true);
  }, []);

  const handlePipTouchStart = useCallback((e) => {
    const t = e.touches[0];
    isDraggingRef.current = true;
    didDragRef.current    = false;
    dragStartRef.current  = { x: t.clientX, y: t.clientY };
    pipStartRef.current   = { x: pipLivePos.current.x, y: pipLivePos.current.y };
    setIsDragging(true);
  }, []);

  useEffect(() => {
    const applyPos = (x, y) => {
      if (pipRef.current) {
        pipRef.current.style.left      = x + 'px';
        pipRef.current.style.top       = y + 'px';
        pipRef.current.style.transform = 'none';
      }
      pipLivePos.current = { x, y };
    };

    const onMouseMove = (e) => {
      if (!isDraggingRef.current) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) didDragRef.current = true;
      const raw     = { x: pipStartRef.current.x + dx, y: pipStartRef.current.y + dy };
      const clamped = clamp(raw.x, raw.y, PIP_W, PIP_H);
      applyPos(clamped.x, clamped.y);   // direct DOM — no React re-render → no flicker
    };

    const onTouchMove = (e) => {
      if (!isDraggingRef.current) return;
      const t  = e.touches[0];
      const dx = t.clientX - dragStartRef.current.x;
      const dy = t.clientY - dragStartRef.current.y;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) didDragRef.current = true;
      const raw     = { x: pipStartRef.current.x + dx, y: pipStartRef.current.y + dy };
      const clamped = clamp(raw.x, raw.y, PIP_W, PIP_H);
      applyPos(clamped.x, clamped.y);
    };

    const onMouseUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      setIsDragging(false);
      if (didDragRef.current) {
        const snapped = snapToCorner(pipLivePos.current.x, pipLivePos.current.y, PIP_W, PIP_H);
        applyPos(snapped.x, snapped.y);
        setPipPos(snapped);   // commit to React state only after drag ends
      }
    };

    const onTouchEnd = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      setIsDragging(false);
      if (didDragRef.current) {
        const snapped = snapToCorner(pipLivePos.current.x, pipLivePos.current.y, PIP_W, PIP_H);
        applyPos(snapped.x, snapped.y);
        setPipPos(snapped);
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup',   onMouseUp);
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend',  onTouchEnd);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup',   onMouseUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend',  onTouchEnd);
    };
  }, [PIP_W, PIP_H]);   // no pipPos dependency — uses pipLivePos ref instead

  // Sync remote stream to the PiP video element when swapped
  useEffect(() => {
    if (!swapped || !pipRemoteVideoRef.current) return;
    const stream = remoteVideoRef?.current?.srcObject;
    if (stream && pipRemoteVideoRef.current.srcObject !== stream) {
      pipRemoteVideoRef.current.srcObject = stream;
      pipRemoteVideoRef.current.muted = true;
      pipRemoteVideoRef.current.play().catch(() => {});
    }
  }, [swapped, remoteVideoReady]);

  // Sync local stream to PiP local video element
  useEffect(() => {
    if (!pipLocalVideoRef.current) return;
    const stream = localVideoRef?.current?.srcObject;
    if (stream && pipLocalVideoRef.current.srcObject !== stream) {
      pipLocalVideoRef.current.srcObject = stream;
      pipLocalVideoRef.current.muted = true;
      pipLocalVideoRef.current.play().catch(() => {});
    }
  });
  const handlePipClick = useCallback((e) => {
    e.stopPropagation();
    if (didDragRef.current) { didDragRef.current = false; return; } // ignore drag-release
    if (!isVideoConnected) return;

    pipClickCountRef.current += 1;
    if (pipClickCountRef.current === 1) {
      setPipEnlarged(true);
      resetHideTimer();
    } else {
      pipClickCountRef.current = 0;
      setPipEnlarged(false);
      setSwapped(s => !s);
      resetHideTimer();
    }
  }, [isVideoConnected, resetHideTimer]);

  // ── Tap screen to show controls / collapse pip ───────
  const handleScreenTap = useCallback(() => {
    if (pipEnlarged) { setPipEnlarged(false); pipClickCountRef.current = 0; }
    resetHideTimer();
  }, [pipEnlarged, resetHideTimer]);

  // ── Watch for remote stream ───────────────────────────
  useEffect(() => {
    if (streamCheckRef.current) clearInterval(streamCheckRef.current);
    streamCheckRef.current = setInterval(() => {
      const videoEl = remoteVideoRef?.current;
      if (!videoEl) return;
      const stream = videoEl.srcObject;
      if (!stream) return;
      const hasAudio = stream.getAudioTracks().length > 0;
      const hasVideo = stream.getVideoTracks().length > 0;

      if (hasAudio && audioRef.current && !audioRef.current.srcObject) {
        audioRef.current.srcObject = stream;
        audioRef.current.volume = 1.0;
        audioRef.current.muted = false;
        audioRef.current.play().catch(() => {
          document.addEventListener('click', () => audioRef.current?.play().catch(() => {}), { once: true });
        });
      }
      if (hasVideo) {
        videoEl.muted = true;
        videoEl.play().catch(() => {});
        setRemoteVideoReady(true);
        clearInterval(streamCheckRef.current);
      } else if (hasAudio) {
        clearInterval(streamCheckRef.current);
      }
    }, 300);
    return () => clearInterval(streamCheckRef.current);
  }, [callStatus, remoteVideoRef]);

  useEffect(() => {
    if (callStatus === 'idle') {
      setRemoteVideoReady(false);
      if (audioRef.current) audioRef.current.srcObject = null;
    }
  }, [callStatus]);

  return (
    <div
      className="fixed inset-0 z-[100] call-overlay flex flex-col items-center justify-between p-6 animate-fade-in"
      onClick={handleScreenTap}
    >
      {/* Audio */}
      <audio ref={audioRef} autoPlay playsInline muted={false} style={{ display: 'none' }} />

      {/* Remote video — fullscreen when NOT swapped, hidden when swapped */}
      <video
        ref={remoteVideoRef}
        autoPlay playsInline muted={true}
        className="absolute inset-0 w-full h-full object-cover"
        style={{ zIndex: 1, display: remoteVideoReady && !swapped ? 'block' : 'none' }}
      />

      {/* Local video — fullscreen when swapped, always in DOM so ref stays valid */}
      <video
        ref={localVideoRef}
        autoPlay muted playsInline
        className="absolute inset-0 w-full h-full object-cover"
        style={{ zIndex: 1, display: swapped && callType === 'video' ? 'block' : 'none' }}
      />

      {/* Green background */}
      {(!remoteVideoReady || (swapped && callType !== 'video')) && (
        <div className="absolute inset-0" style={{ zIndex: 1 }}>
          <div className="absolute inset-0 bg-gradient-to-br from-brand-950 via-brand-900/90 to-brand-800/80" />
          {callStatus === 'ringing' && (
            <div className="absolute inset-0 flex items-center justify-center">
              {[1,2,3].map(i => (
                <div key={i} className="absolute rounded-full border border-brand-400/30"
                  style={{ width:`${i*120}px`, height:`${i*120}px`,
                    animation:`ping ${1+i*0.5}s ease-in-out infinite ${i*0.3}s` }} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Dark overlay */}
      {isVideoConnected && (
        <div className="absolute inset-0 bg-black/25 transition-opacity duration-500"
          style={{ zIndex: 2, opacity: controlsVisible ? 1 : 0, pointerEvents: 'none' }} />
      )}

      {/* ── TOP UI ── */}
      <div className="relative flex flex-col items-center gap-3 mt-8 transition-all duration-500"
        style={{
          zIndex: 10,
          opacity: controlsVisible ? 1 : 0,
          transform: controlsVisible ? 'translateY(0)' : 'translateY(-24px)',
          pointerEvents: controlsVisible ? 'auto' : 'none'
        }}>
        <div className="relative">
          <div className={`w-28 h-28 rounded-full overflow-hidden border-4 shadow-2xl ${callStatus === 'connected' ? 'border-brand-400' : 'border-brand-600'}`}>
            {remoteUser?.avatar
              ? <img src={remoteUser.avatar} alt="" className="w-full h-full object-cover" />
              : <div className="w-full h-full bg-brand-800 flex items-center justify-center text-4xl font-bold text-white">
                  {remoteUser?.name?.[0]?.toUpperCase() || '?'}
                </div>}
          </div>
          <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center">
            {callType === 'video' ? <Video size={14} className="text-white" /> : <Phone size={14} className="text-white" />}
          </div>
        </div>
        <h2 className="text-white font-display font-bold text-2xl drop-shadow-lg">{remoteUser?.name || '...'}</h2>
        <div className="flex items-center gap-2">
          {callStatus === 'ringing' && (<>
            <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
            <span className="text-brand-200 text-sm">
              {callStatus === 'reconnecting' ? '↻ Reconnecting...' : isIncoming ? 'Incoming call...' : 'Calling...'}
            </span>
          </>)}
          {callStatus === 'connected' && (<>
            <div className="w-2 h-2 rounded-full bg-brand-400" />
            <span className="text-brand-200 text-sm font-mono">{formatDuration(callDuration)}</span>
            {callType === 'video' && !remoteVideoReady && <span className="text-brand-300 text-xs ml-2">Waiting for video...</span>}
          </>)}
        </div>
      </div>

      {/* ── DRAGGABLE PiP WINDOW ── */}
      {callType === 'video' && (
        <div
          ref={pipRef}
          onMouseDown={handlePipMouseDown}
          onTouchStart={handlePipTouchStart}
          onClick={handlePipClick}
          className="absolute rounded-2xl overflow-hidden border-2 shadow-2xl bg-brand-900"
          style={{
            zIndex: 20,
            left: pipPos.x,
            top: pipPos.y,
            width: PIP_W,
            height: PIP_H,
            borderColor: pipEnlarged ? '#4ade80' : '#22c55e',
            boxShadow: isDragging
              ? '0 0 0 3px rgba(74,222,128,0.5), 0 20px 60px rgba(0,0,0,0.7)'
              : pipEnlarged
                ? '0 0 0 3px rgba(74,222,128,0.4), 0 8px 32px rgba(0,0,0,0.5)'
                : '0 4px 20px rgba(0,0,0,0.4)',
            cursor: isDragging ? 'grabbing' : 'grab',
            // Smooth transition for snap, but instant during drag
            transition: isDragging
              ? 'width 0.3s, height 0.3s, box-shadow 0.2s'
              : 'left 0.35s cubic-bezier(.4,0,.2,1), top 0.35s cubic-bezier(.4,0,.2,1), width 0.3s, height 0.3s, box-shadow 0.2s',
            userSelect: 'none',
          }}
        >
          {/* Video content */}
          {/* Local in PiP when NOT swapped */}
          <video ref={pipLocalVideoRef} autoPlay muted playsInline
            className="w-full h-full object-cover pointer-events-none"
            style={{ display: !swapped && !isVideoOff ? 'block' : 'none' }} />
          {!swapped && isVideoOff && (
            <div className="w-full h-full flex items-center justify-center">
              <VideoOff size={24} className="text-brand-400" />
            </div>
          )}
          {/* Remote in PiP when swapped */}
          <video ref={pipRemoteVideoRef} autoPlay playsInline muted
            className="w-full h-full object-cover pointer-events-none"
            style={{ display: swapped ? 'block' : 'none' }} />

          {/* Drag indicator + swap hint */}
          <div className="absolute inset-0 flex flex-col items-center justify-between p-2 pointer-events-none">
            {/* Drag handle dots at top */}
            <div className="flex gap-1 opacity-40">
              {[0,1,2].map(i => <div key={i} className="w-1 h-1 rounded-full bg-white" />)}
            </div>
            {/* Swap hint at bottom */}
            {pipEnlarged && isVideoConnected && (
              <div className="text-white text-[10px] font-bold bg-black/50 px-2 py-1 rounded-lg">
                Tap to swap
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tap hint */}
      {isVideoConnected && !controlsVisible && (
        <div className="absolute inset-0 flex items-end justify-center pb-16 pointer-events-none" style={{ zIndex: 5 }}>
          <div className="text-white/25 text-xs">Tap to show controls</div>
        </div>
      )}

      {/* ── BOTTOM CONTROLS ── */}
      <div className="relative w-full max-w-sm space-y-4 transition-all duration-500"
        style={{
          zIndex: 10,
          opacity: controlsVisible ? 1 : 0,
          transform: controlsVisible ? 'translateY(0)' : 'translateY(24px)',
          pointerEvents: controlsVisible ? 'auto' : 'none'
        }}>
        {isIncoming && callStatus === 'ringing' ? (
          <div className="flex justify-center gap-16 mt-6">
            <div className="flex flex-col items-center gap-2">
              <button onClick={onDecline} className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-400 flex items-center justify-center shadow-2xl press-scale transition-all">
                <PhoneOff size={26} className="text-white" />
              </button>
              <span className="text-white/60 text-xs">Decline</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <button onClick={onAnswer} className="w-16 h-16 rounded-full bg-brand-500 hover:bg-brand-400 flex items-center justify-center shadow-2xl press-scale transition-all animate-bounce">
                <Phone size={26} className="text-white" />
              </button>
              <span className="text-white/60 text-xs">Answer</span>
            </div>
          </div>
        ) : (
          <>
            <div className={`grid gap-3 ${callType === 'video' ? 'grid-cols-4' : 'grid-cols-2'}`}>
              <div className="flex flex-col items-center gap-2">
                <button onClick={onToggleMute} className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all press-scale ${isMuted ? 'bg-red-500' : 'bg-white/20 hover:bg-white/30'}`}>
                  {isMuted ? <MicOff size={22} className="text-white" /> : <Mic size={22} className="text-white" />}
                </button>
                <span className="text-white/70 text-xs">{isMuted ? 'Unmute' : 'Mute'}</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <button onClick={onToggleSpeaker} className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all press-scale ${isSpeaker ? 'bg-brand-500' : 'bg-white/20 hover:bg-white/30'}`}>
                  {isSpeaker ? <Volume2 size={22} className="text-white" /> : <VolumeX size={22} className="text-white" />}
                </button>
                <span className="text-white/70 text-xs">Speaker</span>
              </div>
              {callType === 'video' && (<>
                <div className="flex flex-col items-center gap-2">
                  <button onClick={onToggleCamera} className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all press-scale ${isVideoOff ? 'bg-red-500' : 'bg-white/20 hover:bg-white/30'}`}>
                    {isVideoOff ? <VideoOff size={22} className="text-white" /> : <Video size={22} className="text-white" />}
                  </button>
                  <span className="text-white/70 text-xs">Camera</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <button onClick={onSwitchCamera} className="w-14 h-14 rounded-2xl bg-white/20 hover:bg-white/30 flex items-center justify-center transition-all press-scale">
                    <RotateCcw size={22} className="text-white" />
                  </button>
                  <span className="text-white/70 text-xs">Flip</span>
                </div>
              </>)}
            </div>
            <div className="flex justify-center mt-4">
              <div className="flex flex-col items-center gap-2">
                <button onClick={onEndCall} className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-400 flex items-center justify-center shadow-2xl press-scale transition-all">
                  <PhoneOff size={26} className="text-white" />
                </button>
                <span className="text-white/70 text-xs">End Call</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
