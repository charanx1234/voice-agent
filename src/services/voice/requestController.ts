/**
 * FRIDAY Hybrid Voice Architecture V2 — Request Controller
 * Enforces the Single Active Request Invariant:
 * - Exactly one active user utterance / voice turn at any given time.
 * - Every request has a unique requestId, turnId, sessionId, and AbortController.
 * - Prevents duplicate STT, duplicate AI generation, and overlapping TTS playback.
 * - Instantly cancels and invalidates stale in-flight operations on barge-in / interruption.
 * - Keeps typed chat independent while sharing conversation context safely.
 */

export type TurnState =
  | 'STANDBY'
  | 'WAKE_DETECTED'
  | 'LISTENING'
  | 'TRANSCRIBING'
  | 'THINKING'
  | 'SPEAKING'
  | 'INTERRUPTED'
  | 'COMPLETED'
  | 'ERROR';

export interface VoiceTurnContext {
  turnId: string;
  requestId: string;
  sessionId: string;
  state: TurnState;
  startedAt: number;
  abortController: AbortController;
  recognizedText?: string;
  responseText?: string;
  isBargeIn: boolean;
  cancelled: boolean;
}

export type TurnStateListener = (turn: Readonly<VoiceTurnContext>) => void;

export class RequestController {
  private static instance: RequestController | null = null;

  private currentTurn: VoiceTurnContext | null = null;
  private turnCounter = 0;
  private sessionId = `session_${Date.now()}`;
  private readonly listeners = new Set<TurnStateListener>();

  public static getInstance(): RequestController {
    if (!RequestController.instance) {
      RequestController.instance = new RequestController();
    }
    return RequestController.instance;
  }

  private constructor() {}

  public subscribe(listener: TurnStateListener): () => void {
    this.listeners.add(listener);
    if (this.currentTurn) {
      listener(this.currentTurn);
    }
    return () => this.listeners.delete(listener);
  }

  private notify(turn: VoiceTurnContext): void {
    for (const listener of this.listeners) {
      try {
        listener(turn);
      } catch (err) {
        console.warn('[RequestController] Listener notification error:', err);
      }
    }
  }

  public getActiveTurn(): Readonly<VoiceTurnContext> | null {
    return this.currentTurn;
  }

  public isTurnActive(turnId: string): boolean {
    return (
      this.currentTurn !== null &&
      this.currentTurn.turnId === turnId &&
      !this.currentTurn.cancelled &&
      this.currentTurn.state !== 'COMPLETED' &&
      this.currentTurn.state !== 'ERROR' &&
      this.currentTurn.state !== 'STANDBY'
    );
  }

  /**
   * Starts a new user turn.
   * If a previous turn is in-flight, it is cleanly aborted and invalidated.
   */
  public startTurn(isBargeIn = false): VoiceTurnContext {
    if (this.currentTurn && !this.currentTurn.cancelled) {
      this.cancelCurrentTurn('Superseded by new turn');
    }

    this.turnCounter++;
    const turnId = `turn_${Date.now()}_${this.turnCounter}`;
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const context: VoiceTurnContext = {
      turnId,
      requestId,
      sessionId: this.sessionId,
      state: isBargeIn ? 'WAKE_DETECTED' : 'LISTENING',
      startedAt: Date.now(),
      abortController: new AbortController(),
      isBargeIn,
      cancelled: false,
    };

    this.currentTurn = context;
    console.info(`[RequestController] Turn started: ${turnId} (Barge-in: ${isBargeIn})`);
    this.notify(context);
    return context;
  }

  /**
   * Updates the state of the active turn.
   * If the turn was already cancelled or superseded, updates are safely ignored.
   */
  public updateTurnState(
    turnId: string,
    state: TurnState,
    meta?: { recognizedText?: string; responseText?: string }
  ): boolean {
    if (!this.currentTurn || this.currentTurn.turnId !== turnId || this.currentTurn.cancelled) {
      console.warn(`[RequestController] Stale state update ignored for ${turnId} -> ${state}`);
      return false;
    }

    this.currentTurn.state = state;
    if (meta?.recognizedText !== undefined) {
      this.currentTurn.recognizedText = meta.recognizedText;
    }
    if (meta?.responseText !== undefined) {
      this.currentTurn.responseText = meta.responseText;
    }

    console.debug(`[RequestController] Turn ${turnId} state -> ${state}`);
    this.notify(this.currentTurn);
    return true;
  }

  /**
   * Handles user barge-in while FRIDAY is speaking.
   * Immediately aborts in-flight TTS playback & synthesis and prepares for new speech.
   */
  public handleBargeIn(): VoiceTurnContext {
    console.info('[RequestController] Barge-in event triggered by user speech!');
    if (this.currentTurn) {
      this.currentTurn.state = 'INTERRUPTED';
      this.currentTurn.cancelled = true;
      this.currentTurn.abortController.abort();
      this.notify(this.currentTurn);
    }
    return this.startTurn(true);
  }

  /**
   * Cancels the active turn.
   */
  public cancelCurrentTurn(reason = 'User cancelled'): void {
    if (!this.currentTurn || this.currentTurn.cancelled) return;

    console.info(`[RequestController] Cancelling active turn ${this.currentTurn.turnId}: ${reason}`);
    this.currentTurn.cancelled = true;
    this.currentTurn.state = 'INTERRUPTED';
    this.currentTurn.abortController.abort();
    this.notify(this.currentTurn);
  }

  /**
   * Completes the current turn and returns to standby.
   */
  public completeTurn(turnId: string): void {
    if (!this.currentTurn || this.currentTurn.turnId !== turnId) return;

    this.currentTurn.state = 'COMPLETED';
    this.notify(this.currentTurn);
    this.currentTurn = null;
    console.info(`[RequestController] Turn ${turnId} successfully completed.`);
  }

  /**
   * Marks turn as failed and cleans up state safely.
   */
  public failTurn(turnId: string, errorMessage?: string): void {
    if (!this.currentTurn || this.currentTurn.turnId !== turnId) return;

    this.currentTurn.state = 'ERROR';
    this.currentTurn.cancelled = true;
    this.currentTurn.abortController.abort();
    console.error(`[RequestController] Turn ${turnId} failed: ${errorMessage || 'Unknown error'}`);
    this.notify(this.currentTurn);
    this.currentTurn = null;
  }

  /**
   * Resets the entire controller (used on session teardown or test resets).
   */
  public reset(): void {
    if (this.currentTurn) {
      this.cancelCurrentTurn('Controller reset');
    }
    this.currentTurn = null;
    this.sessionId = `session_${Date.now()}`;
  }
}

export const requestController = RequestController.getInstance();
