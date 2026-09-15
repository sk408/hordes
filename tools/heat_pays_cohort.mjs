// HORDES - tools/heat_pays_cohort.mjs (G24 slice 1: the MEASUREMENT).
//
// A seeded cohort that plays REAL frame loops (the same test/_harness.mjs the
// suite uses - the REAL src/main.js loop, real spawns, real drafts, real
// deaths) at MANUAL heat 0 / 3 / 6 with the SAME seeds, and reports per arm:
// gold/min, XP/min, kills/min, survival seconds, and foe maxHp at wave 1
// (which proves the COST is real, not decorative).
//
// Acceptance (brief :79): gold/min AND XP/min both strictly increase with
// manual heat at equal elapsed time - or an honest NULL with the reason.
//
// Economy guard (brief :83): heat-0 income must be UNCHANGED versus the
// pre-slice baseline. At manual 0 the slice's read is heatXpMult(0) = 1, i.e.
// exactly the pre-slice behaviour, so the guard is an A/B on the SAME seed at
// arm 0 with HEAT_CURVES.XP patched to 0 in memory (the pre-slice read)
// versus live: every number must be IDENTICAL.
//
// Every (arm, seed) runs in its OWN process (the orchestrator re-spawns this
// file with --run) - the main.js module state is process-global and profile
// progression (purchased upgrades, unlocked elites) warms during play, so a
// factory profile per run is the only way the arms stay comparable.
//
// Verdicts are computed by the orchestrator from RAW per-seed numbers; n and
// the seeds are printed with them. No assertion is weakened by measuring.
// Run: node tools/heat_pays_cohort.mjs
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SEEDS = [101, 202, 303];
const ARMS = [0, 3, 6];
const TARGET_PLAY_S = 90;      // equal elapsed (playing) seconds per seed
const FRAMES = Math.round(TARGET_PLAY_S * 60);
const FRAME_MS = 1000 / 60;

if (process.argv[2] === '--run') {
  const manual = Number(process.argv[3]);
  const xpCurve = Number(process.argv[4]);   // live 0.12; the guard's B leg patches 0
  const seed = Number(process.argv[5]);
  console.log(JSON.stringify(await runOnce(manual, xpCurve, seed)));
} else {
  const spawn = (m, xp, seed) => JSON.parse(execFileSync(process.execPath,
    [fileURLToPath(import.meta.url), '--run', String(m), String(xp), String(seed)],
    { maxBuffer: 1 << 24 }));
  const arms = {};
  for (const m of ARMS) arms[m] = SEEDS.map((s) => spawn(m, 0.12, s));
  // Economy guard A/B at arm 0, seed 101: live curve vs pre-slice (curve 0).
  const gA = arms[0][0];
  const gB = spawn(0, 0, 101);
  report(arms, gA, gB);
}

// ---------- one run: REAL frame loops on the REAL game ----------
async function runOnce(manual, xpCurve, seed) {
  const { boot } = await import('../test/_harness.mjs');
  const { HEAT_CURVES, addHeat, manualPushes } = await import('../src/heat.js');
  HEAT_CURVES.XP = xpCurve;    // in-memory patch; guard B replays pre-slice

  const lcg = () => {
    let s = seed >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  };

  const { T, state, elements, key, pump } = await boot();
  T.banners.suppressAll();
  Math.random = lcg();               // seeded stream, installed before startRun
  T.startRun();                      // the real start (menu -> playing)

  // Measurement accumulators (restart-swallowing: run resets never un-count).
  let gold = 0, xp = 0, kills = 0, playS = 0, firstDeathS = null, restarts = 0;
  let wave1MaxHp = null;
  let lastW = 0, lastKills = 0;
  let pRef = null, curXp = 0;
  const installXpTrap = () => {
    // Positive-delta trap on p.xp: grants count; the level-up subtraction
    // (p.xp -= p.xpNext) and the fresh-run reset do not.
    curXp = state.player.xp;
    Object.defineProperty(state.player, 'xp', {
      configurable: true,
      get: () => curXp,
      set: (v) => { if (v > curXp) xp += v - curXp; curXp = v; },
    });
    pRef = state.player;
    // FIXTURE BUFF (owner-approved precedent, smoke.mjs:326 "the test
    // character might need a buff, just for that test scenario"): the owner's
    // enemy buff ends an unbuffed fresh run in ~35s with a couple of kills -
    // far too little income to measure a payout curve on. Same buff as the
    // suite's own probe character, re-applied per fresh run, IDENTICAL for
    // every arm, so the comparison between arms is untouched. xpMult is left
    // alone: the heat XP channel must ride the real multiplier stack.
    state.player.stats.maxHp *= 80;
    state.player.hp = state.player.stats.maxHp;
    state.player.stats.damage *= 60;
  };

  for (let f = 0; f < FRAMES; f++) {
    if (state.player !== pRef) installXpTrap();
    // The arm's dial level, (re)pushed through the real addHeat seam: the
    // ledger is run-scoped, so every fresh run re-arms to the arm level.
    while (manualPushes(state) < manual) addHeat(state, 'MANUAL_PUSH');

    const modeBefore = state.mode;
    pump(1);
    playS += (modeBefore === 'playing' ? FRAME_MS / 1000 : 0);

    // Wave-1 foe maxHp: the first enemy of the run (the cost-is-real proof).
    if (wave1MaxHp === null && state.wave.num === 1 && state.enemies.length) {
      wave1MaxHp = state.enemies[0].maxHp;
    }

    // Overlays: the deterministic pilot policy (identical for every arm).
    if (state.mode === 'draft') {
      const c0 = elements['ov-cards'].children[0];
      if (c0) c0.click();
    } else if (state.mode === 'evolve') {
      const kids = elements['ov-cards'].children;
      if (kids.length) kids[kids.length - 1].click();   // NOT NOW
    } else if (state.mode === 'dead') {
      if (firstDeathS === null) firstDeathS = playS;
      restarts++;
      key('keydown', { key: 'r' });
    } else if (state.mode === 'intermission') {
      key('keydown', { key: 'c' });
    } else if (state.mode === 'portal-cine') {
      key('keydown', { key: 'x' });
    }

    // Income / kill accumulators (positive deltas only: spends, the
    // purse->bank settle move, level-ups and run resets never distort them).
    const prof = T.getProfile();
    const w = (prof.gold | 0) + (prof.runPurse | 0);
    if (w > lastW) gold += w - lastW;
    lastW = w;
    const k = state.player.kills | 0;
    if (k < lastKills) lastKills = k;      // fresh run: the counter restarted
    if (k > lastKills) { kills += k - lastKills; lastKills = k; }
  }

  const mins = playS / 60;
  return {
    seed, manual, playS: +playS.toFixed(2), restarts,
    firstDeathS: firstDeathS === null ? null : +firstDeathS.toFixed(1),
    wave1MaxHp,
    gold: Math.round(gold), xp: Math.round(xp), kills,
    goldPerMin: +(gold / mins).toFixed(1),
    xpPerMin: +(xp / mins).toFixed(1),
    killsPerMin: +(kills / mins).toFixed(1),
  };
}

