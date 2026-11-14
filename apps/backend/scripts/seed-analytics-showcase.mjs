import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { firestore as db, docData, asDate } from '../src/firebase.mjs';
import { isSupabaseConfigured, encodeSupabaseValue, decodeSupabaseValue } from '../src/supabase.mjs';
import { allocateRecordCodes } from '../src/record-codes.mjs';
import { businessDay } from '../src/payment-ledger.mjs';
import { healthyUnit, isOpenMaintenance } from '../src/maintenance-state.mjs';
import { rentalFinanceContribution } from '../src/rental-payment-state.mjs';
import { equipmentRentalContribution } from '../src/equipment-ranking.mjs';
import { loadPricing } from '../src/pricing.mjs';
import { isStaffRole } from '../src/roles.mjs';

const apply = process.argv.includes('--apply');
const cleanup = process.argv.includes('--cleanup');

if (!isSupabaseConfigured() || process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('This tool requires the configured Supabase database.');
}

const DAY = 86400000;
const MINUTE = 60000;
const HOUR = 3600000;
const round = (v) => Math.round(Number(v || 0) * 100) / 100;
const shiftDay = (key, days) => new Date(Date.parse(key + 'T00:00:00Z') + days * DAY).toISOString().slice(0, 10);
const overlaps = (a, b, c, d) => a < d && c < b;
const millis = (v) => asDate(v)?.getTime() ?? null;
const sha = (v) => createHash('sha256').update(v).digest('hex');

const now = new Date();
const today = businessDay(now);
const manifestRef = db.collection('report_summary_state').doc('presentation_demo');
const showcaseRef = db.collection('report_summary_state').doc('showcase_state');
const backupRoot = fileURLToPath(new URL('../backups/', import.meta.url));
await mkdir(backupRoot, { recursive: true });

// Deterministic pseudo-random generator for reproducible showcase data
function makeRng(seed = 20261114) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function rentalContribution(rental) {
  const start = asDate(rental?.confirmed_rental_at);
  const status = String(rental?.status || '').toUpperCase();
  const dated = start && Number.isFinite(start.getTime());
  if (!dated && !['ACTIVE', 'RETURN_PENDING_INSPECTION', 'COMPLETED'].includes(status)) return null;
  const num = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : 0);
  const rawFee = rental.rental_fee ?? rental.rateFee;
  const rawFinal = rental.fee_breakdown?.final_rental_charges ?? rawFee;
  const day = dated ? businessDay(start) : null;
  const fees = num(rawFee);
  const known = rawFee != null && Number.isFinite(Number(rawFee)) && Number(rawFee) >= 0 && rawFinal != null && Number.isFinite(Number(rawFinal)) && Number(rawFinal) >= 0;
  return {
    day,
    rentals: 1,
    fees,
    final_charges: num(rawFinal),
    unknown_charges: known ? 0 : 1,
    item_id: rental.item_id || rental.itemId || null,
    customer_id: rental.customer_id || rental.customerId || null,
    active: status === 'ACTIVE' ? 1 : 0,
    completed: status === 'COMPLETED' ? 1 : 0
  };
}

async function batchWriteSets(entries, chunkSize = 50) {
  for (let i = 0; i < entries.length; i += chunkSize) {
    const chunk = entries.slice(i, i + chunkSize);
    const batch = db.batch();
    for (const { ref, data, merge = false } of chunk) {
      batch.set(ref, data, { merge });
    }
    await batch.commit();
  }
}

async function batchDeletes(refs, chunkSize = 50) {
  for (let i = 0; i < refs.length; i += chunkSize) {
    const chunk = refs.slice(i, i + chunkSize);
    const batch = db.batch();
    for (const ref of chunk) {
      batch.delete(ref);
    }
    await batch.commit();
  }
}

