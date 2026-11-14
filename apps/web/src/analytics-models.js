import { manilaDateKey, recordDate } from './analytics.js';

const roundCents = value => Math.round((Number(value) || 0) * 100) / 100;
const round = (value, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
};
const finite = value => typeof value === 'number' && Number.isFinite(value);

const CONFIRMED_STATUSES = new Set(['ACTIVE', 'COMPLETED', 'RETURN_PENDING_INSPECTION']);

function stockGroupKey(item = {}, fallbackId = '') {
  return item.stock_group_id || item.stockGroupId || item.id || fallbackId;
}

function manilaHour(value) {
  const date = recordDate(value);
  if (!date) return null;
  const shifted = new Date(date.getTime() + 8 * 3600000);
  return shifted.getUTCHours();
}

function isDeliveryMode(mode) {
  const norm = String(mode || '').trim().toUpperCase();
  return norm === 'DELIVERY' || norm === 'RESORT_DELIVERY';
}

function normalizePaymentMethod(method) {
  const norm = String(method || '').trim().toUpperCase();
  if (!norm) return 'OTHER';
  if (norm === 'CASH') return 'CASH';
  if (norm.includes('QR') || norm.includes('GCASH') || norm.includes('MAYA') || norm.includes('BANK') || norm.includes('ONLINE') || norm.includes('E_WALLET')) return 'QR';
  return 'OTHER';
}

function billingKindLabel(row) {
  const kind = String(row?.fee_breakdown?.package_kind || row?.package_kind || '').trim().toUpperCase();
  if (kind === 'WHOLE_STAY') return 'Whole stay';
  if (kind === 'PACKAGE') return 'Package';
  if (kind === 'HOURLY') return 'Hourly';
  return 'Standard / Other';
}

/** Pareto 80-20 analysis (BA Mod 10.4.2) ranked descending with cumulative percentages and ABC tiers. */
export function buildParetoAnalysis(rows = [], metricKey = 'fees') {
  const key = metricKey === 'rentals' ? 'rentals' : 'fees';
  const valid = (Array.isArray(rows) ? rows : [])
    .map(row => ({
      id: row.id,
      name: String(row.name || 'Equipment'),
      value: finite(row[key]) && row[key] >= 0 ? row[key] : 0,
      rentals: finite(row.rentals) ? row.rentals : 0,
      fees: finite(row.fees) ? row.fees : 0,
      utilization: finite(row.utilization) ? row.utilization : null
    }))
    .filter(row => row.value > 0)
    .sort((a, b) => (b.value - a.value) || a.name.localeCompare(b.name));

  const total = roundCents(valid.reduce((sum, row) => sum + row.value, 0));
  if (!valid.length || total <= 0) {
    return { available: false, metricKey: key, total: 0, vitalCount: 0, vitalShare: 0, rows: [] };
  }

  let running = 0;
  let vitalCount = 0;
  let vitalSum = 0;
  const enriched = valid.map((row, index) => {
    const prevCumulative = running / total;
    running += row.value;
    const share = row.value / total;
    const cumulative = Math.min(1, running / total);
    const tier = index === 0 || prevCumulative < 0.8 ? 'Vital 80%' : prevCumulative < 0.95 ? 'Next 15%' : 'Bottom 5%';
    if (tier === 'Vital 80%') {
      vitalCount++;
      vitalSum += row.value;
    }
    return { ...row, rank: index + 1, share, cumulative, tier };
  });

  return {
    available: true,
    metricKey: key,
    total,
    vitalCount,
    vitalShare: vitalSum / total,
    rows: enriched
  };
}

/** Waterfall Cash / Revenue Bridge (BA Mod 9 Slide 23) from finance ledger or filtered rental totals. */
export function buildWaterfallAnalysis({ financeSummary = null, confirmed = [], scopeFiltered = false } = {}) {
  const ledgerTotals = financeSummary?.totals;
  const rentalTotals = financeSummary?.rental_totals;
  const hasLedger = !scopeFiltered && ledgerTotals && (
    (finite(ledgerTotals.collections) && ledgerTotals.collections > 0) ||
    (finite(ledgerTotals.refunds) && ledgerTotals.refunds > 0) ||
    (finite(ledgerTotals.expenses) && ledgerTotals.expenses > 0)
  );

  if (hasLedger) {
    const collections = roundCents(ledgerTotals.collections || 0);
    const cashCollections = roundCents(ledgerTotals.cash_collections || 0);
    const qrCollections = roundCents(ledgerTotals.qr_collections || 0);
    const refunds = roundCents(ledgerTotals.refunds || 0);
    const expenses = roundCents(ledgerTotals.expenses || 0);
    const netAfterExpenses = roundCents(ledgerTotals.net_after_expenses ?? (collections - refunds - expenses));
    const afterRefunds = roundCents(collections - refunds);

    const steps = [
      { label: 'Gross collections', kind: 'start', amount: collections, start: 0, end: collections, detail: `Cash + QR collected` },
      { label: 'Less: Refunds', kind: 'minus', amount: -refunds, start: collections, end: afterRefunds, detail: 'Security & fee refunds' },
      { label: 'Less: Expenses', kind: 'minus', amount: -expenses, start: afterRefunds, end: netAfterExpenses, detail: 'Recorded shop expenses' },
      { label: 'Net cash balance', kind: 'total', amount: netAfterExpenses, start: 0, end: netAfterExpenses, detail: 'Collections minus refunds & expenses' }
    ];

    return {
      available: true,
      source: 'ledger',
      title: 'Revenue to net cash bridge',
      steps,
      summary: {
        collections,
        cashCollections,
        qrCollections,
        refunds,
        expenses,
        netCollected: roundCents(ledgerTotals.net_collected ?? afterRefunds),
        netAfterExpenses,
        charges: finite(rentalTotals?.charges) ? roundCents(rentalTotals.charges) : null,
        balanceDue: finite(rentalTotals?.balance_due) ? roundCents(rentalTotals.balance_due) : null
      }
    };
  }

  let totalFees = 0;
  let deliveryFees = 0;
  let counterFees = 0;
  let addonFees = 0;
  let openBalance = 0;
  let hasAddons = false;

  for (const row of confirmed) {
    const fee = finite(row.rental_fee) && row.rental_fee >= 0 ? row.rental_fee : 0;
    totalFees += fee;
    if (isDeliveryMode(row.fulfillment_mode)) deliveryFees += fee;
    else counterFees += fee;

    const fb = row.fee_breakdown || {};
    const extra = (finite(fb.delivery_fee) ? fb.delivery_fee : 0) +
      (finite(fb.overtime_fee) ? fb.overtime_fee : 0) +
      (finite(fb.extension_fee) ? fb.extension_fee : 0) +
      (finite(fb.damage_fee) ? fb.damage_fee : 0);
    if (extra > 0) {
      hasAddons = true;
      addonFees += Math.min(fee, extra);
    }
    if (finite(row.balance_due) && row.balance_due > 0) {
      openBalance += Math.min(fee, row.balance_due);
    }
  }

  totalFees = roundCents(totalFees);
  if (totalFees <= 0) {
    return { available: false, source: 'rentals', title: 'Confirmed fee bridge', steps: [], summary: null };
  }

  deliveryFees = roundCents(deliveryFees);
  counterFees = roundCents(counterFees);
  openBalance = roundCents(Math.min(totalFees, openBalance));

  let steps;
  if (hasAddons || openBalance > 0) {
    const baseFees = roundCents(Math.max(0, totalFees - addonFees));
    const collectedEst = roundCents(Math.max(0, totalFees - openBalance));
    steps = [
      { label: 'Base rental fees', kind: 'start', amount: baseFees, start: 0, end: baseFees, detail: 'Confirmed base rate charges' },
      { label: 'Add-on & late fees', kind: 'plus', amount: roundCents(addonFees), start: baseFees, end: totalFees, detail: 'Delivery, extension, overtime' },
      { label: 'Less: Open balance', kind: 'minus', amount: -openBalance, start: totalFees, end: collectedEst, detail: 'Unpaid balance on record' },
      { label: 'Collected rental fees', kind: 'total', amount: collectedEst, start: 0, end: collectedEst, detail: 'Confirmed fees less unpaid balance' }
    ];
  } else {
    steps = [
      { label: 'Shop counter fees', kind: 'start', amount: counterFees, start: 0, end: counterFees, detail: 'Confirmed walk-in & pickup fees' },
      { label: 'Resort delivery fees', kind: 'plus', amount: deliveryFees, start: counterFees, end: totalFees, detail: 'Confirmed resort delivery fees' },
      { label: 'Confirmed rental fees', kind: 'total', amount: totalFees, start: 0, end: totalFees, detail: 'Total confirmed rental revenue' }
    ];
  }

  return {
    available: true,
    source: 'rentals',
    title: hasAddons || openBalance > 0 ? 'Confirmed charges to collected fees bridge' : 'Revenue composition bridge',
    steps,
    summary: {
      totalFees,
      counterFees,
      deliveryFees,
      openBalance,
      collectedEst: roundCents(totalFees - openBalance)
    }
  };
}

