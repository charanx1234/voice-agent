/**
 * FIMA V1 — Memory Conflict Resolution Engine
 *
 * Detects when new information conflicts with an existing memory and
 * determines the appropriate resolution:
 *
 *   - OVERWRITE:      New information is reliable; supersede the old.
 *   - PENDING_REVIEW: Uncertain conflict; flag both for user review.
 *   - IGNORE_NEW:     Existing is more reliable; don't update.
 *   - MERGE:          Both have partial truth; combine.
 *
 * Rules (in priority order):
 *   1. Explicit user correction ("actually", "I was wrong", "that's changed") → OVERWRITE
 *   2. Same subject key → evaluate confidence
 *   3. High importance existing vs low confidence new → PENDING_REVIEW
 *   4. Planned change stated (not verified) → PENDING_REVIEW
 *   5. Verified new information → OVERWRITE
 */

import { MemoryItem } from '../../shared/types';

export type ConflictResolution = 'overwrite' | 'pending_review' | 'ignore_new' | 'merge';

export interface ConflictResult {
  resolution: ConflictResolution;
  reason: string;
  confidence: number;
}

const CORRECTION_PATTERNS = [
  /\b(actually|correction:|i was wrong|that('?s| is) (wrong|incorrect|outdated)|that('?s| has) changed)\b/i,
  /\b(no,? (it('?s| is)|the|my)|wait,? (no|actually))\b/i,
  /\b(let me correct|let me update|i meant)\b/i,
  /\b(now it('?s| is)|changed to|updated to|switched to|migrated to)\b/i,
];

const PLAN_PATTERNS = [
  /\b(planning to|going to|will|want to|thinking of|might|considering)\b/i,
  /\b(not yet|haven'?t|will implement|todo|future)\b/i,
];

function isExplicitCorrection(text: string): boolean {
  return CORRECTION_PATTERNS.some((p) => p.test(text));
}

function isPlanOnly(text: string): boolean {
  return PLAN_PATTERNS.some((p) => p.test(text));
}

export function resolveConflict(
  existing: MemoryItem,
  newContent: string,
  newImportance: number,
  sourceText: string
): ConflictResult {
  // ── Explicit correction → OVERWRITE ───────────────────────────────────────
  if (isExplicitCorrection(sourceText)) {
    return {
      resolution: 'overwrite',
      reason: 'Explicit correction detected ("actually", "that\'s changed", etc.) — superseding old memory',
      confidence: 0.95,
    };
  }

  // ── Stated plan (not verified) → never overwrite a verified existing memory
  if (isPlanOnly(newContent) || isPlanOnly(sourceText)) {
    return {
      resolution: 'pending_review',
      reason: 'New information appears to be a plan or intention — not overwriting verified existing memory',
      confidence: 0.80,
    };
  }

  // ── High-importance existing vs low confidence new ─────────────────────────
  if (existing.importance >= 4 && newImportance <= 2) {
    return {
      resolution: 'ignore_new',
      reason: `Existing memory has high importance (${existing.importance}) and new information has low importance (${newImportance}) — keeping existing`,
      confidence: 0.75,
    };
  }

  // ── Same importance level — flag for review ────────────────────────────────
  if (Math.abs(existing.importance - newImportance) <= 1) {
    return {
      resolution: 'pending_review',
      reason: 'Conflicting information with similar importance — flagged for user review',
      confidence: 0.65,
    };
  }

  // ── New information has higher importance → OVERWRITE ─────────────────────
  if (newImportance > existing.importance) {
    return {
      resolution: 'overwrite',
      reason: `New information has higher importance (${newImportance} > ${existing.importance}) — superseding`,
      confidence: 0.70,
    };
  }

  // ── Default: flag for review ───────────────────────────────────────────────
  return {
    resolution: 'pending_review',
    reason: 'Potential conflict detected — flagged for user review',
    confidence: 0.60,
  };
}

/** Returns true if two content strings are likely talking about the same fact. */
export function likelyConflict(existingContent: string, newContent: string): boolean {
  // Simple heuristic: same subject words but different values
  const existTokens = new Set(existingContent.toLowerCase().match(/\b[a-z]{3,}\b/g) || []);
  const newTokens = new Set(newContent.toLowerCase().match(/\b[a-z]{3,}\b/g) || []);

  let shared = 0;
  for (const t of existTokens) {
    if (newTokens.has(t)) shared++;
  }

  const overlap = existTokens.size > 0 ? shared / existTokens.size : 0;
  // High overlap = talking about same thing; moderate = potential conflict
  return overlap >= 0.3 && overlap < 0.9;
}
