import { mkdir, writeFile } from 'node:fs/promises';
import { firestore, requireFirebaseConfig } from '../src/firebase.mjs';
import { serializeLedger } from '../src/payment-ledger.mjs';
import { projectRentalSummary } from '../src/report-summaries.mjs';
requireFirebaseConfig();
const code = process.argv.find(value => /^R-\d+$/.test(value));
const apply = process.argv.includes('--apply');
if (!code || process.env.FIREBASE_PROJECT_ID !== 'rent-and-play') throw new Error('Supply the exact incorrect rental reference in the expected project.');
const matches = await firestore.collection('rentals').where('rental_code','==',code).limit(2).get();
if (matches.size !== 1) throw new Error('Expected exactly one matching rental; no records changed.');
const selected = matches.docs[0];
if (apply) {
  await mkdir('backups',{recursive:true});
  await writeFile(`backups/incorrect-rental-${code}-${Date.now()}.json`,JSON.stringify(serializeLedger({id:selected.id,...selected.data()}),null,2),{flag:'wx'});
  await firestore.runTransaction(async tx => {
    const [rental,receipts] = await Promise.all([tx.get(selected.ref),tx.get(firestore.collection('payment_ledger').where('rental_id','==',selected.id).limit(1))]);
    if (!rental.exists || rental.data().rental_code !== code || rental.data().status !== 'COMPLETED') throw new Error('The rental changed or is not completed.');
    if (!receipts.empty) throw new Error('This rental has actual ledger receipts; it requires a financial reversal.');
    const data = rental.data();
    const item = data.item_id ? await tx.get(firestore.collection('items').doc(data.item_id)) : null;
    if (item?.exists && [item.data().current_rental_id,item.data().reserved_rental_id].includes(selected.id)) throw new Error('The unit is still linked to this rental; review its custody first.');
    const at = new Date();
    tx.create(firestore.collection('voided_rentals').doc(selected.id),{original:data,original_id:selected.id,rental_code:code,reason:'User identified this rental as an incorrect record.',voided_at:at});
    tx.delete(selected.ref);
    tx.create(firestore.collection('audit_logs').doc(),{actor_type:'SYSTEM',action:'INCORRECT_RENTAL_REMOVED',entity_type:'RENTAL',entity_id:selected.id,rental_code:code,reason:'Explicit user request; recovery copy retained in voided_rentals.',created_at:at});
  });
  await projectRentalSummary(firestore,selected.id);
}
console.log(JSON.stringify({apply,rentalCode:code,removed:apply,recoveryCopySaved:apply,ledgerEntriesChanged:0}));