/** Stacked trend data across Manila buckets for Channel (Delivery vs Counter) and Payment Method (Cash vs QR). */
export function buildChannelAndPaymentTrends(trend = [], confirmed = []) {
  const buckets = (Array.isArray(trend) ? trend : []).map(bucket => ({
    label: bucket.label,
    from: bucket.from,
    to: bucket.to,
    delivery: 0,
    counter: 0,
    deliveryFees: 0,
    counterFees: 0,
    cash: 0,
    qr: 0,
    other: 0,
    cashFees: 0,
    qrFees: 0
  }));

  for (const row of confirmed) {
    const day = manilaDateKey(row.confirmed_rental_at);
    if (!day) continue;
    const target = buckets.find(b => day >= b.from && day <= b.to);
    if (!target) continue;
    const fee = finite(row.rental_fee) && row.rental_fee >= 0 ? row.rental_fee : 0;
    if (isDeliveryMode(row.fulfillment_mode)) {
      target.delivery++;
      target.deliveryFees = roundCents(target.deliveryFees + fee);
    } else {
      target.counter++;
      target.counterFees = roundCents(target.counterFees + fee);
    }
    const pay = normalizePaymentMethod(row.payment_method);
    if (pay === 'CASH') {
      target.cash++;
      target.cashFees = roundCents(target.cashFees + fee);
    } else if (pay === 'QR') {
      target.qr++;
      target.qrFees = roundCents(target.qrFees + fee);
    } else {
      target.other++;
    }
  }

  const totals = buckets.reduce((acc, b) => ({
    delivery: acc.delivery + b.delivery,
    counter: acc.counter + b.counter,
    deliveryFees: roundCents(acc.deliveryFees + b.deliveryFees),
    counterFees: roundCents(acc.counterFees + b.counterFees),
    cash: acc.cash + b.cash,
    qr: acc.qr + b.qr,
    other: acc.other + b.other,
    cashFees: roundCents(acc.cashFees + b.cashFees),
    qrFees: roundCents(acc.qrFees + b.qrFees)
  }), { delivery: 0, counter: 0, deliveryFees: 0, counterFees: 0, cash: 0, qr: 0, other: 0, cashFees: 0, qrFees: 0 });

  return {
    buckets,
    totals: { ...totals, total: totals.delivery + totals.counter },
    hasPaymentMethodSplit: totals.cash + totals.qr > 0
  };
}

/** Histogram bins + Mean, Median, Mode, Standard Deviation (Modeling Mod 2 p. 10). */
export function computeHistogramStats(samples = [], binSpecs = []) {
  const clean = (Array.isArray(samples) ? samples : []).filter(v => finite(v) && v >= 0).sort((a, b) => a - b);
  const counts = binSpecs.map(spec => ({ ...spec, count: 0, share: 0 }));
  const n = clean.length;

  if (!n) {
    return { available: false, count: 0, bins: counts, mean: null, median: null, modeBin: null, stdDev: null, min: null, max: null };
  }

  for (const value of clean) {
    const match = counts.find(bin => value >= bin.min && (bin.max === Infinity ? true : value < bin.max));
    if (match) match.count++;
  }
  for (const bin of counts) bin.share = bin.count / n;

  const mean = clean.reduce((sum, v) => sum + v, 0) / n;
  const median = n % 2 ? clean[(n - 1) / 2] : (clean[n / 2 - 1] + clean[n / 2]) / 2;
  const variance = n > 1 ? clean.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (n - 1) : 0;
  const stdDev = Math.sqrt(variance);
  const modeBin = [...counts].sort((a, b) => b.count - a.count)[0];

  return {
    available: true,
    count: n,
    bins: counts,
    mean: round(mean, 2),
    median: round(median, 2),
    modeBin: modeBin && modeBin.count > 0 ? { label: modeBin.label, count: modeBin.count } : null,
    stdDev: round(stdDev, 2),
    min: round(clean[0], 2),
    max: round(clean[n - 1], 2)
  };
}

export const DURATION_BINS = [
  { label: '0–2 hrs', min: 0, max: 2 },
  { label: '2–4 hrs', min: 2, max: 4 },
  { label: '4–8 hrs', min: 4, max: 8 },
  { label: '8–24 hrs', min: 8, max: 24 },
  { label: '24+ hrs', min: 24, max: Infinity }
];

export const VERIFICATION_SPEED_BINS = [
  { label: '0–15 sec', min: 0, max: 15 },
  { label: '15–30 sec', min: 15, max: 30 },
  { label: '30–60 sec', min: 30, max: 60 },
  { label: '60–120 sec', min: 60, max: 120 },
  { label: '120+ sec', min: 120, max: Infinity }
];

