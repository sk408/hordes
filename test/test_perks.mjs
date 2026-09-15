// HORDES — test/test_perks.mjs: G8 STEP 4 (the perk card family, src/perks.js).
//
// The owner's G8 decision (docs/HORDES_GOALS_2026-09-12.md) is option 6,
// sequenced 1 -> 3 -> 4 -> 2. Step 4 is the ALWAYS-ON perk family (Regrowth /
// Focus / Thick Skin), offered in the level-up draft like the rule cards but
// distinct from the stat cards. This file proves each perk at its REAL seam:
//
//   1. THE FAMILY CONTRACT: ids unique, no collision with the seven stat
//      UPGRADES or the rules family, once-only, one weight constant, and the
//      same apply(player) draft contract every other card honors.
//   2. THE HELPERS' MATH: each applied-value helper returns exactly the
//      constant it owns (0.7 HP/s, x0.8 mana, x0.85 cooldown, x0.88 damage).
//   3. DT-CORRECTNESS THROUGH THE REAL FRAME LOOP: Regrowth heals through the
//      live per-frame seam (main.js calls applyRegrowth(state, dt)), and 60Hz
//      and 120Hz must agree -- nothing may assume a fixed dt.
//   4. ALL THREE DAMAGE PATHS FUNNEL THROUGH damageTaken: contact (a parked
//      CHASER, remapped to BRUTE for flash hermeticity), enemy shot, and the TICK drain, each measured live with the
//      perk off and on -- the ratio must be exactly THICK_TAKEN_MULT.
//   5. THE REAL DRAFT SEAM: skill cards reach src/main.js openDraft()'s pool,
//      leave it once taken, and pick() grants the perk WITHOUT polluting the
//      `once` stat ledger (test_run_rules.mjs pattern).
//
// Run: node test/test_perks.mjs
import assert from 'node:assert/strict';
import { CONFIG as C, UPGRADES } from '../src/config.js';
import { makePlayer } from '../src/entities.js';
import { makeWeapon } from '../src/weapons.js';
import { useSkill } from '../src/skills.js';
import { RULE_IDS } from '../src/rules.js';
import {
  SKILL_PERKS, SKILL_PERK_IDS, SKILL_CARD_WEIGHT, REGROWTH_HP_PER_SEC,
  FOCUS_MANA_MULT, FOCUS_COOLDOWN_MULT, THICK_TAKEN_MULT,
  perksOf, hasSkill, skillCardOffered, skillsHeld, skillCards, grantSkill,
  hpRegenPerSec, skillManaCost, skillCooldown, damageTakenMult, damageTaken,
  applyRegrowth,
} from '../src/perks.js';
// G21 slice 1: the empty-rewrite-slot payment rides skillCooldown (the ONE
// applied-value read), so the exact-cooldown pins below multiply by the live
// emptySlotCooldownMult(state) instead of restating a stale number.
import { emptySlotCooldownMult } from '../src/rewrites.js';
import { boot } from './_harness.mjs';
import { flashTargets, FLASH_TRASH_TIERS } from '../src/loot.js';

