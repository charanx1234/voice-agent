import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import readline from 'readline';
import { EventEmitter } from 'events';
import {
  ITypingEngine,
  TypingEngineType,
  TypingProgress,
  TypingResult,
  TypingSessionConfig,
  TypingSessionStatus,
  TargetWindowInfo,
  SelectedTextResult
} from './types';

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  timer: NodeJS.Timeout;
}

export class TypeFlowService extends EventEmitter implements ITypingEngine {
  private static instance: TypeFlowService | null = null;
  readonly id: TypingEngineType = 'win32';

  private process: ChildProcess | null = null;
  private rl: readline.Interface | null = null;
  private pendingRequests = new Map<string, PendingRequest>();
  private reqCounter = 0;
  private isStarting = false;
  private ready = false;
  private currentStatus: TypingSessionStatus = 'idle';
  private activeSessionId: string | null = null;
  private progressCallback: ((progress: TypingProgress) => void) | null = null;

  public static getInstance(): TypeFlowService {
    if (!TypeFlowService.instance) {
      TypeFlowService.instance = new TypeFlowService();
    }
    return TypeFlowService.instance;
  }

  private constructor() {
    super();
    this.setMaxListeners(20);
  }

  public isReady(): boolean {
    return this.ready && this.process !== null && !this.process.killed;
  }

  public getStatus(): TypingSessionStatus {
    return this.currentStatus;
  }

  public getActiveSessionId(): string | null {
    return this.activeSessionId;
  }

  public async initialize(): Promise<void> {
    if (this.isReady()) return;

    if (this.isStarting) {
      await new Promise<void>((resolve) => {
        const interval = setInterval(() => {
          if (this.ready) {
            clearInterval(interval);
            resolve();
          }
        }, 80);
      });
      return;
    }

    this.isStarting = true;

    return new Promise((resolve, reject) => {
      try {
        const candidatePaths = [
          path.resolve(__dirname, 'typeflowBackend.py'),
          path.resolve(__dirname, '../../../src/services/typeflow/typeflowBackend.py'),
          path.resolve(process.cwd(), 'src/services/typeflow/typeflowBackend.py'),
          path.resolve(process.resourcesPath || '', 'app/src/services/typeflow/typeflowBackend.py'),
          path.resolve(process.resourcesPath || '', 'src/services/typeflow/typeflowBackend.py'),
          path.resolve(process.resourcesPath || '', 'typeflowBackend.py'),
        ];
        const scriptPath = candidatePaths.find((p) => fs.existsSync(p)) || candidatePaths[0];

        const knownPython = 'C:\\Users\\RAM CHARAN\\AppData\\Local\\Programs\\Python\\Python312\\python.exe';
        const pythonExecutable = fs.existsSync(knownPython) ? knownPython : 'python';

        this.process = spawn(pythonExecutable, [scriptPath], {
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
          env: {
            ...process.env,
            PYTHONIOENCODING: 'utf-8',
            PYTHONUNBUFFERED: '1',
          },
        });

        this.rl = readline.createInterface({
          input: this.process.stdout!,
          terminal: false,
        });

        this.rl.on('line', (line) => this.handleLine(line));

        this.process.stderr?.on('data', (data) => {
          const msg = data.toString().trim();
          if (msg) console.log(`[TypeFlowBackend:stderr] ${msg}`);
        });

        this.process.on('error', (err) => {
          console.error('[TypeFlowService] Process error:', err);
          this.ready = false;
          this.isStarting = false;
          this.currentStatus = 'error';
          reject(err);
        });

        this.process.on('exit', (code, signal) => {
          console.log(`[TypeFlowService] Process exited (code=${code}, signal=${signal})`);
          this.ready = false;
          this.isStarting = false;
          this.process = null;
          this.rl = null;
          this.currentStatus = 'idle';
          this.pendingRequests.forEach((req) => {
            clearTimeout(req.timer);
            req.reject(new Error('TypeFlow backend exited'));
          });
          this.pendingRequests.clear();
        });

        // Ping after spawn to confirm readiness
        const initTimeout = setTimeout(() => {
          this.isStarting = false;
          reject(new Error('TypeFlow backend startup timeout'));
        }, 12000);

        const checkReady = setInterval(async () => {
          if (this.process && !this.process.killed) {
            try {
              const res = await this.sendCommand('ping', {}, 2000);
              if (res && res.status === 'ok') {
                clearInterval(checkReady);
                clearTimeout(initTimeout);
                this.ready = true;
                this.isStarting = false;
                this.currentStatus = 'idle';
                resolve();
              }
            } catch {}
          }
        }, 200);
      } catch (err) {
        this.isStarting = false;
        reject(err);
      }
    });
  }