/** Category x Channel interactive pivot matrix + Billing kind breakdown (BA Mod 9.2.10 & Mod 10.4.6). */
export function buildCategoryChannelPivot(confirmed = [], items = [], categories = []) {
  const itemMap = new Map((items || []).map(item => [item.id, item]));
  const catName = new Map((categories || []).map(cat => [cat.id, cat.name || 'Category']));
  const rowsMap = new Map();
  const billingMap = new Map(['Hourly', 'Package', 'Whole stay', 'Standard / Other'].map(label => [label, { label, rentals: 0, fees: 0 }]));
  let totalRentals = 0;
  let totalFees = 0;
  let hasExplicitBilling = false;

  const ensureRow = name => {
    if (!rowsMap.has(name)) {
      rowsMap.set(name, {
        category: name,
        counter: { rentals: 0, fees: 0 },
        delivery: { rentals: 0, fees: 0 },
        total: { rentals: 0, fees: 0 }
      });
    }
    return rowsMap.get(name);
  };

  for (const cat of categories || []) {
    if (cat?.name) ensureRow(cat.name);
  }

  for (const row of confirmed) {
    const item = itemMap.get(row.item_id);
    const category = catName.get(item?.category_id) || 'Other equipment';
    const entry = ensureRow(category);
    const fee = finite(row.rental_fee) && row.rental_fee >= 0 ? row.rental_fee : 0;
    const cell = isDeliveryMode(row.fulfillment_mode) ? entry.delivery : entry.counter;

    cell.rentals++;
    cell.fees = roundCents(cell.fees + fee);
    entry.total.rentals++;
    entry.total.fees = roundCents(entry.total.fees + fee);
    totalRentals++;
    totalFees = roundCents(totalFees + fee);

    const bLabel = billingKindLabel(row);
    if (bLabel !== 'Standard / Other') hasExplicitBilling = true;
    const bCell = billingMap.get(bLabel);
    bCell.rentals++;
    bCell.fees = roundCents(bCell.fees + fee);
  }

  const decorate = cell => ({
    rentals: cell.rentals,
    fees: roundCents(cell.fees),
    avgFee: cell.rentals > 0 ? roundCents(cell.fees / cell.rentals) : null,
    feeShare: totalFees > 0 ? cell.fees / totalFees : null,
    rentalShare: totalRentals > 0 ? cell.rentals / totalRentals : null
  });

  const rows = [...rowsMap.values()]
    .filter(r => r.total.rentals > 0)
    .map(r => ({
      category: r.category,
      counter: decorate(r.counter),
      delivery: decorate(r.delivery),
      total: decorate(r.total)
    }))
    .sort((a, b) => (b.total.fees - a.total.fees) || (b.total.rentals - a.total.rentals) || a.category.localeCompare(b.category));

  const colTotals = rows.reduce((acc, r) => ({
    counterRentals: acc.counterRentals + r.counter.rentals,
    counterFees: roundCents(acc.counterFees + r.counter.fees),
    deliveryRentals: acc.deliveryRentals + r.delivery.rentals,
    deliveryFees: roundCents(acc.deliveryFees + r.delivery.fees)
  }), { counterRentals: 0, counterFees: 0, deliveryRentals: 0, deliveryFees: 0 });

  return {
    available: totalRentals > 0,
    rows,
    totals: {
      counter: decorate({ rentals: colTotals.counterRentals, fees: colTotals.counterFees }),
      delivery: decorate({ rentals: colTotals.deliveryRentals, fees: colTotals.deliveryFees }),
      total: decorate({ rentals: totalRentals, fees: totalFees })
    },
    hasExplicitBilling,
    billingBreakdown: [...billingMap.values()]
      .filter(b => b.rentals > 0)
      .map(b => ({ ...b, share: totalRentals > 0 ? b.rentals / totalRentals : 0 }))
  };
}

/** Simple keyword text mining across maintenance details & inspection notes (BA Mod 1.5 & 5). */
export function buildMaintenanceTextMining(maintenance = [], range = null) {
  const themes = [
    { key: 'damage', label: 'Damage, crack or tear', pattern: /\b(damage|damaged|crack|cracked|broken|tear|torn|dent|scratch|split|snap)\b/i },
    { key: 'parts', label: 'Missing or loose part', pattern: /\b(missing|lost|loose|screw|bolt|strap|cap|parts?|handle|zip|buckle)\b/i },
    { key: 'wear', label: 'Wear, wheel or surface', pattern: /\b(wear|worn|flat|tire|wheel|deflate|puncture|grip|peel|rust|string|net)\b/i },
    { key: 'electronics', label: 'Battery, controller or port', pattern: /\b(battery|charge|charging|controller|button|joystick|stick|drift|port|screen|power|cable)\b/i },
    { key: 'cleaning', label: 'Cleaning or water care', pattern: /\b(clean|cleaning|dirty|stain|sanitize|wash|wet|mud|sand|dry)\b/i },
    { key: 'routine', label: 'Routine check or service', pattern: /\b(routine|inspect|inspection|check|periodic|tune|calibrate|maintenance)\b/i }
  ];

  const filtered = (Array.isArray(maintenance) ? maintenance : []).filter(record => {
    if (!range?.from || !range?.to) return true;
    const day = manilaDateKey(record.started_at || record.created_at);
    return day && day >= range.from && day <= range.to;
  });

  const counts = new Map(themes.map(t => [t.label, 0]));
  let otherCount = 0;
  let recordsWithNotes = 0;

  for (const record of filtered) {
    const text = [record.issue_type, record.details, record.inspection_notes, record.notes]
      .filter(v => typeof v === 'string' && v.trim())
      .join(' ');
    if (!text) continue;
    recordsWithNotes++;
    let matched = false;
    for (const theme of themes) {
      if (theme.pattern.test(text)) {
        counts.set(theme.label, (counts.get(theme.label) || 0) + 1);
        matched = true;
      }
    }
    if (!matched) otherCount++;
  }

  const rows = [...counts.entries()]
    .filter(([, count]) => count > 0)
    .map(([label, count]) => ({ label, value: count, share: recordsWithNotes > 0 ? count / recordsWithNotes : 0 }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));

  if (otherCount > 0) {
    rows.push({ label: 'Other logged issue', value: otherCount, share: recordsWithNotes > 0 ? otherCount / recordsWithNotes : 0 });
  }

  return {
    available: rows.length > 0,
    totalLogs: filtered.length,
    recordsWithNotes,
    rows
  };
}

function fitLinearRegression(values = []) {
  const pts = values.map((y, x) => ({ x, y })).filter(p => finite(p.y));
  const n = pts.length;
  if (n < 2) return { slope: 0, intercept: pts[0]?.y ?? 0, r2: null };
  const meanX = pts.reduce((s, p) => s + p.x, 0) / n;
  const meanY = pts.reduce((s, p) => s + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of pts) {
    num += (p.x - meanX) * (p.y - meanY);
    den += (p.x - meanX) ** 2;
  }
  const slope = den > 0 ? num / den : 0;
  const intercept = meanY - slope * meanX;
  const ssTot = pts.reduce((s, p) => s + (p.y - meanY) ** 2, 0);
  const ssRes = pts.reduce((s, p) => s + (p.y - (intercept + slope * p.x)) ** 2, 0);
  const r2 = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : null;
  return { slope, intercept, r2 };
}

