// AUDIT ROUND 2 (2026-09-16) — SWARM focus-picker micro-benchmark.
//
// The SWARM branch of AutoPilotController.pickTarget (src/controllers.js) was
// O(n^2): every candidate rescanned the whole field to count its cluster. This
// harness measures the BEFORE (a local copy of that exact double loop), the
// AFTER (the REAL pickTarget SWARM path on the current tree — exact below
// SWARM_EXACT_MAX, grid-scored above it), and a NEAREST reference scan (the
// O(n) floor every picker already pays), at 1k / 3k / 10k enemies.
//
// Field shape: one dense core (the worst case for the old scan — everything
// clusters) plus a spread skirt, all inside a maxed-Rangefinder engagement
// radius so every enemy is a candidate. Numbers are ms per call, best of R
// repetitions (min = least scheduler noise).
//
// Run: node tools/swarm_bench.mjs
import { CONFIG as C } from '../src/config.js';
import { AutoPilotController } from '../src/controllers.js';

const CR = C.AUTOPILOT.SWARM_CLUSTER_R;          // 60
const RANGE = 400;                               // maxed Rangefinder territory
const R2 = RANGE * RANGE;

// Deterministic field: a dense core at (+60,0) inside one cluster radius, a
// sparse skirt everywhere else in range.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeHorde(n) {
  const rng = mulberry32(42);
  const out = [];
  const core = Math.floor(n * 0.6);
  for (let i = 0; i < core; i++) {
    const a = rng() * Math.PI * 2, r = rng() * (CR * 0.9);
    out.push({ x: 60 + Math.cos(a) * r, y: Math.sin(a) * r, hp: 10, maxHp: 10 });
  }
  for (let i = core; i < n; i++) {
    const a = rng() * Math.PI * 2, r = 100 + rng() * (RANGE - 120);
    out.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, hp: 10, maxHp: 10 });
  }
  return out;
}

// BEFORE — the pre-round-2 SWARM scan, verbatim (audit finding).
function swarmNaive(p, enemies) {
  const cr2 = CR ** 2;
  let best = null, bc = -1, bd = Infinity;
  for (const e of enemies) {
    const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
    if (d > R2) continue;
    let count = 0;
    for (const o of enemies) {
      if ((o.x - e.x) ** 2 + (o.y - e.y) ** 2 <= cr2) count++;
    }
    if (count > bc || (count === bc && d < bd)) { bc = count; bd = d; best = e; }
  }
  return best;
}

// NEAREST reference — the O(n) floor.
function nearestRef(p, enemies) {
  let best = null, bd = Infinity;
  for (const e of enemies) {
    const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

function bench(label, fn, reps) {
  let best = Infinity;
  for (let i = 0; i < reps; i++) {
    const t0 = process.hrtime.bigint();
    fn();
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    if (ms < best) best = ms;
  }
  return best;
}

const ctl = new AutoPilotController();
ctl.focus = 'SWARM';
const p = { x: 0, y: 0, stats: { focusRange: RANGE } };

const rows = [];
for (const n of [1000, 3000, 10000]) {
  const enemies = makeHorde(n);
  const state = { enemies };
  const reps = n >= 10000 ? 5 : 20;
  const before = bench(`naive`, () => swarmNaive(p, enemies), reps);
  const after = bench(`real`, () => ctl.pickTarget(p, state, C, nearestRef(p, enemies)), reps);
  const near = bench(`nearest`, () => nearestRef(p, enemies), reps);
  rows.push({ n, before, after, near });
}

console.log('SWARM focus-picker micro-benchmark (ms/call, best of reps, dense-core field)');
console.log('  path: grid-scored above SWARM_EXACT_MAX=256, exact below');
console.log('');
console.log('      n |   BEFORE (O(n^2)) |   AFTER (pickTarget) | NEAREST ref');
console.log('  ------+-------------------+----------------------+------------');
for (const r of rows) {
  console.log(
    `  ${String(r.n).padStart(5)} | ${r.before.toFixed(3).padStart(17)} | ${r.after.toFixed(3).padStart(20)} | ${r.near.toFixed(3).padStart(10)}`);
}
const worst = rows[rows.length - 1];
console.log('');
console.log(`  10k speedup: ${worst.before > 0 ? (worst.before / worst.after).toFixed(1) : '?'}x` +
  `  (after/near ratio ${(worst.after / worst.near).toFixed(1)}x the O(n) floor)`);
