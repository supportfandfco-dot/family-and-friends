// ═══════════════════════════════════════════════════════════════
//  useAIAutoPilot v3 — Contextual, conversation-aware Agent
//  Fixes: fetches real chat history, relationship context,
//  user profile, custom rules → no more generic "How can I help?"
// ═══════════════════════════════════════════════════════════════
import { useEffect, useRef } from 'react';
import {
  db, collection, query, where, onSnapshot,
  sendMessage, addDoc, serverTimestamp,
} from '../firebase';
import {
  doc, getDocs, orderBy, limit,
} from 'firebase/firestore';
import { askFast } from '../ai/groqClient';
import toast from 'react-hot-toast';

// ── Quiet hours ───────────────────────────────────────────────
function isQuietHours(quietHours) {
  if (!quietHours?.enabled) return false;
  const now  = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = (quietHours.start || '22:00').split(':').map(Number);
  const [eh, em] = (quietHours.end   || '07:00').split(':').map(Number);
  const start = sh * 60 + sm;
  const end   = eh * 60 + em;
  if (start > end) return mins >= start || mins < end;
  return mins >= start && mins < end;
}

// ── Per-contact mode resolution ───────────────────────────────
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

// ── Fetch recent conversation history ────────────────────────
async function getRecentHistory(chatId, limit_n = 12) {
  try {
    const q = query(
      collection(db, 'chats', chatId, 'messages'),
      orderBy('timestamp', 'desc'),
      limit(limit_n)
    );
    const snap = await getDocs(q);
    return snap.docs
      .map(d => d.data())
      .reverse() // chronological order
      .filter(m => m.content && m.type === 'text');
  } catch {
    return [];
  }
}

// ── Build a rich, context-aware prompt ───────────────────────
function buildAgentPrompt({ profile, chat, lastMsg, senderName, rules, history, actionMode, quiet }) {
  const userName    = profile?.name || 'Me';
  const chatName    = chat.name || senderName;
  const chatType    = chat.isGroup ? 'group' : 'direct';
  const userAbout   = profile?.about || '';
  const quietNote   = quiet ? '\nNOTE: Quiet hours are active. If generating a reply, mark mode as "approval".' : '';

  // Format history as readable transcript
  const transcript = history.length
    ? history.map(m => {
        const role = m.senderId === profile?.uid ? userName : (m.senderName || senderName);
        return `${role}: ${(m.content || '').slice(0, 200)}`;
      }).join('\n')
    : `${senderName}: ${lastMsg.content}`;

  return `You are the AI secretary for ${userName}.

YOUR USER PROFILE:
Name: ${userName}
${userAbout ? `About: ${userAbout}` : ''}

CONVERSATION: ${chatType === 'group' ? `Group: ${chatName}` : `With: ${senderName}`}

RECENT CHAT HISTORY (last ${history.length || 1} messages):
${transcript}

LATEST MESSAGE from ${senderName}:
"${lastMsg.content}"

YOUR AUTOMATION RULES:
${rules || 'No specific rules set — use good judgment based on the conversation.'}

TASK: Should you reply on behalf of ${userName}?

Rules for a good reply:
1. Read the full conversation above — understand the context, tone, relationship
2. Match the conversational style (casual if casual, formal if formal)
3. Reply specifically to what ${senderName} said — NO generic greetings like "How can I help you?"
4. Keep it natural and brief (1-3 sentences)
5. Sound like ${userName} would actually write, not a bot
6. If no rule matches and the message doesn't warrant a reply, return mode "off"${quietNote}

Return ONLY valid JSON (no markdown, no explanation):
{"mode":"off|approval|auto","reply":"your reply or null","reason":"brief reason"}`;
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
  const contactSettings = profile?.agentContactSettings || {};
  const effectiveMode   = resolveMode(mode, contactId, contactSettings);
  if (effectiveMode === 'disabled') return;

  const actionMode  = (quiet && effectiveMode === 'auto') ? 'approval' : effectiveMode;
  const rules       = profile?.autoPilotRules || 'Reply naturally and helpfully based on the conversation context.';
  const senderName  = lastMsg.senderName || 'Someone';

  // ── CRITICAL FIX: Fetch real conversation history ──────────
  const history = await getRecentHistory(chatId, 12);

  const prompt = buildAgentPrompt({
    profile: { ...profile, uid },
    chat,
    lastMsg,
    senderName,
    rules,
    history,
    actionMode,
    quiet,
  });

  try {
    const text  = await askFast(prompt, 'You are a context-aware AI secretary. Return ONLY valid JSON. Never produce generic greetings or robotic responses.');
    const clean = text.replace(/```json|```/g, '').trim();
    // Extract JSON even if model adds text around it
    const jsonStart = clean.indexOf('{');
    const jsonEnd   = clean.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) return;
    const res = JSON.parse(clean.slice(jsonStart, jsonEnd + 1));

    if (!res.reply || res.mode === 'off') return;

    const logEntry = {
      chatId,
      chatName:    chat.name || senderName,
      contactId,
      senderId:    uid,
      replyText:   res.reply,
      reason:      res.reason || 'Rule matched',
      triggerMsg:  lastMsg.content,
      senderName,
      effectiveMode: actionMode,
      quiet,
      timestamp:   serverTimestamp(),
    };

    if (res.mode === 'auto' && actionMode === 'auto') {
      // Tag message as AI-agent-sent so ChatWindow can show the indicator
      await sendMessage(chatId, uid, res.reply, 'text', {
        isAgentMsg: true,
        agentReason: res.reason || 'Auto rule matched',
      });
      await addDoc(collection(db, 'users', uid, 'agentLogs'), { ...logEntry, status: 'auto_sent' });
      toast(`🤖 Agent replied to ${senderName}`, { duration: 3000 });
    } else {
      await addDoc(collection(db, 'users', uid, 'agentLogs'), { ...logEntry, status: 'pending' });
      toast(`🤖 Agent has a reply queued for ${senderName} — review in AI Hub`, { duration: 4000 });
    }
  } catch {
    // Silent — never crash the app
  }
}
