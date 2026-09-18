/**
 * KingCode Lens demo — minimal QR encoder (docs/vendor/qrcode.js).
 *
 * ORIGINAL CWI implementation (2026-09-18), zero dependencies, written for the
 * "View on Glasses" fallback modal. NOT third-party vendored code: the header
 * says so explicitly to keep the generated-vs-vendored labeling honest.
 *
 * Scope (deliberately small, documented):
 *  - Byte mode (UTF-8), error-correction level L, QR versions 1-5.
 *  - Single data block per version (true for L at versions 1-5), so no
 *    block interleaving is needed.
 *  - Max payload: 106 bytes (version 5-L holds 108 data codewords, minus the
 *    2-codeword mode+count header). Longer payloads -> encodeQr returns null
 *    and the caller falls back to the copy-link degraded state (per spec).
 *
 * Reference: the QR Code model-2 bit layout (finder/timing/alignment patterns,
 * zigzag data placement, mask patterns, format-info BCH) as documented in the
 * public Thonky QR tutorial and ISO/IEC 18004 summaries.
 */

/* ---------- Galois field GF(256) ---------- */
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d; // x^8 + x^4 + x^3 + x^2 + 1
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();
const gfMul = (a, b) => (a === 0 || b === 0 ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]]);

/* ---------- version table: versions 1-5, EC level L ---------- */
const VERSIONS = [
  null,
  { dataCodewords: 19, ecCodewords: 7, align: [] },
  { dataCodewords: 34, ecCodewords: 10, align: [6, 18] },
  { dataCodewords: 55, ecCodewords: 15, align: [6, 22] },
  { dataCodewords: 80, ecCodewords: 20, align: [6, 26] },
  { dataCodewords: 108, ecCodewords: 26, align: [6, 30] },
];
const EC_LEVEL_BITS = 0b01; // L
export const QR_MAX_BYTES = 106;

/* ---------- Reed-Solomon ---------- */
function rsGenerator(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMul(poly[j], GF_EXP[i]); // * alpha^i
      next[j + 1] ^= poly[j]; // * x
    }
    poly = next;
  }
  return poly;
}
function rsRemainder(data, degree) {
  // rsGenerator returns ASCENDING coefficients [g_0 .. g_{n-1}, 1].
  // The shift-register step needs them in DESCENDING order (excluding the
  // leading 1): res[i] ^= factor * g_{n-1-i}. Using them ascending produces
  // valid-looking but unscannable symbols — caught by independent verification.
  const gen = rsGenerator(degree);
  const res = new Array(degree).fill(0);
  for (const b of data) {
    const factor = b ^ res.shift();
    res.push(0);
    if (factor !== 0) {
      for (let i = 0; i < degree; i++) res[i] ^= gfMul(gen[degree - 1 - i], factor);
    }
  }
  return res;
}

/* ---------- bit buffer ---------- */
function pushBits(buf, val, n) {
  for (let i = n - 1; i >= 0; i--) buf.push((val >>> i) & 1);
}
function bitsToBytes(buf) {
  const out = [];
  for (let i = 0; i < buf.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | (buf[i + j] || 0);
    out.push(b);
  }
  return out;
}

