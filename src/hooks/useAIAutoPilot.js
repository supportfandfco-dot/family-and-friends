// ═══════════════════════════════════════════════════════════════
//  useAIAutoPilot v4 — AI Secretary (not a chatbot)
//
//  Philosophy:
//  1. CLASSIFY the message first (Question/Request/Info/Schedule/etc)
//  2. EXTRACT intelligence (tasks, commitments, decisions, timeline)
//  3. DECIDE whether a reply is actually warranted
//  4. BUILD a contextual reply only when genuinely needed
//  5. Never reply to casual chat, greetings, reactions unless rules say so
// ═══════════════════════════════════════════════════════════════
import { useEffect, useRef } from 'react';
import {
  db, collection, query, where, onSnapshot,
  sendMessage, addDoc, serverTimestamp, createFFTask,
} from '../firebase';
import {
  doc, getDoc, setDoc, getDocs, orderBy, limit,
} from 'firebase/firestore';
import { askFast, askDeep } from '../ai/groqClient';
import { scoreMessageLocally } from './useIntelligenceEngine';
import toast from 'react-hot-toast';

// ── Message categories that rarely need a reply ───────────────
const NO_REPLY_CATEGORIES = new Set([
  'greeting', 'reaction', 'casual_chat', 'information', 'schedule_change'
]);

// ── Quiet hours ───────────────────────────────────────────────
function isQuietHours(q) {
  if (!q?.enabled) return false;
  const now  = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = (q.start || '22:00').split(':').map(Number);
  const [eh, em] = (q.end   || '07:00').split(':').map(Number);
  const start = sh * 60 + sm, end = eh * 60 + em;
  if (start > end) return mins >= start || mins < end;
  return mins >= start && mins < end;
}

// ── Resolve per-contact mode ──────────────────────────────────
function resolveMode(globalMode, contactId, contactSettings) {
  if (!globalMode || globalMode === 'disabled') return 'disabled';
  const override = contactSettings?.[contactId];
  if (override && override !== 'inherit') return override;
  if (globalMode === 'full_auto')    return 'auto';
  if (globalMode === 'trusted_auto') return 'auto';
  if (globalMode === 'approval')     return 'approval';
  return 'disabled';
}

function stableMsgKey(chatId, lm) {
  return `${chatId}-${lm.id || lm.messageId || lm.timestamp?.seconds || ''}`;
}

// ── Fetch recent history ──────────────────────────────────────
async function getHistory(chatId, n = 15) {
  try {
    const snap = await getDocs(query(
      collection(db, 'chats', chatId, 'messages'),
      orderBy('timestamp', 'desc'), limit(n)
    ));
    return snap.docs.map(d => d.data()).reverse()
      .filter(m => m.content && m.type === 'text');
  } catch { return []; }
}

// ── Local message classifier (fast, no API) ───────────────────
function classifyLocally(text) {
  const t = text.toLowerCase().trim();

  // Greetings — never reply needed unless rule says so
  if (/^(hi|hey|hello|good (morning|evening|night|afternoon)|sup|wassup|yo)\b/.test(t) && t.length < 30)
    return 'greeting';

  // Reactions
  if (/^(ok|okay|sure|yes|yep|yeah|no|nope|haha|lol|😂|👍|❤️|🙏|nice|cool|great|noted|got it)[\s!.]*$/.test(t))
    return 'reaction';

  // Questions requiring action
  if (/\b(can you|could you|will you|would you|please send|please share|please bring|send me|share with me)\b/.test(t))
    return 'request';

  if (t.endsWith('?') || /^(what|when|where|who|why|how|is|are|do|did|can|will)\b/.test(t))
    return 'question';

  // Schedule changes
  if (/\b(cancel|postpone|reschedule|moved to|shifted|no (class|test|meeting)|called off)\b/.test(t))
    return 'schedule_change';

  // Commitments
  if (/\b(i will|i'll|i promise|i'm going to|i can)\b/.test(t))
    return 'commitment';

  // Decisions
  if (/\b(decided|agreed|confirmed|going with|finalized)\b/.test(t))
    return 'decision';

  // Urgency
  if (/\b(urgent|emergency|asap|right now|immediately|call me|sos)\b/.test(t))
    return 'urgent';

  // Information sharing
  if (/\b(fyi|just so you know|heads up|reminder|note that|btw)\b/.test(t))
    return 'information';

  return 'casual_chat';
}