function predictExponentialSmoothing(history = [], horizonCount = 1, alpha = 0.35, currency = false) {
  const clean = history.filter(finite);
  if (!clean.length) return [];
  let level = clean[0];
  for (let i = 1; i < clean.length; i++) {
    level = alpha * clean[i] + (1 - alpha) * level;
  }
  const value = Math.max(0, currency ? roundCents(level) : round(level, 1));
  return Array.from({ length: horizonCount }, () => value);
}

function predictLinearRegression(history = [], horizonCount = 1, currency = false) {
  const { slope, intercept } = fitLinearRegression(history);
  const n = history.length;
  return Array.from({ length: horizonCount }, (_, step) => {
    const raw = Math.max(0, intercept + slope * (n + step));
    return currency ? roundCents(raw) : round(raw, 1);
  });
}

function evaluateWalkForwardMae(history = [], baselinePredictor, groupBy) {
  const clean = history.map(v => (finite(v) ? v : 0));
  const minWindow = groupBy === 'daily' ? 14 : 6;
  if (clean.length < minWindow + 3) {
    return { ready: false, samples: 0, ma: null, ses: null, linear: null };
  }
  const start = Math.max(minWindow, clean.length - (groupBy === 'daily' ? 14 : 6));
  let maErr = 0;
  let sesErr = 0;
  let linErr = 0;
  let count = 0;

  for (let idx = start; idx < clean.length; idx++) {
    const train = clean.slice(0, idx);
    const actual = clean[idx];
    const maPred = baselinePredictor(train, idx);
    const sesPred = predictExponentialSmoothing(train, 1, 0.35, true)[0];
    const linPred = predictLinearRegression(train, 1, true)[0];
    maErr += Math.abs(actual - maPred);
    sesErr += Math.abs(actual - sesPred);
    linErr += Math.abs(actual - linPred);
    count++;
  }

  return {
    ready: count > 0,
    samples: count,
    ma: count > 0 ? roundCents(maErr / count) : null,
    ses: count > 0 ? roundCents(sesErr / count) : null,
    linear: count > 0 ? roundCents(linErr / count) : null
  };
}

/**
 * Three client-friendly forecast models + walk-forward error & Model Drift watch
 * (Modeling Mod 3, 5, 6, 8, 10). Never alters existing Moving Average numbers.
 */
export function buildForecastComparison(analyticsResult = {}) {
  const forecast = analyticsResult.forecast || {};
  const trend = analyticsResult.trend || [];
  const groupBy = analyticsResult.groupBy || 'daily';
  const points = Array.isArray(forecast.points) ? forecast.points : [];
  const completedBuckets = Array.isArray(forecast.history) && forecast.history.length
    ? forecast.history
    : trend.filter(b => !b.incomplete);

  if (!forecast.available || !points.length) {
    return {
      ready: false,
      groupBy,
      models: [],
      lowestErrorRentalKey: null,
      lowestErrorFeeKey: null,
      driftAlert: { detected: false, direction: 'steady', percentShift: 0, message: '' },
      horizonLabels: [],
      slope: { rentals: 0, fees: 0 }
    };
  }

  const rentalHist = completedBuckets.map(b => (finite(b.rentals) ? b.rentals : 0));
  const feeHist = completedBuckets.map(b => (finite(b.fees) ? b.fees : 0));

  const maRentals = points.map(p => p.rentals);
  const maFees = points.map(p => p.fees);
  const sesRentals = predictExponentialSmoothing(rentalHist, points.length, 0.35, false);
  const sesFees = predictExponentialSmoothing(feeHist, points.length, 0.35, true);
  const linRentals = predictLinearRegression(rentalHist, points.length, false);
  const linFees = predictLinearRegression(feeHist, points.length, true);
  const rentalReg = fitLinearRegression(rentalHist);
  const feeReg = fitLinearRegression(feeHist);

  // Moving average predictor aligned with analytics.js semantics for honest holdout comparison.
  const maPredictor = (arr, endIdx, isFee) => {
    if (groupBy === 'daily') {
      const sameWeekday = [];
      for (let back = 7; back <= 28 && endIdx - back >= 0; back += 7) {
        sameWeekday.push(arr[endIdx - back]);
      }
      if (!sameWeekday.length) return arr.at(-1) ?? 0;
      const avg = sameWeekday.reduce((s, v) => s + v, 0) / sameWeekday.length;
      return isFee ? roundCents(avg) : round(avg, 1);
    }
    const lookback = groupBy === 'weekly' ? 8 : 8;
    const slice = arr.slice(-lookback);
    const avg = slice.reduce((s, v) => s + v, 0) / Math.max(1, slice.length);
    return isFee ? roundCents(avg) : round(avg, 1);
  };

  const wfRentals = evaluateWalkForwardMae(rentalHist, (t, i) => maPredictor(t, i, false), groupBy);
  const wfFees = evaluateWalkForwardMae(feeHist, (t, i) => maPredictor(t, i, true), groupBy);

  const models = [
    {
      key: 'ma',
      name: 'Same-weekday moving average',
      shortName: 'Moving average',
      description: 'Averages matching past days/weeks so regular weekend peaks repeat cleanly.',
      rentals: maRentals,
      fees: maFees,
      totalRentals: round(maRentals.reduce((s, v) => s + v, 0), 1),
      totalFees: roundCents(maFees.reduce((s, v) => s + v, 0)),
      maeRentals: wfRentals.ma,
      maeFees: wfFees.ma
    },
    {
      key: 'ses',
      name: 'Exponential Smoothing',
      shortName: 'Exponential smoothing',
      description: 'Gives higher weight to recent completed days while softening sudden one-day spikes.',
      rentals: sesRentals,
      fees: sesFees,
      totalRentals: round(sesRentals.reduce((s, v) => s + v, 0), 1),
      totalFees: roundCents(sesFees.reduce((s, v) => s + v, 0)),
      maeRentals: wfRentals.ses,
      maeFees: wfFees.ses
    },
    {
      key: 'linear',
      name: 'Linear Regression Trend',
      shortName: 'Linear trend',
      description: 'Fits a straight upward or downward pace line across completed periods.',
      rentals: linRentals,
      fees: linFees,
      totalRentals: round(linRentals.reduce((s, v) => s + v, 0), 1),
      totalFees: roundCents(linFees.reduce((s, v) => s + v, 0)),
      maeRentals: wfRentals.linear,
      maeFees: wfFees.linear,
      slopeRentals: round(rentalReg.slope, 2),
      slopeFees: roundCents(feeReg.slope),
      r2Fees: feeReg.r2 !== null ? round(feeReg.r2, 2) : null
    }
  ];

  const pickLowest = metricField => {
    const scored = models.filter(m => finite(m[metricField]));
    if (!scored.length) return null;
    return [...scored].sort((a, b) => a[metricField] - b[metricField])[0].key;
  };

  // Model Drift check (Modeling Mod 10): compare recent completed tail vs earlier completed periods.
  let driftAlert = { detected: false, direction: 'steady', percentShift: 0, message: 'No unusual shift between earlier history and recent completed periods.' };
  const driftWindow = groupBy === 'daily' ? 7 : 3;
  if (rentalHist.length >= driftWindow * 2) {
    const recentR = rentalHist.slice(-driftWindow);
    const earlierR = rentalHist.slice(0, -driftWindow);
    const recentMean = recentR.reduce((s, v) => s + v, 0) / recentR.length;
    const baseMean = earlierR.reduce((s, v) => s + v, 0) / earlierR.length;
    const absDiff = Math.abs(recentMean - baseMean);
    const pct = baseMean > 0 ? (recentMean - baseMean) / baseMean : 0;
    if (baseMean >= 1 && Math.abs(pct) >= 0.3 && absDiff >= 1.5) {
      const dir = pct > 0 ? 'upward' : 'downward';
      const pctLabel = Math.round(Math.abs(pct) * 100);
      driftAlert = {
        detected: true,
        direction: dir,
        percentShift: round(pct, 2),
        message: `Pattern shift detected: recent completed rental pace is ${pctLabel}% ${pct > 0 ? 'higher' : 'lower'} than earlier baseline — review forecast assumptions.`
      };
    }
  }

  return {
    ready: true,
    groupBy,
    models,
    evalSamples: wfRentals.samples,
    lowestErrorRentalKey: pickLowest('maeRentals'),
    lowestErrorFeeKey: pickLowest('maeFees'),
    driftAlert,
    horizonLabels: points.map(p => p.label),
    slope: { rentals: round(rentalReg.slope, 2), fees: roundCents(feeReg.slope) }
  };
}

