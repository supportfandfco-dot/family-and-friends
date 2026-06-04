// ═══════════════════════════════════════════════════════
//  useWebRTC — Voice & Video Calls via Firebase Signaling
//  Family & Friends  ·  Built by Ishrit Sachdeva
// ═══════════════════════════════════════════════════════

import { useRef, useState, useCallback, useEffect } from 'react';
import { db, doc, setDoc, updateDoc, onSnapshot, collection, addDoc, serverTimestamp } from '../firebase';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
  ]
};

// ── Helper: stop all tracks in a stream ──────────────
function stopStream(stream) {
  if (!stream) return;
  stream.getTracks().forEach(track => {
    track.stop();
    track.enabled = false;
  });
}

export function useWebRTC(currentUserId) {
  const [callStatus, setCallStatus]     = useState('idle');
  const [callType, setCallType]         = useState('voice');
  const [remoteUserId, setRemoteUserId] = useState(null);
  const [callId, setCallId]             = useState(null);
  const [isMuted, setIsMuted]           = useState(false);
  const [isVideoOff, setIsVideoOff]     = useState(false);
  const [isSpeaker, setIsSpeaker]       = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  const pcRef           = useRef(null);
  const localStreamRef  = useRef(null);
  const localVideoRef   = useRef(null);
  const remoteVideoRef  = useRef(null);
  const lastLocalVideoEl  = useRef(null);   // survives component unmount
  const lastRemoteVideoEl = useRef(null);
  const callDocUnsub    = useRef(null);
  const iceCandUnsub    = useRef(null);
  const timerRef        = useRef(null);
  const callIdRef       = useRef(null);

  // Keep callIdRef in sync
  useEffect(() => { callIdRef.current = callId; }, [callId]);

  // ── Full cleanup ─────────────────────────────────────
  const cleanup = useCallback(() => {
    // Stop timer
    clearInterval(timerRef.current);
    // Unsubscribe listeners
    if (callDocUnsub.current) { callDocUnsub.current(); callDocUnsub.current = null; }
    if (iceCandUnsub.current) { iceCandUnsub.current(); iceCandUnsub.current = null; }
    // Detach srcObject FIRST (turns off camera LED), THEN stop tracks
    const localEl  = localVideoRef.current  || lastLocalVideoEl.current;
    const remoteEl = remoteVideoRef.current || lastRemoteVideoEl.current;
    if (localEl)  { try { localEl.pause();  localEl.srcObject  = null; } catch {} }
    if (remoteEl) { try { remoteEl.pause(); remoteEl.srcObject = null; } catch {} }
    lastLocalVideoEl.current  = null;
    lastRemoteVideoEl.current = null;
    stopStream(localStreamRef.current);
    localStreamRef.current = null;
    // Close peer connection
    if (pcRef.current) {
      pcRef.current.ontrack = null;
      pcRef.current.onicecandidate = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.oniceconnectionstatechange = null;
      pcRef.current.close();
      pcRef.current = null;
    }
    // Reset state
    setCallStatus('idle');
    setCallDuration(0);
    setRemoteUserId(null);
    setCallId(null);
    setIsMuted(false);
    setIsVideoOff(false);
  }, []);

  // ── Get media stream ─────────────────────────────────
  const getLocalStream = useCallback(async (video = false) => {
    // Always stop existing stream first
    stopStream(localStreamRef.current);
    localStreamRef.current = null;

    // Small delay to let previous stream fully release
    await new Promise(r => setTimeout(r, 500));

    // Try multiple constraint combinations - fallback to audio-only if camera busy
    const attempts = video
      ? [
          { audio: { echoCancellation: true, noiseSuppression: true }, video: { facingMode: 'user' } },
          { audio: { echoCancellation: true, noiseSuppression: true }, video: true },
          { audio: { echoCancellation: true, noiseSuppression: true }, video: false },
        ]
      : [
          { audio: { echoCancellation: true, noiseSuppression: true }, video: false },
          { audio: true, video: false },
        ];

    let lastErr = null;
    for (const constraints of attempts) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          lastLocalVideoEl.current = localVideoRef.current;
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.muted = true;
        }
        console.log('Got stream with video:', !!constraints.video);
        return stream;
      } catch (err) {
        console.warn('Stream attempt failed:', err.name);
        lastErr = err;
        await new Promise(r => setTimeout(r, 300));
      }
    }

    if (lastErr?.name === 'NotAllowedError') {
      throw new Error('Camera/microphone access denied. Please allow permissions.');
    }
    throw new Error('Could not access camera/microphone. Try closing other apps using the camera.');
  }, []);

  // ── Create peer connection ───────────────────────────
  const createPC = useCallback((cid, isOffer) => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    // Add local tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    // Receive remote tracks
    pc.ontrack = (event) => {
      console.log('Remote track received:', event.track.kind);
      if (remoteVideoRef.current && event.streams[0]) {
        lastRemoteVideoEl.current = remoteVideoRef.current;
        remoteVideoRef.current.srcObject = event.streams[0];
        remoteVideoRef.current.volume = 1.0;
        remoteVideoRef.current.muted = false;
        remoteVideoRef.current.play().catch(() => {});
      }
    };

    // Send ICE candidates
    pc.onicecandidate = async (event) => {
      if (!event.candidate) return;
      const col = isOffer ? 'callerCandidates' : 'calleeCandidates';
      try {
        await addDoc(collection(db, 'calls', cid, col), event.candidate.toJSON());
      } catch {}
    };

    // Connection state
    pc.onconnectionstatechange = () => {
      console.log('Connection state:', pc.connectionState);
      if (pc.connectionState === 'connected') {
        setCallStatus('connected');
        timerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
      }
      if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
        const cid = callIdRef.current;
        if (cid) {
          updateDoc(doc(db, 'calls', cid), { status: 'ended' }).catch(() => {});
        }
        cleanup();
      }
    };

    return pc;
  }, [cleanup]);

  // ── Start outgoing call ──────────────────────────────
  const startCall = useCallback(async (targetUserId, type = 'voice') => {
    setCallType(type);
    setRemoteUserId(targetUserId);
    setCallStatus('ringing');

    try {
      await getLocalStream(type === 'video');
      const cid = `${currentUserId}_${targetUserId}_${Date.now()}`;
      setCallId(cid);

      const pc = createPC(cid, true);
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: type === 'video'
      });
      await pc.setLocalDescription(offer);

      await setDoc(doc(db, 'calls', cid), {
        callerId: currentUserId,
        calleeId: targetUserId,
        type,
        status: 'ringing',
        offer: { type: offer.type, sdp: offer.sdp },
        answer: null,
        createdAt: serverTimestamp()
      });

      // Listen for answer
      callDocUnsub.current = onSnapshot(doc(db, 'calls', cid), async (snap) => {
        const data = snap.data();
        if (!data) return;
        if (data.answer && pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(data.answer)).catch(() => {});
        }
        if (data.status === 'declined' || data.status === 'ended') cleanup();
      });

      // Listen for callee ICE candidates
      iceCandUnsub.current = onSnapshot(collection(db, 'calls', cid, 'calleeCandidates'), (snap) => {
        snap.docChanges().forEach(async (change) => {
          if (change.type === 'added' && pc.remoteDescription) {
            try { await pc.addIceCandidate(new RTCIceCandidate(change.doc.data())); } catch {}
          }
        });
      });

    } catch (err) {
      cleanup();
      throw err;
    }
  }, [currentUserId, getLocalStream, createPC, cleanup]);

  // ── Answer incoming call ─────────────────────────────
  const answerCall = useCallback(async (cid, callData) => {
    setCallType(callData.type);
    setRemoteUserId(callData.callerId);
    setCallStatus('ringing');
    setCallId(cid);

    try {
      await getLocalStream(callData.type === 'video');
      const pc = createPC(cid, false);

      await pc.setRemoteDescription(new RTCSessionDescription(callData.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await updateDoc(doc(db, 'calls', cid), {
        answer: { type: answer.type, sdp: answer.sdp },
        status: 'active'
      });

      // Listen for caller ICE candidates
      iceCandUnsub.current = onSnapshot(collection(db, 'calls', cid, 'callerCandidates'), (snap) => {
        snap.docChanges().forEach(async (change) => {
          if (change.type === 'added') {
            try { await pc.addIceCandidate(new RTCIceCandidate(change.doc.data())); } catch {}
          }
        });
      });

      // Listen for call end
      callDocUnsub.current = onSnapshot(doc(db, 'calls', cid), (snap) => {
        const data = snap.data();
        if (data?.status === 'ended' || data?.status === 'declined') cleanup();
      });

    } catch (err) {
      cleanup();
      throw err;
    }
  }, [getLocalStream, createPC, cleanup]);

  // ── Decline call ─────────────────────────────────────
  const declineCall = useCallback(async (cid) => {
    if (cid) {
      try { await updateDoc(doc(db, 'calls', cid), { status: 'declined' }); } catch {}
    }
    cleanup();
  }, [cleanup]);

  // ── End call ─────────────────────────────────────────
  const endCall = useCallback(async () => {
    const cid = callIdRef.current;
    if (cid) {
      try { await updateDoc(doc(db, 'calls', cid), { status: 'ended' }); } catch {}
    }
    cleanup();
  }, [cleanup]);

  // ── Toggle mute ──────────────────────────────────────
  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
      setIsMuted(m => !m);
    }
  }, []);

  // ── Toggle camera ────────────────────────────────────
  const toggleCamera = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(t => { t.enabled = !t.enabled; });
      setIsVideoOff(v => !v);
    }
  }, []);

  // ── Switch camera (front ↔ back) ─────────────────────
  const facingModeRef = useRef('user');
  const switchCamera = useCallback(async () => {
    if (!localStreamRef.current) return;
    const next = facingModeRef.current === 'user' ? 'environment' : 'user';
    facingModeRef.current = next;
    try {
      localStreamRef.current.getVideoTracks().forEach(t => t.stop());
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: false, video: { facingMode: next }
      });
      const newVideoTrack = newStream.getVideoTracks()[0];
      // Replace track in the peer connection
      if (pcRef.current) {
        const sender = pcRef.current.getSenders().find(s => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(newVideoTrack).catch(() => {});
      }
      // Swap track in local stream
      localStreamRef.current.getVideoTracks().forEach(t => localStreamRef.current.removeTrack(t));
      localStreamRef.current.addTrack(newVideoTrack);
      if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
    } catch (e) { console.warn('Switch camera failed:', e); }
  }, []);

  // ── Toggle speaker (loudspeaker vs earpiece) ─────────
  // On Android WebView setSinkId is unsupported — we force audio via AudioContext
  const toggleSpeaker = useCallback(() => {
    setIsSpeaker(prev => {
      const next = !prev;
      // Web audio element routing (works on desktop Chrome/Edge)
      const el = remoteVideoRef.current;
      if (el && typeof el.setSinkId === 'function') {
        el.setSinkId(next ? 'default' : '').catch(() => {});
      }
      // Android WebView: set audio output mode via AudioContext
      try {
        if (next) {
          // Force loudspeaker by playing silent audio through an AudioContext
          // which switches Android audio focus to STREAM_MUSIC (speaker)
          const ctx = new (window.AudioContext || window.webkitAudioContext)();
          const buf = ctx.createBuffer(1, 1, 22050);
          const src = ctx.createBufferSource();
          src.buffer = buf;
          src.connect(ctx.destination);
          src.start(0);
          ctx.resume();
        }
      } catch {}
      return next;
    });
  }, []);

  // ── Format duration ──────────────────────────────────
  const formatDuration = (s) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  // Cleanup on unmount
  useEffect(() => () => cleanup(), []);

  return {
    callStatus, callType, remoteUserId, callId,
    isMuted, isVideoOff, isSpeaker, callDuration,
    localVideoRef, remoteVideoRef,
    startCall, answerCall, declineCall, endCall,
    toggleMute, toggleCamera, toggleSpeaker, switchCamera,
    formatDuration,
  };
}
