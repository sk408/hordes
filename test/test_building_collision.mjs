// HORDES — PORT SLICE F: building-collision tests (owner-ruled 2026-09-22).
//
// WHAT THIS PINS (through the REAL loop wherever motion is involved):
//   1. UNIT slide — a head-on walk stops at the footprint edge (position
//      stops at rect.x - ring, never penetrates); a diagonal keeps moving;
//      free motion is untouched; the nose-on redirect moves a full stride.
//   2. UNIT steer — open-field intent is byte-identical; a blocked ray
//      commits to the most intent-aligned corner (the anti-cycle fix).
//   3. AGREEMENT — every painted building footprint equals a queried one
//      and back (paint and blocking agree box for box), 8 stages.
//   4. SPAWN — the run's fixed floor points ( footing, first-run draught,
//      milestone chest slot) sit outside every footprint with room for the
//      mover ring, 8 stages x seeds; the slice-E in-view promise still holds.
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
import {
  STAGE_BUILDINGS, buildingForStage,
  buildingFootprints, buildingFixedPoints, slideMove, buildingSteer, pushOutOfRects,
  BUILDING_MOVER_R, BUILDING_STEER_LOOK,
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

// ---------------------------------------------------------------------------
// 3. AGREEMENT paint == query.
// ---------------------------------------------------------------------------
S.check('AGREEMENT: every painted footprint equals a queried one and back (8 stages)', () => {
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
    const want = buildingForStage(s.id).id;
    const queried = buildingFootprints(4242, s.id).map(r => r.x + ',' + r.y);
    const painted = new Set();
    for (let cx = -900; cx <= 900; cx += 96) {
      for (let cy = -900; cy <= 900; cy += 96) {
        const { R, ctx } = mk();
        R.drawLandmarks(ctx, 4242, { x: cx, y: cy }, groundTheme(1), s.id);
        for (const l of R.landmarks) {
          if (l.kind === want) painted.add(l.x + ',' + l.y);
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

// Pump frames, clicking through any overlay card (draft/burst), counting
// only live play. Returns the trace and the worst stall window.
function drive(frames, per) {
  const trace = [];
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
    const moved = Math.hypot(st.player.x - lx, st.player.y - ly);
    lx = st.player.x; ly = st.player.y;
    cur = moved > 0.1 ? 0 : cur + 1;
    worst = Math.max(worst, cur);
    if (worst > MAX_STALL_TICKS) {
      throw new Error('AssertionError: stalled ' + worst + ' ticks at (' +
        st.player.x.toFixed(0) + ',' + st.player.y.toFixed(0) + ')');
    }
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
  // The field is sparse by design (~3 boxes/arena): scan a fixed seed list
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
  const { trace, worst } = drive(900);
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
    });
    assert(collected, stage + ': the pilot banks the mark across the box');
    assert(penetration(trace, rects) <= 1e-6, stage + ': ...without entering it');
    assert(worst <= MAX_STALL_TICKS, stage + ': ...and without stalling (worst ' + worst + ')');
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
  const es = msrc.indexOf('Enemies: typed behavior');
  const ee = msrc.indexOf('TICK latch', es);
  assert(es > 0 && ee > es, 'the enemy move seam is delimited in main.js');
  const eseam = msrc.slice(es, ee);
  assert(!/building/i.test(eseam), 'the enemy move seam reads no building query');
  // The portal's two building clamps (open + drift) keep the entry point
  // where the pilot can stand: entry needs dist < RADIUS outside walls.
  const po = msrc.indexOf('state.portal = { x: state.wave.portalX');
  assert(po > 0, 'the portal-open site is delimited in main.js');
  assert(/pushOutOfRects\(/.test(msrc.slice(po, po + 900)),
    'portal-open nudges the entry point out of footprints');
  const pd = msrc.indexOf('One-way approach: the step never overshoots');
  assert(pd > 0, 'the portal-drift site is delimited in main.js');
  assert(/pushOutOfRects\(/.test(msrc.slice(pd, pd + 900)),
    'portal-drift holds the entry point out of footprints');
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
