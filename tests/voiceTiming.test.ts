import { describe, expect, it } from 'vitest';
import { voiceTiming } from '../src/renderer/src/utils/voiceTiming';

describe('VoiceTimingDiagnostics', () => {
  it('measures end-to-end turn latencies and interruption cancellation', () => {
    const turnId = 'turn_test_100';
    const t0 = 1000;
    voiceTiming.startTurn(turnId, t0);
    voiceTiming.recordSpeechEnd(turnId, t0 + 2000);
    voiceTiming.recordTranscriptionStart(turnId, t0 + 2050);
    voiceTiming.recordTranscriptionEnd(turnId, t0 + 2350);
    voiceTiming.recordAiStart(turnId, t0 + 2400);
    voiceTiming.recordFirstToken(turnId, t0 + 2600);
    voiceTiming.recordAiComplete(turnId, t0 + 3000);
    voiceTiming.recordFirstTtsAudio(turnId, t0 + 3100);

    const timing = voiceTiming.getTurnTiming(turnId);
    expect(timing).toBeDefined();
    expect(timing?.speechStartMs).toBe(1000);
    expect(timing?.speechEndMs).toBe(3000);
    expect(timing?.transcriptionEndMs! - timing?.transcriptionStartMs!).toBe(300);
    expect(timing?.firstTokenMs! - timing?.aiStartMs!).toBe(200);
    expect(timing?.aiCompleteMs! - timing?.aiStartMs!).toBe(600);
    expect(timing?.firstTtsAudioMs! - timing?.speechEndMs!).toBe(1100);

    // Test barge-in interruption & playback cancellation
    voiceTiming.recordInterruption(4000);
    voiceTiming.recordPlaybackCancelled(4015);
    const interruption = voiceTiming.getLastInterruption();
    expect(interruption).toBeDefined();
    expect(interruption?.detectedAt).toBe(4000);
    expect(interruption?.cancelledAt).toBe(4015);
    expect(interruption?.cancellationLatencyMs).toBe(15);
  });
});
