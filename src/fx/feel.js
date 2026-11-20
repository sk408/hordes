// HORDES — game feel. An observer over the sim: once per sim step it compares
// the live state with what it saw last step and turns the differences into
// feedback — damage numbers, death puffs, a light knockback, screen shake,
// pickup sparkles, the level-up burst — and the matching sound events.
// The sim never calls into the pools; it only calls feelStep(state, dt) after
// each update, so every timer here advances on sim dt and is safe under the
// N-substeps-per-frame speed path. Nothing here uses Math.random (the sim's
// roll order must not move); jitter comes from a private hash.
import { enemySpriteFor } from '../enemy_sprites.js';
import { SPRITES, BOSS_SPRITE } from '../sprites.js';
import { ANIM, actorAnimOn, stepFacing, facingWeight } from '../actor_anim.js';

export const FEEL = {
  NUM_CAP: 48,          // live damage numbers
  NUM_TTL: 0.65,
  NUM_RISE: 16,         // px floated over the life
  MERGE_S: 0.22,        // a number this young absorbs a nearby new hit
  MERGE_R: 10,          // ...within this many px
  MERGE_R_DENSE: 30,    // ...or this many once the pool is mostly full
  DENSE_FRAC: 0.6,
  PUFF_CAP: 56,
  SPARK_CAP: 72,
  BURST_CAP: 8,
  CORPSE_CAP: 40,       // bodies folding down before their puff
  // Knockback: small bodies only, never elites, bosses or planted turrets.
  KB_MAX_W: 15,         // widest body that is pushed
  KB_SPEED: 46,         // px/s at the instant of the hit
  KB_DECAY: 16,         // 1/s (travel is about KB_SPEED / KB_DECAY = 2.9px)
  KB_COOLDOWN: 0.35,    // s between pushes on one body
  KB_MIN_FRAC: 0.05,    // hits under this share of max hp do not push
  SHAKE_MAX: 5,         // px
  SHAKE_DECAY: 9,       // 1/s
  HURT_FLASH: 0.22,     // s the player sprite flashes after a hit
  COMBO_WINDOW: 0.9,    // s between gem pickups that keep the pitch rising
  COIN_WINDOW: 1.2,     // s between gold gains that keep a coin streak going
  ELITE_QUIET: 8,       // s with no new elite before the growl marks an arrival again
};

function freshFeel() {
  return {
    time: 0, pass: 0, player: null,
    nums: [], puffs: [], sparks: [], bursts: [], corpses: [],
    hero: { face: 1, vxs: 0, spd: 0, lx: null, ly: null },
    shake: 0, shakeT: 0, hurtT: 0,
    hp: null, xp: null, level: null, potHp: null, potMp: null,
    combo: 0, comboT: 0,
    gold: null, coinStreak: 0, coinT: 0,
    eliteQuiet: Infinity,   // s since an elite last arrived (the first one always growls)
    track: new WeakMap(), prev: [], cur: [],
    seenFx: new WeakSet(), groundPrev: [], groundCur: [],
    crits: new WeakSet(),
    seed: 1,
    hitAvg: 0,     // running average of one hit on an enemy (what counts as a big hit)
  };
}

export function feelOf(state) {
  if (!state.feel) state.feel = freshFeel();
  return state.feel;
}

// A crit landed on `e` this step (called at the roll sites); the next number
// raised for that enemy is drawn as a crit.
export function markCrit(state, e) {
  if (e) feelOf(state).crits.add(e);
}

let sounds = null;       // { playSfx(name, arg) } — the audio module, once set
export function setFeelAudio(a) { sounds = a || null; }
function sfx(name, arg) {
  if (sounds && sounds.playSfx) { try { sounds.playSfx(name, arg); } catch { /* never block the sim */ } }
}

let shakeOn = true;      // the settings toggle (reduced motion is read at draw time)
export function setShakeEnabled(b) { shakeOn = !!b; }
export function getShakeEnabled() { return shakeOn; }

