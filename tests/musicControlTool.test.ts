import { describe, expect, it } from 'vitest';
import {
  executeMusicControlTool,
  getSpotifyExecutablePath,
  musicControlToolDefinitions,
  setPendingMusicQuery,
  getPendingMusicQuery,
  clearPendingMusicQuery,
} from '../src/services/agent/musicControlTool';
import { FastLocalIntentRouter } from '../src/services/agent/fastLocalIntent';

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

  it('handles rewind song cleanly', async () => {
    const result = await executeMusicControlTool('control_music', { action: 'rewind_song' });
    expect(result.action).toBe('rewind_song');
    expect(result.message).toContain('Rewound song');
  });

  it('handles search and play on Spotify with query', async () => {
    const result = await executeMusicControlTool('control_music', {
      action: 'play_spotify',
      app: 'spotify',
      query: 'Starboy',
    });
    expect(result.success).toBe(true);
    expect(result.app).toBe('Spotify');
    expect(result.query).toBe('Starboy');
    expect(result.message).toContain('Starboy');
  });

  it('handles YouTube requests', async () => {
    const result = await executeMusicControlTool('control_music', {
      action: 'play_youtube',
      app: 'youtube',
      query: 'classical piano',
    });
    expect(result.success).toBe(true);
    expect(result.app).toBe('YouTube');
    expect(result.message).toContain('classical piano');
  });

  it('asks user for preferred app when no platform is specified', async () => {
    const result = await executeMusicControlTool('control_music', {
      action: 'ask_music_platform',
      query: 'Believer',
    });
    expect(result.success).toBe(true);
    expect(result.needsPlatformChoice).toBe(true);
    expect(result.message).toContain('Spotify or YouTube?');
    expect(getPendingMusicQuery()).toBe('Believer');
  });

  it('routes fast local intent for Spotify search and play', async () => {
    const router = new FastLocalIntentRouter();
    const routed = await router.tryRoute('play Starboy on spotify');
    expect(routed).not.toBeNull();
    expect(routed?.intent).toBe('media');
    expect(routed?.response).toContain('Starboy');
    expect(routed?.response).toContain('Spotify');
  });

  it('routes fast local intent for generic song by asking for preference', async () => {
    const router = new FastLocalIntentRouter();
    const routed = await router.tryRoute('play a song');
    expect(routed).not.toBeNull();
    expect(routed?.intent).toBe('media');
    expect(routed?.response).toContain('Spotify or YouTube?');
  });

  it('handles platform follow-up seamlessly', async () => {
    setPendingMusicQuery('Shape of You');
    const router = new FastLocalIntentRouter();
    const routed = await router.tryRoute('Spotify please');
    expect(routed).not.toBeNull();
    expect(routed?.intent).toBe('media');
    expect(routed?.response).toContain('Shape of You');
    expect(routed?.response).toContain('Spotify');
  });

  it('routes move to next and rewind controls', async () => {
    const router = new FastLocalIntentRouter();
    const nextRoute = await router.tryRoute('move to next song');
    expect(nextRoute?.intent).toBe('media');
    expect(nextRoute?.response).toContain('next track');

    const rewindRoute = await router.tryRoute('rewind the song');
    expect(rewindRoute?.intent).toBe('media');
    expect(rewindRoute?.response).toContain('Rewound song');
  });
});
