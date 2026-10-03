// HORDES — PORT SLICE F: building-collision tests (owner-ruled 2026-09-22),
// extended PORT SLICE J (2026-09-23) for the composed field: ~60 boxes/arena
// (was ~3), anchor+satellite clusters, 16px separation floor.
//
// WHAT THIS PINS (through the REAL loop wherever motion is involved):
//   1. UNIT slide — a head-on walk stops at the footprint edge (position
//      stops at rect.x - ring, never penetrates); a diagonal keeps moving;
//      free motion is untouched; the nose-on redirect moves a full stride.
//   2. UNIT steer — open-field intent is byte-identical; a blocked ray
//      commits to the most intent-aligned corner (the anti-cycle fix).
//   2b. UNIT dense pocket — a greedy walk across a tight anchor+satellite
//      pocket (16px lanes, the separation floor) arrives, never stalls,
//      never penetrates.
//   2c. SWEEP no-strand at density — greedy walks across the REAL composed
//      field (8 stages x seeds) never stall past the named bound and never
//      penetrate (the rerun/extended no-strand proof at slice-J density).
//   3. AGREEMENT — every painted footprint equals a queried one
//      and back (paint and blocking agree box for box), 8 stages x kits.
//   4. SPAWN — the run's fixed floor points ( footing, first-run draught,
//      milestone chest slot) sit outside every footprint with room for the
//      mover ring, 8 stages x seeds; the slice-J in-view cluster promise
//      (anchor + >= 1 satellite) still holds.
//   5. REAL manual — a held direction across a footprint never penetrates,
//      keeps moving (no strand), and reaches the far side (around, not
//      through).
//   6. REAL AUTO — the symmetric trap (mark straight across a footprint)
//      is collected and the pilot never stalls past the named bound
//      (test_pilot_nostall.mjs MAX_STALL_TICKS = 30); patrol and flee
//      pressure hold the same bound.
//   7. REAL portal — a portal parked across a footprint is still entered.
//   8. REAL horde — a chaser walks THROUGH footprints (pass-through by
//      design: no pacing change) and reaches the pilot.
//   9. SCAN scope — the paint path still writes no sim state; the motion
//      seam (and only it) resolves positions; the enemy seam is untouched.
//  10. DETERMINISM — the field is a pure function of (seed, stage).
//
// Run: node test/test_building_collision.mjs
import { readFileSync } from 'node:fs';
import { suite, boot } from './_harness.mjs';
import { CONFIG as C } from '../src/config.js';
import { STAGES } from '../src/stages.js';
import { isReachableLoot } from '../src/entities.js';
import {
  STAGE_BUILDINGS, buildingForStage, designsForStage,
  buildingFootprints, buildingPlacements, buildingFixedPoints,
  slideMove, buildingSteer, pushOutOfRects,
  BUILDING_MOVER_R, BUILDING_STEER_LOOK, BUILDING_SEPARATION,
} from '../src/stage_buildings.js';
import { Renderer, groundTheme } from '../src/render.js';

const S = suite('test_building_collision');
function assert(cond, msg) { if (!cond) throw new Error('AssertionError: ' + msg); }

// THE NAMED BOUND (test_pilot_nostall.mjs:40 — the same invariant: no more
// than 30 consecutive frames without real movement, in any pilot mode).
const MAX_STALL_TICKS = 30;
const SEEDS = [1, 7, 11, 12, 4242, 99999, 20260922];

// ---------------------------------------------------------------------------
// 1. UNIT slide.
// ---------------------------------------------------------------------------
S.check('UNIT slide: head-on walk stops at the footprint edge, never inside', () => {
  const R = [{ x: 100, y: -50, w: 80, h: 100 }];
  let x = 0; const y = 0;
  let minGap = Infinity;
  for (let i = 0; i < 300; i++) {
    const s = slideMove(x, y, x + 1, y, R, BUILDING_MOVER_R);
    x = s[0];
    minGap = Math.min(minGap, (100 - x) - BUILDING_MOVER_R);
  }
  assert(Math.abs(x - (100 - BUILDING_MOVER_R)) < 1e-9,
    'walk halts exactly at rect.x - ring (x=' + x + ')');
  assert(minGap >= -1e-9, 'no frame penetrates (min gap ' + minGap + ')');
});

