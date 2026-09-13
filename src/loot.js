// HORDES — LOOT RARITY: rare items (affix system) + PAID CHESTS.
// Megabonk-inspired layer on top of chests.js. Self-contained: hb1 wires the
// UI/inventory into main.js; this module owns rolls + math only. All
// randomness goes through an injectable rng (defaults to Math.random) so the
// tests are deterministic.
//
// WAVE-11/INTEGRATION REBASE: the luck curve now lives in meta.js
// (luckDropWeights — hb2's shop-line contract); the old local
// BASE_DROP_WEIGHTS + fallbackLuckDropWeights are GONE. RARITY_WEIGHTS (the
// chest table) is meta.js BASE_RARITY_WEIGHTS re-exported, and rollItem's
// default weights are the same table — hb1 passes luckDropWeights(luckLevel)
// for world drops so Fortune shifts rarity odds mid-run. (Supersedes the old
// "no LEGENDARY on world drops" rule: the shared base table carries weight 3.)
//
// FIELD CONTRACT for hb1 (stats shape produced/consumed here — additive on
// top of meta.js's applyMetaBonuses/applyCharacter output):
//   crit        0..1   crit chance (main: roll per hit; base 0)
//   critMult    mult   crit damage multiplier (base 1.5)
//   rateMult    mult   attack-rate multiplier — main divides cooldown by it
//   damageMult  mult   final damage multiplier (base 1)
//   xpMult      mult   XP multiplier (base 1; SAME field meta.js uses)
//   goldMult    mult   run-gold multiplier (base 1)
//   speedMult   mult   move-speed multiplier (base 1; same field as
//                     CHARACTERS mods — multiply, don't add)
//   pickupMult  mult   gem/chest pickup-radius multiplier (base 1)
//   thorns      flat   damage reflected per enemy contact hit (base 0)
//   lifesteal   0..1   fraction of damage dealt healed (base 0)
// applyAffixes() FILLS any missing fields with these defaults and returns a
// NEW stats object (PURE — never mutates the input).

import { luckDropWeights, BASE_RARITY_WEIGHTS } from './meta.js';
// Re-exported so hb2's luck seam is reachable through the loot import too.
export { luckDropWeights };

// ---------- Rarities ----------
export const RARITIES = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY'];
// The shared 4-tier table (meta.js BASE_RARITY_WEIGHTS; sums to 100, band
// order follows RARITIES). Paid chests pin it via rollPaidChest; world drops
// get luckDropWeights(luck) injected by the integrator.
export const RARITY_WEIGHTS = BASE_RARITY_WEIGHTS;
// Affix count rolled per rarity (LEGENDARY uses a fixed named set of 3).
export const AFFIX_COUNT = { COMMON: 1, RARE: 2, EPIC: 3, LEGENDARY: 3 };
// Magnitude scale per rarity for every affix (base * scale).
export const RARITY_SCALE = { COMMON: 1, RARE: 1.5, EPIC: 2.2, LEGENDARY: 3 };
const PREFIX = { COMMON: 'Worn', RARE: 'Fine', EPIC: 'Mythic', LEGENDARY: 'Godforged' };

// ---------- Affix pool (10 entries; field names per the contract above) ----
export const AFFIX_POOL = [
  { id: 'crit',       name: 'Keen Eye',        field: 'crit',       base: 0.04, noun: 'Eye',
    desc: '+4% crit chance (scales with rarity)' },
  { id: 'critMult',   name: 'Executioner',     field: 'critMult',   base: 0.2,  noun: 'Axe',
    desc: '+20% crit damage' },
  { id: 'rateMult',   name: 'Rapid Trigger',   field: 'rateMult',   base: 0.1,  noun: 'Trigger',
    desc: '+10% attack rate' },
  { id: 'damageMult', name: 'Brutal Edge',     field: 'damageMult', base: 0.1,  noun: 'Edge',
    desc: '+10% damage' },
  { id: 'xpMult',     name: "Scholar's Mind",  field: 'xpMult',     base: 0.1,  noun: 'Tome',
    desc: '+10% XP gain' },
  { id: 'goldMult',   name: 'Midas Touch',     field: 'goldMult',   base: 0.15, noun: 'Coin',
    desc: '+15% gold gain' },
  { id: 'speedMult',  name: 'Windwalker',      field: 'speedMult',  base: 0.08, noun: 'Boot',
    desc: '+8% move speed' },
  { id: 'pickupMult', name: 'Loot Vortex',     field: 'pickupMult', base: 0.25, noun: 'Hoard',
    desc: '+25% pickup radius' },
  { id: 'thorns',     name: 'Spiked Hide',     field: 'thorns',     base: 3,    noun: 'Hide',
    desc: '+3 thorns damage on contact' },
  { id: 'lifesteal',  name: 'Vampiric',        field: 'lifesteal',  base: 0.02, noun: 'Fang',
    desc: '+2% lifesteal' },
];
const AFFIX_BY_ID = Object.fromEntries(AFFIX_POOL.map(a => [a.id, a]));

