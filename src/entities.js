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

export function makeGem(x, y, xp) {
  return { x, y, xp };
}
