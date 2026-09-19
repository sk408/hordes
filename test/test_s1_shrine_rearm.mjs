// HORDES — S1 DOUBLE-SELL regression (brief docs/briefs/S1_SHRINE_DOUBLE_SELL.md,
// 2026-09-18): seedShrines has no minimum separation, so ~0.227% of run seeds
// place two altars inside the SAME 26px purchase radius, and the pre-fix
// purchase loop (src/main.js) sold EVERY in-range altar in one frame — one
// walk-up, two debits, the second blessing never chosen. The fix is a re-arm
// latch in the purchase path ONLY (src/shrines.js byte-stable): a successful
// debit sets state.shrineRearm; no further sale until the player has been
// more than 26px from EVERY unsold altar at least once.
// This file proves, through the REAL seeding + purchase path:
//   a. a REAL colliding seed exists (found by scanning the real
//      mulberry32(choiceSeed ^ 0x5eed) -> seedShrines chain) — printed below;
//   b. standing on the pair sells EXACTLY ONE altar (one debit, latch set);
//   c. leaving every radius re-arms: walking onto the second altar sells it
//      (second debit, both used);
//   d. the broke path never latches: insufficient purse on the pair sells
//      nothing and leaves the latch clear, and a top-up while STILL STANDING
//      sells immediately (no exit-and-reenter needed — the latch was never
//      set), then the latch holds the second altar until a real exit.
// Run: node test/test_s1_shrine_rearm.mjs
import assert from 'node:assert';
import { suite, boot } from './_harness.mjs';
import { mulberry32 } from '../src/weather.js';
import { seedShrines, shrineCost } from '../src/shrines.js';

const s = suite('test_s1_shrine_rearm');
const h = await boot({ storage: [['hordes_onboarded', '1']] });
const T = h.T, st = T.state;
T.banners.suppressAll();

// (a) FIND a real colliding seed through the REAL chain — the same draw main.js
// makes in startRun (state.shrineRng = mulberry32(choiceSeed ^ 0x5eed), then
// seedShrines). Deterministic scan; the first hit is pinned below.
let COLLIDE_SEED = -1, pairDist = 0;
for (let seed = 1; seed < 200000 && COLLIDE_SEED < 0; seed++) {
  const set = seedShrines(mulberry32((seed ^ 0x5eed) | 0));
  for (let i = 0; i < set.length && COLLIDE_SEED < 0; i++) {
    for (let j = i + 1; j < set.length; j++) {
      const d = Math.hypot(set[i].x - set[j].x, set[i].y - set[j].y);
      if (d < 26) { COLLIDE_SEED = seed; pairDist = d; break; }
    }
  }
}
console.log('  colliding seed: ' + COLLIDE_SEED + ' (pair distance ' + pairDist.toFixed(2) + 'px)');
assert.ok(COLLIDE_SEED > 0, 'a colliding seed exists in the first 200000');

// Keep the world still: no spawns, no wave end (test_s1_shrines idiom).
const pinWorld = () => {
  st.spawnTimer = 1e9;
  st.wave.midAt = st.time + 1e9;
  st.wave.endsAt = st.time + 1e9;
  st.wave.midBossDone = true;
};
// Start a run on the colliding seed THROUGH the real startRun: choiceSeed is
// (Math.random() * 1e9) | 0, so pin Math.random to land the seed exactly for
// the duration of the call (groundSeed etc. draw the same value — harmless).
const collidingRun = () => {
  st.mode = 'menu';
  h.elements['ov-cards'].innerHTML = '';
  const origRandom = Math.random;
  Math.random = () => COLLIDE_SEED / 1e9;
  try { T.startRun(); } finally { Math.random = origRandom; }
  h.pump(2);
  T.setPilotMode('MANUAL');   // the pilot must not wander off the pair
  h.pump(1);
  pinWorld();
  assert.equal(st.choiceSeed, COLLIDE_SEED, 'the run really rolled the colliding seed');
  const pair = [st.shrines[0], st.shrines[1]];
  assert.ok(Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y) < 26,
    'the seeded set really has an in-radius pair');
  return st.player;
};

