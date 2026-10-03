import { LABEL_LOGO_PATH, LABEL_LOGO_VIEWBOX } from './label-logo.js';
import { paintQrMatrix } from './mx10-printer.js';

// Start at the top of the artwork box while retaining the QR's four-module border.
export const QR_LABEL_GEOMETRY = Object.freeze({ x: 12, y: 0, size: 272, alignY: 'start' });
const xml = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

export function createEquipmentQrLabel(item, qr) {
  const { x, y, size } = QR_LABEL_GEOMETRY;
  const name = String(item.name || '');
  const dots = [];
  const context = { fillStyle: '', fillRect(left, top, width, height) { if (this.fillStyle === '#000') dots.push({ left, top, width, height }); } };
  paintQrMatrix(context, qr.matrix, QR_LABEL_GEOMETRY, 384, 240);
  // Use the same whole-dot geometry in the preview and print, then center the
  // equipment copy against the visible QR rather than the surrounding paper.
  const qrCenter = dots.length ? (Math.min(...dots.map(dot => dot.top)) + Math.max(...dots.map(dot => dot.top + dot.height))) / 2 * 300 / 240 : y + size / 2;
  const artwork = dots.length
    ? `<g transform="scale(${500 / 384} ${300 / 240})" fill="#000"><path d="${dots.map(dot => `M${dot.left} ${dot.top}h${dot.width}v${dot.height}h-${dot.width}z`).join('')}"/></g>`
    : `<svg x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMin meet" ${qr.svg.slice(qr.svg.indexOf('viewBox='), qr.svg.indexOf('>'))}>${qr.svg.slice(qr.svg.indexOf('>') + 1, qr.svg.lastIndexOf('</svg>'))}</svg>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="50mm" height="30mm" viewBox="0 0 500 300" shape-rendering="crispEdges"><rect width="500" height="300" fill="white"/>${artwork}<g transform="translate(0 ${qrCenter - 89.5})"><text x="300" y="20" textLength="185" lengthAdjust="spacingAndGlyphs" fill="#000" font-family="Arial, sans-serif" font-size="20" font-weight="bold">${xml(item.item_code)}</text><text x="300" y="63" textLength="185" lengthAdjust="spacingAndGlyphs" fill="#000" font-family="Arial, sans-serif" font-size="18">${xml(name.length > 20 ? name.slice(0, 17) + '…' : name)}</text><svg x="332.5" y="88" width="120" height="91" viewBox="${LABEL_LOGO_VIEWBOX}" aria-label="Rent and Play logo"><path fill="#000" d="${LABEL_LOGO_PATH}"/></svg></g></svg>`;
}
