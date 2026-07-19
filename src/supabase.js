// ═══════════════════════════════════════════════════════════
//  Supabase data layer — Phase 2 of the Firebase migration.
//  Mirrors firebase.js's exported function names/signatures wherever
//  possible, so component call sites need minimal changes.
//
//  NOT YET COVERED HERE (deliberately, separate follow-up pass):
//    - Calls/meeting signaling (offers/answers/ICE candidates) — moving
//      to Supabase Realtime Broadcast, a big enough piece to do on its
//      own. group_calls/group_call_participants tables exist in the
//      schema for the PERSISTENT call state; the ephemeral signaling
//      itself is not modeled as tables at all (see MIGRATION_NOTES.md).
//    - Tasks, Hidden Chats — same underlying patterns as chats/groups
//      below, straightforward to add once this core layer is verified
//      working.
// ═══════════════════════════════════════════════════════════
import { supabase } from './supabaseClient';

// Every subscribe* function below creates a realtime channel named after
// the id it's watching (e.g. `groups:${uid}`). Supabase reuses the SAME
// channel object when .channel(name) is called again with a name that's
// still active, and attaching a new .on() listener to a channel that's
// already been .subscribe()'d throws ("cannot add postgres_changes
// callbacks ... after subscribe()"). Several of these are legitimately
// called more than once concurrently for the same id — subscribeToGroups
// alone is called independently by ChatList.jsx, ChatWindow.jsx, and
// GroupChat.jsx, all for the same uid — so the id can't be the whole
// channel name. Appending a random suffix per call guarantees every
// subscription gets its own channel.
function uniqueChannel(name) {
  return supabase.channel(`${name}:${Math.random().toString(36).slice(2, 10)}`);
}

// ── Auth ─────────────────────────────────────────────────────
export async function signUpWithEmail(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data.user;
}

export async function signInWithEmail(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function sendPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  });
  if (error) throw error;
}

// onAuthChange(callback) — callback receives the Supabase user object or
// null. Returns an unsubscribe function, matching Firebase's
// onAuthStateChanged pattern used in AuthContext.jsx.
export function onAuthChange(callback) {
  supabase.auth.getSession().then(({ data }) => callback(data.session?.user || null));
  const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user || null);
  });
  return () => sub.subscription.unsubscribe();
}

// ── Profile field normalization ──────────────────────────────
// Postgres columns are snake_case (is_online, push_token, autopilot_rules,
// name_lower...) but the rest of this app — every component, still
// unmigrated at this point — reads Firestore's camelCase field names
// (isOnline, pushToken, autoPilotRules, nameLower...). Without this, every
// single place that reads profile.isOnline etc. would silently get
// `undefined` the moment this file went live, even though the underlying
// data is there under a different key. This keeps BOTH naming
// conventions present on every profile object returned from here, so
// components can be migrated to the new names individually over time
// instead of all at once. Safe to remove once every read site uses the
// snake_case names directly.
function normalizeProfile(row) {
  if (!row) return row;
  return {
    ...row,
    uid: row.id,
    nameLower: row.name_lower,
    isOnline: row.is_online,
    lastSeen: row.last_seen,
    notificationsEnabled: row.notifications_enabled,
    pushToken: row.push_token,
    autoPilotMode: row.autopilot_mode,
    autoPilotRules: row.autopilot_rules,
    createdAt: row.created_at,
  };
}

// ── Profile ──────────────────────────────────────────────────
// Mirrors AuthContext.jsx's completeProfile(uid, identifier, name, avatar, purpose)
export async function completeProfile(uid, identifier, name, avatar = null, purpose = '') {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const { error } = await supabase.from('profiles').insert({
    id: uid,
    name,
    avatar,
    code,
    phone: identifier?.startsWith('+') ? identifier : null,
    email: identifier?.includes('@') ? identifier : null,
    purpose,
  });
  if (error) throw error;
}

export async function getUserById(uid) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).single();
  if (error) return null;
  return normalizeProfile(data);
}

export async function searchUsersByName(query) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .ilike('name_lower', `%${query.toLowerCase()}%`)
    .limit(20);
  if (error) throw error;
  return (data || []).map(normalizeProfile);
}

export async function getUserByCode(code) {
  const { data, error } = await supabase.from('profiles').select('*').eq('code', code).single();
  if (error) return null;
  return normalizeProfile(data);
}

export async function updateProfile(uid, updates) {
  const { error } = await supabase.from('profiles').update(updates).eq('id', uid);
  if (error) throw error;
}

// ── Contacts ─────────────────────────────────────────────────
export async function addContact(contactId) {
  // Bidirectional — matches the old array-based "adds you to their
  // contacts too" behavior. Done via an RPC (add_contact_pair, uses
  // auth.uid() + SECURITY DEFINER) rather than two direct inserts —
  // inserting the reciprocal row {user_id: contactId, contact_id: uid}
  // as the logged-in user violates a "you can only insert your own
  // rows" RLS policy on `contacts`, which fails the whole batch insert.
  const { error } = await supabase.rpc('add_contact_pair', { p_contact_id: contactId });
  if (error) throw error;
}

export async function getContacts(uid) {
  const { data, error } = await supabase
    .from('contacts')
    .select('contact_id, profiles!contacts_contact_id_fkey(*)')
    .eq('user_id', uid);
  if (error) throw error;
  return (data || []).map(row => normalizeProfile(row.profiles));
}

