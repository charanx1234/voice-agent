import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import dotenv from 'dotenv';
import { FridaySettings } from '../../shared/types';

// Load .env if present in project root
dotenv.config();

const DEFAULT_SETTINGS: FridaySettings = {
  apiKey: process.env.GEMINI_API_KEY || '',
  hasCustomKey: Boolean(process.env.GEMINI_API_KEY),
  preferredLanguage: process.env.DEFAULT_LANGUAGE || 'te-IN',
  speechSpeed: 1.0,
  speechVolume: 1.0,
  voiceId: 'default',
  ttsProvider: 'auto',
  themeMode: 'auto',
  approvedFolders: [],
  requireToolConfirmations: {
    notes: false,
    folderSearch: true,
    webResearch: false,
    launchApps: true,
  },
  modelName: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
  soundMuted: false,
  memoryEnabled: true,
};

export class SettingsStore {
  private filePath: string;
  private settings: FridaySettings;

  constructor() {
    let userDataDir = '';
    try {
      userDataDir = app ? app.getPath('userData') : path.join(process.cwd(), '.data');
    } catch {
      userDataDir = path.join(process.cwd(), '.data');
    }

    if (!fs.existsSync(userDataDir)) {
      fs.mkdirSync(userDataDir, { recursive: true });
    }

    this.filePath = path.join(userDataDir, 'friday_settings.json');
    this.settings = this.load();
  }

  private load(): FridaySettings {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        // Automatically migrate deprecated model names
        let model = parsed.modelName || DEFAULT_SETTINGS.modelName;
        if (model === 'gemini-2.5-flash-lite' || model === 'gemini-1.5-flash' || model === 'gemini-1.5-pro') {
          model = 'gemini-3.5-flash-lite';
        }

        // v1 stored a fixed dark theme; keep those installs dark instead of flipping them.
        const legacyTheme = typeof parsed.theme === 'string' ? parsed.theme : undefined;
        const themeMode: FridaySettings['themeMode'] =
          parsed.themeMode === 'light' || parsed.themeMode === 'dark' || parsed.themeMode === 'auto'
            ? parsed.themeMode
            : legacyTheme
            ? 'dark'
            : 'auto';

        return {
          ...DEFAULT_SETTINGS,
          ...parsed,
          themeMode,
          modelName: model,
          // If env has key and stored doesn't, fallback to env
          apiKey: parsed.apiKey || process.env.GEMINI_API_KEY || '',
          hasCustomKey: Boolean(parsed.apiKey || process.env.GEMINI_API_KEY),
        };
      }
    } catch (err) {
      console.error('[SettingsStore] Failed to read settings, using defaults:', err);
    }
    return { ...DEFAULT_SETTINGS };
  }

  public getSettings(): FridaySettings {
    return { ...this.settings };
  }

  /**
   * Returns a sanitized copy of settings with the API key masked for frontend safety.
   */
  public getMaskedSettings(): FridaySettings {
    const rawKey = this.settings.apiKey || '';
    const maskedKey =
      rawKey.length > 8
        ? `${rawKey.slice(0, 4)}...${rawKey.slice(-4)}`
        : rawKey.length > 0
        ? '••••••••'
        : '';

    return {
      ...this.settings,
      apiKey: maskedKey,
      hasCustomKey: rawKey.trim().length > 0,
    };
  }

  public getRawApiKey(): string {
    return this.settings.apiKey || process.env.GEMINI_API_KEY || '';
  }

  public saveSettings(updates: Partial<FridaySettings>): void {
    // If updating apiKey, only change if non-empty and not masked
    if (updates.apiKey !== undefined) {
      if (updates.apiKey.includes('...')) {
        // user kept the masked string, do not overwrite the real key
        delete updates.apiKey;
      }
    }

    this.settings = {
      ...this.settings,
      ...updates,
      hasCustomKey: Boolean(
        (updates.apiKey !== undefined ? updates.apiKey : this.settings.apiKey) ||
          process.env.GEMINI_API_KEY
      ),
    };

    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.settings, null, 2), 'utf-8');
    } catch (err) {
      console.error('[SettingsStore] Failed to write settings:', err);
    }
  }
}

export const settingsStore = new SettingsStore();

