import { screenUnderstandingService } from '../screen/screenUnderstandingService';
import { executeScreenControlTool } from '../agent/screenControlTools';
import { notesStore } from '../storage/notesStore';
import { remindersService } from '../reminders/remindersService';
import { memoryService } from '../memory/memoryService';
import { websiteAccessibilityService } from '../accessibility/websiteAccessibilityService';
import { ALLOWED_APPLICATIONS, executeAppShortcutsTool } from '../agent/appShortcutsTool';
import { settingsStore } from '../storage/settingsStore';
import { windowsVolumeService } from '../system/windowsVolumeService';
import { windowsBrightnessService } from '../system/windowsBrightnessService';
import { timeDateService } from '../system/timeDateService';
import { weatherService } from '../weather/weatherService';
import { desktopControlService } from '../desktop/desktopControlService';

export type CapabilityCategory =
  | 'voice'
  | 'screen'
  | 'desktop'
  | 'memory'
  | 'productivity'
  | 'ai'
  | 'accessibility';

export interface FridayCapability {
  id: string;
  name: string;
  description: string;
  category: CapabilityCategory;
  icon: string;
  quickActionPrompt?: string;
  petAccessible: boolean;
  dashboardAccessible: boolean;
  execute?: (params?: any) => Promise<any>;
}

export class CapabilityRegistry {
  private capabilities = new Map<string, FridayCapability>();

  constructor() {
    this.registerCoreCapabilities();
  }

