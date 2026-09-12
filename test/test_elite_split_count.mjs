// HORDES — ELITE SPLIT COUNT (agent F, wave-25).
//
// Defect: ELITE_MODS.SPLITTING.onDeathSplit declared `count: 2`, but
// splitChildren() built its children purely from SPLIT_OFFSETS, so editing
// `count` silently did nothing — a tuning knob that lies.
//
// Fix: `count` is honoured (1..n children). The authored SPLIT_OFFSETS pair is
// still the canonical 2-child scatter (the shipped count is 2, so the live
// shape is byte-identical); counts above 2 derive further deterministic
// positions by repeating the authored pair with y mirrored — no rng in a pure
// function.
//
// Run: node test/test_elite_split_count.mjs   (exit 0 = pass)
import { ELITE_MODS, SPLIT_OFFSETS, splitChildren, applyEliteModifier } from '../src/elite_mods.js';
import { makeTypedEnemy } from '../src/enemy_types.js';

let failed = 0;
function ok(cond, msg) {
  if (cond) { console.log('  PASS ' + msg); }
  else { failed++; console.error('  FAIL ' + msg); }
}

const plan = ELITE_MODS.SPLITTING.onDeathSplit;
function withCount(n, fn) {
  const old = plan.count;
  plan.count = n;
  try { return fn(); } finally { plan.count = old; }
}
function splittingParent() {
  const p = { ...makeTypedEnemy('BRUTE', 100, 50, 60) };
  Object.assign(p, applyEliteModifier(p, 'SPLITTING'));
  return p;
}

console.log('SHIPPED SHAPE (count 2) is unchanged:');
{
  const p = splittingParent();
  const kids = splitChildren(p);
  ok(plan.count === 2, 'the shipped SPLITTING count is still 2');
  ok(kids.length === 2, `count 2 -> two children (got ${kids.length})`);
  ok(Math.abs(kids[0].x - p.x - SPLIT_OFFSETS[0].dx) < 1e-9 &&
     Math.abs(kids[0].y - p.y - SPLIT_OFFSETS[0].dy) < 1e-9,
    'child 0 still uses the authored SPLIT_OFFSETS[0] scatter');
  ok(Math.abs(kids[1].x - p.x - SPLIT_OFFSETS[1].dx) < 1e-9,
    'child 1 still uses the authored SPLIT_OFFSETS[1] scatter');
}

console.log('COUNT IS HONOURED:');
{
  const kids3 = withCount(3, () => splitChildren(splittingParent()));
  ok(kids3 && kids3.length === 3, `count 3 -> three children (got ${kids3 && kids3.length})`);

  const kids4 = withCount(4, () => splitChildren(splittingParent()));
  ok(kids4 && kids4.length === 4, `count 4 -> four children (got ${kids4 && kids4.length})`);
  const spots = new Set(kids4.map(k => `${Math.round(k.x)},${Math.round(k.y)}`));
  ok(spots.size === 4, 'every child of a 4-way split gets its own position');

  const one = withCount(1, () => splitChildren(splittingParent()));
  ok(one && one.length === 1 &&
     Math.abs(one[0].x - (100 + SPLIT_OFFSETS[0].dx)) < 1e-9,
    'count 1 -> a single child on the authored scatter');

  // Garbage counts degrade instead of exploding: a falsy / non-positive count
  // falls back to the authored pair (the shipped shape), never to an empty
  // split; the children keep every contract field.
  const zero = withCount(0, () => splitChildren(splittingParent()));
  ok(zero && zero.length === SPLIT_OFFSETS.length,
    'count 0 falls back to the authored pair (never an empty split)');
  const nan = withCount(undefined, () => splitChildren(splittingParent()));
  ok(nan && nan.length === SPLIT_OFFSETS.length, 'a missing count falls back to the authored pair');
  const kids = withCount(3, () => splitChildren(splittingParent()));
  ok(kids.every(k => k.hp === kids[0].hp && k.eliteMod === null &&
     k.w < 60 && k.splitSpent === false),
    'every generated child keeps the 30% hp / no-modifier / smaller-box contract');
}

console.log('ONCE-ONLY + non-splitters untouched:');
{
  const p = splittingParent();
  p.splitSpent = true;
  ok(splitChildren(p) === null, 'a spent parent still refuses to split');
  const swift = { ...makeTypedEnemy('CHASER', 0, 0, 0) };
  Object.assign(swift, applyEliteModifier(swift, 'SWIFT'));
  ok(splitChildren(swift) === null, 'a non-splitting elite still refuses');
  const plain = makeTypedEnemy('CHASER', 0, 0, 0);
  ok(splitChildren(plain) === null, 'a plain enemy still refuses');
  ok(plan.count === 2, 'the count knob was restored by the probe');
}

if (failed) { console.error(`\n${failed} FAILURES`); process.exit(1); }
console.log('\nALL ELITE SPLIT COUNT TESTS PASSED');
