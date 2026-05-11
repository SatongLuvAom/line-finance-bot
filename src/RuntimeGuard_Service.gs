/**
 * RuntimeGuard_Service.gs
 * Guard long-running Apps Script work from reaching hard runtime timeout.
 */

var CURRENT_RUNTIME_GUARD_ = null;

function createRuntimeGuard(maxMs) {
  const safeMaxMs = Math.max(
    60000,
    Math.min(Number(maxMs || RUNTIME_GUARD_DEFAULT_MAX_MS), RUNTIME_GUARD_DEFAULT_MAX_MS)
  );
  CURRENT_RUNTIME_GUARD_ = {
    startedAtMs: Date.now(),
    maxMs: safeMaxMs,
    stopBufferMs: RUNTIME_GUARD_STOP_BUFFER_MS
  };
  return CURRENT_RUNTIME_GUARD_;
}

function shouldStopSoon(guard) {
  const safeGuard = guard || CURRENT_RUNTIME_GUARD_ || createRuntimeGuard();
  return getRemainingMs(safeGuard) <= Number(safeGuard.stopBufferMs || RUNTIME_GUARD_STOP_BUFFER_MS);
}

function getElapsedMs(guard) {
  const safeGuard = guard || CURRENT_RUNTIME_GUARD_;
  if (!safeGuard) return 0;
  return Math.max(0, Date.now() - Number(safeGuard.startedAtMs || Date.now()));
}

function getRemainingMs(guard) {
  const safeGuard = guard || CURRENT_RUNTIME_GUARD_;
  if (!safeGuard) return RUNTIME_GUARD_DEFAULT_MAX_MS;
  return Math.max(0, Number(safeGuard.maxMs || RUNTIME_GUARD_DEFAULT_MAX_MS) - getElapsedMs(safeGuard));
}

function assertCanContinue(stepName, guard) {
  if (shouldStopSoon(guard)) {
    const err = new Error("PROCESSING_PAUSED: runtime guard stopped before " + String(stepName || "next_step"));
    err.isRuntimeGuardStop = true;
    err.stepName = String(stepName || "");
    throw err;
  }
  return true;
}
