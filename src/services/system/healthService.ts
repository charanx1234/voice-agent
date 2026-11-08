import os from 'os';

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

/**
 * Ultra-lightweight native System Health monitor.
 * Uses zero subprocesses and zero WMI/PowerShell queries, relying on native Node.js os APIs.
 * Automatically halts polling when no listeners are attached to preserve CPU & battery.
 */
export class SystemHealthService {
  private timer: NodeJS.Timeout | null = null;
  private latest: SystemHealth | null = null;
  private listeners = new Set<(health: SystemHealth) => void>();
  private intervalMs: number;
  private lastCpuSample: { idle: number; total: number } | null = null;

  constructor(options: { intervalMs?: number } = {}) {
    this.intervalMs = Math.max(3000, options.intervalMs ?? 5000);
  }

  public start(): void {
    // Only schedule timer if listeners are actively registered
    if (this.timer || this.listeners.size === 0) return;
    void this.sample();
  }

  public stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  public onSample(listener: (health: SystemHealth) => void): () => void {
    this.listeners.add(listener);
    if (!this.timer && this.listeners.size === 1) {
      void this.sample();
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.stop();
      }
    };
  }

  public getLatest(): SystemHealth | null {
    return this.latest;
  }

  public async read(): Promise<SystemHealth> {
    const health = this.collectFast();
    this.latest = health;
    return health;
  }

  private schedule(): void {
    if (this.listeners.size === 0) {
      this.stop();
      return;
    }
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
      const health = this.collectFast();
      this.latest = health;
      for (const listener of this.listeners) {
        try {
          listener(health);
        } catch {
          // dashboard listener must never break polling
        }
      }
    } catch (err: any) {
      console.warn('[SystemHealth] sample failed:', err?.message);
    } finally {
      this.schedule();
    }
  }

  /**
   * Fast native collection taking <0.5ms with 0 subprocesses spawned.
   */
  private collectFast(): SystemHealth {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const cpuPercent = this.calculateCpuPercent();
    const networkOnline = this.isOnlineFast();

    return {
      cpuPercent,
      ramUsedGb: roundGb(usedMem),
      ramTotalGb: roundGb(totalMem),
      ramPercent: clampPercent((usedMem / totalMem) * 100),
      batteryPercent: null,
      charging: null,
      diskUsedPercent: null,
      diskFreeGb: null,
      networkOnline,
      temperatureC: null,
      uptimeHours: Math.round((os.uptime() / 3600) * 10) / 10,
      sampledAt: new Date().toISOString(),
    };
  }

  private calculateCpuPercent(): number {
    try {
      const cpus = os.cpus();
      if (!cpus || cpus.length === 0) return 0;

      let totalIdle = 0;
      let totalTick = 0;

      for (let i = 0; i < cpus.length; i++) {
        const cpu = cpus[i];
        const times = cpu.times;
        totalIdle += times.idle;
        totalTick += times.user + times.nice + times.sys + times.idle + times.irq;
      }

      if (!this.lastCpuSample) {
        this.lastCpuSample = { idle: totalIdle, total: totalTick };
        return 0;
      }

      const idleDiff = totalIdle - this.lastCpuSample.idle;
      const totalDiff = totalTick - this.lastCpuSample.total;
      this.lastCpuSample = { idle: totalIdle, total: totalTick };

      if (totalDiff <= 0) return 0;
      const usage = 100 - (idleDiff / totalDiff) * 100;
      return clampPercent(usage);
    } catch {
      return 0;
    }
  }

  private isOnlineFast(): boolean {
    try {
      const interfaces = os.networkInterfaces();
      for (const name of Object.keys(interfaces)) {
        const ifaceList = interfaces[name];
        if (!ifaceList) continue;
        for (const iface of ifaceList) {
          if (!iface.internal && iface.family === 'IPv4' && iface.address !== '127.0.0.1') {
            return true;
          }
        }
      }
      return false;
    } catch {
      return true;
    }
  }
}

export const systemHealthService = new SystemHealthService();
