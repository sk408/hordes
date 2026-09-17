// HORDES — BLOCKING ELEVATION (prototype 2026-09-17, owner directive
// msg_01M2RK5B: "let's prototype elevation. Honestly I feel like we need to
// just add it in and then work on getting it right").
//
// Elevation has to BLOCK A MOVER or it is not elevation: the VERDANT HOLLOW
// (the default stage, ONLY) carries an authored rim-wall ring — band
// [700,760] raised to topLevel 2, four gate terraces (level 1) at the
// cardinals, aligned with the authored GATE landmark stones — and ONE cliff
// rule: a step of >=2 levels blocks, a 1-level step is a ramp. The other
// seven stages ship no wall (their terrain is byte-identical).
//
// Proven here, in the directive's own non-negotiable order:
//   GEOMETRY     the wall band, gates and composite level are pinned; only
//                VERDANT carries a wall
//   NO TRAP      the natural lattice can never produce a 2-level step in one
//                move (Lipschitz), so blocking happens only at the authored
//                band edges — and a flood fill over the composite field is
//                fully connected for every seed tried
//   SAME RULE    one geometry function (reliefStep) for pilot and horde; the
//                gateward slide never stalls; a live enemy funnels through a
//                gate to a pilot at the heart
//   AUTO + NIGHT the AUTO pilot routes around the wall to a beyond-wall gem
//                unattended, and a NIGHT run clears the wave + auto-continues
//   CAMERA       the deadzone follow keeps the pilot on screen at both
//                elevations (the ground plane stays visible)
//   ANTI-        the wall top is a DELAY, not a sanctuary: the disarmed
//   SANCTUARY    park-and-measure (the arena-scaleup guard shape) reports
//                contact-while-high vs contact-while-flat WITH NUMBERS; the
//                hard assertion is that the horde REACHES the wall top at all
//                (the V1 imbalance is reported, not tuned — no constants move)
import { suite, boot } from './_harness.mjs';
import { CONFIG as C } from '../src/config.js';
import { STAGES, stageRelief, STAGE_BY_ID } from '../src/stages.js';
import {
  reliefLevel, reliefLevelAt, reliefBlocked, reliefStep, wallLevelAt,
} from '../src/relief.js';
import { buyUpgrade, SHOP_UPGRADES } from '../src/meta.js';

const S = suite('test_blocking_elevation');
function assert(cond, msg) { if (!cond) throw new Error('AssertionError: ' + msg); }
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const h = await boot();
const T = h.T, st = h.state;
const CARDINALS = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
const angDistTo = (theta, g) => Math.atan2(Math.sin(theta - g), Math.cos(theta - g));
const nearestGateDist = (theta) =>
  Math.min(...STAGE_BY_ID.VERDANT_HOLLOW.relief.WALL.gaps.map(g => Math.abs(angDistTo(theta, g))));

function quietField() {
  st.enemies.length = 0; st.gems.length = 0; st.itemDrops.length = 0;
  st.spawnTimer = 999; st.wave.endsAt = st.time + 9999;
  st.wave.bosses = []; st.wave.boss = null; st.portal = null;
}
// Resolve the overlays a real AUTO run meets, and zero the token-banner hold
// (a kill's EVOLUTION_TOKEN would pause update() mid-measurement — the
// disclosed fixture from the token-banner flake).
function autoplay(frames, onFrame) {
  for (let i = 0; i < frames; i++) {
    h.pump(1);
    if (st.mode === 'draft' || st.mode === 'evolve') {
      const c0 = h.elements['ov-cards'].children[0]; c0 && c0.click();
    } else if (st.mode === 'intermission') {
      const cont = h.elements['ov-cards'].children.find(c => (c.innerHTML || '').includes('CONTINUE'));
      cont && cont.click();
    }
    st.bannerHold = 0;
    if (onFrame && st.mode === 'playing') onFrame(i);
  }
}
// An angle where the inner ground at r=690 is LEVEL 0 — the band is a real
// cliff there (not a natural-ramp merge), so crossing must use a gate.
function cliffAngle(seed, rel) {
  // Any angle off the gate sectors where the inner apron is LEVEL 0, so a
  // crossing there must use the cliff rule. Searched across many radii: a
  // seed's lattice can hold whole rings above level 0 (CELL 480 smoothstep —
  // one high corner lifts an entire lattice band).
  for (let rr = 690; rr >= 300; rr -= 15) {
    for (let cand = 0.05; cand < Math.PI * 2; cand += 0.01) {
      if (nearestGateDist(cand) < 0.25) continue;
      if (reliefLevelAt(Math.cos(cand) * rr, Math.sin(cand) * rr, seed, rel) === 0) return cand;
    }
  }
  throw new Error('no cliff-real angle found (seed ' + seed + ')');
}

