// HORDES — the three MANA shop buyables (N1b item 6: "mana weapons should be
// somewhat punishing... We make up with buyables in the shop, not balance
// changes"). Thrifty Casting / Deep Well / Siphon are the relief valve; every
// base mana number stays as it is.
//
// What is proven here:
//   1. the three rows exist in SHOP_UPGRADES with sane economy shape, plain
//      English (no emojis), and buyUpgrade() levels them like any row;
//   2. level 0 is NEUTRAL — an unowned profile reads the defaults exactly;
//   3. level N is the documented number (thrifty L3 = 0.7, well L2 = +50,
//      siphon L4 = 0.2/kill) through the REAL run-start stat chain;
//   4. thrifty composes MULTIPLICATIVELY with the Witch's 0.5 through the ONE
//      manaCostMult number — and BOTH cost seams read it (weaponManaCost and
//      skillManaCost): a Witch with Thrifty L3 pays ZAP 4 x 0.5 x 0.7;
//   5. well's +maxMana lands BEFORE applyCharacter, so the Witch's +50 still
//      stacks on top of it exactly as it stacks on the base pool;
//   6. siphon grants mana per KILL (an event), never per frame: an idle frame
//      grants nothing, the grant clamps at maxMana, and a 60Hz vs 120Hz replay
//      over the same scripted kills totals the SAME mana;
//   7. the stats are not pilot-gated: AUTO and MANUAL benefit identically.
// Run: node test/test_shop_mana.mjs
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';
import { CONFIG as C } from '../src/config.js';
import { SHOP_UPGRADES, SHOP_BY_ID, buyUpgrade } from '../src/meta.js';
import { weaponManaCost } from '../src/weapons.js';
import { initWeather, mods as weatherMods } from '../src/weather.js';
import { skillManaCost } from '../src/perks.js';

const S = suite('SHOP MANA BUYABLES');
const h = await boot();
const st = h.state;
const T = h.T;

const row = (id) => SHOP_BY_ID[id];
const sane = (r) => {
  assert.ok(r, 'row exists');
  assert.ok(r.baseCost > 0, 'baseCost positive');
  assert.ok(r.costGrowth > 1, 'costGrowth > 1');
  assert.ok(r.maxLevel >= 1, 'maxLevel >= 1');
  assert.ok(r.perLevel > 0, 'perLevel positive');
  assert.ok(!/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(r.name + r.desc),
    'no emojis in the player-facing strings');
};

// A BRUTE corpse (outside the flash trash tiers, not chest-eligible — the
// test_rewrites probe-body rules) that dies in the REAL death pass.
const corpse = () => ({
  typeId: 'BRUTE', x: st.player.x + 30, y: st.player.y, hp: 0, maxHp: 1,
  speed: 0, age: 0, flash: 0, slow: 0, xp: 0,
});

// ============================================================================
S.check('the three rows exist with a sane economy shape', () => {
  for (const id of ['thrifty', 'well', 'siphon']) sane(row(id));
  assert.equal(row('thrifty').name, 'Thrifty Casting');
  assert.equal(row('well').name, 'Deep Well');
  assert.equal(row('siphon').name, 'Siphon');
  // Total cost of each full line, priced against the neighbours the brief
  // names (regen totals ~1851g) and the class ladder (Rogue 2500 / Witch 9000):
  // every line maxes for less than the Witch costs.
  const total = (id) => {
    const r = row(id); let sum = 0;
    for (let l = 0; l < r.maxLevel; l++) {
      sum += Math.round(r.baseCost * Math.pow(r.costGrowth, l));
    }
    return sum;
  };
  for (const id of ['thrifty', 'well', 'siphon']) {
    assert.ok(total(id) < 9000, id + ' full line (' + total(id) + 'g) costs less than the Witch (9000g)');
    assert.ok(total(id) > total('regen'), id + ' is pricier than the regen neighbour (relief valve, not a gift)');
  }
  // And buyUpgrade drives them like any classic row.
  const prof = { gold: 1e9, purchased: {}, unlockedWeapons: [], unlockedCharacters: ['KNIGHT'] };
  assert.equal(buyUpgrade(prof, 'thrifty'), true, 'thrifty buys');
  assert.equal(buyUpgrade(prof, 'thrifty'), true, 'twice');
  assert.equal(prof.purchased.thrifty, 2, 'the level is tracked');
  assert.ok(prof.gold < 1e9, 'gold was spent');
});

