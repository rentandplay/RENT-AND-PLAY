import { auditFields, stageAudit } from './audit.mjs';

const product = (id,name,group,rateOptions,extra={})=>({
  id,name,group,rate_options:rateOptions,deposit_amount:0,overtime_rate_per_hour:0,
  high_value:false,included_items:[],sale_price:null,...extra
});

export const DEFAULT_PRICING = {
  products:[
    product('bike','Bicycle','Sports',[
      {id:'half-hour',label:'30 minutes',kind:'SHORT',duration_minutes:30,amount:150},
      {id:'hour',label:'Per hour',kind:'HOURLY',duration_minutes:60,amount:200},
      {id:'three-hour-special',label:'3-hour special',kind:'PACKAGE',duration_minutes:180,amount:500}
    ],{high_value:true,deposit_amount:200,overtime_rate_per_hour:200}),
    product('pickleball-set','Pickleball Set','Sports',[
      {id:'hour',label:'Per hour',kind:'HOURLY',duration_minutes:60,amount:120}
    ],{deposit_amount:100,overtime_rate_per_hour:120,included_items:['4 paddles','6 outdoor pickleballs','Portable net']}),
    product('badminton-set','Badminton Set','Sports',[
      {id:'hour',label:'Per hour',kind:'HOURLY',duration_minutes:60,amount:100}
    ],{deposit_amount:100,overtime_rate_per_hour:100,included_items:['4 rackets','6 shuttlecocks','Net']}),
    product('basketball','Basketball','Sports',[
      {id:'hour',label:'Per hour',kind:'HOURLY',duration_minutes:60,amount:50},
      {id:'five-hour-special',label:'5-hour special',kind:'PACKAGE',duration_minutes:300,amount:200}
    ],{deposit_amount:50,overtime_rate_per_hour:50}),
    product('volleyball','Volleyball','Sports',[
      {id:'hour',label:'Per hour',kind:'HOURLY',duration_minutes:60,amount:50},
      {id:'five-hour-special',label:'5-hour special',kind:'PACKAGE',duration_minutes:300,amount:200}
    ],{deposit_amount:50,overtime_rate_per_hour:50}),
    product('ps4','PlayStation 4 Console','Tech Rentals',[
      {id:'hour',label:'Per hour',kind:'HOURLY',duration_minutes:60,amount:250}
    ],{high_value:true,deposit_amount:300,overtime_rate_per_hour:250}),
    product('nintendo-switch','Nintendo Switch','Tech Rentals',[
      {id:'hour',label:'Per hour',kind:'HOURLY',duration_minutes:60,amount:200}
    ],{high_value:true,deposit_amount:300,overtime_rate_per_hour:200}),
    product('ps5','PlayStation 5 Console','Tech Rentals',[
      {id:'day',label:'Per day',kind:'BLOCK',duration_minutes:1440,amount:120}
    ],{high_value:true,deposit_amount:500,overtime_rate_per_hour:120}),
    product('deck-of-cards','Deck of Cards','Cards',[
      {id:'five-hour',label:'5 hours',kind:'BLOCK',duration_minutes:300,amount:50}
    ],{deposit_amount:50,overtime_rate_per_hour:10,sale_price:150,sale_label:'Brand new'}),
    product('uno-cards','Uno Cards','Cards',[
      {id:'five-hour',label:'5 hours',kind:'BLOCK',duration_minutes:300,amount:100}
    ],{deposit_amount:50,overtime_rate_per_hour:20,sale_price:300,sale_label:'Brand new'}),
    product('bingo-cards','Bingo Set','Cards',[
      {id:'five-hour',label:'5 hours',kind:'BLOCK',duration_minutes:300,amount:150}
    ],{deposit_amount:100,overtime_rate_per_hour:30,sale_price:450,sale_label:'Brand new'}),
    ...[
      ['jenga','Jenga'],['scrabble','Scrabble'],['chess','Chess Set']
    ].map(([id,name])=>product(id,name,'Board Games',[
      {id:'five-hour',label:'5 hours',kind:'BLOCK',duration_minutes:300,amount:150},
      {id:'whole-stay',label:'Whole stay until resort checkout',kind:'WHOLE_STAY',duration_minutes:null,amount:250}
    ],{deposit_amount:100,overtime_rate_per_hour:30})),
  ],
  rules:{
    opens_at:'08:00',closes_at:'20:00',valid_id_required:true,
    high_value_deposit_required:true,lost_piece_fee:50,
    order_phone:'0992-768-5192',order_channels:'Call / Text / Viber',
    order_method_note:'You may also tell your resort caretaker.',
    overtime_basis:'Each started hour after the due time, at the product hourly rate.',
    after_hours_returns:'Returns after closing are accepted when service reopens at 8:00 AM. Overtime continues until the item is returned.',
    whole_stay_basis:'The guest’s resort checkout time.',
    bike_safety:'Ride bikes at your own risk. Always check your surroundings.',
    care_and_loss:'Handle items with care. Damage or lost pieces are charged to the guest.',
    return_reminder:'Return items on time to avoid overtime charges.'
  }
};

