// HORDES — META LOOP: persistent progression between runs (Sk408-approved).
// Self-contained by contract: menus/UI wiring is a later overseer task, so
// this module only provides pure-ish logic + storage. Imports cleanly under
// node (no DOM) — persistence goes through an injectable storage object that
// defaults to a localStorage-detector with a graceful no-op fallback.
//
// Flow the integrator implements:
//   const profile = loadProfile();          // once at boot
//   ... run happens ...
//   profile.gold += computeRunGold(runStats); saveProfile(profile);
//   // menu: buyUpgrade(profile, 'dmg'), unlockCharacter(profile, 'WITCH'),
//   //        equipCharacter(profile, 'WITCH'), then saveProfile(profile).
//   // run start: const stats = applyCharacter(applyMetaBonuses(baseStats,
//   //        profile.purchased), profile.equippedCharacter);
//   //        potions start at startPotionCount(profile); grant the equipped
//   //        character's startingWeapon via makeWeapon() into state.weapons.
import { CONFIG as C } from './config.js';
import { WEAPON_NAMES } from './weapons.js';   // read-only: display names for shop rows
// W1 SAVE FOUNDATION (src/save.js): versioning, migration, validation and
// export/import live there, catalog-injected so that module stays free of any
// dependency on this one. meta.js is the composition root that supplies the
// live tables (characters, shop rows, valid weapon/elite ids).
import * as SAVE from './save.js';

// ---------- Save-layer re-exports (W1) ----------
// Callers keep importing the profile API from meta.js; the schema constants
// live in save.js. STORAGE_KEY is deliberately unchanged ('hordes_profile_v1')
// so every existing player's save keeps loading.
export const PROFILE_VERSION = SAVE.PROFILE_VERSION;
export const SCHEMA_VERSION = SAVE.SCHEMA_VERSION;
export const STORAGE_KEY = SAVE.STORAGE_KEY;
export const RECOVERY_KEY = SAVE.RECOVERY_KEY;
export const EXPORT_FORMAT = SAVE.EXPORT_FORMAT;
export const VERSION_HISTORY = SAVE.VERSION_HISTORY;
export const detectStorage = SAVE.detectStorage;
export const readRecovery = SAVE.readRecovery;
export const recoveryExportText = SAVE.recoveryExportText;
export const downloadProfile = SAVE.downloadProfile;
export const downloadRecovery = SAVE.downloadRecovery;
export const saveProfileToDisk = SAVE.saveProfileToDisk;
export const readSaveFile = SAVE.readSaveFile;
export const exportProfileText = SAVE.exportProfileText;
export const buildExport = SAVE.buildExport;

// ---------- Per-character namespace accessors (G19, schema v3) ----------
// Re-exported with the live catalog injected, so the progression feature wave
// calls these rather than touching profile.characters[...] directly. See
// src/save.js for the full contract; the storage shape is
//   profile.characters = { [characterId]: { upgrades: { [upgradeId]: level } } }
// Nothing populates it yet — a fresh profile has characters: {} — and this
// module adds no game behaviour or balance, only the accessor seam.
export function getCharacterProgress(profile, characterId) {
  return SAVE.getCharacterProgress(profile, characterId, catalog());
}
export function getCharacterUpgradeLevel(profile, characterId, upgradeId) {
  return SAVE.getCharacterUpgradeLevel(profile, characterId, upgradeId, catalog());
}
export function setCharacterUpgradeLevel(profile, characterId, upgradeId, level) {
  return SAVE.setCharacterUpgradeLevel(profile, characterId, upgradeId, level, catalog());
}
export function addCharacterUpgrade(profile, characterId, upgradeId, amount = 1) {
  return SAVE.addCharacterUpgrade(profile, characterId, upgradeId, amount, catalog());
}
export function resetCharacterProgress(profile, characterId) {
  return SAVE.resetCharacterProgress(profile, characterId, catalog());
}

// ---------- Weapon unlock catalog (WAVE-11 economy, Sk408 directives) ------
// Weapons are BOUGHT now. A new profile starts with the STARTER SET: VOLLEY
// (the base volley every run fires) plus one cheap pick — BOOMERANG, the
// simplest archetype. Every OTHER archetype gets a shop row priced off
// WEAPON_PRICES (a stepped ladder: early weapons cheap, strong ones
// expensive, BEAM is top tier). Ownership lives in profile.unlockedWeapons;
// helpers: weaponUnlocked / unlockWeapon, or buyUpgrade on the shop row.
export const STARTER_WEAPONS = ['VOLLEY', 'BOOMERANG'];

