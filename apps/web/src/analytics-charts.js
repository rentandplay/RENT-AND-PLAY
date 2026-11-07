const finite = value => typeof value === 'number' && Number.isFinite(value);
const compact = value => new Intl.NumberFormat('en-PH', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
const plain = value => new Intl.NumberFormat('en-PH', { maximumFractionDigits: 1 }).format(value);

// Inspect the plot directly with pointer, touch or arrow keys. No slider is needed.
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
  const plots = series.map((row, seriesIndex) => {
    const runs = []; let run = [];
    row.values.forEach((value, index) => { if (finite(value)) run.push({ value, index }); else if (run.length) { runs.push(run); run = []; } }); if (run.length) runs.push(run);
    const bands = row.low && row.high ? runs.map(points => `<polygon points="${points.map(point => `${x(point.index)},${y(finite(row.high[point.index]) ? row.high[point.index] : point.value)}`).join(' ')} ${[...points].reverse().map(point => `${x(point.index)},${y(finite(row.low[point.index]) ? row.low[point.index] : point.value)}`).join(' ')}" fill="${row.color}" opacity=".14"/>`).join('') : '';
    const paths = runs.map(points => `${row.area ? `<polygon points="${x(points[0].index)},${bottom} ${points.map(point => `${x(point.index)},${y(point.value)}`).join(' ')} ${x(points.at(-1).index)},${bottom}" fill="${row.color}" opacity=".07"/>` : ''}<polyline points="${points.map(point => `${x(point.index)},${y(point.value)}`).join(' ')}" fill="none" stroke="${row.color}" stroke-width="3" ${row.dashed ? 'stroke-dasharray="7 6"' : ''} stroke-linejoin="round" stroke-linecap="round"/>`).join('');
    const dots = row.values.map((value, index) => finite(value) && (value !== 0 || labels.length === 1) ? `<circle cx="${x(index)}" cy="${y(value)}" r="${labels.length > 60 ? 2 : 3}" fill="${row.color}" class="ana-chart-point" aria-label="${e(row.name + ', ' + (row.labels?.[index] || labels[index]) + ': ' + (currency ? 'PHP ' : '') + plain(value))}"><title>${e(row.name)} · ${e(row.labels?.[index] || labels[index])}: ${currency ? '₱' : ''}${plain(value)}</title></circle>` : '').join('');
    return `<g data-ana-series="${seriesIndex}">${bands + paths + dots}</g>`;
  }).join('');
  const divider = forecastStart !== null && forecastStart > 0 && forecastStart < labels.length ? `<line x1="${x(forecastStart) - width / Math.max(1, labels.length - 1) / 2}" x2="${x(forecastStart) - width / Math.max(1, labels.length - 1) / 2}" y1="${top}" y2="${bottom}" class="ana-forecast-divider"/>` : '';
  const inspection = labels.map((label, index) => ({ label, rows: series.flatMap((row, seriesIndex) => finite(row.values[index]) ? [{ seriesIndex, name: row.name, label: row.labels?.[index] || label, value: `${currency ? '₱' : ''}${plain(row.values[index])}`, spread: finite(row.low?.[index]) && finite(row.high?.[index]) ? `${currency ? '₱' : ''}${plain(row.low[index])} – ${currency ? '₱' : ''}${plain(row.high[index])}` : null }] : []) }));
  const hits = labels.map((label, index) => {
    const start = index === 0 ? left : (x(index - 1) + x(index)) / 2;
    const end = index === labels.length - 1 ? right : (x(index) + x(index + 1)) / 2;
    return `<rect focusable="false" aria-hidden="true" data-ana-point="${index}" x="${start}" y="${top}" width="${end - start}" height="${bottom - top}" fill="transparent"/>`;
  }).join('');
  const payload = { labels, series, options: { id, title, currency, forecastStart, integerTicks } };
  return `<figure class="ana-chart ana-interactive" data-ana-chart data-ana-values="${e(JSON.stringify(inspection))}" data-ana-source="${e(JSON.stringify(payload))}" aria-labelledby="${id}-title"><div class="ana-chart-tools"><span>Hover or tap to inspect</span>${labels.length > 14 ? '<label>View <select data-ana-zoom aria-label="Chart zoom"><option value="0">Full period</option><option value="14">Last 14 periods</option><option value="7">Last 7 periods</option></select></label>' : ''}</div><div class="ana-plot" data-ana-plot tabindex="0" role="group" aria-label="${e(title)}. Use Left and Right arrows to explore, Enter to pin, Escape to dismiss."><svg viewBox="0 0 730 272" role="img" aria-labelledby="${id}-title ${id}-description"><title id="${id}-title">${e(title)}</title><desc id="${id}-description">${e(series.map(row => row.name).join(' and '))}. Focus the chart and use arrow keys to inspect exact values.</desc>${grid}${divider}${plots}${tickLabels}<line data-ana-crosshair x1="${left}" x2="${left}" y1="${top}" y2="${bottom}" class="ana-crosshair" hidden/>${hits}</svg>${chartTooltip()}</div><figcaption class="ana-chart-legend">${series.map((row, index) => `<button type="button" data-ana-toggle="${index}" aria-pressed="true" aria-label="Show ${e(row.name)}"><i style="--ana-series-color:${row.color};background:${row.color}" class="${row.dashed ? 'is-dashed' : ''}"></i>${e(row.name)}</button>`).join('')}${series.some(row => row.low) ? '<span class="ana-range-key">Shaded: historical variation (±1 standard deviation), not a confidence interval</span>' : ''}</figcaption></figure>`;
}