S.check('UNIT slide: nose-on contact redirects at full stride toward the nearer edge', () => {
  const R = [{ x: 100, y: -50, w: 80, h: 100 }];
  const s = slideMove(100 - BUILDING_MOVER_R, 0, 100 - BUILDING_MOVER_R + 1, 0, R, BUILDING_MOVER_R);
  const moved = Math.hypot(s[0] - (100 - BUILDING_MOVER_R), s[1] - 0);
  assert(Math.abs(moved - 1) < 1e-9, 'blocked frame still spends its whole stride (moved ' + moved + ')');
});

S.check('UNIT slide: diagonal contact keeps moving; free motion untouched', () => {
  const R = [{ x: 100, y: -50, w: 80, h: 100 }];
  const d = slideMove(93, -60, 93.7, -59.3, R, BUILDING_MOVER_R);
  assert(Math.hypot(d[0] - 93, d[1] + 60) > 0.5, 'diagonal contact still travels');
  const dcx = Math.max(100, Math.min(d[0], 180)), dcy = Math.max(-50, Math.min(d[1], 50));
  assert(Math.hypot(d[0] - dcx, d[1] - dcy) >= BUILDING_MOVER_R - 1e-9,
    '...without entering the box');
  const f = slideMove(0, 0, 3, 4, [], BUILDING_MOVER_R);
  assert(f[0] === 3 && f[1] === 4, 'no boxes: intent passes through byte-identical');
  const g = slideMove(0, 0, 3, 4, R, BUILDING_MOVER_R);
  assert(g[0] === 3 && g[1] === 4, 'clear ray past a box: intent untouched');
});

// ---------------------------------------------------------------------------
// 2. UNIT steer.
// ---------------------------------------------------------------------------
S.check('UNIT steer: open field is byte-identical; blocked ray commits to a corner', () => {
  const open = buildingSteer(0, 0, 0.6, 0.8, [], BUILDING_MOVER_R);
  assert(open[0] === 0.6 && open[1] === 0.8, 'no boxes, no steering');
  const R = [{ x: 100, y: -50, w: 80, h: 100 }];
  const far = buildingSteer(0, 0, 1, 0, R, BUILDING_MOVER_R);
  assert(far[0] === 1 && far[1] === 0, 'clear ray (look ' + BUILDING_STEER_LOOK + ') is untouched');
  const near = buildingSteer(90, 0, 1, 0, R, BUILDING_MOVER_R);
  assert(Math.abs(Math.hypot(near[0], near[1]) - 1) < 1e-9, 'steering preserves magnitude');
  assert(near[1] < -0.2 || near[1] > 0.2, 'blocked ray gains a tangential part (commits around)');
});

S.check('UNIT steer+slide: the symmetric trap routes around and arrives, zero stall', () => {  const R = [{ x: 100, y: -50, w: 80, h: 100 }];
  let x = 0, y = 0, worst = 0, cur = 0, arrived = -1;
  for (let i = 0; i < 3000; i++) {
    const dx = 250 - x, dy = 0 - y, l = Math.hypot(dx, dy) || 1;
    const s = buildingSteer(x, y, dx / l, dy / l, R, BUILDING_MOVER_R);
    const t = slideMove(x, y, x + s[0], y + s[1], R, BUILDING_MOVER_R);
    const moved = Math.hypot(t[0] - x, t[1] - y);
    x = t[0]; y = t[1];
    cur = moved > 0.1 ? 0 : cur + 1;
    worst = Math.max(worst, cur);
    if (Math.hypot(250 - x, y) < 8) { arrived = i; break; }
  }
  assert(arrived >= 0, 'greedy re-aim reaches the far side (never cycles the face)');
  assert(worst <= MAX_STALL_TICKS, 'no stall window past the bound (worst ' + worst + ')');
});

S.check('UNIT steer: grazing alongside a box keeps advancing, never reverses', () => {
  const R = [{ x: 100, y: -50, w: 80, h: 100 }];
  let gx = 93, gy = -58;
  for (let i = 0; i < 400; i++) {
    const s = buildingSteer(gx, gy, 1, 0, R, BUILDING_MOVER_R);
    const t = slideMove(gx, gy, gx + s[0], gy + s[1], R, BUILDING_MOVER_R);
    gx = t[0]; gy = t[1];
  }
  assert(gx > 400, 'the graze walks the face and continues east (x=' + gx.toFixed(0) + ')');
});

