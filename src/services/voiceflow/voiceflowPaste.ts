/**
 * FRIDAY VoiceFlow — Automatic Text Insertion Service
 * Implements Hex's robust 6-step text insertion algorithm on Windows:
 * 1. Target window preservation (capturing active HWND before activation)
 * 2. Password & sensitive input field protection
 * 3. Target window focus restoration
 * 4. Atomic clipboard snapshot (preserving user's previous clipboard data)
 * 5. Direct clipboard text placement & SendInput keystroke dispatch
 * 6. Asynchronous 500ms clipboard restoration
 */

import { TargetWindowInfo, VoiceFlowInsertionResult } from './types';
import { voiceFlowService } from './voiceflowService';

export interface IClipboardAdapter {
  readText(): string;
  writeText(text: string): void;
  clear(): void;
}

class DefaultClipboardAdapter implements IClipboardAdapter {
  private electronClipboard: any = null;

  constructor() {
    try {
      // Dynamically resolve electron clipboard if running in Electron environment
      const electron = require('electron');
      if (typeof electron === 'object' && electron.clipboard) {
        this.electronClipboard = electron.clipboard;
      }
    } catch {}
  }

  public readText(): string {
    if (this.electronClipboard) {
      return this.electronClipboard.readText();
    }
    return '';
  }

  public writeText(text: string): void {
    if (this.electronClipboard) {
      this.electronClipboard.writeText(text);
    }
  }

  public clear(): void {
    if (this.electronClipboard) {
      this.electronClipboard.clear();
    }
  }
}

export class VoiceFlowPaste {
  private static instance: VoiceFlowPaste | null = null;
  private pendingRestoreTimeout: NodeJS.Timeout | null = null;
  private clipboard: IClipboardAdapter;

  public static getInstance(): VoiceFlowPaste {
    if (!VoiceFlowPaste.instance) {
      VoiceFlowPaste.instance = new VoiceFlowPaste();
    }
    return VoiceFlowPaste.instance;
  }

  public constructor(clipboardAdapter?: IClipboardAdapter) {
    this.clipboard = clipboardAdapter || new DefaultClipboardAdapter();
  }

  public setClipboardAdapter(adapter: IClipboardAdapter): void {
    this.clipboard = adapter;
  }

  /**
   * Captures the current foreground application and focus state before dictation begins.
   */
  public async captureTarget(): Promise<TargetWindowInfo> {
    return await voiceFlowService.getTargetWindow();
  }

  /**
   * Inserts the final enhanced text into the recorded target application.
   */
  public async insertText(
    text: string,
    target?: TargetWindowInfo,
    options?: { restoreClipboard?: boolean; restoreDelayMs?: number }
  ): Promise<VoiceFlowInsertionResult> {
    const cleanText = (text || '').trim();
    if (!cleanText) {
      throw new Error('Refusing to insert empty transcription text.');
    }

    // 1. Password field safety check
    if (target?.isPassword) {
      throw new Error('Target field is a sensitive password field. Text insertion blocked for security.');
    }

    const hwnd = target?.hwnd || 0;
    const isTerminal = target?.isTerminal || false;
    const procName = target?.process || 'unknown';
    const shouldRestore = options?.restoreClipboard !== false;
    const restoreDelay = options?.restoreDelayMs || 500;

    // 2. Clear any pending previous clipboard restore timer
    if (this.pendingRestoreTimeout) {
      clearTimeout(this.pendingRestoreTimeout);
      this.pendingRestoreTimeout = null;
    }

    // 3. Take atomic snapshot of previous clipboard content
    let previousClipboardText = '';
    let hadClipboardText = false;
    try {
      previousClipboardText = this.clipboard.readText();
      hadClipboardText = Boolean(previousClipboardText);
    } catch (e) {
      console.warn('[VoiceFlowPaste] Could not snapshot previous clipboard:', e);
    }

    try {
      // 4. Place enhanced text on Windows clipboard
      this.clipboard.writeText(cleanText);

      // 5. Dispatch paste keystroke via Win32 SendInput in target window
      const pasteOk = await voiceFlowService.dispatchPaste(hwnd, isTerminal);
      if (!pasteOk) {
        throw new Error(`Failed to dispatch paste keystroke into target process "${procName}".`);
      }

      // 6. Asynchronously restore original clipboard after delay (Hex pattern)
      if (shouldRestore) {
        this.pendingRestoreTimeout = setTimeout(() => {
          try {
            if (hadClipboardText) {
              this.clipboard.writeText(previousClipboardText);
            } else {
              this.clipboard.clear();
            }
          } catch (e) {
            console.warn('[VoiceFlowPaste] Failed to restore clipboard snapshot:', e);
          } finally {
            this.pendingRestoreTimeout = null;
          }
        }, restoreDelay);
      }

      return {
        success: true,
        targetProcess: procName,
        charsInserted: cleanText.length,
        multiline: cleanText.includes('\n'),
        restoredClipboard: shouldRestore,
      };
    } catch (err: any) {
      // If insertion fails, restore original clipboard immediately
      if (hadClipboardText) {
        try {
          this.clipboard.writeText(previousClipboardText);
        } catch {}
      }
      throw err;
    }
  }
}

export const voiceFlowPaste = VoiceFlowPaste.getInstance();
