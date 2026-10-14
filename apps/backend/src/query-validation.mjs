const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
export function pageLimit(value, fallback = 25) {
  if (value == null || value === '') return fallback;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) fail('Choose a page size from 1 to 100.');
  return limit;
}
export function validDay(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
}
export function dateRange(from, to, maxDays = 366) {
  if (from && !validDay(from) || to && !validDay(to) || from && to && (from > to || Date.parse(to)-Date.parse(from)>maxDays*86400000)) fail('Choose a valid date range of up to one year.');
}
export const validDocumentId = id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id);