// ---------------------------------------------------------------------------
// GEOMETRY: the authored wall, VERDANT only.
// ---------------------------------------------------------------------------
S.check('the wall is authored on VERDANT ONLY; no other stage ships one', () => {
  const W = STAGE_BY_ID.VERDANT_HOLLOW.relief.WALL;
  assert(W && W.r0 === 700 && W.r1 === 760, 'the band is r 700..760 (got ' + JSON.stringify(W) + ')');
  assert(W.topLevel === 2 && W.gapLevel === 1,
    'top 2 (the stage tallest), gate terrace 1 (one step up, one down)');
  assert(W.gapHalf === 0.10 && W.gaps.length === 4, 'four gates, half-width 0.10 rad');
  for (let i = 0; i < 4; i++) {
    assert(Math.abs(angDistTo(W.gaps[i], CARDINALS[i])) < 1e-9,
      'gate ' + i + ' sits at cardinal ' + CARDINALS[i] + ' (aligned with the GATE landmarks)');
  }
  for (const s of STAGES) {
    if (s.id === 'VERDANT_HOLLOW') continue;
    assert(!stageRelief(s.id).WALL, s.id + ' ships no wall (terrain untouched)');
    // No wall, no blocking: the cliff rule is inert off VERDANT by construction.
    assert(!reliefBlocked(-800, 0, 800, 0, 7, stageRelief(s.id)),
      s.id + ': a wall-spanning move is never blocked without a wall');
  }
});
S.check('the composite level: band top, gate terraces, natural field elsewhere', () => {
  const rel = stageRelief('VERDANT_HOLLOW'), seed = 4242;
  assert(wallLevelAt(Math.cos(0.3) * 730, Math.sin(0.3) * 730, rel) === 2,
    'a non-gap point mid-band is the rampart top');
  for (const g of CARDINALS) {
    assert(wallLevelAt(Math.cos(g) * 730, Math.sin(g) * 730, rel) === 1,
      'cardinal ' + g + ' is the gate terrace');
  }
  assert(wallLevelAt(600, 0, rel) === null && wallLevelAt(830, 0, rel) === null,
    'off the band the authored level is null (natural field rules)');
  assert(reliefLevelAt(Math.cos(0.3) * 730, Math.sin(0.3) * 730, seed, rel) === 2,
    'the composite reads the wall inside the band');
  // Far outside the band the composite IS the natural quantization (one truth).
  for (const [x, y] of [[0, 0], [-500, 300], [870, -870]]) {
    assert(reliefLevelAt(x, y, seed, rel) === reliefLevel(x, y, seed, rel),
      'composite == natural at (' + x + ',' + y + ')');
  }
});

