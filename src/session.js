/**
 * session.js — SessionStore + ToolRegistry per spec/INTERFACES.md §5 (v1.1).
 *
 * v1 ADOPTS the durable session event schema + idempotency keys from
 * spec/SCALING.md §2.2 from day one, so the future stateless-worker swap is
 * mechanical:
 *
 *   SessionEvent = { v:1, sessionId, seq, ts, type, payload, idempotencyKey }
 *
 * Rules honored here: append-only (no updates/deletes — corrections are new
 * events); append() is idempotent on idempotencyKey (duplicate key -> the
 * original seq, no duplicate write); readers replay events[] in seq order.
 *
 * v1: IN-PROCESS implementations, honestly labeled "single-process".
 */
import { AdapterError } from './errors.js';

function uuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback: not a true uuid, but unique enough for the sim.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Dotted session event types (spec/SCALING.md §2.2):
 * wake.detected | stt.final | decision.made | tool.executed | confirm.asked |
 * confirm.yes | confirm.no | confirm.timeout | tts.done | state.transition |
 * error | activation.routed
 */
export class SessionStore {
  constructor() {
    this._sessions = new Map();
    this.mode = 'single-process'; // honest label
    this.schemaVersion = 1;
  }

  /** create(session) -> id (uuid v4) */
  create(session = {}) {
    const id = uuid();
    this._sessions.set(id, {
      id,
      created: Date.now(),
      closed: false,
      events: [],
      seenKeys: new Map(), // idempotencyKey -> seq
      ...session,
    });
    return id;
  }

  /**
   * Append one event. Idempotent on idempotencyKey: a duplicate key returns
   * the ORIGINAL seq without writing a duplicate.
   * @param {string} id session id
   * @param {{type:string, payload?:object, idempotencyKey?:string}} event
   * @returns {number} seq (monotonic per session)
   */
  append(id, event) {
    const s = this._sessions.get(id);
    if (!s) throw new AdapterError(`SessionStore: unknown session ${id}`, 'ADAPTER_FAILURE', 'session-store');
    if (s.closed) throw new AdapterError(`SessionStore: session ${id} is closed`, 'ADAPTER_FAILURE', 'session-store');
    if (!event || typeof event.type !== 'string') {
      throw new AdapterError('SessionStore.append: event needs a string `type`', 'ADAPTER_FAILURE', 'session-store');
    }
    const key = event.idempotencyKey || uuid();
    if (s.seenKeys.has(key)) {
      return s.seenKeys.get(key); // idempotent replay: no duplicate write
    }
    const seq = s.events.length + 1;
    const stored = {
      v: 1,
      sessionId: id,
      seq,
      ts: Date.now(),
      type: event.type,
      payload: event.payload ?? {},
      idempotencyKey: key,
    };
    s.events.push(stored);
    s.seenKeys.set(key, seq);
    return seq;
  }

  /** get(id) -> session with events[] in seq order (replay order), or null. */
  get(id) {
    const s = this._sessions.get(id);
    if (!s) return null;
    const { seenKeys, ...rest } = s;
    return { ...rest, events: [...s.events] };
  }

  close(id) {
    const s = this._sessions.get(id);
    if (!s) return false;
    s.closed = true;
    s.closedAt = Date.now();
    return true;
  }

  /** All known session ids (observability / tests). */
  ids() {
    return [...this._sessions.keys()];
  }

  get size() {
    return this._sessions.size;
  }
}

export class ToolRegistry {
  constructor() {
    this._tools = new Map();
    this.mode = 'single-process'; // honest label
  }

  /**
   * Register a tool: {name, destructive:boolean, run(args)->result|Promise,
   *   respond?(result, args)->string}
   */
  register(tool) {
    if (!tool || typeof tool.name !== 'string' || typeof tool.run !== 'function') {
      throw new AdapterError('ToolRegistry.register: tool needs {name, run}', 'ADAPTER_FAILURE', 'tool-registry');
    }
    this._tools.set(tool.name, {
      destructive: !!tool.destructive,
      run: tool.run,
      respond: tool.respond || ((result) => `Done: ${tool.name}.`),
      description: tool.description || '',
    });
    return tool.name;
  }

  get(name) {
    return this._tools.get(name) ?? null;
  }

  list() {
    return [...this._tools.entries()].map(([name, t]) => ({
      name,
      destructive: t.destructive,
      description: t.description,
    }));
  }

  async execute(name, args = {}) {
    const t = this._tools.get(name);
    if (!t) throw new AdapterError(`ToolRegistry: unknown tool ${name}`, 'ADAPTER_FAILURE', 'tool-registry');
    const result = await t.run(args);
    return { result, say: t.respond(result, args), destructive: t.destructive };
  }
}

/**
 * The v1 eyewear toolset: small, real, single-process. Destructive tools are
 * flagged so the sequencer ALWAYS confirms them regardless of confidence.
 */
export function defaultEyewearTools() {
  const reg = new ToolRegistry();
  const notes = [];

  reg.register({
    name: 'get_time',
    destructive: false,
    description: 'Speak the current time.',
    run: async () => {
      const d = new Date();
      return { iso: d.toISOString(), label: d.toLocaleTimeString() };
    },
    respond: (r) => `The time is ${r.label}.`,
  });

  reg.register({
    name: 'take_note',
    destructive: false,
    description: 'Save a short note.',
    run: async ({ params }) => {
      const note = params?.note ?? '';
      notes.push({ note, ts: Date.now() });
      return { saved: note, count: notes.length };
    },
    respond: (r) => `Noted: ${r.saved}`,
  });

  reg.register({
    name: 'set_timer',
    destructive: false,
    description: 'Set a countdown timer (seconds).',
    run: async ({ params }) => {
      const seconds = params?.seconds ?? 0;
      return { seconds, firesAt: Date.now() + seconds * 1000 };
    },
    respond: (r) => `Timer set for ${r.seconds} seconds.`,
  });

  reg.register({
    name: 'mute',
    destructive: false,
    description: 'Mute lens audio output (reversible).',
    run: async () => ({ muted: true }),
    respond: () => 'Muted.',
  });

  reg.register({
    name: 'unmute',
    destructive: false,
    description: 'Unmute lens audio output.',
    run: async () => ({ muted: false }),
    respond: () => 'Unmuted.',
  });

  reg.register({
    name: 'dismiss_all',
    destructive: true, // irreversible — sequencer always confirms
    description: 'Dismiss all pending notifications (cannot be undone).',
    run: async () => ({ dismissed: true }),
    respond: () => 'All notifications dismissed.',
  });

  reg.register({
    name: 'go_idle',
    destructive: false,
    description: 'Return the avatar to idle.',
    run: async () => ({ idle: true }),
    respond: () => 'Going idle.',
  });

  return reg;
}