// The NUMBERS setting: which damage numbers are drawn. Drawing only: the pool
// above keeps every number (and every point of damage) whatever the mode.
//   all: every hit (the default), calmer late in a run (fx/feel_render.js)
//   big: only crits, kills, big hits and the hero's own hurt numbers
//   off: no damage numbers at all
export const NUMBER_MODES = ['all', 'big', 'off'];
let numbersMode = 'all';
export function setNumbersMode(m) { numbersMode = NUMBER_MODES.includes(m) ? m : 'all'; }
export function getNumbersMode() { return numbersMode; }

function rnd(f) {        // private LCG, 0..1
  f.seed = (Math.imul(f.seed, 1664525) + 1013904223) >>> 0;
  return f.seed / 4294967296;
}

// ---- body colour of an enemy (for its death puff) ---------------------------
const bodyCache = new WeakMap();
export function bodyColourOf(e) {
  const spr = e.boss ? (e.bossSprite || BOSS_SPRITE) : (enemySpriteFor(e.typeId) || SPRITES[e.typeId]);
  if (!spr) return '#bebac4';
  // bossdark: a boss's body is dark on purpose; its puff is its bright rim.
  if (e.boss && spr.rim) return spr.rim;
  let c = bodyCache.get(spr);
  if (!c) {
    const cnt = {};
    for (const row of spr.frames[0]) for (const v of row) if (v) cnt[v] = (cnt[v] || 0) + 1;
    const k = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0];
    c = spr.palette[k] || '#bebac4';
    bodyCache.set(spr, c);
  }
  return c;
}

// ---- pools -------------------------------------------------------------------
// Add `value` damage at (x, y). Young neighbours absorb it; a full pool
// merges into its nearest number, so the count never passes NUM_CAP.
export function addNumber(f, x, y, value, kind = 'hit', owner = null) {
  const dense = f.nums.length >= FEEL.NUM_CAP * FEEL.DENSE_FRAC;
  const r = dense ? FEEL.MERGE_R_DENSE : FEEL.MERGE_R;
  let best = null, bestD = Infinity;
  for (const n of f.nums) {
    if (n.kind === 'hurt' !== (kind === 'hurt')) continue;
    if (n.age > FEEL.MERGE_S && !(owner && n.owner === owner && n.age < FEEL.MERGE_S * 2)) continue;
    const d = (n.owner && n.owner === owner) ? 0 : Math.hypot(n.x - x, n.y0 - y);
    if (d <= r && d < bestD) { best = n; bestD = d; }
  }
  if (!best && f.nums.length >= FEEL.NUM_CAP) {
    // Full: fold into the nearest number of the same family, whatever its age.
    for (const n of f.nums) {
      if (n.kind === 'hurt' !== (kind === 'hurt')) continue;
      const d = Math.hypot(n.x - x, n.y0 - y);
      if (d < bestD) { best = n; bestD = d; }
    }
    if (!best) return null;
  }
  if (best) {
    best.value += value;
    best.merged++;
    if (kind === 'crit') best.kind = 'crit';
    best.age = Math.min(best.age, FEEL.NUM_TTL * 0.15);   // re-pop, keep rising
    return best;
  }
  const n = { x: x + (rnd(f) - 0.5) * 6, y0: y, value, kind, owner, age: 0, ttl: FEEL.NUM_TTL, merged: 0 };
  f.nums.push(n);
  return n;
}

function pushCapped(arr, item, cap) {
  if (arr.length >= cap) arr.shift();
  arr.push(item);
}

// `delay` s: the puff waits (age below 0, not drawn) while the body collapses.
export function addPuff(f, e, big, delay = 0) {
  const w = e.w || 10;
  const cls = e.boss ? 3 : (e.elite || big) ? 2 : w > 13 ? 1 : 0;
  pushCapped(f.puffs, {
    x: e.x, y: e.y - (e.flying ? (e.z || 0) : 0), cls, colour: bodyColourOf(e),
    age: -delay, ttl: [0.26, 0.32, 0.42, 0.7][cls], rot: rnd(f) * 6.283, r: w * 0.6,
  }, FEEL.PUFF_CAP);
}

