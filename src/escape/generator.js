// HORDES — V1 escape corridor GENERATOR. This is what replaces level design:
// a handful of segment templates (each carrying a DIFFICULTY TIER and its own
// authored SPEED WINDOW) assembled in a RAMP — never shuffled — into a
// ~2-minute corridor ending at the exit portal.
//
// THE GENERATOR INVARIANT (acceptance #1, deterministic): every jump trigger
// is authored so the jump arc at the speed-window FLOOR clears the gap and at
// the CEILING lands INSIDE the landing platform. checkCorridor() asserts it
// across every trigger of a generated corridor — a fail here is a template
// bug, never an AI problem (the docs' whole point).
//
// GEOMETRY CONVENTIONS (all integer pixels, virtual 480x300 viewport):
//   platform  { x, y, w }        — a walkable ledge top at height y
//   gap       { x, w }           — the hole between two platforms
//   trigger   { x0, x1, vMin, vMax, seg } — an AUTO-ONLY jump band; the jump
//                                          fires at x0 (band entry) with the
//                                          speed clamped into the window, so
//                                          the arc start x is KNOWN and the
//                                          invariant is exact.
//
// SEGMENT ABLUTMENT + THE PROLOGUE: segments butt at their x0/x1 seams, and a
// segment's EXIT can be ELEVATED (a terrace landing or pair island sits ~24-34
// above the floor). The next segment therefore starts with a PROLOGUE: a flat
// approach at FLOOR_Y spanning past x0 far enough that any elevated arrival
// walks off the seam, drops (<= 34px lands within ~52px of ground travel), and
// is RUNNING ON THE GROUND well before the fire line at x0 + PRO. The band is
// entered grounded, so the invariant's known-arc-start holds for every legal
// arrival class.
import { PHYS, BAND, PACING, THREATS } from './config.js';

// mulberry32 — the codebase's standard seeded rng (weather.js shape), local
// so the escape stays self-contained.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The jump arc: fixed impulse (PHYS.JUMP_VY), fixed gravity. Airtime and
// horizontal reach are pure functions of speed — this is what the templates
// author against and what checkCorridor() re-derives (the test's own copy).
export const AIRTIME = (2 * PHYS.JUMP_VY) / PHYS.GRAVITY;           // 0.8s
export const reach = (v) => v * AIRTIME;                             // px

// The prologue: distance from segment x0 to the fire line (see header). 64px
// covers the worst elevated drop (34px falls land within ~52px) with ground
// time to spare before the band.
const PRO = 64;
// How far BEFORE the gap edge the fire line sits. The clamp lands at band
// entry (a single brace, never a ramp), the jump fires the same frame, so the
// arc spans [fire, fire + reach(v)] and starts after the prologue's approach.
const PRE = 26;
// The band is a BAND, not a point (a slowed or knocked-back runner cannot
// slide past the firing line) — but the FIRE line is x0, so x1 is slack.
const BAND_W = 64;
// Invariant margins: clearance at the floor must beat the gap by >= 8px; the
// ceiling landing must be >= 8px inside the platform's far edge.
const MARGIN = 8;

// ---- template tables ---------------------------------------------------------
// Speed windows are authored per template (vMin <= vMax, both inside the
// silliness cap of the nominal 200px/s run — see auto.js for the clamp).
const SPEED = {
  easy: [170, 230],
  std: [180, 220],
  hard: [190, 212],
};

// GAP widths per tier (px). Authored against reach(vMin) - PRE - MARGIN.
// The +34 UP variant uses the std width: an elevated landing shortens the
// real arc margin, so it gets the comfortable gap, not the razor one.
const GAP_W = [56, 76, 96, 104];

// Every gap/terrace/pair segment opens with the same authored approach: flat
// at FLOOR_Y from before the seam to 2px shy of the gap edge, so the prologue
// guarantees a grounded band entry for every arrival class.
function approachPlat(x0, rng) {
  const back = 46 + Math.floor(rng() * 40);
  const w = back + PRO + PRE - 2;
  return { x: x0 + PRO + PRE - 2 - w, y: BAND.FLOOR_Y, w, approach: true };
}

