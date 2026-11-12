// Electron main process entry point.
//
// NOTE (temporary, M1 scaffold): the real engine (CRUD + XP/streak/achievement
// logic + event emitter) is owned by @game-logic-engineer on branch `engine-m1`
// per the locked architecture decision (single writer to the data file, engine
// runs in main process, UI talks to it over IPC only).
//
// Until that branch merges, this file wires IPC to `./mockEngine.cjs`, a
// drop-in stand-in that implements the EXACT same function signatures and
// event names from the agreed contract, so the UI can be built/tested against
// a real IPC round-trip now instead of waiting. Swapping to the real engine
// should be a one-line require() change below — nothing in the UI should need
// to change if the contract is honored.
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const engine = require('./mockEngine.cjs');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    backgroundColor: '#F4E8D0', // parchment, avoid white flash on load
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
  if (!app.isPackaged) {
    loadDevServerWithRetry(devServerUrl);
    if (process.env.OPEN_DEVTOOLS) {
      mainWindow.webContents.openDevTools({ mode: 'bottom' });
    }
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'));
  }
}

// Cheap insurance flagged by QA: if Electron races Vite's dev-server startup
// (e.g. a packaging/CI path that skips the `wait-on tcp:5173` guard in the
// `dev` script), loadURL fails silently onto a blank Chrome error page with
// no recovery. Retry a few times with a short backoff instead.
function loadDevServerWithRetry(url, attempt = 1) {
  const MAX_ATTEMPTS = 10;
  const RETRY_DELAY_MS = 300;

  mainWindow.loadURL(url).catch(() => {
    // loadURL's promise rejection is handled by did-fail-load below; this
    // catch just prevents an unhandled rejection warning.
  });

  const onFailLoad = (_evt, errorCode) => {
    if (errorCode === -3) return; // ERR_ABORTED (e.g. a legit navigation away)
    mainWindow.webContents.removeListener('did-fail-load', onFailLoad);
    if (attempt >= MAX_ATTEMPTS) {
      console.error(`[main] dev server at ${url} unreachable after ${MAX_ATTEMPTS} attempts`);
      return;
    }
    setTimeout(() => loadDevServerWithRetry(url, attempt + 1), RETRY_DELAY_MS);
  };
  mainWindow.webContents.once('did-fail-load', onFailLoad);
}

// ---- IPC: CRUD (request/response) ----
ipcMain.handle('tasks:getAll', () => engine.getAllTasks());
ipcMain.handle('tasks:create', (_evt, input) => engine.createTask(input));
ipcMain.handle('tasks:update', (_evt, id, patch) => engine.updateTask(id, patch));
ipcMain.handle('tasks:delete', (_evt, id) => engine.deleteTask(id));
ipcMain.handle('tasks:complete', (_evt, id) => engine.completeTask(id));
ipcMain.handle('player:getState', () => engine.getPlayerState());
ipcMain.handle('settings:get', () => engine.getSettings());
ipcMain.handle('settings:update', (_evt, patch) => engine.updateSettings(patch));

// ---- IPC: engine events forwarded to renderer (fire-and-forget, push) ----
const forwardedEvents = [
  'onTaskComplete',
  'onLevelUp',
  'onStreakIncremented',
  'onStreakShieldConsumed',
  'onStreakBroken',
  'onAchievementUnlocked',
];

function wireEventForwarding() {
  forwardedEvents.forEach((eventName) => {
    engine.on(eventName, (payload) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(`engine:${eventName}`, payload);
      }
    });
  });
}

app.whenReady().then(() => {
  engine.init();
  wireEventForwarding();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
