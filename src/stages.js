// HORDES — stages (G20: PLAYER-SELECTED STAGES — slice 1 system + 3 stages,
// slice 2 the full 8-stage ladder; same contract throughout).
//
// WHY THIS FILE EXISTS
// The ladder (heat.js) owns opt-in difficulty that PAYS; challenges.js owns
// rule-changing MODES. A STAGE is the third, orthogonal axis: the PLACE the
// run happens — which foes the spawner draws from, how hard they hit, how the
// swarm arrives. Stages never pay a gold bonus or penalty (that is G17's
// economy call) and never change a rule the challenge system owns.
//
// THE CONTRACT (modelled EXACTLY on src/challenges.js)
//   * Pure and declarative: no DOM, no game state, so a headless test owns it.
//   * Nothing about a stage is persisted: no profile field, no schema bump, no
//     storage key. main.js holds the pending choice in a module-level let
//     (session-scoped) and stamps it onto run-scoped state at startRun().
//     A reload returns to VERDANT_HOLLOW by construction.
//   * `theme` is an INDEX into CONFIG.GROUND.THEMES (the existing ladder — no
//     new palettes are authored in this slice).
//   * `pool` is [typeId, weight] pairs over the REAL enemy-type ids. Stage 0's
//     pool is the SHIPPED chooser's table in the SHIPPED order (weights
//     C.SPAWNER.*_WEIGHT), so resolving it through the wave gates is
//     byte-identical to the pre-stage pickSpawnType — pinned by test.
//   * `mods` are stat multipliers applied at the ONE spawn seam in main.js;
//     every stage except the default declares at least two non-1.0 mods.
//   * `hazard` is ONE signature mechanic expressed through a system that
//     already exists (an elite-rate bump, a spawn-band squeeze). Wiring lives
//     in main.js; this file only describes it.
//   * `unlock` names an EXISTING achievement id (never invented here) checked
//     with achievements.isEarned at the selection surface. Stage 0 is ungated.

export const DEFAULT_STAGE_ID = 'VERDANT_HOLLOW';

