import { describe, expect, it } from 'vitest';
import { selectFaceExpression } from '../src/services/ai/faceExpressions';

describe('FRIDAY face expression selection', () => {
  it('uses conversation cues instead of random expressions', () => {
    expect(selectFaceExpression({ state: 'speaking', text: 'haha that is hilarious' })).toBe('laughing');
    expect(selectFaceExpression({ state: 'speaking', mood: 'enthusiastic', text: 'great news, we won!' })).toBe('excited');
    expect(selectFaceExpression({ state: 'thinking', text: 'I feel overwhelmed today' })).toBe('sad');
    expect(selectFaceExpression({ state: 'speaking', text: 'I do not understand this' })).toBe('confused');
  });

  it('reflects the active states and personality mode', () => {
    expect(selectFaceExpression({ state: 'listening' })).toBe('curious');
    expect(selectFaceExpression({ state: 'thinking' })).toBe('thinking');
    expect(selectFaceExpression({ state: 'interrupted' })).toBe('surprised');
    expect(selectFaceExpression({ state: 'sleeping' })).toBe('sleepy');
    expect(selectFaceExpression({ state: 'speaking', mood: 'playful', personalityMode: 'roast' })).toBe('sarcastic');
  });
});
