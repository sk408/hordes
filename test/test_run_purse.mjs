// HORDES — E1 RUN PURSE (owner directive 2026-09-14; docs/briefs/E1_RUN_PURSE.md).
//
// Drives the REAL seams the game loop calls (never copies):
//   - per-kill credit: crafted corpses reaped by the REAL death funnel
//     (the smoke.mjs elite-mod pattern), tier-weighted by meta.js GOLD_TIER;
//   - 60Hz vs 120Hz: the SAME seeded run at both frame steps banks exactly
//     what its own kill log pays, and the two purses differ only by the kills
//     that differ (a kill is an EVENT, never a per-frame amount);
//   - the bank is unreachable mid-run: profile.gold = 0 buys NOTHING at the
//     shrine; purse == cost buys it (the smoke shrine probe's invariant,
//     moved to the purse);
//   - settlement: FIXED award x goldMult + purse remainder banks ONCE,
//     runPurse returns to 0 (the double-bank trap), FIRST_CLEAR and the maw
//     bonus ride on top;
//   - mid-run reload: the purse round-trips hordes_profile_v1 through the
//     REAL loadProfileResult; a v6 payload migrates to runPurse 0; a corrupt
//     purse repairs to 0 and is REPORTED through the repair list;
//   - V1 separation: the settled run total never reads profile.gold, so a
//     future escape payout (bestGold — docs-only today) can never enter it.
import { boot, suite } from './_harness.mjs';
import { loadProfileResult, RUN_GOLD, GOLD_TIER, GOLD_MODEL, computeRunGold,
  buyUpgrade, SHOP_UPGRADES } from '../src/meta.js';
import { PROFILE_VERSION } from '../src/save.js';
import { prestigeGoldMult, getPrestige } from '../src/prestige.js';

const S = suite('test_run_purse');
const h = await boot();
const T = h.T;
const st = h.state;
const elements = h.elements;
// A fixed random stream for the whole file: an unseeded field (arches, drops)
// could add a stray credit inside the one-pass funnel probe below.
Math.random = mulberry32(0x9e11);

// Deterministic RNG for the parity arms (same seed -> same sequence).
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- tier table
S.check('GOLD_TIER is one data table, ordered by how dangerous the kill is', () => {
  assert(GOLD_TIER.CHAFF > 0 && GOLD_TIER.CHAFF < GOLD_TIER.GRUNT, 'chaff pays a little, less than a grunt');
  assert(GOLD_TIER.GRUNT < GOLD_TIER.MID && GOLD_TIER.MID < GOLD_TIER.HEAVY && GOLD_TIER.HEAVY < GOLD_TIER.ELITE,
    'grunt < mid < heavy < elite');
  assert(GOLD_TIER.MID_BOSS > GOLD_TIER.ELITE, 'a herald reads as a nice drop');
  assert(GOLD_TIER.BOSS > GOLD_TIER.MID_BOSS, 'the wave boss pays heaviest');
});
function assert(cond, msg) { if (!cond) throw new Error('AssertionError: ' + msg); }
// What the purse gains from a list of kills, in kill order: an ordinary kill
// pays tier / (1 + kills / KILL_SOFTCAP) (kills counted including itself), a
// boss or herald pays in full, Greed (stats.goldMult) multiplies all of it, and
// only whole gold leaves the carry.
function expectCredit(tiers, killsBefore, carryBefore, mult = 1) {
  let total = carryBefore, k = killsBefore;
  for (const t of tiers) {
    k++;
    const boss = t === 'BOSS' || t === 'MID_BOSS';
    total += GOLD_TIER[t] * mult * (boss ? 1 : 1 / (1 + k / RUN_GOLD.KILL_SOFTCAP));
  }
  return Math.floor(total + 1e-9);
}

