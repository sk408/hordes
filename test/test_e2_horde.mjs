// HORDES — E2: THE WAVE-2 HORDE (docs/briefs/E2_HORDE.md)
//
// The contract under test, driving the REAL seams (no copies):
//   R1/R2 the heavy tier (BRUTE/DASHER/TICK + the flying SHRIKE) carries
//         C.E2.HEAVY_HP_MULT x a chaser's hp at the same ladder tick from
//         state.wave.num >= C.E2.WAVE on, wrath-stamped like the herald; the
//         herald reads config.js's ONE midBossHp definition;
//   R3    heavies spawn RARER than chaff (one weight dial) + a guaranteed
//         one-of-each debut ring on the horde wave's first spawn tick;
//   R4    the mid-boss stays distinct by BEHAVIOUR: heavies route through
//         decideEnemyAction (no boss stamps), the herald through
//         decideBossAction (boss + midBoss + bossId HERALD);
//   R5    chaff packs grow by ONE knob (C.E2.CHAFF_DENSITY_MULT, measured in
//         a live window: a pop is round(packSize x the knob));
//   R6    plain-chaff potion/chest/xp pay near-zero from the horde
//         wave on (an elite is an EVENT, never chaff);
//   R7    the purse follows the BODY: the heavy stamp pays HEAVY, a
//         wave-1 TICK still pays CHAFF, and the live ledger is exactly one
//         soft-capped tier payment per kill (no double-payment);
//   R8    heavies pay HEAVY_XP_KILLS base kills of xp (drafts must not
//         collapse — measured in the AFTER probe, the stamp pinned here);
//   R9    the SHRIKE flies: z drawn (age-pure, 60Hz == 120Hz) with a ground
//         shadow, an oblique-cruise/committed-dive swoop, ground AoE
//         (novas/shockwaves/blasts) cannot touch it, frost slow never grips
//         it — but DIRECT hits (the chain beam, projectiles) land.
// Run: node test/test_e2_horde.mjs
import { suite, boot } from './_harness.mjs';
import { CONFIG as C, midBossHp, ladderHp, ladderXp } from '../src/config.js';
import { ENEMY_TYPES, decideEnemyAction, flyingZ, makeTypedEnemy } from '../src/enemy_types.js';
import { GOLD_TIER, RUN_GOLD, purseTier, purseValue } from '../src/meta.js';
import { wrathMultipliers, wrathOf } from '../src/wrath.js';
import { mulberry32 } from '../src/weather.js';

const s = suite('test_e2_horde');

// ---------------------------------------------------------------------------
// 1. Static pins: the E2 knob block, the ONE midBossHp definition, type flags.
// ---------------------------------------------------------------------------
s.check('C.E2: ONE horde knob block, gated on the 120s wave', () => {
  if (C.E2.WAVE !== 2) throw new Error('E2.WAVE = ' + C.E2.WAVE);
  if (!(C.E2.CHAFF_DENSITY_MULT > 1)) throw new Error('CHAFF_DENSITY_MULT = ' + C.E2.CHAFF_DENSITY_MULT + ' (R5: the horde is DENSER)');
  if (!(C.E2.HEAVY_HP_MULT > 1)) throw new Error('HEAVY_HP_MULT = ' + C.E2.HEAVY_HP_MULT + ' (R1: a heavy out-bodies a chaser)');
  if (C.E2.HEAVY_WEIGHT_MULT >= 1) throw new Error('heavies must thin out, not fatten (R3)');
  if (C.E2.CHAFF_DROP_MULT > 0.1) throw new Error('CHAFF_DROP_MULT = ' + C.E2.CHAFF_DROP_MULT + ' (R6: near-zero)');
  if (C.E2.CHAFF_XP_MULT > 0.5) throw new Error('CHAFF_XP_MULT = ' + C.E2.CHAFF_XP_MULT + ' (R6: near-zero)');
  if (C.E2.HEAVY_XP_KILLS < 2) throw new Error('HEAVY_XP_KILLS = ' + C.E2.HEAVY_XP_KILLS + ' (R8: heavies pay)');
  if (!(C.E2.SHRIKE_WEIGHT > 0)) throw new Error('the SHRIKE needs a pool weight (R9)');
});

