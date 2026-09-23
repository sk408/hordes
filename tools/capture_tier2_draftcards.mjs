// HORDES — tools/capture_tier2_draftcards.mjs (TIER-2(b) NEW DRAFT CARDS).
// Renders each new draft-pool card through the REAL draft-card art path —
// cardArt() -> drawCard(g, id, 0, 0, OFFER_ART_SCALE) — into PNGs under
// docs/art/tier2-draftcards/. The raster ctx is a minimal fillStyle/fillRect
// sink (the only two members drawCard's default painter touches); the pixels
// are provably the deck art because no other painter runs.
// Run: node tools/capture_tier2_draftcards.mjs
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { cardArt } from '../src/art/cards.js';
import { drawCard, cardBox } from '../src/render_cards.js';
import { deckIdForOffer, OFFER_ART_SCALE } from '../src/draft_card_art.js';

const OUT = new URL('../docs/art/tier2-draftcards/', import.meta.url);
fs.mkdirSync(OUT, { recursive: true });

const OFFERS = ['thorns', 'rewrite_shatter', 'rewrite_cinder', 'rewrite_frostwire', 'tempest', 'killshot'];

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

let failed = 0;
for (const offer of OFFERS) {
  const deckId = deckIdForOffer(offer);
  const art = deckId && cardArt(deckId);
  if (!deckId || !art) { console.error('FAIL no deck art for ' + offer); failed++; continue; }
  const { w, h } = cardBox(OFFER_ART_SCALE);
  const buf = new Uint8Array(w * h * 3); // transparent backing stays black (0,0,0)
  let style = '#ffffff';
  const g = {
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
  if (!drawCard(g, deckId, 0, 0, OFFER_ART_SCALE)) { console.error('FAIL drawCard refused ' + deckId); failed++; continue; }
  let ink = 0;
  for (let i = 0; i < w * h; i++) if (buf[i * 3] || buf[i * 3 + 1] || buf[i * 3 + 2]) ink++;
  const file = new URL(deckId + '.png', OUT);
  writePNG(file, w, h, buf);
  console.log('ok   ' + offer + ' -> ' + deckId + ' (' + art.rank + ' of ' + art.suit + ', ' +
    art.tier + ') ' + w + 'x' + h + ' inked=' + ink + ' :: ' + path.basename(file.toString()));
  if (ink < 200) { console.error('FAIL ' + deckId + ' painted almost nothing'); failed++; }
}
console.log(failed ? 'capture_tier2_draftcards: ' + failed + ' FAILED' : 'capture_tier2_draftcards: 6/6 captured');
process.exit(failed ? 1 : 0);
