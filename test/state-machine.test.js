/**
 * state-machine.test.js — Legal transitions pass and emit events;
 * illegal transitions throw AdapterError/ILLEGAL_TRANSITION.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AvatarStateMachine } from '../src/avatar-state-machine.js';
import { AvatarState } from '../src/states.js';
import { AdapterError } from '../src/errors.js';

const LEGAL = [
  ['idle', 'listening'],
  ['listening', 'thinking'],
  ['thinking', 'speaking'],
  ['thinking', 'confirming'],
  ['confirming', 'thinking'],
  ['confirming', 'idle'],
  ['speaking', 'idle'],
];

test('legal transitions pass and emit {from,to,ts,reason}', () => {
  const m = new AvatarStateMachine();
  const seen = [];
  m.on((e) => seen.push(e));
  // Walk a full legal path: idle->listening->thinking->confirming->thinking->speaking->idle
  const path = ['listening', 'thinking', 'confirming', 'thinking', 'speaking', 'idle'];
  const reasons = ['wake', 'utterance', 'low-conf', 'yes', 'tool-done', 'tts-done'];
  path.forEach((to, i) => m.transition(to, reasons[i]));
  assert.equal(m.state, 'idle');
  assert.equal(seen.length, path.length);
  assert.deepEqual(seen.map((e) => e.to), path);
  assert.deepEqual(seen.map((e) => e.reason), reasons);
  for (const e of seen) {
    assert.ok(typeof e.from === 'string' && typeof e.to === 'string');
    assert.ok(Number.isFinite(e.ts));
  }
  assert.deepEqual([seen[0].from, seen[0].to], ['idle', 'listening']);
});

test('every listed legal pair passes', () => {
  for (const [from, to] of LEGAL) {
    const m = new AvatarStateMachine();
    // drive to `from` first
    const drivers = {
      idle: [],
      listening: ['listening'],
      thinking: ['listening', 'thinking'],
      speaking: ['listening', 'thinking', 'speaking'],
      confirming: ['listening', 'thinking', 'confirming'],
    };
    for (const d of drivers[from]) m.transition(d, 'drive');
    assert.equal(m.state, from);
    m.transition(to, 'test');
    assert.equal(m.state, to, `${from} -> ${to} should be legal`);
  }
});

test('illegal transitions throw AdapterError ILLEGAL_TRANSITION', () => {
  const illegal = [
    ['idle', 'thinking'],
    ['idle', 'speaking'],
    ['idle', 'confirming'],
    ['listening', 'speaking'],
    ['listening', 'confirming'],
    ['listening', 'idle', true], // any->idle is LEGAL — handled below
    ['thinking', 'listening'],
    ['thinking', 'idle', true],
    ['speaking', 'listening'],
    ['speaking', 'thinking'],
    ['speaking', 'confirming'],
    ['confirming', 'speaking'],
    ['confirming', 'listening'],
  ];
  for (const [from, to, legalIdle] of illegal) {
    const m = new AvatarStateMachine();
    const drivers = {
      idle: [],
      listening: ['listening'],
      thinking: ['listening', 'thinking'],
      speaking: ['listening', 'thinking', 'speaking'],
      confirming: ['listening', 'thinking', 'confirming'],
    };
    for (const d of drivers[from]) m.transition(d, 'drive');
    if (legalIdle) {
      m.transition(to, 'any->idle');
      assert.equal(m.state, 'idle');
    } else {
      assert.throws(() => m.transition(to, 'illegal'), (e) => {
        assert.ok(e instanceof AdapterError);
        assert.equal(e.code, 'ILLEGAL_TRANSITION');
        return true;
      }, `${from} -> ${to} must throw`);
      assert.equal(m.state, from, 'state unchanged after illegal transition');
    }
  }
});

test('unknown state throws', () => {
  const m = new AvatarStateMachine();
  assert.throws(() => m.transition('flying', 'x'), (e) => e.code === 'ILLEGAL_TRANSITION');
});

test('reset() returns to idle from anywhere', () => {
  for (const s of Object.values(AvatarState)) {
    const m = new AvatarStateMachine();
    const drivers = {
      idle: [], listening: ['listening'], thinking: ['listening', 'thinking'],
      speaking: ['listening', 'thinking', 'speaking'],
      confirming: ['listening', 'thinking', 'confirming'],
    };
    for (const d of drivers[s]) m.transition(d, 'drive');
    m.reset('error');
    assert.equal(m.state, 'idle');
  }
});

test('unsubscribe works; listener errors do not break the machine', () => {
  const m = new AvatarStateMachine();
  let n = 0;
  const off = m.on(() => { n += 1; throw new Error('listener boom'); });
  m.transition('listening', 'wake');
  assert.equal(n, 1);
  assert.equal(m.state, 'listening');
  off();
  m.transition('thinking', 'utt');
  assert.equal(n, 1);
});
