// HORDES - PORT SLICE F evidence: headless position traces proving contact.
// Run: node tools/capture_slice_f.mjs
// Writes docs/art/port-slice-f/traces.json (numeric position dumps — the
// brief prefers numbers over pixels for "blocked").
//
// Three scenarios through the REAL loop (test/_harness.mjs boot of the live
// src/main.js, same seams the suite drives):
//   A. MANUAL held-east across a footprint: every frame recorded; asserts
//      (in the log) no penetration + reaches the far side.
//   B. AUTO symmetric mark across a footprint: records until the mark is
//      banked; asserts worst stall window + collection frame.
//   C. AUTO portal across a footprint: records pilot+portal to entry.
// Reproduce: the scenarios mirror test/test_building_collision.mjs; seeds,
// stage and start spots are recorded per trace.
import { mkdirSync, writeFileSync } from 'node:fs';
import { boot } from '../test/_harness.mjs';
import { buildingFootprints, slideMove, BUILDING_MOVER_R } from '../src/stage_buildings.js';

const ART = 'docs/art/port-slice-f';
mkdirSync(ART, { recursive: true });

const h = await boot();
const T = h.T, st = h.state;
T.banners.suppressAll();

function quietField() {
  st.enemies.length = 0; st.gems.length = 0; st.itemDrops.length = 0;
  st.spawnTimer = 99999; st.wave.endsAt = st.time + 99999;
  st.wave.bosses = []; st.wave.boss = null; st.portal = null; st.runChest = null;
}
function clickThrough() {
  if (st.mode !== 'playing') {
    const c0 = h.elements['ov-cards'].children[0];
    if (c0) c0.click();
    return false;
  }
  return true;
}
function nearestDist(x, y, rects) {
  let m = Infinity;
  for (const r of rects) {
    const cx = Math.max(r.x, Math.min(x, r.x + r.w));
    const cy = Math.max(r.y, Math.min(y, r.y + r.h));
    m = Math.min(m, Math.hypot(x - cx, y - cy));
  }
  return m;
}

const out = { scenarios: [] };

// ---- A: MANUAL held-east across the forced box ------------------------------
T.stages.select('VERDANT_HOLLOW');
T.startRun();
h.pump(2);
quietField();
st.groundSeed = 4242;
{
  const rects = buildingFootprints(st.groundSeed, st.stage);
  const box = rects.find(r => r.x >= 40 && r.x <= 600);
  const midY = box.y + box.h / 2;
  st.player.x = box.x - 140; st.player.y = midY;
  T.setPilotMode('MANUAL');
  T.pilotInput.right = true;
  const trace = [];
  let pen = 0, worst = 0, cur = 0, lx = st.player.x, ly = st.player.y;
  for (let i = 0; i < 900; i++) {
    h.pump(1);
    st.bannerHold = 0; st.player.invuln = 1e9;
    if (!clickThrough()) { cur = 0; lx = st.player.x; ly = st.player.y; continue; }
    trace.push([+st.player.x.toFixed(1), +st.player.y.toFixed(1)]);
    pen = Math.max(pen, 7 - nearestDist(st.player.x, st.player.y, rects));
    const moved = Math.hypot(st.player.x - lx, st.player.y - ly);
    lx = st.player.x; ly = st.player.y;
    cur = moved > 0.1 ? 0 : cur + 1;
    worst = Math.max(worst, cur);
    if (st.player.x > box.x + box.w + 30) break;
  }
  T.pilotInput.right = false;
  // Thin to every 10th frame for the file (full cadence in the suite).
  const thin = trace.filter((_, i) => i % 10 === 0);
  out.scenarios.push({
    id: 'A-manual-held-east', stage: st.stage, seed: st.groundSeed,
    box, start: [box.x - 140, midY], end: trace[trace.length - 1],
    frames: trace.length, maxPenetrationPx: +pen.toFixed(3),
    worstStallTicks: worst,
    minDistToBox: +Math.min(...trace.map(([x, y]) => nearestDist(x, y, [box]))).toFixed(2),
    traceEvery10th: thin,
  });
  console.log('A: end', JSON.stringify(trace[trace.length - 1]), 'pen', pen.toFixed(3), 'worst', worst);
}

