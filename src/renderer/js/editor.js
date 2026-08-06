'use strict';

/**
 * editor.js
 * ------------------------------------------------------------------
 * Owns the two editable surfaces (#richEditor / #plainEditor), all
 * formatting commands, live statistics, the
 * gradient caret indicator, focus mode, zoom, and find & replace.
 *
 * Undo/redo deliberately rides on the browser's native
 * `document.execCommand('undo'/'redo')` for contenteditable elements
 * rather than a hand-rolled history stack — Chromium's built-in
 * editing history already does the right thing here, and reimplementing
 * it is a common source of subtle bugs (cursor jumps, lost selections)
 * for very little benefit.
 * ------------------------------------------------------------------
 */

PT.editor = (() => {
  let richEl, plainEl, gutterEl, caretLayer, floatingBar;
  let debounceTimer = null;
  let statsDebounceTimer = null;

  function activeEl() {
    const doc = PT.state.getActiveDocument();
    return doc && doc.mode === 'plain' ? plainEl : richEl;
  }

  // ---------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------
  function init() {
    richEl = document.getElementById('richEditor');
    plainEl = document.getElementById('plainEditor');
    gutterEl = document.getElementById('editorGutter');
    floatingBar = document.getElementById('floatingFormatBar');

    caretLayer = document.createElement('div');
    caretLayer.className = 'caret-glow-layer';
    caretLayer.style.display = 'none';
    document.getElementById('editorScroll').appendChild(caretLayer);

    [richEl, plainEl].forEach((el) => {
      el.addEventListener('input', onInput);
      el.addEventListener('keyup', (e) => {
        onCaretMoved();
        if (e.key.startsWith('Arrow') || e.key === 'Enter' || e.key === 'PageUp' || e.key === 'PageDown' || e.key === 'Home' || e.key === 'End') {
          ensureCaretVisible();
        }
      });
      el.addEventListener('click', onCaretMoved);
      el.addEventListener('scroll', positionCaretGlow, { passive: true });
      el.addEventListener('mouseup', onSelectionChange);
      el.addEventListener('keydown', onKeydown);
    });
    document.addEventListener('selectionchange', onSelectionChange);

    document.getElementById('editorScroll').addEventListener('scroll', () => {
      updateLineNumbers();
      positionCaretGlow();
    }, { passive: true });

    PT.state.on('active-changed', (doc) => loadDocument(doc));
    PT.state.on('setting-changed', ({ key, value }) => {
      if (key === 'editorZoom') applyZoom(value);
      if (key === 'lineNumbers') updateLineNumbers();
    });
  }

  function onKeydown(e) {
    // Tab / Shift+Tab inside the editor indents rather than shifting focus.
    if (e.key === 'Tab') {
      e.preventDefault();
      exec(e.shiftKey ? 'outdent' : 'indent');
    }
  }

  // If the user has deleted everything, the browser commonly leaves a
  // stray `<br>` (or an empty block element) behind rather than a truly
  // empty element. That defeats the `:empty` CSS selector the placeholder
  // relies on, so the placeholder never comes back. Clean that up here.
  function normalizeEmptyState() {
    const el = activeEl();
    const bareHtml = el.innerHTML.replace(/<br\s*\/?>/gi, '').trim();
    const textOnly = el.textContent.trim();
    if (!textOnly && (bareHtml === '' || /^(<p><\/p>|<div><\/div>)$/i.test(bareHtml))) {
      el.innerHTML = '';
    }
  }

  // ---------------------------------------------------------------------
  // Document <-> editor sync
  // ---------------------------------------------------------------------
  function loadDocument(doc) {
    if (!doc) return;
    document.querySelectorAll('.editor-mode-pane').forEach((p) => p.classList.remove('active'));
    document.querySelector(`[data-mode-pane="${doc.mode}"]`).classList.add('active');
    document.querySelectorAll('#editorModeSwitch button').forEach((b) => {
      b.classList.toggle('active', b.dataset.editorMode === doc.mode);
    });

    if (doc.mode === 'plain') {
      plainEl.innerText = doc.content || '';
    } else {
      richEl.innerHTML = doc.content || '';
    }
    recomputeAll();
  }

  function captureContent() {
    const doc = PT.state.getActiveDocument();
    if (!doc) return;
    const el = activeEl();
    const content = doc.mode === 'plain' ? el.innerText : el.innerHTML;
    if (content !== doc.content) {
      PT.state.updateDocument(doc.id, { content });
      PT.state.markDirty(doc.id, true);
    }
  }

  function onInput() {
    normalizeEmptyState();
    captureContent();
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(recomputeAll, 30);
    clearTimeout(statsDebounceTimer);
    statsDebounceTimer = setTimeout(() => PT.state.emit('stats-changed', computeStats()), 350);
    updateLineNumbers();
    onCaretMoved();
    ensureCaretVisible();
  }

  function recomputeAll() {
    updateLineNumbers();
    positionCaretGlow();
    PT.state.emit('stats-changed', computeStats());
  }

  function switchEditorMode(mode) {
    const doc = PT.state.getActiveDocument();
    if (!doc || doc.mode === mode) return;
    captureContent();

    let converted;
    if (mode === 'plain') {
      // rich -> plain: flatten to text, keeping paragraph breaks readable.
      const tmp = document.createElement('div');
      tmp.innerHTML = doc.content;
      converted = tmp.innerText;
    } else {
      // plain -> rich: wrap each line in a paragraph, escaping HTML.
      const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      converted = doc.content
        .split(/\n{2,}/)
        .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
        .join('');
    }

    PT.state.updateDocument(doc.id, { mode, content: converted });
    loadDocument(PT.state.getDocument(doc.id));
  }

  // ---------------------------------------------------------------------
  // Formatting commands
  // ---------------------------------------------------------------------
  const BLOCK_TAGS = { paragraph: 'P', h1: 'H1', h2: 'H2', h3: 'H3', quote: 'BLOCKQUOTE' };

  function exec(command, value = null) {
    activeEl().focus();
    switch (command) {
      case 'bold': document.execCommand('bold'); break;
      case 'italic': document.execCommand('italic'); break;
      case 'underline': document.execCommand('underline'); break;
      case 'strikethrough': document.execCommand('strikeThrough'); break;
      case 'ul': document.execCommand('insertUnorderedList'); break;
      case 'ol': document.execCommand('insertOrderedList'); break;
      case 'indent': document.execCommand('indent'); break;
      case 'outdent': document.execCommand('outdent'); break;
      case 'align-left': document.execCommand('justifyLeft'); break;
      case 'align-center': document.execCommand('justifyCenter'); break;
      case 'align-right': document.execCommand('justifyRight'); break;
      case 'hr': document.execCommand('insertHorizontalRule'); break;
      case 'clear': document.execCommand('removeFormat'); break;
      case 'undo': document.execCommand('undo'); break;
      case 'redo': document.execCommand('redo'); break;
      case 'paragraph': case 'h1': case 'h2': case 'h3': case 'quote':
        document.execCommand('formatBlock', false, BLOCK_TAGS[command]);
        break;
      case 'text-color': document.execCommand('foreColor', false, value); break;
      case 'highlight': document.execCommand('hiliteColor', false, value); break;
      default: break;
    }
    captureContent();
    updateToolbarState();
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function insertLink(url, label) {
    activeEl().focus();
    if (label) document.execCommand('insertHTML', false, `<a href="${url.replace(/"/g, '&quot;')}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`);
    else document.execCommand('createLink', false, url);
    captureContent();
  }

  function insertImage(dataUrl) {
    activeEl().focus();
    document.execCommand('insertHTML', false, `<img src="${dataUrl}" alt="" />`);
    captureContent();
  }

  function updateToolbarState() {
    const map = { bold: 'bold', italic: 'italic', underline: 'underline', strikethrough: 'strikeThrough' };
    Object.entries(map).forEach(([action, cmd]) => {
      const btn = document.querySelector(`[data-format="${action}"]`);
      if (!btn) return;
      let active = false;
      try { active = document.queryCommandState(cmd); } catch { /* ignore */ }
      btn.classList.toggle('active', active);
    });
  }

  // ---------------------------------------------------------------------
  // Caret glow + selection tracking
  // ---------------------------------------------------------------------
  function onCaretMoved() {
    updateToolbarState();
    positionCaretGlow();
    updateCaretStatus();
    updateFocusMode();
  }

  // Chromium's native "scroll caret into view" logic is unreliable in
  // pageless (free-flow) mode here: the contenteditable sits inside a
  // flex column (#editorColumn > #editorScroll > .editor-mode-pane),
  // and with that nesting the browser will often move the caret below
  // the fold without scrolling #editorScroll to follow it — the text
  // keeps growing but the visible viewport just sits still. We can't
  // rely on the browser to fix that itself, so we do it by hand: after
  // any input or caret-moving keystroke, check whether the caret rect
  // is still inside the scroll container's visible bounds and nudge
  // scrollTop if not. This is a no-op whenever the caret is already
  // visible, so it's safe to run in page mode too.
  function ensureCaretVisible() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const el = activeEl();
    if (!el.contains(sel.anchorNode)) return;
    const scrollHost = document.getElementById('editorScroll');
    const range = sel.getRangeAt(0).cloneRange();
    const rect = range.getClientRects()[0] || range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0 && rect.top === 0)) return;
    const hostRect = scrollHost.getBoundingClientRect();
    const margin = 32;
    if (rect.bottom > hostRect.bottom - margin) {
      scrollHost.scrollTop += rect.bottom - (hostRect.bottom - margin);
    } else if (rect.top < hostRect.top + margin) {
      scrollHost.scrollTop -= (hostRect.top + margin) - rect.top;
    }
  }

  function positionCaretGlow() {
    if (PT.state.settings.performanceMode) {
      caretLayer.style.display = 'none';
      return;
    }
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) {
      caretLayer.style.display = 'none';
      return;
    }
    const el = activeEl();
    if (!el.contains(sel.anchorNode)) {
      caretLayer.style.display = 'none';
      return;
    }
    const range = sel.getRangeAt(0).cloneRange();
    const rect = range.getClientRects()[0] || range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0 && rect.top === 0)) {
      caretLayer.style.display = 'none';
      return;
    }
    const scrollHost = document.getElementById('editorScroll');
    const hostRect = scrollHost.getBoundingClientRect();
    caretLayer.style.display = 'block';
    caretLayer.style.left = `${rect.left - hostRect.left + scrollHost.scrollLeft}px`;
    caretLayer.style.top = `${rect.top - hostRect.top + scrollHost.scrollTop}px`;
    caretLayer.style.height = `${rect.height || 20}px`;
  }

  function updateCaretStatus() {
    const el = activeEl();
    const doc = PT.state.getActiveDocument();
    const text = doc?.mode === 'plain' ? el.innerText : (window.getSelection().anchorNode?.textContent || '');
    const sel = window.getSelection();
    let line = 1, col = 1;
    if (sel && sel.anchorNode) {
      const preRange = document.createRange();
      preRange.selectNodeContents(el);
      try {
        preRange.setEnd(sel.anchorNode, sel.anchorOffset);
        const pre = preRange.toString();
        const lines = pre.split('\n');
        line = lines.length;
        col = lines[lines.length - 1].length + 1;
      } catch { /* selection outside editor */ }
    }
    const label = document.getElementById('statusCaretPos');
    if (label) label.textContent = `Ln ${line}, Col ${col}`;
    void text;
  }

  function onSelectionChange() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      floatingBar.classList.remove('open');
      return;
    }
    const el = activeEl();
    if (!el.contains(sel.anchorNode)) {
      floatingBar.classList.remove('open');
      return;
    }
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      floatingBar.classList.remove('open');
      return;
    }
    const scrollHost = document.getElementById('editorScroll');
    const hostRect = scrollHost.getBoundingClientRect();
    floatingBar.style.left = `${Math.max(8, rect.left - hostRect.left + scrollHost.scrollLeft)}px`;
    floatingBar.style.top = `${rect.top - hostRect.top + scrollHost.scrollTop - 46}px`;
    floatingBar.classList.add('open');
    updateToolbarState();
  }

  // ---------------------------------------------------------------------
  // Focus mode — dim every block except the one the caret is in
  // ---------------------------------------------------------------------
  function updateFocusMode() {
    if (document.body.dataset.focusMode !== 'true') return;
    document.querySelectorAll('.focus-active').forEach((n) => n.classList.remove('focus-active'));
    const sel = window.getSelection();
    if (!sel || !sel.anchorNode) return;
    let node = sel.anchorNode;
    if (node.nodeType === 3) node = node.parentElement;
    const container = activeEl();
    while (node && node.parentElement !== container && node !== container) node = node.parentElement;
    if (node && node !== container) node.classList.add('focus-active');
  }

  // ---------------------------------------------------------------------
  // Zoom
  // ---------------------------------------------------------------------
  function applyZoom(pct) {
    const clamped = Math.max(50, Math.min(200, pct));
    document.documentElement.style.setProperty('--editor-zoom', clamped / 100);
    document.getElementById('statusZoom').textContent = `${clamped}%`;
  }

  function zoomBy(delta) {
    const next = delta === 0 ? 100 : PT.state.settings.editorZoom + delta;
    PT.state.setSetting('editorZoom', Math.max(50, Math.min(200, next)));
    applyZoom(PT.state.settings.editorZoom);
  }

  // ---------------------------------------------------------------------
  // Line numbers (Plain mode)
  // ---------------------------------------------------------------------
  function updateLineNumbers() {
    if (document.body.dataset.lineNumbers !== 'true') return;
    const doc = PT.state.getActiveDocument();
    if (!doc || doc.mode !== 'plain') {
      gutterEl.innerHTML = '';
      return;
    }
    const lineCount = Math.max(1, (plainEl.innerText.match(/\n/g) || []).length + 1);
    let html = '';
    for (let i = 1; i <= lineCount; i++) html += `<div class="gutter-line">${i}</div>`;
    gutterEl.innerHTML = html;
  }

  // ---------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------
  function computeStats() {
    const doc = PT.state.getActiveDocument();
    const el = activeEl();
    const text = (doc?.mode === 'plain' ? el.innerText : el.innerText || el.textContent || '').trim();

    const words = text.length ? text.split(/\s+/).filter(Boolean) : [];
    const chars = text.length;
    const sentences = text.length ? (text.match(/[^.!?]+[.!?]+|\S+$/g) || []).filter((s) => s.trim().length) : [];
    const paragraphs = text.length ? text.split(/\n{2,}/).filter((p) => p.trim().length) : [];
    const readTimeMin = words.length ? Math.max(1, Math.round(words.length / 220)) : 0;

    const freq = new Map();
    words.forEach((w) => {
      const key = w.toLowerCase().replace(/[^a-z0-9'-]/g, '');
      if (key.length < 3) return;
      freq.set(key, (freq.get(key) || 0) + 1);
    });
    const topWords = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

    return {
      words: words.length,
      chars,
      sentences: sentences.length,
      paragraphs: paragraphs.length || (text ? 1 : 0),
      readTimeMin: words.length ? readTimeMin : 0,
      uniqueWords: freq.size,
      topWords,
    };
  }

  // ---------------------------------------------------------------------
  // Find & Replace — manual TreeWalker-based search so we have full
  // control over highlighting and replacement (no reliance on the
  // deprecated, hard-to-control `window.find`).
  // ---------------------------------------------------------------------
  const find = (() => {
    let matches = [];
    let current = -1;

    function clearHighlights() {
      activeEl().querySelectorAll('mark.find-hit').forEach((m) => {
        const parent = m.parentNode;
        while (m.firstChild) parent.insertBefore(m.firstChild, m);
        parent.removeChild(m);
      });
      activeEl().normalize();
    }

    function run(query, { caseSensitive = false, wholeWord = false } = {}) {
      clearHighlights();
      matches = [];
      current = -1;
      if (!query) return { count: 0 };

      const el = activeEl();
      const flags = caseSensitive ? 'g' : 'gi';
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = wholeWord ? `\\b${escaped}\\b` : escaped;
      let re;
      try { re = new RegExp(pattern, flags); } catch { return { count: 0 }; }

      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
      const textNodes = [];
      let n;
      while ((n = walker.nextNode())) textNodes.push(n);

      textNodes.forEach((node) => {
        const text = node.nodeValue;
        let m;
        re.lastIndex = 0;
        const ranges = [];
        while ((m = re.exec(text))) {
          ranges.push([m.index, m.index + m[0].length]);
          if (m[0].length === 0) re.lastIndex++;
        }
        if (!ranges.length) return;

        // Wrap each match in a <mark> by rebuilding this text node's parent segment.
        let cursor = 0;
        const frag = document.createDocumentFragment();
        ranges.forEach(([start, end]) => {
          if (start > cursor) frag.appendChild(document.createTextNode(text.slice(cursor, start)));
          const mark = document.createElement('mark');
          mark.className = 'find-hit';
          mark.textContent = text.slice(start, end);
          frag.appendChild(mark);
          matches.push(mark);
          cursor = end;
        });
        if (cursor < text.length) frag.appendChild(document.createTextNode(text.slice(cursor)));
        node.parentNode.replaceChild(frag, node);
      });

      if (matches.length) goTo(0);
      return { count: matches.length };
    }

    function goTo(index) {
      matches.forEach((m) => m.classList.remove('find-hit-active'));
      if (!matches.length) return;
      current = ((index % matches.length) + matches.length) % matches.length;
      const el = matches[current];
      el.classList.add('find-hit-active');
      el.scrollIntoView({ behavior: PT.state.settings.performanceMode ? 'auto' : 'smooth', block: 'center' });
    }

    function next() { goTo(current + 1); }
    function prev() { goTo(current - 1); }

    function replaceCurrent(replacement) {
      if (current < 0 || !matches[current]) return false;
      const mark = matches[current];
      mark.replaceWith(document.createTextNode(replacement));
      matches.splice(current, 1);
      captureContent();
      if (matches.length) goTo(Math.min(current, matches.length - 1));
      return true;
    }

    function replaceAll(replacement) {
      const count = matches.length;
      matches.forEach((mark) => mark.replaceWith(document.createTextNode(replacement)));
      matches = [];
      current = -1;
      captureContent();
      return count;
    }

    return { run, next, prev, replaceCurrent, replaceAll, clear: clearHighlights, get count() { return matches.length; }, get current() { return current; } };
  })();

  // ---------------------------------------------------------------------
  // Layout toggles
  // ---------------------------------------------------------------------
  function setEditorLayout(layout) {
    document.body.dataset.editorLayout = layout;
    PT.state.setSetting('editorLayout', layout);
  }

  function setFocusMode(on) {
    document.body.dataset.focusMode = on ? 'true' : 'false';
    if (on) updateFocusMode();
    else document.querySelectorAll('.focus-active').forEach((n) => n.classList.remove('focus-active'));
  }

  function setFontFamily(family) {
    document.documentElement.style.setProperty('--current-font', `'${family}'`);
    PT.state.setSetting('fontFamily', family);
    document.getElementById('fontFamilyLabel').textContent = family;
  }

  return {
    init,
    exec,
    insertLink,
    insertImage,
    switchEditorMode,
    captureContent,
    computeStats,
    find,
    zoomBy,
    applyZoom,
    setEditorLayout,
    setFocusMode,
    setFontFamily,
    activeElement: activeEl,
    focus: () => activeEl().focus(),
  };
})();