// ============================================================================
S.check('level 0 is NEUTRAL — an unowned run reads the defaults exactly', () => {
  const prof = T.getProfile();
  const had = prof.purchased.thrifty || 0;
  const hadW = prof.purchased.well || 0;
  const hadS = prof.purchased.siphon || 0;
  try {
    delete prof.purchased.thrifty; delete prof.purchased.well; delete prof.purchased.siphon;
    T.startRun();
    const p = st.player;
    assert.equal(p.stats.manaCostMult, 1, 'no discount unowned');
    assert.equal(p.stats.manaOnKill, 0, 'no kill income unowned');
    assert.equal(p.stats.maxMana, C.MANA.MAX, 'the base pool is untouched (100)');
    assert.equal(weaponManaCost('ZAP', st), 4, 'ZAP still costs a Knight 4');
    assert.equal(skillManaCost('FROST_NOVA', st), 30, 'FROST_NOVA still costs 30');
    assert.equal(skillManaCost('OVERCHARGE', st), 25, 'OVERCHARGE still costs 25');
  } finally {
    if (had) prof.purchased.thrifty = had;
    if (hadW) prof.purchased.well = hadW;
    if (hadS) prof.purchased.siphon = hadS;
  }
});

// ============================================================================
S.check('level N is the documented number, through the real stat chain', () => {
  const prof = T.getProfile();
  const restore = { t: prof.purchased.thrifty, w: prof.purchased.well, s: prof.purchased.siphon };
  try {
    prof.purchased.thrifty = 3;
    prof.purchased.well = 2;
    prof.purchased.siphon = 4;
    T.startRun();
    const p = st.player;
    assert.ok(Math.abs(p.stats.manaCostMult - (1 - 0.10 * 3)) < 1e-9,
      'thrifty L3 = 0.7 (got ' + p.stats.manaCostMult + ')');
    assert.equal(p.stats.maxMana, C.MANA.MAX + 25 * 2,
      'well L2 = +50 max mana (got ' + p.stats.maxMana + ')');
    assert.ok(Math.abs(p.stats.manaOnKill - 0.05 * 4) < 1e-9,
      'siphon L4 = 0.2 mana per kill (got ' + p.stats.manaOnKill + ')');
    // The weapon seam reads the same number: a Knight with Thrifty L3 pays
    // ZAP 4 x 0.7.
    assert.ok(Math.abs(weaponManaCost('ZAP', st) - 4 * 0.7) < 1e-9,
      'Knight + thrifty L3 pays ZAP 2.8 (got ' + weaponManaCost('ZAP', st) + ')');
    assert.ok(Math.abs(skillManaCost('FROST_NOVA', st) - 30 * 0.7) < 1e-9,
      'and FROST_NOVA 21 (got ' + skillManaCost('FROST_NOVA', st) + ')');
  } finally {
    for (const [k, v] of Object.entries(restore)) {
      if (v) prof.purchased[k] = v; else delete prof.purchased[k];
    }
  }
});

