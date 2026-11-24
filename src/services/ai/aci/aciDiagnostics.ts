/**
 * FRIDAY Adaptive Conversational Intelligence (ACI) V1 — Diagnostics Manager
 * Safe developer diagnostics tracking policy decisions, latencies, and adjustments
 * without storing API keys, raw audio, or private PII.
 */

import { AciDiagnosticsRecord } from './types';

export class AciDiagnosticsManager {
  private static readonly MAX_HISTORY = 50;
  private records: AciDiagnosticsRecord[] = [];

  public record(diag: AciDiagnosticsRecord): void {
    this.records.unshift(diag);
    if (this.records.length > AciDiagnosticsManager.MAX_HISTORY) {
      this.records.pop();
    }
  }

  public getRecent(limit: number = 10): AciDiagnosticsRecord[] {
    return this.records.slice(0, limit);
  }

  public getLatest(): AciDiagnosticsRecord | null {
    return this.records.length > 0 ? this.records[0] : null;
  }

  public clear(): void {
    this.records = [];
  }
}

export const aciDiagnostics = new AciDiagnosticsManager();
