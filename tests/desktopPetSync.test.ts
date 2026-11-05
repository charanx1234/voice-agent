import { describe, expect, it, vi } from 'vitest';
import { VoiceCoordinator } from '../src/main/voiceCoordinator';
import { IPC_CHANNELS } from '../src/main/security';

describe('VoiceCoordinator & Desktop Pet Synchronization', () => {
  function createMockWindow() {
    return {
      isDestroyed: vi.fn().mockReturnValue(false),
      webContents: {
        isDestroyed: vi.fn().mockReturnValue(false),
        send: vi.fn(),
      },
    } as any;
  }

  it('initializes in STANDBY state with smiling idle robot state', () => {
    const mainWin = createMockWindow();
    const petWin = createMockWindow();
    const coordinator = new VoiceCoordinator(() => mainWin, () => petWin);

    const state = coordinator.getState();
    expect(state.sessionState).toBe('STANDBY');
    expect(state.robotState).toBe('idle');
    expect(state.expression).toBe('smile');
    expect(state.isSpeaking).toBe(false);
  });

  it('transitions to WAKE_DETECTED and broadcasts to both windows', () => {
    const mainWin = createMockWindow();
    const petWin = createMockWindow();
    const coordinator = new VoiceCoordinator(() => mainWin, () => petWin);

    coordinator.setState('WAKE_DETECTED');

    const state = coordinator.getState();
    expect(state.sessionState).toBe('WAKE_DETECTED');
    expect(state.robotState).toBe('listening');
    expect(state.expression).toBe('excited');

    expect(mainWin.webContents.send).toHaveBeenCalledWith(
      IPC_CHANNELS.VOICE_STATE_CHANGED,
      expect.objectContaining({ sessionState: 'WAKE_DETECTED', robotState: 'listening' })
    );
    expect(petWin.webContents.send).toHaveBeenCalledWith(
      IPC_CHANNELS.VOICE_STATE_CHANGED,
      expect.objectContaining({ sessionState: 'WAKE_DETECTED', robotState: 'listening' })
    );
  });

  it('transitions through full voice cycle: STANDBY -> WAKE_DETECTED -> LISTENING -> PROCESSING -> SPEAKING -> STANDBY', () => {
    const mainWin = createMockWindow();
    const petWin = createMockWindow();
    const coordinator = new VoiceCoordinator(() => mainWin, () => petWin);

    coordinator.setState('WAKE_DETECTED');
    expect(coordinator.getState().sessionState).toBe('WAKE_DETECTED');

    coordinator.setState('LISTENING');
    expect(coordinator.getState().sessionState).toBe('LISTENING');
    expect(coordinator.getState().robotState).toBe('listening');

    coordinator.setState('PROCESSING');
    expect(coordinator.getState().sessionState).toBe('PROCESSING');
    expect(coordinator.getState().robotState).toBe('thinking');

    coordinator.setState('SPEAKING', { expression: 'happy', isSpeaking: true });
    expect(coordinator.getState().sessionState).toBe('SPEAKING');
    expect(coordinator.getState().robotState).toBe('speaking');
    expect(coordinator.getState().isSpeaking).toBe(true);

    coordinator.setState('STANDBY');
    expect(coordinator.getState().sessionState).toBe('STANDBY');
    expect(coordinator.getState().robotState).toBe('idle');
    expect(coordinator.getState().isSpeaking).toBe(false);
  });

  it('transitions to INTERRUPTED on barge-in speech detection', () => {
    const mainWin = createMockWindow();
    const petWin = createMockWindow();
    const coordinator = new VoiceCoordinator(() => mainWin, () => petWin);

    coordinator.setState('SPEAKING', { isSpeaking: true });
    coordinator.setState('INTERRUPTED');

    const state = coordinator.getState();
    expect(state.sessionState).toBe('INTERRUPTED');
    expect(state.robotState).toBe('interrupted');
    expect(state.isSpeaking).toBe(false);
  });

  it('maps error states (PERMISSION_REQUIRED, NETWORK_ERROR, TASK_UNSUPPORTED) to error robot state', () => {
    const mainWin = createMockWindow();
    const petWin = createMockWindow();
    const coordinator = new VoiceCoordinator(() => mainWin, () => petWin);

    coordinator.setState('TASK_UNSUPPORTED');
    expect(coordinator.getState().robotState).toBe('error');
    expect(coordinator.getState().expression).toBe('not-happy');

    coordinator.setState('PERMISSION_REQUIRED');
    expect(coordinator.getState().robotState).toBe('error');

    coordinator.setState('NETWORK_ERROR');
    expect(coordinator.getState().robotState).toBe('error');
  });

  it('handles destroyed windows without throwing exceptions', () => {
    const deadWin = {
      isDestroyed: vi.fn().mockReturnValue(true),
      webContents: {
        isDestroyed: vi.fn().mockReturnValue(true),
        send: vi.fn(),
      },
    } as any;

    const coordinator = new VoiceCoordinator(() => deadWin, () => null);
    expect(() => coordinator.setState('LISTENING')).not.toThrow();
  });
});
