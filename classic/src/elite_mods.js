// HORDES — WAVE-11/4: ELITE MODIFIERS (Sk408: unlockable in the shop, NOT
// handed out). Elites can carry ONE modifier from the set the player has
// UNLOCKED (profile.unlockedElites — meta.js field contract, hb2's shop
// rows write it). Locked modifiers can NEVER roll — gating is strict.
//
// This module owns: the modifier table, the unlock-gated roll, the spawn
// stamp, and the on-death split plan. It does NOT touch enemy_types.js
// decide() brains — modifiers are stat/flag overlays the integrator stamps
// onto a spawned elite; behavior stays with the type.
//
// PURE CONTRACT:
//   rollEliteModifier(rng, unlockedIds) -> modifier | null   (no mutation)
//   applyEliteModifier(enemy, mod)      -> stamp object      (enemy UNTOUCHED —
//                                          hb1 Object.assigns the stamp)
//   splitChildren(enemy)                -> [child, ...] | null (pure; hb1 marks
//                                          enemy.splitSpent when it consumes)

// Chance a given elite spawn gets a modifier at all (the roll can "fail" and
// leave a plain elite). Only rolled for NORMAL elite spawns — never for
// split children (see splitChildren).
export const ELITE_MOD_CHANCE = 0.5;

// ---------- The modifiers ----------
// Shared shape: { id, name, desc, speedMult, hpMult, onDeathSplit, lifesteal,
//                 dropGuaranteed, visual }
//   speedMult/hpMult — stat multipliers stamped at spawn
//   onDeathSplit     — null | { count, hpFrac, sizeMult }: death-split plan
//                      (count = number of children, honoured by splitChildren)
//   lifesteal        — fraction of the elite's CONTACT damage healed back
//   dropGuaranteed   — a guaranteed item drop on kill is part of every deal
//   visual           — render tell flag (hb1's render reads it)
export const ELITE_MODS = {
  SWIFT: {
    id: 'SWIFT', name: 'Swift',
    desc: '+70% speed, 20% less hp. Blink and it is on you.',
    speedMult: 1.7, hpMult: 0.8,
    onDeathSplit: null, lifesteal: 0,
    dropGuaranteed: true, visual: 'afterimage',
  },
  SPLITTING: {
    id: 'SPLITTING', name: 'Splitting',
    desc: 'Dies into two smaller copies at 30% hp each. Once only — the copies are plain.',
    speedMult: 1.0, hpMult: 1.0,
    onDeathSplit: { count: 2, hpFrac: 0.3, sizeMult: 0.6 },
    lifesteal: 0,
    dropGuaranteed: true, visual: 'cracked',
  },
  VAMPIRIC: {
    id: 'VAMPIRIC', name: 'Vampiric',
    // F1 (audit 2026-09-16): the heal is ATTRIBUTED (only the elite whose
    // contact landed heals — a neighbour that dealt nothing gains nothing)
    // and sustained-capped at CONFIG.SURVIVAL.ELITE_VAMP_CAP_FRAC of ITS OWN
    // max HP per second (the G36 token-bucket pattern, per-elite). Below the
    // cap it is exactly half the contact damage it deals, as before.
    desc: 'Heals itself for half the contact damage it deals (its own touch only, at a bounded rate). Kill it fast.',
    speedMult: 1.0, hpMult: 1.0,
    onDeathSplit: null, lifesteal: 0.5,
    dropGuaranteed: true, visual: 'leech',
  },
};

export const ELITE_MOD_IDS = Object.keys(ELITE_MODS);

// ---------- The roll ----------
// rollEliteModifier(rng, unlockedIds) -> modifier descriptor | null.
//   nil if nothing unlocked (unknown ids in the list are ignored), or if the
//   chance roll fails. NEVER returns a modifier outside the unlocked set.
// rng call order (tests rely on it, loot.js convention):
//   1 x fail-flip (>= ELITE_MOD_CHANCE -> no modifier), 1 x uniform pick.
export function rollEliteModifier(rng = Math.random, unlockedIds = []) {
  const pool = [...new Set(unlockedIds)].filter(id => ELITE_MODS[id]);
  if (pool.length === 0) return null;
  if (rng() >= ELITE_MOD_CHANCE) return null;   // the roll failed
  const i = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
  return ELITE_MODS[pool[i]];
}