// ── Build structured classification + extraction prompt ────────
function buildSecretaryPrompt({ userName, senderName, transcript, lastMsg, rules, category, quiet, chatName }) {
  const unavailableMsg = `${userName} is currently unavailable. I've noted your message and they'll see it when they're back.`;
  const quietNote = quiet
    ? `\nUser is in QUIET HOURS. If replying, use unavailability message: "${unavailableMsg}"`
    : '';

  return `You are the AI Secretary for ${userName}. You manage their messages intelligently.

CONVERSATION with ${senderName} in "${chatName}":
${transcript}

LATEST MESSAGE (${category.toUpperCase()}) from ${senderName}:
"${lastMsg.content}"

USER'S RULES:
${rules}
${quietNote}

YOUR JOB:
1. Extract any actionable intelligence (tasks, commitments, deadlines, decisions)
2. Decide IF and WHAT to reply — only reply when genuinely useful
3. Never say "How can I help?" or "What's going on?" or generic openers

REPLY GUIDELINES BY CATEGORY:
- greeting/reaction/casual_chat: reply ONLY if a rule explicitly covers it
- information/schedule_change: usually NO reply unless rules say otherwise
- request: acknowledge briefly or ask a clarifying question if needed
- question: answer if you know it from rules/context, otherwise note you'll pass it on
- urgent: always reply with urgency (call prompt or immediate note)
- commitment/decision: usually NO reply, just log it

WHEN USER IS UNAVAILABLE (no rules covering this message):
Reply: "${unavailableMsg}"

Return ONLY valid JSON:
{
  "category": "${category}",
  "tasks": ["exact task from message if any"],
  "commitments": ["exact commitment from message if any"],
  "decisions": ["exact decision from message if any"],
  "deadlines": ["exact deadline from message if any"],
  "should_reply": true/false,
  "reply": "natural reply text or null",
  "reply_reason": "why replying or not replying",
  "waiting_for": "if sender is waiting for something from user, describe it or null",
  "handover_note": "brief note for while-you-were-away summary or null",
  "confidence": 0.0-1.0
}`;
}

// ── Save intelligence items to Firestore ──────────────────────
async function saveIntelligence({ uid, chatId, chatType, sourceName, senderName, msgId, ts, res }) {
  if (!uid) return;
  const navMeta = {
    sourceType: chatType || 'direct',
    sourceId: chatId,
    chatId,
    chatType: chatType || 'direct',
    messageId: msgId,
    senderName,
    source: sourceName,
    ts: ts || Date.now(),
    confidenceScore: Math.round((res.confidence || 0.7) * 100),
    confidenceLabel: (res.confidence || 0.7) >= 0.75 ? 'high' : (res.confidence || 0.7) >= 0.5 ? 'medium' : 'low',
  };

  // Tasks
  for (const t of (res.tasks || [])) {
    if (t && t.length > 4) {
      await createFFTask({
        title: t,
        source: sourceName,
        chatId,
        type: chatType || 'direct',
        messageId: msgId,
        senderId: senderName,
        confidenceScore: navMeta.confidenceScore,
        confidenceLabel: navMeta.confidenceLabel,
      }).catch(() => {});
    }
  }

  // Command center data
  const hasCC = (res.commitments?.length || res.decisions?.length || res.waiting_for || res.handover_note);
  if (!hasCC) return;

  try {
    const ccRef = doc(db, 'users', uid, 'commandCenter', 'data');
    const snap = await getDoc(ccRef);
    const existing = snap.exists() ? snap.data() : {};
    const dedup = (arr) => {
      const seen = new Set();
      return arr.filter(e => { const k = e.id || e.msg; if (!k || seen.has(k)) return false; seen.add(k); return true; });
    };

    const newCommits = (res.commitments || []).filter(c => c?.length > 4).map(c => ({
      ...navMeta, msg: c, id: `${chatId}-${msgId}-c`,
    }));
    const newDecs = (res.decisions || []).filter(d => d?.length > 4).map(d => ({
      ...navMeta, msg: d, id: `${chatId}-${msgId}-d`,
    }));

    // Waiting for
    let waitingFor = existing.waitingFor || [];
    if (res.waiting_for) {
      waitingFor = [
        { chatId, chatType: chatType || 'direct', source: sourceName, senderName, text: res.waiting_for, ts: ts || Date.now(), msgId },
        ...waitingFor.filter(w => w.chatId !== chatId),
      ].slice(0, 10);
    }

    // Handover notes (while you were away)
    let handover = existing.handover || [];
    if (res.handover_note) {
      handover = [
        { ...navMeta, note: res.handover_note, senderName, id: `${chatId}-${msgId}-h` },
        ...handover.filter(h => h.id !== `${chatId}-${msgId}-h`),
      ].slice(0, 15);
    }

    await setDoc(ccRef, {
      commitments: dedup([...newCommits, ...(existing.commitments || [])]).slice(0, 15),
      decisions:   dedup([...newDecs,    ...(existing.decisions   || [])]).slice(0, 15),
      waitingFor,
      handover,
      lastUpdated: Date.now(),
    }, { merge: true });
  } catch {}
}

