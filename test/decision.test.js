/**
 * decision.test.js — DecisionAdapter: vocabulary mapping, confidence math,
 * destructive flags, and the exact cwi-voice-command decision shape.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DecisionAdapter } from '../src/decision.js';

const SHAPE_KEYS = ['action', 'target', 'value', 'params', 'confidence', 'destructive', 'source_text', 'layer'];

function checkShape(d) {
  assert.deepEqual(new Set(Object.keys(d)), new Set(SHAPE_KEYS), `decision shape keys: ${Object.keys(d)}`);
  assert.ok(d.confidence >= 0.05 && d.confidence <= 0.99, `confidence in [0.05,0.99], got ${d.confidence}`);
  assert.equal(d.layer, 'local-classifier-v1');
}

test('decision shape mirrors cwi-voice-command exactly (+params)', async () => {
  const d = new DecisionAdapter();
  for (const text of ['what time is it', 'take note x', 'set timer 5 minutes', 'mute', 'unmute', 'dismiss all', 'go idle', 'blorple']) {
    checkShape(await d.decide(text, { sessionId: 's1', priorTurns: [], routedActivation: false }));
  }
});

test('get_time: "what time is it" is confident and non-destructive', async () => {
  const d = await new DecisionAdapter().decide('what time is it');
  assert.equal(d.action, 'get_time');
  assert.equal(d.destructive, false);
  assert.equal(d.source_text, 'what time is it');
  assert.ok(d.confidence >= 0.75, `confident, got ${d.confidence}`);
});

test('take_note: captures free-text note with high confidence', async () => {
  const d = await new DecisionAdapter().decide('take note buy milk tomorrow');
  assert.equal(d.action, 'take_note');
  assert.equal(d.params.note, 'buy milk tomorrow');
  assert.ok(d.confidence >= 0.9, `got ${d.confidence}`);
});

test('set_timer: parses digits+unit to seconds', async () => {
  const d = await new DecisionAdapter().decide('set a timer for 5 minutes');
  assert.equal(d.action, 'set_timer');
  assert.equal(d.params.seconds, 300);
  assert.equal(d.value, 300);
  assert.ok(d.confidence >= 0.9, `got ${d.confidence}`);
  const s = await new DecisionAdapter().decide('set timer 30 seconds');
  assert.equal(s.params.seconds, 30);
});

test('mute/unmute distinct; unmute not swallowed by mute', async () => {
  const da = new DecisionAdapter();
  assert.equal((await da.decide('mute')).action, 'mute');
  assert.equal((await da.decide('unmute')).action, 'unmute');
});

test('dismiss_all is destructive and confident', async () => {
  const d = await new DecisionAdapter().decide('dismiss all notifications');
  assert.equal(d.action, 'dismiss_all');
  assert.equal(d.destructive, true);
  assert.ok(d.confidence >= 0.75, `got ${d.confidence}`);
});

test('go_idle maps', async () => {
  const d = await new DecisionAdapter().decide('go idle');
  assert.equal(d.action, 'go_idle');
  assert.equal(d.destructive, false);
});

test('low-confidence input: unknown words drag confidence down', async () => {
  const d = await new DecisionAdapter().decide('set timer for five minutes please');
  assert.equal(d.action, 'no_action'); // 'five' is not in the v1 grammar
  assert.ok(d.confidence < 0.6, `got ${d.confidence}`);
});

test('gibberish -> no_action with floor confidence', async () => {
  const d = await new DecisionAdapter().decide('blorple fnord quux');
  assert.equal(d.action, 'no_action');
  assert.equal(d.confidence, 0.05);
  assert.equal(d.destructive, false);
});

test('empty input -> no_action', async () => {
  const d = await new DecisionAdapter().decide('');
  assert.equal(d.action, 'no_action');
});

test('deterministic: same input -> same decision', async () => {
  const da = new DecisionAdapter();
  const a = await da.decide('Take Note: call mom at 5!');
  const b = await da.decide('Take Note: call mom at 5!');
  assert.deepEqual(a, b);
});

test('normalization: case and punctuation do not matter', async () => {
  const da = new DecisionAdapter();
  assert.equal((await da.decide('WHAT TIME IS IT?')).action, 'get_time');
  assert.equal((await da.decide("what's the time")).action, 'get_time');
});

test('vocabulary() lists actions with destructive flags', () => {
  const v = new DecisionAdapter().vocabulary();
  const byName = Object.fromEntries(v.map((x) => [x.action, x.destructive]));
  assert.equal(byName.dismiss_all, true);
  assert.equal(byName.get_time, false);
  assert.equal(byName.take_note, false);
  assert.ok(v.length >= 7);
});
