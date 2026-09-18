// HORDES — headless tests for src/meta.js (node, no DOM).
// Run: node test/test_meta.mjs
import {
  makeProfile, loadProfile, saveProfile,
  computeRunGold, RUN_GOLD, GOLD_MODEL, projectRunGold,
  SHOP_UPGRADES, SHOP_BY_ID, upgradeCost, buyUpgrade, applyMetaBonuses,
  startPotionCount, CHARACTERS, applyCharacter, unlockCharacter, equipCharacter,
  startWeaponSlots, WEAPON_SLOT_START, MAX_WEAPON_SLOTS, hasArcadePass,
  STARTER_WEAPONS, WEAPON_PRICES, weaponUnlocked, unlockWeapon,
  ELITE_MODIFIERS, eliteUnlocked, unlockElite,
  LUCK_MAX_LEVEL, BASE_RARITY_WEIGHTS, luckDropWeights,
  shopRowOwned, catalogCost,
  APEX_UPGRADES, APEX_BY_ID, apexOwned, apexUnlocked, buyApex, apexEnabled, setApexEnabled,
} from '../src/meta.js';
import { WEAPON_TYPES } from '../src/weapons.js';   // read-only: drift guard
import { CONFIG as C, ladderHp, ladderDmg, volleyProjectileCap } from '../src/config.js';  // read-only: sim sync anchor
import { hpScale, dmgScale } from '../src/entities.js';               // read-only: shipped curves
import { SIM_ASSUMPTIONS, SIM_TUNING, simulateCareer }
  from '../tools/balance_sim.mjs';                  // sim↔meta single source of truth

let failed = 0;
function ok(cond, msg) {
  if (cond) { console.log('  PASS ' + msg); }
  else { failed++; console.error('  FAIL ' + msg); }
}

// Deterministic in-memory storage fake.
function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

// ---------- Persistence ----------
console.log('PERSISTENCE:');
{
  const s = fakeStorage();
  const fresh = loadProfile(s);
  ok(fresh.gold === 0 && fresh.purchased.dmg === undefined, 'empty storage yields a fresh profile');
  ok(fresh.unlockedCharacters.includes('KNIGHT') && fresh.equippedCharacter === 'KNIGHT',
     'fresh profile starts with KNIGHT unlocked + equipped');

  const p = makeProfile();
  p.gold = 1234;
  p.purchased = { dmg: 2, hp: 1 };
  p.unlockedCharacters = ['KNIGHT', 'WITCH'];
  p.equippedCharacter = 'WITCH';
  p.unlockedWeapons = ['VOLLEY', 'BOOMERANG', 'ZAP'];
  p.unlockedElites = ['SWIFT'];
  ok(saveProfile(p, s) === true, 'saveProfile succeeds');
  const back = loadProfile(s);
  ok(back.gold === 1234 && back.purchased.dmg === 2 && back.purchased.hp === 1,
     'round-trip preserves gold + purchased levels');
  ok(back.unlockedCharacters.length === 2 && back.equippedCharacter === 'WITCH',
     'round-trip preserves unlocks + equip');
  ok(back.unlockedWeapons.length === 3 && back.unlockedWeapons.includes('ZAP')
     && back.unlockedElites.length === 1 && back.unlockedElites[0] === 'SWIFT',
     'round-trip preserves weapon + elite unlocks');

  s.setItem('hordes_profile_v1', '{not json');
  const corrupt = loadProfile(s);
  ok(corrupt.gold === 0, 'corrupt blob falls back to a fresh profile');

  // Unknown/extra fields (e.g. main.js bestTime) must round-trip untouched.
  const s2 = fakeStorage();
  const rich = makeProfile();
  rich.gold = 77;
  rich.bestTime = 123.4;
  rich.runsPlayed = 9;
  rich.nested = { bossKills: 3, tags: ['a', 'b'] };
  saveProfile(rich, s2);
  const back2 = loadProfile(s2);
  ok(back2.bestTime === 123.4 && back2.runsPlayed === 9,
     'unknown scalar fields survive the round-trip');
  ok(back2.nested && back2.nested.bossKills === 3 && back2.nested.tags.length === 2,
     'unknown nested objects survive the round-trip');
  ok(back2.gold === 77 && back2.equippedCharacter === 'KNIGHT',
     'known fields still normalize alongside unknown ones');

  // Backward compat: an old-shape save (4 known fields only) loads cleanly.
  s2.setItem('hordes_profile_v1',
    JSON.stringify({ gold: 5, purchased: { dmg: 1 }, unlockedCharacters: ['KNIGHT'], equippedCharacter: 'KNIGHT' }));
  const old = loadProfile(s2);
  ok(old.gold === 5 && old.purchased.dmg === 1 && old.bestTime === undefined,
     'old-shape profile loads with known fields intact');
}

// ---------- Run gold ----------
console.log('RUN GOLD:');
{
  const g = computeRunGold({ kills: 37, level: 4, time: 73 });
  ok(g === 50 + Math.floor(37 / 2) + 4 * 10 + Math.floor(73 / 20),
     'gold = 50 + kills/2 + level*10 + time/20');
  const g2 = computeRunGold({ kills: 37, level: 4, time: 73, firstClear: true });
  ok(g2 === g + RUN_GOLD.FIRST_CLEAR, 'first-clear bonus applies on top');
  ok(computeRunGold({}) === 50, 'empty run stats yield the flat base only');
  // GREED: goldMult multiplies the whole payout (first clear included).
  ok(computeRunGold({ kills: 1000, level: 14, time: 200, goldMult: 1.5 })
     === Math.round(700 * 1.5), 'goldMult (Greed) multiplies the run payout');
}

// ---------- Economy projection model ----------
console.log('GOLD MODEL:');
{
  const first = computeRunGold(GOLD_MODEL.RUN1);
  ok(first === 700, `typical first run pays ~700g (got ${first})`);
  const late = computeRunGold(GOLD_MODEL.LATE);
  ok(late >= 2500 && late <= 4000, `built-out late run pays 2.5-4k (got ${late})`);

  ok(projectRunGold(1, {}) === first, 'projection at run 1 matches the reference run');
  ok(projectRunGold(61, {}) === projectRunGold(100, {}),
     'projection plateaus at the LATE reference');
  let mono = true;
  for (let i = 1; i < 60; i++) {
    if (projectRunGold(i + 1, {}) < projectRunGold(i, {})) mono = false;
  }
  ok(mono, 'projected income is non-decreasing in run index');
  ok(projectRunGold(5, { dmg: 5, hp: 5 }) > projectRunGold(5, {}),
     'permanent purchases accelerate the income curve');
}