/** Gini impurity for binary class counts. */
function gini(rows) {
  const n = rows.length;
  if (!n) return 0;
  const pos = rows.filter(r => r.isLate).length / n;
  const neg = 1 - pos;
  return 1 - (pos * pos + neg * neg);
}

/** Interpretable pruned Decision Tree IF-THEN rules for late-return risk (Modeling Mod 5, 6, 8, 11). */
export function buildLateReturnDecisionTree(transactions = [], items = [], categories = [], now = new Date()) {
  const itemMap = new Map((items || []).map(item => [item.id, item]));
  const catMap = new Map((categories || []).map(cat => [cat.id, cat.name || 'Category']));

  const sortedConfirmed = (transactions || [])
    .filter(r => CONFIRMED_STATUSES.has(r.status) && recordDate(r.confirmed_rental_at))
    .sort((a, b) => recordDate(a.confirmed_rental_at) - recordDate(b.confirmed_rental_at));

  const customerSeenCount = new Map();
  const dueSamples = [];
  const activeToScore = [];

  for (const row of sortedConfirmed) {
    const start = recordDate(row.confirmed_rental_at);
    if (!start || start > now) continue;
    const cust = row.customer_id || '';
    const prior = cust ? (customerSeenCount.get(cust) || 0) : 0;
    if (cust) customerSeenCount.set(cust, prior + 1);

    const item = itemMap.get(row.item_id);
    const category = catMap.get(item?.category_id) || 'Other equipment';
    const hour = manilaHour(row.confirmed_rental_at);
    const features = {
      channel: isDeliveryMode(row.fulfillment_mode) ? 'Resort delivery' : 'Shop counter',
      billing: row.fee_breakdown?.package_kind === 'WHOLE_STAY' ? 'Whole-stay booking' : 'Hourly or package booking',
      release: hour !== null && (hour >= 17 || hour < 6) ? 'Evening release (5 PM+)' : 'Daytime release',
      repeat: prior >= 1 ? 'Repeat renter' : 'First-time booking',
      category
    };

    const due = recordDate(row.due_at);
    const ret = recordDate(row.received_at || row.confirmed_return_at);
    if (row.status === 'ACTIVE') {
      activeToScore.push({ due, features });
    }
    if (!due) continue;
    if (ret) {
      dueSamples.push({ ...features, isLate: ret > due, start });
    } else if (row.status === 'ACTIVE' && due < now) {
      dueSamples.push({ ...features, isLate: true, start });
    }
  }

  const MIN_SAMPLES = 12;
  const MIN_LEAF = 5;
  if (dueSamples.length < MIN_SAMPLES) {
    return {
      ready: false,
      samples: dueSamples.length,
      minRequired: MIN_SAMPLES,
      baseLateRate: null,
      rules: [],
      activeSummary: { activeCount: activeToScore.length, elevatedCount: 0, standardCount: activeToScore.length },
      validation: null
    };
  }

  const baseLateRate = dueSamples.filter(s => s.isLate).length / dueSamples.length;
  const featureCandidates = [
    { key: 'channel', label: 'Channel' },
    { key: 'billing', label: 'Booking type' },
    { key: 'release', label: 'Release window' },
    { key: 'repeat', label: 'Booking history' }
  ];

  // Depth-2 deterministic CART/Gini split with strict minimum leaf & impurity gain pruning.
  function bestSplit(subset, usedKeys = new Set()) {
    const parentGini = gini(subset);
    const n = subset.length;
    let best = null;
    for (const candidate of featureCandidates) {
      if (usedKeys.has(candidate.key)) continue;
      const values = [...new Set(subset.map(r => r[candidate.key]))].sort();
      for (const val of values) {
        const left = subset.filter(r => r[candidate.key] === val);
        const right = subset.filter(r => r[candidate.key] !== val);
        if (left.length < MIN_LEAF || right.length < MIN_LEAF) continue;
        const gain = parentGini - ((left.length / n) * gini(left) + (right.length / n) * gini(right));
        if (gain >= 0.015 && (!best || gain > best.gain)) {
          best = { key: candidate.key, value: val, gain, left, right };
        }
      }
    }
    return best;
  }

  const leaves = [];
  const rootSplit = bestSplit(dueSamples);
  if (!rootSplit) {
    leaves.push({ conditions: ['All due & returned bookings'], rows: dueSamples });
  } else {
    const used = new Set([rootSplit.key]);
    const otherLeftVal = [...new Set(rootSplit.right.map(r => r[rootSplit.key]))].join(' / ');
    const branches = [
      { label: rootSplit.value, rows: rootSplit.left },
      { label: otherLeftVal || `Not ${rootSplit.value}`, rows: rootSplit.right }
    ];
    for (const branch of branches) {
      const subSplit = bestSplit(branch.rows, used);
      if (subSplit) {
        const otherSubVal = [...new Set(subSplit.right.map(r => r[subSplit.key]))].join(' / ');
        leaves.push({ conditions: [branch.label, subSplit.value], rows: subSplit.left });
        leaves.push({ conditions: [branch.label, otherSubVal || `Not ${subSplit.value}`], rows: subSplit.right });
      } else {
        leaves.push({ conditions: [branch.label], rows: branch.rows });
      }
    }
  }

  const rules = leaves.map(leaf => {
    const lateCount = leaf.rows.filter(r => r.isLate).length;
    const rate = lateCount / leaf.rows.length;
    const risk = rate >= Math.max(0.3, baseLateRate * 1.35) ? 'Higher risk' : rate >= Math.max(0.15, baseLateRate * 0.85) ? 'Moderate risk' : 'Lower risk';
    const advice = risk === 'Higher risk'
      ? 'Send a return reminder 1 hour before due time or confirm extension early.'
      : risk === 'Moderate risk'
        ? 'Keep standard due-time check active.'
        : 'Normal return pace observed.';
    return {
      conditions: leaf.conditions,
      ruleText: `IF ${leaf.conditions.join(' AND ')}`,
      samples: leaf.rows.length,
      lateCount,
      lateRate: rate,
      risk,
      advice
    };
  }).sort((a, b) => b.lateRate - a.lateRate || b.samples - a.samples);

  // Score currently ACTIVE rentals anonymously against learned rules (never store customer/rental IDs).
  let elevatedCount = 0;
  for (const active of activeToScore) {
    const valuesSet = new Set(Object.values(active.features));
    const matched = rules.find(rule => rule.conditions.every(c => valuesSet.has(c)));
    if (matched && matched.risk === 'Higher risk') elevatedCount++;
  }

  // Chronological 80/20 evaluation note (Modeling Mod 6) when sufficient both-class observations exist.
  const positives = dueSamples.filter(r => r.isLate).length;
  let validation = null;
  if (dueSamples.length >= 16 && positives >= 2 && positives <= dueSamples.length - 2) {
    const splitAt = Math.floor(dueSamples.length * 0.75);
    const train = dueSamples.slice(0, splitAt);
    const test = dueSamples.slice(splitAt);
    const thresholdRate = Math.max(0.3, (train.filter(r => r.isLate).length / train.length) * 1.25);
    const s1 = bestSplit(train);
    let tp = 0; let fp = 0; let fn = 0; let tn = 0;
    for (const row of test) {
      const predLate = s1
        ? ((row[s1.key] === s1.value ? s1.left : s1.right).filter(r => r.isLate).length / (row[s1.key] === s1.value ? s1.left : s1.right).length) >= thresholdRate
        : false;
      if (predLate && row.isLate) tp++;
      else if (predLate && !row.isLate) fp++;
      else if (!predLate && row.isLate) fn++;
      else tn++;
    }
    const precision = tp + fp > 0 ? tp / (tp + fp) : null;
    const recall = tp + fn > 0 ? tp / (tp + fn) : null;
    const f1 = precision !== null && recall !== null && precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : null;
    validation = { holdoutCount: test.length, accuracy: round((tp + tn) / test.length, 2), f1: f1 !== null ? round(f1, 2) : null };
  }

  return {
    ready: true,
    samples: dueSamples.length,
    minRequired: MIN_SAMPLES,
    baseLateRate,
    rules: rules.slice(0, 4),
    activeSummary: {
      activeCount: activeToScore.length,
      elevatedCount,
      standardCount: Math.max(0, activeToScore.length - elevatedCount)
    },
    validation
  };
}

