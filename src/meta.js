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
import { CONFIG as C, setEngagementRange, DRAFT_LADDER } from './config.js';
import { WEAPONS, WEAPON_NAMES } from './weapons.js';   // read-only: display names for shop rows + the live ZAP hop-range growth the Storm Conduit desc quotes
import { ENCOUNTER_IDS } from './encounters.js';   // G10: derived bestiary catalog
import { TIER_RANK } from './rarity.js';           // G10: tier ordering for bestTier
import { enemyFamily } from './enemy_types.js';    // G19 slice 2: family map for the specialty terms
import { setSpecialtyResolver } from './rewrites.js';   // G19 slice 2: registers the outgoing term (acyclic: rewrites imports config only)
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
// N5: the PRIOR recovery slot ('<key>.prev') — see save.js preservePayload.
export const RECOVERY_PREV_KEY = SAVE.RECOVERY_PREV_KEY;
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

// ---------- Weapon unlock catalog --------------------------------------------
// Weapons are bought. A new profile owns the STARTER SET: VOLLEY (the base
// volley every run fires) and BOOMERANG. Every other archetype has a shop row
// priced in WEAPON_PRICES; ownership lives in profile.unlockedWeapons.
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
// What a run banks (main.js settleRunGold), all of it exactly once at run end:
//   AWARD (flat, x Greed x rampage x the challenge/heat/night pool)
//   + FIRST_CLEAR for the very first run, NEW_BEST for a later record
//   + the run purse: per-kill gold (GOLD_TIER), the survival bonus below and
//     anything else earned in the run, minus what the run spent
//   + the win / milestone bonuses.
// Income is meant to rise smoothly with run length: the survival bonus pays
// SURVIVAL_BASE + SURVIVAL_STEP x n for the n-th SURVIVAL_EVERY seconds
// survived, and ordinary kills pay value / (1 + kills / KILL_SOFTCAP), so a
// long run's kill income flattens instead of running away.
export const RUN_GOLD = {
  FIRST_CLEAR: 250,   // the first run ever finished
  NEW_BEST: 100,      // any later run that sets a new best survival time
  AWARD: 70,          // the floor every run banks
  SURVIVAL_EVERY: 30, // seconds per survival tick
  SURVIVAL_BASE: 30,
  SURVIVAL_STEP: 0.5,
  KILL_SOFTCAP: 200,  // kills at which an ordinary kill pays half
  // Challenge runs add this many percentage points to the AWARD pool; the
  // pool is additive: 100% + challenge + heat - night.
  CHALLENGE_BONUS_PCT: 200,
  NIGHT_PENALTY_PCT: 50,   // night mode pays this many points less
};

// The old analytic payout model. Not a payout any more: only
// tools/balance_sim.mjs and tools/economy_ledger.mjs still read it.
export const GOLD_MODEL = {
  BASE: 50,
  KILLS_DIV: 2,
  LEVEL_MULT: 10,
  TIME_DIV: 20,
  RUN1: { kills: 1000, level: 14, time: 200 },
  LATE: { kills: 4800, level: 34, time: 320 },
  PROGRESS_SPAN: 60,
  GOOD_RUN: { kills: 3000, level: 25, time: 270 },
  INCOME_TIERS: [
    { tier: 0, runs: '1-5',   gold: 150 },
    { tier: 1, runs: '6-20',  gold: 600 },
    { tier: 2, runs: '21-45', gold: 3000 },
    { tier: 3, runs: '46+',   gold: 15000 },
  ],
  TOP_TIER_MIN_GOOD_RUNS: 1,
  MID_TIER_IDS: [
    'weapon_orbit', 'weapon_scythe', 'weapon_ember', 'weapon_beam', 'weapon_ricochet',
    'weapon_zap', 'elite_swift', 'elite_splitting', 'elite_vampiric', 'luck', 'fleetfoot',
  ],
  TOP_TIER_IDS: [
    'weapon_nova_pulse', 'weapon_meteor', 'weapon_mine', 'weapon_seeker', 'arcade',
    'laststand', 'deepread', 'fanfire',
  ],
};

// ---------- RUN-COUNT MILESTONE CHESTS ---------------------------------------
// Runs 50/100/200/500 start with a chest that pays RUNS_WORTH runs' worth of
// the player's own lifetime average income (achievements.totals.gold / runs),
// clamped to [GOLD_PER_RUN_FLOOR, GOLD_PER_RUN_CAP].
export const RUN_CHESTS = {
  MILESTONES: [50, 100, 200, 500],
  RUNS_WORTH: 10,
  GOLD_PER_RUN_FLOOR: RUN_GOLD.AWARD,
  GOLD_PER_RUN_CAP: 30000,
};

/** The next milestone whose chest is unclaimed, or null. PURE. A run counts
 *  when it starts; `claimed` is profile.milestoneChest, the highest milestone
 *  already collected. */
export function nextRunChest(runsStarted, claimed) {
  const cl = Number.isFinite(claimed) ? Math.max(0, Math.floor(claimed)) : 0;
  for (const m of RUN_CHESTS.MILESTONES) {
    if (runsStarted >= m && cl < m) return m;
  }
  return null;
}

/** The gold a milestone chest pays. PURE. */
export function runChestGold(totals) {
  const t = totals || {};
  const runs = Math.max(1, Number(t.runs) || 0);
  const gold = Number(t.gold) || 0;
  const avg = Math.min(RUN_CHESTS.GOLD_PER_RUN_CAP,
    Math.max(RUN_CHESTS.GOLD_PER_RUN_FLOOR, gold / runs));
  return Math.floor(avg * RUN_CHESTS.RUNS_WORTH);
}

// Legacy projection formula (tools only, see GOLD_MODEL).
export function computeRunGold(runStats) {
  const kills = Number(runStats.kills) || 0;
  const level = Number(runStats.level) || 0;
  const time = Number(runStats.time) || 0;
  let gold = GOLD_MODEL.BASE
    + Math.floor(kills / GOLD_MODEL.KILLS_DIV)
    + level * GOLD_MODEL.LEVEL_MULT
    + Math.floor(time / GOLD_MODEL.TIME_DIV);
  if (runStats.firstClear) gold += RUN_GOLD.FIRST_CLEAR;
  return Math.round(gold * (Number(runStats.goldMult) || 1));
}

// ---------- The run purse: per-kill gold -------------------------------------
// Every credited kill pays its tier's value into the in-run wallet
// (profile.runPurse), once, at the kill funnel. Chaff pays a little, so a
// short run still shows the counter moving.
export const GOLD_TIER = {
  CHAFF: 0.5,    // SWARMER / TICK
  GRUNT: 1,      // CHASER
  MID: 2,        // SPITTER / DASHER / WARLOCK
  HEAVY: 4,      // BRUTE / PILLAR / COLOSSUS / SHRIKE
  ELITE: 8,      // elite / eliteMod-stamped
  MID_BOSS: 40,  // the per-wave herald
  BOSS: 120,     // the wave boss
};
// Tier signals: bosses carry boss/midBoss, elites carry elite/eliteMod, the
// wave-2 heavy stamp writes e.purseTier; otherwise the type decides.
const PURSE_TYPE_TIER = {
  SWARMER: 'CHAFF', TICK: 'CHAFF',
  CHASER: 'GRUNT',
  SPITTER: 'MID', DASHER: 'MID', WARLOCK: 'MID',
  BRUTE: 'HEAVY', PILLAR: 'HEAVY', COLOSSUS: 'HEAVY',
  SHRIKE: 'HEAVY',
};
export function purseTier(u) {
  if (!u) return 'CHAFF';
  if (u.boss) return u.midBoss ? 'MID_BOSS' : 'BOSS';
  if (u.elite || u.eliteMod) return 'ELITE';
  if (u.purseTier) return u.purseTier;
  return PURSE_TYPE_TIER[u.typeId] || 'MID';
}
export function purseValue(u) {
  return GOLD_TIER[purseTier(u)];
}

// Legacy projection (tools only, see GOLD_MODEL).
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
// One row per stat. Prices are set against the income of the player who
// reaches them (docs/BALANCE_M1.md): every step is meant to cost about 1-3
// runs. Slot 1 is the base volley; WEAPON_SLOT_START counts it.
export const WEAPON_SLOT_START = 3;
export const MAX_WEAPON_SLOTS = 6;