// ---------- Progression ladder: full buy vs modeled income ----------
console.log('PROGRESSION LADDER:');
{
  // Full-buy cost: every level of every shop upgrade EXCEPT the arcade pass
  // (the post-full-buy sink) and EXCEPT the WAVE-11 kind rows (weapons/elites
  // are their own catalog — priced + asserted in ECONOMY TARGETS below), plus
  // every character unlock (KNIGHT is free).
  let fullBuyCost = 0;
  for (const u of SHOP_UPGRADES) {
    if (u.id === 'arcade' || u.kind) continue;
    for (let l = 0; l < u.maxLevel; l++) fullBuyCost += upgradeCost(u, l);
  }
  for (const c of Object.values(CHARACTERS)) fullBuyCost += c.unlockCost;

  // Cumulative income — G17 slice 1b RETARGET: the retired analytic model
  // (projectRunGold, ~2-3k/run) was calibrated against the old prices and
  // cannot cross a repriced catalogue inside 300 runs; the crossing is now
  // computed at the MEASURED tier-3 income (754,689g per WON 1800s run).
  // This catalogue (stat lines + slots + split + luck + chars, 4,490,433g
  // post-reprice — luck is the big row) = 5.95 measured runs = 3.0h.
  let cum = 0, crossRun = null;
  for (let n = 1; n <= 300; n++) {
    cum += GOLD_MODEL.INCOME_TIERS[3].gold;
    if (cum >= fullBuyCost) { crossRun = n; break; }
  }
  // G17 slice 2 RETARGET: 16 breadth rows (+65,105,600g of stat lines) moved
  // fullBuyCost 4,490,433 -> 69,596,033g, so the measured-income crossing is
  // 92-94 runs (~46-47h). The invariant is unchanged: the zero-purchase
  // analytic projection can no longer cross the catalogue (checked below).
  // CHAIN ZAP RETARGET (2026-09-17, owner msg_01M2RENZ): the Storm Conduit kit
  // row ('zapchain', full-buy 3,771,020g = 5.0 measured runs = 2.50h) moved
  // fullBuyCost 69,596,033 -> 73,367,053g, crossing 93 -> 98 runs (~49h). Old
  // band 92-94; new band 97-99. The invariant is unchanged.
  ok(crossRun !== null && crossRun >= 97 && crossRun <= 99,
     `full buy crosses measured income at run ${crossRun} x 754,689g = ${(crossRun * 0.5).toFixed(1)}h (target 97-99 runs post-zapchain)`);

  // ARCADE PASS sits beyond full-buy (G17 1b: 4,200,000g = 5.6 measured runs,
  // and the pass alone costs less than the luck ladder it follows home).
  const arcadeCost = upgradeCost(SHOP_BY_ID.arcade, 0);
  let cum2 = 0, crossArcade = null;
  for (let n = 1; n <= 300; n++) {
    cum2 += GOLD_MODEL.INCOME_TIERS[3].gold;
    if (cum2 >= fullBuyCost + arcadeCost) { crossArcade = n; break; }
  }
  ok(arcadeCost >= 50000, `arcade pass is a big-ticket sink (${arcadeCost}g)`);
  ok(crossArcade !== null && crossArcade >= crossRun + 5,
     `arcade pass pushes the crossing to run ${crossArcade} (+${crossArcade - crossRun} measured runs)`);

  // Early game cannot be skipped through: run-1 income buys no character.
  // Derive the floor from the catalog - naming one class as "the cheapest" is
  // what silently stopped testing anything when the Witch's price moved.
  const cheapestUnlock = Math.min(...Object.values(CHARACTERS)
    .map(c => c.unlockCost).filter(c => c > 0));   // KNIGHT is deliberately free
  ok(computeRunGold(GOLD_MODEL.RUN1) < cheapestUnlock,
     `a first run cannot afford even the cheapest character (${computeRunGold(GOLD_MODEL.RUN1)}g vs ${cheapestUnlock}g)`);
  // Slot 6 stays a long-run trophy: it costs more than 25 mid-game runs.
  const slot6 = upgradeCost(SHOP_BY_ID.slots, 2);
  const midRun = projectRunGold(20, {});
  ok(slot6 > midRun * 25, `slot 6 (${slot6}g) is a long-run trophy vs run-20 income (${Math.round(midRun)}g)`);
}

// ---------- Expansion shop lines ----------
console.log('EXPANSION LINES:');
{
  const NEW_IDS = ['crit', 'critdmg', 'greed', 'alchemy', 'scav', 'artifact'];
  for (const id of NEW_IDS) {
    const u = SHOP_BY_ID[id];
    ok(u && u.baseCost > 0 && u.maxLevel >= 3 && Number.isFinite(u.perLevel),
       `${id} line exists with baseCost/maxLevel/perLevel`);
  }
  // RETARGETED 2026-09-14 (A1): the count moved 16 -> 17 when the owner-ordered
  // engagement-radius row ('focus', meta.js) joined the flat stat/slot lines.
  // RETARGETED 2026-09-15 (G17 slice 2 breadth): 17 -> 33 with the 16 new rows
  // (fleetfoot .. laststand).
  // RETARGETED 2026-09-15 (V1 escape): 33 -> 34 — the owner-ordered PAID SKIP
  // row ('escapeskip', meta.js, owner directive 2026-09-14 "BUILD IT WITH THE
  // ESCAPE") joins the classic stat lines. The invariant this fixture guards is
  // "one row per stat line, nothing silently added or dropped", so the number
  // tracks the catalogue rather than being deleted or turned into a >= check.
  // RETARGETED 2026-09-17 (chain zap rework, owner msg_01M2RENZ): 34 -> 35 —
  // the Storm Conduit kit row ('zapchain') joins the flat stat lines.
  ok(SHOP_UPGRADES.filter(u => !u.kind && !['slots', 'arcade'].includes(u.id)).length === 35,
     'thirty-five stat lines total (18 classic + 16 G17-slice-2 breadth + 1 chain-zap kit row)');
  ok(SHOP_UPGRADES.filter(u => u.kind === 'weapon').length
     === Object.keys(WEAPON_PRICES).length,
     'every priced archetype has a weapon shop row');
  ok(SHOP_UPGRADES.filter(u => u.kind === 'elite').length
     === Object.keys(ELITE_MODIFIERS).length,
     'every elite modifier has a shop row');

  // Purchase path works like any other line.
  const p = makeProfile();
  p.gold = upgradeCost(SHOP_BY_ID.crit, 0);
  ok(buyUpgrade(p, 'crit') === true && p.purchased.crit === 1 && p.gold === 0,
     'crit buy path deducts and records');
  ok(buyUpgrade(p, 'crit') === false, 'crit cannot rebuy without gold');

  // Arcade Pass: single purchase (G17 1b reprice: 4,200,000g), flagged via hasArcadePass.
  ok(hasArcadePass(makeProfile()) === false, 'fresh profile has no arcade pass');
  const ap = makeProfile();
  ap.gold = 4200000;
  ok(buyUpgrade(ap, 'arcade') === true && hasArcadePass(ap) === true,
     'arcade pass purchase flips hasArcadePass');
  ok(buyUpgrade(ap, 'arcade') === false, 'arcade pass is single-purchase (maxLevel 1)');
}