// A killed body folds down where it stood before its puff (drawn by
// render.js from the body itself: its sprite, frame and facing at death).
function addCorpse(f, e, face) {
  pushCapped(f.corpses, { e, face, age: 0, ttl: ANIM.COLLAPSE_S }, FEEL.CORPSE_CAP);
}

// The feel record of a live body (its facing and walk speed), or null.
export function trackOf(state, e) {
  const f = state.feel;
  return f ? (f.track.get(e) || null) : null;
}

export function addSparks(f, x, y, colour, n, speed = 30) {
  for (let i = 0; i < n; i++) {
    const a = rnd(f) * 6.283, v = speed * (0.4 + rnd(f) * 0.8);
    pushCapped(f.sparks, { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 14, colour, age: 0, ttl: 0.28 + rnd(f) * 0.25 },
      FEEL.SPARK_CAP);
  }
}

export function addShake(f, amount) {
  f.shake = Math.min(FEEL.SHAKE_MAX, Math.max(f.shake, amount));
}

// Integer world-px offset for this frame (0,0 when shake is off).
export function shakeOffset(state, reducedMotion) {
  const f = state.feel;
  if (!f || !shakeOn || reducedMotion || f.shake < 0.5) return { x: 0, y: 0 };
  const t = f.shakeT * 55;
  return { x: Math.round(Math.sin(t * 1.3) * f.shake), y: Math.round(Math.cos(t * 1.7) * f.shake * 0.8) };
}

function agePool(arr, dt) {
  let w = 0;
  for (let i = 0; i < arr.length; i++) {
    const o = arr[i];
    o.age += dt;
    if (o.age < o.ttl) arr[w++] = o;
  }
  arr.length = w;
}

const kinds = new WeakMap();   // ground item -> 'chest' | 'item'
const SLAM_KINDS = { boss_nova: 2.5, colossus_shock: 2, mine_blast: 1, flash: 3 };
// Weapon-fire sound family by what a weapon puts on the field: an effect
// kind or a projectile kind (the volley's own shot is sounded at its site).
const FIRE_BY_FX = {
  scythe_arc: 'fire_arc', beam: 'fire_zap', zap: 'fire_zap',
  nova: 'fire_blast', nova_pulse: 'fire_blast', mine_blast: 'fire_blast', rewrite_boom: 'fire_blast',
};
const FIRE_BY_PROJ = {
  boomerang: 'fire_arc', seeker: 'fire_seek', javelin: 'fire_bolt', ricochet: 'fire_bolt',
  ember: 'fire_blast', mine: 'fire_seek',
};
const PICK_R = 46;   // a ground item that vanishes this close to the player was picked up

