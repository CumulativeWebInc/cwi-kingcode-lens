/**
 * decision.js — DecisionAdapter per spec/INTERFACES.md §3.
 *
 * Local $0 classifier (layer 'local-classifier-v1'), deterministic, zero-dep.
 * The decision object MIRRORS cwi-voice-command's decision shape exactly —
 * {action, target, value, confidence, destructive, source_text, layer} —
 * plus `params` (required by the interface contract §3):
 *   {action, target, value, params, confidence, destructive, source_text, layer}
 *
 * Confidence formula mirrors cwi-voice-command docs/decision-interface.md:
 *   base 0.50 verb match
 *   +0.20 exact target/param-slot match
 *   +0.15 required parameter parsed cleanly (or none required)
 *   +0.10 full input consumed by the grammar (no leftover words)
 *   -0.20 any unrecognized word (unknown tokens are suspicion, not noise)
 *   clamp [0.05, 0.99] — the local layer never claims 1.0.
 *
 * Eyewear vocabulary (v1, small and real):
 *   get_time | take_note | set_timer | mute | unmute | dismiss_all | go_idle
 */
const LAYER = 'local-classifier-v1';

const FILLERS = new Set([
  'please', 'the', 'a', 'an', 'hey', 'kingcode', 'now', 'my', 'me',
  'for', 'to', 'it', 'all',
]);

function normalize(text) {
  return String(text)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9%\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Each matcher: (tokens, norm) -> {params, value, consumed:string[]}|null */
const ACTIONS = [
  {
    action: 'get_time',
    destructive: false,
    needsParam: false,
    match(tokens, norm) {
      if (/^whats?( the)? time( is it)?$/.test(norm)) {
        return { params: {}, value: null, consumed: tokens, exactSlot: false };
      }
      return null;
    },
  },
  {
    action: 'take_note',
    destructive: false,
    needsParam: true,
    match(tokens, norm) {
      const m = /^(take)( a)? note (.+)$/.exec(norm);
      if (!m) return null;
      const note = m[3].trim();
      if (!note) return null;
      // Free-text note: all its words are consumed (never "unknown").
      return { params: { note }, value: null, consumed: tokens, exactSlot: true };
    },
  },
  {
    action: 'set_timer',
    destructive: false,
    needsParam: true,
    match(tokens, norm) {
      const m = /^set( a)? timer( for)? (\d+) (seconds?|minutes?|hours?)$/.exec(norm);
      if (!m) return null;
      const n = parseInt(m[3], 10);
      const unit = m[4];
      const mult = unit.startsWith('hour') ? 3600 : unit.startsWith('minute') ? 60 : 1;
      const seconds = n * mult;
      if (!Number.isFinite(seconds) || seconds <= 0) return null;
      return {
        params: { seconds, unit: unit.replace(/s$/, '') },
        value: seconds,
        consumed: tokens,
        exactSlot: true, // unit matched the grammar exactly
      };
    },
  },
  {
    action: 'unmute',
    destructive: false,
    needsParam: false,
    match(tokens, norm) {
      if (/^unmute$/.test(norm)) return { params: {}, value: null, consumed: tokens, exactSlot: false };
      return null;
    },
  },
  {
    action: 'mute',
    destructive: false,
    needsParam: false,
    match(tokens, norm) {
      if (/^mute$/.test(norm)) return { params: {}, value: null, consumed: tokens, exactSlot: false };
      return null;
    },
  },
  {
    action: 'dismiss_all',
    destructive: true, // irreversible — the sequencer ALWAYS confirms
    needsParam: false,
    match(tokens, norm) {
      if (/^dismiss all( notifications?)?$/.test(norm)) {
        return { params: {}, value: null, consumed: tokens, exactSlot: false };
      }
      return null;
    },
  },
  {
    action: 'go_idle',
    destructive: false,
    needsParam: false,
    match(tokens, norm) {
      if (/^(go idle|stand down|sleep)$/.test(norm)) {
        return { params: {}, value: null, consumed: tokens, exactSlot: false };
      }
      return null;
    },
  },
];

function score(matched, spec, tokens, consumed) {
  let c = 0.5; // verb recognized
  if (matched.exactSlot) c += 0.2;
  if (!spec.needsParam) c += 0.15; // none required = cleanly satisfied
  else if (matched.params && Object.keys(matched.params).length > 0) c += 0.15;
  const consumedSet = new Set(consumed);
  const leftover = tokens.filter((t) => !consumedSet.has(t) && !FILLERS.has(t));
  if (leftover.length === 0) c += 0.1; // full input consumed
  else c -= 0.2; // unknown words
  return Math.max(0.05, Math.min(0.99, Math.round(c * 100) / 100));
}

export class DecisionAdapter {
  constructor() {
    this.layer = LAYER;
  }

  /** The v1 command vocabulary (action names). */
  vocabulary() {
    return ACTIONS.map((a) => ({ action: a.action, destructive: a.destructive }));
  }

  /**
   * @param {string} text transcript
   * @param {object} [ctx] {sessionId, priorTurns, routedActivation, confirmed}
   * @returns {Promise<{action,target,value,params,confidence,destructive,source_text,layer}>}
   */
  async decide(text, ctx = {}) {
    const source_text = String(text ?? '');
    const norm = normalize(source_text);
    const tokens = norm ? norm.split(' ') : [];

    for (const spec of ACTIONS) {
      const matched = spec.match(tokens, norm);
      if (!matched) continue;
      const confidence = score(matched, spec, tokens, matched.consumed);
      return {
        action: spec.action,
        target: null,
        value: matched.value,
        params: matched.params,
        confidence,
        destructive: spec.destructive,
        source_text,
        layer: LAYER,
      };
    }

    return {
      action: 'no_action',
      target: null,
      value: null,
      params: {},
      confidence: 0.05,
      destructive: false,
      source_text,
      layer: LAYER,
    };
  }
}
