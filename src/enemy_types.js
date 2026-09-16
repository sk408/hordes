// HORDES — enemy variety: typed enemies with distinct stats & behaviors.
// Pure decision functions: decide(enemy, player, dt) -> { mx, my, fire, ...extras }
//   mx,my = normalized move intent (integrator multiplies by enemy.speed).
//   fire  = null | { dx, dy, speed, damage } projectile INTENT ONLY —
//           the integrator wires this to state.projectiles. This module
//           never imports or mutates game state.
//   Extras (additive, integrator may ignore):
//     telegraph: true — WARLOCK charge pause; render/integrator can flash a
//                warning before the bolt lands.
//     attach: true / drain: <dps> — TICK latching contract: when attached,
//             drain the player continuously INSTEAD of contact damage; the
//             integrator owns the enemy.attached flag + position follow.
// Firing/dash/charge phases derive from enemy.age (seconds alive, owned by the
// integrator) so decide() stays deterministic and side-effect free.
//
// LOOK CONTRACT for render.js (replaces any hardcoded ENEMY_LOOK):
//   ENEMY_TYPES[id].LOOK = { body, trim, accent, shape, sizeMult }
//   and VARIANTS[id] = 2-3 alternate palettes {body, trim, accent} (same shape).
//   The spawn site calls rollVariant(typeId, rng?) and stores the returned
//   index on the enemy; render resolves the palette via resolveLook(id, v):
//   0 = base LOOK, 1..n = VARIANTS[id][v-1].
//   SHAPE DRAWING from the enemy's e.w/e.h box (all fillRect, pixel-art safe):
//     block  — one rect w x h centered on (x,y).
//     diamond— stepped diamond inscribed in the w x h box: 3 stacked rects —
//              middle row full width (w x h/3), rows above/below half width
//              (w/2 x h/3). 4 steps if h >= 20: quarter rows at 0.25/0.75 width.
//     tall   — one rect (w*0.7) x (h*1.3) centered — stretched silhouette.
//     wide   — one rect (w*1.3) x (h*0.7) centered — squat silhouette.
//   body fills the main shape, trim a 1px darker inner/edge band, accent a
//   2x2 "eye" or core pixel near center (facing the player if integrator knows).

import { CONFIG as C } from './config.js';

