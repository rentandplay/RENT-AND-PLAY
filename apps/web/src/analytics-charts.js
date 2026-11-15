import { activateChartMotion, settleChartMotion, rememberChartMotion, animateAnalyticsKPIs } from './analytics-chart-motion.js';
import { bindMonthlyEquipmentHeatmaps } from './analytics-equipment-matrix.js';
const finite = value => typeof value === 'number' && Number.isFinite(value);
const compact = value => new Intl.NumberFormat('en-PH', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
const plain = value => new Intl.NumberFormat('en-PH', { maximumFractionDigits: 2 }).format(value);

export function categoryDonut(rows=[], {escape:e=escapeHtml, currency=false, id='category-share'}={}) {
  const clean=rows.filter(row=>finite(row.value)&&row.value>0).sort((a,b)=>b.value-a.value);
  const total=clean.reduce((n,row)=>n+row.value,0);
  if(!total) return '<div class="ana-empty"><strong>No category contribution yet</strong><p>No positive recorded values exist in this view.</p></div>';
  const shown=clean.length>6?[...clean.slice(0,5),{label:'Other categories',value:clean.slice(5).reduce((n,row)=>n+row.value,0)}]:clean;
  const colors=['#3b82f6','#f97316','#0d9488','#8b5cf6','#ec4899','#64748b'];
  const defaultTotal = `${currency?'&#8369;':''}${compact(total)}`;
  const defaultLabel = currency?'Recorded fees':'Rentals';
  let offset=0;
  const marks=shown.map((row,i)=>{const share=row.value/total*100,start=offset;offset+=share;const sliceTotal=`${currency?'₱':''}${compact(row.value)}`,sliceExact=`${currency?'₱':''}${plain(row.value)}`,sliceShare=`${plain(share)}%`;return `<circle class="ana-donut-segment" data-ana-slice="${i}" data-slice-label="${e(row.label)}" data-slice-total="${e(sliceTotal)}" data-slice-exact="${e(sliceExact)}" data-slice-share="${e(sliceShare)}" style="--ana-seg-delay:${i*70}ms" cx="100" cy="100" r="68" fill="none" stroke="${colors[i]}" stroke-width="24" pathLength="100" stroke-dasharray="${share} ${100-share}" stroke-dashoffset="${-start}" transform="rotate(-90 100 100)" tabindex="0" role="button" aria-pressed="false" aria-label="${e(row.label)}: ${e(sliceExact)} (${e(sliceShare)})"><title>${e(row.label)}: ${e(sliceExact)} (${e(sliceShare)})</title></circle>`;}).join('');
  return `<figure class="ana-donut-chart" data-ana-donut data-ana-default-total="${defaultTotal}" data-ana-default-label="${defaultLabel}" aria-labelledby="${id}-title"><svg viewBox="0 0 200 200" role="img" aria-labelledby="${id}-title ${id}-description"><title id="${id}-title">Category share of ${currency?'recorded rental fees':'confirmed rentals'}</title><desc id="${id}-description">${shown.map(row=>e(row.label)+': '+plain(row.value/total*100)+'%').join('; ')}. Hover or select a slice to inspect exact category share.</desc>${marks}<text x="100" y="92" text-anchor="middle" class="ana-donut-total" data-ana-donut-total>${defaultTotal}</text><text x="100" y="111" text-anchor="middle" class="ana-donut-label" data-ana-donut-label>${defaultLabel}</text><text x="100" y="128" text-anchor="middle" class="ana-donut-sub" data-ana-donut-sub></text></svg><figcaption>${shown.map((row,i)=>{const share=`${plain(row.value/total*100)}%`,exactVal=`${currency?'₱':''}${plain(row.value)}`;return `<button type="button" class="ana-donut-key" data-ana-slice="${i}" data-slice-label="${e(row.label)}" data-slice-total="${currency?'₱':''}${compact(row.value)}" data-slice-exact="${e(exactVal)}" data-slice-share="${e(share)}" aria-pressed="false" style="--ana-item-delay:${i*55}ms"><i style="background:${colors[i]}"></i><span>${e(row.label)}<small class="ana-donut-val">${e(exactVal)}</small></span><strong>${e(share)}</strong></button>`;}).join('')}</figcaption></figure>`;
}

export function demandHeatmap(days=[], bands=[], matrix=[], {escape:e=escapeHtml}={}) {
  const peak=Math.max(1,...matrix.flat());
  let peakCell = null;
  matrix.forEach((col, d) => (col || []).forEach((n, h) => {
    if (!peakCell || n > peakCell.n) peakCell = { day: days[d], band: bands[h], n };
  }));
  const defaultHint = peakCell && peakCell.n > 0
    ? `Peak window: ${peakCell.day} ${peakCell.band} (${peakCell.n} handoffs) · hover or focus a cell for exact counts`
    : 'Hover or focus a cell to inspect exact handoff counts';
  const scaleLegend = `<div class="ana-heat-scale" aria-label="Activity intensity scale"><span>Low (0)</span><i class="ana-heat-0" aria-hidden="true"></i><i class="ana-heat-1" aria-hidden="true"></i><i class="ana-heat-2" aria-hidden="true"></i><i class="ana-heat-3" aria-hidden="true"></i><i class="ana-heat-4" aria-hidden="true"></i><span>Peak (${peak})</span></div>`;
  return `<figure class="ana-heatmap" data-ana-heatmap data-ana-heat-peak="${peak}" data-ana-heat-default="${e(defaultHint)}"><div class="ana-heat-top"><figcaption>Confirmed handoffs by weekday and time band</figcaption>${scaleLegend}</div><div class="ana-heat-readout" data-ana-heat-readout role="status" aria-live="polite">${e(defaultHint)}</div><div class="ana-heatmap-scroll"><table><thead><tr><th scope="col">PH time</th>${days.map(day=>`<th scope="col">${e(day)}</th>`).join('')}</tr></thead><tbody>${bands.map((band,h)=>`<tr><th scope="row">${e(band)}</th>${days.map((day,d)=>{const n=matrix[d]?.[h]||0,level=n?Math.min(4,1+Math.floor(n/peak*3)):0;return `<td class="ana-heat-${level}" data-ana-heat-cell data-day="${e(day)}" data-band="${e(band)}" data-count="${n}" tabindex="0" style="--ana-cell-delay:${(h*7+d)*16}ms" aria-label="${e(day+' '+band)}: ${n} confirmed handoffs"><span>${n}</span></td>`;}).join('')}</tr>`).join('')}</tbody></table></div><p class="ana-note">Darker cells highlight busier handoff windows. Counts are totals; time bands span different lengths.</p></figure>`;
}

export function sparklineSvg(values = [], color = '#3b82f6') {
  const clean = (Array.isArray(values) ? values : []).map(v => (finite(v) ? Math.max(0, v) : 0));
  if (clean.length < 2) return '';
  const max = Math.max(1, ...clean), min = Math.min(...clean), span = Math.max(1, max - min);
  const w = 108, h = 28, pad = 3;
  const pts = clean.map((v, i) => {
    const px = pad + (i / (clean.length - 1)) * (w - pad * 2);
    const py = h - pad - ((v - min) / span) * (h - pad * 2);
    return `${px.toFixed(1)},${py.toFixed(1)}`;
  });
  const area = `${pad},${h - pad} ${pts.join(' ')} ${w - pad},${h - pad}`;
  const last = pts.at(-1).split(',');
  return `<svg class="ana-sparkline" viewBox="0 0 ${w} ${h}" aria-hidden="true" focusable="false"><polygon class="ana-sparkline-area" points="${area}" fill="${color}" opacity=".14"/><polyline class="ana-sparkline-line" points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle class="ana-sparkline-dot" cx="${last[0]}" cy="${last[1]}" r="2.6" fill="${color}"/></svg>`;
}

const roundCoordinate = value => Number(value.toFixed(2));
function layout(width = 730, height = 272) {
  return { width,height,left:width < 500 ? 42 : 64,right:width-24,top:38,bottom:height-42 };
}

// Bounded cubic interpolation: every observation remains an anchor; flat runs stay flat.
function curve(points) {
  if (!points.length) return '';
  let d = `M${points[0][0]},${points[0][1]}`;
  if (points.length === 1) return d;
  const slopes = points.slice(1).map((p,i) => (p[1]-points[i][1])/(p[0]-points[i][0] || 1));
  const tangents = points.map((_,i) => i === 0 ? slopes[0] : i === points.length-1 ? slopes.at(-1) : slopes[i-1]*slopes[i] <= 0 ? 0 : 2/(1/slopes[i-1]+1/slopes[i]));
  slopes.forEach((s,i) => {
    if (!s) { tangents[i]=0;tangents[i+1]=0; return; }
    const norm = Math.hypot(tangents[i]/s,tangents[i+1]/s);
    if (norm > 3) { tangents[i] *= 3/norm;tangents[i+1] *= 3/norm; }
  });
  for(let i=1;i<points.length;i++) {
    const a=points[i-1],b=points[i],dx=(b[0]-a[0])/3;
    d+=` C${roundCoordinate(a[0]+dx)},${roundCoordinate(a[1]+tangents[i-1]*dx)} ${roundCoordinate(b[0]-dx)},${roundCoordinate(b[1]-tangents[i]*dx)} ${b[0]},${b[1]}`;
  }
  return d;
}

function axisScale(peak, integers = false) {
  const raw = Math.max(1,peak)/4, magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(integers ? 1 : 0, [1,2,2.5,5,10].find(n => n*magnitude >= raw)*magnitude);
  const maximum = Math.ceil(Math.max(1,peak)/step)*step;
  return {maximum,ticks:Array.from({length:Math.round(maximum/step)+1},(_,i)=>Number((i*step).toPrecision(10)))};
}

const replayButton = '<button type="button" class="ana-chart-replay" data-ana-replay aria-label="Replay chart animation"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 6a6 6 0 1 1-1 6M4 2v5h5"/></svg>Replay</button>';
const chartTools = zoom => `<div class="ana-chart-tools"><span class="ana-chart-hint"><i aria-hidden="true"></i>Hover or tap to explore</span><div class="ana-chart-tool-actions">${replayButton}${zoom ? '<label><span class="sr-only">View</span><select data-ana-zoom aria-label="Chart zoom"><option value="0">Full period</option><option value="14">Last 14 periods</option><option value="7">Last 7 periods</option></select></label>' : ''}</div></div>`;

export function lineChart(labels, series, { escape: e, id='analytics-line', title, currency = false, forecastStart = null, integerTicks = false, width=730, height=272, domainMax=null, handoff=null, reserveRangeNote=false, threshold=null, straight=false } = {}) {
  if (!labels.length) return '<div class="ana-empty"><strong>No activity to chart yet</strong><p>Recorded activity will appear here when the selected period has data.</p></div>';
  const g=layout(width,height), {left,right,top,bottom}=g, span=right-left;
  const values=series.flatMap(row=>[...row.values,...(row.high||[])]).filter(finite);
  const scale=axisScale(Math.max(1,...values,domainMax||0),integerTicks);
  const x = i => roundCoordinate(labels.length===1 ? (left+right)/2 : left+i*span/(labels.length-1));
  const y = value => roundCoordinate(bottom-Math.max(0,value)/scale.maximum*(bottom-top));
  const grid=scale.ticks.map(value=>`<g><line x1="${left}" x2="${right}" y1="${y(value)}" y2="${y(value)}" class="ana-gridline"/><text x="${left-12}" y="${y(value)+4}" text-anchor="end" class="ana-axis-label">${currency?'₱':''}${compact(value)}</text></g>`).join('') + `<text x="${left-12}" y="${top-12}" text-anchor="end" class="ana-axis-unit">${currency?'PHP':'Rentals'}</text>`;
  const tickCount=Math.min(labels.length,Math.max(2,Math.min(6,Math.floor(span/75))));
  const ticks=[...new Set(Array.from({length:tickCount},(_,i)=>Math.round(i*(labels.length-1)/Math.max(1,tickCount-1))))];
  const tickLabels=ticks.map(i=>`<text x="${x(i)}" y="${height-14}" text-anchor="${i===0?'start':i===labels.length-1?'end':'middle'}" class="ana-axis-label">${e(labels[i])}</text>`).join('');
  const defs=`<defs>${series.map((row,i)=>`<linearGradient id="${id}-fill-${i}" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="${row.color}" stop-opacity=".24"/><stop offset="100%" stop-color="${row.color}" stop-opacity=".015"/></linearGradient>`).join('')}<linearGradient id="${id}-future" x1="0" x2="1"><stop stop-color="#f97316" stop-opacity=".075"/><stop offset="1" stop-color="#0d9488" stop-opacity=".035"/></linearGradient></defs>`;
  const plots=series.map((row,seriesIndex)=>{
    const runs=[];let run=[];
    row.values.forEach((value,i)=>{if(finite(value))run.push({value,index:i});else if(run.length){runs.push(run);run=[];}});if(run.length)runs.push(run);
    const strokeWidth = row.dimmed ? '1.9' : row.focused ? '3.3' : '2.7';
    const ink=runs.map((points,runIndex)=>{
      const coordinates=points.map(p=>[x(p.index),y(p.value)]),d=straight?coordinates.map((p,i)=>`${i?'L':'M'}${p[0]},${p[1]}`).join(' '):curve(coordinates),key=`${seriesIndex}-${runIndex}`;
      const band=row.low&&row.high ? `<path class="ana-variation-band" d="${curve(points.map(p=>[x(p.index),y(finite(row.high[p.index])?row.high[p.index]:p.value)]))} ${[...points].reverse().map(p=>`L${x(p.index)},${y(finite(row.low[p.index])?row.low[p.index]:p.value)}`).join(' ')} Z" fill="${row.color}"/>` : '';
      const area=row.area ? `<path data-ana-area="${key}" class="ana-area-fill" d="${d} L${coordinates.at(-1)[0]},${bottom} L${coordinates[0][0]},${bottom} Z" fill="url(#${id}-fill-${seriesIndex})"/>` : '';
      return `${band}${area}<path data-ana-stroke="${key}" data-ana-bottom="${bottom}" class="ana-line-stroke ${row.dashed?'is-estimate':''}" d="${d}" fill="none" stroke="${row.color}" stroke-width="${strokeWidth}" ${row.dashed?'stroke-dasharray="5 5"':''} stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`;
    }).join('');
    const lastIndex=row.values.findLastIndex(finite);
    const dots=row.values.map((value,i)=>finite(value)&&(value!==0||labels.length===1)?`<circle cx="${x(i)}" cy="${y(value)}" r="${i===lastIndex?4:2.6}" fill="${row.color}" class="ana-chart-point ${i===lastIndex?'is-last':''}" aria-label="${e(row.name+', '+(row.labels?.[i]||labels[i])+': '+(currency?'PHP ':'')+plain(value))}"><title>${e(row.name)} · ${e(row.labels?.[i]||labels[i])}: ${currency?'₱':''}${plain(value)}</title></circle>`:'').join('');
    return `<g data-ana-series="${seriesIndex}" class="ana-series-ink${row.dimmed ? ' is-dimmed' : ''}${row.focused ? ' is-focused' : ''}" style="--ana-series-delay:${seriesIndex*110}ms${row.dimmed ? ';opacity:.24' : ''}">${ink}${dots}</g>`;
  }).join('');
  const hasForecast=forecastStart!==null&&forecastStart>0&&forecastStart<labels.length;
  const dividerX=hasForecast?x(forecastStart)-span/Math.max(1,labels.length-1)/2:null;
  const divider=hasForecast?`<rect class="ana-forecast-wash" x="${dividerX}" y="${top-10}" width="${right-dividerX}" height="${bottom-top+10}" rx="8" fill="url(#${id}-future)"/><line x1="${dividerX}" x2="${dividerX}" y1="${top}" y2="${bottom}" class="ana-forecast-divider"/><text x="${left}" y="17" class="ana-region-label">RECORDED HISTORY</text><text x="${Math.min(right-85,dividerX+12)}" y="17" class="ana-region-label is-forecast">FORECAST</text>`:'';
  const handoffValid=handoff&&handoff.from>=0&&handoff.to<labels.length&&finite(series[0]?.values[handoff.from])&&finite(series[1]?.values[handoff.to]);
  const handoffPath=handoffValid?`<path data-ana-stroke="handoff" data-ana-bottom="${bottom}" class="ana-handoff-line" d="M${x(handoff.from)},${y(series[0].values[handoff.from])} L${x(handoff.to)},${y(series[1].values[handoff.to])}" fill="none" stroke="${series[1].color}" stroke-dasharray="3 5" vector-effect="non-scaling-stroke"><title>Visual connection to the first forecast; the incomplete period has no recorded value.</title></path>`:'';
  const handoffLabel=handoffValid&&handoff.excludedIndex!=null?`<text x="${x(handoff.excludedIndex)}" y="${bottom-8}" text-anchor="middle" class="ana-excluded-label">${e(handoff.label||'Incomplete')}</text>`:'';
  const inspection=labels.map((label,i)=>({label,x:x(i),rows:series.flatMap((row,seriesIndex)=>finite(row.values[i])?[{seriesIndex,name:row.name,color:row.color,x:x(i),y:y(row.values[i]),label:row.labels?.[i]||label,value:`${currency?'₱':''}${plain(row.values[i])}`,spread:finite(row.low?.[i])&&finite(row.high?.[i])?`${currency?'₱':''}${plain(row.low[i])} – ${currency?'₱':''}${plain(row.high[i])}`:null}]:[])}));
  const hits=labels.map((_,i)=>{const start=i===0?left:(x(i-1)+x(i))/2,end=i===labels.length-1?right:(x(i)+x(i+1))/2;return `<rect focusable="false" aria-hidden="true" data-ana-point="${i}" x="${start}" y="${top}" width="${end-start}" height="${bottom-top}" fill="transparent"/>`;}).join('');
  const thresholdSvg=threshold&&finite(threshold.value)&&threshold.value>0?`<g class="ana-threshold-group"><line x1="${left}" x2="${right}" y1="${y(threshold.value)}" y2="${y(threshold.value)}" class="ana-threshold-line"/><text x="${right-4}" y="${Math.max(top+12,y(threshold.value)-5)}" text-anchor="end" class="ana-threshold-label">${e(threshold.label||'Threshold')}: ${currency?'₱':''}${compact(threshold.value)}</text></g>`:'';
  const payload={type:'line',labels,series,options:{id,title,currency,forecastStart,integerTicks,width,height,domainMax,handoff,reserveRangeNote,threshold,straight}};
  return `<figure class="ana-chart ana-interactive ana-modern-chart" data-ana-chart data-ana-values="${e(JSON.stringify(inspection))}" data-ana-source="${e(JSON.stringify(payload))}" data-ana-view="${e(JSON.stringify(payload))}" aria-labelledby="${id}-title">${chartTools(labels.length>14)}<div class="ana-plot" data-ana-plot tabindex="0" role="group" aria-label="${e(title)}. Use Left and Right arrows to explore, Enter to pin, Escape to dismiss."><svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${id}-title ${id}-description"><title id="${id}-title">${e(title)}</title><desc id="${id}-description">${e(series.map(row=>row.name).join(' and '))}. Focus the chart and use arrow keys to inspect exact values.</desc>${defs}${divider}${grid}${thresholdSvg}${handoffPath}${plots}${handoffLabel}${tickLabels}<line data-ana-crosshair x1="${left}" x2="${left}" y1="${top}" y2="${bottom}" class="ana-crosshair" hidden/>${series.map((row,i)=>`<circle data-ana-cursor-dot="${i}" r="5" fill="${row.color}" class="ana-cursor-dot" hidden/>`).join('')}${hits}</svg>${chartTooltip()}</div><figcaption class="ana-chart-legend">${series.map((row,i)=>`<button type="button" data-ana-toggle="${i}" aria-pressed="true" aria-label="Show ${e(row.name)}"><i style="--ana-series-color:${row.color};background:${row.color}" class="${row.dashed?'is-dashed':''}"></i>${e(row.name)}</button>`).join('')}${series.some(row=>row.low)?'<span class="ana-range-key">Shaded: historical variation (±1 standard deviation), not a confidence interval</span>':reserveRangeNote?'<span class="ana-range-key">No calibrated uncertainty interval is estimated for this model.</span>':''}</figcaption></figure>`;
}

export function barChart(rows, { escape:e,title,currency=false,color='#3b82f6',highlightPeak=false,caption,id='performance-demand',width=730,height=262,threshold=null }={}) {
  const {left,right,top,bottom}=layout(width,height),column=(right-left)/Math.max(1,rows.length);
  const peak=Math.max(1,...rows.map(row=>finite(row.value)?row.value:0));
  const y=value=>roundCoordinate(bottom-value/peak*(bottom-top));
  const compactLabels=width<500&&rows.some(row=>row.label.length>4);
  const bars=rows.map((row,i)=>{
    const amount=finite(row.value)?Math.max(0,row.value):0,barHeight=amount/peak*(bottom-top),center=left+column*(i+.5),fill=row.color||(highlightPeak&&amount===peak&&amount>0?'#f97316':color);
    const label=compactLabels?row.label.replaceAll(' AM','a').replaceAll(' PM','p'):row.label;
    const labelY=height-(compactLabels?25:14);
    return `<g data-ana-point="${i}" tabindex="0" role="button" class="ana-bar-column" style="--ana-bar-delay:${i*45}ms" aria-label="Inspect ${e(row.label)}: ${currency?'PHP ':''}${plain(amount)}"><rect x="${left+column*i}" y="${top}" width="${column}" height="${bottom-top}" fill="transparent"/><rect data-ana-bar="${i}" class="ana-animated-bar" x="${center-Math.min(24,column*.27)}" y="${bottom-barHeight}" width="${Math.min(48,column*.54)}" height="${barHeight}" rx="6" fill="url(#${id}-bar-${i})"><title>${e(row.label)}: ${currency?'₱':''}${plain(amount)}</title></rect><text x="${center}" y="${Math.max(20,bottom-barHeight-10)}" text-anchor="middle" class="ana-bar-value">${currency?'₱':''}${compact(amount)}</text><text x="${center}" y="${labelY}" text-anchor="${compactLabels?'end':'middle'}" ${compactLabels?`transform="rotate(-35 ${center} ${labelY})"`:''} class="ana-axis-label">${e(label.length>18?label.slice(0,16)+'…':label)}</text><defs><linearGradient id="${id}-bar-${i}" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${fill}" stop-opacity="${amount===peak?'1':'.9'}"/><stop offset="1" stop-color="${fill}" stop-opacity=".5"/></linearGradient></defs></g>`;
  }).join('');
  const total=rows.reduce((value,row)=>value+(finite(row.value)?Math.max(0,row.value):0),0);
  const inspection=rows.map((row,i)=>({label:row.label,x:left+column*(i+.5),rows:[{name:currency?'Recorded fees':'Rentals',color:row.color||(highlightPeak&&finite(row.value)&&row.value===peak&&row.value>0?'#f97316':color),value:`${currency?'₱':''}${plain(finite(row.value)?Math.max(0,row.value):0)}`,label:total?`${plain(Math.max(0,row.value||0)/total*100)}% of chart total`:'No activity'}]}));
  const thresholdSvg=threshold&&finite(threshold.value)&&threshold.value>0?`<g class="ana-threshold-group"><line x1="${left}" x2="${right}" y1="${y(threshold.value)}" y2="${y(threshold.value)}" class="ana-threshold-line"/><text x="${right-4}" y="${Math.max(top+12,y(threshold.value)-5)}" text-anchor="end" class="ana-threshold-label">${e(threshold.label||'Threshold')}: ${currency?'₱':''}${compact(threshold.value)}</text></g>`:'';
  const payload={type:'bar',rows,options:{id,title,currency,color,highlightPeak,caption,width,height,threshold}};
  return `<figure class="ana-chart ana-interactive ana-modern-chart ana-modern-bars" data-ana-chart data-ana-values="${e(JSON.stringify(inspection))}" data-ana-source="${e(JSON.stringify(payload))}" data-ana-view="${e(JSON.stringify(payload))}">${chartTools(false)}<div class="ana-plot" data-ana-plot><svg viewBox="0 0 ${width} ${height}" role="group" aria-label="${e(title)}"><title>${e(title)}</title>${[0,.5,1].map(fraction=>`<line x1="${left}" x2="${right}" y1="${y(peak*fraction)}" y2="${y(peak*fraction)}" class="ana-gridline"/>`).join('')}${thresholdSvg}${bars}</svg>${chartTooltip()}</div><figcaption>${e(caption||(currency?'Recorded fees in Philippine pesos.':'Counts of confirmed rentals in the selected period.'))}</figcaption></figure>`;
}


// Actual and target share one zero-based scale. Missing goals remain missing.
export function combinationChart(labels = [], actualValues = [], targetValues = [], { escape:e=escapeHtml, id='performance-combination', title='Actual versus target', currency=false, previousValues=null, actualLabel='Actual', targetLabel='Target', previousLabel='Previous period', integerTicks=false, width=730, height=272, caption='' }={}) {
  if (!labels.length) return '<div class="ana-empty"><strong>No periods to chart</strong><p>Select a reporting period with recorded history.</p></div>';
  const {left,right,top,bottom}=layout(width,height), column=(right-left)/labels.length;
  const clean=values=>labels.map((_,i)=>finite(values?.[i])?Math.max(0,values[i]):null);
  const actual=clean(actualValues),target=clean(targetValues),previous=clean(previousValues);
  const series=[{name:actualLabel,values:actual,color:'#3b82f6',kind:'bar'},...(target.some(finite)?[{name:targetLabel,values:target,color:'#f97316',kind:'line'}]:[]),...(previous.some(finite)?[{name:previousLabel,values:previous,color:'#64748b',kind:'line',dashed:true}]:[])];
  const scale=axisScale(Math.max(1,...series.flatMap(row=>row.values).filter(finite)),integerTicks);
  const x=i=>roundCoordinate(left+column*(i+.5)),y=value=>roundCoordinate(bottom-value/scale.maximum*(bottom-top));
  const grid=scale.ticks.map(value=>`<g><line x1="${left}" x2="${right}" y1="${y(value)}" y2="${y(value)}" class="ana-gridline"/><text x="${left-10}" y="${y(value)+4}" text-anchor="end" class="ana-axis-label">${currency?'₱':''}${compact(value)}</text></g>`).join('') + `<text x="${left-10}" y="${top-12}" text-anchor="end" class="ana-axis-unit">${currency?'PHP':'Rentals'}</text>`;
  const defs=`<defs><linearGradient id="${id}-combo-bar" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#3b82f6" stop-opacity=".95"/><stop offset="100%" stop-color="#2563eb" stop-opacity=".72"/></linearGradient></defs>`;
  const marks=series.map((row,seriesIndex)=>{
    if(row.kind==='bar') return `<g data-ana-series="${seriesIndex}">${row.values.map((value,i)=>finite(value)?`<rect data-ana-bar="${i}" class="ana-animated-bar" style="--ana-bar-delay:${Math.min(i*30,420)}ms" x="${roundCoordinate(x(i)-Math.min(20,column*.28))}" y="${y(value)}" width="${roundCoordinate(Math.min(40,column*.56))}" height="${roundCoordinate(bottom-y(value))}" rx="5" fill="url(#${id}-combo-bar)"><title>${e(labels[i])}: ${currency?'₱':''}${plain(value)}</title></rect>`:'').join('')}</g>`;
    const runs=[];let run=[];row.values.forEach((value,i)=>{if(finite(value))run.push([x(i),y(value)]);else if(run.length){runs.push(run);run=[];}});if(run.length)runs.push(run);
    return `<g data-ana-series="${seriesIndex}" class="ana-series-ink" style="--ana-series-delay:${seriesIndex*110}ms">${runs.map((points,i)=>`<path data-ana-stroke="${seriesIndex}-${i}" data-ana-bottom="${bottom}" class="ana-line-stroke" d="${points.map((p,n)=>`${n?'L':'M'}${p[0]},${p[1]}`).join(' ')}" fill="none" stroke="${row.color}" stroke-width="3" ${row.dashed?'stroke-dasharray="5 5"':''} vector-effect="non-scaling-stroke"/>`).join('')}${row.values.map((value,i)=>finite(value)?`<circle cx="${x(i)}" cy="${y(value)}" r="4" fill="${row.color}" stroke="#ffffff" stroke-width="1.5" class="ana-chart-point"><title>${e(row.name)} · ${e(labels[i])}: ${currency?'₱':''}${plain(value)}</title></circle>`:'').join('')}</g>`;
  }).join('');
  // Month and year occupy separate rows, so consecutive months remain readable.
  // Budget against the distance between column centres, including both endpoints.
  const monthParts=labels.map(label=>String(label).match(/^([A-Za-z]{3}) (\d{4})$/));
  const monthly=monthParts.every(Boolean);
  const labelGap=monthly?48:Math.max(82,...labels.map(label=>String(label).length*7+16));
  const tickCount=Math.min(labels.length,Math.max(2,Math.floor((right-left-column)/labelGap)+1));
  const tickIndices=[...new Set(Array.from({length:tickCount},(_,i)=>Math.round(i*(labels.length-1)/Math.max(1,tickCount-1))))];
  const ticks=tickIndices.map(i=>monthly
    ? `<text x="${x(i)}" y="${bottom+18}" text-anchor="middle" class="ana-axis-label" data-ana-time-tick="${i}" aria-label="${e(labels[i])}"><tspan x="${x(i)}">${e(monthParts[i][1])}</tspan><tspan x="${x(i)}" dy="15">${e(monthParts[i][2])}</tspan></text>`
    : `<text x="${x(i)}" y="${height-15}" text-anchor="${i===0?'start':i===labels.length-1?'end':'middle'}" class="ana-axis-label" data-ana-time-tick="${i}">${e(labels[i])}</text>`).join('');
  const inspection=labels.map((label,i)=>({label,x:x(i),rows:series.flatMap((row,seriesIndex)=>finite(row.values[i])?[{seriesIndex,name:row.name,color:row.color,x:x(i),y:y(row.values[i]),value:`${currency?'₱':''}${plain(row.values[i])}`,label:row.kind==='bar'?'Recorded actual':row.name}]:[])}));
  const hits=labels.map((_,i)=>`<rect data-ana-point="${i}" aria-hidden="true" focusable="false" x="${roundCoordinate(left+column*i)}" y="${top}" width="${roundCoordinate(column)}" height="${bottom-top}" fill="transparent"/>`).join('');
  const payload={type:'combination',labels,actualValues:actual,targetValues:target,options:{id,title,currency,previousValues:previous,actualLabel,targetLabel,previousLabel,integerTicks,width,height,caption}};
  return `<figure class="ana-chart ana-interactive ana-modern-chart ana-combination-chart" data-ana-chart data-ana-values="${e(JSON.stringify(inspection))}" data-ana-source="${e(JSON.stringify(payload))}" data-ana-view="${e(JSON.stringify(payload))}" aria-labelledby="${id}-title">${chartTools(labels.length>14)}<div class="ana-plot" data-ana-plot tabindex="0" role="group" aria-label="${e(title)}. Left and Right inspect periods; Enter pins; Escape dismisses."><svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${id}-title ${id}-description"><title id="${id}-title">${e(title)}</title><desc id="${id}-description">${e(series.map(row=>row.name).join(', '))}. Columns and lines use the same ${currency?'Philippine peso':'value'} scale starting at zero. Missing targets are omitted.</desc>${defs}${grid}${marks}${ticks}<line data-ana-crosshair x1="${left}" x2="${left}" y1="${top}" y2="${bottom}" class="ana-crosshair" hidden/>${hits}</svg>${chartTooltip()}</div><figcaption class="ana-chart-legend">${series.map((row,i)=>`<button type="button" data-ana-toggle="${i}" aria-pressed="true" aria-label="Show ${e(row.name)}"><i style="--ana-series-color:${row.color};background:${row.color}" class="${row.dashed?'is-dashed':''}"></i>${e(row.name)}</button>`).join('')}${caption?`<span class="ana-range-key">${e(caption)}</span>`:''}</figcaption></figure>`;
}

export function horizontalBarChart(rows = [], { escape:e=escapeHtml, id='equipment-comparison', title='Equipment comparison', currency=false, percentage=false, color='#3b82f6', valueLabel='Selected period', previousLabel='Previous period', width=730, height=null, caption='', compact:isCompact=false }={}) {
  if(!rows.length) return '<div class="ana-empty"><strong>No equipment to compare</strong><p>Choose another filter or record confirmed rentals.</p></div>';
  const narrow=width<500,hasSuffix=rows.some(row=>row.suffix);
  const left=narrow?18:Math.min(185,Math.max(132,Math.round(width*0.27)));
  const rightPad=narrow?(hasSuffix?116:88):(currency?(hasSuffix?176:116):(hasSuffix?146:88));
  const right=Math.max(left+80,width-rightPad);
  const top=isCompact?26:34,rowHeight=isCompact?(narrow?62:48):(narrow?76:66),botPad=isCompact?26:35;
  height=Math.max(height||0,top+rows.length*rowHeight+botPad);
  const scale=axisScale(Math.max(1,...rows.flatMap(row=>[row.value,row.previous]).filter(finite)),!currency&&!percentage),span=right-left;
  const barWidth=value=>roundCoordinate(Math.max(0,value)/scale.maximum*span),valueText=value=>`${currency?'₱':''}${plain(Math.max(0,value))}${percentage?'%':''}`;
  const hasPrevious=rows.some(row=>finite(row.previous));
  const grid=scale.ticks.map(value=>`<g><line x1="${left+barWidth(value)}" x2="${left+barWidth(value)}" y1="${top-5}" y2="${height-botPad+4}" class="ana-gridline"/><text x="${left+barWidth(value)}" y="${height-8}" text-anchor="middle" class="ana-axis-label">${currency?'₱':''}${compact(value)}${percentage?'%':''}</text></g>`).join('');
  const labelMax=narrow?40:Math.max(15,Math.floor((left-24)/7));
  const marks=rows.map((row,i)=>{
    const y=top+i*rowHeight+(narrow?18:isCompact?5:6),value=finite(row.value)?Math.max(0,row.value):null,previous=finite(row.previous)?Math.max(0,row.previous):null;
    const label=String(row.label||'Unnamed equipment'),short=label.length>(labelMax+2)?label.slice(0,labelMax)+'…':label;
    const fill=row.color||color;
    const displayValue=value===null?'':`${valueText(value)}${row.suffix ? ' ' + row.suffix : ''}`;
    const barH=hasPrevious?(isCompact?11:13):(isCompact?18:20);
    return `<g data-ana-point="${i}" class="ana-bar-column" style="--ana-bar-delay:${i*55}ms" tabindex="0" role="button" aria-label="${e(label)}. ${e(valueLabel)}: ${value===null?'Not recorded':e(displayValue)}${previous!==null?`; ${e(previousLabel)}: ${e(valueText(previous))}`:''}. Enter to pin."><title>${e(label)}</title><rect x="0" y="${top+i*rowHeight-4}" width="${width}" height="${rowHeight}" fill="transparent"/><text x="${narrow?left:left-12}" y="${narrow?y-12:y+Math.round(barH*0.72)}" text-anchor="${narrow?'start':'end'}" class="ana-axis-label">${e(short)}</text>${value!==null?`<rect data-horizontal-bar="${i}" class="ana-horizontal-bar" x="${left}" y="${y}" width="${barWidth(value)}" height="${barH}" rx="4" fill="${fill}"/><text x="${left+barWidth(value)+8}" y="${y+Math.round(barH*0.72)}" class="ana-bar-value">${e(displayValue)}</text>`:''}${previous!==null?`<rect class="ana-horizontal-prev" x="${left}" y="${y+barH+4}" width="${barWidth(previous)}" height="${isCompact?7:9}" rx="3" fill="#94a3b8"/><text x="${left+barWidth(previous)+8}" y="${y+Math.round(barH*0.72)+20}" class="ana-axis-label ana-bar-value">${e(valueText(previous))}</text>`:''}</g>`;
  }).join('');
  const inspection=rows.map(row=>({label:String(row.label||'Unnamed equipment'),x:left+span/2,rows:[...(finite(row.value)?[{name:row.valueName||valueLabel,color:row.color||color,value:`${valueText(row.value)}${row.suffix ? ' ' + row.suffix : ''}`,label:row.detail||'Selected reporting period'}]:[]),...(finite(row.previous)?[{name:previousLabel,color:'#94a3b8',value:valueText(row.previous),label:row.previousLabel||'Previous matched period'}]:[])]}));
  const payload={type:'horizontal',rows,options:{id,title,currency,percentage,color,valueLabel,previousLabel,width,height,caption,compact:isCompact}};
  return `<figure class="ana-chart ana-interactive ana-modern-chart ana-horizontal-chart" data-ana-chart data-ana-values="${e(JSON.stringify(inspection))}" data-ana-source="${e(JSON.stringify(payload))}" data-ana-view="${e(JSON.stringify(payload))}" aria-labelledby="${id}-title"><div class="ana-chart-tools"><span class="ana-chart-hint">Hover or tap a row for exact values</span></div><div class="ana-plot" data-ana-plot><svg viewBox="0 0 ${width} ${height}" role="group" aria-labelledby="${id}-title ${id}-description"><title id="${id}-title">${e(title)}</title><desc id="${id}-description">Bars start at zero. Focus a row and use arrow keys to inspect exact values; Enter pins; Escape dismisses.</desc>${grid}${marks}</svg>${chartTooltip()}</div><figcaption class="ana-chart-legend"><span><i style="background:${color}"></i>${e(valueLabel)}</span>${hasPrevious?`<span><i style="background:#94a3b8"></i>${e(previousLabel)}</span>`:''}${caption?`<span class="ana-range-key">${e(caption)}</span>`:''}</figcaption></figure>`;
}

export function inlineDataBar(value = 0, max = 100, labelText = '', tone = 'blue') {
  const num = finite(value) ? Math.max(0, value) : 0;
  const ceiling = finite(max) && max > 0 ? max : 100;
  const pct = Math.max(0, Math.min(100, (num / ceiling) * 100));
  const safeTone = tone === 'amber' ? 'amber' : tone === 'teal' ? 'teal' : 'blue';
  return `<div class="ana-table-bar-wrap"><span class="ana-table-bar-val">${escapeHtml(labelText)}</span><div class="ana-table-bar-track" aria-hidden="true"><span class="ana-table-bar-fill is-${safeTone}" style="width:${pct.toFixed(1)}%"></span></div></div>`;
}

export function statusIconBadge(text = '', kind = 'neutral') {
  const icons = { up: '↗', down: '↘', high: '▲', medium: '◆', good: '●', neutral: '→' };
  const sym = icons[kind] || '●';
  const safeKind = ['up', 'down', 'high', 'medium', 'good', 'neutral'].includes(kind) ? kind : 'neutral';
  return `<span class="ana-icon-badge is-${safeKind}"><span aria-hidden="true">${sym}</span><span>${escapeHtml(text)}</span></span>`;
}

function niceCeiling(maxVal = 1) {
  const raw = finite(maxVal) && maxVal > 0 ? maxVal : 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return Math.max(1, step * mag);
}

function formatAxisTick(value, currency) {
  if (currency) return '₱' + (Math.abs(value) >= 1000 ? compact(value) : plain(roundCoordinate(value)));
  return Math.abs(value) >= 1000 ? compact(value) : plain(roundCoordinate(value));
}

function formatShortLabel(label, dense = false) {
  const str = String(label || '');
  return dense && str.length > 10 ? str.slice(0, 9) + '…' : str;
}

function wrappedAxisLabel(label, x, y, cellWidth, e, fontSize = 12) {
  const limit=Math.max(4,Math.floor((cellWidth-4)/(fontSize*.55))), lines=[];
  for(const word of String(label).split(/\s+/)) {
    const part=word.length>limit?word.slice(0,limit-1)+'…':word;
    if(lines.length && (lines.at(-1)+' '+part).length<=limit) lines[lines.length-1]+=' '+part;
    else lines.push(part);
  }
  const shown=lines.slice(0,2);
  if(lines.length>2)shown[1]=shown[1].slice(0,limit-1)+'…';
  return `<text x="${x}" y="${y}" text-anchor="middle" class="ana-axis-label" style="font-size:${fontSize}px" aria-label="${e(label)}">${shown.map((line,i)=>`<tspan x="${x}" dy="${i?14:0}">${e(line)}</tspan>`).join('')}</text>`;
}

/** Pareto 80-20 chart: sorted descending bars (left axis) + cumulative % line + 80% rule line (right axis). */
export function paretoChart(rows = [], { escape: e = escapeHtml, currency = true, id = 'pareto-chart', title = 'Pareto 80-20 equipment contribution', width = 730, height = 278 } = {}) {
  const clean = (Array.isArray(rows) ? rows : []).filter(r => finite(r.value) && r.value > 0);
  if (!clean.length) return '<div class="ana-empty"><strong>No positive rental values yet</strong><p>Confirmed rentals with positive values are needed for the 80–20 ranking.</p></div>';

  const display = clean.length > 9 ? [...clean.slice(0, 8), {
    name: `Other (${clean.length - 8} items)`,
    value: clean.slice(8).reduce((s, r) => s + r.value, 0),
    cumulative: 1,
    share: clean.slice(8).reduce((s, r) => s + (r.share || 0), 0),
    tier: 'Tail'
  }] : clean;

  const box = { width, height, left: width < 500 ? 48 : 66, right: width - (width < 500 ? 42 : 54), top: 34, bottom: height - 48 };
  const plotW = Math.max(80, box.right - box.left);
  const plotH = Math.max(80, box.bottom - box.top);
  const yMax = niceCeiling(Math.max(...display.map(r => r.value)));
  const yOf = val => roundCoordinate(box.bottom - (Math.max(0, val) / yMax) * plotH);
  const pctY = pct => roundCoordinate(box.bottom - Math.max(0, Math.min(1, pct)) * plotH);

  const stepW = plotW / display.length;
  const barW = Math.max(12, Math.min(46, stepW * 0.62));
  const yTicks = [0, 0.25, 0.5, 0.75, 1];
  const linePts = [];
  const barsSvg = [];
  const hitsSvg = [];
  const xLabelsSvg = [];
  const valuesPayload = [];

  display.forEach((row, i) => {
    const cx = roundCoordinate(box.left + stepW * (i + 0.5));
    const bx = roundCoordinate(cx - barW / 2);
    const by = yOf(row.value);
    const bh = roundCoordinate(box.bottom - by);
    const py = pctY(row.cumulative);
    const color = row.tier === 'Vital 80%' ? '#f97316' : row.tier === 'Next 15%' ? '#3b82f6' : '#94a3b8';
    linePts.push([cx, py]);
    barsSvg.push(`<rect class="ana-animated-bar" style="--ana-bar-delay:${i*50}ms" x="${bx}" y="${by}" width="${barW}" height="${bh}" rx="4" fill="${color}" data-ana-bar="p-${i}"/>`);
    const lbl = stepW<110 ? `#${i+1}` : formatShortLabel(row.name,true);
    xLabelsSvg.push(`<text x="${cx}" y="${box.bottom + 18}" text-anchor="middle" aria-label="${e(row.name)}" class="ana-axis-label">${e(lbl)}</text>`);
    hitsSvg.push(`<rect x="${roundCoordinate(box.left + stepW * i)}" y="${box.top}" width="${roundCoordinate(stepW)}" height="${plotH}" fill="transparent" class="ana-hit" data-ana-point="${i}" tabindex="-1"/>`);
    const valStr = currency ? `₱${plain(row.value)}` : `${plain(row.value)} rental${row.value === 1 ? '' : 's'}`;
    valuesPayload.push({
      label: row.name,
      x: cx,
      rows: [
        { name: currency ? 'Rental fees' : 'Rentals', color, value: valStr, label: `${plain((row.share || 0) * 100)}% of total` },
        { name: 'Cumulative share', color: '#0d9488', value: `${plain((row.cumulative || 0) * 100)}%`, label: row.tier || 'Ranked' }
      ]
    });
  });

  const pathD = linePts.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(' ');
  const dotsSvg = linePts.map(([x, y]) => `<circle class="ana-chart-point" cx="${x}" cy="${y}" r="3.4" fill="#0d9488" stroke="#fff" stroke-width="1.3"/>`).join('');
  const gridSvg = yTicks.map(f => {
    const gy = roundCoordinate(box.bottom - f * plotH);
    const leftTxt = formatAxisTick(yMax * f, currency);
    const rightTxt = `${Math.round(f * 100)}%`;
    return `<line x1="${box.left}" y1="${gy}" x2="${box.right}" y2="${gy}" class="ana-gridline"/><text x="${box.left - 8}" y="${gy + 4}" text-anchor="end" class="ana-axis-label">${leftTxt}</text><text x="${box.right + 8}" y="${gy + 4}" text-anchor="start" class="ana-axis-label">${rightTxt}</text>`;
  }).join('');
  const y80 = pctY(0.8);
  const cutoff80 = `<line x1="${box.left}" y1="${y80}" x2="${box.right}" y2="${y80}" stroke="#dc2626" stroke-width="1.4" stroke-dasharray="5 4"/><text x="${box.right - 4}" y="${y80 - 5}" text-anchor="end" class="ana-axis-label" style="fill:#dc2626;font-weight:700">80% cutoff</text>`;

  const source = { type: 'pareto', rows: clean, options: { id, title, currency, width, height } };
  const legend = `<div class="ana-chart-legend" data-ana-legend><span><i style="background:#f97316"></i>Vital 80% drivers</span><span><i style="background:#3b82f6"></i>Next 15%</span><span><i style="background:#94a3b8"></i>Bottom 5%</span><span><i style="background:#0d9488"></i>Cumulative % (right axis)</span><span class="ana-range-key">Ranks follow the equipment table order. Hover or tap a bar for its full name.</span></div>`;
  return `<figure class="ana-chart ana-interactive ana-modern-chart ana-modern-bars" data-ana-chart data-ana-source="${e(JSON.stringify(source))}" data-ana-view="${e(JSON.stringify(source))}" data-ana-values="${e(JSON.stringify(valuesPayload))}" aria-labelledby="${id}-title"><div class="ana-chart-tools"><span class="ana-chart-hint">Hover or focus bars to inspect item share and cumulative %</span><button type="button" class="ana-chart-replay" data-ana-replay aria-label="Replay ${e(title)}"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 6a6 6 0 1 1-1 6M4 2v5h5"/></svg>Replay</button></div><div class="ana-plot" data-ana-plot tabindex="0"><svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${id}-title ${id}-desc"><title id="${id}-title">${e(title)}</title><desc id="${id}-desc">Pareto ranking sorted highest to lowest with cumulative percentage line and 80% rule cutoff.</desc>${gridSvg}${cutoff80}<line x1="${box.left}" y1="${box.bottom}" x2="${box.right}" y2="${box.bottom}" class="ana-axis"/>${barsSvg.join('')}<g class="ana-series-ink" style="--ana-series-delay:120ms"><path d="${pathD}" fill="none" stroke="#0d9488" stroke-width="2.2" data-ana-stroke="cum"/>${dotsSvg}</g>${xLabelsSvg.join('')}<line x1="${box.left}" y1="${box.top}" x2="${box.left}" y2="${box.bottom}" data-ana-crosshair class="ana-crosshair" hidden/>${hitsSvg.join('')}</svg>${chartTooltip()}</div>${legend}</figure>`;
}

/** Waterfall cash/revenue bridge chart (BA Mod 9 Slide 23). */
export function waterfallChart(steps = [], { escape: e = escapeHtml, id = 'waterfall-chart', title = 'Collections, refunds & expenses', width = 730, height = 266 } = {}) {
  const clean = (Array.isArray(steps) ? steps : []).filter(s => finite(s.start) && finite(s.end)).map(s => ({ ...s, amount: finite(s.amount) ? s.amount : s.end - s.start }));
  if (!clean.length) return '<div class="ana-empty"><strong>No financial bridge entries yet</strong><p>Confirmed rental fees or collections are needed to build the cash bridge.</p></div>';

  const box = { width, height, left: width < 500 ? 48 : 68, right: width - 22, top: 34, bottom: height - 42 };
  const plotW = Math.max(80, box.right - box.left);
  const plotH = Math.max(80, box.bottom - box.top);
  const allVals = [0, ...clean.flatMap(s => [s.start, s.end])];
  const minVal = Math.min(0, ...allVals);
  const maxVal = Math.max(1, ...allVals);
  const ceilMax = niceCeiling(maxVal);
  const floorMin = minVal < 0 ? -niceCeiling(Math.abs(minVal)) : 0;
  const span = Math.max(1, ceilMax - floorMin);
  const yOf = val => roundCoordinate(box.bottom - ((val - floorMin) / span) * plotH);
  const zeroY = yOf(0);

  const stepW = plotW / clean.length;
  const barW = Math.max(22, Math.min(64, stepW * 0.56));
  const barsSvg = [];
  const connectors = [];
  const labelsSvg = [];
  const hitsSvg = [];
  const valuesPayload = [];

  clean.forEach((step, i) => {
    const cx = roundCoordinate(box.left + stepW * (i + 0.5));
    const bx = roundCoordinate(cx - barW / 2);
    const y1 = yOf(step.start);
    const y2 = yOf(step.end);
    const topY = Math.min(y1, y2);
    const bh = Math.abs(y2 - y1);
    const color = step.kind === 'minus' ? '#dc2626' : step.kind === 'plus' ? '#16a34a' : step.kind === 'total' ? '#0d9488' : '#3b82f6';
    barsSvg.push(`<rect class="ana-animated-bar" style="--ana-bar-delay:${i*75}ms" x="${bx}" y="${roundCoordinate(topY)}" width="${barW}" height="${roundCoordinate(bh)}" rx="4" fill="${color}" data-ana-bar="w-${i}"/>`);
    const amtText = `${step.amount < 0 ? '−' : step.kind === 'plus' && step.amount>0 ? '+' : ''}₱${plain(Math.abs(step.amount))}`;
    const displayAmount=stepW<110?`${step.amount<0?'−':step.kind==='plus'&&step.amount>0?'+':''}₱${compact(Math.abs(step.amount))}`:amtText;
    barsSvg.push(`<text x="${cx}" y="${Math.max(14, roundCoordinate(topY - 6))}" text-anchor="middle" class="ana-axis-label ana-bar-value" style="font-weight:700;--ana-bar-delay:${i*75}ms">${e(displayAmount)}</text>`);
    if (i < clean.length - 1) {
      const nextCx = roundCoordinate(box.left + stepW * (i + 1.5));
      connectors.push(`<line class="ana-waterfall-connector" style="--ana-bar-delay:${i*75+90}ms" x1="${bx + barW}" y1="${y2}" x2="${roundCoordinate(nextCx - barW / 2)}" y2="${y2}" stroke="var(--ui-border)" stroke-dasharray="4 3" stroke-width="1.2"/>`);
    }
    labelsSvg.push(wrappedAxisLabel(step.label,cx,box.bottom+18,stepW,e));
    hitsSvg.push(`<rect x="${roundCoordinate(box.left + stepW * i)}" y="${box.top}" width="${roundCoordinate(stepW)}" height="${plotH}" fill="transparent" class="ana-hit" data-ana-point="${i}" tabindex="-1"/>`);
    valuesPayload.push({
      label: step.label,
      x: cx,
      rows: [
        {
          name: step.kind === 'minus' ? 'Deduction' : step.kind === 'plus' ? 'Addition' : step.kind === 'total' ? 'Total' : 'Starting amount',
          color,
          value: amtText,
          label: step.detail || ''
        }
      ]
    });
  });

  const gridSvg = [0, 0.25, 0.5, 0.75, 1].map(f => {
    const val = floorMin + span * f;
    const gy = yOf(val);
    return `<line x1="${box.left}" y1="${gy}" x2="${box.right}" y2="${gy}" class="ana-gridline"/><text x="${box.left - 8}" y="${gy + 4}" text-anchor="end" class="ana-axis-label">${formatAxisTick(val, true)}</text>`;
  }).join('');

  const source = { type: 'waterfall', steps: clean, options: { id, title, width, height } };
  const legend = `<div class="ana-chart-legend" data-ana-legend><span><i style="background:#3b82f6"></i>Starting balance</span><span><i style="background:#16a34a"></i>Additions (+)</span><span><i style="background:#dc2626"></i>Deductions (−)</span><span><i style="background:#0d9488"></i>Total (=)</span></div>`;
  return `<figure class="ana-chart ana-interactive ana-modern-chart ana-modern-bars" data-ana-chart data-ana-source="${e(JSON.stringify(source))}" data-ana-view="${e(JSON.stringify(source))}" data-ana-values="${e(JSON.stringify(valuesPayload))}" aria-labelledby="${id}-title"><div class="ana-chart-tools"><span class="ana-chart-hint">Inspect the starting amount, changes and final total</span><button type="button" class="ana-chart-replay" data-ana-replay aria-label="Replay ${e(title)}"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 6a6 6 0 1 1-1 6M4 2v5h5"/></svg>Replay</button></div><div class="ana-plot" data-ana-plot tabindex="0"><svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${id}-title ${id}-desc"><title id="${id}-title">${e(title)}</title><desc id="${id}-desc">Waterfall bridge showing the starting amount, changes and final total. Exact values are available for each step.</desc>${gridSvg}<line x1="${box.left}" y1="${zeroY}" x2="${box.right}" y2="${zeroY}" class="ana-axis"/>${connectors.join('')}${barsSvg.join('')}${labelsSvg.join('')}<line x1="${box.left}" y1="${box.top}" x2="${box.left}" y2="${box.bottom}" data-ana-crosshair class="ana-crosshair" hidden/>${hitsSvg.join('')}</svg>${chartTooltip()}</div>${legend}</figure>`;
}

/** Stacked column chart (BA Mod 9.2.1) for channel mix (Counter vs Delivery) or Payment method mix. */
export function stackedColumnChart(labels = [], series = [], { escape: e = escapeHtml, currency = false, id = 'stacked-chart', title = 'Stacked breakdown over time', width = 730, height = 266 } = {}) {
  const cleanSeries = (Array.isArray(series) ? series : []).filter(s => Array.isArray(s.values));
  if (!labels.length || !cleanSeries.length) return '<div class="ana-empty"><strong>No trend entries yet</strong><p>Confirmed rentals across at least one period bucket are needed.</p></div>';

  const box = { width, height, left: width < 500 ? 42 : 60, right: width - 20, top: 34, bottom: height - 42 };
  const plotW = Math.max(80, box.right - box.left);
  const plotH = Math.max(80, box.bottom - box.top);
  const totals = labels.map((_, i) => cleanSeries.reduce((s, ser) => s + (finite(ser.values[i]) && ser.values[i] > 0 ? ser.values[i] : 0), 0));
  const yMax = niceCeiling(Math.max(1, ...totals));
  const yOf = val => roundCoordinate(box.bottom - (Math.max(0, val) / yMax) * plotH);

  const stepW = plotW / labels.length;
  const barW = Math.max(8, Math.min(36, stepW * 0.66));
  const groupSvgs = cleanSeries.map(() => []);
  const hitsSvg = [];
  const xLabelsSvg = [];
  const valuesPayload = [];
  const labelEvery = labels.length > 14 ? Math.ceil(labels.length / 7) : labels.length > 7 ? 2 : 1;

  labels.forEach((lbl, i) => {
    const cx = roundCoordinate(box.left + stepW * (i + 0.5));
    const bx = roundCoordinate(cx - barW / 2);
    let running = 0;
    const tipRows = [];
    cleanSeries.forEach((ser, si) => {
      const val = finite(ser.values[i]) && ser.values[i] > 0 ? ser.values[i] : 0;
      const yBottom = yOf(running);
      running += val;
      const yTop = yOf(running);
      const bh = Math.max(0, roundCoordinate(yBottom - yTop));
      if (bh > 0) {
        groupSvgs[si].push(`<rect class="ana-animated-bar" style="--ana-bar-delay:${Math.min(i*28,420)+si*55}ms" x="${bx}" y="${yTop}" width="${barW}" height="${bh}" fill="${ser.color || '#337db5'}" data-ana-bar="st-${si}-${i}"/>`);
      }
      tipRows.push({
        seriesIndex: si,
        name: ser.name,
        color: ser.color || '#337db5',
        value: currency ? `₱${plain(val)}` : `${plain(val)} rental${val === 1 ? '' : 's'}`,
        label: totals[i] > 0 ? `${plain((val / totals[i]) * 100)}% of period` : 'No activity'
      });
    });
    if (i % labelEvery === 0 || i === labels.length - 1) {
      xLabelsSvg.push(`<text x="${cx}" y="${box.bottom + 18}" text-anchor="middle" class="ana-axis-label">${e(formatShortLabel(lbl, true))}</text>`);
    }
    hitsSvg.push(`<rect x="${roundCoordinate(box.left + stepW * i)}" y="${box.top}" width="${roundCoordinate(stepW)}" height="${plotH}" fill="transparent" class="ana-hit" data-ana-point="${i}" tabindex="-1"/>`);
    valuesPayload.push({ label: lbl, x: cx, rows: tipRows });
  });

  const gridSvg = [0, 0.25, 0.5, 0.75, 1].map(f => {
    const val = yMax * f;
    const gy = roundCoordinate(box.bottom - f * plotH);
    return `<line x1="${box.left}" y1="${gy}" x2="${box.right}" y2="${gy}" class="ana-gridline"/><text x="${box.left - 8}" y="${gy + 4}" text-anchor="end" class="ana-axis-label">${formatAxisTick(val, currency)}</text>`;
  }).join('');

  const zoomHtml = labels.length > 14
    ? `<label class="ana-zoom-label">Window <select data-ana-zoom aria-label="Filter periods shown"><option value="0">All (${labels.length})</option><option value="14">Last 14</option><option value="7">Last 7</option></select></label>`
    : '';
  const source = { type: 'stacked', labels, series: cleanSeries, options: { id, title, currency, width, height } };
  const legend = `<div class="ana-chart-legend" data-ana-legend>${cleanSeries.map((ser, si) => `<button type="button" data-ana-toggle="${si}" aria-pressed="true"><i style="background:${ser.color}"></i><span>${e(ser.name)}</span></button>`).join('')}</div>`;
  const seriesGroups = groupSvgs.map((rects, si) => `<g data-ana-series="${si}">${rects.join('')}</g>`).join('');
  return `<figure class="ana-chart ana-interactive ana-modern-chart ana-modern-bars" data-ana-chart data-ana-source="${e(JSON.stringify(source))}" data-ana-view="${e(JSON.stringify(source))}" data-ana-values="${e(JSON.stringify(valuesPayload))}" aria-labelledby="${id}-title"><div class="ana-chart-tools">${zoomHtml}<span class="ana-chart-hint">Click legend items to toggle series</span><button type="button" class="ana-chart-replay" data-ana-replay aria-label="Replay ${e(title)}"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 6a6 6 0 1 1-1 6M4 2v5h5"/></svg>Replay</button></div><div class="ana-plot" data-ana-plot tabindex="0"><svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${id}-title ${id}-desc"><title id="${id}-title">${e(title)}</title><desc id="${id}-desc">Zero-based stacked column breakdown across time buckets.</desc>${gridSvg}<line x1="${box.left}" y1="${box.bottom}" x2="${box.right}" y2="${box.bottom}" class="ana-axis"/>${seriesGroups}${xLabelsSvg.join('')}<line x1="${box.left}" y1="${box.top}" x2="${box.left}" y2="${box.bottom}" data-ana-crosshair class="ana-crosshair" hidden/>${hitsSvg.join('')}</svg>${chartTooltip()}</div>${legend}</figure>`;
}

/** Frequency distribution Histogram with Mean, Median, Mode & Std Dev (Modeling Mod 2 p. 10). */
export function histogramChart(bins = [], { escape: e = escapeHtml, id = 'histogram-chart', title = 'Distribution histogram', unit = '', stats = null, width = 560, height = 228 } = {}) {
  const clean = (Array.isArray(bins) ? bins : []);
  const total = clean.reduce((s, b) => s + (finite(b.count) ? b.count : 0), 0);
  if (!clean.length || !total) return '<div class="ana-empty"><strong>No completed distribution samples yet</strong><p>Completed records with valid start and end times are needed to build this histogram.</p></div>';

  const box = { width, height, left: 48, right: width - 16, top: 28, bottom: height - 42 };
  const plotW = Math.max(80, box.right - box.left);
  const plotH = Math.max(70, box.bottom - box.top);
  const maxCount = Math.max(1, ...clean.map(b => b.count || 0));
  const yMax = niceCeiling(maxCount);
  const yOf = val => roundCoordinate(box.bottom - (Math.max(0, val) / yMax) * plotH);
  const stepW = plotW / clean.length;
  const barW = Math.max(16, stepW - 3);
  const peakCount = Math.max(...clean.map(b => b.count || 0));

  const barsSvg = [];
  const xLabelsSvg = [];
  const hitsSvg = [];
  const valuesPayload = [];

  clean.forEach((bin, i) => {
    const cx = roundCoordinate(box.left + stepW * (i + 0.5));
    const bx = roundCoordinate(cx - barW / 2);
    const by = yOf(bin.count || 0);
    const bh = roundCoordinate(box.bottom - by);
    const isMode = bin.count > 0 && bin.count === peakCount;
    const color = isMode ? '#f97316' : '#3b82f6';
    barsSvg.push(`<rect class="ana-animated-bar" style="--ana-bar-delay:${i*55}ms" x="${bx}" y="${by}" width="${roundCoordinate(barW)}" height="${bh}" rx="3" fill="${color}" data-ana-bar="h-${i}"/>`);
    if (bin.count > 0) {
      barsSvg.push(`<text x="${cx}" y="${Math.max(14, by - 5)}" text-anchor="middle" class="ana-axis-label ana-bar-value" style="font-weight:700;--ana-bar-delay:${i*55}ms">${bin.count}</text>`);
    }
    xLabelsSvg.push(wrappedAxisLabel(bin.label,cx,box.bottom+18,stepW,e,stepW<55?10:12));
    hitsSvg.push(`<rect x="${roundCoordinate(box.left + stepW * i)}" y="${box.top}" width="${roundCoordinate(stepW)}" height="${plotH}" fill="transparent" class="ana-hit" data-ana-point="${i}" tabindex="-1"/>`);
    valuesPayload.push({
      label: bin.label,
      x: cx,
      rows: [{ name: isMode ? 'Frequency (most frequent range)' : 'Frequency', color, value: `${bin.count} record${bin.count === 1 ? '' : 's'}`, label: `${plain((bin.share || 0) * 100)}% of ${total} sample${total === 1 ? '' : 's'}` }]
    });
  });

  const gridSvg = [0, 0.5, 1].map(f => {
    const gy = roundCoordinate(box.bottom - f * plotH);
    return `<line x1="${box.left}" y1="${gy}" x2="${box.right}" y2="${gy}" class="ana-gridline"/><text x="${box.left - 8}" y="${gy + 4}" text-anchor="end" class="ana-axis-label">${plain(yMax * f)}</text>`;
  }).join('');

  const uSuffix = unit ? ' ' + e(unit) : '';
  const summaryFacts = stats?.available ? `<div class="ana-chart-facts"><span>Mean<b>${e(stats.mean)}${uSuffix}</b></span><span>Median<b>${e(stats.median)}${uSuffix}</b></span><span>Most frequent range(s)<b>${e(stats.modeBins?.map(bin=>bin.label).join(', ') || stats.modeBin?.label || '—')}</b></span><span>Sample std. deviation<b>${stats.stdDev == null ? '—' : `±${e(stats.stdDev)}${uSuffix}`}</b></span></div>` : '';
  const source = { type: 'histogram', bins: clean, options: { id, title, unit, stats, width, height } };
  const legend = `<div class="ana-chart-legend" data-ana-legend><span><i style="background:#f97316"></i>Most frequent range(s)</span><span><i style="background:#3b82f6"></i>Other frequency ranges</span></div>`;
  return `<figure class="ana-chart ana-interactive ana-modern-chart ana-modern-bars" data-ana-chart data-ana-source="${e(JSON.stringify(source))}" data-ana-view="${e(JSON.stringify(source))}" data-ana-values="${e(JSON.stringify(valuesPayload))}" aria-labelledby="${id}-title"><div class="ana-chart-tools"><span class="ana-chart-hint">Hover or tap bars to inspect bin counts</span><button type="button" class="ana-chart-replay" data-ana-replay aria-label="Replay ${e(title)}"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 6a6 6 0 1 1-1 6M4 2v5h5"/></svg>Replay</button></div><div class="ana-plot" data-ana-plot tabindex="0"><svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${id}-title ${id}-desc"><title id="${id}-title">${e(title)}</title><desc id="${id}-desc">Frequency bar chart showing record counts in labeled ranges. Ranges may have unequal or open-ended widths; bar width does not represent elapsed time. Mean, median and sample standard deviation use individual observations.</desc>${gridSvg}<line x1="${box.left}" y1="${box.bottom}" x2="${box.right}" y2="${box.bottom}" class="ana-axis"/>${barsSvg.join('')}${xLabelsSvg.join('')}<line x1="${box.left}" y1="${box.top}" x2="${box.left}" y2="${box.bottom}" data-ana-crosshair class="ana-crosshair" hidden/>${hitsSvg.join('')}</svg>${chartTooltip()}</div>${legend}<p class="ana-note">Bars compare counts in labeled ranges, not equal time intervals. The most frequent range is not an exact numerical mode.</p>${summaryFacts}</figure>`;
}

function chartTooltip() {
  return '<div class="ana-tooltip" data-ana-tooltip hidden><output data-ana-readout aria-live="polite" aria-atomic="true"></output><button type="button" data-ana-unpin aria-label="Dismiss pinned chart value" hidden>Dismiss ×</button></div>';
}

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

const chartCleanup = new WeakMap();
let chartResizeObserver;

export function pairedComparisonChart(labels = [], series = [], { escape: e = escapeHtml, id = 'paired-comparison', title = 'Actual versus estimate', currency = false, integerTicks = false, width = 730, height = 248 } = {}) {
  const cleanSeries = (Array.isArray(series) ? series : []).filter(s => Array.isArray(s.values));
  if (!labels.length || !cleanSeries.length) return '<div class="ana-empty"><strong>No periods to compare</strong><p>Completed evaluation periods will appear here.</p></div>';
  const box = { width, height, left: width < 500 ? 48 : 66, right: width - 20, top: 38, bottom: height - 42 };
  const plotW = Math.max(80, box.right - box.left);
  const plotH = Math.max(80, box.bottom - box.top);
  const allVals = cleanSeries.flatMap(s => s.values.filter(finite));
  const scale = axisScale(Math.max(1, ...allVals), integerTicks);
  const yOf = val => roundCoordinate(box.bottom - (Math.max(0, val) / scale.maximum) * plotH);
  const groupW = plotW / labels.length;
  const subBarW = Math.max(18, Math.min(48, (groupW * 0.56) / Math.max(1, cleanSeries.length)));
  const gap = 8;
  const groupSvg = cleanSeries.map(() => []);
  const hitsSvg = [];
  const xLabelsSvg = [];
  const valuesPayload = [];

  labels.forEach((lbl, i) => {
    const cx = roundCoordinate(box.left + groupW * (i + 0.5));
    const totalGroupBarW = cleanSeries.length * subBarW + (cleanSeries.length - 1) * gap;
    const startX = cx - totalGroupBarW / 2;
    const tipRows = [];
    cleanSeries.forEach((ser, si) => {
      const val = finite(ser.values[i]) ? Math.max(0, ser.values[i]) : 0;
      const bx = roundCoordinate(startX + si * (subBarW + gap));
      const by = yOf(val);
      const bh = Math.max(2, roundCoordinate(box.bottom - by));
      const fill = ser.color || '#3b82f6';
      groupSvg[si].push(`<rect class="ana-animated-bar" style="--ana-bar-delay:${i*70+si*60}ms" x="${bx}" y="${by}" width="${subBarW}" height="${bh}" rx="5" fill="${fill}" data-ana-bar="pr-${si}-${i}"><title>${e(ser.name)} · ${e(lbl)}: ${currency ? '₱' : ''}${plain(val)}</title></rect><text x="${roundCoordinate(bx + subBarW / 2)}" y="${Math.max(16, by - 6)}" text-anchor="middle" class="ana-bar-value">${currency ? '₱' : ''}${compact(val)}</text>`);
      tipRows.push({
        seriesIndex: si,
        name: ser.name,
        color: fill,
        value: currency ? `₱${plain(val)}` : `${plain(val)} rental${val === 1 ? '' : 's'}`,
        label: ser.dashed ? 'Reconstructed estimate' : 'Recorded actual'
      });
    });
    xLabelsSvg.push(`<text x="${cx}" y="${box.bottom + 20}" text-anchor="middle" class="ana-axis-label">${e(lbl)}</text>`);
    hitsSvg.push(`<rect x="${roundCoordinate(box.left + groupW * i)}" y="${box.top}" width="${roundCoordinate(groupW)}" height="${plotH}" fill="transparent" class="ana-hit" data-ana-point="${i}" tabindex="-1"/>`);
    valuesPayload.push({ label: lbl, x: cx, rows: tipRows });
  });

  const gridSvg = scale.ticks.map(val => {
    const gy = yOf(val);
    return `<line x1="${box.left}" y1="${gy}" x2="${box.right}" y2="${gy}" class="ana-gridline"/><text x="${box.left - 10}" y="${gy + 4}" text-anchor="end" class="ana-axis-label">${formatAxisTick(val, currency)}</text>`;
  }).join('') + `<text x="${box.left - 10}" y="${box.top - 12}" text-anchor="end" class="ana-axis-unit">${currency ? 'PHP' : 'Rentals'}</text>`;

  const source = { type: 'paired', labels, series: cleanSeries, options: { id, title, currency, integerTicks, width, height } };
  const legend = `<div class="ana-chart-legend" data-ana-legend>${cleanSeries.map((ser, si) => `<button type="button" data-ana-toggle="${si}" aria-pressed="true"><i style="background:${ser.color}"></i><span>${e(ser.name)}</span></button>`).join('')}</div>`;
  const seriesGroups = groupSvg.map((items, si) => `<g data-ana-series="${si}">${items.join('')}</g>`).join('');
  return `<figure class="ana-chart ana-interactive ana-modern-chart ana-modern-bars ana-paired-chart" data-ana-chart data-ana-source="${e(JSON.stringify(source))}" data-ana-view="${e(JSON.stringify(source))}" data-ana-values="${e(JSON.stringify(valuesPayload))}" aria-labelledby="${id}-title">${chartTools(false)}<div class="ana-plot" data-ana-plot tabindex="0"><svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${id}-title ${id}-desc"><title id="${id}-title">${e(title)}</title><desc id="${id}-desc">Side-by-side comparison of actual versus reconstructed historical estimate for each evaluated period.</desc>${gridSvg}<line x1="${box.left}" y1="${box.bottom}" x2="${box.right}" y2="${box.bottom}" class="ana-axis"/>${seriesGroups}${xLabelsSvg.join('')}<line x1="${box.left}" y1="${box.top}" x2="${box.left}" y2="${box.bottom}" data-ana-crosshair class="ana-crosshair" hidden/>${hitsSvg.join('')}</svg>${chartTooltip()}</div>${legend}</figure>`;
}

function renderChart(source,dimensions={}) {
  const options={...source.options,...dimensions,escape:escapeHtml};
  if(source.type==='pareto') return paretoChart(source.rows,options);
  if(source.type==='waterfall') return waterfallChart(source.steps,options);
  if(source.type==='stacked') return stackedColumnChart(source.labels,source.series,options);
  if(source.type==='paired') return pairedComparisonChart(source.labels,source.series,options);
  if(source.type==='histogram') return histogramChart(source.bins,options);
  if(source.type==='combination') return combinationChart(source.labels,source.actualValues,source.targetValues,options);
  if(source.type==='horizontal') return horizontalBarChart(source.rows,options);
  if(source.type==='bar') return barChart(source.rows,options);
  return lineChart(source.labels,source.series,options);
}

function slicedChart(source,count,dimensions={}) {
  if(source.type==='stacked') {
    const start=count?Math.max(0,source.labels.length-count):0;
    const sliced=source.series.map(row=>({...row,values:row.values.slice(start)}));
    return stackedColumnChart(source.labels.slice(start),sliced,{...source.options,...dimensions,escape:escapeHtml});
  }
  if(source.type==='combination') {
    const start=count?Math.max(0,source.labels.length-count):0;
    return combinationChart(source.labels.slice(start),source.actualValues.slice(start),source.targetValues.slice(start),{...source.options,...dimensions,previousValues:source.options.previousValues?.slice(start),escape:escapeHtml});
  }
  if(source.type!=='line') return renderChart(source,dimensions);
  const start=count?Math.max(0,source.labels.length-count):0;
  const sliced=source.series.map(row=>({...row,values:row.values.slice(start),labels:row.labels?.slice(start),low:row.low?.slice(start),high:row.high?.slice(start)}));
  const handoff=source.options.handoff;
  return lineChart(source.labels.slice(start),sliced,{...source.options,...dimensions,
    forecastStart:source.options.forecastStart==null?null:Math.max(0,source.options.forecastStart-start),
    handoff:handoff&&handoff.from>=start?{...handoff,from:handoff.from-start,to:handoff.to-start,excludedIndex:handoff.excludedIndex==null?null:handoff.excludedIndex-start}:null,
    escape:escapeHtml});
}

// Keep the figure, plot and SVG nodes mounted during model/scenario changes.
export function updateAnalyticsChart(chart,next) {
  const source=JSON.parse(next.dataset.anaSource),current=JSON.parse(chart.dataset.anaView||chart.dataset.anaSource);
  if(source.type!==current.type) return false;
  const zoom=chart.querySelector('[data-ana-zoom]'),count=Number(zoom?.value||0);
  const holder=chart.ownerDocument.createElement('div');
  holder.innerHTML=slicedChart(source,count,{width:current.options.width,height:current.options.height});
  const rendered=holder.firstElementChild;
  if(!rendered) return false;
  rememberChartMotion(chart); settleChartMotion(chart); chartCleanup.get(chart)?.();
  const plot=chart.querySelector('[data-ana-plot]'),svg=plot?.querySelector('svg'),nextSvg=rendered.querySelector('.ana-plot>svg');
  if(!plot||!svg||!nextSvg) return false;
  chartResizeObserver?.unobserve(plot);
  svg.replaceChildren(...Array.from(nextSvg.childNodes));
  for(const attr of nextSvg.attributes) svg.setAttribute(attr.name,attr.value);
  const legend=chart.querySelector('.ana-chart-legend'),nextLegend=rendered.querySelector('.ana-chart-legend');
  if(legend&&nextLegend) legend.innerHTML=nextLegend.innerHTML;
  chart.dataset.anaValues=rendered.dataset.anaValues;
  chart.dataset.anaSource=next.dataset.anaSource;
  chart.dataset.anaView=rendered.dataset.anaView;
  const tooltip=chart.querySelector('[data-ana-tooltip]'),unpin=chart.querySelector('[data-ana-unpin]');
  if(tooltip) tooltip.hidden=true;
  if(unpin) unpin.hidden=true;
  chart.removeAttribute('data-ana-bound');
  bindAnalyticsCharts(chart.parentElement);
  return true;
}

function responsiveChart(chart) {
  const plot=chart.querySelector('[data-ana-plot]'),svg=plot?.querySelector('svg');
  if(!plot||!svg) return false;
  const bounds=plot.getBoundingClientRect?.(),svgBounds=svg.getBoundingClientRect?.();
  if (!(bounds?.width>0&&svgBounds?.height>0)) return false;
  const source=JSON.parse(chart.dataset.anaView||chart.dataset.anaSource);
  const width=Math.max(250,Math.round(plot.clientWidth||bounds.width));
  // Recompute row height rather than inheriting the old SVG aspect ratio on resize.
  const rh = source.options.compact ? (width<500?62:48) : (width<500?76:66);
  const topPad = source.options.compact ? 26 : 34;
  const botPad = source.options.compact ? 26 : 35;
  const height=source.type==='horizontal'?topPad+source.rows.length*rh+botPad:Math.max(200,Math.round(svg.clientHeight||svgBounds.height));
  if (source.options.width===width&&source.options.height===height) return false;
  const holder=chart.ownerDocument.createElement('div');
  const options={...source.options,width,height,escape:escapeHtml};
  holder.innerHTML=renderChart(source,options);
  const next=holder.firstElementChild;
  if(!next||!next.hasAttribute('data-ana-chart')) return false;
  next.dataset.anaSource=chart.dataset.anaSource;
  const tools=chart.querySelector('.ana-chart-tools'),nextTools=next.querySelector('.ana-chart-tools');
  if(tools&&nextTools) nextTools.innerHTML=tools.innerHTML;
  const zoom=chart.querySelector('[data-ana-zoom]'),nextZoom=next.querySelector('[data-ana-zoom]');
  const selectedZoom=zoom&&nextZoom?[...nextZoom.options].find(option=>option.value===zoom.value):null;
  if(selectedZoom) selectedZoom.selected=true;
  chartResizeObserver?.unobserve(plot); settleChartMotion(chart);chartCleanup.get(chart)?.();chart.replaceWith(next);
  if(next.parentElement) bindAnalyticsCharts(next.parentElement);
  return true;
}

export function bindAnalyticsCharts(root = document) {
  bindMonthlyEquipmentHeatmaps(root);
  root.querySelectorAll('[data-ana-chart]').forEach(chart => {
    if (chart.dataset.anaBound) return;
    if (responsiveChart(chart)) return;
    chart.dataset.anaBound = 'true';
    const disposers=[];
    const on=(node,type,handler)=>{node.addEventListener(type,handler);disposers.push(()=>node.removeEventListener(type,handler));};
    chartCleanup.set(chart,()=>disposers.forEach(dispose=>dispose()));
    const values = JSON.parse(chart.dataset.anaValues), output = chart.querySelector('[data-ana-readout]'), plot = chart.querySelector('[data-ana-plot]'), tooltip = chart.querySelector('[data-ana-tooltip]'), unpin = chart.querySelector('[data-ana-unpin]');
    if (!plot || !tooltip || !unpin || !output) return;
    let pinned = false, selected = Math.max(0, values.length - 1);
    const show = index => {
      settleChartMotion(chart);
      selected = Math.max(0, Math.min(values.length - 1, Number(index)));
      const point = values[selected]; if (!point) return;
      tooltip.hidden = false;
      tooltip.classList.toggle('is-pinned', pinned);
      const svgWidth=Number(plot.querySelector('svg')?.getAttribute('viewBox')?.split(' ')[2])||1;
      const position = point.x / svgWidth * 100;
      const isHorizontal = chart.classList.contains('ana-horizontal-chart');
      const isRightHalf = !isHorizontal && position > 50;
      tooltip.dataset.side = isRightHalf ? 'left' : 'right';
      tooltip.style.left = isRightHalf ? '16px' : 'auto';
      tooltip.style.right = isRightHalf ? 'auto' : '16px';
      const visible = point.rows.filter(row => chart.querySelector(`[data-ana-toggle="${row.seriesIndex}"]`)?.getAttribute('aria-pressed') !== 'false');
      output.innerHTML = `<div class="ana-tip-head"><strong>${escapeHtml(point.label)}</strong>${pinned ? ' <span class="ana-tip-pin">Pinned</span>' : ''}</div><div class="ana-tip-rows">${visible.map(row => {
        const sub = `${row.label ?? ''}${row.spread ? ` · Historical spread: ${row.spread}` : ''}`;
        const redundant = !sub.trim() || ((row.label ?? '') === point.label && !row.spread);
        return `<span class="ana-tip-row"><span class="ana-tip-series"><i class="ana-tip-dot" style="background:${escapeHtml(row.color || '#337db5')}"></i>${escapeHtml(row.name)}</span> <b>${escapeHtml(row.value ?? row.text ?? '')}</b> <small class="${redundant ? 'is-redundant' : ''}">${escapeHtml(sub)}</small></span>`;
      }).join('') || (point.rows.length ? '<span class="ana-tip-empty">All series hidden. Select a legend to show it.</span>' : '<span class="ana-tip-empty">No completed observation for this period.</span>')}</div>`;
      const crosshair = chart.querySelector('[data-ana-crosshair]');
      if (crosshair) { crosshair.setAttribute('x1', point.x); crosshair.setAttribute('x2', point.x); crosshair.removeAttribute('hidden'); }
      chart.querySelectorAll('[data-ana-cursor-dot]').forEach(dot => {
        const row=visible.find(row=>String(row.seriesIndex)===dot.dataset.anaCursorDot);
        if(row) {dot.setAttribute('cx',row.x);dot.setAttribute('cy',row.y);dot.removeAttribute('hidden');}
        else dot.setAttribute('hidden','');
      });
      chart.querySelectorAll('[data-ana-point]').forEach(point => point.classList.toggle('is-inspected', Number(point.dataset.anaPoint) === selected));
    };
    const hide = () => {
      tooltip.hidden = true; unpin.hidden = true; pinned = false;
      tooltip.classList.remove('is-pinned');
      chart.querySelector('[data-ana-crosshair]')?.setAttribute('hidden', '');
      chart.querySelectorAll('[data-ana-cursor-dot]').forEach(dot=>dot.setAttribute('hidden',''));
      chart.querySelectorAll('.is-inspected').forEach(point => point.classList.remove('is-inspected'));
    };
    on(plot,'pointerleave', () => { if (!pinned) hide(); });
    on(plot,'focus', () => show(selected));
    on(plot,'focusout', event => { if (!pinned && !plot.contains(event.relatedTarget)) hide(); });
    on(plot,'keydown', event => {
      if (event.target !== plot) return;
      if (['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? values.length - 1 : selected + (['ArrowRight','ArrowDown'].includes(event.key) ? 1 : -1);
        show(next);
      }
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); pinned = !pinned; unpin.hidden = !pinned; show(selected); }
    });
    chart.querySelectorAll('[data-ana-point]').forEach(point => {
      on(point,'pointerdown', event => { if (event.pointerType === 'mouse') event.preventDefault(); });
      on(point,'pointerenter', () => { if (!pinned) show(point.dataset.anaPoint); });
      on(point,'focus', () => show(point.dataset.anaPoint));
      const pin = () => { const index = Number(point.dataset.anaPoint); if (pinned && selected === index) { hide(); return; } pinned = true; unpin.hidden = false; show(index); };
      on(point,'click', pin);
      on(point,'keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); pin(); }
        if (['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault(); const points = [...chart.querySelectorAll('[data-ana-point]')];
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? points.length - 1 : Math.max(0, Math.min(points.length - 1, Number(point.dataset.anaPoint) + (['ArrowRight','ArrowDown'].includes(event.key) ? 1 : -1)));
          points[next]?.focus();
        }
      });
    });
    unpin.onclick = () => { plot.focus(); hide(); };
    on(chart,'keydown', event => { if (event.key === 'Escape') { event.preventDefault(); hide(); } });
    chart.querySelectorAll('[data-ana-toggle]').forEach(button => button.onclick = () => {
      const visible = button.getAttribute('aria-pressed') !== 'true'; button.setAttribute('aria-pressed', String(visible));
      const seriesEl = chart.querySelector(`[data-ana-series="${button.dataset.anaToggle}"]`);
      if (seriesEl) seriesEl.style.display = visible ? '' : 'none';
      show(selected);
    });
    const zoom = chart.querySelector('[data-ana-zoom]');
    if (zoom) zoom.onchange = () => {
      const source = JSON.parse(chart.dataset.anaSource), count = Number(zoom.value);
      const parent = chart.parentElement, holder = chart.ownerDocument.createElement('div');
      holder.innerHTML = slicedChart(source,count);
      const replacement = holder.firstElementChild;
      if (!replacement) return;
      replacement.dataset.anaSource = chart.dataset.anaSource;
      // Keep the zoom control available even when the cropped range has <=14 points.
      const replacementTools = replacement.querySelector('.ana-chart-tools'), currentTools = chart.querySelector('.ana-chart-tools');
      if (replacementTools && currentTools) replacementTools.innerHTML = currentTools.innerHTML;
      const chartId = replacement.getAttribute('aria-labelledby');
      chartResizeObserver?.unobserve(plot); settleChartMotion(chart);chartCleanup.get(chart)?.();
      chart.replaceWith(replacement); bindAnalyticsCharts(parent);
      const activeChart = replacement.isConnected ? replacement : (chartId ? parent?.querySelector(`[aria-labelledby="${chartId}"]`) : null) || parent;
      const replacementZoom = activeChart?.querySelector('[data-ana-zoom]');
      const selectedZoom = replacementZoom ? [...replacementZoom.options].find(option => option.value === String(count)) : null;
      if (selectedZoom) selectedZoom.selected = true;
      replacementZoom?.focus();
    };
    activateChartMotion(chart);
    const view=chart.ownerDocument.defaultView;
    if(view?.ResizeObserver) {
      chartResizeObserver ||= new view.ResizeObserver(entries=>entries.forEach(entry=>{
        const figure=entry.target.closest('[data-ana-chart]');
        if(!figure?.isConnected) chartResizeObserver.unobserve(entry.target);
        else responsiveChart(figure);
      }));
      chartResizeObserver.observe(plot);
    }
  });

  root.querySelectorAll('[data-ana-donut]').forEach(donut => {
    if (donut.dataset.anaDonutBound) return;
    donut.dataset.anaDonutBound = 'true';
    const totalEl = donut.querySelector('[data-ana-donut-total]');
    const labelEl = donut.querySelector('[data-ana-donut-label]');
    const subEl = donut.querySelector('[data-ana-donut-sub]');
    const defaultTotal = donut.dataset.anaDonutDefaultTotal || donut.dataset.anaDefaultTotal || totalEl?.textContent || '';
    const defaultLabel = donut.dataset.anaDonutDefaultLabel || donut.dataset.anaDefaultLabel || labelEl?.textContent || '';
    let lockedSlice = null;

    const applySlice = sliceIndex => {
      const slices = [...donut.querySelectorAll('[data-ana-slice]')];
      if (sliceIndex == null) {
        slices.forEach(node => { node.classList.remove('is-active'); if (node.hasAttribute('aria-pressed')) node.setAttribute('aria-pressed', 'false'); });
        if (totalEl) totalEl.textContent = defaultTotal;
        if (labelEl) labelEl.textContent = defaultLabel;
        if (subEl) subEl.textContent = '';
        donut.classList.remove('has-selection');
        return;
      }
      const target = slices.find(node => node.dataset.anaSlice === String(sliceIndex));
      if (!target) return;
      slices.forEach(node => {
        const match = node.dataset.anaSlice === String(sliceIndex);
        node.classList.toggle('is-active', match);
        if (node.hasAttribute('aria-pressed')) node.setAttribute('aria-pressed', String(match));
      });
      donut.classList.add('has-selection');
      if (totalEl) totalEl.textContent = target.dataset.sliceTotal || defaultTotal;
      if (labelEl) labelEl.textContent = target.dataset.sliceLabel || defaultLabel;
      if (subEl) subEl.textContent = target.dataset.sliceShare ? `${target.dataset.sliceShare} share` : '';
    };

    donut.querySelectorAll('[data-ana-slice]').forEach(node => {
      const idx = node.dataset.anaSlice;
      node.addEventListener('pointerenter', () => { if (lockedSlice === null) applySlice(idx); });
      node.addEventListener('pointerleave', () => { if (lockedSlice === null) applySlice(null); });
      node.addEventListener('focus', () => applySlice(idx));
      node.addEventListener('blur', event => { if (lockedSlice === null && !donut.contains(event.relatedTarget)) applySlice(null); });
      node.addEventListener('click', () => {
        lockedSlice = lockedSlice === idx ? null : idx;
        applySlice(lockedSlice);
      });
      node.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          lockedSlice = lockedSlice === idx ? null : idx;
          applySlice(lockedSlice);
        } else if (event.key === 'Escape') {
          lockedSlice = null;
          applySlice(null);
        }
      });
    });
  });

  root.querySelectorAll('[data-ana-heatmap]').forEach(map => {
    if (map.dataset.anaHeatBound) return;
    map.dataset.anaHeatBound = 'true';
    const readout = map.querySelector('[data-ana-heat-readout]');
    const defaultText = map.dataset.anaHeatDefault || readout?.textContent || '';
    const peak = Math.max(1, Number(map.dataset.anaHeatPeak || 1));
    const showCell = cell => {
      map.querySelectorAll('[data-ana-heat-cell].is-active').forEach(el => el.classList.remove('is-active'));
      if (!cell || !readout) {
        if (readout) readout.textContent = defaultText;
        return;
      }
      cell.classList.add('is-active');
      const day = cell.dataset.day || '', band = cell.dataset.band || '', cnt = Number(cell.dataset.count || 0);
      const pct = Math.round((cnt / peak) * 100);
      readout.innerHTML = `<strong>${escapeHtml(day)} · ${escapeHtml(band)}:</strong> <span>${plain(cnt)} confirmed handoff${cnt === 1 ? '' : 's'} (${pct}% of peak window)</span>`;
    };
    map.querySelectorAll('[data-ana-heat-cell]').forEach(cell => {
      cell.addEventListener('pointerenter', () => showCell(cell));
      cell.addEventListener('focus', () => showCell(cell));
      cell.addEventListener('click', () => showCell(cell));
    });
    map.addEventListener('pointerleave', () => showCell(null));
    map.addEventListener('focusout', event => { if (!map.contains(event.relatedTarget)) showCell(null); });
  });

  animateAnalyticsKPIs(root);
}
