import { describe, expect, it } from 'vitest';
import { AudioPipeline } from '../src/services/voice/audioPipeline';
import { VoiceActivityDetector } from '../src/services/voice/voiceActivity';
import {
  ENVIRONMENT_PRESETS,
  getEnvironmentPreset,
  inferEnvironmentFromSettings,
} from '../src/services/voice/listeningEnvironment';
import { evaluatePcmQuality, isLikelySilentPeak } from '../src/services/voice/audioQualityGate';
import { detectLocalWakePhrase, stripWakePhrase } from '../src/services/voice/wakeWord';

describe('AudioPipeline Configuration and Logic', () => {
  it('initializes with expected default voice isolation configuration', () => {
    const pipeline = new AudioPipeline();
    expect(pipeline).toBeDefined();
    expect(pipeline.getAmbientNoiseFloor()).toBe(0.02);
    expect(pipeline.getIsSpeechDetected()).toBe(false);
  });

  it('updates configuration dynamically including listeningEnvironment', () => {
    const pipeline = new AudioPipeline({
      noiseSuppression: 'standard',
      echoCancellation: true,
      autoGainControl: true,
      vadSensitivity: 'medium',
    });

    pipeline.updateConfig({
      listeningEnvironment: 'noisy',
    });

    pipeline.updateConfig({
      listeningEnvironment: 'very_noisy',
    });

    pipeline.updateConfig({
      noiseSuppression: 'off',
      vadSensitivity: 'low',
    });

    expect(pipeline).toBeDefined();
  });

  it('allows registering callbacks', () => {
    const pipeline = new AudioPipeline();
    let levelReported = 0;
    pipeline.setCallbacks({
      onLevel: (lvl) => {
        levelReported = lvl;
      },
    });
    expect(pipeline).toBeDefined();
  });
});

describe('Listening Environment Presets', () => {
  it('maps quiet environment to balanced settings', () => {
    const preset = getEnvironmentPreset('quiet');
    expect(preset.noiseSuppression).toBe('standard');
    expect(preset.vadSensitivity).toBe('medium');
    expect(preset.echoCancellation).toBe(true);
    expect(preset.audioQualityThreshold).toBe(0.03);
  });

  it('maps noisy environment to aggressive noise suppression', () => {
    const preset = getEnvironmentPreset('noisy');
    expect(preset.noiseSuppression).toBe('strong');
    expect(preset.vadSensitivity).toBe('low');
    expect(preset.noiseGateMultiplier).toBeGreaterThan(1.0);
    expect(preset.audioQualityThreshold).toBeGreaterThan(0.04);
  });

  it('maps very_noisy environment to maximum suppression and highest quality threshold', () => {
    const preset = getEnvironmentPreset('very_noisy');
    expect(preset.noiseSuppression).toBe('strong');
    expect(preset.vadSensitivity).toBe('low');
    expect(preset.compressorRatioMultiplier).toBeGreaterThan(1.5);
    expect(preset.audioQualityThreshold).toBe(0.08);
  });

  it('infers environment correctly from settings', () => {
    expect(inferEnvironmentFromSettings('strong', 'low')).toBe('noisy');
    expect(inferEnvironmentFromSettings('off', 'medium')).toBe('quiet');
    expect(inferEnvironmentFromSettings('standard', 'medium')).toBe('quiet');
  });
});

describe('Adaptive Voice Activity Detector (VAD)', () => {
  it('detects speech onset after sustained loud audio', () => {
    const vad = new VoiceActivityDetector({
      startThreshold: 0.12,
      endThreshold: 0.055,
      speechStartMs: 100,
      speechEndMs: 600,
    });

    expect(vad.isSpeaking).toBe(false);

    // Initial noise below startThreshold
    let event = vad.update(0.05, 1000);
    expect(event).toBeNull();
    expect(vad.isSpeaking).toBe(false);

    // Speech onset starts
    vad.update(0.25, 1050);
    event = vad.update(0.30, 1160); // 110ms > speechStartMs (100ms)
    expect(event).toEqual({ type: 'start' });
    expect(vad.isSpeaking).toBe(true);

    // Silence starts
    vad.update(0.02, 1200);
    event = vad.update(0.02, 1850); // 650ms > speechEndMs (600ms)
    expect(event?.type).toBe('end');
    expect(vad.isSpeaking).toBe(false);
  });

  it('dynamically adapts thresholds when ambient noise floor rises', () => {
    const vad = new VoiceActivityDetector({
      startThreshold: 0.12,
      endThreshold: 0.055,
      speechStartMs: 50,
      speechEndMs: 300,
      noiseGateMultiplier: 1.5,
    });

    // In a quiet room (floor = 0.01), level 0.15 triggers speech
    vad.setAmbientFloor(0.01);
    vad.update(0.15, 1000);
    let event = vad.update(0.15, 1060);
    expect(event?.type).toBe('start');
    vad.finish(1200);

    // In a noisy room (fan turned on, floor = 0.12)
    vad.setAmbientFloor(0.12);
    // Level 0.15 should NOT trigger speech now because effective threshold = max(0.12, 0.12 * 1.5 * 1.8) = 0.324
    vad.update(0.15, 2000);
    event = vad.update(0.15, 2100);
    expect(event).toBeNull();
    expect(vad.isSpeaking).toBe(false);

    // But genuine speech at level 0.40 still triggers speech
    vad.update(0.40, 2200);
    event = vad.update(0.42, 2270);
    expect(event?.type).toBe('start');
    expect(vad.isSpeaking).toBe(true);
  });
});