export async function blockUser(uid, targetUid) {
  const { error } = await supabase.from('blocked_users').insert({ user_id: uid, blocked_id: targetUid });
  if (error) throw error;
}

export async function unblockUser(uid, targetUid) {
  const { error } = await supabase.from('blocked_users').delete().eq('user_id', uid).eq('blocked_id', targetUid);
  if (error) throw error;
}

export async function checkIsBlocked(uid, targetUid) {
  const { data } = await supabase.from('blocked_users').select('*').eq('user_id', uid).eq('blocked_id', targetUid).maybeSingle();
  return !!data;
}

// Live version of checkIsBlocked — replaces ChatWindow.jsx's raw
// onSnapshot(doc(db,'users',uid)) watch of the user's own blocked list.
export function subscribeToBlockedStatus(uid, targetUid, callback) {
  checkIsBlocked(uid, targetUid).then(callback);
  const channel = uniqueChannel(`blocked:${uid}:${targetUid}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'blocked_users', filter: `user_id=eq.${uid}` },
      () => checkIsBlocked(uid, targetUid).then(callback))
    .subscribe();
  return () => supabase.removeChannel(channel);
}

// Live typing status for the OTHER participant — replaces ChatWindow.jsx's
// raw onSnapshot(doc(db,'chats',chatId)) watch of the typing map.
// Live version of subscribeToBlockedStatus (single target) for the full
// list — replaces Settings.jsx's raw onSnapshot(doc(db,'users',uid)) watch
// of a `blocked` array field. The new schema models blocking as a real
// join table instead of an array column, so this reads it via the same
// profiles!<fk> join pattern getContacts uses.
export function subscribeToBlockedUsers(uid, callback) {
  const refresh = async () => {
    const { data } = await supabase
      .from('blocked_users')
      .select('blocked_id, profiles!blocked_users_blocked_id_fkey(*)')
      .eq('user_id', uid);
    callback((data || []).map(row => normalizeProfile(row.profiles) || { id: row.blocked_id, name: 'Unknown User', about: '' }));
  };
  refresh();
  const channel = uniqueChannel(`blocked_users:${uid}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'blocked_users', filter: `user_id=eq.${uid}` }, refresh)
    .subscribe();
  return () => supabase.removeChannel(channel);
}

export function subscribeToTyping(chatId, partnerId, callback, isGroup = false) {
  const table = isGroup ? 'groups' : 'chats';
  const evaluate = (row) => {
    const ts = row?.typing?.[partnerId];
    const ms = ts ? new Date(ts).getTime() : null;
    callback(!!(ms && Date.now() - ms < 4000));
  };
  supabase.from(table).select('typing').eq('id', chatId).single().then(({ data }) => evaluate(data));
  const channel = uniqueChannel(`typing:${chatId}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table, filter: `id=eq.${chatId}` },
      (payload) => evaluate(payload.new))
    .subscribe();
  return () => supabase.removeChannel(channel);
}

// ── Direct Chats ─────────────────────────────────────────────
// Canonical ordering enforced (matches the schema's CHECK constraint) —
// always insert/query with the smaller uuid as user1_id.
function orderPair(uidA, uidB) {
  return uidA < uidB ? [uidA, uidB] : [uidB, uidA];
}

export async function getOrCreateChat(uidA, uidB) {
  const [user1_id, user2_id] = orderPair(uidA, uidB);
  const { data: existing } = await supabase
    .from('chats').select('id').eq('user1_id', user1_id).eq('user2_id', user2_id).maybeSingle();
  if (existing) return existing.id;

  const { data, error } = await supabase
    .from('chats').insert({ user1_id, user2_id }).select('id').single();
  if (error) throw error;

  // Seed both participants' unread rows so increments always have a row
  // to UPDATE rather than needing an upsert on every single message.
  await supabase.from('chat_unread').insert([
    { chat_id: data.id, user_id: user1_id, count: 0 },
    { chat_id: data.id, user_id: user2_id, count: 0 },
  ]);
  return data.id;
}

// One-shot chat lookup by id — used for notification-tap deep-linking
// (App.jsx's openChatById), which only needs the participant ids to
// resolve the partner profile. Returns null instead of throwing so a
// stale/deleted chatId from a notification payload doesn't crash the
// tap handler. `participants` is synthesized to match the shape the
// caller expects (Firestore's chats docs stored it as a real array).
export async function getChatById(chatId) {
  const { data, error } = await supabase.from('chats').select('*').eq('id', chatId).single();
  if (error) return null;
  return { ...data, participants: [data.user1_id, data.user2_id], lastMessage: data.last_message || null };
}

// Normalizes a raw messages/group_messages row into the shape the entire
// existing app expects — senderId, timestamp, fileName, editedAt (all
// camelCase) instead of Postgres's sender_id/created_at/file_name/
// edited_at. Without this, every single read of msg.senderId or
// msg.timestamp throughout the whole message UI would silently be
// undefined the moment this went live.
function normalizeMessage(row) {
  if (!row) return row;
  return {
    ...row,
    senderId: row.sender_id,
    timestamp: row.created_at,
    fileName: row.file_name,
    editedAt: row.edited_at,
    deletedForEveryone: row.deleted_for_everyone,
    deletedFor: row.deleted_for || [],
    replyTo: row.reply_to,
  };
}

// Converts the camelCase keys UI code passes in `extra` (fileName,
// fileSize, replyTo) into the actual snake_case column names — without
// this, inserting `extra` directly would try to write to columns that
// don't exist (Postgres has file_name, not fileName).
const EXTRA_FIELD_MAP = { fileName: 'file_name', fileSize: 'file_size', replyTo: 'reply_to' };
function mapExtraFields(extra) {
  const mapped = {};
  for (const [k, v] of Object.entries(extra || {})) {
    mapped[EXTRA_FIELD_MAP[k] || k] = v;
  }
  return mapped;
}

export async function sendMessage(chatId, senderId, content, type = 'text', extra = {}, senderName = '') {
  const { data: msg, error } = await supabase.from('messages').insert({
    chat_id: chatId, sender_id: senderId, content, type, sender_name: senderName, ...mapExtraFields(extra),
  }).select('id, created_at').single();
  if (error) throw error;

  const { data: chat } = await supabase.from('chats').select('user1_id, user2_id').eq('id', chatId).single();
  const receiverId = chat.user1_id === senderId ? chat.user2_id : chat.user1_id;

  await supabase.from('chats').update({
    // camelCase + a plain ISO timestamp string here deliberately — this
    // is a flexible JSONB blob, not real table columns, and existing UI
    // code (getLastMsgPreview, formatLastTime) already expects senderId
    // and a value `new Date(ts)` can parse directly. A previous version
    // of this wrapped the timestamp in a fake {seconds: N} object to
    // mimic Firestore's Timestamp shape, but new Date({seconds: N}) does
    // NOT parse correctly — it produces an Invalid Date. Better to just
    // match the real shape the UI wants than to fake an old one badly.
    last_message: { content, type, senderId, senderName, id: msg.id, timestamp: msg.created_at },
  }).eq('id', chatId);

  // Atomic increment via a Postgres RPC (see schema/functions in
  // MIGRATION_NOTES.md) — a plain relational UPDATE ... SET count = count+1,
  // no dotted-path/merge ambiguity like the old Firestore pattern had.
  await supabase.rpc('increment_chat_unread', { p_chat_id: chatId, p_user_id: receiverId });

  return msg.id;
}

// subscribeToMessages(chatId, callback) — Realtime equivalent of
// Firestore's onSnapshot. Fetches the initial page, then live-patches it
// as INSERT/UPDATE events arrive. Returns an unsubscribe function.
export function subscribeToMessages(chatId, callback) {
  let messages = [];

  supabase.from('messages').select('*').eq('chat_id', chatId)
    .order('created_at', { ascending: false }).limit(60)
    .then(({ data }) => {
      messages = (data || []).reverse().map(normalizeMessage);
      callback(messages);
    });

  const channel = uniqueChannel(`messages:${chatId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
      (payload) => { messages = [...messages, normalizeMessage(payload.new)]; callback(messages); })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
      (payload) => { messages = messages.map(m => m.id === payload.new.id ? normalizeMessage(payload.new) : m); callback(messages); })
    .subscribe();

  return () => supabase.removeChannel(channel);
}

