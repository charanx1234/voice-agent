import si from 'systeminformation';

export interface SystemHealth {
  cpuPercent: number;
  ramUsedGb: number;
  ramTotalGb: number;
  ramPercent: number;
  batteryPercent: number | null;
  charging: boolean | null;
  diskUsedPercent: number | null;
  diskFreeGb: number | null;
  networkOnline: boolean;
  temperatureC: number | null;
  uptimeHours: number;
  sampledAt: string;
}

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function roundGb(bytes: number): number {
  if (!Number.isFinite(bytes) || bytes <= 0) return 0;
  return Math.round((bytes / 1024 ** 3) * 10) / 10;
}

/** One-line summary used by the dashboard status strip. */
export function formatHealthSummary(health: SystemHealth): string {
  const parts = [
    `CPU ${health.cpuPercent}%`,
    `RAM ${health.ramPercent}%`,
    health.batteryPercent !== null
      ? `BAT ${health.batteryPercent}%${health.charging ? ' ⚡' : ''}`
      : 'BAT n/a',
    health.diskUsedPercent !== null ? `DISK ${health.diskUsedPercent}%` : 'DISK n/a',
    health.networkOnline ? 'NET online' : 'NET offline',
  ];

  if (health.temperatureC !== null) parts.push(`${health.temperatureC}°C`);
  return parts.join(' · ');
}

export class SystemHealthService {
  private timer: NodeJS.Timeout | null = null;
  private latest: SystemHealth | null = null;
  private listeners = new Set<(health: SystemHealth) => void>();
  private intervalMs: number;

  constructor(options: { intervalMs?: number } = {}) {
    this.intervalMs = Math.max(2000, options.intervalMs ?? 5000);
  }

  public start(): void {
    if (this.timer) return;
    void this.sample();
  }

  public stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.listeners.clear();
  }

  public onSample(listener: (health: SystemHealth) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public getLatest(): SystemHealth | null {
    return this.latest;
  }

  public async read(): Promise<SystemHealth> {
    const health = await this.collect();
    this.latest = health;
    return health;
  }

  private schedule(): void {
    this.timer = setTimeout(() => {
      void this.tick();
    }, this.intervalMs);
    this.timer.unref?.();
  }

  private async sample(): Promise<void> {
    await this.tick();
  }

  private async tick(): Promise<void> {
    try {
      const health = await this.collect();
      this.latest = health;
      for (const listener of this.listeners) {
        try {
          listener(health);
        } catch {
          // a dashboard listener must never break polling
        }
      }
    } catch (err: any) {
      console.warn('[SystemHealth] sample failed:', err?.message);
    } finally {
      this.schedule();
    }
  }

  private async collect(): Promise<SystemHealth> {
    const [load, mem, battery, disks, temp] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.battery().catch(() => null as any),
      si.fsSize().catch(() => [] as any[]),
      si.cpuTemperature().catch(() => null as any),
    ]);

    const systemDisk = Array.isArray(disks) && disks.length > 0 ? disks[0] : null;
    const networkOnline = await this.isOnline();

    return {
      cpuPercent: clampPercent(load?.currentLoad ?? 0),
      ramUsedGb: roundGb(mem?.used ?? 0),
      ramTotalGb: roundGb(mem?.total ?? 0),
      ramPercent: clampPercent(mem ? (mem.used / mem.total) * 100 : 0),
      batteryPercent:
        battery && battery.hasBattery && Number.isFinite(battery.percent)
          ? clampPercent(battery.percent)
          : null,
      charging: battery && battery.hasBattery ? Boolean(battery.isCharging) : null,
      diskUsedPercent: systemDisk ? clampPercent(systemDisk.used ?? 0) : null,
      diskFreeGb: systemDisk ? roundGb(systemDisk.available ?? 0) : null,
      networkOnline,
      temperatureC:
        temp && Number.isFinite(temp.main) && temp.main > 0 ? Math.round(temp.main) : null,
      uptimeHours: Math.round((si.time().uptime / 3600) * 10) / 10,
      sampledAt: new Date().toISOString(),
    };
  }

  private async isOnline(): Promise<boolean> {
    try {
      const interfaces = await si.networkInterfaces();
      const list = Array.isArray(interfaces) ? interfaces : [interfaces];
      return list.some(
        (iface: any) =>
          iface &&
          iface.operstate === 'up' &&
          !iface.internal &&
          !/loopback|virtual|vmware|hyper-v/i.test(String(iface.iface || ''))
      );
    } catch {
      return false;
    }
  }
}

export const systemHealthService = new SystemHealthService();
