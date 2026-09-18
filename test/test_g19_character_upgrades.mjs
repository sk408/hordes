// HORDES — G19 SLICE 1: PER-CHARACTER UPGRADES (the table, the buy path, the
// pure applicator). Everything PRINTS (ladders, before/after, isolation
// numbers) because the brief's acceptance A asks for the raw figures, not a
// summary. Companion browser proof: tools/verify_g19_characters.mjs.
// Run: node test/test_g19_character_upgrades.mjs (exit 0 = pass)
import assert from 'node:assert';
import {
  PROFILE_VERSION, makeProfile, saveProfile, loadProfile,
  CHARACTERS, CHARACTER_UPGRADES, CHARACTER_UPGRADE_BY_ID,
  upgradeCost, buyCharacterUpgrade, unlockCharacter,
  applyMetaBonuses, applyCharacter, applyCharacterUpgrades,
  getCharacterUpgradeLevel, characterPotionBonus, startPotionCount,
} from '../src/meta.js';
import { makePlayer } from '../src/entities.js';

let failed = 0;
function ok(cond, msg) {
  if (cond) { console.log('  PASS ' + msg); }
  else { failed++; console.error('  FAIL ' + msg); }
}

const baseStats = () => ({ ...makePlayer().stats });   // the run seam's own base

// =====================================================================
console.log('THE 8-ROW TABLE, WITH FULL PRICE LADDERS:');
const SHAPE = ['id', 'characterId', 'name', 'desc', 'baseCost', 'costGrowth', 'maxLevel', 'perLevel'];
{
  ok(CHARACTER_UPGRADES.length === 8, `the table has 8 rows (got ${CHARACTER_UPGRADES.length})`);
  const perChar = {};
  const seenIds = new Set();
  let totalsOk = true;
  for (const u of CHARACTER_UPGRADES) {
    assert.deepStrictEqual(Object.keys(u).sort(), [...SHAPE].sort(),
      `row ${u.id} shape must be exactly { id, characterId, name, desc, baseCost, costGrowth, maxLevel, perLevel }`);
    perChar[u.characterId] = (perChar[u.characterId] || 0) + 1;
    if (seenIds.has(u.id)) failed++;
    seenIds.add(u.id);
    const ladder = [];
    for (let l = 0; l < u.maxLevel; l++) ladder.push(upgradeCost(u, l));
    const total = ladder.reduce((a, b) => a + b, 0);
    if (total > 3200 * Math.pow(1.5, 3)) totalsOk = false;
    console.log(`    ${u.id.padEnd(18)} ${u.characterId.padEnd(8)} ${u.maxLevel} lvls ` +
      `ladder [${ladder.join(', ')}] total ${total} gold` +
      ` | perLevel ${u.perLevel} (${u.name}: ${u.desc})`);
    ok(u.id.startsWith(u.characterId.toLowerCase() + '_'),
      `row ${u.id}: id is <char-lower>_<knob>`);
    ok(u.baseCost >= 900 && u.baseCost <= 3200 && u.costGrowth === 1.5 &&
      (u.maxLevel === 3 || u.maxLevel === 4),
      `row ${u.id}: prices are breadth (base 900-3200, growth 1.5, maxLevel 3-4)`);
    ok(CHARACTER_UPGRADE_BY_ID[u.id] === u, `row ${u.id}: present in CHARACTER_UPGRADE_BY_ID`);
  }
  ok(totalsOk, 'no row\'s full ladder exceeds 3200 x 1.5^3 = 10800 gold');
  ok(Object.values(perChar).every(n => n === 2) && Object.keys(perChar).length === 4,
    'exactly 2 rows for each of the 4 characters: ' + JSON.stringify(perChar));
}

