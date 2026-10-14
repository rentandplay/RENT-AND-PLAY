import test from 'node:test';
import assert from 'node:assert/strict';
import { createApi, createFirebaseServices } from '../src/server.mjs';
import { DEFAULT_PRICING, savePricing } from '../src/pricing.mjs';
import { inventoryList, inventoryDetail, itemAction, createItem } from '../src/inventory.mjs';
import { saveRate } from '../src/workspace.mjs';
import { localDateTime } from '../src/firebase.mjs';
import { mobileCatalog, mobileProfile, mobileRentalList, resolveMobileItem } from '../src/mobile.mjs';
import { createMobileRentalRequest, quoteEquipmentRental, reviewMobileRental, cancelMobileRentalRequest, requestMobileReturn, reviewMobileReturn } from '../src/transactions.mjs';
import { prepareRentalDelivery, releaseBooking, recordRentalReceipt, MOBILE_RENTAL_TERMS_VERSION } from '../src/rental-flow.mjs';
import { memoryFirestore } from './support/memory-firestore.mjs';

const now = new Date('2026-10-06T02:00:00Z');
const customer = { id: 'customer-auth-uid', full_name: 'Mobile Customer', email: 'customer@example.test', phone: '09123456789' };
const admin = { id: 'admin', full_name: 'Equipment Inspector', role: 'ADMIN', is_active: true };
const inspection = { condition: 'GOOD', notes: 'All parts counted and equipment inspected.', result: 'AVAILABLE', accessoriesChecked: true };
const input = { itemId: 'bike-document', durationMinutes: 180, deliveryLocation: 'Test Resort', paymentMethod: 'Cash', requestKey: 'a'.repeat(32), acceptedRentalTerms: true, rentalTermsVersion: MOBILE_RENTAL_TERMS_VERSION };
function fixture() {
  const pricing = structuredClone(DEFAULT_PRICING);
  pricing.products.find(row => row.id === 'bike').deposit_amount = 100;
  return memoryFirestore({
    users: { admin, [customer.id]: { ...customer, role: 'USER', is_active: true } },
    settings: { pricing, business: { default_late_grace_hours: 0 } },
    item_categories: { sports: { name: 'Sports equipment', is_active: true } },
    items: {
      'bike-document': { name: 'Bike', item_code: 'SPORT-BIKE-001', qr_token: 'rp-qr-actual-bike', category_id: 'sports', status: 'AVAILABLE', condition_status: 'GOOD', is_active: true, pricing_product_id: 'bike', updated_at: now },
      'unconfigured-document': { name: 'Bicycle without rates', status: 'AVAILABLE', is_active: true },
      archived: { name: 'Archived badminton', status: 'INACTIVE', is_active: false },
    },
  });
}
async function released(db, releaseAt = now) {
  const { rental } = await createMobileRentalRequest(db, customer, input, now);
  await reviewMobileRental(db, admin, rental.id, { action: 'APPROVE' }, now);
  await prepareRentalDelivery(db, admin, rental.id, { inventoryCode: 'rp-qr-actual-bike' }, now);
  await releaseBooking(db, admin, rental.id, { requestKey: 'b'.repeat(32), transactionCode: rental.booking_qr_token, customerVerified: true, paymentVerified: true, depositReceived: true, inspection }, releaseAt);
  return rental.id;
}
const hasStatus = expected => error => error.status === expected;

