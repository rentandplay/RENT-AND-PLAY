import { createHash } from 'node:crypto';
import { asDate } from './firebase.mjs';
import { businessDay } from './payment-ledger.mjs';
import { healthyUnit, isOpenMaintenance } from './maintenance-state.mjs';

const DAY = 86400000, MINUTE = 60000;
const round = value => Math.round(value * 100) / 100;
const overlaps = (a, b, c, d) => a < d && c < b;
const millis = value => asDate(value)?.getTime();
const shift = (key, days) => new Date(Date.parse(key + 'T00:00:00Z') + days * DAY).toISOString().slice(0, 10);
const canonical = value => value instanceof Date ? value.toISOString() : Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;

export function demoFingerprint(row) {
  const fields = ['item_id','customer_id','status','rental_fee','rental_paid_amount','balance_due','confirmed_rental_at','received_at','confirmed_return_at','due_at','fee_breakdown','is_demo','demo_batch_id'];
  return createHash('sha256').update(JSON.stringify(canonical(fields.map(key => row[key])))).digest('hex');
}

// Synthetic completed history only. This never changes stock custody or customer accounts.
export function planPresentationDemo({ items, customers, pricing, existingRentals = [], maintenance = [], now = new Date(), days = 49 }) {
  if (!Number.isInteger(days) || days < 35 || days > 90) throw new Error('Choose 35–90 complete days.');
  customers = customers.filter(row => row.is_active !== false);
  if (!customers.length) throw new Error('At least one existing active test customer is required.');
  const today = businessDay(now), batchId = `presentation-${today}-v1`;
  const products = pricing.products || [], blocked = new Set(maintenance.filter(isOpenMaintenance).map(row => String(row.item_id)));
  const units = items.filter(row => row.is_active !== false && row.status === 'AVAILABLE' && healthyUnit(row) && !blocked.has(row.id))
    .map(item => ({ item, product: products.find(p => p.id === item.pricing_product_id) || products.find(p => p.name.toLowerCase() === item.name.toLowerCase()) }))
    .filter(row => row.product?.rate_options.some(rate => rate.duration_minutes > 0 && rate.duration_minutes <= 300 && rate.amount > 0))
    .sort((a, b) => a.item.id.localeCompare(b.item.id));
  if (!units.length) throw new Error('No available equipment with configured rates can be used.');
  const occupancy = new Map();
  for (const row of existingRentals) {
    if (!['ACTIVE','COMPLETED','RETURN_PENDING_INSPECTION'].includes(row.status)) continue;
    const start = millis(row.confirmed_rental_at);
    const end = row.status === 'ACTIVE' ? Number.POSITIVE_INFINITY : millis(row.received_at || row.confirmed_return_at);
    if (Number.isFinite(start) && end > start) {
      if (!occupancy.has(row.item_id)) occupancy.set(row.item_id, []);
      occupancy.get(row.item_id).push([start, end]);
    }
  }
  const rentals = [];
  const start = shift(today, -days);
  for (let index = 0; index < days; index++) {
    const key = shift(start, index), weekday = new Date(key).getUTCDay();
    const target = [7, 2, 3, 3, 4, 6, 8][weekday] + Math.floor(index / 14) + (index * 17 % 3 - 1);
    let added = 0;
    for (let attempt = 0; attempt < units.length * 2 && added < target; attempt++) {
      const { item, product } = units[(attempt + index * 7) % units.length];
      const rates = product.rate_options.filter(r => r.duration_minutes > 0 && r.duration_minutes <= 300 && r.amount > 0);
      const rate = rates[(index + attempt) % rates.length];
      const quantity = rate.kind === 'HOURLY' ? 1 + (index + attempt) % 3 : 1;
      const minutes = Math.min(300, rate.duration_minutes * quantity);
      const at = new Date(`${key}T${attempt < units.length ? '09' : '14'}:00:00+08:00`);
      const due = new Date(at.getTime() + minutes * MINUTE);
      const late = (index * 5 + added) % 11 === 0;
      const returned = new Date(due.getTime() + (late ? 20 : -(5 + added % 4 * 5)) * MINUTE);
      if (!(millis(item.created_at) <= at.getTime()) || returned > now) continue;
      if ((occupancy.get(item.id) || []).some(([left, right]) => overlaps(at.getTime(), returned.getTime(), left, right))) continue;
      const customer = customers[(index + added * 3) % customers.length];
      const fee = round(rate.amount * (rate.kind === 'HOURLY' ? quantity : 1));
      const overtime = late ? Number(product.overtime_rate_per_hour || 0) : 0;
      const final = round(fee + overtime);
      const id = `demo_${today.replaceAll('-', '')}_${key.replaceAll('-', '')}_${String(added + 1).padStart(2, '0')}`;
      const row = {
        id, is_demo: true, demo_batch_id: batchId, request_source: 'PRESENTATION_DEMO',
        item_id: item.id, stock_group_id: item.stock_group_id || item.id, item_name: item.name, item_code: item.item_code,
        customer_id: customer.id, customer_name: customer.full_name,
        status: 'COMPLETED', booking_mode: 'TIMED', fulfillment_mode: (index + added) % 5 < 3 ? 'DELIVERY' : 'SHOP_HANDOVER',
        delivery_location: (index + added) % 5 < 3 ? 'Demo resort handover' : null,
        created_at: new Date(at.getTime() - 30 * MINUTE), start_at: at, confirmed_rental_at: at, due_at: due,
        received_at: returned, confirmed_return_at: returned, updated_at: now,
        rental_fee: fee, rental_paid_amount: 0, rental_refunded_amount: 0, balance_due: final, refund_due: 0,
        payment_status: 'UNPAID', payment_method: (index + added) % 3 ? 'CASH' : 'QR',
        created_by: 'PRESENTATION_DEMO', notes: '[PRESENTATION DEMO] Simulated historical rental linked to a test customer. Current configured rates are used. No payment receipt or physical handover was recorded.',
        legacy_rental_code: `DEMO-${key.replaceAll('-', '')}-${added + 1}`,
        fee_breakdown: {
          snapshot_version: 1, currency: 'PHP', product_id: product.id, product_name: product.name,
          pricing_source: 'PRESENTATION_DEMO', mode: 'TIMED', rate_id: rate.id, rate_kind: rate.kind, rate_label: rate.label,
          requested_minutes: minutes, billed_minutes: minutes, start_at: at.toISOString(), due_at: due.toISOString(),
          rental_fee: fee, overtime_rate: Number(product.overtime_rate_per_hour || 0), overtime_fee: overtime, penalty_amount: 0,
          final_rental_charges: final, actual_return_at: returned.toISOString(), finalized_at: returned.toISOString(),
          rate_components: [{ rate_id: rate.id, label: rate.label, kind: rate.kind, units: rate.kind === 'HOURLY' ? quantity : 1, unit_amount: rate.amount, total_amount: fee, duration_minutes: minutes }]
        }
      };
      row.seed_fingerprint = demoFingerprint(row);
      rentals.push(row);
      if (!occupancy.has(item.id)) occupancy.set(item.id, []);
      occupancy.get(item.id).push([at.getTime(), returned.getTime()]);
      added++;
    }
  }
  if (new Set(rentals.map(row => businessDay(row.confirmed_rental_at))).size < 35) throw new Error('Equipment history cannot support 35 complete demo days without conflicts.');
  return { batchId, generatedAt: now, from: start, to: shift(today, -1), days, rentals };
}
