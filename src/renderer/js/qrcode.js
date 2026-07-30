'use strict';

/**
 * qrcode.js
 * ------------------------------------------------------------------
 * A from-scratch implementation of the public QR Code algorithm
 * (ISO/IEC 18004), byte mode only, versions 1–10, error-correction
 * level M. That covers the practical range for this app — short
 * text, URLs, contact snippets — without shipping an external QR
 * library. Written directly against the published algorithm rather
 * than adapted from any particular existing implementation:
 *   1. Galois Field GF(256) arithmetic for Reed–Solomon
 *   2. Data encoding + padding to the version's byte capacity
 *   3. Reed–Solomon error correction codewords
 *   4. Module placement (finder/separator/timing/alignment patterns)
 *   5. All 8 mask patterns evaluated by the standard penalty rules,
 *      best one kept
 *   6. Format information bits (EC level + mask) written last
 * ------------------------------------------------------------------
 */
(function (global) {
  // ---- GF(256) tables (primitive polynomial x^8+x^4+x^3+x^2+1 = 0x11D) --
  const GF_EXP = new Array(512);
  const GF_LOG = new Array(256);
  (function buildTables() {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      GF_EXP[i] = x;
      GF_LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
  })();

  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return GF_EXP[GF_LOG[a] + GF_LOG[b]];
  }

  function rsGeneratorPoly(degree) {
    let poly = [1];
    for (let i = 0; i < degree; i++) {
      const next = new Array(poly.length + 1).fill(0);
      for (let j = 0; j < poly.length; j++) {
        next[j] ^= gfMul(poly[j], 1);
        next[j + 1] ^= gfMul(poly[j], GF_EXP[i]);
      }
      poly = next;
    }
    return poly;
  }

  function rsEncode(dataBytes, ecCount) {
    const generator = rsGeneratorPoly(ecCount);
    const result = dataBytes.concat(new Array(ecCount).fill(0));
    for (let i = 0; i < dataBytes.length; i++) {
      const coef = result[i];
      if (coef === 0) continue;
      for (let j = 0; j < generator.length; j++) {
        result[i + j] ^= gfMul(generator[j], coef);
      }
    }
    return result.slice(dataBytes.length);
  }

  // ---- Version capacity table: byte mode, EC level M --------------------
  // [totalCodewords, ecCodewordsPerBlock, numBlocksGroup1, dataCodewordsGroup1, numBlocksGroup2, dataCodewordsGroup2]
  const VERSION_TABLE_M = [
    null,
    { total: 26, ec: 10, g1: 1, dc1: 16, g2: 0, dc2: 0 },
    { total: 44, ec: 16, g1: 1, dc1: 28, g2: 0, dc2: 0 },
    { total: 70, ec: 26, g1: 1, dc1: 44, g2: 0, dc2: 0 },
    { total: 100, ec: 18, g1: 2, dc1: 32, g2: 0, dc2: 0 },
    { total: 134, ec: 24, g1: 2, dc1: 43, g2: 0, dc2: 0 },
    { total: 172, ec: 16, g1: 4, dc1: 27, g2: 0, dc2: 0 },
    { total: 196, ec: 18, g1: 4, dc1: 31, g2: 0, dc2: 0 },
    { total: 242, ec: 22, g1: 2, dc1: 38, g2: 2, dc2: 39 },
    { total: 292, ec: 22, g1: 3, dc1: 36, g2: 2, dc2: 37 },
    { total: 346, ec: 26, g1: 4, dc1: 43, g2: 1, dc2: 44 },
  ];
  const ALIGNMENT_COORDS = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

  function dataCapacityBytes(v) {
    const t = VERSION_TABLE_M[v];
    return t.g1 * t.dc1 + t.g2 * t.dc2;
  }

  function pickVersion(byteLength) {
    for (let v = 1; v <= 10; v++) {
      // byte-mode header (4 bits mode + 8 bits length for v1-9, 16 for v10) — approximate with 2 bytes overhead.
      const capacity = dataCapacityBytes(v) - 2;
      if (byteLength <= capacity) return v;
    }
    return null; // too much data for this encoder's supported range
  }

  function buildDataCodewords(text, version) {
    const bytes = Array.from(new TextEncoder().encode(text));
    const totalDataCodewords = dataCapacityBytes(version);
    const countBits = version <= 9 ? 8 : 16;

    const bits = [];
    const pushBits = (value, len) => { for (let i = len - 1; i >= 0; i--) bits.push((value >> i) & 1); };

    pushBits(0b0100, 4); // byte mode indicator
    pushBits(bytes.length, countBits);
    bytes.forEach((b) => pushBits(b, 8));

    // Terminator + pad to byte boundary
    for (let i = 0; i < 4 && bits.length < totalDataCodewords * 8; i++) bits.push(0);
    while (bits.length % 8 !== 0) bits.push(0);

    const codewords = [];
    for (let i = 0; i < bits.length; i += 8) {
      let byte = 0;
      for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
      codewords.push(byte);
    }
    const pads = [0xec, 0x11];
    let p = 0;
    while (codewords.length < totalDataCodewords) codewords.push(pads[p++ % 2]);
    return codewords;
  }

  function interleave(dataCodewords, version) {
    const t = VERSION_TABLE_M[version];
    const blocks = [];
    let offset = 0;
    for (let i = 0; i < t.g1; i++) { blocks.push(dataCodewords.slice(offset, offset + t.dc1)); offset += t.dc1; }
    for (let i = 0; i < t.g2; i++) { blocks.push(dataCodewords.slice(offset, offset + t.dc2)); offset += t.dc2; }

    const ecBlocks = blocks.map((b) => rsEncode(b, t.ec));

    const result = [];
    const maxDataLen = Math.max(t.dc1, t.dc2 || 0);
    for (let i = 0; i < maxDataLen; i++) {
      blocks.forEach((b) => { if (i < b.length) result.push(b[i]); });
    }
    for (let i = 0; i < t.ec; i++) {
      ecBlocks.forEach((b) => result.push(b[i]));
    }
    return result;
  }

  // ---- Matrix construction ----------------------------------------------
  function createMatrix(version) {
    const size = version * 4 + 17;
    const matrix = Array.from({ length: size }, () => new Array(size).fill(null));

    function setFinder(row, col) {
      for (let r = -1; r <= 7; r++) {
        for (let c = -1; c <= 7; c++) {
          const rr = row + r, cc = col + c;
          if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
          const isBorder = r === -1 || r === 7 || c === -1 || c === 7;
          const isRing = r >= 0 && r <= 6 && c >= 0 && c <= 6 && (r === 0 || r === 6 || c === 0 || c === 6);
          const isCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          matrix[rr][cc] = isBorder ? 0 : (isRing || isCore) ? 1 : 0;
        }
      }
    }
    setFinder(0, 0);
    setFinder(0, size - 7);
    setFinder(size - 7, 0);

    // Timing patterns
    for (let i = 8; i < size - 8; i++) {
      matrix[6][i] = i % 2 === 0 ? 1 : 0;
      matrix[i][6] = i % 2 === 0 ? 1 : 0;
    }

    // Alignment patterns
    const coords = ALIGNMENT_COORDS[version] || [];
    coords.forEach((r) => {
      coords.forEach((c) => {
        if ((r === 6 && c === 6) || (r === 6 && c === size - 7) || (r === size - 7 && c === 6)) return;
        // Note: we do NOT skip based on whether the center cell is
        // already set. Alignment patterns legitimately overlap the
        // timing pattern line whenever one of their coordinates is 6
        // (e.g. version 7's (22, 6) / (6, 22) positions) — the
        // alignment pattern takes precedence and overwrites it. Only
        // true finder-pattern overlaps (excluded above) should be skipped.
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const on = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
            matrix[r + dr][c + dc] = on ? 1 : 0;
          }
        }
      });
    });

    // Dark module + reserved format-info areas
    matrix[size - 8][8] = 1;
    for (let i = 0; i < 9; i++) {
      if (matrix[8][i] === null) matrix[8][i] = 'reserved';
      if (matrix[i][8] === null) matrix[i][8] = 'reserved';
    }
    for (let i = size - 8; i < size; i++) {
      if (matrix[8][i] === null) matrix[8][i] = 'reserved';
      if (matrix[i][8] === null) matrix[i][8] = 'reserved';
    }

    // Version information blocks (required for version >= 7 — a QR
    // code this size needs its version number spelled out explicitly
    // rather than inferred purely from the module count).
    if (version >= 7) {
      for (let i = 0; i < 18; i++) {
        const r1 = Math.floor(i / 3);
        const c1 = (i % 3) + size - 8 - 3;
        matrix[r1][c1] = 'reserved';
        const r2 = (i % 3) + size - 8 - 3;
        const c2 = Math.floor(i / 3);
        matrix[r2][c2] = 'reserved';
      }
    }

    return { matrix, size };
  }

  function placeData(matrixInfo, codewords) {
    const { matrix, size } = matrixInfo;
    const bits = [];
    codewords.forEach((byte) => { for (let i = 7; i >= 0; i--) bits.push((byte >> i) & 1); });

    let bitIndex = 0;
    let upward = true;
    for (let col = size - 1; col > 0; col -= 2) {
      if (col === 6) col--; // skip timing column
      for (let i = 0; i < size; i++) {
        const row = upward ? size - 1 - i : i;
        for (const c of [col, col - 1]) {
          if (matrix[row][c] === null) {
            matrix[row][c] = bitIndex < bits.length ? bits[bitIndex] : 0;
            bitIndex++;
          }
        }
      }
      upward = !upward;
    }
  }

  function applyMask(matrixInfo, maskFn, dataMask) {
    const { matrix, size } = matrixInfo;
    const out = matrix.map((row) => row.slice());
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const isData = dataMask[r][c];
        if (isData && maskFn(r, c)) out[r][c] = out[r][c] ? 0 : 1;
      }
    }
    return out;
  }

  const MASK_FNS = [
    (r, c) => (r + c) % 2 === 0,
    (r) => r % 2 === 0,
    (r, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
  ];

  function penalty(matrix) {
    const size = matrix.length;
    const at = (r, c) => (matrix[r][c] === 'reserved' ? 0 : matrix[r][c]);
    let score = 0;
    const FINDER_SEQ = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
    const FINDER_SEQ_REV = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];

    function hasFinderSeq(arr) {
      for (let i = 0; i + 11 <= arr.length; i++) {
        const slice = arr.slice(i, i + 11);
        if (slice.every((v, j) => v === FINDER_SEQ[j]) || slice.every((v, j) => v === FINDER_SEQ_REV[j])) return true;
      }
      return false;
    }

    // Rule 1: runs of 5+ same-color modules in a row/col
    for (let r = 0; r < size; r++) {
      let run = 1;
      for (let c = 1; c < size; c++) {
        if (at(r, c) === at(r, c - 1)) { run++; } else { if (run >= 5) score += 3 + (run - 5); run = 1; }
      }
      if (run >= 5) score += 3 + (run - 5);
    }
    for (let c = 0; c < size; c++) {
      let run = 1;
      for (let r = 1; r < size; r++) {
        if (at(r, c) === at(r - 1, c)) { run++; } else { if (run >= 5) score += 3 + (run - 5); run = 1; }
      }
      if (run >= 5) score += 3 + (run - 5);
    }
    // Rule 2: 2x2 blocks of same color
    for (let r = 0; r < size - 1; r++) {
      for (let c = 0; c < size - 1; c++) {
        const v = at(r, c);
        if (v === at(r, c + 1) && v === at(r + 1, c) && v === at(r + 1, c + 1)) score += 3;
      }
    }
    // Rule 3: finder-pattern lookalike sequences (1:1:3:1:1 module ratio)
    for (let r = 0; r < size; r++) {
      const row = [];
      for (let c = 0; c < size; c++) row.push(at(r, c));
      if (hasFinderSeq(row)) score += 40;
    }
    for (let c = 0; c < size; c++) {
      const col = [];
      for (let r = 0; r < size; r++) col.push(at(r, c));
      if (hasFinderSeq(col)) score += 40;
    }
    // Rule 4: overall dark-module ratio deviation from 50%
    let dark = 0;
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (at(r, c)) dark++;
    const ratio = (dark / (size * size)) * 100;
    score += Math.floor(Math.abs(ratio - 50) / 5) * 10;
    return score;
  }

  function encode(text, { moduleSize = 6, margin = 4 } = {}) {
    const byteLength = new TextEncoder().encode(text).length;
    const version = pickVersion(byteLength);
    if (!version) throw new Error('Text is too long for this QR generator (roughly 200 characters max).');

    const dataCodewords = buildDataCodewords(text, version);
    const finalCodewords = interleave(dataCodewords, version);
    const matrixInfo = createMatrix(version);

    // Snapshot of which cells are "data" (not function patterns) before placement.
    const dataMask = matrixInfo.matrix.map((row) => row.map((v) => v === null));
    placeData(matrixInfo, finalCodewords);

    let best = null;
    let bestScore = Infinity;
    let bestMaskIndex = 0;
    MASK_FNS.forEach((fn, idx) => {
      const masked = applyMask(matrixInfo, fn, dataMask);
      const score = penalty(masked);
      if (score < bestScore) { bestScore = score; best = masked; bestMaskIndex = idx; }
    });

    writeFormatInfo(best, bestMaskIndex);
    writeVersionInfo(best, version, matrixInfo.size);

    return { matrix: best, size: matrixInfo.size, moduleSize, margin, version };
  }

  // Version info: 18-bit BCH(18,6) code, required for version >= 7.
  // Generator polynomial 0b1111100100101 (degree 12), no XOR mask
  // (unlike format info, version info is not masked).
  function writeVersionInfo(matrix, version, size) {
    if (version < 7) return;
    const G = 0b1111100100101;
    let bch = version << 12;
    for (let i = 5; i >= 0; i--) {
      if (bch & (1 << (i + 12))) bch ^= G << i;
    }
    const bits18 = (version << 12) | bch;

    for (let i = 0; i < 18; i++) {
      const bit = (bits18 >> i) & 1;
      matrix[Math.floor(i / 3)][(i % 3) + size - 8 - 3] = bit;
      matrix[(i % 3) + size - 8 - 3][Math.floor(i / 3)] = bit;
    }
  }

  // Format info: EC level M = '00', 15-bit BCH code with fixed generator 0x537, XOR mask 0x5412.
  // Placement mirrors the standard algorithm exactly: bit i (LSB-first)
  // goes into a specific position in the vertical strip (column 8,
  // skipping the timing-pattern row) and the horizontal strip (row 8).
  function writeFormatInfo(matrix, maskIndex) {
    const size = matrix.length;
    const ecBits = 0b00; // M
    const data = (ecBits << 3) | maskIndex;
    let bch = data << 10;
    const G = 0b10100110111;
    for (let i = 4; i >= 0; i--) {
      if (bch & (1 << (i + 10))) bch ^= G << i;
    }
    const formatBits = ((data << 10) | bch) ^ 0b101010000010010;
    const bitAt = (i) => (formatBits >> i) & 1;

    // Vertical strip (column 8)
    for (let i = 0; i < 15; i++) {
      const bit = bitAt(i);
      if (i < 6) matrix[i][8] = bit;
      else if (i < 8) matrix[i + 1][8] = bit;
      else matrix[size - 15 + i][8] = bit;
    }
    // Horizontal strip (row 8)
    for (let i = 0; i < 15; i++) {
      const bit = bitAt(i);
      if (i < 8) matrix[8][size - i - 1] = bit;
      else if (i < 9) matrix[8][15 - i - 1 + 1] = bit;
      else matrix[8][15 - i - 1] = bit;
    }
  }

  function toSVG(qr, { light = '#ffffff', dark = '#150c26' } = {}) {
    const dim = (qr.size + qr.margin * 2) * qr.moduleSize;
    let rects = '';
    for (let r = 0; r < qr.size; r++) {
      for (let c = 0; c < qr.size; c++) {
        if (qr.matrix[r][c]) {
          const x = (c + qr.margin) * qr.moduleSize;
          const y = (r + qr.margin) * qr.moduleSize;
          rects += `<rect x="${x}" y="${y}" width="${qr.moduleSize}" height="${qr.moduleSize}"/>`;
        }
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" width="${dim}" height="${dim}"><rect width="100%" height="100%" fill="${light}"/><g fill="${dark}">${rects}</g></svg>`;
  }

  const QR = { encode, toSVG };
  if (typeof module !== 'undefined' && module.exports) module.exports = QR;
  else global.QR = QR;
})(typeof window !== 'undefined' ? window : globalThis);
