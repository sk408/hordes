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
// N1 slice 3: the Rogue's AFTERIMAGE phantoms detonate through the ONE blast
// path (rewrites.js owns it — the same application loop the death pass uses).
import { applyBlast } from './rewrites.js';

// Try to fire a skill ('FROST_NOVA' | 'OVERCHARGE' | 'CHAIN_REACTION' | one
// of the N1 slice 3 ults). Returns true if fired.
// An unknown / missing id fails the same way an unknown potion kind does
// (return false, no state touched) instead of throwing a TypeError on
// `def.MANA` — see usePotion for the shared contract.
export function useSkill(state, id) {
  const p = state.player;
  const def = C.SKILLS[id];
  if (!def) return false;   // unknown id: fail, never throw
  // N1 slice 3, SUPERSEDED 2026-09-17 (owner: "player ults must cost a
  // significant amount of mana"): a kill-charged ult (a def with KILLS) is
  // charged in KILLS and PRICED in MANA. The gate is charge AND the cooldown
  // floor AND the pool (ultCharge.ready reads all three); a refused cast
  // spends nothing; a paid cast spends exactly skillManaCost ONCE and then
  // banks KILLS kills on the player. A hypothetical def with KILLS and no
  // MANA key prices at 0 through the same helper (never NaN).
  if (def.KILLS != null) {
    const u = ultCharge(state, id);
    if (!u.ready) return false;
    p.mana -= u.manaCost;
    p.ultSpent = p.ultSpent || {};
    p.ultSpent[id] = (p.ultSpent[id] || 0) + def.KILLS;
    p.skillCd[id] = skillCooldown(id, state);
    return castUlt(state, id, def);
  }
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

// ---------- N1 slice 3: the three kill-charged, NON-mana ults ----------------
// (docs/briefs/N1_ULTS_SPECS.md — the pilot's authoritative content.) Shared
// contract: charge comes from the LIVE kill counter p.kills minus the kills
// banked by earlier casts (p.ultSpent, run-local — a fresh makePlayer per run
// resets it, and state.wave.startKills is never read, so a wave roll-over can
// neither reset nor leak the charge). READY only at charge >= KILLS AND the
// cooldown floor elapsed. All state lives on the PLAYER for that auto-reset.

/** True when id is one of the slice-3 ults (a skill def carrying KILLS). */
export function isUlt(id) {
  const def = C.SKILLS[id];
  return !!(def && def.KILLS != null);
}

/**
 * The live charge state of an ult, or null for a non-ult id. Every readout
 * (tc-q badge, text HUD, AUTO-cast gate) reads THIS so they cannot disagree.
 * 2026-09-17: readiness now includes the MANA price — an ult the pool cannot
 * afford is NOT ready, so every control that reads `ready` shows unavailable
 * until the pool recovers (manaCost/mana are carried for the LOW readouts).
 */
export function ultCharge(state, id) {
  const def = C.SKILLS[id];
  if (!def || def.KILLS == null) return null;
  const p = state.player;
  const spent = (p.ultSpent && p.ultSpent[id]) || 0;
  const charge = Math.min(def.KILLS, Math.max(0, (p.kills || 0) - spent));
  const cooldown = (p.skillCd && p.skillCd[id]) || 0;
  const manaCost = def.MANA != null ? skillManaCost(id, state) : 0;
  return {
    charge, need: def.KILLS, cooldown, manaCost, mana: p.mana,
    ready: charge >= def.KILLS && cooldown <= 0 && p.mana >= manaCost,
  };
}

// The three casts. Gates are already paid by useSkill (charge banked, floor
// rolled on); each branch only lands its effect. Draw effects ride the
// EXISTING state.effects path — 'nova' / 'rewrite_boom' are already rendered.
function castUlt(state, id, def) {
  const p = state.player;
  if (id === 'EARTHSHATTER') {
    // KNIGHT: one radial shockwave centred on the player (the player IS the
    // target zone, like FROST_NOVA's loop) + the FORTIFY rider. p.fortify
    // ticks in updateResources; main.js's damageTakenFortified reads it.
    const dmg = def.DAMAGE + def.DAMAGE_MAXHP * (p.stats.maxHp || 0);
    for (const e of state.enemies) {
      if (e.hp <= 0) continue;
      if (Math.hypot(e.x - p.x, e.y - p.y) <= def.RADIUS) {
        e.hp -= dmg;
        e.flash = 0.08;
      }
    }
    p.fortify = def.FORTIFY_TIME;
    state.effects.push({ kind: 'nova', x: p.x, y: p.y, age: 0, ttl: 0.5, radius: def.RADIUS });
    return true;
  }
  if (id === 'AFTERIMAGE') {
    // ROGUE: the window opens; updateUlts pays the phantom detonations on
    // TICK and main.js's runController applies SPEED_MULT while it lives.
    // Movement stays the controller's — no dash, no teleport. Detonations are
    // SCHEDULED (elapsed-time slots, counted in afterimageTicks) so the count
    // is DURATION/TICK exactly at ANY dt — a float-undershoot on the last
    // frame can never drop the final phantom.
    p.buffs.afterimage = def.DURATION;
    p.afterimageAcc = 0;
    p.afterimageTicks = 0;
    return true;
  }
  if (id === 'CONSECRATION') {
    // PALADIN: ONE persistent field at the densest cluster (the live enemy
    // with the most neighbours inside the field's own radius), falling back
    // to the player's position on an empty field. The field object lives on
    // the player; updateUlts ticks it, main.js's kill pass banks the heals.
    // Ticks are scheduled like AFTERIMAGE's (f.elapsed / f.ticks): exactly
    // DURATION/TICK ticks per field at any dt.
    let cx = p.x, cy = p.y, best = 0;
    for (const e of state.enemies) {
      if (e.hp <= 0) continue;
      let n = 0;
      for (const o of state.enemies) {
        if (o.hp <= 0) continue;
        if (Math.hypot(o.x - e.x, o.y - e.y) <= def.RADIUS) n++;
      }
      if (n > best) { best = n; cx = e.x; cy = e.y; }
    }
    p.consecField = { x: cx, y: cy, radius: def.RADIUS, t: def.DURATION,
      elapsed: 0, ticks: 0, healAcc: 0 };
    state.effects.push({ kind: 'nova', x: cx, y: cy, age: 0, ttl: def.DURATION, radius: def.RADIUS });
    return true;
  }
  return false;   // a KILLS def with no branch: fail loud, never half-cast
}

/**
 * Per-frame ult windows, called from BOTH resource seams (update /
 * updateFinale, beside autoCastSkills) so finale frames tick too. Everything
 * here is time-based and dt-scaled: 60Hz and 120Hz pay identically.
 */
export function updateUlts(state, dt) {
  const p = state.player;
  // AFTERIMAGE: a phantom detonates at her CURRENT position every TICK
  // seconds through the ONE blast path. Scheduled by elapsed slots (not an
  // accumulator minus loop) so exactly DURATION/TICK detonations fire per
  // window at 60Hz and 120Hz alike; the speed window (buffs.afterimage)
  // still lapses on its own dt-scaled timer.
  if (p.buffs.afterimage > 0 || (p.afterimageTicks || 0) > 0) {
    const def = C.SKILLS.AFTERIMAGE;
    const maxTicks = Math.round(def.DURATION / def.TICK);
    p.afterimageAcc = (p.afterimageAcc || 0) + dt;
    while ((p.afterimageTicks || 0) < maxTicks &&
        p.afterimageAcc >= (p.afterimageTicks + 1) * def.TICK) {
      p.afterimageTicks++;
      applyBlast(state, p.x, p.y, {
        radius: def.RADIUS,
        damage: def.DAMAGE + def.DAMAGE_WEAPON * (p.stats.damage || 0),
      });
    }
    p.buffs.afterimage = Math.max(0, p.buffs.afterimage - dt);
  }
  // CONSECRATION: discrete scheduled TICKs. Per tick: DPS*TICK damage to
  // every enemy inside, then the banked heal is paid CAPPED at the field's
  // own tick rate (DPS*TICK HP — my settled reading of "capped per tick to
  // the field's own tick rate": the cap equals one tick of its damage, and
  // excess bank is DROPPED at the tick), so it can never out-heal a boss.
  // Kills inside are banked by main.js's kill pass (healAcc), which sees
  // every corpse — a field-tick kill included.
  const f = p.consecField;
  if (f) {
    const def = C.SKILLS.CONSECRATION;
    const maxTicks = Math.round(def.DURATION / def.TICK);
    f.elapsed += dt;
    f.t = Math.max(0, def.DURATION - f.elapsed);
    while (f.ticks < maxTicks && f.elapsed >= (f.ticks + 1) * def.TICK) {
      f.ticks++;
      const tickDmg = def.DPS * def.TICK;
      for (const e of state.enemies) {
        if (e.hp <= 0) continue;
        if (Math.hypot(e.x - f.x, e.y - f.y) <= f.radius) {
          e.hp -= tickDmg;
          e.flash = 0.08;
        }
      }
      const heal = Math.min(f.healAcc, def.DPS * def.TICK);
      if (heal > 0) p.hp = Math.min(p.stats.maxHp, p.hp + heal);
      f.healAcc = 0;
    }
    if (f.ticks >= maxTicks) p.consecField = null;
  }
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
  // N1 slice 3: EARTHSHATTER's FORTIFY rider ticks here beside the other
  // buff timers (NOT p.invuln — FORTIFY halves damage, it grants no i-frames).
  if (p.fortify > 0) p.fortify = Math.max(0, p.fortify - dt);
}

// NOTE (wave-25): the old `rollDrop(x, y)` export was removed — nothing ever
// called it. main.js rolls the potion drop inline on the kill path (it has to:
// the chance carries the Scavenger dropBonus stat and Alchemist's Blessing's
// dropChanceMult curse), so a second base-config-only roll here was dead code
// that invited a divergent duplicate. If a shared primitive is wanted later,
// it must take those two modifiers and main.js must call it.
