import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { WorkspacesService } from '../src/services/quicktools/workspacesService';

describe('WorkspacesService', () => {
  let tempDir: string;
  let wsFile: string;
  let service: WorkspacesService;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-test-'));
    wsFile = path.join(tempDir, 'workspaces.json');
    service = new WorkspacesService(wsFile);
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('initializes with default workspaces', () => {
    const list = service.getWorkspaces();
    expect(list.length).toBeGreaterThanOrEqual(3);
    expect(list.some((w) => w.name === 'Coding Mode')).toBe(true);
    expect(list.some((w) => w.name === 'Study Workspace')).toBe(true);
    expect(list.some((w) => w.name === 'Focus Mode')).toBe(true);
  });

  it('saves and deletes custom workspaces', () => {
    const saved = service.saveWorkspace({
      name: 'Custom Research',
      description: 'Browser and notes',
      apps: [
        { appId: 'chrome', name: 'Google Chrome', layoutPosition: 'left' },
        { appId: 'notepad', name: 'Notepad', layoutPosition: 'right' },
      ],
    });

    expect(saved.id).toBeDefined();
    expect(service.getWorkspaces().some((w) => w.id === saved.id)).toBe(true);

    const deleted = service.deleteWorkspace(saved.id);
    expect(deleted).toBe(true);
    expect(service.getWorkspaces().some((w) => w.id === saved.id)).toBe(false);
  });
});
