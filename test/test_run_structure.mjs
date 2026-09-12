// RUN-STRUCTURE wave tests — the run LADDER and the RUN SURVIVED win state.
//
// Two halves, matching the standard of evidence this project runs on:
//   PART A — the ladder is pure data, so it is asserted against the LIVE
//            config curves directly (no DOM, no harness): monotonic, spanning
//            the full run limit, and BIT-IDENTICAL to the shipped curves for
//            every tick inside the knee (so the early game cannot have moved).
//   PART B — the win state and the maw milestone are drived through the REAL
//            frame loop (test/_harness.mjs), because "the win fires exactly at
//            the limit and not before" is a claim about the loop, not about a
//            helper.
//
// Run: node test/test_run_structure.mjs
import assert from 'node:assert/strict';
import { CONFIG as C, ladderHp, ladderDmg, ladderXp, ladderGroups, ladderEliteChance,
  ladderBeats, shippedGroups, runClock } from '../src/config.js';
import { hpScale, xpScale, dmgScale } from '../src/entities.js';
import { boot, suite } from './_harness.mjs';

const S = suite('RUN STRUCTURE');
const RUN = C.RUN, L = C.LADDER;
const MAX_TICK = Math.ceil(RUN.LIMIT / 30);   // 60 ticks across a full run

// ============================================================================
// PART A — the ladder
// ============================================================================

S.check('the run is bounded at 30:00 and the ladder spans it exactly', () => {
  assert.equal(RUN.LIMIT, 1800, 'the run limit is 1800s (30:00)');
  assert.equal(runClock(RUN.LIMIT), '30:00', 'the clock reads 30:00 at the limit');
  assert.equal(runClock(0), '00:00');
  assert.equal(runClock(61), '01:01');
  // The ladder must span the whole limit, not stop short of it.
  assert.equal(L.WAVES * L.WAVE_SECONDS, RUN.LIMIT,
    `the ladder spans the limit (${L.WAVES} waves x ${L.WAVE_SECONDS}s = ${L.WAVES * L.WAVE_SECONDS}s)`);
  // And its wave length IS the shipped wave length — one wave, one builder.
  assert.equal(L.WAVE_SECONDS, C.ESCALATION.WAVE_LENGTH,
    'the ladder wave length equals ESCALATION.WAVE_LENGTH');
  assert.ok(L.WAVES > C.ESCALATION.END_WAVE,
    `the ladder outlives the maw milestone (${L.WAVES} > ${C.ESCALATION.END_WAVE})`);
});

S.check('the ladder is MONOTONIC (hp, dmg, xp, groups, elites all non-decreasing)', () => {
  for (let w = 1; w <= MAX_TICK; w++) {
    assert.ok(ladderHp(w) >= ladderHp(w - 1), `hp non-decreasing at tick ${w}`);
    assert.ok(ladderDmg(w) >= ladderDmg(w - 1), `dmg non-decreasing at tick ${w}`);
    assert.ok(ladderXp(w) >= ladderXp(w - 1), `xp non-decreasing at tick ${w}`);
  }
  for (let t = 30; t <= RUN.LIMIT; t += 30) {
    assert.ok(ladderGroups(t) >= ladderGroups(t - 30), `groups non-decreasing at ${t}s`);
    assert.ok(ladderEliteChance(t) >= ladderEliteChance(t - 30), `elite chance non-decreasing at ${t}s`);
  }
  assert.ok(ladderGroups(RUN.LIMIT) > ladderGroups(0),
    'density still escalates by the end of the run');
  assert.ok(ladderEliteChance(RUN.LIMIT) > ladderEliteChance(L.ELITE_FROM),
    'elites still escalate by the end of the run');
});

S.check('per-minute escalation is REAL: every minute is harder than the last', () => {
  // The genre bar is "per-minute escalation", so assert minute granularity:
  // the curve at minute N+1 must strictly exceed minute N for the whole run.
  let strictlyUp = 0;
  for (let m = 0; m < 29; m++) {
    const a = ladderHp(m * 2), b = ladderHp((m + 1) * 2);   // 2 ticks per minute
    if (b > a) strictlyUp++;
  }
  assert.equal(strictlyUp, 29, 'hp strictly rises on every one of the 29 minute steps');
  assert.ok(ladderHp(MAX_TICK) / ladderHp(0) > 100,
    `the full-run hp curve is a real climb (x${(ladderHp(MAX_TICK) / ladderHp(0)).toFixed(1)})`);
});

