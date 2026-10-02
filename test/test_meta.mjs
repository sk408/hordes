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
import { CONFIG as C, volleyProjectileCap } from '../src/config.js';
import { LEGACY_SHOP_V10 } from '../src/legacy_shop_v10.js';

const sum = (a) => a.reduce((x, y) => x + y, 0);
const per = (id) => SHOP_BY_ID[id].perLevel;

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
  ok(old.gold === 5 + LEGACY_SHOP_V10.dmg[0] && old.purchased.dmg === undefined && old.bestTime === undefined,
     'old-shape profile loads: known fields kept, its old shop level refunded at the v10 price');
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

// ---------- The first purchases against the first payouts ----------
console.log('FIRST PURCHASES:');
{
  const steps = [];
  for (const u of SHOP_UPGRADES) for (let l = 0; l < u.maxLevel; l++) steps.push(upgradeCost(u, l));
  steps.sort((a, b) => a - b);
  const firstRun = RUN_GOLD.FIRST_CLEAR + RUN_GOLD.AWARD;
  const cheapestUnlock = Math.min(...Object.values(CHARACTERS)
    .map(c => c.unlockCost).filter(c => c > 0));   // KNIGHT is deliberately free
  ok(firstRun < cheapestUnlock,
     `a first run cannot afford even the cheapest character (${firstRun}g vs ${cheapestUnlock}g)`);
  ok(steps[0] <= RUN_GOLD.AWARD,
     `the cheapest shop step (${steps[0]}g) is within one run's floor payout (${RUN_GOLD.AWARD}g)`);
  ok(steps.filter(c => c <= firstRun).length >= 3,
     `the first run's payout (${firstRun}g) puts at least three shop steps in reach`);
  // No gap in the price ladder: sorted by price, no step costs more than
  // twice the one before it.
  let worst = 1;
  for (let i = 1; i < steps.length; i++) worst = Math.max(worst, steps[i] / steps[i - 1]);
  ok(worst <= 2, `no price gap in the catalogue (largest step-to-step ratio ${worst.toFixed(2)}x)`);
}

// ---------- Expansion shop lines ----------
console.log('EXPANSION LINES:');
{
  const NEW_IDS = ['crit', 'critdmg', 'greed', 'alchemy', 'artifact'];
  for (const id of NEW_IDS) {
    const u = SHOP_BY_ID[id];
    ok(u && u.baseCost > 0 && u.maxLevel >= 3 && Number.isFinite(u.perLevel),
       `${id} line exists with baseCost/maxLevel/perLevel`);
  }
  // One row per stat line, nothing silently added or dropped (docs/BALANCE_M1.md).
  ok(SHOP_UPGRADES.filter(u => !u.kind).length === 32,
     `32 stat rows (got ${SHOP_UPGRADES.filter(u => !u.kind).length})`);
  ok(new Set(SHOP_UPGRADES.map(u => u.id)).size === SHOP_UPGRADES.length, 'row ids are unique');
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

  // Arcade Pass: single purchase, flagged via hasArcadePass.
  ok(hasArcadePass(makeProfile()) === false, 'fresh profile has no arcade pass');
  const ap = makeProfile();
  ap.gold = upgradeCost(SHOP_BY_ID.arcade, 0);
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
  ok(def.crit === 0 && def.critMult === 1.5 && def.goldMult === 1
     && def.potionPower === 1 && def.dropBonus === 0 && def.artifactLevels === 0
     && def.xpMult === 1 && def.luck === 0,
     'unpurchased: all contract fields present with safe defaults (0/1; crit damage x1.5)');

  const max = applyMetaBonuses(base,
    { crit: 5, critdmg: 5, greed: 5, alchemy: 4, artifact: 3, xp: 5, luck: 5 });
  // Every percent row but Forged Edge is additive.
  ok(max.crit === per('crit') * 5, 'crit: +perLevel chance per level');
  ok(max.critMult === 1.5 + per('critdmg') * 5, 'critMult: the x1.5 base plus perLevel per level');
  ok(max.goldMult === 1 + per('greed') * 5, 'goldMult: 1 + perLevel per level');
  ok(max.potionPower === 1 + per('alchemy') * 4, 'potionPower: 1 + perLevel per level');
  ok(max.dropBonus === 0, 'dropBonus: no shop row feeds it any more');
  ok(max.artifactLevels === per('artifact') * 3, 'artifactLevels: perLevel random weapon levels per level');
  ok(max.luck === 5, 'luck: Fortune level count flows through the stats contract (0..5)');
  ok(max.damage === 8 && max.maxHp === 100, 'base stats untouched by new lines');
}

