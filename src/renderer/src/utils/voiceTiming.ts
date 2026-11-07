/**
 * Voice Pipeline Timing & Latency Diagnostics (Requirement 11)
 * Measures every millisecond across speech detection, VAD, transcription,
 * AI reasoning, streaming, TTS synthesis, and barge-in playback cancellation.
 */

export interface TurnTimingRecord {
  turnId: string;
  speechStartMs?: number;
  speechEndMs?: number;
  transcriptionStartMs?: number;
  transcriptionEndMs?: number;
  aiStartMs?: number;
  firstTokenMs?: number;
  aiCompleteMs?: number;
  firstTtsAudioMs?: number;
  interruptionDetectedMs?: number;
  playbackCancelledMs?: number;
}

class VoiceTimingDiagnostics {
  private activeTurns = new Map<string, TurnTimingRecord>();
  private lastInterruption: { detectedAt: number; cancelledAt: number } | null = null;

  public startTurn(turnId: string, speechStartMs?: number): void {
    this.activeTurns.set(turnId, {
      turnId,
      speechStartMs: speechStartMs || Date.now(),
    });
  }

  public recordSpeechEnd(turnId: string, endMs = Date.now()): void {
    const record = this.activeTurns.get(turnId);
    if (record) {
      record.speechEndMs = endMs;
    }
  }

  public recordTranscriptionStart(turnId: string, startMs = Date.now()): void {
    const record = this.activeTurns.get(turnId);
    if (record) {
      record.transcriptionStartMs = startMs;
    }
  }

  public recordTranscriptionEnd(turnId: string, endMs = Date.now()): void {
    const record = this.activeTurns.get(turnId);
    if (record) {
      record.transcriptionEndMs = endMs;
      const duration = record.transcriptionStartMs ? endMs - record.transcriptionStartMs : 0;
      console.info(`[VoiceTiming] turn=${turnId} transcription=${duration}ms`);
    }
  }

  public recordAiStart(turnId: string, startMs = Date.now()): void {
    const record = this.activeTurns.get(turnId);
    if (record) {
      record.aiStartMs = startMs;
    }
  }

  public recordFirstToken(turnId: string, now = Date.now()): void {
    const record = this.activeTurns.get(turnId);
    if (record && !record.firstTokenMs) {
      record.firstTokenMs = now;
      const latency = record.aiStartMs ? now - record.aiStartMs : 0;
      console.info(`[VoiceTiming] turn=${turnId} ai-first-token=${latency}ms`);
    }
  }

  public recordAiComplete(turnId: string, now = Date.now()): void {
    const record = this.activeTurns.get(turnId);
    if (record) {
      record.aiCompleteMs = now;
      const totalAi = record.aiStartMs ? now - record.aiStartMs : 0;
      console.info(`[VoiceTiming] turn=${turnId} ai-complete=${totalAi}ms`);
    }
  }

  public recordFirstTtsAudio(turnId: string, now = Date.now()): void {
    const record = this.activeTurns.get(turnId);
    if (record && !record.firstTtsAudioMs) {
      record.firstTtsAudioMs = now;
      const timeSinceSpeechEnd = record.speechEndMs ? now - record.speechEndMs : 0;
      console.info(
        `[VoiceTiming] turn=${turnId} FIRST_TTS_AUDIO=${timeSinceSpeechEnd}ms since user stopped speaking`
      );
    }
  }

  public recordInterruption(detectedAt = Date.now()): void {
    this.lastInterruption = { detectedAt, cancelledAt: 0 };
    console.info(`[VoiceTiming] BARGE_IN_DETECTED at ${detectedAt}`);
  }

  public recordPlaybackCancelled(cancelledAt = Date.now()): void {
    if (this.lastInterruption) {
      this.lastInterruption.cancelledAt = cancelledAt;
      const duration = cancelledAt - this.lastInterruption.detectedAt;
      console.info(`[VoiceTiming] PLAYBACK_CANCELLED in ${duration}ms`);
    }
  }

  public getTurnTiming(turnId: string): TurnTimingRecord | undefined {
    return this.activeTurns.get(turnId);
  }

  public getLastInterruption(): { detectedAt: number; cancelledAt: number; cancellationLatencyMs: number } | null {
    if (!this.lastInterruption) return null;
    return {
      detectedAt: this.lastInterruption.detectedAt,
      cancelledAt: this.lastInterruption.cancelledAt,
      cancellationLatencyMs: this.lastInterruption.cancelledAt
        ? this.lastInterruption.cancelledAt - this.lastInterruption.detectedAt
        : 0,
    };
  }

  public completeTurn(turnId: string): void {
    const r = this.activeTurns.get(turnId);
    if (r) {
      const speechDuration = r.speechEndMs && r.speechStartMs ? r.speechEndMs - r.speechStartMs : 0;
      const turnaround = r.firstTtsAudioMs && r.speechEndMs ? r.firstTtsAudioMs - r.speechEndMs : 0;
      console.info(
        `[VoiceTiming] SUMMARY turn=${turnId}: speech=${speechDuration}ms, turnaround=${turnaround}ms`
      );
      this.activeTurns.delete(turnId);
    }
  }
}

export const voiceTiming = new VoiceTimingDiagnostics();
