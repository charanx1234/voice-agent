import { describe, it, expect } from 'vitest';
import { sanitizePath, IPC_CHANNELS } from '../src/main/security';
import { ALLOWED_APPLICATIONS } from '../src/services/agent/appShortcutsTool';

describe('Security and Access Control', () => {
  it('sanitizes null bytes and path traversal patterns', () => {
    const malicious = 'folder\0/../secrets';
    expect(sanitizePath(malicious)).toBe('folder/../secrets');
  });

  it('strictly limits allowed applications to pre-approved tools', () => {
    const allowedIds = ALLOWED_APPLICATIONS.map((a) => a.id);
    expect(allowedIds).toContain('notepad');
    expect(allowedIds).toContain('calculator');
    expect(allowedIds).toContain('paint');
    expect(allowedIds).toContain('explorer');
    expect(allowedIds).toContain('cmd');

    // Arbitrary shell commands must not be in the list
    expect(allowedIds).not.toContain('powershell -enc');
    expect(allowedIds).not.toContain('bash');
    expect(allowedIds).not.toContain('rm');
  });

  it('exposes defined IPC channels with secure namespacing', () => {
    expect(IPC_CHANNELS.GET_SETTINGS).toBe('friday:get-settings');
    expect(IPC_CHANNELS.SEND_MESSAGE).toBe('friday:send-message');
    expect(IPC_CHANNELS.TOOL_CONFIRM_REQUEST).toBe('friday:tool-confirm-request');
  });
});

