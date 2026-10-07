import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { DEFAULT_PRICING, validatePricing } from '../src/pricing.mjs';
import { firestore, requireFirebaseConfig } from '../src/firebase.mjs';
import { MOBILE_CATALOG, MOBILE_CATEGORIES } from '../src/mobile-catalog.mjs';

const applying = process.argv.includes('--apply');
const normalized = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const aliases = new Map([
  ['item_bike', ['bicycle', 'bike']],
  ['item_cards_deck', ['deckofcards', 'playingcards']],
  ['item_uno', ['unocards', 'uno']],
  ['item_bingo', ['bingoset', 'bingo']],
  ['item_ps4', ['playstation4console', 'playstation4', 'ps4console', 'ps4']],
  ['item_ps5', ['playstation5console', 'playstation5', 'ps5console', 'ps5']],
  ['item_switch', ['nintendoswitch', 'switch']]
]);
const keySet = item => new Set([normalized(item.name), ...(aliases.get(item.id) || []).map(normalized)]);
const categoryId = name => `category_${createHash('sha256').update(normalized(name)).digest('hex').slice(0, 32)}`;
const openRentalStatuses = new Set(['ACTIVE', 'PENDING_VERIFICATION', 'PENDING_ADMIN_APPROVAL', 'PENDING_ESP32_RENT', 'PENDING_RENTER_APPROVAL']);
const openMaintenanceStatuses = new Set(['OPEN', 'IN_PROGRESS']);
const timestampSafe = value => JSON.parse(JSON.stringify(value, (_key, child) => typeof child?.toDate === 'function' ? child.toDate().toISOString() : child));
const fail = message => { throw new Error(message); };

async function readCollection(name) {
  const snapshot = await firestore.collection(name).get();
  return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
}

function matchExistingItems(existingItems) {
  const unclaimed = new Map(existingItems.map(item => [item.id, item]));
  const matched = new Map();
  for (const catalogItem of MOBILE_CATALOG) {
    const byId = unclaimed.get(catalogItem.id);
    if (byId) {
      const keys = keySet(catalogItem);
      if (!keys.has(normalized(byId.name))) fail(`Item ID ${catalogItem.id} is already used by unrelated equipment "${byId.name}". Resolve that record before replacing the catalog.`);
      matched.set(catalogItem.id, byId);
      unclaimed.delete(byId.id);
      continue;
    }
    const keys = keySet(catalogItem);
    const candidates = [...unclaimed.values()].filter(item => keys.has(normalized(item.name)));
    if (candidates.length > 1) fail(`More than one current equipment record matches "${catalogItem.name}". Resolve duplicate records before replacing the catalog.`);
    if (candidates.length === 1) {
      matched.set(catalogItem.id, candidates[0]);
      unclaimed.delete(candidates[0].id);
    }
  }
  return { matched, obsolete: [...unclaimed.values()] };
}

function makeBackupPath() {
  const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
  return join(process.cwd(), 'backups', `equipment-before-mobile-catalog-${stamp}.json`);
}

async function commitOperations(operations) {
  for (let start = 0; start < operations.length; start += 400) {
    const batch = firestore.batch();
    for (const operation of operations.slice(start, start + 400)) operation(batch);
    await batch.commit();
  }
}

