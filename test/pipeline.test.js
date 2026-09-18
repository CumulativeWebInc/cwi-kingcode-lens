/**
 * pipeline.test.js — WakeDetector, STTAdapter, TTSAdapter, AvatarRenderer.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WakeDetector } from '../src/wake.js';
import { STTAdapter } from '../src/stt.js';
import { TTSAdapter } from '../src/tts.js';
import { AvatarRenderer } from '../src/avatar-renderer.js';
import { AvatarState } from '../src/states.js';
import { makeChunk } from '../src/adapters.js';

test('wake custom: detects injected wake word with confidence', async () => {
  const w = new WakeDetector({ mode: 'custom' });
  const chunks = [makeChunk(1), makeChunk(2, { wakeWord: true })];
  const r = await w.detect(chunks);
  assert.equal(r.detected, true);
  assert.ok(r.confidence > 0 && r.confidence <= 1);
  assert.equal(r.keyword, 'Hey KingCode');
});

test('wake custom: no marker -> not detected, low confidence', async () => {
  const w = new WakeDetector({ mode: 'custom' });
  const r = await w.detect([makeChunk(1), makeChunk(2)]);
  assert.equal(r.detected, false);
  assert.ok(r.confidence < 0.1, `low confidence, got ${r.confidence}`);
  // deterministic: fresh detectors, same input -> same confidence
  const w2 = new WakeDetector({ mode: 'custom' });
  const r2 = await w2.detect([makeChunk(1), makeChunk(2)]);
  assert.equal(r.confidence, r2.confidence);
});

test('wake streaming contract: cadence/window/retention constants', async () => {
  const { WAKE_CADENCE_MS, WAKE_WINDOW_MS, WAKE_RETENTION_MS } = await import('../src/wake.js');
  assert.equal(WAKE_CADENCE_MS, 500);
  assert.equal(WAKE_WINDOW_MS, 1500);
  assert.equal(WAKE_RETENTION_MS, 3000);
});

test('wake custom: retains at most 3s of audio', async () => {
  const w = new WakeDetector({ mode: 'custom' });
  const chunks = Array.from({ length: 40 }, (_, i) => makeChunk(i)); // 4s of audio
  const r = await w.detect(chunks);
  assert.equal(r.detected, false);
  assert.ok(w.bufferedMs <= 3000, `retention cap: ${w.bufferedMs}ms`);
  assert.equal(w.bufferedMs, 3000);
});

test('wake custom: window resets after a detection', async () => {
  const w = new WakeDetector({ mode: 'custom' });
  await w.detect([makeChunk(1), makeChunk(2)]);
  assert.ok(w.bufferedMs > 0);
  const r = await w.detect([makeChunk(3, { wakeWord: true })]);
  assert.equal(r.detected, true);
  assert.equal(r.reset, true);
  assert.equal(w.bufferedMs, 0, 'window cleared after detection');
  // detector works again after reset
  const r2 = await w.detect([makeChunk(4)]);
  assert.equal(r2.detected, false);
});

test('wake routed: always no-op', async () => {
  const w = new WakeDetector({ mode: 'routed' });
  const r = await w.detect([makeChunk(1, { wakeWord: true })]);
  assert.deepEqual({ detected: r.detected, confidence: r.confidence }, { detected: false, confidence: 0 });
});

test('wake: bad mode throws', () => {
  assert.throws(() => new WakeDetector({ mode: 'bogus' }), /mode must be/);
});

test('stt: injected transcript wins; isFinal true', async () => {
  const s = new STTAdapter();
  const t = await s.transcribe([makeChunk(1), makeChunk(2, { transcript: 'what time is it', utteranceEnd: true })]);
  assert.equal(t.text, 'what time is it');
  assert.equal(t.isFinal, true);
  assert.ok(t.confidence > 0);
});

test('stt: constructor injection + empty transcript', async () => {
  const s = new STTAdapter({ injectedText: 'take note hello' });
  const t = await s.transcribe([makeChunk(1)]);
  assert.equal(t.text, 'take note hello');
  const empty = await new STTAdapter().transcribe([makeChunk(1)]);
  assert.equal(empty.text, '');
  assert.equal(empty.confidence, 0);
  assert.equal(empty.isFinal, true);
});

test('stt.fromWebSpeech throws BROWSER_ONLY under Node', () => {
  assert.throws(() => STTAdapter.fromWebSpeech(), (e) => e.code === 'BROWSER_ONLY');
});

test('tts: deterministic PCM16 16kHz chunks', async () => {
  const t = new TTSAdapter();
  const a = await t.speak('hello world');
  const b = await t.speak('hello world');
  assert.ok(a.length >= 1);
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i++) {
    assert.deepEqual([...a[i].pcm], [...b[i].pcm], `chunk ${i} identical`);
    assert.ok(a[i].pcm instanceof Int16Array);
    assert.equal(a[i].sampleRate, 16000);
    assert.equal(a[i].channels, 1);
  }
  const c = await t.speak('different words here');
  assert.notDeepEqual([...a[0].pcm], [...c[0].pcm], 'different text -> different audio');
});

test('tts: empty text still yields one silent chunk', async () => {
  const t = new TTSAdapter();
  const a = await t.speak('');
  assert.equal(a.length, 1);
  assert.ok([...a[0].pcm].every((v) => v === 0));
});

test('renderer: all states render dark self-contained SVG under budget', () => {
  const r = new AvatarRenderer();
  assert.deepEqual(new Set(r.states()), new Set(Object.values(AvatarState)));
  for (const s of r.states()) {
    const f = r.render(s, 'caption');
    assert.equal(f.state, s);
    assert.ok(f.svg.includes('#000'), `${s}: dark background`);
    assert.ok(f.svg.startsWith('<svg'), `${s}: self-contained svg`);
    assert.ok(!/<image|href\s*=\s*["']https?:/.test(f.svg), `${s}: no external refs`);
    assert.equal(f.text, 'caption');
    assert.ok(Number.isFinite(f.ts));
    const bytes = r.frameBytes(f);
    assert.ok(bytes < 65536, `${s}: ${bytes}B under smallest backend budget`);
    assert.ok(bytes > 200, `${s}: non-trivial frame`);
  }
});

test('renderer: unknown state throws', () => {
  assert.throws(() => new AvatarRenderer().render('flying'), /unknown state/);
});

test('renderer: caption is HTML-escaped', () => {
  const f = new AvatarRenderer().render('idle', '<script>alert(1)</script>');
  assert.ok(!f.svg.includes('<script>alert'), 'caption escaped');
});

test('renderer: frame.seq is monotonic per renderer instance', () => {
  const r = new AvatarRenderer();
  const a = r.render('idle');
  const b = r.render('listening');
  const c = r.render('thinking');
  assert.ok(Number.isInteger(a.seq) && a.seq >= 1);
  assert.ok(b.seq === a.seq + 1 && c.seq === b.seq + 1, `seq 1,2,3: ${a.seq},${b.seq},${c.seq}`);
  const r2 = new AvatarRenderer();
  assert.equal(r2.render('idle').seq, 1, 'new renderer restarts seq');
});