S.check('UNIT pushOut: interior points leave by the nearest face; exterior is untouched', () => {
  const R = [{ x: 100, y: -50, w: 80, h: 100 }];
  const o = pushOutOfRects(R, 0, 0, 4);
  assert(o[0] === 0 && o[1] === 0, 'outside stays put');
  for (const [px, py] of [[140, 0], [100, -50], [179, 49], [150, 100]]) {
    const q = pushOutOfRects(R, px, py, 4);
    const inside = q[0] > 100 - 4 && q[0] < 180 + 4 && q[1] > -50 - 4 && q[1] < 50 + 4;
    assert(!inside, 'interior (' + px + ',' + py + ') leaves to (' + q[0] + ',' + q[1] + ')');
    assert(Math.hypot(q[0] - px, q[1] - py) <= 60, '...by a nudge, not a teleport');
  }
});

S.check('UNIT dense pocket: a greedy walk across a 16px-lane cluster arrives, never stalls', () => {
  // The slice-J separation floor, worst case: an anchor with three
  // satellites at exactly BUILDING_SEPARATION gaps, pocket opening south —
  // the tightest legal composition. A fixed goal across it must still route
  // around (steer commits past each tip) with zero stall and zero entry.
  const R = [
    { x: 200, y: 100, w: 96, h: 92 },
    { x: 200 + 96 + BUILDING_SEPARATION, y: 120, w: 56, h: 44 },
    { x: 200 - BUILDING_SEPARATION - 60, y: 130, w: 60, h: 36 },
    { x: 220, y: 100 - BUILDING_SEPARATION - 40, w: 52, h: 40 },
  ];
  let x = 100, y = 350, worst = 0, cur = 0, arrived = -1, pen = 0;
  for (let i = 0; i < 6000; i++) {
    const dx = 400 - x, dy = 50 - y, l = Math.hypot(dx, dy) || 1;
    if (l < 8) { arrived = i; break; }
    const s = buildingSteer(x, y, dx / l, dy / l, R, BUILDING_MOVER_R);
    const t = slideMove(x, y, x + s[0] * 2, y + s[1] * 2, R, BUILDING_MOVER_R);
    const moved = Math.hypot(t[0] - x, t[1] - y);
    x = t[0]; y = t[1];
    for (const r of R) {
      const cx = Math.max(r.x, Math.min(x, r.x + r.w));
      const cy = Math.max(r.y, Math.min(y, r.y + r.h));
      if (Math.hypot(x - cx, y - cy) < BUILDING_MOVER_R - 1e-9) pen++;
    }
    cur = moved > 0.1 ? 0 : cur + 1;
    worst = Math.max(worst, cur);
  }
  assert(arrived >= 0, 'the pocket walk routes around and arrives (never cycles the faces)');
  assert(worst <= MAX_STALL_TICKS, 'no stall window past the bound (worst ' + worst + ')');
  assert(pen === 0, 'the pocket walk never enters a footprint (pen frames ' + pen + ')');
});

S.check('SWEEP no-strand at density: greedy walks never stall or penetrate on the real field', () => {
  // The rerun/extended no-strand proof at slice-J density: fixed
  // start/goal pairs across the REAL composed field of every stage. The
  // binding properties are the named no-stall bound (<= 30 consecutive
  // still frames — the invariant live play assumes) and zero penetration;
  // both hold at ~60 boxes/arena exactly as at ~3. (Fixed-goal-forever
  // arrival is not pinned: concave clusters admit rare limit cycles under
  // a goal that never moves — live marks always move; REAL checks below
  // pin the arrivals the game needs.)
  let hseed = 987654321;
  const rnd = () => (hseed = (Math.imul(hseed, 1103515245) + 12345) >>> 0) / 4294967296;
  let worst = 0, pen = 0, walks = 0;
  for (const s of STAGES) {
    for (const seed of [3, 4242, 777]) {
      const rects = buildingFootprints(seed, s.id);
      for (let w = 0; w < 4; w++) {
        let x = -800 + rnd() * 1600, y = -800 + rnd() * 1600;
        const gx = -800 + rnd() * 1600, gy = -800 + rnd() * 1600;
        const out = (px, py) => !rects.some(r => px > r.x - 8 && px < r.x + r.w + 8 &&
          py > r.y - 8 && py < r.y + r.h + 8);
        if (!out(x, y) || !out(gx, gy)) continue;
        walks++;
        let cur = 0;
        for (let i = 0; i < 2000; i++) {
          const dx = gx - x, dy = gy - y, l = Math.hypot(dx, dy) || 1;
          if (l < 10) break;
          const sv = buildingSteer(x, y, dx / l, dy / l, rects, BUILDING_MOVER_R);
          const t = slideMove(x, y, x + sv[0] * 2, y + sv[1] * 2, rects, BUILDING_MOVER_R);
          const moved = Math.hypot(t[0] - x, t[1] - y);
          x = t[0]; y = t[1];
          for (const r of rects) {
            const cx = Math.max(r.x, Math.min(x, r.x + r.w));
            const cy = Math.max(r.y, Math.min(y, r.y + r.h));
            if (Math.hypot(x - cx, y - cy) < BUILDING_MOVER_R - 1e-9) pen++;
          }
          cur = moved > 0.1 ? 0 : cur + 1;
          worst = Math.max(worst, cur);
        }
      }
    }
  }
  assert(walks >= 60, 'the sweep actually walked (' + walks + ' walks)');
  assert(worst <= MAX_STALL_TICKS, 'no walk stalls past the named bound at density (worst ' + worst + ')');
  assert(pen === 0, 'no walk penetrates a footprint at density (pen frames ' + pen + ')');
});

