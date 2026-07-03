// ═══════════════════════════════════════════════════════════════
//  Family & Friends — Firebase Configuration
//  Built by Ishrit Sachdeva
// ═══════════════════════════════════════════════════════════════

import { initializeApp } from 'firebase/app';
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber,
  GoogleAuthProvider, signInWithPopup,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  sendPasswordResetEmail, sendEmailVerification, updatePassword, EmailAuthProvider,
  reauthenticateWithCredential
} from 'firebase/auth';
import {
  getFirestore,
  collection, doc, setDoc, getDoc, getDocs,
  addDoc, updateDoc, deleteDoc, onSnapshot, query, where,
  orderBy, limit, startAfter, serverTimestamp, arrayUnion, arrayRemove,
  increment, writeBatch
} from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getDatabase, ref as dbRef, set, onValue, onDisconnect, serverTimestamp as dbTimestamp } from 'firebase/database';

// ── FIREBASE CONFIG ─────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyDnBVDUUeLRN7fTU5onblF0cqNqbhLEH0E",  // ← paste your real apiKey here
  authDomain:        "family-friends-ee992.firebaseapp.com",
  databaseURL:       "https://family-friends-ee992-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:         "family-friends-ee992",
  storageBucket:     "family-friends-ee992.firebasestorage.app",
  messagingSenderId: "578419914834",
  appId:             "1:578419914834:web:de1cfc867a78b706f6878b"
};
// ───────────────────────────────────────────────────────────────

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Firestore — use default initialization for reliable real-time updates
// persistentMultipleTabManager caused secondary tabs to stop receiving updates
const db = getFirestore(app);

const storage = getStorage(app);
const rtdb    = getDatabase(app);

// ── Presence system ────────────────────────────────────────────
// Firestore has no server-side disconnect detection (unlike RTDB's
// onDisconnect), so markOffline() only fires from client-side events
// (visibilitychange / pagehide / beforeunload). On mobile browsers and
// PWAs those events are unreliable — the OS can kill a backgrounded tab,
// or the network can just drop, without ever firing them. When that
// happens isOnline stays stuck at `true` forever, which is why the dot
// looked "random": some people's sessions ended cleanly (event fired,
// correctly offline) and others didn't (event never fired, stuck online).
//
// Fix: a heartbeat that refreshes lastSeen every 25s while the tab is
// visible, plus a staleness check on the read side — a user only counts
// as online if isOnline is true AND lastSeen is recent. A stuck-true flag
// with an old lastSeen now correctly resolves to offline.
const PRESENCE_HEARTBEAT_MS = 25_000;
const PRESENCE_STALE_MS     = 60_000;

export function setupPresence(uid) {
  const markOnline = () => {
    updateDoc(doc(db, 'users', uid), { isOnline: true, lastSeen: serverTimestamp() }).catch(() => {});
  };
  const markOffline = () => {
    updateDoc(doc(db, 'users', uid), { isOnline: false, lastSeen: serverTimestamp() }).catch(() => {});
  };

  markOnline();

  let heartbeatId = setInterval(() => {
    if (document.visibilityState === 'visible') markOnline();
  }, PRESENCE_HEARTBEAT_MS);

  const handleVisibility = () => {
    if (document.visibilityState === 'visible') markOnline();
    else markOffline();
  };
  document.addEventListener('visibilitychange', handleVisibility);
  // Catch hard tab/browser close (visibilitychange doesn't always fire in time)
  window.addEventListener('pagehide', markOffline);
  window.addEventListener('beforeunload', markOffline);

  return () => {
    clearInterval(heartbeatId);
    document.removeEventListener('visibilitychange', handleVisibility);
    window.removeEventListener('pagehide', markOffline);
    window.removeEventListener('beforeunload', markOffline);
    markOffline();
  };
}

export function subscribeToPresence(uid, callback) {
  // Firestore is the single source of truth for presence.
  let fsUnsub = null;
  try {
    fsUnsub = onSnapshot(doc(db, 'users', uid), snap => {
      const d = snap.data();
      if (d !== undefined) {
        const lastSeenMs = d?.lastSeen?.toMillis ? d.lastSeen.toMillis()
          : (typeof d?.lastSeen === 'number' ? d.lastSeen : null);
        const isStale = lastSeenMs !== null && (Date.now() - lastSeenMs) > PRESENCE_STALE_MS;
        const online = !!d?.isOnline && !isStale;
        callback({ state: online ? 'online' : 'offline', last_changed: d?.lastSeen });
      }
    });
  } catch {}

  return () => { try { fsUnsub?.(); } catch {} };
}

