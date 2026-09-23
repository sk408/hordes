// HORDES — PORT SLICE K: chest presentation (owner-priority "good chest art").
//
// The slice re-dresses ONLY chest painters (visual-only, original art in
// src/art/chests.js): the sealed world chest, the per-band OPEN remnant
// under a chest's item drop, and the collection burst. Triggers, ttls,
// pools, odds, contents, gold and label semantics are byte-identical — this
// file pins BOTH sides:
//
//   A. BAND MAP — the art covers EXACTLY the bands chests.js rolls
//      (CHESTS.RARITY_WEIGHTS, chests.js:41); gamble keeps its own moment
//      look and is NOT a band (chests.js:47). A band without art is a NAMED
//      fail.
//   B. COMPOSITION — every band paints ORIGINAL closed+open grid art in its
//      own palette through the real painters (marker trim inks per band).
//   C. DETERMINISM — byte-identical repaints; the world blink only toggles
//      the lock glint; a moved burst re-phases (site hash, never the clock).
//   D. ASCII — chest painters emit geometry only, never text.
//   E. SEMANTICS FROZEN (quoted from test_chests.mjs / the label fix) — the
//      owner ladder values, the gamble's independent 1-in-10 roll, the pinned
//      rng draw order per band, pickRarity-never-gamble, the spawn path
//      stamping no display band, and the live label naming the ITEM's rarity.
//
// Run: node test/test_port_slice_k.mjs
import assert from 'node:assert';
import { boot, suite } from './_harness.mjs';
import { Renderer } from '../src/render.js';
import { makePlayer, makeEnemy } from '../src/entities.js';
import {
  CHESTS, pickRarity, maybeSpawnChest, rollContents,
} from '../src/chests.js';
import { LEGENDARIES, AFFIX_COUNT } from '../src/loot.js';
import { CHEST_RARITY_LADDER } from '../src/rules.js';
import {
  CHEST_BANDS, GAMBLE_KEY, SEALED_KEY, CHEST_ART, chestArtFor, paintChest,
} from '../src/art/chests.js';

const S = suite('port slice K: chest presentation');

const seq = (vals) => {
  let i = 0;
  return () => {
    if (i >= vals.length) throw new Error(`rng exhausted (call ${i + 1}, have ${vals.length})`);
    return vals[i++];
  };
};

// ---------- A. BAND MAP (derived from chests.js, not re-typed) ---------------
{
  const bands = Object.keys(CHESTS.RARITY_WEIGHTS);
  S.check('art covers EXACTLY the bands chests.js rolls (' + bands.join(',') + ')', () => {
    assert.deepStrictEqual(CHEST_BANDS, bands,
      'CHEST_BANDS must equal Object.keys(CHESTS.RARITY_WEIGHTS) in order');
    assert.deepStrictEqual(CHEST_RARITY_LADDER, bands, 'bump ladder == band order');
  });
  S.check('gamble is not a rarity (own roll, own moment look)', () => {
    assert.ok(!('gamble' in CHESTS.RARITY_WEIGHTS), 'gamble not in the ladder');
    assert.ok(!CHEST_BANDS.includes(GAMBLE_KEY), 'gamble not in CHEST_BANDS');
    assert.strictEqual(CHESTS.GAMBLE_CHANCE, 0.10, 'gamble keeps its 1-in-10 roll');
  });
  for (const b of CHEST_BANDS) {
    S.check('band ' + b + ' ships CLOSED + OPEN art', () => {
      assert.ok(CHEST_ART[b] && CHEST_ART[b].closed, 'band ' + b + ' lacks CLOSED art');
      assert.ok(CHEST_ART[b] && CHEST_ART[b].open, 'band ' + b + ' lacks OPEN art');
    });
  }
  S.check('gamble ships its own CLOSED + OPEN moment art', () => {
    assert.ok(CHEST_ART[GAMBLE_KEY] && CHEST_ART[GAMBLE_KEY].closed, 'gamble lacks CLOSED art');
    assert.ok(CHEST_ART[GAMBLE_KEY] && CHEST_ART[GAMBLE_KEY].open, 'gamble lacks OPEN art');
  });
  S.check('the sealed world chest ships CLOSED art (never open)', () => {
    assert.ok(CHEST_ART[SEALED_KEY] && CHEST_ART[SEALED_KEY].closed, 'sealed lacks CLOSED art');
    assert.strictEqual(CHEST_ART[SEALED_KEY].open, undefined, 'a sealed chest is never open');
  });
  S.check('chestArtFor falls back to sealed (never a false rarity claim)', () => {
    assert.strictEqual(chestArtFor('nope', 'closed'), CHEST_ART[SEALED_KEY].closed);
    assert.strictEqual(chestArtFor('common', 'nope'), CHEST_ART.common.closed);
    assert.strictEqual(chestArtFor(SEALED_KEY, 'open'), CHEST_ART[SEALED_KEY].closed);
    assert.strictEqual(chestArtFor('rare', 'open'), CHEST_ART.rare.open);
  });
}

