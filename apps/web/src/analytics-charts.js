const finite = value => typeof value === 'number' && Number.isFinite(value);
const compact = value => new Intl.NumberFormat('en-PH', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
const plain = value => new Intl.NumberFormat('en-PH', { maximumFractionDigits: 1 }).format(value);

// Labels and exact values remain in the DOM. SVG titles expose each data point
// to assistive technology and pointer hover without loading a chart library.
export function lineChart(labels, series, { escape: e, id, title, currency = false, forecastStart = null, integerTicks = false } = {}) {
  if (!labels.length) return '<div class="ana-empty"><strong>No activity to chart yet</strong><p>Recorded activity will appear here when the selected period has data.</p></div>';
  const left = 64, right = 706, top = 24, bottom = 226, width = right - left;
  const values = series.flatMap(row => [...row.values, ...(row.high || [])]).filter(finite), peak = Math.max(1, ...values);
  const magnitude = 10 ** Math.floor(Math.log10(peak)), maximum = Math.ceil(peak / magnitude) * magnitude;
  const x = index => labels.length === 1 ? (left + right) / 2 : left + index * width / (labels.length - 1), y = value => bottom - Math.max(0, value) / maximum * (bottom - top);
  const gridValues = [...new Set([0, .25, .5, .75, 1].map(fraction => integerTicks ? Math.round(maximum * fraction) : maximum * fraction))];
  const grid = gridValues.map(value => `<g><line x1="${left}" x2="${right}" y1="${y(value)}" y2="${y(value)}" class="ana-gridline"/><text x="${left - 12}" y="${y(value) + 4}" text-anchor="end" class="ana-axis-label">${currency ? '₱' : ''}${compact(value)}</text></g>`).join('');
  const ticks = [...new Set(Array.from({ length: Math.min(6, labels.length) }, (_, index) => Math.round(index * (labels.length - 1) / Math.max(1, Math.min(6, labels.length) - 1))))];
  const tickLabels = ticks.map(index => `<text x="${x(index)}" y="254" text-anchor="${index === 0 ? 'start' : index === labels.length - 1 ? 'end' : 'middle'}" class="ana-axis-label">${e(labels[index])}</text>`).join('');
  const plots = series.map(row => {
    const runs = []; let run = [];
    row.values.forEach((value, index) => { if (finite(value)) run.push({ value, index }); else if (run.length) { runs.push(run); run = []; } }); if (run.length) runs.push(run);
    const bands = row.low && row.high ? runs.map(points => `<polygon points="${points.map(point => `${x(point.index)},${y(finite(row.high[point.index]) ? row.high[point.index] : point.value)}`).join(' ')} ${[...points].reverse().map(point => `${x(point.index)},${y(finite(row.low[point.index]) ? row.low[point.index] : point.value)}`).join(' ')}" fill="${row.color}" opacity=".14"/>`).join('') : '';
    const paths = runs.map(points => `${row.area ? `<polygon points="${x(points[0].index)},${bottom} ${points.map(point => `${x(point.index)},${y(point.value)}`).join(' ')} ${x(points.at(-1).index)},${bottom}" fill="${row.color}" opacity=".07"/>` : ''}<polyline points="${points.map(point => `${x(point.index)},${y(point.value)}`).join(' ')}" fill="none" stroke="${row.color}" stroke-width="3" ${row.dashed ? 'stroke-dasharray="7 6"' : ''} stroke-linejoin="round" stroke-linecap="round"/>`).join('');
    const dots = row.values.map((value, index) => finite(value) ? `<circle cx="${x(index)}" cy="${y(value)}" r="${labels.length > 60 ? 2 : 3.5}" fill="${row.color}" class="ana-chart-point" aria-label="${e(row.name + ', ' + (row.labels?.[index] || labels[index]) + ': ' + (currency ? 'PHP ' : '') + plain(value))}"><title>${e(row.name)} · ${e(row.labels?.[index] || labels[index])}: ${currency ? '₱' : ''}${plain(value)}</title></circle>` : '').join('');
    return bands + paths + dots;
  }).join('');
  const divider = forecastStart !== null && forecastStart > 0 && forecastStart < labels.length ? `<line x1="${x(forecastStart) - width / Math.max(1, labels.length - 1) / 2}" x2="${x(forecastStart) - width / Math.max(1, labels.length - 1) / 2}" y1="${top}" y2="${bottom}" class="ana-forecast-divider"/>` : '';
  return `<figure class="ana-chart" aria-labelledby="${id}-title"><svg viewBox="0 0 730 272" role="img" aria-labelledby="${id}-title ${id}-description"><title id="${id}-title">${e(title)}</title><desc id="${id}-description">${e(series.map(row => row.name).join(' and '))}. ${currency ? 'Amounts in Philippine pesos.' : 'Rental counts.'} Exact values are available in the tables below.</desc>${grid}${divider}${plots}${tickLabels}</svg><figcaption class="ana-chart-legend">${series.map(row => `<span><i style="--ana-series-color:${row.color};background:${row.color}" class="${row.dashed ? 'is-dashed' : ''}"></i>${e(row.name)}</span>`).join('')}${series.some(row => row.low) ? '<span class="ana-range-key">Shaded: historical variation (±1 standard deviation)</span>' : ''}</figcaption></figure>`;
}

export function barChart(rows, { escape: e, title, currency = false, color = '#ef8534', caption } = {}) {
  const peak = Math.max(1, ...rows.map(row => finite(row.value) ? row.value : 0)), left = 54, right = 706, top = 22, bottom = 211, column = (right - left) / Math.max(1, rows.length);
  const bars = rows.map((row, index) => {
    const amount = finite(row.value) ? Math.max(0, row.value) : 0, height = amount / peak * (bottom - top), center = left + column * (index + .5);
    return `<g><rect x="${center - column * .27}" y="${bottom - height}" width="${column * .54}" height="${Math.max(1, height)}" rx="5" fill="${row.color || color}" opacity="${amount === peak ? 1 : .72}" tabindex="0" aria-label="${e(row.label)}: ${currency ? 'PHP ' : ''}${plain(amount)}"><title>${e(row.label)}: ${currency ? '₱' : ''}${plain(amount)}</title></rect><text x="${center}" y="${Math.max(16, bottom - height - 8)}" text-anchor="middle" class="ana-bar-value">${currency ? '₱' : ''}${compact(amount)}</text><text x="${center}" y="240" text-anchor="middle" class="ana-axis-label">${e(row.label)}</text></g>`;
  }).join('');
  return `<figure class="ana-chart"><svg viewBox="0 0 730 262" role="img" aria-label="${e(title)}"><title>${e(title)}</title><line x1="${left}" x2="${right}" y1="${bottom}" y2="${bottom}" class="ana-gridline"/>${bars}</svg><figcaption>${e(caption || (currency ? 'Recorded fees in Philippine pesos.' : 'Counts of confirmed rentals in the selected period.'))}</figcaption></figure>`;
}
