const { contextBridge, ipcRenderer } = require('electron');

// Exposes a window.api surface matching the engine contract 1:1 so the real
// engine swap-in (engine-m1) requires no renderer-side changes.
contextBridge.exposeInMainWorld('api', {
  getTasks: () => ipcRenderer.invoke('tasks:getAll'),
  createTask: (input) => ipcRenderer.invoke('tasks:create', input),
  updateTask: (id, patch) => ipcRenderer.invoke('tasks:update', id, patch),
  deleteTask: (id) => ipcRenderer.invoke('tasks:delete', id),
  completeTask: (id) => ipcRenderer.invoke('tasks:complete', id),
  getPlayerState: () => ipcRenderer.invoke('player:getState'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),

  // Subscribe to a forwarded engine event; returns an unsubscribe function.
  on: (eventName, handler) => {
    const channel = `engine:${eventName}`;
    const listener = (_evt, payload) => handler(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
});