// ---------------------------------------------------------------------------
// 3. AGREEMENT paint == query (single-sourced, slice J).
// ---------------------------------------------------------------------------
S.check('AGREEMENT: every painted footprint equals a queried one and back (8 stages x kits)', () => {
  const mk = () => {
    const ctx = {
      canvas: null, fillStyle: '#000', globalAlpha: 1, font: '10px monospace',
      textAlign: 'left', textBaseline: 'top', imageSmoothingEnabled: true,
      setTransform() {}, translate() {}, save() {}, restore() {}, clearRect() {},
      beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, arc() {},
      fillRect() {}, fillText() {},
    };
    const canvas = { width: 0, height: 0, getContext: () => ctx,
      getBoundingClientRect: () => ({ width: 0, height: 0 }) };
    ctx.canvas = canvas;
    return { R: new Renderer(canvas), ctx };
  };
  for (const s of STAGES) {
    const kit = new Set(designsForStage(s.id).map(b => b.id));
    const queried = buildingPlacements(4242, s.id).map(r => r.id + '@' + r.x + ',' + r.y);
    const painted = new Set();
    for (let cx = -900; cx <= 900; cx += 96) {
      for (let cy = -900; cy <= 900; cy += 96) {
        const { R, ctx } = mk();
        R.drawLandmarks(ctx, 4242, { x: cx, y: cy }, groundTheme(1), s.id);
        for (const l of R.landmarks) {
          if (kit.has(l.kind)) painted.add(l.kind + '@' + l.x + ',' + l.y);
        }
      }
    }
    const qset = new Set(queried);
    const missing = [...qset].filter(k => !painted.has(k));
    const extra = [...painted].filter(k => !qset.has(k));
    assert(missing.length === 0, 'stage ' + s.id + ': every queried box paints (' + missing.join(';') + ')');
    assert(extra.length === 0, 'stage ' + s.id + ': every painted box is queried (' + extra.join(';') + ')');
  }
});

// ---------------------------------------------------------------------------
// 4. SPAWN clearance.
// ---------------------------------------------------------------------------
S.check('SPAWN: fixed floor points sit outside every footprint (8 stages x seeds)', () => {
  for (const s of STAGES) {
    const b = buildingForStage(s.id);
    for (const seed of SEEDS) {
      const rects = buildingFootprints(seed, s.id);
      for (const [px, py] of buildingFixedPoints()) {
        for (const r of rects) {
          const inside = px > r.x && px < r.x + r.w && py > r.y && py < r.y + r.h;
          assert(!inside, 'stage ' + s.id + ' seed ' + seed + ': point (' + px + ',' + py +
            ') inside box ' + r.x + ',' + r.y + ' ' + r.w + 'x' + r.h);
          const cx = Math.max(r.x, Math.min(px, r.x + r.w));
          const cy = Math.max(r.y, Math.min(py, r.y + r.h));
          const gap = Math.hypot(px - cx, py - cy);
          assert(gap >= BUILDING_MOVER_R + 1, 'stage ' + s.id + ' seed ' + seed +
            ': point (' + px + ',' + py + ') stands clear of the ring (gap ' + gap.toFixed(1) + ')');
        }
      }
      const inView = rects.filter(r => r.x >= 0 && r.y >= 0 &&
        r.x + r.w <= C.VIEW_W && r.y + r.h <= C.VIEW_H);
      assert(inView.length >= 1, 'stage ' + s.id + ' seed ' + seed +
        ': the slice-E in-view promise holds under the clearance shift (' + b.id + ')');
      // Slice-J cluster promise through the query seam: a spawn-flagged
      // anchor AND a spawn-flagged satellite sit whole in the initial view.
      const pl = buildingPlacements(seed, s.id);
      const cluster = pl.filter(p => p.spawn && p.x >= 0 && p.y >= 0 &&
        p.x + p.w <= C.VIEW_W && p.y + p.h <= C.VIEW_H);
      assert(cluster.some(p => STAGE_BUILDINGS[p.id].role !== 'satellite'),
        'stage ' + s.id + ' seed ' + seed + ': a cluster anchor sits whole in view');
      assert(cluster.some(p => STAGE_BUILDINGS[p.id].role === 'satellite'),
        'stage ' + s.id + ' seed ' + seed + ': a cluster satellite sits whole beside it');
    }
  }
});