/** Normalized deterministic K-Means Customer Segmentation & Churn Watch — aggregate only, zero PII. */
export function buildCustomerSegmentsAndChurn(transactions = [], now = new Date()) {
  const byCustomer = new Map();
  for (const row of transactions || []) {
    if (!CONFIRMED_STATUSES.has(row.status) || !row.customer_id) continue;
    const start = recordDate(row.confirmed_rental_at);
    if (!start || start > now) continue;
    const fee = finite(row.rental_fee) && row.rental_fee >= 0 ? row.rental_fee : 0;
    const entry = byCustomer.get(row.customer_id) || { rentals: 0, spend: 0, lastAt: start };
    entry.rentals++;
    entry.spend = roundCents(entry.spend + fee);
    if (start > entry.lastAt) entry.lastAt = start;
    byCustomer.set(row.customer_id, entry);
  }

  const profiles = [...byCustomer.values()].map(entry => ({
    rentals: entry.rentals,
    spend: entry.spend,
    recencyDays: Math.max(0, (now.getTime() - entry.lastAt.getTime()) / 86400000)
  }));

  const totalCustomers = profiles.length;
  const totalRevenue = roundCents(profiles.reduce((s, p) => s + p.spend, 0));
  if (totalCustomers < 3) {
    return {
      available: false,
      method: 'insufficient',
      totalCustomers,
      silhouette: null,
      segments: [],
      churnWatchCount: 0,
      reason: `Need at least 3 distinct customers with confirmed rentals to summarize renter groups (currently ${totalCustomers}).`
    };
  }

  const summarize = (name, members, note) => {
    const count = members.length;
    const spend = roundCents(members.reduce((s, m) => s + m.spend, 0));
    const rentals = members.reduce((s, m) => s + m.rentals, 0);
    const avgRecency = round(members.reduce((s, m) => s + m.recencyDays, 0) / Math.max(1, count), 1);
    return {
      label: name,
      customers: count,
      customerShare: count / totalCustomers,
      totalSpend: spend,
      revenueShare: totalRevenue > 0 ? spend / totalRevenue : 0,
      avgRentals: round(rentals / Math.max(1, count), 1),
      avgSpend: roundCents(spend / Math.max(1, count)),
      avgRecencyDays: avgRecency,
      note
    };
  };

  if (totalCustomers < 6) {
    const frequent = profiles.filter(p => p.rentals >= 2 && p.recencyDays <= 21);
    const inactive = profiles.filter(p => p.recencyDays > 21);
    const occasional = profiles.filter(p => p.rentals < 2 && p.recencyDays <= 21);
    const segments = [
      frequent.length ? summarize('Frequent repeat renters', frequent, 'Booked 2+ times recently.') : null,
      occasional.length ? summarize('Occasional / single renters', occasional, 'Recent single bookings.') : null,
      inactive.length ? summarize('Inactive / churn watch', inactive, 'No booking in over 21 days.') : null
    ].filter(Boolean);
    return {
      available: true,
      method: 'tiers',
      totalCustomers,
      silhouette: null,
      segments,
      churnWatchCount: inactive.length
    };
  }

  // Min-Max Normalization (Modeling Mod 4) across frequency, spend, and recency.
  const bounds = ['rentals', 'spend', 'recencyDays'].map(key => {
    const vals = profiles.map(p => p[key]);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    return { key, min, span: max - min || 1 };
  });
  const vectors = profiles.map(p => bounds.map(b => (p[b.key] - b.min) / b.span));

  // Deterministic farthest-first seed selection (no randomness).
  const k = Math.min(4, Math.max(2, Math.floor(totalCustomers / 2)));
  const sortedIdx = vectors
    .map((v, idx) => ({ idx, score: v[0] + v[1] - v[2] }))
    .sort((a, b) => b.score - a.score)
    .map(item => item.idx);

  const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  let centroids = [vectors[sortedIdx[0]].slice()];
  while (centroids.length < k) {
    let bestIdx = sortedIdx[0];
    let bestD = -1;
    for (const idx of sortedIdx) {
      const minDist = Math.min(...centroids.map(c => dist2(vectors[idx], c)));
      if (minDist > bestD) {
        bestD = minDist;
        bestIdx = idx;
      }
    }
    centroids.push(vectors[bestIdx].slice());
  }

  let assign = new Array(totalCustomers).fill(0);
  for (let iter = 0; iter < 15; iter++) {
    let changed = false;
    const nextAssign = vectors.map(v => {
      let bestC = 0;
      let bestD = Infinity;
      centroids.forEach((c, ci) => {
        const d = dist2(v, c);
        if (d < bestD) {
          bestD = d;
          bestC = ci;
        }
      });
      return bestC;
    });
    for (let i = 0; i < totalCustomers; i++) if (nextAssign[i] !== assign[i]) changed = true;
    assign = nextAssign;
    if (!changed) break;
    centroids = centroids.map((old, ci) => {
      const pts = vectors.filter((_, i) => assign[i] === ci);
      if (!pts.length) return old;
      return [0, 1, 2].map(d => pts.reduce((s, p) => s + p[d], 0) / pts.length);
    });
  }

  // Group and label clusters by dominant operational profile.
  const rawClusters = centroids.map((_, ci) => profiles.filter((_, i) => assign[i] === ci)).filter(g => g.length > 0);
  const scored = rawClusters.map(members => {
    const avgRentals = members.reduce((s, m) => s + m.rentals, 0) / members.length;
    const avgSpend = members.reduce((s, m) => s + m.spend, 0) / members.length;
    const avgRecency = members.reduce((s, m) => s + m.recencyDays, 0) / members.length;
    return { members, avgRentals, avgSpend, avgRecency };
  });

  const usedLabels = new Set();
  const churnCluster = [...scored].sort((a, b) => b.avgRecency - a.avgRecency)[0];
  const frequentCluster = [...scored].sort((a, b) => b.avgRentals - a.avgRentals || b.avgSpend - a.avgSpend)[0];
  const highSpendCluster = [...scored].filter(c => c !== frequentCluster).sort((a, b) => b.avgSpend - a.avgSpend)[0];

  const segments = scored.map(cluster => {
    let label = 'Occasional / walk-in renters';
    let note = 'Single or light bookings within the recent window.';
    if (cluster === churnCluster && cluster.avgRecency >= 21 && cluster !== frequentCluster) {
      label = 'Inactive / churn watch';
      note = `Last booking averaged ${round(cluster.avgRecency, 0)} days ago — consider a return promo.`;
    } else if (cluster === frequentCluster && !usedLabels.has('Frequent repeat renters')) {
      label = 'Frequent repeat renters';
      note = 'Highest repeat booking count in your renter base.';
    } else if (cluster === highSpendCluster && !usedLabels.has('High-spend renters')) {
      label = 'High-spend renters';
      note = 'Higher average rental spend per customer.';
    } else if (usedLabels.has(label)) {
      label = cluster.avgRecency > 21 ? 'Infrequent past renters' : 'Steady casual renters';
      note = cluster.avgRecency > 21 ? 'Booked infrequently and not recently active.' : 'Moderate repeat activity.';
    }
    usedLabels.add(label);
    return summarize(label, cluster.members, note);
  }).sort((a, b) => b.totalSpend - a.totalSpend || b.customers - a.customers);

  // Compute compact Silhouette check internally (Modeling Mod 6).
  let silSum = 0;
  let silCount = 0;
  if (rawClusters.length >= 2) {
    for (let i = 0; i < totalCustomers; i++) {
      const ci = assign[i];
      const samePts = vectors.filter((_, j) => j !== i && assign[j] === ci);
      const a = samePts.length ? samePts.reduce((s, p) => s + Math.sqrt(dist2(vectors[i], p)), 0) / samePts.length : 0;
      let b = Infinity;
      for (let c = 0; c < centroids.length; c++) {
        if (c === ci) continue;
        const otherPts = vectors.filter((_, j) => assign[j] === c);
        if (!otherPts.length) continue;
        const meanDist = otherPts.reduce((s, p) => s + Math.sqrt(dist2(vectors[i], p)), 0) / otherPts.length;
        if (meanDist < b) b = meanDist;
      }
      if (Number.isFinite(b) && Math.max(a, b) > 0) {
        silSum += (b - a) / Math.max(a, b);
        silCount++;
      }
    }
  }

  const churnWatchCount = profiles.filter(p => p.recencyDays > 21).length;
  return {
    available: true,
    method: 'kmeans',
    totalCustomers,
    silhouette: silCount > 0 ? round(silSum / silCount, 2) : null,
    segments,
    churnWatchCount
  };
}

