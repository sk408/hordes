// HORDES — WAVE-18 DRAFT STAKES SIM: does the level-up DRAFT decide runs?
// Sk408 reframe (docs/PLAYTEST_FEEDBACK_2026-09-11.md #5): in an auto-playing
// game the DRAFT IS THE GAME. Acceptance bar, verbatim from the brief:
//   "a deliberately bad draft run must be able to fail, and a good draft must
//    visibly outperform it. If two opposite draft strategies produce the same
//    result at minute 10, the balance is broken."
//
// Run: node tools/draft_sim.mjs [--runs N] [--seed S]
//   --runs N   runs per draft archetype (default 60)
//   --seed S   rng seed (default 4242; deterministic given the seed)
//
// WHAT IT SIMULATES: one fresh-profile RUN (meta.js makeProfile: starter set
// VOLLEY + BOOMERANG unlocked, 3 weapon slots — no shop purchases, no
// artifacts; the draft is the ONLY lever, which is the point). Three draft
// policies fight the same escalation:
//   GREED-DAMAGE    always the highest marginal-DPS card (dmg/multi/pierce/rate)
//   SURVIVAL        always the highest marginal-defense card (hp > speed-kite)
//   ADVERSARIAL-BAD deliberately bad: the LOWEST-impact card of each offer,
//                   scored honestly from the cards' known magnitudes (a
//                   'multi' past the projectile cap, a tapered late speed
//                   pick, or +30% pickup radius all score near zero).
//
// ======================= WHY NOT HEADLESS main.js ==========================
// main.js is DOM-bound at every draft seam (openDraft writes ovCards via
// document.createElement; audio.playSfx on every level/pick; render.js owns
// the loop). balance_sim.mjs precedent applies: model the loop from the LIVE
// numbers, importing the real modules wherever they are pure —
//   config.js    CONFIG (ESCALATION/SPAWNER/POTIONS/XP curves), UPGRADES
//                (the REAL card applies run verbatim)
//   entities.js  makePlayer, hpScale/xpScale/dmgScale (live curves)
//   weapons.js   makeWeapon, levelUpWeapon, weaponLevelParams (live level
//                tables), WEAPONS constants
//   enemy_types.js ENEMY_TYPES / ELITE_TEMPLATE (live hp/xp/contact/speed
//                mults and pack sizes)
//   heat.js      heatMultipliers at heat 0 (fresh run: no evolutions, no
//                manual pushes — neutral by construction, imported to prove it)
//   meta.js      computeRunGold (the live end-of-run gold integrator),
//                STARTER_WEAPONS
//
// ============================ MODEL ASSUMPTIONS ============================
// Every assumption below is a SIM knob (SIM_TUNING); every game number is
// imported. Anchors follow balance_sim's calibration standard (GOLD_MODEL):
// a competent fresh run lands in the RUN1->GOOD band (dies wave 2-3 to deep
// waves; ~1000-3000 kills) — absolute survival times are model-calibrated,
// the DIVERGENCE between policies is the measurement.
//
// SPAWNING (expected-value, no rng): the live formulas from main.js spawnWave
//   interval(t) = max(0.25, 1.1 - 0.008 t); groups(t) = ceil((1+floor(t/25))/2)
//   type mix = live SPAWNER weights/gates per minion-wave w = floor(t/30);
//   pack size = live per-type packSize (SWARMER 5, TICK 3, else 1);
//   elites = live ELITE_CHANCE 0.05 after 60s (folded into hp/xp expectations).
//   Field is soft-capped at FIELD_CAP (crowd saturation; the pressure curve
//   saturates anyway).
//
// PLAYER DPS (per weapon, live stats + live level tables):
//   VOLLEY    perShot = damage * volleyLv.dmgMult * (1 + 0.2*volleyLv.proj)
//             (the live Lv3/Lv6 proj->damage conversion, main.js:242);
//             cadence 1/cooldown; volley projectiles capped at
//             MAX_PROJECTILES (live 3) with SPREAD_EFF=0.7 per extra shot
//             (main.js SPREAD 0.30 rad widens fans — extra shots miss).
//   BOOMERANG perThrow = damage * boomLv.dmgMult; cadence = BOOMERANG
//             COOLDOWN * cooldown/WEAPON.COOLDOWN (weapons.js rateScale);
//             hitsPerThrow = 1.4 + 0.5*(pierce + boomLv.pierceBonus)
//             (outbound pierce-all + return leg through a crowd).
//   Effective dps vs the field = base * crowdFrac * (1 + 0.35*pierce
//   + AOE_B*crowdFrac): dense crowds multiply pierce/AoE value (boomerang
//   pierce-all, orbit ticks, volley lines), an empty field idles cooldowns.
//   BOSS_DPS_SHARE of dps goes to a live boss while one is up.
//
// BOSS (live formulas): hp = BASE_HP * hpScale(w) * (HP_MULT_BASE +
//   HP_MULT_PER_WAVE * waveNum), x2 bosses on DOUBLE_EVERY waves (desc
//   hpMult modeled at 1.0); boss worth XP_KILLS minion-kills of xp; wave
//   timer pauses while the boss lives; wave 5 boss death -> finale, the maw
//   kills the player ~30s later (unbeatable this phase).
//
// DAMAGE TAKEN (the pressure curve — the main sim assumption):
//   hits/s = min(HITS_CAP, PRESSURE_K * (N/OVERWHELM_N)^2 * closing) where
//   closing = avgEnemySpeed / playerSpeed clamped [0.12, 1.6]. A player
//   faster than the horde and ahead of the backlog takes almost nothing
//   (the autopilot kites at KITE_DIST); a slow player in a saturated field
//   eats the invuln-capped 1/0.6 hits/s of 12 * dmgScale(w) * contactMult.
//   dmgScale/contactMult are the live curve and the live type-mix average.
//   Potions: live DROP_CHANCE 0.03 per kill banks 35hp heals (POTIONS.HP_HEAL),
//   auto-drunk below 50% hp (kiting walks you over the drop).
//
// XP / DRAFTS: live curve xpNext = 30 * XP_LEVEL_GROWTH^level; gem xp =
// BASE_XP * xpScale(w) * mix. Every level opens a draft rolled EXACTLY like
// main.js openDraft: weapon cards (grant BOOMERANG while slots free;
// level-up cards for owned weapons below WEAPON_MAX_LEVEL) at weight 1,
// the 7 UPGRADES stat cards at weight 0.3 (live), weighted draw without
// replacement, take 3 — then the POLICY picks one of the three. Stat card
// effects use the REAL UPGRADES[].apply (speed/rate replicate main.js pick()'s
// DRAFT_TAPER, mirrored here from main.js:1449 — flagged for drift).
// Intermission blessings (choices.js) are out of scope: they are a separate
// decision layer (shop/shrine), not the level-up draft under test.
//
// GOLD metric: profile gold only accrues at run end via computeRunGold
// (live integrator); checkpoints report the projected payout for the run's
// kills/level/time so far.
// ==========================================================================

