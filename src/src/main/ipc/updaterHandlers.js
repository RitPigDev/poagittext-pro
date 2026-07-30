'use strict';

const { app } = require('electron');

/**
 * Real native auto-updates via electron-updater + GitHub Releases.
 *
 * The original browser build had to fake this with a "Google Apps
 * Script tells us the current build tag, then the browser's File
 * System Access API rewrites its own HTML file" hack — a clever
 * workaround for the fact that a web page can't normally replace
 * itself on disk. None of that is needed anymore: as a real desktop
 * app, poagitText Pro can just ship signed installers to GitHub
 * Releases and let electron-updater handle checking, downloading, and
 * installing updates the standard way, on every platform.
 *
 * electron-updater only does anything meaningful in a packaged build
 * (`app.isPackaged`) — in `npm start` / `npm run dev` it's a no-op
 * that reports "dev mode" back to the renderer instead of erroring.
 */
function register({ ipcMain, getFocusedWindow, store }) {
  let autoUpdater = null;
  let initError = null;

  try {
    // Deferred require: on non-packaged/dev runs we still want the app
    // to boot even if this optional dependency isn't installed yet.
    ({ autoUpdater } = require('electron-updater'));
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
  } catch (err) {
    initError = err;
  }

  const broadcastStatus = (status, extra = {}) => {
    const win = getFocusedWindow();
    if (win) win.webContents.send('updater:status', { status, ...extra });
  };

  if (autoUpdater) {
    autoUpdater.on('checking-for-update', () => broadcastStatus('checking'));
    autoUpdater.on('update-available', (info) =>
      broadcastStatus('available', { version: info.version, releaseNotes: info.releaseNotes })
    );
    autoUpdater.on('update-not-available', () => broadcastStatus('not-available'));
    autoUpdater.on('error', (err) => broadcastStatus('error', { message: err?.message || String(err) }));
    autoUpdater.on('download-progress', (progress) =>
      broadcastStatus('downloading', { percent: Math.round(progress.percent), bytesPerSecond: progress.bytesPerSecond })
    );
    autoUpdater.on('update-downloaded', (info) => broadcastStatus('downloaded', { version: info.version }));
  }

  ipcMain.handle('updater:check', async () => {
    if (!app.isPackaged) {
      broadcastStatus('dev-mode');
      return { success: false, reason: 'dev-mode' };
    }
    if (!autoUpdater) {
      return { success: false, reason: 'unavailable', error: initError?.message };
    }
    try {
      await autoUpdater.checkForUpdates();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('updater:download', async () => {
    if (!autoUpdater) return { success: false, reason: 'unavailable' };
    try {
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('updater:install', () => {
    if (!autoUpdater) return { success: false, reason: 'unavailable' };
    autoUpdater.quitAndInstall();
    return { success: true };
  });

  // Quiet startup check, respecting a user preference (default on).
  // Only ever *checks* automatically — downloading and installing
  // always require the person to click through the UI.
  if (store.get('autoCheckForUpdates', true) && app.isPackaged) {
    setTimeout(() => {
      autoUpdater?.checkForUpdates().catch(() => {});
    }, 4000);
  }
}

module.exports = { register };