// Normalizes a raw chats row (+ its chat_unread rows) into the shape
// ChatList.jsx's existing filtering logic already expects from the old
// Firestore version — participants array, unread as a {uid: count} map,
// archived/pinned as booleans FOR THE CALLING USER (the underlying
// columns are per-user arrays, archived_by/pinned_by/deleted_for, a
// deliberate improvement over Firestore's plain shared boolean — but
// exposing them as a boolean here means the surrounding UI code doesn't
// need to be rewritten to know about that).
// NOTE: deleted_for is a plain uuid[] here, not a {uid: timestamp} map
// like Firestore had — so the old "a new message after deletion silently
// un-deletes the chat" behavior is intentionally simplified away.
// Deleting now hides a chat until the user reopens it manually. Flag if
// you want the exact old behavior restored.
async function normalizeChat(row, uid) {
  const { data: unreadRows } = await supabase.from('chat_unread').select('user_id, count').eq('chat_id', row.id);
  const unread = {};
  (unreadRows || []).forEach(r => { unread[r.user_id] = r.count; });
  return {
    ...row,
    participants: [row.user1_id, row.user2_id],
    unread,
    archived: (row.archived_by || []).includes(uid),
    pinned: (row.pinned_by || []).includes(uid),
    deletedFor: (row.deleted_for || []).includes(uid) ? { [uid]: true } : {},
    // last_message is already written in the shape the UI expects
    // (camelCase senderId, plain ISO timestamp string) by sendMessage —
    // no transformation needed here, just pass it through.
    lastMessage: row.last_message || null,
  };
}

