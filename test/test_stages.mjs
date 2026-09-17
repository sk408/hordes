// HORDES — G20a: player-selected stages (slice 1: system + 3 stages).
//
// The contract under test: stages are a PURE declarative catalog (challenges.js
// contract), the spawn seam reads the LIVE stage with the SHIPPED wave gates,
// stage 0 is an EXACT parity with the shipped chooser, locked stages cannot be
// selected until their EXISTING achievement is earned, mods apply at the real
// spawn seam, and nothing about a stage is persisted. Checks (a)-(f) are the
// brief's acceptance bar, in order.
import { suite, boot } from './_harness.mjs';
import {
  STAGES, STAGE_IDS, STAGE_BY_ID, DEFAULT_STAGE_ID,
  stageOf, stageMods, isDefaultStage, nextStageId, prevStageId,
  describeStage, lockedStageLines,
} from '../src/stages.js';
import { ENEMY_TYPES, makeTypedEnemy } from '../src/enemy_types.js';
import { CHESTS, isEliteish } from '../src/chests.js';
import { ACHIEVEMENT_BY_ID, emptyAchievements } from '../src/achievements.js';
import { isEarned } from '../src/achievements.js';
import { contactHitDamage } from '../src/entities.js';
import { CONFIG as C } from '../src/config.js';

const s = suite('test_stages');

// ---------------------------------------------------------------------------
// 1. Catalog integrity (pure — no boot needed): brief check (b) + shape.
// ---------------------------------------------------------------------------
s.check('(b) every pool id is a legal ENEMY_TYPES id, weights positive+finite', () => {
  for (const st of STAGES) {
    if (!Array.isArray(st.pool) || st.pool.length < 1) throw new Error(st.id + ' pool missing');
    const seen = new Set();
    for (const [id, w] of st.pool) {
      if (!ENEMY_TYPES[id]) throw new Error(st.id + ' pool names unknown type ' + id);
      if (id === 'PILLAR') throw new Error(st.id + ' pool spawns PILLAR (scenery)');
      if (seen.has(id)) throw new Error(st.id + ' repeats ' + id);
      seen.add(id);
      if (typeof w !== 'number' || !Number.isFinite(w) || w <= 0) {
        throw new Error(st.id + ' weight for ' + id + ' is ' + w);
      }
    }
  }
});

s.check('(b) shape: theme indexes the real ladder, mods are the declared dials, hazards are known kinds', () => {
  const MOD_KEYS = ['hpMult', 'dmgMult', 'spawnMult', 'speedMult', 'packMult'];
  const HAZ_KINDS = ['eliteRate', 'spawnBand', 'packBurst'];
  for (const st of STAGES) {
    if (!Number.isInteger(st.theme) || st.theme < 0 || st.theme >= C.GROUND.THEMES.length) {
      throw new Error(st.id + ' theme index ' + st.theme + ' misses CONFIG.GROUND.THEMES');
    }
    const keys = Object.keys(st.mods).filter(k => MOD_KEYS.includes(k));
    if (keys.length < 2) throw new Error(st.id + ' declares ' + keys.length + ' mods (want >= 2)');
    for (const k of Object.keys(st.mods)) {
      const v = st.mods[k];
      if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) throw new Error(st.id + ' mod ' + k + ' = ' + v);
    }
    const nonUnity = keys.filter(k => st.mods[k] !== 1);
    if (st.id !== DEFAULT_STAGE_ID && nonUnity.length < 2) {
      throw new Error(st.id + ' is not the default but has ' + nonUnity.length + ' non-1.0 mods');
    }
    if (st.id === DEFAULT_STAGE_ID && nonUnity.length !== 0) {
      throw new Error('the default stage has non-1.0 mods: ' + JSON.stringify(st.mods));
    }
    if (st.hazard !== null) {
      if (!st.hazard.id || !HAZ_KINDS.includes(st.hazard.kind)) {
        throw new Error(st.id + ' hazard kind ' + st.hazard.kind + ' is not an existing system');
      }
      if (st.hazard.kind === 'eliteRate' && !(st.hazard.add > 0)) throw new Error(st.id + ' eliteRate add <= 0');
      if (st.hazard.kind === 'spawnBand' && !(st.hazard.ring > 0 && st.hazard.ring < 1)) {
        throw new Error(st.id + ' spawnBand ring ' + st.hazard.ring);
      }
      if (st.hazard.kind === 'packBurst' && !(st.hazard.burst > 1)) {
        throw new Error(st.id + ' packBurst burst ' + st.hazard.burst);
      }
    }
  }
});

s.check('(b) unlock ids are EXISTING achievement ids; the default is ungated', () => {
  for (const st of STAGES) {
    if (st.unlock === null) {
      if (st.id !== DEFAULT_STAGE_ID) throw new Error(st.id + ' is ungated but is not the default');
      continue;
    }
    if (!ACHIEVEMENT_BY_ID[st.unlock.achievementId]) {
      throw new Error(st.id + ' invents achievement id ' + st.unlock.achievementId);
    }
    if (!st.unlock.hint || typeof st.unlock.hint !== 'string') throw new Error(st.id + ' lacks a plain-word lock hint');
  }
});

s.check('(c) stageOf is TOTAL over garbage input (unknown -> default, never throws)', () => {
  // (No array case: STAGE_BY_ID[arr] coerces to its joined string, so
  // ['SNOWFIELD'] IS the string 'SNOWFIELD' as a key — the same JS quirk
  // test_challenges documents, not an unknown id.)
  for (const junk of [undefined, null, '', 'NOPE', 7, {}, 'SNOWFIELD ']) {
    let got;
    try { got = stageOf(junk); } catch (e) { throw new Error('threw on ' + JSON.stringify(junk)); }
    if (got.id !== DEFAULT_STAGE_ID) throw new Error('garbage ' + JSON.stringify(junk) + ' resolved to ' + got.id);
    if (!isDefaultStage(junk)) throw new Error('isDefaultStage false-degrades on ' + JSON.stringify(junk));
  }
  if (!isDefaultStage(DEFAULT_STAGE_ID)) throw new Error('isDefaultStage false for the default itself');
  if (stageOf('ASHEN_WASTE').id !== 'ASHEN_WASTE') throw new Error('known id did not resolve');
});

s.check('stageMods returns a fresh all-1.0 copy for the default and cannot mutate the catalog', () => {
  const m = stageMods(DEFAULT_STAGE_ID);
  for (const k of Object.keys(m)) if (m[k] !== 1) throw new Error('default mod ' + k + ' = ' + m[k]);
  m.hpMult = 99;
  if (STAGE_BY_ID[DEFAULT_STAGE_ID].mods.hpMult !== 1) throw new Error('catalog mutated through the return');
  if (stageMods('GARBAGE').hpMult !== 1) throw new Error('garbage mods not 1.0');
});

// ---------------------------------------------------------------------------
// 1b. G20b: the 8-stage ladder — count, pairwise distinctness, the gate
//     ladder. Pure data, no boot needed.
// ---------------------------------------------------------------------------
s.check('G20b: the catalog is the full 8-stage ladder, unique ids, default first', () => {
  if (STAGE_IDS.length !== 8) throw new Error('expected 8 stages, got ' + STAGE_IDS.length);
  if (STAGE_IDS[0] !== DEFAULT_STAGE_ID) throw new Error('the default is not first');
  if (new Set(STAGE_IDS).size !== 8) throw new Error('duplicate stage ids');
});

s.check('G20b: pairwise DISTINCT pools — no two stages carry the same id set', () => {
  const sets = STAGES.map(st => st.pool.map(p => p[0]).sort().join(','));
  for (let i = 0; i < sets.length; i++) {
    for (let j = i + 1; j < sets.length; j++) {
      if (sets[i] === sets[j]) {
        throw new Error(STAGE_IDS[i] + ' and ' + STAGE_IDS[j] + ' carry the same pool id set: ' + sets[i]);
      }
    }
  }
  // Same set is not enough to be a reskin even with different sets — the
  // WEIGHTS must also differ for any two stages that share ids.
  for (let i = 0; i < STAGES.length; i++) {
    for (let j = i + 1; j < STAGES.length; j++) {
      const a = Object.fromEntries(STAGES[i].pool), b = Object.fromEntries(STAGES[j].pool);
      const shared = Object.keys(a).filter(k => k in b);
      if (shared.length && shared.every(k => a[k] === b[k])) {
        throw new Error(STAGE_IDS[i] + ' and ' + STAGE_IDS[j] + ' share ids with identical weights on all of them');
      }
    }
  }
});

