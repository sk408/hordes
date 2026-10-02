// M3 / M1 follow-up: weapon mastery. Every weapon bought beyond the starters
// and every weapon slot bought is one mastery rank: +HP_PER_RANK max HP, and
// every RANKS_PER_LEVEL ranks start a run's weapons one level higher.
import assert from 'node:assert/strict';
import { boot } from './_harness.mjs';
import * as META from '../src/meta.js';

const { MASTERY, masteryRank, masteryHp, masteryStartLevels, applyMastery, makeProfile, buyUpgrade, SHOP_BY_ID } = META;

// Pure rule.
{
  const p = makeProfile();
  assert.equal(masteryRank(p), 0, 'a fresh profile has no mastery (the starters do not count)');
  assert.equal(applyMastery({ maxHp: 90 }, p).maxHp, 90);
  p.gold = 1e6;
  assert.ok(buyUpgrade(p, 'weapon_orbit'));
  assert.equal(masteryRank(p), 1);
  assert.equal(masteryHp(p), MASTERY.HP_PER_RANK);
  assert.equal(masteryStartLevels(p), 0, 'one rank is not yet a start level');
  assert.ok(buyUpgrade(p, 'slots'));
  assert.equal(masteryRank(p), 2, 'a slot is a rank too');
  assert.equal(masteryStartLevels(p), 1);
  for (const id of Object.keys(META.WEAPON_PRICES)) buyUpgrade(p, 'weapon_' + id.toLowerCase());
  buyUpgrade(p, 'slots'); buyUpgrade(p, 'slots');
  assert.equal(masteryRank(p), Object.keys(META.WEAPON_PRICES).length + 3);
  assert.equal(masteryStartLevels(p), MASTERY.MAX_START_LEVELS, 'the start-level bonus is capped');
  p.unlockedWeapons.push('NOT_A_WEAPON');
  assert.equal(masteryRank(p), Object.keys(META.WEAPON_PRICES).length + 3, 'unknown ids never count');
}
// The shop rows say what the purchase gives.
assert.match(SHOP_BY_ID.weapon_orbit.desc, /Mastery \+1: \+\d+ max HP/);
assert.match(SHOP_BY_ID.slots.desc, /Mastery \+1: \+\d+ max HP/);

// A real run start applies it.
const h = await boot();
const T = h.T, st = T.state;
T.startRun(); h.pump(2);
const hp0 = st.player.stats.maxHp;
assert.ok(st.weapons.every(w => w.level === 1), 'no mastery: weapons start at level 1');
const prof = T.getProfile();
prof.unlockedWeapons.push('ORBIT', 'SCYTHE');
T.startRun(); h.pump(2);
assert.equal(st.player.stats.maxHp, hp0 + 2 * MASTERY.HP_PER_RANK, 'two weapons bought: +2 ranks of max HP');
assert.equal(st.player.hp, st.player.stats.maxHp, 'the run starts at full HP');
assert.ok(st.weapons.length >= 2 && st.weapons.every(w => w.level === 2), 'two ranks: every weapon starts at level 2');
console.log('test_m3_mastery: ok');
process.exit(0);
