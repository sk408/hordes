// HORDES — test/test_arch_model.mjs (W7a slice 1): DRIFT LOCKS for the arch
// model, asserted against the GAME's own code (src/arches.js), never against a
// copy of it. Distinct from test/test_arch_buffs.mjs (the weapons.js WIRING
// defect) and test/test_arches.mjs (the game module): this file locks the
// MODEL — table derivation, stacking semantics via the game's own functions,
// the exact 100%-uptime multipliers, linear uptime scaling, the measured
// parameter block's internal consistency, and that ARCH.ACTIVATE_R is READ.
// Run: node test/test_arch_model.mjs
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ARCH_TYPES, ARCH, spawnArch, tickArches, activeArchMods,
} from '../src/arches.js';
import {
  ARCH_TYPES as MODEL_TYPES, TYPE_IDS, ACTIVATE_R, spawnWaveArchesModel,
  MEASURED_ARCH, pooledMeasured, expectedMods, combineMods, archDpsMult,
  shieldAbsorbsPerWave, recomputeFromLogs,
} from '../tools/arch_model.mjs';
import { CONFIG as C } from '../src/config.js';

let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  if (ok) { pass++; console.log('ok   ' + name + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : '')); }
  else { fail++; console.log('FAIL ' + name + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : '')); }
};

// ---- 1. the model's table IS the game's table (all five types, every field) ----
check('TYPE_IDS is the five live types in ARCH_TYPES order',
  TYPE_IDS.length === 5 && TYPE_IDS.every((t, i) => t === Object.keys(ARCH_TYPES)[i]),
  TYPE_IDS);
{
  check('MODEL_TYPES is the LIVE ARCH_TYPES object itself (re-export, zero copies)',
    MODEL_TYPES === ARCH_TYPES);
  let same = true;
  for (const t of TYPE_IDS) {
    const g = ARCH_TYPES[t], m = MODEL_TYPES[t];
    if (!m) { same = false; break; }
    if (g.name !== m.name || g.duration !== m.duration) same = false;
    if ((g.shieldHits || 0) !== (m.shieldHits || 0)) same = false;
    const gk = Object.keys(g.mods), mk = Object.keys(m.mods);
    if (gk.length !== mk.length) same = false;
    for (const k of gk) if (g.mods[k] !== m.mods[k]) same = false;
  }
  check('every type: name + duration + shieldHits + EVERY mods field equals the game table', same);
}
check('the exact live values are present (DOUBLE_FIRE rateMult 2, MAGNET pickupMult 4, SHIELD 3 absorbs, BERSERK damageMult 1.5 + speedMult 0.75, SWIFT speedMult 1.4)',
  ARCH_TYPES.DOUBLE_FIRE.mods.rateMult === 2 && ARCH_TYPES.MAGNET.mods.pickupMult === 4
  && ARCH_TYPES.SHIELD.shieldHits === 3 && ARCH_TYPES.SHIELD.mods && Object.keys(ARCH_TYPES.SHIELD.mods).length === 0
  && ARCH_TYPES.BERSERK.mods.damageMult === 1.5 && ARCH_TYPES.BERSERK.mods.speedMult === 0.75
  && ARCH_TYPES.SWIFT.mods.speedMult === 1.4);

// ---- 2. stacked different-type mods multiply EXACTLY as activeArchMods does ----
{
  const set = ['DOUBLE_FIRE', 'BERSERK', 'SWIFT'];
  const viaModel = combineMods(set);
  const viaGame = activeArchMods({ archBuffs: set.map(type => ({ type, t: 1 })) });
  const manual = { rateMult: 1 * 2, pickupMult: 1, damageMult: 1 * 1.5, speedMult: 1 * 0.75 * 1.4, shieldHits: 0 };
  check('combineMods(DELEGATES to the game activeArchMods) == manual product for a 3-type stack',
    viaModel.rateMult === manual.rateMult && viaModel.damageMult === manual.damageMult
    && viaModel.speedMult === manual.speedMult && viaModel.pickupMult === manual.pickupMult
    && viaModel.shieldHits === manual.shieldHits,
    { viaModel, viaGame, manual });
  check('the delegation path itself equals the game call on the same state',
    JSON.stringify(viaModel) === JSON.stringify(viaGame));
  const withShield = combineMods(['SHIELD', 'SHIELD']);
  check('SHIELD absorbs SUM under the game semantics (3+3=6), mults stay identity',
    withShield.shieldHits === 6 && withShield.rateMult === 1 && withShield.damageMult === 1, withShield);
}

