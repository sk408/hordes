// HORDES — ARCH ART PASS: field-arch presentation (owner queue: "generate
// replacement arches" — the shrine-retheme treatment for the field arches).
//
// The pass re-dresses ONLY the arch painter (visual-only, original art in
// src/art/arches.js): one designed gate per TYPE (twin_fury / magnet /
// aegis / berserker / zephyr — retheme 2026-09-24 off
// docs/gen_ref/field-arches/). Spawn, trigger, stacking, durations, mods
// and shieldHits are byte-identical (src/arches.js untouched) — this file
// pins BOTH sides:
//
//   A. VARIANT MAP — exactly 5 type-keyed designs; ARCH_TYPE_KEYS covers
//      every ARCH_TYPES id; unknown types fall back.
//   B. COMPOSITION — every variant is well-formed 24x35 grid art in its own
//      palette through the real painter (type ink = ARCH_COLORS family).
//   C. DETERMINISM — byte-identical repaints (lit and spent).
//   D. DOMINANT INK — palette[4] equals the ARCH_COLORS hex for the type
//      AND is the most-used ink in the grid (identity read, not vibes).
//   E. RENDER SEAM — the live view paints active AND inactive arches; the
//      shimmer field differs between the two states.
//   F. ART-LINT — the new module is NOT enumerated (counts unmoved).
//
// Run: node test/test_arch_art.mjs
import assert from 'node:assert';
import { suite } from './_harness.mjs';
import { Renderer } from '../src/render.js';
import { makePlayer } from '../src/entities.js';
import { ARCH_TYPES } from '../src/arches.js';
import {
  ARCH_VARIANTS, ARCH_TYPE_KEYS, ARCH_ART, ARCH_SPENT, archArtFor, paintArch,
} from '../src/art/arches.js';
import { ART_ASSETS, ART_COUNTS } from '../src/art/index.js';

const S = suite('arch art pass: field-arch presentation');

// The type identity inks (render.js ARCH_COLORS — the buff-read family).
const ARCH_INKS = {
  twin_fury: '#ff8848',   // DOUBLE_FIRE (orange)
  magnet: '#4a8cff',      // MAGNET (blue)
  aegis: '#a8e0ff',       // SHIELD (ice)
  berserker: '#ff5566',   // BERSERK (red)
  zephyr: '#68e080',      // SWIFT (green)
};
const TYPE_OF = {
  twin_fury: 'DOUBLE_FIRE', magnet: 'MAGNET', aegis: 'SHIELD',
  berserker: 'BERSERK', zephyr: 'SWIFT',
};

// ---------- A. VARIANT MAP --------------------------------------------------
{
  S.check('exactly 5 type variants (twin_fury, magnet, aegis, berserker, zephyr)', () => {
    assert.deepStrictEqual(ARCH_VARIANTS,
      ['twin_fury', 'magnet', 'aegis', 'berserker', 'zephyr']);
    for (const v of ARCH_VARIANTS) assert.ok(ARCH_ART[v], v + ' lacks art');
  });
  S.check('every ARCH_TYPES id resolves to its designed gate', () => {
    assert.deepStrictEqual(Object.keys(ARCH_TYPES).sort(),
      ['BERSERK', 'DOUBLE_FIRE', 'MAGNET', 'SHIELD', 'SWIFT'],
      'ARCH_TYPES moved (protected)');
    for (const [type, key] of Object.entries(ARCH_TYPE_KEYS)) {
      assert.ok(ARCH_TYPES[type], type + ' is not an ARCH_TYPES id');
      assert.strictEqual(archArtFor(type), ARCH_ART[key],
        type + ' must resolve to ' + key);
    }
  });
  S.check('unknown types fall back (never undefined)', () => {
    assert.strictEqual(archArtFor('NOPE'), ARCH_ART.twin_fury);
    assert.strictEqual(archArtFor(undefined), ARCH_ART.twin_fury);
    assert.strictEqual(archArtFor(null), ARCH_ART.twin_fury);
    assert.strictEqual(archArtFor(42), ARCH_ART.twin_fury);
  });
}

