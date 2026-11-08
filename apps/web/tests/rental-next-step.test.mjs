import test from 'node:test';
import assert from 'node:assert/strict';
import { nextRentalStep, renderRentalTaskProgress } from '../src/rental-desk.js';

test('the rental journey resumes from server state through preparation, delivery and result', () => {
  assert.equal(nextRentalStep({ status: 'APPROVED', delivery_status: 'NOT_PREPARED' }), 'prepare');
  for (const delivery_status of ['PREPARED', 'OUT_FOR_DELIVERY']) {
    assert.equal(nextRentalStep({ status: 'APPROVED', delivery_status }), 'handover');
  }
  assert.equal(nextRentalStep({ status: 'ACTIVE', balance_due: 100 }), 'details');
  assert.equal(nextRentalStep({ status: 'RETURN_PENDING_INSPECTION' }), 'inspect');
  assert.equal(nextRentalStep({ status: 'COMPLETED', balance_due: 100 }), 'settle');
  assert.equal(nextRentalStep({ status: 'CANCELLED', refund_due: 100 }), 'settle');
  assert.equal(nextRentalStep({ status: 'COMPLETED', balance_due: 0, refund_due: 0 }), 'details');
});

test('delivery and shop pickup show the appropriate steps and one current task', () => {
  const delivery = renderRentalTaskProgress({ fulfillment_mode: 'DELIVERY' }, 'handover');
  assert.match(delivery, /Deliver equipment/);
  assert.match(delivery, /Step 3 of 4/);
  assert.equal((delivery.match(/aria-current="step"/g) || []).length, 1);
  const pickup = renderRentalTaskProgress({ fulfillment_mode: 'SHOP_HANDOVER' }, 'released');
  assert.doesNotMatch(pickup, /Shop departure/);
  assert.match(pickup, /Step 4 of 4/);
  assert.match(pickup, /Released complete/);
});
