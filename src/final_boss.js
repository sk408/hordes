// HORDES — WAVE-10/A: THE FINAL BOSS (Sk408 end-game spec).
// Wave-5 target for now (tunable via FINAL_BOSS_WAVE). This module owns the
// finale: descriptor, huge dark sprite, choreography brain, the 3-hit rule,
// the volley mercy rule, and the hp-floor "undefeatable but beatable-looking"
// mechanics. Escalation is NOT hardcoded — hb1 wires the finale mode.
//
// DECIDE CONTRACT — same shape as bosses.js / enemy_types.js:
//   decide(enemy, player, state, dt) -> intent
//     mx, my    = slow drift toward the player (driftSpeedMult)
//     telegraph = true during the pre-barrage window (render: flash the maw)
//     barrage   = { volleyId, shots, speed } on the frame the cycle wraps —
//                 hb1 spawns `shots` projectiles 360° outward from the boss,
//                 EACH TAGGED with volleyId (the mercy rule keys on it).
//
// ENEMY-OWNED STATE: reads enemy.age only (integrator-owned, same as the
// cast). decide() mutates NOTHING — volleyIds derive deterministically from
// age (floor(age / CYCLE)), so replays/interrupts stay consistent.

import { spriteBox } from './sprites.js';

// ===========================================================================
// TUNING
// ===========================================================================

// Which wave the finale fires on (tunable — 5 for this build phase).
export const FINAL_BOSS_WAVE = 5;

// Undefeatable-this-phase mechanics: the boss carries a huge DISPLAY hp so
// the bar visibly drains, but hp never crosses the floor while BEATABLE is
// false. Sk408 flips BEATABLE later; the floor (and death gating) follows it.
export const BEATABLE = false;
export const HP_FLOOR = BEATABLE ? 0 : 1;
export const DISPLAY_HP = 2_500_000;

// Attack choreography (seconds). GRACE = entrance pause before cycle 1.
export const FINAL_BOSS_PHASES = {
  GRACE: 2.0,        // spawn roar — no attacks, just drift
  CYCLE: 4.5,        // barrage-to-barrage
  TELEGRAPH: 0.8,    // visible pre-barrage window at the end of each cycle
};

// The barrage itself: 48 projectiles ringed 360° outward. Speed is tuned so
// the wave covers the arena but a sliver of dodge remains between spokes
// (48 shots = 7.5° apart; gaps exist, threading them is the skill).
// Damage is NOT a number here — every barrage projectile uses
// finalBossDamage(player) under the volley mercy rule (below).
export const BARRAGE = {
  SHOTS: 48,
  SPEED: 95,         // px/s outward — crosses the ~600px arena in ~6s
};

export const FINAL_BOSS = {
  id: 'MAW',
  name: 'THE MAW OF THE HORDE',
  flavor: 'Every horde was always one hunger.',
  // Base multipliers for hb1 to chain with ESCALATION.BOSS if it wants; the
  // display hp is already absolute (see makeFinalBoss).
  hpMult: 1.0, speedMult: 0.35, sizeMult: 4.0, contactDamageMult: 1.0,
  driftSpeedMult: 0.3,
  decide: mawDecide,
};

// ===========================================================================
// SPRITE — 34x38 void-black maw: jagged crown, eye cluster, ringed teeth
// around a burning throat. Same grid format as sprites.js/bosses.js (rows of
// palette indices; 0 transparent, 1..9 palette keys). Authored as string art
// ('.' = 0) in LEFT HALVES and mirrored, so the boss is perfectly symmetric.
// Deliberately bigger AND darker than the named cast (body #141018).
// ===========================================================================
function grid(...rows) {
  return rows.map(r => [...r].map(ch => (ch === '.' || ch === ' ') ? 0 : Number(ch)));
}
// mirror(half) -> full row: 17-char left half + its reverse = 34 wide.
const mirror = (half) => grid(...half.map(r => r + [...r].reverse().join('')));

const MAW_FRAMES = [
  mirror([ // frame A — teeth at rest, core banked
    '.....2......2....',
    '.....22.....22...',
    '....2212....221..',
    '...221112..22112.',
    '...2211111221112.',
    '..221111111111111',
    '..211111111111111',
    '.2211111111111111',
    '.2111141111111111',
    '.2111144111111111',
    '.2111144111111111',
    '.2211114111111111',
    '22111111111111111',
    '22111111111111111',
    '21111111111111111',
    '22111111111111111',
    '22133333333333333',
    '22133313331333133',
    '22116666666666666',
    '.2111665555555555',
    '.2111665555555555',
    '.2211666666666666',
    '22133331333133333',
    '22133333333333333',
    '22111111111111111',
    '22111111111111111',
    '21111111111111111',
    '2211111111111111.',
    '.221111111111112.',
    '.22111111111112..',
    '..2211111111122..',
    '...22111111122...',
    '....2211112212...',
    '....22..22..22...',
    '....2...2...2....',
    '...22..22..22....',
    '...2...2....2....',
    '..22..22....22...',
  ]),
  mirror([ // frame B — teeth rotated a notch, core flares (swallow breath)
    '.....2......2....',
    '.....22.....22...',
    '....2212....221..',
    '...221112..22112.',
    '...2211111221112.',
    '..221111111111111',
    '..211111111111111',
    '.2211111111111111',
    '.2111141111111111',
    '.2111144111111111',
    '.2111144111111111',
    '.2211114111111111',
    '22111111111111111',
    '22111111111111111',
    '21111111111111111',
    '22111111111111111',
    '22133133133133133',
    '22133133133133133',
    '22116666666666666',
    '.2111665555545555',
    '.2111665545555555',
    '.2211666666666666',
    '22133133133133133',
    '22133333333333333',
    '22111111111111111',
    '22111111111111111',
    '21111111111111111',
    '2211111111111111.',
    '.221111111111112.',
    '.22111111111112..',
    '..2211111111122..',
    '...22111111122...',
    '....2211112212...',
    '....22..22..22...',
    '....2...2...2....',
    '....22..22..22...',
    '.....2..2....2...',
    '..22..22....22...',
  ]),
];
const MAW_PALETTE = {
  1: '#141018',  // void-black hide (darker than anything in the cast)
  2: '#241c2e',  // deep violet shading
  3: '#c8b890',  // bone teeth
  4: '#ff2f5e',  // eye glow
  5: '#ff6a3c',  // burning core
  6: '#3d0a1c',  // throat
};

