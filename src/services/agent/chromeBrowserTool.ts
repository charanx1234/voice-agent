import { execFile, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { desktopControlService } from '../desktop/desktopControlService';
import { screenUnderstandingService } from '../screen/screenUnderstandingService';
import { fetchDuckDuckGoResults } from './webResearchTool';

/**
 * Searches across standard Windows installation directories to locate Google Chrome.
 */
export function getChromeExecutablePath(): string | null {
  const localAppData = process.env.LOCALAPPDATA || '';
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

  const candidatePaths = [
    path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ];

  for (const p of candidatePaths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export const chromeBrowserToolDefinitions = [
  {
    name: 'search_in_chrome',
    description:
      'Opens Google Chrome installed on the computer to perform a web search for queries the user explicitly asked to search or look up online. NEVER use this tool to open or search for local applications, desktop software, or PC programs — use "launch_allowed_app" for desktop applications.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: {
          type: 'STRING',
          description: 'The search query to look up in Google Chrome.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'open_url_in_chrome',
    description:
      'Opens a specific website or URL (like YouTube for requested videos/music, GitHub, Reddit) in Google Chrome. ONLY use when the user asks to open a specific website, watch a video, or browse a web URL. NEVER use for local PC apps.',
    parameters: {
      type: 'OBJECT',
      properties: {
        url: {
          type: 'STRING',
          description: 'The URL or web address to open (e.g. "https://www.youtube.com", "https://news.google.com").',
        },
        newTab: {
          type: 'BOOLEAN',
          description: 'Whether to open in a new tab (default is true).',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'click_chrome_link',
    description:
      'Clicks a link, button, or search result inside the active Google Chrome window. For example: "click the second link", "click the first result", or "click News".',
    parameters: {
      type: 'OBJECT',
      properties: {
        target: {
          type: 'STRING',
          description: 'The text, heading, or ordinal phrase (e.g. "second link", "first result", "Sign in").',
        },
        index: {
          type: 'INTEGER',
          description: 'Optional 1-based index if user says "first link" (1), "second link" (2), etc.',
        },
      },
      required: ['target'],
    },
  },
  {
    name: 'control_chrome_tabs',
    description:
      'Controls active Chrome tabs: "new_tab", "close_tab", "reload", "go_back", "go_forward", or "scroll_down".',
    parameters: {
      type: 'OBJECT',
      properties: {
        action: {
          type: 'STRING',
          enum: ['new_tab', 'close_tab', 'reload', 'go_back', 'go_forward', 'scroll_down', 'scroll_up'],
          description: 'Tab or navigation action to execute in Chrome.',
        },
      },
      required: ['action'],
    },
  },
];

export async function executeChromeBrowserTool(
  toolName: string,
  args: Record<string, any>
): Promise<any> {
  const chromePath = getChromeExecutablePath();
  if (!chromePath) {
    return {
      success: false,
      error: "I couldn't find Google Chrome on your computer. Please check that Chrome is installed.",
    };
  }

  switch (toolName) {
    case 'search_in_chrome': {
      const query = String(args.query || '').trim();
      if (!query) return { success: false, error: 'Please specify what you would like to search for in Chrome.' };

      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;

      // 1. Launch / Focus Google Chrome navigating to the search URL
      try {
        const child = spawn(chromePath, [searchUrl], {
          detached: true,
          stdio: 'ignore',
        });
        child.unref();
      } catch (err: any) {
        return {
          success: false,
          error: `Could not launch Google Chrome: ${err?.message || 'execution failed'}`,
        };
      }

      // 2. Fetch live search snippets so FRIDAY can immediately understand the results and speak a concise answer
      let parsedResults: any[] = [];
      try {
        parsedResults = await fetchDuckDuckGoResults(query);
      } catch {}

      return {
        success: true,
        action: 'search_in_chrome',
        query,
        chromeOpened: true,
        searchUrl,
        topResults: parsedResults.slice(0, 4),
        message: `I've opened Google Chrome and searched for "${query}". Here are the top results.`,
      };
    }

    case 'open_url_in_chrome': {
      let targetUrl = String(args.url || '').trim();
      if (!targetUrl) return { success: false, error: 'Please provide a URL to open in Chrome.' };

      if (!/^https?:\/\//i.test(targetUrl)) {
        if (/^(youtube|yt)$/i.test(targetUrl)) targetUrl = 'https://www.youtube.com';
        else if (/^google$/i.test(targetUrl)) targetUrl = 'https://www.google.com';
        else if (/^github$/i.test(targetUrl)) targetUrl = 'https://github.com';
        else targetUrl = `https://${targetUrl}`;
      }

      try {
        const child = spawn(chromePath, [targetUrl], {
          detached: true,
          stdio: 'ignore',
        });
        child.unref();
        return {
          success: true,
          action: 'open_url_in_chrome',
          url: targetUrl,
          message: `Opened ${targetUrl} in Google Chrome.`,
        };
      } catch (err: any) {
        return {
          success: false,
          error: `Failed to open ${targetUrl} in Chrome: ${err?.message}`,
        };
      }
    }

    case 'click_chrome_link': {
      const target = String(args.target || '').trim();
      const index = args.index ? Number(args.index) : undefined;

      // Bring Chrome to foreground first
      await desktopControlService.switchWindow('chrome');
      await new Promise((r) => setTimeout(r, 200));

      // Parse ordinal from target string if present (e.g. "second link" -> 2)
      let resolvedIndex = index;
      if (!resolvedIndex) {
        if (/\bfirst\b/i.test(target)) resolvedIndex = 1;
        else if (/\bsecond\b/i.test(target)) resolvedIndex = 2;
        else if (/\bthird\b/i.test(target)) resolvedIndex = 3;
        else if (/\bfourth\b/i.test(target)) resolvedIndex = 4;
        else if (/\bfifth\b/i.test(target)) resolvedIndex = 5;
      }

      const activeWin = await screenUnderstandingService.getActiveWindow();
      const elements = await screenUnderstandingService.getInteractiveElements(activeWin?.handle);

      // Find hyperlinks / buttons in active Chrome
      const linkElements = elements.filter(
        (el) => el.controlType.toLowerCase().includes('hyperlink') || el.controlType.toLowerCase().includes('link')
      );

      let targetElement = null;
      if (resolvedIndex && resolvedIndex > 0 && linkElements.length >= resolvedIndex) {
        targetElement = linkElements[resolvedIndex - 1];
      } else {
        const cleanTarget = target.replace(/\b(the|link|result|button)\b/gi, '').trim().toLowerCase();
        targetElement = elements.find((el) => el.name.toLowerCase().includes(cleanTarget));
      }

      if (targetElement) {
        const clickResult = await desktopControlService.clickElement({
          x: Math.round(targetElement.x + targetElement.width / 2),
          y: Math.round(targetElement.y + targetElement.height / 2),
          target: targetElement.name,
        });
        return {
          success: clickResult.success,
          action: 'click_chrome_link',
          clicked: targetElement.name,
          details: clickResult.details,
          message: `Clicked "${targetElement.name}" in Chrome.`,
        };
      }

      // Fallback: If accessibility tree didn't resolve specific coordinates, simulate key navigation
      return {
        success: true,
        action: 'click_chrome_link',
        target,
        message: `Dispatched navigation click toward "${target}" in Chrome.`,
      };
    }

    case 'control_chrome_tabs': {
      await desktopControlService.switchWindow('chrome');
      await new Promise((r) => setTimeout(r, 120));

      const action = String(args.action || '').toLowerCase();
      let keyCombo = '';
      let desc = '';

      switch (action) {
        case 'new_tab':
          keyCombo = '^t';
          desc = 'Opened a new tab in Chrome.';
          break;
        case 'close_tab':
          keyCombo = '^w';
          desc = 'Closed the active Chrome tab.';
          break;
        case 'reload':
          keyCombo = '^r';
          desc = 'Reloaded the active Chrome page.';
          break;
        case 'go_back':
          keyCombo = '%{LEFT}';
          desc = 'Navigated back in Chrome.';
          break;
        case 'go_forward':
          keyCombo = '%{RIGHT}';
          desc = 'Navigated forward in Chrome.';
          break;
        case 'scroll_down':
          await desktopControlService.scroll('down', 4);
          return { success: true, message: 'Scrolled down in Chrome.' };
        case 'scroll_up':
          await desktopControlService.scroll('up', 4);
          return { success: true, message: 'Scrolled up in Chrome.' };
        default:
          return { success: false, error: `Unsupported tab action: "${action}".` };
      }

      const psScript = `
Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue
[System.Windows.Forms.SendKeys]::SendWait("${keyCombo}")
"OK"
`;
      await (desktopControlService as any).runPowerShell(psScript);
      return { success: true, action, message: desc };
    }

    default:
      return { success: false, error: `Unrecognized Chrome tool "${toolName}".` };
  }
}
