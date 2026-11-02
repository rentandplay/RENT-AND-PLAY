import test from 'node:test';
import assert from 'node:assert/strict';
import { FirebaseSessions } from '../src/auth.mjs';
import { inspectPaymentImage } from '../src/payment-proof.mjs';
import { createBooking, reviewBooking, prepareRentalDelivery, verifyReleaseCodes, rentalTicket, rentalPaymentProof } from '../src/rental-flow.mjs';
import { listSecurityAlerts } from '../src/notifications.mjs';
import { DEFAULT_PRICING } from '../src/pricing.mjs';
import { memoryFirestore } from './support/memory-firestore.mjs';

const now = new Date('2026-10-06T02:00:00Z');
const after = minutes => new Date(now.getTime() + minutes * 60000);
const key = hexChar => hexChar.repeat(32);

function createCleanPngDataUrl(seedByte = 1) {
  const bytes = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    seedByte, 0x01, 0x02, 0x03
  ]);
  return `data:image/png;base64,${bytes.toString('base64')}`;
}

function createEditedPngDataUrl() {
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const meta = Buffer.from('Software: Adobe Photoshop CC 2026 (Windows)', 'latin1');
  return `data:image/png;base64,${Buffer.concat([header, meta]).toString('base64')}`;
}

function fixture() {
  const admin = { id: 'admin', full_name: 'Inspector', role: 'ADMIN', is_active: true };
  const customer = { id: 'customer', full_name: 'Customer', role: 'USER', is_active: true };
  return memoryFirestore({
    users: { admin, customer },
    customers: { customer: { ...customer, auth_uid: customer.id } },
    settings: {
      business: {
        default_late_grace_hours: 0,
        instapay_qr_data_url: createCleanPngDataUrl(9),
        instapay_account_name: 'Rent and Play Shop',
        instapay_account_number: '09171234567'
      },
      pricing: structuredClone(DEFAULT_PRICING)
    },
    item_categories: { cards: { name: 'Cards' } },
    items: Object.fromEntries(['cards', 'spare'].map(id => [id, { name: 'Cards', item_code: id.toUpperCase(), qr_token: `rp-qr-${id}`, category_id: 'cards', status: 'AVAILABLE', is_active: true }])),
    item_rates: Object.fromEntries(['cards', 'spare'].map(id => [id, { item_id: id, rate_type: 'HOURLY', rental_rate: 50, late_penalty_rate: 10, is_active: true, effective_from: after(-60) }])),
  });
}

