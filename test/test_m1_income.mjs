// M1 income: every source pays into the run purse, and the whole run is banked
// exactly once at run end — including what is earned after the maw milestone.
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';
import { RUN_GOLD, GOLD_TIER } from '../src/meta.js';
import { CONFIG as C } from '../src/config.js';

const S = suite('test_m1_income');
const h = await boot();
const T = h.T, st = h.state;
const prof = T.getProfile();

const quiet = () => { st.enemies.length = 0; st.gems.length = 0; st.spawnTimer = 1e9; };
const fresh = () => { T.startRun(); h.pump(2); quiet(); };
const chaser = () => ({ typeId: 'CHASER' });

S.check('survival bonus: the n-th 30s pays SURVIVAL_BASE + SURVIVAL_STEP x n, once', () => {
  fresh();
  const p0 = T.purse.get();
  st.time = 95;                      // three ticks due
  T.run.check();
  const want = [1, 2, 3].reduce((s, n) => s + RUN_GOLD.SURVIVAL_BASE + RUN_GOLD.SURVIVAL_STEP * n, 0);
  assert.equal(T.purse.get() - p0, want);
  T.run.check();
  assert.equal(T.purse.get() - p0, want, 'a tick never pays twice');
  st.time = 121;
  T.run.check();
  assert.equal(T.purse.get() - p0, want + RUN_GOLD.SURVIVAL_BASE + RUN_GOLD.SURVIVAL_STEP * 4);
  assert.equal(st.runCounts.gold.survival, T.purse.get() - p0, 'the ledger names the survival share');
});

S.check('chaff and grunts pay; fractions carry instead of rounding away', () => {
  fresh();
  assert.ok(GOLD_TIER.CHAFF > 0 && GOLD_TIER.GRUNT >= GOLD_TIER.CHAFF);
  const p0 = T.purse.get();
  const n = Math.round(4 / GOLD_TIER.CHAFF);
  for (let i = 0; i < n; i++) T.purse.credit({ typeId: 'SWARMER' });
  assert.equal(T.purse.get() - p0, 4, n + ' chaff kills at kill count 0 pay 4 gold in total');
});

S.check('ordinary kills pay less as the kill count climbs; bosses always pay in full', () => {
  fresh();
  const pay = (e, kills) => {
    st.player.kills = kills; st.runCounts.gold.carry = 0;
    const p0 = T.purse.get();
    for (let i = 0; i < 100; i++) T.purse.credit(e);
    return (T.purse.get() - p0) / 100;
  };
  const early = pay(chaser(), 0), half = pay(chaser(), RUN_GOLD.KILL_SOFTCAP), late = pay(chaser(), RUN_GOLD.KILL_SOFTCAP * 9);
  assert.ok(Math.abs(early - GOLD_TIER.GRUNT) < 0.02, 'full value at 0 kills');
  assert.ok(Math.abs(half - GOLD_TIER.GRUNT / 2) < 0.02, 'half value at KILL_SOFTCAP kills');
  assert.ok(Math.abs(late - GOLD_TIER.GRUNT / 10) < 0.02, 'a tenth at 9x the soft cap');
  assert.equal(pay({ boss: true }, RUN_GOLD.KILL_SOFTCAP * 9), GOLD_TIER.BOSS);
  assert.equal(pay({ boss: true, midBoss: true }, RUN_GOLD.KILL_SOFTCAP * 9), GOLD_TIER.MID_BOSS);
});

S.check('Greed multiplies purse income, not just the award', () => {
  fresh();
  st.player.kills = 0;
  st.player.stats.goldMult = 1.4;
  const p0 = T.purse.get();
  T.purse.credit({ boss: true });
  assert.equal(T.purse.get() - p0, Math.floor(GOLD_TIER.BOSS * 1.4));
});

S.check('the first run ever pays FIRST_CLEAR; a later record pays NEW_BEST; no record pays neither', () => {
  prof.bestTime = 0;
  fresh(); st.time = 10;
  let r = T.purse.settle();
  assert.equal(r.award, RUN_GOLD.AWARD + RUN_GOLD.FIRST_CLEAR);
  fresh(); st.time = 20;
  r = T.purse.settle();
  assert.equal(r.award, RUN_GOLD.AWARD + RUN_GOLD.NEW_BEST);
  fresh(); st.time = 15;
  r = T.purse.settle();
  assert.equal(r.award, RUN_GOLD.AWARD);
  assert.equal(prof.bestTime, 20);
});

S.check('the maw milestone does not settle the run: gold earned after it is banked at run end, once', () => {
  prof.bestTime = 1e9;               // no record bonus in this arithmetic
  fresh();
  st.player.kills = 0;
  T.purse.credit({ boss: true });
  const beforeMaw = T.purse.get();
  const gold0 = prof.gold;
  T.run.mawDefeated();
  assert.equal(st.mawCleared, true);
  assert.equal(st.runSettled, null, 'the milestone is not a settlement');
  assert.equal(prof.gold, gold0, 'nothing is banked mid-run');
  assert.equal(T.purse.get(), beforeMaw, 'the purse rides on');
  assert.equal(st.milestoneBonus, C.RUN.MAW_CLEAR_BONUS);
  // the run continues and earns more
  T.purse.credit({ boss: true });
  T.purse.credit({ boss: true, midBoss: true });
  const purseAtEnd = T.purse.get();
  assert.equal(purseAtEnd, beforeMaw + GOLD_TIER.BOSS + GOLD_TIER.MID_BOSS);
  const r = T.purse.settle();
  assert.equal(r.purseBanked, purseAtEnd, 'everything earned in the run is banked');
  assert.equal(r.winBonus, C.RUN.MAW_CLEAR_BONUS, 'with the milestone bonus');
  assert.equal(prof.gold - gold0, RUN_GOLD.AWARD + purseAtEnd + C.RUN.MAW_CLEAR_BONUS);
  assert.equal(T.purse.get(), 0);
  const again = T.purse.settle();
  assert.equal(again, r, 'a second settle returns the first');
  assert.equal(prof.gold - gold0, RUN_GOLD.AWARD + purseAtEnd + C.RUN.MAW_CLEAR_BONUS, 'and banks nothing more');
});

S.check('nothing leaks into the next run', () => {
  fresh();
  assert.equal(T.purse.get(), 0);
  assert.equal(st.milestoneBonus, 0);
  assert.equal(st.survivalTicks, 0);
});

S.done();
process.exit(0);
