import fs from 'fs';
import path from 'path';
import os from 'os';
import { clipboard } from 'electron';
import { ClipboardHistoryItem } from '../../shared/types';

const SENSITIVE_PATTERNS = [
  // Bearer tokens & JWTs
  /bearer\s+[a-zA-Z0-9_\-\.=]+/i,
  /eyJ[a-zA-Z0-9_\-]{12,}\.[a-zA-Z0-9_\-]{12,}/,
  // API Keys / Secrets
  /(?:api[_\-]?key|secret|private[_\-]?key|access[_\-]?token|auth[_\-]?token)\s*[:=]\s*[^\s]+/i,
  /AIza[0-9A-Za-z\-_]{35}/, // Google API key
  /ghp_[a-zA-Z0-9]{36}/, // GitHub personal access token
  /sk-[a-zA-Z0-9]{20,}/, // OpenAI key
  // Standard credit card numbers
  /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/,
  // Passwords labels
  /(?:password|passwd|pwd)\s*[:=]\s*[^\s]+/i,
];

export class ClipboardHistoryService {
  private historyFile: string;
  private maxItems: number;
  private items: ClipboardHistoryItem[] = [];
  private lastCapturedText = '';
  private pollingTimer: NodeJS.Timeout | null = null;
  private isMonitoring = true;

  constructor(customHistoryPath?: string, maxItems = 50) {
    this.maxItems = maxItems;
    if (customHistoryPath) {
      this.historyFile = customHistoryPath;
    } else {
      const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
      const dir = path.join(appData, 'friday-ai-companion');
      if (!fs.existsSync(dir)) {
        try { fs.mkdirSync(dir, { recursive: true }); } catch {}
      }
      this.historyFile = path.join(dir, 'clipboard_history.json');
    }

    this.loadHistory();
  }

  public isSensitive(text: string): boolean {
    if (!text || text.length > 5000) return false;
    for (const pattern of SENSITIVE_PATTERNS) {
      if (pattern.test(text)) return true;
    }
    return false;
  }

  public getItems(): ClipboardHistoryItem[] {
    return [...this.items];
  }

  public search(query: string): ClipboardHistoryItem[] {
    if (!query.trim()) return this.getItems();
    const q = query.toLowerCase();
    return this.items.filter((item) => item.text.toLowerCase().includes(q));
  }

  public addText(text: string): ClipboardHistoryItem | null {
    const trimmed = text.trim();
    if (!trimmed) return null;
    if (this.isSensitive(trimmed)) {
      return null; // Skip sensitive clipboard data
    }

    // Check if this text is already the top item
    if (this.items.length > 0 && this.items[0].text === trimmed) {
      return this.items[0];
    }

    // If duplicate exists lower in list and is not pinned, remove it so it moves to top
    const existingIndex = this.items.findIndex((i) => i.text === trimmed);
    let isPinned = false;
    if (existingIndex >= 0) {
      isPinned = this.items[existingIndex].isPinned;
      this.items.splice(existingIndex, 1);
    }

    const isUrl = /^https?:\/\/[^\s$.?#].[^\s]*$/i.test(trimmed);

    const newItem: ClipboardHistoryItem = {
      id: `clip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      text: trimmed,
      copiedAt: new Date().toISOString(),
      isPinned,
      charCount: trimmed.length,
      isUrl,
    };

    // Unpinned items are capped, pinned items are kept
    this.items.unshift(newItem);
    this.trimHistory();
    this.saveHistory();

    this.lastCapturedText = trimmed;
    return newItem;
  }

  public togglePin(id: string): ClipboardHistoryItem[] {
    const item = this.items.find((i) => i.id === id);
    if (item) {
      item.isPinned = !item.isPinned;
      this.saveHistory();
    }
    return this.getItems();
  }

  public deleteItem(id: string): ClipboardHistoryItem[] {
    this.items = this.items.filter((i) => i.id !== id);
    this.saveHistory();
    return this.getItems();
  }

  public clearHistory(): void {
    // Retain only pinned items
    this.items = this.items.filter((i) => i.isPinned);
    this.saveHistory();
  }

  public copyToClipboard(text: string): boolean {
    try {
      if (clipboard && clipboard.writeText) {
        clipboard.writeText(text);
        this.lastCapturedText = text.trim();
        return true;
      }
    } catch {}
    return false;
  }

  public setMonitoring(enabled: boolean): void {
    this.isMonitoring = enabled;
  }

  public isMonitoringActive(): boolean {
    return this.isMonitoring;
  }

  public startPolling(intervalMs = 1000): void {
    if (this.pollingTimer) return;
    this.pollingTimer = setInterval(() => {
      if (!this.isMonitoring) return;
      try {
        if (!clipboard || !clipboard.readText) return;
        const current = clipboard.readText();
        if (current && current.trim() !== this.lastCapturedText) {
          this.addText(current);
        }
      } catch {}
    }, intervalMs);
  }

  public stopPolling(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  private trimHistory(): void {
    const pinned = this.items.filter((i) => i.isPinned);
    const unpinned = this.items.filter((i) => !i.isPinned);
    const allowedUnpinned = Math.max(0, this.maxItems - pinned.length);
    this.items = [...pinned, ...unpinned.slice(0, allowedUnpinned)].sort((a, b) => {
      // Pinned first, then by date descending
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return new Date(b.copiedAt).getTime() - new Date(a.copiedAt).getTime();
    });
  }

  private loadHistory(): void {
    try {
      if (fs.existsSync(this.historyFile)) {
        const raw = fs.readFileSync(this.historyFile, 'utf8');
        this.items = JSON.parse(raw);
        if (this.items.length > 0) {
          this.lastCapturedText = this.items[0].text;
        }
      }
    } catch {
      this.items = [];
    }
  }

  private saveHistory(): void {
    try {
      fs.writeFileSync(this.historyFile, JSON.stringify(this.items, null, 2), 'utf8');
    } catch {}
  }
}

export const clipboardHistoryService = new ClipboardHistoryService();
