// ═══════════════════════════════════════════════════════
//  App.jsx — Family & Friends Messaging Platform
//  Built by Ishrit Sachdeva
// ═══════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef } from 'react';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { useWebRTC } from './hooks/useWebRTC';
import { useGroupWebRTC } from './hooks/useGroupWebRTC';
// Calls/meetings signaling (offers/answers/ICE, ringing state) is Phase 3
// territory — not migrated yet, being redesigned onto Supabase Realtime
// Broadcast rather than ported as-is (see MIGRATION_NOTES.md). Everything
// below is used ONLY by the two signaling-listener effects further down.
import {
  db, doc, getDoc, onSnapshot, query, collection, where,
  subscribeToIncomingGroupCalls,
} from './firebase';
import { getUserById, sendPushNotification, getChatById, getGroupById } from './supabase';
import {
  useNotifications, listenForNotificationTaps, handleLaunchUrl,
} from './hooks/useNotifications';
import { useNativePush } from './hooks/useNativePush';
import { useAIAutoPilot } from './hooks/useAIAutoPilot';
import { useIntelligenceEngine } from './hooks/useIntelligenceEngine';
import toast from 'react-hot-toast';

import PhoneAuth from './components/Auth/PhoneAuth';
import ChatList from './components/Chat/ChatList';
import AddContact from './components/Contacts/AddContact';
import ChatWindow from './components/Chat/ChatWindow';
import ErrorBoundary from './components/ErrorBoundary';
import { GroupChatWindow } from './components/Groups/GroupChat';
import Settings from './components/Settings/Settings';
import CallScreen from './components/Calls/CallScreen';
import GroupCallScreen from './components/Calls/GroupCallScreen';
import MeetingRoom from './components/Calls/MeetingRoom';

