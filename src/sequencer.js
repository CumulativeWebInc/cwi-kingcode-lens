/**
 * sequencer.js — ActivationSequencer per spec/INTERFACES.md §4 (v1.1).
 *
 * Full sequence:
 *   idle -> listening -> thinking -> speaking|confirming -> idle
 * Rules (v1.1):
 *  - effectiveThreshold = max(global threshold, adapter.recommendedThreshold)
 *  - confidence >= effectiveThreshold AND not destructive -> execute -> SPEAKING
 *  - else -> CONFIRMING (lens renders the FULL action text: "Do X? say yes/no";
 *    10s timeout -> idle). Every confirm AND every deny is a session event
 *    (dotted schema, spec/SCALING.md §2.2) for threshold calibration.
 *  - destructive tools ALWAYS confirm regardless of confidence.
 *  - confirming -> thinking on "yes" (re-decide with confirmation context)
 *  - confirming -> idle on "no" / timeout
 *  - any error -> idle
 *  - 'routed' adapters: notifyRoutedActivation({source, ts, transcript?})
 *    jumps idle->listening. 'routed' = companion-signaled (companion app
 *    button/tap/gesture) — NOT a host-assistant hook; Meta's web path offers
 *    no third-party assistant integration.
 *  - 'custom' adapters: rolling wake window — every 500ms (5 chunks) the
 *    caller passes the last 1500ms (15 chunks) to WakeDetector.detect(),
 *    which retains <=3s and resets after detection.
 *
 * run() is an async generator yielding {event, state, detail} for
 * observability. Session events use the durable §2.2 schema:
 *   {v:1, sessionId, seq, ts, type, payload, idempotencyKey}
 */
import { AdapterError } from './errors.js';
import { AvatarState } from './states.js';
import { AvatarStateMachine } from './avatar-state-machine.js';
import { WAKE_CADENCE_MS, WAKE_WINDOW_MS } from './wake.js';

const CHUNK_MS = 100;
const CADENCE_CHUNKS = Math.round(WAKE_CADENCE_MS / CHUNK_MS); // 5
const WINDOW_CHUNKS = Math.round(WAKE_WINDOW_MS / CHUNK_MS); // 15

const YES = new Set(['yes', 'yeah', 'yep', 'confirm', 'do it', 'sure']);
const NO = new Set(['no', 'nope', 'cancel', 'never mind', 'nevermind', 'stop']);
const ROUTED_SOURCES = new Set(['companion-tap', 'companion-gesture']);

export class ActivationSequencer {
  /**
   * @param {object} deps
   * @param {HardwareAdapter} deps.hardware
   * @param {WakeDetector} deps.wake
   * @param {STTAdapter} deps.stt
   * @param {DecisionAdapter} deps.decide
   * @param {TTSAdapter} deps.tts
   * @param {AvatarRenderer} deps.renderer
   * @param {ToolRegistry} deps.tools
   * @param {SessionStore|null} [deps.sessionStore]
   * @param {number} [deps.threshold=0.75] global floor; the adapter may recommend stricter
   * @param {number} [deps.confirmTimeoutMs=10000]
   * @param {number} [deps.maxListenChunks=64]
   */
  constructor({
    hardware, wake, stt, decide, tts, renderer, tools,
    sessionStore = null, threshold = 0.75, confirmTimeoutMs = 10000,
    maxListenChunks = 64,
  } = {}) {
    for (const [k, v] of Object.entries({ hardware, wake, stt, decide, tts, renderer, tools })) {
      if (!v) throw new AdapterError(`ActivationSequencer: missing dependency ${k}`, 'ADAPTER_FAILURE', 'sequencer');
    }
    this.hardware = hardware;
    this.wake = wake;
    this.stt = stt;
    this.decide = decide;
    this.tts = tts;
    this.renderer = renderer;
    this.tools = tools;
    this.sessionStore = sessionStore;
    this.threshold = threshold;
    this.confirmTimeoutMs = confirmTimeoutMs;
    this.maxListenChunks = maxListenChunks;
    this.machine = new AvatarStateMachine();
    this._routedResolve = null;
    this._routedSignal = null;
    this.priorTurns = [];
  }

