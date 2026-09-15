// HORDES — E1 RUN PURSE (owner directive 2026-09-14; docs/briefs/E1_RUN_PURSE.md).
//
// Drives the REAL seams the game loop calls (never copies):
//   - per-kill credit: crafted corpses reaped by the REAL death funnel
//     (the smoke.mjs elite-mod pattern), tier-weighted by meta.js GOLD_TIER;
//   - 60Hz vs 120Hz: the SAME seeded run must credit the IDENTICAL purse at
//     both frame steps (a kill is an EVENT, never a per-frame amount);
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

const S = suite('test_run_purse');
const h = await boot();
const T = h.T;
const st = h.state;
const elements = h.elements;

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
S.check('GOLD_TIER is one data table with the owner ordering', () => {
  assert(GOLD_TIER.CHAFF === 0, 'chaff pays ~nothing (0)');
  assert(GOLD_TIER.GRUNT > 0 && GOLD_TIER.GRUNT <= 1, 'grunt is near zero');
  assert(GOLD_TIER.ELITE > GOLD_TIER.MID && GOLD_TIER.HEAVY > GOLD_TIER.MID,
    'elites and heavies out-pay the ordinary field');
  assert(GOLD_TIER.MID_BOSS >= 60, 'a herald reads as a nice drop (>= 60)');
  assert(GOLD_TIER.BOSS > GOLD_TIER.MID_BOSS, 'the wave boss pays heaviest');
});
function assert(cond, msg) { if (!cond) throw new Error('AssertionError: ' + msg); }