async function rebuildAllDerivedSummaries() {
  const [rentalsSnap, coverageSnap] = await Promise.all([
    db.collection('rentals').get(),
    db.collection('rental_payment_totals').get()
  ]);

  const coverageByRental = new Map(coverageSnap.docs.map((d) => [d.id, d.data()]));
  const dailyMap = new Map();
  const finDailyMap = new Map();
  const custMap = new Map();
  const equipDailyMap = new Map();
  const equipTotalsMap = new Map();
  const snapshotSets = [];

  for (const doc of rentalsSnap.docs) {
    const rental = docData(doc);
    const after = rentalContribution(rental);
    const created = asDate(rental.created_at || rental.startDate);
    const createdDay = created && Number.isFinite(created.getTime()) ? businessDay(created) : null;
    const financeAfter = rentalFinanceContribution(rental, coverageByRental.get(doc.id) || {}, createdDay);
    const equipAfter = equipmentRentalContribution(rental, now);

    snapshotSets.push({
      ref: db.collection('rental_report_snapshots').doc(doc.id),
      data: {
        contribution: after,
        finance_contribution: financeAfter,
        equipment_contribution: equipAfter,
        updated_at: now
      }
    });

    if (after?.day) {
      const cur = dailyMap.get(after.day) || { business_day: after.day, rentals: 0, fees: 0, final_charges: 0, unknown_charges: 0, updated_at: now };
      cur.rentals = round(cur.rentals + after.rentals);
      cur.fees = round(cur.fees + after.fees);
      cur.final_charges = round(cur.final_charges + after.final_charges);
      cur.unknown_charges = round(cur.unknown_charges + after.unknown_charges);
      dailyMap.set(after.day, cur);
    }

    if (after?.customer_id) {
      const cur = custMap.get(after.customer_id) || { rentals: 0, active: 0, completed: 0, fees: 0, updated_at: now };
      cur.rentals = round(cur.rentals + after.rentals);
      cur.active = round(cur.active + after.active);
      cur.completed = round(cur.completed + after.completed);
      cur.fees = round(cur.fees + after.fees);
      custMap.set(after.customer_id, cur);
    }

    if (financeAfter?.day) {
      const cur = finDailyMap.get(financeAfter.day) || {
        business_day: financeAfter.day,
        rentals: 0, charges: 0, saved_paid: 0, saved_refunded: 0,
        balance_due: 0, refund_due: 0, unposted_paid: 0, unposted_count: 0,
        unknown_payments: 0, unknown_charges: 0, updated_at: now
      };
      for (const m of ['rentals', 'charges', 'saved_paid', 'saved_refunded', 'balance_due', 'refund_due', 'unposted_paid', 'unposted_count', 'unknown_payments', 'unknown_charges']) {
        cur[m] = round(cur[m] + Number(financeAfter[m] || 0));
      }
      finDailyMap.set(financeAfter.day, cur);
    }

    if (equipAfter) {
      const tot = equipTotalsMap.get(equipAfter.key) || {
        equipment_key: equipAfter.key,
        item_id: equipAfter.item_id,
        stock_group_id: equipAfter.stock_group_id,
        item_name: equipAfter.item_name,
        rentals: 0,
        fees: 0,
        updated_at: now
      };
      tot.rentals += equipAfter.rentals;
      tot.fees = round(tot.fees + equipAfter.fees);
      equipTotalsMap.set(equipAfter.key, tot);

      const dId = sha(`${equipAfter.day}:${equipAfter.key}`);
      const dRow = equipDailyMap.get(dId) || {
        equipment_key: equipAfter.key,
        item_id: equipAfter.item_id,
        stock_group_id: equipAfter.stock_group_id,
        item_name: equipAfter.item_name,
        business_day: equipAfter.day,
        rentals: 0,
        fees: 0,
        updated_at: now
      };
      dRow.rentals += equipAfter.rentals;
      dRow.fees = round(dRow.fees + equipAfter.fees);
      equipDailyMap.set(dId, dRow);
    }
  }

  // Clear stale summary docs first so deletions/cleanups never leave leftover totals
  for (const col of ['rental_daily', 'rental_financial_daily', 'customer_report_summaries', 'equipment_rental_daily', 'equipment_rental_totals', 'rental_report_snapshots']) {
    const existing = await db.collection(col).get();
    if (!existing.empty) {
      await batchDeletes(existing.docs.map((d) => d.ref));
    }
  }

  await batchWriteSets([
    ...[...dailyMap.entries()].map(([id, data]) => ({ ref: db.collection('rental_daily').doc(id), data })),
    ...[...finDailyMap.entries()].map(([id, data]) => ({ ref: db.collection('rental_financial_daily').doc(id), data })),
    ...[...custMap.entries()].map(([id, data]) => ({ ref: db.collection('customer_report_summaries').doc(id), data })),
    ...[...equipTotalsMap.entries()].map(([id, data]) => ({ ref: db.collection('equipment_rental_totals').doc(id), data })),
    ...[...equipDailyMap.entries()].map(([id, data]) => ({ ref: db.collection('equipment_rental_daily').doc(id), data })),
    ...snapshotSets
  ]);

  await db.collection('report_summary_state').doc('coverage').set({
    backfill_complete: true,
    rentals_reviewed: rentalsSnap.size,
    reconciled_at: now
  });

  return rentalsSnap.size;
}

if (cleanup) {
  const showcaseSnap = await showcaseRef.get();
  const manifest = showcaseSnap.exists ? showcaseSnap : await manifestRef.get();
  if (!manifest.exists || !manifest.data().active) {
    throw new Error('There is no active analytics showcase batch.');
  }
  const batchId = manifest.data().batch_id;
  const planPath = path.join(backupRoot, `analytics-${batchId}-plan.json`);
  const plan = decodeSupabaseValue(JSON.parse(await readFile(planPath, 'utf8')));

  const [rentalsSnap, verifSnap, maintSnap] = await Promise.all([
    db.collection('rentals').where('demo_batch_id', '==', batchId).get(),
    db.collection('verification_requests').where('demo_batch_id', '==', batchId).get(),
    db.collection('maintenance_records').where('demo_batch_id', '==', batchId).get()
  ]);

  if (apply) {
    await batchDeletes([
      ...rentalsSnap.docs.map((d) => d.ref),
      ...verifSnap.docs.map((d) => d.ref),
      ...maintSnap.docs.map((d) => d.ref)
    ]);

    if (Array.isArray(plan.originalItemCreatedAt) && plan.originalItemCreatedAt.length) {
      await batchWriteSets(
        plan.originalItemCreatedAt.map((entry) => ({
          ref: db.collection('items').doc(entry.id),
          data: { created_at: entry.created_at },
          merge: true
        }))
      );
    }

    if (plan.originalAnalyticsTargets !== undefined) {
      const bizRef = db.collection('settings').doc('business');
      const bizSnap = await bizRef.get();
      if (bizSnap.exists) {
        const cur = bizSnap.data();
        if (plan.originalAnalyticsTargets === null) {
          delete cur.analytics_targets;
          await bizRef.set(cur, { merge: false });
        } else {
          await bizRef.set({ analytics_targets: plan.originalAnalyticsTargets }, { merge: true });
        }
      }
    }

    await rebuildAllDerivedSummaries();
    await showcaseRef.set({
      ...manifest.data(),
      active: false,
      status: 'removed',
      removed_at: new Date(),
      removed_count: rentalsSnap.size
    });
    await manifestRef.set({ active: false, status: 'removed', removed_at: new Date() }, { merge: true });
  }

  console.log(JSON.stringify({
    apply,
    cleanup: true,
    batchId,
    removedRentals: rentalsSnap.size,
    removedVerifications: verifSnap.size,
    removedMaintenance: maintSnap.size
  }, null, 2));
  process.exit(0);
}

