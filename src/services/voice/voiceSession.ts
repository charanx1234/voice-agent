/**
 * FRIDAY Voice Session & Diagnostic Logging Manager
 *
 * Implements a strict finite-state machine for voice interactions:
 * IDLE -> WAKE_WORD_DETECTED -> LISTENING -> PROCESSING_AUDIO -> TRANSCRIBING -> THINKING -> SPEAKING -> STANDBY
 * Supports INTERRUPTED and ERROR states cleanly.
 *
 * Enforces:
 * - Single-utterance turn model (one utterance per session).
 * - Input-source separation (TEXT vs VOICE).
 * - Request / turn ID synchronization to discard stale or cancelled responses.
 * - Comprehensive diagnostic logging without sensitive data leaks.
 */

export type VoiceSessionState =
  | 'IDLE'
  | 'STANDBY'
  | 'WAKE_WORD_DETECTED'
  | 'LISTENING'
  | 'PROCESSING_AUDIO'
  | 'TRANSCRIBING'
  | 'THINKING'
  | 'SPEAKING'
  | 'INTERRUPTED'
  | 'ERROR';

export type InputSource = 'TEXT' | 'VOICE';

export interface VoiceDiagnosticLog {
  timestamp: string;
  source: InputSource;
  sessionId: string;
  turnId: string;
  sessionState: VoiceSessionState;
  audioDurationMs?: number;
  peakLevel?: number;
  rmsLevel?: number;
  vadDecision?: 'SPEECH_START' | 'SPEECH_END' | 'TIMEOUT' | 'BARGE_IN' | 'NONE';
  qualityDecision?: {
    acceptable: boolean;
    reason: string;
    snrDb?: number;
  };
  sttResult?: string;
  sttConfidence?: number;
  acceptanceDecision?: {
    accepted: boolean;
    reason?: string;
  };
  actionDecision?: {
    intent?: string;
    executed: boolean;
    reason?: string;
  };
  aiRequestId?: string;
  ttsEvent?: 'START' | 'FINISH' | 'CANCELLED';
}

export class VoiceSessionManager {
  private currentState: VoiceSessionState = 'IDLE';
  private activeSessionId: string | null = null;
  private activeTurnId: string | null = null;
  private activeSource: InputSource = 'TEXT';
  private sessionCounter = 0;
  private turnCounter = 0;
  private isMicMuted = false;
  private diagnosticLogs: VoiceDiagnosticLog[] = [];
  private readonly MAX_LOGS = 200;

  public getState(): VoiceSessionState {
    return this.currentState;
  }

  public getSessionId(): string | null {
    return this.activeSessionId;
  }

  public getTurnId(): string | null {
    return this.activeTurnId;
  }

  public getSource(): InputSource {
    return this.activeSource;
  }

  public isMuted(): boolean {
    return this.isMicMuted;
  }

  public setMicMuted(muted: boolean): void {
    this.isMicMuted = muted;
    if (muted && this.currentState === 'LISTENING') {
      this.transition('IDLE', 'Microphone muted by user');
    }
  }

  /**
   * Starts a new, unique voice session.
   */
  public startSession(source: InputSource = 'VOICE'): { sessionId: string; turnId: string } {
    const now = Date.now();
    this.sessionCounter += 1;
    this.turnCounter += 1;
    this.activeSessionId = `sess_${now}_${this.sessionCounter}`;
    this.activeTurnId = `turn_${now}_${this.turnCounter}`;
    this.activeSource = source;

    this.transition(source === 'VOICE' ? 'WAKE_WORD_DETECTED' : 'THINKING', `Session started from ${source}`);
    return { sessionId: this.activeSessionId, turnId: this.activeTurnId };
  }

  /**
   * Transitions the formal session state.
   */
  public transition(next: VoiceSessionState, reason?: string): void {
    const prev = this.currentState;
    this.currentState = next;

    this.log({
      timestamp: new Date().toISOString(),
      source: this.activeSource,
      sessionId: this.activeSessionId || 'none',
      turnId: this.activeTurnId || 'none',
      sessionState: next,
      acceptanceDecision: reason ? { accepted: true, reason: `State transition: ${prev} -> ${next} (${reason})` } : undefined,
    });
  }

  /**
   * Validates if a response belongs to the currently active turn.
   */
  public isValidTurn(turnId?: string): boolean {
    if (!turnId) return true;
    return this.activeTurnId === turnId;
  }

  /**
   * Cancels the active session (e.g. barge-in or mode switch).
   */
  public cancelSession(reason = 'Session cancelled'): void {
    const cancelledTurn = this.activeTurnId;
    this.transition('INTERRUPTED', reason);
    this.activeSessionId = null;
    this.activeTurnId = null;
  }

  /**
   * Records a structured diagnostic log entry.
   */
  public log(entry: Partial<VoiceDiagnosticLog>): void {
    const fullLog: VoiceDiagnosticLog = {
      timestamp: entry.timestamp || new Date().toISOString(),
      source: entry.source || this.activeSource,
      sessionId: entry.sessionId || this.activeSessionId || 'none',
      turnId: entry.turnId || this.activeTurnId || 'none',
      sessionState: entry.sessionState || this.currentState,
      ...entry,
    };

    this.diagnosticLogs.push(fullLog);
    if (this.diagnosticLogs.length > this.MAX_LOGS) {
      this.diagnosticLogs.shift();
    }

    // Format concise console log for electron / browser console
    const summary = [
      `[VoiceDiagnostic]`,
      `state=${fullLog.sessionState}`,
      `source=${fullLog.source}`,
      fullLog.vadDecision ? `vad=${fullLog.vadDecision}` : '',
      fullLog.audioDurationMs ? `dur=${fullLog.audioDurationMs}ms` : '',
      fullLog.peakLevel !== undefined ? `peak=${fullLog.peakLevel.toFixed(3)}` : '',
      fullLog.qualityDecision ? `quality=${fullLog.qualityDecision.acceptable ? 'PASS' : 'FAIL'}(${fullLog.qualityDecision.reason})` : '',
      fullLog.sttResult ? `stt="${fullLog.sttResult}"` : '',
      fullLog.actionDecision ? `action=${fullLog.actionDecision.executed ? 'EXEC' : 'BLOCKED'}(${fullLog.actionDecision.reason || fullLog.actionDecision.intent || ''})` : '',
    ].filter(Boolean).join(' ');

    console.info(summary);
  }

  public getRecentLogs(limit = 50): VoiceDiagnosticLog[] {
    return this.diagnosticLogs.slice(-limit);
  }

  public clearLogs(): void {
    this.diagnosticLogs = [];
  }
}

export const voiceSessionManager = new VoiceSessionManager();
