/**
 * FRIDAY Cognitive Engine — Response Quality Controller (TypeScript)
 * Lightweight rule-based response sanitation: repairs markdown code blocks,
 * strips robotic preamble in moderate/roast modes, and guards against unverified action claims.
 */

export interface QualityValidationResult {
  passed: boolean;
  sanitizedText: string;
  reasons: string[];
  hasUnverifiedActionClaim: boolean;
}

export class ResponseQualityController {
  private static readonly REDUNDANT_PREAMBLE =
    /^(sure,?\s*(i can help with that|here is the answer|certainly|as an ai language model|let me explain)[\s.!:]*)+/i;

  private static readonly ACTION_CLAIMS = [
    /\b(i (have )?(opened|launched|started|closed|shut down|restarted))\b/i,
    /\b(i (have )?(saved|deleted|created) (the|your) (file|note|folder))\b/i,
  ];

  public validateAndSanitize(
    responseText: string,
    toolExecutedSuccessfully: boolean = false,
    personalityMode: string = 'moderate'
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
      if (stripped) {
        text = stripped;
        reasons.push('stripped_redundant_preamble');
      }
    }

    // 3. Unverified action claims guard
    let hasUnverifiedClaim = false;
    for (const pat of ResponseQualityController.ACTION_CLAIMS) {
      if (pat.test(text) && !toolExecutedSuccessfully) {
        hasUnverifiedClaim = true;
        reasons.push('unverified_action_claim_detected');
        text += '\n\n*(Note: Please verify that the intended desktop action completed successfully on your system.)*';
        break;
      }
    }

    // 4. Code block syntax repair (unclosed code fences)
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
    };
  }
}

export const responseQualityController = new ResponseQualityController();