// ---------- Weapon slots as shop items ----------
console.log('WEAPON SLOTS:');
{
  const p = makeProfile();
  ok(startWeaponSlots(p) === WEAPON_SLOT_START && WEAPON_SLOT_START === 3,
     'fresh profile starts with 3 weapon slots');
  const slotCosts = [0, 1, 2].map(l => upgradeCost(SHOP_BY_ID.slots, l));
  ok(slotCosts[0] < slotCosts[1] && slotCosts[1] < slotCosts[2],
     `slot ladder rises (${slotCosts.join(' / ')})`);

  p.gold = slotCosts[0] - 1;
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
  ok(cost0 === SHOP_BY_ID.dmg.baseCost && cost0 > 50, 'first dmg purchase costs the row base price');
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
  ok(out2.damage === 8 * Math.pow(1 + per('dmg'), 2), 'damage stacks MULTIPLICATIVELY: base x (1 + perLevel)^level');
  ok(out2.maxHp === 100 + per('hp') * 3, 'max HP bonus adds per level');
  ok(out2.manaRegen === C.MANA.REGEN + SHOP_BY_ID.regen.perLevel * 1,
     'mana regen bonus adds per level (base + perLevel, both read from config)');
  ok(out2.xpMult === 1 + per('xp') * 2, 'XP bonus adds per level');
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
  ok(witch.maxHp === 100 + CHARACTERS.WITCH.mods.maxHp && CHARACTERS.WITCH.mods.maxHp < 0 && witch.maxMana === 150, 'WITCH less HP / +50 mana');
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
  ok(composed.maxHp === (100 + per('hp')) + 30, 'shop + character bonuses compose');
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
  ok(old.gold === 2636 + LEGACY_SHOP_V10.dmg[0] + LEGACY_SHOP_V10.hp[0] + LEGACY_SHOP_V10.hp[1]
     && old.purchased.dmg === undefined && old.purchased.hp === undefined,
     'old-economy profile loads with its shop levels refunded at the v10 prices');
  ok(old.unlockedCharacters.includes('WITCH') && old.equippedCharacter === 'WITCH',
     'old unlocks/equip survive migration');
  ok(old.bestTime === 187.5, 'extra fields still round-trip');
  ok(startWeaponSlots(old) === 3, 'weaponSlots defaults to 3 when absent');

  // Over-cap purchased levels (corrupt or future-economy) clamp to maxLevel.
  s.setItem('hordes_profile_v1', JSON.stringify({
    version: 11, gold: 0,
    purchased: { dmg: 99, slots: 7, futureThing: 2, junk: 'x' },
    unlockedCharacters: [], equippedCharacter: 'KNIGHT',
  }));
  const clamped = loadProfile(s);
  ok(clamped.gold === 0 && clamped.purchased.dmg === SHOP_BY_ID.dmg.maxLevel,
     'purchased levels clamp to the current maxLevel (a current save is never refunded)');
  ok(clamped.purchased.slots === SHOP_BY_ID.slots.maxLevel
     && startWeaponSlots(clamped) === MAX_WEAPON_SLOTS,
     'over-cap slot purchases clamp to 6 slots');
  ok(clamped.purchased.futureThing === 2,
     'unknown future upgrade ids are preserved verbatim');
  ok(clamped.purchased.junk === 0 && clamped.unlockedCharacters.includes('KNIGHT'),
     'garbage levels sanitize to 0; empty unlocks fall back to KNIGHT');
  // The same over-cap levels in an OLD save refund the whole row, no more.
  s.setItem('hordes_profile_v1', JSON.stringify({
    gold: 0, purchased: { dmg: 99, slots: 7, futureThing: 2 },
    unlockedCharacters: [], equippedCharacter: 'KNIGHT',
  }));
  const overOld = loadProfile(s);
  ok(overOld.gold === sum(LEGACY_SHOP_V10.dmg) + sum(LEGACY_SHOP_V10.slots)
     && overOld.purchased.dmg === undefined && overOld.purchased.futureThing === 2,
     'an old save with over-cap levels is refunded each whole row once');

  // An old save with slots bought: the slots are refunded with everything else.
  const s3 = fakeStorage();
  s3.setItem('hordes_profile_v1', JSON.stringify({
    gold: 3000,
    purchased: { dmg: 2, slots: 2 },
    unlockedCharacters: ['KNIGHT', 'WITCH'],
    equippedCharacter: 'KNIGHT',
  }));
  const pre = loadProfile(s3);
  ok(pre.purchased.slots === undefined && startWeaponSlots(pre) === WEAPON_SLOT_START
     && pre.gold === 3000 + 125 + 250 + 3000 + 8700,
     'old slot purchases are refunded and the slots return to the start count');
  ok(pre.purchased.crit === undefined && pre.purchased.arcade === undefined
     && hasArcadePass(pre) === false,
     'rows never bought simply default when absent');
  const preStats = applyMetaBonuses({ damage: 8, maxHp: 100 }, pre.purchased);
  ok(preStats.crit === 0 && preStats.goldMult === 1,
     'a refunded profile gets safe stat-contract defaults');

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

  // Key order is price order: a later unlock is a pricier one.
  const prices = Object.values(WEAPON_PRICES);
  ok(prices.every((v, i) => i === 0 || v > prices[i - 1]),
     `weapon prices rise strictly in key order (${prices.join(' / ')})`);

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

// ---------- THE SPLIT SHOT CAP ROW ----------
// The game reads the cap through volleyProjectileCap(), so assert THROUGH it,
// never against the base constant.
{
  const row = SHOP_BY_ID.split;
  ok(!!row, 'the Split Shot cap row exists');
  ok(row.maxLevel >= 3, `the row has real depth (got ${row && row.maxLevel})`);
  ok(row.perLevel === 1, 'each level buys exactly +1 cap');
  const base = C.WEAPON.MAX_PROJECTILES, top = row.maxLevel;
  ok(volleyProjectileCap({}) === base, 'nothing bought => the base cap');
  ok(volleyProjectileCap({ splitCap: 0 }) === base, 'a zero field => the base cap');
  ok(volleyProjectileCap({ splitCap: top }) === base + top,
     `fully bought => base + ${top} (got ${volleyProjectileCap({ splitCap: top })})`);
  const stats = { damage: 8, maxHp: 100, maxMana: 100, splitCap: 0 };
  ok(applyMetaBonuses(stats, { split: top }).splitCap === top,
     'applyMetaBonuses emits the full cap at the top level');
  ok(applyMetaBonuses(stats, { split: 0 }).splitCap === 0, 'and 0 unowned');
  ok(row.baseCost > 0 && row.costGrowth > 1, 'the row prices on a real ladder');
}

// ---------- (G25 slice 1) THE APEX TIER: partition, gate, pricing, toggle ----
// THE PARTITION is the whole design: apex rows live in their OWN catalogue and
// the shop economy must not know they exist.
console.log('APEX TIER (G25):');
{
  // -- partition: apex is invisible to the shop economy --
  ok(SHOP_UPGRADES.length === 46,
     `SHOP_UPGRADES holds exactly its 46 rows (32 stat + 11 weapon + 3 elite; got ${SHOP_UPGRADES.length})`);
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
  // -- pricing: the apex tier sits beyond the whole shop --
  const mark = APEX_BY_ID.apex_mark, fire = APEX_BY_ID.apex_endless_fire;
  const dearest = Math.max(...SHOP_UPGRADES.map(u => upgradeCost(u, u.maxLevel - 1)));
  ok(mark.baseCost > dearest && fire.baseCost > mark.baseCost,
     `apex prices sit above every shop step (mark ${mark.baseCost}g, fire ${fire.baseCost}g, dearest shop step ${dearest}g)`);

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

// ---------- No dead rows: every stat row changes something the game reads ----
console.log('NO DEAD ROWS:');
{
  // Rows whose effect is read from profile.purchased directly, not from stats.
  const READ_ELSEWHERE = {
    potions: (p) => startPotionCount(p) > startPotionCount(makeProfile()),
    slots: (p) => startWeaponSlots(p) > WEAPON_SLOT_START,
    arcade: (p) => hasArcadePass(p),
    escapeskip: (p) => p.purchased.escapeskip === 1,   // read by the escape sequence (main.js)
  };
  const base = { damage: 8, cooldown: 0.55, speed: 60, pickup: 22, projectiles: 1,
                 pierce: 0, maxHp: 100, maxMana: 100 };
  const none = JSON.stringify(applyMetaBonuses(base, {}));
  for (const u of SHOP_UPGRADES.filter(r => !r.kind)) {
    if (READ_ELSEWHERE[u.id]) {
      const p = makeProfile(); p.gold = 1e9;
      ok(buyUpgrade(p, u.id) && READ_ELSEWHERE[u.id](p), `${u.id}: one level changes what the game reads`);
    } else {
      ok(JSON.stringify(applyMetaBonuses(base, { [u.id]: 1 })) !== none,
         `${u.id}: one level changes the run's stats`);
    }
  }
}

// ---------- Summary ----------
if (failed) { console.error(`\n${failed} FAILURES`); process.exit(1); }
console.log('\nALL META TESTS PASSED');
