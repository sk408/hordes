// HORDES — the weapon archetypes beyond the Volley (main.js fires the Volley
// itself). Each is driven by the player stats the shop and the stat cards
// move, and by its own level ladder (WEAPON_LADDERS below):
//   damage  -> p.stats.damage   (scaled per-weapon via DAMAGE_MULT)
//   rate    -> p.stats.cooldown (mapped relative to the stock CONFIG.WEAPON.COOLDOWN)
//   pierce  -> p.stats.pierce   (extra BOOMERANG re-hit allowance on return)
//   counts  -> the weapon's level (blades, boomerangs, spears, bolts, rocks)
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
// ARCH BUFF WIRING (arches.js): DOUBLE_FIRE ('Attack rate x2') and BERSERK
// ('+50% damage') are MULTIPLIERS on the same two fields and are read from
// state.archBuffs through arches.activeArchMods() — the SAME source of truth
// main.js's runController consumes for the base volley and movement, so one
// stacking rule governs both. They are applied HERE, once per archetype
// update path, because every weapon in this module is fired by
// updateWeapons(); the volley is NOT (WEAPON_TYPES has no VOLLEY entry), so
// there is no double-application: main.js owns the volley's arch factor, this
// module owns the archetypes'. See archMods() below.
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
import { activeArchMods } from './arches.js';
import { healFromBudget } from './heal.js';
// G8 step 2 PIERCE ALL (src/rewrites.js): read at the boomerang's SPAWN site
// so the rule is weapon-agnostic. rewrites.js imports nothing from here, so
// the edge stays acyclic. G21 slice 1: the ONE on-weapon-hit rider writer
// (fed by hurt(), the module's single direct-hit apply) and the WIDE ORBIT
// readers ride the same edge.
import { hasRewrite, onWeaponHit, wideOrbitRadiusMult, wideOrbitSpinMult,
  directHitMult } from './rewrites.js';
// SLICE 7: dev damage metric — the single direct-hit apply, so one wrap here
// covers every weapon (devHit is a no-op branch when disarmed; gate off =
// byte-identical numbers).
import { devHit } from './dev_telemetry.js';

