import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import readline from 'readline';
import { TargetWindowInfo, VoiceFlowTranscriptResult } from './types';

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  timer: NodeJS.Timeout;
}

export class VoiceFlowService {
  private static instance: VoiceFlowService | null = null;
  private process: ChildProcess | null = null;
  private rl: readline.Interface | null = null;
  private pendingRequests = new Map<string, PendingRequest>();
  private reqCounter = 0;
  private isStarting = false;
  private ready = false;
  private currentModel = 'base';

  public static getInstance(): VoiceFlowService {
    if (!VoiceFlowService.instance) {
      VoiceFlowService.instance = new VoiceFlowService();
    }
    return VoiceFlowService.instance;
  }

  private constructor() {}

  public isReady(): boolean {
    return this.ready && this.process !== null && !this.process.killed;
  }

  /**
   * Starts the Python VoiceFlow engine subprocess.
   */
  public async start(modelName = 'base'): Promise<void> {
    if (this.isReady()) {
      return;
    }

    if (this.isStarting) {
      // Wait for ongoing start
      await new Promise<void>((resolve) => {
        const interval = setInterval(() => {
          if (this.ready) {
            clearInterval(interval);
            resolve();
          }
        }, 100);
      });
      return;
    }

    this.isStarting = true;
    this.currentModel = modelName;

    return new Promise((resolve, reject) => {
      try {
        const candidatePaths = [
          path.resolve(__dirname, 'voiceflowEngine.py'),
          path.resolve(__dirname, '../../../src/services/voiceflow/voiceflowEngine.py'),
          path.resolve(process.cwd(), 'src/services/voiceflow/voiceflowEngine.py'),
          path.resolve(process.resourcesPath || '', 'app/src/services/voiceflow/voiceflowEngine.py'),
          path.resolve(process.resourcesPath || '', 'src/services/voiceflow/voiceflowEngine.py'),
          path.resolve(process.resourcesPath || '', 'voiceflowEngine.py'),
        ];
        const scriptPath = candidatePaths.find((p) => fs.existsSync(p)) || candidatePaths[0];

        // Ensure Python 3.12 with faster-whisper and pywin32 is used
        const knownPython = 'C:\\Users\\RAM CHARAN\\AppData\\Local\\Programs\\Python\\Python312\\python.exe';
        const pythonExecutable = fs.existsSync(knownPython) ? knownPython : 'python';

        this.process = spawn(pythonExecutable, [scriptPath], {
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
          env: {
            ...process.env,
            PYTHONUNBUFFERED: '1',
          },
        });

        if (!this.process.stdout || !this.process.stdin) {
          throw new Error('Failed to attach stdio pipes to VoiceFlow engine.');
        }

        this.rl = readline.createInterface({
          input: this.process.stdout,
          terminal: false,
        });

        this.rl.on('line', (line: string) => {
          this.handleStdoutLine(line);
        });

        this.process.stderr?.on('data', (data: Buffer) => {
          // Log engine diagnostics
          const msg = data.toString().trim();
          if (msg) {
            console.log(msg);
          }
        });

        this.process.on('error', (err) => {
          console.error('[VoiceFlowService] Child process error:', err);
          this.ready = false;
          this.isStarting = false;
          reject(err);
        });

        this.process.on('exit', (code, signal) => {
          console.log(`[VoiceFlowService] Child process exited with code ${code}, signal ${signal}`);
          this.ready = false;
          this.isStarting = false;
          this.process = null;
          this.rl = null;

          // Reject any remaining pending requests
          for (const [id, req] of this.pendingRequests.entries()) {
            clearTimeout(req.timer);
            req.reject(new Error('VoiceFlow engine process terminated prematurely.'));
            this.pendingRequests.delete(id);
          }
        });

        // Ping to confirm readiness
        const pingTimeout = setTimeout(() => {
          if (!this.ready) {
            this.stop();
            reject(new Error('VoiceFlow engine ping timed out during startup.'));
          }
        }, 10000);

        this.sendRequest({ action: 'ping' }, 8000)
          .then(() => {
            clearTimeout(pingTimeout);
            this.ready = true;
            this.isStarting = false;
            resolve();
          })
          .catch((err) => {
            clearTimeout(pingTimeout);
            this.isStarting = false;
            reject(err);
          });
      } catch (err) {
        this.isStarting = false;
        reject(err);
      }
    });
  }