export const STAGES = [
  {
    id: 'VERDANT_HOLLOW',
    name: 'VERDANT HOLLOW',
    blurb: 'the game as designed',
    theme: 0,
    // EXACTLY the shipped pickSpawnType table (weights are C.SPAWNER's
    // *_WEIGHT values, same order): CHASER always, SWARMER w1, BRUTE w2,
    // DASHER w2, SPITTER w3, WARLOCK w3, TICK w2, COLOSSUS w5.
    pool: [
      ['CHASER', 3], ['SWARMER', 2], ['BRUTE', 1.5], ['DASHER', 1.2],
      ['SPITTER', 1.5], ['WARLOCK', 1.2], ['TICK', 1.5], ['COLOSSUS', 0.35],
    ],
    mods: { hpMult: 1.0, dmgMult: 1.0 },
    hazard: null,
    // RELIEF (arena scale-up 2026-09-17): per-stage elevation character —
    // CELL is the terrain lattice grain in world px, LEVELS the height count
    // (0..LEVELS-1). Read by src/relief.js only, through stageRelief().
    // STARTING ARENA IMPROVE (2026-09-17): BASIN is the HOLLOW — an authored
    // radial flatten at the arena heart (relief.js envelope), so the map's
    // name is its shape: a calm clearing at the centre, terraces climbing
    // out toward the rim.
    // BLOCKING ELEVATION PROTOTYPE (2026-09-17, msg_01M2RK5B — the owner:
    // "let's prototype elevation... add it in and then work on getting it
    // right"): WALL is the authored RIM WALL — a ring at [r0, r1] raised to
    // topLevel, with four GATE terraces (gapLevel) at the cardinals, aligned
    // with the authored GATE landmark stones (render.js, at RIM-150). One
    // cliff rule in relief.js (a >=2-level step blocks, both sides slide);
    // the geometry is the stage's own, scoped HERE so the other seven stages
    // ship byte-identical terrain. Choke points live at the gates.
    relief: {
      CELL: 480, LEVELS: 3, BASIN: 560,   // the hollow: flat heart, rising rim
      WALL: {
        r0: 700, r1: 760,                 // the rim wall band (world px radius)
        gaps: [0, Math.PI / 2, Math.PI, -Math.PI / 2],   // N/E/S/W — the gates
        gapHalf: 0.10,                    // gate half-width (radians, ~146px arc)
        gapLevel: 1,                      // the gate terrace: one step up, one down
        topLevel: 2,                      // the rampart top (the stage's tallest)
      },
    },
    unlock: null,
  },
  {
    id: 'ASHEN_WASTE',
    name: 'ASHEN WASTE',
    blurb: 'charging hordes, hotter elites',
    theme: 1,
    // Charge-family pressure: dashers and brutes dominate, the ranged spitters
    // and warlocks never appear (their pool weight is simply absent).
    pool: [
      ['CHASER', 2], ['SWARMER', 1.5], ['BRUTE', 2.5], ['DASHER', 3],
      ['TICK', 1.2], ['COLOSSUS', 0.35],
    ],
    mods: { dmgMult: 1.2, speedMult: 1.1 },
    // EMBER_SURGE: the spawn-time elite chance is bumped by an additive 5
    // points (existing elite roll, existing surge ceiling at 1) — the arena
    // reads as more aggressive without new spawn code.
    hazard: { id: 'EMBER_SURGE', kind: 'eliteRate', add: 0.05 },
    relief: { CELL: 340, LEVELS: 4 },   // scorched mesas: sharp, tall blocks
    unlock: { achievementId: 'FIRST_BOSS', hint: 'beat your first boss' },
  },
  {
    id: 'SNOWFIELD',
    name: 'SNOWFIELD',
    blurb: 'fewer, tougher, ranged pressure',
    theme: 2,
    // Ranged pressure: spitters and warlocks dominate; the dasher charge
    // family never appears.
    pool: [
      ['CHASER', 2], ['SWARMER', 1.5], ['BRUTE', 1.5], ['SPITTER', 3],
      ['WARLOCK', 2.5], ['TICK', 1.2], ['COLOSSUS', 0.35],
    ],
    mods: { hpMult: 1.5, dmgMult: 1.0, spawnMult: 0.7, speedMult: 0.9 },
    // COLD_FRONT: the spawn ring tightens to 70% of its shipped radius (the
    // same SPAWN_DIST draw, one multiplier) — the swarm arrives closer.
    hazard: { id: 'COLD_FRONT', kind: 'spawnBand', ring: 0.7 },
    relief: { CELL: 520, LEVELS: 3 },   // long drifts: wide, even swells
    unlock: { achievementId: 'WAVE_5', hint: 'reach wave 5' },
  },
  {
    id: 'BLOOD_RUST',
    name: 'THE BLOOD RUST',
    blurb: 'few foes, most of them elite',
    theme: 3,
    // The elite arena: a SHORT type list (three ids) so the elite roll lands
    // often and on heavy bodies; five of stage 0's ids never appear.
    pool: [
      ['CHASER', 2], ['BRUTE', 2], ['COLOSSUS', 0.8],
    ],
    mods: { hpMult: 1.2, dmgMult: 1.15, speedMult: 1.05 },
    // CRIMSON COURT: the spawn-time elite chance gets a large additive bump
    // (0.15) — the arena's whole identity is elite pressure.
    hazard: { id: 'CRIMSON_COURT', kind: 'eliteRate', add: 0.15 },
    relief: { CELL: 300, LEVELS: 4 },   // broken badlands: the choppiest field
    unlock: { achievementId: 'BOSS_SLAYER_5', hint: 'slay 5 bosses' },
  },
  {
    id: 'BONE_DESERT',
    name: 'THE BONE DESERT',
    blurb: 'the swarm tide, in latches',
    theme: 4,
    // The swarm tide: SWARMER + TICK dominant, no COLOSSUS/BRUTE/WARLOCK —
    // bodies over quality, and the hazard makes each pop bigger still.
    pool: [
      ['CHASER', 1.5], ['SWARMER', 4], ['DASHER', 1], ['TICK', 3], ['SPITTER', 1],
    ],
    mods: { hpMult: 0.8, dmgMult: 0.9, spawnMult: 1.3, speedMult: 1.1 },
    // BRITTLE BLOOM: every pack pops round(pack x 1.5) bodies at the EXISTING
    // pack site — a swarmers-5 pop becomes 8, a tick-3 latch becomes 5.
    hazard: { id: 'BRITTLE_BLOOM', kind: 'packBurst', burst: 1.5 },
    relief: { CELL: 640, LEVELS: 2 },   // dunes: near-flat, one broad shelf
    unlock: { achievementId: 'WAVE_10', hint: 'reach wave 10' },
  },
  {
    id: 'VOID_REACH',
    name: 'THE VOID REACH',
    blurb: 'the ranged gauntlet',
    theme: 5,
    // The ranged gauntlet: SPITTER + WARLOCK dominant, the melee charge
    // family (BRUTE/DASHER) and TICK absent — you cross fire to reach anyone.
    pool: [
      ['CHASER', 1.5], ['SWARMER', 1], ['SPITTER', 3.5], ['WARLOCK', 3], ['COLOSSUS', 0.35],
    ],
    mods: { hpMult: 1.1, dmgMult: 1.3, speedMult: 0.95 },
    // EVENT HORIZON: the spawn ring tightens to 85% — projectiles start
    // closer, so the gauntlet has less warning time than SNOWFIELD's squeeze.
    hazard: { id: 'EVENT_HORIZON', kind: 'spawnBand', ring: 0.85 },
    relief: { CELL: 280, LEVELS: 4 },   // shattered plateaus: the tallest relief
    unlock: { achievementId: 'SURVIVE_10MIN', hint: 'survive 10 minutes' },
  },
  {
    id: 'CINDER_MAW',
    name: 'CINDER MAW',
    blurb: 'slow, tanky, relentless',
    theme: 1,
    // The long-haul arena: BRUTE + COLOSSUS dominant and SLOW (speedMult
    // 0.75) but near-immovable (hpMult 1.8); four of stage 0's ids absent.
    pool: [
      ['CHASER', 2], ['BRUTE', 3], ['WARLOCK', 1], ['COLOSSUS', 1],
    ],
    mods: { hpMult: 1.8, dmgMult: 1.1, spawnMult: 0.8, speedMult: 0.75 },
    // SLOW BURN: a small elite bump (0.03) — the tanky bodies are the threat,
    // elites just decorate it.
    hazard: { id: 'SLOW_BURN', kind: 'eliteRate', add: 0.03 },
    relief: { CELL: 420, LEVELS: 3 },   // volcanic ridges: long climbable spines
    unlock: { achievementId: 'KILLS_10000', hint: '10000 total kills' },
  },
  {
    id: 'WHITEOUT',
    name: 'WHITEOUT',
    blurb: 'everything, at once, harder',
    theme: 2,
    // The final gauntlet: the table re-weighted toward the heavies — and the
    // CHASER, the filler mob every other pool leans on, is gone: only real
    // threats spawn here.
    pool: [
      ['SWARMER', 1.5], ['BRUTE', 2.5], ['DASHER', 2.5],
      ['SPITTER', 2], ['WARLOCK', 2], ['TICK', 2], ['COLOSSUS', 0.7],
    ],
    mods: { hpMult: 1.4, dmgMult: 1.3, spawnMult: 1.15, speedMult: 1.05, packMult: 1.25 },
    // WHITE DEATH: a real elite bump (0.08) on the fullest pool — the
    // endgame stage's signature pressure.
    hazard: { id: 'WHITE_DEATH', kind: 'eliteRate', add: 0.08 },
    relief: { CELL: 500, LEVELS: 3 },   // white hills: heavy going, wide faces
    unlock: { achievementId: 'SURVIVE_20MIN', hint: 'survive 20 minutes' },
  },
];

