import { execFile } from 'child_process';
import { screenUnderstandingService } from '../screen/screenUnderstandingService';
import { DesktopActionResult } from '../../shared/types';

export class DesktopControlService {
  /**
   * Clicks an interactive UI element on the desktop by name/text, role, or coordinates.
   */
  public async clickElement(params: {
    target?: string;
    role?: string;
    x?: number;
    y?: number;
  }): Promise<DesktopActionResult> {
    let targetX = params.x;
    let targetY = params.y;
    let resolvedName = params.target || 'coordinates';

    // If coordinates were not directly supplied, look up the element via UI Automation
    if (targetX === undefined || targetY === undefined) {
      if (!params.target) {
        return {
          success: false,
          action: 'click',
          error: 'Either target element name or coordinates (x, y) must be provided.',
        };
      }

      const activeWin = await screenUnderstandingService.getActiveWindow();
      const elements = await screenUnderstandingService.getInteractiveElements(activeWin?.handle);

      const targetLower = params.target.toLowerCase().trim();
      const match = elements.find((el) => {
        const nameLower = el.name.toLowerCase();
        if (params.role && el.controlType.toLowerCase() !== params.role.toLowerCase()) return false;
        return nameLower === targetLower || nameLower.includes(targetLower);
      });

      if (!match) {
        return {
          success: false,
          action: 'click',
          target: params.target,
          error: `Could not locate visible interactive element "${params.target}" on the active screen.`,
        };
      }

      targetX = Math.round(match.x + match.width / 2);
      targetY = Math.round(match.y + match.height / 2);
      resolvedName = `${match.name} (${match.controlType})`;
    }

    const psScript = `
$code = @"
  using System;
  using System.Runtime.InteropServices;
  public class WinMouse {
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, int dwExtraInfo);
    public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    public const uint MOUSEEVENTF_LEFTUP = 0x0004;
  }
"@
Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue

[WinMouse]::SetCursorPos(${targetX}, ${targetY}) | Out-Null
Start-Sleep -Milliseconds 60
[WinMouse]::mouse_event([WinMouse]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
Start-Sleep -Milliseconds 50
[WinMouse]::mouse_event([WinMouse]::MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
"OK"
`;

    try {
      const result = await this.runPowerShell(psScript);
      if (result.includes('OK')) {
        return {
          success: true,
          action: 'click',
          target: resolvedName,
          details: `Clicked at coordinates (${targetX}, ${targetY}).`,
        };
      }
      return {
        success: false,
        action: 'click',
        target: resolvedName,
        error: 'Mouse click event could not be dispatched.',
      };
    } catch (err: any) {
      return {
        success: false,
        action: 'click',
        target: resolvedName,
        error: err?.message || 'Click operation failed.',
      };
    }
  }