// --- SEED / BUILD SHOWCASE PLAN ---
const [manifest, showcaseState] = await Promise.all([manifestRef.get(), showcaseRef.get()]);
if ((manifest.exists && manifest.data().active) || (showcaseState.exists && showcaseState.data().active)) {
  const activeId = (showcaseState.exists && showcaseState.data().active) ? showcaseState.data().batch_id : manifest.data().batch_id;
  throw new Error(`An active batch (${activeId}) already exists. Run with --cleanup --apply first.`);
}

const [itemsSnap, customersSnap, usersSnap, rentalsSnap, maintSnap, pricing, bizSnap] = await Promise.all([
  db.collection('items').get(),
  db.collection('customers').get(),
  db.collection('users').get(),
  db.collection('rentals').get(),
  db.collection('maintenance_records').get(),
  loadPricing(db),
  db.collection('settings').doc('business').get()
]);

const allItems = itemsSnap.docs.map(docData);
const profiles = new Map(usersSnap.docs.map((d) => [d.id, d.data()]));
const customers = customersSnap.docs
  .map(docData)
  .filter((c) => c.is_active !== false && !isStaffRole(profiles.get(c.auth_uid)?.role));

const existingRentals = rentalsSnap.docs.map(docData);
const existingMaint = maintSnap.docs.map(docData);
const products = pricing.products || [];

// Group active/usable equipment units (including Bicycle rented unit & PS4 before Oct 14 maintenance)
const activeCatalogItems = allItems.filter((item) => item.is_active !== false);
const baselineCreatedAt = new Date('2024-11-01T00:00:00+08:00');
const originalItemCreatedAt = activeCatalogItems
  .filter((item) => {
    const t = millis(item.created_at);
    return t === null || t > baselineCreatedAt.getTime();
  })
  .map((item) => ({ id: item.id, created_at: item.created_at || null }));

const units = activeCatalogItems
  .map((item) => {
    const product = products.find((p) => p.id === item.pricing_product_id) ||
      products.find((p) => p.name.toLowerCase() === String(item.name || '').toLowerCase());
    return { item, product };
  })
  .filter((u) => u.product && Array.isArray(u.product.rate_options) && u.product.rate_options.length > 0)
  .sort((a, b) => a.item.id.localeCompare(b.item.id));

// Build occupancy intervals from real rentals & real open/historical maintenance
const occupancy = new Map();
const addOcc = (itemId, start, end) => {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
  if (!occupancy.has(itemId)) occupancy.set(itemId, []);
  occupancy.get(itemId).push([start, end]);
};

for (const r of existingRentals) {
  if (!['ACTIVE', 'COMPLETED', 'RETURN_PENDING_INSPECTION', 'APPROVED'].includes(r.status)) continue;
  const start = millis(r.confirmed_rental_at || r.start_at || r.scheduled_start_at);
  const end = r.status === 'ACTIVE' || r.status === 'APPROVED'
    ? now.getTime() + 7 * DAY
    : millis(r.received_at || r.confirmed_return_at);
  if (start && end) addOcc(r.item_id, start, end);
}

for (const m of existingMaint) {
  const start = millis(m.started_at);
  const end = ['OPEN', 'IN_PROGRESS'].includes(m.status) ? now.getTime() + 7 * DAY : millis(m.completed_at);
  if (start && end) addOcc(m.item_id, start, end);
}

// Segment customers for realistic K-Means clustering + Churn Watch (>21 days)
// First check which customers already have real rentals in the last 21 days
const recentRealCust = new Set(
  existingRentals
    .filter((r) => ['ACTIVE', 'COMPLETED', 'RETURN_PENDING_INSPECTION'].includes(r.status))
    .filter((r) => {
      const t = millis(r.confirmed_rental_at);
      return t && now.getTime() - t <= 21 * DAY;
    })
    .map((r) => r.customer_id)
);

const inactiveCohort = customers.filter((c) => !recentRealCust.has(c.id)).slice(0, 2);
const inactiveSet = new Set(inactiveCohort.map((c) => c.id));
const activeCohort = customers.filter((c) => !inactiveSet.has(c.id));
// Give top frequent/high-spend weight to first 2 active customers, moderate to next, light to rest
const frequentCustomers = activeCohort.slice(0, 2);
const regularCustomers = activeCohort.slice(2);

const batchId = `showcase-${today}-v1`;
const rng = makeRng(20261114);
const days = 364;
const priorDays = 365;
const startDay = shiftDay(today, -days); // 2025-11-15 to 2026-11-13

