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
import { PHYS, BAND, PACING, THREATS, MAP } from './config.js';

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

// The DESCENDING crossing of an up-hop: time from fire until the arc falls
// back DOWN through a ledge h px above the launch top (the only landing
// chance — the sim lands from above, so the rising pass-through does not
// count). Pure physics, the same constants the templates author against.
export const upHopT = (h) =>
  (PHYS.JUMP_VY + Math.sqrt(PHYS.JUMP_VY * PHYS.JUMP_VY - 2 * PHYS.GRAVITY * h)) / PHYS.GRAVITY;

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

// ---- THE ELEVATED PATHS (map scale-up 2026-09-17: "one more unit up") ------
// Multi-level routing, STRUCTURAL not decorative: an authored UP-HOP onto a
// raised DECK that runs ABOVE the continuing floor. The floor below stays
// WHOLE (the horde keeps charging under the walkway — chasers cannot platform
// by construction, so the deck is bounded relief from the pack, never an
// exploit), while the deck's own lane is where the FLIERS hunt (sim.js spawns
// them into the pilot's lane when elevated). The up-hop and any deck-level
// gap ride the SAME trigger-band invariant as every other arc — checkTrigger
// proves each one, so an unjumpable deck is a template bug, not a bad run.
// Heights respect the physical bound (single-hop apex 80px minus the 16px
// safety = 64px max per hop); the entry landing width covers the arc's
// speed-window spread (t(h) * (vMax - vMin)) plus margins both sides.

// The shared up-hop author: returns the trigger + the deck platform it lands
// on. deckX/deckW leave the invariant's margins plus 12px of authored slack
// past the +MARGIN bound (see checkTrigger's up-hop branch).
function upHop(fire, fromY, h, vWin, runW) {
  const [vMin, vMax] = vWin;
  const t = upHopT(h);
  const spread = Math.ceil(t * (vMax - vMin));
  const deckX = Math.round(fire + t * vMin - MARGIN - 12);
  const entryW = spread + 60;
  const deck = { x: deckX, y: fromY - h, w: entryW + runW, deck: true };
  return { deck, entryW };
}

// A single-deck elevated stretch (tier 1-2). h=48 (tier 1) / 56 (tier 2).
// Tier 2 decks carry one UPPER GAP — a deck-level jump between two deck
// platforms, authored exactly like a floor gap (the approach is the deck).
function deckSegment(x0, tier, rng) {
  const h = tier >= 2 ? 56 : 48;
  const vWin = SPEED.std;
  const [vMin, vMax] = vWin;
  const fire = x0 + PRO;
  const { deck, entryW } = upHop(fire, BAND.FLOOR_Y, h, vWin, 0);
  const plats = [approachPlat(x0, rng)];
  const triggers = [];
  const gaps = [];
  let deckEnd;
  if (tier >= 2) {
    // Split the deck run: the first platform (the up-hop's landing) stops PRE
    // before an upper gap, the second catches reach(vMax) like any landing
    // (gapSegment's own math). The up-hop trigger's land IS the first plat.
    const run1 = 120 + Math.floor(rng() * 60);
    const first = { x: deck.x, y: deck.y, w: entryW + run1, deck: true };
    const fire2 = first.x + first.w - 32;                 // grounded run past the landing
    const gw = GAP_W[1] + Math.floor(rng() * 9) - 4;
    const landW = Math.ceil(reach(vMax) - PRE - gw) + 50 + Math.floor(rng() * 30);
    const deck2 = { x: fire2 + PRE + gw, y: deck.y, w: landW, deck: true };
    plats.push(first, deck2);
    gaps.push({ x: fire2 + PRE, w: gw });
    triggers.push({ x0: fire, x1: fire + BAND_W, vMin, vMax, up: true, land: first, seg: x0 });
    triggers.push({ x0: fire2, x1: fire2 + BAND_W, vMin, vMax, seg: x0 });
    deckEnd = deck2.x + deck2.w;
  } else {
    deck.w = entryW + 120 + Math.floor(rng() * 70);
    plats.push(deck);
    triggers.push({ x0: fire, x1: fire + BAND_W, vMin, vMax, up: true, land: deck, seg: x0 });
    deckEnd = deck.x + deck.w;
  }
  // The floor UNDER the deck runs whole to the segment end, and PAST the deck
  // by enough that the drop-off (h px, ~95px of travel at worst) lands
  // grounded inside this segment — the next segment's prologue then meets a
  // floor-level arrival, exactly the class it is authored for.
  const tail = 170 + Math.floor(rng() * 40);
  const x1 = Math.max(deckEnd, fire + PRE) + tail;
  plats.push({ x: fire + PRE - 2, y: BAND.FLOOR_Y, w: x1 - (fire + PRE - 2) });
  return { kind: 'deck', tier, x0, x1, plats, gaps, triggers };
}

