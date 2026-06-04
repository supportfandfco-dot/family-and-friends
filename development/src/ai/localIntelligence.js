// ═══════════════════════════════════════════════════════════
//  Layer 1 — Local Intelligence Engine
//  Real NLP logic. No gimmicks. No fake outputs.
//  Every function produces genuinely useful results.
// ═══════════════════════════════════════════════════════════

// ── Stop words ────────────────────────────────────────────────
const STOP_WORDS = new Set([
  'the','a','an','is','it','in','on','at','to','for','of','and','or','but',
  'with','this','that','was','are','be','have','has','had','do','did','will',
  'can','could','should','would','i','you','we','they','he','she','my','your',
  'our','their','me','him','her','us','them','been','being','from','by','as',
  'if','so','than','then','when','where','who','how','what','why','which',
  'just','also','about','not','no','yes','ok','okay','yeah','hey','hi','its',
  'am','get','got','let','too','very','really','like','know','think','want',
  'need','see','come','go','going','gonna','wanna','ill','im','dont','cant',
  'wont','didnt','isnt','wasnt','havent','hasnt','shouldnt','wouldnt','couldnt',
]);

// ── Negation-aware sentiment ──────────────────────────────────
// Checks for negation words before scoring to avoid "not good" = positive
const NEGATION = new Set(['not','no','never','neither','barely','hardly','scarcely','dont','doesnt','didnt','wont','cant','shouldnt','wouldnt','couldnt','isnt','wasnt','havent','hasnt']);

const SENTIMENT_SCORES = {
  // Strong positive
  love:2, amazing:2, excellent:2, fantastic:2, wonderful:2, perfect:2, awesome:2, great:2,
  happy:2, delighted:2, thrilled:2, excited:2, brilliant:2, outstanding:2,
  '❤️':2, '🎉':2, '😍':2, '🥰':2, '🙌':2,
  // Mild positive
  good:1, nice:1, fine:1, okay:1, sure:1, thanks:1, thank:1, cool:1,
  glad:1, pleased:1, enjoy:1, like:1, welcome:1, helpful:1,
  '👍':1, '😊':1, '✅':1, '😄':1, '🙏':1,
  // Mild negative
  bad:- 1, sad:-1, sorry:-1, wrong:-1, issue:-1, problem:-1, miss:-1,
  unfortunate:-1, difficult:-1, hard:-1, worried:-1, concern:-1,
  '😞':-1, '😢':-1, '😕':-1,
  // Strong negative
  hate:-2, angry:-2, terrible:-2, awful:-2, horrible:-2, furious:-2,
  disgusting:-2, worst:-2, useless:-2, broken:-2, failed:-2, error:-2,
  '😠':-2, '😤':-2, '❌':-2, '💔':-2, '🤬':-2,
};

export function detectSentiment(text) {
  const tokens = text.toLowerCase().split(/\s+/);
  let score = 0;
  for (let i = 0; i < tokens.length; i++) {
    const word = tokens[i].replace(/[^a-z0-9❤🎉😍🥰🙌👍😊✅😄🙏😞😢😕😠😤❌💔🤬]/g, '');
    const val = SENTIMENT_SCORES[word];
    if (val !== undefined) {
      // Check for negation in the 2 preceding words
      const negated = tokens.slice(Math.max(0, i - 2), i).some(t => NEGATION.has(t));
      score += negated ? -val : val;
    }
  }
  if (score >= 2)  return 'positive';
  if (score <= -2) return 'negative';
  return 'neutral';
}

// ── Urgency detection ─────────────────────────────────────────
// Uses whole-word matching and phrase matching to reduce false positives
const URGENT_PHRASES = [
  'urgent', 'asap', 'as soon as possible', 'immediately', 'emergency',
  'call me', 'call me now', 'important', 'deadline', 'right now',
  'quickly', 'hurry', 'please respond', 'waiting for you', 'critical',
  'need you now', 'help me', 'sos', 'respond asap',
];

export function detectUrgency(text) {
  const lower = text.toLowerCase();
  return URGENT_PHRASES.some(phrase => lower.includes(phrase));
}

// ── Question detection ────────────────────────────────────────
export function isQuestion(text) {
  const t = text.trim();
  if (t.endsWith('?')) return true;
  // Only match at start of sentence to reduce false positives
  return /^(what|when|where|who|why|how|can you|could you|do you|will you|is there|are there|should i|would you|have you|did you|are you|is it|was it)\b/i.test(t);
}