// ---------- Tuning constants (kept HERE, not in config.js — no collisions) ----------
export const WEAPONS = {
  ORBIT: {
    NAME: 'Orbit Blade',
    SPIN: 3.2,          // rad/s blade angular speed
    RADIUS: 40,         // orbit radius around the player
    DAMAGE_MULT: 1.2,   // scaled by p.stats.damage
    TICK: 0.4,          // per-enemy contact damage tick cooldown (s)
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
    // CHAIN ZAP REWORK (owner msg_01M2RENZXZR6MRT4Y5F2RQFRJ7, 2026-09-17):
    // "How many enemies does chain zap currently chain? We should reduce it
    // to 3 to start with a buyable to improve it? Could be technically
    // uncapped buyable but with a limit on range."
    //   COUNT            TOTAL enemies per fire at zero shop levels (primary
    //                    included): 4 -> 3. The old JUMPS: 3 meant 3 EXTRA
    //                    after the primary (4 total) — the reduction is real.
    //   RANGE_PER_LEVEL  each 'zapchain' shop level (meta.js, Storm Conduit)
    //                    widens the hop range by this much. A level ALSO arms
    //                    the uncapped count (below) — one row, two effects,
    //                    both stated in its shop description.
    //   MAX_HOPS         the HARD iteration bound. With the buyable armed the
    //                    count is TECHNICALLY UNCAPPED (no per-level count
    //                    numbers anywhere) but the walk can never exceed this
    //                    many hitSet additions — the loop's second guard
    //                    after the visited set itself, so termination is
    //                    proven twice over: every continuing iteration adds
    //                    >=1 to hitSet AND consumes from the hit budget.
    // WEAPON LEVELS no longer grow the count (the ladder's +1 jump / even
    // level is RETIRED, disclosed at the WEAPON_LEVELS table below): count
    // growth is the SHOP's job now. Falloff continues per hop depth
    // (0.75^depth — by depth ~17 the tail is under 1% damage; the long
    // chains are for reach, not deep-wallet damage).
    COUNT: 3,           // total enemies per fire (primary included), no shop levels
    CHAIN_RANGE: 90,    // max jump distance between chained enemies (base)
    RANGE_PER_LEVEL: 20,// hop-range growth per 'zapchain' shop level
    MAX_HOPS: 64,       // hard iteration bound on the uncapped walk
    FALLOFF: 0.75,      // damage multiplier per hop depth
    // MANA-COST WEAPON (Sk408: "Chain Zap seemed pretty powerful ... maybe
    // should use mana"). ZAP is a spell, not a swing — it hits the primary plus
    // every jump for a 1.4s cooldown, which is a lot of damage for no cost —
    // so it draws on the pool. This is the first weapon to opt in; the seam is
    // general (any def may carry MANA) and only ZAP does today.
    //
    // THE GATE IS HARD (owner 2026-09-17, superseding N1a's soft gate: "A
    // MANA-CONSUMING WEAPON fires when mana is insufficient, including at
    // exactly zero. Fix the gate."). A dry pool does NOT fire: no bolt, no
    // damage, no cooldown. The moment the pool can pay, the next cooldown
    // tick fires — a dry attempt holds cd at 0, so recovery is instant.
    //
    // Sizing: 0.714 bolts/s at base (1.4s CD) x 4 mana = 2.86 mana/s against a
    // 0.5/s base trickle, so a fresh save that wants to keep firing drains its
    // pool in ~35s of held fire and then goes SILENT until regen/potions pay
    // again (the hard gate — the Witch's starting weapon goes dark on a dry
    // pool; that consequence is reported, not compensated). Maxed Mana Spring
    // (2.5/s) very nearly covers it, which is the intended shape: strained at
    // base, solved by the shop.
    // OVERCHARGE's 0.45 rate multiplier roughly doubles the burn.
    MANA: 4,
  },
  NOVA_PULSE: {
    NAME: 'Nova Pulse',
    COOLDOWN: 3.0,
    RADIUS: 70,
    DAMAGE_MULT: 1.4,
  },
  // ---- wave-2 archetypes (rich animation payloads) ----
  SCYTHE: {
    NAME: 'Scythe',
    COOLDOWN: 1.3,      // seconds between swings (before rate scaling)
    RANGE: 55,          // sweep radius from the player
    ARC: 1.0,           // full sweep width, radians (levels widen it)
    DAMAGE_MULT: 1.4,
    WINDUP: 0.18,       // brief telegraph before the arc lands
  },
  SEEKER: {
    NAME: 'Seeker',
    COOLDOWN: 1.8,
    SPEED: 150,         // missile px/s
    TURN: 3.2,          // rad/s homing turn rate (weak by design — dodgeable)
    DAMAGE_MULT: 1.2,
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
  // ---- tier-2(e) NEW WEAPONS (owner autopilot 2026-09-23) -------------------
  // ORIGINAL instances of shipped behavior classes (docs/vs_ref SPEC-weapons
  // "passes through enemies" / "boomerang effect" / "bounces around" /
  // bombardment + docs/mb_ref projectile vocabulary used as CLASS sources
  // only — no foreign names, no foreign pixels). Numbers TUNE-AFTER. Every
  // effect rides an EXISTING stat surface (p.stats.damage / cooldown /
  // projectiles / pierce / damageMult / rateMult / crit / critMult via
  // rateScale :227, dmgScale :250, critRoll :259) and an EXISTING effect
  // seam (hurt :290, state.projectiles kind-tag :41-43, state.effects
  // {kind,x,y,age,ttl} :45-49, weaponLevelParams ladders :1032). No new stat
  // surface, no new resource, no on-kill economy, no mid-flight homing.
  JAVELIN: {
    NAME: 'Sun Javelin',
    COOLDOWN: 2.2,      // seconds between throws (before rate scaling)
    SPEED: 320,         // px/s straight lane
    RANGE: 220,         // travel distance before the spear fizzles
    DAMAGE_MULT: 1.6,
    HIT_R: 10,
  },
  EMBER: {
    NAME: 'Ember Shot',
    COOLDOWN: 1.1,
    SPEED: 210,
    LIFE: 2.4,          // seconds before a lost bolt fizzes
    DAMAGE_MULT: 0.85,
    HIT_R: 7,
    BLAST: 28,          // burst-on-kill AoE radius (levels grow it)
    KILL_BLAST_MULT: 0.7, // the burst pays LESS than the bolt (clear, not nuke)
  },
  RICOCHET: {
    NAME: 'Ricochet',
    COOLDOWN: 2.0,
    SPEED: 260,
    LIFE: 2.2,
    DAMAGE_MULT: 1.1,
    HIT_R: 8,
    BOUNCES: 3,         // extra enemies after the first (levels grow it)
    CHAIN_RANGE: 140,   // bounce search radius (the ZAP hop-range shape)
  },
  METEOR: {
    NAME: 'Meteor',
    COOLDOWN: 3.6,
    WINDUP: 0.55,       // telegraph before the rock lands (scythe_windup shape)
    BLAST: 55,          // land AoE radius (levels grow it)
    DAMAGE_MULT: 2.2,
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
// EVOLUTION AFFIX SEAM (evolutions.js): an evolved weapon carries a def-copy
// on `weapon.evolution` with per-weapon affixes applied HERE with the exact
// same convention as the loot stat fields above:
//   damageMult — multiplies this weapon's final damage
//   rateMult   — multiplies attack rate (cooldowns DIVIDE by it; ORBIT has no
//                cooldown, so it halves the per-enemy contact tick instead)
//   crit       — ADDITIVE crit chance for this weapon's hits only
//   critMult   — ADDITIVE bonus to the crit damage multiplier on this weapon
// Missing fields are neutral. Weapons without an evolution are unaffected.
function evoAffixes(weapon) {
  return (weapon && weapon.evolution && weapon.evolution.affixes) || null;
}
// The weapon's own form multiplier: its evolution's damageMult, times the
// fusion's `mult` when it is half of a fused weapon (fusions.js).
function evoDmg(weapon) {
  const a = evoAffixes(weapon);
  const fus = weapon && weapon.fusion ? (weapon.fusion.mult || 1) : 1;
  return (a && a.damageMult ? a.damageMult : 1) * fus;
}
// Fusion flag probe (pure data from fusions.js; unknown flags ignored).
function fusFlag(weapon, flag) {
  const f = weapon && weapon.fusion && weapon.fusion.flags;
  return f ? f[flag] : undefined;
}
function evoRate(weapon) {
  const a = evoAffixes(weapon);
  return a && a.rateMult ? a.rateMult : 1;
}
// Behavior flag probe (pure data from evolutions.js; unknown flags ignored).
function evoHas(weapon, flag) {
  const e = weapon && weapon.evolution;
  return !!(e && e.flags && e.flags.includes(flag));
}

// ---------- Arch buff seam (arches.js) ----------
// Combined multipliers of every ACTIVE arch (DOUBLE_FIRE rateMult x2, BERSERK
// damageMult x1.5, ...) via the same activeArchMods() helper main.js uses.
// Reads state.archBuffs lazily, so a state without the field is neutral.
function archMods(state) {
  return activeArchMods(state);
}

function rateScale(state, weapon) {
  const p = state.player;
  // G25 slice 1 — ASCENDANT ARSENAL (apex rule-breaker): while the run's
  // apex fire stamp is live, weapons NEVER stop firing — this ONE mapping
  // seam returns 0, so every re-arm site below writes zero cooldown and each
  // weapon fires once per frame. Deliberately game-breaking by charter; do
  // not tune it down, do not cap it "for balance". With apex OFF (or not
  // owned) the stamp is false and the mapping below runs byte-identically to
  // pre-apex — no call site grows a second special case.
  if (state.apexFire) return 0;
  // Map the player's leveled cooldown onto this weapon: 1.0 at stock speed.
  // rateMult (loot Rapid Trigger / DOUBLE_FIRE arch) DIVIDES the interval —
  // the same convention main.js's volley loop uses: cooldown * overcharge /
  // rateMult. The weapon's OWN level rateMult and evolution rateMult divide it
  // further (per-weapon).
  const overcharge = p.buffs && p.buffs.overcharge > 0 ? C.SKILLS.OVERCHARGE.RATE_MULT : 1;
  const lvRate = weapon ? (weaponLevelParams(weapon.type, weapon.level).rateMult || 1) : 1;
  return (p.stats.cooldown / C.WEAPON.COOLDOWN) * overcharge /
    ((p.stats.rateMult || 1) * lvRate * evoRate(weapon) * (archMods(state).rateMult || 1));
}

// Bodies per fire: the weapon's own level count. Split Shot and Fan Fire
// (stats.projectiles) are the Volley's, as their cards say.
function fireCount(P) {
  return Math.max(1, P.count || 1);
}

// Final damage multiplier from loot affixes (Brutal Edge, ...) + the arch buff
// (BERSERK). `arch` may be a pre-read archMods(state) result so a caller that
// already has it (ORBIT hoists it out of its per-hit loop) pays for one read.
function dmgScale(state, arch) {
  const a = arch || archMods(state);
  return (state.player.stats.damageMult || 1) * (a.damageMult || 1);
}

// Per-hit crit roll -> 1 or the crit multiplier. The ONLY Math.random site
// in this module (documented above): crit 0 / absent never fires, keeping
// every other path deterministic for tests. Evolution crit/critMult affixes
// are additive PER-WEAPON on top of the player's stats.
function critRoll(p, weapon) {
  const a = evoAffixes(weapon);
  const s = p.stats;
  const crit = (s.crit || 0) + (a && a.crit ? a.crit : 0);
  if (crit <= 0) return 1;
  const cm = (s.critMult || 1.5) + (a && a.critMult ? a.critMult : 0);
  return Math.random() < crit ? cm : 1;
}

// Exported for skills.js (N1 slice 1): the Witch's CHAIN_REACTION Q walks the
// same nearest-first scan her gun does, so both chains pick identical targets
// under identical state. Pure read; weapons.js owns the tie-break rule.
export function nearestEnemy(state, x, y, exclude) {
  let best = null, bestD = Infinity;
  for (const e of state.enemies) {
    if (e.hp <= 0 || (exclude && exclude.has(e))) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d < bestD) { bestD = d; best = e; }   // first-found wins ties: deterministic
  }
  return best;
}

// The module's ONE direct-hit apply: every archetype's primary damage routes
// here (orbit contact, boomerang legs, zap head + chain, nova pulse, scythe
// swing, seeker impact, mine detonation, beam tick), so the G21 on-weapon-hit
// rider (rewrites.js onWeaponHit — RIME/IGNITE/LIVE WIRE/OVERLOAD) hooks
// EXACTLY the direct-hit set and nothing else. G21 slice 2: the direct-hit
// DAMAGE multiplier (GLACIER, and GLACIAL ORBIT when the caller marks an
// ORBIT contact) is read HERE, at the same seam — so no blast, burn tick,
// echo, thorn or discharge can ever pick it up (R3). `opts.orbit` is passed
// by updateOrbit alone.
function hurt(state, e, dmg, opts) {
  e.hp -= devHit(dmg * directHitMult(state, e, opts));
  e.flash = 0.08;
  onWeaponHit(state, e, opts);
}

// ---------- ORBIT: blades circling the player, damage on contact ----------
// TWIN_ORBIT evolution: `twinOrbit` adds a second counter-rotating ring at
// 62% radius (both rings share the per-enemy tick map); `bladeStorm` halves
// the contact tick cooldown (ticks come twice as often; the damageMult
// affix covers "twice as hard").
function updateOrbit(state, weapon, dt) {
  const W = WEAPONS.ORBIT;
  const P = weaponLevelParams('ORBIT', weapon.level);
  const radius = (P.radius || W.RADIUS) * wideOrbitRadiusMult(state);   // G21 WIDE ORBIT
  const p = state.player;
  // Arch read hoisted out of the per-hit loop below (one allocation per
  // update, not one per contact): ORBIT has no cooldown, so its ARCH attack
  // rate lands on the per-enemy contact tick instead.
  const arch = archMods(state);
  const dmgMult = dmgScale(state, arch);
  const twin = evoHas(weapon, 'twinOrbit');
  const tick = W.TICK / (evoRate(weapon) * (evoHas(weapon, 'bladeStorm') ? 2 : 1) *
    (arch.rateMult || 1));
  weapon.angle += W.SPIN * wideOrbitSpinMult(state) * dt;   // G21 WIDE ORBIT
  if (twin) weapon.angle2 = (weapon.angle2 || 0) - W.SPIN * wideOrbitSpinMult(state) * dt;
  const n = Math.max(1, P.blades || 1);
  const blades = [];
  const ring = (r, base, dir) => {
    for (let i = 0; i < n; i++) {
      const a = base * dir + (i / n) * Math.PI * 2;
      blades.push({ x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r });
    }
  };
  ring(radius, weapon.angle, 1);
  if (twin) ring(radius * 0.62, weapon.angle2 || 0, -1);
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
        hurt(state, e, p.stats.damage * W.DAMAGE_MULT * (P.dmgMult || 1) * dmgMult *
          evoDmg(weapon) * critRoll(p, weapon), { orbit: true });   // G21 GLACIAL ORBIT
        weapon.ticks.set(e, tick);
        state.effects.push({ kind: 'orbit_hit', x: e.x, y: e.y, age: 0, ttl: 0.1 });
      }
    }
  }

  // Persistent-ish blade dots (short ttl so the existing effects filter reaps them).
  for (const b of blades) state.effects.push({ kind: 'orbit', x: b.x, y: b.y, age: 0, ttl: 0.08 });
}

// ---------- BOOMERANG: throws at the nearest enemy, pierces all, returns ----------
// VOID_RANG evolution: `pierceAll` = unlimited DISTINCT enemies on BOTH legs
// (one hit each — it widens the pass-through, it does not turn the leg into a
// damage-over-time field); `voidPull` = every contact hit drags the victim
// ~12% of the way back to the thrower (the return leg drags the horde home
// with it).
//
// PIERCE (the Lv3/5/7 '+1 pierce' grant + the player's stats.pierce): the
// thrown body's `pierce` field is the per-enemy RE-HIT allowance for a leg —
// a leg may strike the same enemy 1 + pierce times. `pr.hit` counts the hits
// already spent this leg and is refilled when the leg flips. pierce 0 is the
// original behaviour exactly (one hit per enemy per leg), and the archetype
// keeps its identity: DISTINCT enemies on the path are still all hit.
export const PIERCE_ALL = 999;   // sentinel: 'unlimited DISTINCT enemies' (VOID_RANG's
                                 // pierceAll; main.js uses the same literal for the volley)

