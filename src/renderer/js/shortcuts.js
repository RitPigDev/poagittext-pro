'use strict';

/**
 * shortcuts.js
 * ------------------------------------------------------------------
 * A single source of truth for keyboard shortcuts, used both to
 * render the "Keyboard Shortcuts" help modal and (in app.js) to
 * actually bind the keys. Keeping the list here means the help modal
 * can never silently drift out of sync with what actually works.
 * ------------------------------------------------------------------
 */

PT.shortcuts = (() => {
  const isMac = navigator.platform.toUpperCase().includes('MAC');
  const mod = isMac ? '⌘' : 'Ctrl';

  const GROUPS = [
    {
      title: 'Document',
      items: [
        [`${mod}+N`, 'New document'],
        [`${mod}+Shift+N`, 'New window'],
        [`${mod}+O`, 'Open…'],
        [`${mod}+S`, 'Save'],
        [`${mod}+Shift+S`, 'Save As…'],
        [`${mod}+W`, 'Close tab'],
      ],
    },
    {
      title: 'Editing',
      items: [
        [`${mod}+Z`, 'Undo'],
        [`${mod}+Shift+Z`, 'Redo'],
        [`${mod}+B`, 'Bold'],
        [`${mod}+I`, 'Italic'],
        [`${mod}+U`, 'Underline'],
        [`${mod}+F`, 'Find'],
        [`${mod}+H`, 'Find & Replace'],
        ['Tab / Shift+Tab', 'Indent / outdent'],
      ],
    },
    {
      title: 'View',
      items: [
        [`${mod}+K`, 'Command palette'],
        [`${mod}+B`, 'Toggle sidebar (when not editing)'],
        [`${mod}+.`, 'Focus mode'],
        [isMac ? 'Ctrl+⌘+F' : 'F11', 'Full screen'],
        [`${mod}+ +/-`, 'Zoom in / out'],
        [`${mod}+0`, 'Reset zoom'],
      ],
    },
  ];

  function render() {
    const body = document.getElementById('shortcutsBody');
    body.innerHTML = GROUPS.map((g) => `
      <div class="panel-section" style="padding-left:0; padding-right:0;">
        <h4>${g.title}</h4>
        ${g.items.map(([key, label]) => `
          <div class="settings-row">
            <div class="row-label" style="font-weight:500;">${label}</div>
            <span class="cmd-shortcut" style="background:var(--surface-3); padding:3px 9px; border-radius:6px;">${key}</span>
          </div>`).join('')}
      </div>`).join('');
  }

  return { render, GROUPS };
})();
