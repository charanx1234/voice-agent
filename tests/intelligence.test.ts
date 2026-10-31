import { describe, it, expect } from 'vitest';
import {
  buildConversationBrief,
  detectMode,
  extractConstraints,
  extractTopic,
  isFollowUp,
} from '../src/services/ai/conversationContext';
import { buildPersonaInstruction } from '../src/services/ai/persona';
import type { ChatMessage } from '../src/shared/types';

const message = (role: 'user' | 'assistant', text: string): ChatMessage => ({
  id: `${role}-${text}`,
  role,
  text,
  timestamp: Date.now(),
});

describe('Conversation mode detection', () => {
  it('classifies technical, educational, debate, serious and casual turns', () => {
    expect(detectMode('my electron build fails with a stack trace')).toBe('technical');
    expect(detectMode('explain how promises work')).toBe('educational');
    expect(detectMode('i think we should rewrite the whole thing')).toBe('debate');
    expect(detectMode('is this chest pain something serious')).toBe('serious');
    expect(detectMode('hey, how are you')).toBe('casual');
  });
});

describe('Topic and follow-up tracking', () => {
  it('strips filler so the topic is meaningful', () => {
    expect(extractTopic('can you explain the memory system?')).toBe('the memory system');
    expect(extractTopic('   ')).toBe('');
  });

  it('recognises follow-up questions', () => {
    const history = [message('user', 'Tell me about SQLite')];
    expect(isFollowUp('why?', history)).toBe(true);
    expect(isFollowUp('and the second one', history)).toBe(true);
    expect(isFollowUp('Write a Python script that parses CSV files', history)).toBe(false);
  });

  it('collects constraints the user already stated', () => {
    const history = [
      message('user', 'I prefer TypeScript over JavaScript.'),
      message('user', 'Only target Windows please.'),
    ];
    const constraints = extractConstraints(history);
    expect(constraints.join(' ')).toContain('TypeScript');
    expect(constraints.join(' ')).toContain('Windows');
  });

  it('builds a situation brief with mode, topic and depth guidance', () => {
    const brief = buildConversationBrief(
      [message('user', 'I prefer TypeScript.')],
      'i think we should rewrite the app'
    );

    expect(brief.mode).toBe('debate');
    expect(brief.text).toContain('Conversation mode: debate');
    expect(brief.text).toContain('Response depth');
    expect(brief.text).toContain('never mention this block');
  });
});

describe('Persona reasoning upgrades', () => {
  it('includes the silent reasoning workflow and debate rules', () => {
    const prompt = buildPersonaInstruction();

    expect(prompt).toContain('BEFORE YOU ANSWER');
    expect(prompt).toContain('never print these steps');
    expect(prompt).toContain('WHEN DISCUSSING IDEAS');
    expect(prompt).toContain('straw man');
    expect(prompt).toContain('MATCH THE DEPTH');
    expect(prompt).toContain('Never pad');
  });

  it('injects the conversation brief ahead of memory context', () => {
    const prompt = buildPersonaInstruction({
      conversationBrief: 'SITUATION THIS TURN: testing',
      memoryContext: 'MEMORY: user likes tea',
    });

    expect(prompt).toContain('SITUATION THIS TURN: testing');
    expect(prompt.indexOf('SITUATION THIS TURN')).toBeLessThan(prompt.indexOf('MEMORY: user likes tea'));
  });
});