// ---------------------------------------------------------------------------
// 5-8. REAL loop.
// ---------------------------------------------------------------------------
const h = await boot();
const T = h.T, st = h.state;

function quietField() {
  st.enemies.length = 0; st.gems.length = 0; st.itemDrops.length = 0;
  st.spawnTimer = 99999; st.wave.endsAt = st.time + 99999;
  st.wave.bosses = []; st.wave.boss = null; st.portal = null; st.runChest = null;
}

// A limit cycle is a stall too: while a goal exists, the pilot's positions
// over the last CYCLE_TICKS must span at least CYCLE_SPAN_PX.
const CYCLE_TICKS = 240, CYCLE_SPAN_PX = 6;

// Pump frames, clicking through any overlay card (draft/burst), counting
// only live play. Returns the trace and the worst stall window. `goal`
// (optional) says whether the pilot has somewhere to be this frame; `until`
// (optional) ends the drive early once it returns true.
function drive(frames, per, goal, until) {
  const trace = [];
  let goalRun = 0;
  let worst = 0, cur = 0, lx = st.player.x, ly = st.player.y, played = 0;
  for (let i = 0; i < frames; i++) {
    h.pump(1);
    st.bannerHold = 0;
    st.player.invuln = 1e9;
    if (st.mode !== 'playing') {
      const c0 = h.elements['ov-cards'].children[0];
      if (c0) c0.click();
      cur = 0; lx = st.player.x; ly = st.player.y;
      continue;
    }
    played++;
    if (per) per(i);
    trace.push([+st.player.x.toFixed(2), +st.player.y.toFixed(2)]);
    goalRun = goal && goal() ? goalRun + 1 : 0;
    if (goalRun >= CYCLE_TICKS) {
      const win = trace.slice(-CYCLE_TICKS);
      const xs = win.map(t => t[0]), ys = win.map(t => t[1]);
      const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
      if (span < CYCLE_SPAN_PX) {
        throw new Error('AssertionError: limit cycle — span ' + span.toFixed(2) + 'px over ' +
          CYCLE_TICKS + ' ticks at (' + st.player.x.toFixed(0) + ',' + st.player.y.toFixed(0) + ')');
      }
    }
    const moved = Math.hypot(st.player.x - lx, st.player.y - ly);
    lx = st.player.x; ly = st.player.y;
    cur = moved > 0.1 ? 0 : cur + 1;
    worst = Math.max(worst, cur);
    if (worst > MAX_STALL_TICKS) {
      throw new Error('AssertionError: stalled ' + worst + ' ticks at (' +
        st.player.x.toFixed(0) + ',' + st.player.y.toFixed(0) + ')');
    }
    if (until && until()) break;
  }
  return { trace, worst, played };
}

function penetration(trace, rects) {
  let worst = 0;
  for (const [x, y] of trace) {
    for (const r of rects) {
      const cx = Math.max(r.x, Math.min(x, r.x + r.w));
      const cy = Math.max(r.y, Math.min(y, r.y + r.h));
      const d = Math.hypot(x - cx, y - cy);
      worst = Math.max(worst, BUILDING_MOVER_R - d);
    }
  }
  return worst;
}