const clone=value=>JSON.parse(JSON.stringify(value));
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const validAmount=(value,label)=>{
  const amount=Number(value);
  if(!Number.isFinite(amount)||amount<0||amount>9999999999.99||Math.abs(amount*100-Math.round(amount*100))>.0001)fail(400,`${label} must be a nonnegative amount with at most two decimal places.`);
  return amount;
};
const validTime=value=>typeof value==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(value);

export function validatePricing(input={}) {
  if(!input||typeof input!=='object'||Array.isArray(input)||!Array.isArray(input.products)||!input.rules||typeof input.rules!=='object'||Array.isArray(input.rules))fail(400,'Pricing setup is required.');
  const defaults=clone(DEFAULT_PRICING),byId=new Map(input.products.map(row=>[row?.id,row]));
  const legacyBall=byId.get('basketball-volleyball-ball');
  for(const id of ['bike','pickleball-set','badminton-set','ps4','nintendo-switch','deck-of-cards','uno-cards','bingo-cards','jenga','scrabble','chess'])if(!byId.has(id))fail(400,`Pricing setup is missing ${id}.`);
  if(!legacyBall&&(!byId.has('basketball')||!byId.has('volleyball')))fail(400,'Pricing setup is missing a sports product.');
  const products=defaults.products.map(base=>{
    const row=byId.get(base.id)||(['basketball','volleyball'].includes(base.id)?legacyBall:null);
    if(!row){if(base.id==='ps5')return base;fail(400,`Pricing setup is missing ${base.name}.`);}
    const ratesById=new Map((Array.isArray(row.rate_options)?row.rate_options:[]).map(rate=>[rate?.id,rate]));
    base.rate_options=base.rate_options.map(rate=>{
      const submitted=ratesById.get(rate.id);
      if(!submitted)fail(400,`A rate is missing for ${base.name}.`);
      return {...rate,amount:validAmount(submitted.amount,`${base.name} ${rate.label}`)};
    });
    base.deposit_amount=validAmount(row.deposit_amount??0,`${base.name} deposit`);
    base.overtime_rate_per_hour=validAmount(row.overtime_rate_per_hour??base.overtime_rate_per_hour,`${base.name} overtime rate`);
    if(base.sale_price!==null)base.sale_price=validAmount(row.sale_price??base.sale_price,`${base.name} sale price`);
    if(Array.isArray(row.included_items))base.included_items=row.included_items.filter(v=>typeof v==='string').map(v=>v.trim().slice(0,100)).filter(Boolean).slice(0,12);
    return base;
  });
  const rules={...defaults.rules,...(input.rules||{})};
  if(!validTime(rules.opens_at)||!validTime(rules.closes_at)||rules.opens_at>=rules.closes_at)fail(400,'Enter valid daily service hours.');
  rules.valid_id_required=rules.valid_id_required!==false;
  rules.high_value_deposit_required=rules.high_value_deposit_required!==false;
  rules.lost_piece_fee=validAmount(rules.lost_piece_fee??50,'Lost piece fee');
  for(const key of ['order_phone','order_channels','order_method_note','overtime_basis','after_hours_returns','whole_stay_basis','bike_safety','care_and_loss','return_reminder']){
    if(typeof rules[key]!=='string'||rules[key].trim().length>500)fail(400,'Business rental policies must be 500 characters or fewer.');
    rules[key]=rules[key].trim();
  }
  return {products,rules};
}

