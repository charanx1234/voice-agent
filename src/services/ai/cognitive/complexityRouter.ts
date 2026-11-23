/**
 * FRIDAY Cognitive Engine — Adaptive Complexity Router (TypeScript)
 * Classifies inputs into 4 reasoning tiers:
 * L0 (Instant), L1 (Standard), L2 (Advanced), L3 (Deep Reasoning).
 */

import { ChatMessage, ReasoningLevel } from '../../../shared/types';
import { IntentClassificationResult } from './intentRouter';

export interface ComplexityEvaluationResult {
  level: ReasoningLevel;
  score: number;
  reason: string;
  detectedFactors: string[];
  requiresTools: boolean;
  requiresDeepContext: boolean;
}

export class ComplexityRouter {
  // L0 Patterns (Instant local greetings, polite filler, simple status)
  private static readonly L0_GREETINGS =
    /^(hi|hello|hey|good (morning|afternoon|evening|night)|namaste|vanakkam|thanks|thank you|ok|okay|bye|goodbye|see you|who are you|what is your name)(\s+friday)?[\s.!]*$/i;

  private static readonly L0_DIRECT_ACTIONS =
    /^(open|launch|close|quit|mute|unmute|what time is it|what is the date|battery level|pause|resume|next song)\b/i;

  // L3 Indicators (Deep architecture, distributed systems, formal proofs, multi-step design)
  private static readonly L3_KEYWORDS =
    /\b(architecture|distributed system|microservices|consensus|raft|paxos|compiler|race condition|deadlock|zero-knowledge|formal verification|kernel|scalability bottleneck|fault tolerance|disaster recovery|database sharding|multi-region|eventual consistency|threat model|end-to-end security audit)\b/i;

  // L2 Indicators (Debugging, technical comparison, multi-part troubleshooting)
  private static readonly L2_KEYWORDS =
    /\b(debug|exception|stack trace|segfault|memory leak|optimize|profiling|refactor|compare|versus|tradeoff|analyze|explain why this fails|unit test|integration test)\b/i;

  // Multi-part question markers ("1. ..., 2. ...", "first ..., second ..., then ...")
  private static readonly MULTIPART_MARKERS =
    /(\b(firstly|secondly|furthermore|additionally|also explain|and also|step 1|step 2|\(1\)|\(2\)|1\.|2\.)\b|\?\s*.*\?)/i;

  constructor(
    private l1Threshold: number = 0.25,
    private l2Threshold: number = 0.55,
    private l3Threshold: number = 0.80
  ) {}

  public evaluate(
    message: string,
    intentResult: IntentClassificationResult,
    conversationHistory: ChatMessage[] = []
  ): ComplexityEvaluationResult {
    const text = (message || '').trim();
    const factors: string[] = [];
    let score = 0.0;

    // Check L0 first (Instant)
    if (ComplexityRouter.L0_GREETINGS.test(text)) {
      return {
        level: 'L0',
        score: 0.05,
        reason: 'Standard greeting or acknowledgement',
        detectedFactors: ['greeting_or_acknowledgement'],
        requiresTools: false,
        requiresDeepContext: false,
      };
    }

    if (ComplexityRouter.L0_DIRECT_ACTIONS.test(text) && text.split(/\s+/).length <= 6) {
      return {
        level: 'L0',
        score: 0.10,
        reason: 'Single direct system command or fast status check',
        detectedFactors: ['direct_system_command'],
        requiresTools: true,
        requiresDeepContext: false,
      };
    }

    // Base complexity from Intent
    const intent = intentResult.category;
    if (intent === 'desktop_automation' || intent === 'file_operations') {
      score += 0.20;
      factors.push(`intent:${intent}`);
    } else if (intent === 'general_conversation' || intent === 'learning_explanation') {
      score += 0.25;
      factors.push(`intent:${intent}`);
    } else if (intent === 'research' || intent === 'mathematical_reasoning') {
      score += 0.45;
      factors.push(`intent:${intent}`);
    } else if (intent === 'programming' || intent === 'comparison') {
      score += 0.55;
      factors.push(`intent:${intent}`);
    } else if (intent === 'debugging' || intent === 'screen_understanding') {
      score += 0.65;
      factors.push(`intent:${intent}`);
    } else if (intent === 'planning') {
      score += 0.75;
      factors.push(`intent:${intent}`);
    }

    // Semantic keywords check (Short but deep vs long but simple)
    const l3Match = text.match(ComplexityRouter.L3_KEYWORDS);
    if (l3Match) {
      score += 0.35;
      factors.push(`l3_keywords:${l3Match[0]}`);
    }

    const l2Match = text.match(ComplexityRouter.L2_KEYWORDS);
    if (l2Match) {
      score += 0.20;
      factors.push(`l2_keywords:${l2Match[0]}`);
    }

    // Code snippet detection
    if (text.includes('```') || /[{};()\[\]=>]{3,}/.test(text)) {
      score += 0.20;
      factors.push('code_block_present');
    }

    // Multi-part question detection
    if (ComplexityRouter.MULTIPART_MARKERS.test(text)) {
      score += 0.15;
      factors.push('multi_part_question');
    }

    // Contextual influence
    const recentTurns = conversationHistory
      .filter((m) => m.role === 'user')
      .slice(-4)
      .map((m) => m.text);

    if (recentTurns.some((t) => ComplexityRouter.L3_KEYWORDS.test(t))) {
      score += 0.15;
      factors.push('active_technical_context');
    } else if (recentTurns.some((t) => ComplexityRouter.L2_KEYWORDS.test(t))) {
      score += 0.10;
      factors.push('active_debugging_context');
    }

    score = Math.min(Math.max(score, 0.0), 1.0);

    const requiresTools =
      intentResult.suggestedTools.length > 0 ||
      intent === 'desktop_automation' ||
      intent === 'screen_understanding' ||
      intent === 'file_operations' ||
      intent === 'research';

    let level: ReasoningLevel;
    let reason: string;
    let requiresDeepContext = false;

    if (score >= this.l3Threshold) {
      level = 'L3';
      reason = `Deep reasoning required (score=${score.toFixed(2)}, factors=${factors.join('; ')})`;
      requiresDeepContext = true;
    } else if (score >= this.l2Threshold) {
      level = 'L2';
      reason = `Advanced problem-solving required (score=${score.toFixed(2)}, factors=${factors.join('; ')})`;
      requiresDeepContext = true;
    } else if (score >= this.l1Threshold) {
      level = 'L1';
      reason = `Standard question/response (score=${score.toFixed(2)}, factors=${factors.join('; ')})`;
      requiresDeepContext = false;
    } else {
      level = 'L0';
      reason = `Instant response path (score=${score.toFixed(2)})`;
      requiresDeepContext = false;
    }

    return {
      level,
      score,
      reason,
      detectedFactors: factors,
      requiresTools,
      requiresDeepContext,
    };
  }
}

export const complexityRouter = new ComplexityRouter();
