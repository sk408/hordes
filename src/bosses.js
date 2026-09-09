// HORDES — WAVE-7/B: NAMED BOSS CAST (Sk408: bosses with distinct patterns;
// waves 3/6/9 double-bosses should feel like EVENTS).
//
// This module owns the boss CAST + their pattern brains + their big pixel
// sprites. It does NOT own escalation math — hb1 (main.js) multiplies the
// per-boss base multipliers by CONFIG.ESCALATION.BOSS:
//   hp   = CONFIG.ENEMY.BASE_HP * (ESCALATION.BOSS.HP_MULT_BASE
//                                  + ESCALATION.BOSS.HP_MULT_PER_WAVE * waveNum)
//          * boss.hpMult
//   speed/scale similarly chain ESCALATION.BOSS.SPEED_MULT / SIZE_MULT with
//   boss.speedMult / boss.sizeMult.
//
// DECIDE CONTRACT — same shape enemy_types.js uses:
//   decide(enemy, player, state, dt) -> intent
//     mx, my       = normalized move intent (integrator multiplies by speed)
//     fire         = null | { dx, dy, speed, damage } single projectile intent
//     telegraph    = true while the boss is in a visible windup (render flash)
//   BOSS EXTRAS (additive; integrator may ignore — wire these, hb1):
//     charging     = GRAVELMAW is mid-charge (contact damage window / trails)
//     recovering   = GRAVELMAW post-charge pause (punish window for the player)
//     summon       = { type, count } — spawn minions at the boss's edge
//                    (CHOIR_MOTHER; type/count mirror ESCALATION.BOSS.SUMMON_*)
//     fan          = array of fire-intents fanned around the aim direction
//                    (CHOIR_MOTHER enrage below half hp)
//     nova         = { shots, speed, damage } — expanding ring: spawn `shots`
//                    projectiles evenly around 360° from the boss (PYRAXIS;
//                    values read from ESCALATION.BOSS.NOVA_*)
//     teleport     = { dx, dy, dist } — hop the boss by unit (dx,dy)*dist
//                    (PYRAXIS escapes when crowded; hb1 clamps to the arena)
//
// ENEMY-OWNED STATE FIELDS this module reads/writes on the enemy (the ONLY
// mutations decide() performs — nothing outside the enemy object is touched):
//   age             — seconds alive, integrator-owned (same as enemy_types)
//   hp / maxHp      — read for CHOIR_MOTHER's enrage check
//   chargeDx/Dy     — GRAVELMAW: charge direction locked at the
//                     telegraph->charge transition, null outside the charge
//   lastTeleportAge — PYRAXIS: age of the last hop (cooldown gate)
//
// All phases are derived from enemy.age (deterministic; spitter/warlock
// convention: "fires" land on the frame an interval phase wraps, < 1/60).

import { CONFIG as C } from './config.js';
import { spriteBox } from './sprites.js';

// ===========================================================================
// SPRITES — hand-authored in the sprites.js grid format (arrays of rows of
// palette indices; 0 = transparent, 1..9 = palette keys). Authored as string
// art ('.' = 0, digits = index) and parsed to numeric grids so the exported
// frames/anchor/box match the SPRITES objects exactly (fillRect-composable).
// ===========================================================================
function grid(...rows) {
  return rows.map(r => [...r].map(ch => (ch === '.' || ch === ' ') ? 0 : Number(ch)));
}

function makeBossSprite(frames, palette) {
  const box = spriteBox(frames[0]);
  return { frames, palette, anchor: { x: Math.floor(box.w / 2), y: Math.floor(box.h / 2) }, box };
}

