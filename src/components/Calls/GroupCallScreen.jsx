// ═══════════════════════════════════════════════════════
//  GroupCallScreen — Group Voice & Video Calls
//  Family & Friends  ·  Built by Ishrit Sachdeva
// ═══════════════════════════════════════════════════════

import { useEffect, useRef, useState } from 'react';
import { PhoneOff, Mic, MicOff, Video, VideoOff, Phone, Users } from 'lucide-react';
import { useCallSounds } from '../../hooks/useCallSounds';

// ── Hidden audio sink — plays remote audio for a stream ──
// Needed because <video muted> kills audio; this element is audio-only
function RemoteAudio({ stream }) {
  const audioRef = useRef(null);
  useEffect(() => {
    if (!audioRef.current || !stream) return;
    audioRef.current.srcObject = stream;
    audioRef.current.muted = false;
    audioRef.current.volume = 1.0;
    audioRef.current.play().catch(() => {
      // Autoplay blocked — play on next user interaction
      const resume = () => { audioRef.current?.play().catch(() => {}); document.removeEventListener('click', resume); };
      document.addEventListener('click', resume, { once: true });
    });
  }, [stream]);
  return <audio ref={audioRef} autoPlay playsInline style={{ display: 'none' }} />;
}

// ── Participant tile ──────────────────────────────────
function ParticipantTile({ uid, profile, stream, isLocal, localStream, isVideoOff, isMuted, localVideoRef }) {
  const remoteRef = useRef(null);   // for remote participants
  const localRef  = useRef(null);   // for local participant (own ref, not hook's ref)

  // Callback ref: sets both localRef AND the hook's localVideoRef when the element mounts
  const setLocalRef = (el) => {
    localRef.current = el;
    if (localVideoRef) localVideoRef.current = el;
  };

  // Remote: attach stream (video only — audio via RemoteAudio)
  useEffect(() => {
    if (isLocal || !remoteRef.current) return;
    if (!stream) { remoteRef.current.srcObject = null; return; }
    if (remoteRef.current.srcObject !== stream) {
      remoteRef.current.srcObject = stream;
      remoteRef.current.muted = true;
      remoteRef.current.play().catch(() => {});
    }
  }, [stream, isLocal]);

  // Local: attach stream directly in this tile — fixes the timing race
  // where the hook tried to set srcObject before this element existed in DOM
  useEffect(() => {
    if (!isLocal || !localRef.current || !localStream) return;
    if (localRef.current.srcObject !== localStream) {
      localRef.current.srcObject = localStream;
      localRef.current.muted = true;
      localRef.current.play().catch(() => {});
    }
  }, [localStream, isLocal]);

  const hasLocalVideo  = isLocal  && !isVideoOff && !!(localStream?.getVideoTracks().length);
  const hasRemoteVideo = !isLocal && !!(stream?.getVideoTracks().length);
  const hasVideo = isLocal ? hasLocalVideo : hasRemoteVideo;

  const name    = profile?.name  || (uid ? uid.slice(0, 8) : '?');
  const avatar  = profile?.avatar;
  const initial = name[0]?.toUpperCase() || '?';

  return (
    <div className="relative rounded-2xl overflow-hidden bg-[#0a2010] flex items-center justify-center min-h-[120px]">

      {/* LOCAL video — always rendered so ref can attach */}
      {isLocal && (
        <video
          ref={setLocalRef}
          autoPlay playsInline muted
          className={`absolute inset-0 w-full h-full object-cover ${hasLocalVideo ? '' : 'hidden'}`}
          style={{ transform: 'scaleX(-1)' }}
        />
      )}

      {/* REMOTE video (muted — audio from RemoteAudio) */}
      {!isLocal && (
        <video
          ref={remoteRef}
          autoPlay playsInline muted
          className={`absolute inset-0 w-full h-full object-cover ${hasRemoteVideo ? '' : 'hidden'}`}
        />
      )}

      {/* Avatar fallback when no video */}
      {!hasVideo && (
        <div className="absolute inset-0 flex items-center justify-center">
          {avatar
            ? <img src={avatar} alt="" className="w-16 h-16 rounded-full object-cover border-2 border-brand-500/40" />
            : <div className="w-16 h-16 rounded-full bg-gradient-to-br from-brand-600 to-brand-800 flex items-center justify-center text-2xl font-bold text-white border-2 border-brand-500/40">
                {initial}
              </div>
          }
        </div>
      )}

      {/* Name bar */}
      <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5 bg-gradient-to-t from-black/70 to-transparent flex items-center gap-1.5">
        {isLocal && isMuted && (
          <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0">
            <MicOff size={9} className="text-white" />
          </div>
        )}
        <span className="text-white text-xs font-semibold truncate">
          {isLocal ? `${name} (You)` : name}
        </span>
      </div>

      {/* Speaking ring */}
      {!isMuted && (
        <div className="absolute inset-0 rounded-2xl pointer-events-none border-2 border-brand-400/30" />
      )}
    </div>
  );
}

