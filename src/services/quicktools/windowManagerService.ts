import { execFile } from 'child_process';
import { WindowInfo, WindowLayoutAction } from '../../shared/types';

export class WindowManagerService {
  private cachedWindows: { list: WindowInfo[]; timestamp: number } | null = null;

  private runPowerShell(script: string): Promise<string> {
    return new Promise((resolve) => {
      execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', script],
        { timeout: 4000 },
        (err, stdout) => {
          if (err) resolve('');
          else resolve((stdout || '').trim());
        }
      );
    });
  }

  /**
   * Enumerates currently visible top-level application windows.
   * Caches results for 3 seconds to avoid slow repeated PowerShell processes.
   */
  public async getOpenWindows(forceRefresh = false): Promise<WindowInfo[]> {
    if (!forceRefresh && this.cachedWindows && Date.now() - this.cachedWindows.timestamp < 3000) {
      return this.cachedWindows.list;
    }

    const psScript = `
Add-Type -TypeDefinition @"
  using System;
  using System.Text;
  using System.Collections.Generic;
  using System.Runtime.InteropServices;

  public class WinEnumFast {
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    public static List<string> ListWindows() {
      List<string> list = new List<string>();
      EnumWindows((hWnd, lParam) => {
        if (!IsWindowVisible(hWnd)) return true;
        int len = GetWindowTextLength(hWnd);
        if (len == 0) return true;

        StringBuilder sb = new StringBuilder(len + 1);
        GetWindowText(hWnd, sb, sb.Capacity);
        string title = sb.ToString();

        // Filter out system and empty shells
        if (string.IsNullOrWhiteSpace(title) ||
            title == "Program Manager" ||
            title == "Windows Input Experience" ||
            title == "Settings" ||
            title.StartsWith("Default IME")) {
          return true;
        }

        uint pid = 0;
        GetWindowThreadProcessId(hWnd, out pid);
        list.Add(hWnd.ToInt64() + "|" + pid + "|" + title.Replace("|", " "));
        return true;
      }, IntPtr.Zero);
      return list;
    }
  }
"@ -ErrorAction SilentlyContinue

[WinEnumFast]::ListWindows()
`;

    const out = await this.runPowerShell(psScript);
    if (!out) return [];

    const lines = out.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);
    const result: WindowInfo[] = [];

    for (const line of lines) {
      const parts = line.split('|');
      if (parts.length >= 3) {
        const handle = parseInt(parts[0], 10);
        const pid = parseInt(parts[1], 10);
        const title = parts.slice(2).join('|').trim();

        if (handle && title) {
          result.push({
            id: pid || handle,
            handle,
            title,
            processName: this.guessProcessName(title),
          });
        }
      }
    }

    this.cachedWindows = { list: result, timestamp: Date.now() };
    return result;
  }

  public async arrangeWindow(action: WindowLayoutAction): Promise<{ success: boolean; message: string }> {
    // 1. Two window side-by-side arrangement: e.g. Chrome on left, VS Code on right
    if (action.windowTarget && action.secondTarget) {
      const windows = await this.getOpenWindows();
      const win1 = this.findMatchingWindow(windows, action.windowTarget);
      const win2 = this.findMatchingWindow(windows, action.secondTarget);

      if (!win1 && !win2) {
        return { success: false, message: 'Could not find either of the requested applications.' };
      }

      let res1 = false;
      let res2 = false;
      if (win1) res1 = await this.snapWindow(win1.handle, 'left');
      if (win2) res2 = await this.snapWindow(win2.handle, 'right');

      return {
        success: res1 || res2,
        message: `Arranged workspace: ${win1?.title.slice(0, 20) || 'App 1'} on the left, ${win2?.title.slice(0, 20) || 'App 2'} on the right.`,
      };
    }

    // 2. Single Snap: split_left or split_right
    if (action.action === 'split_left' || action.action === 'split_right') {
      const side = action.action === 'split_left' ? 'left' : 'right';

      if (!action.windowTarget) {
        // Apply to current active window
        const ok = await this.snapWindow(0, side);
        return {
          success: ok,
          message: ok ? `Snapped active window to the ${side}.` : `Could not snap active window.`,
        };
      }

      const windows = await this.getOpenWindows();
      const win = this.findMatchingWindow(windows, action.windowTarget);
      if (!win) {
        return {
          success: false,
          message: `Could not find an open window matching "${action.windowTarget}".`,
        };
      }

      const ok = await this.snapWindow(win.handle, side);
      return {
        success: ok,
        message: ok ? `Snapped "${win.title.slice(0, 30)}" to the ${side}.` : `Failed to arrange "${win.title}".`,
      };
    }

    // 3. Maximize, Minimize, Restore
    if (['maximize', 'minimize', 'restore'].includes(action.action)) {
      const cmd = action.action as 'maximize' | 'minimize' | 'restore';

      if (!action.windowTarget) {
        const ok = await this.applyWindowCommand(0, cmd);
        return {
          success: ok,
          message: `${action.action.toUpperCase()} action executed on active window.`,
        };
      }

      const windows = await this.getOpenWindows();
      const win = this.findMatchingWindow(windows, action.windowTarget);
      const handle = win ? win.handle : 0;
      const ok = await this.applyWindowCommand(handle, cmd);
      return {
        success: ok,
        message: `${action.action.toUpperCase()} action executed on "${win ? win.title.slice(0, 30) : 'active window'}".`,
      };
    }

    // 4. Center
    if (action.action === 'center') {
      let handle = 0;
      if (action.windowTarget) {
        const windows = await this.getOpenWindows();
        const win = this.findMatchingWindow(windows, action.windowTarget);
        if (win) handle = win.handle;
      }
      const ok = await this.centerWindow(handle);
      return {
        success: ok,
        message: `Centered window on screen.`,
      };
    }

    return { success: false, message: `Unsupported layout action: ${action.action}` };
  }

  private findMatchingWindow(windows: WindowInfo[], query?: string): WindowInfo | undefined {
    if (!query) return windows[0];
    const q = query.toLowerCase().trim();
    const byProc = windows.find((w) => w.processName.toLowerCase().includes(q));
    if (byProc) return byProc;

    return windows.find((w) => w.title.toLowerCase().includes(q));
  }

  private async snapWindow(handle: number, side: 'left' | 'right' | 'top' | 'bottom'): Promise<boolean> {
    const psScript = `
Add-Type -TypeDefinition @"
  using System;
  using System.Runtime.InteropServices;
  public class WinSnapFast {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
    [DllImport("user32.dll")] public static extern int GetSystemMetrics(int nIndex);

    public static bool Snap(long handle, string side) {
      IntPtr hWnd = handle != 0 ? new IntPtr(handle) : GetForegroundWindow();
      if (hWnd == IntPtr.Zero) return false;

      ShowWindowAsync(hWnd, 9); // SW_RESTORE

      int screenW = GetSystemMetrics(0);
      int screenH = GetSystemMetrics(1) - 45;

      int x = 0, y = 0, w = screenW, h = screenH;

      if (side == "left") {
        x = 0; y = 0; w = screenW / 2; h = screenH;
      } else if (side == "right") {
        x = screenW / 2; y = 0; w = screenW / 2; h = screenH;
      }

      return SetWindowPos(hWnd, IntPtr.Zero, x, y, w, h, 0x0044);
    }
  }
"@ -ErrorAction SilentlyContinue

[WinSnapFast]::Snap(${handle}, "${side}")
`;
    const out = await this.runPowerShell(psScript);
    return out.toLowerCase().includes('true');
  }

  private async centerWindow(handle: number): Promise<boolean> {
    const psScript = `
Add-Type -TypeDefinition @"
  using System;
  using System.Runtime.InteropServices;
  public class WinCenterFast {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
    [DllImport("user32.dll")] public static extern int GetSystemMetrics(int nIndex);

    public static bool Center(long handle) {
      IntPtr hWnd = handle != 0 ? new IntPtr(handle) : GetForegroundWindow();
      if (hWnd == IntPtr.Zero) return false;

      ShowWindowAsync(hWnd, 9);
      int screenW = GetSystemMetrics(0);
      int screenH = GetSystemMetrics(1) - 45;
      int w = (int)(screenW * 0.75);
      int h = (int)(screenH * 0.75);
      int x = (screenW - w) / 2;
      int y = (screenH - h) / 2;
      return SetWindowPos(hWnd, IntPtr.Zero, x, y, w, h, 0x0044);
    }
  }
"@ -ErrorAction SilentlyContinue

[WinCenterFast]::Center(${handle})
`;
    const out = await this.runPowerShell(psScript);
    return out.toLowerCase().includes('true');
  }

  public async applyWindowCommand(handle: number, command: 'maximize' | 'minimize' | 'restore'): Promise<boolean> {
    const cmdCode = command === 'maximize' ? 3 : command === 'minimize' ? 2 : 9;
    const psScript = `
Add-Type -TypeDefinition @"
  using System;
  using System.Runtime.InteropServices;
  public class WinCmdFast {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
    public static bool Apply(long handle, int cmd) {
      IntPtr hWnd = handle != 0 ? new IntPtr(handle) : GetForegroundWindow();
      if (hWnd == IntPtr.Zero) return false;
      return ShowWindowAsync(hWnd, cmd);
    }
  }
"@ -ErrorAction SilentlyContinue

[WinCmdFast]::Apply(${handle}, ${cmdCode})
`;
    const out = await this.runPowerShell(psScript);
    return out.toLowerCase().includes('true');
  }

  private guessProcessName(title: string): string {
    const t = title.toLowerCase();
    if (t.includes('chrome')) return 'Google Chrome';
    if (t.includes('visual studio code') || t.includes('code')) return 'VS Code';
    if (t.includes('notepad')) return 'Notepad';
    if (t.includes('spotify')) return 'Spotify';
    if (t.includes('brave')) return 'Brave';
    if (t.includes('edge')) return 'Microsoft Edge';
    if (t.includes('discord')) return 'Discord';
    if (t.includes('slack')) return 'Slack';
    if (t.includes('terminal') || t.includes('powershell')) return 'Terminal';
    return title.split('-').pop()?.trim() || title;
  }
}

export const windowManagerService = new WindowManagerService();
