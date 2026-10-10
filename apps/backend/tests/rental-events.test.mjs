import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRentalEventHub } from '../src/rental-events.mjs';

class FakeResponse extends EventEmitter {
  chunks = [];
  writableEnded = false;
  destroyed = false;
  headers = {};
  writeHead(status, headers) { this.status = status; this.headers = headers; }
  flushHeaders() {}
  write(chunk) { this.chunks.push(chunk); return true; }
  end() { this.writableEnded = true; this.emit('close'); }
  get text() { return this.chunks.join(''); }
}

test('rental events reach staff and only the matching customer', () => {
  const hub = createRentalEventHub({ heartbeatMs: 60000 });
  const owner = new FakeResponse();
  const customerA = new FakeResponse();
  const customerB = new FakeResponse();
  hub.subscribe(owner, { uid: 'owner-1', staff: true });
  hub.subscribe(customerA, { uid: 'customer-a', staff: false });
  hub.subscribe(customerB, { uid: 'customer-b', staff: false });

  const revision = hub.publishRental({ rentalId: 'rental-42', customerId: 'customer-a' });

  assert.equal(revision, 1);
  assert.match(owner.text, /event: ready/);
  assert.match(owner.text, /event: rental\.changed\ndata: .*"rentalId":"rental-42"/);
  assert.match(customerA.text, /event: rental\.changed/);
  assert.doesNotMatch(customerB.text, /event: rental\.changed/);
  hub.publishRental({ allCustomers: true });
  assert.match(customerB.text, /event: rental\.changed/);
  assert.doesNotMatch(customerB.text, /customer-a/);
  assert.equal(hub.subscriberCount, 3);

  hub.close();
  assert.equal(hub.subscriberCount, 0);
  assert.equal(owner.writableEnded, true);
  assert.equal(customerA.writableEnded, true);
  assert.equal(customerB.writableEnded, true);
});