/* ---------- mask patterns (data modules only) ---------- */
const MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r, c) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2 + (r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

/* ---------- matrix helpers ---------- */
function blankMatrix(size) {
  const m = [];
  for (let r = 0; r < size; r++) m.push(new Array(size).fill(-1));
  return m;
}
function placeFinder(m, r0, c0) {
  const pat = [
    [1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 1],
    [1, 0, 1, 1, 1, 0, 1],
    [1, 0, 1, 1, 1, 0, 1],
    [1, 0, 1, 1, 1, 0, 1],
    [1, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1],
  ];
  for (let r = 0; r < 7; r++)
    for (let c = 0; c < 7; c++) m[r0 + r][c0 + c] = pat[r][c];
  // separator: 1-module white border around the finder
  for (let i = -1; i <= 7; i++) {
    if (m[r0 - 1] && m[r0 - 1][c0 + i] === -1) m[r0 - 1][c0 + i] = 0;
    if (m[r0 + 7] && m[r0 + 7][c0 + i] === -1) m[r0 + 7][c0 + i] = 0;
    if (m[r0 + i] && m[r0 + i][c0 - 1] === -1) m[r0 + i][c0 - 1] = 0;
    if (m[r0 + i] && m[r0 + i][c0 + 7] === -1) m[r0 + i][c0 + 7] = 0;
  }
}
function placeAlignment(m, r0, c0) {
  const pat = [
    [1, 1, 1, 1, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 1, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 1, 1, 1, 1],
  ];
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 5; c++) m[r0 + r][c0 + c] = pat[r][c];
}
function formatBits(mask) {
  const data = (EC_LEVEL_BITS << 3) | mask; // 5 bits
  let bits = data << 10;
  const gen = 0x537;
  let rem = bits;
  // polynomial long division over GF(2)
  for (let i = 14; i >= 10; i--) {
    if ((rem >>> i) & 1) rem ^= gen << (i - 10);
  }
  return ((data << 10) | (rem & 0x3ff)) ^ 0x5412; // XOR format mask
}
function placeFormat(m, size, mask) {
  const bits = formatBits(mask);
  const bit = (i) => (bits >>> i) & 1;
  // formatPositions returns 30 entries: first 15 = copy 1 (bit 14 first),
  // last 15 = copy 2 (bit 14 first)
  formatPositions(size).forEach(([r, c], k) => { m[r][c] = bit(14 - (k % 15)); });
}
function formatPositions(size) {
  // 15-bit format info, bit 14 first. Reserved BEFORE data placement so data
  // bits never land in format cells (they'd be overwritten and corrupt the
  // stream). Values are written later by placeFormat, after masking.
  const pos = [];
  for (let i = 0; i <= 5; i++) pos.push([8, i]);
  pos.push([8, 7], [8, 8], [7, 8]);
  for (let i = 5; i >= 0; i--) pos.push([i, 8]);
  for (let i = 0; i <= 6; i++) pos.push([size - 1 - i, 8]);
  for (let i = 0; i <= 7; i++) pos.push([8, size - 8 + i]);
  return pos;
}
function buildFunctionPatterns(version) {
  const size = 17 + 4 * version;
  const m = blankMatrix(size);
  placeFinder(m, 0, 0);
  placeFinder(m, 0, size - 7);
  placeFinder(m, size - 7, 0);
  // timing patterns
  for (let i = 8; i < size - 8; i++) {
    if (m[6][i] === -1) m[6][i] = i % 2 === 0 ? 1 : 0;
    if (m[i][6] === -1) m[i][6] = i % 2 === 0 ? 1 : 0;
  }
  // alignment patterns: every row-center x column-center combination EXCEPT
  // the three that would overlap finder patterns (spec rule)
  const centers = VERSIONS[version].align;
  const last = centers.length - 1;
  for (let i = 0; i < centers.length; i++) {
    for (let j = 0; j < centers.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
      placeAlignment(m, centers[i] - 2, centers[j] - 2);
    }
  }
  // dark module
  m[4 * version + 9][8] = 1;
  // reserve format-info cells (values written later by placeFormat)
  for (const [r, c] of formatPositions(size)) if (m[r][c] === -1) m[r][c] = 0;
  return m;
}
function isDataCell(m, r, c) {
  return m[r][c] === -1;
}
function placeDataBits(m, size, bytes) {
  // Writes the codeword stream into data cells in zigzag order. Cells beyond
  // the stream (the version's spec remainder bits: 0 for v1, 7 for v2-v5)
  // are filled with 0 (light), per the QR spec.
  let byteIdx = 0, bitIdx = 7;
  const nextBit = () => {
    if (byteIdx >= bytes.length) return 0;
    const b = (bytes[byteIdx] >>> bitIdx) & 1;
    if (bitIdx === 0) { bitIdx = 7; byteIdx++; } else bitIdx--;
    return b;
  };
  // Column pairs snake from the bottom-right upward, alternating direction
  // per pair; column 6 (timing) is skipped. `pair` counts pairs explicitly so
  // the direction can't drift after the column-6 skip.
  let pair = 0;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--; // skip the vertical timing column
    const upward = pair % 2 === 0;
    for (let row = 0; row < size; row++) {
      const r = upward ? size - 1 - row : row;
      for (let k = 0; k < 2; k++) {
        const c = col - k;
        if (isDataCell(m, r, c)) m[r][c] = nextBit();
      }
    }
    pair++;
  }
}
function penalty(m, size) {
  let score = 0;
  // rule 1: runs of 5+ in rows/cols
  for (let r = 0; r < size; r++) {
    let run = 1;
    for (let c = 1; c < size; c++) {
      if (m[r][c] === m[r][c - 1]) run++;
      else { if (run >= 5) score += 3 + (run - 5); run = 1; }
    }
    if (run >= 5) score += 3 + (run - 5);
  }
  for (let c = 0; c < size; c++) {
    let run = 1;
    for (let r = 1; r < size; r++) {
      if (m[r][c] === m[r - 1][c]) run++;
      else { if (run >= 5) score += 3 + (run - 5); run = 1; }
    }
    if (run >= 5) score += 3 + (run - 5);
  }
  // rule 2: 2x2 blocks
  for (let r = 0; r < size - 1; r++)
    for (let c = 0; c < size - 1; c++) {
      const v = m[r][c];
      if (m[r][c + 1] === v && m[r + 1][c] === v && m[r + 1][c + 1] === v) score += 3;
    }
  // rule 3: finder-like patterns 10111010000 / 00001011101
  const pat1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const pat2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
  const scanLine = (line) => {
    for (let i = 0; i + 11 <= line.length; i++) {
      const seg = line.slice(i, i + 11);
      if (seg.every((v, k) => v === pat1[k]) || seg.every((v, k) => v === pat2[k])) score += 40;
    }
  };
  for (let r = 0; r < size; r++) scanLine(m[r]);
  for (let c = 0; c < size; c++) scanLine(m.map((row) => row[c]));
  // rule 4: dark ratio
  let dark = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) dark += m[r][c];
  const pct = (dark * 100) / (size * size);
  score += 10 * Math.floor(Math.abs(pct - 50) / 5);
  return score;
}

