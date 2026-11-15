// Original implementation; visual references and licenses: docs/analytics-module-review.md.
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const number = value => new Intl.NumberFormat('en-PH', { maximumFractionDigits: 2 }).format(value);
const compact = value => new Intl.NumberFormat('en-PH', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
const money = value => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value);

export function monthlyEquipmentHeatmap(matrix, metric = 'rentals') {
  if (!matrix?.columns?.length || !matrix.totalRentals) return '<div class="ana-empty"><strong>No monthly equipment activity yet</strong><p>Confirmed rental handoffs in the selected dates will appear here.</p></div>';
  metric = metric === 'fees' ? 'fees' : 'rentals';
  const fees = metric === 'fees', exact = fees ? money : number;
  const peak = Math.max(...matrix.months.flatMap(month => month.cells.map(cell => cell[metric])));
  const scale = value => value === 0 || peak === 0 ? 0 : Math.min(4, Math.ceil(value / peak * 4));
  const hint = 'Select a cell for exact values. Use arrow keys to explore the table.';
  return `<figure class="ana-equipment-matrix" data-ana-equipment-matrix data-matrix-source="${escape(JSON.stringify(matrix))}" data-matrix-metric="${metric}">
    <div class="ana-matrix-toolbar"><figcaption><strong>${fees ? 'Recorded rental fees' : 'Confirmed handoffs'}</strong><span>Monthly totals by equipment type</span></figcaption>
    <div class="ana-segment" role="group" aria-label="Monthly equipment metric">${[['rentals', 'Rentals'], ['fees', 'Rental fees']].map(([key, label]) => `<button type="button" data-matrix-metric-button="${key}" aria-pressed="${key === metric}">${label}</button>`).join('')}</div>
    <button type="button" class="ana-chart-replay" data-matrix-replay aria-label="Replay monthly equipment animation">↻ Replay</button></div>
    <div class="ana-matrix-guide"><span>${number(matrix.totalRentals)} handoffs · ${money(matrix.totalFees)} recorded fees</span><span class="ana-matrix-scale" aria-label="Shared color scale from zero to ${escape(exact(peak))}">0 <i></i> ${escape(exact(peak))}</span></div>
    <div class="ana-heat-readout" data-matrix-readout role="status" aria-live="polite">${hint}</div>
    <div class="ana-matrix-scroll" style="--matrix-width:${Math.max(360, matrix.columns.length * 136 + 212)}px" role="region" aria-label="Monthly equipment counts and fees; scroll horizontally for more equipment" tabindex="0"><table>
    <thead><tr><th scope="col">Month</th>${matrix.columns.map(column => `<th scope="col">${escape(column.name)}</th>`).join('')}<th scope="col">Total</th></tr></thead>
    <tbody>${matrix.months.map((month, row) => `<tr><th scope="row">${escape(month.label)}${month.partial ? '<span class="ana-matrix-partial">Partial</span>' : ''}</th>${month.cells.map((cell, col) => {
      const description = `${month.label} · ${matrix.columns[col].name}: ${number(cell.rentals)} confirmed handoffs; ${money(cell.fees)} recorded rental fees. Dates ${month.from} to ${month.to}.`;
      return `<td><button type="button" class="ana-matrix-cell ana-matrix-level-${scale(cell[metric])}" data-matrix-cell data-row="${row}" data-col="${col}" tabindex="${row === 0 && col === 0 ? 0 : -1}" aria-pressed="false" aria-label="${escape(description)}" style="--matrix-delay:${Math.min(360, (row + col) * 24)}ms">${fees ? '₱' : ''}${compact(cell[metric])}</button></td>`;
    }).join('')}<td class="ana-matrix-total" title="${escape(exact(month.cells.reduce((sum, cell) => sum + (fees ? Math.round(cell.fees * 100) : cell.rentals), 0) / (fees ? 100 : 1)))}">${fees ? '₱' : ''}${compact(month.cells.reduce((sum, cell) => sum + (fees ? Math.round(cell.fees * 100) : cell.rentals), 0) / (fees ? 100 : 1))}</td></tr>`).join('')}</tbody>
    <tfoot><tr><th scope="row">Total</th>${matrix.columns.map(column => `<td title="${escape(exact(column[metric]))}">${fees ? '₱' : ''}${compact(column[metric])}</td>`).join('')}<td title="${escape(exact(fees ? matrix.totalFees : matrix.totalRentals))}">${fees ? '₱' : ''}${compact(fees ? matrix.totalFees : matrix.totalRentals)}</td></tr></tfoot></table></div>
    <p class="ana-note">Scroll across to see all equipment on smaller screens. One color scale across all cells: darker means more recorded activity. Equipment is ranked by total handoffs; more than six types are grouped into the top five and Other. Partial months cover only the selected dates; today's records are incomplete. Totals are not daily averages. Select a cell for exact recorded values.</p></figure>`;
}

