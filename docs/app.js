/**
 * KingCode Lens — on-lens SIMULATOR (docs/app.js).
 *
 * Drives the REAL src/ modules (same code the conformance suite tests) with a
 * demo-side queue mic. Everything is labeled SIMULATOR: the wake word, the
 * mic audio, STT/TTS, and the lens are all simulated in this page.
 *
 * Backend notes (honest):
 *  - meta-display (routed): activation = companion tap. The web path has NO
 *    on-glasses mic; chunks are tagged companion-mic-relay (simulated).
 *  - brilliant-labs (custom): "Hey KingCode" keyword-spotting simulation.
 */
import {
  BrilliantLabsAdapter,
  MetaDisplayAdapter,
  WakeDetector,
  STTAdapter,
  TTSAdapter,
  DecisionAdapter,
  AvatarRenderer,
  ActivationSequencer,
  SessionStore,
  defaultEyewearTools,
  AdapterError,
} from './vendor/src/index.js';

const $ = (id) => document.getElementById(id);
const lensEl = $('lens'), logEl = $('log');

/** Demo-side mic: an infinite chunk queue. Push steps, the sequencer streams them. */
function queueMic(Base) {
  return class extends Base {
    constructor() {
      super();
      this.queue = [];
    }
    push(step) {
      this.queue.push(step);
    }
    async *captureAudio() {
      if (!this.connected) {
        throw new AdapterError(`${this.name}: captureAudio before connect`, 'NOT_CONNECTED', this.name);
      }
      for (;;) {
        if (!this.connected) return;
        const step = this.queue.shift() || {};
        yield {
          pcm: new Int16Array(1600),
          sampleRate: 16000,
          channels: 1,
          ts: Date.now(),
          sim: {
            wakeWord: !!step.wakeWord,
            transcript: step.transcript ?? null,
            utteranceEnd: !!step.utteranceEnd,
            source: this.micSource + ' (simulated)',
          },
        };
        await new Promise((r) => setTimeout(r, 90)); // ~real-time pacing
      }
    }
  };
}

const BACKENDS = {
  'meta-display': { cls: queueMic(MetaDisplayAdapter), wakeMode: 'routed', spec: '600 × 600 · additive · SIMULATED' },
  'brilliant-labs': { cls: queueMic(BrilliantLabsAdapter), wakeMode: 'custom', spec: '640 × 400 · OLED · SIMULATED' },
};

let hw = null;          // current adapter (one per backend selection = one connection)
let renderer = null;    // one renderer per connection -> frame.seq stays monotonic
let running = false;
let audioCtx = null;

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function log(html, cls = '') {
  const t = new Date().toLocaleTimeString();
  logEl.insertAdjacentHTML('beforeend', `<div class="${cls}"><span class="t">${t}</span> ${html}</div>`);
  logEl.scrollTop = logEl.scrollHeight;
}

function paintLens() {
  if (hw && hw.lastFrame) {
    lensEl.innerHTML = hw.lastFrame.svg;
    $('lens-state').textContent = `state: ${hw.lastFrame.state}`;
    $('lens-seq').textContent = `frame seq: ${hw.lastFrame.seq}`;
  }
}

async function selectBackend(name) {
  if (hw) { try { await hw.disconnect(); } catch { /* noop */ } }
  const b = BACKENDS[name];
  hw = new b.cls();
  renderer = new AvatarRenderer();
  await hw.connect();
  $('lens-spec').textContent = b.spec;
  $('backend-hint').innerHTML = name === 'meta-display'
    ? 'MetaDisplay is <strong>display-first</strong>: the web path has no on-glasses mic &mdash; voice shown here is phone-companion mic relayed via cloud (simulated).'
    : 'BrilliantLabs is the <strong>full-loop</strong> path: custom &ldquo;Hey KingCode&rdquo; wake word + on-glasses mic (both simulated here).';
  $('activate').textContent = name === 'meta-display' ? 'Companion tap → ask KingCode' : 'Say “Hey KingCode” (simulated)';
  paintIdle();
  log(`backend: <b>${esc(name)}</b> connected (simulated transport)`);
}

function paintIdle() {
  const f = renderer.render('idle', 'SIMULATOR');
  hw.renderFrame(f).then(paintLens).catch(() => {});
}

function playSpeech(text) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const tts = new TTSAdapter();
    tts.speak(text).then((chunks) => {
      const total = chunks.reduce((a, c) => a + c.pcm.length, 0);
      const buf = audioCtx.createBuffer(1, total, 16000);
      const d = buf.getChannelData(0);
      let o = 0;
      for (const c of chunks) for (let i = 0; i < c.pcm.length; i++) d[o++] = c.pcm[i] / 32768;
      const src = audioCtx.createBufferSource();
      src.buffer = buf;
      src.connect(audioCtx.destination);
      src.start();
    });
  } catch { /* audio is a nicety, not the demo */ }
}

let countdownTimer = null;
function startCountdown() {
  stopCountdown();
  let left = 10;
  $('countdown').textContent = `${left}s`;
  countdownTimer = setInterval(() => {
    left -= 1;
    $('countdown').textContent = left > 0 ? `${left}s` : 'timed out';
    if (left <= 0) stopCountdown();
  }, 1000);
}
function stopCountdown() {
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = null;
  $('countdown').textContent = '';
}

