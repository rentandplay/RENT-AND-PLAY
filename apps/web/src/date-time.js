// datetime-local inputs contain no timezone. All counter dates use Philippine time.
export function manilaDateTimeInput(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Enter a valid date and time.');
  return new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 16);
}

export function manilaDateTimeIso(value) {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('Enter a valid date and time in Philippine time.');
  const date = new Date(value + '+08:00');
  if (!Number.isFinite(date.getTime()) || manilaDateTimeInput(date) !== value) throw new Error('Enter a valid date and time in Philippine time.');
  return date.toISOString();
}