// ---------- The spawn stamp ----------
// applyEliteModifier(enemy, mod) -> NEW descriptor of fields for hb1 to stamp
// onto the enemy at spawn (Object.assign(enemy, stamp)). PURE — the enemy and
// the modifier table are never mutated; enemy_types decide() stays untouched.
// `mod` accepts a modifier id or descriptor. Returns null on bad input.
// Fields:
//   eliteMod       — modifier id on the enemy (render/death hooks key on it)
//   speed/hp/maxHp — stat multipliers applied to the enemy's OWN values
//   split          — the split-plan with its once-only guard (spent:false),
//                    or null for non-splitting modifiers
//   lifesteal      — heal fraction for the contact-damage path
//   dropGuaranteed — kill drops an item, always
//   visual         — render tell flag
export function applyEliteModifier(enemy, mod) {
  const M = typeof mod === 'string' ? ELITE_MODS[mod] : mod;
  if (!enemy || !M || !ELITE_MODS[M.id]) return null;
  return {
    eliteMod: M.id,
    speed: enemy.speed * M.speedMult,
    hp: enemy.hp * M.hpMult,
    maxHp: enemy.maxHp * M.hpMult,
    split: M.onDeathSplit ? { ...M.onDeathSplit, spent: false } : null,
    lifesteal: M.lifesteal,
    dropGuaranteed: M.dropGuaranteed,
    visual: M.visual,
  };
}

// ---------- The death split ----------
// Deterministic scatter for the children (the authored pairs sit on opposite
// diagonals, far enough that the split READS as a split, close enough to stay
// a threat pair). SPLIT_OFFSETS is the canonical TWO-child look.
export const SPLIT_OFFSETS = [{ dx: -12, dy: -7 }, { dx: 12, dy: 7 }];

// Scatter for `count` children (wave-25: the plan's `count` is HONOURED — it
// used to be ignored, so editing it silently did nothing). The authored pair
// comes first (count 2 is byte-identical to the old output), and any further
// children repeat the pair with y mirrored, so a bigger split stays a tight
// deterministic spread around the parent. No rng in this pure function; a
// non-positive / missing count falls back to the authored pair rather than
// producing an empty split.
function splitOffsets(count) {
  const want = Number(count);
  const n = Number.isFinite(want) && want > 0
    ? Math.max(1, Math.round(want)) : SPLIT_OFFSETS.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const base = SPLIT_OFFSETS[i % SPLIT_OFFSETS.length];
    const mirror = Math.floor(i / SPLIT_OFFSETS.length) % 2 === 1;
    out.push(mirror ? { dx: base.dx, dy: -base.dy } : { dx: base.dx, dy: base.dy });
  }
  return out;
}

// splitChildren(enemy) -> array of child descriptors | null (count = the
// SPLITTING plan's `count`, 2 by default).
// Pure: it never mutates the parent. Returns null when the enemy is not a
// SPLITTING elite or the split was already consumed (enemy.splitSpent — hb1
// sets it when it spawns the children; the ONCE-ONLY guard).
// Each child descriptor: same typeId, 30% of the parent's maxHp, 60% size
// (w/h precomputed for stamping), and NO modifier (eliteMod:null) — children
// are spawned through this path, never the modifier-roll path, so splits
// never recurse.
export function splitChildren(enemy) {
  if (!enemy || enemy.eliteMod !== 'SPLITTING') return null;
  if (enemy.splitSpent) return null;
  const plan = ELITE_MODS.SPLITTING.onDeathSplit;
  const hp = enemy.maxHp * plan.hpFrac;
  return splitOffsets(plan.count).map(off => ({
    typeId: enemy.typeId || 'CHASER',
    x: enemy.x + off.dx,
    y: enemy.y + off.dy,
    hp, maxHp: hp,
    sizeMult: plan.sizeMult,
    w: enemy.w * plan.sizeMult,
    h: enemy.h * plan.sizeMult,
    eliteMod: null,
    splitSpent: false,
  }));
}
