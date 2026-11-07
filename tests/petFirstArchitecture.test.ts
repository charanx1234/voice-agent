import { describe, it, expect, beforeEach, vi } from 'vitest';
import { capabilityRegistry } from '../src/services/capabilities/capabilityRegistry';
import { settingsStore } from '../src/services/storage/settingsStore';
import { VoiceCoordinator } from '../src/main/voiceCoordinator';
import { IPC_CHANNELS } from '../src/main/security';

describe('FRIDAY Pet-First Architecture', () => {
  describe('Capability Registry (Single source of truth for Pet and Dashboard)', () => {
    it('registers core capabilities and exposes them to Desktop Pet', () => {
      const petCaps = capabilityRegistry.listPetCapabilities();
      expect(petCaps.length).toBeGreaterThanOrEqual(8);

      const capIds = petCaps.map((c) => c.id);
      expect(capIds).toContain('screen_understanding');
      expect(capIds).toContain('app_shortcuts');
      expect(capIds).toContain('notes');
      expect(capIds).toContain('reminders');
      expect(capIds).toContain('long_term_memory');
      expect(capIds).toContain('website_accessibility');
      expect(capIds).toContain('voice_pipeline');
      expect(capIds).toContain('personality_modes');
    });

    it('executes a capability through the unified registry', async () => {
      const result = await capabilityRegistry.execute('personality_modes', { mode: 'roast' });
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.mode).toBe('roast');
      expect(settingsStore.getSettings().personalityMode).toBe('roast');
    });
  });

  describe('One FRIDAY Voice & State Synchronization', () => {
    it('synchronizes voice states and expressions across both window contexts', () => {
      const mockMainWin = {
        isDestroyed: () => false,
        webContents: {
          isDestroyed: () => false,
          send: vi.fn(),
        },
      } as any;

      const mockPetWin = {
        isDestroyed: () => false,
        webContents: {
          isDestroyed: () => false,
          send: vi.fn(),
        },
      } as any;

      const coordinator = new VoiceCoordinator(
        () => mockMainWin,
        () => mockPetWin
      );

      // Trigger wake word
      coordinator.handleWakeWord();
      expect(coordinator.getState().sessionState).toBe('WAKE_DETECTED');

      // Verify both windows received state update
      expect(mockMainWin.webContents.send).toHaveBeenCalledWith(
        IPC_CHANNELS.VOICE_STATE_CHANGED,
        expect.objectContaining({ sessionState: 'WAKE_DETECTED' })
      );
      expect(mockPetWin.webContents.send).toHaveBeenCalledWith(
        IPC_CHANNELS.VOICE_STATE_CHANGED,
        expect.objectContaining({ sessionState: 'WAKE_DETECTED' })
      );

      // Transition to speaking
      coordinator.setState('SPEAKING');
      expect(coordinator.getState().robotState).toBe('speaking');
      expect(coordinator.getState().isSpeaking).toBe(true);

      // Trigger user interruption (barge-in)
      coordinator.handleInterrupt();
      expect(coordinator.getState().robotState).toBe('interrupted');
      expect(mockMainWin.webContents.send).toHaveBeenCalledWith(IPC_CHANNELS.VOICE_INTERRUPT);
    });
  });

  describe('Bidirectional Personality Mode Sync', () => {
    it('synchronizes personality mode switching between Simple, Moderate and Roast', () => {
      // Switch to simple
      settingsStore.saveSettings({ personalityMode: 'simple' });
      expect(settingsStore.getSettings().personalityMode).toBe('simple');

      // Switch to roast
      settingsStore.saveSettings({ personalityMode: 'roast' });
      expect(settingsStore.getSettings().personalityMode).toBe('roast');

      // Switch back to moderate
      settingsStore.saveSettings({ personalityMode: 'moderate' });
      expect(settingsStore.getSettings().personalityMode).toBe('moderate');
    });
  });
});
