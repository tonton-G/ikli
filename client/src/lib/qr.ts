import QRCode from 'qrcode';
import type { QrStyle } from './api';

// Renders a QR code as an SVG string. One code path serves both the on-screen
// preview (via innerHTML) and PNG/SVG downloads, so what you see is what you
// export. Coordinates are in module units; the viewBox handles scaling.

const QUIET = 2; // quiet-zone modules around the code
// width of the center knockout, as a fraction of the code
const LOGO_FRACTIONS: Record<QrStyle['logoSize'], number> = { sm: 0.18, md: 0.24, lg: 0.3 };

function esc(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function rr(x: number, y: number, w: number, h: number, r: number): string {
  return rrc(x, y, w, h, [r, r, r, r]);
}

/** Rounded rect with per-corner radii [top-left, top-right, bottom-right, bottom-left]. */
function rrc(x: number, y: number, w: number, h: number, [tl, tr, br, bl]: number[]): string {
  return (
    `M${x + tl},${y} h${w - tl - tr}` +
    (tr ? ` a${tr},${tr} 0 0 1 ${tr},${tr}` : '') +
    ` v${h - tr - br}` +
    (br ? ` a${br},${br} 0 0 1 ${-br},${br}` : '') +
    ` h${-(w - br - bl)}` +
    (bl ? ` a${bl},${bl} 0 0 1 ${-bl},${-bl}` : '') +
    ` v${-(h - bl - tl)}` +
    (tl ? ` a${tl},${tl} 0 0 1 ${tl},${-tl}` : '') +
    ' z'
  );
}

function diamond(x: number, y: number): string {
  const c = 0.5;
  return `M${x + c},${y + 0.02} L${x + 0.98},${y + c} L${x + c},${y + 0.98} L${x + 0.02},${y + c} z`;
}

function star(x: number, y: number): string {
  const cx = x + 0.5;
  const cy = y + 0.5;
  const r = 0.5;
  const p = 0.16; // pinch — control-point distance from center
  return (
    `M${cx},${cy - r} Q${cx + p},${cy - p} ${cx + r},${cy}` +
    ` Q${cx + p},${cy + p} ${cx},${cy + r}` +
    ` Q${cx - p},${cy + p} ${cx - r},${cy}` +
    ` Q${cx - p},${cy - p} ${cx},${cy - r} z`
  );
}

function eyeSvg(fx: number, fy: number, style: QrStyle, fill: string): string {
  if (style.corners === 'rounded') {
    const ring = rr(fx, fy, 7, 7, 2.2) + ' ' + rr(fx + 1.2, fy + 1.2, 4.6, 4.6, 1.4);
    return (
      `<path d="${ring}" fill="${fill}" fill-rule="evenodd"/>` +
      `<circle cx="${fx + 3.5}" cy="${fy + 3.5}" r="1.6" fill="${fill}"/>`
    );
  }
  if (style.corners === 'leaf') {
    // teardrop: sharp top-left and bottom-right, rounded elsewhere
    const ring =
      rrc(fx, fy, 7, 7, [0, 2.6, 0, 2.6]) + ' ' + rrc(fx + 1.2, fy + 1.2, 4.6, 4.6, [0, 1.7, 0, 1.7]);
    return (
      `<path d="${ring}" fill="${fill}" fill-rule="evenodd"/>` +
      `<path d="${rrc(fx + 2.1, fy + 2.1, 2.8, 2.8, [0, 1, 0, 1])}" fill="${fill}"/>`
    );
  }
  if (style.corners === 'target') {
    const cx = fx + 3.5;
    const cy = fy + 3.5;
    return (
      `<circle cx="${cx}" cy="${cy}" r="3" fill="none" stroke="${fill}" stroke-width="1"/>` +
      `<circle cx="${cx}" cy="${cy}" r="1.6" fill="${fill}"/>`
    );
  }
  const ring = `M${fx},${fy}h7v7h-7z M${fx + 1},${fy + 1}v5h5v-5z`;
  return (
    `<path d="${ring}" fill="${fill}" fill-rule="evenodd"/>` +
    `<rect x="${fx + 2}" y="${fy + 2}" width="3" height="3" fill="${fill}"/>`
  );
}

function inFinder(x: number, y: number, size: number): boolean {
  return (x < 7 && y < 7) || (x >= size - 7 && y < 7) || (x < 7 && y >= size - 7);
}

export function renderQrSvg(text: string, style: QrStyle): string {
  // A center logo eats modules, so bump error correction to compensate.
  const qr = QRCode.create(text, { errorCorrectionLevel: style.logo ? 'H' : 'M' });
  const size = qr.modules.size;
  const data = qr.modules.data;

  const dark = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < size && y < size && data[y * size + x] === 1 && !inFinder(x, y, size);

  // center knockout for the logo
  const logoBox = style.logo ? Math.ceil(size * LOGO_FRACTIONS[style.logoSize]) : 0;
  const logoStart = Math.floor((size - logoBox) / 2);
  const inLogo = (x: number, y: number): boolean =>
    logoBox > 0 &&
    x >= logoStart - 1 &&
    x < logoStart + logoBox + 1 &&
    y >= logoStart - 1 &&
    y < logoStart + logoBox + 1;

  const moduleFill = style.color2 ? 'url(#qg)' : style.color;
  const parts: string[] = [];

  const squares: string[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!dark(x, y) || inLogo(x, y)) continue;
      switch (style.pattern) {
        case 'dots':
          parts.push(`<circle cx="${x + 0.5}" cy="${y + 0.5}" r="0.4" fill="${moduleFill}"/>`);
          break;
        case 'rounded':
          parts.push(
            `<rect x="${x + 0.05}" y="${y + 0.05}" width="0.9" height="0.9" rx="0.3" fill="${moduleFill}"/>`,
          );
          break;
        case 'fluid': {
          // round a corner only when both neighbours touching it are light
          const r = 0.45;
          const radii = [
            !dark(x, y - 1) && !dark(x - 1, y) ? r : 0,
            !dark(x, y - 1) && !dark(x + 1, y) ? r : 0,
            !dark(x, y + 1) && !dark(x + 1, y) ? r : 0,
            !dark(x, y + 1) && !dark(x - 1, y) ? r : 0,
          ];
          squares.push(rrc(x, y, 1, 1, radii));
          break;
        }
        case 'diamond':
          squares.push(diamond(x, y));
          break;
        case 'star':
          squares.push(star(x, y));
          break;
        default:
          squares.push(`M${x},${y}h1v1h-1z`);
      }
    }
  }
  if (squares.length) parts.push(`<path d="${squares.join(' ')}" fill="${moduleFill}"/>`);

  // finder corners
  const eyeFill = style.eyeColor ?? moduleFill;
  parts.push(eyeSvg(0, 0, style, eyeFill));
  parts.push(eyeSvg(size - 7, 0, style, eyeFill));
  parts.push(eyeSvg(0, size - 7, style, eyeFill));

  // logo
  if (style.logo) {
    const box = logoBox;
    const lx = logoStart;
    if (style.logo.startsWith('data:image/')) {
      parts.push(
        `<image href="${style.logo}" x="${lx}" y="${lx}" width="${box}" height="${box}" preserveAspectRatio="xMidYMid meet"/>`,
      );
    } else {
      parts.push(
        `<text x="${lx + box / 2}" y="${lx + box / 2 + box * 0.06}" text-anchor="middle" dominant-baseline="middle" font-size="${box * 0.9}" fill="${style.color}">${esc(style.logo)}</text>`,
      );
    }
  }

  // frame
  const frameStroke = style.frameColor ?? style.color;
  const framePad = style.frame === 'none' ? 0 : 1.5;
  const labelSpace = style.frame === 'scanme' ? 5 : 0;
  const x0 = -QUIET - framePad;
  const y0 = -QUIET - framePad;
  const w = size + 2 * (QUIET + framePad);
  const h = w + labelSpace;
  const stroke = 0.8;

  if (style.frame === 'full') {
    parts.push(
      `<path d="${rr(x0 + stroke / 2, y0 + stroke / 2, w - stroke, h - stroke, 2)}" fill="none" stroke="${frameStroke}" stroke-width="${stroke}"/>`,
    );
  } else if (style.frame === 'corner') {
    const len = size * 0.45;
    parts.push(
      `<path d="M${x0 + stroke / 2},${y0 + len} V${y0 + stroke / 2} H${x0 + len}" fill="none" stroke="${frameStroke}" stroke-width="${stroke}" stroke-linecap="round"/>`,
      `<path d="M${x0 + w - stroke / 2},${y0 + h - labelSpace - len} V${y0 + h - stroke / 2} H${x0 + w - len}" fill="none" stroke="${frameStroke}" stroke-width="${stroke}" stroke-linecap="round"/>`,
    );
  } else if (style.frame === 'scanme') {
    parts.push(
      `<path d="${rr(x0 + stroke / 2, y0 + stroke / 2, w - stroke, h - stroke, 3)}" fill="none" stroke="${frameStroke}" stroke-width="${stroke}"/>`,
      `<text x="${x0 + w / 2}" y="${y0 + h - labelSpace / 2 + 0.5}" text-anchor="middle" dominant-baseline="middle" font-family="Caveat, cursive" font-weight="600" font-size="3.6" fill="${frameStroke}">${esc(style.frameText || 'Scan me')}</text>`,
    );
  }

  const pad = 0.5;
  const vb = `${x0 - pad} ${y0 - pad} ${w + 2 * pad} ${h + 2 * pad}`;

  const defs = style.color2
    ? style.gradient === 'radial'
      ? `<defs><radialGradient id="qg" gradientUnits="userSpaceOnUse" cx="${size / 2}" cy="${size / 2}" r="${size * 0.75}"><stop offset="0" stop-color="${style.color}"/><stop offset="1" stop-color="${style.color2}"/></radialGradient></defs>`
      : `<defs><linearGradient id="qg" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${size}" y2="${size}"><stop offset="0" stop-color="${style.color}"/><stop offset="1" stop-color="${style.color2}"/></linearGradient></defs>`
    : '';

  const bgRect =
    style.bg === null
      ? ''
      : `<rect x="${x0 - pad}" y="${y0 - pad}" width="${w + 2 * pad}" height="${h + 2 * pad}" fill="${style.bg}"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" fill="none">${defs}${bgRect}${parts.join('')}</svg>`;
}

export function downloadSvg(svg: string, filename: string): void {
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  triggerDownload(URL.createObjectURL(blob), filename);
}

export function downloadPng(svg: string, filename: string, px = 1024): void {
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = px;
    canvas.height = Math.round((px * img.height) / img.width) || px;
    const ctx = canvas.getContext('2d')!;
    // no background fill — the SVG carries its own (or is intentionally transparent)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    canvas.toBlob((png) => {
      if (png) triggerDownload(URL.createObjectURL(png), filename);
    }, 'image/png');
  };
  img.src = url;
}

function triggerDownload(url: string, filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
