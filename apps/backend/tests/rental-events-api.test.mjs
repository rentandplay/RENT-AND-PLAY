import test from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../src/server.mjs';
import { createFirebaseServices } from '../src/server.mjs';
import { memoryFirestore } from './support/memory-firestore.mjs';

test('counter rental mutations publish a safe live event to authenticated staff', async () => {
  const user = { id: 'operator-1', full_name: 'Test Operator', role: 'OPERATOR', is_active: true };
  const sessions = {
    verify: async token => token === 'staff-cookie' ? { uid: user.id } : null
  };
  const services = {
    getUser: async id => id === user.id ? user : null,
    createCounterBooking: async () => ({ rental: { id: 'rental-42', customer_id: 'customer-7' } })
  };
  const server = createApi({ services, sessions, expiryWorker: false, notificationWorker: false });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let reader;
  try {
    const stream = await fetch(`${base}/api/rental-events`, { headers: { Cookie: 'rent_play_session=staff-cookie' } });
    assert.equal(stream.status, 200);
    reader = stream.body.getReader();
    const ready = await reader.read();
    assert.match(new TextDecoder().decode(ready.value), /event: ready/);

    const response = await fetch(`${base}/api/rental-bookings`, {
      method: 'POST',
      headers: { Cookie: 'rent_play_session=staff-cookie', 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId: 'customer-7' })
    });
    assert.equal(response.status, 201);
    const update = await reader.read();
    const frame = new TextDecoder().decode(update.value);
    assert.match(frame, /event: rental\.changed/);
    assert.match(frame, /"rentalId":"rental-42"/);
    assert.doesNotMatch(frame, /customer-7/);
  } finally {
    await reader?.cancel();
    await new Promise(resolve => server.close(resolve));
  }
});

test('committed rental changes wake push delivery immediately; verification reads do not emit updates', async () => {
  const user = { id: 'operator', role: 'OPERATOR', is_active: true };
  let firstDispatch, nextDispatch, dispatches = 0;
  const initial = new Promise(resolve => { firstDispatch = resolve; });
  const delivered = new Promise(resolve => { nextDispatch = resolve; });
  const rental = { id: 'rental-1', customer_id: 'customer' };
  const server = createApi({ notificationWorker: true, expiryWorker: false,
    sessions: { verify: async () => ({ uid: user.id }) },
    services: {
      getUser: async () => user,
      verifyReleaseCodes: async () => ({ rental }),
      releaseBooking: async () => ({ rental }),
      dispatchNotifications: async () => { if (++dispatches === 1) firstDispatch(); else nextDispatch(); return { processed: 0 }; }
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const headers = { Cookie: 'rent_play_session=cookie', 'Content-Type': 'application/json' };
  let reader, timeout;
  try {
    await initial;
    reader = (await fetch(base + '/rental-events', { headers })).body.getReader();
    await reader.read();
    assert.equal((await fetch(base + '/rentals/rental-1/release-verification', { method: 'POST', headers, body: '{}' })).status, 200);
    assert.equal(dispatches, 1);
    assert.equal((await fetch(base + '/rentals/rental-1/release', { method: 'POST', headers, body: '{}' })).status, 200);
    await Promise.race([delivered, new Promise((_, reject) => { timeout = setTimeout(() => reject(Error('Push was not woken by the commit.')), 2000); })]);
    assert.equal(dispatches, 2);
    const frame = new TextDecoder().decode((await reader.read()).value);
    assert.match(frame, /event: rental\.changed/);
    assert.match(frame, /"revision":1/);
  } finally {
    clearTimeout(timeout);
    await reader?.cancel();
    await new Promise(resolve => server.close(resolve));
  }
});

test('an expiry discovered by a staff read updates both web and mobile without a worker tick', async () => {
  let clock = new Date('2026-10-07T02:00:00Z');
  const db = memoryFirestore({ users: {
    operator: { role: 'OPERATOR', is_active: true }, customer: { role: 'CUSTOMER', is_active: true }
  }, customers: { customer: { full_name: 'Customer' } },
    items: { bike: { name: 'Bike', status: 'RESERVED_PENDING', reserved_rental_id: 'rental-1' } },
    rentals: { 'rental-1': { status: 'APPROVED', customer_id: 'customer', item_id: 'bike', rental_fee: 50,
      hold_expires_at: new Date(clock.getTime() + 15000) } }
  });
  const services = createFirebaseServices({ db, now: () => clock, auth: { verifyIdToken: async token => ({ uid: token }) } });
  const server = createApi({ services, expiryWorker: false, notificationWorker: false,
    sessions: { verify: async () => ({ uid: 'operator' }) }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const staffHeaders = { Cookie: 'rent_play_session=cookie' }, mobileHeaders = { Authorization: 'Bearer customer' };
  const readers = [];
  try {
    for (const headers of [staffHeaders, mobileHeaders]) {
      const response = await fetch(base + '/rental-events', { headers });
      assert.equal(response.status, 200);
      const reader = response.body.getReader(); readers.push(reader); await reader.read();
    }
    assert.equal((await fetch(base + '/dashboard', { headers: staffHeaders })).status, 200);
    clock = new Date(clock.getTime() + 15000);
    assert.equal((await fetch(base + '/dashboard', { headers: staffHeaders })).status, 200);
    for (const reader of readers) {
      const frame = new TextDecoder().decode((await reader.read()).value);
      assert.match(frame, /event: rental\.changed/); assert.match(frame, /"rentalId":"rental-1"/);
      assert.doesNotMatch(frame, /"customerId"/);
    }
    const response = await fetch(base + '/mobile/rentals/rental-1', { headers: mobileHeaders });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).rental.status, 'EXPIRED');
    const inbox = await (await fetch(base + '/notifications', { headers: mobileHeaders })).json();
    assert.equal(inbox.notifications[0].type, 'BOOKING_EXPIRED');
  } finally {
    for (const reader of readers) await reader.cancel();
    await new Promise(resolve => server.close(resolve));
  }
});