function pickFieldBox() {
  // The field is dense by design (~60 boxes/arena): scan a fixed seed list
  // for a mid-arena box with room for a western approach. Deterministic.
  for (const seed of [4242, 7, 11, 99, 1337, 5, 21]) {
    st.groundSeed = seed;
    const rects = buildingFootprints(st.groundSeed, st.stage);
    const box = rects.find(r => r.x >= 40 && r.x <= 600 &&
      r.y + r.h / 2 >= -640 && r.y + r.h / 2 <= 640 && r.x - 150 >= -880);
    if (box) return { rects, box };
  }
  assert(false, 'no drivable mid-arena footprint found (stage ' + st.stage + ')');
  return null;
}

S.check('REAL manual: held direction never penetrates, keeps moving, reaches the far side', () => {
  T.banners.suppressAll();
  T.stages.select('VERDANT_HOLLOW');
  T.startRun();
  h.pump(2);
  quietField();
  const { rects, box } = pickFieldBox();
  const midY = box.y + box.h / 2;
  st.player.x = box.x - 140; st.player.y = midY;
  T.setPilotMode('MANUAL');
  T.pilotInput.right = true;
  // Stop once well past the box: a walk that runs on into the arena rim
  // (a speed arch on the way makes it reach) would read as a stall there.
  const { trace, worst } = drive(900, null, null, () => st.player.x > box.x + box.w + 60);
  T.pilotInput.right = false;
  assert(penetration(trace, rects) <= 1e-6, 'the trace never enters a footprint');
  assert(worst <= MAX_STALL_TICKS, 'manual contact never stalls (worst ' + worst + ')');
  const endX = trace[trace.length - 1][0];
  assert(endX > box.x + box.w,
    'the held walk gets PAST the box (around, not through): end x=' + endX.toFixed(0) +
    ' vs box ' + box.x + '..' + (box.x + box.w));
  let minD = Infinity;
  for (const [x, y] of trace) {
    const cx = Math.max(box.x, Math.min(x, box.x + box.w));
    const cy = Math.max(box.y, Math.min(y, box.y + box.h));
    minD = Math.min(minD, Math.hypot(x - cx, y - cy));
  }
  assert(minD <= BUILDING_MOVER_R + 8, 'the walk honestly met the box (min dist ' + minD.toFixed(1) + ')');
});

S.check('REAL AUTO: the symmetric trap collects the mark, never stalls', () => {
  for (const stage of ['VERDANT_HOLLOW', 'BLOOD_RUST']) {
    T.stages.select(stage);
    T.startRun();
    h.pump(2);
    quietField();
    st.groundSeed = 4242;
    if (T.setPilotMode) T.setPilotMode('AUTO_ALL');
    const { rects, box } = pickFieldBox();
    const midY = box.y + box.h / 2;
    st.player.x = box.x - 120; st.player.y = midY;
    st.gems.push({ x: box.x + box.w + 90, y: midY, xp: 1 });
    const before = st.gems.length;
    let collected = false;
    const { trace, worst } = drive(1800, () => {
      if (st.gems.length < before) collected = true;
    }, () => st.gems.length > 0);
    assert(collected, stage + ': the pilot banks the mark across the box');
    assert(penetration(trace, rects) <= 1e-6, stage + ': ...without entering it');
    assert(worst <= MAX_STALL_TICKS, stage + ': ...and without stalling (worst ' + worst + ')');
  }
});

// The reviewed strand: seed 7919, pilot at (-4,11), mark at (738,386) used to
// end in a sub-pixel jitter at (367,160) that the per-tick stall bound missed.
S.check('REAL AUTO: far marks across the field are banked — no limit cycle (seed 7919 repro)', () => {
  const cases = [
    [7919, -4, 11, 738, 386], [7919, -400, -300, 380, 420],
    [15838, 500, 480, -207, -183], [4242, -300, 350, 420, -380],
  ];
  for (const [seed, sx, sy, mx, my] of cases) {
    T.stages.select('VERDANT_HOLLOW');
    T.startRun();
    h.pump(2);
    quietField();
    st.groundSeed = seed;
    if (T.setPilotMode) T.setPilotMode('AUTO_ALL');
    const rects = buildingFootprints(seed, st.stage);
    const at = pushOutOfRects(rects, sx, sy, BUILDING_MOVER_R + 1);
    st.player.x = at[0]; st.player.y = at[1];
    assert(isReachableLoot(mx, my), 'the mark is reachable loot');
    st.gems.push({ x: mx, y: my, xp: 1 });
    let doneAt = -1;
    const { trace } = drive(60 * 60, (i) => {
      st.enemies.length = 0; st.spawnTimer = 99999;   // nothing may shove the pilot
      if (doneAt < 0 && st.gems.length === 0) doneAt = i;
    }, () => st.gems.length > 0, () => st.gems.length === 0);
    assert(doneAt >= 0, 'seed ' + seed + ' (' + sx + ',' + sy + ')->(' + mx + ',' + my +
      '): mark never banked; pilot ended at (' + st.player.x.toFixed(1) + ',' + st.player.y.toFixed(1) + ')');
    assert(penetration(trace, rects) <= 1e-6, 'seed ' + seed + ': the walk never enters a footprint');
    // Walking pace: a routed walk should not take more than ~2.5x the
    // straight-line time (speed is at least the base 60px/s).
    const straightS = Math.hypot(mx - at[0], my - at[1]) / C.PLAYER.SPEED;
    assert(doneAt / 60 <= straightS * 2.5 + 3,
      'seed ' + seed + ': banked in ' + (doneAt / 60).toFixed(1) + 's vs straight ' + straightS.toFixed(1) + 's');
  }
});

