// HORDES — weapon variety module (self-contained; NOT yet wired into main.js).
// Four archetypes beyond the stock nearest-enemy volley. Each is driven by the
// SAME player stats the upgrade draft levels up:
//   damage  -> p.stats.damage   (scaled per-weapon via DAMAGE_MULT)
//   rate    -> p.stats.cooldown (mapped relative to the stock CONFIG.WEAPON.COOLDOWN)
//   multi   -> p.stats.projectiles (ORBIT blade count, BOOMERANG count)
//   pierce  -> p.stats.pierce   (extra BOOMERANG re-hit allowance on return)
//   overcharge buff is respected (same RATE_MULT as the volley in main.js).
//
// Contract: update(state, weapon, dt) — reads state, mutates
// state.enemies (hp/flash), state.projectiles (boomerang bodies) and
// state.effects (transient fillRect-friendly visuals). NO input, NO DOM.
// Targeting is deterministic (nearest-first scans in array order); the ONE
// Math.random call site is the per-hit crit roll (see critRoll below),
// which is neutral (never fires) when stats.crit is absent/0 — headless
// tests stay deterministic by default. Kills are NOT spliced here; the
// main loop already turns hp<=0 enemies into gems/drops, and that stays
// its job.
//
// LOOT/META AFFIX WIRING: update paths consume the run stat fields the
// loot/meta systems put on player.stats (loot.js STAT_DEFAULTS contract):
//   damageMult — multiplicative on ALL weapon damage (matches the volley's
//                volleyDmgMult in main.js, so DPS scaling feels consistent)
//   rateMult   — multiplicative on attack rate: cooldowns DIVIDE by it
//                (same convention main.js uses for the volley)
//   crit       — 0..1 chance, rolled PER HIT (Math.random; see critRoll)
//   critMult   — damage multiplier on a crit hit (default 1.5 when absent)
// Missing fields are neutral (damageMult/rateMult/critMult absent => no
// change; crit absent => never crits) — pure-testable defaults.
//
// Boomerang bodies live in state.projectiles tagged kind:'boomerang' with no
// vx/vy — the integrator must skip kind-tagged projectiles in the generic
// volley update loop and let weapons.update() own their motion instead.
//
// Visual payload (effects): every effect is a plain { kind, x, y, age, ttl }
// (+ radius / points where relevant) so the renderer can draw each with a
// handful of fillRects. Orbit blades also emit short-ttl 'orbit' dots each
// frame; zap pushes one 'zap' polyline (points list); nova pushes an
// expanding 'nova_pulse' ring.

import { CONFIG as C } from './config.js';

// ---------- Tuning constants (kept HERE, not in config.js — no collisions) ----------
export const WEAPONS = {
  ORBIT: {
    NAME: 'Orbit Blade',
    SPIN: 3.2,          // rad/s blade angular speed
    RADIUS: 40,         // orbit radius around the player
    DAMAGE_MULT: 0.8,   // scaled by p.stats.damage
    TICK: 0.5,          // per-enemy contact damage tick cooldown (s)
    HIT_R: 9,           // blade-vs-enemy contact box (px, like main's 7 + blade 4)
  },
  BOOMERANG: {
    NAME: 'Boomerang',
    SPEED: 240,         // px/s
    RANGE: 120,         // outbound travel distance before returning
    DAMAGE_MULT: 1.0,
    COOLDOWN: 1.6,      // base seconds between throws (before rate scaling)
    HIT_R: 9,
  },
  ZAP: {
    NAME: 'Chain Zap',
    COOLDOWN: 1.4,
    DAMAGE_MULT: 1.0,
    JUMPS: 3,           // extra enemies hit after the primary target
    CHAIN_RANGE: 90,    // max jump distance between chained enemies
    FALLOFF: 0.75,      // damage multiplier per jump
  },
  NOVA_PULSE: {
    NAME: 'Nova Pulse',
    COOLDOWN: 3.0,
    RADIUS: 70,
    DAMAGE_MULT: 1.2,
  },
  // ---- wave-2 archetypes (rich animation payloads) ----
  SCYTHE: {
    NAME: 'Scythe',
    COOLDOWN: 1.3,      // seconds between swings (before rate scaling)
    RANGE: 55,          // sweep radius from the player
    ARC: 1.0,           // full sweep width, radians (levels widen it)
    DAMAGE_MULT: 1.3,
    WINDUP: 0.18,       // brief telegraph before the arc lands
  },
  SEEKER: {
    NAME: 'Seeker',
    COOLDOWN: 1.8,
    SPEED: 150,         // missile px/s
    TURN: 3.2,          // rad/s homing turn rate (weak by design — dodgeable)
    DAMAGE_MULT: 0.9,
    HIT_R: 8,
    LIFE: 4,            // seconds before a lost missile fizzles
    TRAIL: 12,          // trail points kept per missile (render polyline)
  },
  MINE: {
    NAME: 'Mine Layer',
    COOLDOWN: 1.5,      // drop cadence while the auto-mover walks
    DAMAGE_MULT: 1.4,
    TRIGGER_R: 20,      // enemy within this radius sets the mine off
    BLAST: 45,          // detonation AoE radius (levels grow it)
    LIFETIME: 12,       // untriggered mines despawn quietly
    MAX_MINES: 6,       // oldest mine despawns when the trail exceeds this
    SHRAPNEL: 8,        // detonation shrapnel dots (animation payload)
  },
  BEAM: {
    NAME: 'Beam',
    COOLDOWN: 4.0,      // long cooldown, big piercing payoff
    LENGTH: 240,
    WIDTH: 10,          // beam thickness (levels widen it)
    DAMAGE_MULT: 2.0,
    SWEEP: 0.25,        // rad the visual sweep wiggles either side of dir
  },
};

