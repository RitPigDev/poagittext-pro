'use strict';

/**
 * brainstorm.js
 * ------------------------------------------------------------------
 * Renders the Brainstorm chat panel and sends requests through
 * `window.poagit.brainstorm.send(...)`, which is handled entirely in
 * the main process (src/main/ipc/brainstormHandler.js). The renderer
 * never sees the Groq API key or talks to the network directly.
 * ------------------------------------------------------------------
 */

PT.brainstorm = (() => {
  let mode = 'story';
  const history = { story: [], writer: [] };
  let sending = false;

  function init() {
    document.querySelectorAll('[data-bs-mode]').forEach((btn) => {
      btn.addEventListener('click', () => setMode(btn.dataset.bsMode));
    });

    const input = document.getElementById('brainstormInput');
    const sendBtn = document.getElementById('brainstormSend');

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    });
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = `${Math.min(120, input.scrollHeight)}px`;
    });
    sendBtn.addEventListener('click', send);
  }

  function setMode(next) {
    mode = next;
    document.querySelectorAll('[data-bs-mode]').forEach((b) => b.classList.toggle('active', b.dataset.bsMode === mode));
    render();
  }

  function render() {
    const container = document.getElementById('brainstormMessages');
    const msgs = history[mode];
    if (!msgs.length) {
      const emptyCopy = mode === 'story'
        ? '<strong>Story Ideas</strong> gives you concepts and direction without writing your prose for you. Switch to <strong>Writer Mode</strong> when you want direct drafting help.'
        : '<strong>Writer Mode</strong> can draft, rewrite, and edit text directly. Share a selection or just ask.';
      container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-wand-magic-sparkles"></i><p>${emptyCopy}</p></div>`;
      return;
    }
    container.innerHTML = msgs.map((m) => `
      <div class="bs-msg ${m.role}">
        ${m.role === 'assistant' && m.model ? `<div class="bs-model-tag">${PT.ui.escapeHtml(m.model)}</div>` : ''}
        <div>${renderMarkdownish(m.content)}</div>
      </div>`).join('');
    container.scrollTop = container.scrollHeight;
  }

  function renderMarkdownish(text) {
    return PT.ui.escapeHtml(text)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }

  async function send(prefilledText) {
    const input = document.getElementById('brainstormInput');
    const text = (prefilledText || input.value).trim();
    if (!text || sending) return;

    input.value = '';
    input.style.height = 'auto';
    history[mode].push({ role: 'user', content: text });
    render();

    sending = true;
    const sendBtn = document.getElementById('brainstormSend');
    sendBtn.innerHTML = '<div class="spinner"></div>';

    const apiMessages = history[mode]
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(-12)
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      const res = await window.poagit.brainstorm.send({ mode, messages: apiMessages });
      if (res.success) {
        history[mode].push({ role: 'assistant', content: res.text, model: res.model });
      } else {
        history[mode].push({ role: 'assistant', content: `Sorry — I couldn't reach Brainstorm right now (${res.error}). Please try again in a moment.` });
      }
    } catch (err) {
      history[mode].push({ role: 'assistant', content: `Something went wrong: ${err.message}` });
    } finally {
      sending = false;
      sendBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
      render();
    }
  }

  /** Invoked from the floating format bar's "ask Brainstorm about this selection" button. */
  function askAboutSelection() {
    const selection = window.getSelection().toString().trim();
    if (!selection) {
      PT.ui.toast('Select some text first', 'info');
      return;
    }
    PT.ui.showPanel('brainstorm');
    setMode('writer');
    send(`Here's a passage from my document — what do you think, and how would you improve it?\n\n"${selection}"`);
  }

  return { init, send, setMode, askAboutSelection };
})();