// ---------- B. FORMAT + COMPOSITION ----------------------------------------
const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
function checkArt(label, art) {
  const { grid, palette, rows } = art;
  assert.ok(Array.isArray(grid) && grid.length > 0, label + ': non-empty grid');
  assert.strictEqual(art.w, 24, label + ': 24 wide (the gate size class)');
  assert.strictEqual(art.h, 35, label + ': 35 tall');
  assert.ok(grid.every((r) => Array.isArray(r) && r.length === 24), label + ': rectangular');
  const used = new Set();
  for (const row of grid) {
    for (const v of row) {
      assert.ok(Number.isInteger(v) && v >= 0 && v <= 8, label + ': cells are ints 0-8');
      if (v) used.add(v);
    }
  }
  assert.ok(used.size >= 4, label + ': composed (stone + type ink + tells)');
  assert.deepStrictEqual(rows, grid.map((r) => r.join('')), label + ': rows derive from grid');
  for (const k of Object.keys(palette)) {
    assert.ok(/^[1-8]$/.test(k), label + ': palette keys 1-8');
    assert.ok(HEX.test(palette[k]), label + ': palette values are hex');
  }
  assert.deepStrictEqual(Object.keys(palette).sort(),
    ['1', '2', '3', '4', '5', '6', '7', '8'],
    label + ': palette carries all 8 documented keys');
  for (const v of used) assert.ok(palette[v], label + ': used index ' + v + ' defined');
  assert.ok(Array.isArray(art.glint) && art.glint.length === 2,
    label + ': ships the glint pair');
  for (const [gx, gy] of art.glint) {
    assert.ok(Number.isInteger(gx) && gx >= 0 && gx < art.w, label + ': glint x in range');
    assert.ok(Number.isInteger(gy) && gy >= 0 && gy < art.h, label + ': glint y in range');
  }
}
for (const v of ARCH_VARIANTS) {
  S.check('format: ' + v + ' is well-formed 24x35 grid art', () => {
    checkArt('arch/' + v, ARCH_ART[v]);
  });
  S.check(v + ' is a DISTINCT design (not a re-tint)', () => {
    for (const o of ARCH_VARIANTS) {
      if (o === v) continue;
      assert.notStrictEqual(ARCH_ART[v].grid.flat().join(','),
        ARCH_ART[o].grid.flat().join(','), v + ' === ' + o);
    }
  });
}

// recording ctx (slice-K pattern)
function makeCtx() {
  const rec = { rects: [], texts: [], depth: 0 };
  const ctx = {
    canvas: null,
    fillStyle: '#000000', globalAlpha: 1, font: '10px monospace',
    textAlign: 'left', textBaseline: 'top', imageSmoothingEnabled: true,
    lineWidth: 1, strokeStyle: '#000000',
    setTransform() {}, translate() {}, scale() {}, rotate() {},
    clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, arc() {},
    drawImage() {},
    measureText() { return { width: 10 }; },
    save() { rec.depth++; },
    restore() { rec.depth = Math.max(0, rec.depth - 1); },
    fillRect(x, y, w, h) {
      rec.rects.push({ x, y, w, h, d: rec.depth, n: rec.rects.length, style: String(ctx.fillStyle) });
    },
    fillText(txt, x, y) { rec.texts.push({ txt: String(txt), x, y }); },
  };
  return { ctx, rec };
}
const sig = (rec) => rec.rects.map((q) => [q.x, q.y, q.w, q.h, q.style].join(',')).join('|');
const countStyle = (rec, style) => rec.rects.filter((q) => q.style === style).length;

for (const v of ARCH_VARIANTS) {
  const art = ARCH_ART[v];
  const { rec } = (() => { const m = makeCtx(); paintArch(m.ctx, art, 0, 0, true); return m; })();
  S.check(v + ' paints COMPOSED art (' + rec.rects.length + ' rects)', () => {
    assert.ok(rec.rects.length >= 80, 'only ' + rec.rects.length + ' rects');
    const styles = new Set(rec.rects.map((q) => q.style));
    assert.ok(styles.has(art.palette[4]), 'missing the type ink');
    assert.ok(styles.has(art.palette[1]), 'missing the ink outline');
  });
  S.check(v + ' repaints byte-identically (active and inactive)', () => {
    for (const active of [true, false]) {
      const a = makeCtx(); paintArch(a.ctx, art, 0, 0, active);
      const b = makeCtx(); paintArch(b.ctx, art, 0, 0, active);
      assert.strictEqual(sig(b.rec), sig(a.rec), v + ' active=' + active + ' drifted');
    }
  });
  S.check(v + ' inactive is the shared grey read (no hue tells)', () => {
    const spent = makeCtx(); paintArch(spent.ctx, art, 0, 0, false);
    assert.strictEqual(countStyle(spent.rec, art.palette[4]), 0, 'inactive keeps the type hue');
    assert.ok(countStyle(spent.rec, ARCH_SPENT[1]) > 0, 'inactive paints the grey ink');
    assert.ok(countStyle(spent.rec, ARCH_SPENT[2]) > 0, 'inactive paints the grey stone');
    const lit = makeCtx(); paintArch(lit.ctx, art, 0, 0, true);
    assert.notStrictEqual(sig(spent.rec), sig(lit.rec), 'inactive === active');
  });
  S.check(v + ' emits no text', () => {
    assert.strictEqual(rec.texts.length, 0, 'painted text');
  });
}
S.check('active adds the glint pair (2 type-hi rects), inactive adds none', () => {
  for (const v of ARCH_VARIANTS) {
    const art = ARCH_ART[v];
    const a = makeCtx(); paintArch(a.ctx, art, 0, 0, true);
    const cells = art.grid.flat().filter((x) => x).length;
    assert.strictEqual(a.rec.rects.length, cells + 2, v + ': active adds 2 glint rects');
    const s1 = makeCtx(); paintArch(s1.ctx, art, 0, 0, false);
    assert.strictEqual(s1.rec.rects.length, cells, v + ': inactive is steady');
  }
});

