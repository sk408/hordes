// R3 floor item (Steve 2026-11-18): "limit objects on the floor. Dead chests can
// clean up more frequently", "potion drops build up too much", and gems that are
// left alone condense into richer gems. Pins every floor rule in C.FLOOR.
import assert from 'node:assert/strict';
import { condenseGems, capGems, richStep, pushGroundCapped } from '../src/entities.js';
import { CONFIG as C } from '../src/config.js';
import { remnantAlpha, GEM_RECEDE } from '../src/render.js';
import { rollItemOfRarity } from '../src/loot.js';
import { weaponXpNeeded, WEAPON_MAX_LEVEL } from '../src/weapons.js';
import { buildingRects } from '../src/stage_buildings.js';
import { lootLimit } from '../src/entities.js';
import { VAULT } from '../src/vault.js';
import { useSkill } from '../src/skills.js';
import { gemsNear } from '../src/explore.js';
import { makeTypedEnemy } from '../src/enemy_types.js';
import { boot, suite } from './_harness.mjs';

const F = C.FLOOR;
const s = suite('test_floor');
const xpSum = (a) => a.reduce((t, g) => t + g.xp, 0);
const nSum = (a) => a.reduce((t, g) => t + (g.n || 1), 0);
let seed = 7;
const rnd = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296;

// ---- pure rules ------------------------------------------------------------------
s.check('condense: old gems near each other merge; XP and gem count kept exactly', () => {
  const arr = [];
  for (let i = 0; i < 12; i++) arr.push({ x: 300 + rnd() * 30, y: 200 + rnd() * 30, xp: 1 + Math.floor(rnd() * 9), t: 0 });
  const young = { x: 305, y: 205, xp: 4, t: 99 };
  arr.push(young);
  const xp0 = xpSum(arr), n0 = nSum(arr), len0 = arr.length;
  const k = condenseGems(arr, 0, 0, 100, { age: F.CONDENSE_AGE, r: F.CONDENSE_R });
  assert.ok(k > 0 && arr.length === len0 - k, 'merges happened: ' + k);
  assert.equal(xpSum(arr), xp0, 'XP on the floor is exactly the same');
  assert.equal(nSum(arr), n0, 'each gem is still counted once');
  assert.ok(arr.includes(young) && young.xp === 4 && !young.n, 'a young gem is left alone');
});

s.check('condense: the gem nearer the hero stays; gems apart stay apart', () => {
  const near = { x: 100, y: 0, xp: 2, t: 0 }, far = { x: 120, y: 0, xp: 3, t: 0 };
  const lone = { x: 400, y: 0, xp: 5, t: 0 };
  const arr = [far, near, lone];
  condenseGems(arr, 0, 0, 50, { age: F.CONDENSE_AGE, r: F.CONDENSE_R });
  assert.deepEqual(arr, [near, lone]);
  assert.equal(near.xp, 5); assert.equal(near.n, 2);
  assert.equal(near.x, 100, 'the survivor keeps its place');
});

s.check('condense over a minute: a field nobody collects gathers into a few rich gems', () => {
  const arr = [];
  for (let i = 0; i < 80; i++) arr.push({ x: 200 + rnd() * 120, y: 150 + rnd() * 120, xp: 1 + Math.floor(rnd() * 3), t: 0 });
  const xp0 = xpSum(arr);
  const seen = {};
  for (let t = 0; t <= 60; t += F.CONDENSE_EVERY) {
    condenseGems(arr, 0, 0, t, { age: F.CONDENSE_AGE, r: F.CONDENSE_R, rest: F.CONDENSE_REST });
    if (t === 9 || t === 20) seen[t] = arr.length;
  }
  console.log('    field of 80: ' + seen[9] + ' gems at 9 s, ' + seen[20] + ' at 20 s, ' + arr.length + ' at 60 s');
  assert.ok(seen[9] >= 35, 'it gathers step by step, not at once: ' + seen[9] + ' at 9 s');
  assert.ok(seen[20] < seen[9], 'and keeps gathering');
  assert.equal(xpSum(arr), xp0);
  assert.ok(arr.length <= 12, 'few gems left: ' + arr.length);
  assert.ok(arr.some(g => richStep(g, F.RICH_XP) >= 1), 'at least one is rich');
});