// ---- the per-step observer ---------------------------------------------------
export function feelStep(state, dt) {
  const p = state.player;
  if (!p) return;
  let f = feelOf(state);
  // A new run (fresh player object or the clock rewound) starts clean.
  if (f.player !== p || (state.time || 0) < f.time - 0.25) {
    f = state.feel = freshFeel();
    f.player = p;
  }
  f.time = state.time || 0;
  f.pass++;

  agePool(f.nums, dt);
  agePool(f.puffs, dt);
  agePool(f.bursts, dt);
  agePool(f.corpses, dt);
  for (const s of f.sparks) { s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 60 * dt; }
  agePool(f.sparks, dt);
  f.shake = Math.max(0, f.shake - f.shake * FEEL.SHAKE_DECAY * dt - 0.6 * dt);
  f.shakeT += dt;
  f.hurtT = Math.max(0, f.hurtT - dt);
  f.comboT = Math.max(0, f.comboT - dt);
  if (f.comboT <= 0) f.combo = 0;
  f.eliteQuiet += dt;
  f.coinT = Math.max(0, f.coinT - dt);
  if (f.coinT <= 0) f.coinStreak = 0;

  // -- enemies: hits (numbers + knockback) and removals (puffs) --
  const cur = f.cur; cur.length = 0;
  const faceK = facingWeight(dt);
  let hitThisStep = false, critThisStep = false, bossAlive = false;
  const scan = (e) => {
    let r = f.track.get(e);
    if (!r) {
      // face: a new body looks toward the hero until it walks somewhere.
      r = { hp: e.hp, pass: 0, kvx: 0, kvy: 0, kcd: 0, lx: e.x, ly: e.y, face: e.x > p.x ? -1 : 1, vxs: 0, spd: 0 };
      f.track.set(e, r);
      if (e.boss || e.finalBoss) { sfx('bossArrive'); addShake(f, 3); }
      else if (e.elite && e.hp > 0) {
        // Red-orange danger has a sound. It marks an ARRIVAL: the first elite
        // after a quiet spell growls. Late in a run elites come more than once
        // a second, and a growl for each (even one in 4 s) was a steady beat
        // that told the player nothing.
        if (f.eliteQuiet >= FEEL.ELITE_QUIET) sfx('eliteArrive');
        f.eliteQuiet = 0;
      }
    }
    if ((e.boss || e.finalBoss) && e.hp > 0) bossAlive = true;
    r.pass = f.pass;
    cur.push(e);
    // Facing and walk speed from the body's own move this step (the shove
    // below is left out: it was added after lx was taken last step).
    stepFacing(r, e.x - r.lx, e.y - r.ly, dt, faceK);
    const dmg = r.hp - e.hp;
    if (dmg > 0.01) {
      hitThisStep = true;
      const crit = f.crits.has(e);
      if (crit) { f.crits.delete(e); critThisStep = true; }
      f.hitAvg = f.hitAvg > 0 ? f.hitAvg * 0.98 + dmg * 0.02 : dmg;
      const num = addNumber(f, e.x, e.y - (e.h || 10) / 2 - (e.flying ? (e.z || 0) : 0) - 2, dmg, crit ? 'crit' : 'hit', e);
      if (num && e.hp <= 0) num.kill = true;   // the killing blow reads large
      if (!e.boss && !e.elite && !e.finalBoss && !e.attached && (e.w || 0) <= FEEL.KB_MAX_W &&
          (e.speed || 0) > 0 && r.kcd <= 0 && e.hp > 0 && dmg >= (e.maxHp || 1) * FEEL.KB_MIN_FRAC) {
        const dx = e.x - p.x, dy = e.y - p.y, len = Math.hypot(dx, dy) || 1;
        r.kvx = (dx / len) * FEEL.KB_SPEED; r.kvy = (dy / len) * FEEL.KB_SPEED;
        r.kcd = FEEL.KB_COOLDOWN;
      }
    }
    r.hp = e.hp;
    if (r.kcd > 0) r.kcd -= dt;
    if (r.kvx !== 0 || r.kvy !== 0) {
      e.x += r.kvx * dt; e.y += r.kvy * dt;
      const k = Math.max(0, 1 - FEEL.KB_DECAY * dt);
      r.kvx *= k; r.kvy *= k;
      if (Math.abs(r.kvx) + Math.abs(r.kvy) < 2) { r.kvx = 0; r.kvy = 0; }
    }
    r.lx = e.x; r.ly = e.y;
  };
  for (const e of state.enemies) scan(e);
  if (state.finalBoss && state.mode === 'finale') scan(state.finalBoss);
  let deaths = 0, bigDeath = 0;
  for (const e of f.prev) {
    const r = f.track.get(e);
    if (!r || r.pass === f.pass) continue;
    if (Math.abs(e.x - p.x) > 320 || Math.abs(e.y - p.y) > 220) continue;   // far off screen
    if (e.quietDeath) {
      // The portal beat draws this boss's death itself (main.js): no second
      // body folding on the spot, no puff behind its sinking sprite.
    } else if (actorAnimOn() && !e.finalBoss) {
      addCorpse(f, e, r.face);
      addPuff(f, e, false, ANIM.COLLAPSE_S);
    } else addPuff(f, e, false);
    deaths++;
    // Its last number shows the kill (a body can leave the list before its hp shows 0).
    for (const n of f.nums) if (n.owner === e) n.kill = true;
    if (e.boss) bigDeath = Math.max(bigDeath, 2);
    else if (e.elite) bigDeath = Math.max(bigDeath, 1);
  }
  { const old = f.prev; f.prev = cur; f.cur = old; }
  if (sounds && sounds.setMusicMode) sounds.setMusicMode(bossAlive ? 'boss' : 'run');
  if (hitThisStep) sfx('hit');
  if (critThisStep) sfx('crit');   // one ping per step at most; audio.js rate-limits it further
  if (deaths > 0) sfx(bigDeath === 2 ? 'bossDeath' : bigDeath === 1 ? 'eliteDeath' : 'kill');
  if (bigDeath === 2) addShake(f, 5); else if (bigDeath === 1) addShake(f, 2.5);

  // -- player: facing (a jump of 40 px or more is a teleport, not a walk) --
  {
    const h = f.hero;
    if (h.lx !== null && Math.hypot(p.x - h.lx, p.y - h.ly) < 40) stepFacing(h, p.x - h.lx, p.y - h.ly, dt);
    h.lx = p.x; h.ly = p.y;
  }

  // -- player: hurt, xp (gem pickup), level, potions --
  if (f.hp !== null && p.hp < f.hp - 0.01 && p.hp > -1e6) {
    const lost = f.hp - p.hp;
    const frac = lost / Math.max(1, (p.stats && p.stats.maxHp) || 100);
    addNumber(f, p.x, p.y - 12, lost, 'hurt', p);
    addShake(f, 2 + Math.min(2.5, frac * 14));
    f.hurtT = FEEL.HURT_FLASH;
    sfx('hurt');
  }
  f.hp = p.hp;
  if (f.xp !== null && f.level === p.level && p.xp > f.xp + 1e-6) {
    f.combo = f.comboT > 0 ? Math.min(12, f.combo + 1) : 0;
    f.comboT = FEEL.COMBO_WINDOW;
    addSparks(f, p.x, p.y + 2, '#4dffd2', 2, 22);
    sfx('gem', f.combo);
  }
  if (f.level !== null && p.level > f.level) {
    pushCapped(f.bursts, { kind: 'levelup', x: p.x, y: p.y, age: 0, ttl: 0.7 }, FEEL.BURST_CAP);
    addSparks(f, p.x, p.y, '#f0c860', 14, 60);
  }
  f.xp = p.xp; f.level = p.level;
  // -- gold into the run's purse (kills, urns, the survival pay): a coin --
  const earned = state.runCounts && state.runCounts.gold ? state.runCounts.gold.earned : null;
  if (typeof earned === 'number') {
    if (f.gold !== null && earned > f.gold) {
      sfx('coin', f.coinStreak);
      f.coinStreak++;
      f.coinT = FEEL.COIN_WINDOW;
    }
    f.gold = earned;
  }
  if (p.potions) {
    if (f.potHp !== null && (p.potions.hp > f.potHp || p.potions.mp > f.potMp)) {
      addSparks(f, p.x, p.y, p.potions.hp > f.potHp ? '#e06a74' : '#a4c4fc', 8, 40);
      sfx('potion');
    }
    f.potHp = p.potions.hp; f.potMp = p.potions.mp;
  }

  // -- ground loot that vanished beside the player: a pickup sparkle --
  const gcur = f.groundCur; gcur.length = 0;
  const live = new Set();
  const note = (arr, kind) => {
    if (!arr) return;
    for (const o of arr) { live.add(o); gcur.push(o); if (!kinds.has(o)) kinds.set(o, kind); }
  };
  note(state.chests, 'chest');
  note(state.itemDrops, 'item');
  for (const o of f.groundPrev) {
    if (live.has(o)) continue;
    if (Math.hypot(o.x - p.x, o.y - p.y) > PICK_R) continue;
    const kind = kinds.get(o);
    addSparks(f, o.x, o.y, kind === 'chest' ? '#f0c860' : '#ffffff', kind === 'chest' ? 16 : 8, 55);
    pushCapped(f.bursts, { kind: 'pickup', x: o.x, y: o.y, age: 0, ttl: 0.35 }, FEEL.BURST_CAP);
  }
  { const old = f.groundPrev; f.groundPrev = gcur; f.groundCur = old; }

  // -- heavy effects that just appeared: a slam shakes the screen --
  for (const fx of state.effects || []) {
    const amt = SLAM_KINDS[fx.kind], fire = FIRE_BY_FX[fx.kind];
    if ((!amt && !fire) || f.seenFx.has(fx)) continue;
    f.seenFx.add(fx);
    if (fire) sfx(fire);
    if (amt && Math.hypot(fx.x - p.x, fx.y - p.y) < 260) {
      addShake(f, amt);
      if (fx.kind === 'boss_nova' || fx.kind === 'colossus_shock') sfx('slam');
    }
  }

  // -- weapon bodies that just left the hero: their fire sound --
  for (const pr of state.projectiles || []) {
    const fire = pr.kind && FIRE_BY_PROJ[pr.kind];
    if (!fire || f.seenFx.has(pr)) continue;
    f.seenFx.add(pr);
    sfx(fire);
  }
  mawShake(f, state, p, dt);
}

