import test from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../src/server.mjs';

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
