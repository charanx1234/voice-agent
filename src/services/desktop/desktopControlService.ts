import { execFile } from 'child_process';
import { screenUnderstandingService } from '../screen/screenUnderstandingService';
import { DesktopActionResult } from '../../shared/types';

export interface MouseActionOptions {
  action: 'move' | 'click' | 'double_click' | 'right_click' | 'scroll' | 'get_position';
  target?: string;
  role?: string;
  x?: number;
  y?: number;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
  direction?: 'up' | 'down';
  amount?: number;
}

export class DesktopControlService {
  /**
   * Safety check: blocks or warns on potentially destructive or dangerous clicks/actions.
   */
  public isDestructiveAction(targetName?: string): boolean {
    if (!targetName) return false;
    const lower = targetName.toLowerCase();
    const dangerousPatterns = [
      /\bdelete\b/,
      /\bremove\b/,
      /\bwipe\b/,
      /\bformat\b/,
      /\buninstall\b/,
      /\bpurchase\b/,
      /\bbuy\s+now\b/,
      /\bpay\b/,
      /\bcheckout\b/,
      /\bplace\s+order\b/,
      /\btransfer\b/,
      /\bsecurity\s+settings\b/,
    ];
    return dangerousPatterns.some((pattern) => pattern.test(lower));
  }

  /**
   * Reads current mouse cursor coordinates on Windows.
   */
  public async getCursorPosition(): Promise<{ x: number; y: number }> {
    const psScript = `
Add-Type -TypeDefinition @'
using System;
using System.Threading;
using System.Runtime.InteropServices;

public class WinMousePos {
    [DllImport("user32.dll", SetLastError = true)] public static extern IntPtr OpenInputDesktop(uint dwFlags, bool fInherit, uint dwDesiredAccess);
    [DllImport("user32.dll", SetLastError = true)] public static extern bool SetThreadDesktop(IntPtr hDesktop);
    [DllImport("user32.dll")] public static extern bool CloseDesktop(IntPtr hDesktop);
    [DllImport("user32.dll", SetLastError = true)] public static extern bool GetCursorPos(out POINT lpPoint);
    [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }

    public static string ReadPos() {
        string res = "0,0";
        Thread t = new Thread(() => {
            IntPtr hDesk = OpenInputDesktop(0, false, 0x01FF);
            if (hDesk != IntPtr.Zero) SetThreadDesktop(hDesk);
            POINT p;
            if (GetCursorPos(out p)) {
                res = p.X + "," + p.Y;
            }
            if (hDesk != IntPtr.Zero) CloseDesktop(hDesk);
        });
        t.SetApartmentState(ApartmentState.STA);
        t.Start();
        t.Join();
        return res;
    }
}
'@ -ErrorAction SilentlyContinue

[WinMousePos]::ReadPos()
`;
    const out = (await this.runPowerShell(psScript)).trim();
    const parts = out.split(',');
    if (parts.length === 2) {
      return { x: parseInt(parts[0], 10) || 0, y: parseInt(parts[1], 10) || 0 };
    }
    return { x: 0, y: 0 };
  }

  /**
   * Resolves target coordinates for named corners or center of the primary/virtual screen.
   */
  public async resolveNamedPosition(
    position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center'
  ): Promise<{ x: number; y: number; bounds: { width: number; height: number } }> {
    const psScript = `
Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue
$s = [System.Windows.Forms.SystemInformation]::VirtualScreen
"$($s.Left),$($s.Top),$($s.Width),$($s.Height)"
`;
    const out = (await this.runPowerShell(psScript)).trim();
    const [leftStr, topStr, widthStr, heightStr] = out.split(',');
    const left = parseInt(leftStr, 10) || 0;
    const top = parseInt(topStr, 10) || 0;
    const width = parseInt(widthStr, 10) || 1920;
    const height = parseInt(heightStr, 10) || 1080;

    let x = Math.round(left + width / 2);
    let y = Math.round(top + height / 2);

    switch (position) {
      case 'top-left':
        x = left + 40;
        y = top + 40;
        break;
      case 'top-right':
        x = left + width - 40;
        y = top + 40;
        break;
      case 'bottom-left':
        x = left + 40;
        y = top + height - 40;
        break;
      case 'bottom-right':
        x = left + width - 40;
        y = top + height - 40;
        break;
      case 'center':
      default:
        x = Math.round(left + width / 2);
        y = Math.round(top + height / 2);
        break;
    }

    return { x, y, bounds: { width, height } };
  }

