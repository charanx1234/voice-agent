import { desktopCapturer, screen } from 'electron';
import { execFile } from 'child_process';
import { EventEmitter } from 'events';
import { ActiveWindowInfo, DesktopUiElement, ScreenCaptureResult } from '../../shared/types';

export class ScreenUnderstandingService extends EventEmitter {
  private isCapturing = false;

  constructor() {
    super();
  }

  /**
   * Captures the primary or specified desktop monitor screen along with active
   * window info and interactive UI Automation elements.
   */
  public async captureScreen(options?: {
    monitorIndex?: number;
    includeUiElements?: boolean;
  }): Promise<ScreenCaptureResult> {
    this.isCapturing = true;
    this.emit('analysis-state', true);

    try {
      const displays = screen ? screen.getAllDisplays() : [];
      const targetIndex = options?.monitorIndex ?? 0;
      const targetDisplay = displays[targetIndex] || displays[0];

      const bounds = targetDisplay?.bounds || { width: 1920, height: 1080 };
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: {
          width: Math.min(2560, bounds.width),
          height: Math.min(1440, bounds.height),
        },
      });

      const primarySource = sources[targetIndex] || sources[0];
      if (!primarySource) {
        throw new Error('No screen display available for capture.');
      }

      const thumbnail = primarySource.thumbnail;
      const imageBuffer = thumbnail.toPNG();
      const imageBase64 = imageBuffer.toString('base64');
      const size = thumbnail.getSize();

      // Retrieve foreground window details
      const activeWindow = await this.getActiveWindow();

      // Retrieve UI Automation interactive elements if requested
      let elements: DesktopUiElement[] | undefined = undefined;
      if (options?.includeUiElements !== false) {
        elements = await this.getInteractiveElements(activeWindow?.handle);
      }

      return {
        success: true,
        imageBase64,
        imageMimeType: 'image/png',
        width: size.width,
        height: size.height,
        monitorIndex: targetIndex,
        activeWindow: activeWindow || undefined,
        elements,
      };
    } catch (err: any) {
      console.error('[ScreenUnderstandingService] Screen capture failed:', err?.message);
      return {
        success: false,
        width: 0,
        height: 0,
        error: err?.message || 'Failed to capture desktop screen.',
      };
    } finally {
      this.isCapturing = false;
      this.emit('analysis-state', false);
    }
  }

  /**
   * Queries Windows for the currently focused foreground window.
   */
  public async getActiveWindow(): Promise<ActiveWindowInfo | null> {
    const psScript = `
$code = @"
  using System;
  using System.Runtime.InteropServices;
  using System.Text;
  public class WinActive {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  }
"@
Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue

$hwnd = [WinActive]::GetForegroundWindow()
if ($hwnd -eq [IntPtr]::Zero) { exit }

$sb = New-Object System.Text.StringBuilder 512
[WinActive]::GetWindowText($hwnd, $sb, 512) | Out-Null
$pid = 0
[WinActive]::GetWindowThreadProcessId($hwnd, [ref]$pid) | Out-Null
$rect = New-Object WinActive+RECT
[WinActive]::GetWindowRect($hwnd, [ref]$rect) | Out-Null

$proc = Get-Process -Id $pid -ErrorAction SilentlyContinue

[PSCustomObject]@{
  title = $sb.ToString()
  processName = if ($proc) { $proc.ProcessName } else { "Unknown" }
  x = $rect.Left
  y = $rect.Top
  width = [Math]::Max(0, $rect.Right - $rect.Left)
  height = [Math]::Max(0, $rect.Bottom - $rect.Top)
  handle = $hwnd.ToInt64().ToString()
} | ConvertTo-Json -Compress
`;

    try {
      const output = await this.runPowerShell(psScript);
      if (!output.trim()) return null;
      const parsed = JSON.parse(output.trim());
      return {
        processName: parsed.processName || 'Unknown',
        title: parsed.title || 'Untitled',
        x: Number(parsed.x) || 0,
        y: Number(parsed.y) || 0,
        width: Number(parsed.width) || 0,
        height: Number(parsed.height) || 0,
        handle: parsed.handle,
      };
    } catch {
      return null;
    }
  }

  /**
   * Scans interactive UI Automation elements of the target or foreground window.
   */
  public async getInteractiveElements(hwndString?: string): Promise<DesktopUiElement[]> {
    const psScript = `
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes -ErrorAction SilentlyContinue

$hwnd = ${hwndString ? `[IntPtr]::new([int64]${hwndString})` : `(Get-Process | Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero } | Select-Object -First 1).MainWindowHandle`}

if (-not $hwnd -or $hwnd -eq [IntPtr]::Zero) {
  $element = [System.Windows.Automation.AutomationElement]::FocusedElement
} else {
  try {
    $element = [System.Windows.Automation.AutomationElement]::FromHandle($hwnd)
  } catch {
    $element = [System.Windows.Automation.AutomationElement]::FocusedElement
  }
}

if (-not $element) { "[]"; exit }

$condition = [System.Windows.Automation.Condition]::TrueCondition
$found = $element.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition)

$results = @()
$count = 0

foreach ($item in $found) {
  if ($count -ge 60) { break }
  try {
    $cType = $item.Current.ControlType.ProgrammaticName.Replace("ControlType.", "")
    $name = $item.Current.Name
    $rect = $item.Current.BoundingRectangle

    # Only include interactive or identifiable elements
    if ($rect.Width -gt 4 -and $rect.Height -gt 4 -and ($name -or $cType -in @("Button", "Edit", "Hyperlink", "MenuItem", "ComboBox", "CheckBox", "TabItem", "ListItem"))) {
      $isPassword = $item.Current.IsPassword
      $val = ""
      if (-not $isPassword) {
        $valPattern = $null
        if ($item.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$valPattern)) {
          $val = $valPattern.Current.Value
        }
      } else {
        $val = "[PASSWORD PROTECTED]"
      }

      $results += [PSCustomObject]@{
        id = if ($item.Current.AutomationId) { $item.Current.AutomationId } else { "el_" + $count }
        name = if ($name) { $name } else { $cType }
        controlType = $cType
        x = [int]$rect.X
        y = [int]$rect.Y
        width = [int]$rect.Width
        height = [int]$rect.Height
        isEnabled = $item.Current.IsEnabled
        isKeyboardFocusable = $item.Current.IsKeyboardFocusable
        value = $val
      }
      $count++
    }
  } catch {}
}

$results | ConvertTo-Json -Compress
`;

    try {
      const output = await this.runPowerShell(psScript);
      if (!output.trim()) return [];
      const parsed = JSON.parse(output.trim());
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === 'object') return [parsed];
      return [];
    } catch {
      return [];
    }
  }

  private runPowerShell(script: string): Promise<string> {
    return new Promise((resolve) => {
      execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
        { timeout: 8000, maxBuffer: 1024 * 1024 * 4 },
        (err, stdout) => {
          if (err) resolve('');
          else resolve(stdout || '');
        }
      );
    });
  }
}

export const screenUnderstandingService = new ScreenUnderstandingService();