s.check('the pilot\'s gem is never merged away (it may grow)', () => {
  const mine = { x: 130, y: 0, xp: 1, t: 0 };
  const other = { x: 100, y: 0, xp: 1, t: 0 };
  const arr = [mine, other];
  condenseGems(arr, 0, 0, 50, { age: F.CONDENSE_AGE, r: F.CONDENSE_R, keep: new Set([mine]) });
  assert.ok(arr.includes(mine), 'condense keeps it');
  const big = [];
  for (let i = 0; i < 200; i++) big.push({ x: 150 + i * 3, y: 40, xp: 1, t: 0 });
  const kept = big[199];
  capGems(big, 0, 0, 10, { cap: F.GEM_CAP, target: F.GEM_TARGET, near: F.KEEP_NEAR, keep: new Set([kept]) });
  assert.ok(big.includes(kept), 'the cap keeps it');
});

s.check('cap: past GEM_CAP, far gems merge down to GEM_TARGET; near gems untouched; XP exact', () => {
  const arr = [], nearOnes = [];
  for (let i = 0; i < 30; i++) { const g = { x: rnd() * 60 - 30, y: rnd() * 60 - 30, xp: 1, t: 0 }; arr.push(g); nearOnes.push(g); }
  for (let i = 0; i < 170; i++) { const a = rnd() * 6.28, d = F.KEEP_NEAR + 10 + rnd() * 300; arr.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, xp: 1 + Math.floor(rnd() * 20), t: rnd() * 30 }); }
  const xp0 = xpSum(arr), n0 = nSum(arr);
  capGems(arr, 0, 0, 40, { cap: F.GEM_CAP, target: F.GEM_TARGET, near: F.KEEP_NEAR });
  assert.equal(arr.length, F.GEM_TARGET);
  assert.equal(xpSum(arr), xp0, 'XP exact');
  assert.equal(nSum(arr), n0);
  for (const g of nearOnes) assert.ok(arr.includes(g), 'a gem near the hero is never merged away');
  // Too few far gems to reach the target: it stops there, the near ones stay.
  const mix = [], near80 = [];
  for (let i = 0; i < 80; i++) { const g = { x: (i % 9) * 8 - 36, y: Math.floor(i / 9) * 8 - 36, xp: 1, t: 0 }; mix.push(g); near80.push(g); }
  for (let i = 0; i < 20; i++) mix.push({ x: 300 + i * 7, y: 50, xp: 2, t: 0 });
  capGems(mix, 0, 0, 40, { cap: F.GEM_CAP, target: F.GEM_TARGET, near: F.KEEP_NEAR });
  assert.equal(mix.length, 80, 'only the 20 far ones merged into near ones');
  for (const g of near80) assert.ok(mix.includes(g));
  assert.equal(xpSum(mix), 120);
  const under = [{ x: 500, y: 0, xp: 1, t: 0 }];
  assert.equal(capGems(under, 0, 0, 40, { cap: F.GEM_CAP, target: F.GEM_TARGET, near: F.KEEP_NEAR }), 0, 'under the cap: nothing');
});

s.check('rich steps: a merged gem past RICH_XP[k] is step k+1; a single gem is never rich', () => {
  assert.equal(richStep({ xp: 5000 }, F.RICH_XP), 0);
  assert.equal(richStep({ xp: F.RICH_XP[0] - 1, n: 9 }, F.RICH_XP), 0);
  assert.equal(richStep({ xp: F.RICH_XP[0], n: 2 }, F.RICH_XP), 1);
  assert.equal(richStep({ xp: F.RICH_XP[3], n: 2 }, F.RICH_XP), 4);
  assert.equal(F.RICH_BONUS[0], 0, 'an ordinary gem pays no bonus');
  for (let k = 1; k < F.RICH_BONUS.length; k++) assert.ok(F.RICH_BONUS[k] >= F.RICH_BONUS[k - 1] && F.RICH_BONUS[k] <= 0.1, 'bonus small and rising');
});

