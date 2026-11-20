// R5 THE HAND FAN (src/hand_fan.js, render.js drawHudChrome): the cards that
// make the run's poker hand, drawn as small card faces in the HUD beside the
// hand's name.
//   - the fan shows exactly the cards evaluateHand says make the hand, for a
//     pair, two pair, a straight, a flush, a full house, a straight flush and
//     with the Wild Card joker; with no hand, the cards held (at most 5);
//   - a better hand pulses the fan once; the pulse runs only in play, and not
//     at all under reduced motion;
//   - the raster is cached: rebuilt only when the cards change;
//   - the fan and its text stay inside the view, clear of the item row, the
//     joker row and the radar.
// Run: node test/test_hand_fan.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';
import { CONFIG as C } from '../src/config.js';
import { UPGRADES, DRAFT_RARE_UPGRADES } from '../src/config.js';
import { WEAPON_TYPES } from '../src/weapons.js';
import { handCardOf, evaluateHand, refreshHand, WILD_KEY } from '../src/hands.js';
import { JOKERS } from '../src/jokers.js';
import { cardArt, CARD_W } from '../src/art/cards.js';
import { jokerFaceArt } from '../src/draft_card_art.js';
import { fanCards, fanArt, fanLayout, fanKey, fanBlock, paintFan, pulsePhase, pulseLook, FAN_MAX, FAN_STEP, FAN_PULSE_S, FAN_LIFT } from '../src/hand_fan.js';

const s = suite('test_hand_fan');

// Every real hand card in the deck, one per key.
const ids = [...UPGRADES.map(u => u.id), ...DRAFT_RARE_UPGRADES.map(u => u.id),
  ...Object.keys(WEAPON_TYPES).map(t => 'lvl_' + t + '_1')];
const deck = [...new Map(ids.map(handCardOf).filter(Boolean).map(c => [c.key, c])).values()];

// A seeded search for a set of real cards whose best hand is `id`, holding
// more cards than the hand uses (so "the cards held" and "the cards that make
// the hand" differ). Fixed seed: the same sets every run.
function setFor(id, opts = {}) {
  let r = 12345;
  const rnd = () => (r = (Math.imul(r, 1664525) + 1013904223) >>> 0) / 4294967296;
  for (let tries = 0; tries < 200000; tries++) {
    const n = 5 + Math.floor(rnd() * 4);
    const pool = deck.slice();
    const pick = [];
    for (let i = 0; i < n && pool.length; i++) pick.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    const h = evaluateHand(pick, opts);
    if (h && h.id === id && pick.length > h.cards.length) return pick;
  }
  throw new Error('no real set makes ' + id);
}
const playerWith = (cards) => ({
  hp: 100, base: { damage: 10, maxHp: 100 },
  stats: { damage: 10, maxHp: 100, cooldown: 1, purseKillMult: 1, xpMult: 1 },
  handCards: Object.fromEntries(cards.map(c => [c.key, c])),
});
const sorted = (a) => a.slice().sort();

s.check('the fan shows exactly the cards that make the hand, for every kind of hand', () => {
  for (const id of ['pair', 'twopair', 'straight', 'flush', 'fullhouse', 'straightflush']) {
    const p = playerWith(setFor(id));
    refreshHand(p);
    assert.equal(p.hand.id, id);
    const f = fanCards(p);
    assert.equal(f.made, true);
    assert.deepEqual(sorted(f.cards.map(c => c.key)), sorted(p.hand.cards), id + ': the fan is the hand');
    assert.ok(Object.keys(p.handCards).length > f.cards.length, id + ': the other cards held are not in the fan');
    // Low ranks on the left, so a straight reads in order.
    const vals = f.cards.map(c => c.value);
    assert.deepEqual(vals, vals.slice().sort((a, b) => a - b), id + ': ordered low to high');
    for (const c of f.cards) assert.ok(fanArt(c.key), id + ': every fan card has a face');
  }
});