// A STACKED elevated stretch (tier 2): floor -> deck1 -> deck2 (two up-hops,
// h=56 each, deck2's top 112px over the floor — inside the third vertical
// unit) -> a long drop back to the floor. The tallest authored point of the
// corridor; the camera pans up with the pilot (render.js camY).
function stackSegment(x0, tier, rng) {
  const [vMin, vMax] = SPEED.std;
  const fire1 = x0 + PRO;
  const a = upHop(fire1, BAND.FLOOR_Y, 56, SPEED.std, 130 + Math.floor(rng() * 50));
  // The second hop fires from deck1's run, onto deck2 (56 more up).
  const fire2 = a.deck.x + a.deck.w - 44;
  const b = upHop(fire2, a.deck.y, 56, SPEED.std, 150 + Math.floor(rng() * 70));
  const deckEndX = b.deck.x + b.deck.w;
  const tail = 200 + Math.floor(rng() * 40);   // the 112px drop lands well inside
  const x1 = deckEndX + tail;
  return {
    kind: 'stack', tier, x0, x1,
    plats: [
      approachPlat(x0, rng),
      a.deck,
      b.deck,
      { x: fire1 + PRE - 2, y: BAND.FLOOR_Y, w: x1 - (fire1 + PRE - 2) },
    ],
    gaps: [],
    triggers: [
      { x0: fire1, x1: fire1 + BAND_W, vMin, vMax, up: true, land: a.deck, seg: x0 },
      { x0: fire2, x1: fire2 + BAND_W, vMin, vMax, up: true, land: b.deck, seg: x0 },
    ],
  };
}