// ── Main GroupCallScreen ──────────────────────────────
export default function GroupCallScreen({
  gcStatus, gcType, gcInfo,
  gcParticipants,
  remoteStreams,
  localVideoRef,
  localStream,
  isMuted, isVideoOff,
  callDuration,
  isIncoming,
  incomingCallData,
  currentUserId,
  memberProfiles = {},
  onJoin, onDecline, onLeave,
  onToggleMute, onToggleVideo,
  formatDuration,
}) {
  const { startRing, startCalling, stopSounds } = useCallSounds();
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideRef = useRef(null);

  // Sounds
  useEffect(() => {
    if (gcStatus === 'idle') { stopSounds(); return; }
    if (isIncoming && gcStatus !== 'active') { startRing(); return; }
    if (!isIncoming && gcStatus === 'waiting') { startCalling(); return; }
    stopSounds();  // active — 2+ people connected
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gcStatus, isIncoming]);

  const resetHide = () => {
    setControlsVisible(true);
    clearTimeout(hideRef.current);
    if (gcType === 'video' && gcStatus === 'active') {
      hideRef.current = setTimeout(() => setControlsVisible(false), 5000);
    }
  };
  useEffect(() => {
    resetHide();
    return () => clearTimeout(hideRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gcStatus, gcType]);

  const callName   = gcInfo?.name || incomingCallData?.groupName || 'Group Call';
  const callerName = incomingCallData?.initiatorName || 'Someone';
  const count      = gcParticipants.length;
  const gridCols   = count <= 1 ? 'grid-cols-1'
                   : count <= 2 ? 'grid-cols-2'
                   : count <= 4 ? 'grid-cols-2'
                                : 'grid-cols-3';

  // Remote UIDs (not local)
  const remoteUids = gcParticipants.filter(uid => uid !== currentUserId);

  // ── Incoming ring screen ──────────────────────────────
  if (isIncoming && gcStatus !== 'active') {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 animate-fade-in"
        style={{ background: 'linear-gradient(135deg, #052e16 0%, #14532d 100%)' }}>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {[1,2,3].map(i => (
            <div key={i} className="absolute rounded-full border border-brand-400/20"
              style={{ width:`${i*140}px`, height:`${i*140}px`,
                animation:`ping ${1+i*0.4}s ease-in-out infinite ${i*0.25}s` }} />
          ))}
        </div>
        <div className="relative z-10 w-28 h-28 rounded-full bg-brand-700 border-4 border-brand-500/50 flex items-center justify-center shadow-2xl">
          <Users size={44} className="text-white" />
        </div>
        <div className="z-10 text-center">
          <h2 className="text-white font-bold text-2xl">{callName}</h2>
          <p className="text-brand-300 mt-1">
            {gcType === 'video' ? '📹' : '📞'} {callerName} started a group {gcType} call
          </p>
        </div>
        <div className="z-10 flex gap-16 mt-4">
          <div className="flex flex-col items-center gap-2">
            <button onClick={onDecline}
              className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-400 flex items-center justify-center shadow-2xl active:scale-95 transition-all">
              <PhoneOff size={26} className="text-white" />
            </button>
            <span className="text-white/70 text-xs">Decline</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <button onClick={onJoin}
              className="w-16 h-16 rounded-full bg-brand-500 hover:bg-brand-400 flex items-center justify-center shadow-2xl active:scale-95 transition-all animate-bounce">
              <Phone size={26} className="text-white" />
            </button>
            <span className="text-white/70 text-xs">Join</span>
          </div>
        </div>
      </div>
    );
  }

  // ── Active / waiting call screen ──────────────────────
  return (
    <div className="fixed inset-0 z-[100] flex flex-col" style={{ background: '#021b0e' }}
      onClick={resetHide}>

      {/* Audio sinks for ALL remote streams — unmuted, hidden */}
      {remoteUids.map(uid =>
        remoteStreams[uid] ? <RemoteAudio key={uid} stream={remoteStreams[uid]} /> : null
      )}

      {/* Top bar */}
      <div className="flex items-center justify-between px-4 pt-10 pb-3 bg-black/30" style={{ zIndex: 10 }}>
        <div>
          <p className="text-white font-bold text-base">{callName}</p>
          <p className="text-brand-300 text-xs">
            {gcStatus === 'waiting'
              ? 'Waiting for others to join…'
              : `${formatDuration(callDuration)} · ${count} participant${count !== 1 ? 's' : ''}`}
          </p>
        </div>
        {gcType === 'video'
          ? <Video size={16} className="text-brand-400" />
          : <Phone size={16} className="text-brand-400" />}
      </div>

      {/* Participant grid */}
      <div className={`flex-1 grid ${gridCols} gap-1.5 p-2 overflow-hidden`}>
        {gcParticipants.map(uid => (
          <ParticipantTile
            key={uid}
            uid={uid}
            profile={memberProfiles[uid]}
            stream={uid === currentUserId ? null : remoteStreams[uid]}
            localStream={uid === currentUserId ? localStream : null}
            isLocal={uid === currentUserId}
            isVideoOff={uid === currentUserId ? isVideoOff : false}
            isMuted={uid === currentUserId ? isMuted : false}
            localVideoRef={uid === currentUserId ? localVideoRef : null}
          />
        ))}
        {count <= 1 && (
          <div className="rounded-2xl bg-brand-900/40 border border-brand-800/50 flex flex-col items-center justify-center gap-3 min-h-[120px]">
            <Users size={28} className="text-brand-500 animate-pulse" />
            <p className="text-brand-400 text-sm text-center px-4">Waiting for others to join…</p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div
        className="px-6 pb-10 pt-4 bg-black/50 transition-all duration-300"
        style={{ zIndex: 20, opacity: controlsVisible ? 1 : 0,
          pointerEvents: controlsVisible ? 'auto' : 'none',
          transform: controlsVisible ? 'none' : 'translateY(20px)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-center gap-6">
          <div className="flex flex-col items-center gap-1.5">
            <button onClick={onToggleMute}
              className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all active:scale-95 ${isMuted ? 'bg-red-500' : 'bg-white/20 hover:bg-white/30'}`}>
              {isMuted ? <MicOff size={22} className="text-white" /> : <Mic size={22} className="text-white" />}
            </button>
            <span className="text-white/70 text-xs">{isMuted ? 'Unmute' : 'Mute'}</span>
          </div>
          {gcType === 'video' && (
            <div className="flex flex-col items-center gap-1.5">
              <button onClick={onToggleVideo}
                className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all active:scale-95 ${isVideoOff ? 'bg-red-500' : 'bg-white/20 hover:bg-white/30'}`}>
                {isVideoOff ? <VideoOff size={22} className="text-white" /> : <Video size={22} className="text-white" />}
              </button>
              <span className="text-white/70 text-xs">{isVideoOff ? 'Show' : 'Camera'}</span>
            </div>
          )}
          <div className="flex flex-col items-center gap-1.5">
            <button onClick={onLeave}
              className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-400 flex items-center justify-center shadow-2xl active:scale-95 transition-all">
              <PhoneOff size={26} className="text-white" />
            </button>
            <span className="text-white/70 text-xs">Leave</span>
          </div>
        </div>
      </div>
    </div>
  );
}
