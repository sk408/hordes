// PILOT STEERING (R1, 2026-11-18). Steve, playing on galaxy.click: "the pathing is causing
// the hero to jitter a bit too much ... and it shakes the screen around", then "maybe you
// should look at improving pilot pathing overall".
//
// What was wrong, measured over 48 real runs: the flee ran from the NEAREST enemy only, so
// between two threats it reversed on every frame (10 reversals a second, 59 in the worst
// second); pressed into a building corner it bounced in and out of it; its escape sweep
// took alternate sides on alternate frames. A flee that worked ran straight to the rim.
// The flee now scores 48 candidate headings every frame (context steering).
//
// The rules pinned here (src/controllers.js: STEER, fleeThreats, threatAt, fleeScores):
//   1. between threats the pilot slides out sideways, without one reversal;
//   2. a flee toward a wall turns along it before the rim, and rounds a corner;
//   3. BALANCED takes a gem that is on its way; SAFE does not; none toward the threat;
//   4. the flee heading turns at a limited rate;
//   5. a flee into a building face leaves along the face, without bouncing;
//   6. calm moves: the gem pick avoids a gem an enemy stands on, a calm walk bends round
//      a near threat, and leaving a flee is an arc;
//   7. live, seeded: a real EXPLORE run stays smooth and off the rim.
// Run: node test/test_pilot_steer.mjs
import assert from 'node:assert/strict';
import { AutoPilotController, STEER, HEADS, fleeThreats, threatAt, fleeScores } from '../src/controllers.js';
import { CONFIG as C } from '../src/config.js';
import { lootLimit } from '../src/entities.js';
import { buildingRects, slideMove, buildingTouchesDisc, BUILDING_MOVER_R } from '../src/stage_buildings.js';
import { straightClear } from '../src/pilot_nav.js';

let passed = 0;
const check = async (name, fn) => { await fn(); passed++; console.log('  ok - ' + name); };
const cfg = { KITE_DIST: 55 };            // BALANCED: flee inside 110 px, until 143 px
const foe = (x, y) => ({ x, y, typeId: 'CHASER', maxHp: 10, hp: 10 });
const HERO = 60, FOE = 40, DT = 1 / 60;   // px/s: the hero outruns the chasers

// Drive the real controller with a plain integrator: the hero walks its decision, every
// enemy chases the hero. Returns the trace and its counts.
function walk(c, p, enemies, gems, frames, extra = {}) {
  const st = { enemies, gems, time: 0, ...extra };
  const tr = [];
  for (let i = 0; i < frames; i++) {
    const d = c.decide(p, st, cfg);
    let nx = p.x + d.moveX * HERO * DT, ny = p.y + d.moveY * HERO * DT;
    if (extra.rects) { const s = slideMove(p.x, p.y, nx, ny, extra.rects, BUILDING_MOVER_R); nx = s[0]; ny = s[1]; }
    p.x = nx; p.y = ny;
    for (const e of enemies) {
      if (e.still) continue;
      const l = Math.hypot(p.x - e.x, p.y - e.y) || 1;
      e.x += (p.x - e.x) / l * FOE * DT; e.y += (p.y - e.y) / l * FOE * DT;
    }
    for (let j = gems.length - 1; j >= 0; j--) if (Math.hypot(gems[j].x - p.x, gems[j].y - p.y) < 22) { gems.splice(j, 1); st.taken = (st.taken || 0) + 1; }
    st.time += DT;
    tr.push({ x: p.x, y: p.y, mx: d.moveX, my: d.moveY, act: c.act });
  }
  let rev = 0, maxTurn = 0;
  for (let i = 2; i < tr.length; i++) {
    const ax = tr[i - 1].x - tr[i - 2].x, ay = tr[i - 1].y - tr[i - 2].y, bx = tr[i].x - tr[i - 1].x, by = tr[i].y - tr[i - 1].y;
    const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    if (la < 0.05 || lb < 0.05) continue;
    const cos = Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb)));
    if (cos < -0.5) rev++;
    if (tr[i].act === 'FLEE' && tr[i - 1].act === 'FLEE' && tr[i - 2].act === 'FLEE') maxTurn = Math.max(maxTurn, Math.acos(cos));
  }
  return { tr, rev, maxTurn, taken: st.taken || 0, st };
}
const nearest = (p, es) => Math.min(...es.map((e) => Math.hypot(e.x - p.x, e.y - p.y)));

