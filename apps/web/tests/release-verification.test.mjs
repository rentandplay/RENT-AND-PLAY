import test from 'node:test';
import assert from 'node:assert/strict';
import { createReleaseVerification } from '../src/release-verification.js';

const result = inventory => ({ rental: { id: 'bingo-booking' }, item: { id: 'bingo-1', name: 'Bingo Set', item_code: 'BINGO-001' }, booking_verified: true, inventory_verified: inventory });
function fixture() {
  const calls = [], states = [];
  const verification = createReleaseVerification({ rentalId: 'bingo-booking', onChange: state => states.push(state), api: async (path, options) => {
    const input = JSON.parse(options.body); calls.push({ path, input });
    if (input.transactionCode !== (input.manualReason ? 'R-BINGO' : 'booking-qr')) throw new Error('Transaction QR does not match.');
    if (input.inventoryCode != null && input.inventoryCode !== (input.manualReason ? 'BINGO-001' : 'bingo-qr')) throw new Error('Equipment mismatch: expected Bingo Set (BINGO-001).');
    return result(input.inventoryCode != null);
  } });
  return { verification, calls, states };
}

test('the equipment step stays locked until the customer transaction QR is verified', async () => {
  const { verification: v, calls } = fixture();
  v.update('inventoryCode', 'bike-qr');
  assert.equal(await v.verifyInventory(), false); assert.equal(calls.length, 0);
  v.update('transactionCode', 'another-booking');
  assert.equal(await v.verifyBooking(), false);
  assert.equal(v.snapshot().step, 1); assert.equal(v.snapshot().bookingVerified, false);
  assert.throws(() => v.releaseCodes(), /Verify the transaction QR/);
  v.update('transactionCode', 'booking-qr');
  assert.equal(await v.verifyBooking(), true);
  assert.equal(v.snapshot().step, 2); assert.equal(v.snapshot().inventoryCode, '');
  assert.deepEqual(calls.at(-1).input, { transactionCode: 'booking-qr' });
});

test('a different item cannot unlock release; the matching unit enables the final step', async () => {
  const { verification: v } = fixture();
  v.update('transactionCode', 'booking-qr'); await v.verifyBooking();
  v.update('inventoryCode', 'bike-qr');
  assert.equal(await v.verifyInventory(), false);
  assert.equal(v.snapshot().step, 2); assert.equal(v.snapshot().inventoryVerified, false);
  assert.match(v.snapshot().error, /Bingo Set/); assert.throws(() => v.releaseCodes());
  v.update('inventoryCode', 'bingo-qr');
  assert.equal(await v.verifyInventory(), true);
  assert.equal(v.snapshot().step, 3);
  assert.deepEqual(v.releaseCodes(), { transactionCode: 'booking-qr', inventoryCode: 'bingo-qr' });
  v.update('transactionCode', 'changed-booking');
  assert.equal(v.snapshot().step, 1); assert.equal(v.snapshot().inventoryCode, '');
  assert.equal(v.snapshot().bookingVerified, false); assert.throws(() => v.releaseCodes());
});

test('manual fallback requires typed matching codes and a reason, and reason changes invalidate both steps', async () => {
  const { verification: v, calls } = fixture();
  v.update('manualLookup', true);
  assert.equal(v.snapshot().transactionCode, ''); assert.equal(v.snapshot().inventoryCode, '');
  v.update('transactionCode', 'R-BINGO');
  assert.equal(await v.verifyBooking(), false); assert.equal(calls.length, 0);
  v.update('manualReason', 'Camera unavailable'); await v.verifyBooking();
  v.update('inventoryCode', 'BINGO-001'); await v.verifyInventory();
  assert.equal(v.releaseCodes().manualReason, 'Camera unavailable');
  v.update('manualReason', 'Different reason');
  assert.equal(v.snapshot().step, 1); assert.equal(v.snapshot().inventoryVerified, false);
  assert.throws(() => v.releaseCodes());
});

test('a delayed validation response cannot unlock a code that changed while the request was pending', async () => {
  let finish;
  const v = createReleaseVerification({ rentalId: 'bingo-booking', api: () => new Promise(resolve => { finish = resolve; }) });
  v.update('transactionCode', 'booking-qr');
  const pending = v.verifyBooking(); assert.equal(v.snapshot().busy, true);
  v.update('transactionCode', 'different-booking');
  finish(result(false)); assert.equal(await pending, false);
  assert.equal(v.snapshot().bookingVerified, false); assert.equal(v.snapshot().step, 1);
  v.update('transactionCode', 'booking-qr');
  const closed = v.verifyBooking(); v.dispose(); finish(result(false));
  assert.equal(await closed, false); assert.equal(v.snapshot().bookingVerified, false);
});

test('replacing the inventory code or going back requires validation before confirming release', async () => {
  const { verification: v } = fixture();
  v.update('transactionCode', 'booking-qr'); await v.verifyBooking();
  v.update('inventoryCode', 'bingo-qr'); await v.verifyInventory();
  v.goBack(); assert.equal(v.snapshot().step, 2); assert.throws(() => v.releaseCodes());
  v.update('inventoryCode', 'another-bingo-unit');
  assert.equal(v.snapshot().bookingVerified, true); assert.equal(v.snapshot().inventoryVerified, false);
  assert.equal(await v.verifyInventory(), false); assert.throws(() => v.releaseCodes());
});
