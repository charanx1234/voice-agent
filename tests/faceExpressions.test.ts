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

  it('correctly detects all 9 core visual expressions from reference', () => {
    // 1. Happy
    expect(selectFaceExpression({ state: 'speaking', text: 'I am so happy and proud of you' })).toBe('happy');
    // 2. Sad
    expect(selectFaceExpression({ state: 'speaking', text: 'I feel so sad and depressed today' })).toBe('sad');
    // 3. Crying
    expect(selectFaceExpression({ state: 'speaking', text: 'I am sobbing in tears right now' })).toBe('crying');
    // 4. Angry
    expect(selectFaceExpression({ state: 'speaking', text: 'This is completely unfair and I am furious' })).toBe('angry');
    // 5. Satisfied
    expect(selectFaceExpression({ state: 'speaking', text: 'Everything is done and solved, thank you' })).toBe('satisfied');
    // 6. Sarcastic
    expect(selectFaceExpression({ state: 'speaking', text: 'Oh really, you are such a genius obviously' })).toBe('sarcastic');
    // 7. Laugh
    expect(selectFaceExpression({ state: 'speaking', text: 'LMAO that joke was so funny haha' })).toBe('laughing');
    // 8. Smile
    expect(selectFaceExpression({ state: 'speaking', text: 'Hello, good morning Friday!' })).toBe('smile');
    // 9. Not Happy
    expect(selectFaceExpression({ state: 'speaking', text: 'I am not happy with this, it is so disappointing and lame' })).toBe('not-happy');
  });

  it('integrates distinct visual deliveries by personality mode', () => {
    // Simple Mode: warm, smile, satisfied
    expect(selectFaceExpression({ state: 'speaking', personalityMode: 'simple' })).toBe('satisfied');
    expect(selectFaceExpression({ state: 'idle', personalityMode: 'simple' })).toBe('smile');

    // Moderate Mode: balanced, contextual
    expect(selectFaceExpression({ state: 'speaking', personalityMode: 'moderate', mood: 'playful' })).toBe('smile');
    expect(selectFaceExpression({ state: 'idle', personalityMode: 'moderate' })).toBe('neutral');

    // Roast Mode: sarcastic, confident smirk, unimpressed
    expect(selectFaceExpression({ state: 'speaking', personalityMode: 'roast' })).toBe('sarcastic');
    expect(selectFaceExpression({ state: 'idle', personalityMode: 'roast' })).toBe('not-happy');
  });
});
