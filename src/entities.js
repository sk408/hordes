// HORDES — entities: player, enemies, projectiles, gems
import { CONFIG as C, ladderHp, ladderXp, ladderDmg, xpForLevel } from './config.js';
import { wrathOf, wrathMultipliers } from './wrath.js';

export function makePlayer() {
  return {
    x: 0, y: 0,
    hp: C.PLAYER.MAX_HP,
    invuln: 0,
    level: 1,
    xp: 0,
    xpNext: xpForLevel(1),
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
    skillCd: { FROST_NOVA: 0, OVERCHARGE: 0, CHAIN_REACTION: 0 }, // seconds remaining
    buffs: { overcharge: 0 },
    // G8 step 3 (src/rules.js): the run's persistent CONDITIONS (Horde Bait /
    // One of Each) and the stat ledger `once` reads. G8 step 4 (src/perks.js):
    // the run's always-on PERKS (Regrowth / Focus / Thick Skin). G8 step 2
    // (src/rewrites.js): the run's MECHANIC REWRITES (Pierce All / Chain
    // Reaction / Blood Harvest). All live on the RUN player, exactly like
    // draftCounts, so a fresh makePlayer() is a fresh run and none of it
    // enters the save schema.
    rules: {},
    takenStats: {},
    skills: {},
    rewrites: {},
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
    // G21 slice 1 (IGNITE): the burn DoT. burn = seconds left, burnDps = the
    // snapshotted damage per second; ticked dt-driven beside the slow decay
    // (main.js), never stacked (a fresh direct hit refreshes both), and burn
    // damage never triggers riders and never detonates (no chain-of-chains).
    burn: 0,
    burnDps: 0,
  };
}

// ---------- Escalation curves: the wave ladder (config.js LADDER) -----------
export const hpScale = ladderHp;
export const xpScale = ladderXp;
export const dmgScale = ladderDmg;

// ---------- CONTACT DAMAGE ---------------------------------------------------
// What touching an enemy costs the player (see CONFIG.SURVIVAL):
//   raw = base * dmgMult^CONTACT_POW * typeMult * chargeMult
//   hit = min(raw, maxHp * HIT_CAP_FRAC)
// dmgMult is the ladder's damage curve. PURE.
export function contactHitDamage(base, dmgMult, typeMult, chargeMult, maxHp) {
  const S = C.SURVIVAL;
  const scaled = Math.pow(Math.max(0.05, dmgMult || 1), S.CONTACT_POW);
  const raw = base * scaled * (typeMult || 1) * (chargeMult || 1);
  const cap = Math.max(1, (maxHp || C.PLAYER.MAX_HP) * S.HIT_CAP_FRAC);
  return Math.min(raw, cap);
}

