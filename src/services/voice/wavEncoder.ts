/**
 * PCM to WAV Encoder & Audio Resampler
 * Encodes raw Float32Array PCM audio into standard 16-bit Mono WAV format at 16,000 Hz.
 * Universal format accepted natively by Gemini, Whisper, Groq, and all speech models.
 */

/**
 * Resamples a Float32Array from inSampleRate to outSampleRate using linear interpolation.
 */
export function resampleAudio(
  samples: Float32Array,
  inSampleRate: number,
  outSampleRate: number
): Float32Array {
  if (inSampleRate === outSampleRate || samples.length === 0) {
    return samples;
  }

  const ratio = inSampleRate / outSampleRate;
  const outLength = Math.round(samples.length / ratio);
  const result = new Float32Array(outLength);

  for (let i = 0; i < outLength; i++) {
    const origPos = i * ratio;
    const index = Math.floor(origPos);
    const fraction = origPos - index;

    if (index + 1 < samples.length) {
      result[i] = samples[index] * (1 - fraction) + samples[index + 1] * fraction;
    } else if (index < samples.length) {
      result[i] = samples[index];
    } else {
      result[i] = 0;
    }
  }

  return result;
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/**
 * Encodes Float32Array PCM samples into standard 16-bit linear PCM WAV (RIFF) byte buffer.
 */
export function encodeWav(samples: Float32Array, sampleRate = 16000): Uint8Array {
  const numChannels = 1; // Mono
  const bytesPerSample = 2; // 16-bit PCM
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // 1. RIFF chunk descriptor
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true); // File size - 8
  writeString(view, 8, 'WAVE');

  // 2. "fmt " sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size for PCM (16 bytes)
  view.setUint16(20, 1, true); // AudioFormat 1 = PCM
  view.setUint16(22, numChannels, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // Bits per sample (16-bit)

  // 3. "data" sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // 4. Write 16-bit PCM audio samples with clipping prevention
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }

  return new Uint8Array(buffer);
}

/**
 * Converts a Uint8Array into a base64 encoded string.
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  const chunkSize = 8192; // Process in chunks to prevent stack overflow on large arrays
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    for (let j = 0; j < chunk.length; j++) {
      binary += String.fromCharCode(chunk[j]);
    }
  }
  return btoa(binary);
}

/**
 * Calculates highest peak sample value (0.0 to 1.0) and RMS level from PCM samples.
 */
export function measurePcmLevels(samples: Float32Array): { peak: number; rms: number } {
  let maxPeak = 0;
  let sumSq = 0;
  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > maxPeak) maxPeak = abs;
    sumSq += abs * abs;
  }
  const rms = samples.length > 0 ? Math.sqrt(sumSq / samples.length) : 0;
  return { peak: maxPeak, rms };
}
