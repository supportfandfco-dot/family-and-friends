// ═══════════════════════════════════════════════════════════════
//  useAIAutoPilot v2 — 4-mode Agent with per-contact overrides
//  Modes: disabled | approval | trusted_auto | full_auto
//  Per-contact: auto | approval | disabled | inherit (default)
//  Respects quiet hours. Logs every auto-sent message.
//  Extends existing approval flow — does not replace it.
// ═══════════════════════════════════════════════════════════════
import { useEffect, useRef } from 'react';
import {
  db, collection, query, where, onSnapshot,
  sendMessage, addDoc, serverTimestamp,
} from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { askFast } from '../ai/groqClient';
import toast from 'react-hot-toast';

// ── Quiet hours check ─────────────────────────────────────────
function isQuietHours(quietHours) {
  if (!quietHours?.enabled) return false;
  const now  = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = (quietHours.start || '22:00').split(':').map(Number);
  const [eh, em] = (quietHours.end   || '07:00').split(':').map(Number);
  const start = sh * 60 + sm;
  const end   = eh * 60 + em;
  // Handle overnight ranges (e.g. 22:00 → 07:00)
  if (start > end) return mins >= start || mins < end;
  return mins >= start && mins < end;
}

// ── Resolve effective mode for a specific contact/chat ────────
// Priority: per-contact override > global mode
function resolveMode(globalMode, contactId, contactSettings) {
  if (!globalMode || globalMode === 'disabled') return 'disabled';
  const override = contactSettings?.[contactId];
  if (override && override !== 'inherit') return override;
  // Map global modes to per-message behaviour
  if (globalMode === 'full_auto')    return 'auto';
  if (globalMode === 'trusted_auto') return 'auto';   // only for contacts without override
  if (globalMode === 'approval')     return 'approval';
  return 'disabled';
}

// ── Stable message key ────────────────────────────────────────
function stableMsgKey(chatId, lm) {
  return `${chatId}-${lm.id || lm.messageId || lm.timestamp?.seconds || ''}`;
}

// ── Main hook ─────────────────────────────────────────────────
export function useAIAutoPilot(uid, profile) {
  const processed = useRef(new Set());

  useEffect(() => {
    // Only run if agent is not fully disabled
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
  // Quiet hours — never auto-send, approval is fine to queue
  const quiet = isQuietHours(profile?.agentQuietHours);

  // Identify the contact (the other participant)
  const contactId = (chat.participants || []).find(p => p !== uid) || '';
  const contactSettings = profile?.agentContactSettings || {};

  // Resolve effective mode for this specific contact
  const effectiveMode = resolveMode(mode, contactId, contactSettings);
  if (effectiveMode === 'disabled') return;

  // If quiet hours, downgrade auto to approval
  const actionMode = (quiet && effectiveMode === 'auto') ? 'approval' : effectiveMode;

  const rules = profile?.autoPilotRules || '';
  if (!rules.trim()) return;

  const senderName = lastMsg.senderName || 'Someone';
  const chatType   = chat.isGroup ? 'group' : 'direct';
  const quietNote  = quiet ? ' (Note: quiet hours active — reply will be queued for approval)' : '';

  const prompt = `You are an AI Secretary for ${profile?.name || 'the user'}.
Automation rules:
${rules}

Context:
- Chat type: ${chatType}
- Chat name: ${chat.name || 'Direct Message'}
- Sender: ${senderName}
- Message: "${lastMsg.content}"
- Effective agent mode: ${actionMode}${quietNote}

Decide: should a reply be generated?
- If the message matches the rules, generate a reply.
- If no rule matches, return mode "off".
- Keep replies natural, brief (1-2 sentences max).

Return ONLY valid JSON (no markdown):
{"mode":"off|approval|auto","reply":"text or null","reason":"which rule triggered"}`;

  try {
    const text  = await askFast(prompt, 'AI responder. Return only valid JSON.');
    const clean = text.replace(/```json|```/g, '').trim();
    const res   = JSON.parse(clean);

    if (!res.reply || res.mode === 'off') return;

    if (res.mode === 'auto' && actionMode === 'auto') {
      // ── Full auto: send immediately + log ──────────────────
      await sendMessage(chatId, uid, res.reply, 'text');
      await addDoc(collection(db, 'users', uid, 'agentLogs'), {
        chatId,
        chatName:    chat.name || senderName,
        contactId,
        senderId:    uid,
        replyText:   res.reply,
        reason:      res.reason || 'Auto rule matched',
        triggerMsg:  lastMsg.content,
        senderName,
        effectiveMode: actionMode,
        status:      'auto_sent',
        quiet,
        timestamp:   serverTimestamp(),
      });
      toast(`🤖 Agent replied to ${senderName}`, { duration: 3000 });

    } else {
      // ── Approval required: queue log entry ─────────────────
      await addDoc(collection(db, 'users', uid, 'agentLogs'), {
        chatId,
        chatName:    chat.name || senderName,
        contactId,
        senderId:    uid,
        replyText:   res.reply,
        reason:      res.reason || (quiet ? 'Quiet hours — approval required' : 'Rule matched'),
        triggerMsg:  lastMsg.content,
        senderName,
        effectiveMode: actionMode,
        status:      'pending',
        quiet,
        timestamp:   serverTimestamp(),
      });
      toast(`🤖 Agent queued a reply for ${senderName}. Review in AI Hub.`, { duration: 4000 });
    }
  } catch {
    // Silent failure — never crash the app
  }
}