import { pathToFileURL } from 'node:url';
import { CONFIG as C, UPGRADES } from '../src/config.js';
import { makePlayer, hpScale, xpScale, dmgScale } from '../src/entities.js';
import {
  WEAPONS, WEAPON_MAX_LEVEL, makeWeapon, levelUpWeapon, weaponLevelParams,
} from '../src/weapons.js';
import { ENEMY_TYPES, ELITE_TEMPLATE } from '../src/enemy_types.js';
import { heatMultipliers } from '../src/heat.js';
import { computeRunGold, STARTER_WEAPONS } from '../src/meta.js';

const UPGRADES_BY_ID = Object.fromEntries(UPGRADES.map(u => [u.id, u]));
// DRAFT_TAPER mirrors main.js:1449 (speed/rate cards diminish per repeat).
// Sim-only copy: main.js is not importable (DOM). If main.js retunes the
// taper, update this array to match.
const DRAFT_TAPER = [1, 0.75, 0.55, 0.4, 0.3, 0.22, 0.15];

// ---------- sim tuning knobs (assumptions — see header) ----------------------
export const SIM_TUNING = {
  DT: 0.5,              // tick (s)
  FIELD_CAP: 140,       // soft cap on enemies alive (crowd saturation)
  CROWD_SAT: 12,        // N at which weapon cooldowns stop idling
  SPREAD_EFF: 0.7,      // effective value of each extra volley projectile
  PIERCE_VAL: 0.35,     // dps multiplier per pierce point vs a crowd
  AOE_B: 3.5,           // dense-crowd AoE/pierce-all bonus (documented above)
  BOSS_DPS_SHARE: 0.6,  // fraction of dps on the boss while it lives
  OVERWHELM_N: 170,      // alive enemies at full surround pressure
  PRESSURE_K: 1.2,      // pressure curve gain
  HITS_CAP: 1 / 0.6,    // invuln-capped contact hits per second (live 0.6s)
  FINALE_GRACE: 30,     // s between the wave-5 boss and the maw killing you
};

