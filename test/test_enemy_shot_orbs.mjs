// ENEMY SHOT ORBS (R1, the November review: "enemy shots become round red-orange orbs,
// no longer gem-coloured"). Every enemy shot kind paints a round pixel disc whose body is
// red-orange, the colour reserved for danger, and none of its colours is a gem colour.
// Run: node test/test_enemy_shot_orbs.mjs
import assert from 'node:assert/strict';
import { SHOT_PAINT, GEM_TIERS } from '../src/render.js';

let n = 0;
const check = (name, fn) => { fn(); n++; console.log('  ok - ' + name); };

// A recording context: the painted pixel grid, colour per cell (later rects win).
function paint(kind) {
  const px = new Map();
  const g = { fillStyle: '#000', fillRect(x, y, w, h) { for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) px.set((x + i) + ',' + (y + j), this.fillStyle); } };
  SHOT_PAINT[kind](g, 0, 0);
  return px;
}
const hsl = (hex) => {
  const v = parseInt(hex.slice(1), 16), r = (v >> 16) / 255, g = ((v >> 8) & 255) / 255, b = (v & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) h = mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  return { h: (h + 360) % 360, s, l };
};
const KINDS = ['spit', 'bolt', 'nova', 'maw'];

check('every kind has a painter', () => {
  assert.deepEqual(Object.keys(SHOT_PAINT).sort(), [...KINDS].sort());
});

check('each orb is a round disc: a 5x5 (a 7x7 bolt) with its four corners empty', () => {
  for (const k of KINDS) {
    const px = paint(k);
    const r = k === 'bolt' ? 3 : 2;
    const xs = [...px.keys()].map(s => +s.split(',')[0]), ys = [...px.keys()].map(s => +s.split(',')[1]);
    assert.deepEqual([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)], [-r, r, -r, r], k + ' size');
    for (const [cx, cy] of [[-r, -r], [r, -r], [-r, r], [r, r]]) assert.ok(!px.has(cx + ',' + cy), k + ' corner ' + cx + ',' + cy + ' is empty');
    for (let i = -r; i <= r; i++) { assert.ok(px.has(i + ',0'), k + ' row through the middle'); assert.ok(px.has('0,' + i), k + ' column through the middle'); }
  }
});

check('the body (the most-painted colour) is red-orange: hue 5-30, strongly saturated', () => {
  for (const k of KINDS) {
    const count = new Map();
    for (const c of paint(k).values()) count.set(c, (count.get(c) || 0) + 1);
    const body = [...count.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const { h, s, l } = hsl(body);
    assert.ok(h >= 5 && h <= 30 && s >= 0.85 && l >= 0.45 && l <= 0.65, k + ' body ' + body + ' hsl ' + [h.toFixed(0), s.toFixed(2), l.toFixed(2)]);
  }
});

check('no orb colour is a gem colour, and none is green, teal, blue or violet', () => {
  const gems = new Set(GEM_TIERS.flat().map(c => c.toLowerCase()));
  for (const k of KINDS) {
    for (const c of new Set(paint(k).values())) {
      assert.ok(!gems.has(c.toLowerCase()), k + ' uses the gem colour ' + c);
      const { h, s } = hsl(c);
      assert.ok(s < 0.2 || h <= 45 || h >= 345, k + ' colour ' + c + ' (hue ' + h.toFixed(0) + ') is outside the danger family');
    }
  }
});

console.log('test_enemy_shot_orbs: ' + n + ' checks passed');
