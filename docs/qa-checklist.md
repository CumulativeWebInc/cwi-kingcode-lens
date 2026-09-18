# QA checklist guide

Tap **Run QA checklist** in the simulator lab (or call the pure functions in
`src/sim-lab.js` from Node). Every check returns `{ pass, detail }` —
advisory checks add `warn: true` instead of failing the run.

## The checks

| Check | What it verifies | Pass bar |
|---|---|---|
| Lens size | surface matches the Meta spec | exactly 600×600 |
| No scroll | no overflow inside the lens frame | scroll ≤ client, both axes |
| Frame backdrop | app-layer background is near-black | luminance ≤ 0.08 (additive: bright glares) |
| Focusable count | D-pad has targets to move between | ≥ 3 keyboard-focusable controls |
| Focus visible | focused control is visibly outlined | `:focus-visible` outline > 0px |
| Font sizes | type is legible on-lens | body ≥ 16px, primary on-lens ≥ 20px |
| Favicon | PNG favicon linked | `.png` href present (SVG unsupported on MRBD) |
| Tap target (advisory) | controls meet Meta's minimum | smallest control ≥ 88×88px |

## Performance score (0–100)

Four measured levers, each contributing points and each emitting a concrete
improvement prompt when it underperforms:

- **Frame render time** (40 pts) — good ≤ 16.7ms, warn ≤ 33.3ms, measured
  with `performance.now()` around a real frame render.
- **Additive-dark pixel ratio** (25 pts) — ≥ 60% of sampled pixels near-black;
  measured by rasterizing the actual frame SVG at 100×100.
- **D-pad focusables** (20 pts) — ≥ 3 focusable controls in the live DOM.
- **Overflow** (15 pts) — no scrollable overflow.

Unmeasured inputs degrade honestly: score 0 with a "not measured" note,
never a guessed number.

## Reading the results

Green = shippable on the checklist's terms. Amber (advisory) = review, not
block. Red = fix before calling the app lens-ready. The checklist mirrors
the automated checks in Meta's official simulator; it does not replace
testing on physical hardware — nothing in v1 has run on real glasses.
