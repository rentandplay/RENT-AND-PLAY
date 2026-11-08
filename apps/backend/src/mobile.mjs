import { asDate, docData } from './firebase.mjs';
import { inventoryList } from './inventory.mjs';
import { equipmentRateOptions, loadPricing, defaultReplacementCost } from './pricing.mjs';
import { normalizeRole } from './roles.mjs';
import { nameError, phoneError, validationFailure } from './account-validation.mjs';
import { pageLimit } from './query-validation.mjs';
import { DEFAULT_TERMS_AND_CONDITIONS, DEFAULT_RENTAL_TERMS, DEFAULT_PRIVACY_POLICY, DEFAULT_REFUND_POLICY, DEFAULT_ACCEPTED_IDS, DEFAULT_TERMS_VERSION, DEFAULT_RENTAL_TERMS_VERSION } from './terms-constants.mjs';
import { allocateCustomerCode } from './customer-codes.mjs';

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const money = amount => `₱${Number(amount).toFixed(2)}`;
const validAmount = amount => typeof amount === 'number' && Number.isFinite(amount) && amount >= 0;
export const isMobileRental = rental => rental.request_source === 'MOBILE_APP' || Boolean(rental.admin_review) || Boolean(rental.customerId);

export async function mobileProfile(db, claims, input = {}, method = 'GET', now = new Date(), onWrite = () => {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail(400, 'Profile details are required.');
  const userRef = db.collection('users').doc(String(claims.uid));
  const customerRef = db.collection('customers').doc(String(claims.uid));
  const customerSnap = await customerRef.get();
  let matchedCustomerRef = customerRef;
  let targetCustomerSnap = customerSnap;
  if (!customerSnap.exists && claims.email) {
    const matching = await db.collection('customers').where('email', '==', claims.email.toLowerCase()).get();
    const matchDoc = matching.docs.find(d => !d.data()?.auth_uid || d.data()?.auth_uid === String(claims.uid));
    if (matchDoc) {
      matchedCustomerRef = matchDoc.ref;
      targetCustomerSnap = matchDoc;
    }
  }
  const customerCode = !targetCustomerSnap.exists ? await allocateCustomerCode(db, now) : null;
  const { profile, created, customerCreated } = await db.runTransaction(async tx => {
    const doc = await tx.get(userRef);
    const existing = doc.exists ? doc.data() : null;
    const isGoogleAccount = claims.firebase?.sign_in_provider === 'google.com' || Boolean(claims.firebase?.identities?.['google.com']);
    const isVerified = claims.email_verified === true || isGoogleAccount;
    if (!existing && !isVerified) fail(403, 'Verify your email before creating an account.');
    if (existing?.is_active === false) fail(403, 'Your account is inactive. Contact an administrator.');
    const existingRole = existing ? normalizeRole(existing.role) : 'CUSTOMER';
    if (existing && !existingRole) fail(403, 'This account has no supported app role. Contact the workspace owner.');
    const clean = (value, max, label) => {
      if (typeof value !== 'string' || value.trim().length > max) fail(400, `Enter a valid ${label}.`);
      return value.trim();
    };
    if (!existing && input.name !== undefined) validationFailure(nameError(input.name));
    if (!existing && input.phone !== undefined) validationFailure(phoneError(input.phone, false));
    const initialName = clean(input.name || claims.name || claims.email?.split('@')[0] || 'Customer', 150, 'name');
    const initialPhone = clean(input.phone || claims.phone_number || '', 40, 'phone');
    const initialPhoto = input.profileImageUrl ? clean(input.profileImageUrl, 2048, 'profile image') : (claims.picture ? clean(claims.picture, 2048, 'profile image') : null);
    const created = existing ? { ...existing, role: existingRole } : { full_name: initialName, email: claims.email || '', phone: initialPhone, profileImageUrl: initialPhoto, role: 'CUSTOMER', is_active: true, hasAcceptedTerms: false, created_at: now };
    const changes = {};
    if (method === 'PATCH' || method === 'POST') {
      if (input.notification_preferences !== undefined) {
        const prefs = input.notification_preferences;
        if (!prefs || typeof prefs !== 'object' || Array.isArray(prefs) || Object.keys(prefs).some(key => !['push_enabled', 'return_reminders'].includes(key)) || Object.values(prefs).some(value => typeof value !== 'boolean')) fail(400, 'Choose valid notification preferences.');
        changes.notification_preferences = { push_enabled: true, return_reminders: true, ...existing?.notification_preferences, ...prefs };
      }
      if (input.name !== undefined && input.name.trim()) {
        validationFailure(nameError(input.name));
        const newName = clean(input.name, 150, 'name');
        if (!existing?.full_name || existing.full_name === 'Customer' || existing.full_name === claims.email?.split('@')[0] || method === 'PATCH') {
          changes.full_name = newName;
          changes.name = newName;
        }
      }
      if (input.phone !== undefined && input.phone.trim()) {
        validationFailure(phoneError(input.phone, false));
        const newPhone = clean(input.phone, 40, 'phone');
        if (!existing?.phone || method === 'PATCH') changes.phone = newPhone;
      }
      if (input.hasAcknowledgedIdRequirement !== undefined) {
        if (typeof input.hasAcknowledgedIdRequirement !== 'boolean') fail(400, 'ID requirement acknowledgement must be true or false.');
        changes.hasAcknowledgedIdRequirement = input.hasAcknowledgedIdRequirement;
      } else if (input.validIdUrl === 'physical_id_presented') {
        // Compatibility for an older installed app. This is an acknowledgement,
        // never a claim that staff have already inspected the physical ID.
        changes.hasAcknowledgedIdRequirement = true;
      } else if (input.validIdUrl !== undefined) fail(400, 'Use the ID requirement acknowledgement field.');
      if (input.profileImageUrl !== undefined) {
        changes.profileImageUrl = clean(input.profileImageUrl, 2048, 'profile image');
      } else if (!existing?.profileImageUrl && claims.picture) {
        changes.profileImageUrl = clean(claims.picture, 2048, 'profile image');
      }
    }
    if (method === 'PATCH' || (!existing && method === 'POST')) {
      if (input.hasAcceptedTerms !== undefined) {
        if (typeof input.hasAcceptedTerms !== 'boolean') fail(400, 'Choose whether to accept the rental terms.');
        changes.hasAcceptedTerms = input.hasAcceptedTerms;
        if (input.hasAcceptedTerms) changes.terms_accepted_at = now;
      }
      if (input.termsVersion !== undefined) {
        if (typeof input.termsVersion !== 'string' || !input.termsVersion.trim() || input.termsVersion.length > 40) fail(400, 'Choose a valid Terms & Conditions version.');
        changes.terms_version = input.termsVersion.trim();
      }
    }
    if (method === 'PATCH' || Object.keys(changes).length) {
      changes.updated_at = now;
    }
    let custCreated = false;
    const targetRole = existing ? existingRole : 'CUSTOMER';
    if (targetRole === 'CUSTOMER') {
      const customerDoc = await tx.get(matchedCustomerRef);
      if (!customerDoc.exists && customerCode) {
        const full_name = (changes.full_name || created.full_name || clean(input.name || claims.name || claims.email?.split('@')[0] || 'Customer', 150, 'name')).trim();
        tx.create(matchedCustomerRef, {
          full_name,
          search_name: full_name.toLowerCase().replace(/\s+/g, ' '),
          customer_code: customerCode,
          email: claims.email || created.email || null,
          phone: changes.phone || created.phone || clean(input.phone || '', 40, 'phone') || null,
          address: null,
          auth_uid: String(claims.uid),
          is_active: true,
          created_at: created.created_at || now,
          updated_at: now
        });
        custCreated = true;
      } else if (customerDoc.exists) {
        const customerChanges = {};
        if (!customerDoc.data()?.auth_uid) customerChanges.auth_uid = String(claims.uid);
        if (changes.full_name !== undefined) {
          customerChanges.full_name = changes.full_name;
          customerChanges.search_name = changes.full_name.toLowerCase().replace(/\s+/g, ' ');
        } else if (input.name && (customerDoc.data()?.full_name === 'Customer' || customerDoc.data()?.full_name === claims.email?.split('@')[0])) {
          const newName = clean(input.name, 150, 'name');
          customerChanges.full_name = newName;
          customerChanges.search_name = newName.toLowerCase().replace(/\s+/g, ' ');
        }
        if (changes.phone !== undefined) {
          customerChanges.phone = changes.phone || null;
        } else if (input.phone && !customerDoc.data()?.phone) {
          customerChanges.phone = clean(input.phone, 40, 'phone');
        }
        if (Object.keys(customerChanges).length) {
          customerChanges.updated_at = now;
          tx.update(matchedCustomerRef, customerChanges);
        }
      }
    }
    if (!existing) tx.create(userRef, { ...created, ...changes });
    else if (Object.keys(changes).length) tx.update(userRef, changes);
    return { profile: { ...created, ...changes }, created: !existing, customerCreated: custCreated };
  });
  if (created || customerCreated || method === 'PATCH' || (method === 'POST' && (created || customerCreated || Object.keys(changes).length))) {
    onWrite(['users', 'customers']);
  }
  return {
    user: serializeMobile({
      id: claims.uid,
      uid: claims.uid,
      name: profile.full_name || profile.name || '',
      full_name: profile.full_name || profile.name || '',
      email: profile.email || claims.email || '',
      phone: profile.phone || '',
      role: normalizeRole(profile.role) || 'CUSTOMER',
      notification_preferences: { push_enabled: true, return_reminders: true, ...profile.notification_preferences },
      mustChangePassword: profile.must_change_password === true,
      is_active: profile.is_active !== false,
      hasAcknowledgedIdRequirement: profile.hasAcknowledgedIdRequirement ?? Boolean(profile.validIdUrl || profile.valid_id_url),
      profileImageUrl: profile.profileImageUrl || null,
      hasAcceptedTerms: profile.hasAcceptedTerms ?? profile.has_accepted_terms ?? false,
      createdAt: profile.created_at || profile.createdAt || null
    }),
    created,
    customerCreated
  };
}

// Only configured equipment belongs in the customer catalog; admin inventory retains all records.
export async function mobileCatalog(db) {
  const [inventory, pricing] = await Promise.all([inventoryList(db), loadPricing(db)]);
  const products = new Map(pricing.products.map(product => [product.id, product]));
  const groups=new Map();
  for(const item of inventory.items.filter(item=>item.is_active!==false&&typeof item.name==='string'&&item.name.trim())){
    const key=String(item.stock_group_id||item.id);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);
  }
  const items=[...groups.entries()].flatMap(([stockGroupId,units])=>{
    units.sort((a,b)=>{const aa=a.effective_status==='AVAILABLE',bb=b.effective_status==='AVAILABLE';return aa!==bb?(aa?-1:1):String(a.item_code||'').localeCompare(String(b.item_code||''));});
    const item=units.find(unit=>unit.effective_status==='AVAILABLE')||units[0];
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
    const availableQuantity=Number(item.available_quantity??units.filter(unit=>unit.effective_status==='AVAILABLE').length);
    const totalQuantity=Number(item.total_quantity??units.length);
    const reservedQuantity=Number(item.reserved_quantity??units.filter(unit=>unit.effective_status==='RESERVED_PENDING').length);
    const rentedQuantity=Number(item.rented_quantity??units.filter(unit=>['RENTED','UNDER_INSPECTION'].includes(unit.effective_status)).length);
    const maintenanceQuantity=Number(item.maintenance_quantity??units.filter(unit=>unit.effective_status==='UNDER_MAINTENANCE').length);
    const status=availableQuantity>0?'AVAILABLE':reservedQuantity>0?'RESERVED_PENDING':rentedQuantity>0?'RENTED':maintenanceQuantity>0?'UNDER_MAINTENANCE':'UNAVAILABLE';
    const salePrice = product?.sale_price ?? item.sale_price ?? null;
    return [{
      id: stockGroupId, stock_group_id:stockGroupId, name: item.name, category: item.category, description: item.description || '',
      available_quantity:availableQuantity,total_quantity:totalQuantity,reserved_quantity:reservedQuantity,rented_quantity:rentedQuantity,maintenance_quantity:maintenanceQuantity,
      item_code: item.item_code || item.qrCode || '', qr_token: item.qr_token || '', status,
      image_data: item.image_data || null, image_url: item.image_url || item.imageUrl || null,
      image_name: item.image_name || null,
      is_for_sale: item.is_for_sale === true || salePrice !== null, sale_price: salePrice, sale_label: product?.sale_label || null,
      rate_text: product ? product.rate_options.map(rate => `${money(rate.amount)} / ${rate.label}`).join(' · ') : `${money(item.rental_rate)} / ${{ HOURLY: 'hour', DAILY: 'day', FLAT: 'rental' }[item.rate_type]}`,
      rate_type: product ? 'RATE_SHEET' : item.rate_type,
      rental_rate: product?.overtime_rate_per_hour ?? item.rental_rate,
      late_penalty_rate: product?.overtime_rate_per_hour ?? item.late_penalty_rate,
      replacement_cost: Number(item.replacement_cost ?? defaultReplacementCost(item)),
      pricing_product_id: hasItemSpecificRates ? null : item.pricing_product_id, rate_options: product?.rate_options || [],
      can_rent: availableQuantity > 0,
      unavailable_reason: availableQuantity > 0 ? null : 'This equipment is currently unavailable.'
    }];
  });
  return { items, categories: [...new Set(items.map(item => item.category))].sort() };
}