// ---- 1. between two threats ----
await check('two threats at the same distance on opposite sides: the pilot slides out, with no reversal', () => {
  for (const d of [60, 90, 105]) {
    const p = { x: 0, y: 0 }, es = [foe(d, 0), foe(-d, 0)];
    const r = walk(new AutoPilotController(), p, es, [], 180);
    assert.equal(r.rev, 0, d + ' px: ' + r.rev + ' reversals (the old pilot reversed on every frame)');
    assert.ok(Math.abs(p.y) > 40, d + ' px: it left the line between them (y ' + p.y.toFixed(1) + ')');
    assert.ok(nearest(p, es) > Math.min(d + 5, 95), d + ' px: and it is not caught (' + nearest(p, es).toFixed(0) + ' px after 3 s)');
  }
});
await check('the scores: straight away from one threat; between two, the gaps win; no jump at the midpoint', () => {
  const best = (sc) => { let bi = 0; for (let i = 1; i < HEADS; i++) if (sc[i] > sc[bi]) bi = i; return bi * 360 / HEADS; };
  const at = (p, es) => fleeScores(p, fleeThreats(p, { enemies: es }, es[0], 143), 1e9);
  assert.equal(best(at({ x: 0, y: 0 }, [foe(50, 0)])), 180, 'one threat east: west');
  assert.equal(best(at({ x: 0, y: 0 }, [foe(0, -50)])), 90, 'one threat at -y: +y');
  const mid = at({ x: 0, y: 0 }, [foe(80, 0), foe(-80, 0)]);
  assert.ok([90, 270].includes(best(mid)), 'two threats east and west: north or south (' + best(mid) + ')');
  assert.ok(mid[HEADS / 4] - mid[0] > 0.45, 'and the gap beats a heading at either threat by half a point');
  // The threats' say changes smoothly as the hero steps across the midpoint.
  const es = [foe(80, 30), foe(-80, 30)];
  let prev = null, worst = 0;
  for (let x = -6; x <= 6; x += 0.5) {
    const p = { x, y: 0 };
    const v = threatAt(fleeThreats(p, { enemies: es }, es[0], 143), 0, -1);
    if (prev) worst = Math.max(worst, Math.abs(v[0] - prev[0]) + Math.abs(v[1] - prev[1]));
    prev = v;
  }
  assert.ok(worst < 0.02, 'half a pixel changes the score of a heading by under 0.02 (' + worst.toFixed(4) + ')');
  // Two equal ways out: the one nearer the heading already taken wins (no dithering).
  const tie = (prev) => best(fleeScores({ x: 0, y: 0 }, fleeThreats({ x: 0, y: 0 }, { enemies: [foe(80, 0), foe(-80, 0)] }, null, 143), 1e9, { prev }));
  assert.deepEqual([tie([0, 1]), tie([0, -1])], [90, 270], 'the tie goes to the side already taken');
  // No enemy inside the band: the nearest alone.
  const far = foe(0, 300);
  assert.deepEqual(threatAt(fleeThreats({ x: 0, y: 0 }, { enemies: [far] }, far, 143), 0, -1), [1, 0]);
});