// ---------- Profile (W1: schema + validation live in src/save.js) ----------
// The catalog injects the LIVE tables into the schema layer so validation can
// never drift from the shop/character data it checks against. Declared as a
// function because CHARACTERS / SHOP_BY_ID are defined further down this file
// (function declarations hoist; the body runs at call time, after evaluation).
function catalog() {
  return {
    characters: CHARACTERS,
    shopById: SHOP_BY_ID,
    characterUpgradeById: CHARACTER_UPGRADE_BY_ID,
    validWeapons: VALID_UNLOCK_WEAPONS,
    validElites: VALID_ELITE_IDS,
    starterWeapons: STARTER_WEAPONS,
    baseWeapon: 'VOLLEY',            // the base volley every run fires, always owned
    defaultCharacter: 'KNIGHT',
  };
}

// A fresh, validated, CURRENT-version profile. Carries `version` (schema v2)
// and the starter weapon set.
export function makeProfile() {
  return SAVE.defaultProfile(catalog());
}

// Validate/repair an arbitrary profile object against the live catalog.
// Returns { profile, repairs } — see save.js validateProfile.
export function validateProfile(profile) {
  return SAVE.validateProfile(profile, catalog());
}

// Full load result: { profile, status, from, repairs, migrations, recoveryKey,
// notice }. status: 'fresh' | 'current' | 'migrated' | 'repaired' | 'corrupt'
// | 'future-version'. A corrupt or NEWER-version payload is preserved under
// RECOVERY_KEY (original key untouched) and the caller gets a `notice` string
// to show the player — never a silent wipe. Never throws.
export function loadProfileResult(storage, opts) {
  return SAVE.loadProfileFrom(storage || detectStorage(), catalog(), opts);
}

// Back-compat profile-only loader (existing callers/tests use this shape).
export function loadProfile(storage) {
  return loadProfileResult(storage).profile;
}

// Persist a profile. Always stamps the current schema version. Returns false if
// storage is unavailable/full (callers may ignore — never throws).
export function saveProfile(profile, storage) {
  return SAVE.saveProfileTo(profile, storage || detectStorage());
}

// Full export envelope (format + schemaVersion + exportedAt + profile).
export function exportProfile(profile, opts) {
  return SAVE.buildExport(profile, opts);
}

// Import a save file: validates + migrates, PURE (never touches the live
// profile). Returns { ok, status, profile?, error?, repairs? }.
export function importProfileText(text) {
  return SAVE.importProfileText(text, catalog());
}

// ---------- Run rewards ----------
// RETUNED (Sk408 playtest: the old kills + level*15 + time/10 paid 2636g in
// run 1 and bought most of the shop in ~2 runs). New model targets a typical
// FIRST run at ~700g, growing with permanent upgrades (more damage/XP/slots
// -> longer runs, far more kills) to ~2.5-3k for a fully-upgraded late build.
//
//   gold = BASE(50) + floor(kills / 2) + level*10 + floor(time / 20)
//
// Reference runs the projection below interpolates between:
//   RUN1  { kills: 1000, level: 14, time: 200 }  ->   700g  (fresh profile)
//   LATE  { kills: 4800, level: 34, time: 320 }  ->  2806g  (built out)
// Kills stay the dominant term on purpose: escalation + meta upgrades turn
// late-game kill counts into the thousands, and that growth is the income
// curve the shop ladder is priced against (see projectRunGold + tests).
export const RUN_GOLD = {
  FIRST_CLEAR: 250,   // runStats.firstClear: first time reaching a new best time
};