// ---------- Weapon instance ----------
// Creates a fresh per-run weapon: `cd` = seconds until next fire,
// `level` = 1..WEAPON_MAX_LEVEL (see leveling section below), `xp` = banked
// weapon XP, `angle` = orbit phase, `ticks` = per-enemy contact cooldown map,
// `payload` = render data the integrator may read directly.
export function makeWeapon(type) {
  return { type, level: 1, xp: 0, cd: 0, angle: 0, ticks: new Map(), payload: { blades: [] } };
}

// ---------- Shared helpers (deterministic) ----------
function rateScale(p) {
  // Map the player's leveled cooldown onto this weapon: 1.0 at stock speed.
  // rateMult (loot Rapid Trigger etc.) DIVIDES the interval — the same
  // convention hb1's volley loop uses: cooldown * overcharge / rateMult.
  const overcharge = p.buffs && p.buffs.overcharge > 0 ? C.SKILLS.OVERCHARGE.RATE_MULT : 1;
  return (p.stats.cooldown / C.WEAPON.COOLDOWN) * overcharge / (p.stats.rateMult || 1);
}

// Final damage multiplier from loot affixes (Brutal Edge, BERSERK, ...).
function dmgScale(p) {
  return p.stats.damageMult || 1;
}

// Per-hit crit roll -> 1 or the crit multiplier. The ONLY Math.random site
// in this module (documented above): crit 0 / absent never fires, keeping
// every other path deterministic for tests.
function critRoll(p) {
  const s = p.stats;
  if (!s.crit || s.crit <= 0) return 1;
  return Math.random() < s.crit ? (s.critMult || 1.5) : 1;
}

function nearestEnemy(state, x, y, exclude) {
  let best = null, bestD = Infinity;
  for (const e of state.enemies) {
    if (e.hp <= 0 || (exclude && exclude.has(e))) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d < bestD) { bestD = d; best = e; }   // first-found wins ties: deterministic
  }
  return best;
}

function hurt(e, dmg) {
  e.hp -= dmg;
  e.flash = 0.08;
}

// ---------- ORBIT: blades circling the player, damage on contact ----------
function updateOrbit(state, weapon, dt) {
  const W = WEAPONS.ORBIT;
  const P = weaponLevelParams('ORBIT', weapon.level);
  const radius = P.radius || W.RADIUS;
  const p = state.player;
  weapon.angle += W.SPIN * dt;
  const n = Math.max(1, (P.blades || 1) + p.stats.projectiles - 1);  // Split Shot still adds blades
  const blades = [];
  for (let i = 0; i < n; i++) {
    const a = weapon.angle + (i / n) * Math.PI * 2;
    blades.push({ x: p.x + Math.cos(a) * radius, y: p.y + Math.sin(a) * radius });
  }
  weapon.payload.blades = blades;

  // Per-enemy tick cooldowns tick down.
  for (const [e, t] of weapon.ticks) {
    const nt = t - dt;
    if (nt <= 0 || e.hp <= 0) weapon.ticks.delete(e); else weapon.ticks.set(e, nt);
  }

  for (const b of blades) {
    for (const e of state.enemies) {
      if (e.hp <= 0 || weapon.ticks.has(e)) continue;
      if (Math.abs(b.x - e.x) < W.HIT_R && Math.abs(b.y - e.y) < W.HIT_R) {
        hurt(e, p.stats.damage * W.DAMAGE_MULT * (P.dmgMult || 1) * dmgScale(p) * critRoll(p));
        weapon.ticks.set(e, W.TICK);
        state.effects.push({ kind: 'orbit_hit', x: e.x, y: e.y, age: 0, ttl: 0.1 });
      }
    }
  }

  // Persistent-ish blade dots (short ttl so the existing effects filter reaps them).
  for (const b of blades) state.effects.push({ kind: 'orbit', x: b.x, y: b.y, age: 0, ttl: 0.08 });
}

