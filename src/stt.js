/**
 * stt.js — STTAdapter per spec/INTERFACES.md §3.
 *
 * v1 paths:
 *  1. Deterministic text-injection (tests + simulator): the simulated
 *     transport tags chunks with `sim.transcript`; transcribe() returns it
 *     as a final transcript. `new STTAdapter({injectedText})` is a second
 *     injection seam for unit tests.
 *  2. Web Speech API (browser demo): the browser maps
 *     SpeechRecognition results onto chunks via `STTAdapter.webSpeechChunk()`
 *     so the SAME transcribe() path runs. `fromWebSpeech()` documents the
 *     browser-only wiring; it throws BROWSER_ONLY under Node.
 */
import { AdapterError } from './errors.js';

export class STTAdapter {
  constructor({ injectedText = null } = {}) {
    this.injectedText = injectedText;
  }

  /**
   * @param {Array} chunks AudioChunk[]
   * @returns {Promise<{text:string, confidence:number, isFinal:boolean}>}
   */
  async transcribe(chunks) {
    const list = Array.isArray(chunks) ? chunks : [chunks];
    const tagged = list.find((c) => c && c.sim && typeof c.sim.transcript === 'string');
    const text = (tagged ? tagged.sim.transcript : this.injectedText) ?? '';
    const trimmed = String(text).trim();
    return {
      text: trimmed,
      confidence: trimmed ? 0.95 : 0.0,
      isFinal: true,
      source: tagged ? 'simulated-injection' : this.injectedText != null ? 'injected' : 'none',
    };
  }

  /** Browser helper: wrap a Web Speech API final result as a chunk tag. */
  static webSpeechChunk(transcript) {
    return { sim: { transcript: String(transcript), utteranceEnd: true } };
  }

  /** Documents the browser-only Web Speech wiring; throws under Node. */
  static fromWebSpeech() {
    const SR = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
    if (!SR) {
      throw new AdapterError(
        'STTAdapter.fromWebSpeech: Web Speech API unavailable (browser-only path)',
        'BROWSER_ONLY',
        'stt',
      );
    }
    return new SR();
  }
}
