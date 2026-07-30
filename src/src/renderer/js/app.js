'use strict';

/**
 * app.js
 * ------------------------------------------------------------------
 * The bootstrap. Every other file defines a `PT.<module>` namespace;
 * this file is the only place that wires them together, binds
 * `data-action` clicks, keyboard shortcuts, and native menu actions
 * (forwarded from main.js) to real behavior.
 * ------------------------------------------------------------------
 */

(function () {
  async function boot() {
    // ---- Platform-specific chrome (titlebar padding, traffic lights) ----
    const platformInfo = await window.poagit.app.getPlatformInfo();
    document.body.dataset.platform = platformInfo.platform;
    document.getElementById('appVersionLabel').textContent = await window.poagit.app.getVersion();
    document.getElementById('appVersionLabel2').textContent = document.getElementById('appVersionLabel').textContent;

    // ---- Hydrate settings from disk, then apply everything they affect ----
    const savedSettings = await window.poagit.settings.getAll();
    PT.state.hydrateSettings(savedSettings);
    applyHydratedSettings();

    // ---- Init every module ----
    PT.editor.init();
    PT.ui.initDropdowns();
    PT.ui.initSettingsNav();
    PT.brainstorm.init();
    PT.cloud.init();
    PT.shortcuts.render();

    // ---- First document ----
    const first = PT.state.createDocument();
    PT.state.setActive(first.id);

    // ---- Wire everything else ----
    wireWindowControls();
    wireTabStrip();
    wireSidebarRail();
    wireToolbar();
    wireStatusBar();
    wireOverlaysGeneric();
    wireFindReplace();
    wireThemeAndFontPickers();
    wireSettingsControls();
    wireCommandPalette();
    wireMenuActions();
    wireKeyboardShortcuts();
    wireStateSubscriptions();
    wireCloseGuard();
    wireDragAndDrop();
    wireUpdaterUI();

    PT.ui.renderTabs();
    const recents = await window.poagit.fs.getRecent();
    PT.ui.renderRecentFiles(recents);

    document.getElementById('editorScroll').classList.add('anim');
    PT.editor.focus();
  }

  function applyHydratedSettings() {
    const s = PT.state.settings;
    PT.themes.applyTheme(s.theme, { mode: s.mode });
    PT.editor.applyZoom(s.editorZoom);
    PT.editor.setFontFamily(s.fontFamily);
    document.body.dataset.lineNumbers = String(s.lineNumbers);
    document.body.dataset.editorLayout = s.editorLayout;
    document.body.dataset.caretStyle = s.caretStyle;
    document.body.dataset.performance = s.performanceMode ? 'low' : 'normal';
    if (!s.sidebarVisible) document.getElementById('sidebar').classList.add('collapsed');
    PT.ui.showPanel(s.lastPanel || 'explorer');

    document.getElementById('setAutoUpdate').checked = s.autoCheckForUpdates;
    document.getElementById('setCloseGuard').checked = s.closeGuardEnabled;
    document.getElementById('setPerformanceMode').checked = s.performanceMode;
    document.getElementById('setMatchSystem').checked = s.matchSystem;
    document.getElementById('setLineNumbers').checked = s.lineNumbers;
    document.getElementById('setMarginGuides').checked = s.marginGuides;
    document.body.classList.toggle('page-margin-guides', s.marginGuides);
    document.querySelectorAll('[data-caret-style]').forEach((b) => b.classList.toggle('active', b.dataset.caretStyle === s.caretStyle));
    document.querySelectorAll('[data-editor-layout]').forEach((b) => b.classList.toggle('active', b.dataset.editorLayout === s.editorLayout));
  }

  // ---------------------------------------------------------------------
  // Window controls (custom titlebar)
  // ---------------------------------------------------------------------
  function wireWindowControls() {
    document.querySelector('[data-action="win-minimize"]').addEventListener('click', () => window.poagit.window.minimize());
    document.querySelector('[data-action="win-close"]').addEventListener('click', () => window.poagit.window.close());

    const maxBtn = document.querySelector('[data-action="win-maximize"]');
    maxBtn.addEventListener('click', async () => {
      if (await window.poagit.window.isMaximized()) window.poagit.window.unmaximize();
      else window.poagit.window.maximize();
    });
    window.poagit.window.onMaximizedChange((isMax) => {
      maxBtn.querySelector('i').className = isMax ? 'fa-regular fa-clone' : 'fa-regular fa-square';
    });
    window.poagit.window.onFullscreenChange((isFs) => {
      document.body.classList.toggle('is-fullscreen', isFs);
    });
  }

  // ---------------------------------------------------------------------
  // Tabs
  // ---------------------------------------------------------------------
  function wireTabStrip() {
    // Note: newTabBtn already carries data-action="new-file", handled by
    // the generic delegated handler in wireOverlaysGeneric — no listener
    // needed here (adding one caused a double-fire: two new tabs per click).

    document.getElementById('tabStrip').addEventListener('click', (e) => {
      const closeBtn = e.target.closest('[data-tab-close]');
      if (closeBtn) {
        e.stopPropagation();
        closeTab(closeBtn.dataset.tabClose);
        return;
      }
      const tab = e.target.closest('[data-tab-id]');
      if (tab) PT.state.setActive(tab.dataset.tabId);
    });

    document.getElementById('explorerTabList').addEventListener('click', (e) => {
      const row = e.target.closest('[data-tab-id]');
      if (row) PT.state.setActive(row.dataset.tabId);
    });

    document.getElementById('recentFilesList').addEventListener('click', async (e) => {
      const row = e.target.closest('[data-open-recent]');
      if (!row) return;
      const res = await window.poagit.fs.openPath(row.dataset.openRecent);
      if (res.success) openFromResult(res);
      else PT.ui.toast(res.error || 'Could not open that file', 'error');
    });
  }

  function newDocument() {
    const doc = PT.state.createDocument();
    PT.state.setActive(doc.id);
    PT.ui.renderTabs();
  }

  async function closeTab(id) {
    const doc = PT.state.getDocument(id);
    if (doc && doc.isDirty) {
      const proceed = await PT.ui.confirmDialog({
        title: 'Close without saving?',
        message: `"${doc.fileName}" has unsaved changes. Close it anyway?`,
        okLabel: 'Close Without Saving',
        danger: true,
      });
      if (!proceed) return;
    }
    PT.state.closeDocument(id);
    PT.ui.renderTabs();
  }

  // ---------------------------------------------------------------------
  // Sidebar / activity rail
  // ---------------------------------------------------------------------
  function wireSidebarRail() {
    document.querySelectorAll('.rail-btn[data-panel]').forEach((btn) => {
      btn.addEventListener('click', () => PT.ui.showPanel(btn.dataset.panel));
    });
    // Note: the sidebar's own collapse button carries data-action="toggle-sidebar",
    // already handled by the generic delegated handler — no listener needed here.

    document.getElementById('sidebar').addEventListener('click', (e) => {
      const outlineItem = e.target.closest('[data-heading-id]');
      if (outlineItem) PT.editor.scrollToHeading(outlineItem.dataset.headingId);
    });

    document.querySelector('[data-action="open-collab"]').addEventListener('click', () => PT.ui.openOverlay('collabOverlay'));
    document.querySelector('[data-action="open-share"]').addEventListener('click', () => PT.cloud.openShareWithCurrentDocument());
    document.querySelector('[data-action="open-sync"]').addEventListener('click', () => PT.ui.openOverlay('syncOverlay'));
  }

  // ---------------------------------------------------------------------
  // Toolbar
  // ---------------------------------------------------------------------
  function wireToolbar() {
    document.getElementById('toolbar').addEventListener('click', (e) => {
      const formatBtn = e.target.closest('[data-format]');
      if (formatBtn && formatBtn.dataset.format) {
        PT.editor.exec(formatBtn.dataset.format);
        if (['paragraph', 'h1', 'h2', 'h3', 'quote'].includes(formatBtn.dataset.format)) {
          document.getElementById('blockFormatLabel').textContent = formatBtn.textContent;
          PT.ui.closeAllDropdowns();
        }
        return;
      }
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (action === 'save-file') saveActiveDocument();
      if (action === 'undo') PT.editor.exec('undo');
      if (action === 'redo') PT.editor.exec('redo');
      if (action === 'insert-link') insertLinkPrompt();
      // Note: insert-image is handled by the generic delegated handler.
    });

    document.getElementById('floatingFormatBar').addEventListener('click', (e) => {
      const formatBtn = e.target.closest('[data-format]');
      if (formatBtn) PT.editor.exec(formatBtn.dataset.format);
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (action === 'ask-brainstorm-selection') PT.brainstorm.askAboutSelection();
    });

    document.getElementById('fontFamilyMenu').addEventListener('click', (e) => {
      const item = e.target.closest('[data-font-choice]');
      if (!item) return;
      applyFontChoice(item.dataset.fontChoice);
      PT.ui.closeAllDropdowns();
    });

    document.getElementById('textColorMenu').addEventListener('click', (e) => {
      const sw = e.target.closest('.swatch');
      if (sw) { PT.editor.exec('text-color', sw.dataset.color); PT.ui.closeAllDropdowns(); }
    });
    document.getElementById('highlightMenu').addEventListener('click', (e) => {
      const sw = e.target.closest('.swatch');
      if (sw) { PT.editor.exec('highlight', sw.dataset.color); PT.ui.closeAllDropdowns(); }
    });
    buildColorSwatches();

    document.getElementById('editorModeSwitch').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-editor-mode]');
      if (!btn) return;
      document.querySelectorAll('#editorModeSwitch button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      PT.editor.switchEditorMode(btn.dataset.editorMode);
    });
  }

  function buildColorSwatches() {
    const colors = ['#150c26', '#5b21b6', '#7c3aed', '#e11d48', '#f59e0b', '#16a34a', '#0ea5e9', '#ec4899',
      '#8a80a0', '#a30f30', '#c41439', '#ffd666', '#10b981', '#3b82f6', '#f0abfc', '#ffffff'];
    document.querySelectorAll('[data-color-target]').forEach((grid) => {
      grid.innerHTML = colors.map((c) => `<span class="swatch" style="background:${c};" data-color="${c}"></span>`).join('');
    });
  }

  async function applyFontChoice(family) {
    await PT.fonts.ensureLoaded(family);
    PT.editor.setFontFamily(family);
  }

  function insertLinkPrompt() {
    const url = prompt('Enter a URL:', 'https://');
    if (url) PT.editor.insertLink(url);
  }

  // ---------------------------------------------------------------------
  // Status bar
  // ---------------------------------------------------------------------
  function wireStatusBar() {
    document.querySelector('[data-action="zoom-in"]').addEventListener('click', () => PT.editor.zoomBy(10));
    document.querySelector('[data-action="zoom-out"]').addEventListener('click', () => PT.editor.zoomBy(-10));
    // Note: toggle-focus-mode and open-theme-picker are both handled by
    // the generic delegated handler in wireOverlaysGeneric — binding them
    // again here caused each click to toggle state on and then immediately
    // back off.
    document.getElementById('statusWordCount').addEventListener('click', () => PT.ui.showPanel('stats'));
  }

  function toggleFocusMode() {
    const on = document.body.dataset.focusMode !== 'true';
    PT.editor.setFocusMode(on);
    document.getElementById('statusFocusMode').classList.toggle('clickable', true);
    document.getElementById('statusFocusMode').innerHTML = on
      ? '<i class="fa-solid fa-eye"></i> Focus: On' : '<i class="fa-regular fa-eye"></i> Focus';
  }

  // ---------------------------------------------------------------------
  // Generic overlay close wiring (X buttons, backdrop click, Escape)
  // ---------------------------------------------------------------------
  function wireOverlaysGeneric() {
    document.querySelectorAll('[data-close-overlay]').forEach((btn) => {
      btn.addEventListener('click', (e) => PT.ui.closeOverlay(e.target.closest('.overlay').id));
    });
    document.querySelectorAll('.overlay').forEach((overlay) => {
      overlay.addEventListener('click', (e) => { if (e.target === overlay) PT.ui.closeOverlay(overlay.id); });
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const open = document.querySelector('.overlay.open');
        if (open) PT.ui.closeOverlay(open.id);
      }
    });

    document.body.addEventListener('click', (e) => {
      const toolRow = e.target.closest('[data-action="open-tool"]');
      if (toolRow) PT.tools.open(toolRow.dataset.tool);

      const action = e.target.closest('[data-action]')?.dataset.action;
      if (!action) return;
      const handlers = {
        'new-file': () => newDocument(),
        'open-file': () => openFileDialog(),
        'insert-image': () => PT.tools.insertImage(),
        'open-font-picker': openFontPicker,
        'open-theme-picker': openThemePicker,
        'open-settings': () => PT.ui.openOverlay('settingsOverlay'),
        'open-shortcuts': () => PT.ui.openOverlay('shortcutsOverlay'),
        'open-command-palette': () => PT.ui.openCommandPalette(),
        'toggle-sidebar': () => PT.ui.toggleSidebar(),
        'toggle-focus-mode': toggleFocusMode,
        'check-for-updates': () => window.poagit.updater.check(),
        'upload-custom-font': () => PT.tools.uploadCustomFont(),
        'open-external': (el) => window.poagit.app.openExternal(el.dataset.url),
      };
      const target = e.target.closest('[data-action]');
      handlers[action]?.(target);
    });
  }

  // ---------------------------------------------------------------------
  // Find & Replace
  // ---------------------------------------------------------------------
  function wireFindReplace() {
    const runSearch = () => {
      const query = document.getElementById('findInput').value;
      const opts = {
        caseSensitive: document.getElementById('findCaseSensitive').checked,
        wholeWord: document.getElementById('findWholeWord').checked,
      };
      const { count } = PT.editor.find.run(query, opts);
      document.getElementById('findResultCount').textContent = query ? `${count} match${count === 1 ? '' : 'es'}` : '';
    };
    document.getElementById('findInput').addEventListener('input', runSearch);
    document.getElementById('findCaseSensitive').addEventListener('change', runSearch);
    document.getElementById('findWholeWord').addEventListener('change', runSearch);
    document.getElementById('findNextBtn').addEventListener('click', () => PT.editor.find.next());
    document.getElementById('findPrevBtn').addEventListener('click', () => PT.editor.find.prev());
    document.getElementById('replaceOneBtn').addEventListener('click', () => {
      PT.editor.find.replaceCurrent(document.getElementById('replaceInput').value);
      runSearch();
    });
    document.getElementById('replaceAllBtn').addEventListener('click', () => {
      const n = PT.editor.find.replaceAll(document.getElementById('replaceInput').value);
      PT.ui.toast(`Replaced ${n} occurrence${n === 1 ? '' : 's'}`, 'success');
      document.getElementById('findResultCount').textContent = '';
    });
  }

  function openFindReplace(withReplace) {
    PT.ui.openOverlay('findReplaceOverlay');
    document.getElementById('replaceSection').style.display = withReplace ? 'block' : 'none';
    document.getElementById('replaceOneBtn').style.display = withReplace ? 'inline-flex' : 'none';
    document.getElementById('replaceAllBtn').style.display = withReplace ? 'inline-flex' : 'none';
    setTimeout(() => document.getElementById('findInput').focus(), 30);
  }

  // ---------------------------------------------------------------------
  // Theme / Font pickers
  // ---------------------------------------------------------------------
  function openThemePicker() {
    PT.ui.renderThemeGrid();
    PT.ui.openOverlay('themePickerOverlay');
  }
  function openFontPicker() {
    PT.ui.renderFontGrid();
    PT.ui.openOverlay('fontPickerOverlay');
  }

  function wireThemeAndFontPickers() {
    document.getElementById('themeGrid').addEventListener('click', (e) => {
      const card = e.target.closest('[data-theme-choice]');
      if (!card) return;
      const id = card.dataset.themeChoice;
      PT.state.setSetting('theme', id);
      PT.themes.applyTheme(id, { mode: PT.state.settings.mode });
      PT.ui.renderThemeGrid();
    });

    document.getElementById('applyCustomThemeBtn').addEventListener('click', () => {
      const primary = document.getElementById('customPrimaryColor').value;
      const accent = document.getElementById('customAccentColor').value;
      PT.state.setSetting('theme', 'custom');
      PT.themes.applyCustom(primary, accent);
      PT.ui.renderThemeGrid();
      PT.ui.toast('Custom theme applied', 'success');
    });

    document.getElementById('fontSearchInput').addEventListener('input', (e) => PT.ui.renderFontGrid(e.target.value));
    document.getElementById('fontGrid').addEventListener('click', async (e) => {
      const card = e.target.closest('[data-font-choice]');
      if (!card) return;
      await applyFontChoice(card.dataset.fontChoice);
      PT.ui.renderFontGrid(document.getElementById('fontSearchInput').value);
    });
  }

  // ---------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------
  function wireSettingsControls() {
    const bind = (id, key, transform = (v) => v) => {
      document.getElementById(id).addEventListener('change', (e) => {
        PT.state.setSetting(key, transform(e.target.type === 'checkbox' ? e.target.checked : e.target.value));
      });
    };
    bind('setAutoUpdate', 'autoCheckForUpdates');
    bind('setCloseGuard', 'closeGuardEnabled');
    bind('setMatchSystem', 'matchSystem');
    bind('setLineNumbers', 'lineNumbers');
    bind('setMarginGuides', 'marginGuides');

    document.getElementById('setLineNumbers').addEventListener('change', (e) => {
      document.body.dataset.lineNumbers = String(e.target.checked);
    });
    document.getElementById('setMarginGuides').addEventListener('change', (e) => {
      document.body.classList.toggle('page-margin-guides', e.target.checked);
    });
    document.getElementById('setPerformanceMode').addEventListener('change', (e) => {
      PT.state.setSetting('performanceMode', e.target.checked);
      document.body.dataset.performance = e.target.checked ? 'low' : 'normal';
    });

    document.querySelectorAll('[data-caret-style]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-caret-style]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        document.body.dataset.caretStyle = btn.dataset.caretStyle;
        PT.state.setSetting('caretStyle', btn.dataset.caretStyle);
      });
    });
    document.querySelectorAll('[data-editor-layout]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-editor-layout]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        PT.editor.setEditorLayout(btn.dataset.editorLayout);
      });
    });
  }

  // ---------------------------------------------------------------------
  // Command palette
  // ---------------------------------------------------------------------
  function wireCommandPalette() {
    const commands = [
      { id: 'new', label: 'New Document', icon: 'fa-file-circle-plus', shortcut: 'Ctrl+N', run: newDocument },
      { id: 'open', label: 'Open Document…', icon: 'fa-folder-open', shortcut: 'Ctrl+O', run: openFileDialog },
      { id: 'save', label: 'Save', icon: 'fa-floppy-disk', shortcut: 'Ctrl+S', run: saveActiveDocument },
      { id: 'find', label: 'Find & Replace', icon: 'fa-magnifying-glass', shortcut: 'Ctrl+H', run: () => openFindReplace(true) },
      { id: 'focus', label: 'Toggle Focus Mode', icon: 'fa-eye', run: toggleFocusMode },
      { id: 'theme', label: 'Browse Theme Gallery', icon: 'fa-palette', run: openThemePicker },
      { id: 'font', label: 'Browse Font Gallery', icon: 'fa-swatchbook', run: openFontPicker },
      { id: 'settings', label: 'Open Settings', icon: 'fa-gear', run: () => PT.ui.openOverlay('settingsOverlay') },
      { id: 'shortcuts', label: 'Keyboard Shortcuts', icon: 'fa-keyboard', run: () => PT.ui.openOverlay('shortcutsOverlay') },
      { id: 'brainstorm', label: 'Open Brainstorm Assistant', icon: 'fa-wand-magic-sparkles', run: () => PT.ui.showPanel('brainstorm') },
      { id: 'sync', label: 'poagitSync (Cloud & Backups)', icon: 'fa-cloud', run: () => PT.ui.openOverlay('syncOverlay') },
      { id: 'collab', label: 'Live Collaboration', icon: 'fa-people-arrows', run: () => PT.ui.openOverlay('collabOverlay') },
      { id: 'share', label: 'Share to Feed', icon: 'fa-share-nodes', run: () => PT.cloud.openShareWithCurrentDocument() },
      { id: 'base64', label: 'Tool: Base64 Encode / Decode', icon: 'fa-code', run: () => PT.tools.open('base64') },
      { id: 'case', label: 'Tool: Case Converter', icon: 'fa-font', run: () => PT.tools.open('case') },
      { id: 'qr', label: 'Tool: QR Code Generator', icon: 'fa-qrcode', run: () => PT.tools.open('qr') },
      { id: 'sort', label: 'Tool: Sort Lines', icon: 'fa-arrow-down-a-z', run: () => PT.tools.open('sort-lines') },
      { id: 'zen', label: 'Toggle Zen Mode', icon: 'fa-expand', run: () => document.body.classList.toggle('zen-mode') },
      { id: 'about', label: 'About poagitText Pro', icon: 'fa-circle-info', run: () => { PT.ui.openOverlay('settingsOverlay'); document.querySelector('[data-settings-pane="about"]').click(); } },
    ];
    PT.ui.setPaletteCommands(commands);

    document.getElementById('commandInput').addEventListener('input', (e) => PT.ui.renderPalette(e.target.value));
    document.getElementById('commandInput').addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); PT.ui.paletteMove(1); }
      if (e.key === 'ArrowUp') { e.preventDefault(); PT.ui.paletteMove(-1); }
      if (e.key === 'Enter') { e.preventDefault(); PT.ui.paletteRunSelected(); }
    });
    document.getElementById('commandList').addEventListener('click', (e) => {
      const item = e.target.closest('.command-item');
      if (!item) return;
      document.querySelectorAll('.command-item').forEach((i) => i.classList.remove('selected'));
      item.classList.add('selected');
      PT.ui.paletteRunSelected();
    });
  }

  // ---------------------------------------------------------------------
  // File lifecycle
  // ---------------------------------------------------------------------
  function openFromResult(res) {
    const existing = PT.state.allDocuments().find((d) => d.filePath === res.filePath);
    if (existing) {
      PT.state.setActive(existing.id);
      return;
    }
    const doc = PT.state.createDocument({
      filePath: res.filePath,
      fileName: res.fileName,
      mode: res.isRich ? 'rich' : 'plain',
      content: res.content,
    });
    PT.state.setActive(doc.id);
    PT.ui.renderTabs();
  }

  async function openFileDialog() {
    const res = await window.poagit.fs.openDialog();
    if (res.success) openFromResult(res);
    else if (res.error) PT.ui.toast(res.error, 'error');
  }

  async function saveActiveDocument() {
    const doc = PT.state.getActiveDocument();
    if (!doc) return false;
    PT.editor.captureContent();
    const fresh = PT.state.getActiveDocument();

    const res = fresh.filePath
      ? await window.poagit.fs.save({ filePath: fresh.filePath, content: fresh.content })
      : await window.poagit.fs.saveAs({ content: fresh.content, suggestedName: fresh.fileName, defaultExt: fresh.mode === 'plain' ? 'txt' : 'html' });

    if (res.success) {
      PT.state.updateDocument(fresh.id, { filePath: res.filePath, fileName: res.fileName });
      PT.state.markDirty(fresh.id, false);
      PT.ui.renderTabs();
      PT.ui.toast('Saved', 'success');
      const recents = await window.poagit.fs.getRecent();
      PT.ui.renderRecentFiles(recents);
    } else if (res.error) {
      PT.ui.toast(res.error, 'error');
    }
    return res.success;
  }

  // ---------------------------------------------------------------------
  // State subscriptions (tabs, stats, outline re-render on change)
  // ---------------------------------------------------------------------
  function wireStateSubscriptions() {
    PT.state.on('document-created', () => PT.ui.renderTabs());
    PT.state.on('document-changed', () => PT.ui.renderTabs());
    PT.state.on('document-closed', () => PT.ui.renderTabs());
    PT.state.on('dirty-changed', () => PT.ui.renderTabs());
    PT.state.on('active-changed', () => PT.ui.renderTabs());
    PT.state.on('stats-changed', (stats) => PT.ui.renderStats(stats));
    PT.state.on('outline-changed', (items) => PT.ui.renderOutline(items));
  }

  // ---------------------------------------------------------------------
  // Close guard (unsaved changes) — handshake with main.js
  // ---------------------------------------------------------------------
  function wireCloseGuard() {
    PT.state.on('dirty-changed', () => {
      const dirty = PT.state.settings.closeGuardEnabled && PT.state.anyDirty();
      window.poagit.window.setCloseGuard(dirty);
    });

    window.poagit.menu.onAction(async (action) => {
      if (action === 'save-then-close') {
        const success = await saveActiveDocument();
        window.poagit.window.confirmSaveThenClose(!!success);
      }
    });
  }

  // ---------------------------------------------------------------------
  // Drag & drop files onto the window
  // ---------------------------------------------------------------------
  function wireDragAndDrop() {
    ['dragover', 'drop'].forEach((evt) => window.addEventListener(evt, (e) => e.preventDefault()));
    window.addEventListener('drop', async (e) => {
      const file = e.dataTransfer.files[0];
      if (!file) return;
      const filePath = window.poagit.fs.pathForFile(file);
      if (!filePath) return;
      const res = await window.poagit.fs.openPath(filePath);
      if (res.success) openFromResult(res);
    });
  }

  // ---------------------------------------------------------------------
  // Native menu actions (forwarded from main.js)
  // ---------------------------------------------------------------------
  function wireMenuActions() {
    const map = {
      'new-file': newDocument,
      'open-file': openFileDialog,
      'save-file': saveActiveDocument,
      'save-file-as': () => saveAsFlow(),
      'export-as': (fmt) => exportAsFlow(fmt),
      print: () => window.print(),
      'close-window': () => window.poagit.window.close(),
      'open-find': () => openFindReplace(false),
      'open-find-replace': () => openFindReplace(true),
      'paste-plain': pastePlainText,
      'toggle-sidebar': () => PT.ui.toggleSidebar(),
      'toggle-outline': () => PT.ui.showPanel('outline'),
      'toggle-stats': () => PT.ui.showPanel('stats'),
      'toggle-line-numbers': () => document.getElementById('setLineNumbers').click(),
      'toggle-focus-mode': toggleFocusMode,
      'toggle-fullscreen': () => window.poagit.window.toggleFullscreen(),
      zoom: (delta) => PT.editor.zoomBy(delta),
      'set-theme': (id) => { PT.state.setSetting('theme', id); PT.themes.applyTheme(id); },
      'open-theme-picker': openThemePicker,
      format: (cmd) => PT.editor.exec(cmd),
      'open-tool': (id) => PT.tools.open(id),
      'toggle-brainstorm': () => PT.ui.showPanel('brainstorm'),
      'open-sync': () => PT.ui.openOverlay('syncOverlay'),
      'open-collab': () => PT.ui.openOverlay('collabOverlay'),
      'open-share': () => PT.cloud.openShareWithCurrentDocument(),
      'open-font-picker': openFontPicker,
      'open-extensions': () => PT.ui.showPanel('tools'),
      'open-shortcuts': () => PT.ui.openOverlay('shortcutsOverlay'),
      'check-for-updates': () => window.poagit.updater.check(),
      'open-settings': () => PT.ui.openOverlay('settingsOverlay'),
      'open-about': () => PT.ui.openOverlay('settingsOverlay'),
    };
    window.poagit.menu.onAction((action, ...args) => {
      if (action === 'save-then-close') return; // handled by wireCloseGuard
      map[action]?.(...args);
    });
  }

  async function saveAsFlow() {
    const doc = PT.state.getActiveDocument();
    if (!doc) return;
    PT.editor.captureContent();
    const fresh = PT.state.getActiveDocument();
    const res = await window.poagit.fs.saveAs({ content: fresh.content, suggestedName: fresh.fileName, defaultExt: fresh.mode === 'plain' ? 'txt' : 'html' });
    if (res.success) {
      PT.state.updateDocument(fresh.id, { filePath: res.filePath, fileName: res.fileName });
      PT.state.markDirty(fresh.id, false);
      PT.ui.renderTabs();
      PT.ui.toast('Saved', 'success');
    }
  }

  async function exportAsFlow(format) {
    const doc = PT.state.getActiveDocument();
    if (!doc) return;
    PT.editor.captureContent();
    const fresh = PT.state.getActiveDocument();
    const el = PT.editor.activeElement();

    let content;
    const isBinary = false;
    if (format === 'txt') content = el.innerText;
    else if (format === 'md') content = htmlToMarkdown(fresh.mode === 'plain' ? `<pre>${el.innerText}</pre>` : el.innerHTML);
    else if (format === 'html') content = wrapFullHtml(fresh.mode === 'plain' ? `<pre>${escapeHtml(el.innerText)}</pre>` : el.innerHTML);
    else if (format === 'rtf') content = htmlToRtf(fresh.mode === 'plain' ? escapeHtml(el.innerText) : el.innerHTML);
    else content = el.innerText;

    const res = await window.poagit.fs.exportAs({
      content, format, isBinary,
      suggestedName: fresh.fileName.replace(/\.[^.]+$/, '') + '.' + format,
    });
    if (res.success) PT.ui.toast(`Exported ${res.fileName}`, 'success');
  }

  function escapeHtml(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function wrapFullHtml(bodyHtml) {
    return `<!DOCTYPE html>\n<html><head><meta charset="UTF-8"><title>Document</title></head><body>${bodyHtml}</body></html>`;
  }

  function htmlToMarkdown(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    const walk = (node) => {
      let out = '';
      node.childNodes.forEach((child) => {
        if (child.nodeType === 3) { out += child.textContent; return; }
        const tag = child.tagName?.toLowerCase();
        const inner = walk(child);
        switch (tag) {
          case 'h1': out += `\n# ${inner}\n`; break;
          case 'h2': out += `\n## ${inner}\n`; break;
          case 'h3': out += `\n### ${inner}\n`; break;
          case 'strong': case 'b': out += `**${inner}**`; break;
          case 'em': case 'i': out += `*${inner}*`; break;
          case 'a': out += `[${inner}](${child.getAttribute('href') || ''})`; break;
          case 'li': out += `- ${inner}\n`; break;
          case 'blockquote': out += `\n> ${inner}\n`; break;
          case 'br': out += '\n'; break;
          case 'p': out += `\n${inner}\n`; break;
          default: out += inner;
        }
      });
      return out;
    };
    return walk(tmp).replace(/\n{3,}/g, '\n\n').trim();
  }

  function htmlToRtf(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    const text = (tmp.innerText || '').replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}').replace(/\n/g, '\\par ');
    return `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Arial;}}\\f0\\fs24 ${text}}`;
  }

  function pastePlainText() {
    const el = PT.editor.activeElement();
    el.focus();
    navigator.clipboard.readText().then((text) => {
      document.execCommand('insertText', false, text);
      PT.editor.captureContent();
    }).catch(() => {});
  }

  // ---------------------------------------------------------------------
  // Keyboard shortcuts (renderer-side, for things the native menu
  // accelerators don't already cover or when the menu is unavailable)
  // ---------------------------------------------------------------------
  function wireKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      if (e.key.toLowerCase() === 'k') { e.preventDefault(); PT.ui.openCommandPalette(); return; }
      if (e.key.toLowerCase() === 'f' && !e.shiftKey) { e.preventDefault(); openFindReplace(false); return; }
      if (e.key.toLowerCase() === 'h') { e.preventDefault(); openFindReplace(true); return; }
      if (e.key === '.') { e.preventDefault(); toggleFocusMode(); return; }
      if (e.key === 'b' && !document.activeElement.closest('#richEditor, #plainEditor')) {
        e.preventDefault();
        PT.ui.toggleSidebar();
      }
    });
  }

  // ---------------------------------------------------------------------
  // Auto-update UI wiring
  // ---------------------------------------------------------------------
  function wireUpdaterUI() {
    window.poagit.updater.onStatus((status) => {
      const area = document.getElementById('updateProgressArea');
      const fill = document.getElementById('updateProgressFill');
      const label = document.getElementById('updateProgressLabel');

      if (status.status === 'checking') {
        PT.ui.toast('Checking for updates…', 'info');
      } else if (status.status === 'not-available') {
        PT.ui.toast("You're on the latest version", 'success');
      } else if (status.status === 'dev-mode') {
        PT.ui.toast('Update checks are disabled in development mode', 'info');
      } else if (status.status === 'available') {
        area.style.display = 'block';
        label.textContent = `Version ${status.version} is available.`;
        fill.style.width = '0%';
        window.poagit.updater.download();
      } else if (status.status === 'downloading') {
        area.style.display = 'block';
        fill.style.width = `${status.percent}%`;
        label.textContent = `Downloading update… ${status.percent}%`;
      } else if (status.status === 'downloaded') {
        label.textContent = `Version ${status.version} downloaded — restart to install.`;
        fill.style.width = '100%';
        if (!document.getElementById('installUpdateBtn')) {
          const btn = document.createElement('button');
          btn.id = 'installUpdateBtn';
          btn.className = 'btn btn-primary btn-sm';
          btn.style.marginTop = '10px';
          btn.innerHTML = '<i class="fa-solid fa-arrow-rotate-right"></i> Restart & Install';
          btn.addEventListener('click', () => window.poagit.updater.install());
          area.appendChild(btn);
        }
      } else if (status.status === 'error') {
        PT.ui.toast(`Update check failed: ${status.message}`, 'error');
      }
    });
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
