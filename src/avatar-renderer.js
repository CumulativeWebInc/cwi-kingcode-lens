/**
 * avatar-renderer.js — Generates one self-contained SVG avatar frame per
 * avatar state, per spec/INTERFACES.md §1:
 *   frame = { state, svg, text, ts }
 * Rules enforced here:
 *  - DARK background (#000), high contrast, glanceable.
 *  - Avatar occupies the center ~40% of the viewport.
 *  - No external refs (no <image>, no external CSS/fonts); SMIL animation
 *    is allowed because it is self-contained.
 *  - frameBytes(frame) must stay under every backend's maxFrameBytes.
 */
import { AvatarState } from './states.js';

const CYAN = '#22e6ff';
const DIM = '#0e5a66';
const AMBER = '#ffbf2e';
const GREEN = '#2eff8f';
const RED = '#ff4d5e';
const WHITE = '#ffffff';

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function shell(inner, caption) {
  const cap = caption
    ? `<text x="300" y="560" text-anchor="middle" font-family="monospace" font-size="30" fill="${WHITE}" opacity="0.92">${esc(caption)}</text>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600">` +
    `<rect x="0" y="0" width="600" height="600" fill="#000000"/>` +
    inner + cap + `</svg>`;
}

const FRAMES = {
  [AvatarState.IDLE]() {
    return (
      `<circle cx="300" cy="270" r="120" fill="none" stroke="${DIM}" stroke-width="10"/>` +
      `<circle cx="300" cy="270" r="46" fill="none" stroke="${DIM}" stroke-width="6"/>` +
      `<text x="300" y="470" text-anchor="middle" font-family="monospace" font-size="28" fill="${DIM}">STANDBY</text>`
    );
  },
  [AvatarState.LISTENING]() {
    const arcs = [0, 1, 2, 3]
      .map(
        (i) =>
          `<circle cx="300" cy="270" r="${130 + i * 22}" fill="none" stroke="${CYAN}" stroke-width="6" opacity="${0.85 - i * 0.2}">` +
          `<animate attributeName="opacity" values="${0.85 - i * 0.2};0.15;${0.85 - i * 0.2}" dur="${1 + i * 0.25}s" repeatCount="indefinite"/></circle>`,
      )
      .join('');
    const bars = [0, 1, 2, 3, 4, 5, 6]
      .map(
        (i) =>
          `<rect x="${228 + i * 22}" y="${250 - (i % 3) * 12}" width="12" height="${40 + (i % 3) * 24}" fill="${CYAN}" opacity="0.9">` +
          `<animate attributeName="height" values="${40 + (i % 3) * 24};${20 + (i % 2) * 10};${40 + (i % 3) * 24}" dur="0.7s" repeatCount="indefinite"/>` +
          `<animate attributeName="y" values="${250 - (i % 3) * 12};${260 - (i % 2) * 5};${250 - (i % 3) * 12}" dur="0.7s" repeatCount="indefinite"/></rect>`,
      )
      .join('');
    return (
      arcs +
      `<circle cx="300" cy="270" r="100" fill="none" stroke="${CYAN}" stroke-width="10"/>` +
      bars +
      `<text x="300" y="470" text-anchor="middle" font-family="monospace" font-size="28" fill="${CYAN}">LISTENING</text>`
    );
  },
  [AvatarState.THINKING]() {
    const dots = [0, 1, 2]
      .map(
        (i) =>
          `<circle cx="${240 + i * 60}" cy="270" r="20" fill="${AMBER}">` +
          `<animate attributeName="opacity" values="1;0.25;1" dur="0.9s" begin="${i * 0.3}s" repeatCount="indefinite"/></circle>`,
      )
      .join('');
    return (
      `<circle cx="300" cy="270" r="120" fill="none" stroke="${AMBER}" stroke-width="8" stroke-dasharray="40 26">` +
      `<animateTransform attributeName="transform" type="rotate" from="0 300 270" to="360 300 270" dur="2.4s" repeatCount="indefinite"/></circle>` +
      dots +
      `<text x="300" y="470" text-anchor="middle" font-family="monospace" font-size="28" fill="${AMBER}">THINKING</text>`
    );
  },
  [AvatarState.SPEAKING]() {
    const waves = [0, 1, 2]
      .map(
        (i) =>
          `<ellipse cx="300" cy="270" rx="${70 + i * 42}" ry="${34 + i * 22}" fill="none" stroke="${GREEN}" stroke-width="7" opacity="${0.9 - i * 0.28}">` +
          `<animate attributeName="rx" values="${70 + i * 42};${86 + i * 42};${70 + i * 42}" dur="1.1s" repeatCount="indefinite"/></ellipse>`,
      )
      .join('');
    return (
      waves +
      `<circle cx="300" cy="270" r="44" fill="${GREEN}" opacity="0.95"/>` +
      `<circle cx="300" cy="270" r="18" fill="#000000"/>` +
      `<text x="300" y="470" text-anchor="middle" font-family="monospace" font-size="28" fill="${GREEN}">SPEAKING</text>`
    );
  },
  [AvatarState.CONFIRMING]() {
    return (
      `<circle cx="300" cy="270" r="120" fill="none" stroke="${RED}" stroke-width="10"/>` +
      `<text x="300" y="330" text-anchor="middle" font-family="monospace" font-size="120" font-weight="bold" fill="${RED}">?</text>` +
      `<text x="215" y="470" text-anchor="middle" font-family="monospace" font-size="30" fill="${GREEN}">YES</text>` +
      `<text x="385" y="470" text-anchor="middle" font-family="monospace" font-size="30" fill="${RED}">NO</text>` +
      `<text x="300" y="510" text-anchor="middle" font-family="monospace" font-size="22" fill="${WHITE}" opacity="0.85">say yes / no</text>`
    );
  },
};

export class AvatarRenderer {
  /**
   * @param {{width?:number,height?:number}} [opts] render target; informational
   *   (SVGs are viewBox-scaled so they fit any lens).
   */
  constructor({ width = 600, height = 600 } = {}) {
    this.width = width;
    this.height = height;
    this._seq = 0; // monotonic frame sequence; one renderer instance ==
                   // one logical connection for seq purposes (spec §1 v1.1)
  }

  /**
   * @param {string} state one of AvatarState
   * @param {string|null} [text] optional caption rendered under the avatar
   * @returns {{state:string, svg:string, text:string|null, ts:number, seq:number}}
   */
  render(state, text = null) {
    const fn = FRAMES[state];
    if (!fn) throw new Error(`AvatarRenderer: unknown state ${String(state)}`);
    const svg = shell(fn(), text);
    this._seq += 1;
    return { state, svg, text, ts: Date.now(), seq: this._seq };
  }

  /** Byte size of the svg payload (utf-8). Works in Node and browsers. */
  frameBytes(frame) {
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(frame.svg).length;
    }
    return unescape(encodeURIComponent(frame.svg)).length;
  }

  /** All states this renderer can draw. */
  states() {
    return Object.keys(FRAMES);
  }
}