// ---- B: AUTO symmetric mark --------------------------------------------------
T.stages.select('VERDANT_HOLLOW');
T.startRun();
h.pump(2);
quietField();
T.setPilotMode('AUTO_ALL');
st.groundSeed = 4242;
{
  const rects = buildingFootprints(st.groundSeed, st.stage);
  const box = rects.find(r => r.x >= 40 && r.x <= 600);
  const midY = box.y + box.h / 2;
  st.player.x = box.x - 120; st.player.y = midY;
  st.gems.push({ x: box.x + box.w + 90, y: midY, xp: 1 });
  const trace = [];
  let worst = 0, cur = 0, lx = st.player.x, ly = st.player.y, collectedAt = -1;
  for (let i = 0; i < 1800; i++) {
    h.pump(1);
    st.bannerHold = 0; st.player.invuln = 1e9;
    if (!clickThrough()) { cur = 0; lx = st.player.x; ly = st.player.y; continue; }
    if (i % 5 === 0) trace.push([+st.player.x.toFixed(1), +st.player.y.toFixed(1)]);
    const moved = Math.hypot(st.player.x - lx, st.player.y - ly);
    lx = st.player.x; ly = st.player.y;
    cur = moved > 0.1 ? 0 : cur + 1;
    worst = Math.max(worst, cur);
    if (st.gems.length === 0) { collectedAt = i; break; }
  }
  out.scenarios.push({
    id: 'B-auto-symmetric-mark', stage: st.stage, seed: st.groundSeed,
    box, start: [box.x - 120, midY], collectedAtFrame: collectedAt,
    worstStallTicks: worst, traceEvery5th: trace,
  });
  console.log('B: collectedAt', collectedAt, 'worst', worst);
}

// ---- C: AUTO portal across ----------------------------------------------------
T.stages.select('VERDANT_HOLLOW');
T.startRun();
h.pump(2);
quietField();
T.setPilotMode('AUTO_ALL');
st.groundSeed = 4242;
{
  const rects = buildingFootprints(st.groundSeed, st.stage);
  const box = rects.find(r => r.x >= 40 && r.x <= 600);
  const midY = box.y + box.h / 2;
  st.player.x = box.x - 150; st.player.y = midY;
  st.portal = { x: box.x + box.w + 150, y: midY, age: 0 };
  const trace = [];
  let enteredAt = -1;
  for (let i = 0; i < 2400; i++) {
    h.pump(1);
    st.bannerHold = 0; st.player.invuln = 1e9;
    if (i % 10 === 0 && st.portal) {
      trace.push({
        f: i,
        p: [+st.player.x.toFixed(1), +st.player.y.toFixed(1)],
        o: [+st.portal.x.toFixed(1), +st.portal.y.toFixed(1)],
        d: +Math.hypot(st.portal.x - st.player.x, st.portal.y - st.player.y).toFixed(1),
      });
    }
    if (st.portal && st.portal.entering) { enteredAt = i; break; }
    if (st.mode === 'intermission') { enteredAt = i; break; }
    if (st.mode !== 'playing') clickThrough();
  }
  out.scenarios.push({
    id: 'C-auto-portal-across', stage: st.stage, seed: st.groundSeed,
    box, start: [box.x - 150, midY], enteredAtFrame: enteredAt, samplesEvery10th: trace,
  });
  console.log('C: enteredAt', enteredAt);
}

// ---- D: pure slide edge-stop (unit level, exact numbers) --------------------
// Nose-on +1px frames into box [100,-50,80,100]: halts at rect.x - ring.
{
  const R = [{ x: 100, y: -50, w: 80, h: 100 }];
  let x = 0;
  const trace = [[0, 0]];
  for (let i = 0; i < 200; i++) {
    const s = slideMove(x, 0, x + 1, 0, R, BUILDING_MOVER_R);
    x = s[0];
    if (i % 10 === 0) trace.push([+x.toFixed(1), 0]);
  }
  trace.push([+x.toFixed(1), 0]);
  out.scenarios.push({
    id: 'D-pure-slide-edge-stop', ring: BUILDING_MOVER_R,
    box: R[0], haltX: +x.toFixed(3), expectHaltX: 100 - BUILDING_MOVER_R,
    traceEvery10th: trace,
  });
  console.log('D: haltX', x.toFixed(3));
}

writeFileSync(ART + '/traces.json', JSON.stringify(out, null, 1) + '\n');
console.log('wrote ' + ART + '/traces.json');