// ---------- Meta stat field contract (applyMetaBonuses) ----------
console.log('STATS CONTRACT:');
{
  const base = { damage: 8, cooldown: 0.55, speed: 60, pickup: 22, projectiles: 1,
                 pierce: 0, maxHp: 100, maxMana: 100 };
  const def = applyMetaBonuses(base, {});
  ok(def.crit === 0 && def.critMult === 1 && def.goldMult === 1
     && def.potionPower === 1 && def.dropBonus === 0 && def.artifactLevels === 0
     && def.xpMult === 1 && def.luck === 0,
     'unpurchased: all contract fields present with safe defaults (0/1)');

  const max = applyMetaBonuses(base,
    { crit: 5, critdmg: 5, greed: 5, alchemy: 4, scav: 4, artifact: 3, xp: 5, luck: 5 });
  // OWNER 2026-09-13: rates doubled, and the (1+x) multiplier rows COMPOUND.
  ok(max.crit === 0.06 * 5, 'crit: +6%/level chance (0.30 max)');
  ok(max.critMult === Math.pow(1.5, 5), 'critMult: compounds (1.50)^level (7.59 max)');
  ok(max.goldMult === Math.pow(1.2, 5), 'goldMult: compounds (1.20)^level (2.49 max)');
  ok(max.potionPower === Math.pow(1.5, 4), 'potionPower: compounds (1.50)^level (5.06 max)');
  ok(max.dropBonus === 0.03 * 4, 'dropBonus: +3%/level (+12% max, additive: it is a chance)');
  ok(max.artifactLevels === 6, 'artifactLevels: +2 random weapon levels per level');
  ok(max.luck === 5, 'luck: Fortune level count flows through the stats contract (0..5)');
  ok(max.damage === 8 && max.maxHp === 100, 'base stats untouched by new lines');
}

// ---------- Weapon slots as shop items ----------
console.log('WEAPON SLOTS:');
{
  const p = makeProfile();
  ok(startWeaponSlots(p) === WEAPON_SLOT_START && WEAPON_SLOT_START === 3,
     'fresh profile starts with 3 weapon slots');
  ok(upgradeCost(SHOP_BY_ID.slots, 0) === 5000
     && upgradeCost(SHOP_BY_ID.slots, 1) === 14500
     && upgradeCost(SHOP_BY_ID.slots, 2) === 42050,
     'slot ladder: 5000 / 14500 / 42050 (steep expansion pricing)');

  p.gold = 4200 - 1;
  ok(buyUpgrade(p, 'slots') === false && startWeaponSlots(p) === 3,
     'slot 4 gated on gold');
  p.gold = 100000;
  ok(buyUpgrade(p, 'slots') === true && startWeaponSlots(p) === 4,
     'slot 4 purchase grants the 4th slot');
  buyUpgrade(p, 'slots'); buyUpgrade(p, 'slots');
  ok(startWeaponSlots(p) === MAX_WEAPON_SLOTS && MAX_WEAPON_SLOTS === 6,
     'all three slot purchases reach the 6-slot cap');
  ok(buyUpgrade(p, 'slots') === false, 'no slot purchases past 6');

  const base = { damage: 8, maxHp: 100, maxMana: 100 };
  const withSlots = applyMetaBonuses(base, { slots: 3 });
  ok(withSlots.damage === 8 && withSlots.maxHp === 100,
     'slot purchases never touch combat stats');
}

// ---------- Shop ----------
console.log('SHOP:');
{
  const p = makeProfile();
  p.gold = 50;
  const cost0 = upgradeCost(SHOP_BY_ID.dmg, 0);
  ok(cost0 === SHOP_BY_ID.dmg.baseCost, 'first purchase costs the base cost');
  ok(buyUpgrade(p, 'dmg') === false, 'insufficient gold rejected');
  ok(p.purchased.dmg === undefined && p.gold === 50, 'rejected buy mutates nothing');

  p.gold = 10000;
  ok(buyUpgrade(p, 'dmg') === true, 'valid buy succeeds');
  ok(p.purchased.dmg === 1 && p.gold === 10000 - cost0, 'buy deducts gold and records level');

  const cost1 = upgradeCost(SHOP_BY_ID.dmg, 1);
  ok(cost1 > cost0, 'cost escalates with level');
  buyUpgrade(p, 'dmg');
  ok(p.purchased.dmg === 2 && p.gold === 10000 - cost0 - cost1, 'second buy at escalated cost');

  // Level cap: buy to max.
  while (p.purchased.dmg < SHOP_BY_ID.dmg.maxLevel) buyUpgrade(p, 'dmg');
  const goldAtCap = p.gold;
  ok(buyUpgrade(p, 'dmg') === false, 'level cap rejects further buys');
  ok(p.gold === goldAtCap && p.purchased.dmg === SHOP_BY_ID.dmg.maxLevel,
     'capped buy mutates nothing');
  ok(buyUpgrade(p, 'nope') === false, 'unknown upgrade id rejected');
}

// ---------- Bonus stacking ----------
console.log('BONUSES:');
{
  const base = { damage: 8, cooldown: 0.55, speed: 60, pickup: 22, projectiles: 1,
                 pierce: 0, maxHp: 100, maxMana: 100 };
  const out = applyMetaBonuses(base, {});
  ok(out !== base && base.damage === 8 && base.maxHp === 100,
     'applyMetaBonuses never mutates the input');
  ok(out.damage === 8 && out.maxHp === 100 && out.xpMult === 1,
     'zero purchases leave base stats intact');

  const out2 = applyMetaBonuses(base, { dmg: 2, hp: 3, regen: 1, xp: 2 });
  ok(out2.damage === 8 * Math.pow(3, 2), 'damage stacks MULTIPLICATIVELY: base x 3^level');
  ok(out2.maxHp === 100 + 40 * 3, 'max HP bonus adds per level (+40)');
  ok(out2.manaRegen === C.MANA.REGEN + SHOP_BY_ID.regen.perLevel * 1,
     'mana regen bonus adds per level (base + perLevel, both read from config)');
  ok(out2.xpMult === Math.pow(1.2, 2), 'XP bonus COMPOUNDS (1.20)^level');
  ok(out2.speed === 60 && out2.cooldown === 0.55, 'untouched stats pass through');
}

// ---------- Characters ----------
console.log('CHARACTERS:');
{
  ok(Object.keys(CHARACTERS).length === 4, 'four characters defined');
  ok(CHARACTERS.WITCH.startingWeapon === 'ZAP'
     && CHARACTERS.ROGUE.startingWeapon === 'BOOMERANG'
     && CHARACTERS.PALADIN.startingWeapon === 'ORBIT'
     && CHARACTERS.KNIGHT.startingWeapon === null,
     'starting weapons match weapons.js ids (KNIGHT = base volley)');

  const p = makeProfile();
  p.gold = 2000;   // deliberately short of PALADIN (6000)
  ok(unlockCharacter(p, 'PALADIN') === false, 'cannot unlock beyond current gold');
  const witchPrice = CHARACTERS.WITCH.unlockCost;
  p.gold = witchPrice + 250;   // funded from the catalog, not a magic number
  ok(unlockCharacter(p, 'WITCH') === true, 'unlock with enough gold succeeds');
  ok(p.gold === 250 && p.unlockedCharacters.includes('WITCH'),
     'unlock deducts cost and records ownership');
  ok(unlockCharacter(p, 'WITCH') === false, 'double unlock rejected');
  ok(unlockCharacter(p, 'KNIGHT') === false, 'already-free character cannot be re-unlocked');
  ok(unlockCharacter(p, 'NOPE') === false, 'unknown character id rejected');

  ok(equipCharacter(p, 'PALADIN') === false, 'cannot equip a locked character');
  ok(p.equippedCharacter === 'KNIGHT', 'failed equip keeps current character');
  ok(equipCharacter(p, 'WITCH') === true && p.equippedCharacter === 'WITCH',
     'equip unlocked character succeeds');
  ok(equipCharacter(p, 'NOPE') === false, 'equip unknown id rejected');

  // Character stat modifiers.
  const base = { damage: 8, cooldown: 0.55, speed: 60, pickup: 22, projectiles: 1,
                 pierce: 0, maxHp: 100, maxMana: 100 };
  const knight = applyCharacter(base, 'KNIGHT');
  ok(knight.maxHp === 130 && knight !== base, 'KNIGHT +30 max HP, input not mutated');
  const witch = applyCharacter(base, 'WITCH');
  ok(witch.maxHp === 75 && witch.maxMana === 150, 'WITCH -25 HP / +50 mana');
  const rogue = applyCharacter(base, 'ROGUE');
  ok(rogue.speed === 72, 'ROGUE +20% move speed');
  const paladin = applyCharacter(base, 'PALADIN');
  ok(paladin.maxHp === 115 && CHARACTERS.PALADIN.healOnChest === 15,
     'PALADIN +15 HP and heal-on-chest flag');
  ok(base.maxHp === 100 && base.speed === 60, 'applyCharacter never mutates the input');

  // Composition: shop bonuses + character mods stack.
  p.purchased = { hp: 1 };
  p.equippedCharacter = 'KNIGHT';
  ok(startPotionCount(p) === 1, 'startPotionCount: character base');
  p.purchased.potions = 2;
  ok(startPotionCount(p) === 3, 'startPotionCount: Travel Pack levels add');
  const composed = applyCharacter(applyMetaBonuses(base, p.purchased), 'KNIGHT');
  ok(composed.maxHp === (100 + 40) + 30, 'shop + character bonuses compose');
}

