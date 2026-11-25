import { app, BrowserWindow, shell, ipcMain, Menu } from 'electron';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ensure single instance lock early in process lifecycle
let mainWindow = null;
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.warn('[Electron Main] Second instance launch detected. Quitting duplicate process.');
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    console.log('[Electron Main] Second instance attempted. Focusing primary window.');
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// Override userData path to ensure demo and full version use the same save directory
const appDataPath = app.getPath('appData');
const unifiedUserDataPath = join(appDataPath, 'palm-beach-save');
app.setPath('userData', unifiedUserDataPath);


// --- STEAM OVERLAY AND API INITIALIZATION ---
// 1. GPU Flags required for Steam Overlay to hook into Electron's rendering pipeline successfully
app.commandLine.appendSwitch('in-process-gpu');
app.commandLine.appendSwitch('disable-direct-composition');

// Prevent Chromium from pausing rendering or throttling (Steam Overlay requires consistent frame rendering)
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

// 2. Initialize Steamworks immediately early in the process lifecycle
// Note: It MUST be hooked before the main game window and graphics device are created.
let steamClient = null;
// PLACEHOLDER: 4307400 (full) and 4547980 (demo) are the BOCA RATON / Gold Coast Gambits App IDs.
// Palm Beach has no Steam App IDs yet. Lars supplies them in phase 2. Do not publish with these.
let steamAppId = 4307400; // PLACEHOLDER (Boca Raton full)

// Detect if we are running the Demo version
if (app.getName().toLowerCase().includes('demo')) {
  steamAppId = 4547980; // PLACEHOLDER (Boca Raton demo)
}

// Explicitly set Steam environment variables so steamworks.js/Steamworks SDK resolves correctly
process.env.SteamAppId = steamAppId.toString();
process.env.STEAM_APP_ID = steamAppId.toString();

try {
  const steamworks = require('steamworks.js');
  steamClient = steamworks.init(steamAppId); 
  console.log(`Steam API initialized successfully for App ID: ${steamAppId}`);
} catch (e) {
  console.warn("Steam API initialization skipped:", e.message);
}
// --- END STEAM SETUP ---

const isMac = process.platform === 'darwin' && !process.env.FORCE_WIN;

function createMacApplicationMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'delete' },
        { type: 'separator' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

const openExternalDetached = (url) => {
  let command, args;
  if (process.platform === 'win32') {
    command = 'cmd';
    args = ['/c', 'start', '""', url.replace(/&/g, '^&')];
  } else if (process.platform === 'darwin') {
    command = 'open';
    args = [url];
  } else {
    command = 'xdg-open';
    args = [url];
  }

  // Spawn completely detached from Steam/Electron's process tree
  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: { ...process.env, SteamAppId: undefined, SteamClientLaunch: undefined }
  });
  
  child.unref(); // Release node process reference
};

function logWindowsDiagnostic(trigger) {
  const windows = BrowserWindow.getAllWindows();
  console.log(`[Electron Diagnostic] (${trigger}) Active Windows Count: ${windows.length}`);
  windows.forEach((w, idx) => {
    console.log(`  [Win ${idx + 1}] ID: ${w.id}, Title: "${w.getTitle()}", Visible: ${w.isVisible()}, Minimized: ${w.isMinimized()}, Destroyed: ${w.isDestroyed()}`);
  });
}

// Register Top-Level IPC Handlers Once
ipcMain.on('app:quit', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.destroy(); // Force release renderer so Steam Overlay unhooks instantly
  }
  app.quit();
});

ipcMain.on('app:toggle-fullscreen', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isKiosk() || mainWindow.isFullScreen()) {
      mainWindow.setKiosk(false);
      mainWindow.setFullScreen(false);
    } else {
      mainWindow.setKiosk(true);
    }
  }
});

ipcMain.on('game:reload', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.reload();
  }
});

ipcMain.handle('app:get-path', (event, name) => {
  return app.getPath(name);
});

