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
import { ENCOUNTER_IDS } from './encounters.js';   // G10: derived bestiary catalog
import { TIER_RANK } from './rarity.js';           // G10: tier ordering for bestTier
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
// v6 one-time-banner ledger: the sanctioned reader/writer for "has this player
// already been shown banner X?" (see save.js). Re-exported so game code has one
// import home.
export const bannerSeen = SAVE.bannerSeen;
export const markBannerSeen = SAVE.markBannerSeen;

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

// G10: the derived encounter ids as a Set, for save.js's id sanitisation.
const VALID_ENCOUNTER_IDS = new Set(ENCOUNTER_IDS);

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
    // G10 encounters: the DERIVED bestiary catalog + the tier ordering, so
    // save.js validation can sanitize ids / resolve bestTier without importing
    // the game modules (catalog-injected by design, same as every table above).
    validEncounters: VALID_ENCOUNTER_IDS,
    tierRank: TIER_RANK,
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
  // OWNER (2026-09-13): "+200% per level, stacking MULTIPLICATIVELY", then "double
  // the rest of the shop buffs and make them multiplicative increases also for
  // now". Damage compounds by (1 + perLevel) = 3x per level: L1 3x .. L5 243x.
  // FOUR more multiplier rows compound with it (xpMult, critMult, goldMult,
  // potionPower) -- see the META STAT FIELD CONTRACT below, which is the
  // authoritative list. The flat rows stay additive and must: they are absolute
  // amounts (hp/regen/well/siphon/artifact) or values set FROM ZERO
  // (crit chance, dropBonus) where compounding is a silent no-op.
  { id: 'dmg',     name: 'Forged Edge',    desc: '+200% weapon damage per level',
    baseCost: 150, costGrowth: 1.6, maxLevel: 5, perLevel: 2.0 },
  { id: 'hp',      name: 'Vitality',       desc: '+40 max HP per level',
    baseCost: 120, costGrowth: 1.6, maxLevel: 5, perLevel: 40 },
  { id: 'potions', name: 'Travel Pack',    desc: '+2 starting potions (each kind) per level',
    baseCost: 250, costGrowth: 1.5, maxLevel: 3, perLevel: 2 },
  { id: 'regen',   name: 'Mana Spring',    desc: '+1 mana regen per second per level',
    baseCost: 200, costGrowth: 1.6, maxLevel: 4, perLevel: 1 },
  // ---- N1b item 6: the three MANA buyables (the relief valve; mana itself
  // stays punishing at base — see goals N1b item 1). Priced against the
  // mana neighbours above (regen totals ~1851g) and against the class ladder
  // (Knight 0 -> Rogue 2500 -> Paladin 6000 -> Witch 9000): a NON-Witch
  // buying all three spends less than the Witch costs, which is the point —
  // she is the whole kit in one purchase, these are kit-at-a-time.
  { id: 'thrifty', name: 'Thrifty Casting', desc: '-20% mana cost per level (max -80%)',
    baseCost: 350, costGrowth: 1.7, maxLevel: 4, perLevel: 0.20 },
  { id: 'well',    name: 'Deep Well',       desc: '+50 max mana per level',
    baseCost: 250, costGrowth: 1.6, maxLevel: 4, perLevel: 50 },
  { id: 'siphon',  name: 'Siphon',          desc: '+0.10 mana per kill per level',
    baseCost: 500, costGrowth: 1.7, maxLevel: 4, perLevel: 0.10 },
  { id: 'xp',      name: 'Scholar',        desc: '+20% XP gain per level',
    baseCost: 180, costGrowth: 1.6, maxLevel: 5, perLevel: 0.20 },
  // ---- EXPANSION lines (economy pass) ----
  { id: 'crit',    name: 'Deadly Aim',     desc: '+6% crit chance per level',
    baseCost: 300, costGrowth: 1.7, maxLevel: 5, perLevel: 0.06 },
  { id: 'critdmg', name: 'Deadeye',        desc: '+50% crit damage per level',
    baseCost: 260, costGrowth: 1.7, maxLevel: 5, perLevel: 0.50 },
  { id: 'greed',   name: 'Greed',          desc: '+20% gold from runs per level',
    baseCost: 350, costGrowth: 1.7, maxLevel: 5, perLevel: 0.20 },
  { id: 'alchemy', name: 'Alchemy',        desc: '+50% potion healing/restore per level',
    baseCost: 280, costGrowth: 1.6, maxLevel: 4, perLevel: 0.50 },
  { id: 'scav',    name: 'Scavenger',      desc: '+3% potion drop chance per level',
    baseCost: 240, costGrowth: 1.6, maxLevel: 4, perLevel: 0.03 },
  { id: 'artifact', name: 'Starting Artifact', desc: 'Start each run with +2 random weapon levels per level',
    baseCost: 500, costGrowth: 1.8, maxLevel: 3, perLevel: 2 },
  // ---- WAVE-11: luck (multi-level; feeds luckDropWeights for loot.js) ----
  { id: 'luck',    name: 'Fortune',        desc: 'Luck: world-drop rarity and the level-up draft both shift toward the rarer cards, per level',
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
// OWNER'S LADDER (2026-09-13): the target SHARE of drops at luck 0 —
// COMMON 98% / RARE 1.7% / EPIC 0.2% / LEGENDARY 0.02%. These are the raw
// shares, NOT rescaled to sum to 100 (they total 99.92): pickRarity normalizes,
// so the ladder has ONE home and one meaning. The old 60/25/12/3 table made the
// top tier a certainty by volume — measured 280 world drops in one fresh run
// against a 3% weight = 8-15 legendaries per run. At 0.02% the same 280 drops
// pay 1 legendary per ~18 runs.
export const BASE_RARITY_WEIGHTS = { COMMON: 98, RARE: 1.7, EPIC: 0.2, LEGENDARY: 0.02 };
// Per-luck-level rates; 0 = base table exactly.
// LEGENDARY 0.35 -> 0.7 (owner-APPROVED): at 0.35 a LINEAR taper lifted the
// legendary WEIGHT only 2.75x at max Fortune (500g x2.0 growth x5 levels =
// 15,500g), so the buyable flooded the tier instead of unlocking it (measured
// luck 0 = 8.4/run, luck 5 = 20.9/run on the old base). On the new ladder 0.7
// reaches 4.5x at the cap: luck 0 = 1 per ~17.8 runs, luck 5 = 1 per ~2.4
// (x7.4 gain), so maxing Fortune is what makes the top tier REACHABLE.
export const LUCK_TAPER = { COMMON: 0.10, RARE: 0.12, EPIC: 0.25, LEGENDARY: 0.7 };

export function luckDropWeights(luck) {
  const L = Math.max(0, Math.min(LUCK_MAX_LEVEL, Number(luck) || 0));
  return {
    COMMON: BASE_RARITY_WEIGHTS.COMMON * Math.pow(1 - LUCK_TAPER.COMMON, L),
    RARE: BASE_RARITY_WEIGHTS.RARE * (1 + LUCK_TAPER.RARE * L),
    EPIC: BASE_RARITY_WEIGHTS.EPIC * (1 + LUCK_TAPER.EPIC * L),
    LEGENDARY: BASE_RARITY_WEIGHTS.LEGENDARY * (1 + LUCK_TAPER.LEGENDARY * L),
  };
}

// ---- G8 STEP 1 (owner decision 2026-09-12: option 6, build order 1 -> 3 -> 4 -> 2):
// LUCK TOUCHES THE DRAFT.
// Fortune already shifts WORLD-DROP rarity (luckDropWeights above). The owner's ask
// named the OTHER half too ("what the run OFFERS"), and that is the level-up draft.
// Same rarity-weight-table idea, applied to the draft pool.
//
// WHAT IS "RARE" HERE: the draft has no rarity today, so this adds a POWER TIER TAG
// (metadata - no new cards, no new content) to the seven UPGRADES stat cards. A tier
// says how much a card is worth when it shows up, not how often it shows up: at luck 0
// every stat card still weighs exactly 0.3.
//   COMMON   - utility: useful sometimes, no direct damage (move speed, pickup radius)
//   UNCOMMON - solid, repeatable combat value (max HP, pierce, cooldown)
//   RARE     - the run-defining cards (multiplicative damage, extra projectile)
// Weapon cards (grants = new archetypes, level-ups = ladder steps) are EXCLUDED by
// design: they carry the shipped weight 1, they ARE the weapon economy, and the draft
// sim tracks that ratio as lever L1 - so it stays literally true here.
//
// THE INVARIANT THAT MAKES THIS SAFE: the shift TRANSFERS weight, it does not ADD it.
// Each Fortune level moves 10% of the COMMON group's base weight onto the RARE tier, so
// the stat family's total weight - the draft's stat BUDGET - is exactly unchanged at
// every luck level. Luck buys RARITY, never a bigger pool. luckDraftWeights below is
// weight-conserving BY CONSTRUCTION (sum of count_tier * m_tier == 7), and
// test/test_draft_luck.mjs asserts that to 1e-12 as well as the direction. At luck 0
// the table is the all-1.0 identity, so an unlucky profile drafts the shipped pool
// bit-for-bit.
export const DRAFT_RARITY = {
  // COMMON - utility, no direct damage
  speed: 'COMMON', pickup: 'COMMON',
  // UNCOMMON - solid, repeatable value
  hp: 'UNCOMMON', pierce: 'UNCOMMON', rate: 'UNCOMMON',
  // RARE - run-defining (multiplicative damage, extra projectile)
  dmg: 'RARE', multi: 'RARE',
};
export const DRAFT_BASE_WEIGHTS = { COMMON: 1, UNCOMMON: 1, RARE: 1 };
// Fraction of the COMMON group's base weight moved to RARE per luck level
// (0.05 * 5 = 0.25 at the cap). Deliberately conservative - see the measured curve in
// test/test_draft_luck.mjs and the tick note in docs/HORDES_GOALS_2026-09-12.md: at 0.10
// the same mechanism measured 4x run income, which would gut G17 (the real-grind economy).
export const DRAFT_LUCK_TRANSFER = 0.05;
// Per-card base weight of a stat card in the shipped draft pool (main.js / draft_sim).
export const DRAFT_STAT_WEIGHT = 0.3;

const DRAFT_TIER_COUNT = { COMMON: 0, UNCOMMON: 0, RARE: 0 };
for (const k of Object.values(DRAFT_RARITY)) DRAFT_TIER_COUNT[k]++;

/** Draft rarity weight table at luck level 0..LUCK_MAX_LEVEL. Luck 0 is the all-1.0
 *  identity (the shipped pool). Weight-conserving: the COMMON group's loss is exactly
 *  the RARE group's gain, so the stat budget never moves. UNCOMMON holds its ground -
 *  that IS the effect (its share rises as COMMON's falls). */
export function luckDraftWeights(luck) {
  const L = Math.max(0, Math.min(LUCK_MAX_LEVEL, Number(luck) || 0));
  const f = Math.min(0.9, DRAFT_LUCK_TRANSFER * L);   // never zero out COMMON
  const out = { ...DRAFT_BASE_WEIGHTS };
  out.COMMON = 1 - f;
  out.RARE = 1 + (f * DRAFT_TIER_COUNT.COMMON) / DRAFT_TIER_COUNT.RARE;
  return out;
}

/** Rarity tier of a draft stat card (unknown ids read as COMMON). */
export function draftRarityOf(cardId) {
  return DRAFT_RARITY[cardId] || 'COMMON';
}

/** Weight of ONE draft card. 'stat' = the shipped 0.3 family, luck-shifted through the
 *  shared table; anything else ('weapon') is 1.0, never luck-shifted. PURE.
 *  This is THE seam main.js openDraft() and tools/draft_sim.mjs both call, so a
 *  measurement of one is a measurement of the other. */
export function draftCardWeight(cardId, kind, luck) {
  if (kind !== 'stat') return 1;
  return DRAFT_STAT_WEIGHT * luckDraftWeights(luck)[draftRarityOf(cardId)];
}

// Apply permanent bonuses to a stats object. PURE: returns a NEW object,
// never mutates the input. Beyond the makePlayer().stats shape it emits the
// META STAT FIELD CONTRACT (all safe to read unowned — defaults in parens):
//   THE COMPOUNDING SET: damage, xpMult, critMult, goldMult, potionPower are ALL
//   (1 + perLevel)^level. Every other row is additive per level, and the flat
//   rows must stay that way (see damage/hp notes). Five rows compound, not one.
//   damage        (C.PLAYER base) Forged Edge: COMPOUNDS — base x (1 + 2.0)^level
//                                 = 3x per level (L5 = 243x).
//   manaRegen     (C.MANA.REGEN)  Mana Spring: base regen + 1/level.
//   xpMult        (1)             Scholar: COMPOUNDS x(1.20)^level (L5 = 2.49x) —
//                                 apply on gem pickup.
//   crit          (0)             Deadly Aim: crit CHANCE, +0.06/level (0.30 at
//                                 L5). Roll per weapon hit. NOT compoundable: it
//                                 is set FROM ZERO, and 0 x anything is 0.
//   critMult      (1)             Deadeye: crit damage multiplier, COMPOUNDS
//                                 (1.50)^level (L5 = 7.59x) — dmg*critMult.
//   goldMult      (1)             Greed: run payout multiplier, COMPOUNDS
//                                 (1.20)^level (L5 = 2.49x) — pass as
//                                 runStats.goldMult to computeRunGold.
//   potionPower   (1)             Alchemy: COMPOUNDS (1.50)^level in usePotion
//                                 (L4 = 5.06x).
//   dropBonus     (0)             Scavenger: ADD to POTIONS.DROP_CHANCE,
//                                 +0.03/level (max +0.12). NOT compoundable —
//                                 an added chance, not a factor.
//   artifactLevels(0)             Starting Artifact: grant this many random
//                                 weapon levels (weapons.js levelUpWeapon)
//                                 at run start, respecting WEAPON_MAX_LEVEL.
//   luck         (0)              Fortune: luck LEVEL count 0..5 — feed to
//                                 luckDropWeights(luck) for loot rarity rolls
//                                 (hb4's loot task consumes this).
//   manaCostMult (1)              Thrifty Casting: mana-cost modifier,
//                                 1 - 0.20/level, CLAMPED at 0.2 = the full
//                                 authorised -80% (owner). The clamp does not
//                                 bind at this rate, so all four levels pay:
//                                 0.8 / 0.6 / 0.4 / 0.2. The ONE number both
//                                 cost seams read — weaponManaCost (weapons.js)
//                                 and skillManaCost (perks.js) — and NEITHER
//                                 seam rounds or floors, the clamp here is the
//                                 only limit. It COMPOSES with applyCharacter's
//                                 own mult (the Witch's 0.5) AND with Focus
//                                 (FOCUS_MANA_MULT in perks.js), so a Witch at
//                                 L4 pays base x 0.5 x 0.2 = 0.1, and Focus on
//                                 top of that goes lower again. Intended
//                                 stacking, but it means -80% is a SHOP floor,
//                                 not a floor on the final cost.
//   maxMana      (makePlayer)     Deep Well: ADDs +50/level to the base pool.
//                                 applyCharacter adds the character's own
//                                 maxMana mod AFTER this, so the Witch's +50
//                                 still stacks as it always did.
//   manaOnKill   (0)              Siphon: flat mana granted per KILL (an
//                                 event, never frame-scaled) at the main.js
//                                 kill seam, clamped to stats.maxMana.
export function applyMetaBonuses(stats, purchased) {
  const lvl = id => purchased[id] || 0;
  return {
    ...stats,
    // Forged Edge COMPOUNDS (owner rule, 2026-09-13): (1 + perLevel)^level, not
    // 1 + perLevel*level. The only multiplicative row in the shop.
    damage: stats.damage * Math.pow(1 + SHOP_BY_ID.dmg.perLevel, lvl('dmg')),
    maxHp: stats.maxHp + SHOP_BY_ID.hp.perLevel * lvl('hp'),
    manaRegen: C.MANA.REGEN + SHOP_BY_ID.regen.perLevel * lvl('regen'),
    // MULTIPLIER rows COMPOUND (owner rule, 2026-09-13): (1 + perLevel)^level.
    // These four are (1+x) factors, so compounding is well-defined. The FLAT
    // rows below stay additive and must: `crit` and `dropBonus` are values SET
    // from zero (0 x anything = 0, so compounding would silently disable the
    // row), and hp/regen/well/siphon/artifact are absolute amounts, not factors.
    xpMult: Math.pow(1 + SHOP_BY_ID.xp.perLevel, lvl('xp')),
    crit: SHOP_BY_ID.crit.perLevel * lvl('crit'),
    critMult: Math.pow(1 + SHOP_BY_ID.critdmg.perLevel, lvl('critdmg')),
    goldMult: Math.pow(1 + SHOP_BY_ID.greed.perLevel, lvl('greed')),
    potionPower: Math.pow(1 + SHOP_BY_ID.alchemy.perLevel, lvl('alchemy')),
    dropBonus: SHOP_BY_ID.scav.perLevel * lvl('scav'),
    artifactLevels: SHOP_BY_ID.artifact.perLevel * lvl('artifact'),
    luck: SHOP_BY_ID.luck.perLevel * lvl('luck'),
    // OWNER: "80% cost cut for casting sounds fine. Allow the full 80." So the
    // floor is 0.2, not the old 0.6 -- at the doubled rate the clamp never binds
    // (L4 = 1 - 0.20*4 = 0.2 exactly), which means all four levels pay instead
    // of L3/L4 buying nothing. The clamp stays as the guard so a future rate
    // bump cannot silently blow past the authorised -80%.
    manaCostMult: Math.max(0.2, 1 - SHOP_BY_ID.thrifty.perLevel * lvl('thrifty')),
    maxMana: stats.maxMana + SHOP_BY_ID.well.perLevel * lvl('well'),
    manaOnKill: SHOP_BY_ID.siphon.perLevel * lvl('siphon'),
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
    id: 'WITCH', name: 'Witch', unlockCost: 9000,
    desc: 'Starts with Chain Zap. Deep mana pool (+50). Frail: -25 max HP.',
    startingWeapon: 'ZAP', skill: 'FROST_NOVA', startPotions: 1,
    healOnChest: 0,
    // N1a: she is the mana class — spells cost her half (weaponManaCost reads
    // this), and her pilot defaults to SWARM (the chain only pays on a clump;
    // TAB/G still cycle it like any focus).
    mods: { maxHp: -25, maxMana: 50, manaCostMult: 0.5 },
    defaultFocus: 'SWARM',
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
    // N1a: multiplicative mana-cost modifier (WITCH 0.5). Missing = neutral 1,
    // and it COMPOSES with any stats-level mult a future perk might carry.
    manaCostMult: (stats.manaCostMult || 1) * (m.manaCostMult || 1),
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