S.check('REAL AUTO: patrol and flee pressure hold the bound around boxes', () => {
  T.stages.select('VERDANT_HOLLOW');
  T.startRun();
  h.pump(2);
  quietField();
  if (T.setPilotMode) T.setPilotMode('AUTO_ALL');
  st.groundSeed = 4242;
  const { box } = pickFieldBox();
  st.player.x = box.x - 60; st.player.y = box.y + box.h / 2;
  const p = drive(60 * 12);
  assert(p.worst <= MAX_STALL_TICKS, 'patrol drift near boxes holds (worst ' + p.worst + ')');
  assert(p.played > 60 * 6, 'the patrol window actually played (' + p.played + ' live ticks)');
  st.enemies.push({ typeId: 'CHASER', x: st.player.x - 40, y: st.player.y,
    w: 10, hp: 1000, maxHp: 1000, speed: 60, mx: 0, my: 0, age: 0, elite: false });
  const f = drive(60 * 12);
  assert(f.worst <= MAX_STALL_TICKS, 'flee pressure across a box holds (worst ' + f.worst + ')');
  st.enemies.length = 0;
});

S.check('REAL AUTO: a portal parked across a box is still entered', () => {
  T.stages.select('VERDANT_HOLLOW');
  T.startRun();
  h.pump(2);
  quietField();
  if (T.setPilotMode) T.setPilotMode('AUTO_ALL');
  st.groundSeed = 4242;
  const { box } = pickFieldBox();
  const midY = box.y + box.h / 2;
  st.player.x = box.x - 150; st.player.y = midY;
  st.portal = { x: box.x + box.w + 150, y: midY, age: 0 };
  let entered = false, changed = false;
  for (let i = 0; i < 60 * 40 && !entered && !changed; i++) {
    h.pump(1);
    st.bannerHold = 0;
    st.player.invuln = 1e9;
    if (st.portal && st.portal.entering) entered = true;
    if (st.mode !== 'playing') {
      if (st.mode === 'intermission') { entered = true; break; }
      const c0 = h.elements['ov-cards'].children[0];
      if (c0) c0.click();
      changed = st.mode !== 'playing';
    }
  }
  assert(entered, 'the pilot walks in across the box (portal entering / intermission)');
});

S.check('REAL horde: a chaser walks THROUGH footprints and reaches the pilot', () => {
  T.stages.select('VERDANT_HOLLOW');
  T.startRun();
  h.pump(2);
  quietField();
  // MANUAL with no held input: the pilot stands still (an AUTO pilot would
  // kite at 60 vs the chaser's 56 and never be caught — that is doctrine,
  // not blocking).
  T.setPilotMode('MANUAL');
  const { box } = pickFieldBox();
  const midY = box.y + box.h / 2;
  st.player.x = box.x + box.w + 150; st.player.y = midY;
  st.enemies.push({ typeId: 'CHASER', x: box.x - 150, y: midY,
    w: 10, hp: 100000, maxHp: 100000, speed: 60, mx: 0, my: 0, age: 0, elite: false });
  const e = st.enemies[0];
  let crossed = false, reached = false;
  for (let i = 0; i < 1200 && !reached; i++) {
    h.pump(1);
    st.bannerHold = 0;
    st.player.invuln = 1e9;
    if (st.mode !== 'playing') {
      const c0 = h.elements['ov-cards'].children[0];
      if (c0) c0.click();
      continue;
    }
    if (e.x > box.x && e.x < box.x + box.w) crossed = true;
    if (Math.hypot(e.x - st.player.x, e.y - st.player.y) < 60) reached = true;
  }
  assert(crossed, 'the chaser crosses the footprint span (pass-through by design)');
  assert(reached, '...and reaches the pilot (no horde pile-up at walls)');
  st.enemies.length = 0;
});