export const STAGE_IDS = STAGES.map(s => s.id);
export const STAGE_BY_ID = STAGES.reduce((m, s) => { m[s.id] = s; return m; }, {});

// TOTAL over garbage: a missing/unknown id IS the default stage. A caller that
// somehow names a stage this build deleted degrades to the default, never
// throws — same contract as challengeOf.
export function stageOf(id) {
  return STAGE_BY_ID[id] || STAGE_BY_ID[DEFAULT_STAGE_ID];
}

export function isDefaultStage(id) {
  return stageOf(id).id === DEFAULT_STAGE_ID;
}

// The mods object to apply. The default stage (and any unknown id) applies
// all-1.0 mods — today's numbers. Callers get a FRESH object so they cannot
// mutate the catalog by editing the result.
export function stageMods(id) {
  return { ...stageOf(id).mods };
}

// The stage's RELIEF character (arena scale-up 2026-09-17): the terrain
// lattice grain + height count src/relief.js reads. FRESH object, and any
// stage without one (or an unknown id) gets the default rolling field —
// relief is a character dial, never a gate.
export const DEFAULT_RELIEF = { CELL: 480, LEVELS: 3 };
export function stageRelief(id) {
  return { ...(stageOf(id).relief || DEFAULT_RELIEF) };
}

