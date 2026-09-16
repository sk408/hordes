// HORDES — tools/arch_model.mjs — W7a SLICE 1: THE ARCH-BUFF MODEL.
//
// A PURE, IMPORTABLE model of the game's arch system, DERIVED from the game at
// import time (`import { ARCH_TYPES, ARCH, spawnArch, activeArchMods } from
// '../src/arches.js'`) so the table can never drift. It never re-declares a
// mod value, a duration, an absorb count or the trigger radius — every one of
// those is read through the live exports, and test/test_arch_model.mjs locks
// that against the game's own code.
//
// WHAT IT MODELS:
//   1. The per-wave SPAWN model, mirroring main.js spawnWaveArches byte for
//      byte in shape: 1-2 arches per wave (2 with p=0.5), uniform angle,
//      120-380 px from the player, type uniform over TYPE_IDS order — built by
//      CALLING the game's own spawnArch(rng, x, y), never a copy of it.
//   2. The GRANT/UPTAKE model with MEASURED parameters (MEASURED_ARCH below):
//      grants per run by type, mean granted seconds per grant, and the
//      time-weighted fraction of a run under each buff. Measured by the
//      ADDITIVE counters in tools/real_loop.mjs through the one-run seam
//      `node tools/run_curve.mjs --run <stage> --seed <s> --out <log>` (see
//      PROVENANCE). `--recompute <logs...>` re-derives the block from raw REC
//      lines and refuses to drift from it.
//   3. The resulting dps multipliers (rateMult from DOUBLE_FIRE uptime,
//      damageMult from BERSERK uptime) applied to a run's dps index, and the
//      SHIELD absorb term (absorbs per wave = measured SHIELD grants per run
//      x live shieldHits / LADDER.WAVES).
//
// THE HONESTY BLOCK — what this model does NOT claim (binding):
//   * It does NOT model the walk path or the positioning cost of detouring to
//     an arch. Uptime is measured, not derived from geometry.
//   * It does NOT model the AUTO pilot's arch-blindness beyond the measured
//     uptime: the pilot is chest/arch/portal-BLIND by design (config.js :564),
//     so the measured collection rate IS the honest parameter. It is a FINDING
//     that a blind pilot collects ~19% of spawned arches, not a defect in the
//     model, and this model must never assume optimal collection.
//   * It does NOT model buff OVERLAP. Different arch types stack concurrently
//     in the game (activeArchMods multiplies them); the measured uptimes never
//     overlapped (3 grants in 16 runs), so the time-weighted linear fold
//     `1 + (mult - 1) * uptime` is exact on the measured data and would
//     UNDER-count overlap if overlap ever became common — stated, not hidden.
//   * It does NOT extrapolate to the maxed stage: maxed runs are never re-run
//     under the owner's 60 s cap, and the frozen maxed log
//     (/tmp/g17_1b/maxed_r1.log) predates the counters, so maxed arch
//     parameters are UNMEASURED. The model says so instead of inventing them.
//   * Granted seconds are CENSORED by run death (the buff outlives the run):
//     mean granted seconds per grant is a LOWER bound on the table duration,
//     never a claim about the duration (which is read from ARCH_TYPES).
//
// Run: node tools/arch_model.mjs [--recompute <log> ...]
import { ARCH_TYPES, ARCH, spawnArch, activeArchMods } from '../src/arches.js';
import { CONFIG as C } from '../src/config.js';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';

export { ARCH_TYPES };   // re-export the LIVE table — consumers never re-declare it

export const TYPE_IDS = Object.keys(ARCH_TYPES);
export const ACTIVATE_R = () => ARCH.ACTIVATE_R;   // READ, never hardcoded here