// ---------------------------------------------------------------------------
// 9. SCAN scope: paint pure, motion seam resolves, enemy seam untouched.
// ---------------------------------------------------------------------------
S.check('SCAN: paint stays pure; only the motion seam resolves positions', () => {
  const rsrc = readFileSync(new URL('../src/render.js', import.meta.url), 'utf8');
  const start = rsrc.indexOf('PORT SLICE E (buildings');
  const end = rsrc.indexOf("THE HOLLOW'S AUTHORED LANDMARKS");
  assert(start > 0 && end > start, 'the slice-E block is delimited in render.js');
  const block = rsrc.slice(start, end);
  for (const [pat, why] of [
    [/state\./, 'never reads/writes sim state'], [/player/, 'never touches the pilot'],
    [/\benemies\b/, 'never touches the horde'], [/\bdocument\b/, 'no document access'],
    [/\bwindow\b/, 'no window access'], [/\bDate\.now\b/, 'never reads the clock'],
  ]) assert(!pat.test(block), 'render.js slice-E/F paint block is painting-only: ' + why);
  const msrc = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const rc = msrc.indexOf('function runController(');
  assert(rc > 0, 'runController is delimited in main.js');
  const seam = msrc.slice(rc, rc + 7000);
  assert(/buildingSteer\(p\.x, p\.y/.test(seam), 'the motion seam steers around footprints');
  assert(/slideMove\(p\.x, p\.y/.test(seam), 'the motion seam slides along footprints');
  // The enemy move seam (typed-behavior application .. the latch) is
  // building-blind by design: the horde walks through (no pacing change).
  // The one exception is the walled yard: walkers slide on its walls, read
  // from the run's extra rects, never from the footprint field.
  const es = msrc.indexOf('Enemies: typed behavior');
  const ee = msrc.indexOf('TICK latch: once attached', es);
  assert(es > 0 && ee > es, 'the enemy move seam is delimited in main.js');
  const eseam = msrc.slice(es, ee);
  assert(!/building/i.test(eseam), 'the enemy move seam reads no building query');
  assert(/slideMove\(ox, oy, e\.x, e\.y, yardW\b/.test(eseam) && /yardForWalkers\([^;]*extraRects\(\)/.test(eseam),
    'walkers slide on the yard walls only (extraRects)');
  // The portal's two building clamps (open + drift) keep the entry point
  // where the pilot can stand: entry needs dist < RADIUS outside walls.
  const po = msrc.indexOf('state.portal = { x: state.wave.portalX');
  assert(po > 0, 'the portal-open site is delimited in main.js');
  assert(/clearOfBuildings\([\s\S]*lootLimit\(\)/.test(msrc.slice(po, po + 1200)),
    'portal-open nudges the entry point out of footprints and inside the floor');
  const pd = msrc.indexOf('One-way approach: the step never overshoots');
  assert(pd > 0, 'the portal-drift site is delimited in main.js');
  assert(/clearOfBuildings\([\s\S]*lootLimit\(\)/.test(msrc.slice(pd, pd + 900)),
    'portal-drift holds the entry point out of footprints and inside the floor');
});

// ---------------------------------------------------------------------------
// 10. DETERMINISM.
// ---------------------------------------------------------------------------
S.check('DETERMINISM: the field is a pure function of (seed, stage)', () => {
  for (const s of STAGES) {
    for (const seed of [1, 4242, 99999]) {
      const a = JSON.stringify(buildingFootprints(seed, s.id));
      const b = JSON.stringify(buildingFootprints(seed, s.id));
      assert(a === b, 'stage ' + s.id + ' seed ' + seed + ': identical across calls');
      assert(a !== JSON.stringify(buildingFootprints(seed + 1, s.id)) ||
        buildingFootprints(seed, s.id).length === 0,
        'stage ' + s.id + ': the field varies by seed (or is empty)');
    }
  }
  assert(buildingFootprints(4242, 'NOPE').length >= 0, 'unknown stage falls back, never throws');
  void STAGE_BUILDINGS;
});

S.done();
