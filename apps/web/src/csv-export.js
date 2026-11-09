import { formatExcelCsvCell, formatPhilippineDateTime } from './date-time.js';

export function serializeCsv(rows, { rectangular = false } = {}) {
  const width = rectangular ? rows.reduce((maximum, row) => Math.max(maximum, row.length), 0) : null;
  return '\uFEFF' + rows.map(row => {
    const cells = width === null ? row : Array.from({ length: width }, (_, index) => row[index] ?? '');
    return cells.map(formatExcelCsvCell).join(',');
  }).join('\r\n');
}

export function csvNumber(value) {
  if (value == null || typeof value === 'boolean' || typeof value === 'string' && !value.trim()) return '';
  const number = Number(value);
  return Number.isFinite(number) ? number : '';
}

export async function collectCsvRecords(api, kind, filters = {}, onProgress = () => {}) {
  if (!['customers', 'rentals', 'maintenance'].includes(kind)) throw Error('Unsupported export.');
  const query = new URLSearchParams(filters);
  query.delete('cursor'); query.delete('view'); query.set('limit', '100');
  const seenCursors = new Set(), records = new Map();
  for (let page = 0; page < 1000; page++) {
    const response = await api(`/records/${kind}?${query}`, page === 0 ? { headers: { 'Cache-Control': 'no-cache' } } : {});
    if (!Array.isArray(response.records)) throw Error('The export returned incomplete data. Please retry.');
    for (const record of response.records) {
      if (!record?.id) throw Error('A record has no identifier. Refresh before exporting.');
      records.set(String(record.id), record);
    }
    onProgress(records.size);
    if (!response.nextCursor) return [...records.values()];
    if (seenCursors.has(response.nextCursor)) throw Error('The export could not advance to the next page. Please retry.');
    seenCursors.add(response.nextCursor);
    query.set('cursor', response.nextCursor);
  }
  throw Error('This export is too large. Choose a narrower date range or filter.');
}

export function downloadCsv(content, name, now = new Date()) {
  const stamp = formatPhilippineDateTime(now).replace(/[^0-9]/g, '');
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = `rent-and-play-${name}-${stamp}.csv`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
