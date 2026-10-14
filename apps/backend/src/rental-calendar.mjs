import { asDate } from './firebase.mjs';
import { validDay } from './query-validation.mjs';

export const OPEN_RENTALS = ['PENDING_ADMIN_APPROVAL','PENDING_ESP32_RENT','PENDING_VERIFICATION','APPROVED','ACTIVE','RETURN_PENDING_INSPECTION'];
export const LOCAL_DELIVERY_AREA = 'Lakewood Subdivision, Los Baños, Laguna';
export const TURNAROUND_MS = 10 * 60000;
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const date = value => { const d = asDate(value); return d && Number.isFinite(d.getTime()) ? d : null; };

export function scheduledStart(input, now = new Date(), allowPast = false) {
  if (input.scheduledStartAt == null || input.scheduledStartAt === '') return null;
  if (typeof input.scheduledStartAt !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(input.scheduledStartAt)) fail(400, 'Scheduled time must include a timezone.');
  const start = date(input.scheduledStartAt);
  if(!validDay(input.scheduledStartAt.slice(0,10)))fail(400,'Choose a valid scheduled calendar day.');
  if (!start || !allowPast && (start < new Date(now.getTime() + 5 * 60000) || start > new Date(now.getTime() + 180 * 86400000))) fail(400, 'Choose a rental time at least 5 minutes ahead and within the next 180 days.');
  return start;
}

export function blocksCurrentStock(rental) {
  return OPEN_RENTALS.includes(String(rental.status).toUpperCase()) && (!rental.scheduled_start_at || rental.confirmed_rental_at || ['PREPARED','OUT_FOR_DELIVERY','DELIVERY_FAILED'].includes(rental.delivery_status));
}

function occupiedWindow(rental, now) {
  const status=String(rental.status).toUpperCase();
  if (!OPEN_RENTALS.includes(status)) return null;
  if (rental.hold_expires_at && date(rental.hold_expires_at) <= now && !['ACTIVE','RETURN_PENDING_INSPECTION'].includes(status) && !['OUT_FOR_DELIVERY','DELIVERY_FAILED'].includes(rental.delivery_status)) return null;
  if (status === 'RETURN_PENDING_INSPECTION') return [-Infinity, Infinity];
  const start = date(rental.confirmed_rental_at || rental.scheduled_start_at || rental.created_at || rental.startDate)?.getTime() ?? now.getTime();
  const end = date(rental.due_at || rental.dueDate || rental.scheduled_end_at || rental.estimated_due_at)?.getTime();
  if (status === 'ACTIVE' && (!end || end <= now.getTime())) return [start, Infinity];
  return [start, end ? Math.max(end, rental.scheduled_start_at ? end : now.getTime()) + TURNAROUND_MS : Infinity];
}

export function calendarConflict(rentals, start, end, now = new Date(), excludeId = '') {
  return rentals.find(rental => {
    if (String(rental.id) === String(excludeId)) return false;
    const window = occupiedWindow(rental, now);
    return window && start.getTime() < window[1] && end.getTime() + TURNAROUND_MS > window[0];
  });
}

export function assertCalendarFree(rentals, start, end, now, excludeId = '') {
  if (calendarConflict(rentals, start, end, now, excludeId)) fail(409, 'This unit is reserved during that period. Choose another time or equipment. A short return/inspection allowance is included.');
}

export function handoffDeadline(rental, now, fallbackMs) {
  return rental.scheduled_start_at ? new Date(date(rental.scheduled_start_at).getTime() + 30 * 60000) : new Date(now.getTime() + fallbackMs);
}

export function assertPreparationTime(rental, now) {
  if (rental.scheduled_start_at && now.getTime() < date(rental.scheduled_start_at).getTime() - TURNAROUND_MS) fail(409, 'Prepare this scheduled rental within 10 minutes of its start time.');
}