test('customer catalog uses admin inventory IDs and live availability, omitting unconfigured, archived and private records', async () => {
  const db = fixture();
  const before = await mobileCatalog(db), inventory = await inventoryList(db);
  assert.deepEqual(before.items.map(row => row.id), [input.itemId]);
  assert.ok(inventory.items.some(row => row.id === 'unconfigured-document'));
  assert.equal(before.items.find(row => row.id === input.itemId).can_rent, true);
  assert.equal(before.items.some(row => row.id === 'unconfigured-document'), false);
  assert.equal((await resolveMobileItem(db, { code: 'SPORT-BIKE-001' })).item.id, input.itemId);
  assert.equal((await resolveMobileItem(db, { code: 'rp-qr-actual-bike' })).item.id, input.itemId);
  await assert.rejects(resolveMobileItem(db, { code: 'made-up-QR' }), hasStatus(404));
  await assert.rejects(resolveMobileItem(db, { code: 'unconfigured-document' }), hasStatus(404));
  const { rental } = await createMobileRentalRequest(db, customer, input, now);
  const reserved = (await mobileCatalog(db)).items.find(row => row.id === input.itemId);
  assert.equal(reserved.status, 'RESERVED_PENDING'); assert.equal(reserved.can_rent, false);
  assert.equal(reserved.reserved_rental_id, undefined); assert.equal(reserved.customer_email, undefined);
  await cancelMobileRentalRequest(db, customer, rental.id, now);
  assert.equal((await mobileCatalog(db)).items.find(row => row.id === input.itemId).can_rent, true);
});

test('quantity groups show live stock and customer bookings reserve individual physical units', async () => {
  const db=fixture(),created=await createItem(db,admin.id,{categoryId:'sports',name:'Rental bike fleet',description:'Three identical bikes',condition:'GOOD',rateType:'HOURLY',rentalRate:50,latePenalty:10,pricingProductId:'bike',quantity:3});
  const groupId=created.stock_group_id;
  let product=(await mobileCatalog(db)).items.find(item=>item.id===groupId);
  assert.equal(product.available_quantity,3);assert.equal(product.total_quantity,3);assert.equal(product.can_rent,true);
  const quote=await quoteEquipmentRental(db,{itemId:groupId,stockGroupId:groupId,durationMinutes:60},now);
  assert.ok(quote.quote.rental_fee>0);
  for(const key of ['b','c','d']){
    await createMobileRentalRequest(db,customer,{itemId:groupId,stockGroupId:groupId,durationMinutes:60,deliveryLocation:'Test Resort',paymentMethod:'Cash',requestKey:key.repeat(32)},now);
    product=(await mobileCatalog(db)).items.find(item=>item.id===groupId);
    assert.equal(product.available_quantity,product.total_quantity-['b','c','d'].indexOf(key)-1);
  }
  product=(await mobileCatalog(db)).items.find(item=>item.id===groupId);
  assert.equal(product.available_quantity,0);assert.equal(product.can_rent,false);
  await assert.rejects(createMobileRentalRequest(db,customer,{itemId:groupId,stockGroupId:groupId,durationMinutes:60,deliveryLocation:'Test Resort',paymentMethod:'Cash',requestKey:'e'.repeat(32)},now),hasStatus(409));
  const rentals=db.records('rentals').filter(rental=>rental.stock_group_id===groupId);
  assert.equal(new Set(rentals.map(rental=>rental.item_id)).size,3);
});

test('customer equipment scans preserve the exact physical unit within a grouped catalog and reject ambiguous labels', async () => {
  const db = fixture();
  const fleet = await createItem(db, admin.id, { categoryId: 'sports', name: 'Rental bike fleet', description: 'Three identical bikes', condition: 'GOOD', rateType: 'HOURLY', rentalRate: 50, latePenalty: 10, pricingProductId: 'bike', quantity: 3 });
  const unitId = fleet.ids[1];
  await db.collection('rentals').doc('sibling-rental').set({ customer_id: customer.id, item_id: unitId, stock_group_id: fleet.stock_group_id, status: 'ACTIVE', created_at: now });
  const owned = (await mobileRentalList(db, customer)).rentals;
  for (let index = 0; index < fleet.ids.length; index++) {
    const resolved = (await resolveMobileItem(db, { code: fleet.codes[index] })).item;
    assert.equal(resolved.id, fleet.stock_group_id);
    assert.equal(resolved.scanned_unit_id, fleet.ids[index]);
    assert.equal(resolved.scanned_unit_code, fleet.codes[index]);
    assert.equal(owned.filter(rental => rental.item_id === resolved.scanned_unit_id).length, index === 1 ? 1 : 0);
  }
  await db.collection('items').doc(fleet.ids[2]).update({ qr_token: fleet.codes[1] });
  await assert.rejects(resolveMobileItem(db, { code: fleet.codes[1] }), hasStatus(404));
});