function AppInner() {
  const { user, profile, loading, isAuthenticated } = useAuth();

  // ── Auto-lock enforcement ────────────────────────────────────
  const [isLocked, setIsLocked] = useState(false);
  const lockTimerRef = useRef(null);
  const lastActivityRef = useRef(Date.now());

  useEffect(() => {
    if (!isAuthenticated) return;
    const settings = (() => { try { return JSON.parse(localStorage.getItem('ff_chat_settings')) || {}; } catch { return {}; } })();
    const lockInterval = settings.autoLock || 'session';
    if (lockInterval === 'session') return; // only lock on manual action

    const intervals = { immediate: 0, '1min': 60000, '5min': 300000 };
    const ms = intervals[lockInterval];
    if (ms === undefined) return;

    const resetTimer = () => {
      lastActivityRef.current = Date.now();
      clearTimeout(lockTimerRef.current);
      if (ms === 0) return; // immediate = lock on visibility change only
      lockTimerRef.current = setTimeout(() => setIsLocked(true), ms);
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        if (ms === 0) setIsLocked(true);
      } else {
        resetTimer();
      }
    };

    window.addEventListener('touchstart', resetTimer);
    window.addEventListener('click', resetTimer);
    document.addEventListener('visibilitychange', onVisibilityChange);
    resetTimer();

    return () => {
      clearTimeout(lockTimerRef.current);
      window.removeEventListener('touchstart', resetTimer);
      window.removeEventListener('click', resetTimer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [isAuthenticated]);

  // ── Sound effects ─────────────────────────────────────────────
  const playSoundEffect = useCallback((type) => {
    try {
      const settings = JSON.parse(localStorage.getItem('ff_chat_settings') || '{}');
      if (settings.soundEffects === false) return;
    } catch {}
    try {
      const ctx  = new (window.AudioContext || window.webkitAudioContext)();
      const gain = ctx.createGain();
      gain.connect(ctx.destination);

      if (type === 'send') {
        // Two-tone "whoosh" — clearly audible
        const o1 = ctx.createOscillator();
        o1.type = 'sine';
        o1.connect(gain);
        o1.frequency.setValueAtTime(1200, ctx.currentTime);
        o1.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.35, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
        o1.start(ctx.currentTime);
        o1.stop(ctx.currentTime + 0.18);

      } else if (type === 'receive') {
        // Two-note "ding" — clearly audible
        const playNote = (freq, startAt, dur) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'sine';
          o.connect(g); g.connect(ctx.destination);
          o.frequency.value = freq;
          g.gain.setValueAtTime(0.4, startAt);
          g.gain.exponentialRampToValueAtTime(0.001, startAt + dur);
          o.start(startAt); o.stop(startAt + dur);
        };
        playNote(880, ctx.currentTime, 0.12);
        playNote(1100, ctx.currentTime + 0.1, 0.15);
      }
    } catch {}
  }, []);
  const [activeChat, setActiveChat]       = useState(null);
  const [showSettings, setShowSettings]   = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [incomingCall, setIncomingCall] = useState(null);
  const [callerProfile, setCallerProfile] = useState(null);
  const [activeRemoteUser, setActiveRemoteUser] = useState(null);
  const [isMobile, setIsMobile]         = useState(window.innerWidth < 1024);
  // Store pre-requested stream so it's ready when call comes
  

  const {
    callStatus, callType, remoteUserId, callId,
    isMuted, isVideoOff, isSpeaker, callDuration,
    localVideoRef, remoteVideoRef,
    startCall, answerCall, declineCall, endCall,
    toggleMute, toggleCamera, toggleSpeaker, switchCamera, formatDuration
  } = useWebRTC(user?.uid);

  // ── Group calls ───────────────────────────────────────
  const {
    gcCallId, gcStatus, gcType, gcParticipants, gcInfo,
    isMuted: gcMuted, isVideoOff: gcVideoOff, callDuration: gcDuration,
    remoteStreams, localStream: gcLocalStream, localVideoRef: gcLocalVideoRef,
    startGroupCall, joinGroupCall, leaveGroupCall,
    startMeetingCall, joinMeetingCall,
    toggleGroupMute, toggleGroupVideo, switchGroupCamera,
    formatDuration: gcFormat,
  } = useGroupWebRTC(user?.uid);

  const [incomingGroupCall, setIncomingGroupCall] = useState(null);
  const [gcMemberProfiles,  setGcMemberProfiles]  = useState({});

  // General-purpose profile loader for the call screen — fetches any
  // participant UID not already in gcMemberProfiles directly via
  // getUserById(), regardless of call type. The two existing population
  // paths (incoming-group-call ring lookup via a real groups/{groupId} doc,
  // and GroupChatWindow's member list) never fire for meetings, since
  // meetings use the meeting CODE as a fake groupId (there's no real
  // groups/{meetingCode} document) and don't route through
  // GroupChatWindow at all — so gcMemberProfiles stayed permanently empty
  // for every meeting, and ParticipantTile's uid.slice(0,8) fallback was
  // showing raw UID fragments as names for every participant. This covers
  // every call type uniformly instead of adding a third narrow, duplicate
  // path.
  useEffect(() => {
    if (gcStatus === 'idle' || !gcParticipants.length) return;
    const missing = gcParticipants.filter(uid => uid && !gcMemberProfiles[uid]);
    if (!missing.length) return;
    let cancelled = false;
    Promise.all(missing.map(uid => getUserById(uid))).then(results => {
      if (cancelled) return;
      const additions = {};
      results.filter(Boolean).forEach(p => { additions[p.id] = p; });
      if (Object.keys(additions).length) {
        setGcMemberProfiles(prev => ({ ...prev, ...additions }));
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [gcStatus, gcParticipants, gcMemberProfiles]);

  // ── Global AI Auto-Pilot ─────────────────────────────
  useAIAutoPilot(user?.uid, profile);
  useIntelligenceEngine(user?.uid);

  // ── Responsive ───────────────────────────────────────
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // ── Open chat/group by ID (used by notification routing) ─────
  const openChatById = useCallback(async (chatId) => {
    // chatId is a Supabase chats.id — find the partner via the two
    // participant ids (getChatById synthesizes `participants` from
    // user1_id/user2_id to match the shape this used to read off Firestore).
    if (!user) return;
    try {
      const chat = await getChatById(chatId);
      if (!chat) return;
      const partnerId = chat.participants.find(id => id !== user.uid);
      if (!partnerId) return;
      const partner = await getUserById(partnerId);
      if (partner) handleSelectChat(partner, chatId);
    } catch {}
  }, [user]);

  const openGroupById = useCallback(async (groupId) => {
    if (!user) return;
    try {
      const group = await getGroupById(groupId, user.uid);
      if (group) handleSelectGroup(group);
    } catch {}
  }, [user]);

  // ── Push notifications (FCM token + foreground listener) ──────
  useNotifications(user?.uid, {
    onOpenChat:  openChatById,
    onOpenGroup: openGroupById,
  });

  // ── Native Android push (when running as APK) ─────────────────
  useNativePush(user?.uid, {
    onOpenChat:  openChatById,
    onOpenGroup: openGroupById,
  });

  // Handle notification tap when app was already open (SW postMessage)
  useEffect(() => {
    return listenForNotificationTaps({
      onOpenChat:  openChatById,
      onOpenGroup: openGroupById,
    });
  }, [openChatById, openGroupById]);

  // Handle URL params when app was launched from a notification click
  useEffect(() => {
    if (!user) return;
    handleLaunchUrl({ onOpenChat: openChatById, onOpenGroup: openGroupById });
  }, [user?.uid]);

  // ── Incoming group calls (signaling — deferred to Phase 3, see top-of-file note) ──
  useEffect(() => {
    if (!user) return;
    return subscribeToIncomingGroupCalls(user.uid, async (callData) => {
      setIncomingGroupCall(callData);
      // Load member profiles so call screen shows real names/avatars
      if (callData?.groupId) {
        try {
          const groupSnap = await getDoc(doc(db, 'groups', callData.groupId));
          if (groupSnap.exists()) {
            const members = groupSnap.data().members || [];
            const profiles = await Promise.all(members.map(uid => getUserById(uid)));
            const map = {};
            profiles.filter(Boolean).forEach(p => { map[p.id] = p; });
            if (user?.uid && profile) map[user.uid] = profile;
            setGcMemberProfiles(map);
          }
        } catch {}
      }
    });
  }, [user, profile]);



  // ── Listen for incoming calls (signaling — deferred to Phase 3) ──────
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'calls'),
      where('calleeId', '==', user.uid),
      where('status', '==', 'ringing')
    );
    const unsub = onSnapshot(q, async (snap) => {
      if (!snap.empty) {
        const callDoc = { id: snap.docs[0].id, ...snap.docs[0].data() };
        setIncomingCall(callDoc);
        const caller = await getUserById(callDoc.callerId);
        setCallerProfile(caller);
        setActiveRemoteUser(caller);
      } else {
        setIncomingCall(null);
        setCallerProfile(null);
      }
    });
    return unsub;
  }, [user]);

  // ── Reset remote user when call ends ─────────────────
  useEffect(() => {
    if (callStatus === 'idle') setActiveRemoteUser(null);
  }, [callStatus]);

  // ── Navigation ────────────────────────────────────────
  const handleSelectChat = useCallback((partner, chatId) => {
    // Guard: never open a chat with an unloaded/undefined partner
    if (!partner?.id && !partner?.uid) return;
    setShowSettings(false);
    setActiveChat({ type: 'chat', data: partner, id: chatId });
  }, []);

  const handleSelectGroup = useCallback((group) => {
    setShowSettings(false);
    setActiveChat({ type: 'group', data: group, id: group.id });
  }, []);

  const handleBack = useCallback(() => {
    setActiveChat(null);
    setShowSettings(false);
  }, []);

  // checkMediaPermission was removed — it did its own getUserMedia()
  // grab-then-stop as a pre-flight check before startCall/startMeetingCall/
  // joinMeetingCall each made their OWN separate getUserMedia() call for the
  // real stream. That double-acquisition, back-to-back on the same
  // hardware, was the root cause of meetings hanging on "Calling..."
  // forever with zero console output: getUserMedia() has no built-in
  // timeout, so when the second call raced the first and hung, nothing
  // downstream ever ran — no success, no error, nothing. Permission errors
  // are now surfaced directly from the real acquisition (getLocalStream in
  // useGroupWebRTC.js / useWebRTC.js), which already has proper try/catch
  // and user-facing error messages, without a redundant pre-flight call
  // that only recreated the exact race it was meant to guard against.

  // ── Meeting room state ────────────────────────────────
  const [activeMeeting, setActiveMeeting] = useState(null); // { code, isHost }

  // ── Outgoing calls ────────────────────────────────────
  const handleVoiceCall = async (partner) => {
    if (!partner?.id && !partner?.uid) { toast.error('Contact not loaded yet, please wait.'); return; }
    const partnerId = partner.id || partner.uid;
    // No separate checkMediaPermission() pre-flight — same root cause as the
    // meeting call fix: it did its own getUserMedia() grab-then-stop, then
    // startCall()'s own getLocalStream-equivalent immediately made a SECOND
    // getUserMedia() call, racing on the same hardware. startCall() already
    // does its own real acquisition with proper error handling.
    setActiveRemoteUser(partner);
    try {
      await startCall(partnerId, 'voice');
      sendPushNotification(
        partnerId,
        profile?.name || 'Someone',
        '📞 Incoming voice call — tap to answer',
        { callType: 'voice', callerId: user.uid, tag: `call-${user.uid}` }
      ).catch(() => {});
    } catch (err) {
      setActiveRemoteUser(null);
      toast.error(err.message || 'Could not start call. Check microphone permissions.');
    }
  };

  const handleVideoCall = async (partner) => {
    // ── Intercept meeting room calls — never route through WebRTC ──
    if (partner?.isMeeting && partner?.meetingCode) {
      setActiveMeeting({ code: partner.meetingCode, isHost: !!partner.isHost });
      return;
    }
    if (!partner?.id && !partner?.uid) { toast.error('Contact not loaded yet, please wait.'); return; }
    const partnerId = partner.id || partner.uid;
    // Same fix as handleVoiceCall above — no redundant pre-flight getUserMedia.
    setActiveRemoteUser(partner);
    try {
      await startCall(partnerId, 'video');
      sendPushNotification(
        partnerId,
        profile?.name || 'Someone',
        '📹 Incoming video call — tap to answer',
        { callType: 'video', callerId: user.uid, tag: `call-${user.uid}` }
      ).catch(() => {});
    } catch (err) {
      setActiveRemoteUser(null);
      toast.error(err.message || 'Could not start call. Check camera permissions.');
    }
  };

  // ── Answer call ───────────────────────────────────────
  const handleAnswerCall = async () => {
    if (!incomingCall) return;
    const caller = callerProfile;
    setActiveRemoteUser(caller);
    setIncomingCall(null);
    try {
      await answerCall(incomingCall.id, incomingCall);
    } catch (err) {
      toast.error('Could not access camera/microphone. Please check permissions.');
      setActiveRemoteUser(null);
    }
  };

  // ── Decline call ──────────────────────────────────────
  const handleDeclineCall = async () => {
    if (incomingCall) await declineCall(incomingCall.id);
    setIncomingCall(null);
    setActiveRemoteUser(null);
  };

  // ── End call ──────────────────────────────────────────
  const handleEndCall = async () => {
    await endCall();
    setActiveRemoteUser(null);
  };

  // ── Group call handlers ───────────────────────────────
  const handleGroupVoiceCall = async (group) => {
    try {
      await startGroupCall(group, group.members || [], 'voice', profile?.name || 'Someone');
      const callerName = profile?.name || 'Someone';
      (group.members || []).filter(id => id !== user.uid).forEach(memberId => {
        sendPushNotification(memberId, callerName,
          `📞 Calling in ${group.name}`,
          { groupId: group.id, callType: 'voice', tag: `gcall-${group.id}` }
        ).catch(() => {});
      });
    } catch (e) {
      toast.error('Could not start group call. Check microphone permissions.');
    }
  };

  const handleGroupVideoCall = async (group) => {
    try {
      await startGroupCall(group, group.members || [], 'video', profile?.name || 'Someone');
      const callerName = profile?.name || 'Someone';
      (group.members || []).filter(id => id !== user.uid).forEach(memberId => {
        sendPushNotification(memberId, callerName,
          `📹 Video calling in ${group.name}`,
          { groupId: group.id, callType: 'video', tag: `gcall-${group.id}` }
        ).catch(() => {});
      });
    } catch (e) {
      toast.error('Could not start group call. Check camera/microphone permissions.');
    }
  };

  const handleJoinGroupCall = async () => {
    if (!incomingGroupCall) return;
    const data = incomingGroupCall;
    setIncomingGroupCall(null);
    try {
      await joinGroupCall(data);
    } catch (e) {
      toast.error('Could not join call. Check microphone permissions.');
    }
  };

  const handleDeclineGroupCall = () => {
    setIncomingGroupCall(null);
    // Don't end the call for others — just dismiss for this user
  };

  const handleLeaveGroupCall = async () => {
    await leaveGroupCall();
  };

  // ── Loading ───────────────────────────────────────────
  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-brand-950">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-3xl bg-brand-500/20 flex items-center justify-center">
            <div className="w-8 h-8 border-3 border-brand-500/30 border-t-brand-500 rounded-full animate-spin"
                 style={{ borderWidth: '3px' }} />
          </div>
          <p className="text-brand-200/50 text-sm">Loading Family & Friends...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return <PhoneAuth />;

  // ── Lock screen ──────────────────────────────────────────────
  if (isLocked) {
    return (
      <div className="fixed inset-0 z-[999] bg-[var(--sidebar-bg)] flex flex-col items-center justify-center gap-6 p-8">
        <div className="w-16 h-16 rounded-2xl bg-brand-500/10 flex items-center justify-center">
          <span className="text-3xl">🔒</span>
        </div>
        <div className="text-center">
          <h2 className="font-bold text-xl text-[var(--text-primary)]">Family & Friends</h2>
          <p className="text-sm text-[var(--text-secondary)] mt-1">Tap to unlock</p>
        </div>
        <button
          onClick={() => setIsLocked(false)}
          className="w-full max-w-xs py-3 bg-brand-500 hover:bg-brand-600 text-white rounded-2xl font-semibold text-sm transition-all active:scale-95">
          Unlock
        </button>
      </div>
    );
  }

  const showSidebar = !isMobile || (!activeChat && !showSettings);
  const showMain    = !isMobile || activeChat || showSettings;

  const handleOpenSettings = (section) => {
    setShowSettings(true);
    setActiveChat(null);
    // Pass section to Settings via a ref or state
    if (section) setTimeout(() => { window.__ff_settingsSection = section; }, 50);
  };

  const mainContent = showSettings ? (
    <Settings onBack={handleBack} onOpenChat={(partner, chatId) => { setShowSettings(false); handleSelectChat(partner, chatId); }} />
  ) : activeChat?.type === 'chat' ? (
    <ErrorBoundary onReset={handleBack}>
      <ChatWindow
        key={activeChat.id}
        chatPartner={activeChat.data}
        onBack={handleBack}
        onVoiceCall={handleVoiceCall}
        onVideoCall={handleVideoCall}
        onOpenSettings={handleOpenSettings}
        onSoundEffect={playSoundEffect}
      />
    </ErrorBoundary>
  ) : activeChat?.type === 'group' ? (
    <ErrorBoundary onReset={handleBack}>
    <GroupChatWindow
      key={activeChat.id}
      group={activeChat.data}
      onBack={handleBack}
      onGroupVoiceCall={handleGroupVoiceCall}
      onGroupVideoCall={handleGroupVideoCall}
      onMemberProfilesLoaded={(profiles) => {
        // Add current user's own profile so their tile shows correctly
        setGcMemberProfiles({ ...profiles, [user?.uid]: profile });
      }}
    /></ErrorBoundary>
  ) : (
    <div className="hidden lg:flex flex-col items-center justify-center h-full" style={{ background: 'var(--chat-bg)' }}>
      <div className="text-center space-y-2 px-8 py-6 rounded-3xl"
        style={{
          background: 'var(--sidebar-bg)',
          border: '1px solid var(--border)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
        }}>
        <h2 className="font-display font-bold text-2xl text-[var(--text-primary)]">Family & Friends</h2>
        <p className="text-[var(--text-secondary)]">Select a chat to start messaging</p>
        <div className="flex items-center justify-center gap-2 mt-4">
          <div className="w-2 h-2 rounded-full bg-brand-500" style={{ animation: 'bounce 1s infinite' }} />
          <div className="w-2 h-2 rounded-full bg-brand-500" style={{ animation: 'bounce 1s infinite 0.2s' }} />
          <div className="w-2 h-2 rounded-full bg-brand-500" style={{ animation: 'bounce 1s infinite 0.4s' }} />
        </div>
        <p className="text-[8px] text-[var(--text-secondary)] opacity-40 mt-8 select-none"
           title="Made by Ishrit Sachdeva">
          ✦ FAMILY & FRIENDS · BUILT BY ISHRIT SACHDEVA ✦
        </p>
      </div>
    </div>
  );

  return (
    <>
      {/* ── Meeting Room overlay ── */}
      {activeMeeting && (
        <MeetingRoom
          meetingCode={activeMeeting.code}
          isHost={activeMeeting.isHost}
          onStartCall={async () => {
            const meetingName = `Meeting ${activeMeeting.code}`;
            // Root cause of the permanent "Calling..." hang: this used to call
            // checkMediaPermission(true) here FIRST — its own separate
            // getUserMedia() grab-then-immediately-stop — and then
            // getLocalStream() (inside startMeetingCall/joinMeetingCall,
            // called moments later) made a SECOND, independent getUserMedia()
            // call for the real stream. Two rapid-fire getUserMedia()
            // acquisitions on the same camera/mic hardware is a known way to
            // get the second call to hang indefinitely on some browser/OS/
            // driver combinations — not throw, just never resolve. Since a
            // hung promise produces no success AND no error, every log
            // downstream (including every [MEETING] log) silently never
            // fired, while "Calling..." (set synchronously, before any of
            // this) stayed on screen forever. getLocalStream() already does
            // its own real getUserMedia() call with fallback configs and
            // proper error handling — it doesn't need a separate pre-flight
            // check that only recreates the exact race it was meant to guard
            // against.
            // Close MeetingRoom first — GroupCallScreen renders while WebRTC negotiates
            const code  = activeMeeting.code;
            const isHst = activeMeeting.isHost;
            setActiveMeeting(null);
            try {
              if (isHst) {
                await startMeetingCall(code, meetingName, profile?.name, 'video');
              } else {
                await joinMeetingCall(code, meetingName, 'video');
              }
            } catch (err) {
              console.error('[MEETING] onStartCall FAILED', err);
              toast.error(err.message || 'Could not join meeting video feed.');
            }
          }}
          onClose={() => setActiveMeeting(null)}
        />
      )}

      {/* ── 1-on-1 call overlay ── */}
      {(callStatus !== 'idle' || incomingCall) && (
        <CallScreen
          callStatus={incomingCall && callStatus === 'idle' ? 'ringing' : callStatus}
          callType={incomingCall?.type || callType}
          remoteUser={activeRemoteUser}
          isMuted={isMuted}
          isVideoOff={isVideoOff}
          isSpeaker={isSpeaker}
          callDuration={callDuration}
          localVideoRef={localVideoRef}
          remoteVideoRef={remoteVideoRef}
          onEndCall={handleEndCall}
          onToggleMute={toggleMute}
          onToggleCamera={toggleCamera}
          onToggleSpeaker={toggleSpeaker}
          onSwitchCamera={switchCamera}
          onAnswer={handleAnswerCall}
          onDecline={handleDeclineCall}
          isIncoming={!!incomingCall}
          formatDuration={formatDuration}
        />
      )}

      {/* ── Group call overlay ── */}
      {(gcStatus !== 'idle' || incomingGroupCall) && (
        <GroupCallScreen
          gcStatus={incomingGroupCall && gcStatus === 'idle' ? 'ringing' : gcStatus}
          gcType={incomingGroupCall?.type || gcType}
          gcInfo={gcInfo}
          gcParticipants={gcStatus !== 'idle' ? gcParticipants : []}
          remoteStreams={remoteStreams}
          localVideoRef={gcLocalVideoRef}
          localStream={gcLocalStream}
          isMuted={gcMuted}
          isVideoOff={gcVideoOff}
          callDuration={gcDuration}
          isIncoming={!!incomingGroupCall}
          incomingCallData={incomingGroupCall}
          currentUserId={user?.uid}
          memberProfiles={gcMemberProfiles}
          onJoin={handleJoinGroupCall}
          onDecline={handleDeclineGroupCall}
          onLeave={handleLeaveGroupCall}
          onToggleMute={toggleGroupMute}
          onToggleVideo={toggleGroupVideo}
          onSwitchCamera={switchGroupCamera}
          formatDuration={gcFormat}
        />
      )}

      {/* ── Main layout ── */}
      <div className="flex h-full">
        {showSidebar && (
          <div className={`${isMobile ? 'w-full' : 'w-[360px] flex-shrink-0'} h-full`}>
            {showAddContact ? (
              <AddContact
                onClose={() => setShowAddContact(false)}
                onContactAdded={(contact) => {
                  setShowAddContact(false);
                  // Immediately start a chat with the newly added contact
                  if (contact) handleSelectChat(contact);
                }}
              />
            ) : (
              <ChatList
                onSelectChat={handleSelectChat}
                onSelectGroup={handleSelectGroup}
                onOpenSettings={() => { setShowSettings(true); setActiveChat(null); }}
                activeChat={activeChat}
                onAddContact={() => setShowAddContact(true)}
                onVoiceCall={handleVoiceCall}
                onVideoCall={handleVideoCall}
              />
            )}
          </div>
        )}
        {showMain && (
          <div className="flex-1 h-full min-w-0">
            {mainContent}
          </div>
        )}
      </div>

    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppInner />
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 3000,
            style: {
              background: 'var(--sidebar-bg)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              fontFamily: 'Nunito, sans-serif',
              fontSize: '14px',
            }
          }}
        />
      </AuthProvider>
    </ThemeProvider>
  );
}
