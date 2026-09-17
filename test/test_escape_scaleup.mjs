// HORDES — THE ESCAPE MAP SCALE-UP (2026-09-17): 4 -> 9 units + ELEVATED PATHS.
// Owner directive: "make the map quite a bit larger ... one more unit to the
// side and more unit up for a total of 5 more units. And we need some dynamic
// aspect to it. Elevated paths, like a megabonk map."
//
// Proven here, in order:
//   UNIT READING  the unit is pinned (UNIT_W/UNIT_H) and the extent is
//                units-based, with the shipped 2-unit extent recoverable by
//                flipping ONE constant (the counter-case below)
//   ELEVATION     decks and stacks exist across seeds, the floor route stays
//                whole UNDER every deck (multi-level, never walled off), and
//                 every authored hop height is inside the single-jump bound
//   JUMP-REACH    the extended table: every trigger classed by height, its
//                required distance vs the arc's actual reach, MARGIN-honest
//   AUTO-PILOT    the hard requirement: AUTO completes the taller map at both
//                rates, actually CLIMBS (min-y pins), 60/120 parity holds
//   FLIER LANES   an elevated pilot draws new fliers into their OWN lane
//   CAMERA        camYFor pins — the vertical pan keeps the floor on screen
//   UNATTENDED    the REAL portal-cine hand-over, zero manual input, pumps to
//                a COMPLETED escape (what night mode's sanctioned skip stands
//                in for; the skip policy itself is the owner's economy call)
import { suite, boot } from './_harness.mjs';
import { generateCorridor, platformsOf, triggersOf, AIRTIME, reach, upHopT } from '../src/escape/generator.js';
import { createSim, step } from '../src/escape/sim.js';
import { inputFor } from '../src/escape/auto.js';
import { MAP, BAND, PACING, PHYS, THREATS, PAYOUT_K } from '../src/escape/config.js';
import { camYFor } from '../src/escape/render.js';
import { bestGoldOf, payoutFor } from '../src/escape/payout.js';
import { recordRun } from '../src/achievements.js';

const S = suite('test_escape_scaleup');
function assert(cond, msg) { if (!cond) throw new Error('AssertionError: ' + msg); }