export async function mobilePaymentInstructions(db) {
  const snapshot = await db.collection('settings').doc('business').get();
  const settings = snapshot.exists ? snapshot.data() : {};
  const qrUrl = settings.instapay_qr_data_url || settings.gcash_qr_data_url || null;
  return {
    instapay_qr_data_url: qrUrl,
    gcash_qr_data_url: qrUrl,
    account_name: settings.instapay_account_name || settings.gcash_account_name || null,
    account_number: settings.instapay_account_number || settings.gcash_account_number || null,
    instructions: settings.instapay_instructions || settings.payment_instructions || 'Pay the exact amount shown and upload a screenshot of the successful transfer.',
    payment_method_label: 'InstaPay / GCash',
    accept_cash: settings.accept_cash !== false
  };
}

export async function mobileTerms(db) {
  const snapshot = await db.collection('settings').doc('business').get();
  const settings = snapshot.exists ? snapshot.data() : {};
  return {
    terms_and_conditions: settings.terms_and_conditions || DEFAULT_TERMS_AND_CONDITIONS,
    rental_terms: settings.rental_terms || DEFAULT_RENTAL_TERMS,
    privacy_policy: settings.privacy_policy || DEFAULT_PRIVACY_POLICY,
    refund_policy: settings.refund_policy || DEFAULT_REFUND_POLICY,
    accepted_id_types: settings.accepted_id_types || DEFAULT_ACCEPTED_IDS,
    terms_version: settings.terms_version || DEFAULT_TERMS_VERSION,
    rental_terms_version: settings.terms_version || DEFAULT_RENTAL_TERMS_VERSION,
    updated_at: settings.terms_updated_at || null
  };
}

