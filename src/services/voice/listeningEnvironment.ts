/**
 * Listening Environment Presets
 * Maps semantic environment labels to concrete audio pipeline configuration.
 * Allows one-click adaptive mode selection instead of requiring users to
 * manually tune noise suppression, VAD sensitivity, and compressor parameters.
 */

export type ListeningEnvironment = 'quiet' | 'noisy' | 'very_noisy';

export interface EnvironmentPreset {
  noiseSuppression: 'off' | 'standard' | 'strong';
  vadSensitivity: 'low' | 'medium' | 'high';
  echoCancellation: boolean;
  autoGainControl: boolean;
  /** Minimum peak level (0–1) to consider audio worth sending to STT. */
  audioQualityThreshold: number;
  /** Multiplier applied to compressor ratio in the pipeline. */
  compressorRatioMultiplier: number;
  /** Additional noise gate multiplier for VAD ambient floor. */
  noiseGateMultiplier: number;
  label: string;
  description: string;
}

export const ENVIRONMENT_PRESETS: Record<ListeningEnvironment, EnvironmentPreset> = {
  quiet: {
    noiseSuppression: 'standard',
    vadSensitivity: 'medium',
    echoCancellation: true,
    autoGainControl: true,
    audioQualityThreshold: 0.03,
    compressorRatioMultiplier: 1.0,
    noiseGateMultiplier: 1.0,
    label: 'Quiet Room',
    description: 'Balanced enhancement for a quiet environment. Normal sensitivity.',
  },
  noisy: {
    noiseSuppression: 'strong',
    vadSensitivity: 'low',
    echoCancellation: true,
    autoGainControl: true,
    audioQualityThreshold: 0.055,
    compressorRatioMultiplier: 1.4,
    noiseGateMultiplier: 1.6,
    label: 'Noisy Environment',
    description:
      'Stronger suppression for fan noise, background TV, or multiple people talking. More conservative speech detection.',
  },
  very_noisy: {
    noiseSuppression: 'strong',
    vadSensitivity: 'low',
    echoCancellation: true,
    autoGainControl: true,
    audioQualityThreshold: 0.08,
    compressorRatioMultiplier: 1.8,
    noiseGateMultiplier: 2.2,
    label: 'Very Noisy',
    description:
      'Maximum available suppression for loud environments. FRIDAY will ask for repetition when speech is unclear.',
  },
};

/**
 * Returns the pipeline configuration for the given environment.
 * Falls back to 'quiet' if an invalid environment is provided.
 */
export function getEnvironmentPreset(env: ListeningEnvironment | undefined): EnvironmentPreset {
  return ENVIRONMENT_PRESETS[env || 'quiet'];
}

/**
 * Infers which environment label best matches a manual set of settings.
 * Used to initialise the environment selector when the user has previously
 * set noise/vad values individually.
 */
export function inferEnvironmentFromSettings(
  noiseSuppression?: string,
  vadSensitivity?: string
): ListeningEnvironment {
  if (noiseSuppression === 'strong' && vadSensitivity === 'low') {
    return 'noisy';
  }
  if (noiseSuppression === 'off') {
    return 'quiet';
  }
  return 'quiet';
}