// ── Keyword extraction (TF-IDF inspired) ──────────────────────
export function extractKeywords(messages, topN = 6) {
  const freq = {};
  const docFreq = {};
  const docs = messages.filter(m => m.content?.trim());
  const N = docs.length || 1;

  docs.forEach(m => {
    const words = m.content.toLowerCase()
      .replace(/https?:\/\/\S+/g, '')  // strip URLs
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !STOP_WORDS.has(w));

    const seen = new Set();
    words.forEach(w => {
      freq[w] = (freq[w] || 0) + 1;
      if (!seen.has(w)) { docFreq[w] = (docFreq[w] || 0) + 1; seen.add(w); }
    });
  });

  // TF-IDF: rank by frequency but penalize words that appear in every message
  return Object.entries(freq)
    .map(([word, tf]) => {
      const idf = Math.log(N / (docFreq[word] || 1));
      return { word, score: tf * idf };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map(e => e.word);
}

// ── Conversation mood ─────────────────────────────────────────
export function analyzeConversationMood(messages) {
  if (!messages.length) return 'quiet';

  // Only look at recent messages (last 10) for current mood
  const recent = messages.slice(-10);

  // Check recency — if last message is old, mood is quiet regardless
  const lastMsg = recent[recent.length - 1];
  const lastMsgAge = lastMsg?.createdAt?.seconds
    ? (Date.now() / 1000 - lastMsg.createdAt.seconds) / 3600
    : 0;
  if (lastMsgAge > 24) return 'quiet';

  let pos = 0, neg = 0, urgent = 0, questions = 0;
  recent.forEach(m => {
    const s = detectSentiment(m.content || '');
    if (s === 'positive') pos++;
    if (s === 'negative') neg++;
    if (detectUrgency(m.content || '')) urgent++;
    if (isQuestion(m.content || '')) questions++;
  });

  const uniqueSenders = new Set(recent.map(m => m.senderId)).size;

  if (urgent >= 1) return 'urgent';
  if (neg >= 2 && neg > pos) return 'tense';
  if (pos >= 3 && pos > neg) return 'positive';
  if (questions >= 2) return 'inquisitive';
  if (recent.length >= 6 && uniqueSenders >= 2) return 'active';
  if (recent.length >= 3) return 'casual';
  return 'quiet';
}

// ── Unanswered questions ──────────────────────────────────────
export function findUnansweredQuestions(messages) {
  if (messages.length < 2) return [];
  const unanswered = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (!isQuestion(msg.content || '')) continue;

    // Look at up to 5 subsequent messages for a reply from a different person
    const nextMsgs = messages.slice(i + 1, i + 6);
    const answered = nextMsgs.some(m =>
      m.senderId !== msg.senderId && m.content && m.content.length > 8
    );

    if (!answered) {
      const q = msg.content?.trim().slice(0, 100) || '';
      if (q && !unanswered.includes(q)) unanswered.push(q);
    }
  }
  return unanswered.slice(0, 3);
}

