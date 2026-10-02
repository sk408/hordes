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
};

function freshFeel() {
  return {
    time: 0, pass: 0, player: null,
    nums: [], puffs: [], sparks: [], bursts: [],
    shake: 0, shakeT: 0, hurtT: 0,
    hp: null, xp: null, level: null, potHp: null, potMp: null,
    combo: 0, comboT: 0,
    track: new WeakMap(), prev: [], cur: [],
    seenFx: new WeakSet(), groundPrev: [], groundCur: [],
    crits: new WeakSet(),
    seed: 1,
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

function rnd(f) {        // private LCG, 0..1
  f.seed = (Math.imul(f.seed, 1664525) + 1013904223) >>> 0;
  return f.seed / 4294967296;
}

// ---- body colour of an enemy (for its death puff) ---------------------------
const bodyCache = new WeakMap();
export function bodyColourOf(e) {
  const spr = e.boss ? (e.bossSprite || BOSS_SPRITE) : (enemySpriteFor(e.typeId) || SPRITES[e.typeId]);
  if (!spr) return '#c8c8d8';
  let c = bodyCache.get(spr);
  if (!c) {
    const cnt = {};
    for (const row of spr.frames[0]) for (const v of row) if (v) cnt[v] = (cnt[v] || 0) + 1;
    const k = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0];
    c = spr.palette[k] || '#c8c8d8';
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

export function addPuff(f, e, big) {
  const w = e.w || 10;
  const cls = e.boss ? 3 : (e.elite || big) ? 2 : w > 13 ? 1 : 0;
  pushCapped(f.puffs, {
    x: e.x, y: e.y - (e.flying ? (e.z || 0) : 0), cls, colour: bodyColourOf(e),
    age: 0, ttl: [0.26, 0.32, 0.42, 0.7][cls], rot: rnd(f) * 6.283, r: w * 0.6,
  }, FEEL.PUFF_CAP);
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
  for (const s of f.sparks) { s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 60 * dt; }
  agePool(f.sparks, dt);
  f.shake = Math.max(0, f.shake - f.shake * FEEL.SHAKE_DECAY * dt - 0.6 * dt);
  f.shakeT += dt;
  f.hurtT = Math.max(0, f.hurtT - dt);
  f.comboT = Math.max(0, f.comboT - dt);
  if (f.comboT <= 0) f.combo = 0;

  // -- enemies: hits (numbers + knockback) and removals (puffs) --
  const cur = f.cur; cur.length = 0;
  let hitThisStep = false;
  const scan = (e) => {
    let r = f.track.get(e);
    if (!r) { r = { hp: e.hp, pass: 0, kvx: 0, kvy: 0, kcd: 0 }; f.track.set(e, r); }
    r.pass = f.pass;
    cur.push(e);
    const dmg = r.hp - e.hp;
    if (dmg > 0.01) {
      hitThisStep = true;
      const crit = f.crits.has(e);
      if (crit) f.crits.delete(e);
      addNumber(f, e.x, e.y - (e.h || 10) / 2 - (e.flying ? (e.z || 0) : 0) - 2, dmg, crit ? 'crit' : 'hit', e);
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
  };
  for (const e of state.enemies) scan(e);
  if (state.finalBoss && state.mode === 'finale') scan(state.finalBoss);
  let deaths = 0, bigDeath = 0;
  for (const e of f.prev) {
    const r = f.track.get(e);
    if (!r || r.pass === f.pass) continue;
    if (Math.abs(e.x - p.x) > 320 || Math.abs(e.y - p.y) > 220) continue;   // far off screen
    addPuff(f, e, false);
    deaths++;
    if (e.boss) bigDeath = Math.max(bigDeath, 2);
    else if (e.elite) bigDeath = Math.max(bigDeath, 1);
  }
  { const old = f.prev; f.prev = cur; f.cur = old; }
  if (hitThisStep) sfx('hit');
  if (deaths > 0) sfx(bigDeath === 2 ? 'bossDeath' : bigDeath === 1 ? 'eliteDeath' : 'kill');
  if (bigDeath === 2) addShake(f, 5); else if (bigDeath === 1) addShake(f, 2.5);

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
    addSparks(f, p.x, p.y + 2, '#7dffd0', 2, 22);
    sfx('gem', f.combo);
  }
  if (f.level !== null && p.level > f.level) {
    pushCapped(f.bursts, { kind: 'levelup', x: p.x, y: p.y, age: 0, ttl: 0.7 }, FEEL.BURST_CAP);
    addSparks(f, p.x, p.y, '#ffd75e', 14, 60);
  }
  f.xp = p.xp; f.level = p.level;
  if (p.potions) {
    if (f.potHp !== null && (p.potions.hp > f.potHp || p.potions.mp > f.potMp)) {
      addSparks(f, p.x, p.y, p.potions.hp > f.potHp ? '#ff7a8a' : '#7ab0ff', 8, 40);
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
    addSparks(f, o.x, o.y, kind === 'chest' ? '#ffd75e' : '#ffffff', kind === 'chest' ? 16 : 8, 55);
    pushCapped(f.bursts, { kind: 'pickup', x: o.x, y: o.y, age: 0, ttl: 0.35 }, FEEL.BURST_CAP);
  }
  { const old = f.groundPrev; f.groundPrev = gcur; f.groundCur = old; }

  // -- heavy effects that just appeared: a slam shakes the screen --
  for (const fx of state.effects || []) {
    const amt = SLAM_KINDS[fx.kind];
    if (!amt || f.seenFx.has(fx)) continue;
    f.seenFx.add(fx);
    if (Math.hypot(fx.x - p.x, fx.y - p.y) < 260) {
      addShake(f, amt);
      if (fx.kind === 'boss_nova' || fx.kind === 'colossus_shock') sfx('slam');
    }
  }
}
