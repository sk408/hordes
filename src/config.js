// HORDES — global config & tuning constants

/**
 * THE effective volley projectile cap: the base plus whatever the Split Shot
 * shop row has bought (owner-ordered 2026-09-13: a buyable that "goes to 10 and
 * allows the card to continue improving until that cap").
 *
 * Every read site goes through here — the volley fire, the draft's at-cap label,
 * and the at-cap damage conversion. Three places used to read
 * CONFIG.WEAPON.MAX_PROJECTILES directly; if one of them keeps reading the base
 * while another reads the raised cap, the Split Shot card becomes a fake choice
 * again in one path and a real one in the other. PURE: stats in, number out.
 */
export function volleyProjectileCap(stats) {
  return CONFIG.WEAPON.MAX_PROJECTILES + ((stats && stats.splitCap) || 0);
}

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

  // ---- SURVIVAL (SURVIVAL-GAP wave) ----------------------------------------
  // The run is 30:00 long now, and nothing could reach it: the wave-29
  // diagnostic narrowed the wall to CONTACT DAMAGE (boss contact x0.25 let 3/3
  // maxed runs pass 10:00; boss hp x0.25 changed nothing). The function that was
  // wrong is this one: a hit's damage was `BASE * dmgMult * typeMult *
  // chargeMult`, drawn straight off the ladder's damage curve, which reaches
  // x9.32 by 30:00 — against a player pool that only grows a little (Vitality
  // +20/level, Iron Heart +25 flat, both ADDITIVE). A wave-1 GRAVELMAW charge
  // was 14 * 2.6 * 2.2 * 1.5 = 120 against a 100-230 HP bar, and by wave 15 the
  // same charge was 430: one arithmetic one-shot, at every tier, no matter how
  // many hours of shop were behind the build. That is not difficulty, it is an
  // unwinnable curve, and it is why a maxed save died at 1:52-2:13.
  //
  // Two changes, both FUNCTIONAL rather than a flattened magic number:
  //   * the ladder's damage curve is the THREAT SIGNAL, and contact damage now
  //     responds to it SUB-LINEARLY (pow). The threat still climbs all run —
  //     from x1.61 to x3.05 of base contact — but it can no longer outrun the
  //     pool by construction.
  //   * a single hit is additionally capped at HIT_CAP_FRAC of the player's
  //     max HP, which is the design intent the wave-20 comments always stated
  //     ("a catch costs ~half a health bar, not the whole run"): the wall is
  //     meant to be death by repeated catches, and now it can be.
  //   * MAX HP grows with LEVEL (HP_PER_LEVEL, linear in the run's START pool)
  //     — the run's missing EHP axis. A fresh save levels ~20-30 times and gains
  //     ~+30-45%; a maxed build that survives to level 40-45 gains ~+60-70%,
  //     which is what lets a developed build answer the late ladder at all. It
  //     is deliberately LINEAR, not compounding: levels come fast in this game
  //     (the autopilot hits level 40+ inside 9 minutes) and a compounding rule
  //     made even a FRESH save unkillable (measured: 1018 HP at 8:45).
  // Early-game effect is measured, not assumed: the fresh cohort must stay in
  // the 3-6 minute band (it was dying at 1:52).
  SURVIVAL: {
    BASE_CONTACT: 196,    // 14 squared (owner enemy buff; see POWER)
    CONTACT_POW: 0.65,    // contact damage ~ ladderDmg^0.65: the threat climbs
                          // all run (x1.87 -> x4.02 of base contact by 30:00)
                          // without outrunning the pool (see the measured lever
                          // ranking: pow 1.0 leaves the fresh band at ~1:35,
                          // pow < 0.5 makes a fresh save survive 8+ minutes)
    HIT_CAP_FRAC: 0.5,    // a single hit never eats more than this x max HP
    HP_PER_LEVEL: 0.015,  // level-up adds this x the run's START max HP
    MAX_DRAIN_TICKS: 2,   // TICK latches: only this many bleed at once
    // F1 (audit 2026-09-16): the ENEMY-side twin of HEAL_BUDGET — the VAMPIRIC
    // elite mod's contact heal is a throughput heal with the same two defects
    // G34/G36 closed on the player side (uncapped rate, no attribution: every
    // lifesteal enemy within 13px healed, so N stacked elites healed N x). Same
    // TOKEN-BUCKET mechanism (src/heal.js helpers), mirrored PER ELITE off the
    // elite's OWN maxHp — the player-side budget/seam in heal.js is deliberately
    // NOT widened (its exemptions are a settled contract; see heal.js header).
    //
    // CAP_FRAC is DERIVED, not guessed: the uncapped heal is 0.5 x touchDmg per
    // contact / 0.6s i-frames ~= 0.83 x touchDmg/s. MEASURED on a fresh build
    // (elite maxHp 300, player maxHp 130, typical contact hit ~29): a single
    // vampiric elite sustained 24.0 HP/s = 8.0% of ITS OWN maxHp/s, and a
    // 3-stack healed exactly 3x that (72 HP/s). 0.10/s is the smallest round
    // number ABOVE the measured single-elite typical, so an ordinary lone
    // vampiric elite heals byte-identically to before (the bucket never
    // empties below it) while the stacked case (3x measured) and the hit-cap
    // worst case (touchDmg = 0.5 x PLAYER maxHp scaled inversely with player
    // safety — a big-health player made elites heal MORE, up to ~42% of the
    // player's bar per second per elite) are bounded at 10% of the elite's own
    // maxHp/s. A cap, not a removal: the mod still visibly sustains.
    ELITE_VAMP_CAP_FRAC: 0.10,   // max VAMPIRIC contact heal, fraction of THE ELITE'S OWN max HP per second
  },

  WEAPON: {
    // OWNER 2026-09-18: "the first run pilot is too weak. we need to make
    // starting damage 200% more so the pilot can kill a few enemies."
    // 8 -> 24 (200% MORE = triple). Applies to every run's base; say the word
    // if it should instead be run-1 only, which is a different change.
    DAMAGE: 24,
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
    // OWNER (2026-09-13): "I want to buff the enemies. Square their hp, damage,
    // and double their speed."
    //
    // SQUARED AT THE BASE, not on the composite value. Squaring the composite
    // (what the player finally meets) ALSO squares every multiplier inside it,
    // which silently rewrites OTHER systems' documented contracts: heat x2.2
    // would become x4.84 foe hp, and the wave ladder would compound with itself
    // (measured: the heat contract check failed with "x2.2 ... hot 696.96" =
    // 144 * 2.2^2). Anchoring the square on the BASE constants gives every foe
    // the square -- 12 -> 144 hp, 14 -> 196 contact -- while heat, ladder, stage
    // and type multipliers all stay linear, exactly as their own tests pin.
    POWER: {
      HP_SQUARED: true,
      DAMAGE_SQUARED: true,
    },
    // Doubled from 28 by the same owner change. ONE constant: both enemy
    // constructors (makeEnemy, makeTypedEnemy) and every boss SPEED_MULT are
    // relative to it, so this is the whole "double their speed".
    BASE_SPEED: 56,
                         // grinders in the sim (half the cohort died to plain
                         // chasers at ~40-60s, before any boss event spawned —
                         // the boss ladder, not the ambience, must be the wall)
    BASE_HP: 144,          // 12 squared (owner enemy buff; see POWER)
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

  // Mana pool (SKILLS cost mana). FINITE BY DESIGN (Sk408: "make mana a finite
  // resource ... spells and skills use it up enough to actually exhaust it at
  // base levels without shop upgrades").
  //
  // The base trickle sits deliberately far below what a casting player spends:
  // keeping BOTH skills on cooldown costs 30/8 + 25/12 = 5.83 mana/s against
  // 0.5/s here, so at base the pool really does run dry and mana is a budget you
  // spend rather than a throttle you wait on. Measured before this change: a
  // spam-casting run spent 615 mana and had 549 mana of income, i.e. it refilled
  // itself (89% refunded) and never stayed empty.
  //
  // Mana Spring (meta.js: +0.5/s per level, maxLevel 4) is the relief valve —
  // maxed it gives 2.0/s, so a fully-upgraded save sits at 2.5/s, exactly the
  // old base rate. Veterans lose nothing; a fresh save feels the squeeze.
  MANA: {
    MAX: 100,
    REGEN: 0.5,         // mana/s — base trickle; Mana Spring is the way up
  },

  // RSS8 MAGNET COLLECTOR (owner 2026-09-17: "We could have a magnet
  // collector card. A very rare card that gives a skill to collect all drops
  // every 30 seconds."). The sweep's own numbers. SWEEP_S is how long the
  // pull runs (the visible streak-in); PULL_RATE is the exponential pull
  // strength per second (distance shrinks by e^-PULL_RATE*SWEEP_S ~= 0.2% —
  // everything lands inside the pickup radius from any field distance);
  // AUTO_MIN is the AUTO-PILOT's floor-value policy: fire when that many
  // ground drops are outstanding. The COOLDOWN lives on the skill def below
  // (30s, the owner's number; NO mana price — the cooldown is the whole
  // cost).
  MAGNET: {
    SWEEP_S: 0.45,
    PULL_RATE: 14,
    AUTO_MIN: 25,
    RING_RADIUS: 110,   // the expanding-ring tell, in world px
  },

  // ARENA SCALE-UP additions (msg_01M2R966): BOSS-CLEAR SWEEP. The moment the
  // wave's last boss falls and the portal opens, the field's ground drops are
  // swept to the pilot through the SAME pull mechanics as the magnet (visible
  // motion, credited by the NORMAL pickup loop — never a second payout path),
  // and the collected total is toasted as part of the boss-clear moment. No
  // silent loss: nothing is deleted; items the run's own rules refuse (an
  // over-cap potion, an IGNOREd equip) honestly stay on the floor.
  BOSS_SWEEP: {
    SWEEP_S: 0.9,        // sweep duration, s (a beat longer than the magnet's)
    PULL_RATE: 10,       // exponential pull toward the pilot, per second
    RING_RADIUS: 150,    // the expanding-ring tell, in world px
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
    // N1 slice 1 (goals doc N1b item 3): the Witch's Q, her DEFINING move —
    // a mana-fed chain that must read as the big deliberate burst next to her
    // gun (WEAPONS.ZAP: 3 jumps / 90 reach / 0.75 falloff on a 1.4s cadence),
    // so it EXCEEDS the gun on every axis: more jumps, longer reach, GENTLER
    // per-jump falloff. Every enemy it kills detonates at the ESTABLISHED
    // onkillboom price (rewrites.js BOOM_MANA_COST 6, hard gate — item 2:
    // the relief valve is the shop, never a balance change), and FROST_NOVA's
    // slow moved ONTO the chain (same constants; FROST_NOVA itself is
    // UNCHANGED and returns as a draftable card in N1 slice 2).
    CHAIN_REACTION: {
      KEY: 'q',
      NAME: 'Chain Reaction',
      MANA: 30,
      COOLDOWN: 8,        // seconds — a deliberate burst, not gun cadence
      JUMPS: 6,           // vs the gun's 3
      CHAIN_RANGE: 130,   // vs the gun's 90
      FALLOFF: 0.85,      // vs the gun's 0.75 — gentler per-jump decay
      DAMAGE: 12,         // flat per strike
      DAMAGE_FRAC: 0.5,   // + 50% of weapon damage per strike (the boom shape:
                          // stays relevant as the ladder's HP curve climbs)
      SLOW: 2.5,          // FROST_NOVA's slow duration, applied to every touch
      SLOW_FACTOR: 0.45,
    },
    // N1 slice 3 (docs/briefs/N1_ULTS_SPECS.md): the three non-Witch class
    // ults. Shared contract: KILL-CHARGED (charge from the live p.kills
    // counter), a COOLDOWN floor so one dense wave cannot chain the ult, and
    // — SUPERSEDED 2026-09-17 by owner directive "player ults must cost a
    // significant amount of mana" — a MANA price of 60: 60% of the 100 base
    // pool, so at base regen 0.5/s the refund from an empty pool is a full
    // 120s wave (never more than about one ult per wave without potions;
    // Mana Spring/potions buy more, as shop investment should). The N1
    // "NON-mana / no MANA key" clause is overturned; skills.js charges AND
    // prices all three. LABEL (<=5 chars) is the on-screen short form for the
    // fixed 96px H1 touch button + text HUD; NAME stays the long spec name.
    EARTHSHATTER: {       // KNIGHT — one huge player-centred shockwave + a
      KEY: 'q',           // defensive rider (the free tank stands in the clump)
      NAME: 'Earthshatter',
      LABEL: 'EARTH',
      KILLS: 40,          // charge: kills to READY
      MANA: 60,           // 60% of the base pool — one ult per wave at base regen
      COOLDOWN: 12,       // seconds — the chain-proof floor
      RADIUS: 240,        // radial shockwave centred on the player
      DAMAGE: 40,         // flat + ...
      DAMAGE_MAXHP: 1.2,  // ... 1.2 x maxHp (scales with the Knight's own stat)
      FORTIFY_TIME: 3,    // seconds of FORTIFY after the blast
      FORTIFY_MULT: 0.5,  // damage taken x0.5 while FORTIFY lives
    },
    AFTERIMAGE: {         // ROGUE — 3s of movement payoff: speed up, and a
      KEY: 'q',           // phantom detonates at her CURRENT position on a
      NAME: 'Afterimage', // tick through the ONE blast path (rewrites.js)
      LABEL: 'AFTER',
      KILLS: 30,
      MANA: 60,
      COOLDOWN: 10,
      DURATION: 3,        // seconds the window lives
      SPEED_MULT: 1.5,    // move speed multiplier (stat shape, NO dash/teleport)
      TICK: 0.25,         // seconds between phantom detonations
      RADIUS: 70,         // per-phantom blast radius
      DAMAGE: 30,         // flat + ...
      DAMAGE_WEAPON: 0.6, // ... 0.6 x weapon damage (the boom shape)
    },
    CONSECRATION: {       // PALADIN — ONE placed, persistent holy field at
      KEY: 'q',           // the densest cluster; the only sustain ult
      NAME: 'Consecration',
      LABEL: 'ALTAR',     // UI label for the consecrated ground, not a rename
      KILLS: 40,
      MANA: 60,
      COOLDOWN: 15,
      RADIUS: 140,        // field radius
      DURATION: 6,        // seconds the field lives
      DPS: 18,            // ticking damage to enemies inside
      TICK: 0.5,          // seconds per tick (9 dmg/tick; heal cap = 9 HP/tick)
      HEAL_PER_KILL: 2,   // HP per enemy KILLED inside, banked and paid per
                          // tick, capped at DPS*TICK so it cannot out-heal a boss
    },
    // RSS8 MAGNET COLLECTOR: the card-granted, player-FIRED collection skill.
    // Not a class skill — it exists only in runs that drafted the MYTHIC
    // 'Magnet Collector' card (main.js gates the act on the run holding it,
    // the same card-flag pattern the Frost Nova card uses). Fired on X / the
    // MAG touch button; 30s cooldown, no mana (the cooldown is the cost).
    // The effect itself is a PULL, not an instant credit: the sweep moves
    // every ground drop to the player and the NORMAL pickup loop pays every
    // one through the one credit path (XP mults, potion cap, equip
    // decisions) — the skill never invents a second payout.
    MAGNET_PULL: {
      KEY: 'x',
      NAME: 'Magnet Pull',
      LABEL: 'MAG',
      MANA: 0,
      COOLDOWN: 30,      // seconds — the owner's number; the whole cost
      FLAT_CD: true,     // EXACTLY 30 (perks.js): Focus/rewrite-slot cooldown
                         // mults do not apply — the card SAYS 30s, so it IS 30s
    },
  },

  // Finite consumables. Keys: H = health, N = mana.
  // REBALANCE (Sk408): heals weaker + rarer; during a boss fight the heal is
  // halved AGAIN (the "boss curse", applied in main.js's runAction seam since
  // usePotion lives in skills.js) — no face-tanking the boss on potions.
  POTIONS: {
    HP_HEAL: 35,
    MP_RESTORE: 40,
    // POTION TUNE (owner 2026-09-17, msg_01M2R9CX: "I noticed during my runs
    // that there were a lot of potions on the ground. Cut their drop by about
    // 1/5th and steepen the trail off" — clarified: "cut it TO 1/5th not BY
    // 1/5th"). DROP_CHANCE 0.03 -> 0.006 (exactly one fifth); the trail-off is
    // squared (see ADAPTIVE below). The cut is the PER-KILL GROUND channel
    // only: chest contents, starting inventory and the hordebait rule bump are
    // untouched.
    DROP_CHANCE: 0.006,  // per enemy kill (was 0.03 until 2026-09-17; 0.05 before G32)
    MAX_CARRIED: 3,      // per kind
    START: 1,            // per kind at run start
    // G33 ADAPTIVE DROPS (owner 2026-09-16: "we should have adaptive potion drops
    // as the enemies killed per second increases, potion drop rate should drop in
    // a somewhat inverse pattern"). At or below REF_KPS kills/second the chance is
    // EXACTLY DROP_CHANCE — the early game is byte-identical. Above it the chance
    // is scaled by clamp((REF_KPS/kps)^2, FLOOR_FRAC, 1): the POTION TUNE
    // (2026-09-17) squared the inverse ratio and cut the floor 0.2 -> 0.04 (both
    // one fifth), a STEEPER trail-off that stays strictly below the old linear
    // ratio at every rate above REF_KPS. Income potions/second = DROP_CHANCE *
    // min(kps, REF_KPS) below the reference, then FALLS as 1/kps (was: flat) —
    // a dense swarm stops printing potions outright. The floor binds at
    // kps = REF_KPS/sqrt(FLOOR_FRAC) = 100, the SAME bind point as the old
    // curve (observed swarm max 93; G33 report). TAU is the time constant of the
    // dt-driven EWMA kill-rate estimator (loot.js ewmaKillRate).
    ADAPTIVE: { REF_KPS: 20, FLOOR_FRAC: 0.04, TAU: 6 },
  },

  // ---- G34+G36 SHARED SUSTAINED-HEALING BUDGET (owner 2026-09-16: "Ok let's
  // fix that issue" / "Ok let's fix it, yeah") -----------------------------
  // The same defect appeared at TWO independent sites: the lifesteal heal
  // (main.js volley hit; docs/briefs/INVINCIBILITY_FINDINGS_2026-09-16.md)
  // and the GRAVE HARVEST evolution's 2-HP-per-kill sweep heal (weapons.js;
  // docs/briefs/OTHER_SURVIVAL_PATHS_FINDINGS_2026-09-16.md). Both are
  // THROUGHPUT heals — rate proportional to damage dealt or kills — so they
  // scale with the compounding damage shop (Forged Edge L5 = 243x) while
  // inbound damage IS bounded (HIT_CAP_FRAC 0.5 per hit + 0.6s i-frames
  // ~= 0.83 x maxHp/s max inbound). Measured: FE5+lifesteal 0.24 healed
  // 79.3 HP/s for 300s on a 287 pool (G32); post-G34, harvest stacked on the
  // capped lifesteal healed 7,985 HP over 300s at up to 89.6 kills/s (G35).
  //
  // The fix caps the RATE, never the FRACTION (stats still stack from every
  // source; reaching the cap faster is the reward). ONE shared per-run TOKEN
  // BUCKET (src/heal.js refillHealBudget/healFromBudget — the Consecration
  // altar's banked-and-capped precedent applied to every throughput healer):
  // refills at CAP_FRAC * maxHp per second (dt-driven, never wall clock),
  // never accumulates beyond one second's budget, and EVERY throughput heal
  // spends from it — heal = min(want, budget). A burst within a second still
  // lands in full; the SUSTAINED rate from ALL throughput sites COMBINED is
  // bounded. Potions (burst escape), regrowth (flat 0.7 HP/s) and the altar
  // (independently capped at DPS*TICK, see :236-237) deliberately do NOT route
  // through it; the full per-source table is in the G36 goal-doc entry.
  //
  // CAP_FRAC is DERIVED, not guessed: it must sit BELOW the inbound a heavy
  // swarm can deliver or death stays impossible. Max inbound ~= 0.83 x maxHp/s
  // (the burst ceiling); the G32 repro's SUSTAINED inbound was ~= 0.27 x
  // maxHp/s (78.8 HP/s on 287 max HP); the G35 harvest arm peaked at ~0.60 x
  // maxHp/s of heal (179 HP/s on 298). 0.25 sits below all of them — the
  // stacked arm now bleeds net negative at peak pressure (so it dies) and a
  // hard focus still kills through it. Unchanged from G34: sharing one budget
  // across sites can only be stricter than each site alone, and the harvest
  // arithmetic gives no reason to move it.
  HEAL_BUDGET: {
    CAP_FRAC: 0.25,   // max THROUGHPUT healing (lifesteal + harvest combined), fraction of max HP per second
  },

  // AutoPilot doctrine levers (general-vs-pilot controls; see controllers.js).
  AUTOPILOT: {
    // A1 ENGAGEMENT RADIUS (owner-reported 2026-09-14: "the pilot targets
    // enemies that are off the screen even ... have the pilot have a certain
    // distance that they can target enemies, and we can add a buyable to the
    // store that allows that distance to be increased").
    // THE base radius, ONE definition. The pilot's volleys only engage a
    // target INSIDE this radius of the player; beyond it pickTarget returns
    // null and main.js holds fire (the existing null-target seam). 100 is
    // OWNER-SET and deliberately tight — the 480x300 view's visible half-height
    // is 150, so the pilot never shoots at anything the player cannot see.
    // The 'focus' SHOP ROW (meta.js) raises it by that row's perLevel per
    // level, climbing from 100 toward and past the 280-322 spawn ring.
    // TWO readers, one number: controllers.js through engagementRange(p)
    // (per-player, off p.stats.focusRange) and AUTO_CAST.ELITE_RANGE below
    // through liveEngagementRange() (the config-side mirror meta.js stamps
    // with setEngagementRange at run start).
    FOCUS_RANGE: 100,
    SWARM_CLUSTER_R: 60,   // cluster-density radius for the SWARM doctrine
    // STANCE = the risk dial. WAVE-26 ("stance that bites"): each stance is a
    // REAL trade, not just a kite distance, and each carries a one-word TAG
    // that the canvas HUD prints next to the name so the dial is legible.
    //   KITE_MULT   flee distance multiplier (SAFE back-pedals, GREEDY hugs)
    //   XP_SPEED    calm drift speed toward the nearest gem
    //   LOOT_WEIGHT GREEDY only: how hard the flee vector bends toward loot
    //   PICKUP_MULT loot magnetism — the ONE consequence that bites in BOTH
    //               auto and manual pilot (manual owns movement by design, so
    //               without this the dial would be inert for manual players).
    //               GREEDY reaches loot from further; SAFE keeps its distance.
    STANCES: {
      SAFE:     { KITE_MULT: 2.0, XP_SPEED: 0.6, LOOT_WEIGHT: 0, PICKUP_MULT: 0.85,
                  TAG: 'KEEP CLEAR' },
      BALANCED: { KITE_MULT: 1.0, XP_SPEED: 1.0, LOOT_WEIGHT: 0, PICKUP_MULT: 1.0,
                  TAG: 'EVEN ODDS' },
      GREEDY:   { KITE_MULT: 0.5, XP_SPEED: 1.35, LOOT_WEIGHT: 0.65, PICKUP_MULT: 1.35,
                  TAG: 'LOOT FIRST' },
    },
    // BOSS_STANCE (playtest: "when a boss is incoming the stance should be
    // automatically set to safe/balanced somehow, because while the boss
    // animation is playing you cannot set the stance, and I get immediately
    // destroyed after the animation plays (on greed)"). The arrival banner owns
    // the screen for ~2.5s and the pilot keeps its doctrine underneath it, so a
    // GREEDY player walked into every boss hugging the horde with no chance to
    // change. When a wave boss (or the herald/maw) lands, the pilot EASES to
    // this stance and returns to the player's own pick the moment the wave's
    // cast is down. A deliberate mid-fight change by the player always wins.
    BOSS_STANCE: 'SAFE',
    // AUTO_DRINK (playtest: "maybe a way to auto use potions in autopilot?").
    // Potions were manual-only (main.js runAction 'h'/'n'), so an AUTO player
    // watched the pilot eat a lethal horde with a full inventory — the pilot
    // fights for you, so the consumables it would have spent must be spent for
    // you too. Scope is deliberately narrow:
    //   * AUTO ONLY. The manual pilot's potions stay 100% the player's call;
    //     nothing here can ever drink a MANUAL player's charge.
    //   * HP THRESHOLD (the potion's heal, not a config fraction) — drink a
    //     health potion once HP is STRICTLY BELOW what the potion would heal
    //     (C.POTIONS.HP_HEAL x the same healMult the drink applies: Alchemy +
    //     choice potionHealMult; owner 2026-09-17, msg_01M2RE1V: "If HP drops
    //     below what a potion would heal, it should be used. It feels unfair as
    //     the player" — clarified: "In auto mode that is"). At or above the
    //     line nothing is drunk: no wasted charge. RETIRED 2026-09-17: the old
    //     HP_FRACTION 0.35-of-max gate — at maxed stats 35% of a big pool sat
    //     far above any lethal dip, so the pilot NEVER drank and died rich;
    //     the heal-value line tracks the potion, not the pool.
    //   * MP_FRACTION — drink a mana potion only when mana is below this
    //     fraction AND a skill is actually BLOCKED ON MANA (off cooldown and
    //     short of its cost). Low mana with everything on cooldown is not a
    //     reason to spend a charge.
    //   * COOLDOWN — one auto-drink per kind per this many seconds. Without it
    //     a single deep dip chugs the whole stack in three frames (35 heal on a
    //     200 pool cannot climb back over the line in one gulp).
    // This block touches potions ONLY: it never reads or writes the stance, so
    // it cannot fight BOSS_STANCE or the pilot's kite/retreat logic — a potion
    // drunk during the arrival banner leaves the eased stance exactly as it was.
    AUTO_DRINK: {
      ENABLED: true,
      // HP gate lives in main.js autoDrinkPotions: strictly below the potion's
      // heal value (C.POTIONS.HP_HEAL x healMult). No HP_FRACTION knob since
      // the 2026-09-17 potion tune — a fraction of max is the wrong line.
      MP_FRACTION: 0.30,   // strictly below this share of max mana (+ a starved skill)
      COOLDOWN: 1.5,       // seconds between auto-drinks of the same kind
    },
    // AUTO_CAST (N1b item 8: "the AUTO pilot must be able to SPEND mana, or
    // the whole scheme reads as a tax"). useSkill was reachable ONLY from the
    // player's Q/E, so an AUTO run paid mana's costs (ZAP, Chain Reaction) and
    // collected none of its benefits. The pilot now casts — through useSkill
    // itself, never around it — under a deliberately narrow contract:
    //   * AUTO ONLY. A MANUAL player keeps 100% of the cast decision: nothing
    //     here can spend a MANUAL player's mana.
    //   * a cast must LAND. FROST_NOVA only with a live enemy inside its own
    //     RADIUS of the player (it is an AoE around the player, so an empty
    //     field is a wasted 30). OVERCHARGE only when a boss/elite is present
    //     (the BOSS_STANCE awareness — no second "is a boss here") or when the
    //     pool is at/above NEAR_FULL, so income spills into damage instead of
    //     overflowing the cap.
    //   * ELITE_RANGE — how close a live elite must be to count as "present"
    //     for OVERCHARGE. Mirrors FOCUS_RANGE (the doctrine's own engagement
    //     radius): an elite on the far side of the arena is not a reason to
    //     burn the buff yet.
    //   * never a wasted call: the pilot checks the skill's cooldown and cost
    //     first, so useSkill is only ever called when it will say yes.
    //   * never a new withhold: casting is synchronous in the frame and reads
    //     the same pool the manual buttons act on; it cannot block, delay or
    //     starve a weapon (weapons tick on their own cooldowns, and ZAP's hard
    //     gate holds at cd 0 if a cast just drained the pool — no bolt lost
    //     beyond the dry window itself).
    AUTO_CAST: {
      ENABLED: true,
      NEAR_FULL: 0.8,      // pool at/above this share of max: spill, don't waste
      // DERIVED, not a second hardcoded radius (A1, 2026-09-14). It used to be
      // its own literal 260 while the comment above claimed it "mirrors
      // FOCUS_RANGE" — nothing made it so, and once the radius became
      // upgradable a second literal would have left boss/elite detection
      // stranded at the old value. It now reads the SAME ONE engagement radius
      // the pilot targets with (liveEngagementRange()), so a bought 'focus'
      // upgrade moves both the volleys AND this gate.
      get ELITE_RANGE() { return liveEngagementRange(); },
    },
    // DRAFT_TIMEOUT (owner 2026-09-16, verbatim: "Can we add so on auto, the
    // card selection screen has a 6 second timeout and then it auto picks a
    // random card."). The draft is the one screen that still parks an AUTO
    // run on a modal waiting for a human; in AUTO the run now continues
    // hands-free: after this many seconds of VISIBLE, unobstructed draft the
    // pilot takes a card uniformly at random through the same activation
    // seam a tap takes. AUTO ONLY — a MANUAL player sees no countdown and
    // never gets an auto-pick. The countdown is frame-driven (not
    // setTimeout), suspends while the draft coachmark or any modal is up,
    // and resumes where it left off: the player is owed the full window of
    // unobstructed draft.
    DRAFT_TIMEOUT: 6.0,
    // NIGHT MODE (owner 2026-09-17, the authorized exception to the feature
    // freeze): the two NAMED auto-advance delays. The intermission CONTINUE
    // auto-fires NIGHT_CONTINUE_S after the intermission screen opens; a
    // finished night run auto-restarts (same build, same arena)
    // NIGHT_RESTART_S after the end card settles. Wall-clock seconds ticked
    // on the frame loop beside the draft timer — frame-rate independent by
    // construction, and they stop on their own when the tab hides.
    NIGHT_CONTINUE_S: 3.0,
    NIGHT_RESTART_S: 3.0,
    // NIGHT EVOLVE (gap found 2026-09-18): the EVOLUTION overlay is a
    // human-click-only screen (EVOLVE cards / NOT NOW) — an unattended run
    // that earns a token over a maxed weapon parked there FOREVER, the exact
    // wedge class the watchdog exists to close. Same shape as the siblings:
    // NIGHT_EVOLVE_S after the overlay opens, the night takes the FIRST
    // candidate (deterministic — the draft policy's own first-slot rule).
    NIGHT_EVOLVE_S: 3.0,
    // NIGHT STALL WATCHDOG (defect follow-up 2026-09-17: "still sitting on the
    // end of run summary"). The named timers above are the FRONT line; this is
    // the backstop that makes "a night run never parks" a guarantee instead of
    // a wiring hope. If a night run holds any single waiting mode of the run
    // ladder (dead / intermission / escape / draft / evolve / portal-cine /
    // death-cine) for longer than NIGHT_STALL_S, the watchdog advances it
    // through that mode's OWN sanctioned action — the same call the named
    // timer makes. It can never race the named timers (30s >> 3s/3s/6s) and
    // never touches the live modes (playing/finale) or the human surfaces
    // (title/intro, settings/stats while a person is reading them).
    NIGHT_STALL_S: 30.0,
  },

  // WAVE-26 EARNED TIME DILATION (main.js advanceDilation/triggerDilation):
  // the simulation honours a state-level time scale for the two genuinely
  // earned moments ONLY — a weapon EVOLUTION and a BOSS KILL. Values are
  // wall-clock seconds, so the window is frame-rate independent; the scale is
  // taken as a MIN and the window as a MAX (never multiplied) so two triggers
  // in one frame cannot stack into a freeze.
  DILATION: {
    EVOLUTION: { SCALE: 0.45, DURATION: 0.5 },
    BOSS:      { SCALE: 0.35, DURATION: 0.6 },
    FLOOR: 0.05,          // hard clamp: never slower than this
  },

  // Weapon-slot economy: the base volley occupies slot 1. Players START at 3
  // slots and buy 4/5/6 in the shop (meta.js startWeaponSlots); this value is
  // the absolute cap (= meta.js MAX_WEAPON_SLOTS). The per-run cap lives in
  // state.weaponSlots, set by startRun.
  WEAPON_SLOTS: 6,

  // G21 slice 1: the rule-REWRITE family's finite build slots (rewrites.js).
  // A run holding REWRITE_SLOTS rewrites is offered NO rewrite cards — with 8
  // cards in the family, every pick excludes at least 4 others, so the slot
  // pressure is structural, not cosmetic. Empty slots PAY through
  // emptySlotCooldownMult (-5% skill/ult cooldown each, floored at x0.80).
  REWRITE_SLOTS: 4,

  // Wave-6 loot (loot.js): rare equippables drop from kills. Bosses always
  // drop one (rolled up-tier), elites often, normals rarely.
  ITEMS: {
    DROP_CHANCE: 0.02,    // per normal kill
    ELITE_CHANCE: 0.5,    // per elite kill (also rolled up-tier 0.75)
    BOSS_TIER_BIAS: 1.5,  // loot.js tierBias pushes boss rolls toward EPIC+
  },

  // Wave-6 portal progression: boss death opens a flame-ring portal; walking
  // in ends the wave (intermission -> next wave). P1 (owner directive
  // 2026-09-14): the portal LINGERS — a one-way drift at APPROACH px/s that
  // parks on a STANDOFF ring (1.5x RADIUS = 24px) and never advances closer
  // on its own; entry is the player's/pilot's deliberate act, which is what
  // the toast always promised. The old player-speed + SPEED chase is DELETED
  // (its only job was guaranteeing AUTO entry — the AutoPilot now paths to
  // the portal itself, src/controllers.js). DWELL is the visible beat on
  // contact before the intermission/cinematic (dt-based, 60/120Hz-safe).
  // INVULN is the bounded AUTO-only approach window: main.js refreshes
  // p.invuln to it while the portal is open AND the pilot is steering
  // (AUTO_ALL and AUTO_MOVE; MANUAL gets nothing, ever).
  PORTAL: { RADIUS: 16, APPROACH: 40, STANDOFF: 24, DWELL: 0.4, INVULN: 0.1 },

  // ---- FIRST-RUN PROLOGUE (owner 2026-09-18) ------------------------------
  // Run #1 of a fresh profile (derived from achievements.totals.runs === 0
  // at startRun — NO new saved field) opens INERT: no enemy spawns, the run
  // clock has not started, and a tinted potion sits on screen. The pilot
  // WALKS to it and drinks it (manual or AUTO — the auto pilot's first act
  // is that walk). INVULN_S is the named 45s shield granted at the drink;
  // the clear (on-screen enemies die with normal drops, BEFORE the shield
  // ends — it fires at the drink itself) reaches CLEAR_MARGIN world units
  // past the view edge, not the whole arena. MAX_S bounds the phase — a
  // player who never walks, or leaves banners open, still starts the run:
  // exit is drunk OR t >= MAX_S, whichever comes first. POTION_DX/DY park the
  // potion this many world units up-RIGHT of the spawn, clamped on-screen at
  // every viewport (the view is always VIEW_W x VIEW_H world units). The
  // offset must CLEAR THE BANNER CARD's band (the card plate spans view
  // x 90..390, y 24..116): a straight-up potion lands at (240,50), directly
  // behind card #1, INVISIBLE behind the plate — found in the 320x568
  // verification shot. The side placement puts run #1's potion at ~(355,130),
  // past the card's lower edge and still a real (>40wu) walk.
  PROLOGUE: {
    // KILL SWITCH (owner 2026-09-18: "The how to play is broken..if this was
    // pushed to GitHub, we need to revert immediately, if possible without
    // breaking things"). OFF = run #1 opens exactly as it did before the
    // prologue existed (no phase, no banners, no potion — the derived
    // totals.runs === 0 trigger never fires). GATE-VERSUS-REPLAY (REPLAY TOUR
    // brief, 2026-09-18): the switch parks ONLY the AUTOMATIC arm — a
    // DELIBERATE opt-in (the what's-new accept button, the manual's REPLAY
    // TOUR card) bypasses it through the assistedRun path, so the special
    // level stays reachable for anyone who asks while the automatic path
    // stays off. RE-ENABLED 2026-09-18: the three owner defects are fixed behind
    // it and tools/verify_prologue.mjs is green at both phone sizes (empty
    // storage, no seeded run count — the owner's own cleared-data test):
    //   a. a REAL, always-visible opt-out control (the armed two-tap SKIP);
    //   b. lesson/mode coherence (never teach steering while AUTO drives);
    //   c. each step waits for the player to DO the thing, not to press OK.
    ENABLED: true,
    INVULN_S: 45,
    // OWNER 2026-09-18 (priority): "we have to make the timer on the tutorial like
    // 5 minutes, not whatever it is now. Someone complained they weren't able to
    // get through it without being kicked out." 60 -> 300. NOTE the bound only
    // freezes while a banner is up (see endPrologue's comment), so the walk, the
    // draft and the potion approach all spend it - a reader needed real room.
    MAX_S: 300,
    CLEAR_MARGIN: 120,
    POTION_DX: 115,
    POTION_DY: -20,
    // ADDENDUM (owner 2026-09-18: the pilot PAUSES for banners — "we haven't
    // given the player any control yet"): the choreography is WALK -> banner ->
    // OK -> WALK -> ... -> potion -> drink -> effect. Each banner goes up only
    // after this much UNPAUSED walking since the last OK, so there is a real
    // walk between banners. Arithmetic: the spawn->potion walk is
    // ~hypot(115,20)=117wu at SPEED 60 = ~1.95s, and 4 banners x 0.35s =
    // 1.4s < 1.95s — all four banners (incl. "the potion ahead is free") show
    // BEFORE the drink, with ~0.55s of approach walk left after the last OK.
    BANNER_WALK_S: 0.35,
    // TWO-TAP SKIP (owner 2026-09-18: "it was a bit too easy to skip without
    // meaning to"): the opt-out must be DELIBERATE. The first press on the
    // corner SKIP (or Escape) ARMS it for this many seconds — the button's
    // label flips to TAP AGAIN — and only a second press inside the window
    // actually skips. A stray steering tap on the corner can never skip by
    // itself (one tap = arm only, and the arm expires harmlessly).
    SKIP_CONFIRM_S: 2,
  },

  // ---- RUN-COUNT MILESTONE CHESTS (owner 2026-09-17) -----------------------
  // A milestone chest (meta.js RUN_CHESTS: runs 50/100/200/500) spawns at
  // startRun near the spawn, up-LEFT — the MIRRORED side of the prologue
  // potion's up-RIGHT slot, so the two can never collide even on the one run
  // where both exist (an opted-in veteran guided run that crosses a
  // milestone). Same clamp discipline as the potion: the offset is applied to
  // the spawn and clamped on-screen, and the chest NEVER despawns (no ttl) —
  // a player who ends the run without collecting it finds it again next
  // startRun (claim-at-collection; profile.milestoneChest moves only when the
  // pilot touches the chest).
  RUN_CHEST: {
    DX: -115,
    DY: -20,
    // The "big and cool" addendum's drawn-art motion, both integer-pixel:
    // BOB is the idle field bounce (a 2px hop on the sim clock, static under
    // reduced motion); BURST is the collection payoff — a ~0.9s coin/spark
    // shower on the WALL clock that plays out on the frozen field (mode
    // 'burst') BEFORE the card opens, so the payoff reads burst-then-card.
    BOB_HZ: 2.5,
    BOB_PX: 2,
    BURST_TTL: 0.9,
    BURST_SPARKS: 12,
  },


  // ---- M3 GROUND-ITEM OVERFLOW CAPS (audit 2026-09-16) ---------------------
  // state.gems / state.drops / state.itemDrops were unbounded arrays with
  // three O(n) pickup scans per frame. The caps bound the scans; the
  // VALUE-PRESERVING merge (entities.js pushGroundCapped) means nothing is
  // lost: at cap, the nearest same-kind ground item absorbs the newcomer's
  // value (gems sum xp; potions merge into a count the pickup path pays out
  // in full, respecting the run's potion cap with the remainder left on the
  // ground). GEM_CAP 600 sits well above a dense wave's natural pile
  // (~100-300) so ordinary play never merges; DROP_CAP 48 above any sane
  // uncollected potion litter. ITEM_CAP 30 is the DISCLOSED FALLBACK: rare
  // equippables are unique — merging two would destroy one — so the OLDEST
  // ignored drop gives way when the belt is full (main.js pushItemDrop).
  // No magnetism, no auto-collect: reachability is unchanged.
  GROUND_ITEMS: {
    GEM_CAP: 600,
    DROP_CAP: 48,
    ITEM_CAP: 30,
  },

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
    // ARENA SCALE-UP (2026-09-17, owner directive msg_01M2R90M): the extent is
    // UNITS-BASED. One unit = 600 world px per axis (a quarter of the shipped
    // 2x2 arena on each axis); UNITS 3 -> a 1800x1800 field, RIM 900. RIM is a
    // GETTER over the unit count (the THREATS.GRAB_* getter precedent) so
    // every reader — the player clamp, the wall render, the loot limit, the
    // camera, the atlas — follows the ONE knob; no reader re-derivations.
    // Decor/landmarks still never paint past it (WAVE-24 rule, now automatic).
    UNIT: 600,
    UNITS: 3,
    _rimOverride: null,   // the test seam: a written RIM wins until restored
    get RIM() { return this._rimOverride != null ? this._rimOverride
      : (this.UNIT * this.UNITS) / 2; },
    set RIM(v) { this._rimOverride = v; },
    WALL: 12,          // drawn wall-band thickness in world px (RIM..RIM+WALL,
                       // render.js drawArenaWall). ONE definition: the loot
                       // clamp (entities.clampLootToArena) subtracts this band
                       // plus the pickup radius so a drop can never land on the
                       // wall's inner face, and the pilot's edge hold
                       // (controllers.js) subtracts the same amount.
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

  // ---- ELEVATED PATHS (arena scale-up 2026-09-17) -----------------------------
  // The arena's RELIEF: a deterministic per-run height field (src/relief.js,
  // the ground-decor hash pattern — no stored arrays, same seed -> same field)
  // quantized to integer LEVELS whose grain and height are the STAGE's
  // character (stages.js `relief`). The anti-sanctuary contract, by
  // construction:
  //   * the GRADE term (uphill slower / downhill faster) applies to the PLAYER
  //     and to every ENEMY at the same movement seams, read from the same
  //     pure function — high ground slows an attacker's climb exactly as much
  //     as it would slow the pilot's, and nothing blocks enemy motion, so the
  //     Megabonk stuck-on-ledges / camp-the-deck safe-spot bug is structurally
  //     absent;
  //   * standing on HIGH ground is a TRADE, not a haven: the radar's world
  //     reach widens (VISION_MULT — the reward) while the horde's spawn
  //     AZIMUTH biases toward the uphill side (EXPOSURE_BIAS — the risk), so
  //     the pressure arrives over the ridge with you. Spawn COUNT, cadence
  //     and ring distance are untouched (the pacing invariants hold).
  RELIEF: {
    HIGH_LEVEL: 2,      // standing at >= this level is "high ground"
    GRADE_LOOK: 60,     // px lookahead the grade reads along the move direction
    GRADE_COST: 0.12,   // speed cost per level of climb over that lookahead
    GRADE_CAP: 0.36,    // |grade effect| bound, up or down (3 levels max)
    VISION_MULT: 1.5,   // radar world radius multiplier on high ground
    EXPOSURE_BIAS: 0.35,// elevated pilot: spawn azimuth mixed toward uphill
    RENDER_CELL: 60,    // relief render quantization (the contour cell)
    // ELEVATION v2 (2026-09-18, owner: "a gradient upward/downward that would
    // create a separate path blocked off by a cliff"). The model's two
    // primitives, ONE threshold: a height discontinuity below CLIFF_STEP is a
    // GRADE (a walkable slope — the grade term above rides it); at or above it
    // is a CLIFF and blocks the mover. 2 because (a) the natural lattice is
    // Lipschitz — it can never step 2 levels in one mover move, so cliffs
    // exist ONLY where a stage authors a face and the no-trap proof stays
    // local to authored geometry; (b) with 3 levels a 2-break is a full
    // floor-to-top face, mechanically and visually unambiguous; (c) a
    // threshold of 1 would cliff every natural terrace edge and wall the map.
    CLIFF_STEP: 2,      // |level after - level before| >= this blocks the move
  },

  // ---- M1 THE PER-RUN ATLAS (src/atlas.js) ------------------------------------
  // The visited-grid + landmark-discovery constants. C3: they live HERE and
  // nowhere else — atlas.js stays pure maths and takes them as arguments,
  // main.js's call sites pass them. MAP_CELL 40 over the +-600 arena divides
  // EXACTLY (1200/40 = 30 -> a 30x30 = 900-cell grid; that is why 40).
  ATLAS: {
    MAP_CELL: 40,        // world px per visited cell
    VISIT_RADIUS: 300,   // a cell is marked when the player comes within this
                         // of its centre — >= the 480x300 view's half-diagonal
                         // (~283), so the grid records what was SEEN
    DISCOVER_RADIUS: 120,// a landmark flips to discovered inside this range
                         // (about a quarter view — you plainly reached it)
  },

  // ---- CAMERA (main.js updateCamera) ----------------------------------------
  // A DEADZONE follow, not a free camera. The player roams free inside a box
  // around the view centre; the view only follows once they leave it, leads
  // slightly in the direction of travel so movement has weight, and is clamped
  // so the player can never leave the SAFE region of the screen. Near a wall
  // the view stops and the player moves within it — that is the "disconnected
  // from centre" feel. Sizes are SCREEN px at EVERY zoom: updateCamera divides
  // them by the integer zoom factor (state.zoomScale) so the feel is identical
  // at 1x and 8x (the zoomed world is just more magnified inside the same safe
  // screen region), and the world->screen projection (worldRegion / the tour
  // coachmark / render.js's world layer) all read the same state.cam.
  CAMERA: {
    DEADZONE_W: 64,   // half-width of the free box around view centre (screen px)
    DEADZONE_H: 44,   // half-height of the free box
    LEAD: 14,         // lead in the direction of travel (screen px)
    SAFE: 40,         // guaranteed gap from the screen edge at full excursion
                      // (screen px) — the camera clamp reserves SAFE + LEAD
    SMOOTH: 5,        // rate (1/s) at which the LEAD eases in/out of travel.
                      // The follow itself is positional (the box is the feel),
                      // so this is the only smoothed term.
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
    CLOCK_PX: 11,         // RUN CLOCK (RUN-STRUCTURE/SURVIVAL-GAP wave): the
                          // always-on canvas readout of the 30:00 limit. Same
                          // size/weight as the LV badge so the two top-left
                          // readouts read as one family.
    BANNER_TITLE_PX: 22,  // boss-arrival TITLE legacy base (was 20). The
                          // two-line banner no longer paints at a fixed size —
                          // each line is fitted from measureText (see below);
                          // this stays as the record of the old single-line
                          // size and the reference for "was it huge enough".
    BANNER_SUB_PX: 11,    // boss-arrival sub-line (was 10)
    // ---- TWO-LINE BOSS BANNER (owner-approved) ----------------------------
    // Line 1..N = the boss NAME(S), one boss per line: the largest type on
    // screen for the arrival beat. Then the title line ('APPROACH' /
    // 'APPROACHES') underneath — big, but strictly smaller than the names.
    // Every line is sized from the REAL measureText of the exact font string
    // it is painted in, so a two-boss cast can no longer overrun the 480px
    // view. A shared names-line is NOT used: fitting wave 3's cast onto one
    // line forces ~18px, which is not "huge" — one name per line keeps 33px.
    BANNER_NAME_MAX_PX: 38,   // ceiling — one short name must still read HUGE
    BANNER_NAME_MIN_PX: 15,   // floor — a long name never shrinks to nothing
    BANNER_VERB_RATIO: 0.62,  // title line = this fraction of the fitted name px
    BANNER_VERB_MIN_PX: 13,
    BANNER_VERB_MAX_PX: 24,
    BANNER_PLATE_PAD_X: 14,   // plate inset left/right of the widest line
    BANNER_PLATE_PAD_Y: 9,    // plate inset top/bottom
    BANNER_LINE_GAP: 3,       // px of air between stacked lines
    BANNER_EDGE_MARGIN: 14,   // px the plate keeps off the view edge (never
                              // edge-to-edge) — the text box is inset from it
                              // by BANNER_PLATE_PAD_X again
    // ---- HORDE WARNING (player review 2026-09-17 addendum: the centre -----
    // banner "is really hard to see through" on the dodge path; owner: keep
    // the warning, ZERO warning pixels inside the play area). PRESENTATION
    // ONLY — spawn timing, horde size and difficulty are untouched. The
    // live-comput warning renders as: an urgent HUD-band strip (top), a
    // pulsing edge cue on the side the horde enters from, and the existing
    // BOSS_YELL audio sting. The cinematic centre plate survives ONLY on
    // HELD banners (token / top-tier: the sim is paused, nothing is dodged).
    WARNING: {
      TTL_MAX: 1.5,      // s — the warning's whole life, capped so it can
                         // never sit over the dodge (measured worst case:
                         // the pre-fix banner lived 2.5s against a 1.8s
                         // first contact)
      TTL_MIN: 0.4,      // s — floor: shorter than this cannot be read
      CLEAR_MARGIN: 0.5, // s — the warning ends at least this long before the
                         // FASTEST spawn's estimated contact with a
                         // stationary player (moving toward it is sooner, so
                         // this is the generous bound)
      PULSE_S: 0.5,      // edge-cue pulse period (2 Hz — the "how soon" rate)
      EDGE_PX: 7,        // edge band thickness (screen edges are not play area)
      STRIP_Y: 3,        // HUD-band strip top (inside the top HUD band)
      STRIP_H: 14,       // HUD-band strip height
      STRIP_SIDE: 130,   // strip keeps this far from each side edge — clear
                         // of the left bar column and the right clock column
      STRIP_PX_MAX: 11,  // strip text size ceiling (feed-family type)
      STRIP_PX_MIN: 7,   // floor; below this the names truncate instead
    },
    FRAME: '#6a6a7c',     // outer steel frame around every bar/plate
    TROUGH: '#2e2e38',    // dark empty track (a 0% bar must read EMPTY)
    PLATE: 'rgba(4,4,10,0.72)',   // dark plate behind label text
    PLATE_SOLID: 'rgba(6,6,12,0.80)',
    TICK: 'rgba(255,255,255,0.12)',        // minor ticks (full track)
    TICK_MAJOR: 'rgba(255,255,255,0.22)',  // 25/50/75% ticks
    HP: '#ff9aa6', MP: '#9ec2ff', XP: '#ffe07a',   // label tints (bright)
    // WAVE-27: the canvas FOCUS/STANCE readout is gone (the overlay buttons'
    // badges and the cycle toast carry the doctrine). STANCE_COLORS survives
    // because it tints the stance CYCLE toast (main.js cycleStanceWithFeedback)
    // and the GREEDY HAUL payoff toast — risk-colored: green = safe, gold =
    // balanced, orange = greedy.
    STANCE_COLORS: { SAFE: '#68e080', BALANCED: '#ffd75e', GREEDY: '#ff8848' },
  },

  // ---- FULLSCREEN — the transient canvas toggle (owner 2026-09-17) --------
  // An on-canvas button (NOT a settings card): appears on interaction, hides
  // HIDE_S after the LAST interaction, re-shows on the next one. Painted in
  // the play-HUD pass (render.js drawFsButton) mid-right of the view — the
  // one column with no HUD chrome (bars/XP/feed top-left, clock/weather
  // top-right, weapon/item rows bottom-left, radar bottom-right) and clear
  // of the DOM pads at every phone size (geometry asserted in
  // test_fullscreen_button.mjs). Where the Fullscreen API is missing
  // (iPhone iOS Safari) the button is absent entirely — a dead control is
  // worse than no control. HIDE_S is the owner's number verbatim (was "0.5s",
  // retuned 2026-09-18: "the full screen/overlay controls disappear too
  // fast... make it 1.3 seconds"); feel is REPORTED, never tuned
  // unilaterally. This ONE window is shared by BOTH transient surfaces — the
  // painted fullscreen button AND the transient top-chrome strip (the
  // canvas-ladder work) — there is no second duration constant anywhere.
  FULLSCREEN: {
    HIDE_S: 1.3,     // seconds the transient surfaces outlive the last interaction
    W: 22,           // button box (the PAINTED icon), view px
    H: 18,
    INSET: 8,        // kept this far off the view's right edge
    // HIT AREA (owner 2026-09-17, msg_01M2S9GX95: "you could make the hit area
    // or clickable area larger... keep the visual size of the icon the same"):
    // a separate hit box CENTRED on the icon and clamped inside the view.
    // 64x56 view px ~= 52x45 CSS px at the common phone letterbox (390-wide
    // portrait -> scale 0.81) — above the 44px touch floor at every acceptance
    // size while the icon itself stays 22x18.
    HIT_W: 64,       // hit box, view px (>= the icon, never smaller)
    HIT_H: 56,
    // EDGE_GUARD (2026-09-18, found by the verifier's REAL edge taps): the
    // canvas's right edge abuts the right pad with only a ~6 CSS px seam at
    // landscape letterboxes, and Chromium's touch hit-testing snaps a tap to
    // the pad button from ~10 CSS px away — a right flank reaching the view
    // edge was the PAD'S territory, not ours. The hit box keeps this many
    // view px off the view's right edge, inside the canvas, clear of the
    // seam. The enlargement that pays is the LEFT flank (32 view px of new
    // target vs 8 right); the icon stays fully covered.
    EDGE_GUARD: 8,
  },

  // ---- TOP-CHROME TRANSIENCE — the canvas ladder (owner 2026-09-17,
  // msgs 78PTR + 7BRBS + 9MV7F): "max canvas size in any setting... First
  // thing to sacrifice could be the top buttons. They could become overlays
  // like the full screen button" / "transience must pay for itself". The top
  // strip (cog row + text HUD) goes TRANSIENT — same show-on-interaction
  // window as the fullscreen button, one system — ONLY when MEASURING both
  // canvas rects says the strip is the bottleneck. Portrait measures ~0 gain
  // (the canvas is width-bound there) and persists automatically; there is no
  // orientation check or device list anywhere, only the measured delta.
  TOP_CHROME: {
    GAIN_ENGAGE: 0.03,   // engage only if the canvas grows >= 3% of vh in height
    GAIN_RELEASE: 0.015, // hysteresis: relax only when the gain falls below 1.5%
  },

  // LADDER STEP 2 — COMPACT PADS (owner 2026-09-17: "having the buttons
  // resize themselves if needed to help that"). Below the sizes where even a
  // transient top strip leaves a fitting canvas, the pad stacks themselves
  // compact (narrower pads, shorter buttons, abbreviated pilot-rung badges
  // A1/A2/M — the owner's own examples) so the SIDE bands give the canvas
  // width back. Applied ONLY where it pays: it engages when the ordinary fit
  // has fallen back AND the compact fit holds; it relaxes the moment the
  // ordinary fit holds again.
  PADS_COMPACT: {
    WIDTH: 64,       // pad width, CSS px (96 -> 64)
    BTN_H: 52,       // button height, CSS px (64 -> 52)
    HIT_MIN: 44,     // the touch floor nothing in compact mode may cross
  },

  // FLOATING (DYNAMIC) JOYSTICK (owner 2026-09-18): on touch paths a canvas
  // press in MANUAL play arms the stick AT the touch point — the origin ring
  // + knob are painted there (DOM, pointer-inert) and the drag vector feeds
  // the SAME analog pilotInput (controllers.js PlayerController, dead zone
  // JOY_DEAD_ZONE 0.15, magnitude = deflection fraction). FLOAT is the one
  // line that restores the fixed bottom-center base on touch too (desktop
  // keeps the fixed base for mouse-drag either way).
  JOY: {
    FLOAT: true,     // floating stick replaces the fixed base on touch paths
    FLOAT_R: 60,     // base radius, CSS px (ring is 2R across)
    FLOAT_KNOB: 40,  // knob box, CSS px
  },

  // FIT-TO-VIEWPORT UI SCALE (owner 2026-09-18, msg_01M2S72CF4902CWRWE7VJ3Y22M:
  // "The whole interface should be able to shrink itself to fit a little better"
  // on a host page whose header eats vertical space). When the viewport the game
  // actually GOT cannot hold the interface's fixed-px chrome (the 4-button pad
  // stack, the cog row), the WHOLE interface — canvas, pads, HUD, overlays —
  // scales as ONE unit (a uniform transform on #wrap) by the live-measured
  // overhang, never below SCALE_FLOOR: below the floor text stops being legible
  // (the player review's readability complaint), so the layout DEGRADES instead
  // (residual clip reported by the verifier) rather than shrinking further.
  // The user's own ZOOM/RESOLUTION setting is untouched — auto-fit only
  // prevents clipping, it never overrides a deliberate zoom. FIT_SCALE is the
  // one line that turns the whole mechanism off.
  UI_FIT: {
    FIT_SCALE: true,
    SCALE_FLOOR: 0.75,   // text legibility floor; below it the clip is reported, not shrunk away
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

  // ---- E2: THE WAVE-2 HORDE (docs/briefs/E2_HORDE.md) ----------------------
  // Owner directive: wave 2 becomes a HORDE — the chaff swarm triples and a
  // HEAVY tier (BRUTE/DASHER/TICK + the flying SHRIKE) lands with mid-boss
  // bodies. Everything here gates on state.wave.num >= WAVE (the 120s wave
  // number, NOT the 30s escalation tick); below it every formula reads
  // byte-identical to before. The knobs ride pickSpawnType/spawnWave in
  // main.js (stages.js is outside this slice's scope).
  E2: {
    WAVE: 2,               // the 120s wave the horde lands on
    HEAVY_WEIGHT_MULT: 0.5,  // R3: heavy pool weights thin out vs chaff
    CHAFF_DENSITY_MULT: 3,   // R5: ONE knob — chaff pack pop x3
    CHAFF_DROP_MULT: 0.05,   // R6: plain-chaff potion/chest/token rolls x0.05
    CHAFF_XP_MULT: 0.25,     // R6: plain-chaff xp at spawn (heavies pay instead)
    HEAVY_XP_KILLS: 3,       // R8: a heavy corpse pays ~this many base kills
    SHRIKE_WEIGHT: 0.8,      // R9: the flying heavy's pool weight (debut wave)
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

  // ========================================================================
  // RUN STRUCTURE (RUN-STRUCTURE wave) — the run is a BOUNDED 30:00 ladder
  // ========================================================================
  // Shipped run: 5 waves, then an UNBEATABLE finale. Every run therefore ended
  // in death, and the only shape the game could express was "die in ~3.5 min".
  // The genre leaders do not work that way — they complete a run at a TIME
  // LIMIT and pay a discrete win for reaching it (Vampire Survivors: 30:00
  // "stage complete" + gold; Megabonk: 10:00 per stage, tiers chained). G18
  // makes run length a PROGRESSION AXIS: the limit is 30:00, a fresh build
  // still dies in minutes, and surviving is what the build earns.
  //
  // WHAT IS BOUNDED, AND WHY: reaching RUN.LIMIT ends the run in victory. There
  // is no post-limit continuation — an unbounded run has no ladder to climb and
  // no win to pay, and "keep playing forever" is the failure state this wave
  // exists to remove. (VS resolves the same question the other way: a Reaper
  // spawns at the limit and ends you. We chose the discrete win because the
  // browser session should have a completion.)
  RUN: {
    LIMIT: 1800,           // 30:00 of PLAY time (state.time, sim seconds)
    FINAL_CALL_AT: 1740,   // 29:00 — the "one minute left" callout
    SURVIVED_BONUS: 1500,  // flat payout for reaching the limit (VS shape)
    DEPTH_BONUS: 150,      // + per wave reached BEYOND the maw milestone
    MAW_HP: 2_500_000,     // the maw is a REAL fight now (== final_boss DISPLAY_HP)
    MAW_WINDOW: 90,        // seconds the maw encounter lasts before it withdraws
    MAW_CLEAR_BONUS: 1200, // payout for slaying the maw (on top of the run's gold)
    MAW_UNLOCK: 'HYPER',   // difficulty tier the milestone unlocks (profile.milestones)
  },

  // ---- THE WAVE LADDER ---------------------------------------------------
  // `w` is the ESCALATION tick, floor(t / 30) — 60 ticks across a full run.
  // Ticks 0..KNEE_TICK (0:00-4:00) reproduce the shipped curves EXACTLY, so the
  // early deaths the whole game is tuned around cannot move. Past the knee each
  // curve is re-based onto a bounded compound: the shipped compound (1.35/tick
  // hp, 1.15/tick dmg) reaches ~1e9x by 30:00 — that is not a ladder, it is a
  // wall, and the wall is the bug this wave fixes. See ladderHp/ladderDmg/
  // ladderXp/ladderGroups/ladderEliteChance/ladderBeats below for the shape.
  LADDER: {
    WAVE_SECONDS: 120,   // == ESCALATION.WAVE_LENGTH (the tests assert this)
    WAVES: 15,           // 15 x 120s = 1800s = RUN.LIMIT
    KNEE_TICK: 8,        // 4:00 — the shipped curve holds through here
    HP_LATE: 1.055,      // x/tick after the knee -> 440.8x base at 30:00
    DMG_LATE: 1.010,     // x/tick after the knee -> 9.32x base at 30:00
    XP_LATE: 1.030,      // x/tick after the knee -> 65.9x base at 30:00
    GROUPS_KNEE: 240,    // density matches the shipped formula through 4:00
    GROUPS_BASE: 5,      // shipped groups at GROUPS_KNEE (ceil((1+9)/2))
    GROUPS_PER: 180,     // +1 spawn group every N seconds after the knee
    GROUPS_MAX: 14,      // absolute ceiling (measured: 13 at 30:00, vs 37 shipped)
    ELITE_FROM: 600,     // 10:00 — the elite surge begins
    ELITE_MAX: 0.12,     // ceiling on per-spawn elite chance (base 0.05)
    SURGE_EVERY: 3,      // every Nth wave past the milestone is an ELITE SURGE
  },
};

// ============================================================================
// A1 — THE ENGAGEMENT RADIUS (ONE definition, two readers)
// ============================================================================
// `AUTOPILOT.FOCUS_RANGE` is the BASE (owner-set 100). The 'focus' shop row
// (meta.js, SHOP_BY_ID.focus.perLevel) adds perLevel per purchased level, and
// meta.js's applyMetaBonuses is the ONE place that computes the sum — it stamps
// the result on the run's stats (`focusRange`) AND publishes it here through
// setEngagementRange, because the config-side reader (AUTO_CAST.ELITE_RANGE) has
// no player to read from. The pilot reads the per-player value off
// p.stats.focusRange (controllers.js engagementRange), so both readers resolve
// to the same number by construction, and a bought upgrade reaches both.
//
// It is deliberately LAST-KNOWN rather than per-run state: at boot (before any
// profile is applied) it falls back to the base, which is exactly what a
// stats-less probe should see.
let liveRange = null;

/** Record the engagement radius a just-applied profile runs with (meta.js). */
export function setEngagementRange(px) {
  liveRange = (typeof px === 'number' && Number.isFinite(px) && px > 0) ? px : null;
}

/** The radius the CONFIG-side readers see: the live value, else the base. */
export function liveEngagementRange() {
  return liveRange === null ? CONFIG.AUTOPILOT.FOCUS_RANGE : liveRange;
}

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

// ============================================================================
// W7b — THE DRAFT RARITY LADDER (docs/briefs/W7B_DRAFT_DIVERGENCE.md)
// ============================================================================
// The draft is a rarity-laddered choice, not a stat-card flood. The COMMON
// tier is the shipped UPGRADES family above (flat, early stabilization,
// unchanged, weight 0.3). The two new tiers below are the chase:
//   RARE   — percent/scaling cards. LOW-WEIGHT (RARE_WEIGHT), never a pool
//            flood: the weapon cards keep weight 1 and full access, and no
//            chase card is strictly better in all states — each one's value is
//            state-dependent (compounds early, dead late; scales with a
//            commitment the run may not have made).
//   MYTHIC — build-definers, RUN-GATED: at startRun a TWO-STAGE chase gate
//            decides which (if any) mythics enter the run's draft pool — a 10%
//            event roll ("this run has a joker"), then a 60/25/15 count roll,
//            then a uniform draw of which mythics (owner 2026-09-14). Each then
//            rides the pool at MYTHIC_WEIGHT. Taken once per run.
// FIXED = common, PERCENT = rare, and the two COEXIST — never a conversion.
//
// Whetstone note (brief deviation, stated out loud): the brief's rare table
// lists "Whetstone — +15% damage". The shipped 'dmg' card IS Whetstone at
// +25% (pinned by test_draft_luck / test_run_rules / test_rewrites / chests).
// A second Whetstone at +15% next to it would be strictly dominated in every
// state — the "fake choice" the brief's own NO UNIFORM STRENGTH rule forbids —
// so the shipped +25% Whetstone stands as the ladder's rare damage anchor and
// the +15% duplicate is not added.
export const DRAFT_LADDER = {
  RARE_WEIGHT: 0.12,        // per-card pool weight of a RARE ladder card
                            // (common stat = 0.3, weapon = 1): a chase, not a flood
  MYTHIC_WEIGHT: 0.10,      // per-card pool weight of a run-gated MYTHIC chase card
  // The TWO-STAGE chase gate (owner 2026-09-14). CHASE_GATE_CHANCE is the 10%
  // EVENT roll ("this run has a joker"); CHASE_COUNT_WEIGHTS is the conditional
  // count distribution (60% one / 25% two / 15% the three-joker jackpot run).
  // Per-card independent rolls would stack to ~27% any-mythic (0.1 x 3 cards);
  // the gate caps the EVENT at 10% while the count keeps multiples fun. Each
  // specific mythic then lands in ~0.0517 of runs (0.1 x [0.6/3 + 0.25*2/3 + 0.15]).
  CHASE_GATE_CHANCE: 0.1,
  CHASE_COUNT_WEIGHTS: [0.60, 0.25, 0.15],
  LUCK_TIER_BOOST: 0.25,    // Fortune: +25% RARE/MYTHIC ladder weight per luck level
                            // (the luck extension — Fortune now buys draft quality
                            // across the WHOLE ladder, not just the stat family)
  SECOND_WIND_HP_FRAC: 0.5, // revive at this fraction of max HP (owner spec)
  SECOND_WIND_INVULN: 2,    // seconds of spawn-protection after the revive, so the
                            // revive is a second chance, not a double death
  // Storm Shards chip (sensible default, TUNABLE): per XP gem picked up, every
  // enemy within RADIUS of the player takes max(CHIP_MIN, damage * CHIP_FRAC).
  // It scales with XP farming by construction (one proc per gem) and with the
  // run's damage investment — dead in a build that neither farms nor hits.
  STORM_SHARDS: { RADIUS: 90, CHIP_MIN: 4, CHIP_FRAC: 0.5 },
};

// RARE ladder cards (percent/scaling, timing-gated). Repeatable across drafts
// (percent cards compound); under the ONE OF EACH run rule they leave the pool
// once taken, through the same statCardOffered ledger as the common family.
export const DRAFT_RARE_UPGRADES = [
  // The anchor. Coexists with the flat +25 Iron Heart — percent wins with a
  // developed pool, the flat wins wave 1: the drafter split is the point.
  { id: 'hp_pct',   name: 'Iron Heart',      desc: '+25% max HP and heal 25%',   apply: (p) => { p.stats.maxHp *= 1.25; p.hp = Math.min(p.hp + 0.25 * p.stats.maxHp, p.stats.maxHp); } },
  // Good early (compounds into more drafts -> more cards); dead at minute 25.
  { id: 'xp_pct',   name: "Scholar's Stone", desc: '+20% XP',                    apply: (p) => { p.stats.xpMult = (p.stats.xpMult || 1) * 1.2; } },
  // Good early (compounds into the E1 purse); dead late.
  { id: 'gold_pct', name: 'Gilded Palm',     desc: '+30% purse gold per kill',   apply: (p) => { p.stats.purseKillMult = (p.stats.purseKillMult || 1) * 1.3; } },
  // Build-commitment: scales with damage output — a greedy damage build wants
  // it, a defensive build wastes it.
  { id: 'edge',     name: 'Crimson Edge',    desc: '+3% lifesteal',              apply: (p) => { p.stats.lifesteal = (p.stats.lifesteal || 0) + 0.03; } },
];

// MYTHIC ladder cards (build-definers, run-gated by the two-stage chase gate — see
// startRun). Taken once per run (the takenStats ledger, rule or no rule).
export const DRAFT_MYTHIC_UPGRADES = [
  { id: 'second_wind', name: 'Second Wind',  desc: 'Revive once at 50% max HP',  apply: (p) => { p.stats.secondWind = true; } },
  { id: 'storm_shards', name: 'Storm Shards', desc: 'XP pickups chip nearby enemies', apply: (p) => { p.stats.stormShards = true; } },
  // A compounding draft investment: worth it early, dead late.
  { id: 'full_hand',  name: 'Full Hand',     desc: '+1 draft offer for the rest of the run', apply: (p) => { p.stats.draftOffers = (p.stats.draftOffers || 0) + 1; } },
  // RSS8 MAGNET COLLECTOR (owner 2026-09-17: "a very rare card that gives a
  // skill to collect all drops every 30 seconds"). "Very rare" maps onto THIS
  // tier — the top draft tier that exists (run-gated chase pool, violet
  // badge) — no new tier is invented. The apply writes the run-local skill
  // flag (the Frost Nova card's pattern: never the save schema, nothing to
  // migrate); pick()'s MYTHIC branch keeps the once-per-run ledger. POOL
  // DILUTION, disclosed: with a 4th card in the chase draw each specific
  // mythic's per-run rate moves from 0.1 x 1.55/3 = 5.17% to 0.1 x 1.55/4 =
  // 3.88% of runs — rarity is the owner's lever, no gate constant changed.
  // The desc states WHAT it does AND its cooldown (the player-review rule:
  // specials must say what you get).
  { id: 'magnet_collector', name: 'Magnet Collector',
    desc: 'SKILL [X]: every gem, potion and item on the field sweeps to you · 30s cooldown',
    apply: (p) => { if (!p.skills) p.skills = {}; p.skills.magnet = true; } },
];

// ============================================================================
// THE RUN LADDER — pure helpers (CONFIG.RUN / CONFIG.LADDER above)
// ============================================================================
// These live in config.js, next to the numbers they read, so the ladder can be
// exercised with no DOM harness: the run-structure tests import them directly.
//
// The one invariant that matters: for every tick INSIDE the knee the ladder
// returns EXACTLY the shipped curve, so nothing the early game (and therefore
// every existing early-death measurement) sees can change. Past the knee the
// curve is re-based onto a bounded compound.
const _tickCurve = (E, w) =>
  (1 + E.LINEAR * w) * Math.pow(E.COMPOUND, Math.max(0, w - E.COMPOUND_FROM));

/** Enemy hp multiplier at escalation tick w (0..LIMIT/30). */
export function ladderHp(w) {
  const K = CONFIG.LADDER.KNEE_TICK;
  const k = Math.min(w, K);
  return _tickCurve(CONFIG.ESCALATION.HP, k) *
    Math.pow(CONFIG.LADDER.HP_LATE, Math.max(0, w - K));
}

/** Enemy damage multiplier at escalation tick w. */
export function ladderDmg(w) {
  const K = CONFIG.LADDER.KNEE_TICK;
  const k = Math.min(w, K);
  return _tickCurve(CONFIG.ESCALATION.DMG, k) *
    Math.pow(CONFIG.LADDER.DMG_LATE, Math.max(0, w - K));
}

/** Enemy xp multiplier at escalation tick w (keeps drafts flowing late). */
export function ladderXp(w) {
  const K = CONFIG.LADDER.KNEE_TICK;
  const k = Math.min(w, K);
  return _tickCurve(CONFIG.ESCALATION.XP, k) *
    Math.pow(CONFIG.LADDER.XP_LATE, Math.max(0, w - K));
}

/**
 * Mid-boss (HERALD-class) hp at 120s-wave `waveNum` and escalation tick
 * `wTick` — the ONE definition of the MIDBOSS hp formula (E2 R2).
 * main.js spawnMidBoss multiplies desc.hpMult * heat on top at its call site
 * (byte-identical to the old inline formula), and the wave-2 HEAVY tier reads
 * this same function at waveNum-1 so a heavy body is mid-boss-equivalent by
 * READING, never by a restated copy.
 */
export function midBossHp(waveNum, wTick) {
  const M = CONFIG.ESCALATION.MIDBOSS;
  return CONFIG.ENEMY.BASE_HP * ladderHp(wTick) *
    (M.HP_MULT_BASE + M.HP_MULT_PER_WAVE * waveNum);
}

/** The shipped per-spawn-tick group count — the density curve before the knee. */
export function shippedGroups(t) {
  return Math.max(1, Math.ceil((1 + Math.floor(t / 25)) / 2));
}

/**
 * Spawn groups per tick at play time t. Identical to the shipped formula
 * through GROUPS_KNEE (4:00), then a linear ramp to GROUPS_MAX: the shipped
 * formula reached 37 groups/tick at 30:00, which is not a ladder either.
 */
export function ladderGroups(t) {
  const L = CONFIG.LADDER;
  const shipped = shippedGroups(t);
  if (t <= L.GROUPS_KNEE) return shipped;
  const ramp = L.GROUPS_BASE + Math.floor((t - L.GROUPS_KNEE) / L.GROUPS_PER);
  return Math.min(shipped, L.GROUPS_MAX, ramp);
}

/**
 * Per-spawn elite chance at play time t. The shipped value is flat 0.05 after
 * SPAWNER.ELITE_TIME; the ladder ramps it to ELITE_MAX by the run limit so a
 * long run keeps producing events (elites are also the loot/xp peak).
 */
export function ladderEliteChance(t) {
  const S = CONFIG.SPAWNER, L = CONFIG.LADDER, LIMIT = CONFIG.RUN.LIMIT;
  if (t < S.ELITE_TIME) return 0;
  const p = Math.min(1, Math.max(0, (t - L.ELITE_FROM) / (LIMIT - L.ELITE_FROM)));
  return S.ELITE_CHANCE + (L.ELITE_MAX - S.ELITE_CHANCE) * p;
}

/**
 * The cadence beat scheduled on a given wave number.
 *   boss   — the end-of-wave named cast (every wave; ~2:00 apart)
 *   herald — the mid-wave HERALD sub-beat. Every wave through the milestone
 *            (waves 1..END_WAVE are the shipped cadence, untouched), then
 *            alternating waves so a long run does not become a metronome.
 *   surge  — an ELITE SURGE beat: past the milestone, every SURGE_EVERYth wave
 *            raises the spawn-time elite chance for that wave's duration.
 */
export function ladderBeats(waveNum) {
  const L = CONFIG.LADDER;
  const past = waveNum > CONFIG.ESCALATION.END_WAVE;
  return {
    boss: true,
    herald: past ? (waveNum % 2 === 1) : true,
    surge: past && waveNum % L.SURGE_EVERY === 0,
  };
}

/** MM:SS for a sim-time value (the HUD clock / end-screen readouts). */
export function runClock(t) {
  const s = Math.max(0, Math.floor(t || 0));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
