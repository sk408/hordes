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
import { WEAPON_NAMES } from './weapons.js';   // read-only: display names for shop rows
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
  // E1 (owner directive 2026-09-14, "fixed amount at end of the run, yes"): the
  // end-of-run meta award is a FIXED base, retired from the computeRunGold
  // formula. It is the FLOOR a bad short run still banks; performance pays
  // through the tier-weighted purse below instead. Multiplied by the goldMult
  // chain at settlement (GREED / stakes / rampage); FIRST_CLEAR and the maw
  // bonus stay SEPARATE additions on top. VALUE: BASE 50-derived — the old
  // formula's floor for a bad short run measured ~60-80 (BASE 50 + the small
  // level/time terms), the floor the owner called "fine as it is"; 70 sits in
  // that band. Measured against the real-loop cohorts (docs/briefs/
  // E1_RUN_PURSE.md ACCEPTANCE-1/2): a maxed 300s-capped run EARNS ~11k in-run,
  // so the award is ~0.6% of a good run's income — a pure floor, never the
  // dominant term; a fresh death still banks it in full.
  AWARD: 70,
};

// WAVE-11 ECONOMY TARGETS (Sk408 directives), RE-DERIVED for the E1 run purse
// (owner directive 2026-09-14). The old analytic bands (700/1200/1800/2800,
// computeRunGold references) priced the shop; the purse economy pays
// per-kill tier gold + the fixed RUN_GOLD.AWARD instead, so the tiers below
// are now MEASURED, not analytic: real-loop cohorts, 6 seeded runs per arm,
// 300s cap, banked income per run (docs/briefs/E1_RUN_PURSE.md ACCEPTANCE-3):
//   * Compounding income growth per tier (upgrades raise survival -> longer
//     runs -> more kills -> more purse gold -> more upgrades):
//       tier 0  runs 1-5    ~70/run    fresh profile: dies ~15s / 0 kills at
//                                        shipped difficulty; banks the bare
//                                        AWARD floor (FIRST_CLEAR one-time
//                                        250 excluded from the band)
//       tier 1  runs 6-20   ~100/run   partial build (median banked 95.5)
//       tier 2  runs 21-45  ~200/run   half-maxed build (median banked 185)
//       tier 3  runs 46+    ~11k/run   maxed build (median banked 11694;
//                                        CENSORED — 5/6 runs truncated at
//                                        ~287s of the 300s cap then settled)
//   * (a) ~2 GOOD (maxed) RUNS buy ~50% of the MID-TIER catalog (every weapon
//     + elite unlock + the full luck ladder; top tier excluded — asserted in
//     test_meta.mjs as half-catalog / goodRun in [1.5, 2.5] runs; was [9, 13]
//     under the old formula, good-run 1813).
//   * (b) any single TOP-TIER item (BEAM, ARCADE_PASS) costs 10+ good runs
//     (was 30+; the shop is deliberately NOT repriced — HORDES_GOALS
//     2026-09-12 "do not reprice the shop to keep a test green").
//   The mid tiers are DEGENERATE at shipped difficulty (sub-max builds die in
//   under a minute and earn almost nothing); the curve is effectively the
//   award floor until a build can farm wave 3. computeRunGold / RUN1 /
//   GOOD_RUN / LATE below are retained ONLY for the balance-sim projection
//   (tools/balance_sim.mjs SIM_ASSUMPTIONS.goodRunGold) — they no longer
//   describe a payout.
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
  GOOD_RUN: { kills: 3000, level: 25, time: 270 },  // -> ~1813g (RETIRED payout reference; sim-only)
  // E1 measured purse income (see the GOLD_MODEL header block). Tier 0 pins
  // the AWARD floor; tier 3 is the good-run reference the shop assertions
  // below read as `good`.
  INCOME_TIERS: [
    { tier: 0, runs: '1-5',   gold: 70 },     // == RUN_GOLD.AWARD (measured floor)
    { tier: 1, runs: '6-20',  gold: 100 },    // partial build, median 95.5
    { tier: 2, runs: '21-45', gold: 200 },    // half-maxed build, median 185
    // G17 slice 1b (2026-09-15): REPLACED WITH THE MEASURED VALUE — the old
    // 11000 was a 300s-CAPPED cohort median (~69x low). The maxed cohort on
    // this tree (n=1, seed 1337, tools/economy_ledger.mjs --measure) banked
    // 754,689g in ONE WON 1800s run settled through settleRunGold (kills
    // 244185, cause RUN SURVIVED; raw log /tmp/g17_1b/maxed_r1.log). A record
    // of measurement, not an intent knob (the G17 charter froze payouts).
    { tier: 3, runs: '46+',   gold: 754689 },
  ],
  // G17 slice 1b: re-derived at the MEASURED good run (754,689g = 0.5h of
  // end-game play). The single-item cap (3h) bounds ANY row at <= 6 good
  // runs, so the old "10+" bar is arithmetically unreachable post-reprice;
  // the top bar is 5+ good runs (~2.5h+). Post-reprice: BEAM 6.0,
  // ARCADE_PASS 5.6 good runs.
  TOP_TIER_MIN_GOOD_RUNS: 5,
  // The priced-this-wave catalog (shop row ids). MID_TIER: everything a
  // mid-game shopper works through; TOP_TIER: the 30+-good-run trophies.
  MID_TIER_IDS: [
    'weapon_orbit', 'weapon_zap', 'weapon_nova_pulse', 'weapon_scythe',
    'weapon_seeker', 'weapon_mine', 'elite_swift', 'elite_splitting',
    'elite_vampiric', 'luck',
    // G17 slice 2 breadth: the ONE mid-priced addition (2,015,000g full-buy)
    // keeps the 10-good-run mid share at 33.2% (band 30-40%).
    'fleetfoot',
  ],
  // G17 slice 2 breadth: 15 premium rungs at 3,980,000-4,433,000g full-buy
  // (5.3-5.9 measured good runs each, all inside the 3h single-item cap) -
  // "a few hours to get one top tier item, let alone all of them" (owner).
  TOP_TIER_IDS: [
    'weapon_beam', 'arcade',
    'briarmail', 'lodestone', 'hollowpoint', 'ironheart', 'hairtrigger',
    'headsman', 'bloodpact', 'fanfire', 'deepread', 'aethertap',
    'grandelixir', 'deepfont', 'eagleeye', 'staticfield', 'laststand',
  ],
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