// R7 THE FINALE: the Maw's attacks shake the screen, each with its own weight.
// Its wind-up is a low rumble that grows over the wind-up, its barrage a hard
// kick (lighter when it fires from far off), its bite (its body reaching the
// hero) the heaviest. All stay under SHAKE_MAX: the world layer moves at most
// 5 px and the HUD never moves, so a shot can still be read and dodged. The
// SHAKE setting and reduced motion turn it off (shakeOffset).
export const MAW_SHAKE = { WINDUP_MIN: 0.8, WINDUP_MAX: 1.8, WINDUP_S: 0.8, BARRAGE: 4, BARRAGE_FAR: 2.5, FAR_D: 320, BITE: 5 };
function mawShake(f, state, p, dt) {
  const b = state.mode === 'finale' ? state.finalBoss : null;
  if (!b) { f.mawTele = 0; f.mawVolley = null; f.mawMask = null; return; }
  if (b.telegraph) {
    f.mawTele = (f.mawTele || 0) + dt;
    const k = Math.min(1, f.mawTele / MAW_SHAKE.WINDUP_S);
    addShake(f, MAW_SHAKE.WINDUP_MIN + (MAW_SHAKE.WINDUP_MAX - MAW_SHAKE.WINDUP_MIN) * k);
  } else f.mawTele = 0;
  // A barrage: the first step a new volley of its shots is on the field.
  for (const s of state.enemyShots || []) {
    if (s.kind !== 'maw' || typeof s.volleyId !== 'number' || s.volleyId === f.mawVolley || s.age > 0.25) continue;
    f.mawVolley = s.volleyId;
    addShake(f, Math.hypot(b.x - p.x, b.y - p.y) <= MAW_SHAKE.FAR_D ? MAW_SHAKE.BARRAGE : MAW_SHAKE.BARRAGE_FAR);
    break;
  }
  // A bite: the mercy rule's mark turns to a new 'body' id (main.js updateFinale).
  const m = state.volleyMask;
  if (typeof m === 'string' && m.startsWith('body') && m !== f.mawMask) addShake(f, MAW_SHAKE.BITE);
  f.mawMask = m == null ? null : m;
}
