// HORDES — the three MANA shop rows: Mana Spring (regen), Deep Well (pool) and
// Thrifty Casting (cost). Every number is read from the live row.
//
// What is proven here:
//   1. the three rows exist in SHOP_UPGRADES with sane economy shape, plain
//      English (no emojis), and buyUpgrade() levels them like any row;
//   2. level 0 is NEUTRAL — an unowned profile reads the defaults exactly;
//   3. level N is perLevel x N through the REAL run-start stat chain, and a
//      maxed Thrifty line stops at its documented floor;
//   4. thrifty composes MULTIPLICATIVELY with the Witch's 0.5 through the ONE
//      manaCostMult number — and BOTH cost seams read it (weaponManaCost and
//      skillManaCost);
//   5. well's +maxMana lands BEFORE applyCharacter, so the Witch's +50 still
//      stacks on top of it exactly as it stacks on the base pool;
//   6. Mana Spring is a per-SECOND rate: 60Hz and 120Hz fill the same pool
//      over the same time.
// Run: node test/test_shop_mana.mjs
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';
import { CONFIG as C } from '../src/config.js';
import { SHOP_BY_ID, buyUpgrade } from '../src/meta.js';
import { weaponManaCost } from '../src/weapons.js';
import { initWeather } from '../src/weather.js';
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

// ============================================================================
S.check('the three rows exist with a sane economy shape', () => {
  for (const id of ['regen', 'well', 'thrifty']) sane(row(id));
  assert.equal(row('regen').name, 'Mana Spring');
  assert.equal(row('well').name, 'Deep Well');
  assert.equal(row('thrifty').name, 'Thrifty Casting');
  for (const gone of ['siphon', 'aethertap', 'deepfont']) assert.equal(row(gone), undefined, gone + ' is retired');
  // buyUpgrade drives them like any classic row.
  const prof = { gold: 1e9, purchased: {}, unlockedWeapons: [], unlockedCharacters: ['KNIGHT'] };
  assert.equal(buyUpgrade(prof, 'thrifty'), true, 'thrifty buys');
  assert.equal(buyUpgrade(prof, 'thrifty'), true, 'twice');
  assert.equal(prof.purchased.thrifty, 2, 'the level is tracked');
  assert.ok(prof.gold < 1e9, 'gold was spent');
});

// ============================================================================
S.check('level 0 is NEUTRAL — an unowned run reads the defaults exactly', () => {
  const prof = T.getProfile();
  const ids = ['thrifty', 'well', 'regen'];
  const had = Object.fromEntries(ids.map(id => [id, prof.purchased[id] || 0]));
  try {
    for (const id of ids) delete prof.purchased[id];
    T.startRun();
    const p = st.player;
    assert.equal(p.stats.manaCostMult, 1, 'no discount unowned');
    assert.equal(p.stats.manaOnKill, 0, 'no kill income (the shop never grants it)');
    assert.equal(p.stats.maxMana, C.MANA.MAX, 'the base pool is untouched');
    assert.equal(p.stats.manaRegen, C.MANA.REGEN, 'the base regen is untouched');
    assert.equal(weaponManaCost('ZAP', st), 4, 'ZAP still costs a Knight 4');
    assert.equal(skillManaCost('FROST_NOVA', st), 30, 'FROST_NOVA still costs 30');
    assert.equal(skillManaCost('OVERCHARGE', st), 25, 'OVERCHARGE still costs 25');
  } finally {
    for (const id of ids) if (had[id]) prof.purchased[id] = had[id];
  }
});

