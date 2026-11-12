/**
 * FRIDAY VoiceFlow — Master VoiceFlow Controller
 * Orchestrates the full VoiceFlow lifecycle:
 * IDLE_READY -> ACTIVATED -> RECORDING -> TRANSCRIBING -> ENHANCING -> INSERTING -> COMPLETED -> IDLE_READY
 *
 * Implements:
 * - Natural language phrase activation ("Friday, type this")
 * - Desktop Pet click activation and cancellation
 * - Global shortcut activation
 * - Target window focus preservation
 * - Real-time Web Audio VAD capture & live VU meter emission
 * - Offline local transcription via faster-whisper sidecar
 * - AI text enhancement via FRIDAY providerManager
 * - Safe Windows text insertion with clipboard restoration
 * - History recording & settings persistence
 */

import {
  DEFAULT_VOICEFLOW_SETTINGS,
  TargetWindowInfo,
  VoiceFlowMode,
  VoiceFlowSettings,
  VoiceFlowState,
} from './types';
import { VoiceFlowCapture } from './voiceflowCapture';
import { voiceFlowHistory } from './voiceflowHistory';
import { playWakeChime } from '@/renderer/src/utils/audioChime';

export interface VoiceFlowEventMeta {
  text?: string;
  enhancedText?: string;
  error?: string;
  target?: TargetWindowInfo;
  mode?: VoiceFlowMode;
}

export type StateListener = (state: VoiceFlowState, meta?: VoiceFlowEventMeta) => void;
export type LevelListener = (level: number) => void;

const SETTINGS_STORAGE_KEY = 'friday_voiceflow_settings';

export class VoiceFlowController {
  private static instance: VoiceFlowController | null = null;

  private state: VoiceFlowState = 'IDLE_READY';
  private settings: VoiceFlowSettings = { ...DEFAULT_VOICEFLOW_SETTINGS };
  private capture: VoiceFlowCapture | null = null;
  private targetWindow: TargetWindowInfo | null = null;
  private stateListeners: Set<StateListener> = new Set();
  private levelListeners: Set<LevelListener> = new Set();
  private isProcessing = false;
  private completionTimer: NodeJS.Timeout | null = null;

  public static getInstance(): VoiceFlowController {
    if (!VoiceFlowController.instance) {
      VoiceFlowController.instance = new VoiceFlowController();
    }
    return VoiceFlowController.instance;
  }

  public constructor() {
    this.loadSettings();
  }

  public getState(): VoiceFlowState {
    return this.state;
  }

  public isBusy(): boolean {
    return this.state !== 'IDLE_READY' && this.state !== 'ERROR' && this.state !== 'CANCELLED';
  }

  public getSettings(): VoiceFlowSettings {
    return { ...this.settings };
  }

  public updateSettings(partial: Partial<VoiceFlowSettings>): void {
    this.settings = { ...this.settings, ...partial };
    this.saveSettings();
  }

  public setMode(mode: VoiceFlowMode): void {
    this.settings.mode = mode;
    this.saveSettings();
    this.emitState({ mode });
  }