function _subscribeToPresenceLegacy(uid, callback) {
  let rtdbValue = null;
  let firestoreValue = null;
  let rtdbUnsub = null;
  let fsUnsub = null;

  const resolve = () => {
    if (rtdbValue !== null) {
      callback(rtdbValue);
    } else if (firestoreValue !== null) {
      callback(firestoreValue);
    }
  };

  try {
    rtdbUnsub = onValue(dbRef(rtdb, `/status/${uid}`), snap => {
      rtdbValue = snap.val();
      resolve();
    });
  } catch {}

  try {
    fsUnsub = onSnapshot(doc(db, 'users', uid), snap => {
      const d = snap.data();
      if (d) {
        firestoreValue = { state: d.isOnline ? 'online' : 'offline', last_changed: d.lastSeen };
        resolve();
      }
    });
  } catch {}

  return () => {
    try { rtdbUnsub?.(); } catch {}
    try { fsUnsub?.(); } catch {}
  };
}

// ── User helpers ───────────────────────────────────────────────
export async function createOrUpdateUser(uid, data) {
  const withLower = { ...data };
  if (data.name) withLower.nameLower = data.name.toLowerCase();
  await setDoc(doc(db, 'users', uid), { ...withLower, updatedAt: serverTimestamp() }, { merge: true });
}

