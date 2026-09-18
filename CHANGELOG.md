# Changelog

All notable changes to KingCode Lens. Dates in US/Eastern.

## [1.0.0] — 2026-09-18

First public product release.

### Added
- Simulator lab: 600×600 additive display harness mirroring Meta's official
  Ray-Ban Display simulator — environment backgrounds (built-in scenes,
  custom upload, animated, webcam), D-pad input (on-screen pad + physical
  arrow keys), app/background brightness, blur, auto-dimming, toggleable
  display-frame overlay, 600×600 WebM viewport recorder.
- QA checklist: one-click automated checks (viewport surface, favicon,
  D-pad focusables, overflow, visible focus styles, additive-dark backdrop,
  type sizes, tap targets) plus a 0–100 performance score with improvement
  prompts.
- Official product logo (crown + camera-lens motif): SVG master + PNG
  512/256/128/64 in `assets/logo/`; 64px favicon on the demo.
- Product header on the Pages demo: name, logo, version, license summary,
  release download link, CWI badge.
- `docs/quickstart.md` (under one minute), `docs/simulator-lab.md`,
  `docs/qa-checklist.md`, `docs/licensing.md` (plain-language license guide),
  `docs/legal/TRADEMARK-NOTICES.md`, `SECURITY.md`, `CONTRIBUTING.md`,
  `SUPPORT.md`, `docs/llms.txt`, `docs/.well-known/agent-card.json`.
- `.github/workflows/test.yml`: `npm test` on every push and pull request.
- Twenty Minds record for the license posture:
  `docs/TWENTY-MINDS-LICENSE-2026-09-18.md`.

### Changed
- **License: Apache-2.0 → KingCode Lens Software License v1.0**
  (proprietary, © 2026 Cumulative Web Inc). Free for personal, development,
  and evaluation use; commercial/production use requires a paid license
  (hp@cumulativeweb.com). `COMMERCIAL-LICENSE.md` removed (folded into
  `docs/licensing.md`); `package.json` license field updated.
- Product name locked to **KingCode Lens** on every product-facing surface.
- README overhauled: logo, features, quickstart, license summary, support.

### Verification
- 117/117 tests green (`node --test`).
- Vendor-lab verification: `docs/VERIFICATION-2026-09-18.md` (§8 records
  the productization).
- Live demo: https://cumulativewebinc.github.io/cwi-kingcode-lens/