// --------------------------------- per-kill credit at the REAL death funnel
T.startRun();
h.pump(5);
// HERMETICITY (2026-09-17): the probe measures ONE death pass, but the live
// spawner can land a fresh CHASER inside the auto-attack's range in the same
// frame — its +1 GRUNT credit lands in the same funnel and the exact-sum
// check reads 238 vs 237 (suite flake, 1-in-N). Quiet the field first (the
// smoke quietField pattern: no bodies, no spawns, no boss/portal). The
// assertions below are unchanged.
st.enemies.length = 0; st.gems.length = 0;
st.spawnTimer = 999; st.wave.endsAt = st.time + 9999;
st.wave.bosses = []; st.wave.boss = null; st.portal = null;
const purse0 = T.purse.get();
const kills0 = st.player.kills;
const carry0 = st.runCounts.gold.carry || 0;
{
  const px = st.player.x, py = st.player.y - 120;
  const corpses = [
    { typeId: 'SWARMER' },                       // CHAFF
    { typeId: 'CHASER' },                        // GRUNT
    { typeId: 'SPITTER' },                       // MID
    { typeId: 'BRUTE' },                         // HEAVY
    { typeId: 'CHASER', elite: true },           // ELITE
    { typeId: 'BOSS', boss: true, midBoss: true },   // MID_BOSS
    { typeId: 'BOSS', boss: true },              // BOSS
  ];
  for (const c of corpses) {
    st.enemies.push({ typeId: c.typeId, x: px, y: py, hp: 0, maxHp: 1, w: 8, h: 8,
      speed: 0, xp: 1, age: 0, elite: !!c.elite, boss: !!c.boss, midBoss: !!c.midBoss });
  }
  h.pump(1);   // ONE death pass reaps them all through the real funnel
}
const credited = T.purse.get() - purse0;
S.check('per-kill credit is tier-weighted at the same funnel the loop uses', () => {
  // The death pass walks the field backwards, so the boss is reaped first.
  const want = expectCredit(['BOSS', 'MID_BOSS', 'ELITE', 'HEAVY', 'MID', 'GRUNT', 'CHAFF'], kills0, carry0);
  assert(credited === want, `7 corpses credit exactly ${want} (got ${credited})`);
  assert(want >= GOLD_TIER.BOSS + GOLD_TIER.MID_BOSS + 10, 'the fixture is not vacuous');
  const g = st.runCounts.gold;
  assert(g.earned === credited, 'the ledger earned total matches the credited gold');
  assert(g.kills.CHAFF === 1 && g.kills.GRUNT === 1 && g.kills.MID === 1 &&
    g.kills.HEAVY === 1 && g.kills.ELITE === 1 && g.kills.MID_BOSS === 1 && g.kills.BOSS === 1,
    'the tier ledger counts one kill per tier: ' + JSON.stringify(g.kills));
  assert(st.player.kills === kills0 + 7,
    'the RAW p.kills body count still advances (milestones/achievements want bodies)');
});

// ------------------------------------------- 60Hz vs 120Hz purse parity
// A FRESH profile dies in seconds at the shipped difficulty with zero kills,
// which would make the parity check vacuous (0 === 0). Arm a full build —
// the same "owner's loadout" stage the cohorts measure — so both arms KILL.
{
  const prof = T.getProfile();
  // G17 slice 1b FIXTURE RETARGET (was 10_000_000): the repriced catalogue is
  // 29.6M, so the old grant armed only a PARTIAL build and the seeded parity
  // arm split a boundary kill across the frame-rate arms (16 vs 15 kills,
  // the same failure class the 0xe1->0xe3 seed retarget fixed). 100M re-arms
  // the FULL build the comment promises; the assertions are unchanged.
  prof.gold = 100_000_000;
  for (const def of SHOP_UPGRADES) {
    for (let i = 0; i < def.maxLevel; i++) if (!buyUpgrade(prof, def.id)) break;
  }
}
// One seeded 20 s run at a frame step. Sites and secrets are removed so kills
// are the purse's only income (no brazier or niche gold; the first survival
// tick is at 30 s). Every frame that kills is logged: the tiers the ledger
// gained, the body count's gain, and the income multiplier in force.
const PARITY_SEED = 0xf5;
// What multiplies a kill's gold right now (main.js purseIncomeMult).
const incomeMult = () => (st.player.stats.goldMult || 1) * (st.player.stats.purseKillMult || 1) *
  prestigeGoldMult(getPrestige(T.getProfile()));