// =====================================================================
console.log('COST / CAP / VALIDATION BEHAVIOUR (buyCharacterUpgrade mirrors buyUpgrade):');
{
  const p = makeProfile();
  console.log(`    fresh profile: gold=${p.gold} unlocked=${JSON.stringify(p.unlockedCharacters)}`);
  ok(p.gold < 900, 'a fresh profile cannot afford any row (gold ' + p.gold + ')');
  ok(buyCharacterUpgrade(p, 'KNIGHT', 'knight_vigor') === false && p.gold === 0 &&
    getCharacterUpgradeLevel(p, 'KNIGHT', 'knight_vigor') === 0,
  'insufficient gold: refused, no debit, level stays 0');
  p.gold = 500000;
  ok(buyCharacterUpgrade(p, 'KNIGHT', 'nope') === false && p.gold === 500000,
    'unknown row id refused');
  ok(buyCharacterUpgrade(p, 'KNIGHT', 'witch_wellspring') === false && p.gold === 500000,
    'a row bought under the WRONG character id refused (witch row via KNIGHT)');
  ok(buyCharacterUpgrade(p, 'WITCH', 'witch_wellspring') === false && p.gold === 500000 &&
    getCharacterUpgradeLevel(p, 'WITCH', 'witch_wellspring') === 0,
  'a LOCKED character (WITCH) is refused at the data layer, level stays 0');

  // Full ladder purchase: exact debits, then the cap.
  let gold = p.gold;
  const def = CHARACTER_UPGRADE_BY_ID.knight_vigor;
  for (let l = 0; l < def.maxLevel; l++) {
    const before = gold;
    ok(buyCharacterUpgrade(p, 'KNIGHT', 'knight_vigor') === true, `knight_vigor level ${l + 1} bought`);
    gold -= upgradeCost(def, l);
    ok(p.gold === gold, `  gold debited EXACTLY ${upgradeCost(def, l)} (${before} -> ${p.gold})`);
  }
  const atCap = p.gold;
  ok(buyCharacterUpgrade(p, 'KNIGHT', 'knight_vigor') === false && p.gold === atCap,
    'at maxLevel the buy is refused with NO debit (cap behaviour)');
  ok(getCharacterUpgradeLevel(p, 'KNIGHT', 'knight_vigor') === def.maxLevel,
    `level reads ${def.maxLevel}/${def.maxLevel}`);

  // Locked -> unlocked flips the refusal.
  p.gold += 9000;
  ok(unlockCharacter(p, 'WITCH') === true && buyCharacterUpgrade(p, 'WITCH', 'witch_wellspring') === true,
    'after unlockCharacter, the WITCH row buys');
}

// =====================================================================
console.log('ISOLATION: a level bought on one character never moves another:');
{
  const p = makeProfile();
  p.gold = 500000;
  for (const u of CHARACTER_UPGRADES.filter(u => u.characterId === 'KNIGHT')) {
    for (let i = 0; i < u.maxLevel; i++) buyCharacterUpgrade(p, 'KNIGHT', u.id);
  }
  const others = CHARACTER_UPGRADES.filter(u => u.characterId !== 'KNIGHT');
  ok(others.every(u => getCharacterUpgradeLevel(p, u.characterId, u.id) === 0),
    'KNIGHT maxed: every WITCH/ROGUE/PALADIN row still level 0');
  console.log(`    knight levels: ${JSON.stringify(Object.fromEntries(
    CHARACTER_UPGRADES.filter(u => u.characterId === 'KNIGHT')
      .map(u => [u.id, getCharacterUpgradeLevel(p, 'KNIGHT', u.id)])))}`);
  for (const u of others) {
    if (!p.unlockedCharacters.includes(u.characterId)) {
      p.gold += CHARACTERS[u.characterId].unlockCost;   // the LOCKED refusal is
      unlockCharacter(p, u.characterId);                // proven in its own check
    }
    buyCharacterUpgrade(p, u.characterId, u.id);
  }
  ok(CHARACTER_UPGRADES.filter(u => u.characterId === 'KNIGHT')
    .every(u => getCharacterUpgradeLevel(p, 'KNIGHT', u.id) === u.maxLevel) &&
    others.every(u => getCharacterUpgradeLevel(p, u.characterId, u.id) === 1),
  'buying one level on every OTHER character leaves KNIGHT at max and each other at 1 (and vice versa)');
  console.log(`    after cross-buys: ${JSON.stringify(Object.fromEntries(
    CHARACTER_UPGRADES.map(u => [u.id, getCharacterUpgradeLevel(p, u.characterId, u.id)])))}`);
}

