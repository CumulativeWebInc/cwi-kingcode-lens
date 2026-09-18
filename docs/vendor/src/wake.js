/**
 * wake.js — WakeDetector per spec/INTERFACES.md §3 (v1.1).
 *
 * mode 'custom': keyword-spotting SIMULATION for "Hey KingCode".
 *   STREAMING CONTRACT (v1.1): detect() is called on a rolling window — every
 *   500ms the caller passes the last 1500ms of chunks. The detector retains
 *   no more than 3s of audio and RESETS its window after a detection.
 *   PRODUCTION SEAM: swap detect() internals for a real KWS model
 *   (e.g. openWakeWord, $0, on-device); the {detected, confidence} contract
 *   and confidence semantics do not change.
 *
 * mode 'routed': documented no-op — always {detected:false, confidence:0}.
 * Activation is companion-signaled; the sequencer exposes
 * notifyRoutedActivation() instead.
 */
export const WAKE_CADENCE_MS = 500; // caller rhythm
export const WAKE_WINDOW_MS = 1500; // window passed per call
export const WAKE_RETENTION_MS = 3000; // detector keeps at most this much
const CHUNK_MS = 100; // matches adapters.js CHUNK_MS
const MAX_RETAINED_CHUNKS = Math.floor(WAKE_RETENTION_MS / CHUNK_MS); // 30

export class WakeDetector {
  /**
   * @param {{mode:'custom'|'routed', keyword?:string}} opts
   */
  constructor({ mode, keyword = 'Hey KingCode' } = {}) {
    if (!['custom', 'routed'].includes(mode)) {
      throw new Error(`WakeDetector: mode must be 'custom'|'routed', got ${String(mode)}`);
    }
    this.mode = mode;
    this.keyword = keyword;
    this._buffer = []; // retained audio window (custom mode), oldest-first
  }

  /** Buffered audio retained right now (ms) — observability for the contract. */
  get bufferedMs() {
    return this._buffer.length * CHUNK_MS;
  }

  /** Clear the retained window (also happens automatically after detection). */
  reset() {
    this._buffer = [];
  }

  /**
   * @param {Array} chunks AudioChunk[] — the rolling 1500ms window per contract
   * @returns {Promise<{detected:boolean, confidence:number}>}
   */
  async detect(chunks) {
    if (this.mode === 'routed') {
      return { detected: false, confidence: 0, mode: 'routed', note: 'routed-noop' };
    }
    const list = Array.isArray(chunks) ? chunks : [chunks];
    // Retain the incoming window; enforce the 3s retention cap.
    this._buffer.push(...list);
    if (this._buffer.length > MAX_RETAINED_CHUNKS) {
      this._buffer.splice(0, this._buffer.length - MAX_RETAINED_CHUNKS);
    }
    const hit = this._buffer.some((c) => c && c.sim && c.sim.wakeWord === true);
    if (hit) {
      this.reset(); // contract: reset the window after a detection
      return {
        detected: true,
        confidence: 0.92,
        mode: 'custom',
        keyword: this.keyword,
        simulated: true,
        reset: true,
      };
    }
    // Deterministic low non-detection confidence (simulation: no real KWS).
    const n = this._buffer.length;
    const jitter = ((n * 2654435761) % 1000) / 1000; // deterministic, 0..1
    return {
      detected: false,
      confidence: 0.02 + jitter * 0.04,
      mode: 'custom',
      keyword: this.keyword,
      simulated: true,
      bufferedMs: this.bufferedMs,
    };
  }
}