S.check('inside the knee the ladder IS the shipped curve (early game cannot move)', () => {
  // This is the constraint that protects every existing early-death
  // measurement: through 4:00 the ladder is the shipped curve, bit for bit.
  for (let w = 0; w <= L.KNEE_TICK; w++) {
    assert.equal(ladderHp(w), hpScale(w), `hp at tick ${w} is the shipped value`);
    assert.equal(ladderDmg(w), dmgScale(w), `dmg at tick ${w} is the shipped value`);
    assert.equal(ladderXp(w), xpScale(w), `xp at tick ${w} is the shipped value`);
  }
  for (let t = 0; t <= L.GROUPS_KNEE; t += 5) {
    assert.equal(ladderGroups(t), shippedGroups(t), `groups at ${t}s are the shipped value`);
  }
  // Just past the knee the curves must still agree AT the knee (continuity):
  // no cliff between "shipped" and "ladder".
  assert.equal(ladderHp(L.KNEE_TICK + 1) / ladderHp(L.KNEE_TICK), L.HP_LATE,
    'the hp curve compounds at HP_LATE from the knee tick');
});

S.check('the ladder CAPS the shipped explosion (a wall is not a ladder)', () => {
  const shippedTop = hpScale(MAX_TICK);
  const ladderTop = ladderHp(MAX_TICK);
  assert.ok(Number.isFinite(ladderTop) && Number.isFinite(ladderDmg(MAX_TICK)),
    'the full-run curve is finite');
  assert.ok(shippedTop / ladderTop > 1e5,
    `the shipped curve at 30:00 is >1e5x the ladder (${(shippedTop / ladderTop).toExponential(2)})`);
  assert.ok(ladderDmg(MAX_TICK) < 20,
    `contact damage stays playable to the limit (x${ladderDmg(MAX_TICK).toFixed(2)} base)`);
  assert.ok(ladderGroups(RUN.LIMIT) <= L.GROUPS_MAX,
    `density is capped (${ladderGroups(RUN.LIMIT)} <= ${L.GROUPS_MAX} groups/tick)`);
});

S.check('the ladder ceilings the CONFIG comments document are the live values', () => {
  // The comments in CONFIG.LADDER quote numbers (441x / 9.3x / 66x / 13 groups).
  // Pin them, so a later retune cannot leave the documented shape lying.
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  assert.ok(near(ladderHp(MAX_TICK), 440.8, 0.5), `hp ceiling ${ladderHp(MAX_TICK).toFixed(1)} vs 440.8`);
  assert.ok(near(ladderDmg(MAX_TICK), 9.32, 0.01), `dmg ceiling ${ladderDmg(MAX_TICK).toFixed(2)} vs 9.32`);
  assert.ok(near(ladderXp(MAX_TICK), 65.9, 0.2), `xp ceiling ${ladderXp(MAX_TICK).toFixed(1)} vs 65.9`);
  assert.equal(ladderGroups(RUN.LIMIT), 13, 'groups per tick at the limit is 13 (cap 14)');
  assert.equal(ladderEliteChance(RUN.LIMIT), L.ELITE_MAX, 'elite chance reaches its ceiling exactly');
  assert.ok(hpScale(MAX_TICK) > 1e8,
    `the curve it replaced: shipped hp at 30:00 is ${hpScale(MAX_TICK).toExponential(2)}`);
});

S.check('cadence: a boss beat on every wave, herald beat preserved through the milestone', () => {
  // Shipped cadence must be untouched for every wave the game could reach
  // before this wave (1..END_WAVE): the herald fired on ALL of them.
  for (let n = 1; n <= C.ESCALATION.END_WAVE; n++) {
    const b = ladderBeats(n);
    assert.equal(b.boss, true, `wave ${n} carries a boss beat`);
    assert.equal(b.herald, true, `wave ${n} keeps the shipped herald beat`);
    assert.equal(b.surge, false, `wave ${n} has no surge (shipped balance)`);
  }
  // Past the milestone the ladder keeps producing beats, and the elite surge
  // is a NEW beat that only exists up there.
  let herald = 0, surge = 0;
  for (let n = C.ESCALATION.END_WAVE + 1; n <= L.WAVES; n++) {
    const b = ladderBeats(n);
    assert.equal(b.boss, true, `wave ${n} carries a boss beat`);
    if (b.herald) herald++;
    if (b.surge) surge++;
  }
  assert.ok(herald > 0 && surge > 0,
    `the post-milestone ladder still has beats (${herald} herald, ${surge} surge)`);
  // Surges are scheduled, not vibes: exactly one per SURGE_EVERY waves past
  // the milestone, so their spacing is L.SURGE_EVERY waves apart.
  const surgeWaves = [];
  for (let n = 1; n <= L.WAVES; n++) if (ladderBeats(n).surge) surgeWaves.push(n);
  assert.ok(surgeWaves.every((n, i) => i === 0 || n - surgeWaves[i - 1] === L.SURGE_EVERY),
    `surge beats are evenly spaced every ${L.SURGE_EVERY} waves (${surgeWaves.join(',')})`);
  assert.ok(surgeWaves.every(n => n > C.ESCALATION.END_WAVE),
    'no surge touches the shipped early waves');
  // Across a full run: one boss beat per wave = the cadence count the design
  // asks for (10-15 across a full run).
  assert.ok(L.WAVES >= 10 && L.WAVES <= 15, `${L.WAVES} boss beats across a full run`);
});