export async function loadPricing(db,{allowInvalidFallback=false}={}) {
  const snapshot=await db.collection('settings').doc('pricing').get();
  if(!snapshot.exists)return clone(DEFAULT_PRICING);
  try{return validatePricing(snapshot.data());}catch{
    if(allowInvalidFallback)return {...clone(DEFAULT_PRICING),configuration_warning:'The saved client rate sheet is invalid. Review and save the displayed defaults before quoting rentals.'};
    fail(500,'The saved client rate sheet is invalid. An administrator must correct it before quoting rentals.');
  }
}

export async function savePricing(db,actor,input,now=new Date()) {
  const pricing=validatePricing(input);
  const batch=db.batch();
  batch.set(db.collection('settings').doc('pricing'),{...pricing,updated_at:now,updated_by:String(actor)},{merge:true});
  stageAudit(batch,db,actor,'PRICING_UPDATED','SETTINGS','pricing',{after:{products:pricing.products,rules:auditFields(pricing.rules,Object.keys(DEFAULT_PRICING.rules))},now});
  await batch.commit();
  return pricing;
}

function timedAmount(product,durationMinutes) {
  const candidates=[];
  const rates=product.rate_options;
  const hourly=rates.find(rate=>rate.kind==='HOURLY');
  for(const rate of rates){
    if(rate.kind==='HOURLY'||rate.kind==='BLOCK'){
      const blocks=Math.ceil(durationMinutes/rate.duration_minutes);
      candidates.push({amount:blocks*rate.amount,billed_minutes:blocks*rate.duration_minutes,rate_label:rate.label,rate_id:rate.id,rate_kind:rate.kind,rate_components:[component(rate,blocks)]});
    }else if(rate.kind==='SHORT'&&durationMinutes<=rate.duration_minutes){
      candidates.push({amount:rate.amount,billed_minutes:rate.duration_minutes,rate_label:rate.label,rate_id:rate.id,rate_kind:rate.kind,rate_components:[component(rate,1)]});
    }else if(rate.kind==='PACKAGE'&&hourly){
      const standardBlocks=Math.ceil(durationMinutes/hourly.duration_minutes),packageBlocks=Math.ceil(rate.duration_minutes/hourly.duration_minutes);
      if(standardBlocks>=packageBlocks){
        const extraBlocks=standardBlocks-packageBlocks;
        candidates.push({amount:rate.amount+extraBlocks*hourly.amount,billed_minutes:(packageBlocks+extraBlocks)*hourly.duration_minutes,rate_label:rate.label+(extraBlocks?` + ${extraBlocks} extra hour(s)`:'' ),rate_id:rate.id,rate_kind:rate.kind,rate_components:[component(rate,1),...(extraBlocks?[component(hourly,extraBlocks)]:[])]});
      }
    }
  }
  candidates.sort((a,b)=>a.amount-b.amount||a.billed_minutes-b.billed_minutes);
  return candidates[0]||null;
}

const component=(rate,units)=>({rate_id:rate.id,label:rate.label,kind:rate.kind,units,unit_amount:rate.amount,duration_minutes:rate.duration_minutes||null,total_amount:Math.round(rate.amount*units*100)/100});