// WAVE-11 ECONOMY TARGETS (Sk408 directives). Assumptions the unlock prices
// are set against — every number here is TUNABLE, the analytic tests in
// test_meta.mjs re-derive the properties when they move:
//   * GOOD_RUN ~1.8k gold = a competent mid-game run (tier 2 below).
//   * Compounding income growth per tier (upgrades raise survival -> longer
//     runs -> more kills -> more gold -> more upgrades):
//       tier 0  runs 1-5    ~700/run   fresh profile (RUN1 reference)
//       tier 1  runs 6-20   ~1.2k/run  first stat lines + one cheap weapon
//       tier 2  runs 21-45  ~1.8k/run  GOOD_RUN reference, mid build
//       tier 3  runs 46+    ~2.8k/run  LATE reference, full build
//   * (a) ~10 GOOD RUNS buy ~50% of the MID-TIER catalog (every weapon +
//     elite unlock + the full luck ladder; top tier excluded — asserted in
//     test_meta.mjs as half-catalog / goodRun in [9, 13] runs).
//   * (b) any single TOP-TIER item (BEAM, ARCADE_PASS) costs 30+ good runs.
//   The post-integration balance sim re-validates against real playtest
//   curves; INCOME_TIERS is the documented assumption until then.
export const GOLD_MODEL = {
  BASE: 50,
  KILLS_DIV: 2,
  LEVEL_MULT: 10,
  TIME_DIV: 20,
  RUN1: { kills: 1000, level: 14, time: 200 },
  LATE: { kills: 4800, level: 34, time: 320 },
  // Progress denominator: runIndex-1 + purchased levels reaches 1.0 at ~60
  // "progress units" (buying upgrades counts toward build power, so active
  // shoppers hit the LATE income curve sooner than idlers). Stretched 45->60
  // in the EXPANSION retune so the full-buy ladder crosses at ~60-100 runs.
  PROGRESS_SPAN: 60,
  // ---- WAVE-11 additions ----
  GOOD_RUN: { kills: 3000, level: 25, time: 270 },  // -> ~1813g
  INCOME_TIERS: [
    { tier: 0, runs: '1-5',   gold: 700 },   // == computeRunGold(RUN1)
    { tier: 1, runs: '6-20',  gold: 1200 },
    { tier: 2, runs: '21-45', gold: 1800 },   // ~= computeRunGold(GOOD_RUN)
    { tier: 3, runs: '46+',   gold: 2800 },   // ~= computeRunGold(LATE)
  ],
  TOP_TIER_MIN_GOOD_RUNS: 30,
  // The priced-this-wave catalog (shop row ids). MID_TIER: everything a
  // mid-game shopper works through; TOP_TIER: the 30+-good-run trophies.
  MID_TIER_IDS: [
    'weapon_orbit', 'weapon_zap', 'weapon_nova_pulse', 'weapon_scythe',
    'weapon_seeker', 'weapon_mine', 'elite_swift', 'elite_splitting',
    'elite_vampiric', 'luck',
  ],
  TOP_TIER_IDS: ['weapon_beam', 'arcade'],
};

export function computeRunGold(runStats) {
  const kills = Number(runStats.kills) || 0;
  const level = Number(runStats.level) || 0;
  const time = Number(runStats.time) || 0;
  let gold = GOLD_MODEL.BASE
    + Math.floor(kills / GOLD_MODEL.KILLS_DIV)
    + level * GOLD_MODEL.LEVEL_MULT
    + Math.floor(time / GOLD_MODEL.TIME_DIV);
  if (runStats.firstClear) gold += RUN_GOLD.FIRST_CLEAR;
  // GREED shop line: pass stats.goldMult (from applyMetaBonuses) to multiply
  // the whole payout (first-clear bonus included), rounded once at the end.
  return Math.round(gold * (Number(runStats.goldMult) || 1));
}

// Projected income for a given run, interpolating RUN1 -> LATE stats by
// progress = (runIndex-1 + total purchased levels) / PROGRESS_SPAN, clamped
// to 1. GREED levels multiply the projection too (self-consistent: buying
// greed raises modeled income). Deterministic, pure — the ladder test in
// test_meta.mjs uses the zero-purchase projection (worst case) to prove the
// full-buy cost crosses cumulative income around run 60-100.
export function projectRunGold(runIndex, purchases) {
  const levels = Object.values(purchases || {}).reduce((s, l) => s + (Number(l) || 0), 0);
  const p = Math.max(0, Math.min(1, ((Number(runIndex) || 1) - 1 + levels) / GOLD_MODEL.PROGRESS_SPAN));
  const lerp = (a, b) => a + (b - a) * p;
  return computeRunGold({
    kills: lerp(GOLD_MODEL.RUN1.kills, GOLD_MODEL.LATE.kills),
    level: lerp(GOLD_MODEL.RUN1.level, GOLD_MODEL.LATE.level),
    time: lerp(GOLD_MODEL.RUN1.time, GOLD_MODEL.LATE.time),
    goldMult: 1 + (SHOP_BY_ID.greed.perLevel * ((purchases && purchases.greed) || 0)),
  });
}

