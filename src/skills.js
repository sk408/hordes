// HORDES — skills & potions: the engagement layer between drafts.
// Skills are player-triggered (WHEN to fire is the judgment call); potions
// are finite consumables. Both read/modify state but never route character
// decisions around the controller seam — movement/attack targeting stays in
// controllers.js.
import { CONFIG as C } from './config.js';

// Try to fire a skill ('FROST_NOVA' | 'OVERCHARGE'). Returns true if fired.
export function useSkill(state, id) {
  const p = state.player;
  const def = C.SKILLS[id];
  if (p.skillCd[id] > 0 || p.mana < def.MANA) return false;
  p.mana -= def.MANA;
  p.skillCd[id] = def.COOLDOWN;

  if (id === 'FROST_NOVA') {
    // AoE damage + slow around the player. No aiming — the player IS the
    // target zone, so timing (not execution) is the whole decision.
    for (const e of state.enemies) {
      if (e.hp <= 0) continue;
      if (Math.hypot(e.x - p.x, e.y - p.y) <= def.RADIUS) {
        e.hp -= def.DAMAGE;
        e.flash = 0.08;
        e.slow = def.SLOW;
      }
    }
    state.effects.push({ kind: 'nova', x: p.x, y: p.y, age: 0, ttl: 0.4, radius: def.RADIUS });
  } else if (id === 'OVERCHARGE') {
    p.buffs.overcharge = def.DURATION;
    state.effects.push({ kind: 'charge', x: p.x, y: p.y, age: 0, ttl: def.DURATION });
  }
  return true;
}

// Drink a potion ('hp' | 'mp'). Returns true if consumed.
export function usePotion(state, kind) {
  const p = state.player;
  if (p.potions[kind] <= 0) return false;
  if (kind === 'hp') {
    if (p.hp >= p.stats.maxHp) return false; // never waste a health potion at full HP
    p.potions.hp--;
    p.hp = Math.min(p.stats.maxHp, p.hp + C.POTIONS.HP_HEAL);
  } else {
    if (p.mana >= p.stats.maxMana) return false;
    p.potions.mp--;
    p.mana = Math.min(p.stats.maxMana, p.mana + C.POTIONS.MP_RESTORE);
  }
  return true;
}

// Per-frame resource bookkeeping: mana regen, skill cooldowns, buff timers.
export function updateResources(p, dt) {
  p.mana = Math.min(p.stats.maxMana, p.mana + C.MANA.REGEN * dt);
  for (const id in p.skillCd) {
    if (p.skillCd[id] > 0) p.skillCd[id] = Math.max(0, p.skillCd[id] - dt);
  }
  if (p.buffs.overcharge > 0) p.buffs.overcharge = Math.max(0, p.buffs.overcharge - dt);
}

// Roll an enemy death drop. Returns { x, y, kind: 'hp'|'mp' } or null.
export function rollDrop(x, y) {
  if (Math.random() >= C.POTIONS.DROP_CHANCE) return null;
  return { x, y, kind: Math.random() < 0.5 ? 'hp' : 'mp' };
}
