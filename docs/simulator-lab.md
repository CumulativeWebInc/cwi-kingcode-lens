# Simulator lab guide

The simulator lab is an in-repo harness that mirrors Meta's official
"Meta Ray-Ban Display Simulator" Chrome extension (v0.5.0, Meta Platforms,
INC.) — feature for feature, at $0, with no install and no hardware. It was
built because the official extension refuses to install on automation
Chromium ("Switch to Chrome to install extensions"); the failure text became
the build spec.

## What it simulates

- **600×600 additive display.** The lens composites the app frame over the
  environment with screen blending: pure black contributes zero light and is
  fully transparent, exactly like the waveguide. Bright app backgrounds
  glare — the QA checklist flags them.
- **Environment backgrounds.** Four built-in scenes, custom image upload,
  animated backdrop, and live webcam for real-world blending preview.
- **D-pad input.** The on-screen pad dispatches real keyboard events
  (arrows / Enter / Escape); physical arrow keys move focus the same way.
  This mirrors the Neural Band / captouch translation Meta's OS performs.
- **Display settings.** App brightness, background brightness, background
  blur, and auto-dimming to 35% after 30 seconds idle — plus a toggleable
  display-frame overlay.
- **Viewport recorder.** Records the 600×600 lens as WebM (canvas capture,
  30 fps) for demos and bug reports. Gradient scenes record over near-black;
  uploaded images and webcam record true.

## Pure logic module

All simulator math lives in `src/sim-lab.js` (zero dependencies, runs in
Node): D-pad key mapping, display-filter computation, additive-blend
helpers, environment scene definitions, QA check functions, the 0–100
performance scorer, and recorder constants. Covered by
`test/sim-lab.test.js`.

DOM access stays in `docs/app.js`; everything in `sim-lab.js` is unit
testable.

## Parity statement

All 9 official-extension features have parity in this lab. Still exclusive
to Meta's extension: the "View on Glasses" QR flow (needs Meta's app scheme
+ physical hardware) and pixel-exact rendering of Meta's proprietary frame
overlay asset.

Full verification record: `docs/VERIFICATION-2026-09-18.md` §7–§8.