// Live lever defaults (what the sim runs with no patch — the values to
// compare LEVER proposals against). Overrides arrive via the `patch` argument.
export const LIVE = {
  statWeight: 0.3,      // main.js:1418 (stat cards vs weapon weight 1)
  maxProj: C.WEAPON.MAX_PROJECTILES,   // config.js WEAPON.MAX_PROJECTILES (3)
  xpGrowth: C.XP_LEVEL_GROWTH,         // config.js XP_LEVEL_GROWTH (1.35)
  hpCardPct: false,     // UPGRADES hp card: live = +25 flat
};

const DT = SIM_TUNING.DT;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// ---------- rng (mulberry32 — deterministic, seedable) -----------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- enemy mix in expectation (live SPAWNER weights & type mults) -----
// Cached per minion-wave w = floor(t/30). All multipliers are the live
// ENEMY_TYPES values; elites fold ELITE_CHANCE (after 60s) into hp/xp.
const MIX_CACHE = new Map();
function spawnMix(w) {
  if (MIX_CACHE.has(w)) return MIX_CACHE.get(w);
  const S = C.SPAWNER;
  const entries = [['CHASER', S.CHASER_WEIGHT]];
  if (w >= S.SWARMER_WAVE) entries.push(['SWARMER', S.SWARMER_WEIGHT]);
  if (w >= S.BRUTE_WAVE) entries.push(['BRUTE', S.BRUTE_WEIGHT]);
  if (w >= S.DASHER_WAVE) entries.push(['DASHER', S.DASHER_WEIGHT]);
  if (w >= S.SPITTER_WAVE) entries.push(['SPITTER', S.SPITTER_WEIGHT]);
  if (w >= S.WARLOCK_WAVE) entries.push(['WARLOCK', S.WARLOCK_WEIGHT]);
  if (w >= S.TICK_WAVE) entries.push(['TICK', S.TICK_WEIGHT]);
  if (w >= S.COLOSSUS_WAVE) entries.push(['COLOSSUS', S.COLOSSUS_WEIGHT]);
  const tot = entries.reduce((s, e) => s + e[1], 0);
  const eliteFrac = (w * 30) >= S.ELITE_TIME ? S.ELITE_CHANCE : 0;
  let pack = 0, hp = 0, xp = 0, contact = 0, speed = 0;
  for (const [id, weight] of entries) {
    const T = ENEMY_TYPES[id];
    const share = weight / tot;
    pack += share * (T.packSize || 1);
    hp += share * T.hpMult * (1 + eliteFrac * (ELITE_TEMPLATE.hpMult - 1));
    xp += share * T.xpMult * (1 + eliteFrac * (ELITE_TEMPLATE.xpMult - 1));
    contact += share * T.contactDamageMult;
    speed += share * T.speedMult;
  }
  const mix = { pack, hp, xp, contact, speed };
  MIX_CACHE.set(w, mix);
  return mix;
}

// Fresh run: heat 0 is neutral by construction (heatMultipliers imported to
// prove the curves exist; a fresh run has no evolutions/pushes).
const NEUTRAL_HEAT = heatMultipliers(0);
if (NEUTRAL_HEAT.hp !== 1 || NEUTRAL_HEAT.damage !== 1 || NEUTRAL_HEAT.spawnRate !== 1) {
  throw new Error('draft_sim: heat 0 assumed neutral — heat.js changed');
}

// ---------- weapon dps estimates (live stats + live level tables) -----------
function volleyDps(player, weapons, P) {
  const w = weapons.find(x => x.type === 'VOLLEY');
  if (!w) return 0;
  const lp = weaponLevelParams('VOLLEY', w.level);
  const n = Math.min(player.stats.projectiles + (lp.proj || 0), P.maxProj);
  const perShot = player.stats.damage * (lp.dmgMult || 1) * (1 + 0.2 * (lp.proj || 0));
  return (perShot / player.stats.cooldown) * (1 + SIM_TUNING.SPREAD_EFF * (n - 1));
}

function boomerangDps(player, weapons) {
  const w = weapons.find(x => x.type === 'BOOMERANG');
  if (!w) return 0;
  const lp = weaponLevelParams('BOOMERANG', w.level);
  const cycle = WEAPONS.BOOMERANG.COOLDOWN * (player.stats.cooldown / C.WEAPON.COOLDOWN);
  const perThrow = player.stats.damage * (lp.dmgMult || 1);
  const hitsPerThrow = 1.4 + 0.5 * (player.stats.pierce + (lp.pierceBonus || 0));
  return (perThrow / cycle) * hitsPerThrow;
}

function dpsBase(player, weapons, P) {
  return volleyDps(player, weapons, P) + boomerangDps(player, weapons);
}

