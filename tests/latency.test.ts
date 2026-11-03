import { describe, expect, it } from 'vitest';
import { getLocalResponse } from '../src/services/ai/localResponses';
import { takeCompleteSpeechChunks } from '../src/services/voice/speechText';

describe('fast response path', () => {
  it('answers deterministic presence questions without a model call', () => {
    expect(getLocalResponse('are you there?', 'en-IN')?.text).toBe('I’m here and listening.');
    expect(getLocalResponse('are you there?', 'en-IN', 'simple')?.text).toContain('with you');
    expect(getLocalResponse('are you there?', 'en-IN', 'roast')?.text).toContain('Try not to panic');
    expect(getLocalResponse('hello', 'en-IN', 'simple')?.text).not.toBe(
      getLocalResponse('hello', 'en-IN', 'roast')?.text
    );
    expect(getLocalResponse('explain promises', 'en-IN')).toBeNull();
  });

  it('answers identity questions naturally in every mode', () => {
    const simple = getLocalResponse('who the hell are you?', 'en-IN', 'simple')?.text || '';
    const moderate = getLocalResponse('who the hell are you?', 'en-IN', 'moderate')?.text || '';
    const roast = getLocalResponse('who the hell are you?', 'en-IN', 'roast')?.text || '';
    expect(simple).toMatch(/FRIDAY/i);
    expect(moderate).toMatch(/desktop assistant/i);
    expect(roast).toMatch(/FRIDAY/i);
    expect(simple).not.toContain('exactly');
    expect(roast).not.toContain('system prompt');
  });

  it('releases complete sentences while preserving the unfinished phrase', () => {
    const result = takeCompleteSpeechChunks('The first answer is ready. The second');
    expect(result.complete).toEqual(['The first answer is ready.']);
    expect(result.remainder).toBe('The second');
  });
});