// Balanced seasonal peaks (above goal) & off-peak troughs (below goal) across 2025-11 through 2026-11
const monthFactor = {
  '2025-11': 0.78,
  '2025-12': 1.42, // holiday season peak
  '2026-01': 0.62, // post-holiday dip
  '2026-02': 0.68,
  '2026-03': 0.88,
  '2026-04': 1.34, // summer peak
  '2026-05': 1.40,
  '2026-06': 0.65, // rainy start
  '2026-07': 0.74,
  '2026-08': 0.92,
  '2026-09': 1.12,
  '2026-10': 1.44, // strong Q4 recovery
  '2026-11': 1.48
};
const priorMonthSeason = [0.64, 0.92, 0.54, 0.58, 0.70, 0.86, 0.90, 0.56, 0.62, 0.68, 0.74, 0.76];

// Demand weights by equipment name for Pareto 80-20 distribution
const equipWeight = {
  'Uno Cards': 2.5,
  'Bicycle': 2.2,
  'Nintendo Switch': 2.0,
  'Badminton Set': 1.8,
  'Jenga': 1.4,
  'Deck of Cards': 1.1,
  'Volleyball': 1.0,
  'Scrabble': 0.9,
  'Basketball': 0.8,
  'Pickleball Set': 0.7,
  'Chess Set': 0.65,
  'PlayStation 4 Console': 0.55,
  'Bingo Set': 0.25 // intentionally lower & kept quiet last 28d for idle/least-rented contrast
};

// Build weighted unit pool
const weightedUnits = [];
for (const u of units) {
  const w = Math.max(1, Math.round((equipWeight[u.item.name] || 0.6) * 4));
  for (let i = 0; i < w; i++) weightedUnits.push(u);
}

// Schedule 12 realistic historical maintenance records first so rentals avoid them
const maintTemplates = [
  { name: 'PlayStation 4 Console', issue_type: 'Controller drift & cooling routine check', details: 'Routine inspection of DualShock controller joystick drift, HDMI port, and thermal fan cleaning.' },
  { name: 'PlayStation 4 Console', issue_type: 'Battery & cable port inspection', details: 'Replaced worn charging cable and verified controller battery charging port.' },
  { name: 'Nintendo Switch', issue_type: 'Joy-Con stick drift & screen check', details: 'Routine inspection and calibration of Joy-Con joystick buttons and screen protector.' },
  { name: 'Nintendo Switch', issue_type: 'Battery & dock power check', details: 'Checked handheld battery health and USB-C power charging port.' },
  { name: 'Bicycle', issue_type: 'Tire wear & loose brake bolt service', details: 'Replaced worn rear tire tube, tightened loose brake bolt and wheel alignment.' },
  { name: 'Bicycle', issue_type: 'Chain cleaning & routine inspection', details: 'Routine inspection, tire pressure tune, and chain cleaning after wet resort path use.' },
  { name: 'Badminton Set', issue_type: 'Worn grip & cracked frame check', details: 'Replaced peeling handle grip tape and inspected racket string tension.' },
  { name: 'Pickleball Set', issue_type: 'Paddle edge scratch & grip replacement', details: 'Minor edge guard scratch repaired and fresh handle grip installed.' },
  { name: 'Volleyball', issue_type: 'Surface cleaning & valve inspection', details: 'Sanitized leather surface after sand/wet outdoor use and checked air pressure.' },
  { name: 'Basketball', issue_type: 'Surface wear & air valve routine check', details: 'Cleaned outdoor dust, checked rubber grip wear and inflated to spec.' },
  { name: 'Volleyball', issue_type: 'Net cord & air pressure check', details: 'Checked valve seal and replaced frayed boundary cord clip after beach group use.' },
  { name: 'Jenga', issue_type: 'Block sanding & bag strap repair', details: 'Cleaned wooden blocks and fixed loose carry bag strap buckle.' }
];

const plannedMaint = [];
const findUnitForMaint = (name) => {
  const matches = units.filter((u) => u.item.name === name);
  return matches[0]?.item || null;
};

// Deliberate schedule so repeat service records appear on the same physical unit across 365d, 90d, and 30d
const maintDayOffsets = [40, 118, days - 72, days - 20, days - 25, days - 7, 65, 148, days - 55, days - 58, days - 14, 180];
maintTemplates.forEach((tpl, idx) => {
  const item = findUnitForMaint(tpl.name);
  if (!item) return;
  const dayOffset = maintDayOffsets[idx] ?? Math.min(325, 22 + idx * 27);
  const dayKey = shiftDay(startDay, dayOffset);
  const startedAt = new Date(`${dayKey}T09:00:00+08:00`);
  const durationHours = 4 + (idx % 4) * 3;
  const completedAt = new Date(startedAt.getTime() + durationHours * HOUR);
  if ((occupancy.get(item.id) || []).some(([l, r]) => overlaps(startedAt.getTime(), completedAt.getTime(), l, r))) return;
  addOcc(item.id, startedAt.getTime(), completedAt.getTime());
  plannedMaint.push({
    id: `demo_maint_${batchId}_${String(idx + 1).padStart(2, '0')}`,
    is_demo: true,
    demo_batch_id: batchId,
    item_id: item.id,
    item_name: item.name,
    item_code: item.item_code || '',
    status: 'COMPLETED',
    issue_type: tpl.issue_type,
    details: tpl.details,
    inspection_notes: tpl.details,
    started_at: startedAt,
    completed_at: completedAt,
    created_at: startedAt,
    updated_at: now
  });
});

