import { firestore,requireFirebaseConfig } from '../src/firebase.mjs';
import { decoratedRecordPage } from '../src/record-pages.mjs';
import { financeSummary,ledgerPage,businessDay } from '../src/payment-ledger.mjs';
import { rentalDailySummary } from '../src/report-summaries.mjs';
requireFirebaseConfig();
const day=businessDay(new Date());
const results=await Promise.all([
  decoratedRecordPage(firestore,'rentals',{status:'OPEN',limit:25}),
  decoratedRecordPage(firestore,'rentals',{status:'OPEN',scheduledDay:day,limit:25}),
  decoratedRecordPage(firestore,'customers',{status:'ACTIVE',search:'a',limit:20}),
  decoratedRecordPage(firestore,'maintenance',{status:'CLOSED',from:'2026-01-01',to:day,limit:25}),
  ledgerPage(firestore,{from:day,to:day,type:'COLLECTION',method:'CASH',limit:25}),
  financeSummary(firestore,{from:day,to:day}),
  rentalDailySummary(firestore,'2026-01-01',day),
]);
console.log(JSON.stringify({project:process.env.FIREBASE_PROJECT_ID,successfulQueryChecks:results.length,pagesBounded:results.slice(0,4).every(row=>row.records.length<=25),historicalChargeSummariesAvailable:results[6].daily.length,paymentBasis:results[5].basis,mutations:0}));