export async function getUserByPhone(phone) {
  const q = query(collection(db, 'users'), where('phone', '==', phone));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

export async function getUserByCode(code) {
  const q = query(collection(db, 'users'), where('code', '==', code));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

// Search users by name — client-side filter (works without Firestore index)
export async function searchUsersByName(searchTerm, currentUid) {
  try {
    const term = searchTerm.trim().toLowerCase();
    if (!term || term.length < 2) return [];
    // Fetch all users and filter client-side — works for small user bases
    // and avoids needing a Firestore composite index
    const snap = await getDocs(collection(db, 'users'));
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(u =>
        u.id !== currentUid &&
        (u.name?.toLowerCase().includes(term) || u.nameLower?.includes(term))
      );
  } catch (e) {
    // Search error — non-fatal
    return [];
  }
}

export async function getUserById(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function checkIsBlocked(uid, targetUid) {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    const data = snap.data();
    return Array.isArray(data?.blocked) && data.blocked.includes(targetUid);
  } catch { return false; }
}

export async function getBlockedUsers(uid) {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    const blocked = snap.data()?.blocked || [];
    if (!blocked.length) return [];
    const profiles = await Promise.all(blocked.map(id => getUserById(id)));
    return profiles.filter(Boolean);
  } catch { return []; }
}

// ── Chat helpers ───────────────────────────────────────────────
export function getChatId(uid1, uid2) {
  return [uid1, uid2].sort().join('_');
}

export async function getOrCreateChat(uid1, uid2) {
  const chatId = getChatId(uid1, uid2);
  const chatRef = doc(db, 'chats', chatId);
  const chatSnap = await getDoc(chatRef);
  if (!chatSnap.exists()) {
    await setDoc(chatRef, {
      participants: [uid1, uid2],
      createdAt: serverTimestamp(),
      lastMessage: null,
      unread: { [uid1]: 0, [uid2]: 0 }
    });
  }
  return chatId;
}

export async function sendMessage(chatId, senderId, content, type = 'text', extra = {}, senderName = '') {
  // Fire-and-forget the message doc — don't block on it
  const msgRef = await addDoc(collection(db, 'chats', chatId, 'messages'), {
    senderId, content, type,
    timestamp: serverTimestamp(),
    status: 'sent',
    reactions: {},
    ...extra
  });

  // Derive participants from chatId (format: uid1_uid2) — avoids an extra Firestore read on every send
  // senderName passed in by caller if available, otherwise we skip the profile lookup
  const participantIds = chatId.split('_').filter(Boolean);

  const updates = {
    lastMessage: { content, type, senderId, senderName, timestamp: serverTimestamp(), id: msgRef.id }
  };

  // Increment unread for all participants except sender
  participantIds.forEach(uid => {
    if (uid !== senderId) updates[`unread.${uid}`] = increment(1);
  });

  await setDoc(doc(db, 'chats', chatId), updates, { merge: true });
  return msgRef.id;
}

export function subscribeToMessages(chatId, callback) {
  // Initial page: last 60 messages — enough to fill any screen
  const q = query(
    collection(db, 'chats', chatId, 'messages'),
    orderBy('timestamp', 'asc'), limit(60)
  );
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

// Load an older page — call when user scrolls to top
export async function loadOlderMessages(chatId, beforeDoc, pageSize = 40) {
  const q = query(
    collection(db, 'chats', chatId, 'messages'),
    orderBy('timestamp', 'desc'),
    startAfter(beforeDoc),
    limit(pageSize)
  );
  const snap = await getDocs(q);
  // Return in ascending order (oldest first)
  return snap.docs.reverse().map(d => ({ id: d.id, ...d.data(), _docRef: d }));
}

// Same for groups
export async function loadOlderGroupMessages(groupId, beforeDoc, pageSize = 40) {
  const q = query(
    collection(db, 'groups', groupId, 'messages'),
    orderBy('timestamp', 'desc'),
    startAfter(beforeDoc),
    limit(pageSize)
  );
  const snap = await getDocs(q);
  return snap.docs.reverse().map(d => ({ id: d.id, ...d.data(), _docRef: d }));
}

export function subscribeToChats(uid, callback) {
  const q = query(collection(db, 'chats'), where('participants', 'array-contains', uid));
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

// ── Group helpers ──────────────────────────────────────────────
export async function createGroup(name, adminId, memberIds, photoURL = null) {
  const groupRef = await addDoc(collection(db, 'groups'), {
    name, adminId, photoURL,
    members: [adminId, ...memberIds],
    createdAt: serverTimestamp(),
    lastMessage: null,
    description: ''
  });
  return groupRef.id;
}

export function subscribeToGroups(uid, callback) {
  const q = query(collection(db, 'groups'), where('members', 'array-contains', uid));
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

export async function sendGroupMessage(groupId, senderId, content, type = 'text', extra = {}, groupMembers = [], senderName = '') {
  const msgRef = await addDoc(collection(db, 'groups', groupId, 'messages'), {
    senderId, content, type,
    timestamp: serverTimestamp(),
    reactions: {},
    seenBy: [senderId],
    ...extra
  });

  // Use passed senderName — avoids extra Firestore read on every message send
  if (!senderName) senderName = extra.senderName || '';

  const updates = {
    lastMessage: { content, type, senderId, senderName, timestamp: serverTimestamp(), id: msgRef.id }
  };

  // Increment unread for all members except sender
  groupMembers.forEach(memberId => {
    if (memberId !== senderId) {
      updates[`unread.${memberId}`] = increment(1);
    }
  });


  await setDoc(doc(db, 'groups', groupId), updates, { merge: true });
  return msgRef.id;
}

export async function resetUnreadCount(chatId, uid, isGroup = false) {
  try {
    const colName = isGroup ? 'groups' : 'chats';
    await updateDoc(doc(db, colName, chatId), {
      [`unread.${uid}`]: 0
    });
  } catch {}
}

export function subscribeToGroupMessages(groupId, callback) {
  const q = query(
    collection(db, 'groups', groupId, 'messages'),
    orderBy('timestamp', 'asc'), limit(60)
  );
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

export async function updateGroupDescription(groupId, description) {
  try { await updateDoc(doc(db, 'groups', groupId), { description }); } catch {}
}

export async function addGroupMember(groupId, newMemberId, adminName, newMemberName) {
  try {
    await updateDoc(doc(db, 'groups', groupId), { members: arrayUnion(newMemberId) });
    await addDoc(collection(db, 'groups', groupId, 'messages'), {
      senderId: 'system',
      content: `${newMemberName} was added by ${adminName}`,
      type: 'system',
      timestamp: serverTimestamp(),
      reactions: {},
      seenBy: []
    });
    await updateDoc(doc(db, 'groups', groupId), {
      lastMessage: { content: `${newMemberName} was added`, type: 'system', senderId: 'system', timestamp: serverTimestamp() }
    });
  } catch {}
}

export async function removeGroupMember(groupId, memberId, adminId, adminName, memberName) {
  try {
    await updateDoc(doc(db, 'groups', groupId), { members: arrayRemove(memberId) });
    await addDoc(collection(db, 'groups', groupId, 'messages'), {
      senderId: 'system',
      content: `${memberName} was removed by ${adminName}`,
      type: 'system',
      timestamp: serverTimestamp(),
      reactions: {},
      seenBy: [adminId]
    });
    await updateDoc(doc(db, 'groups', groupId), {
      lastMessage: { content: `${memberName} was removed`, type: 'system', senderId: 'system', timestamp: serverTimestamp() }
    });
  } catch {}
}

export async function exitGroupWithNotice(groupId, uid, userName, isAdmin = false, deleteForAll = false) {
  if (deleteForAll && isAdmin) {
    await deleteDoc(doc(db, 'groups', groupId));
  } else {
    await updateDoc(doc(db, 'groups', groupId), { members: arrayRemove(uid) });
    await addDoc(collection(db, 'groups', groupId, 'messages'), {
      senderId: 'system',
      content: `${userName} left the group`,
      type: 'system',
      timestamp: serverTimestamp(),
      reactions: {},
      seenBy: []
    });
    await updateDoc(doc(db, 'groups', groupId), {
      lastMessage: { content: `${userName} left`, type: 'system', senderId: 'system', timestamp: serverTimestamp() }
    });
  }
}

export async function exitGroup(groupId, uid, isAdmin = false, deleteForAll = false) {
  return exitGroupWithNotice(groupId, uid, 'Someone', isAdmin, deleteForAll);
}

// ── Status/Story helpers ───────────────────────────────────────
export async function postStatus(uid, content, type = 'text', bgColor = '#16a34a') {
  await addDoc(collection(db, 'statuses'), {
    uid, content, type, bgColor,
    createdAt: serverTimestamp(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    viewers: []
  });
}

// ── Storage helpers ────────────────────────────────────────────
export async function uploadFile(path, file) {
  const storageRef = ref(storage, path);
  const snap = await uploadBytes(storageRef, file);
  return await getDownloadURL(snap.ref);
}

// ── WebRTC call helpers ────────────────────────────────────────
export async function createCallDoc(callId, callerId, calleeId, type) {
  await setDoc(doc(db, 'calls', callId), {
    callerId, calleeId, type,
    status: 'ringing',
    offer: null, answer: null,
    callerCandidates: [], calleeCandidates: [],
    createdAt: serverTimestamp()
  });
}

export function subscribeToCall(callId, callback) {
  return onSnapshot(doc(db, 'calls', callId), snap => {
    if (snap.exists()) callback({ id: snap.id, ...snap.data() });
  });
}

// ── Reactions ─────────────────────────────────────────────────
export async function addReaction(chatId, msgId, uid, emoji, isGroup = false) {
  const col = isGroup ? 'groups' : 'chats';
  const msgRef = doc(db, col, chatId, 'messages', msgId);
  try {
    const snap = await getDoc(msgRef);
    const reactions = snap.data()?.reactions || {};
    const current = reactions[emoji] || [];
    const updated = current.includes(uid)
      ? current.filter(id => id !== uid)
      : [...current, uid];
    if (updated.length === 0) {
      const newReactions = { ...reactions };
      delete newReactions[emoji];
      await updateDoc(msgRef, { reactions: newReactions });
    } else {
      await updateDoc(msgRef, { [`reactions.${emoji}`]: updated });
    }
  } catch {}
}

// ── Typing indicators ──────────────────────────────────────────
export async function setTyping(chatId, uid, isGroup = false) {
  const col = isGroup ? 'groups' : 'chats';
  try { await updateDoc(doc(db, col, chatId), { [`typing.${uid}`]: serverTimestamp() }); } catch {}
}
export async function clearTyping(chatId, uid, isGroup = false) {
  const col = isGroup ? 'groups' : 'chats';
  try { await updateDoc(doc(db, col, chatId), { [`typing.${uid}`]: null }); } catch {}
}

// ── Read receipts ──────────────────────────────────────────────
export async function markMessagesRead(chatId, uid, isGroup = false) {
  const col = isGroup ? 'groups' : 'chats';
  try {
    resetUnreadCount(chatId, uid, isGroup);
    const q = query(collection(db, col, chatId, 'messages'), orderBy('timestamp', 'asc'), limit(200));
    const snap = await getDocs(q);
    const batch = writeBatch(db);
    snap.docs.forEach(d => {
      const data = d.data();
      if (data.senderId === uid) return;
      if (!isGroup && data.status !== 'seen') batch.update(d.ref, { status: 'seen' });
      if (isGroup && !data.seenBy?.includes(uid)) batch.update(d.ref, { seenBy: arrayUnion(uid) });
    });
    await batch.commit();
  } catch {}
}

// ── Delete message ─────────────────────────────────────────────
export async function deleteMessageForMe(chatId, msgId, uid, isGroup = false) {
  const col = isGroup ? 'groups' : 'chats';
  try { await updateDoc(doc(db, col, chatId, 'messages', msgId), { deletedFor: arrayUnion(uid) }); } catch {}
}
export async function deleteMessageForEveryone(chatId, msgId, isGroup = false) {
  const col = isGroup ? 'groups' : 'chats';
  try { await updateDoc(doc(db, col, chatId, 'messages', msgId), { content: '', type: 'deleted', deletedAt: serverTimestamp() }); } catch {}
}
export async function deleteMultipleMessages(chatId, msgIds, uid, forAll = false, isGroup = false) {
  const col = isGroup ? 'groups' : 'chats';
  const batch = writeBatch(db);
  msgIds.forEach(id => {
    const r = doc(db, col, chatId, 'messages', id);
    if (forAll) batch.update(r, { content: '', type: 'deleted', deletedAt: serverTimestamp() });
    else batch.update(r, { deletedFor: arrayUnion(uid) });
  });
  await batch.commit();
}

// ── Edit message ───────────────────────────────────────────────
export async function editMessage(chatId, msgId, newContent, isGroup = false) {
  const col = isGroup ? 'groups' : 'chats';
  try { await updateDoc(doc(db, col, chatId, 'messages', msgId), { content: newContent, edited: true, editedAt: serverTimestamp() }); } catch {}
}

// ── Forward message ────────────────────────────────────────────
// targets: [{id, isGroup}]
export async function forwardMessage(msg, targets, senderUid) {
  const MAX_CONTENT_BYTES = 900_000;
  const content = msg.content || '';
  const isOversized = typeof content === 'string' && content.length > MAX_CONTENT_BYTES;
  const finalContent = isOversized ? '[Media — too large to forward]' : content;
  const finalType    = isOversized ? 'text' : (msg.type || 'text');

  // Firestore throws on undefined values — only include fields that exist
  const extra = { forwarded: true };
  if (msg.fileName  != null) extra.fileName  = msg.fileName;
  if (msg.fileSize  != null) extra.fileSize  = msg.fileSize;
  if (msg.duration  != null) extra.duration  = msg.duration;

  const promises = targets.map(async ({ id, isGroup }) => {
    if (isGroup) {
      return sendGroupMessage(id, senderUid, finalContent, finalType, extra);
    } else {
      const chatId = await getOrCreateChat(senderUid, id);
      return sendMessage(chatId, senderUid, finalContent, finalType, extra);
    }
  });
  await Promise.all(promises);
}

// ── Mute chat ──────────────────────────────────────────────────
export async function muteChat(uid, chatId, muted) {
  try { await updateDoc(doc(db, 'users', uid), { [`muted.${chatId}`]: muted || null }); } catch {}
}

// ── Block user ─────────────────────────────────────────────────
export async function blockUser(uid, targetUid, block) {
  try {
    await updateDoc(doc(db, 'users', uid), {
      blocked: block ? arrayUnion(targetUid) : arrayRemove(targetUid)
    });
  } catch {}
}

// Convenience alias used by Settings blocklist panel
export async function unblockUser(uid, targetUid) {
  return blockUser(uid, targetUid, false);
}

// ── Clear chat ─────────────────────────────────────────────────
export async function clearChat(chatId, uid, isGroup = false) {
  const col = isGroup ? 'groups' : 'chats';
  try {
    const q = query(collection(db, col, chatId, 'messages'), orderBy('timestamp'), limit(500));
    const snap = await getDocs(q);
    const batch = writeBatch(db);
    snap.docs.forEach(d => batch.update(d.ref, { deletedFor: arrayUnion(uid) }));
    await batch.commit();
  } catch {}
}

// ── Presence helpers ───────────────────────────────────────────
export async function setOnline(uid) {
  try {
    const r = dbRef(rtdb, `/status/${uid}`);
    await set(r, { state: 'online', last_changed: Date.now() });
    await updateDoc(doc(db, 'users', uid), { isOnline: true, lastSeen: serverTimestamp() });
  } catch {}
}
export async function updateLastSeen(uid) {
  try {
    const r = dbRef(rtdb, `/status/${uid}`);
    await set(r, { state: 'offline', last_changed: Date.now() });
    await updateDoc(doc(db, 'users', uid), { isOnline: false, lastSeen: serverTimestamp() });
  } catch {}
}

// ── Notifications ──────────────────────────────────────────────
// ── Task Management (F&F Internal) ───────────────────────────
export async function createFFTask(taskData) {
  if (!auth.currentUser) return null;

  // Dedup: if a messageId is provided, check if task already exists for it
  if (taskData.messageId) {
    const existing = await getDocs(
      query(
        collection(db, 'users', auth.currentUser.uid, 'tasks'),
        where('messageId', '==', taskData.messageId)
      )
    );
    if (!existing.empty) return existing.docs[0].id; // already exists, skip
  }

  const taskRef = doc(collection(db, 'users', auth.currentUser.uid, 'tasks'));
  await setDoc(taskRef, {
    ...taskData,
    id: taskRef.id,
    createdAt: serverTimestamp(),
    status: 'pending',
  });
  return taskRef.id;
}

export async function toggleFFTask(taskId, newStatus) {
  if (!auth.currentUser) return;
  await updateDoc(doc(db, 'users', auth.currentUser.uid, 'tasks', taskId), { status: newStatus });
}

export async function deleteFFTask(taskId) {
  if (!auth.currentUser) return;
  await deleteDoc(doc(db, 'users', auth.currentUser.uid, 'tasks', taskId));
}

export function subscribeToFFTasks(uid, callback) {
  const q = query(collection(db, 'users', uid, 'tasks'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

// ── Chat / Group management ───────────────────────────────────
export async function setChatPinned(chatId, pinned) {
  await updateDoc(doc(db, 'chats', chatId), { pinned: pinned || false });
}

export async function setChatArchived(chatId, archived) {
  await updateDoc(doc(db, 'chats', chatId), { archived: archived || false });
}

export async function deleteChatForUser(chatId, uid) {
  // Soft delete: mark as deleted for this user only, with timestamp
  // When a new message arrives AFTER this timestamp, the chat reappears
  await updateDoc(doc(db, 'chats', chatId), {
    [`deletedFor.${uid}`]: serverTimestamp(),
  });
}

export async function setGroupPinned(groupId, pinned) {
  await updateDoc(doc(db, 'groups', groupId), { pinned: pinned || false });
}

export async function setGroupArchived(groupId, archived) {
  await updateDoc(doc(db, 'groups', groupId), { archived: archived || false });
}

export async function deleteGroupForUser(groupId, uid) {
  await updateDoc(doc(db, 'groups', groupId), {
    [`deletedFor.${uid}`]: serverTimestamp(),
  });
}

// ── Google Sign-In ─────────────────────────────────────────────
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });
googleProvider.addScope('https://www.googleapis.com/auth/tasks');

export let googleCachedAccessToken = null;

export async function signInWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential && credential.accessToken) {
      googleCachedAccessToken = credential.accessToken;
    }
    return { user: result.user, token: credential?.accessToken };
  } catch (error) {
    if (error.code === 'auth/unauthorized-domain') {
      throw new Error(`Please add "${window.location.hostname}" to Firebase Console -> Authentication -> Settings -> Authorized domains to use Google Sign-In.`);
    }
    throw error;
  }
}

// ── Email / Password ───────────────────────────────────────────
export async function signUpWithEmail(email, password) {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  // Send verification email immediately after account creation
  await sendEmailVerification(result.user, {
    url: window.location.origin, // redirect back to the app after verification
  });
  return result.user;
}

export async function signInWithEmail(email, password) {
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
}

export async function resetPassword(email) {
  await sendPasswordResetEmail(auth, email);
}

export async function changePassword(currentPassword, newPassword) {
  const user = auth.currentUser;
  if (!user) throw new Error('Not logged in');
  const cred = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, cred);
  await updatePassword(user, newPassword);
}

export async function saveFCMToken(uid, token) {
  try { await updateDoc(doc(db, 'users', uid), { fcmToken: token }); } catch {}
}

// ═══════════════════════════════════════════════════════════════
//  Group Calls — WebRTC mesh via Firestore signaling
//  Firestore paths:
//    groupCalls/{callId}
//    groupCalls/{callId}/signals/{offererUid}_{answererUid}
//    groupCalls/{callId}/candidates/{senderUid}_{receiverUid}/list/{autoId}
// ═══════════════════════════════════════════════════════════════

export async function createGroupCall(groupId, groupName, initiatorId, initiatorName, invitedMemberIds, type) {
  try {
    const ref = await addDoc(collection(db, 'groupCalls'), {
      groupId,
      groupName,
      initiatorId,
      initiatorName,
      type,
      status: 'ringing',
      participants: [initiatorId],
      invitedMembers: invitedMemberIds.filter(id => id !== initiatorId),
      createdAt: serverTimestamp(),
    });
    return ref.id;
  } catch (e) { throw e; }
}

// ── Deterministic-ID variant for Meeting Rooms ────────────────
// Uses the meeting room code AS the groupCalls document ID, so
// participants admitted via the waiting room can join the exact
// same WebRTC signaling document without any invite mechanism.
export async function createGroupCallWithId(callId, groupName, initiatorId, initiatorName, type) {
  try {
    await setDoc(doc(db, 'groupCalls', callId), {
      groupId: callId,
      groupName,
      initiatorId,
      initiatorName,
      type,
      status: 'ringing',
      participants: [initiatorId],
      invitedMembers: [],
      isMeeting: true,
      createdAt: serverTimestamp(),
    }, { merge: true });
    return callId;
  } catch (e) { throw e; }
}

export async function joinGroupCallDoc(callId, uid) {
  try {
    await updateDoc(doc(db, 'groupCalls', callId), {
      participants: arrayUnion(uid),
      invitedMembers: arrayRemove(uid),
      status: 'active',
    });
  } catch {}
}

export async function endGroupCallDoc(callId) {
  try { await updateDoc(doc(db, 'groupCalls', callId), { status: 'ended' }); } catch {}
}

export function subscribeToIncomingGroupCalls(uid, callback) {
  const q = query(
    collection(db, 'groupCalls'),
    where('invitedMembers', 'array-contains', uid),
    where('status', '==', 'ringing')
  );
  return onSnapshot(q, snap => {
    if (!snap.empty) callback({ id: snap.docs[0].id, ...snap.docs[0].data() });
    else callback(null);
  });
}

// ── Save call log entry ────────────────────────────────────────
// Called when a call ends to persist history for both participants
export async function saveCallLog(uid, log) {
  try {
    await addDoc(collection(db, 'users', uid, 'callLogs'), {
      ...log,
      timestamp: serverTimestamp(),
    });
  } catch {}
}

export function subscribeToGroupCallDoc(callId, callback) {
  return onSnapshot(doc(db, 'groupCalls', callId), snap => {
    if (snap.exists()) callback({ id: snap.id, ...snap.data() });
    else callback(null);
  });
}

// Offerer stores offer for answerer: signals/{offerer}_{answerer}
export async function storeGroupOffer(callId, offererUid, answererUid, offerSdp) {
  const key = `${offererUid}_${answererUid}`;
  try {
    await setDoc(doc(db, 'groupCalls', callId, 'signals', key), {
      from: offererUid, to: answererUid,
      offer: offerSdp, answer: null,
      createdAt: serverTimestamp(),
    });
  } catch {}
}

// Answerer updates that same doc with the answer
export async function storeGroupAnswer(callId, offererUid, answererUid, answerSdp) {
  const key = `${offererUid}_${answererUid}`;
  try { await updateDoc(doc(db, 'groupCalls', callId, 'signals', key), { answer: answerSdp }); } catch {}
}

// Store ICE candidate sent from fromUid to toUid
export async function addGroupIceCandidate(callId, fromUid, toUid, candidate) {
  const key = `${fromUid}_${toUid}`;
  try { await addDoc(collection(db, 'groupCalls', callId, 'candidates', key, 'list'), candidate); } catch {}
}

// Listen for new OFFER signals targeted at myUid (only 'added' events)
export function subscribeToGroupSignals(callId, myUid, callback) {
  return onSnapshot(collection(db, 'groupCalls', callId, 'signals'), snap => {
    snap.docChanges().forEach(change => {
      if (change.type === 'added') {
        const data = change.doc.data();
        if (data?.to === myUid && data?.offer) callback({ id: change.doc.id, ...data });
      }
    });
  });
}

// Subscribe to ICE candidates sent from fromUid to toUid
export function subscribeToGroupCandidates(callId, fromUid, toUid, callback) {
  const key = `${fromUid}_${toUid}`;
  return onSnapshot(collection(db, 'groupCalls', callId, 'candidates', key, 'list'), snap => {
    snap.docChanges().forEach(change => {
      if (change.type === 'added') callback(change.doc.data());
    });
  });
}

// ── FCM Messaging ──────────────────────────────────────────────
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

let _messaging = null;
function getMsg() {
  if (!_messaging) {
    try { _messaging = getMessaging(app); } catch { /* Safari/old browsers */ }
  }
  return _messaging;
}

// Get or refresh FCM token and save it to the user's Firestore doc
export async function initFCMToken(uid) {
  try {
    const msg = getMsg();
    if (!msg) return null;
    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
    if (!vapidKey) return null; // VAPID key not configured — push disabled
    // Explicitly register the SW first — required for localhost dev
    const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
    const token = await getToken(msg, { vapidKey, serviceWorkerRegistration: reg });
    if (token) {
      await updateDoc(doc(db, 'users', uid), { fcmToken: token, fcmUpdatedAt: serverTimestamp() });
    }
    return token;
  } catch (e) {
    // FCM token unavailable — push notifications won't work until permissions granted
    return null;
  }
}

// Subscribe to foreground messages (app is open)
export function onForegroundMessage(callback) {
  const msg = getMsg();
  if (!msg) return () => {};
  return onMessage(msg, callback);
}

// ── FCM V1 API — send push using service account JWT ──────────
// Uses SubtleCrypto (built into all modern browsers) to sign JWTs.
// Service account fields come from .env — see .env.template for instructions.


// ── Push notifications — routed through a server-side Cloudflare Pages
// Function (functions/api/send-push.js). Previously this ran entirely
// client-side: it bundled a service-account RSA private key into the
// public JS bundle (a serious secret leak) AND called FCM's send API
// directly from the browser, which Google blocks via CORS — meaning
// every single push silently failed. Now the client just POSTs the
// recipient's token + message to our own backend, which holds the
// real credentials server-side where CORS doesn't apply.
export async function sendPushNotification(recipientUid, title, body, data = {}) {
  try {
    const snap = await getDoc(doc(db, 'users', recipientUid));
    const token = snap.data()?.fcmToken;
    if (!token) return;

    await fetch('/api/send-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, title, body, data }),
    });
  } catch {
    // Push send failed — non-critical, app continues
  }
}

export function makePreview(content, type) {
  if (!content) return '';
  if (type === 'image') return '📷 Photo';
  if (type === 'video') return '🎥 Video';
  if (type === 'voice') return '🎙 Voice note';
  if (type === 'file')  return '📎 File';
  const words = content.replace(/\s+/g, ' ').trim().split(' ');
  return words.slice(0, 4).join(' ') + (words.length > 4 ? '…' : '');
}

// ── Media Upload (ImgBB for images, Cloudinary for audio/video) ──
// Firebase Storage now requires the pay-as-you-go Blaze plan even to
// provision a bucket (policy change effective Feb 3, 2026), which needs a
// linked billing/card. ImgBB and Cloudinary's free tiers need no card at
// all, so all uploads route through them instead — no Storage bucket
// required anywhere in this app.
//
// Setup (both free, no credit card):
//   1. ImgBB:      https://api.imgbb.com/  → get an API key
//   2. Cloudinary:  https://cloudinary.com/users/register/free → note your
//      "Cloud name", then Settings → Upload → Add upload preset → set
//      Signing Mode to "Unsigned" → note the preset name
// Put both in your .env:
//   VITE_IMGBB_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
//   VITE_CLOUDINARY_CLOUD_NAME=your-cloud-name
//   VITE_CLOUDINARY_UPLOAD_PRESET=your-unsigned-preset-name
const IMGBB_API_KEY            = import.meta.env.VITE_IMGBB_API_KEY;
const CLOUDINARY_CLOUD_NAME    = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]); // strip data: prefix
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