// ============================================================================
S.check('thrifty composes MULTIPLICATIVELY with the Witch 0.5, on BOTH seams', () => {
  const prof = T.getProfile();
  const restore = { eq: prof.equippedCharacter, unlocked: prof.unlockedCharacters.slice(),
    weapons: prof.unlockedWeapons.slice(), t: prof.purchased.thrifty, w: prof.purchased.well };
  try {
    if (!prof.unlockedCharacters.includes('WITCH')) prof.unlockedCharacters.push('WITCH');
    prof.equippedCharacter = 'WITCH';
    if (!prof.unlockedWeapons.includes('ZAP')) prof.unlockedWeapons.push('ZAP');
    prof.purchased.thrifty = 3;
    prof.purchased.well = 2;
    T.startRun();
    const p = st.player;
    // THE PRODUCT, not a sum: meta 0.7 x character 0.5.
    assert.ok(Math.abs(p.stats.manaCostMult - 0.7 * 0.5) < 1e-9,
      'the mults multiply (0.7 x 0.5 = 0.35, got ' + p.stats.manaCostMult + ')');
    assert.ok(Math.abs(weaponManaCost('ZAP', st) - 4 * 0.5 * 0.7) < 1e-9,
      'a Witch with Thrifty L3 pays ZAP 4 x 0.5 x 0.7 = 1.4 (got ' + weaponManaCost('ZAP', st) + ')');
    assert.ok(Math.abs(skillManaCost('FROST_NOVA', st) - 30 * 0.5 * 0.7) < 1e-9,
      'the skill seam reads the same number: 10.5 (got ' + skillManaCost('FROST_NOVA', st) + ')');
    assert.ok(Math.abs(skillManaCost('OVERCHARGE', st) - 25 * 0.5 * 0.7) < 1e-9,
      'OVERCHARGE too: 8.75 (got ' + skillManaCost('OVERCHARGE', st) + ')');
    // well lands BEFORE the character mod: base 100 + well 50 + Witch 50 = 200.
    assert.equal(p.stats.maxMana, C.MANA.MAX + 25 * 2 + 50,
      "well stacks under the Witch's own +50 (got " + p.stats.maxMana + ')');
  } finally {
    prof.equippedCharacter = restore.eq;
    prof.unlockedCharacters = restore.unlocked;
    prof.unlockedWeapons = restore.weapons;
    if (restore.t) prof.purchased.thrifty = restore.t; else delete prof.purchased.thrifty;
    if (restore.w) prof.purchased.well = restore.w; else delete prof.purchased.well;
    T.startRun();
  }
});

// ============================================================================
S.check('siphon grants mana per KILL, never per frame', () => {
  const prof = T.getProfile();
  const had = prof.purchased.siphon || 0;
  const quiet = () => {
    st.spawnTimer = st.time + 1e9;
    st.wave.endsAt = st.time + 1e9;
    st.wave.midAt = st.time + 1e9;
    st.enemies.length = 0;
    st.drops.length = 0;
    if (st.wave.bosses) st.wave.bosses.length = 0;
    if (st.wave.midBosses) st.wave.midBosses.length = 0;
    st.wave.boss = null;
  };
  try {
    prof.purchased.siphon = 1;          // 0.05 per kill
    T.startRun();
    T.setPilotMode('MANUAL');           // stats are not pilot-gated, but MANUAL
    h.pump(2, quiet); quiet();          // keeps the cast/drink hands out
    const p = st.player;
    p.stats.dropBonus = -1;             // no drop rolls off probe corpses
    p.mana = 0;
    // (a) an idle frame grants NOTHING (a kill is the only event that pays).
    const before = p.mana;
    h.pump(3, quiet);
    assert.ok(p.mana > before + 1e-9, 'regen still ticks (the pool is not frozen)');
    p.mana = 0;
    const idle = p.mana;
    // Regen muddies the read, so freeze it for the exact numbers: park the
    // pool at 0 and compare a frame WITH a kill against the per-second drip.
    // Simplest exact read: grant-per-kill = (kills delta mana) minus (regen
    // over the same frames, measured on an identical kill-less pass).
    const dtFrame = C.MANA.REGEN / 60;  // regen per 60Hz frame
    h.pump(1, quiet);
    const regenOne = p.mana - idle;     // one idle frame's drip (~dt)
    // (b) one corpse, one frame: the grant is exactly manaOnKill on top of it.
    p.mana = 0;
    st.enemies.push(corpse());
    h.pump(1, quiet);
    assert.ok(Math.abs(p.mana - (0.05 + regenOne)) < 1e-6,
      'one kill pays exactly manaOnKill + the frame drip (got ' + p.mana + ')');
    assert.equal(p.kills, 1, 'and it was a real kill through the death pass');
    // (c) the grant clamps at maxMana.
    p.mana = p.stats.maxMana - 0.01;
    st.enemies.push(corpse());
    h.pump(1, quiet);
    assert.ok(p.mana <= p.stats.maxMana, 'never above maxMana');
    assert.equal(p.mana, p.stats.maxMana, 'clamped AT maxMana (got ' + p.mana + ')');
  } finally {
    if (had) prof.purchased.siphon = had; else delete prof.purchased.siphon;
    T.startRun();
  }
});

