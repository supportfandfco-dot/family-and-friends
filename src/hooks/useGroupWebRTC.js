// ═══════════════════════════════════════════════════════
//  useGroupWebRTC — Mesh WebRTC for Group Calls
//  Family & Friends  ·  Built by Ishrit Sachdeva
// ═══════════════════════════════════════════════════════

import { useRef, useState, useCallback, useEffect } from 'react';
import {
  db, doc, onSnapshot,
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
      try { pc.ontrack = pc.onicecandidate = pc.onconnectionstatechange = null; pc.close(); } catch {}
    });
    pcsRef.current   = {};
    pendingCands.current = {};

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
        const stream = await navigator.mediaDevices.getUserMedia(c);
        localStreamRef.current = stream;
        setLocalStream(stream);
        if (localVideoRef.current) {
          lastVideoEl.current = localVideoRef.current;  // save before it can be nulled
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.muted = true;
          localVideoRef.current.play().catch(() => {});
        }
        return stream;
      } catch {}
    }
    throw new Error('Could not access microphone/camera');
  }, []);

  const drainPending = useCallback(async (peerUid) => {
    const pc    = pcsRef.current[peerUid];
    const queue = pendingCands.current[peerUid] || [];
    if (!pc || !queue.length) return;
    for (const c of queue) {
      try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
    }
    pendingCands.current[peerUid] = [];
  }, []);

  const subscribeTheirCandidates = useCallback((cid, peerUid) => {
    const uid  = uidRef.current;
    const unsub = subscribeToGroupCandidates(cid, peerUid, uid, async (candidate) => {
      const pc = pcsRef.current[peerUid];
      if (!pc) return;
      if (pc.remoteDescription) {
        try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
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
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    pc.ontrack = (e) => {
      if (e.streams?.[0]) {
        setRemoteStreams(prev => ({ ...prev, [peerUid]: e.streams[0] }));
      }
    };

    pc.onicecandidate = (e) => {
      if (!e.candidate) return;
      addGroupIceCandidate(cid, uidRef.current, peerUid, e.candidate.toJSON()).catch(() => {});
    };

    pc.onconnectionstatechange = () => {
      if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
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
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
            await drainPending(peerUid);
            subscribeTheirCandidates(cid, peerUid);
          } catch {}
        }
      });
      allUnsubsRef.current.push(unsub);
    } catch (e) { console.warn('offerToPeer failed:', peerUid, e); }
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
    } catch (e) { console.warn('answerOffer failed:', peerUid, e); }
  }, [makePc, drainPending, subscribeTheirCandidates]);

  const listenForOffers = useCallback((cid) => {
    if (signalUnsubRef.current) { signalUnsubRef.current(); }
    signalUnsubRef.current = subscribeToGroupSignals(cid, uidRef.current, (signal) => {
      answerOffer(cid, signal);
    });
  }, [answerOffer]);

  const watchCallDoc = useCallback((cid) => {
    if (callDocUnsubRef.current) { callDocUnsubRef.current(); }
    callDocUnsubRef.current = subscribeToGroupCallDoc(cid, (data) => {
      if (!data || data.status === 'ended') { cleanup(); return; }
      setGcParticipants(data.participants || []);
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
      setGcCallId(cid);
      setGcParticipants([uid]);

      listenForOffers(cid);
      watchCallDoc(cid);

      if (!timerRef.current) {
        timerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
      }
      setGcStatus('active');
    } catch (e) {
      cleanup();
      throw e;
    }
  }, [getLocalStream, listenForOffers, watchCallDoc, cleanup]);

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
      setGcParticipants([...existing.filter(p => p !== uid), uid]);

      for (const peerUid of existing.filter(p => p !== uid)) {
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
  useEffect(() => {
    if (gcParticipants.length >= 2 && (gcStatus === 'waiting' || gcStatus === 'active')) {
      setGcStatus('active');
      if (!timerRef.current) {
        timerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
      }
    }
  }, [gcParticipants.length, gcStatus]);

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

  return {
    gcCallId, gcStatus, gcType, gcParticipants, gcInfo,
    isMuted, isVideoOff, callDuration, remoteStreams,
    localStream,
    localVideoRef,
    startGroupCall, joinGroupCall, leaveGroupCall,
    startMeetingCall, joinMeetingCall,
    toggleGroupMute, toggleGroupVideo,
    formatDuration,
  };
}
