// M3 (audit 2026-09-16): the ground-item arrays (gems/drops/itemDrops) were
// UNBOUNDED. Fix: merge-on-overflow (value-preserving, proximity-chosen
// survivor) for gems and potions; a DISCLOSED oldest-cull fallback for unique
// equippables. No magnetism, no auto-collect.
import { pushGroundCapped, makeGem } from '../src/entities.js';
import { makeWeapon } from '../src/weapons.js';
import { CONFIG } from '../src/config.js';
import { boot } from './_harness.mjs';
import assert from 'node:assert/strict';

const CAPS = CONFIG.GROUND_ITEMS;

// --- 1. PURE: below cap it is a plain push (identity, single-item path) ------
{
  const arr = [];
  const a = makeGem(0, 0, 5), b = makeGem(10, 10, 7);
  assert.equal(pushGroundCapped(arr, a, CAPS.GEM_CAP, () => 'gem', (s, n) => { s.xp += n.xp; }), a);
  assert.equal(pushGroundCapped(arr, b, CAPS.GEM_CAP, () => 'gem', (s, n) => { s.xp += n.xp; }), b);
  assert.equal(arr.length, 2, 'below cap: plain push, no merge');
  assert.deepEqual(arr.map(g => g.xp), [5, 7], 'values untouched below cap');
}

// --- 2. PURE: at cap the NEAREST same-kind survivor absorbs; kinds never
//        cross-merge (an hp potion never eats an mp potion). -----------------
{
  const arr = [
    { x: 0, y: 0, kind: 'hp', count: 1 },
    { x: 100, y: 0, kind: 'hp', count: 1 },
    { x: 1, y: 0, kind: 'mp', count: 1 },
  ];
  const near = pushGroundCapped(arr, { x: 12, y: 0, kind: 'hp', count: 1 }, 3,
    d => d.kind, (s, n) => { s.count = (s.count || 1) + (n.count || 1); });
  assert.equal(near, arr[0], 'nearest same-kind (hp at 0,0) is the survivor');
  assert.equal(arr[0].count, 2, 'value merged into the survivor');
  assert.equal(arr[2].count, 1, 'mp potion untouched (no cross-kind merge)');
  assert.equal(arr.length, 3, 'at cap the array never grows');
}

// --- 3. PURE: 10,000-gem pile — length stays at cap, summed value EXACT -----
{
  const arr = [];
  const absorb = (s, n) => { s.xp += n.xp; };
  let total = 0;
  for (let i = 0; i < 10000; i++) {
    const xp = 1 + (i % 7);
    total += xp;
    pushGroundCapped(arr, makeGem(((i * 37) % 400) - 200, ((i * 53) % 400) - 200, xp),
      CAPS.GEM_CAP, () => 'gem', absorb);
  }
  assert.equal(arr.length, CAPS.GEM_CAP, `10k-gem pile stays at the ${CAPS.GEM_CAP} cap`);
  const sum = arr.reduce((s, g) => s + g.xp, 0);
  assert.equal(sum, total, `total collectable value unchanged (${sum} == ${total})`);
}