// ---------- BOOMERANG: throws at the nearest enemy, pierces all, returns ----------
function updateBoomerang(state, weapon, dt) {
  const W = WEAPONS.BOOMERANG;
  const P = weaponLevelParams('BOOMERANG', weapon.level);
  const speed = W.SPEED * (P.speedMult || 1);   // level: faster out AND back
  const p = state.player;
  weapon.cd -= dt;
  if (weapon.cd <= 0) {
    const target = nearestEnemy(state, p.x, p.y);
    if (target) {
      weapon.cd = W.COOLDOWN * rateScale(p);
      const a = Math.atan2(target.y - p.y, target.x - p.x);
      const n = Math.max(1, p.stats.projectiles);   // Split Shot = fan of boomerangs
      for (let i = 0; i < n; i++) {
        const spread = (i - (n - 1) / 2) * 0.25;
        state.projectiles.push({
          kind: 'boomerang',
          x: p.x, y: p.y,
          dx: Math.cos(a + spread), dy: Math.sin(a + spread),
          dist: 0, phase: 'out',
          damage: p.stats.damage * W.DAMAGE_MULT * (P.dmgMult || 1) * dmgScale(p),
          pierce: p.stats.pierce + (P.pierceBonus || 0),   // extra re-hit allowance on the return leg
          hit: new Set(),
          age: 0,
        });
      }
    } else {
      weapon.cd = 0;   // fires the instant a target exists
    }
  }

  // Move/pierce/return all live boomerang bodies; splice caught ones.
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const pr = state.projectiles[i];
    if (pr.kind !== 'boomerang') continue;
    pr.age += dt;
    if (pr.phase === 'out') {
      const step = speed * dt;
      pr.x += pr.dx * step; pr.y += pr.dy * step; pr.dist += step;
      if (pr.dist >= W.RANGE) {
        pr.phase = 'back';
        pr.hit.clear();   // return leg can re-hit everything once (+pierce extras)
      }
    } else {
      const dx = p.x - pr.x, dy = p.y - pr.y;
      const len = Math.hypot(dx, dy) || 1;
      const step = speed * dt;
      pr.x += (dx / len) * step; pr.y += (dy / len) * step;
      if (len < 12) pr.age = 99;   // caught: remove
    }
    for (const e of state.enemies) {
      if (pr.hit.has(e) || e.hp <= 0) continue;
      if (Math.abs(pr.x - e.x) < W.HIT_R && Math.abs(pr.y - e.y) < W.HIT_R) {
        hurt(e, pr.damage * critRoll(p));   // crit rolled per contact hit
        pr.hit.add(e);
      }
    }
    if (pr.age >= 99) state.projectiles.splice(i, 1);
  }
}

// ---------- ZAP: chain lightning, primary target + 3 nearest-jump neighbors ----------
function updateZap(state, weapon, dt) {
  const W = WEAPONS.ZAP;
  const P = weaponLevelParams('ZAP', weapon.level);
  const jumps = P.jumps || W.JUMPS;
  const p = state.player;
  const baseDmg = p.stats.damage * W.DAMAGE_MULT * (P.dmgMult || 1) * dmgScale(p);
  weapon.cd -= dt;
  if (weapon.cd > 0) return;
  const primary = nearestEnemy(state, p.x, p.y);
  if (!primary) { weapon.cd = 0; return; }
  weapon.cd = W.COOLDOWN * rateScale(p);

  const points = [{ x: p.x, y: p.y }];
  const hitSet = new Set([primary]);
  hurt(primary, baseDmg * critRoll(p));
  points.push({ x: primary.x, y: primary.y });

  let from = primary;
  for (let j = 0; j < jumps; j++) {
    const next = nearestEnemy(state, from.x, from.y, hitSet);
    if (!next || Math.hypot(next.x - from.x, next.y - from.y) > W.CHAIN_RANGE) break;
    hurt(next, baseDmg * critRoll(p) * Math.pow(W.FALLOFF, j + 1));
    hitSet.add(next);
    points.push({ x: next.x, y: next.y });
    from = next;
  }

  state.effects.push({ kind: 'zap', points, age: 0, ttl: 0.15 });
}

