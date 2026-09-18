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
  // Simulator lab (official-extension parity) — pure helpers from src/sim-lab.js
  dpadKey,
  displayFilters,
  findScene,
  qaLensSize,
  qaNoScroll,
  qaFrameBackdrop,
  qaFocusableCount,
  qaFocusVisible,
  qaFontSizes,
  qaFavicon,
  qaTapTarget,
  RECORDER,
  svgToDataUrl,
  AUTO_DIM_MS,
} from './vendor/src/index.js';

const $ = (id) => document.getElementById(id);
const lensEl = $('lens'), logEl = $('log');
const frameEl = $('lens-frame'), bgEl = $('lens-bg'), camEl = $('lens-cam');

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
    frameEl.innerHTML = hw.lastFrame.svg; // additive app layer (screen blend over env)
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

/* ================= Simulator lab (official-extension parity) ================= */
/* Mirrors Meta's official Display Simulator behaviors: environment          */
/* backgrounds, display settings, D-pad input, viewport recorder, QA list.  */
/* Everything stays labeled SIMULATOR.                                       */

/* ---------- environment ---------- */
const sceneSel = $('env-scene');
let bgImg = null;   // uploaded backdrop image
let camStream = null;
function currentScene() { return findScene(sceneSel.value); }
function applyScene() {
  const s = currentScene();
  bgEl.classList.toggle('animated', !!s.animated && !bgImg && !camStream);
  if (bgImg) {
    bgEl.style.background = '';
    bgEl.style.backgroundImage = `url("${bgImg.src}")`;
  } else {
    bgEl.style.backgroundImage = '';
    bgEl.style.background = s.animated ? '' : (s.css || '');
  }
}
sceneSel.addEventListener('change', () => {
  applyScene();
  log(`env: scene <b>${esc(currentScene().name)}</b> <span class="sim-badge small">SIMULATOR</span>`);
});
$('env-upload').addEventListener('change', (e) => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    const img = new Image();
    img.onload = () => {
      bgImg = img; stopCam(); applyScene();
      log(`env: uploaded backdrop <b>${esc(f.name)}</b> <span class="t">(${img.naturalWidth}x${img.naturalHeight})</span> <span class="sim-badge small">SIMULATOR</span>`);
    };
    img.onerror = () => log('env: could not decode that image', 'ev-err');
    img.src = rd.result;
  };
  rd.readAsDataURL(f);
});
async function stopCam() {
  if (camStream) { camStream.getTracks().forEach((t) => t.stop()); camStream = null; }
  camEl.hidden = true; camEl.srcObject = null;
  $('env-cam').textContent = 'Webcam: off';
}
$('env-cam').addEventListener('click', async () => {
  if (camStream) { await stopCam(); applyScene(); log('env: webcam off'); return; }
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('getUserMedia unavailable');
    camStream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 600 }, height: { ideal: 600 } } });
    camEl.srcObject = camStream; camEl.hidden = false; bgImg = null;
    bgEl.classList.remove('animated');
    $('env-cam').textContent = 'Webcam: on';
    log('env: <b>live webcam</b> backdrop for real-world blending preview <span class="sim-badge small">SIMULATOR</span>');
  } catch (err) {
    log(`env: webcam unavailable (${esc(err.name || err.message)})`, 'ev-err');
  }
});
$('env-clear').addEventListener('click', async () => {
  bgImg = null; $('env-upload').value = ''; await stopCam(); applyScene();
  log('env: backdrop reset to scene');
});

