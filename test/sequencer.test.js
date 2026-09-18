/**
 * sequencer.test.js — ActivationSequencer behavior (v1.1):
 *  confident -> executes -> speaking -> idle
 *  low-confidence -> confirming -> yes -> executes
 *  destructive -> ALWAYS confirms (even at high confidence)
 *  effective threshold = max(global, adapter.recommendedThreshold)
 *  confirm timeout -> idle, nothing executed
 *  user "no" -> denied -> idle, nothing executed
 *  routed backend -> notifyRoutedActivation({source, ts}) companion signal
 *  session events use the §2.2 durable schema; confirm/deny are calibration events
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ActivationSequencer } from '../src/sequencer.js';
import { BrilliantLabsAdapter, MetaDisplayAdapter, makeChunk } from '../src/adapters.js';
import { WakeDetector } from '../src/wake.js';
import { STTAdapter } from '../src/stt.js';
import { TTSAdapter } from '../src/tts.js';
import { DecisionAdapter } from '../src/decision.js';
import { AvatarRenderer } from '../src/avatar-renderer.js';
import { SessionStore, ToolRegistry, defaultEyewearTools } from '../src/session.js';

function build(adapter, opts = {}) {
  const store = new SessionStore();
  const seq = new ActivationSequencer({
    hardware: adapter,
    wake: new WakeDetector({ mode: adapter.name === 'meta-display' ? 'routed' : 'custom' }),
    stt: new STTAdapter(),
    decide: new DecisionAdapter(),
    tts: new TTSAdapter(),
    renderer: new AvatarRenderer(),
    tools: defaultEyewearTools(),
    sessionStore: store,
    ...opts,
  });
  return { seq, store };
}

async function collect(seq, opts) {
  const events = [];
  for await (const e of seq.runOnce(opts)) events.push(e);
  return events;
}

const names = (events) => events.map((e) => e.event);

function sessionEvents(store) {
  const ids = store.ids();
  assert.equal(ids.length, 1, 'one session per runOnce');
  return store.get(ids[0]).events;
}

test('confident non-destructive: executes tool, speaks, ends idle', async () => {
  const hw = new BrilliantLabsAdapter();
  await hw.connect();
  hw.setScript([
    { wakeWord: true },
    { transcript: 'what time is it' },
    { utteranceEnd: true },
  ]);
  const { seq, store } = build(hw);
  const events = await collect(seq);

  const ev = names(events);
  assert.ok(ev.includes('wake'), `has wake: ${ev}`);
  assert.ok(ev.includes('transcript'), `has transcript: ${ev}`);
  const dec = events.find((e) => e.event === 'decision');
  assert.equal(dec.detail.action, 'get_time');
  assert.ok(dec.detail.confidence >= 0.75);
  assert.equal(dec.detail.effectiveThreshold, 0.75, 'max(global 0.75, adapter 0.75)');
  assert.ok(!ev.includes('confirm'), `no confirm step: ${ev}`);
  const tool = events.find((e) => e.event === 'tool-result');
  assert.equal(tool.detail.action, 'get_time');
  const speak = events.find((e) => e.event === 'speaking');
  assert.ok(speak.detail.text.includes('time is'), speak.detail.text);
  const tts = events.find((e) => e.event === 'tts');
  assert.ok(tts.detail.chunks >= 1);
  assert.equal(seq.state, 'idle');
  assert.equal(events[events.length - 1].event, 'idle');
  assert.ok(hw.framesRendered >= 4, `frames rendered: ${hw.framesRendered}`);
  // frame seq advanced monotonically across the activation
  assert.ok(hw.lastFrame.seq >= 4, `last frame seq: ${hw.lastFrame.seq}`);

  // §2.2 session log: dotted types, monotonic seq
  const sevents = sessionEvents(store);
  const types = sevents.map((e) => e.type);
  for (const t of ['wake.detected', 'stt.final', 'decision.made', 'tool.executed', 'tts.done', 'state.transition']) {
    assert.ok(types.includes(t), `session has ${t}: ${types}`);
  }
  assert.deepEqual(sevents.map((e) => e.event).length > 0, true);
  assert.deepEqual(
    sevents.map((e) => e.seq),
    sevents.map((_, i) => i + 1),
    'session seq monotonic',
  );
  await hw.disconnect();
});

test('session events carry the §2.2 durable schema', async () => {
  const hw = new BrilliantLabsAdapter();
  await hw.connect();
  hw.setScript([{ wakeWord: true }, { transcript: 'mute' }, { utteranceEnd: true }]);
  const { seq, store } = build(hw);
  await collect(seq);
  const sevents = sessionEvents(store);
  assert.ok(sevents.length >= 5, `several events logged: ${sevents.length}`);
  const sid = store.ids()[0];
  sevents.forEach((e, i) => {
    assert.equal(e.v, 1);
    assert.equal(e.sessionId, sid);
    assert.equal(e.seq, i + 1, 'seq monotonic per session');
    assert.ok(Number.isFinite(e.ts));
    assert.ok(e.type.includes('.'), `dotted type: ${e.type}`);
    assert.ok(typeof e.idempotencyKey === 'string' && e.idempotencyKey.length > 0);
    assert.deepEqual(Object.keys(e).sort(), ['idempotencyKey', 'payload', 'seq', 'sessionId', 'ts', 'type', 'v']);
  });
  await hw.disconnect();
});

test('low-confidence: confirming -> user yes -> executes; confirm+yes are session events', async () => {
  const hw = new BrilliantLabsAdapter();
  await hw.connect();
  // Pads after the wake chunk: the 500ms cadence check fires on chunk 5,
  // so the confirm answer that follows is never swallowed by the wake window.
  const PAD = {};
  hw.setScript([
    { wakeWord: true }, PAD, PAD, PAD, PAD,
    { transcript: 'blorple fnord' },
    { utteranceEnd: true },
    { transcript: 'yes' },
    { utteranceEnd: true },
  ]);
  const { seq, store } = build(hw);
  const events = await collect(seq);
  const ev = names(events);
  assert.ok(ev.includes('confirm'), `has confirm: ${ev}`);
  assert.ok(ev.includes('confirmed'), `has confirmed: ${ev}`);
  const dec = events.find((e) => e.event === 'decision');
  assert.equal(dec.detail.action, 'no_action');
  // confirmed no_action -> honest fallback speech, no tool run
  assert.ok(!events.some((e) => e.event === 'tool-result'), 'no tool ran');
  const speak = events.find((e) => e.event === 'speaking');
  assert.ok(speak.detail.fallback, 'fallback speech');
  assert.equal(seq.state, 'idle');
  const types = sessionEvents(store).map((e) => e.type);
  assert.ok(types.includes('confirm.asked'), 'confirm.asked logged');
  assert.ok(types.includes('confirm.yes'), 'confirm.yes logged (calibration)');
  await hw.disconnect();
});

test('destructive ALWAYS confirms even at high confidence, then executes on yes', async () => {
  const hw = new BrilliantLabsAdapter();
  await hw.connect();
  const PAD = {};
  hw.setScript([
    { wakeWord: true }, PAD, PAD, PAD, PAD,
    { transcript: 'dismiss all notifications' },
    { utteranceEnd: true },
    { transcript: 'yes' },
    { utteranceEnd: true },
  ]);
  const { seq } = build(hw);
  const events = await collect(seq);
  const dec = events.find((e) => e.event === 'decision');
  assert.equal(dec.detail.action, 'dismiss_all');
  assert.equal(dec.detail.destructive, true);
  assert.ok(dec.detail.confidence >= 0.75, 'high confidence yet still confirmed');
  assert.ok(names(events).includes('confirm'), 'confirm step present');
  // v1.1: CONFIRMING renders the FULL action text on the lens
  const confirm = events.find((e) => e.event === 'confirm');
  assert.ok(confirm.detail.prompt.includes('dismiss_all'), `full action text: ${confirm.detail.prompt}`);
  assert.ok(confirm.detail.prompt.includes('cannot be undone'));
  const tool = events.find((e) => e.event === 'tool-result');
  assert.equal(tool.detail.action, 'dismiss_all', 'executed after yes');
  assert.equal(seq.state, 'idle');
  await hw.disconnect();
});

test('adapter recommendedThreshold raises the bar (meta-display 0.8)', async () => {
  const hw = new MetaDisplayAdapter();
  await hw.connect();
  const { seq } = build(hw);
  const collected = collect(seq);
  await new Promise((r) => setTimeout(r, 50));
  // 'what time is it' scores 0.75: passes the 0.75 global floor but NOT the
  // adapter-recommended 0.8 -> must confirm.
  seq.notifyRoutedActivation({ source: 'companion-tap', ts: Date.now(), transcript: 'what time is it' });
  // feed the confirm answer through the companion mic relay
  hw.setScript([{ transcript: 'yes' }, { utteranceEnd: true }]);
  const events = await collected;
  const dec = events.find((e) => e.event === 'decision');
  assert.equal(dec.detail.effectiveThreshold, 0.8, 'max(0.75 global, 0.8 adapter)');
  assert.ok(names(events).includes('confirm'), '0.75 < 0.8 -> confirm step');
  assert.ok(names(events).includes('confirmed'), 'yes confirmed');
  assert.ok(events.some((e) => e.event === 'tool-result' && e.detail.action === 'get_time'), 'executed after confirm');
  assert.equal(seq.state, 'idle');
  await hw.disconnect();
});

test('user says no: denied -> idle, tool never runs, confirm.no logged', async () => {
  const hw = new BrilliantLabsAdapter();
  await hw.connect();
  const PAD = {};
  hw.setScript([
    { wakeWord: true }, PAD, PAD, PAD, PAD,
    { transcript: 'dismiss all' },
    { utteranceEnd: true },
    { transcript: 'no' },
    { utteranceEnd: true },
  ]);
  const { seq, store } = build(hw);
  const events = await collect(seq);
  assert.ok(names(events).includes('denied'), 'denied event yielded');
  assert.ok(!events.some((e) => e.event === 'tool-result'), 'no tool ran');
  assert.equal(seq.state, 'idle');
  const types = sessionEvents(store).map((e) => e.type);
  assert.ok(types.includes('confirm.asked'), 'confirm.asked logged');
  assert.ok(types.includes('confirm.no'), 'confirm.no logged (calibration)');
  await hw.disconnect();
});

test('confirm timeout: hung mic -> timeout -> idle, nothing executed', async () => {
  class HangingMic extends BrilliantLabsAdapter {
    async *captureAudio() {
      if (!this.connected) throw new Error('not connected');
      // 5 chunks -> the 500ms cadence check fires and finds the wake word
      yield makeChunk(Date.now(), { wakeWord: true });
      yield makeChunk(Date.now() + 100, {});
      yield makeChunk(Date.now() + 200, {});
      yield makeChunk(Date.now() + 300, {});
      yield makeChunk(Date.now() + 400, {});
      yield makeChunk(Date.now() + 500, { transcript: 'blorple fnord', utteranceEnd: true });
      await new Promise(() => {}); // hang: confirm listen pends, timeout must win
    }
  }
  const hw = new HangingMic();
  await hw.connect();
  const { seq } = build(hw, { confirmTimeoutMs: 60 });
  const events = await collect(seq);
  const ct = events.find((e) => e.event === 'confirm-timeout');
  assert.ok(ct, 'confirm-timeout yielded');
  assert.equal(ct.detail.answer, 'timeout');
  assert.ok(!events.some((e) => e.event === 'tool-result'), 'no tool ran');
  assert.equal(seq.state, 'idle');
  await hw.disconnect();
});

test('routed backend: companion-tap signal drives the cycle', async () => {
  const hw = new MetaDisplayAdapter();
  await hw.connect();
  const { seq, store } = build(hw);
  const collected = collect(seq);
  await new Promise((r) => setTimeout(r, 50));
  seq.notifyRoutedActivation({ source: 'companion-tap', ts: Date.now(), transcript: 'set timer 30 seconds' });
  const events = await collected;
  const ev = names(events);
  assert.ok(ev.includes('routed-activation'), `has routed-activation: ${ev}`);
  const ra = events.find((e) => e.event === 'routed-activation');
  assert.equal(ra.detail.signal.source, 'companion-tap');
  const dec = events.find((e) => e.event === 'decision');
  assert.equal(dec.detail.action, 'set_timer');
  assert.equal(dec.detail.params.seconds, 30);
  // companion-relayed audio is tagged at the source
  const tool = events.find((e) => e.event === 'tool-result');
  assert.equal(tool.detail.action, 'set_timer');
  const speak = events.find((e) => e.event === 'speaking');
  assert.ok(speak.detail.text.includes('30'), speak.detail.text);
  assert.equal(seq.state, 'idle');
  const types = sessionEvents(store).map((e) => e.type);
  assert.ok(types.includes('activation.routed'), 'activation.routed logged');
  await hw.disconnect();
});

test('notifyRoutedActivation rejects unknown sources', () => {
  const hw = new MetaDisplayAdapter();
  const { seq } = build(hw);
  assert.throws(
    () => seq.notifyRoutedActivation({ source: 'host-assistant', ts: Date.now() }),
    /source must be one of/,
  );
});

test('abort signal stops the run', async () => {
  const hw = new BrilliantLabsAdapter();
  await hw.connect();
  hw.setScript([{ ms: 200 }]); // silence, no wake word
  const { seq } = build(hw);
  const ctl = new AbortController();
  setTimeout(() => ctl.abort(), 80);
  const events = [];
  for await (const e of seq.run({ maxActivations: 5, signal: ctl.signal })) events.push(e);
  assert.ok(events.length >= 1);
  await hw.disconnect();
});

test('error in tool -> error event -> idle (never stuck)', async () => {
  const hw = new BrilliantLabsAdapter();
  await hw.connect();
  hw.setScript([
    { wakeWord: true },
    { transcript: 'what time is it' },
    { utteranceEnd: true },
  ]);
  const tools = new ToolRegistry();
  tools.register({ name: 'get_time', destructive: false, run: async () => { throw new Error('tool boom'); } });
  const seq = new ActivationSequencer({
    hardware: hw,
    wake: new WakeDetector({ mode: 'custom' }),
    stt: new STTAdapter(),
    decide: new DecisionAdapter(),
    tts: new TTSAdapter(),
    renderer: new AvatarRenderer(),
    tools,
  });
  const events = await collect(seq);
  assert.ok(names(events).includes('error'), 'error event yielded');
  assert.equal(seq.state, 'idle');
  await hw.disconnect();
});
