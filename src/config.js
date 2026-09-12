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
    BASE_SPEED: 28,      // WAVE-20 tuning: 29/31/34 all proved pre-boss meat
                         // grinders in the sim (half the cohort died to plain
                         // chasers at ~40-60s, before any boss event spawned —
                         // the boss ladder, not the ambience, must be the wall)
    BASE_HP: 12,
    BASE_XP: 5,
    SPAWN_INTERVAL: 1.35, // seconds between spawn waves at t=0 (scales down;
                          // WAVE-20 tuning: 1.05 had half the cohort dead to
                          // ambient swarm before the 60s herald — pressure
                          // must come from DAMAGE (kept) + the boss ladder,
                          // not from body count)
    SPAWN_DIST: 280,     // spawn ring radius around player
  },

  GEM: { SIZE: 4 },

  XP_LEVEL_BASE: 30,    // xp needed for level 2
  // WAVE-20: 1.35 -> 1.28 — draft-stakes sim (tools/draft_sim.mjs): the
  // number of drafts per run collapsed mid-run exactly as escalation
  // compounded, so the draft (the game's only real decision layer) stopped
  // deciding anything — good vs bad drafts diverged by just x1.11. 1.28
  // keeps drafts arriving; divergence projected/verified x1.4+.
  XP_LEVEL_GROWTH: 1.28,

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
    DENSITY: 0.36,     // chance a cell carries a fine piece (WAVE-24: 0.42 ->
                       // 0.36 — with the landmark layer added below, the fine
                       // field read busy; the coarse structures carry identity)
    RIM: 600,          // arena clamp edge in world px (MUST match main.js's
                       // +-600 player clamp and the arena wall in render.js).
                       // Decor/landmarks never paint past it (WAVE-24: the old
                       // BOUND 660 let pieces spill into the off-map gloom).
    // WAVE-24 (#3) LANDMARKS: a second, coarser layer of deliberate
    // structures (ruined wall runs, fallen pillars, cairns, camp rings,
    // theme-flavored piles) on this grid, so the floor has landmarks to
    // orient by instead of pure texture. LANDMARK_DENSITY = chance a cell
    // carries one.
    LANDMARK_CELL: 192,
    LANDMARK_DENSITY: 0.30,
    // WAVE-9B/2 per-wave AREA IDENTITY: the theme ladder cycles by WAVE number
    // (never by run — Sk408 beat the boss, entered wave 2 and the ground read
    // identical). Each theme = base ground tone + grid dots + decor palette
    // family + optional subtle scene tint (drawn under the entities). The
    // per-run groundSeed still shapes WHICH cells carry a piece; the family
    // is wave-chosen. SNOWFIELD stays the LIGHTEST area but reads as muted
    // grey-blue, not white (Sk408 v2: bright snow washed out the sprites).
    THEMES: [
      { name: 'THE VERDANT HOLLOW', base: '#0e1610', grid: '#16241b',
        tuft: '#1c3222', tuft2: '#24402a', stone: '#1c2422', stoneTop: '#2a3630',
        crack: '#08100a', slab: '#121c14', tint: null },
      { name: 'THE ASHEN WASTE', base: '#121216', grid: '#1b1b21',
        tuft: '#26262c', tuft2: '#2e2e36', stone: '#1e1e24', stoneTop: '#2c2c34',
        crack: '#0a0a0e', slab: '#16161c', tint: 'rgba(120,120,140,0.04)' },
      { name: 'THE SNOWFIELD', base: '#57616d', grid: '#4c5560',
        tuft: '#3f4d5e', tuft2: '#4a5a6e', stone: '#414b57', stoneTop: '#5f6b78',
        crack: '#39424c', slab: '#4e5864', tint: 'rgba(160,180,210,0.04)' },
      { name: 'THE BLOOD RUST', base: '#160d0b', grid: '#221412',
        tuft: '#3a1a14', tuft2: '#4a241a', stone: '#241410', stoneTop: '#38221a',
        crack: '#0c0604', slab: '#1a100c', tint: 'rgba(160,50,30,0.04)' },
      { name: 'THE BONE DESERT', base: '#1a150c', grid: '#262016',
        tuft: '#3a3020', tuft2: '#4a3e2a', stone: '#2c2418', stoneTop: '#443826',
        crack: '#0e0a04', slab: '#201a10', tint: 'rgba(220,190,120,0.03)' },
      { name: 'THE VOID REACH', base: '#0f0d1c', grid: '#191730',
        tuft: '#241e44', tuft2: '#30285c', stone: '#1c1834', stoneTop: '#2c2650',
        crack: '#080614', slab: '#131024', tint: 'rgba(110,80,200,0.05)' },
    ],
  },

  // ---- HUD presentation (WAVE-24 #1/#2/#4 legibility pass) ------------------
  // The vision pass called the canvas text "washed out / placeholder" and the
  // bar labels "tiny". Every canvas label now paints on a dark PLATE (contrast
  // never depends on the terrain behind the HUD) at these sizes, in VIEW
  // coordinates — WAVE-23's backing-store change rasterises them at device
  // resolution, so these ARE the on-screen sizes. Bar chrome gets a steel
  // outer FRAME + dark TROUGH so a 0% bar reads as an EMPTY container rather
  // than a filled grey bar or a dead placeholder.
  HUD: {
    LABEL_PX: 9,          // HP / MP / XP bar labels (was 8)
    FEED_PX: 9,           // event-feed lines
    LV_PX: 11,            // level badge (was 9 — read as unpolished)
    BADGE_PX: 9,          // FOCUS / STANCE doctrine readout
    BANNER_TITLE_PX: 22,  // boss-arrival title (was 20)
    BANNER_SUB_PX: 11,    // boss-arrival sub-line (was 10)
    FRAME: '#6a6a7c',     // outer steel frame around every bar/plate
    TROUGH: '#2e2e38',    // dark empty track (a 0% bar must read EMPTY)
    PLATE: 'rgba(4,4,10,0.72)',   // dark plate behind label text
    PLATE_SOLID: 'rgba(6,6,12,0.80)',
    TICK: 'rgba(255,255,255,0.12)',        // minor ticks (full track)
    TICK_MAJOR: 'rgba(255,255,255,0.22)',  // 25/50/75% ticks
    HP: '#ff9aa6', MP: '#9ec2ff', XP: '#ffe07a',   // label tints (bright)
    // FOCUS is targeting doctrine (cool/neutral); STANCE is the RISK dial, so
    // it is risk-colored: green = safe, gold = balanced, orange = greedy.
    FOCUS_COLOR: '#9ec2ff',
    STANCE_COLORS: { SAFE: '#68e080', BALANCED: '#ffd75e', GREEDY: '#ff8848' },
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
    // WAVE-20 (Sk408: weapon-only builds shrugged the horde off) — contact
    // + projectile damage now climbs twice as fast with the minion waves;
    // shop upgrades (hp/defense/speed) are the later mitigation.
    DMG: { LINEAR: 0.4, COMPOUND_FROM: 6, COMPOUND: 1.15 },
    WAVE_LENGTH: 120,        // seconds before the boss spawns
    // WAVE-10: the wave whose boss death triggers the FINALE (the maw) once
    // its portal cinematic ends. Tunable — Sk408 moves it later when the
    // end-game phase opens up.
    END_WAVE: 5,
    // WAVE-20 MID-WAVE BOSS (Sk408 balance pass): the HERALD spawns halfway
    // through EVERY wave (AT_FRACTION of WAVE_LENGTH). It rings the player
    // with PILLARS (stationary turret enemies, enemy_types.js) that chip from
    // all sides, then relentlessly pursues at above-player speed firing
    // player-weapon-like bursts. Weaker than the end-of-wave cast by design:
    // the pillar ring + pursuit should claim the player in 1-3 of 10 runs on
    // each wave (vs 5-8 of 10 for the wave boss) so runs die to a LADDER of
    // escalating checkpoints — progress is felt, not a wall.
    MIDBOSS: {
      AT_FRACTION: 0.5,        // spawns at this fraction of WAVE_LENGTH
      // hp = BASE_HP * hpScale(w) * (HP_MULT_BASE + HP_MULT_PER_WAVE * waveNum)
      // WAVE-20 tuning: 22 -> 17 — the duel is the threat, not the hp bar;
      // shorter fight = less pack-exposure time inside the ring (the sim had
      // HERALD+ambient jointly eating half the cohort before the 120s boss).
      HP_MULT_BASE: 17,
      HP_MULT_PER_WAVE: 14,
      SIZE_MULT: 1.7,          // over the chaser chassis (imposing, not huge)
      SPEED_MULT: 1.8,         // x BASE_SPEED*(1+0.05w) ~= 1.12x player speed
                                // (retuned after WAVE-20 BASE_SPEED 28 -> 34)
      HOLD_DIST: 55,           // inside this the pursuit eases to a duel drift
      CLOSE_SPEED_MULT: 0.3,   // the ease-off multiplier (catch, don't hug)
      CONTACT_MULT: 1.1,       // over base contact (chassis contactMult is 1)
      XP_KILLS: 6,             // herald xp ~= this many minion kills
      // The ring: PILLARS encircle the PLAYER where they stand when it lands.
      // WAVE-20 tuning: 8 pillars @ 1.4s cadence claimed 6/20 sim runs by
      // themselves — the ring must cage, not execute. 6 pillars, slower fire,
      // wider cage so the duel (not the turrets) does the claiming.
      PILLARS: 6,              // ring size
      PILLAR_RADIUS: 150,      // ring radius around the player (px)
      RING_INTERVAL: 24,       // seconds between ring refreshes while it lives
                              // (15s meant effectively-permanent cage + pack)
      // The rifle: a tight VOLLEY-like burst (fast, medium damage, dodgeable).
      BURST_INTERVAL: 2.4,
      BURST_SHOTS: 3,
      BURST_SPREAD: 0.24,      // radians, total arc
      BURST_SPEED: 185,        // ~= player volley PROJ_SPEED
      BURST_DAMAGE: 6,         // pre-dmgScale (7 proved hot with the ring up)
      CHESTS: 1,               // guaranteed chest on the herald kill
    },
    BOSS: {
      // hp = BASE_HP * hpScale(w) * (HP_MULT_BASE + HP_MULT_PER_WAVE * waveNum)
      // HARDENED (Sk408: bosses still melted): 35/18 -> 60/30, nova +50%,
      // plus a periodic summon so the fight can't be face-tanked.
      // WAVE-20: 60/30 -> 85/40 -> 260/75 -> 500/60 — the wave boss should be
      // the wall the run breaks on (5-8 of 10 runs die there per wave). Probe
      // data: wave-1 pilots hit t=120 with 2000-8000 dps (draft luck) and
      // 250-480 hp; at 260 the fight ran 5-20s and strong drafts face-melted
      // the boss mid-first-cycle. 500 buys the pattern room to land.
      HP_MULT_BASE: 500,
      HP_MULT_PER_WAVE: 60,
      SIZE_MULT: 2.2,        // over the brute-elite body
      // WAVE-20: 0.55 -> 0.95 — the cast's chase/charge speeds must threaten
      // a fleeing pilot (player 60px/s; GRAVELMAW's 3.4x charge now lands).
      SPEED_MULT: 0.95,
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