// ---------- WEAPON_PRICES (key order = price order) --------------------------
// Every archetype in weapons.js is priced here or is a STARTER_WEAPON. The
// order follows measured strength in the AUTO pilot's hands (one weapon beside
// the volley on the same build, docs/BALANCE_M1.md), so a pricier unlock is a
// step up.
export const WEAPON_PRICES = {
  ORBIT: 150,          // contact blades: the first purchase
  SCYTHE: 500,         // melee sweep
  EMBER: 800,          // burst on kill
  BEAM: 1500,          // long piercing line
  RICOCHET: 2500,      // bouncing chain
  ZAP: 4000,           // chain lightning (costs mana)
  JAVELIN: 6000,       // aimed line-pierce
  NOVA_PULSE: 9000,    // hands-free ring
  METEOR: 13000,       // targeted bombardment
  MINE: 20000,         // area denial
  SEEKER: 30000,       // homing coverage: the top of the ladder
};
// Default-loadout order: price, with the free Boomerang ranked where its
// strength sits (above Ember, below Beam).
const WEAPON_RANK = { ...WEAPON_PRICES, BOOMERANG: 1000 };
const VALID_UNLOCK_WEAPONS = new Set([...STARTER_WEAPONS, ...Object.keys(WEAPON_PRICES)]);

// ---------- ELITE MODIFIER UNLOCKS (locked by default) ---------------------
// profile.unlockedElites gates which elite modifiers a run may roll.
export const ELITE_MODIFIERS = {
  SWIFT: {
    id: 'SWIFT', name: 'Swift', cost: 3000,
    desc: 'Unlock the SWIFT elite modifier: faster elites, richer kills.',
  },
  SPLITTING: {
    id: 'SPLITTING', name: 'Splitting', cost: 6000,
    desc: 'Unlock the SPLITTING elite modifier: elites may split on death.',
  },
  VAMPIRIC: {
    id: 'VAMPIRIC', name: 'Vampiric', cost: 10000,
    desc: 'Unlock the VAMPIRIC elite modifier: elites that heal as they hit.',
  },
};
const VALID_ELITE_IDS = new Set(Object.keys(ELITE_MODIFIERS));

// ---------- Live description formatters --------------------------------------
// Every `desc` that quotes a tuning number is a getter built from these, so
// editing the number moves the description everywhere it renders. Getter
// bodies use string concatenation (never template literals): the dev editor's
// row matcher allows one level of nested braces. Percent inputs are fractions.
export function fmtPct(v) {
  return String(Math.round(Number(v) * 10000) / 100);
}
export function fmtNum(v) {
  return String(Math.round(Number(v) * 10000) / 10000);
}

// ROW SHAPE:
//   { id, name, desc, baseCost, costGrowth, maxLevel, perLevel }
//       a stat line, level-tracked in profile.purchased. Level L costs
//       round(baseCost * costGrowth^L), unless `overrides: { level: price }`
//       lists it.
//   { ..., kind: 'weapon', weaponId }   single-purchase weapon unlock;
//       ownership lives in profile.unlockedWeapons.
//   { ..., kind: 'elite', eliteId }     single-purchase elite modifier unlock;
//       ownership lives in profile.unlockedElites.
// buyUpgrade() dispatches on kind. What each stat row does is in
// applyMetaBonuses below.
export const SHOP_UPGRADES = [
  // ---- TIER 1: the first runs --------------------------------------------
  { id: 'dmg',     name: 'Forged Edge',
    get desc() { return '+' + fmtPct(this.perLevel) + '% weapon damage per level, compounding'; },
    baseCost: 60, costGrowth: 1.75, maxLevel: 8, perLevel: 0.25 },
  { id: 'hp',      name: 'Vitality',
    get desc() { return '+' + fmtNum(this.perLevel) + ' max HP per level'; },
    baseCost: 50, costGrowth: 1.55, maxLevel: 10, perLevel: 25 },
  { id: 'focus',   name: 'Rangefinder',
    get desc() { return '+' + fmtNum(this.perLevel) + ' pilot engagement range per level'; },
    baseCost: 80, costGrowth: 1.8, maxLevel: 5, perLevel: 50 },
  { id: 'lodestone', name: 'Lodestone',
    get desc() { return '+' + fmtPct(this.perLevel) + '% pickup radius per level'; },
    baseCost: 150, costGrowth: 1.8, maxLevel: 5, perLevel: 0.20 },
  { id: 'potions', name: 'Travel Pack',
    get desc() { return '+' + fmtNum(this.perLevel) + ' starting potion (each kind) per level'; },
    baseCost: 200, costGrowth: 3, maxLevel: 3, perLevel: 1 },
  { id: 'fleetfoot', name: 'Fleetfoot',
    get desc() { return '+' + fmtPct(this.perLevel) + '% move speed per level'; },
    baseCost: 150, costGrowth: 1.9, maxLevel: 5, perLevel: 0.05 },
  { id: 'xp',      name: 'Scholar',
    get desc() { return '+' + fmtPct(this.perLevel) + '% XP gain per level'; },
    baseCost: 200, costGrowth: 1.9, maxLevel: 5, perLevel: 0.10 },
  // ---- TIER 2: the build takes shape -------------------------------------
  { id: 'hairtrigger', name: 'Hairtrigger',
    get desc() { return '+' + fmtPct(this.perLevel) + '% attack rate per level'; },
    baseCost: 150, costGrowth: 1.9, maxLevel: 6, perLevel: 0.08 },
  { id: 'crit',    name: 'Deadly Aim',
    get desc() { return '+' + fmtPct(this.perLevel) + '% crit chance per level'; },
    baseCost: 200, costGrowth: 1.9, maxLevel: 6, perLevel: 0.06 },
  { id: 'critdmg', name: 'Deadeye',
    get desc() { return '+' + fmtPct(this.perLevel) + '% crit damage per level'; },
    baseCost: 250, costGrowth: 2, maxLevel: 5, perLevel: 0.20 },
  { id: 'greed',   name: 'Greed',
    get desc() { return '+' + fmtPct(this.perLevel) + '% gold from runs per level'; },
    baseCost: 300, costGrowth: 2, maxLevel: 5, perLevel: 0.08 },
  { id: 'alchemy', name: 'Alchemy',
    get desc() { return '+' + fmtPct(this.perLevel) + '% potion healing/restore per level'; },
    baseCost: 250, costGrowth: 2, maxLevel: 4, perLevel: 0.15 },
  { id: 'regen',   name: 'Mana Spring',
    get desc() { return '+' + fmtNum(this.perLevel) + ' mana regen per second per level'; },
    baseCost: 250, costGrowth: 2, maxLevel: 4, perLevel: 0.5 },
  { id: 'well',    name: 'Deep Well',
    get desc() { return '+' + fmtNum(this.perLevel) + ' max mana per level'; },
    baseCost: 250, costGrowth: 2, maxLevel: 4, perLevel: 25 },
  { id: 'thrifty', name: 'Thrifty Casting',
    get desc() { return '-' + fmtPct(this.perLevel) + '% mana cost per level (max -' + fmtPct(this.perLevel * this.maxLevel) + '%)'; },
    baseCost: 300, costGrowth: 2, maxLevel: 4, perLevel: 0.10 },
  { id: 'briarmail', name: 'Briarmail',
    get desc() { return '+' + fmtNum(this.perLevel) + ' thorn damage per level, reflected into every touching enemy'; },
    baseCost: 300, costGrowth: 1.9, maxLevel: 5, perLevel: 10 },
  // ---- the draft: per-run charges (see main.js openDraft) -----------------
  { id: 'reroll',  name: 'Second Look',
    get desc() { return '+' + fmtNum(this.perLevel) + ' draft REROLL per run per level: draw a fresh set of cards'; },
    baseCost: 400, costGrowth: 2.5, maxLevel: 3, perLevel: 1 },
  { id: 'skip',    name: 'Patience',
    get desc() { return '+' + fmtNum(this.perLevel) + ' draft SKIP per run per level: take a heal instead of a card'; },
    baseCost: 400, costGrowth: 3, maxLevel: 2, perLevel: 1 },
  { id: 'banish',  name: 'Cull the Deck',
    get desc() { return '+' + fmtNum(this.perLevel) + ' draft BANISH per run per level: remove a card from this run\'s drafts'; },
    baseCost: 500, costGrowth: 2.5, maxLevel: 3, perLevel: 1 },
  // ---- TIER 3: the volley and the long game -------------------------------
  // Split Shot raises the volley projectile cap (base 3), so the Split Shot
  // draft card keeps adding projectiles instead of converting to damage.
  { id: 'split',   name: 'Split Shot',
    get desc() { return '+' + fmtNum(this.perLevel) + ' volley projectile cap per level'; },
    baseCost: 800, costGrowth: 2.2, maxLevel: 4, perLevel: 1 },
  { id: 'hollowpoint', name: 'Hollowpoint',
    get desc() { return '+' + fmtNum(this.perLevel) + ' pierce on volley and boomerang hits per level'; },
    baseCost: 1500, costGrowth: 2.5, maxLevel: 3, perLevel: 1 },
  { id: 'bloodpact', name: 'Blood Pact',
    get desc() { return '+' + fmtPct(this.perLevel) + '% lifesteal per level'; },
    baseCost: 1000, costGrowth: 2, maxLevel: 5, perLevel: 0.01 },
  { id: 'artifact', name: 'Starting Artifact',
    get desc() { return 'Start each run with +' + fmtNum(this.perLevel) + ' random weapon level per level'; },
    baseCost: 1200, costGrowth: 2.2, maxLevel: 4, perLevel: 1 },
  { id: 'luck',    name: 'Fortune',        desc: 'Luck: world-drop rarity and the level-up draft both shift toward the rarer cards, per level',
    baseCost: 1500, costGrowth: 2, maxLevel: 5, perLevel: 1 },
  { id: 'slots',   name: 'Weapon Slot',
    get desc() { return '+1 weapon slot (start ' + WEAPON_SLOT_START + ', max ' + MAX_WEAPON_SLOTS + ')'; },
    baseCost: 400, costGrowth: 5, maxLevel: 3, perLevel: 0 },
  // Storm Conduit: level 1 uncaps the Chain Zap chain count (range-limited);
  // every level widens the hop range. Published as stats.zapChain.
  { id: 'zapchain', name: 'Storm Conduit',
    get desc() { return 'Chain Zap: UNCAP the chain count (range-limited) and +' + WEAPONS.ZAP.RANGE_PER_LEVEL + ' hop range per level. Needs Chain Zap.'; },
    baseCost: 2000, costGrowth: 1.8, maxLevel: 5, perLevel: 0 },
  // ---- TIER 4: capstones ---------------------------------------------------
  { id: 'fanfire',  name: 'Fan Fire',
    get desc() { return '+' + fmtNum(this.perLevel) + ' volley projectile per level (the volley cap still applies)'; },
    baseCost: 4000, costGrowth: 3, maxLevel: 2, perLevel: 1 },
  { id: 'deepread', name: 'Deep Read',
    get desc() { return '+' + fmtNum(this.perLevel) + ' draft offer per level'; },
    baseCost: 8000, costGrowth: 3, maxLevel: 2, perLevel: 1 },
  { id: 'laststand', name: 'Last Stand',
    get desc() { return 'Revive once per run at ' + fmtPct(DRAFT_LADDER.SECOND_WIND_HP_FRAC) + '% max HP'; },
    baseCost: 30000, costGrowth: 1, maxLevel: 1, perLevel: 1 },
  // Escape Writ: skipping the escape normally forgoes its payout; this keeps it.
  { id: 'escapeskip', name: 'Escape Writ', desc: 'Skip the escape sequence AND still collect its payout (one-time).',
    baseCost: 15000, costGrowth: 1, maxLevel: 1, perLevel: 0 },
  { id: 'arcade',  name: 'Arcade Pass',    desc: 'Golden HUD + arcade-run modifiers. The late-game flex.',
    baseCost: 40000, costGrowth: 1, maxLevel: 1, perLevel: 0 },
  // ---- weapon unlocks (the starter set is free) ----------------------------
  ...Object.entries(WEAPON_PRICES).map(([wid, price]) => ({
    id: `weapon_${wid.toLowerCase()}`, kind: 'weapon', weaponId: wid,
    name: WEAPON_NAMES[wid] || wid,
    desc: `Unlock the ${WEAPON_NAMES[wid] || wid} archetype — equipped into your LOADOUT on buy.`,
    baseCost: price, costGrowth: 1, maxLevel: 1, perLevel: 0,
  })),
  // ---- elite modifier unlocks ----------------------------------------------
  ...Object.values(ELITE_MODIFIERS).map(e => ({
    id: `elite_${e.id.toLowerCase()}`, kind: 'elite', eliteId: e.id,
    name: `${e.name} Elites`, desc: e.desc,
    baseCost: e.cost, costGrowth: 1, maxLevel: 1, perLevel: 0,
  })),
];
export const SHOP_BY_ID = Object.fromEntries(SHOP_UPGRADES.map(u => [u.id, u]));