  /**
   * Companion-signaled activation for 'routed' adapters.
   * @param {{source:'companion-tap'|'companion-gesture', ts:number, transcript?:string}} signal
   * @returns {boolean} true if accepted
   */
  notifyRoutedActivation(signal = {}) {
    const { source, ts = Date.now(), transcript = null } = signal;
    if (!ROUTED_SOURCES.has(source)) {
      throw new AdapterError(
        `notifyRoutedActivation: source must be one of ${[...ROUTED_SOURCES].join(', ')}`,
        'ADAPTER_FAILURE',
        'sequencer',
      );
    }
    this._routedSignal = { source, ts, transcript };
    if (this._routedResolve) {
      const r = this._routedResolve;
      this._routedResolve = null;
      r(this._routedSignal);
    }
    return true;
  }

  get state() {
    return this.machine.state;
  }

  /**
   * @param {{maxActivations?:number, signal?:AbortSignal}} [opts]
   * @yields {{event:string, state:string, detail:object}}
   */
  async *run({ maxActivations = Infinity, signal } = {}) {
    let activations = 0;
    this.machine = new AvatarStateMachine();
    const sessionId = this.sessionStore ? this.sessionStore.create({ backend: this.hardware.name }) : null;
    // §2.2: every state transition is a session event.
    const offTransition = this.machine.on((evt) => {
      this._slog(sessionId, 'state.transition', { ...evt });
    });

    try {
      while (activations < maxActivations) {
        if (signal?.aborted) break;
        activations += 1;
        yield* this._oneActivation({ signal, sessionId });
        if (signal?.aborted) break;
      }
    } finally {
      offTransition();
      try { await this._show(AvatarState.IDLE, 'run-end'); } catch { /* sim teardown */ }
      if (sessionId && this.sessionStore) this.sessionStore.close(sessionId);
    }
  }

  /** Run exactly one activation cycle (convenience for tests). */
  async *runOnce(opts = {}) {
    yield* this.run({ ...opts, maxActivations: 1 });
  }

  /** Append a §2.2 session event (no-op without a session store). */
  _slog(sessionId, type, payload = {}) {
    if (sessionId && this.sessionStore) {
      try {
        this.sessionStore.append(sessionId, { type, payload });
      } catch { /* session logging never breaks the loop */ }
    }
  }

  // ---- internals ---------------------------------------------------------

  async *_oneActivation({ signal, sessionId }) {
    const aborted = () => signal?.aborted;
    const slog = (type, payload) => this._slog(sessionId, type, payload);

    // idle: show IDLE avatar, await wake
    await this._show(AvatarState.IDLE, 'awaiting-wake');
    yield { event: 'idle', state: this.state, detail: { backend: this.hardware.name } };

    const caps = await this.hardware.capabilities();
    const routed = caps.wakeWord === 'routed';
    // v1.1: the adapter may recommend a stricter bar (e.g. companion-relay audio).
    const effectiveThreshold = Math.max(this.threshold, caps.recommendedThreshold ?? 0.75);
    let mic = null;
    let routedSignal = null;
    let wakeTail = []; // chunks that arrived after the wake chunk -> utterance audio

    try {
      if (routed) {
        routedSignal = await this._awaitRouted(signal);
        if (aborted()) return;
        slog('activation.routed', { ...routedSignal });
        yield { event: 'routed-activation', state: this.state, detail: { signal: routedSignal } };
      } else {
        mic = this.hardware.captureAudio();
        const wakeRes = await this._awaitWake(mic, signal);
        if (aborted()) return;
        if (!wakeRes.found) return; // mic stream ended with no wake word
        wakeTail = wakeRes.tail;
        slog('wake.detected', { keyword: this.wake.keyword, mode: 'custom' });
        yield { event: 'wake', state: this.state, detail: { keyword: this.wake.keyword } };
      }

      // listening: stream chunks until utterance end
      this.machine.transition(AvatarState.LISTENING, routed ? 'routed-activation' : 'wake-detected');
      await this._show(AvatarState.LISTENING, 'listening');
      yield { event: 'listening', state: this.state, detail: {} };

      let chunks;
      if (routedSignal && typeof routedSignal.transcript === 'string') {
        chunks = [{ sim: { transcript: routedSignal.transcript, utteranceEnd: true, source: 'companion' } }];
      } else {
        if (!mic) mic = this.hardware.captureAudio();
        chunks = await this._collectUtterance(mic, signal, { initial: wakeTail });
      }
      if (aborted()) return;
      const transcript = await this.stt.transcribe(chunks);
      slog('stt.final', { ...transcript });
      yield { event: 'transcript', state: this.state, detail: { ...transcript } };
      this.priorTurns.push(transcript.text);

      // thinking: decide
      this.machine.transition(AvatarState.THINKING, 'utterance-end');
      await this._show(AvatarState.THINKING, 'deciding');
      const decision = await this.decide.decide(transcript.text, {
        sessionId,
        priorTurns: [...this.priorTurns],
        routedActivation: routed,
      });
      slog('decision.made', { ...decision, effectiveThreshold });
      yield { event: 'decision', state: this.state, detail: { ...decision, effectiveThreshold } };

      const confident = decision.confidence >= effectiveThreshold;
      const actionable = decision.action !== 'no_action' && this.tools.get(decision.action);
      if (actionable && confident && !decision.destructive) {
        yield* this._execute(decision, { signal, slog });
      } else {
        yield* this._confirm(decision, { signal, slog, mic });
      }
    } catch (err) {
      slog('error', { message: err?.message, code: err?.code });
      yield { event: 'error', state: this.state, detail: { message: err?.message, code: err?.code } };
    } finally {
      if (mic?.return) {
        // Bounded teardown: a hung mic must never stall the sequencer.
        try { await Promise.race([mic.return(), new Promise((r) => setTimeout(r, 250))]); } catch { /* noop */ }
      }
      this.machine.reset('activation-end');
      await this._show(AvatarState.IDLE, 'idle');
      yield { event: 'idle', state: this.state, detail: { activation: 'end' } };
    }
  }