function gapSegment(x0, tier, { up = 0, down = 0, rng }) {
  const w = up ? GAP_W[1] + Math.floor(rng() * 9) - 4 : GAP_W[tier] + Math.floor(rng() * 9) - 4;
  const [vMin, vMax] = tier >= 2 ? SPEED.hard : tier === 1 ? SPEED.std : SPEED.easy;
  const fire = x0 + PRO;
  // The landing platform must catch reach(vMax) and be walk-on-able.
  const landW = Math.ceil(reach(vMax) - PRE - w) + 46 + Math.floor(rng() * 40);
  const yL = BAND.FLOOR_Y - up + down;    // land-from-above is sufficient: ledges only
  return {
    kind: 'gap', tier, x0, x1: fire + PRE + w + landW,
    plats: [
      approachPlat(x0, rng),
      { x: fire + PRE + w, y: yL, w: landW },
    ],
    gaps: [{ x: fire + PRE, w }],
    triggers: [{ x0: fire, x1: fire + BAND_W, vMin, vMax, seg: x0 }],
  };
}

function flatSegment(x0, tier, rng) {
  const w = 260 + Math.floor(rng() * 200);
  return {
    kind: 'flat', tier, x0, x1: x0 + w,
    plats: [{ x: x0, y: BAND.FLOOR_Y, w }], gaps: [], triggers: [],
  };
}

// A terrace: a raised ledge across a short notch gap — height change via
// jump. Height stays LOW (<= 32px) on purpose: the arc's fat middle covers a
// low ledge across the whole speed window with margin, while a tall ledge
// would only be landable inside a razor-thorned offset window (measured:
// a 68px ledge at offset 122 is landable for +-6px of speed — a misdesign).
function terraceSegment(x0, tier, rng) {
  const w = 76;
  const h = 24 + Math.min(tier, 2) * 4;
  const [vMin, vMax] = SPEED.std;
  const fire = x0 + PRO;
  const landW = Math.ceil(reach(vMax) - PRE - w) + 52 + Math.floor(rng() * 30);
  return {
    kind: 'terrace', tier, x0, x1: fire + PRE + w + landW,
    plats: [
      approachPlat(x0, rng),
      { x: fire + PRE + w, y: BAND.FLOOR_Y - h, w: landW },
    ],
    gaps: [{ x: fire + PRE, w }],
    triggers: [{ x0: fire, x1: fire + BAND_W, vMin, vMax, seg: x0 }],
  };
}

// A platform pair: gap + mid island + gap (two authored jumps, tier >= 2).
// The island is authored as its own mini-approach: the first arc lands on it
// with margin, the second fire line sits a grounded run past that landing.
function pairSegment(x0, tier, rng) {
  const w1 = GAP_W[2], w2 = GAP_W[2] + 8;
  const [vMin, vMax] = SPEED.hard;
  const fire1 = x0 + PRO;
  const g1 = fire1 + PRE;
  const landDist = Math.ceil(reach(vMax) - PRE - w1) + 40;   // island width
  const island = { x: g1 + w1, y: BAND.FLOOR_Y - 34, w: landDist };
  const fire2 = island.x + landDist - 32;                    // grounded run past the arc-1 landing
  const g2 = fire2 + PRE;
  const landW = Math.ceil(reach(vMax) - PRE - w2) + 50;
  return {
    kind: 'pair', tier, x0, x1: g2 + w2 + landW,
    plats: [
      approachPlat(x0, rng),
      island,
      { x: g2 + w2, y: BAND.FLOOR_Y, w: landW },
    ],
    gaps: [{ x: g1, w: w1 }, { x: g2, w: w2 }],
    triggers: [
      { x0: fire1, x1: fire1 + BAND_W, vMin, vMax, seg: x0 },
      { x0: fire2, x1: fire2 + BAND_W, vMin, vMax, seg: x0 },
    ],
  };
}