// ---------- B. FORMAT + COMPOSITION (art-lint mirror, light) -----------------
const HOUSE_TRIM = {
  common: '#6e6e7c', rare: '#4a8cff', epic: '#c46ad8',
  legendary: '#ffd75e', gamble: '#7a2e3e', sealed: '#55555f',
};
const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
function checkArt(label, art, wantOpen) {
  const { grid, palette, rows } = art;
  assert.ok(Array.isArray(grid) && grid.length > 0, label + ': non-empty grid');
  const w = grid[0].length;
  assert.ok(grid.every((r) => Array.isArray(r) && r.length === w), label + ': rectangular');
  const used = new Set();
  for (const row of grid) {
    for (const v of row) {
      assert.ok(Number.isInteger(v) && v >= 0 && v <= 9, label + ': cells are ints 0-9');
      if (v) used.add(v);
    }
  }
  assert.ok(used.size > 0, label + ': has pixels');
  assert.deepStrictEqual(rows, grid.map((r) => r.join('')), label + ': rows derive from grid');
  for (const k of Object.keys(palette)) {
    assert.ok(/^[1-9]$/.test(k), label + ': palette keys 1-9');
    assert.ok(HEX.test(palette[k]), label + ': palette values are hex');
  }
  for (const v of used) assert.ok(palette[v], label + ': used index ' + v + ' defined');
  assert.strictEqual(palette[4], HOUSE_TRIM[art.bandKey],
    label + ': trim ink is the band ink (' + palette[4] + ')');
  void wantOpen;
}
for (const b of [...CHEST_BANDS, GAMBLE_KEY, SEALED_KEY]) {
  CHEST_ART[b].closed.bandKey = b;
  if (CHEST_ART[b].open) CHEST_ART[b].open.bandKey = b;
}
for (const b of [...CHEST_BANDS, GAMBLE_KEY, SEALED_KEY]) {
  S.check('format: ' + b + ' closed is well-formed grid art', () => {
    checkArt('chest/' + b + '/closed', CHEST_ART[b].closed);
  });
  if (CHEST_ART[b].open) {
    S.check('format: ' + b + ' open is well-formed grid art', () => {
      checkArt('chest/' + b + '/open', CHEST_ART[b].open);
    });
    S.check(b + ' open is a DISTINCT frame (not a still)', () => {
      const a = CHEST_ART[b].closed.grid.flat().join(',');
      const c = CHEST_ART[b].open.grid.flat().join(',');
      assert.notStrictEqual(a, c, b + ': open === closed');
    });
  }
}