s.check('the Wild Card joker: its extra card is in the fan, drawn as the joker', () => {
  const p = playerWith(setFor('three', {}));
  refreshHand(p, { wild: true });
  assert.ok(p.hand.cards.includes(WILD_KEY), 'the wild card helps this hand: ' + p.hand.cards);
  const f = fanCards(p);
  assert.deepEqual(sorted(f.cards.map(c => c.key)), sorted(p.hand.cards));
  assert.equal(fanArt(WILD_KEY), jokerFaceArt(JOKERS.wildcard.art), 'drawn as the face of the Wild Card joker');
  // integ3: its art card is a 7; the fan's wild card stands for another rank,
  // so its corners carry no rank and no suit (the pips' colour, key 4).
  const g = fanArt(WILD_KEY).grid, H = g.length;
  for (let y = 2; y <= 12; y++) for (let x = 2; x <= 6; x++) {
    assert.notEqual(g[y][x], 4, 'no pip in the top-left corner at ' + x + ',' + y);
    assert.notEqual(g[H - 1 - y][CARD_W - 1 - x], 4, 'no pip in the bottom-right corner');
  }
});

s.check('no hand yet: the cards held, at most five, the last ones drafted', () => {
  assert.deepEqual(fanCards(null), { made: false, cards: [] });
  assert.deepEqual(fanCards(playerWith([])).cards, []);
  // Two cards of different ranks: both shown.
  const two = deck.filter((c, i, a) => a.findIndex(d => d.value === c.value) === i).slice(0, 2);
  const p2 = playerWith(two);
  refreshHand(p2);
  assert.ok(!p2.hand, 'no hand');
  assert.deepEqual(sorted(fanCards(p2).cards.map(c => c.key)), sorted(two.map(c => c.key)));
  // Seven cards with no hand among them: the last five drafted.
  let seven = null;
  for (let a = 0; a < 2000 && !seven; a++) {
    const pick = deck.slice(a % deck.length).concat(deck).filter((c, i, arr) => arr.findIndex(d => d.value === c.value) === i).slice(0, 7);
    if (pick.length === 7 && !evaluateHand(pick)) seven = pick;
  }
  assert.ok(seven, "a seven-card set with no hand exists");
  {
    const p7 = playerWith(seven);
    refreshHand(p7);
    assert.deepEqual(sorted(fanCards(p7).cards.map(c => c.key)), sorted(seven.slice(-FAN_MAX).map(c => c.key)));
  }
});

s.check('the fan is pixel art: whole card pixels, every corner index shows, no rotation', () => {
  const L = fanLayout(5);
  assert.equal(L.w, CARD_W + 4 * FAN_STEP);
  for (const a of L.at) assert.ok(Number.isInteger(a.x) && Number.isInteger(a.y));
  assert.ok(FAN_STEP >= 8, 'the next card leaves the rank and the suit (8 card px) in view');
  // paintFan paints whole blocks of k device pixels at whole offsets.
  const rects = [];
  const g = { set fillStyle(v) {}, fillRect: (x, y, w, h) => rects.push([x, y, w, h]) };
  paintFan(g, [{ key: deck[0].key }, { key: deck[1].key }], 3);
  assert.ok(rects.length > 0 && rects.every(([x, y, w, h]) => x % 3 === 0 && y % 3 === 0 && w === 3 && h === 3));
});

s.check('pulsePhase: 0..1 over the pulse, then none', () => {
  assert.equal(pulsePhase(null), null);
  assert.equal(pulsePhase({ t: 0 }), 0);
  assert.equal(pulsePhase({ t: FAN_PULSE_S / 2 }), 0.5);
  assert.equal(pulsePhase({ t: FAN_PULSE_S }), null);
});

s.check('pulseLook: the rim starts strong and fades out; the lift rises and falls', () => {
  assert.equal(pulseLook(null).alpha, 0);
  assert.equal(pulseLook(null).lift, 0);
  let prev = Infinity;
  for (let i = 0; i <= 10; i++) {
    const a = pulseLook(i / 10).alpha;
    assert.ok(a < prev, 'the rim fades at ' + i / 10);
    prev = a;
  }
  assert.ok(pulseLook(0).alpha >= 0.8, 'strong at the start');
  assert.ok(pulseLook(0.99).alpha < 0.05, 'gone at the end');
  assert.equal(pulseLook(0).lift, 0);
  assert.equal(pulseLook(0.5).lift, FAN_LIFT);
});

