import { manilaDateKey, recordDate } from './analytics.js';
import { recordAttrs } from './record-links.js';
import { recordCode } from './record-codes.js';

export const reviewFields = [
  ['objective', 'Business outcome', 300, 'text'],
  ['rationale', 'Why these targets are achievable', 600, 'text'],
  ['responsible_role', 'Person or role leading the review', 100, 'text'],
  ['review_on', 'Next review date', 10, 'date'],
  ['cadence', 'Review frequency', 80, 'text'],
  ['baseline_from', 'Baseline from', 10, 'date'],
  ['baseline_to', 'Baseline to', 10, 'date']
];

export function analyticsReviewPlan(settings = {}) {
  const raw = settings?.analytics_targets?.review_plan;
  return Object.fromEntries(reviewFields.map(([key]) => [key, typeof raw?.[key] === 'string' ? raw[key] : '']));
}

export function reviewPlanInputs(plan, escape) {
  return `<fieldset class="ana-review-fields"><legend>Outcome and review plan</legend><p class="ana-note">Connect the goals above to an outcome, a realistic basis and a review date. Baseline dates identify the records to compare; they do not save a historical snapshot.</p><div class="ana-target-fields">${reviewFields.map(([key,label,max,type]) => `<label>${label}<input name="plan_${key}" type="${type}" maxlength="${max}" value="${escape(plan[key])}" placeholder="${key === 'cadence' ? 'For example, weekly' : 'Not set'}"/></label>`).join('')}</div></fieldset>`;
}

export function reviewPlanSummary(plan, escape, today) {
  const filled = reviewFields.filter(([key]) => plan[key]);
  const complete = filled.length === reviewFields.length;
  return `<section class="ana-owner-plan" aria-label="Owner review plan"><header><strong>Owner review plan</strong><span>${complete ? 'Plan recorded' : 'Plan needs details'}</span></header>${filled.length ? `<dl>${filled.map(([key,label]) => `<div><dt>${label}</dt><dd>${escape(plan[key])}</dd></div>`).join('')}</dl>` : '<p>Set the outcome, target basis, responsible role, baseline dates and review schedule with the owner.</p>'}${plan.review_on && plan.review_on < today ? '<p class="ana-note">The planned review date has passed. Review the results and update the plan.</p>' : ''}<p class="ana-note">Baseline dates are planning references. Before vs. After uses the selected and preceding equal-length periods; select Custom dates to inspect this baseline. Saving records the plan, not client approval or a verified improvement.</p></section>`;
}

export function recommendationFollowup(row, plan, escape) {
  const role = row.type === 'Reliability' ? 'Equipment service lead' : row.type === 'Operations' ? 'Counter / returns lead' : 'Owner / inventory lead';
  return `<div class="ana-action-followup"><div><span>Suggested responsibility</span><strong>${escape(role)}</strong></div><div><span>Review lead</span><strong>${escape(plan.responsible_role || 'Owner to assign')}</strong></div><div><span>Follow-up</span><strong>${escape(row.priority === 'high' ? 'Today — confirm the record first' : plan.review_on || 'Owner to schedule')}</strong></div><p>After the review, compare ${escape(row.measure || 'the displayed measure')} using the same equipment scope and equal-length periods. Record the action date and other changes before attributing an improvement.</p></div>`;
}

export function sourceEvidence(result, model, helpers) {
  const { escape:e, table, paged } = helpers;
  const rows = [...result.confirmed].sort((a,b) => (recordDate(b.confirmed_rental_at)?.getTime() || 0) - (recordDate(a.confirmed_rental_at)?.getTime() || 0) || String(a.id).localeCompare(String(b.id)));
  const page = paged(rows, 'analytics-source-records', 10);
  const items = new Map((model.items || []).map(item => [String(item.id), item.name]));
  const cents = row => { const fee = Number(row.rental_fee); return Number.isFinite(fee) && fee > 0 ? Math.round(fee * 100) : 0; };
  const money = amount => new Intl.NumberFormat('en-PH', { style:'currency', currency:'PHP' }).format(amount / 100);
  const total = rows.reduce((n,row) => n + cents(row), 0);
  const matches = rows.length === result.totals.rentals && total === Math.round(result.totals.fees * 100);
  return `<div class="ana-source-check"><strong>${matches ? 'Report totals reconcile with included records' : 'Review the report totals'}</strong><span>${rows.length} confirmed handoffs · ${money(total)} included fees</span></div>${analyticsDisclosure('View included rental records',`${rows.length} records · totals cover all pages`,`<p class="ana-note">Included: ACTIVE, RETURN_PENDING_INSPECTION and COMPLETED rentals confirmed in the selected Philippine dates and equipment filters. Pending and cancelled requests are excluded. Missing or invalid fees add zero to the fee total and remain visible in data coverage. This check reconciles report processing; compare receipts separately to verify collections.</p>${rows.length && helpers.canViewSourceRecords === true ? table(['RENTAL RECORD','EQUIPMENT','HANDOFF DATE (PH)','STATUS','INCLUDED FEE'], page.rows.map(row => `<tr><td><button type="button" class="secondary is-compact" ${recordAttrs('transaction',row.id,'rental record')}>${e(recordCode(row))}</button></td><td>${e(items.get(String(row.item_id)) || 'Unknown equipment')}</td><td>${e(manilaDateKey(row.confirmed_rental_at) || 'Not recorded')}</td><td>${e(row.status)}</td><td>${e(money(cents(row)))}</td></tr>`).join('')) + page.footer : `<p class="ana-note">${rows.length ? "Source record links are available in the staff workspace. Aggregate exports omit record identifiers." : "No confirmed handoffs match these filters. Change the period or record a confirmed handoff."}</p>`}<p class="ana-note">The total covers every included record, not only the current table page. Customer names and contact details are omitted here; record details require the existing staff access.</p>`,'source-records')}`;
}

