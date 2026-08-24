/**
 * generate-icons.mjs — writes the PWA icon set from a vector description.
 *
 * No image libraries: shapes are sampled at 4× and box-filtered down, then
 * encoded as PNG with zlib. Run `npm run icons` after changing the mark.
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'icons');

const BLUE = [0x2a, 0x78, 0xd6];
const WHITE = [0xff, 0xff, 0xff];
const SAMPLES = 4;

/* ----------------------------------------------------------------- geometry */

const STROKE = 0.075;
const POLYLINE = [[0.19, 0.70], [0.40, 0.47], [0.545, 0.605], [0.80, 0.30]];
const END_DOT = { x: 0.80, y: 0.30, r: 0.088 };
const BASELINE = { x1: 0.19, x2: 0.81, y: 0.815, w: 0.042 };

function distanceToSegment(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function insideRoundedSquare(x, y, radius) {
  const cx = Math.min(Math.max(x, radius), 1 - radius);
  const cy = Math.min(Math.max(y, radius), 1 - radius);
  if (x >= radius && x <= 1 - radius) return y >= 0 && y <= 1;
  if (y >= radius && y <= 1 - radius) return x >= 0 && x <= 1;
  return Math.hypot(x - cx, y - cy) <= radius;
}

/** @returns {[number, number, number, number]} straight (non-premultiplied) RGBA, 0–255 with 0–1 alpha */
function sample(x, y, { maskable }) {
  const inBackground = maskable ? true : insideRoundedSquare(x, y, 0.22);
  if (!inBackground) return [0, 0, 0, 0];

  // Maskable icons keep their mark inside the safe zone (central 80%).
  const scale = maskable ? 0.78 : 1;
  const gx = (x - 0.5) / scale + 0.5;
  const gy = (y - 0.5) / scale + 0.5;

  let ink = 0;
  for (let i = 0; i < POLYLINE.length - 1; i += 1) {
    if (distanceToSegment(gx, gy, POLYLINE[i], POLYLINE[i + 1]) <= STROKE / 2) ink = 1;
  }
  if (Math.hypot(gx - END_DOT.x, gy - END_DOT.y) <= END_DOT.r) ink = 1;
  if (!ink
    && gy >= BASELINE.y - BASELINE.w / 2 && gy <= BASELINE.y + BASELINE.w / 2
    && gx >= BASELINE.x1 && gx <= BASELINE.x2) {
    ink = 0.45;
  }

  const rgb = BLUE.map((channel, index) => Math.round(channel + (WHITE[index] - channel) * ink));
  return [rgb[0], rgb[1], rgb[2], 1];
}

function raster(size, options) {
  const pixels = new Uint8Array(size * size * 4);
  const step = 1 / (size * SAMPLES);
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let r = 0; let g = 0; let b = 0; let a = 0;
      for (let sy = 0; sy < SAMPLES; sy += 1) {
        for (let sx = 0; sx < SAMPLES; sx += 1) {
          const x = (px * SAMPLES + sx + 0.5) * step;
          const y = (py * SAMPLES + sy + 0.5) * step;
          const [sr, sg, sb, sa] = sample(x, y, options);
          r += sr * sa; g += sg * sa; b += sb * sa; a += sa;
        }
      }
      const total = SAMPLES * SAMPLES;
      const offset = (py * size + px) * 4;
      pixels[offset] = a ? Math.round(r / a) : 0;
      pixels[offset + 1] = a ? Math.round(g / a) : 0;
      pixels[offset + 2] = a ? Math.round(b / a) : 0;
      pixels[offset + 3] = Math.round((a / total) * 255);
    }
  }
  return pixels;
}

/* --------------------------------------------------------------- PNG output */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;   // bit depth
  header[9] = 6;   // colour type: RGBA
  header[10] = 0;  // deflate
  header[11] = 0;  // adaptive filtering
  header[12] = 0;  // no interlace

  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let row = 0; row < size; row += 1) {
    raw[row * (stride + 1)] = 0; // filter: none
    Buffer.from(pixels.buffer, row * stride, stride).copy(raw, row * (stride + 1) + 1);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------------------------------------------------------------------- run */

const TARGETS = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'icon-maskable-512.png', size: 512, maskable: true },
  { file: 'apple-touch-icon.png', size: 180, maskable: true },
];

mkdirSync(OUT_DIR, { recursive: true });
for (const target of TARGETS) {
  const png = encodePng(target.size, raster(target.size, { maskable: target.maskable }));
  writeFileSync(join(OUT_DIR, target.file), png);
  process.stdout.write(`${target.file} — ${target.size}px, ${(png.length / 1024).toFixed(1)} kB\n`);
}

const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" role="img" aria-label="Finapp">
  <rect width="32" height="32" rx="7" fill="#2a78d6"/>
  <path d="M6.1 26.1h19.8" stroke="#ffffff" stroke-opacity="0.45" stroke-width="1.35" stroke-linecap="round"/>
  <path d="M6.1 22.4 12.8 15 17.4 19.4 25.6 9.6" fill="none" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="25.6" cy="9.6" r="2.8" fill="#ffffff"/>
</svg>
`;
writeFileSync(join(OUT_DIR, 'favicon.svg'), favicon);
process.stdout.write('favicon.svg\n');
