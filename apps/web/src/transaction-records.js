import { recordAttrs } from './record-links.js';

export const recordedAmount = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
export const transactionTime = value => {
  if (!value) return null;
  const text = String(value), date = new Date(/Z$|[+-]\d\d:\d\d$/.test(text) ? text : text.replace(' ', 'T') + '+08:00');
  return Number.isFinite(date.getTime()) ? date : null;
};
export const actualReturnTime = row => row.fee_breakdown?.actual_return_at || row.actual_return_at || row.confirmed_return_at || null;
export function savedCharges(row) {
  const fee = row.fee_breakdown || {};
  return { ...fee, rental_fee: fee.rental_fee ?? row.rental_fee ?? null, deposit_amount: fee.deposit_amount ?? row.deposit_amount ?? null, penalty_amount: fee.penalty_amount ?? row.penalty_amount ?? null, final_rental_charges: fee.final_rental_charges ?? row.final_rental_charges ?? null };
}
export function chargeCell(row, { money, escape: e }) {
  const fee = savedCharges(row), final = recordedAmount(fee.final_rental_charges);
  return `<strong>${recordedAmount(final ? fee.final_rental_charges : fee.rental_fee) ? money(final ? fee.final_rental_charges : fee.rental_fee) : 'Charges not recorded'}</strong><small>${final ? 'Final rental charges' : 'Base rental fee · final charges not recorded'}</small><small>Refundable deposit ${recordedAmount(fee.deposit_amount) ? money(fee.deposit_amount) : 'not recorded'}</small>${!recordedAmount(fee.penalty_amount) ? '<small class="record-missing">Penalty not recorded</small>' : `<small>Penalty ${e(money(fee.penalty_amount))}</small>`}`;
}
export function renderFeeBreakdown(row, h) {
  const { money, escape: e, formatDate } = h, fee = savedCharges(row);
  const moneyValue = (value, missing = 'Not recorded') => recordedAmount(value) ? money(value) : `<span class="record-missing">${missing}</span>`;
  const field = (label, value) => `<div><dt>${e(label)}</dt><dd>${value}</dd></div>`;
  const components = (fee.rate_components || []).map(rate => `<li>${e(rate.label)} · ${e(rate.units)} × ${moneyValue(rate.unit_amount)} = ${moneyValue(rate.total_amount)}</li>`).join('');
  return `<section class="record-section"><h3>Saved fee breakdown</h3>${fee.snapshot_version ? `<p>Saved ${e(formatDate(fee.saved_at))} · ${e(fee.pricing_source?.replaceAll('_', ' '))}</p>` : '<p class="record-missing">Original pricing snapshot not recorded. Historical rates cannot be reconstructed from current pricing.</p>'}<dl class="record-fields">${field('Rate / package', e(fee.rate_label || 'Not recorded'))}${field('Billing duration', fee.billed_minutes ? `${e(fee.billed_minutes)} minutes${fee.requested_minutes ? ` · requested ${e(fee.requested_minutes)} minutes` : ''}` : 'Not recorded')}${field('Rental starts', e(formatDate(fee.start_at || row.confirmed_rental_at)))}${field('Due time', e(formatDate(fee.due_at || row.due_at)))}${field('Actual return time', e(formatDate(actualReturnTime(row))))}${field('Base rental fee', moneyValue(fee.rental_fee))}${field('Grace period', fee.grace_minutes != null ? `${e(fee.grace_minutes)} minutes` : 'Not recorded')}${field('Overtime units / rate', `${fee.overtime_units != null ? e(fee.overtime_units) : 'Not recorded'} / ${moneyValue(fee.overtime_rate)}${fee.overtime_unit_minutes ? ` per started ${e(fee.overtime_unit_minutes)} minutes` : ''}`)}${field('Overtime amount', moneyValue(fee.overtime_fee))}${field('Penalty amount', moneyValue(fee.penalty_amount, 'Penalty not recorded'))}${field('Penalty reason', e(fee.penalty_reason || (fee.penalty_amount === 0 ? 'No penalty' : 'Not recorded')))}${field('Final rental charges', `<strong>${moneyValue(fee.final_rental_charges, 'Final charges not recorded')}</strong>`)}${field('Refundable deposit', moneyValue(fee.deposit_amount))}</dl>${components ? `<ul class="rate-components">${components}</ul>` : ''}<p class="record-note">Refundable deposits are kept separate from rental charges.</p></section>`;
}
export function renderConditionSnapshots(row, model, h) {
  const { escape: e, formatDate } = h;
  const snapshot = phase => row[phase === 'RELEASE' ? 'release_condition' : 'return_condition'] || (model.conditionRecords || []).find(record => String(record.rental_id) === String(row.id) && record.phase === phase);
  const card = (label, record) => `<article class="condition-snapshot"><h4>${e(label)}</h4>${record ? `<strong>${e(String(record.condition || 'Condition not recorded').replaceAll('_', ' '))}</strong><p class="inspection-notes">${e(record.notes || 'Notes not recorded')}</p><dl><dt>Inspected by</dt><dd>${e(record.inspected_by_name || record.inspected_by || 'Not recorded')}</dd><dt>Inspected at</dt><dd>${e(formatDate(record.inspected_at))}</dd><dt>Inspection result</dt><dd>${e((record.result || 'Not recorded').replaceAll('_', ' '))}</dd><dt>Confirmed at</dt><dd>${e(formatDate(record.confirmed_at))}</dd></dl>` : '<p class="record-missing">Condition inspection not recorded.</p>'}</article>`;
  const maintenance = (model.maintenance || []).filter(record => String(record.rental_id) === String(row.id) || record.id === row.maintenance_record_id);
  return `<section class="record-section"><h3>Condition snapshots</h3><div class="condition-snapshots">${card('Before release', snapshot('RELEASE'))}${card('On return', snapshot('RETURN'))}</div>${maintenance.map(record => `<p class="maintenance-reference">Linked maintenance <strong>${e(record.id)}</strong> · ${e(String(record.status || 'Status not recorded').replaceAll('_', ' '))}<br/>${e(record.reason || '')} · ${e(record.inspection_notes || '')}</p>`).join('')}<p class="record-note">Saved inspection records remain in this rental after repairs.</p></section>`;
}
export function enrichVerification(request, model) {
  const rental = (model.transactions || []).find(row => String(row.id) === String(request.rental_id));
  const assigned = (model.terminals || []).find(row => String(row.id) === String(request.terminal_id));
  return { ...request, transaction_type: String(request.transaction_type || request.type || '').toUpperCase(), rental_code: rental?.rental_code || request.rental_id || 'Rental not recorded', item_name: rental?.item_name || 'Unknown equipment', customer_name: rental?.customer_name || 'Unknown customer', terminal_code: request.terminal_code || assigned?.terminal_code || 'Code not recorded' };
}
export function verificationMatches(request, filter = {}) {
  const query = String(filter.search || '').toLowerCase();
  return (!filter.status || filter.status === 'ALL' || request.status === filter.status) && (!filter.type || filter.type === 'ALL' || request.transaction_type === filter.type) && (!filter.terminal || filter.terminal === 'ALL' || String(request.terminal_id) === filter.terminal) && [request.id, request.rental_id, request.rental_code, request.transaction_type, request.terminal_id, request.terminal_code, request.confirmed_terminal_code, request.item_name, request.customer_name, request.verification_code, request.rejection_reason, request.final_reason].join(' ').toLowerCase().includes(query);
}
export const outcomeMatches = (row, requests, outcome) => row.status === outcome || requests.some(request => String(request.rental_id) === String(row.id) && request.status === outcome);
export function renderRequestHistory(requests, h) {
  const { escape: e, formatDate } = h;
  if (!requests.length) return '<p class="record-missing">No verification or terminal confirmation record.</p>';
  const confirmed = requests.some(request => request.status === 'CONFIRMED' && request.confirmed_at);
  return `${confirmed ? '' : '<p class="record-missing">No terminal confirmation record.</p>'}<div class="request-history">${requests.map(request => `<article class="request-history-entry" ${h.requestLinks === false ? '' : recordAttrs('verification', request.id, request.rental_code || request.id)}><div class="request-history-heading"><strong>${e(request.transaction_type || request.type || 'Unknown request')} · ${e(request.id)}</strong><span class="badge ${e(String(request.status || '').toLowerCase())}">${e(request.status || 'Unknown')}</span></div><p>Rental ${e(request.rental_code || request.rental_id)} · Assigned terminal ${e(request.terminal_code || 'Code not recorded')} (${e(request.terminal_id || 'ID not recorded')})</p><dl class="record-fields"><div><dt>Requested</dt><dd>${e(formatDate(request.requested_at))}</dd></div><div><dt>Deadline</dt><dd>${e(formatDate(request.expires_at))}</dd></div><div><dt>Confirmed</dt><dd>${e(formatDate(request.confirmed_at))}</dd></div><div><dt>Expired</dt><dd>${e(formatDate(request.expired_at))}</dd></div><div><dt>Rejected</dt><dd>${e(formatDate(request.rejected_at))}</dd></div><div><dt>Confirming terminal</dt><dd>${e(request.confirmed_terminal_id ? `${request.confirmed_terminal_code || 'Code not recorded'} (${request.confirmed_terminal_id})` : 'No confirming terminal recorded')}</dd></div></dl>${request.rejection_reason || request.final_reason ? `<p class="request-outcome-reason">${e(request.rejection_reason || request.final_reason)}</p>` : ''}${request.status === 'PENDING' ? `<button type="button" class="secondary" data-inspection="${e(request.id)}">${request.inspection ? 'Review inspection' : 'Record inspection'}</button>` : ''}</article>`).join('')}</div>`;
}