// ============================================================================
// PART B — the win state and the maw milestone, through the REAL loop
// ============================================================================
const h = await boot();
const st = h.state;
const T = h.T;

// One frame, with the pilot kept alive (the same trick smoke.mjs uses).
const step = () => h.pump(1, () => { st.player.hp = st.player.stats.maxHp; });
const freezeSpawns = () => {
  st.spawnTimer = 1e9;              // no ambient pack
  st.wave.endsAt = st.time + 1e9;   // no wave boss
  st.wave.midAt = st.time + 1e9;    // no herald
};

S.check('a fresh run starts at 00:00, unwon, with the full ladder ahead', () => {
  T.startRun();
  h.pump(2);
  assert.equal(st.runWon, false, 'no win at run start');
  assert.equal(st.time < 1, true, 'the clock starts at zero');
  assert.equal(st.wave.num, 1, 'wave 1');
  assert.equal(T.run.limit, RUN.LIMIT, 'the seam reports the live limit');
  assert.ok(T.run.survivedBonus() >= RUN.SURVIVED_BONUS, 'the win pays at least the completion bonus');
});

S.check('the win does NOT fire before the limit (real frames below the limit)', () => {
  st.time = 600;                    // 10:00 in
  freezeSpawns();
  h.pump(120, () => { st.player.hp = st.player.stats.maxHp; freezeSpawns(); });
  assert.equal(st.runWon, false, '10:02 of play is not a win');
  st.time = RUN.LIMIT - 1;          // 29:59
  freezeSpawns();
  h.pump(30, () => { st.player.hp = st.player.stats.maxHp; freezeSpawns(); });
  assert.equal(st.runWon, false, '29:59.5 is still not the limit');
  assert.notEqual(st.mode, 'dead', 'and the run is still live');
});

S.check('the win fires at the limit and not one frame early', () => {
  const goldBefore = T.getProfile().gold;
  const bonus = T.run.survivedBonus();
  st.time = RUN.LIMIT - 0.02;       // less than one 60Hz frame short
  freezeSpawns();
  h.pump(1, () => { st.player.hp = st.player.stats.maxHp; freezeSpawns(); });
  assert.ok(st.time < RUN.LIMIT, `one frame from 29:59.98 lands at ${st.time.toFixed(4)}s (< limit)`);
  assert.equal(st.runWon, false, 'NOT won while time < limit');
  assert.notEqual(st.mode, 'dead', 'still playing');
  // The next frame crosses the limit.
  freezeSpawns();
  h.pump(1, () => { st.player.hp = st.player.stats.maxHp; freezeSpawns(); });
  assert.ok(st.time >= RUN.LIMIT, `the crossing frame lands at ${st.time.toFixed(4)}s`);
  assert.equal(st.runWon, true, 'RUN SURVIVED fired on the crossing frame');
  assert.equal(st.mode, 'dead', 'the run is over');
  assert.equal(st.deathBy, null, 'a win records no killer');
  assert.equal(h.elements['ov-title'].textContent, 'RUN SURVIVED', 'the win has its own end card');
  const goldAfter = T.getProfile().gold;
  assert.ok(goldAfter > goldBefore, `the win pays out (+${goldAfter - goldBefore})`);
  assert.ok(/COMPLETION BONUS: \+\d+/.test(h.elements['ov-sub'].innerHTML),
    'the completion bonus is itemised on the card');
  assert.equal(st.runWon, true, 'and the flag stays set');
});

S.check('the win is exactly at the limit, not at a rounded minute (edge probe)', () => {
  const before = st.runWon;
  assert.equal(before, true, 'already won from the previous check');
  // Idempotence: the win cannot fire twice or re-settle gold.
  const gold = T.getProfile().gold;
  const again = T.run.check();
  assert.equal(again, false, 'check() is inert once the run is won');
  assert.equal(T.getProfile().gold, gold, 'no second payout');
});