// Effective dps vs the live field: crowd idles cooldowns, crowds multiply
// pierce/AoE value (see header).
function dpsEff(player, weapons, N, P) {
  const crowd = clamp(N / SIM_TUNING.CROWD_SAT, 0, 1);
  const boom = weapons.find(x => x.type === 'BOOMERANG');
  const pierceTot = player.stats.pierce +
    (boom ? (weaponLevelParams('BOOMERANG', boom.level).pierceBonus || 0) : 0);
  return dpsBase(player, weapons, P) * crowd *
    (1 + SIM_TUNING.PIERCE_VAL * pierceTot + SIM_TUNING.AOE_B * crowd);
}

// ---------- draft: roll 3 like openDraft, pick 1 by policy ------------------
// Card impact = marginal {dps, ehp} fractions from the cards' known live
// magnitudes at pick time (a player's read of the card; outcomes come from
// the combat model, not from these scores).
function cardImpact(card, player, weapons, counts, P) {
  const base = dpsBase(player, weapons, P);
  if (card.kind === 'grant') {
    const shadow = { stats: { ...player.stats } };
    const add = boomerangDps(shadow, [{ type: 'BOOMERANG', level: 1 }]);
    return { dps: base > 0 ? add / base : 1, ehp: 0 };
  }
  if (card.kind === 'wlevel') {
    const cur = card.w.level;
    if (card.w.type === 'VOLLEY') {
      const a = weaponLevelParams('VOLLEY', cur), b = weaponLevelParams('VOLLEY', cur + 1);
      const f = (b.dmgMult * (1 + 0.2 * (b.proj || 0))) / (a.dmgMult * (1 + 0.2 * (a.proj || 0)));
      return { dps: base > 0 ? (f - 1) * (volleyDps(player, weapons, P) / base) : 0, ehp: 0 };
    }
    const a = weaponLevelParams('BOOMERANG', cur), b = weaponLevelParams('BOOMERANG', cur + 1);
    const f = (b.dmgMult * (1.4 + 0.5 * player.stats.pierce + 0.5 * (b.pierceBonus || 0))) /
      (a.dmgMult * (1.4 + 0.5 * player.stats.pierce + 0.5 * (a.pierceBonus || 0)));
    return { dps: base > 0 ? (f - 1) * (boomerangDps(player, weapons) / base) : 0, ehp: 0 };
  }
  const taper = id => {
    const n = (counts[id] || 0) + 1;
    return DRAFT_TAPER[Math.min(n - 1, DRAFT_TAPER.length - 1)];
  };
  switch (card.id) {
    case 'dmg': return { dps: 0.25, ehp: 0 };
    case 'rate': {
      const r = 0.15 * taper('rate');
      return { dps: r / Math.max(0.05, 1 - r), ehp: 0 };
    }
    case 'speed': return { dps: 0, ehp: 0.8 * 0.15 * taper('speed') }; // kite value
    case 'pickup': return { dps: 0.05, ehp: 0.01 };
    case 'multi': {
      const n = Math.min(player.stats.projectiles, P.maxProj);
      return n < P.maxProj
        ? { dps: SIM_TUNING.SPREAD_EFF / (1 + SIM_TUNING.SPREAD_EFF * (n - 1)), ehp: 0 }
        : { dps: 0.01, ehp: 0 };   // DEAD past the live projectile cap — honest
    }
    case 'hp': return P.hpCardPct ? { dps: 0, ehp: 0.25 } : { dps: 0, ehp: 25 / player.stats.maxHp };
    case 'pierce': return { dps: SIM_TUNING.PIERCE_VAL / (1 + SIM_TUNING.PIERCE_VAL * player.stats.pierce), ehp: 0 };
    default: return { dps: 0, ehp: 0 };
  }
}

export const POLICIES = {
  GREED_DAMAGE: { label: 'GREED-DAMAGE', pick: m => m.dps + 0.1 * m.ehp, argmax: true },
  SURVIVAL: { label: 'SURVIVAL', pick: m => 2 * m.ehp + 0.5 * m.dps, argmax: true },
  ADVERSARIAL_BAD: { label: 'ADVERSARIAL-BAD', pick: m => m.dps + m.ehp, argmax: false },
};

function buildDraftPool(weapons, patch) {
  const cards = [];
  const slotCap = 3;   // startWeaponSlots(makeProfile()) — fresh profile
  const nonVolley = weapons.filter(w => w.type !== 'VOLLEY').length;
  if (slotCap - 1 - nonVolley > 0) {
    for (const id of STARTER_WEAPONS) {
      if (id === 'VOLLEY' || weapons.some(w => w.type === id)) continue;
      cards.push({ kind: 'grant', weapon: id, weight: 1 });
    }
  }
  for (const w of weapons) {
    if ((w.level || 1) < WEAPON_MAX_LEVEL) cards.push({ kind: 'wlevel', w, weight: 1 });
  }
  for (const u of UPGRADES) cards.push({ kind: 'stat', id: u.id, weight: patch.statWeight });
  return cards;
}

