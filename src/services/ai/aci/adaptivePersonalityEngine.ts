/**
 * FRIDAY Adaptive Conversational Intelligence (ACI) V1 — Adaptive Personality Engine
 * Priority hierarchy:
 * 1. Explicit manual override
 * 2. Explicit per-conversation instruction
 * 3. Automatic personality selection
 * 4. Default personality preference
 */

import { PersonalityMode } from '../../../shared/types';
import { EmotionAnalysisResult, PersonalitySource } from './types';

export interface PersonalityDecision {
  mode: PersonalityMode;
  source: PersonalitySource;
  reason: string;
  isSafetySuspended: boolean;
}

// Patterns for per-conversation instruction
const EXPLICIT_ROAST_PATTERNS = [
  /\b(roast me|be sarcastic|give me a roast|roast this|joke around|tease me)\b/i,
];

const EXPLICIT_SERIOUS_PATTERNS = [
  /\b(be serious|no jokes|stop joking|don't joke|do not joke|be professional|take this seriously|be calm)\b/i,
  /\b(don't roast|dont roast|stop roasting|no roasting|be respectful)\b/i,
];

const EXPLICIT_SIMPLE_PATTERNS = [
  /\b(keep it simple|speak simply|talk like i'm 5|eli5|simple words|make it simple|gentle)\b/i,
];

const EXPLICIT_MODERATE_PATTERNS = [
  /\b(talk normally|be balanced|normal tone|moderate|just regular)\b/i,
];

export class AdaptivePersonalityEngine {
  /**
   * Resolves the effective personality mode following the strict priority hierarchy.
   */
  public resolvePersonality(
    currentMessage: string = '',
    emotion: EmotionAnalysisResult,
    options: {
      manualOverride?: PersonalityMode;
      defaultPreference?: PersonalityMode;
      interactionMode?: string;
    } = {}
  ): PersonalityDecision {
    const text = currentMessage.trim();
    const defaultPref: PersonalityMode = options.defaultPreference || 'moderate';

    // 1. Safety Suspension Check: If severe distress or safety concern, force simple/supportive
    if (emotion.safetyOverride) {
      return {
        mode: 'simple',
        source: 'automatic',
        reason: 'Safety suspension triggered by distress or crisis signals',
        isSafetySuspended: true,
      };
    }

    // 2. Priority 1: Explicit manual override (passed explicitly from user UI switch or param)
    if (options.manualOverride) {
      // Even if manually overridden to roast, sensitive distress automatically softens tone
      if (
        options.manualOverride === 'roast' &&
        (emotion.primarySignal === 'sadness' || emotion.primarySignal === 'stress') &&
        emotion.confidence >= 0.75
      ) {
        return {
          mode: 'moderate',
          source: 'automatic',
          reason: 'Roast automatically softened to moderate due to detected sadness or high stress',
          isSafetySuspended: true,
        };
      }

      return {
        mode: options.manualOverride,
        source: 'manual_override',
        reason: `Explicit user manual override to ${options.manualOverride}`,
        isSafetySuspended: false,
      };
    }

    // 3. Priority 2: Explicit per-conversation instruction in the message
    if (EXPLICIT_SERIOUS_PATTERNS.some((p) => p.test(text))) {
      return {
        mode: 'moderate',
        source: 'conversation_instruction',
        reason: 'User explicitly requested serious, non-roast tone',
        isSafetySuspended: false,
      };
    }

    if (EXPLICIT_ROAST_PATTERNS.some((p) => p.test(text))) {
      // Ensure safety: if user is sad/stressed, don't roast
      if (emotion.primarySignal === 'sadness' && emotion.confidence >= 0.8) {
        return {
          mode: 'moderate',
          source: 'automatic',
          reason: 'Roast request overridden due to detected emotional sadness',
          isSafetySuspended: true,
        };
      }
      return {
        mode: 'roast',
        source: 'conversation_instruction',
        reason: 'User explicitly requested roast or playful sarcasm',
        isSafetySuspended: false,
      };
    }

    if (EXPLICIT_SIMPLE_PATTERNS.some((p) => p.test(text))) {
      return {
        mode: 'simple',
        source: 'conversation_instruction',
        reason: 'User explicitly requested simple, direct delivery',
        isSafetySuspended: false,
      };
    }

    if (EXPLICIT_MODERATE_PATTERNS.some((p) => p.test(text))) {
      return {
        mode: 'moderate',
        source: 'conversation_instruction',
        reason: 'User explicitly requested normal/moderate delivery',
        isSafetySuspended: false,
      };
    }

    // 4. Priority 3: Automatic personality selection based on emotional context & task
    // A. Frustration or Stress -> never roast, switch to supportive simple/moderate
    if (
      (emotion.signals.includes('frustration') || emotion.signals.includes('stress')) &&
      emotion.confidence >= 0.65
    ) {
      return {
        mode: 'moderate',
        source: 'automatic',
        reason: 'Switched to moderate with supportive focus due to frustration/stress',
        isSafetySuspended: defaultPref === 'roast',
      };
    }

    // B. Sadness -> switch to simple, gentle, emotionally present mode
    if (emotion.signals.includes('sadness') && emotion.confidence >= 0.6) {
      return {
        mode: 'simple',
        source: 'automatic',
        reason: 'Switched to gentle simple mode due to detected sadness',
        isSafetySuspended: defaultPref === 'roast',
      };
    }

    // C. High confusion during learning -> switch to simple for clear, patient explanation
    if (
      options.interactionMode === 'learning' &&
      emotion.signals.includes('confusion') &&
      emotion.confidence >= 0.6
    ) {
      return {
        mode: 'simple',
        source: 'automatic',
        reason: 'Switched to simple mode for clear educational clarity',
        isSafetySuspended: false,
      };
    }

    // D. If default preference is roast, check if current interaction is sensitive or technical troubleshooting
    if (defaultPref === 'roast') {
      if (options.interactionMode === 'troubleshooting' && emotion.signals.includes('frustration')) {
        return {
          mode: 'moderate',
          source: 'automatic',
          reason: 'Roast automatically softened during technical troubleshooting under frustration',
          isSafetySuspended: true,
        };
      }
    }

    // 5. Priority 4: Default personality preference
    return {
      mode: defaultPref,
      source: 'default_preference',
      reason: `Default user preference: ${defaultPref}`,
      isSafetySuspended: false,
    };
  }
}

export const adaptivePersonalityEngine = new AdaptivePersonalityEngine();