// ---------- E1 RUN PURSE: tier-weighted per-kill gold -----------------------
// Owner directive (2026-09-14): "tier weighted gold counter ... mid wave boss
// gives a nice gold drop and the chaff drops a bit less." The purse is an
// IN-RUN wallet (profile.runPurse): every kill credits it ONCE, at the kill
// funnel, as a per-kill EVENT (dt-free — 60Hz and 120Hz pay the same per
// corpse, the evolution-token convention). ONE data table, one knob per tier —
// never a squared curve, and never re-derived from hp at run end. The SAME
// kill is never paid twice: the end award is RUN_GOLD.AWARD (flat), so these
// drops are the only per-kill gold surface.
export const GOLD_TIER = {
  CHAFF: 0,      // SWARMER — the wave-2 horde's chaff pays ~nothing by design
  GRUNT: 1,      // CHASER — "near zero", but the counter still ticks
  MID: 3,        // SPITTER / DASHER / WARLOCK / TICK — the ordinary field
  HEAVY: 8,      // BRUTE / PILLAR / COLOSSUS / SHRIKE — clearly > 1
  ELITE: 15,     // elite / eliteMod-stamped — "~1.0" unit of real gold
  MID_BOSS: 60,  // the per-wave herald — reads as "a nice drop"
  BOSS: 150,     // the wave boss — the heavy payout
};
// The tier signals: bosses carry boss/midBoss stamps (main.js), elites carry
// elite / eliteMod; E2's heavy stamp (main.js stampHeavy) writes e.purseTier
// directly — the purse follows the BODY, so a wave-1 TICK still pays CHAFF
// and only a real mid-boss-bodied heavy pays HEAVY. Otherwise the ENEMY_TYPES
// hp ladder sorts the field: chaff = the cheap swarm tier (hpMult <= 0.5),
// heavy = hpMult >= 3.
const PURSE_TYPE_TIER = {
  SWARMER: 'CHAFF', TICK: 'CHAFF',
  CHASER: 'GRUNT',
  SPITTER: 'MID', DASHER: 'MID', WARLOCK: 'MID',
  BRUTE: 'HEAVY', PILLAR: 'HEAVY', COLOSSUS: 'HEAVY',
  SHRIKE: 'HEAVY',   // E2 (R7): the flying heavy lands at HEAVY or above
};
export function purseTier(u) {
  if (!u) return 'CHAFF';
  if (u.boss) return u.midBoss ? 'MID_BOSS' : 'BOSS';
  if (u.elite || u.eliteMod) return 'ELITE';
  if (u.purseTier) return u.purseTier;   // E2: the heavy stamp's direct word
  return PURSE_TYPE_TIER[u.typeId] || 'MID';
}
export function purseValue(u) {
  return GOLD_TIER[purseTier(u)];
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
// G17 SLICE 1b REPRICE (2026-09-15): the economy was ~69x too fast at the top
// (measured end-game rate 1,509,378g/h — a WON 1800s maxed run banks 754,689g;
// the old ladder totalled 0.3h of end-game income). Prices are the lever,
// payouts are FROZEN. Ladder rules now: the FIRST purchase stays inside 1-3
// tier-0/1 runs (ORBIT 200g / 70g = 2.9 runs), 10 good runs buy 30-40% of the
// mid catalogue (measured share 36.4%), and NO single item exceeds the 3h cap
// (4,528,134g). BEAM stays the top of the ladder at ~3h (2.98h). Ladder
// derived from the weapons.js archetype list — test_meta.mjs guards drift
// (every archetype is priced here or is a STARTER_WEAPON).
export const WEAPON_PRICES = {
  ORBIT: 200,          // reliable contact damage, cheapest real archetype (FIRST purchase: 2.9 tier-0 runs)
  ZAP: 600000,         // chain zap: early AoE-ish clear (0.40h)
  NOVA_PULSE: 1200000, // hands-free AoE ring (0.79h)
  SCYTHE: 2000000,     // heavy melee sweep (1.32h)
  SEEKER: 2800000,     // homing coverage (1.85h)
  MINE: 4200000,       // area denial, best-in-class mid pick (2.78h)
  // TOP TIER (G17 1b): "a few hours" at the measured rate = inside the 3h cap
  // (4,528,134g) and >= TOP_TIER_MIN_GOOD_RUNS (5) good runs = 5.96 runs.
  BEAM: 4500000,
};
const VALID_UNLOCK_WEAPONS = new Set([...STARTER_WEAPONS, ...Object.keys(WEAPON_PRICES)]);

// ---------- ELITE MODIFIER UNLOCKS (locked by default) ---------------------
// profile.unlockedElites gates which elite modifiers the run side may use.
// In-run SEMANTICS (what SWIFT/SPLITTING/VAMPIRIC actually do, and whether
// they ride elite enemies or run modifiers) is the integrator's call — this
// module owns only the unlock state + prices (Sk408: shop rows, locked by
// default). buyUpgrade on the shop row or unlockElite(profile, id).
export const ELITE_MODIFIERS = {
  // G17 slice 1b reprice: mid-tier unlock rungs on the same measured ladder
  // (1.00h / 1.19h / 1.85h at 1,509,378g/h); the old 1800/3600/7200 ladder
  // totalled 0.009h of end-game income.
  SWIFT: {
    id: 'SWIFT', name: 'Swift', cost: 1000000,
    desc: 'Unlock the SWIFT elite modifier: faster elites, richer kills.',
  },
  SPLITTING: {
    id: 'SPLITTING', name: 'Splitting', cost: 1800000,
    desc: 'Unlock the SPLITTING elite modifier: elites may split on death.',
  },
  VAMPIRIC: {
    id: 'VAMPIRIC', name: 'Vampiric', cost: 2800000,
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
  // ---- A1: THE PILOT'S ENGAGEMENT RADIUS (owner-ordered 2026-09-14) --------
  // Sk408: "the pilot targets enemies that are off the screen even ... have the
  // pilot have a certain distance that they can target enemies, and we can add
  // a buyable to the store that allows that distance to be increased."
  // The BASE radius (100, owner-set) lives in config.js AUTOPILOT.FOCUS_RANGE
  // and is applied on every target-selection path in controllers.js; this row
  // is the +50px/level climb, so L1..L5 = 150..350 and a MAXED pilot engages on
  // arrival at the 280-322 spawn ring (the base 100 declines almost everything
  // pricier than the visible half-height of 150). ADDITIVE, like the other flat
  // amount rows — it is a distance, not a (1+x) multiplier.
  // PRICE IS PROVISIONAL (baseCost 200, costGrowth 1.6, maxLevel 5): it sits on
  // the cheap rung next to Vitality/Forged Edge because at base 100 the pilot
  // declines most engagements, so this is a core power line, not a flavour row.
  // RE-CHECK IT IN E1's ECONOMY PASS (E1 re-prices the whole ladder); measured
  // effect of the full L1..L5 line on the modeled ladder: full-buy cost
  // 162771g -> 165933g, the modeled crossing moves run 81 -> 83 (target 60-100).
  { id: 'focus',   name: 'Rangefinder',    desc: '+50 pilot engagement range per level',
    baseCost: 200, costGrowth: 1.6, maxLevel: 5, perLevel: 50 },
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
  // G17 slice 1b reprice: luck is the TOP rung of the mid catalogue. Full-buy
  // = baseCost x 31 (growth 2.0, 5 levels) = 4,340,000g = 2.87h — inside the
  // 3h cap, and it takes the 10-good-run share to the 36.4% target band.
  { id: 'luck',    name: 'Fortune',        desc: 'Luck: world-drop rarity and the level-up draft both shift toward the rarer cards, per level',
    baseCost: 140000, costGrowth: 2.0, maxLevel: 5, perLevel: 1 },
  // ---- G17 SLICE 2: THE BREADTH PASS (2026-09-15) ---------------------------
  // Slice 1 measured the catalogue at 19.6h of end-game income against the
  // owner's 60h+ target (shortfall 40.4h = +60,972,047g at the MEASURED
  // 1,509,378g/h divisor). The single-item cap (3h = 4,528,134g) bounds any
  // fix at N >= 14 rows, so the hours are bought with BREADTH: 16 new stat
  // rows, each feeding a stats seam the game ALREADY consumes (see
  // applyMetaBonuses below - a row whose perLevel nothing reads is a defect).
  // Shape per the goal's own fix (goals G17 items 1-3): every row sits inside
  // the cap, the cheapest rows stay untouched (first purchase still 2.9
  // tier-0 runs), and the top rungs are priced as "a few hours to get ONE
  // top tier item, let alone all of them" (owner) - 5.3-5.9 measured good
  // runs each. ONE mid rung (fleetfoot, 2,015,000g full-buy) keeps the
  // 10-good-run mid share inside its 30-40% band (33.2%) and halfRuns at
  // 15.07 (band 12.5-16.7) - both asserted in test_meta/test_economy_reprice.
  // New catalogue: 94,696,233g across 48 items = 62.7h >= 60h.
  // MID rung (the one mid catalogue addition; join MID_TIER_IDS below):
  { id: 'fleetfoot', name: 'Fleetfoot',    desc: '+8% move speed per level',
    baseCost: 65000, costGrowth: 2.0, maxLevel: 5, perLevel: 0.08 },
  // TOP rungs (join TOP_TIER_IDS below; full-buy 3,980,000-4,433,000g each):
  { id: 'briarmail', name: 'Briarmail',    desc: '+10 thorn damage per level, reflected into every touching enemy',
    baseCost: 133000, costGrowth: 2.0, maxLevel: 5, perLevel: 10 },
  { id: 'lodestone', name: 'Lodestone',    desc: '+25% pickup radius per level',
    baseCost: 134000, costGrowth: 2.0, maxLevel: 5, perLevel: 0.25 },
  { id: 'hollowpoint', name: 'Hollowpoint', desc: '+1 pierce on volley and boomerang hits per level',
    baseCost: 136000, costGrowth: 2.0, maxLevel: 5, perLevel: 1 },
  { id: 'ironheart', name: 'Iron Heart',   desc: '+120 max HP per level',
    baseCost: 137000, costGrowth: 2.0, maxLevel: 5, perLevel: 120 },
  { id: 'hairtrigger', name: 'Hairtrigger', desc: '+12% attack rate per level',
    baseCost: 139000, costGrowth: 2.0, maxLevel: 5, perLevel: 0.12 },
  { id: 'headsman', name: 'Headsman',      desc: '+15% all damage per level',
    baseCost: 141000, costGrowth: 2.0, maxLevel: 5, perLevel: 0.15 },
  { id: 'bloodpact', name: 'Blood Pact',   desc: '+2% lifesteal per level',
    baseCost: 143000, costGrowth: 2.0, maxLevel: 5, perLevel: 0.02 },
  { id: 'fanfire',  name: 'Fan Fire',      desc: '+1 volley projectile per level (the volley cap still applies)',
    baseCost: 410000, costGrowth: 2.6, maxLevel: 3, perLevel: 1 },
  { id: 'deepread', name: 'Deep Read',     desc: '+1 draft offer per level',
    baseCost: 1650000, costGrowth: 1.6, maxLevel: 2, perLevel: 1 },
  { id: 'aethertap', name: 'Aether Tap',   desc: '+0.60 mana per kill',
    baseCost: 3980000, costGrowth: 1, maxLevel: 1, perLevel: 0.60 },
  { id: 'grandelixir', name: 'Grand Elixir', desc: 'Potions heal and restore twice as much',
    baseCost: 4040000, costGrowth: 1, maxLevel: 1, perLevel: 1.0 },
  { id: 'deepfont', name: 'Deep Font',     desc: '+3 mana regen per second',
    baseCost: 4060000, costGrowth: 1, maxLevel: 1, perLevel: 3 },
  { id: 'eagleeye', name: 'Eagle Eye',     desc: '+12% crit chance',
    baseCost: 4120000, costGrowth: 1, maxLevel: 1, perLevel: 0.12 },
  { id: 'staticfield', name: 'Static Field', desc: 'XP pickups chip nearby enemies',
    baseCost: 4180000, costGrowth: 1, maxLevel: 1, perLevel: 1 },
  { id: 'laststand', name: 'Last Stand',   desc: 'Revive once per run at 50% max HP',
    baseCost: 4320000, costGrowth: 1, maxLevel: 1, perLevel: 1 },
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
  // OWNER (2026-09-13): "We need one that goes to 10 and allows the card to
  // continue improving until that cap." Split Shot is a DRAFT card whose grant
  // goes dead at the base cap of 3 — from there the draft relabels it "+20%
  // weapon damage (volley full)", because otherwise it is a fake choice. This
  // row RAISES that cap, +1 per level, so the card keeps granting projectiles:
  // L1..L10 -> cap 4..13. A flat count, so additive by nature (compounding is
  // for the (1+x) multiplier rows, not for counts).
  { id: 'split',   name: 'Split Shot',     desc: '+1 volley projectile cap per level',
    baseCost: 400, costGrowth: 1.35, maxLevel: 10, perLevel: 1 },
  { id: 'slots',   name: 'Weapon Slot',    desc: '+1 weapon slot (start 3, max 6)',
    baseCost: 5000, costGrowth: 2.9, maxLevel: 3, perLevel: 0 },
  // G17 slice 1b reprice: the TOP-tier flex at 4,200,000g = 2.78h at the
  // measured end-game rate (1,509,378g/h) = 5.6 good runs — inside the 3h
  // single-item cap and over TOP_TIER_MIN_GOOD_RUNS (5). The old 140,000g
  // was 0.09h.
  { id: 'arcade',  name: 'Arcade Pass',    desc: 'Golden HUD + arcade-run modifiers. The late-game flex.',
    baseCost: 4200000, costGrowth: 1, maxLevel: 1, perLevel: 0 },
  // ---- V1 ESCAPE: the PAID SKIP (owner directive 2026-09-14) ---------------
  // A one-time unlock: skipping the escape normally FORGOES the payout (the
  // "skip = forgo" rule); owning this row lets a veteran skip AND still
  // collect. perLevel 0 — the row owns nothing in the stat field contract
  // (applyMetaBonuses never reads it; the escape reads profile.purchased).
  // Doubles as an economy sink aimed at veterans who outgrew the beat.
  { id: 'escapeskip', name: 'Escape Writ', desc: 'Skip the escape sequence AND still collect its payout (one-time).',
    baseCost: 100000, costGrowth: 1, maxLevel: 1, perLevel: 0 },
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
  // M5 (audit 2026-09-16) -> F9 (round 3): the gate itself moved to the shared
  // canAfford helper (one home for the NaN-fails-closed rule, all buyers).
  if (!canAfford(profile, cost)) return false;           // insufficient gold
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
  if (!canAfford(profile, price)) return false;   // F9: shared NaN-safe gate
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
  if (!canAfford(profile, def.cost)) return false;   // F9: shared NaN-safe gate
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
  // PRICING (measured, not invented — the arithmetic test_meta.mjs pins):
  // GOLD_MODEL.INCOME_TIERS tier 3 = 11000 gold/run at runs 46+ (median banked
  // 11694, 5/6 runs censored at ~287s of the 300s cap). The run CAP bounds
  // throughput: 300s/run = 12 runs/hour -> 11000 x 12 = 132,000 gold/hour of
  // top-tier play.
  //   apex_mark          550,000 / 132,000 = ~4.17h  (chartered band 2h-6h)
  //   apex_endless_fire 5,500,000 / 132,000 = ~41.7h  (chartered band 30h-60h)
  // The BAND is the contract; the gold number is the calibration against the
  // measured tier-3 income. The pure-proof item is the reachable first trophy;
  // the rule-breaker is the long-haul goal. These costs are EXCLUDED from
  // every completion/pacing figure (SIM_ASSUMPTIONS.apex = false).
  {
    id: 'apex_mark', name: 'THE MARK OF THE GRIND',
    desc: 'Pure proof. No power at all — a HUD flourish while apex is ON, and your runs are marked APEX so a clean clear stays clean.',
    baseCost: 550000, apex: true, kind: 'apex',
    removes: 'Nothing — it removes no constraint; it is the visible proof you did the grind',
    proof: 'proof-only',
  },
  {
    id: 'apex_endless_fire', name: 'ASCENDANT ARSENAL',
    desc: 'Weapons never stop firing. While apex is ON, every re-arm writes zero cooldown. Deliberately absurd; do not tune it down.',
    baseCost: 5500000, apex: true, kind: 'apex',
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

// THE GATE — DERIVED from real ownership, never a hand-kept flag: every
// non-apex row of the normal catalogue owned/maxed. Until this is true the
// apex panel is not rendered at all (not greyed: absent) and buyApex refuses.
export function apexUnlocked(profile) {
  return SHOP_UPGRADES.every(def => shopRowOwned(profile, def));
}

// Buy one apex item. Refuses when the gate is closed, the id is unknown, the
// item is already owned, or gold is short — and mutates NOTHING on refusal.
export function buyApex(profile, id) {
  const def = APEX_BY_ID[id];
  if (!def || !profile) return false;
  if (!apexUnlocked(profile)) return false;            // gate closed
  if (apexOwned(profile, id)) return false;            // already owned
  if (!canAfford(profile, def.baseCost)) return false; // F9: shared NaN-safe gate
  profile.gold -= def.baseCost;
  profile.apex.owned.push(id);
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
//   focusRange   (C.AUTOPILOT.FOCUS_RANGE) A1, ADD +50/level (Rangefinder): the
//                                 pilot's ENGAGEMENT RADIUS in world px. The
//                                 base is owner-set 100 (config.js) and this is
//                                 the ONE place the purchased levels are added
//                                 to it; controllers.js reads it per-player off
//                                 p.stats (falling back to the base when a
//                                 probe hands in no stats), and the same value
//                                 is published to config so the config-side
//                                 reader (AUTOPILOT.AUTO_CAST.ELITE_RANGE)
//                                 cannot drift from the volleys. ADDITIVE.
export function applyMetaBonuses(stats, purchased) {
  const lvl = id => purchased[id] || 0;
  // A1: the ONE place the engagement radius is computed. Publish it to config
  // BEFORE returning, so the config-side reader (AUTO_CAST.ELITE_RANGE, read by
  // main.js's auto-cast gate) sees the same radius this run's pilot targets
  // with. The returned object stays a NEW object (this function's contract);
  // the publish is the shop row's effect reaching the config seam.
  const focusRange = C.AUTOPILOT.FOCUS_RANGE + SHOP_BY_ID.focus.perLevel * lvl('focus');
  setEngagementRange(focusRange);
  return {
    ...stats,
    // Forged Edge COMPOUNDS (owner rule, 2026-09-13): (1 + perLevel)^level, not
    // 1 + perLevel*level. The only multiplicative row in the shop.
    damage: stats.damage * Math.pow(1 + SHOP_BY_ID.dmg.perLevel, lvl('dmg')),
    manaRegen: C.MANA.REGEN + SHOP_BY_ID.regen.perLevel * lvl('regen')
      + SHOP_BY_ID.deepfont.perLevel * lvl('deepfont'),
    // MULTIPLIER rows COMPOUND (owner rule, 2026-09-13): (1 + perLevel)^level.
    // These four are (1+x) factors, so compounding is well-defined. The FLAT
    // rows below stay additive and must: `crit` and `dropBonus` are values SET
    // from zero (0 x anything = 0, so compounding would silently disable the
    // row), and hp/regen/well/siphon/artifact are absolute amounts, not factors.
    xpMult: Math.pow(1 + SHOP_BY_ID.xp.perLevel, lvl('xp')),
    crit: SHOP_BY_ID.crit.perLevel * lvl('crit') + SHOP_BY_ID.eagleeye.perLevel * lvl('eagleeye'),
    critMult: Math.pow(1 + SHOP_BY_ID.critdmg.perLevel, lvl('critdmg')),
    goldMult: Math.pow(1 + SHOP_BY_ID.greed.perLevel, lvl('greed')),
    potionPower: Math.pow(1 + SHOP_BY_ID.alchemy.perLevel, lvl('alchemy'))
      * (1 + SHOP_BY_ID.grandelixir.perLevel * lvl('grandelixir')),
    dropBonus: SHOP_BY_ID.scav.perLevel * lvl('scav'),
    artifactLevels: SHOP_BY_ID.artifact.perLevel * lvl('artifact'),
    luck: SHOP_BY_ID.luck.perLevel * lvl('luck'),
    // ---- G17 slice 2 breadth rows (each feeds a consumed seam above) ----
    // Multiplier seams compound off whatever the base/affix pass carries in,
    // same owner rule as dmg/xp: (1 + perLevel)^level. Flat seams add.
    maxHp: stats.maxHp + SHOP_BY_ID.hp.perLevel * lvl('hp')
      + SHOP_BY_ID.ironheart.perLevel * lvl('ironheart'),
    pierce: (stats.pierce || 0) + SHOP_BY_ID.hollowpoint.perLevel * lvl('hollowpoint'),
    projectiles: (stats.projectiles || 1) + SHOP_BY_ID.fanfire.perLevel * lvl('fanfire'),
    damageMult: (stats.damageMult || 1) * Math.pow(1 + SHOP_BY_ID.headsman.perLevel, lvl('headsman')),
    rateMult: (stats.rateMult || 1) * Math.pow(1 + SHOP_BY_ID.hairtrigger.perLevel, lvl('hairtrigger')),
    speedMult: (stats.speedMult || 1) * Math.pow(1 + SHOP_BY_ID.fleetfoot.perLevel, lvl('fleetfoot')),
    pickupMult: (stats.pickupMult || 1) * Math.pow(1 + SHOP_BY_ID.lodestone.perLevel, lvl('lodestone')),
    lifesteal: (stats.lifesteal || 0) + SHOP_BY_ID.bloodpact.perLevel * lvl('bloodpact'),
    thorns: (stats.thorns || 0) + SHOP_BY_ID.briarmail.perLevel * lvl('briarmail'),
    draftOffers: (stats.draftOffers || 0) + SHOP_BY_ID.deepread.perLevel * lvl('deepread'),
    secondWind: !!stats.secondWind || lvl('laststand') > 0,
    stormShards: !!stats.stormShards || lvl('staticfield') > 0,
    // Split Shot: extra volley projectile cap. A COUNT — never compounded, and
    // read through volleyProjectileCap() (config.js), the one definition.
    splitCap: SHOP_BY_ID.split.perLevel * lvl('split'),
    // OWNER: "80% cost cut for casting sounds fine. Allow the full 80." So the
    // floor is 0.2, not the old 0.6 -- at the doubled rate the clamp never binds
    // (L4 = 1 - 0.20*4 = 0.2 exactly), which means all four levels pay instead
    // of L3/L4 buying nothing. The clamp stays as the guard so a future rate
    // bump cannot silently blow past the authorised -80%.
    manaCostMult: Math.max(0.2, 1 - SHOP_BY_ID.thrifty.perLevel * lvl('thrifty')),
    maxMana: stats.maxMana + SHOP_BY_ID.well.perLevel * lvl('well'),
    manaOnKill: SHOP_BY_ID.siphon.perLevel * lvl('siphon')
      + SHOP_BY_ID.aethertap.perLevel * lvl('aethertap'),
    // A1 engagement radius (Rangefinder). ADDITIVE distance, and the value
    // published to config.js above is this exact expression — one definition.
    focusRange,
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
    desc: '+12 max HP per level', baseCost: 1200, costGrowth: 1.5, maxLevel: 4, perLevel: 12 },
  { id: 'knight_force', characterId: 'KNIGHT', name: 'Heavy Guard',
    desc: '+6% damage per level', baseCost: 1600, costGrowth: 1.5, maxLevel: 3, perLevel: 0.06 },
  { id: 'witch_wellspring', characterId: 'WITCH', name: 'Wellspring',
    desc: '+15 max mana per level', baseCost: 1000, costGrowth: 1.5, maxLevel: 4, perLevel: 15 },
  { id: 'witch_focus', characterId: 'WITCH', name: 'Focused Mind',
    desc: 'spells cost 6% less per level', baseCost: 1800, costGrowth: 1.5, maxLevel: 3, perLevel: 0.06 },
  { id: 'rogue_fleet', characterId: 'ROGUE', name: 'Fleetfoot',
    desc: '+6 move speed per level', baseCost: 1400, costGrowth: 1.5, maxLevel: 3, perLevel: 6 },
  { id: 'rogue_satchel', characterId: 'ROGUE', name: 'Deep Satchel',
    desc: '+1 starting potion per level', baseCost: 900, costGrowth: 1.5, maxLevel: 3, perLevel: 1 },
  { id: 'paladin_bulwark', characterId: 'PALADIN', name: 'Bulwark',
    desc: '+10 max HP per level', baseCost: 1100, costGrowth: 1.5, maxLevel: 4, perLevel: 10 },
  { id: 'paladin_blessing', characterId: 'PALADIN', name: 'Blessed Chests',
    desc: '+3 HP healed on chest per level', baseCost: 1500, costGrowth: 1.5, maxLevel: 3, perLevel: 3 },
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
  if (!canAfford(profile, cost)) return false;            // F9: shared NaN-safe gate
  profile.gold -= cost;
  addCharacterUpgrade(profile, characterId, id, 1);
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
    desc: 'Free. Base volley + Earthshatter. Sturdy: +30 max HP.',
    startingWeapon: null, skill: 'EARTHSHATTER', startPotions: 1,   // N1 slice 3: his kill-charged ult (was FROST_NOVA)
    healOnChest: 0,
    mods: { maxHp: 30 },
  },
  WITCH: {
    id: 'WITCH', name: 'Witch', unlockCost: 9000,
    desc: 'Chain Reaction Q + Chain Zap start. Deep mana pool (+50). Frail: -25 max HP.',
    startingWeapon: 'ZAP', skill: 'CHAIN_REACTION', startPotions: 1,
    healOnChest: 0,
    // N1a: she is the mana class — spells cost her half (weaponManaCost reads
    // this), and her pilot defaults to SWARM (the chain only pays on a clump;
    // TAB/G still cycle it like any focus).
    // N1 slice 1: her Q is CHAIN REACTION, her DEFINING move (goals doc N1b
    // item 3) — a mana-fed chain that outreaches and out-jumps her gun, whose
    // kills detonate. FROST_NOVA's slow moved onto the chain; FROST_NOVA
    // itself is unchanged and returns as a draftable card in slice 2.
    mods: { maxHp: -25, maxMana: 50, manaCostMult: 0.5 },
    defaultFocus: 'SWARM',
  },
  ROGUE: {
    id: 'ROGUE', name: 'Rogue', unlockCost: 2500,
    desc: 'Starts with Boomerang. Fast feet: +20% move speed.',
    startingWeapon: 'BOOMERANG', skill: 'AFTERIMAGE', startPotions: 2,   // N1 slice 3: her kill-charged ult (was FROST_NOVA)
    healOnChest: 0,
    mods: { speedMult: 1.2 },
  },
  PALADIN: {
    id: 'PALADIN', name: 'Paladin', unlockCost: 6000,
    desc: 'Starts with Orbit Blades. Blessed: heals 15 HP on chest open.',
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
  if (!canAfford(profile, ch.unlockCost)) return false;   // F9: shared NaN-safe gate
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
