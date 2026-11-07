import { describe, it, expect } from 'vitest';
import { isForeignAssistantCommand, isHallucinatedOrNoiseTranscript, validateVoiceAction } from '../src/services/agent/voiceActionGuard';
import { VoiceSessionManager } from '../src/services/voice/voiceSession';

describe('VoiceActionGuard & VoiceSessionManager', () => {
  it('blocks foreign assistant commands addressed to Google, Siri, Alexa', () => {
    expect(isForeignAssistantCommand('Okay Google, open Chrome')).toBe(true);
    expect(isForeignAssistantCommand('Hey Siri what is the weather')).toBe(true);
    expect(isForeignAssistantCommand('Alexa play Spotify')).toBe(true);
    expect(isForeignAssistantCommand('Friday, open Chrome')).toBe(false);
    expect(isForeignAssistantCommand('Open Chrome')).toBe(false);
  });

  it('filters hallucinated or noise transcripts', () => {
    expect(isHallucinatedOrNoiseTranscript('Thank you for watching')).toBe(true);
    expect(isHallucinatedOrNoiseTranscript('subtitles by community')).toBe(true);
    expect(isHallucinatedOrNoiseTranscript('Please subscribe')).toBe(true);
    expect(isHallucinatedOrNoiseTranscript('yeah yeah yeah yeah yeah yeah yeah yeah yeah yeah')).toBe(true);
    expect(isHallucinatedOrNoiseTranscript('what is the capital of France')).toBe(false);
  });

  it('validates voice action and rejects foreign assistant invocation', () => {
    const googleResult = validateVoiceAction('Okay Google, open Chrome. Open Spotify. Play Kuchh.');
    expect(googleResult.allowed).toBe(false);
    expect(googleResult.reason).toContain('foreign assistant');

    const validResult = validateVoiceAction('open Chrome');
    expect(validResult.allowed).toBe(true);
  });

  it('manages voice session state machine correctly', () => {
    const sessionManager = new VoiceSessionManager();
    expect(sessionManager.getState()).toBe('IDLE');

    sessionManager.transition('STANDBY', { reason: 'User enabled hands-free' });
    expect(sessionManager.getState()).toBe('STANDBY');

    sessionManager.transition('WAKE_WORD_DETECTED');
    expect(sessionManager.getState()).toBe('WAKE_WORD_DETECTED');

    sessionManager.transition('LISTENING');
    expect(sessionManager.getState()).toBe('LISTENING');

    sessionManager.transition('PROCESSING_AUDIO');
    expect(sessionManager.getState()).toBe('PROCESSING_AUDIO');

    sessionManager.transition('TRANSCRIBING');
    expect(sessionManager.getState()).toBe('TRANSCRIBING');

    sessionManager.transition('THINKING');
    expect(sessionManager.getState()).toBe('THINKING');

    sessionManager.transition('SPEAKING');
    expect(sessionManager.getState()).toBe('SPEAKING');

    sessionManager.transition('STANDBY', { reason: 'Turn completed' });
    expect(sessionManager.getState()).toBe('STANDBY');
  });

  it('handles microphone muting', () => {
    const sessionManager = new VoiceSessionManager();
    expect(sessionManager.isMuted()).toBe(false);

    sessionManager.setMicMuted(true);
    expect(sessionManager.isMuted()).toBe(true);

    sessionManager.setMicMuted(false);
    expect(sessionManager.isMuted()).toBe(false);
  });
});