// ---- 1. the per-wave spawn model (mirrors main.js spawnWaveArches) ---------
// Same shape, same order of rng draws, same constants as the game side
// (main.js :1061): n = 1 + (rng() < 0.5), angle uniform, d = 120 + rng()*260,
// type uniform over TYPE_IDS via the game's own spawnArch.
export function spawnWaveArchesModel(rng, px, py, out = []) {
  const n = 1 + (rng() < 0.5 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2;
    const d = 120 + rng() * 260;
    out.push(spawnArch(rng, px + Math.cos(a) * d, py + Math.sin(a) * d));
  }
  return out;
}

// ---- 2. the MEASURED grant/uptime parameters --------------------------------
// PROVENANCE: 2026-09-16, tree @ 1fda37d+dirty(tools only). One run per
// process through the existing seam, seeds 1337..1344 per stage, logs under
// /tmp/w7a_arch/ (fresh_<seed>.log, partial_<seed>.log), each carrying ONE
// REC line with the real_loop.mjs additive arch counters. The maxed stage is
// deliberately absent (60 s cap; the frozen maxed log predates the counters).
export const MEASURED_ARCH = {
  provenance: 'run_curve --run {fresh,partial} seeds 1337-1344 -> /tmp/w7a_arch/*.log (2026-09-16, 16 runs)',
  stages: {
    fresh: {
      runs: 8, spawnedPerRun: 1.5, grantRuns: 1, timeMeanS: 13.375,
      grantsByType: { DOUBLE_FIRE: 0, MAGNET: 0, SHIELD: 0, BERSERK: 1, SWIFT: 0 },
      meanGrantedSecByType: { BERSERK: 9.42 },
      meanUptimeByType: { DOUBLE_FIRE: 0, MAGNET: 0, SHIELD: 0, BERSERK: 0.107, SWIFT: 0 },
    },
    partial: {
      runs: 8, spawnedPerRun: 1.5, grantRuns: 2, timeMeanS: 28.75,
      grantsByType: { DOUBLE_FIRE: 0, MAGNET: 0, SHIELD: 2, BERSERK: 0, SWIFT: 0 },
      meanGrantedSecByType: { SHIELD: 28.64 },
      meanUptimeByType: { DOUBLE_FIRE: 0, MAGNET: 0, SHIELD: 0.2085, BERSERK: 0, SWIFT: 0 },
    },
  },
  maxed: { runs: 0, note: 'UNMEASURED — maxed is never re-run under the 60s cap; /tmp/g17_1b/maxed_r1.log predates the counters' },
};

// The stage the analytic sims should calibrate to (pooled fresh+partial, the
// only stages with measured arch counters). n=16.
export function pooledMeasured() {
  const st = [MEASURED_ARCH.stages.fresh, MEASURED_ARCH.stages.partial];
  const runs = st.reduce((s, x) => s + x.runs, 0);
  const up = {}, gr = {};
  for (const t of TYPE_IDS) {
    up[t] = st.reduce((s, x) => s + (x.meanUptimeByType[t] || 0) * x.runs, 0) / runs;
    gr[t] = st.reduce((s, x) => s + (x.grantsByType[t] || 0), 0);
  }
  return {
    runs,
    spawnedPerRun: st.reduce((s, x) => s + x.spawnedPerRun * x.runs, 0) / runs,
    grantRuns: st.reduce((s, x) => s + x.grantRuns, 0),
    grantsByType: gr,
    meanUptimeByType: up,
  };
}

// ---- 3. the resulting mods / dps / shield terms -----------------------------
// Time-weighted fold of the LIVE table: for uptime u of type T, a mult field
// contributes 1 + (mult - 1) * u (exact for non-overlapping buffs — see the
// honesty block). Combination DELEGATES to the game's activeArchMods on a
// synthetic buff state wherever an exact active-set product is needed, so the
// multiply/sum semantics are the game's, not a reimplementation.
export function expectedMods(uptimeByType) {
  const out = { rateMult: 1, pickupMult: 1, damageMult: 1, speedMult: 1 };
  for (const t of TYPE_IDS) {
    const u = Math.max(0, Math.min(1, uptimeByType[t] || 0));
    if (u === 0) continue;
    for (const [k, v] of Object.entries(ARCH_TYPES[t].mods)) out[k] = 1 + (v - 1) * u;
  }
  return out;
}
/** Exact active-set combination for a set of live buffs — the GAME's own
 *  activeArchMods() called on a synthetic state (never a second copy). */