// ---- per-type stat multipliers & behavior params --------------------------
export const ENEMY_TYPES = {
  // Base chaser (reference; matches makeEnemy in entities.js at mult 1).
  CHASER: {
    id: 'CHASER',
    chaff: true,   // E2: the wave-2 horde triples THIS swarm, not the heavies
    hpMult: 1.0, speedMult: 1.0, xpMult: 1.0, sizeMult: 1.0,
    contactDamageMult: 1.0,
    decide: chaseDecide,
    LOOK: { body: '#c23b3b', trim: '#7a1f1f', accent: '#ff8f8f', shape: 'block', sizeMult: 1.0 },
  },

  // Fast, weak, spawns in packs.
  SWARMER: {
    id: 'SWARMER',
    chaff: true,   // E2: the wave-2 horde triples THIS swarm, not the heavies
    hpMult: 0.4, speedMult: 1.7, xpMult: 0.5, sizeMult: 0.75,
    contactDamageMult: 0.7,
    packSize: 5,          // spawner hint: spawn this many per pop
    decide: chaseDecide,
    LOOK: { body: '#d9a03c', trim: '#8a5f1c', accent: '#ffe08a', shape: 'diamond', sizeMult: 0.75 },
  },

  // Slow, tanky, big contact damage.
  BRUTE: {
    id: 'BRUTE',
    heavy: true,   // E2 (R1): mid-boss-equivalent hp from the horde wave on
    hpMult: 3.5, speedMult: 0.6, xpMult: 3.0, sizeMult: 1.8,
    contactDamageMult: 2.5,
    decide: chaseDecide,
    LOOK: { body: '#6d4f8f', trim: '#3d2a52', accent: '#c9a6ff', shape: 'wide', sizeMult: 1.8 },
  },

  // Ranged threat: holds ~120px, retreats if crowded, spits steady shots.
  // WAVE-20: hotter cadence + faster/heavier spit (Sk408: shooters barely
  // pressured a weapon-build pilot).
  SPITTER: {
    id: 'SPITTER',
    hpMult: 1.0, speedMult: 0.9, xpMult: 2.0, sizeMult: 1.1,
    contactDamageMult: 1.0,
    holdDist: 120,
    retreatDist: 100,     // back off harder inside this radius
    fireRange: 200,
    fireInterval: 1.15,   // seconds between spits (age-phase driven) —
                          // WAVE-20: 1.5 -> 1.15 — kiters must dodge, not
                          // just outrun the pack
    projSpeed: 105,       // meaningfully faster than the pilot's strafe
    projDamage: 10,
    decide: spitterDecide,
    LOOK: { body: '#3f9e4f', trim: '#1f5c2b', accent: '#a6ff9e', shape: 'tall', sizeMult: 1.1 },
  },

  // DASHER — stalks slowly, then lunges in bursts. Deterministic
  // cycle from age: 1.6s stalk at 0.5x, then 0.8s lunge at 2.6x.
  DASHER: {
    id: 'DASHER',
    heavy: true,   // E2 (R1): mid-boss-equivalent hp from the horde wave on
    hpMult: 1.3, speedMult: 1.0, xpMult: 1.5, sizeMult: 1.0,
    contactDamageMult: 1.5,
    stalkTime: 1.6, stalkSpeedMult: 0.5,
    lungeTime: 0.8, lungeSpeedMult: 2.6,
    decide: dasherDecide,
    LOOK: { body: '#3f7f9e', trim: '#1f465c', accent: '#9ee6ff', shape: 'block', sizeMult: 1.0 },
  },

  // WARLOCK — dedicated ranged HUNTER: keeps 150px, telegraphs with a 1s
  // charge pause (stands still, intent.telegraph = true), then fires a
  // heavy bolt. Punishes builds that ignore ranged threats.
  // Age cycle: moveTime repositioning -> chargeTime frozen telegraph -> fire
  // on the frame the cycle wraps.
  // WAVE-20: shorter reposition + faster/heavier bolt (Sk408: ranged chip
  // was ignorable; now the answer is killing the warlock or the shop's
  // hp/defense upgrades).
  WARLOCK: {
    id: 'WARLOCK',
    hpMult: 1.6, speedMult: 0.8, xpMult: 2.5, sizeMult: 1.2,
    contactDamageMult: 1.0,
    holdDist: 150,
    retreatDist: 130,
    fireRange: 260,
    moveTime: 1.6,        // reposition phase of the cycle
    chargeTime: 1.0,      // telegraph pause before the bolt
    projSpeed: 75,        // heavy bolt — faster than a calm strafe now
    projDamage: 17,
    decide: warlockDecide,
    LOOK: { body: '#8f3f6d', trim: '#52203d', accent: '#ff9ed8', shape: 'tall', sizeMult: 1.2 },
  },

  // TICK — tiny latcher: fast, attaches on contact and DRAINS hp over time
  // instead of dealing contact damage (contactDamageMult 0). Must be killed
  // to remove; while enemy.attached is truthy the intent stays
  // { attach: true, drain: DRAIN_DPS } and movement is zero (integrator
  // snaps the tick to the player).
  TICK: {
    id: 'TICK',
    heavy: true,   // E2 (R1): mid-boss-equivalent hp from the horde wave on
    hpMult: 0.3, speedMult: 1.8, xpMult: 0.8, sizeMult: 0.5,
    contactDamageMult: 0,           // NO contact hit — drain instead
    attachDist: 14,                 // latches inside this radius
    drainDps: 4,                    // hp/s while attached
    decide: tickDecide,
    LOOK: { body: '#7f9e3f', trim: '#46521f', accent: '#e3ff9e', shape: 'diamond', sizeMult: 0.5 },
  },

  // COLOSSUS — rare wave-5+ mini-boss tier: massive HP, slow, huge body.
  // On death the integrator calls deathShockwave(enemy) and applies the
  // returned AoE damage to nearby ENEMIES (friendly-fire chaos).
  COLOSSUS: {
    id: 'COLOSSUS',
    hpMult: 14.0, speedMult: 0.45, xpMult: 8.0, sizeMult: 2.6,
    contactDamageMult: 3.0,
    minWave: 5,                     // spawner gate
    shockRadius: 90,                // death AoE radius
    shockBaseDamage: 25,
    shockMaxHpFrac: 0.25,           // + 25% of colossus maxHp
    decide: chaseDecide,
    LOOK: { body: '#5a5f66', trim: '#2e3136', accent: '#ffd54a', shape: 'wide', sizeMult: 2.6 },
  },

  // PILLAR — WAVE-20 herald turret: NEVER in the normal spawner mix; the
  // mid-wave boss (bosses.js HERALD) rings the player with these. Fully
  // STATIONARY (speedMult 0 -> integrator speed 0; decide also returns
  // mx/my 0), high HP, and chips the player with a steady slow shot from
  // wherever it was planted. The spawn site staggers pillar.age so a ring
  // fires as a rolling barrage instead of one synchronized volley.
  PILLAR: {
    id: 'PILLAR',
    hpMult: 5.0, speedMult: 0, xpMult: 2.0, sizeMult: 1.3,
    contactDamageMult: 0.6,
    fireRange: 300,             // covers the whole ring's engagement band
    fireInterval: 1.8,          // seconds between shots (age-phase driven)
                              // WAVE-20: 1.4 -> 1.8 — the ring cages, it
                              // doesn't execute (6/20 sim deaths was too hot)
    projSpeed: 105,             // fast chip — the ring must be respected
    projDamage: 5,              // pre-dmgScale chip damage
    decide: pillarDecide,
    LOOK: { body: '#7f7461', trim: '#4a4236', accent: '#ff5a3c', shape: 'tall', sizeMult: 1.3 },
  },

  // SHRIKE — E2 (R9) THE FLYING heavy, debuting with the wave-2 horde. It
  // HOVERS above the ground game: z (altitude px) is drawn, never simulated —
  // contact, targeting and every damage number stay 2D on (x,y). Ground AoE
  // cannot touch it (main.js's call-site guard restores its hp/flash/slow
  // around novas, blasts, chain detonations and consecration fields) and
  // frost slow never grips it; DIRECT hits (projectiles, contact, and the
  // Witch's chain beam) land normally. The swoop cycle runs off enemy.age
  // (dt-free — 60Hz and 120Hz fly identical paths): an angled OBLIQUE close
  // (cruise), then a committed straight DIVE burst, then the cycle wraps.
  SHRIKE: {
    id: 'SHRIKE',
    heavy: true,            // E2 (R1): mid-boss-equivalent hp from the horde wave on
    flying: true,           // E2 (R9): z-drawn, ground-AoE/slow immune
    hpMult: 2.0, speedMult: 1.2, xpMult: 3.0, sizeMult: 1.2,
    contactDamageMult: 1.5,
    cruiseTime: 2.2,        // angled close phase (s)
    diveTime: 0.7,          // committed dive phase (s)
    oblique: 0.6,           // radians off the direct bearing while cruising
    cruiseSpeedMult: 0.9,
    diveSpeedMult: 3.0,
    hoverZ: 14,             // cruise altitude (px, drawn)
    diveZ: 3,               // altitude at the bottom of the dive (px, drawn)
    decide: shrikeDecide,
    LOOK: { body: '#3f4a9e', trim: '#1f2552', accent: '#9ec9ff', shape: 'wide', sizeMult: 1.2 },
  },
};

