import fs from 'fs';
import path from 'path';
import os from 'os';
import { WorkspaceConfig } from '../../shared/types';
import { toolRegistry } from '../agent/toolRegistry';
import { windowManagerService } from './windowManagerService';

const DEFAULT_WORKSPACES: WorkspaceConfig[] = [
  {
    id: 'ws_coding',
    name: 'Coding Mode',
    description: 'Launches VS Code on the left and Chrome on the right for full-stack development.',
    apps: [
      { appId: 'code', name: 'VS Code', layoutPosition: 'left', launchDelayMs: 0 },
      { appId: 'chrome', name: 'Google Chrome', layoutPosition: 'right', launchDelayMs: 1200 },
    ],
    createdAt: new Date().toISOString(),
  },
  {
    id: 'ws_study',
    name: 'Study Workspace',
    description: 'Opens Chrome browser and Notepad side-by-side for notes and research.',
    apps: [
      { appId: 'chrome', name: 'Google Chrome', layoutPosition: 'left', launchDelayMs: 0 },
      { appId: 'notepad', name: 'Notepad', layoutPosition: 'right', launchDelayMs: 1000 },
    ],
    createdAt: new Date().toISOString(),
  },
  {
    id: 'ws_clean',
    name: 'Focus Mode',
    description: 'Minimizes distracting windows and brings terminal/notes to front.',
    apps: [
      { appId: 'notepad', name: 'Notepad', layoutPosition: 'center', launchDelayMs: 0 },
    ],
    createdAt: new Date().toISOString(),
  },
];

export class WorkspacesService {
  private workspacesFile: string;
  private workspaces: WorkspaceConfig[] = [];

  constructor(customPath?: string) {
    if (customPath) {
      this.workspacesFile = customPath;
    } else {
      const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
      const dir = path.join(appData, 'friday-ai-companion');
      if (!fs.existsSync(dir)) {
        try { fs.mkdirSync(dir, { recursive: true }); } catch {}
      }
      this.workspacesFile = path.join(dir, 'workspaces.json');
    }

    this.loadWorkspaces();
  }

  public getWorkspaces(): WorkspaceConfig[] {
    return [...this.workspaces];
  }

  public getWorkspace(idOrName: string): WorkspaceConfig | undefined {
    const q = idOrName.toLowerCase().trim();
    return this.workspaces.find(
      (w) => w.id.toLowerCase() === q || w.name.toLowerCase().includes(q)
    );
  }

  public saveWorkspace(
    ws: Omit<WorkspaceConfig, 'id' | 'createdAt'> & { id?: string }
  ): WorkspaceConfig {
    if (ws.id) {
      const idx = this.workspaces.findIndex((w) => w.id === ws.id);
      if (idx >= 0) {
        const updated: WorkspaceConfig = {
          ...this.workspaces[idx],
          ...ws,
          lastUsedAt: new Date().toISOString(),
        };
        this.workspaces[idx] = updated;
        this.persist();
        return updated;
      }
    }

    const newWs: WorkspaceConfig = {
      id: `ws_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: ws.name.trim() || 'Custom Workspace',
      description: ws.description || '',
      folderPath: ws.folderPath,
      apps: ws.apps || [],
      createdAt: new Date().toISOString(),
    };

    this.workspaces.push(newWs);
    this.persist();
    return newWs;
  }

  public deleteWorkspace(id: string): boolean {
    const before = this.workspaces.length;
    this.workspaces = this.workspaces.filter((w) => w.id !== id);
    if (this.workspaces.length !== before) {
      this.persist();
      return true;
    }
    return false;
  }

  public async launchWorkspace(idOrName: string): Promise<{ success: boolean; launchedCount: number; errors: string[] }> {
    const ws = this.getWorkspace(idOrName);
    if (!ws) {
      return { success: false, launchedCount: 0, errors: [`Workspace "${idOrName}" not found.`] };
    }

    ws.lastUsedAt = new Date().toISOString();
    this.persist();

    let launchedCount = 0;
    const errors: string[] = [];

    // Launch each app with staggered delay
    for (const app of ws.apps) {
      if (app.launchDelayMs && app.launchDelayMs > 0) {
        await new Promise((r) => setTimeout(r, app.launchDelayMs));
      }

      try {
        const res = await toolRegistry.executeTool('launch_allowed_app', { appId: app.appId });
        if (res?.success) {
          launchedCount++;
        } else {
          errors.push(res?.error || `Failed to launch ${app.name}`);
        }
      } catch (err: any) {
        errors.push(err?.message || `Error launching ${app.name}`);
      }
    }

    // Give windows ~1.5s to appear, then arrange them if positions configured
    setTimeout(async () => {
      const leftApp = ws.apps.find((a) => a.layoutPosition === 'left');
      const rightApp = ws.apps.find((a) => a.layoutPosition === 'right');

      if (leftApp && rightApp) {
        await windowManagerService.arrangeWindow({
          action: 'split_left',
          windowTarget: leftApp.name,
          secondTarget: rightApp.name,
        });
      } else {
        for (const app of ws.apps) {
          if (app.layoutPosition === 'left' || app.layoutPosition === 'right') {
            await windowManagerService.arrangeWindow({
              action: app.layoutPosition === 'left' ? 'split_left' : 'split_right',
              windowTarget: app.name,
            });
          } else if (app.layoutPosition === 'maximize') {
            await windowManagerService.arrangeWindow({
              action: 'maximize',
              windowTarget: app.name,
            });
          }
        }
      }
    }, 1800);

    return {
      success: launchedCount > 0,
      launchedCount,
      errors,
    };
  }

  private loadWorkspaces(): void {
    try {
      if (fs.existsSync(this.workspacesFile)) {
        const raw = fs.readFileSync(this.workspacesFile, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.workspaces = parsed;
          return;
        }
      }
    } catch {}

    this.workspaces = [...DEFAULT_WORKSPACES];
    this.persist();
  }

  private persist(): void {
    try {
      fs.writeFileSync(this.workspacesFile, JSON.stringify(this.workspaces, null, 2), 'utf8');
    } catch {}
  }
}

export const workspacesService = new WorkspacesService();