// ---- GRAVELMAW — 24x24 stone ram-bull, head lowered, horns swept forward ---
const GRAVELMAW_FRAMES = [
  grid(
    // frame A — stride open, horns forward
    '.............3..3.........',
    '............33..33........',
    '...........33....33.......',
    '..........33.1111.33......',
    '.........33.111111.3......',
    '........33.11111111.3.....',
    '.......33.111111111.33....',
    '......3311111111111.33....',
    '.....331111111111111.3....',
    '....3311111111111111.3....',
    '...321111111111111113.....',
    '...321111111111141111.....',
    '...32111111111111111......',
    '...32111111111111111......',
    '...21111155111111111......',
    '...2111155551111111.......',
    '...2111155511111111.......',
    '...1111111111111111.......',
    '...111111111111111........',
    '....11..11...11.11........',
    '....11..11...11.11........',
    '....11..11...11.11........',
    '...166..166..166.166......',
    '...166..166..166.166......',
  ),
  grid(
    // frame B — legs pass (1px shuffle), head dips
    '..........................',
    '............33..33........',
    '...........33....33.......',
    '..........33.1111.33......',
    '.........33.111111.3......',
    '........33.11111111.3.....',
    '.......33.111111111.33....',
    '......3311111111111.33....',
    '.....331111111111111.3....',
    '....3311111111111111.3....',
    '...321111111111111113.....',
    '...321111111111141111.....',
    '...32111111111111111......',
    '...32111111111111111......',
    '...21111155111111111......',
    '...2111155551111111.......',
    '...2111155511111111.......',
    '...1111111111111111.......',
    '...111111111111111........',
    '...11...11...11..11.......',
    '...11...11...11..11.......',
    '...11...11...11..11.......',
    '..166..166...166..16......',
    '..166..166...166..16......',
  ),
];
const GRAVELMAW_PALETTE = {
  1: '#8a8f96',  // stone hide
  2: '#4a4f56',  // shadowed hide
  3: '#e8d8b0',  // horn bone
  4: '#ff5566',  // charge eye
  5: '#ff9a3c',  // ember cracks
  6: '#2e3136',  // hooves
};

// ---- CHOIR MOTHER — 20x26 hooded matron, halo ring, children at shoulders --
const CHOIR_MOTHER_FRAMES = [
  grid(
    // frame A — halo lit, cherubs out
    '......333333333......',
    '.....33.......33.....',
    '.....3.........3.....',
    '......3.......3......',
    '.........111.........',
    '........11111........',
    '.......1144411.......',
    '.......1544451.......',
    '.......1144411.......',
    '........11111........',
    '......111111111......',
    '.....11111111111.....',
    '....6111551551116....',
    '...661115515511166...',
    '.....11111111111.....',
    '.....11111611111.....',
    '....1111166111111....',
    '....1111166111111....',
    '....1111111111111....',
    '...111111111111111...',
    '...111111111111111...',
    '..11111111111111111..',
    '..11111111111111111..',
    '.1111111111111111111.',
    '.1111111111111111111.',
    '111111111111111111111',
  ),
  grid(
    // frame B — halo flickers, hem sways, cherubs tuck
    '......333433333......',
    '.....33.......33.....',
    '.....3.........3.....',
    '......3.......3......',
    '.........111.........',
    '........11111........',
    '.......1144411.......',
    '.......1544451.......',
    '.......1144411.......',
    '........11111........',
    '......111111111......',
    '.....11111111111.....',
    '.....111551551116....',
    '....6111551551116....',
    '.....11111111111.....',
    '.....11111611111.....',
    '....1111166111111....',
    '....1111166111111....',
    '....1111111111111....',
    '....11111111111111...',
    '...1111111111111111..',
    '..11111111111111111..',
    '..111111111111111111.',
    '.1111111111111111111.',
    '.1111111111111111111.',
    '.1111111111111111111.',
  ),
];
const CHOIR_MOTHER_PALETTE = {
  1: '#4a7f8f',  // teal robe
  2: '#2a4a54',  // robe shadow
  3: '#ffe8b0',  // halo
  4: '#e8f4f8',  // pale face
  5: '#c23b7f',  // mouths / eyes
  6: '#9effe0',  // cherub glow
};

