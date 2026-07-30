'use strict';

/**
 * state.js
 * ------------------------------------------------------------------
 * A small, framework-free state layer. Everything else in the
 * renderer (editor.js, ui.js, tools.js, brainstorm.js, cloud.js,
 * app.js) reads and writes through `PT.state`, and reacts to changes
 * via `PT.state.on(event, callback)`. No virtual DOM, no build step —
 * just a plain object plus an event bus, which is all an app this
 * size actually needs.
 * ------------------------------------------------------------------
 */

window.PT = window.PT || {};

PT.state = (() => {
  const listeners = new Map();

  function on(event, cb) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(cb);
    return () => listeners.get(event)?.delete(cb);
  }

  function emit(event, payload) {
    listeners.get(event)?.forEach((cb) => {
      try {
        cb(payload);
      } catch (err) {
        console.error(`[state] listener for "${event}" threw:`, err);
      }
    });
  }

  let uidCounter = 0;
  function uid() {
    uidCounter += 1;
    return `doc_${Date.now().toString(36)}_${uidCounter}`;
  }

  /** @typedef {{id:string, filePath:?string, fileName:string, mode:'rich'|'plain', content:string, isDirty:boolean, createdAt:number}} PoagitDocument */

  const documents = new Map();
  let activeId = null;
  let untitledCounter = 0;

  const settings = {
    theme: 'poagit-classic',
    mode: 'light',
    matchSystem: false,
    fontFamily: 'Inter',
    editorZoom: 100,
    sidebarVisible: true,
    lastPanel: 'explorer',
    lineNumbers: false,
    editorLayout: 'flow',
    marginGuides: false,
    caretStyle: 'gradient',
    performanceMode: false,
    autoCheckForUpdates: true,
    closeGuardEnabled: true,
    customTheme: null,
  };

  function createDocument({ filePath = null, fileName = null, mode = 'rich', content = '' } = {}) {
    untitledCounter += 1;
    const doc = {
      id: uid(),
      filePath,
      fileName: fileName || `Untitled-${untitledCounter}`,
      mode,
      content,
      isDirty: false,
      createdAt: Date.now(),
    };
    documents.set(doc.id, doc);
    return doc;
  }

  function getDocument(id) {
    return documents.get(id || activeId) || null;
  }

  function getActiveDocument() {
    return documents.get(activeId) || null;
  }

  function allDocuments() {
    return [...documents.values()];
  }

  function setActive(id) {
    if (!documents.has(id)) return;
    activeId = id;
    emit('active-changed', getActiveDocument());
  }

  function updateDocument(id, patch) {
    const doc = documents.get(id);
    if (!doc) return null;
    Object.assign(doc, patch);
    emit('document-changed', doc);
    return doc;
  }

  function closeDocument(id) {
    const doc = documents.get(id);
    if (!doc) return;
    documents.delete(id);
    emit('document-closed', doc);
    if (activeId === id) {
      const remaining = allDocuments();
      if (remaining.length) {
        setActive(remaining[remaining.length - 1].id);
      } else {
        activeId = null;
        const fresh = createDocument();
        emit('document-created', fresh);
        setActive(fresh.id);
      }
    }
  }

  function markDirty(id, dirty = true) {
    const doc = documents.get(id);
    if (!doc || doc.isDirty === dirty) return;
    doc.isDirty = dirty;
    emit('dirty-changed', doc);
  }

  function anyDirty() {
    return allDocuments().some((d) => d.isDirty);
  }

  function setSetting(key, value) {
    settings[key] = value;
    emit('setting-changed', { key, value });
    window.poagit?.settings?.set(key, value);
  }

  function hydrateSettings(remote) {
    Object.assign(settings, remote || {});
    emit('settings-hydrated', settings);
  }

  return {
    on,
    emit,
    uid,
    settings,
    createDocument,
    getDocument,
    getActiveDocument,
    allDocuments,
    setActive,
    updateDocument,
    closeDocument,
    markDirty,
    anyDirty,
    setSetting,
    hydrateSettings,
    get activeId() {
      return activeId;
    },
  };
})();