export function quoteRental(pricing,input={},now=new Date()) {
  if(!input||typeof input!=='object'||Array.isArray(input))fail(400,'Rental quote details are required.');
  const productId=String(input.productId||'');
  const item=pricing.products.find(row=>row.id===productId);
  if(!item)fail(404,'Choose a product from the Rent & Play rate sheet.');
  const startAt=input.startAt?new Date(input.startAt):now;
  if(!Number.isFinite(startAt.getTime()))fail(400,'Enter a valid rental start time.');
  let amount,billedMinutes,dueAt,rateLabel,rateId,rateKind,rateComponents;
  if(input.mode==='WHOLE_STAY'){
    const plan=item.rate_options.find(rate=>rate.kind==='WHOLE_STAY');
    const checkoutAt=new Date(input.resortCheckoutAt);
    if(!plan)fail(400,`${item.name} does not have a whole-stay rate.`);
    if(!Number.isFinite(checkoutAt.getTime())||checkoutAt<=startAt)fail(400,'Enter the guest’s resort checkout time after the rental starts.');
    amount=plan.amount;billedMinutes=Math.ceil((checkoutAt-startAt)/60000);dueAt=checkoutAt;rateLabel=plan.label;rateId=plan.id;rateKind=plan.kind;rateComponents=[component(plan,1)];
  }else{
    const durationMinutes=Number(input.durationMinutes);
    if(!Number.isInteger(durationMinutes)||durationMinutes<1||durationMinutes>10080)fail(400,'Rental duration must be between 1 minute and 7 days.');
    const timed=timedAmount(item,durationMinutes);
    if(!timed)fail(400,`No timed rental rate is configured for ${item.name}.`);
    amount=timed.amount;billedMinutes=timed.billed_minutes;dueAt=new Date(startAt.getTime()+billedMinutes*60000);rateLabel=timed.rate_label;rateId=timed.rate_id;rateKind=timed.rate_kind;rateComponents=timed.rate_components;
  }
  const actualReturnAt=input.actualReturnAt?new Date(input.actualReturnAt):null;
  if(actualReturnAt&&!Number.isFinite(actualReturnAt.getTime()))fail(400,'Enter a valid actual return time.');
  const lateMinutes=actualReturnAt?Math.max(0,Math.ceil((actualReturnAt-dueAt)/60000)):0;
  const overtimeBlocks=Math.ceil(lateMinutes/60);
  const overtimeAmount=overtimeBlocks*item.overtime_rate_per_hour;
  const warnings=[];
  const timeInManila=date=>new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Manila',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date);
  const startTime=timeInManila(startAt),dueTime=timeInManila(dueAt),{opens_at:opensAt,closes_at:closesAt}=pricing.rules;
  if(startTime<opensAt||startTime>=closesAt)warnings.push(`Rental start is outside daily service hours (${opensAt}–${closesAt}).`);
  if(dueTime<opensAt||dueTime>closesAt)warnings.push(`Due time falls outside daily service hours (${opensAt}–${closesAt}); after-hours return follows the saved overtime rule.`);
  if(item.high_value&&pricing.rules.high_value_deposit_required&&item.deposit_amount===0)warnings.push('Set the high-value item deposit before confirming this rental.');
  return {
    product_id:item.id,product_name:item.name,rate_label:rateLabel,rate_id:rateId,rate_kind:rateKind,rate_components:rateComponents,start_at:startAt.toISOString(),requested_minutes:input.mode==='WHOLE_STAY'?billedMinutes:Number(input.durationMinutes),
    rental_fee:Math.round(amount*100)/100,overtime_blocks:overtimeBlocks,
    overtime_rate_per_hour:item.overtime_rate_per_hour,overtime_fee:Math.round(overtimeAmount*100)/100,
    rental_charge_total:Math.round((amount+overtimeAmount)*100)/100,
    deposit_amount:item.deposit_amount,deposit_required:item.high_value&&pricing.rules.high_value_deposit_required,
    deposit_configured:!item.high_value||!pricing.rules.high_value_deposit_required||item.deposit_amount>0,
    valid_id_required:pricing.rules.valid_id_required,billed_minutes:billedMinutes,
    total_to_collect:Math.round((amount+overtimeAmount+item.deposit_amount)*100)/100,
    due_at:dueAt.toISOString(),actual_return_at:actualReturnAt?.toISOString()||null,
    after_hours_return_note:pricing.rules.after_hours_returns,
    overtime_basis:pricing.rules.overtime_basis,lost_piece_fee:pricing.rules.lost_piece_fee,
    reminders:{bike_safety:item.id==='bike'?pricing.rules.bike_safety:null,care_and_loss:pricing.rules.care_and_loss,return:pricing.rules.return_reminder},warnings
  };
}
