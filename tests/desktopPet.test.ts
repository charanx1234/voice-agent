import { describe, it, expect } from 'vitest';
import { IPC_CHANNELS } from '../src/main/security';
import { PetCompanionState, FridaySettings } from '../src/shared/types';

describe('Desktop Pet Companion Integration', () => {
  it('exposes defined pet IPC channels with secure namespacing', () => {
    expect(IPC_CHANNELS.PET_SHOW_MAIN).toBe('friday:pet-show-main');
    expect(IPC_CHANNELS.PET_TOGGLE_MAIN).toBe('friday:pet-toggle-main');
    expect(IPC_CHANNELS.PET_CONTEXT_MENU).toBe('friday:pet-context-menu');
    expect(IPC_CHANNELS.PET_GET_STATE).toBe('friday:pet-get-state');
    expect(IPC_CHANNELS.PET_STATE_CHANGED).toBe('friday:pet-state-changed');
    expect(IPC_CHANNELS.PET_QUIT).toBe('friday:pet-quit');
    expect(IPC_CHANNELS.PET_SET_ENABLED).toBe('friday:pet-set-enabled');
  });

  it('structures pet companion state with required reactive fields', () => {
    const sampleState: PetCompanionState = {
      robotState: 'speaking',
      amplitude: 0.82,
      expression: 'happy',
      mood: 'playful',
      soundMuted: false,
      handsFreeEnabled: true,
      isSpeaking: true,
    };

    expect(sampleState.robotState).toBe('speaking');
    expect(sampleState.amplitude).toBeGreaterThan(0.5);
    expect(sampleState.expression).toBe('happy');
    expect(sampleState.isSpeaking).toBe(true);
  });
});