// ---- G19 slice 2: THE FAMILY MAP --------------------------------------------
// All TEN types classified into exactly four families, derived from the table's
// OWN role flags where they exist and from the documented role where they do
// not. ONE lookup table (enumerable by tests), never a chain of ifs at call
// sites. enemyFamily() is PURE: an unknown id returns null — it never throws
// and never guesses a family, so an unclassified type reads as NEUTRAL (x1)
// everywhere the specialty terms are applied.
//   CHAFF   — the chaff:true horde bodies (E2's wave-2 swarm triplers).
//   RANGED  — the attackers that hurt from a distance: SPITTER (table comment:
//             "Ranged threat"), WARLOCK ("dedicated ranged HUNTER"), PILLAR
//             (stationary WAVE-20 turret that chips with steady shots).
//   HEAVY   — the heavy bodies: BRUTE, DASHER, TICK all carry the table's own
//             heavy:true flag (E2 R1 mid-boss-tier hp); COLOSSUS is the
//             mini-boss tier of the same role (main.js :856/:887).
//   FLYING  — the flyer flag (E2 R9): SHRIKE, the z-drawn ground-AoE-immune
//             diver. The flag wins over its heavy:true — the flying identity
//             is the more specific role.
export const ENEMY_FAMILY = {
  CHASER: 'CHAFF',     // chaff: true
  SWARMER: 'CHAFF',    // chaff: true
  SPITTER: 'RANGED',   // "Ranged threat: holds ~120px ... spits steady shots"
  WARLOCK: 'RANGED',   // "dedicated ranged HUNTER"
  PILLAR: 'RANGED',    // stationary turret, "chips the player with a steady slow shot"
  BRUTE: 'HEAVY',      // heavy: true — "Slow, tanky, big contact damage"
  DASHER: 'HEAVY',     // heavy: true (judgement: it lunges FAST, but the table's own flag says heavy)
  TICK: 'HEAVY',       // heavy: true (judgement: tiny latcher, but the table's own flag says heavy)
  COLOSSUS: 'HEAVY',   // mini-boss tier: "massive HP, slow, huge body"
  SHRIKE: 'FLYING',    // flying: true — wins over heavy: true (more specific role)
};

