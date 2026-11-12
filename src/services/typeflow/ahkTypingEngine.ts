import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import {
  ITypingEngine,
  TypingEngineType,
  TypingProgress,
  TypingResult,
  TypingSessionConfig,
  TypingSessionStatus,
  TargetWindowInfo,
} from './types';
import { typeFlowService } from './typeflowService';

export class AhkTypingEngine implements ITypingEngine {
  readonly id: TypingEngineType = 'ahk';
  private ahkPath: string | null = null;
  private currentProcess: ChildProcess | null = null;
  private status: TypingSessionStatus = 'idle';
  private activeSessionId: string | null = null;

  public async initialize(): Promise<void> {
    // 1. Search for AutoHotkey v2 executable in PATH or standard installation directories
    const candidates = [
      'C:\\Program Files\\AutoHotkey\\v2\\AutoHotkey.exe',
      'C:\\Program Files\\AutoHotkey\\v2\\AutoHotkey64.exe',
      'C:\\Program Files\\AutoHotkey\\AutoHotkey64.exe',
      'C:\\Program Files\\AutoHotkey\\AutoHotkey.exe',
      path.join(os.homedir(), 'AppData\\Local\\Programs\\AutoHotkey\\v2\\AutoHotkey64.exe'),
      path.join(os.homedir(), 'Downloads\\typing 2.exe'), // The uploaded AHK utility
    ];

    for (const p of candidates) {
      if (fs.existsSync(p)) {
        this.ahkPath = p;
        break;
      }
    }

    if (!this.ahkPath) {
      console.warn('[AhkTypingEngine] AutoHotkey v2 executable not detected on machine. Fallback to native Win32 typing engine is recommended.');
    } else {
      console.log(`[AhkTypingEngine] Located AutoHotkey binary at: ${this.ahkPath}`);
    }
  }

  public getStatus(): TypingSessionStatus {
    return this.status;
  }

  public async validateTarget(target?: TargetWindowInfo): Promise<{ valid: boolean; reason?: string }> {
    return typeFlowService.validateTarget(target);
  }

  public async startTyping(
    text: string,
    config: TypingSessionConfig = {},
    onProgress?: (progress: TypingProgress) => void
  ): Promise<TypingResult> {
    if (!this.ahkPath || !fs.existsSync(this.ahkPath)) {
      console.warn('[AhkTypingEngine] AHK executable not available, seamlessly delegating to Native Win32 Typing Engine.');
      return typeFlowService.startTyping(text, config, onProgress);
    }

    const sessionId = `ahk_${Date.now()}`;
    this.activeSessionId = sessionId;
    this.status = 'typing';
    const target = await typeFlowService.getTargetWindow();

    const delayMs = config.charDelayMs ?? 30;
    const tempDir = path.join(os.tmpdir(), 'friday_typeflow');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const scriptPath = path.join(tempDir, `${sessionId}.ahk`);
    const escapedText = JSON.stringify(text);

    // AutoHotkey v2 script structure with SendText
    const ahkCode = `#Requires AutoHotkey v2.0
#SingleInstance Force
text := ${escapedText}
if (text = "")
    ExitApp(0)

for char in StrSplit(text) {
    if (char = "\`n")
        Send("{Enter}")
    else if (char = "\`r")
        continue
    else if (char = "\`t")
        Send("{Tab}")
    else
        SendText(char)
    Sleep(${delayMs})
}
ExitApp(0)
`;

    fs.writeFileSync(scriptPath, ahkCode, 'utf8');

    return new Promise((resolve) => {
      const startTime = Date.now();
      this.currentProcess = spawn(this.ahkPath!, [scriptPath], {
        windowsHide: true,
      });

      this.currentProcess.on('exit', (code) => {
        try {
          if (fs.existsSync(scriptPath)) fs.unlinkSync(scriptPath);
        } catch {}

        const success = code === 0 && this.status !== 'cancelled';
        const finalStatus = success ? 'completed' : this.status === 'cancelled' ? 'cancelled' : 'error';
        this.status = finalStatus;
        this.activeSessionId = null;
        this.currentProcess = null;

        resolve({
          sessionId,
          success,
          charsTyped: text.length,
          totalChars: text.length,
          durationMs: Date.now() - startTime,
          status: finalStatus,
          targetProcess: target.process,
        });
      });

      this.currentProcess.on('error', (err) => {
        console.error('[AhkTypingEngine] Process error:', err);
        this.status = 'error';
        this.activeSessionId = null;
        this.currentProcess = null;

        resolve({
          sessionId,
          success: false,
          charsTyped: 0,
          totalChars: text.length,
          durationMs: Date.now() - startTime,
          status: 'error',
          targetProcess: target.process,
          errorMessage: err.message,
        });
      });
    });
  }

  public async pauseTyping(): Promise<boolean> {
    console.warn('[AhkTypingEngine] Pause not natively supported in one-shot AHK script.');
    return false;
  }

  public async resumeTyping(): Promise<boolean> {
    return false;
  }

  public async cancelTyping(): Promise<boolean> {
    if (this.currentProcess && !this.currentProcess.killed) {
      this.status = 'cancelled';
      this.currentProcess.kill();
      this.currentProcess = null;
      return true;
    }
    return false;
  }

  public async shutdown(): Promise<void> {
    await this.cancelTyping();
  }
}

export const ahkTypingEngine = new AhkTypingEngine();