describe('Audio Quality Gate & Pre-Send Validation', () => {
  it('rejects recordings that are too short', () => {
    const sampleRate = 16000;
    const shortSamples = new Float32Array(sampleRate * 0.1); // 100ms
    const report = evaluatePcmQuality(shortSamples, sampleRate, { minDurationMs: 350 });
    expect(report.acceptable).toBe(false);
    expect(report.reason).toBe('too_short');
  });

  it('rejects recordings that are silent', () => {
    const sampleRate = 16000;
    const silentSamples = new Float32Array(sampleRate * 1.0); // 1s of near zero
    for (let i = 0; i < silentSamples.length; i++) {
      silentSamples[i] = (Math.random() - 0.5) * 0.002;
    }
    const report = evaluatePcmQuality(silentSamples, sampleRate, { minPeakLevel: 0.04 });
    expect(report.acceptable).toBe(false);
    expect(report.reason).toBe('silent');
  });

  it('accepts clean speech recordings', () => {
    const sampleRate = 16000;
    const speechSamples = new Float32Array(sampleRate * 1.5);
    // Simulate vocal sine burst with ambient background
    for (let i = 0; i < speechSamples.length; i++) {
      const isVoice = i > sampleRate * 0.2 && i < sampleRate * 1.2;
      const voice = isVoice ? Math.sin((2 * Math.PI * 250 * i) / sampleRate) * 0.4 : 0;
      const noise = (Math.random() - 0.5) * 0.005;
      speechSamples[i] = voice + noise;
    }
    const report = evaluatePcmQuality(speechSamples, sampleRate);
    expect(report.acceptable).toBe(true);
    expect(report.reason).toBe('ok');
    expect(report.snrDb).toBeGreaterThan(15);
  });

  it('flags clipping when signal exceeds threshold', () => {
    const sampleRate = 16000;
    const clippedSamples = new Float32Array(sampleRate * 1.0);
    for (let i = 0; i < clippedSamples.length; i++) {
      clippedSamples[i] = 1.0;
    }
    const report = evaluatePcmQuality(clippedSamples, sampleRate);
    expect(report.clipping).toBe(true);
  });

  it('checks peak levels correctly with isLikelySilentPeak', () => {
    expect(isLikelySilentPeak(0.01, 0.03)).toBe(true);
    expect(isLikelySilentPeak(0.08, 0.03)).toBe(false);
  });
});

describe('Multilingual Speech & Wake-Word Handling', () => {
  it('detects local wake phrase even with natural filler variations', () => {
    expect(detectLocalWakePhrase('Hey Friday what is the weather').wake).toBe(true);
    expect(detectLocalWakePhrase('Ok Friday open Chrome').wake).toBe(true);
    expect(detectLocalWakePhrase('Friday Spotify lo music play chey').wake).toBe(true);
    expect(detectLocalWakePhrase('just background talking about the weather').wake).toBe(false);
  });

  it('strips wake phrase cleanly preserving Telugu-English code-switching commands', () => {
    expect(stripWakePhrase('Hey Friday Chrome open chey')).toBe('Chrome open chey');
    expect(stripWakePhrase('Friday Spotify lo music play chey')).toBe('Spotify lo music play chey');
    expect(stripWakePhrase('Ok Friday tell me what time it is')).toBe('tell me what time it is');
    expect(stripWakePhrase('Friday Notepad open karo aur notes save karo')).toBe(
      'Notepad open karo aur notes save karo'
    );
  });
});