  /**
   * Locates a visible UI Automation element across the active window, taskbar, or system.
   */
  public async locateElement(target: string, role?: string): Promise<{ x: number; y: number; name: string } | null> {
    const targetClean = target.trim().toLowerCase();

    // 1. Check for Windows Start Button
    if (targetClean === 'start' || targetClean === 'start button' || targetClean === 'windows button') {
      const psStartScript = `
Add-Type -TypeDefinition @'
using System;
using System.Threading;
using System.Runtime.InteropServices;
using System.Windows.Automation;

public class FindStartHelper {
    [DllImport("user32.dll")] public static extern IntPtr OpenInputDesktop(uint dwFlags, bool fInherit, uint dwDesiredAccess);
    [DllImport("user32.dll")] public static extern bool SetThreadDesktop(IntPtr hDesktop);
    [DllImport("user32.dll")] public static extern bool CloseDesktop(IntPtr hDesktop);
    [DllImport("user32.dll")] public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);

    public static string LocateStart() {
        string res = "NOT_FOUND";
        Thread t = new Thread(() => {
            IntPtr hDesk = OpenInputDesktop(0, false, 0x01FF);
            if (hDesk != IntPtr.Zero) SetThreadDesktop(hDesk);
            IntPtr trayHwnd = FindWindow("Shell_TrayWnd", null);
            if (trayHwnd != IntPtr.Zero) {
                try {
                    AutomationElement tray = AutomationElement.FromHandle(trayHwnd);
                    if (tray != null) {
                        Condition cond = new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Button);
                        AutomationElementCollection buttons = tray.FindAll(TreeScope.Descendants, cond);
                        foreach (AutomationElement btn in buttons) {
                            string name = btn.Current.Name;
                            string id = btn.Current.AutomationId;
                            if (name.IndexOf("Start", StringComparison.OrdinalIgnoreCase) >= 0 || id.IndexOf("Start", StringComparison.OrdinalIgnoreCase) >= 0) {
                                var r = btn.Current.BoundingRectangle;
                                int cx = (int)(r.X + r.Width / 2);
                                int cy = (int)(r.Y + r.Height / 2);
                                res = cx + "," + cy + ",Start button";
                                break;
                            }
                        }
                    }
                } catch {}
            }
            if (hDesk != IntPtr.Zero) CloseDesktop(hDesk);
        });
        t.SetApartmentState(ApartmentState.STA);
        t.Start();
        t.Join();
        return res;
    }
}
'@ -ReferencedAssemblies "WindowsBase", "UIAutomationClient", "UIAutomationTypes" -ErrorAction SilentlyContinue

[FindStartHelper]::LocateStart()
`;
      const out = (await this.runPowerShell(psStartScript)).trim();
      if (out && out !== 'NOT_FOUND' && out.includes(',')) {
        const [xStr, yStr, nameStr] = out.split(',');
        return { x: parseInt(xStr, 10), y: parseInt(yStr, 10), name: nameStr || 'Start button' };
      }
    }

    // 2. Query interactive elements from active foreground window
    const activeWin = await screenUnderstandingService.getActiveWindow();
    const elements = await screenUnderstandingService.getInteractiveElements(activeWin?.handle);

    // Look for exact match first, then substring match
    let match = elements.find((el) => {
      const nameLower = el.name.toLowerCase();
      if (role && el.controlType.toLowerCase() !== role.toLowerCase()) return false;
      return nameLower === targetClean;
    });

    if (!match) {
      match = elements.find((el) => {
        const nameLower = el.name.toLowerCase();
        if (role && el.controlType.toLowerCase() !== role.toLowerCase()) return false;
        return nameLower.includes(targetClean) || targetClean.includes(nameLower);
      });
    }

    // Also check for common UI keywords like "close" -> close button, "search" -> search box
    if (!match) {
      if (targetClean.includes('close') || targetClean.includes('close button')) {
        match = elements.find((el) => el.controlType === 'Button' && (el.name.toLowerCase().includes('close') || el.id.toLowerCase().includes('close')));
      } else if (targetClean.includes('search') || targetClean.includes('search box') || targetClean.includes('search field')) {
        match = elements.find((el) => (el.controlType === 'Edit' || el.controlType === 'Button') && (el.name.toLowerCase().includes('search') || el.id.toLowerCase().includes('search')));
      }
    }

    if (match) {
      return {
        x: Math.round(match.x + match.width / 2),
        y: Math.round(match.y + match.height / 2),
        name: `${match.name} (${match.controlType})`,
      };
    }

    return null;
  }

