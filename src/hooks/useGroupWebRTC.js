// ═══════════════════════════════════════════════════════
//  useGroupWebRTC — Mesh WebRTC for Group Calls
//  Family & Friends  ·  Built by Ishrit Sachdeva
// ═══════════════════════════════════════════════════════

import { useRef, useState, useCallback, useEffect } from 'react';
import {
  db, doc, onSnapshot, getDoc,
  createGroupCall, createGroupCallWithId, joinGroupCallDoc, endGroupCallDoc,
  subscribeToGroupCallDoc, subscribeToGroupSignals,
  storeGroupOffer, storeGroupAnswer,
  addGroupIceCandidate, subscribeToGroupCandidates,
} from '../firebase';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'turn:openrelay.metered.ca:80',  username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  ],
};

function stopStream(stream) {
  if (!stream) return;
  stream.getTracks().forEach(t => { try { t.stop(); t.enabled = false; } catch {} });
}

// Stage instrumentation for the meeting WebRTC pipeline — makes it possible
// to see in the console exactly which stage a stuck call is failing at:
// creation -> join -> offer -> answer -> ICE exchange -> connection state
// -> ICE state -> remote stream.
function vlog(...args) { console.log('[MEETING]', ...args); }

export function useGroupWebRTC(currentUserId) {
  const [gcCallId,       setGcCallId]       = useState(null);
  const [gcStatus,       setGcStatus]       = useState('idle');   // idle|waiting|active
  const [gcType,         setGcType]         = useState('voice');
  const [gcParticipants, setGcParticipants] = useState([]);
  const [gcInfo,         setGcInfo]         = useState(null);
  const [isMuted,        setIsMuted]        = useState(false);
  const [isVideoOff,     setIsVideoOff]     = useState(false);
  const [callDuration,   setCallDuration]   = useState(0);
  const [remoteStreams,  setRemoteStreams]   = useState({});
  const [localStream,    setLocalStream]    = useState(null);

  const localStreamRef  = useRef(null);
  const localVideoRef   = useRef(null);
  const lastVideoEl     = useRef(null);  // persists even after component unmounts
  const pcsRef          = useRef({});
  const pendingCands    = useRef({});
  const reconnectTimersRef = useRef({});
  const allUnsubsRef    = useRef([]);
  const signalUnsubRef  = useRef(null);
  const callDocUnsubRef = useRef(null);
  const timerRef        = useRef(null);
  const callIdRef       = useRef(null);
  const uidRef          = useRef(currentUserId);

  useEffect(() => { uidRef.current   = currentUserId; }, [currentUserId]);
  useEffect(() => { callIdRef.current = gcCallId;     }, [gcCallId]);

  const cleanup = useCallback(() => {
    clearInterval(timerRef.current);
    timerRef.current = null;

    if (signalUnsubRef.current)  { signalUnsubRef.current();  signalUnsubRef.current  = null; }
    if (callDocUnsubRef.current) { callDocUnsubRef.current(); callDocUnsubRef.current = null; }
    allUnsubsRef.current.forEach(fn => { try { fn(); } catch {} });
    allUnsubsRef.current = [];

    Object.values(pcsRef.current).forEach(pc => {
      try { pc.ontrack = pc.onicecandidate = pc.onconnectionstatechange = pc.oniceconnectionstatechange = null; pc.close(); } catch {}
    });
    pcsRef.current   = {};
    pendingCands.current = {};
    Object.values(reconnectTimersRef.current).forEach(t => clearTimeout(t));
    reconnectTimersRef.current = {};

    // Detach srcObject BEFORE stopping tracks — camera LED turns off
    // Use lastVideoEl as backup because localVideoRef.current may be null after unmount
    const videoEl = localVideoRef.current || lastVideoEl.current;
    if (videoEl) { try { videoEl.pause(); videoEl.srcObject = null; } catch {} }
    lastVideoEl.current = null;
    stopStream(localStreamRef.current);
    localStreamRef.current = null;
    setLocalStream(null);

    setGcCallId(null);
    setGcStatus('idle');
    setGcParticipants([]);
    setGcInfo(null);
    setCallDuration(0);
    setRemoteStreams({});
    setIsMuted(false);
    setIsVideoOff(false);
  }, []);

  const getLocalStream = useCallback(async (video = false) => {
    const videoEl = localVideoRef.current || lastVideoEl.current;
    if (videoEl) { try { videoEl.pause(); videoEl.srcObject = null; } catch {} }
    stopStream(localStreamRef.current);
    localStreamRef.current = null;
    setLocalStream(null);
    await new Promise(r => setTimeout(r, 300));

    const tries = video
      ? [
          { audio: { echoCancellation: true, noiseSuppression: true }, video: { facingMode: 'user' } },
          { audio: { echoCancellation: true, noiseSuppression: true }, video: true },
          { audio: { echoCancellation: true, noiseSuppression: true }, video: false },
        ]
      : [
          { audio: { echoCancellation: true, noiseSuppression: true }, video: false },
          { audio: true, video: false },
        ];

    for (const c of tries) {
      try {
        vlog('Requesting camera/mic', c);
        // Hard timeout — getUserMedia() has no built-in timeout and can hang
        // indefinitely on some browser/OS/driver combinations (e.g. two
        // getUserMedia() calls fired in quick succession on the same
        // hardware). A hung promise never resolves AND never rejects, so
        // without this, everything downstream — including every one of the
        // [MEETING] logs — silently never fires, while the UI stays on
        // "Calling..." forever with zero error to explain why.
        const stream = await Promise.race([
          navigator.mediaDevices.getUserMedia(c),
          new Promise((_, reject) => setTimeout(() => reject(new Error('getUserMedia timed out after 8s')), 8000)),
        ]);
        vlog('Camera/mic acquired', { video: !!c.video, audioTracks: stream.getAudioTracks().length, videoTracks: stream.getVideoTracks().length, audioEnabled: stream.getAudioTracks()[0]?.enabled });
        localStreamRef.current = stream;
        setLocalStream(stream);
        if (localVideoRef.current) {
          lastVideoEl.current = localVideoRef.current;  // save before it can be nulled
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.muted = true;
          localVideoRef.current.play().catch(() => {});
        }
        return stream;
      } catch (e) {
        console.error('[MEETING] getUserMedia attempt FAILED', c, e.message);
      }
    }
    throw new Error('Could not access microphone/camera');
  }, []);

  const drainPending = useCallback(async (peerUid) => {
    const pc    = pcsRef.current[peerUid];
    const queue = pendingCands.current[peerUid] || [];
    if (!pc || !queue.length) return;
    vlog('Draining pending ICE candidates', peerUid, queue.length);
    for (const c of queue) {
      try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch (e) { console.error('[MEETING] addIceCandidate FAILED (pending)', peerUid, e); }
    }
    pendingCands.current[peerUid] = [];
  }, []);

  const subscribeTheirCandidates = useCallback((cid, peerUid) => {
    const uid  = uidRef.current;
    const unsub = subscribeToGroupCandidates(cid, peerUid, uid, async (candidate) => {
      const pc = pcsRef.current[peerUid];
      if (!pc) return;
      if (pc.remoteDescription) {
        try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); }
        catch (e) { console.error('[MEETING] addIceCandidate FAILED', peerUid, e); }
      } else {
        if (!pendingCands.current[peerUid]) pendingCands.current[peerUid] = [];
        pendingCands.current[peerUid].push(candidate);
      }
    });
    allUnsubsRef.current.push(unsub);
  }, []);

  const makePc = useCallback((cid, peerUid) => {
    if (pcsRef.current[peerUid]) { try { pcsRef.current[peerUid].close(); } catch {} }
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcsRef.current[peerUid] = pc;

    if (localStreamRef.current) {
      const tracks = localStreamRef.current.getTracks();
      vlog('Adding local tracks to peer connection', peerUid, tracks.map(t => t.kind + ':' + t.enabled));
      tracks.forEach(track => {
        pc.addTrack(track, localStreamRef.current);
      });
    } else {
      console.error('[MEETING] makePc called with NO localStreamRef — no tracks will be sent to', peerUid);
    }

    pc.ontrack = (e) => {
      if (e.streams?.[0]) {
        const s = e.streams[0];
        vlog('Remote stream received', peerUid, 'audioTracks:', s.getAudioTracks().length, 'videoTracks:', s.getVideoTracks().length, 'audioEnabled:', s.getAudioTracks()[0]?.enabled, 'audioMuted:', s.getAudioTracks()[0]?.muted);
        setRemoteStreams(prev => ({ ...prev, [peerUid]: e.streams[0] }));
      }
    };

    pc.onicecandidate = (e) => {
      if (!e.candidate) return;
      addGroupIceCandidate(cid, uidRef.current, peerUid, e.candidate.toJSON()).catch(() => {});
    };

    // ICE connection state — the actual NAT-traversal/connectivity signal.
    // 'disconnected' is a NORMAL, often-transient state (a brief network
    // blip, a dropped packet) — modern browsers attempt their own recovery
    // automatically. Previously this code treated 'disconnected' the same
    // as 'failed'/'closed' and immediately tore down the peer connection
    // and removed the remote video — killing connections that would have
    // self-healed within seconds, and any REAL failure never got an
    // explicit restartIce() attempt at all.
    pc.oniceconnectionstatechange = () => {
      vlog('ICE connection state', peerUid, pc.iceConnectionState);
      if (pc.iceConnectionState === 'disconnected') {
        // Grace period — give it a chance to recover on its own before
        // trying anything, and before ever tearing down the UI.
        clearTimeout(reconnectTimersRef.current[peerUid]);
        reconnectTimersRef.current[peerUid] = setTimeout(() => {
          const stillPc = pcsRef.current[peerUid];
          if (!stillPc) return;
          if (stillPc.iceConnectionState === 'disconnected') {
            vlog('Still disconnected after grace period — attempting ICE restart', peerUid);
            try { stillPc.restartIce(); } catch {}
          }
        }, 4000);
      } else if (pc.iceConnectionState === 'failed') {
        vlog('ICE failed — attempting restart', peerUid);
        try { pc.restartIce(); } catch {}
      } else if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        clearTimeout(reconnectTimersRef.current[peerUid]);
      }
    };

    pc.onconnectionstatechange = () => {
      vlog('Peer connection state changed', peerUid, pc.connectionState);
      // Only truly terminal states tear down the UI — 'disconnected' alone
      // is handled above via ICE restart, not treated as fatal here.
      if (['failed', 'closed'].includes(pc.connectionState)) {
        clearTimeout(reconnectTimersRef.current[peerUid]);
        delete pcsRef.current[peerUid];
        setRemoteStreams(prev => { const n = { ...prev }; delete n[peerUid]; return n; });
      }
    };

    return pc;
  }, []);

  const offerToPeer = useCallback(async (cid, peerUid) => {
    const uid = uidRef.current;
    const pc  = makePc(cid, peerUid);
    try {
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
      await pc.setLocalDescription(offer);
      await storeGroupOffer(cid, uid, peerUid, { type: offer.type, sdp: offer.sdp });

      const signalKey = `${uid}_${peerUid}`;
      const unsub = onSnapshot(doc(db, 'groupCalls', cid, 'signals', signalKey), async (snap) => {
        const data = snap.data();
        if (data?.answer && pc.signalingState === 'have-local-offer') {
          vlog('Answer received', peerUid);
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
            await drainPending(peerUid);
            subscribeTheirCandidates(cid, peerUid);
          } catch (e) { console.error('[MEETING] setRemoteDescription(answer) FAILED', peerUid, e); }
        }
      }, e => console.error('[MEETING] signal listener error (offerer side)', peerUid, e));
      allUnsubsRef.current.push(unsub);
    } catch (e) {
      console.error('[MEETING] offerToPeer FAILED', peerUid, e);
    }
  }, [makePc, drainPending, subscribeTheirCandidates]);

  const answerOffer = useCallback(async (cid, signal) => {
    const uid     = uidRef.current;
    const peerUid = signal.from;
    if (pcsRef.current[peerUid]) return;
    const pc = makePc(cid, peerUid);
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(signal.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await storeGroupAnswer(cid, peerUid, uid, { type: answer.type, sdp: answer.sdp });
      await drainPending(peerUid);
      subscribeTheirCandidates(cid, peerUid);
    } catch (e) {
      console.error('[MEETING] answerOffer FAILED', peerUid, e);
    }
  }, [makePc, drainPending, subscribeTheirCandidates]);

  const listenForOffers = useCallback((cid) => {
    if (signalUnsubRef.current) { signalUnsubRef.current(); }
    vlog('Listening for offers', cid);
    signalUnsubRef.current = subscribeToGroupSignals(cid, uidRef.current, (signal) => {
      answerOffer(cid, signal);
    });
  }, [answerOffer]);

  const watchCallDoc = useCallback((cid) => {
    if (callDocUnsubRef.current) { callDocUnsubRef.current(); }
    callDocUnsubRef.current = subscribeToGroupCallDoc(cid, (data) => {
      if (!data || data.status === 'ended') {
        vlog('Call doc ended or missing — cleaning up', cid, data?.status);
        cleanup();
        return;
      }
      const parts = data.participants || [];
      setGcParticipants(parts);
      // Immediately promote to 'active' when 2+ participants present
      // (don't wait for the separate useEffect to fire)
      if (parts.length >= 2) {
        setGcStatus('active');
        if (!timerRef.current) {
          timerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
        }
      }
    });
  }, [cleanup]);

  // ── Start a group call (I am initiator) ──────────────
  // callerName must be passed — e.g. profile.name from AuthContext
  const startGroupCall = useCallback(async (group, memberIds, type, callerName) => {
    const uid = uidRef.current;
    setGcType(type);
    setGcInfo({ id: group.id, name: group.name });
    setGcStatus('waiting');   // waiting = caller is waiting for others

    try {
      await getLocalStream(type === 'video');

      const cid = await createGroupCall(
        group.id,
        group.name,
        uid,
        callerName || 'Someone',
        memberIds.filter(id => id !== uid),
        type
      );
      setGcCallId(cid);
      setGcParticipants([uid]);

      listenForOffers(cid);
      watchCallDoc(cid);
    } catch (e) {
      cleanup();
      throw e;
    }
  }, [getLocalStream, listenForOffers, watchCallDoc, cleanup]);

  // ── Join an existing group call ───────────────────────
  const joinGroupCall = useCallback(async (callData) => {
    const uid = uidRef.current;
    const cid = callData.id;
    setGcType(callData.type);
    setGcInfo({ id: callData.groupId, name: callData.groupName });
    setGcStatus('active');
    setGcCallId(cid);

    try {
      await getLocalStream(callData.type === 'video');

      const existing = (callData.participants || []).filter(p => p !== uid);
      await joinGroupCallDoc(cid, uid);
      setGcParticipants([...(callData.participants || []), uid]);

      for (const peerUid of existing) {
        await offerToPeer(cid, peerUid);
      }

      listenForOffers(cid);
      watchCallDoc(cid);

      if (!timerRef.current) {
        timerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
      }
    } catch (e) {
      cleanup();
      throw e;
    }
  }, [getLocalStream, offerToPeer, listenForOffers, watchCallDoc, cleanup]);

  // ── Start a MEETING call — host, deterministic call ID ──
  // Used by MeetingRoom.jsx: the meeting code IS the call ID,
  // so admitted participants can join the exact same signaling doc.
  const startMeetingCall = useCallback(async (meetingCode, meetingName, callerName, type = 'video') => {
    const uid = uidRef.current;
    setGcType(type);
    setGcInfo({ id: meetingCode, name: meetingName });
    setGcStatus('waiting');

    try {
      await getLocalStream(type === 'video');

      const cid = await createGroupCallWithId(meetingCode, meetingName, uid, callerName || 'Host', type);
      vlog('Meeting started by host', cid);
      setGcCallId(cid);

      // A participant can already be in the call doc's participants array
      // if they were admitted in the lobby and auto-joined BEFORE the host
      // clicked "Start Video Feed" (see joinGroupCallDoc's upsert fix).
      // joinMeetingCall only offers to whoever it saw as "existing" at the
      // moment IT joined — if that snapshot was taken before this doc even
      // existed, it saw nobody, and never offered to the host. Since the
      // host was never offering to pre-existing participants either, that
      // combination meant NO SDP OFFER was ever sent in either direction —
      // no peer connection was ever created, independent of participant
      // count or ICE/network. Re-reading the doc here and offering to
      // anyone already present closes that gap symmetrically.
      let existing = [];
      try {
        const snap = await getDoc(doc(db, 'groupCalls', cid));
        existing = (snap.exists() ? snap.data()?.participants : []) || [];
      } catch (e) { console.error('[MEETING] Could not read existing participants on start', e); }
      existing = existing.filter(p => p !== uid);
      setGcParticipants([uid, ...existing]);

      listenForOffers(cid);
      watchCallDoc(cid);

      for (const peerUid of existing) {
        vlog('Host offering to already-present participant', peerUid);
        await offerToPeer(cid, peerUid);
      }

      if (!timerRef.current) {
        timerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
      }
      setGcStatus('active');
    } catch (e) {
      cleanup();
      throw e;
    }
  }, [getLocalStream, offerToPeer, listenForOffers, watchCallDoc, cleanup]);

  // ── Join a MEETING call — participant, after host admission ──
  // The meeting code is already known to be valid (admission already
  // happened in the waiting room) — this just joins the signaling doc.
  const joinMeetingCall = useCallback(async (meetingCode, meetingName, type = 'video') => {
    const uid = uidRef.current;
    setGcType(type);
    setGcInfo({ id: meetingCode, name: meetingName });
    setGcStatus('active');
    setGcCallId(meetingCode);

    try {
      await getLocalStream(type === 'video');

      // Read current participants before joining, so we know who to offer to
      let existing = [];
      try {
        const snap = await new Promise((resolve) => {
          const unsub = onSnapshot(doc(db, 'groupCalls', meetingCode), (s) => { unsub(); resolve(s); });
        });
        existing = (snap.exists() ? snap.data()?.participants : []) || [];
      } catch {}

      await joinGroupCallDoc(meetingCode, uid);
      vlog('User joined meeting', { meetingCode, uid, existingParticipants: existing });
      setGcParticipants([...existing.filter(p => p !== uid), uid]);

      for (const peerUid of existing.filter(p => p !== uid)) {
        vlog('Joiner offering to existing participant', peerUid);
        await offerToPeer(meetingCode, peerUid);
      }

      listenForOffers(meetingCode);
      watchCallDoc(meetingCode);

      if (!timerRef.current) {
        timerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
      }
    } catch (e) {
      cleanup();
      throw e;
    }
  }, [getLocalStream, offerToPeer, listenForOffers, watchCallDoc, cleanup]);

  // ── Leave call ────────────────────────────────────────
  const leaveGroupCall = useCallback(async () => {
    const cid = callIdRef.current;
    if (cid) { try { await endGroupCallDoc(cid); } catch {} }
    cleanup();
  }, [cleanup]);

  // ── Toggle mute — uses current isMuted state to avoid stale closure
  const toggleGroupMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const audioTracks = stream.getAudioTracks();
    const willMute = audioTracks.some(t => t.enabled);   // if any track is enabled, we mute
    audioTracks.forEach(t => { t.enabled = !willMute; });
    setIsMuted(willMute);
  }, []);

  // ── Toggle camera
  const toggleGroupVideo = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const videoTracks = stream.getVideoTracks();
    const willOff = videoTracks.some(t => t.enabled);
    videoTracks.forEach(t => { t.enabled = !willOff; });
    setIsVideoOff(willOff);
  }, []);

  const formatDuration = (s) => {
    const m   = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  // Start timer and switch to 'active' when a second participant joins
  // Note: gcStatus intentionally excluded from deps to avoid re-run loop when we setGcStatus here
  const gcStatusRef = useRef('idle');
  useEffect(() => { gcStatusRef.current = gcStatus; }, [gcStatus]);
  useEffect(() => {
    if (gcParticipants.length >= 2 && (gcStatusRef.current === 'waiting' || gcStatusRef.current === 'active')) {
      setGcStatus('active');
      if (!timerRef.current) {
        timerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
      }
    }
  }, [gcParticipants.length]);

  // Re-attach local stream to video element whenever stream or ref changes
  useEffect(() => {
    if (!localStream || !localVideoRef.current) return;
    if (localVideoRef.current.srcObject !== localStream) {
      lastVideoEl.current = localVideoRef.current;
      localVideoRef.current.srcObject = localStream;
      localVideoRef.current.muted = true;
      localVideoRef.current.play().catch(() => {});
    }
  }, [localStream]);

  useEffect(() => () => cleanup(), []);

  // ── Switch camera (front ↔ back) ──────────────────────
  const switchGroupCamera = useCallback(async () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) return;
    const currentFacing = videoTrack.getSettings().facingMode || 'user';
    const nextFacing    = currentFacing === 'user' ? 'environment' : 'user';
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: nextFacing }, audio: false });
      const newTrack  = newStream.getVideoTracks()[0];
      for (const pc of Object.values(pcsRef.current)) {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) await sender.replaceTrack(newTrack).catch(() => {});
      }
      stream.removeTrack(videoTrack);
      stream.addTrack(newTrack);
      videoTrack.stop();
    } catch {}
  }, []);

  return {
    gcCallId, gcStatus, gcType, gcParticipants, gcInfo,
    isMuted, isVideoOff, callDuration, remoteStreams,
    localStream,
    localVideoRef,
    startGroupCall, joinGroupCall, leaveGroupCall,
    startMeetingCall, joinMeetingCall,
    toggleGroupMute, toggleGroupVideo, switchGroupCamera,
    formatDuration,
  };
}
