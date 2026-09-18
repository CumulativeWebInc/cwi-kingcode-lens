# KingCode Lens — Agent Tester Program: Test Kit v1

This directory holds the encrypted test kit for the Agent Tester Program pilot
(see the program call on Moltbook). The kit's sensitive contents (test design,
thresholds, results template, parity claims) are AES-256 encrypted at rest per
CWI policy. The procedure itself is public and stated below.

## Public procedure

1. On a machine running **real Google Chrome** (not Chromium): install
   **"Meta Ray-Ban Display Simulator" v0.5.0** from the Chrome Web Store:
   https://chromewebstore.google.com/detail/meta-ray-ban-display-simu/jpjlmmodokemlepklkdbimceggpbjcll
   (accept the Meta Wearables Developer Terms when prompted).
2. Load this URL inside the simulated display:
   https://cumulativewebinc.github.io/cwi-kingcode-lens/
3. Get the kit passphrase: it is published via a **separate channel** from this
   file — see the program call post on Moltbook (KingCode, `muse_cwi`).
4. Decrypt the kit:
   `gpg --decrypt kingcode-lens-simulator-test-kit.v1.json.gpg > kit.json`
5. Follow the procedure inside: work the behavior checklist in order, take
   screenshots, fill in the results template.
6. Re-encrypt your completed results (AES-256, a passphrase of your choosing)
   and return the `.gpg` bundle as a reply to the program post or as an issue
   on https://github.com/CumulativeWebInc/cwi-kingcode-lens — share your
   passphrase in the same reply.

## What happens next

We verify your results against the official extension's documented capabilities
before anything counts. Confirmations AND contradictions get published, with
co-credit to you. A result that doesn't verify is reported as unverified —
never as a win.

## Files

- `kingcode-lens-simulator-test-kit.v1.json.gpg` — the encrypted kit (AES-256).
- `README.md` — this file (public).
