/**
 * FRIDAY Adaptive Conversational Intelligence (ACI) V1 — Adaptive Response Depth Engine
 * Manages 5 response-depth tiers (D0-D4) governed by user request, task complexity,
 * research requirements, and the core principle: "Provide the shortest complete answer."
 */

import { ReasoningLevel } from '../../../shared/types';
import { ContextUnderstandingResult, ResponseDepthLevel, VerbosityLevel } from './types';

export interface DepthDecision {
  depth: ResponseDepthLevel;
  verbosity: VerbosityLevel;
  reason: string;
}

export class AdaptiveResponseDepthEngine {
  /**
   * Evaluates the appropriate response depth level and corresponding verbosity tier.
   */
  public evaluate(
    currentMessage: string = '',
    context: ContextUnderstandingResult,
    reasoningLevel: ReasoningLevel = 'L1'
  ): DepthDecision {
    const text = currentMessage.trim().toLowerCase();

    // 1. Explicit user request (Highest Priority)
    if (context.requestedDepth) {
      return {
        depth: context.requestedDepth,
        verbosity: this.mapDepthToVerbosity(context.requestedDepth),
        reason: `Explicit user request for ${context.requestedDepth}`,
      };
    }

    // Check for inline explicit words if not caught earlier
    if (/\b(one word|yes or no)\b/i.test(text)) {
      return { depth: 'D0', verbosity: 'minimal', reason: 'Explicit one-word request' };
    }
    if (/\b(brief|concise|tldr|short)\b/i.test(text)) {
      return { depth: 'D1', verbosity: 'low', reason: 'Explicit brief request' };
    }
    if (/\b(detailed|thorough|in-depth|step by step)\b/i.test(text)) {
      return { depth: 'D3', verbosity: 'detailed', reason: 'Explicit detailed request' };
    }
    if (/\b(deep dive|exhaustive|complete architecture)\b/i.test(text)) {
      return { depth: 'D4', verbosity: 'high', reason: 'Explicit deep dive request' };
    }

    // 2. Greetings and pure casual pleasantries -> D0 or D1
    if (
      context.interactionMode === 'casual_chatting' &&
      /^(hi|hello|hey|good morning|good night|how are you|sup|namaste|ela unnavu)\b/i.test(text)
    ) {
      return {
        depth: 'D1',
        verbosity: 'low',
        reason: 'Casual greeting or check-in, naturally concise',
      };
    }

    // 3. Simple desktop command confirmations -> D0 or D1
    if (context.interactionMode === 'executing_tasks' || reasoningLevel === 'L0') {
      return {
        depth: 'D1',
        verbosity: 'low',
        reason: 'Direct task execution or system control, minimal confirmation',
      };
    }

    // 4. Research, Architecture, and Deep Reasoning (L3) -> D3 or D4
    if (reasoningLevel === 'L3' || context.interactionMode === 'researching') {
      return {
        depth: 'D3',
        verbosity: 'detailed',
        reason: 'Deep research or architectural reasoning requires structured explanation',
      };
    }

    // 5. Troubleshooting (L2) -> D2 (Focused, next useful steps, avoid overwhelming)
    if (context.interactionMode === 'troubleshooting') {
      return {
        depth: 'D2',
        verbosity: 'normal',
        reason: 'Troubleshooting: provide immediate root-cause and next concrete steps without lecture',
      };
    }

    // 6. Educational Learning -> D2 or D3 depending on depth of concept
    if (context.interactionMode === 'learning') {
      return {
        depth: 'D2',
        verbosity: 'normal',
        reason: 'Educational explanation: clear, digestible concepts with targeted example',
      };
    }

    // 7. Brainstorming -> D2
    if (context.interactionMode === 'brainstorming') {
      return {
        depth: 'D2',
        verbosity: 'normal',
        reason: 'Brainstorming: bulleted concrete ideas without excessive filler',
      };
    }

    // 8. Default fallback: D2 (Normal, concise, complete)
    return {
      depth: 'D2',
      verbosity: 'normal',
      reason: 'Standard conversational response: shortest complete answer',
    };
  }

  private mapDepthToVerbosity(depth: ResponseDepthLevel): VerbosityLevel {
    switch (depth) {
      case 'D0':
        return 'minimal';
      case 'D1':
        return 'low';
      case 'D2':
        return 'normal';
      case 'D3':
        return 'detailed';
      case 'D4':
        return 'high';
    }
  }
}

export const adaptiveResponseDepthEngine = new AdaptiveResponseDepthEngine();