async function main() {
  requireFirebaseConfig();
  const [items, categories, rates, codes, rentals, maintenance, pricingSnapshot] = await Promise.all([
    ...['items', 'item_categories', 'item_rates', 'item_codes', 'rentals', 'maintenance_records'].map(readCollection),
    firestore.collection('settings').doc('pricing').get()
  ]);
  const { matched, obsolete } = matchExistingItems(items);
  const nextIds = new Map(MOBILE_CATALOG.map(item => [item.id, matched.get(item.id)?.id || item.id]));
  const catalogIdByDocumentId = new Map([...nextIds].map(([catalogId, documentId]) => [documentId, catalogId]));
  for (const catalogItem of MOBILE_CATALOG) {
    const registered = codes.find(code => code.id === catalogItem.qrCode);
    const assignedTo = registered?.item_id ? catalogIdByDocumentId.get(String(registered.item_id)) : null;
    if (assignedTo && assignedTo !== catalogItem.id) fail(`QR code ${catalogItem.qrCode} is already assigned to ${assignedTo}. Resolve that duplicate before replacing the catalog.`);
  }
  const nameById = new Map(items.map(item => [item.id, item.name]));
  const currentItemIds = new Set(items.map(item => item.id));
  const blockedRentals = rentals.filter(rental => openRentalStatuses.has(String(rental.status || '').toUpperCase()) && currentItemIds.has(String(rental.item_id ?? rental.itemId)));
  const blockedMaintenance = maintenance.filter(record => openMaintenanceStatuses.has(String(record.status || '').toUpperCase()) && currentItemIds.has(String(record.item_id)));
  if (blockedRentals.length) {
    const labels = blockedRentals.map(record => `${nameById.get(String(record.item_id ?? record.itemId)) || 'Equipment'} (${record.status})`);
    fail(`Catalog replacement stopped: open rentals still reference equipment being changed or removed: ${[...new Set(labels)].join(', ')}. Finish or cancel them first.`);
  }
  if (blockedMaintenance.length) {
    const labels = blockedMaintenance.map(record => `${nameById.get(String(record.item_id)) || 'Equipment'} (${record.status})`);
    fail(`Catalog replacement stopped: open maintenance records still reference equipment being changed or removed: ${[...new Set(labels)].join(', ')}. Complete them first.`);
  }
  const plannedPricing = validatePricing({
    products: DEFAULT_PRICING.products,
    rules: { ...DEFAULT_PRICING.rules, ...(pricingSnapshot.exists ? pricingSnapshot.data().rules || {} : {}) }
  });
  const targetCategories = MOBILE_CATEGORIES.map(name => ({ id: categoryId(name), name }));
  const matchedCount = matched.size;
  console.log(`Current database: ${items.length} equipment records, ${categories.length} categories.`);
  console.log(`Replacement catalog: ${MOBILE_CATALOG.length} equipment records in ${targetCategories.length} categories.`);
  console.log(`Will preserve ${matchedCount} matching item IDs, create ${MOBILE_CATALOG.length - matchedCount} records, and remove ${obsolete.length} unmatched equipment records.`);
  console.log(`The rate sheet will be replaced with mobile catalog rates while keeping the saved business rules.`);
  console.log('Availability will be reset only when there is no open rental or maintenance record; damaged and inspection-required equipment stays under maintenance.');
  if (!applying) {
    console.log('Dry run only. Review this plan, then rerun with --apply to write the database changes.');
    return;
  }

  const backupPath = makeBackupPath();
  await mkdir(dirname(backupPath), { recursive: true });
  await writeFile(backupPath, `${JSON.stringify(timestampSafe({
    created_at: new Date(),
    collections: { items, item_categories: categories, item_rates: rates, item_codes: codes },
    pricing: pricingSnapshot.exists ? pricingSnapshot.data() : null
  }), null, 2)}\n`, 'utf8');
  console.log(`Saved an equipment-only backup to ${backupPath}.`);

  const now = new Date();
  const categoryWrites = targetCategories.map(category => batch => batch.set(firestore.collection('item_categories').doc(category.id), {
    name: category.name,
    created_at: categories.find(old => old.id === category.id)?.created_at || now,
    created_by: 'mobile-catalog-replacement'
  }));
  await commitOperations(categoryWrites);

  const itemWrites = [];
  const rateWrites = [];
  const auditWrites = [];
  const historyWrites = [];
  const codeWrites = [];
  for (const catalogItem of MOBILE_CATALOG) {
    const previous = matched.get(catalogItem.id);
    const id = nextIds.get(catalogItem.id);
    const category = targetCategories.find(row => row.name === catalogItem.category);
    const itemRef = firestore.collection('items').doc(id);
    const condition = previous?.condition_status || 'GOOD';
    const status = ['DAMAGED', 'NEEDS_INSPECTION'].includes(String(condition).toUpperCase()) ? 'UNDER_MAINTENANCE' : 'AVAILABLE';
    const saved = {
      item_code: catalogItem.qrCode,
      qrCode: catalogItem.qrCode,
      qr_token: previous?.qr_token || catalogItem.qrCode,
      category_id: category.id,
      name: catalogItem.name,
      description: catalogItem.description,
      pricing_product_id: catalogItem.pricingProductId,
      image_name: catalogItem.imageName,
      is_for_sale: catalogItem.isForSale,
      ...(catalogItem.salePrice == null ? {} : { sale_price: catalogItem.salePrice }),
      condition_status: condition,
      status,
      is_active: true,
      created_at: previous?.created_at || now,
      updated_at: now
    };
    itemWrites.push(batch => batch.set(itemRef, saved));
    const activeRates = rates.filter(rate => rate.item_id === id && rate.is_active !== false);
    const currentRate = activeRates.sort((a, b) => {
      const left = typeof a.effective_from?.toDate === 'function' ? a.effective_from.toDate().getTime() : new Date(a.effective_from || 0).getTime();
      const right = typeof b.effective_from?.toDate === 'function' ? b.effective_from.toDate().getTime() : new Date(b.effective_from || 0).getTime();
      return right - left;
    })[0];
    const hasCorrectRate = currentRate && currentRate.rate_type === catalogItem.rateType && Number(currentRate.rental_rate) === catalogItem.rentalRate && Number(currentRate.deposit_amount) === catalogItem.deposit && Number(currentRate.late_penalty_rate) === catalogItem.latePenalty && activeRates.length === 1;
    if (!hasCorrectRate) {
      for (const rate of activeRates) rateWrites.push(batch => batch.update(firestore.collection('item_rates').doc(rate.id), { is_active: false, effective_to: now }));
      const rateRef = firestore.collection('item_rates').doc();
      rateWrites.push(batch => batch.create(rateRef, {
        item_id: id, rate_type: catalogItem.rateType, rental_rate: catalogItem.rentalRate,
        deposit_amount: catalogItem.deposit, late_penalty_rate: catalogItem.latePenalty,
        created_by: 'mobile-catalog-replacement', is_active: true, effective_from: now, effective_to: null
      }));
    }
    codeWrites.push(batch => batch.set(firestore.collection('item_codes').doc(catalogItem.qrCode), { item_id: id, created_at: now }));
    const previousStatus = String(previous?.status || '').toUpperCase();
    if (!previous || previousStatus !== status || previous.is_active === false) {
      const historyRef = firestore.collection('item_status_history').doc();
      historyWrites.push(batch => batch.create(historyRef, {
        item_id: id, old_status: previous?.status || null, new_status: status,
        source: 'SYSTEM', reference_type: 'MOBILE_CATALOG_REPLACEMENT',
        changed_by: 'mobile-catalog-replacement', changed_at: now
      }));
    }
    const auditRef = firestore.collection('audit_logs').doc();
    auditWrites.push(batch => batch.create(auditRef, {
      user_id: 'mobile-catalog-replacement', actor_type: 'SYSTEM',
      action: previous ? 'ITEM_UPDATED' : 'ITEM_CREATED', entity_type: 'ITEM', entity_id: id,
      old_values: previous ? { item_code: previous.item_code || null, name: previous.name, category_id: previous.category_id || null } : null,
      new_values: { item_code: catalogItem.qrCode, name: catalogItem.name, category_id: category.id, status, condition_status: condition, replaced_from_mobile_catalog: true },
      created_at: now
    }));
  }
  await commitOperations([...itemWrites, ...rateWrites, ...codeWrites, ...historyWrites, ...auditWrites]);

  const deleteWrites = [];
  for (const item of obsolete) {
    for (const rate of rates.filter(row => row.item_id === item.id && row.is_active !== false)) {
      deleteWrites.push(batch => batch.update(firestore.collection('item_rates').doc(rate.id), { is_active: false, effective_to: now }));
    }
    deleteWrites.push(batch => batch.delete(firestore.collection('items').doc(item.id)));
    const auditRef = firestore.collection('audit_logs').doc();
    deleteWrites.push(batch => batch.create(auditRef, {
      user_id: 'mobile-catalog-replacement', actor_type: 'SYSTEM',
      action: 'ITEM_DELETED', entity_type: 'ITEM', entity_id: item.id,
      old_values: { item_code: item.item_code || null, name: item.name, category_id: item.category_id || null },
      new_values: { deleted: true, replaced_from_mobile_catalog: true }, created_at: now
    }));
  }
  const targetCategoryIds = new Set(targetCategories.map(category => category.id));
  const targetQrCodes = new Set(MOBILE_CATALOG.map(item => item.qrCode));
  for (const code of codes.filter(row => !targetQrCodes.has(row.id))) {
    deleteWrites.push(batch => batch.delete(firestore.collection('item_codes').doc(code.id)));
  }
  for (const category of categories.filter(row => !targetCategoryIds.has(row.id))) {
    deleteWrites.push(batch => batch.delete(firestore.collection('item_categories').doc(category.id)));
    const auditRef = firestore.collection('audit_logs').doc();
    deleteWrites.push(batch => batch.create(auditRef, {
      user_id: 'mobile-catalog-replacement', actor_type: 'SYSTEM',
      action: 'ITEM_CATEGORY_DELETED', entity_type: 'ITEM_CATEGORY', entity_id: category.id,
      old_values: { name: category.name }, new_values: { deleted: true, replaced_from_mobile_catalog: true }, created_at: now
    }));
  }
  if (pricingSnapshot.exists) {
    const oldProducts = Array.isArray(pricingSnapshot.data().products) ? pricingSnapshot.data().products : [];
    const auditRef = firestore.collection('audit_logs').doc();
    deleteWrites.push(batch => batch.create(auditRef, {
      user_id: 'mobile-catalog-replacement', actor_type: 'SYSTEM',
      action: 'PRICING_UPDATED', entity_type: 'SETTINGS', entity_id: 'pricing',
      old_values: { product_count: oldProducts.length }, new_values: { product_count: plannedPricing.products.length, source: 'mobile-catalog' }, created_at: now
    }));
  }
  deleteWrites.push(batch => batch.set(firestore.collection('settings').doc('pricing'), {
    ...plannedPricing, updated_at: now, updated_by: 'mobile-catalog-replacement'
  }));
  await commitOperations(deleteWrites);
  console.log(`Replacement completed: ${MOBILE_CATALOG.length} equipment records and ${targetCategories.length} categories are now in Firestore.`);
  console.log(`The previous equipment records remain in the local backup and their rental, status, and audit history was retained.`);
}

try {
  await main();
} catch (error) {
  console.error(`Catalog replacement failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await firestore.terminate();
}