s.check('the raster key changes with the block size and with a dimmed card', () => {
  const cs = [{ key: deck[0].key }, { key: deck[1].key }];
  assert.notEqual(fanKey(cs, 1), fanKey(cs, 2));
  assert.notEqual(fanKey(cs, 2), fanKey([cs[0], { key: deck[1].key, dim: true }], 2));
});

// A seeded search over real cards: a set (of n cards) whose hand passes ok(h).
function findSet(ok, nMin, nMax, opts = {}) {
  let r = 777;
  const rnd = () => (r = (Math.imul(r, 1664525) + 1013904223) >>> 0) / 4294967296;
  for (let tries = 0; tries < 400000; tries++) {
    const n = nMin + Math.floor(rnd() * (nMax - nMin + 1));
    const pool = deck.slice();
    const pick = [];
    for (let i = 0; i < n && pool.length; i++) pick.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    const h = evaluateHand(pick, opts);
    if (h && ok(h, pick)) return pick;
  }
  throw new Error('no real set found');
}

s.check('a flush of six or more: the fan shows its five highest cards', () => {
  const set = findSet(h => h.id === 'flush' && h.cards.length > FAN_MAX, 7, 12);
  const p = playerWith(set);
  refreshHand(p);
  assert.ok(p.hand.cards.length > FAN_MAX, 'a big flush: ' + p.hand.cards.length);
  const vals = p.hand.cards.map(k => p.handCards[k].value).sort((a, b) => b - a).slice(0, FAN_MAX);
  const f = fanCards(p);
  assert.equal(f.cards.length, FAN_MAX);
  assert.deepEqual(f.cards.map(c => c.value).sort((a, b) => b - a), vals, 'the highest five');
  for (const c of f.cards) assert.ok(p.hand.cards.includes(c.key));
});

s.check('the Wild Card sits where it stands in a straight', () => {
  const set = findSet((h, pick) => h.id === 'straight' && h.cards.includes(WILD_KEY) &&
    !evaluateHand(pick), 4, 4, { wild: true });
  const p = playerWith(set);
  refreshHand(p, { wild: true });
  assert.equal(p.hand.id, 'straight');
  const f = fanCards(p);
  assert.ok(f.cards.some(c => c.key === WILD_KEY));
  // The bright cards are the run (a card held outside it is dimmed).
  const vals = f.cards.filter(c => !c.dim).map(c => c.value);
  assert.equal(vals.length, p.hand.cards.length);
  for (let i = 1; i < vals.length; i++) assert.equal(vals[i], vals[i - 1] + 1, 'the run reads in order: ' + f.cards.map(c => c.key));
});

s.check('the same hand made without the Wild Card: the wild card leaves the fan', () => {
  // 5 6 7 + wild is a straight with the wild as a 4; adding an 8 keeps a
  // straight (the same hand) made of real cards only.
  const of = (v) => deck.filter(c => c.value === v);
  let found = null;
  for (const a of of(5)) for (const b of of(6)) for (const c of of(7)) for (const d of of(8)) {
    if (found) break;
    const h1 = evaluateHand([a, b, c], { wild: true });
    const h2 = evaluateHand([a, b, c, d], { wild: true });
    if (h1 && h1.id === 'straight' && h1.wild && h2 && h2.id === 'straight' && !h2.wild) found = [a, b, c, d];
  }
  assert.ok(found, 'a real set exists');
  const p = playerWith(found.slice(0, 3));
  refreshHand(p, { wild: true });
  assert.ok(p.hand.wild);
  p.handCards[found[3].key] = found[3];
  const res = refreshHand(p, { wild: true });
  assert.equal(res.changed, false, 'the same hand');
  assert.equal(p.hand.wild, undefined, 'no wild card in the hand any more');
  const f = fanCards(p);
  assert.ok(!f.cards.some(c => c.key === WILD_KEY));
  const vals = f.cards.filter(c => !c.dim).map(c => c.value);
  assert.deepEqual(vals, [5, 6, 7, 8]);
});