// The family of a type id, or null for an unknown id. Pure, total, never throws.
export function enemyFamily(typeId) {
  return Object.prototype.hasOwnProperty.call(ENEMY_FAMILY, typeId)
    ? ENEMY_FAMILY[typeId]
    : null;
}

// ELITE template: applies to ANY type — 4x hp, 1.5x size, guaranteed chest.
export const ELITE_TEMPLATE = {
  hpMult: 4.0,
  sizeMult: 1.5,
  xpMult: 3.0,
  guaranteesChest: true,
};

// Suggested elite palette override for render (gold trim keeps the existing
// elite tell regardless of type/variant).
export const ELITE_LOOK = { trim: '#ffd54a', accent: '#fff3b0' };

// ---- palette VARIANTS (visual mix; rollVariant picks the index at spawn) ---
// Each entry swaps {body, trim, accent}; shape/sizeMult come from type.LOOK.
export const VARIANTS = {
  CHASER: [
    { body: '#b0562f', trim: '#6b3018', accent: '#ffb98a' },   // rust
    { body: '#8f3b52', trim: '#521f2f', accent: '#ff9ec2' },   // rose
  ],
  SWARMER: [
    { body: '#c9c93f', trim: '#75751c', accent: '#ffffa6' },   // acid
    { body: '#9ec93f', trim: '#5c751c', accent: '#e3ff9e' },   // lime
    { body: '#c96b3f', trim: '#753a1c', accent: '#ffc4a6' },   // ember
  ],
  BRUTE: [
    { body: '#8f6d4f', trim: '#523a28', accent: '#ffc49e' },   // ochre
    { body: '#4f6d8f', trim: '#283a52', accent: '#9ec9ff' },   // steel
  ],
  SPITTER: [
    { body: '#3f9e8a', trim: '#1f5c50', accent: '#9effe0' },   // teal
    { body: '#9e9e3f', trim: '#5c5c1c', accent: '#ffffa6' },   // bile
  ],
  DASHER: [
    { body: '#5c3f9e', trim: '#321f5c', accent: '#c49eff' },   // violet
    { body: '#3f9e6d', trim: '#1f5c40', accent: '#9effc4' },   // jade
  ],
  WARLOCK: [
    { body: '#5c3f8f', trim: '#332052', accent: '#c49eff' },   // arcanist
    { body: '#8f3f3f', trim: '#521f1f', accent: '#ff9e9e' },   // blood
  ],
  TICK: [
    { body: '#9e5c3f', trim: '#5c3218', accent: '#ffc49e' },   // tick-brown
    { body: '#3f6d9e', trim: '#1f3d5c', accent: '#9ec9ff' },   // blue-bug
  ],
  COLOSSUS: [
    { body: '#6d5a3f', trim: '#3d3220', accent: '#ffd54a' },   // bronze
    { body: '#3f5a6d', trim: '#20323d', accent: '#9effff' },   // glacier
  ],
  PILLAR: [
    { body: '#6d5f7f', trim: '#3a324a', accent: '#c49eff' },   // runic violet
    { body: '#7f6d5f', trim: '#4a3a32', accent: '#ffc49e' },   // sandstone
  ],
  SHRIKE: [
    { body: '#3f9e8a', trim: '#1f5c50', accent: '#9effe0' },   // storm teal
    { body: '#9e3f5c', trim: '#5c1f2f', accent: '#ff9ec2' },   // dusk crimson
  ],
};

