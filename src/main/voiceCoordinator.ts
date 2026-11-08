import { BrowserWindow } from 'electron';
import {
  ChatMessage,
  ConversationMood,
  EnrolledSpeakerProfile,
  FaceExpression,
  FridaySettings,
  RobotState,
  VoiceSessionState,
} from '../shared/types';
import { IPC_CHANNELS } from './security';
import { settingsStore } from '../services/storage/settingsStore';
import { selectFaceExpression } from '../services/ai/faceExpressions';

export interface VoiceSessionStateSnapshot {
  sessionState: VoiceSessionState;
  robotState: RobotState;
  expression: FaceExpression;
  mood: ConversationMood;
  isSpeaking: boolean;
  isVerifiedSpeaker: boolean;
}

/**
 * Centralized Voice Session Coordinator (Electron Main Process)
 * Enforces single microphone ownership across Dashboard and Desktop Pet windows.
 * Coordinates wake-word activation, voice activity state, barge-in interruptions,
 * facial expressions, mood, and synchronized conversation history.
 */
export class VoiceCoordinator {
  private getMainWindow: () => BrowserWindow | null;
  private getPetWindow: () => BrowserWindow | null;

  private sessionState: VoiceSessionState = 'STANDBY';
  private robotState: RobotState = 'idle';
  private expression: FaceExpression = 'smile';
  private mood: ConversationMood = 'calm';
  private isSpeaking = false;
  private isVerifiedSpeaker = true;
  private currentRequestId: string | null = null;

  constructor(
    getMainWindow: () => BrowserWindow | null,
    getPetWindow: () => BrowserWindow | null
  ) {
    this.getMainWindow = getMainWindow;
    this.getPetWindow = getPetWindow;
  }

  public getState(): VoiceSessionStateSnapshot {
    return {
      sessionState: this.sessionState,
      robotState: this.robotState,
      expression: this.expression,
      mood: this.mood,
      isSpeaking: this.isSpeaking,
      isVerifiedSpeaker: this.isVerifiedSpeaker,
    };
  }

  /**
   * Broadcasts an IPC message safely to all open and non-destroyed windows.
   */
  private broadcast(channel: string, ...args: any[]): void {
    const mainWin = this.getMainWindow();
    const petWin = this.getPetWindow();

    try {
      if (mainWin && !mainWin.isDestroyed() && !mainWin.webContents.isDestroyed()) {
        mainWin.webContents.send(channel, ...args);
      }
    } catch {}

    try {
      if (petWin && !petWin.isDestroyed() && !petWin.webContents.isDestroyed()) {
        petWin.webContents.send(channel, ...args);
      }
    } catch {}
  }

