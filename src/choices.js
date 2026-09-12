// HORDES — intermission choices (WAVE-7/C): blessing/curse picks offered at
// each wave portal (Sk408: every blessing carries a REAL drawback so picks
// shape build identity instead of being free power).
//
// Purity contract: no DOM, no game loop. rollChoices(wave, rng) is
// deterministic for an injected seeded rng (mulberry32 from weather.js —
// same stream contract, tests + future daily-seed runs replay exactly).
// apply() only mutates the player object handed to it; choices last for the
// RUN ONLY (a fresh makePlayer per run resets everything — applies here must
// NEVER touch meta/profile/persistence).
//
// ---------------- FIELD CONTRACT for hb1 --------------------------------
// Existing seams mutated (all live on makePlayer output):
//   stats.damage / cooldown / speed / pickup / maxHp / maxMana / pierce
//   stats.crit / thorns / lifesteal / xpMult / goldMult  (loot.js
//     STAT_DEFAULTS contract: mult fields multiply, crit/thorns/lifesteal add)
//   p.hp  (clamped when maxHp shrinks)
//
// NEW run-scoped fields on player.choices (created lazily by ensureChoices;
// only added when an effect cannot be expressed on an existing seam —
// each documents where hb1 must consume it):
//   weaponSlotBonus (base 0)    — hb1: state.weaponSlots = min(CONFIG.
//                                 WEAPON_SLOTS, baseSlots + weaponSlotBonus)
//   shopPriceMult   (base 1)    — hb1: multiply shop prices at purchase time
//   potionHealMult  (base 1)    — hb1: multiply CONFIG.POTIONS.HP_HEAL in the
//                                 usePotion call path (skills.js seam)
//   dropChanceMult  (base 1)    — hb1: multiply CONFIG.POTIONS.DROP_CHANCE in
//                                 the potion-drop roll on the kill path
//                                 (main.js; skills.js's old rollDrop export
//                                 was removed in wave-25 as dead code)
//   itemDropMult    (base 1)    — hb1: multiply CONFIG.ITEMS chances in
//                                 loot.js drop rolls
//   damageTakenMult (base 1)    — hb1: multiply contact/projectile damage the
//                                 player takes in main.js hit paths
// A new run resets these by construction (fresh makePlayer + fresh rollChoices).
//
// RARITIES scale the magnitudes of BOTH the blessing and the curse
// (RARITY_SCALE matches loot.js). The roll weights are per-offer: COMMON 60 /
// RARE 25 / EPIC 12, with EPIC ramping +3 per wave (capped 30) so deeper
// portals skew dramatic. rollChoices never repeats an id within one offer
// set; pass run-taken ids via excludeIds to avoid repeats across a whole run.

// ---------- rarity machinery --------------------------------------------------
export const RARITIES = ['COMMON', 'RARE', 'EPIC'];
export const RARITY_WEIGHTS = { COMMON: 60, RARE: 25, EPIC: 12 };
export const RARITY_SCALE = { COMMON: 1, RARE: 1.5, EPIC: 2.2 }; // same as loot.js
export const EPIC_WAVE_RAMP = 3;   // epic weight += ramp * wave
export const EPIC_WAVE_CAP = 30;

// Lazy defaults for the new run-scoped fields (see FIELD CONTRACT above).
export function ensureChoices(p) {
  if (!p.choices) {
    p.choices = {
      weaponSlotBonus: 0, shopPriceMult: 1,
      potionHealMult: 1, dropChanceMult: 1,
      itemDropMult: 1, damageTakenMult: 1,
    };
  }
  return p.choices;
}

const pct = (n) => Math.round(n * 100) + '%';   // 0.25 -> '25%'
const x = (n) => `x${Number(n).toFixed(2)}`;    // 1.5 -> 'x1.50'

