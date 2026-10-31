// Lightweight, local conversation analysis. It gives the model a per-turn
// "situation brief" so it does not re-ask what it already knows, and so it can
// pitch the answer at the right depth. No extra API calls, no hidden reasoning.

import { ChatMessage } from '../../shared/types';

export type ConversationMode = 'casual' | 'technical' | 'educational' | 'serious' | 'debate';

const DEBATE_PATTERNS =
  /\b(i think|i believe|i reckon|agree|disagree|opinion|should we|is it better|best (way|solution|approach)|argue|point of view|what do you think)\b/i;
const SERIOUS_PATTERNS =
  /\b(health|medical|legal|lawyer|finance|invest|tax|death|safety|emergency|diagnosis|symptom|pain|doctor|hospital|fever|injury|prescription)\b/i;
const TECHNICAL_PATTERNS =
  /\b(code|coding|bug|error|exception|stack trace|api|typescript|javascript|python|react|electron|database|sql|git|deploy|build|compile|function|regex|docker|server|npm|memory leak|performance)\b/i;
const EDUCATIONAL_PATTERNS =
  /\b(explain|teach|learn|understand|what is|what are|how does|why does|difference between|tutorial|walk me through)\b/i;

const FOLLOW_UP_PATTERNS =
  /^(and|so|then|but|also|what about|how about|why|why not|how come|ok(ay)? so|right)\b/i;

const DEPTH_HINTS: Record<ConversationMode, string> = {
  casual: 'Keep it short and human — one or two sentences unless they ask for more.',
  technical: 'Be concrete and specific. Show code or exact steps where they help; skip preamble.',
  educational: 'Teach one concept at a time, build on what they already know, and check understanding.',
  serious: 'Be careful and respectful. No jokes, no flippancy, and state uncertainty clearly.',
  debate: 'Take a clear position, name the strongest counter-argument, and be willing to concede a point.',
};

export function detectMode(text: string): ConversationMode {
  const value = text || '';
  if (DEBATE_PATTERNS.test(value)) return 'debate';
  if (SERIOUS_PATTERNS.test(value)) return 'serious';
  if (TECHNICAL_PATTERNS.test(value)) return 'technical';
  if (EDUCATIONAL_PATTERNS.test(value)) return 'educational';
  return 'casual';
}

const FILLER_PREFIX =
  /^(hey|hi|hello|ok|okay|so|please|can you|could you|would you|i want to|i need to|i'd like to|help me|tell me|explain)\b[\s,]*/i;

/** A short, human-readable topic phrase for the turn. */
export function extractTopic(text: string, maxLength = 80): string {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';

  let withoutFiller = clean;
  for (let pass = 0; pass < 2; pass++) {
    withoutFiller = withoutFiller.replace(FILLER_PREFIX, '').trim();
  }
  withoutFiller = withoutFiller || clean;
  const firstSentence = withoutFiller.split(/(?<=[.!?])\s/)[0] || withoutFiller;
  const topic = firstSentence.replace(/[?!.]+$/, '').trim();

  return topic.length > maxLength ? `${topic.slice(0, maxLength - 1).trim()}…` : topic;
}

/** True when the new message clearly depends on what was just discussed. */
export function isFollowUp(text: string, history: ChatMessage[]): boolean {
  const clean = (text || '').trim();
  if (!clean || history.length === 0) return false;

  if (FOLLOW_UP_PATTERNS.test(clean)) return true;

  const words = clean.split(/\s+/);
  const hasReferentialPronoun = /\b(it|that|this|those|these|they|them|the same)\b/i.test(clean);
  return words.length <= 6 && hasReferentialPronoun;
}

/** Constraints the user already stated, so the model doesn't ask again. */
export function extractConstraints(history: ChatMessage[]): string[] {
  const constraints: string[] = [];
  const patterns = [
    /\b(?:i (?:prefer|want|need|use|don't use|do not use)|only|must|should not|don't|do not|never|always|deadline|budget)\b/i,
  ];

  for (const message of history.filter((entry) => entry.role === 'user').slice(-8)) {
    if (patterns[0].test(message.text)) {
      const sentence = message.text.split(/(?<=[.!?])\s/)[0].trim();
      if (sentence.length > 12 && sentence.length < 160) constraints.push(sentence);
    }
  }

  return Array.from(new Set(constraints)).slice(-3);
}

export interface ConversationBrief {
  mode: ConversationMode;
  topic: string;
  followUp: boolean;
  previousTopic: string;
  constraints: string[];
  text: string;
}

/** Builds the situation block injected into the system instruction each turn. */
export function buildConversationBrief(
  history: ChatMessage[],
  currentMessage: string
): ConversationBrief {
  const recent = (history || []).filter((entry) => entry.role !== 'system');
  const mode = detectMode(currentMessage);
  const topic = extractTopic(currentMessage);
  const followUp = isFollowUp(currentMessage, recent);

  const previousUserMessage = [...recent].reverse().find((entry) => entry.role === 'user');
  const previousTopic = previousEntryTopic(previousUserMessage?.text || '');
  const constraints = extractConstraints(recent);

  const lines = [
    'SITUATION THIS TURN (internal context — never mention this block):',
    `- Conversation mode: ${mode}`,
  ];

  if (topic) lines.push(`- The user is asking about: ${topic}`);
  if (followUp && previousTopic) lines.push(`- This continues the earlier topic: ${previousTopic}`);
  if (constraints.length > 0) lines.push(`- Already stated by the user: ${constraints.join(' | ')}`);
  lines.push(`- Response depth: ${DEPTH_HINTS[mode]}`);

  return {
    mode,
    topic,
    followUp,
    previousTopic,
    constraints,
    text: lines.join('\n'),
  };
}

function previousEntryTopic(text: string): string {
  const topic = extractTopic(text);
  return topic.length > 60 ? `${topic.slice(0, 59)}…` : topic;
}