// THE BOSS BEAT: a long flat, the obstacle-boss body occupying the corridor,
// and an authored PASS PLATFORM over it (approach terrace + overpass). NO
// triggers — weaving is spatial steering, the controller's home turf; the
// overpass approach is climbable by a plain jump when blocked (auto.js).
function bossSegment(x0, tier, rng) {
  const run = 700;
  // The overpass top IS THREATS.BOSS_PASS_Y (the single authored constant — the
  // body height keeps its top below it; see config.js). The approach terrace is
  // a plain-jump step up (42px), and from it the overpass (62px higher) sits
  // inside the arc's fat middle: floor -> approach -> overpass -> drop past.
  const overpass = { x: x0 + 250, y: THREATS.BOSS_PASS_Y, w: 320 };
  const approach = { x: x0 + 130, y: BAND.FLOOR_Y - 42, w: 110 };
  return {
    kind: 'boss', tier, x0, x1: x0 + run,
    plats: [
      { x: x0, y: BAND.FLOOR_Y, w: run, approach: true },
      approach, overpass,
    ],
    gaps: [], triggers: [],   // NO triggers in the boss beat (by design)
    bossX: x0 + 430, bossPlat: overpass,
    bossApproachX: approach.x, bossApproachY: approach.y,
    bossApproachW: approach.w, bossOverpassX: overpass.x,
  };
}

// ---- the ramp ---------------------------------------------------------------
// Act lookup by fraction of corridor length. Tiers NEVER decrease as x grows.
export function tierAt(frac) {
  let tier = 0, boss = false;
  for (const a of PACING.ACTS) {
    if (frac >= a.from) { tier = a.tier; boss = !!a.boss; }
  }
  return { tier, boss };
}

// ---- generate ---------------------------------------------------------------
// Deterministic in the seed. Total length is bounded by the pacing target:
// L between MIN_SECONDS and MAX_SECONDS of NOMINAL_SPEED travel.
export function generateCorridor(seed) {
  const rng = mulberry32(seed);
  const targetL = PACING.MIN_SECONDS * PACING.NOMINAL_SPEED +
    rng() * (PACING.MAX_SECONDS - PACING.MIN_SECONDS) * PACING.NOMINAL_SPEED;
  const segs = [];
  let x = 0;
  let sawBoss = false;
  // The first segment is always flat (the warm-up's learning floor).
  segs.push(flatSegment(0, 0, rng)); x = segs[0].x1;
  while (x < targetL) {
    const frac = x / targetL;
    const { tier, boss } = tierAt(frac);
    if (boss && !sawBoss) { segs.push(bossSegment(x, tier, rng)); sawBoss = true; }
    else if (frac >= 0.66) segs.push(flatSegment(x, tier, rng));          // final sprint: simplest terrain, max pressure
    else if (tier === 0) segs.push(rng() < 0.34 ? gapSegment(x, 0, { rng }) : flatSegment(x, 0, rng));
    else if (tier === 1) {
      const r = rng();
      segs.push(r < 0.3 ? flatSegment(x, tier, rng)
        : r < 0.62 ? gapSegment(x, tier, { rng }) : terraceSegment(x, tier, rng));
    } else {
      const r = rng();
      segs.push(r < 0.18 ? flatSegment(x, tier, rng)
        : r < 0.5 ? gapSegment(x, tier, { up: (rng() < 0.5 ? 0 : 34), rng })
          : r < 0.78 ? terraceSegment(x, tier, rng) : pairSegment(x, tier, rng));
    }
    x = segs[segs.length - 1].x1;
  }
  // The exit portal sits at the end, on a final flat with breathing room.
  const tail = flatSegment(x, 3, rng);
  segs.push(tail);
  const bossSeg = segs.find(s => s.kind === 'boss') || null;
  return {
    seed, targetL, segs,
    length: tail.x1,
    portalX: tail.x1 - 140,
    bossX: bossSeg ? bossSeg.bossX : null,
    bossPlat: bossSeg ? bossSeg.bossPlat : null,
    bossSegX0: bossSeg ? bossSeg.x0 : null,
    bossSegX1: bossSeg ? bossSeg.x1 : null,
    bossApproachX: bossSeg ? bossSeg.bossApproachX : null,
    bossApproachY: bossSeg ? bossSeg.bossApproachY : null,
    bossApproachW: bossSeg ? bossSeg.bossApproachW : null,
    bossOverpassX: bossSeg ? bossSeg.bossOverpassX : null,
  };
}