  async *_execute(decision, { signal, slog, sayOverride = null } = {}) {
    this.machine.transition(AvatarState.SPEAKING, `execute:${decision.action}`);
    let say;
    let fallback = false;
    if (decision.action === '__fallback' && sayOverride) {
      say = sayOverride; // confirmed no_action: honest fallback, no tool run
      fallback = true;
    } else {
      const { result, say: toolSay } = await this.tools.execute(decision.action, {
        params: decision.params, target: decision.target, value: decision.value,
      });
      say = toolSay;
      slog('tool.executed', { action: decision.action, result });
      yield { event: 'tool-result', state: this.state, detail: { action: decision.action, result } };
    }
    await this._show(AvatarState.SPEAKING, say);
    yield { event: 'speaking', state: this.state, detail: { text: say, fallback } };
    const audio = await this.tts.speak(say);
    slog('tts.done', { chunks: audio.length });
    yield { event: 'tts', state: this.state, detail: { chunks: audio.length, bytes: audio.length * audio[0].pcm.length * 2 } };
    if (signal?.aborted) return;
    // Simulated playback: the sim has no speaker; chunks are the artifact.
  }

  async *_confirm(decision, { signal, slog, mic }) {
    this.machine.transition(AvatarState.CONFIRMING, 'below-threshold-or-destructive');
    // v1.1: CONFIRMING renders the FULL action text on the lens.
    const label = this._describeDecision(decision);
    await this._show(AvatarState.CONFIRMING, label);
    slog('confirm.asked', { decision: { ...decision }, prompt: label });
    yield { event: 'confirm', state: this.state, detail: { decision: { ...decision }, prompt: label } };

    const answer = await this._awaitConfirmation(mic, signal);
    if (answer === 'timeout') {
      slog('confirm.timeout', { action: decision.action });
      yield { event: 'confirm-timeout', state: this.state, detail: { answer } };
      return; // -> idle via _oneActivation finally
    }
    if (answer === 'no') {
      slog('confirm.no', { action: decision.action }); // deny = calibration event
      yield { event: 'denied', state: this.state, detail: { action: decision.action } };
      return; // -> idle via _oneActivation finally
    }
    // "yes" -> thinking: re-decide with confirmation context
    slog('confirm.yes', { action: decision.action }); // confirm = calibration event
    yield { event: 'confirmed', state: this.state, detail: { action: decision.action } };
    this.machine.transition(AvatarState.THINKING, 'user-confirmed');
    await this._show(AvatarState.THINKING, 'confirmed — deciding');
    const re = await this.decide.decide(decision.source_text, {
      sessionId: null,
      priorTurns: [...this.priorTurns],
      routedActivation: false,
      confirmed: true,
    });
    slog('decision.made', { ...re, confirmed: true });
    yield { event: 'decision', state: this.state, detail: { ...re, confirmed: true } };
    const actionable = re.action !== 'no_action' && this.tools.get(re.action);
    if (actionable) {
      yield* this._execute(re, { signal, slog }); // confirmed: destructive may run
    } else {
      // Confirmed but still no_action -> say so, honestly.
      yield* this._execute(
        { action: '__fallback', params: {}, target: null, value: null },
        { signal, slog, sayOverride: "I didn't catch that — try again?" },
      );
    }
  }

