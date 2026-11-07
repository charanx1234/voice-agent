import { app, BrowserWindow, shell, screen, Tray, Menu, nativeImage } from 'electron';
import path from 'path';
import { registerIpcHandlers } from './ipc';
import { initLogger } from './backend/logger';
import { memoryService } from '../services/memory/memoryService';
import { remindersService } from '../services/reminders/remindersService';
import { systemHealthService } from '../services/system/healthService';
import { geminiService } from '../services/ai/gemini';
import { neuralVoiceService } from '../services/voice/neuralVoice';
import { settingsStore } from '../services/storage/settingsStore';

app.setName('friday-ai-companion');

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

let petWindow: BrowserWindow | null = null;
const getPetWindow = (): BrowserWindow | null => petWindow;

let isQuitting = false;
let tray: Tray | null = null;

function createTray(): void {
  try {
    const iconPath = path.join(__dirname, '../../src/renderer/public/assets/friday-pet.png');
    let icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) {
      const altPath = path.join(__dirname, '../renderer/assets/friday-pet.png');
      icon = nativeImage.createFromPath(altPath);
    }
    const trayIcon = icon.resize({ width: 16, height: 16 });
    tray = new Tray(trayIcon);
    tray.setToolTip('FRIDAY — Desktop AI Assistant');

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Open FRIDAY Dashboard',
        click: () => {
          if (!mainWindow || mainWindow.isDestroyed()) {
            createWindow();
          } else {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
          }
        },
      },
      {
        label: 'Toggle Desktop Pet',
        click: () => {
          if (!petWindow || petWindow.isDestroyed()) {
            createPetWindow();
          } else if (petWindow.isVisible()) {
            petWindow.hide();
          } else {
            petWindow.show();
          }
        },
      },
      { type: 'separator' },
      {
        label: 'Exit FRIDAY Completely',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]);

    tray.setContextMenu(contextMenu);
    tray.on('double-click', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      } else {
        createWindow();
      }
    });
  } catch (err: any) {
    console.warn('[FRIDAY] Tray setup warning:', err?.message);
  }
}

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
/** Only the `dev:electron` script sets WAIT_ON_DEV; `npm start` uses the built files. */
const USE_DEV_SERVER = Boolean(process.env.WAIT_ON_DEV);

/** Only our own dev server may be navigated to in-app; everything else leaves the window. */
function isAllowedInAppNavigation(url: string): boolean {
  return USE_DEV_SERVER && url.startsWith(DEV_SERVER_URL);
}

function createPetWindow(): void {
  const settings = settingsStore.getSettings();
  if (settings.desktopPetEnabled === false) return;

  const primaryDisplay = screen.getPrimaryDisplay();
  const { workArea } = primaryDisplay;
  const savedPos = settings.petPosition;
  const initialX = savedPos?.x ?? Math.round(workArea.x + workArea.width - 230);
  const initialY = savedPos?.y ?? Math.round(workArea.y + workArea.height - 250);

  petWindow = new BrowserWindow({
    width: 200,
    height: 220,
    x: initialX,
    y: initialY,
    title: 'FRIDAY Pet',
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  });

  petWindow.setAlwaysOnTop(true, 'screen-saver');

  petWindow.once('ready-to-show', () => {
    petWindow?.show();
  });

  // Guarantee visibility even if ready-to-show is delayed by graphics acceleration
  setTimeout(() => {
    if (petWindow && !petWindow.isDestroyed() && !petWindow.isVisible()) {
      petWindow.show();
    }
  }, 1200);

  petWindow.on('moved', () => {
    if (!petWindow || petWindow.isDestroyed()) return;
    const [x, y] = petWindow.getPosition();
    settingsStore.saveSettings({ petPosition: { x, y } });
  });

  const indexPath = path.join(__dirname, '../../dist-renderer/index.html');
  if (USE_DEV_SERVER) {
    petWindow.loadURL(`${DEV_SERVER_URL}#pet`).catch((err) => {
      console.error('[FRIDAY] Pet dev server failed, loading file:', err.message);
      petWindow?.loadFile(indexPath, { hash: 'pet' });
    });
  } else {
    petWindow.loadFile(indexPath, { hash: 'pet' });
  }

  petWindow.on('closed', () => {
    petWindow = null;
  });
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
      backgroundThrottling: false,
    },
  });

  registerIpcHandlers(getMainWindow, getPetWindow);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Guarantee window is visible even if ready-to-show is delayed
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show();
      mainWindow.focus();
    }
  }, 1200);

  // Only the microphone is ever granted; every other permission request is denied.
  mainWindow.webContents.session.setPermissionRequestHandler(
    (_webContents, permission, callback, details) => {
      const mediaDetails = (details || {}) as Electron.MediaAccessPermissionRequest;
      const isMic =
        (permission as string) === 'microphone' ||
        (permission === 'media' &&
          (!mediaDetails.mediaTypes ||
            (mediaDetails.mediaTypes.includes('audio') && !mediaDetails.mediaTypes.includes('video'))));
      console.log(`[FRIDAY Main] Permission request: permission=${permission}, granted=${isMic}`);
      callback(isMic);
    }
  );
  mainWindow.webContents.session.setPermissionCheckHandler((_webContents, permission, _origin, details) => {
    return (permission as string) === 'microphone' || (permission === 'media' && details?.mediaType !== 'video');
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

  mainWindow.on('close', (event) => {
    if (!isQuitting && petWindow && !petWindow.isDestroyed()) {
      event.preventDefault();
      mainWindow?.hide();
      return;
    }
    console.log('[FRIDAY] Window close requested, cancelling active requests and synthesis...');
    try {
      geminiService.cancelRequest();
      neuralVoiceService.cancelAll();
    } catch (err: any) {
      console.warn('[FRIDAY] Teardown warning on window close:', err?.message);
    }
  });

  mainWindow.on('closed', () => {
    console.log('[FRIDAY] Window closed.');
    mainWindow = null;
  });

  // Forward renderer console messages to terminal so errors are immediately visible
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[Renderer Console] [level=${level}] ${message} (${sourceId}:${line})`);
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
    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow();
    } else {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    // Required for Windows toast notifications and grouping.
    app.setAppUserModelId('com.friday.ai.companion');

    createWindow();
    createPetWindow();
    createTray();

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
    isQuitting = true;
  });
}