// ---------- Migration: old-economy saves load clean ----------
console.log('MIGRATION:');
{
  const s = fakeStorage();
  // A playtest-era save: old prices paid, WITCH unlocked at the old 400g.
  s.setItem('hordes_profile_v1', JSON.stringify({
    gold: 2636,
    purchased: { dmg: 1, hp: 2 },
    unlockedCharacters: ['KNIGHT', 'WITCH'],
    equippedCharacter: 'WITCH',
    bestTime: 187.5,
  }));
  const old = loadProfile(s);
  ok(old.gold === 2636 && old.purchased.dmg === 1 && old.purchased.hp === 2,
     'old-economy profile loads with purchases intact');
  ok(old.unlockedCharacters.includes('WITCH') && old.equippedCharacter === 'WITCH',
     'old unlocks/equip survive migration');
  ok(old.bestTime === 187.5, 'extra fields still round-trip');
  ok(startWeaponSlots(old) === 3, 'weaponSlots defaults to 3 when absent');

  // Over-cap purchased levels (corrupt or future-economy) clamp to maxLevel.
  s.setItem('hordes_profile_v1', JSON.stringify({
    gold: 0,
    purchased: { dmg: 99, slots: 7, futureThing: 2, junk: 'x' },
    unlockedCharacters: [], equippedCharacter: 'KNIGHT',
  }));
  const clamped = loadProfile(s);
  ok(clamped.purchased.dmg === SHOP_BY_ID.dmg.maxLevel,
     'purchased levels clamp to the current maxLevel');
  ok(clamped.purchased.slots === SHOP_BY_ID.slots.maxLevel
     && startWeaponSlots(clamped) === MAX_WEAPON_SLOTS,
     'over-cap slot purchases clamp to 6 slots');
  ok(clamped.purchased.futureThing === 2,
     'unknown future upgrade ids are preserved verbatim');
  ok(clamped.purchased.junk === 0 && clamped.unlockedCharacters.includes('KNIGHT'),
     'garbage levels sanitize to 0; empty unlocks fall back to KNIGHT');

  // Pre-EXPANSION save: slots bought under the old ladder, no expansion ids.
  const s3 = fakeStorage();
  s3.setItem('hordes_profile_v1', JSON.stringify({
    gold: 3000,
    purchased: { dmg: 2, slots: 2 },
    unlockedCharacters: ['KNIGHT', 'WITCH'],
    equippedCharacter: 'KNIGHT',
  }));
  const pre = loadProfile(s3);
  ok(pre.purchased.slots === 2 && startWeaponSlots(pre) === 5,
     'pre-expansion slot purchases migrate into the new ladder');
  ok(pre.purchased.crit === undefined && pre.purchased.arcade === undefined
     && hasArcadePass(pre) === false,
     'expansion lines simply default when absent');
  const preStats = applyMetaBonuses({ damage: 8, maxHp: 100 }, pre.purchased);
  ok(preStats.crit === 0 && preStats.goldMult === 1,
     'pre-expansion profile gets safe stat-contract defaults');

  // WAVE-11 RETROACTIVE RESET (Sk408-approved): a pre-weapon-economy save has
  // no unlockedWeapons field and gets the STARTER SET ONLY — nothing is
  // grandfathered, not even WITCH's starting weapon.
  ok(Array.isArray(old.unlockedWeapons)
     && old.unlockedWeapons.length === STARTER_WEAPONS.length
     && STARTER_WEAPONS.every(w => old.unlockedWeapons.includes(w)),
     'pre-WAVE-11 save migrates to the starter set only');
  ok(!old.unlockedWeapons.includes('ZAP'),
     'WITCH ownership does not grandfather her ZAP starter');
  ok(Array.isArray(old.unlockedElites) && old.unlockedElites.length === 0,
     'elite modifiers are locked on old saves');

  // Present-but-garbage unlock arrays sanitize (drop junk/dupes, keep valid).
  s.setItem('hordes_profile_v1', JSON.stringify({
    gold: 0, purchased: {},
    unlockedCharacters: ['KNIGHT'], equippedCharacter: 'KNIGHT',
    unlockedWeapons: ['BEAM', 'BEAM', 'NOPE', 42, 'VOLLEY'],
    unlockedElites: ['SWIFT', 'SWIFT', 'GARBAGE', 7],
  }));
  const san = loadProfile(s);
  ok(san.unlockedWeapons.length === 2 && san.unlockedWeapons.includes('BEAM')
     && san.unlockedWeapons.includes('VOLLEY') && !san.unlockedWeapons.includes('NOPE'),
     'weapon unlocks dedupe + drop garbage, VOLLEY always survives');
  ok(san.unlockedElites.length === 1 && san.unlockedElites[0] === 'SWIFT',
     'elite unlocks dedupe + drop garbage');
  // VOLLEY re-added even when a mangled field omits it.
  s.setItem('hordes_profile_v1', JSON.stringify({
    gold: 0, purchased: {}, unlockedCharacters: ['KNIGHT'], equippedCharacter: 'KNIGHT',
    unlockedWeapons: ['MINE'], unlockedElites: [],
  }));
  ok(loadProfile(s).unlockedWeapons[0] === 'VOLLEY',
     'VOLLEY is re-prepended when a corrupt field omits it');
}