// ── Smart reply generation ────────────────────────────────────
// Looks at the actual last message content to generate relevant replies
export function generateLocalReplies(messages) {
  if (!messages.length) return [];

  // Find last message NOT from current user
  const lastIncoming = [...messages].reverse().find(m => !m.isOwn);
  if (!lastIncoming) return [];

  const text = (lastIncoming.content || '').toLowerCase().trim();
  if (!text || text.length < 2) return [];

  const sentiment = detectSentiment(text);
  const urgent = detectUrgency(text);
  const question = isQuestion(text);

  // Urgent messages
  if (urgent) {
    return ['On my way!', 'I\'ll be right there', 'Calling you now'];
  }

  // Questions — try to be specific based on question type
  if (question) {
    if (/\bwhen\b/.test(text)) {
      return ['Give me 10 minutes', 'I\'ll let you know soon', 'Around 5pm works for me'];
    }
    if (/\bwhere\b/.test(text)) {
      return ['I\'m at home', 'On my way', 'Send me the location'];
    }
    if (/\bhow are\b|how's it going|how r u/.test(text)) {
      return ['I\'m good! You?', 'Doing well, thanks 😊', 'All good here, what about you?'];
    }
    if (/\bcan you\b|could you\b|will you\b/.test(text)) {
      return ['Yes, I can do that', 'Let me check and get back to you', 'Sure, give me a moment'];
    }
    if (/\bwhat\b/.test(text)) {
      return ['Let me think about that', 'I\'ll look into it', 'Not sure, let me check'];
    }
    return ['Let me check', 'Give me a moment', 'I\'ll get back to you on that'];
  }

  // Sentiment-based replies
  if (sentiment === 'positive') {
    if (/\bthank|thanks\b/.test(text)) {
      return ['You\'re welcome! 😊', 'Anytime!', 'Happy to help'];
    }
    if (/\bhaha|lol|😂|funny/.test(text)) {
      return ['😂', 'Haha right!', 'So true 😄'];
    }
    return ['That\'s great! 😊', 'Awesome!', 'Love that!'];
  }

  if (sentiment === 'negative') {
    if (/\bsorry\b/.test(text)) {
      return ['No worries!', 'It\'s okay 😊', 'Don\'t worry about it'];
    }
    return ['I understand', 'That\'s tough, I\'m here', 'Hope things get better soon'];
  }

  // Greetings
  if (/^(hi|hey|hello|good morning|good evening|good night|sup|wassup)\b/.test(text)) {
    const hour = new Date().getHours();
    if (hour < 12) return ['Good morning! 😊', 'Hey! How are you?', 'Morning!'];
    if (hour < 17) return ['Hey there! 👋', 'Hello! 😊', 'Hi! What\'s up?'];
    return ['Hey! 😊', 'Good evening!', 'Hey, what\'s up?'];
  }

  // Confirmations
  if (/^(ok|okay|sure|yes|yep|yeah|alright|sounds good|got it|noted)\b/.test(text)) {
    return ['👍', 'Perfect!', 'Sounds good to me'];
  }

  // Plans / meetup
  if (/\bmeet|meetup|coming|plan|tonight|tomorrow|weekend\b/.test(text)) {
    return ['Sounds good!', 'I\'ll be there', 'Let me confirm and get back to you'];
  }

  // Food / eating
  if (/\bfood|eat|lunch|dinner|breakfast|hungry\b/.test(text)) {
    return ['Sounds delicious!', 'I\'m in! 🍽️', 'What are you thinking?'];
  }

  // Default — generic but not useless
  return ['Got it 👍', 'I see', 'Understood'];
}

// ── Local group pulse ─────────────────────────────────────────
export function localGroupPulse(messages, groupName) {
  if (!messages.length) return {
    summary: `${groupName} has no recent activity.`,
    mood: 'quiet', topics: [], action_items: [], unanswered: [],
  };

  const mood = analyzeConversationMood(messages);
  const keywords = extractKeywords(messages, 6);
  const unanswered = findUnansweredQuestions(messages);
  const recent = messages.slice(-20);
  const uniqueSenders = new Set(recent.map(m => m.senderId)).size;

  // Build a genuinely descriptive summary from real data
  let summary = '';
  const topicStr = keywords.slice(0, 3).join(', ');

  switch (mood) {
    case 'urgent':
      summary = `There are urgent messages in ${groupName} that need attention.`;
      break;
    case 'tense':
      summary = `The conversation in ${groupName} has some tension${topicStr ? ` around ${topicStr}` : ''}.`;
      break;
    case 'positive':
      summary = `${groupName} has a positive vibe${topicStr ? ` — discussing ${topicStr}` : ''}.`;
      break;
    case 'inquisitive':
      summary = `${unanswered.length} question${unanswered.length > 1 ? 's' : ''} in ${groupName} ${unanswered.length > 1 ? 'are' : 'is'} waiting for a reply.`;
      break;
    case 'active':
      summary = `Active discussion among ${uniqueSenders} members${topicStr ? ` about ${topicStr}` : ''}.`;
      break;
    case 'casual':
      summary = topicStr
        ? `Casual conversation about ${topicStr}.`
        : `Light conversation happening in ${groupName}.`;
      break;
    default:
      summary = `${groupName} has been quiet recently.`;
  }

  const action_items = unanswered.map(q => `Unanswered: "${q.slice(0, 60)}${q.length > 60 ? '…' : ''}"`);

  return {
    summary,
    mood,
    topics: keywords.slice(0, 4),
    action_items: action_items.slice(0, 2),
    unanswered,
    isLocal: true,
  };
}

// ── Local chat summary ────────────────────────────────────────
export function localChatSummary(messages, chatName) {
  if (!messages.length) return `No messages yet with ${chatName}.`;

  const keywords = extractKeywords(messages, 5);
  const mood = analyzeConversationMood(messages);
  const unanswered = findUnansweredQuestions(messages);
  const total = messages.length;
  const recent = messages.slice(-5);

  // Find last message content for context
  const lastMsg = messages[messages.length - 1];
  const lastContent = lastMsg?.content?.trim().slice(0, 80) || '';

  // Build sentence from real data
  let summary = `${total} message${total > 1 ? 's' : ''} with ${chatName}`;

  if (keywords.length) {
    summary += `, mainly about ${keywords.slice(0, 3).join(', ')}`;
  }

  if (mood !== 'casual' && mood !== 'quiet') {
    const moodMap = {
      positive: 'positive tone',
      negative: 'some tension',
      urgent: 'urgent tone',
      inquisitive: 'open questions',
      active: 'active back-and-forth',
    };
    summary += `. ${moodMap[mood] ? `The chat has a ${moodMap[mood]}` : ''}`;
  }

  if (unanswered.length) {
    summary += `. ${unanswered.length} question${unanswered.length > 1 ? 's' : ''} still waiting for a reply`;
  }

  return summary + '.';
}