s.check('the overflow merge (GEM_CAP 600 backstop) also keeps the gem count', () => {
  const arr = [{ x: 0, y: 0, xp: 2, n: 3 }];
  pushGroundCapped(arr, { x: 1, y: 0, xp: 5, n: 2 }, 1, () => 'gem', (s2, n) => { s2.xp += n.xp; s2.n = (s2.n || 1) + (n.n || 1); });
  assert.equal(arr[0].xp, 7);
});

s.check('the picture fades exactly the gems the floor may merge (one distance)', () => {
  assert.equal(GEM_RECEDE.FAR, F.KEEP_NEAR);
  assert.ok(!('CELL' in GEM_RECEDE), 'no picture-only merge left');
});

s.check('an opened chest\'s art stays REMNANT_S, fading at the end, then is gone', () => {
  assert.equal(remnantAlpha(0), 1);
  assert.equal(remnantAlpha(F.REMNANT_S - F.REMNANT_FADE_S - 0.01), 1);
  const mid = remnantAlpha(F.REMNANT_S - F.REMNANT_FADE_S / 2);
  assert.ok(mid > 0.3 && mid < 0.7, 'fading: ' + mid);
  assert.equal(remnantAlpha(F.REMNANT_S), 0);
  assert.equal(remnantAlpha(120), 0);
  assert.ok(F.REMNANT_S <= 4, 'it leaves promptly');
});

s.check('a kill burst of 600 gems: the cap reads each gem\'s place once, not once per pair; XP kept', () => {
  let reads = 0;
  const arr = [];
  for (let i = 0; i < 600; i++) {
    const px = (rnd() - 0.5) * 1600, py = (rnd() - 0.5) * 1600;
    arr.push({ get x() { reads++; return px; }, get y() { reads++; return py; }, xp: 1 + (i % 5), t: 0 });
  }
  const xp0 = xpSum(arr), n0 = nSum(arr);
  const t0 = performance.now();
  capGems(arr, 0, 0, 100, { cap: F.GEM_CAP, target: F.GEM_TARGET, near: F.KEEP_NEAR });
  console.log('    cap 600 -> ' + arr.length + ': ' + (performance.now() - t0).toFixed(2) + ' ms, ' + reads + ' position reads');
  assert.equal(arr.length, F.GEM_TARGET, 'capped to the target');
  assert.equal(xpSum(arr), xp0); assert.equal(nSum(arr), n0);
  assert.ok(reads <= 2 * 2 * 600, 'position reads ' + reads + ' (once per pair would be ~' + (600 * 530) + ')');
});

// ---- in the game -----------------------------------------------------------------
const h = await boot({ storage: [['hordes_onboarded', '1']] });
const T = h.T, st = T.state;
T.banners.suppressAll();
st.mode = 'menu'; T.startRun();
h.pump(3);
const P = st.player;
const calm = () => { st.enemies.length = 0; if (st.enemyShots) st.enemyShots.length = 0; P.hp = P.stats.maxHp; };
const step = (n = 1) => { for (let i = 0; i < n; i++) { calm(); h.pump(1); } };
// The pilot never picks a gem inside a building or a shut yard (controllers.js
// inBricks), and the run's buildings come from a random seed. A pilot check
// first moves the hero to open ground where every gem it places is clear.
function openGround(offsets) {
  const rects = buildingRects(st.groundSeed || 0, st.stage);
  const y = st.poi && st.poi.yard;
  const pad = 40, m = lootLimit() - 60;
  const clear = (x, yy) => Math.abs(x) <= m && Math.abs(yy) <= m
    && !rects.some(r => x > r.x - pad && x < r.x + r.w + pad && yy > r.y - pad && yy < r.y + r.h + pad)
    && !(y && Math.abs(x - y.x) < VAULT.YARD_W / 2 + pad && Math.abs(yy - y.y) < VAULT.YARD_H / 2 + pad);
  for (let gy = -m; gy <= m; gy += 37) for (let gx = -m; gx <= m; gx += 41) {
    if (offsets.every(([dx, dy]) => clear(gx + dx, gy + dy))) { P.x = gx; P.y = gy; return; }
  }
  throw new Error('no open ground for the pilot check');
}

