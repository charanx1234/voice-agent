import { execFile } from 'child_process';

export interface BrightnessStatus {
  success: boolean;
  supported: boolean;
  brightness: number; // 0 to 100
  error?: string;
  actionTaken?: string;
}

export class WindowsBrightnessService {
  /**
   * Queries the laptop built-in display brightness (0-100).
   */
  public async getBrightness(): Promise<BrightnessStatus> {
    const script = `
try {
  $wmi = Get-CimInstance -Namespace root/wmi -ClassName WmiMonitorBrightness -ErrorAction Stop
  $val = if ($wmi.CurrentBrightness -ne $null) { [int]$wmi.CurrentBrightness } else { [int]$wmi[0].CurrentBrightness }
  [PSCustomObject]@{ success = $true; supported = $true; brightness = $val } | ConvertTo-Json -Compress
} catch {
  [PSCustomObject]@{ success = $false; supported = $false; brightness = 0; error = "Display brightness control is not supported on this monitor or display driver." } | ConvertTo-Json -Compress
}
`;
    const out = await this.runPowerShell(script);
    try {
      const parsed = JSON.parse(out);
      return {
        success: Boolean(parsed.success),
        supported: Boolean(parsed.supported),
        brightness: Number(parsed.brightness) || 0,
        error: parsed.error,
      };
    } catch {
      return {
        success: false,
        supported: false,
        brightness: 0,
        error: 'Unable to query screen brightness.',
      };
    }
  }

  /**
   * Sets screen brightness to an exact percentage (0-100) and verifies result.
   */
  public async setBrightness(percentage: number): Promise<BrightnessStatus> {
    const clamped = Math.max(0, Math.min(100, Math.round(percentage)));

    const script = `
try {
  $methods = Get-CimInstance -Namespace root/wmi -ClassName WmiMonitorBrightnessMethods -ErrorAction Stop
  $target = if ($methods -is [array]) { $methods[0] } else { $methods }
  Invoke-CimMethod -InputObject $target -MethodName WmiSetBrightness -Arguments @{ Timeout = [uint32]1; Brightness = [byte]${clamped} } -ErrorAction Stop | Out-Null
  
  # Verify actual resulting brightness
  $wmi = Get-CimInstance -Namespace root/wmi -ClassName WmiMonitorBrightness -ErrorAction Stop
  $verified = if ($wmi.CurrentBrightness -ne $null) { [int]$wmi.CurrentBrightness } else { [int]$wmi[0].CurrentBrightness }
  [PSCustomObject]@{ success = $true; supported = $true; brightness = $verified; actionTaken = "Brightness set to $verified%" } | ConvertTo-Json -Compress
} catch {
  [PSCustomObject]@{ success = $false; supported = $false; brightness = 0; error = "Failed to set display brightness: " + $_.Exception.Message } | ConvertTo-Json -Compress
}
`;
    const out = await this.runPowerShell(script);
    try {
      const parsed = JSON.parse(out);
      return {
        success: Boolean(parsed.success),
        supported: Boolean(parsed.supported),
        brightness: Number(parsed.brightness) || clamped,
        actionTaken: parsed.actionTaken || `Brightness set to ${clamped}%.`,
        error: parsed.error,
      };
    } catch {
      return {
        success: false,
        supported: false,
        brightness: 0,
        error: 'Could not change display brightness.',
      };
    }
  }

  /**
   * Adjusts brightness up or down by a given delta percentage.
   */
  public async adjustBrightness(delta: number): Promise<BrightnessStatus> {
    const current = await this.getBrightness();
    if (!current.supported || !current.success) {
      return current;
    }

    const target = current.brightness + delta;
    const res = await this.setBrightness(target);
    if (res.success) {
      res.actionTaken = delta >= 0
        ? `Increased screen brightness by ${delta}% to ${res.brightness}%.`
        : `Decreased screen brightness by ${Math.abs(delta)}% to ${res.brightness}%.`;
    }
    return res;
  }

  private runPowerShell(script: string): Promise<string> {
    return new Promise((resolve) => {
      execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
        { timeout: 5000 },
        (err, stdout) => {
          if (err) resolve('');
          else resolve((stdout || '').trim());
        }
      );
    });
  }
}

export const windowsBrightnessService = new WindowsBrightnessService();
