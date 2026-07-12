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
export async function addContact(uid, contactId) {
  // Bidirectional — matches the old array-based "adds you to their
  // contacts too" behavior. Two inserts instead of two array unions.
  const { error } = await supabase.from('contacts').insert([
    { user_id: uid, contact_id: contactId },
    { user_id: contactId, contact_id: uid },
  ]);
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

export async function sendMessage(chatId, senderId, content, type = 'text', extra = {}) {
  const { data: msg, error } = await supabase.from('messages').insert({
    chat_id: chatId, sender_id: senderId, content, type, ...extra,
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
    last_message: { content, type, senderId, id: msg.id, timestamp: msg.created_at },
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
      messages = (data || []).reverse();
      callback(messages);
    });

  const channel = supabase
    .channel(`messages:${chatId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
      (payload) => { messages = [...messages, payload.new]; callback(messages); })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
      (payload) => { messages = messages.map(m => m.id === payload.new.id ? payload.new : m); callback(messages); })
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
  const channel = supabase
    .channel(`chats:${uid}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'chats' }, refresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_unread', filter: `user_id=eq.${uid}` }, refresh)
    .subscribe();
  return () => supabase.removeChannel(channel);
}

export async function markMessagesRead(chatId, uid) {
  await supabase.from('chat_unread').update({ count: 0 }).eq('chat_id', chatId).eq('user_id', uid);
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

export function subscribeToHiddenChatsSettings(uid, callback) {
  const normalize = (row) => ({
    pinHash: row?.pin_hash ?? null,
    hiddenChatIds: row?.hidden_chat_ids ?? [],
  });
  supabase.from('hidden_chats_settings').select('*').eq('user_id', uid).maybeSingle()
    .then(({ data }) => callback(normalize(data)));
  const channel = supabase
    .channel(`hidden_chats:${uid}`)
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

export async function sendGroupMessage(groupId, senderId, content, type = 'text', extra = {}) {
  const { data: msg, error } = await supabase.from('group_messages').insert({
    group_id: groupId, sender_id: senderId, content, type, ...extra,
  }).select('id, created_at').single();
  if (error) throw error;

  await supabase.from('groups').update({
    last_message: { content, type, senderId, id: msg.id, timestamp: msg.created_at },
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
    .then(({ data }) => { messages = (data || []).reverse(); callback(messages); });

  const channel = supabase
    .channel(`group_messages:${groupId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_messages', filter: `group_id=eq.${groupId}` },
      (payload) => { messages = [...messages, payload.new]; callback(messages); })
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
  const channel = supabase
    .channel(`groups:${uid}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'groups' }, refresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'group_unread', filter: `user_id=eq.${uid}` }, refresh)
    .subscribe();
  return () => supabase.removeChannel(channel);
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
  const channel = supabase
    .channel(`presence:${uid}`)
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
  const channel = supabase
    .channel('statuses')
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