S.check('the maw is a MILESTONE: slaying it unlocks and the run CONTINUES', () => {
  T.startRun();
  h.pump(2);
  // Drive to the END_WAVE cast through the real paths (smoke.mjs pattern).
  st.wave.num = C.ESCALATION.END_WAVE;
  st.wave.endsAt = st.time;
  let guard = 0;
  while (!(st.wave.bosses || []).some(b => b.hp > 0) && guard++ < 900) step();
  assert.ok((st.wave.bosses || []).some(b => b.hp > 0), 'the milestone wave cast spawned');
  st.wave.endsAt = st.time + 1e9;
  for (const b of st.wave.bosses) if (b.hp > 0) b.hp = 0;
  guard = 0;
  while (st.mode !== 'finale' && guard++ < 6000) {
    if (st.mode === 'draft' || st.mode === 'evolve') {
      const kids = h.elements['ov-cards'].children;
      const c = kids[0];
      if (c) { c.click(); continue; }
    }
    step();
  }
  assert.equal(st.mode, 'finale', `the maw milestone must start (mode=${st.mode})`);
  assert.ok(st.finalBoss, 'the maw is on the field');
  assert.equal(st.finalBoss.maxHp, RUN.MAW_HP, 'the maw has a REAL, finite pool');
  assert.ok(Number.isFinite(st.mawDeadline) && st.mawDeadline > st.time,
    'the milestone has a window ahead of it');
  // Slay it: drop the pool and let the hero's real volley finish it.
  st.finalBoss.hp = 40;
  guard = 0;
  while (!st.mawCleared && guard++ < 1800) step();
  assert.equal(st.mawCleared, true, 'the maw milestone was cleared through the real loop');
  assert.notEqual(st.mode, 'dead', 'slaying the maw does NOT end the run');
  assert.equal(st.runWon, false, 'and it is not the RUN SURVIVED win either');
  assert.equal(T.getProfile().milestones.mawSlain, true, 'the milestone unlocks a profile flag');
  assert.ok(/THE MAW IS SLAIN/.test(h.elements['ov-title'].textContent), 'milestone card shown');
  // The ladder resumes: the intermission CONTINUE advances past the milestone.
  const waveBefore = st.wave.num;
  let cont = null;
  for (const c of h.elements['ov-cards'].children) {
    if ((c.innerHTML || '').includes('CONTINUE')) cont = c;
  }
  assert.ok(cont, 'the milestone hands off to the ordinary intermission (CONTINUE)');
  cont.click();
  assert.equal(st.mode, 'playing', 'CONTINUE resumes the run');
  assert.equal(st.wave.num, waveBefore + 1, `the ladder advances past the milestone (wave ${st.wave.num})`);
  assert.ok(st.wave.endsAt > st.time, 'and the next wave clock is armed');
});

S.check('the maw is not a WALL: survive the window and the run goes on', () => {
  T.startRun();
  h.pump(2);
  st.wave.num = C.ESCALATION.END_WAVE;
  st.wave.endsAt = st.time;
  let guard = 0;
  while (!(st.wave.bosses || []).some(b => b.hp > 0) && guard++ < 900) step();
  st.wave.endsAt = st.time + 1e9;
  for (const b of st.wave.bosses) if (b.hp > 0) b.hp = 0;
  guard = 0;
  while (st.mode !== 'finale' && guard++ < 6000) {
    if (st.mode === 'draft' || st.mode === 'evolve') {
      const c = h.elements['ov-cards'].children[0];
      if (c) { c.click(); continue; }
    }
    step();
  }
  assert.equal(st.mode, 'finale', 'in the milestone encounter again');
  const waveIn = st.wave.num;
  st.mawDeadline = st.time + 0.0001;   // the window expires this frame
  step();
  assert.equal(st.finalBoss, null, 'the maw withdrew');
  assert.equal(st.mawCleared, false, 'the milestone was NOT earned');
  assert.notEqual(st.mode, 'dead', 'surviving the encounter keeps the run alive');
  assert.equal(st.mode, 'intermission', `the run continues into the intermission (mode=${st.mode})`);
  let cont = null;
  for (const c of h.elements['ov-cards'].children) {
    if ((c.innerHTML || '').includes('CONTINUE')) cont = c;
  }
  assert.ok(cont, 'CONTINUE is offered after the withdrawal');
  cont.click();
  assert.equal(st.wave.num, waveIn + 1, 'the ladder still advances (the maw was a beat, not the end)');
  assert.ok(st.time < RUN.LIMIT, 'and the run still has the 30:00 limit ahead of it');
});

S.check('frame-rate independence: the limit and the ladder are dt-driven', () => {
  T.startRun();
  h.pump(2);
  // 120Hz: half the frame delta must advance the clock by the same wall time.
  const t0 = st.time;
  h.setFrameMs(1000 / 120);
  freezeSpawns();
  h.pump(120, () => { freezeSpawns(); });
  const at120 = st.time - t0;
  T.startRun();
  h.pump(2);
  const t1 = st.time;
  h.setFrameMs(1000 / 60);
  freezeSpawns();
  h.pump(60, () => { freezeSpawns(); });
  const at60 = st.time - t1;
  h.setFrameMs(1000 / 60);
  assert.ok(Math.abs(at120 - at60) < 0.05,
    `1s of wall time is 1s of run clock at 120Hz and 60Hz (${at120.toFixed(3)} vs ${at60.toFixed(3)})`);
});

S.done();
