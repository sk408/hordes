// HORDES — headless tests for src/shrines.js (node, no DOM).
// Run: node test/test_shrines.mjs
import assert from 'node:assert';
import {
  rollShrine, shrineCost, shrineBlessing, canAfford,
  SHRINE_CHANCE, SHRINE_RING_MIN, SHRINE_RING_MAX,
  SHRINE_BASE_COST, SHRINE_COST_PER_WAVE, SHRINE_COST_USED_MULT,
} from '../src/shrines.js';
import { CHOICE_POOL, RARITIES, applyChoice } from '../src/choices.js';
import { makePlayer } from '../src/entities.js';
import { mulberry32 } from '../src/weather.js';

// Deterministic rng helper: replays a fixed sequence.
const seq = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };

// ---- roll: gate + ring geometry ----------------------------------------------
// Gate: first rng draw decides spawn — 0.59 spawns (< 0.6), 0.60 does not.
assert.equal(rollShrine(0, seq([0.60])), null, 'rng 0.60 must NOT spawn (>= chance)');
assert.ok(rollShrine(0, seq([0.59])), 'rng 0.59 must spawn (< chance)');

// Fixed draws pin the ring point: r = 250 + 0.5*(420-250) = 335, a = 0.25*2pi.
{
  const s = rollShrine(3, seq([0.0, 0.5, 0.25]));
  assert.ok(s, 'spawned');
  const r = Math.hypot(s.x, s.y);
  assert.ok(r >= SHRINE_RING_MIN - 1 && r <= SHRINE_RING_MAX + 1,
    `placement on the 250-420 patrol ring (got r=${r})`);
  assert.equal(s.used, false, 'fresh shrine is unused');
  assert.deepEqual(Object.keys(s).sort(), ['used', 'x', 'y'], 'plain {x,y,used} shape');
  // In-bounds for the +-600 arena clamp, always.
  assert.ok(Math.abs(s.x) <= 600 && Math.abs(s.y) <= 600, 'inside the arena');
}

// Determinism: same seed -> identical shrine.
assert.deepEqual(rollShrine(4, mulberry32(11)), rollShrine(4, mulberry32(11)),
  'same seed rolls the same shrine');

// ---- cadence bounds ----------------------------------------------------------
// 2000 seeded waves -> ~60% have a shrine (loose bounds; ring stays valid).
{
  const rng = mulberry32(4242);
  let spawned = 0, N = 2000;
  for (let i = 0; i < N; i++) {
    const s = rollShrine(i % 10, rng);
    if (s) {
      spawned++;
      const r = Math.hypot(s.x, s.y);
      assert.ok(r >= SHRINE_RING_MIN - 1 && r <= SHRINE_RING_MAX + 1,
        `spawn stays on the ring across waves (r=${r})`);
    } else {
      assert.equal(s, null, 'no-shrine waves return null');
    }
  }
  const f = spawned / N;
  assert.ok(f > 0.53 && f < 0.67, `cadence ~60% over ${N} waves (got ${(f * 100).toFixed(1)}%)`);
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
  const s1 = rollShrine(1, mulberry32(4)), s2 = rollShrine(1, mulberry32(4));
  assert.deepEqual(s1, s2, 'pure: identical shrine rolls');
}

console.log('ALL SHRINE TESTS PASSED');
