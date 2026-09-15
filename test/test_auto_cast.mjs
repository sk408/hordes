// HORDES — AUTO-CAST verification (N1b item 8: "the AUTO pilot must be able
// to SPEND mana, or the whole scheme reads as a tax").
//
// useSkill was reachable ONLY from the player's Q/E (main.js runAction), so
// an AUTO run paid mana's costs and collected none of its benefits. The pilot
// now casts, under CONFIG.AUTOPILOT.AUTO_CAST.
//
// What is proven here:
//   1. the knobs exist in CONFIG.AUTOPILOT.AUTO_CAST and are sane;
//   2. no cast with NO legal target (an empty field is a wasted 30);
//   3. no cast when the pool cannot pay (useSkill would reject it anyway);
//   4. FROST_NOVA casts when a live enemy is inside its RADIUS — and NOT one
//      pixel-class outside it;
//   5. OVERCHARGE on a boss present (the BOSS_STANCE awareness), on a live
//      elite inside ELITE_RANGE, and on the near-full spill rule;
//   6. no double-spend in one frame (the skill's own cooldown is the gate);
//   7. MANUAL never casts — the player keeps 100% of the decision;
//   8. it is wired into the REAL frame loop (both resource seams' shared
//      pattern: the cast happens without anyone pressing a key);
//   9. the SAME cast count at 60Hz and 120Hz over the same scripted state —
//      nothing counts frames.
// Run: node test/test_auto_cast.mjs
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';
import { CONFIG as C } from '../src/config.js';
import { updateResources, useSkill } from '../src/skills.js';
// G21 slice 1 (C2): the empty-rewrite-slot payment rides skillCooldown, so
// the armed-cooldown pin below reads the live emptySlotCooldownMult(st).
import { emptySlotCooldownMult } from '../src/rewrites.js';

const S = suite('AUTO-CAST');
const h = await boot();
const st = h.state;
const T = h.T;
const AC = C.AUTOPILOT.AUTO_CAST;
const Q = 'FROST_NOVA';   // the fresh profile's class skill (classSkillId)
const COST_Q = C.SKILLS[Q].MANA;
const COST_W = C.SKILLS.OVERCHARGE.MANA;
const CD_Q = C.SKILLS[Q].COOLDOWN;

// A world with nothing in it: these checks are about the pilot's cast hand,
// so no enemy may land a hit and no boss may re-stance the pilot mid-pump.
const quiet = () => {
  st.spawnTimer = 9999;
  st.wave.endsAt = st.time + 1e9;
  st.enemies.length = 0;
  st.gems.length = 0;
  if (st.wave.bosses) st.wave.bosses.length = 0;
  if (st.wave.midBosses) st.wave.midBosses.length = 0;
  st.wave.boss = null;
  st.finalBoss = null;
};
const live = (mode = 'AUTO') => {
  T.startRun();
  // RETARGET (N1 slice 3): no class row carries FROST_NOVA anymore — the
  // three non-Witch classes got kill-charged NON-mana ults and FROST_NOVA
  // moved to the draftable card. This file's contract is the AUTO-CAST
  // POLICY itself (mana price, radius honesty, spill, boss awareness), which
  // is class-agnostic, so the fixture pins a SYNTHETIC FROST_NOVA Q on a
  // shallow copy of the run's character row (the meta row is never mutated).
  // The charge-gated ult Q path through this same seam is covered by
  // test_ults.mjs.
  st.character = { ...(st.character || {}), skill: 'FROST_NOVA' };
  T.setPilotMode(mode);
  h.pump(2, quiet);
  quiet();
};
// A stationary, unkillable enemy at (dx, dy) from the player. Contact damage
// is zeroed so a pinned enemy cannot kill the fixture mid-check.
const foe = (p, dist = 0, elite = false) => {
  const e = {
    typeId: 'GRUNT', x: p.x + dist, y: p.y, hp: 1e9, maxHp: 1e9, speed: 0,
    damage: 0, flash: 0, slow: 0, elite, r: 8, age: 0,
  };
  st.enemies.push(e);
  return e;
};
const ready = (p) => {
  for (const id in p.skillCd) p.skillCd[id] = 0;
  p.buffs.overcharge = 0;   // a run starts at max mana: the spill rule fires
                            // in live()'s pump frames and the buff lingers
  p.potions.hp = 0;
  p.potions.mp = 0;   // AUTO_DRINK stays out of the fixture
};

