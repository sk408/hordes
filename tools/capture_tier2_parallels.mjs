// HORDES — tools/capture_tier2_parallels.mjs (TIER-2(d) CARD PARALLEL/VARIANT
// SYSTEM). Renders each of the 5 parallel types on 2+ different base cards
// through the REAL drawCard path — parallelCardArt(deckId, pid) ->
// drawCardArt(g, art, 0, 0, OFFER_ART_SCALE), the ONE painter drawCard itself
// delegates to (src/render_cards.js) — into PNGs under
// docs/art/tier2-parallels/. The raster ctx is a minimal fillStyle/fillRect
// sink (the only two members the default painter touches); the pixels are
// provably the derived deck art because no other painter runs.
// Run: node tools/capture_tier2_parallels.mjs
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { cardArt } from '../src/art/cards.js';
import { drawCardArt, cardBox } from '../src/render_cards.js';
import { parallelCardArt, PARALLEL_IDS, pulsePhase } from '../src/parallels.js';
import { OFFER_ART_SCALE } from '../src/draft_card_art.js';

const OUT = new URL('../docs/art/tier2-parallels/', import.meta.url);
fs.mkdirSync(OUT, { recursive: true });

// 4 base cards x 5 parallels = 20 shots — COMMON number (hp / Iron Heart),
// RARE face (thornmail / Thornmail), MYTHIC ace (killshot / Killshot) and the
// CHASE joker (second_wind / Second Wind), so every rank family is covered.
const BASES = ['hp', 'thornmail', 'killshot', 'second_wind'];

function hexRgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
// CRC-32 (IEEE) for the PNG chunks.
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
function chunkCrc(type, data) {
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
    chunkCrc('IHDR', ihdr),
    chunkCrc('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunkCrc('IEND', Buffer.alloc(0)),
  ]));
}

function rasterSink(buf, w, h) {
  let style = '#ffffff';
  return {
    set fillStyle(v) { style = v; },
    get fillStyle() { return style; },
    fillRect(x, y, rw, rh) {
      const [r, gg, b] = hexRgb(style);
      for (let j = y; j < y + rh; j++) {
        for (let i = x; i < x + rw; i++) {
          if (i < 0 || j < 0 || i >= w || j >= h) continue;
          const k = (j * w + i) * 3;
          buf[k] = r; buf[k + 1] = gg; buf[k + 2] = b;
        }
      }
    },
  };
}

const inkOf = (buf, n) => {
  let ink = 0;
  for (let i = 0; i < n; i++) if (buf[i * 3] || buf[i * 3 + 1] || buf[i * 3 + 2]) ink++;
  return ink;
};

let failed = 0;
const { w: cw, h: ch } = cardBox(OFFER_ART_SCALE);
const shots = [];
for (const pid of PARALLEL_IDS) {
  for (const deckId of BASES) {
    const base = cardArt(deckId);
    const art = parallelCardArt(deckId, pid);
    if (!base || !art) { console.error('FAIL no variant art for ' + deckId + ':' + pid); failed++; continue; }
    const buf = new Uint8Array(cw * ch * 3); // transparent backing stays black (0,0,0)
    const g = rasterSink(buf, cw, ch);
    if (!drawCardArt(g, art, 0, 0, OFFER_ART_SCALE)) {
      console.error('FAIL drawCardArt refused ' + deckId + ':' + pid); failed++; continue;
    }
    const ink = inkOf(buf, cw * ch);
    const file = new URL(pid + '-' + deckId + '.png', OUT);
    writePNG(file, cw, ch, buf);
    shots.push({ pid, deckId, ink, file: path.basename(file.toString()) });
    const phase = pid === 'pulse' ? ' phase=' + pulsePhase(deckId) : '';
    console.log('ok   ' + pid + '-' + deckId + ' (' + base.rank + ' of ' + (base.suit || 'none') +
      ', ' + base.tier + ')' + phase + ' ' + cw + 'x' + ch + ' inked=' + ink +
      ' :: ' + path.basename(file.toString()));
    if (ink < 200) { console.error('FAIL ' + deckId + ':' + pid + ' painted almost nothing'); failed++; }
  }
}

// Contact sheet: PARALLEL_IDS (rows) x BASES (cols), the capture dir's
// standard contract (tier2-buyables precedent).
{
  const pad = 8, cols = BASES.length, rows = PARALLEL_IDS.length;
  const sw = cols * cw + (cols + 1) * pad;
  const sh = rows * ch + (rows + 1) * pad;
  const sheet = new Uint8Array(sw * sh * 3);
  for (let i = 0; i < sheet.length; i += 3) { sheet[i] = 18; sheet[i + 1] = 18; sheet[i + 2] = 24; }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const deckId = BASES[c], pid = PARALLEL_IDS[r];
      const art = parallelCardArt(deckId, pid);
      if (!art) continue;
      const cell = new Uint8Array(cw * ch * 3);
      drawCardArt(rasterSink(cell, cw, ch), art, 0, 0, OFFER_ART_SCALE);
      const ox = pad + c * (cw + pad), oy = pad + r * (ch + pad);
      for (let y = 0; y < ch; y++) {
        for (let x = 0; x < cw; x++) {
          const src = (y * cw + x) * 3, dst = ((oy + y) * sw + ox + x) * 3;
          if (!cell[src] && !cell[src + 1] && !cell[src + 2]) continue;   // transparent -> sheet bg
          sheet[dst] = cell[src]; sheet[dst + 1] = cell[src + 1]; sheet[dst + 2] = cell[src + 2];
        }
      }
    }
  }
  writePNG(new URL('parallels-sheet.png', OUT), sw, sh, sheet);
  console.log('ok   contact sheet parallels-sheet.png (' + rows + 'x' + cols + ') ' + sw + 'x' + sh);
}

console.log(failed ? 'capture_tier2_parallels: ' + failed + ' FAILED'
  : 'capture_tier2_parallels: ' + shots.length + '/20 captured + sheet');
process.exit(failed ? 1 : 0);