function updateBoomerang(state, weapon, dt) {
  const W = WEAPONS.BOOMERANG;
  const P = weaponLevelParams('BOOMERANG', weapon.level);
  const speed = W.SPEED * (P.speedMult || 1);   // level: faster out AND back
  const p = state.player;
  const pierceAll = evoHas(weapon, 'pierceAll');
  const voidPull = evoHas(weapon, 'voidPull');
  weapon.cd -= dt;
  if (weapon.cd <= 0) {
    const target = nearestEnemy(state, p.x, p.y);
    if (target) {
      weapon.cd = W.COOLDOWN * rateScale(state, weapon);
      const a = Math.atan2(target.y - p.y, target.x - p.x);
      const n = fireCount(P);   // Lv4/Lv8 add boomerangs to the fan
      for (let i = 0; i < n; i++) {
        const spread = (i - (n - 1) / 2) * 0.25;
        state.projectiles.push({
          kind: 'boomerang',
          x: p.x, y: p.y,
          dx: Math.cos(a + spread), dy: Math.sin(a + spread),
          dist: 0, phase: 'out',
          damage: p.stats.damage * W.DAMAGE_MULT * (P.dmgMult || 1) * dmgScale(state) * evoDmg(weapon),
          // G8 step 2 PIERCE ALL rewrite: same sentinel the VOID_RANG
          // evolution uses, read at spawn.
          pierce: (pierceAll || hasRewrite(state, 'pierceall')) ? PIERCE_ALL
            : (p.stats.pierce || 0) + (P.pierceBonus || 0),
          hit: new Map(),   // enemy -> hits already spent THIS leg (see PIERCE above)
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
        pr.hit.clear();   // the return leg gets a fresh 1+pierce budget per enemy
      }
    } else {
      const dx = p.x - pr.x, dy = p.y - pr.y;
      const len = Math.hypot(dx, dy) || 1;
      const step = speed * dt;
      pr.x += (dx / len) * step; pr.y += (dy / len) * step;
      if (len < 12) {
        pr.age = 99;   // caught: remove
        // Bloodhound Rang: each catch launches one missile from the fused Seeker.
        if (fusFlag(weapon, 'catchMissile') && weapon.fused) launchSeeker(state, weapon.fused, pr.dx, pr.dy);
      }
    }
    // Per-leg hit budget. PIERCE_ALL keeps the pre-pierce behaviour: unlimited
    // DISTINCT enemies, one hit each. A finite pierce is the documented extra
    // re-hit allowance (1 + pierce hits per enemy per leg).
    const budget = pr.pierce >= PIERCE_ALL ? 1 : 1 + Math.max(0, pr.pierce || 0);
    for (const e of state.enemies) {
      if (e.hp <= 0) continue;
      const spent = pr.hit.get(e) || 0;
      if (spent >= budget) continue;
      if (Math.abs(pr.x - e.x) < W.HIT_R && Math.abs(pr.y - e.y) < W.HIT_R) {
        hurt(state, e, pr.damage * critRoll(p, weapon));   // crit rolled per contact hit
        pr.hit.set(e, spent + 1);
        if (voidPull) {   // drag the victim toward the thrower
          e.x += (p.x - e.x) * 0.12;
          e.y += (p.y - e.y) * 0.12;
        }
      }
    }
    if (pr.age >= 99) state.projectiles.splice(i, 1);
  }
}

// ---------- MANA-COST WEAPONS: the HARD-gate seam -----------------------------
// Every mana cost is read through weaponManaCost() so a character's
// manaCostMult (CHARACTERS[].mods, threaded by applyCharacter — WITCH 0.5 so
// ZAP costs her 2, everyone else 4) moves the number in ONE place. The gate is
// HARD (owner 2026-09-17): mana < cost => the weapon does not fire at all;
// mana === cost fires and spends exactly the cost.
export function weaponManaCost(id, state) {
  const def = WEAPONS[id];
  if (!def || !def.MANA) return 0;
  const mult = (state && state.player && state.player.stats
    && state.player.stats.manaCostMult) || 1;
  return def.MANA * mult;
}

// ---------- ZAP: chain lightning, primary target + 3 nearest-jump neighbors ----------
// TESLA_TEMPEST evolution: `chainZap` = every jump forks to the TWO nearest
// unused neighbors (a branching tree); `forkBolt` = a second independent
// bolt strikes the 2nd-nearest enemy and chains with the same rules.
function updateZap(state, weapon, dt) {
  const W = WEAPONS.ZAP;
  const P = weaponLevelParams('ZAP', weapon.level);
  const p = state.player;
  // CHAIN ZAP REWORK (msg_01M2RENZXZR6MRT4Y5F2RQFRJ7): the shop level (meta.js
  // 'zapchain', published to stats by applyMetaBonuses) does TWO things —
  // widens the hop range by RANGE_PER_LEVEL per level and ARMS the uncapped
  // count. At zero levels the fire is exactly COUNT total enemies (primary
  // included); at any level the walk runs until no unvisited enemy stands
  // inside the (raised) hop range, bounded by MAX_HOPS.
  const chainLvl = p.stats.zapChain || 0;
  const hopRange = W.CHAIN_RANGE + W.RANGE_PER_LEVEL * chainLvl;
  const maxHits = chainLvl > 0 ? W.MAX_HOPS : W.COUNT + (P.jumps || 0);
  const forkPerJump = evoHas(weapon, 'chainZap') ? 2 : 1;
  // HARD GATE (owner 2026-09-17): the cost is read once, from the ONE seam.
  // The gate sits AFTER the target test (an empty field never burns a charge)
  // and BEFORE the fire: a dry attempt spends nothing, deals nothing, and
  // holds cd at 0 — the bolt fires the moment the pool can pay.
  const cost = weaponManaCost('ZAP', state);
  const baseDmg = p.stats.damage * W.DAMAGE_MULT * (P.dmgMult || 1) * dmgScale(state) * evoDmg(weapon);
  weapon.cd -= dt;
  if (weapon.cd > 0) return;
  const primary = nearestEnemy(state, p.x, p.y);
  if (!primary) { weapon.cd = 0; return; }
  if (W.MANA && p.mana < cost) { weapon.cd = 0; return; }
  if (W.MANA) p.mana -= cost;
  weapon.cd = W.COOLDOWN * rateScale(state, weapon);

  const points = [{ x: p.x, y: p.y }];
  const hitSet = new Set([primary]);

  // One bolt = primary strike + a (possibly forking) chain walk. The walk
  // terminates on THREE independent guards, in order: the hit budget
  // (maxHits: W.COUNT at zero shop levels, W.MAX_HOPS once the buyable arms
  // the uncapped count — shared across both bolts so forkBolt cannot double
  // it), the hop range (no unvisited enemy within hopRange of the frontier),
  // and the visited set (nearestEnemy never returns a hitSet member, so the
  // walk can never loop). Every continuing iteration adds >=1 to hitSet AND
  // consumes from the budget: both counters strictly decrease, so the loop
  // provably terminates whatever the enemy field looks like.
  let hitsLeft = maxHits;
  const bolt = (head, origin) => {
    points.push(origin ? { x: origin.x, y: origin.y } : { x: head.x, y: head.y });
    hurt(state, head, baseDmg * critRoll(p, weapon));
    hitsLeft--;
    let frontier = [head];
    let depth = 0;
    while (hitsLeft > 0) {
      const next = [];
      for (const from of frontier) {
        for (let f = 0; f < forkPerJump; f++) {
          if (hitsLeft <= 0) break;
          const tgt = nearestEnemy(state, from.x, from.y, hitSet);
          if (!tgt || Math.hypot(tgt.x - from.x, tgt.y - from.y) > hopRange) break;
          hurt(state, tgt, baseDmg * critRoll(p, weapon) * Math.pow(W.FALLOFF, depth + 1));
          hitSet.add(tgt);
          hitsLeft--;
          // Polyline: append the victim; on a FORK, re-append the branch
          // node first so each fork draws its own from->to segment.
          if (f > 0) points.push({ x: from.x, y: from.y });
          points.push({ x: tgt.x, y: tgt.y });
          next.push(tgt);
        }
      }
      if (next.length === 0) break;
      frontier = next;
      depth++;
    }
  };
  bolt(primary);
  if (evoHas(weapon, 'forkBolt')) {
    const second = nearestEnemy(state, p.x, p.y, hitSet);
    if (second && Math.hypot(second.x - p.x, second.y - p.y) <= hopRange) bolt(second, p);
  }

  state.effects.push({ kind: 'zap', points, age: 0, ttl: 0.15 });
}

// ---------- NOVA_PULSE: periodic AoE ring from the player, no aiming ----------
// SUPERNOVA evolution: `bigBoom` = +50% pulse radius; `novaChain` = pulses
// chain back-to-back (cooldown halved).
function updateNovaPulse(state, weapon, dt) {
  const W = WEAPONS.NOVA_PULSE;
  const P = weaponLevelParams('NOVA_PULSE', weapon.level);
  const radius = (P.radius || W.RADIUS) * (evoHas(weapon, 'bigBoom') ? 1.5 : 1);
  const p = state.player;
  weapon.cd -= dt;
  if (weapon.cd > 0) return;
  weapon.cd = W.COOLDOWN * rateScale(state, weapon) * (evoHas(weapon, 'novaChain') ? 0.5 : 1);
  const dmg = p.stats.damage * W.DAMAGE_MULT * (P.dmgMult || 1) * dmgScale(state) * evoDmg(weapon);
  for (const e of state.enemies) {
    if (e.hp <= 0) continue;
    if (Math.hypot(e.x - p.x, e.y - p.y) <= radius) hurt(state, e, dmg * critRoll(p, weapon));
  }
  state.effects.push({ kind: 'nova_pulse', x: p.x, y: p.y, radius, age: 0, ttl: 0.3 });
}

// ---------- SCYTHE: sweeping arc melee toward the volley target, windup first
function angleDiff(a, b) {           // signed smallest a-b, in [-PI, PI]
  return ((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
}

// SCYTHE evolution (GRAVE_HARVEST): `wideReap` = the sweep becomes a full
// circle; `harvestSouls` = every kill in the sweep heals the player 2 hp.
function updateScythe(state, weapon, dt) {
  const W = WEAPONS.SCYTHE;
  const P = weaponLevelParams('SCYTHE', weapon.level);
  const arc = evoHas(weapon, 'wideReap') ? Math.PI * 2 : (P.arc || W.ARC);
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
    const dmg = p.stats.damage * W.DAMAGE_MULT * (P.dmgMult || 1) * dmgScale(state) * evoDmg(weapon);
    let souls = 0;
    const reaped = [];   // where this sweep killed (the Harvest Fire fusion reads it)
    for (const e of state.enemies) {
      if (e.hp <= 0) continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d > W.RANGE) continue;
      if (Math.abs(angleDiff(Math.atan2(e.y - p.y, e.x - p.x), dir)) > arc / 2) continue;
      hurt(state, e, dmg * critRoll(p, weapon));
      if (e.hp <= 0) { souls++; reaped.push({ x: e.x, y: e.y }); }
      state.effects.push({ kind: 'scythe_hit', x: e.x, y: e.y, age: 0, ttl: 0.15 }); // spark dot
    }
    if (souls > 0 && evoHas(weapon, 'harvestSouls')) {
      // G36: harvest is a THROUGHPUT heal (2 HP per kill — it scales with the
      // kill rate, which scales with the damage shop). It draws from the SAME
      // shared per-run budget as lifesteal (src/heal.js; CONFIG.HEAL_BUDGET),
      // so no combination of throughput sites can out-heal bounded inbound.
      // Below the cap this is EXACTLY the old 2 * souls.
      const heal = healFromBudget(state.healBudget, 2 * souls);
      state.healBudget -= heal;
      p.hp = Math.min(p.stats.maxHp, p.hp + heal);
    }
    state.effects.push({
      kind: 'scythe_arc', x: p.x, y: p.y, dir, radius: W.RANGE, arc, age: 0, ttl: 0.25,
      reaped,
    });
    return;
  }

  if (weapon.cd > 0) return;
  const target = nearestEnemy(state, p.x, p.y);
  if (!target) { weapon.cd = 0; return; }
  weapon.cd = W.COOLDOWN * rateScale(state, weapon);
  // Sweep in the direction the volley would fire (nearest threat).
  weapon.swing = { dir: Math.atan2(target.y - p.y, target.x - p.x), t: W.WINDUP };
  state.effects.push({
    kind: 'scythe_windup', x: p.x, y: p.y, dir: weapon.swing.dir,
    radius: W.RANGE, arc, age: 0, ttl: 0.05,
  });
}

// ---------- SEEKER: weak-turn homing missiles that retarget on kill --------
// HYDRA_SWARM evolution: `hydraSplit` = a missile that connects spawns TWO
// hatchlings at the impact point (half damage, one generation deep —
// hatchlings don't split again); `eternalHunt` = 3x missile life so the
// hunt outlives a lost mark.
// One missile from a Seeker weapon, off its own fire clock (the Bloodhound
// Rang fusion calls this on every boomerang catch).
function launchSeeker(state, seeker, dx, dy) {
  const W = WEAPONS.SEEKER;
  const P = weaponLevelParams('SEEKER', seeker.level);
  const p = state.player;
  state.projectiles.push({
    kind: 'seeker', x: p.x, y: p.y, ang: Math.atan2(-dy, -dx),
    target: nearestEnemy(state, p.x, p.y),
    damage: p.stats.damage * W.DAMAGE_MULT * (P.dmgMult || 1) * dmgScale(state) * evoDmg(seeker),
    age: 0, trail: [], gen: 1,   // gen 1: a catch missile does not hatch a hydra pair
  });
}

function updateSeeker(state, weapon, dt) {
  const W = WEAPONS.SEEKER;
  const P = weaponLevelParams('SEEKER', weapon.level);
  const count = P.count || 1;
  const turn = (P.turn || W.TURN) * dt;      // max radians this frame
  const life = W.LIFE * (evoHas(weapon, 'eternalHunt') ? 3 : 1);
  const hydra = evoHas(weapon, 'hydraSplit');
  const p = state.player;
  weapon.cd -= dt;
  if (weapon.cd <= 0) {
    weapon.cd = W.COOLDOWN * rateScale(state, weapon);
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
        // SLICE 6 (dev-editor): the ladder dmgMult rides the spawn damage
        // like every other archetype, so per-level dmg overrides are real
        // here too. The SEEKER ladder carries no dmgMult, so (P.dmgMult||1)
        // is 1 and default behaviour is byte-identical.
        damage: p.stats.damage * W.DAMAGE_MULT * (P.dmgMult || 1) * dmgScale(state) * evoDmg(weapon),
        age: 0, trail: [], gen: 0,
      });
    }
  }

  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const pr = state.projectiles[i];
    if (pr.kind !== 'seeker') continue;
    pr.age += dt;
    if (pr.age >= life) {
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
        hurt(state, e, pr.damage * critRoll(p, weapon));   // crit rolled per impact
        state.effects.push({ kind: 'seeker_pop', x: pr.x, y: pr.y, age: 0, ttl: 0.12 });
        if (hydra && !(pr.gen > 0)) {
          // Two hatchlings burst out of the kill and pick fresh marks.
          for (let h = 0; h < 2; h++) {
            state.projectiles.push({
              kind: 'seeker',
              x: pr.x, y: pr.y,
              ang: pr.ang + (h === 0 ? 0.6 : -0.6),
              target: nearestEnemy(state, pr.x, pr.y),
              damage: pr.damage * 0.5,
              age: 0, trail: [], gen: (pr.gen || 0) + 1,
            });
          }
        }
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
      hurt(state, e, dmg * critRoll(p));   // crit rolled per blast victim
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

// MINE evolution (VOLCANIC_FIELD): `bigBoom` = +50% blast radius;
// `chainMine` = each detonation sets off every other mine inside its blast
// (rolling chain, each mine fires once).
function updateMine(state, weapon, dt) {
  const W = WEAPONS.MINE;
  const P = weaponLevelParams('MINE', weapon.level);
  const blast = (P.blast || W.BLAST) * (evoHas(weapon, 'bigBoom') ? 1.5 : 1);
  const chain = evoHas(weapon, 'chainMine');
  const p = state.player;
  weapon.cd -= dt;
  if (weapon.cd <= 0) {
    weapon.cd = W.COOLDOWN * rateScale(state, weapon);
    state.projectiles.push({ kind: 'mine', x: p.x, y: p.y, age: 0 });
    // Cap the trail: the auto-mover drops a path, not a carpet.
    let mines = 0;
    for (let i = state.projectiles.length - 1; i >= 0; i--) {
      if (state.projectiles[i].kind !== 'mine') continue;
      if (++mines > W.MAX_MINES + (P.extraMines || 0)) {
        state.effects.push({ kind: 'mine_fizzle', x: state.projectiles[i].x, y: state.projectiles[i].y, age: 0, ttl: 0.15 });
        state.projectiles.splice(i, 1);
      }
    }
  }

  const dmg = p.stats.damage * W.DAMAGE_MULT * (P.dmgMult || 1) * dmgScale(state) * evoDmg(weapon);
  // Mine scan. A chain detonation removes the triggering mine AND every mine it
  // set off, so state.projectiles SHRINKS while we scan it: walk a snapshot of
  // the mines (newest first, same order as before) and re-check liveness before
  // touching each one. Reading state.projectiles[i] with the pre-removal index
  // threw TypeError mid-frame whenever a chain caught a second mine — the
  // exception escaped the rAF update and killed the game loop.
  const mines = state.projectiles.filter(pr => pr.kind === 'mine');
  for (let i = mines.length - 1; i >= 0; i--) {
    const mine = mines[i];
    if (!state.projectiles.includes(mine)) continue;   // chained away already
    mine.age += dt;
    if (mine.age >= W.LIFETIME) {
      state.effects.push({ kind: 'mine_fizzle', x: mine.x, y: mine.y, age: 0, ttl: 0.15 });
      state.projectiles.splice(state.projectiles.indexOf(mine), 1);
      continue;
    }
    for (const e of state.enemies) {
      if (e.hp <= 0) continue;
      if (Math.hypot(e.x - mine.x, e.y - mine.y) <= W.TRIGGER_R) {
        // Rolling chain (visited set: every mine detonates at most once).
        const boom = (m, seen) => {
          seen.add(m);
          detonateMine(state, m, blast, dmg, p);
          if (!chain) return;
          for (const other of state.projectiles) {
            if (other.kind !== 'mine' || seen.has(other)) continue;
            if (Math.hypot(other.x - m.x, other.y - m.y) <= blast) boom(other, seen);
          }
        };
        const seen = new Set();
        boom(mine, seen);
        for (let k = state.projectiles.length - 1; k >= 0; k--) {
          if (seen.has(state.projectiles[k])) state.projectiles.splice(k, 1);
        }
        break;
      }
    }
  }
}

// ---------- BEAM: piercing laser along the volley direction, long cd -------
// GODLANCE evolution: `prismSplit` = the lance splits through a prism into
// THREE lanes (aim and +-0.35 rad); `solarFlare` = +30% beam width (the
// lanes run hot).
function updateBeam(state, weapon, dt) {
  const W = WEAPONS.BEAM;
  const P = weaponLevelParams('BEAM', weapon.level);
  const width = (P.width || W.WIDTH) * (evoHas(weapon, 'solarFlare') ? 1.3 : 1);
  const lanes = evoHas(weapon, 'prismSplit') ? [-0.35, 0, 0.35] : [0];
  const length = P.length || W.LENGTH;
  const p = state.player;
  weapon.cd -= dt;
  if (weapon.cd > 0) return;
  const target = nearestEnemy(state, p.x, p.y);
  if (!target) { weapon.cd = 0; return; }
  weapon.cd = W.COOLDOWN * rateScale(state, weapon);
  weapon.fires = (weapon.fires || 0) + 1;

  const baseDir = Math.atan2(target.y - p.y, target.x - p.x);
  const dmg = p.stats.damage * W.DAMAGE_MULT * (P.dmgMult || 1) * dmgScale(state) * evoDmg(weapon);
  for (const off of lanes) {
    const dir = baseDir + off;
    const cx = Math.cos(dir), cy = Math.sin(dir);
    for (const e of state.enemies) {
      if (e.hp <= 0) continue;
      const rx = e.x - p.x, ry = e.y - p.y;
      const along = rx * cx + ry * cy;          // projection on the beam axis
      if (along < 0 || along > length) continue;
      if (Math.abs(rx * cy - ry * cx) > width / 2) continue;   // perpendicular distance
      hurt(state, e, dmg * critRoll(p, weapon));       // crit rolled per beam victim
      state.effects.push({ kind: 'beam_hit', x: e.x, y: e.y, age: 0, ttl: 0.15 }); // spark dot
    }
    // Rich beam payload: sweep envelope (render lerps dir-from -> dir-to),
    // thickness, and a deterministic flicker phase so each beam strobes
    // differently (no Math.random).
    state.effects.push({
      kind: 'beam', x: p.x, y: p.y,
      dir, from: dir - W.SWEEP, to: dir + W.SWEEP,
      len: length, width, phase: weapon.fires * 1.7,
      age: 0, ttl: 0.35,
    });
  }
}

// ---------- JAVELIN / EMBER / RICOCHET / METEOR -----------------------------
// All four share the seams above: hurt() is the one direct-hit apply, critRoll
// the one rng site, rateScale/dmgScale the stat mapping, weaponLevelParams the
// per-level growth, and kind-tagged bodies in state.projectiles are skipped by
// the volley loop. Evolved bodies and bursts carry `evo: true` so the
// painters can dress them differently.

// JAVELIN — a heavy spear flies one straight lane and strikes every enemy on
// the path exactly once per throw (a visited set, so damage does not depend
// on frame rate). Levels add spears; Split Shot fans the throw.
// SOLAR_LANCE evolution: `longLane` = the lane runs 2.5x as far, 30% faster;
// `sunBurst` = every enemy the spear passes bursts into a small sun that
// deals SUN_BURST_FRAC of the spear's damage to its neighbours.
const SUN_BURST_R = 40;
const SUN_BURST_FRAC = 0.5;
function updateJavelin(state, weapon, dt) {
  const W = WEAPONS.JAVELIN;
  const P = weaponLevelParams('JAVELIN', weapon.level);
  const p = state.player;
  const longLane = evoHas(weapon, 'longLane');
  const sunBurst = evoHas(weapon, 'sunBurst');
  weapon.cd -= dt;
  if (weapon.cd <= 0) {
    const target = nearestEnemy(state, p.x, p.y);
    if (!target) { weapon.cd = 0; }
    else {
      weapon.cd = W.COOLDOWN * rateScale(state, weapon);
      const a = Math.atan2(target.y - p.y, target.x - p.x);
      const n = fireCount(P);
      for (let i = 0; i < n; i++) {
        const spread = (i - (n - 1) / 2) * 0.2;
        state.projectiles.push({
          kind: 'javelin',
          x: p.x, y: p.y,
          dx: Math.cos(a + spread), dy: Math.sin(a + spread),
          dist: 0,
          damage: p.stats.damage * W.DAMAGE_MULT * (P.dmgMult || 1) * dmgScale(state) * evoDmg(weapon),
          hit: new Set(),
          age: 0,
          evo: !!weapon.evolution,
        });
      }
    }
  }
  const range = (P.range || W.RANGE) * (longLane ? 2.5 : 1);
  const speed = W.SPEED * (P.speedMult || 1) * (longLane ? 1.3 : 1);
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const pr = state.projectiles[i];
    if (pr.kind !== 'javelin') continue;
    pr.age += dt;
    const step = speed * dt;
    pr.x += pr.dx * step; pr.y += pr.dy * step; pr.dist += step;
    if (pr.dist >= range) {
      state.effects.push({ kind: 'mine_fizzle', x: pr.x, y: pr.y, age: 0, ttl: 0.1 });
      state.projectiles.splice(i, 1);
      continue;
    }
    for (const e of state.enemies) {
      if (e.hp <= 0 || pr.hit.has(e)) continue;
      if (Math.abs(pr.x - e.x) < W.HIT_R && Math.abs(pr.y - e.y) < W.HIT_R) {
        hurt(state, e, pr.damage * critRoll(p, weapon));
        pr.hit.add(e);
        state.effects.push({ kind: 'beam_hit', x: e.x, y: e.y, age: 0, ttl: 0.1 });
        if (sunBurst) {
          for (const e2 of state.enemies) {
            if (e2 === e || e2.hp <= 0) continue;
            if (Math.hypot(e2.x - e.x, e2.y - e.y) <= SUN_BURST_R) hurt(state, e2, pr.damage * SUN_BURST_FRAC * critRoll(p, weapon));
          }
          state.effects.push({ kind: 'nova_pulse', x: e.x, y: e.y, radius: SUN_BURST_R, age: 0, ttl: 0.25, evo: 'sun' });
        }
      }
    }
  }
}