// ---- PYRAXIS — 24x24 nova star: flame crown, orange body, white-hot core --
const PYRAXIS_FRAMES = [
  grid(
    // frame A — flames tips left
    '.......2.......2........',
    '.......22.....22........',
    '......122.....21........',
    '......12221..1221.......',
    '.....1223311222221......',
    '.....1222333222221......',
    '....12222222222221......',
    '....122222222222221.....',
    '...1222225522222221.....',
    '...12225555552222221....',
    '..1222555555552222221...',
    '..1225555445552222221...',
    '..12555544444555222221..',
    '..12554444444455222221..',
    '..12554444444455222221..',
    '..1225555445552222221...',
    '..1222555555522222221...',
    '...12225555552222221....',
    '...1222225522222221.....',
    '....122222222222221.....',
    '....12222222222221......',
    '.....1222222222221......',
    '......1622112261........',
    '.......62......6........',
  ),
  grid(
    // frame B — flame tips right (sway)
    '........2.......2.......',
    '........22.....22.......',
    '........12.....22.......',
    '.......1221..12221......',
    '......1223311222221.....',
    '......1222332222221.....',
    '......1222222222221.....',
    '.....122222222222221....',
    '.....122222552222221....',
    '....12225555552222221...',
    '...1222555555552222221..',
    '...1225555445552222221..',
    '...1255554444455522221..',
    '...1255444444445522221..',
    '...1255444444445522221..',
    '...1225555445552222221..',
    '...1222555555522222221..',
    '....12225555552222221...',
    '....1222225522222221....',
    '.....122222222222221....',
    '.....12222222222221.....',
    '......1222222222221.....',
    '.......1622112261.......',
    '.......62......6........',
  ),
];
const PYRAXIS_PALETTE = {
  1: '#e8481e',  // rim
  2: '#ff9a3c',  // body
  3: '#ffe08a',  // (reserved highlight — see crown rows)
  4: '#fff8d8',  // white-hot core
  5: '#5c2a1e',  // void eyes
  6: '#ffd54a',  // gold sparks
};

export const BOSS_SPRITES = {
  GRAVELMAW:    makeBossSprite(GRAVELMAW_FRAMES, GRAVELMAW_PALETTE),
  CHOIR_MOTHER: makeBossSprite(CHOIR_MOTHER_FRAMES, CHOIR_MOTHER_PALETTE),
  PYRAXIS:      makeBossSprite(PYRAXIS_FRAMES, PYRAXIS_PALETTE),
};

// ===========================================================================
// THE CAST — one entry per named boss. hpMult/speedMult are BASE multipliers
// for hb1 to chain with CONFIG.ESCALATION.BOSS (see header). Pattern params
// live here; escalation-sourced tuning (nova/summon) is read from CONFIG at
// decide-time so rebalances in config.js propagate for free.
// ===========================================================================
export const BOSSES = {
  // Telegraph -> fixed-line charge -> recover. The windup flash is the dodge
  // window; the recover pause is the punish window.
  GRAVELMAW: {
    id: 'GRAVELMAW',
    name: 'GRAVELMAW THE CHARGER',
    flavor: 'The mountain learned to run.',
    hpMult: 1.15, speedMult: 1.0, sizeMult: 1.0, contactDamageMult: 1.5,
    decide: gravelmawDecide,
    // pattern params (seconds / move-intent multipliers)
    stalkTime: 1.4, stalkSpeedMult: 0.7,
    telegraphTime: 0.7,
    chargeTime: 0.9, chargeSpeedMult: 3.4,
    recoverTime: 1.1,
  },

  // Summoner: slow drift, periodic swarm bursts; below half hp she adds a
  // projectile fan every fanInterval (the "hymn").
  CHOIR_MOTHER: {
    id: 'CHOIR_MOTHER',
    name: 'THE CHOIR MOTHER',
    flavor: 'Her children sing in swarms.',
    hpMult: 1.0, speedMult: 0.8, sizeMult: 0.95, contactDamageMult: 1.0,
    decide: choirMotherDecide,
    driftSpeedMult: 0.45,
    enrageHpFrac: 0.5,
    fanInterval: 2.6, fanShots: 5, fanSpread: 0.9,   // radians, total arc
    projSpeed: 70, projDamage: 10,
  },

  // Nova-mage: repositions, then a visible charge-up into an expanding ring;
  // blinks a short hop away when the player crowds her.
  PYRAXIS: {
    id: 'PYRAXIS',
    name: 'PYRAXIS',
    flavor: 'A star that forgot how to die.',
    hpMult: 0.9, speedMult: 0.9, sizeMult: 1.0, contactDamageMult: 1.0,
    decide: pyraxisDecide,
    holdDist: 170, retreatDist: 130,
    novaChargeTime: 1.2,       // visible charge-up at the end of the cycle
    teleportDist: 80,          // hop when the player is inside this radius
    teleportHop: 100,          // hop length in px
    teleportCooldown: 2.2,
  },
};

