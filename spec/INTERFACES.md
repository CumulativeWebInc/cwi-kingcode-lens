> Canonical contract, held by the lane coordinator. This is a read-only copy (v1.1, 2026-09-18) for sibling workers — the coordinator's copy in `~/workspace/glassface/spec/INTERFACES.md` is authoritative.

# Glassface — Canonical Interface Contract v1.1
Date: 2026-09-18. Owner: ATHENA lane (coordinator-held). v1.1: all 8 Twenty-Minds amendments adopted (MetaDisplay is display-first on the web path — no on-glasses mic/voice; 'routed' = companion-signaled; frame seq; per-adapter recommendedThreshold; wake streaming contract; CONFIRMING renders full action + confirm/deny are session events; durable session schema + idempotency from SCALING.md §2.2).

Every backend MUST satisfy these interfaces. Conformance suite tests each backend against the SAME suite.

## 0. Shared types (JS, JSDoc)

```js
// AudioChunk: raw mic/speaker audio. 16kHz mono PCM16 preferred.
{ pcm: Int16Array, sampleRate: 16000, channels: 1, ts: number } // ts = epoch ms of chunk start

// Transcript
{ text: string, confidence: number /*0..1*/, isFinal: boolean }

// Typed decision — MUST mirror cwi-voice-command's decision shape exactly:
// { action: string, target: string|null, params: object, confidence: number }
// e.g. { action:'mute', target:'vocals', params:{}, confidence: 0.93 }
```

## 1. HardwareAdapter (the glasses are a thin client)

> **v1.1 amendment (2026-09-18, Twenty Minds):** Meta's Ray-Ban Display **web-app path exposes no microphone, no voice hooks, and no third-party assistant integration** (two independent community sources, mid-2026; re-verify against Meta's official docs before any native work). MetaDisplay is therefore **display-first** on the web path: `captureAudio()` yields **phone-companion-mic chunks relayed via cloud**, never on-glasses `getUserMedia`. On-glasses voice on Meta hardware requires the native Device Access Toolkit (Swift/Kotlin, Meta developer terms) — deferred. BrilliantLabs remains the full-loop path (custom wake word + mic + display).

```js
class HardwareAdapter {
  get name() {}                       // 'brilliant-labs' | 'meta-display' | 'android-xr'
  async capabilities() {}             // see below
  async connect() {}                  // throws AdapterError on failure
  async disconnect() {}
  async *captureAudio() {}            // AsyncGenerator<AudioChunk> — mic stream, yields until disconnect
  async renderFrame(frame) {}         // push one avatar frame to the lens; resolves when accepted
}

// capabilities() returns:
{
  display: { width: number, height: number, color: boolean, additive: boolean },
  // MetaDisplay: 600x600, color, additive (black = transparent). BrilliantLabs Frame: 640x400, color OLED.
  mic: { sampleRate: number, channels: number },
  wakeWord: 'custom' | 'routed',
  // 'custom'  = we own wake-word detection ("Hey KingCode") — BrilliantLabs. Ships only
  //             if it passes the week-4 false-accept gate; else v1 falls back to companion-tap.
  // 'routed'  = activation signaled by the phone companion (companion app button/tap/gesture),
  //             delivered via ActivationSequencer.notifyRoutedActivation(). NOT a host-assistant
  //             hook — Meta's web path offers no third-party assistant integration.
  inputs: string[],                    // e.g. ['voice','dpad'] or ['voice','gesture']
  maxFrameBytes: number,               // lens payload budget; renderer must stay under it
  recommendedThreshold: number         // per-adapter decision-confidence threshold (default 0.75);
                                       // sequencer uses max(global threshold, adapter recommendation)
}

// frame passed to renderFrame():
{ state: AvatarState, svg: string, text: string|null, ts: number, seq: number }
// seq: monotonic frame sequence per connection — lets the companion detect BLE dropped frames.
// svg: self-contained SVG string, DARK background (#000), high contrast, glanceable.
//      Small: avatar occupies center ~40% of viewport. No external refs.
```

## 2. Avatar state machine

