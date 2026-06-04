// ═══════════════════════════════════════════════════════════════
//  useIntelligenceEngine v2 — Batched, pre-filtered, cached
//  Cost model:
//    - Every message passes a LOCAL confidence scorer first
//    - Groq is only called when confidence ≥ GROQ_THRESHOLD
//    - Messages are queued and batched: 1 API call per N messages
//    - Already-processed keys persisted in localStorage (never re-run)
//    - Firestore writes batched: read once, write once per flush
// ═══════════════════════════════════════════════════════════════
import { useEffect, useRef } from 'react';
import { db, createFFTask } from '../firebase';
import {
  doc, getDoc, setDoc,
  collection, query, where, orderBy, limit, getDocs, onSnapshot,
} from 'firebase/firestore';
import { askDeep } from '../ai/groqClient';

// ── Tuneable constants ────────────────────────────────────────
const GROQ_THRESHOLD   = 0.40;  // local confidence must exceed this to call Groq
const BATCH_SIZE       = 4;     // flush queue after this many messages
const BATCH_WINDOW_MS  = 8000;  // or after this many ms (whichever comes first)
const MIN_MSG_LENGTH   = 6;     // ignore trivial messages
const MAX_MSG_LENGTH   = 600;   // truncate for Groq

// ── Local confidence scorer — zero network, zero cost ─────────
// Returns a score 0.0–1.0 reflecting how likely the message
// contains actionable content (task / deadline / commitment / decision / reminder)
const SIGNAL_PATTERNS = [
  // High-signal: explicit commitments
  { pattern: /\b(i will|i'll|i promise|i'm going to|i can do|i'll (send|share|bring|do|handle|take care|check|get|prepare|finish|submit|call|message|update|fix|add|upload))\b/i, weight: 0.6 },
  // High-signal: decisions
  { pattern: /\b(decided|agreed|confirmed|finalized|going with|going ahead|let's go with|we('re| are) going with)\b/i, weight: 0.6 },
  // High-signal: schedule changes, cancellations, postponements
  { pattern: /\b(cancel(led|ed)?|cancelled|postpone[d]?|reschedule[d]?|moved to|shifted to|called off|calledoff|pushed (to|back)|rearranged|new (date|time|venue)|venue changed|time changed|date changed|no (class|school|meeting|practice|session|lecture|lab|test|exam) (today|tomorrow|this week)?)\b/i, weight: 0.6 },
  // High-signal: deadline modifications
  { pattern: /\b(extended (to|till|until)|new deadline|deadline (moved|changed|shifted|extended|is now)|now due|submission (moved|extended|postponed)|last date (is|changed to)|due date (changed|moved|is now))\b/i, weight: 0.6 },
  // Medium-signal: deadline language
  { pattern: /\b(by (tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week|end of day|eod|\d+(am|pm)|\d+:\d+)|due (on|by|tomorrow|friday|monday|tonight)|submit(ted)? by|deadline is|before (class|the (exam|test|meeting|call))|(tomorrow|tonight|this (friday|monday|sunday|saturday|thursday|wednesday|tuesday)) (is the |is |'s the )?(deadline|due date|last date|submission))\b/i, weight: 0.5 },
  // Medium-signal: standalone time references
  { pattern: /\b(tonight|tomorrow morning|tomorrow evening|by end of (day|week)|this (friday|monday|sunday|saturday|thursday|wednesday|tuesday)|next (monday|friday|week))\b/i, weight: 0.3 },
  // Medium-signal: bare tomorrow/today used with an action word (caught by combo below)
  { pattern: /\b(tomorrow|today)\b/i, weight: 0.15 },
  // Medium-signal: task language
  { pattern: /\b(need to|have to|must|should|todo|to-do|remember to|don't forget|make sure|ensure)\b/i, weight: 0.4 },
  // Medium-signal: reminder language
  { pattern: /\b(remind(er)?|don't let me forget|ping me|follow up|check back|get back to)\b/i, weight: 0.4 },
  // Medium-signal: group request patterns ("can somebody", "someone please", "can anyone")
  { pattern: /\b(can (somebody|someone|anyone|one of you)|please (bring|send|share|submit|upload|do|handle)|somebody (bring|send|share|please)|who (can|will|is going to))\b/i, weight: 0.35 },
  // Medium-signal: event+day pattern ("practical on Friday", "test on Monday", "class on Thursday")
  { pattern: /\b(class|test|exam|practical|lab|lecture|session|meeting|submission|assignment|homework|quiz|viva|presentation) (on|this|next) (monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today)\b/i, weight: 0.5 },
  // Low-signal: general action words
  { pattern: /\b(bring|send|share|upload|post|submit|call|message|ping|update|fix|add|prepare|complete)\b/i, weight: 0.2 },
];

const NOISE_PATTERNS = [
  /^(ok|okay|sure|yes|yep|yeah|nope|no|haha|lol|hmm|ohh?|aah?|wow|nice|cool|great|good|thanks|thank you|noted|👍|👌|😂|🙏|❤️|✅)[\s!.]*$/i,
  /^(hi|hey|hello|morning|evening|night|bye|goodbye|later|cya|ttyl|brb|omw)[\s!.]*$/i,
];

export function scoreMessageLocally(text = '') {
  const t = text.trim();
  if (!t || t.length < MIN_MSG_LENGTH) return 0;

  // Instantly reject noise
  if (NOISE_PATTERNS.some(p => p.test(t))) return 0;

  let score = 0;
  for (const { pattern, weight } of SIGNAL_PATTERNS) {
    if (pattern.test(t)) score += weight;
  }

  // Length bonus: longer messages are more likely to have structure
  if (t.length > 100) score += 0.1;
  if (t.length > 200) score += 0.1;

  return Math.min(score, 1.0);
}

// ── Question detector (unchanged) ────────────────────────────
function looksLikeQuestion(text = '') {
  const t = text.trim();
  if (t.endsWith('?')) return true;
  return /^(what|when|where|who|why|how|could|would|can|will|shall|should|is|are|do|did|have|has)\b/i.test(t);
}

function toMs(ts) {
  if (!ts) return 0;
  if (ts.seconds) return ts.seconds * 1000;
  return Number(ts);
}

// ── Batched Groq extractor ────────────────────────────────────
// Takes up to BATCH_SIZE messages, runs ONE Groq call for all of them
async function groqBatchExtract(batch) {
  if (!batch.length) return [];

  const lines = batch.map((m, i) =>
    `[${i}] ${m.senderName} in "${m.sourceName}": "${m.content.slice(0, MAX_MSG_LENGTH)}"`
  ).join('\n');

  const prompt = `You are extracting actionable intelligence from chat messages. Be specific — use real names and exact details from the messages.

Messages:
${lines}

For each message, extract tasks, commitments, or decisions. Use the sender's name in items.
Return ONLY a JSON array, one object per message, same order:
[{"idx":0,"tasks":[],"commitments":[],"decisions":[]}, ...]

Rules:
- SPECIFIC: "Rahul will send notes" not "Someone will send something"
- EXACT: quote the actual content, keep under 80 chars
- HONEST: empty arrays if nothing actionable — never invent
- tasks: things someone needs to do ("Bring practical file", "Submit assignment")
- commitments: explicit promises ("Rahul: send notes tonight")
- decisions: confirmed outcomes ("Test moved to Friday", "Meeting cancelled")
- No markdown, no explanation, raw JSON only`;

  try {
    const raw = await askDeep(prompt, 'Extract only what is explicitly stated. Use real names. Return raw JSON array.');
    let clean = raw.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
    const start = clean.indexOf('[');
    const end = clean.lastIndexOf(']');
    if (start === -1 || end === -1) return batch.map(() => ({}));
    clean = clean.slice(start, end + 1).replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ');
    const parsed = JSON.parse(clean);
    if (!Array.isArray(parsed)) return batch.map(() => ({}));
    return parsed;
  } catch {
    return batch.map(() => ({}));
  }
}

// ── Main hook ─────────────────────────────────────────────────
export function useIntelligenceEngine(uid) {
  const processed   = useRef(new Set());
  const queue       = useRef([]);       // pending messages for next batch
  const batchTimer  = useRef(null);     // flush timer handle
  const flushing    = useRef(false);    // prevent concurrent flushes

  // ── Telemetry counters (in-memory, for audit report) ─────────
  const stats = useRef({
    received: 0,
    skippedNoise: 0,
    skippedCache: 0,
    skippedLowConf: 0,
    sentToGroq: 0,
    groqBatches: 0,
    firestoreReads: 0,
    firestoreWrites: 0,
  });

  // Expose stats globally for the audit report
  if (typeof window !== 'undefined') window.__ffIntelStats = stats.current;

  // ── Restore processed keys ────────────────────────────────────
  useEffect(() => {
    if (!uid) return;
    try {
      const stored = JSON.parse(localStorage.getItem(`ff_intel2_${uid}`)) || [];
      stored.forEach(k => processed.current.add(k));
    } catch {}
  }, [uid]);

  const markProcessed = (key) => {
    processed.current.add(key);
    try {
      const arr = Array.from(processed.current).slice(-400);
      localStorage.setItem(`ff_intel2_${uid}`, JSON.stringify(arr));
    } catch {}
  };

  // ── Unanswered question check (unchanged, pure data) ─────────
  const checkUnansweredQuestion = async ({ msgId, content, senderId, senderName, timestamp, chatId, sourceName, chatType }) => {
    if (senderId === uid || !looksLikeQuestion(content)) return;

    const msgsCol = chatType === 'group'
      ? collection(db, 'groups', chatId, 'messages')
      : collection(db, 'chats', chatId, 'messages');

    const msgTs = toMs(timestamp);
    try {
      stats.current.firestoreReads++;
      const recent = await getDocs(query(msgsCol, orderBy('timestamp', 'desc'), limit(10)));
      const msgs = recent.docs.map(d => d.data());
      const userRepliedAfter = msgs.some(m => m.senderId === uid && toMs(m.timestamp) > msgTs);

      if (!userRepliedAfter) {
        await saveWaitingItem({ uid, chatId, chatType, sourceName, senderName, text: content, timestamp, msgId });
      }
    } catch {}
  };

  // ── Flush: process queued batch ───────────────────────────────
  const flushQueue = async () => {
    if (flushing.current || !queue.current.length) return;
    flushing.current = true;
    batchTimer.current = null;

    const batch = queue.current.splice(0, BATCH_SIZE);

    // Filter to only messages that pass threshold
    const eligible = batch.filter(m => m._confidence >= GROQ_THRESHOLD);
    stats.current.skippedLowConf += batch.length - eligible.length;

    let results = [];
    if (eligible.length > 0) {
      stats.current.sentToGroq += eligible.length;
      stats.current.groqBatches++;
      results = await groqBatchExtract(eligible);
    }

    // ── Single Firestore read + write for the whole batch ────────
    let ccData = null;
    let needsWrite = false;
    const newTasks = [];
    const newCommits = [];
    const newDecs = [];
    const newTimeline = [];

    for (let i = 0; i < eligible.length; i++) {
      const msg = eligible[i];
      const res = results[i] || {};

      const tasks       = res.tasks       || [];
      const commitments = res.commitments || [];
      const decisions   = res.decisions   || [];

      // Navigation metadata — stored on every entity so "open source" always works
      const navMeta = {
        sourceType: msg.chatType,          // 'direct' | 'group'
        sourceId:   msg.chatId,            // chatId or groupId
        chatId:     msg.chatId,
        chatType:   msg.chatType,
        messageId:  msg.msgId,
        senderId:   msg.senderId,
        senderName: msg.senderName,
        source:     msg.sourceName,
        ts:         toMs(msg.timestamp) || Date.now(),
      };

      // Tasks → subcollection (still one write each, unavoidable)
      for (const t of tasks) {
        newTasks.push({
          title: t,
          source: msg.sourceName,
          chatId: msg.chatId,
          type: msg.chatType,
          messageId: msg.msgId,
          senderId: msg.senderId,
        });
      }

      if (commitments.length || decisions.length || tasks.length || (msg.senderId !== uid && looksLikeQuestion(msg.content))) {
        needsWrite = true;
      }

      commitments.forEach(c => newCommits.push({
        ...navMeta,
        msg: c,
        id: `${msg.chatId}-${msg.msgId}-c`,
      }));
      decisions.forEach(d => newDecs.push({
        ...navMeta,
        msg: d,
        id: `${msg.chatId}-${msg.msgId}-d`,
      }));

      if (commitments.length || decisions.length || tasks.length) {
        newTimeline.push({
          ...navMeta,
          // Stable ID for dedup — never duplicates same message event
          id: `${msg.chatId}-${msg.msgId}-t`,
          description: msg.content.length > 70 ? msg.content.slice(0, 70) + '…' : msg.content,
        });
      }

      markProcessed(`${msg.chatId}-${msg.msgId}`);
    }

    // Also mark low-confidence messages as processed (no Groq, no write)
    batch.filter(m => m._confidence < GROQ_THRESHOLD).forEach(m => {
      markProcessed(`${m.chatId}-${m.msgId}`);
    });

    // Tasks: write individually (no choice, subcollection)
    for (const t of newTasks) {
      await createFFTask(t).catch(() => {});
    }

    // CommandCenter: single read + single write
    if (needsWrite && (newCommits.length || newDecs.length || newTimeline.length)) {
      try {
        stats.current.firestoreReads++;
        const ccRef = doc(db, 'users', uid, 'commandCenter', 'data');
        const snap = await getDoc(ccRef);
        const existing = snap.exists() ? snap.data() : {};

        const dedup = (arr) => {
          const seen = new Set();
          return arr.filter(e => {
            const k = e.id || e.msg || e.description;
            if (!k || seen.has(k)) return false;
            seen.add(k);
            return true;
          });
        };

        const merged = {
          commitments: dedup([...newCommits, ...(existing.commitments || [])]).slice(0, 15),
          decisions:   dedup([...newDecs,    ...(existing.decisions   || [])]).slice(0, 15),
          timeline:    dedup([...newTimeline, ...(existing.timeline   || [])])
            .sort((a, b) => b.ts - a.ts).slice(0, 20),
          lastUpdated: Date.now(),
        };

        stats.current.firestoreWrites++;
        await setDoc(ccRef, merged, { merge: true });
      } catch {}
    }

    flushing.current = false;

    // If more items arrived while flushing, schedule another flush
    if (queue.current.length >= BATCH_SIZE) flushQueue();
    else if (queue.current.length > 0) scheduleBatchFlush();
  };

  const scheduleBatchFlush = () => {
    if (batchTimer.current) return;
    batchTimer.current = setTimeout(flushQueue, BATCH_WINDOW_MS);
  };

  // ── Ingest a new message ──────────────────────────────────────
  const ingestMessage = async (msgData) => {
    stats.current.received++;

    const { msgId, content, chatId, senderId, senderName, timestamp, sourceName, chatType } = msgData;
    const text = (content || '').trim();

    // 1. Cache check
    const key = `${chatId}-${msgId}`;
    if (processed.current.has(key)) { stats.current.skippedCache++; return; }

    // 2. Noise gate
    if (!text || text.length < MIN_MSG_LENGTH) {
      stats.current.skippedNoise++;
      markProcessed(key);
      return;
    }

    // 3. Unanswered question check (local, no Groq)
    await checkUnansweredQuestion({ msgId, content: text, senderId, senderName, timestamp, chatId, sourceName, chatType });

    // 4. Local confidence score
    const confidence = scoreMessageLocally(text);

    // 5. If below threshold, mark done — no Groq needed
    if (confidence < GROQ_THRESHOLD) {
      stats.current.skippedLowConf++;
      markProcessed(key);
      return;
    }

    // 6. Queue for batched Groq extraction
    queue.current.push({ ...msgData, _confidence: confidence });

    if (queue.current.length >= BATCH_SIZE) {
      clearTimeout(batchTimer.current);
      batchTimer.current = null;
      flushQueue();
    } else {
      scheduleBatchFlush();
    }
  };

  // ── Firestore subscriptions ───────────────────────────────────
  useEffect(() => {
    if (!uid) return;

    const unsubChats = onSnapshot(
      query(collection(db, 'chats'), where('participants', 'array-contains', uid)),
      snap => {
        snap.docChanges().forEach(change => {
          if (change.type !== 'modified' && change.type !== 'added') return;
          const chat = change.doc.data();
          const lm = chat.lastMessage;
          if (!lm) return;
          // Stable msgId: prefer explicit id, then timestamp seconds, then content hash
          // Never use Date.now() — it changes every snapshot and breaks deduplication
          const stableId = lm.id || lm.messageId ||
            (lm.timestamp?.seconds ? String(lm.timestamp.seconds) : null) ||
            String(Math.abs((lm.content || '').split('').reduce((h, c) => (Math.imul(31, h) + c.charCodeAt(0)) | 0, 0)));
          ingestMessage({
            msgId: stableId,
            content: lm.content || lm.text || '',
            senderId: lm.senderId,
            senderName: lm.senderName || 'Contact',
            timestamp: lm.timestamp,
            chatId: change.doc.id,
            sourceName: chat.name || 'Direct Chat',
            chatType: 'direct',
          });
        });
      }
    );

    const unsubGroups = onSnapshot(
      query(collection(db, 'groups'), where('members', 'array-contains', uid)),
      snap => {
        snap.docChanges().forEach(change => {
          if (change.type !== 'modified' && change.type !== 'added') return;
          const group = change.doc.data();
          const lm = group.lastMessage;
          if (!lm || lm.type === 'system') return;
          const stableId = lm.id || lm.messageId ||
            (lm.timestamp?.seconds ? String(lm.timestamp.seconds) : null) ||
            String(Math.abs((lm.content || '').split('').reduce((h, c) => (Math.imul(31, h) + c.charCodeAt(0)) | 0, 0)));
          ingestMessage({
            msgId: stableId,
            content: lm.content || lm.text || '',
            senderId: lm.senderId,
            senderName: lm.senderName || 'Member',
            timestamp: lm.timestamp,
            chatId: change.doc.id,
            sourceName: group.name || 'Group',
            chatType: 'group',
          });
        });
      }
    );

    return () => {
      clearTimeout(batchTimer.current);
      unsubChats();
      unsubGroups();
    };
  }, [uid]);
}

// ── Firestore helpers ─────────────────────────────────────────

async function saveWaitingItem({ uid, chatId, chatType, sourceName, senderName, text, timestamp, msgId }) {
  if (!uid || !chatId) return;
  try {
    const ccRef = doc(db, 'users', uid, 'commandCenter', 'data');
    const snap = await getDoc(ccRef);
    const existing = snap.exists() ? snap.data() : {};
    // Dedup: one entry per chatId — newer question replaces older
    const prev = (existing.waitingFor || []).filter(w => w.chatId !== chatId);
    const entry = {
      chatId,
      chatType: chatType || 'direct',
      source: sourceName || 'Chat',
      senderName: senderName || 'Someone',
      text: text ? (text.length > 100 ? text.slice(0, 100) + '…' : text) : '',
      ts: toMs(timestamp) || Date.now(),
      msgId: msgId || '',
    };
    await setDoc(ccRef, {
      waitingFor: [entry, ...prev].slice(0, 10),
      lastUpdated: Date.now(),
    }, { merge: true });
  } catch {
    // Silent — never crash the app over intelligence writes
  }
}
