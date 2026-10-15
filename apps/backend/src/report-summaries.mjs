import { asDate, docData } from './firebase.mjs';
import { businessDay, serializeLedger } from './payment-ledger.mjs';
import { dateRange } from './query-validation.mjs';
import { rentalFinanceContribution } from './rental-payment-state.mjs';
import {equipmentRentalContribution,planEquipmentRanking} from './equipment-ranking.mjs';

const round = n => Math.round(n*100)/100;
function contribution(rental) {
  const start=asDate(rental?.confirmed_rental_at);
  const status=String(rental.status||'').toUpperCase(),dated=start&&Number.isFinite(start.getTime());
  if (!dated && !['ACTIVE','RETURN_PENDING_INSPECTION','COMPLETED'].includes(status)) return null;
  const number=value=>Number.isFinite(Number(value)) && Number(value)>=0 ? Number(value):0;
  const rawFee=rental.rental_fee ?? rental.rateFee,rawFinal=rental.fee_breakdown?.final_rental_charges ?? rawFee;
  const day=dated?businessDay(start):null,fees=number(rawFee);
  const known=rawFee!=null && Number.isFinite(Number(rawFee)) && Number(rawFee)>=0 && rawFinal!=null && Number.isFinite(Number(rawFinal)) && Number(rawFinal)>=0;
  return {day,rentals:1,fees,final_charges:number(rawFinal),unknown_charges:known?0:1,item_id:rental.item_id || rental.itemId || null,customer_id:rental.customer_id || rental.customerId || null,active:status==='ACTIVE'?1:0,completed:status==='COMPLETED'?1:0};
}

// Idempotent projection. Payment receipts remain atomic ledger entries; these
// derived charge/count summaries can always be reconstructed from rentals.
export async function projectRentalSummary(db,id,now=new Date()) {
  return db.runTransaction(async tx => {
    const rentalRef=db.collection('rentals').doc(id), stateRef=db.collection('rental_report_snapshots').doc(id), jobRef=db.collection('report_jobs').doc(id);
    const coverageRef=db.collection('rental_payment_totals').doc(id);
    const [doc,previous,job,coverage]=await Promise.all([tx.get(rentalRef),tx.get(stateRef),tx.get(jobRef),tx.get(coverageRef)]);
    const after=doc.exists?contribution(docData(doc)):null, before=previous.exists?previous.data().contribution:null;
    const created=doc.exists?asDate(doc.data().created_at || doc.data().startDate):null;
    const financeAfter=doc.exists?rentalFinanceContribution(doc.data(),coverage.exists?coverage.data():{},created&&Number.isFinite(created.getTime())?businessDay(created):null):null;
    const financeBefore=previous.exists?previous.data().finance_contribution || null:null;
    const equipmentBefore=previous.exists?previous.data().equipment_contribution || null:null;
    const equipmentAfter=doc.exists?equipmentRentalContribution(doc.data(),now):null;
    if(JSON.stringify(after)===JSON.stringify(before) && JSON.stringify(financeAfter)===JSON.stringify(financeBefore) && JSON.stringify(equipmentAfter)===JSON.stringify(equipmentBefore)){if(job.exists)tx.delete(jobRef);return;}
    const days=[...new Set([before?.day,after?.day].filter(Boolean))];
    const daily=await Promise.all(days.map(day=>tx.get(db.collection('rental_daily').doc(day))));
    const customers=[...new Set([before?.customer_id,after?.customer_id].filter(Boolean))];
    const customerDocs=await Promise.all(customers.map(customer=>tx.get(db.collection('customer_report_summaries').doc(customer))));
    const financeDays=[...new Set([financeBefore?.day,financeAfter?.day].filter(Boolean))];
    const financeDocs=await Promise.all(financeDays.map(day=>tx.get(db.collection('rental_financial_daily').doc(day))));
    const writeEquipment=await planEquipmentRanking(tx,db,equipmentBefore,equipmentAfter,now);
    for(let i=0;i<days.length;i++) {
      const day=days[i], totals=daily[i].exists?daily[i].data():{rentals:0,fees:0,final_charges:0};
      for (const metric of ['rentals','fees','final_charges','unknown_charges']) totals[metric]=round(Number(totals[metric]||0)-(before?.day===day?Number(before[metric]||0):0)+(after?.day===day?Number(after[metric]||0):0));
      tx.set(daily[i].ref,{...totals,business_day:day,updated_at:now});
    }
    tx.set(stateRef,{contribution:after,finance_contribution:financeAfter,equipment_contribution:equipmentAfter,updated_at:now});
    writeEquipment();
    for(let i=0;i<financeDays.length;i++) {
      const day=financeDays[i], totals=financeDocs[i].exists?financeDocs[i].data():{};
      for(const metric of ['rentals','charges','saved_paid','saved_refunded','balance_due','refund_due','unposted_paid','unposted_count','unknown_payments','unknown_charges']) {
        totals[metric]=round(Number(totals[metric]||0)-(financeBefore?.day===day?Number(financeBefore[metric]||0):0)+(financeAfter?.day===day?Number(financeAfter[metric]||0):0));
      }
      tx.set(financeDocs[i].ref,{...totals,business_day:day,updated_at:now});
    }
    for(let i=0;i<customers.length;i++){
      const customer=customers[i], totals=customerDocs[i].exists?customerDocs[i].data():{rentals:0,active:0,completed:0,fees:0};
      for(const metric of ['rentals','active','completed','fees'])totals[metric]=round(Number(totals[metric]||0)-(before?.customer_id===customer?Number(before[metric]||0):0)+(after?.customer_id===customer?Number(after[metric]||0):0));
      tx.set(customerDocs[i].ref,{...totals,updated_at:now});
    }
    if (job.exists) tx.delete(jobRef);
  });
}

export async function processReportJobs(db,now=new Date()) {
  const jobs=await db.collection('report_jobs').limit(50).get();
  for(const doc of jobs.docs) await projectRentalSummary(db,doc.id,now);
  return {processed:jobs.size};
}

export async function rentalDailySummary(db,from,to,now=new Date()) {
  from ||= businessDay(new Date(now.getTime()-29*86400000));to ||= businessDay(now);
  dateRange(from,to);
  const docs=await db.collection('rental_daily').where('business_day','>=',from).where('business_day','<=',to).get();
  return serializeLedger({daily:docs.docs.map(docData),totals:docs.docs.reduce((sum,doc)=>{for(const metric of ['rentals','fees','final_charges','unknown_charges'])sum[metric]=round(sum[metric]+Number(doc.data()[metric]||0));return sum;},{rentals:0,fees:0,final_charges:0,unknown_charges:0})});
}