s.check('R2: midBossHp is the ONE definition of the MIDBOSS formula', () => {
  const M = C.ESCALATION.MIDBOSS;
  for (const [num, w] of [[1, 2], [1, 4], [3, 7]]) {
    const want = C.ENEMY.BASE_HP * ladderHp(w) * (M.HP_MULT_BASE + M.HP_MULT_PER_WAVE * num);
    if (midBossHp(num, w) !== want) {
      throw new Error('midBossHp(' + num + ',' + w + ') = ' + midBossHp(num, w) + ' != ' + want);
    }
  }
});

// ---------------------------------------------------------------------------
// 2. Type flags: the heavy tier, the chaff swarm, the flying SHRIKE.
// ---------------------------------------------------------------------------
s.check('R1/R9 type flags: heavies, chaff, and the flying SHRIKE', () => {
  for (const id of ['BRUTE', 'DASHER', 'TICK', 'SHRIKE']) {
    if (ENEMY_TYPES[id].heavy !== true) throw new Error(id + ' is not flagged heavy (R1)');
  }
  for (const id of ['CHASER', 'SWARMER']) {
    if (ENEMY_TYPES[id].chaff !== true) throw new Error(id + ' must stay chaff (R5)');
    if (ENEMY_TYPES[id].heavy) throw new Error(id + ' must NOT be heavy');
  }
  for (const id of ['SPITTER', 'WARLOCK', 'COLOSSUS', 'PILLAR']) {
    if (ENEMY_TYPES[id].heavy || ENEMY_TYPES[id].chaff) {
      throw new Error(id + ' is neither heavy nor chaff tier');
    }
  }
  if (ENEMY_TYPES.SHRIKE.flying !== true) throw new Error('the SHRIKE is not flying (R9)');
});

// ---------------------------------------------------------------------------
// 3. The swoop is age-pure: oblique cruise, committed dive (no boot needed).
// ---------------------------------------------------------------------------
s.check('R9 swoop: oblique cruise, committed straight dive, age-phase only', () => {
  const T = ENEMY_TYPES.SHRIKE;
  const pl = { x: 100, y: 0 };
  const cruise = decideEnemyAction({ typeId: 'SHRIKE', age: 1.0, x: 0, y: 0 }, pl, 1 / 60);
  const cMag = Math.hypot(cruise.mx, cruise.my);
  if (Math.abs(cMag - T.cruiseSpeedMult) > 1e-9) throw new Error('cruise speed ' + cMag);
  const cAng = Math.abs(Math.atan2(cruise.my, cruise.mx));   // player dead ahead (+x)
  if (Math.abs(cAng - T.oblique) > 1e-9) {
    throw new Error('cruise is a beeline, not a swoop: bearing ' + cAng + ' vs oblique ' + T.oblique);
  }
  const dive = decideEnemyAction({ typeId: 'SHRIKE', age: T.cruiseTime + 0.1, x: 0, y: 0 }, pl, 1 / 60);
  const dMag = Math.hypot(dive.mx, dive.my);
  if (Math.abs(dMag - T.diveSpeedMult) > 1e-9) throw new Error('dive speed ' + dMag);
  if (Math.abs(Math.atan2(dive.my, dive.mx)) > 1e-9) {
    throw new Error('the dive is not committed (it steers off the bearing)');
  }
  // Altitude: cruise hovers high, mid-dive dips low. Pure age in, px out.
  const zc = flyingZ({ typeId: 'SHRIKE', age: 1.0 });
  if (zc < T.hoverZ - 3) throw new Error('cruise altitude ' + zc);
  const zd = flyingZ({ typeId: 'SHRIKE', age: T.cruiseTime + T.diveTime / 2 });
  if (zd > T.hoverZ / 2) throw new Error('the dive never swoops low: ' + zd);
  if (flyingZ({ typeId: 'CHASER', age: 1 }) !== 0) throw new Error('a walker has altitude');
});

