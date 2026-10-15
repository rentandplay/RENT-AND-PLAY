const round = value => Math.round(value * 100) / 100;
const known = value => value != null && Number.isFinite(Number(value)) && Number(value) >= 0;
const validMoney = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 9999999999.99 && Math.abs(value * 100 - Math.round(value * 100)) < .0001;

export function rentalPaymentSummary(rental, extra = {}) {
  const value = { ...rental, ...extra };
  if (!Object.hasOwn(value, 'rental_paid_amount')) return { balance_due: null, refund_due: null, payment_status: 'UNKNOWN' };
  const paid = round(Number(value.rental_paid_amount || 0)), applied = round(Number(value.deposit_applied_amount || 0));
  const base = Number(value.rental_fee ?? value.rateFee ?? 0), final = value.fee_breakdown?.final_rental_charges;
  const closed = ['CANCELLED', 'REJECTED', 'EXPIRED'].includes(String(value.status || '').toUpperCase());
  const charges = closed ? 0 : validMoney(final) ? final : base;
  const balance = round(Math.max(0, charges - paid - applied));
  const depositRemaining = round(Math.max(0, Number(value.deposit_collected_amount || 0) - applied - Number(value.deposit_refunded_amount || 0)));
  const rentalRefund = closed ? round(Math.max(0, paid - Number(value.rental_refunded_amount || 0))) : 0;
  const refundDue = ['COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED'].includes(String(value.status || '').toUpperCase()) ? round(depositRemaining + rentalRefund) : 0;
  return { balance_due: balance, refund_due: refundDue, payment_status: refundDue > 0 ? 'REFUND_PENDING' : balance > 0 ? (paid > 0 ? 'BALANCE_DUE' : 'UNPAID') : 'PAID' };
}

export function rentalFinanceState(rental, coverage = {}) {
  const paid = known(rental.rental_paid_amount) ? Number(rental.rental_paid_amount) : null;
  const final = rental.fee_breakdown?.final_rental_charges;
  const released = Boolean(rental.confirmed_rental_at) || ['ACTIVE', 'RETURN_PENDING_INSPECTION', 'COMPLETED'].includes(String(rental.status || '').toUpperCase());
  const closed = ['CANCELLED', 'REJECTED', 'EXPIRED'].includes(String(rental.status || '').toUpperCase());
  const charges = !released || closed ? 0 : known(final) ? Number(final) : known(rental.rental_fee ?? rental.rateFee) ? Number(rental.rental_fee ?? rental.rateFee) : null;
  const ledgerPaid = Number(coverage.collections || 0);
  const unposted = paid == null ? null : round(Math.max(0, paid - ledgerPaid));
  const payment = paid == null ? { balance_due: null, refund_due: null, payment_status: 'UNKNOWN' } : rentalPaymentSummary(rental);
  if (charges == null) { payment.balance_due = null; payment.payment_status = 'UNKNOWN'; }
  return { charges, saved_paid: paid, saved_refunded: paid == null ? null : Number(rental.rental_refunded_amount || 0), ledger_collections: ledgerPaid, unposted_paid: unposted, ...payment,
    receipt_status: paid == null ? 'PAYMENT_UNKNOWN' : unposted > 0 ? 'RECEIPT_DATE_NEEDED' : paid > 0 ? 'RECORDED' : 'NO_PAYMENT' };
}

export function rentalFinanceContribution(rental, coverage, day) {
  if (!day) return null;
  const state = rentalFinanceState(rental, coverage);
  return { day, rentals: 1, charges: state.charges || 0, saved_paid: state.saved_paid || 0, saved_refunded: state.saved_refunded || 0,
    balance_due: state.balance_due || 0, refund_due: state.refund_due || 0, unposted_paid: state.unposted_paid || 0,
    unposted_count: state.unposted_paid > 0 ? 1 : 0, unknown_payments: state.saved_paid == null ? 1 : 0, unknown_charges: state.charges == null ? 1 : 0 };
}