// ---------- Permanent shop ----------
// EXPANSION RETUNE (Sk408: still too cheap — target hours-days). Full-buy
// cost (ALL stat lines + all characters + all 3 slot purchases) now crosses
// cumulative projected income around run 60-70; the ARCADE PASS (a 140k gold
// sink beyond full-buy; BALANCE-SIM RETUNED 60k -> 140k — the compounding-aware
// 30+good-run standard from tools/balance_sim.mjs) pushes the crossing later.
// The ladder test in test_meta.mjs enforces both. perLevel values are PER
// LEVEL and stack via applyMetaBonuses (field contract documented there).
//
// WEAPON SLOTS ladder re-priced with the expansion: 5000 / 14500 / 42050
// (~4x / ~11x / ~31x a run-20 income of ~1400g). hb1 wires enforcement via
// startWeaponSlots(); perLevel 0 — slots never touch stats.
export const WEAPON_SLOT_START = 3;
export const MAX_WEAPON_SLOTS = 6;

// ---------- WEAPON_PRICES (stepped ladder; archetype order = price order) ----
// Cheap picks first (run-1 income buys ORBIT), each step ~1.5-1.6x, BEAM is
// the top-tier trophy at 30+ good runs (see GOLD_MODEL). Ladder derived from
// the weapons.js archetype list — test_meta.mjs guards drift (every archetype
// is priced here or is a STARTER_WEAPON).
export const WEAPON_PRICES = {
  ORBIT: 400,        // reliable contact damage, cheapest real archetype
  ZAP: 800,          // chain zap: early AoE-ish clear
  NOVA_PULSE: 1300,  // hands-free AoE ring
  SCYTHE: 2000,      // heavy melee sweep
  SEEKER: 3100,      // homing coverage
  MINE: 4800,        // area denial, best-in-class mid pick
  // TOP TIER — BALANCE-SIM RETUNE (Sk408: account for compounding): greed +
  // chest income push a late-career good run to ~3.2k gross, so a 30+good-run
  // trophy must cost 100k+. Sim standard: tools/balance_sim.mjs.
  BEAM: 110000,
};
const VALID_UNLOCK_WEAPONS = new Set([...STARTER_WEAPONS, ...Object.keys(WEAPON_PRICES)]);

// ---------- ELITE MODIFIER UNLOCKS (locked by default) ---------------------
// profile.unlockedElites gates which elite modifiers the run side may use.
// In-run SEMANTICS (what SWIFT/SPLITTING/VAMPIRIC actually do, and whether
// they ride elite enemies or run modifiers) is the integrator's call — this
// module owns only the unlock state + prices (Sk408: shop rows, locked by
// default). buyUpgrade on the shop row or unlockElite(profile, id).
export const ELITE_MODIFIERS = {
  SWIFT: {
    id: 'SWIFT', name: 'Swift', cost: 1800,
    desc: 'Unlock the SWIFT elite modifier: faster elites, richer kills.',
  },
  SPLITTING: {
    id: 'SPLITTING', name: 'Splitting', cost: 3600,
    desc: 'Unlock the SPLITTING elite modifier: elites may split on death.',
  },
  VAMPIRIC: {
    id: 'VAMPIRIC', name: 'Vampiric', cost: 7200,
    desc: 'Unlock the VAMPIRIC elite modifier: elites that heal as they hit.',
  },
};
const VALID_ELITE_IDS = new Set(Object.keys(ELITE_MODIFIERS));