// ── Main hook ─────────────────────────────────────────────────
export function useAIAutoPilot(uid, profile) {
  const processed = useRef(new Set());

  useEffect(() => {
    const mode = profile?.agentMode || (profile?.autoPilotEnabled ? 'approval' : 'disabled');
    if (!uid || mode === 'disabled') return;

    const q = query(collection(db, 'chats'), where('participants', 'array-contains', uid));
    const unsub = onSnapshot(q, snap => {
      snap.docChanges().forEach(change => {
        if (change.type !== 'modified' && change.type !== 'added') return;
        const chat    = change.doc.data();
        const lastMsg = chat.lastMessage;
        const chatId  = change.doc.id;
        if (!lastMsg || lastMsg.senderId === uid) return;
        const key = stableMsgKey(chatId, lastMsg);
        if (processed.current.has(key)) return;
        processed.current.add(key);
        handleMessage({ uid, profile, chatId, chat, lastMsg, mode });
      });
    });
    return unsub;
  }, [uid, profile?.agentMode, profile?.autoPilotEnabled, profile?.autoPilotRules,
      profile?.agentContactSettings, profile?.agentQuietHours]);
}

// ── Per-message handler ───────────────────────────────────────
async function handleMessage({ uid, profile, chatId, chat, lastMsg, mode }) {
  const quiet       = isQuietHours(profile?.agentQuietHours);
  const contactId   = (chat.participants || []).find(p => p !== uid) || '';
  const effectiveMode = resolveMode(mode, contactId, profile?.agentContactSettings || {});
  if (effectiveMode === 'disabled') return;

  const actionMode = (quiet && effectiveMode === 'auto') ? 'approval' : effectiveMode;
  const rules      = profile?.autoPilotRules || '';
  const senderName = lastMsg.senderName || 'Someone';
  const userName   = profile?.name || 'the user';
  const content    = lastMsg.content || '';

  // Step 1: Local classification (instant, no API)
  const category = classifyLocally(content);

  // Step 2: Check if worth processing at all
  const localScore = scoreMessageLocally(content);
  const hasRules   = rules.trim().length > 0;

  // Skip if no rules AND message is low-signal AND not urgent
  if (!hasRules && localScore < 0.2 && category !== 'urgent' && category !== 'request') return;

  // Step 3: Fetch conversation history
  const history = await getHistory(chatId, 15);
  const transcript = history.length
    ? history.map(m => `${m.senderId === uid ? userName : (m.senderName || senderName)}: ${(m.content||'').slice(0,200)}`).join('\n')
    : `${senderName}: ${content}`;

  // Step 4: AI classification + extraction + reply decision
  const prompt = buildSecretaryPrompt({
    userName,
    senderName,
    transcript,
    lastMsg,
    rules: rules || 'Use your best judgment. Extract tasks and commitments. Reply only when genuinely needed.',
    category,
    quiet,
    chatName: chat.name || senderName,
  });

  try {
    const text  = await askFast(prompt, 'You are a precise AI secretary. Return ONLY valid JSON. No markdown.');
    const clean = text.replace(/```(?:json)?/g, '').trim();
    const js = clean.slice(clean.indexOf('{'), clean.lastIndexOf('}') + 1);
    const res = JSON.parse(js);

    const msgTs = lastMsg.timestamp?.seconds ? lastMsg.timestamp.seconds * 1000 : Date.now();
    const msgId = lastMsg.id || lastMsg.messageId || `${chatId}-${msgTs}`;

    // Step 5: Save intelligence items regardless of reply
    await saveIntelligence({
      uid, chatId,
      chatType: 'direct',
      sourceName: chat.name || senderName,
      senderName, msgId, ts: msgTs, res,
    });

    // Step 6: Handle reply if warranted
    if (!res.should_reply || !res.reply) return;

    const logEntry = {
      chatId,
      chatName:    chat.name || senderName,
      contactId,
      senderId:    uid,
      replyText:   res.reply,
      category:    res.category || category,
      reason:      res.reply_reason || 'Rule matched',
      triggerMsg:  content,
      senderName,
      effectiveMode: actionMode,
      quiet,
      timestamp:   serverTimestamp(),
    };

    if (res.reply && actionMode === 'auto') {
      await sendMessage(chatId, uid, res.reply, 'text', {
        isAgentMsg: true,
        agentReason: res.reply_reason || category,
      }, profile?.name || '');
      await addDoc(collection(db, 'users', uid, 'agentLogs'), { ...logEntry, status: 'auto_sent' });
      toast(`🤖 Agent replied to ${senderName}`, { duration: 3000 });
    } else {
      await addDoc(collection(db, 'users', uid, 'agentLogs'), { ...logEntry, status: 'pending' });
      toast(`🤖 Agent queued reply for ${senderName}`, { duration: 3500 });
    }
  } catch {
    // Silent — never crash
  }
}
