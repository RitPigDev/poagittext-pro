'use strict';

const { Menu, shell, app } = require('electron');

const isMac = process.platform === 'darwin';

/**
 * Builds the native application menu. Custom (non-role) items simply
 * forward a named action to the focused window's renderer over IPC —
 * the renderer owns the actual editing/formatting logic, the same way
 * a keyboard shortcut would trigger it. This keeps "what Bold does"
 * defined in exactly one place.
 */
function buildMenu(getFocusedWindow, createWindow) {
  const send = (action, ...args) => {
    const win = getFocusedWindow();
    if (win) win.webContents.send('menu:action', action, ...args);
  };

  const template = [
    // ---- macOS app menu -------------------------------------------------
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { label: 'Preferences…', accelerator: 'Cmd+,', click: () => send('open-settings') },
              { label: 'Check for Updates…', click: () => send('check-for-updates') },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ]
      : []),

    // ---- File -------------------------------------------------------------
    {
      label: 'File',
      submenu: [
        { label: 'New', accelerator: 'CmdOrCtrl+N', click: () => send('new-file') },
        { label: 'New Window', accelerator: 'CmdOrCtrl+Shift+N', click: () => createWindow() },
        { type: 'separator' },
        { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: () => send('open-file') },
        { label: 'Open Recent', submenu: [{ label: 'Managed in-app', enabled: false }] },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => send('save-file') },
        { label: 'Save As…', accelerator: 'CmdOrCtrl+Shift+S', click: () => send('save-file-as') },
        { label: 'Export As…', submenu: [
          { label: 'Plain Text (.txt)', click: () => send('export-as', 'txt') },
          { label: 'Markdown (.md)', click: () => send('export-as', 'md') },
          { label: 'HTML (.html)', click: () => send('export-as', 'html') },
          { label: 'Rich Text (.rtf)', click: () => send('export-as', 'rtf') },
        ]},
        { type: 'separator' },
        { label: 'Print…', accelerator: 'CmdOrCtrl+P', click: () => send('print') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { label: 'Close Window', accelerator: 'CmdOrCtrl+W', click: () => send('close-window') },
        ...(isMac ? [] : [{ label: 'Exit', accelerator: 'Alt+F4', role: 'quit' }]),
      ],
    },

    // ---- Edit -------------------------------------------------------------
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { label: 'Paste and Match Style', accelerator: 'CmdOrCtrl+Shift+V', click: () => send('paste-plain') },
        { role: 'selectAll' },
        { type: 'separator' },
        { label: 'Find…', accelerator: 'CmdOrCtrl+F', click: () => send('open-find') },
        { label: 'Find & Replace…', accelerator: 'CmdOrCtrl+H', click: () => send('open-find-replace') },
      ],
    },

    // ---- View -------------------------------------------------------------
    {
      label: 'View',
      submenu: [
        { label: 'Command Palette…', accelerator: 'CmdOrCtrl+K', click: () => send('open-command-palette') },
        { type: 'separator' },
        { label: 'Toggle Sidebar', click: () => send('toggle-sidebar') },
        { label: 'Toggle Statistics', click: () => send('toggle-stats') },
        { label: 'Toggle Line Numbers', click: () => send('toggle-line-numbers') },
        { type: 'separator' },
        { label: 'Focus Mode', accelerator: 'CmdOrCtrl+.', click: () => send('toggle-focus-mode') },
        { label: 'Toggle Full Screen', accelerator: isMac ? 'Ctrl+Cmd+F' : 'F11', click: () => send('toggle-fullscreen') },
        { type: 'separator' },
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+=', click: () => send('zoom', 10) },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: () => send('zoom', -10) },
        { label: 'Reset Zoom', accelerator: 'CmdOrCtrl+0', click: () => send('zoom', 0) },
        { type: 'separator' },
        { label: 'Theme', submenu: [
          { label: 'Purple & Red (Default)', click: () => send('set-theme', 'poagit-classic') },
          { label: 'Midnight (Dark)', click: () => send('set-theme', 'midnight') },
          { label: 'Match System', click: () => send('set-theme', 'system') },
          { type: 'separator' },
          { label: 'Browse Theme Gallery…', click: () => send('open-theme-picker') },
        ]},
        { type: 'separator' },
        { role: 'reload' },
        { label: 'Toggle Developer Tools', accelerator: isMac ? 'Alt+Cmd+I' : 'Ctrl+Shift+I', click: (item, win) => win && win.webContents.toggleDevTools() },
      ],
    },

    // ---- Format -------------------------------------------------------------
    {
      label: 'Format',
      submenu: [
        { label: 'Bold', accelerator: 'CmdOrCtrl+B', click: () => send('format', 'bold') },
        { label: 'Italic', accelerator: 'CmdOrCtrl+I', click: () => send('format', 'italic') },
        { label: 'Underline', accelerator: 'CmdOrCtrl+U', click: () => send('format', 'underline') },
        { label: 'Strikethrough', accelerator: 'CmdOrCtrl+Shift+X', click: () => send('format', 'strikethrough') },
        { type: 'separator' },
        { label: 'Heading 1', accelerator: 'CmdOrCtrl+Alt+1', click: () => send('format', 'h1') },
        { label: 'Heading 2', accelerator: 'CmdOrCtrl+Alt+2', click: () => send('format', 'h2') },
        { label: 'Paragraph', accelerator: 'CmdOrCtrl+Alt+0', click: () => send('format', 'paragraph') },
        { type: 'separator' },
        { label: 'Bullet List', accelerator: 'CmdOrCtrl+Shift+8', click: () => send('format', 'ul') },
        { label: 'Numbered List', accelerator: 'CmdOrCtrl+Shift+7', click: () => send('format', 'ol') },
        { label: 'Block Quote', accelerator: 'CmdOrCtrl+Shift+9', click: () => send('format', 'quote') },
        { label: 'Horizontal Rule', click: () => send('format', 'hr') },
        { type: 'separator' },
        { label: 'Increase Indent', click: () => send('format', 'indent') },
        { label: 'Decrease Indent', click: () => send('format', 'outdent') },
        { type: 'separator' },
        { label: 'Clear Formatting', accelerator: 'CmdOrCtrl+\\', click: () => send('format', 'clear') },
      ],
    },

    // ---- Tools -------------------------------------------------------------
    {
      label: 'Tools',
      submenu: [
        { label: 'Word Count & Statistics', click: () => send('toggle-stats') },
        { type: 'separator' },
        { label: 'Utility Tools', submenu: [
          { label: 'Base64 Encode/Decode', click: () => send('open-tool', 'base64') },
          { label: 'Case Converter', click: () => send('open-tool', 'case') },
          { label: 'Sort Lines', click: () => send('open-tool', 'sort-lines') },
          { label: 'Reverse Lines', click: () => send('open-tool', 'reverse-lines') },
          { label: 'Remove Extra Spaces', click: () => send('open-tool', 'trim-spaces') },
          { label: 'QR Code Generator', click: () => send('open-tool', 'qr') },
        ]},
        { type: 'separator' },
        { label: 'poagitSync (Cloud & Backups)', click: () => send('open-sync') },
        { label: 'Live Collaboration…', click: () => send('open-collab') },
        { label: 'Share…', click: () => send('open-share') },
        { type: 'separator' },
        { label: 'Font Gallery…', click: () => send('open-font-picker') },
        { label: 'Extensions & Modules…', click: () => send('open-extensions') },
      ],
    },

    // ---- Window -------------------------------------------------------------
    {
      label: 'Window',
      role: 'windowMenu',
    },

    // ---- Help -------------------------------------------------------------
    {
      role: 'help',
      submenu: [
        { label: 'poagitText Pro Help', click: () => shell.openExternal('https://github.com/RitPigDev/poagittext-pro') },
        { label: 'Report an Issue', click: () => shell.openExternal('https://github.com/RitPigDev/poagittext-pro/issues') },
        { label: 'Keyboard Shortcuts', click: () => send('open-shortcuts') },
        { type: 'separator' },
        { label: 'Check for Updates…', click: () => send('check-for-updates') },
        ...(isMac ? [] : [{ label: 'About poagitText Pro', click: () => send('open-about') }]),
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
}

module.exports = { buildMenu };
