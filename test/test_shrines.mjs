// HORDES — headless tests for src/shrines.js (node, no DOM).
// Run: node test/test_shrines.mjs
import assert from 'node:assert';
import {
  seedShrines, shrineCost, shrineBlessing, canAfford,
  SHRINE_WORLD_COUNT, SHRINE_WORLD_MARGIN,
  SHRINE_BASE_COST, SHRINE_COST_PER_WAVE, SHRINE_COST_USED_MULT,
} from '../src/shrines.js';
import { CHOICE_POOL, RARITIES, applyChoice } from '../src/choices.js';
import { makePlayer } from '../src/entities.js';
import { mulberry32 } from '../src/weather.js';

// Deterministic rng helper: replays a fixed sequence.
const seq = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };

// ---- world seed: count + geometry -------------------------------------------
// S1 RETARGET (was: per-wave gate 0.60 + 250-420 ring): the per-wave roll is
// deleted; the set is seeded ONCE at run start. The new contract: exactly
// SHRINE_WORLD_COUNT altars, integer pixels, uniform over the +-(600-MARGIN)
// box, never centre-ringed, and a FIXED draw count at creation (then ZERO
// draws per wave — the stronger property: stepping waves consumes no rng).
{
  const set = seedShrines(mulberry32(1));
  assert.equal(set.length, SHRINE_WORLD_COUNT, `exactly ${SHRINE_WORLD_COUNT} shrines per world`);
  for (const s of set) {
    assert.equal(s.used, false, 'fresh shrine is unused');
    assert.deepEqual(Object.keys(s).sort(), ['used', 'x', 'y'], 'plain {x,y,used} shape');
    assert.equal(s.x, Math.round(s.x), 'integer pixel x');
    assert.equal(s.y, Math.round(s.y), 'integer pixel y');
    const half = 600 - SHRINE_WORLD_MARGIN;
    assert.ok(Math.abs(s.x) <= half && Math.abs(s.y) <= half,
      `inside the rim with margin (|x|,|y| <= ${half})`);
  }
}

// Fixed draws pin the placement: every draw 0.25 -> (0.25*2-1)*560 = -280.
{
  const set = seedShrines(seq([0.25]));
  for (const s of set) {
    assert.equal(s.x, -280, 'pinned x from the fixed draw');
    assert.equal(s.y, -280, 'pinned y from the fixed draw');
  }
}

// Determinism: same seed -> identical set.
assert.deepEqual(seedShrines(mulberry32(11)), seedShrines(mulberry32(11)),
  'same seed rolls the same world set');
assert.notDeepEqual(seedShrines(mulberry32(11)), seedShrines(mulberry32(12)),
  'different seeds roll different sets');

// ---- draw cadence + distribution --------------------------------------------
// Exactly 2 rng draws per shrine at creation — the whole run's shrine
// randomness is spent up front; nothing is drawn per wave.
{
  let draws = 0;
  const counting = () => { draws++; return 0.5; };
  seedShrines(counting);
  assert.equal(draws, 2 * SHRINE_WORLD_COUNT,
    `exactly ${2 * SHRINE_WORLD_COUNT} draws at world creation, zero after`);
}
// Whole-map, NOT the old 250-420 centre ring: over many seeds the scatter
// escapes the ring in BOTH directions, and |x| averages ~half the box
// (uniform on [-560,560] -> E|x| = 280).
{
  let inside = 0, outside = 0, sumAbsX = 0, n = 0;
  for (let seed = 1; seed <= 500; seed++) {
    for (const s of seedShrines(mulberry32(seed))) {
      const r = Math.hypot(s.x, s.y);
      if (r < 250) inside++;
      if (r > 420) outside++;
      sumAbsX += Math.abs(s.x); n++;
    }
  }
  assert.ok(inside > 0, 'scatter reaches INSIDE the old 250 ring (not centre-ringed)');
  assert.ok(outside > 0, 'scatter reaches OUTSIDE the old 420 ring (whole-map)');
  const meanAbsX = sumAbsX / n;
  assert.ok(meanAbsX > 250 && meanAbsX < 310,
    `|x| mean ~280 for a uniform box (got ${meanAbsX.toFixed(1)})`);
}