// Single-boss rotation order; double waves walk distinct rotating PAIRS.
export const BOSS_ORDER = ['GRAVELMAW', 'CHOIR_MOTHER', 'PYRAXIS'];

// ===========================================================================
// DECIDERS
// ===========================================================================

function toward(dx, dy) {
  const len = Math.hypot(dx, dy) || 1;
  return { mx: dx / len, my: dy / len };
}

// ---- GRAVELMAW: stalk -> telegraph (flash + windup pause) -> locked charge
// line -> recover pause. Charge direction locks to the player's position on
// the first charge frame and holds for the whole charge (enemy.chargeDx/Dy,
// cleared outside the charge window).
function gravelmawDecide(enemy, player) {
  const B = BOSSES.GRAVELMAW;
  const cycle = B.stalkTime + B.telegraphTime + B.chargeTime + B.recoverTime;
  const phase = enemy.age % cycle;
  const dir = toward(player.x - enemy.x, player.y - enemy.y);

  if (phase < B.stalkTime) {
    enemy.chargeDx = null; enemy.chargeDy = null;
    return { mx: dir.mx * B.stalkSpeedMult, my: dir.my * B.stalkSpeedMult, fire: null };
  }
  const teleEnd = B.stalkTime + B.telegraphTime;
  if (phase < teleEnd) {
    enemy.chargeDx = null; enemy.chargeDy = null;
    return { mx: 0, my: 0, fire: null, telegraph: true };
  }
  const chargeEnd = teleEnd + B.chargeTime;
  if (phase < chargeEnd) {
    if (enemy.chargeDx == null || enemy.chargeDy == null) {
      // Lock on the first charge frame (documented enemy mutation).
      enemy.chargeDx = dir.mx;
      enemy.chargeDy = dir.my;
    }
    return {
      mx: enemy.chargeDx * B.chargeSpeedMult, my: enemy.chargeDy * B.chargeSpeedMult,
      fire: null, charging: true,
    };
  }
  enemy.chargeDx = null; enemy.chargeDy = null;
  return { mx: 0, my: 0, fire: null, recovering: true };
}

// ---- CHOIR MOTHER: constant slow drift toward the player; summon bursts on
// the SUMMON_INTERVAL wrap (count +1 when enraged); once below half hp, a fan
// of projectiles on every fanInterval wrap.
function choirMotherDecide(enemy, player) {
  const B = BOSSES.CHOIR_MOTHER;
  const EB = C.ESCALATION.BOSS;
  const dir = toward(player.x - enemy.x, player.y - enemy.y);
  const intent = {
    mx: dir.mx * B.driftSpeedMult, my: dir.my * B.driftSpeedMult,
    fire: null,
  };

  const enraged = enemy.maxHp > 0 && enemy.hp / enemy.maxHp < B.enrageHpFrac;

  // Summon burst: 3 swarmers normally, 4 enraged (ESCALATION.BOSS.SUMMON_*).
  if (enemy.age % EB.SUMMON_INTERVAL < 1 / 60) {
    intent.summon = {
      type: EB.SUMMON_TYPE,
      count: enraged ? EB.SUMMON_COUNT + 1 : EB.SUMMON_COUNT,
    };
  }

  // Enrage hymn: fan of fire-intents spread around the aim direction.
  if (enraged && enemy.age % B.fanInterval < 1 / 60) {
    const base = Math.atan2(dir.my, dir.mx);
    const step = B.fanSpread / (B.fanShots - 1);
    intent.fan = [];
    for (let k = 0; k < B.fanShots; k++) {
      const a = base + (k - (B.fanShots - 1) / 2) * step;
      intent.fan.push({
        dx: Math.cos(a), dy: Math.sin(a),
        speed: B.projSpeed, damage: B.projDamage,
      });
    }
  }
  return intent;
}

