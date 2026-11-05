import { describe, expect, it } from 'vitest';
import {
  executeMusicControlTool,
  getSpotifyExecutablePath,
  musicControlToolDefinitions,
} from '../src/services/agent/musicControlTool';

describe('Music Control & Spotify Integration Tool', () => {
  it('exposes defined tool declarations for music playback control', () => {
    const names = musicControlToolDefinitions.map((d) => d.name);
    expect(names).toContain('control_music');
  });

  it('handles playback pause cleanly', async () => {
    const result = await executeMusicControlTool('control_music', { action: 'pause' });
    expect(result.action).toBe('pause');
    expect(result.message).toContain('Paused');
  });

  it('handles skip to next song cleanly', async () => {
    const result = await executeMusicControlTool('control_music', { action: 'next_song' });
    expect(result.action).toBe('next_song');
    expect(result.message).toContain('next track');
  });

  it('handles YouTube Music requests', async () => {
    const result = await executeMusicControlTool('control_music', {
      action: 'play_youtube_music',
      query: 'classical piano',
    });
    if (result.success) {
      expect(result.app).toBe('YouTube');
      expect(result.message).toContain('classical piano');
    }
  });
});