export function combineMods(buffTypes) {
  return activeArchMods({ archBuffs: buffTypes.map(type => ({ type, t: 1 })) });
}
/** The dps multiplier a run's kill-gate power index carries, given measured
 *  uptimes: fire-rate term (DOUBLE_FIRE rateMult) x damage term (BERSERK
 *  damageMult), each folded linearly by its uptime, then combined exactly as
 *  the game combines concurrent buffs. */
export function archDpsMult(uptimeByType) {
  const rateU = uptimeByType.DOUBLE_FIRE || 0;
  const dmgU = uptimeByType.BERSERK || 0;
  const rate = 1 + (ARCH_TYPES.DOUBLE_FIRE.mods.rateMult - 1) * rateU;
  const dmg = 1 + (ARCH_TYPES.BERSERK.mods.damageMult - 1) * dmgU;
  return rate * dmg;
}
/** SHIELD absorbs per wave at a measured grants-per-run rate: grants x the
 *  LIVE shieldHits (3), spread over the ladder's WAVES. Expected value of a
 *  discrete absorb stream — an honest small term, never inflated. */
export function shieldAbsorbsPerWave(grantsPerRunShield) {
  return grantsPerRunShield * (ARCH_TYPES.SHIELD.shieldHits || 0) / C.LADDER.WAVES;
}

// ---- --recompute: re-derive MEASURED_ARCH from raw REC logs ------------------
export function recomputeFromLogs(files) {
  const agg = {};
  for (const f of files) {
    const stage = f.split('/').pop().split('_')[0];
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      if (!line.startsWith('REC ')) continue;
      const r = JSON.parse(line.slice(4));
      const a = r.arches || {};
      const A = agg[stage] = agg[stage]
        || { runs: 0, spawned: 0, grantRuns: 0, time: 0, grants: {}, seconds: {}, uptime: {} };
      A.runs++; A.spawned += a.spawned || 0; A.time += r.time;
      if (Object.keys(a.grants || {}).length) A.grantRuns++;
      for (const [t, n] of Object.entries(a.grants || {})) A.grants[t] = (A.grants[t] || 0) + n;
      for (const [t, s] of Object.entries(a.seconds || {})) A.seconds[t] = (A.seconds[t] || 0) + s;
      for (const [t, u] of Object.entries(a.uptime || {})) A.uptime[t] = (A.uptime[t] || 0) + u;
    }
  }
  const out = {};
  for (const [stage, A] of Object.entries(agg)) {
    out[stage] = {
      runs: A.runs,
      spawnedPerRun: +(A.spawned / A.runs).toFixed(3),
      grantRuns: A.grantRuns,
      timeMeanS: +(A.time / A.runs).toFixed(3),
      grantsByType: Object.fromEntries(TYPE_IDS.map(t => [t, A.grants[t] || 0])),
      meanGrantedSecByType: Object.fromEntries(TYPE_IDS.filter(t => A.grants[t]).map(t => [t, +(A.seconds[t] / A.grants[t]).toFixed(2)])),
      meanUptimeByType: Object.fromEntries(TYPE_IDS.map(t => [t, +((A.uptime[t] || 0) / A.runs).toFixed(4)])),
    };
  }
  return out;
}