// Helper to pick a customer based on date recency & tier
function pickCustomer(dayKey, isHighSpend) {
  const daysAgo = Math.round((Date.parse(today + 'T00:00:00Z') - Date.parse(dayKey + 'T00:00:00Z')) / DAY);
  if (daysAgo > 35 && inactiveCohort.length && rng() < 0.22) {
    return inactiveCohort[Math.floor(rng() * inactiveCohort.length)];
  }
  if ((isHighSpend || rng() < 0.48) && frequentCustomers.length) {
    return frequentCustomers[Math.floor(rng() * frequentCustomers.length)];
  }
  const pool = regularCustomers.length ? regularCustomers : activeCohort;
  return pool[Math.floor(rng() * pool.length)];
}

// Helper to build a single rental + optional verification request
const plannedRentals = [];
const plannedVerifs = [];
let seqCounter = 0;

function tryAddRental({ item, product, dayKey, hour, minute, customer, forceWholeStay = false, forceChannel = null, forceLate = null, forceSlowVerif = false }) {
  const rates = product.rate_options.filter((r) => r.amount > 0 && (r.duration_minutes > 0 || r.kind === 'WHOLE_STAY'));
  if (!rates.length) return null;

  let rate = rates[Math.floor(rng() * rates.length)];
  if (forceWholeStay) {
    const ws = rates.find((r) => r.kind === 'WHOLE_STAY');
    if (ws) rate = ws;
  }

  const isPriorYear = dayKey < startDay;
  let quantity = 1;
  let billedMinutes = Number(rate.duration_minutes || 0);
  let packageKind = rate.kind;

  if (rate.kind === 'WHOLE_STAY') {
    const stayDays = !isPriorYear && ['Nintendo Switch', 'Jenga'].includes(item.name) ? (2 + Math.floor(rng() * 2)) : 1;
    billedMinutes = stayDays * 24 * 60; // 24h-72h stay for realistic histogram spread & utilization
    packageKind = 'WHOLE_STAY';
  } else if (rate.kind === 'HOURLY') {
    quantity = 1 + Math.floor(rng() * 3); // 1 to 3 hours
    billedMinutes = rate.duration_minutes * quantity;
    packageKind = 'HOURLY';
  } else if (rate.kind === 'BLOCK' || rate.kind === 'PACKAGE') {
    packageKind = 'PACKAGE';
  } else if (rate.kind === 'SHORT') {
    packageKind = 'HOURLY';
  }

  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  const at = new Date(`${dayKey}T${hh}:${mm}:00+08:00`);
  const due = new Date(at.getTime() + billedMinutes * MINUTE);

  const fulfillmentMode = forceChannel || (rng() < (isPriorYear ? 0.34 : 0.42) ? 'DELIVERY' : 'SHOP_HANDOVER');
  const isEvening = hour >= 17 || hour < 6;
  const isDelivery = fulfillmentMode === 'DELIVERY';

  // Clear Decision-Tree signal: Resort delivery carries ~42% late risk (Evening 48% / Day 38%)
  // while Shop counter stays low (~8%), keeping current blended late rate ~22.5% vs ~14% prior year.
  let lateProb = isPriorYear ? 0.05 : 0.06;
  if (isPriorYear) {
    lateProb = isDelivery ? (isEvening ? 0.30 : 0.22) : (isEvening ? 0.10 : 0.05);
  } else if (isDelivery) {
    lateProb = isEvening ? 0.48 : 0.38;
  } else if (isEvening) {
    lateProb = 0.12;
  }

  const isLate = forceLate !== null ? forceLate : rng() < lateProb;
  const lateMinutes = isLate ? 20 + Math.floor(rng() * 45) : -Math.floor(rng() * 20);
  const actualDurationMs = Math.max(20 * MINUTE, billedMinutes * MINUTE + lateMinutes * MINUTE);
  const returned = new Date(at.getTime() + actualDurationMs);
  if (returned >= now) return null;

  if ((occupancy.get(item.id) || []).some(([l, r]) => overlaps(at.getTime(), returned.getTime(), l, r))) {
    return null;
  }

  const fee = round(rate.amount * (rate.kind === 'HOURLY' ? quantity : 1));
  const overtimeRate = Number(product.overtime_rate_per_hour || 50);
  const overtimeFee = isLate ? round(overtimeRate * Math.max(1, Math.ceil(Math.max(0, lateMinutes) / 60))) : 0;
  const final = round(fee + overtimeFee);

  seqCounter++;
  const id = `demo_${batchId.replace(/[^a-z0-9]/gi, '_')}_${dayKey.replaceAll('-', '')}_${String(seqCounter).padStart(4, '0')}`;
  const paymentMethod = rng() < 0.62 ? 'CASH' : 'QR';

  const row = {
    id,
    is_demo: false,
    demo_batch_id: batchId,
    request_source: 'PRESENTATION_DEMO',
    item_id: item.id,
    stock_group_id: item.stock_group_id || item.id,
    item_name: item.name,
    item_code: item.item_code || '',
    customer_id: customer.id,
    customer_name: customer.full_name,
    status: 'COMPLETED',
    booking_mode: rate.kind === 'WHOLE_STAY' ? 'WHOLE_STAY' : 'TIMED',
    fulfillment_mode: fulfillmentMode,
    delivery_location: isDelivery ? 'Resort Beachfront Villa' : null,
    created_at: new Date(at.getTime() - 25 * MINUTE),
    start_at: at,
    confirmed_rental_at: at,
    due_at: due,
    received_at: returned,
    confirmed_return_at: returned,
    updated_at: now,
    rental_fee: fee,
    rental_paid_amount: 0,
    rental_refunded_amount: 0,
    balance_due: final,
    refund_due: 0,
    payment_status: 'UNPAID',
    payment_method: paymentMethod,
    created_by: 'PRESENTATION_DEMO',
    notes: '[PRESENTATION DEMO] Historical showcase rental for analytics & forecasting. No payment receipt or physical handover was recorded.',
    legacy_rental_code: `DEMO-${dayKey.replaceAll('-', '')}-${String(seqCounter).padStart(4, '0')}`,
    fee_breakdown: {
      snapshot_version: 1,
      currency: 'PHP',
      product_id: product.id,
      product_name: product.name,
      pricing_source: 'PRESENTATION_DEMO',
      mode: rate.kind === 'WHOLE_STAY' ? 'WHOLE_STAY' : 'TIMED',
      package_kind: packageKind,
      rate_id: rate.id,
      rate_kind: rate.kind,
      rate_label: rate.label,
      requested_minutes: billedMinutes,
      billed_minutes: billedMinutes,
      start_at: at.toISOString(),
      due_at: due.toISOString(),
      rental_fee: fee,
      overtime_rate: overtimeRate,
      overtime_fee: overtimeFee,
      penalty_amount: 0,
      final_rental_charges: final,
      actual_return_at: returned.toISOString(),
      finalized_at: returned.toISOString(),
      rate_components: [
        {
          rate_id: rate.id,
          label: rate.label,
          kind: rate.kind,
          units: rate.kind === 'HOURLY' ? quantity : 1,
          unit_amount: rate.amount,
          total_amount: fee,
          duration_minutes: billedMinutes
        }
      ]
    }
  };

  plannedRentals.push(row);
  addOcc(item.id, at.getTime(), returned.getTime());

  // Add ESP32 counter verification speed samples (~72% of counter handoffs; P95 >= 60s in current year)
  if (!isDelivery && rng() < 0.72) {
    const slow = forceSlowVerif || (!isPriorYear && rng() < 0.08) || (isPriorYear && rng() < 0.015);
    const delaySec = slow
      ? 66 + Math.floor(rng() * 34)
      : (isPriorYear ? 6 + Math.floor(rng() * 24) : 9 + Math.floor(rng() * 36));
    const reqAt = new Date(at.getTime() - delaySec * 1000);
    const termId = rng() < 0.58 ? 'TERM-01' : 'TERM-02';
    plannedVerifs.push({
      id: `demo_verif_${id}`,
      is_demo: true,
      demo_batch_id: batchId,
      rental_id: id,
      item_id: item.id,
      customer_id: customer.id,
      terminal_id: termId,
      transaction_type: 'RENTAL',
      status: 'CONFIRMED',
      requested_at: reqAt,
      confirmed_at: at,
      created_at: reqAt,
      updated_at: now
    });
  }

  return row;
}

