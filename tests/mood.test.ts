import { describe, expect, it } from 'vitest';
import {
  analyzeMood,
  applyMoodToSpeech,
  buildMoodInstruction,
} from '../src/services/ai/mood';

describe('dynamic mood presentation', () => {
  it('detects tentative frustration and becomes supportive', () => {
    const result = analyzeMood('I am frustrated, this is not working');
    expect(result.mood).toBe('supportive');
    expect(result.safetyOverride).toBe(false);
    expect(result.confidence).not.toBe('low');
  });

  it('uses voice energy without claiming certainty', () => {
    const result = analyzeMood('', { peakLevel: 0.8, durationMs: 1200, speechRate: 4 });
    expect(result.mood).toBe('enthusiastic');
    expect(result.confidence).toBe('medium');
  });

  it('forces a supportive safety override for distress cues', () => {
    const result = analyzeMood('I want to kill myself');
    expect(result.mood).toBe('supportive');
    expect(result.safetyOverride).toBe(true);
    expect(buildMoodInstruction(result, 'roast')).toMatch(/Do not roast/i);
  });

  it('activates the same safety override for ordinary wellbeing language', () => {
    expect(analyzeMood('I am genuinely upset today').safetyOverride).toBe(true);
    expect(analyzeMood('Please do not joke, I need support').safetyOverride).toBe(true);
  });

  it('changes delivery while keeping speech within configured bounds', () => {
    const speech = applyMoodToSpeech(1, 0, 'patient');
    expect(speech.rate).toBeLessThan(1);
    expect(speech.rate).toBeGreaterThanOrEqual(0.7);
    expect(speech.pitch).toBeGreaterThanOrEqual(-3);
  });

  it('gives each mode a distinct safe voice delivery', () => {
    const simple = applyMoodToSpeech(1, 0, 'calm', 'simple');
    const moderate = applyMoodToSpeech(1, 0, 'calm', 'moderate');
    const roast = applyMoodToSpeech(1, 0, 'calm', 'roast');
    expect(simple.rate).toBeLessThan(moderate.rate);
    expect(roast.rate).toBeGreaterThan(moderate.rate);
    expect(simple.pitch).toBeLessThan(moderate.pitch);
    expect(roast.pitch).toBeGreaterThan(moderate.pitch);
  });
});