// recording ctx (slice-H pattern + drawImage + measureText for the full frame)
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
function frameState(over) {
  const p = makePlayer();
  p.x = 240; p.y = 150;
  const st = {
    player: p, time: 4.0, toasts: [], items: [], weapons: [],
    weather: null, mode: 'playing', zoom: 1, groundSeed: 7,
    enemies: [], projectiles: [], enemyShots: [], gems: [], drops: [],
    itemDrops: [], chests: [], arches: [], effects: [], chestBurst: null,
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
const sig = (rec) => rec.rects.map((q) => [q.x, q.y, q.w, q.h, q.style].join(',')).join('|');
const countStyle = (rec, style) => rec.rects.filter((q) => q.style === style).length;

// paintChest unit checks per band/form
for (const b of [...CHEST_BANDS, GAMBLE_KEY, SEALED_KEY]) {
  for (const form of Object.keys(CHEST_ART[b])) {
    const art = CHEST_ART[b][form];
    const { ctx, rec } = makeCtx();
    paintChest(ctx, art, 0, 0, false);
    const { rec: recLit } = (() => { const m = makeCtx(); paintChest(m.ctx, art, 0, 0, true); return m; })();
    S.check(b + '/' + form + ' paints COMPOSED art (' + rec.rects.length + ' rects)', () => {
      assert.ok(rec.rects.length >= 100, 'only ' + rec.rects.length + ' rects');
      const styles = new Set(rec.rects.map((q) => q.style));
      assert.ok(styles.has(art.palette[4]), 'missing the band trim ink');
      assert.ok(styles.has(art.palette[1]), 'missing the ink outline');
    });
    S.check(b + '/' + form + ' repaints byte-identically', () => {
      const m = makeCtx();
      paintChest(m.ctx, art, 0, 0, false);
      assert.strictEqual(
        m.rec.rects.map((q) => [q.x, q.y, q.w, q.h, q.style].join(',')).join('|'),
        rec.rects.map((q) => [q.x, q.y, q.w, q.h, q.style].join(',')).join('|'));
    });
    S.check(b + '/' + form + ' emits no text', () => {
      assert.strictEqual(rec.texts.length, 0, 'painted text');
    });
    void recLit;
  }
}
S.check('lit adds the lock glint on closed frames only', () => {
  for (const b of [...CHEST_BANDS, GAMBLE_KEY, SEALED_KEY]) {
    const closed = CHEST_ART[b].closed;
    const a = makeCtx(); paintChest(a.ctx, closed, 0, 0, false);
    const c = makeCtx(); paintChest(c.ctx, closed, 0, 0, true);
    assert.strictEqual(c.rec.rects.length - a.rec.rects.length, 2, b + ': lit adds 2 glint rects');
  }
  for (const b of CHEST_BANDS) {
    const open = CHEST_ART[b].open;
    const a = makeCtx(); paintChest(a.ctx, open, 0, 0, false);
    const c = makeCtx(); paintChest(c.ctx, open, 0, 0, true);
    assert.strictEqual(c.rec.rects.length, a.rec.rects.length, b + ' open: steady shine');
  }
});

// ---------- C. WORLD painter (sealed default + capture-only band override) ---
{
  const base = renderFrame(frameState());
  const sealed = renderFrame(frameState({ chests: [{ id: 1, x: 270, y: 150, age: 0 }] }));
  S.check('a field chest paints the SEALED design (unknown contents)', () => {
    assert.ok(countStyle(sealed, HOUSE_TRIM.sealed) > countStyle(base, HOUSE_TRIM.sealed),
      'sealed trim never painted');
    for (const b of ['rare', 'epic', 'legendary']) {
      assert.strictEqual(countStyle(sealed, HOUSE_TRIM[b]), countStyle(base, HOUSE_TRIM[b]),
        'a sealed chest claims no ' + b + ' trim');
    }
  });
  for (const b of [...CHEST_BANDS, GAMBLE_KEY]) {
    const rec = renderFrame(frameState({ chests: [{ id: 7, x: 270, y: 150, age: 0.6, band: b }] }));
    S.check('band override ch.' + b + ' paints its trim (' + HOUSE_TRIM[b] + ')', () => {
      assert.ok(countStyle(rec, HOUSE_TRIM[b]) > countStyle(base, HOUSE_TRIM[b]),
        'no ' + b + ' trim painted');
    });
  }
  S.check('the world chest repaints byte-identically', () => {
    const st = () => frameState({ chests: [{ id: 3, x: 270, y: 150, age: 1.0 }] });
    assert.strictEqual(sig(renderFrame(st())), sig(renderFrame(st())), 'repaint drifted');
  });
  S.check('the blink only toggles the lock glint (2 old-gold rects)', () => {
    const lit = renderFrame(frameState({ chests: [{ id: 3, x: 270, y: 150, age: 0 }] }));
    const unlit = renderFrame(frameState({ chests: [{ id: 3, x: 270, y: 150, age: 0.5 }] }));
    assert.strictEqual(countStyle(lit, '#c8a03a') - countStyle(unlit, '#c8a03a'), 2,
      'blink moved more than the glint');
  });
  S.check('field chests add no text', () => {
    assert.strictEqual(sealed.texts.length, base.texts.length, 'a chest painted text');
  });
}

// ---------- D. OPEN remnant (true band under the chest item drop) ------------
const DROP_RARITY = { common: 'COMMON', rare: 'RARE', epic: 'EPIC', legendary: 'LEGENDARY', gamble: 'RARE' };
{
  const plain = renderFrame(frameState({
    itemDrops: [{ x: 270, y: 150, item: { rarity: 'RARE', name: 't' }, age: 0 }],
  }));
  for (const b of [...CHEST_BANDS, GAMBLE_KEY]) {
    const rec = renderFrame(frameState({
      itemDrops: [{ x: 270, y: 150, item: { rarity: DROP_RARITY[b], name: 't' }, age: 0, chest: b }],
    }));
    S.check('open remnant ' + b + ' paints its trim under the drop', () => {
      assert.ok(countStyle(rec, HOUSE_TRIM[b]) > countStyle(plain, HOUSE_TRIM[b]),
        'no ' + b + ' remnant painted');
    });
  }
  S.check('the item glyph keeps its exact record over the remnant', () => {
    const mk = (chest) => renderFrame(frameState({
      itemDrops: [{ x: 270, y: 150, item: { rarity: 'RARE', name: 't' }, age: 0, ...(chest ? { chest } : {}) }],
    }));
    const withRem = mk('rare'), without = mk(null);
    const glyph = (rec) => rec.rects.filter((q) =>
      q.style === '#4a8cff' && q.x === 268 && q.y === 148 && q.w === 5 && q.h === 5);
    assert.strictEqual(glyph(withRem).length, 1, 'glyph moved under the remnant');
    assert.strictEqual(glyph(without).length, 1, 'baseline glyph missing');
  });
  S.check('remnants repaint byte-identically and add no text', () => {
    const st = () => frameState({
      itemDrops: [{ x: 270, y: 150, item: { rarity: 'EPIC', name: 't' }, age: 0, chest: 'epic' }],
    });
    assert.strictEqual(sig(renderFrame(st())), sig(renderFrame(st())), 'remnant repaint drifted');
    const rec = renderFrame(st());
    assert.strictEqual(rec.texts.length, renderFrame(frameState()).texts.length, 'remnant painted text');
  });
}

// ---------- E. BURST dressing (same trigger/ttl, richer paint) ---------------
{
  const st = (t, x, y) => frameState({
    chestBurst: { x: x === undefined ? 270 : x, y: y === undefined ? 150 : y, t, milestone: 50, reward: 1 },
  });
  const base = renderFrame(frameState());
  const mid = renderFrame(st(0.45));
  S.check('the burst paints COMPOSED art (+' + (mid.rects.length - base.rects.length) + ' rects mid-life)', () => {
    assert.ok(mid.rects.length - base.rects.length >= 24, 'burst is still plain (was +16)');
  });
  S.check('early burst adds the white core cross', () => {
    const early = renderFrame(st(0.05));
    assert.ok(countStyle(early, '#ffffff') > countStyle(mid, '#ffffff'), 'no core cross');
    assert.ok(early.rects.length - base.rects.length >= 30, 'early burst is thin');
  });
  for (const ink of ['#fff2c0']) {
    S.check('burst carries its marker ink ' + ink, () => {
      assert.ok(countStyle(mid, ink) > countStyle(base, ink), 'no ' + ink + ' from the burst');
    });
  }
  S.check('burst carries the pale echo ring', () => {
    const echo = (rec) => rec.rects.filter((q) => q.style.startsWith('rgba(255,233,168')).length;
    assert.ok(echo(mid) > echo(base), 'no echo ring from the burst');
  });
  S.check('same burst site repaints byte-identically', () => {
    assert.strictEqual(sig(renderFrame(st(0.45))), sig(renderFrame(st(0.45))), 'burst repaint drifted');
  });
  S.check('a moved burst re-phases the crackle (site hash, not clock)', () => {
    assert.notStrictEqual(sig(renderFrame(st(0.45))), sig(renderFrame(st(0.45, 281, 163))),
      'site change did not re-phase');
  });
  S.check('burst adds no text', () => {
    assert.strictEqual(mid.texts.length, base.texts.length, 'burst painted text');
  });
}

// ---------- F. SEMANTICS FROZEN (quoted — economy untouched) -----------------
{
  S.check('the ladder is the owner ladder (98/1.7/0.2/0.02, total 99.92)', () => {
    assert.deepStrictEqual(CHESTS.RARITY_WEIGHTS, { common: 98, rare: 1.7, epic: 0.2, legendary: 0.02 });
    const tot = Object.values(CHESTS.RARITY_WEIGHTS).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(tot - 99.92) < 1e-9, 'total moved: ' + tot);
  });
  const GM = 0.5; // gamble-miss draw
  S.check('common band: COMMON item, no upgrades, no potions', () => {
    const c = rollContents({ player: makePlayer(), enemies: [] }, seq([GM, 0.0, 0.0]));
    assert.strictEqual(c.rarity, 'common');
    assert.ok(!('upgrades' in c));
    assert.strictEqual(c.item.rarity, 'COMMON');
    assert.strictEqual(c.item.affixes.length, AFFIX_COUNT.COMMON);
    assert.deepStrictEqual(c.potions, { hp: 0, mp: 0 });
  });
  S.check('rare band: RARE item + 1 potion', () => {
    const r = rollContents({ player: makePlayer(), enemies: [] }, seq([GM, 0.99, 0.0, 0.0, 0.7]));
    assert.strictEqual(r.rarity, 'rare');
    assert.strictEqual(r.item.rarity, 'RARE');
    assert.deepStrictEqual(r.potions, { hp: 0, mp: 1 });
  });
  S.check('epic band: EPIC item, no token offer', () => {
    const e = rollContents({ player: makePlayer(), enemies: [] }, seq([GM, 0.9985, 0.0, 0.0, 0.0]));
    assert.strictEqual(e.rarity, 'epic');
    assert.strictEqual(e.item.rarity, 'EPIC');
    assert.ok(!('tokenOptions' in e));
  });
  S.check('legendary band: the hand-authored BOOTS unique, no upgrades', () => {
    const l = rollContents({ player: makePlayer(), enemies: [] }, seq([GM, 0.9999, 0.5]));
    assert.strictEqual(l.rarity, 'legendary');
    assert.strictEqual(l.item.rarity, 'LEGENDARY');
    assert.strictEqual(l.item.slot, 'BOOTS');
    assert.strictEqual(l.item.name, LEGENDARIES.BOOTS.name);
    assert.ok(!('upgrades' in l));
  });
  S.check('gamble: win pays RARE + flasks, loss pays nothing (own roll)', () => {
    const win = rollContents({ player: makePlayer(), enemies: [] }, seq([0.05, 0.3, 0.1, 0.9]));
    assert.strictEqual(win.rarity, 'gamble');
    assert.strictEqual(win.gambleWin, true);
    assert.strictEqual(win.item.rarity, CHESTS.GAMBLE_WIN_ITEM_RARITY);
    assert.deepStrictEqual(win.potions, { hp: 1, mp: 1 });
    const lose = rollContents({ player: makePlayer(), enemies: [] }, seq([0.05, 0.7]));
    assert.strictEqual(lose.gambleWin, false);
    assert.strictEqual(lose.item, null);
  });
  S.check('pickRarity never yields a gamble', () => {
    for (const v of [0.0, 0.5, 0.9999999]) {
      assert.notStrictEqual(pickRarity(seq([v])), 'gamble');
    }
  });
  S.check('the spawn path stamps NO display band (game never writes ch.band)', () => {
    const st = { player: makePlayer(), enemies: [], chests: [], time: 30 };
    const elite = makeEnemy(10, 10, 120);
    const chest = maybeSpawnChest(st, elite, seq([0.0]));
    assert.ok(chest, 'elite kill should spawn');
    assert.ok(!('band' in chest), 'spawn stamped a display band');
  });
}

// ---------- G. LIVE label (the owner-ruled fix, through the real path) -------
{
  const h = await boot({ variant: 'slice-k-live' });
  h.T.startRun();
  const st = h.state, p = st.player;
  h.pump(2);
  const RARITIES = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY'];
  // The belt holds 4: early chest items are equipped on the spot (no drop
  // left), later ones are swapped/ignored onto the ground. Collect a STAMPED
  // ground drop (an ignored arrival keeps its stamp; a swap-back is an older
  // world drop and carries none) with its attempt's opened band + label.
  let seen = null;
  for (let attempt = 0; attempt < 60 && !seen; attempt++) {
    st.toasts.length = 0;
    st.itemDrops.length = 0;
    st.chests.length = 0;
    st.enemies.length = 0;
    st.gems.length = 0;
    st.spawnTimer = 999;
    st.chests.push({ id: 70000 + attempt, x: p.x, y: p.y, age: 0 });
    h.pump(3);
    const msgs = st.toasts.map((t) => t.msg);
    const openToast = msgs.find((m) => m.startsWith('CHEST OPENED: '));
    if (!openToast) continue;
    const opened = openToast.slice('CHEST OPENED: '.length);
    const stamped = st.itemDrops.find((d) => d && d.item && d.chest);
    if (!stamped) continue;
    const label = msgs.find((m) => RARITIES.some((r) => m.startsWith(r + ': ')) &&
      m.includes(stamped.item.name.toUpperCase()));
    seen = { opened, chest: stamped.chest, item: stamped.item, label };
  }
  S.check('a live chest opens through the real seam', () => {
    assert.ok(seen, 'no stamped chest drop in 60 attempts');
  });
  S.check('the drop carries the TRUE rolled band (' + (seen && seen.chest) + ')', () => {
    assert.strictEqual(seen.chest.toUpperCase(), seen.opened,
      'stamp ' + seen.chest + ' disagrees with the opened band ' + seen.opened);
  });
  S.check('the label names the ITEM\'s own rarity (' + (seen && seen.label) + ')', () => {
    assert.ok(seen.label, 'no item label toasted for ' + seen.item.name);
    assert.ok(seen.label.startsWith(seen.item.rarity + ': '),
      'label "' + seen.label + '" lies about ' + seen.item.rarity + ' ' + seen.item.name);
  });
}

S.done();
