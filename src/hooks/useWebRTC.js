// ═══════════════════════════════════════════════════════
//  useWebRTC v3 — Production-grade voice & video calls
//  Fixed: stream reuse, ICE timing, track dedup, cleanup
// ═══════════════════════════════════════════════════════
import { useRef, useState, useCallback, useEffect } from 'react';
import {
  db, doc, setDoc, updateDoc, onSnapshot,
  collection, addDoc, serverTimestamp,
} from '../firebase';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
};

function stopStream(stream) {
  if (!stream) return;
  stream.getTracks().forEach(t => { try { t.stop(); } catch {} });
}

export function useWebRTC(currentUserId) {
  const [callStatus,   setCallStatus]   = useState('idle');
  const [callType,     setCallType]     = useState('voice');
  const [remoteUserId, setRemoteUserId] = useState(null);
  const [callId,       setCallId]       = useState(null);
  const [isMuted,      setIsMuted]      = useState(false);
  const [isVideoOff,   setIsVideoOff]   = useState(false);
  const [isSpeaker,    setIsSpeaker]    = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  const pcRef            = useRef(null);
  const localStreamRef   = useRef(null);
  const localVideoRef    = useRef(null);
  const remoteVideoRef   = useRef(null);
  const callDocUnsub     = useRef(null);
  const iceCandUnsub     = useRef(null);
  const timerRef         = useRef(null);
  const callIdRef        = useRef(null);
  const pendingCandidates = useRef([]);   // buffer ICE candidates until remote desc set

  useEffect(() => { callIdRef.current = callId; }, [callId]);

  // ── Cleanup everything ────────────────────────────────
  const cleanup = useCallback(() => {
    clearInterval(timerRef.current);
    callDocUnsub.current?.(); callDocUnsub.current = null;
    iceCandUnsub.current?.(); iceCandUnsub.current = null;
    pendingCandidates.current = [];

    // Detach video elements before stopping tracks
    if (localVideoRef.current)  { try { localVideoRef.current.srcObject  = null; } catch {} }
    if (remoteVideoRef.current) { try { remoteVideoRef.current.srcObject = null; } catch {} }

    stopStream(localStreamRef.current);
    localStreamRef.current = null;

    if (pcRef.current) {
      pcRef.current.ontrack               = null;
      pcRef.current.onicecandidate        = null;
      pcRef.current.onconnectionstatechange = null;
      try { pcRef.current.close(); } catch {}
      pcRef.current = null;
    }

    setCallStatus('idle');
    setCallDuration(0);
    setRemoteUserId(null);
    setCallId(null);
    setIsMuted(false);
    setIsVideoOff(false);
  }, []);

  // ── Get local media stream ────────────────────────────
  const getLocalStream = useCallback(async (video = false) => {
    stopStream(localStreamRef.current);
    localStreamRef.current = null;
    await new Promise(r => setTimeout(r, 300));

    const attempts = video
      ? [
          { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } },
          { audio: { echoCancellation: true, noiseSuppression: true }, video: true },
          { audio: true, video: false },
        ]
      : [
          { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false },
          { audio: true, video: false },
        ];

    let lastErr = null;
    for (const constraints of attempts) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        localStreamRef.current = stream;
        // Ensure audio enabled immediately
        stream.getAudioTracks().forEach(t => { t.enabled = true; });
        // Attach to local video element
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.muted = true;
          localVideoRef.current.play().catch(() => {});
        }
        return stream;
      } catch (err) {
        lastErr = err;
        await new Promise(r => setTimeout(r, 200));
      }
    }

    if (lastErr?.name === 'NotAllowedError' || lastErr?.name === 'PermissionDeniedError') {
      throw new Error('Microphone/camera permission denied. Please tap Allow when prompted.');
    }
    throw new Error('Could not access microphone. Close other apps using the mic and try again.');
  }, []);

  // ── Flush buffered ICE candidates ─────────────────────
  const flushCandidates = useCallback(async (pc) => {
    if (!pc || !pc.remoteDescription) return;
    for (const c of pendingCandidates.current) {
      try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
    }
    pendingCandidates.current = [];
  }, []);

  // ── Create peer connection ────────────────────────────
  const createPC = useCallback((cid, isOffer) => {
    if (pcRef.current) {
      try { pcRef.current.close(); } catch {}
      pcRef.current = null;
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    // Add local tracks (dedup by track id)
    if (localStreamRef.current) {
      const senders = pc.getSenders();
      localStreamRef.current.getTracks().forEach(track => {
        const already = senders.some(s => s.track?.id === track.id);
        if (!already) pc.addTrack(track, localStreamRef.current);
      });
    }

    // Receive remote tracks
    pc.ontrack = (event) => {
      const remoteStream = event.streams[0];
      if (remoteVideoRef.current && remoteStream) {
        remoteVideoRef.current.srcObject = remoteStream;
        remoteVideoRef.current.muted     = false;
        remoteVideoRef.current.volume    = 1.0;
        remoteVideoRef.current.play().catch(() => {});
      }
    };

    // ICE candidates → Firestore
    pc.onicecandidate = async (event) => {
      if (!event.candidate) return;
      const col = isOffer ? 'callerCandidates' : 'calleeCandidates';
      try {
        await addDoc(collection(db, 'calls', cid, col), event.candidate.toJSON());
      } catch {}
    };

    // Connection state changes — full state machine with ICE restart
    let iceRestartAttempts = 0;
    const MAX_ICE_RESTARTS = 3;

    pc.onconnectionstatechange = async () => {
      const state = pc.connectionState;

      if (state === 'connected') {
        iceRestartAttempts = 0;
        setCallStatus('connected');
        clearInterval(timerRef.current);
        timerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
      }

      if (state === 'disconnected') {
        // Brief disconnect — wait 4s then attempt ICE restart before giving up
        setCallStatus('reconnecting');
        setTimeout(async () => {
          if (pc.connectionState !== 'connected' && iceRestartAttempts < MAX_ICE_RESTARTS) {
            iceRestartAttempts++;
            try {
              // ICE restart: create new offer with iceRestart flag
              const offer = await pc.createOffer({ iceRestart: true });
              await pc.setLocalDescription(offer);
              const cid = callIdRef.current;
              if (cid) await updateDoc(doc(db, 'calls', cid), { offer: { sdp: offer.sdp, type: offer.type } }).catch(() => {});
            } catch {}
          }
        }, 4000);
      }

      if (['failed', 'closed'].includes(state)) {
        const cid = callIdRef.current;
        if (cid) updateDoc(doc(db, 'calls', cid), { status: 'ended' }).catch(() => {});
        cleanup();
      }
    };

    // ICE state — log failed candidates for debugging
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') {
        // Trigger ICE restart via offer with iceRestart flag
        pc.createOffer({ iceRestart: true })
          .then(offer => pc.setLocalDescription(offer))
          .catch(() => {});
      }
    };

    return pc;
  }, [cleanup, flushCandidates]);

  // ── Start outgoing call ───────────────────────────────
  const startCall = useCallback(async (targetUserId, type = 'voice') => {
    if (!targetUserId) throw new Error('No target user specified');
    if (!currentUserId) throw new Error('You must be logged in to call');

    setCallType(type);
    setRemoteUserId(targetUserId);
    setCallStatus('ringing');

    try {
      await getLocalStream(type === 'video');

      const cid = `${currentUserId}_${targetUserId}_${Date.now()}`;
      setCallId(cid);
      callIdRef.current = cid;

      const pc = createPC(cid, true);

      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: type === 'video',
      });
      await pc.setLocalDescription(offer);

      // Write call doc
      await setDoc(doc(db, 'calls', cid), {
        callerId:  currentUserId,
        calleeId:  targetUserId,
        type,
        status:    'ringing',
        offer:     { type: offer.type, sdp: offer.sdp },
        answer:    null,
        createdAt: serverTimestamp(),
      });

      // Watch for answer + status changes
      callDocUnsub.current = onSnapshot(doc(db, 'calls', cid), async (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();

        // Apply answer
        if (data.answer && pc.signalingState === 'have-local-offer') {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
            await flushCandidates(pc);
          } catch {}
        }

        if (data.status === 'declined' || data.status === 'ended') {
          cleanup();
        }
      });

      // Buffer callee ICE candidates
      iceCandUnsub.current = onSnapshot(collection(db, 'calls', cid, 'calleeCandidates'), (snap) => {
        snap.docChanges().forEach(async (change) => {
          if (change.type !== 'added') return;
          const candidate = change.doc.data();
          if (pc.remoteDescription) {
            try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
          } else {
            pendingCandidates.current.push(candidate);
          }
        });
      });

    } catch (err) {
      cleanup();
      throw err;
    }
  }, [currentUserId, getLocalStream, createPC, cleanup, flushCandidates]);

  // ── Answer incoming call ──────────────────────────────
  const answerCall = useCallback(async (cid, callData) => {
    if (!cid || !callData) throw new Error('Invalid call data');

    setCallType(callData.type || 'voice');
    setRemoteUserId(callData.callerId);
    setCallStatus('ringing');
    setCallId(cid);
    callIdRef.current = cid;

    try {
      await getLocalStream(callData.type === 'video');

      const pc = createPC(cid, false);

      await pc.setRemoteDescription(new RTCSessionDescription(callData.offer));
      await flushCandidates(pc);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await updateDoc(doc(db, 'calls', cid), {
        answer: { type: answer.type, sdp: answer.sdp },
        status: 'active',
      });

      // Buffer caller ICE candidates
      iceCandUnsub.current = onSnapshot(collection(db, 'calls', cid, 'callerCandidates'), (snap) => {
        snap.docChanges().forEach(async (change) => {
          if (change.type !== 'added') return;
          const candidate = change.doc.data();
          if (pc.remoteDescription) {
            try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
          } else {
            pendingCandidates.current.push(candidate);
          }
        });
      });

      // Watch for call end
      callDocUnsub.current = onSnapshot(doc(db, 'calls', cid), (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        if (data.status === 'ended' || data.status === 'declined') cleanup();
      });

    } catch (err) {
      cleanup();
      throw err;
    }
  }, [getLocalStream, createPC, cleanup, flushCandidates]);

  // ── Decline ───────────────────────────────────────────
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

  // ── Toggle mute ───────────────────────────────────────
  const toggleMute = useCallback(() => {
    const tracks = localStreamRef.current?.getAudioTracks() || [];
    if (!tracks.length) return;
    const newMuted = !isMuted;
    tracks.forEach(t => { t.enabled = !newMuted; });
    setIsMuted(newMuted);
  }, [isMuted]);

  // ── Toggle camera ─────────────────────────────────────
  const toggleCamera = useCallback(() => {
    const tracks = localStreamRef.current?.getVideoTracks() || [];
    if (!tracks.length) return;
    const newOff = !isVideoOff;
    tracks.forEach(t => { t.enabled = !newOff; });
    setIsVideoOff(newOff);
  }, [isVideoOff]);

  // ── Switch camera (front ↔ back) ──────────────────────
  const facingModeRef = useRef('user');
  const switchCamera = useCallback(async () => {
    if (!localStreamRef.current) return;
    const next = facingModeRef.current === 'user' ? 'environment' : 'user';
    facingModeRef.current = next;
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: next },
      });
      const newTrack = newStream.getVideoTracks()[0];
      if (!newTrack) return;
      // Replace track in peer connection
      if (pcRef.current) {
        const sender = pcRef.current.getSenders().find(s => s.track?.kind === 'video');
        if (sender) await sender.replaceTrack(newTrack);
      }
      // Swap in local stream
      localStreamRef.current.getVideoTracks().forEach(t => {
        localStreamRef.current.removeTrack(t);
        t.stop();
      });
      localStreamRef.current.addTrack(newTrack);
      if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
    } catch (e) {
      // Camera switch failed — device may not support switching
    }
  }, []);

  // ── Speaker toggle ────────────────────────────────────
  const toggleSpeaker = useCallback(() => {
    setIsSpeaker(prev => {
      const next = !prev;
      const el = remoteVideoRef.current;
      if (el && typeof el.setSinkId === 'function') {
        el.setSinkId(next ? 'default' : '').catch(() => {});
      }
      return next;
    });
  }, []);

  // ── Duration formatter ────────────────────────────────
  const formatDuration = (s) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  useEffect(() => () => cleanup(), []);

  return {
    callStatus, callType, remoteUserId, callId, // callStatus: idle|ringing|connected|reconnecting
    isMuted, isVideoOff, isSpeaker, callDuration,
    localVideoRef, remoteVideoRef,
    startCall, answerCall, declineCall, endCall,
    toggleMute, toggleCamera, toggleSpeaker, switchCamera,
    formatDuration,
  };
}