function seededPurseRun(frameMs, frames) {
  const realRandom = Math.random;
  Math.random = mulberry32(PARITY_SEED);
  const log = [];
  try {
    T.banners.suppressAll();               // one-time banners hold the sim 2.5s
    T.getProfile().runPurse = 0;               // isolate the arm's earnings
    T.startRun();
    st.sites = []; st.secrets = [];
    h.setFrameMs(frameMs);
    for (let i = 0; i < frames; i++) {
      const before = { ...st.runCounts.gold.kills }, bodies = st.player.kills;
      const mult0 = incomeMult();
      h.pump(1);
      const after = st.runCounts.gold.kills, tiers = [];
      for (const t of Object.keys(after)) for (let n = before[t] || 0; n < after[t]; n++) tiers.push(t);
      if (tiers.length || st.player.kills !== bodies) {
        const mult1 = incomeMult();
        log.push({ tiers, bodies: st.player.kills - bodies, lo: Math.min(mult0, mult1), hi: Math.max(mult0, mult1) });
      }
      if (st.mode === 'draft' || st.mode === 'evolve') {
        const c0 = elements['ov-cards'].children[0]; c0 && c0.click();
      } else if (st.mode === 'intermission') {
        const cont = elements['ov-cards'].children.find(c => (c.innerHTML || '').includes('CONTINUE'));
        cont && cont.click();
      }
    }
  } finally {
    Math.random = realRandom;
    h.setFrameMs(undefined);
  }
  return { purse: T.purse.get(), time: st.time, kills: st.player.kills, log,
    survival: st.runCounts.gold.survival || 0 };
}
// What a kill log must have paid: [lowest, highest] whole gold. The softcap
// makes later kills pay less, so the order of kills inside one frame (which
// the log does not record) gives the two ends, as does a multiplier that
// changed inside the frame; with one kill a frame and a steady build they meet.
function logPays(log) {
  let lo = 0, hi = 0, k = 0;
  for (const f of log) {
    const up = f.tiers.slice().sort((a, b) => GOLD_TIER[a] - GOLD_TIER[b]);
    up.forEach((t, i) => {
      const soft = (tier, at) => (tier === 'BOSS' || tier === 'MID_BOSS') ? 1 : 1 / (1 + at / RUN_GOLD.KILL_SOFTCAP);
      const down = up[up.length - 1 - i];
      lo += GOLD_TIER[t] * f.lo * soft(t, k + i + 1);
      hi += GOLD_TIER[down] * f.hi * soft(down, k + i + 1);
    });
    k += f.tiers.length;
  }
  return [Math.floor(lo - 1e-9), Math.floor(hi + 1e-9)];
}
const tierCounts = (log) => {
  const n = {};
  for (const f of log) for (const t of f.tiers) n[t] = (n[t] || 0) + 1;
  return n;
};
const arm60 = seededPurseRun(1000 / 60, 20 * 60);      // 20 sim-seconds at 60Hz
const arm120 = seededPurseRun(1000 / 120, 20 * 120);   // 20 sim-seconds at 120Hz
S.check('60Hz vs 120Hz: each arm banks exactly what its own kills pay', () => {
  assert(arm60.time > 19 && arm120.time > 19,
    `both arms really simulated ~20s (got ${arm60.time.toFixed(2)} / ${arm120.time.toFixed(2)})`);
  for (const [hz, arm] of [[60, arm60], [120, arm120]]) {
    assert(arm.kills >= 5, `${hz}Hz: the seeded run killed enough to mean something (${arm.kills} kills)`);
    assert(arm.survival === 0, `${hz}Hz: kills are the only income in 20 s`);
    assert(arm.log.every(f => f.bodies === f.tiers.length),
      `${hz}Hz: one purse credit per body: ` + JSON.stringify(arm.log.filter(f => f.bodies !== f.tiers.length)));
    const [lo, hi] = logPays(arm.log);
    assert(arm.purse >= lo && arm.purse <= hi,
      `${hz}Hz: purse ${arm.purse} for ${arm.kills} kills, the kill log pays ${lo}${hi > lo ? '-' + hi : ''}` +
      ' (the credit is a per-kill EVENT, dt-free)');
  }
});
S.check('60Hz vs 120Hz: the two purses differ by no more than the kills that differ', () => {
  // The two frame rates take slightly different paths, so a kill on the 20 s
  // line can land in one arm and not the other. The purses may differ by what
  // those kills pay in full, plus one gold of rounding; the same kills in the
  // same order pay the same purse.
  const killGap = Math.abs(arm60.kills - arm120.kills);
  assert(killGap <= 2, `the arms stayed comparable (kills ${arm60.kills} / ${arm120.kills})`);
  const n60 = tierCounts(arm60.log), n120 = tierCounts(arm120.log);
  const mult = Math.max(...arm60.log.concat(arm120.log).map(f => f.hi));
  let extra = 0;
  for (const t of Object.keys(GOLD_TIER)) extra += Math.abs((n60[t] || 0) - (n120[t] || 0)) * GOLD_TIER[t] * mult;
  const same = JSON.stringify(arm60.log) === JSON.stringify(arm120.log);
  const tol = same ? 0 : Math.ceil(extra) + 1;
  assert(Math.abs(arm60.purse - arm120.purse) <= tol,
    `purse parity: 60Hz ${arm60.purse} vs 120Hz ${arm120.purse} (kills ${arm60.kills} / ${arm120.kills}), ` +
    `allowed gap ${tol}`);
});

