/**
 * FRIDAY VoiceFlow — AI-Enhanced Text Processor
 * Integrates with FRIDAY's existing AI Provider Manager (Gemini, Anthropic, OpenAI, Groq, etc.)
 * to transform raw speech recognition transcripts into clear, intended text.
 */

import { VoiceFlowMode } from './types';
import { providerManager } from '../ai/providers/providerManager';
import { settingsStore } from '../storage/settingsStore';

export interface EnhancementResult {
  text: string;
  originalText: string;
  mode: VoiceFlowMode;
  providerUsed: string;
  latencyMs: number;
}

const FILLER_WORDS_REGEX = /\b(um|uh|erm|ah|like,?\s*you know|you know,?\s*like|you know|basically|sort of|kind of|i mean)\b/gi;

/**
 * Fast offline heuristic cleanup used when verbatim is requested, direct transcription is on,
 * or as an immediate fallback if cloud LLM is unavailable.
 */
export function fastHeuristicClean(rawText: string, mode: VoiceFlowMode): string {
  let text = (rawText || '').trim();
  if (!text) return '';

  if (mode === 'verbatim') {
    return text;
  }

  if (mode === 'concise') {
    text = text.replace(FILLER_WORDS_REGEX, ' ');
  }

  // Basic cleanup: fix repeated spaces, capitalize initial letter, ensure punctuation
  text = text.replace(/\s{2,}/g, ' ').trim();
  if (text.length > 0 && mode !== 'code') {
    text = text.charAt(0).toUpperCase() + text.slice(1);
    // Capitalize standalone 'i'
    text = text.replace(/\b(i)\b/g, 'I');
  }

  return text;
}

/**
 * Builds the mode-specific instruction for the existing AI Brain.
 */
function buildModeInstructions(mode: VoiceFlowMode, language?: string): string {
  const langContext = language && language.startsWith('te')
    ? 'The speech contains Telugu or mixed Telugu-English (Tenglish). Preserve all Telugu words, Telugu-English code-switching, and Telugu phrasing accurately.'
    : 'Preserve any mixed language or technical terminology accurately.';

  switch (mode) {
    case 'natural':
      return `Mode: NATURAL.
Fix punctuation, capitalization, and grammar while strictly maintaining the user's natural speaking tone and vocabulary.
Smooth out awkward sentence breaks into cohesive prose.
${langContext}`;

    case 'professional':
      return `Mode: PROFESSIONAL.
Elevate the tone to be polite, clear, and business-ready for emails or messages.
Eliminate colloquial slips and informal repetition.
Do NOT turn the text into an email format (do NOT add 'Dear Sir', 'Best regards', or subject line) unless the user explicitly dictated an email.
${langContext}`;

    case 'concise':
      return `Mode: CONCISE.
Strip out all verbal filler words ('um', 'uh', 'you know', 'like', 'basically', 'actually') and unnecessary repetition.
Make the text as brief and impactful as possible while preserving 100% of the intended meaning.
${langContext}`;

    case 'code':
      return `Mode: CODE & TECHNICAL.
Accurately identify and reconstruct programming identifiers (camelCase, snake_case), technical terms, filenames, CLI commands, and code syntax.
Preserve symbols (brackets, quotes, semicolons, arrows) where code was spoken.
Never turn actual code or shell commands into narrative prose.
${langContext}`;

    case 'verbatim':
    default:
      return 'Mode: VERBATIM. Return the text with minimal punctuation cleanup and zero rewriting.';
  }
}

export class VoiceFlowEnhancer {
  private static instance: VoiceFlowEnhancer | null = null;

  public static getInstance(): VoiceFlowEnhancer {
    if (!VoiceFlowEnhancer.instance) {
      VoiceFlowEnhancer.instance = new VoiceFlowEnhancer();
    }
    return VoiceFlowEnhancer.instance;
  }

  private constructor() {}

  /**
   * Enhances raw speech transcript according to the requested VoiceFlow mode.
   */
  public async enhance(
    rawText: string,
    mode: VoiceFlowMode = 'natural',
    options?: { language?: string; directTranscription?: boolean }
  ): Promise<EnhancementResult> {
    const trimmed = (rawText || '').trim();
    const t0 = Date.now();

    // 1. Direct transcription / verbatim / empty text bypass
    if (!trimmed || mode === 'verbatim' || options?.directTranscription) {
      return {
        text: fastHeuristicClean(trimmed, mode),
        originalText: trimmed,
        mode,
        providerUsed: 'direct_verbatim',
        latencyMs: Date.now() - t0,
      };
    }

    // 2. Check if AI enhancement is configured
    const settings = settingsStore.getSettings();
    const modeInstruction = buildModeInstructions(mode, options?.language);

    const systemPrompt = `You are FRIDAY VoiceFlow's Text Enhancement Engine.
Your sole job is to rewrite the user's raw speech transcript into the final text that should be pasted into their active application.

CRITICAL RULES:
1. OUTPUT ONLY THE FINAL REFINED TEXT. Do NOT include any introduction, explanations, notes, or quotation marks around the output.
2. NEVER INVENT OR ADD INFORMATION that was not in the original speech.
3. NEVER CHANGE THE USER'S INTENDED MEANING.
4. DO NOT ADD GREETINGS OR SIGNATURES unless explicitly dictated.
5. PRESERVE TECHNICAL & CODING TERMS exactly as intended.
6. PRESERVE TELUGU-ENGLISH CODE-SWITCHING words (e.g. 'chey', 'chudu', 'raayi', 'vellali', 'cheppu') without arbitrary alteration.

${modeInstruction}`;

    const promptMessage = `Raw speech transcript: "${trimmed}"\n\nFinal refined text:`;

    try {
      // Pass through FRIDAY's existing AI provider manager with isolated history
      const result = await providerManager.generate({
        message: `${systemPrompt}\n\n${promptMessage}`,
        conversationHistory: [],
        language: options?.language || 'en',
      });

      let enhanced = (result.text || '').trim();

      // Clean any accidental wrapper quotes or prefixes like "Final text:"
      enhanced = enhanced
        .replace(/^["'`]|["'`]$/g, '')
        .replace(/^(refined text|enhanced text|final text|output):\s*/i, '')
        .trim();

      if (!enhanced) {
        enhanced = fastHeuristicClean(trimmed, mode);
      }

      return {
        text: enhanced,
        originalText: trimmed,
        mode,
        providerUsed: result.providerUsed || 'unknown',
        latencyMs: Date.now() - t0,
      };
    } catch (err) {
      console.warn('[VoiceFlowEnhancer] Cloud AI enhancement failed, falling back to local heuristic:', err);
      return {
        text: fastHeuristicClean(trimmed, mode),
        originalText: trimmed,
        mode,
        providerUsed: 'local_heuristic_fallback',
        latencyMs: Date.now() - t0,
      };
    }
  }
}

export const voiceFlowEnhancer = VoiceFlowEnhancer.getInstance();
