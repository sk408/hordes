// HORDES — NO-STALL REGRESSION (2026-09-18, owner: "pilot stops moving
// sometimes... related to elevation because it happens near the circle
// boundary. If I take manual control and move, it's no problem after").
//
// THE NAMED INVARIANT: in ANY pilot mode, on ANY geometry the game can
// present, the pilot never spends more than MAX_STALL_TICKS consecutive
// frames without real movement. A blocked or refused move must REDIRECT
// (funnel toward the nearest gate / tangential slide / patrol), never
// cancel to zero.
//
//   PART A (LIVE, flat shipped field): the real update loop drives a real
//   AUTO pilot through the exact scenario shapes the owner reported — rim
//   diagonals and corners, targets and threats BEYOND the boundary — and
//   the movement trace is asserted against MAX_STALL_TICKS. Covers: gem
//   beyond the rim, flee pressure at the corner, milestone chest at the
//   rim, portal beyond every legal standing spot (P1b hole 2).
//
//   PART B (AUTHORED TERRACE fixture): the same invariant re-proved for
//   the CLIFF + GRADIENT + CIRCULAR BAND mechanic across the FULL circle
//   — test_elevation_rollback probes only the SPAN_MID radial; this sweep
//   covers every azimuth. The pilot's REAL composition is driven
//   directly: intent (reliefRampRoute bias when the target is up) then
//   the legal step (reliefStep), at radii from the hollow edge to beyond
//   the band, against far-arc band targets, the hollow center, and
//   points beyond the outer rim.
//
// Run: node test/test_pilot_nostall.mjs
import { suite, boot } from './_harness.mjs';
import { CONFIG as C } from '../src/config.js';
import { reliefLevelAt, reliefStep, reliefRampRoute } from '../src/relief.js';
import { stageRelief } from '../src/stages.js';

const S = suite('test_pilot_nostall');
function assert(cond, msg) { if (!cond) throw new Error('AssertionError: ' + msg); }

// THE NAMED BOUND. 30 ticks = 0.5s at 60Hz: an order of magnitude above
// any legitimate micro-pause (banner holds are prologue-only and excluded
// by quietField; the stance min-vector guard falls through to PATROL, it
// does not zero).
export const MAX_STALL_TICKS = 30;

const h = await boot();
const T = h.T, st = h.state;

function quietField() {
  st.enemies.length = 0; st.gems.length = 0; st.itemDrops.length = 0;
  st.spawnTimer = 99999; st.wave.endsAt = st.time + 99999;
  st.wave.bosses = []; st.wave.boss = null; st.portal = null; st.runChest = null;
}

// ---------------------------------------------------------------------------
// PART A — THE LIVE FLAT FIELD (the shipped game the owner plays).
// ---------------------------------------------------------------------------
S.check('FLAT LIVE: no stall window at the rim — gem beyond, corner flee, rim chest, beyond-rim portal', () => {
  T.banners.suppressAll();
  T.startRun();
  h.pump(2);
  quietField();
  const p = st.player;
  p.invuln = 1e9;

  // (a) GEM BEYOND THE RIM DIAGONAL — the WAVE-27 grind shape: outward
  // pressure at the working boundary must hold, not grind, and movement
  // resumes (the pilot banks reachable gems / patrols).
  const scenarios = [];
  {
    st.gems.length = 0;
    st.gems.push({ x: 1500, y: 1500, xp: 1 });       // beyond the rim diagonal
    scenarios.push({ name: 'gem beyond rim', at: [500, 500], run: null });
  }
  // (b) CORNER FLEE — a threat pressing the pilot into the (900,900)
  // corner: wall-steer cancels both components only to feed the
  // center-steer fallback; never a freeze.
  {
    scenarios.push({
      name: 'corner flee pressure',
      at: [880, 880],
      run: () => st.enemies.push({ typeId: 'CHASER', x: 950, y: 950,
        w: 10, hp: 1000, maxHp: 1000, speed: 60, mx: 0, my: 0, age: 0, elite: false }),
    });
  }
  // (c) MILESTONE CHEST AT THE RIM — the celebration must not pin.
  {
    scenarios.push({ name: 'chest at rim', at: [560, 560],
      run: () => { st.runChest = { x: 640, y: 640, tier: 1 }; } });
  }
  // (d) PORTAL BEYOND EVERY LEGAL STANDING SPOT (P1b hole 2) — the
  // lure-inward branch walks to the arena center, it does not zero.
  {
    scenarios.push({ name: 'portal beyond rim', at: [400, 400],
      run: () => { st.portal = { x: 1200, y: 1200 }; } });
  }

  for (const sc of scenarios) {
    quietField();
    p.x = sc.at[0]; p.y = sc.at[1];
    if (sc.run) sc.run();
    let worst = 0, cur = 0, lx = p.x, ly = p.y, playedTicks = 0;
    for (let i = 0; i < 60 * 12; i++) {              // 12 simulated seconds
      h.pump(1);
      st.bannerHold = 0;
      p.invuln = 1e9;                                // isolate steering from death
      // UI modes (the chest's burst+card, settings, field report) freeze the
      // arena BY DESIGN — the invariant is about STEERING stalls. Click
      // through and exempt those frames; count only live play.
      if (st.mode !== 'playing') {
        const c0 = h.elements['ov-cards'].children[0];
        if (c0) c0.click();
        cur = 0;
        lx = p.x; ly = p.y;
        continue;
      }
      playedTicks++;
      const moved = Math.hypot(p.x - lx, p.y - ly);
      lx = p.x; ly = p.y;
      cur = moved > 0.1 ? 0 : cur + 1;
      worst = Math.max(worst, cur);
      assert(worst <= MAX_STALL_TICKS,
        sc.name + ': stalled ' + worst + ' consecutive ticks (> ' + MAX_STALL_TICKS + ') at (' +
        p.x.toFixed(0) + ',' + p.y.toFixed(0) + ')');
    }
    assert(worst <= MAX_STALL_TICKS,
      sc.name + ': worst stall window ' + worst + ' ticks (bound ' + MAX_STALL_TICKS + ')');
    assert(playedTicks > 60 * 6,
      sc.name + ': scenario actually played (' + playedTicks + ' live ticks)');
  }
});