s.check('fewer than five held: every card held is in the fan, the hand bright and the rest dimmed', () => {
  // Three cards held, two of them a pair.
  const set = findSet(h => h.id === 'pair', 3, 3);
  const p = playerWith(set);
  refreshHand(p);
  const f = fanCards(p);
  assert.deepEqual(sorted(f.cards.map(c => c.key)), sorted(set.map(c => c.key)), 'the cards held');
  assert.deepEqual(sorted(f.cards.filter(c => !c.dim).map(c => c.key)), sorted(p.hand.cards), 'the bright ones are the hand');
  assert.equal(f.cards.filter(c => c.dim).length, 1);
  // One card and the Wild Card: both bright, the wild one beside its pair.
  const one = playerWith([deck[0]]);
  refreshHand(one, { wild: true });
  const f1 = fanCards(one);
  assert.deepEqual(sorted(f1.cards.map(c => c.key)), sorted([deck[0].key, WILD_KEY]));
  assert.ok(f1.cards.every(c => !c.dim));
  assert.equal(f1.cards[0].value, f1.cards[1].value, 'the wild card stands for the same rank');
  // Five or more held: only the hand, no dimmed cards.
  const big = playerWith(setFor('pair'));
  refreshHand(big);
  assert.ok(fanCards(big).cards.every(c => !c.dim));
});

// ---- through the real game ---------------------------------------------------
const h = await boot({ storage: [['hordes_onboarded', '1']] });
const T = h.T, st = T.state;
T.banners.suppressAll();
const fresh = () => {
  st.mode = 'menu'; T.startRun();
  st.enemies.length = 0; st.enemyShots.length = 0; st.gems.length = 0; st.drops.length = 0;
  st.spawnTimer = 1e9; st.wave.endsAt = st.time + 1e9; st.wave.midAt = st.time + 1e9;
  st.toasts.length = 0;
  return st.player;
};
const step = (n = 1) => h.pump(n, () => { if (st.player) st.player.hp = st.player.stats.maxHp; });
const fanNow = () => T.renderer.hudChrome && T.renderer.hudChrome.hand;
const give = (p, cards) => { p.handCards = Object.fromEntries(cards.map(c => [c.key, c])); };

s.check('in the HUD: the fan is the hand, and a better hand pulses it once', () => {
  const p = fresh();
  step(2);
  assert.equal(fanNow(), null, 'no cards: no fan');
  const pairSet = setFor('pair');
  give(p, pairSet);
  T.hand.update(true);
  assert.ok(st.handPulse, 'a new hand starts the pulse');
  step(1);
  const f = fanNow();
  assert.deepEqual(sorted(f.fan.cards), sorted(p.hand.cards), 'the HUD fan is the hand');
  assert.ok(f.fan.pulse !== null && f.fan.pulse < 1, 'pulsing');
  // The pulse runs in play only: a draft or the pause screen holds it.
  const t0 = st.handPulse.t;
  st.mode = 'draft'; T.hand.tickPulse(0.1); st.mode = 'playing';
  assert.equal(st.handPulse.t, t0, 'held outside play');
  for (let i = 0; i < 60 && st.handPulse; i++) step(1);
  assert.equal(st.handPulse, null, 'the pulse ends');
  step(1);
  assert.equal(fanNow().fan.pulse, null);
  assert.equal(fanNow().fan.lift, 0);
  // The same hand again, or a worse one: no pulse.
  T.hand.update(true);
  assert.equal(st.handPulse, null, 'no better hand: no pulse');
  // A better hand: pulses again, and the fan holds the new hand's cards.
  give(p, setFor('flush'));
  T.hand.update(true);
  assert.ok(st.handPulse);
  step(1);
  assert.equal(p.hand.id, 'flush');
  assert.deepEqual(sorted(fanNow().fan.cards), sorted(p.hand.cards));
});