// ---- 2. walls and corners ----
const L = lootLimit();
await check('a flee toward a wall turns along it before the rim, and keeps moving', () => {
  const p = { x: L - 320, y: 0 };
  const es = [foe(p.x - 80, 0), foe(p.x - 95, 25), foe(p.x - 95, -25)];
  const r = walk(new AutoPilotController(), p, es, [], 900);
  const maxX = Math.max(...r.tr.map((q) => q.x));
  assert.ok(maxX < L - 15, 'never reaches the working rim (closest ' + (L - maxX).toFixed(0) + ' px; the old flee ground along it)');
  const tail = r.tr.slice(-180);
  const moved = Math.hypot(tail[tail.length - 1].x - tail[0].x, tail[tail.length - 1].y - tail[0].y);
  assert.ok(moved > 80, 'still making ground in the last 3 s (' + moved.toFixed(0) + ' px)');
  assert.ok(r.rev <= 2, r.rev + ' reversals in 15 s');
  assert.ok(nearest(p, es) > 60, 'not caught (' + nearest(p, es).toFixed(0) + ' px)');
});
await check('a flee into a corner rounds it instead of parking there', () => {
  const p = { x: L - 300, y: L - 300 };
  const es = [foe(p.x - 70, p.y - 70), foe(p.x - 95, p.y - 60), foe(p.x - 60, p.y - 95)];
  const r = walk(new AutoPilotController(), p, es, [], 1200);
  const inCorner = r.tr.filter((q) => q.x > L - 60 && q.y > L - 60).length;
  assert.equal(inCorner, 0, inCorner + ' frames inside the corner');
  const stalls = [];
  for (let i = 120; i < r.tr.length; i += 60) stalls.push(Math.hypot(r.tr[i].x - r.tr[i - 120].x, r.tr[i].y - r.tr[i - 120].y));
  assert.ok(Math.min(...stalls) > 25, 'every 2 s window makes ground (least ' + Math.min(...stalls).toFixed(0) + ' px)');
  assert.ok(r.rev <= 3, r.rev + ' reversals in 20 s');
});
await check('mid-field the centre pull is nothing; at the rim it matches the flee', () => {
  // A hero at the centre flees straight away; one near the rim, fleeing outward, bends inward.
  let d = new AutoPilotController().decide({ x: 0, y: 0 }, { enemies: [foe(-80, 0)], gems: [], time: 0 }, cfg);
  assert.ok(Math.abs(d.moveX - 1) < 1e-6 && Math.abs(d.moveY) < 1e-6, 'centre: straight away');
  d = new AutoPilotController().decide({ x: L - 100, y: 300 }, { enemies: [foe(L - 180, 300)], gems: [], time: 0 }, cfg);
  assert.ok(d.moveX < 0.5 && d.moveY < -0.5, 'near the east wall: it turns along the wall, toward the centre side (' + d.moveX.toFixed(2) + ', ' + d.moveY.toFixed(2) + ')');
});