export function subscribeToChats(uid, callback) {
  const refresh = async () => {
    const { data } = await supabase.from('chats').select('*').or(`user1_id.eq.${uid},user2_id.eq.${uid}`);
    const normalized = await Promise.all((data || []).map(row => normalizeChat(row, uid)));
    callback(normalized);
  };
  refresh();
  const channel = uniqueChannel(`chats:${uid}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'chats' }, refresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_unread', filter: `user_id=eq.${uid}` }, refresh)
    .subscribe();
  return () => supabase.removeChannel(channel);
}

export async function markMessagesRead(chatId, uid, isGroup = false) {
  if (isGroup) {
    await supabase.from('group_unread').update({ count: 0 }).eq('group_id', chatId).eq('user_id', uid);
    // seenBy-per-message tracking isn't modeled as a column in the new
    // schema yet (group_messages has no equivalent of Firestore's seenBy
    // array) — read receipts stop at the unread-count level for groups
    // for now, same functional gap as direct chats had before `status`.
    return;
  }
  await supabase.from('chat_unread').update({ count: 0 }).eq('chat_id', chatId).eq('user_id', uid);
  // Mark other participants' messages as seen — mirrors the old
  // Firestore version's batch update, just as a plain SQL UPDATE here.
  await supabase.from('messages').update({ status: 'seen' })
    .eq('chat_id', chatId).neq('sender_id', uid).neq('status', 'seen');
}

// ── Typing indicators ────────────────────────────────────────
// Same simple "map on the chat/group row" pattern the original Firestore
// version used, not a separate Realtime Presence channel.
export async function setTyping(chatId, uid, isGroup = false) {
  const table = isGroup ? 'groups' : 'chats';
  const { data } = await supabase.from(table).select('typing').eq('id', chatId).single();
  const typing = { ...(data?.typing || {}), [uid]: new Date().toISOString() };
  await supabase.from(table).update({ typing }).eq('id', chatId);
}
export async function clearTyping(chatId, uid, isGroup = false) {
  const table = isGroup ? 'groups' : 'chats';
  const { data } = await supabase.from(table).select('typing').eq('id', chatId).single();
  const typing = { ...(data?.typing || {}) };
  delete typing[uid];
  await supabase.from(table).update({ typing }).eq('id', chatId);
}

// ── Reactions ─────────────────────────────────────────────────
export async function addReaction(chatId, msgId, uid, emoji, isGroup = false) {
  const table = isGroup ? 'group_messages' : 'messages';
  const { data } = await supabase.from(table).select('reactions').eq('id', msgId).single();
  const reactions = { ...(data?.reactions || {}) };
  const current = reactions[emoji] || [];
  const updated = current.includes(uid) ? current.filter(id => id !== uid) : [...current, uid];
  if (updated.length === 0) delete reactions[emoji];
  else reactions[emoji] = updated;
  await supabase.from(table).update({ reactions }).eq('id', msgId);
}

// ── Delete / Edit message ────────────────────────────────────
export async function deleteMessageForMe(chatId, msgId, uid, isGroup = false) {
  const table = isGroup ? 'group_messages' : 'messages';
  await supabase.rpc('array_append_uid', { p_table: table, p_column: 'deleted_for', p_id: msgId, p_uid: uid });
}
export async function deleteMessageForEveryone(chatId, msgId, isGroup = false) {
  const table = isGroup ? 'group_messages' : 'messages';
  await supabase.from(table).update({ content: '', type: 'deleted', deleted_for_everyone: true }).eq('id', msgId);
}
export async function deleteMultipleMessages(chatId, msgIds, uid, forAll = false, isGroup = false) {
  const table = isGroup ? 'group_messages' : 'messages';
  if (forAll) {
    await supabase.from(table).update({ content: '', type: 'deleted', deleted_for_everyone: true }).in('id', msgIds);
  } else {
    await Promise.all(msgIds.map(id => supabase.rpc('array_append_uid', { p_table: table, p_column: 'deleted_for', p_id: id, p_uid: uid })));
  }
}
export async function editMessage(chatId, msgId, newContent, isGroup = false) {
  const table = isGroup ? 'group_messages' : 'messages';
  await supabase.from(table).update({ content: newContent, edited: true, edited_at: new Date().toISOString() }).eq('id', msgId);
}

// ── Forward message ──────────────────────────────────────────
// targets: [{id, isGroup}]
export async function forwardMessage(msg, targets, senderUid) {
  const MAX_CONTENT_LEN = 900_000;
  const content = msg.content || '';
  const isOversized = typeof content === 'string' && content.length > MAX_CONTENT_LEN;
  const finalContent = isOversized ? '[Media — too large to forward]' : content;
  const finalType    = isOversized ? 'text' : (msg.type || 'text');

  const extra = { forwarded: true };
  if (msg.fileName != null) extra.file_name = msg.fileName;

  await Promise.all(targets.map(async ({ id, isGroup }) => {
    if (isGroup) return sendGroupMessage(id, senderUid, finalContent, finalType, extra);
    const chatId = await getOrCreateChat(senderUid, id);
    return sendMessage(chatId, senderUid, finalContent, finalType, extra);
  }));
}

// ── Mute chat/group ───────────────────────────────────────────
export async function muteChat(uid, chatId, muted, isGroup = false) {
  await supabase.rpc(muted ? 'array_append_uid' : 'array_remove_uid', {
    p_table: isGroup ? 'groups' : 'chats', p_column: 'muted_by', p_id: chatId, p_uid: uid,
  });
}

// ── Pagination ────────────────────────────────────────────────
// beforeCreatedAt: an ISO timestamp string (the oldest message currently
// loaded) — Postgres cursor pagination via a plain WHERE created_at < X,
// simpler than Firestore's startAfter(docSnapshot) since there's no
// document-reference cursor object to carry around.
export async function clearChat(chatId, uid, isGroup = false) {
  const table = isGroup ? 'group_messages' : 'messages';
  const idCol = isGroup ? 'group_id' : 'chat_id';
  const { data } = await supabase.from(table).select('id').eq(idCol, chatId).limit(500);
  await Promise.all((data || []).map(row =>
    supabase.rpc('array_append_uid', { p_table: table, p_column: 'deleted_for', p_id: row.id, p_uid: uid })
  ));
}

export async function loadOlderMessages(chatId, beforeCreatedAt, pageSize = 40) {
  const { data } = await supabase.from('messages').select('*')
    .eq('chat_id', chatId).lt('created_at', beforeCreatedAt)
    .order('created_at', { ascending: false }).limit(pageSize);
  return (data || []).reverse().map(normalizeMessage);
}
export async function loadOlderGroupMessages(groupId, beforeCreatedAt, pageSize = 40) {
  const { data } = await supabase.from('group_messages').select('*')
    .eq('group_id', groupId).lt('created_at', beforeCreatedAt)
    .order('created_at', { ascending: false }).limit(pageSize);
  return (data || []).reverse().map(normalizeMessage);
}

// ── Push notification ─────────────────────────────────────────
export async function sendPushNotification(recipientUid, title, body, data = {}) {
  try {
    const { data: recipient } = await supabase.from('profiles').select('push_token').eq('id', recipientUid).single();
    const token = recipient?.push_token;
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

export async function setChatPinned(chatId, uid, pinned) {
  const col = pinned ? 'pinned_by' : null;
  // append/remove uid from the pinned_by array — a Postgres RPC keeps
  // this atomic (see MIGRATION_NOTES.md), same reasoning as the unread
  // counter above.
  await supabase.rpc(pinned ? 'array_append_uid' : 'array_remove_uid', {
    p_table: 'chats', p_column: 'pinned_by', p_id: chatId, p_uid: uid,
  });
}

export async function setChatArchived(chatId, uid, archived) {
  await supabase.rpc(archived ? 'array_append_uid' : 'array_remove_uid', {
    p_table: 'chats', p_column: 'archived_by', p_id: chatId, p_uid: uid,
  });
}

export async function deleteChatForUser(chatId, uid) {
  await supabase.rpc('array_append_uid', { p_table: 'chats', p_column: 'deleted_for', p_id: chatId, p_uid: uid });
}

export async function setGroupPinned(groupId, uid, pinned) {
  await supabase.rpc(pinned ? 'array_append_uid' : 'array_remove_uid', {
    p_table: 'groups', p_column: 'pinned_by', p_id: groupId, p_uid: uid,
  });
}

export async function setGroupArchived(groupId, uid, archived) {
  await supabase.rpc(archived ? 'array_append_uid' : 'array_remove_uid', {
    p_table: 'groups', p_column: 'archived_by', p_id: groupId, p_uid: uid,
  });
}

export async function deleteGroupForUser(groupId, uid) {
  await supabase.rpc('array_append_uid', { p_table: 'groups', p_column: 'deleted_for', p_id: groupId, p_uid: uid });
}

// ── Hidden Chats ─────────────────────────────────────────────
export async function setChatHidden(uid, chatId, hidden) {
  if (hidden) {
    // Hiding a chat is triggered from the chat list's long-press menu,
    // independent of ever having opened the Hidden Chats screen/set a PIN
    // — so this row may not exist yet. ensure_hidden_chats_row upserts a
    // placeholder row first so array_append_uid always has something to
    // UPDATE, instead of silently no-op'ing against a nonexistent row.
    await supabase.rpc('ensure_hidden_chats_row', { p_user_id: uid });
  }
  await supabase.rpc(hidden ? 'array_append_uid' : 'array_remove_uid', {
    p_table: 'hidden_chats_settings', p_column: 'hidden_chat_ids', p_id: uid, p_uid: chatId, p_id_column: 'user_id',
  });
}

export async function setHiddenChatsPin(uid, pinHash) {
  await supabase.from('hidden_chats_settings').upsert(
    { user_id: uid, pin_hash: pinHash, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  );
}

// One-shot read — used both for HiddenChats.jsx's initial
// setup-vs-verify screen check and for PIN verification, and as the
// initial value for the live subscription below.
export async function getHiddenChatsSettings(uid) {
  const { data } = await supabase.from('hidden_chats_settings').select('*').eq('user_id', uid).maybeSingle();
  return { pinHash: data?.pin_hash ?? null, hiddenChatIds: data?.hidden_chat_ids ?? [] };
}

export function subscribeToHiddenChatsSettings(uid, callback) {
  const normalize = (row) => ({
    pinHash: row?.pin_hash ?? null,
    hiddenChatIds: row?.hidden_chat_ids ?? [],
  });
  getHiddenChatsSettings(uid).then(callback);
  const channel = uniqueChannel(`hidden_chats:${uid}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'hidden_chats_settings', filter: `user_id=eq.${uid}` },
      (payload) => callback(normalize(payload.new)))
    .subscribe();
  return () => supabase.removeChannel(channel);
}

