// HORDES — tools/capture_tier2_weapons.mjs (TIER-2(e) NEW WEAPONS, 2026-09-23).
//
// Renders every new weapon through the REAL fire/draw path into PNGs under
// docs/art/tier2-weapons/:
//   * icon:    shopIcon(id) — the resolver showShop calls (src/main.js:7777),
//              painted with a renderer.drawGrid-shaped adapter (the same
//              seam tools/capture_tier2_buyables.mjs rides).
//   * projectile: updateWeapons() fires the REAL archetype against a planted
//              foe, then paintProjectileBody() (src/render.js — the SAME
//              painter the frame loop calls) draws the kind-tagged body.
//              METEOR has no persistent body (its fire path emits a
//              nova_pulse tell + mine_blast blast through existing effect
//              seams) so it ships icon-only, as the contract allows.
//   * contact sheet: one row per weapon (icon | projectile), index tags 01..04.
//
// Self-contained PNG writer (house pattern, integer pixels only, no libs, no
// browser). All paths are in-tree; run: node tools/capture_tier2_weapons.mjs
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { shopIcon, SHOP_ICON_FALLBACK_ID } from '../src/art/shop_icons.js';
import { paintProjectileBody } from '../src/render.js';
import { makeWeapon, updateWeapons } from '../src/weapons.js';
import { makePlayer } from '../src/entities.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'docs', 'art', 'tier2-weapons');

const NEW_IDS = ['JAVELIN', 'EMBER', 'RICOCHET', 'METEOR'];
const SHOP_ID = { JAVELIN: 'weapon_javelin', EMBER: 'weapon_ember', RICOCHET: 'weapon_ricochet', METEOR: 'weapon_meteor' };
const BODY_KIND = { JAVELIN: 'javelin', EMBER: 'ember', RICOCHET: 'ricochet', METEOR: null };

// ---- minimal PNG writer (house pattern, cf. tools/capture_tier2_buyables.mjs) ----
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

// ---- tiny canvas (fillStyle/fillRect sink — the only members the painters touch) ----
function hexRgb(hex) {
  const s = String(hex).replace('#', '');
  const f = s.length === 3 ? s.split('').map(c => c + c).join('') : s;
  return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)];
}
function canvas(w, h) {
  const buf = Buffer.alloc(w * h * 3);
  const fill = (c) => { for (let i = 0; i < w * h; i++) { buf[i * 3] = c[0]; buf[i * 3 + 1] = c[1]; buf[i * 3 + 2] = c[2]; } };
  fill([10, 9, 14]);
  let style = [255, 255, 255];
  return {
    w, h, buf,
    set fillStyle(v) { style = typeof v === 'string' ? hexRgb(v) : v; },
    get fillStyle() { return style; },
    rect(x, y, rw, rh, c) {
      for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) {
        const px = x + i, py = y + j;
        if (px < 0 || py < 0 || px >= w || py >= h) continue;
        const k = (py * w + px) * 3;
        buf[k] = c[0]; buf[k + 1] = c[1]; buf[k + 2] = c[2];
      }
    },
    fillRect(x, y, rw, rh) {
      const c = style;
      const x0 = Math.round(x), y0 = Math.round(y), w0 = Math.round(rw), h0 = Math.round(rh);
      for (let j = 0; j < h0; j++) for (let i = 0; i < w0; i++) {
        const px = x0 + i, py = y0 + j;
        if (px < 0 || py < 0 || px >= w || py >= h) continue;
        const k = (py * w + px) * 3;
        buf[k] = c[0]; buf[k + 1] = c[1]; buf[k + 2] = c[2];
      }
    },
  };
}
// drawGrid-shaped: (g, grid, palette, x, y, scale) — the signature render.js
// drawGrid offers, exactly as main.js showShop calls it.
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

// ---- REAL fire: one planted foe, updateWeapons produces the body -------------
function fireBody(type) {
  const kind = BODY_KIND[type];
  if (!kind) return null;
  const p = makePlayer();
  p.x = 0; p.y = 0;
  const state = {
    player: p,
    enemies: [{ x: 60, y: 0, hp: 50, flash: 0 }],
    projectiles: [], effects: [], healBudget: 100, archBuffs: null,
  };
  const w = makeWeapon(type);
  w.cd = 0;
  updateWeapons(state, [w], 0.016);
  return state.projectiles.find(pr => pr.kind === kind) || null;
}

fs.mkdirSync(OUT, { recursive: true });
const ICON_SCALE = 16, PAD = 8;
const BODY_BOX = 48;                 // 48x48 window around the body origin
const CELL_W = 16 * ICON_SCALE + PAD * 2;
const CELL_H = Math.max(16 * ICON_SCALE, BODY_BOX * 2) + PAD * 2;

const sheetW = CELL_W * 2 + PAD;
const sheetH = CELL_H * NEW_IDS.length + PAD;
const sheet = canvas(sheetW, sheetH);

NEW_IDS.forEach((id, idx) => {
  // --- icon through the REAL shopIcon seam ---
  const asset = shopIcon(SHOP_ID[id]);
  if (!asset || asset.id === SHOP_ICON_FALLBACK_ID) {
    console.error('FAIL ' + id + ' resolved the fallback icon');
    process.exitCode = 1;
    return;
  }
  const iconCv = canvas(16 * ICON_SCALE + PAD * 2, 16 * ICON_SCALE + PAD * 2);
  drawGridInto(iconCv)(iconCv, asset.grid, asset.palette, PAD, PAD, ICON_SCALE);
  writePNG(path.join(OUT, 'weapon-' + id.toLowerCase() + '-icon.png'), iconCv.w, iconCv.h, iconCv.buf);

  // --- projectile through the REAL fire + draw path ---
  let bodyCv = null;
  const body = fireBody(id);
  if (body) {
    bodyCv = canvas(BODY_BOX * 2, BODY_BOX * 2);
    // paintProjectileBody(g, p, x, y, ph) — same call the frame loop makes.
    paintProjectileBody(bodyCv, body, BODY_BOX, BODY_BOX, 0);
    writePNG(path.join(OUT, 'weapon-' + id.toLowerCase() + '-projectile.png'), bodyCv.w, bodyCv.h, bodyCv.buf);
  }

  // --- contact-sheet row (icon | projectile) ---
  const cy = PAD + idx * CELL_H;
  drawGridInto(sheet)(sheet, asset.grid, asset.palette, PAD + PAD, cy + PAD, ICON_SCALE);
  if (bodyCv) {
    const bx = CELL_W + PAD, by = cy;
    for (let y = 0; y < bodyCv.h; y++) for (let x = 0; x < bodyCv.w; x++) {
      const k = (y * bodyCv.w + x) * 3;
      sheet.rect(bx + x, by + y, 1, 1, [bodyCv.buf[k], bodyCv.buf[k + 1], bodyCv.buf[k + 2]]);
    }
  } else {
    // METEOR: no persistent body — mark the cell so the sheet still reads.
    drawNum(sheet, 0, CELL_W + PAD + 20, cy + CELL_H / 2 - 2, [90, 90, 110]);
  }
  drawNum(sheet, idx + 1, 2, cy + 2, [230, 230, 240]);
  console.log('captured ' + id + (body ? ' (icon + projectile)' : ' (icon only — no persistent body)'));
});

writePNG(path.join(OUT, 'tier2-weapons-sheet.png'), sheet.w, sheet.h, sheet.buf);
console.log('sheet: docs/art/tier2-weapons/tier2-weapons-sheet.png');