// ---------- applyEscalation (single source of truth) -----------------------
// Re-scale a freshly-made typed enemy onto the ladder: back out
// enemy_types.js's linear preview multipliers (1+0.35w hp / 1+0.25w xp) and
// apply the ladder curves instead. WRATH multiplies hp on top (never xp).
// Shared by main.js and chests.js. `t` defaults to state.time.
export function applyEscalation(state, e, t) {
  const time = (t === undefined ? (state && state.time) : t) || 0;
  const w = Math.floor(time / 30);
  const hpMult = e.hp / (C.ENEMY.BASE_HP * (1 + w * 0.35));
  const xpMult = e.xp / (C.ENEMY.BASE_XP * (1 + w * 0.25));
  const hp = C.ENEMY.BASE_HP * hpScale(w) * hpMult * wrathMultipliers(wrathOf(state)).hp;
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

// ---- R3 floor: gems merge for real (C.FLOOR) --------------------------------
// A merged gem holds the exact sum of the XP that went into it (xp) and how
// many gems it is (n: each one still feeds weapon XP and Storm Shards once).
// The gem nearer the hero is the one that stays, so XP only ever moves toward
// him. A gem in `keep` (the pilot's chosen gem) is never merged away; it can
// grow. Both functions edit `arr` in place and keep its order. PURE otherwise.
function absorbGem(into, g) {
  into.xp += g.xp;
  into.n = (into.n || 1) + (g.n || 1);
}
function dropGone(arr, gone) {
  if (!gone.size) return;
  let w = 0;
  for (let i = 0; i < arr.length; i++) if (!gone.has(arr[i])) arr[w++] = arr[i];
  arr.length = w;
}

// Condense: each gem older than `age` that has another old gem within `r`
// merges into it (the one nearer the hero stays). A gem that has just merged
// (mt, the time it last took one in) rests `rest` s before it merges again, and
// takes in at most one gem a pass, so a field gathers step by step (90 gems ->
// 45 -> 23 ...), not all at once. Returns the merges done.
export function condenseGems(arr, hx, hy, now, { age, r, rest = 0, keep = null }) {
  const old = [];
  for (const g of arr) if (now - (g.t ?? now) >= age && !(now - (g.mt ?? -Infinity) < rest)) old.push(g);
  if (old.length < 2) return 0;
  const r2 = r * r, gone = new Set(), took = new Set();
  const d2h = (g) => (g.x - hx) * (g.x - hx) + (g.y - hy) * (g.y - hy);
  // Farthest first, so piles fold inward.
  old.sort((a, b) => d2h(b) - d2h(a));
  for (let i = 0; i < old.length; i++) {
    const g = old[i];
    if (gone.has(g) || (keep && keep.has(g))) continue;
    const dg = d2h(g);
    let best = null, bd = r2;
    for (let j = 0; j < old.length; j++) {
      const h = old[j];
      if (h === g || gone.has(h) || d2h(h) > dg) continue;
      const q = (h.x - g.x) * (h.x - g.x) + (h.y - g.y) * (h.y - g.y);
      if (q <= bd) { bd = q; best = h; }
    }
    if (!best) continue;
    absorbGem(best, g);
    best.mt = now;
    gone.add(g);
    gone.add(best); took.add(best);   // it rests now: no more this pass
  }
  for (const g of took) gone.delete(g);
  dropGone(arr, gone);
  return gone.size;
}

// Cap: past `cap` gems, the oldest and farthest (outside `near` px of the hero)
// merge into their nearest gem that lies nearer the hero, until `target` are
// left. Returns the merges done.
// A kill burst can lift the floor to hundreds of gems in one frame, so each
// gem's place and its squared distance to the hero are read ONCE into flat
// arrays; the inner loop only does arithmetic on them (a merge never moves
// the gem that stays).
export function capGems(arr, hx, hy, now, { cap, target, near, keep = null }) {
  const n = arr.length;
  if (n <= cap) return 0;
  const xs = new Float64Array(n), ys = new Float64Array(n), d2 = new Float64Array(n);
  const cand = [];
  for (let i = 0; i < n; i++) {
    const g = arr[i];
    const x = g.x, y = g.y;
    xs[i] = x; ys[i] = y;
    d2[i] = (x - hx) * (x - hx) + (y - hy) * (y - hy);
    if (keep && keep.has(g)) continue;
    if (d2[i] > near * near) {
      const d = Math.sqrt(d2[i]);
      cand.push({ i, s: d + 10 * (now - (g.t ?? now)) });   // 1 s of age weighs as 10 px
    }
  }
  cand.sort((a, b) => b.s - a.s);
  const gone = new Uint8Array(n);
  let goneN = 0;
  for (const c of cand) {
    if (n - goneN <= target) break;
    const ci = c.i, cx = xs[ci], cy = ys[ci], cd = d2[ci];
    let best = -1, bd = Infinity;
    for (let j = 0; j < n; j++) {
      if (j === ci || gone[j] || d2[j] > cd) continue;
      const q = (xs[j] - cx) * (xs[j] - cx) + (ys[j] - cy) * (ys[j] - cy);
      if (q < bd) { bd = q; best = j; }
    }
    if (best < 0) continue;
    absorbGem(arr[best], arr[ci]);
    gone[ci] = 1; goneN++;
  }
  if (goneN) {
    let w = 0;
    for (let i = 0; i < n; i++) if (!gone[i]) arr[w++] = arr[i];
    arr.length = w;
  }
  return goneN;
}

// The rich step of a gem: 0 for an ordinary gem, 1..steps.length for a merged
// gem holding at least steps[k-1] XP.
export function richStep(g, steps) {
  if (!g || (g.n || 1) < 2) return 0;
  let k = 0;
  while (k < steps.length && g.xp >= steps[k]) k++;
  return k;
}

// M3 (audit 2026-09-16): the ground-item arrays (gems / potion drops / item
// drops) were UNBOUNDED — a 10,000-corpse wave left 10,000 gems on the floor
// and every pickup scan is O(n) per frame. VALUE-PRESERVING overflow: when
// the array is at cap, the new item is ABSORBED into the NEAREST same-kind
// entry — the proximity-chosen SURVIVOR keeps its own position (the pile
// stays where the pile is) and the caller's `absorb` moves the value across,
// so the total collectable value never changes. Below the cap this is a
// plain push (single-item behaviour byte-identical).PURE apart from the arr
// mutation the caller asked for.
export function pushGroundCapped(arr, item, cap, kindOf, absorb) {
  if (arr.length < cap) { arr.push(item); return item; }
  const kind = kindOf(item);
  let best = -1, bd = Infinity;
  for (let i = 0; i < arr.length; i++) {
    if (kindOf(arr[i]) !== kind) continue;
    const dx = arr[i].x - item.x, dy = arr[i].y - item.y;
    const d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = i; }
  }
  if (best < 0) { arr.push(item); return item; }   // no same-kind peer (never for gems/potions)
  absorb(arr[best], item);
  return arr[best];
}
