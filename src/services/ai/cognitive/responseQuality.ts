/**
 * FRIDAY Cognitive Engine — Response Quality Controller (TypeScript)
 * Lightweight rule-based response sanitation and quality validation:
 * - Repairs markdown code blocks
 * - Strips robotic preambles and redundant introductions
 * - Deduplicates repeated sentences or paragraphs
 * - Guards against unverified action claims
 * - Enforces adaptive response depth (D0/D1) without removing essential code or facts
 */

import { ConversationPolicy } from '../aci/types';

export interface QualityValidationResult {
  passed: boolean;
  sanitizedText: string;
  reasons: string[];
  hasUnverifiedActionClaim: boolean;
  depthEnforced?: boolean;
}

export class ResponseQualityController {
  private static readonly REDUNDANT_PREAMBLE =
    /^(sure,?\s*(i can help with that|here is the answer|certainly|as an ai language model|let me explain|here is what you asked for|here's what you need)[\s.!:]*)+/i;

  private static readonly FILLER_INTROS = [
    /^(certainly!?|absolutely!?|of course!?|sure thing!?|i would be happy to help!?)\s*/i,
    /^(here is the information you requested:?|here is the explanation:?|as requested:?)\s*/i,
  ];

  private static readonly ACTION_CLAIMS = [
    /\b(i (have )?(opened|launched|started|closed|shut down|restarted))\b/i,
    /\b(i (have )?(saved|deleted|created) (the|your) (file|note|folder))\b/i,
  ];

  public validateAndSanitize(
    responseText: string,
    toolExecutedSuccessfully: boolean = false,
    personalityMode: string = 'moderate',
    policy?: ConversationPolicy
  ): QualityValidationResult {
    let text = (responseText || '').trim();
    const reasons: string[] = [];

    // 1. Non-empty check
    if (!text) {
      return {
        passed: false,
        sanitizedText:
          "I ran into a brief hiccup while processing that. I'm right here though -- what can I do for you?",
        reasons: ['empty_response'],
        hasUnverifiedActionClaim: false,
      };
    }

    // 2. Strip robotic preamble in Moderate / Roast modes
    if (personalityMode === 'moderate' || personalityMode === 'roast') {
      const stripped = text.replace(ResponseQualityController.REDUNDANT_PREAMBLE, '').trim();
      if (stripped && stripped !== text) {
        text = stripped;
        reasons.push('stripped_redundant_preamble');
      }

      for (const intro of ResponseQualityController.FILLER_INTROS) {
        if (intro.test(text)) {
          text = text.replace(intro, '').trim();
          reasons.push('stripped_filler_intro');
        }
      }
    }

    // 3. Deduplicate consecutive repeated paragraphs
    const paragraphs = text.split(/\n\s*\n/);
    if (paragraphs.length > 1) {
      const deduplicated: string[] = [];
      for (let i = 0; i < paragraphs.length; i++) {
        const p = paragraphs[i].trim();
        if (i === 0 || p !== paragraphs[i - 1].trim()) {
          deduplicated.push(p);
        } else {
          reasons.push('deduplicated_repeated_paragraph');
        }
      }
      text = deduplicated.join('\n\n');
    }

    // 4. Adaptive response depth constraint enforcement (D0 / D1)
    let depthEnforced = false;
    if (policy && !text.includes('```')) {
      if (policy.response_depth === 'D0') {
        // Minimal: extract the first clear sentence
        const sentences = text.split(/(?<=[.?!])\s+/);
        if (sentences.length > 1) {
          text = sentences[0].trim();
          reasons.push('enforced_d0_minimal_depth');
          depthEnforced = true;
        }
      } else if (policy.response_depth === 'D1') {
        // Brief: limit to 2 sentences max if overly bloated conversational monologue
        const sentences = text.split(/(?<=[.?!])\s+/);
        if (sentences.length > 3) {
          text = sentences.slice(0, 2).join(' ').trim();
          reasons.push('enforced_d1_brief_depth');
          depthEnforced = true;
        }
      }
    }

    // 5. Unverified action claims guard
    let hasUnverifiedClaim = false;
    for (const pat of ResponseQualityController.ACTION_CLAIMS) {
      if (pat.test(text) && !toolExecutedSuccessfully) {
        hasUnverifiedClaim = true;
        reasons.push('unverified_action_claim_detected');
        text += '\n\n*(Note: Please verify that the intended desktop action completed successfully on your system.)*';
        break;
      }
    }

    // 6. Code block syntax repair (unclosed code fences)
    const codeFences = (text.match(/```/g) || []).length;
    if (codeFences % 2 !== 0) {
      text += '\n```';
      reasons.push('closed_unclosed_code_fence');
    }

    return {
      passed: true,
      sanitizedText: text,
      reasons,
      hasUnverifiedActionClaim: hasUnverifiedClaim,
      depthEnforced,
    };
  }
}

export const responseQualityController = new ResponseQualityController();
