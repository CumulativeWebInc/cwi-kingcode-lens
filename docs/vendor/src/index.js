/**
 * KingCode Lens — invocable on-eyewear agent ("Hey KingCode").
 * Public surface. Everything here runs in Node and in the browser demo
 * (ESM, zero dependencies).
 */
export { AdapterError } from './errors.js';
export { AvatarState, LEGAL_TRANSITIONS, isLegalTransition, legalTargets } from './states.js';
export { AvatarStateMachine } from './avatar-state-machine.js';
export { AvatarRenderer } from './avatar-renderer.js';
export {
  HardwareAdapter,
  SimulatedTransportAdapter,
  BrilliantLabsAdapter,
  MetaDisplayAdapter,
  AndroidXRAdapter,
} from './adapters.js';
export { WakeDetector } from './wake.js';
export { STTAdapter } from './stt.js';
export { TTSAdapter } from './tts.js';
export { DecisionAdapter } from './decision.js';
export { SessionStore, ToolRegistry, defaultEyewearTools } from './session.js';
export { ActivationSequencer } from './sequencer.js';
export {
  LENS,
  DPAD_KEY,
  dpadKey,
  AUTO_DIM_MS,
  AUTO_DIM_LEVEL,
  clamp01,
  displayFilters,
  additiveBlendMode,
  hexToRgb,
  relativeLuminance,
  isDarkForAdditive,
  ENV_SCENES,
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
  DISPLAY_FRAME,
  displayFrameStyle,
  PERF,
  gradePerfBand,
  qaPerformance,
} from './sim-lab.js';