function rollThree(pool, rng) {
  const p = [...pool], out = [];
  while (out.length < 3 && p.length > 0) {
    let r = rng() * p.reduce((s, c) => s + c.weight, 0);
    let idx = p.length - 1;
    for (let i = 0; i < p.length; i++) { if ((r -= p[i].weight) < 0) { idx = i; break; } }
    out.push(p.splice(idx, 1)[0]);
  }
  return out;
}

function applyCard(card, player, weapons, counts, patch) {
  if (card.kind === 'grant') { weapons.push(makeWeapon(card.weapon)); return; }
  if (card.kind === 'wlevel') { levelUpWeapon(card.w); return; }
  if (card.id === 'speed' || card.id === 'rate') {
    counts[card.id] = (counts[card.id] || 0) + 1;
    const t = DRAFT_TAPER[Math.min(counts[card.id] - 1, DRAFT_TAPER.length - 1)];
    if (card.id === 'speed') player.stats.speed *= 1 + 0.15 * t;
    else player.stats.cooldown *= 1 - 0.15 * t;
  } else if (card.id === 'hp' && patch.hpCardPct) {
    const add = Math.round(player.stats.maxHp * 0.25);
    player.stats.maxHp += add;
    player.hp = Math.min(player.hp + add, player.stats.maxHp);
  } else {
    UPGRADES_BY_ID[card.id].apply(player);   // REAL card apply (live numbers)
  }
}

