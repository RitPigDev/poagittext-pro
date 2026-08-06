'use strict';

PT.ui = (() => {
  // ---------------------------------------------------------------------
  // Toasts
  // ---------------------------------------------------------------------
  const ICONS = { info: 'fa-circle-info', success: 'fa-circle-check', warning: 'fa-triangle-exclamation', error: 'fa-circle-xmark' };

  function toast(message, type = 'info', duration = 3800) {
    const stack = document.getElementById('toastStack');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<i class="fa-solid ${ICONS[type] || ICONS.info} toast-icon"></i><span>${escapeHtml(message)}</span>`;
    stack.appendChild(el);
    setTimeout(() => {
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 220);
    }, duration);
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ---------------------------------------------------------------------
  // Overlay / modal open-close
  // ---------------------------------------------------------------------
  function openOverlay(id) {
    document.querySelectorAll('.overlay.open').forEach((o) => { if (o.id !== id) o.classList.remove('open'); });
    document.getElementById(id)?.classList.add('open');
  }
  function closeOverlay(id) {
    document.getElementById(id)?.classList.remove('open');
  }
  function closeAllOverlays() {
    document.querySelectorAll('.overlay.open').forEach((o) => o.classList.remove('open'));
  }

  function confirmDialog({ title, message, okLabel = 'Confirm', danger = false }) {
    return new Promise((resolve) => {
      document.getElementById('confirmTitle').textContent = title;
      document.getElementById('confirmMessage').textContent = message;
      const okBtn = document.getElementById('confirmOkBtn');
      const cancelBtn = document.getElementById('confirmCancelBtn');
      okBtn.textContent = okLabel;
      okBtn.className = `btn btn-sm ${danger ? 'btn-danger' : 'btn-primary'}`;
      openOverlay('confirmOverlay');

      const cleanup = (result) => {
        closeOverlay('confirmOverlay');
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
        resolve(result);
      };
      const onOk = () => cleanup(true);
      const onCancel = () => cleanup(false);
      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);
    });
  }

  // ---------------------------------------------------------------------
  // Dropdowns
  // ---------------------------------------------------------------------
  function closeAllDropdowns(except) {
    document.querySelectorAll('.dropdown-menu.open').forEach((m) => { if (m !== except) m.classList.remove('open'); });
  }

  function initDropdowns() {
    document.addEventListener('click', (e) => {
      const trigger = e.target.closest('[data-dropdown]');
      if (trigger) {
        const menu = document.getElementById(trigger.dataset.dropdown);
        const willOpen = !menu.classList.contains('open');
        closeAllDropdowns();
        menu.classList.toggle('open', willOpen);
        e.stopPropagation();
        return;
      }
      if (!e.target.closest('.dropdown-menu')) closeAllDropdowns();
    });
  }

  // ---------------------------------------------------------------------
  // Context menu
  // ---------------------------------------------------------------------
  function showContextMenu(x, y, items) {
    const menu = document.getElementById('contextMenu');
    menu.innerHTML = items
      .map((it) => (it.separator
        ? '<div class="dropdown-sep"></div>'
        : `<div class="dropdown-item" data-ctx-action="${it.action}"><i class="fa-solid ${it.icon || 'fa-circle'}"></i>${escapeHtml(it.label)}</div>`))
      .join('');
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.classList.add('open');

    const onClick = (e) => {
      const row = e.target.closest('[data-ctx-action]');
      if (row) {
        const item = items.find((it) => it.action === row.dataset.ctxAction);
        item?.onSelect?.();
      }
      hide();
    };
    const hide = () => {
      menu.classList.remove('open');
      document.removeEventListener('click', onClick);
    };
    setTimeout(() => document.addEventListener('click', onClick), 0);
  }

  // ---------------------------------------------------------------------
  // Tabs (document tab strip + explorer sidebar list)
  // ---------------------------------------------------------------------
  function renderTabs() {
    const strip = document.getElementById('tabStrip');
    const explorerList = document.getElementById('explorerTabList');
    const docs = PT.state.allDocuments();
    const activeId = PT.state.activeId;

    strip.innerHTML = docs.map((doc) => `
      <div class="doc-tab ${doc.id === activeId ? 'active' : ''} ${doc.isDirty ? 'dirty' : ''}" data-tab-id="${doc.id}" role="tab">
        <span class="tab-dot"></span>
        <span class="tab-name" title="${escapeHtml(doc.fileName)}">${escapeHtml(doc.fileName)}</span>
        <span class="tab-close" data-tab-close="${doc.id}"><i class="fa-solid fa-xmark"></i></span>
      </div>`).join('');

    explorerList.innerHTML = docs.map((doc) => `
      <div class="list-row" data-tab-id="${doc.id}">
        <div class="list-icon"><i class="fa-regular ${doc.mode === 'plain' ? 'fa-file-lines' : 'fa-file'}"></i></div>
        <div class="list-main">
          <div class="list-title">${escapeHtml(doc.fileName)}${doc.isDirty ? ' •' : ''}</div>
          <div class="list-sub">${doc.filePath ? escapeHtml(doc.filePath) : 'Not saved yet'}</div>
        </div>
      </div>`).join('') || '<p class="text-muted" style="font-size:11.5px; padding:8px;">No open documents.</p>';
  }

  function renderRecentFiles(recents) {
    const list = document.getElementById('recentFilesList');
    if (!recents || !recents.length) {
      list.innerHTML = '<p class="text-muted" style="font-size:11.5px; padding:8px;">No recent files yet.</p>';
      return;
    }
    list.innerHTML = recents.map((r) => `
      <div class="list-row" data-open-recent="${escapeHtml(r.path)}">
        <div class="list-icon"><i class="fa-regular fa-file"></i></div>
        <div class="list-main"><div class="list-title">${escapeHtml(r.name)}</div><div class="list-sub">${escapeHtml(r.path)}</div></div>
      </div>`).join('');
  }

  // ---------------------------------------------------------------------
  // Sidebar panel switching
  // ---------------------------------------------------------------------
  const PANEL_TITLES = { explorer: 'Explorer', stats: 'Statistics', tools: 'Tools & Modules', cloud: 'Cloud & Collaboration', browser: 'Browser (Beta)' };

  function showPanel(panel) {
    document.querySelectorAll('.rail-btn[data-panel]').forEach((b) => b.classList.toggle('active', b.dataset.panel === panel));
    document.querySelectorAll('.sidebar-panel').forEach((p) => p.classList.toggle('active', p.dataset.panelContent === panel));
    document.getElementById('sidebarTitle').textContent = PANEL_TITLES[panel] || panel;
    document.getElementById('sidebar').classList.remove('collapsed');
    PT.state.setSetting('lastPanel', panel);
    if (panel === 'browser') PT.browser.onShown();
  }

  function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const collapsed = sidebar.classList.toggle('collapsed');
    PT.state.setSetting('sidebarVisible', !collapsed);
  }

  // ---------------------------------------------------------------------
  // Stats rendering
  // ---------------------------------------------------------------------
  function renderStats(stats) {
    document.getElementById('statWords').textContent = stats.words.toLocaleString();
    document.getElementById('statChars').textContent = stats.chars.toLocaleString();
    document.getElementById('statSentences').textContent = stats.sentences.toLocaleString();
    document.getElementById('statParagraphs').textContent = stats.paragraphs.toLocaleString();
    document.getElementById('statReadTime').textContent = `${stats.readTimeMin}m`;
    document.getElementById('statUniqueWords').textContent = stats.uniqueWords.toLocaleString();
    document.getElementById('statusWordCount').textContent = `${stats.words.toLocaleString()} words`;

    const freqEl = document.getElementById('freqWordsList');
    freqEl.innerHTML = stats.topWords.length
      ? stats.topWords.map(([w, c]) => `<div class="list-row" style="cursor:default;"><div class="list-main"><div class="list-title">${escapeHtml(w)}</div></div><span class="badge badge-info">${c}×</span></div>`).join('')
      : '<p class="text-muted" style="font-size:11.5px; padding:8px;">Start writing to see word frequency.</p>';
  }

  // ---------------------------------------------------------------------
  // Theme gallery
  // ---------------------------------------------------------------------
  function renderThemeGrid() {
    const grid = document.getElementById('themeGrid');
    grid.innerHTML = PT.themes.GALLERY.map((t) => `
      <div class="theme-card ${document.body.dataset.theme === t.id ? 'active' : ''}" data-theme-choice="${t.id}">
        <div class="theme-preview" style="background:${t.primary}22;">
          <span style="background:${t.primary};"></span>
          <span style="background:${t.accent};"></span>
        </div>
        <div class="theme-card-label">${t.featured ? '<i class="fa-solid fa-star" style="color:var(--gold-500); font-size:10px;"></i>' : ''} ${escapeHtml(t.name)}</div>
      </div>`).join('');
  }

  // ---------------------------------------------------------------------
  // Font gallery
  // ---------------------------------------------------------------------
  function renderFontGrid(filter = '') {
    const grid = document.getElementById('fontGrid');
    const q = filter.trim().toLowerCase();
    const list = PT.fonts.ALL.filter((f) => !q || f.family.toLowerCase().includes(q));
    grid.innerHTML = list.slice(0, 120).map((f) => `
      <div class="font-card ${PT.state.settings.fontFamily === f.family ? 'active' : ''}" data-font-choice="${escapeHtml(f.family)}">
        <div class="font-sample" style="font-family:'${f.family}', sans-serif;">Aa Bb Cc</div>
        <div class="font-name">${escapeHtml(f.family)} ${f.offline ? '' : '<i class="fa-solid fa-cloud" title="Loads online" style="font-size:9px;"></i>'}</div>
      </div>`).join('');

    // Also populate the toolbar font-family dropdown once, lazily.
    const menu = document.getElementById('fontFamilyMenu');
    if (menu && !menu.dataset.built) {
      menu.dataset.built = 'true';
      menu.innerHTML = PT.fonts.BUNDLED.map((f) => `<div class="dropdown-item" data-font-choice="${f.family}" style="font-family:'${f.family}';">${f.family}</div>`).join('')
        + '<div class="dropdown-sep"></div><div class="dropdown-item" data-action="open-font-picker"><i class="fa-solid fa-swatchbook"></i>Browse full gallery…</div>';
    }
  }

  // ---------------------------------------------------------------------
  // Command palette
  // ---------------------------------------------------------------------
  let paletteCommands = [];
  function setPaletteCommands(cmds) { paletteCommands = cmds; }

  function openCommandPalette() {
    openOverlay('commandPaletteOverlay');
    const input = document.getElementById('commandInput');
    input.value = '';
    renderPalette('');
    setTimeout(() => input.focus(), 30);
  }

  function renderPalette(query) {
    const q = query.trim().toLowerCase();
    const list = document.getElementById('commandList');
    const filtered = !q ? paletteCommands : paletteCommands.filter((c) => c.label.toLowerCase().includes(q) || (c.keywords || '').includes(q));
    list.innerHTML = filtered.slice(0, 40).map((c, i) => `
      <div class="command-item ${i === 0 ? 'selected' : ''}" data-cmd-id="${c.id}">
        <i class="fa-solid ${c.icon || 'fa-circle'}"></i>
        <span>${escapeHtml(c.label)}</span>
        ${c.shortcut ? `<span class="cmd-shortcut">${c.shortcut}</span>` : ''}
      </div>`).join('') || '<div class="empty-state"><i class="fa-solid fa-magnifying-glass"></i><p>No matching commands.</p></div>';
  }

  function paletteMove(delta) {
    const items = [...document.querySelectorAll('.command-item')];
    if (!items.length) return;
    const currentIdx = items.findIndex((i) => i.classList.contains('selected'));
    const next = Math.max(0, Math.min(items.length - 1, currentIdx + delta));
    items.forEach((i) => i.classList.remove('selected'));
    items[next].classList.add('selected');
    items[next].scrollIntoView({ block: 'nearest' });
  }

  function paletteRunSelected() {
    const sel = document.querySelector('.command-item.selected');
    if (!sel) return;
    const cmd = paletteCommands.find((c) => c.id === sel.dataset.cmdId);
    closeOverlay('commandPaletteOverlay');
    cmd?.run?.();
  }

  // ---------------------------------------------------------------------
  // Settings panel nav
  // ---------------------------------------------------------------------
  function initSettingsNav() {
    document.querySelectorAll('.settings-nav-item').forEach((item) => {
      item.addEventListener('click', () => {
        document.querySelectorAll('.settings-nav-item').forEach((i) => i.classList.remove('active'));
        document.querySelectorAll('.settings-pane').forEach((p) => p.classList.remove('active'));
        item.classList.add('active');
        document.querySelector(`[data-settings-content="${item.dataset.settingsPane}"]`).classList.add('active');
      });
    });
  }

  return {
    toast, escapeHtml,
    openOverlay, closeOverlay, closeAllOverlays, confirmDialog,
    initDropdowns, closeAllDropdowns,
    showContextMenu,
    renderTabs, renderRecentFiles,
    showPanel, toggleSidebar,
    renderStats,
    renderThemeGrid, renderFontGrid,
    setPaletteCommands, openCommandPalette, renderPalette, paletteMove, paletteRunSelected,
    initSettingsNav,
  };
})();
