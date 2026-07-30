'use strict';

const fs = require('fs/promises');
const path = require('path');

const FILE_FILTERS = [
  { name: 'All Supported Documents', extensions: ['txt', 'md', 'markdown', 'html', 'htm', 'rtf'] },
  { name: 'Plain Text', extensions: ['txt'] },
  { name: 'Markdown', extensions: ['md', 'markdown'] },
  { name: 'HTML Document', extensions: ['html', 'htm'] },
  { name: 'Rich Text Format', extensions: ['rtf'] },
  { name: 'All Files', extensions: ['*'] },
];

const MAX_RECENTS = 12;

function register({ ipcMain, dialog, app, store, getWindowById, BrowserWindow }) {
  /** Push a path onto the recent-files list (most recent first, de-duped). */
  function pushRecent(filePath) {
    if (!filePath) return;
    const recents = store.get('recentFiles', []).filter((p) => p !== filePath);
    recents.unshift(filePath);
    store.set('recentFiles', recents.slice(0, MAX_RECENTS));
    if (typeof app.addRecentDocument === 'function') app.addRecentDocument(filePath);
  }

  async function readFileForOpen(filePath) {
    const stat = await fs.stat(filePath);
    if (stat.size > 50 * 1024 * 1024) {
      throw new Error('That file is larger than 50 MB — poagitText Pro is built for writing, not huge data dumps.');
    }
    const content = await fs.readFile(filePath, 'utf-8');
    const ext = path.extname(filePath).toLowerCase().replace('.', '');
    return {
      success: true,
      filePath,
      fileName: path.basename(filePath),
      ext,
      content,
      isRich: ext === 'html' || ext === 'htm' || ext === 'rtf',
      size: stat.size,
      mtimeMs: stat.mtimeMs,
    };
  }

  ipcMain.handle('fs:new-document', async (event) => {
    return { success: true };
  });

  ipcMain.handle('fs:open-dialog', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Open Document',
      properties: ['openFile'],
      filters: FILE_FILTERS,
    });
    if (canceled || !filePaths[0]) return { success: false, canceled: true };
    try {
      const result = await readFileForOpen(filePaths[0]);
      pushRecent(filePaths[0]);
      return result;
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('fs:open-path', async (event, filePath) => {
    try {
      const result = await readFileForOpen(filePath);
      pushRecent(filePath);
      return result;
    } catch (err) {
      return { success: false, error: err.message, filePath };
    }
  });

  ipcMain.handle('fs:save', async (event, payload) => {
    const { filePath, content } = payload || {};
    if (!filePath) {
      return { success: false, needsSaveAs: true };
    }
    try {
      await fs.writeFile(filePath, content, 'utf-8');
      pushRecent(filePath);
      const stat = await fs.stat(filePath);
      return { success: true, filePath, fileName: path.basename(filePath), mtimeMs: stat.mtimeMs };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('fs:save-as', async (event, payload) => {
    const { content, suggestedName, defaultExt } = payload || {};
    const win = BrowserWindow.fromWebContents(event.sender);
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Save Document',
      defaultPath: suggestedName || `Untitled.${defaultExt || 'txt'}`,
      filters: FILE_FILTERS,
    });
    if (canceled || !filePath) return { success: false, canceled: true };
    try {
      await fs.writeFile(filePath, content, 'utf-8');
      pushRecent(filePath);
      const stat = await fs.stat(filePath);
      return { success: true, filePath, fileName: path.basename(filePath), mtimeMs: stat.mtimeMs };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('fs:export-as', async (event, payload) => {
    const { content, suggestedName, format, isBinary } = payload || {};
    const win = BrowserWindow.fromWebContents(event.sender);
    const extMap = { txt: 'Plain Text', md: 'Markdown', html: 'HTML Document', rtf: 'Rich Text Format' };
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Export Document',
      defaultPath: suggestedName || `Untitled.${format}`,
      filters: [{ name: extMap[format] || 'Document', extensions: [format] }, { name: 'All Files', extensions: ['*'] }],
    });
    if (canceled || !filePath) return { success: false, canceled: true };
    try {
      if (isBinary) {
        await fs.writeFile(filePath, Buffer.from(content, 'base64'));
      } else {
        await fs.writeFile(filePath, content, 'utf-8');
      }
      return { success: true, filePath, fileName: path.basename(filePath) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('fs:get-recent', async () => {
    const recents = store.get('recentFiles', []);
    // Filter out files that no longer exist so the list stays honest.
    const alive = [];
    for (const p of recents) {
      try {
        await fs.access(p);
        alive.push(p);
      } catch {
        /* file is gone — drop it */
      }
    }
    if (alive.length !== recents.length) store.set('recentFiles', alive);
    return alive.map((p) => ({ path: p, name: path.basename(p) }));
  });

  ipcMain.handle('fs:clear-recent', async () => {
    store.set('recentFiles', []);
    return { success: true };
  });

  ipcMain.handle('fs:pick-image', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Insert Image',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }],
    });
    if (canceled || !filePaths[0]) return { success: false, canceled: true };
    try {
      const buf = await fs.readFile(filePaths[0]);
      const ext = path.extname(filePaths[0]).toLowerCase().replace('.', '');
      const mime = { svg: 'image/svg+xml', jpg: 'image/jpeg' }[ext] || `image/${ext}`;
      return {
        success: true,
        fileName: path.basename(filePaths[0]),
        dataUrl: `data:${mime};base64,${buf.toString('base64')}`,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('fs:pick-font', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Add Custom Font',
      properties: ['openFile'],
      filters: [{ name: 'Fonts', extensions: ['ttf', 'otf', 'woff', 'woff2'] }],
    });
    if (canceled || !filePaths[0]) return { success: false, canceled: true };
    try {
      const buf = await fs.readFile(filePaths[0]);
      const ext = path.extname(filePaths[0]).toLowerCase().replace('.', '');
      const mime = { ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2' }[ext];
      const name = path.basename(filePaths[0], path.extname(filePaths[0]));
      return { success: true, fontName: name, dataUrl: `data:${mime};base64,${buf.toString('base64')}` };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = { register };
