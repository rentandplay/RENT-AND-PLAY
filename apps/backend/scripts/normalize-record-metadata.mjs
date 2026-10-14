import { mkdir,writeFile } from 'node:fs/promises';
import { firestore,requireFirebaseConfig } from '../src/firebase.mjs';
import { recordMetadata } from '../src/record-metadata.mjs';
import { serializeLedger } from '../src/payment-ledger.mjs';
requireFirebaseConfig();
const apply=process.argv.includes('--apply');
if(apply && process.env.FIREBASE_PROJECT_ID!=='rent-and-play' && !process.env.FIRESTORE_EMULATOR_HOST)throw new Error('Unexpected Firebase project; no metadata was changed.');
const plans=[],counts={};
for(const collection of ['rentals','customers','maintenance_records','users']){
  let cursor=null;counts[collection]=0;
  while(true){let query=firestore.collection(collection).orderBy('__name__').limit(100);if(cursor)query=query.startAfter(cursor);
    const page=await query.get();if(page.empty)break;
    for(const doc of page.docs){const patch=recordMetadata(collection,doc.data());if(Object.keys(patch).length){plans.push({collection,id:doc.id,before:doc.data(),patch});counts[collection]++;}}
    cursor=page.docs.at(-1);if(page.size<100)break;
  }
}
if(apply&&plans.length){
  await mkdir('backups',{recursive:true});
  await writeFile(`backups/record-metadata-${Date.now()}.json`,JSON.stringify(serializeLedger(plans),null,2));
  for(const plan of plans)await firestore.runTransaction(async tx=>{const ref=firestore.collection(plan.collection).doc(plan.id),doc=await tx.get(ref);if(!doc.exists)return;const patch=recordMetadata(plan.collection,doc.data());if(Object.keys(patch).length)tx.update(ref,patch);});
}
console.log(JSON.stringify({apply,recordsWithMetadataChanges:counts,backupSaved:apply&&plans.length>0,note:'No IDs, QR tokens, prices or payment receipts were changed.'}));
