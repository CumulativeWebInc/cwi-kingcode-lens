# KingCode Lens — Vendor-Lab Verification Report

Date: **2026-09-18**. Verifier: KingCode (verification lane, Black's order: *no hardware purchase — verify inside the vendors' own official developer environments, labs, simulators, and SDKs*). $0 spent, no accounts created, no hardware touched.

**Standing bias applied (Black, 2026-09-18): open-source first.** Every verification step below names the open route that covers it, so future work never needs a vendor gate. Gated paths are used only where no open route exists — and none was needed in this run.

**Authorization note:** Black granted standing authority to use saved logins/credentials to finish jobs (2026-09-18). **No logins were used in this verification** — every check below was completed through public, open sources (official docs, open GitHub repos, open toolkits). The remaining Meta items are not credential problems at all: the Simulator install needs a *live browser session* (this verifier cannot operate one — flagged for a parent-delegated browser task, no login required), and on-glasses pairing needs *Black's phone* (Meta AI app, his own login — we never touch it).

Scope: re-verify every backend assumption in the v1.0.0 build against the vendors' official docs/labs. Simulator/lab results are labeled as such throughout — **nothing here claims on-hardware validation.**

## 0. The open route (read this first)

| Verification step | Open tool that covers it | Gate avoided |
|---|---|---|
| Meta web-app constraints (viewport, additive display, D-pad, no mic) | Official docs at `wearables.developer.meta.com` (public) + open toolkit repo `facebook/meta-wearables-webapp` (BSD) | None — no login anywhere |
| Meta web-app QA without hardware | **Meta Ray-Ban Display Simulator** Chrome extension (public Web Store, no login) | No Meta developer account needed |
| Meta DAT (native) testing without hardware | **Mock Device Kit** (documented in the public FAQ) | Hardware avoided |
| Brilliant Labs hardware/firmware/SDK | `docs.brilliant.xyz`, `brilliantlabsAR/frame-codebase`, `brilliantlabsAR/brilliant_sdk` — all open, MIT | No enrollment exists at all |
| Brilliant Labs assistant/voice pipeline | `brilliantlabsAR/noa-flutter`, `noa-assistant` — open; BYO-key/self-host | No vendor AI account needed |
| Android XR glasses testing without hardware | Public Jetpack XR SDK docs + Android XR Emulator (Android Studio Canary) | No hardware; SDK in public preview |
| This repo's own verification surface | Our Pages simulator (`docs/`), 82-test conformance suite | Nothing |

**Bottom line:** the entire verification loop for KingCode Lens runs on open tooling. The only gated steps in the product's future are *on-device* runs (Meta AI app pairing, Brilliant Labs hardware) — and those are hardware gates, not account gates we can or should bypass.

## 1. Meta (Ray-Ban Display) — VERIFIED, 2 corrections committed

**Sources checked (official):**
- `wearables.developer.meta.com/docs/develop/webapps/build/` — Web Apps capability table (official).
- `github.com/facebook/meta-wearables-webapp` — official AI dev toolkit: design constraints + Display Simulator Chrome extension docs.
- `developers.meta.com/wearables/faq/` — Developer Preview terms, Mock Device Kit.

**Assumption-by-assumption:**