// ============================================================================
S.check('60Hz and 120Hz pay the SAME siphon over the same scripted kills', () => {
  const prof = T.getProfile();
  const had = prof.purchased.siphon || 0;
  const quiet = () => {
    st.spawnTimer = st.time + 1e9;
    st.wave.endsAt = st.time + 1e9;
    st.wave.midAt = st.time + 1e9;
    st.enemies.length = 0;
    st.drops.length = 0;
  };
  const pass = (hz) => {
    prof.purchased.siphon = 2;          // 0.10 per kill
    // DETERMINISM: T.startRun() rolls a RANDOM weather (main.js:3666) and MOONLIGHT
    // grants +0.5/s of mana, which this probe would read as siphon income and fail on.
    // Pin CLEAR here; the MOONLIGHT side gets its own check at the end of the file.
    st.weather = initWeather('CLEAR', 7);
    T.startRun();
    T.setPilotMode('MANUAL');
    h.setFrameMs(1000 / hz);
    h.pump(2, quiet); quiet();
    const p = st.player;
    p.stats.dropBonus = -1;
    p.mana = 0;
    const frames = 20;
    for (let k = 0; k < frames; k++) {
      st.enemies.push(corpse());
      h.pump(1, quiet);                 // one kill per frame, at this rate
    }
    // The base regen drip (0.5/s, dt-correct by design — stats.manaRegen only
    // carries the meta BONUS, the base flows from the constant) rides along
    // at frames x dt. Subtract it exactly: what remains is the KILL income.
    const drip = (C.MANA.REGEN + (weatherMods(st.weather).manaRegenFlat || 0)) * frames * (1 / hz);
    const got = p.mana - drip;
    h.setFrameMs(1000 / 60);            // restore the default tick
    return got;
  };
  try {
    const at60 = pass(60);
    const at120 = pass(120);
    assert.ok(Math.abs(at60 - 20 * 0.10) < 1e-6,
      '60Hz: 20 kills pay exactly 2.0 of siphon (got ' + at60 + ')');
    assert.ok(Math.abs(at120 - 20 * 0.10) < 1e-6,
      '120Hz: 20 kills pay exactly 2.0 of siphon (got ' + at120 + ')');
    assert.ok(Math.abs(at60 - at120) < 1e-6, 'nothing counts frames');
  } finally {
    h.setFrameMs(1000 / 60);
    if (had) prof.purchased.siphon = had; else delete prof.purchased.siphon;
    T.startRun();
  }
});

