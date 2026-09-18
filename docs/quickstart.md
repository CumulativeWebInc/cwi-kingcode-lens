# Quickstart — KingCode Lens in under one minute

No install. No account. No hardware.

**Step 1.** Open the simulator:
https://cumulativewebinc.github.io/cwi-kingcode-lens/

**Step 2.** Type a command in the **Command** box — try `what time is it` —
and tap **Companion tap → ask KingCode**.

**Step 3.** Watch the lens: the avatar moves `idle → listening → thinking →
speaking`, and the answer appears on the simulated 600×600 display.

That's it. You're done in under a minute.

## Next things to try (still free)

- **Destructive command:** type `dismiss all` — the sequencer always asks
  for confirmation first. Confirm and deny are session events, not dead ends.
- **Ambiguous command:** type `blorple fnord` — low confidence triggers a
  confirm step instead of guessing.
- **D-pad:** use the on-screen pad (or your physical arrow keys) to move
  focus between controls, Enter to activate, Escape to go back — this mirrors
  how Neural Band / captouch input reaches Meta Ray-Ban Display web apps.
- **Environments:** switch the lens background between built-in scenes,
  upload your own, or turn on your webcam for a real-world blending preview.
- **QA:** tap **Run QA checklist** to run the same automated checks Meta's
  official simulator runs, plus a 0–100 performance score.

## From source (developers)

```bash
git clone https://github.com/CumulativeWebInc/cwi-kingcode-lens.git
cd cwi-kingcode-lens
npm test          # 117 tests, all green
npm run demo      # http://localhost:8080
```

Free for personal, development, and evaluation use — see
[`licensing.md`](licensing.md).

## What this is not

A SIMULATOR label marks every simulated surface. Nothing here runs on
physical eyewear; wake-word spotting, mic audio, speech recognition, and the
lens itself are all simulated. No Meta partnership, endorsement, or review.
