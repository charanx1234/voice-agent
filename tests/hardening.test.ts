import { describe, it, expect } from 'vitest';
import path from 'path';
import { buildModelCandidates, isModelUnavailableError, normalizeConversationHistory, buildToolResponseTurn } from '../src/services/ai/gemini';
import { isInsideDirectory } from '../src/services/agent/projectSearchTool';

describe('Gemini model fallback', () => {
  it('tries the configured model first', () => {
    expect(buildModelCandidates('gemini-3.8-flash')[0]).toBe('gemini-3.8-flash');
  });

  it('de-duplicates candidates while keeping fallbacks', () => {
    const candidates = buildModelCandidates('gemini-2.5-flash');
    expect(new Set(candidates).size).toBe(candidates.length);
    expect(candidates.length).toBeGreaterThan(1);
  });

  it('falls back to a default when nothing is configured', () => {
    expect(buildModelCandidates(undefined)[0]).toBe('gemini-3.5-flash-lite');
    expect(buildModelCandidates('   ')[0]).toBe('gemini-3.5-flash-lite');
  });

  it('recognises a missing-model error', () => {
    expect(isModelUnavailableError(new Error('404 model not found'))).toBe(true);
    expect(isModelUnavailableError(new Error('INVALID_ARGUMENT: model does not exist'))).toBe(true);
  });

  it('does not retry a different model for rate limits or auth failures', () => {
    expect(isModelUnavailableError(new Error('429 quota exceeded'))).toBe(false);
    expect(isModelUnavailableError(new Error('API key not valid'))).toBe(false);
  });
});

describe('Conversation history normalisation', () => {
  const msg = (role: 'user' | 'assistant', text: string, isError = false) => ({
    id: `${role}-${text}`,
    role,
    text,
    timestamp: Date.now(),
    isError,
  });

  it('drops the opening greeting so history starts with the user', () => {
    const history = normalizeConversationHistory([
      msg('assistant', 'నమస్కారం! నేను FRIDAY.'),
      msg('user', 'హలో'),
      msg('assistant', 'హాయ్!'),
    ]);

    expect(history[0].role).toBe('user');
    expect(history.map((m) => m.text)).toEqual(['హలో', 'హాయ్!']);
  });

  it('merges consecutive same-role turns so roles alternate', () => {
    const history = normalizeConversationHistory([
      msg('user', 'one'),
      msg('user', 'two'),
      msg('assistant', 'reply'),
    ]);

    expect(history.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(history[0].text).toBe('one\n\ntwo');
  });

  it('skips error bubbles, which are not real model output', () => {
    const history = normalizeConversationHistory([
      msg('user', 'hello'),
      msg('assistant', 'I could not complete that request', true),
      msg('assistant', 'real answer'),
    ]);

    expect(history.map((m) => m.text)).toEqual(['hello', 'real answer']);
  });

  it('returns an empty list when there is nothing usable', () => {
    expect(normalizeConversationHistory([])).toEqual([]);
    expect(normalizeConversationHistory([msg('assistant', 'only a greeting')])).toEqual([]);
  });
});

describe('Tool result turns', () => {
  it('sends tool results with the user role, which the API accepts', () => {
    const turn = buildToolResponseTurn([
      { functionResponse: { name: 'save_note', response: { success: true } } },
    ]);

    expect(turn.role).toBe('user');
    expect(turn.parts).toHaveLength(1);
    // The legacy SDK used role 'function', which the API now rejects with a 400.
    expect(turn.role).not.toBe('function');
  });
});

describe('Approved folder boundary', () => {
  const root = path.resolve('C:/projects/app');

  it('accepts a path nested inside the approved folder', () => {
    expect(isInsideDirectory(path.join(root, 'src', 'a.ts'), root)).toBe(true);
  });

  it('rejects the root itself and its siblings', () => {
    expect(isInsideDirectory(root, root)).toBe(false);
    expect(isInsideDirectory(path.resolve('C:/projects/other/a.ts'), root)).toBe(false);
  });

  it('rejects traversal out of the approved folder', () => {
    expect(isInsideDirectory(path.join(root, '..', 'secret.txt'), root)).toBe(false);
  });
});
