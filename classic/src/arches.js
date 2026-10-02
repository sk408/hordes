// HORDES — ARCHES: field structures the player walks under for a TIMED power.
// Pure-ish module: rolls/ticks + events; hb1 applies the mods to the run and
// renders. All randomness through an injectable rng (default Math.random).
//
// STATE CONTRACT (hb1 wires this into state):
//   state.arches     — array of arch objects on the field ({ id, type, x, y })
//   state.archBuffs  — array of ACTIVE buffs ({ type, t }) (lazily created)
// Both are lazily created by tickArches, so drop-in wiring is safe.
//
// STACKING RULES:
//   - Same arch type NEVER stacks: walking under a second arch of an active
//     type REFRESHES the timer to full duration (event: archRefreshed).
//   - Different arch types DO stack (both run concurrently); their mods
//     combine per activeArchMods() below — multiplicative where mult-like.
//   - SHIELD is special: while active it grants `shieldHits` absorbs (3);
//     the shield vanishes when the timer expires, hits or not.
//
// MODS CONTRACT (same field names as loot.js STAT_DEFAULTS):
//   rateMult / pickupMult / damageMult / speedMult are MULTIPLIERS.
//   DOUBLE_FIRE  rateMult x2      MAGNET pickupMult x4
//   SHIELD       3 absorbs        BERSERK damageMult x1.5, speedMult x0.75
//   SWIFT        speedMult x1.4

export const ARCH_TYPES = {
  DOUBLE_FIRE: {
    id: 'DOUBLE_FIRE', name: 'Twin Fury Arch', duration: 60,
    desc: 'Attack rate x2 for 60s',
    mods: { rateMult: 2 },
  },
  MAGNET: {
    id: 'MAGNET', name: 'Magnet Arch', duration: 60,
    desc: 'Pickup radius x4 for 60s',
    mods: { pickupMult: 4 },
  },
  SHIELD: {
    id: 'SHIELD', name: 'Aegis Arch', duration: 75,
    desc: 'Absorb 3 hits for 75s',
    mods: {},
    shieldHits: 3,
  },
  BERSERK: {
    id: 'BERSERK', name: 'Berserker Arch', duration: 90,
    desc: '+50% damage, -25% move for 90s',
    mods: { damageMult: 1.5, speedMult: 0.75 },
  },
  SWIFT: {
    id: 'SWIFT', name: 'Zephyr Arch', duration: 60,
    desc: '+40% move speed for 60s',
    mods: { speedMult: 1.4 },
  },
};
const TYPE_IDS = Object.keys(ARCH_TYPES);

export const ARCH = {
  ACTIVATE_R: 26,   // player must pass this close to trigger
};

let nextId = 1;

// Spawn an arch at (x, y). Type picked by rng (uniform over TYPE_IDS order:
// DOUBLE_FIRE, MAGNET, SHIELD, BERSERK, SWIFT — tests rely on the order).
export function spawnArch(rng = Math.random, x = 0, y = 0) {
  const type = TYPE_IDS[Math.floor(rng() * TYPE_IDS.length)];
  return { id: nextId++, type, x, y };
}

// Per-frame: trigger arches the player walks under, tick active buffs.
// Returns events: archGranted { type, name, duration, mods, shieldHits? },
// archRefreshed { type, duration }, archExpired { type }.
export function tickArches(state, dt) {
  if (!Array.isArray(state.arches)) state.arches = [];
  if (!Array.isArray(state.archBuffs)) state.archBuffs = [];
  const p = state.player;
  const events = [];

  // Trigger pass (reverse splice — the arch is consumed by walking under it).
  for (let i = state.arches.length - 1; i >= 0; i--) {
    const arch = state.arches[i];
    if (Math.hypot(arch.x - p.x, arch.y - p.y) > ARCH.ACTIVATE_R) continue;
    state.arches.splice(i, 1);
    const def = ARCH_TYPES[arch.type];
    const existing = state.archBuffs.find(b => b.type === arch.type);
    if (existing) {
      existing.t = def.duration;   // no stacking — refresh to full duration
      events.push({ kind: 'archRefreshed', type: arch.type, duration: def.duration });
    } else {
      state.archBuffs.push({ type: arch.type, t: def.duration });
      events.push({
        kind: 'archGranted', type: arch.type, name: def.name,
        duration: def.duration, mods: { ...def.mods },
        ...(def.shieldHits ? { shieldHits: def.shieldHits } : {}),
      });
    }
  }

  // Timer pass.
  for (let i = state.archBuffs.length - 1; i >= 0; i--) {
    const b = state.archBuffs[i];
    b.t -= dt;
    if (b.t <= 0) {
      state.archBuffs.splice(i, 1);
      events.push({ kind: 'archExpired', type: b.type });
    }
  }
  return events;
}

// Combined mods of every ACTIVE buff (hb1 applies these per frame):
// mult fields multiply together, shieldHits sums. PURE read of state.
export function activeArchMods(state) {
  const out = { rateMult: 1, pickupMult: 1, damageMult: 1, speedMult: 1, shieldHits: 0 };
  for (const b of state.archBuffs || []) {
    const def = ARCH_TYPES[b.type];
    if (!def) continue;
    for (const [k, v] of Object.entries(def.mods)) out[k] *= v;
    if (def.shieldHits) out.shieldHits += def.shieldHits;
  }
  return out;
}