// ---------- Weapon unlocks (WAVE-11) ----------
console.log('WEAPON UNLOCKS:');
{
  ok(STARTER_WEAPONS.length === 2 && STARTER_WEAPONS.includes('VOLLEY'),
     'starter set = VOLLEY + one cheap pick');

  // Drift guard vs the read-only weapons.js archetype list: every archetype
  // is either priced or a starter; nothing priced exists outside it.
  const archetypes = Object.keys(WEAPON_TYPES);
  for (const a of archetypes) {
    ok(WEAPON_PRICES[a] !== undefined || STARTER_WEAPONS.includes(a),
       `${a} is priced or a starter weapon`);
  }
  ok(Object.keys(WEAPON_PRICES).length + STARTER_WEAPONS.length === archetypes.length + 1,
     'price ladder covers exactly the non-starter catalog (+VOLLEY starter)');

  // Stepped ladder: prices strictly ascend in listed order; BEAM is top tier.
  const prices = Object.values(WEAPON_PRICES);
  ok(prices.every((p, i) => i === 0 || p > prices[i - 1]),
     'price ladder strictly ascends (early cheap, strong expensive)');
  // G17 slice 1b RETARGET: the old `> MINE * 5` encoded the old prices
  // (110,000 vs 4,800 = 22.9x). Post-reprice the 3h single-item cap
  // (4,528,134g) bounds the ratio: BEAM 4.5M / MINE 4.2M = 1.07x is the
  // ceiling the cap allows; BEAM still tops the strictly-ascending ladder.
  ok(WEAPON_PRICES.BEAM > WEAPON_PRICES.MINE,
     'BEAM sits above the ladder (top tier; the 3h single-item cap bounds the gap post-reprice)');

  // Gating + buy path.
  const p = makeProfile();
  ok(weaponUnlocked(p, 'VOLLEY') && weaponUnlocked(p, 'BOOMERANG'),
     'fresh profile owns the starter set');
  ok(!weaponUnlocked(p, 'ZAP') && !weaponUnlocked(p, 'BEAM'),
     'everything else is locked by default');
  p.gold = WEAPON_PRICES.ZAP - 1;
  ok(unlockWeapon(p, 'ZAP') === false && p.gold === WEAPON_PRICES.ZAP - 1
     && !weaponUnlocked(p, 'ZAP'),
     'weapon buy gated on gold, mutates nothing on failure');
  p.gold = 1000000;
  ok(unlockWeapon(p, 'ZAP') === true && weaponUnlocked(p, 'ZAP')
     && p.gold === 1000000 - WEAPON_PRICES.ZAP,
     'weapon buy deducts gold and records ownership');
  ok(unlockWeapon(p, 'ZAP') === false, 'double weapon buy rejected');
  ok(unlockWeapon(p, 'VOLLEY') === false && unlockWeapon(p, 'BOOMERANG') === false,
     'starters cannot be bought');
  ok(unlockWeapon(p, 'NOPE') === false, 'unknown weapon id rejected');

  // Shop-row path (hb1 keeps calling buyUpgrade with the row id).
  const q = makeProfile();
  q.gold = WEAPON_PRICES.BEAM;
  ok(buyUpgrade(q, 'weapon_beam') === true && weaponUnlocked(q, 'BEAM')
     && q.purchased.weapon_beam === undefined && q.gold === 0,
     'buyUpgrade on a weapon row unlocks via unlockedWeapons (not purchased)');
  ok(buyUpgrade(q, 'weapon_beam') === false, 'weapon row is single-purchase');
  ok(shopRowOwned(q, SHOP_BY_ID.weapon_beam) === true
     && shopRowOwned(q, SHOP_BY_ID.weapon_zap) === false,
     'shopRowOwned reflects weapon rows');
  ok(buyUpgrade(q, 'weapon_nope') === false, 'unknown weapon row id rejected');
}

// ---------- Elite modifier unlocks (WAVE-11) ----------
console.log('ELITE MODIFIERS:');
{
  ok(Object.keys(ELITE_MODIFIERS).length === 3
     && ['SWIFT', 'SPLITTING', 'VAMPIRIC'].every(k => ELITE_MODIFIERS[k].cost > 0),
     'SWIFT / SPLITTING / VAMPIRIC defined with costs');

  const p = makeProfile();
  ok(!eliteUnlocked(p, 'SWIFT') && !eliteUnlocked(p, 'SPLITTING')
     && !eliteUnlocked(p, 'VAMPIRIC'),
     'all elite modifiers locked by default');
  p.gold = ELITE_MODIFIERS.SWIFT.cost - 1;
  ok(unlockElite(p, 'SWIFT') === false, 'elite buy gated on gold');
  p.gold = 2000000;
  ok(unlockElite(p, 'SWIFT') === true && eliteUnlocked(p, 'SWIFT')
     && p.gold === 2000000 - ELITE_MODIFIERS.SWIFT.cost,
     'elite buy deducts gold and records ownership');
  ok(unlockElite(p, 'SWIFT') === false, 'double elite buy rejected');
  ok(unlockElite(p, 'NOPE') === false, 'unknown elite id rejected');

  const q = makeProfile();
  q.gold = ELITE_MODIFIERS.VAMPIRIC.cost;
  ok(buyUpgrade(q, 'elite_vampiric') === true && eliteUnlocked(q, 'VAMPIRIC')
     && q.purchased.elite_vampiric === undefined && q.gold === 0,
     'buyUpgrade on an elite row unlocks via unlockedElites (not purchased)');
  ok(shopRowOwned(q, SHOP_BY_ID.elite_vampiric) === true,
     'shopRowOwned reflects elite rows');
}

// ---------- Luck skill (WAVE-11) ----------
console.log('LUCK:');
{
  ok(SHOP_BY_ID.luck.maxLevel === LUCK_MAX_LEVEL && LUCK_MAX_LEVEL === 5,
     'luck is a 5-level shop upgrade');

  // Level 0 == the shared base table exactly (hb4 rebases loot.js onto it).
  const w0 = luckDropWeights(0);
  ok(w0.COMMON === BASE_RARITY_WEIGHTS.COMMON && w0.RARE === BASE_RARITY_WEIGHTS.RARE
     && w0.EPIC === BASE_RARITY_WEIGHTS.EPIC && w0.LEGENDARY === BASE_RARITY_WEIGHTS.LEGENDARY,
     'luck 0 returns BASE_RARITY_WEIGHTS exactly');

  // Monotonic shift: COMMON strictly decreases, others never decrease.
  let mono = true;
  for (let L = 0; L < LUCK_MAX_LEVEL; L++) {
    const a = luckDropWeights(L), b = luckDropWeights(L + 1);
    if (b.COMMON >= a.COMMON || b.RARE < a.RARE || b.EPIC < a.EPIC
        || b.LEGENDARY < a.LEGENDARY) mono = false;
  }
  ok(mono, 'luck monotonically shifts weights: common down, rare/epic/legendary up');
  ok(luckDropWeights(5).EPIC > BASE_RARITY_WEIGHTS.EPIC
     && luckDropWeights(5).COMMON < BASE_RARITY_WEIGHTS.COMMON,
     'max luck noticeably tilts the table toward rare/epic');
  for (const band of ['COMMON', 'RARE', 'EPIC', 'LEGENDARY']) {
    ok(luckDropWeights(-3)[band] === luckDropWeights(0)[band]
       && luckDropWeights(99)[band] === luckDropWeights(LUCK_MAX_LEVEL)[band],
       `luck clamps to 0..${LUCK_MAX_LEVEL} (${band})`);
  }

  // Purchase path: 5 levels then cap; stat contract carries the level.
  const p = makeProfile();
  p.gold = catalogCost(['luck']);
  let bought = 0;
  while (buyUpgrade(p, 'luck')) bought++;
  ok(bought === 5 && p.purchased.luck === 5 && p.gold === 0,
     'luck buys all 5 levels and caps');
  ok(applyMetaBonuses({ damage: 8 }, p.purchased).luck === 5,
     'purchased luck reaches the stats contract');
}