export async function resolveMobileItem(db, input) {
  const code = typeof input?.code === 'string' ? input.code.trim() : '';
  if (!code || code.length > 512) fail(400, 'Scan a valid equipment QR label.');
  const [inventory,catalog]=await Promise.all([inventoryList(db),mobileCatalog(db)]);
  const normalized=code.toLowerCase(),matchedUnits=inventory.items.filter(unit=>unit.is_active!==false&&[unit.id,unit.item_code,unit.qrCode,unit.qr_token,unit.legacy_item_code].some(value=>value&&String(value).toLowerCase()===normalized));
  const groups=new Set(matchedUnits.map(unit=>String(unit.stock_group_id||unit.id)));
  const matches=catalog.items.filter(item=>groups.has(item.stock_group_id)||[item.id,item.item_code,item.qr_token].some(value=>value&&String(value).toLowerCase()===normalized));
  if (matches.length !== 1 || matchedUnits.length > 1) fail(404, 'This QR label does not identify a unique active equipment record.');
  const scannedUnit = matchedUnits[0];
  return { item: { ...matches[0], scanned_unit_id: scannedUnit?.id || null, scanned_unit_code: scannedUnit?.item_code || null } };
}

export function serializeMobile(value) {
  if (value instanceof Date || typeof value?.toDate === 'function') return asDate(value).toISOString();
  if (Array.isArray(value)) return value.map(serializeMobile);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !/deposit/i.test(key)).map(([key, entry]) => [key, serializeMobile(entry)]));
  return value;
}