  /**
   * Dispatches a line-delimited JSON command to the Python engine.
   */
  private sendRequest<T = any>(payload: Record<string, any>, timeoutMs = 45000): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.process || !this.process.stdin || this.process.killed) {
        return reject(new Error('VoiceFlow engine is not running.'));
      }

      const reqId = `vf_req_${Date.now()}_${++this.reqCounter}`;
      const msg = JSON.stringify({ ...payload, req_id: reqId }) + '\n';

      const timer = setTimeout(() => {
        if (this.pendingRequests.has(reqId)) {
          this.pendingRequests.delete(reqId);
          reject(new Error(`VoiceFlow request ${reqId} timed out after ${timeoutMs}ms.`));
        }
      }, timeoutMs);

      this.pendingRequests.set(reqId, { resolve, reject, timer });
      this.process.stdin.write(msg, 'utf-8');
    });
  }

  private handleStdoutLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;

    try {
      const data = JSON.parse(trimmed);
      const reqId = data.req_id;

      if (reqId && this.pendingRequests.has(reqId)) {
        const req = this.pendingRequests.get(reqId)!;
        clearTimeout(req.timer);
        this.pendingRequests.delete(reqId);

        if (data.status === 'error') {
          req.reject(new Error(data.error || 'VoiceFlow engine error.'));
        } else {
          req.resolve(data);
        }
      }
    } catch (err) {
      console.error('[VoiceFlowService] Failed to parse engine stdout JSON:', trimmed, err);
    }
  }

  /**
   * Transcribes base64-encoded audio (WAV or supported format) using the local speech engine.
   */
  public async transcribeAudio(
    audioBase64: string,
    language = 'auto',
    model?: string
  ): Promise<VoiceFlowTranscriptResult> {
    if (!this.isReady()) {
      await this.start(model || this.currentModel);
    }

    const resp = await this.sendRequest<{ status: string; result: any }>(
      {
        action: 'transcribe',
        audio_base64: audioBase64,
        language,
        model: model || this.currentModel,
      },
      60000 // 60s timeout for longer audio clips
    );

    const r = resp.result;
    return {
      text: r.text,
      language: r.language,
      languageProbability: r.language_probability,
      durationMs: Math.round((r.duration || 0) * 1000),
      latencyMs: r.latency_ms,
      segments: r.segments,
    };
  }

  /**
   * Resolves the current active foreground window handle and process.
   */
  public async getTargetWindow(): Promise<TargetWindowInfo> {
    if (!this.isReady()) {
      await this.start(this.currentModel);
    }

    try {
      const resp = await this.sendRequest<{ status: string; target: TargetWindowInfo }>(
        { action: 'get_target' },
        5000
      );
      return resp.target;
    } catch (err: any) {
      console.warn('[VoiceFlowService] Failed to get target window:', err?.message || err);
      return {
        hwnd: 0,
        title: '',
        process: 'unknown',
        isPassword: false,
        isTerminal: false,
      };
    }
  }

  /**
   * Dispatches paste keystrokes into the specified target HWND.
   */
  public async dispatchPaste(hwnd: number, isTerminal: boolean): Promise<boolean> {
    if (!this.isReady()) {
      await this.start(this.currentModel);
    }

    const resp = await this.sendRequest<{ status: string; pasted: boolean }>(
      {
        action: 'paste',
        hwnd,
        is_terminal: isTerminal,
      },
      8000
    );
    return Boolean(resp.pasted);
  }

  /**
   * Unloads the Whisper model from memory to free up RAM when idle.
   */
  public async unloadModel(): Promise<void> {
    if (this.isReady()) {
      try {
        await this.sendRequest({ action: 'unload' }, 5000);
      } catch (err) {
        console.warn('[VoiceFlowService] Failed to cleanly unload model:', err);
      }
    }
  }

  /**
   * Cleanly terminates the child process.
   */
  public async stop(): Promise<void> {
    if (!this.process) return;

    try {
      if (this.process.stdin && !this.process.killed) {
        this.process.stdin.write(JSON.stringify({ action: 'exit' }) + '\n');
      }
    } catch {}

    const proc = this.process;
    this.process = null;
    this.ready = false;
    this.isStarting = false;

    await new Promise<void>((resolve) => {
      const killTimer = setTimeout(() => {
        try {
          proc?.kill('SIGKILL');
        } catch {}
        resolve();
      }, 1500);

      proc?.once('exit', () => {
        clearTimeout(killTimer);
        resolve();
      });
    });
  }
}

export const voiceFlowService = VoiceFlowService.getInstance();