// rollVariant(typeId, rng?) -> palette index for this spawn. Index space is
// [base, ...variants]: 0 = the type's base LOOK, 1..n = VARIANTS entries, so
// hordes mix the base palette AND the alternates. rng: injectable () => [0,1)
// (default Math.random). Clamped so a 0.999... roll never overflows.
export function rollVariant(typeId, rng = Math.random) {
  const count = (VARIANTS[typeId] || []).length + 1; // + base palette
  return Math.min(count - 1, Math.floor(rng() * count));
}

// resolveLook(typeId, variant) -> full palette {body, trim, accent, shape,
// sizeMult} for render; variant 0 = base LOOK, 1..n = VARIANTS[variant-1].
// Unknown types fall back to CHASER base look.
export function resolveLook(typeId, variant = 0) {
  const type = ENEMY_TYPES[typeId] || ENEMY_TYPES.CHASER;
  const v = variant > 0 ? (VARIANTS[type.id]?.[variant - 1] || {}) : {};
  return { ...type.LOOK, ...v };
}

// ---- decision helpers ------------------------------------------------------

function toward(dx, dy) {
  const len = Math.hypot(dx, dy) || 1;
  return { mx: dx / len, my: dy / len };
}

// Did `interval` tick over during this frame? The convention for these
// attackers is "the shot lands on the frame the interval phase wraps", and the
// sound way to answer that from (age, interval, dt) is to compare the integer
// part of age / interval against the previous frame's — age advances by exactly
// dt, so the wrap frame is the one where that integer moves. (WRAP_EPS absorbs
// float noise: `age - dt` can land one ulp BELOW a multiple of the interval the
// previous frame had already reached, which would detect the same boundary
// twice. WRAP_EPS is relative to the interval — ~2ns of jitter, far below any
// real frame cadence.)
// Testing the PHASE against a window is what broke:
//   * a fixed 1/60 window (the original code) fired every shot TWICE on a 120Hz
//     display (dt 1/120 put two frames inside it) and could skip a shot entirely
//     when a frame ran longer than 1/60 (dt is clamped at 0.05);
//   * a frame-relative `phase < dt` window is still epsilon-fragile — a boundary
//     landing a hair inside the previous frame leaves the next frame's phase a
//     fraction below dt and the shot fires twice again.
// dt defaults to 1/60 for callers that predate the argument.
const WRAP_EPS = 1e-9;
function intervalWrapped(age, interval, dt) {
  const step = dt > 0 ? dt : 1 / 60;
  return Math.floor(age / interval + WRAP_EPS) !==
         Math.floor((age - step) / interval + WRAP_EPS);
}

function chaseDecide(enemy, player) {
  const t = toward(player.x - enemy.x, player.y - enemy.y);
  return { mx: t.mx, my: t.my, fire: null };
}

function spitterDecide(enemy, player, dt = 1 / 60) {
  const T = ENEMY_TYPES.SPITTER;
  const dx = player.x - enemy.x, dy = player.y - enemy.y;
  const dist = Math.hypot(dx, dy);
  const dir = toward(dx, dy);

  let mx = 0, my = 0;
  if (dist < T.retreatDist) {            // too close: back away
    mx = -dir.mx; my = -dir.my;
  } else if (dist > T.holdDist + 20) {   // too far: close in
    mx = dir.mx; my = dir.my;
  }                                     // else: hold position (~120px band)

  // Age-phase fire: one spit per fireInterval while in range. Pure — no timer
  // mutation; the integrator owns enemy.age.
  let fire = null;
  if (dist <= T.fireRange && intervalWrapped(enemy.age, T.fireInterval, dt)) {
    fire = { dx: dir.mx, dy: dir.my, speed: T.projSpeed, damage: T.projDamage };
  }
  return { mx, my, fire };
}

