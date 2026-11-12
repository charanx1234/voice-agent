/**
 * FRIDAY VoiceFlow — History Manager
 * Stores local VoiceFlow transcription events, modes, target applications, and latency metrics.
 * Persists in localStorage for instant access and zero SQLite dependency issues in renderer.
 */

import { VoiceFlowHistoryEntry } from './types';

const STORAGE_KEY = 'friday_voiceflow_history';
const MAX_HISTORY_ENTRIES = 200;

export class VoiceFlowHistory {
  private static instance: VoiceFlowHistory | null = null;

  public static getInstance(): VoiceFlowHistory {
    if (!VoiceFlowHistory.instance) {
      VoiceFlowHistory.instance = new VoiceFlowHistory();
    }
    return VoiceFlowHistory.instance;
  }

  /**
   * Retrieves all saved VoiceFlow history entries, sorted newest first.
   */
  public getHistory(): VoiceFlowHistoryEntry[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return [];
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn('[VoiceFlowHistory] Failed to read history from storage:', e);
      return [];
    }
  }

  /**
   * Records a new completed VoiceFlow dictation entry.
   */
  public addEntry(entry: Omit<VoiceFlowHistoryEntry, 'id' | 'timestamp'>): VoiceFlowHistoryEntry {
    const fullEntry: VoiceFlowHistoryEntry = {
      ...entry,
      id: `vf_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
    };

    try {
      const existing = this.getHistory();
      const updated = [fullEntry, ...existing].slice(0, MAX_HISTORY_ENTRIES);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn('[VoiceFlowHistory] Failed to save entry to storage:', e);
    }

    return fullEntry;
  }

  /**
   * Clears all recorded VoiceFlow history.
   */
  public clear(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.warn('[VoiceFlowHistory] Failed to clear history:', e);
    }
  }

  /**
   * Deletes a single history entry by id.
   */
  public deleteEntry(id: string): void {
    try {
      const existing = this.getHistory();
      const filtered = existing.filter((item) => item.id !== id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    } catch (e) {
      console.warn('[VoiceFlowHistory] Failed to delete entry:', e);
    }
  }
}

export const voiceFlowHistory = VoiceFlowHistory.getInstance();
