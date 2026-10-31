import { app, BrowserWindow, shell } from 'electron';
import path from 'path';
import { registerIpcHandlers } from './ipc';
import { initLogger } from './backend/logger';
import { memoryService } from '../services/memory/memoryService';
import { remindersService } from '../services/reminders/remindersService';
import { systemHealthService } from '../services/system/healthService';

// Production builds write to a log file only; development keeps terminal output.
initLogger({ keepConsole: !app.isPackaged });

process.on('uncaughtException', (err) => {
  console.error('[FRIDAY] Uncaught exception:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FRIDAY] Unhandled rejection:', reason);
});

let mainWindow: BrowserWindow | null = null;
const getMainWindow = (): BrowserWindow | null => mainWindow;

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
/** Only the `dev:electron` script sets WAIT_ON_DEV; `npm start` uses the built files. */
const USE_DEV_SERVER = Boolean(process.env.WAIT_ON_DEV);

/** Only our own dev server may be navigated to in-app; everything else leaves the window. */
function isAllowedInAppNavigation(url: string): boolean {
  return USE_DEV_SERVER && url.startsWith(DEV_SERVER_URL);
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 460,
    height: 740,
    minWidth: 400,
    minHeight: 640,
    title: 'FRIDAY — AI Assistant',
    backgroundColor: '#0a0d14',
    frame: false, // Sleek modern frameless desktop companion
    titleBarStyle: 'hidden',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // The preload script requires the shared IPC channel module, which a fully
      // sandboxed preload cannot load; isolation is still enforced by contextIsolation.
      sandbox: false,
    },
  });

  registerIpcHandlers(getMainWindow);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Only the microphone is ever granted; every other permission request is denied.
  mainWindow.webContents.session.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      callback(permission === 'media');
    }
  );
  mainWindow.webContents.session.setPermissionCheckHandler((_webContents, permission) => {
    return permission === 'media';
  });

  // Open external links safely in system browser, not inside the Electron companion window
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Never let the companion window navigate away from the app itself.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isAllowedInAppNavigation(url)) return;
    event.preventDefault();
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url);
    }
  });

  const indexPath = path.join(__dirname, '../../dist-renderer/index.html');

  if (USE_DEV_SERVER) {
    mainWindow.loadURL(DEV_SERVER_URL).catch((err) => {
      console.error('[FRIDAY] Dev server unreachable, loading built files instead:', err.message);
      mainWindow?.loadFile(indexPath);
    });
  } else {
    mainWindow.loadFile(indexPath);
  }

  mainWindow.on('close', () => {
    console.log('[FRIDAY] Window close requested.');
  });

  mainWindow.on('closed', () => {
    console.log('[FRIDAY] Window closed.');
    mainWindow = null;
  });

  // Lifecycle diagnostics: these make silent renderer deaths visible in logs.
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[FRIDAY] Renderer process gone:', JSON.stringify(details));
  });
  mainWindow.webContents.on('unresponsive', () => {
    console.error('[FRIDAY] Renderer became unresponsive.');
  });
  mainWindow.webContents.on('did-fail-load', (_event, code, description, url) => {
    console.error(`[FRIDAY] Failed to load ${url} (${code}): ${description}`);
  });
}

app.on('child-process-gone', (_event, details) => {
  console.error('[FRIDAY] Child process gone:', JSON.stringify(details));
});

// <webview> is never used by FRIDAY, and embedding is a common escape hatch.
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });
});

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  // A second copy would open the same SQLite databases — focus the running app instead.
  console.log('[FRIDAY] Another instance is already running; exiting.');
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    // Required for Windows toast notifications and grouping.
    app.setAppUserModelId('com.friday.ai.companion');

    createWindow();

    // Open the memory database off the critical path so the first message is fast.
    memoryService.init().catch((err) => {
      console.error('[FRIDAY] Long-term memory unavailable:', err?.message);
    });

    remindersService.init().catch((err) => {
      console.error('[FRIDAY] Reminders unavailable:', err?.message);
    });

    // Lightweight health polling (5s) for the dashboard; no permissions required.
    systemHealthService.start();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  // Persist the final memory snapshot before the process exits.
  app.on('will-quit', () => {
    console.log('[FRIDAY] Shutting down backend services.');
    memoryService.flushNow();
    remindersService.shutdownNow();
    systemHealthService.stop();
  });

  app.on('window-all-closed', () => {
    console.log('[FRIDAY] All windows closed; quitting.');
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('before-quit', () => {
    console.log('[FRIDAY] before-quit fired.');
  });
}