export const FINAL_BOSS_SPRITE = (() => {
  const frames = MAW_FRAMES;
  const box = spriteBox(frames[0]);
  return { frames, palette: MAW_PALETTE, anchor: { x: Math.floor(box.w / 2), y: Math.floor(box.h / 2) }, box };
})();

// ===========================================================================
// CHOREOGRAPHY — GRACE -> (drift... -> TELEGRAPH -> BARRAGE) every CYCLE.
// Volley ids derive from age: floor((age - GRACE) / CYCLE), so every barrage
// carries a fresh id without any mutable state.
// ===========================================================================
// Integer-domain wrap detection for the barrage cadence; see the long note in
// enemy_types.js/intervalWrapped (it is duplicated here because final_boss.js
// deliberately imports nothing but sprites.js). wrapCount doubles as the volley
// id: both must use the SAME rounding, or the id can repeat a landed volley and
// the mercy rule would make the whole barrage harmless.
const WRAP_EPS = 1e-9;
function wrapCount(age, interval) {
  return Math.floor(age / interval + WRAP_EPS);
}
function intervalWrapped(age, interval, dt) {
  const step = dt > 0 ? dt : 1 / 60;
  return wrapCount(age, interval) !== wrapCount(age - step, interval);
}

export function mawDecide(enemy, player, _state, dt = 1 / 60) {
  const P = FINAL_BOSS_PHASES;
  const dx = player.x - enemy.x, dy = player.y - enemy.y;
  const len = Math.hypot(dx, dy) || 1;
  const drift = FINAL_BOSS.driftSpeedMult;
  const intent = { mx: (dx / len) * drift, my: (dy / len) * drift, fire: null };

  const age = Math.max(0, enemy.age - P.GRACE);   // entrance grace first
  const phase = age % P.CYCLE;
  const wrap = age > 0 && intervalWrapped(age, P.CYCLE, dt);

  // Barrage lands on the frame the cycle wraps (spitter/warlock convention:
  // integer-domain wrap detection, so a 120Hz client cannot fire it twice and a
  // long frame cannot step over it). Decided BEFORE the telegraph window: age is
  // accumulated by += dt, so the wrap frame's phase can sit a hair below CYCLE
  // where the telegraph early-return used to swallow the whole barrage.
  if (wrap) {
    intent.barrage = {
      volleyId: wrapCount(age, P.CYCLE),
      shots: BARRAGE.SHOTS,
      speed: BARRAGE.SPEED,
    };
    return intent;
  }

  // Telegraph window: the last TELEGRAPH seconds of each cycle.
  if (age > 0 && phase >= P.CYCLE - P.TELEGRAPH) intent.telegraph = true;
  return intent;
}

// ===========================================================================
// THREE-HIT RULE — exact third of maxHp, ceil'd, ignoring EVERYTHING else
// (defenses, heat, items, buffs). Any hero dies in exactly 3 hits.
// ===========================================================================
export function finalBossDamage(player) {
  return Math.ceil(player.maxHp / 3);
}

// ===========================================================================
// ONE-HIT-PER-VOLLEY MERCY RULE — pure.
//   shouldApplyHit(volleyState, volleyId) -> { apply, nextState }
//     volleyState = the last volleyId that already landed (null/undefined
//                   before the first), kept by hb1 (e.g. state.volleyMask)
//     apply       = true only for the FIRST projectile of this volley to
//                   touch the hero; the rest of the same volleyId pass
//                   through harmlessly
//     nextState   = what to store back (unchanged on a mercy pass)
// ===========================================================================
export function shouldApplyHit(volleyState, volleyId) {
  if (volleyState === volleyId) return { apply: false, nextState: volleyState };
  return { apply: true, nextState: volleyId };
}

// ===========================================================================
// HP FLOOR — apply damage for visible bar drain; death is gated by BEATABLE.
// applyFinalBossDamage(boss, amount) -> { hp, died }  (mutates boss.hp only)
// While BEATABLE is false the hp clamps at HP_FLOOR and died is always
// false — the bar drains forever, the maw never closes.
// ===========================================================================
export function applyFinalBossDamage(boss, amount) {
  boss.hp = Math.max(HP_FLOOR, boss.hp - amount);
  return { hp: boss.hp, died: boss.hp <= 0 };
}

// ===========================================================================
// FACTORY — hb1 spawns the finale with this (position its own; size/speed
// wiring is hb1's, per ESCALATION chaining conventions).
// ===========================================================================
export function makeFinalBoss(x, y) {
  return {
    bossId: FINAL_BOSS.id,
    typeId: FINAL_BOSS.id,
    x, y,
    hp: DISPLAY_HP, maxHp: DISPLAY_HP,
    age: 0,                 // integrator advances; choreography keys off it
    w: 34, h: 38,           // sprite box; hb1 may scale by sizeMult
  };
}

// Typed dispatch (mirrors decideBossAction in bosses.js).
export function decideFinalBossAction(enemy, player, state, dt) {
  return FINAL_BOSS.decide(enemy, player, state, dt);
}