test('equipment appears for customers after rates are configured and stays visible while rented', async () => {
  const db = fixture();
  await db.collection('items').doc('unconfigured-document').update({ category_id: 'other', status: 'RENTED' });
  await db.collection('item_categories').doc('other').set({ name: 'Other rentals', is_active: true });
  const hidden = await mobileCatalog(db);
  assert.equal(hidden.items.some(row => row.id === 'unconfigured-document'), false);
  assert.equal(hidden.categories.includes('Other rentals'), false);
  await saveRate(db, admin.id, { itemId: 'unconfigured-document', rateType: 'HOURLY', rentalRate: 75, deposit: 0, latePenalty: 0 }, now);
  const configured = await mobileCatalog(db);
  const item = configured.items.find(row => row.id === 'unconfigured-document');
  assert.equal(item.status, 'RENTED');
  assert.equal(item.can_rent, false);
  assert.equal(item.rate_text, '₱75.00 / Per hour');
  assert.ok(configured.categories.includes('Other rentals'));
  assert.equal((await resolveMobileItem(db, { code: 'unconfigured-document' })).item.id, item.id);
});

test('legacy deposit settings do not hide equipment or add charges to current rental quotes', async () => {
  const db = fixture();
  const pricing = structuredClone(DEFAULT_PRICING);
  pricing.products.find(row => row.id === 'bike').deposit_amount = 0;
  await savePricing(db, admin.id, pricing, now);
  assert.equal((await mobileCatalog(db)).items.find(row => row.id === input.itemId).can_rent, true);
  assert.ok((await inventoryList(db)).items.some(row => row.id === input.itemId));
  assert.equal((await resolveMobileItem(db, { code: 'rp-qr-actual-bike' })).item.id, input.itemId);
  pricing.products.find(row => row.id === 'bike').deposit_amount = 100;
  await savePricing(db, admin.id, pricing, now);
  assert.equal((await mobileCatalog(db)).items.find(row => row.id === input.itemId).can_rent, true);
  const { quote } = await quoteEquipmentRental(db, input, now);
  assert.equal(quote.deposit_amount, undefined);
  assert.equal(quote.total_to_collect, quote.rental_fee);
});

test('profile bootstrap and edits cannot grant admin access or change token identity', async () => {
  const db = fixture(), claims = { uid: 'new-user', email: 'verified@example.test', email_verified: true };
  const response = await mobileProfile(db, claims, { name: 'Customer', phone: '09123456789', role: 'ADMIN', is_active: false, uid: admin.id, email: 'fake@example.test' }, 'POST', now);
  assert.equal(response.user.role, 'CUSTOMER'); assert.equal(response.user.uid, claims.uid); assert.equal(response.user.email, claims.email); assert.equal(response.user.is_active, true);
  const changed = await mobileProfile(db, claims, { name: 'Changed name', hasAcceptedTerms: true, role: 'ADMIN', is_active: false }, 'PATCH', now);
  assert.equal(changed.user.name, 'Changed name'); assert.equal(changed.user.hasAcceptedTerms, true); assert.equal(changed.user.role, 'CUSTOMER');
  await db.collection('users').doc(claims.uid).update({ is_active: false });
  await assert.rejects(mobileProfile(db, claims), hasStatus(403));
});

test('customer profile edits update the linked customer directory record', async () => {
  const db = fixture(), claims = { uid: 'customer-1', email: 'reynold@gmail.com' };
  await db.collection('users').doc(claims.uid).set({ full_name: 'Customer', email: claims.email, phone: '', role: 'USER', is_active: true });
  await db.collection('customers').doc(claims.uid).set({ full_name: 'Customer', email: 'rentandplay@gmail.com', phone: null, auth_uid: claims.uid, is_active: true });

  const response = await mobileProfile(db, claims, { name: 'Reynold Pastor', phone: '09761180282' }, 'PATCH', now);

  assert.equal(response.user.name, 'Reynold Pastor');
  assert.equal(db.data('users', claims.uid).full_name, 'Reynold Pastor');
  assert.equal(db.data('customers', claims.uid).full_name, 'Reynold Pastor');
  assert.equal(db.data('customers', claims.uid).phone, '09761180282');
  assert.equal(db.data('customers', claims.uid).email, 'rentandplay@gmail.com');
});

