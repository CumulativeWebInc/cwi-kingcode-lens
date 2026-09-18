# "View on Glasses" — graceful-fallback UX spec (v1)

**For:** KingCode Lens demo (`docs/`), hand to the productization coordinator.
**Problem:** Meta's official simulator generates a "View on Glasses" QR that hands the web app
to physical Meta Ray-Ban Display glasses via Meta's private companion-app scheme.
We cannot replicate the private scheme. A dead button is a lie; a fake handoff is worse.
This spec makes the button honest *and* useful with no hardware.

## Principle

Never fake a handoff. One tap must teach the user what's needed in under 10 seconds
and still give them something useful (phone handoff).

## Flow

1. **Button** — "View on Glasses" stays (parity with the official extension), with a small
   ⓘ affordance. Labeled honestly in the surrounding hint text:
   *"Sends this demo toward physical glasses (needs the official Meta app + paired glasses)."*
2. **Tap → modal sheet** (not a navigation, not a spinner):
   - **QR code** encoding the **current demo URL** (including any lab state worth sharing),
     generated **client-side** (vendored zero-dep QR lib — no external QR API, no uploads).
     Purpose is explicit in the caption: *"Scan with your phone to continue this demo in your
     mobile browser."* Phone handoff is the real utility when glasses aren't present.
   - **Honest requirements box:**
     > "To view on physical Meta Ray-Ban Display glasses, open this page in the official
     > Meta companion app with paired glasses. The direct glasses handoff needs Meta's
     > app — this simulator can't push to hardware."
   - **Actions:** [Copy link] · [Meta wearables developer docs →] (official docs URL).
   - **Optional deep-link attempt:** if Meta documents a public URL scheme, attempt it on tap
     with a ~1.5 s timeout; on timeout/failure show the fallback copy above. Never show a
     success state unless the OS confirms the handoff.
3. **Degraded state** (QR lib fails / no canvas): show the URL as selectable text + [Copy link].
   Still functional, still honest.
4. **Title & badges:** modal titled "View on Glasses", carries the `SIMULATOR` badge and a
   one-line note: *"Preview only — no hardware connected."*

## Copy rules (truth binding)

- Never "Sending to glasses…" with a fake progress bar.
- Never imply the QR itself puts the app on glasses — it encodes the demo URL for phone handoff.
- Name the official Meta app as the requirement; link Meta's docs, don't paraphrase their scheme.

## Implementation notes (coordinator)

- Markup in `docs/index.html`, logic in `docs/app.js`, QR lib vendored under `docs/vendor/`
  (stays zero-dep / $0; keep the "generated vs vendored" labeling convention).
- QR payload = `location.href` at tap time (captures lab state in the URL if state is URL-encoded;
  otherwise the base demo URL).
- **Demand telemetry (feeds the 2026-10-30 on-face kill rule):** count taps locally
  (localStorage counter, no network). If taps are high and hardware handoffs are zero,
  that's the quantified case for/against the real on-face demo.

## Acceptance (stranger test)

A user with no glasses taps "View on Glasses" and within 10 seconds understands:
(1) why nothing appeared on glasses, (2) what they'd need (Meta app + paired glasses),
(3) what they *can* do right now (scan the QR to continue on their phone).