// ---------- Economy targets (E1 purse retarget: MEASURED, not analytic) -----
// The old block pinned the retired computeRunGold formula (GOOD_RUN ~1.8k,
// tiers == RUN1/LATE references, halfRuns in [9,13], top-tier 30+ good runs).
// E1 pays per-kill tier gold + the fixed AWARD, so the targets are re-derived
// from the measured real-loop cohorts (see GOLD_MODEL header in src/meta.js).
// The shop is deliberately NOT repriced (HORDES_GOALS 2026-09-12).
console.log('ECONOMY TARGETS:');
{
  const good = GOLD_MODEL.INCOME_TIERS[3].gold;
  // G17 slice 1b RETARGET: pinned EXACTLY to the measured record — the maxed
  // cohort (n=1, seed 1337) banked 754,689g in a WON 1800s run settled through
  // settleRunGold (kills 244185; raw /tmp/g17_1b/maxed_r1.log). The old
  // [9000, 13000] band pinned the retired 300s-censored 11000 estimate (~69x
  // low). A strict pin, not a loosened band: any change to the payout tables
  // moves this number and fails here.
  ok(good === 754689,
     `good (maxed) run banks the MEASURED 754,689g purse (n=1 seed 1337, won 1800s run; got ${good})`);
  ok(GOLD_MODEL.INCOME_TIERS[0].gold === RUN_GOLD.AWARD,
     'income tier 0 pins the fixed-award floor (fresh runs bank the bare award)');
  ok(GOLD_MODEL.INCOME_TIERS[0].gold < GOLD_MODEL.INCOME_TIERS[1].gold
     && GOLD_MODEL.INCOME_TIERS[1].gold < GOLD_MODEL.INCOME_TIERS[2].gold
     && GOLD_MODEL.INCOME_TIERS[2].gold < GOLD_MODEL.INCOME_TIERS[3].gold,
     'income tiers strictly increase (floor -> partial -> mid -> maxed)');

  // (a) G17 slice 1b RE-BASELINE: the new intent is "10 good runs buy 30-40%
  // of the mid-tier catalog" (the measured share at the repriced tables is
  // 36.4%). Derived half-catalog band: 10 / 0.40 / 2 = 12.5 runs at the fast
  // end, 10 / 0.30 / 2 = 16.7 at the slow end; midpoint 10 / 0.35 / 2 = 14.3.
  // The old [1.5, 2.5] band encoded the "fast" intent the owner rejected
  // (half the mid catalog for ~2 good runs = 1 hour of end-game play).
  const midCost = catalogCost(GOLD_MODEL.MID_TIER_IDS);
  const halfRuns = (midCost / 2) / good;
  ok(halfRuns >= 12.5 && halfRuns <= 16.7,
     `half the mid-tier catalog costs ~14 good runs (10 good runs buy 30-40% of it; got ${halfRuns.toFixed(1)}, was 1.9 under the old prices)`);
  ok(midCost < good * 40,
     'the whole mid-tier catalog stays a mid-game project (< 40 good runs)');

  // (b) every top-tier item costs 10+ good runs (was 30+; re-derived, shop
  // NOT repriced: BEAM 10.0, ARCADE_PASS 12.7 maxed runs).
  ok(!GOLD_MODEL.MID_TIER_IDS.some(id => GOLD_MODEL.TOP_TIER_IDS.includes(id)),
     'mid-tier and top-tier catalogs are disjoint');
  for (const id of GOLD_MODEL.TOP_TIER_IDS) {
    const cost = catalogCost([id]);
    ok(cost >= good * GOLD_MODEL.TOP_TIER_MIN_GOOD_RUNS,
       `${id} (${cost}g) costs ${GOLD_MODEL.TOP_TIER_MIN_GOOD_RUNS}+ good runs (${(cost / good).toFixed(1)})`);
  }
  ok(catalogCost(['arcade']) === 4200000,
     'ARCADE_PASS is the 4.2M top-tier flex (G17 1b reprice: 2.78h at the measured 1,509,378g/h, inside the 3h cap)');

  // Ladder sanity against the measured income curve.
  ok(WEAPON_PRICES.ORBIT > GOLD_MODEL.INCOME_TIERS[0].gold
     && WEAPON_PRICES.ORBIT <= GOLD_MODEL.INCOME_TIERS[2].gold * 2,
     'cheapest weapon is past the first-run floor but ~2 mid-tier runs (early weapons cheap)');
  ok(WEAPON_PRICES.BEAM > good,
     'BEAM is not plausibly one-run money even late');
}

// ---------- Sim ↔ meta single source of truth (BALANCE SIM v2) --------------
// SURVIVAL-GAP wave: the sim was rebuilt for the LIVE bounded ladder (15 waves
// x 120s = RUN.LIMIT). These assertions were re-pointed at the new derivation —
// the old ones pinned the retired 5-wave unit (END_WAVE-based rampSum / TW0),
// which no longer describes a run. The run-structure BLOCK was strengthened,
// not weakened: it now also pins the ladder to the same curve authority the
// game reads.
console.log('SIM SYNC:');
{
  const MAX_TICK = Math.ceil(C.RUN.LIMIT / 30);
  ok(SIM_ASSUMPTIONS.LIMIT === C.RUN.LIMIT
     && SIM_ASSUMPTIONS.WAVES === C.LADDER.WAVES
     && SIM_ASSUMPTIONS.WAVE_SECONDS === C.LADDER.WAVE_SECONDS,
     'sim run structure matches CONFIG.RUN / CONFIG.LADDER (LIMIT / WAVES / WAVE_SECONDS)');
  ok(SIM_ASSUMPTIONS.WAVES * SIM_ASSUMPTIONS.WAVE_SECONDS === SIM_ASSUMPTIONS.LIMIT,
     'sim ladder spans the run limit exactly (WAVES x WAVE_SECONDS = LIMIT)');
  ok(SIM_ASSUMPTIONS.END_WAVE === C.ESCALATION.END_WAVE
     && SIM_ASSUMPTIONS.WAVE_LENGTH === C.ESCALATION.WAVE_LENGTH,
     'sim still reports the SHIPPED milestone values (END_WAVE / WAVE_LENGTH)');

  // The sim's curve authority is the ladder, and inside the knee that IS the
  // shipped curve — the same invariant test_run_structure pins.
  let kneeHolds = true;
  for (let w = 0; w <= C.LADDER.KNEE_TICK; w++) {
    if (SIM_ASSUMPTIONS.hpScale(w) !== hpScale(w)) kneeHolds = false;
    if (SIM_ASSUMPTIONS.dmgScale(w) !== dmgScale(w)) kneeHolds = false;
  }
  ok(kneeHolds, 'sim curves (hpScale/dmgScale) equal the shipped curves inside the knee');
  ok(SIM_ASSUMPTIONS.hpScale(MAX_TICK) === ladderHp(MAX_TICK)
     && SIM_ASSUMPTIONS.dmgScale(MAX_TICK) === ladderDmg(MAX_TICK),
     'sim curves are the LADDER at the run limit');

  ok(SIM_ASSUMPTIONS.goodRunGold === computeRunGold(GOLD_MODEL.GOOD_RUN),
     'sim good-run reference gold equals computeRunGold(GOLD_MODEL.GOOD_RUN)');
  ok(SIM_ASSUMPTIONS.killsPerFullRun === GOLD_MODEL.GOOD_RUN.kills
     && SIM_ASSUMPTIONS.TW0 === C.RUN.LIMIT / C.LADDER.WAVES,
     'sim kill/time calibration anchors to the GOOD_RUN reference over the ladder');
  const rampSum = Array.from({ length: C.LADDER.WAVES },
    (_, i) => 1 + SIM_TUNING.KILL_RAMP * i).reduce((s, x) => s + x, 0);
  ok(Math.abs(SIM_ASSUMPTIONS.K0 * rampSum - GOLD_MODEL.GOOD_RUN.kills) < 1e-9,
     'per-wave kill shape sums to GOOD_RUN.kills over a full ladder run');

  ok(JSON.stringify(SIM_ASSUMPTIONS.MID_TIER_IDS) === JSON.stringify(GOLD_MODEL.MID_TIER_IDS)
     && JSON.stringify(SIM_ASSUMPTIONS.TOP_TIER_IDS) === JSON.stringify(GOLD_MODEL.TOP_TIER_IDS),
     'sim tier catalogs equal GOLD_MODEL MID/TOP_TIER_IDS');
  ok(SIM_ASSUMPTIONS.midTierCost === catalogCost(GOLD_MODEL.MID_TIER_IDS),
     'sim mid-tier catalog cost equals catalogCost (no duplicated prices)');
  ok(SIM_ASSUMPTIONS.TOP_TIER_MIN_GOOD_RUNS === GOLD_MODEL.TOP_TIER_MIN_GOOD_RUNS,
     'sim uses GOLD_MODEL.TOP_TIER_MIN_GOOD_RUNS as the top-tier bar');

  // Deterministic smoke: one career, fixed seed, must reach the target and
  // produce the milestone table shape. A "good run" is the run's MILESTONE —
  // the same standard the retired 5-wave era used, re-pointed onto the ladder
  // (a run that cleared past ESCALATION.END_WAVE); the harder RUN SURVIVED
  // count is reported alongside.
  const career = simulateCareer(1337);
  ok(career.hitTarget === true && career.milestones.length === SIM_TUNING.GOOD_RUN_TARGET / 5,
     'sim career smoke: deterministic career reaches all milestone runs');
  ok(career.milestones[1].goodRuns === 10 && Number.isFinite(career.milestones[1].goodFrac),
     'sim career smoke: 10-good-run milestone carries the target-(a) metric');
  const again = simulateCareer(1337);
  ok(JSON.stringify(again.milestones) === JSON.stringify(career.milestones),
     'sim career smoke: same seed reproduces identical milestones');
}