// =====================================================================
console.log('PURITY + THE EXPECTED DELTA (applyCharacterUpgrades):');
{
  const p = makeProfile();
  p.gold = 500000;
  for (let i = 0; i < 2; i++) buyCharacterUpgrade(p, 'KNIGHT', 'knight_vigor');
  const stats = baseStats();
  const snapshot = JSON.parse(JSON.stringify(stats));
  const out = applyCharacterUpgrades(stats, p, 'KNIGHT');
  ok(out !== stats, 'returns a NEW object');
  assert.deepStrictEqual(stats, snapshot, 'input stats object is UNCHANGED (pure)');
  ok(true, 'input stats object is UNCHANGED (deep-equal snapshot, pure)');
  ok(out.maxHp === stats.maxHp + 24,
    `knight_vigor level 2: maxHp ${stats.maxHp} -> ${out.maxHp} (expected +24)`);
  const empty = applyCharacterUpgrades(baseStats(), makeProfile(), 'KNIGHT');
  ok(empty.maxHp === baseStats().maxHp && Object.keys(empty).length === Object.keys(baseStats()).length,
    'a character with no levels adds nothing (same values, no new keys)');
  const unknown = applyCharacterUpgrades(baseStats(), makeProfile(), 'NOBODY');
  ok(unknown.maxHp === baseStats().maxHp, 'an unknown character id adds nothing');
}

// =====================================================================
console.log('EVERY ROW\'S EFFECT REACHES RUN STATE (before -> after at max level):');
{
  const mk = (cid) => {
    const p = makeProfile();
    p.gold = 500000;
    if (cid !== 'KNIGHT') {
      p.gold += CHARACTERS[cid].unlockCost;
      unlockCharacter(p, cid);
    }
    return p;
  };
  const maxed = (p, cid) => {
    for (const u of CHARACTER_UPGRADES.filter(u => u.characterId === cid)) {
      for (let i = 0; i < u.maxLevel; i++) buyCharacterUpgrade(p, cid, u.id);
    }
    return p;
  };
  // The RUN chain, exactly as startRun composes it (main.js):
  // applyCharacterUpgrades(applyCharacter(applyMetaBonuses(base, purchased), cid), profile, cid)
  const chain = (p, cid) => applyCharacterUpgrades(
    applyCharacter(applyMetaBonuses(baseStats(), p.purchased), cid), p, cid);
  const cases = [
    // [id, get(stats) -> printed number, consumption site named in the print]
    ['knight_vigor', s => s.maxHp, 'maxHp — main.js startRun p.hp = stats.maxHp + HUD'],
    ['knight_force', s => s.damageMult, 'damageMult — weapons.js weaponDamage + main.js damage steps'],
    ['witch_wellspring', s => s.maxMana, 'maxMana — main.js mana fills/clamps + HUD'],
    ['witch_focus', s => s.manaCostMult, 'manaCostMult — weapons.js weaponManaCost + perks.js Focus'],
    ['rogue_fleet', s => s.speed, 'speed — main.js move step stats.speed * speedMult'],
    ['paladin_bulwark', s => s.maxHp, 'maxHp — main.js startRun p.hp = stats.maxHp + HUD'],
    ['paladin_blessing', s => s.healOnChest, 'healOnChest — main.js chest-open heal (reads stats.healOnChest first)'],
  ];
  for (const [id, get, site] of cases) {
    const cid = CHARACTER_UPGRADE_BY_ID[id].characterId;
    const before = chain(mk(cid), cid);
    const after = chain(maxed(mk(cid), cid), cid);
    console.log(`    ${id.padEnd(18)} ${String(get(before)).padStart(8)} -> ${String(get(after)).padStart(8)}` +
      `  | ${site}`);
    ok(get(before) !== get(after), `${id}: the level MOVES the consumed number (${get(before)} -> ${get(after)})`);
  }
  // rogue_satchel is the wired knob: potions, via startPotionCount/characterPotionBonus.
  {
    const p0 = mk('ROGUE');
    const p1 = maxed(mk('ROGUE'), 'ROGUE');
    p1.equippedCharacter = 'ROGUE';
    const pr0 = { ...p0, equippedCharacter: 'ROGUE' };
    console.log(`    ${'rogue_satchel'.padEnd(18)} ${String(startPotionCount(pr0)).padStart(8)} -> ${String(startPotionCount(p1)).padStart(8)}` +
      `  | potions — main.js startRun startPotionCount(profile) (via characterPotionBonus)`);
    ok(startPotionCount(p1) === startPotionCount(pr0) + 3,
      'rogue_satchel at 3: starting potions +3 through startPotionCount');
    ok(characterPotionBonus(p1, 'KNIGHT') === 0,
      'the satchel term is ROGUE-only (characterPotionBonus on KNIGHT is 0)');
  }
}