// ---------- one run -----------------------------------------------------------
// Returns checkpoints at minute 2/5/10 (metrics frozen at death if earlier),
// the final state, and draft telemetry for the lever analysis.
export function simulateRun(seed, policyName = 'GREED_DAMAGE', patch = {}) {
  const P = { ...LIVE, ...patch };
  const policy = POLICIES[policyName];
  if (!policy) throw new Error(`draft_sim: unknown policy ${policyName}`);
  const rng = mulberry32(seed);
  const player = makePlayer();
  const weapons = [makeWeapon('VOLLEY')];
  const counts = {};
  const picks = {};
  let deadMulti = 0;          // 'multi' picks that did nothing (cap)
  let xp = player.xp, level = 1, xpNext = player.xpNext;
  let N = 0, kills = 0, dmgTaken = 0, healBank = 0;
  let t = 0, waveNum = 1, endsAt = C.ESCALATION.WAVE_LENGTH;
  let bossHp = 0, bossCount = 0, waves = 0;
  let finaleAt = Infinity, dead = false, reachedFinale = false;
  const checkpoints = {};
  const draftTimes = [];

  const snap = (mark) => {
    checkpoints[mark] = {
      at: Math.min(Math.round(t), mark),
      dead,
      survivalTime: Math.round(t),
      kills: Math.round(kills),
      damageTaken: Math.round(dmgTaken),
      wavesCleared: waves,
      level,
      gold: computeRunGold({
        kills: Math.round(kills), level, time: Math.round(t), goldMult: 1,
      }),
    };
  };

  while (t <= 600 + SIM_TUNING.FINALE_GRACE && !dead) {
    if (t >= finaleAt) { dead = true; reachedFinale = true; break; }
    const w = Math.floor(t / 30);
    const mix = spawnMix(w);

    // Spawning (expected value, live formulas).
    const interval = Math.max(0.25, C.ENEMY.SPAWN_INTERVAL - t * 0.008);
    const groups = Math.max(1, Math.ceil((1 + Math.floor(t / 25)) / 2));
    N = Math.min(SIM_TUNING.FIELD_CAP, N + (groups / interval) * mix.pack * DT);

    // Boss (live hp formula; timer pauses while it lives).
    if (bossCount === 0 && t >= endsAt) {
      bossCount = waveNum % C.ESCALATION.BOSS.DOUBLE_EVERY === 0 ? 2 : 1;
      bossHp = C.ENEMY.BASE_HP * hpScale(w) *
        (C.ESCALATION.BOSS.HP_MULT_BASE + C.ESCALATION.BOSS.HP_MULT_PER_WAVE * waveNum) *
        bossCount;
    }

    // Damage out.
    const dps = dpsEff(player, weapons, N, P);
    let dmg = dps * DT;
    if (bossHp > 0) {
      const toBoss = dmg * SIM_TUNING.BOSS_DPS_SHARE;
      bossHp -= toBoss; dmg -= toBoss;
      if (bossHp <= 0) {
        waves++;
        xp += C.ENEMY.BASE_XP * xpScale(w) * C.ESCALATION.BOSS.XP_KILLS * bossCount;
        bossCount = 0; bossHp = 0;
        if (waveNum >= C.ESCALATION.END_WAVE) finaleAt = t + SIM_TUNING.FINALE_GRACE;
        else { waveNum++; endsAt = t + C.ESCALATION.WAVE_LENGTH; }
      }
    }
    const avgHp = C.ENEMY.BASE_HP * hpScale(w) * mix.hp;
    const killN = Math.min(N, dmg / Math.max(1e-9, avgHp));
    kills += killN; N -= killN;

    // XP -> drafts.
    xp += killN * C.ENEMY.BASE_XP * xpScale(w) * mix.xp;
    while (xp >= xpNext) {
      xp -= xpNext; level++;
      xpNext = Math.floor(xpNext * P.xpGrowth);
      const offers = rollThree(buildDraftPool(weapons, P), rng);
      if (offers.length === 0) continue;
      const scored = offers.map(c => ({ c, m: cardImpact(c, player, weapons, counts, P) }));
      let best = scored[0];
      for (const s of scored) {
        const a = policy.pick(s.m), b = policy.pick(best.m);
        if (policy.argmax ? a > b : a < b) best = s;
      }
      applyCard(best.c, player, weapons, counts, P);
      const id = best.c.kind === 'stat' ? best.c.id
        : best.c.kind === 'grant' ? 'grant_' + best.c.weapon : 'wlevel_' + best.c.w.type;
      picks[id] = (picks[id] || 0) + 1;
      draftTimes.push(t);
      if (id === 'multi' && player.stats.projectiles > P.maxProj) deadMulti++;
    }

    // Damage in (pressure curve — see header).
    const avgSpd = C.ENEMY.BASE_SPEED * (1 + 0.05 * w) * mix.speed;
    const closing = clamp(avgSpd / player.stats.speed, 0.12, 1.6);
    const surround = clamp(N / SIM_TUNING.OVERWHELM_N, 0, 1);
    let hits = Math.min(SIM_TUNING.HITS_CAP,
      SIM_TUNING.PRESSURE_K * surround * surround * closing);
    if (bossHp > 0) hits = Math.min(SIM_TUNING.HITS_CAP, hits + 0.3);
    const hurt = hits * 12 * dmgScale(w) * mix.contact * DT;
    if (hurt > 0) {
      if (player.hp < 0.5 * player.stats.maxHp && healBank >= 1) {
        player.hp = Math.min(player.stats.maxHp, player.hp + C.POTIONS.HP_HEAL);
        healBank--;
      }
      player.hp -= hurt; dmgTaken += hurt;
      if (player.hp <= 0) dead = true;
    }
    healBank += killN * C.POTIONS.DROP_CHANCE;

    for (const mark of [120, 300, 600]) if (t >= mark && !checkpoints[mark]) snap(mark);
    if (dead) break;
    t += DT;
  }
  for (const mark of [120, 300, 600]) if (!checkpoints[mark]) snap(mark);

  return {
    policy: policyName,
    dead, reachedFinale,
    survivalTime: Math.round(t),
    checkpoints,
    picks,
    deadMulti,
    draftsByMinute: {
      120: draftTimes.filter(x => x <= 120).length,
      300: draftTimes.filter(x => x <= 300).length,
      600: draftTimes.filter(x => x <= 600).length,
    },
  };
}

// ---------- cohort + verdict --------------------------------------------------
export function simulateCohort(seed, runs, policyName, patch = {}) {
  const out = [];
  for (let i = 0; i < runs; i++) out.push(simulateRun(seed + i * 7919, policyName, patch));
  return out;
}

function cohortSummary(cohort, mark) {
  const cp = cohort.map(r => r.checkpoints[mark]);
  return {
    survival: median(cohort.map(r => r.survivalTime)),
    kills: median(cp.map(c => c.kills)),
    damageTaken: median(cp.map(c => c.damageTaken)),
    waves: median(cp.map(c => c.wavesCleared)),
    gold: median(cp.map(c => c.gold)),
    failRate: cohort.filter(r => r.dead && !r.reachedFinale).length / cohort.length,
  };
}