// ---------------------------------------------------------------------------
// Live boot: every check below drives the REAL frame loop.
// ---------------------------------------------------------------------------
const h = await boot({ storage: [['hordes_onboarded', '1']] });
const T = h.T, st = h.state;
T.banners.suppressAll();
T.startRun(); h.pump(2);
Math.random = mulberry32(20260914);
const p = st.player;

// Count spawner arrivals over a real window at a planted 120s-wave number.
function spawnWindow(num, seconds) {
  st.wave.num = num; st.wave.endsAt = 1e9; st.wave.midBossDone = true; st.spawnTimer = 0;
  const seen = new Set(st.enemies), counts = {};
  for (let i = 0, n = Math.round(seconds * 60); i < n; i++) {
    h.pump(1);
    for (const e of st.enemies) {
      if (!seen.has(e)) { seen.add(e); if (!e.boss) counts[e.typeId] = (counts[e.typeId] || 0) + 1; }
    }
  }
  return counts;
}

// ---------------------------------------------------------------------------
// 4. R2: the wave-1 herald reads midBossHp EXACTLY (byte-identical retarget).
// ---------------------------------------------------------------------------
s.check('R2: the herald spawns at midBossHp(waveNum, tick) x wrath exactly', () => {
  st.enemies.length = 0;
  st.time = 60; st.wave.num = 1; st.wave.midAt = 60; st.wave.midBossDone = false;
  const wrath = wrathMultipliers(wrathOf(st)).hp;
  if (wrath !== 1) throw new Error('a fresh run must sit at wrath x1 (got ' + wrath + ')');
  h.pump(3);
  const herald = st.enemies.find(e => e.midBoss);
  if (!herald) throw new Error('the herald never spawned');
  // HERALD desc.hpMult is 1.0 (bosses.js) — the live tick is unambiguous
  // (t in [60,90) -> w = 2).
  const want = midBossHp(1, 2) * wrath;
  if (Math.abs(herald.maxHp - want) > 1e-9 * want) {
    throw new Error('herald maxHp ' + herald.maxHp + ' != midBossHp(1,2) = ' + want);
  }
  // R4: the herald is a BOSS-routed body (its own decide, its own stamps).
  if (!herald.boss || !herald.midBoss || herald.bossId !== 'HERALD') {
    throw new Error('the herald lost its boss routing stamps');
  }
  st.enemies.length = 0; st.wave.midBosses = [];
});

// ---------------------------------------------------------------------------
// 5. R2/R3/R4: the guaranteed debut stamps the heavy body on all 4 heavies.
// ---------------------------------------------------------------------------
s.check('R2/R3: the horde wave debuts ONE of each heavy at HEAVY_HP_MULT x a chaser', () => {
  st.time = 121; st.wave.num = C.E2.WAVE; st.wave.endsAt = 1e9;
  st.wave.midBossDone = true; st.enemies.length = 0; st.spawnTimer = 0;
  h.pump(2);
  if (!st.wave.e2HeavyDebut) throw new Error('the guaranteed debut never fired');
  const wrath = wrathMultipliers(wrathOf(st)).hp;
  // t in [120,150) -> w = 4. A plain chaser at that tick is BASE_HP x ladderHp.
  const chaserHp = C.ENEMY.BASE_HP * ladderHp(4) * ENEMY_TYPES.CHASER.hpMult * wrath;
  const want = chaserHp * C.E2.HEAVY_HP_MULT;
  for (const id of ['BRUTE', 'DASHER', 'TICK', 'SHRIKE']) {
    const e = st.enemies.find(x => x.typeId === id);
    if (!e) throw new Error(id + ' missing from the debut ring');
    if (Math.abs(e.maxHp - want) > 1e-9 * want) {
      throw new Error(id + ' maxHp ' + e.maxHp + ' != BASE_HP x ladderHp(4) x HEAVY_HP_MULT x wrath = ' + want);
    }
    if (e.purseTier !== 'HEAVY') throw new Error(id + ' purseTier = ' + e.purseTier + ' (R7)');
    // R4: a heavy is NOT a boss — it routes through its TYPE behaviour.
    if (e.boss || e.midBoss || e.bossId) throw new Error(id + ' wears boss stamps');
    // R8: the heavy corpse pays HEAVY_XP_KILLS base kills.
    const hxp = C.ENEMY.BASE_XP * ladderXp(4) * C.E2.HEAVY_XP_KILLS;
    if (Math.abs(e.xp - hxp) > 1e-9 * hxp) throw new Error(id + ' xp ' + e.xp + ' != ' + hxp);
  }
  // The tier ordering: every heavy has the same body, heavier than a chaser
  // and lighter than the herald it shares the wave with.
  if (!(want > chaserHp)) throw new Error('a heavy is not heavier than a chaser');
  if (!(want < midBossHp(C.E2.WAVE, 4) * wrath)) throw new Error('a heavy out-bodies the herald');
  const shrike = st.enemies.find(x => x.typeId === 'SHRIKE');
  if (!shrike.flying) throw new Error('the debut SHRIKE is not flagged flying');
});

