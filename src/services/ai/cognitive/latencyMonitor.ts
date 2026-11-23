/**
 * FRIDAY Cognitive Engine — Latency & Observability Monitor (TypeScript)
 * Records fine-grained timing breakdowns and logs structured metrics without secrets.
 */

import { CognitiveTimingBreakdown } from '../../../shared/types';

const SECRET_PATTERN = /(AIzaSy[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9_-]{20,}|gsk_[A-Za-z0-9_-]{20,})/g;

export function redactSecrets(text: string): string {
  if (!text) return '';
  return String(text).replace(SECRET_PATTERN, '[REDACTED_KEY]');
}

interface ActiveRequestTimer {
  requestId: string;
  startTime: number;
  phaseTimers: Map<string, number>;
  metrics: CognitiveTimingBreakdown;
}

export class LatencyMonitor {
  private activeTimers = new Map<string, ActiveRequestTimer>();

  public startRequest(requestId: string): CognitiveTimingBreakdown {
    const metrics: CognitiveTimingBreakdown = {
      requestId,
      contextRetrievalMs: 0,
      intentRoutingMs: 0,
      complexityRoutingMs: 0,
      modelExecutionMs: 0,
      toolExecutionMs: 0,
      timeToFirstTokenMs: 0,
      totalDurationMs: 0,
    };

    this.activeTimers.set(requestId, {
      requestId,
      startTime: performance.now(),
      phaseTimers: new Map<string, number>(),
      metrics,
    });

    return metrics;
  }

  public startPhase(requestId: string, phaseName: string): void {
    const timer = this.activeTimers.get(requestId);
    if (timer) {
      timer.phaseTimers.set(phaseName, performance.now());
    }
  }

  public endPhase(requestId: string, phaseName: string): number {
    const timer = this.activeTimers.get(requestId);
    if (!timer || !timer.phaseTimers.has(phaseName)) return 0;

    const start = timer.phaseTimers.get(phaseName)!;
    timer.phaseTimers.delete(phaseName);
    const elapsed = Math.round((performance.now() - start) * 100) / 100;

    if (phaseName === 'context_retrieval') {
      timer.metrics.contextRetrievalMs = elapsed;
    } else if (phaseName === 'intent_routing') {
      timer.metrics.intentRoutingMs = elapsed;
    } else if (phaseName === 'complexity_routing') {
      timer.metrics.complexityRoutingMs = elapsed;
    } else if (phaseName === 'model_execution') {
      timer.metrics.modelExecutionMs = elapsed;
    } else if (phaseName === 'tool_execution') {
      timer.metrics.toolExecutionMs = elapsed;
    }

    return elapsed;
  }

  public recordFirstToken(requestId: string): number {
    const timer = this.activeTimers.get(requestId);
    if (timer && timer.metrics.timeToFirstTokenMs === 0) {
      const ttft = Math.round((performance.now() - timer.startTime) * 100) / 100;
      timer.metrics.timeToFirstTokenMs = ttft;
      return ttft;
    }
    return 0;
  }

  public finishRequest(requestId: string): CognitiveTimingBreakdown {
    const timer = this.activeTimers.get(requestId);
    if (!timer) {
      return {
        requestId,
        contextRetrievalMs: 0,
        intentRoutingMs: 0,
        complexityRoutingMs: 0,
        modelExecutionMs: 0,
        toolExecutionMs: 0,
        timeToFirstTokenMs: 0,
        totalDurationMs: 0.1,
      };
    }

    timer.metrics.totalDurationMs =
      Math.max(0.1, Math.round((performance.now() - timer.startTime) * 100) / 100);
    const finalMetrics = { ...timer.metrics };
    this.activeTimers.delete(requestId);
    return finalMetrics;
  }

  public logSummary(
    metrics: CognitiveTimingBreakdown,
    details: {
      source?: string;
      level?: string;
      intent?: string;
      model?: string;
      status?: string;
    } = {}
  ): void {
    const ttftStr =
      metrics.timeToFirstTokenMs > 0 ? ` ttft=${metrics.timeToFirstTokenMs}ms` : '';
    const toolStr =
      metrics.toolExecutionMs > 0 ? ` tools=${metrics.toolExecutionMs}ms` : '';
    console.info(
      `[CognitiveTiming] req=${metrics.requestId} src=${details.source || 'text'} ` +
      `level=${details.level || 'L1'} intent=${details.intent || 'general'} ` +
      `model=${details.model || 'gemini'} ` +
      `context=${metrics.contextRetrievalMs}ms routing=${Math.round((metrics.intentRoutingMs + metrics.complexityRoutingMs) * 10) / 10}ms ` +
      `model_time=${metrics.modelExecutionMs}ms${toolStr}${ttftStr} ` +
      `total=${metrics.totalDurationMs}ms status=${details.status || 'completed'}`
    );
  }
}

export const latencyMonitor = new LatencyMonitor();
