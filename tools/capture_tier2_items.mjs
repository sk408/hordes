// HORDES — tier-2 item icon captures (2026-09-23).
//
// Renders every tier-2 portrait through the REAL seam (itemIconFor +
// paintItemIcon from src/art/item_icons.js — the same painter the belt in
// render.js calls) onto an in-tree contact sheet + one PNG per find:
//   docs/art/tier2-items/tier2-<affixid>.png  (14 files)
//   docs/art/tier2-items/tier2-sheet.png      (7x2 contact sheet)
//
// Self-contained PNG writer (house pattern, integer pixels only, no libs, no
// browser). All paths are in-tree; run: node tools/capture_tier2_items.mjs
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { itemIconFor, paintItemIcon, ITEM_AFFIX_ART_IDS } from '../src/art/item_icons.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'docs', 'art', 'tier2-items');

// ---- minimal PNG writer (house pattern, cf. tools/art_render.mjs) ----
const CRC = (() => {
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
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function writePNG(file, w, h, rgb) {
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0;
    Buffer.from(rgb.buffer, y * w * 3, w * 3).copy(raw, y * (1 + w * 3) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]));
}

// ---- tiny canvas + the drawGrid-shaped adapter (the real-seam adapter) ----
function hexRgb(hex) {
  const s = hex.replace('#', '');
  const f = s.length === 3 ? s.split('').map(c => c + c).join('') : s;
  return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)];
}
function canvas(w, h) {
  const buf = Buffer.alloc(w * h * 3);
  const fill = (c) => { for (let i = 0; i < w * h; i++) { buf[i * 3] = c[0]; buf[i * 3 + 1] = c[1]; buf[i * 3 + 2] = c[2]; } };
  fill([10, 9, 14]);
  return {
    w, h, buf,
    rect(x, y, rw, rh, c) {
      for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) {
        const px = x + i, py = y + j;
        if (px < 0 || py < 0 || px >= w || py >= h) continue;
        const k = (py * w + px) * 3;
        buf[k] = c[0]; buf[k + 1] = c[1]; buf[k + 2] = c[2];
      }
    },
  };
}
// drawGrid-shaped: (g, grid, palette, x, y, scale) — the signature the real
// renderer offers (render.js drawGrid). paintItemIcon cannot tell the adapter
// from the game canvas.
function drawGridInto(cv) {
  return (g, grid, palette, x, y, scale = 1) => {
    const s = Math.max(1, Math.floor(scale));
    for (let ry = 0; ry < grid.length; ry++) for (let rx = 0; rx < grid[ry].length; rx++) {
      const v = grid[ry][rx];
      if (v) g.rect(x + rx * s, y + ry * s, s, s, hexRgb(palette[v]));
    }
  };
}

// 3x5 digit renderer for the sheet index tags.
const DIGITS = {
  0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'],
  2: ['111', '001', '111', '100', '111'], 3: ['111', '001', '111', '001', '111'],
  4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'], 7: ['111', '001', '010', '010', '010'],
  8: ['111', '101', '111', '101', '111'], 9: ['111', '101', '111', '001', '111'],
};
function drawNum(cv, n, x, y, col) {
  for (const [i, ch] of [...String(n)].entries()) {
    const g = DIGITS[ch];
    for (let ry = 0; ry < 5; ry++) for (let rx = 0; rx < 3; rx++)
      if (g[ry][rx] === '1') cv.rect(x + (i * 4 + rx), y + ry, 1, 1, col);
  }
}

fs.mkdirSync(OUT, { recursive: true });
const SCALE = 16, PAD = 8, CELL = 8 * SCALE + PAD * 2;
const out = [];

// One PNG per find, resolved + painted through the real seam.
for (const id of ITEM_AFFIX_ART_IDS) {
  const item = { id: 'cap_' + id, rarity: 'RARE', affixes: [{ id, field: 'x', magnitude: 0 }] };
  const art = itemIconFor(item);   // the belt's own resolver
  if (!art || art.id !== id) throw new Error('seam resolve failed for ' + id);
  const cv = canvas(CELL, CELL);
  paintItemIcon(drawGridInto(cv), cv, art, PAD, PAD, SCALE);   // the belt's own painter
  const file = path.join(OUT, `tier2-${id}.png`);
  writePNG(file, cv.w, cv.h, cv.buf);
  out.push({ id, file: path.basename(file), w: cv.w, h: cv.h });
}

// Contact sheet: 7 cols x 2 rows, index tags 01..14 (lane order).
const COLS = 7, ROWS = 2;
const sheet = canvas(COLS * CELL, ROWS * CELL);
ITEM_AFFIX_ART_IDS.forEach((id, i) => {
  const cx = (i % COLS) * CELL, cy = Math.floor(i / COLS) * CELL;
  sheet.rect(cx, cy, CELL, CELL, [10, 9, 14]);
  sheet.rect(cx, cy, CELL, 1, [32, 29, 48]);
  const item = { id: 'cap_' + id, rarity: 'RARE', affixes: [{ id, field: 'x', magnitude: 0 }] };
  paintItemIcon(drawGridInto(sheet), sheet, itemIconFor(item), cx + PAD, cy + PAD, SCALE);
  drawNum(sheet, i + 1, cx + 3, cy + 3, [200, 196, 220]);
});
writePNG(path.join(OUT, 'tier2-sheet.png'), sheet.w, sheet.h, sheet.buf);
out.push({ id: '__sheet', file: 'tier2-sheet.png', w: sheet.w, h: sheet.h });

console.log(JSON.stringify({ dir: 'docs/art/tier2-items', files: out.length, cells: out }, null, 2));