// ---------------------------------------------------------------------------
// THE CLIFF RULE + THE GATEWARD SLIDE (pure functions).
// ---------------------------------------------------------------------------
S.check('a >=2-level step blocks; 1-level steps and gates never do', () => {
  const rel = stageRelief('VERDANT_HOLLOW'), seed = 4242;
  const a = cliffAngle(seed, rel);
  const x0 = Math.cos(a) * 690, y0 = Math.sin(a) * 690;
  const x1 = Math.cos(a) * 720, y1 = Math.sin(a) * 720;
  assert(reliefBlocked(x0, y0, x1, y1, seed, rel),
    'level 0 -> band top 2 across the inner cliff is blocked (the wall is real)');
  // Through a gate: an inner LEVEL-0 approach crosses the terrace freely
  // (0 -> 1 is a ramp). Where the inner ground at a cardinal is higher, the
  // crossing is a fortiori legal, so the pin only fires from level 0.
  for (const g of CARDINALS) {
    const ix = Math.cos(g) * 690, iy = Math.sin(g) * 690;
    const ox = Math.cos(g) * 720, oy = Math.sin(g) * 720;
    assert(!reliefBlocked(ix, iy, ox, oy, seed, rel) ||
      reliefLevelAt(ix, iy, seed, rel) > 0,
      'gate ' + g + ': an inner level-0 approach crosses the terrace freely');
  }
  // The natural lattice can NEVER 2-step (the no-trap half of the proof):
  let maxStep = 0;
  for (let y = -890; y <= 890; y += 4) {
    for (let x = -890; x <= 890; x += 4) {
      if (Math.hypot(x, y) > 890) continue;
      const l = reliefLevel(x, y, seed, rel);
      maxStep = Math.max(maxStep,
        Math.abs(reliefLevel(x + 4, y, seed, rel) - l),
        Math.abs(reliefLevel(x, y + 4, seed, rel) - l));
    }
  }
  assert(maxStep <= 1, 'the natural field never steps 2 levels in 4px (max ' + maxStep + ')');
});
S.check('the gateward slide: a blocked move funnels toward the nearest gate and never stalls', () => {
  const rel = stageRelief('VERDANT_HOLLOW'), seed = 4242;
  // An angle where the move r699 -> r702 (one mover step across the inner
  // cliff edge) is REALLY blocked: adjacent ground level 0, band top 2.
  let a = null;
  for (let cand = 0.05; cand < Math.PI * 2 && a === null; cand += 0.01) {
    if (nearestGateDist(cand) < 0.25) continue;
    const ixx = Math.cos(cand) * 699, iyy = Math.sin(cand) * 699;
    const oxx = Math.cos(cand) * 702, oyy = Math.sin(cand) * 702;
    if (reliefLevelAt(ixx, iyy, seed, rel) === 0 && reliefBlocked(ixx, iyy, oxx, oyy, seed, rel)) a = cand;
  }
  assert(a !== null, 'a cliff-edge angle exists where a 3px outward step is blocked');
  const x0 = Math.cos(a) * 699, y0 = Math.sin(a) * 699;
  const nx = x0 + (x0 / 699) * 3, ny = y0 + (y0 / 699) * 3;
  const [sx, sy] = reliefStep(x0, y0, nx, ny, seed, rel);
  assert(!(sx === x0 && sy === y0), 'a radial press does not stall at the cliff');
  assert(!reliefBlocked(x0, y0, sx, sy, seed, rel), 'the slide step itself is legal');
  assert(nearestGateDist(Math.atan2(sy, sx)) < nearestGateDist(Math.atan2(y0, x0)) - 1e-9,
    'the slide moves TOWARD the nearest gate (angle ' + Math.atan2(y0, x0).toFixed(3) +
    ' -> ' + Math.atan2(sy, sx).toFixed(3) + ')');
  // Sustained pure-radial pressing from INSIDE reaches the wall top (the
  // funnel). The crossing is legal in exactly two ways: at a GATE (terrace
  // ramps) or at a NATURAL-RAMP MERGE (adjacent inner ground already level
  // >=1, so the 1-level step onto the band top is a ramp). A crossing that
  // is neither would be a cliff-rule violation.
  let px2 = x0, py2 = y0, crossed = null;
  for (let i = 0; i < 4000; i++) {
    const r = Math.hypot(px2, py2);
    const lvBefore = reliefLevelAt(px2, py2, seed, rel);   // the step's true origin
    const [ux, uy] = reliefStep(px2, py2, px2 + (px2 / r) * 3, py2 + (py2 / r) * 3, seed, rel);
    if (ux === px2 && uy === py2) break;
    px2 = ux; py2 = uy;
    if (!crossed && Math.hypot(px2, py2) > 700) {
      crossed = { ang: Math.atan2(py2, px2), innerLv: lvBefore };
      break;
    }
  }
  assert(crossed, 'sustained radial pressing circuits the wall and crosses (the funnel)');
  assert(nearestGateDist(crossed.ang) <= 0.12 || crossed.innerLv >= 1,
    'the crossing is a gate or a natural-ramp merge (angle-dist ' +
    nearestGateDist(crossed.ang).toFixed(3) + ', inner level ' + crossed.innerLv + ')');
  // Same from OUTSIDE pressing in: reaches the hollow.
  let ox2 = Math.cos(a) * 820, oy2 = Math.sin(a) * 820, hitHollow = false;
  for (let i = 0; i < 4000 && !hitHollow; i++) {
    const r = Math.hypot(ox2, oy2);
    const [ux, uy] = reliefStep(ox2, oy2, ox2 - (ox2 / r) * 3, oy2 - (oy2 / r) * 3, seed, rel);
    if (ux === ox2 && uy === oy2) break;
    ox2 = ux; oy2 = uy;
    if (Math.hypot(ox2, oy2) < 650) hitHollow = true;
  }
  assert(hitHollow, 'an outside mover pressing in circuits to a gate and enters the hollow');
});
S.check('NO-TRAP: the composite field is fully connected (flood fill, several seeds)', () => {
  const rel = stageRelief('VERDANT_HOLLOW');
  const N = 24, R = 890;
  const idx = (i, j) => (i + 64) * 200 + (j + 64);
  for (const seed of [1, 42, 777, 20260917]) {
    const walk = new Set();
    const lim = Math.ceil(R / N);
    for (let j = -lim; j <= lim; j++) for (let i = -lim; i <= lim; i++) {
      if (Math.hypot(i * N - R, j * N - R) <= R) walk.add(idx(i, j));
    }
    const c = Math.round(R / N);
    const seen = new Set([idx(c, c)]);
    const q = [[c, c]];
    while (q.length) {
      const [i, j] = q.pop();
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nj = j + dj, k = idx(ni, nj);
        if (seen.has(k) || !walk.has(k)) continue;
        if (reliefBlocked(i * N - R, j * N - R, ni * N - R, nj * N - R, seed, rel)) continue;
        seen.add(k); q.push([ni, nj]);
      }
    }
    assert(seen.size === walk.size,
      'seed ' + seed + ': every walkable sample is reachable (' + seen.size + '/' + walk.size +
      ') — the gates bridge all three regions, no dead ends');
  }
});