s.check('in play: an uncollected field condenses and the cap holds; floor XP exact', () => {
  calm(); st.gems.length = 0;
  st.pilotMode = 'MANUAL';
  T.setPilotMode && T.setPilotMode('MANUAL');
  for (let i = 0; i < 160; i++) {
    const a = rnd() * 6.28, d = 160 + rnd() * 120;
    st.gems.push({ x: P.x + Math.cos(a) * d, y: P.y + Math.sin(a) * d, xp: 1 + Math.floor(rnd() * 5), t: st.time - 30 });
  }
  const xp0 = xpSum(st.gems), n0 = nSum(st.gems);
  const pick = P.stats.pickup;
  P.stats.pickup = 0;   // nobody collects: the field is left alone
  step(90);
  P.stats.pickup = pick;
  assert.ok(st.gems.length <= F.GEM_CAP, 'capped: ' + st.gems.length);
  assert.equal(xpSum(st.gems), xp0, 'not one XP point lost or made');
  assert.equal(nSum(st.gems), n0);
  assert.ok(st.gems.length <= 45, 'condensed: ' + st.gems.length);
});

s.check('picking up a merged gem pays exactly its sum (plus the stated rich bonus), and each gem\'s weapon XP', () => {
  calm(); st.gems.length = 0;
  P.xpNext = 1e12; P.xp = 0;
  const saved = F.RICH_BONUS.slice();
  F.RICH_BONUS.fill(0);
  try {
    // Weapon XP fed so far, levels included (a gem feeds one point).
    const wxp = () => st.weapons.reduce((t, w) => {
      let v = w.xp || 0;
      for (let l = 1; l < (w.level || 1); l++) v += weaponXpNeeded(l);
      return t + v;
    }, 0);
    for (const w of st.weapons) { w.level = 1; w.xp = 0; }
    st.gems.push({ x: P.x, y: P.y, xp: 57, n: 20, t: st.time });
    step(1);
    const one = P.xp;
    assert.equal(wxp(), 20, 'a merged gem of 20 feeds 20 weapon XP');
    P.xp = 0;
    for (let i = 0; i < 20; i++) st.gems.push({ x: P.x, y: P.y, xp: i < 17 ? 3 : 2, t: st.time });
    step(1);
    assert.ok(one > 0);
    assert.ok(Math.abs(P.xp - one) < 1e-9, 'merged ' + one + ' vs separate ' + P.xp);
  } finally { F.RICH_BONUS.splice(0, F.RICH_BONUS.length, ...saved); }
  // The pickup multiplier, read off one ordinary gem; then a step-4 rich gem
  // pays its sum times that, plus exactly RICH_BONUS[4] of it.
  P.xp = 0;
  st.gems.push({ x: P.x, y: P.y, xp: 10, t: st.time });
  step(1);
  const mult = P.xp / 10;
  P.xp = 0;
  st.gems.push({ x: P.x, y: P.y, xp: F.RICH_XP[3], n: 50, t: st.time });
  const pops = (st.sitePops || []).length;
  step(1);
  const want = F.RICH_XP[3] * mult * (1 + F.RICH_BONUS[4]);
  assert.ok(Math.abs(P.xp - want) < 1e-6, 'rich pickup ' + P.xp + ' vs ' + want);
  assert.ok((st.sitePops || []).length > pops || (st.sitePops || []).some(q => /XP/.test(q.text)), 'its XP is shown');
});

s.check('the pilot\'s committed gem survives condensing', () => {
  calm(); st.gems.length = 0;
  T.setPilotMode && T.setPilotMode('AUTO_ALL');
  st.pilotMode = 'AUTO_ALL';
  openGround([[0, 0], [200, 0], [250, 30]]);
  for (let i = 0; i < 40; i++) st.gems.push({ x: P.x + 200 + (i % 8) * 6, y: P.y + Math.floor(i / 8) * 6, xp: 1, t: st.time - 30 });
  step(1);
  const ac = T.floor.autoController;
  const mine = ac.gem;
  assert.ok(mine, 'the pilot chose a gem');
  T.floor.tick(F.CONDENSE_EVERY);
  assert.ok(st.gems.includes(mine), 'still on the floor');
});