// ---------- the pool (14 distinct blessings; every one pays a price) ---------
// build(scale) -> { desc, apply }: scale = RARITY_SCALE[rarity]; desc always
// states BOTH the blessing and the curse with the exact numbers apply uses.
export const CHOICE_POOL = [
  {
    id: 'blood_pact', title: 'Blood Pact',
    build: (s) => ({
      desc: `+${pct(0.25 * s)} weapon damage / -${pct(0.15 * s)} max HP`,
      apply: (p) => {
        p.stats.damage *= 1 + 0.25 * s;
        p.stats.maxHp *= 1 - 0.15 * s;
        p.hp = Math.min(p.hp, p.stats.maxHp);
      },
    }),
  },
  {
    id: 'zephyr_stride', title: 'Zephyr Stride',
    build: (s) => ({
      desc: `+${pct(0.20 * s)} move speed / -${pct(0.10 * s)} pickup radius`,
      apply: (p) => {
        p.stats.speed *= 1 + 0.20 * s;
        p.stats.pickup *= 1 - 0.10 * s;
      },
    }),
  },
  {
    id: 'scholars_pact', title: "Scholar's Pact",
    build: (s) => ({
      desc: `+${pct(0.30 * s)} XP gain / -${pct(0.15 * s)} gold gain`,
      apply: (p) => {
        p.stats.xpMult = (p.stats.xpMult || 1) * (1 + 0.30 * s);
        p.stats.goldMult = (p.stats.goldMult || 1) * (1 - 0.15 * s);
      },
    }),
  },
  {
    id: 'gem_hawker', title: 'Gem Hawker',
    build: (s) => ({
      desc: `+${pct(0.40 * s)} pickup radius / -${pct(0.10 * s)} move speed`,
      apply: (p) => {
        p.stats.pickup *= 1 + 0.40 * s;
        p.stats.speed *= 1 - 0.10 * s;
      },
    }),
  },
  {
    id: 'alchemists_blessing', title: "Alchemist's Blessing",
    build: (s) => ({
      desc: `Potions heal ${x(1 + s)} / potion drops ${x(1 / (1 + s))}`,
      apply: (p) => {
        const c = ensureChoices(p);
        c.potionHealMult *= 1 + s;
        c.dropChanceMult *= 1 / (1 + s);
      },
    }),
  },
  {
    id: 'stone_skin', title: 'Stone Skin',
    build: (s) => ({
      desc: `+${Math.round(25 * s)} max HP / -${pct(0.10 * s)} weapon damage`,
      apply: (p) => {
        p.stats.maxHp += Math.round(25 * s);
        p.stats.damage *= 1 - 0.10 * s;
      },
    }),
  },
  {
    id: 'hair_trigger', title: 'Hair Trigger',
    build: (s) => ({
      desc: `-${pct(0.20 * s)} attack cooldown / -${pct(0.20 * s)} max mana`,
      apply: (p) => {
        p.stats.cooldown *= 1 - 0.20 * s;
        p.stats.maxMana *= 1 - 0.20 * s;
      },
    }),
  },
  {
    id: 'vampires_kiss', title: "Vampire's Kiss",
    build: (s) => ({
      desc: `+${pct(0.05 * s)} lifesteal / potions heal ${x(1 / (1 + 0.5 * s))}`,
      apply: (p) => {
        p.stats.lifesteal = (p.stats.lifesteal || 0) + 0.05 * s;
        ensureChoices(p).potionHealMult *= 1 / (1 + 0.5 * s);
      },
    }),
  },
  {
    id: 'giants_heart', title: "Giant's Heart",
    build: (s) => ({
      desc: `+${Math.round(50 * s)} max HP and heal / -${pct(0.15 * s)} move speed`,
      apply: (p) => {
        const hp = Math.round(50 * s);
        p.stats.maxHp += hp;
        p.hp = Math.min(p.hp + hp, p.stats.maxHp);
        p.stats.speed *= 1 - 0.15 * s;
      },
    }),
  },
  {
    id: 'keen_edge', title: 'Keen Edge',
    build: (s) => ({
      desc: `+${pct(0.10 * s)} crit chance / -${pct(0.15 * s)} weapon damage`,
      apply: (p) => {
        p.stats.crit = Math.min(1, (p.stats.crit || 0) + 0.10 * s);
        p.stats.damage *= 1 - 0.15 * s;
      },
    }),
  },
  {
    id: 'lancers_discipline', title: "Lancer's Discipline",
    build: (s) => ({
      desc: `+${Math.max(1, Math.round(s))} pierce / +${pct(0.15 * s)} attack cooldown`,
      apply: (p) => {
        p.stats.pierce += Math.max(1, Math.round(s));
        p.stats.cooldown *= 1 + 0.15 * s;
      },
    }),
  },
  {
    id: 'merchants_pact', title: "Merchant's Pact",
    build: (s) => ({
      desc: `+${Math.max(1, Math.round(2 * s))} weapon slots this run / shop prices ${x(1 + 0.5 * s)}`,
      apply: (p) => {
        const c = ensureChoices(p);
        c.weaponSlotBonus += Math.max(1, Math.round(2 * s));
        c.shopPriceMult *= 1 + 0.5 * s;
      },
    }),
  },
  {
    id: 'glass_cannon', title: 'Glass Cannon',
    build: (s) => ({
      desc: `+${pct(0.40 * s)} weapon damage / damage taken ${x(1 + 0.30 * s)}`,
      apply: (p) => {
        p.stats.damage *= 1 + 0.40 * s;
        ensureChoices(p).damageTakenMult *= 1 + 0.30 * s;
      },
    }),
  },
  {
    id: 'fortunes_favor', title: "Fortune's Favor",
    build: (s) => ({
      desc: `Item drops ${x(1 + s)} / -${pct(0.25 * s)} gold gain`,
      apply: (p) => {
        ensureChoices(p).itemDropMult *= 1 + s;
        p.stats.goldMult = (p.stats.goldMult || 1) * (1 - 0.25 * s);
      },
    }),
  },
];

