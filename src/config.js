// HORDES — global config & tuning constants
export const CONFIG = {
  // Internal render resolution (pixel-art; canvas is CSS-scaled up).
  VIEW_W: 480,
  VIEW_H: 300,

  PLAYER: {
    W: 12, H: 12,
    SPEED: 60,          // px/s
    MAX_HP: 100,
    KITE_DIST: 55,      // preferred distance from nearest enemy (auto-mover)
    XP_PICKUP_RADIUS: 22,
  },

  WEAPON: {
    DAMAGE: 8,
    COOLDOWN: 0.55,     // seconds between shots
    PROJ_SPEED: 190,
    PROJ_SIZE: 4,
    // SPLIT SHOT NERF (Sk408: volley +proj scaling was dominant):
    // total volley projectiles capped at MAX_PROJECTILES (base 1 + 2 from ALL
    // sources — Split Shot cards AND VOLLEY level grants combined), and extra
    // projectiles spread wider so more shots != strictly more hits.
    MAX_PROJECTILES: 3,
    SPREAD: 0.30,       // rad between volley projectiles (was 0.18)
  },

  ENEMY: {
    W: 10, H: 10,
    BASE_SPEED: 28,
    BASE_HP: 12,
    BASE_XP: 5,
    SPAWN_INTERVAL: 1.1, // seconds between spawn waves at t=0 (scales down)
    SPAWN_DIST: 280,     // spawn ring radius around player
  },

  GEM: { SIZE: 4 },

  XP_LEVEL_BASE: 30,    // xp needed for level 2
  XP_LEVEL_GROWTH: 1.35,

  // Mana pool (SKILLS cost mana; regen keeps pressure without starvation).
  MANA: {
    MAX: 100,
    REGEN: 2.5,         // mana/s
  },

  // Player-triggered skills. Keys: Q = FROST_NOVA, W = OVERCHARGE.
  SKILLS: {
    FROST_NOVA: {
      KEY: 'q',
      NAME: 'Frost Nova',
      MANA: 30,
      COOLDOWN: 8,       // seconds
      RADIUS: 85,        // AoE around the player
      DAMAGE: 15,
      SLOW: 2.5,         // slow duration on hit enemies
      SLOW_FACTOR: 0.45, // speed multiplier while slowed
    },
    OVERCHARGE: {
      KEY: 'w',
      NAME: 'Overcharge',
      MANA: 25,
      COOLDOWN: 12,      // seconds
      DURATION: 4,       // buff duration
      RATE_MULT: 0.45,   // attack cooldown multiplier while buffed
    },
  },

  // Finite consumables. Keys: H = health, N = mana.
  // REBALANCE (Sk408): heals weaker + rarer; during a boss fight the heal is
  // halved AGAIN (the "boss curse", applied in main.js's runAction seam since
  // usePotion lives in skills.js) — no face-tanking the boss on potions.
  POTIONS: {
    HP_HEAL: 35,
    MP_RESTORE: 40,
    DROP_CHANCE: 0.03,   // per enemy kill (was 0.05)
    MAX_CARRIED: 3,      // per kind
    START: 1,            // per kind at run start
  },

  // AutoPilot doctrine levers (general-vs-pilot controls; see controllers.js).
  AUTOPILOT: {
    FOCUS_RANGE: 260,      // doctrine candidates must be within this radius
    SWARM_CLUSTER_R: 60,   // cluster-density radius for the SWARM doctrine
    STANCES: {
      SAFE:     { KITE_MULT: 2.0, XP_SPEED: 0.6 },               // flee far, drift slowly to XP
      BALANCED: { KITE_MULT: 1.0, XP_SPEED: 1.0 },               // current behavior
      GREEDY:   { KITE_MULT: 0.5, XP_SPEED: 1.0, LOOT_WEIGHT: 0.65 }, // loot > safety
    },
  },

  // Weapon-slot economy: the base volley occupies slot 1. Players START at 3
  // slots and buy 4/5/6 in the shop (meta.js startWeaponSlots); this value is
  // the absolute cap (= meta.js MAX_WEAPON_SLOTS). The per-run cap lives in
  // state.weaponSlots, set by startRun.
  WEAPON_SLOTS: 6,

  // Wave-6 loot (loot.js): rare equippables drop from kills. Bosses always
  // drop one (rolled up-tier), elites often, normals rarely.
  ITEMS: {
    DROP_CHANCE: 0.02,    // per normal kill
    ELITE_CHANCE: 0.5,    // per elite kill (also rolled up-tier 0.75)
    BOSS_TIER_BIAS: 1.5,  // loot.js tierBias pushes boss rolls toward EPIC+
  },

  // Wave-6 portal progression: boss death opens a flame-ring portal; walking
  // in ends the wave (intermission -> next wave). The portal chases the
  // player (chest precedent) at playerSpeed + SPEED — it must ALWAYS outrun
  // the AutoPilot (Light Boots stacks reach 200+px/s in sims) or the run
  // stalls with the portal forever behind.
  PORTAL: { RADIUS: 16, SPEED: 60 },

  // WAVE-8/A portal-entry cinematic: plays once when the wave's FINAL boss
  // dies (between the kill and the intermission). SKIPPABLE gates the
  // any-key/click/tap skip; the movie always ends on its own via isDone.
  CINE: { SKIPPABLE: true },

  // World-space ground decor (Sk408 playtest: the camera is player-locked, so
  // a bare background read as sliding with you). Deterministic per-run field
  // hashed from (cellX, cellY, seed) — no stored arrays, cells outside the
  // view are simply never visited (cull for free).
  GROUND: {
    CELL: 32,          // px per decor cell (one optional piece per cell)
    DENSITY: 0.42,     // chance a cell carries a piece
    BOUND: 660,        // decor stops at the arena walls (player clamps +-600)
  },

  // Intercept drift for pickup-adjacent world objects (the AutoPilot is
  // chest/arch/portal-BLIND by design — controllers never learn these exist,
  // so the objects close the last distance themselves). CHEST is eager (pure
  // reward); ARCH was 20px/s but that read as the gate sliding after the
  // player (Sk408: "arches feel strange... drifting") — now it merely leans.
  DRIFT: {
    CHEST: 45,
    ARCH: 6,
  },

  // Typed-enemy spawner mix (see src/enemy_types.js). Weaves unlock by wave
  // (wave = floor(t/30)); elites can appear after ELITE_TIME at ELITE_CHANCE.
  SPAWNER: {
    CHASER_WEIGHT: 3,      // from wave 0
    SWARMER_WEIGHT: 2,     // from wave 1 (packs; grace period before that)
    BRUTE_WEIGHT: 1.5,     // from wave 2
    DASHER_WEIGHT: 1.2,    // from wave 2 (stalk/lunge cycles)
    SPITTER_WEIGHT: 1.5,   // from wave 3
    WARLOCK_WEIGHT: 1.2,   // from wave 3 (ranged hunter; telegraphed bolts)
    TICK_WEIGHT: 1.5,      // from wave 2 (latching packs — main.js pops packs)
    COLOSSUS_WEIGHT: 0.35, // from wave 5 (rare mini-boss tier)
    SWARMER_WAVE: 1,
    BRUTE_WAVE: 2,
    DASHER_WAVE: 2,
    SPITTER_WAVE: 3,
    WARLOCK_WAVE: 3,
    TICK_WAVE: 2,
    COLOSSUS_WAVE: 5,      // mirrors ENEMY_TYPES.COLOSSUS.minWave
    TICK_PACK: 3,          // ticks spawn in latches of 3 (packSize lives in hb4's module)
    ELITE_CHANCE: 0.05,    // per spawned enemy, after ELITE_TIME
    ELITE_TIME: 60,        // seconds
  },

  // ---- ESCALATION (Sk408 playtest: maxed builds became unkillable) --------
  // Curves by minion-wave w (= floor(t/30)); applied as a post-pass over the
  // enemy_types.js base scaling in main.js:
  //   hpScale(w)  = (1 + 0.9w) * 1.35^max(0, w-4)
  //       w: 0->1.0x  1->1.9x  2->2.8x  3->3.7x  4->4.6x  6->8.4x  9->20.7x
  //       (old linear 1+0.35w gave only 3.1x at w6 — far too flat)
  //   xpScale(w)  = (1 + 0.6w) * 1.25^max(0, w-4)   (keeps drafts flowing)
  //   dmgScale(w) = (1 + 0.2w) * 1.15^max(0, w-6)   (w6 ~1.9x contact dmg)
  // WAVE-5 retune: fresh profiles now start with 3 weapon slots (hb2's
  // economy), so mid-run DPS is ~half the 6-slot builds these curves were
  // tuned against — compounding now starts one wave later on hp/dmg to keep
  // early runs alive past the first boss; late-wave pressure is unchanged.
  // Wave timer: WAVE_LENGTH seconds per wave, then ONE boss; the timer is
  // paused while the boss lives; the next wave starts when it dies.
  ESCALATION: {
    HP:  { LINEAR: 0.9, COMPOUND_FROM: 4, COMPOUND: 1.35 },
    XP:  { LINEAR: 0.6, COMPOUND_FROM: 4, COMPOUND: 1.25 },
    DMG: { LINEAR: 0.2, COMPOUND_FROM: 6, COMPOUND: 1.15 },
    WAVE_LENGTH: 120,        // seconds before the boss spawns
    BOSS: {
      // hp = BASE_HP * hpScale(w) * (HP_MULT_BASE + HP_MULT_PER_WAVE * waveNum)
      // HARDENED (Sk408: bosses still melted): 35/18 -> 60/30, nova +50%,
      // plus a periodic summon so the fight can't be face-tanked.
      HP_MULT_BASE: 60,
      HP_MULT_PER_WAVE: 30,
      SIZE_MULT: 2.2,        // over the brute-elite body
      SPEED_MULT: 0.55,
      XP_KILLS: 10,          // boss xp ~= this many minion kills
      NOVA_INTERVAL: 3.5,    // seconds between radial shot bursts
      NOVA_SHOTS: 10,
      NOVA_SPEED: 62,
      NOVA_DAMAGE: 18,       // pre-dmgScale (+50%, was 12)
      SUMMON_INTERVAL: 8,    // seconds between summon bursts
      SUMMON_COUNT: 3,       // swarmers per burst
      SUMMON_TYPE: 'SWARMER',
      CHESTS: 2,             // guaranteed chest drops
      DOUBLE_EVERY: 3,       // every Nth wave spawns TWO bosses at once
    },
  },
};

// Upgrade pool for the 1-of-3 draft.
export const UPGRADES = [
  { id: 'dmg',     name: 'Whetstone',       desc: '+25% weapon damage',            apply: (p) => { p.stats.damage *= 1.25; } },
  { id: 'rate',    name: 'Quick Hands',     desc: '-15% attack cooldown',          apply: (p) => { p.stats.cooldown *= 0.85; } },
  { id: 'speed',   name: 'Light Boots',     desc: '+15% move speed',               apply: (p) => { p.stats.speed *= 1.15; } },
  { id: 'pickup',  name: 'Gem Magnet',      desc: '+30% pickup radius',            apply: (p) => { p.stats.pickup *= 1.3; } },
  { id: 'multi',   name: 'Split Shot',      desc: '+1 projectile per volley',      apply: (p) => { p.stats.projectiles += 1; } },
  { id: 'hp',      name: 'Iron Heart',      desc: '+25 max HP and heal 25',        apply: (p) => { p.stats.maxHp += 25; p.hp = Math.min(p.hp + 25, p.stats.maxHp); } },
  { id: 'pierce',  name: 'Sharpened Tips',  desc: 'Projectiles pierce +1 enemy',   apply: (p) => { p.stats.pierce += 1; } },
];