// ---------- (owner) THE SPLIT SHOT CAP ROW ----------
// Pinned so the row cannot silently shrink. Owner: "one that goes to 10 and
// allows the card to continue improving until that cap." The game reads the cap
// through volleyProjectileCap(), so assert THROUGH it, never against the base
// constant — a row that raises a cap nobody reads is the same fake choice in a
// different costume.
{
  const row = SHOP_BY_ID.split;
  ok(!!row, 'the Split Shot cap row exists');
  ok(row.maxLevel === 10, `the row goes to 10 (got ${row && row.maxLevel})`);
  ok(row.perLevel === 1, 'each level buys exactly +1 cap');
  const base = C.WEAPON.MAX_PROJECTILES;
  ok(volleyProjectileCap({}) === base, 'nothing bought => the base cap');
  ok(volleyProjectileCap({ splitCap: 0 }) === base, 'a zero field => the base cap');
  ok(volleyProjectileCap({ splitCap: 10 }) === base + 10,
     `fully bought => base + 10 (got ${volleyProjectileCap({ splitCap: 10 })})`);
  const stats = { damage: 8, maxHp: 100, maxMana: 100, splitCap: 0 };
  ok(applyMetaBonuses(stats, { split: 10 }).splitCap === 10,
     'applyMetaBonuses emits the full +10 at level 10');
  ok(applyMetaBonuses(stats, { split: 0 }).splitCap === 0, 'and 0 unowned');
  ok(row.baseCost > 0 && row.costGrowth > 1,
     'the row prices on a real ladder (a cap this deep is a long-term buy)');
}

