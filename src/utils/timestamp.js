// ═══════════════════════════════════════════════════════════
//  Shared timestamp helpers.
//
//  Message `timestamp` fields are a Firestore Timestamp object for
//  older messages (written before this fix) and a plain ISO 8601
//  string for messages going forward (see sendMessage/sendGroupMessage
//  in firebase.js for why: serverTimestamp() is excluded from ordered
//  onSnapshot query results while still pending, which was hiding
//  freshly-sent messages from the chat window). Both shapes can appear
//  in the same collection, so every read site needs to handle both —
//  these helpers are the single place that does.
// ═══════════════════════════════════════════════════════════

// Firestore Timestamp | ISO string | Date | null/undefined -> Date | null
export function toJSDate(ts) {
  if (!ts) return null;
  if (typeof ts?.toDate === 'function') return ts.toDate();
  if (ts instanceof Date) return ts;
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d;
}

// Firestore Timestamp | ISO string | Date | null/undefined -> "3:45 PM" | ''
export function formatMsgTime(ts) {
  const d = toJSDate(ts);
  return d ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
}

// Firestore Timestamp | ISO string | Date | null/undefined -> epoch ms | 0
export function toMs(ts) {
  const d = toJSDate(ts);
  return d ? d.getTime() : 0;
}