// ROW SHAPE (hb1 renders; WAVE-11 extension in bold):
//   { id, name, desc, baseCost, costGrowth, maxLevel, perLevel }
//       classic stat/slot line — level-tracked in profile.purchased.
//   { ..., kind: 'weapon', weaponId }
//       single-purchase WEAPON unlock row (costGrowth 1, maxLevel 1,
//       perLevel 0). Ownership lives in profile.unlockedWeapons — NOT in
//       profile.purchased; render owned state via shopRowOwned().
//   { ..., kind: 'elite', eliteId }
//       single-purchase ELITE MODIFIER unlock row, same rules, ownership in
//       profile.unlockedElites.
// buyUpgrade() dispatches on kind, so hb1 can keep calling it with the row id
// for every row in SHOP_UPGRADES.
export const SHOP_UPGRADES = [
  // ---- original combat/resource lines (prices unchanged from retune) ----
  { id: 'dmg',     name: 'Forged Edge',    desc: '+10% weapon damage per level',
    baseCost: 150, costGrowth: 1.6, maxLevel: 5, perLevel: 0.10 },
  { id: 'hp',      name: 'Vitality',       desc: '+20 max HP per level',
    baseCost: 120, costGrowth: 1.6, maxLevel: 5, perLevel: 20 },
  { id: 'potions', name: 'Travel Pack',    desc: '+1 starting potion (each kind) per level',
    baseCost: 250, costGrowth: 1.5, maxLevel: 3, perLevel: 1 },
  { id: 'regen',   name: 'Mana Spring',    desc: '+0.5 mana regen per second per level',
    baseCost: 200, costGrowth: 1.6, maxLevel: 4, perLevel: 0.5 },
  { id: 'xp',      name: 'Scholar',        desc: '+10% XP gain per level',
    baseCost: 180, costGrowth: 1.6, maxLevel: 5, perLevel: 0.10 },
  // ---- EXPANSION lines (economy pass) ----
  { id: 'crit',    name: 'Deadly Aim',     desc: '+3% crit chance per level',
    baseCost: 300, costGrowth: 1.7, maxLevel: 5, perLevel: 0.03 },
  { id: 'critdmg', name: 'Deadeye',        desc: '+25% crit damage per level',
    baseCost: 260, costGrowth: 1.7, maxLevel: 5, perLevel: 0.25 },
  { id: 'greed',   name: 'Greed',          desc: '+10% gold from runs per level',
    baseCost: 350, costGrowth: 1.7, maxLevel: 5, perLevel: 0.10 },
  { id: 'alchemy', name: 'Alchemy',        desc: '+25% potion healing/restore per level',
    baseCost: 280, costGrowth: 1.6, maxLevel: 4, perLevel: 0.25 },
  { id: 'scav',    name: 'Scavenger',      desc: '+1.5% potion drop chance per level',
    baseCost: 240, costGrowth: 1.6, maxLevel: 4, perLevel: 0.015 },
  { id: 'artifact',name: 'Starting Artifact', desc: 'Start each run with +1 random weapon level',
    baseCost: 500, costGrowth: 1.8, maxLevel: 3, perLevel: 1 },
  // ---- WAVE-11: luck (multi-level; feeds luckDropWeights for loot.js) ----
  { id: 'luck',    name: 'Fortune',        desc: 'Luck: loot rarity odds shift toward rare/epic per level',
    baseCost: 500, costGrowth: 2.0, maxLevel: 5, perLevel: 1 },
  // ---- WAVE-11: weapon unlock rows (kind 'weapon'; starter set is free) ----
  ...Object.entries(WEAPON_PRICES).map(([wid, price]) => ({
    id: `weapon_${wid.toLowerCase()}`, kind: 'weapon', weaponId: wid,
    name: WEAPON_NAMES[wid] || wid,
    desc: `Unlock the ${WEAPON_NAMES[wid] || wid} archetype for the draft pool.`,
    baseCost: price, costGrowth: 1, maxLevel: 1, perLevel: 0,
  })),
  // ---- WAVE-11: elite modifier unlock rows (kind 'elite') ----
  ...Object.values(ELITE_MODIFIERS).map(e => ({
    id: `elite_${e.id.toLowerCase()}`, kind: 'elite', eliteId: e.id,
    name: `${e.name} Elites`, desc: e.desc,
    baseCost: e.cost, costGrowth: 1, maxLevel: 1, perLevel: 0,
  })),
  // ---- slots + late-game sink ----
  { id: 'slots',   name: 'Weapon Slot',    desc: '+1 weapon slot (start 3, max 6)',
    baseCost: 5000, costGrowth: 2.9, maxLevel: 3, perLevel: 0 },
  { id: 'arcade',  name: 'Arcade Pass',    desc: 'Golden HUD + arcade-run modifiers. The late-game flex.',
    baseCost: 140000, costGrowth: 1, maxLevel: 1, perLevel: 0 },
];
export const SHOP_BY_ID = Object.fromEntries(SHOP_UPGRADES.map(u => [u.id, u]));

// Weapon slots owned by a profile: 3 + purchased 'slots' levels (max 6).
export function startWeaponSlots(profile) {
  const bought = Math.max(0, Number(profile.purchased.slots) || 0);
  return Math.min(MAX_WEAPON_SLOTS, WEAPON_SLOT_START + bought);
}

// Arcade Pass owned? (single 140k purchase — the post-full-buy gold sink;
// hb1 reads this to flip on golden HUD/arcade modifiers.)
export function hasArcadePass(profile) {
  return (Number(profile.purchased.arcade) || 0) > 0;
}

// Cost of the NEXT (level+1) purchase. Level 0-based.
export function upgradeCost(def, currentLevel) {
  return Math.round(def.baseCost * Math.pow(def.costGrowth, currentLevel));
}