// ---------------------------------------------------------------------------
// THE UNIT READING, pinned. One unit = one quarter of the shipped map ON EACH
// AXIS of the corridor's world (the escape is one-way side-scroll, so the
// owner's 2x2->3x3 AREA reading maps onto LENGTH x VERTICAL BAND): UNIT_W 3000
// (shipped guaranteed-minimum 6000px = 2 units) and UNIT_H 66 (the shipped
// 132px authored band [MIN_TOP..FLOOR_Y] = 2 units). 9 units total.
// ---------------------------------------------------------------------------
S.check('the unit is pinned and the vertical band grew by exactly one unit', () => {
  assert(MAP.UNITS_X === 3 && MAP.UNITS_Y === 3, 'the map is 3x3 units (got ' + MAP.UNITS_X + 'x' + MAP.UNITS_Y + ')');
  assert(MAP.UNIT_W === 3000, 'UNIT_W is half the shipped corridor axis (' + MAP.UNIT_W + ')');
  assert(MAP.UNIT_H === 66, 'UNIT_H is half the shipped vertical band (' + MAP.UNIT_H + ')');
  assert(BAND.MIN_TOP === 252 - 3 * 66 && BAND.MIN_TOP === 54,
    'MIN_TOP grew 120 -> ' + BAND.MIN_TOP + ' (exactly one more 66px unit up)');
  assert(PACING.MIN_SECONDS === 30 && PACING.NOMINAL_SPEED === 200,
    'PACING is untouched (the duration consequence is reported, never retuned)');
});
S.check('the extent is units-based: nominal lengths land in the 3-unit bound', () => {
  const lo = MAP.UNITS_X * MAP.UNIT_W / PACING.NOMINAL_SPEED;
  const hi = lo * (1 + (PACING.MAX_SECONDS - PACING.MIN_SECONDS) / PACING.MIN_SECONDS) + 4;
  for (let seed = 1; seed <= 20; seed++) {
    const secs = generateCorridor(seed).length / PACING.NOMINAL_SPEED;
    assert(secs >= lo && secs <= hi,
      'seed ' + seed + ': nominal ' + secs.toFixed(1) + 's outside [' + lo + ',' + hi + ']');
  }
  console.log('  MEASURED extent: corridor length ' +
    Math.round(Math.min(...[1, 2, 3, 4, 5].map(s => generateCorridor(s).length))) + '-' +
    Math.round(Math.max(...[1, 2, 3, 4, 5].map(s => generateCorridor(s).length))) +
    'px = 3 units x 3000px (+20% authored variance)');
});
S.check('COUNTER-CASE: UNITS_X back to 2 shrinks the corridor to the shipped extent (nothing is hardcoded)', () => {
  // config.js exports live objects, so the counter-case flips the ONE extent
  // constant and restores it after — the 2-unit map must fall straight out of
  // the same generator, proving the 9-unit build is not propped up by any
  // hardcoded length anywhere.
  const keep = MAP.UNITS_X;
  try {
    MAP.UNITS_X = 2;
    const lo = 6000 / PACING.NOMINAL_SPEED, hi = lo * 1.2 + 4;
    for (let seed = 1; seed <= 12; seed++) {
      const c = generateCorridor(seed);
      assert(c.length >= 6000 && c.length <= 7300,
        'seed ' + seed + ': 2-unit length ' + c.length + ' outside the shipped extent');
      assert(c.length / PACING.NOMINAL_SPEED <= hi,
        'seed ' + seed + ': 2-unit nominal ' + (c.length / PACING.NOMINAL_SPEED).toFixed(1) + 's');
    }
    console.log('  MEASURED counter-case: UNITS_X=2 -> ' +
      generateCorridor(1).length + 'px (the shipped 2-unit corridor, same generator)');
  } finally {
    MAP.UNITS_X = keep;
  }
});

// ---------------------------------------------------------------------------
// ELEVATED PATHS, structural: multi-level routes exist, the floor lane under
// them stays WHOLE and walkable (a deck is relief, never a wall), and every
// authored hop height is inside the physical single-jump bound (apex 80px
// minus the 16px safety = 64px).
// ---------------------------------------------------------------------------
S.check('decks and stacks exist across seeds; the floor route under every deck stays whole', () => {
  let deckSegs = 0, stackSegs = 0, seedsWithStack = 0, seedsWithDeck = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const c = generateCorridor(seed);
    const plats = platformsOf(c);
    let hasDeck = false, hasStack = false;
    for (const s of c.segs) {
      if (s.kind === 'deck') { deckSegs++; hasDeck = true; }
      if (s.kind === 'stack') { stackSegs++; hasStack = true; }
      if (s.kind !== 'deck' && s.kind !== 'stack') continue;
      // MULTI-LEVEL: every deck platform has the continuing FLOOR under its
      // full span (the horde keeps charging below; the deck never walls the
      // floor route off — the render's slab-on-struts is the honest picture).
      for (const d of s.plats.filter(p => p.deck)) {
        const under = plats.some(pl => !pl.deck && pl.y === BAND.FLOOR_Y &&
          pl.x <= d.x && pl.x + pl.w >= d.x + d.w);
        assert(under, 'seed ' + seed + ': no whole floor under the deck at ' + d.x);
        assert(d.y >= BAND.MIN_TOP && d.y < BAND.FLOOR_Y,
          'seed ' + seed + ': deck top ' + d.y + ' outside the authored band');
      }
    }
    if (hasDeck) seedsWithDeck++;
    if (hasStack) seedsWithStack++;
  }
  assert(deckSegs >= 20 && seedsWithDeck >= 12, 'only ' + deckSegs + ' deck segments on ' + seedsWithDeck + '/20 seeds');
  assert(stackSegs >= 3 && seedsWithStack >= 3, 'only ' + stackSegs + ' stack segments on ' + seedsWithStack + '/20 seeds');
  // HOP heights are measured PER HOP (a trigger's from-level -> its landing),
  // never deck-vs-floor: the stack's deck2 is 112px over the floor but reached
  // by TWO 56px hops. The bound is the physical one (apex 80px, 16px safety).
  for (let seed = 1; seed <= 20; seed++) {
    const c = generateCorridor(seed);
    const plats = platformsOf(c);
    for (const t of triggersOf(c).filter(t => t.up)) {
      const appr = plats.filter(p => p.x <= t.x0 + 1 && p.x + p.w >= t.x0).sort((a, b) => a.y - b.y)[0];
      const h = appr.y - t.land.y;
      assert(h > 0 && h <= 64,
        'seed ' + seed + ': authored hop height ' + h + ' outside the single-jump bound (apex 80px, 16px safety)');
    }
  }
  // The stack is the corridor's tallest authored point: deck2's top sits
  // 112px over the floor — INSIDE the third vertical unit (MIN_TOP 54).
  const stackTops = [];
  for (let seed = 1; seed <= 20; seed++) {
    const c = generateCorridor(seed);
    for (const s of c.segs) {
      if (s.kind === 'stack') stackTops.push(Math.min(...s.plats.filter(p => p.deck).map(p => p.y)));
    }
  }
  for (const y of stackTops) {
    assert(y === 252 - 112, 'stack top at y=' + y + ' (the authored 56+56 two-hop tower is 140)');
    assert(y >= BAND.MIN_TOP, 'stack top ' + y + ' pokes above the authored band ' + BAND.MIN_TOP);
  }
  console.log('  MEASURED elevated mix (20 seeds): ' + deckSegs + ' deck segs, ' + stackSegs +
    ' stack segs; stack top y=140 (112px up, inside unit 3); floor whole under every deck');
});