// Burning ground (INFERNO kills, METEOR_STORM craters): a patch body in
// state.projectiles that ticks damage to everything standing in it.
const FIRE_PATCH = { TTL: 2.0, TICK: 0.3, DMG_FRAC: 0.15 };
function pushFirePatch(state, x, y, radius, damage, tint) {
  state.projectiles.push({ kind: 'firepatch', x, y, radius, damage, tint, age: 0, tick: 0 });
}
function updateFirePatches(state, weapon, dt) {
  const p = state.player;
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const pr = state.projectiles[i];
    if (pr.kind !== 'firepatch') continue;
    pr.age += dt;
    if (pr.age >= FIRE_PATCH.TTL) { state.projectiles.splice(i, 1); continue; }
    pr.tick -= dt;
    if (pr.tick > 0) continue;
    pr.tick = FIRE_PATCH.TICK;
    for (const e of state.enemies) {
      if (e.hp <= 0) continue;
      if (Math.hypot(e.x - pr.x, e.y - pr.y) <= pr.radius) {
        hurt(state, e, pr.damage * FIRE_PATCH.DMG_FRAC * critRoll(p, weapon));
        state.effects.push({ kind: 'mine_hit', x: e.x, y: e.y, age: 0, ttl: 0.1 });
      }
    }
  }
}

