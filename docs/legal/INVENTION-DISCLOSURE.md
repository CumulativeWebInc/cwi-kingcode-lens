# Invention Disclosure — Invocable On-Eyewear Agent ("Glassface" lane)

**Date of disclosure:** 2026-09-18 (UTC)
**Authoring lane:** ATHENA / KingCode — Digital Licensing + Naming worker
**Lane:** Glassface (invocable on-eyewear agent)
**Status:** DEFENSIVE PUBLICATION — this is NOT a patent (see "What this is NOT" below)

## 1. Field

An always-available, voice-invocable AI agent delivered through smart-glasses hardware: the user
speaks a wake phrase, the agent answers on the lens. The glasses are a thin client — capture audio,
render a glanceable avatar, and take voice input. All recognition, decision-making, and speech
synthesis run in swappable software layers behind a hardware abstraction.

## 2. The invention (what we built)

### 2.1 HardwareAdapter — glasses as a thin client behind one interface

Every glasses backend conforms to the same `HardwareAdapter` contract:

- `name` identifies the backend (e.g. `brilliant-labs`, `meta-display`, `android-xr`);
- `capabilities()` reports display (width, height, color, additive), mic (sample rate, channels),
  wake-word mode (`custom` | `routed`), inputs (voice, gesture, dpad), and `maxFrameBytes`
  (lens payload budget);
- `captureAudio()` yields an async stream of 16 kHz mono PCM16 audio chunks until disconnect;
- `renderFrame({state, svg, text, ts})` pushes one avatar frame to the lens — a self-contained SVG,
  dark background (#000), high contrast, avatar occupying ~40% of viewport center, no external
  references.

Consequence: the same voice agent runs on any conforming glasses. Swapping hardware = swapping the
adapter. One conformance suite tests every backend against the SAME suite (INTERFACES.md).

### 2.2 Activation sequencing — wake → recognize → confidence-gated execution → avatar feedback

The `ActivationSequencer` wires the pipeline:

1. **Idle** — renderer shows IDLE avatar; `WakeDetector.detect` listens for the wake phrase.
2. **Listening** — on wake, mic capture streams audio chunks to `STTAdapter` until utterance end.
3. **Thinking** — `DecisionAdapter.decide(text, ctx)` returns a typed decision
   `{action, target, params, confidence}` in the exact shape of the cwi-voice-command decision contract.
4. **Confidence gating** — confidence ≥ 0.75 AND not destructive → execute tool → **Speaking**
   (TTS + speaking avatar). Below threshold or destructive → **Confirming**: the avatar asks
   "Do X? say yes/no" with a 10 s timeout to idle. Destructive tools ALWAYS confirm regardless of
   confidence. Confirm → re-decide with confirmation context; deny/timeout → idle.
5. **Speaking** — TTS chunks play, avatar SPEAKING, then back to idle.
6. **Any → idle** on error, timeout, or disconnect. Illegal state transitions throw; every legal
   transition emits `{from, to, ts, reason}`.

### 2.3 Glanceable avatar state machine

Five states — IDLE, LISTENING, THINKING, SPEAKING, CONFIRMING — with the legal transitions above.
The avatar is the single feedback channel on the lens: the user always knows whether the agent is
listening, thinking, speaking, or asking for confirmation. Rendering is budget-aware
(`maxFrameBytes`), dark/high-contrast, and glanceable.

### 2.4 Dual wake-word path

- **Custom path:** on open hardware (e.g. BrilliantLabs) we own wake-word detection —
  the WakeDetector listens locally for **"Hey KingCode"** and fires the sequencer.
- **Routed path:** on host-assistant hardware (e.g. Meta Display) activation arrives via the host
  assistant (**"ask KingCode"**) — the sequencer exposes `notifyRoutedActivation()` and the
  WakeDetector is inert (`{detected:false}`).

The two paths converge at the same sequencer: one agent, two doorways.

### 2.5 Honest scaling

v1 is single-process (in-process SessionStore and ToolRegistry). The horizontal path (stateless
sequencer workers, durable session store, chunked audio upload) is documented but never claimed
until load-tested.

## 3. Prior art awareness (non-exhaustive)

Smart glasses with voice assistants, wake-word detection, and on-lens displays are well-established
prior art. This disclosure claims only the specific arrangement above: the HardwareAdapter thin-client
contract with a shared conformance suite, the five-state glanceable avatar as the sole feedback
channel, the confidence-gated activation sequencer with mandatory destructive confirmation, and the
dual custom/routed wake-word path converging on one sequencer. It claims no novel wake-word
algorithm, no novel speech-recognition method, no novel lens hardware.

## 4. What this is NOT

- **This is a defensive publication, NOT a patent.** No patent rights are claimed, applied for, or
  conferred by this document.
- This document creates **no exclusivity, no licensing right, no right to exclude others**, and no
  legal protection of any kind.
- Filing a real patent application requires a patent attorney. If CWI ever wants patent protection
  for any of this, that is a separate engagement with qualified patent counsel — this worker is not
  one, and no part of this document is patent-application language.
- Nothing in this disclosure should be described to anyone — internally or externally — as a patent,
  patent filing, patent pending, or patent protection. The honest label is: **defensive disclosure**.

## 5. Anchor (NEEDLE DROP-style seal)

Anchored per the CWI NEEDLE DROP convention: SHA-256 content hash + UTC timestamp + hash-chain
record, verifiable offline with a single command. See `SEAL.json` in this directory.

---

*Filed 2026-09-18 by the Digital Licensing + Naming worker on ATHENA's Glassface lane, under
Black's standing "fire always / results only" directives, with the truth rules intact.*
