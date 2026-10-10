import { asDate, docData } from './firebase.mjs';
import { inventoryList } from './inventory.mjs';
import { equipmentRateOptions, loadPricing } from './pricing.mjs';
import { normalizeRole } from './roles.mjs';
import { nameError, phoneError, validationFailure } from './account-validation.mjs';

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const money = amount => `₱${Number(amount).toFixed(2)}`;
const validAmount = amount => typeof amount === 'number' && Number.isFinite(amount) && amount >= 0;
export const isMobileRental = rental => rental.request_source === 'MOBILE_APP' || Boolean(rental.admin_review) || Boolean(rental.customerId);

export async function mobileProfile(db, claims, input = {}, method = 'GET', now = new Date(), onWrite = () => {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail(400, 'Profile details are required.');
  const userRef = db.collection('users').doc(String(claims.uid));
  const { profile, created } = await db.runTransaction(async tx => {
    const doc = await tx.get(userRef);
    const existing = doc.exists ? doc.data() : null;
    if (!existing && claims.email_verified !== true) fail(403, 'Verify your email before creating an account.');
    if (existing?.is_active === false) fail(403, 'Your account is inactive. Contact an administrator.');
    const existingRole = existing ? normalizeRole(existing.role) : 'CUSTOMER';
    if (existing && !existingRole) fail(403, 'This account has no supported app role. Contact the workspace owner.');
    const clean = (value, max, label) => {
      if (typeof value !== 'string' || value.trim().length > max) fail(400, `Enter a valid ${label}.`);
      return value.trim();
    };
    if (!existing && input.name !== undefined) validationFailure(nameError(input.name));
    if (!existing && input.phone !== undefined) validationFailure(phoneError(input.phone, false));
    const created = existing ? { ...existing, role: existingRole } : { full_name: clean(input.name || claims.name || claims.email?.split('@')[0] || 'Customer', 150, 'name'), email: claims.email || '', phone: clean(input.phone || '', 40, 'phone'), role: 'CUSTOMER', is_active: true, hasAcceptedTerms: false, created_at: now };
    const changes = {};
    if (method === 'PATCH') {
      if (input.name !== undefined) { validationFailure(nameError(input.name)); changes.full_name = clean(input.name, 150, 'name'); changes.name = changes.full_name; }
      if (input.phone !== undefined) { validationFailure(phoneError(input.phone, false)); changes.phone = clean(input.phone, 40, 'phone'); }
      if (input.validIdUrl !== undefined) changes.validIdUrl = clean(input.validIdUrl, 2048, 'ID reference');
      if (input.profileImageUrl !== undefined) changes.profileImageUrl = clean(input.profileImageUrl, 2048, 'profile image');
      if (input.hasAcceptedTerms !== undefined) {
        if (typeof input.hasAcceptedTerms !== 'boolean') fail(400, 'Choose whether to accept the rental terms.');
        changes.hasAcceptedTerms = input.hasAcceptedTerms;
      }
      changes.updated_at = now;
    }
    if (method === 'PATCH' && existingRole === 'CUSTOMER') {
      const customerRef = db.collection('customers').doc(String(claims.uid));
      const customerDoc = await tx.get(customerRef);
      if (customerDoc.exists) {
        const customerChanges = {};
        if (changes.full_name !== undefined) customerChanges.full_name = changes.full_name;
        if (changes.phone !== undefined) customerChanges.phone = changes.phone || null;
        if (Object.keys(customerChanges).length) {
          customerChanges.updated_at = now;
          tx.update(customerRef, customerChanges);
        }
      }
    }
    if (!existing) tx.create(userRef, { ...created, ...changes });
    else if (method === 'PATCH') tx.update(userRef, changes);
    return { profile: { ...created, ...changes }, created: !existing };
  });
  if (created || method === 'PATCH') onWrite(method === 'PATCH' ? ['users', 'customers'] : ['users']);
  return { user: serializeMobile({ id: claims.uid, uid: claims.uid, name: profile.full_name || profile.name || '', full_name: profile.full_name || profile.name || '', email: profile.email || claims.email || '', phone: profile.phone || '', role: normalizeRole(profile.role) || 'CUSTOMER', mustChangePassword: profile.must_change_password === true, is_active: profile.is_active !== false, validIdUrl: profile.validIdUrl || profile.valid_id_url || null, profileImageUrl: profile.profileImageUrl || null, hasAcceptedTerms: profile.hasAcceptedTerms ?? profile.has_accepted_terms ?? false, createdAt: profile.created_at || profile.createdAt || null }) };
}

// Only configured equipment belongs in the customer catalog; admin inventory retains all records.
export async function mobileCatalog(db) {
  const [inventory, pricing] = await Promise.all([inventoryList(db), loadPricing(db)]);
  const products = new Map(pricing.products.map(product => [product.id, product]));
  const items = inventory.items.filter(item => item.is_active !== false && typeof item.name === 'string' && item.name.trim()).flatMap(item => {
    const linkedProduct = products.get(item.pricing_product_id);
    const customOptions = Array.isArray(item.custom_rate_options) ? item.custom_rate_options : [];
    const validRate = ['HOURLY', 'DAILY', 'FLAT'].includes(item.rate_type) && [item.rental_rate, item.late_penalty_rate].every(validAmount);
    const hasItemSpecificRates = customOptions.length > 0 || (!item.pricing_product_id && validRate);
    const usesLegacyRateOptions = customOptions.length > 0 && !(Number(item.custom_rate_options_version) >= 2);
    const product = hasItemSpecificRates ? {
      id: `custom-${item.id}`, name: item.name,
      rate_options: usesLegacyRateOptions ? customOptions : equipmentRateOptions(item.rate_type, item.rental_rate, customOptions),
      overtime_rate_per_hour: item.late_penalty_rate, sale_price: null
    } : linkedProduct;
    const options = product?.rate_options.filter(rate => rate.kind !== 'WHOLE_STAY') || [];
    const configured = product ? options.length > 0 : validRate;
    if (!configured) return [];
    const status = item.reserved_rental_id ? 'RESERVED_PENDING' : String(item.effective_status || item.status || 'UNAVAILABLE').toUpperCase();
    const salePrice = product?.sale_price ?? item.sale_price ?? null;
    return [{
      id: item.id, name: item.name, category: item.category, description: item.description || '',
      item_code: item.item_code || item.qrCode || '', qr_token: item.qr_token || '', status,
      image_data: item.image_data || null, image_url: item.image_url || item.imageUrl || null,
      image_name: item.image_name || null,
      is_for_sale: item.is_for_sale === true || salePrice !== null, sale_price: salePrice, sale_label: product?.sale_label || null,
      rate_text: product ? product.rate_options.map(rate => `${money(rate.amount)} / ${rate.label}`).join(' · ') : `${money(item.rental_rate)} / ${{ HOURLY: 'hour', DAILY: 'day', FLAT: 'rental' }[item.rate_type]}`,
      rate_type: product ? 'RATE_SHEET' : item.rate_type,
      rental_rate: product?.overtime_rate_per_hour ?? item.rental_rate,
      late_penalty_rate: product?.overtime_rate_per_hour ?? item.late_penalty_rate,
      pricing_product_id: hasItemSpecificRates ? null : item.pricing_product_id, rate_options: product?.rate_options || [],
      can_rent: status === 'AVAILABLE',
      unavailable_reason: status === 'AVAILABLE' ? null : 'This equipment is currently unavailable.'
    }];
  });
  return { items, categories: [...new Set(items.map(item => item.category))].sort() };
}

export async function mobilePaymentInstructions(db) {
  const snapshot = await db.collection('settings').doc('business').get();
  const settings = snapshot.exists ? snapshot.data() : {};
  return {
    instapay_qr_data_url: settings.instapay_qr_data_url || null,
    account_name: settings.instapay_account_name || null,
    account_number: settings.instapay_account_number || null,
    instructions: settings.instapay_instructions || 'Pay the exact amount shown and upload a screenshot of the successful transfer.'
  };
}

export async function resolveMobileItem(db, input) {
  const code = typeof input?.code === 'string' ? input.code.trim() : '';
  if (!code || code.length > 512) fail(400, 'Scan a valid equipment QR label.');
  const catalog = await mobileCatalog(db);
  const matches = catalog.items.filter(item => [item.id, item.item_code, item.qr_token].some(value => value && value.toLowerCase() === code.toLowerCase()));
  if (matches.length !== 1) fail(404, 'This QR label does not identify an active equipment record.');
  return { item: matches[0] };
}

export function serializeMobile(value) {
  if (value instanceof Date || typeof value?.toDate === 'function') return asDate(value).toISOString();
  if (Array.isArray(value)) return value.map(serializeMobile);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !/deposit/i.test(key)).map(([key, entry]) => [key, serializeMobile(entry)]));
  return value;
}