async function uploadToImgBB(blob) {
  if (!IMGBB_API_KEY) throw new Error('Missing VITE_IMGBB_API_KEY in .env');
  const base64 = await blobToBase64(blob);
  const form = new FormData();
  form.append('image', base64);

  const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
    method: 'POST',
    body: form,
  });
  const json = await res.json();
  if (!json?.success) throw new Error(json?.error?.message || 'ImgBB upload failed');
  return json.data.url;
}

async function uploadToCloudinary(blob, resourceType = 'video') {
  // Cloudinary calls both audio and video "video" resource type for upload
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) {
    throw new Error('Missing VITE_CLOUDINARY_CLOUD_NAME / VITE_CLOUDINARY_UPLOAD_PRESET in .env');
  }
  const form = new FormData();
  form.append('file', blob);
  form.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`, {
    method: 'POST',
    body: form,
  });
  const json = await res.json();
  if (!json?.secure_url) throw new Error(json?.error?.message || 'Cloudinary upload failed');
  return json.secure_url;
}

// path is kept as a param for call-site compatibility (used to be the
// Firebase Storage path) — its extension/prefix decides which service and
// resource type to use, but it's no longer an actual storage path.
export async function uploadMedia(fileOrBase64, path) {
  let blob;

  if (typeof fileOrBase64 === 'string' && fileOrBase64.startsWith('data:')) {
    const res = await fetch(fileOrBase64);
    blob = await res.blob();
  } else {
    blob = fileOrBase64;
  }

  if (!blob || blob.size === 0) {
    throw new Error('Empty file — nothing to upload');
  }

  const mime = blob.type || '';
  const isImage = mime.startsWith('image/') || /\.(jpe?g|png|gif|webp)$/i.test(path || '');
  const isAudio = mime.startsWith('audio/') || /\.(webm|mp3|m4a|wav|ogg)$/i.test(path || '');

  const uploadPromise = isImage
    ? uploadToImgBB(blob)
    : uploadToCloudinary(blob, isAudio ? 'video' : 'video'); // Cloudinary uses "video" resource type for audio too

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Upload timed out after 30s')), 30_000)
  );

  return Promise.race([uploadPromise, timeoutPromise]);
}

// ── Exports ────────────────────────────────────────────────────
export {
  auth, db, storage, rtdb,
  RecaptchaVerifier, signInWithPhoneNumber,
  doc, collection, setDoc, getDoc, getDocs, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, where, orderBy, limit, serverTimestamp,
  arrayUnion, arrayRemove, increment, writeBatch,
  ref, uploadBytes, getDownloadURL
};
