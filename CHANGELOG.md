# Changelog
## 2026-09-23 — v2026.09.23 — trust infra (A7/A8)
- **A7 PR preview bot:** `.github/workflows/pr-preview.yml` builds each PR branch, deploys a live preview to `pr-previews/<PR#>/`, and posts the preview link + contract validation checklist as a PR comment (Vercel pattern).
- **A8/A9 contract CI gate:** the build now fails if `.well-known/agent-card.json` is missing or invalid (name/url required), if the `SCHEMA-VERSIONS.json` contract breaks (where the registry exists), if `content.json` is invalid, or if `CHANGELOG.md` is missing.

All notable changes to KingCode Lens. Dates in US/Eastern.

## [Unreleased]

### Added
- "View on Glasses" honest fallback: the button stays (official-extension
  parity); tap opens a `SIMULATOR`-badged modal sheet with a client-side QR
  of the demo URL for phone handoff, an honest requirements box (Meta's
  companion app named as the requirement), copy-link + Meta wearables
  developer-docs actions, and a degraded copy-link state when the URL is
  too long for a QR. No fake "sending…" state, no fake success, no
  undocumented deep-link. Local-only `localStorage` tap counter
  (`kcl-view-on-glasses-taps`) feeds the 2026-10-30 on-face kill rule.
- `docs/vendor/qrcode.js`: original CWI QR encoder (zero dependencies) —
  byte mode, UTF-8, error correction L, versions 1–5, payloads ≤106 bytes.
  Independently verified before wiring: finder/timing/format geometry,
  BCH-valid format info, Reed–Solomon syndromes zero, payload round-trip
  (incl. UTF-8 + 106-byte maximum), remainder bits zeroed, oversize input
  returns `null`. Regression tests in `test/qrcode.test.js`.
- `docs/VIEW-ON-GLASSES-FALLBACK-SPEC.md`: the fallback UX spec.
- `docs/PARITY-vs-official.md`: feature-by-feature parity assessment vs
  Meta's official simulator (21/21 features with counterparts; hardware
  handoff covered by the honest fallback). Linked from
  `docs/VERIFICATION-2026-09-18.md` §9. No live official-extension run is
  claimed — assessment is listing text + public README + repo source.

### Fixed
- Demo overlay wording: the display-frame toggle is now labeled "our
  approximation of the official display-frame overlay … (not Meta's
  artwork)" — never the official glasses overlay.

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