// =====================================================================
console.log('THE GLOBAL FLOOR STILL APPLIES TO EVERY CHARACTER:');
{
  const p = makeProfile();
  p.purchased.well = 1;   // Deep Well: +maxMana per level, the global catalogue
  let all = true;
  for (const cid of Object.keys(CHARACTERS)) {
    const none = applyCharacter(applyMetaBonuses(baseStats(), p.purchased), cid);
    const withGlobal = applyCharacterUpgrades(none, p, cid);
    const bare = applyCharacter(baseStats(), cid);
    const moved = withGlobal.maxMana > bare.maxMana;
    all = all && moved;
    console.log(`    ${cid.padEnd(8)} maxMana base ${bare.maxMana} -> with global floor ${withGlobal.maxMana}` +
      ` (per-character levels: ${getCharacterUpgradeLevel(p, cid, 'witch_wellspring')})`);
  }
  ok(all, 'applyMetaBonuses applies to all 4 characters (the global floor is untouched)');
  // Switching characters resets the per-character portion, never the global.
  const pk = makeProfile(); pk.gold = 500000; pk.purchased.well = 1;
  for (let i = 0; i < 4; i++) buyCharacterUpgrade(pk, 'KNIGHT', 'knight_vigor');
  const asKnight = applyCharacterUpgrades(
    applyCharacter(applyMetaBonuses(baseStats(), pk.purchased), 'KNIGHT'), pk, 'KNIGHT');
  const asWitch = applyCharacterUpgrades(
    applyCharacter(applyMetaBonuses(baseStats(), pk.purchased), 'WITCH'), pk, 'WITCH');
  const witchNoLevels = applyCharacter(
    applyMetaBonuses(baseStats(), pk.purchased), 'WITCH');
  ok(asKnight.maxHp === baseStats().maxHp + 30 + 48,
    `the equipped KNIGHT sees his levels: ${baseStats().maxHp} +30 mod +48 levels = ${asKnight.maxHp}`);
  ok(asWitch.maxHp === witchNoLevels.maxHp,
    `switching to WITCH resets the per-character portion (KNIGHT's +48 gone): ` +
    `${asWitch.maxHp} === her own chain without levels`);
  ok(asWitch.maxMana === witchNoLevels.maxMana && witchNoLevels.maxMana > baseStats().maxMana,
    `the GLOBAL floor survives the switch (maxMana ${asWitch.maxMana} keeps the well bonus on WITCH too)`);
}

// =====================================================================
console.log('PERSISTENCE THROUGH THE REAL LOADER (acceptance D):');
{
  const st = (() => {
    const map = new Map();
    return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k) };
  })();
  const p = makeProfile();
  p.gold = 500000;
  buyCharacterUpgrade(p, 'KNIGHT', 'knight_vigor');
  buyCharacterUpgrade(p, 'KNIGHT', 'knight_vigor');
  saveProfile(p, st);
  const back = loadProfile(st);
  const lvl = getCharacterUpgradeLevel(back, 'KNIGHT', 'knight_vigor');
  console.log(`    round-trip: knight_vigor level ${lvl} (bought 2), gold ${back.gold}`);
  ok(lvl === 2, 'loadProfile preserves the bought levels through the REAL loader');

  // A hand-written save with a level ABOVE maxLevel is CLAMPED on load.
  const raw = JSON.parse(JSON.stringify(p));
  raw.characters = { KNIGHT: { upgrades: { knight_vigor: 99 } } };
  st.setItem('hordes_profile_v1', JSON.stringify(raw));
  const clamped = loadProfile(st);
  const lvlC = getCharacterUpgradeLevel(clamped, 'KNIGHT', 'knight_vigor');
  console.log(`    hand-written level 99 -> clamped to ${lvlC} (knight_vigor maxLevel ` +
    `${CHARACTER_UPGRADE_BY_ID.knight_vigor.maxLevel}) on load`);
  ok(lvlC === CHARACTER_UPGRADE_BY_ID.knight_vigor.maxLevel,
    'a level above maxLevel is clamped on load');
  ok(PROFILE_VERSION === 9, 'PROFILE_VERSION is 9 (the v9 lastPlayed/lastSeenUpdate bump — pin to the literal is intentional)');
}

console.log(failed ? `\nG19 CHARACTER UPGRADES: ${failed} FAILURES` : '\nG19 CHARACTER UPGRADES: ALL CHECKS PASSED');
process.exit(failed ? 1 : 0);