// ---------------------------------------------------------------------------
// 6. R5 + R3: chaff packs grow by the knob; heavies stay the rare tier. (Live
//    windows, same run, drafts suppressed so the loop never pauses.)
// ---------------------------------------------------------------------------
p.xpNext = 1e12;
p.stats.maxHp = 1e6; p.hp = 1e6;   // the windows measure SPAWNS, not survival
let mixW1 = null, mixW2 = null;
s.check('R5: ONE knob grows the chaff pop (live window measure)', () => {
  st.time = 121; st.enemies.length = 0;
  mixW1 = spawnWindow(1, 30);
  st.enemies.length = 0;
  mixW2 = spawnWindow(C.E2.WAVE, 30);
  const sw1 = mixW1.SWARMER || 0, ch1 = mixW1.CHASER || 0;
  const sw2 = mixW2.SWARMER || 0, ch2 = mixW2.CHASER || 0;
  if (sw1 === 0 || ch1 === 0) throw new Error('the wave-1 control window produced no chaff');
  if (sw2 === 0 || ch2 === 0) throw new Error('the horde window produced no chaff');
  // Pop shape: a pack is max(1, round(packSize x the knob)) at the horde wave,
  // packSize below it.
  const pop = (id, mult) => Math.max(1, Math.round((ENEMY_TYPES[id].packSize || 1) * mult));
  const swPop1 = pop('SWARMER', 1), swPop2 = pop('SWARMER', C.E2.CHAFF_DENSITY_MULT);
  if (!(swPop2 > swPop1)) throw new Error('the knob does not grow a swarmer pack: ' + swPop1 + ' -> ' + swPop2);
  if (sw1 % swPop1 !== 0) throw new Error('wave-1 swarmer arrivals not in pops of ' + swPop1 + ': ' + sw1);
  if (sw2 % swPop2 !== 0) throw new Error('wave-2 swarmer arrivals not in pops of ' + swPop2 + ': ' + sw2);
  if (ch2 % pop('CHASER', C.E2.CHAFF_DENSITY_MULT) !== 0) {
    throw new Error('wave-2 chaser arrivals not in pops of ' + pop('CHASER', C.E2.CHAFF_DENSITY_MULT) + ': ' + ch2);
  }
});

