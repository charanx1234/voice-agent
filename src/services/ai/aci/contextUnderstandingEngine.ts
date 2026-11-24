/**
 * FRIDAY Adaptive Conversational Intelligence (ACI) V1 — Context Understanding Engine
 * Multi-turn context understanding: intent, task identification, requested depth,
 * project continuity, interaction mode, and anaphora/reference tracking.
 */

import { ChatMessage } from '../../../shared/types';
import { ContextUnderstandingResult, InteractionMode, ResponseDepthLevel } from './types';

// Patterns for explicit depth requests
const DEPTH_PATTERNS: Array<{ pattern: RegExp; level: ResponseDepthLevel }> = [
  { pattern: /\b(in one word|single word|yes or no only|1 word|one word answer)\b/i, level: 'D0' },
  { pattern: /\b(briefly|short answer|in one sentence|in 1 sentence|tldr|tl;dr|quick summary|keep it short|concise|nutshell)\b/i, level: 'D1' },
  { pattern: /\b(explain in detail|detailed explanation|give me a thorough breakdown|elaborate|step by step|comprehensive guide|with examples)\b/i, level: 'D3' },
  { pattern: /\b(in depth|deep dive|comprehensive analysis|full architectural breakdown|all edge cases|rigorous analysis|exhaustively)\b/i, level: 'D4' },
];

// Patterns for interaction mode classification
const CASUAL_PATTERNS = [
  /^(hi|hello|hey|good (morning|afternoon|evening|night)|how are you|what's up|sup|how's it going|namaste|ela unnavu|wassup)\b/i,
  /\b(nice weather|just chilling|bored|tell me a joke|how do you feel|who are you|what are you doing)\b/i,
];

const TROUBLESHOOTING_PATTERNS = [
  /\b(troubleshoot|troubleshooting|debug|bug|error|exception|crash|fails|failing|not working|broken|work avvatledu|error vastundi|cannot connect|refused|segfault|nullpointer|stack trace|fix this|issue with)\b/i,
  /\b(why (is|does) (this|it) (not work|fail|break)|how do i fix)\b/i,
];

const LEARNING_PATTERNS = [
  /\b(explain|teach me|how does .* work|what is the concept of|understand|difference between|why is .* used|walk me through|concept of)\b/i,
  /\b(what does .* mean|meaning of|definition of)\b/i,
];

const RESEARCH_PATTERNS = [
  /\b(research|compare|pros and cons|which is better|tradeoffs|benchmark|latest developments|state of the art|alternatives to|survey of)\b/i,
  /\b(deep dive|exhaustive|architectur(e|al)|overview of|market analysis|find papers|search the web)\b/i,
];

const BRAINSTORMING_PATTERNS = [
  /\b(brainstorm|ideas for|suggest some|what should i build|come up with|creative names|options for|project ideas|feature ideas)\b/i,
];

const TASK_EXECUTION_PATTERNS = [
  /\b(open|launch|start|close|kill|quit|maximize|minimize)\s+[a-z0-9_.-]+/i,
  /\b(set volume|mute|brightness|save note|list notes|find file|batch rename|type clipboard|take screenshot|create reminder)\b/i,
  /\b(open chey|close chey|chalao|kholo|band karo)\b/i,
];

// Reference / follow-up pronouns
const REFERENCE_INDICATORS = [
  /\b(it|that|this|those|these|the same|the previous|what you said|as mentioned|earlier|above|your suggestion)\b/i,
  /^(why|how|and|so|then|what about|how about|but|also|why not)\b/i,
];