// ---------- NOVA_PULSE: periodic AoE ring from the player, no aiming ----------
function updateNovaPulse(state, weapon, dt) {
  const W = WEAPONS.NOVA_PULSE;
  const P = weaponLevelParams('NOVA_PULSE', weapon.level);
  const radius = P.radius || W.RADIUS;
  const p = state.player;
  weapon.cd -= dt;
  if (weapon.cd > 0) return;
  weapon.cd = W.COOLDOWN * rateScale(p);
  const dmg = p.stats.damage * W.DAMAGE_MULT * (P.dmgMult || 1) * dmgScale(p);
  for (const e of state.enemies) {
    if (e.hp <= 0) continue;
    if (Math.hypot(e.x - p.x, e.y - p.y) <= radius) hurt(e, dmg * critRoll(p));
  }
  state.effects.push({ kind: 'nova_pulse', x: p.x, y: p.y, radius, age: 0, ttl: 0.3 });
}

// ---------- SCYTHE: sweeping arc melee toward the volley target, windup first
function angleDiff(a, b) {           // signed smallest a-b, in [-PI, PI]
  return ((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
}

function updateScythe(state, weapon, dt) {
  const W = WEAPONS.SCYTHE;
  const P = weaponLevelParams('SCYTHE', weapon.level);
  const arc = P.arc || W.ARC;
  const p = state.player;
  weapon.cd -= dt;

  // Windup: the telegraphed swing already committed last tick.
  if (weapon.swing) {
    weapon.swing.t -= dt;
    state.effects.push({
      kind: 'scythe_windup', x: p.x, y: p.y, dir: weapon.swing.dir,
      radius: W.RANGE, arc, age: 0, ttl: 0.05,
    });
    if (weapon.swing.t > 0) return;
    const dir = weapon.swing.dir;
    weapon.swing = null;

    // Land the sweep: everything inside the wedge eats damage.
    const dmg = p.stats.damage * W.DAMAGE_MULT * (P.dmgMult || 1) * dmgScale(p);
    for (const e of state.enemies) {
      if (e.hp <= 0) continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d > W.RANGE) continue;
      if (Math.abs(angleDiff(Math.atan2(e.y - p.y, e.x - p.x), dir)) > arc / 2) continue;
      hurt(e, dmg * critRoll(p));
      state.effects.push({ kind: 'scythe_hit', x: e.x, y: e.y, age: 0, ttl: 0.15 }); // spark dot
    }
    state.effects.push({
      kind: 'scythe_arc', x: p.x, y: p.y, dir, radius: W.RANGE, arc, age: 0, ttl: 0.25,
    });
    return;
  }

  if (weapon.cd > 0) return;
  const target = nearestEnemy(state, p.x, p.y);
  if (!target) { weapon.cd = 0; return; }
  weapon.cd = W.COOLDOWN * rateScale(p);
  // Sweep in the direction the volley would fire (nearest threat).
  weapon.swing = { dir: Math.atan2(target.y - p.y, target.x - p.x), t: W.WINDUP };
  state.effects.push({
    kind: 'scythe_windup', x: p.x, y: p.y, dir: weapon.swing.dir,
    radius: W.RANGE, arc, age: 0, ttl: 0.05,
  });
}

// ---------- SEEKER: weak-turn homing missiles that retarget on kill --------
function updateSeeker(state, weapon, dt) {
  const W = WEAPONS.SEEKER;
  const P = weaponLevelParams('SEEKER', weapon.level);
  const count = P.count || 1;
  const turn = (P.turn || W.TURN) * dt;      // max radians this frame
  const p = state.player;
  weapon.cd -= dt;
  if (weapon.cd <= 0) {
    weapon.cd = W.COOLDOWN * rateScale(p);
    const target = nearestEnemy(state, p.x, p.y);
    const base = target ? Math.atan2(target.y - p.y, target.x - p.x) : weapon.angle || 0;
    weapon.angle = base;
    for (let i = 0; i < count; i++) {
      const spread = (i - (count - 1) / 2) * 0.5;
      state.projectiles.push({
        kind: 'seeker',
        x: p.x, y: p.y,
        ang: base + spread,
        target,                               // may die mid-flight -> retarget
        damage: p.stats.damage * W.DAMAGE_MULT * dmgScale(p),
        age: 0, trail: [],
      });
    }
  }

  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const pr = state.projectiles[i];
    if (pr.kind !== 'seeker') continue;
    pr.age += dt;
    if (pr.age >= W.LIFE) {
      state.effects.push({ kind: 'seeker_pop', x: pr.x, y: pr.y, age: 0, ttl: 0.12 });
      state.projectiles.splice(i, 1);
      continue;
    }
    // Retarget when the mark dies (nearest-first: deterministic).
    if (!pr.target || pr.target.hp <= 0) pr.target = nearestEnemy(state, pr.x, pr.y);
    if (pr.target) {
      const want = Math.atan2(pr.target.y - pr.y, pr.target.x - pr.x);
      const diff = angleDiff(want, pr.ang);
      pr.ang += Math.max(-turn, Math.min(turn, diff));
    }
    pr.x += Math.cos(pr.ang) * W.SPEED * dt;
    pr.y += Math.sin(pr.ang) * W.SPEED * dt;

    // Animation payload: per-frame trail-dot effects carrying the polyline.
    pr.trail.push({ x: pr.x, y: pr.y });
    if (pr.trail.length > W.TRAIL) pr.trail.shift();
    state.effects.push({ kind: 'seeker_trail', x: pr.x, y: pr.y, points: [...pr.trail], age: 0, ttl: 0.15 });

    for (const e of state.enemies) {
      if (e.hp <= 0) continue;
      if (Math.abs(pr.x - e.x) < W.HIT_R && Math.abs(pr.y - e.y) < W.HIT_R) {
        hurt(e, pr.damage * critRoll(p));   // crit rolled per impact
        state.effects.push({ kind: 'seeker_pop', x: pr.x, y: pr.y, age: 0, ttl: 0.12 });
        state.projectiles.splice(i, 1);
        break;
      }
    }
  }
}

