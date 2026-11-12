import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { voiceFlowService } from '../src/services/voiceflow/voiceflowService';
import { encodeWav, uint8ArrayToBase64 } from '../src/services/voice/wavEncoder';
import { voiceFlowEnhancer, fastHeuristicClean } from '../src/services/voiceflow/voiceflowEnhancer';
import { VoiceFlowPaste, IClipboardAdapter } from '../src/services/voiceflow/voiceflowPaste';
import { TargetWindowInfo } from '../src/services/voiceflow/types';
import { voiceFlowHistory } from '../src/services/voiceflow/voiceflowHistory';
import { voiceFlowController } from '../src/services/voiceflow/voiceflowController';

describe('VoiceFlow Local Speech Recognition Engine (Phase 1)', () => {
  beforeAll(async () => {
    // Start the local engine
    await voiceFlowService.start('base');
  }, 30000);

  afterAll(async () => {
    await voiceFlowService.stop();
  });

  it('connects to local engine and reports ready', () => {
    expect(voiceFlowService.isReady()).toBe(true);
  });

  it('handles empty / silence audio gracefully with VAD filtering', async () => {
    // 1 second of silence
    const silence = new Float32Array(16000);
    const wavBytes = encodeWav(silence, 16000);
    const b64 = uint8ArrayToBase64(wavBytes);

    const result = await voiceFlowService.transcribeAudio(b64);
    expect(result).toBeDefined();
    // VAD should filter out silence, resulting in empty or minimal string
    expect(result.text).toBe('');
    expect(result.durationMs).toBeGreaterThan(0);
  });

  it('transcribes synthesized speech audio accurately with language detection', async () => {
    const testAudioPath = path.resolve(process.cwd(), '.cache/test_audio/en_mixed.wav');
    if (!fs.existsSync(testAudioPath)) {
      console.warn('Skipping test audio check because test WAV was not generated.');
      return;
    }

    const audioBuf = fs.readFileSync(testAudioPath);
    const b64 = audioBuf.toString('base64');

    const result = await voiceFlowService.transcribeAudio(b64, 'en');
    expect(result).toBeDefined();
    expect(result.text.toLowerCase()).toContain('meeting');
    expect(result.language).toBe('en');
    expect(result.latencyMs).toBeGreaterThan(0);
  });

  it('unloads model cleanly to release RAM', async () => {
    await expect(voiceFlowService.unloadModel()).resolves.not.toThrow();
  });
});

describe('VoiceFlow AI Text Enhancement (Phase 2)', () => {
  it('applies verbatim mode with zero alteration', async () => {
    const raw = 'friday please deploy the kubernetes cluster to production';
    const res = await voiceFlowEnhancer.enhance(raw, 'verbatim');
    expect(res.text).toBe(raw);
    expect(res.mode).toBe('verbatim');
    expect(res.providerUsed).toBe('direct_verbatim');
  });

  it('cleans verbal fillers in concise mode using fast heuristic', () => {
    const raw = 'um basically you know i was thinking like we should update the database';
    const cleaned = fastHeuristicClean(raw, 'concise');
    expect(cleaned.toLowerCase()).not.toContain('um');
    expect(cleaned.toLowerCase()).not.toContain('you know');
    expect(cleaned).toContain('database');
  });

  it('preserves code symbols and technical terms in code mode', () => {
    const raw = 'const handleVoiceSubmit = async (req, res) => res.status(200)';
    const cleaned = fastHeuristicClean(raw, 'code');
    expect(cleaned).toContain('const handleVoiceSubmit');
    expect(cleaned).toContain('res.status(200)');
  });

  it('handles direct transcription bypass setting cleanly', async () => {
    const raw = 'friday schedule team meeting';
    const res = await voiceFlowEnhancer.enhance(raw, 'natural', { directTranscription: true });
    expect(res.text).toBe('Friday schedule team meeting');
    expect(res.providerUsed).toBe('direct_verbatim');
  });

  it('preserves Telugu-English mixed phrases without corrupting them', () => {
    const raw = 'Friday, repu podduna meeting schedule chey';
    const cleaned = fastHeuristicClean(raw, 'natural');
    expect(cleaned).toContain('repu podduna');
    expect(cleaned).toContain('chey');
  });
});

