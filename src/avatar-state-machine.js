/**
 * avatar-state-machine.js — Enforces the legal transition graph from
 * spec/INTERFACES.md §2. Illegal transitions throw AdapterError
 * (code ILLEGAL_TRANSITION). Every transition emits
 * {from, to, ts, reason} to subscribed listeners.
 */
import { AdapterError } from './errors.js';
import { AvatarState, isLegalTransition } from './states.js';

export class AvatarStateMachine {
  constructor() {
    this._state = AvatarState.IDLE;
    this._listeners = new Set();
    this._history = [];
  }

  get state() {
    return this._state;
  }

  /** Subscribe to transition events. Returns an unsubscribe function. */
  on(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  get history() {
    return [...this._history];
  }

  /**
   * Move to `to`. Throws AdapterError on illegal transitions.
   * @param {string} to target AvatarState
   * @param {string} [reason=''] why the transition happened
   */
  transition(to, reason = '') {
    if (!Object.values(AvatarState).includes(to)) {
      throw new AdapterError(
        `Unknown avatar state: ${String(to)}`,
        'ILLEGAL_TRANSITION',
        'state-machine',
      );
    }
    const from = this._state;
    if (from === to) {
      // Same-state re-entry is a legal no-op (e.g. repeated idle resets).
      const evt = { from, to, ts: Date.now(), reason };
      this._emit(evt);
      return evt;
    }
    if (!isLegalTransition(from, to)) {
      throw new AdapterError(
        `Illegal avatar transition: ${from} -> ${to}`,
        'ILLEGAL_TRANSITION',
        'state-machine',
      );
    }
    this._state = to;
    const evt = { from, to, ts: Date.now(), reason };
    this._history.push(evt);
    this._emit(evt);
    return evt;
  }

  /** Force back to idle (error / timeout / disconnect path). Always legal. */
  reset(reason = 'reset') {
    return this.transition(AvatarState.IDLE, reason);
  }

  _emit(evt) {
    for (const fn of this._listeners) {
      try {
        fn(evt);
      } catch {
        // Listener errors must never break the state machine.
      }
    }
  }
}