// ---- exact cost curve --------------------------------------------------------
// cost(wave, used) = round((60 + 30*wave) * 1.25^used)
assert.equal(shrineCost(0, 0), 60, 'wave 0, first of run: 60');
assert.equal(shrineCost(2, 0), 120, 'wave 2, first: 120');
assert.equal(shrineCost(5, 0), 210, 'wave 5, first: 210');
assert.equal(shrineCost(0, 1), 75, 'wave 0, second of run: 75');
assert.equal(shrineCost(0, 2), 94, 'wave 0, third: 94');
assert.equal(shrineCost(4, 2), 281, 'wave 4, third: 281');
assert.equal(shrineCost(0), 60, 'alreadyUsedCount defaults to 0');
assert.equal(shrineCost(0, -3), 60, 'negative used clamps to 0');
assert.equal(shrineCost(-2, 0), 60, 'negative wave clamps to 0');
assert.equal(shrineCost(1.9, 0), 90, 'fractional waves floor');
// Curve identity vs the documented formula for a sweep.
for (let w = 0; w <= 9; w++) {
  for (let n = 0; n <= 4; n++) {
    assert.equal(shrineCost(w, n),
      Math.round((SHRINE_BASE_COST + SHRINE_COST_PER_WAVE * w) *
                 Math.pow(SHRINE_COST_USED_MULT, n)),
      `formula holds (wave ${w}, used ${n})`);
  }
}

// ---- canAfford ---------------------------------------------------------------
assert.equal(canAfford(100, 60), true, 'gold >= cost');
assert.equal(canAfford(60, 60), true, 'exactly enough affords');
assert.equal(canAfford(59, 60), false, 'one short does not');
assert.equal(canAfford(0, 60), false, 'broke does not');
assert.equal(canAfford(undefined, 60), false, 'missing gold is not affordable');

// ---- blessing: choices.js semantics ------------------------------------------
// Determinism: same seed -> same offer id + same cost.
{
  const a = shrineBlessing(2, mulberry32(77));
  const b = shrineBlessing(2, mulberry32(77));
  assert.equal(a.offer.id, b.offer.id, 'same seed -> same blessing');
  assert.equal(a.cost, b.cost, 'same seed -> same cost');
  assert.ok(CHOICE_POOL.some((e) => e.id === a.offer.id), 'offer comes from CHOICE_POOL');
  assert.ok(RARITIES.includes(a.offer.rarity), 'offer carries a rarity');
  assert.equal(a.cost, shrineCost(2, 0), 'cost matches the curve for 0 taken');
  assert.ok(a.offer.desc.includes('/'), 'desc states blessing AND drawback');
}
// takenIds: no repeats within a run (14-pool), cost scales with count, and
// exhaustion returns null.
{
  const rng = mulberry32(909);
  const taken = [];
  let blessings = 0;
  for (let wave = 0; wave < 20; wave++) {
    const b = shrineBlessing(wave, rng, taken);
    if (!b) break;
    assert.ok(!taken.includes(b.offer.id),
      `no repeat within the run (wave ${wave}, id ${b.offer.id})`);
    assert.equal(b.cost, shrineCost(wave, taken.length),
      'cost = (60 + 30*wave) * 1.25^priorShrines');
    const p = makePlayer();
    applyChoice(p, b.offer);           // the offer is a real choices.js apply
    assert.ok(p.meta === undefined && p.profile === undefined,
      'blessing path never touches meta/profile');
    taken.push(b.offer.id);
    blessings++;
  }
  assert.equal(blessings, CHOICE_POOL.length, 'run drains the pool exactly');
  assert.equal(shrineBlessing(3, mulberry32(1), taken), null,
    'exhausted pool returns null');
}
// takenIds excludes: an id passed in can never come back out.
{
  const rng = mulberry32(5);
  for (let k = 0; k < 50; k++) {
    const b = shrineBlessing(1, rng, ['blood_pact']);
    assert.notEqual(b.offer.id, 'blood_pact', 'excluded id never offered');
  }
}

// ---- purity ------------------------------------------------------------------
// Every export is a pure roll: repeated calls with fresh seeds produce plain
// data, and nothing grows state between calls.
{
  const a = shrineBlessing(0, mulberry32(3), []);
  const b = shrineBlessing(0, mulberry32(3), []);
  assert.deepEqual([a.offer.id, a.cost], [b.offer.id, b.cost], 'pure: identical inputs');
  const s1 = seedShrines(mulberry32(4)), s2 = seedShrines(mulberry32(4));
  assert.deepEqual(s1, s2, 'pure: identical world sets');   // S1 retarget: was rollShrine
}

console.log('ALL SHRINE TESTS PASSED');