// --------------------------------- per-kill credit at the REAL death funnel
T.startRun();
h.pump(5);
const purse0 = T.purse.get();
const kills0 = st.player.kills;
{
  const px = st.player.x, py = st.player.y - 120;
  const corpses = [
    { typeId: 'SWARMER' },                       // CHAFF  -> 0
    { typeId: 'CHASER' },                        // GRUNT  -> 1
    { typeId: 'SPITTER' },                       // MID    -> 3
    { typeId: 'BRUTE' },                         // HEAVY  -> 8
    { typeId: 'CHASER', elite: true },           // ELITE  -> 15
    { typeId: 'BOSS', boss: true, midBoss: true },   // MID_BOSS -> 60
    { typeId: 'BOSS', boss: true },              // BOSS   -> 150
  ];
  for (const c of corpses) {
    st.enemies.push({ typeId: c.typeId, x: px, y: py, hp: 0, maxHp: 1, w: 8, h: 8,
      speed: 0, xp: 1, age: 0, elite: !!c.elite, boss: !!c.boss, midBoss: !!c.midBoss });
  }
  h.pump(1);   // ONE death pass reaps them all through the real funnel
}
const credited = T.purse.get() - purse0;
S.check('per-kill credit is tier-weighted at the same funnel the loop uses', () => {
  const want = GOLD_TIER.CHAFF + GOLD_TIER.GRUNT + GOLD_TIER.MID + GOLD_TIER.HEAVY
    + GOLD_TIER.ELITE + GOLD_TIER.MID_BOSS + GOLD_TIER.BOSS;
  assert(credited === want, `7 corpses credit exactly ${want} (got ${credited})`);
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
function seededPurseRun(frameMs, frames) {
  const realRandom = Math.random;
  Math.random = mulberry32(0xe5);   // FIXTURE RETARGET 2026-09-15 (was 0xe3): G17 slice
  // 2's 16 breadth rows joined the FULL build the fixture arms (headsman/hairtrigger/
  // fanfire raise its dps, ironheart its pool), legitimately shifting the seeded stream;
  // 0xe3 then split a boundary kill (16 vs 15) across the frame-rate arms. Assertion
  // unchanged - 0xe5 measures the same parity at 14 kills / purse 14 both arms.
  try {
    T.banners.suppressAll();               // one-time banners hold the sim 2.5s
    T.getProfile().runPurse = 0;               // isolate the arm's earnings
    T.startRun();
    h.setFrameMs(frameMs);
    for (let i = 0; i < frames; i++) {
      h.pump(1);
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
  return { purse: T.purse.get(), time: st.time, kills: st.player.kills };
}
const arm60 = seededPurseRun(1000 / 60, 20 * 60);      // 20 sim-seconds at 60Hz
const arm120 = seededPurseRun(1000 / 120, 20 * 120);   // 20 sim-seconds at 120Hz
S.check('60Hz vs 120Hz: the same seeded run credits the identical purse', () => {
  assert(arm60.time > 19 && arm120.time > 19,
    `both arms really simulated ~20s (got ${arm60.time.toFixed(2)} / ${arm120.time.toFixed(2)})`);
  assert(arm60.kills > 0, `the seeded run killed something (${arm60.kills} kills)`);
  assert(arm60.purse === arm120.purse,
    `purse parity: 60Hz ${arm60.purse} vs 120Hz ${arm120.purse} ` +
    `(kills ${arm60.kills} / ${arm120.kills}) — the credit is a per-kill EVENT, dt-free`);
});

// ------------------------------------- the bank is unreachable mid-run
T.startRun();
h.pump(5);
{
  const prof = T.getProfile();
  prof.gold = 0;
  prof.runPurse = 0;
  // S1 retarget: the proximity loop iterates state.shrines (the world-seeded
  // set); pin one probe altar under the player (was: st.shrine = {...}).
  var probeShrine = { x: st.player.x, y: st.player.y, used: false };
  st.shrines = [probeShrine];
  for (let i = 0; i < 30 && !probeShrine.used && !probeShrine.brokeToast; i++) h.pump(1);
  var shrineCost = probeShrine.blessing && probeShrine.blessing.cost;
}
S.check('banked gold buys NOTHING at the shrine (purse 0, bank 0 -> no sale)', () => {
  assert(typeof shrineCost === 'number' && shrineCost > 0,
    'the shrine advertised a cost before the affordability check');
  assert(probeShrine.used === false, 'no purchase with an empty purse');
  assert(probeShrine.brokeToast === true, 'the broke toast fired (the altar asked and was refused)');
  assert(T.getProfile().gold === 0, 'the BANK was not touched');
  // Now the purse exactly covers it: same shrine, real proximity purchase.
  T.getProfile().runPurse = shrineCost;
  for (let i = 0; i < 30 && !probeShrine.used; i++) h.pump(1);
  assert(probeShrine.used === true, 'purse == cost completes the purchase');
  assert(T.purse.get() === 0, `the purse was debited exactly ${shrineCost}`);
  assert(T.getProfile().gold === 0, 'and the bank STILL was not touched');
});

// ------------------------------------------------------- settlement shape
T.startRun();
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
  assert(settle2.purseBanked === 0 && settle2.gold === settle2.award,
    'the second settlement does NOT re-bank the already-banked remainder');
  assert(bank2 === bank1 + settle2.award,
    'the second settlement adds only its own award, never the first purse');
  assert(st.player.kills >= 0, 'sanity');
});
S.check('FIRST_CLEAR and the maw bonus ride ON TOP, goldMult multiplies the award', () => {
  const prof = T.getProfile();
  prof.bestTime = 99999;                       // no first clear this time
  prof.runPurse = 0;
  const before = prof.gold;
  const r = T.purse.settle({ winBonus: 1200 });
  const wantAward = Math.round(RUN_GOLD.AWARD * 2);   // goldMult still 2, no FIRST_CLEAR
  assert(r.award === wantAward, `award without firstClear = ${wantAward} (got ${r.award})`);
  assert(r.gold === wantAward + 1200, 'the maw bonus is a separate addition on top');
  assert(prof.gold === before + r.gold, 'bank delta matches the settled total');
});
S.check('a zero run settles the flat award, not the retired formula', () => {
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
  assert(earnedBeforeReload === 3 * GOLD_TIER.HEAVY,
    `three heavies earned ${3 * GOLD_TIER.HEAVY} before the reload (got ${earnedBeforeReload})`);
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