// EMBER — incendiary bolts fly at the nearest enemy; a bolt that KILLS bursts
// in a small AoE at the victim. Levels add bolts. INFERNO evolution:
// `bigBurst` = the burst pays the bolt's full damage over 1.5x the radius;
// `burnGround` = every kill leaves burning ground (a FIRE_PATCH).
function updateEmber(state, weapon, dt) {
  const W = WEAPONS.EMBER;
  const P = weaponLevelParams('EMBER', weapon.level);
  const p = state.player;
  const bigBurst = evoHas(weapon, 'bigBurst');
  const burnGround = evoHas(weapon, 'burnGround');
  weapon.cd -= dt;
  if (weapon.cd <= 0) {
    const target = nearestEnemy(state, p.x, p.y);
    if (!target) { weapon.cd = 0; }
    else {
      weapon.cd = W.COOLDOWN * rateScale(state, weapon);
      const a = Math.atan2(target.y - p.y, target.x - p.x);
      const n = fireCount(P);
      for (let i = 0; i < n; i++) {
        const spread = (i - (n - 1) / 2) * 0.3;
        state.projectiles.push({
          kind: 'ember',
          x: p.x, y: p.y,
          dx: Math.cos(a + spread), dy: Math.sin(a + spread),
          damage: p.stats.damage * W.DAMAGE_MULT * (P.dmgMult || 1) * dmgScale(state) * evoDmg(weapon),
          blast: (P.blast || W.BLAST) * (bigBurst ? 1.5 : 1),
          age: 0,
          evo: !!weapon.evolution,
        });
      }
    }
  }
  const burstMult = bigBurst ? 1 : W.KILL_BLAST_MULT;
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const pr = state.projectiles[i];
    if (pr.kind !== 'ember') continue;
    pr.age += dt;
    if (pr.age >= W.LIFE) {
      state.effects.push({ kind: 'mine_fizzle', x: pr.x, y: pr.y, age: 0, ttl: 0.1 });
      state.projectiles.splice(i, 1);
      continue;
    }
    pr.x += pr.dx * W.SPEED * dt;
    pr.y += pr.dy * W.SPEED * dt;
    for (const e of state.enemies) {
      if (e.hp <= 0) continue;
      if (Math.abs(pr.x - e.x) < W.HIT_R && Math.abs(pr.y - e.y) < W.HIT_R) {
        hurt(state, e, pr.damage * critRoll(p, weapon));
        if (e.hp <= 0) {
          const blast = pr.blast;
          for (const e2 of state.enemies) {
            if (e2.hp <= 0) continue;
            if (Math.hypot(e2.x - e.x, e2.y - e.y) <= blast) {
              hurt(state, e2, pr.damage * burstMult * critRoll(p, weapon));
              state.effects.push({ kind: 'mine_hit', x: e2.x, y: e2.y, age: 0, ttl: 0.1 });
            }
          }
          state.effects.push({ kind: 'mine_blast', x: e.x, y: e.y, radius: blast, shrapnel: 4, age: 0, ttl: 0.3,
            evo: pr.evo ? 'fire' : undefined });
          if (burnGround) pushFirePatch(state, e.x, e.y, blast, pr.damage, 'fire');
        } else {
          state.effects.push({ kind: 'mine_hit', x: e.x, y: e.y, age: 0, ttl: 0.1 });
        }
        state.projectiles.splice(i, 1);
        break;
      }
    }
  }
  if (burnGround) updateFirePatches(state, weapon, dt);
}

