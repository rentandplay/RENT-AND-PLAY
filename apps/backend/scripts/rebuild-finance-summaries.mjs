// Rebuild derived totals only. Never create a receipt or alter a rental payment.
import { firestore, requireFirebaseConfig } from '../src/firebase.mjs';
import { projectRentalSummary } from '../src/report-summaries.mjs';
requireFirebaseConfig();
const apply = process.argv.includes('--apply');
if (apply && process.env.FIREBASE_PROJECT_ID !== 'rent-and-play' && !process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Unexpected Firebase project.');
let cursor = null, rentals = 0, summaries = 0;
while (true) {
  let query = firestore.collection('rentals').orderBy('__name__').limit(100);
  if (cursor) query = query.startAfter(cursor);
  const page = await query.get();
  if (page.empty) break;
  for (const doc of page.docs) {
    rentals++;
    if (!apply) continue;
    await firestore.runTransaction(async tx => {
      const ref = firestore.collection('rental_payment_totals').doc(doc.id);
      const [entries, saved] = await Promise.all([tx.get(firestore.collection('payment_ledger').where('rental_id','==',doc.id)),tx.get(ref)]);
      const totals = {collections:0,refunds:0};
      for (const row of entries.docs) {
        const entry = row.data(), key = {COLLECTION:'collections',REFUND:'refunds'}[entry.type];
        if (key) totals[key] = Math.round((totals[key] + Number(entry.amount || 0))*100)/100;
      }
      if (totals.collections || totals.refunds || saved.exists) tx.set(ref,{...totals,updated_at:new Date()});
    });
    await projectRentalSummary(firestore,doc.id);
    summaries++;
  }
  cursor = page.docs.at(-1);
  if (page.size < 100) break;
}
console.log(JSON.stringify({apply,rentals,summaries,receiptEntriesCreated:0,rentalPaymentsChanged:0}));