export async function mobileRentalList(db, actor, rentalId = '', options = {}) {
  const ownerId = String(actor.id);
  let rentals;
  if (rentalId) {
    const doc = await db.collection('rentals').doc(rentalId).get();
    if (!doc.exists) fail(404, 'Rental record not found.');
    rentals = [docData(doc)];
    if (String(rentals[0].customer_id ?? rentals[0].customerId) !== ownerId) fail(403, 'You can only view your own rentals.');
  } else {
    const limit=pageLimit(options.limit);
    let cursor=null;
    if(options.cursor){cursor=await db.collection('rentals').doc(String(options.cursor)).get();if(!cursor.exists||String(cursor.data().customer_id??cursor.data().customerId)!==ownerId)fail(400,'Refresh your rental history before loading another page.');}
    const fields=['customer_id','customerId'],closedStates=['COMPLETED','CANCELLED','REJECTED','EXPIRED'],openStates=['ACTIVE','APPROVED','RETURN_PENDING_INSPECTION','PENDING_ADMIN_APPROVAL','PENDING_ESP32_RENT','PENDING_VERIFICATION','PENDING_ESP32_RETURN','PENDING_RETURN_VERIFICATION'],closed=[...closedStates,...closedStates.map(s=>s.toLowerCase())],open=[...openStates,...openStates.map(s=>s.toLowerCase())];
    const snapshots=await Promise.all(fields.map(async field=>{
      let query=db.collection('rentals').where(field,'==',ownerId).where('status','in',closed).orderBy('__name__');if(cursor)query=query.startAfter(cursor);return query.limit(limit+1).get();
    }));
    const history=[...new Map(snapshots.flatMap(snapshot=>snapshot.docs.map(docData)).map(rental=>[rental.id,rental])).values()].sort((a,b)=>a.id.localeCompare(b.id));
    const current=cursor?[]:(await Promise.all(fields.map(field=>db.collection('rentals').where(field,'==',ownerId).where('status','in',open).get()))).flatMap(snapshot=>snapshot.docs.map(docData));
    options.nextCursor=history.length>limit?history[limit-1].id:null;
    rentals=[...new Map([...current,...history.slice(0,limit)].map(rental=>[rental.id,rental])).values()];
  }
  const itemIds = [...new Set(rentals.map(rental => rental.item_id ?? rental.itemId).filter(Boolean))];
  const itemDocs = await Promise.all(itemIds.map(id => db.collection('items').doc(String(id)).get()));
  const items = new Map(itemDocs.filter(doc => doc.exists).map(doc => [doc.id, doc.data()]));
  const result = rentals.map(rental => {
    const item = items.get(String(rental.item_id ?? rental.itemId));
    return {
      ...rental, id: rental.id, item_id: rental.item_id ?? rental.itemId,
      stock_group_id:rental.stock_group_id||item?.stock_group_id||item?.id||rental.item_id||rental.itemId,
      item_name: rental.item_name || rental.itemName || item?.name || 'Equipment',
      item_image_url: item?.image_url || item?.imageUrl || null,
      item_code: item?.item_code || item?.qrCode || '', qr_token: item?.qr_token || '',
      customer_id: rental.customer_id ?? rental.customerId, customer_name: rental.customer_name || rental.customerName,
      status: String(rental.status || '').toUpperCase(),
      start_at: rental.confirmed_rental_at || rental.start_at || null,
      hold_expires_at: rental.handoff_expires_at || rental.hold_expires_at || null,
      received_at: rental.received_at || null,
      due_at: rental.due_at || rental.dueDate,
      rental_fee: rental.rental_fee ?? rental.rateFee,
      delivery_location: rental.delivery_location || rental.deliveryLocation,
      payment_method: rental.payment_method || rental.paymentMethod,
      can_request_return: String(rental.status).toUpperCase() === 'ACTIVE' && isMobileRental(rental) && rental.latest_return_request_status !== 'PENDING_ADMIN_APPROVAL' && !rental.received_at
    };
  }).sort((a, b) => (asDate(b.created_at || b.start_at)?.getTime() || 0) - (asDate(a.created_at || a.start_at)?.getTime() || 0));
  return serializeMobile(rentalId ? { rental: result[0] } : { rentals: result, nextCursor:options.nextCursor||null });
}