async function activate() {
  if (running || !hw) return;
  const backendName = $('backend').value;
  const b = BACKENDS[backendName];
  const text = $('cmd').value.trim();
  running = true;
  $('activate').disabled = true;

  const seq = new ActivationSequencer({
    hardware: hw,
    wake: new WakeDetector({ mode: b.wakeMode }),
    stt: new STTAdapter(),
    decide: new DecisionAdapter(),
    tts: new TTSAdapter(),
    renderer,
    tools: defaultEyewearTools(),
    sessionStore: new SessionStore(),
    threshold: 0.75,
    confirmTimeoutMs: 10000,
  });

  if (b.wakeMode === 'routed') {
    log(`companion tap <span class="sim-badge small">SIMULATOR</span>`);
  } else {
    hw.push({ wakeWord: true }); // simulated "Hey KingCode"
    log(`wake word <b>“Hey KingCode”</b> injected <span class="sim-badge small">SIMULATOR</span>`);
  }
  // The utterance, right behind the wake (real usage has a beat between them).
  setTimeout(() => {
    hw.push({ transcript: text });
    hw.push({ utteranceEnd: true });
  }, b.wakeMode === 'routed' ? 300 : 900);

  try {
    const run = seq.runOnce();
    if (b.wakeMode === 'routed') {
      // Companion signal carries the transcript on the routed path.
      setTimeout(() => seq.notifyRoutedActivation({ source: 'companion-tap', ts: Date.now(), transcript: text }), 250);
    }
    for await (const e of run) {
      paintLens();
      const d = e.detail || {};
      switch (e.event) {
        case 'wake': log(`wake detected — <b>${esc(d.keyword || '')}</b>`, 'ev-state'); break;
        case 'routed-activation': log(`routed activation — ${esc(d.signal?.source || '')}`, 'ev-state'); break;
        case 'listening': log('listening…', 'ev-state'); break;
        case 'transcript': log(`heard: “${esc(d.text)}” <span class="t">(simulated STT)</span>`); break;
        case 'decision':
          log(`decision: <b>${esc(d.action)}</b> conf=${d.confidence} bar=${d.effectiveThreshold}${d.destructive ? ' <b>DESTRUCTIVE</b>' : ''}`, 'ev-decision');
          break;
        case 'confirm':
          log(`confirm: ${esc(d.prompt)}`, 'ev-decision');
          $('confirm-prompt').textContent = d.prompt;
          $('confirm-box').classList.remove('hidden');
          startCountdown();
          break;
        case 'confirmed': log('user confirmed', 'ev-tool'); $('confirm-box').classList.add('hidden'); stopCountdown(); break;
        case 'denied': log('user denied', 'ev-err'); $('confirm-box').classList.add('hidden'); stopCountdown(); break;
        case 'confirm-timeout': log(`confirm ${esc(d.answer)} — back to idle`, 'ev-err'); $('confirm-box').classList.add('hidden'); stopCountdown(); break;
        case 'tool-result': log(`tool <b>${esc(d.action)}</b> ran`, 'ev-tool'); break;
        case 'speaking': log(`lens says: “${esc(d.text)}”`); playSpeech(d.text); break;
        case 'tts': log(`<span class="t">tts: ${d.chunks} PCM chunks (simulated synthesis)</span>`); break;
        case 'error': log(`error: ${esc(d.message || '')}`, 'ev-err'); break;
        case 'idle': break;
      }
    }
  } catch (err) {
    log(`error: ${esc(err.message)}`, 'ev-err');
  } finally {
    $('confirm-box').classList.add('hidden');
    stopCountdown();
    running = false;
    $('activate').disabled = false;
    paintLens();
  }
}

$('activate').addEventListener('click', activate);
$('cmd').addEventListener('keydown', (e) => { if (e.key === 'Enter') activate(); });
$('backend').addEventListener('change', (e) => selectBackend(e.target.value));
$('clear-log').addEventListener('click', () => { logEl.innerHTML = ''; });
$('yes').addEventListener('click', () => { hw.push({ transcript: 'yes' }); hw.push({ utteranceEnd: true }); log('you: “yes”'); });
$('no').addEventListener('click', () => { hw.push({ transcript: 'no' }); hw.push({ utteranceEnd: true }); log('you: “no”'); });

// Web Speech API: browser-side demo input only (NOT glasses mic — labeled as such).
(() => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;
  const btn = $('speak');
  btn.disabled = false;
  btn.title = 'Browser demo input — not glasses mic (SIMULATOR)';
  btn.addEventListener('click', () => {
    const r = new SR();
    r.lang = 'en-US';
    r.interimResults = false;
    r.onresult = (e) => {
      const t = e.results[0][0].transcript;
      $('cmd').value = t;
      log(`browser speech → “${esc(t)}” <span class="t">(demo input, not glasses mic)</span>`);
      activate();
    };
    r.onerror = (e) => log(`speech input error: ${esc(e.error)}`, 'ev-err');
    try { r.start(); } catch { /* noop */ }
  });
})();

selectBackend('meta-display');
