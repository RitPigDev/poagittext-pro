'use strict';

/**
 * store.js
 * ------------------------------------------------------------------
 * A minimal, dependency-free JSON key/value store persisted to disk
 * in the user's app-data directory. We intentionally avoid pulling in
 * a package like `electron-store` here: recent major versions of that
 * package ship as ESM-only, which is a real headache to require() from
 * a CommonJS main process on the older Electron/Node runtime this app
 * targets (Electron 19 / Node 16, chosen for Windows 7 + macOS Sierra
 * compatibility — see README). A ~60-line store is easier to reason
 * about than fighting a bundler for one dependency.
 * ------------------------------------------------------------------
 */

const fs = require('fs');
const path = require('path');

class Store {
  /**
   * @param {object} opts
   * @param {string} opts.dir       Directory to store the file in
   * @param {string} [opts.name]    File name (without extension)
   * @param {object} [opts.defaults] Default values
   */
  constructor({ dir, name = 'settings', defaults = {} }) {
    this.path = path.join(dir, `${name}.json`);
    this.data = { ...defaults, ...this._read() };
  }

  _read() {
    try {
      const raw = fs.readFileSync(this.path, 'utf-8');
      return JSON.parse(raw);
    } catch (err) {
      return {};
    }
  }

  _write() {
    try {
      // Write atomically: write to a temp file then rename, so a crash
      // mid-write can never corrupt the real settings file.
      const tmp = `${this.path}.tmp`;
      fs.mkdirSync(path.dirname(this.path), { recursive: true });
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf-8');
      fs.renameSync(tmp, this.path);
    } catch (err) {
      console.error('[store] failed to persist settings:', err);
    }
  }

  get(key, fallback) {
    if (key === undefined) return this.data;
    return key in this.data ? this.data[key] : fallback;
  }

  set(key, value) {
    if (typeof key === 'object') {
      Object.assign(this.data, key);
    } else {
      this.data[key] = value;
    }
    this._write();
  }

  delete(key) {
    delete this.data[key];
    this._write();
  }
}

module.exports = { Store };