// RICOCHET — one shot flies straight; each IMPACT picks the nearest unused
// enemy inside the hop range and continues as a fresh straight segment
// (retarget on impact only, never mid-flight). Levels add bounces.
// PRISM_SHOT evolution: `splitBounce` = every impact also throws a second,
// half-damage shard at the next-nearest unused enemy (one generation);
// `endlessBounce` = twice the bounces and 1.5x the hop range.
function updateRicochet(state, weapon, dt) {
  const W = WEAPONS.RICOCHET;
  const P = weaponLevelParams('RICOCHET', weapon.level);
  const p = state.player;
  const split = evoHas(weapon, 'splitBounce');
  const endless = evoHas(weapon, 'endlessBounce');
  weapon.cd -= dt;
  if (weapon.cd <= 0) {
    const target = nearestEnemy(state, p.x, p.y);
    if (!target) { weapon.cd = 0; }
    else {
      weapon.cd = W.COOLDOWN * rateScale(state, weapon);
      const a = Math.atan2(target.y - p.y, target.x - p.x);
      state.projectiles.push({
        kind: 'ricochet',
        x: p.x, y: p.y,
        dx: Math.cos(a), dy: Math.sin(a),
        damage: p.stats.damage * W.DAMAGE_MULT * (P.dmgMult || 1) * dmgScale(state) * evoDmg(weapon),
        bounces: (P.bounces || W.BOUNCES) * (endless ? 2 : 1),
        hit: new Set(),
        age: 0, gen: 0,
        evo: !!weapon.evolution,
      });
    }
  }
  const hopRange = (P.chainRange || W.CHAIN_RANGE) * (endless ? 1.5 : 1);
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const pr = state.projectiles[i];
    if (pr.kind !== 'ricochet') continue;
    pr.age += dt;
    if (pr.age >= W.LIFE) {
      state.effects.push({ kind: 'mine_fizzle', x: pr.x, y: pr.y, age: 0, ttl: 0.1 });
      state.projectiles.splice(i, 1);
      continue;
    }
    pr.x += pr.dx * W.SPEED * dt;
    pr.y += pr.dy * W.SPEED * dt;
    for (const e of state.enemies) {
      if (e.hp <= 0 || pr.hit.has(e)) continue;
      if (Math.abs(pr.x - e.x) < W.HIT_R && Math.abs(pr.y - e.y) < W.HIT_R) {
        hurt(state, e, pr.damage * critRoll(p, weapon));
        pr.hit.add(e);
        // ricochetHit: the enemies this body has used (the Storm Bounce fusion reads it).
        state.effects.push({ kind: 'seeker_pop', x: e.x, y: e.y, age: 0, ttl: 0.1, ricochetHit: pr.hit });
        if (pr.bounces <= 0) { state.projectiles.splice(i, 1); break; }
        const nxt = nearestEnemy(state, pr.x, pr.y, pr.hit);
        if (!nxt || Math.hypot(nxt.x - pr.x, nxt.y - pr.y) > hopRange) {
          state.projectiles.splice(i, 1);
          break;
        }
        pr.bounces--;
        const a = Math.atan2(nxt.y - pr.y, nxt.x - pr.x);
        pr.dx = Math.cos(a); pr.dy = Math.sin(a);
        if (split && !(pr.gen > 0)) {
          // A prism shard toward the next-nearest unused enemy.
          const used = new Set(pr.hit); used.add(nxt);
          const alt = nearestEnemy(state, pr.x, pr.y, used);
          if (alt && Math.hypot(alt.x - pr.x, alt.y - pr.y) <= hopRange) {
            const b = Math.atan2(alt.y - pr.y, alt.x - pr.x);
            state.projectiles.push({
              kind: 'ricochet', x: pr.x, y: pr.y, dx: Math.cos(b), dy: Math.sin(b),
              damage: pr.damage * 0.5, bounces: Math.min(2, pr.bounces), hit: new Set(pr.hit),
              age: 0, gen: 1, evo: true,
            });
          }
        }
        break;
      }
    }
  }
}

// METEOR — a telegraph marks the nearest enemy's position; WINDUP later the
// rock lands as an AoE at that mark. Levels add rocks, each marking its own
// target. METEOR_STORM evolution: `storm` = twice the rocks and a shorter
// windup; `crater` = each landing burns the ground (a FIRE_PATCH) at 1.4x
// the blast radius.
function updateMeteor(state, weapon, dt) {
  const W = WEAPONS.METEOR;
  const P = weaponLevelParams('METEOR', weapon.level);
  const p = state.player;
  const storm = evoHas(weapon, 'storm');
  const crater = evoHas(weapon, 'crater');
  const blast = (P.blast || W.BLAST) * (crater ? 1.4 : 1);
  weapon.cd -= dt;
  if (weapon.swing) {
    weapon.swing.t -= dt;
    if (weapon.swing.t <= 0) {
      const marks = weapon.swing.marks;
      weapon.swing = null;
      const dmg = p.stats.damage * W.DAMAGE_MULT * (P.dmgMult || 1) * dmgScale(state) * evoDmg(weapon);
      for (const m of marks) {
        for (const e of state.enemies) {
          if (e.hp <= 0) continue;
          if (Math.hypot(e.x - m.x, e.y - m.y) <= blast) {
            hurt(state, e, dmg * critRoll(p, weapon));
            state.effects.push({ kind: 'mine_hit', x: e.x, y: e.y, age: 0, ttl: 0.1 });
          }
        }
        state.effects.push({ kind: 'mine_blast', x: m.x, y: m.y, radius: blast, shrapnel: 8, age: 0, ttl: 0.35,
          meteor: true, evo: weapon.evolution ? 'meteor' : undefined });   // the Crater Field fusion reads the landing
        if (crater) pushFirePatch(state, m.x, m.y, blast * 0.5, dmg, 'meteor');
      }
    }
  } else if (weapon.cd <= 0) {
    const count = (P.count || 1) * (storm ? 2 : 1);
    const marks = [];
    const used = new Set();
    for (let i = 0; i < count; i++) {
      const t = nearestEnemy(state, p.x, p.y, used);
      if (!t) break;
      used.add(t);
      marks.push({ x: t.x, y: t.y });
    }
    if (marks.length === 0) { weapon.cd = 0; }
    else {
      weapon.cd = W.COOLDOWN * rateScale(state, weapon);
      weapon.swing = { marks, t: W.WINDUP * (storm ? 0.6 : 1) };
      for (const m of marks) {
        state.effects.push({ kind: 'nova_pulse', x: m.x, y: m.y, radius: blast, age: 0, ttl: weapon.swing.t,
          evo: weapon.evolution ? 'meteor' : undefined });
      }
    }
  }
  if (crater) updateFirePatches(state, weapon, dt);
}

