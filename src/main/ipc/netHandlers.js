'use strict';

const { net } = require('electron');

/**
 * Performs an HTTP(S) request using Electron's built-in `net` module
 * (the same network stack Chromium itself uses) and resolves with a
 * normalized { ok, status, json, text } result.
 *
 * Why this lives in the main process rather than a renderer `fetch()`:
 * the old browser build of this app had to route every poagitSync
 * call through public CORS-unblocking proxies
 * (corsproxy.io, allorigins.win, codetabs.com) because a page served
 * from a `file://`/`https://` origin can't call an arbitrary
 * third-party API directly. Those proxies are a real liability — they
 * can see and log every request, including credentials and API keys.
 * A Node/Electron main process has no same-origin policy at all, so
 * none of that is necessary anymore. This is a strictly better,
 * simpler, and more private way to talk to the same backend.
 */
function performRequest({ url, method = 'GET', headers = {}, body, timeoutMs = 15000 }) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    let request;
    try {
      request = net.request({ method, url, redirect: 'follow' });
    } catch (err) {
      finish({ ok: false, status: 0, error: err.message });
      return;
    }

    Object.entries(headers).forEach(([key, value]) => {
      if (value != null) request.setHeader(key, String(value));
    });

    const timer = setTimeout(() => {
      request.abort();
      finish({ ok: false, status: 0, error: 'Request timed out' });
    }, timeoutMs);

    request.on('response', (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        clearTimeout(timer);
        const text = Buffer.concat(chunks).toString('utf-8');
        let json = null;
        try {
          json = JSON.parse(text);
        } catch {
          /* not JSON — that's fine, caller can use .text */
        }
        finish({
          ok: response.statusCode >= 200 && response.statusCode < 300,
          status: response.statusCode,
          json,
          text,
        });
      });
      response.on('error', (err) => {
        clearTimeout(timer);
        finish({ ok: false, status: response.statusCode || 0, error: err.message });
      });
    });

    request.on('error', (err) => {
      clearTimeout(timer);
      finish({ ok: false, status: 0, error: err.message });
    });

    if (body != null) {
      request.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    request.end();
  });
}

function register({ ipcMain }) {
  ipcMain.handle('net:request', async (event, payload) => {
    const { url, method, headers, body, timeoutMs } = payload || {};
    if (!url || typeof url !== 'string') {
      return { ok: false, status: 0, error: 'Missing URL' };
    }
    return performRequest({ url, method, headers, body, timeoutMs });
  });
}

module.exports = { register, performRequest };