describe('VoiceFlow Text Insertion & Clipboard Safety (Phase 3)', () => {
  class MockClipboardAdapter implements IClipboardAdapter {
    public value: string = '';
    readText(): string {
      return this.value;
    }
    writeText(text: string): void {
      this.value = text;
    }
    clear(): void {
      this.value = '';
    }
  }

  it('refuses to insert empty or whitespace-only text', async () => {
    const mockClip = new MockClipboardAdapter();
    const pasteService = new VoiceFlowPaste(mockClip);
    await expect(pasteService.insertText('   ')).rejects.toThrow('Refusing to insert empty transcription text');
  });

  it('blocks text insertion if target is a sensitive password field', async () => {
    const mockClip = new MockClipboardAdapter();
    const pasteService = new VoiceFlowPaste(mockClip);
    const pwdTarget: TargetWindowInfo = {
      hwnd: 12345,
      title: 'Login Dialog',
      process: 'app.exe',
      isPassword: true,
      isTerminal: false,
    };

    await expect(pasteService.insertText('secret123', pwdTarget)).rejects.toThrow('password field');
    expect(mockClip.value).toBe('');
  });

  it('snapshots previous clipboard, writes enhanced text, and restores original after delay', async () => {
    const mockClip = new MockClipboardAdapter();
    mockClip.writeText('user previous clipboard content');

    const pasteService = new VoiceFlowPaste(mockClip);

    // Mock dispatchPaste to succeed without making native OS calls in unit test
    vi.spyOn(voiceFlowService, 'dispatchPaste').mockResolvedValueOnce(true);

    const normalTarget: TargetWindowInfo = {
      hwnd: 54321,
      title: 'VS Code',
      process: 'Code.exe',
      isPassword: false,
      isTerminal: false,
    };

    const textToInsert = 'def test_function():\n    return "hello"';
    const result = await pasteService.insertText(textToInsert, normalTarget, {
      restoreClipboard: true,
      restoreDelayMs: 50,
    });

    expect(result.success).toBe(true);
    expect(result.multiline).toBe(true);
    expect(result.charsInserted).toBe(textToInsert.length);
    // Immediately after paste dispatch, clipboard should contain the inserted text
    expect(mockClip.value).toBe(textToInsert);

    // After 60ms, the snapshot should be restored
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(mockClip.value).toBe('user previous clipboard content');
  });

  it('restores previous clipboard immediately if paste dispatch fails', async () => {
    const mockClip = new MockClipboardAdapter();
    mockClip.writeText('critical original token');

    const pasteService = new VoiceFlowPaste(mockClip);
    vi.spyOn(voiceFlowService, 'dispatchPaste').mockResolvedValueOnce(false);

    const normalTarget: TargetWindowInfo = {
      hwnd: 9999,
      title: 'Notepad',
      process: 'notepad.exe',
      isPassword: false,
      isTerminal: false,
    };

    await expect(pasteService.insertText('sample text', normalTarget)).rejects.toThrow('Failed to dispatch paste keystroke');
    // Original clipboard must be restored immediately on error
    expect(mockClip.value).toBe('critical original token');
  });

  it('preserves Telugu Unicode and multiline structure in inserted text', async () => {
    const mockClip = new MockClipboardAdapter();
    const pasteService = new VoiceFlowPaste(mockClip);
    vi.spyOn(voiceFlowService, 'dispatchPaste').mockResolvedValueOnce(true);

    const unicodeText = 'నమస్కారం Friday!\nDeploy the release now: v1.0.0';
    const result = await pasteService.insertText(unicodeText, undefined, { restoreClipboard: false });

    expect(result.success).toBe(true);
    expect(mockClip.value).toBe(unicodeText);
    expect(mockClip.value).toContain('నమస్కారం');
  });
});

describe('VoiceFlow History & Controller Lifecycle (Phases 4 & 5)', () => {
  beforeAll(() => {
    // Polyfill localStorage for node environment if not present
    if (typeof global.localStorage === 'undefined') {
      const store: Record<string, string> = {};
      global.localStorage = {
        getItem: (k: string) => store[k] || null,
        setItem: (k: string, v: string) => {
          store[k] = v;
        },
        removeItem: (k: string) => {
          delete store[k];
        },
        clear: () => {
          for (const k of Object.keys(store)) delete store[k];
        },
        key: (_i: number) => null,
        length: 0,
      } as any;
    }
  });

  it('records, queries, deletes, and clears history entries accurately', () => {
    voiceFlowHistory.clear();
    expect(voiceFlowHistory.getHistory().length).toBe(0);

    const entry1 = voiceFlowHistory.addEntry({
      rawTranscript: 'friday deploy to production',
      enhancedText: 'Friday, deploy to production.',
      mode: 'natural',
      language: 'en',
      inserted: true,
      targetApp: 'Code.exe',
      latencyMs: 1400,
    });

    const entry2 = voiceFlowHistory.addEntry({
      rawTranscript: 'repu podduna team meeting undi',
      enhancedText: 'Repu podduna team meeting undi.',
      mode: 'verbatim',
      language: 'te',
      inserted: true,
      targetApp: 'slack.exe',
      latencyMs: 980,
    });

    const history = voiceFlowHistory.getHistory();
    expect(history.length).toBe(2);
    // Newest first
    expect(history[0].id).toBe(entry2.id);

    voiceFlowHistory.deleteEntry(entry1.id);
    expect(voiceFlowHistory.getHistory().length).toBe(1);

    voiceFlowHistory.clear();
    expect(voiceFlowHistory.getHistory().length).toBe(0);
  });

  it('initializes controller in IDLE_READY state and allows mode switching', () => {
    expect(voiceFlowController.getState()).toBe('IDLE_READY');
    expect(voiceFlowController.isBusy()).toBe(false);

    voiceFlowController.setMode('code');
    expect(voiceFlowController.getSettings().mode).toBe('code');

    voiceFlowController.setMode('natural');
    expect(voiceFlowController.getSettings().mode).toBe('natural');
  });

  it('notifies state subscribers across transitions and handles immediate cancel', () => {
    const statesSeen: string[] = [];
    const unsub = voiceFlowController.subscribeState((st) => {
      statesSeen.push(st);
    });

    voiceFlowController.cancel();
    expect(statesSeen).toContain('CANCELLED');

    unsub();
  });
});