  /**
   * Unified mouse action driver: move, click, double-click, right-click, scroll.
   */
  public async executeMouseAction(opts: MouseActionOptions): Promise<DesktopActionResult> {
    let targetX = opts.x;
    let targetY = opts.y;
    let resolvedName = opts.target || (opts.x !== undefined && opts.y !== undefined ? `(${opts.x}, ${opts.y})` : 'current position');

    // 1. Resolve named screen corner / center
    if (opts.position) {
      const posRes = await this.resolveNamedPosition(opts.position);
      targetX = posRes.x;
      targetY = posRes.y;
      resolvedName = `${opts.position} (${posRes.x}, ${posRes.y})`;
    }

    // 2. Resolve target element by name if coordinates not given
    if (opts.target && (targetX === undefined || targetY === undefined)) {
      const located = await this.locateElement(opts.target, opts.role);
      if (located) {
        targetX = located.x;
        targetY = located.y;
        resolvedName = located.name;
      } else {
        return {
          success: false,
          action: opts.action,
          target: opts.target,
          error: `Could not find visible interactive control matching "${opts.target}".`,
        };
      }
    }

    // 3. Safety Check
    if (opts.action === 'click' || opts.action === 'double_click' || opts.action === 'right_click') {
      if (this.isDestructiveAction(opts.target || resolvedName)) {
        return {
          success: false,
          action: opts.action,
          target: resolvedName,
          error: `Safety Guard: The action "${opts.target}" may delete files, change security, or make financial changes. Please confirm explicitly before proceeding.`,
        };
      }
    }

    const tX = targetX !== undefined ? targetX : -1;
    const tY = targetY !== undefined ? targetY : -1;
    const amt = opts.amount !== undefined ? opts.amount : (opts.direction === 'up' ? 3 : -3);

    const psDriverScript = `
Add-Type -TypeDefinition @'
using System;
using System.Threading;
using System.Runtime.InteropServices;

public class FridayMouseDriver {
    [DllImport("user32.dll", SetLastError = true)] public static extern IntPtr OpenInputDesktop(uint dwFlags, bool fInherit, uint dwDesiredAccess);
    [DllImport("user32.dll", SetLastError = true)] public static extern bool SetThreadDesktop(IntPtr hDesktop);
    [DllImport("user32.dll")] public static extern bool CloseDesktop(IntPtr hDesktop);
    [DllImport("user32.dll", SetLastError = true)] public static extern bool SetCursorPos(int X, int Y);
    [DllImport("user32.dll", SetLastError = true)] public static extern bool GetCursorPos(out POINT lpPoint);
    [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, int dwExtraInfo);

    [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }

    public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    public const uint MOUSEEVENTF_LEFTUP = 0x0004;
    public const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
    public const uint MOUSEEVENTF_RIGHTUP = 0x0010;
    public const uint MOUSEEVENTF_WHEEL = 0x0800;

    public static string Execute(string action, int x, int y, int amount) {
        string res = "OK";
        Thread t = new Thread(() => {
            IntPtr hDesk = OpenInputDesktop(0, false, 0x01FF);
            if (hDesk != IntPtr.Zero) SetThreadDesktop(hDesk);

            if (x >= 0 && y >= 0) {
                SetCursorPos(x, y);
                Thread.Sleep(50);
            }

            POINT currentPos;
            GetCursorPos(out currentPos);

            switch (action.ToLower()) {
                case "move":
                    res = string.Format("MOVED:{0},{1}", currentPos.X, currentPos.Y);
                    break;
                case "click":
                    mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
                    Thread.Sleep(45);
                    mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
                    res = string.Format("CLICKED:{0},{1}", currentPos.X, currentPos.Y);
                    break;
                case "double_click":
                    mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
                    Thread.Sleep(40);
                    mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
                    Thread.Sleep(80);
                    mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
                    Thread.Sleep(40);
                    mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
                    res = string.Format("DOUBLE_CLICKED:{0},{1}", currentPos.X, currentPos.Y);
                    break;
                case "right_click":
                    mouse_event(MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, 0);
                    Thread.Sleep(45);
                    mouse_event(MOUSEEVENTF_RIGHTUP, 0, 0, 0, 0);
                    res = string.Format("RIGHT_CLICKED:{0},{1}", currentPos.X, currentPos.Y);
                    break;
                case "scroll":
                    int wheelDelta = amount * 120;
                    mouse_event(MOUSEEVENTF_WHEEL, 0, 0, (uint)wheelDelta, 0);
                    res = string.Format("SCROLLED:{0},{1},{2}", currentPos.X, currentPos.Y, amount);
                    break;
                case "get_position":
                    res = string.Format("POS:{0},{1}", currentPos.X, currentPos.Y);
                    break;
                default:
                    res = "ERROR:Unknown action";
                    break;
            }

            if (hDesk != IntPtr.Zero) CloseDesktop(hDesk);
        });
        t.SetApartmentState(ApartmentState.STA);
        t.Start();
        t.Join();
        return res;
    }
}
'@ -ErrorAction SilentlyContinue

[FridayMouseDriver]::Execute("${opts.action}", ${tX}, ${tY}, ${amt})
`;

    try {
      const output = (await this.runPowerShell(psDriverScript)).trim();
      if (output.startsWith('MOVED:')) {
        const coords = output.replace('MOVED:', '');
        return {
          success: true,
          action: 'move',
          target: resolvedName,
          details: `Moved mouse cursor to ${resolvedName} (${coords}).`,
        };
      }
      if (output.startsWith('CLICKED:')) {
        const coords = output.replace('CLICKED:', '');
        return {
          success: true,
          action: 'click',
          target: resolvedName,
          details: `Clicked at ${resolvedName} (${coords}).`,
        };
      }
      if (output.startsWith('DOUBLE_CLICKED:')) {
        const coords = output.replace('DOUBLE_CLICKED:', '');
        return {
          success: true,
          action: 'double_click',
          target: resolvedName,
          details: `Double-clicked at ${resolvedName} (${coords}).`,
        };
      }
      if (output.startsWith('RIGHT_CLICKED:')) {
        const coords = output.replace('RIGHT_CLICKED:', '');
        return {
          success: true,
          action: 'right_click',
          target: resolvedName,
          details: `Right-clicked at ${resolvedName} (${coords}).`,
        };
      }
      if (output.startsWith('SCROLLED:')) {
        const parts = output.replace('SCROLLED:', '').split(',');
        const dir = (parseInt(parts[2], 10) || amt) >= 0 ? 'up' : 'down';
        return {
          success: true,
          action: 'scroll',
          details: `Scrolled ${dir} at (${parts[0]}, ${parts[1]}).`,
        };
      }
      if (output.startsWith('POS:')) {
        const coords = output.replace('POS:', '');
        return {
          success: true,
          action: 'get_position',
          details: `Current mouse position: (${coords}).`,
        };
      }
      return {
        success: false,
        action: opts.action,
        error: output || 'Mouse action could not be completed.',
      };
    } catch (err: any) {
      return {
        success: false,
        action: opts.action,
        error: err?.message || 'Mouse action failed.',
      };
    }
  }