// The acceptance bar from the brief (see header): bad can fail + dies
// meaningfully earlier; good beats bad on >=3 of 5 minute-10 metrics.
export function divergenceVerdict(good, bad) {
  const g = cohortSummary(good, 600), b = cohortSummary(bad, 600);
  const wins = [
    ['survivalTime', g.survival > b.survival],
    ['kills', g.kills > b.kills],
    ['wavesCleared', g.waves > b.waves],
    ['gold', g.gold > b.gold],
    ['damageTaken (lower better)', g.damageTaken < b.damageTaken],
  ];
  const winCount = wins.filter(w => w[1]).length;
  return {
    pass: b.failRate >= 0.5 && b.survival <= 0.8 * g.survival && winCount >= 3,
    badCanFail: b.failRate >= 0.5,
    badEarlier: b.survival <= 0.8 * g.survival,
    goodBad: b.survival > 0 ? g.survival / b.survival : Infinity,
    metricWins: wins, winCount,
    good: g, bad: b,
  };
}

// ---------- lever analysis ----------------------------------------------------
// PROPOSALS ONLY — no src/ edits. Each lever re-runs the sim with the live
// value patched to the proposal and reports the divergence delta, so the
// tuning decision gets numbers, not vibes.
export const LEVERS = [
  {
    id: 'L1', name: 'stat-card draft weight',
    file: 'src/main.js:1418 (openDraft pool)',
    current: 'stat cards weight 0.3 vs weapon cards 1.0 (~30% of pool weight is stats)',
    proposed: 'statWeight 0.3 -> 0.5',
    patch: { statWeight: 0.5 },
    why: 'the draft decision layer (stat cards) is a minority of offers; weapon level-up cards are near-auto-picks, so most drafts carry no real decision',
  },
  {
    id: 'L2', name: 'hp card: flat -> percent',
    file: 'src/config.js UPGRADES.hp (Iron Heart)',
    current: '+25 flat max HP + heal 25',
    proposed: '+25% max HP (+ same fraction healed)',
    patch: { hpCardPct: true },
    why: 'flat +25 decays vs the multiplicative dmgScale contact curve (x5.25 by t=300) — the SURVIVAL archetype\'s core card stops mattering exactly when runs are decided',
  },
  {
    id: 'L3', name: 'projectile cap / dead multi card',
    file: 'src/config.js WEAPON.MAX_PROJECTILES (3); src/main.js:241-244',
    current: 'cap 3; a 3rd Split Shot card does NOTHING (dead card in the draft)',
    proposed: 'cap 3 -> 4 (or convert overflow picks to +20% damage like VOLLEY Lv3/6)',
    patch: { maxProj: 4 },
    why: 'a draft card that can be picked while doing nothing is the purest form of a fake choice — it also poisons the ADVERSARIAL-BAD score (bad takes multi for free)',
  },
  {
    id: 'L4', name: 'xp curve / draft frequency',
    file: 'src/config.js XP_LEVEL_GROWTH (1.35)',
    current: 'xpNext x1.35 per level',
    proposed: '1.35 -> 1.28',
    patch: { xpGrowth: 1.28 },
    why: 'the number of drafts (decisions) per run collapses mid-run exactly as escalation compounds — the game takes the steering wheel away at minute 4-5',
  },
];

function leverDelta(seed, runs, patch) {
  const good = simulateCohort(seed, runs, 'GREED_DAMAGE', patch);
  const bad = simulateCohort(seed, runs, 'ADVERSARIAL_BAD', patch);
  const surv = simulateCohort(seed, runs, 'SURVIVAL', patch);
  return {
    ...divergenceVerdict(good, bad),
    survMed: cohortSummary(surv, 600).survival,
  };
}

