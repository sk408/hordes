// HORDES — PORT SLICE K2: shrine presentation (owner queue: megabonk shrines
// + VS).
//
// The slice re-dresses ONLY the shrine painter (visual-only, original art in
// src/art/shrines.js): one designed altar per shrine INDEX (orb / coil /
// hood — retheme 2026-09-23 off docs/gen_ref/shrine-altars/). Triggers,
// costs, rolls, pools, the re-arm latch, purse debits and darkening
// semantics are byte-identical — this file pins BOTH sides:
//
//   A. VARIANT MAP — exactly 3 index-deterministic designs (orb / coil /
//      hood); selection never
//      reads the blessing (honest display: the blessing is rolled+cached
//      pre-purchase but hidden, main.js:4036-4041 — per-blessing colors
//      would LEAK the roll, parked under OWNER-RULING).
//   B. COMPOSITION — every variant paints ORIGINAL 14x12 grid art in its own
//      palette through the real painter (marker trim inks per variant).
//   C. DETERMINISM — byte-identical repaints; the world blink only toggles
//      the coin glyph; spent paints the shared greys with no aura.
//   D. WORLD painter — the live view (state.shrine) paints its index's trim,
//      claims no other trim, adds no text.
//   E. NO-LEAK — different cached blessings paint byte-identically.
//   F. SEMANTICS FROZEN (quoted from test_shrines.mjs / test_s1_shrine_rearm)
//      — the cost curve, blessing determinism + pool exhaustion, the re-arm
//      latch (one sale per approach, hold, re-arm, broke-never-latches),
//      the exact purse debit, and pool-exhausted darkening (used, unlatched).
//   G. ART-LINT — the new module is NOT enumerated (counts unmoved).
//
// Run: node test/test_port_slice_k2.mjs
import assert from 'node:assert';
import { boot, suite } from './_harness.mjs';
import { Renderer } from '../src/render.js';
import { makePlayer } from '../src/entities.js';
import {
  seedShrines, shrineCost, shrineBlessing, canAfford,
  SHRINE_WORLD_COUNT, SHRINE_BASE_COST, SHRINE_COST_PER_WAVE,
  SHRINE_COST_USED_MULT,
} from '../src/shrines.js';
import { CHOICE_POOL } from '../src/choices.js';
import { mulberry32 } from '../src/weather.js';
import {
  SHRINE_VARIANTS, SHRINE_ART, SHRINE_SPENT, shrineArtFor, paintShrine,
} from '../src/art/shrines.js';
import { ART_ASSETS } from '../src/art/index.js';

const S = suite('port slice K2: shrine presentation');

// ---------- A. VARIANT MAP (index-deterministic, never blessing-read) ------
{
  S.check('exactly 3 index variants (orb, coil, hood)', () => {
    assert.deepStrictEqual(SHRINE_VARIANTS, ['orb', 'coil', 'hood']);
    for (const v of SHRINE_VARIANTS) assert.ok(SHRINE_ART[v], v + ' lacks art');
  });
  S.check('index selects the variant (stable all run, S1 set never re-seeds)', () => {
    assert.strictEqual(shrineArtFor(0), SHRINE_ART.orb, 'altar 0 is orb');
    assert.strictEqual(shrineArtFor(1), SHRINE_ART.coil, 'altar 1 is coil');
    assert.strictEqual(shrineArtFor(2), SHRINE_ART.hood, 'altar 2 is hood');
    assert.strictEqual(shrineArtFor(3), SHRINE_ART.orb, 'wraps, never undefined');
    assert.strictEqual(shrineArtFor(-1), SHRINE_ART.hood, 'negative wraps');
    assert.strictEqual(shrineArtFor(undefined), SHRINE_ART.orb, 'unknown falls back');
    assert.strictEqual(shrineArtFor('coil'), SHRINE_ART.orb, 'non-index falls back');
  });
  S.check('selection carries no blessing information (honest display)', () => {
    // The seam caches sh.blessing pre-purchase (main.js:4039) but hides it;
    // the resolver takes ONLY the index — two altars with different cached
    // blessings at the same index resolve to the identical art object.
    const a = { x: 1, y: 2, used: false, blessing: { offer: { id: 'blood_pact' }, cost: 60 } };
    const b = { x: 1, y: 2, used: false, blessing: { offer: { id: 'greed_core' }, cost: 60 } };
    assert.notStrictEqual(a.blessing.offer.id, undefined, 'fixture has a blessing');
    assert.strictEqual(shrineArtFor(0, a.blessing), shrineArtFor(0, b.blessing),
      'extra args never change the resolution');
    assert.strictEqual(shrineArtFor(1), SHRINE_ART.coil, 'index 1 regardless of cache');
  });
}

