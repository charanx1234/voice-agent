/**
 * FRIDAY Adaptive Conversational Intelligence (ACI) V1 — Conversational Strategy Engine
 * Selects the optimal interaction strategy based on emotional cues, context, and intent.
 * Enforces rules:
 * - Avoid unnecessary clarification questions.
 * - Do not provide long generic explanations when one targeted answer is more useful.
 * - Do not automatically turn emotional conversations into problem-solving sessions.
 */

import { ContextUnderstandingResult, ConversationalStrategy, EmotionAnalysisResult } from './types';

export class ConversationalStrategyEngine {
  /**
   * Evaluates the conversational strategy for the current turn.
   */
  public selectStrategy(
    context: ContextUnderstandingResult,
    emotion: EmotionAnalysisResult,
    hasToolsToExecute: boolean = false
  ): ConversationalStrategy {
    // 1. Emotional venting / distress: priority is listening and acknowledgement
    if (
      (emotion.signals.includes('sadness') || emotion.signals.includes('stress')) &&
      emotion.confidence >= 0.7 &&
      context.interactionMode !== 'executing_tasks'
    ) {
      return 'listening_acknowledgement';
    }

    // 2. Task execution
    if (hasToolsToExecute || context.interactionMode === 'executing_tasks') {
      return 'task_execution';
    }

    // 3. Troubleshooting
    if (context.interactionMode === 'troubleshooting') {
      // Step-by-step guidance is best for troubleshooting, without generic lecture
      return 'step_by_step';
    }

    // 4. Learning & explanation
    if (context.interactionMode === 'learning') {
      return 'explanation';
    }

    // 5. Research & analysis
    if (context.interactionMode === 'researching') {
      return 'research_analysis';
    }

    // 6. Brainstorming
    if (context.interactionMode === 'brainstorming') {
      return 'brainstorming';
    }

    // 7. Multi-turn follow up continuation
    if (context.isMultiTurnFollowUp && context.previousRelevantReferences.length > 0) {
      return 'follow_up_assistance';
    }

    // 8. Default: Direct answer (shortest complete answer, avoiding unnecessary clarification)
    return 'direct_answer';
  }
}

export const conversationalStrategyEngine = new ConversationalStrategyEngine();
