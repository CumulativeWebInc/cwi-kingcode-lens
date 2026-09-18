/**
 * KingCode Lens — simulator lab (src/sim-lab.js).
 *
 * Pure, zero-dependency helpers for the in-repo Meta Ray-Ban Display lab
 * harness (docs/). Mirrors the documented behaviors of Meta's official
 * "Meta Ray-Ban Display Simulator" Chrome extension
 * (facebook/meta-wearables-webapp README + wearables.developer.meta.com
 * web-apps build guide, both public, both $0) so no future lane ever needs
 * the extension:
 *
 *   - 600x600 display frame, additive blending (black = transparent)
 *   - environment backgrounds (scenes, custom image, animated, webcam)
 *   - D-pad input (Neural Band / captouch / EMG -> arrow keys + Enter)
 *   - display settings (app brightness, background brightness, blur, auto-dim)
 *   - viewport recorder (600x600 WebM)
 *   - QA checklist (viewport surface, favicon, focusables, overflow,
 *     visible focus styles, additive-dark, font sizes, tap targets)
 *
 * All DOM access stays in docs/app.js; everything here runs in Node and is
 * covered by test/sim-lab.test.js.
 */

export const LENS = { width: 600, height: 600 };

/* ------------------------------------------------------------------ */
/* D-pad input mapping. Official: Neural Band wrist gestures and the    */
/* captouch temple strip are translated by the glasses OS into standard */
/* arrow-key + Enter events; EMG pinch fires Enter on the focused       */
/* element; Escape/Backspace is back navigation.                        */
/* ------------------------------------------------------------------ */
export const DPAD_KEY = {
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  select: 'Enter',
  back: 'Escape',
};

export function dpadKey(action) {
  const k = DPAD_KEY[action];
  if (!k) {
    throw new Error(
      `sim-lab: unknown dpad action "${action}" (want one of ${Object.keys(DPAD_KEY).join(', ')})`,
    );
  }
  return k;
}

/* ------------------------------------------------------------------ */
/* Display settings. Official extension: app brightness, background     */
/* brightness, background blur, auto-dimming.                          */
/* ------------------------------------------------------------------ */
export const AUTO_DIM_MS = 30000;
export const AUTO_DIM_LEVEL = 0.35;

