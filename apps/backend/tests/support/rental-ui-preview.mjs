// Local visual QA only: uses disposable memory records, never a cloud database.
// Do not deploy this test helper. Authentication is intentionally stubbed on loopback.
import { createApi, createFirebaseServices } from '../../src/server.mjs';
import { DEFAULT_PRICING } from '../../src/pricing.mjs';
import { createBooking, releaseBooking, recordRentalReceipt } from '../../src/rental-flow.mjs';
import { memoryFirestore } from './memory-firestore.mjs';

const now = new Date();
const port = Number(process.env.RENTAL_UI_PORT || 3091);
const admin = { id: 'qa-admin', role: 'ADMIN', is_active: true, full_name: 'Rental Test Admin', email: 'admin@example.invalid' };
const customer = { id: 'qa-customer', role: 'USER', is_active: true, full_name: 'Demo Customer', email: 'customer@example.invalid' };
const db = memoryFirestore({
  users: { [admin.id]: admin, [customer.id]: customer },
  customers: { [customer.id]: { ...customer, customer_code: 'TEST-001' } },
  settings: { business: { business_name: 'Rent & Play · Local Test', default_late_grace_hours: 0 }, pricing: structuredClone(DEFAULT_PRICING) },
  item_categories: { games: { name: 'Board Games', is_active: true }, sports: { name: 'Sports', is_active: true } },
  items: { jenga: { name: 'Jenga', item_code: 'TEST-001', qr_token: 'rp-qa-jenga', status: 'AVAILABLE', is_active: true, condition_status: 'GOOD', category_id: 'games', pricing_product_id: 'jenga', created_at: now }, bike: { name: 'Bicycle', item_code: 'TEST-002', qr_token: 'rp-qa-bike', status: 'AVAILABLE', is_active: true, condition_status: 'GOOD', category_id: 'sports', pricing_product_id: 'bike', created_at: now } },
});
for (const [id, name, code, product] of [
  ['jenga-pickup', 'Jenga', 'TEST-003', 'jenga'],
  ['jenga-out', 'Jenga', 'TEST-004', 'jenga'],
  ['bike-inspection', 'Bicycle', 'TEST-005', 'bike'],
]) {
  await db.collection('items').doc(id).set({ name, item_code: code, qr_token: `rp-qa-${id}`, status: 'AVAILABLE', is_active: true, condition_status: 'GOOD', category_id: product === 'jenga' ? 'games' : 'sports', pricing_product_id: product, created_at: now });
}
await createBooking(db, customer, { itemId: 'jenga', durationMinutes: 60, requestKey: 'a'.repeat(32), deliveryLocation: 'Test pickup desk' }, now);
for (const [index, id] of ['jenga-pickup', 'jenga-out', 'bike-inspection'].entries()) {
  const started = new Date(now.getTime() - index * 60 * 60 * 1000);
  const result = await createBooking(db, admin, { itemId: id, customerId: customer.id, durationMinutes: 300, requestKey: String(index + 1).repeat(32) }, started, { staff: true });
  if (index === 0) continue;
  await releaseBooking(db, admin, result.rental.id, { requestKey: String(index + 4).repeat(32), transactionCode: result.rental.booking_qr_token, inventoryCode: `rp-qa-${id}`, customerVerified: true, paymentVerified: true, depositReceived: true, inspection: { condition: 'GOOD', notes: 'Local QA fixture: complete and working.', accessoriesChecked: true, photos: [] } }, started);
  if (index === 2) await recordRentalReceipt(db, admin, result.rental.id, { requestKey: '8'.repeat(32), inventoryCode: `rp-qa-${id}`, physicalReceiptConfirmed: true }, now);
}
// Freeze test time so holds remain stable during visual review.
const services = createFirebaseServices({ db, now: () => new Date(now), auth: { verifyIdToken: async () => ({ uid: customer.id, email: customer.email }) } });
services.health = async () => {}; services.firebaseProjectId = 'local-test-preview';
process.env.WEB_ORIGIN = `http://127.0.0.1:${port}`;
const server = createApi({ services, hardwareEnabled: false, expiryWorker: false, sessions: { verify: async () => ({ uid: admin.id }) } });
server.listen(port, '127.0.0.1', () => console.log(`Disposable rental UI preview: http://127.0.0.1:${port}/rentals`));