  public subscribeState(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    // Send immediate initial state
    listener(this.state, { mode: this.settings.mode, target: this.targetWindow || undefined });
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  public subscribeLevel(listener: LevelListener): () => void {
    this.levelListeners.add(listener);
    return () => {
      this.levelListeners.delete(listener);
    };
  }

  /**
   * Activates VoiceFlow dictation.
   * If immediateText is supplied, skips microphone capture and directly enhances + inserts.
   */
  public async activate(
    triggerSource: 'phrase' | 'pet' | 'shortcut' | 'manual',
    immediateText?: string
  ): Promise<boolean> {
    if (!this.settings.enabled) {
      console.warn('[VoiceFlowController] Dictation attempted but VoiceFlow is disabled in settings.');
      return false;
    }

    if (this.isBusy()) {
      console.warn('[VoiceFlowController] Activation ignored: session already in progress in state', this.state);
      return false;
    }

    if (this.completionTimer) {
      clearTimeout(this.completionTimer);
      this.completionTimer = null;
    }

    try {
      this.transition('ACTIVATED', { mode: this.settings.mode });

      // 1. Snapshot the user's active window before any HUD or focus change
      if (window.fridayAPI?.voiceflowCaptureTarget) {
        try {
          this.targetWindow = await window.fridayAPI.voiceflowCaptureTarget();
        } catch (e) {
          console.warn('[VoiceFlowController] Target window capture warning:', e);
          this.targetWindow = null;
        }
      }

      // If text was already spoken during natural wake phrase (e.g. "Friday, type this please join meeting")
      if (immediateText && immediateText.trim()) {
        await this.processTextDirectly(immediateText.trim());
        return true;
      }

      // 2. Play subtle activation sound
      playWakeChime();

      // 3. Start microphone capture session with adaptive VAD
      this.transition('RECORDING', { target: this.targetWindow || undefined, mode: this.settings.mode });

      this.capture = new VoiceFlowCapture(
        {
          onLevel: (level) => {
            this.emitLevel(level);
          },
          onSpeechStart: () => {
            // Speech started
          },
          onUtteranceComplete: (audioBase64, durationMs) => {
            void this.handleUtteranceComplete(audioBase64, durationMs);
          },
          onError: (errMsg) => {
            this.handleError(errMsg);
          },
          onCancel: () => {
            this.cancel();
          },
        },
        this.settings.silenceTimeoutMs || 700
      );

      await this.capture.start();
      return true;
    } catch (err: any) {
      this.handleError(err?.message || 'Failed to start VoiceFlow recording.');
      return false;
    }
  }

  /**
   * Handles completed speech utterance from VAD.
   */
  private async handleUtteranceComplete(audioBase64: string, durationMs: number): Promise<void> {
    if (this.state !== 'RECORDING') return;

    this.transition('TRANSCRIBING', { target: this.targetWindow || undefined });

    const startTime = Date.now();
    let rawText = '';
    let detectedLang = 'en';

    try {
      // 1. Local speech recognition via faster-whisper sidecar
      if (window.fridayAPI?.voiceflowTranscribe) {
        const lang = this.settings.language === 'auto' ? undefined : this.settings.language;
        const res = await window.fridayAPI.voiceflowTranscribe(audioBase64, lang);
        rawText = (res.text || '').trim();
        detectedLang = res.language || 'en';
      }

      if (!rawText) {
        // No discernible speech detected (e.g. background click or cough)
        this.transition('IDLE_READY');
        return;
      }

      // 2. AI enhancement and insertion into target window
      await this.processEnhancedInsertion(rawText, detectedLang, startTime);
    } catch (err: any) {
      this.handleError(err?.message || 'Transcription failed.');
    }
  }

  /**
   * Directly processes raw text (used when user dictated in the activation command).
   */
  private async processTextDirectly(rawText: string): Promise<void> {
    const startTime = Date.now();
    await this.processEnhancedInsertion(rawText, 'en', startTime);
  }

  /**
   * Runs AI text enhancement and automatic text insertion.
   */
  private async processEnhancedInsertion(
    rawText: string,
    language: string,
    startTime: number
  ): Promise<void> {
    this.transition('ENHANCING', { text: rawText, target: this.targetWindow || undefined });

    try {
      let finalInsertedText = rawText;

      // Delegate enhancement & insertion to Main process
      if (window.fridayAPI?.voiceflowEnhanceAndInsert) {
        const insertRes = await window.fridayAPI.voiceflowEnhanceAndInsert(
          rawText,
          this.settings.mode,
          this.targetWindow || undefined,
          {
            directTranscription: this.settings.directTranscription,
            restoreClipboard: this.settings.restoreClipboard,
          }
        );

        if (insertRes?.error) {
          throw new Error(insertRes.error);
        }

        finalInsertedText = insertRes?.enhancedText || rawText;
      }

      this.transition('INSERTING', {
        text: rawText,
        enhancedText: finalInsertedText,
        target: this.targetWindow || undefined,
      });

      // Brief delay to ensure keystroke dispatch settles
      await new Promise((resolve) => setTimeout(resolve, 80));

      const totalLatency = Date.now() - startTime;

      // Record to history if enabled
      if (this.settings.keepHistory) {
        voiceFlowHistory.addEntry({
          rawTranscript: rawText,
          enhancedText: finalInsertedText,
          mode: this.settings.mode,
          language,
          inserted: true,
          targetApp: this.targetWindow?.process || 'unknown',
          latencyMs: totalLatency,
        });
      }

      this.transition('COMPLETED', {
        text: rawText,
        enhancedText: finalInsertedText,
        target: this.targetWindow || undefined,
      });

      // Smooth return to ready state after completion indicator displays
      this.completionTimer = setTimeout(() => {
        this.transition('IDLE_READY');
      }, 1200);
    } catch (err: any) {
      this.handleError(err?.message || 'Text enhancement or insertion failed.');
    }
  }

  /**
   * Immediately cancels active recording or processing session.
   */
  public cancel(): void {
    if (this.capture) {
      this.capture.cancel();
      this.capture = null;
    }

    if (this.completionTimer) {
      clearTimeout(this.completionTimer);
      this.completionTimer = null;
    }

    this.emitLevel(0);
    this.transition('CANCELLED');

    setTimeout(() => {
      this.transition('IDLE_READY');
    }, 600);
  }

  private handleError(error: string): void {
    if (this.capture) {
      this.capture.stop();
      this.capture = null;
    }

    this.emitLevel(0);
    this.transition('ERROR', { error });

    setTimeout(() => {
      this.transition('IDLE_READY');
    }, 2500);
  }

  private transition(newState: VoiceFlowState, meta?: VoiceFlowEventMeta): void {
    this.state = newState;
    this.emitState(meta);
  }

  private emitState(meta?: VoiceFlowEventMeta): void {
    const fullMeta: VoiceFlowEventMeta = {
      mode: this.settings.mode,
      target: this.targetWindow || undefined,
      ...meta,
    };
    for (const listener of this.stateListeners) {
      try {
        listener(this.state, fullMeta);
      } catch (e) {
        console.warn('[VoiceFlowController] Error in state listener:', e);
      }
    }
  }

  private emitLevel(level: number): void {
    for (const listener of this.levelListeners) {
      try {
        listener(level);
      } catch {}
    }
  }

  private loadSettings(): void {
    try {
      const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        this.settings = { ...DEFAULT_VOICEFLOW_SETTINGS, ...parsed };
      }
    } catch {}
  }

  private saveSettings(): void {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(this.settings));
    } catch {}
  }
}

export const voiceFlowController = VoiceFlowController.getInstance();