/* ---------- display settings ---------- */
let autoDim = true, dimmed = false, dimTimer = null;
function applyDisplay() {
  const f = displayFilters({
    appBrightness: $('set-app').value / 100,
    bgBrightness: $('set-bg').value / 100,
    bgBlur: +$('set-blur').value,
    dimmed,
  });
  frameEl.style.filter = f.lensFilter;
  bgEl.style.filter = f.bgFilter;
  camEl.style.filter = f.bgFilter;
}
function poke() {
  if (dimmed) { dimmed = false; applyDisplay(); }
  clearTimeout(dimTimer);
  if (autoDim) {
    dimTimer = setTimeout(() => {
      dimmed = true; applyDisplay();
      log(`display: auto-dim engaged (app layer 35%, ${AUTO_DIM_MS / 1000}s idle) <span class="sim-badge small">SIMULATOR</span>`);
    }, AUTO_DIM_MS);
  }
}
for (const id of ['set-app', 'set-bg', 'set-blur']) {
  $(id).addEventListener('input', () => {
    $('set-app-v').textContent = `${$('set-app').value}%`;
    $('set-bg-v').textContent = `${$('set-bg').value}%`;
    $('set-blur-v').textContent = `${$('set-blur').value}px`;
    applyDisplay(); poke();
  });
}
$('set-dim').addEventListener('click', () => {
  autoDim = !autoDim;
  $('set-dim').textContent = `Auto-dim: ${autoDim ? 'on' : 'off'}`;
  if (!autoDim) { dimmed = false; clearTimeout(dimTimer); }
  applyDisplay(); poke();
});
['pointerdown', 'keydown', 'wheel'].forEach((ev) => document.addEventListener(ev, poke, { passive: true }));

/* ---------- D-pad ---------- */
document.querySelectorAll('[data-dpad]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const action = btn.getAttribute('data-dpad');
    let key;
    try { key = dpadKey(action); } catch (err) { log(`dpad: ${esc(err.message)}`, 'ev-err'); return; }
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    log(`dpad: <b>${esc(action)}</b> &rarr; key <b>${esc(key)}</b> <span class="sim-badge small">SIMULATOR</span>`, 'ev-state');
  });
});
// Glasses-style focus navigation: arrows move focus between controls (never inside text fields).
document.addEventListener('keydown', (e) => {
  const tag = ((e.target && e.target.tagName) || '').toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (e.key === 'Escape') { log('dpad: back (Escape) — no-op on the single-page lab'); return; }
  const dirs = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -1, ArrowRight: 1 };
  if (!(e.key in dirs)) return;
  const els = [...document.querySelectorAll('button:not([disabled]), select')]
    .filter((el) => el.offsetParent !== null);
  if (!els.length) return;
  e.preventDefault();
  let i = els.indexOf(document.activeElement);
  i = i === -1 ? 0 : (i + dirs[e.key] + els.length) % els.length;
  els[i].focus();
});

/* ---------- viewport recorder ---------- */
const recCanvas = document.createElement('canvas');
recCanvas.width = RECORDER.width; recCanvas.height = RECORDER.height;
const rctx = recCanvas.getContext('2d');
let recorder = null, recChunks = [], recRAF = 0, recImg = null, recImgKey = '', recLastDraw = 0;
function loadImg(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}
async function drawLensFrame() {
  if (camStream && !camEl.hidden && camEl.readyState >= 2) {
    rctx.drawImage(camEl, 0, 0, 600, 600);
  } else if (bgImg) {
    rctx.drawImage(bgImg, 0, 0, 600, 600);
  } else {
    rctx.fillStyle = currentScene().recordFill; // gradient scenes record over near-black (stated in UI)
    rctx.fillRect(0, 0, 600, 600);
  }
  const svg = hw && hw.lastFrame ? hw.lastFrame.svg : null;
  if (svg) {
    if (svg !== recImgKey) { recImgKey = svg; recImg = await loadImg(svgToDataUrl(svg)); }
    if (recImg) {
      rctx.save();
      rctx.globalCompositeOperation = 'screen'; // additive, like the waveguide
      rctx.drawImage(recImg, 0, 0, 600, 600);
      rctx.restore();
    }
  }
}
function recTick(ts) {
  if (!recorder || recorder.state !== 'recording') return;
  if (ts - recLastDraw >= 1000 / RECORDER.fps) { recLastDraw = ts; drawLensFrame().catch(() => {}); }
  recRAF = requestAnimationFrame(recTick);
}
$('rec-start').addEventListener('click', () => {
  try {
    if (typeof MediaRecorder === 'undefined' || !recCanvas.captureStream) {
      throw new Error('MediaRecorder/captureStream unavailable in this browser');
    }
    if (!MediaRecorder.isTypeSupported(RECORDER.mimeType)) throw new Error(`${RECORDER.mimeType} not supported here`);
  } catch (err) { log(`recorder: ${esc(err.message)}`, 'ev-err'); return; }
  recChunks = []; recImgKey = '';
  recorder = new MediaRecorder(recCanvas.captureStream(RECORDER.fps), { mimeType: RECORDER.mimeType });
  recorder.ondataavailable = (e) => { if (e.data && e.data.size) recChunks.push(e.data); };
  recorder.onstop = () => {
    cancelAnimationFrame(recRAF);
    const blob = new Blob(recChunks, { type: RECORDER.mimeType });
    const dl = $('rec-dl');
    dl.href = URL.createObjectURL(blob);
    dl.classList.remove('hidden');
    dl.textContent = `Download WebM (${(blob.size / 1024).toFixed(0)} KB)`;
    log(`recorder: stopped — ${(blob.size / 1024).toFixed(1)} KB WebM ready <span class="sim-badge small">SIMULATOR</span>`, 'ev-tool');
    $('rec-start').disabled = false; $('rec-stop').disabled = true;
  };
  recorder.start(250);
  $('rec-start').disabled = true; $('rec-stop').disabled = false;
  $('rec-dl').classList.add('hidden');
  log(`recorder: capturing 600x600 lens &rarr; WebM @${RECORDER.fps}fps <span class="sim-badge small">SIMULATOR</span>`);
  recRAF = requestAnimationFrame(recTick);
});
$('rec-stop').addEventListener('click', () => {
  if (recorder && recorder.state === 'recording') recorder.stop();
});