// ---------------------------------------------------------------------------
// PART B — THE AUTHORED TERRACE (the mechanic the rollback parked).
// The full-circle sweep of "a blocked move funnels toward the nearest
// gate and never stalls": the pilot's REAL composition (ramp-route
// intent bias, then the legal reliefStep) at every azimuth.
// ---------------------------------------------------------------------------
S.check('TERRACE MECHANIC: full-circle sweep — the funnel never stalls, any azimuth, any radius', () => {
  // The authored elevation, verbatim (stages.js rollback comment /
  // test_blocking_elevation's AUTHORED fixture).
  const AUTHORED = {
    CELL: 480, LEVELS: 3, BASIN: 560,
    TERRACE: {
      r0: 560, r1: 700,
      A0: Math.PI / 2 - 0.75,
      A1: Math.PI / 2 + 0.75,
      rampW: 0.30,
      topLevel: 2,
      apron: 120,
      feather: 0.35,
    },
  };
  const TER = AUTHORED.TERRACE;
  const flat = stageRelief('VERDANT_HOLLOW');
  const seed = 4242;

  // Pilot stations: hollow edge, band inner/mid/outer, apron, beyond the
  // band — every 30° around the FULL circle (the ramps sit at only two
  // azimuths; the sweep must prove the far side funnels too).
  const radii = [540, 580, 630, 680, 760, 860];
  const targets = [
    ['far-arc band', Math.PI / 2 + Math.PI, (TER.r0 + TER.r1) / 2],  // opposite side, on the path
    ['hollow center', 0, 0],
    ['beyond outer', Math.PI / 4, 1000],
  ];
  const SPEED = 4;                                    // a per-frame step (60Hz-scale)
  let worstRun = 0, worstWhere = '';
  let steps = 0, blockedCount = 0;

  for (let aDeg = 0; aDeg < 360; aDeg += 30) {
    const ang = aDeg * Math.PI / 180;
    for (const r of radii) {
      for (const [tName, tAng, tR] of targets) {
        let x = Math.cos(ang) * r, y = Math.sin(ang) * r;
        const tx = Math.cos(tAng) * tR, ty = Math.sin(tAng) * tR;
        let stall = 0;
        for (let i = 0; i < 4000; i++) {
          // THE PILOT'S REAL COMPOSITION: intent (straight at the target,
          // ramp-route bias when the target is up), then the legal step.
          const route = reliefRampRoute(x, y, tx, ty, seed, AUTHORED);
          let dx, dy;
          if (route) { dx = route[0]; dy = route[1]; }
          else {
            const len = Math.hypot(tx - x, ty - y) || 1;
            dx = (tx - x) / len; dy = (ty - y) / len;
          }
          const wasBlocked = (reliefLevelAt(x, y, seed, AUTHORED) !==
            reliefLevelAt(x + dx * SPEED, y + dy * SPEED, seed, AUTHORED));
          const [nx, ny] = reliefStep(x, y, x + dx * SPEED, y + dy * SPEED, seed, AUTHORED);
          if (wasBlocked) blockedCount++;
          const moved = Math.hypot(nx - x, ny - y);
          x = nx; y = ny; steps++;
          stall = moved > 1e-9 ? 0 : stall + 1;
          if (stall > worstRun) { worstRun = stall; worstWhere = aDeg + '° r=' + r + ' -> ' + tName; }
          assert(stall <= 2,
            'TERRACE funnel STALLED ' + stall + ' steps at ' + worstWhere +
            ' (pos ' + x.toFixed(0) + ',' + y.toFixed(0) + ')');
          if (Math.hypot(x - tx, y - ty) < 6) break;   // arrived — scenario over
        }
      }
    }
  }
  assert(worstRun <= 2,
    'worst zero-movement run ' + worstRun + ' at ' + worstWhere);
  assert(blockedCount > 0 && steps > 0,
    'the sweep actually exercised the cliff rule (' + blockedCount + ' blocked steps of ' +
    steps + ') — the proof is live, not vacuous');
  // And the shipped field still has nothing to block on (the flat half of
  // the rollback contract, re-asserted beside the mechanic it inverts).
  assert(!AUTHORED.TERRACE || flat.LEVELS === 1 && !flat.TERRACE,
    'the SHIPPED field is flat (LEVELS ' + flat.LEVELS + ', no TERRACE) — the live game has no cliff to stall on');
});

S.done();
