# KingCode Lens — Scaling

Date: 2026-09-18. Companion to `ARCHITECTURE.md` and `INTERFACES.md` §5.
Decision record: `TWENTY-MINDS-2026-09-18.md`, Decision 5 (v1 single-process, labeled honestly — confidence: high).

## 0. The honest label

**v1 is single-process.** One process runs the `ActivationSequencer`, the in-process `SessionStore`, the in-process `ToolRegistry`, the voice pipeline adapters, and the SVG renderer. It serves one user (Black) plus occasional demos. Every README, demo caption, and status page says "single-process" until the load-test gates below are passed and the horizontal path is actually built. No scale claim without measurement — "verified or it didn't happen."

## 1. What v1 single-process looks like

```
┌──────────────────────────────────────────────────────────┐
│ kingcode-lens runtime (one process)                            │
│                                                          │
│  HTTP/WS server                                          │
│   ├── POST /chunk      (AudioChunk upload, per session)   │
│   ├── GET  /frame      (latest SVG frame + text, polled   │
│   │                     by MetaDisplay web page / pushed   │
│   │                     over BLE by companion)             │
│   ├── GET  /audio      (TTS PCM chunks for playback)     │
│   ├── POST /activate   (notifyRoutedActivation endpoint)  │
│   └── GET  /events     (sequencer observability stream)   │
│                                                          │
│  ActivationSequencer ×N sessions (in-memory map)          │
│  SessionStore        (in-memory append-only log)          │
│  ToolRegistry       (in-process function table)          │
│  STT / TTS / Decide (in-process local models)           │
│  Renderer           (pure function: state → SVG)         │
└──────────────────────────────────────────────────────────┘
```

**Seam discipline** (so the horizontal path is a reimplementation, not a rewrite):
- `SessionStore`, `ToolRegistry`, `STTAdapter`, `TTSAdapter`, `DecisionAdapter`, `HardwareAdapter` are interfaces with in-process implementations — no direct imports of the implementations anywhere else.
- No process-local assumptions leak: no in-memory caches keyed by session outside the store, no timers owned outside the sequencer, no globals.
- The Renderer is already a pure function — it extracts to a worker or edge function with zero changes.

**Known single-process limits** (stated upfront, not discovered at 2am):
- Concurrent activations share one event loop / one GPU-less CPU pool — STT and TTS are the bottlenecks.
- One crash loses all in-memory sessions (availability casualty; acceptable for a demo-stage single user).
- One deploy takes everything down.

## 2. The horizontal path (documented, unclaimed)

When measured load demands it — not before:

```
                    ┌─────────────────────┐
  companions ──────►│  ingest / API tier  │──► chunked AudioChunk upload
  (many)            │  (stateless)        │    (object storage or stream)
                    └─────────┬───────────┘
                              │ session id
              ┌───────────────▼────────────────┐
              │  sequencer workers (stateless, │◄── pull session state
              │  N replicas, anycast)          │    from durable store
              └───────────────┬────────────────┘
                              │ append events / read-write
              ┌───────────────▼────────────────┐
              │  durable session store         │
              │  (append-only event log +      │
              │   idempotency keys)            │
              └───────────────────────────────┘
  renderer: pure function → runs anywhere (worker, edge, or co-located)
  STT/TTS: external services or GPU pool behind the same adapter interfaces
```

### 2.1 Stateless sequencer workers

Each activation is one causal chain: a worker loads the session's event log, appends the new event, runs the transition, emits the frame/audio, and drops all local state. Workers hold **no session affinity** — any worker can continue any session. The `ActivationSequencer` interface doesn't change; only its state backend does.

### 2.2 Durable session store

**Event schema (specified in v1 — adopted from the Twenty Minds dissent, so the swap is mechanical):**