// Weapon slots owned by a profile: 3 + purchased 'slots' levels (max 6).
export function startWeaponSlots(profile) {
  const bought = Math.max(0, Number(profile.purchased.slots) || 0);
  return Math.min(MAX_WEAPON_SLOTS, WEAPON_SLOT_START + bought);
}

// Arcade Pass owned? (flips on the golden HUD / arcade modifiers.)
export function hasArcadePass(profile) {
  return (Number(profile.purchased.arcade) || 0) > 0;
}

// Cost of the NEXT (level+1) purchase. Level 0-based. A row may carry a
// sparse `overrides` table ({ level: price }); a listed level pays its
// override, every other level pays the growth formula.
export function upgradeCost(def, currentLevel) {
  const ov = def.overrides?.[currentLevel];
  if (ov !== undefined) return ov;
  return Math.round(def.baseCost * Math.pow(def.costGrowth, currentLevel));
}

// F9 (audit round 3, 2026-09-16): THE ONE insufficient-gold gate every buyer
// shares. The M5 audit finding was a CLASS, not a spot bug: `NaN < cost` (and
// `undefined < cost`) evaluate FALSE, so the old `<` form let a poisoned
// wallet PASS the check and buy for free — the NaN then survived into the save
// and was repaired to 0 by save.js, a silent bank wipe. `gold >= cost` fails
// CLOSED for NaN, undefined and negatives alike. All six buyers below route
// through this one helper so the class cannot regrow as a seventh copy.
export function canAfford(profile, cost) {
  return profile.gold >= cost;
}

// SLICE 7 FREE-BUILD (dev runs only; armed from main.js behind the ?dev=1
// gate): when on, every buyer below skips the gold check AND the debit —
// purchases grant for 0. Default OFF, so module-eval state is byte-identical
// to the shipped game and the node suite (which never arms it) measures the
// real economy. ACCOUNTING (hard rule): free purchases still record FULL
// price — in-run freebies land in main.js's dev sink buckets at full cost,
// and the permanent build free buys assemble is fully described by the
// snapshot `upgrades` field, so catalogCost() derives exactly what the free
// build would have cost. Level caps, ownership and unknown-id refusals still
// apply — only the gold moves for free.
let DEV_FREE_BUILD = false;
export function setDevFreeBuild(b) { DEV_FREE_BUILD = !!b; }
export function devFreeBuild() { return DEV_FREE_BUILD; }

// Buy one level of an upgrade. Validates gold + level cap. Mutates profile
// (gold -= cost, purchased[id]++). Returns true on success. WAVE-11: rows
// tagged kind 'weapon'/'elite' dispatch to the unlock paths instead — they
// record ownership in profile.unlockedWeapons/unlockedElites, never in
// profile.purchased (single source of truth per row kind). SGKV4: a WEAPON
// buy also EQUIPS into the loadout (equipBoughtWeapon — bought means active;
// the caller names any displacement), so no buy path can skip the equip.
export function buyUpgrade(profile, id) {
  const def = SHOP_BY_ID[id];
  if (!def) return false;
  if (def.kind === 'weapon') {
    if (!unlockWeapon(profile, def.weaponId, def.id)) return false;
    equipBoughtWeapon(profile, def.weaponId);
    return true;
  }
  if (def.kind === 'elite') return unlockElite(profile, def.eliteId, def.id);
  const level = profile.purchased[id] || 0;
  if (level >= def.maxLevel) return false;               // level cap
  const cost = upgradeCost(def, level);
  // M5 (audit 2026-09-16) -> F9 (round 3): the gate itself moved to the shared
  // canAfford helper (one home for the NaN-fails-closed rule, all buyers).
  if (!DEV_FREE_BUILD && !canAfford(profile, cost)) return false;   // insufficient gold
  if (!DEV_FREE_BUILD) profile.gold -= cost;
  profile.purchased[id] = level + 1;
  // A new slot fills: a stored loadout takes the best owned weapon it lacks.
  if (id === 'slots' && profile.loadout) {
    const cap = startWeaponSlots(profile) - 1;
    const add = defaultLoadout(profile, 99).find(w => !profile.loadout.includes(w));
    if (add && profile.loadout.length < cap) profile.loadout = [...profile.loadout, add];
  }
  // SLICE 10: the per-level spend ledger — the exact paid amount (0 when free-
  // built) lands under the row key, so sell-back refunds what THIS level cost.
  pushSpend(profile, id, DEV_FREE_BUILD ? 0 : cost, level);
  return true;
}

