import test from 'node:test';
import assert from 'node:assert/strict';
import { createReleaseVerification } from '../src/release-verification.js';

const result = () => ({
  rental: { id: 'bingo-booking' },
  item: { id: 'bingo-1', name: 'Bingo Set', item_code: 'BINGO-001' },
  booking_verified: true,
  inventory_verified: true,
  delivery_prepared: true,
});

function fixture() {
  const calls = [], states = [];
  const verification = createReleaseVerification({
    rentalId: 'bingo-booking',
    onChange: state => states.push(state),
    api: async (path, options) => {
      const input = JSON.parse(options.body);
      calls.push({ path, input });
      const expected = input.manualLookup ? 'R-BINGO' : 'booking-qr';
      if (input.transactionCode !== expected) throw new Error('Customer rental QR does not match.');
      return result();
    },
  });
  return { verification, calls, states };
}

test('the final handoff stays locked until the customer rental QR is verified', async () => {
  const { verification: v, calls } = fixture();
  assert.equal(await v.verifyBooking(), false);
  assert.equal(calls.length, 0);
  assert.throws(() => v.releaseCodes(), /Verify the customer rental QR/);

  v.update('transactionCode', 'another-booking');
  assert.equal(await v.verifyBooking(), false);
  assert.equal(v.snapshot().step, 1);
  assert.equal(v.snapshot().bookingVerified, false);
  assert.match(v.snapshot().error, /does not match/);

  v.update('transactionCode', 'booking-qr');
  assert.equal(await v.verifyBooking(), true);
  assert.equal(v.snapshot().step, 2);
  assert.equal(v.snapshot().bookingVerified, true);
  assert.equal(v.snapshot().inventoryVerified, true);
  assert.equal(v.snapshot().item.name, 'Bingo Set');
  assert.deepEqual(calls.at(-1).input, { transactionCode: 'booking-qr' });
  assert.deepEqual(v.releaseCodes(), { transactionCode: 'booking-qr' });
});

test('changing the customer code invalidates the previous verification', async () => {
  const { verification: v } = fixture();
  v.update('transactionCode', 'booking-qr');
  assert.equal(await v.verifyBooking(), true);
  v.update('transactionCode', 'another-booking');
  assert.equal(v.snapshot().step, 1);
  assert.equal(v.snapshot().bookingVerified, false);
  assert.equal(v.snapshot().inventoryVerified, false);
  await v.verifyBooking();
  assert.throws(() => v.releaseCodes());
});

test('manual lookup includes its reason and reason edits invalidate the verified rental', async () => {
  const { verification: v, calls } = fixture();
  v.update('manualLookup', true);
  v.update('transactionCode', 'R-BINGO');
  v.update('manualReason', 'Camera unavailable');
  assert.equal(await v.verifyBooking(), true);
  assert.deepEqual(calls.at(-1).input, {
    transactionCode: 'R-BINGO',
    manualLookup: true,
    manualReason: 'Camera unavailable',
  });
  assert.equal(v.releaseCodes().manualReason, 'Camera unavailable');

  v.update('manualReason', 'Different reason');
  assert.equal(v.snapshot().step, 1);
  assert.equal(v.snapshot().bookingVerified, false);
  assert.throws(() => v.releaseCodes());
});

test('a delayed response cannot unlock a code changed while verification is pending', async () => {
  let finish;
  const v = createReleaseVerification({
    rentalId: 'bingo-booking',
    api: () => new Promise(resolve => { finish = resolve; }),
  });
  v.update('transactionCode', 'booking-qr');
  const pending = v.verifyBooking();
  assert.equal(v.snapshot().busy, true);
  v.update('transactionCode', 'different-booking');
  finish(result());
  assert.equal(await pending, false);
  assert.equal(v.snapshot().bookingVerified, false);
  assert.equal(v.snapshot().step, 1);

  v.update('transactionCode', 'booking-qr');
  const closed = v.verifyBooking();
  v.dispose();
  finish(result());
  assert.equal(await closed, false);
  assert.equal(v.snapshot().bookingVerified, false);
});

test('going back requires a fresh QR verification before confirming release', async () => {
  const { verification: v } = fixture();
  v.update('transactionCode', 'booking-qr');
  assert.equal(await v.verifyBooking(), true);
  v.goBack();
  assert.equal(v.snapshot().step, 1);
  assert.throws(() => v.releaseCodes());
  assert.equal(await v.verifyBooking(), true);
  assert.deepEqual(v.releaseCodes(), { transactionCode: 'booking-qr' });
});