// (b)+(c) ONE sale per approach, then re-arm sells the second ----------------
{
  const p = collidingRun();
  const prof = T.getProfile();
  prof.runPurse = 1000;
  const cost0 = shrineCost(st.wave.num - 1, 0);   // first sale: 60 at wave 1
  const cost1 = shrineCost(st.wave.num - 1, 1);   // the pair's second altar cached after the first sale

  // Stand ON the pair (altar 0's centre; altar 1 is 2.24px away — both in radius).
  p.x = st.shrines[0].x; p.y = st.shrines[0].y;
  for (let i = 0; i < 5; i++) { pinWorld(); h.pump(1); }
  s.check('ONE sale per approach: the pair sells exactly ONE altar on contact', () => {
    const used = st.shrines.filter(sh => sh.used).length;
    assert.equal(used, 1, 'exactly one altar used (pre-fix: both sold in one frame)');
    assert.equal(prof.runPurse, 1000 - cost0, 'the purse was debited EXACTLY one cost');
    assert.equal(st.shrineRearm, true, 'the latch is SET by the successful debit');
    assert.strictEqual(st.shrine, st.shrines.find(sh => !sh.used), 'the view advanced to the unsold altar');
  });

  // Standing still buys nothing more, however long you wait.
  for (let i = 0; i < 30; i++) { pinWorld(); h.pump(1); }
  s.check('the latch HOLDS while standing between the two altars', () => {
    assert.equal(st.shrines.filter(sh => sh.used).length, 1, 'no second sale while standing');
    assert.equal(prof.runPurse, 1000 - cost0, 'no second debit');
  });

  // (c) RE-ARM: leave every radius, then walk onto the second altar.
  p.x = 0; p.y = 0;   // far from the pair (the pair sits at ~(446,-106))
  { const pp = pinWorld; pp(); h.pump(1); }
  s.check('leaving every radius CLEARS the latch', () => {
    assert.equal(st.shrineRearm, false, 'latch cleared once >26px from all unsold');
  });
  const second = st.shrines.find(sh => !sh.used);
  p.x = second.x; p.y = second.y;
  for (let i = 0; i < 5; i++) { pinWorld(); h.pump(1); }
  s.check('the re-armed approach sells the SECOND altar (second debit, both used)', () => {
    assert.equal(st.shrines.filter(sh => sh.used).length, 2, 'both altars used after re-arm');
    assert.equal(prof.runPurse, 1000 - cost0 - cost1, 'the second debit is the two-sale cost');
    // Latch semantics after the sale: the ONLY unsold altar is the far third
    // one — the player is already >26px from every unsold altar, so the latch
    // clears the same frame it re-set (brief: clears once clear of every
    // UNSOLD altar). The same-frame guard did its work DURING the loop: the
    // pair still sold one-per-approach, which the checks above and below pin.
    assert.equal(st.shrineRearm, false, 'latch clear: no unsold altar is in radius after the sale');
  });
}

// (d) the broke path NEVER latches --------------------------------------------
{
  const p = collidingRun();
  const prof = T.getProfile();
  const cost0 = shrineCost(st.wave.num - 1, 0);
  prof.runPurse = cost0 - 1;                // one gold short
  p.x = st.shrines[0].x; p.y = st.shrines[0].y;
  for (let i = 0; i < 5; i++) { pinWorld(); h.pump(1); }
  s.check('broke on the pair: ZERO sales and the latch stays CLEAR', () => {
    assert.equal(st.shrines.filter(sh => sh.used).length, 0, 'no sale without the gold');
    assert.equal(prof.runPurse, cost0 - 1, 'no debit');
    assert.equal(st.shrineRearm, false, 'the broke path never sets the latch');
    assert.ok(st.shrines[0].brokeToast, 'the broke toast fired (the path really ran)');
  });
  // Top up off-seam while STILL STANDING: with no latch, the sale proceeds
  // immediately — the player is never stuck by a latch they never earned.
  prof.runPurse = 1000;
  pinWorld(); h.pump(1);
  s.check('a top-up while standing sells at once (no phantom latch), then the latch holds the pair', () => {
    assert.equal(st.shrines.filter(sh => sh.used).length, 1, 'exactly one sale after the top-up');
    assert.equal(prof.runPurse, 1000 - cost0, 'exactly one debit');
    assert.equal(st.shrineRearm, true, 'the sale set the latch');
  });
  pinWorld(); h.pump(5);
  s.check('...and the second altar still waits for a real exit-and-reenter', () => {
    assert.equal(st.shrines.filter(sh => sh.used).length, 1, 'no second sale while standing');
  });
}

s.done();
console.log('ALL S1 SHRINE RE-ARM TESTS PASSED');