test('quotes and checkout use saved package rates; duplicate requests reserve exactly one item', async () => {
  const db = fixture(), { quote } = await quoteEquipmentRental(db, input, now);
  assert.equal(quote.rental_fee, 500); assert.equal(quote.deposit_amount, undefined); assert.equal(quote.billed_minutes, 180); assert.equal(quote.total_to_collect, 500);
  const payload = { ...input, expectedQuote: { rentalFee: quote.rental_fee, billedMinutes: quote.billed_minutes } };
  const results = await Promise.all([createMobileRentalRequest(db, customer, payload, now), createMobileRentalRequest(db, customer, payload, now)]);
  assert.equal(results[0].rental.id, results[1].rental.id); assert.equal(results[1].duplicate, true);
  assert.equal(db.records('rentals').length, 1); assert.equal(db.records('audit_logs').length, 1);
  assert.equal(db.data('customers', customer.id).auth_uid, customer.id);
  assert.equal(db.data('items', input.itemId).reserved_rental_id, results[0].rental.id);
  await assert.rejects(createMobileRentalRequest(db, customer, { ...payload, deliveryLocation: 'Changed' }, now), hasStatus(409));
  await assert.rejects(createMobileRentalRequest(db, { id: 'other-customer', full_name: 'Other' }, { ...payload, requestKey: 'b'.repeat(32) }, now), hasStatus(409));
});

test('stale quote, missing rates, and legacy active rentals cannot create a reservation', async () => {
  const db = fixture();
  await assert.rejects(createMobileRentalRequest(db, customer, { ...input, expectedQuote: { rentalFee: 1, depositAmount: 0, billedMinutes: 180 } }, now), hasStatus(409));
  await assert.rejects(createMobileRentalRequest(db, customer, { ...input, itemId: 'unconfigured-document' }, now), hasStatus(400));
  assert.equal(db.records('rentals').length, 0); assert.equal(db.records('customers').length, 0);
  await db.collection('rentals').doc('legacy').set({ itemId: input.itemId, customerId: customer.id, status: 'active', startDate: now });
  await assert.rejects(quoteEquipmentRental(db, input, now), hasStatus(409));
  await assert.rejects(createMobileRentalRequest(db, customer, input, now), hasStatus(409));
  assert.equal((await inventoryDetail(db, input.itemId)).item.open_rentals, 1);
  await assert.rejects(itemAction(db, admin.id, input.itemId, { action: 'archive', version: localDateTime(now) }), hasStatus(409));
});

test('approval waits for physical release; scans, rental payment and inspection start the saved duration', async () => {
  const db = fixture(), { rental } = await createMobileRentalRequest(db, customer, input, now);
  await reviewMobileRental(db, admin, rental.id, { action: 'APPROVE' }, now);
  assert.equal(db.data('rentals', rental.id).status, 'APPROVED');
  assert.equal(db.data('rentals', rental.id).start_at, null);
  assert.equal(db.data('items', input.itemId).status, 'AVAILABLE');
  await prepareRentalDelivery(db, admin, rental.id, { inventoryCode: 'rp-qr-actual-bike' }, now);
  const releaseAt = new Date(now.getTime() + 5 * 60000);
  const release = { requestKey: 'b'.repeat(32), transactionCode: rental.booking_qr_token, customerVerified: true, paymentVerified: true, inspection };
  await assert.rejects(releaseBooking(db, admin, rental.id, { ...release, paymentVerified: false }, releaseAt), hasStatus(400));
  await assert.rejects(releaseBooking(db, admin, rental.id, { ...release, inspection: null }, releaseAt), hasStatus(400));
  await releaseBooking(db, admin, rental.id, release, releaseAt);
  const saved = db.data('rentals', rental.id);
  assert.equal(saved.status, 'ACTIVE'); assert.equal(saved.start_at.toISOString(), releaseAt.toISOString());
  assert.equal(saved.due_at.getTime() - releaseAt.getTime(), 180 * 60000);
  assert.equal(saved.fee_breakdown.rental_fee, 500); assert.equal(saved.release_condition.inspected_by, admin.id);
  assert.equal(db.data('items', input.itemId).status, 'RENTED'); assert.equal(db.records('item_condition_records').length, 1);
  assert.equal((await releaseBooking(db, admin, rental.id, release, releaseAt)).duplicate, true);
});