// ---------- Named LEGENDARIES (1 unique per slot-archetype) ---------------
// Fixed affix instances at LEGENDARY scale (base * 3) — never re-rolled.
export const LEGENDARIES = {
  WEAPON: {
    id: 'LEGENDARY_WEAPON', slot: 'WEAPON', rarity: 'LEGENDARY',
    name: 'Aurelion, Dawnfang',
    desc: 'A blade forged in the first sunrise. It remembers every kill its bearers ever landed.',
    affixes: [
      { id: 'damageMult', name: AFFIX_BY_ID.damageMult.name, field: 'damageMult', magnitude: 0.3 },
      { id: 'crit',       name: AFFIX_BY_ID.crit.name,       field: 'crit',       magnitude: 0.12 },
      { id: 'critMult',   name: AFFIX_BY_ID.critMult.name,   field: 'critMult',   magnitude: 0.6 },
    ],
  },
  ARMOR: {
    id: 'LEGENDARY_ARMOR', slot: 'ARMOR', rarity: 'LEGENDARY',
    name: 'Bulwark of the Last Stand',
    desc: 'Dented by a thousand sieges. The horde breaks on it like surf on a grave.',
    affixes: [
      { id: 'thorns',     name: AFFIX_BY_ID.thorns.name,     field: 'thorns',     magnitude: 9 },
      { id: 'lifesteal',  name: AFFIX_BY_ID.lifesteal.name,  field: 'lifesteal',  magnitude: 0.06 },
      { id: 'damageMult', name: AFFIX_BY_ID.damageMult.name, field: 'damageMult', magnitude: 0.3 },
    ],
  },
  BOOTS: {
    id: 'LEGENDARY_BOOTS', slot: 'BOOTS', rarity: 'LEGENDARY',
    name: 'Greaves of the Nine Winds',
    desc: 'Each step borrows a wind; all nine want them back.',
    affixes: [
      { id: 'speedMult',  name: AFFIX_BY_ID.speedMult.name,  field: 'speedMult',  magnitude: 0.24 },
      { id: 'pickupMult', name: AFFIX_BY_ID.pickupMult.name, field: 'pickupMult', magnitude: 0.75 },
      { id: 'rateMult',   name: AFFIX_BY_ID.rateMult.name,   field: 'rateMult',   magnitude: 0.3 },
    ],
  },
  RING: {
    id: 'LEGENDARY_RING', slot: 'RING', rarity: 'LEGENDARY',
    name: 'Signet of the Midas Curse',
    desc: 'Everything you touch turns to gold — including, eventually, you.',
    affixes: [
      { id: 'goldMult',   name: AFFIX_BY_ID.goldMult.name,   field: 'goldMult',   magnitude: 0.45 },
      { id: 'xpMult',     name: AFFIX_BY_ID.xpMult.name,     field: 'xpMult',     magnitude: 0.3 },
      { id: 'crit',       name: AFFIX_BY_ID.crit.name,       field: 'crit',       magnitude: 0.12 },
    ],
  },
};
const LEGENDARY_SLOTS = ['WEAPON', 'ARMOR', 'BOOTS', 'RING'];

