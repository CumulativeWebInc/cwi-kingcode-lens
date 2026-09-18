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
 *   - toggleable display-frame overlay (official "Show Display Frame")
 *   - environment backgrounds (scenes, custom image, animated, webcam)
 *   - D-pad input (Neural Band / captouch / EMG -> arrow keys + Enter)
 *   - display settings (app brightness, background brightness, blur, auto-dim)
 *   - viewport recorder (600x600 WebM)
 *   - QA checklist (viewport surface, favicon, focusables, overflow,
 *     visible focus styles, additive-dark, font sizes, tap targets)
 *   - performance score with per-check improvement prompts
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
/* Display-frame overlay. Official extension: "Show Display Frame"      */
/* toggle — a translucent rounded rectangle drawn around the app to    */
/* indicate the physical lens boundary. It's chrome, not the app: it   */
/* never intercepts pointer input.                                     */
/* ------------------------------------------------------------------ */
export const DISPLAY_FRAME = {
  borderRadius: '18%',
  border: '2px solid rgba(255,255,255,0.35)',
  pointerEvents: 'none',
};

/**
 * CSS text for the lens-boundary overlay. `show=false` returns an empty
 * string (no overlay), mirroring the official extension's toggle.
 */
export function displayFrameStyle(show) {
  if (!show) return '';
  return (
    `position:absolute;inset:0;` +
    `border-radius:${DISPLAY_FRAME.borderRadius};` +
    `border:${DISPLAY_FRAME.border};` +
    `pointer-events:${DISPLAY_FRAME.pointerEvents};`
  );
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
/* Performance score. The official extension's QA panel scores app      */
/* performance and suggests improvements per failing check. Our pure   */
/* equivalent takes measured inputs and returns a 0–100 score plus a   */
/* concrete improvement prompt for every underperforming check.        */
/*                                                                     */
/* The four levers, weighted by on-lens impact:                        */
/*   render      (40) — frame render time vs the 16.7ms 60fps budget;  */
/*                      slow frames are the #1 killer of glanceability  */
/*   darkRatio   (25) — fraction of near-black lens pixels; light      */
/*                      pixels glare on the additive display           */
/*   focusables  (20) — D-pad needs real keyboard-focusable targets    */
/*   overflow    (15) — scrolling on the lens is a spec violation      */
/* ------------------------------------------------------------------ */
export const PERF = {
  renderMsGood: 16.7, // one frame at 60fps — headroom budget
  renderMsWarn: 33.3, // two frames — still glanceable, room to improve
  minFocusables: 3, // D-pad needs real targets
  minDarkPixelRatio: 0.6, // ≥60% of lens pixels near-black on additive
  weights: { render: 40, darkRatio: 25, focusables: 20, overflow: 15 },
};

export function gradePerfBand(score) {
  const s = Number(score);
  if (s >= 90) return 'excellent';
  if (s >= 70) return 'good';
  if (s >= 50) return 'needs work';
  return 'poor';
}

function perfPrompt(id, value) {
  switch (id) {
    case 'render': {
      const v = value === 'unmeasured' ? 'was not measured' : `took ${value}ms`;
      return (
        `Frame render ${v} (budget ≤${PERF.renderMsGood}ms, warn ≤${PERF.renderMsWarn}ms). ` +
        `Improvement: cache static SVG layers, cut rect/text node count, and skip re-rendering on non-visual events — the avatar stays glanceable only if frames land inside one refresh.`
      );
    }
    case 'darkRatio': {
      const v = value === 'unmeasured' ? 'not measured' : `${value}%`;
      return (
        `Dark-pixel ratio ${v} (want ≥${PERF.minDarkPixelRatio * 100}% of lens pixels near-black). ` +
        `Improvement: keep app-layer backdrops near-black — bright pixels glare on the additive display; shrink bright regions or move content instead of adding light.`
      );
    }
    case 'focusables':
      return (
        `Only ${value} focusable control(s) — D-pad needs ≥${PERF.minFocusables} targets. ` +
        `Improvement: make every on-lens action a keyboard-focusable control and keep the arrow-key navigation order logical.`
      );
    case 'overflow':
      return (
        `Content overflows the 600×600 lens frame. ` +
        `Improvement: keep everything inside the lens surface — Meta's web-app spec says avoid scrolling; compress or paginate instead.`
      );
    default:
      return null;
  }
}

/**
 * @param {{renderMs:number, focusables:number, darkPixelRatio:number, overflow:boolean}}
 * All inputs are measured by the caller (docs/app.js) — this function never
 * touches the DOM, so it stays pure and testable.
 * @returns {{score:number, band:string, checks:Array<{id,pass,score,weight,detail,prompt}>}}
 */
export function qaPerformance({ renderMs, focusables, darkPixelRatio, overflow } = {}) {
  const w = PERF.weights;
  const checks = [];

  // 1. Frame render time.
  {
    const ms = Number(renderMs);
    const measured = Number.isFinite(ms) && ms >= 0;
    let score = 0;
    const pass = measured && ms <= PERF.renderMsWarn;
    if (measured && ms <= PERF.renderMsGood) score = w.render;
    else if (pass) score = Math.round(w.render / 2);
    checks.push({
      id: 'render',
      weight: w.render,
      pass,
      score,
      detail: measured
        ? `frame render ${ms.toFixed(1)}ms (good ≤${PERF.renderMsGood}ms, warn ≤${PERF.renderMsWarn}ms)`
        : 'frame render time not measured',
      prompt: score < w.render ? perfPrompt('render', measured ? ms.toFixed(1) : 'unmeasured') : null,
    });
  }

  // 2. Additive-dark pixel ratio.
  {
    const r = Number(darkPixelRatio);
    const measured = Number.isFinite(r) && r >= 0 && r <= 1;
    let score = 0;
    const pass = measured && r >= PERF.minDarkPixelRatio;
    if (measured && r >= 0.9) score = w.darkRatio;
    else if (pass) score = Math.round(w.darkRatio * 0.6);
    checks.push({
      id: 'darkRatio',
      weight: w.darkRatio,
      pass,
      score,
      detail: measured
        ? `${(r * 100).toFixed(0)}% of lens pixels near-black (want ≥${PERF.minDarkPixelRatio * 100}%)`
        : 'dark-pixel ratio not measured',
      prompt: score < w.darkRatio ? perfPrompt('darkRatio', measured ? (r * 100).toFixed(0) : 'unmeasured') : null,
    });
  }

  // 3. Focusable targets for D-pad.
  {
    const n = Math.max(0, Math.floor(Number(focusables) || 0));
    const pass = n >= PERF.minFocusables;
    checks.push({
      id: 'focusables',
      weight: w.focusables,
      pass,
      score: pass ? w.focusables : 0,
      detail: `${n} keyboard-focusable controls (D-pad needs ≥${PERF.minFocusables})`,
      prompt: pass ? null : perfPrompt('focusables', n),
    });
  }

  // 4. Overflow.
  {
    const pass = overflow === false;
    checks.push({
      id: 'overflow',
      weight: w.overflow,
      pass,
      score: pass ? w.overflow : 0,
      detail: pass ? 'no overflow inside the lens frame' : 'content overflows the 600×600 lens frame',
      prompt: pass ? null : perfPrompt('overflow'),
    });
  }

  const score = checks.reduce((a, c) => a + c.score, 0);
  return { score, band: gradePerfBand(score), checks };
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