test('Active Sessions Management tracks multiple device sessions and revokes individual or other sessions', async () => {
  const before = { project: process.env.FIREBASE_PROJECT_ID, key: process.env.FIREBASE_WEB_API_KEY };
  process.env.FIREBASE_PROJECT_ID = 'test-project';
  process.env.FIREBASE_WEB_API_KEY = 'test-key';
  let counter = 0;
  const auth = {
    createSessionCookie: async () => `cookie-${++counter}`,
    verifySessionCookie: async cookie => ({ uid: 'owner-1', cookie })
  };
  const fetcher = async () => ({ ok: true, json: async () => ({ idToken: 'token', localId: 'owner-1' }) });
  try {
    const sessions = new FirebaseSessions(auth, fetcher);
    const desktop = await sessions.signIn('owner@example.test', 'pw', false);
    sessions.recordSession('owner-1', desktop.cookie, { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0', ip: '203.0.113.10' });
    const mobile = await sessions.signIn('owner@example.test', 'pw', true);
    sessions.recordSession('owner-1', mobile.cookie, { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Version/17.0 Mobile Safari/604.1', ip: '203.0.113.25', remember: true });

    const list = sessions.listSessions('owner-1', desktop.cookie);
    assert.equal(list.length, 2);
    const currentEntry = list.find(item => item.is_current);
    const otherEntry = list.find(item => !item.is_current);
    assert.equal(currentEntry.device_label, 'Chrome on Windows');
    assert.equal(otherEntry.device_label, 'Safari on iOS');

    const revoked = sessions.revokeOtherSessions('owner-1', desktop.cookie);
    assert.equal(revoked.revokedCount, 1);
    assert.equal(await sessions.verify(mobile.cookie), null);
    assert.equal((await sessions.verify(desktop.cookie)).uid, 'owner-1');
  } finally {
    before.project === undefined ? delete process.env.FIREBASE_PROJECT_ID : process.env.FIREBASE_PROJECT_ID = before.project;
    before.key === undefined ? delete process.env.FIREBASE_WEB_API_KEY : process.env.FIREBASE_WEB_API_KEY = before.key;
  }
});

test('Payment Proof Tampering & Duplicate Detection flags duplicate screenshots, duplicate references, and edited metadata', async () => {
  const db = fixture();
  const customer = db.data('users', 'customer');
  const admin = db.data('users', 'admin');
  const screenshot1 = createCleanPngDataUrl(42);
  const editedScreenshot = createEditedPngDataUrl();

  const inspectedEdited = inspectPaymentImage(editedScreenshot);
  assert.equal(inspectedEdited.software_signature, 'Adobe Photoshop');

  const firstBooking = await createBooking(db, customer, {
    itemId: 'cards',
    durationMinutes: 60,
    deliveryLocation: 'Lakewood Resort',
    paymentMethod: 'QR',
    paymentProof: {
      imageDataUrl: screenshot1,
      reference: 'GCASH-998877'
    },
    requestKey: key('1')
  }, now);
  assert.equal(firstBooking.rental.payment_proof_security_status, 'CLEAN');

  const duplicateBooking = await createBooking(db, customer, {
    itemId: 'spare',
    durationMinutes: 60,
    deliveryLocation: 'Lakewood Resort',
    paymentMethod: 'QR',
    paymentProof: {
      imageDataUrl: editedScreenshot,
      reference: 'gcash 998877'
    },
    requestKey: key('2')
  }, after(1));

  assert.equal(duplicateBooking.rental.payment_proof_security_status, 'FLAGGED');
  const flagCodes = duplicateBooking.rental.payment_proof_flags.map(f => f.code);
  assert.ok(flagCodes.includes('DUPLICATE_REFERENCE'));
  assert.ok(flagCodes.includes('EDITED_IMAGE_METADATA'));

  const proofView = await rentalPaymentProof(db, duplicateBooking.rental.id);
  assert.equal(proofView.proof.security_status, 'FLAGGED');

  const alerts = await listSecurityAlerts(db, admin);
  assert.ok(alerts.alerts.some(alert => alert.type === 'SECURITY_PAYMENT_PROOF_FLAGGED'));
});

test('Time-based Rolling QR & 6-digit TOTP PIN verify within window and trigger security alert when expired/tampered', async () => {
  const db = fixture();
  const customer = db.data('users', 'customer');
  const admin = db.data('users', 'admin');
  const { rental } = await createBooking(db, customer, {
    itemId: 'cards',
    durationMinutes: 60,
    deliveryLocation: 'Lakewood Resort',
    requestKey: key('a')
  }, now);
  await reviewBooking(db, admin, rental.id, { action: 'APPROVE' }, after(1));
  await prepareRentalDelivery(db, admin, rental.id, { inventoryCode: 'rp-qr-cards' }, after(1.5));

  const { ticket } = await rentalTicket(db, customer, rental.id, after(2));
  assert.ok(ticket.rolling_qr_token.startsWith(`${rental.booking_qr_token}.`));
  assert.match(ticket.rolling_pin, /^\d{6}$/);

  const verifiedByRollingQr = await verifyReleaseCodes(db, admin, rental.id, {
    transactionCode: ticket.rolling_qr_token
  }, after(2));
  assert.equal(verifiedByRollingQr.verification_mode, 'ROLLING_QR');

  const verifiedByPin = await verifyReleaseCodes(db, admin, rental.id, {
    transactionCode: ticket.rolling_pin
  }, after(2));
  assert.equal(verifiedByPin.verification_mode, 'ROLLING_PIN');

  // Expired rolling QR (25 minutes later) should fail and queue a security alert
  await assert.rejects(
    verifyReleaseCodes(db, admin, rental.id, { transactionCode: ticket.rolling_qr_token }, after(25)),
    /expired/i
  );
  const alerts = await listSecurityAlerts(db, admin);
  assert.ok(alerts.alerts.some(alert => alert.type === 'SECURITY_QR_VERIFICATION_FAILED'));
});
