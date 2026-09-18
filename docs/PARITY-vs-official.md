# KingCode Lens vs Meta's official simulator — parity assessment

Date: 2026-09-18 (updated in follow-up commit — see § "2026-09-18 follow-up").
Official extension: **Meta Ray-Ban Display Simulator v0.5.0**
(publisher Meta Platforms, INC., updated 2026-08-26, 15.09 MiB, listing fetched 2026-09-18).
Our build: `CumulativeWebInc/cwi-kingcode-lens`, `docs/` demo + `src/` adapter stack.

**Parity: 21/21 official features have a counterpart.** The one hardware-bound
flow — Meta's private companion-app handoff — is covered by an honest
simulator-only fallback, never a fake replication. See feature #21.

## How this was verified (honest method note)

A live run of the official extension was **attempted and blocked** (see § "The block", below) —
it was not installed or executed. Every official feature below comes from Meta's own
Web Store listing text (fetched 2026-09-18) and Meta's `facebook/meta-wearables-webapp`
README (§ "Display Simulator Chrome Extension"). Our side was verified against the
repo's authoritative source via the GitHub Contents API (`src/sim-lab.js`, `docs/app.js`).
Anything marked "unverified" needs the live run to confirm.

## Feature-by-feature

| # | Official feature (listing) | Our equivalent | Verdict |
|---|---|---|---|
| 1 | Exact 600×600 display frame | 600×600 lens viewport (`qaLensSize`) | ✅ parity holds |
| 2 | Toggleable glasses overlay | `set-frame` toggle, `displayFrameStyle()` | ✅ behavioral parity; artwork is **our approximation**, not Meta's — the demo labels it as such |
| 3 | Additive blending rendering | screen-blend app layer over environment; `qaFrameBackdrop` dark-pixel check | ✅ parity holds |
| 4 | Built-in environment backgrounds | `ENV_SCENES` built-in set | ✅ parity holds |
| 5 | Custom background upload | `env-upload` | ✅ parity holds |
| 6 | Animated backgrounds | animated scene support | ✅ parity holds |
| 7 | Live webcam background | `env-cam` | ✅ parity holds |
| 8 | On-screen D-pad input | `[data-dpad]` buttons | ✅ parity holds |
| 9 | Keyboard D-pad input | `dpadKey()` keyboard mapping | ✅ parity holds |
| 10 | App brightness control | `set-app` | ✅ parity holds |
| 11 | Background brightness control | `set-bg` | ✅ parity holds |
| 12 | Blur control | `set-blur` | ✅ parity holds |
| 13 | Auto-dimming | `set-dim` — app layer to 35% after 30s idle | ✅ parity holds |
| 14 | Viewport recorder (WebM download) | `MediaRecorder` → WebM, 600×600 canvas capture | ✅ parity holds |
| 15 | QA: viewport | `qaLensSize` | ✅ parity holds |
| 16 | QA: favicon | `qaFavicon` | ✅ parity holds |
| 17 | QA: fonts | `qaFontSizes` | ✅ parity holds |
| 18 | QA: focus | `qaFocusableCount` + `qaFocusVisible` | ✅ parity holds |
| 19 | QA: overflow | `qaNoScroll` | ✅ parity holds |
| 20 | Performance score + improvement prompts | `qaPerformance()`: 0–100, 4 weighted levers (render 40 / darkRatio 25 / focusables 20 / overflow 15), per-check prompts, `gradePerfBand()` | ✅ parity holds |
| 21 | **"View on Glasses" QR code** | Honest fallback: `SIMULATOR`-badged modal (`docs/VIEW-ON-GLASSES-FALLBACK-SPEC.md`) — client-side QR of the demo URL for phone handoff, requirements box naming Meta's app, copy-link + Meta docs actions, local-only tap telemetry | ✅ behavioral counterpart; the **physical push to hardware** stays exclusive to Meta's app (no web page can replicate it — stated in the modal) |
| — | Extras we ship beyond the listing | `qaTapTarget`, `qaFrameBackdrop` (additive-dark rasterization), toggleable overlay, `SIMULATOR` honesty badges | ➕ we go further |

## Form-factor differences (not gaps)

- Official is a **Chrome extension** toggled via the toolbar icon that wraps *any* web-app URL.
  Ours is a **hosted web lab** (`docs/`) plus an **npm adapter stack** (`src/`).
  Same preview semantics, different delivery vehicle.
- Official operates under Meta's Wearables Developer Terms; our trademark-notices file
  must keep the descriptive-use line (productization P0).

## Unverified without the live run

Exact pixel styling of Meta's glasses overlay (ours is a labeled approximation);
official perf-score weights/thresholds; official QA check internals; recorder
fps/codec; D-pad focus-ring visuals.

## The block (live run not achieved)

1. Downloaded **Chrome for Testing 153.0.8010.52** (linux64) — installed and runs headless.
2. Direct CRX download from `clients2.google.com` — **blocked**: the sandbox egress proxy
   aborts the CONNECT tunnel, and the host sits on this VM's managed
   `URLBlocklist` (`/etc/opt/chrome/policies/managed/policy.json`). Deliberate policy —
   not circumvented.
3. Web Store install path in real Chrome — **blocked**: `chromewebstore.google.com`
   returns `ERR_EMPTY_RESPONSE` to Chrome's TLS fingerprint on this network
   (same Fastly behavior documented for the VM's Chromium 152 on Pages domains;
   curl fetches the same URL fine).
4. Extension source is not public (only referenced by ID in Meta's docs repo).

Kill rule applied: stopped forcing it at ~30 min. The two blocks are independent
(proxy policy + TLS-fingerprint rejection); retrying needs a different network or a
human-driven Chrome (Black's device or the outreach lane asking agents with real Chrome).

## 2026-09-18 follow-up (this commit)

1. **Feature #21 closed honestly.** "View on Glasses" button stays (parity with the
   official extension); tap opens a `SIMULATOR`-badged modal sheet, never a fake
   "sending to glasses…" state. The QR is rendered client-side by
   `docs/vendor/qrcode.js` — original CWI implementation, zero dependencies,
   byte mode, UTF-8, error correction L, versions 1–5, payloads ≤106 bytes
   (oversize input degrades to copy-link). Spec: `docs/VIEW-ON-GLASSES-FALLBACK-SPEC.md`.
   Copy rules enforced: the QR is never implied to put the app on glasses, no fake
   progress or success, Meta's app is named as the requirement, and no deep-link
   is attempted because no public Meta scheme is documented.
2. **QR encoder independently verified** before wiring: finder/timing/format
   geometry, BCH-valid format info (EC level L), Reed–Solomon syndromes zero
   across payloads, byte-mode round-trip incl. UTF-8 and the 106-byte maximum,
   remainder bits zeroed, oversize input returns `null`. Regression tests:
   `test/qrcode.test.js` (6 tests).
3. **Overlay wording corrected.** The demo now calls the display-frame toggle
   "our approximation of the official display-frame overlay … (not Meta's
   artwork)" — never the official glasses overlay.
4. **Tap telemetry.** `localStorage` counter `kcl-view-on-glasses-taps` feeds the
   2026-10-30 on-face kill rule; shown honestly in the modal footer.