// ---------- Registry ----------
export const WEAPON_TYPES = {
  ORBIT:      { id: 'ORBIT',      name: WEAPONS.ORBIT.NAME,      update: updateOrbit },
  BOOMERANG:  { id: 'BOOMERANG',  name: WEAPONS.BOOMERANG.NAME,  update: updateBoomerang },
  JAVELIN:    { id: 'JAVELIN',    name: WEAPONS.JAVELIN.NAME,    update: updateJavelin },
  ZAP:        { id: 'ZAP',        name: WEAPONS.ZAP.NAME,        update: updateZap },
  NOVA_PULSE: { id: 'NOVA_PULSE', name: WEAPONS.NOVA_PULSE.NAME, update: updateNovaPulse },
  SCYTHE:     { id: 'SCYTHE',     name: WEAPONS.SCYTHE.NAME,     update: updateScythe },
  EMBER:      { id: 'EMBER',      name: WEAPONS.EMBER.NAME,      update: updateEmber },
  RICOCHET:   { id: 'RICOCHET',   name: WEAPONS.RICOCHET.NAME,   update: updateRicochet },
  SEEKER:     { id: 'SEEKER',     name: WEAPONS.SEEKER.NAME,     update: updateSeeker },
  METEOR:     { id: 'METEOR',     name: WEAPONS.METEOR.NAME,     update: updateMeteor },
  MINE:       { id: 'MINE',       name: WEAPONS.MINE.NAME,       update: updateMine },
  BEAM:       { id: 'BEAM',       name: WEAPONS.BEAM.NAME,       update: updateBeam },
};