/** Market Basket Analysis co-rental bundles (BA Mod 1.5 & Mod 5) — anonymized stock groups only. */
export function buildMarketBasketBundles(confirmed = [], items = []) {
  const itemMap = new Map((items || []).map(item => [item.id, item]));
  const baskets = new Map();

  for (const row of confirmed) {
    if (!row.customer_id) continue;
    const day = manilaDateKey(row.confirmed_rental_at);
    if (!day) continue;
    const item = itemMap.get(row.item_id);
    const groupId = stockGroupKey(item || {}, row.item_id);
    const groupName = item?.name || 'Equipment';
    const bKey = `${row.customer_id}|${day}`;
    if (!baskets.has(bKey)) baskets.set(bKey, new Map());
    baskets.get(bKey).set(groupId, groupName);
  }

  const basketList = [...baskets.values()].map(map => [...map.entries()].sort((a, b) => a[1].localeCompare(b[1])));
  const totalBaskets = basketList.length;
  if (totalBaskets < 3) {
    return { available: false, totalBaskets, bundles: [], reason: `Need at least 3 multi-booking days/customers to spot equipment bundles (currently ${totalBaskets}).` };
  }

  const singleCount = new Map();
  const names = new Map();
  const pairCount = new Map();

  for (const groupEntries of basketList) {
    for (const [id, name] of groupEntries) {
      singleCount.set(id, (singleCount.get(id) || 0) + 1);
      names.set(id, name);
    }
    if (groupEntries.length < 2) continue;
    for (let i = 0; i < groupEntries.length; i++) {
      for (let j = i + 1; j < groupEntries.length; j++) {
        const [aId] = groupEntries[i];
        const [bId] = groupEntries[j];
        const key = `${aId}::${bId}`;
        pairCount.set(key, (pairCount.get(key) || 0) + 1);
      }
    }
  }

  const bundles = [];
  for (const [key, count] of pairCount.entries()) {
    if (count < 2) continue;
    const [aId, bId] = key.split('::');
    const cA = singleCount.get(aId) || 1;
    const cB = singleCount.get(bId) || 1;
    const support = count / totalBaskets;
    const pA = cA / totalBaskets;
    const pB = cB / totalBaskets;
    const lift = pA * pB > 0 ? support / (pA * pB) : 0;
    const confidence = Math.max(count / cA, count / cB);
    if (lift >= 1 || confidence >= 0.4) {
      bundles.push({
        itemA: names.get(aId) || 'Equipment A',
        itemB: names.get(bId) || 'Equipment B',
        coRentals: count,
        support: round(support, 2),
        confidence: round(confidence, 2),
        lift: round(lift, 2),
        suggestion: `Offer a combo rate for ${names.get(aId)} + ${names.get(bId)} or store both ready side-by-side.`
      });
    }
  }

  bundles.sort((a, b) => b.coRentals - a.coRentals || b.lift - a.lift);
  return {
    available: bundles.length > 0,
    totalBaskets,
    bundles: bundles.slice(0, 4),
    reason: bundles.length ? '' : 'No equipment pair appeared together in at least 2 bookings yet.'
  };
}

