import test from 'node:test';
import assert from 'node:assert/strict';
import { saveAnalyticsSettings, loadWorkspace } from '../src/workspace.mjs';
import { createApi } from '../src/server.mjs';
import { memoryFirestore } from './support/memory-firestore.mjs';

test('analytics goals persist with attribution, atomic audit, explicit clearing and partial updates', async () => {
  const db = memoryFirestore({ settings: { business: { business_name: 'Rent & Play', currency: 'PHP' } } });
  const now = new Date('2026-11-13T04:00:00Z');
  const result = await saveAnalyticsSettings(db, 'owner', {
    monthly_fee_goal: '12000.50', monthly_rental_goal: '80', utilization_goal: '.35', overdue_rate_alert: '0'
  }, now);
  assert.equal(result.business_name, 'Rent & Play');
  assert.deepEqual(result.analytics_targets, { monthly_fee_goal: 12000.5, monthly_rental_goal: 80, utilization_goal: .35, overdue_rate_alert: 0 });
  assert.equal(result.analytics_targets_updated_by, 'owner');
  assert.equal(result.analytics_targets_updated_at.toISOString(), now.toISOString());
  const log = db.records('audit_logs')[0];
  assert.equal(log.action, 'ANALYTICS_TARGETS_UPDATED');
  assert.equal(log.new_values.monthly_fee_goal, 12000.5);
  assert.equal(log.old_values.monthly_fee_goal, null);
  const cleared = await saveAnalyticsSettings(db, 'owner', { monthly_fee_goal: '  ', utilization_goal: null }, now);
  assert.deepEqual(cleared.analytics_targets, { monthly_fee_goal: null, monthly_rental_goal: 80, utilization_goal: null, overdue_rate_alert: 0 });
  assert.equal(db.data('settings', 'business').currency, 'PHP');
  const workspace = await loadWorkspace(db, 'OWNER', now);
  assert.deepEqual(workspace.settings.analytics_targets, cleared.analytics_targets);
});

test('analytics goals reject malformed, unknown, nonfinite and out-of-range values without writes', async () => {
  const db = memoryFirestore();
  const invalid = [null, [], {}, { surprise: 1 }, { monthly_fee_goal: 0 }, { monthly_fee_goal: -1 },
    { monthly_fee_goal: 12.345 }, { monthly_fee_goal: Infinity }, { monthly_fee_goal: true },
    { monthly_rental_goal: 1.5 }, { monthly_rental_goal: 0 }, { monthly_rental_goal: {} },
    { utilization_goal: 0 }, { utilization_goal: 1.01 }, { overdue_rate_alert: -.1 },
    { overdue_rate_alert: 1.1 }, { overdue_rate_alert: 'not a number' }];
  for (const input of invalid) await assert.rejects(saveAnalyticsSettings(db, 'owner', input), error => error.status === 400);
  assert.equal(db.data('settings', 'business'), undefined);
  assert.equal(db.records('audit_logs').length, 0);
  const saved = await saveAnalyticsSettings(db, 'owner', { utilization_goal: 1, overdue_rate_alert: 1 });
  assert.equal(saved.analytics_targets.utilization_goal, 1);
  assert.equal(saved.analytics_targets.monthly_fee_goal, null);
});

test('analytics target update fails atomically when its audit transaction fails', async () => {
  const db = memoryFirestore({ settings: { business: { analytics_targets: { monthly_fee_goal: 100 } } } });
  const transaction = db.runTransaction.bind(db);
  db.runTransaction = callback => transaction(tx => callback({ ...tx, create: () => { throw Error('Commit rejected'); } }));
  await assert.rejects(saveAnalyticsSettings(db, 'owner', { monthly_fee_goal: 200 }), /Commit rejected/);
  assert.equal(db.data('settings', 'business').analytics_targets.monthly_fee_goal, 100);
  assert.equal(db.records('audit_logs').length, 0);
});

test('concurrent partial goal changes preserve both updates and audit their committed before state', async () => {
  const db = memoryFirestore();
  await Promise.all([
    saveAnalyticsSettings(db, 'owner-one', { monthly_fee_goal: 12000 }),
    saveAnalyticsSettings(db, 'owner-two', { monthly_rental_goal: 100 })
  ]);
  assert.deepEqual(db.data('settings', 'business').analytics_targets, { monthly_fee_goal: 12000, monthly_rental_goal: 100, utilization_goal: null, overdue_rate_alert: null });
  const audits = db.records('audit_logs');
  assert.equal(audits.length, 2);
  assert.equal(audits[1].old_values.monthly_fee_goal, 12000);
  assert.equal(audits[1].new_values.monthly_fee_goal, 12000);
});

test('analytics settings API requires an active owner session and rejects foreign origins', async () => {
  const db = memoryFirestore();
  const user = { id: 'owner-id', full_name: 'Owner Test', email: 'owner@example.test', role: 'OPERATOR', is_active: true };
  let writes = 0;
  const services = { getUser: async () => user, touchLogin: async () => {}, saveAnalyticsSettings: async (actor, input) => {
    writes++; return saveAnalyticsSettings(db, actor, input);
  } };
  const sessions = { signIn: async () => ({ uid: user.id, cookie: 'owner-session', seconds: 3600 }), verify: async token => token === 'owner-session' ? { uid: user.id } : null };
  const server = createApi({ services, sessions });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const patch = headers => fetch(base + '/api/settings/analytics', { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ monthly_fee_goal: 5000 }) });
    assert.equal((await patch()).status, 401);
    const login = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email, password: 'long-enough-password9' }) });
    assert.equal(login.status, 200);
    const Cookie = login.headers.get('set-cookie').split(';')[0];
    assert.equal((await patch({ Cookie })).status, 403);
    assert.equal(writes, 0);
    user.role = 'OWNER';
    assert.equal((await patch({ Cookie, Origin: 'https://untrusted.example' })).status, 403);
    assert.equal(writes, 0);
    const saved = await patch({ Cookie });
    assert.equal(saved.status, 200);
    assert.equal((await saved.json()).settings.analytics_targets.monthly_fee_goal, 5000);
    assert.equal(writes, 1);
    user.is_active = false;
    assert.equal((await patch({ Cookie })).status, 401);
    assert.equal(writes, 1);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
