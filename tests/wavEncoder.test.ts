import { describe, it, expect } from 'vitest';
import { encodeWav, resampleAudio, uint8ArrayToBase64, measurePcmLevels } from '../src/services/voice/wavEncoder';

describe('wavEncoder', () => {
  it('resamples audio accurately between sample rates', () => {
    const input = new Float32Array([0, 0.5, 1.0, 0.5, 0]);
    const resampled = resampleAudio(input, 48000, 16000);
    expect(resampled.length).toBeLessThan(input.length);
    expect(resampled.length).toBe(Math.round(input.length / 3));
  });

  it('generates a valid 44-byte RIFF WAVE header for 16kHz mono audio', () => {
    const samples = new Float32Array(16000); // 1 second of audio
    const wavBytes = encodeWav(samples, 16000);
    expect(wavBytes.length).toBe(44 + 16000 * 2);

    const view = new DataView(wavBytes.buffer);
    // RIFF check
    const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
    expect(riff).toBe('RIFF');

    // WAVE check
    const wave = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));
    expect(wave).toBe('WAVE');

    // Format chunk check (PCM = 1, Mono = 1, 16000Hz, 16-bit)
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // Mono
    expect(view.getUint32(24, true)).toBe(16000); // Sample rate
    expect(view.getUint16(34, true)).toBe(16); // 16-bit
  });

  it('measures peak and rms levels properly', () => {
    const samples = new Float32Array([0, 0.2, -0.8, 0.4]);
    const levels = measurePcmLevels(samples);
    expect(levels.peak).toBeCloseTo(0.8);
    expect(levels.rms).toBeGreaterThan(0);
  });

  it('converts to base64 cleanly without throwing', () => {
    const samples = new Float32Array(500);
    const wavBytes = encodeWav(samples, 16000);
    const b64 = uint8ArrayToBase64(wavBytes);
    expect(typeof b64).toBe('string');
    expect(b64.length).toBeGreaterThan(0);
    // Base64 header for RIFF is UklGR
    expect(b64.startsWith('UklGR')).toBe(true);
  });
});
