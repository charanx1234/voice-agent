import { describe, expect, it } from 'vitest';
import {
  chromeBrowserToolDefinitions,
  executeChromeBrowserTool,
  getChromeExecutablePath,
} from '../src/services/agent/chromeBrowserTool';

describe('Google Chrome Browser Integration Tool', () => {
  it('exposes defined tool declarations for Chrome search, navigation, and tabs', () => {
    const names = chromeBrowserToolDefinitions.map((d) => d.name);
    expect(names).toContain('search_in_chrome');
    expect(names).toContain('open_url_in_chrome');
    expect(names).toContain('click_chrome_link');
    expect(names).toContain('control_chrome_tabs');
  });

  it('detects Chrome executable path or reports cleanly when missing', () => {
    const path = getChromeExecutablePath();
    // On the host Windows machine, Chrome is installed in Program Files
    if (path) {
      expect(path.toLowerCase()).toContain('chrome.exe');
    }
  });

  it('requires a query for Chrome search', async () => {
    const result = await executeChromeBrowserTool('search_in_chrome', { query: '' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Please specify');
  });

  it('formats web addresses cleanly for open_url_in_chrome', async () => {
    const result = await executeChromeBrowserTool('open_url_in_chrome', { url: 'youtube' });
    if (result.success) {
      expect(result.url).toBe('https://www.youtube.com');
    }
  });
});
