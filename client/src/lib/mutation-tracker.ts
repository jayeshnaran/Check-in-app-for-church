let activeMutations = 0;
let suppressUntil = 0;

const SUPPRESSION_WINDOW_MS = 500;

export function startMutation() {
  activeMutations++;
}

export function endMutation() {
  activeMutations = Math.max(0, activeMutations - 1);
  if (activeMutations === 0) {
    suppressUntil = Date.now() + SUPPRESSION_WINDOW_MS;
  }
}

export function shouldSuppressWsInvalidation(): boolean {
  return activeMutations > 0 || Date.now() < suppressUntil;
}