// The platform field the sim walks: ALL segments' platforms, x-sorted.
export function platformsOf(corridor) {
  const out = [];
  for (const s of corridor.segs) for (const p of s.plats) out.push(p);
  out.sort((a, b) => a.x - b.x);
  return out;
}
export function triggersOf(corridor) {
  const out = [];
  for (const s of corridor.segs) for (const t of s.triggers) out.push(t);
  out.sort((a, b) => a.x0 - b.x0);
  return out;
}

// ---- the invariant (acceptance #1) -------------------------------------------
// For EVERY trigger: the arc at vMin (fired at x0) must clear the gap with
// MARGIN; the arc at vMax must land >= MARGIN inside the landing platform.
// Deterministic over the geometry alone.
export function checkTrigger(trigger, plats, gaps) {
  // The gap this trigger serves: the first gap whose left edge is ahead of
  // the fire line.
  const gap = gaps.filter(g => g.x >= trigger.x0 - 0.5).sort((a, b) => a.x - b.x)[0] || null;
  if (!gap) return { ok: false, why: 'no gap ahead of trigger' };
  // The landing platform: the one whose left edge is the gap's right edge.
  const land = plats.filter(p => p.x >= gap.x + gap.w - 0.5 && p.x <= gap.x + gap.w + 0.5)[0] || null;
  if (!land) return { ok: false, why: 'no landing platform at the gap far edge' };
  // The platform the runner fires FROM: whatever ground sits under the fire
  // line (the segment-entry prologue guarantees a grounded, floor-level band
  // entry; the pair segment's SECOND trigger legitimately fires from its
  // elevated island — the height rule below is computed from this platform).
  const appr = plats.filter(p => p.x <= trigger.x0 + 1 && p.x + p.w >= trigger.x0)
    .sort((a, b) => a.y - b.y)[0] || null;
  if (!appr) return { ok: false, why: 'no platform under the fire line' };
  const landFar = trigger.x0 + reach(trigger.vMin);
  const clearAt = landFar;
  if (clearAt < gap.x + gap.w + MARGIN) {
    return { ok: false, why: `floor arc ${Math.round(clearAt)} fails to clear gap end ${gap.x + gap.w} (+${MARGIN})` };
  }
  const ceilAt = trigger.x0 + reach(trigger.vMax);
  if (ceilAt > land.x + land.w - MARGIN) {
    return { ok: false, why: `ceiling arc ${Math.round(ceilAt)} overshoots landing far edge ${land.x + land.w} (-${MARGIN})` };
  }
  // Height check: the landing top must sit inside the arc's reach (apex 80px
  // minus a 16px safety) measured from the approach platform's top — a ledge
  // you cannot physically land on is a template bug too. Low ledges (<= 34px)
  // are inside the fat middle of the arc across the WHOLE window; that bound
  // is what the template tables author against.
  if (land.y < appr.y - 80 + 16) {
    return { ok: false, why: `landing ${land.y} unreachable from approach ${appr.y} (apex 80px, 16px safety)` };
  }
  // Band-width check: the band must be wide enough that a runner landing from
  // the prologue's worst elevated drop (x0 + 52) is still inside it.
  if (trigger.x1 - trigger.x0 < 52) {
    return { ok: false, why: `band ${trigger.x1 - trigger.x0}px is narrower than the worst prologue landing offset` };
  }
  return { ok: true, gap, land };
}

// Assert the invariant across a whole corridor; returns the failure list.
export function checkCorridor(corridor) {
  const plats = platformsOf(corridor);
  const gaps = corridor.segs.flatMap(s => s.gaps);
  const fails = [];
  for (const t of triggersOf(corridor)) {
    const r = checkTrigger(t, plats, gaps);
    if (!r.ok) fails.push({ x0: t.x0, ...r });
  }
  return fails;
}