// --- 4. THE REAL FUNNEL: 10,000 kills in one nova -> gems capped, value exact.
{
  const h = await boot();
  const st = h.state, T = h.T;
  T.startRun(); h.pump(2);
  st.pilotMode = 'MANUAL';                  // no pilot scooping: value stays on the ground
  st.enemies.length = 0;                    // no ambient spawns in the accounting
  st.spawnTimer = 1e9;
  st.player.stats.damage = 1e9;             // one nova tick reaps everything
  st.weapons.length = 0;
  st.weapons.push(makeWeapon('NOVA_PULSE'));
  const px = st.player.x, py = st.player.y;
  const N = 10000, XP = 5;
  for (let i = 0; i < N; i++) {
    const a = (i * 0.618) % (Math.PI * 2), r = 30 + (i % 35);
    st.enemies.push({ typeId: 'CHASER', x: px + Math.cos(a) * r, y: py + Math.sin(a) * r,
      hp: 1, maxHp: 1, w: 10, h: 10, speed: 0, xp: XP, age: 0 });
  }
  h.pump(5);                                // the first nova tick (cd 0) kills all in frame 1-2
  assert.equal(st.enemies.length, 0, 'the nova reaped the whole horde');
  assert.ok(st.gems.length > 0 && st.gems.length <= CAPS.GEM_CAP,
    `real-funnel gem pile ${st.gems.length} stays <= ${CAPS.GEM_CAP}`);
  const groundXp = st.gems.reduce((s, g) => s + g.xp, 0);
  assert.equal(groundXp + (st.player.xp - 0), N * XP,
    `total value unchanged: ground ${groundXp} + banked ${st.player.xp} == ${N * XP}`);
  assert.ok(st.drops.length <= CAPS.DROP_CAP, `potion litter ${st.drops.length} <= ${CAPS.DROP_CAP}`);
  assert.ok(st.itemDrops.length <= CAPS.ITEM_CAP, `item belt ${st.itemDrops.length} <= ${CAPS.ITEM_CAP}`);

  // 10k kills are near-certain to grant an EVOLUTION TOKEN (1-in-500ish per
  // kill/drop): its arrival banner HOLDS the sim for ~2.5s (state.bannerHold),
  // and the pile can level the player -> the DRAFT modal parks the run (and
  // can chain: resolving one level opens the next). Pump, auto-picking draft
  // card 1 (the smoke-test convention), until the sim is provably LIVE again
  // (state.time advancing frame over frame).
  const live = () => { const t0 = st.time; h.pump(1); return st.time > t0; };
  let settled = false;
  for (let f = 0; f < 900 && !settled; f++) {
    if (st.mode === 'draft') {
      const cards = h.elements['ov-cards'];
      const c0 = cards && cards.children[0];
      if (c0) c0.click();
    }
    settled = live() && (st.bannerHold <= 0) && st.mode === 'playing'
      && (() => { const t0 = st.time; h.pump(1); return st.time > t0 && st.mode === 'playing'; })();
  }
  assert.ok(settled, `run is live (mode ${st.mode}, bannerHold ${st.bannerHold})`);

  // --- 5. Single-item pickup unaffected: below cap, a lone gem on a clean
  //        field is a plain push and pays its own value (K = the run's live
  //        xp multipliers, measured with a control gem so weather/rampage
  //        stance cannot make the economy assert flaky). --------------------
  st.gems.length = 0;
  let xpBefore = st.player.xp;
  T.m3.pushGem(makeGem(st.player.x + 1, st.player.y, 4));   // control gem
  assert.equal(st.gems.length, 1, 'single gem below cap: plain push');
  h.pump(2);
  const K = (st.player.xp - xpBefore) / 4;
  assert.ok(K > 0, `control gem collected (multiplier ${K})`);
  xpBefore = st.player.xp;
  T.m3.pushGem(makeGem(st.player.x + 1, st.player.y, 5));
  h.pump(2);
  assert.ok(Math.abs((st.player.xp - xpBefore) - 5 * K) < 1e-9,
    `the reached gem paid exactly its own value (${st.player.xp - xpBefore} == 5 x ${K})`);
  assert.equal(st.gems.length, 0, 'and left the ground');

  // --- 6. Merged potion payout: a count-carrying drop pays up to the potion
  //        cap and leaves the remainder ON the ground (value preserved) -----
  st.drops.length = 0;
  const cap = st.potionCap;
  st.player.potions.hp = cap - 2;           // room for exactly 2
  T.m3.pushDrop({ x: st.player.x + 1, y: st.player.y, kind: 'hp', count: 5 });
  h.pump(2);
  assert.equal(st.player.potions.hp, cap, 'potion cap respected');
  assert.equal(st.drops.length, 1, 'one merged hp drop remains');
  assert.equal(st.drops[0].kind, 'hp');
  assert.equal(st.drops[0].count, 3, 'remainder (3) stays on the ground');
  st.player.potions.hp = cap;               // now full: nothing taken
  h.pump(2);
  assert.equal(st.drops[0].count, 3, 'a full belt takes nothing — value stays');

  // --- 7. ITEM DROP FALLBACK (disclosed): the belt never exceeds ITEM_CAP ---
  st.itemDrops.length = 0;
  for (let i = 0; i < CAPS.ITEM_CAP + 10; i++) {
    T.m3.pushItemDrop({ x: i, y: 0, item: { id: 'x' + i }, age: 0 });
  }
  assert.equal(st.itemDrops.length, CAPS.ITEM_CAP, 'item belt capped (oldest-culled, disclosed)');
  assert.deepEqual(st.itemDrops.map(d => d.item.id),
    Array.from({ length: CAPS.ITEM_CAP }, (_, k) => 'x' + (10 + k)),
    'the OLDEST drops gave way, newest kept in order');

  // --- 8. SCAN COST: per-frame pickup scan at cap vs the uncapped 10k pile --
  const synth = n => Array.from({ length: n }, (_, i) =>
    ({ x: ((i * 37) % 400) - 200 + px, y: ((i * 53) % 400) - 200 + py, xp: 5 }));
  const timeBest = fn => {
    let best = Infinity;
    for (let r = 0; r < 3; r++) {
      const t0 = process.hrtime.bigint();
      fn();
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      if (ms < best) best = ms;
    }
    return best;
  };
  st.gems = synth(10000);                   // the OLD world: unbounded array
  const uncapped = timeBest(() => h.pump(200));
  st.gems = synth(CAPS.GEM_CAP);            // the NEW world: capped array
  const capped = timeBest(() => h.pump(200));
  console.log(`scan cost, 200 frames best-of-3: capped(${CAPS.GEM_CAP}) ${capped.toFixed(1)}ms vs uncapped(10000) ${uncapped.toFixed(1)}ms = ${(uncapped / Math.max(0.01, capped)).toFixed(1)}x`);
  assert.ok(capped < uncapped, `capped scan (${capped.toFixed(1)}ms) must beat uncapped (${uncapped.toFixed(1)}ms)`);
}

console.log('test_audit_m3: all checks passed');
