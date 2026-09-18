/**
 * conformance.test.js — The SAME suite runs against every backend:
 * BrilliantLabsAdapter, MetaDisplayAdapter, and the AndroidXR stub.
 * The stub asserts its DECLARED not-implemented behavior (connect,
 * captureAudio, renderFrame throw AdapterError/NOT_IMPLEMENTED) while
 * capabilities() still answers honestly.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BrilliantLabsAdapter,
  MetaDisplayAdapter,
  AndroidXRAdapter,
} from '../src/adapters.js';
import { AvatarRenderer } from '../src/avatar-renderer.js';
import { AdapterError } from '../src/errors.js';

const renderer = new AvatarRenderer();

async function runConformance(t, makeAdapter, expect) {
  const adapter = makeAdapter();
  await t.test(`${adapter.name || 'adapter'}: capabilities() shape`, async () => {
    const caps = await adapter.capabilities();
    assert.ok(caps.display, 'display missing');
    assert.ok(Number.isFinite(caps.display.width) && caps.display.width > 0, 'display.width');
    assert.ok(Number.isFinite(caps.display.height) && caps.display.height > 0, 'display.height');
    assert.equal(typeof caps.display.color, 'boolean');
    assert.equal(typeof caps.display.additive, 'boolean');
    assert.ok(caps.mic && caps.mic.sampleRate === 16000 && caps.mic.channels === 1, 'mic 16kHz mono');
    assert.ok(['custom', 'routed'].includes(caps.wakeWord), 'wakeWord custom|routed');
    assert.ok(Array.isArray(caps.inputs) && caps.inputs.includes('voice'), 'inputs includes voice');
    assert.ok(Number.isFinite(caps.maxFrameBytes) && caps.maxFrameBytes > 0, 'maxFrameBytes');
    assert.ok(
      Number.isFinite(caps.recommendedThreshold) && caps.recommendedThreshold > 0 && caps.recommendedThreshold <= 1,
      'recommendedThreshold in (0,1]',
    );
    assert.ok(typeof caps.mic.source === 'string' && caps.mic.source.length > 0, 'mic.source labeled');
  });

  await t.test(`${expect.label}: connect/disconnect lifecycle`, async () => {
    const a = makeAdapter();
    if (expect.connectThrows) {
      await assert.rejects(() => a.connect(), (e) => {
        assert.ok(e instanceof AdapterError);
        assert.equal(e.code, 'NOT_IMPLEMENTED');
        return true;
      });
      await a.disconnect(); // must not throw even for stubs
    } else {
      const res = await a.connect();
      assert.ok(res.ok, 'connect ok');
      await a.disconnect();
    }
  });

  await t.test(`${expect.label}: captureAudio yields AudioChunks`, async () => {
    const a = makeAdapter();
    if (expect.connectThrows) {
      await assert.rejects(async () => {
        for await (const _ of a.captureAudio()) { /* noop */ }
      }, (e) => e instanceof AdapterError && e.code === 'NOT_IMPLEMENTED');
      return;
    }
    await a.connect();
    a.setScript ? a.setScript([{ ms: 100 }, { ms: 100, utteranceEnd: true }]) : null;
    let n = 0;
    for await (const chunk of a.captureAudio()) {
      assert.ok(chunk.pcm instanceof Int16Array, 'pcm Int16Array');
      assert.equal(chunk.sampleRate, 16000);
      assert.equal(chunk.channels, 1);
      assert.ok(Number.isFinite(chunk.ts));
      n += 1;
      if (n > 10) break;
    }
    assert.ok(n >= 1, 'yielded at least one chunk');
    await a.disconnect();
  });

  await t.test(`${expect.label}: renderFrame accepts a valid frame under budget`, async () => {
    const a = makeAdapter();
    const frame = renderer.render('speaking', 'hello');
    const bytes = renderer.frameBytes(frame);
    const caps = await a.capabilities();
    assert.ok(bytes < caps.maxFrameBytes, `frame ${bytes}B under ${caps.maxFrameBytes}B`);
    if (expect.connectThrows) {
      await assert.rejects(() => a.renderFrame(frame), (e) => {
        assert.ok(e instanceof AdapterError);
        assert.equal(e.code, 'NOT_IMPLEMENTED');
        return true;
      });
      return;
    }
    await a.connect();
    const res = await a.renderFrame(frame);
    assert.ok(res.accepted, 'frame accepted');
    await a.disconnect();
  });

  await t.test(`${expect.label}: renderFrame rejects before connect`, async () => {
    const a = makeAdapter();
    if (expect.connectThrows) return; // stub always throws NOT_IMPLEMENTED; covered above
    const frame = renderer.render('idle');
    await assert.rejects(() => a.renderFrame(frame), (e) => e.code === 'NOT_CONNECTED');
  });

  await t.test(`${expect.label}: all avatar states fit maxFrameBytes`, async () => {
    const a = makeAdapter();
    const caps = await a.capabilities();
    for (const s of renderer.states()) {
      const bytes = renderer.frameBytes(renderer.render(s, 'budget check caption'));
      assert.ok(bytes < caps.maxFrameBytes, `${s}: ${bytes}B < ${caps.maxFrameBytes}B`);
    }
  });

  await t.test(`${expect.label}: frame.seq is monotonic per connection; gaps counted`, async () => {
    const a = makeAdapter();
    if (expect.connectThrows) return; // stub has no frame accounting
    await a.connect();
    const r = new AvatarRenderer();
    const f1 = r.render('idle');
    const f2 = r.render('listening');
    assert.ok(Number.isInteger(f1.seq) && Number.isInteger(f2.seq), 'seq present');
    assert.ok(f2.seq > f1.seq, `seq monotonic: ${f1.seq} -> ${f2.seq}`);
    await a.renderFrame(f1);
    await a.renderFrame(f2);
    assert.equal(a.frameStats.received, 2);
    assert.equal(a.frameStats.droppedFrames, 0);
    // simulate a BLE drop: seq 3 never arrives, seq 4 does
    r.render('thinking'); // seq 3 — lost on the simulated link
    const f4 = r.render('speaking'); // seq 4
    await a.renderFrame(f4);
    assert.equal(a.frameStats.droppedFrames, 1, `one gap counted: ${JSON.stringify(a.frameStats)}`);
    // seq restarts per connection
    await a.disconnect();
    await a.connect();
    assert.equal(a.frameStats.received, 0);
    assert.equal(a.frameStats.droppedFrames, 0);
    await a.disconnect();
  });

  await t.test(`${expect.label}: mic source is honestly labeled`, async () => {
    const a = makeAdapter();
    const caps = await a.capabilities();
    if (a.name === 'meta-display') {
      assert.equal(caps.mic.source, 'companion-mic-relay', 'meta-display: companion relay, never on-glasses mic');
    }
    if (a.name === 'brilliant-labs') {
      assert.equal(caps.mic.source, 'on-glasses-mic');
    }
  });
}

