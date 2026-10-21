import React from './react-shim.js';

export const icons = {
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
  repeat: '<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>',
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  monitor: '<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>',
  radio: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>',
  volume: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
  wifi: '<path d="M12 20h.01"/><path d="M2 8.82a15 15 0 0 1 20 0"/><path d="M5 12.859a10 10 0 0 1 14 0"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/>',
  zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  sportsBall: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20M12 2a14.5 14.5 0 0 1 0 20M2 12h20"/>',
  gamepad: '<line x1="6" x2="10" y1="12" y2="12"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="15" x2="15.01" y1="13" y2="13"/><line x1="18" x2="18.01" y1="11" y2="11"/><rect width="20" height="12" x="2" y="6" rx="6"/>',
  dice: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M8 8h.01M16 8h.01M12 12h.01M8 16h.01M16 16h.01"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5l1.5 1.5M5 19l1.5-1.5M17.5 6.5l1.5-1.5"/>',
  moon: '<path d="M20.5 13a9 9 0 0 1-9.5-9.5A9 9 0 1 0 20.5 13Z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  box: '<path d="m3 7 9-4 9 4v10l-9 4-9-4V7Zm0 0 9 4 9-4M12 11v10M7 5l10 4"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  chart: '<path d="M4 3v17h17M8 16v-5M13 16V7M18 16v-8"/>',
  chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 1v5M15 1v5M9 18v5M15 18v5M1 9h5M1 15h5M18 9h5M18 15h5"/><rect x="10" y="10" width="4" height="4"/>',
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
  bell: '<path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5l-2 3ZM10 21h4"/>',
  out: '<path d="M10 4H4v16h6M8 12h13m-4-4 4 4-4 4"/>',
  money: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 12h1M17 12h1"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  edit: '<path d="m16 3 5 5-12 12-6 1 1-6L16 3ZM14 5l5 5"/>',
  archive: '<rect x="3" y="3" width="18" height="5" rx="1"/><path d="M5 8v12h14V8M10 12h4"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v3M14 20h3M20 20h1"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  bluetooth: '<path d="m7 7 10 10-5 5V2l5 5L7 17"/>',
  print: '<path d="M7 8V3h10v5M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M7 14h10v7H7z"/><path d="M17 11h.01"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 18v3h16v-3"/>',
  more: '<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>'
};

export const icon = name =>
  `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icons[name] || icons.box}</svg>`;

export function Icon({ name }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: icons[name] || icons.box }}
    />
  );
}

export const escape = v =>
  String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const money = v =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(Number(v || 0));

export const initials = name =>
  String(name || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(x => x[0])
    .join('')
    .toUpperCase();

export const categoryIconName = category =>
  /sport/i.test(category)
    ? 'sportsBall'
    : /board/i.test(category)
      ? 'dice'
      : /consol/i.test(category)
        ? 'gamepad'
        : 'box';

export const symbol = category =>
  `<span class="category-glyph" aria-hidden="true">${icon(categoryIconName(category))}</span>`;

export function CategorySymbol({ category }) {
  return (
    <span className="category-glyph" aria-hidden="true">
      <Icon name={categoryIconName(category)} />
    </span>
  );
}

export const date = v =>
  v ? new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(String(v)) ? String(v) : String(v).replace(' ', 'T') + '+08:00') : null;

export const formatDate = v =>
  date(v) && Number.isFinite(date(v).getTime())
    ? new Intl.DateTimeFormat('en-PH', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'Asia/Manila'
      }).format(date(v))
    : 'Not recorded';

export const badge = status =>
  `<span class="badge ${escape(String(status || '').toLowerCase().replaceAll(' ', '-'))}">${escape(status)}</span>`;

export function StatusBadge({ status }) {
  const cls = String(status || '').toLowerCase().replaceAll(' ', '-');
  return <span className={`badge ${cls}`}>{status}</span>;
}

export const stateLabel = status =>
  ({
    AVAILABLE: 'Available',
    RENTED: 'Rented',
    UNDER_MAINTENANCE: 'Under maintenance',
    RESERVED_PENDING: 'Pending',
    INACTIVE: 'Inactive'
  }[status] || status);

export function BrandLogo() {
  return (
    <>
      <img src="/public/logo.png" alt="Rent and Play logo" />
      <span>
        rent<span className="orange">&</span>play
        <small>RENTAL MANAGEMENT</small>
      </span>
    </>
  );
}

export function SportArtSvg() {
  return (
    <svg className="sport-art" viewBox="0 0 320 230" aria-hidden="true">
      <g fill="none" stroke="#efbe8b">
        <circle cx="188" cy="106" r="100" />
        <circle cx="188" cy="106" r="80" />
        <path d="M50 210 280 12M94 230 320 34" />
      </g>
      <g transform="rotate(-18 187 100)">
        <circle cx="190" cy="95" r="66" fill="#f99235" stroke="#b7561b" strokeWidth="3" />
        <path
          d="M124 95h132M190 29v132M144 47c55 10 64 86 9 103M227 41c-53 23-54 87-6 112"
          stroke="#a74918"
          strokeWidth="3"
          fill="none"
        />
      </g>
      <g transform="rotate(21 92 166)">
        <rect x="39" y="127" width="109" height="67" rx="29" fill="#223957" />
        <path d="M62 148v23M50 159h24" stroke="#fff" strokeWidth="5" />
        <circle cx="122" cy="153" r="5" fill="#fb9b50" />
        <circle cx="112" cy="166" r="5" fill="#91b7aa" />
      </g>
      <g transform="rotate(14 263 166)">
        <rect x="236" y="136" width="54" height="54" rx="10" fill="#fff" stroke="#ddc6b0" />
        <g fill="#203750">
          <circle cx="249" cy="149" r="3" />
          <circle cx="277" cy="149" r="3" />
          <circle cx="263" cy="163" r="3" />
          <circle cx="249" cy="177" r="3" />
          <circle cx="277" cy="177" r="3" />
        </g>
      </g>
    </svg>
  );
}

export function cleanErrorMessage(msg) {
  if (!msg) return '';
  const str = String(msg);
  const lower = str.toLowerCase();
  if (
    lower.includes('npm run dev') ||
    lower.includes('backend is not running') ||
    lower.includes('apps/backend') ||
    lower.includes('failed to fetch') ||
    lower.includes('econnrefused') ||
    lower.includes('cannot reach the server')
  ) {
    return 'Unable to connect to the server. Please check your connection or try again later.';
  }
  return str;
}