// ---- 3. same-type refresh does NOT stack (the game's own tickArches) ----
{
  const p = { x: 0, y: 0 };
  const a1 = { ...spawnArch(() => 0, p.x, p.y) };   // rng()=0 -> type index 0 = DOUBLE_FIRE
  const a2 = { ...spawnArch(() => 0, p.x, p.y) };
  assert.equal(a1.type, 'DOUBLE_FIRE'); assert.equal(a2.type, 'DOUBLE_FIRE');
  const st = { player: p, arches: [a1, a2], archBuffs: [] };
  const ev = [...tickArches(st, 1 / 60), ...tickArches(st, 1 / 60)];
  const granted = ev.filter(e => e.kind === 'archGranted');
  const refreshed = ev.filter(e => e.kind === 'archRefreshed');
  const buffs = st.archBuffs.filter(b => b.type === 'DOUBLE_FIRE');
  // Both arches sit under the player, so ONE tick consumes both: first grants,
  // second refreshes (the game's own no-stacking rule, arches.js :82-93).
  check('two same-type arches under the player -> both consumed, exactly ONE grant + ONE refresh event',
    st.arches.length === 0 && granted.length === 1 && refreshed.length === 1,
    { arches: st.arches.length, granted: granted.length, refreshed: refreshed.length });
  check('exactly ONE buff object exists (refresh never stacks a second)',
    buffs.length === 1, st.archBuffs);
  const dt = 1 / 60, dur = ARCH_TYPES.DOUBLE_FIRE.duration;
  // refresh sets t to FULL duration, then the same tick's timer pass decays it;
  // after 2 ticks: t = dur - 2*dt — never 2*dur (which stacking would give).
  check('the buff timer is duration minus decay, NEVER 2x duration',
    buffs.length === 1 && Math.abs(buffs[0].t - (dur - 2 * dt)) < 1e-9 && buffs[0].t < dur,
    { t: buffs[0] && buffs[0].t, dur });
  check('the refresh event itself carries the FULL duration',
    refreshed.length === 1 && refreshed[0].duration === dur, refreshed[0]);
}

// ---- 4. EXACT multipliers at 100% uptime ----
{
  const m = expectedMods({ DOUBLE_FIRE: 1 });
  check('DOUBLE_FIRE at 100% uptime gives EXACTLY x2 rate', m.rateMult === 2, m);
  const b = expectedMods({ BERSERK: 1 });
  check('BERSERK at 100% uptime gives EXACTLY x1.5 damage', b.damageMult === 1.5, b);
  check('uptime 0 is the exact identity for every field',
    JSON.stringify(expectedMods({})) === JSON.stringify({ rateMult: 1, pickupMult: 1, damageMult: 1, speedMult: 1 }));
  // 100% uptime of the fold must equal the game's own combination
  const fold = expectedMods({ DOUBLE_FIRE: 1, BERSERK: 1 });
  const game = combineMods(['DOUBLE_FIRE', 'BERSERK']);
  check('the linear fold at 100/100 uptime equals the game stack (rate x2, dmg x1.5, speed x0.75)',
    fold.rateMult === game.rateMult && fold.damageMult === game.damageMult && fold.speedMult === game.speedMult,
    { fold, game });
}

// ---- 5. the dps delta scales LINEARLY with measured uptime ----
{
  const P = pooledMeasured();
  const base = archDpsMult(P.meanUptimeByType);
  const half = archDpsMult(Object.fromEntries(Object.entries(P.meanUptimeByType).map(([t, u]) => [t, u / 2])));
  const dbl = archDpsMult(Object.fromEntries(Object.entries(P.meanUptimeByType).map(([t, u]) => [t, u * 2])));
  check('archDpsMult at the MEASURED pooled uptime is the calibrated x1.0268 (drift-locked)',
    Math.abs(base - 1.02675) < 5e-5, base);
  check('dps delta scales linearly: D(2u) = 2 x D(u) and D(u/2) = D(u)/2',
    Math.abs((dbl - 1) - 2 * (base - 1)) < 1e-9 && Math.abs((half - 1) - (base - 1) / 2) < 1e-9,
    { base, half, dbl });
  check('D(0) = exactly 1 (the pre-W7a model)', archDpsMult({}) === 1);
}

// ---- 6. ARCH.ACTIVATE_R is READ, never hardcoded in the model ----
{
  const src = readFileSync(new URL('../tools/arch_model.mjs', import.meta.url), 'utf8');
  check('the model source never hardcodes the radius value (no ACTIVATE_R literal)',
    !/(ACTIVATE_R|activateR)\s*[:=]\s*26\b/.test(src));
  const before = ACTIVATE_R();
  ARCH.ACTIVATE_R = 31;         // drift the GAME constant; the model must follow
  const followed = ACTIVATE_R() === 31;
  ARCH.ACTIVATE_R = before;     // restore
  check('ACTIVATE_R() follows a live mutation of ARCH.ACTIVATE_R (a read, not a copy)', followed && ACTIVATE_R() === 26);
}

