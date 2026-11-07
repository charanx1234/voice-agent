import { describe, it, expect, vi, beforeEach } from 'vitest';
import { encodeWav, resampleAudio, uint8ArrayToBase64, measurePcmLevels } from '../src/services/voice/wavEncoder';
import { VoiceActivityDetector, DEFAULT_VAD_OPTIONS } from '../src/services/voice/voiceActivity';
import { validateVoiceAction } from '../src/services/agent/voiceActionGuard';
import { geminiService } from '../src/services/ai/gemini';
import { VoiceCoordinator } from '../src/main/voiceCoordinator';

describe('Voice Pipeline End-to-End Verification', () => {
  let coordinator: VoiceCoordinator;
  let broadcastCalls: any[] = [];

  beforeEach(() => {
    broadcastCalls = [];
    const mockWindow = {
      isDestroyed: () => false,
      webContents: {
        isDestroyed: () => false,
        send: (channel: string, payload: any) => {
          broadcastCalls.push({ channel, payload });
        },
      },
    } as any;

    coordinator = new VoiceCoordinator(() => mockWindow, () => null);
  });

  // TEST A: Normal English sentence
  it('TEST A: Encodes valid 16kHz PCM audio and validates English transcript flow', async () => {
    // Generate 1.5 seconds of simulated 48kHz audio with vocal frequencies
    const sampleRate = 48000;
    const samples = new Float32Array(Math.round(sampleRate * 1.5));
    for (let i = 0; i < samples.length; i++) {
      samples[i] = Math.sin(2 * Math.PI * 300 * (i / sampleRate)) * 0.4;
    }

    const { peak, rms } = measurePcmLevels(samples);
    expect(peak).toBeGreaterThan(0.2);
    expect(rms).toBeGreaterThan(0.1);

    // Resample to 16kHz & encode WAV
    const resampled = resampleAudio(samples, sampleRate, 16000);
    const wavBytes = encodeWav(resampled, 16000);
    const base64 = uint8ArrayToBase64(wavBytes);
    expect(base64.startsWith('UklGR')).toBe(true);

    // Validate voice action guard allows normal English command
    const action = validateVoiceAction('What is the weather today?', 'VOICE');
    expect(action.allowed).toBe(true);
    expect(action.isForeignAssistant).toBe(false);
  });

  // TEST B: Telugu sentence
  it('TEST B: Validates Telugu sentence through voice action guard', () => {
    const action = validateVoiceAction('ఈరోజు వాతావరణం ఎలా ఉంది?', 'VOICE');
    expect(action.allowed).toBe(true);
    expect(action.isForeignAssistant).toBe(false);
  });

  // TEST C: Mixed Telugu-English (Tenglish)
  it('TEST C: Validates mixed Telugu-English through voice action guard', () => {
    const action = validateVoiceAction('Chrome open chesi Java tutorial search chey', 'VOICE');
    expect(action.allowed).toBe(true);
    expect(action.sanitizedText).toContain('Chrome');
  });

  // TEST D: Longer sentence with natural pauses (VAD hysteresis)
  it('TEST D: VAD maintains active speech across natural conversational pauses', () => {
    const vad = new VoiceActivityDetector({
      startThreshold: 0.12,
      endThreshold: 0.05,
      speechStartMs: 80,
      speechEndMs: 1200,
    });

    // Onset
    expect(vad.update(0.3, 0)).toBeNull();
    expect(vad.update(0.3, 100)).toEqual({ type: 'start' });
    expect(vad.isSpeaking).toBe(true);

    // 400ms natural conversational pause between phrases (should NOT trigger speech end)
    expect(vad.update(0.01, 200)).toBeNull();
    expect(vad.update(0.01, 500)).toBeNull();
    expect(vad.isSpeaking).toBe(true);

    // User resumes speaking second phrase
    expect(vad.update(0.35, 600)).toBeNull();
    expect(vad.isSpeaking).toBe(true);

    // User finishes sentence: sustained quiet for 1200ms triggers end
    expect(vad.update(0.01, 700)).toBeNull();
    expect(vad.update(0.01, 1950)).toEqual({
      type: 'end',
      durationMs: 1950,
      peakLevel: 0.35,
    });
    expect(vad.isSpeaking).toBe(false);
  });

  // TEST E: Remain silent — no fake transcript
  it('TEST E: Silence returns empty and does not generate fake transcript', () => {
    const silenceAction = validateVoiceAction('', 'VOICE');
    expect(silenceAction.allowed).toBe(false);
    expect(silenceAction.reason).toBe('Empty input text');

    const noiseAction = validateVoiceAction('SILENCE', 'VOICE');
    expect(noiseAction.allowed).toBe(false);
  });

  // TEST F: One utterance only — no overlapping buffers
  it('TEST F: State machine coordinates exactly one utterance flow', () => {
    coordinator.setState('LISTENING');
    expect(coordinator.getState().sessionState).toBe('LISTENING');
    expect(coordinator.getState().robotState).toBe('listening');

    coordinator.setState('SPEECH_DETECTED');
    expect(coordinator.getState().sessionState).toBe('SPEECH_DETECTED');
    expect(coordinator.getState().robotState).toBe('listening');

    coordinator.setState('PROCESSING_AUDIO');
    expect(coordinator.getState().sessionState).toBe('PROCESSING_AUDIO');
    expect(coordinator.getState().robotState).toBe('thinking');

    coordinator.setState('TRANSCRIBING');
    expect(coordinator.getState().sessionState).toBe('TRANSCRIBING');
    expect(coordinator.getState().robotState).toBe('thinking');

    coordinator.setState('TRANSCRIPT_RECEIVED');
    expect(coordinator.getState().sessionState).toBe('TRANSCRIPT_RECEIVED');

    coordinator.setState('THINKING');
    expect(coordinator.getState().sessionState).toBe('THINKING');

    coordinator.setState('SPEAKING');
    expect(coordinator.getState().sessionState).toBe('SPEAKING');
    expect(coordinator.getState().robotState).toBe('speaking');

    coordinator.setState('STANDBY');
    expect(coordinator.getState().sessionState).toBe('STANDBY');
    expect(coordinator.getState().robotState).toBe('idle');
  });

  // TEST G: Switch between text and voice mode
  it('TEST G: Switch between text and voice mode works cleanly', () => {
    coordinator.setState('STANDBY');
    expect(coordinator.getState().sessionState).toBe('STANDBY');

    // User starts typing in text mode
    const textAction = validateVoiceAction('Hello FRIDAY', 'TEXT');
    expect(textAction.allowed).toBe(true);

    // Switch back to voice
    coordinator.setState('LISTENING');
    expect(coordinator.getState().sessionState).toBe('LISTENING');
  });

  // TEST H: Interruption / Barge-in while speaking
  it('TEST H: Interrupts speaking when barge-in occurs', () => {
    coordinator.setState('SPEAKING');
    expect(coordinator.getState().isSpeaking).toBe(true);

    coordinator.handleInterrupt();
    expect(coordinator.getState().sessionState).toBe('INTERRUPTED');
    expect(coordinator.getState().robotState).toBe('interrupted');
    expect(coordinator.getState().isSpeaking).toBe(false);
  });
});