// ---- standalone print --------------------------------------------------------
function printModel() {
  const P = pooledMeasured();
  console.log('HORDES ARCH MODEL (W7a slice 1) — table DERIVED from src/arches.js at import time');
  console.log(`trigger radius ARCH.ACTIVATE_R = ${ARCH.ACTIVATE_R} (read, not hardcoded)`);
  console.log('\ntypes (live ARCH_TYPES):');
  for (const t of TYPE_IDS) {
    const d = ARCH_TYPES[t];
    console.log(`  ${t.padEnd(12)} ${d.name.padEnd(16)} duration=${String(d.duration).padStart(3)}s ` +
      `mods=${JSON.stringify(d.mods)}${d.shieldHits ? ` shieldHits=${d.shieldHits}` : ''}`);
  }
  console.log(`\nspawn model (mirrors main.js spawnWaveArches): 1-2 arches/wave (p=0.5), ` +
    `120-380px from player, type uniform over [${TYPE_IDS.join(', ')}]`);
  console.log(`MEASURED (${MEASURED_ARCH.provenance}):`);
  for (const [stage, A] of Object.entries(MEASURED_ARCH.stages)) {
    console.log(`  ${stage}: n=${A.runs} spawned/run=${A.spawnedPerRun} grantRuns=${A.grantRuns} ` +
      `timeMean=${A.timeMeanS}s grantsByType=${JSON.stringify(A.grantsByType)} ` +
      `meanGrantedSec=${JSON.stringify(A.meanGrantedSecByType)} meanUptime=${JSON.stringify(A.meanUptimeByType)}`);
  }
  console.log(`  maxed: ${MEASURED_ARCH.maxed.note}`);
  const mods = expectedMods(P.meanUptimeByType);
  const dps = archDpsMult(P.meanUptimeByType);
  console.log(`\npooled (n=${P.runs}): grantsByType=${JSON.stringify(P.grantsByType)} ` +
    `meanUptime=${JSON.stringify(P.meanUptimeByType)}`);
  console.log(`resulting mods at measured uptime: ${JSON.stringify(mods)}`);
  console.log(`arch dps mult (rate x damage, time-weighted): x${dps.toFixed(4)}`);
  console.log(`shield absorbs/wave at measured grants: ${shieldAbsorbsPerWave(P.grantsByType.SHIELD / P.runs).toFixed(4)}`);
  console.log('\nHONESTY: no walk path / no positioning cost / no overlap fold / pilot-blindness carried' +
    '\nonly as the measured collection rate / maxed UNMEASURED / granted seconds censored by death.');
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const idx = process.argv.indexOf('--recompute');
  if (idx !== -1) {
    const files = process.argv.slice(idx + 1).filter(a => !a.startsWith('--') && a.endsWith('.log'));
    const recomputed = recomputeFromLogs(files);
    const problems = [];
    for (const [stage, A] of Object.entries(recomputed)) {
      const M = MEASURED_ARCH.stages[stage];
      if (!M) { problems.push(`stage ${stage} not in MEASURED_ARCH`); continue; }
      if (A.runs !== M.runs) problems.push(`${stage}.runs ${A.runs} != ${M.runs}`);
      if (A.grantRuns !== M.grantRuns) problems.push(`${stage}.grantRuns ${A.grantRuns} != ${M.grantRuns}`);
      for (const t of TYPE_IDS) {
        if ((A.grantsByType[t] || 0) !== (M.grantsByType[t] || 0)) problems.push(`${stage}.grantsByType.${t}`);
        if (Math.abs((A.meanUptimeByType[t] || 0) - (M.meanUptimeByType[t] || 0)) > 5e-4) problems.push(`${stage}.uptime.${t} ${A.meanUptimeByType[t]} != ${M.meanUptimeByType[t]}`);
      }
    }
    for (const s of Object.keys(MEASURED_ARCH.stages)) {
      if (!recomputed[s]) problems.push(`no logs found for stage ${s}`);
    }
    console.log('RECOMPUTE from raw logs:', JSON.stringify(recomputed, null, 1));
    console.log(problems.length ? 'RECOMPUTE DRIFT: ' + problems.join('; ') : 'RECOMPUTE matches MEASURED_ARCH (no drift).');
    process.exit(problems.length ? 1 : 0);
  }
  printModel();
}