// ---- PYRAXIS: nova cycle = reposition (hold ~170px) -> visible charge-up
// (frozen, telegraph) -> ring nova on the cycle wrap (NOVA_* tuning from
// ESCALATION.BOSS). Teleports a short hop away when crowded, gated by a
// cooldown (enemy.lastTeleportAge).
function pyraxisDecide(enemy, player) {
  const B = BOSSES.PYRAXIS;
  const EB = C.ESCALATION.BOSS;
  const dx = player.x - enemy.x, dy = player.y - enemy.y;
  const dist = Math.hypot(dx, dy);
  const dir = toward(dx, dy);

  // Crowded: blink away (cooldown-gated; age stamp is the documented mutation).
  if (dist < B.teleportDist &&
      enemy.age - (enemy.lastTeleportAge ?? -Infinity) >= B.teleportCooldown) {
    enemy.lastTeleportAge = enemy.age;
    return { mx: 0, my: 0, fire: null, teleport: { dx: -dir.mx, dy: -dir.my, dist: B.teleportHop } };
  }

  const cycle = Math.max(B.novaChargeTime + 0.1, EB.NOVA_INTERVAL);
  const moveTime = cycle - B.novaChargeTime;
  const phase = enemy.age % cycle;

  // Charge-up window at the end of the cycle: frozen + flashing.
  if (phase >= moveTime) {
    return { mx: 0, my: 0, fire: null, telegraph: true, novaCharge: true };
  }

  let mx = 0, my = 0;
  if (dist < B.retreatDist) {            // mage keeps her distance
    mx = -dir.mx; my = -dir.my;
  } else if (dist > B.holdDist + 20) {
    mx = dir.mx; my = dir.my;
  }

  let nova = null;
  if (phase < 1 / 60) {                  // cycle just wrapped: RING
    nova = { shots: EB.NOVA_SHOTS, speed: EB.NOVA_SPEED, damage: EB.NOVA_DAMAGE };
  }
  return { mx, my, fire: null, nova, telegraph: false };
}

// ===========================================================================
// WAVE ROTATION
// ===========================================================================

// pickBossForWave(wave) -> array of ONE boss descriptor, or TWO DISTINCT
// descriptors on waves divisible by 3 (the EVENT waves). Descriptors are
// fresh shallow copies ({ ...boss, sprite }) so callers can attach run state
// without corrupting the cast. Each carries base hpMult/speedMult for hb1 to
// multiply by CONFIG.ESCALATION.BOSS (never hardcoded here).
//
//   wave 1 -> GRAVELMAW          wave 3 -> GRAVELMAW + CHOIR_MOTHER
//   wave 2 -> CHOIR_MOTHER       wave 6 -> CHOIR_MOTHER + PYRAXIS
//   wave 4 -> PYRAXIS            wave 9 -> PYRAXIS + GRAVELMAW
//   wave 5 -> GRAVELMAW          (pairs rotate; wave 12 -> pair of wave 3, ...)
export function pickBossForWave(wave) {
  const w = Math.max(1, Math.floor(wave));
  const spawn = (id) => ({ ...BOSSES[id], sprite: BOSS_SPRITES[id] });

  if (w % 3 === 0) {
    // Double-boss EVENT: distinct rotating pair.
    const i = (Math.floor(w / 3) - 1) % BOSS_ORDER.length;
    return [spawn(BOSS_ORDER[i]), spawn(BOSS_ORDER[(i + 1) % BOSS_ORDER.length])];
  }
  return [spawn(BOSS_ORDER[(w - 1) % BOSS_ORDER.length])];
}

// Convenience: typed decision dispatch (mirrors decideEnemyAction). The enemy
// must carry bossId (or typeId) matching a BOSSES key.
export function decideBossAction(enemy, player, state, dt) {
  const boss = BOSSES[enemy.bossId || enemy.typeId];
  if (!boss) return { mx: 0, my: 0, fire: null };
  return boss.decide(enemy, player, state, dt);
}
