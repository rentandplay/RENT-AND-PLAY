import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { lineChart, barChart, bindAnalyticsCharts } from '../src/analytics-charts.js';
import { renderAnalyticsReport } from '../src/analytics-report.js';
import { calculateDetailedAnalytics } from '../src/analytics-insights.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const options = { escape, id: 'test-trend', title: 'Rental history', currency: true };
const series = [{ name: 'Selected', color: '#ee8534', values: [10, 20, 30] }, { name: 'Previous', color: '#709aca', labels: ['Sep 1', 'Sep 2', 'Sep 3'], values: [5, 10, 15] }];
function mount(html) {
  const { document, window } = parseHTML(`<html><body><main>${html}</main></body></html>`);
  bindAnalyticsCharts(document);
  const fire = (element, type, key) => { const event = new window.Event(type, { bubbles: true, cancelable: true }); if (key) event.key = key; element.dispatchEvent(event); };
  return { document, fire, readout: () => document.querySelector('[data-ana-readout]').textContent };
}

test('chart exploration exposes real dates, pins on click, unpins, and toggles series', () => {
  const { document: doc, fire, readout } = mount(lineChart(['Oct 1', 'Oct 2', 'Oct 3'], series, options));
  const points = doc.querySelectorAll('[data-ana-point]');
  fire(points[1], 'pointerenter');
  assert.match(readout(), /Oct 2.*Selected.*₱20.*Previous.*₱10.*Sep 2/);
  fire(points[1], 'click'); fire(points[0], 'pointerenter');
  assert.match(readout(), /Oct 2/);
  fire(doc.querySelector('[data-ana-unpin]'), 'click'); fire(points[0], 'pointerenter');
  assert.match(readout(), /Oct 1/);
  const legend = doc.querySelector('[data-ana-toggle="1"]');
  fire(legend, 'click');
  assert.equal(legend.getAttribute('aria-pressed'), 'false');
  assert.equal(doc.querySelector('[data-ana-series="1"]').style.display, 'none');
  assert.doesNotMatch(readout(), /Previous/);
  fire(legend, 'click'); assert.match(readout(), /Previous/);
  bindAnalyticsCharts(doc); fire(legend, 'click');
  assert.equal(legend.getAttribute('aria-pressed'), 'false', 'rebinding must not duplicate handlers');
});

test('chart keyboard navigation replaces the slider and dismisses the floating tooltip', () => {
  const { document: doc, fire, readout } = mount(lineChart(['Oct 1', 'Oct 2', 'Oct 3'], series, options));
  assert.equal(doc.querySelector('input[type="range"]'), null);
  const plot = doc.querySelector('[data-ana-plot]'), tooltip = doc.querySelector('[data-ana-tooltip]');
  assert.equal(tooltip.hidden, true);
  fire(plot, 'focus'); fire(plot, 'keydown', 'Home');
  assert.match(readout(), /Oct 1.*₱10/);
  fire(plot, 'keydown', 'ArrowRight'); assert.match(readout(), /Oct 2.*₱20/);
  fire(plot, 'keydown', 'End'); assert.match(readout(), /Oct 3.*₱30/);
  for (const button of doc.querySelectorAll('[data-ana-toggle]')) fire(button, 'click');
  assert.match(readout(), /All series hidden/);
  fire(plot, 'keydown', 'Escape');
  assert.equal(tooltip.hidden, true);
  assert.equal(doc.querySelector('[data-ana-crosshair]').hasAttribute('hidden'), true);
});

test('unpinned tooltips disappear on pointer leave and tapping a pinned point dismisses it', () => {
  const { document: doc, fire } = mount(lineChart(['Oct 1', 'Oct 2', 'Oct 3'], series, options));
  const point = doc.querySelector('[data-ana-point="1"]'), plot = doc.querySelector('[data-ana-plot]'), tooltip = doc.querySelector('[data-ana-tooltip]');
  fire(point, 'pointerenter'); assert.equal(tooltip.hidden, false);
  fire(plot, 'pointerleave'); assert.equal(tooltip.hidden, true);
  fire(point, 'click'); fire(plot, 'pointerleave'); assert.equal(tooltip.hidden, false);
  fire(point, 'click'); assert.equal(tooltip.hidden, true);
});