// ── Groups ───────────────────────────────────────────────────
export async function createGroup(name, adminId, memberIds, photoUrl = null) {
  const { data: group, error } = await supabase.from('groups').insert({
    name, admin_id: adminId, photo_url: photoUrl,
  }).select('id').single();
  if (error) throw error;

  const members = [adminId, ...memberIds];
  await supabase.from('group_members').insert(members.map(user_id => ({ group_id: group.id, user_id })));
  await supabase.from('group_unread').insert(members.map(user_id => ({ group_id: group.id, user_id, count: 0 })));
  return group.id;
}

export async function sendGroupMessage(groupId, senderId, content, type = 'text', extra = {}, senderName = '') {
  const { data: msg, error } = await supabase.from('group_messages').insert({
    group_id: groupId, sender_id: senderId, content, type, sender_name: senderName, ...mapExtraFields(extra),
  }).select('id, created_at').single();
  if (error) throw error;

  await supabase.from('groups').update({
    last_message: { content, type, senderId, senderName, id: msg.id, timestamp: msg.created_at },
  }).eq('id', groupId);

  const { data: members } = await supabase.from('group_members').select('user_id').eq('group_id', groupId);
  await Promise.all(
    (members || [])
      .filter(m => m.user_id !== senderId)
      .map(m => supabase.rpc('increment_group_unread', { p_group_id: groupId, p_user_id: m.user_id }))
  );
  return msg.id;
}

