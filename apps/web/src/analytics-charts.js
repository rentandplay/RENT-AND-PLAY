import { activateChartMotion, settleChartMotion, rememberChartMotion } from './analytics-chart-motion.js';
const finite = value => typeof value === 'number' && Number.isFinite(value);
const compact = value => new Intl.NumberFormat('en-PH', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
const plain = value => new Intl.NumberFormat('en-PH', { maximumFractionDigits: 2 }).format(value);

export function sparklineSvg(values = [], color = '#ee8534') {
  const clean = values.map(v => (finite(v) ? Math.max(0, v) : 0));
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
  return `<svg class="ana-sparkline" viewBox="0 0 ${w} ${h}" aria-hidden="true" focusable="false"><polygon points="${area}" fill="${color}" opacity=".14"/><polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${last[0]}" cy="${last[1]}" r="2.6" fill="${color}"/></svg>`;
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

export function lineChart(labels, series, { escape: e, id='analytics-line', title, currency = false, forecastStart = null, integerTicks = false, width=730, height=272, domainMax=null, handoff=null, reserveRangeNote=false, threshold=null } = {}) {
  if (!labels.length) return '<div class="ana-empty"><strong>No activity to chart yet</strong><p>Recorded activity will appear here when the selected period has data.</p></div>';
  const g=layout(width,height), {left,right,top,bottom}=g, span=right-left;
  const values=series.flatMap(row=>[...row.values,...(row.high||[])]).filter(finite);
  const scale=axisScale(Math.max(1,...values,domainMax||0),integerTicks);
  const x = i => roundCoordinate(labels.length===1 ? (left+right)/2 : left+i*span/(labels.length-1));
  const y = value => roundCoordinate(bottom-Math.max(0,value)/scale.maximum*(bottom-top));
  const grid=scale.ticks.map(value=>`<g><line x1="${left}" x2="${right}" y1="${y(value)}" y2="${y(value)}" class="ana-gridline"/><text x="${left-12}" y="${y(value)+4}" text-anchor="end" class="ana-axis-label">${currency?'₱':''}${compact(value)}</text></g>`).join('');
  const tickCount=Math.min(labels.length,Math.max(2,Math.min(6,Math.floor(span/75))));
  const ticks=[...new Set(Array.from({length:tickCount},(_,i)=>Math.round(i*(labels.length-1)/Math.max(1,tickCount-1))))];
  const tickLabels=ticks.map(i=>`<text x="${x(i)}" y="${height-14}" text-anchor="${i===0?'start':i===labels.length-1?'end':'middle'}" class="ana-axis-label">${e(labels[i])}</text>`).join('');
  const defs=`<defs>${series.map((row,i)=>`<linearGradient id="${id}-fill-${i}" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="${row.color}" stop-opacity=".26"/><stop offset="100%" stop-color="${row.color}" stop-opacity=".015"/></linearGradient>`).join('')}<linearGradient id="${id}-future" x1="0" x2="1"><stop stop-color="#ee8534" stop-opacity=".055"/><stop offset="1" stop-color="#ee8534" stop-opacity=".015"/></linearGradient></defs>`;
  const plots=series.map((row,seriesIndex)=>{
    const runs=[];let run=[];
    row.values.forEach((value,i)=>{if(finite(value))run.push({value,index:i});else if(run.length){runs.push(run);run=[];}});if(run.length)runs.push(run);
    const ink=runs.map((points,runIndex)=>{
      const coordinates=points.map(p=>[x(p.index),y(p.value)]),d=curve(coordinates),key=`${seriesIndex}-${runIndex}`;
      const band=row.low&&row.high ? `<path class="ana-variation-band" d="${curve(points.map(p=>[x(p.index),y(finite(row.high[p.index])?row.high[p.index]:p.value)]))} ${[...points].reverse().map(p=>`L${x(p.index)},${y(finite(row.low[p.index])?row.low[p.index]:p.value)}`).join(' ')} Z" fill="${row.color}"/>` : '';
      const area=row.area ? `<path data-ana-area="${key}" class="ana-area-fill" d="${d} L${coordinates.at(-1)[0]},${bottom} L${coordinates[0][0]},${bottom} Z" fill="url(#${id}-fill-${seriesIndex})"/>` : '';
      return `${band}${area}<path data-ana-stroke="${key}" data-ana-bottom="${bottom}" class="ana-line-stroke ${row.dashed?'is-estimate':''}" d="${d}" fill="none" stroke="${row.color}" stroke-width="2.7" ${row.dashed?'stroke-dasharray="5 5"':''} stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`;
    }).join('');
    const lastIndex=row.values.findLastIndex(finite);
    const dots=row.values.map((value,i)=>finite(value)&&(value!==0||labels.length===1)?`<circle cx="${x(i)}" cy="${y(value)}" r="${i===lastIndex?4:2.6}" fill="${row.color}" class="ana-chart-point ${i===lastIndex?'is-last':''}" aria-label="${e(row.name+', '+(row.labels?.[i]||labels[i])+': '+(currency?'PHP ':'')+plain(value))}"><title>${e(row.name)} · ${e(row.labels?.[i]||labels[i])}: ${currency?'₱':''}${plain(value)}</title></circle>`:'').join('');
    return `<g data-ana-series="${seriesIndex}" class="ana-series-ink" style="--ana-series-delay:${seriesIndex*110}ms">${ink}${dots}</g>`;
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
  const payload={type:'line',labels,series,options:{id,title,currency,forecastStart,integerTicks,width,height,domainMax,handoff,reserveRangeNote,threshold}};
  return `<figure class="ana-chart ana-interactive ana-modern-chart" data-ana-chart data-ana-values="${e(JSON.stringify(inspection))}" data-ana-source="${e(JSON.stringify(payload))}" data-ana-view="${e(JSON.stringify(payload))}" aria-labelledby="${id}-title">${chartTools(labels.length>14)}<div class="ana-plot" data-ana-plot tabindex="0" role="group" aria-label="${e(title)}. Use Left and Right arrows to explore, Enter to pin, Escape to dismiss."><svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${id}-title ${id}-description"><title id="${id}-title">${e(title)}</title><desc id="${id}-description">${e(series.map(row=>row.name).join(' and '))}. Focus the chart and use arrow keys to inspect exact values.</desc>${defs}${divider}${grid}${thresholdSvg}${handoffPath}${plots}${handoffLabel}${tickLabels}<line data-ana-crosshair x1="${left}" x2="${left}" y1="${top}" y2="${bottom}" class="ana-crosshair" hidden/>${series.map((row,i)=>`<circle data-ana-cursor-dot="${i}" r="5" fill="${row.color}" class="ana-cursor-dot" hidden/>`).join('')}${hits}</svg>${chartTooltip()}</div><figcaption class="ana-chart-legend">${series.map((row,i)=>`<button type="button" data-ana-toggle="${i}" aria-pressed="true" aria-label="Show ${e(row.name)}"><i style="--ana-series-color:${row.color};background:${row.color}" class="${row.dashed?'is-dashed':''}"></i>${e(row.name)}</button>`).join('')}${series.some(row=>row.low)?'<span class="ana-range-key">Shaded: historical variation (±1 standard deviation), not a confidence interval</span>':reserveRangeNote?'<span class="ana-range-key">No calibrated uncertainty interval is estimated for this model.</span>':''}</figcaption></figure>`;
}

export function barChart(rows, { escape:e,title,currency=false,color='#358d80',caption,id='performance-demand',width=730,height=262,threshold=null }={}) {
  const {left,right,top,bottom}=layout(width,height),column=(right-left)/Math.max(1,rows.length);
  const peak=Math.max(1,...rows.map(row=>finite(row.value)?row.value:0));
  const y=value=>roundCoordinate(bottom-value/peak*(bottom-top));
  const compactLabels=width<500&&rows.some(row=>row.label.length>4);
  const bars=rows.map((row,i)=>{
    const amount=finite(row.value)?Math.max(0,row.value):0,barHeight=amount/peak*(bottom-top),center=left+column*(i+.5),fill=row.color||color;
    const label=compactLabels?row.label.replaceAll(' AM','a').replaceAll(' PM','p'):row.label;
    const labelY=height-(compactLabels?25:14);
    return `<g data-ana-point="${i}" tabindex="0" role="button" class="ana-bar-column" style="--ana-bar-delay:${i*45}ms" aria-label="Inspect ${e(row.label)}: ${currency?'PHP ':''}${plain(amount)}"><rect x="${left+column*i}" y="${top}" width="${column}" height="${bottom-top}" fill="transparent"/><rect data-ana-bar="${i}" class="ana-animated-bar" x="${center-Math.min(24,column*.27)}" y="${bottom-barHeight}" width="${Math.min(48,column*.54)}" height="${Math.max(1,barHeight)}" rx="6" fill="url(#${id}-bar-${i})"><title>${e(row.label)}: ${currency?'₱':''}${plain(amount)}</title></rect><text x="${center}" y="${Math.max(20,bottom-barHeight-10)}" text-anchor="middle" class="ana-bar-value">${currency?'₱':''}${compact(amount)}</text><text x="${center}" y="${labelY}" text-anchor="${compactLabels?'end':'middle'}" ${compactLabels?`transform="rotate(-35 ${center} ${labelY})"`:''} class="ana-axis-label">${e(label.length>18?label.slice(0,16)+'…':label)}</text><defs><linearGradient id="${id}-bar-${i}" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${fill}" stop-opacity="${amount===peak?'1':'.9'}"/><stop offset="1" stop-color="${fill}" stop-opacity=".45"/></linearGradient></defs></g>`;
  }).join('');
  const total=rows.reduce((value,row)=>value+(finite(row.value)?Math.max(0,row.value):0),0);
  const inspection=rows.map((row,i)=>({label:row.label,x:left+column*(i+.5),rows:[{name:currency?'Recorded fees':'Rentals',value:`${currency?'₱':''}${plain(finite(row.value)?Math.max(0,row.value):0)}`,label:total?`${plain(Math.max(0,row.value||0)/total*100)}% of chart total`:'No activity'}]}));
  const thresholdSvg=threshold&&finite(threshold.value)&&threshold.value>0?`<g class="ana-threshold-group"><line x1="${left}" x2="${right}" y1="${y(threshold.value)}" y2="${y(threshold.value)}" class="ana-threshold-line"/><text x="${right-4}" y="${Math.max(top+12,y(threshold.value)-5)}" text-anchor="end" class="ana-threshold-label">${e(threshold.label||'Threshold')}: ${currency?'₱':''}${compact(threshold.value)}</text></g>`:'';
  const payload={type:'bar',rows,options:{id,title,currency,color,caption,width,height,threshold}};
  return `<figure class="ana-chart ana-interactive ana-modern-chart ana-modern-bars" data-ana-chart data-ana-values="${e(JSON.stringify(inspection))}" data-ana-source="${e(JSON.stringify(payload))}" data-ana-view="${e(JSON.stringify(payload))}">${chartTools(false)}<div class="ana-plot" data-ana-plot><svg viewBox="0 0 ${width} ${height}" role="group" aria-label="${e(title)}"><title>${e(title)}</title>${[0,.5,1].map(fraction=>`<line x1="${left}" x2="${right}" y1="${y(peak*fraction)}" y2="${y(peak*fraction)}" class="ana-gridline"/>`).join('')}${thresholdSvg}${bars}</svg>${chartTooltip()}</div><figcaption>${e(caption||(currency?'Recorded fees in Philippine pesos.':'Counts of confirmed rentals in the selected period.'))}</figcaption></figure>`;
}


function chartTooltip() {
  return '<div class="ana-tooltip" data-ana-tooltip hidden><output data-ana-readout aria-live="polite" aria-atomic="true"></output><button type="button" data-ana-unpin aria-label="Dismiss pinned chart value" hidden>Dismiss ×</button></div>';
}

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

const chartCleanup = new WeakMap();
let chartResizeObserver;

function slicedChart(source,count,dimensions={}) {
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
  if(source.type!=='line'||current.type!=='line') return false;
  const zoom=chart.querySelector('[data-ana-zoom]'),count=Number(zoom?.value||0);
  const holder=chart.ownerDocument.createElement('div');
  holder.innerHTML=slicedChart(source,count,{width:current.options.width,height:current.options.height});
  const rendered=holder.firstElementChild;
  rememberChartMotion(chart); settleChartMotion(chart); chartCleanup.get(chart)?.();
  const plot=chart.querySelector('[data-ana-plot]'),svg=plot.querySelector('svg'),nextSvg=rendered.querySelector('.ana-plot>svg');
  chartResizeObserver?.unobserve(plot);
  svg.innerHTML=nextSvg.innerHTML;
  for(const attr of nextSvg.attributes) svg.setAttribute(attr.name,attr.value);
  chart.querySelector('.ana-chart-legend').innerHTML=rendered.querySelector('.ana-chart-legend').innerHTML;
  chart.dataset.anaValues=rendered.dataset.anaValues;
  chart.dataset.anaSource=next.dataset.anaSource;
  chart.dataset.anaView=rendered.dataset.anaView;
  chart.querySelector('[data-ana-tooltip]').hidden=true;
  chart.querySelector('[data-ana-unpin]').hidden=true;
  delete chart.dataset.anaBound;
  bindAnalyticsCharts(chart.parentElement);
  return true;
}

function responsiveChart(chart) {
  const plot=chart.querySelector('[data-ana-plot]'),svg=plot.querySelector('svg');
  const bounds=plot.getBoundingClientRect?.(),svgBounds=svg.getBoundingClientRect?.();
  if (!(bounds?.width>0&&svgBounds?.height>0)) return false;
  const source=JSON.parse(chart.dataset.anaView||chart.dataset.anaSource);
  const width=Math.max(250,Math.round(plot.clientWidth||bounds.width)),height=Math.max(200,Math.round(svg.clientHeight||svgBounds.height));
  if (source.options.width===width&&source.options.height===height) return false;
  const holder=chart.ownerDocument.createElement('div');
  const options={...source.options,width,height,escape:escapeHtml};
  holder.innerHTML=source.type==='bar'?barChart(source.rows,options):lineChart(source.labels,source.series,options);
  const next=holder.firstElementChild;
  next.dataset.anaSource=chart.dataset.anaSource;
  next.querySelector('.ana-chart-tools').innerHTML=chart.querySelector('.ana-chart-tools').innerHTML;
  const zoom=chart.querySelector('[data-ana-zoom]'),nextZoom=next.querySelector('[data-ana-zoom]');
  if(zoom&&nextZoom) [...nextZoom.options].find(option=>option.value===zoom.value).selected=true;
  chartResizeObserver?.unobserve(plot); settleChartMotion(chart);chartCleanup.get(chart)?.();chart.replaceWith(next);
  bindAnalyticsCharts(next.parentElement);
  return true;
}

export function bindAnalyticsCharts(root = document) {
  root.querySelectorAll('[data-ana-chart]').forEach(chart => {
    if (chart.dataset.anaBound) return;
    if (responsiveChart(chart)) return;
    chart.dataset.anaBound = 'true';
    const disposers=[];
    const on=(node,type,handler)=>{node.addEventListener(type,handler);disposers.push(()=>node.removeEventListener(type,handler));};
    chartCleanup.set(chart,()=>disposers.forEach(dispose=>dispose()));
    const values = JSON.parse(chart.dataset.anaValues), output = chart.querySelector('[data-ana-readout]'), plot = chart.querySelector('[data-ana-plot]'), tooltip = chart.querySelector('[data-ana-tooltip]'), unpin = chart.querySelector('[data-ana-unpin]');
    let pinned = false, selected = Math.max(0, values.length - 1);
    const show = index => {
      settleChartMotion(chart);
      selected = Math.max(0, Math.min(values.length - 1, Number(index)));
      const point = values[selected]; if (!point) return;
      tooltip.hidden = false;
      const svgWidth=Number(plot.querySelector('svg').getAttribute('viewBox').split(' ')[2]);
      const position = point.x / svgWidth * 100;
      tooltip.style.left = `clamp(12px, calc(${position}% - 130px), max(12px, calc(100% - 272px)))`;
      const visible = point.rows.filter(row => chart.querySelector(`[data-ana-toggle="${row.seriesIndex}"]`)?.getAttribute('aria-pressed') !== 'false');
      output.innerHTML = `<strong>${escapeHtml(point.label)}</strong>${visible.map(row => `<span>${escapeHtml(row.name)} <b>${escapeHtml(row.value)}</b><small>${escapeHtml(row.label)}${row.spread ? ` · Historical spread: ${escapeHtml(row.spread)}` : ''}</small></span>`).join('') || (point.rows.length ? '<span>All series hidden. Select a legend to show it.</span>' : '<span>No completed observation for this period.</span>')}`;
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
      chart.querySelector('[data-ana-crosshair]')?.setAttribute('hidden', '');
      chart.querySelectorAll('[data-ana-cursor-dot]').forEach(dot=>dot.setAttribute('hidden',''));
      chart.querySelectorAll('.is-inspected').forEach(point => point.classList.remove('is-inspected'));
    };
    on(plot,'pointerleave', () => { if (!pinned) hide(); });
    on(plot,'focus', () => show(selected));
    on(plot,'focusout', event => { if (!pinned && !plot.contains(event.relatedTarget)) hide(); });
    on(plot,'keydown', event => {
      if (event.target !== plot) return;
      if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? values.length - 1 : selected + (event.key === 'ArrowRight' ? 1 : -1);
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
        if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) {
          event.preventDefault(); const points = [...chart.querySelectorAll('[data-ana-point]')];
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? points.length - 1 : Math.max(0, Math.min(points.length - 1, Number(point.dataset.anaPoint) + (event.key === 'ArrowRight' ? 1 : -1)));
          points[next]?.focus();
        }
      });
    });
    unpin.onclick = () => { plot.focus(); hide(); };
    on(chart,'keydown', event => { if (event.key === 'Escape') { event.preventDefault(); hide(); } });
    chart.querySelectorAll('[data-ana-toggle]').forEach(button => button.onclick = () => {
      const visible = button.getAttribute('aria-pressed') !== 'true'; button.setAttribute('aria-pressed', String(visible));
      chart.querySelector(`[data-ana-series="${button.dataset.anaToggle}"]`).style.display = visible ? '' : 'none'; show(selected);
    });
    const zoom = chart.querySelector('[data-ana-zoom]');
    if (zoom) zoom.onchange = () => {
      const source = JSON.parse(chart.dataset.anaSource), count = Number(zoom.value);
      const parent = chart.parentElement, holder = chart.ownerDocument.createElement('div');
      holder.innerHTML = slicedChart(source,count);
      const replacement = holder.firstElementChild;
      replacement.dataset.anaSource = chart.dataset.anaSource;
      // Keep the zoom control available even when the cropped range has <=14 points.
      replacement.querySelector('.ana-chart-tools').innerHTML = chart.querySelector('.ana-chart-tools').innerHTML;
      chartResizeObserver?.unobserve(plot); settleChartMotion(chart);chartCleanup.get(chart)?.();
      chart.replaceWith(replacement); bindAnalyticsCharts(parent);
      const replacementZoom = parent.querySelector('[data-ana-zoom]');
      [...replacementZoom.options].find(option => option.value === String(count)).selected = true; replacementZoom.focus();
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
}
