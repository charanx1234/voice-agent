/**
 * FRIDAY Cognitive Engine — Smart Context Engine (TypeScript)
 * Assembles 3-layer context (Immediate, Retrieved, Extended) with token
 * budgeting, situation briefing, and relevance-based memory prioritization.
 */

import { ChatMessage, ReasoningLevel } from '../../../shared/types';
import { memoryService } from '../../memory/memoryService';
import { buildConversationBrief } from '../conversationContext';

export interface ContextBundleResult {
  systemInstruction: string;
  immediateMessages: ChatMessage[];
  situationBrief: string;
  memoryBlock: string;
  extendedBlock: string;
  estimatedTokens: number;
  truncated: boolean;
}

export class ContextEngine {
  private static readonly CHARS_PER_TOKEN = 4;

  constructor(
    private maxContextBudgetTokens: number = 4096,
    private maxImmediateTurns: number = 10
  ) {}

  public estimateTokens(text: string): number {
    return Math.max(1, Math.floor((text || '').length / ContextEngine.CHARS_PER_TOKEN));
  }

  public async assemble(
    currentMessage: string,
    baseSystemInstruction: string,
    conversationHistory: ChatMessage[] = [],
    options: {
      reasoningLevel?: ReasoningLevel;
      personalityMode?: string;
      budgetTokensOverride?: number;
      conversationPolicy?: any;
    } = {}
  ): Promise<ContextBundleResult> {
    const level = options.reasoningLevel || 'L1';
    const budget = options.budgetTokensOverride || this.maxContextBudgetTokens;
    let truncated = false;

    // 1. Situation Brief
    const brief = buildConversationBrief(conversationHistory, currentMessage);
    const briefText = brief.text;

    // 2. Layer 2: Retrieved Context (Memory)
    let memoryBlock = '';
    if (level !== 'L0') {
      try {
        memoryBlock = await memoryService.buildContextBlock(currentMessage);
      } catch (err: any) {
        console.warn('[ContextEngine] Memory retrieval skipped:', err?.message);
      }
    }

    // 3. Layer 3: Extended Context (Only for L2 and L3)
    let extendedBlock = '';
    if (level === 'L3') {
      extendedBlock =
        'DEEP REASONING INSTRUCTIONS:\n' +
        '- Formulate a rigorous, structured response with clear architecture decisions.\n' +
        '- Explicitly state edge cases, failure modes, and performance tradeoffs.\n' +
        '- If proposing code or configuration, ensure complete correctness and production safety.';
    } else if (level === 'L2') {
      extendedBlock =
        'STRUCTURED PROBLEM SOLVING:\n' +
        '- Identify the root cause directly without conversational filler.\n' +
        '- Provide concrete code examples or exact remediation steps.';
    }

    // 4. Layer 1: Immediate Context (Rolling dialogue)
    const historyClean = conversationHistory.filter((m) => m.role !== 'system');
    const recent = historyClean.slice(-this.maxImmediateTurns);
    const immediateMessages = [...recent];

    // Combine system instructions
    const systemParts = [baseSystemInstruction.trim()];
    if (briefText) systemParts.push(briefText);
    if (memoryBlock) systemParts.push(memoryBlock);
    if (extendedBlock) systemParts.push(extendedBlock);

    if (options.conversationPolicy) {
      const cp = options.conversationPolicy;
      systemParts.push(
        `ADAPTIVE CONVERSATIONAL INTELLIGENCE (ACI V1):\n` +
        `- Intent: ${cp.intent} | Ongoing Task: ${cp.task} | Interaction Mode: ${cp.interactionMode}\n` +
        `- Tone: ${cp.tone} | Strategy: ${cp.strategy}\n` +
        `- Response Depth: ${cp.response_depth} (Verbosity: ${cp.verbosity})\n` +
        `- Guideline: ${
          cp.response_depth === 'D0'
            ? 'D0 Minimal: Direct 1-2 words or single short sentence only.'
            : cp.response_depth === 'D1'
            ? 'D1 Brief: Concise, natural answer in 1-2 sentences. Avoid preamble.'
            : cp.response_depth === 'D2'
            ? 'D2 Normal: Focused response in 1-2 paragraphs. Shortest complete answer.'
            : cp.response_depth === 'D3'
            ? 'D3 Detailed: Thorough, structured explanation with code examples and reasoning.'
            : 'D4 Deep: Comprehensive architectural analysis with edge cases and failure modes.'
        }`
      );
    }

    let systemInstruction = systemParts.join('\n\n');

    // Token Budget Enforcement
    let totalTokens = this.estimateTokens(systemInstruction);
    for (const msg of immediateMessages) {
      totalTokens += this.estimateTokens(msg.text);
    }
    totalTokens += this.estimateTokens(currentMessage);

    if (totalTokens > budget) {
      truncated = true;
      // Truncate oldest turns first
      while (totalTokens > budget && immediateMessages.length > 2) {
        const dropped = immediateMessages.shift();
        if (dropped) {
          totalTokens -= this.estimateTokens(dropped.text);
        }
      }

      // If still over budget, drop extended block
      if (totalTokens > budget && extendedBlock) {
        systemInstruction = [baseSystemInstruction.trim(), briefText, memoryBlock]
          .filter(Boolean)
          .join('\n\n');
        totalTokens = this.estimateTokens(systemInstruction);
        for (const msg of immediateMessages) {
          totalTokens += this.estimateTokens(msg.text);
        }
      }
    }

    return {
      systemInstruction,
      immediateMessages,
      situationBrief: briefText,
      memoryBlock,
      extendedBlock,
      estimatedTokens: totalTokens,
      truncated,
    };
  }
}

export const contextEngine = new ContextEngine();