// ---------- B. FORMAT + COMPOSITION ----------------------------------------
const HOUSE_TRIM = { orb: '#30d8f0', coil: '#d08848', hood: '#7ae040' };
const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
function checkArt(label, art) {
  const { grid, palette, rows } = art;
  assert.ok(Array.isArray(grid) && grid.length > 0, label + ': non-empty grid');
  assert.strictEqual(art.w, 14, label + ': 14 wide (the altar size class)');
  assert.strictEqual(art.h, 12, label + ': 12 tall');
  assert.ok(grid.every((r) => Array.isArray(r) && r.length === 14), label + ': rectangular');
  const used = new Set();
  for (const row of grid) {
    for (const v of row) {
      assert.ok(Number.isInteger(v) && v >= 0 && v <= 8, label + ': cells are ints 0-8');
      if (v) used.add(v);
    }
  }
  assert.ok(used.size >= 4, label + ': composed (stone + trim + tells)');
  assert.deepStrictEqual(rows, grid.map((r) => r.join('')), label + ': rows derive from grid');
  for (const k of Object.keys(palette)) {
    assert.ok(/^[1-8]$/.test(k), label + ': palette keys 1-8');
    assert.ok(HEX.test(palette[k]), label + ': palette values are hex');
  }
  assert.deepStrictEqual(Object.keys(palette).sort(),
    ['1', '2', '3', '4', '5', '6', '7', '8'],
    label + ': palette carries all 8 documented keys');
  for (const v of used) assert.ok(palette[v], label + ': used index ' + v + ' defined');
  assert.strictEqual(palette[4], HOUSE_TRIM[art.variantKey],
    label + ': trim ink is the variant marker (' + palette[4] + ')');
  assert.ok(Array.isArray(art.glint) && art.glint.length === 2,
    label + ': ships the glint pair');
  for (const [gx, gy] of art.glint) {
    assert.ok(Number.isInteger(gx) && gx >= 0 && gx < art.w, label + ': glint x in range');
    assert.ok(Number.isInteger(gy) && gy >= 0 && gy < art.h, label + ': glint y in range');
  }
}
for (const v of SHRINE_VARIANTS) SHRINE_ART[v].variantKey = v;
for (const v of SHRINE_VARIANTS) {
  S.check('format: ' + v + ' is well-formed 14x12 grid art', () => {
    checkArt('shrine/' + v, SHRINE_ART[v]);
  });
  S.check(v + ' is a DISTINCT design (not a re-tint)', () => {
    for (const o of SHRINE_VARIANTS) {
      if (o === v) continue;
      assert.notStrictEqual(SHRINE_ART[v].grid.flat().join(','),
        SHRINE_ART[o].grid.flat().join(','), v + ' === ' + o);
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

for (const v of SHRINE_VARIANTS) {
  const art = SHRINE_ART[v];
  const { rec } = (() => { const m = makeCtx(); paintShrine(m.ctx, art, 0, 0, true); return m; })();
  S.check(v + ' paints COMPOSED art (' + rec.rects.length + ' rects)', () => {
    assert.ok(rec.rects.length >= 60, 'only ' + rec.rects.length + ' rects');
    const styles = new Set(rec.rects.map((q) => q.style));
    assert.ok(styles.has(art.palette[4]), 'missing the variant trim ink');
    assert.ok(styles.has(art.palette[1]), 'missing the ink outline');
  });
  S.check(v + ' repaints byte-identically (lit and spent)', () => {
    for (const lit of [true, false]) {
      const a = makeCtx(); paintShrine(a.ctx, art, 0, 0, lit);
      const b = makeCtx(); paintShrine(b.ctx, art, 0, 0, lit);
      assert.strictEqual(sig(b.rec), sig(a.rec), v + ' lit=' + lit + ' drifted');
    }
  });
  S.check(v + ' spent is the shared grey read (no hue tells)', () => {
    const spent = makeCtx(); paintShrine(spent.ctx, art, 0, 0, false);
    assert.strictEqual(countStyle(spent.rec, art.palette[4]), 0, 'spent keeps the trim hue');
    assert.ok(countStyle(spent.rec, SHRINE_SPENT[3]) > 0, 'spent paints the grey stone');
    const lit = makeCtx(); paintShrine(lit.ctx, art, 0, 0, true);
    assert.notStrictEqual(sig(spent.rec), sig(lit.rec), 'spent === lit');
  });
  S.check(v + ' emits no text', () => {
    assert.strictEqual(rec.texts.length, 0, 'painted text');
  });
}
S.check('lit adds the glint pair (2 trim-hi rects), spent adds none', () => {
  for (const v of SHRINE_VARIANTS) {
    const art = SHRINE_ART[v];
    const a = makeCtx(); paintShrine(a.ctx, art, 0, 0, true);
    const b = makeCtx(); paintShrine(b.ctx, art, 0, 0, true);
    void b;
    const plain = (() => {
      // glint cells are part of the grid; the overlay adds exactly 2.
      const cells = art.grid.flat().filter((x) => x).length;
      return cells;
    })();
    assert.strictEqual(a.rec.rects.length, plain + 2, v + ': lit adds 2 glint rects');
    const s1 = makeCtx(); paintShrine(s1.ctx, art, 0, 0, false);
    assert.strictEqual(s1.rec.rects.length, plain, v + ': spent is steady');
  }
});

// ---------- C+D. WORLD painter (live view, per-index trim, blink, spent) ---
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
  const views = SHRINE_VARIANTS.map((v, i) => {
    const sh = { x: 270, y: 150, used: false };
    const st = frameState({ shrines: i === 0 ? [sh, { x: -500, y: -500, used: false }, { x: 500, y: 500, used: false }]
      : i === 1 ? [{ x: -500, y: -500, used: false }, sh, { x: 500, y: 500, used: false }]
      : [{ x: -500, y: -500, used: false }, { x: 500, y: 500, used: false }, sh],
      shrine: sh });
    return { v, rec: renderFrame(st) };
  });
  for (const { v, rec } of views) {
    S.check('the live view paints its index trim (' + v + ' ' + HOUSE_TRIM[v] + ')', () => {
      assert.ok(countStyle(rec, HOUSE_TRIM[v]) > countStyle(base, HOUSE_TRIM[v]),
        'no ' + v + ' trim painted');
    });
    S.check('...and claims no sibling trim (' + v + ')', () => {
      for (const o of SHRINE_VARIANTS) {
        if (o === v) continue;
        assert.strictEqual(countStyle(rec, HOUSE_TRIM[o]), countStyle(base, HOUSE_TRIM[o]),
          v + ' view claims ' + o + ' trim');
      }
    });
  }
  S.check('the world altar repaints byte-identically', () => {
    const st = () => {
      const sh = { x: 270, y: 150, used: false };
      return frameState({ shrines: [sh], shrine: sh });
    };
    assert.strictEqual(sig(renderFrame(st())), sig(renderFrame(st())), 'repaint drifted');
  });
  S.check('the blink only toggles the coin glyph (1 old-gold rect)', () => {
    const mk = (t) => {
      const sh = { x: 270, y: 150, used: false };
      return frameState({ time: t, shrines: [sh], shrine: sh });
    };
    const gold = renderFrame(mk(4.0));    // floor(12)%2==0 -> #ffe9a8
    const cheap = renderFrame(mk(4.5));   // floor(13.5)%2==1 -> #c8a03a
    assert.strictEqual(countStyle(gold, '#ffe9a8') - countStyle(cheap, '#ffe9a8'), 1,
      'blink moved more than the coin glyph');
    assert.strictEqual(gold.rects.length, cheap.rects.length, 'blink changed the rect count');
  });
  S.check('a spent view paints the grey read (no trim, no coin, no aura)', () => {
    const sh = { x: 270, y: 150, used: true };
    const rec = renderFrame(frameState({ shrines: [sh], shrine: sh }));
    for (const v of SHRINE_VARIANTS) {
      assert.strictEqual(countStyle(rec, HOUSE_TRIM[v]), countStyle(base, HOUSE_TRIM[v]),
        'spent view keeps ' + v + ' trim');
    }
    assert.strictEqual(countStyle(rec, '#ffe9a8'), countStyle(base, '#ffe9a8'),
      'spent view keeps the coin glyph');
    assert.ok(countStyle(rec, SHRINE_SPENT[3]) > countStyle(base, SHRINE_SPENT[3]),
      'spent view never painted the grey stone');
  });
  S.check('field shrines add no text', () => {
    assert.strictEqual(views[0].rec.texts.length, base.texts.length, 'a shrine painted text');
  });
}

// ---------- E. NO-LEAK (cached blessings paint identically) ----------------
{
  S.check('different cached blessings paint byte-identically', () => {
    const mk = (id) => {
      const sh = { x: 270, y: 150, used: false,
        blessing: { offer: { id, title: 'T', desc: 'a / b', rarity: 'common' }, cost: 60 } };
      return frameState({ shrines: [sh], shrine: sh });
    };
    assert.strictEqual(sig(renderFrame(mk('blood_pact'))), sig(renderFrame(mk('greed_core'))),
      'the paint leaks the hidden roll');
  });
}

// ---------- F. SEMANTICS FROZEN (quoted economy asserts) -------------------
{
  S.check('cost curve pins (shrines.js: cost = round((60+30w) * 1.25^n))', () => {
    assert.equal(shrineCost(0, 0), 60, 'wave 0, first of run: 60');
    assert.equal(shrineCost(2, 0), 120, 'wave 2, first: 120');
    assert.equal(shrineCost(5, 0), 210, 'wave 5, first: 210');
    assert.equal(shrineCost(0, 1), 75, 'wave 0, second of run: 75');
    assert.equal(shrineCost(0, 2), 94, 'wave 0, third: 94');
    assert.equal(shrineCost(4, 2), 281, 'wave 4, third: 281');
    for (let w = 0; w <= 5; w++) {
      for (let n = 0; n <= 2; n++) {
        assert.equal(shrineCost(w, n),
          Math.round((SHRINE_BASE_COST + SHRINE_COST_PER_WAVE * w) *
                     Math.pow(SHRINE_COST_USED_MULT, n)),
          `formula holds (wave ${w}, used ${n})`);
      }
    }
  });
  S.check('blessing determinism + pool exhaustion (choices.js semantics)', () => {
    const a = shrineBlessing(2, mulberry32(77));
    const b = shrineBlessing(2, mulberry32(77));
    assert.equal(a.offer.id, b.offer.id, 'same seed -> same blessing');
    assert.equal(a.cost, shrineCost(2, 0), 'cost matches the curve for 0 taken');
    const rng = mulberry32(909);
    const taken = [];
    let blessings = 0;
    for (let wave = 0; wave < 20; wave++) {
      const bl = shrineBlessing(wave, rng, taken);
      if (!bl) break;
      assert.ok(!taken.includes(bl.offer.id), 'no repeat within the run');
      assert.equal(bl.cost, shrineCost(wave, taken.length), 'cost scales with prior sales');
      taken.push(bl.offer.id);
      blessings++;
    }
    assert.equal(blessings, CHOICE_POOL.length, 'run drains the pool exactly');
    assert.equal(shrineBlessing(3, mulberry32(1), taken), null, 'exhausted pool returns null');
  });
  S.check('world seed shape untouched (3 altars, integer, {x,y,used})', () => {
    const set = seedShrines(mulberry32(11));
    assert.equal(set.length, SHRINE_WORLD_COUNT, 'exactly the count dial');
    for (const s of set) {
      assert.deepEqual(Object.keys(s).sort(), ['used', 'x', 'y'], 'plain {x,y,used} shape');
      assert.equal(s.x, Math.round(s.x), 'integer pixel x');
    }
    assert.deepEqual(set, seedShrines(mulberry32(11)), 'same seed -> same set');
  });
}

// ---------- F (live): re-arm latch + debit + exhausted darkening -----------
{
  const h = await boot({ storage: [['hordes_onboarded', '1']] });
  const T = h.T, st = T.state;
  T.banners.suppressAll();
  const pinWorld = () => {
    st.spawnTimer = 1e9;
    st.wave.midAt = st.time + 1e9;
    st.wave.endsAt = st.time + 1e9;
    st.wave.midBossDone = true;
  };
  // Colliding pair FIXTURE (2.24px apart, one radius — the ~0.227% S1 case
  // test_s1_shrine_rearm proves with a real seed scan) through the REAL
  // startRun + purchase path (main.js:4028-4077).
  const pairRun = () => {
    st.mode = 'menu';
    h.elements['ov-cards'].innerHTML = '';
    T.startRun();
    h.pump(2);
    T.setPilotMode('MANUAL');
    h.pump(1);
    pinWorld();
    const p = st.player;
    st.shrines = [
      { x: 100, y: 100, used: false },
      { x: 102, y: 100, used: false },
      { x: -500, y: -500, used: false },
    ];
    st.shrine = st.shrines[0];
    return p;
  };

  const p = pairRun();
  const prof = T.getProfile();
  prof.runPurse = 1000;
  const cost0 = shrineCost(st.wave.num - 1, 0);
  const cost1 = shrineCost(st.wave.num - 1, 1);
  p.x = 100; p.y = 100;
  for (let i = 0; i < 5; i++) { pinWorld(); h.pump(1); }
  S.check('ONE sale per approach: the pair sells exactly ONE altar', () => {
    assert.equal(st.shrines.filter((sh) => sh.used).length, 1, 'pre-fix: both sold in one frame');
    assert.equal(prof.runPurse, 1000 - cost0, 'the purse was debited EXACTLY one cost');
    assert.equal(st.shrineRearm, true, 'the latch is SET by the successful debit');
  });
  for (let i = 0; i < 10; i++) { pinWorld(); h.pump(1); }
  S.check('the latch HOLDS while standing between the two altars', () => {
    assert.equal(st.shrines.filter((sh) => sh.used).length, 1, 'no second sale while standing');
    assert.equal(prof.runPurse, 1000 - cost0, 'no second debit');
  });
  p.x = 0; p.y = 0;
  pinWorld(); h.pump(1);
  S.check('leaving every radius CLEARS the latch', () => {
    assert.equal(st.shrineRearm, false, 'latch cleared once >26px from all unsold');
  });
  const second = st.shrines.find((sh) => !sh.used);
  p.x = second.x; p.y = second.y;
  for (let i = 0; i < 5; i++) { pinWorld(); h.pump(1); }
  S.check('the re-armed approach sells the SECOND altar (two-sale cost)', () => {
    assert.equal(st.shrines.filter((sh) => sh.used).length, 2, 'both used after re-arm');
    assert.equal(prof.runPurse, 1000 - cost0 - cost1, 'the second debit is the two-sale cost');
    assert.ok(canAfford(1000, cost0), 'affordability gate still read');
  });

  // Broke path never latches (fresh run, same pair fixture).
  const p2 = pairRun();
  const prof2 = T.getProfile();
  const c0 = shrineCost(st.wave.num - 1, 0);
  prof2.runPurse = c0 - 1;
  p2.x = 100; p2.y = 100;
  for (let i = 0; i < 5; i++) { pinWorld(); h.pump(1); }
  S.check('broke on the pair: ZERO sales and the latch stays CLEAR', () => {
    assert.equal(st.shrines.filter((sh) => sh.used).length, 0, 'no sale without the gold');
    assert.equal(prof2.runPurse, c0 - 1, 'no debit');
    assert.equal(st.shrineRearm, false, 'the broke path never sets the latch');
  });
  prof2.runPurse = 1000;
  pinWorld(); h.pump(1);
  S.check('a top-up while standing sells at once, then the latch holds', () => {
    assert.equal(st.shrines.filter((sh) => sh.used).length, 1, 'exactly one sale after top-up');
    assert.equal(prof2.runPurse, 1000 - c0, 'exactly one debit');
    assert.equal(st.shrineRearm, true, 'the sale set the latch');
  });

  // Pool-exhausted darkening (fresh run): every blessing taken -> the altar
  // goes dark with NO debit and NO latch (main.js:4042-4043).
  const p3 = pairRun();
  const prof3 = T.getProfile();
  prof3.runPurse = 10000;
  st.takenChoices.push(...CHOICE_POOL.map((e) => e.id));
  p3.x = 100; p3.y = 100;
  for (let i = 0; i < 5; i++) { pinWorld(); h.pump(1); }
  S.check('pool exhausted: the altar goes dark (used, no debit, no latch)', () => {
    assert.equal(st.shrines[0].used, true, 'the altar went dark');
    assert.equal(prof3.runPurse, 10000, 'no debit on exhaustion');
    assert.equal(st.shrineRearm, false, 'exhaustion never latches');
  });
}

// ---------- G. ART-LINT counts unmoved --------------------------------------
{
  S.check('shrine art is NOT enumerated (art-lint counts frozen)', () => {
    assert.ok(!ART_ASSETS.some((a) => a.section === 'shrines'), 'a shrines section leaked');
    assert.ok(!ART_ASSETS.some((a) => String(a.id || '').startsWith('shrine_')), 'a shrine asset leaked');
  });
}

S.done();
console.log('ALL PORT SLICE K2 SHRINE TESTS PASSED');