  private handleLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;

    try {
      const data = JSON.parse(trimmed);

      // Handle async typing progress events
      if (data.type === 'typing_progress') {
        const prog: TypingProgress = {
          sessionId: data.session_id,
          totalChars: data.total,
          typedChars: data.typed,
          percent: data.percent,
          currentChunk: 1,
          totalChunks: 1,
          status: data.status,
          targetProcess: '',
          errorMessage: data.error,
        };
        this.currentStatus = data.status;
        this.emit('progress', prog);
        if (this.progressCallback) {
          this.progressCallback(prog);
        }
        return;
      }

      // Handle request/response
      const reqId = data.req_id;
      if (reqId && this.pendingRequests.has(reqId)) {
        const { resolve, timer } = this.pendingRequests.get(reqId)!;
        clearTimeout(timer);
        this.pendingRequests.delete(reqId);
        resolve(data);
      }
    } catch (e) {
      console.warn('[TypeFlowService] JSON parse error on backend output:', trimmed);
    }
  }

  public async sendCommand(action: string, payload: Record<string, any> = {}, timeoutMs = 15000): Promise<any> {
    if (!this.process || this.process.killed || !this.process.stdin) {
      if (action !== 'ping') {
        await this.initialize();
      } else {
        throw new Error('TypeFlow subprocess not active');
      }
    }

    const reqId = `req_${Date.now()}_${++this.reqCounter}`;
    const cmd = { action, req_id: reqId, ...payload };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pendingRequests.has(reqId)) {
          this.pendingRequests.delete(reqId);
          reject(new Error(`TypeFlow command '${action}' timed out after ${timeoutMs}ms`));
        }
      }, timeoutMs);

      this.pendingRequests.set(reqId, { resolve, reject, timer });

      try {
        this.process!.stdin!.write(JSON.stringify(cmd) + '\n');
      } catch (err) {
        clearTimeout(timer);
        this.pendingRequests.delete(reqId);
        reject(err);
      }
    });
  }

  public async getTargetWindow(targetHint?: string): Promise<TargetWindowInfo> {
    await this.initialize();
    const res = await this.sendCommand('get_target', { target_hint: targetHint });
    return res.target || { hwnd: 0, title: '', process: 'unknown' };
  }

  public async activateTarget(hwnd: number): Promise<boolean> {
    if (!hwnd) return false;
    await this.initialize();
    const res = await this.sendCommand('activate_target', { hwnd });
    return Boolean(res.activated);
  }

  public async validateTarget(target?: TargetWindowInfo): Promise<{ valid: boolean; reason?: string }> {
    const t = target || (await this.getTargetWindow());
    if (!t || !t.hwnd) {
      return { valid: false, reason: 'No active target window found.' };
    }
    if (t.isPassword) {
      return { valid: false, reason: 'Target field is password-protected.' };
    }
    const proc = (t.process || '').toLowerCase();
    // Exclude exam lockdown browsers or restricted testing apps
    if (proc.includes('lockdown') || proc.includes('examora') || proc.includes('safeexambrowser')) {
      return { valid: false, reason: 'Automated typing is restricted in this examination environment.' };
    }
    return { valid: true };
  }

  public async getSelectedText(): Promise<SelectedTextResult> {
    await this.initialize();
    const res = await this.sendCommand('get_selected_text');
    const uiaResult = res.result || {};
    const win = uiaResult.window || {};

    if (uiaResult.success && uiaResult.text) {
      return {
        text: uiaResult.text,
        source: 'ui-automation',
        application: win.process || 'unknown',
        windowTitle: win.title || '',
        timestamp: Date.now(),
        isPassword: win.isPassword,
      };
    }

    return {
      text: '',
      source: 'none',
      application: win.process || 'unknown',
      windowTitle: win.title || '',
      timestamp: Date.now(),
      error: uiaResult.error || 'No selected text exposed via UI Automation',
    };
  }

  public async startTyping(
    text: string,
    config: TypingSessionConfig = {},
    onProgress?: (progress: TypingProgress) => void
  ): Promise<TypingResult> {
    const cleanText = text || '';
    if (!cleanText) {
      throw new Error('Refusing to type empty text.');
    }

    await this.initialize();

    const target = await this.getTargetWindow(config.targetApp);
    const validation = await this.validateTarget(target);
    if (!validation.valid) {
      throw new Error(`Target validation failed: ${validation.reason}`);
    }

    const sessionId = `tf_sess_${Date.now()}`;
    this.activeSessionId = sessionId;
    this.currentStatus = 'typing';
    this.progressCallback = onProgress || null;

    const delayMs = config.charDelayMs ?? (config.speedWpm ? Math.round(12000 / config.speedWpm) : 25);
    const autoValidate = config.autoValidateTarget !== false;

    // Activate target window explicitly before typing
    if (target.hwnd) {
      await this.activateTarget(target.hwnd);
    }

    const startRes = await this.sendCommand('start_typing', {
      session_id: sessionId,
      text: cleanText,
      target_hwnd: target.hwnd,
      delay_ms: delayMs,
      auto_validate: autoValidate,
    });

    if (startRes.status === 'error') {
      this.currentStatus = 'error';
      throw new Error(startRes.error || 'Failed to start typing session');
    }

    // Return promise that completes when typing reaches completed/cancelled/error
    return new Promise((resolve) => {
      const startTime = Date.now();
      const progressHandler = (p: TypingProgress) => {
        if (p.sessionId !== sessionId) return;

        if (p.status === 'completed' || p.status === 'cancelled' || p.status === 'error') {
          this.removeListener('progress', progressHandler);
          this.currentStatus = p.status;
          this.activeSessionId = null;
          this.progressCallback = null;

          resolve({
            sessionId,
            success: p.status === 'completed',
            charsTyped: p.typedChars,
            totalChars: p.totalChars,
            durationMs: Date.now() - startTime,
            status: p.status,
            targetProcess: target.process,
            errorMessage: p.errorMessage,
          });
        }
      };

      this.on('progress', progressHandler);
    });
  }

  public async pauseTyping(): Promise<boolean> {
    if (!this.isReady()) return false;
    const res = await this.sendCommand('pause_typing');
    if (res.status === 'paused') {
      this.currentStatus = 'paused';
      return true;
    }
    return false;
  }

  public async resumeTyping(): Promise<boolean> {
    if (!this.isReady()) return false;
    const res = await this.sendCommand('resume_typing');
    if (res.status === 'resumed') {
      this.currentStatus = 'typing';
      return true;
    }
    return false;
  }

  public async cancelTyping(): Promise<boolean> {
    if (!this.isReady()) return false;
    const res = await this.sendCommand('cancel_typing');
    if (res.status === 'cancelling') {
      this.currentStatus = 'cancelled';
      return true;
    }
    return false;
  }

  public async shutdown(): Promise<void> {
    if (this.process && !this.process.killed) {
      try {
        await this.sendCommand('exit', {}, 1000);
      } catch {}
      this.process.kill();
      this.process = null;
      this.ready = false;
      this.currentStatus = 'idle';
    }
  }
}

export const typeFlowService = TypeFlowService.getInstance();
