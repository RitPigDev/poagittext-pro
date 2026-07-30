'use strict';

const { app, shell } = require('electron');

function register({ ipcMain, BrowserWindow, createWindow, windowState, store }) {
  const winOf = (event) => BrowserWindow.fromWebContents(event.sender);

  ipcMain.handle('window:minimize', (event) => winOf(event)?.minimize());
  ipcMain.handle('window:maximize', (event) => winOf(event)?.maximize());
  ipcMain.handle('window:unmaximize', (event) => winOf(event)?.unmaximize());
  ipcMain.handle('window:is-maximized', (event) => winOf(event)?.isMaximized() ?? false);
  ipcMain.handle('window:is-fullscreen', (event) => winOf(event)?.isFullScreen() ?? false);
  ipcMain.handle('window:close', (event) => winOf(event)?.close());
  ipcMain.handle('window:new', () => createWindow());

  ipcMain.handle('window:toggle-fullscreen', (event) => {
    const win = winOf(event);
    if (!win) return false;
    const next = !win.isFullScreen();
    win.setFullScreen(next);
    return next;
  });

  ipcMain.handle('window:set-close-guard', (event, isDirty) => {
    const win = winOf(event);
    if (!win) return;
    const state = windowState.get(win.id) || {};
    state.isDirty = !!isDirty;
    windowState.set(win.id, state);
  });

  ipcMain.handle('app:get-version', () => app.getVersion());

  ipcMain.handle('app:get-platform-info', () => ({
    platform: process.platform,
    arch: process.arch,
    release: process.getSystemVersion ? process.getSystemVersion() : '',
    isPackaged: app.isPackaged,
  }));

  ipcMain.handle('app:open-external', (event, url) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      shell.openExternal(url);
    }
  });

  ipcMain.handle('app:relaunch', () => {
    app.relaunch();
    app.exit(0);
  });

  ipcMain.handle('app:quit', () => app.quit());

  ipcMain.handle('shell:trash-item', async (event, targetPath) => {
    try {
      await shell.trashItem(targetPath);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('settings:get', (event, key) => store.get(key));
  ipcMain.handle('settings:get-all', () => store.get());
  ipcMain.handle('settings:set', (event, key, value) => {
    store.set(key, value);
    return { success: true };
  });
}

module.exports = { register };
