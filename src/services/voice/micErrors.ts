// Friendly, actionable messages for microphone failures.

export function describeMicError(err: any): string {
  const name = err?.name || '';

  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return 'Microphone access is blocked. Open Windows Settings → Privacy & security → Microphone, enable "Let desktop apps access your microphone", and allow FRIDAY.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No microphone was found. Plug in or enable a microphone, then try again.';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'The microphone is busy or unavailable. Another app may be using it — close that app and try again.';
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return 'Your microphone does not support the requested audio settings. Try selecting a different input device in Windows sound settings.';
    case 'SecurityError':
      return 'The microphone is blocked by a security policy. Check Windows privacy settings and try again.';
    default:
      return `Could not start the microphone${err?.message ? `: ${err.message}` : '.'}`;
  }
}

/** Below this peak sample level (~-40 dBFS) a recording is treated as silent. */
export const SILENCE_THRESHOLD = 0.01;

export function isLikelySilence(peakLevel: number): boolean {
  return Number.isFinite(peakLevel) && peakLevel < SILENCE_THRESHOLD;
}

export function formatRecordingDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
