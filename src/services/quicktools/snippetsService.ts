import fs from 'fs';
import path from 'path';
import os from 'os';
import { clipboard } from 'electron';
import { TextSnippetItem } from '../../shared/types';

const DEFAULT_SNIPPETS: TextSnippetItem[] = [
  {
    id: 'snip_default_mail',
    shortcut: ';mail',
    title: 'Professional Email Follow-up',
    content: 'Hi {name},\n\nI hope you are having a productive week. Following up on our discussion regarding {subject}, please let me know if you need any additional details.\n\nBest regards,\nRam Charan',
    tags: ['email', 'work'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'snip_default_phone',
    shortcut: ';phone',
    title: 'Contact Phone Number',
    content: '+91 98765 43210',
    tags: ['contact', 'personal'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'snip_default_intro',
    shortcut: ';intro',
    title: 'Self Introduction',
    content: 'Hello! I am Ram Charan, an AI developer and software engineering student building FRIDAY, an autonomous Windows desktop companion.',
    tags: ['bio', 'intro'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'snip_default_meeting',
    shortcut: ';meeting',
    title: 'Quick Meeting Agenda',
    content: 'Meeting Date: {date} ({time})\nTopic: {subject}\n\nKey Objectives:\n1. Status Review\n2. Blockers & Decisions\n3. Action Items',
    tags: ['work', 'meeting'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export class SnippetsService {
  private snippetsFile: string;
  private snippets: TextSnippetItem[] = [];

  constructor(customSnippetsPath?: string) {
    if (customSnippetsPath) {
      this.snippetsFile = customSnippetsPath;
    } else {
      const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
      const dir = path.join(appData, 'friday-ai-companion');
      if (!fs.existsSync(dir)) {
        try { fs.mkdirSync(dir, { recursive: true }); } catch {}
      }
      this.snippetsFile = path.join(dir, 'snippets.json');
    }

    this.loadSnippets();
  }

  public getSnippets(): TextSnippetItem[] {
    return [...this.snippets];
  }

  public getSnippetByShortcut(shortcut: string): TextSnippetItem | undefined {
    const s = shortcut.trim().toLowerCase();
    return this.snippets.find(
      (snip) => snip.shortcut.toLowerCase() === s || snip.shortcut.toLowerCase() === `;${s}`
    );
  }

  public getSnippetById(id: string): TextSnippetItem | undefined {
    return this.snippets.find((snip) => snip.id === id);
  }

  public saveSnippet(
    snippet: Omit<TextSnippetItem, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ): TextSnippetItem {
    const now = new Date().toISOString();
    let formattedShortcut = snippet.shortcut.trim();
    if (!formattedShortcut.startsWith(';')) {
      formattedShortcut = `;${formattedShortcut}`;
    }

    if (snippet.id) {
      const index = this.snippets.findIndex((s) => s.id === snippet.id);
      if (index >= 0) {
        const updated: TextSnippetItem = {
          ...this.snippets[index],
          ...snippet,
          shortcut: formattedShortcut,
          updatedAt: now,
        };
        this.snippets[index] = updated;
        this.persistSnippets();
        return updated;
      }
    }

    const newSnippet: TextSnippetItem = {
      id: `snip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      shortcut: formattedShortcut,
      title: snippet.title.trim() || formattedShortcut,
      content: snippet.content,
      tags: snippet.tags || [],
      createdAt: now,
      updatedAt: now,
    };

    this.snippets.unshift(newSnippet);
    this.persistSnippets();
    return newSnippet;
  }

  public deleteSnippet(id: string): boolean {
    const beforeCount = this.snippets.length;
    this.snippets = this.snippets.filter((s) => s.id !== id);
    if (this.snippets.length !== beforeCount) {
      this.persistSnippets();
      return true;
    }
    return false;
  }

  public expandSnippet(
    shortcutOrId: string,
    placeholders: Record<string, string> = {}
  ): { success: boolean; expandedText: string; snippet?: TextSnippetItem } {
    const snippet =
      this.getSnippetByShortcut(shortcutOrId) || this.getSnippetById(shortcutOrId);

    if (!snippet) {
      return { success: false, expandedText: '' };
    }

    let result = snippet.content;

    // Standard placeholders
    const now = new Date();
    const defaultDate = now.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
    const defaultTime = now.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    let currentClipboard = '';
    try {
      if (clipboard && clipboard.readText) {
        currentClipboard = clipboard.readText();
      }
    } catch {}

    const replacements: Record<string, string> = {
      date: defaultDate,
      time: defaultTime,
      clipboard: currentClipboard,
      name: 'there',
      subject: 'our project',
      ...placeholders,
    };

    for (const [key, val] of Object.entries(replacements)) {
      const reg = new RegExp(`\\{${key}\\}`, 'gi');
      result = result.replace(reg, val);
    }

    return {
      success: true,
      expandedText: result,
      snippet,
    };
  }

  private loadSnippets(): void {
    try {
      if (fs.existsSync(this.snippetsFile)) {
        const raw = fs.readFileSync(this.snippetsFile, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.snippets = parsed;
          return;
        }
      }
    } catch {}

    // First run initialization with defaults
    this.snippets = [...DEFAULT_SNIPPETS];
    this.persistSnippets();
  }

  private persistSnippets(): void {
    try {
      fs.writeFileSync(this.snippetsFile, JSON.stringify(this.snippets, null, 2), 'utf8');
    } catch {}
  }
}

export const snippetsService = new SnippetsService();
