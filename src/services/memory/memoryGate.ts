/**
 * FIMA V1 — Memory Intelligence Gate
 *
 * Every potential memory passes through this gate BEFORE any AI extraction call.
 * Purpose: aggressively filter irrelevant content to protect quality and reduce cost.
 *
 * Four decisions:
 *   IGNORE    — do not store (greetings, trivial exchanges, temporary moods)
 *   TEMPORARY — store in working memory only (current debug sessions, in-progress tasks)
 *   SAVE      — permanently store as new memory
 *   UPDATE    — merge with or supersede an existing memory
 */

import { GateDecision, GateResult } from '../../shared/types';

// ── Patterns that signal an exchange is not worth remembering ───────────────

const GREETING_PATTERNS = [
  /^\s*(hi|hello|hey|howdy|sup|what'?s up|good\s*(morning|afternoon|evening|night)|yo|hiya|greetings)[^a-z]*$/i,
  /^\s*(okay|ok|sure|alright|thanks|thank you|bye|goodbye|see you|ttyl|lol|haha|lmao|wow|cool|nice|great)[^a-z]*$/i,
  /^\s*(yes|no|maybe|yep|nope|yup|nah)\s*[.!?]*\s*$/i,
];

const TRIVIAL_PATTERNS = [
  /^\s*[.!?,;:]+\s*$/,          // pure punctuation
  /^\d+\s*$/,                   // pure number
  /^\s*\.{2,}\s*$/,             // "..." or similar
];

const TEMPORARY_PATTERNS = [
  /\b(currently|right now|at the moment|today only|just now|at this point)\b/i,
  /\bi('?m| am)\s+(tired|busy|hungry|sick|bored|happy|sad|stressed)\b/i,
  /\b(debugging|testing|trying to|working on)\b.{3,80}/i,
  /\b(let me|let's|gonna|going to)\b/i,
];

const SAVE_PATTERNS = [
  /\b(remember|note|keep in mind|don'?t forget)\s+(that\s+)?/i,
  /\bmy name is\b/i,
  /\b(i live|i stay) in\b/i,
  /\bi('?m| am) (?:a |an )\w*(?:ist|er|or|ian|tor|eer|ant|ent)\b/i,
  /\bi (prefer|like|love|enjoy|hate|dislike|always|never)\b/i,
  /\bfrom now on\b/i,
  /\b(always|never) (reply|respond|answer|use|do)\b/i,
  /\bcall me\b/i,
  /\bi work (at|for|on)\b/i,
  /\bmy (project|app|system|tool|product) is\b/i,
];

// ── Exchange-level quality signals ──────────────────────────────────────────

function isLikelyGreeting(text: string): boolean {
  if (text.length > 120) return false;
  return GREETING_PATTERNS.some((p) => p.test(text));
}

function isTrivial(text: string): boolean {
  if (text.length < 3) return true;
  return TRIVIAL_PATTERNS.some((p) => p.test(text));
}

function hasTemporaryCues(text: string): boolean {
  return TEMPORARY_PATTERNS.some((p) => p.test(text));
}

function hasExplicitSaveCue(text: string): boolean {
  return SAVE_PATTERNS.some((p) => p.test(text));
}

/** Word count excluding stopwords. */
function meaningfulWords(text: string): number {
  const stopwords = new Set(['i', 'a', 'an', 'the', 'is', 'are', 'was', 'do', 'did', 'can', 'to', 'of', 'in', 'on', 'it', 'this', 'that', 'and', 'or', 'but', 'for', 'with']);
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !stopwords.has(w))
    .length;
}

export interface GateInput {
  userText: string;
  assistantText: string;
  /** L0 = instant local response (no AI). These rarely carry durable info. */
  isL0Response?: boolean;
  /** Whether the AI used explicit save_memory tool (always SAVE). */
  isExplicitToolSave?: boolean;
}

/**
 * Memory Intelligence Gate — the first and most critical filter.
 *
 * Returns a GateResult with:
 *   decision: 'save' | 'update' | 'temporary' | 'ignore'
 *   reason: human-readable explanation for the activity log
 *   confidence: 0.0–1.0
 */
export function evaluateGate(input: GateInput): GateResult {
  const { userText, assistantText, isL0Response, isExplicitToolSave } = input;
  const user = (userText || '').trim();
  const assistant = (assistantText || '').trim();

  // ── Explicit tool save → always SAVE ───────────────────────────────────────
  if (isExplicitToolSave) {
    return { decision: 'save', reason: 'Explicit save_memory tool used', confidence: 1.0 };
  }

  // ── Completely empty ───────────────────────────────────────────────────────
  if (!user && !assistant) {
    return { decision: 'ignore', reason: 'Empty exchange', confidence: 1.0 };
  }

  // ── L0 fast-path responses almost never carry durable info ─────────────────
  if (isL0Response) {
    // Still check for explicit cues
    if (hasExplicitSaveCue(user)) {
      return { decision: 'save', reason: 'Explicit save cue in L0 response', confidence: 0.9 };
    }
    return { decision: 'ignore', reason: 'L0 fast-path response — no durable content expected', confidence: 0.95 };
  }

  // ── Trivially short ───────────────────────────────────────────────────────
  if (isTrivial(user)) {
    return { decision: 'ignore', reason: 'Trivial content — only punctuation or numbers', confidence: 1.0 };
  }

  // ── Greeting / social phrase ───────────────────────────────────────────────
  if (isLikelyGreeting(user)) {
    return { decision: 'ignore', reason: 'Greeting or social phrase — no durable information', confidence: 0.95 };
  }

  // ── Very short with no meaningful words ───────────────────────────────────
  const wordCount = meaningfulWords(user);
  if (wordCount < 3 && !hasExplicitSaveCue(user)) {
    return { decision: 'ignore', reason: `Too short (${wordCount} meaningful words) — unlikely to contain durable information`, confidence: 0.85 };
  }

  // ── Explicit save request → SAVE (high priority) ──────────────────────────
  if (hasExplicitSaveCue(user)) {
    return { decision: 'save', reason: 'Explicit save cue detected ("remember", name, location, preference, instruction)', confidence: 0.92 };
  }

  // ── Temporary / in-progress cues → TEMPORARY ──────────────────────────────
  if (hasTemporaryCues(user) && wordCount < 15) {
    return { decision: 'temporary', reason: 'Temporary/in-progress cue detected — storing in working memory only', confidence: 0.75 };
  }

  // ── Medium-length exchange — worth evaluating with AI extraction ───────────
  if (wordCount >= 5) {
    return { decision: 'save', reason: 'Substantive exchange — forwarding to AI extraction for durable information', confidence: 0.6 };
  }

  // ── Default: ignore ────────────────────────────────────────────────────────
  return { decision: 'ignore', reason: 'No significant extractable information detected', confidence: 0.7 };
}

/** Returns true if the exchange should skip AI extraction entirely. */
export function shouldSkipExtraction(input: GateInput): boolean {
  const result = evaluateGate(input);
  return result.decision === 'ignore';
}

/** Returns true if content is explicitly temporary (working memory only). */
export function isTemporaryOnly(input: GateInput): boolean {
  const result = evaluateGate(input);
  return result.decision === 'temporary';
}