// ---------------------------------------------------------------------------
// SAME RULE, BOTH SIDES — then the live navigation bars.
// ---------------------------------------------------------------------------
S.check('BOTH SIDES: a live enemy funnels through a gate to a pilot at the heart', () => {
  T.banners.suppressAll();
  T.startRun();
  h.pump(2);
  quietField();
  const rel = stageRelief(st.stage);
  const seed = st.groundSeed || 0;
  assert(rel.WALL, 'the default run carries the wall (stage ' + st.stage + ')');
  const p = st.player;
  p.x = 0; p.y = 0; p.invuln = 1e9;
  const a = cliffAngle(seed, rel);
  st.enemies.push({ typeId: 'CHASER', x: Math.cos(a) * 820, y: Math.sin(a) * 820,
    w: 10, hp: 1000, maxHp: 1000, speed: 60, mx: 0, my: 0, age: 0, elite: false });
  let enteredR = null, minR = 1e9;
  autoplay(60 * 60, () => {
    st.spawnTimer = 999;
    p.invuln = 1e9; p.x = 0; p.y = 0;
    const e = st.enemies[0];
    if (!e || e.hp <= 0) return;
    const r = Math.hypot(e.x, e.y);
    minR = Math.min(minR, r);
    if (enteredR === null && r < 700) enteredR = e;
  });
  assert(enteredR, 'the enemy crossed into the hollow (min r ' + minR.toFixed(0) +
    ') — the wall delayed it, never stopped it');
  assert(minR < 30, 'the funneled enemy actually reached the pilot (min r ' + minR.toFixed(0) + ')');
});
S.check('AUTO: the pilot routes around the wall to a beyond-wall gem, unattended', () => {
  T.banners.suppressAll();
  T.startRun();
  h.pump(2);
  quietField();
  const rel = stageRelief(st.stage), seed = st.groundSeed || 0;
  const p = st.player;
  p.x = 0; p.y = 0; p.invuln = 1e9;
  const a = cliffAngle(seed, rel);
  const gx = Math.cos(a) * 850, gy = Math.sin(a) * 850;
  st.gems.push({ x: gx, y: gy, xp: 5 });
  let minDist = 1e9, crossed = false;
  autoplay(60 * 90, () => {
    st.spawnTimer = 999;                 // the quiet-field fixture holds
    p.invuln = 1e9;
    minDist = Math.min(minDist, Math.hypot(p.x - gx, p.y - gy));
    const r = Math.hypot(p.x, p.y);
    if (r > 765) crossed = true;
  });
  assert(st.gems.length === 0, 'the gem was collected (the pilot crossed for it)');
  assert(crossed, 'the pilot left the hollow (max r crossed the band outer edge)');
  console.log('  MEASURED AUTO route: closest approach ' + minDist.toFixed(0) +
    'px to the beyond-wall gem; the wall was crossed via the choke funnel');
});
S.check('NIGHT: a walled run clears the wave and auto-continues, unattended', () => {
  while (!T.night.on) T.night.press();
  T.startRun();
  h.pump(2);
  assert(st.nightRun === true, 'the night stamp is live');
  const prof = T.getProfile();
  prof.gold = 100_000_000;
  for (const def of SHOP_UPGRADES) {
    for (let i = 0; i < def.maxLevel; i++) if (!buyUpgrade(prof, def.id)) break;
  }
  T.startRun();                          // re-arm: stats are computed at startRun
  h.pump(2);
  st.wave.endsAt = st.time;              // fast-forward to the boss
  let sawIntermission = false, guard = 0;
  while (guard++ < 60 * 240) {
    h.pump(1);
    st.bannerHold = 0;
    if (st.mode === 'draft' || st.mode === 'evolve') {
      const c0 = h.elements['ov-cards'].children[0]; c0 && c0.click();
    }
    if (st.mode === 'intermission') { sawIntermission = true; break; }
    if (st.mode === 'dead' || st.mode === 'death-cine') break;
  }
  assert(sawIntermission, 'the night run reached the intermission unattended (mode ' + st.mode + ')');
  const waveBefore = st.wave.num;
  for (let i = 0; i < 60 * 10 && st.mode === 'intermission'; i++) h.pump(1);
  assert(st.mode === 'playing' && st.wave.num === waveBefore + 1,
    'the auto-CONTINUE advanced the ladder unattended (mode ' + st.mode + ')');
  while (T.night.on) T.night.press();
  st.mode = 'menu';
});