| # | Our v1 assumption | Official verdict | Result |
|---|---|---|---|
| 1 | Web path has no mic / no `getUserMedia` / no voice hooks | Docs verbatim: **"Web Apps do not yet support: Camera, Microphone, Notifications"** | ✅ PASS |
| 2 | 600×600 fixed viewport | Docs: "Fixed 600x600px viewport" | ✅ PASS |
| 3 | Additive display, black = transparent | Docs: "Additive waveguide overlay… A pixel rendered as pure black is fully transparent"; dark backgrounds, high-contrast UI | ✅ PASS |
| 4 | D-pad navigation only | Docs: Neural Band/captouch → "standard arrow key and Enter events"; EMG pinch/drag → web events; "All elements must be focusable"; no mouse/touch/keyboard | ✅ PASS (with correction #2 below) |
| 5 | On-glasses voice needs native Device Access Toolkit | Docs: DAT — "Speak to your app through the device's microphones… Play audio to the user through the device's speakers"; A2DP (hi-fi output) vs HFP (8 kHz mono mic) | ✅ PASS |
| 6 | Third-party assistant integration absent on web path | No assistant API anywhere in the web capability table; activation is companion-driven | ✅ PASS |
| 7 | Demo bundle is MRBD-compatible | Docs require `<meta name="mrbd-web-app-capable" content="yes">` | ❌ FAIL → corrected |
| 8 | Demo footer repo link | Linked `cwi-glassface` (pre-rename slug) | ❌ FAIL → corrected |

**Corrections committed (commit `VERIF-CORRECTIONS`, see §5):**
1. `docs/index.html` — added the official `<meta name="mrbd-web-app-capable" content="yes">` compatibility marker to `<head>`.
2. `docs/index.html` footer + `README.md` demo URL — stale `cwi-glassface` slug → `cwi-kingcode-lens`.
3. `src/adapters.js` + `spec/INTERFACES.md` (v1.2) — `inputs` corrected to official terminology: MetaDisplay `['voice','dpad','emg-gesture']` (`'voice'` names the *product-level* activation modality — companion mic relayed via cloud — **not** a glasses API input); added `audioOut: 'unverified'` (audio output is absent from the web capability table; TTS stays companion-side).
4. `docs/vendor/src/adapters.js` — demo bundle re-emitted so the Pages simulator runs the corrected code.

**Demo vs Meta's documented constraints:**
- 600×600 lens surface, black background, dark UI, high contrast ✅
- `<meta name="viewport">` ✅; `mrbd-web-app-capable` ✅ (correction #1); PNG favicon 64×64 ✅ (added this run — Meta requires PNG ≥52×52, SVGs unsupported); visible `:focus-visible` styles ✅ (added this run — Meta's QA checklist requires visible focus)
- Interaction is companion-driven (panel buttons), lens is display-only — matches Meta's actual micro-app model ✅
- Remaining QA-checklist notes: no `.focusable` on-lens elements (none exist — lens is display-only, acceptable); no horizontal overflow (layout is fluid, max-width capped). Both fine for a simulator demo.

**What remains unverifiable without hardware:** actual on-glasses render (additive blending in real light), EMG Neural Band gesture feel, real 600×600 legibility at 20° FOV, Meta AI app pairing flow.

**Meta's own $0 lab (no hardware):** the **Meta Ray-Ban Display Simulator** Chrome extension (Chrome Web Store) — 600×600 frame, additive blending, environment backgrounds, D-pad event dispatch, display tuning, viewport recorder, QA checklist, "View on Glasses" QR. **Not installed in this run — installing a Chrome extension requires a live browser session, which this verification agent cannot operate. Needs a parent-delegated browser task.**

## 2. Brilliant Labs (Frame) — VERIFIED against docs, 1 correction committed

**Sources checked (official):** `docs.brilliant.xyz` hardware manual + SDK docs, Brilliant Labs open-source repos (`brilliantlabsAR/frame-codebase`, `noa-flutter`), official spec reporting.

**Assumption-by-assumption:**

| # | Our v1 assumption | Official verdict | Result |
|---|---|---|---|
| 1 | 640×400 color OLED display | Official: 640×400 OLED color, 20° FOV, monocular right-eye | ✅ PASS |
| 2 | On-glasses mic | Official: nose-bridge microphone | ✅ PASS |
| 3 | On-device Lua app model | Official: Lua-based OS, open-source firmware, phone companion over BLE 5.3 | ✅ PASS |
| 4 | Custom "Hey KingCode" wake word feasible | Noa uses **tap-to-talk + Whisper via phone**; no documented on-device KWS in the Lua SDK | ⚠️ UNVERIFIED → week-4 gate stands |
| 5 | `inputs: ['voice','dpad']` | Official inputs: mic + **accelerometer tap/double-tap** — no D-pad | ❌ FAIL → corrected to `['voice','tap']` |
| 6 | TTS on the glasses | **Frame has no speakers** (official design trade-off) — audio renders on the companion phone | ❌ FAIL → `audioOut: 'companion'` added |

**Corrections committed (same commit, see §5):** `inputs: ['voice','tap']`; `audioOut: 'companion'` with the no-speakers note; spec v1.2 records the Noa tap-to-talk finding and keeps the week-4 false-accept gate as the decision point.

**What remains unverifiable without hardware:** BLE companion pairing, Lua upload/run cycle, on-device mic streaming for KWS, real on-lens legibility.

**Brilliant Labs lab status:** fully open-source, **no gatekeeper, no enrollment, no account** — nothing to enroll in. No official virtual device or simulator was found; their dev flow is docs + real hardware. Our simulator remains the $0 verification surface.

## 3. Android XR — stub holds (light touch, ~30 min)

**Sources checked (official):** `developer.android.com/develop/xr/jetpack-xr-sdk/` — emulator guides, AVD creation docs.

**Findings:**
- An official **Android XR Emulator** exists (Android Studio Canary): create an XR Glasses AVD + a phone-host AVD, run apps on the virtual glasses. This is a genuine $0 lab path when the stub gets built.
- Jetpack XR SDK is still in **developer preview**; **no public glasses distribution channel** yet.
- Our `android-xr` declared-NOT_IMPLEMENTED stub remains the honest label. No code changes needed; the emulator is recorded as the future lab path.

## 4. Twenty-Minds amendments — status

No Twenty-Minds decision was contradicted. The v1.1 "display-first on Meta" decision was **upgraded from community sources to Meta's official verbatim docs**. The input-terminology and no-speakers findings are refinements, recorded as v1.2 — not reversals.

## 5. Commits

All corrections + this report ship as one verification commit on top of `da4339bc28f74502fd2ce1f0de9b0b86a51ca711`:

- `src/adapters.js` — input terminology + `audioOut` (MetaDisplay `['voice','dpad','emg-gesture']`/`'unverified'`; BrilliantLabs `['voice','tap']`/`'companion'`)
- `docs/index.html` — `mrbd-web-app-capable` meta tag; footer repo-link fix
- `docs/vendor/src/adapters.js` — demo bundle re-emitted (in sync)
- `spec/INTERFACES.md` — v1.2 vendor-lab verification amendments
- `README.md` — demo URL fix; truth boundaries quote the official docs verbatim; link to this report
- `docs/VERIFICATION-2026-09-18.md` — this file

Tests after corrections: **82/82 pass** (`node --test`).

## 7. Simulator lab — Track B (in-repo lab harness), 2026-09-18

**Why:** the official Meta Ray-Ban Display Simulator Chrome extension needs a live browser session to install; Track A (live install) was not executable from this environment. Per Black's standing rule — a login/tool wall is a build spec — the lab was built from Meta's *own public* tooling instead: the official extension's feature list from `facebook/meta-wearables-webapp` (public README) plus the official web-apps build guide (public docs). No login, no cost, no hardware.

**What the official extension does vs what our in-repo lab now covers** (lab lives permanently in `docs/`, pure logic in `src/sim-lab.js`, tested in `test/sim-lab.test.js`):

| Official extension feature | Our lab (`docs/` + `src/sim-lab.js`) | Status |
|---|---|---|
| 600×600 display frame + additive blending | Lens layers: env background + app frame composited with `mix-blend-mode: screen` (pure black = transparent, like the waveguide) | ✅ parity |
| Environment backgrounds (scenes, upload, animated, webcam) | 4 built-in scenes, custom image upload, CSS-animated backdrop, live webcam toggle | ✅ parity |
| D-pad input (on-screen pad + arrow keys dispatch key events) | On-screen pad dispatches real `KeyboardEvent`s; physical arrows move focus between controls glasses-style; Enter = activate, Escape = back | ✅ parity |
| Display settings (app brightness, bg brightness, bg blur, auto-dim) | Three sliders + auto-dim toggle (35% after 30s idle), pure `displayFilters()` helper | ✅ parity |
| Viewport recorder (downloadable WebM) | Records the 600×600 lens via canvas `captureStream` + MediaRecorder → WebM download; frame rasterized with screen blend | ✅ parity (gradient scenes record over near-black — stated in UI) |
| QA checklist (viewport, favicon, focusables, overflow, focus styles) | One-click run: lens 600×600, no-scroll, additive-dark backdrop (reads the SVG), focusable count, `:focus-visible` presence, 16px/20px type, PNG favicon, 88px tap targets (advisory) | ✅ parity + extras |
| "View on Glasses" QR deep link | Not replicated — needs Meta's app deep-link scheme + hardware | ❌ exclusive to theirs |

**Still exclusive to the official extension:** the "View on Glasses" QR (deep link into the Meta AI app — meaningless without hardware) and pixel-exact rendering of Meta's own frame overlay. Everything else a developer needs to QA a web app is now in our repo.

**Track A install click-path (for the parent's browser delegation):** Chrome Web Store → search "Meta Ray-Ban Display Simulator" → Add to Chrome (no login needed) → navigate to `https://cumulativewebinc.github.io/cwi-kingcode-lens/` → click the extension icon to toggle → document viewport handling, additive blending, D-pad, backgrounds, display tuning, recording → screenshot/record. If the install fails, the exact failure text becomes the next build spec.

**Files (this commit):** `src/sim-lab.js` (new, pure/tested), `test/sim-lab.test.js` (new, 23 tests), `src/index.js` (re-export), `docs/index.html` (lab panels + lens layers), `docs/style.css` (lab + layer styles), `docs/app.js` (lab wiring: env, display, D-pad, recorder, QA), `docs/vendor/src/*` (bundle re-emitted, now 13 modules incl. `sim-lab.js`), this report.

Tests after lab build: **105/105 pass** (`node --test`; 82 existing + 23 new). $0 spent. No hardware. No logins used.

### Parity close-out — official listing facts + final gaps closed (this commit), 2026-09-18

A live browser run documented the official extension's Chrome Web Store listing (the install itself is blocked on automation browsers — see below); its feature list became the final build spec:

- **Name:** Meta Ray-Ban Display Simulator
- **Publisher:** Meta (developer: Meta Platforms, INC., 1 Meta Way, Menlo Park, CA)
- **Version:** 0.5.0 (updated August 26, 2026), 15.09MiB, English
- **Listing:** https://chromewebstore.google.com/detail/meta-ray-ban-display-simu/jpjlmmodokemlepklkdbimceggpbjcll
- **User count:** not displayed in the fetched listing text — not claimed here
- **Install block (this environment):** the Web Store refuses automation Chromium with "Switch to Chrome to install extensions". Per Black's rule, the failure text became the build spec — the in-repo lab is now the tool.

**Two remaining gaps closed:**

1. **"Show Display Frame" toggle** — new `lens-boundary` overlay layer in the lens stack + a "Display frame" toggle in Lab → display settings (default ON). `displayFrameStyle(show)` (pure, tested) returns the CSS: translucent rounded rectangle, `pointer-events:none` — chrome only, never intercepts input.
2. **Performance scoring with improvement prompts** — new `qaPerformance()` (pure, tested) scores 0–100 across four measured levers, weighted by on-lens impact: frame render time (40 — good ≤16.7ms, warn ≤33.3ms), additive-dark pixel ratio (25 — ≥60% of lens pixels near-black), D-pad focusable count (20 — ≥3 targets), overflow (15). Every underperforming check returns a concrete improvement prompt. The QA run measures all four live: a real `performance.now()` frame render, 100×100 rasterization of the actual frame SVG for the dark-pixel ratio, the DOM focusable count, and the scroll check — then appends a score row plus prompts. Partial credit at the warn bands; unmeasured inputs degrade honestly (score 0, "not measured", `poor`).

**Final parity table** (official listing features → our lab):

| Official extension feature (listing) | Our lab (`docs/` + `src/sim-lab.js`) | Status |
|---|---|---|
| Exact 600×600 display frame with toggleable glasses overlay | 600×600 frame, screen-blend additive, `lens-boundary` overlay with "Display frame" toggle | ✅ parity |
| Built-in, custom, and animated environment backgrounds | 4 built-in scenes, custom image upload, CSS-animated backdrop | ✅ parity |
| Live webcam background for real-world blending preview | Webcam toggle (getUserMedia, 600×600) | ✅ parity |
| On-screen + keyboard D-pad input injection | On-screen pad dispatches real `KeyboardEvent`s; physical arrows move focus glasses-style | ✅ parity |
| App brightness, background brightness, blur, and auto-dimming controls | Three sliders + auto-dim toggle (35% after 30s idle), pure `displayFilters()` | ✅ parity |
| Built-in viewport recorder for capturing demos and bug reports | 600×600 lens → canvas `captureStream` + MediaRecorder → WebM download | ✅ parity (gradient scenes record over near-black — stated in UI) |
| "View on Glasses" QR code generation | Not replicated — needs Meta's app deep-link scheme + hardware | ❌ exclusive to theirs |
| Live QA checklist (viewport, favicon, fonts, focus, overflow, and more) | One-click run: lens 600×600, no-scroll, additive-dark backdrop, focusable count, `:focus-visible`, 16px/20px type, PNG favicon, 88px tap targets (advisory) | ✅ parity + extras |
| Performance scoring for the WebApp with prompts for improvements | Measured 0–100 score + a concrete improvement prompt per underperforming check | ✅ parity |

**Still exclusive to the official extension:** the "View on Glasses" QR (deep link into the Meta AI app — meaningless without hardware) and pixel-exact rendering of Meta's own glasses overlay (ours is a spec-faithful translucent rounded rectangle, not Meta's asset). Everything else a developer needs to QA a web app is now in our repo.

**Files (this commit):** `src/sim-lab.js` (`displayFrameStyle`, `PERF`, `qaPerformance`, `gradePerfBand`), `test/sim-lab.test.js` (12 new tests), `docs/index.html` (`lens-boundary` layer + frame toggle), `docs/style.css` (boundary layer style), `docs/app.js` (toggle wiring + measured performance score in the QA run), `docs/vendor/src/sim-lab.js` (demo bundle re-emitted), this report.

Tests: **117/117 pass** (`node --test`; 105 existing + 12 new). $0 spent. No hardware. No logins used.

## 6. Items needing Black's tap

1. **Meta Simulator install** — needs a live browser session (Chrome Web Store → "Meta Ray-Ban Display Simulator" → install → open our demo URL → toggle the extension). A browser task can do this under the saved-login authorization; this verifier cannot operate a browser. No Meta login, no cost.
2. **On-glasses test (Meta)** — only if he ever wants it: open the **Meta AI app** on his phone → **Devices → Display Glasses settings → App connections → Web apps → Add a web app** → name "KingCode Lens", URL `https://cumulativewebinc.github.io/cwi-kingcode-lens/`. Under 5 minutes, his own login, needs Ray-Ban Display hardware. Developer Preview = build/test only, no public distribution yet.
3. **Brilliant Labs Frame hardware** — still the only way to truly lab-test the full voice loop. Purchase needs his explicit approval (unchanged). When it happens, the open route covers everything: flash our Lua via the open SDK, self-host the assistant path — no vendor account.
4. **Native DAT path (Meta on-glasses voice)** — deferred by design; when wanted, it's Swift/Kotlin work under Meta's developer terms — a future lane, not a tap.

Nothing else is gated. The Brilliant Labs lane needs no enrollment at all. **No saved logins were consumed by this verification; none were needed.**