// ---------- Weapon / elite unlock paths (WAVE-11) --------------------------
export function weaponUnlocked(profile, weaponId) {
  return (profile.unlockedWeapons || []).includes(weaponId);
}

// Buy a locked archetype at its WEAPON_PRICES price. Starters/unknown ids
// reject. Mutates profile on success. Returns true on success.
// SLICE 10: rowKey (the shop row id, passed by buyUpgrade's dispatch) owns the
// spend-ledger entry; a direct call ledgers under the weapon id itself.
export function unlockWeapon(profile, weaponId, rowKey) {
  const price = WEAPON_PRICES[weaponId];
  if (price === undefined || weaponUnlocked(profile, weaponId)) return false;
  if (!DEV_FREE_BUILD && !canAfford(profile, price)) return false;   // F9: shared NaN-safe gate
  if (!DEV_FREE_BUILD) profile.gold -= price;
  profile.unlockedWeapons.push(weaponId);
  pushSpend(profile, rowKey || ('weapon:' + weaponId), DEV_FREE_BUILD ? 0 : price, 0);
  return true;
}

// ---------- Loadout -----------------------------------------------------------
// profile.loadout is the player's stored choice, or null for "no choice". With
// no choice a run brings every owned weapon that fits its slots: the
// character's starting weapon first, then the rest, priciest first.
export function defaultLoadout(profile, cap) {
  const ch = CHARACTERS[profile.equippedCharacter] || CHARACTERS.KNIGHT;
  const owned = (profile.unlockedWeapons || []).filter(w => w !== 'VOLLEY' && WEAPONS[w]);
  const price = w => WEAPON_RANK[w] || 0;
  const rest = owned.filter(w => w !== ch.startingWeapon)
    .map((w, i) => ({ w, i })).sort((a, b) => price(b.w) - price(a.w) || a.i - b.i).map(x => x.w);
  const list = owned.includes(ch.startingWeapon) ? [ch.startingWeapon, ...rest] : rest;
  return list.slice(0, Math.max(0, cap === undefined ? startWeaponSlots(profile) - 1 : cap));
}

// The loadout the next run brings: the stored choice (owned weapons only,
// trimmed to the slots) or, with none, the default above.
export function effectiveLoadout(profile, cap) {
  const n = Math.max(0, cap === undefined ? startWeaponSlots(profile) - 1 : cap);
  const stored = (profile.loadout || []).filter(w => weaponUnlocked(profile, w)).slice(0, n);
  return stored.length ? stored : defaultLoadout(profile, n);
}