// Co-rental bundle pairs for Market Basket Analysis
const bundlePairs = [
  ['Uno Cards', 'Jenga'],
  ['Badminton Set', 'Volleyball'],
  ['Nintendo Switch', 'Uno Cards'],
  ['Chess Set', 'Jenga']
];

const releaseHours = [8, 9, 10, 11, 13, 14, 15, 16, 17, 18, 19, 20];

for (let dayIdx = -priorDays; dayIdx < days; dayIdx++) {
  const dayKey = shiftDay(startDay, dayIdx);
  const monthKey = dayKey.slice(0, 7);
  const monthNum = Number(dayKey.slice(5, 7)) - 1;
  const weekday = new Date(`${dayKey}T00:00:00Z`).getUTCDay(); // 0=Sun..6=Sat
  const weekdayBase = [3.1, 1.3, 1.4, 1.5, 1.7, 2.5, 3.3][weekday];
  const mMult = dayIdx < 0
    ? (priorMonthSeason[monthNum] ?? 0.68)
    : (monthFactor[monthKey] || 1.0);
  const expectedCount = weekdayBase * mMult + (rng() - 0.5) * 1.1;
  const target = Math.max(1, Math.round(expectedCount));

  let addedToday = 0;

  // Every ~9 days, schedule a realistic same-customer bundle pair so Market Basket thrives
  if (Math.abs(dayIdx) % 9 === 3 && addedToday + 2 <= target + 1) {
    const pairIdx = Math.floor(Math.max(0, dayIdx + priorDays) / 9) % bundlePairs.length;
    const [nameA, nameB] = bundlePairs[pairIdx];
    const poolA = units.filter((u) => u.item.name === nameA);
    const poolB = units.filter((u) => u.item.name === nameB);
    if (poolA.length && poolB.length) {
      const cust = pickCustomer(dayKey, true);
      const hr = [14, 16, 18, 19][Math.abs(dayIdx) % 4];
      const rA = tryAddRental({
        item: poolA[Math.abs(dayIdx) % poolA.length].item,
        product: poolA[Math.abs(dayIdx) % poolA.length].product,
        dayKey,
        hour: hr,
        minute: 10,
        customer: cust,
        forceChannel: 'SHOP_HANDOVER'
      });
      const rB = tryAddRental({
        item: poolB[Math.abs(dayIdx) % poolB.length].item,
        product: poolB[Math.abs(dayIdx) % poolB.length].product,
        dayKey,
        hour: hr,
        minute: 15,
        customer: cust,
        forceChannel: 'SHOP_HANDOVER'
      });
      if (rA) addedToday++;
      if (rB) addedToday++;
    }
  }

  for (let attempt = 0; attempt < weightedUnits.length && addedToday < target; attempt++) {
    const pick = weightedUnits[Math.floor(rng() * weightedUnits.length)];
    // Keep Scrabble active in prior year (-100% comparison) and quiet across the full current year
    if (pick.item.name === 'Scrabble' && dayIdx >= 0) continue;

    const hr = releaseHours[Math.floor(rng() * releaseHours.length)];
    const min = Math.floor(rng() * 4) * 15;
    const isTech = ['Nintendo Switch', 'PlayStation 4 Console'].includes(pick.item.name);
    const cust = pickCustomer(dayKey, isTech);
    const forceWholeStay =
      (dayIdx >= 0 && ['Nintendo Switch', 'Jenga'].includes(pick.item.name) && rng() < 0.72) ||
      (['Uno Cards', 'Chess Set'].includes(pick.item.name) && rng() < 0.35);
    const forceSlowVerif = (dayIdx >= 0 && dayIdx % 14 === 0 && addedToday === 0);

    const created = tryAddRental({
      item: pick.item,
      product: pick.product,
      dayKey,
      hour: hr,
      minute: min,
      customer: cust,
      forceWholeStay,
      forceSlowVerif
    });
    if (created) addedToday++;
  }
}