// ---------- MINE: proximity mines dropped behind the walking player --------
function detonateMine(state, mine, blast, dmg, p) {
  for (const e of state.enemies) {
    if (e.hp <= 0) continue;
    if (Math.hypot(e.x - mine.x, e.y - mine.y) <= blast) {
      hurt(e, dmg * critRoll(p));   // crit rolled per blast victim
      state.effects.push({ kind: 'mine_hit', x: e.x, y: e.y, age: 0, ttl: 0.12 }); // spark dot
    }
  }
  // Rich blast payload: expanding ring + deterministic shrapnel dots the
  // renderer can fly outward using (age / ttl).
  state.effects.push({ kind: 'mine_blast', x: mine.x, y: mine.y, radius: blast, shrapnel: WEAPONS.MINE.SHRAPNEL, age: 0, ttl: 0.35 });
  for (let i = 0; i < WEAPONS.MINE.SHRAPNEL; i++) {
    state.effects.push({
      kind: 'mine_shrap', x: mine.x, y: mine.y,
      ang: (i / WEAPONS.MINE.SHRAPNEL) * Math.PI * 2, dist: blast * 0.9,
      age: 0, ttl: 0.3,
    });
  }
}

function updateMine(state, weapon, dt) {
  const W = WEAPONS.MINE;
  const P = weaponLevelParams('MINE', weapon.level);
  const blast = P.blast || W.BLAST;
  const p = state.player;
  weapon.cd -= dt;
  if (weapon.cd <= 0) {
    weapon.cd = W.COOLDOWN * rateScale(p);
    state.projectiles.push({ kind: 'mine', x: p.x, y: p.y, age: 0 });
    // Cap the trail: the auto-mover drops a path, not a carpet.
    let mines = 0;
    for (let i = state.projectiles.length - 1; i >= 0; i--) {
      if (state.projectiles[i].kind !== 'mine') continue;
      if (++mines > W.MAX_MINES) {
        state.effects.push({ kind: 'mine_fizzle', x: state.projectiles[i].x, y: state.projectiles[i].y, age: 0, ttl: 0.15 });
        state.projectiles.splice(i, 1);
      }
    }
  }

  const dmg = p.stats.damage * W.DAMAGE_MULT * (P.dmgMult || 1) * dmgScale(p);
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const mine = state.projectiles[i];
    if (mine.kind !== 'mine') continue;
    mine.age += dt;
    if (mine.age >= W.LIFETIME) {
      state.effects.push({ kind: 'mine_fizzle', x: mine.x, y: mine.y, age: 0, ttl: 0.15 });
      state.projectiles.splice(i, 1);
      continue;
    }
    for (const e of state.enemies) {
      if (e.hp <= 0) continue;
      if (Math.hypot(e.x - mine.x, e.y - mine.y) <= W.TRIGGER_R) {
        detonateMine(state, mine, blast, dmg, p);
        state.projectiles.splice(i, 1);
        break;
      }
    }
  }
}