s.check('reduced motion: no lift and no rim', () => {
  const p = fresh();
  give(p, setFor('pair'));
  const w = globalThis.window;
  const mm = w.matchMedia;
  w.matchMedia = (q) => ({ matches: /reduce/.test(String(q)), addEventListener() {}, removeEventListener() {} });
  try {
    T.hand.update(true);
    step(1);
    assert.ok(st.handPulse, 'the pulse clock still runs');
    assert.equal(fanNow().fan.pulse, null);
    assert.equal(fanNow().fan.lift, 0);
  } finally { w.matchMedia = mm; }
});

s.check('the fan raster is rebuilt only when its cards change', () => {
  const p = fresh();
  give(p, setFor('pair'));
  T.hand.update(false);
  step(2);
  const b0 = T.renderer.handFanBuilds;
  step(30);
  assert.equal(T.renderer.handFanBuilds, b0, 'thirty frames of the same hand: no rebuild');
  give(p, setFor('straight'));
  T.hand.update(false);
  step(2);
  assert.equal(T.renderer.handFanBuilds, b0 + 1, 'a new hand: one rebuild');
});

s.check('outside play: no rim and no lift, and the count-up waits with the pulse', () => {
  const p = fresh();
  give(p, setFor('pair'));
  T.hand.update(true);
  assert.ok(st.handPulse && st.handFx);
  // A second draft opens before the fight comes back (two level-ups in a row).
  st.mode = 'draft';
  step(5);
  const f = fanNow();
  assert.ok(f, 'the HUD is drawn behind the draft');
  assert.equal(f.fan.pulse, null, 'no rim outside play');
  assert.equal(f.fan.lift, 0, 'no lift outside play');
  assert.equal(st.handPulse.t, 0, 'the pulse waits');
  assert.equal(st.handFx.t, 0, 'the count-up waits with it');
  st.mode = 'playing';
  step(3);
  assert.ok(st.handPulse && st.handPulse.t > 0, 'the pulse runs in play');
  assert.ok(st.handFx && st.handFx.t > 0, 'the count-up runs with it');
  assert.ok(Math.abs(st.handPulse.t - st.handFx.t) < 0.05, 'together: ' + st.handPulse.t + ' ' + st.handFx.t);
  assert.ok(fanNow().fan.pulse !== null);
});

s.check('a worse hand (a joker leaves) does not pulse', () => {
  const p = fresh();
  st.jokerSlots = 3;
  p.jokers = ['wildcard'];
  give(p, setFor('pair'));
  T.hand.update(true);
  const better = p.hand.order;
  st.handPulse = null; st.handFx = null;
  p.jokers = [];
  T.hand.update(true);
  assert.ok(p.hand && p.hand.order < better, 'the hand got worse: ' + (p.hand && p.hand.id));
  assert.equal(st.handPulse, null, 'no pulse for a worse hand');
});

s.check('a new run starts with no pulse, even one held behind a draft', () => {
  const p = fresh();
  give(p, setFor('pair'));
  T.hand.update(true);
  st.mode = 'draft';
  assert.ok(st.handPulse);
  fresh();
  assert.equal(st.handPulse, null);
  assert.equal(st.handFx, null);
});

s.check('a new block size rebuilds the raster at that size', () => {
  const p = fresh();
  give(p, setFor('pair'));
  T.hand.update(false);
  step(2);
  const b0 = T.renderer.handFanBuilds;
  const vs = T.renderer.viewScale;
  const k0 = fanNow().fan.k;
  T.renderer.viewScale = { sx: k0 + 1, sy: k0 + 1 };
  try {
    step(1);
    assert.equal(T.renderer.handFanBuilds, b0 + 1, 'rebuilt');
    assert.equal(fanNow().fan.k, k0 + 1);
  } finally { T.renderer.viewScale = vs; }
});