// THE FINALE (V1f — owner refinement 2026-09-17: "the boss reaching to grab
// the pilot and the pilot being able to run past. Has to look convincing"):
// the corridor still ENDS at the boss, but the way past is the FLOOR ITSELF.
// The boss stands OUT IN THE OPEN on flat ground (no box, no overpass — the
// V1e upper level is superseded), and the encounter is its telegraphed GRAB:
// a fixed, learnable cadence (THREATS.GRAB_*) whose claw lands in a marked
// band left of the body. The pilot runs straight through at boss level,
// dodging by timing; the direct route through the boss IS the route, so no
// jump is authored and the invariant is trivially whole. Platform jumps: NONE
// required — required jump distance 0px against a 160px reach.
function finaleSegment(x0) {
  const run = 900;
  const floor = { x: x0, y: BAND.FLOOR_Y, w: run, approach: true };
  return {
    kind: 'boss', finale: true, tier: 3, x0, x1: x0 + run,
    plats: [floor],
    gaps: [],
    triggers: [],
    bossX: x0 + 460, bossPlat: floor,
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
// Deterministic in the seed. MAP EXTENT (scale-up 2026-09-17): the corridor's
// length target is UNITS-BASED — UNITS_X x UNIT_W px with the SAME relative
// variance the pacing bounds expressed on the shipped 2-unit map ((MAX-MIN)/
// MIN = 0.2, read from PACING, never retuned). PACING keeps owning the run's
// SHAPE (act fractions, wall ramp); the extent it spans is the map's. The
// finale is RESERVED out of the loop budget (V1e): the corridor always ENDS
// at the boss + portal, never a random tail.
const FINALE_RESERVE = 900;
export function generateCorridor(seed) {
  const rng = mulberry32(seed);
  const VARIANCE = (PACING.MAX_SECONDS - PACING.MIN_SECONDS) / PACING.MIN_SECONDS;
  const targetL = MAP.UNITS_X * MAP.UNIT_W * (1 + rng() * VARIANCE);
  const segs = [];
  let x = 0;
  // The first segment is always flat (the warm-up's learning floor), and a
  // PRE-CORRIDOR floor runs 260px behind x=0 (approach-flagged: the boss never
  // tears it). The camera at t=0 looks 150px behind the runner — without this
  // floor there is NO ground in the off-screen band at the start, and the
  // horde floor's spawner starves (measured: chasersMin dipped to 0 for the
  // first ~2s of every seed). The horde starts hunted, from step 1.
  segs.push(flatSegment(0, 0, rng));
  segs[0].plats.unshift({ x: -260, y: BAND.FLOOR_Y, w: 260, approach: true });
  x = segs[0].x1;
  while (x < targetL - FINALE_RESERVE) {
    const frac = x / targetL;
    const { tier } = tierAt(frac);
    if (frac >= 0.66) segs.push(flatSegment(x, tier, rng));          // final sprint: simplest terrain, max pressure
    else if (tier === 0) segs.push(rng() < 0.34 ? gapSegment(x, 0, { rng }) : flatSegment(x, 0, rng));
    else if (tier === 1) {
      // ESCALATION gains the single-deck elevated path (the "up" unit's first
      // tier): flat .26 / gap .56 / terrace .78 / deck 1.0 — the shipped
      // flat/gap/terrace shares kept proportionally, the deck carved out of
      // each (pool dilution disclosed in the scale-up report).
      const r = rng();
      segs.push(r < 0.26 ? flatSegment(x, tier, rng)
        : r < 0.56 ? gapSegment(x, tier, { rng })
          : r < 0.78 ? terraceSegment(x, tier, rng) : deckSegment(x, tier, rng));
    } else {
      // ESCALATION+ carries the tall routes: the tier-2 deck (56px, with its
      // upper gap) and the STACK (two hops, 112px — the corridor's tallest
      // authored point, inside the third vertical unit).
      const r = rng();
      segs.push(r < 0.12 ? flatSegment(x, tier, rng)
        : r < 0.38 ? gapSegment(x, tier, { up: (rng() < 0.5 ? 0 : 34), rng })
          : r < 0.58 ? terraceSegment(x, tier, rng)
            : r < 0.74 ? pairSegment(x, tier, rng)
              : r < 0.9 ? deckSegment(x, tier, rng) : stackSegment(x, tier, rng));
    }
    x = segs[segs.length - 1].x1;
  }
  // V1f: the corridor ENDS at the boss — out in the open on the finale floor,
  // the grab gauntlet between the runner and the portal (see finaleSegment).
  const finale = finaleSegment(x);
  segs.push(finale);
  const bossSeg = finale;
  return {
    seed, targetL, segs,
    length: finale.x1,
    portalX: finale.x1 - 140,
    bossX: bossSeg ? bossSeg.bossX : null,
    bossPlat: bossSeg ? bossSeg.bossPlat : null,
    bossSegX0: bossSeg ? bossSeg.x0 : null,
    bossSegX1: bossSeg ? bossSeg.x1 : null,
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
  // The UP-HOP branch (V1e finale): a band with `up` + `land` fires from one
  // platform onto a HIGHER one — no gap involved. The invariant is the same
  // statement as the gap branch in up-hop form: the arc at the speed-window
  // FLOOR must land INSIDE the upper platform (>= MARGIN past its near edge,
  // on the descending crossing — land-from-above is the sim's only landing)
  // and at the CEILING must not overshoot its far edge.
  if (trigger.up) {
    const appr = plats.filter(p => p.x <= trigger.x0 + 1 && p.x + p.w >= trigger.x0)
      .sort((a, b) => a.y - b.y)[0] || null;
    if (!appr) return { ok: false, why: 'no platform under the up-hop fire line' };
    const land = trigger.land;
    const h = appr.y - land.y;
    if (h <= 0 || h > 80 - 16) {
      return { ok: false, why: `up-hop height ${h} outside the arc (apex 80px, 16px safety)` };
    }
    const t = upHopT(h);
    const lo = trigger.x0 + t * trigger.vMin;
    const hi = trigger.x0 + t * trigger.vMax;
    if (lo < land.x + MARGIN) {
      return { ok: false, why: `floor arc lands ${Math.round(lo)} short of the upper platform near edge ${land.x} (+${MARGIN})` };
    }
    if (hi > land.x + land.w - MARGIN) {
      return { ok: false, why: `ceiling arc lands ${Math.round(hi)} past the upper platform far edge ${land.x + land.w} (-${MARGIN})` };
    }
    return { ok: true, gap: null, land };
  }
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
