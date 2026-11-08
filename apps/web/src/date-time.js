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

export function formatPhilippineDateTime(value) {
  if (!value) return '';
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return '';
    const m = new Date(value.getTime() + 8 * 3600000);
    const iso = m.toISOString();
    return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
  }
  const text = String(value).trim();
  if (!text) return '';
  const d = new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(text) ? text : text.replace(' ', 'T') + '+08:00');
  if (!Number.isFinite(d.getTime())) return text;
  const manila = new Date(d.getTime() + 8 * 3600000);
  const iso = manila.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

export function formatExcelCsvCell(value) {
  if (value === null || value === undefined) return '""';
  if (typeof value === 'number') {
    return Number.isFinite(value) ? `"${value}"` : '""';
  }
  const text = String(value);
  const isPhoneWithLeadingZero = /^0\d{9,10}$/.test(text);
  const safe = isPhoneWithLeadingZero || /^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
