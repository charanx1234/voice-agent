/**
 * Lightweight, non-intrusive wake chime using Web Audio API.
 * Plays a subtle, gentle ascending two-tone ping (~120ms) with zero external audio assets.
 */
export function playWakeChime(): void {
  try {
    const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtxClass) return;
    const ctx = new AudioCtxClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    const now = ctx.currentTime;
    osc.type = 'sine';
    // Gentle ascending tone: 587.33Hz (D5) -> 880Hz (A5)
    osc.frequency.setValueAtTime(587.33, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);

    // Soft envelope to avoid clicks or jarring volume
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.07, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.13);

    setTimeout(() => {
      void ctx.close().catch(() => {});
    }, 250);
  } catch {
    // Audio context unavailable or blocked
  }
}
