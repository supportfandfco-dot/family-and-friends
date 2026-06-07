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
import {
  db, doc, getDoc, onSnapshot, query, collection, where, getUserById,
  subscribeToIncomingGroupCalls, sendPushNotification, makePreview,
} from './firebase';
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
import { GroupChatWindow } from './components/Groups/GroupChat';
import Settings from './components/Settings/Settings';
import CallScreen from './components/Calls/CallScreen';
import GroupCallScreen from './components/Calls/GroupCallScreen';

function AppInner() {
  const { user, profile, loading, isAuthenticated } = useAuth();
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
    toggleGroupMute, toggleGroupVideo, formatDuration: gcFormat,
  } = useGroupWebRTC(user?.uid);

  const [incomingGroupCall, setIncomingGroupCall] = useState(null);
  const [gcMemberProfiles,  setGcMemberProfiles]  = useState({});

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
    // chatId is a direct-chat docId in format uid1_uid2 — find the partner
    if (!user) return;
    try {
      const snap = await getDoc(doc(db, 'chats', chatId));
      if (!snap.exists()) return;
      const participants = snap.data().participants || [];
      const partnerId = participants.find(id => id !== user.uid);
      if (!partnerId) return;
      const partner = await getUserById(partnerId);
      if (partner) handleSelectChat(partner, chatId);
    } catch {}
  }, [user]);

  const openGroupById = useCallback(async (groupId) => {
    if (!user) return;
    try {
      const snap = await getDoc(doc(db, 'groups', groupId));
      if (snap.exists()) handleSelectGroup({ id: groupId, ...snap.data() });
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

  // ── Incoming group calls ──────────────────────────────
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



  // ── Listen for incoming calls ─────────────────────────
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

  // ── Outgoing calls ────────────────────────────────────
  const handleVoiceCall = async (partner) => {
    if (!partner?.id && !partner?.uid) { toast.error('Cannot start call — contact not loaded'); return; }
    const partnerId = partner.id || partner.uid;
    setActiveRemoteUser(partner);
    try {
      await startCall(partnerId, 'voice');
      // Use callIdRef pattern — callId state may not be set yet
      const cid = `${user.uid}_${partnerId}_`;
      sendPushNotification(
        partnerId,
        profile?.name || 'Someone',
        '📞 Incoming voice call — tap to answer',
        { callType: 'voice', callerId: user.uid, tag: `call-${user.uid}` }
      ).catch(() => {});
    } catch (err) {
      toast.error(err.message || 'Could not start call');
    }
  };

  const handleVideoCall = async (partner) => {
    if (!partner?.id && !partner?.uid) { toast.error('Cannot start call — contact not loaded'); return; }
    const partnerId = partner.id || partner.uid;
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
      toast.error(err.message || 'Could not start call');
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

  const showSidebar = !isMobile || (!activeChat && !showSettings);
  const showMain    = !isMobile || activeChat || showSettings;

  const handleOpenSettings = (section) => {
    setShowSettings(true);
    setActiveChat(null);
    // Pass section to Settings via a ref or state
    if (section) setTimeout(() => { window.__ff_settingsSection = section; }, 50);
  };

  const mainContent = showSettings ? (
    <Settings onBack={handleBack} />
  ) : activeChat?.type === 'chat' ? (
    <ChatWindow
      chatPartner={activeChat.data}
      onBack={handleBack}
      onVoiceCall={handleVoiceCall}
      onVideoCall={handleVideoCall}
      onOpenSettings={handleOpenSettings}
    />
  ) : activeChat?.type === 'group' ? (
    <GroupChatWindow
      group={activeChat.data}
      onBack={handleBack}
      onGroupVoiceCall={handleGroupVoiceCall}
      onGroupVideoCall={handleGroupVideoCall}
      onMemberProfilesLoaded={(profiles) => {
        // Add current user's own profile so their tile shows correctly
        setGcMemberProfiles({ ...profiles, [user?.uid]: profile });
      }}
    />
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
