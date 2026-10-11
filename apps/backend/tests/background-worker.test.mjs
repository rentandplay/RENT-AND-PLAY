import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackgroundWorker } from '../src/background-worker.mjs';
import { createExpirySweep } from '../src/transactions.mjs';
import { createNotificationDispatcher } from '../src/notifications.mjs';
import { memoryFirestore } from './support/memory-firestore.mjs';

function timers() {
  let current = 0, sequence = 0;
  const jobs = new Map();
  return {
    now: () => current,
    setTimer(callback, delay) { const id = ++sequence; jobs.set(id, { callback, at: current + delay }); return id; },
    clearTimer: id => jobs.delete(id),
    async advance(to) {
      while (true) {
        const entry = [...jobs].filter(([, job]) => job.at <= to).sort((a, b) => a[1].at - b[1].at)[0];
        if (!entry) break;
        jobs.delete(entry[0]); current = entry[1].at; await entry[1].callback();
      }
      current = to;
    },
    fire() {
      const [id, job] = [...jobs][0];
      jobs.delete(id); current = job.at; return job.callback();
    },
    get nextAt() { return Math.min(...[...jobs.values()].map(job => job.at)); }
  };
}

test('idle workers check every five minutes and committed changes wake them immediately', async () => {
  const clock = timers(); let calls = 0;
  const worker = createBackgroundWorker(async () => { calls++; return { processed: 0 }; }, clock);
  worker.wake(); await clock.advance(0);
  assert.equal(calls, 1); assert.equal(clock.nextAt, 300000);
  await clock.advance(10000); worker.wake(); worker.wake(); await clock.advance(10000);
  assert.equal(calls, 2); assert.equal(clock.nextAt, 310000);
  worker.stop(); await clock.advance(1000000); assert.equal(calls, 2);
});

test('a change arriving during an in-flight dispatch gets another pass and cannot be lost', async () => {
  const clock = timers(); let finish, calls = 0;
  const worker = createBackgroundWorker(() => ++calls === 1 ? new Promise(resolve => { finish = resolve; }) : { processed: 1 }, clock);
  worker.wake(); const running = clock.fire();
  worker.wake(); worker.wake(); assert.equal(calls, 1);
  finish({ processed: 0 }); await running; await clock.advance(0);
  assert.equal(calls, 2); assert.equal(clock.nextAt, 60000); worker.stop();
});

test('deadline and backlog schedules remain timely, and a wake cannot defeat quota backoff', async () => {
  const clock = timers(); let calls = 0;
  const worker = createBackgroundWorker(async () => {
    calls++;
    if (calls === 1) return { nextRunAt: 12000 };
    if (calls === 2) return { hasMore: true };
    if (calls === 3) throw Object.assign(Error('Quota exceeded'), { code: 8 });
    return { processed: 0 };
  }, clock);
  worker.wake(); await clock.advance(0); assert.equal(clock.nextAt, 12000);
  await clock.advance(12000); assert.equal(clock.nextAt, 13000);
  await clock.advance(13000); assert.equal(clock.nextAt, 313000);
  worker.wake(); await clock.advance(312999); assert.equal(calls, 3);
  await clock.advance(313000); assert.equal(calls, 4); worker.stop();
});

test('a simulated idle day uses 1152 expiry/outbox queries instead of 5760 minute checks', async () => {
  const clock = timers(), raw = memoryFirestore(); let reads = 0;
  const wrap = query => new Proxy(query, { get(target, key) {
    if (key === 'get') return async () => { reads++; return target.get(); };
    if (['where', 'orderBy', 'limit'].includes(key)) return (...args) => wrap(target[key](...args));
    return target[key];
  } });
  const db = { ...raw, collection: name => wrap(raw.collection(name)) };
  const sweep = createExpirySweep(db, { ...clock, idleIntervalMs: 300000 });
  const dispatcher = createNotificationDispatcher(db, {}, { now: () => new Date(clock.now()) });
  const workers = [createBackgroundWorker(() => sweep.run(), clock), createBackgroundWorker(() => dispatcher.run(), clock)];
  for (const worker of workers) worker.wake();
  await clock.advance(86400000 - 1);
  assert.equal(reads, 1152);
  for (const worker of workers) worker.stop();
});