// ---------- BEAM: piercing laser along the volley direction, long cd -------
function updateBeam(state, weapon, dt) {
  const W = WEAPONS.BEAM;
  const P = weaponLevelParams('BEAM', weapon.level);
  const width = P.width || W.WIDTH;
  const p = state.player;
  weapon.cd -= dt;
  if (weapon.cd > 0) return;
  const target = nearestEnemy(state, p.x, p.y);
  if (!target) { weapon.cd = 0; return; }
  weapon.cd = W.COOLDOWN * rateScale(p);
  weapon.fires = (weapon.fires || 0) + 1;

  const dir = Math.atan2(target.y - p.y, target.x - p.x);
  const cx = Math.cos(dir), cy = Math.sin(dir);
  const dmg = p.stats.damage * W.DAMAGE_MULT * (P.dmgMult || 1) * dmgScale(p);
  for (const e of state.enemies) {
    if (e.hp <= 0) continue;
    const rx = e.x - p.x, ry = e.y - p.y;
    const along = rx * cx + ry * cy;          // projection on the beam axis
    if (along < 0 || along > W.LENGTH) continue;
    if (Math.abs(rx * cy - ry * cx) > width / 2) continue;   // perpendicular distance
    hurt(e, dmg * critRoll(p));               // crit rolled per beam victim
    state.effects.push({ kind: 'beam_hit', x: e.x, y: e.y, age: 0, ttl: 0.15 }); // spark dot
  }
  // Rich beam payload: sweep envelope (render lerps dir-from -> dir-to),
  // thickness, and a deterministic flicker phase so each beam strobes
  // differently (no Math.random).
  state.effects.push({
    kind: 'beam', x: p.x, y: p.y,
    dir, from: dir - W.SWEEP, to: dir + W.SWEEP,
    len: W.LENGTH, width, phase: weapon.fires * 1.7,
    age: 0, ttl: 0.35,
  });
}

// ---------- Registry ----------
export const WEAPON_TYPES = {
  ORBIT:      { id: 'ORBIT',      name: WEAPONS.ORBIT.NAME,      update: updateOrbit },
  BOOMERANG:  { id: 'BOOMERANG',  name: WEAPONS.BOOMERANG.NAME,  update: updateBoomerang },
  ZAP:        { id: 'ZAP',        name: WEAPONS.ZAP.NAME,        update: updateZap },
  NOVA_PULSE: { id: 'NOVA_PULSE', name: WEAPONS.NOVA_PULSE.NAME, update: updateNovaPulse },
  SCYTHE:     { id: 'SCYTHE',     name: WEAPONS.SCYTHE.NAME,     update: updateScythe },
  SEEKER:     { id: 'SEEKER',     name: WEAPONS.SEEKER.NAME,     update: updateSeeker },
  MINE:       { id: 'MINE',       name: WEAPONS.MINE.NAME,       update: updateMine },
  BEAM:       { id: 'BEAM',       name: WEAPONS.BEAM.NAME,       update: updateBeam },
};

// Convenience: update every weapon in a list (integration entry point).
export function updateWeapons(state, weapons, dt) {
  for (const w of weapons) {
    const def = WEAPON_TYPES[w.type];
    if (def) def.update(state, w, dt);
  }
}

