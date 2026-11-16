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
  return `<div class="ana-source-check"><strong>${matches ? 'Report totals reconcile with included records' : 'Review the report totals'}</strong><span>${rows.length} confirmed handoffs · ${money(total)} included fees</span></div><p class="ana-note">Included: ACTIVE, RETURN_PENDING_INSPECTION and COMPLETED rentals confirmed in the selected Philippine dates and equipment filters. Pending and cancelled requests are excluded. Missing or invalid fees add zero to the fee total and remain visible in data coverage. This check reconciles report processing; compare receipts separately to verify collections.</p>${rows.length && helpers.canViewSourceRecords === true ? table(['RENTAL RECORD','EQUIPMENT','HANDOFF DATE (PH)','STATUS','INCLUDED FEE'], page.rows.map(row => `<tr><td><button type="button" class="secondary is-compact" ${recordAttrs('rental',row.id,'rental record')}>${e(recordCode(row))}</button></td><td>${e(items.get(String(row.item_id)) || 'Unknown equipment')}</td><td>${e(manilaDateKey(row.confirmed_rental_at) || 'Not recorded')}</td><td>${e(row.status)}</td><td>${e(money(cents(row)))}</td></tr>`).join('')) + page.footer : `<p class="ana-note">${rows.length ? "Source record links are available in the staff workspace. Aggregate exports omit record identifiers." : "No confirmed handoffs match these filters. Change the period or record a confirmed handoff."}</p>`}<p class="ana-note">The total covers every included record, not only the current table page. Customer names and contact details are omitted here; record details require the existing staff access.</p>`;
}