s.check('R3: heavies are the rare tier; the SHRIKE flies with the horde', () => {
  // The SHRIKE is a thin slice of the pool (SHRIKE_WEIGHT) and one 30s window
  // can miss it on the draw: keep the horde spawning until one arrives.
  for (let i = 0; i < 8 && !(mixW2.SHRIKE > 0); i++) {
    st.enemies.length = 0;
    for (const [id, n] of Object.entries(spawnWindow(C.E2.WAVE, 30))) mixW2[id] = (mixW2[id] || 0) + n;
  }
  const heavy = (mixW2.BRUTE || 0) + (mixW2.DASHER || 0) + (mixW2.TICK || 0) + (mixW2.SHRIKE || 0);
  const chaff = (mixW2.CHASER || 0) + (mixW2.SWARMER || 0);
  if (heavy === 0) throw new Error('no heavies in the wave-2 mix');
  if (!(heavy < chaff)) throw new Error('heavies ' + heavy + ' not rarer than chaff ' + chaff);
  if (!(mixW2.SHRIKE > 0)) throw new Error('no SHRIKE in the wave-2 mix');
  // The debut fired exactly once (back in section 5): the flag held through
  // two more wave-2 windows.
  if (st.wave.e2HeavyDebut !== true) throw new Error('the debut flag did not stick');
});

// ---------------------------------------------------------------------------
// 7. R6: plain-chaff potion/chest/xp near-zero at the horde wave —
//    through the REAL kill funnel (planted corpses, hp = 0, reaped live).
// ---------------------------------------------------------------------------
s.check('R6: chaff potion/chest rolls collapse at the horde wave', () => {
  // Deterministic through the REAL kill funnel: ONE planted plain-chaff
  // corpse (hp 0, reaped live) with Math.random forced to a constant. A
  // roll at 0.02 lands under the ungated chest chance (0.35) but over the
  // horde-wave scaled ones (x CHAFF_DROP_MULT) — so wave 1 pays and wave 2
  // does not, bit-exact, no Poisson noise. A second roll UNDER the scaled
  // chance proves near-zero is not zero.
  // POTION TUNE RETARGET (2026-09-17, owner msg_01M2R9CX "cut it TO 1/5th"):
  // DROP_CHANCE 0.03 -> 0.006 (x0.05 chaff = 0.0003), so the POTION control
  // rolls moved 0.02 -> 0.003 (wave 1 pays, horde wave blocks) and the
  // near-zero roll 0.001 -> 0.0001. The CHEST rolls are untouched (0.35).
  const reap = (num, rngVal, eliteish) => {
    st.wave.num = num; st.enemies.length = 0; st.drops.length = 0; st.chests.length = 0;
    // The adaptive drop factor (loot.js) scales the potion chance down while
    // the rolling kill rate is high; this probe prices the un-scaled channel.
    st.killRateEwma = 0; st.killsAtRateTick = p.kills;
    const e = makeTypedEnemy('CHASER', p.x + 400, p.y, st.time);
    e.hp = 0; e.preStageMaxHp = eliteish ? 5000 : 10;
    st.enemies.push(e);
    const old = Math.random;
    Math.random = () => rngVal;
    h.pump(1);
    Math.random = old;
    return { potions: st.drops.length, chests: st.chests.length };
  };
  // Potions (not elite-ish: the chest roll stays out of the way).
  if (reap(1, 0.003, false).potions !== 1) throw new Error('the wave-1 chaff potion channel regressed');
  if (reap(C.E2.WAVE, 0.003, false).potions !== 0) {
    throw new Error('a chaff potion paid out at the un-scaled roll (0.003)');
  }
  if (reap(C.E2.WAVE, 0.0001, false).potions !== 1) {
    throw new Error('the scaled chaff potion roll is ZERO, not near-zero (0.0001 must pay)');
  }
  // Chests (elite-ish by hp: the chest roll REALLY runs).
  if (reap(1, 0.02, true).chests !== 1) throw new Error('the wave-1 chaff chest channel regressed');
  if (reap(C.E2.WAVE, 0.02, true).chests !== 0) {
    throw new Error('a chaff chest paid out at the un-scaled roll (0.02)');
  }
  if (reap(C.E2.WAVE, 0.01, true).chests !== 1) {
    throw new Error('the scaled chaff chest roll is ZERO, not near-zero (0.01 must pay)');
  }
});