// ---- 3. gems on the way ----
await check('BALANCED takes a gem that is on its way; SAFE does not; a gem toward the threat is left', () => {
  const run = (stance, gem) => {
    const c = new AutoPilotController(); c.stance = stance;
    const p = { x: 0, y: 0 }, gems = [gem];
    const es = [foe(stance === 'SAFE' ? -150 : -80, 0)];
    const r = walk(c, p, es, gems, 150);
    return { taken: r.taken, y: Math.max(...r.tr.map((q) => Math.abs(q.y))) };
  };
  assert.equal(run('BALANCED', { x: 60, y: 45 }).taken, 1, 'BALANCED bends to a gem 45 px off its line');
  const safe = run('SAFE', { x: 60, y: 45 });
  assert.ok(safe.taken === 0 && safe.y < 1, 'SAFE holds its line');
  const back = run('BALANCED', { x: -40, y: 30 });
  assert.ok(back.taken === 0 && back.y < 1, 'a gem on the threat side does not bend the flee');
  const farGem = run('BALANCED', { x: 60, y: STEER.GEM_R + 60 });
  assert.equal(farGem.taken, 0, 'nor one out of reach');
  // A nearer gem on the threat side does not take the place of one that is on the way.
  const c = new AutoPilotController();
  const p = { x: 0, y: 0 }, behind = { x: -30, y: 20 }, ahead = { x: 60, y: 45 };
  const r = walk(c, p, [foe(-80, 0)], [behind, ahead], 150);
  assert.ok(r.taken >= 1 && r.st.gems.includes(behind) && !r.st.gems.includes(ahead), 'the gem ahead is taken, the one behind is left');
});
await check('the gem the flee bends to is kept, with slack, until it is out of reach', () => {
  const c = new AutoPilotController();
  const gem = { x: 80, y: 30 };
  const st = { enemies: [foe(-80, 0)], gems: [gem], time: 0 };
  c.decide({ x: 0, y: 0 }, st, cfg);
  assert.equal(c.fleeGem, gem, 'picked inside GEM_R');
  const at = (k) => { const l = Math.hypot(80, 30); gem.x = 80 / l * STEER.GEM_R * k; gem.y = 30 / l * STEER.GEM_R * k; st.time += DT; c.decide({ x: 0, y: 0 }, st, cfg); return c.fleeGem; };
  assert.equal(at(1.2), gem, 'kept at 1.2 x GEM_R (a fresh pick stops at 1.0)');
  assert.equal(new AutoPilotController().decide({ x: 0, y: 0 }, st, cfg) && null, null);
  const fresh = new AutoPilotController(); fresh.decide({ x: 0, y: 0 }, st, cfg);
  assert.equal(fresh.fleeGem, null, 'a fresh pilot does not pick it at 1.2 x');
  assert.equal(at(1.4), null, 'dropped past 1.3 x');
});
await check('two gems either side of the flee line: one is kept, no weaving', () => {
  const c = new AutoPilotController();
  const p = { x: 0, y: 0 }, gems = [{ x: 70, y: 40 }, { x: 70, y: -40 }];
  const r = walk(c, p, gems.length ? [foe(-80, 0)] : [], gems, 90);
  let flips = 0;
  for (let i = 1; i < r.tr.length; i++) if (Math.abs(r.tr[i].my) > 0.05 && Math.abs(r.tr[i - 1].my) > 0.05 && Math.sign(r.tr[i].my) !== Math.sign(r.tr[i - 1].my)) flips++;
  assert.ok(flips <= 1, flips + ' side changes');
  assert.ok(r.taken >= 1, 'and it takes one');
});

// ---- 4. the turn rate ----
await check('the flee heading turns at most STEER.TURN rad/s: a half turn takes about 0.3 s', () => {
  const c = new AutoPilotController();
  const p = { x: 0, y: 0 }, e = foe(-80, 0); e.still = true;
  const st = { enemies: [e], gems: [], time: 0 };
  for (let i = 0; i < 30; i++) { c.decide(p, st, cfg); st.time += DT; }
  e.x = 80;                                        // the threat is suddenly on the other side
  const heads = [];
  for (let i = 0; i < 40; i++) { const d = c.decide(p, st, cfg); st.time += DT; heads.push(Math.atan2(d.moveY, d.moveX)); }
  let worst = 0;
  for (let i = 1; i < heads.length; i++) { let a = Math.abs(heads[i] - heads[i - 1]); if (a > Math.PI) a = 2 * Math.PI - a; worst = Math.max(worst, a); }
  assert.ok(worst <= STEER.TURN * DT + 1e-6, 'no step turns more than ' + (STEER.TURN * DT).toFixed(3) + ' rad (' + worst.toFixed(3) + ')');
  const done = heads.findIndex((a) => Math.abs(Math.abs(a) - Math.PI) < 0.05);
  const want = Math.PI / (STEER.TURN * DT);
  assert.ok(done >= want - 2 && done <= want + 2, 'it faces away after ' + done + ' frames (about ' + Math.round(want) + ')');
});

