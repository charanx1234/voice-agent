/**
 * FRIDAY Adaptive Conversational Intelligence (ACI) V1 — User Feedback Learner
 * Detects explicit user feedback on style, length, and personality, applies immediate
 * turn adjustments, and safely persists permanent preferences via settingsStore.
 */

import { settingsStore } from '../../storage/settingsStore';
import { ConversationPolicy, FeedbackAdjustment } from './types';

const FEEDBACK_PATTERNS = [
  { regex: /\b(too long|too verbose|make it shorter|less words|shorten this|stop rambling)\b/i, type: 'verbosity_reduction' as const },
  { regex: /\b(explain more|more detail|elaborate further|give more info|expand on this)\b/i, type: 'verbosity_increase' as const },
  { regex: /\b(keep it simple|make it simple|eli5|plain english|too complicated)\b/i, type: 'simplicity' as const },
  { regex: /\b(don't roast|dont roast|stop roasting|no roasting|no sarcasm)\b/i, type: 'disable_roast' as const },
  { regex: /\b(be serious|take this seriously|serious mode)\b/i, type: 'serious_tone' as const },
  { regex: /\b(talk normally|normal tone|be normal)\b/i, type: 'normal_tone' as const },
  { regex: /\b(give examples|with examples|show an example|code example)\b/i, type: 'give_examples' as const },
];

export class UserFeedbackLearner {
  /**
   * Analyzes user message for explicit conversational feedback.
   */
  public analyzeFeedback(userMessage: string = ''): FeedbackAdjustment {
    const text = userMessage.trim();
    if (!text) return { detected: false, persistPreference: false };

    for (const item of FEEDBACK_PATTERNS) {
      if (item.regex.test(text)) {
        const persistPreference = /\b(always|from now on|permanently|by default)\b/i.test(text);

        switch (item.type) {
          case 'verbosity_reduction':
            return {
              detected: true,
              type: item.type,
              userFeedbackText: text,
              persistPreference,
              appliedPolicyAdjustments: {
                response_depth: 'D1',
                verbosity: 'low',
                strategy: 'direct_answer',
              },
            };
          case 'verbosity_increase':
            return {
              detected: true,
              type: item.type,
              userFeedbackText: text,
              persistPreference,
              appliedPolicyAdjustments: {
                response_depth: 'D3',
                verbosity: 'detailed',
                strategy: 'explanation',
              },
            };
          case 'simplicity':
            return {
              detected: true,
              type: item.type,
              userFeedbackText: text,
              persistPreference,
              appliedPolicyAdjustments: {
                personality: 'simple',
                personality_source: 'conversation_instruction',
                response_depth: 'D1',
                verbosity: 'low',
                tone: 'patient_encouraging',
              },
            };
          case 'disable_roast':
          case 'serious_tone':
            return {
              detected: true,
              type: item.type,
              userFeedbackText: text,
              persistPreference,
              appliedPolicyAdjustments: {
                personality: 'moderate',
                personality_source: 'conversation_instruction',
                tone: 'calm_supportive',
              },
            };
          case 'normal_tone':
            return {
              detected: true,
              type: item.type,
              userFeedbackText: text,
              persistPreference,
              appliedPolicyAdjustments: {
                personality: 'moderate',
                personality_source: 'conversation_instruction',
                tone: 'warm_friendly',
              },
            };
          case 'give_examples':
            return {
              detected: true,
              type: item.type,
              userFeedbackText: text,
              persistPreference: false,
              appliedPolicyAdjustments: {
                response_depth: 'D3',
                strategy: 'explanation',
              },
            };
        }
      }
    }

    return { detected: false, persistPreference: false };
  }

  /**
   * Applies the detected feedback to the policy and optionally persists permanent settings.
   */
  public applyFeedback(
    policy: ConversationPolicy,
    adjustment: FeedbackAdjustment
  ): ConversationPolicy {
    if (!adjustment.detected || !adjustment.appliedPolicyAdjustments) {
      return policy;
    }

    const updated: ConversationPolicy = {
      ...policy,
      ...adjustment.appliedPolicyAdjustments,
    };

    // If permanent preference was requested, safely persist to settingsStore
    if (adjustment.persistPreference) {
      try {
        if (adjustment.type === 'disable_roast' || adjustment.type === 'normal_tone') {
          settingsStore.saveSettings({ personalityMode: 'moderate' });
        } else if (adjustment.type === 'simplicity') {
          settingsStore.saveSettings({ personalityMode: 'simple' });
        }
      } catch (err: any) {
        console.warn('[UserFeedbackLearner] Failed to persist setting:', err?.message);
      }
    }

    return updated;
  }
}

export const userFeedbackLearner = new UserFeedbackLearner();
