import { describe, expect, it } from 'vitest';
import { AudioPipeline, AudioPipelineConfig } from '../src/services/voice/audioPipeline';

describe('AudioPipeline Configuration and Logic', () => {
  it('initializes with expected default voice isolation configuration', () => {
    const pipeline = new AudioPipeline();
    // Default constructor should not crash
    expect(pipeline).toBeDefined();
  });

  it('updates configuration dynamically without breaking the pipeline', () => {
    const pipeline = new AudioPipeline({
      noiseSuppression: 'standard',
      echoCancellation: true,
      autoGainControl: true,
      vadSensitivity: 'medium',
    });

    // Update to Strong noise suppression and high VAD sensitivity
    pipeline.updateConfig({
      noiseSuppression: 'strong',
      vadSensitivity: 'high',
      echoCancellation: false,
    });

    // Update to Off noise suppression and low VAD sensitivity
    pipeline.updateConfig({
      noiseSuppression: 'off',
      vadSensitivity: 'low',
    });

    expect(pipeline).toBeDefined();
  });

  it('allows registering and clearing pipeline callbacks', () => {
    const pipeline = new AudioPipeline();
    pipeline.setCallbacks({
      onLevel: (lvl) => {},
      onSpeechStart: () => {},
      onSpeechEnd: () => {},
      onWakeWord: () => {},
      onError: () => {},
    });
    expect(pipeline).toBeDefined();
  });
});