s.check('G20b: >= 3 of the 5 new pools DROP >= 2 enemy ids stage 0 carries (anti-reskin)', () => {
  const stage0 = new Set(STAGE_BY_ID[DEFAULT_STAGE_ID].pool.map(p => p[0]));
  const dropped = (st) => [...stage0].filter(id => !st.pool.some(p => p[0] === id));
  const droppers = STAGES.filter(st => st.id !== DEFAULT_STAGE_ID && dropped(st).length >= 2);
  if (droppers.length < 3) throw new Error('only ' + droppers.length + ' stages drop >= 2 shipped ids');
  for (const st of droppers) {
    for (const id of dropped(st)) {
      if (!ENEMY_TYPES[id]) throw new Error(st.id + ' dropped-list names a non-type ' + id);
    }
  }
});

s.check('G20b: themes — the three previously-unused indices are used; no theme appears more than twice', () => {
  // 8 stages over 6 authored themes: full pairwise distinctness is
  // IMPOSSIBLE (8 > 6), so the bound the brief's "where possible" sets is:
  // indices 3, 4, 5 are in use AND every theme is shared by at most 2 stages.
  const used = STAGES.map(st => st.theme);
  for (const t of [3, 4, 5]) {
    if (!used.includes(t)) throw new Error('authored theme ' + t + ' is unused by the 8-stage ladder');
  }
  const counts = {};
  for (const t of used) counts[t] = (counts[t] || 0) + 1;
  for (const [t, n] of Object.entries(counts)) {
    if (n > 2) throw new Error('theme ' + t + ' is used by ' + n + ' stages (max 2)');
  }
  if (STAGE_BY_ID[DEFAULT_STAGE_ID].theme !== 0) throw new Error('the default stage left theme 0');
});

s.check('G20b: pairwise DISTINCT mods vectors — no two stages share a mod vector', () => {
  const vecs = STAGES.map(st => {
    const v = {};
    for (const k of ['hpMult', 'dmgMult', 'spawnMult', 'speedMult', 'packMult']) v[k] = st.mods[k] || 1;
    return JSON.stringify(v);
  });
  for (let i = 0; i < vecs.length; i++) {
    for (let j = i + 1; j < vecs.length; j++) {
      if (vecs[i] === vecs[j]) {
        throw new Error(STAGE_IDS[i] + ' and ' + STAGE_IDS[j] + ' share the mods vector ' + vecs[i]);
      }
    }
  }
});

s.check('G20b: pairwise DISTINCT hazards (kind + params) — and every non-default stage carries one', () => {
  const seen = new Map();   // kind+params key -> stage id
  for (const st of STAGES) {
    if (st.id !== DEFAULT_STAGE_ID && st.hazard === null) {
      throw new Error(st.id + ' ships no hazard (only the default may)');
    }
    if (!st.hazard) continue;
    const key = st.hazard.kind + ':' + JSON.stringify(
      st.hazard.kind === 'eliteRate' ? st.hazard.add :
      st.hazard.kind === 'spawnBand' ? st.hazard.ring : st.hazard.burst);
    if (seen.has(key)) {
      throw new Error(st.id + ' and ' + seen.get(key) + ' share the hazard ' + key);
    }
    seen.set(key, st.id);
  }
  if (STAGE_BY_ID[DEFAULT_STAGE_ID].hazard !== null) throw new Error('the default stage grew a hazard');
});

s.check('G20b: the gate ladder — five new gates, distinct, excluding the two already used', () => {
  const gates = STAGES.filter(st => st.unlock).map(st => st.unlock.achievementId);
  const firstBoss = gates.shift();   // ASHEN_WASTE's FIRST_BOSS
  const wave5 = gates.shift();       // SNOWFIELD's WAVE_5
  if (firstBoss !== 'FIRST_BOSS' || wave5 !== 'WAVE_5') {
    throw new Error('slice-1 gate order moved: ' + firstBoss + ',' + wave5);
  }
  if (gates.length !== 5) throw new Error('expected 5 new gates, got ' + gates.length);
  if (new Set(gates).size !== 5) throw new Error('the five new gates are not mutually distinct: ' + gates);
  if (gates.includes('FIRST_BOSS') || gates.includes('WAVE_5')) {
    throw new Error('a new stage reuses a slice-1 gate');
  }
  for (const g of gates) {
    if (!ACHIEVEMENT_BY_ID[g]) throw new Error('gate ' + g + ' is not in the achievement catalog');
  }
  // The ladder ASCENDS: BOSS_SLAYER_5 -> WAVE_10 -> SURVIVE_10MIN ->
  // KILLS_10000 -> SURVIVE_20MIN (each rung a strictly deeper career bar).
  const want = ['BOSS_SLAYER_5', 'WAVE_10', 'SURVIVE_10MIN', 'KILLS_10000', 'SURVIVE_20MIN'];
  if (JSON.stringify(gates) !== JSON.stringify(want)) {
    throw new Error('gate ladder is ' + gates.join(',') + ' (want the ascending ' + want.join(',') + ')');
  }
});

// ---------------------------------------------------------------------------
// 2. (a) STAGE 0 PARITY: the resolved weight vector equals the LITERAL shipped
//    table at waves 1 and 15, and the live chooser draws identically to a copy
//    of the pre-stage algorithm under identical random draws.
// ---------------------------------------------------------------------------
function shippedEntries(wave) {
  // The pre-stage pickSpawnType (main.js before G20a), restated HERE as the
  // literal table the parity claim is made against: literal weights, literal
  // gate waves, literal order.
  const S = { CHASER: 3, SWARMER: 2, BRUTE: 1.5, DASHER: 1.2, SPITTER: 1.5,
              WARLOCK: 1.2, TICK: 1.5, COLOSSUS: 0.35 };
  const gates = { SWARMER: 1, BRUTE: 2, DASHER: 2, SPITTER: 3, WARLOCK: 3, TICK: 2, COLOSSUS: 5 };
  const entries = [['CHASER', S.CHASER]];
  for (const [id, w] of [['SWARMER', S.SWARMER], ['BRUTE', S.BRUTE], ['DASHER', S.DASHER],
                         ['SPITTER', S.SPITTER], ['WARLOCK', S.WARLOCK], ['TICK', S.TICK],
                         ['COLOSSUS', S.COLOSSUS]]) {
    if (wave >= gates[id]) entries.push([id, w]);
  }
  return entries;
}

s.check('(a) the stage-0 pool IS the shipped weight table (values + order), and C.SPAWNER agrees', () => {
  const pool = STAGE_BY_ID[DEFAULT_STAGE_ID].pool;
  const full = shippedEntries(15);
  if (JSON.stringify(pool) !== JSON.stringify(full)) {
    throw new Error('stage-0 pool is not the shipped table: ' + JSON.stringify(pool) + ' vs ' + JSON.stringify(full));
  }
  // The literals above must equal the LIVE shipped constants (if this fails,
  // the shipped table moved and this test must be re-pinned — never edit the
  // constant to make it pass).
  const S = C.SPAWNER;
  const pairs = { CHASER: S.CHASER_WEIGHT, SWARMER: S.SWARMER_WEIGHT, BRUTE: S.BRUTE_WEIGHT,
                  DASHER: S.DASHER_WEIGHT, SPITTER: S.SPITTER_WEIGHT, WARLOCK: S.WARLOCK_WEIGHT,
                  TICK: S.TICK_WEIGHT, COLOSSUS: S.COLOSSUS_WEIGHT };
  for (const [id, w] of pool) {
    if (pairs[id] !== w) throw new Error('pool weight ' + id + '=' + w + ' != C.SPAWNER ' + pairs[id]);
  }
  if (S.SWARMER_WAVE !== 1 || S.BRUTE_WAVE !== 2 || S.DASHER_WAVE !== 2 || S.SPITTER_WAVE !== 3 ||
      S.WARLOCK_WAVE !== 3 || S.TICK_WAVE !== 2 || S.COLOSSUS_WAVE !== 5) {
    throw new Error('the shipped gate waves moved: ' + JSON.stringify(S));
  }
});

const h = await boot();
const T = h.T, st = T.state;
const profile = T.getProfile();