// ==========================================================================
// PER-WEAPON LEVELING (megabonk-style, Sk408 playtest)
// Each weapon instance carries a level (1..WEAPON_MAX_LEVEL). Levels come
// from draft cards for now (levelUpWeapon) and/or weapon XP fed by a later
// integration (collectWeaponXp). WEAPON_LEVELS is the AUTHORITATIVE table:
// entry[L-1].effects holds the CUMULATIVE parameters at level L — the update
// functions above multiply their base math by these, so a level actually
// changes the weapon's behavior, not just a number.
// VOLLEY is included for the base volley in main.js (it has no instance
// here); the integrator reads weaponLevelParams('VOLLEY', level) and applies
// effects.dmgMult / effects.proj to the volley fire loop.
// ==========================================================================
export const WEAPON_MAX_LEVEL = 8;

export const WEAPON_NAMES = {
  VOLLEY: 'Volley',
  ORBIT: WEAPONS.ORBIT.NAME,
  BOOMERANG: WEAPONS.BOOMERANG.NAME,
  ZAP: WEAPONS.ZAP.NAME,
  NOVA_PULSE: WEAPONS.NOVA_PULSE.NAME,
  SCYTHE: WEAPONS.SCYTHE.NAME,
  SEEKER: WEAPONS.SEEKER.NAME,
  MINE: WEAPONS.MINE.NAME,
  BEAM: WEAPONS.BEAM.NAME,
};

function buildLevels(count, step) {
  // step(L, ctx) mutates ctx cumulatively and returns this level's label.
  const ctx = {};
  const rows = [];
  for (let L = 1; L <= count; L++) {
    const label = step(L, ctx);
    rows.push({ level: L, label, effects: { ...ctx } });
  }
  return rows;
}

export const WEAPON_LEVELS = {
  // VOLLEY is leveled here but FIRED by main.js, which caps total projectiles
  // at CONFIG.WEAPON.MAX_PROJECTILES=3 and converts each "+1 projectile"
  // grant into +20% damage instead — so the Lv3/Lv6 labels say that. The
  // proj DATA is kept (+1 at Lv3/Lv6) because main.js reads it for the
  // damage conversion (1 + 0.2 * proj).
  VOLLEY: buildLevels(WEAPON_MAX_LEVEL, (L, c) => {
    if (L === 1) { c.dmgMult = 1; c.proj = 0; return 'Base volley'; }
    if (L === 3 || L === 6) { c.proj += 1; return '+20% damage'; }
    c.dmgMult += 0.2;
    return '+20% damage';
  }),
  // +1 blade every even level, +radius and +15% damage every level past 1.
  ORBIT: buildLevels(WEAPON_MAX_LEVEL, (L, c) => {
    c.blades = 1 + Math.floor(L / 2);
    c.radius = WEAPONS.ORBIT.RADIUS + 4 * (L - 1);
    c.dmgMult = 1 + 0.15 * (L - 1);
    if (L === 1) return 'Base orbit blade';
    return L % 2 === 0 ? `+1 blade (total ${c.blades}), +radius, +15% damage`
                       : '+radius, +15% damage';
  }),
  // +20% damage, +12% flight speed per level; +1 pierce at Lv3/Lv5/Lv7.
  BOOMERANG: buildLevels(WEAPON_MAX_LEVEL, (L, c) => {
    c.dmgMult = 1 + 0.2 * (L - 1);
    c.speedMult = 1 + 0.12 * (L - 1);
    c.pierceBonus = Math.floor((L - 1) / 2);
    if (L === 1) return 'Base boomerang';
    return L % 2 === 1 ? '+20% damage, +12% speed, +1 pierce'
                       : '+20% damage, +12% speed';
  }),
  // +1 chain jump every even level, +15% damage every level past 1.
  ZAP: buildLevels(WEAPON_MAX_LEVEL, (L, c) => {
    c.jumps = WEAPONS.ZAP.JUMPS + Math.floor(L / 2);
    c.dmgMult = 1 + 0.15 * (L - 1);
    if (L === 1) return 'Base chain zap';
    return L % 2 === 0 ? `+1 chain (total ${c.jumps} jumps), +15% damage`
                       : '+15% damage';
  }),
  // +6 radius and +15% damage per level past 1.
  NOVA_PULSE: buildLevels(WEAPON_MAX_LEVEL, (L, c) => {
    c.radius = WEAPONS.NOVA_PULSE.RADIUS + 6 * (L - 1);
    c.dmgMult = 1 + 0.15 * (L - 1);
    return L === 1 ? 'Base nova pulse' : '+6 radius, +15% damage';
  }),
  // +0.12 rad arc width and +15% damage per level past 1.
  SCYTHE: buildLevels(WEAPON_MAX_LEVEL, (L, c) => {
    c.arc = WEAPONS.SCYTHE.ARC + 0.12 * (L - 1);
    c.dmgMult = 1 + 0.15 * (L - 1);
    return L === 1 ? 'Base scythe' : '+arc width, +15% damage';
  }),
  // +1 missile every even level, +0.4 rad/s turn per level.
  SEEKER: buildLevels(WEAPON_MAX_LEVEL, (L, c) => {
    c.count = 1 + Math.floor(L / 2);
    c.turn = WEAPONS.SEEKER.TURN + 0.4 * (L - 1);
    if (L === 1) return 'Base seeker missile';
    return L % 2 === 0 ? `+1 missile (total ${c.count}), +turn rate` : '+turn rate';
  }),
  // +20% damage and +4 blast radius per level past 1.
  MINE: buildLevels(WEAPON_MAX_LEVEL, (L, c) => {
    c.dmgMult = 1 + 0.2 * (L - 1);
    c.blast = WEAPONS.MINE.BLAST + 4 * (L - 1);
    return L === 1 ? 'Base mine layer' : '+20% damage, +4 blast radius';
  }),
  // +2 beam width and +15% damage per level past 1.
  BEAM: buildLevels(WEAPON_MAX_LEVEL, (L, c) => {
    c.width = WEAPONS.BEAM.WIDTH + 2 * (L - 1);
    c.dmgMult = 1 + 0.15 * (L - 1);
    return L === 1 ? 'Base beam' : '+2 width, +15% damage';
  }),
};

