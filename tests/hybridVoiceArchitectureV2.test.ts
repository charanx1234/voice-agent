import { describe, it, expect, beforeEach, vi } from 'vitest';
import { requestController } from '../src/services/voice/requestController';
import { noiseSuppressor } from '../src/services/voice/noiseSuppressor';
import { echoCanceller } from '../src/services/voice/echoCanceller';
import { turnDetector } from '../src/services/voice/turnDetector';
import { VoiceCoordinator } from '../src/main/voiceCoordinator';
import { IPC_CHANNELS } from '../src/main/security';

describe('FRIDAY Hybrid Voice Architecture V2 Suite', () => {
  beforeEach(() => {
    requestController.reset();
    noiseSuppressor.reset();
    echoCanceller.reset();
    turnDetector.reset();
  });

  describe('1. Single Request Controller & Turn Lifecycle', () => {
    it('starts a new turn and assigns unique requestId, turnId, and sessionId', () => {
      const turn1 = requestController.startTurn();
      expect(turn1.turnId).toBeDefined();
      expect(turn1.requestId).toBeDefined();
      expect(turn1.sessionId).toBeDefined();
      expect(turn1.state).toBe('LISTENING');
      expect(turn1.cancelled).toBe(false);
      expect(requestController.isTurnActive(turn1.turnId)).toBe(true);
    });

    it('enforces single-in-flight turn: starting turn2 immediately cancels turn1', () => {
      const turn1 = requestController.startTurn();
      expect(turn1.cancelled).toBe(false);

      const turn2 = requestController.startTurn();
      expect(turn1.cancelled).toBe(true);
      expect(turn1.state).toBe('INTERRUPTED');
      expect(turn2.cancelled).toBe(false);
      expect(requestController.isTurnActive(turn1.turnId)).toBe(false);
      expect(requestController.isTurnActive(turn2.turnId)).toBe(true);
    });

    it('safely rejects stale state updates from obsolete turns', () => {
      const turn1 = requestController.startTurn();
      requestController.startTurn(); // supersedes turn1

      // Attempt to update obsolete turn1
      const updated = requestController.updateTurnState(turn1.turnId, 'SPEAKING');
      expect(updated).toBe(false);
    });

    it('cancels active turn on user barge-in and immediately starts new listening turn', () => {
      const turn1 = requestController.startTurn();
      requestController.updateTurnState(turn1.turnId, 'SPEAKING');

      const bargeTurn = requestController.handleBargeIn();
      expect(turn1.cancelled).toBe(true);
      expect(turn1.state).toBe('INTERRUPTED');
      expect(bargeTurn.isBargeIn).toBe(true);
      expect(bargeTurn.state).toBe('WAKE_DETECTED');
    });
  });

  describe('2. Noise Suppressor (DSP Spectral Preprocessing)', () => {
    it('adapts ambient noise floor from stationary noise frames', () => {
      // Simulate 50 frames of steady laptop fan noise (RMS ~0.04)
      const frameSize = 512;
      for (let f = 0; f < 50; f++) {
        const fanNoise = new Float32Array(frameSize);
        for (let i = 0; i < frameSize; i++) {
          fanNoise[i] = (Math.random() - 0.5) * 0.08;
        }
        noiseSuppressor.process(fanNoise);
      }

      const noiseFloor = noiseSuppressor.getNoiseFloor();
      expect(noiseFloor).toBeGreaterThan(0.01);
      expect(noiseFloor).toBeLessThan(0.08);
    });

    it('attenuates quiet background noise while preserving speech', () => {
      const frameSize = 256;
      const quietNoise = new Float32Array(frameSize);
      for (let i = 0; i < frameSize; i++) quietNoise[i] = 0.015;

      const cleanedNoise = noiseSuppressor.process(quietNoise);
      // Suppressed frame energy should be substantially lower than input
      let sumNoise = 0;
      for (let i = 0; i < frameSize; i++) sumNoise += Math.abs(cleanedNoise[i]);
      expect(sumNoise / frameSize).toBeLessThan(0.015);

      // Strong speech frame (RMS ~0.4)
      const speechFrame = new Float32Array(frameSize);
      for (let i = 0; i < frameSize; i++) {
        speechFrame[i] = Math.sin((i / frameSize) * 2 * Math.PI * 4) * 0.4;
      }
      const cleanedSpeech = noiseSuppressor.process(speechFrame);
      let sumSpeech = 0;
      for (let i = 0; i < frameSize; i++) sumSpeech += Math.abs(cleanedSpeech[i]);
      expect(sumSpeech / frameSize).toBeGreaterThan(0.2);
    });

    it('suppresses sudden transient spikes (keyboard clicks / mic pops)', () => {
      const frameSize = 256;
      const frame = new Float32Array(frameSize);
      frame[10] = 0.95; // sharp spike
      frame[11] = -0.92;

      const processed = noiseSuppressor.process(frame);
      expect(Math.abs(processed[10])).toBeLessThan(0.95);
    });
  });

  describe('3. Echo Canceller & Barge-In Reference Mask', () => {
    it('suppresses acoustic self-echo when FRIDAY is speaking', () => {
      echoCanceller.setSpeakingState(true);

      // Register playback frame (speaker output)
      const playback = new Float32Array(256);
      playback.fill(0.3);
      echoCanceller.registerPlaybackFrame(playback);

      // Mic receives speaker bleed of roughly equal or lower amplitude
      const micBleed = new Float32Array(256);
      micBleed.fill(0.18);

      const result = echoCanceller.process(micBleed);
      // Self-echo should be flagged and attenuated
      expect(result.isSelfEcho).toBe(true);
      expect(result.isUserBargeIn).toBe(false);
      expect(result.processed[0]).toBeLessThan(0.18);
    });

    it('detects user barge-in when speech overrides speaker bleed', () => {
      echoCanceller.setSpeakingState(true);

      const playback = new Float32Array(256);
      playback.fill(0.15);
      echoCanceller.registerPlaybackFrame(playback);

      // User speaks loudly over FRIDAY's voice (amplitude 0.5)
      const userBargeIn = new Float32Array(256);
      userBargeIn.fill(0.5);

      const result = echoCanceller.process(userBargeIn);
      expect(result.isUserBargeIn).toBe(true);
      expect(result.isSelfEcho).toBe(false);
    });
  });

  describe('4. Turn & Pause Detector', () => {
    it('confirms speech start only after sustained vocal energy', () => {
      // 1 isolated spike (<80ms) should NOT trigger speech start
      const event1 = turnDetector.update(0.25, 1000);
      expect(event1).toBeNull();
      expect(turnDetector.isActive).toBe(false);

      // Sustained energy for >80ms triggers speech_started
      const event2 = turnDetector.update(0.25, 1090);
      expect(event2).not.toBeNull();
      expect(event2?.type).toBe('speech_started');
      expect(turnDetector.isActive).toBe(true);
    });

    it('allows natural mid-sentence hesitation pause without prematurely cutting off turn', () => {
      // Start speech
      turnDetector.update(0.3, 1000);
      turnDetector.update(0.3, 1090);

      // Continuing speech
      turnDetector.update(0.35, 1500);

      // Mid-sentence hesitation pause (400ms silence)
      const pauseEvent = turnDetector.update(0.02, 1900);
      expect(pauseEvent?.type).toBe('pause_detected');
      expect(turnDetector.isActive).toBe(true); // Still capturing, NOT completed!

      // Resumed speech after hesitation
      const resumeEvent = turnDetector.update(0.35, 2000);
      expect(resumeEvent?.type).toBe('speech_continuing');
    });

    it('completes turn cleanly once silence exceeds threshold', () => {
      // Start and continue speech
      turnDetector.update(0.3, 1000);
      turnDetector.update(0.3, 1090);
      turnDetector.update(0.35, 2000);

      // Extended trailing silence (>900ms)
      turnDetector.update(0.02, 2500);
      const completionEvent = turnDetector.update(0.02, 3100);
      expect(completionEvent?.type).toBe('turn_completed');
      expect(turnDetector.isActive).toBe(false);
    });
  });

  describe('5. VoiceCoordinator Central Request Integration', () => {
    it('cancels active turn and broadcasts INTERRUPTED on barge-in', () => {
      const mockMainWin = {
        isDestroyed: () => false,
        webContents: { isDestroyed: () => false, send: vi.fn() },
      } as any;
      const coordinator = new VoiceCoordinator(() => mockMainWin, () => null);

      coordinator.startTurn('turn_123');
      expect(coordinator.getTurnId()).toBe('turn_123');

      coordinator.handleInterrupt();
      expect(coordinator.getState().sessionState).toBe('INTERRUPTED');
      expect(mockMainWin.webContents.send).toHaveBeenCalledWith(IPC_CHANNELS.VOICE_INTERRUPT);
    });
  });
});