test('zoom slices both series and comparison dates, then restores the full period', () => {
  const labels = Array.from({ length: 30 }, (_, index) => `Day ${index + 1}`);
  const { document: doc, fire, readout } = mount(lineChart(labels, [{ name: 'History', values: labels.map((_, i) => i), color: '#709aca' }], options));
  const select = value => {
    const zoom = doc.querySelector('[data-ana-zoom]');
    [...zoom.options].find(option => option.value === value).selected = true;
    fire(zoom, 'change');
  };
  select('7');
  assert.equal(doc.querySelectorAll('[data-ana-point]').length, 7);
  fire(doc.querySelector('[data-ana-point="0"]'), 'click');
  assert.match(readout(), /Day 24.*₱23/);
  select('14'); assert.equal(doc.querySelectorAll('[data-ana-point]').length, 14);
  select('0'); assert.equal(doc.querySelectorAll('[data-ana-point]').length, 30);
});

test('chart hit regions stay inside the plot for one, two, and many periods', () => {
  for (const length of [1, 2, 30]) {
    const labels = Array.from({ length }, (_, index) => String(index));
    const { document: doc } = mount(lineChart(labels, [{ ...series[0], values: labels.map(Number) }], options));
    for (const point of doc.querySelectorAll('[data-ana-point]')) {
      const x = Number(point.getAttribute('x')), width = Number(point.getAttribute('width'));
      assert.ok(x >= 64 && x + width <= 706.001);
    }
  }
});

test('bar inspection works for zero values, keyboard pinning and untrusted labels', () => {
  const { document: doc, fire, readout } = mount(barChart([{ label: '<img src=x onerror=alert(1)>', value: 0 }, { label: 'Tuesday', value: 2 }], { escape, title: 'Weekday demand' }));
  const points = doc.querySelectorAll('[data-ana-point]');
  fire(points[0], 'keydown', 'Enter');
  assert.match(readout(), /Rentals 0/);
  assert.equal(doc.querySelectorAll('img').length, 0);
  fire(points[1], 'pointerenter'); assert.doesNotMatch(readout(), /Tuesday/);
  fire(points[0], 'keydown', 'Escape'); fire(points[1], 'pointerenter');
  assert.match(readout(), /Tuesday.*2.*100%/);
});

const helpers = { escape, now: new Date('2026-10-13T03:00:00Z'), paged: rows => ({ rows, footer: '' }), table: (heads, rows) => `<table><tbody>${rows}</tbody></table>` };
test('overview collapses secondary detail and forecast never fabricates a preview', () => {
  const { document } = parseHTML(renderAnalyticsReport({}, { period: '30d' }, {}, helpers));
  for (const key of ['equipment', 'operations']) assert.equal(document.querySelector(`[data-analytics-detail="${key}"]`).hasAttribute('open'), false);
  assert.equal(document.querySelectorAll('[data-analytics-ranking]').length, 2);
  const forecast = renderAnalyticsReport({}, { period: '30d' }, { section: 'forecast' }, helpers);
  assert.doesNotMatch(forecast, /Model preview|weekend surge|forecast-preview/);
  assert.match(forecast, /More history needed/);
});

test('hourly analytics separates overnight rentals and low activity never prescribes a discount or purchase', () => {
  const data = { items: [{ id: 'ball', name: 'Ball', is_active: true, status: 'AVAILABLE', created_at: '2026-07-01' }], transactions: [3, 7, 11].map((hour, index) => ({ id: String(index), item_id: 'ball', status: 'COMPLETED', rental_fee: 100, confirmed_rental_at: `2026-10-10 ${String(hour).padStart(2, '0')}:00:00` })) };
  const result = calculateDetailedAnalytics(data, { period: '30d' }, helpers.now);
  assert.equal(result.hours.find(row => row.label === '12–6 AM').rentals, 1);
  assert.equal(result.hours.find(row => row.label === '6–8 AM').rentals, 1);
  assert.equal(result.hours.find(row => row.label === '10 AM–12 PM').rentals, 1);
  assert.doesNotMatch(JSON.stringify(result.recommendations), /20% weekday|Add 2–3 units/);
});
