// ═══════════════════════════════════════════════════════════
//  Prompt Templates — Consistent, focused prompts per task
// ═══════════════════════════════════════════════════════════

export const SYSTEM_BASE = 'You are an intelligent assistant built into Family & Friends, a private messaging app. Be helpful, concise, and natural. Never mention AI, models, or technology.';

export const TEMPLATES = {
  smartActions: (conversation, userName) =>
    `You are generating smart reply suggestions for ${userName} in a chat app.

Conversation (most recent last):
${conversation}

Generate exactly 4 SHORT reply suggestions that ${userName} would naturally send in response to the LAST message above.
Rules:
- Every suggestion must be a direct, natural reply to what was just said
- Max 6 words each — these are quick-tap replies, not paragraphs
- Match the tone (casual if casual, serious if serious)  
- If the last message is a question, answer it or acknowledge it
- If someone shared something, react to it specifically
- DO NOT generate generic actions like "Call Aman" or "Schedule meeting" unless the message literally asks about scheduling/calling
- DO NOT use the sender's name in the reply
- Return ONLY a JSON array of strings (no objects, no types): ["reply1", "reply2", "reply3", "reply4"]`,

  chatSummary: (transcript, chatName) =>
    `Summarize this conversation with ${chatName} in 2 sentences. Focus on what was discussed and the outcome.\n\n${transcript}`,

  groupSummary: (transcript, groupName) =>
    `Summarize this group chat "${groupName}" in 2 sentences. Mention key topics and mood.\n\n${transcript}`,

  groupPulse: (transcript, groupName, localData) => {
    const localHints = localData ? `
Local extraction already found:
- Decisions: ${JSON.stringify(localData.decisions || [])}
- Action items: ${JSON.stringify(localData.action_items || [])}
- Pending questions: ${JSON.stringify(localData.pending_questions || [])}
- Deadlines: ${JSON.stringify(localData.deadlines || [])}

Refine these if needed, but ONLY use what is traceable to the messages above. Do not invent anything not in the chat.
` : '';
    return `You are a meeting intelligence system analyzing a group chat named "${groupName}".

MESSAGES (most recent ${transcript.split('\n').length}):
${transcript}
${localHints}
Extract ONLY what is explicitly stated in the messages. Every item must be traceable to actual message content.

Return EXACTLY this JSON. Leave arrays empty [] if nothing found. No markdown, no explanation.
{
  "summary": "1-2 sentence specific summary of what was discussed and decided. Include names and specifics. Never say how many members there are.",
  "topics": ["Specific topic 1", "Specific topic 2"],
  "decisions": ["Name: exact decision made", "Name: another decision"],
  "action_items": ["Name will do X by Y", "Name needs to bring Z"],
  "pending_questions": ["Name asked: exact question text"],
  "deadlines": ["Specific deadline from the chat"]
}

Rules:
- decisions: only if someone explicitly agreed, confirmed, or finalized something
- action_items: only if someone committed to doing something or was asked to do something specific
- pending_questions: only if a question was asked and NOT answered in the chat
- deadlines: only explicit time references (tomorrow, Friday, 5pm etc)
- Use the actual sender names from the transcript
- Bad: "Group discussed project" Good: "Rahul will share notes by tomorrow"`;
  },

  overlayQuestion: (question, context) =>
    context
      ? `Context from the conversation:\n${context}\n\nQuestion: ${question}\n\nAnswer based on the conversation context. Be specific and helpful.`
      : question,

  synthesis: (question, responses) =>
    `You received these responses to: "${question.slice(0, 200)}"\n\n${responses}\n\nWrite ONE unified answer. Extract the strongest points. Remove repetition. Be concise. Do not mention sources or models. Start directly with the answer.`,

  captionGenerate: () =>
    'Extract intelligent data from this media. Provide OCR text if any, describe the scene, extract assignments/receipts if applicable, and summarize documents if present. Keep it concise.',

  captionEnhance: (caption) =>
    `Improve this caption to be more engaging: "${caption}". Max 12 words. Return ONLY the improved caption.`,

  statusEnhance: (text) =>
    `Make this status message more expressive: "${text}". Keep it natural and under 15 words. Return ONLY the improved text.`,
};