// ---- 5. a building in the way ----
await check('a flee into a building face leaves along the face, without bouncing', () => {
  // The first stage and seed whose field has a footprint with clear ground to its west.
  let found = null;
  for (let seed = 1; seed < 40 && !found; seed++) {
    const rects = buildingRects(seed, 'VERDANT_HOLLOW');
    for (const q of rects) {
      const px = q.x - BUILDING_MOVER_R - 3, py = q.y + q.h / 2;
      if (q.h >= 30 && Math.abs(px) < L - 250 && Math.abs(py) < L - 250 && !buildingTouchesDisc(rects, px, py, BUILDING_MOVER_R) &&
        !buildingTouchesDisc(rects, px - 60, py, 20)) { found = { seed, rects, q, px, py }; break; }
    }
  }
  assert.ok(found, 'a footprint to test against');
  const p = { x: found.px, y: found.py };
  const es = [foe(p.x - 70, p.y)];
  // The best heading (straight away, into the face) and its neighbours for 80 degrees either
  // side are blocked: the pilot must look past them, and never walk at the building.
  const probe = new AutoPilotController();
  const d0 = probe.decide({ x: p.x, y: p.y }, { enemies: [foe(p.x - 70, p.y)], gems: [], time: 0, groundSeed: found.seed, stage: 'VERDANT_HOLLOW' }, cfg);
  assert.equal(probe.act, 'FLEE');
  assert.ok(straightClear(found.rects, p.x, p.y, p.x + d0.moveX * 40, p.y + d0.moveY * 40), 'the flee heading is a clear line (' + d0.moveX.toFixed(2) + ', ' + d0.moveY.toFixed(2) + ')');
  assert.ok(d0.moveX < 0.5, 'not into the face');
  const r = walk(new AutoPilotController(), p, es, [], 240, { groundSeed: found.seed, stage: 'VERDANT_HOLLOW', rects: found.rects });
  assert.ok(r.rev <= 2, r.rev + ' reversals against the face (the old flee bounced on every frame)');
  assert.ok(Math.hypot(p.x - found.px, p.y - found.py) > 60, 'it got away from the spot (' + Math.hypot(p.x - found.px, p.y - found.py).toFixed(0) + ' px)');
  assert.ok(nearest(p, es) > 50, 'and from the threat (' + nearest(p, es).toFixed(0) + ' px)');
});

// ---- 6. calm moves ----
await check('the calm gem pick: the nearest gem no enemy stands on; the nearest of all when every gem is crowded', () => {
  const near = { x: 150, y: 0 }, far = { x: -180, y: 0 };
  const guard = foe(210, 0);                       // 210 px away (outside the kite band), 60 px from the near gem
  let c = new AutoPilotController();
  let d = c.decide({ x: 0, y: 0 }, { enemies: [guard], gems: [near, far], time: 0 }, cfg);
  assert.equal(c.gem, far, 'the free gem, though the guarded one is nearer');
  assert.ok(d.moveX < 0);
  c = new AutoPilotController();
  c.decide({ x: 0, y: 0 }, { enemies: [guard], gems: [near], time: 0 }, cfg);
  assert.equal(c.gem, near, 'only a guarded gem: it is still taken (as before)');
  c = new AutoPilotController();
  c.decide({ x: 0, y: 0 }, { enemies: [], gems: [near, far], time: 0 }, cfg);
  assert.equal(c.gem, near, 'no enemy: the nearest');
});
await check('a calm walk bends round a threat that is near but outside the kite line', () => {
  // The only gem lies straight behind an enemy 160 px away (the kite band ends at 143).
  const c = new AutoPilotController();
  const e = foe(160, 0); e.still = true;
  const st = { enemies: [e], gems: [{ x: 320, y: 0 }], time: 0 };
  let d = null;
  for (let i = 0; i < 30; i++) { d = c.decide({ x: 0, y: 0 }, st, cfg); st.time += DT; }
  assert.equal(c.act, 'LOOT');
  const l = Math.hypot(d.moveX, d.moveY);
  assert.ok(d.moveX / l < 0.9 && d.moveX > 0, 'it heads for the gem at an angle, not straight at the enemy (cos ' + (d.moveX / l).toFixed(2) + ')');
  // With no clock (a unit probe) the move is exactly the asked one.
  d = new AutoPilotController().decide({ x: 0, y: 0 }, { enemies: [e], gems: [{ x: 320, y: 0 }] }, cfg);
  assert.deepEqual([d.moveX, d.moveY], [1, 0]);
});
await check('leaving a flee is an arc: no step turns more than the turn rate allows', () => {
  const c = new AutoPilotController();
  const p = { x: 0, y: 0 }, e = foe(-90, 0), gems = [{ x: -300, y: 0 }];
  const st = { enemies: [e], gems, time: 0 };
  const heads = [];
  for (let i = 0; i < 90; i++) {
    if (i === 30) st.enemies = [];                 // the threat dies: the gem is straight behind the flee
    const d = c.decide(p, st, cfg);
    const l = Math.hypot(d.moveX, d.moveY);
    if (l > 0) { heads.push(Math.atan2(d.moveY, d.moveX)); p.x += d.moveX * HERO * DT; p.y += d.moveY * HERO * DT; }
    st.time += DT;
  }
  let worst = 0;
  for (let i = 1; i < heads.length; i++) { let a = Math.abs(heads[i] - heads[i - 1]); if (a > Math.PI) a = 2 * Math.PI - a; worst = Math.max(worst, a); }
  assert.ok(worst <= STEER.TURN * DT + 1e-6, 'largest turn in one frame ' + worst.toFixed(3) + ' rad (limit ' + (STEER.TURN * DT).toFixed(3) + ')');
  assert.ok(Math.cos(heads[heads.length - 1]) < -0.95, 'and it ends up walking at the gem');
});