// Buy one level of an upgrade. Validates gold + level cap. Mutates profile
// (gold -= cost, purchased[id]++). Returns true on success. WAVE-11: rows
// tagged kind 'weapon'/'elite' dispatch to the unlock paths instead — they
// record ownership in profile.unlockedWeapons/unlockedElites, never in
// profile.purchased (single source of truth per row kind).
export function buyUpgrade(profile, id) {
  const def = SHOP_BY_ID[id];
  if (!def) return false;
  if (def.kind === 'weapon') return unlockWeapon(profile, def.weaponId);
  if (def.kind === 'elite') return unlockElite(profile, def.eliteId);
  const level = profile.purchased[id] || 0;
  if (level >= def.maxLevel) return false;               // level cap
  const cost = upgradeCost(def, level);
  if (profile.gold < cost) return false;                 // insufficient gold
  profile.gold -= cost;
  profile.purchased[id] = level + 1;
  return true;
}

// ---------- Weapon / elite unlock paths (WAVE-11) --------------------------
export function weaponUnlocked(profile, weaponId) {
  return (profile.unlockedWeapons || []).includes(weaponId);
}

// Buy a locked archetype at its WEAPON_PRICES price. Starters/unknown ids
// reject. Mutates profile on success. Returns true on success.
export function unlockWeapon(profile, weaponId) {
  const price = WEAPON_PRICES[weaponId];
  if (price === undefined || weaponUnlocked(profile, weaponId)) return false;
  if (profile.gold < price) return false;
  profile.gold -= price;
  profile.unlockedWeapons.push(weaponId);
  return true;
}

// ---------- Achievement grant paths (G9) ----------------------------------
// Gold-FREE grants. The achievement IS the price, so these skip the currency
// check that the unlock* buyers above enforce. They write the SAME ownership
// fields (unlockedWeapons / unlockedElites / purchased), so the shop, the run
// and the gallery can never disagree about what the player owns — there is one
// notion of "owned", and this is a second way to reach it.
//
// Idempotent: already-owned returns true without re-granting, so a replayed
// achievement (or a double call) is harmless.

export function grantWeapon(profile, weaponId) {
  if (WEAPON_PRICES[weaponId] === undefined) return false;
  if (weaponUnlocked(profile, weaponId)) return true;
  profile.unlockedWeapons.push(weaponId);
  return true;
}

export function grantElite(profile, eliteId) {
  if (!ELITE_MODIFIERS[eliteId]) return false;
  if (eliteUnlocked(profile, eliteId)) return true;
  profile.unlockedElites.push(eliteId);
  return true;
}

// One entry point for ANY shop row, dispatched the same way the shop's own
// buy path and shopRowOwned() dispatch. This is the function achievements.js
// calls, so an unlock id is always a row id and is always auditable against
// SHOP_BY_ID.
export function grantShopRow(profile, rowId) {
  const def = SHOP_BY_ID[rowId];
  if (!def) return false;
  if (def.kind === 'weapon') return grantWeapon(profile, def.weaponId);
  if (def.kind === 'elite') return grantElite(profile, def.eliteId);
  if (shopRowOwned(profile, def)) return true;
  profile.purchased[rowId] = def.maxLevel;
  return true;
}

export function grantCharacter(profile, id) {
  if (!CHARACTERS[id]) return false;
  if (profile.unlockedCharacters.includes(id)) return true;
  profile.unlockedCharacters.push(id);
  return true;
}

export function eliteUnlocked(profile, eliteId) {
  return (profile.unlockedElites || []).includes(eliteId);
}

// Buy a locked elite modifier at its ELITE_MODIFIERS cost.
export function unlockElite(profile, eliteId) {
  const def = ELITE_MODIFIERS[eliteId];
  if (!def || eliteUnlocked(profile, eliteId)) return false;
  if (profile.gold < def.cost) return false;
  profile.gold -= def.cost;
  profile.unlockedElites.push(eliteId);
  return true;
}

// Fully-bought check for ANY shop row (hb1 render helper): weapon/elite rows
// are owned-or-not (single purchase); classic rows are "maxed". For classic
// rows the current LEVEL still comes from profile.purchased[id] as before.
export function shopRowOwned(profile, def) {
  if (def.kind === 'weapon') return weaponUnlocked(profile, def.weaponId);
  if (def.kind === 'elite') return eliteUnlocked(profile, def.eliteId);
  return (profile.purchased[def.id] || 0) >= def.maxLevel;
}