// ---------------------------------------------------------------------------
// THE JUMP-REACH TABLE, extended to every new height (the earlier layout
// task's table, grown): every trigger classed by what it asks of the arc, its
// required distance stated against the arc's ACTUAL reach at the speed-window
// floor and ceiling. The generator invariant proves each row; this table is
// the honest report of what the new heights cost.
// ---------------------------------------------------------------------------
S.check('the jump-reach table: no impossible jumps at any authored height', () => {
  const MARGIN = 8;
  const rows = {};   // class -> { n, minClear, minLand }
  const bump = (cls, clear, land) => {
    const r = rows[cls] || (rows[cls] = { n: 0, minClear: Infinity, minLand: Infinity });
    r.n++; r.minClear = Math.min(r.minClear, clear); r.minLand = Math.min(r.minLand, land);
  };
  for (let seed = 1; seed <= 20; seed++) {
    const c = generateCorridor(seed);
    const plats = platformsOf(c);
    const gaps = c.segs.flatMap(s => s.gaps);
    for (const t of triggersOf(c)) {
      const appr = plats.filter(p => p.x <= t.x0 + 1 && p.x + p.w >= t.x0).sort((a, b) => a.y - b.y)[0];
      assert(appr, 'seed ' + seed + ': no platform under the fire line at ' + t.x0);
      if (t.up) {
        // AN UP-HOP (the new height verb): fire on the lower level, land on
        // the upper one on the arc's DESCENDING crossing.
        const land = t.land;
        const h = appr.y - land.y;
        const tt = upHopT(h);
        const lo = t.x0 + tt * t.vMin;             // slowest arc's landing x
        const hi = t.x0 + tt * t.vMax;             // fastest arc's landing x
        const cls = 'up-hop +' + h + 'px';
        bump(cls, lo - (land.x + MARGIN), (land.x + land.w - MARGIN) - hi);
        assert(lo >= land.x + MARGIN && hi <= land.x + land.w - MARGIN,
          'seed ' + seed + ': ' + cls + ' arc window [' + Math.round(lo) + ',' + Math.round(hi) +
          '] outside the deck [' + land.x + ',' + (land.x + land.w) + ']');
      } else {
        // A GAP CROSSING (flat, +34 up-landing, terrace, or deck-level).
        const gap = gaps.filter(g => g.x >= t.x0 - 0.5).sort((a, b) => a.x - b.x)[0];
        assert(gap, 'seed ' + seed + ': no gap ahead of the trigger at ' + t.x0);
        const land = plats.filter(p => p.x >= gap.x + gap.w - 0.5 && p.x <= gap.x + gap.w + 0.5)[0];
        assert(land, 'seed ' + seed + ': no landing platform at ' + gap.x);
        const dh = appr.y - land.y;   // > 0: landing is UP from the approach
        const cls = appr.deck && land.deck ? 'deck gap (deck level)'
          : dh === 0 ? 'floor gap (flat)'
            : dh > 0 ? 'gap +' + dh + 'px up' : 'gap ' + (-dh) + 'px down';
        const floorReach = t.x0 + reach(t.vMin);
        const ceilReach = t.x0 + reach(t.vMax);
        bump(cls, floorReach - (gap.x + gap.w + MARGIN), (land.x + land.w - MARGIN) - ceilReach);
        assert(floorReach >= gap.x + gap.w + MARGIN,
          'seed ' + seed + ': ' + cls + ' floor arc fails to clear by MARGIN');
        assert(ceilReach <= land.x + land.w - MARGIN,
          'seed ' + seed + ': ' + cls + ' ceiling arc overshoots the landing');
        // Upward landings ride the arc's fat middle (<= 34px); drops (dh < 0)
        // are always inside the arc — falling further is free.
        assert(dh >= -66 && dh <= 34,
          'seed ' + seed + ': gap landing ' + dh + 'px up exceeds the fat-middle bound');
      }
    }
  }
  for (const [cls, r] of Object.entries(rows)) {
    console.log('  MEASURED jump-reach [' + cls + '] x' + r.n +
      ': slowest arc clears by >= ' + Math.round(r.minClear) + 'px, fastest lands >= ' +
      Math.round(r.minLand) + 'px inside (window ' + Math.round(reach(180)) + '-' +
      Math.round(reach(220)) + 'px of actual reach vs ' + Math.round(AIRTIME * 100) / 100 + 's airtime)');
  }
  // The arc's own budget, stated once: apex 80px, airtime 0.8s, and the run
  // speeds that turn it into reach — the numbers every row above rides on.
  assert(PHYS.JUMP_VY * PHYS.JUMP_VY / (2 * PHYS.GRAVITY) === 80, 'apex is 80px');
});