export function subscribeToGroupMessages(groupId, callback) {
  let messages = [];
  supabase.from('group_messages').select('*').eq('group_id', groupId)
    .order('created_at', { ascending: false }).limit(60)
    .then(({ data }) => { messages = (data || []).reverse().map(normalizeMessage); callback(messages); });

  const channel = uniqueChannel(`group_messages:${groupId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_messages', filter: `group_id=eq.${groupId}` },
      (payload) => { messages = [...messages, normalizeMessage(payload.new)]; callback(messages); })
    .subscribe();
  return () => supabase.removeChannel(channel);
}

async function normalizeGroup(row, uid) {
  const { data: memberRows } = await supabase.from('group_members').select('user_id').eq('group_id', row.id);
  const { data: unreadRows } = await supabase.from('group_unread').select('user_id, count').eq('group_id', row.id);
  const unread = {};
  (unreadRows || []).forEach(r => { unread[r.user_id] = r.count; });
  return {
    ...row,
    members: (memberRows || []).map(m => m.user_id),
    adminId: row.admin_id,
    unread,
    archived: (row.archived_by || []).includes(uid),
    pinned: (row.pinned_by || []).includes(uid),
    deletedFor: (row.deleted_for || []).includes(uid) ? { [uid]: true } : {},
    lastMessage: row.last_message || null,
  };
}

export function subscribeToGroups(uid, callback) {
  const refresh = async () => {
    const { data } = await supabase.from('group_members').select('group_id, groups(*)').eq('user_id', uid);
    const rows = (data || []).map(r => r.groups).filter(Boolean);
    const normalized = await Promise.all(rows.map(row => normalizeGroup(row, uid)));
    callback(normalized);
  };
  refresh();
  const channel = uniqueChannel(`groups:${uid}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'groups' }, refresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'group_unread', filter: `user_id=eq.${uid}` }, refresh)
    .subscribe();
  return () => supabase.removeChannel(channel);
}

// One-shot group lookup by id, normalized the same way subscribeToGroups
// does — used for notification-tap deep-linking (App.jsx's openGroupById).
export async function getGroupById(groupId, uid) {
  const { data, error } = await supabase.from('groups').select('*').eq('id', groupId).single();
  if (error) return null;
  return normalizeGroup(data, uid);
}

// Live single-group subscription — replaces GroupChat.jsx's raw
// onSnapshot(doc(db,'groups',groupId)) watch used to keep the member list
// current and detect the group being deleted or the current user being
// removed. Calls callback(null) when the group no longer exists, matching
// Firestore's snap.exists() check so the caller can navigate back.
export function subscribeToGroup(groupId, uid, callback) {
  const refresh = async () => {
    const { data } = await supabase.from('groups').select('*').eq('id', groupId).single();
    if (!data) { callback(null); return; }
    callback(await normalizeGroup(data, uid));
  };
  refresh();
  const channel = uniqueChannel(`group:${groupId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'groups', filter: `id=eq.${groupId}` }, refresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'group_members', filter: `group_id=eq.${groupId}` }, refresh)
    .subscribe();
  return () => supabase.removeChannel(channel);
}

// Live "who's typing" for a group, excluding self — replaces GroupChat.jsx's
// second raw onSnapshot(doc(db,'groups',groupId)) watch of the typing map.
// Returns the currently-typing member uids; the caller already maps
// uid -> display name via its own memberProfiles state.
export function subscribeToGroupTyping(groupId, uid, callback) {
  const evaluate = (row) => {
    const typing = row?.typing || {};
    const now = Date.now();
    const active = Object.entries(typing)
      .filter(([id, ts]) => id !== uid && ts && now - new Date(ts).getTime() < 4000)
      .map(([id]) => id);
    callback(active);
  };
  supabase.from('groups').select('typing').eq('id', groupId).single().then(({ data }) => evaluate(data));
  const channel = uniqueChannel(`group_typing:${groupId}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'groups', filter: `id=eq.${groupId}` },
      (payload) => evaluate(payload.new))
    .subscribe();
  return () => supabase.removeChannel(channel);
}

export async function updateGroupDescription(groupId, description) {
  await supabase.from('groups').update({ description }).eq('id', groupId);
}

// System messages use sender_id: null rather than the string 'system' —
// group_messages.sender_id is a real FK into profiles, and GroupMsgBubble
// already keys off `type === 'system'` for rendering, not senderId, so
// null is safe and avoids a bogus FK value.
async function postGroupSystemMessage(groupId, content) {
  await supabase.from('group_messages').insert({
    group_id: groupId, sender_id: null, sender_name: 'System', content, type: 'system',
  });
  await supabase.from('groups').update({
    last_message: { content, type: 'system', senderId: 'system', timestamp: new Date().toISOString() },
  }).eq('id', groupId);
}