export function barChart(rows, { escape: e, title, currency = false, color = '#ef8534', caption } = {}) {
  const peak = Math.max(1, ...rows.map(row => finite(row.value) ? row.value : 0)), left = 54, right = 706, top = 22, bottom = 211, column = (right - left) / Math.max(1, rows.length);
  const bars = rows.map((row, index) => {
    const amount = finite(row.value) ? Math.max(0, row.value) : 0, height = amount / peak * (bottom - top), center = left + column * (index + .5);
    return `<g data-ana-point="${index}" tabindex="0" role="button" aria-label="Inspect ${e(row.label)}: ${currency ? 'PHP ' : ''}${plain(amount)}"><rect x="${left + column * index}" y="${top}" width="${column}" height="${bottom - top}" fill="transparent"/><rect x="${center - column * .27}" y="${bottom - height}" width="${column * .54}" height="${Math.max(1, height)}" rx="5" fill="${row.color || color}" opacity="${amount === peak ? 1 : .72}"><title>${e(row.label)}: ${currency ? '₱' : ''}${plain(amount)}</title></rect><text x="${center}" y="${Math.max(16, bottom - height - 8)}" text-anchor="middle" class="ana-bar-value">${currency ? '₱' : ''}${compact(amount)}</text><text x="${center}" y="240" text-anchor="middle" class="ana-axis-label">${e(row.label.length > 18 ? row.label.slice(0, 16) + '…' : row.label)}</text></g>`;
  }).join('');
  const total = rows.reduce((value, row) => value + (finite(row.value) ? Math.max(0, row.value) : 0), 0);
  const inspection = rows.map(row => ({ label: row.label, rows: [{ name: currency ? 'Recorded fees' : 'Rentals', value: `${currency ? '₱' : ''}${plain(finite(row.value) ? row.value : 0)}`, label: total ? `${plain(Math.max(0, row.value || 0) / total * 100)}% of chart total` : 'No activity' }] }));
  return `<figure class="ana-chart ana-interactive" data-ana-chart data-ana-values="${e(JSON.stringify(inspection))}"><div class="ana-plot" data-ana-plot><svg viewBox="0 0 730 262" role="group" aria-label="${e(title)}"><title>${e(title)}</title><line x1="${left}" x2="${right}" y1="${bottom}" y2="${bottom}" class="ana-gridline"/>${bars}</svg>${chartTooltip()}</div><figcaption>${e(caption || (currency ? 'Recorded fees in Philippine pesos.' : 'Counts of confirmed rentals in the selected period.'))}</figcaption></figure>`;
}

function chartTooltip() {
  return '<div class="ana-tooltip" data-ana-tooltip hidden><output data-ana-readout aria-live="polite" aria-atomic="true"></output><button type="button" data-ana-unpin aria-label="Dismiss pinned chart value" hidden>Dismiss ×</button></div>';
}

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