/** Anonymized Outlier & Unusual Record Alerts using Mean + 2 SD rule (Modeling Mod 4) + overdue checks. */
export function buildOutlierAlerts({ confirmed = [], transactions = [], items = [], verification = [], durationStats = null, speedStats = null, now = new Date() } = {}) {
  const itemMap = new Map((items || []).map(item => [item.id, item.name || 'Equipment']));
  const alerts = [];

  // 1. Active rentals overdue > 24 hours.
  const longOverdue = (transactions || []).filter(r => {
    if (r.status !== 'ACTIVE') return false;
    const due = recordDate(r.due_at);
    return due && (now.getTime() - due.getTime()) > 24 * 3600000;
  });
  if (longOverdue.length) {
    const topItems = [...new Set(longOverdue.map(r => itemMap.get(r.item_id) || 'Equipment'))].slice(0, 3);
    alerts.push({
      kind: 'overdue',
      severity: 'high',
      title: `${longOverdue.length} active rental${longOverdue.length > 1 ? 's' : ''} overdue over 24 hours`,
      detail: `Equipment: ${topItems.join(', ')}. Follow up return inspection or confirm extension.`,
      count: longOverdue.length
    });
  }

  // 2. Duration outliers (> mean + 2 SD when >= 5 completed duration samples).
  if (durationStats?.available && durationStats.count >= 5 && durationStats.stdDev > 0) {
    const threshold = durationStats.mean + 2 * durationStats.stdDev;
    const longDurations = confirmed.filter(r => {
      const start = recordDate(r.confirmed_rental_at);
      const ret = recordDate(r.received_at || r.confirmed_return_at);
      if (!start || !ret || ret < start) return false;
      return ((ret - start) / 3600000) > threshold;
    });
    if (longDurations.length) {
      alerts.push({
        kind: 'duration',
        severity: 'medium',
        title: `${longDurations.length} unusually long rental duration${longDurations.length > 1 ? 's' : ''}`,
        detail: `Above normal upper limit of ${round(threshold, 1)} hrs (Mean + 2×Std Dev). Verify closed return timestamps.`,
        count: longDurations.length
      });
    }
  }

  // 3. Slow ESP32 verification > 60s.
  const slowVerifs = (verification || []).filter(v => {
    if (v.status !== 'CONFIRMED') return false;
    const req = recordDate(v.requested_at);
    const conf = recordDate(v.confirmed_at);
    return req && conf && conf >= req && ((conf - req) / 1000) > 60;
  });
  if (slowVerifs.length) {
    alerts.push({
      kind: 'terminal',
      severity: 'medium',
      title: `${slowVerifs.length} slow counter confirmation${slowVerifs.length > 1 ? 's' : ''} (>60 sec)`,
      detail: `Median speed is ${speedStats?.median ?? '—'} sec; check terminal connection or counter queue.`,
      count: slowVerifs.length
    });
  }

  // 4. Confirmed rentals with missing/unrecorded fee.
  const zeroFees = confirmed.filter(r => !finite(r.rental_fee) || r.rental_fee === 0);
  if (zeroFees.length) {
    alerts.push({
      kind: 'missing-fee',
      severity: 'monitor',
      title: `${zeroFees.length} confirmed rental${zeroFees.length > 1 ? 's' : ''} with ₱0 or unrecorded fee`,
      detail: 'Confirm whether these were free complimentary promos or missing fee entries.',
      count: zeroFees.length
    });
  }

  return alerts;
}

/** Pure client-side What-If Estimator (BA Mod 10.4.5, Modeling Mod 2). Never mutates live data. */
export function simulateWhatIfScenario({ groups = [], totals = {} } = {}, input = {}) {
  const targetId = String(input.targetGroupId || 'ALL');
  const extraUnits = Math.max(0, Math.min(5, Math.round(Number(input.extraUnits) || 0)));
  const rateChangePct = Math.max(-30, Math.min(30, Math.round(Number(input.rateChangePct) || 0)));
  const demandShiftPct = Math.max(-25, Math.min(50, Math.round(Number(input.demandShiftPct) || 0)));

  const group = targetId !== 'ALL' ? groups.find(g => g.id === targetId) : null;
  const targetLabel = group ? group.name : 'Whole fleet';
  const currentRentals = group ? group.rentals : (totals.rentals || 0);
  const currentFees = roundCents(group ? group.fees : (totals.fees || 0));
  const currentUnits = Math.max(1, group ? (group.units || 1) : groups.reduce((s, g) => s + (g.units || 1), 0));
  const currentUtil = group ? group.utilization : totals.utilization;

  // Transparent elasticity model: -0.35 price sensitivity + capacity ceiling if extra units are added.
  const unitCapacityScale = (currentUnits + extraUnits) / currentUnits;
  const priceEffect = 1 - 0.35 * (rateChangePct / 100);
  const marketEffect = 1 + (demandShiftPct / 100);
  const combinedRentalFactor = Math.max(0.25, marketEffect * priceEffect * Math.min(unitCapacityScale, 1 + extraUnits * 0.25));

  const projectedRentals = round(currentRentals * combinedRentalFactor, 1);
  const avgFee = currentRentals > 0 ? currentFees / currentRentals : 0;
  const projectedFees = roundCents(projectedRentals * avgFee * (1 + rateChangePct / 100));
  const projectedUtilization = finite(currentUtil)
    ? Math.min(1, round((currentUtil * combinedRentalFactor) / unitCapacityScale, 4))
    : null;

  return {
    targetId: group ? group.id : 'ALL',
    targetLabel,
    extraUnits,
    rateChangePct,
    demandShiftPct,
    currentRentals,
    projectedRentals,
    currentFees,
    projectedFees,
    feeDelta: roundCents(projectedFees - currentFees),
    currentUtilization: currentUtil,
    projectedUtilization,
    capacityWarning: projectedUtilization !== null && projectedUtilization >= 0.85,
    formulaNote: 'Assumes -0.35 moderate price elasticity plus extra capacity scaling from added units.'
  };
}
