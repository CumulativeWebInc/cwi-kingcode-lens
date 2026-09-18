/**
 * tts.js — TTSAdapter per spec/INTERFACES.md §3.
 *
 * v1: deterministic PCM16 synthesis. Each word becomes a short shaped sine
 * burst (pitch derived from the word's characters — stable, not "vibes");
 * word gaps are silence. Same text -> byte-identical chunks, always.
 * 16kHz mono PCM16, 100ms chunks, matching AudioChunk.
 *
 * REAL_TTS_SWAP: to plug a real $0 TTS (e.g. local Piper), replace
 * `_renderUtterance()` internals only — keep `speak()`'s chunking contract
 * (AudioChunk[], 16kHz PCM16) so the sequencer and tests are untouched.
 */
import { CHUNK_MS, SAMPLE_RATE } from './adapters.js';

const CHUNK_SAMPLES = Math.floor((SAMPLE_RATE * CHUNK_MS) / 1000);

function wordFreq(word) {
  let h = 0;
  for (const ch of word) h = (h * 31 + ch.codePointAt(0)) % 997;
  return 170 + (h % 90); // 170..259 Hz — deterministic per word
}

export class TTSAdapter {
  constructor({ sampleRate = SAMPLE_RATE, chunkMs = CHUNK_MS } = {}) {
    this.sampleRate = sampleRate;
    this.chunkMs = chunkMs;
    this.chunkSamples = Math.floor((sampleRate * chunkMs) / 1000);
  }

  /**
   * @param {string} text
   * @returns {Promise<Array>} AudioChunk[] (16kHz PCM16)
   */
  async speak(text) {
    const pcm = this._renderUtterance(String(text));
    const chunks = [];
    const n = this.chunkSamples;
    let ts = Date.now();
    for (let i = 0; i < pcm.length; i += n) {
      const slice = pcm.slice(i, i + n);
      const full = new Int16Array(n);
      full.set(slice);
      chunks.push({ pcm: full, sampleRate: this.sampleRate, channels: 1, ts });
      ts += this.chunkMs;
    }
    return chunks;
  }

  /**
   * REAL_TTS_SWAP point — replace this method's internals with a real
   * synthesizer. Contract: return Int16Array of mono PCM16 @ this.sampleRate.
   */
  _renderUtterance(text) {
    const words = text.split(/\s+/).filter(Boolean);
    const sr = this.sampleRate;
    const out = [];
    const burstSec = 0.22;
    const gapSec = 0.06;
    for (const w of words) {
      const freq = wordFreq(w);
      const burstN = Math.floor(sr * burstSec);
      for (let i = 0; i < burstN; i++) {
        const t = i / sr;
        const env = Math.sin((Math.PI * i) / burstN); // raised-cosine-ish envelope
        const s = Math.sin(2 * Math.PI * freq * t) * env;
        out.push(Math.max(-32768, Math.min(32767, Math.round(s * 12000))));
      }
      const gapN = Math.floor(sr * gapSec);
      for (let i = 0; i < gapN; i++) out.push(0);
    }
    if (out.length === 0) {
      // Empty text -> one silent chunk so callers always get >= 1 chunk.
      for (let i = 0; i < this.chunkSamples; i++) out.push(0);
    }
    return Int16Array.from(out);
  }
}