export function bindAnalyticsCharts(root = document) {
  root.querySelectorAll('[data-ana-chart]').forEach(chart => {
    if (chart.dataset.anaBound) return;
    chart.dataset.anaBound = 'true';
    const values = JSON.parse(chart.dataset.anaValues), output = chart.querySelector('[data-ana-readout]'), plot = chart.querySelector('[data-ana-plot]'), tooltip = chart.querySelector('[data-ana-tooltip]'), unpin = chart.querySelector('[data-ana-unpin]');
    let pinned = false, selected = Math.max(0, values.length - 1);
    const show = index => {
      selected = Math.max(0, Math.min(values.length - 1, Number(index)));
      const point = values[selected]; if (!point) return;
      tooltip.hidden = false;
      const position = 8.8 + (values.length === 1 ? .5 : selected / (values.length - 1)) * 87.9;
      tooltip.style.left = `clamp(12px, calc(${position}% - 130px), max(12px, calc(100% - 272px)))`;
      const visible = point.rows.filter(row => chart.querySelector(`[data-ana-toggle="${row.seriesIndex}"]`)?.getAttribute('aria-pressed') !== 'false');
      output.innerHTML = `<strong>${escapeHtml(point.label)}</strong>${visible.map(row => `<span>${escapeHtml(row.name)} <b>${escapeHtml(row.value)}</b><small>${escapeHtml(row.label)}${row.spread ? ` · Historical spread: ${escapeHtml(row.spread)}` : ''}</small></span>`).join('') || '<span>All series hidden. Select a legend to show it.</span>'}`;
      const crosshair = chart.querySelector('[data-ana-crosshair]');
      if (crosshair) { const x = values.length === 1 ? 385 : 64 + selected * 642 / (values.length - 1); crosshair.setAttribute('x1', x); crosshair.setAttribute('x2', x); crosshair.removeAttribute('hidden'); }
      chart.querySelectorAll('[data-ana-point]').forEach(point => point.classList.toggle('is-inspected', Number(point.dataset.anaPoint) === selected));
    };
    const hide = () => {
      tooltip.hidden = true; unpin.hidden = true; pinned = false;
      chart.querySelector('[data-ana-crosshair]')?.setAttribute('hidden', '');
      chart.querySelectorAll('.is-inspected').forEach(point => point.classList.remove('is-inspected'));
    };
    plot.addEventListener('pointerleave', () => { if (!pinned) hide(); });
    plot.addEventListener('focus', () => show(selected));
    plot.addEventListener('focusout', event => { if (!pinned && !plot.contains(event.relatedTarget)) hide(); });
    plot.addEventListener('keydown', event => {
      if (event.target !== plot) return;
      if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? values.length - 1 : selected + (event.key === 'ArrowRight' ? 1 : -1);
        show(next);
      }
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); pinned = !pinned; unpin.hidden = !pinned; show(selected); }
    });
    chart.querySelectorAll('[data-ana-point]').forEach(point => {
      point.addEventListener('pointerdown', event => { if (event.pointerType === 'mouse') event.preventDefault(); });
      point.addEventListener('pointerenter', () => { if (!pinned) show(point.dataset.anaPoint); });
      point.addEventListener('focus', () => show(point.dataset.anaPoint));
      const pin = () => { const index = Number(point.dataset.anaPoint); if (pinned && selected === index) { hide(); return; } pinned = true; unpin.hidden = false; show(index); };
      point.addEventListener('click', pin);
      point.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); pin(); }
        if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) {
          event.preventDefault(); const points = [...chart.querySelectorAll('[data-ana-point]')];
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? points.length - 1 : Math.max(0, Math.min(points.length - 1, Number(point.dataset.anaPoint) + (event.key === 'ArrowRight' ? 1 : -1)));
          points[next]?.focus();
        }
      });
    });
    unpin.onclick = () => { plot.focus(); hide(); };
    chart.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); hide(); } });
    chart.querySelectorAll('[data-ana-toggle]').forEach(button => button.onclick = () => {
      const visible = button.getAttribute('aria-pressed') !== 'true'; button.setAttribute('aria-pressed', String(visible));
      chart.querySelector(`[data-ana-series="${button.dataset.anaToggle}"]`).style.display = visible ? '' : 'none'; show(selected);
    });
    const zoom = chart.querySelector('[data-ana-zoom]');
    if (zoom) zoom.onchange = () => {
      const source = JSON.parse(chart.dataset.anaSource), count = Number(zoom.value), start = count ? Math.max(0, source.labels.length - count) : 0;
      const sliced = source.series.map(row => ({ ...row, values: row.values.slice(start), labels: row.labels?.slice(start), low: row.low?.slice(start), high: row.high?.slice(start) }));
      const parent = chart.parentElement, holder = chart.ownerDocument.createElement('div');
      holder.innerHTML = lineChart(source.labels.slice(start), sliced, { ...source.options, forecastStart: source.options.forecastStart == null ? null : Math.max(0, source.options.forecastStart - start), escape: escapeHtml });
      const replacement = holder.firstElementChild;
      replacement.dataset.anaSource = chart.dataset.anaSource;
      // Keep the zoom control available even when the cropped range has <=14 points.
      replacement.querySelector('.ana-chart-tools').innerHTML = chart.querySelector('.ana-chart-tools').innerHTML;
      chart.replaceWith(replacement); bindAnalyticsCharts(parent);
      const replacementZoom = replacement.querySelector('[data-ana-zoom]');
      [...replacementZoom.options].find(option => option.value === String(count)).selected = true; replacementZoom.focus();
    };
  });
}