  /**
   * Types text into the currently focused field or a target element.
   */
  public async typeText(params: {
    text: string;
    target?: string;
    clearFirst?: boolean;
    pressEnterAfter?: boolean;
  }): Promise<DesktopActionResult> {
    if (params.target) {
      const clickRes = await this.clickElement({ target: params.target });
      if (!clickRes.success) return clickRes;
      await new Promise((r) => setTimeout(r, 120));
    }

    const escaped = params.text.replace(/["`$\\]/g, '`$&');
    const enterCmd = params.pressEnterAfter ? `[System.Windows.Forms.SendKeys]::SendWait("{ENTER}")` : '';
    const selectAllCmd = params.clearFirst ? `[System.Windows.Forms.SendKeys]::SendWait("^a{BACKSPACE}")` : '';

    const psScript = `
Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue
${selectAllCmd}
[System.Windows.Forms.SendKeys]::SendWait("${escaped}")
${enterCmd}
"OK"
`;

    try {
      const result = await this.runPowerShell(psScript);
      if (result.includes('OK')) {
        return {
          success: true,
          action: 'type',
          target: params.target || 'focused element',
          details: `Typed ${params.text.length} characters successfully.`,
        };
      }
      return {
        success: false,
        action: 'type',
        error: 'Key entry could not be delivered.',
      };
    } catch (err: any) {
      return {
        success: false,
        action: 'type',
        error: err?.message || 'Typing failed.',
      };
    }
  }

  /**
   * Switches to or brings a window into foreground by process name or window title.
   */
  public async switchWindow(windowTitleOrProcess: string): Promise<DesktopActionResult> {
    const query = windowTitleOrProcess.toLowerCase().trim();
    const psScript = `
$code = @"
  using System;
  using System.Runtime.InteropServices;
  public class WinFocus {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  }
"@
Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue

$procs = Get-Process | Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero -and ($_.ProcessName -like "*${query}*" -or $_.MainWindowTitle -like "*${query}*") }
$target = $procs | Select-Object -First 1

if ($target) {
  [WinFocus]::ShowWindow($target.MainWindowHandle, 9) | Out-Null
  [WinFocus]::SetForegroundWindow($target.MainWindowHandle) | Out-Null
  "FOUND:" + $target.MainWindowTitle
} else {
  "NOT_FOUND"
}
`;

    try {
      const output = (await this.runPowerShell(psScript)).trim();
      if (output.startsWith('FOUND:')) {
        const title = output.replace('FOUND:', '').trim();
        return {
          success: true,
          action: 'switch_window',
          target: title,
          details: `Switched focus to window "${title}".`,
        };
      }
      return {
        success: false,
        action: 'switch_window',
        target: windowTitleOrProcess,
        error: `Could not find an open application window matching "${windowTitleOrProcess}".`,
      };
    } catch (err: any) {
      return {
        success: false,
        action: 'switch_window',
        target: windowTitleOrProcess,
        error: err?.message || 'Failed to switch window.',
      };
    }
  }

  /**
   * Scrolls the desktop or active window up or down.
   */
  public async scroll(direction: 'up' | 'down', amount: number = 3): Promise<DesktopActionResult> {
    const delta = direction === 'up' ? amount * 120 : -amount * 120;
    const psScript = `
$code = @"
  using System;
  using System.Runtime.InteropServices;
  public class WinScroll {
    [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, int dwExtraInfo);
    public const uint MOUSEEVENTF_WHEEL = 0x0800;
  }
"@
Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue

[WinScroll]::mouse_event([WinScroll]::MOUSEEVENTF_WHEEL, 0, 0, [uint32]${delta}, 0)
"OK"
`;

    try {
      const result = await this.runPowerShell(psScript);
      if (result.includes('OK')) {
        return {
          success: true,
          action: 'scroll',
          details: `Scrolled ${direction} by ${amount} ticks.`,
        };
      }
      return {
        success: false,
        action: 'scroll',
        error: 'Scroll event could not be dispatched.',
      };
    } catch (err: any) {
      return {
        success: false,
        action: 'scroll',
        error: err?.message || 'Scroll operation failed.',
      };
    }
  }

  /**
   * Closes the active foreground window or specified application window.
   */
  public async closeWindow(target?: string): Promise<DesktopActionResult> {
    if (target) {
      const query = target.toLowerCase().trim();
      const psScript = `
$proc = Get-Process | Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero -and ($_.ProcessName -like "*${query}*" -or $_.MainWindowTitle -like "*${query}*") } | Select-Object -First 1
if ($proc) {
  $proc.CloseMainWindow() | Out-Null
  "OK:" + $proc.MainWindowTitle
} else {
  "NOT_FOUND"
}
`;
      const output = (await this.runPowerShell(psScript)).trim();
      if (output.startsWith('OK:')) {
        return {
          success: true,
          action: 'close_window',
          target,
          details: `Closed window "${output.replace('OK:', '').trim()}".`,
        };
      }
      return {
        success: false,
        action: 'close_window',
        target,
        error: `Could not find an open application matching "${target}".`,
      };
    }

    const psActiveScript = `
Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue
[System.Windows.Forms.SendKeys]::SendWait("%{F4}")
"OK"
`;
    try {
      await this.runPowerShell(psActiveScript);
      return {
        success: true,
        action: 'close_window',
        details: 'Sent Alt+F4 to close foreground window.',
      };
    } catch (err: any) {
      return {
        success: false,
        action: 'close_window',
        error: err?.message || 'Failed to close window.',
      };
    }
  }

  private runPowerShell(script: string): Promise<string> {
    return new Promise((resolve) => {
      execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
        { timeout: 8000 },
        (err, stdout) => {
          if (err) resolve('');
          else resolve(stdout || '');
        }
      );
    });
  }
}

export const desktopControlService = new DesktopControlService();