s.check('(a) live chooser parity at waves 1 and 15: resolved vectors + identical draws under identical randoms', () => {
  st.stage = DEFAULT_STAGE_ID;
  const oldAlgorithm = (wave, rnd) => {         // the shipped chooser, verbatim
    const entries = shippedEntries(wave);
    let r = rnd() * entries.reduce((sum, e) => sum + e[1], 0);
    for (const [id, w] of entries) { if ((r -= w) < 0) return id; }
    return 'CHASER';
  };
  for (const wave of [1, 15]) {
    for (let seed = 1; seed <= 400; seed++) {
      // Same LCG for both algorithms, advanced in lockstep.
      let x = seed * 2654435761 % 4294967296;
      const rndA = () => { x = (x * 1664525 + 1013904223) % 4294967296; return x / 4294967296; };
      let y = seed * 2654435761 % 4294967296;
      const rndB = () => { y = (y * 1664525 + 1013904223) % 4294967296; return y / 4294967296; };
      const realMR = Math.random;
      Math.random = rndA;
      const live = T.stages.pickSpawnType(wave);
      Math.random = realMR;
      const shipped = oldAlgorithm(wave, rndB);
      if (live !== shipped) {
        throw new Error('wave ' + wave + ' seed ' + seed + ': live ' + live + ' != shipped ' + shipped);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// 3. (e) Wave gates hold for a STAGE pool + mods land at the REAL seam.
// ---------------------------------------------------------------------------
s.check('(e) wave gates hold for stage pools: wave 1 never surfaces a gated type on any stage', () => {
  const realMR = Math.random;
  const sweep = () => {
    let i = 0;
    Math.random = () => (i++ % 2000) / 2000;                // sweeps [0, 1) evenly
    const seen = new Set();
    for (let k = 0; k < 2000; k++) seen.add(T.stages.pickSpawnType(1));
    let colossi = 0;
    i = 0;
    for (let k = 0; k < 2000; k++) if (T.stages.pickSpawnType(15) === 'COLOSSUS') colossi++;
    Math.random = realMR;
    return { seen, colossi };
  };
  for (const sid of STAGE_IDS) {
    st.stage = sid;
    const { seen, colossi } = sweep();
    const wave1 = new Set(shippedEntries(1).map(e => e[0]));   // {CHASER, SWARMER}
    for (const id of seen) {
      if (!wave1.has(id)) throw new Error(sid + ' surfaced ' + id + ' at wave 1 (gate violated)');
    }
    if (sid === DEFAULT_STAGE_ID && colossi < 10) throw new Error('stage 0 lost its COLOSSUS draws (' + colossi + ')');
  }
  st.stage = DEFAULT_STAGE_ID;
});

// Window-not-history: foes DIE during the window (the pilot shoots back), so
// sample every frame and keep every foe ever seen, not the live array.
function collectSpawned(stageId, frames) {
  st.mode = 'menu';
  h.elements['ov-cards'].innerHTML = '';
  T.stages.select(stageId);
  T.startRun();
  const seen = new Set();
  const byType = {};
  h.pump(frames, () => {
    for (const e of st.enemies) {
      if (seen.has(e)) continue;
      seen.add(e);
      (byType[e.typeId] = byType[e.typeId] || []).push(e);
    }
  });
  return byType;
}
// Plain (non-elite, common-tier) full spawn hp: current hp decays as the run
// shoots foes, so read maxHp — the stage stamp sets it alongside hp. Rarity
// and elite stamps RAISE hp, so the minimum per type is the plain value.
const minHp = (arr) => Math.min(...arr.map(e => e.maxHp));

s.check('(e) mods at the REAL seam: SNOWFIELD foes are exactly 1.5x hp / 0.9x speed, stage 0 exactly 1.0x', () => {
  // SUITE-FLAKES (power, not tolerance): this clause used to sample SURVIVORS
  // of live 900-frame runs (~9-12 bodies a window), which put the strict
  // clauses inside the game's own run-to-run variance — the pilot measured the
  // mods clause and the spawn clause CO-FAILING ~17-20% standalone (aggregate
  // ratios 0.917-0.971, or no CHASERs at all in a window). The deterministic
  // route the seam ships for exactly this: drive the exported spawnWave
  // (T.stages.spawnWave, src/main.js:5826) at IDENTICAL state / dt / time with
  // seeded draws and measure the EMISSION, never the survivors. Every original
  // operator survives below — exact 1.5x hp, exact 0.9x speed, the NaN guards,
  // stage-0 parity, the STRICT `<` on bodies, the <0.9 aggregate bound — now
  // deterministic by construction, plus the exact first-tick spawnTimer
  // interval ratio (0.7, NO tolerance: the same formula at the same time
  // divides by spawnMult, so base/snow === 0.7 exactly in IEEE).
  const realMR = Math.random;
  // Fixed-clock emission: identical state (time pinned), identical dt, seeded
  // draws — the count and every foe stat are functions of the inputs alone.
  const emit = (stageId, dt, seconds, seed) => {
    st.stage = stageId;
    st.enemies.length = 0;
    st.spawnTimer = 0.001;                                 // interior start, no boundary tie
    st.time = 10;                                          // spawner wave 0: CHASERs, the type every pool carries
    let x = seed;
    Math.random = () => { x = (x * 1664525 + 1013904223) % 4294967296; return x / 4294967296; };
    const steps = Math.round(seconds / dt);
    for (let i = 1; i <= steps; i++) T.stages.spawnWave(dt);
    Math.random = realMR;
    const byType = {};
    for (const e of st.enemies) (byType[e.typeId] = byType[e.typeId] || []).push(e);
    st.enemies.length = 0;
    return byType;
  };
  // THE EXACT FIRST-TICK INTERVAL RATIO (no tolerance): run the clock down
  // once per stage at the same pinned time and read the interval spawnWave
  // computed. spawnMult 0.7 divides it, so base/snow is exactly 0.7.
  const firstTickInterval = (stageId) => {
    st.stage = stageId;
    st.time = 10;
    st.spawnTimer = 0;
    Math.random = () => 0.5;                               // pinned: the emission rolls, not the interval
    try { T.stages.spawnWave(1 / 60); } finally { Math.random = realMR; }
    const iv = st.spawnTimer;
    st.enemies.length = 0;
    return iv;
  };
  const ivBase = firstTickInterval(DEFAULT_STAGE_ID);
  const ivSnow = firstTickInterval('SNOWFIELD');
  if (!(ivSnow > ivBase)) {
    throw new Error('SNOWFIELD first-tick interval ' + ivSnow + ' not slower than base ' + ivBase);
  }
  if (ivBase / ivSnow !== 0.7) {
    throw new Error('first-tick interval ratio base/snow ' + (ivBase / ivSnow) + ' (want EXACTLY 0.7)');
  }
  // The mods, measured on emitted foes at 60Hz AND 120Hz (dt is an input, not
  // an assumption).
  for (const [dt, hz] of [[1 / 60, '60Hz'], [1 / 120, '120Hz']]) {
    const base = emit(DEFAULT_STAGE_ID, dt, 10, 1234567);
    const snow = emit('SNOWFIELD', dt, 10, 1234567);
    if (snow.CHASER && base.CHASER) {
      if (Math.abs(minHp(snow.CHASER) / minHp(base.CHASER) - 1.5) > 1e-9) {
        throw new Error(hz + ' CHASER hp ratio ' + minHp(snow.CHASER) / minHp(base.CHASER));
      }
      // NaN guard FIRST: a NaN ratio silently passes every |NaN - x| > tol
      // comparison, so finiteness is asserted explicitly on both stages' foes.
      for (const [name, by] of [['base', base], ['snow', snow]]) {
        for (const e of Object.values(by).flat()) {
          if (!Number.isFinite(e.hp) || !Number.isFinite(e.maxHp) || !Number.isFinite(e.speed)) {
            throw new Error(name + ' (' + hz + ') produced a non-finite foe stat: ' + JSON.stringify(
              { typeId: e.typeId, hp: e.hp, maxHp: e.maxHp, speed: e.speed }));
          }
        }
      }
      const sp = snow.CHASER[0].speed / base.CHASER[0].speed;
      if (!Number.isFinite(sp) || Math.abs(sp - 0.9) > 1e-9) throw new Error(hz + ' CHASER speed ratio ' + sp);
    } else {
      throw new Error(hz + ': no CHASERs to compare: base ' + !!base.CHASER + ' snow ' + !!snow.CHASER);
    }
  }
  // 1.0x on stage 0: two default emissions under the same seed produce the
  // SAME plain hp (mods are a no-op, not a perturbation).
  const base = emit(DEFAULT_STAGE_ID, 1 / 60, 10, 1234567);
  const base2 = emit(DEFAULT_STAGE_ID, 1 / 60, 10, 1234567);
  if (minHp(base2.CHASER) !== minHp(base.CHASER)) {
    throw new Error('two stage-0 emissions disagree on plain hp');
  }
  // spawnMult 0.7: fewer EMITTED bodies over the same sim time (never more).
  // Same property, same STRICT `<`, same K=4 aggregation and the same <0.9
  // aggregate bound as before — but the cohorts are now deterministic
  // emissions (measured 6 vs 8 per 10s, ratio 0.750), so no tolerance band is
  // introduced and no run-to-run variance can tie or invert the comparison.
  const count = (by) => Object.values(by).reduce((n, a) => n + a.length, 0);
  const K = 4;
  let snowTotal = 0, baseTotal = 0;
  for (let k = 0; k < K; k++) {
    snowTotal += count(emit('SNOWFIELD', 1 / 60, 10, 1234567));
    baseTotal += count(emit(DEFAULT_STAGE_ID, 1 / 60, 10, 1234567));
  }
  if (!(snowTotal < baseTotal)) {
    throw new Error('SNOWFIELD emitted ' + snowTotal + ' vs base ' + baseTotal +
      ' over ' + K + ' cohorts (spawnMult 0.7 must be fewer)');
  }
  const ratio = snowTotal / baseTotal;
  if (!(ratio < 0.9)) {
    throw new Error('SNOWFIELD aggregate emission ratio ' + ratio.toFixed(3) + ' over ' + K +
      ' cohorts (measured ~0.75; a spawnMult 1.0 regression reads ~1.0)');
  }
  console.log('    [measure] first-tick interval base ' + ivBase + ' / snow ' + ivSnow +
    ' = ' + (ivBase / ivSnow) + ' (EXACT 0.7) | emission 10s cohorts: snow ' +
    (snowTotal / K) + ' vs base ' + (baseTotal / K) + ' avg, ratio ' + ratio.toFixed(3));
});

s.check('(e) dmgMult rides the threat curve: the same ladder number, scaled by the stage', () => {
  // The seam multiplies ladderDmg * heat * stage dmgMult, and contact damage
  // applies that product SUB-LINEARLY (C.SURVIVAL.CONTACT_POW, the measured
  // anti-one-shot curve) — so the honest assertion is the ratio through the
  // curve, computed with the same pure function the game uses.
  const plant = (stageId) => {
    st.mode = 'menu';
    h.elements['ov-cards'].innerHTML = '';
    T.stages.select(stageId);
    T.startRun();
    h.pump(2);
    const p = st.player;
    p.invuln = 0;
    p.hp = p.stats.maxHp;
    const before = p.hp;
    st.enemies.length = 0;
    st.enemies.push({ typeId: 'CHASER', x: p.x, y: p.y, w: 10, hp: 10, speed: 30,
                      mx: 0, my: 0, age: 0, elite: false });
    h.pump(3);
    return before - p.hp;
  };
  const d0 = plant(DEFAULT_STAGE_ID);
  const dAsh = plant('ASHEN_WASTE');
  // Expected: wave 0 + heat 0 -> ladder factor 1 on stage 0, 1 * 1.2 on ASHEN.
  const expect0 = contactHitDamage(C.SURVIVAL.BASE_CONTACT, 1, 1, 1, st.player.stats.maxHp);
  const expectAsh = contactHitDamage(C.SURVIVAL.BASE_CONTACT, 1.2, 1, 1, st.player.stats.maxHp);
  if (Math.abs(d0 - expect0) > 1e-9) throw new Error('stage-0 hit ' + d0 + ' != curve ' + expect0);
  if (Math.abs(dAsh - expectAsh) > 1e-9) {
    throw new Error('ASHEN hit ' + dAsh + ' != curve ' + expectAsh);
  }
  if (Math.abs(dAsh / d0 - expectAsh / expect0) > 1e-9) {
    throw new Error('ratio drifted: ' + dAsh / d0 + ' vs ' + expectAsh / expect0);
  }
});

// ---------------------------------------------------------------------------
// 4. (d) Locking: the cycler skips locked stages until the EXISTING
//    achievement is earned (isEarned on a real profile).
// ---------------------------------------------------------------------------
s.check('(d) a LOCKED stage is unreachable by the cycler on a fresh profile, reachable once earned', () => {
  const ns = (earned) => ({ achievements: { ...emptyAchievements(), earned } });
  const fresh = ns({});
  if (isEarned(fresh, 'FIRST_BOSS')) throw new Error('fresh profile claims FIRST_BOSS');
  // Fresh: both gated stages locked — the ring collapses to the default.
  const unlockedFresh = (sid) => {
    const u = STAGE_BY_ID[sid].unlock;
    return !u || isEarned(fresh, u.achievementId);
  };
  let id = DEFAULT_STAGE_ID;
  const walked = [];
  for (let i = 0; i < 5; i++) { id = nextStageId(id, unlockedFresh); walked.push(id); }
  if (walked.some(x => x !== DEFAULT_STAGE_ID)) throw new Error('fresh walk left the default: ' + walked);
  // FIRST_BOSS earned: ASHEN enters the ring, SNOWFIELD still locked.
  const boss = ns({ FIRST_BOSS: 1 });
  const unlockedBoss = (sid) => {
    const u = STAGE_BY_ID[sid].unlock;
    return !u || isEarned(boss, u.achievementId);
  };
  const ring = [DEFAULT_STAGE_ID];
  let cur = DEFAULT_STAGE_ID;
  for (let i = 0; i < 3; i++) { cur = nextStageId(cur, unlockedBoss); ring.push(cur); }
  if (ring.join(',') !== [DEFAULT_STAGE_ID, 'ASHEN_WASTE', DEFAULT_STAGE_ID, 'ASHEN_WASTE'].join(',')) {
    throw new Error('boss ring: ' + ring);
  }
  // WAVE_5 too: the full three-stage ring.
  const both = ns({ FIRST_BOSS: 1, WAVE_5: 1 });
  const unlockedAll = (sid) => {
    const u = STAGE_BY_ID[sid].unlock;
    return !u || isEarned(both, u.achievementId);
  };
  const full = [];
  cur = DEFAULT_STAGE_ID;
  for (let i = 0; i < 3; i++) { cur = nextStageId(cur, unlockedAll); full.push(cur); }
  if (full.join(',') !== 'ASHEN_WASTE,SNOWFIELD,VERDANT_HOLLOW') throw new Error('full ring: ' + full);
  // Backwards ring mirrors.
  let back = DEFAULT_STAGE_ID;
  const rev = [];
  for (let i = 0; i < 3; i++) { back = prevStageId(back, unlockedAll); rev.push(back); }
  if (rev.join(',') !== 'SNOWFIELD,ASHEN_WASTE,VERDANT_HOLLOW') throw new Error('rev ring: ' + rev);
  // Locked-stage lines are plain words naming the requirement. With ONLY
  // FIRST_BOSS earned, SNOWFIELD + the five G20b rungs stay locked (6 lines;
  // slice 1's "1 line" was the 3-stage ladder).
  const lines = lockedStageLines(unlockedBoss);
  if (lines.length !== 6 || !/snowfield/i.test(lines[0]) || !/wave 5/i.test(lines[0])) {
    throw new Error('locked lines: ' + JSON.stringify(lines));
  }
});

s.check('(d) the LIVE selector skips locked stages on the real profile and cycles once earned', () => {
  // The harness profile is fresh-ish: force the earned map to empty for the
  // fresh half, then grant through the real namespace the game reads.
  const earned = profile.achievements.earned;
  const saved = { ...earned };
  for (const k of Object.keys(earned)) delete earned[k];
  if (T.stages.unlocked('ASHEN_WASTE')) throw new Error('ASHEN unlocked on a fresh profile');
  T.stages.select('VERDANT_HOLLOW');
  if (T.stages.cycle() !== 'VERDANT_HOLLOW') throw new Error('the cycler left the default on a fresh profile');
  if (!/locked: .*ashen waste/i.test(T.stages.cardSub())) throw new Error('the card hides the lock: ' + T.stages.cardSub());
  // Earn FIRST_BOSS on the real profile: ASHEN enters, SNOWFIELD stays out.
  earned.FIRST_BOSS = 1;
  if (!T.stages.unlocked('ASHEN_WASTE')) throw new Error('FIRST_BOSS did not unlock ASHEN');
  if (T.stages.unlocked('SNOWFIELD')) throw new Error('SNOWFIELD unlocked without WAVE_5');
  const walk = [T.stages.pending];
  walk.push(T.stages.cycle()); walk.push(T.stages.cycle());
  if (walk.join(',') !== 'VERDANT_HOLLOW,ASHEN_WASTE,VERDANT_HOLLOW') throw new Error('live walk: ' + walk);
  earned.WAVE_5 = 1;
  const full = [T.stages.cycle(), T.stages.cycle(), T.stages.cycle()];
  if (full.join(',') !== 'ASHEN_WASTE,SNOWFIELD,VERDANT_HOLLOW') throw new Error('live full ring: ' + full);
  // Restore: the test must not leave achievements behind on the shared profile.
  for (const k of Object.keys(earned)) delete earned[k];
  for (const [k, v] of Object.entries(saved)) earned[k] = v;
});

// ---------------------------------------------------------------------------
// 5. Run lifecycle: the stamp, the reset, the title card, the end label, and
//    the nothing-persisted contract.
// ---------------------------------------------------------------------------
const cardsNow = () => [...h.elements['ov-cards'].children].map(c => c.innerHTML || '');

s.check('the title menu carries a STAGE card naming the live stage; a press cycles', () => {
  st.mode = 'menu';
  h.elements['ov-cards'].innerHTML = '';
  T.stages.select(DEFAULT_STAGE_ID);
  h.key('keydown', { key: 'Escape', preventDefault() {} });
  // U1: the STAGE card lives behind the SETUP door now, so walk to it.
  const door = [...h.elements['ov-cards'].children].find(c => (c.innerHTML || '').includes('>SETUP<'));
  if (!door) throw new Error('no SETUP door on the title (U1)');
  door.click();
  const card = cardsNow().find(t => t.includes('>STAGE<'));
  if (!card) throw new Error('no STAGE card: ' + JSON.stringify(cardsNow().map(c => c.slice(0, 30))));
  if (!card.includes('VERDANT HOLLOW')) throw new Error('the card does not name the stage: ' + card);
  const el = [...h.elements['ov-cards'].children].find(c => (c.innerHTML || '').includes('>STAGE<'));
  el.click();
  // Fresh harness profile may hold tour flags but no trophies: on a fully
  // locked profile the press re-lands on the default (still a named card).
  if (T.stages.pending !== DEFAULT_STAGE_ID && !T.stages.unlocked(T.stages.pending)) {
    throw new Error('press selected a locked stage');
  }
  const card2 = cardsNow().find(t => t.includes('>STAGE<'));
  if (!card2 || !T.stages.unlocked(T.stages.pending) || !card2.includes(describeStage(T.stages.pending).split(' — ')[0])) {
    throw new Error('the card did not re-render the new selection: ' + card2);
  }
});

s.check('startRun stamps the stage; a new run never inherits the last run\'s stage', () => {
  st.mode = 'menu';
  h.elements['ov-cards'].innerHTML = '';
  T.stages.select('ASHEN_WASTE');
  T.startRun();
  h.pump(2);
  if (st.stage !== 'ASHEN_WASTE') throw new Error('stamp is ' + st.stage);
  T.stages.select('SNOWFIELD');
  T.startRun();
  h.pump(2);
  if (st.stage !== 'SNOWFIELD') throw new Error('second stamp is ' + st.stage);
  T.stages.select(DEFAULT_STAGE_ID);
  T.startRun();
  h.pump(2);
  if (st.stage !== DEFAULT_STAGE_ID) throw new Error('default stamp is ' + st.stage);
});

s.check('the run-end summary names a non-default stage; the default renders byte-identically', () => {
  st.stage = 'SNOWFIELD';
  const withStage = T.endScreenBody({ lead: 'RUN OVER', gold: 25 });
  if (!withStage.includes('SNOWFIELD')) throw new Error('the end screen omits the stage: ' + withStage);
  st.stage = DEFAULT_STAGE_ID;
  const dflt = T.endScreenBody({ lead: 'RUN OVER', gold: 25 });
  if (/STAGE|HOLLOW|WASTE|SNOWFIELD/.test(dflt)) throw new Error('default end screen mentions a stage: ' + dflt);
  if (!dflt.startsWith('RUN OVER')) throw new Error('default lead not first: ' + dflt);
});

s.check('a stage run persists NOTHING (no storage key, no profile field, deep scan)', () => {
  st.mode = 'menu';
  h.elements['ov-cards'].innerHTML = '';
  const before = JSON.parse(JSON.stringify(profile));
  const keysBefore = [...h.storage.keys()].sort();
  T.stages.select('SNOWFIELD');
  T.startRun();
  h.pump(120);                                            // ~2s of real stage run
  const after = JSON.parse(JSON.stringify(profile));
  const changed = Object.keys(after).filter(k => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  for (const k of changed) {
    if (k !== 'encounters') throw new Error('the stage run mutated profile.' + k);  // bestiary log = standard surface
  }
  for (const k of Object.keys(after)) {
    if (!Object.prototype.hasOwnProperty.call(before, k)) throw new Error('new profile key: ' + k);
  }
  if (/stage|VERDANT|ASHEN|SNOWFIELD|hazard/i.test(JSON.stringify(after))) {
    throw new Error('stage data leaked into the profile');
  }
  const keysAfter = [...h.storage.keys()].sort();
  if (JSON.stringify(keysAfter) !== JSON.stringify(keysBefore)) {
    throw new Error('storage keys changed: ' + JSON.stringify(keysAfter));
  }
});

// ---------------------------------------------------------------------------
// 6. (f) 60Hz == 120Hz: the stage's dt-driven pieces (the spawn clock under
//    spawnMult, the timer decrement) advance identically per sim-second.
// ---------------------------------------------------------------------------
s.check('(f) 60Hz and 120Hz spawn identically over equal sim time (seeded draws, every stage)', () => {
  st.mode = 'menu';
  h.elements['ov-cards'].innerHTML = '';
  T.stages.select('SNOWFIELD');
  T.startRun();
  h.pump(2);
  st.enemies.length = 0;
  const realMR = Math.random;
  const run = (dt, seconds) => {
    st.enemies.length = 0;
    st.spawnTimer = 0.001;                                 // interior start, no boundary tie
    st.time = 10;                                          // fixed clock: only dt-driven code differs
    let seed = 1234567;
    Math.random = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    const steps = Math.round(seconds / dt);
    for (let i = 1; i <= steps; i++) T.stages.spawnWave(dt);
    Math.random = realMR;
    const byType = {};
    for (const e of st.enemies) byType[e.typeId] = (byType[e.typeId] || 0) + 1;
    return { count: st.enemies.length, byType };
  };
  // DISCLOSED: the timer's residual PHASE drifts between rates (each rate
  // notices a zero crossing on its own grid and the lag compounds across
  // resets) — that quantization is the shipped spawner's own, present on
  // stage 0 identically, and not a stage effect. The parity claim is the
  // OUTCOME: identical draws under an identical seed produce the same spawn
  // counts (total and per type) within one grid-quantized tick.
  for (const sid of STAGE_IDS) {
    st.stage = sid;
    const at60 = run(1 / 60, 10);
    const at120 = run(1 / 120, 10);
    if (at60.count === 0) throw new Error(sid + ' spawned nothing in 10s at 60Hz');
    if (Math.abs(at60.count - at120.count) > 1) {
      throw new Error(sid + ' spawn counts diverged: 60Hz ' + at60.count + ' vs 120Hz ' + at120.count);
    }
    const types = new Set([...Object.keys(at60.byType), ...Object.keys(at120.byType)]);
    for (const t of types) {
      if (Math.abs((at60.byType[t] || 0) - (at120.byType[t] || 0)) > 1) {
        throw new Error(sid + ' ' + t + ' counts: 60Hz ' + (at60.byType[t] || 0) + ' vs 120Hz ' + (at120.byType[t] || 0));
      }
    }
  }
  st.stage = DEFAULT_STAGE_ID;
});

// ---------------------------------------------------------------------------
// 7. G20b bar 3: every hazard MEASURED through the REAL spawn path (seeded
//    Math.random, fixed state.time, the real pickSpawnType + spawnWave), not
//    asserted. A hazard with no measured delta fails.
// ---------------------------------------------------------------------------
const seeded = (seed) => {
  const real = Math.random;
  let x = seed;
  Math.random = () => { x = (x * 1664525 + 1013904223) % 4294967296; return x / 4294967296; };
  return () => { Math.random = real; };
};

// Drive the real spawner `calls` times on `stageId` at a fixed clock, with a
// fixed seed, and hand back the foes it produced (unmoved: no frame pump, so
// distances are the SPAWN distances).
function seedSpawn(stageId, calls, time, seed) {
  st.mode = 'playing';
  st.stage = stageId;
  st.time = time;
  st.enemies.length = 0;
  const restore = seeded(seed);
  try {
    for (let i = 0; i < calls; i++) { st.spawnTimer = 0; T.stages.spawnWave(1 / 60); }
  } finally { restore(); }
  const foes = st.enemies.slice();
  st.enemies.length = 0;
  return foes;
}

s.check('G20b bar3: eliteRate hazards are MEASURED — elite fraction delta vs the default stage', () => {
  // At time 100s every non-COLOSSUS spawn rolls the elite chance; the seeded
  // LCG makes the fractions deterministic, so the deltas are real numbers.
  const calls = 400;
  const frac = (stageId) => {
    const foes = seedSpawn(stageId, calls, 100, 20260913);
    const eligible = foes.filter(e => e.typeId !== 'COLOSSUS');
    if (eligible.length < 100) throw new Error(stageId + ' produced only ' + eligible.length + ' eligible foes');
    return { n: eligible.length, elites: eligible.filter(e => e.elite).length / eligible.length };
  };
  const d = frac(DEFAULT_STAGE_ID);
  const st4 = frac('BLOOD_RUST');       // eliteRate add 0.15
  const st7 = frac('CINDER_MAW');       // eliteRate add 0.03
  const st8 = frac('WHITEOUT');         // eliteRate add 0.08
  const delta4 = st4.elites - d.elites, delta7 = st7.elites - d.elites, delta8 = st8.elites - d.elites;
  // Deterministic numbers, printed as evidence; bounds are generous vs the
  // seeded sample noise but each must show its OWN add, in order.
  if (!(delta4 > 0.10 && delta4 < 0.20)) throw new Error('BLOOD_RUST elite delta ' + delta4.toFixed(4) + ' (add 0.15)');
  if (!(delta8 > 0.03 && delta8 < 0.13)) throw new Error('WHITEOUT elite delta ' + delta8.toFixed(4) + ' (add 0.08)');
  if (!(delta7 > 0.0 && delta7 < 0.08)) throw new Error('CINDER_MAW elite delta ' + delta7.toFixed(4) + ' (add 0.03)');
  if (!(delta4 > delta8 && delta8 > delta7)) {
    throw new Error('elite deltas do not order with their adds: ' +
      delta4.toFixed(4) + ' > ' + delta8.toFixed(4) + ' > ' + delta7.toFixed(4));
  }
  console.log('    [measure] elite fraction @100s: default ' + d.elites.toFixed(4) +
    ' +0.15 -> ' + st4.elites.toFixed(4) + ' (delta ' + delta4.toFixed(4) + ')' +
    ' | +0.08 -> ' + st8.elites.toFixed(4) + ' (delta ' + delta8.toFixed(4) + ')' +
    ' | +0.03 -> ' + st7.elites.toFixed(4) + ' (delta ' + delta7.toFixed(4) + ')' +
    ' [n=' + d.n + '/' + st4.n + '/' + st8.n + '/' + st7.n + ']');
});

s.check('G20b bar3: spawnBand hazards are MEASURED — mean spawn distance vs the default stage', () => {
  // Enemies are not pumped (no movement), so hypot to the player IS the
  // spawn-ring distance; the ring factor shifts the whole distribution.
  const p = st.player;
  const meanD = (stageId) => {
    const foes = seedSpawn(stageId, 300, 100, 777);
    if (foes.length < 100) throw new Error(stageId + ' produced only ' + foes.length + ' foes');
    let sum = 0;
    for (const e of foes) sum += Math.hypot(e.x - p.x, e.y - p.y);
    return { n: foes.length, mean: sum / foes.length };
  };
  const d0 = meanD(DEFAULT_STAGE_ID);
  const snow = meanD('SNOWFIELD');      // ring 0.7
  const voidR = meanD('VOID_REACH');    // ring 0.85
  const rSnow = snow.mean / d0.mean, rVoid = voidR.mean / d0.mean;
  if (Math.abs(rSnow - 0.7) > 0.03) throw new Error('SNOWFIELD distance ratio ' + rSnow.toFixed(4) + ' (ring 0.7)');
  if (Math.abs(rVoid - 0.85) > 0.03) throw new Error('VOID_REACH distance ratio ' + rVoid.toFixed(4) + ' (ring 0.85)');
  console.log('    [measure] mean spawn distance @100s: default ' + d0.mean.toFixed(2) +
    'px | SNOWFIELD ' + snow.mean.toFixed(2) + 'px (ratio ' + rSnow.toFixed(4) + ')' +
    ' | VOID_REACH ' + voidR.mean.toFixed(2) + 'px (ratio ' + rVoid.toFixed(4) + ')' +
    ' [n=' + d0.n + '/' + snow.n + '/' + voidR.n + ']');
});

s.check('G20b bar3: packBurst is MEASURED — the pop size at the real pack site', () => {
  // All-zero draws pin pickSpawnType to CHASER (r=0 lands the first band) at
  // t=10s (below ELITE_TIME, so the elite roll short-circuits without eating
  // a draw): the pop count per call is then EXACTLY groups x pack(CHASER).
  const calls = 40;
  const count = (stageId) => seedSpawn(stageId, calls, 10, 42).length;
  const d0 = count(DEFAULT_STAGE_ID);       // pack(CHASER) = 1
  const bone = count('BONE_DESERT');        // round(1 x 1 x burst 1.5) = 2
  if (d0 === 0) throw new Error('the default spawner produced nothing');
  if (bone !== 2 * d0) {
    throw new Error('BONE_DESERT pop ' + bone + ' vs default ' + d0 + ' over ' + calls + ' calls (want exactly 2x)');
  }
  console.log('    [measure] CHASER pop over ' + calls + ' scripted spawn calls (all-zero draws, t=10s): default ' +
    d0 + ' foes -> BONE_DESERT ' + bone + ' foes (packBurst 1.5: round(1x1.5)=2 per pop)');
});

s.check('G20b bar3: the packMult MOD is MEASURED at the real pack site (WHITEOUT)', () => {
  // Literal all-zero draws at t=100 (wave 3): pickSpawnType returns each
  // pool's first WAVE-ELIGIBLE entry — the default pops CHASER (pack 1) and
  // WHITEOUT pops SWARMER (packSize 5 -> round(5 x 1.25) = 6). Same fixed
  // time -> same groups. (At t=10 / wave 0 every gated id is closed and
  // WHITEOUT falls back to CHASER like any pool — the fallback contract.)
  const zeroSpawn = (stageId, calls, time) => {
    const real = Math.random;
    Math.random = () => 0;
    try {
      st.mode = 'playing';
      st.stage = stageId;
      st.time = time;
      st.enemies.length = 0;
      for (let i = 0; i < calls; i++) { st.spawnTimer = 0; T.stages.spawnWave(1 / 60); }
      const n = st.enemies.length;
      st.enemies.length = 0;
      return n;
    } finally { Math.random = real; }
  };
  const calls = 40;
  const d0 = zeroSpawn(DEFAULT_STAGE_ID, calls, 100);   // groups x 1
  const white = zeroSpawn('WHITEOUT', calls, 100);      // groups x 6
  if (d0 === 0 || d0 % calls !== 0) throw new Error('baseline groups not integral: ' + d0);
  if (white !== 6 * d0) {
    throw new Error('WHITEOUT pop ' + white + ' vs baseline groups ' + d0 + ' (want exactly 6x: round(5 x 1.25))');
  }
  console.log('    [measure] WHITEOUT SWARMER pop over ' + calls + ' scripted calls (all-zero draws, t=100s): ' +
    d0 + ' baseline groups -> ' + white + ' foes (packMult 1.25: round(5x1.25)=6 per pop)');
});

s.check('G20b: the 8-row ladder is PINNED (id, theme, gate) — a reskin swap fails here', () => {
  const want = [
    ['VERDANT_HOLLOW', 0, null],
    ['ASHEN_WASTE',    1, 'FIRST_BOSS'],
    ['SNOWFIELD',      2, 'WAVE_5'],
    ['BLOOD_RUST',     3, 'BOSS_SLAYER_5'],
    ['BONE_DESERT',    4, 'WAVE_10'],
    ['VOID_REACH',     5, 'SURVIVE_10MIN'],
    ['CINDER_MAW',     1, 'KILLS_10000'],
    ['WHITEOUT',       2, 'SURVIVE_20MIN'],
  ];
  for (let i = 0; i < want.length; i++) {
    const st = STAGES[i];
    if (st.id !== want[i][0]) throw new Error('row ' + i + ' is ' + st.id + ' (want ' + want[i][0] + ')');
    if (st.theme !== want[i][1]) throw new Error(st.id + ' theme ' + st.theme + ' (want ' + want[i][1] + ')');
    const gate = st.unlock ? st.unlock.achievementId : null;
    if (gate !== want[i][2]) throw new Error(st.id + ' gate ' + gate + ' (want ' + want[i][2] + ')');
  }
});

s.check('G20b: lockedStageLines enumerates the 7 gated rungs for a fresh player', () => {
  const lines = lockedStageLines(() => false);
  if (lines.length !== 7) throw new Error('fresh player sees ' + lines.length + ' locked lines (want 7)');
  // Every rung names its stage and a plain-word condition, never an id dump.
  for (const line of lines) {
    if (!/: /.test(line)) throw new Error('line lacks a condition: ' + line);
  }
  if (!/ashen waste: beat your first boss/.test(lines[0])) throw new Error('rung 1 changed: ' + lines[0]);
  if (!/whiteout: survive 20 minutes/.test(lines[6])) throw new Error('rung 7 changed: ' + lines[6]);
  // With everything earned the list is empty.
  if (lockedStageLines(() => true).length !== 0) throw new Error('an all-earned profile still lists locks');
});

// ---------------------------------------------------------------------------
// 4. G20C: the stage stamp is UNIVERSAL (measured defect: 4 bypass sites).
// ---------------------------------------------------------------------------
s.check('G20C: the stamp is universal — EVERY CHASER a SNOWFIELD cohort ever saw is preStageMaxHp x 1.5 (whole histogram, not the min)', () => {
  const snow = collectSpawned('SNOWFIELD', 900);
  const ch = snow.CHASER || [];
  if (ch.length === 0) throw new Error('no SNOWFIELD CHASERs in the window');
  const hist = {};
  for (const e of ch) {
    if (!Number.isFinite(e.preStageMaxHp)) {
      throw new Error('CHASER joined the field without the stamp (no preStageMaxHp), maxHp ' + e.maxHp);
    }
    if (Math.abs(e.maxHp - e.preStageMaxHp * 1.5) > 1e-9) {
      // the min-only ratio assertion let a 12hp unstamped straggler hide in a
      // field of 18s (the measured {12:6, 18:9} gamble-horde fingerprint).
      throw new Error('unstamped CHASER: maxHp ' + e.maxHp + ' vs preStage ' + e.preStageMaxHp +
        ' (hist so far ' + JSON.stringify(hist) + ')');
    }
    hist[e.maxHp] = (hist[e.maxHp] || 0) + 1;
  }
  // Stage 0 parity: the stamp is a no-op there — preStage === maxHp EXACTLY.
  const base = collectSpawned(DEFAULT_STAGE_ID, 900);
  for (const e of Object.values(base).flat()) {
    if (e.preStageMaxHp !== e.maxHp) {
      throw new Error('default stage perturbed hp: preStage ' + e.preStageMaxHp + ' vs maxHp ' + e.maxHp);
    }
  }
});

s.check('G20C: chests are an ELITE reward — a default 900-frame cohort opens 0; SNOWFIELD plain foes are NOT chest-eligible', () => {
  const base = collectSpawned(DEFAULT_STAGE_ID, 900);
  if (st.runCounts.chests !== 0) {
    throw new Error('default cohort opened ' + st.runCounts.chests + ' chests in 15s — the elite gate leaked');
  }
  const snow = collectSpawned('SNOWFIELD', 900);
  const bar = C.ENEMY.BASE_HP * CHESTS.ELITE_HP_MULT;
  for (const e of snow.CHASER || []) {
    // plain = not flagged elite AND below the bar BEFORE the stage stamp. The
    // measured leak: SNOWFIELD hpMult 1.5 made every plain CHASER read 18 hp
    // and 22/25 cohorts opened chests.
    if (!e.elite && e.preStageMaxHp < bar && isEliteish(e)) {
      throw new Error('plain SNOWFIELD CHASER (preStage ' + e.preStageMaxHp + ') reads elite-ish');
    }
  }
  // Unit pins on the eligibility predicate itself.
  if (isEliteish({ maxHp: bar }) !== true) throw new Error('fallback read broke: a bar-hp foe must stay eligible');
  if (isEliteish({ maxHp: bar, preStageMaxHp: 12 }) !== false) {
    throw new Error('the measured defect: a plain 12hp foe stamped to ' + bar + ' reads elite-ish');
  }
  if (isEliteish({ elite: true, maxHp: 1 }) !== true) throw new Error('the elite flag is no longer sufficient on its own');
  if (isEliteish(null) !== false) throw new Error('null foe must not be elite-ish');
});

s.check('G20C: boss summon/ring foes carry the stage mult (CHOIR_MOTHER swarmers + HERALD pillars at 1.5x)', () => {
  st.mode = 'menu';
  h.elements['ov-cards'].innerHTML = '';
  T.stages.select('SNOWFIELD');
  T.startRun();
  const p = st.player;
  // --- act.summon: CHOIR_MOTHER pops a SWARMER burst when age wraps
  // SUMMON_INTERVAL; seeding age just under the wrap fires it next frame.
  const before = new Set(st.enemies);
  const choir = makeTypedEnemy('BRUTE', p.x + 200, p.y, st.time, { elite: true });
  choir.boss = true;
  choir.bossId = 'CHOIR_MOTHER';
  choir.age = C.ESCALATION.BOSS.SUMMON_INTERVAL - 0.005;
  st.enemies.push(choir);
  h.pump(2);
  const added = st.enemies.filter(e => !before.has(e) && e !== choir);
  const swarm = added.filter(e => e.typeId === 'SWARMER');
  if (swarm.length < C.ESCALATION.BOSS.SUMMON_COUNT) {
    throw new Error('the summon burst did not fire: ' + swarm.length + ' new SWARMERs');
  }
  for (const e of added) {
    if (!Number.isFinite(e.preStageMaxHp)) throw new Error(e.typeId + ' joined without the stamp (no preStageMaxHp)');
    if (Math.abs(e.maxHp - e.preStageMaxHp * 1.5) > 1e-9) {
      throw new Error(e.typeId + ' unstamped: maxHp ' + e.maxHp + ' vs preStage ' + e.preStageMaxHp);
    }
  }
  // --- act.ring: HERALD plants PILLARs around the player when age wraps
  // RING_INTERVAL (PILLAR is NEVER in the ambient spawner mix, so every pillar
  // on the field came through the boss seam).
  const herald = makeTypedEnemy('CHASER', p.x - 200, p.y, st.time);
  herald.boss = true;
  herald.bossId = 'HERALD';
  herald.age = C.ESCALATION.MIDBOSS.RING_INTERVAL - 0.005;
  st.enemies.push(herald);
  h.pump(2);
  const pillars = st.enemies.filter(e => e.typeId === 'PILLAR');
  if (pillars.length < C.ESCALATION.MIDBOSS.PILLARS) {
    throw new Error('the ring did not fire: ' + pillars.length + ' PILLARs');
  }
  for (const e of pillars) {
    if (!Number.isFinite(e.preStageMaxHp)) throw new Error('PILLAR joined without the stamp (no preStageMaxHp)');
    if (Math.abs(e.maxHp - e.preStageMaxHp * 1.5) > 1e-9) {
      throw new Error('PILLAR unstamped: maxHp ' + e.maxHp + ' vs preStage ' + e.preStageMaxHp);
    }
  }
});

// ---------------------------------------------------------------------------
// 7. STARTING ARENA IMPROVE (2026-09-17): the measured card + the hollow's
//    relief character + the authored landmarks. The card's numbers are PURE
//    arithmetic over this same catalog (stageFacts), so they can never drift
//    from the spawn table they describe; the BASIN is the hollow's shape; the
//    stump + gates make the 1800x1800 field navigable.
// ---------------------------------------------------------------------------
import { stageFacts, stageFactsLine, stageRelief } from '../src/stages.js';
import { reliefHeight, reliefLevel } from '../src/relief.js';
import { Renderer } from '../src/render.js';

s.check('stageFacts: the measured table is the catalog\'s own arithmetic (every stage)', () => {
  for (const stage of STAGES) {
    const f = stageFacts(stage.id);
    const total = stage.pool.reduce((a, [, w]) => a + w, 0);
    const shareOf = (ids) => {
      let w = 0;
      for (const [t, wt] of stage.pool) if (ids.includes(t)) w += wt;
      return Math.round((100 * w) / total);
    };
    if (f.ranged !== shareOf(['SPITTER', 'WARLOCK'])) throw new Error(stage.id + ' ranged share');
    if (f.heavy !== shareOf(['BRUTE', 'COLOSSUS'])) throw new Error(stage.id + ' heavy share');
    if (f.hp !== (stage.mods.hpMult ?? 1) || f.dmg !== (stage.mods.dmgMult ?? 1) ||
        f.spawn !== (stage.mods.spawnMult ?? 1) || f.speed !== (stage.mods.speedMult ?? 1)) {
      throw new Error(stage.id + ' mods not mirrored (undeclared mods must read 1)');
    }
    if (JSON.stringify(f.hazard) !== JSON.stringify(stage.hazard ? { ...stage.hazard } : null)) {
      throw new Error(stage.id + ' hazard not mirrored');
    }
    // FRESH objects: editing a fact must never corrupt the catalog.
    f.relief.CELL = 1;
    if (stageRelief(stage.id).CELL === 1) throw new Error(stage.id + ' facts leak the catalog relief');
  }
  // The starting arena's own numbers, named: the table a first-timer reads.
  const v = stageFacts('VERDANT_HOLLOW');
  if (v.ranged !== 22 || v.heavy !== 15) throw new Error('verdant shares: ' + JSON.stringify(v));
  if (v.hp !== 1 || v.dmg !== 1 || v.spawn !== 1) throw new Error('verdant mults must be the shipped 1s');
  if (v.hazard !== null) throw new Error('the starting arena carries no hazard');
  if (v.relief.CELL !== 480 || v.relief.LEVELS !== 3 || v.relief.BASIN !== 560) {
    throw new Error('verdant relief character: ' + JSON.stringify(v.relief));
  }
});

s.check('stageFactsLine: plain words, hazard words, the hollow named', () => {
  const v = stageFactsLine('VERDANT_HOLLOW');
  for (const tok of ['ranged 22%', 'heavies 15%', 'foe hp x1', 'dmg x1', 'spawn x1',
                     'a hollow at the heart', '3 relief levels']) {
    if (!v.includes(tok)) throw new Error('the verdant line lacks "' + tok + '": ' + v);
  }
  if (stageFacts('ASHEN_WASTE').ranged !== 0 || !stageFactsLine('ASHEN_WASTE').includes('ranged 0%')) {
    throw new Error('ashen ranged share wrong: ' + stageFactsLine('ASHEN_WASTE'));
  }
  if (!stageFactsLine('ASHEN_WASTE').includes('elite +5%')) {
    throw new Error('the EMBER_SURGE word: ' + stageFactsLine('ASHEN_WASTE'));
  }
  if (!stageFactsLine('SNOWFIELD').includes('spawn ring 70%')) {
    throw new Error('the COLD_FRONT word: ' + stageFactsLine('SNOWFIELD'));
  }
  if (!stageFactsLine('BONE_DESERT').includes('packs x1.5')) {
    throw new Error('the BRITTLE_BLOOM word: ' + stageFactsLine('BONE_DESERT'));
  }
  if (stageFactsLine('CINDER_MAW').includes('hollow')) throw new Error('only the hollow says hollow');
});

s.check('the STAGE card carries the measured line (the live surface)', () => {
  st.mode = 'menu';
  h.elements['ov-cards'].innerHTML = '';
  T.stages.select(DEFAULT_STAGE_ID);
  h.key('keydown', { key: 'Escape', preventDefault() {} });
  const door = [...h.elements['ov-cards'].children].find(c => (c.innerHTML || '').includes('>SETUP<'));
  if (!door) throw new Error('no SETUP door');
  door.click();
  const card = cardsNow().find(t => t.includes('>STAGE<'));
  if (!card) throw new Error('no STAGE card');
  const want = stageFactsLine(DEFAULT_STAGE_ID);
  if (!card.includes(want)) throw new Error('the card does not carry the facts line "' + want + '": ' + card);
  if (!card.includes('ranged 22%') || !card.includes('foe hp x1')) {
    throw new Error('the numbers are not on the card: ' + card);
  }
  // The name still leads the card (setupCard's split(' · ')[0] reads it).
  if (!/class="desc">VERDANT HOLLOW/.test(card)) throw new Error('the name no longer leads: ' + card);
});

s.check('the BASIN is the hollow: a flat heart, an untouched rim, every level still exists', () => {
  const seed = 4242;
  const plain = { CELL: 480, LEVELS: 3 };
  const basin = { CELL: 480, LEVELS: 3, BASIN: 560 };
  // The heart is LEVEL 0 everywhere inside the inner third (a real clearing).
  for (let a = 0; a < 16; a++) {
    const x = Math.cos((a / 16) * Math.PI * 2) * 190, y = Math.sin((a / 16) * Math.PI * 2) * 190;
    if (reliefLevel(x, y, seed, basin) !== 0) {
      throw new Error('the heart is not flat at (' + x + ',' + y + ')');
    }
  }
  // The pinch only ever LOWERS ground, and past the BASIN radius the field is
  // byte-identical to the un-authored model (the other stages' experience).
  for (let y = -900; y <= 900; y += 37) {
    for (let x = -900; x <= 900; x += 53) {
      const hPlain = reliefHeight(x, y, seed, plain);
      const hBasin = reliefHeight(x, y, seed, basin);
      if (hBasin > hPlain + 1e-12) throw new Error('the basin RAISED ground at ' + x + ',' + y);
      if (Math.hypot(x, y) >= 560 && hBasin !== hPlain) {
        throw new Error('past the BASIN the field changed at ' + x + ',' + y);
      }
    }
  }
  // The quantized ladder is intact: levels 0..2 all exist on the authored field.
  const seen = new Set();
  for (let y = -880; y <= 880; y += 24) {
    for (let x = -880; x <= 880; x += 24) seen.add(reliefLevel(x, y, seed, basin));
  }
  if (seen.size !== 3 || ![...seen].every(l => l >= 0 && l <= 2)) {
    throw new Error('the hollow lost a relief level: ' + [...seen].join(','));
  }
  // The stage's catalog relief still carries BASIN, and stageRelief hands a
  // fresh copy (the seam the run reads).
  if (stageRelief('VERDANT_HOLLOW').BASIN !== 560) throw new Error('catalog BASIN gone');
});

s.check('the authored landmarks: stump at the heart, gates at the cardinals, groves in between', () => {
  const noop = () => {};
  const ctx = new Proxy({}, {
    get: (t, k) => (k === 'fillStyle' || k === 'globalAlpha') ? undefined : noop,
    set: () => true,
  });
  const canvas = { width: 0, height: 0, getContext: () => ctx,
    getBoundingClientRect: () => ({ width: 0, height: 0 }) };
  const R = new Renderer(canvas);
  // The whole arena, swept: the authored kinds are all there.
  const kinds = new Set();
  for (let cy = -900; cy <= 900 - 300; cy += 300) {
    for (let cx = -900; cx <= 900 - 480; cx += 480) {
      R.drawLandmarks(ctx, 4242, { x: cx, y: cy }, undefined, 'VERDANT_HOLLOW');
      for (const l of R.landmarks) kinds.add(l.kind);
    }
  }
  for (const k of ['STUMP', 'GATE', 'GROVE']) {
    if (!kinds.has(k)) throw new Error('the hollow lacks ' + k + ' (' + [...kinds].join(',') + ')');
  }
  // The authored set, exactly: the stump at the heart, four gates on the
  // cardinals just inside the rim.
  R.drawLandmarks(ctx, 4242, { x: 0, y: 0 }, undefined, 'VERDANT_HOLLOW');
  const stump = R.landmarks.filter(l => l.kind === 'STUMP');
  if (stump.length !== 1 || stump[0].x !== 0 || stump[0].y !== 0) {
    throw new Error('the stump is not alone at the heart: ' + JSON.stringify(stump));
  }
  if (stump[0].rects < 10) throw new Error('the stump is not composed (' + stump[0].rects + ' rects)');
  R.drawLandmarks(ctx, 4242, { x: 0, y: -(C.GROUND.RIM - 150) }, undefined, 'VERDANT_HOLLOW');
  const gate = R.landmarks.find(l => l.kind === 'GATE');
  if (!gate) throw new Error('no gate at the north cardinal');
  if (gate.rects < 8) throw new Error('the gate is not composed');
  // STAGE-GATED: without the stage param the authored set does not exist —
  // the other seven arenas render byte-identically to before.
  R.drawLandmarks(ctx, 4242, { x: 0, y: 0 }, undefined, undefined);
  if (R.landmarks.some(l => l.kind === 'STUMP' || l.kind === 'GATE' || l.kind === 'GROVE')) {
    throw new Error('the authored set leaked into a non-hollow draw');
  }
});

s.done();