// ============================================================================
S.check('the knobs exist in CONFIG.AUTOPILOT.AUTO_CAST and are sane', () => {
  assert.ok(AC, 'CONFIG.AUTOPILOT.AUTO_CAST must exist');
  assert.equal(AC.ENABLED, true, 'shipped enabled');
  assert.ok(AC.NEAR_FULL > 0 && AC.NEAR_FULL < 1,
    'NEAR_FULL is a fraction of max, not a flat number: ' + AC.NEAR_FULL);
  assert.ok(AC.ELITE_RANGE > 0, 'ELITE_RANGE must be positive: ' + AC.ELITE_RANGE);
});

// ============================================================================
S.check('no cast with no legal target — an empty field is a wasted 30', () => {
  live('AUTO');
  const p = st.player;
  ready(p);
  p.mana = COST_W + 5;                 // can pay BOTH skills, but below spill
  const before = p.mana;
  T.autoCast(st);
  assert.equal(p.mana, before,
    'no enemy in RADIUS, no boss/elite, pool below spill: nothing was cast');
  assert.equal(p.skillCd[Q], 0, 'no nova cooldown was armed');
  assert.ok(!p.buffs.overcharge, 'and no overcharge either');
});

// ============================================================================
S.check('no cast when the pool cannot pay (useSkill would reject anyway)', () => {
  live('AUTO');
  const p = st.player;
  ready(p);
  p.mana = COST_Q - 1;                 // cannot pay FROST_NOVA, far from full
  const e = foe(p, 0);                 // a perfectly legal target
  const before = p.mana;
  T.autoCast(st);
  assert.equal(p.mana, before, 'the pilot did not spend mana it does not have');
  assert.equal(p.skillCd[Q], 0, 'no cooldown was armed either (no wasted call)');
  assert.ok(e.slow === 0, 'and nothing was slowed');
  quiet();
});

// ============================================================================
S.check('FROST_NOVA casts when a live enemy is inside RADIUS', () => {
  live('AUTO');
  const p = st.player;
  ready(p);
  p.mana = p.stats.maxMana;
  const e = foe(p, C.SKILLS[Q].RADIUS - 5);   // inside
  const before = p.mana;
  T.autoCast(st);
  assert.equal(p.mana, before - COST_Q,
    'the pilot cast FROST_NOVA through useSkill (full price, no discount)');
  // RETARGET (G21 slice 1, C2): the armed cooldown now pays the empty-slot
  // multiplier through the one skillCooldown seam — CD_Q x 0.80 on this
  // zero-rewrite fixture, computed live so a full-house run would pin x1.00.
  const cdWant = CD_Q * emptySlotCooldownMult(st);
  assert.ok(p.skillCd[Q] > cdWant - 1e-6 && p.skillCd[Q] <= cdWant,
    'the skill\'s own cooldown is armed: ' + p.skillCd[Q]);
  assert.ok(e.slow > 0, 'the cast LANDED: the enemy is slowed');
  quiet();
});

// ============================================================================
S.check('the radius boundary is honest: outside RADIUS, no cast', () => {
  live('AUTO');
  const p = st.player;
  ready(p);
  p.mana = p.stats.maxMana * AC.NEAR_FULL - 1;   // also below the spill line
  foe(p, C.SKILLS[Q].RADIUS + 40);               // outside
  const before = p.mana;
  T.autoCast(st);
  assert.equal(p.mana, before,
    'an enemy beyond RADIUS is not a legal target: mana untouched');
  assert.equal(p.skillCd[Q], 0, 'and no cooldown was armed');
  quiet();
});