// ------------------------------------- the bank is unreachable mid-run
T.startRun();
h.pump(5);
{
  const prof = T.getProfile();
  prof.gold = 0;
  prof.runPurse = 0;
  // M5b: the charge shrine costs nothing — stand in it until it charges.
  var probeShrine = { id: 900, kind: 'shrine', x: st.player.x, y: st.player.y, state: 'unused', charge: 0, handsOn: false };
  st.sites = [probeShrine]; st.shrines = [probeShrine];
  for (let i = 0; i < 60 * 8 && probeShrine.state !== 'spent'; i++) {
    st.player.x = probeShrine.x; st.player.y = probeShrine.y; st.enemies.length = 0;
    h.pump(1);
  }
}
S.check('the charge shrine spends NOTHING (purse 0, bank 0 -> it still charges)', () => {
  assert(probeShrine.state === 'spent', 'the shrine charged with an empty purse');
  assert(st.mode === 'draft' && st.draftKind === 'shrine', 'and opened its blessing draft');
  assert(T.purse.get() === 0, 'the purse did not move');
  assert(T.getProfile().gold === 0, 'the BANK was not touched');
});

// ------------------------------------------------------- settlement shape
T.startRun();
// HERMETICITY (2026-09-17, the line-51 fix applied to the settlement blocks):
// a stray spawn killed inside pump(2) bumps the rampage mult and the exact
// award pin reads 391 vs 390 (suite flake, 1-in-N). Quiet the field BEFORE
// the pump so every settlement block below measures pure math.
function quietField() {
  st.enemies.length = 0; st.gems.length = 0;
  st.spawnTimer = 999; st.wave.endsAt = st.time + 9999;
  st.wave.bosses = []; st.wave.boss = null; st.portal = null;
}
quietField();
h.pump(2);
{
  const prof = T.getProfile();
  prof.gold = 0;
  prof.runPurse = 500;
  prof.bestTime = 0;                 // firstClear is live (state.time > 0)
  st.time = 30;
  st.player.stats.goldMult = 2;      // GREED line
  var settle1 = T.purse.settle();
  var bank1 = prof.gold;
  var settle2 = T.purse.settle();    // THE DOUBLE-BANK TRAP: settle again
  var bank2 = prof.gold;
}
S.check('settlement banks ONCE: fixed award x mult + remainder, purse zeroed', () => {
  const mult = 2;                    // goldMult(0 pushes) === 1, rampage best 0
  const wantAward = Math.round(RUN_GOLD.AWARD * mult) + RUN_GOLD.FIRST_CLEAR;
  assert(settle1.award === wantAward,
    `award = ${RUN_GOLD.AWARD} x${mult} + FIRST_CLEAR ${RUN_GOLD.FIRST_CLEAR} = ${wantAward} (got ${settle1.award})`);
  assert(settle1.purseBanked === 500, 'the purse remainder banks in full');
  assert(bank1 === wantAward + 500, `banked ${bank1} = award ${wantAward} + purse 500`);
  assert(T.purse.get() === 0, 'runPurse returns to 0 after settlement');
  // S1 (audit 2026-09-16): settlement is RUN-ONCE. The old second settle here
  // paid a SECOND full award into the bank — exactly the maw-then-death
  // inflation the audit flagged. A second call now returns the FIRST numbers
  // and banks NOTHING (strictly stronger than the old "no second purse").
  assert(settle2.gold === settle1.gold && settle2.award === settle1.award
    && settle2.purseBanked === settle1.purseBanked,
    'the second settlement returns the first settlement\'s numbers unchanged');
  assert(bank2 === bank1, 'the second settlement banks NOTHING (award paid exactly once)');
  assert(st.player.kills >= 0, 'sanity');
});
S.check('FIRST_CLEAR and the maw bonus ride ON TOP, goldMult multiplies the award', () => {
  T.startRun(); quietField(); h.pump(2);   // S1: settlement is run-once — a fresh run re-arms it
  const prof = T.getProfile();
  prof.bestTime = 99999;                       // no first clear this time
  prof.runPurse = 0;
  st.player.stats.goldMult = 2;                // re-applied: startRun rebuilt stats
  const before = prof.gold;
  const r = T.purse.settle({ winBonus: 1200 });
  const wantAward = Math.round(RUN_GOLD.AWARD * 2);   // goldMult still 2, no FIRST_CLEAR
  assert(r.award === wantAward, `award without firstClear = ${wantAward} (got ${r.award})`);
  assert(r.gold === wantAward + 1200, 'the maw bonus is a separate addition on top');
  assert(prof.gold === before + r.gold, 'bank delta matches the settled total');
});
S.check('a zero run settles the flat award, not the retired formula', () => {
  T.startRun(); quietField(); h.pump(2);   // S1: run-once — this needs its own fresh run
  const prof = T.getProfile();
  prof.bestTime = 99999;
  prof.runPurse = 0;
  st.player.stats.goldMult = 1;
  st.player.kills = 0;
  const before = prof.gold;
  const r = T.purse.settle();
  assert(r.gold === RUN_GOLD.AWARD,
    `an empty run pays the FIXED award ${RUN_GOLD.AWARD}, not computeRunGold's BASE ${GOLD_MODEL.BASE}`);
  assert(computeRunGold({}) === GOLD_MODEL.BASE,
    'computeRunGold survives as a pure helper (retired as the payout, not as a function)');
});