// ============================================================================
S.check('the stats are not pilot-gated: AUTO benefits identically', () => {
  const prof = T.getProfile();
  const had = prof.purchased.siphon || 0;
  const quiet = () => {
    st.spawnTimer = st.time + 1e9;
    st.wave.endsAt = st.time + 1e9;
    st.wave.midAt = st.time + 1e9;
    st.enemies.length = 0;
    st.drops.length = 0;
  };
  try {
    prof.purchased.siphon = 4;          // 0.2 per kill
    T.startRun();
    T.setPilotMode('AUTO');             // the mode the cohorts run in
    st.weather = initWeather('CLEAR', 7);   // deterministic: no weather mana grant
    h.pump(2, quiet); quiet();
    const p = st.player;
    // Quiet the cast/drink hands so the grant is the only mover: skills on
    // cooldown, no potions, regen frozen.
    for (const id in p.skillCd) p.skillCd[id] = 1e9;
    p.potions.hp = 0; p.potions.mp = 0;
    p.stats.dropBonus = -1;
    p.stats.manaRegen = 0;
    p.mana = 0;
    st.enemies.push(corpse());
    h.pump(1, quiet);
    assert.ok(Math.abs(p.mana - (0.2 + C.MANA.REGEN / 60)) < 1e-9,
      'an AUTO kill pays the same 0.2 (+ the frame drip, got ' + p.mana + ')');
  } finally {
    if (had) prof.purchased.siphon = had; else delete prof.purchased.siphon;
    T.startRun();
  }
});


// ============================================================================
// The 60/120 probe above pins CLEAR weather so its read is deterministic. This
// check pins the OTHER side, because that is how this test first failed: a run
// that rolled MOONLIGHT was read as if the weather's +0.5/s trickle were siphon
// income (measured 2.0833 at 120Hz vs the 2.0 bar). With MOONLIGHT forced, the
// two rates must still pay the SAME kill income and the flat grant must scale
// with dt — i.e. nothing in the mana path counts frames.
S.check('MOONLIGHT active: 20 scripted kills pay the same siphon at 60Hz and 120Hz', () => {
  const prof = T.getProfile();
  const had = prof.purchased.siphon || 0;
  const quiet = () => {
    st.spawnTimer = st.time + 1e9;
    st.wave.endsAt = st.time + 1e9;
    st.wave.midAt = st.time + 1e9;
    st.enemies.length = 0;
    st.drops.length = 0;
  };
  const pass = (hz) => {
    prof.purchased.siphon = 2;                 // 0.10 per kill
    T.startRun();
    T.setPilotMode('MANUAL');
    st.weather = initWeather('MOONLIGHT', 7);  // the polluting field event, forced
    h.setFrameMs(1000 / hz);
    h.pump(2, quiet); quiet();
    const p = st.player;
    p.stats.dropBonus = -1;
    p.stats.manaRegen = C.MANA.REGEN;          // no Mana Spring riding along
    p.mana = 0;
    const frames = 20;
    for (let k = 0; k < frames; k++) {
      st.enemies.push(corpse());
      h.pump(1, quiet);
    }
    const wFlat = weatherMods(st.weather).manaRegenFlat || 0;
    const drip = (C.MANA.REGEN + wFlat) * frames * (1 / hz);
    h.setFrameMs(1000 / 60);
    return { siphon: p.mana - drip, wFlat };
  };
  try {
    const a = pass(60);
    const b = pass(120);
    assert.equal(a.wFlat, 0.5, 'MOONLIGHT really does grant +0.5/s (the probe is not a no-op)');
    assert.ok(Math.abs(a.siphon - 2.0) < 1e-6,
      '60Hz with MOONLIGHT: 20 kills pay 2.0 of siphon (got ' + a.siphon + ')');
    assert.ok(Math.abs(b.siphon - 2.0) < 1e-6,
      '120Hz with MOONLIGHT: 20 kills pay 2.0 of siphon (got ' + b.siphon + ')');
    assert.ok(Math.abs(a.siphon - b.siphon) < 1e-6, 'the kill grant is frame-free at both rates');
  } finally {
    h.setFrameMs(1000 / 60);
    st.weather = initWeather('CLEAR', 7);
    if (had) prof.purchased.siphon = had; else delete prof.purchased.siphon;
    T.startRun();
  }
});
S.done();