/* ---------- QA checklist ---------- */
function focusVisiblePresent() {
  try {
    for (const sh of document.styleSheets) {
      let rules;
      try { rules = sh.cssRules; } catch { continue; } // cross-origin sheet
      for (const r of rules) {
        if (r.selectorText && r.selectorText.includes(':focus-visible')) return true;
      }
    }
  } catch { /* unreadable styles */ }
  return false;
}
$('qa-run').addEventListener('click', () => {
  const lens = $('lens');
  const svg = hw && hw.lastFrame ? hw.lastFrame.svg : '';
  const sizes = [...svg.matchAll(/font-size="(\d+)"/g)].map((m) => +m[1]);
  const bodyPx = parseFloat(getComputedStyle(document.body).fontSize) || 0;
  const focusables = [...document.querySelectorAll('button:not([disabled]), select, input:not([type="hidden"])')]
    .filter((el) => el.offsetParent !== null);
  const dpBtn = document.querySelector('.dpad button');
  const checks = [
    ['Lens surface', qaLensSize(lens.clientWidth, lens.clientHeight)],
    ['No scroll', qaNoScroll({ scrollWidth: lens.scrollWidth, clientWidth: lens.clientWidth, scrollHeight: lens.scrollHeight, clientHeight: lens.clientHeight })],
    ['Additive backdrop', qaFrameBackdrop(svg)],
    ['D-pad focusables', qaFocusableCount(focusables.length)],
    ['Visible focus styles', qaFocusVisible(focusVisiblePresent() ? 3 : 0)],
    ['Type sizes', qaFontSizes({ bodyPx, primaryPx: sizes.length ? Math.max(...sizes) : 0 })],
    ['Favicon', qaFavicon((document.querySelector('link[rel="icon"]') || { href: '' }).href)],
    ['Tap targets', qaTapTarget({ w: dpBtn ? dpBtn.offsetWidth : 0, h: dpBtn ? dpBtn.offsetHeight : 0 })],
  ];
  const ul = $('qa-results');
  ul.innerHTML = '';
  let pass = 0, warn = 0;
  for (const [name, r] of checks) {
    const cls = r.pass ? 'pass' : (r.warn ? 'warn' : 'fail');
    if (r.pass) pass++; else if (r.warn) warn++;
    const li = document.createElement('li');
    li.className = cls;
    const extra = r.warn ? ' — lab chrome is desktop; on-lens controls must still be ≥88px' : '';
    li.innerHTML = `<b>${esc(name)}</b><span class="d">${esc(r.detail)}${esc(extra)}</span>`;
    ul.appendChild(li);
  }
  log(
    `qa: <b>${pass}/${checks.length} pass</b>${warn ? `, ${warn} advisory` : ''} <span class="sim-badge small">SIMULATOR</span>`,
    pass === checks.length ? 'ev-tool' : 'ev-decision',
  );
});

/* ---------- lab init ---------- */
applyScene();
applyDisplay();
poke();

selectBackend('meta-display');
