/**
 * KingCode Lens — QR encoder tests (test/qrcode.test.js).
 * Validates docs/vendor/qrcode.js structurally: finder/timing/format geometry,
 * Reed-Solomon syndromes (Horner evaluation — the definition of a valid RS
 * codeword), and byte-mode payload round-trip through an independent zigzag
 * walk. A fuller cross-check (independent Python decoder) ran 2026-09-18.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { encodeQr, QR_MAX_BYTES } from '../docs/vendor/qrcode.js';

/* Independent GF(256) for the syndrome check (not shared with the encoder). */
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) {
  EXP[i] = x; LOG[x] = i;
  x <<= 1; if (x & 0x100) x ^= 0x11d;
}
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const gmul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);
const horner = (coeffs, pt) => coeffs.reduce((r, c) => gmul(r, pt) ^ c, 0);

const FINDER = [
  [1,1,1,1,1,1,1],[1,0,0,0,0,0,1],[1,0,1,1,1,0,1],[1,0,1,1,1,0,1],
  [1,0,1,1,1,0,1],[1,0,0,0,0,0,1],[1,1,1,1,1,1,1],
];
const MASKS = [
  (r,c)=>(r+c)%2===0,(r,c)=>r%2===0,(r,c)=>c%3===0,(r,c)=>(r+c)%3===0,
  (r,c)=>(Math.floor(r/2)+Math.floor(c/3))%2===0,
  (r,c)=>((r*c)%2+(r*c)%3)===0,
  (r,c)=>(((r*c)%2)+((r*c)%3))%2===0,
  (r,c)=>(((r+c)%2)+((r*c)%3))%2===0,
];
const ALIGN = { 1: [], 2: [6,18], 3: [6,22], 4: [6,26], 5: [6,30] };
const EC_CW = { 1: 7, 2: 10, 3: 15, 4: 20, 5: 26 };
const REM = { 1: 0, 2: 7, 3: 7, 4: 7, 5: 7 };

/** Independent function-pattern layout (spec geometry, not the encoder's). */
function functionCells(version, size) {
  const f = new Set();
  const add = (r, c) => { if (r >= 0 && c >= 0 && r < size && c < size) f.add(r * size + c); };
  for (const [r0, c0] of [[0,0],[0,size-7],[size-7,0]]) {
    for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) add(r0+r, c0+c);
    for (let i = -1; i <= 7; i++) { add(r0-1,c0+i); add(r0+7,c0+i); add(r0+i,c0-1); add(r0+i,c0+7); }
  }
  for (let i = 8; i < size - 8; i++) { add(6,i); add(i,6); }
  const ac = ALIGN[version], last = ac.length - 1;
  ac.forEach((rr, i) => ac.forEach((rc, j) => {
    if ((i===0&&j===0)||(i===0&&j===last)||(i===last&&j===0)) return;
    for (let r = rr-2; r <= rr+2; r++) for (let c = rc-2; c <= rc+2; c++) add(r,c);
  }));
  const pos = [];
  for (let i = 0; i <= 5; i++) pos.push([8,i]);
  pos.push([8,7],[8,8],[7,8]);
  for (let i = 5; i >= 0; i--) pos.push([i,8]);
  for (let i = 0; i <= 6; i++) pos.push([size-1-i,8]);
  for (let i = 0; i <= 7; i++) pos.push([8,size-8+i]);
  pos.forEach(([r,c]) => add(r,c));
  add(4*version+9, 8);
  return f;
}