export async function addGroupMember(groupId, newMemberId, adminName, newMemberName) {
  try {
    await supabase.from('group_members').insert({ group_id: groupId, user_id: newMemberId });
    await supabase.from('group_unread').insert({ group_id: groupId, user_id: newMemberId, count: 0 });
    await postGroupSystemMessage(groupId, `${newMemberName} was added by ${adminName}`);
  } catch {}
}

export async function removeGroupMember(groupId, memberId, adminId, adminName, memberName) {
  try {
    await supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', memberId);
    await supabase.from('group_unread').delete().eq('group_id', groupId).eq('user_id', memberId);
    await postGroupSystemMessage(groupId, `${memberName} was removed by ${adminName}`);
  } catch {}
}

export async function exitGroupWithNotice(groupId, uid, userName, isAdmin = false, deleteForAll = false) {
  if (deleteForAll && isAdmin) {
    await supabase.from('groups').delete().eq('id', groupId);
    return;
  }
  await supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', uid);
  await supabase.from('group_unread').delete().eq('group_id', groupId).eq('user_id', uid);
  await postGroupSystemMessage(groupId, `${userName} left the group`);
}

// ── Presence ─────────────────────────────────────────────────
// Same Postgres-is-the-single-source-of-truth design as the final
// Firestore version — a heartbeat while the tab is visible, plus a
// staleness check on read (online only if isOnline AND lastSeen recent),
// since a hard "disconnected" event isn't reliably observable client-side
// either way.
export async function setOnline(uid) {
  await supabase.from('profiles').update({ is_online: true, last_seen: new Date().toISOString() }).eq('id', uid);
}
export async function updateLastSeen(uid) {
  await supabase.from('profiles').update({ is_online: false, last_seen: new Date().toISOString() }).eq('id', uid);
}

// setupPresence(uid) — heartbeat while the tab is visible, mirrors the
// final Firestore version's design exactly (Postgres is the single
// source of truth here too, no separate realtime-presence-channel
// complexity needed for something this simple). Returns a cleanup
// function to call on logout/unmount.
const PRESENCE_HEARTBEAT_MS = 25_000;
export function setupPresence(uid) {
  setOnline(uid);
  let heartbeatId = setInterval(() => {
    if (document.visibilityState === 'visible') setOnline(uid);
  }, PRESENCE_HEARTBEAT_MS);

  const handleVisibility = () => {
    if (document.visibilityState === 'visible') setOnline(uid);
    else updateLastSeen(uid);
  };
  document.addEventListener('visibilitychange', handleVisibility);
  window.addEventListener('pagehide', () => updateLastSeen(uid));

  return () => {
    clearInterval(heartbeatId);
    document.removeEventListener('visibilitychange', handleVisibility);
    updateLastSeen(uid);
  };
}

const PRESENCE_STALE_MS = 60_000;
export function subscribeToPresence(uid, callback) {
  const evaluate = (row) => {
    const lastSeenMs = row?.last_seen ? new Date(row.last_seen).getTime() : null;
    const isStale = lastSeenMs !== null && (Date.now() - lastSeenMs) > PRESENCE_STALE_MS;
    const online = !!row?.is_online && !isStale;
    callback({ state: online ? 'online' : 'offline', last_changed: row?.last_seen });
  };
  supabase.from('profiles').select('is_online, last_seen').eq('id', uid).single()
    .then(({ data }) => evaluate(data));
  const channel = uniqueChannel(`presence:${uid}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${uid}` },
      (payload) => evaluate(payload.new))
    .subscribe();
  return () => supabase.removeChannel(channel);
}

// ── Moments / Status ─────────────────────────────────────────
export async function postStatus(uid, authorName, authorAvatar, type, content, privacy = 'contacts', privacyContacts = [], music = null) {
  const { error } = await supabase.from('statuses').insert({
    uid, author_name: authorName, author_avatar: authorAvatar, type, content,
    privacy, privacy_contacts: privacyContacts, music,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  });
  if (error) throw error;
}

export function subscribeToStatuses(callback) {
  const refresh = async () => {
    const { data } = await supabase
      .from('statuses').select('*')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });
    callback(data || []);
  };
  refresh();
  const channel = uniqueChannel('statuses')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'statuses' }, refresh)
    .subscribe();
  return () => supabase.removeChannel(channel);
}

export async function markStatusViewed(statusId, viewerId) {
  await supabase.from('status_viewers').upsert({ status_id: statusId, viewer_id: viewerId }, { onConflict: 'status_id,viewer_id' });
}

export async function deleteStatus(statusId) {
  await supabase.from('statuses').delete().eq('id', statusId);
}

// ── FF Tasks (auto-extracted + manual) ─────────────────────────
// Replaces the old `users/{uid}/tasks` Firestore subcollection with a
// real `tasks` table. Requires a `tasks` table + RLS policy — see
// tasks_and_command_center.sql.
function normalizeTask(row) {
  return {
    id: row.id,
    title: row.title,
    source: row.source,
    chatId: row.chat_id,
    type: row.chat_type,
    messageId: row.message_id,
    senderId: row.sender_id,
    confidenceScore: row.confidence_score,
    confidenceLabel: row.confidence_label,
    status: row.status,
    dueDate: row.due_date,
    googleTaskId: row.google_task_id,
    messageText: row.message_text,
    createdAt: row.created_at,
  };
}

