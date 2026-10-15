// Rebuild derived equipment counts. Rental, payment and receipt records are unchanged.
import {firestore,requireFirebaseConfig} from '../src/firebase.mjs';
import {projectRentalSummary} from '../src/report-summaries.mjs';
import {equipmentRentalContribution,equipmentRentalRanking} from '../src/equipment-ranking.mjs';
requireFirebaseConfig();
const apply=process.argv.includes('--apply'),now=new Date();
if(apply && process.env.FIREBASE_PROJECT_ID!=='rent-and-play' && !process.env.FIRESTORE_EMULATOR_HOST)throw Error('Unexpected Firebase project.');
let cursor,records=0,confirmed=0;
while(true){
  let query=firestore.collection('rentals').orderBy('__name__').limit(100);
  if(cursor)query=query.startAfter(cursor);
  const page=await query.get();if(page.empty)break;
  for(const doc of page.docs){records++;if(equipmentRentalContribution(doc.data(),now))confirmed++;if(apply)await projectRentalSummary(firestore,doc.id,now);}
  cursor=page.docs.at(-1);if(page.size<100)break;
}
let ranking;
if(apply){const items=await firestore.collection('items').get();ranking=await equipmentRentalRanking(firestore,items.docs.map(doc=>({id:doc.id,...doc.data()})),{},now);}
console.log(JSON.stringify({apply,records,confirmed,rankedRentals:ranking?.total_rentals,equipmentTypes:ranking?.equipment_count,rentalRecordsChanged:0,paymentRecordsChanged:0}));
