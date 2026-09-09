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

const STORAGE_KEY = 'hordes_profile_v1';

// ---------- Storage shim (node-safe) ----------
export function detectStorage() {
  try {
    const s = globalThis.localStorage;
    if (s && typeof s.getItem === 'function') return s;
  } catch { /* sandboxed/locked storage — fall through to no-op */ }
  return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
}

// ---------- Profile ----------
export function makeProfile() {
  return {
    gold: 0,
    purchased: {},                      // upgradeId -> level (1..maxLevel)
    unlockedCharacters: ['KNIGHT'],
    equippedCharacter: 'KNIGHT',
  };
}

export function loadProfile(storage) {
  const s = storage || detectStorage();
  let raw = null;
  try { raw = s.getItem(STORAGE_KEY); } catch { raw = null; }
  if (!raw) return makeProfile();
  try {
    const p = JSON.parse(raw);
    if (!p || typeof p !== 'object') return makeProfile();
    // Spread-PRESERVE unknown fields (e.g. bestTime from main.js) so future
    // modules persist without touching this file, while the four known
    // fields still get sanitized for backward compat with older saves.
    // Purchased levels are clamped to the CURRENT maxLevel — old-economy
    // saves (pre-retune prices/caps) load clean instead of over-granting.
    const purchased = {};
    if (p.purchased && typeof p.purchased === 'object') {
      for (const [id, lvl] of Object.entries(p.purchased)) {
        const def = SHOP_BY_ID[id];
        const n = Number(lvl) || 0;
        purchased[id] = def ? Math.max(0, Math.min(n, def.maxLevel)) : n;
      }
    }
    return {
      ...p,
      gold: Number(p.gold) || 0,
      purchased,
      unlockedCharacters: Array.isArray(p.unlockedCharacters) && p.unlockedCharacters.length
        ? p.unlockedCharacters : ['KNIGHT'],
      equippedCharacter: typeof p.equippedCharacter === 'string'
        ? p.equippedCharacter : 'KNIGHT',
    };
  } catch { return makeProfile(); }    // corrupt blob -> fresh start
}

export function saveProfile(profile, storage) {
  const s = storage || detectStorage();
  try { s.setItem(STORAGE_KEY, JSON.stringify(profile)); return true; }
  catch { return false; }
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
// cumulative projected income around run 60-70; the ARCADE PASS (a 60k gold
// sink beyond full-buy) pushes the completionist crossing ~20 runs further.
// The ladder test in test_meta.mjs enforces both. perLevel values are PER
// LEVEL and stack via applyMetaBonuses (field contract documented there).
//
// WEAPON SLOTS ladder re-priced with the expansion: 5000 / 14500 / 42050
// (~4x / ~11x / ~31x a run-20 income of ~1400g). hb1 wires enforcement via
// startWeaponSlots(); perLevel 0 — slots never touch stats.
export const WEAPON_SLOT_START = 3;
export const MAX_WEAPON_SLOTS = 6;

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
  // ---- slots + late-game sink ----
  { id: 'slots',   name: 'Weapon Slot',    desc: '+1 weapon slot (start 3, max 6)',
    baseCost: 5000, costGrowth: 2.9, maxLevel: 3, perLevel: 0 },
  { id: 'arcade',  name: 'Arcade Pass',    desc: 'Golden HUD + arcade-run modifiers. The late-game flex.',
    baseCost: 60000, costGrowth: 1, maxLevel: 1, perLevel: 0 },
];
export const SHOP_BY_ID = Object.fromEntries(SHOP_UPGRADES.map(u => [u.id, u]));

// Weapon slots owned by a profile: 3 + purchased 'slots' levels (max 6).
export function startWeaponSlots(profile) {
  const bought = Math.max(0, Number(profile.purchased.slots) || 0);
  return Math.min(MAX_WEAPON_SLOTS, WEAPON_SLOT_START + bought);
}

// Arcade Pass owned? (single 60k purchase — the post-full-buy gold sink;
// hb1 reads this to flip on golden HUD/arcade modifiers.)
export function hasArcadePass(profile) {
  return (Number(profile.purchased.arcade) || 0) > 0;
}

// Cost of the NEXT (level+1) purchase. Level 0-based.
export function upgradeCost(def, currentLevel) {
  return Math.round(def.baseCost * Math.pow(def.costGrowth, currentLevel));
}

// Buy one level of an upgrade. Validates gold + level cap. Mutates profile
// (gold -= cost, purchased[id]++). Returns true on success.
export function buyUpgrade(profile, id) {
  const def = SHOP_BY_ID[id];
  if (!def) return false;
  const level = profile.purchased[id] || 0;
  if (level >= def.maxLevel) return false;               // level cap
  const cost = upgradeCost(def, level);
  if (profile.gold < cost) return false;                 // insufficient gold
  profile.gold -= cost;
  profile.purchased[id] = level + 1;
  return true;
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
  };
}

// Starting potion count per kind: character base + Travel Pack levels.
// (Not a stat — potions live on player.potions; cap MAX_CARRIED applies to
// ground pickup only, so over-cap starts are mechanically fine.)
export function startPotionCount(profile) {
  const ch = CHARACTERS[profile.equippedCharacter] || CHARACTERS.KNIGHT;
  return ch.startPotions + (profile.purchased.potions || 0);
}

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