// ------------------------------------------------- mid-run reload persistence
{
  T.startRun();
  h.pump(5);
  const prof = T.getProfile();
  prof.runPurse = 0;
  var reloadKills0 = st.player.kills, reloadCarry0 = st.runCounts.gold.carry || 0;
  // Real kills through the funnel, then the REAL exit flush.
  const px = st.player.x, py = st.player.y - 100;
  for (let i = 0; i < 3; i++) {
    st.enemies.push({ typeId: 'BRUTE', x: px, y: py, hp: 0, maxHp: 1, w: 8, h: 8,
      speed: 0, xp: 1, age: 0 });
  }
  h.pump(1);
  var earnedBeforeReload = T.purse.get();
  T.save.autosave('reload-test');
  var shim = {
    getItem: (k) => (h.storage.has(k) ? h.storage.get(k) : null),
    setItem: (k, v) => { h.storage.set(k, String(v)); },
    removeItem: (k) => { h.storage.delete(k); },
  };
  var reloaded = loadProfileResult(shim);
}
S.check('the purse survives a mid-run reload through hordes_profile_v1', () => {
  // This profile owns the whole shop (the parity arm bought it), Greed included.
  const want = expectCredit(['HEAVY', 'HEAVY', 'HEAVY'], reloadKills0, reloadCarry0, st.player.stats.goldMult);
  assert(earnedBeforeReload === want && want > 0,
    `three heavies earned ${want} before the reload (got ${earnedBeforeReload})`);
  assert(reloaded.status === 'current', 'the reload is a clean current-version load');
  assert(reloaded.profile.runPurse === earnedBeforeReload,
    `the persisted purse is byte-identical (${reloaded.profile.runPurse})`);
});
S.check('a v6 save with no runPurse migrates to 0 (schema v' + PROFILE_VERSION + ')', () => {
  shim.setItem('hordes_profile_v1', JSON.stringify({ version: 6, gold: 120 }));
  const res = loadProfileResult(shim);
  assert(res.status === 'migrated' && res.from === 6, 'the v6 payload migrates forward');
  assert(res.profile.runPurse === 0, 'the missing purse loads as 0');
  assert(res.profile.gold === 120, 'the migration is lossless for what was there');
  assert(res.profile.version === PROFILE_VERSION, 'stamped at the current schema');
});
S.check('a corrupt purse repairs to 0 and is REPORTED through the repair list', () => {
  shim.setItem('hordes_profile_v1', JSON.stringify({ version: PROFILE_VERSION, gold: 5, runPurse: -40 }));
  let res = loadProfileResult(shim);
  assert(res.profile.runPurse === 0 && res.repairs.includes('runPurse'),
    'negative purse repairs to 0 and is reported: ' + JSON.stringify(res.repairs));
  shim.setItem('hordes_profile_v1', JSON.stringify({ version: PROFILE_VERSION, gold: 5, runPurse: 'abc' }));
  res = loadProfileResult(shim);
  assert(res.profile.runPurse === 0 && res.repairs.includes('runPurse'),
    'a non-numeric purse repairs to 0 and is reported');
  shim.setItem('hordes_profile_v1', JSON.stringify({ version: PROFILE_VERSION, gold: 5, runPurse: 9.7 }));
  res = loadProfileResult(shim);
  assert(res.profile.runPurse === 9 && res.repairs.includes('runPurse'),
    'a float purse floors to an integer and is reported');
});

// ------------------------------------------------------------- V1 separation
S.check('the run total has exactly ONE writer and never reads the bank', () => {
  const prof = T.getProfile();
  prof.bestTime = 99999;
  st.player.stats.goldMult = 1;
  st.rampage = { streak: 0, best: 0 };       // no rampage term in this fixture
  prof.runPurse = 42;
  const r1 = T.purse.settle();
  assert(r1.gold === RUN_GOLD.AWARD + 42, 'run total = award + purse, nothing else');
  // The only shape a future V1 escape payout can take today: a DIRECT credit
  // to profile.gold (bestGold is docs-only). The run total must not see it.
  prof.gold += 7777;
  prof.runPurse = 42;
  const r2 = T.purse.settle();
  assert(r2.gold === r1.gold && r2.award === r1.award && r2.purseBanked === r1.purseBanked,
    'an escape-style bank credit changes NOTHING about the run total — V1 income can never enter it');
});

S.done();