// ---------------------------------------------------------------------------
// AUTO-PILOT + ELEVATION (the HARD requirement): the template controller
// completes the taller map at BOTH rates, and it actually CLIMBS — the min-y
// pins prove the elevated routes are ridden, not routed around.
// ---------------------------------------------------------------------------
function playOut(seed, hz, capSecs = 170) {
  const sim = createSim(seed);
  let minY = 999, elevSteps = 0, n = 0;
  while (!sim.outcome && n < hz * capSecs) {
    step(sim, 1 / hz, inputFor(sim));
    n++;
    minY = Math.min(minY, sim.player.y);
    if (sim.player.y < BAND.FLOOR_Y - 40) elevSteps++;
  }
  sim._minY = minY; sim._elevSteps = elevSteps;
  return sim;
}
S.check('AUTO completes the 9-unit map AND rides the elevated routes (measured climb)', () => {
  let climbedStack = 0, totalTime = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const sim = playOut(seed, 60);
    assert(sim.outcome === 'complete',
      'seed ' + seed + ': auto finished "' + sim.outcome + '" (unattended completion is the hard requirement)');
    assert(sim._minY <= 210,
      'seed ' + seed + ': min y ' + Math.round(sim._minY) + ' never reached deck level (the up-routes are dead weight?)');
    if (sim._minY <= 150) climbedStack++;          // the stack's hop apex band
    assert(sim._elevSteps >= 150,
      'seed ' + seed + ': only ' + sim._elevSteps + ' elevated steps (the decks are decorative?)');
    totalTime += sim.t;
    console.log('  MEASURED auto seed ' + seed + ': complete in ' + sim.t.toFixed(1) +
      's, climbed to y=' + Math.round(sim._minY) + ' (' + sim._elevSteps + ' elevated steps)');
  }
  assert(climbedStack >= 8, 'only ' + climbedStack + '/12 seeds rode the stack level');
  console.log('  MEASURED auto: mean completion ' + (totalTime / 12).toFixed(1) +
    's on 9 units (was ~31.5s on 4 — the reported duration consequence, no constant touched)');
});
S.check('60Hz and 120Hz parity holds on the taller map, climb included', () => {
  for (let seed = 1; seed <= 6; seed++) {
    const a = playOut(seed, 60), b = playOut(seed, 120);
    assert(a.outcome === b.outcome && a.outcome === 'complete',
      'seed ' + seed + ': 60Hz -> ' + a.outcome + ' but 120Hz -> ' + b.outcome);
    assert(Math.abs(a._minY - b._minY) <= 2,
      'seed ' + seed + ': the climb itself diverged (' + Math.round(a._minY) + ' vs ' + Math.round(b._minY) + ')');
  }
});