// Add 1 realistic 36-hour whole-stay outlier in the last 30 days for Duration Outlier watch (> Mean + 2 SD)
{
  const jengaUnit = units.find((u) => u.item.name === 'Jenga');
  if (jengaUnit) {
    const outDay = shiftDay(today, -12);
    const at = new Date(`${outDay}T10:00:00+08:00`);
    const due = new Date(at.getTime() + 24 * HOUR);
    const ret = new Date(at.getTime() + 36 * HOUR);
    if (!(occupancy.get(jengaUnit.item.id) || []).some(([l, r]) => overlaps(at.getTime(), ret.getTime(), l, r))) {
      seqCounter++;
      const id = `demo_${batchId.replace(/[^a-z0-9]/gi, '_')}_outlier_${String(seqCounter).padStart(4, '0')}`;
      const cust = frequentCustomers[0] || activeCohort[0];
      plannedRentals.push({
        id,
        is_demo: false,
        demo_batch_id: batchId,
        request_source: 'PRESENTATION_DEMO',
        item_id: jengaUnit.item.id,
        stock_group_id: jengaUnit.item.stock_group_id || jengaUnit.item.id,
        item_name: jengaUnit.item.name,
        item_code: jengaUnit.item.item_code || '',
        customer_id: cust.id,
        customer_name: cust.full_name,
        status: 'COMPLETED',
        booking_mode: 'WHOLE_STAY',
        fulfillment_mode: 'DELIVERY',
        delivery_location: 'Extended Stay Villa',
        created_at: new Date(at.getTime() - 20 * MINUTE),
        start_at: at,
        confirmed_rental_at: at,
        due_at: due,
        received_at: ret,
        confirmed_return_at: ret,
        updated_at: now,
        rental_fee: 250,
        rental_paid_amount: 0,
        rental_refunded_amount: 0,
        balance_due: 350,
        refund_due: 0,
        payment_status: 'UNPAID',
        payment_method: 'QR',
        created_by: 'PRESENTATION_DEMO',
        notes: '[PRESENTATION DEMO] Extended whole-stay duration sample for outlier check.',
        legacy_rental_code: `DEMO-${outDay.replaceAll('-', '')}-${String(seqCounter).padStart(4, '0')}`,
        fee_breakdown: {
          snapshot_version: 1,
          currency: 'PHP',
          product_id: jengaUnit.product.id,
          product_name: jengaUnit.product.name,
          pricing_source: 'PRESENTATION_DEMO',
          mode: 'WHOLE_STAY',
          package_kind: 'WHOLE_STAY',
          rate_id: 'whole-stay',
          rate_kind: 'WHOLE_STAY',
          rate_label: 'Whole stay',
          requested_minutes: 24 * 60,
          billed_minutes: 24 * 60,
          start_at: at.toISOString(),
          due_at: due.toISOString(),
          rental_fee: 250,
          overtime_rate: 50,
          overtime_fee: 100,
          penalty_amount: 0,
          final_rental_charges: 350,
          actual_return_at: ret.toISOString(),
          finalized_at: ret.toISOString(),
          rate_components: [{ rate_id: 'whole-stay', label: 'Whole stay', kind: 'WHOLE_STAY', units: 1, unit_amount: 250, total_amount: 250, duration_minutes: null }]
        }
      });
    }
  }
}

const bizData = bizSnap.exists ? bizSnap.data() : {};
const originalAnalyticsTargets = bizData.analytics_targets ?? null;
const showcaseTargets = originalAnalyticsTargets || {
  monthly_fee_goal: 12000,
  monthly_rental_goal: 70,
  utilization_goal: 0.12,
  overdue_rate_alert: 0.2
};

const plan = {
  batchId,
  generatedAt: now,
  from: startDay,
  to: shiftDay(today, -1),
  days,
  originalItemCreatedAt,
  originalAnalyticsTargets,
  showcaseTargets,
  rentalsCount: plannedRentals.length,
  verifsCount: plannedVerifs.length,
  maintCount: plannedMaint.length
};