export class ContextUnderstandingEngine {
  /**
   * Analyzes current message along with rolling conversation history to establish
   * multi-turn context, ongoing task, interaction mode, and references.
   */
  public analyze(
    currentMessage: string = '',
    history: ChatMessage[] = [],
    retrievedContext: string = ''
  ): ContextUnderstandingResult {
    const text = currentMessage.trim();
    const cleanHistory = (Array.isArray(history) ? history : []).filter(
      (m) => m && m.role !== 'system' && (m.text || '').trim().length > 0
    );

    // 1. Detect requested depth
    let requestedDepth: ResponseDepthLevel | undefined = undefined;
    for (const dp of DEPTH_PATTERNS) {
      if (dp.pattern.test(text)) {
        requestedDepth = dp.level;
        break;
      }
    }

    // 2. Multi-turn reference and continuity detection
    const isFollowUp = REFERENCE_INDICATORS.some((pat) => pat.test(text)) || text.split(/\s+/).length <= 4;
    const previousReferences: string[] = [];

    // Extract key entities or topics from recent turns (up to 4 previous turns)
    const recentTurns = cleanHistory.slice(-4);
    for (const turn of recentTurns) {
      if (turn.role === 'user' && turn.text) {
        previousReferences.push(turn.text.slice(0, 80));
      }
    }

    // 3. Ongoing project context extraction
    let ongoingProjectContext: string | undefined = undefined;
    const projectRegex = /\b(?:working on|building|developing|project called|in my (?:app|codebase|repo|system))\s+([a-zA-Z0-9_-]+)/i;
    const matchProj = text.match(projectRegex) || (cleanHistory.length > 0 ? cleanHistory[cleanHistory.length - 1].text.match(projectRegex) : null);
    if (matchProj && matchProj[1]) {
      ongoingProjectContext = matchProj[1];
    }

    // 4. Determine Interaction Mode
    // Check current turn first
    let mode: InteractionMode = 'casual_chatting';
    let intentCategory = 'general_conversation';
    let currentTask = 'conversing';

    if (TASK_EXECUTION_PATTERNS.some((p) => p.test(text))) {
      mode = 'executing_tasks';
      intentCategory = 'desktop_automation';
      currentTask = 'executing_desktop_or_system_action';
    } else if (TROUBLESHOOTING_PATTERNS.some((p) => p.test(text))) {
      mode = 'troubleshooting';
      intentCategory = 'debugging';
      currentTask = 'resolving_issue_or_debugging';
    } else if (LEARNING_PATTERNS.some((p) => p.test(text))) {
      mode = 'learning';
      intentCategory = 'learning_explanation';
      currentTask = 'explaining_concept_or_tutoring';
    } else if (RESEARCH_PATTERNS.some((p) => p.test(text))) {
      mode = 'researching';
      intentCategory = 'research';
      currentTask = 'research_and_comparison';
    } else if (BRAINSTORMING_PATTERNS.some((p) => p.test(text))) {
      mode = 'brainstorming';
      intentCategory = 'planning';
      currentTask = 'ideation_and_brainstorming';
    } else if (CASUAL_PATTERNS.some((p) => p.test(text))) {
      mode = 'casual_chatting';
      intentCategory = 'general_conversation';
      currentTask = 'casual_greeting_or_chat';
    } else if (isFollowUp && cleanHistory.length > 0) {
      // MULTI-TURN CONTINUITY: if current message is short or a follow-up, inherit mode from previous user turn!
      const lastUserMsg = [...cleanHistory].reverse().find((m) => m.role === 'user');
      if (lastUserMsg && lastUserMsg.text) {
        const lastText = lastUserMsg.text;
        if (TROUBLESHOOTING_PATTERNS.some((p) => p.test(lastText))) {
          mode = 'troubleshooting';
          intentCategory = 'debugging';
          currentTask = `follow_up_on_${lastText.slice(0, 30).trim()}`;
        } else if (LEARNING_PATTERNS.some((p) => p.test(lastText))) {
          mode = 'learning';
          intentCategory = 'learning_explanation';
          currentTask = `learning_continuation_${lastText.slice(0, 30).trim()}`;
        } else if (RESEARCH_PATTERNS.some((p) => p.test(lastText))) {
          mode = 'researching';
          intentCategory = 'research';
          currentTask = `research_continuation_${lastText.slice(0, 30).trim()}`;
        } else if (BRAINSTORMING_PATTERNS.some((p) => p.test(lastText))) {
          mode = 'brainstorming';
          intentCategory = 'planning';
          currentTask = `brainstorming_continuation`;
        }
      }
    }

    // 5. Compute confidence
    let confidence = 0.85;
    if (isFollowUp && cleanHistory.length === 0) {
      confidence = 0.65;
    } else if (cleanHistory.length > 2) {
      confidence = 0.92;
    }

    return {
      intent: intentCategory,
      currentTask,
      category: intentCategory,
      requestedDepth,
      ongoingProjectContext,
      previousRelevantReferences: previousReferences,
      interactionMode: mode,
      isMultiTurnFollowUp: isFollowUp,
      confidence: Math.round(confidence * 100) / 100,
    };
  }
}

export const contextUnderstandingEngine = new ContextUnderstandingEngine();
