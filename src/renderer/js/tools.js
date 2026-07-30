'use strict';

/**
 * tools.js
 * ------------------------------------------------------------------
 * The "Modules" toolbox: small, genuinely useful text utilities that
 * don't need any backend, plus the image/custom-font insertion flows
 * that go through the main process via IPC.
 * ------------------------------------------------------------------
 */

PT.tools = (() => {
  const TOOL_DEFS = {
    base64: { title: 'Base64 Encode / Decode', icon: 'fa-code', sub: 'Convert text to and from Base64' },
    case: { title: 'Case Converter', icon: 'fa-font', sub: 'UPPERCASE, lowercase, Title Case, and more' },
    'sort-lines': { title: 'Sort Lines', icon: 'fa-arrow-down-a-z', sub: 'Alphabetically sort each line' },
    'reverse-lines': { title: 'Reverse Lines', icon: 'fa-arrow-down-short-wide', sub: 'Flip the order of every line' },
    'trim-spaces': { title: 'Remove Extra Spaces', icon: 'fa-broom', sub: 'Collapse repeated spaces and blank lines' },
    qr: { title: 'QR Code Generator', icon: 'fa-qrcode', sub: 'Turn text or a link into a scannable code' },
  };

  function getSelectedOrAllText() {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.toString().trim()) return sel.toString();
    const el = PT.editor.activeElement();
    return el.innerText || '';
  }

  function open(toolId) {
    const def = TOOL_DEFS[toolId];
    if (!def) return;
    document.getElementById('toolModalIcon').className = `fa-solid ${def.icon}`;
    document.getElementById('toolModalTitle').textContent = def.title;
    document.getElementById('toolModalSub').textContent = def.sub;
    const body = document.getElementById('toolModalBody');
    const footer = document.getElementById('toolModalFooter');
    body.innerHTML = '';
    footer.innerHTML = '';

    const builders = {
      base64: buildBase64,
      case: buildCase,
      'sort-lines': () => buildLineTool('sort'),
      'reverse-lines': () => buildLineTool('reverse'),
      'trim-spaces': buildTrimSpaces,
      qr: buildQr,
    };
    builders[toolId]?.(body, footer);
    PT.ui.openOverlay('toolOverlay');
  }

  function insertResultButton(footer, getResult, label = 'Insert into Document') {
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary btn-sm';
    btn.innerHTML = `<i class="fa-solid fa-arrow-right-to-bracket"></i> ${label}`;
    btn.addEventListener('click', () => {
      const result = getResult();
      if (!result) return;
      const el = PT.editor.activeElement();
      el.focus();
      document.execCommand('insertText', false, result);
      PT.editor.captureContent();
      PT.ui.closeOverlay('toolOverlay');
      PT.ui.toast('Inserted into document', 'success');
    });
    footer.appendChild(btn);
  }

  function copyButton(footer, getResult) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-secondary btn-sm';
    btn.innerHTML = '<i class="fa-regular fa-copy"></i> Copy';
    btn.addEventListener('click', async () => {
      const result = getResult();
      if (!result) return;
      try {
        await navigator.clipboard.writeText(result);
        PT.ui.toast('Copied to clipboard', 'success');
      } catch {
        PT.ui.toast('Could not access clipboard', 'error');
      }
    });
    footer.appendChild(btn);
  }

  // ---------------------------------------------------------------------
  // Base64
  // ---------------------------------------------------------------------
  function buildBase64(body, footer) {
    body.innerHTML = `
      <div class="segmented" style="margin-bottom:14px;">
        <button class="active" data-b64-mode="encode">Encode</button>
        <button data-b64-mode="decode">Decode</button>
      </div>
      <div class="tool-io">
        <div><label class="field-label">Input</label><textarea class="field" id="b64Input" rows="5"></textarea></div>
        <div><label class="field-label">Output</label><textarea class="field" id="b64Output" rows="5" readonly></textarea></div>
      </div>`;
    body.querySelector('#b64Input').value = getSelectedOrAllText();

    let mode = 'encode';
    const run = () => {
      const input = body.querySelector('#b64Input').value;
      const output = body.querySelector('#b64Output');
      try {
        output.value = mode === 'encode'
          ? btoa(unescape(encodeURIComponent(input)))
          : decodeURIComponent(escape(atob(input)));
      } catch {
        output.value = mode === 'encode' ? '' : '⚠️ Not valid Base64.';
      }
    };
    body.querySelectorAll('[data-b64-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        body.querySelectorAll('[data-b64-mode]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        mode = btn.dataset.b64Mode;
        run();
      });
    });
    body.querySelector('#b64Input').addEventListener('input', run);
    run();

    copyButton(footer, () => body.querySelector('#b64Output').value);
    insertResultButton(footer, () => body.querySelector('#b64Output').value);
  }

  // ---------------------------------------------------------------------
  // Case converter
  // ---------------------------------------------------------------------
  function buildCase(body, footer) {
    body.innerHTML = `
      <div class="tool-io">
        <div><label class="field-label">Input</label><textarea class="field" id="caseInput" rows="5"></textarea></div>
      </div>
      <div class="panel-section" style="padding-left:0; padding-right:0;">
        <div style="display:flex; flex-wrap:wrap; gap:8px;">
          <button class="chip" data-case="upper">UPPERCASE</button>
          <button class="chip" data-case="lower">lowercase</button>
          <button class="chip" data-case="title">Title Case</button>
          <button class="chip" data-case="sentence">Sentence case</button>
          <button class="chip" data-case="toggle">tOGGLE cASE</button>
          <button class="chip" data-case="camel">camelCase</button>
          <button class="chip" data-case="snake">snake_case</button>
          <button class="chip" data-case="kebab">kebab-case</button>
        </div>
      </div>
      <div class="tool-io" style="margin-top:12px;">
        <div><label class="field-label">Output</label><textarea class="field" id="caseOutput" rows="5" readonly></textarea></div>
      </div>`;
    body.querySelector('#caseInput').value = getSelectedOrAllText();

    const converters = {
      upper: (s) => s.toUpperCase(),
      lower: (s) => s.toLowerCase(),
      title: (s) => s.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase()),
      sentence: (s) => s.toLowerCase().replace(/(^\s*\w|[.!?]\s+\w)/g, (m) => m.toUpperCase()),
      toggle: (s) => [...s].map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join(''),
      camel: (s) => s.toLowerCase().replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase()),
      snake: (s) => s.trim().toLowerCase().replace(/[^a-zA-Z0-9]+/g, '_'),
      kebab: (s) => s.trim().toLowerCase().replace(/[^a-zA-Z0-9]+/g, '-'),
    };

    body.querySelectorAll('[data-case]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const input = body.querySelector('#caseInput').value;
        body.querySelector('#caseOutput').value = converters[btn.dataset.case](input);
      });
    });

    copyButton(footer, () => body.querySelector('#caseOutput').value);
    insertResultButton(footer, () => body.querySelector('#caseOutput').value);
  }

  // ---------------------------------------------------------------------
  // Sort / Reverse lines
  // ---------------------------------------------------------------------
  function buildLineTool(kind) {
    return (body, footer) => {
      body.innerHTML = `
        ${kind === 'sort' ? `<div style="display:flex; gap:16px; margin-bottom:12px;">
          <label style="display:flex; align-items:center; gap:6px; font-size:12px;"><input type="checkbox" id="sortDesc"/> Descending</label>
          <label style="display:flex; align-items:center; gap:6px; font-size:12px;"><input type="checkbox" id="sortDedupe"/> Remove duplicates</label>
        </div>` : ''}
        <div class="tool-io">
          <div><label class="field-label">Input</label><textarea class="field" id="lineInput" rows="6"></textarea></div>
          <div><label class="field-label">Output</label><textarea class="field" id="lineOutput" rows="6" readonly></textarea></div>
        </div>`;
      body.querySelector('#lineInput').value = getSelectedOrAllText();

      const run = () => {
        let lines = body.querySelector('#lineInput').value.split('\n');
        if (kind === 'sort') {
          const desc = body.querySelector('#sortDesc')?.checked;
          const dedupe = body.querySelector('#sortDedupe')?.checked;
          lines.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
          if (desc) lines.reverse();
          if (dedupe) lines = [...new Set(lines)];
        } else {
          lines.reverse();
        }
        body.querySelector('#lineOutput').value = lines.join('\n');
      };
      body.querySelectorAll('input, textarea').forEach((el) => el.addEventListener('input', run));
      run();

      copyButton(footer, () => body.querySelector('#lineOutput').value);
      insertResultButton(footer, () => body.querySelector('#lineOutput').value);
    };
  }

  // ---------------------------------------------------------------------
  // Trim / clean whitespace
  // ---------------------------------------------------------------------
  function buildTrimSpaces(body, footer) {
    body.innerHTML = `
      <div class="tool-io">
        <div><label class="field-label">Input</label><textarea class="field" id="trimInput" rows="6"></textarea></div>
        <div><label class="field-label">Output</label><textarea class="field" id="trimOutput" rows="6" readonly></textarea></div>
      </div>`;
    body.querySelector('#trimInput').value = getSelectedOrAllText();
    const run = () => {
      const input = body.querySelector('#trimInput').value;
      const cleaned = input
        .split('\n')
        .map((line) => line.replace(/[ \t]+/g, ' ').trimEnd())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      body.querySelector('#trimOutput').value = cleaned;
    };
    body.querySelector('#trimInput').addEventListener('input', run);
    run();
    copyButton(footer, () => body.querySelector('#trimOutput').value);
    insertResultButton(footer, () => body.querySelector('#trimOutput').value);
  }

  // ---------------------------------------------------------------------
  // QR Code
  // ---------------------------------------------------------------------
  function buildQr(body, footer) {
    body.innerHTML = `
      <label class="field-label">Text or URL</label>
      <input type="text" class="field" id="qrInput" placeholder="https://example.com" style="margin-bottom:14px;" />
      <div id="qrPreview"><p class="text-muted" style="font-size:12px;">Type something to generate a code.</p></div>
      <p id="qrError" class="text-muted" style="font-size:11.5px; color:var(--danger); margin-top:8px;"></p>
    `;
    const sel = getSelectedOrAllText().trim();
    if (sel) body.querySelector('#qrInput').value = sel.slice(0, 200);

    let currentSvg = '';
    const run = () => {
      const text = body.querySelector('#qrInput').value.trim();
      const preview = body.querySelector('#qrPreview');
      const errorEl = body.querySelector('#qrError');
      errorEl.textContent = '';
      if (!text) {
        preview.innerHTML = '<p class="text-muted" style="font-size:12px;">Type something to generate a code.</p>';
        currentSvg = '';
        return;
      }
      try {
        const qr = window.QR.encode(text, { moduleSize: 6, margin: 3 });
        currentSvg = window.QR.toSVG(qr, { dark: '#150c26', light: '#ffffff' });
        preview.innerHTML = currentSvg;
      } catch (err) {
        preview.innerHTML = '';
        errorEl.textContent = err.message;
        currentSvg = '';
      }
    };
    body.querySelector('#qrInput').addEventListener('input', run);
    run();

    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'btn btn-secondary btn-sm';
    downloadBtn.innerHTML = '<i class="fa-solid fa-download"></i> Save as PNG…';
    downloadBtn.addEventListener('click', () => downloadQrAsPng(currentSvg));
    footer.appendChild(downloadBtn);

    const insertBtn = document.createElement('button');
    insertBtn.className = 'btn btn-primary btn-sm';
    insertBtn.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket"></i> Insert into Document';
    insertBtn.addEventListener('click', () => {
      if (!currentSvg) return;
      const dataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(currentSvg)))}`;
      PT.editor.insertImage(dataUrl);
      PT.ui.closeOverlay('toolOverlay');
      PT.ui.toast('QR code inserted', 'success');
    });
    footer.appendChild(insertBtn);
  }

  function downloadQrAsPng(svgString) {
    if (!svgString) return;
    const img = new Image();
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(svgBlob);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      canvas.getContext('2d').drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob(async (blob) => {
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = reader.result.split(',')[1];
          const res = await window.poagit.fs.exportAs({ content: base64, format: 'png', isBinary: true, suggestedName: 'qr-code.png' });
          if (res.success) PT.ui.toast('QR code saved', 'success');
        };
        reader.readAsDataURL(blob);
      }, 'image/png');
    };
    img.src = url;
  }

  // ---------------------------------------------------------------------
  // Insert image / custom font (via main-process file dialogs)
  // ---------------------------------------------------------------------
  async function insertImage() {
    const res = await window.poagit.fs.pickImage();
    if (res.success) {
      PT.editor.insertImage(res.dataUrl);
      PT.ui.toast(`Inserted ${res.fileName}`, 'success');
    } else if (res.error) {
      PT.ui.toast(res.error, 'error');
    }
  }

  async function uploadCustomFont() {
    const res = await window.poagit.fs.pickFont();
    if (res.success) {
      PT.fonts.registerCustomFont(res.fontName, res.dataUrl);
      PT.editor.setFontFamily(res.fontName);
      PT.ui.renderFontGrid();
      PT.ui.toast(`Added font "${res.fontName}"`, 'success');
    } else if (res.error) {
      PT.ui.toast(res.error, 'error');
    }
  }

  return { open, insertImage, uploadCustomFont };
})();
