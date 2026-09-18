/**
 * adapters.js — HardwareAdapter implementations per spec/INTERFACES.md §1.
 *
 * Backends:
 *  - BrilliantLabsAdapter ('brilliant-labs') — SIMULATED BLE transport
 *    harness. No hardware is touched; connect()/captureAudio()/renderFrame()
 *    are deterministic simulations so the full activation sequence is
 *    testable at $0. Documented as SIMULATED everywhere it surfaces.
 *  - MetaDisplayAdapter ('meta-display') — emits the web-app bundle targeting
 *    the 600x600 additive display; transport SIMULATED. This is the backend
 *    the Pages lens simulator drives.
 *  - AndroidXRAdapter ('android-xr') — declared stub: capabilities() answers
 *    honestly; connect()/captureAudio()/renderFrame() throw AdapterError
 *    (NOT_IMPLEMENTED). The conformance suite asserts exactly this.
 *
 * Simulation hints ride on chunks as `chunk.sim` ({wakeWord, transcript,
 * utteranceEnd}); real backends never set `sim`. Everything labeled.
 */
import { AdapterError } from './errors.js';

const CHUNK_MS = 100;
const SAMPLE_RATE = 16000;

function makeChunk(ts, sim = {}) {
  const n = Math.floor((SAMPLE_RATE * CHUNK_MS) / 1000);
  return {
    pcm: new Int16Array(n), // simulated silence; real backends fill mic PCM16
    sampleRate: SAMPLE_RATE,
    channels: 1,
    ts,
    // sim.source: 'on-glasses-mic' | 'companion-mic-relay' — set by the
    // transport. Real backends never set `sim`.
    sim: { wakeWord: false, transcript: null, utteranceEnd: false, source: null, ...sim },
  };
}

export class HardwareAdapter {
  get name() {
    throw new AdapterError('name not implemented', 'NOT_IMPLEMENTED', 'base');
  }
  async capabilities() {
    throw new AdapterError('capabilities() not implemented', 'NOT_IMPLEMENTED', 'base');
  }
  async connect() {
    throw new AdapterError('connect() not implemented', 'NOT_IMPLEMENTED', 'base');
  }
  async disconnect() {
    /* idempotent default */
  }
  async *captureAudio() {
    throw new AdapterError('captureAudio() not implemented', 'NOT_IMPLEMENTED', 'base');
    yield makeChunk(Date.now()); // unreachable; keeps this an async generator
  }
  async renderFrame(/* frame */) {
    throw new AdapterError('renderFrame() not implemented', 'NOT_IMPLEMENTED', 'base');
  }
  /** Validate a frame object before accepting it. Shared by simulated backends. */
  _validateFrame(frame) {
    if (!frame || typeof frame.svg !== 'string' || typeof frame.state !== 'string') {
      throw new AdapterError('renderFrame: frame must be {state, svg, text, ts}', 'INVALID_FRAME', this.name);
    }
    return frame;
  }
}

/**
 * Shared deterministic simulation transport. NOT hardware.
 * setScript([...]) programs the mic: each step {ms?, wakeWord?, transcript?,
 * utteranceEnd?}. With no script, yields silence until disconnect().
 */
export class SimulatedTransportAdapter extends HardwareAdapter {
  constructor() {
    super();
    this._connected = false;
    this._script = null;
    this._scriptPos = 0;
    this.lastFrame = null;
    this.framesRendered = 0;
    // v1.1 frame-seq accounting: lets the companion detect dropped frames.
    this._lastSeq = 0;
    this.frameStats = { received: 0, droppedFrames: 0, duplicates: 0 };
  }

  get transport() {
    return 'simulated'; // honest label; surfaces in capabilities()/logs
  }

  /** Mic provenance for this transport: 'on-glasses-mic' | 'companion-mic-relay'. */
  get micSource() {
    return 'simulated-mic';
  }

