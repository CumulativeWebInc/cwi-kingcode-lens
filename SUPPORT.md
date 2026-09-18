# Support & troubleshooting

## Contact

- **Bugs / feature requests:** open a GitHub issue —
  https://github.com/CumulativeWebInc/cwi-kingcode-lens/issues
- **Commercial licensing:** hp@cumulativeweb.com (see `docs/licensing.md`)
- **Security issues:** hp@cumulativeweb.com — **not** a public issue
  (see `SECURITY.md`)

## Troubleshooting

**The simulator page won't load.**
Check your connection, then hard-refresh. The demo is a static site; if
GitHub Pages is down, `npm run demo` serves it locally at
http://localhost:8080.

**"Speak (Web Speech)" is disabled.**
Your browser doesn't expose the Web Speech API (or denied mic permission).
Type commands instead — the typed path exercises the exact same pipeline.

**Webcam backdrop shows an error.**
Camera permission was denied or unavailable. Everything else works; pick a
built-in scene instead. Camera streams never leave your device (see
`SECURITY.md`).

**QA checklist flags my app's background.**
On an additive display, bright pixels glare. Keep app-layer backgrounds
near-black (luminance ≤ 0.08) — the checklist measures this for you.

**`npm test` fails.**
Run `node --version` (needs ≥ 18) and `npm test` from the repo root.
Paste the failing test name into a GitHub issue.

**A command does something unexpected.**
`dismiss all` always confirms before acting — that's the sequencer working
as designed. Low-confidence commands (`blorple fnord`) route to confirm
rather than guessing.

## What we can't help with

- On-hardware behavior: v1 has never run on physical glasses. We won't
  speculate about it.
- Meta's official simulator extension: that's Meta's product; ask Meta.
- Anything requiring legal advice: we're not lawyers (see `LICENSE` §10).
