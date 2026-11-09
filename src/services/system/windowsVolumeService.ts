import { execFile } from 'child_process';

export interface VolumeStatus {
  success: boolean;
  volume: number; // 0 to 100
  muted: boolean;
  error?: string;
  actionTaken?: string;
}

const AUDIO_PS_SCRIPT = `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
    int f(); int g(); int h(); int i();
    int SetMasterVolumeLevelScalar(float fLevel, Guid pguidEventContext);
    int j();
    int GetMasterVolumeLevelScalar(out float pfLevel);
    int k(); int l(); int m(); int n();
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, Guid pguidEventContext);
    int GetMute(out bool pbMute);
}

[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {
    int Activate(ref Guid id, int clsCtx, int activationParams, out IAudioEndpointVolume aev);
}

[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
    int f();
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint);
}

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
class MMDeviceEnumeratorComObject {}

public class FridayAudioCore {
    private static IAudioEndpointVolume GetEndpoint() {
        var enumerator = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator;
        IMMDevice dev = null;
        Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(0, 1, out dev));
        IAudioEndpointVolume epv = null;
        Guid epvid = typeof(IAudioEndpointVolume).GUID;
        Marshal.ThrowExceptionForHR(dev.Activate(ref epvid, 23, 0, out epv));
        return epv;
    }

    public static float GetVolume() {
        float vol = 0;
        Marshal.ThrowExceptionForHR(GetEndpoint().GetMasterVolumeLevelScalar(out vol));
        return vol;
    }

    public static void SetVolume(float vol) {
        Marshal.ThrowExceptionForHR(GetEndpoint().SetMasterVolumeLevelScalar(vol, Guid.Empty));
    }

    public static bool GetMute() {
        bool mute = false;
        Marshal.ThrowExceptionForHR(GetEndpoint().GetMute(out mute));
        return mute;
    }

    public static void SetMute(bool mute) {
        Marshal.ThrowExceptionForHR(GetEndpoint().SetMute(mute, Guid.Empty));
    }
}
'@ -ErrorAction SilentlyContinue
`;

export class WindowsVolumeService {
  /**
   * Reads current system master volume (0-100) and mute state.
   */
  public async getVolume(): Promise<VolumeStatus> {
    const script = `
${AUDIO_PS_SCRIPT}
try {
  $vol = [Math]::Round([FridayAudioCore]::GetVolume() * 100)
  $mute = [FridayAudioCore]::GetMute()
  [PSCustomObject]@{ success = $true; volume = [int]$vol; muted = [bool]$mute } | ConvertTo-Json -Compress
} catch {
  [PSCustomObject]@{ success = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress
}
`;
    const out = await this.runPowerShell(script);
    try {
      const parsed = JSON.parse(out);
      return {
        success: Boolean(parsed.success),
        volume: Number(parsed.volume) || 0,
        muted: Boolean(parsed.muted),
        error: parsed.error,
      };
    } catch {
      return {
        success: false,
        volume: 0,
        muted: false,
        error: 'Unable to query Windows audio device.',
      };
    }
  }

  /**
   * Sets master volume to an exact percentage (0-100) and verifies result.
   */
  public async setVolume(percentage: number): Promise<VolumeStatus> {
    const clamped = Math.max(0, Math.min(100, Math.round(percentage)));
    const scalar = (clamped / 100).toFixed(4);

    const script = `
${AUDIO_PS_SCRIPT}
try {
  [FridayAudioCore]::SetVolume(${scalar})
  # Auto-unmute when user explicitly sets volume above zero
  if (${clamped} -gt 0 -and [FridayAudioCore]::GetMute()) {
    [FridayAudioCore]::SetMute($false)
  }
  $vol = [Math]::Round([FridayAudioCore]::GetVolume() * 100)
  $mute = [FridayAudioCore]::GetMute()
  [PSCustomObject]@{ success = $true; volume = [int]$vol; muted = [bool]$mute; actionTaken = "Set volume to $vol%" } | ConvertTo-Json -Compress
} catch {
  [PSCustomObject]@{ success = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress
}
`;
    const out = await this.runPowerShell(script);
    try {
      const parsed = JSON.parse(out);
      return {
        success: Boolean(parsed.success),
        volume: Number(parsed.volume) || clamped,
        muted: Boolean(parsed.muted),
        actionTaken: parsed.actionTaken || `Volume set to ${clamped}%.`,
        error: parsed.error,
      };
    } catch {
      return {
        success: false,
        volume: 0,
        muted: false,
        error: 'Failed to update system volume.',
      };
    }
  }

  /**
   * Adjusts master volume up or down by a given delta percentage.
   */
  public async adjustVolume(delta: number): Promise<VolumeStatus> {
    const current = await this.getVolume();
    if (!current.success) {
      return current;
    }

    const target = current.volume + delta;
    const res = await this.setVolume(target);
    if (res.success) {
      res.actionTaken = delta >= 0
        ? `Increased volume by ${delta}% to ${res.volume}%.`
        : `Decreased volume by ${Math.abs(delta)}% to ${res.volume}%.`;
    }
    return res;
  }

  /**
   * Sets mute state explicitly (true = muted, false = unmuted) and verifies.
   */
  public async setMute(mute: boolean): Promise<VolumeStatus> {
    const script = `
${AUDIO_PS_SCRIPT}
try {
  [FridayAudioCore]::SetMute(${mute ? '$true' : '$false'})
  $vol = [Math]::Round([FridayAudioCore]::GetVolume() * 100)
  $muteState = [FridayAudioCore]::GetMute()
  [PSCustomObject]@{ success = $true; volume = [int]$vol; muted = [bool]$muteState; actionTaken = if ($muteState) { "Muted" } else { "Unmuted" } } | ConvertTo-Json -Compress
} catch {
  [PSCustomObject]@{ success = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress
}
`;
    const out = await this.runPowerShell(script);
    try {
      const parsed = JSON.parse(out);
      return {
        success: Boolean(parsed.success),
        volume: Number(parsed.volume) || 0,
        muted: Boolean(parsed.muted),
        actionTaken: parsed.actionTaken || (mute ? 'Muted' : 'Unmuted'),
        error: parsed.error,
      };
    } catch {
      return {
        success: false,
        volume: 0,
        muted: false,
        error: 'Failed to set audio mute state.',
      };
    }
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

export const windowsVolumeService = new WindowsVolumeService();