  /** Program the simulated mic. Steps: {ms?, wakeWord?, transcript?, utteranceEnd?} */
  setScript(steps) {
    this._script = steps.map((s) => ({ ms: CHUNK_MS, ...s }));
    this._scriptPos = 0;
    return this;
  }

  get connected() {
    return this._connected;
  }

  async connect() {
    if (this._connected) return { ok: true, simulated: true, already: true };
    await new Promise((r) => setTimeout(r, 5)); // simulated BLE handshake latency
    this._connected = true;
    this._lastSeq = 0; // seq restarts per connection (spec §1 v1.1)
    this.frameStats = { received: 0, droppedFrames: 0, duplicates: 0 };
    return { ok: true, simulated: true, transport: this.transport };
  }

  async disconnect() {
    this._connected = false;
  }

  async *captureAudio() {
    if (!this._connected) {
      throw new AdapterError(`${this.name}: captureAudio before connect`, 'NOT_CONNECTED', this.name);
    }
    let ts = Date.now();
    for (;;) {
      let step;
      if (this._script && this._scriptPos < this._script.length) {
        step = this._script[this._scriptPos++];
      } else if (this._script) {
        return; // scripted mic ends the stream deterministically
      } else {
        step = { ms: CHUNK_MS }; // unscripted: silence until disconnect
      }
      const chunks = Math.max(1, Math.round(step.ms / CHUNK_MS));
      for (let i = 0; i < chunks; i++) {
        if (!this._connected) return;
        const last = i === chunks - 1;
        yield makeChunk(ts, {
          wakeWord: last && !!step.wakeWord,
          transcript: last ? step.transcript ?? null : null,
          utteranceEnd: last && !!step.utteranceEnd,
          source: this.micSource,
        });
        ts += CHUNK_MS;
      }
      if (!this._connected) return;
      if (!this._script) {
        // unscripted pacing: yield to the event loop like a live mic would
        await new Promise((r) => setTimeout(r, 0));
      }
    }
  }

  async renderFrame(frame) {
    if (!this._connected) {
      throw new AdapterError(`${this.name}: renderFrame before connect`, 'NOT_CONNECTED', this.name);
    }
    this._validateFrame(frame);
    const caps = await this.capabilities();
    const bytes = typeof TextEncoder !== 'undefined'
      ? new TextEncoder().encode(frame.svg).length
      : unescape(encodeURIComponent(frame.svg)).length;
    if (bytes > caps.maxFrameBytes) {
      throw new AdapterError(
        `${this.name}: frame ${bytes}B exceeds maxFrameBytes ${caps.maxFrameBytes}`,
        'INVALID_FRAME',
        this.name,
      );
    }
    this.lastFrame = frame;
    this.framesRendered += 1;
    // v1.1 seq accounting: monotonic per connection; gaps = dropped frames.
    this.frameStats.received += 1;
    if (Number.isFinite(frame.seq)) {
      if (frame.seq > this._lastSeq + 1) {
        this.frameStats.droppedFrames += frame.seq - this._lastSeq - 1;
      } else if (frame.seq <= this._lastSeq) {
        this.frameStats.duplicates += 1;
      }
      if (frame.seq > this._lastSeq) this._lastSeq = frame.seq;
    }
    return { accepted: true, simulated: true, bytes, seq: frame.seq ?? null };
  }
}

export class BrilliantLabsAdapter extends SimulatedTransportAdapter {
  get name() {
    return 'brilliant-labs';
  }
  /** Full-loop path: custom wake word + on-glasses mic + display. */
  get micSource() {
    return 'on-glasses-mic';
  }
  async capabilities() {
    return {
      display: { width: 640, height: 400, color: true, additive: false, panel: 'OLED (simulated)' },
      mic: { sampleRate: SAMPLE_RATE, channels: 1, source: 'on-glasses-mic' },
      wakeWord: 'custom', // we own "Hey KingCode" KWS on this backend
      // NOTE (spec §1 v1.1): custom wake ships only if it passes the week-4
      // false-accept gate; else v1 falls back to companion-tap.
      inputs: ['voice', 'dpad'],
      maxFrameBytes: 65536,
      recommendedThreshold: 0.75,
      transport: 'simulated-ble',
      simulated: true,
    };
  }
}