function dasherDecide(enemy, player) {
  const T = ENEMY_TYPES.DASHER;
  const dir = toward(player.x - enemy.x, player.y - enemy.y);
  const phase = enemy.age % (T.stalkTime + T.lungeTime);
  const lunging = phase >= T.stalkTime;
  const speedMult = lunging ? T.lungeSpeedMult : T.stalkSpeedMult;
  return { mx: dir.mx * speedMult, my: dir.my * speedMult, fire: null };
}

function warlockDecide(enemy, player, dt = 1 / 60) {
  const T = ENEMY_TYPES.WARLOCK;
  const dx = player.x - enemy.x, dy = player.y - enemy.y;
  const dist = Math.hypot(dx, dy);
  const dir = toward(dx, dy);
  const cycle = T.moveTime + T.chargeTime;
  const phase = enemy.age % cycle;
  // Bolt fires on the frame the cycle wraps — resolved BEFORE the charge pause.
  // age is accumulated by += dt in the game loop, so the wrap frame's phase can
  // sit a hair below the cycle length; letting the charge early-return win there
  // would eat the bolt for a whole cycle.
  const wrapped = intervalWrapped(enemy.age, cycle, dt);

  // Charge window at the end of the cycle: stand still and telegraph.
  const charging = phase >= T.moveTime && !wrapped;
  if (charging) {
    return { mx: 0, my: 0, fire: null, telegraph: true };
  }

  let mx = 0, my = 0;
  if (dist < T.retreatDist) {            // hunter keeps its distance
    mx = -dir.mx; my = -dir.my;
  } else if (dist > T.holdDist + 20) {
    mx = dir.mx; my = dir.my;
  }

  let fire = null;
  if (dist <= T.fireRange && wrapped) {  // cycle just wrapped: bolt!
    fire = { dx: dir.mx, dy: dir.my, speed: T.projSpeed, damage: T.projDamage };
  }
  return { mx, my, fire, telegraph: false };
}

function tickDecide(enemy, player) {
  const T = ENEMY_TYPES.TICK;
  const dx = player.x - enemy.x, dy = player.y - enemy.y;
  const dist = Math.hypot(dx, dy);

  // Attached (integrator flag) or within latch range: stop moving, drain.
  if (enemy.attached || dist <= T.attachDist) {
    return { mx: 0, my: 0, fire: null, attach: true, drain: T.drainDps };
  }
  const dir = toward(dx, dy);
  return { mx: dir.mx, my: dir.my, fire: null, attach: false, drain: 0 };
}

// PILLAR turret: planted forever — ZERO move intent at any range; fires a
// single slow chip shot at the player on every fireInterval wrap while in
// range (spitter convention: the shot lands on the frame the phase wraps).
function pillarDecide(enemy, player, dt = 1 / 60) {
  const T = ENEMY_TYPES.PILLAR;
  const dx = player.x - enemy.x, dy = player.y - enemy.y;
  if (Math.hypot(dx, dy) > T.fireRange) return { mx: 0, my: 0, fire: null };
  const dir = toward(dx, dy);
  if (intervalWrapped(enemy.age, T.fireInterval, dt)) {
    return {
      mx: 0, my: 0,
      fire: { dx: dir.mx, dy: dir.my, speed: T.projSpeed, damage: T.projDamage },
    };
  }
  return { mx: 0, my: 0, fire: null };
}

// SHRIKE swoop (E2 R9): cruise = close in at a fixed OBLIQUE off the direct
// bearing (alternating side per cycle, so the approach reads as a swoop, not
// a beeline); dive = a COMMITTED straight burst at the player — no steering
// away mid-dive, contact is the payoff. Age-phase only (no dt read), so the
// flight path is identical at 60Hz and 120Hz.
function shrikeDecide(enemy, player) {
  const T = ENEMY_TYPES.SHRIKE;
  const dir = toward(player.x - enemy.x, player.y - enemy.y);
  const cycle = T.cruiseTime + T.diveTime;
  const phase = enemy.age % cycle;
  if (phase >= T.cruiseTime) {
    return { mx: dir.mx * T.diveSpeedMult, my: dir.my * T.diveSpeedMult, fire: null };
  }
  const side = Math.floor(enemy.age / cycle) % 2 === 0 ? 1 : -1;
  const c = Math.cos(T.oblique * side), s = Math.sin(T.oblique * side);
  return {
    mx: (dir.mx * c - dir.my * s) * T.cruiseSpeedMult,
    my: (dir.mx * s + dir.my * c) * T.cruiseSpeedMult,
    fire: null,
  };
}