// ---------------------------------------------------------------------------
// CAMERA + RENDER (readability) + THE ANTI-SANCTUARY MEASUREMENT.
// ---------------------------------------------------------------------------
S.check('the camera holds the pilot on screen at both elevations', () => {
  T.banners.suppressAll();
  T.startRun();
  h.pump(2);
  const p = st.player;
  const hold = (x, y, label) => {
    for (let i = 0; i < 180; i++) {
      p.x = x; p.y = y; p.invuln = 1e9;      // hold the pilot: the camera converges
      h.pump(1); st.bannerHold = 0;
    }
    p.x = x; p.y = y;
    // The deadzone contract (C.CAMERA): the follow stops once the pilot is
    // inside the box, so the screen position may sit up to the deadzone edge
    // from the view centre — the invariant is SAFE margin inside every edge
    // (the ground plane under the pilot is visible), identical at every
    // elevation (the camera never reads the relief).
    const m = C.CAMERA.SAFE;
    const sx = p.x - st.cam.x, sy = p.y - st.cam.y;
    assert(sx >= m && sx <= C.VIEW_W - m && sy >= m && sy <= C.VIEW_H - m,
      label + ': the pilot is on screen with safe margin (screen ' + sx.toFixed(0) + ',' +
      sy.toFixed(0) + ' in [' + m + '..' + (C.VIEW_W - m) + ']x[' + m + '..' + (C.VIEW_H - m) + '])');
  };
  hold(0, 0, 'the hollow heart (level 0)');
  hold(Math.cos(0.9) * 730, Math.sin(0.9) * 730, 'the rampart top (level 2)');
  hold(Math.cos(0.1) * 730, Math.sin(0.1) * 730, 'a gate terrace (level 1)');
});
S.check('the render paints the wall on VERDANT and nothing on a wall-less stage', () => {
  T.banners.suppressAll();
  T.startRun();
  h.pump(2);
  assert(st.stage === 'VERDANT_HOLLOW', 'the default run is on the walled stage');
  h.pump(1);
  assert(T.renderer.wallDrawn === true, 'drawWall painted the band this frame');
  // A wall-less stage: the draw is inert (the other seven arenas are untouched).
  T.renderer.wallDrawn = false;
  T.renderer.drawWall(h.ctx, { stage: 'ASHEN_WASTE' }, { x: 0, y: 0 });
  assert(!T.renderer.wallDrawn, 'no wall paint without an authored WALL block');
});
S.check('ANTI-SANCTUARY on the wall top: a DELAY, not a haven (measured, reported)', () => {
  // The park-and-measure from test_arena_scaleup (same disclosed fixtures:
  // seeded rng, banners suppressed, DISARMED arm — weapons stripped,
  // projectiles/thorns/stormShards zeroed — so the ground is the only
  // variable; p.invuln re-pinned each frame so nothing dies to the body).
  const park = (spot, secs) => {
    const realRandom = Math.random;
    Math.random = mulberry32(0x5eed2);
    let touching = 0, frames = 0;
    try {
      T.banners.suppressAll();
      T.startRun();
      st.weapons.length = 0;
      st.player.stats.projectiles = 0;
      st.player.stats.thorns = 0;
      st.player.stats.stormShards = false;
      const pp = st.player;
      autoplay(secs * 60, () => {
        pp.invuln = 1e9;
        pp.x = spot.x; pp.y = spot.y;
        frames++;
        for (const e of st.enemies) {
          if (e.hp <= 0) continue;
          if (Math.hypot(e.x - spot.x, e.y - spot.y) < Math.max(12, 6 + (e.w || 10) / 2)) { touching++; break; }
        }
      });
    } finally { Math.random = realRandom; }
    return { rate: frames ? touching / frames : 0, frames };
  };
  const wallTop = { x: Math.cos(0.9) * 730, y: Math.sin(0.9) * 730 };  // non-gap rampart
  const flatHeart = { x: 60, y: -40 };                                   // hollow floor
  const hi = park(wallTop, 20), fl = park(flatHeart, 20), hi35 = park(wallTop, 35);
  assert(fl.rate > 0.5, 'fixture sanity: the flat arm really measures contact (' +
    (fl.rate * 100).toFixed(1) + '%)');
  assert(hi35.rate > 0, 'the horde REACHES the wall top through the gates (' +
    (hi35.rate * 100).toFixed(1) + '% over 35s) — no absolute sanctuary');
  // THE V1 REPORT (the directive: numbers, not tuning — no constants moved).
  // High ground here is MATERIALLY safer in the short window: crossing costs
  // a gate detour of up to ~half the wall circumference, so contact arrives
  // late. Flagged as the FIRST thing horde-mix work must address (wider
  // gates, or gate-biased spawns when the pilot stands on the rampart).
  console.log('  MEASURED anti-sanctuary (parked, disarmed): contact-while-WALL-TOP ' +
    (hi.rate * 100).toFixed(1) + '% (20s) / ' + (hi35.rate * 100).toFixed(1) + '% (35s)' +
    ' vs contact-while-FLAT ' + (fl.rate * 100).toFixed(1) + '% — ratio ' +
    (fl.rate ? hi.rate / fl.rate : Infinity).toFixed(2) +
    ' at 20s (the gate-detour delay; V1 imbalance, REPORTED not tuned)');
});

S.done();