export class MetaDisplayAdapter extends SimulatedTransportAdapter {
  get name() {
    return 'meta-display';
  }
  /**
   * DISPLAY-FIRST (spec §1 v1.1): Meta's Ray-Ban Display web-app path exposes
   * no microphone, no getUserMedia, no voice hooks, no third-party assistant
   * integration (verified against Meta's official wearables docs 2026-09-18).
   * captureAudio() therefore yields PHONE-COMPANION-mic chunks relayed via
   * cloud — never on-glasses audio. On-glasses voice needs the native Device
   * Access Toolkit (Swift/Kotlin) — deferred.
   */
  get micSource() {
    return 'companion-mic-relay';
  }
  async capabilities() {
    return {
      display: { width: 600, height: 600, color: true, additive: true, note: 'black = transparent (simulated)' },
      mic: {
        sampleRate: SAMPLE_RATE,
        channels: 1,
        source: 'companion-mic-relay',
        note: 'phone-companion mic relayed via cloud; web path has no on-glasses mic',
      },
      wakeWord: 'routed', // companion-signaled (tap/gesture) via notifyRoutedActivation()
      inputs: ['voice', 'gesture'],
      maxFrameBytes: 131072,
      // Relayed companion audio is noisier than on-glasses mic: recommend a
      // stricter bar. Sequencer uses max(global threshold, this value).
      recommendedThreshold: 0.8,
      transport: 'simulated',
      simulated: true,
    };
  }

  /**
   * Emit the web-app bundle this backend targets: copies the adapter-agnostic
   * src/*.js modules into outDir so the Pages lens simulator runs the SAME
   * code the conformance suite tests. (Node-side helper; the demo build uses it.)
   * @returns {Promise<string[]>} emitted file paths
   */
  static async emitWebBundle(srcDir, outDir) {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    await fs.mkdir(outDir, { recursive: true });
    const entries = await fs.readdir(srcDir);
    const emitted = [];
    for (const e of entries) {
      if (!e.endsWith('.js')) continue;
      await fs.copyFile(path.join(srcDir, e), path.join(outDir, e));
      emitted.push(path.join(outDir, e));
    }
    return emitted;
  }
}

export class AndroidXRAdapter extends HardwareAdapter {
  get name() {
    return 'android-xr';
  }
  /** Capabilities are DECLARED (honest intent); the transport is not built. */
  async capabilities() {
    return {
      display: { width: 640, height: 400, color: true, additive: true, note: 'declared target; unvalidated' },
      mic: { sampleRate: SAMPLE_RATE, channels: 1, source: 'undeclared' },
      wakeWord: 'routed',
      inputs: ['voice', 'gesture'],
      maxFrameBytes: 65536,
      recommendedThreshold: 0.75,
      transport: 'not-implemented',
      simulated: false,
      stub: true,
    };
  }
  async connect() {
    throw new AdapterError(
      'android-xr backend is a declared stub in v1 — no transport implemented',
      'NOT_IMPLEMENTED',
      'android-xr',
    );
  }
  async *captureAudio() {
    throw new AdapterError(
      'android-xr backend is a declared stub in v1 — no mic implemented',
      'NOT_IMPLEMENTED',
      'android-xr',
    );
    yield makeChunk(Date.now());
  }
  async renderFrame() {
    throw new AdapterError(
      'android-xr backend is a declared stub in v1 — no display implemented',
      'NOT_IMPLEMENTED',
      'android-xr',
    );
  }
}

export { makeChunk, CHUNK_MS, SAMPLE_RATE };
