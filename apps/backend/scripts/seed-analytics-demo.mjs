import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { firestore as db, docData, asDate } from '../src/firebase.mjs';
import { isSupabaseConfigured, encodeSupabaseValue, decodeSupabaseValue } from '../src/supabase.mjs';
import { planPresentationDemo, demoFingerprint } from '../src/presentation-demo.mjs';
import { allocateRecordCodes } from '../src/record-codes.mjs';
import { projectRentalSummary } from '../src/report-summaries.mjs';
import { loadPricing } from '../src/pricing.mjs';
import { isStaffRole } from '../src/roles.mjs';

const apply = process.argv.includes('--apply'), cleanup = process.argv.includes('--cleanup');
if (!isSupabaseConfigured() || process.env.FIRESTORE_EMULATOR_HOST) throw new Error('This tool requires the configured Supabase database.');
const now = new Date(), manifestRef = db.collection('report_summary_state').doc('presentation_demo');
const manifest = await manifestRef.get();
const backupRoot = fileURLToPath(new URL('../backups/', import.meta.url));
await mkdir(backupRoot, { recursive: true });

if (cleanup) {
  if (!manifest.exists || !manifest.data().active) throw new Error('There is no active presentation demo batch.');
  const batchId = manifest.data().batch_id;
  const [snapshot, ledger] = await Promise.all([db.collection('rentals').where('demo_batch_id','==',batchId).get(), db.collection('payment_ledger').get()]);
  const rows = snapshot.docs.map(docData), ids = new Set(rows.map(row => row.id));
  if (rows.some(row => !row.is_demo || row.seed_fingerprint !== demoFingerprint(row))) throw new Error('A demo rental was changed after import. Review it before cleanup.');
  if (ledger.docs.some(doc => ids.has(doc.data().rental_id))) throw new Error('A demo rental now has a payment receipt. Review it before cleanup.');
  if (apply) {
    await writeFile(path.join(backupRoot, `analytics-${batchId}-cleanup-${Date.now()}.json`), JSON.stringify(encodeSupabaseValue(rows), null, 2), { flag: 'wx' });
    for (let i = 0; i < rows.length; i++) {
      await db.collection('rentals').doc(rows[i].id).delete();
      await projectRentalSummary(db, rows[i].id, now);
      if ((i + 1) % 25 === 0) console.log(JSON.stringify({ phase:'cleanup', removed:i+1, total:rows.length }));
    }
    await manifestRef.set({ ...manifest.data(), active:false, status:'removed', removed_at:now, removed_count:rows.length });
  }
  console.log(JSON.stringify({ apply, cleanup:true, batchId, records:rows.length }));
} else {
  const [items, customers, users, rentals, maintenance, pricing] = await Promise.all([
    ...['items','customers','users','rentals','maintenance_records'].map(name => db.collection(name).get()), loadPricing(db)
  ]);
  const profiles = new Map(users.docs.map(doc => [doc.id, doc.data()]));
  const testCustomers = customers.docs.map(docData).filter(row => row.is_active !== false && !isStaffRole(profiles.get(row.auth_uid)?.role));
  let plan;
  const active = manifest.exists && manifest.data().active;
  const backupPath = path.join(backupRoot, `analytics-${active ? manifest.data().batch_id : 'presentation-' + now.toLocaleDateString('en-CA',{timeZone:'Asia/Manila'}) + '-v1'}-plan.json`);
  try { plan = decodeSupabaseValue(JSON.parse(await readFile(backupPath, 'utf8'))); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (active) throw new Error('The active batch recovery plan is missing; no records changed.');
    plan = planPresentationDemo({ items:items.docs.map(docData), customers:testCustomers, pricing, existingRentals:rentals.docs.map(docData), maintenance:maintenance.docs.map(docData), now });
    if (apply) await writeFile(backupPath, JSON.stringify(encodeSupabaseValue(plan), null, 2), { flag: 'wx' });
  }
  const usedCustomers = new Set(plan.rentals.map(row => row.customer_id)), usedItems = new Set(plan.rentals.map(row => row.item_id));
  if ([...usedCustomers].some(id => !testCustomers.some(row => row.id === id)) || [...usedItems].some(id => !items.docs.some(row => row.id === id))) throw new Error('A referenced customer or equipment is no longer available.');
  const existing = new Map(rentals.docs.map(docData).map(row => [row.id, row]));
  if (plan.rentals.some(row => existing.has(row.id) && (existing.get(row.id).demo_batch_id !== plan.batchId || !existing.get(row.id).is_demo))) throw new Error('A planned ID belongs to a different record.');
  const meta = { active:true, batch_id:plan.batchId, status:'seeding', label:'Presentation demo data', from:plan.from, to:plan.to, planned_count:plan.rentals.length, customer_count:usedCustomers.size, generated_at:plan.generatedAt, synthetic:true };
  if (apply) {
    await manifestRef.set(meta);
    const pending = plan.rentals.filter(row => !existing.has(row.id));
    for (let offset = 0; offset < pending.length; offset += 25) {
      const chunk = pending.slice(offset, offset + 25);
      await db.runTransaction(async tx => {
        const codes = await allocateRecordCodes(tx, db, chunk.map(() => 'rentals'), now);
        chunk.forEach((row, index) => { const { id, ...data } = row; tx.create(db.collection('rentals').doc(id), { ...data, rental_code:codes[index] }); });
      });
      console.log(JSON.stringify({ phase:'import', added:Math.min(pending.length,offset+25), newRecords:pending.length }));
    }
    for (let i = 0; i < plan.rentals.length; i++) {
      await projectRentalSummary(db, plan.rentals[i].id, now);
      if ((i + 1) % 20 === 0) console.log(JSON.stringify({ phase:'summaries', completed:i+1, total:plan.rentals.length }));
    }
    await manifestRef.set({ ...meta, status:'ready', record_count:plan.rentals.length, reconciled_at:new Date() });
    await db.collection('audit_logs').doc(plan.batchId).set({ actor_type:'SYSTEM', actor_name:'Presentation demo importer', action:'PRESENTATION_DEMO_IMPORTED', entity_type:'RENTAL', entity_id:plan.batchId, created_at:now, notes:`${plan.rentals.length} synthetic completed rentals; no payment receipts, notifications, customer profile changes or current inventory changes.` });
  }
  console.log(JSON.stringify({ apply, batchId:plan.batchId, from:plan.from, to:plan.to, demoRentals:plan.rentals.length, newRecords:plan.rentals.filter(row=>!existing.has(row.id)).length, customers:usedCustomers.size, equipmentUnits:usedItems.size, rentalFees:Math.round(plan.rentals.reduce((sum,row)=>sum+row.rental_fee,0)*100)/100, lateReturns:plan.rentals.filter(row=>asDate(row.received_at)>asDate(row.due_at)).length, paymentReceiptsCreated:0, backup:apply ? backupPath : null }));
}