s.check('R6/R8: chaff xp is the cut one; the heavy xp is the paying one', () => {
  // A real spawned plain chaser at the horde wave carries CHAFF_XP_MULT of
  // the un-cut value; a heavy carries HEAVY_XP_KILLS base kills (section 5
  // pinned the stamp exactly). Ratio of the two knobs is the income move.
  const chaser = makeTypedEnemy('CHASER', 0, 0, 121);
  const uncut = chaser.xp;   // factory value, pre-escalation re-base
  if (!(uncut > 0)) throw new Error('the chaser factory xp moved');
  if (!(C.E2.CHAFF_XP_MULT < 1)) throw new Error('chaff xp is not cut at the horde wave');
  if (!(C.E2.HEAVY_XP_KILLS >= 2 * C.E2.CHAFF_XP_MULT * ENEMY_TYPES.CHASER.xpMult)) {
    throw new Error('a heavy must out-pay a cut chaff corpse at least twice over');
  }
});

// ---------------------------------------------------------------------------
// 8. R7: the purse follows the BODY — and the live ledger never double-pays.
// ---------------------------------------------------------------------------
s.check('R7: purse tiers — SHRIKE lands HEAVY, wave-1 TICK still CHAFF', () => {
  if (purseValue({ typeId: 'SHRIKE' }) !== GOLD_TIER.HEAVY) {
    throw new Error('SHRIKE purse value = ' + purseValue({ typeId: 'SHRIKE' }));
  }
  if (purseTier({ typeId: 'TICK' }) !== 'CHAFF') throw new Error('a wave-1 TICK body must still pay CHAFF');
  if (purseTier({ typeId: 'TICK', purseTier: 'HEAVY' }) !== 'HEAVY') throw new Error('the heavy stamp is not read');
  if (purseTier({ typeId: 'TICK', elite: true }) !== 'ELITE') throw new Error('elite must outrank the stamp');
  if (purseTier({ boss: true, midBoss: true }) !== 'MID_BOSS') throw new Error('the herald tier moved');
  if (purseTier({ boss: true }) !== 'BOSS') throw new Error('the boss tier moved');
  if (!(GOLD_TIER.HEAVY > GOLD_TIER.GRUNT && GOLD_TIER.GRUNT > GOLD_TIER.CHAFF)) {
    throw new Error('the tier ladder itself broke');
  }
});

s.check('R7: no double-payment — live purse = exactly one soft-capped tier payment per kill', () => {
  st.wave.num = C.E2.WAVE; st.enemies.length = 0; st.drops.length = 0; st.chests.length = 0;
  const g0 = st.runCounts.gold.earned, k0 = { ...st.runCounts.gold.kills };
  const carry0 = st.runCounts.gold.carry || 0, surv0 = st.runCounts.gold.survival || 0;
  const kills0 = p.kills;
  const income = (p.stats.goldMult || 1) * (p.stats.purseKillMult || 1);   // prestige 0
  const n = 60;
  for (let i = 0; i < n; i++) {
    const e = makeTypedEnemy('CHASER', p.x + 400, p.y + (i % 5 - 2) * 20, st.time);
    e.hp = 0; e.preStageMaxHp = 10;
    st.enemies.push(e);
  }
  for (let i = 0; i < 5; i++) {
    const e = makeTypedEnemy('SHRIKE', p.x + 420, p.y + i * 12, st.time);
    e.hp = 0; e.preStageMaxHp = 5000; e.purseTier = 'HEAVY';   // the stamp's word
    st.enemies.push(e);
  }
  h.pump(2);
  const g = st.runCounts.gold;
  const de = g.earned - g0 - ((g.survival || 0) - surv0);
  const heavyKills = (g.kills.HEAVY || 0) - (k0.HEAVY || 0);
  const gruntKills = (g.kills.GRUNT || 0) - (k0.GRUNT || 0);
  if (heavyKills !== 5 || gruntKills !== n) {
    throw new Error('tier routing: HEAVY +' + heavyKills + ' GRUNT +' + gruntKills);
  }
  // The reap walks the list from the back (heavies first); the k-th kill of
  // the run pays tier / (1 + k / KILL_SOFTCAP), fractions carried.
  let owed = 0, k = kills0;
  for (let i = 0; i < 5; i++) owed += GOLD_TIER.HEAVY / (1 + (++k) / RUN_GOLD.KILL_SOFTCAP);
  for (let i = 0; i < n; i++) owed += GOLD_TIER.GRUNT / (1 + (++k) / RUN_GOLD.KILL_SOFTCAP);
  owed *= income;
  const paid = de + (g.carry || 0) - carry0;   // banked whole gold + the fraction still carried
  if (Math.abs(paid - owed) > 1e-6) {
    throw new Error('double-payment: paid ' + paid + ' for 60 chaff + 5 heavies, owed ' + owed);
  }
  if (!(paid <= (5 * GOLD_TIER.HEAVY + n * GOLD_TIER.GRUNT) * income)) {
    throw new Error('the soft cap RAISED a kill payment: ' + paid);
  }
});