// ---------- D. DOMINANT INK (identity pinned to ARCH_COLORS) ----------------
for (const v of ARCH_VARIANTS) {
  S.check(v + ' dominant ink is the ARCH_COLORS family (' + ARCH_INKS[v] + ')', () => {
    const art = ARCH_ART[v];
    assert.strictEqual(art.palette[4], ARCH_INKS[v],
      v + ': palette[4] must be the type ink');
    const counts = {};
    for (const row of art.grid) {
      for (const c of row) if (c) counts[c] = (counts[c] || 0) + 1;
    }
    let top = null;
    for (const [k, n] of Object.entries(counts)) {
      if (!top || n > counts[top]) top = k;
    }
    assert.strictEqual(top, '4',
      v + ': key 4 must be the dominant grid ink (was key ' + top + ')');
    assert.strictEqual(TYPE_OF[v] && ARCH_TYPES[TYPE_OF[v]].id, TYPE_OF[v],
      v + ': type id still resolves');
  });
}

// ---------- E. RENDER SEAM (active + inactive paint; shimmer differs) ------
function frameState(over) {
  const p = makePlayer();
  p.x = 240; p.y = 150;
  const st = {
    player: p, time: 4.0, toasts: [], items: [], weapons: [],
    weather: null, mode: 'playing', zoom: 1, groundSeed: 7,
    enemies: [], projectiles: [], enemyShots: [], gems: [], drops: [],
    itemDrops: [], chests: [], arches: [], effects: [], chestBurst: null,
    shrines: [], shrine: null,
    wave: { num: 1, boss: null, bosses: [] },
    cam: { x: 0, y: 0 },
  };
  return Object.assign(st, over || {});
}
function renderFrame(st) {
  const { ctx, rec } = makeCtx();
  const canvas = { width: 0, height: 0, getContext: () => ctx,
    getBoundingClientRect: () => ({ width: 0, height: 0 }) };
  ctx.canvas = canvas;
  new Renderer(canvas).render(st, { x: 0, y: 0 });
  return rec;
}
{
  const base = renderFrame(frameState());
  const shimmerRects = (rec) => rec.rects.filter((q) =>
    q.w === 16 && q.h === 32 && String(q.style).startsWith('rgba(255,255,255,'));
  for (const v of ARCH_VARIANTS) {
    const type = TYPE_OF[v];
    S.check('the live view paints ' + type + ' as ' + v + ' (' + ARCH_INKS[v] + ')', () => {
      const rec = renderFrame(frameState({
        arches: [{ id: 1, type, x: 270, y: 150 }],
      }));
      assert.ok(countStyle(rec, ARCH_INKS[v]) > countStyle(base, ARCH_INKS[v]),
        'no ' + v + ' type ink painted');
      assert.strictEqual(shimmerRects(rec).length, 1, 'untriggered arch keeps the shimmer field');
    });
    S.check(v + ': inactive still paints, shimmer differs', () => {
      const on = renderFrame(frameState({
        arches: [{ id: 1, type, x: 270, y: 150 }],
      }));
      const off = renderFrame(frameState({
        arches: [{ id: 1, type, x: 270, y: 150, used: true }],
      }));
      assert.ok(off.rects.length > base.rects.length + 40,
        'inactive arch painted nothing');
      assert.strictEqual(shimmerRects(on).length, 1, 'active keeps the shimmer');
      assert.strictEqual(shimmerRects(off).length, 0, 'inactive drops the shimmer');
      assert.notStrictEqual(sig(on), sig(off), 'active === inactive frames');
    });
    S.check(v + ': the world arch repaints byte-identically', () => {
      const st = () => frameState({
        arches: [{ id: 1, type, x: 270, y: 150 }],
      });
      assert.strictEqual(sig(renderFrame(st())), sig(renderFrame(st())), 'repaint drifted');
    });
  }
  S.check('field arches add no text', () => {
    const rec = renderFrame(frameState({
      arches: [{ id: 1, type: 'MAGNET', x: 270, y: 150 }],
    }));
    assert.strictEqual(rec.texts.length, base.texts.length, 'an arch painted text');
  });
}

// ---------- F. ART-LINT counts unmoved --------------------------------------
{
  S.check('arch art is NOT enumerated (art-lint counts frozen)', () => {
    assert.ok(!ART_ASSETS.some((a) => a.section === 'arches'), 'an arches section leaked');
    assert.ok(!ART_ASSETS.some((a) => String(a.id || '').startsWith('arch_')), 'an arch asset leaked');
    assert.ok(!('arches' in ART_COUNTS), 'ART_COUNTS grew an arches key');
    assert.ok(!('shrines' in ART_COUNTS), 'ART_COUNTS grew a shrines key');
  });
}

S.done();
console.log('ALL ARCH ART TESTS PASSED');