test('owner reads combine canonical and legacy records without duplicates or another customer data', async () => {
  const db = fixture(), { rental } = await createMobileRentalRequest(db, customer, input, now);
  await db.collection('rentals').doc('old-record').set({ customerId: customer.id, itemId: input.itemId, status: 'completed', startDate: now });
  await db.collection('rentals').doc('private-record').set({ customer_id: 'other', item_id: input.itemId, status: 'ACTIVE' });
  const list = await mobileRentalList(db, customer);
  assert.equal(list.rentals.length, 2); assert.equal(list.rentals.find(row => row.id === rental.id).qr_token, 'rp-qr-actual-bike');
  assert.equal(list.rentals.find(row => row.id === 'old-record').status, 'COMPLETED');
  assert.equal(list.rentals.find(row => row.id === rental.id).start_at, null);
  assert.match(list.rentals.find(row => row.id === rental.id).hold_expires_at, /Z$/);
  await assert.rejects(mobileRentalList(db, { id: 'other' }, rental.id), hasStatus(403));
  await assert.rejects(cancelMobileRentalRequest(db, { id: 'other' }, rental.id), hasStatus(403));
});

test('cancellation and admin rejection free reservations and remain visible in history', async () => {
  const db = fixture(), { rental } = await createMobileRentalRequest(db, customer, input, now);
  await reviewMobileRental(db, admin, rental.id, { action: 'REJECT', reason: 'Payment not received.' }, now);
  assert.equal(db.data('items', input.itemId).status, 'AVAILABLE');
  assert.equal(db.data('rentals', rental.id).status, 'REJECTED');
  const next = await createMobileRentalRequest(db, customer, { ...input, requestKey: 'b'.repeat(32) }, now);
  await cancelMobileRentalRequest(db, customer, next.rental.id, now);
  assert.equal(db.data('items', input.itemId).reserved_rental_id, null);
  assert.equal((await mobileRentalList(db, customer)).rentals.length, 2);
});

test('customer return stays active until staff receipt; final fees use original rates after pricing edits', async () => {
  const db = fixture(), id = await released(db);
  await assert.rejects(requestMobileReturn(db, { id: 'other' }, id, {}, now), hasStatus(403));
  const request = await requestMobileReturn(db, customer, id, { condition: 'GOOD', notes: 'Ready for collection.' }, now);
  assert.equal(request.rental.status, 'ACTIVE'); assert.equal(db.data('items', input.itemId).status, 'RENTED');
  assert.equal((await requestMobileReturn(db, customer, id, {}, now)).duplicate, true);
  const edited = structuredClone(DEFAULT_PRICING), bike = edited.products.find(row => row.id === 'bike');
  bike.deposit_amount = 999; bike.overtime_rate_per_hour = 999; bike.rate_options.forEach(rate => rate.amount *= 10);
  await savePricing(db, admin.id, edited, now);
  const receipt = new Date(db.data('rentals', id).due_at.getTime() + 1);
  await assert.rejects(reviewMobileReturn(db, admin, id, { action: 'APPROVE', requestKey: 'c'.repeat(32), inspection }, receipt), hasStatus(409));
  await recordRentalReceipt(db, admin, id, { requestKey: 'd'.repeat(32), inventoryCode: 'rp-qr-actual-bike', physicalReceiptConfirmed: true }, receipt);
  await assert.rejects(reviewMobileReturn(db, admin, id, { requestKey: 'c'.repeat(32), inspection }, receipt), hasStatus(400));
  await reviewMobileReturn(db, admin, id, { action: 'APPROVE', requestKey: 'c'.repeat(32), inspection, penaltyAmount: 50, penaltyReason: 'Missing accessory' }, receipt);
  const saved = db.data('rentals', id);
  assert.equal(saved.status, 'COMPLETED'); assert.equal(saved.fee_breakdown.rental_fee, 500); assert.equal(saved.fee_breakdown.deposit_amount, undefined);
  assert.equal(saved.fee_breakdown.overtime_fee, 200); assert.equal(saved.fee_breakdown.final_rental_charges, 750);
  assert.equal(saved.returned_at.toISOString(), receipt.toISOString()); assert.equal(saved.return_condition.inspected_by, admin.id);
  assert.equal((await mobileCatalog(db)).items.find(row => row.id === input.itemId).can_rent, true);
  assert.equal((await mobileRentalList(db, customer)).rentals[0].can_request_return, false);
  await assert.rejects(reviewMobileReturn(db, admin, id, { action: 'APPROVE', requestKey: 'e'.repeat(32), inspection, penaltyAmount: 0 }, receipt), hasStatus(409));
});