s.check('in the picture: the opened chest under its item is drawn only for REMNANT_S', () => {
  calm(); st.gems.length = 0; st.drops.length = 0; st.itemDrops.length = 0; st.chests.length = 0;
  const R = T.renderer;
  const count = () => { h.rec.rects.length = 0; h.rec.on = true; R.render(st, st.cam); h.rec.on = false; return h.rec.rects.length; };
  const item = rollItemOfRarity('COMMON', rnd);
  const empty = count();
  st.itemDrops.push({ x: P.x + 40, y: P.y + 20, item, age: 0, t: st.time });
  const plain = count() - empty;
  st.itemDrops[0].chest = 'common';
  const fresh = count() - empty;
  st.itemDrops[0].t = st.time - F.REMNANT_S - 0.1;
  const old = count() - empty;
  assert.ok(fresh > plain, 'a fresh opened chest draws its art (' + fresh + ' vs ' + plain + ')');
  assert.equal(old, plain, 'after REMNANT_S only the item draws');
  st.itemDrops.length = 0;
});

s.check('the pilot takes a rich gem over a nearer single one (RICH_PULL), not past it', () => {
  calm(); st.gems.length = 0;
  const ac = T.floor.autoController;
  openGround([[0, 0], [90, 0], [-150, 0], [-250, 0]]);
  const single = { x: P.x + 90, y: P.y, xp: 1, t: st.time };
  const rich = { x: P.x - 150, y: P.y, xp: F.RICH_XP[1], n: 30, t: st.time };
  st.gems.push(single, rich);
  ac.gem = null;
  step(1);
  assert.equal(ac.gem, rich, 'went for the rich gem');
  st.gems.length = 0;
  const far = { x: P.x - 250, y: P.y, xp: F.RICH_XP[1], n: 30, t: st.time };
  const near2 = { x: P.x + 90, y: P.y, xp: 1, t: st.time };
  st.gems.push(near2, far);
  ac.gem = null;
  step(1);
  const who = (g) => g === near2 ? 'near' : g === far ? 'far' : JSON.stringify(g);
  assert.equal(ac.gem, near2, 'but not one more than twice as far: chose ' + who(ac.gem) + ' P ' + Math.round(P.x) + ',' + Math.round(P.y) + ' near ' + Math.round(near2.x) + ' far ' + Math.round(far.x) + ' skip ' + (ac.skipGems && ac.skipGems.has(near2)) + ' enemies ' + st.enemies.length);
  st.gems.length = 0;
});

s.check('potions: at most POTION_CAP on the floor, never merged, and they expire unless near the hero', () => {
  calm(); st.drops.length = 0;
  for (let i = 0; i < 12; i++) T.m3.pushDrop({ x: P.x + 200 + i * 9, y: P.y, kind: i % 2 ? 'hp' : 'mp' });
  assert.equal(st.drops.length, F.POTION_CAP);
  assert.ok(st.drops.every(d => !d.count), 'no merged counts');
  const nearOne = st.drops[0];
  nearOne.x = P.x + 20; nearOne.y = P.y + 30;
  P.potions.hp = P.potions.mp = st.potionCap;   // full: he does not take it
  for (const d of st.drops) d.t = st.time - F.POTION_LIFE - 1;
  T.floor.tick(0.016);
  assert.deepEqual(st.drops, [nearOne], 'far ones expired, the near one stays');
  st.drops.length = 0;
  for (let i = 0; i < F.POTION_CAP; i++) T.m3.pushDrop({ x: P.x + 10, y: P.y + 10 * i, kind: 'hp' });
  assert.equal(T.m3.pushDrop({ x: P.x + 300, y: P.y, kind: 'hp' }), null, 'all near and full: the new one is not placed');
  st.drops.length = 0;
});