export function analyticsDisclosure(title, note, content, key = '') {
  const e=value=>String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  return `<details class="ana-details" data-ana-disclosure="${e(key)}"><summary><span><strong>${e(title)}</strong><small>${e(note)}</small></span><span class="ana-details-chevron" aria-hidden="true">⌄</span></summary><div class="ana-details-body">${content}</div></details>`;
}

export function renderAnalyticsActionDetail(result, model, actionId, {escape:e, table, canViewSourceRecords}) {
  const action=result.recommendations?.find(row=>row.id===actionId);
  if(!action || !canViewSourceRecords) return null;
  const items=new Map((model.items || []).map(row=>[String(row.id),row]));
  const link=(type,id,label)=>`<button type="button" class="secondary is-compact" ${recordAttrs(type,id,label)}>${e(label)}</button>`;
  const when=value=>{const at=recordDate(value);return at?new Intl.DateTimeFormat('en-PH',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Manila'}).format(at):'Not recorded';};
  const itemName=row=>items.get(String(row.item_id))?.name || row.item_name || 'Unknown equipment';
  let rows=[],headers=[],scope=`${result.range.from} – ${result.range.to} · Philippine time`;
  if(['overdue-now','late-returns'].includes(actionId)) {
    const rentals=actionId==='overdue-now'?result.evidence.overdueNow:result.evidence.lateReturns;
    if(actionId==='overdue-now') scope='Live overdue rentals across all dates · selected equipment filters';
    headers=['RENTAL','EQUIPMENT','DUE (PH)','RECEIVED (PH)','STATUS'];
    rows=rentals.slice().sort((a,b)=>recordDate(a.due_at)-recordDate(b.due_at)).map(row=>`<tr><td>${link('transaction',row.id,recordCode(row))}</td><td>${e(itemName(row))}</td><td>${e(when(row.due_at))}</td><td>${e(when(row.received_at || row.confirmed_return_at))}</td><td>${e(row.status)}</td></tr>`);
  } else if(actionId==='handoff-delay') {
    headers=['RENTAL / REQUEST','EQUIPMENT','CONFIRMED (PH)','WAIT'];
    rows=result.evidence.slowConfirmations.slice().sort((a,b)=>b.seconds-a.seconds).map(({request,rental,seconds,confirmedAt})=>`<tr><td>${rental?link('transaction',rental.id,recordCode(rental)):e(request.id)}</td><td>${e(itemName(rental || request))}</td><td>${e(when(confirmedAt))}</td><td>${e(seconds.toFixed(1))} sec</td></tr>`);
    scope+=' · confirmations taking 60 seconds or more';
  } else if(actionId.startsWith('service-')) {
    const group=actionId.slice(8),ids=new Set((model.items || []).filter(row=>String(row.stock_group_id || row.id)===group).map(row=>String(row.id)));
    headers=['SERVICE RECORD','EQUIPMENT','STARTED (PH)','STATUS'];
    rows=result.evidence.maintenance.filter(row=>ids.has(String(row.item_id))).map(row=>`<tr><td>${link('maintenance',row.id,recordCode(row))}</td><td>${e(itemName(row))}</td><td>${e(when(row.started_at))}</td><td>${e(row.status)}</td></tr>`);
  } else if(action.itemId) {
    const group=items.get(String(action.itemId));
    const units=(model.items || []).filter(row=>String(row.stock_group_id || row.id)===String(group?.stock_group_id || action.itemId));
    headers=['PHYSICAL UNIT','EQUIPMENT','STATUS'];
    rows=units.map(row=>`<tr><td>${link('equipment',row.id,row.item_code || row.id)}</td><td>${e(row.name)}</td><td>${e(row.effective_status || row.status || 'AVAILABLE')}</td></tr>`);
  } else return null;
  return {title:action.title,html:`<div class="analytics-workspace ana-business ana-action-detail"><p class="ana-note">${e(scope)}</p><div class="ana-evidence"><strong>${e(action.basis)}</strong></div><p>${e(action.action)}</p><p class="ana-note">${rows.length} matching record${rows.length===1?'':'s'} · select a record to review its details.</p>${rows.length?table(headers,rows.join('')):'<p class="ana-note">No matching records remain in this snapshot. Refresh the report to check the current status.</p>'}</div>`};
}