const POOL_BY_ID = Object.fromEntries(CHOICE_POOL.map((e) => [e.id, e]));

function epicWeight(wave) {
  return Math.min(EPIC_WAVE_CAP, RARITY_WEIGHTS.EPIC + EPIC_WAVE_RAMP * Math.max(0, wave | 0));
}

// ---------- roll --------------------------------------------------------------
// 3 DISTINCT offers (never the same id twice in one set; pass run-taken ids
// via excludeIds to keep a whole run repeat-free). Rarity is rolled per offer
// (COMMON/EPIC weights above), then the entry is picked uniformly from the
// still-unused pool — so any blessing can arrive at any rarity, scaled.
// Deterministic for an injected rng; 6 rng draws total (3 rarity + 3 entry).
export function rollChoices(wave, rng = Math.random, excludeIds = []) {
  const used = new Set(excludeIds);
  const cw = RARITY_WEIGHTS.COMMON, rw = RARITY_WEIGHTS.RARE, ew = epicWeight(wave);
  const offers = [];
  // How many offers this set can hold: 3, or whatever the pool has LEFT after
  // the run-taken ids. Counted off the POOL (not CHOICE_POOL.length - used.size)
  // so an exclude id that never came from this pool cannot shrink the set: with
  // the size arithmetic, 12 unknown ids left 2 offers even though all 14
  // blessings were still available.
  const pool = CHOICE_POOL.filter((e) => !used.has(e.id));
  const n = Math.max(0, Math.min(3, pool.length));
  for (let i = 0; i < n; i++) {
    const r = rng() * (cw + rw + ew);
    const rarity = r < cw ? 'COMMON' : r < cw + rw ? 'RARE' : 'EPIC';
    const avail = pool.filter((e) => !used.has(e.id));
    const entry = avail[Math.min(avail.length - 1, Math.floor(rng() * avail.length))];
    used.add(entry.id);
    offers.push({ id: entry.id, title: entry.title, rarity, ...entry.build(RARITY_SCALE[rarity]) });
  }
  return offers;
}

// ---------- apply -------------------------------------------------------------
// Thin wrapper: applies a rolled offer to the player (validating it looks
// like one of ours) and returns the player for chaining.
export function applyChoice(player, choice) {
  if (!choice || !choice.apply || !POOL_BY_ID[choice.id]) {
    throw new Error(`applyChoice: not a known choice: ${choice && choice.id}`);
  }
  ensureChoices(player);   // always stamp the run-scope anchor, even for
  choice.apply(player);    // offers that only touch existing stat seams
  return player;
}
