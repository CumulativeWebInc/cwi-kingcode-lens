# Security policy

## Reporting a vulnerability

**Do not open a public issue.** Email **hp@cumulativeweb.com** with:

- What you found and where (file, line, or URL).
- Steps to reproduce, if you have them.
- What you think the impact is.

We will acknowledge receipt and keep you posted. Please give us a
reasonable window to fix before any public disclosure.

## Scope notes

- KingCode Lens v1 is a **simulator**: there is no production backend, no
  user accounts, no stored credentials, and no server-side attack surface
  in this repository. The demo runs entirely in the visitor's browser.
- The demo requests **camera** (webcam environment backdrop) and
  **microphone** (Web Speech input) access only when you explicitly enable
  those controls. Granting access is optional; the simulator works fully
  without it. Camera/mic streams never leave your device — there is no
  server to send them to, and nothing is recorded except the WebM you
  explicitly choose to download.
- Dependencies: **zero**. `npm test` runs on Node's built-in test runner.
  The supply-chain surface is the Node.js runtime itself.

## Out of scope

Social-engineering reports, physical-security issues, and vulnerabilities
in third-party platforms (GitHub, Meta's extension, browsers) are out of
scope — report those to the relevant vendor.
