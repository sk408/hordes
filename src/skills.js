// HORDES — skills & potions: the engagement layer between drafts.
// Skills are player-triggered (WHEN to fire is the judgment call); potions
// are finite consumables. Both read/modify state but never route character
// decisions around the controller seam — movement/attack targeting stays in
// controllers.js.
import { CONFIG as C } from './config.js';
// G8 step 4 (src/perks.js): Focus discounts mana cost + cooldown. useSkill
// reads the SAME applied-value helpers the HUD readiness readout reads, so
// the button text can never lie about what the perk changed.
import { skillManaCost, skillCooldown } from './perks.js';
// N1 slice 1: the Q chain walks the same nearest-first scan the gun's bolt
// does (weapons.js owns the tie-break rule; this edge is acyclic — weapons
// imports neither skills nor anything that does).
import { nearestEnemy } from './weapons.js';

// Try to fire a skill ('FROST_NOVA' | 'OVERCHARGE' | 'CHAIN_REACTION').
// Returns true if fired.
// An unknown / missing id fails the same way an unknown potion kind does
// (return false, no state touched) instead of throwing a TypeError on
// `def.MANA` — see usePotion for the shared contract.
export function useSkill(state, id) {
  const p = state.player;
  const def = C.SKILLS[id];
  if (!def) return false;   // unknown id: fail, never throw
  if (p.skillCd[id] > 0 || p.mana < skillManaCost(id, state)) return false;
  p.mana -= skillManaCost(id, state);
  p.skillCd[id] = skillCooldown(id, state);

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
  } else if (id === 'CHAIN_REACTION') {
    // N1 slice 1 (goals doc N1b item 3): the Witch's DEFINING move — an AIMED
    // chain cast at the nearest target. Unlike FROST_NOVA the player is not
    // the zone, so an empty field means the cast never happens: no spend, no
    // cooldown (the gates above already paid — refund them).
    const first = nearestEnemy(state, p.x, p.y);
    if (!first) {
      p.mana += skillManaCost(id, state);
      p.skillCd[id] = 0;
      return false;
    }
    // The burst: more jumps, longer reach and gentler falloff than her gun
    // (WEAPONS.ZAP 3/90/0.75 — config pins the exceed-on-every-axis rule).
    // Per strike: flat + a fraction of weapon damage (the boom shape), times
    // FALLOFF^j with the PRIMARY at full strength, exactly like the gun's
    // baseDmg * FALLOFF^(j+1) convention.
    const perHit = def.DAMAGE + def.DAMAGE_FRAC * (p.stats.damage || 0);
    const points = [{ x: p.x, y: p.y }];
    const hitSet = new Set();
    let head = first;
    for (let j = 0; head && j <= def.JUMPS; j++) {
      hitSet.add(head);
      points.push({ x: head.x, y: head.y });
      head.hp -= perHit * Math.pow(def.FALLOFF, j);
      head.flash = 0.08;
      // FROST_NOVA's slow moved ONTO the chain: every enemy the chain
      // TOUCHES takes it (main.js's speed math reads the same constants).
      head.slow = def.SLOW;
      // Every enemy the chain KILLS detonates — flagged here, PAID and fired
      // by the death pass through boomBlast (the ONE blast: the same numbers
      // as the draftable card, 6 mana per detonation, dry fallback when the
      // pool cannot pay). Flag-not-fire keeps a rewrite-holding Witch to
      // exactly one detonation per corpse.
      if (head.hp <= 0) head.chainBoom = true;
      const from = head;
      head = nearestEnemy(state, from.x, from.y, hitSet);
      if (head && Math.hypot(head.x - from.x, head.y - from.y) > def.CHAIN_RANGE) head = null;
    }
    state.effects.push({ kind: 'zap', points, age: 0, ttl: 0.25 });
  }
  return true;
}

// Drink a potion ('hp' | 'mp'). Returns true if consumed.
// Kind validation comes FIRST: `p.potions[kind]` is undefined for an unknown
// kind and `undefined <= 0` is false, so the old count guard fell straight
// through into the else (MANA) branch and silently spent a mana potion,
// reporting success. Unknown kinds now return false with zero mutation.
export function usePotion(state, kind) {
  const p = state.player;
  if (kind !== 'hp' && kind !== 'mp') return false;
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

// NOTE (wave-25): the old `rollDrop(x, y)` export was removed — nothing ever
// called it. main.js rolls the potion drop inline on the kill path (it has to:
// the chance carries the Scavenger dropBonus stat and Alchemist's Blessing's
// dropChanceMult curse), so a second base-config-only roll here was dead code
// that invited a divergent duplicate. If a shared primitive is wanted later,
// it must take those two modifiers and main.js must call it.