s.check('items: an unwanted item leaves REFUSED_S after it is turned down; an untouched one after ITEM_LIFE', () => {
  calm(); st.itemDrops.length = 0;
  const it = () => rollItemOfRarity('COMMON', rnd);
  const a = it();
  st.items.length = 0;
  for (let i = 0; i < 4; i++) st.items.push({ ...a });
  T.m3.pushItemDrop({ x: P.x, y: P.y, item: { ...a }, age: 0, chest: 'common' });
  const d = st.itemDrops[0];
  step(1);
  assert.ok(st.itemDrops.includes(d) && d.refusedAt != null, 'turned down, marked');
  d.refusedAt = st.time - F.REFUSED_S - 0.1;
  T.floor.tick(0.016);
  assert.ok(!st.itemDrops.includes(d), 'gone after REFUSED_S');
  T.m3.pushItemDrop({ x: P.x + 300, y: P.y, item: it(), age: 0 });
  T.m3.pushItemDrop({ x: P.x + 25, y: P.y + 30, item: it(), age: 0 });
  const [far, near] = st.itemDrops;
  far.t = near.t = st.time - F.ITEM_LIFE - 1;
  T.floor.tick(0.016);
  assert.ok(!st.itemDrops.includes(far) && st.itemDrops.includes(near), 'far expired, near kept');
  st.itemDrops.length = 0; st.items.length = 0;
});

s.check('chests: an UNOPENED chest keeps its full life even on a crowded floor (only dead chests clean up)', () => {
  calm(); st.gems.length = 0; st.chests.length = 0;
  const far = { id: 901, x: P.x + 700, y: P.y, age: 0 };
  st.chests.push(far);
  // Young gems inside KEEP_NEAR: the cap cannot merge them, so the floor stays crowded.
  for (let i = 0; i < 120; i++) st.gems.push({ x: P.x - 40 - (i % 40), y: P.y + 30 + (i % 30), xp: 1, t: st.time });
  const before = JSON.stringify(far);
  T.floor.tick(0.016);
  assert.equal(JSON.stringify(far), before, 'the floor rules leave an unopened chest alone');
  assert.ok(!('CROWD_CHEST_LIFE' in F), 'no shorter life for far chests');
  st.gems.length = 0; st.chests.length = 0;
});

s.check('the MAGNET SWEEP toast counts gems, not floor objects: a merged gem of 7 is 7 gems', () => {
  calm(); st.gems.length = 0; st.drops.length = 0; st.itemDrops.length = 0;
  P.xpNext = 1e12;
  st.gems.push({ x: P.x + 150, y: P.y, xp: 7, n: 7, t: st.time }, { x: P.x + 170, y: P.y + 10, xp: 1, t: st.time });
  assert.equal(T.floor.gemUnits(), 8);
  P.skillCd.MAGNET_PULL = 0; P.mana = 1e6;
  assert.ok(useSkill(st, 'MAGNET_PULL'), 'the magnet fired');
  st.toasts.length = 0;
  for (let i = 0; i < 90 && (P.magnetSweep > 0 || st.gems.length); i++) step(1);
  const msg = st.toasts.map(t => t.msg).find(m => /MAGNET SWEEP/.test(m));
  assert.ok(msg && /\b8 GEMS\b/.test(msg), 'toast: ' + msg);
});

s.check('the AUTO magnet policy counts a merged gem as the gems it holds', () => {
  calm(); st.gems.length = 0; st.drops.length = 0; st.itemDrops.length = 0;
  T.setPilotMode && T.setPilotMode('AUTO_ALL');
  st.pilotMode = 'AUTO_ALL';
  const had = P.skills.magnet;
  P.skills.magnet = true; P.mana = 1e6; P.skillCd.MAGNET_PULL = 0;
  const half = Math.ceil(C.MAGNET.AUTO_MIN / 2);
  st.gems.push({ x: P.x + 400, y: P.y, xp: half, n: half, t: st.time }, { x: P.x + 420, y: P.y + 20, xp: half, n: half, t: st.time });
  step(1);
  assert.ok(P.skillCd.MAGNET_PULL > 0, 'two merged gems holding ' + 2 * half + ' gems fire it');
  for (let i = 0; i < 60 && st.gems.length; i++) step(1);
  P.skills.magnet = had;
  st.gems.length = 0;
});