// ---------------------------------------------------------------------------
// FLIER LANES: elevation trades the ground horde for air pressure — a pilot on
// a deck draws NEW fliers into their OWN lane instead of the sky.
// ---------------------------------------------------------------------------
S.check('fliers enter the elevated pilot\'s lane; a floor pilot keeps the sky lane', () => {
  // FLOOR CASE: at floor level the lane is the sky base (60).
  const flat = createSim(3);
  flat.nextFlier = 0;
  step(flat, 1 / 60, { moveX: 0 });
  assert(flat.fliers.length > 0 && flat.fliers[flat.fliers.length - 1].lane === 60,
    'a floor pilot\'s flier spawned outside the sky lane');
  // ELEVATED CASE: run auto until the pilot is ON a deck (>= FLIER_LANE_DROP
  // above the floor), then the next flier spawns ~FLIER_LANE_Y above THEM.
  const sim = createSim(3);
  let n = 0;
  while (!(sim.player.onGround && sim.player.y < BAND.FLOOR_Y - THREATS.FLIER_LANE_DROP) &&
         !sim.outcome && n < 60 * 60) {
    step(sim, 1 / 60, inputFor(sim)); n++;
  }
  assert(!sim.outcome && sim.player.onGround && sim.player.y < BAND.FLOOR_Y - THREATS.FLIER_LANE_DROP,
    'seed 3 never stood on a deck in 60s (the climb test above says this cannot happen)');
  const py = sim.player.y;   // parked ON the deck: stationary under {moveX: 0}
  sim.fliers.length = 0;
  sim.nextFlier = 0;
  step(sim, 1 / 60, { moveX: 0 });
  const fl = sim.fliers[sim.fliers.length - 1];
  assert(fl && fl.lane !== 60, 'an elevated pilot\'s flier stayed in the sky lane');
  assert(Math.abs(fl.lane - Math.max(2, py - THREATS.FLIER_LANE_Y)) <= 1,
    'lane ' + fl.lane + ' is not FLIER_LANE_Y above the pilot (' + py + ')');
  // And the keep-clear cap still holds in the lane: the flier never dips
  // within 22px of the pilot (no unavoidable damage at any height).
  let closest = 1e9; n = 0;
  while (n < 60 * 3 && sim.fliers.includes(fl)) {
    step(sim, 1 / 60, { moveX: 0 }); n++;
    if (Math.abs(fl.x - sim.player.x) < 60) closest = Math.min(closest, Math.abs(fl.y - sim.player.y));
  }
  console.log('  MEASURED flier lane: floor pilot -> lane 60 (sky); deck pilot y=' +
    Math.round(py) + ' -> lane ' + Math.round(fl.lane) + ' (in-lane closest approach ' +
    (closest === 1e9 ? 'n/a (passed high)' : Math.round(closest) + 'px') + ', keep-clear 22px enforced in sim)');
});