test('rejected returns can be resubmitted and damaged receipts create linked maintenance', async () => {
  const db = fixture(), id = await released(db);
  await requestMobileReturn(db, customer, id, { condition: 'DAMAGED' }, now);
  await reviewMobileReturn(db, admin, id, { action: 'REJECT', reason: 'Equipment has not arrived yet.' }, now);
  assert.equal(db.data('rentals', id).status, 'ACTIVE'); assert.equal((await mobileRentalList(db, customer)).rentals[0].can_request_return, true);
  await requestMobileReturn(db, customer, id, { condition: 'DAMAGED' }, now);
  await recordRentalReceipt(db, admin, id, { requestKey: 'd'.repeat(32), inventoryCode: 'rp-qr-actual-bike', physicalReceiptConfirmed: true }, now);
  await reviewMobileReturn(db, admin, id, { action: 'APPROVE', requestKey: 'c'.repeat(32), penaltyAmount: 0, inspection: { accessoriesChecked: true, condition: 'DAMAGED', result: 'UNDER_MAINTENANCE', notes: 'Brake cable snapped.' } }, new Date(now.getTime() + 60000));
  const saved = db.data('rentals', id), maintenance = db.data('maintenance_records', saved.maintenance_record_id);
  assert.equal(db.data('items', input.itemId).status, 'UNDER_MAINTENANCE'); assert.equal(maintenance.rental_id, id);
  assert.equal(maintenance.condition_record_id, saved.return_condition_record_id); assert.equal(db.records('item_condition_records').length, 2);
});