// ============================================================================
S.check('level N is the documented number, through the real stat chain', () => {
  const prof = T.getProfile();
  const restore = { thrifty: prof.purchased.thrifty, well: prof.purchased.well, regen: prof.purchased.regen };
  try {
    prof.purchased.thrifty = 3;
    prof.purchased.well = 2;
    prof.purchased.regen = row('regen').maxLevel;
    T.startRun();
    const p = st.player;
    const mult = 1 - row('thrifty').perLevel * 3;
    assert.ok(Math.abs(p.stats.manaCostMult - mult) < 1e-9,
      'thrifty L3 = 1 - perLevel x 3 (got ' + p.stats.manaCostMult + ')');
    assert.equal(p.stats.maxMana, C.MANA.MAX + row('well').perLevel * 2,
      'well L2 = +2 x perLevel max mana (got ' + p.stats.maxMana + ')');
    assert.equal(p.stats.manaRegen, C.MANA.REGEN + row('regen').perLevel * row('regen').maxLevel,
      'a maxed Mana Spring adds perLevel x maxLevel regen (got ' + p.stats.manaRegen + ')');
    // Both cost seams read the same number.
    assert.ok(Math.abs(weaponManaCost('ZAP', st) - 4 * mult) < 1e-9,
      'Knight + thrifty L3 pays ZAP 4 x mult (got ' + weaponManaCost('ZAP', st) + ')');
    assert.ok(Math.abs(skillManaCost('FROST_NOVA', st) - 30 * mult) < 1e-9,
      'and FROST_NOVA 30 x mult (got ' + skillManaCost('FROST_NOVA', st) + ')');
    // The full line is the documented cap: -40%.
    prof.purchased.thrifty = row('thrifty').maxLevel;
    T.startRun();
    assert.ok(Math.abs(st.player.stats.manaCostMult - 0.6) < 1e-9,
      'a maxed Thrifty line is -40% (got ' + st.player.stats.manaCostMult + ')');
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
    // THE PRODUCT, not a sum: meta (1 - perLevel x 3) x character 0.5.
    const mult = (1 - row('thrifty').perLevel * 3) * 0.5;
    assert.ok(Math.abs(p.stats.manaCostMult - mult) < 1e-9,
      'the mults multiply (got ' + p.stats.manaCostMult + ')');
    assert.ok(Math.abs(weaponManaCost('ZAP', st) - 4 * mult) < 1e-9,
      'a Witch with Thrifty L3 pays ZAP 4 x 0.5 x thrifty (got ' + weaponManaCost('ZAP', st) + ')');
    assert.ok(Math.abs(skillManaCost('FROST_NOVA', st) - 30 * mult) < 1e-9,
      'the skill seam reads the same number (got ' + skillManaCost('FROST_NOVA', st) + ')');
    assert.ok(Math.abs(skillManaCost('OVERCHARGE', st) - 25 * mult) < 1e-9,
      'OVERCHARGE too (got ' + skillManaCost('OVERCHARGE', st) + ')');
    // well lands BEFORE the character mod: base + well + the Witch's 50.
    assert.equal(p.stats.maxMana, C.MANA.MAX + row('well').perLevel * 2 + 50,
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
S.check('Mana Spring is a per-second rate: 60Hz and 120Hz fill the same pool', () => {
  const prof = T.getProfile();
  const had = prof.purchased.regen || 0;
  const quiet = () => {
    st.spawnTimer = st.time + 1e9;
    st.wave.endsAt = st.time + 1e9;
    st.wave.midAt = st.time + 1e9;
    st.enemies.length = 0;
    st.drops.length = 0;
  };
  const LVL = 2;
  const rate = C.MANA.REGEN + row('regen').perLevel * LVL;
  const pass = (hz) => {
    prof.purchased.regen = LVL;
    // startRun rolls a random weather and MOONLIGHT adds a flat mana grant: pin CLEAR.
    st.weather = initWeather('CLEAR', 7);
    T.startRun();
    T.setPilotMode('MANUAL');
    st.weather = initWeather('CLEAR', 7);
    h.setFrameMs(1000 / hz);
    h.pump(2, quiet); quiet();
    const p = st.player;
    assert.equal(p.stats.manaRegen, rate, 'the stat is base + perLevel x level');
    p.mana = 0;
    h.pump(hz / 2, quiet);              // half a second at this rate
    h.setFrameMs(1000 / 60);
    return p.mana;
  };
  try {
    const at60 = pass(60);
    const at120 = pass(120);
    assert.ok(Math.abs(at60 - rate * 0.5) < 1e-6, '60Hz: half a second fills rate/2 (got ' + at60 + ')');
    assert.ok(Math.abs(at120 - rate * 0.5) < 1e-6, '120Hz: half a second fills rate/2 (got ' + at120 + ')');
  } finally {
    h.setFrameMs(1000 / 60);
    if (had) prof.purchased.regen = had; else delete prof.purchased.regen;
    T.startRun();
  }
});
S.done();
