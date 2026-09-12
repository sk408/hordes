// Minimal PNG writer + HORDES art contact-sheet renderer.
// Integer-pixel only, no smoothing, no external libs.
import zlib from 'node:zlib';
import fs from 'node:fs';
import { ART_SECTIONS } from '/home/claude/projects/hordes/src/art/index.js';

// ---------------------------------------------------------------- PNG ------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
// rgb: Uint8Array w*h*3
export function writePNG(path, w, h, rgb) {
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0; // filter none
    rgb.copy ? rgb.copy(raw, y * (1 + w * 3) + 1, y * w * 3, (y + 1) * w * 3)
             : Buffer.from(rgb.buffer, y * w * 3, w * 3).copy(raw, y * (1 + w * 3) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(path, png);
}

// ------------------------------------------------------------- canvas ------
const BG = [10, 9, 14];
const GRIDLINE = [32, 29, 48];
function Canvas(w, h, bg = BG) {
  const buf = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) { buf[i * 3] = bg[0]; buf[i * 3 + 1] = bg[1]; buf[i * 3 + 2] = bg[2]; }
  return {
    w, h, buf,
    px(x, y, c) {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const i = (y * w + x) * 3;
      buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2];
    },
    rect(x, y, rw, rh, c) { for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) this.px(x + i, y + j, c); },
    outline(x, y, rw, rh, c) {
      for (let i = 0; i < rw; i++) { this.px(x + i, y, c); this.px(x + i, y + rh - 1, c); }
      for (let j = 0; j < rh; j++) { this.px(x, y + j, c); this.px(x + rw - 1, y + j, c); }
    },
    // integer-scaled grid blit (one rect per source pixel)
    grid(grid, palette, x, y, s = 1) {
      for (let ry = 0; ry < grid.length; ry++) {
        const row = grid[ry];
        for (let rx = 0; rx < row.length; rx++) {
          const v = row[rx]; if (!v) continue;
          const hex = palette[v]; if (!hex) continue;
          const c = hexToRgb(hex);
          this.rect(x + rx * s, y + ry * s, s, s, c);
        }
      }
    },
  };
}
function hexToRgb(hex) {
  const s = hex.replace('#', '');
  const f = s.length === 3 ? s.split('').map(c => c + c).join('') : s;
  return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)];
}

// --------------------------------------------------------------- 3x5 digits
const DIGITS = {
  0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'],
  2: ['111', '001', '111', '100', '111'], 3: ['111', '001', '111', '001', '111'],
  4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'], 7: ['111', '001', '010', '010', '010'],
  8: ['111', '101', '111', '101', '111'], 9: ['111', '101', '111', '001', '111'],
};
function drawNum(cv, n, x, y, s, col) {
  const str = String(n);
  for (let i = 0; i < str.length; i++) {
    const g = DIGITS[str[i]];
    for (let ry = 0; ry < 5; ry++) for (let rx = 0; rx < 3; rx++)
      if (g[ry][rx] === '1') cv.rect(x + (i * 4 + rx) * s, y + ry * s, s, s, col);
  }
}

// ------------------------------------------------------------- sheets ------
export function sheet(items, opts) {
  const { cols, scale, cell, pad = 6, showNum = false, framed = false, startNum = 1 } = opts;
  const rows = Math.ceil(items.length / cols);
  const cw = cell, ch = cell;
  const W = cols * cw + pad * 2, H = rows * ch + pad * 2;
  const cv = Canvas(W, H);
  items.forEach((a, i) => {
    const cx = pad + (i % cols) * cw;
    const cy = pad + Math.floor(i / cols) * ch;
    cv.outline(cx, cy, cw, ch, GRIDLINE);
    const frames = a.frames || [a.grid];
    const n = framed ? frames.length : 1;
    const innerW = a.w * scale;
    const innerH = a.h * scale;
    const totalW = n * innerW + (n - 1) * 2 * (scale > 2 ? 1 : 0);
    const ox = cx + Math.max(1, Math.floor((cw - totalW) / 2));
    const oy = cy + Math.max(1, Math.floor((ch - innerH) / 2));
    frames.forEach((fr, f) => {
      if (framed && f > 0 && n > 1) {
        // thin separator so two frames don't merge
        for (let j = 0; j < innerH; j++) cv.px(ox + f * (innerW + 1), oy + j, [60, 55, 85]);
      }
      cv.grid(fr, a.palette, ox + f * (innerW + 1), oy, scale);
    });
    if (showNum) drawNum(cv, startNum + i, cx + 3, cy + 3, 2, [200, 196, 220]);
  });
  return cv;
}

// ---------------------------------------------------------------- main -----
const ARGV = process.argv.slice(2);
const which = ARGV[0] || 'all';
const opt = {};
for (let i = 1; i < ARGV.length; i++) {
  const m = /^--([a-z]+)=(.*)$/.exec(ARGV[i]);
  if (m) opt[m[1]] = m[2];
}

function inkCount(cv) {
  let ink = 0;
  for (let i = 0; i < cv.w * cv.h; i++) {
    const r = cv.buf[i * 3], g = cv.buf[i * 3 + 1], b = cv.buf[i * 3 + 2];
    const isBg = (r === 10 && g === 9 && b === 14) || (r === 21 && g === 19 && b === 29) || (r === 29 && g === 26 && b === 40);
    if (!isBg) ink++;
  }
  return ink;
}

const out = [];
for (const sec of ART_SECTIONS) {
  if (which !== 'all' && sec.id !== which) continue;
  if (sec.kind === 'layered') continue;
  const isPortrait = sec.id === 'portraits';
  const isShop = sec.id === 'shop';
  const scale = opt.scale ? +opt.scale : (isShop ? 10 : 8);
  const cell = opt.cell ? +opt.cell : (isPortrait ? 580 : 300);
  const cols = opt.cols ? +opt.cols : (isPortrait ? 4 : (isShop ? 7 : 6));
  const from = opt.from ? +opt.from : 1;
  const to = opt.to ? +opt.to : sec.items.length;
  const items = sec.items.slice(from - 1, to);
  const cv = sheet(items, { cols, scale, cell, showNum: opt.nonum ? false : true, framed: isPortrait, startNum: from });
  const path = `/tmp/a2/sheet_${sec.id}${opt.tag || ''}.png`;
  writePNG(path, cv.w, cv.h, cv.buf);
  const ink = inkCount(cv);
  out.push({ section: sec.id, path, w: cv.w, h: cv.h, ink, pct: +(100 * ink / (cv.w * cv.h)).toFixed(1), items: items.length, from, to });
}
console.log(JSON.stringify(out, null, 2));