test('HTTP connects public catalog, Firebase customer rentals, web cookie reviews, and Firebase admin workspace', async () => {
  const db = fixture();
  const services = createFirebaseServices({ db, now: () => now, auth: { verifyIdToken: async token => {
    if (token === 'customer-token') return { uid: customer.id, email: customer.email };
    if (token === 'admin-token') return { uid: admin.id };
    throw Error('Invalid token');
  } } });
  services.firebaseProjectId = 'rent-and-play';
  const server = createApi({ services, sessions: { verify: async token => token === 'web-admin-cookie' ? { uid: admin.id } : null }, expiryWorker: false });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = (path, method = 'GET', data, headers = {}) => fetch(origin + '/api' + path, { method, headers: { 'Content-Type': 'application/json', ...headers }, ...(data ? { body: JSON.stringify(data) } : {}) });
  const owner = { Authorization: 'Bearer customer-token' }, staff = { Cookie: 'rent_play_session=web-admin-cookie' };
  try {
    const catalog = await request('/mobile/catalog'); assert.equal(catalog.status, 200); assert.equal((await catalog.json()).firebaseProjectId, 'rent-and-play');
    assert.equal((await request('/mobile/rentals')).status, 401);
    assert.equal((await request('/workspace', 'GET', null, owner)).status, 401);
    assert.equal((await request('/workspace', 'GET', null, { Authorization: 'Bearer admin-token' })).status, 200);
    const created = await request('/mobile/rentals', 'POST', { ...input, acceptedRentalTerms: true, rentalTermsVersion: '2026-10-13-rental-v1' }, owner); assert.equal(created.status, 201);
    const { rental } = await created.json();
    assert.match(rental.rental_code, /^R-\d{4,}$/);
    assert.equal(db.data('rentals', rental.id).rental_terms_acceptance.accepted_by, customer.id);
    const mobileStaff = { Authorization: 'Bearer admin-token' };
    const pendingWorkspace = await (await request('/mobile/admin-workspace', 'GET', null, mobileStaff)).json();
    assert.equal(pendingWorkspace.transactions.find(row => row.id === rental.id).rental_code, rental.rental_code);
    assert.equal((await request(`/mobile/rentals/${rental.id}/review`, 'POST', { action: 'APPROVE', paymentVerified: true, inspection }, owner)).status, 401);
    assert.equal((await request(`/mobile/rentals/${rental.id}/review`, 'POST', { action: 'APPROVE', paymentVerified: true }, mobileStaff)).status, 200);
    const webWorkspace = await (await request('/workspace', 'GET', null, staff)).json();
    const approved = webWorkspace.transactions.find(row => row.id === rental.id);
    assert.equal(approved.status, 'APPROVED'); assert.equal(approved.rental_code, rental.rental_code); assert.equal(approved.start_at, null);
    assert.equal((await request(`/mobile/rentals/${rental.id}/review`, 'POST', { action: 'APPROVE', paymentVerified: true }, staff)).status, 200);
    const release = { requestKey: 'b'.repeat(32), transactionCode: rental.booking_qr_token, customerVerified: true, paymentVerified: true, inspection };
    assert.equal((await request(`/rentals/${rental.id}/prepare-delivery`, 'POST', { inventoryCode: 'rp-qr-actual-bike' }, staff)).status, 200);
    const preflightPath = `/rentals/${rental.id}/release-verification`;
    assert.equal((await request(preflightPath, 'POST', { transactionCode: rental.booking_qr_token }, owner)).status, 401);
    assert.equal((await request(preflightPath, 'POST', { transactionCode: rental.booking_qr_token })).status, 401);
    assert.equal((await request(preflightPath, 'GET', null, staff)).status, 405);
    const bookingVerified = await request(preflightPath, 'POST', { transactionCode: rental.booking_qr_token }, staff);
    assert.equal(bookingVerified.status, 200);
    assert.equal((await bookingVerified.json()).delivery_prepared, true);
    assert.equal((await request(preflightPath, 'POST', { transactionCode: 'wrong-rental-qr' }, staff)).status, 409);
    assert.equal(db.data('rentals', rental.id).status, 'APPROVED');
    assert.equal((await request(`/rentals/${rental.id}/release`, 'POST', release, owner)).status, 401);
    assert.equal((await request(`/rentals/${rental.id}/release`, 'POST', release, staff)).status, 200);
    const list = await request('/mobile/rentals', 'GET', null, owner); assert.equal((await list.json()).rentals[0].status, 'ACTIVE');
    assert.equal((await request(`/mobile/rentals/${rental.id}/return`, 'POST', { condition: 'GOOD' }, owner)).status, 200);
    assert.equal((await request(`/rentals/${rental.id}/receipt`, 'POST', { requestKey: 'd'.repeat(32), inventoryCode: 'rp-qr-actual-bike', physicalReceiptConfirmed: true }, staff)).status, 200);
    assert.equal((await request(`/mobile/rentals/${rental.id}/return/review`, 'POST', { action: 'APPROVE', requestKey: 'c'.repeat(32), penaltyAmount: 0, inspection }, staff)).status, 200);
    assert.equal(db.data('rentals', rental.id).status, 'COMPLETED'); assert.equal(db.data('items', input.itemId).status, 'AVAILABLE');
  } finally { await new Promise(resolve => server.close(resolve)); }
});
