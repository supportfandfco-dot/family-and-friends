// ═══════════════════════════════════════════════════════════
//  voiceActions.js — Real task execution for Voice AI.
//
//  WHY THIS EXISTS:
//  Voice AI previously only called overlayAsk(), a pure text
//  generation pipeline with zero tool-calling. When a user asked
//  it to "create a task" or "remind me to X", the LLM had no way
//  to actually do that — it could only generate plausible-sounding
//  text CLAIMING it did something, which is fake. This module adds
//  a real, scoped intent classifier + executor so genuine actions
//  (currently: task creation) actually happen in Firestore.
//
//  Design: a lightweight classification call decides whether the
//  utterance is actionable. If yes, we extract structured fields
//  and call the REAL createFFTask() function. If no (or extraction
//  fails), we fall through to normal conversational overlayAsk().
// ═══════════════════════════════════════════════════════════
import { askFast } from './groqClient';
import { createFFTask } from '../firebase';

const INTENT_SYSTEM = `You classify voice commands for a messaging app's assistant.
Respond with ONLY valid JSON, no markdown, no explanation.

If the user is asking to create/add a task, reminder, or to-do item, respond:
{"intent":"create_task","title":"<short task title>","dueHint":"<any time mentioned, or null>"}

Otherwise (general question, conversation, anything else), respond:
{"intent":"none"}`;

/**
 * Attempts to detect and execute a real action from a voice utterance.
 * Returns { handled: true, responseText } if an action was executed,
 * or { handled: false } if the utterance should go to normal conversation.
 */
export async function tryExecuteVoiceAction(utterance, uid) {
  if (!uid || !utterance?.trim()) return { handled: false };

  let raw;
  try {
    raw = await askFast(utterance, INTENT_SYSTEM);
  } catch {
    return { handled: false }; // classification failed — fall through to normal chat
  }

  let parsed;
  try {
    // Strip markdown fences if the model added them despite instructions
    const clean = raw.replace(/```json|```/g, '').trim();
    parsed = JSON.parse(clean);
  } catch {
    return { handled: false };
  }

  if (parsed?.intent === 'create_task' && parsed.title?.trim()) {
    try {
      await createFFTask({
        title: parsed.title.trim(),
        dueHint: parsed.dueHint || null,
        source: 'voice',
      });
      return {
        handled: true,
        responseText: `Done — I've added "${parsed.title.trim()}" to your tasks.`,
      };
    } catch {
      return {
        handled: true,
        responseText: `I tried to add that task but ran into an error — please try again or add it manually.`,
      };
    }
  }

  return { handled: false };
}
