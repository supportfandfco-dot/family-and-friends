// ═══════════════════════════════════════════════════════════
//  Layer 1 — Local Intelligence Engine
//  Real NLP logic. No gimmicks. No fake outputs.
//  Every function produces genuinely useful results.
// ═══════════════════════════════════════════════════════════
import { toMs } from '../utils/timestamp';

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
  // Field name was wrong (checked .createdAt, but messages actually use
  // .timestamp) and only handled a Firestore Timestamp's .seconds, not the
  // ISO-string format newer messages now use — so this recency gate never
  // actually triggered regardless of how old the last message really was.
  const lastMsgMs = toMs(lastMsg?.timestamp);
  if (lastMsgMs && (Date.now() - lastMsgMs) / 1000 / 3600 > 24) return 'quiet';

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

  const raw = (lastIncoming.content || '').trim();
  if (!raw || raw.length < 2) return [];
  const text = raw.toLowerCase();

  const sentiment = detectSentiment(text);
  const urgent    = detectUrgency(text);
  const question  = isQuestion(raw);

  // ── Urgent ────────────────────────────────────────────────────
  if (urgent) return ['On my way!', "I'll be right there", 'Calling you now'];

  // ── Specific content matches (before generic question handling) ─
  // Sharing something (file, photo, link, notes)
  if (/\b(sent|shared|uploaded|posting|here('s| is)|check (this|it)|look at this|see this)\b/.test(text)) {
    return ['Got it, thanks!', 'Received 👍', 'Looks good!'];
  }

  // Arrival / location
  if (/\b(reached|arrived|i('m| am) here|outside|downstairs|at the (gate|door|office|school|college))\b/.test(text)) {
    return ['Coming down!', 'Be there in 2 mins', 'On my way!'];
  }

  // Done / completed something
  if (/\b(done|finished|completed|submitted|sent it|uploaded it|it'?s done)\b/.test(text)) {
    return ['Great, thanks!', 'Saw it 👍', 'Perfect!'];
  }

  // Asking about availability / time
  if (/\b(free|available|busy|when (are|r) (you|u)|what time|kab)\b/.test(text)) {
    return ["I'm free after 5", 'Let me check my schedule', 'Not sure yet, will confirm'];
  }

  // Asking for something specific
  if (/\b(can you (send|share|bring|give|forward|drop)|could you|please (send|share|bring))\b/.test(text)) {
    return ['Sure, sending now', 'Give me a moment', "I'll send it shortly"];
  }

  // Plans / meetup
  if (/\b(meet|meetup|coming over|plan|tonight|tomorrow|this (weekend|week|evening|morning))\b/.test(text)) {
    return ["Sounds good, I'm in!", "I'll be there", 'Let me confirm and get back to you'];
  }

  // ── Questions ─────────────────────────────────────────────────
  if (question) {
    if (/\bwhen\b/.test(text))
      return ['Give me 10 minutes', "I'll let you know soon", 'Probably around 5pm'];
    if (/\bwhere\b/.test(text))
      return ["I'm at home", 'Send me the location', 'On my way'];
    if (/\bhow are\b|how'?s it going|how r u\b/.test(text))
      return ["I'm good! You?", 'Doing well 😊', 'All good, what about you?'];
    if (/\b(can|could|will|would) you\b/.test(text))
      return ['Yes, can do!', 'Let me check and confirm', 'Sure, give me a sec'];
    if (/\bwhat\b/.test(text))
      return ["Let me check", "Not sure, I'll find out", 'Good question, give me a moment'];
    if (/\bdid you\b/.test(text))
      return ['Yes, just did!', 'Not yet, doing it now', 'Almost done'];
    return ["Let me check", 'Give me a moment', "I'll get back to you"];
  }

  // ── Sentiment-based ───────────────────────────────────────────
  if (sentiment === 'positive') {
    if (/\bthank(s| you)\b/.test(text)) return ["You're welcome! 😊", 'Anytime!', 'Happy to help 🙏'];
    if (/\bhaha|lol|😂|😆|funny\b/.test(text)) return ['😂', 'Haha right!', 'Lmaooo 😂'];
    if (/\bawesome|great|amazing|nice|perfect|fantastic\b/.test(text)) return ["Thanks! 😊", "Glad you like it!", 'Great!'];
    return ["That's great! 😊", 'Awesome!', '👍'];
  }

  if (sentiment === 'negative') {
    if (/\bsorry\b/.test(text)) return ['No worries!', "It's okay 😊", "Don't worry about it"];
    if (/\bstressed|worried|anxious|scared|upset\b/.test(text)) return ["I'm here for you", "That's tough, hang in there", 'Want to talk?'];
    return ['I understand', "That's tough", 'Hope things get better'];
  }

  // ── Greetings ─────────────────────────────────────────────────
  if (/^(hi|hey|hello|good (morning|evening|night|afternoon)|sup|wassup|yo)\b/.test(text)) {
    const hr = new Date().getHours();
    if (hr < 12) return ['Good morning! ☀️', 'Hey! How are you?', 'Morning!'];
    if (hr < 17) return ['Hey there! 👋', 'Hello! 😊', "Hi! What's up?"];
    return ['Hey! 😊', 'Good evening!', "Hey, what's up?"];
  }

  // ── Confirmations ─────────────────────────────────────────────
  if (/^(ok|okay|sure|yes|yep|yeah|alright|sounds good|got it|noted|cool)\b/.test(text)) {
    return ['👍', 'Perfect!', 'Sounds good to me'];
  }

  // ── Food ──────────────────────────────────────────────────────
  if (/\b(food|eat|lunch|dinner|breakfast|hungry|snack|order)\b/.test(text)) {
    return ["I'm in! 🍽️", 'What are you thinking?', "Sounds good, let's go!"];
  }

  // Default
  return ['Got it 👍', 'Okay', 'Sure!'];
}

// ── Local group pulse ─────────────────────────────────────────
// ── Meeting intelligence patterns ────────────────────────────
const DECISION_PATTERNS = [
  /\b(decided|we('re| are) going with|let'?s go with|finali[sz]ed?|agreed|confirmed|it'?s (settled|decided|confirmed)|going ahead with|we('ll| will) use|chosen|picked)\b/i,
  /\b(plan is|the answer is|conclusion is|we('ve| have) decided)\b/i,
  // Schedule changes, cancellations, postponements
  /\b(cancel(led|ed)?|postpone[d]?|reschedule[d]?|moved to|shifted to|called off|pushed (to|back)|no (class|school|meeting|practice|session|lecture|lab|test|exam))\b/i,
  // Deadline modifications
  /\b(extended (to|till|until)|new deadline|deadline (moved|changed|shifted|extended|is now)|now due|submission (moved|extended|postponed)|last date (is|changed to)|due date (changed|moved|is now))\b/i,
];
const COMMITMENT_PATTERNS = [
  /\b(i('ll| will)|i('m| am) going to|i can do|i'?ll (send|share|bring|do|handle|take care|check|get|make|call|message|update|fix|add|upload|prepare|complete|finish|submit|help))\b/i,
  /\b(on it|leave it to me|i'?ve got (it|this)|let me|i'?ll take care)\b/i,
];
const DEADLINE_PATTERNS = [
  /\b(by (tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week|end of day|eod|noon|morning|evening|night|\d+(am|pm)|\d+:\d+))\b/i,
  /\b(due (on|by|tomorrow|tonight|this (week|friday|monday)))\b/i,
  /\b(before (class|the (meeting|exam|test|submission|deadline|call)))\b/i,
  /\b(submit(ted)? by|hand in by|deadline is)\b/i,
  // Deadline modifications (NEW)
  /\b(extended (to|till|until)|new deadline|deadline (moved|changed|is now)|now due|submission (moved|extended)|last date (is|changed to)|due date (changed|is now))\b/i,
  // Standalone urgent time refs (NEW)
  /\b(tonight|tomorrow morning|tomorrow evening|by end of (day|week)|this (friday|monday|sunday|saturday|thursday|wednesday|tuesday))\b/i,
];
const ACTION_PATTERNS = [
  /\b(bring|send|share|upload|post|submit|call|message|ping|remind|check|update|fix|add|prepare|complete|finish|do|handle|follow up|get back)\b/i,
];
const TOPIC_SHIFT_PATTERNS = [
  /\b(btw|by the way|also|another thing|one more thing|changing topic|speaking of|on that note|regarding|about the)\b/i,
];

function extractSenderName(msg) {
  return msg.senderName || msg.displayName || 'Someone';
}

function msgText(msg) {
  return (msg.content || msg.text || '').trim();
}

function confidenceScore(text, patterns) {
  let hits = 0;
  for (const p of patterns) if (p.test(text)) hits++;
  return Math.min(hits / patterns.length, 1);
}

// Returns extracted decisions with the originating message reference
function extractDecisions(messages) {
  const results = [];
  for (const msg of messages) {
    const text = msgText(msg);
    if (!text || text.length < 8) continue;
    const score = confidenceScore(text, DECISION_PATTERNS);
    if (score > 0) {
      // Clean up: strip filler words, capitalise
      const clean = text.length > 90 ? text.slice(0, 90) + '…' : text;
      results.push({
        text: clean,
        sender: extractSenderName(msg),
        confidence: score,
        msgRef: text.slice(0, 60),
      });
    }
  }
  // Sort by confidence, deduplicate by first 40 chars
  const seen = new Set();
  return results
    .sort((a, b) => b.confidence - a.confidence)
    .filter(d => { const k = d.text.slice(0, 40); if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, 5);
}

// Returns action items with assignee detected from context
function extractActionItems(messages) {
  const results = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const text = msgText(msg);
    if (!text || text.length < 6) continue;

    const isCommit = COMMITMENT_PATTERNS.some(p => p.test(text));
    const isAction = ACTION_PATTERNS.some(p => p.test(text));

    if (!isCommit && !isAction) continue;

    // Assignee: if it's a commitment ("I'll do X") → sender is assignee
    // If it's an instruction ("Rahul, bring X") → look for a name mention
    let assignee = isCommit ? extractSenderName(msg) : null;
    if (!assignee) {
      // Try to extract name from "Name, please do X" or "@Name do X"
      const nameMatch = text.match(/^([A-Z][a-z]{2,})[,!]?\s/);
      if (nameMatch) assignee = nameMatch[1];
    }

    // Deadline: scan this message and the next for deadline patterns
    const window = [text, msgText(messages[i + 1] || {})].join(' ');
    let deadline = null;
    for (const dp of DEADLINE_PATTERNS) {
      const m = window.match(dp);
      if (m) { deadline = m[0].replace(/^by /i, '').trim(); break; }
    }

    const clean = text.length > 90 ? text.slice(0, 90) + '…' : text;
    results.push({
      text: clean,
      assignee: assignee || null,
      deadline,
      sender: extractSenderName(msg),
      msgRef: text.slice(0, 60),
    });
  }

  const seen = new Set();
  return results
    .filter(a => { const k = a.text.slice(0, 40); if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, 6);
}

// Returns pending questions that have no answer
function extractPendingQuestions(messages) {
  const results = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const text = msgText(msg);
    if (!isQuestion(text)) continue;

    // Check if anyone replied to this question in next 5 messages
    const nextMsgs = messages.slice(i + 1, i + 6);
    const answered = nextMsgs.some(m =>
      m.senderId !== msg.senderId && msgText(m).length > 6
    );
    if (!answered) {
      results.push({
        text: text.length > 90 ? text.slice(0, 90) + '…' : text,
        askedBy: extractSenderName(msg),
        msgRef: text.slice(0, 60),
      });
    }
  }
  const seen = new Set();
  return results
    .filter(q => { const k = q.text.slice(0, 40); if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, 4);
}

// Detect deadline mentions across all messages
function extractDeadlines(messages) {
  const results = [];
  for (const msg of messages) {
    const text = msgText(msg);
    for (const dp of DEADLINE_PATTERNS) {
      const m = text.match(dp);
      if (m) {
        // Include surrounding context (up to 80 chars of the message)
        const clean = text.length > 80 ? text.slice(0, 80) + '…' : text;
        results.push({
          text: clean,
          deadline: m[0].replace(/^by /i, '').trim(),
          sender: extractSenderName(msg),
          msgRef: text.slice(0, 60),
        });
        break; // one deadline per message
      }
    }
  }
  const seen = new Set();
  return results
    .filter(d => { const k = d.deadline; if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, 4);
}

// Detect topic clusters by finding noun-heavy segments
function extractTopics(messages) {
  // Use keywords but also look for proper nouns / capitalized words
  const keywords = extractKeywords(messages, 8);

  // Also find capitalized words that aren't at sentence start (likely proper nouns / subjects)
  const properNouns = new Set();
  messages.forEach(msg => {
    const words = msgText(msg).split(/\s+/);
    words.slice(1).forEach(w => {
      if (/^[A-Z][a-z]{2,}$/.test(w) && !STOP_WORDS.has(w.toLowerCase())) {
        properNouns.add(w);
      }
    });
  });

  // Merge: proper nouns first (more specific), then keywords
  const combined = [...properNouns].slice(0, 3).concat(
    keywords.filter(k => ![...properNouns].map(p => p.toLowerCase()).includes(k))
  );
  return combined.slice(0, 5);
}

export function localGroupPulse(messages, groupName) {
  if (!messages.length) return {
    summary: `${groupName} has no recent activity.`,
    mood: 'quiet', topics: [], action_items: [], decisions: [],
    pending_questions: [], deadlines: [], unanswered: [], isLocal: true,
  };

  const recent = messages.slice(-40); // analyze last 40 messages
  const mood = analyzeConversationMood(recent);

  const decisions      = extractDecisions(recent);
  const action_items   = extractActionItems(recent);
  const pending_questions = extractPendingQuestions(recent);
  const deadlines      = extractDeadlines(recent);
  const topics         = extractTopics(recent);
  const unanswered     = pending_questions.map(q => q.text); // backward compat

  // Build summary from real extracted data — never generic
  let summary = '';
  const parts = [];

  if (decisions.length)        parts.push(`${decisions.length} decision${decisions.length > 1 ? 's' : ''} made`);
  if (action_items.length)     parts.push(`${action_items.length} action item${action_items.length > 1 ? 's' : ''} assigned`);
  if (pending_questions.length) parts.push(`${pending_questions.length} question${pending_questions.length > 1 ? 's' : ''} pending`);
  if (deadlines.length)        parts.push(`${deadlines.length} deadline${deadlines.length > 1 ? 's' : ''} mentioned`);

  if (parts.length) {
    summary = parts.join(', ') + '.';
    // Prepend the most important decision or action as a headline
    if (decisions[0]) summary = `"${decisions[0].text}" — plus ${parts.slice(1).join(', ') || 'more'}.`;
    else if (action_items[0]) summary = `${action_items[0].assignee || 'Someone'} will ${action_items[0].text.slice(0, 60)}${action_items[0].text.length > 60 ? '…' : ''}.`;
  } else {
    // Fallback to mood-based but still specific
    const topicStr = topics.slice(0, 2).join(' and ');
    const uniqueSenders = new Set(recent.map(m => m.senderId)).size;
    switch (mood) {
      case 'urgent': summary = `Urgent messages in ${groupName} — check immediately.`; break;
      case 'active': summary = `Active discussion${topicStr ? ` about ${topicStr}` : ''} with ${uniqueSenders} participants.`; break;
      default:       summary = topicStr ? `Conversation about ${topicStr}.` : `${groupName} — no major decisions yet.`;
    }
  }

  return {
    summary,
    mood,
    topics,
    decisions:        decisions.map(d => `${d.sender}: "${d.text}"`),
    action_items:     action_items.map(a => a.assignee ? `${a.assignee}: ${a.text}${a.deadline ? ` (by ${a.deadline})` : ''}` : a.text),
    pending_questions: pending_questions.map(q => `${q.askedBy}: "${q.text}"`),
    deadlines:        deadlines.map(d => `${d.text}${d.deadline ? ` [${d.deadline}]` : ''}`),
    // Raw objects for Groq refinement
    _raw: { decisions, action_items, pending_questions, deadlines, topics },
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
  // Same field-name/format fix as analyzeConversationMood above —
  // lastMessage's real field is .timestamp, and toMs() handles both a
  // Firestore Timestamp (old) and ISO string (new).
  const lastMsgTime = toMs(chat.lastMessage?.timestamp) / 1000;
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

      // Recency bonus — newer messages score higher. Same field-name/format
      // fix as above — messages use .timestamp, not .createdAt.
      const msgTime = toMs(m.timestamp) / 1000;
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