// Full-buy cost of a list of shop row ids (every level of every row; single-
// purchase rows cost their baseCost). The balance seam the WAVE-11 economy
// targets are asserted through (test_meta.mjs + the post-integration sim).
export function catalogCost(rowIds) {
  let sum = 0;
  for (const id of rowIds || []) {
    const def = SHOP_BY_ID[id];
    if (!def) continue;
    for (let l = 0; l < def.maxLevel; l++) sum += upgradeCost(def, l);
  }
  return sum;
}

// ---------- LUCK (WAVE-11; consumed by loot.js / hb4's loot task) ----------
// BASE_RARITY_WEIGHTS is the SHARED export hb4 rebases loot.js onto (its
// current hardcoded RARITY_WEIGHTS already match these values, so nothing
// shifts until luck enters the roll). luckDropWeights(luck) returns the
// rarity weight table at luck level 0..LUCK_MAX_LEVEL: base is common-heavy,
// each luck level compounds COMMON down and shifts RARE/EPIC/LEGENDARY up.
// Weights NEED NOT sum to 100 — consumers normalize like pickRarity().
// Tuning knobs in LUCK_TAPER (per-level rates); 0 = base table exactly.
export const LUCK_MAX_LEVEL = 5;
export const BASE_RARITY_WEIGHTS = { COMMON: 60, RARE: 25, EPIC: 12, LEGENDARY: 3 };
export const LUCK_TAPER = { COMMON: 0.10, RARE: 0.12, EPIC: 0.25, LEGENDARY: 0.35 };

export function luckDropWeights(luck) {
  const L = Math.max(0, Math.min(LUCK_MAX_LEVEL, Number(luck) || 0));
  return {
    COMMON: BASE_RARITY_WEIGHTS.COMMON * Math.pow(1 - LUCK_TAPER.COMMON, L),
    RARE: BASE_RARITY_WEIGHTS.RARE * (1 + LUCK_TAPER.RARE * L),
    EPIC: BASE_RARITY_WEIGHTS.EPIC * (1 + LUCK_TAPER.EPIC * L),
    LEGENDARY: BASE_RARITY_WEIGHTS.LEGENDARY * (1 + LUCK_TAPER.LEGENDARY * L),
  };
}

// Apply permanent bonuses to a stats object. PURE: returns a NEW object,
// never mutates the input. Beyond the makePlayer().stats shape it emits the
// META STAT FIELD CONTRACT (all safe to read unowned — defaults in parens):
//   manaRegen     (C.MANA.REGEN)  Mana Spring: base regen + 0.5/level.
//   xpMult        (1)             Scholar: XP gain x(1 + 0.10/level) — apply
//                                 on gem pickup.
//   crit          (0)             Deadly Aim: crit CHANCE, +0.03/level (max
//                                 0.15). Roll per weapon hit.
//   critMult      (1)             Deadeye: crit damage multiplier,
//                                 1 + 0.25/level — crits deal dmg*critMult.
//   goldMult      (1)             Greed: run payout multiplier, 1 + 0.10/
//                                 level — pass as runStats.goldMult to
//                                 computeRunGold (or multiply its result).
//   potionPower   (1)             Alchemy: multiply HP_HEAL/MP_RESTORE by
//                                 1 + 0.25/level in usePotion.
//   dropBonus     (0)             Scavenger: ADD to POTIONS.DROP_CHANCE,
//                                 +0.015/level (max +0.06).
//   artifactLevels(0)             Starting Artifact: grant this many random
//                                 weapon levels (weapons.js levelUpWeapon)
//                                 at run start, respecting WEAPON_MAX_LEVEL.
//   luck         (0)              Fortune: luck LEVEL count 0..5 — feed to
//                                 luckDropWeights(luck) for loot rarity rolls
//                                 (hb4's loot task consumes this).
export function applyMetaBonuses(stats, purchased) {
  const lvl = id => purchased[id] || 0;
  return {
    ...stats,
    damage: stats.damage * (1 + (SHOP_BY_ID.dmg.perLevel * lvl('dmg'))),
    maxHp: stats.maxHp + SHOP_BY_ID.hp.perLevel * lvl('hp'),
    manaRegen: C.MANA.REGEN + SHOP_BY_ID.regen.perLevel * lvl('regen'),
    xpMult: 1 + SHOP_BY_ID.xp.perLevel * lvl('xp'),
    crit: SHOP_BY_ID.crit.perLevel * lvl('crit'),
    critMult: 1 + SHOP_BY_ID.critdmg.perLevel * lvl('critdmg'),
    goldMult: 1 + SHOP_BY_ID.greed.perLevel * lvl('greed'),
    potionPower: 1 + SHOP_BY_ID.alchemy.perLevel * lvl('alchemy'),
    dropBonus: SHOP_BY_ID.scav.perLevel * lvl('scav'),
    artifactLevels: SHOP_BY_ID.artifact.perLevel * lvl('artifact'),
    luck: SHOP_BY_ID.luck.perLevel * lvl('luck'),
  };
}