// ---- 7. the measured block is internally consistent + recomputable -----------
{
  const P = pooledMeasured();
  const st = Object.values(MEASURED_ARCH.stages);
  const runs = st.reduce((s, x) => s + x.runs, 0);
  check('pooled n is the sum of stage runs (16: fresh 8 + partial 8)',
    P.runs === 16 && runs === 16, P.runs);
  check('pooled grantsByType matches the stage sums (BERSERK 1, SHIELD 2, rest 0)',
    P.grantsByType.BERSERK === 1 && P.grantsByType.SHIELD === 2
    && P.grantsByType.DOUBLE_FIRE === 0 && P.grantsByType.MAGNET === 0 && P.grantsByType.SWIFT === 0,
    P.grantsByType);
  const expectBer = st.reduce((s, x) => s + (x.meanUptimeByType.BERSERK || 0) * x.runs, 0) / runs;
  check('pooled meanUptime is the run-weighted mean of the stages',
    Math.abs(P.meanUptimeByType.BERSERK - expectBer) < 1e-9, { pooled: P.meanUptimeByType.BERSERK, expectBer });
  check('DOUBLE_FIRE was NEVER granted in the measured cohort (rate term is an honest 1.0)',
    P.grantsByType.DOUBLE_FIRE === 0 && P.meanUptimeByType.DOUBLE_FIRE === 0);
  check('maxed is explicitly UNMEASURED (never invented)', MEASURED_ARCH.maxed.runs === 0 && /UNMEASURED/.test(MEASURED_ARCH.maxed.note));
  check('shield absorbs/wave at the measured rate: 0.125 grants/run x 3 / 15 waves = 0.025',
    Math.abs(shieldAbsorbsPerWave(P.grantsByType.SHIELD / P.runs) - 0.025) < 1e-9);
  // recomputeFromLogs over a synthetic log pair (fresh_ + partial_ naming)
  const dir = join(tmpdir(), 'w7a_arch_model_test');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'fresh_9001.log'),
    '# run_curve --run stage=fresh seed=9001\n'
    + 'ARCHES run=1/1 stage=fresh time=10s spawned=2 grants={"BERSERK":1} refreshes={} seconds={"BERSERK":5} uptime={"BERSERK":0.5}\n'
    + 'REC ' + JSON.stringify({ stage: 'fresh', seed: 9001, time: 10, wave: 1, arches: { spawned: 2, grants: { BERSERK: 1 }, refreshes: {}, seconds: { BERSERK: 5 }, uptime: { BERSERK: 0.5 } } }) + '\n');
  writeFileSync(join(dir, 'partial_9001.log'),
    'REC ' + JSON.stringify({ stage: 'partial', seed: 9001, time: 40, wave: 2, arches: { spawned: 1, grants: { SHIELD: 2 }, refreshes: { SHIELD: 1 }, seconds: { SHIELD: 60 }, uptime: { SHIELD: 1.5 } } }) + '\n');
  const R = recomputeFromLogs([join(dir, 'fresh_9001.log'), join(dir, 'partial_9001.log')]);
  check('recomputeFromLogs aggregates REC arch counters per stage (grants/seconds/uptime)',
    R.fresh.runs === 1 && R.fresh.grantsByType.BERSERK === 1 && R.fresh.meanUptimeByType.BERSERK === 0.5
    && R.partial.grantsByType.SHIELD === 2 && R.partial.meanGrantedSecByType.SHIELD === 30
    && R.partial.meanUptimeByType.SHIELD === 1.5, R);
  rmSync(dir, { recursive: true, force: true });
}

// ---- 8. the spawn model mirrors spawnWaveArches ------------------------------
{
  let s = 424242 >>> 0;         // the sim's own mulberry32, seeded
  const rng = () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const px = 37, py = -11;
  const NW = 4000;
  let total = 0;
  const byType = {};
  let inBand = true;
  for (let w = 0; w < NW; w++) {
    const spawned = spawnWaveArchesModel(rng, px, py, []);
    total += spawned.length;
    for (const a of spawned) {
      byType[a.type] = (byType[a.type] || 0) + 1;
      const d = Math.hypot(a.x - px, a.y - py);
      if (d < 120 - 1e-6 || d > 380 + 1e-6) inBand = false;
    }
  }
  const mean = total / NW;
  check(`spawn model: mean arches/wave over ${NW} waves is the live 1.5 (1+0.5)`, mean > 1.45 && mean < 1.55, mean);
  check('every spawned arch lands in the live 120-380px band around the player', inBand);
  check('type mix covers all five types roughly uniformly (each >= 15% of spawns)',
    Object.keys(byType).length === 5 && TYPE_IDS.every(t => byType[t] / total > 0.15), byType);
  check('the game-side trigger radius is the live ARCH.ACTIVATE_R (26)', ARCH.ACTIVATE_R === 26 && ACTIVATE_R() === ARCH.ACTIVATE_R);
  check('wave structure sanity: LADDER.WAVES x WAVE_SECONDS = RUN.LIMIT (the absorb divisor)',
    C.LADDER.WAVES * C.LADDER.WAVE_SECONDS === C.RUN.LIMIT, { waves: C.LADDER.WAVES });
}

console.log('---');
console.log(fail === 0 ? `TEST ARCH MODEL: ALL CHECKS PASSED (${pass})` : `TEST ARCH MODEL: FAIL (${fail} of ${pass + fail})`);
process.exit(fail === 0 ? 0 : 1);
