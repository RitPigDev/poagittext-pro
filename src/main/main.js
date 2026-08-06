'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');

const { Store } = require('./store');
const { buildMenu } = require('./menu');
const fileHandlers = require('./ipc/fileHandlers');
const netHandlers = require('./ipc/netHandlers');
const windowHandlers = require('./ipc/windowHandlers');
const updaterHandlers = require('./ipc/updaterHandlers');

const isDev = process.argv.includes('--dev');
const isMac = process.platform === 'darwin';

// ---------------------------------------------------------------------
// Single-instance lock — a second launch just focuses the first window
// instead of opening a duplicate app, matching normal desktop-app
// etiquette on all three platforms.
// ---------------------------------------------------------------------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  return;
}

/** windowId -> { isDirty, forceClose } — used by the "unsaved changes" close guard. */
const windowState = new Map();
const windows = new Set();
/** windowId -> callback to run once the renderer confirms a "save before close" attempt. */
const pendingSaveBeforeClose = new Map();

const store = new Store({
  dir: app.getPath('userData'),
  name: 'settings',
  defaults: {
    theme: 'poagit-classic',
    fontFamily: 'Inter',
    editorZoom: 100,
    sidebarVisible: true,
    lineNumbers: false,
    autoCheckForUpdates: true,
    windowBounds: { width: 1360, height: 860 },
    recentFiles: [],
  },
});

function getFocusedWindow() {
  return BrowserWindow.getFocusedWindow() || [...windows][0] || null;
}

function createWindow() {
  const bounds = store.get('windowBounds', { width: 1360, height: 860 });

  const win = new BrowserWindow({
    ...bounds,
    minWidth: 880,
    minHeight: 560,
    show: false,
    backgroundColor: '#1b0f2e',
    title: 'poagitText Pro',
    icon: path.join(__dirname, '..', '..', 'build', 'icon.png'),
    // Custom titlebar on Windows/Linux; native traffic-light inset on macOS
    // so the app still feels 100% at home on every platform.
    frame: false,
    titleBarStyle: isMac ? 'hiddenInset' : undefined,
    trafficLightPosition: isMac ? { x: 18, y: 18 } : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: true,
      // Powers the in-app "Browser" tab (src/renderer/js/browser.js). The
      // <webview> guest is a separate, unprivileged process/context — it
      // gets none of the preload's window.poagit bridge and no Node APIs,
      // same as any ordinary web page.
      webviewTag: true,
    },
  });

  windowState.set(win.id, { isDirty: false, forceClose: false });
  windows.add(win);

  win.once('ready-to-show', () => win.show());

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  if (isDev) win.webContents.openDevTools({ mode: 'detach' });

  // --- Persist window size/position (debounced) -------------------------
  let saveBoundsTimer = null;
  const persistBounds = () => {
    clearTimeout(saveBoundsTimer);
    saveBoundsTimer = setTimeout(() => {
      if (!win.isDestroyed() && !win.isMaximized() && !win.isFullScreen()) {
        store.set('windowBounds', win.getBounds());
      }
    }, 400);
  };
  win.on('resize', persistBounds);
  win.on('move', persistBounds);

  // Only the Browser tab's own <webview> (src/renderer/js/browser.js)
  // ever gets attached here, but force it to run with no Node access
  // and a real isolated context regardless of what the renderer HTML
  // happened to declare, and refuse to attach anything pointed at a
  // local file:// URL.
  win.webContents.on('will-attach-webview', (_wawEvent, webPreferences, params) => {
    delete webPreferences.preload;
    delete webPreferences.preloadURL;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    if (params.src && !/^(https?:|about:blank)/i.test(params.src)) {
      params.src = 'about:blank';
    }
  });

  // --- Forward maximize/fullscreen state so the custom titlebar can
  //     swap its restore/maximize icon and hide itself in fullscreen ---
  const notifyMaximized = () => win.webContents.send('window:maximized-changed', win.isMaximized());
  win.on('maximize', notifyMaximized);
  win.on('unmaximize', notifyMaximized);
  win.on('enter-full-screen', () => win.webContents.send('window:fullscreen-changed', true));
  win.on('leave-full-screen', () => win.webContents.send('window:fullscreen-changed', false));

  // --- Unsaved-changes close guard --------------------------------------
  win.on('close', (event) => {
    const state = windowState.get(win.id) || {};
    if (state.forceClose || !state.isDirty) return;

    event.preventDefault();
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning',
      buttons: ['Save', "Don't Save", 'Cancel'],
      defaultId: 0,
      cancelId: 2,
      title: 'Unsaved Changes',
      message: 'Save changes before closing?',
      detail: "If you don't save, your changes will be lost.",
    });

    if (choice === 2) return; // Cancel — do nothing.
    if (choice === 1) {
      state.forceClose = true;
      windowState.set(win.id, state);
      win.close();
      return;
    }
    // choice === 0 → ask the renderer to save, then close once it confirms.
    win.webContents.send('menu:action', 'save-then-close');
    pendingSaveBeforeClose.set(win.id, (success) => {
      if (success) {
        state.forceClose = true;
        windowState.set(win.id, state);
        win.close();
      }
    });
  });

  win.on('closed', () => {
    windowState.delete(win.id);
    windows.delete(win);
  });

  return win;
}

// A window's renderer confirms a "save before close" round trip here.
ipcMain.on('window:save-then-close-confirm', (event, success) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  const resolver = pendingSaveBeforeClose.get(win.id);
  pendingSaveBeforeClose.delete(win.id);
  if (resolver) resolver(success);
});

app.on('second-instance', () => {
  const win = getFocusedWindow() || [...windows][0];
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(() => {
  // Register all IPC handlers once, up front.
  const ctx = { ipcMain, dialog, shell, app, store, BrowserWindow, windows, windowState, getFocusedWindow, createWindow, getWindowById: (id) => BrowserWindow.fromId(id) };
  fileHandlers.register(ctx);
  netHandlers.register(ctx);
  windowHandlers.register(ctx);
  updaterHandlers.register(ctx);

  const menu = buildMenu(getFocusedWindow, createWindow);
  require('electron').Menu.setApplicationMenu(menu);

  const mainWindow = createWindow();

  // Block the renderer from navigating away from our own app shell, and
  // send any external link (http/https) to the OS browser instead of
  // letting it open inside the app — a small but real security hardening
  // step for a text editor that renders user-provided HTML/rich text.
  //
  // The one deliberate exception is the "Browser" tab's <webview> guest
  // (src/renderer/js/browser.js) — that's the whole point of it, and its
  // guest process/context has none of our preload's window.poagit bridge
  // or Node access, so letting it browse freely doesn't weaken the app
  // shell's own hardening above.
  app.on('web-contents-created', (_e, contents) => {
    const isBrowserGuest = contents.getType() === 'webview';

    contents.on('will-navigate', (navEvent, url) => {
      if (isBrowserGuest) return;
      if (!url.startsWith('file://')) navEvent.preventDefault();
    });

    contents.setWindowOpenHandler(({ url }) => {
      if (isBrowserGuest) {
        // e.g. Google sign-in / consent popups — let them open as a
        // normal, separate, un-privileged window rather than swallowing
        // them (which would silently break login flows).
        if (/^https?:\/\//i.test(url)) {
          return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, webPreferences: { contextIsolation: true, nodeIntegration: false } } };
        }
        return { action: 'deny' };
      }
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
      return { action: 'deny' };
    });
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  void mainWindow;
});

app.on('window-all-closed', () => {
  if (!isMac) app.quit();
});