s.check('the EXPLORE pilot banks a merged gem as the gems it holds (gemsNear)', () => {
  const p0 = { x: 0, y: 0 };
  assert.equal(gemsNear({ gems: [{ x: 10, y: 0, xp: 1 }] }, p0), false, 'one single gem is not worth a detour');
  assert.equal(gemsNear({ gems: [{ x: 10, y: 0, xp: 40, n: 20 }] }, p0), true, 'a merged gem of 20 is');
});

s.check('Storm Shards: a merged gem of n chips the horde n times (one proc per gem)', () => {
  calm(); st.gems.length = 0;
  P.xpNext = 1e12;
  const had = P.stats.stormShards;
  P.stats.stormShards = true;
  const ws = st.weapons.splice(0);   // no weapon fire: the chip is the only damage
  try {
    const hit = (gem) => {
      st.enemies.length = 0;
      const e = makeTypedEnemy('CHASER', P.x + 60, P.y, 0);
      e.hp = e.maxHp = 1e9;
      st.enemies.push(e);
      P.invuln = 9;
      st.gems.push(gem);
      h.pump(1);
      assert.ok(!st.gems.includes(gem), 'picked up');
      return 1e9 - e.hp;
    };
    const one = hit({ x: P.x, y: P.y, xp: 1, t: st.time });
    const eight = hit({ x: P.x, y: P.y, xp: 8, n: 8, t: st.time });
    assert.ok(one > 0, 'a single gem chips');
    assert.ok(Math.abs(eight - 8 * one) < 1e-6, 'merged gem of 8 chipped ' + eight + ', one gem ' + one);
  } finally {
    st.weapons.push(...ws);
    P.stats.stormShards = had;
    st.enemies.length = 0;
  }
});

s.check('in play: a gem that just merged rests CONDENSE_REST before it merges again', () => {
  calm(); st.gems.length = 0;
  T.setPilotMode && T.setPilotMode('MANUAL');
  st.pilotMode = 'MANUAL';
  // Four old gems in a tight pile, far from the hero: one pass makes two gems of 2.
  for (let i = 0; i < 4; i++) st.gems.push({ x: P.x + 400 + i * 6, y: P.y, xp: 1, t: st.time - 30 });
  T.floor.tick(F.CONDENSE_EVERY);
  assert.equal(st.gems.length, 2, 'first pass: two merged gems');
  assert.ok(st.gems.every(g => g.n === 2));
  // Inside the rest the pair stays apart, every pass.
  const t0 = st.time;
  for (let k = 1; k * F.CONDENSE_EVERY < F.CONDENSE_REST - 0.01; k++) {
    st.time = t0 + k * F.CONDENSE_EVERY;
    T.floor.tick(F.CONDENSE_EVERY);
    assert.equal(st.gems.length, 2, 'merged again after ' + (k * F.CONDENSE_EVERY) + ' s, inside the rest');
  }
  st.time = t0 + F.CONDENSE_REST;
  T.floor.tick(F.CONDENSE_EVERY);
  assert.equal(st.gems.length, 1, 'after the rest they merge');
  assert.equal(st.gems[0].n, 4);
  st.time = t0;
  st.gems.length = 0;
});