// ---------- the orchestrator's report ----------
function report(arms, gA, gB) {
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  console.log(`G24 HEAT PAYS COHORT - REAL frame loops via test/_harness.mjs, ` +
    `${TARGET_PLAY_S}s playing time per run, n=${SEEDS.length} per arm, seeds=[${SEEDS.join(', ')}]`);
  console.log('policy: AUTO_ALL pilot, draft=card 1, evolve=NOT NOW, death=RETRY, ' +
    'intermission=CONTINUE; dial (re)pushed to the arm level at every run start via the real addHeat seam\n');

  const rows = {};
  for (const m of ARMS) {
    rows[m] = ['goldPerMin', 'xpPerMin', 'killsPerMin'].map((k) => mean(arms[m].map((s) => s[k])));
    for (const s of arms[m]) {
      console.log(`  manual ${m} seed ${s.seed}: gold/min ${s.goldPerMin} xp/min ${s.xpPerMin} ` +
        `kills/min ${s.killsPerMin} | playS ${s.playS} restarts ${s.restarts} ` +
        `firstDeath ${s.firstDeathS === null ? 'none' : s.firstDeathS + 's'} wave1MaxHp ${s.wave1MaxHp}`);
    }
    console.log(`  manual ${m} MEAN: gold/min ${rows[m][0].toFixed(1)} xp/min ${rows[m][1].toFixed(1)} ` +
      `kills/min ${rows[m][2].toFixed(1)} wave1MaxHp ${arms[m][0].wave1MaxHp}\n`);
  }

  // Acceptance: BOTH payout channels strictly increase with manual heat.
  const g03 = rows[3][0] > rows[0][0], g36 = rows[6][0] > rows[3][0];
  const x03 = rows[3][1] > rows[0][1], x36 = rows[6][1] > rows[3][1];
  console.log(`ACCEPTANCE gold/min strictly rises 0<3<6: ${g03 && g36 ? 'PASS' : 'FAIL'} ` +
    `(${rows[0][0].toFixed(1)} -> ${rows[3][0].toFixed(1)} -> ${rows[6][0].toFixed(1)})`);
  console.log(`ACCEPTANCE xp/min strictly rises 0<3<6: ${x03 && x36 ? 'PASS' : 'FAIL'} ` +
    `(${rows[0][1].toFixed(1)} -> ${rows[3][1].toFixed(1)} -> ${rows[6][1].toFixed(1)})`);
  if (!(g03 && g36 && x03 && x36)) {
    console.log('  NULL REASON: see the E1 finding - gold pays at settlement only ' +
      '(the per-kill purse credit carries NO heat term by owner directive), so gold/min ' +
      'moves only through the faster spawn clock and the settled award x goldMult.');
  }

  // Economy guard: arm 0 / seed 101 live vs curve-patched-to-0, byte-identical.
  const a = JSON.stringify(gA), b = JSON.stringify(gB);
  console.log(`ECONOMY GUARD heat-0 income unchanged vs pre-slice (XP curve 0, seed 101): ` +
    `${a === b ? 'PASS - identical numbers on the identical seed' : 'FAIL'}`);
  if (a !== b) {
    console.log('  live:    ' + a);
    console.log('  patched: ' + b);
  }
}
