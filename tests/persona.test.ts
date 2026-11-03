import { describe, it, expect } from 'vitest';
import { PERSONA_VERSION, buildPersonaInstruction } from '../src/services/ai/persona';
import { buildSystemInstruction } from '../src/services/ai/personality';

describe('FRIDAY persona', () => {
  it('defines a warm friend-like assistant identity with honest boundaries', () => {
    const prompt = buildPersonaInstruction({ preferredLanguage: 'en-IN' });

    expect(prompt).toContain('personal AI assistant');
    expect(prompt).toContain('trusted everyday friend');
    expect(prompt).toContain('virtual girlfriend');
    expect(prompt).toContain('command-only interface');
  });

  it('requires opinions, disagreement and clear recommendations', () => {
    const prompt = buildPersonaInstruction();

    expect(prompt).toContain('OPINIONS');
    expect(prompt).toMatch(/disagree/i);
    expect(prompt).toMatch(/one clear recommendation/i);
    expect(prompt).toMatch(/separate fact from opinion/i);
    expect(prompt).toMatch(/never invent/i);
  });

  it('covers conversation handling and anti-sycophancy tone', () => {
    const prompt = buildPersonaInstruction();

    expect(prompt).toMatch(/incomplete/i);
    expect(prompt).toMatch(/follow-up question/i);
    expect(prompt).toMatch(/no corporate filler/i);
    expect(prompt).toMatch(/no motivational quotes/i);
    expect(prompt).toMatch(/never claim human experiences/i);
  });

  it('adapts to context: coding, learning, casual, mistakes', () => {
    const prompt = buildPersonaInstruction();

    expect(prompt).toMatch(/Coding: precise/i);
    expect(prompt).toMatch(/Learning: patient/i);
    expect(prompt).toMatch(/Casual conversation/i);
    expect(prompt).toMatch(/Mistakes|Debugging/i);
  });

  it('includes the tool contract and dashboard behaviour', () => {
    const prompt = buildPersonaInstruction();

    for (const tool of [
      'save_note',
      'create_reminder',
      'list_reminders',
      'search_project_folder',
      'search_web',
      'launch_allowed_app',
      'save_memory',
      'show_on_dashboard',
    ]) {
      expect(prompt).toContain(tool);
    }
    expect(prompt).toMatch(/short spoken summary/i);
  });

  it('injects the language guidance for the preferred language', () => {
    expect(buildPersonaInstruction({ preferredLanguage: 'te-IN' })).toContain('Telugu');
    expect(buildPersonaInstruction({ preferredLanguage: 'hi-IN' })).toContain('Hindi');
  });

  it('appends retrieved memories and ignores an empty block', () => {
    const memory = 'LONG-TERM MEMORY (things you remember):\n- User prefers Telugu.';
    expect(buildPersonaInstruction({ memoryContext: memory })).toContain('User prefers Telugu');
    expect(buildPersonaInstruction({ memoryContext: '   ' })).not.toContain('LONG-TERM MEMORY');
  });

  it('contains no canned example dialogue', () => {
    const prompt = buildPersonaInstruction();

    expect(prompt).not.toMatch(/^\s*Me:/m);
    expect(prompt).not.toMatch(/^\s*FRIDAY:/m);
    expect(prompt).not.toContain('Honestly, I like the idea');
  });

  it('is exposed through the stable personality entry point', () => {
    const viaWrapper = buildSystemInstruction('en-IN', 'MEMORY BLOCK');
    expect(viaWrapper).toContain('personal AI assistant');
    expect(viaWrapper).toContain('MEMORY BLOCK');
    expect(PERSONA_VERSION).toBeGreaterThanOrEqual(2);
  });

  it('keeps personality modes separate from the shared tool contract', () => {
    const simple = buildPersonaInstruction({ personalityMode: 'simple' });
    const moderate = buildPersonaInstruction({ personalityMode: 'moderate' });
    const roast = buildPersonaInstruction({ personalityMode: 'roast' });

    expect(simple).toContain('PERSONALITY MODE: SIMPLE');
    expect(moderate).toContain('PERSONALITY MODE: MODERATE');
    expect(roast).toContain('PERSONALITY MODE: ROAST');
    expect(simple).toContain('No teasing or sarcasm');
    expect(moderate).toContain('thoughtful teammate');
    expect(roast).toContain('witty friend');
    for (const tool of ['save_note', 'create_reminder', 'search_web', 'set_personality_mode']) {
      expect(simple).toContain(tool);
      expect(moderate).toContain(tool);
      expect(roast).toContain(tool);
    }
  });
});
