/**
 * states.js — Canonical avatar states + legal transition table.
 * Mirrors spec/INTERFACES.md §2 exactly. Amendments only via coordinator.
 */
export const AvatarState = Object.freeze({
  IDLE: 'idle',
  LISTENING: 'listening',
  THINKING: 'thinking',
  SPEAKING: 'speaking',
  CONFIRMING: 'confirming',
});

/** Legal directed transitions. "any -> idle" is enforced separately. */
export const LEGAL_TRANSITIONS = Object.freeze({
  [AvatarState.IDLE]: [AvatarState.LISTENING],
  [AvatarState.LISTENING]: [AvatarState.THINKING],
  [AvatarState.THINKING]: [AvatarState.SPEAKING, AvatarState.CONFIRMING],
  [AvatarState.SPEAKING]: [AvatarState.IDLE],
  [AvatarState.CONFIRMING]: [AvatarState.THINKING, AvatarState.IDLE],
});

export function isLegalTransition(from, to) {
  if (to === AvatarState.IDLE) return true; // any -> idle (error / timeout / disconnect)
  const allowed = LEGAL_TRANSITIONS[from];
  return Array.isArray(allowed) && allowed.includes(to);
}

export function legalTargets(from) {
  const set = new Set(LEGAL_TRANSITIONS[from] || []);
  set.add(AvatarState.IDLE);
  return [...set];
}