  async _show(state, caption) {
    const frame = this.renderer.render(state, caption);
    try {
      await this.hardware.renderFrame(frame);
    } catch (err) {
      if (err?.code === 'NOT_IMPLEMENTED') return; // stub backends: render is best-effort
      throw err;
    }
    return frame;
  }

  _describeDecision(d) {
    if (d.action === 'no_action') return "I didn't catch that — say yes to retry, no to cancel.";
    const p = d.params && Object.keys(d.params).length ? ` ${JSON.stringify(d.params)}` : '';
    const tag = d.destructive ? ' (cannot be undone)' : '';
    return `Do ${d.action}${p}? — say yes / no${tag}`;
  }

  /**
   * Rolling wake window (v1.1 streaming contract): accumulate chunks; every
   * 500ms (5 chunks) pass the last 1500ms (15 chunks) to detect(). On stream
   * end, one final flush detect runs over the buffered window.
   * @returns {Promise<{found:boolean, tail:Array}>} tail = chunks that arrived
   *   after the wake chunk — they belong to the utterance, not the wake scan.
   */
  async _awaitWake(mic, signal) {
    const recent = [];
    let sinceDetect = 0;
    const check = async () => {
      sinceDetect = 0;
      const r = await this.wake.detect([...recent]);
      if (r.detected) {
        const idx = recent.findIndex((c) => c && c.sim && c.sim.wakeWord === true);
        return { found: true, tail: idx >= 0 ? recent.slice(idx + 1) : [] };
      }
      return null;
    };
    for (;;) {
      if (signal?.aborted) return { found: false, tail: [] };
      const { value, done } = await mic.next();
      if (done || !value) {
        if (recent.length) {
          const hit = await check();
          if (hit) return hit;
        }
        return { found: false, tail: [] };
      }
      recent.push(value);
      if (recent.length > WINDOW_CHUNKS) recent.shift();
      sinceDetect += 1;
      if (sinceDetect >= CADENCE_CHUNKS) {
        const hit = await check();
        if (hit) return hit;
      }
    }
  }

  async _collectUtterance(mic, signal, { timeoutMs = 15000, initial = [] } = {}) {
    const chunks = [];
    for (const c of initial) {
      chunks.push(c);
      if (c.sim?.utteranceEnd) return chunks;
    }
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (signal?.aborted) break;
      const { value, done } = await mic.next();
      if (done || !value) break;
      chunks.push(value);
      if (value.sim?.utteranceEnd) break;
      if (chunks.length >= this.maxListenChunks) break;
      if (Date.now() > deadline) break;
    }
    return chunks;
  }

  _awaitRouted(signal) {
    if (this._routedSignal) {
      const s = this._routedSignal;
      this._routedSignal = null;
      return Promise.resolve(s);
    }
    return new Promise((resolve) => {
      this._routedResolve = resolve;
      if (signal) {
        signal.addEventListener('abort', () => {
          if (this._routedResolve) {
            const r = this._routedResolve;
            this._routedResolve = null;
            r(null);
          }
        }, { once: true });
      }
    });
  }

  async _awaitConfirmation(mic, signal) {
    const timeout = new Promise((resolve) => setTimeout(() => resolve('timeout'), this.confirmTimeoutMs));
    const listen = (async () => {
      const gen = mic || this.hardware.captureAudio();
      const chunks = [];
      for (;;) {
        if (signal?.aborted) return 'timeout';
        const { value, done } = await gen.next();
        if (done || !value) break;
        chunks.push(value);
        if (value.sim?.utteranceEnd) break;
        if (chunks.length >= this.maxListenChunks) break;
      }
      const t = await this.stt.transcribe(chunks);
      const norm = t.text.toLowerCase().trim();
      if ([...YES].some((y) => norm === y || norm.startsWith(y + ' '))) return 'yes';
      if ([...NO].some((n) => norm === n || norm.startsWith(n + ' '))) return 'no';
      return 'no'; // unintelligible confirm answer = decline (safe default)
    })();
    const winner = await Promise.race([timeout, listen]);
    return winner;
  }
}
