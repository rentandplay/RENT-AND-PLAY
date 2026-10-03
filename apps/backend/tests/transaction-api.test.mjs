import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createApi } from '../src/server.mjs';
import { authenticateTerminal, createRentalRequest, resolveTerminalRequest, saveRequestInspection, terminalPending } from '../src/transactions.mjs';
import { memoryFirestore } from './support/memory-firestore.mjs';

test('API allows authenticated request preparation but requires device authentication for finalization', async () => {
  const actor = { id: 'admin', full_name: 'Inspector', role: 'ADMIN', is_active: true }, now = new Date(), key = 'test-device-key-123456789012345678901234567890';
  const db = memoryFirestore({ users: { admin: actor }, items: { item: { name: 'Cards', status: 'AVAILABLE', is_active: true } }, customers: { customer: { full_name: 'Customer' } }, terminals: { terminal: { terminal_code: 'TERM-1', is_active: true, auth_token_hash: createHash('sha256').update(key).digest('hex') } }, item_rates: { rate: { item_id: 'item', rate_type: 'HOURLY', rental_rate: 50, deposit_amount: 20, late_penalty_rate: 10, effective_from: new Date(now.getTime() - 1000), is_active: true } } });
  const services = {
    getUser: async () => actor,
    authenticateTerminal: (id, token) => authenticateTerminal(db, id, token),
    createRentalRequest: (user, input) => createRentalRequest(db, user, input, now),
    saveRequestInspection: (user, id, input) => saveRequestInspection(db, user, id, input, now),
    terminalPending: terminal => terminalPending(db, terminal, now),
    terminalConfirm: (terminal, input) => resolveTerminalRequest(db, terminal, input, new Date(now.getTime() + 1000)),
    verifyMobileToken: async token => token === 'mobile-admin-token' ? { uid: actor.id } : null
  };
  const server = createApi({ services, sessions: { verify: async token => token === 'admin-cookie' ? { uid: actor.id } : null } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = (path, method = 'GET', input, headers = {}) => fetch(origin + path, { method, headers: { 'Content-Type': 'application/json', ...headers }, ...(input ? { body: JSON.stringify(input) } : {}) });
  try {
    assert.equal((await request('/api/rentals', 'POST', {})).status, 401);
    const payload = { itemId: 'item', customerId: 'customer', terminalId: 'terminal', durationMinutes: 60 };
    const created = await request('/api/rentals', 'POST', payload, { Authorization: 'Bearer mobile-admin-token' }); assert.equal(created.status, 201);
    const value = await created.json();
    const inspected = await request(`/api/verification-requests/${value.request.id}/inspection`, 'PUT', { condition: 'GOOD', result: 'AVAILABLE', notes: 'All cards counted.', revision: 0, inspected_by: 'spoofed' }, { Cookie: 'rent_play_session=admin-cookie' });
    assert.equal(inspected.status, 200); assert.equal((await inspected.json()).request.inspection.inspected_by, actor.id);
    const confirm = { requestId: value.request.id, verificationCode: value.request.verification_code, inspectionRevision: 1, button: 'OK' };
    assert.equal((await request('/api/terminals/terminal/confirm', 'POST', confirm, { Cookie: 'rent_play_session=admin-cookie' })).status, 401);
    assert.equal((await request('/api/terminals/terminal/confirm', 'POST', confirm, { Authorization: 'Bearer mobile-admin-token' })).status, 401);
    assert.equal((await request('/api/terminals/terminal/pending', 'GET', null, { Cookie: 'rent_play_session=admin-cookie' })).status, 401);
    assert.equal((await request('/api/terminals/terminal/confirm', 'POST', { ...confirm, button: 'WEB' }, { Authorization: `Bearer ${key}` })).status, 400);
    const pending = await request('/api/terminals/terminal/pending', 'GET', null, { Authorization: `Bearer ${key}` }); assert.equal(pending.status, 200); assert.equal((await pending.json()).requests.length, 1);
    const done = await request('/api/terminals/terminal/confirm', 'POST', confirm, { Authorization: `Bearer ${key}` }); assert.equal(done.status, 200); assert.equal((await done.json()).status, 'CONFIRMED');
    const repeated = await request('/api/terminals/terminal/confirm', 'POST', confirm, { Authorization: `Bearer ${key}` }); assert.equal((await repeated.json()).duplicate, true);
    assert.equal((await request('/api/rentals', 'PATCH', { status: 'ACTIVE' }, { Cookie: 'rent_play_session=admin-cookie' })).status, 405);
    assert.equal(db.records('item_condition_records').length, 1); assert.equal(db.data('items', 'item').status, 'RENTED');
  } finally { await new Promise(resolve => server.close(resolve)); }
});