// Buying a weapon equips it. With a free slot it is simply added; with a full
// loadout one weapon is benched to make room, and the caller names the swap
// on screen. Returns { benched } (the displaced weapon
// id or null), or null when there is nothing to equip. Achievement grants do
// not route here.
export function equipBoughtWeapon(profile, weaponId) {
  if (!weaponUnlocked(profile, weaponId)) return null;
  const cap = Math.max(0, startWeaponSlots(profile) - 1);   // slot 1 = the base volley
  if (cap === 0) return null;
  if (!profile.loadout) {
    // No stored choice: the default already brings it when it fits.
    if (defaultLoadout(profile, cap).includes(weaponId)) return { benched: null };
  }
  const cur = effectiveLoadout(profile, cap);
  if (cur.includes(weaponId)) return { benched: null };
  let benched = null;
  // A stored choice loses its longest-standing pick; the default list is
  // strongest-first, so it loses its weakest.
  if (cur.length >= cap) benched = profile.loadout ? cur.shift() : cur.pop();
  cur.push(weaponId);
  profile.loadout = cur;
  return { benched };
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
// SLICE 10: rowKey owns the spend-ledger entry (see unlockWeapon).
export function unlockElite(profile, eliteId, rowKey) {
  const def = ELITE_MODIFIERS[eliteId];
  if (!def || eliteUnlocked(profile, eliteId)) return false;
  if (!DEV_FREE_BUILD && !canAfford(profile, def.cost)) return false;   // F9: shared NaN-safe gate
  if (!DEV_FREE_BUILD) profile.gold -= def.cost;
  profile.unlockedElites.push(eliteId);
  pushSpend(profile, rowKey || ('elite:' + eliteId), DEV_FREE_BUILD ? 0 : def.cost, 0);
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

// Full-price value of the CURRENT permanent build (the dev-telemetry
// gold_spent seam: the plan's INVESTMENT accounting, never the sell-back
// ledger). Sums the LIVE price of everything owned — classic shop rows level
// by level through the same upgradeCost() (override-aware) the buyers charge,
// weapon/elite/apex unlocks at their live prices, character unlocks and
// per-character upgrades the same way. Free/paid-AGNOSTIC by construction
// (ownership, never the per-level paid record): a free-built level records
// its FULL price — the free-build hard rule — and a paid level records what
// it cost, so toggling free-build mid-collection never moves the figure.
// Achievement grants and the default kit price at their table values (the
// snapshot `upgrades` field prices the same way through catalogCost): the
// figure is "what the build would have cost", not a receipt of gold debited.
// Sell-backs lower it automatically (removed levels are no longer owned).
// Pure read: never mutates, never throws (unknown ids, unpriced starters and
// non-finite levels read as 0).
export function ownedBuildCost(profile) {
  try {
    if (!profile || typeof profile !== 'object') return 0;
    let sum = 0;
    const add = (v) => {
      const n = Math.floor(Number(v) || 0);
      if (Number.isFinite(n) && n > 0) sum += n;
    };
    const owned = (profile.purchased && typeof profile.purchased === 'object')
      ? profile.purchased : {};
    for (const [id, def] of Object.entries(SHOP_BY_ID)) {
      if (!def || def.kind === 'weapon' || def.kind === 'elite') continue;
      const lvl = Math.max(0, Math.min(def.maxLevel || 0, Math.floor(Number(owned[id]) || 0)));
      for (let l = 0; l < lvl; l++) add(upgradeCost(def, l));
    }
    for (const id of profile.unlockedWeapons || []) {
      if (typeof id !== 'string') continue;
      add(WEAPON_PRICES[id]);   // starters carry no price: owned-but-unpriced reads 0
    }
    for (const id of profile.unlockedElites || []) {
      const def = ELITE_MODIFIERS[id];
      if (def) add(def.cost);
    }
    const apexOwned = (profile.apex && Array.isArray(profile.apex.owned)) ? profile.apex.owned : [];
    for (const id of apexOwned) {
      const def = APEX_BY_ID[id];
      if (def) add(def.baseCost);
    }
    for (const id of profile.unlockedCharacters || []) {
      const ch = CHARACTERS[id];
      if (ch) add(ch.unlockCost);   // the default pilot costs 0: the free kit reads 0
    }
    for (const [uid, udef] of Object.entries(CHARACTER_UPGRADE_BY_ID)) {
      if (!udef) continue;
      const lvl = Math.max(0, Math.min(udef.maxLevel || 0,
        Math.floor(Number(getCharacterUpgradeLevel(profile, udef.characterId, uid)) || 0)));
      for (let l = 0; l < lvl; l++) add(upgradeCost(udef, l));
    }
    return sum;
  } catch { return 0; }
}

// ---------- G25 slice 1: THE APEX TIER (post-completion prestige) ----------
// Charter: docs/briefs/G25_APEX_TIER.md + the G25 goals entry. Deliberately
// game-breaking prestige items ABOVE the finished catalogue. APEX rows live
// in their OWN array — NEVER appended to SHOP_UPGRADES — so every existing
// consumer (the shop screen, nextUnlockWithinReach, catalogCost callers, the
// ladder test, the pacing sim) is apex-free BY CONSTRUCTION, which is the
// goal's PARTITION-THE-DATA rule. Every row ALSO carries apex:true so tooling
// can ask without knowing the array. Deterministic only (no random rolls),
// always toggleable OFF, never required by any achievement/trophy/stage/ending,
// and a run with apex ON is marked so a clean clear stays distinguishable.
export const APEX_UPGRADES = [
  // Priced in hours of end-game income (a full 30:00 run banks about 40k,
  // roughly 50k an hour): the proof item about 4 hours, the rule-breaker
  // about 40. Excluded from every completion and pacing figure.
  {
    id: 'apex_mark', name: 'THE MARK OF THE GRIND',
    desc: 'Pure proof. No power at all — a HUD flourish while apex is ON, and your runs are marked APEX so a clean clear stays clean.',
    baseCost: 200000, apex: true, kind: 'apex',
    removes: 'Nothing — it removes no constraint; it is the visible proof you did the grind',
    proof: 'proof-only',
  },
  {
    id: 'apex_endless_fire', name: 'ASCENDANT ARSENAL',
    desc: 'Weapons never stop firing. While apex is ON, every re-arm writes zero cooldown. Deliberately absurd; do not tune it down.',
    baseCost: 2000000, apex: true, kind: 'apex',
    removes: 'The firing cooldown — weapons fire every frame, forever',
    proof: 'rule-breaker',
  },
];

export const APEX_BY_ID = Object.fromEntries(APEX_UPGRADES.map(u => [u.id, u]));

// Ownership reads/writes live HERE (single source of truth, like buyUpgrade).
export function apexOwned(profile, id) {
  return !!profile && !!(profile.apex && Array.isArray(profile.apex.owned) &&
    profile.apex.owned.includes(id));
}

// THE GATE: every row of the normal catalogue owned/maxed opens it, and it
// stays open afterwards (the latched profile.apex.unlocked flag, or any owned
// apex item), so rows added to the catalogue later never lock a finished
// player out of the panel or its ON/OFF toggle. Until it is open the apex
// panel is not rendered at all (not greyed: absent) and buyApex refuses.
export function apexCatalogueComplete(profile) {
  return SHOP_UPGRADES.every(def => shopRowOwned(profile, def));
}

export function apexUnlocked(profile) {
  if (!profile) return false;
  const a = profile.apex;
  if (a && (a.unlocked === true || (Array.isArray(a.owned) && a.owned.some(id => APEX_BY_ID[id])))) return true;
  return apexCatalogueComplete(profile);
}

// Record the unlock on the profile. Returns true when it newly latched (the
// caller persists).
export function latchApexUnlock(profile) {
  if (!profile || !profile.apex || typeof profile.apex !== 'object') return false;
  if (profile.apex.unlocked === true || !apexUnlocked(profile)) return false;
  profile.apex.unlocked = true;
  return true;
}

// Buy one apex item. Refuses when the gate is closed, the id is unknown, the
// item is already owned, or gold is short — and mutates NOTHING on refusal.
export function buyApex(profile, id) {
  const def = APEX_BY_ID[id];
  if (!def || !profile) return false;
  if (!apexUnlocked(profile)) return false;            // gate closed
  if (apexOwned(profile, id)) return false;            // already owned
  if (!DEV_FREE_BUILD && !canAfford(profile, def.baseCost)) return false; // F9: shared NaN-safe gate
  if (!DEV_FREE_BUILD) profile.gold -= def.baseCost;
  profile.apex.owned.push(id);
  pushSpend(profile, 'apex:' + id, DEV_FREE_BUILD ? 0 : def.baseCost, 0);
  return true;
}

// The TOGGLE (Megabonk lesson: apex must always be switchable off). This pair
// is the ONLY sanctioned reader/writer of the raw enabled field.
export function apexEnabled(profile) {
  return !!profile && !!(profile.apex && profile.apex.enabled === true);
}

export function setApexEnabled(profile, on) {
  if (!profile) return false;
  if (!profile.apex || typeof profile.apex !== 'object') return false;
  profile.apex.enabled = on === true;
  return true;
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

// ---- W7b LUCK EXTENSION: Fortune reaches the WHOLE ladder -------------------
// G8 step 1 wired Fortune into the COMMON stat family only (draftCardWeight
// above returns 1 for everything else). The W7b ladder adds RARE and MYTHIC
// tiers, and the brief's extension is: Fortune raises the odds of RARE and
// MYTHIC offers across EVERY card kind — buying Fortune becomes a run-long
// investment in draft quality, not just in the flat family.
//
// Weight of ONE ladder-tier card. tier 'RARE' | 'MYTHIC' reads its base weight
// from DRAFT_LADDER (config.js, the one home); each luck level adds
// LUCK_TIER_BOOST of the base, linear and unclamped in weight (luck itself is
// clamped 0..LUCK_MAX_LEVEL). At luck 0 the table is the base exactly, so an
// unlucky profile drafts the shipped chase rates bit-for-bit. Unlike the G8
// stat-family shift this ADDS weight rather than transferring it — that is the
// point of the extension (a bigger chase slice is what Fortune buys here), and
// the COMMON stat budget invariant (test_draft_luck) is untouched by it. PURE.
export function draftLadderWeight(cardId, tier, luck) {
  const base = tier === 'MYTHIC' ? DRAFT_LADDER.MYTHIC_WEIGHT : DRAFT_LADDER.RARE_WEIGHT;
  const L = Math.max(0, Math.min(LUCK_MAX_LEVEL, Number(luck) || 0));
  return base * (1 + DRAFT_LADDER.LUCK_TIER_BOOST * L);
}

// A crit with no shop rows owned. Deadeye adds on top of it.
export const BASE_CRIT_MULT = 1.5;

// Apply permanent bonuses to a stats object. PURE: returns a NEW object. One
// shop row feeds one field; every field is safe to read unowned.
//   damage        Forged Edge   base x (1 + perLevel)^level (the one compounding row)
//   maxHp         Vitality      + perLevel x level
//   focusRange    Rangefinder   base (C.AUTOPILOT.FOCUS_RANGE) + perLevel x level,
//                               also published to config (setEngagementRange)
//   rateMult      Hairtrigger   x (1 + perLevel x level)
//   crit          Deadly Aim    perLevel x level (chance per hit)
//   critMult      Deadeye       BASE_CRIT_MULT + perLevel x level
//   speedMult     Fleetfoot     x (1 + perLevel x level)
//   pickupMult    Lodestone     x (1 + perLevel x level)
//   xpMult        Scholar       1 + perLevel x level
//   goldMult      Greed         1 + perLevel x level (award and run purse)
//   potionPower   Alchemy       1 + perLevel x level
//   manaRegen     Mana Spring   C.MANA.REGEN + perLevel x level
//   maxMana       Deep Well     + perLevel x level
//   manaCostMult  Thrifty       1 - perLevel x level
//   thorns        Briarmail     + perLevel x level
//   lifesteal     Blood Pact    + perLevel x level
//   pierce        Hollowpoint   + perLevel x level
//   projectiles   Fan Fire      + perLevel x level
//   splitCap      Split Shot    volley projectile cap + level (config.js volleyProjectileCap)
//   artifactLevels Starting Artifact  random weapon levels at run start
//   luck          Fortune       level (loot rarity and draft weights)
//   draftOffers   Deep Read     + level
//   draftRerolls / draftSkips / draftBanishes   per-run draft charges
//   secondWind    Last Stand    one revive per run
//   zapChain      Storm Conduit level (weapons.js updateZap)
export function applyMetaBonuses(stats, purchased) {
  const lvl = id => purchased[id] || 0;
  const per = id => SHOP_BY_ID[id].perLevel * lvl(id);
  const focusRange = C.AUTOPILOT.FOCUS_RANGE + per('focus');
  setEngagementRange(focusRange);
  return {
    ...stats,
    damage: stats.damage * Math.pow(1 + SHOP_BY_ID.dmg.perLevel, lvl('dmg')),
    maxHp: stats.maxHp + per('hp'),
    focusRange,
    rateMult: (stats.rateMult || 1) * (1 + per('hairtrigger')),
    crit: per('crit'),
    critMult: BASE_CRIT_MULT + per('critdmg'),
    speedMult: (stats.speedMult || 1) * (1 + per('fleetfoot')),
    pickupMult: (stats.pickupMult || 1) * (1 + per('lodestone')),
    xpMult: 1 + per('xp'),
    goldMult: 1 + per('greed'),
    potionPower: 1 + per('alchemy'),
    dropBonus: 0,
    manaRegen: C.MANA.REGEN + per('regen'),
    maxMana: stats.maxMana + per('well'),
    manaCostMult: Math.max(0.2, 1 - per('thrifty')),
    manaOnKill: 0,
    thorns: (stats.thorns || 0) + per('briarmail'),
    lifesteal: (stats.lifesteal || 0) + per('bloodpact'),
    pierce: (stats.pierce || 0) + per('hollowpoint'),
    projectiles: (stats.projectiles || 1) + per('fanfire'),
    splitCap: per('split'),
    artifactLevels: per('artifact'),
    luck: per('luck'),
    draftOffers: (stats.draftOffers || 0) + per('deepread'),
    draftRerolls: per('reroll'),
    draftSkips: per('skip'),
    draftBanishes: per('banish'),
    secondWind: !!stats.secondWind || lvl('laststand') > 0,
    stormShards: !!stats.stormShards,
    zapChain: lvl('zapchain'),
  };
}

// G19 slice 1: the ROGUE 'Deep Satchel' row's bonus, read through the accessor
// seam. Shared by startPotionCount (the run seam) and the pilotKit preview so
// the two cannot drift — one definition of the satchel's effect.
export function characterPotionBonus(profile, characterId) {
  const def = CHARACTER_UPGRADE_BY_ID.rogue_satchel;
  if (!def || characterId !== def.characterId) return 0;
  return def.perLevel * getCharacterUpgradeLevel(profile, characterId, def.id);
}

// Starting potion count per kind: character base + Travel Pack levels + the
// ROGUE satchel row (G19). (Not a stat — potions live on player.potions; cap
// MAX_CARRIED applies to ground pickup only, so over-cap starts are
// mechanically fine.)
export function startPotionCount(profile) {
  const ch = CHARACTERS[profile.equippedCharacter] || CHARACTERS.KNIGHT;
  return ch.startPotions + (profile.purchased.potions || 0) +
    characterPotionBonus(profile, profile.equippedCharacter);
}

// ---------- PER-CHARACTER UPGRADES (G19 slice 1: the 8-row table) -----------
// Two rows per character. The row shape is the one the save layer has always
// validated ({ id, characterId, name, desc, baseCost, costGrowth, maxLevel,
// perLevel }); the per-row EFFECT semantics live in applyCharacterUpgrades()
// below, so the shape stays exactly the shared contract. Every perLevel knob
// names its CONSUMPTION SITE (proven with before/after numbers in
// test/test_g19_character_upgrades.mjs):
//   maxHp        main.js startRun (p.hp = stats.maxHp) + HUD
//   damageMult   weapons.js weaponDamage + main.js contact/volley damage
//   maxMana      main.js mana regen/kill fills + HUD (render.js)
//   manaCostMult weapons.js weaponManaCost + perks.js Focus
//   speed        main.js move step (stats.speed * speedMult)
//   healOnChest  main.js chest-open heal (reads stats.healOnChest first —
//                wired by this slice; the character-def fallback is untouched)
//   potions      startPotionCount below (rogue_satchel — the run seam,
//                main.js startRun) and the pilotKit preview, via
//                characterPotionBonus() so the two cannot drift.
// Prices are BREADTH, not a gold sink: maxLevel 3-4, costGrowth 1.5, and no
// row's FULL ladder exceeds 3200 x 1.5^3 = 10800 gold (asserted in the test).
export const CHARACTER_UPGRADES = [
  { id: 'knight_vigor', characterId: 'KNIGHT', name: 'Iron Vigor',
    get desc() { return '+' + fmtNum(this.perLevel) + ' max HP per level'; },
    baseCost: 1200, costGrowth: 1.5, maxLevel: 4, perLevel: 12 },
  { id: 'knight_force', characterId: 'KNIGHT', name: 'Heavy Guard',
    get desc() { return '+' + fmtPct(this.perLevel) + '% damage per level'; },
    baseCost: 1600, costGrowth: 1.5, maxLevel: 3, perLevel: 0.06 },
  { id: 'witch_wellspring', characterId: 'WITCH', name: 'Wellspring',
    get desc() { return '+' + fmtNum(this.perLevel) + ' max mana per level'; },
    baseCost: 1000, costGrowth: 1.5, maxLevel: 4, perLevel: 15 },
  { id: 'witch_focus', characterId: 'WITCH', name: 'Focused Mind',
    get desc() { return 'spells cost ' + fmtPct(this.perLevel) + '% less per level'; },
    baseCost: 1800, costGrowth: 1.5, maxLevel: 3, perLevel: 0.06 },
  { id: 'rogue_fleet', characterId: 'ROGUE', name: 'Fleetfoot',
    get desc() { return '+' + fmtNum(this.perLevel) + ' move speed per level'; },
    baseCost: 1400, costGrowth: 1.5, maxLevel: 3, perLevel: 6 },
  { id: 'rogue_satchel', characterId: 'ROGUE', name: 'Deep Satchel',
    get desc() { return '+' + fmtNum(this.perLevel) + ' starting potion per level'; },
    baseCost: 900, costGrowth: 1.5, maxLevel: 3, perLevel: 1 },
  { id: 'paladin_bulwark', characterId: 'PALADIN', name: 'Bulwark',
    get desc() { return '+' + fmtNum(this.perLevel) + ' max HP per level'; },
    baseCost: 1100, costGrowth: 1.5, maxLevel: 4, perLevel: 10 },
  { id: 'paladin_blessing', characterId: 'PALADIN', name: 'Blessed Chests',
    get desc() { return '+' + fmtNum(this.perLevel) + ' HP healed on chest per level'; },
    baseCost: 1500, costGrowth: 1.5, maxLevel: 3, perLevel: 3 },
];
export const CHARACTER_UPGRADE_BY_ID = Object.fromEntries(
  CHARACTER_UPGRADES.map(u => [u.id, u]));

// Buy one level of a per-character row. Mirrors buyUpgrade exactly: validate
// the row (and that it belongs to characterId), cap at maxLevel, the same
// upgradeCost gold check, debit profile.gold, and persist the level through
// the EXISTING accessor — never a direct write to profile.characters.
// A LOCKED character (not in unlockedCharacters) is refused here too, so the
// data layer enforces what the shop screen shows.
export function buyCharacterUpgrade(profile, characterId, id) {
  const def = CHARACTER_UPGRADE_BY_ID[id];
  if (!def || def.characterId !== characterId) return false;
  if (!profile.unlockedCharacters.includes(characterId)) return false;
  const level = getCharacterUpgradeLevel(profile, characterId, id);
  if (level >= def.maxLevel) return false;                // level cap
  const cost = upgradeCost(def, level);
  if (!DEV_FREE_BUILD && !canAfford(profile, cost)) return false;            // F9: shared NaN-safe gate
  if (!DEV_FREE_BUILD) profile.gold -= cost;
  addCharacterUpgrade(profile, characterId, id, 1);
  pushSpend(profile, charLedgerKey(characterId, id), DEV_FREE_BUILD ? 0 : cost, level);
  return true;
}

// Apply a character's OWN upgrade levels to a stats object. PURE — returns a
// NEW object, input untouched — and ISOLATED — it reads only characterId's
// levels, so a level bought on the KNIGHT can never move the WITCH's numbers.
// A character with no levels adds nothing. Composition order is fixed at the
// two seams that call it (main.js startRun + pilotKit):
//   applyCharacterUpgrades(applyCharacter(applyMetaBonuses(base, purchased),
//     characterId), profile, characterId)
// so the GLOBAL floor keeps applying to every character exactly as today, and
// switching characters resets the per-character portion and never the global.
export function applyCharacterUpgrades(stats, profile, characterId) {
  const out = { ...stats };
  if (!CHARACTERS[characterId]) return out;
  const add = (id, fn) => {
    const n = getCharacterUpgradeLevel(profile, characterId, id);
    if (n > 0) fn(n, CHARACTER_UPGRADE_BY_ID[id].perLevel);
  };
  add('knight_vigor', (n, p) => { out.maxHp += p * n; });
  add('knight_force', (n, p) => { out.damageMult = (out.damageMult || 1) + p * n; });
  add('witch_wellspring', (n, p) => { out.maxMana += p * n; });
  add('witch_focus', (n, p) => { out.manaCostMult = (out.manaCostMult || 1) * Math.pow(1 - p, n); });
  add('rogue_fleet', (n, p) => { out.speed += p * n; });
  add('paladin_bulwark', (n, p) => { out.maxHp += p * n; });
  add('paladin_blessing', (n, p) => {
    out.healOnChest = (CHARACTERS[characterId].healOnChest || 0) + p * n;
  });
  return out;
}

// ---------- G19 slice 2: SPECIALISATION (the family identity) ----------------
// Static character data: the specialty is WHO the pilot is, never a purchase —
// nothing here is written to the profile, and no branch anywhere may refuse a
// run, stage, character or unlock because of it. The terms apply on every run
// with zero purchases through the two existing damage chokes:
//   OUTGOING  src/rewrites.js directHitMult() — every direct weapon hit.
//   INCOMING  the typeMult argument of entities.js contactHitDamage() at its
//             one call site (main.js, the contact loop).
// NEUTRAL IS THE DEFAULT: a character facing a family it has no term for gets
// exactly 1.0 in both directions, and an unknown character or type falls
// through to 1.0 (x1 is byte-identical to today's numbers).
export const SPECIALTY_TERMS = {
  OUT_STRONG: 1.15,   // player deals  +15% to the strong family
  OUT_WEAK: 0.92,     // player deals   -8% to the weak family
  IN_STRONG: 0.88,    // player takes  -12% from the strong family
  IN_WEAK: 1.12,      // player takes  +12% from the weak family
};

// Exactly one strong + one weak family per character. Deliberate assignment:
// every family has exactly one character strong against it and exactly one
// weak, so no family is uniformly trivial and no character is dominant.
export const CHARACTER_SPECIALTIES = {
  KNIGHT: { strong: 'HEAVY', weak: 'RANGED' },   // tanks the slow bodies; ranged chip beats his guard
  WITCH: { strong: 'CHAFF', weak: 'FLYING' },    // area clears the swarm; the flier goes over her ground AoE
  ROGUE: { strong: 'RANGED', weak: 'HEAVY' },    // mobility closes the gap; heavy bodies punish her low HP
  PALADIN: { strong: 'FLYING', weak: 'CHAFF' },  // sustain shrugs off the flier; the swarm outpaces his healing
};

// The OUTGOING term a direct hit carries against typeId. Pure; 1 for any
// unknown character, unknown type, or family the character has no term for.
export function specialtyOutgoingMult(characterId, typeId) {
  const spec = CHARACTER_SPECIALTIES[characterId];
  if (!spec) return 1;
  const fam = enemyFamily(typeId);
  if (!fam) return 1;
  if (fam === spec.strong) return SPECIALTY_TERMS.OUT_STRONG;
  if (fam === spec.weak) return SPECIALTY_TERMS.OUT_WEAK;
  return 1;
}
// Hand the pure term to the OUTGOING choke (src/rewrites.js directHitMult).
// Registered rather than imported there: a static rewrites->meta import would
// close the meta->weapons->rewrites cycle whose evaluation order differs
// between Node and the browser (see rewrites.js).
setSpecialtyResolver(specialtyOutgoingMult);

// The INCOMING term a contact hit from typeId carries. Pure; 1 by default.
export function specialtyIncomingMult(characterId, typeId) {
  const spec = CHARACTER_SPECIALTIES[characterId];
  if (!spec) return 1;
  const fam = enemyFamily(typeId);
  if (!fam) return 1;
  if (fam === spec.strong) return SPECIALTY_TERMS.IN_STRONG;
  if (fam === spec.weak) return SPECIALTY_TERMS.IN_WEAK;
  return 1;
}

// The legible identity: the STRONG/WEAK lines every surface renders. DERIVED
// from CHARACTER_SPECIALTIES + the family map at render time via the shared
// per-family blurbs below, so the screens cannot disagree with the combat
// terms (both surfaces call THIS function; nothing is hand-typed per character).
const FAMILY_LINES = {
  HEAVY: { strong: 'takes the big bodies', weak: 'the big bodies punish' },
  RANGED: { strong: 'closes down chip fire', weak: 'chip fire hurts' },
  CHAFF: { strong: 'clears the swarm', weak: 'the swarm overwhelms' },
  FLYING: { strong: 'answers the flier', weak: 'the flier overruns' },
};
export function specialtyLines(characterId) {
  const spec = CHARACTER_SPECIALTIES[characterId];
  if (!spec) return null;
  return {
    strong: `STRONG: ${spec.strong} — ${FAMILY_LINES[spec.strong].strong}`,
    weak: `WEAK: ${spec.weak} — ${FAMILY_LINES[spec.weak].weak}`,
  };
}

// ---------- Characters ----------
// startingWeapon ids match WEAPON_TYPES keys in weapons.js; null = base volley.
export const CHARACTERS = {
  KNIGHT: {
    id: 'KNIGHT', name: 'Knight', unlockCost: 0,
    get desc() { return 'Free. Base volley + Earthshatter. Sturdy: +' + fmtNum(this.mods.maxHp) + ' max HP.'; },
    startingWeapon: null, skill: 'EARTHSHATTER', startPotions: 1,   // N1 slice 3: his kill-charged ult (was FROST_NOVA)
    healOnChest: 0,
    mods: { maxHp: 30 },
  },
  WITCH: {
    id: 'WITCH', name: 'Witch', unlockCost: 9000,
    get desc() { return 'Chain Reaction Q + Chain Zap start. Deep mana pool (+' + fmtNum(this.mods.maxMana) + '). Frail: ' + fmtNum(this.mods.maxHp) + ' max HP.'; },
    startingWeapon: 'ZAP', skill: 'CHAIN_REACTION', startPotions: 1,
    healOnChest: 0,
    // N1a: she is the mana class — spells cost her half (weaponManaCost reads
    // this), and her pilot defaults to SWARM (the chain only pays on a clump;
    // TAB/G still cycle it like any focus).
    // N1 slice 1: her Q is CHAIN REACTION, her DEFINING move (goals doc N1b
    // item 3) — a mana-fed chain that outreaches and out-jumps her gun, whose
    // kills detonate. FROST_NOVA's slow moved onto the chain; FROST_NOVA
    // itself is unchanged and returns as a draftable card in slice 2.
    mods: { maxHp: -15, maxMana: 50, manaCostMult: 0.5 },
    defaultFocus: 'SWARM',
  },
  ROGUE: {
    id: 'ROGUE', name: 'Rogue', unlockCost: 2500,
    get desc() { return 'Starts with Boomerang. Fast feet: +' + fmtPct(this.mods.speedMult - 1) + '% move speed.'; },
    startingWeapon: 'BOOMERANG', skill: 'AFTERIMAGE', startPotions: 2,   // N1 slice 3: her kill-charged ult (was FROST_NOVA)
    healOnChest: 0,
    mods: { speedMult: 1.2 },
  },
  PALADIN: {
    id: 'PALADIN', name: 'Paladin', unlockCost: 6000,
    get desc() { return 'Starts with Orbit Blades. Blessed: heals ' + fmtNum(this.healOnChest) + ' HP on chest open.'; },
    startingWeapon: 'ORBIT', skill: 'CONSECRATION', startPotions: 1,   // N1 slice 3: his kill-charged ult (was FROST_NOVA)
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
  if (!DEV_FREE_BUILD && !canAfford(profile, ch.unlockCost)) return false;   // F9: shared NaN-safe gate
  if (!DEV_FREE_BUILD) profile.gold -= ch.unlockCost;
  profile.unlockedCharacters.push(id);
  pushSpend(profile, 'cunlock:' + id, DEV_FREE_BUILD ? 0 : ch.unlockCost, 0);
  return true;
}

// Equip an owned character. Returns true on success.
export function equipCharacter(profile, id) {
  if (!CHARACTERS[id] || !profile.unlockedCharacters.includes(id)) return false;
  profile.equippedCharacter = id;
  return true;
}

// ---------- SLICE 10: dev-run shop buy-back (levels are reversible) ----------
// DEV power behind the ?dev=1 gate (the UI lives in main.js and renders only
// with the gate on): every buyable level can be REMOVED where it was bought,
// refunding EXACTLY what that level cost.
//
// THE LEDGER: profile.spendLedger = { [key]: [paid per level, oldest first] }.
// Every buyer above pushes one entry per granted level — the live price at buy
// time (upgradeCost, i.e. `overrides[level] ?? formula`, so an override-priced
// level refunds its override price) or 0 when DEV_FREE_BUILD granted it for
// nothing. Keyed by shop row id for classic rows, 'char:<characterId>:<id>'
// for per-character rows, the shop row id for weapon/elite singleton rows
// ('weapon:'/'elite:'-prefixed fallback for direct unlock calls), 'apex:<id>'
// and 'cunlock:<id>' for the prestige tier and pilot unlocks.
//
// THE MIXED-CASE RULE (free mode toggled mid-run): the CURRENT free-build flag
// is NEVER consulted on sell — only the per-level record. A level bought paid
// refunds its paid amount even while free-build is on; a level granted free
// refunds 0 even after free-build is off. Unledgered levels (achievement
// grants, pre-slice saves) refund 0 — nothing was provably paid — but the
// removal itself still applies and is still reported. Sells are LIFO: the most
// recently bought level (the top) is the one removed, which is the only order
// in which per-level prices stay matched to levels.
//
// EFFECTS: removal only lowers the stored level/ownership. Stats are DERIVED
// (applyMetaBonuses / applyCharacterUpgrades read the live levels at startRun
// and in the kit preview), so there is no cached bonus to go stale — the next
// run, and the preview, simply see fewer levels.
//
// RETURN SHAPE: { ok:true, level, refund } on success — level is the 1-based
// level removed (1 for singletons), refund the credited gold — or { ok:false }
// on any refusal (unknown id, nothing owned, guarded singleton). Refusals
// mutate NOTHING (no ledger touch, no gold move).
const SPEND_LEDGER_CAP = 32;   // generic backstop above every maxLevel (split: 10)

// The ledger container, created lazily so hand-built and pre-slice profiles
// work without a migration (save.js validates it the same way).
export function spendLedgerFor(profile) {
  if (!profile || typeof profile !== 'object') return {};
  if (!profile.spendLedger || typeof profile.spendLedger !== 'object' ||
      Array.isArray(profile.spendLedger)) {
    profile.spendLedger = {};
  }
  return profile.spendLedger;
}

function ledgerArray(profile, key) {
  const book = spendLedgerFor(profile);
  const cur = book[key];
  if (Array.isArray(cur)) return cur;
  const fresh = [];
  book[key] = fresh;
  return fresh;
}

// Per-character ledger key (single home — the buyer and the seller share it).
export function charLedgerKey(characterId, upgradeId) {
  return 'char:' + characterId + ':' + upgradeId;
}

// Record one granted level's paid price. levelsBelow is the level count BEFORE
// this grant: missing entries below it (legacy saves, achievement grants) are
// backfilled as 0-paid — unprovable payment refunds 0 — so the array stays
// 1:1 with owned levels and LIFO pops always match. Never throws.
export function pushSpend(profile, key, paid, levelsBelow) {
  try {
    if (typeof key !== 'string' || !key) return;
    const arr = ledgerArray(profile, key);
    const below = Math.max(0, Math.floor(Number(levelsBelow) || 0));
    while (arr.length < below) arr.push(0);
    const v = Number(paid);
    arr.push(Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);
    while (arr.length > SPEND_LEDGER_CAP) arr.shift();
  } catch { /* the buy already succeeded; the ledger is best-effort */ }
}

// What the TOP level of a ledger key would refund (0 when unledgered).
// Pure read — used for the SELL/RESET labels BEFORE confirming.
export function topRefund(profile, key) {
  try {
    const book = profile && profile.spendLedger;
    const arr = book && book[key];
    if (!Array.isArray(arr) || arr.length === 0) return 0;
    const v = Number(arr[arr.length - 1]);
    return Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
  } catch { return 0; }
}

// Total refund for removing every level under a ledger key. Pure read — the
// RESET label shows this BEFORE the confirming tap.
export function totalRefund(profile, key) {
  try {
    const book = profile && profile.spendLedger;
    const arr = book && book[key];
    if (!Array.isArray(arr)) return 0;
    let sum = 0;
    for (const v of arr) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) sum += Math.floor(n);
    }
    return sum;
  } catch { return 0; }
}

// Credit gold in the save layer's currency domain (floored, non-negative,
// capped at MAX_SAFE_INTEGER — the same domain validateProfile enforces).
function creditGold(profile, amount) {
  const v = Math.floor(Number(amount) || 0);
  if (v <= 0) return 0;
  const cur = Number.isFinite(Number(profile.gold)) ? Math.floor(Number(profile.gold)) : 0;
  profile.gold = Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, cur) + v);
  return v;
}

