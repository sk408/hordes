// HORDES — regression: run-taken exclude ids that never came from the pool must
// not shrink the offer set.
// Run: node test/test_choices_exclude.mjs
//
// BUG (Agent C): rollChoices sized the offer set as
//   n = min(3, CHOICE_POOL.length - used.size)
// where `used` is the Set of excludeIds. Any exclude id that is NOT a blessing id
// counted against the pool anyway, so passing 12 unknown ids (or any other
// foreign id a caller might carry, e.g. an item/weapon id) silently dropped the
// set to 2 offers even though all 14 blessings were still available. The count is
// now taken off the pool itself, which is identical for real run-taken ids.
import assert from 'node:assert/strict';
import { rollChoices, CHOICE_POOL } from '../src/choices.js';
import { mulberry32 } from '../src/weather.js';

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`  ok - ${name}`);
}

const POOL_IDS = CHOICE_POOL.map((e) => e.id);
const seq = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };

check('a fresh run still gets 3 distinct offers', () => {
  const off = rollChoices(0, mulberry32(7), []);
  assert.equal(off.length, 3);
  assert.equal(new Set(off.map((o) => o.id)).size, 3, 'distinct ids within a set');
  assert.ok(off.every((o) => POOL_IDS.includes(o.id)));
});

check('12 foreign exclude ids no longer shrink the set to 2', () => {
  const foreign = Array.from({ length: 12 }, (_, i) => 'not_a_blessing_' + i);
  const off = rollChoices(0, mulberry32(7), foreign);
  assert.equal(off.length, 3, 'all 14 blessings were still available');
  assert.ok(off.every((o) => POOL_IDS.includes(o.id)));
});

check('genuinely taken ids still bound the set (unchanged behavior)', () => {
  // 11 taken -> 3 left -> full set
  assert.equal(rollChoices(0, mulberry32(1), POOL_IDS.slice(0, 11)).length, 3);
  // 12 taken -> 2 left -> 2 offers
  assert.equal(rollChoices(0, mulberry32(1), POOL_IDS.slice(0, 12)).length, 2);
  // 13 taken -> 1 left -> 1 offer
  assert.equal(rollChoices(0, mulberry32(1), POOL_IDS.slice(0, 13)).length, 1);
  // whole pool drained -> no offers
  assert.equal(rollChoices(0, mulberry32(1), POOL_IDS).length, 0);
});

check('mixed taken + foreign ids behave like the taken ids alone', () => {
  const mixed = [...POOL_IDS.slice(0, 12), 'bogus_a', 'bogus_b', 'bogus_c'];
  assert.equal(rollChoices(0, mulberry32(3), mixed).length, 2);
});

check('taken ids are never offered back', () => {
  const taken = POOL_IDS.slice(0, 5);
  for (let k = 0; k < 40; k++) {
    const off = rollChoices(2, mulberry32(100 + k), taken);
    for (const o of off) assert.ok(!taken.includes(o.id), `${o.id} repeated a taken id`);
  }
});

check('rng cadence is unchanged: 2 draws per offer', () => {
  let draws = 0;
  const counting = (v) => { draws++; return 0.5; };
  rollChoices(0, counting, []);
  assert.equal(draws, 6, '3 offers x (1 rarity + 1 entry)');
  draws = 0;
  rollChoices(0, counting, POOL_IDS.slice(0, 13));
  assert.equal(draws, 2, '1 offer = 2 draws');
  draws = 0;
  rollChoices(0, counting, POOL_IDS);
  assert.equal(draws, 0, 'no offers -> no rng consumed');
});

check('determinism: identical seeds still replay identically', () => {
  const a = rollChoices(3, mulberry32(99), []);
  const b = rollChoices(3, mulberry32(99), []);
  assert.deepEqual(a.map((o) => [o.id, o.rarity]), b.map((o) => [o.id, o.rarity]));
  const script = () => [0.9, 0.1, 0.9, 0.2, 0.9, 0.3];
  const c1 = rollChoices(0, seq(script()), []);
  const c2 = rollChoices(0, seq(script()), []);
  assert.equal(c1.length, 3);
  assert.deepEqual(c1.map((o) => o.id), c2.map((o) => o.id), 'scripted rng replays');
  assert.ok(c1.every((o) => o.rarity === 'EPIC'), '0.9 rarity draws land in the EPIC band');
});

console.log(`\n${passed} assertion groups passed — test_choices_exclude OK`);
