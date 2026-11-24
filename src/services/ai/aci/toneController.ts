/**
 * FRIDAY Adaptive Conversational Intelligence (ACI) V1 — Tone Controller
 * Synthesizes adaptive conversational tone based on emotion signals, personality mode,
 * and strategy, ensuring emotional awareness without robotic announcements.
 */

import { PersonalityMode } from '../../../shared/types';
import { ConversationalStrategy, ConversationTone, EmotionAnalysisResult } from './types';

export class ToneController {
  /**
   * Synthesizes conversational tone.
   */
  public determineTone(
    emotion: EmotionAnalysisResult,
    personality: PersonalityMode,
    strategy: ConversationalStrategy
  ): ConversationTone {
    // 1. Safety / Crisis / Deep sadness -> Gentle Reassuring
    if (emotion.safetyOverride || emotion.signals.includes('sadness')) {
      return 'gentle_reassuring';
    }

    // 2. Frustration, High Stress, or Guided Troubleshooting -> Calm Supportive
    if (
      emotion.signals.includes('frustration') ||
      emotion.signals.includes('stress') ||
      strategy === 'step_by_step'
    ) {
      return 'calm_supportive';
    }

    // 3. Confusion or Uncertainty -> Patient Encouraging
    if (emotion.signals.includes('confusion') || emotion.signals.includes('uncertainty')) {
      return 'patient_encouraging';
    }

    // 4. Roast Mode with playful energy -> Playful Witty
    if (personality === 'roast') {
      return 'playful_witty';
    }

    // 5. Research or Deep Analysis -> Analytical Objective
    if (strategy === 'research_analysis') {
      return 'analytical_objective';
    }

    // 6. Simple Mode or Direct Task -> Direct Concise
    if (personality === 'simple' || strategy === 'task_execution') {
      return 'direct_concise';
    }

    // 7. Excitement or Happiness -> Warm Friendly or Playful
    if (emotion.signals.includes('excitement') || emotion.signals.includes('happiness')) {
      return personality === 'moderate' ? 'warm_friendly' : 'playful_witty';
    }

    // Default: Warm Friendly
    return 'warm_friendly';
  }
}

export const toneController = new ToneController();