const monthlyPreview = {};
for (const r of plannedRentals) {
  const m = businessDay(r.confirmed_rental_at).slice(0, 7);
  if (!monthlyPreview[m]) monthlyPreview[m] = { rentals: 0, fees: 0 };
  monthlyPreview[m].rentals++;
  monthlyPreview[m].fees = round(monthlyPreview[m].fees + r.rental_fee);
}

if (apply) {
  const planPath = path.join(backupRoot, `analytics-${batchId}-plan.json`);
  await writeFile(planPath, JSON.stringify(encodeSupabaseValue(plan), null, 2), 'utf8');

  await showcaseRef.set({
    active: true,
    batch_id: batchId,
    status: 'seeding',
    label: '12-month analytics showcase data',
    from: plan.from,
    to: plan.to,
    planned_count: plannedRentals.length,
    customer_count: new Set(plannedRentals.map((r) => r.customer_id)).size,
    generated_at: now,
    synthetic: true
  });
  await manifestRef.set({ active: false, status: 'superseded', updated_at: now }, { merge: true });

  // 1. Align active item created_at so 365d observedHours & utilization cover full year
  if (originalItemCreatedAt.length) {
    await batchWriteSets(
      originalItemCreatedAt.map((entry) => ({
        ref: db.collection('items').doc(entry.id),
        data: { created_at: baselineCreatedAt },
        merge: true
      }))
    );
  }

  // 2. Set baseline business analytics targets if unset
  if (originalAnalyticsTargets === null) {
    await db.collection('settings').doc('business').set({ analytics_targets: showcaseTargets }, { merge: true });
  }

  // 3. Allocate rental_codes and write demo rentals in chunks of 50
  for (let offset = 0; offset < plannedRentals.length; offset += 50) {
    const chunk = plannedRentals.slice(offset, offset + 50);
    await db.runTransaction(async (tx) => {
      const codes = await allocateRecordCodes(tx, db, chunk.map(() => 'rentals'), now);
      chunk.forEach((row, idx) => {
        const { id, ...data } = row;
        tx.create(db.collection('rentals').doc(id), { ...data, rental_code: codes[idx] });
      });
    });
    console.log(JSON.stringify({ phase: 'rentals', added: Math.min(plannedRentals.length, offset + 50), total: plannedRentals.length }));
  }

  // 4. Write verification_requests & maintenance_records
  if (plannedVerifs.length) {
    for (let offset = 0; offset < plannedVerifs.length; offset += 50) {
      const chunk = plannedVerifs.slice(offset, offset + 50);
      await db.runTransaction(async (tx) => {
        const codes = await allocateRecordCodes(tx, db, chunk.map(() => 'verification_requests'), now);
        chunk.forEach((row, idx) => {
          const { id, ...data } = row;
          tx.create(db.collection('verification_requests').doc(id), { ...data, request_code: codes[idx] });
        });
      });
    }
    console.log(JSON.stringify({ phase: 'verification_requests', added: plannedVerifs.length }));
  }

  if (plannedMaint.length) {
    await db.runTransaction(async (tx) => {
      const codes = await allocateRecordCodes(tx, db, plannedMaint.map(() => 'maintenance_records'), now);
      plannedMaint.forEach((row, idx) => {
        const { id, ...data } = row;
        tx.create(db.collection('maintenance_records').doc(id), { ...data, maintenance_code: codes[idx] });
      });
    });
    console.log(JSON.stringify({ phase: 'maintenance_records', added: plannedMaint.length }));
  }

  // 5. Rebuild derived analytics & report summary tables
  const totalReviewed = await rebuildAllDerivedSummaries();
  console.log(JSON.stringify({ phase: 'summaries_rebuilt', rentalsReviewed: totalReviewed }));

  await showcaseRef.set({
    active: true,
    batch_id: batchId,
    status: 'ready',
    label: '12-month analytics showcase data',
    from: plan.from,
    to: plan.to,
    planned_count: plannedRentals.length,
    record_count: plannedRentals.length,
    customer_count: new Set(plannedRentals.map((r) => r.customer_id)).size,
    generated_at: now,
    reconciled_at: new Date(),
    synthetic: true
  });

  await db.collection('audit_logs').doc(batchId).set({
    actor_type: 'SYSTEM',
    actor_name: 'Analytics showcase importer',
    action: 'PRESENTATION_DEMO_IMPORTED',
    entity_type: 'RENTAL',
    entity_id: batchId,
    created_at: now,
    notes: `${plannedRentals.length} synthetic completed rentals, ${plannedVerifs.length} terminal verifications, and ${plannedMaint.length} maintenance logs for 12-month analytics & forecasting showcase.`
  });
}

console.log(JSON.stringify({
  apply,
  batchId,
  from: plan.from,
  to: plan.to,
  plannedRentals: plannedRentals.length,
  plannedVerifications: plannedVerifs.length,
  plannedMaintenance: plannedMaint.length,
  customersUsed: new Set(plannedRentals.map((r) => r.customer_id)).size,
  equipmentTypesUsed: new Set(plannedRentals.map((r) => r.item_name)).size,
  totalFees: round(plannedRentals.reduce((s, r) => s + r.rental_fee, 0)),
  lateReturns: plannedRentals.filter((r) => asDate(r.received_at) > asDate(r.due_at)).length,
  monthlyPreview
}, null, 2));
