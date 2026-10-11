import { firebaseFailure, isQuotaError } from './firebase-errors.mjs';

// A committed change wakes the worker immediately. Idle/recovery checks share
// one timer, and a wake during an in-flight read queues another pass.
export function createBackgroundWorker(run, {
  intervalMs = 60000, idleIntervalMs = 300000, now = Date.now,
  setTimer = setTimeout, clearTimer = clearTimeout, onError = () => {}
} = {}) {
  let timer = null, running = false, requested = false, stopped = false;
  let failures = 0, retryAt = 0;
  const schedule = delay => {
    if (stopped) return;
    if (timer !== null) clearTimer(timer);
    timer = setTimer(tick, Math.max(0, delay));
    timer?.unref?.();
  };
  async function tick() {
    timer = null;
    if (stopped || running) return;
    if (now() < retryAt) { schedule(retryAt - now()); return; }
    requested = false;
    running = true;
    let nextAt;
    try {
      const result = await run();
      failures = 0;
      retryAt = 0;
      nextAt = Number.isFinite(result?.nextRunAt) ? result.nextRunAt
        : now() + (result?.hasMore ? 1000 : result?.processed ? intervalMs : idleIntervalMs);
    } catch (error) {
      failures++;
      retryAt = now() + (isQuotaError(error) ? firebaseFailure(error).retryAfterSeconds * 1000
        : Math.min(idleIntervalMs, intervalMs * 2 ** Math.min(failures, 10)));
      nextAt = retryAt;
      onError(error);
    } finally {
      running = false;
      if (!stopped) schedule(Math.max(retryAt, requested ? now() : nextAt) - now());
    }
  }
  return {
    wake() { if (stopped) return; requested = true; if (!running) schedule(retryAt - now()); },
    stop() { stopped = true; if (timer !== null) clearTimer(timer); timer = null; }
  };
}
