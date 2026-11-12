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
    mainWindow.loadURL(devServerUrl);
    if (process.env.OPEN_DEVTOOLS) {
      mainWindow.webContents.openDevTools({ mode: 'bottom' });
    }
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'));
  }
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
