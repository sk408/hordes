// HORDES — LOOT RARITY: rare items (affix system) + PAID CHESTS.
// Megabonk-inspired layer on top of chests.js. Self-contained: hb1 wires the
// UI/inventory into main.js; this module owns rolls + math only. All
// randomness goes through an injectable rng (defaults to Math.random) so the
// tests are deterministic.
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

// ---------- Rarities ----------
export const RARITIES = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY'];
// Weights sum to 100 (band order follows RARITIES).
export const RARITY_WEIGHTS = { COMMON: 60, RARE: 25, EPIC: 12, LEGENDARY: 3 };
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
// (1 + bias * rarityIndex), pushing rolls up-tier. rng() in [0,1).
export function pickRarity(rng, tierBias = 0) {
  const entries = RARITIES.map((r, i) => [r, RARITY_WEIGHTS[r] * (1 + tierBias * i)]);
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

// Roll a random item. rng call order (tests rely on it):
//   1 x rarity, N x affix picks, +1 x legendary slot pick if LEGENDARY.
export function rollItem(rng = Math.random, tierBias = 0) {
  const rarity = pickRarity(rng, tierBias);

  if (rarity === 'LEGENDARY') {
    const slot = LEGENDARY_SLOTS[Math.floor(rng() * LEGENDARY_SLOTS.length)];
    const def = LEGENDARIES[slot];
    return { ...def, affixes: def.affixes.map(a => ({ ...a })) };  // deep copy, fixed affixes
  }

  const scale = RARITY_SCALE[rarity];
  const picked = sample(AFFIX_POOL, AFFIX_COUNT[rarity], rng);
  const affixes = picked.map(a => ({
    id: a.id, name: a.name, field: a.field, magnitude: a.base * scale,
  }));
  const name = `${PREFIX[rarity]} ${picked[0].noun}`;
  return { id: 'item_' + (nextId++), name, rarity, affixes };
}

// ---------- Equipping (in-run state, profile-agnostic) --------------------
export const MAX_EQUIPPED = 4;

// Inventory is a plain array of items. Cap: MAX_EQUIPPED.
export function equipItem(inventory, item) {
  if (!Array.isArray(inventory) || !item || inventory.length >= MAX_EQUIPPED) return false;
  inventory.push(item);
  return true;
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
  return { ok: true, gambled: 'item', debited: def.cost, item: rollItem(rng, def.tierBias) };
}
