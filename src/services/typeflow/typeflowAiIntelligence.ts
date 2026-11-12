import { ContextUnderstandingResult, TextContentType } from './types';
import { geminiService } from '../ai/gemini';

export class TypeFlowAiIntelligence {
  private static instance: TypeFlowAiIntelligence | null = null;

  public static getInstance(): TypeFlowAiIntelligence {
    if (!TypeFlowAiIntelligence.instance) {
      TypeFlowAiIntelligence.instance = new TypeFlowAiIntelligence();
    }
    return TypeFlowAiIntelligence.instance;
  }

  private constructor() {}

  /**
   * Fast rule-based + heuristic classification of selected content.
   */
  public classifyContent(text: string): TextContentType {
    const trimmed = text.trim();
    if (!trimmed) return 'general';

    // Programming code heuristics
    const codePatterns = [
      /^(import|export|const|let|var|function|class|def|public|private|interface|struct)\b/m,
      /[{}();]\s*$/m,
      /\b(console\.log|print\(|return |System\.out\.println)\b/,
      /^\s*<\?php|<html>|<!DOCTYPE/i,
    ];
    const isCode = codePatterns.some((p) => p.test(trimmed));

    // Error message heuristics
    if (
      trimmed.includes('Error:') ||
      trimmed.includes('Exception in thread') ||
      trimmed.includes('Traceback (most recent call last):') ||
      trimmed.includes('FATAL') ||
      /NullPointer|TypeError|ReferenceError|SyntaxError/.test(trimmed)
    ) {
      return 'error_message';
    }

    // Question heuristics
    if (trimmed.endsWith('?') || /^(what|why|how|who|where|when|can you|explain|which|is it)\b/i.test(trimmed)) {
      if (isCode || /code|function|algorithm|bug|array|pointer|class|variable/i.test(trimmed)) {
        return 'code_question';
      }
      return 'question';
    }

    if (isCode) return 'source_code';

    // Email heuristics
    if (/^(hi|hello|dear|good morning|to:|from:|subject:)/i.test(trimmed) && trimmed.includes('\n')) {
      return 'email';
    }

    // Mathematical expression
    if (/^[0-9+\-*/^=().\s√π]+$/.test(trimmed) && /[+\-*/^=]/.test(trimmed)) {
      return 'math';
    }

    if (trimmed.length > 300) return 'article';

    return 'general';
  }

  /**
   * Extracts understanding and structured key points using FRIDAY's AI brain.
   */
  public async understandText(text: string): Promise<ContextUnderstandingResult> {
    const category = this.classifyContent(text);
    const charCount = text.length;

    // Build concise prompt for FRIDAY's Gemini brain
    const prompt = `You are FRIDAY's TypeFlow Intelligence module.
Analyze the following text selected by the user.
Text (${charCount} characters):
"""
${text.slice(0, 4000)}
"""

Provide a concise JSON response with:
{
  "summary": "1-2 sentence executive summary of this content",
  "keyPoints": ["bullet point 1", "bullet point 2"],
  "suggestedActions": ["Explain logic", "Draft answer", "Improve formatting", "Fix bug"],
  "detectedLanguage": "English or programming language if code"
}
Output valid JSON only.`;

    try {
      const response = await geminiService.generateRaw(prompt);
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          category,
          summary: parsed.summary || 'Summary unavailable',
          keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
          detectedLanguage: parsed.detectedLanguage || 'English',
          suggestedActions: Array.isArray(parsed.suggestedActions) ? parsed.suggestedActions : ['Explain this', 'Summarize'],
          confidence: 0.95,
        };
      }
    } catch (e) {
      console.warn('[TypeFlowAiIntelligence] LLM understanding fallback to heuristics:', e);
    }

    return {
      category,
      summary: text.length > 120 ? text.slice(0, 117) + '...' : text,
      keyPoints: [category.toUpperCase() + ' text detected'],
      suggestedActions: ['Explain this', 'Summarise', 'Type this text'],
      confidence: 0.8,
    };
  }

  /**
   * Generates a tailored response, explanation, or summary for the selected text.
   */
  public async generateResponse(
    text: string,
    instruction: string = 'Explain this clearly and provide a concise answer.'
  ): Promise<string> {
    const prompt = `You are FRIDAY, an elite AI assistant.
The user has selected the following text and requested: "${instruction}"

Selected Content:
"""
${text}
"""

Guidelines:
1. Preserve core meaning and facts.
2. If it is a question or programming problem, explain the solution clearly with steps.
3. If it is code, preserve exact identifiers and syntax.
4. Keep the output clean and immediately readable.`;

    return geminiService.generateRaw(prompt);
  }

  /**
   * Enhances text (grammar, tone, formatting) when explicitly requested by user.
   */
  public async enhanceText(
    text: string,
    mode: 'grammar' | 'shorter' | 'formal' | 'code_clean' = 'grammar'
  ): Promise<string> {
    let instruction = 'Fix grammar and improve flow while strictly preserving meaning.';
    if (mode === 'shorter') instruction = 'Make this text significantly more concise and impactful without losing key facts.';
    if (mode === 'formal') instruction = 'Rewrite this in professional, polished business English.';
    if (mode === 'code_clean') instruction = 'Clean up formatting and indentation while preserving exact syntax and identifiers.';

    const prompt = `You are FRIDAY's text enhancement assistant.
Task: ${instruction}

Original Text:
"""
${text}
"""

Return only the enhanced text without conversational preamble.`;

    const res = await geminiService.generateRaw(prompt);
    return res.trim();
  }
}

export const typeFlowAi = TypeFlowAiIntelligence.getInstance();
