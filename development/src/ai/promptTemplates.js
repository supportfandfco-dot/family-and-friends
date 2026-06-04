// ═══════════════════════════════════════════════════════════
//  Prompt Templates — Consistent, focused prompts per task
// ═══════════════════════════════════════════════════════════

export const SYSTEM_BASE = 'You are an intelligent assistant built into Family & Friends, a private messaging app. Be helpful, concise, and natural. Never mention AI, models, or technology.';

export const TEMPLATES = {
  smartReplies: (conversation, userName) =>
    `You are helping ${userName} reply to this conversation:\n\n${conversation}\n\nWrite 3 short, natural reply options that match the tone. Return ONLY a JSON array: ["reply1","reply2","reply3"]. No explanation.`,

  chatSummary: (transcript, chatName) =>
    `Summarize this conversation with ${chatName} in 2 sentences. Focus on what was discussed and the outcome.\n\n${transcript}`,

  groupSummary: (transcript, groupName) =>
    `Summarize this group chat "${groupName}" in 2 sentences. Mention key topics and mood.\n\n${transcript}`,

  groupPulse: (transcript, groupName) =>
    `Analyze this group chat "${groupName}":\n${transcript}\n\nReturn ONLY valid JSON:\n{"summary":"2 sentence summary","mood":"one word","topics":["topic1","topic2"],"action_items":["item1"]}`,

  overlayQuestion: (question, context) =>
    context
      ? `Context from the conversation:\n${context}\n\nQuestion: ${question}\n\nAnswer based on the conversation context. Be specific and helpful.`
      : question,

  synthesis: (question, responses) =>
    `You received these responses to: "${question.slice(0, 200)}"\n\n${responses}\n\nWrite ONE unified answer. Extract the strongest points. Remove repetition. Be concise. Do not mention sources or models. Start directly with the answer.`,

  captionGenerate: () =>
    'Write a short, engaging caption for this image. Max 10 words. Return ONLY the caption text.',

  captionEnhance: (caption) =>
    `Improve this caption to be more engaging: "${caption}". Max 12 words. Return ONLY the improved caption.`,

  statusEnhance: (text) =>
    `Make this status message more expressive: "${text}". Keep it natural and under 15 words. Return ONLY the improved text.`,
};
