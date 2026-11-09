// Retain small geometry snapshots across report rerenders, never DOM nodes.
const snapshots = new Map();
const running = new WeakMap();
const pending = new WeakMap();
const generations = new WeakMap();
const SVG = 'http://www.w3.org/2000/svg';
const number = (node, name) => Number(node.getAttribute(name));
const reduced = view => Boolean(view?.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

export function settleChartMotion(chart) {
  pending.get(chart)?.disconnect(); pending.delete(chart);
  generations.set(chart,(generations.get(chart)||0)+1);
  running.get(chart)?.();
  chart.classList.remove('ana-motion-enter', 'ana-motion-morph');
}

function enter(chart, view) {
  settleChartMotion(chart);
  // A fresh layout makes Replay restart the reveal without changing the data.
  chart.getBoundingClientRect?.();
  chart.dataset.anaMotion = 'enter';
  const generation=generations.get(chart);
  view.requestAnimationFrame(() => { if (chart.isConnected&&generation===generations.get(chart)) chart.classList.add('ana-motion-enter'); });
}

function morph(chart, previous, next, view) {
  const svg = chart.querySelector('.ana-plot > svg'), paths = [], bars = [];
  const scaleX = next.width / previous.width, scaleY = next.height / previous.height;
  for (const target of next.paths) {
    const old = previous.paths.find(row => row.key === target.key);
    const node = chart.querySelector(`[data-ana-stroke="${target.key}"]`);
    if (!old || !node?.getTotalLength || !old.d || !target.d) continue;
    if(old.d===target.d&&scaleX===1&&scaleY===1) continue;
    const ghost = chart.ownerDocument.createElementNS(SVG, 'path');
    ghost.setAttribute('d', old.d); ghost.setAttribute('visibility', 'hidden'); svg.append(ghost);
    try {
      const oldLength = ghost.getTotalLength(), newLength = node.getTotalLength();
      const from = [], to = [];
      for (let i = 0; i <= 80; i++) {
        const a = ghost.getPointAtLength(oldLength * i / 80), b = node.getPointAtLength(newLength * i / 80);
        from.push([a.x * scaleX, a.y * scaleY]); to.push([b.x, b.y]);
      }
      paths.push({ node, target:target.d, from, to, area:chart.querySelector(`[data-ana-area="${target.key}"]`), bottom:target.bottom });
    } finally { ghost.remove(); }
  }
  for (const target of next.bars) {
    const old = previous.bars.find(row => row.key === target.key), node = chart.querySelector(`[data-ana-bar="${target.key}"]`);
    if (old && node) bars.push({ node, from:{y:old.y * scaleY, height:old.height * scaleY}, to:target });
  }
  if (!paths.length && !bars.length) { enter(chart, view); return; }
  chart.classList.add('ana-motion-morph'); chart.dataset.anaMotion = 'morph';
  const restore = () => {
    for (const row of paths) {
      row.node.setAttribute('d', row.target);
      if (row.area) row.area.setAttribute('d', row.target + ` L${row.to.at(-1)[0]},${row.bottom} L${row.to[0][0]},${row.bottom} Z`);
    }
    for (const row of bars) { row.node.setAttribute('y', row.to.y); row.node.setAttribute('height', row.to.height); }
    chart.classList.remove('ana-motion-morph');
  };
  let frame = 0, started = null;
  const stop = () => { view.cancelAnimationFrame(frame); restore(); running.delete(chart); };
  const draw = t => {
    for (const row of paths) {
      const points = row.to.map((point, i) => [row.from[i][0] + (point[0] - row.from[i][0]) * t, row.from[i][1] + (point[1] - row.from[i][1]) * t]);
      const d = points.map(([x,y],i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
      row.node.setAttribute('d',d);
      if (row.area) row.area.setAttribute('d',d + ` L${points.at(-1)[0]},${row.bottom} L${points[0][0]},${row.bottom} Z`);
    }
    for (const row of bars) { row.node.setAttribute('y',row.from.y+(row.to.y-row.from.y)*t); row.node.setAttribute('height',row.from.height+(row.to.height-row.from.height)*t); }
  };
  const tick = time => {
    if (!chart.isConnected) { stop(); return; }
    started ??= time;
    const progress = Math.min(1,(time-started)/650);
    draw(1-(1-progress)**3);
    if(progress<1) frame=view.requestAnimationFrame(tick);else stop();
  };
  draw(0);
  running.set(chart,stop); frame = view.requestAnimationFrame(tick);
}

function snapshot(chart) {
  const source = JSON.parse(chart.dataset.anaView || chart.dataset.anaSource || '{}');
  const svg = chart.querySelector('.ana-plot > svg');
  if (!svg || !source.options) return null;
  const [, , width, height] = svg.getAttribute('viewBox').split(' ').map(Number);
  return { key:source.options.id,width,height,presented:Boolean(chart.dataset.anaMotion),
    signature:JSON.stringify([source.type,source.labels,source.series,source.rows,source.options.currency,source.options.forecastStart]),
    paths:[...chart.querySelectorAll('[data-ana-stroke]')].map(node => ({key:node.dataset.anaStroke,d:node.getAttribute('d'),bottom:Number(node.dataset.anaBottom)})),
    bars:[...chart.querySelectorAll('[data-ana-bar]')].map(node => ({key:node.dataset.anaBar,y:number(node,'y'),height:number(node,'height')}))
  };
}

export function rememberChartMotion(chart) {
  const current=snapshot(chart);
  if(current) snapshots.set(current.key,current);
}

export function activateChartMotion(chart) {
  const view=chart.ownerDocument.defaultView,next=snapshot(chart);
  if(!next) return;
  const key=next.key,previous = snapshots.get(key);
  snapshots.set(key,next); if (snapshots.size > 24) snapshots.delete(snapshots.keys().next().value);
  const replay = chart.querySelector('[data-ana-replay]');
  if (!view?.requestAnimationFrame) return;
  const play = () => { if (!reduced(view)) enter(chart,view); };
  if (replay) replay.onclick = play;
  if (reduced(view)) { chart.dataset.anaMotion='reduced'; if (replay) replay.disabled=true; return; }
  if (previous?.presented && previous.signature === next.signature) { next.presented=true; chart.dataset.anaMotion='unchanged'; return; }
  const start = () => { if (!reduced(view)) { next.presented=true; previous?.presented ? morph(chart,previous,next,view) : enter(chart,view); } };
  if (view.IntersectionObserver) {
    const observer = new view.IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { observer.disconnect();pending.delete(chart); if (chart.isConnected) start(); }
      else if (!chart.isConnected) observer.disconnect();
    },{threshold:.15});
    pending.set(chart,observer);
    observer.observe(chart);
  } else start();
}