// Pop one level's refund for a level being removed: trims corrupt excess,
// backfills unledgered levels as 0 (the stated rule), pops the top. Returns
// the refund. The caller owns lowering the level itself.
function popRefund(profile, key, levelBefore) {
  const arr = ledgerArray(profile, key);
  while (arr.length > levelBefore) arr.shift();
  while (arr.length < levelBefore) arr.push(0);
  if (arr.length === 0) return 0;
  const v = Number(arr.pop());
  return Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
}

// Sell one level of ANY shop row, dispatching exactly like buyUpgrade:
// classic rows lose their top level, weapon/elite singletons lose ownership.
// Returns { ok, level, refund } (see the header contract).
export function sellUpgrade(profile, id) {
  const def = SHOP_BY_ID[id];
  if (!def || !profile) return { ok: false };
  if (def.kind === 'weapon') return sellWeaponUnlock(profile, def.weaponId, def.id);
  if (def.kind === 'elite') return sellEliteUnlock(profile, def.eliteId, def.id);
  const level = Math.floor(Number((profile.purchased || {})[id]) || 0);
  if (level < 1) return { ok: false };
  const refund = popRefund(profile, id, level);
  const next = level - 1;
  if (next <= 0) delete profile.purchased[id];
  else profile.purchased[id] = next;
  creditGold(profile, refund);
  return { ok: true, level, refund };
}