  /**
   * Clicks an interactive UI element on the desktop by name/text, role, or coordinates.
   */
  public async clickElement(params: {
    target?: string;
    role?: string;
    x?: number;
    y?: number;
  }): Promise<DesktopActionResult> {
    return await this.executeMouseAction({
      action: 'click',
      target: params.target,
      role: params.role,
      x: params.x,
      y: params.y,
    });
  }

  /**
   * Types text into the currently focused field or a target element.
   * Uses TypeFlow's native SendInput engine for unicode and multiline safety.
   */
  public async typeText(params: {
    text: string;
    target?: string;
    clearFirst?: boolean;
    pressEnterAfter?: boolean;
  }): Promise<DesktopActionResult> {
    try {
      const { typeFlowController } = await import('../typeflow/typeflowController');
      let textToType = params.text;
      if (params.pressEnterAfter) textToType += '\n';

      const res = await typeFlowController.typeText(textToType, {
        targetApp: params.target,
        charDelayMs: 15,
      });

      return {
        success: res.success,
        action: 'type',
        target: params.target || res.targetProcess || 'focused element',
        details: `Typed ${res.charsTyped} characters successfully.`,
      };
    } catch (e: any) {
      // Fallback to PowerShell SendWait if TypeFlow unavailable
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
    return await this.executeMouseAction({
      action: 'scroll',
      direction,
      amount,
    });
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