export async function createTask(uid, taskData) {
  // Dedup: if a messageId is provided (auto-extracted tasks), skip if a
  // task for that message already exists — same behavior as the old
  // Firestore version's pre-write query.
  if (taskData.messageId) {
    const { data: existing } = await supabase.from('tasks')
      .select('id').eq('user_id', uid).eq('message_id', taskData.messageId).maybeSingle();
    if (existing) return existing.id;
  }
  const { data, error } = await supabase.from('tasks').insert({
    user_id: uid,
    title: taskData.title,
    source: taskData.source || null,
    chat_id: taskData.chatId || null,
    chat_type: taskData.type || taskData.chatType || null,
    message_id: taskData.messageId || null,
    sender_id: taskData.senderId || null,
    confidence_score: taskData.confidenceScore ?? null,
    confidence_label: taskData.confidenceLabel || null,
    due_date: taskData.dueDate || null,
  }).select('id').single();
  if (error) throw error;
  return data.id;
}

export async function toggleTask(taskId, newStatus) {
  await supabase.from('tasks').update({ status: newStatus }).eq('id', taskId);
}

export async function deleteTask(taskId) {
  await supabase.from('tasks').delete().eq('id', taskId);
}

export async function setTaskGoogleId(taskId, googleTaskId) {
  await supabase.from('tasks').update({ google_task_id: googleTaskId }).eq('id', taskId);
}

export function subscribeToTasks(uid, callback) {
  const refresh = async () => {
    const { data } = await supabase.from('tasks').select('*').eq('user_id', uid).order('created_at', { ascending: false });
    callback((data || []).map(normalizeTask));
  };
  refresh();
  const channel = uniqueChannel(`tasks:${uid}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `user_id=eq.${uid}` }, refresh)
    .subscribe();
  return () => supabase.removeChannel(channel);
}

// ── Command Center (aggregated commitments/decisions/timeline/waitingFor) ──
// Replaces the old `users/{uid}/commandCenter/data` Firestore doc with a
// one-row-per-user `command_center` table. Requires a `command_center`
// table + RLS policy — see tasks_and_command_center.sql.
function normalizeCommandCenter(row) {
  return {
    commitments: row?.commitments || [],
    decisions: row?.decisions || [],
    timeline: row?.timeline || [],
    waitingFor: row?.waiting_for || [],
    lastUpdated: row?.last_updated ? new Date(row.last_updated).getTime() : null,
  };
}

export async function getCommandCenterData(uid) {
  const { data } = await supabase.from('command_center').select('*').eq('user_id', uid).maybeSingle();
  return normalizeCommandCenter(data);
}

export function subscribeToCommandCenter(uid, callback) {
  getCommandCenterData(uid).then(callback);
  const channel = uniqueChannel(`command_center:${uid}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'command_center', filter: `user_id=eq.${uid}` },
      (payload) => callback(normalizeCommandCenter(payload.new)))
    .subscribe();
  return () => supabase.removeChannel(channel);
}

// Read-merge-write, mirroring the old Firestore setDoc({...}, {merge:true})
// pattern the intelligence engine relied on — commitments/decisions/
// timeline/waitingFor are deduped+capped client-side by the caller before
// this is called, so this just persists whatever patch it's given.
// `patch` keys are camelCase (matching the rest of the app); mapped to
// snake_case columns here so callers don't need to know column names.
const CC_FIELD_MAP = { waitingFor: 'waiting_for' };
export async function mergeCommandCenterData(uid, patch) {
  const { data: existing } = await supabase.from('command_center').select('*').eq('user_id', uid).maybeSingle();
  const row = { user_id: uid, ...(existing || {}) };
  for (const [key, value] of Object.entries(patch)) {
    row[CC_FIELD_MAP[key] || key] = value;
  }
  row.last_updated = new Date().toISOString();
  await supabase.from('command_center').upsert(row, { onConflict: 'user_id' });
}

// One-shot recent-messages read for a chat/group — replaces
// useIntelligenceEngine.js's raw getDocs(query(chats/{id}/messages, ...))
// against the old per-chat message subcollections, now that messages live
// in the top-level `messages`/`group_messages` tables.
export async function getRecentMessages(chatId, isGroup, limitN = 10) {
  const table = isGroup ? 'group_messages' : 'messages';
  const col = isGroup ? 'group_id' : 'chat_id';
  const { data } = await supabase.from(table).select('*').eq(col, chatId)
    .order('created_at', { ascending: false }).limit(limitN);
  return (data || []).map(normalizeMessage);
}

// Realtime feed of chats/groups last_message updates, for the
// intelligence engine (task/commitment/decision extraction) — replaces
// useIntelligenceEngine.js's two Firestore onSnapshot listeners on
// `chats`/`groups` filtered by array-contains(uid). No explicit uid
// filter is needed here: RLS already restricts which rows a client can
// see to ones they participate in (same trust model subscribeToChats/
// subscribeToGroups already rely on), so every row reaching the
// callback is guaranteed to be one the current user can see.
export function subscribeToIntelligenceFeed(uid, onChatUpdate, onGroupUpdate) {
  const channel = uniqueChannel(`intel_feed:${uid}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chats' },
      (payload) => onChatUpdate(payload.new))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'groups' },
      (payload) => onGroupUpdate(payload.new))
    .subscribe();
  return () => supabase.removeChannel(channel);
}