// Sell a weapon unlock back. Starter weapons and the base volley are NOT
// sellable (runs assume them — the kit falls back to them when the loadout is
// empty). A weapon riding the loadout is benched off it as part of the sale.
export function sellWeaponUnlock(profile, weaponId, rowKey) {
  if (!profile || WEAPON_PRICES[weaponId] === undefined) return { ok: false };
  if (!weaponUnlocked(profile, weaponId)) return { ok: false };
  if ((STARTER_WEAPONS || []).includes(weaponId)) return { ok: false };
  if (weaponId === 'VOLLEY') return { ok: false };
  const key = rowKey || ('weapon:' + weaponId);
  const refund = popRefund(profile, key, 1);
  profile.unlockedWeapons = (profile.unlockedWeapons || []).filter(w => w !== weaponId);
  if (Array.isArray(profile.loadout)) {
    const kept = profile.loadout.filter(w => w !== weaponId);
    profile.loadout = kept.length ? kept : null;
  }
  creditGold(profile, refund);
  return { ok: true, level: 1, refund };
}

// Sell an elite unlock back. Single ownership bit, same contract.
export function sellEliteUnlock(profile, eliteId, rowKey) {
  if (!profile || !ELITE_MODIFIERS[eliteId]) return { ok: false };
  if (!eliteUnlocked(profile, eliteId)) return { ok: false };
  const key = rowKey || ('elite:' + eliteId);
  const refund = popRefund(profile, key, 1);
  profile.unlockedElites = (profile.unlockedElites || []).filter(e => e !== eliteId);
  creditGold(profile, refund);
  return { ok: true, level: 1, refund };
}