// ---------- main --------------------------------------------------------------
function main() {
  const args = process.argv.slice(2);
  const flag = (name, dflt) => {
    const i = args.indexOf(name);
    return i >= 0 && args[i + 1] !== undefined ? Number(args[i + 1]) : dflt;
  };
  const runs = Math.max(3, Math.floor(flag('--runs', 60)));
  const seed = Math.max(1, Math.floor(flag('--seed', 4242)));
  const leverRuns = Math.min(runs, 30);

  console.log(`HORDES WAVE-18 DRAFT STAKES SIM — ${runs} runs/archetype, seed ${seed}`);
  console.log(`fresh profile (starter VOLLEY+BOOMERANG, 3 slots); draft is the only lever`);
  console.log('');

  const cohorts = {
    GREED_DAMAGE: simulateCohort(seed, runs, 'GREED_DAMAGE'),
    SURVIVAL: simulateCohort(seed, runs, 'SURVIVAL'),
    ADVERSARIAL_BAD: simulateCohort(seed, runs, 'ADVERSARIAL_BAD'),
  };

  // Divergence table (medians) at minute 2 / 5 / 10.
  for (const mark of [120, 300, 600]) {
    console.log(`--- minute ${mark / 60} (medians; metrics freeze at death) ---`);
    console.log('policy          | survive(s) | kills | dmg taken | waves | gold  | dead%');
    console.log('----------------+------------+-------+-----------+-------+-------+------');
    for (const [name, cohort] of Object.entries(cohorts)) {
      const s = cohortSummary(cohort, mark);
      const deadFrac = cohort.filter(r => r.checkpoints[mark].dead).length / cohort.length;
      console.log(
        POLICIES[name].label.padEnd(16) + ' | ' +
        String(Math.round(s.survival)).padStart(10) + ' | ' +
        String(Math.round(s.kills)).padStart(5) + ' | ' +
        String(Math.round(s.damageTaken)).padStart(9) + ' | ' +
        String(s.waves).padStart(5) + ' | ' +
        String(Math.round(s.gold)).padStart(5) + ' | ' +
        (100 * deadFrac).toFixed(0).padStart(4) + '%');
    }
    console.log('');
  }

  // Draft telemetry (medians): how many decisions actually happened.
  console.log('draft telemetry (median picks by minute / dead-multi picks / archetype shape):');
  for (const [name, cohort] of Object.entries(cohorts)) {
    const mid = cohort[runs >> 1];
    const top = Object.entries(mid.picks).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([k, v]) => `${k}x${v}`).join(' ');
    console.log(`  ${POLICIES[name].label.padEnd(16)} drafts m2:${mid.draftsByMinute[120]}` +
      ` m5:${mid.draftsByMinute[300]} m10:${mid.draftsByMinute[600]}` +
      ` dead-multi:${mid.deadMulti}  [${top}]`);
  }
  console.log('');

  // The acceptance test, verbatim bar.
  const v = divergenceVerdict(cohorts.GREED_DAMAGE, cohorts.ADVERSARIAL_BAD);
  console.log('ACCEPTANCE BAR (brief, verbatim):');
  console.log('  "a deliberately bad draft run must be able to fail, and a good draft must');
  console.log('   visibly outperform it. If two opposite draft strategies produce the same');
  console.log('   result at minute 10, the balance is broken."');
  console.log(`  bad can fail (>=50% bad runs die before the finale): ${(100 * v.bad.failRate).toFixed(0)}% -> ${v.badCanFail ? 'yes' : 'NO'}`);
  console.log(`  bad dies meaningfully earlier (<=0.8x good): bad ${Math.round(v.bad.survival)}s vs good ${Math.round(v.good.survival)}s (ratio ${v.goodBad.toFixed(2)}) -> ${v.badEarlier ? 'yes' : 'NO'}`);
  console.log(`  good beats bad on >=3 of 5 minute-10 metrics: ${v.winCount}/5 -> ${v.winCount >= 3 ? 'yes' : 'NO'}`);
  for (const [metric, won] of v.metricWins) console.log(`    ${won ? 'W' : '.'} ${metric}`);
  console.log(`VERDICT: ${v.pass ? 'PASS' : 'FAIL'}`);
  console.log('');

  // Lever analysis: where draft impact collapses + quantified proposals.
  console.log('LEVER ANALYSIS — where draft impact collapses (proposals only, no src/ edits):');
  const medSurv = name => Math.round(cohortSummary(cohorts[name], 600).survival);
  console.log(`  baseline: good ${medSurv('GREED_DAMAGE')}s vs bad ${medSurv('ADVERSARIAL_BAD')}s survival (x${v.goodBad.toFixed(2)})`);
  for (const L of LEVERS) {
    const lv = leverDelta(seed, leverRuns, L.patch);
    const baseSurv = cohortSummary(cohorts.SURVIVAL, 600).survival;
    console.log(`  ${L.id} ${L.name} — ${L.file}`);
    console.log(`     current: ${L.current}`);
    console.log(`     proposed: ${L.proposed}`);
    console.log(`     expected divergence: good/bad survival x${lv.goodBad.toFixed(2)} ` +
      `(baseline x${v.goodBad.toFixed(2)}), survival-archetype ${Math.round(lv.survMed)}s ` +
      `(baseline ${Math.round(baseSurv)}s), metric wins ${lv.winCount}/5, ` +
      `bad fail ${(100 * lv.bad.failRate).toFixed(0)}% -> ${lv.pass ? 'PASS' : 'FAIL'} bar`);
    console.log(`     why: ${L.why}`);
  }
  console.log('');

  if (!v.pass) process.exitCode = 1;
}

// Only auto-run when invoked directly (test_draft_sim.mjs imports this module —
// importing must NOT trigger a simulation).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