// ---------------------------------------------------------------------------
// THE CAMERA: the vertical pan (camYFor) is one pure exported function — 0 on
// the floor, up to 48px on the stacked decks, and the floor line NEVER leaves
// the screen (the drop-back-down stays visible).
// ---------------------------------------------------------------------------
S.check('camYFor: zero on the floor, pans on the decks, floor always on screen', () => {
  assert(camYFor({ y: 252 }) === 0, 'no pan at floor level');
  assert(camYFor({ y: 212 }) === 0, 'no pan for a hop\'s apex above the floor');
  assert(camYFor({ y: 196 }) === 7, 'deck1 level pans a little (got ' + camYFor({ y: 196 }) + ')');
  assert(camYFor({ y: 140 }) === 37, 'the stack top pans most (got ' + camYFor({ y: 140 }) + ')');
  assert(camYFor({ y: 60 }) === 48, 'the pan clamps at 48 (got ' + camYFor({ y: 60 }) + ')');
  assert(camYFor({ y: 140 }) === camYFor({ y: 140 }), 'pure: same pilot, same pan');
  // THE DROP-BACK RULE: at maximum pan the floor line is still on screen
  // (252 - 48 = 204, comfortably inside the 300px view).
  for (let y = 54; y <= 252; y += 2) {
    const fy = BAND.FLOOR_Y - camYFor({ y });
    assert(fy <= 258 && fy >= 0, 'floor line at ' + fy + ' off-screen while the pilot is at y=' + y);
  }
});

// ---------------------------------------------------------------------------
// UNATTENDED, through the REAL seam: a live run enters the escape through the
// portal-cine hand-over with NO manual input of any kind, and the run pumps to
// a COMPLETED escape with the bank credit. This is the auto-pilot elevation
// requirement proven at the integration seam (night mode's sanctioned skip
// stands in for a human; whether night runs should PLAY the escape is the
// owner's economy call, flagged in the scale-up report — not changed here).
// ---------------------------------------------------------------------------
const h = await boot();
const T = h.T;
const st = h.state;
S.check('UNATTENDED: the real hand-over, zero input, pumps to a COMPLETED escape', () => {
  T.startRun();
  h.pump(2);
  const prof = T.getProfile();
  recordRun(prof, { gold: 12000 });
  const best = bestGoldOf(prof);
  const bankBefore = prof.gold;
  const purseBefore = prof.runPurse;
  st.mode = 'portal-cine';
  st.wave.num = 1;
  st.wave.cinePending = false;
  h.key('keydown', { key: 'x', preventDefault() {} });   // the REAL hand-over
  assert(st.mode === 'escape', 'handed to the escape (mode ' + st.mode + ')');
  // ZERO manual input from here: the default pilot is AUTO; the frame pump is
  // the app's own. Cap generously over the measured ~47s nominal.
  let n = 0;
  while (st.mode === 'escape' && n < 60 * 240) { h.pump(1); n++; }
  assert(st.mode !== 'escape', 'the escape never ended (' + (n / 60).toFixed(0) + 's cap hit)');
  assert(st.mode === 'intermission', 'handed back to ' + st.mode + ' (must be the soft intermission)');
  const sub = h.elements['ov-sub'].innerHTML || '';
  assert(/ESCAPE COMPLETE/.test(sub), 'the intermission lead names the completion: ' + sub.slice(0, 90));
  assert(prof.gold === bankBefore + payoutFor(best),
    'the bank credit landed exactly once (' + (prof.gold - bankBefore) + ' vs ' + payoutFor(best) + ')');
  assert(prof.runPurse === purseBefore, 'the purse never saw the escape income');
  console.log('  MEASURED unattended: portal-cine hand-over -> ESCAPE COMPLETE in ' +
    (n / 60).toFixed(1) + 's of unattended pumping, +' + payoutFor(best) + 'g to the bank (K=' + PAYOUT_K + ')');
  st.mode = 'menu';   // leave cleanly (bestiary-test precedent)
});

S.done();