s.check('reduced motion: a rich gem\'s glow holds still, a leaving potion or item shows steady, a word pop stays put', () => {
  calm(); st.gems.length = 0; st.drops.length = 0; st.itemDrops.length = 0; st.chests.length = 0;
  const R = T.renderer, w = globalThis.window, mm0 = w.matchMedia;
  const t0 = st.time;
  const setReduced = (on) => {
    w.matchMedia = (q) => (on && /prefers-reduced-motion:\s*reduce/.test(String(q)))
      ? { matches: true, addEventListener() {}, addListener() {} } : mm0(q);
  };
  // One frame at time t; returns the rects drawn, the word pops' y and the rich glows.
  const frame = (t, setup) => {
    st.time = t;
    st.gems.length = 0; st.drops.length = 0; st.itemDrops.length = 0; st.sitePops = [];
    setup(t);
    R.readStats = {};
    h.rec.rects.length = 0; h.rec.texts.length = 0; h.rec.on = true;
    R.render(st, st.cam);
    h.rec.on = false;
    const out = { rects: h.rec.rects.length, pop: h.rec.texts.filter(x => x.txt === '+77 XP').map(x => x.y), glow: R.readStats.gems.filter(g => g.rich).map(g => g.glow) };
    R.readStats = null;
    return out;
  };
  const item = rollItemOfRarity('COMMON', rnd);
  const potion = (t) => st.drops.push({ x: P.x + 30, y: P.y + 10, kind: 'hp', t: t - (F.POTION_LIFE - 1) });
  const drop = (t) => st.itemDrops.push({ x: P.x - 30, y: P.y + 10, item, age: 0, t: t - (F.ITEM_LIFE - 1) });
  const rich = () => st.gems.push({ x: P.x + 50, y: P.y - 20, xp: F.RICH_XP[2] + 20, n: 40, t: st.time });
  const pop = (t) => st.sitePops.push({ x: P.x, y: P.y - 30, text: '+77 XP', color: '#9effe6', age: (t - t0) % 1, ttl: 99 });
  const times = [0, 0.05, 0.1, 0.17, 0.25, 0.33, 0.4, 0.5, 0.6, 0.7].map(d => t0 + 10 + d);
  const look = (on) => {
    setReduced(on);
    const r = { potion: [], item: [], glow: [], pop: [] };
    for (const t of times) {
      const empty = frame(t, () => {}).rects;
      r.potion.push(frame(t, potion).rects - empty);
      r.item.push(frame(t, drop).rects - empty);
      r.glow.push(frame(t, rich).glow[0]);
      r.pop.push(frame(t, pop).pop[0]);
    }
    return r;
  };
  try {
    const moving = look(false);
    // The test can see the motion: without the setting, all four move.
    assert.ok(moving.potion.some(v => v === 0) && moving.potion.some(v => v > 0), 'a leaving potion blinks: ' + moving.potion);
    assert.ok(moving.item.some(v => v === 0) && moving.item.some(v => v > 0), 'a leaving item blinks: ' + moving.item);
    assert.ok(new Set(moving.glow).size > 1, 'the glow pulses: ' + moving.glow);
    assert.ok(moving.pop.every(y => y != null) && new Set(moving.pop).size > 1, 'the pop rises: ' + moving.pop);
    const still = look(true);
    assert.ok(still.potion.every(v => v > 0 && v === still.potion[0]), 'reduced: the potion is drawn every frame: ' + still.potion);
    assert.ok(still.item.every(v => v > 0 && v === still.item[0]), 'reduced: the item is drawn every frame: ' + still.item);
    assert.ok(still.glow.every(v => v != null && v === still.glow[0]), 'reduced: the glow holds: ' + still.glow);
    assert.ok(still.pop.every(y => y != null && y === still.pop[0]), 'reduced: the pop stays put: ' + still.pop);
  } finally {
    w.matchMedia = mm0;
    st.time = t0;
    st.gems.length = 0; st.drops.length = 0; st.itemDrops.length = 0; st.sitePops = [];
  }
});

// ---- run 1: the guided part sees single gems (the gem lesson) ---------------------
{
  const g = await boot({ tutorial: true, hints: true, variant: 'active', storage: [['hordes_onboarded', '1']] });
  g.pump(3);
  if (g.state.mode === 'intro') { g.skipMovie(); g.pump(2); }
  g.T.startRun();
  const gs = g.state;
  s.check('the guided part of run 1 holds the floor: gems never merge while it lasts', () => {
    assert.ok(g.T.tut.live, 'the guided part is on');
    const q = gs.player;
    // A field of gems the hero is not near: 20 s later every gem left is still single.
    for (let i = 0; i < 20; i++) gs.gems.push({ x: q.x + 300 + (i % 5) * 8, y: q.y + Math.floor(i / 5) * 8, xp: 1, t: gs.time });
    for (let i = 0; i < 60 * 20; i++) g.pump(1);
    assert.ok(g.T.tut.live, 'still in the guided part (else this proves nothing)');
    assert.ok(gs.gems.length >= 2, 'gems still lie on the floor: ' + gs.gems.length);
    const merged = gs.gems.filter(x => (x.n || 1) > 1);
    assert.equal(merged.length, 0, 'merged gems during the guided part: ' + merged.length);
  });
}

s.done();
process.exit(0);
