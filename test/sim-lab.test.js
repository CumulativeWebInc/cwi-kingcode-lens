/**
 * KingCode Lens — simulator lab tests (test/sim-lab.test.js).
 * Pure helpers; no DOM, no hardware.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  LENS,
  DPAD_KEY,
  dpadKey,
  AUTO_DIM_MS,
  AUTO_DIM_LEVEL,
  clamp01,
  displayFilters,
  additiveBlendMode,
  hexToRgb,
  relativeLuminance,
  isDarkForAdditive,
  ENV_SCENES,
  findScene,
  qaLensSize,
  qaNoScroll,
  qaFrameBackdrop,
  qaFocusableCount,
  qaFocusVisible,
  qaFontSizes,
  qaFavicon,
  qaTapTarget,
  RECORDER,
  svgToDataUrl,
  DISPLAY_FRAME,
  displayFrameStyle,
  PERF,
  gradePerfBand,
  qaPerformance,
} from '../src/sim-lab.js';

describe('sim-lab: lens spec', () => {
  it('is the official 600x600 MRBD surface', () => {
    assert.equal(LENS.width, 600);
    assert.equal(LENS.height, 600);
  });
});

describe('sim-lab: dpadKey', () => {
  it('maps every action to the official key event', () => {
    assert.deepEqual(DPAD_KEY, {
      up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft',
      right: 'ArrowRight', select: 'Enter', back: 'Escape',
    });
    for (const a of Object.keys(DPAD_KEY)) assert.equal(dpadKey(a), DPAD_KEY[a]);
  });
  it('throws on unknown actions', () => {
    assert.throws(() => dpadKey('swipe'), /unknown dpad action/);
  });
});

describe('sim-lab: displayFilters', () => {
  it('builds brightness/blur filter strings', () => {
    const f = displayFilters({ appBrightness: 0.8, bgBrightness: 0.5, bgBlur: 4 });
    assert.equal(f.lensFilter, 'brightness(0.800)');
    assert.equal(f.bgFilter, 'brightness(0.500) blur(4px)');
  });
  it('clamps out-of-range brightness', () => {
    const f = displayFilters({ appBrightness: 9, bgBrightness: -2 });
    assert.equal(f.lensFilter, 'brightness(1.000)');
    assert.equal(f.bgFilter, 'brightness(0.000) blur(0px)');
  });
  it('auto-dim multiplies app brightness by the dim level', () => {
    const f = displayFilters({ appBrightness: 1, dimmed: true });
    assert.equal(f.lensFilter, `brightness(${AUTO_DIM_LEVEL.toFixed(3)})`);
    assert.ok(AUTO_DIM_MS >= 10000, 'dim delay is sane');
  });
  it('non-numeric input degrades to 0, never NaN in CSS', () => {
    const f = displayFilters({ appBrightness: 'junk', bgBlur: 'junk' });
    assert.ok(!/NaN/.test(f.lensFilter + f.bgFilter));
  });
});

describe('sim-lab: additive blending', () => {
  it('uses screen blend mode', () => {
    assert.equal(additiveBlendMode(), 'screen');
  });
  it('parses hex colors', () => {
    assert.deepEqual(hexToRgb('#000000'), { r: 0, g: 0, b: 0 });
    assert.deepEqual(hexToRgb('#fff'), { r: 255, g: 255, b: 255 });
    assert.throws(() => hexToRgb('nope'), /bad hex/);
  });
  it('luminance: black 0, white 1', () => {
    assert.equal(relativeLuminance({ r: 0, g: 0, b: 0 }), 0);
    assert.ok(Math.abs(relativeLuminance({ r: 255, g: 255, b: 255 }) - 1) < 1e-9);
  });
  it('isDarkForAdditive gates bright backdrops', () => {
    assert.ok(isDarkForAdditive({ r: 0, g: 0, b: 0 }));
    assert.ok(!isDarkForAdditive({ r: 255, g: 255, b: 255 }));
    assert.ok(!isDarkForAdditive({ r: 200, g: 200, b: 200 }));
  });
});

describe('sim-lab: environment scenes', () => {
  it('ships built-in scenes with recorder fills', () => {
    assert.ok(ENV_SCENES.length >= 3);
    for (const s of ENV_SCENES) {
      assert.ok(s.id && s.name && s.recordFill, `scene ${s.id} complete`);
      assert.ok(/^#[0-9a-fA-F]{6}$/.test(s.recordFill), `scene ${s.id} recordFill is hex`);
    }
  });
  it('findScene falls back to the first scene', () => {
    assert.equal(findScene('nope').id, ENV_SCENES[0].id);
    assert.equal(findScene('night').id, 'night');
  });
});

describe('sim-lab: QA checks', () => {
  it('qaLensSize passes only on 600x600', () => {
    assert.ok(qaLensSize(600, 600).pass);
    assert.ok(!qaLensSize(640, 400).pass);
  });
  it('qaNoScroll fails on overflow', () => {
    assert.ok(qaNoScroll({ scrollWidth: 600, clientWidth: 600, scrollHeight: 600, clientHeight: 600 }).pass);
    assert.ok(!qaNoScroll({ scrollWidth: 601, clientWidth: 600, scrollHeight: 600, clientHeight: 600 }).pass);
  });
  it('qaFrameBackdrop reads the SVG backdrop rect', () => {
    const dark = qaFrameBackdrop('<svg><rect x="0" y="0" width="600" height="600" fill="#000000"/></svg>');
    assert.ok(dark.pass, dark.detail);
    const bright = qaFrameBackdrop('<svg><rect x="0" y="0" width="600" height="600" fill="#ffffff"/></svg>');
    assert.ok(!bright.pass, bright.detail);
    assert.ok(!qaFrameBackdrop('<svg></svg>').pass);
  });
  it('qaFocusableCount needs at least 3 targets', () => {
    assert.ok(qaFocusableCount(5).pass);
    assert.ok(!qaFocusableCount(1).pass);
  });
  it('qaFocusVisible needs a visible outline', () => {
    assert.ok(qaFocusVisible(3).pass);
    assert.ok(!qaFocusVisible(0).pass);
  });
  it('qaFontSizes enforces 16px body / 20px primary', () => {
    assert.ok(qaFontSizes({ bodyPx: 16, primaryPx: 28 }).pass);
    assert.ok(!qaFontSizes({ bodyPx: 12, primaryPx: 28 }).pass);
    assert.ok(!qaFontSizes({ bodyPx: 16, primaryPx: 18 }).pass);
  });
  it('qaFavicon requires a PNG link', () => {
    assert.ok(qaFavicon('./favicon.png').pass);
    assert.ok(!qaFavicon('./icon.svg').pass, 'SVG favicons unsupported on MRBD');
    assert.ok(!qaFavicon('').pass);
  });
  it('qaTapTarget is advisory (warn, not fail)', () => {
    const small = qaTapTarget({ w: 40, h: 40 });
    assert.ok(!small.pass && small.warn === true);
    assert.ok(qaTapTarget({ w: 88, h: 88 }).pass);
  });
});

describe('sim-lab: recorder', () => {
  it('declares the official 600x600 WebM contract', () => {
    assert.equal(RECORDER.width, 600);
    assert.equal(RECORDER.height, 600);
    assert.equal(RECORDER.mimeType, 'video/webm');
    assert.ok(RECORDER.fps > 0);
  });
  it('svgToDataUrl produces a loadable data URL', () => {
    const src = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="600" height="600"/></svg>';
    const url = svgToDataUrl(src);
    assert.ok(url.startsWith('data:image/svg+xml;charset=utf-8,'));
    assert.ok(!url.includes('<') && !url.includes('>'), 'angle brackets must be encoded');
    const back = decodeURIComponent(url.slice('data:image/svg+xml;charset=utf-8,'.length));
    assert.equal(back, src, 'round-trips to identical SVG markup');
  });
});

describe('sim-lab: display-frame overlay', () => {
  it('returns empty CSS when the toggle is off', () => {
    assert.equal(displayFrameStyle(false), '');
    assert.equal(displayFrameStyle(0), '');
  });
  it('draws a translucent rounded rectangle when on', () => {
    const css = displayFrameStyle(true);
    assert.ok(css.includes(`border-radius:${DISPLAY_FRAME.borderRadius}`), 'rounded');
    assert.ok(css.includes(`border:${DISPLAY_FRAME.border}`), 'translucent border');
    assert.ok(css.includes('pointer-events:none'), 'overlay never intercepts input');
    assert.ok(css.includes('position:absolute') && css.includes('inset:0'), 'frames the lens');
  });
});

describe('sim-lab: performance score', () => {
  const good = { renderMs: 8.2, focusables: 6, darkPixelRatio: 0.92, overflow: false };

  it('weights sum to 100', () => {
    assert.equal(Object.values(PERF.weights).reduce((a, b) => a + b, 0), 100);
  });
  it('scores 100/excellent for a healthy app', () => {
    const r = qaPerformance(good);
    assert.equal(r.score, 100);
    assert.equal(r.band, 'excellent');
    assert.ok(r.checks.every((c) => c.pass && c.prompt === null), 'no prompts when healthy');
  });
  it('slow-but-glanceable frames earn half render credit and an improvement prompt', () => {
    const r = qaPerformance({ ...good, renderMs: 25 });
    const c = r.checks.find((x) => x.id === 'render');
    assert.ok(c.pass, 'inside the warn budget still passes');
    assert.equal(c.score, PERF.weights.render / 2);
    assert.ok(c.prompt && /Improvement/.test(c.prompt));
    assert.ok(r.score < 100);
  });
  it('over-budget frames fail render', () => {
    const c = qaPerformance({ ...good, renderMs: 60 }).checks.find((x) => x.id === 'render');
    assert.ok(!c.pass);
    assert.equal(c.score, 0);
    assert.ok(/skip re-rendering/.test(c.prompt));
  });
  it('bright apps lose the dark-ratio share', () => {
    const c = qaPerformance({ ...good, darkPixelRatio: 0.3 }).checks.find((x) => x.id === 'darkRatio');
    assert.ok(!c.pass);
    assert.equal(c.score, 0);
    assert.ok(/near-black/.test(c.prompt));
  });
  it('mid-range dark ratio earns partial credit', () => {
    const c = qaPerformance({ ...good, darkPixelRatio: 0.75 }).checks.find((x) => x.id === 'darkRatio');
    assert.ok(c.pass);
    assert.ok(c.score > 0 && c.score < PERF.weights.darkRatio);
  });
  it('fewer than 3 focusables fails with a D-pad prompt', () => {
    const c = qaPerformance({ ...good, focusables: 1 }).checks.find((x) => x.id === 'focusables');
    assert.ok(!c.pass && c.score === 0);
    assert.ok(/D-pad/.test(c.prompt));
  });
  it('overflow fails with a no-scroll prompt', () => {
    const c = qaPerformance({ ...good, overflow: true }).checks.find((x) => x.id === 'overflow');
    assert.ok(!c.pass);
    assert.ok(/avoid scrolling/.test(c.prompt));
  });
  it('degrades honestly on unmeasured inputs', () => {
    const r = qaPerformance({});
    assert.equal(r.score, 0);
    assert.equal(r.band, 'poor');
    assert.ok(r.checks.every((c) => !c.pass && c.prompt), 'every unmeasured check explains itself');
  });
  it('grades the bands', () => {
    assert.equal(gradePerfBand(95), 'excellent');
    assert.equal(gradePerfBand(80), 'good');
    assert.equal(gradePerfBand(60), 'needs work');
    assert.equal(gradePerfBand(20), 'poor');
  });
});
