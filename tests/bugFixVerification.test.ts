import { describe, it, expect, beforeEach, vi } from 'vitest';
import { geminiService } from '../src/services/ai/gemini';
import { providerManager } from '../src/services/ai/providers/providerManager';
import { neuralVoiceService } from '../src/services/voice/neuralVoice';
import { LocalWakeWordDetector } from '../src/services/voice/localWakeWord';
import { VoiceCoordinator } from '../src/main/voiceCoordinator';
import { settingsStore } from '../src/services/storage/settingsStore';
import { memoryService } from '../src/services/memory/memoryService';

describe('FRIDAY Bug Fix Verification Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Gemini Error & Input Validation (Eliminating slice errors and empty queries)', () => {
    it('handles normal text message successfully', async () => {
      // Mock Gemini Client
      vi.spyOn(geminiService as any, 'getClient').mockReturnValue({
        models: {
          generateContentStream: vi.fn().mockResolvedValue([
            {
              candidates: [
                {
                  content: {
                    role: 'model',
                    parts: [{ text: 'Hello, I am FRIDAY. How can I assist you today?' }],
                  },
                },
              ],
            },
          ]),
        },
      });

      const res = await geminiService.sendMessage({
        message: 'Can you summarize recent news?',
        conversationHistory: [],
      });

      expect(res).toBeDefined();
      expect(res.text).toBeTruthy();
      expect(res.error).toBeUndefined();
    });

    it('rejects empty message with a controlled validation message without calling Gemini', async () => {
      const getClientSpy = vi.spyOn(geminiService as any, 'getClient');

      const res = await geminiService.sendMessage({
        message: '',
        conversationHistory: [],
      });

      expect(res).toBeDefined();
      expect(res.error).toBe('EMPTY_USER_MESSAGE');
      expect(res.text).toMatch(/didn't catch that|వినిపించలేదు/i);
      expect(getClientSpy).not.toHaveBeenCalled();
    });

    it('rejects whitespace-only message through providerManager without calling Gemini', async () => {
      const getClientSpy = vi.spyOn(geminiService as any, 'getClient');

      const res = await providerManager.generate({
        message: '     ',
      });

      expect(res).toBeDefined();
      expect(res.error).toBe('EMPTY_USER_MESSAGE');
      expect(res.text).toMatch(/didn't catch that|వినిపించలేదు/i);
      expect(getClientSpy).not.toHaveBeenCalled();
    });

    it('safely handles missing (undefined) query in providerManager', async () => {
      const res = await providerManager.generate({} as any);

      expect(res).toBeDefined();
      expect(res.error).toBe('EMPTY_USER_MESSAGE');
      expect(res.text).toBeTruthy();
    });

    it('safely handles missing (undefined) conversationHistory without throwing slice error', async () => {
      vi.spyOn(geminiService as any, 'getClient').mockReturnValue({
        models: {
          generateContentStream: vi.fn().mockResolvedValue([
            {
              candidates: [
                {
                  content: {
                    role: 'model',
                    parts: [{ text: 'I received your request with undefined history.' }],
                  },
                },
              ],
            },
          ]),
        },
      });

      // Calling with undefined conversationHistory — MUST NOT throw "Cannot read properties of undefined (reading 'slice')"
      const res = await geminiService.sendMessage({
        message: 'Tell me a quick tip',
        conversationHistory: undefined as any,
      });

      expect(res).toBeDefined();
      expect(res.text).toContain('I received your request');
    });

    it('handles malformed or empty provider responses safely', async () => {
      vi.spyOn(geminiService as any, 'getClient').mockReturnValue({
        models: {
          generateContentStream: vi.fn().mockResolvedValue([
            {
              candidates: [
                {
                  content: {
                    role: 'model',
                    parts: [], // empty parts
                  },
                },
              ],
            },
          ]),
        },
      });

      const res = await geminiService.sendMessage({
        message: 'Test empty content',
        conversationHistory: [],
      });

      expect(res).toBeDefined();
      expect(res.text).toBeTruthy(); // returns default fallback message
    });

    it('executes tool-call responses and returns tool records', async () => {
      let turn = 0;
      vi.spyOn(geminiService as any, 'getClient').mockReturnValue({
        models: {
          generateContentStream: vi.fn().mockImplementation(() => {
            turn++;
            if (turn === 1) {
              return Promise.resolve([
                {
                  candidates: [
                    {
                      content: {
                        role: 'model',
                        parts: [
                          {
                            functionCall: {
                              name: 'save_note',
                              args: { title: 'Test Note', content: 'Sample content' },
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              ]);
            }
            return Promise.resolve([
              {
                candidates: [
                  {
                    content: {
                      role: 'model',
                      parts: [{ text: 'I saved your note.' }],
                    },
                  },
                ],
              },
            ]);
          }),
        },
      });

      const res = await geminiService.sendMessage({
        message: 'Save a note titled Test Note with Sample content',
        conversationHistory: [],
      });

      expect(res).toBeDefined();
      expect(res.toolCalls).toBeDefined();
      expect(res.toolCalls?.length).toBeGreaterThan(0);
      expect(res.toolCalls?.[0].toolName).toBe('save_note');
    });
  });

  describe('2. Murf TTS Authentication & Graceful Fallback', () => {
    it('handles missing Murf key by falling back to Edge Neural or Gemini TTS', async () => {
      // Mock edge synthesis
      vi.spyOn(neuralVoiceService as any, 'synthesizeEdge').mockResolvedValue({
        audioBase64: 'mock_audio_edge',
        mimeType: 'audio/mpeg',
        voice: 'en-IN-NeerjaExpressiveNeural',
        engine: 'edge',
      });

      const result = await neuralVoiceService.synthesize({
        text: 'This is a test with fallback.',
      });

      expect(result).toBeDefined();
      expect(result.audioBase64).toBeTruthy();
    });

    it('gracefully handles 401 Invalid api-key without repeatedly retrying invalid key', async () => {
      // Force Murf key
      vi.spyOn(neuralVoiceService as any, 'getMurfApiKey').mockReturnValue('invalid_mock_murf_key_67_characters_long_1234567890123456789012345678');
      
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ message: 'Invalid api-key provided' }),
      } as any);

      // Edge fallback mock
      vi.spyOn(neuralVoiceService as any, 'synthesizeEdge').mockResolvedValue({
        audioBase64: 'edge_fallback_audio',
        mimeType: 'audio/mpeg',
        voice: 'en-IN-NeerjaExpressiveNeural',
        engine: 'edge',
      });

      // 1st call: Murf returns 401, falls back to Edge
      const res1 = await neuralVoiceService.synthesize({ text: 'Hello there' });
      expect(res1.engine).toBe('edge');
      expect(res1.audioBase64).toBe('edge_fallback_audio');

      // 2nd call: Must NOT retry Murf (fetch should not be called again for Murf)
      fetchSpy.mockClear();
      const res2 = await neuralVoiceService.synthesize({ text: 'Second sentence without retrying 401' });
      expect(res2.engine).toBe('edge');
      expect(fetchSpy).not.toHaveBeenCalled();

      // Check usage reports 401 error instead of claiming available
      const usage = await neuralVoiceService.getUsage();
      expect(usage.available).toBe(false);
      expect(usage.error).toContain('401');
    });
  });

  describe('3. Hands-Free Voice & Wake-Word Pipeline', () => {
    it('detects positive "Hey Friday" cadence in local wake-word detector', () => {
      const onWake = vi.fn();
      const detector = new LocalWakeWordDetector({ sensitivity: 0.75, onWake });

      // Create acoustic frames matching: Peak 1 (Hey) -> Valley -> Peak 2 (Fri-) with fricative -> Valley -> Peak 3 (-day)
      const vocalFrame = new Uint8Array(256).fill(0);
      for (let i = 2; i <= 25; i++) vocalFrame[i] = 160; // 300-2500Hz
      
      const fricativeFrame = new Uint8Array(256).fill(0);
      for (let i = 40; i <= 90; i++) fricativeFrame[i] = 180; // 3500-7500Hz
      for (let i = 2; i <= 20; i++) fricativeFrame[i] = 90;

      const silenceFrame = new Uint8Array(256).fill(0);

      let t = Date.now();
      // Baseline quiet
      for (let i = 0; i < 5; i++) {
        detector.processFrequencyData(silenceFrame, 44100, (t += 50));
      }

      // Peak 1: "Hey" (~150ms)
      for (let i = 0; i < 3; i++) {
        detector.processFrequencyData(vocalFrame, 44100, (t += 50));
      }
      // Valley (~80ms)
      for (let i = 0; i < 2; i++) {
        detector.processFrequencyData(silenceFrame, 44100, (t += 50));
      }
      // Peak 2: "Fri-" (~180ms)
      for (let i = 0; i < 4; i++) {
        detector.processFrequencyData(fricativeFrame, 44100, (t += 50));
      }
      // Valley (~80ms)
      for (let i = 0; i < 2; i++) {
        detector.processFrequencyData(silenceFrame, 44100, (t += 50));
      }
      // Peak 3: "-day" (~150ms)
      let triggered = false;
      for (let i = 0; i < 3; i++) {
        if (detector.processFrequencyData(vocalFrame, 44100, (t += 50))) triggered = true;
      }

      expect(triggered).toBe(true);
      expect(onWake).toHaveBeenCalled();
    });

    it('coordinates state machine: Standby -> Wake -> Listening -> Speaking -> Standby', () => {
      const mockWin = {
        isDestroyed: () => false,
        webContents: {
          isDestroyed: () => false,
          send: vi.fn(),
        },
      } as any;

      const coordinator = new VoiceCoordinator(() => mockWin, () => mockWin);

      // Standby
      expect(coordinator.getState().sessionState).toBe('STANDBY');
      expect(coordinator.getState().robotState).toBe('idle');

      // Wake
      coordinator.handleWakeWord();
      expect(coordinator.getState().sessionState).toBe('WAKE_DETECTED');
      expect(coordinator.getState().robotState).toBe('listening');

      // Speech end & processing
      coordinator.setState('PROCESSING_AUDIO');
      expect(coordinator.getState().robotState).toBe('thinking');

      // Speaking
      coordinator.setState('SPEAKING');
      expect(coordinator.getState().robotState).toBe('speaking');
      expect(coordinator.getState().isSpeaking).toBe(true);

      // Return to standby
      coordinator.setState('STANDBY');
      expect(coordinator.getState().sessionState).toBe('STANDBY');
      expect(coordinator.getState().robotState).toBe('idle');
      expect(coordinator.getState().isSpeaking).toBe(false);
    });

    it('prevents duplicate repeated SPEAKING state transitions and IPC broadcast spam', () => {
      const mockWin = {
        isDestroyed: () => false,
        webContents: {
          isDestroyed: () => false,
          send: vi.fn(),
        },
      } as any;
      const petWin = {
        isDestroyed: () => false,
        webContents: {
          isDestroyed: () => false,
          send: vi.fn(),
        },
      } as any;

      const coordinator = new VoiceCoordinator(() => mockWin, () => petWin);

      // Transition to SPEAKING once
      coordinator.setState('SPEAKING');
      expect(mockWin.webContents.send).toHaveBeenCalledTimes(2); // VOICE_STATE_CHANGED and PET_STATE_CHANGED

      mockWin.webContents.send.mockClear();

      // Repeated calls with SPEAKING (e.g. from TTS chunks or amplitude frames)
      coordinator.setState('SPEAKING');
      coordinator.setState('SPEAKING');
      coordinator.setState('SPEAKING');

      // MUST NOT broadcast again or log duplicate transitions
      expect(mockWin.webContents.send).not.toHaveBeenCalled();
    });

    it('interrupts ongoing speech on user barge-in', () => {
      const mockWin = {
        isDestroyed: () => false,
        webContents: {
          isDestroyed: () => false,
          send: vi.fn(),
        },
      } as any;

      const coordinator = new VoiceCoordinator(() => mockWin, () => mockWin);
      coordinator.setState('SPEAKING');

      // User speaks during assistant output
      coordinator.handleInterrupt();
      expect(coordinator.getState().robotState).toBe('interrupted');
      expect(mockWin.webContents.send).toHaveBeenCalled();
    });
  });

  describe('4. Desktop Pet & Dashboard Full Synchronization', () => {
    it('synchronizes personality mode changes across contexts', () => {
      settingsStore.saveSettings({ personalityMode: 'roast' });
      expect(settingsStore.getSettings().personalityMode).toBe('roast');

      settingsStore.saveSettings({ personalityMode: 'simple' });
      expect(settingsStore.getSettings().personalityMode).toBe('simple');
    });

    it('stores and broadcasts messages so both interfaces share identical history', async () => {
      const userText = `Sync check user message ${Date.now()}`;
      const assistantText = `Sync check reply ${Date.now()}`;

      await memoryService.appendExchange(userText, assistantText);
      const recent = await memoryService.loadConversation(10);
      expect(recent.some((m) => m.text === userText)).toBe(true);
      expect(recent.some((m) => m.text === assistantText)).toBe(true);
    });
  });
});