// Cumulative parameters for (weaponId, level). Clamps level to 1..MAX.
// Unknown ids get neutral params so callers can apply it blindly.
export function weaponLevelParams(weaponId, level) {
  const table = WEAPON_LEVELS[weaponId];
  if (!table) return { dmgMult: 1 };
  const lv = Math.max(1, Math.min(WEAPON_MAX_LEVEL, level || 1));
  return { ...table[lv - 1].effects };
}

// Apply the next level to a weapon INSTANCE (draft card path). Returns the
// new level, or false at the cap.
export function levelUpWeapon(weapon) {
  if (!weapon || (weapon.level || 1) >= WEAPON_MAX_LEVEL) return false;
  weapon.level = (weapon.level || 1) + 1;
  return weapon.level;
}

// Short card text for the draft UI: what LEVEL grants for weaponId.
// Returns e.g. 'Boomerang Lv4 — +20% damage, +12% speed'. Null for unknown
// ids; at the cap the label is 'MAX'.
export function describeWeaponLevel(weaponId, level) {
  const table = WEAPON_LEVELS[weaponId];
  if (!table) return null;
  const name = WEAPON_NAMES[weaponId] || weaponId;
  const lv = Math.max(1, Math.min(WEAPON_MAX_LEVEL, level || 1));
  const label = level > WEAPON_MAX_LEVEL ? 'MAX' : table[lv - 1].label;
  return `${name} Lv${Math.min(level, WEAPON_MAX_LEVEL)} — ${label}`;
}

// ---------- Weapon XP (future integration: gems/bosses feed this) ----------
// Weapons level from draft cards today; collectWeaponXp accumulates XP into
// the matching instance in state.weapons and auto-levels on threshold.
export const WEAPON_XP_BASE = 20;   // xp needed: BASE * current level

export function weaponXpNeeded(level) {
  return WEAPON_XP_BASE * (level || 1);
}

// Feed XP to every owned weapon of weaponId. Returns the number of levels
// gained (0 if none owned / under threshold / at cap). XP past the cap is
// discarded. Mutates the weapon instances, not state at large.
export function collectWeaponXp(state, weaponId, amount) {
  let gained = 0;
  for (const w of state.weapons) {
    if (w.type !== weaponId) continue;
    if ((w.level || 1) >= WEAPON_MAX_LEVEL) continue;
    w.xp = (w.xp || 0) + amount;
    while ((w.level || 1) < WEAPON_MAX_LEVEL && w.xp >= weaponXpNeeded(w.level || 1)) {
      w.xp -= weaponXpNeeded(w.level || 1);
      w.level = (w.level || 1) + 1;
      gained++;
    }
    if ((w.level || 1) >= WEAPON_MAX_LEVEL) w.xp = 0;
  }
  return gained;
}