test('backend conformance — BrilliantLabs (simulated)', async (t) => {
  await runConformance(t, () => new BrilliantLabsAdapter(), { label: 'brilliant-labs', connectThrows: false });
});

test('backend conformance — MetaDisplay (simulated)', async (t) => {
  await runConformance(t, () => new MetaDisplayAdapter(), { label: 'meta-display', connectThrows: false });
});

test('backend conformance — AndroidXR (declared stub)', async (t) => {
  await runConformance(t, () => new AndroidXRAdapter(), { label: 'android-xr', connectThrows: true });
});

test('backend identities', () => {
  assert.equal(new BrilliantLabsAdapter().name, 'brilliant-labs');
  assert.equal(new MetaDisplayAdapter().name, 'meta-display');
  assert.equal(new AndroidXRAdapter().name, 'android-xr');
});

test('brilliant-labs wakeWord=custom, meta-display wakeWord=routed', async () => {
  assert.equal((await new BrilliantLabsAdapter().capabilities()).wakeWord, 'custom');
  assert.equal((await new MetaDisplayAdapter().capabilities()).wakeWord, 'routed');
  assert.equal((await new AndroidXRAdapter().capabilities()).wakeWord, 'routed');
});

test('simulated backends label themselves simulated', async () => {
  assert.equal((await new BrilliantLabsAdapter().capabilities()).simulated, true);
  assert.equal((await new MetaDisplayAdapter().capabilities()).simulated, true);
  assert.equal((await new AndroidXRAdapter().capabilities()).stub, true);
});