export function clamp01(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * CSS filter strings for the additive lens stack.
 * The app (frame) layer dims as a whole; the environment background gets
 * its own brightness + blur so readability tests stay meaningful.
 */
export function displayFilters({ appBrightness = 1, bgBrightness = 1, bgBlur = 0, dimmed = false } = {}) {
  const app = clamp01(appBrightness) * (dimmed ? AUTO_DIM_LEVEL : 1);
  const blur = Math.max(0, Number(bgBlur) || 0);
  return {
    lensFilter: `brightness(${app.toFixed(3)})`,
    bgFilter: `brightness(${clamp01(bgBrightness).toFixed(3)}) blur(${blur}px)`,
  };
}

/* ------------------------------------------------------------------ */
/* Additive blending. The waveguide adds light: pure black contributes   */
/* zero light and is fully transparent. We simulate with screen blend.  */
/* ------------------------------------------------------------------ */
export function additiveBlendMode() {
  return 'screen';
}

export function hexToRgb(hex) {
  const m = String(hex).trim().match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!m) throw new Error(`sim-lab: bad hex color "${hex}"`);
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

export function relativeLuminance({ r, g, b }) {
  const f = (c) => {
    const s = clamp01(c / 255);
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** App-layer backgrounds must be near-black or they glare on additive. */
export function isDarkForAdditive(rgb, maxLum = 0.08) {
  return relativeLuminance(rgb) <= maxLum;
}

/* ------------------------------------------------------------------ */
/* Environment backgrounds. Official: built-in scenes, custom image     */
/* upload, animated backgrounds, live webcam for real-world blending.   */
/* recordFill: what the WebM recorder paints for non-rasterizable       */
/* (CSS gradient) scenes — stated honestly in the UI.                  */
/* ------------------------------------------------------------------ */
export const ENV_SCENES = [
  {
    id: 'lab-dark',
    name: 'Lab dark (near-black)',
    css: 'radial-gradient(circle at 50% 40%, #141a21 0%, #05070a 70%)',
    recordFill: '#05070a',
  },
  {
    id: 'daylight',
    name: 'Daylight street',
    css: 'linear-gradient(180deg, #9fc3e0 0%, #d5dde2 55%, #77878f 100%)',
    recordFill: '#39424b',
  },
  {
    id: 'night',
    name: 'Night city',
    css: 'linear-gradient(180deg, #0a0d1a 0%, #16204a 60%, #05060d 100%)',
    recordFill: '#0a0d1a',
  },
  {
    id: 'animated',
    name: 'Animated (CSS keyframes)',
    css: null,
    animated: true,
    recordFill: '#05070a',
  },
];

export function findScene(id) {
  return ENV_SCENES.find((s) => s.id === id) || ENV_SCENES[0];
}

/* ------------------------------------------------------------------ */
/* QA checklist. Mirrors the official extension's automated checks       */
/* (viewport meta/surface, favicon, D-pad focusables, overflow, visible  */
/* focus styles) plus the official design constraints (additive-dark,   */
/* 16px/20px type, 88px tap targets). Each takes plain data, returns    */
/* { pass, detail } (+ warn for advisory checks).                       */
/* ------------------------------------------------------------------ */
export function qaLensSize(w, h) {
  const pass = w === LENS.width && h === LENS.height;
  return { pass, detail: `lens surface ${w}x${h}px (spec ${LENS.width}x${LENS.height})` };
}

export function qaNoScroll({ scrollWidth, clientWidth, scrollHeight, clientHeight }) {
  const pass = scrollWidth <= clientWidth && scrollHeight <= clientHeight;
  return {
    pass,
    detail: pass
      ? 'no overflow inside the lens frame (spec: avoid scrolling)'
      : `overflow: scroll area ${scrollWidth}x${scrollHeight} vs client ${clientWidth}x${clientHeight}`,
  };
}

/** The app frame's own backdrop must be near-black (additive display). */
export function qaFrameBackdrop(svg) {
  const m = String(svg).match(/<rect[^>]*fill="(#[0-9a-fA-F]{3,6})"/);
  if (!m) return { pass: false, detail: 'no backdrop rect found in frame SVG' };
  let rgb;
  try {
    rgb = hexToRgb(m[1]);
  } catch {
    return { pass: false, detail: `unparseable backdrop fill "${m[1]}"` };
  }
  const lum = relativeLuminance(rgb);
  const pass = lum <= 0.08;
  return {
    pass,
    detail: `frame backdrop ${m[1]} luminance ${lum.toFixed(4)} (additive: black disappears, bright glares)`,
  };
}

export function qaFocusableCount(n) {
  return {
    pass: n >= 3,
    detail: `${n} keyboard-focusable controls on the companion surface (D-pad needs targets)`,
  };
}

export function qaFocusVisible(outlineWidthPx) {
  const w = Number(outlineWidthPx) || 0;
  return {
    pass: w > 0,
    detail: w > 0
      ? `visible :focus-visible style present (outline ${w}px)`
      : 'no visible :focus-visible style detected (D-pad focus would be invisible)',
  };
}

export function qaFontSizes({ bodyPx, primaryPx }) {
  const pass = bodyPx >= 16 && primaryPx >= 20;
  return { pass, detail: `body ${bodyPx}px (spec >= 16), primary on-lens ${primaryPx}px (spec >= 20)` };
}

export function qaFavicon(href) {
  const pass = typeof href === 'string' && href.length > 0 && /\.png(\?|#|$)/i.test(href);
  return {
    pass,
    detail: pass ? `PNG favicon linked: ${href}` : 'missing PNG favicon link (SVG favicons unsupported on MRBD)',
  };
}

/** Advisory: the 88px minimum is for on-lens controls; lab chrome may warn. */
export function qaTapTarget({ w, h }) {
  const pass = w >= 88 && h >= 88;
  return { pass, warn: !pass, detail: `smallest measured control ${w}x${h}px (Meta min tap target 88x88)` };
}

/* ------------------------------------------------------------------ */
/* Viewport recorder. Official: records the simulator viewport as a     */
/* downloadable WebM. We rasterize the 600x600 lens to canvas and       */
/* captureStream it — no dependencies.                                 */
/* ------------------------------------------------------------------ */
export const RECORDER = {
  width: LENS.width,
  height: LENS.height,
  mimeType: 'video/webm',
  fps: 30,
};

/** SVG markup -> <img>-loadable data URL (self-contained SVGs only). */
export function svgToDataUrl(svg) {
  const enc = encodeURIComponent(String(svg)).replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29');
  return `data:image/svg+xml;charset=utf-8,${enc}`;
}
