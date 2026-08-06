'use strict';

/**
 * preload.js
 * ------------------------------------------------------------------
 * Runs in an isolated context that has access to Node/Electron APIs,
 * but the renderer (index.html + its scripts) never gets direct
 * access to Node, `require`, or the filesystem. Everything the UI can
 * do is explicitly listed below and exposed as `window.poagit`.
 *
 * This is the modern, secure Electron pattern:
 *   contextIsolation: true, nodeIntegration: false, sandbox: false
 * combined with contextBridge — the renderer literally cannot reach
 * Node internals even if it were compromised by a malicious paste or
 * a rogue extension/snippet.
 * ------------------------------------------------------------------
 */

const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

/** Wraps ipcRenderer.on so callers get an unsubscribe function back. */
function on(channel, callback) {
  const listener = (_event, ...args) => callback(...args);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('poagit', {
  app: {
    getVersion: () => invoke('app:get-version'),
    getPlatformInfo: () => invoke('app:get-platform-info'),
    openExternal: (url) => invoke('app:open-external', url),
    relaunch: () => invoke('app:relaunch'),
    quit: () => invoke('app:quit'),
  },

  window: {
    minimize: () => invoke('window:minimize'),
    maximize: () => invoke('window:maximize'),
    unmaximize: () => invoke('window:unmaximize'),
    isMaximized: () => invoke('window:is-maximized'),
    close: () => invoke('window:close'),
    toggleFullscreen: () => invoke('window:toggle-fullscreen'),
    isFullscreen: () => invoke('window:is-fullscreen'),
    newWindow: () => invoke('window:new'),
    onMaximizedChange: (cb) => on('window:maximized-changed', cb),
    onFullscreenChange: (cb) => on('window:fullscreen-changed', cb),
    setCloseGuard: (dirty) => invoke('window:set-close-guard', dirty),
    confirmSaveThenClose: (success) => ipcRenderer.send('window:save-then-close-confirm', success),
  },

  fs: {
    newDocument: () => invoke('fs:new-document'),
    openDialog: () => invoke('fs:open-dialog'),
    openPath: (filePath) => invoke('fs:open-path', filePath),
    save: (payload) => invoke('fs:save', payload),
    saveAs: (payload) => invoke('fs:save-as', payload),
    exportAs: (payload) => invoke('fs:export-as', payload),
    getRecent: () => invoke('fs:get-recent'),
    clearRecent: () => invoke('fs:clear-recent'),
    pickImage: () => invoke('fs:pick-image'),
    pickFont: () => invoke('fs:pick-font'),
    /**
     * Resolve a real filesystem path from a File object dropped/dragged
     * onto the window. On the Electron 19 runtime this app targets (for
     * Windows 7 / macOS Sierra compatibility — see README), dropped File
     * objects still carry their real disk path on `.path`, exactly like
     * a browser's File object never does. (Electron 32+ replaced this
     * with a `webUtils.getPathForFile()` API for security reasons; if
     * this project is ever upgraded past Electron 32, swap this line
     * for that API instead.)
     */
    pathForFile: (file) => file?.path || null,
  },

  settings: {
    get: (key) => invoke('settings:get', key),
    set: (key, value) => invoke('settings:set', key, value),
    getAll: () => invoke('settings:get-all'),
  },

  net: {
    // Generic proxy for calling the poagitSync backend (login, sync,
    // backups, collaboration rooms, share feed) from the main process.
    // Doing it here instead of a renderer fetch() avoids browser CORS
    // entirely, since Node http(s) requests aren't subject to it.
    request: (payload) => invoke('net:request', payload),
  },

  updater: {
    check: () => invoke('updater:check'),
    download: () => invoke('updater:download'),
    install: () => invoke('updater:install'),
    onStatus: (cb) => on('updater:status', cb),
  },

  menu: {
    onAction: (cb) => on('menu:action', cb),
  },

  shell: {
    trashItem: (p) => invoke('shell:trash-item', p),
  },
});
