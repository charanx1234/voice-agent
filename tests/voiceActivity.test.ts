import { describe, expect, it } from 'vitest';
import { VoiceActivityDetector, DEFAULT_VAD_OPTIONS, BARGE_IN_VAD_OPTIONS } from '../src/services/voice/voiceActivity';

describe('Voice activity detection', () => {
  it('uses sensible defaults', () => {
    expect(DEFAULT_VAD_OPTIONS.startThreshold).toBeGreaterThan(0);
    expect(DEFAULT_VAD_OPTIONS.endThreshold).toBeLessThan(DEFAULT_VAD_OPTIONS.startThreshold);
    expect(DEFAULT_VAD_OPTIONS.speechStartMs).toBeGreaterThan(0);
    expect(DEFAULT_VAD_OPTIONS.speechEndMs).toBeGreaterThan(0);
  });

  it('has stricter barge-in thresholds', () => {
    expect(BARGE_IN_VAD_OPTIONS.startThreshold).toBeGreaterThanOrEqual(DEFAULT_VAD_OPTIONS.startThreshold);
  });

  it('does not start until speech is sustained', () => {
    const vad = new VoiceActivityDetector({ startThreshold: 0.2, speechStartMs: 200, endThreshold: 0.05, speechEndMs: 300 });
    expect(vad.update(0.25, 0)).toBeNull();
    expect(vad.update(0.25, 150)).toBeNull();
    expect(vad.update(0.25, 250)).toEqual({ type: 'start' });
    expect(vad.isSpeaking).toBe(true);
  });

  it('resets loud timer when level drops below threshold', () => {
    const vad = new VoiceActivityDetector({ startThreshold: 0.2, speechStartMs: 200, endThreshold: 0.05, speechEndMs: 300 });
    expect(vad.update(0.25, 0)).toBeNull();
    expect(vad.update(0.1, 150)).toBeNull(); // dropped below
    expect(vad.update(0.25, 200)).toBeNull(); // starts over
    expect(vad.update(0.25, 400)).toEqual({ type: 'start' });
  });

  it('ends after sustained quiet and reports duration/peak', () => {
    const vad = new VoiceActivityDetector({ startThreshold: 0.2, speechStartMs: 100, endThreshold: 0.08, speechEndMs: 400 });
    vad.update(0.25, 0);
    expect(vad.update(0.25, 150)).toEqual({ type: 'start' });
    vad.update(0.5, 200);
    vad.update(0.3, 400);
    expect(vad.update(0.01, 500)).toBeNull();
    expect(vad.update(0.01, 900)).toEqual({ type: 'end', durationMs: 900, peakLevel: 0.5 });
    expect(vad.isSpeaking).toBe(false);
  });

  it('does not end on brief dips', () => {
    const vad = new VoiceActivityDetector({ startThreshold: 0.2, speechStartMs: 100, endThreshold: 0.08, speechEndMs: 400 });
    vad.update(0.25, 0);
    vad.update(0.25, 150); // start
    vad.update(0.01, 200); // dip
    expect(vad.update(0.01, 400)).toBeNull(); // still under
    vad.update(0.3, 500); // back up, resets quiet timer
    expect(vad.update(0.01, 600)).toBeNull();
    expect(vad.update(0.01, 1000)).toEqual({ type: 'end', durationMs: 1000, peakLevel: 0.3 });
  });

  it('finish() force-closes an utterance', () => {
    const vad = new VoiceActivityDetector({ startThreshold: 0.2, speechStartMs: 100, endThreshold: 0.08, speechEndMs: 1000 });
    vad.update(0.25, 0);
    vad.update(0.25, 150);
    expect(vad.finish(500)).toEqual({ type: 'end', durationMs: 500, peakLevel: 0.25 });
    expect(vad.isSpeaking).toBe(false);
    expect(vad.finish(600)).toBeNull();
  });
});