export async function mobileRentalList(db, actor, rentalId = '') {
  const ownerId = String(actor.id);
  let rentals;
  if (rentalId) {
    const doc = await db.collection('rentals').doc(rentalId).get();
    if (!doc.exists) fail(404, 'Rental record not found.');
    rentals = [docData(doc)];
    if (String(rentals[0].customer_id ?? rentals[0].customerId) !== ownerId) fail(403, 'You can only view your own rentals.');
  } else {
    const snapshots = await Promise.all(['customer_id', 'customerId'].map(field => db.collection('rentals').where(field, '==', ownerId).get()));
    rentals = [...new Map(snapshots.flatMap(snapshot => snapshot.docs.map(docData)).map(rental => [rental.id, rental])).values()];
  }
  const itemIds = [...new Set(rentals.map(rental => rental.item_id ?? rental.itemId).filter(Boolean))];
  const itemDocs = await Promise.all(itemIds.map(id => db.collection('items').doc(String(id)).get()));
  const items = new Map(itemDocs.filter(doc => doc.exists).map(doc => [doc.id, doc.data()]));
  const result = rentals.map(rental => {
    const item = items.get(String(rental.item_id ?? rental.itemId));
    return {
      ...rental, id: rental.id, item_id: rental.item_id ?? rental.itemId,
      item_name: rental.item_name || rental.itemName || item?.name || 'Equipment',
      item_image_url: item?.image_url || item?.imageUrl || null,
      item_code: item?.item_code || item?.qrCode || '', qr_token: item?.qr_token || '',
      customer_id: rental.customer_id ?? rental.customerId, customer_name: rental.customer_name || rental.customerName,
      status: String(rental.status || '').toUpperCase(),
      start_at: rental.confirmed_rental_at || rental.start_at || null,
      hold_expires_at: rental.hold_expires_at || null,
      received_at: rental.received_at || null,
      due_at: rental.due_at || rental.dueDate,
      rental_fee: rental.rental_fee ?? rental.rateFee,
      delivery_location: rental.delivery_location || rental.deliveryLocation,
      payment_method: rental.payment_method || rental.paymentMethod,
      can_request_return: String(rental.status).toUpperCase() === 'ACTIVE' && isMobileRental(rental) && rental.latest_return_request_status !== 'PENDING_ADMIN_APPROVAL' && !rental.received_at
    };
  }).sort((a, b) => (asDate(b.created_at || b.start_at)?.getTime() || 0) - (asDate(a.created_at || a.start_at)?.getTime() || 0));
  return serializeMobile(rentalId ? { rental: result[0] } : { rentals: result });
}