// The cycle the title menu walks, wrapping — but LOCKED stages are skipped:
// `unlocked` is a predicate (id -> boolean) the caller supplies (main.js
// answers it with achievements.isEarned on the live profile). A stage row
// without a gate is always unlocked. If EVERY stage but the default were
// locked the cycle still wraps through the default.
export function nextStageId(id, unlocked) {
  const can = (sid) => {
    const s = STAGE_BY_ID[sid];
    return !s || !s.unlock || (typeof unlocked === 'function' && unlocked(sid));
  };
  const i = STAGE_IDS.indexOf(stageOf(id).id);
  for (let k = 1; k <= STAGE_IDS.length; k++) {
    const cand = STAGE_IDS[(i + k) % STAGE_IDS.length];
    if (can(cand)) return cand;
  }
  return DEFAULT_STAGE_ID;
}

export function prevStageId(id, unlocked) {
  const can = (sid) => {
    const s = STAGE_BY_ID[sid];
    return !s || !s.unlock || (typeof unlocked === 'function' && unlocked(sid));
  };
  const i = STAGE_IDS.indexOf(stageOf(id).id);
  for (let k = 1; k <= STAGE_IDS.length; k++) {
    const cand = STAGE_IDS[(i - k + STAGE_IDS.length * 2) % STAGE_IDS.length];
    if (can(cand)) return cand;
  }
  return DEFAULT_STAGE_ID;
}

// The one-line player-facing string for the live selection, and the plain-word
// requirement lines for stages still locked (the title card names WHAT unlocks
// them — the achievement's own condition, never an invented id).
export function describeStage(id) {
  const s = stageOf(id);
  return s.id === DEFAULT_STAGE_ID ? s.name : s.name + ' — ' + s.blurb;
}

// STARTING ARENA IMPROVE (2026-09-17): the STAGE card's measured table. Pure
// arithmetic over this catalog — the shares come from the pool weights, the
// multipliers from mods — so the card can never drift from the spawn table it
// describes. RANGED = shooters (SPITTER, WARLOCK); HEAVY = the wall family
// (BRUTE, COLOSSUS). Multipliers default to 1 where a stage doesn't declare
// one (the shipped experience).
export const RANGED_TYPES = ['SPITTER', 'WARLOCK'];
export const HEAVY_TYPES = ['BRUTE', 'COLOSSUS'];

export function stageFacts(id) {
  const s = stageOf(id);
  const total = s.pool.reduce((a, [, w]) => a + w, 0);
  const share = (types) => {
    let w = 0;
    for (const [t, wt] of s.pool) if (types.includes(t)) w += wt;
    return Math.round((100 * w) / total);
  };
  const m = s.mods;
  return {
    ranged: share(RANGED_TYPES),
    heavy: share(HEAVY_TYPES),
    hp: m.hpMult ?? 1,
    dmg: m.dmgMult ?? 1,
    spawn: m.spawnMult ?? 1,
    speed: m.speedMult ?? 1,
    hazard: s.hazard ? { ...s.hazard } : null,
    relief: { ...(s.relief || DEFAULT_RELIEF) },
  };
}

// The one-line facts string the STAGE card carries under the name. Hazard and
// relief get plain words (players never see ids here).
function hazardWord(h) {
  if (h.kind === 'eliteRate') return 'elite +' + Math.round(h.add * 100) + '%';
  if (h.kind === 'spawnBand') return 'spawn ring ' + Math.round(h.ring * 100) + '%';
  if (h.kind === 'packBurst') return 'packs x' + h.burst;
  return h.id.toLowerCase();
}
function reliefWord(id, rel) {
  const lv = rel.LEVELS + ' relief levels';
  return stageOf(id).relief && stageOf(id).relief.BASIN
    ? 'a hollow at the heart, ' + lv
    : lv;
}
export function stageFactsLine(id) {
  const f = stageFacts(id);
  const mult = (v) => 'x' + Math.round(v * 100) / 100;
  const parts = [
    'ranged ' + f.ranged + '%',
    'heavies ' + f.heavy + '%',
    'foe hp ' + mult(f.hp),
    'dmg ' + mult(f.dmg),
    'spawn ' + mult(f.spawn),
  ];
  if (f.hazard) parts.push(hazardWord(f.hazard));
  parts.push(reliefWord(id, f.relief));
  return parts.join(' · ');
}

export function lockedStageLines(unlocked) {
  const out = [];
  for (const s of STAGES) {
    if (!s.unlock) continue;
    if (typeof unlocked === 'function' && unlocked(s.id)) continue;
    out.push(s.name.toLowerCase() + ': ' + s.unlock.hint);
  }
  return out;
}
