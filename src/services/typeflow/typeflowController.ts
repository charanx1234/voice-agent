import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import {
  TypeFlowClipboardItem,
  TypeFlowHistoryItem,
  TypeFlowTemplate,
  TypingProgress,
  TypingResult,
  TypingSessionConfig,
  SelectedTextResult,
  ContextUnderstandingResult
} from './types';
import { typingEngineManager } from './typingEngineManager';
import { typeFlowService } from './typeflowService';

export interface IClipboardAdapter {
  readText(): string;
  writeText(text: string): void;
  clear(): void;
}

class DefaultClipboardAdapter implements IClipboardAdapter {
  private electronClipboard: any = null;

  constructor() {
    try {
      const electron = require('electron');
      if (typeof electron === 'object' && electron.clipboard) {
        this.electronClipboard = electron.clipboard;
      }
    } catch {}
  }

  public readText(): string {
    return this.electronClipboard ? this.electronClipboard.readText() : '';
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

export class TypeFlowController extends EventEmitter {
  private static instance: TypeFlowController | null = null;
  private clipboard: IClipboardAdapter;
  private history: TypeFlowHistoryItem[] = [];
  private templates: TypeFlowTemplate[] = [];
  private queue: string[] = [];
  private activeContext: {
    selectedText: string;
    targetProcess: string;
    understanding?: ContextUnderstandingResult;
    timestamp: number;
  } | null = null;
  private isProcessingQueue = false;

  public static getInstance(): TypeFlowController {
    if (!TypeFlowController.instance) {
      TypeFlowController.instance = new TypeFlowController();
    }
    return TypeFlowController.instance;
  }

  private constructor(clipboardAdapter?: IClipboardAdapter) {
    super();
    this.clipboard = clipboardAdapter || new DefaultClipboardAdapter();
    this.initDefaultTemplates();
  }

  public setClipboardAdapter(adapter: IClipboardAdapter): void {
    this.clipboard = adapter;
  }

  private initDefaultTemplates(): void {
    this.templates = [
      {
        id: 'tpl_email_ack',
        title: 'Professional Email Acknowledgment',
        category: 'Email',
        content: 'Hi {{name}},\n\nThank you for reaching out. I have received your request regarding {{topic}} and am currently reviewing the details. I will follow up shortly with a comprehensive update.\n\nBest regards,\n{{sender}}',
        variables: ['name', 'topic', 'sender'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: 'tpl_bug_report',
        title: 'Software Bug Report',
        category: 'Engineering',
        content: '### Bug Description\n{{description}}\n\n### Steps to Reproduce\n1. {{step1}}\n2. {{step2}}\n\n### Expected Behavior\n{{expected}}\n\n### Actual Behavior\n{{actual}}',
        variables: ['description', 'step1', 'step2', 'expected', 'actual'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: 'tpl_meeting_summary',
        title: 'Meeting Action Items',
        category: 'Notes',
        content: '### Meeting Summary: {{title}}\n**Date:** {{date}}\n\n**Key Discussion Points:**\n- {{point1}}\n- {{point2}}\n\n**Action Items:**\n- [ ] {{action1}} (Owner: {{owner1}})\n- [ ] {{action2}} (Owner: {{owner2}})',
        variables: ['title', 'date', 'point1', 'point2', 'action1', 'owner1', 'action2', 'owner2'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];
  }

  /**
   * Reads clipboard safely, handling multiline, unicode, and empty states.
   */
  public getClipboardText(): string {
    return this.clipboard.readText() || '';
  }

  /**
   * Smart Chunking algorithm:
   * Chunks large text cleanly along paragraph or newline boundaries,
   * preserving code indentation and unicode characters.
   */
  public chunkText(text: string, maxChunkSize = 1000): string[] {
    if (!text || text.length <= maxChunkSize) {
      return text ? [text] : [];
    }

    const chunks: string[] = [];
    const lines = text.split('\n');
    let currentChunk = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const withNewline = (currentChunk.length > 0 ? '\n' : '') + line;

      if (currentChunk.length + withNewline.length <= maxChunkSize) {
        currentChunk += withNewline;
      } else {
        if (currentChunk.length > 0) {
          chunks.push(currentChunk);
          currentChunk = line;
        } else {
          // Single line longer than maxChunkSize, split cleanly
          let start = 0;
          while (start < line.length) {
            chunks.push(line.slice(start, start + maxChunkSize));
            start += maxChunkSize;
          }
        }
      }
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }

    return chunks;
  }

  /**
   * Types the current clipboard content into the focused application with full safety.
   */
  public async typeClipboard(config: TypingSessionConfig = {}): Promise<TypingResult> {
    const text = this.getClipboardText();
    if (!text.trim()) {
      throw new Error('Clipboard is empty or contains non-text data.');
    }

    return this.typeText(text, { ...config, source: 'clipboard' });
  }

  /**
   * Initiates text typing through the typing engine with target verification and history logging.
   * If targetApp is specified but not open, automatically launches it and waits for its window to become active.
   */
  public async typeText(
    text: string,
    options: TypingSessionConfig & { source?: TypeFlowHistoryItem['source'] } = {}
  ): Promise<TypingResult> {
    let target = await typeFlowService.getTargetWindow(options.targetApp);

    // If a specific target application was requested but isn't open, open it!
    if (options.targetApp && target.notRunning) {
      try {
        const { executeAppShortcutsTool } = await import('../agent/appShortcutsTool');
        await executeAppShortcutsTool('launch_allowed_app', { appId: options.targetApp });
        // Poll for target window to appear (up to 2 seconds)
        for (let i = 0; i < 10; i++) {
          await new Promise((r) => setTimeout(r, 200));
          target = await typeFlowService.getTargetWindow(options.targetApp);
          if (target && target.hwnd && !target.notRunning) {
            // Give window a brief moment to settle its input focus
            await new Promise((r) => setTimeout(r, 200));
            break;
          }
        }
      } catch (launchErr: any) {
        console.warn(`[TypeFlowController] Could not auto-launch ${options.targetApp}:`, launchErr);
      }
    }

    const validation = await typingEngineManager.validateTarget(target);
    if (!validation.valid) {
      throw new Error(`Cannot type into target application: ${validation.reason}`);
    }

    const t0 = Date.now();
    const result = await typingEngineManager.startTyping(text, options, (prog) => {
      this.emit('progress', prog);
    });

    // Record session history
    const historyItem: TypeFlowHistoryItem = {
      id: result.sessionId,
      timestamp: Date.now(),
      textPreview: text.length > 100 ? text.slice(0, 97) + '...' : text,
      fullText: text,
      charCount: text.length,
      source: options.source || 'manual',
      targetProcess: result.targetProcess || target.process,
      status: result.status,
      durationMs: Date.now() - t0,
    };
    this.history.unshift(historyItem);
    if (this.history.length > 200) this.history.pop();
    this.emit('history_updated', this.history);

    return result;
  }

  /**
   * Selected Text Reader:
   * Reads selected text via Windows UIAutomation (TextPattern) non-invasively.
   * If UIA returns empty or unsupported, provides an authorized clipboard fallback if permitted.
   */
  public async readSelectedText(allowFallback = true): Promise<SelectedTextResult> {
    const target = await typeFlowService.getTargetWindow();
    const uiaResult = await typeFlowService.getSelectedText();

    if (uiaResult.source === 'ui-automation' && uiaResult.text) {
      this.setActiveContext(uiaResult.text, uiaResult.application);
      return uiaResult;
    }

    // Fallback: Atomic copy extraction if permitted and not in password/protected field
    if (allowFallback && !target.isPassword) {
      const fallbackResult = await this.readSelectedTextFallback(target);
      if (fallbackResult.text) {
        this.setActiveContext(fallbackResult.text, fallbackResult.application);
        return fallbackResult;
      }
    }

    return uiaResult;
  }

  /**
   * Controlled clipboard-based selection fallback:
   * 1. Snapshots existing clipboard.
   * 2. Dispatches Ctrl+C in target application.
   * 3. Reads new selection.
   * 4. Restores original clipboard atomically.
   */
  private async readSelectedTextFallback(target: { hwnd: number; process: string; title: string }): Promise<SelectedTextResult> {
    const prevText = this.clipboard.readText();
    try {
      // Clear clipboard temporarily to detect fresh copied data
      this.clipboard.clear();
      
      // Dispatch Ctrl+C via Win32 SendInput in Python engine
      await typeFlowService.sendCommand('get_target'); // Ensures connection
      const keybdP = spawn('powershell', ['-Command', 'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait("^c")'], { windowsHide: true });
      await new Promise((r) => keybdP.on('exit', r));

      // Wait briefly for target application to place text on clipboard
      await new Promise((r) => setTimeout(r, 120));
      const copied = this.clipboard.readText();

      // Restore original clipboard
      if (prevText) {
        this.clipboard.writeText(prevText);
      } else {
        this.clipboard.clear();
      }

      if (copied && copied.trim()) {
        return {
          text: copied,
          source: 'clipboard-fallback',
          application: target.process,
          windowTitle: target.title,
          timestamp: Date.now(),
        };
      }
    } catch (e) {
      if (prevText) this.clipboard.writeText(prevText);
    }

    return {
      text: '',
      source: 'none',
      application: target.process,
      windowTitle: target.title,
      timestamp: Date.now(),
      error: 'Application does not expose selected text via accessibility or copy shortcuts.',
    };
  }

  public setActiveContext(text: string, processName: string, understanding?: ContextUnderstandingResult): void {
    this.activeContext = {
      selectedText: text,
      targetProcess: processName,
      understanding,
      timestamp: Date.now(),
    };
    this.emit('context_updated', this.activeContext);
  }

  public getActiveContext() {
    return this.activeContext;
  }

  public clearContext(): void {
    this.activeContext = null;
    this.emit('context_updated', null);
  }

  // Queue Management
  public addToQueue(text: string): void {
    if (text && text.trim()) {
      this.queue.push(text);
      this.emit('queue_updated', [...this.queue]);
    }
  }

  public getQueue(): string[] {
    return [...this.queue];
  }

  public clearQueue(): void {
    this.queue = [];
    this.emit('queue_updated', []);
  }

  public async processQueue(config: TypingSessionConfig = {}): Promise<void> {
    if (this.isProcessingQueue || this.queue.length === 0) return;
    this.isProcessingQueue = true;

    try {
      while (this.queue.length > 0) {
        const item = this.queue[0];
        await this.typeText(item, { ...config, source: 'manual' });
        this.queue.shift();
        this.emit('queue_updated', [...this.queue]);
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  // Templates Management
  public getTemplates(): TypeFlowTemplate[] {
    return [...this.templates];
  }

  public saveTemplate(template: Omit<TypeFlowTemplate, 'id' | 'createdAt' | 'updatedAt'>): TypeFlowTemplate {
    const newTpl: TypeFlowTemplate = {
      ...template,
      id: `tpl_${Date.now()}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.templates.push(newTpl);
    this.emit('templates_updated', this.templates);
    return newTpl;
  }

  public deleteTemplate(id: string): boolean {
    const initialLen = this.templates.length;
    this.templates = this.templates.filter((t) => t.id !== id);
    if (this.templates.length !== initialLen) {
      this.emit('templates_updated', this.templates);
      return true;
    }
    return false;
  }

  public renderTemplate(templateId: string, variables: Record<string, string>): string {
    const tpl = this.templates.find((t) => t.id === templateId);
    if (!tpl) throw new Error(`Template not found: ${templateId}`);

    let rendered = tpl.content;
    for (const [key, val] of Object.entries(variables)) {
      rendered = rendered.split(`{{${key}}}`).join(val);
    }
    return rendered;
  }

  // History Management
  public getHistory(): TypeFlowHistoryItem[] {
    return [...this.history];
  }

  public clearHistory(): void {
    this.history = [];
    this.emit('history_updated', []);
  }

  // Controls
  public async pause(): Promise<boolean> {
    return typingEngineManager.pauseTyping();
  }

  public async resume(): Promise<boolean> {
    return typingEngineManager.resumeTyping();
  }

  public async cancel(): Promise<boolean> {
    return typingEngineManager.cancelTyping();
  }
}

export const typeFlowController = TypeFlowController.getInstance();