let pass = 0, fail = 0;
function ok(name, fn) {
  try { fn(); pass++; console.log('  ok  ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.message)); }
}
const seeded = (seed) => { let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const stateWith = (skills = null) => ({ player: { ...makePlayer(), skills: skills || {} },
  enemies: [], effects: [] });

console.log('perks (G8 step 4): the always-on family, at its real seams');

// ---- 1. the family contract --------------------------------------------------
ok('the catalog is the three perks with unique ids and player-facing labels', () => {
  assert.deepEqual(SKILL_PERK_IDS, ['regrowth', 'focus', 'thick']);
  assert.equal(new Set(SKILL_PERK_IDS).size, 3);
  for (const id of SKILL_PERK_IDS) {
    assert.ok(SKILL_PERKS[id].name, id + ' has a name');
    assert.ok(SKILL_PERKS[id].desc.startsWith('SKILL - '), id + ' desc carries the family label');
  }
});
ok('no id collides with the stat UPGRADES or the run-rule ids', () => {
  const stats = new Set(UPGRADES.map(u => u.id));
  for (const id of SKILL_PERK_IDS) {
    assert.ok(!stats.has(id), id + ' would shadow a stat card');
    assert.ok(!RULE_IDS.includes(id), id + ' would shadow a rule card');
  }
});
ok('cards exist once, at SKILL_CARD_WEIGHT, and grant through apply(player)', () => {
  const st = stateWith(null);
  assert.equal(Object.keys(st.player.skills).length, 0, 'a fresh player holds nothing');
  const cards = skillCards(st);
  assert.equal(cards.length, SKILL_PERK_IDS.length);
  for (const c of cards) {
    assert.equal(c.weight, SKILL_CARD_WEIGHT);
    assert.ok(c.id.startsWith('skill_'));
    const p = makePlayer();
    c.apply(p);
    assert.ok(p.skills[c.skill], c.skill + ' is granted by its own card');
  }
  grantSkill(st, 'thick');
  assert.equal(skillCards(st).length, SKILL_PERK_IDS.length - 1, 'a taken perk leaves the pool');
  assert.equal(skillCardOffered('thick', st), false);
  assert.deepEqual(skillsHeld(st), ['thick'], 'catalog order');
  assert.equal(grantSkill(st, 'not_a_perk'), false, 'an unknown perk id is refused');
  assert.ok(hasSkill(st, 'thick') && !hasSkill(st, 'regrowth'));
  assert.equal(perksOf({}), null, 'a stateless read is null, not a throw');
});
ok('makePlayer() ships an empty skills ledger beside rules/takenStats', () => {
  const p = makePlayer();
  assert.deepEqual(p.skills, {});
  assert.deepEqual(p.rules, {});
  assert.deepEqual(p.takenStats, {});
});

// ---- 2. the applied-value helpers' math --------------------------------------
ok('hpRegenPerSec: exactly REGROWTH_HP_PER_SEC with the perk, 0 without', () => {
  assert.equal(hpRegenPerSec(stateWith(null)), 0);
  assert.equal(hpRegenPerSec(stateWith({ regrowth: true })), REGROWTH_HP_PER_SEC);
  assert.equal(REGROWTH_HP_PER_SEC, 0.7, 'flat on purpose (not a percentage)');
});
ok('skillManaCost / skillCooldown: Focus multiplies, unknown ids cost 0', () => {
  const off = stateWith(null), on = stateWith({ focus: true });
  for (const id of Object.keys(C.SKILLS)) {
    // RETARGET (N1 slice 3): the three ults carry NO MANA key — they are
    // kill-charged and NON-mana, so there is no mana price for Focus to
    // multiply and useSkill never asks for one (it branches on KILLS first).
    // The byte-exact pool proof lives in test_ults.mjs. The COOLDOWN helper
    // still applies to them verbatim (the one-cooldown-source rule).
    if (C.SKILLS[id].MANA == null) {
      assert.ok(C.SKILLS[id].KILLS != null, id + ': a MANA-less skill must be a kill-charged ult');
    } else {
      assert.equal(skillManaCost(id, off), C.SKILLS[id].MANA);
      assert.equal(skillManaCost(id, on), C.SKILLS[id].MANA * FOCUS_MANA_MULT);
    }
    // RETARGET (G21 slice 1, C2): the empty-rewrite-slot payment multiplies
    // the COOLDOWN through the same one seam, so the exact pin is now
    // COOLDOWN [x Focus] x emptySlotCooldownMult(state) — x0.80 on these
    // zero-rewrite fixtures, x1.00 at a full house (covered in test_rewrites).
    assert.equal(skillCooldown(id, off), C.SKILLS[id].COOLDOWN * emptySlotCooldownMult(off));
    assert.equal(skillCooldown(id, on), C.SKILLS[id].COOLDOWN * FOCUS_COOLDOWN_MULT * emptySlotCooldownMult(on));
  }
  assert.equal(skillManaCost('NOPE', on), 0, 'same guard as useSkill');
  assert.equal(skillCooldown('NOPE', on), 0);
  assert.equal(FOCUS_MANA_MULT, 0.8);
  assert.equal(FOCUS_COOLDOWN_MULT, 0.85);
});
ok('damageTaken / damageTakenMult: exactly THICK_TAKEN_MULT on every amount', () => {
  const off = stateWith(null), on = stateWith({ thick: true });
  assert.equal(damageTakenMult(off), 1);
  assert.equal(damageTakenMult(on), THICK_TAKEN_MULT);
  assert.equal(THICK_TAKEN_MULT, 0.88);
  for (const amt of [0.5, 4, 13.7, 120, 9999]) {
    assert.equal(damageTaken(on, amt), amt * THICK_TAKEN_MULT);
    assert.equal(damageTaken(off, amt), amt);
  }
});
ok('applyRegrowth heals min(rate*dt, room) and reports the applied amount', () => {
  const st = stateWith({ regrowth: true });
  const p = st.player;
  p.hp = p.stats.maxHp - 10;
  assert.equal(applyRegrowth(st, 1), REGROWTH_HP_PER_SEC, 'one second heals the flat rate');
  p.hp = p.stats.maxHp - 0.1;
  assert.ok(Math.abs(applyRegrowth(st, 60) - 0.1) < 1e-9, 'capped at the missing HP, never over');
  p.hp = p.stats.maxHp;
  assert.equal(applyRegrowth(st, 1), 0, 'nothing at full HP');
  assert.equal(applyRegrowth(stateWith(null), 1), 0, 'nothing without the perk');
});

// ---- Focus at the REAL useSkill seam -----------------------------------------
ok('useSkill charges the Focus price and rolls the Focus cooldown', () => {
  for (const id of Object.keys(C.SKILLS)) {
    const off = stateWith(null), on = stateWith({ focus: true });
    // N1 slice 1: CHAIN_REACTION is the AIMED skill - an empty field REFUSES the
    // cast by design (no spend, no cooldown; test_chain_q.mjs pins that refund).
    // So the fixture parks ONE STURDY target and every catalog id is cast under
    // legal conditions. Every assertion below is the shipped one, verbatim.
    const park = () => ({ x: 40, y: 0, hp: 1e9, maxHp: 1e9, kind: 'CHASER',
      speed: 60, age: 0, flash: 0, slow: 0, xp: 0 });
    for (const st of [off, on]) { st.enemies = [park()]; st.effects = []; }
    const a = off.player, b = on.player;
    a.mana = b.mana = 999;
    // RETARGET (N1 slice 3): an ult (KILLS, no MANA key) is legal only at full
    // charge, so the fixture banks the kills — and its cast spends ZERO mana
    // in BOTH perk states (Focus has no price to discount; the byte-exact
    // pool proof lives in test_ults.mjs). The cooldown assertions below are
    // the shipped ones, verbatim, ults included.
    const isUlt = C.SKILLS[id].KILLS != null;
    if (isUlt) a.kills = b.kills = C.SKILLS[id].KILLS;
    assert.equal(useSkill(off, id), true);
    assert.equal(useSkill(on, id), true);
    if (isUlt) {
      assert.equal(a.mana, 999, id + ' left the perk-off pool untouched');
      assert.equal(b.mana, 999, id + ' left the Focus pool untouched');
    } else {
      assert.ok(Math.abs((b.mana - a.mana) - C.SKILLS[id].MANA * (1 - FOCUS_MANA_MULT)) < 1e-9,
        id + ' mana delta');
    }
    // RETARGET (G21 slice 1, C2): same empty-slot payment, same one seam —
    // the exact pins multiply by emptySlotCooldownMult(state).
    assert.equal(b.skillCd[id], C.SKILLS[id].COOLDOWN * FOCUS_COOLDOWN_MULT * emptySlotCooldownMult(on), id + ' cooldown');
    assert.equal(a.skillCd[id], C.SKILLS[id].COOLDOWN * emptySlotCooldownMult(off), 'and the perk-off run is the shipped price');
  }
});

// ---- 3 + 4. THE LIVE LOOP: dt-correct regen and the three damage paths -------
const h = await boot({ storage: [['hordes_onboarded', '1']] });
const st = h.state;
if (st.mode === 'intro') h.key('keydown', { key: 'x', preventDefault() {} });
st.player.skills = {};
h.T.startRun();
h.pump(2);
assert.equal(st.mode, 'playing', 'run live');
const p = st.player;
const quiet = () => { st.enemies.length = 0; st.enemyShots.length = 0; };

ok('REGEN IS DT-CORRECT through the live frame seam (60Hz == 120Hz == rate*t)', () => {
  const seconds = 10, want = REGROWTH_HP_PER_SEC * seconds;
  const healed = (hz) => {
    h.setFrameMs(1000 / hz);
    p.skills.regrowth = true;
    p.invuln = 999;                 // the loop's contact path must not interfere
    p.hp = p.stats.maxHp - 30;      // room for the full heal
    const before = p.hp;
    h.pump(Math.round(seconds * hz), quiet);
    p.skills.regrowth = false;
    return p.hp - before;
  };
  const at60 = healed(60), at120 = healed(120);
  assert.ok(Math.abs(at60 - want) < 0.05, `60Hz healed ${at60.toFixed(4)} vs ${want}`);
  assert.ok(Math.abs(at120 - want) < 0.05, `120Hz healed ${at120.toFixed(4)} vs ${want}`);
  assert.ok(Math.abs(at60 - at120) < 0.05, 'the rate is per-second, not per-frame');
});

// One live hostile shape the loop accepts, with hp too big to die mid-probe.
// WAVE-11 FLASH DROP hermeticity (same hazard test/test_rewrites.mjs guards):
// the flash reap (src/main.js:1635) force-zeroes EVERY FLASH_TRASH_TIERS body
// on the field on one Math.random-gated roll, which destroys a 1e9-hp
// sentinel's measurement. Probe bodies are therefore remapped OUT of the
// trash tiers. Every assertion here is a ratio (perk off vs on), so the body
// swap cancels; BRUTE is melee-only (no fireRange) and not elite.
const PROBE_BODY = 'BRUTE';   // outside loot.js FLASH_TRASH_TIERS
const hostile = (typeId, at) => ({
  typeId: FLASH_TRASH_TIERS.includes(typeId) ? PROBE_BODY : typeId,
  x: at.x, y: at.y, hp: 1e9, maxHp: 1e9,
  speed: 60, age: 0, flash: 0, slow: 0, xp: 0,
});
// DT-PROBE HERMETICITY (tick-11 sibling pin): these probes assert RATIOS, so
// a mid-window stat change cancels between the off/on passes — but nothing
// pinned the window. Each probe now pins p.stats.damage (a chest-opened
// Whetstone is x1.25, src/config.js:500) and guards that nothing extra was
// collected off the ground mid-window, so a leak fails LOUDLY instead of
// quietly skewing the ratio.
const windowPins = () => ({ dmg: p.stats.damage, potions: { ...p.potions } });
const assertWindowClean = (pin, label) => {
  assert.equal(p.stats.damage, pin.dmg, label + ': no stat leaked into the window');
  assert.deepEqual(p.potions, pin.potions, label + ': nothing extra was collected in the window');
};
// HERMETICITY - WALL CLOCK. The WAVE-11 flash drop gates on performance.now()
// (src/main.js shouldFlashDrop(..., performance.now(), state.lastFlashAt, ...)),
// so whether it fires depends on real elapsed time. When it fires it mass-kills
// SWARMER/CHASER trash, that XP levels the player up, and levelUp() grows
// p.stats.maxHp AND heals p.hp - while every probe below measures its loss as
// (maxHp - hp). A level-up inside the probe frame therefore moves both ends of
// that subtraction and reads 0.00 damage, which is how this test flaked at
// ~10% (measured 3/30 here; 0/30 with the clock frozen). The harness drives dt
// itself via setFrameMs, so freezing performance.now() only removes the
// wall-clock input from game logic - assertions are unchanged.
const frozenClock = (fn) => {
  const real = performance.now;
  const fixed = real.call(performance);
  Object.defineProperty(performance, 'now', { configurable: true, value: () => fixed });
  try { return fn(); } finally {
    Object.defineProperty(performance, 'now', { configurable: true, value: real });
  }
};
const contactLoss = () => {
  quiet();
  p.hp = p.stats.maxHp; p.invuln = 0;
  const pin = windowPins();
  st.enemies.push(hostile('CHASER', p));
  assert.deepEqual(flashTargets(st.enemies), [],
    'the contact probe field holds nothing the flash drop can reap');
  frozenClock(() => h.pump(1, quiet));
  assertWindowClean(pin, 'contact probe');
  return p.stats.maxHp - p.hp;
};
const shotLoss = () => {
  quiet();
  p.hp = p.stats.maxHp; p.invuln = 0;
  const pin = windowPins();
  st.enemyShots.push({ x: p.x, y: p.y, vx: 0, vy: 0, damage: 20, age: 0, kind: 'spit', src: {} });
  frozenClock(() => h.pump(1, quiet));
  assertWindowClean(pin, 'shot probe');
  return p.stats.maxHp - p.hp;
};
const drainLoss = (frames = 30) => {
  quiet();
  p.hp = p.stats.maxHp; p.invuln = 999;   // the drain ignores invuln by design
  const pin = windowPins();
  st.enemies.push(hostile('TICK', p));    // latches inside attachDist and bleeds
  frozenClock(() => h.pump(frames, quiet));
  assertWindowClean(pin, 'drain probe');
  return p.stats.maxHp - p.hp;
};
ok('THICK SKIN funnels the CONTACT path (live loop, ratio exact)', () => {
  p.skills.thick = false;
  const off = contactLoss();
  p.skills.thick = true;
  const on = contactLoss();
  p.skills.thick = false;
  assert.ok(off > 0, `the control hit landed (${off.toFixed(2)} hp)`);
  assert.ok(Math.abs(on / off - THICK_TAKEN_MULT) < 0.01,
    `contact ${off.toFixed(2)} -> ${on.toFixed(2)} (x${(on / off).toFixed(4)})`);
});
ok('THICK SKIN funnels the SHOT path (live loop, ratio exact)', () => {
  p.skills.thick = false;
  const off = shotLoss();
  p.skills.thick = true;
  const on = shotLoss();
  p.skills.thick = false;
  assert.ok(off > 0, `the control shot landed (${off.toFixed(2)} hp)`);
  assert.ok(Math.abs(on / off - THICK_TAKEN_MULT) < 0.01,
    `shot ${off.toFixed(2)} -> ${on.toFixed(2)} (x${(on / off).toFixed(4)})`);
});
ok('THICK SKIN funnels the TICK DRAIN path (live loop, ratio exact)', () => {
  p.skills.thick = false;
  const off = drainLoss();
  p.skills.thick = true;
  const on = drainLoss();
  p.skills.thick = false;
  assert.ok(off > 0, `the control drain bled (${off.toFixed(2)} hp)`);
  assert.ok(Math.abs(on / off - THICK_TAKEN_MULT) < 0.01,
    `drain ${off.toFixed(2)} -> ${on.toFixed(2)} (x${(on / off).toFixed(4)})`);
});

// ---- 5. THE REAL DRAFT SEAM: src/main.js openDraft ----------------------------
function draftOffer(label, setup, draws = 3000) {
  st.weapons = ['VOLLEY', 'BOOMERANG'].map(makeWeapon);
  st.player.rules = {}; st.player.takenStats = {}; st.player.skills = {};
  setup(st);
  const real = Math.random;
  Math.random = seeded(4711);
  let hits = 0, cards = 0;
  try {
    for (let i = 0; i < draws; i++) {
      h.T.openDraft();
      const els = Array.from(h.elements['ov-cards'].children);
      cards += els.length;
      if (els.some(el => (el.innerHTML || '').includes(label))) hits++;
    }
  } finally {
    Math.random = real;
    st.player.rules = {}; st.player.takenStats = {}; st.player.skills = {};
  }
  assert.equal(cards, draws * 3, 'every openDraft() rendered exactly 3 cards');
  return hits / draws;
}
const regrowthFree = draftOffer('Regrowth', () => {});
const regrowthHeld = draftOffer('Regrowth', (s) => { s.player.skills.regrowth = true; });
const thickFree = draftOffer('Thick Skin', () => {});
console.log('perks: the REAL game seam (src/main.js openDraft), measured');
console.log(`    Regrowth offered  not held ${regrowthFree.toFixed(4)}   already held ${regrowthHeld.toFixed(4)}`);
console.log(`    Thick Skin offered not held ${thickFree.toFixed(4)}`);
ok('openDraft() offers a skill card until the run takes it', () => {
  assert.ok(regrowthFree > 0, `a skill card reaches the real draft (${regrowthFree.toFixed(4)})`);
  assert.equal(regrowthHeld, 0, 'a held perk is never re-offered');
  assert.ok(thickFree > 0, `a second perk reaches it too (${thickFree.toFixed(4)})`);
});
ok('pick() grants the perk through the real draft contract, no stat-ledger pollution', () => {
  st.player.skills = {}; st.player.takenStats = {};
  const card = skillCards({ player: st.player })[0];
  const before = { ...st.player.takenStats };
  h.T.pickCard(card);
  assert.ok(st.player.skills[card.skill], card.skill + ' granted by the real pick()');
  assert.deepEqual(st.player.takenStats, before, 'a skill pick never writes the once ledger');
  assert.equal(skillCardOffered(card.skill, st), false, 'and it left the pool');
});

console.log(`perks: PASS=${pass} FAIL=${fail}`);
process.exit(fail === 0 ? 0 : 1);