  private registerCoreCapabilities(): void {
    // 1. Screen Understanding & Capture
    this.register({
      id: 'screen_understanding',
      name: 'Screen Understanding',
      description: 'Capture active screen or windows, identify UI elements, and analyze visual content.',
      category: 'screen',
      icon: 'Monitor',
      quickActionPrompt: 'Analyze my current screen and tell me what you see.',
      petAccessible: true,
      dashboardAccessible: true,
      execute: async (opts) => screenUnderstandingService.captureScreen(opts),
    });

    // 2. Desktop Control & Application Shortcuts
    this.register({
      id: 'app_shortcuts',
      name: 'Desktop App Control',
      description: 'Launch allowed applications like Spotify, Chrome, Terminal, Calculator, and folders.',
      category: 'desktop',
      icon: 'Grid',
      quickActionPrompt: 'Open Spotify and play my favorite playlist.',
      petAccessible: true,
      dashboardAccessible: true,
      execute: async ({ appName }) => executeAppShortcutsTool('launchApplication', { appName }),
    });

    // 3. Smart Notes
    this.register({
      id: 'notes',
      name: 'Smart Notes',
      description: 'Capture ideas, snippets, and notes with full-text search and storage.',
      category: 'productivity',
      icon: 'FileText',
      quickActionPrompt: 'Take a note:',
      petAccessible: true,
      dashboardAccessible: true,
      execute: async ({ action, ...args }) => {
        if (action === 'save') return notesStore.saveNote(args.title, args.content);
        if (action === 'delete') return notesStore.deleteNote(args.id);
        return notesStore.listNotes();
      },
    });

    // 4. Reminders
    this.register({
      id: 'reminders',
      name: 'Smart Reminders',
      description: 'Schedule reminders with natural language, recurring timers, and desktop notifications.',
      category: 'productivity',
      icon: 'Bell',
      quickActionPrompt: 'Remind me in 15 minutes to take a break.',
      petAccessible: true,
      dashboardAccessible: true,
      execute: async ({ action, ...args }) => {
        if (action === 'add') return remindersService.create(args.text, args.dueTime || 'in 15 minutes');
        if (action === 'complete') return remindersService.complete(args.id);
        if (action === 'delete') return remindersService.remove(args.id);
        return remindersService.list(args.includeDone);
      },
    });

    // 5. Long-Term Conversation Memory
    this.register({
      id: 'long_term_memory',
      name: 'Long-Term Memory',
      description: 'Stores user preferences, facts, and project contexts across sessions in SQLite.',
      category: 'memory',
      icon: 'Brain',
      quickActionPrompt: 'What do you remember about me and my current projects?',
      petAccessible: true,
      dashboardAccessible: true,
      execute: async ({ action, ...args }) => {
        if (action === 'search') return memoryService.search(args.query, args.limit);
        if (action === 'create') return memoryService.create(args.payload);
        return memoryService.list(args.options);
      },
    });

    // 6. Website Accessibility Assistant
    this.register({
      id: 'website_accessibility',
      name: 'Website Accessibility',
      description: 'Navigate web pages, read articles aloud, summarize content, and click controls.',
      category: 'accessibility',
      icon: 'Globe',
      quickActionPrompt: 'Read the main heading and content of the current webpage.',
      petAccessible: true,
      dashboardAccessible: true,
      execute: async ({ command, url }) => {
        if (url) return websiteAccessibilityService.openUrl(url);
        if (command) return websiteAccessibilityService.executeNaturalCommand(command);
        return websiteAccessibilityService.getState();
      },
    });

    // 7. Voice Conversation & Interruption
    this.register({
      id: 'voice_pipeline',
      name: 'Lossless Linear Voice Engine',
      description: '16kHz PCM WAV audio capture, Silero-style energy VAD, and bidirectional interruption.',
      category: 'voice',
      icon: 'Mic',
      quickActionPrompt: 'Start voice conversation',
      petAccessible: true,
      dashboardAccessible: true,
    });

    // 8. Personality Modes
    this.register({
      id: 'personality_modes',
      name: 'Personality Modes',
      description: 'Switch between Simple (succinct), Moderate (helpful), and Roast (witty banter) modes.',
      category: 'ai',
      icon: 'Sparkles',
      petAccessible: true,
      dashboardAccessible: true,
      execute: async ({ mode }) => {
        settingsStore.saveSettings({ personalityMode: mode });
        return { success: true, mode };
      },
    });

    // 9. Windows Volume Control
    this.register({
      id: 'windows_volume',
      name: 'Windows Volume Control',
      description: 'Control Windows master volume, set exact percentages, mute and unmute audio.',
      category: 'desktop',
      icon: 'Volume2',
      quickActionPrompt: 'Set volume to 50 percent.',
      petAccessible: true,
      dashboardAccessible: true,
      execute: async ({ action, level, delta }: any = {}) => {
        if (action === 'set') return windowsVolumeService.setVolume(level);
        if (action === 'increase') return windowsVolumeService.adjustVolume(delta || 10);
        if (action === 'decrease') return windowsVolumeService.adjustVolume(-(delta || 10));
        if (action === 'mute') return windowsVolumeService.setMute(true);
        if (action === 'unmute') return windowsVolumeService.setMute(false);
        return windowsVolumeService.getVolume();
      },
    });

    // 10. Windows Brightness Control
    this.register({
      id: 'windows_brightness',
      name: 'Windows Brightness Control',
      description: 'Adjust actual laptop display brightness, set exact levels, or dim the display.',
      category: 'desktop',
      icon: 'Sun',
      quickActionPrompt: 'Set screen brightness to 70 percent.',
      petAccessible: true,
      dashboardAccessible: true,
      execute: async ({ action, level, delta }: any = {}) => {
        if (action === 'set') return windowsBrightnessService.setBrightness(level);
        if (action === 'increase') return windowsBrightnessService.adjustBrightness(delta || 10);
        if (action === 'decrease') return windowsBrightnessService.adjustBrightness(-(delta || 10));
        return windowsBrightnessService.getBrightness();
      },
    });

    // 11. Time & Date Awareness
    this.register({
      id: 'time_date',
      name: 'Time & Date Awareness',
      description: 'Accurate local system clock, date, timezone, future calculations, and countdowns.',
      category: 'productivity',
      icon: 'Clock',
      quickActionPrompt: 'What time is it right now?',
      petAccessible: true,
      dashboardAccessible: true,
      execute: async ({ queryType, targetTime, hoursOffset, minutesOffset }: any = {}) => {
        if (queryType === 'future_time') return timeDateService.calculateRelativeTime(hoursOffset, minutesOffset);
        if (queryType === 'time_until') return timeDateService.calculateTimeUntil(targetTime || '6 PM');
        return timeDateService.getNow();
      },
    });

    // 12. Live Weather Information
    this.register({
      id: 'live_weather',
      name: 'Live Weather & Forecasts',
      description: 'Real-time temperature, rain probability, humidity, wind, and forecast conditions.',
      category: 'productivity',
      icon: 'CloudRain',
      quickActionPrompt: "What's the weather like today?",
      petAccessible: true,
      dashboardAccessible: true,
      execute: async ({ city, timeframe }: any = {}) => weatherService.getWeather({ city, timeframe }),
    });

    // 13. Real Mouse & Cursor Control
    this.register({
      id: 'mouse_control',
      name: 'Windows Mouse & Cursor Control',
      description: 'Move system cursor, click UI buttons, double-click, right-click, and scroll.',
      category: 'desktop',
      icon: 'MousePointer',
      quickActionPrompt: 'Move mouse to center of screen.',
      petAccessible: true,
      dashboardAccessible: true,
      execute: async (opts: any = {}) => desktopControlService.executeMouseAction(opts),
    });
  }

  public register(capability: FridayCapability): void {
    this.capabilities.set(capability.id, capability);
  }

  public get(id: string): FridayCapability | undefined {
    return this.capabilities.get(id);
  }

  public listAll(): FridayCapability[] {
    return Array.from(this.capabilities.values());
  }

  public listPetCapabilities(): FridayCapability[] {
    return Array.from(this.capabilities.values()).filter((c) => c.petAccessible);
  }

  public async execute(id: string, params?: any): Promise<any> {
    const cap = this.capabilities.get(id);
    if (!cap) {
      throw new Error(`Capability "${id}" not found.`);
    }
    if (!cap.execute) {
      return { supported: true, name: cap.name };
    }
    return await cap.execute(params);
  }
}

export const capabilityRegistry = new CapabilityRegistry();
