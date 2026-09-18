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
