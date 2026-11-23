/**
 * FRIDAY Cognitive Engine — Lightweight Intent Router (TypeScript)
 * Deterministic, context-aware intent classification across 13 core categories.
 */

import { ChatMessage, IntentCategory } from '../../../shared/types';

export interface IntentClassificationResult {
  category: IntentCategory;
  confidence: number;
  detectedPatterns: string[];
  isContextualFollowUp: boolean;
  underlyingIntent?: IntentCategory;
  suggestedTools: string[];
}

export class IntentRouter {
  // 1. Screen Understanding Patterns
  private static readonly SCREEN_PATTERNS = [
    /\b(screen|display|monitor|window|screenshot|look at (this|my screen)|what('s| is) on my screen)\b/i,
    /\b(analyze (this|my) screen|see this error|read (this|the) text on screen)\b/i,
  ];

  // 2. Desktop Automation Patterns
  private static readonly DESKTOP_PATTERNS = [
    /\b(open|launch|start|run|close|kill|quit|maximize|minimize|restore)\s+[a-z0-9_.-]+/i,
    /\b(mute|unmute|volume (up|down|to|set)|brightness (up|down|to|set)|sleep|shutdown|restart)\b/i,
    /\b(move mouse|click (start|button|here)|scroll (up|down)|type (this|my clipboard))\b/i,
    /\b(open chey|close chey|chalao|kholo|band karo)\b/i,
  ];

  // 3. File Operations Patterns
  private static readonly FILE_PATTERNS = [
    /\b(file|folder|directory|rename|move file|delete file|copy file|find file|search folder|list files)\b/i,
    /\b(read file|save note|list notes|delete note|batch rename)\b/i,
  ];

  // 4. Memory Management Patterns
  private static readonly MEMORY_PATTERNS = [
    /\b(remember (that|this)|don't forget|save to memory|what do you remember|forget (that|everything)|my favorite|my preference)\b/i,
    /\b(gurthupettuko|yaad rakhna)\b/i,
  ];

  // 5. Debugging Patterns
  private static readonly DEBUGGING_PATTERNS = [
    /\b(debug|bug|bugs|error|errors|exception|exceptions|crash|crashes|crashing|stack trace|segfault|nullpointer|failed|fails|broken|not working|doesn't work|fix this|resolve|race condition|deadlock|concurrency|[a-z]+error|[a-z]+exception)\b/i,
    /\b(why (is this|isn't this|does this) (fail|error|break|not work)|work avvatledu|error vastundi)\b/i,
  ];

  // 6. Planning & Architecture Patterns
  private static readonly PLANNING_PATTERNS = [
    /\b(plan|architecture|roadmap|strategy|design (system|architecture)|step by step guide|how should we structure)\b/i,
    /\b(milestones|project setup|workflow design)\b/i,
  ];

  // 7. Comparison Patterns
  private static readonly COMPARISON_PATTERNS = [
    /\b(compare|versus|vs\.?|difference between|better than|pros and cons|which is better|tradeoffs?)\b/i,
  ];

  // 8. Mathematical Reasoning Patterns
  private static readonly MATH_PATTERNS = [
    /\b(calculate|compute|solve|equation|integral|derivative|matrix|algebra|probability|statistics|sin|cos|log|\d+\s*[\+\-\*\/\^]\s*\d+)\b/i,
    /\b(what is \d+ (plus|minus|times|divided by|percent of))\b/i,
  ];

  // 9. Learning & Explanation Patterns
  private static readonly LEARNING_PATTERNS = [
    /\b(explain|teach me|how does .* work|what (is|are)( the concept of| a| an)?|define|definition of|walk me through|understand)\b/i,
  ];

  // 10. Programming Patterns
  private static readonly PROGRAMMING_PATTERNS = [
    /\b(code|function|class|method|interface|algorithm|typescript|javascript|python|react|html|css|sql|rust|c\+\+|api|refactor|compile)\b/i,
    /\b(write a script|generate (code|function)|create a component|regex)\b/i,
  ];

  // 11. Research Patterns
  private static readonly RESEARCH_PATTERNS = [
    /\b(research|search web|google|lookup|find out|latest news|current price|weather|forecast|who is|when was)\b/i,
    /\b(information on|tell me about current|weather in)\b/i,
  ];

  // 12. Follow-Up Indicators
  private static readonly FOLLOW_UP_PATTERNS = [
    /^(why|how|and|so|then|what about|how about|but|also|why not|can you elaborate|explain more)\b/i,
    /\b(it|that|this|those|these|the same|the previous|what you just said)\b/i,
  ];

  public classify(
    message: string,
    conversationHistory: ChatMessage[] = []
  ): IntentClassificationResult {
    const text = (message || '').trim();

    if (!text) {
      return {
        category: 'general_conversation',
        confidence: 0.5,
        detectedPatterns: ['empty_input'],
        isContextualFollowUp: false,
        suggestedTools: [],
      };
    }

    // Contextual follow-up check
    let isFollowUp = false;
    let underlying: IntentCategory | undefined = undefined;
    const words = text.split(/\s+/);

    if (words.length <= 7 && IntentRouter.FOLLOW_UP_PATTERNS.some((p) => p.test(text))) {
      isFollowUp = true;
      if (conversationHistory.length > 0) {
        const lastUserMsg = [...conversationHistory]
          .reverse()
          .find((m) => m.role === 'user')?.text;
        if (lastUserMsg) {
          const prevResult = this.classify(lastUserMsg, []);
          underlying = prevResult.category;
        }
      }
    }

    // 1. Screen Understanding
    for (const pat of IntentRouter.SCREEN_PATTERNS) {
      if (pat.test(text)) {
        return {
          category: 'screen_understanding',
          confidence: 0.95,
          detectedPatterns: [pat.source],
          isContextualFollowUp: isFollowUp,
          suggestedTools: ['capture_screen', 'analyze_screen_region'],
        };
      }
    }

    // 2. Desktop Automation
    for (const pat of IntentRouter.DESKTOP_PATTERNS) {
      if (pat.test(text)) {
        return {
          category: 'desktop_automation',
          confidence: 0.92,
          detectedPatterns: [pat.source],
          isContextualFollowUp: isFollowUp,
          suggestedTools: ['launch_allowed_app', 'control_system_volume', 'windows_brightness'],
        };
      }
    }

    // 3. File Operations
    for (const pat of IntentRouter.FILE_PATTERNS) {
      if (pat.test(text)) {
        return {
          category: 'file_operations',
          confidence: 0.88,
          detectedPatterns: [pat.source],
          isContextualFollowUp: isFollowUp,
          suggestedTools: ['find_files', 'save_note', 'batch_renamer'],
        };
      }
    }

    // 4. Memory Management
    for (const pat of IntentRouter.MEMORY_PATTERNS) {
      if (pat.test(text)) {
        return {
          category: 'memory_management',
          confidence: 0.90,
          detectedPatterns: [pat.source],
          isContextualFollowUp: isFollowUp,
          suggestedTools: ['save_memory', 'search_memory'],
        };
      }
    }

    // 5. Debugging
    for (const pat of IntentRouter.DEBUGGING_PATTERNS) {
      if (pat.test(text)) {
        return {
          category: 'debugging',
          confidence: 0.89,
          detectedPatterns: [pat.source],
          isContextualFollowUp: isFollowUp,
          underlyingIntent: underlying,
          suggestedTools: [],
        };
      }
    }

    // 6. Planning & Architecture
    for (const pat of IntentRouter.PLANNING_PATTERNS) {
      if (pat.test(text)) {
        return {
          category: 'planning',
          confidence: 0.86,
          detectedPatterns: [pat.source],
          isContextualFollowUp: isFollowUp,
          suggestedTools: [],
        };
      }
    }

    // 7. Comparison
    for (const pat of IntentRouter.COMPARISON_PATTERNS) {
      if (pat.test(text)) {
        return {
          category: 'comparison',
          confidence: 0.85,
          detectedPatterns: [pat.source],
          isContextualFollowUp: isFollowUp,
          suggestedTools: [],
        };
      }
    }

    // 8. Mathematical Reasoning
    for (const pat of IntentRouter.MATH_PATTERNS) {
      if (pat.test(text)) {
        return {
          category: 'mathematical_reasoning',
          confidence: 0.88,
          detectedPatterns: [pat.source],
          isContextualFollowUp: isFollowUp,
          suggestedTools: [],
        };
      }
    }

    // 9. Learning & Explanation (Evaluated before general programming keywords)
    for (const pat of IntentRouter.LEARNING_PATTERNS) {
      if (pat.test(text)) {
        return {
          category: 'learning_explanation',
          confidence: 0.88,
          detectedPatterns: [pat.source],
          isContextualFollowUp: isFollowUp,
          suggestedTools: [],
        };
      }
    }

    // 10. Programming
    for (const pat of IntentRouter.PROGRAMMING_PATTERNS) {
      if (pat.test(text)) {
        return {
          category: 'programming',
          confidence: 0.84,
          detectedPatterns: [pat.source],
          isContextualFollowUp: isFollowUp,
          suggestedTools: [],
        };
      }
    }

    // 11. Research
    for (const pat of IntentRouter.RESEARCH_PATTERNS) {
      if (pat.test(text)) {
        return {
          category: 'research',
          confidence: 0.82,
          detectedPatterns: [pat.source],
          isContextualFollowUp: isFollowUp,
          suggestedTools: ['web_search', 'get_live_weather'],
        };
      }
    }

    // 12. Standalone follow-up with prior context
    if (isFollowUp && underlying) {
      return {
        category: 'follow_up',
        confidence: 0.80,
        detectedPatterns: ['contextual_follow_up'],
        isContextualFollowUp: true,
        underlyingIntent: underlying,
        suggestedTools: [],
      };
    }

    // Default: General Conversation
    return {
      category: 'general_conversation',
      confidence: 0.70,
      detectedPatterns: ['default_conversational'],
      isContextualFollowUp: isFollowUp,
      suggestedTools: [],
    };
  }
}

export const intentRouter = new IntentRouter();
