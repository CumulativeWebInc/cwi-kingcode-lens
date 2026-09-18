/**
 * session.test.js — SessionStore (§2.2 durable schema + idempotency) + ToolRegistry.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SessionStore, ToolRegistry, defaultEyewearTools } from '../src/session.js';

function checkEventShape(e, sessionId) {
  assert.deepEqual(
    new Set(Object.keys(e)),
    new Set(['v', 'sessionId', 'seq', 'ts', 'type', 'payload', 'idempotencyKey']),
    `event keys: ${Object.keys(e)}`,
  );
  assert.equal(e.v, 1);
  assert.equal(e.sessionId, sessionId);
  assert.ok(Number.isInteger(e.seq) && e.seq >= 1);
  assert.ok(Number.isFinite(e.ts));
  assert.ok(typeof e.type === 'string' && e.type.includes('.'), `dotted type: ${e.type}`);
  assert.ok(typeof e.idempotencyKey === 'string' && e.idempotencyKey.length > 0);
}

test('SessionStore: create/append/get/close with §2.2 schema', () => {
  const s = new SessionStore();
  assert.equal(s.mode, 'single-process');
  assert.equal(s.schemaVersion, 1);
  const id = s.create({ backend: 'brilliant-labs' });
  assert.ok(/^[0-9a-f-]{36}$/.test(id), `uuid v4 id: ${id}`);
  const seq1 = s.append(id, { type: 'wake.detected', payload: { keyword: 'Hey KingCode' } });
  const seq2 = s.append(id, { type: 'decision.made', payload: { action: 'get_time' } });
  assert.equal(seq1, 1);
  assert.equal(seq2, 2);
  const got = s.get(id);
  assert.equal(got.events.length, 2);
  assert.deepEqual(got.events.map((e) => e.seq), [1, 2], 'replay order = seq order');
  for (const e of got.events) checkEventShape(e, id);
  assert.equal(s.close(id), true);
  assert.equal(s.get(id).closed, true);
  assert.throws(() => s.append(id, { type: 'x' }), /closed/);
  assert.equal(s.get('nope'), null);
});

test('SessionStore: append is idempotent on idempotencyKey', () => {
  const s = new SessionStore();
  const id = s.create();
  const key = 'test-key-123';
  const a = s.append(id, { type: 'confirm.asked', payload: {}, idempotencyKey: key });
  const b = s.append(id, { type: 'confirm.asked', payload: { different: true }, idempotencyKey: key });
  assert.equal(a, b, 'duplicate key returns the original seq');
  assert.equal(s.get(id).events.length, 1, 'no duplicate write');
  assert.deepEqual(s.get(id).events[0].payload, {}, 'original payload kept');
});

test('SessionStore: auto-generates idempotency keys; ids unique', () => {
  const s = new SessionStore();
  const id = s.create();
  s.append(id, { type: 'a.b' });
  s.append(id, { type: 'a.c' });
  const keys = s.get(id).events.map((e) => e.idempotencyKey);
  assert.equal(new Set(keys).size, 2, 'distinct keys generated');
  const before = s.ids().length; // 1 session so far
  s.create(); s.create(); s.create();
  assert.equal(new Set(s.ids()).size, before + 3);
});

test('SessionStore: append requires a dotted string type', () => {
  const s = new SessionStore();
  const id = s.create();
  assert.throws(() => s.append(id, { payload: {} }), /string `type`/);
  assert.throws(() => s.append('missing', { type: 'a.b' }), /unknown session/);
});

test('ToolRegistry: register/list/execute', async () => {
  const r = new ToolRegistry();
  assert.equal(r.mode, 'single-process');
  r.register({ name: 'echo', destructive: false, run: async (a) => ({ got: a }), respond: (res) => `echo ${res.got.x}` });
  assert.deepEqual(r.list().map((t) => t.name), ['echo']);
  const out = await r.execute('echo', { x: 1 });
  assert.deepEqual(out.result, { got: { x: 1 } });
  assert.equal(out.say, 'echo 1');
  assert.equal(out.destructive, false);
  await assert.rejects(() => r.execute('missing'), /unknown tool/);
  assert.throws(() => r.register({ name: 'bad' }), /needs \{name, run\}/);
});

test('defaultEyewearTools: all 7 tools run, destructive flagged once', async () => {
  const tools = defaultEyewearTools();
  const names = tools.list().map((t) => t.name);
  assert.deepEqual(new Set(names), new Set(['get_time', 'take_note', 'set_timer', 'mute', 'unmute', 'dismiss_all', 'go_idle']));
  const destructive = tools.list().filter((t) => t.destructive).map((t) => t.name);
  assert.deepEqual(destructive, ['dismiss_all']);

  const t1 = await tools.execute('get_time', {});
  assert.ok(t1.say.includes('time is'), t1.say);
  const t2 = await tools.execute('take_note', { params: { note: 'hello' } });
  assert.equal(t2.result.saved, 'hello');
  const t3 = await tools.execute('set_timer', { params: { seconds: 60 } });
  assert.equal(t3.result.seconds, 60);
  assert.ok(t3.say.includes('60'));
  assert.equal((await tools.execute('mute', {})).say, 'Muted.');
  assert.equal((await tools.execute('unmute', {})).say, 'Unmuted.');
  assert.equal((await tools.execute('dismiss_all', {})).say, 'All notifications dismissed.');
  assert.equal((await tools.execute('go_idle', {})).say, 'Going idle.');
});
