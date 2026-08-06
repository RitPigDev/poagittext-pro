'use strict';

/**
 * cloud.js
 * ------------------------------------------------------------------
 * Talks to the poagitSync backend (a Google Apps Script endpoint
 * rewritten specifically for poagitText Pro) through
 * `window.poagit.net.request` — routed via the main process, so
 * there's no browser CORS restriction and no need for the
 * corsproxy.io/allorigins.win fallback chain the old browser build
 * relied on.
 *
 * NOTE: login is POST-only on this backend (a GET login puts the
 * password in the URL — server logs, browser history, proxy logs —
 * so it's deliberately not supported). Everything else that doesn't
 * need to hide a credential still uses GET, matching the backend.
 * ------------------------------------------------------------------
 */

PT.cloud = (() => {
  const SYNC_URL = 'https://script.google.com/macros/s/AKfycbzu1i1J6luKa60ADSt1Be00V78LBuA3PVwLT6k7J7diTEOwFMyQA1rxYihvrshD-vyt/exec';
  const APP_VERSION = '1.1.0';

  let session = null; // { username, token }
  let collabRoom = null; // { code, pollTimer }
  const COLLAB_POLL_MS = 3000;

  function qs(params) {
    return Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
  }

  async function get(action, params = {}) {
    const url = `${SYNC_URL}?${qs({ action, version: APP_VERSION, ...params })}`;
    const res = await window.poagit.net.request({ url, method: 'GET', timeoutMs: 15000 });
    if (!res.ok) throw new Error(res.error || `Server returned ${res.status}`);
    if (!res.json) throw new Error('poagitSync returned an unexpected (non-JSON) response. Check that the Apps Script deployment is "Execute as: Me" / "Who has access: Anyone".');
    return res.json;
  }

  async function post(body) {
    const res = await window.poagit.net.request({
      url: SYNC_URL,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: APP_VERSION, ...body }),
      timeoutMs: 15000,
    });
    if (!res.ok) throw new Error(res.error || `Server returned ${res.status}`);
    if (!res.json) throw new Error('poagitSync returned an unexpected (non-JSON) response. Check that the Apps Script deployment is "Execute as: Me" / "Who has access: Anyone".');
    return res.json;
  }

  function init() {
    restoreSession();
    wireLoginForm();
    wireCollabModal();
    wireShareModal();
  }

  async function restoreSession() {
    const saved = await window.poagit.settings.get('syncSession');
    if (saved && saved.username && saved.token) {
      session = saved;
      renderSyncStatus();
    }
  }

  function renderSyncStatus() {
    const area = document.getElementById('syncStatusArea');
    if (session) {
      area.innerHTML = `
        <div class="list-row" style="cursor:default; padding-left:0;">
          <div class="list-icon"><i class="fa-solid fa-user"></i></div>
          <div class="list-main"><div class="list-title">${PT.ui.escapeHtml(session.username)}</div><div class="list-sub">Signed in to poagitSync</div></div>
        </div>
        <button class="btn btn-secondary btn-sm" style="width:100%; margin-top:8px;" data-action="sync-sign-out">Sign Out</button>`;
      area.querySelector('[data-action="sync-sign-out"]').addEventListener('click', signOut);
    } else {
      area.innerHTML = `
        <p class="text-muted" style="font-size:11.5px; margin: 0 0 10px;">Sign in to back up documents and sync across devices.</p>
        <button class="btn btn-primary btn-sm" style="width:100%;" data-action="open-sync"><i class="fa-solid fa-right-to-bracket"></i> Sign In / Register</button>`;
    }
  }

  async function signOut() {
    session = null;
    await window.poagit.settings.set('syncSession', null);
    renderSyncStatus();
    PT.ui.toast('Signed out', 'info');
  }

  // ---------------------------------------------------------------------
  // Login / Register
  // ---------------------------------------------------------------------
  function wireLoginForm() {
    document.querySelectorAll('[data-sync-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-sync-tab]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const isLogin = btn.dataset.syncTab === 'login';
        document.getElementById('syncLoginForm').style.display = isLogin ? 'block' : 'none';
        document.getElementById('syncRegisterForm').style.display = isLogin ? 'none' : 'block';
        document.getElementById('syncSubmitBtn').textContent = isLogin ? 'Sign In' : 'Create Account';
        document.getElementById('syncFormError').style.display = 'none';
      });
    });

    document.getElementById('syncSubmitBtn').addEventListener('click', async () => {
      const isLogin = document.querySelector('[data-sync-tab].active').dataset.syncTab === 'login';
      const errEl = document.getElementById('syncFormError');
      errEl.style.display = 'none';
      const btn = document.getElementById('syncSubmitBtn');
      const originalLabel = btn.textContent;
      btn.disabled = true;
      btn.innerHTML = '<div class="spinner"></div>';

      try {
        let data;
        if (isLogin) {
          const username = document.getElementById('syncLoginEmail').value.trim();
          const password = document.getElementById('syncLoginPassword').value;
          data = await post({ action: 'login', username, password });
        } else {
          const username = document.getElementById('syncRegEmail').value.trim();
          const password = document.getElementById('syncRegPassword').value;
          const displayName = document.getElementById('syncRegName').value.trim();
          data = await post({ action: 'register', username, password, displayName });
        }

        if (data.success) {
          session = { username: data.username || document.getElementById(isLogin ? 'syncLoginEmail' : 'syncRegEmail').value.trim(), token: data.token };
          await window.poagit.settings.set('syncSession', session);
          renderSyncStatus();
          PT.ui.closeOverlay('syncOverlay');
          PT.ui.toast(isLogin ? 'Signed in' : 'Account created', 'success');
        } else {
          errEl.textContent = data.error || 'Something went wrong. Please try again.';
          errEl.style.display = 'block';
        }
      } catch (err) {
        errEl.textContent = err.message;
        errEl.style.display = 'block';
      } finally {
        btn.disabled = false;
        btn.textContent = originalLabel;
      }
    });
  }

  function requireSession() {
    if (!session) {
      PT.ui.toast('Please sign in to poagitSync first', 'info');
      PT.ui.openOverlay('syncOverlay');
      return false;
    }
    return true;
  }

  // ---------------------------------------------------------------------
  // Live Collaboration
  // ---------------------------------------------------------------------
  function wireCollabModal() {
    document.getElementById('collabCreateBtn').addEventListener('click', async () => {
      if (!requireSession()) return;
      try {
        const data = await post({ action: 'collab_create', username: session.username, token: session.token });
        if (data.success) enterRoom(data.roomCode);
        else PT.ui.toast(data.error || 'Could not create room', 'error');
      } catch (err) {
        PT.ui.toast(err.message, 'error');
      }
    });

    document.getElementById('collabJoinBtn').addEventListener('click', async () => {
      if (!requireSession()) return;
      const code = document.getElementById('collabRoomCodeInput').value.trim().toUpperCase();
      if (!code) return;
      try {
        const data = await get('collab_join', { username: session.username, token: session.token, roomCode: code });
        if (data.success) enterRoom(code);
        else PT.ui.toast(data.error || 'Could not join room', 'error');
      } catch (err) {
        PT.ui.toast(err.message, 'error');
      }
    });

    document.getElementById('collabLeaveBtn').addEventListener('click', leaveRoom);
  }

  function enterRoom(code) {
    collabRoom = { code, sinceSeq: 0 };
    document.getElementById('collabIdleState').style.display = 'none';
    document.getElementById('collabActiveState').style.display = 'block';
    document.getElementById('collabRoomCodeLabel').textContent = code;
    startPolling();
    PT.ui.toast(`Joined room ${code}`, 'success');
  }

  function startPolling() {
    stopPolling();
    collabRoom.pollTimer = setInterval(async () => {
      if (!collabRoom || !session) return;
      try {
        const data = await get('collab_poll', {
          username: session.username, token: session.token, roomCode: collabRoom.code, since: collabRoom.sinceSeq,
        });
        if (data.success) {
          collabRoom.sinceSeq = data.latestSeq ?? collabRoom.sinceSeq;
          renderParticipants(data.participants || []);
        }
      } catch {
        /* transient network errors during polling are not worth surfacing */
      }
    }, COLLAB_POLL_MS);
  }

  function stopPolling() {
    if (collabRoom?.pollTimer) clearInterval(collabRoom.pollTimer);
  }

  function renderParticipants(list) {
    const el = document.getElementById('collabParticipants');
    const colors = ['--collab-1', '--collab-2', '--collab-3', '--collab-4', '--collab-5', '--collab-6'];
    el.innerHTML = list.map((p, i) => `
      <div class="badge" style="background:var(${colors[i % colors.length]}); color:#fff;" data-tip="${PT.ui.escapeHtml(p.username || p)}">
        ${PT.ui.escapeHtml((p.username || p).slice(0, 2).toUpperCase())}
      </div>`).join('');
  }

  async function leaveRoom() {
    if (collabRoom && session) {
      post({ action: 'collab_leave', username: session.username, token: session.token, roomCode: collabRoom.code }).catch(() => {});
    }
    stopPolling();
    collabRoom = null;
    document.getElementById('collabIdleState').style.display = 'block';
    document.getElementById('collabActiveState').style.display = 'none';
    document.getElementById('collabRoomCodeInput').value = '';
  }

  // ---------------------------------------------------------------------
  // Share feed
  // ---------------------------------------------------------------------
  function wireShareModal() {
    document.getElementById('sharePublishBtn').addEventListener('click', async () => {
      if (!requireSession()) return;
      const title = document.getElementById('shareTitleInput').value.trim();
      const excerpt = document.getElementById('shareExcerptInput').value.trim();
      if (!excerpt) {
        PT.ui.toast('Add some text to share first', 'info');
        return;
      }
      const btn = document.getElementById('sharePublishBtn');
      btn.disabled = true;
      try {
        const data = await post({
          action: 'share_publish',
          username: session.username,
          token: session.token,
          title: title || 'Untitled',
          data: { textContent: excerpt, fileName: title || 'Untitled.txt' },
        });
        if (data.success) {
          PT.ui.toast('Published to the share feed', 'success');
          PT.ui.closeOverlay('shareOverlay');
          document.getElementById('shareTitleInput').value = '';
          document.getElementById('shareExcerptInput').value = '';
        } else {
          PT.ui.toast(data.error || 'Could not publish', 'error');
        }
      } catch (err) {
        PT.ui.toast(err.message, 'error');
      } finally {
        btn.disabled = false;
      }
    });
  }

  function openShareWithCurrentDocument() {
    const doc = PT.state.getActiveDocument();
    if (doc) {
      document.getElementById('shareTitleInput').value = doc.fileName.replace(/\.[^.]+$/, '');
      const el = PT.editor.activeElement();
      document.getElementById('shareExcerptInput').value = (el.innerText || '').slice(0, 2000);
    }
    PT.ui.openOverlay('shareOverlay');
  }

  return { init, requireSession, openShareWithCurrentDocument, get session() { return session; } };
})();
