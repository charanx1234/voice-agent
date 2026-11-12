import {
  ITypingEngine,
  TypingEngineType,
  TypingProgress,
  TypingResult,
  TypingSessionConfig,
  TypingSessionStatus,
  TargetWindowInfo,
} from './types';
import { typeFlowService } from './typeflowService';
import { ahkTypingEngine } from './ahkTypingEngine';

export class TypingEngineManager {
  private static instance: TypingEngineManager | null = null;
  private currentEngine: ITypingEngine = typeFlowService;

  public static getInstance(): TypingEngineManager {
    if (!TypingEngineManager.instance) {
      TypingEngineManager.instance = new TypingEngineManager();
    }
    return TypingEngineManager.instance;
  }

  private constructor() {}

  public getEngine(type?: TypingEngineType): ITypingEngine {
    if (type === 'ahk') return ahkTypingEngine;
    return typeFlowService;
  }

  public setPreferredEngine(type: TypingEngineType): void {
    if (type === 'ahk') {
      this.currentEngine = ahkTypingEngine;
    } else {
      this.currentEngine = typeFlowService;
    }
  }

  public async initialize(): Promise<void> {
    await Promise.allSettled([
      typeFlowService.initialize(),
      ahkTypingEngine.initialize(),
    ]);
  }

  public async validateTarget(target?: TargetWindowInfo): Promise<{ valid: boolean; reason?: string }> {
    return this.currentEngine.validateTarget(target);
  }

  public async startTyping(
    text: string,
    config: TypingSessionConfig = {},
    onProgress?: (progress: TypingProgress) => void
  ): Promise<TypingResult> {
    const engine = config.engine ? this.getEngine(config.engine) : this.currentEngine;
    return engine.startTyping(text, config, onProgress);
  }

  public async pauseTyping(): Promise<boolean> {
    return this.currentEngine.pauseTyping();
  }

  public async resumeTyping(): Promise<boolean> {
    return this.currentEngine.resumeTyping();
  }

  public async cancelTyping(): Promise<boolean> {
    return this.currentEngine.cancelTyping();
  }

  public getStatus(): TypingSessionStatus {
    return this.currentEngine.getStatus();
  }

  public async shutdown(): Promise<void> {
    await Promise.allSettled([
      typeFlowService.shutdown(),
      ahkTypingEngine.shutdown(),
    ]);
  }
}

export const typingEngineManager = TypingEngineManager.getInstance();