```js
// SessionEvent — the only thing ever appended
{
  v: 1,                       // schema version
  sessionId: string,          // uuid v4, created by SessionStore.create()
  seq: number,                // monotonic per session (idempotency + ordering)
  ts: number,                 // epoch ms, writer clock
  type: string,               // e.g. 'wake.detected','stt.final','decision.made',
                              // 'tool.executed','confirm.asked','confirm.yes',
                              // 'confirm.no','confirm.timeout','tts.done',
                              // 'state.transition','error'
  payload: object,            // type-specific; decision events carry the full
                              // {action,target,params,confidence}
  idempotencyKey: string,     // uuid per attempted write; store dedupes
}
// SessionStore surface (unchanged across v1 → horizontal):
//   create(session) -> id; append(id, event) -> seq; get(id) -> events[]; close(id)
```

Rules: append-only (no updates, no deletes — corrections are new events); `append` is idempotent on `idempotencyKey`; readers rebuild state by replaying `events[]` in `seq` order; retention policy TBD (voice-adjacent data — default to short retention with explicit user opt-in for longer training logs).

### 2.3 Chunked audio

v1 uploads `AudioChunk`s (16kHz mono PCM16) per session over HTTP POST as they stream in — the sequencer processes incrementally. At scale this becomes: chunked upload to object storage / a media stream, with the sequencer workers pulling by session id. The `AudioChunk` shape (`{pcm, sampleRate, channels, ts}`) doesn't change; only the transport does. First thing to break at scale is this path — it's designed for the break from day one.

## 3. Load-test gates (before ANY scale claim)

No horizontal claim is made until **all** of these are measured and recorded:

| Gate | What to measure | Pass bar (initial) |
|------|-----------------|-------------------|
| G1 concurrency | Sustained concurrent activations, single process | p95 end-to-end ≤2.5s at 10 concurrent activations |
| G2 audio throughput | Chunked upload + STT under concurrent streams | No chunk loss, STT p95 ≤800ms at 10 concurrent streams |
| G3 session store | Append/get latency, idempotent retries | append p99 ≤50ms; duplicate `idempotencyKey` → single write |
| G4 failover | Kill one sequencer worker mid-activation | Session continues on another worker, ≤1 duplicate event (deduped) |
| G5 soak | 24h mixed activation traffic | No memory growth, no session corruption, renderer output byte-identical for same state |

Until G1–G5 pass on the horizontal build, the label stays "single-process." A load test against imaginary traffic is theater — the gates run against realistic activation traces captured from real (simulator or hardware) usage.

**Trigger to build the horizontal path**: measured sustained load that saturates the single process (e.g., >10 concurrent activations, or a public demo spike) — or a second real user. Not before.

## 4. Cost profile at $0

| Layer | v1 (single-process) | Horizontal (when built) |
|-------|---------------------|------------------------|
| Compute | $0 — one VM/container we already run, or a local machine | $0 while on free-tier containers; stateless workers scale to zero |
| STT / TTS / wake | $0 — local models (Whisper-class, Piper-class, openWakeWord-class), CPU inference | $0 while local; managed APIs only with explicit approval |
| Session store | $0 — in-process memory | $0 options exist (SQLite-family file, free-tier KV); managed DB only with approval |
| Audio transport | $0 — direct HTTP POST to our process | $0 while direct; object storage only if free tier covers it |
| Bandwidth | Negligible at demo scale (16kHz PCM ≈ 32KB/s per active stream; SVG frames are bytes) | Same math, linear |

**The rule**: every layer above has a $0 implementation. Any step that introduces a paid dependency (managed STT/TTS APIs, hosted DB, CDN, GPU inference) requires **Black's explicit approval** — no spending, no exceptions, per the standing carve-outs. If a load-test gate can't be passed on the $0 path, the finding is reported as a costed proposal, not silently bought.

**Where costs would first appear** (forecast, not commitment): managed STT/TTS per-minute billing if local models can't hit the latency budget; durable store hosting if sessions must survive process restarts for real users; bandwidth if activation volume grows 100×. Each gets its own proposal with numbers before a dollar moves.

## 5. What v1 deliberately does NOT do

- No multi-region, no CDN, no edge inference.
- No horizontal autoscaling, no Kubernetes, no service mesh.
- No managed vector DB / memory service — session history is the event log.
- No analytics pipeline beyond the append-only session events (which double as the calibration dataset).

Boring v1, honest labels, measured gates. Scale is built when the load arrives — with receipts.