// Update every weapon in a list (integration entry point). A fused weapon
// (fusions.js) runs both halves from its one place in the list; the Volley has
// no update here (main.js fires it) but may carry a fused half.
export function updateWeapons(state, weapons, dt) {
  for (const w of weapons) {
    const def = WEAPON_TYPES[w.type];
    if (def) def.update(state, w, dt);
    const half = w.fused && WEAPON_TYPES[w.fused.type];
    if (half) half.update(state, w.fused, dt);
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
  JAVELIN: WEAPONS.JAVELIN.NAME,
  ZAP: WEAPONS.ZAP.NAME,
  NOVA_PULSE: WEAPONS.NOVA_PULSE.NAME,
  SCYTHE: WEAPONS.SCYTHE.NAME,
  EMBER: WEAPONS.EMBER.NAME,
  RICOCHET: WEAPONS.RICOCHET.NAME,
  SEEKER: WEAPONS.SEEKER.NAME,
  METEOR: WEAPONS.METEOR.NAME,
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

// ---------- SLICE 6 (dev-editor): per-level step constants ------------------
// Every number the WEAPON_LEVELS ladders below step by lives HERE, and every
// level label that quotes one of those numbers is built from the same
// constant (slice-5 live-template rule: editing the step moves the damage
// curve AND the draft card text together — verified by
// test/test_weapon_overrides.mjs). Labels use string concatenation (never
// template literals) so each step stays a single literal on its own line,
// which is what the dev-editor's exact-line saver edits. Labels that describe
// a structural rule rather than a scalar (+1 blade/missile/pierce grants,
// +arc width, +turn rate, +radius) carry no numeric literal to duplicate, so
// they stay literal — only their %/radius/width/blast companions are templated.
// Percent steps are FRACTIONS (0.15 -> '15'); stepPct renders them.
function stepPct(v) {
  return String(Math.round(Number(v) * 100));
}

export const WEAPON_STEPS = {
  VOLLEY: { DMG: 0.6, PROJ_DMG: 0.2, RATE: 0.25 },
  ORBIT: { DMG: 0.40, RADIUS: 4 },
  BOOMERANG: { DMG: 0.40, SPEED: 0.15 },
  JAVELIN: { DMG: 0.40, SPEED: 0.10, RANGE: 25 },
  ZAP: { DMG: 0.35, RATE: 0.25 },
  NOVA_PULSE: { DMG: 0.35, RADIUS: 6, RATE: 0.33 },
  SCYTHE: { DMG: 0.40, ARC: 0.18, RATE: 0.25 },
  EMBER: { DMG: 0.40, BLAST: 3 },
  RICOCHET: { DMG: 0.35, RATE: 0.25 },
  SEEKER: { TURN: 0.65 },
  METEOR: { DMG: 0.30, BLAST: 4, RATE: 0.25 },
  MINE: { DMG: 0.40, BLAST: 4, RATE: 0.33 },
  BEAM: { DMG: 0.35, WIDTH: 2, RATE: 0.25, LENGTH: 60 },
};

// Label fragments shared by the ladders below.
const dmgLabel = (id) => '+' + stepPct(WEAPON_STEPS[id].DMG) + '% damage';
const rateLabel = (id) => '+' + stepPct(WEAPON_STEPS[id].RATE) + '% attack rate';

// Per-weapon ladder builders. Each level past 1 adds the weapon's DMG step, and
// most levels also change how the weapon behaves (a projectile, a pierce, a
// blade, a bounce, a chain hop, attack rate, reach). The cumulative params:
//   dmgMult      multiplies the weapon's damage
//   rateMult     multiplies its attack rate (rateScale divides cooldowns by it)
//   count        bodies per fire (boomerangs, spears, bolts, meteors)
//   pierceBonus  extra pierce (volley) / extra hits per pass (boomerang)
//   plus the weapon's own reach fields (radius, blast, arc, width, range...).
// Labels quote WEAPON_STEPS through stepPct so the dev-editor's step edits
// move the card text with the curve.
export const WEAPON_LADDERS = {
  // VOLLEY is leveled here but FIRED by main.js. Lv2/Lv6 each grant +1
  // projectile (under the volley cap) and a PROJ_DMG multiplier; Lv4 attack
  // rate; Lv7/Lv8 add pierce; the rest add DMG.
  VOLLEY: (L, c) => {
    if (L === 1) { c.dmgMult = 1; c.proj = 0; c.pierceBonus = 0; c.rateMult = 1; return 'Base volley'; }
    if (L === 2 || L === 6) { c.proj += 1; return '+1 projectile, +' + stepPct(WEAPON_STEPS.VOLLEY.PROJ_DMG) + '% damage'; }
    if (L === 7) { c.pierceBonus += 1; return '+1 pierce'; }
    if (L === 4) { c.rateMult *= 1 + WEAPON_STEPS.VOLLEY.RATE; return rateLabel('VOLLEY'); }
    c.dmgMult += WEAPON_STEPS.VOLLEY.DMG;
    if (L === 8) { c.pierceBonus += 1; return dmgLabel('VOLLEY') + ', +1 pierce'; }
    return dmgLabel('VOLLEY');
  },
  // +1 blade every even level; +radius and DMG every level past 1.
  ORBIT: (L, c) => {
    c.blades = 1 + Math.floor(L / 2);
    c.radius = WEAPONS.ORBIT.RADIUS + WEAPON_STEPS.ORBIT.RADIUS * (L - 1);
    c.dmgMult = 1 + WEAPON_STEPS.ORBIT.DMG * (L - 1);
    if (L === 1) return 'Base orbit blade';
    return L % 2 === 0 ? '+1 blade (total ' + c.blades + '), +radius, ' + dmgLabel('ORBIT')
                       : '+radius, ' + dmgLabel('ORBIT');
  },
  // DMG and flight speed every level; +1 hit per pass at Lv2/4/6 (the
  // '+1 pierce' re-hit budget); a second boomerang at Lv4, a third at Lv8.
  BOOMERANG: (L, c) => {
    c.dmgMult = 1 + WEAPON_STEPS.BOOMERANG.DMG * (L - 1);
    c.speedMult = 1 + WEAPON_STEPS.BOOMERANG.SPEED * (L - 1);
    c.pierceBonus = Math.min(3, Math.floor(L / 2));
    c.count = 1 + Math.floor(L / 4);
    if (L === 1) return 'Base boomerang';
    const base = dmgLabel('BOOMERANG') + ', +' + stepPct(WEAPON_STEPS.BOOMERANG.SPEED) + '% speed';
    const pierce = L % 2 === 0 && L <= 6 ? ', +1 pierce' : '';
    if (L % 4 === 0) return '+1 boomerang (total ' + c.count + '), ' + base + pierce;
    return base + pierce;
  },
  // DMG and flight speed every level; +range at Lv3/5/7; a second spear at
  // Lv4, a third at Lv8 (the spear already passes through every enemy).
  JAVELIN: (L, c) => {
    c.dmgMult = 1 + WEAPON_STEPS.JAVELIN.DMG * (L - 1);
    c.speedMult = 1 + WEAPON_STEPS.JAVELIN.SPEED * (L - 1);
    c.range = WEAPONS.JAVELIN.RANGE + WEAPON_STEPS.JAVELIN.RANGE * Math.floor((L - 1) / 2);
    c.count = 1 + Math.floor(L / 4);
    if (L === 1) return 'Base sun javelin';
    const base = dmgLabel('JAVELIN') + ', +' + stepPct(WEAPON_STEPS.JAVELIN.SPEED) + '% speed';
    if (L % 4 === 0) return '+1 spear (total ' + c.count + '), ' + base;
    return L % 2 === 1 ? base + ', +' + WEAPON_STEPS.JAVELIN.RANGE + ' range' : base;
  },
  // DMG every level; +1 chain target at Lv3/5/7 (3 -> 6 enemies a bolt);
  // attack rate at Lv8. The Storm Conduit shop row still uncaps the walk.
  ZAP: (L, c) => {
    c.dmgMult = 1 + WEAPON_STEPS.ZAP.DMG * (L - 1);
    c.jumps = Math.floor((L - 1) / 2);
    c.rateMult = L >= 8 ? 1 + WEAPON_STEPS.ZAP.RATE : 1;
    if (L === 1) return 'Base chain zap';
    if (L === 8) return dmgLabel('ZAP') + ', ' + rateLabel('ZAP');
    return L % 2 === 1 ? dmgLabel('ZAP') + ', +1 chain target (total ' + (WEAPONS.ZAP.COUNT + c.jumps) + ')'
                       : dmgLabel('ZAP');
  },
  // +radius and DMG every level; attack rate at Lv4 and Lv8.
  NOVA_PULSE: (L, c) => {
    c.radius = WEAPONS.NOVA_PULSE.RADIUS + WEAPON_STEPS.NOVA_PULSE.RADIUS * (L - 1);
    c.dmgMult = 1 + WEAPON_STEPS.NOVA_PULSE.DMG * (L - 1);
    c.rateMult = Math.pow(1 + WEAPON_STEPS.NOVA_PULSE.RATE, Math.floor(L / 4));
    if (L === 1) return 'Base nova pulse';
    const base = '+' + WEAPON_STEPS.NOVA_PULSE.RADIUS + ' radius, ' + dmgLabel('NOVA_PULSE');
    return L % 4 === 0 ? base + ', ' + rateLabel('NOVA_PULSE') : base;
  },
  // +arc width and DMG every level; attack rate at Lv4 and Lv8.
  SCYTHE: (L, c) => {
    c.arc = WEAPONS.SCYTHE.ARC + WEAPON_STEPS.SCYTHE.ARC * (L - 1);
    c.dmgMult = 1 + WEAPON_STEPS.SCYTHE.DMG * (L - 1);
    c.rateMult = Math.pow(1 + WEAPON_STEPS.SCYTHE.RATE, Math.floor(L / 4));
    if (L === 1) return 'Base scythe';
    const base = '+arc width, ' + dmgLabel('SCYTHE');
    return L % 4 === 0 ? base + ', ' + rateLabel('SCYTHE') : base;
  },
  // DMG and burst radius every level; a second bolt at Lv3, a third at Lv6.
  EMBER: (L, c) => {
    c.dmgMult = 1 + WEAPON_STEPS.EMBER.DMG * (L - 1);
    c.blast = WEAPONS.EMBER.BLAST + WEAPON_STEPS.EMBER.BLAST * (L - 1);
    c.count = 1 + Math.floor(L / 3);
    if (L === 1) return 'Base ember shot';
    const base = dmgLabel('EMBER') + ', +' + WEAPON_STEPS.EMBER.BLAST + ' blast radius';
    return L % 3 === 0 ? '+1 bolt (total ' + c.count + '), ' + base : base;
  },
  // DMG every level; +1 bounce every even level (3 -> 6); attack rate at Lv5.
  RICOCHET: (L, c) => {
    c.dmgMult = 1 + WEAPON_STEPS.RICOCHET.DMG * (L - 1);
    c.bounces = WEAPONS.RICOCHET.BOUNCES + Math.floor(L / 2) - 1;
    c.rateMult = L >= 5 ? 1 + WEAPON_STEPS.RICOCHET.RATE : 1;
    if (L === 1) return 'Base ricochet';
    if (L === 5) return dmgLabel('RICOCHET') + ', ' + rateLabel('RICOCHET');
    return L % 2 === 0
      ? '+1 bounce (total ' + (c.bounces + 1) + '), ' + dmgLabel('RICOCHET')
      : dmgLabel('RICOCHET');
  },
  // +1 missile every even level, +turn rate every level (damage rides the
  // WEAPON_DMG_OVERRIDES curve).
  SEEKER: (L, c) => {
    c.count = 1 + Math.floor(L / 2);
    c.turn = WEAPONS.SEEKER.TURN + WEAPON_STEPS.SEEKER.TURN * (L - 1);
    if (L === 1) return 'Base seeker missile';
    return L % 2 === 0 ? '+1 missile (total ' + c.count + '), +turn rate' : '+turn rate';
  },
  // DMG and blast radius every level; a second rock at Lv4, a third at Lv8
  // (each rock marks its own target); attack rate at Lv6.
  METEOR: (L, c) => {
    c.dmgMult = 1 + WEAPON_STEPS.METEOR.DMG * (L - 1);
    c.blast = WEAPONS.METEOR.BLAST + WEAPON_STEPS.METEOR.BLAST * (L - 1);
    c.count = 1 + Math.floor(L / 4);
    c.rateMult = L >= 6 ? 1 + WEAPON_STEPS.METEOR.RATE : 1;
    if (L === 1) return 'Base meteor';
    const base = dmgLabel('METEOR') + ', +' + WEAPON_STEPS.METEOR.BLAST + ' blast radius';
    if (L % 4 === 0) return '+1 meteor (total ' + c.count + '), ' + base;
    return L === 6 ? base + ', ' + rateLabel('METEOR') : base;
  },
  // DMG and blast radius every level; drop rate and +2 mines on the field at
  // Lv4 and Lv8.
  MINE: (L, c) => {
    c.dmgMult = 1 + WEAPON_STEPS.MINE.DMG * (L - 1);
    c.blast = WEAPONS.MINE.BLAST + WEAPON_STEPS.MINE.BLAST * (L - 1);
    c.rateMult = Math.pow(1 + WEAPON_STEPS.MINE.RATE, Math.floor(L / 4));
    c.extraMines = 2 * Math.floor(L / 4);
    if (L === 1) return 'Base mine layer';
    const base = dmgLabel('MINE') + ', +' + WEAPON_STEPS.MINE.BLAST + ' blast radius';
    return L % 4 === 0 ? base + ', +2 mines, ' + rateLabel('MINE') : base;
  },
  // +width and DMG every level; attack rate at Lv4 and Lv8; +length at Lv6.
  BEAM: (L, c) => {
    c.width = WEAPONS.BEAM.WIDTH + WEAPON_STEPS.BEAM.WIDTH * (L - 1);
    c.dmgMult = 1 + WEAPON_STEPS.BEAM.DMG * (L - 1);
    c.rateMult = Math.pow(1 + WEAPON_STEPS.BEAM.RATE, Math.floor(L / 4));
    c.length = WEAPONS.BEAM.LENGTH + (L >= 6 ? WEAPON_STEPS.BEAM.LENGTH : 0);
    if (L === 1) return 'Base beam';
    const base = '+' + WEAPON_STEPS.BEAM.WIDTH + ' width, ' + dmgLabel('BEAM');
    if (L % 4 === 0) return base + ', ' + rateLabel('BEAM');
    return L === 6 ? base + ', +' + WEAPON_STEPS.BEAM.LENGTH + ' length' : base;
  },
};

export const WEAPON_LEVELS = Object.fromEntries(
  Object.entries(WEAPON_LADDERS).map(([id, step]) => [id, buildLevels(WEAPON_MAX_LEVEL, step)]));

// ---------- SLICE 6 (dev-editor): sparse per-level DAMAGE overrides ---------
// WEAPON_DMG_OVERRIDES maps weaponId -> { level: dmgMult } (levels 1-based,
// like the draft cards). weaponLevelParams() consults
// `WEAPON_DMG_OVERRIDES[weaponId]?.[level] ?? formula`, so a weapon can shape
// its damage curve (cheap early hook, prestige capstone) without turning
// every level into a number. Levels NOT listed fall back to the WEAPON_LEVELS
// formula. Empty = byte-identical behaviour (pinned by
// test/test_weapon_overrides.mjs). The draft labels do NOT reflect overrides
// (same caveat as shop cost overrides vs shop descs); the editor marks
// overridden levels with diamonds on the graph.
export const WEAPON_DMG_OVERRIDES = {
  SEEKER: { 1: 1, 2: 1.2, 3: 1.4, 4: 1.6, 5: 1.8, 6: 2, 7: 2.2, 8: 2.4 },
};

// Rebuild one weapon's level table from the current WEAPON_STEPS (dev-editor
// slice 6): a step edit lands in the steps table, then this re-runs the
// game's OWN ladder builder, so WEAPON_LEVELS, weaponLevelParams and the
// draft labels move together with no page reload and no duplicated math.
// Gameplay never calls it (tables build once at import); the editor calls it
// after a step save. Returns false for unknown ids.
export function rebuildWeaponTable(weaponId) {
  const step = WEAPON_LADDERS[weaponId];
  if (!step) return false;
  WEAPON_LEVELS[weaponId] = buildLevels(WEAPON_MAX_LEVEL, step);
  return true;
}

// Cumulative parameters for (weaponId, level). Clamps level to 1..MAX.
// Unknown ids get neutral params so callers can apply it blindly. A level
// listed in WEAPON_DMG_OVERRIDES pays its override dmgMult; every other
// level pays the WEAPON_LEVELS formula (slice 6, dev-editor shaped curves).
export function weaponLevelParams(weaponId, level) {
  const table = WEAPON_LEVELS[weaponId];
  if (!table) return { dmgMult: 1 };
  const lv = Math.max(1, Math.min(WEAPON_MAX_LEVEL, level || 1));
  const params = { ...table[lv - 1].effects };
  const ov = WEAPON_DMG_OVERRIDES[weaponId]?.[lv];
  if (ov !== undefined) params.dmgMult = ov;
  return params;
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
export const WEAPON_XP_BASE = 20;   // xp needed: BASE * current level (gems trickle 1 each; draft cards jump ahead)

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