// ---------------------------------------------------------------------------
// 9. R9 — the flying trait, BOTH halves, through the REAL seams.
// ---------------------------------------------------------------------------
// The ground-AoE checks read the flyer's hp across two frames: keep the kit's
// own DIRECT fire (which rightly hurts a flyer) out of that read.
function holdFire() {
  st.projectiles.length = 0;
  for (const w of st.weapons) w.cd = 5;
}

s.check('R9a: a real FROST_NOVA cast cannot touch a flyer — damage OR slow', () => {
  st.wave.num = C.E2.WAVE; st.enemies.length = 0;
  const shrike = makeTypedEnemy('SHRIKE', p.x + 30, p.y, st.time);
  const chaser = makeTypedEnemy('CHASER', p.x - 30, p.y, st.time);
  st.enemies.push(shrike, chaser);
  const savedChar = st.character;
  st.character = { ...(savedChar || {}), skill: 'FROST_NOVA' };
  p.mana = 999; p.stats.maxMana = 999; p.skillCd = {};
  holdFire();
  const s0 = shrike.hp, c0 = chaser.hp;
  h.key('keydown', { key: 'q', preventDefault() {} });
  h.pump(2);
  st.character = savedChar;
  if (shrike.hp !== s0) throw new Error('the nova hurt the flyer: ' + s0 + ' -> ' + shrike.hp);
  if (shrike.slow > 0) throw new Error('frost slow gripped the flyer');
  if (shrike.flash > 0) throw new Error('the flyer even flashed');
  if (!(chaser.hp < c0)) throw new Error('the grounded neighbour took no nova damage — the cast never happened?');
  if (!(chaser.slow > 0)) throw new Error('the grounded neighbour is not slowed');
});

s.check('R9a2: the chain beam is DIRECT — it hurts the flyer but cannot slow it', () => {
  st.enemies.length = 0;
  const shrike = makeTypedEnemy('SHRIKE', p.x + 30, p.y, st.time);
  const chaser = makeTypedEnemy('CHASER', p.x - 30, p.y, st.time);
  chaser.hp = chaser.maxHp = 5000;   // keep the neighbour alive for the slow read
  st.enemies.push(shrike, chaser);
  const savedChar = st.character;
  st.character = { ...(savedChar || {}), skill: 'CHAIN_REACTION' };
  p.mana = 999; p.stats.maxMana = 999; p.skillCd = {};
  const s0 = shrike.hp;
  h.key('keydown', { key: 'q', preventDefault() {} });
  h.pump(2);
  st.character = savedChar;
  if (!(shrike.hp < s0)) throw new Error('the chain beam did NOT hurt the flyer (direct hits must land)');
  if (shrike.slow > 0) throw new Error('the beam\'s frost-slow rider gripped the flyer');
  const liveChaser = st.enemies.find(e => e.typeId === 'CHASER');
  if (liveChaser && !(liveChaser.slow > 0)) throw new Error('the grounded neighbour is not slowed');
});