// ============================================================================
S.check('OVERCHARGE on a boss present (the BOSS_STANCE awareness)', () => {
  live('AUTO');
  const p = st.player;
  ready(p);
  p.mana = COST_W + 5;                 // can pay, but far below the spill line
  st.wave.bosses.push({ hp: 100, x: p.x - 500, y: p.y, name: 'F' });
  const before = p.mana;
  T.autoCast(st);
  assert.equal(p.mana, before - COST_W,
    'a live boss present: the pilot spent OVERCHARGE');
  assert.ok(p.buffs.overcharge > 0, 'the buff is live');
  assert.equal(p.skillCd[Q], 0,
    'and FROST_NOVA did not fire: nothing is inside its RADIUS');
  quiet();
});

// ============================================================================
S.check('OVERCHARGE on a live elite inside ELITE_RANGE (not a boss)', () => {
  live('AUTO');
  const p = st.player;
  ready(p);
  p.mana = COST_W + 5;
  // A1 RETARGET (2026-09-14): ELITE_RANGE is now DERIVED from the pilot's
  // engagement radius (config AUTOPILOT.FOCUS_RANGE, owner-set base 100) instead
  // of its own hardcoded 260 — so the old fixture at ELITE_RANGE-20 = 240px
  // moved to 80px, INSIDE FROST_NOVA's 85px RADIUS, and the pilot spent the Q
  // cast first: the last assertion ("FROST_NOVA did not fire") is what caught
  // it. The band this test needs still exists (nova RADIUS 85 < d < ELITE_RANGE
  // 100), so the elite is placed in it and BOTH original invariants are asserted
  // unchanged: an elite inside ELITE_RANGE spends OVERCHARGE, and an elite
  // beyond the nova RADIUS is never novad.
  const novaR = C.SKILLS.FROST_NOVA.RADIUS;
  const d = Math.round((novaR + AC.ELITE_RANGE) / 2);
  assert.ok(d > novaR && d < AC.ELITE_RANGE,
    'fixture sits between the nova RADIUS and the elite gate: ' + d + 'px');
  const e = foe(p, d, true);   // elite, engaged, but beyond the nova
  const before = p.mana;
  T.autoCast(st);
  assert.equal(p.mana, before - COST_W,
    'a live elite within ELITE_RANGE: the pilot spent OVERCHARGE');
  assert.ok(p.buffs.overcharge > 0, 'the buff is live');
  assert.equal(p.skillCd[Q], 0,
    'and FROST_NOVA did not fire: the elite is beyond its RADIUS');
  assert.ok(e.slow === 0, 'the elite was never touched by a nova');
  quiet();
});

// ============================================================================
S.check('an elite beyond ELITE_RANGE is not "present"', () => {
  live('AUTO');
  const p = st.player;
  ready(p);
  p.mana = COST_W + 5;
  foe(p, AC.ELITE_RANGE + 80, true);
  const before = p.mana;
  T.autoCast(st);
  assert.equal(p.mana, before,
    'a far-side elite is not a reason to burn the buff yet');
  quiet();
});

// ============================================================================
S.check('the near-full spill rule: a pool at the threshold spends itself', () => {
  live('AUTO');
  const p = st.player;
  ready(p);
  p.mana = Math.floor(p.stats.maxMana * AC.NEAR_FULL);   // AT the line
  const before = p.mana;
  T.autoCast(st);
  assert.equal(p.mana, before - COST_W,
    'at/above NEAR_FULL with no threat: the pilot spills income into damage');
  assert.ok(p.buffs.overcharge > 0, 'the buff is live');
  quiet();
});