// ---------- Stats defaults (the field contract above) ---------------------
export const STAT_DEFAULTS = {
  crit: 0, critMult: 1.5, rateMult: 1, damageMult: 1,
  xpMult: 1, goldMult: 1, speedMult: 1, pickupMult: 1,
  thorns: 0, lifesteal: 0,
};

// ---------- Rolling --------------------------------------------------------
let nextId = 1;

// Weighted rarity pick; tierBias (0..N) multiplies each rarity's weight by
// (1 + bias * rarityIndex), pushing rolls up-tier. `weights` (WAVE-11/2)
// overrides the default table; missing rarities weigh 0 (this is how world
// drops exclude LEGENDARY). rng() in [0,1).
export function pickRarity(rng, tierBias = 0, weights = null) {
  const table = weights || RARITY_WEIGHTS;
  const entries = RARITIES.map((r, i) => [r, (table[r] || 0) * (1 + tierBias * i)]);
  const total = entries.reduce((s, e) => s + e[1], 0);
  let x = rng() * total;
  for (const [r, w] of entries) { if ((x -= w) < 0) return r; }
  return RARITIES[RARITIES.length - 1];  // fp fallback
}

function sample(arr, n, rng) {
  const pool = [...arr];
  const out = [];
  for (let i = 0; i < n && pool.length > 0; i++) {
    out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  return out;
}

// Roll one of the hand-authored LEGENDARY items (one per slot). This is the
// reward for the TOP chest band (chests.js CHESTS.RARITY_WEIGHTS.legendary,
// 0.02% of chests) — the first step of the owner's chest -> equipment pivot:
// chest rarity IS item rarity, so the rarest chest band drops the rarest
// equipment. rng order: exactly 1 draw (the slot pick), the same draw
// rollItem's LEGENDARY branch has always taken. PURE (deep copy out).
export function rollLegendaryItem(rng = Math.random) {
  const slot = LEGENDARY_SLOTS[Math.floor(rng() * LEGENDARY_SLOTS.length)];
  const def = LEGENDARIES[slot];
  return { ...def, affixes: def.affixes.map(a => ({ ...a })) };  // deep copy, fixed affixes
}

// Roll an item at a GIVEN rarity. This is the CHEST-BAND seam: under the
// owner's pivot a chest band IS an item rarity, so the band decides the rarity
// and this builds the item at it -- no re-roll, no bias. rng order (tests pin
// it): N x affix picks for COMMON/RARE/EPIC (1/2/3), and exactly 1 draw for
// LEGENDARY (the fixed-slot pick). PURE.
export function rollItemOfRarity(rarity, rng = Math.random) {
  const r = RARITIES.includes(rarity) ? rarity : 'COMMON';
  if (r === 'LEGENDARY') return rollLegendaryItem(rng);
  const scale = RARITY_SCALE[r];
  const picked = sample(AFFIX_POOL, AFFIX_COUNT[r], rng);
  const affixes = picked.map(a => ({
    id: a.id, name: a.name, field: a.field, magnitude: a.base * scale,
  }));
  const name = `${PREFIX[r]} ${picked[0].noun}`;
  return { id: 'item_' + (nextId++), name, rarity: r, affixes };
}

// Roll a random item. The third arg injects the rarity weights (default =
// the shared 4-tier base table; world-drop callers pass meta.js
// luckDropWeights(luckLevel) so Fortune shifts the odds). rng call order
// (tests rely on it): 1 x rarity, then the item's own draws.
export function rollItem(rng = Math.random, tierBias = 0, weights = BASE_RARITY_WEIGHTS) {
  return rollItemOfRarity(pickRarity(rng, tierBias, weights), rng);
}

// ---------- Equipping (in-run state, profile-agnostic) --------------------
export const MAX_EQUIPPED = 4;

// Inventory is a plain array of items. Cap: MAX_EQUIPPED.
export function equipItem(inventory, item) {
  if (!Array.isArray(inventory) || !item || inventory.length >= MAX_EQUIPPED) return false;
  inventory.push(item);
  return true;
}

// ---------- WAVE-11/2: BEST-CASE EQUIP (Sk408: no more swap churn) --------
// itemScore(item): tier component + affix magnitudes normalized by the pool's
// base (so +0.04 crit and +3 thorns count comparably, not raw-magnitude
// absurdly favoring thorns). Unknown affix ids fall back to raw magnitude
// (tests / foreign items). PURE.
export const RARITY_TIER_SCORE = { COMMON: 1, RARE: 10, EPIC: 20, LEGENDARY: 30 };
export function itemScore(item) {
  if (!item) return 0;
  const tier = RARITY_TIER_SCORE[item.rarity] ?? 0;
  let affix = 0;
  for (const a of item.affixes || []) {
    const base = AFFIX_BY_ID[a.id] && AFFIX_BY_ID[a.id].base;
    affix += base ? a.magnitude / base : (a.magnitude || 0);
  }
  return tier + affix;
}

// PURE equip policy — hb1 wires it on every drop pickup:
//   EQUIP   — a slot is free (empty-slot pickup = the +1-heat NEW_ITEM_SLOT
//             event; heat rule unchanged). slot = index to insert at
//             (=== items.length).
//   REPLACE — belt is full AND itemScore(drop) > itemScore(weakest equipped)
//             STRICTLY. slot = index of the weakest (first weakest wins
//             ties). No heat event (exchanges are free, and now rare by
//             construction). The caller swaps items[slot] itself.
//   IGNORE  — drop is not strictly better than the weakest equipped item:
//             it stays on the ground and despawns normally. No equal-swaps,
//             no downgrades, no churn.
// decideEquip NEVER mutates `items`.
export function decideEquip(items, drop) {
  if (!Array.isArray(items) || !drop) return { action: 'IGNORE', slot: null };
  if (items.length < MAX_EQUIPPED) return { action: 'EQUIP', slot: items.length };
  let weakest = 0;
  let weakestScore = Infinity;
  for (let i = 0; i < items.length; i++) {
    const s = itemScore(items[i]);
    if (s < weakestScore) { weakestScore = s; weakest = i; }
  }
  return itemScore(drop) > weakestScore
    ? { action: 'REPLACE', slot: weakest }
    : { action: 'IGNORE', slot: null };
}

// Remove by item or id; returns the removed item or null.
export function unequipItem(inventory, itemOrId) {
  if (!Array.isArray(inventory)) return null;
  const id = typeof itemOrId === 'object' ? itemOrId.id : itemOrId;
  const i = inventory.findIndex(it => it.id === id);
  if (i < 0) return null;
  return inventory.splice(i, 1)[0];
}

// PURE: sum every affix of `items` (a single item OR an array) onto a copy of
// stats, filling STAT_DEFAULTS for missing fields. Never mutates inputs.
export function applyAffixes(stats, items) {
  const list = Array.isArray(items) ? items : (items ? [items] : []);
  const out = { ...STAT_DEFAULTS, ...stats };
  for (const item of list) {
    for (const a of item.affixes || []) {
      out[a.field] = (out[a.field] || 0) + a.magnitude;
    }
  }
  return out;
}

// ---------- PAID CHESTS (gamble for gold; wiring is hb1's) ----------------
// Tiers: cost / nothingChance (the gamble) / tierBias fed to rollItem.
// CHESTS.js is untouched — this is a parallel purchase path.
export const PAID_CHESTS = {
  BRONZE: { cost: 50,  nothingChance: 0.40, tierBias: 0 },
  SILVER: { cost: 150, nothingChance: 0.25, tierBias: 1.5 },
  GOLD:   { cost: 400, nothingChance: 0.10, tierBias: 3 },
};

// Buy a paid chest. profile is a { gold } (meta.js-compatible). ALWAYS debits
// on a successful purchase — the NOTHING outcome is the gamble, not a refund.
// rng order: 1 x nothing-flip, then rollItem's draws on a win.
// Returns { ok, debited, item, gambled } — ok:false means no purchase at all.
export function rollPaidChest(profile, tier, rng = Math.random) {
  const def = PAID_CHESTS[tier];
  if (!def) return { ok: false, reason: 'tier', debited: 0, item: null };
  const gold = Number(profile.gold) || 0;
  if (gold < def.cost) return { ok: false, reason: 'gold', debited: 0, item: null };

  profile.gold = gold - def.cost;
  if (rng() < def.nothingChance) {
    return { ok: true, gambled: 'nothing', debited: def.cost, item: null };
  }
  // Chests roll on the 4-tier chest table (LEGENDARY possible) — NOT the
  // 3-tier world-drop weights.
  return { ok: true, gambled: 'item', debited: def.cost, item: rollItem(rng, def.tierBias, RARITY_WEIGHTS) };
}

// ---------- WAVE-11/2: FLASH DROPS (Sk408: rare world drop, screen-clear
// moment) ---------------------------------------------------------------
// A FLASH is a rare world drop whose pickup kills EVERY enemy of the WEAKEST
// trash tier present on the field. CHASER/SWARMER class ONLY — elites,
// bosses, and anything typed beyond the trash tier take ZERO damage (they
// are untouched, not damaged-and-surviving). Pure data/logic here; hb1 owns
// the actual kill + render moment.
export const FLASH_DROP = {
  baseChance: 0.008,   // ~0.8% per eligible kill at luck 0
  cooldownMs: 45000,   // once per ~45s guard, max
  luckScale: 0.15,     // chance *= (1 + 0.15 * luckLevel)
  chanceCap: 0.04,     // hard ceiling however stacked the luck build is
};

// Weakest-first order of the flashable trash tiers (SWARMER hpMult 0.4 <
// CHASER 1.0 — swarmers vaporize before chasers when both are present).
export const FLASH_TRASH_TIERS = ['SWARMER', 'CHASER'];

// Luck-scaled trigger chance per eligible kill. PURE.
export function flashDropChance(luckLevel = 0) {
  const L = Math.max(0, Number(luckLevel) || 0);
  return Math.min(FLASH_DROP.chanceCap, FLASH_DROP.baseChance * (1 + FLASH_DROP.luckScale * L));
}

// Once-per-cooldown guard. `now`/`lastFlashAt` are ms timestamps (hb1 keeps
// lastFlashAt on the run state; null/undefined = never flashed). PURE.
export function canFlashDrop(now, lastFlashAt) {
  return lastFlashAt == null || (now - lastFlashAt) >= FLASH_DROP.cooldownMs;
}

// A kill is flash-eligible only if the victim is plain trash: typeId is
// CHASER or SWARMER, no elite flag, no boss markers. PURE.
export function isFlashEligibleKill(enemy) {
  if (!enemy || typeof enemy !== 'object') return false;
  if (!FLASH_TRASH_TIERS.includes(enemy.typeId)) return false;
  return !enemy.elite && !enemy.isBoss && !enemy.bossId && !enemy.boss;
}

// The list a FLASH kills: ALL enemies of the WEAKEST trash tier present
// (elites/bosses/typed-beyond-trash excluded from consideration entirely —
// zero damage to them). Input order preserved. PURE — never mutates.
export function flashTargets(enemies) {
  if (!Array.isArray(enemies)) return [];
  const trash = enemies.filter(isFlashEligibleKill);
  for (const tier of FLASH_TRASH_TIERS) {
    const victims = trash.filter(e => e.typeId === tier);
    if (victims.length > 0) return victims;
  }
  return [];
}

// One-call roll for hb1's kill path: eligibility -> cooldown -> rng, in that
// order (early-outs consume ZERO rng draws). PURE.
export function shouldFlashDrop(enemy, luckLevel, now, lastFlashAt, rng = Math.random) {
  if (!isFlashEligibleKill(enemy)) return false;
  if (!canFlashDrop(now, lastFlashAt)) return false;
  return rng() < flashDropChance(luckLevel);
}

// HUD/toast copy. Pass the tier flashTargets() actually killed (defaults to
// SWARMER, the most common case). PURE.
const FLASH_TIER_NAME = { SWARMER: 'Swarmer', CHASER: 'Chaser' };
export function describeFlash(tier = 'SWARMER') {
  const name = FLASH_TIER_NAME[tier] || 'Swarmer';
  return `FLASH DROP! A blinding light erases every ${name} on the field.`;
}
