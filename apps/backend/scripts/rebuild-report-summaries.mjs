import { firestore,requireFirebaseConfig } from '../src/firebase.mjs';
import { projectRentalSummary } from '../src/report-summaries.mjs';
requireFirebaseConfig();
const apply=process.argv.includes('--apply');
let cursor=null, count=0;
do {
  let query=firestore.collection('rentals').orderBy('__name__').limit(100);if(cursor)query=query.startAfter(cursor);
  const snapshot=await query.get();if(snapshot.empty)break;
  for(const doc of snapshot.docs){if(apply)await projectRentalSummary(firestore,doc.id);count++;}
  cursor=snapshot.docs.at(-1);if(snapshot.size<100)break;
}while(true);
if(apply)await firestore.collection('report_summary_state').doc('coverage').set({backfill_complete:true,rentals_reviewed:count,reconciled_at:new Date()});
console.log(JSON.stringify({apply,rentalsReviewed:count,note:apply?'Derived charge/count summaries rebuilt. No payment receipts were fabricated.':'Read-only preview; use --apply to rebuild derived summaries.'}));