// E2 (R9): a flyer's altitude in drawn px. Pure function of enemy.age — no dt
// accumulation — so 60Hz and 120Hz draw the SAME altitude at the same second.
// Cruise: hoverZ with a slow bob; the dive dips to diveZ and back (a sine
// over the dive window — down, contact, recover).
export function flyingZ(e) {
  const T = ENEMY_TYPES[e.typeId];
  if (!T || !T.flying) return 0;
  const cycle = T.cruiseTime + T.diveTime;
  const phase = e.age % cycle;
  const hover = T.hoverZ + Math.sin(e.age * 2.4) * 2;
  if (phase >= T.cruiseTime) {
    const k = (phase - T.cruiseTime) / T.diveTime;   // 0..1 through the dive
    const dip = Math.sin(k * Math.PI);               // 0 -> 1 -> 0
    return Math.max(1, Math.round(hover * (1 - dip) + T.diveZ * dip));
  }
  return Math.max(1, Math.round(hover));
}

// deathShockwave(enemy) -> AoE data for the integrator's kill path. Damages
// nearby ENEMIES (friendly fire), not the player. Damage scales with the
// colossus's own maxHp so late-wave colossi still thin the horde.
export function deathShockwave(enemy) {
  const T = ENEMY_TYPES.COLOSSUS;
  if (enemy.typeId !== 'COLOSSUS') return null;
  return {
    radius: T.shockRadius,
    damage: T.shockBaseDamage + enemy.maxHp * T.shockMaxHpFrac,
    friendlyFire: true,
  };
}

// ---- factory ----------------------------------------------------------------

// makeTypedEnemy(typeId, x, y, t [, { elite, variant }])
// Reuses the base time-scaling conventions from entities.js makeEnemy:
// wave = floor(t / 30); hp scales 1+wave*0.35, speed 1+wave*0.05, xp 1+wave*0.25.
// variant: palette index (call rollVariant at the spawn site; default 0).
export function makeTypedEnemy(typeId, x, y, t, opts = {}) {
  const type = ENEMY_TYPES[typeId] || ENEMY_TYPES.CHASER;
  const wave = Math.floor(t / 30);
  const hpScale = 1 + wave * 0.35;
  const speedScale = 1 + wave * 0.05;
  const xpScale = 1 + wave * 0.25;

  let hpMult = type.hpMult, sizeMult = type.sizeMult, xpMult = type.xpMult;
  const elite = !!opts.elite;
  if (elite) {
    hpMult *= ELITE_TEMPLATE.hpMult;
    sizeMult *= ELITE_TEMPLATE.sizeMult;
    xpMult *= ELITE_TEMPLATE.xpMult;
  }

  const hp = C.ENEMY.BASE_HP * hpScale * hpMult;
  return {
    typeId: type.id,
    elite,
    variant: opts.variant ?? 0,   // palette index for render (see rollVariant)
    x, y,
    hp, maxHp: hp,
    speed: C.ENEMY.BASE_SPEED * speedScale * type.speedMult,
    xp: C.ENEMY.BASE_XP * xpScale * xpMult,
    w: C.ENEMY.W * sizeMult,
    h: C.ENEMY.H * sizeMult,
    contactDamageMult: type.contactDamageMult,
    // Guaranteed chest drop on elites (loot wiring is the integrator's job).
    guaranteesChest: elite || undefined,
    packSize: type.packSize || 1,   // spawner hint
    minWave: type.minWave || 0,     // spawner gate (COLOSSUS = 5+)
    age: 0,                          // seconds alive; integrator advances it
    attached: false,                 // TICK latch flag; integrator-owned
    flash: 0,
    slow: 0,
    flying: type.flying || undefined,  // E2 (R9): SHRIKE — z-drawn heavy
    z: 0,                              // altitude px (only flyers read it)
  };
}

// Convenience: typed decision dispatch.
export function decideEnemyAction(enemy, player, dt) {
  const type = ENEMY_TYPES[enemy.typeId] || ENEMY_TYPES.CHASER;
  return type.decide(enemy, player, dt);
}