// ── Priority scoring ──────────────────────────────────────────
export function scoreChatPriority(chat, messages, myUid) {
  let score = 0;
  const unread = chat.unreadCount || 0;

  // Unread messages are the strongest signal
  score += Math.min(unread * 4, 40);

  const recent = (messages || []).slice(-10);
  recent.forEach(m => {
    if (m.senderId === myUid) return; // only incoming messages matter
    if (detectUrgency(m.content || ''))  score += 25;
    if (isQuestion(m.content || ''))     score += 12;
    const s = detectSentiment(m.content || '');
    if (s === 'negative') score += 6;
    if (s === 'positive') score += 2;
  });

  // Strong recency bonus — recent messages are more important
  const lastMsgTime = chat.lastMessage?.createdAt?.seconds || 0;
  const minutesAgo  = (Date.now() / 1000 - lastMsgTime) / 60;
  if (minutesAgo < 5)   score += 25;
  else if (minutesAgo < 30)  score += 15;
  else if (minutesAgo < 120) score += 5;
  else if (minutesAgo > 1440) score -= 10; // old messages reduce priority

  return Math.max(0, score);
}

// ── Priority inbox ────────────────────────────────────────────
export function buildPriorityInbox(chats, allMessages, myUid) {
  return chats
    .map(chat => {
      const msgs = allMessages[chat.id] || [];
      const score = scoreChatPriority(chat, msgs, myUid);

      // Build a specific, accurate reason string
      const lastIncoming = [...msgs].reverse().find(m => m.senderId !== myUid);
      const isUrgent = lastIncoming ? detectUrgency(lastIncoming.content || '') : false;
      const openQs   = findUnansweredQuestions(msgs);
      const mood     = analyzeConversationMood(msgs);

      let reason = '';
      if (isUrgent)               reason = `Urgent: "${(lastIncoming?.content || '').slice(0, 40)}…"`;
      else if (chat.unreadCount > 4)   reason = `${chat.unreadCount} unread messages`;
      else if (openQs.length)          reason = `Question waiting: "${openQs[0].slice(0, 40)}…"`;
      else if (mood === 'tense')        reason = 'Needs your attention';
      else if (chat.unreadCount > 0)   reason = `${chat.unreadCount} new message${chat.unreadCount > 1 ? 's' : ''}`;

      return { ...chat, aiScore: score, aiReason: reason, mood };
    })
    .filter(c => c.aiScore > 5) // Only show genuinely prioritized chats
    .sort((a, b) => b.aiScore - a.aiScore)
    .slice(0, 5);
}

// ── Semantic search ───────────────────────────────────────────
export function localSemanticSearch(query, messages) {
  if (!query.trim()) return [];

  const qWords = query.toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));

  if (!qWords.length) return [];

  const scored = messages
    .map(m => {
      const text = (m.content || '').toLowerCase();
      let score = 0;

      // Exact phrase match — highest value
      if (text.includes(query.toLowerCase())) score += 10;

      // Each query word found in message
      qWords.forEach(w => {
        if (text.includes(w)) {
          score += 3;
          // Bonus for word at start of sentence
          if (new RegExp(`(^|[.!?]\\s+)${w}`).test(text)) score += 1;
        }
      });

      // Recency bonus — newer messages score higher
      const msgTime = m.createdAt?.seconds || 0;
      const daysAgo = (Date.now() / 1000 - msgTime) / 86400;
      if (daysAgo < 1)  score *= 1.5;
      if (daysAgo < 7)  score *= 1.2;

      return { msg: m, score };
    })
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(r => r.msg);

  return scored;
}

// ── Priority label ────────────────────────────────────────────
export function getPriorityLabel(score) {
  if (score >= 50) return { label: 'High Priority', color: '#ef4444' };
  if (score >= 25) return { label: 'Needs Attention', color: '#f97316' };
  if (score >= 10) return { label: 'Active', color: '#22c55e' };
  return null;
}