// Starting potion count per kind: character base + Travel Pack levels.
// (Not a stat — potions live on player.potions; cap MAX_CARRIED applies to
// ground pickup only, so over-cap starts are mechanically fine.)
export function startPotionCount(profile) {
  const ch = CHARACTERS[profile.equippedCharacter] || CHARACTERS.KNIGHT;
  return ch.startPotions + (profile.purchased.potions || 0);
}

// ---------- PER-CHARACTER UPGRADES (G19 — catalog seam, EMPTY for now) ------
// The progression feature wave fills this with per-character upgrade rows. The
// save layer already understands the shape and clamps a KNOWN row's level to
// its maxLevel exactly like the shared `purchased` map, so adding rows here
// later needs no schema change and no migration. Row shape mirrors the shop:
//   { id, characterId, name, desc, baseCost, costGrowth, maxLevel, perLevel }
// Nothing consumes this yet; the profile's characters namespace stays empty
// until the feature wave populates it through the accessors above.
export const CHARACTER_UPGRADES = [];
export const CHARACTER_UPGRADE_BY_ID = Object.fromEntries(
  CHARACTER_UPGRADES.map(u => [u.id, u]));

// ---------- Characters ----------
// startingWeapon ids match WEAPON_TYPES keys in weapons.js; null = base volley.
export const CHARACTERS = {
  KNIGHT: {
    id: 'KNIGHT', name: 'Knight', unlockCost: 0,
    desc: 'Free. Base volley + Frost Nova. Sturdy: +30 max HP.',
    startingWeapon: null, skill: 'FROST_NOVA', startPotions: 1,
    healOnChest: 0,
    mods: { maxHp: 30 },
  },
  WITCH: {
    id: 'WITCH', name: 'Witch', unlockCost: 1000,
    desc: 'Starts with Chain Zap. Deep mana pool (+50). Frail: -25 max HP.',
    startingWeapon: 'ZAP', skill: 'FROST_NOVA', startPotions: 1,
    healOnChest: 0,
    mods: { maxHp: -25, maxMana: 50 },
  },
  ROGUE: {
    id: 'ROGUE', name: 'Rogue', unlockCost: 2500,
    desc: 'Starts with Boomerang. Fast feet: +20% move speed.',
    startingWeapon: 'BOOMERANG', skill: 'FROST_NOVA', startPotions: 2,
    healOnChest: 0,
    mods: { speedMult: 1.2 },
  },
  PALADIN: {
    id: 'PALADIN', name: 'Paladin', unlockCost: 6000,
    desc: 'Starts with Orbit Blades. Blessed: heals 15 HP on chest open.',
    startingWeapon: 'ORBIT', skill: 'FROST_NOVA', startPotions: 1,
    healOnChest: 15,
    mods: { maxHp: 15 },
  },
};

// Apply a character's modifiers to a stats object. PURE: returns a NEW object.
export function applyCharacter(stats, characterId) {
  const ch = CHARACTERS[characterId];
  if (!ch) return { ...stats };
  const m = ch.mods;
  return {
    ...stats,
    maxHp: stats.maxHp + (m.maxHp || 0),
    maxMana: stats.maxMana + (m.maxMana || 0),
    speed: stats.speed * (m.speedMult || 1),
  };
}

// Unlock with gold. Validates unknown id, already-owned, and gold. Mutates
// profile on success. Returns true on success.
export function unlockCharacter(profile, id) {
  const ch = CHARACTERS[id];
  if (!ch || profile.unlockedCharacters.includes(id)) return false;
  if (profile.gold < ch.unlockCost) return false;
  profile.gold -= ch.unlockCost;
  profile.unlockedCharacters.push(id);
  return true;
}

// Equip an owned character. Returns true on success.
export function equipCharacter(profile, id) {
  if (!CHARACTERS[id] || !profile.unlockedCharacters.includes(id)) return false;
  profile.equippedCharacter = id;
  return true;
}