/** Full independent decode: returns { mask, codewords, payloadBytes }. */
function decodeIndependent(qr) {
  const { version, size, modules } = qr;
  const at = (r, c) => modules[r*size+c];
  const func = functionCells(version, size);
  // format info: first copy, bit 14 first
  const pos = [];
  for (let i = 0; i <= 5; i++) pos.push([8,i]);
  pos.push([8,7],[8,8],[7,8]);
  for (let i = 5; i >= 0; i--) pos.push([i,8]);
  let raw = 0;
  pos.forEach(([r,c], k) => { raw |= at(r,c) << (14-k); });
  const unmasked = raw ^ 0x5412;
  const data5 = unmasked >>> 10;
  // BCH check
  let rem = data5 << 10;
  for (let i = 14; i >= 10; i--) if ((rem >>> i) & 1) rem ^= 0x537 << (i-10);
  assert.equal(rem & 0x3ff, unmasked & 0x3ff, 'format BCH');
  const ecLevel = (data5 >>> 3) & 0b11;
  const mask = data5 & 0b111;
  assert.equal(ecLevel, 0b01, 'EC level L');
  // zigzag walk
  const bits = [];
  let col = size - 1, upward = true;
  while (col > 0) {
    if (col === 6) col--;
    const rows = upward
      ? Array.from({length: size}, (_, i) => size-1-i)
      : Array.from({length: size}, (_, i) => i);
    for (const r of rows) for (const c of [col, col-1]) {
      if (!func.has(r*size+c)) bits.push(at(r,c) ^ (MASKS[mask](r,c) ? 1 : 0));
    }
    upward = !upward; col -= 2;
  }
  const nCw = {1:26,2:44,3:70,4:100,5:134}[version];
  assert.equal(bits.length, nCw*8 + REM[version], 'data capacity');
  assert.ok(bits.slice(nCw*8).every((b) => b===0), 'remainder bits zero');
  const cwBits = bits.slice(0, nCw*8);
  const codewords = [];
  for (let i = 0; i < cwBits.length; i += 8)
    codewords.push(cwBits.slice(i, i+8).reduce((a,b) => (a<<1)|b, 0));
  const mode = cwBits.slice(0,4).reduce((a,b)=>(a<<1)|b,0);
  assert.equal(mode, 0b0100, 'byte mode');
  const count = cwBits.slice(4,12).reduce((a,b)=>(a<<1)|b,0);
  const payload = [];
  for (let k = 0; k < count; k++)
    payload.push(cwBits.slice(12+8*k, 20+8*k).reduce((a,b)=>(a<<1)|b,0));
  return { mask, codewords, payloadBytes: payload, ecCount: EC_CW[version] };
}

function checkMatrix(qr, text) {
  const { version, size, modules } = qr;
  assert.equal(size, 17 + 4*version, 'symbol size');
  const at = (r, c) => modules[r*size+c];
  for (const [r0,c0] of [[0,0],[0,size-7],[size-7,0]])
    for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++)
      assert.equal(at(r0+r,c0+c), FINDER[r][c], `finder ${(r0,c0)}`);
  for (let i = 8; i < size-8; i++) {
    assert.equal(at(6,i), i%2===0?1:0, 'timing row');
    assert.equal(at(i,6), i%2===0?1:0, 'timing col');
  }
  assert.equal(at(4*version+9, 8), 1, 'dark module');
  const { codewords, payloadBytes, ecCount } = decodeIndependent(qr);
  for (let i = 0; i < ecCount; i++)
    assert.equal(horner(codewords, EXP[i]), 0, `RS syndrome S${i}`);
  assert.deepEqual(payloadBytes, Array.from(new TextEncoder().encode(text)), 'payload round-trip');
}

describe('qrcode: encoder', () => {
  it('rejects empty and oversize payloads (degraded path)', () => {
    assert.equal(encodeQr(''), null);
    assert.equal(encodeQr('x'.repeat(QR_MAX_BYTES + 1)), null);
    assert.equal(QR_MAX_BYTES, 106);
  });

  it('encodes a 1-byte payload as version 1 with valid RS + round-trip', () => {
    checkMatrix(encodeQr('A'), 'A');
  });

  it('encodes the demo URL (version 3) with valid RS + round-trip', () => {
    const url = 'https://cumulativewebinc.github.io/cwi-kingcode-lens/';
    const qr = encodeQr(url);
    assert.equal(qr.version, 3);
    checkMatrix(qr, url);
  });

  it('round-trips multi-byte UTF-8', () => {
    const t = 'héllo ✓ wörld 😀';
    checkMatrix(encodeQr(t), t);
  });

  it('encodes the 106-byte maximum (version 5)', () => {
    const t = 'x'.repeat(QR_MAX_BYTES);
    const qr = encodeQr(t);
    assert.equal(qr.version, 5);
    checkMatrix(qr, t);
  });

  it('emits only binary modules, symbol only (no quiet zone)', () => {
    const qr = encodeQr('test');
    assert.ok(qr.modules instanceof Uint8Array);
    assert.equal(qr.modules.length, qr.size * qr.size);
    assert.ok([...qr.modules].every((v) => v === 0 || v === 1));
  });
});