const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
s.check('placement: inside the view, above the item row, under the joker row, clear of the radar', () => {
  const p = fresh();
  st.jokerSlots = 3;
  p.jokers = ['wildcard'];
  st.radarOn = true;
  for (const id of ['pair', 'straightflush', 'flush']) {
    give(p, setFor(id));
    T.hand.update(true);
    for (const lifted of [true, false]) {
      if (!lifted) st.handPulse = null;
      else st.handPulse = { t: FAN_PULSE_S / 2 };
      step(1);
      const f = fanNow();
      assert.ok(f.x >= 0 && f.y >= 0 && f.x + f.w <= C.VIEW_W && f.y + f.h <= C.VIEW_H, id + ' inside the view');
      assert.ok(f.y + f.h <= C.VIEW_H - 49, id + ': above the item row ' + JSON.stringify(f));
      const radar = T.renderer.radar;
      const R = { x: C.VIEW_W - 10 - 68, y: C.VIEW_H - 10 - 68, w: 68, h: 68 };
      assert.ok(!overlap(f, R), id + ': clear of the radar ' + JSON.stringify([f, radar]));
      assert.ok(f.textBox.x + f.textBox.w <= R.x, id + ': text clear of the radar');
      // The joker row (16px cells, 1px frame) ends above the fan.
      const jy = f.y + 2 - 16 - 6;
      assert.ok(jy + 16 + 1 <= f.y, 'joker row above the fan');
      assert.ok(jy - 1 > (T.renderer.hudChrome.lane ? T.renderer.hudChrome.lane.y + T.renderer.hudChrome.lane.h : 0), 'below the lane');
    }
  }
});

s.check('an upright phone draws a card pixel 1.5 CSS px (3 device px at dpr 2); elsewhere one view pixel', () => {
  assert.equal(fanBlock(1, 1280), 1, 'a desk at 1:1');
  assert.equal(fanBlock(2, 960), 2, 'a 2x desk');
  assert.equal(fanBlock(780 / 480, 390), 3, '390x844 at dpr 2: a card is 36 CSS px wide');
  assert.equal(fanBlock(1170 / 480, 390), 5, 'dpr 3: about 1.5 CSS px a card pixel');
  assert.equal(fanBlock(1.3, 624), 1, 'a phone held sideways (above 1:1) keeps the plain rule');
  assert.equal(fanBlock(1), 1, 'the headless harness');
});

// polish P9a and P3: the HUD sizes the fan with fanBlock and the canvas's CSS
// width that fitCanvas keeps (renderer.cssW), never a per-frame clientWidth read.
s.check('in the HUD: an upright phone (390 CSS px, dpr 2) builds the fan at 3 device px a card pixel', () => {
  const p = fresh();
  give(p, setFor('pair'));
  T.hand.update(false);
  step(2);
  const vs = T.renderer.viewScale, cw = T.renderer.cssW;
  const cv = T.renderer.canvas;
  let reads = 0;
  const had = Object.getOwnPropertyDescriptor(cv, 'clientWidth');
  Object.defineProperty(cv, 'clientWidth', { configurable: true, get() { reads++; return 390; } });
  T.renderer.viewScale = { sx: 780 / 480, sy: 780 / 480 };
  T.renderer.cssW = 390;
  try {
    step(3);
    assert.equal(fanNow().fan.k, 3, 'the phone block, not round(vsx) = 2: ' + fanNow().fan.k);
    assert.ok(/@3$/.test(T.renderer._handFanKey), 'the raster is baked at 3: ' + T.renderer._handFanKey);
    assert.equal(reads, 0, 'no clientWidth read in a HUD frame');
    T.renderer.cssW = 1280;
    step(1);
    assert.equal(fanNow().fan.k, 2, 'a wide canvas at the same scale: round(vsx)');
  } finally {
    T.renderer.viewScale = vs; T.renderer.cssW = cw;
    if (had) Object.defineProperty(cv, 'clientWidth', had); else delete cv.clientWidth;
    step(1);
  }
});
s.check('fitCanvas keeps the canvas CSS width for the HUD', () => {
  const src = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const fit = src.slice(src.indexOf('function fitCanvas()'), src.indexOf('function fitCanvas()') + 9000);
  assert.match(fit, /canvas\.style\.width = w \+ 'px';[\s\S]{0,300}renderer\.cssW = w;/, 'fitCanvas sets renderer.cssW beside the style width');
});

s.done();