/**
 * Encode text (UTF-8, byte mode) as a QR symbol.
 * @returns {{version:number, size:number, modules:Uint8Array}|null}
 *   modules is row-major, 1=dark, 0=light, symbol only (NO quiet zone —
 *   the caller adds the 4-module quiet zone when rendering).
 *   Returns null when the payload exceeds QR_MAX_BYTES (caller degrades
 *   to the copy-link state instead of faking a code).
 */
export function encodeQr(text) {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length === 0 || bytes.length > QR_MAX_BYTES) return null;

  let version = 0;
  for (let v = 1; v <= 5; v++) {
    const cap = VERSIONS[v].dataCodewords;
    const needed = Math.ceil((4 + 8 + bytes.length * 8 + 4) / 8); // mode+count+data+terminator slack
    if (needed <= cap) { version = v; break; }
  }
  if (!version) return null;
  const { dataCodewords, ecCodewords } = VERSIONS[version];
  const size = 17 + 4 * version;

  // data codewords: mode 0100, 8-bit count, payload, terminator, byte pad, EC/11 pad
  const buf = [];
  pushBits(buf, 0b0100, 4);
  pushBits(buf, bytes.length, 8);
  for (const b of bytes) pushBits(buf, b, 8);
  const capacityBits = dataCodewords * 8;
  const termLen = Math.min(4, capacityBits - buf.length);
  pushBits(buf, 0, termLen);
  while (buf.length % 8 !== 0) buf.push(0);
  const data = bitsToBytes(buf);
  for (let i = data.length; i < dataCodewords; i++) data.push(i % 2 === 0 ? 0xec : 0x11);

  const ec = rsRemainder(data, ecCodewords);
  const codewords = data.concat(ec);

  // function patterns, then data, then best mask + format info
  const base = buildFunctionPatterns(version);
  // Data cells = cells still unset BEFORE data placement (function patterns
  // are never -1 at this point). Masking must touch only these cells.
  const dataCells = [];
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++)
      if (base[r][c] === -1) dataCells.push([r, c]);
  placeDataBits(base, size, codewords);

  let best = null, bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const m = base.map((row) => row.slice());
    for (const [r, c] of dataCells) if (MASKS[mask](r, c)) m[r][c] ^= 1;
    placeFormat(m, size, mask);
    const s = penalty(m, size);
    if (s < bestScore) { bestScore = s; best = m; }
  }

  const modules = new Uint8Array(size * size);
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) modules[r * size + c] = best[r][c];
  return { version, size, modules };
}