export function bindMonthlyEquipmentHeatmaps(root) {
  root.querySelectorAll('[data-ana-equipment-matrix]').forEach(map => {
    if (map.dataset.matrixBound) return;
    map.dataset.matrixBound = 'true';
    const view = map.ownerDocument.defaultView;
    const reduced = () => view?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const replay = map.querySelector('[data-matrix-replay]');
    const play = () => {
      if (reduced()) return;
      map.classList.remove('ana-matrix-enter');
      map.getBoundingClientRect();
      map.classList.add('ana-matrix-enter');
    };
    replay.disabled = Boolean(reduced());
    replay.onclick = play;
    if (!reduced() && view?.IntersectionObserver) {
      const observer = new view.IntersectionObserver(entries => {
        if (!map.isConnected || entries.some(entry => entry.isIntersecting)) {
          observer.disconnect();
          if (map.isConnected) play();
        }
      }, { threshold: .1 });
      observer.observe(map);
    } else play();
    map.querySelectorAll('[data-matrix-metric-button]').forEach(button => {
      button.onclick = () => {
        const metric = button.dataset.matrixMetricButton;
        if (metric === map.dataset.matrixMetric) return;
        const parent = map.parentElement;
        const template = map.ownerDocument.createElement('template');
        template.innerHTML = monthlyEquipmentHeatmap(JSON.parse(map.dataset.matrixSource), metric);
        const replacement = template.content.firstElementChild;
        map.replaceWith(replacement);
        bindMonthlyEquipmentHeatmaps(parent);
        replacement.querySelector(`[data-matrix-metric-button="${metric}"]`).focus();
      };
    });
    const cells = [...map.querySelectorAll('[data-matrix-cell]')];
    const select = cell => {
      cells.forEach(other => { other.setAttribute('aria-pressed', String(other === cell)); other.tabIndex = other === cell ? 0 : -1; });
      map.querySelector('[data-matrix-readout]').textContent = cell.getAttribute('aria-label');
    };
    cells.forEach(cell => {
      cell.addEventListener('pointerenter', () => { map.querySelector('[data-matrix-readout]').textContent = cell.getAttribute('aria-label'); });
      cell.addEventListener('focus', () => select(cell));
      cell.addEventListener('click', () => select(cell));
      cell.addEventListener('keydown', event => {
        let row = Number(cell.dataset.row), col = Number(cell.dataset.col);
        const columns = map.querySelectorAll('thead th').length - 2;
        if (event.key === 'ArrowRight') col++;
        else if (event.key === 'ArrowLeft') col--;
        else if (event.key === 'ArrowDown') row++;
        else if (event.key === 'ArrowUp') row--;
        else if (event.key === 'Home') col = 0;
        else if (event.key === 'End') col = columns - 1;
        else return;
        event.preventDefault();
        map.querySelector(`[data-matrix-cell][data-row="${row}"][data-col="${col}"]`)?.focus();
      });
    });
  });
}