// ---------- (G25 slice 1) THE APEX TIER: partition, gate, pricing, toggle ----
// THE PARTITION is the whole design: apex rows live in their OWN catalogue and
// the shop economy must not know they exist. The number 290500 is the MEASURED
// pre-slice value of catalogCost(MID+TOP) — pinned here so any drift (an apex
// row leaking into SHOP_UPGRADES, a repriced mid/top row) fails this file.
console.log('APEX TIER (G25):');
{
  // -- partition: apex is invisible to the shop economy --
  const partition = catalogCost([...GOLD_MODEL.MID_TIER_IDS, ...GOLD_MODEL.TOP_TIER_IDS]);
  // G17 slice 1b RETARGET: 29,440,200 = MID 20,740,200 + TOP 8,700,000 at the
  // repriced tables. The pin's JOB is unchanged — any apex row leaking into
  // SHOP_UPGRADES or any uncoordinated mid/top reprice fails this line.
  // G17 slice 2 RETARGET: 94,545,800 = MID 22,755,200 + TOP 71,790,600 with the
  // 17 breadth rows partitioned (fleetfoot MID; the other 16 TOP). The pin's
  // JOB is unchanged — any apex row leaking into SHOP_UPGRADES or any
  // uncoordinated mid/top reprice fails this line.
  ok(partition === 94545800,
     `the mid+top catalog cost is UNCHANGED by the apex tier (got ${partition}, post-G17-slice-2 94545800)`);
  // RETARGETED 2026-09-15 (V1 escape): 45 -> 46 — the PAID SKIP row
  // ('escapeskip', owner directive 2026-09-14) joined SHOP_UPGRADES with the
  // escape slice. The pin's JOB is unchanged: apex rows must never leak into
  // the normal catalogue, so the count tracks the pre-apex rows exactly.
  // RETARGETED 2026-09-17 (chain zap rework, owner msg_01M2RENZ): 46 -> 47 —
  // the Storm Conduit kit row ('zapchain') joined SHOP_UPGRADES. Same JOB.
  ok(SHOP_UPGRADES.length === 47,
     `SHOP_UPGRADES holds exactly its 47 pre-apex rows (30 classic + 16 breadth + 1 zapchain; got ${SHOP_UPGRADES.length})`);
  ok(APEX_UPGRADES.length === 2, `exactly two apex items this slice (got ${APEX_UPGRADES.length})`);
  ok(APEX_UPGRADES.every(u => u.apex === true && u.kind === 'apex'),
     'every APEX_UPGRADES row carries apex:true + kind:"apex"');
  ok(SHOP_UPGRADES.every(u => !u.apex && u.kind !== 'apex'),
     'no SHOP_UPGRADES row carries the apex tag');
  ok(APEX_UPGRADES.every(u => !SHOP_BY_ID[u.id]),
     'no apex id is reachable through SHOP_BY_ID (buyUpgrade/nextUnlockWithinReach cannot see them)');
  ok(Object.keys(APEX_BY_ID).length === APEX_UPGRADES.length
     && APEX_UPGRADES.every(u => APEX_BY_ID[u.id] === u),
     'APEX_BY_ID enumerates the apex catalogue exactly');
  // The completion crossing above (PROGRESSION LADDER, run 60-100) iterates
  // SHOP_UPGRADES — with apex ids structurally absent from that array the
  // crossing CANNOT move. Asserted here once more so the G25 report can quote
  // this line as the numeric partition proof.
  let fullBuyCost2 = 0;
  for (const u of SHOP_UPGRADES) {
    if (u.id === 'arcade' || u.kind) continue;
    for (let l = 0; l < u.maxLevel; l++) fullBuyCost2 += upgradeCost(u, l);
  }
  for (const c of Object.values(CHARACTERS)) fullBuyCost2 += c.unlockCost;
  let cum3 = 0, crossRun3 = null;
  for (let n = 1; n <= 300; n++) {
    cum3 += projectRunGold(n, {});
    if (cum3 >= fullBuyCost2) { crossRun3 = n; break; }
  }
  // G17 slice 1b RETARGET: the retired analytic model (projectRunGold, ~2-3k
  // per run at the OLD prices) can no longer cross a repriced catalogue inside
  // 300 runs — the crossing is now computed at the MEASURED tier-3 income
  // (754,689g per WON 1800s run = 0.5h). fullBuyCost2 (stat lines + slots +
  // split + luck + chars, 4,490,433g) / 754,689g = 5.95 -> 6 runs = 3.0h.
  // Slice 2 (breadth) owns the road toward the owner's 60h catalogue.
  const runsNeeded = Math.ceil(fullBuyCost2 / GOLD_MODEL.INCOME_TIERS[3].gold);
  cum3 = 0; crossRun3 = null;
  for (let n = 1; n <= 300; n++) {
    cum3 += GOLD_MODEL.INCOME_TIERS[3].gold;
    if (cum3 >= fullBuyCost2) { crossRun3 = n; break; }
  }
  // CHAIN ZAP RETARGET (2026-09-17, owner msg_01M2RENZ): the apex partition is
  // untouched by 'zapchain' (it is not in MID/TOP tier ids), but the row rides
  // SHOP_UPGRADES so the apex-free crossing moved 93 -> 98 with its full-buy
  // (3,771,020g). Old band 92-94; new band 97-99. The pin's JOB is unchanged.
  ok(crossRun3 !== null && crossRun3 === runsNeeded && crossRun3 >= 97 && crossRun3 <= 99,
     `the apex-free completion crossing is unmoved (${crossRun3} runs x 754,689g at the measured tier-3 income = ${(crossRun3 * 0.5).toFixed(1)}h)`);

  // -- pricing: G17 slice 1b RETARGET of the calibration frame --
  // The G25 bands (2-6h / 30-60h) were calibrated against the RETIRED
  // 300s-capped income (11000 x 12 = 132,000 g/h). Slice 1a measured the real
  // end-game rate on this tree — 754,689g per WON 1800s run = 1,509,378 g/h —
  // and slice 1b replaced INCOME_TIERS[3] with that measured value. APEX
  // PRICES ARE FROZEN (G25 charter), so the honest move is to PIN the prices
  // byte-identical (stronger than the old band check: no later slice can
  // reprice apex to "fix" its hours) and quote the hours at the measured
  // rate. The G25 hour-bands no longer hold at the measured rate; apex is a
  // post-completion flex (the gate is full shop ownership, not hours), so the
  // bands' death changes no progression. Disclosed in the G17 1b report.
  const goldPerHour = Math.round(GOLD_MODEL.INCOME_TIERS[3].gold / (1800 / 3600));
  ok(goldPerHour === 1509378,
     `tier-3 income is 754,689g/run x 2 runs/hr (measured 1800s run) = 1,509,378 gold/hr (got ${goldPerHour})`);
  const mark = APEX_BY_ID.apex_mark, fire = APEX_BY_ID.apex_endless_fire;
  ok(mark.baseCost === 550000 && fire.baseCost === 5500000,
     `apex prices are FROZEN at their G25 values (mark ${mark.baseCost}g, fire ${fire.baseCost}g)`);
  const markH = mark.baseCost / goldPerHour, fireH = fire.baseCost / goldPerHour;
  ok(Math.abs(markH - 0.36) < 0.01 && Math.abs(fireH - 3.64) < 0.01,
     `apex hours at the measured rate: mark ${markH.toFixed(2)}h, fire ${fireH.toFixed(2)}h (quoted; G25 bands retired at this rate)`);

  // -- gate: DERIVED from shop ownership, no second source of truth --
  const fresh = makeProfile();
  ok(JSON.stringify(fresh.apex) === '{"owned":[],"enabled":false}',
     'a fresh profile ships apex locked + off');
  ok(apexUnlocked(fresh) === false, 'a fresh profile has the apex gate closed');
  fresh.gold = 999999999;
  const goldBefore = fresh.gold, ownedBefore = JSON.stringify(fresh.apex.owned);
  ok(buyApex(fresh, 'apex_mark') === false,
     'buyApex REFUSES with the gate closed even at 999,999,999 gold');
  ok(fresh.gold === goldBefore && JSON.stringify(fresh.apex.owned) === ownedBefore,
     'the refused purchase mutated NOTHING (gold and owned untouched)');

  // Completed profile: buy EVERY shop row to its own ownership bar.
  const done = makeProfile();
  done.gold = 1e12;
  for (const def of SHOP_UPGRADES) {
    let guard = 0;
    while (!shopRowOwned(done, def) && buyUpgrade(done, def.id)) {
      if (++guard > 100) throw new Error('runaway buy loop on ' + def.id);
    }
  }
  ok(SHOP_UPGRADES.every(def => shopRowOwned(done, def)),
     'the fixture really owns every shop row (the gate condition, verbatim)');
  ok(apexUnlocked(done) === true, 'owning every shop row OPENS the apex gate');
  const goldBefore2 = done.gold;
  ok(buyApex(done, 'apex_mark') === true, 'buyApex succeeds with the gate open');
  ok(done.gold === goldBefore2 - mark.baseCost,
     `the purchase debits EXACTLY baseCost (${goldBefore2} -> ${done.gold}, -${mark.baseCost})`);
  ok(apexOwned(done, 'apex_mark') === true, 'apexOwned sees the purchase');
  ok(buyApex(done, 'apex_mark') === false && done.gold === goldBefore2 - mark.baseCost,
     'a second buy of the same item is refused (no double charge)');
  ok(buyApex(done, 'not_an_apex_id') === false, 'an unknown apex id is refused');
  ok(buyUpgrade(done, 'apex_endless_fire') === false,
     'the classic buy path can NEVER spend on an apex row');
  ok(buyApex(null, 'apex_mark') === false && buyApex(done) === false,
     'buyApex rejects a null profile / missing id without throwing');

  // -- toggle: one boolean, one writer --
  ok(apexEnabled(done) === false, 'the apex toggle defaults OFF');
  ok(setApexEnabled(done, true) === true && apexEnabled(done) === true,
     'setApexEnabled(true) flips the live flag');
  ok(done.apex.enabled === true, 'the flag is persisted on profile.apex.enabled');
  ok(setApexEnabled(done, false) === true && apexEnabled(done) === false,
     'setApexEnabled(false) restores OFF');
  ok(setApexEnabled(null, true) === false, 'a null profile cannot be toggled');
  ok(apexEnabled(null) === false && apexOwned(null, 'apex_mark') === false,
     'readers on a null profile are false, never throw');
}

// ---------- Summary ----------
if (failed) { console.error(`\n${failed} FAILURES`); process.exit(1); }
console.log('\nALL META TESTS PASSED');