// ---- 7. live: a real EXPLORE run under a fixed seed ----
// The seeded generator of test/_seed_random.mjs, set here so the run is the same every time.
function seedRandom(seed) {
  let a = seed | 0;
  Math.random = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
await check('live, seed 6: 25 s of a real EXPLORE run is smooth and stays off the rim', async () => {
  const realRandom = Math.random;
  seedRandom(6);
  const { boot } = await import('./_harness.mjs');
  const h = await boot({ storage: [['hordes_onboarded', '1'], ['hordes_tour_draft', '1']] });
  const T = h.T, st = h.state;
  T.setPilotMode('EXPLORE');
  T.startRun();
  h.pump(2);
  const tr = [];
  for (let i = 0; i < 25 * 60; i++) {
    if (st.player) st.player.hp = st.player.stats.maxHp;          // the walk is the subject, not the fight
    if (st.mode === 'draft' || st.mode === 'evolve') { const c0 = h.elements['ov-cards'].children[0]; if (c0) c0.click(); }
    h.pump(1);
    if (st.mode === 'playing' && st.player) tr.push({ x: st.player.x, y: st.player.y, cx: st.cam.x, cy: st.cam.y });
  }
  Math.random = realRandom;
  let rev = 0, camRev = 0, rim = 0, worst = 0;
  const flip = [];
  for (let i = 2; i < tr.length; i++) {
    const ax = tr[i - 1].x - tr[i - 2].x, ay = tr[i - 1].y - tr[i - 2].y, bx = tr[i].x - tr[i - 1].x, by = tr[i].y - tr[i - 1].y;
    const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    const f = la > 0.05 && lb > 0.05 && (ax * bx + ay * by) / (la * lb) < -0.5 ? 1 : 0;
    rev += f; flip.push(f);
    for (const k of ['cx', 'cy']) {
      const d1 = tr[i - 1][k] - tr[i - 2][k], d2 = tr[i][k] - tr[i - 1][k];
      if (Math.abs(d1) > 0.2 && Math.abs(d2) > 0.2 && Math.sign(d1) !== Math.sign(d2)) camRev++;
    }
    if (Math.max(Math.abs(tr[i].x), Math.abs(tr[i].y)) > C.GROUND.RIM - 120) rim++;
  }
  for (let i = 60; i <= flip.length; i++) { let s = 0; for (let j = i - 60; j < i; j++) s += flip[j]; worst = Math.max(worst, s); }
  const secs = tr.length / 60;
  assert.ok(tr.length > 20 * 60, 'the run played (' + tr.length + ' frames)');
  // Before the fix this seed gave 162 reversals in 40 s, 60 in its worst second.
  assert.ok(rev / secs < 0.6, 'reversals a second: ' + (rev / secs).toFixed(2));
  assert.ok(worst <= 8, 'worst second: ' + worst + ' reversals');
  assert.ok(camRev / secs < 3, 'camera reversals a second: ' + (camRev / secs).toFixed(2));
  assert.ok(rim / tr.length < 0.1, 'share of the run within 120 px of the rim: ' + (100 * rim / tr.length).toFixed(0) + '%');
});

console.log('test_pilot_steer: ' + passed + ' checks passed');
