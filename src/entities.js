// HORDES — entities: player, enemies, projectiles, gems
import { CONFIG as C } from './config.js';
import { heatOf, heatMultipliers } from './heat.js';

export function makePlayer() {
  return {
    x: 0, y: 0,
    hp: C.PLAYER.MAX_HP,
    invuln: 0,
    level: 1,
    xp: 0,
    xpNext: C.XP_LEVEL_BASE,
    kills: 0,
    stats: {
      damage: C.WEAPON.DAMAGE,
      cooldown: C.WEAPON.COOLDOWN,
      speed: C.PLAYER.SPEED,
      pickup: C.PLAYER.XP_PICKUP_RADIUS,
      projectiles: 1,
      pierce: 0,
      maxHp: C.PLAYER.MAX_HP,
      maxMana: C.MANA.MAX,
    },
    attackTimer: 0,
    // Skills/potions engagement layer.
    mana: C.MANA.MAX,
    skillCd: { FROST_NOVA: 0, OVERCHARGE: 0 }, // seconds remaining
    buffs: { overcharge: 0 },
    potions: { hp: C.POTIONS.START, mp: C.POTIONS.START },
  };
}

export function makeEnemy(x, y, t) {
  // Difficulty scales with elapsed time t (see ESCALATION curves in config).
  const wave = Math.floor(t / 30);
  return {
    x, y,
    hp: C.ENEMY.BASE_HP * hpScale(wave),
    maxHp: C.ENEMY.BASE_HP * hpScale(wave),
    speed: C.ENEMY.BASE_SPEED * (1 + wave * 0.05),
    xp: C.ENEMY.BASE_XP * xpScale(wave),
    flash: 0,
    slow: 0,            // seconds of frost-nova slow remaining
  };
}

// ---------- ESCALATION curves (see CONFIG.ESCALATION docs in config.js) ----
export function hpScale(w) {
  const E = C.ESCALATION.HP;
  return (1 + E.LINEAR * w) * Math.pow(E.COMPOUND, Math.max(0, w - E.COMPOUND_FROM));
}
export function xpScale(w) {
  const E = C.ESCALATION.XP;
  return (1 + E.LINEAR * w) * Math.pow(E.COMPOUND, Math.max(0, w - E.COMPOUND_FROM));
}
export function dmgScale(w) {
  const E = C.ESCALATION.DMG;
  return (1 + E.LINEAR * w) * Math.pow(E.COMPOUND, Math.max(0, w - E.COMPOUND_FROM));
}

// ---------- applyEscalation (single source of truth) -----------------------
// Re-scale a freshly-made typed enemy onto the ESCALATION curves: back out
// enemy_types.js's linear preview multipliers (1+0.35w hp / 1+0.25w xp) and
// apply the steeper CONFIG.ESCALATION curves instead. HEAT stacks
// multiplicatively AFTER the wave escalation (hp only — xp/gold are never
// heat-inflated).
//
// WAVE-26: this algebra used to be duplicated (main.js + chests.js) with a
// comment on both sides saying they had to move together. It lives HERE now;
// both callers delegate, so a curve change can never desync the two paths.
// `t` defaults to state.time (main.js historically passed it explicitly).
export function applyEscalation(state, e, t) {
  const time = (t === undefined ? (state && state.time) : t) || 0;
  const w = Math.floor(time / 30);
  const hpMult = e.hp / (C.ENEMY.BASE_HP * (1 + w * 0.35));
  const xpMult = e.xp / (C.ENEMY.BASE_XP * (1 + w * 0.25));
  const hp = C.ENEMY.BASE_HP * hpScale(w) * hpMult * heatMultipliers(heatOf(state)).hp;
  e.hp = hp;
  e.maxHp = hp;
  e.xp = C.ENEMY.BASE_XP * xpScale(w) * xpMult;
  return e;
}

export function makeProjectile(x, y, dx, dy, stats) {
  const len = Math.hypot(dx, dy) || 1;
  return {
    x, y,
    vx: (dx / len) * C.WEAPON.PROJ_SPEED,
    vy: (dy / len) * C.WEAPON.PROJ_SPEED,
    damage: stats.damage,
    pierce: stats.pierce,
    hit: new Set(),
    age: 0,
  };
}

// ---------- LOOT REACHABILITY (one source of truth) -------------------------
// WAVE-27 (Sk408 playtest): drops used to take the killed enemy's exact (x,y)
// with NO clamp anywhere. Enemies spawn on a ring around the PLAYER and are
// never rim-clamped, so kills out past the wall dropped loot out there — on
// the wall's inner face or beyond it, uncollectible, and the pilot ground
// against the wall chasing it.
//
// The playable face is ±C.GROUND.RIM; the drawn wall band is RIM..RIM+WALL
// (render.js) and the player clamps at exactly ±RIM, so a drop at the rim sits
// ON the wall band. `lootLimit()` is the farthest coordinate loot may take:
// the rim minus the wall band minus the base pickup radius, so from a legal
// standing position inside the face the item is always collectible with room
// to spare. Every loot spawn routes through this — gems (makeGem), potion
// drops, rare item drops and chests — so no drop source can produce an
// unreachable item. Enemies arriving from OUTSIDE the rim are intended and
// are not touched by any of this.
export function lootLimit() {
  return C.GROUND.RIM - C.GROUND.WALL - C.PLAYER.XP_PICKUP_RADIUS;
}

// Clamp a world (x, y) to the reachable loot region. PURE (returns new object).
export function clampLootToArena(x, y) {
  const m = lootLimit();
  return {
    x: Math.max(-m, Math.min(m, x)),
    y: Math.max(-m, Math.min(m, y)),
  };
}

// Is this coordinate collectible from some legal standing position? The pilot
// uses the same predicate so an unreachable drop is never a target candidate.
export function isReachableLoot(x, y) {
  const m = lootLimit();
  return Math.abs(x) <= m && Math.abs(y) <= m;
}

export function makeGem(x, y, xp) {
  const at = clampLootToArena(x, y);
  return { x: at.x, y: at.y, xp };
}