```js
const AvatarState = { IDLE:'idle', LISTENING:'listening', THINKING:'thinking', SPEAKING:'speaking', CONFIRMING:'confirming' };
// Legal transitions:
//   idle -> listening        (wake detected)
//   listening -> thinking    (utterance end / STT final)
//   thinking -> speaking     (decision confident, response ready)
//   thinking -> confirming   (decision below threshold or destructive)
//   confirming -> thinking   (user confirms; re-decide with confirmation context)
//   confirming -> idle       (user denies / timeout 10s)
//   speaking -> idle         (TTS done)
//   any -> idle              (error / timeout / disconnect)
// Illegal transitions must throw; every transition emits {from,to,ts,reason}.
```

## 3. Voice pipeline adapters

```js
class WakeDetector {
  // mode 'custom': local wake-word "Hey KingCode" over audio chunks.
  //   Streaming contract: detect() is called on a rolling window — every 500ms the caller
  //   passes the last 1500ms of chunks; the detector retains no more than 3s of audio,
  //   returns {detected, confidence}, and resets its window after a detection.
  // mode 'routed': always returns {detected:false} — activation arrives via the companion;
  //   the sequencer exposes notifyRoutedActivation() instead.
  async detect(chunks: AudioChunk[]) {} // -> { detected: boolean, confidence: number }
}

class STTAdapter {
  async transcribe(chunks: AudioChunk[]) {} // -> Transcript (isFinal=true; streaming optional extension)
}

class TTSAdapter {
  async speak(text: string) {}             // -> AudioChunk[] (16kHz PCM16)
}

class DecisionAdapter {
  // Local $0 classifier for v1. Shape mirrors cwi-voice-command.
  async decide(text: string, ctx: object) {}
  // -> { action: string, target: string|null, params: object, confidence: number }
  // ctx: { sessionId, priorTurns: string[], routedActivation: boolean }
}
```

## 4. ActivationSequencer (wires it all)

```js
new ActivationSequencer({ hardware, wake, stt, decide, tts, renderer, threshold=0.75, tools })
async *run() // yields {event, state, detail} for observability; runs until abort()
// External activation entry point for 'routed' adapters:
notifyRoutedActivation(signal) // signal: { source:'companion-tap'|'companion-gesture', ts } -> jumps idle->listening
// Sequence:
//  idle: renderer shows IDLE avatar. Await wake.detect -> LISTENING (+ mic capture start).
//        ('routed' adapters: notifyRoutedActivation() triggers the same transition.)
//  listening: stream chunks to STT until utterance end -> THINKING.
//  thinking: decide(text, ctx) ->
//     confidence >= max(threshold, adapter.recommendedThreshold) AND not destructive
//        -> execute tool -> SPEAKING (tts+speak avatar)
//     else -> CONFIRMING (avatar renders the FULL action text on the lens: "Do X? say yes/no";
//        10s timeout -> idle). Every confirm and every deny is appended as a session event
//        (for threshold calibration) -> confirming->thinking (confirmed) or ->idle (denied/timeout).
//  speaking: play TTS chunks, avatar SPEAKING -> idle.
// Destructive actions (tool metadata marks destructive:true) ALWAYS confirm regardless of confidence.
```

## 5. Cloud task runtime (honest scaling)

```js
// SessionStore: { create(session)->id, append(id, event), get(id), close(id) }
//   v1 adopts the durable session event schema + idempotency keys specified in
//   spec/SCALING.md §2.2 from day one, so the future stateless-worker swap is mechanical.
// ToolRegistry: tools register { name, destructive: boolean, run(args)->result }
// v1: in-process implementations. SCALING.md documents the horizontal path:
// stateless sequencer workers + durable session store + audio via chunked upload.
// Never claim horizontal scale until load-tested; label v1 "single-process".
```

## 6. Truth labels (enforced in README + demo)
- Simulator results are labeled SIMULATOR. No "on Meta hardware" claim until a real-hardware test.
- No Meta partnership/endorsement/review claims, ever.
- Invention disclosure is NOT a patent — label it as defensive disclosure.