  /**
   * Updates the formal Voice Session State and broadcasts to both windows.
   */
  public setState(
    sessionState: VoiceSessionState,
    updates?: {
      expression?: FaceExpression;
      mood?: ConversationMood;
      isSpeaking?: boolean;
      isVerifiedSpeaker?: boolean;
    }
  ): void {
    const stateUnchanged = this.sessionState === sessionState;
    const expressionUnchanged = !updates?.expression || updates.expression === this.expression;
    const isSpeakingUnchanged = updates?.isSpeaking === undefined || updates.isSpeaking === this.isSpeaking;

    if (stateUnchanged && expressionUnchanged && isSpeakingUnchanged) {
      // Prevent duplicate transitions and console spam
      return;
    }

    this.sessionState = sessionState;

    if (updates?.expression) this.expression = updates.expression;
    if (updates?.mood) this.mood = updates.mood;
    if (updates?.isSpeaking !== undefined) this.isSpeaking = updates.isSpeaking;
    if (updates?.isVerifiedSpeaker !== undefined) {
      this.isVerifiedSpeaker = updates.isVerifiedSpeaker;
    }

    // Map VoiceSessionState to RobotState
    switch (sessionState) {
      case 'STANDBY':
      case 'IDLE':
        this.robotState = 'idle';
        this.isSpeaking = false;
        if (!updates?.expression) this.expression = 'smile';
        break;
      case 'WAKE_DETECTED':
      case 'WAKE_WORD_DETECTED':
        this.robotState = 'listening';
        this.isSpeaking = false;
        this.expression = 'excited';
        break;
      case 'LISTENING':
        this.robotState = 'listening';
        this.isSpeaking = false;
        if (!updates?.expression) this.expression = 'smile';
        break;
      case 'SPEECH_DETECTED':
        this.robotState = 'listening';
        this.isSpeaking = false;
        if (!updates?.expression) this.expression = 'curious';
        break;
      case 'PROCESSING':
      case 'PROCESSING_AUDIO':
      case 'TRANSCRIBING':
      case 'TRANSCRIPT_RECEIVED':
      case 'THINKING':
        this.robotState = 'thinking';
        this.isSpeaking = false;
        this.expression = 'thinking';
        break;
      case 'SPEAKING':
        this.robotState = 'speaking';
        this.isSpeaking = true;
        break;
      case 'INTERRUPTED':
        this.robotState = 'interrupted';
        this.isSpeaking = false;
        this.expression = 'surprised';
        break;
      case 'ERROR':
      case 'PERMISSION_REQUIRED':
      case 'MICROPHONE_ERROR':
      case 'NETWORK_ERROR':
      case 'PROVIDER_ERROR':
      case 'TASK_UNSUPPORTED':
        this.robotState = 'error';
        this.isSpeaking = false;
        this.expression = 'not-happy';
        break;
      default:
        this.robotState = 'idle';
    }

    console.log(`[VoiceCoordinator] State transition: ${sessionState} (Robot: ${this.robotState}, Expr: ${this.expression})`);

    this.broadcast(IPC_CHANNELS.VOICE_STATE_CHANGED, {
      sessionState: this.sessionState,
      robotState: this.robotState,
      expression: this.expression,
      mood: this.mood,
      isSpeaking: this.isSpeaking,
      isVerifiedSpeaker: this.isVerifiedSpeaker,
    });

    // Also update pet companion state for backwards compatibility
    this.broadcast(IPC_CHANNELS.PET_STATE_CHANGED, {
      robotState: this.robotState,
      expression: this.expression,
      mood: this.mood,
      isSpeaking: this.isSpeaking,
      voiceSessionState: this.sessionState,
      isVerifiedSpeaker: this.isVerifiedSpeaker,
    });
  }

  /**
   * Broadcasts live microphone level (0.0 to 1.0) to both windows.
   */
  public updateLevel(level: number): void {
    this.broadcast(IPC_CHANNELS.VOICE_LEVEL_UPDATE, level);
  }

  /**
   * Broadcasts real-time lip-sync mouth openness and amplitude during speech.
   */
  public updateMouth(mouthOpenness: number, amplitude: number, frequencies: number[]): void {
    this.broadcast(IPC_CHANNELS.VOICE_MOUTH_UPDATE, { mouthOpenness, amplitude, frequencies });
  }

  /**
   * Triggered when the user clicks the microphone button (dashboard or pet).
   */
  public handleTriggerMic(): void {
    const mainWin = this.getMainWindow();
    const petWin = this.getPetWindow();

    // MainWindow is the central background audio host for both Dashboard and Pet
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send(IPC_CHANNELS.VOICE_TRIGGER_MIC);
      return;
    }

    // Otherwise (dashboard closed/hidden), delegate to desktop pet audio host
    if (petWin && !petWin.isDestroyed()) {
      petWin.webContents.send(IPC_CHANNELS.VOICE_TRIGGER_MIC);
    }
  }

  /**
   * Triggered when user interrupts speech (barge-in or manual click).
   */
  public handleInterrupt(): void {
    this.setState('INTERRUPTED');
    this.broadcast(IPC_CHANNELS.VOICE_INTERRUPT);
  }

  /**
   * Triggered when local wake-word detector triggers in Standby.
   */
  public handleWakeWord(): void {
    if (this.sessionState === 'STANDBY' || this.sessionState === 'TASK_UNSUPPORTED') {
      this.setState('WAKE_DETECTED');
      setTimeout(() => {
        if (this.sessionState === 'WAKE_DETECTED') {
          this.setState('LISTENING');
        }
      }, 350);
    }
  }
}