// ============================================================================
S.check('no double-spend in one frame — the cooldown is the gate', () => {
  live('AUTO');
  const p = st.player;
  ready(p);
  p.mana = p.stats.maxMana;
  foe(p, 0);
  T.autoCast(st);                       // the cast lands
  const afterOne = p.mana;
  assert.ok(p.skillCd[Q] > 0, 'the nova cooldown is armed after the cast');
  // NOTE: OVERCHARGE may or may not have fired here — the nova's 30 spend can
  // drop the pool below the near-full line first (that ordering is the
  // conservative behaviour, not a bug). The point of THIS check is the total:
  T.autoCast(st);                       // a second decision in the SAME frame
  T.autoCast(st);
  assert.equal(p.mana, afterOne,
    'two more decisions in the same frame spent nothing further');
  quiet();
});

// ============================================================================
S.check('MANUAL never casts — the player keeps 100% of the decision', () => {
  live('MANUAL');
  assert.equal(st.pilotMode, 'MANUAL', 'the manual pilot is bound');
  const p = st.player;
  ready(p);
  p.mana = p.stats.maxMana;
  const e = foe(p, 0);
  h.pump(30, quiet);                    // half a second of real frames
  assert.equal(p.mana, p.stats.maxMana,
    'MANUAL: the pool sat at max — nothing was cast for the player');
  assert.equal(p.skillCd[Q], 0, 'no cooldown was armed');
  assert.equal(e.slow, 0, 'no nova landed');
  assert.ok(!p.buffs.overcharge, 'no overcharge either');
  // And the manual keys still work through the same useSkill seam.
  assert.equal(useSkill(st, Q), true, 'the player\'s Q still casts');
  quiet();
});

// ============================================================================
S.check('wired into the REAL frame loop — nobody pressed a key', () => {
  live('AUTO');
  const p = st.player;
  ready(p);
  p.mana = p.stats.maxMana;
  const e = foe(p, 0);
  // Pin the fixture onto the player each frame (the pilot kites away from a
  // live enemy; onFrame runs after the frame, so this holds for the next).
  h.pump(3, () => { e.x = p.x; e.y = p.y; });
  assert.ok(e.slow > 0,
    'the pilot cast FROST_NOVA from inside the frame loop (no key event)');
  assert.ok(p.mana < p.stats.maxMana, 'and paid full price for it');
  quiet();
});

// ============================================================================
S.check('60Hz and 120Hz give the SAME cast count (nothing counts frames)', () => {
  // Scripted state: one stationary enemy pinned to a stationary player, driven
  // through the REAL resource step (updateResources) + the REAL decision step
  // (autoCast) at two step sizes over the same 10 simulated seconds.
  const replay = (frameMs) => {
    live('AUTO');
    const p = st.player;
    ready(p);
    const e = foe(p, 0);
    let nova = 0, charge = 0;
    const origPush = st.effects.push.bind(st.effects);
    st.effects.push = function (...a) {
      for (const x of a) {
        if (x.kind === 'nova') nova++;
        if (x.kind === 'charge') charge++;
      }
      return origPush(...a);
    };
    p.mana = 60;                        // can pay, below the spill line
    const dt = frameMs / 1000;
    for (let t = 0; t < 10; t += dt) {
      updateResources(p, dt);           // cooldowns tick in SECONDS
      T.autoCast(st);
      e.x = p.x; e.y = p.y;             // the fixture never drifts
      e.slow = 0;                       // and never dies or slows out
    }
    st.effects.push = origPush;         // restore the seam
    quiet();
    return { nova, charge };
  };
  const at60 = replay(1000 / 60);
  const at120 = replay(1000 / 120);
  // Cooldown 8s over a 10s window: cast at t=0 and t=8 -> exactly 2 (mana
  // 60 -> 30 -> +regen -> pays again). The COUNT is the assertion: both
  // refresh rates must agree, because nothing anywhere counts frames.
  assert.equal(at60.nova, at120.nova,
    'same scripted state, same cast count: ' + at60.nova + ' vs ' + at120.nova);
  assert.ok(at60.nova >= 2 && at60.nova <= 3,
    'cadence is the cooldown, not the frame rate: ' + at60.nova + ' novas in 10s');
  assert.equal(at60.charge, at120.charge, 'overcharge agrees too');
});

S.done();