// Sell one level of a per-character row. Mirrors buyCharacterUpgrade: same row
// validation, same level source — only the direction flips.
export function sellCharacterUpgrade(profile, characterId, id) {
  const def = CHARACTER_UPGRADE_BY_ID[id];
  if (!def || def.characterId !== characterId || !profile) return { ok: false };
  const level = getCharacterUpgradeLevel(profile, characterId, id);
  if (level < 1) return { ok: false };
  const key = charLedgerKey(characterId, id);
  const refund = popRefund(profile, key, level);
  setCharacterUpgradeLevel(profile, characterId, id, level - 1);
  creditGold(profile, refund);
  return { ok: true, level, refund };
}

// Sell a pilot unlock back. Refuses the default pilot (validation re-adds it —
// the sale could never stick), pilots with upgrade levels (no orphaned
// levels), and the currently equipped pilot only by re-seating the default
// first (the equipped selection must stay a member of the owned list).
export function sellCharacterUnlock(profile, id) {
  if (!profile || !CHARACTERS[id]) return { ok: false };
  if (!(profile.unlockedCharacters || []).includes(id)) return { ok: false };
  if (id === 'KNIGHT') return { ok: false };
  const rows = CHARACTER_UPGRADES.filter(u => u.characterId === id);
  for (const u of rows) {
    if (getCharacterUpgradeLevel(profile, id, u.id) > 0) return { ok: false };
  }
  const refund = popRefund(profile, 'cunlock:' + id, 1);
  profile.unlockedCharacters = profile.unlockedCharacters.filter(c => c !== id);
  if (profile.equippedCharacter === id) profile.equippedCharacter = 'KNIGHT';
  creditGold(profile, refund);
  return { ok: true, level: 1, refund };
}

// Sell an apex item back. Ownership bit only; the ON/OFF toggle is independent
// and untouched (an enabled-then-sold item simply stops applying, like any
// unowned row).
export function sellApex(profile, id) {
  if (!profile || !APEX_BY_ID[id]) return { ok: false };
  if (!apexOwned(profile, id)) return { ok: false };
  const refund = popRefund(profile, 'apex:' + id, 1);
  profile.apex.owned = (profile.apex.owned || []).filter(a => a !== id);
  creditGold(profile, refund);
  return { ok: true, level: 1, refund };
}