// Public, deliberately allowlisted business details. Never expose staff settings or secrets.
export async function mobileBusinessSettings(db) {
  const doc = await db.collection('settings').doc('business').get();
  const saved = doc.exists ? doc.data() : {};
  const defaults = { business_name: 'Rent & Play', location: 'Los Baños, Laguna', timezone: 'Asia/Manila', opens_at: '08:00', closes_at: '20:00', default_late_grace_hours: 0, announcement_enabled: false, announcement_text: '', terms_version: '', contact_phone: '0992-768-5192', contact_channels: 'Call / Text / Viber' };
  return { settings: Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, saved[key] ?? value])) };
}

export async function mobileCustomerTrust(db, id, now = new Date()) {
  const doc = await db.collection('customers').doc(id).get();
  if (!doc.exists) fail(404, 'Customer not found.');
  const customer = doc.data();
  const ids = [...new Set([id, customer.auth_uid].filter(Boolean))];
  const snapshots = await Promise.all(ids.flatMap(uid => ['customer_id', 'customerId'].map(field => db.collection('rentals').where(field, '==', uid).get())));
  const rentals = [...new Map(snapshots.flatMap(snapshot => snapshot.docs.map(docData)).map(row => [row.id, row])).values()];
  return { trust: {
    completed_rentals: rentals.filter(row => String(row.status).toUpperCase() === 'COMPLETED').length,
    active_overdue: rentals.filter(row => ['ACTIVE', 'RENTED'].includes(String(row.status).toUpperCase()) && !row.received_at && asDate(row.due_at || row.dueDate)?.getTime() < now.getTime()).length,
    physical_id_verified: customer.physical_id_verified === true || rentals.some(row => row.handoff_verification?.physical_id_verified === true)
  } };
}
