import React from './react-shim.js';
import { Icon, money } from './icons.jsx';
import { calculateDashboardPulse } from '../dashboard-analytics.js';

const dateLabel = key => new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${key}T00:00:00Z`));

export function AnalyticsPulse({ data, onNavigate }) {
  const p = calculateDashboardPulse(data, new Date(data.refreshedAt || Date.now()));
  const overdue = Number(data.stats?.overdue || 0);
  const pending = data.pending?.length || 0;
  const reviewPage = overdue ? 'Rentals' : pending ? 'ESP32 terminal' : p.utilization >= 60 ? 'Returns' : 'Reports';
  const action = overdue ? `Follow up on ${overdue} overdue return${overdue === 1 ? '' : 's'}.`
    : pending ? `Review ${pending} pending terminal handover${pending === 1 ? '' : 's'}.`
      : p.utilization >= 60 ? 'Review incoming returns before the next handover.' : 'No overdue rentals or pending terminal handovers.';
  const peak = Math.max(1, ...p.recent.map(row => row.fees), p.forecast || 0);
  const top = Math.ceil(peak / (10 ** Math.floor(Math.log10(peak)))) * (10 ** Math.floor(Math.log10(peak)));
  const x = index => 55 + index * 455 / Math.max(7, p.recent.length);
  const y = value => 155 - value / top * 125;
  const points = p.recent.map((row, index) => `${x(index)},${y(row.fees)}`).join(' ');
  const last = p.recent.at(-1);
  const share = value => p.channelTotal ? value / p.channelTotal * 100 : 0;
  return <section className="panel analytics-pulse-panel" aria-label="Operations and fleet analytics">
    <div className="panel-title">
      <div><h3><Icon name="chart" /> Analytics pulse</h3><p>Recent rental activity and your next operational step</p></div>
      <button type="button" className="text-button" onClick={() => onNavigate('Reports')}>Full analytics <Icon name="arrow" /></button>
    </div>
    {data.demo_data?.active ? <aside className="pulse-demo-note"><strong>Presentation demo data</strong><span>{data.demo_data.status === 'ready' ? `${data.demo_data.record_count} simulated historical rentals included. Forecast accuracy here describes demo data.` : 'Demo history is being prepared.'}</span></aside> : null}
    <div className="pulse-overview">
      <div className="pulse-outlook">
        <div className="pulse-outlook-heading"><div><span className="pulse-caption">Next-day rental fees</span><strong>{p.forecast == null ? '—' : money(p.forecast)}</strong></div><span className="pulse-model-badge">Next-day outlook</span></div>
        <p className="pulse-estimate-note">{p.forecast == null ? 'Building a usable history' : `${dateLabel(p.forecastDate)} · estimated`}</p>
        {p.recent.length ? <figure className="pulse-history-chart">
          <svg viewBox="0 0 560 200" role="img" aria-labelledby="pulse-history-title">
            <title id="pulse-history-title">Recorded daily rental fees for the last {p.recent.length} complete days{p.forecast == null ? '' : ` and next-day estimate ${money(p.forecast)}`}. Today is excluded.</title>
            {[0, .5, 1].map(fraction => <g key={fraction}><line x1="55" x2="525" y1={y(top * fraction)} y2={y(top * fraction)} className="pulse-grid-line" /><text x="45" y={y(top * fraction) + 4} textAnchor="end">{new Intl.NumberFormat('en-PH', { notation: 'compact', maximumFractionDigits: 1 }).format(top * fraction)}</text></g>)}
            <polygon points={`${x(0)},155 ${points} ${x(p.recent.length - 1)},155`} className="pulse-history-area" />
            <polyline points={points} className="pulse-history-line" />
            {p.recent.map((row, index) => <circle key={row.date} cx={x(index)} cy={y(row.fees)} r="3" className="pulse-history-point" tabIndex="0"><title>{dateLabel(row.date)}: {money(row.fees)} · {row.rentals} confirmed rentals</title></circle>)}
            {p.forecast != null && last ? <g><line x1={x(p.recent.length - 1)} y1={y(last.fees)} x2="510" y2={y(p.forecast)} className="pulse-estimate-line" /><circle cx="510" cy={y(p.forecast)} r="4" className="pulse-estimate-point" tabIndex="0"><title>{dateLabel(p.forecastDate)} estimate: {money(p.forecast)}</title></circle><text x="525" y="180" textAnchor="end">{dateLabel(p.forecastDate)} est.</text></g> : null}
            <text x="55" y="180">{dateLabel(p.recent[0].date)}</text><text className="pulse-last-complete-label" x={x(p.recent.length - 1)} y="180" textAnchor="end">{dateLabel(last.date)}</text>
          </svg>
          <figcaption><span><i /> Recorded fees</span>{p.forecast != null ? <span><i className="is-estimate" /> Next-day estimate</span> : null}</figcaption>
        </figure> : <div className="pulse-no-history"><Icon name="chart" /><strong>No completed activity history yet</strong><span>Recorded rental fees will appear here.</span></div>}
        <p className="pulse-history-footnote">{p.forecast == null ? p.reason : `Based on ${p.trainingDays} complete days (${p.rentalSamples} rentals)`}</p>
      </div>
      <div className="pulse-operations">
        <div className="pulse-live-heading"><span className="pulse-caption">Live operations</span><span>Current snapshot</span></div>
        <div className="pulse-live-grid">
          <div className="pulse-fleet-card"><h4>Fleet in use</h4><div className="pulse-fleet-body"><div className="pulse-fleet-donut"><svg viewBox="0 0 88 88" aria-hidden="true"><circle cx="44" cy="44" r="35" /><circle cx="44" cy="44" r="35" className="pulse-fleet-arc" strokeDasharray={`${p.utilization * 2.1991} 219.91`} transform="rotate(-90 44 44)" /></svg><strong>{Math.round(p.utilization)}%</strong></div><p><strong>{p.rented}<small> / {p.totalUnits}</small></strong><span>units rented now</span></p></div><small>Active equipment across your collection.</small></div>
          <div className="pulse-channels-card"><h4>Active rental channels</h4><strong className="pulse-channel-total">{p.channelTotal}<small> {p.channelTotal === 1 ? 'rental' : 'rentals'} in progress</small></strong><div className="pulse-channel-bar" role="img" aria-label={`${p.resort} resort delivery, ${p.counter} shop counter, ${p.unknown} unspecified`}><span className="pulse-channel-resort" style={{ width: `${share(p.resort)}%` }} /><span className="pulse-channel-counter" style={{ width: `${share(p.counter)}%` }} /><span className="pulse-channel-unknown" style={{ width: `${share(p.unknown)}%` }} /></div><dl><div><dt><i className="pulse-dot resort" />Resort delivery</dt><dd>{p.resort}</dd></div><div><dt><i className="pulse-dot counter" />Shop counter</dt><dd>{p.counter}</dd></div>{p.unknown > 0 ? <div><dt>Unspecified</dt><dd>{p.unknown}</dd></div> : null}</dl></div>
        </div>
        <div className={`pulse-action-strip ${overdue ? 'has-alert' : ''}`}><div className="pulse-action-icon"><Icon name={overdue ? 'clock' : 'arrow'} /></div><div><span className="pulse-caption">{overdue || pending ? 'Needs attention' : p.utilization >= 60 ? 'Capacity review' : 'Current status'}</span><strong>{action}</strong></div><button type="button" className="secondary" onClick={() => onNavigate(reviewPage, false, overdue ? 'Overdue' : 'All rentals')}>{overdue || pending ? 'Review' : 'Explore'} <Icon name="arrow" /></button></div>
      </div>
    </div>
  </section>;
}