s.check('R9a3: the colossus shockwave (a ground blast) cannot touch a flyer', () => {
  st.enemies.length = 0;
  const shrike = makeTypedEnemy('SHRIKE', p.x + 40, p.y, st.time);
  const chaser = makeTypedEnemy('CHASER', p.x + 50, p.y + 10, st.time);
  const col = makeTypedEnemy('COLOSSUS', p.x + 45, p.y + 5, st.time);
  col.hp = 0;   // dies this frame -> the death shockwave fires through the real pass
  st.enemies.push(shrike, chaser, col);
  holdFire();
  const s0 = shrike.hp, c0 = chaser.hp;
  h.pump(2);
  if (shrike.hp !== s0) throw new Error('the shockwave hurt the flyer: ' + s0 + ' -> ' + shrike.hp);
  if (!(chaser.hp < c0)) throw new Error('the shockwave never fired (neighbour unhurt)');
});

s.check('R9b: DIRECT projectile fire DOES hurt the flyer', () => {
  st.enemies.length = 0;
  const shrike = makeTypedEnemy('SHRIKE', p.x + 120, p.y, st.time);
  st.enemies.push(shrike);
  const s0 = shrike.hp;
  h.pump(300);   // ~5s of the real weapon loop — the only target on the field
  if (!(shrike.hp < s0)) throw new Error('5s of direct volley fire never touched the flyer');
});

s.check('R9: altitude is age-pure — 60Hz and 120Hz draw the SAME z', () => {
  st.enemies.length = 0;
  const e = makeTypedEnemy('SHRIKE', p.x + 400, p.y, st.time);
  st.enemies.push(e);
  h.setFrameMs(1000 / 60);
  e.age = 0; h.pump(60);            // exactly 1.0s of flight at 60Hz
  const z60 = e.z;
  h.setFrameMs(1000 / 120);
  e.age = 0; h.pump(120);           // exactly 1.0s of flight at 120Hz
  const z120 = e.z;
  h.setFrameMs(1000 / 60);
  if (z60 !== z120) throw new Error('z diverges by frame rate: 60Hz ' + z60 + ' vs 120Hz ' + z120);
  if (!(z60 > 0)) throw new Error('the flyer never leaves the ground');
  const T = ENEMY_TYPES.SHRIKE;
  e.age = T.cruiseTime + T.diveTime / 2;   // mid-dive
  h.pump(1);
  if (!(e.z < z60)) throw new Error('the dive does not swoop low: ' + e.z + ' vs cruise ' + z60);
});

s.check('R9: the draw keeps a ground SHADOW and lifts the body by z', () => {
  st.enemies.length = 0;
  const e = makeTypedEnemy('SHRIKE', p.x + 100, p.y, st.time);
  e.age = 1.0;   // cruise hover
  st.enemies.push(e);
  h.rec.on = true; h.rec.rects.length = 0;
  h.pump(1);
  h.rec.on = false;
  const z = e.z;
  if (!(z > 0)) throw new Error('no altitude to draw');
  const sx = Math.round(e.x - st.cam.x), sy = Math.round(e.y - st.cam.y);
  const w = Math.round(e.w), hh = Math.round(Math.round(e.h) / 2);
  const shw = Math.max(2, Math.round(w * 0.7));
  const near = (v, want, tol) => Math.abs(v - want) <= tol;
  const shadow = h.rec.rects.some(r => r.h === 2 && near(r.x, sx - Math.round(shw / 2), 3) &&
    (near(r.y, sy + hh - 2, 3) || near(r.y, sy + hh - 4, 3)));
  if (!shadow) throw new Error('no ground shadow rect near (' + sx + ',' + sy + ')');
  const body = h.rec.rects.some(r => near(r.x + r.w / 2, sx, 14) && near(r.y + r.h / 2, sy - z, 16));
  if (!body) throw new Error('no lifted body rect at altitude z=' + z + ' near (' + sx + ',' + (sy - z) + ')');
});

s.done();
console.log('ALL E2 HORDE TESTS PASSED');