ipcMain.on('open-discord-overlay', (event, url) => {
  if (steamClient && steamClient.overlay) {
    try {
      steamClient.overlay.activateToWebPage(url);
      console.log(`Steam Overlay activated to Discord page: ${url}`);
    } catch (e) {
      console.error("Failed to activate Steam Overlay:", e);
      openExternalDetached(url);
    }
  } else {
    console.warn("Steam client not initialized, opening Discord link in external browser");
    openExternalDetached(url);
  }
});

ipcMain.on('steam:unlock-achievement', (event, achievementId) => {
  let success = false;
  if (steamClient && steamClient.achievement) {
    try {
      steamClient.achievement.activate(achievementId);
      console.log(`[Steamworks] Successfully unlocked achievement: ${achievementId}`);
      success = true;
    } catch (e) {
      console.error(`[Steamworks] Failed to unlock achievement ${achievementId}:`, e);
    }
  } else {
    console.warn(`[Steamworks] Steam client not initialized. Skipped unlocking: ${achievementId}`);
  }
  event.returnValue = success;
});

const createWindow = () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    return mainWindow;
  }

  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1280,
    minHeight: 800,
    autoHideMenuBar: true, // Hides the menu bar for a cleaner game look
    fullscreen: true,
    kiosk: true, // Absolute strictest fullscreen without OS menu bar on Mac & Windows
    backgroundColor: '#0a192f', // Prevents unpainted black taskbar thumbnail previews
    webPreferences: {
      nodeIntegration: true, // Required for window.require in renderer
      contextIsolation: false, // Required to expose electron require to window
      backgroundThrottling: false // Keep continuous execution during Alt+Tab focus changes
    }
  });

  mainWindow = win;

  if (isMac) {
    createMacApplicationMenu();
  } else {
    Menu.setApplicationMenu(null);
    win.setMenu(null);
  }

  // 1. Safe Reload Protection (Block F5, Cmd+R, Ctrl+R)
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown') {
      const { key, control, meta, shift, alt } = input;
      if (key === 'F5') {
        event.preventDefault();
      }
      if (key === 'r' && (control || meta)) {
        event.preventDefault();
      }

      // Block DevTools in Production
      if (app.isPackaged) {
        if (key === 'F12') {
          event.preventDefault();
        }
        if (key.toLowerCase() === 'i' && (control || meta) && (shift || alt)) {
          event.preventDefault();
        }
      } else {
        const isDevToolsShortcut =
          key === 'F12' ||
          (key.toLowerCase() === 'i' && (control || meta) && (shift || alt));

        if (isDevToolsShortcut) {
          event.preventDefault();
          if (win.webContents.isDevToolsOpened()) {
            win.webContents.closeDevTools();
          } else {
            win.webContents.openDevTools({ mode: 'detach' });
          }
        }
      }
    }
  });

  win.webContents.on('devtools-opened', () => {
    if (app.isPackaged) {
      win.webContents.closeDevTools();
    }
  });

  // Handle native window close button
  let isQuitting = false;
  win.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      win.webContents.send('window:close-request');
    }
  });

  win.on('closed', () => {
    mainWindow = null;
    logWindowsDiagnostic('closed');
  });

  win.on('focus', () => {
    logWindowsDiagnostic('focus');
  });

  win.on('blur', () => {
    logWindowsDiagnostic('blur');
  });

  // Strict Window Open Policy: NEVER allow opening secondary BrowserWindows
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      openExternalDetached(url);
    }
    return { action: 'deny' }; // Always deny auxiliary BrowserWindow creation
  });

  // Intercept any internal navigation to external web targets
  win.webContents.on('will-navigate', (event, navigationUrl) => {
    if (navigationUrl !== win.webContents.getURL()) {
      if (navigationUrl.startsWith('http://') || navigationUrl.startsWith('https://')) {
        event.preventDefault();
        openExternalDetached(navigationUrl);
      }
    }
  });

  // Load the built app from the dist folder
  win.loadFile(join(__dirname, 'dist', 'index.html'));

  logWindowsDiagnostic('createWindow');
  return win;
};

app.whenReady().then(() => {
  if (isMac) {
    createMacApplicationMenu();
  }
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});