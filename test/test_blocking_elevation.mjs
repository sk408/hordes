// HORDES — ELEVATION v2 (2026-09-18, owner directive: "It should be a
// gradient upward/downward that would create a separate path blocked off by
// a cliff. If possible form our view").
//
// The model's two primitives, ONE threshold (CONFIG.RELIEF.CLIFF_STEP = 2):
//   GRADE  a continuous walkable slope — ground whose composite level steps
//          < 2 levels between adjacent positions. The grade term rides it.
//          A RAMP is an authored grade: the terrace's angular ends step
//          topLevel -> 0 in whole 1-level staircases over 2*rampW radians.
//   CLIFF  a height discontinuity >= 2 levels between adjacent positions.
//          It BLOCKS the move; you route around it (a ramp) or not at all.
//
// The MAP (VERDANT HOLLOW only): ONE UPPER TERRACE — an arc band at
// [560,700] north-centred raised to level 2 (~940px of walkable top), cut
// off by cliffs on both radial edges, reachable ONLY up the two end ramps
// (plus the level-0 apron pinned around the band so the natural rim can
// never leak a merge). The other seven stages ship byte-identical terrain.
//
// Proven here, in the directive's own non-negotiable order:
//   GEOMETRY     the terrace band, ramps, apron and composite level are
//                pinned; only VERDANT carries a terrace
//   NO TRAP      the composite field is fully connected WITH the cliff set
//                (flood fill, several seeds) — every pocket has a ramp out
//   SAME RULE    one geometry function (reliefStep) for pilot and horde; the
//                rampward slide never stalls; a live enemy CLIMBS A RAMP to
//                a pilot on the top; AUTO routes to a top-level gem; NIGHT
//                clears unattended
//   CAMERA       the deadzone follow holds the pilot on screen at floor,
//                ramp and top alike (the ground plane stays visible)
//   RENDER       drawTerrace paints on VERDANT and nothing on a terrace-less
//                stage
//   ANTI-        the upper path is a DELAY, not a sanctuary: the parked
//   SANCTUARY    park-and-measure reports contact-while-TOP vs FLAT with
//                numbers; the hard assertions are that the horde reaches
//                the top at all AND makes contact within the window
import { suite, boot } from './_harness.mjs';
import { CONFIG as C } from '../src/config.js';
import { STAGES, stageRelief, STAGE_BY_ID } from '../src/stages.js';
import {
  reliefLevel, reliefLevelAt, terraceLevelAt, apronLevelAt,
  reliefBlocked, reliefStep,
} from '../src/relief.js';
import { buyUpgrade, SHOP_UPGRADES } from '../src/meta.js';

const S = suite('test_elevation_v2');
function assert(cond, msg) { if (!cond) throw new Error('AssertionError: ' + msg); }
// The seeded rng the harness-visible fixtures use (startRun rolls an UNSEEDED
// groundSeed otherwise — the flake pin; see BOTH SIDES below).
function mulberry32b(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const h = await boot();
const T = h.T, st = h.state;
const rel = stageRelief('VERDANT_HOLLOW');
const TER = rel.TERRACE;
const angDistTo = (theta, g) => Math.atan2(Math.sin(theta - g), Math.cos(theta - g));
const P = (ang, r) => [Math.cos(ang) * r, Math.sin(ang) * r];
const SPAN_MID = (TER.A0 + TER.A1) / 2;
const RAMP_W = TER.A0 - 2 * TER.rampW;      // the west ramp's foot line

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

// ---------------------------------------------------------------------------
// GEOMETRY: the authored terrace, VERDANT only. THE THRESHOLD.
// ---------------------------------------------------------------------------
S.check('the terrace is authored on VERDANT ONLY; no other stage ships one', () => {
  assert(TER && TER.r0 === 560 && TER.r1 === 700, 'the band is r 560..700 (got ' + JSON.stringify(TER) + ')');
  assert(TER.topLevel === 2, 'the path top is the stage tallest (level 2)');
  assert(Math.abs((TER.A1 - TER.A0) - 1.5) < 1e-9 && TER.rampW === 0.30,
    'the top span is 1.5 rad with 0.30 rad ramps');
  assert(Math.abs(SPAN_MID - Math.PI / 2) < 1e-9, 'the span is north-centred');
  assert(TER.apron === 120 && TER.feather === 0.35, 'the apron shelf is authored');
  for (const s of STAGES) {
    if (s.id === 'VERDANT_HOLLOW') continue;
    assert(!stageRelief(s.id).TERRACE, s.id + ' ships no terrace (terrain untouched)');
    // No terrace, no blocking: the cliff rule is inert off VERDANT by construction.
    assert(!reliefBlocked(-800, 0, 800, 0, 7, stageRelief(s.id)),
      s.id + ': a band-spanning move is never blocked without a terrace');
  }
});
S.check('THE THRESHOLD: a >=2-level discontinuity is the cliff; <2 is a grade', () => {
  assert(C.RELIEF.CLIFF_STEP === 2,
    'CLIFF_STEP is 2 (the natural lattice is Lipschitz — it can never 2-step, so only authored faces cliff; with 3 levels a 2-break is floor-to-top)');
  const seed = 4242;
  // Radial crossing at mid-span: apron 0 -> top 2, a real cliff.
  const [ix, iy] = P(SPAN_MID, TER.r0 - 4), [ox, oy] = P(SPAN_MID, TER.r0 + 2);
  assert(reliefBlocked(ix, iy, ox, oy, seed, rel),
    'floor 0 -> top 2 across the inner edge is blocked (the cliff is real)');
  // 1-level steps never block — the ramp's grades, both directions.
  for (const [r0_, r1_] of [[560, 564], [564, 560]]) {
    const [a0x, a0y] = P(RAMP_W + 0.31, r0_), [a1x, a1y] = P(RAMP_W + 0.31, r1_);
    // (same angle, radial step inside the apron — flat, sanity only)
    assert(!reliefBlocked(a0x, a0y, a1x, a1y, seed, rel), 'flat steps never block');
  }
  // The ramp grades 2 -> 1 -> 0 along the arc at band radius (each step 1).
  const seen = [];
  for (let a = TER.A0 + 0.05; a >= TER.A0 - 0.65; a -= 0.01) {
    const [x, y] = P(a, 630);
    const lv = reliefLevelAt(x, y, seed, rel);
    if (!seen.length || seen[seen.length - 1] !== lv) seen.push(lv);
  }
  assert(seen.join(',') === '2,1,0',
    'walking the ramp descends the whole staircase in 1-level steps (got ' + seen.join(',') + ')');
});
S.check('the composite: top on the span, graded ramps, apron floor, natural elsewhere', () => {
  const seed = 4242;
  assert(terraceLevelAt(...P(SPAN_MID, 630), seed, rel) === 2, 'mid-span band is the top');
  assert(terraceLevelAt(...P(SPAN_MID, 500), seed, rel) === null,
    'off the band the authored level is null');
  assert(apronLevelAt(...P(SPAN_MID, 520), seed, rel) === 0,
    'the apron pins the wedge floor to level 0');
  assert(apronLevelAt(0, -520, seed, rel) === null,
    'off the wedge (south, far from the terrace) the apron is null');
  // Far from the terrace the composite IS the natural quantization (one truth).
  for (const [x, y] of [[0, 0], [-800, 200], [700, -700]]) {
    assert(reliefLevelAt(x, y, seed, rel) === reliefLevel(x, y, seed, rel),
      'composite == natural at (' + x + ',' + y + ')');
  }
});
S.check('the separation holds: the band edges are cliffs for EVERY seed tried', () => {
  // The apron's whole point — without it the natural rim merges into the top
  // and leaks (measured pre-apron: only 0-53% of the span edges cliffed).
  for (const seed of [1, 42, 4242, 777, 20260917]) {
    let cliff = 0, n = 0;
    for (let a = TER.A0; a <= TER.A1; a += 0.02) {
      n++;
      if (reliefBlocked(...P(a, TER.r0 + 2), ...P(a, TER.r0 - 4), seed, rel)) cliff++;
    }
    assert(cliff === n, 'seed ' + seed + ': the inner edge is cliff along the whole span (' +
      cliff + '/' + n + ') — the ramps are the only authored way up');
  }
});
S.check('Lipschitz: neither the natural field nor the authored blend can 2-step a mover', () => {
  // Raw adjacent samples DO 2-step — at the band edges, which is the cliff
  // itself. The meaningful guarantee is over MOVEMENT: a step through the
  // one geometry function never LANDS on a >=2 different level (the slide
  // replaces the crossing), so no mover ever teleports up a face.
  const seed = 4242;
  let maxStep = 0;
  for (let y = -890; y <= 890; y += 4) {
    for (let x = -890; x <= 890; x += 4) {
      if (Math.hypot(x, y) > 890) continue;
      const l = reliefLevelAt(x, y, seed, rel);
      for (const [dx, dy] of [[4, 0], [0, 4]]) {
        const [ux, uy] = reliefStep(x, y, x + dx, y + dy, seed, rel);
        maxStep = Math.max(maxStep, Math.abs(reliefLevelAt(ux, uy, seed, rel) - l));
      }
    }
  }
  assert(maxStep <= 1, 'a legal move never lands 2 levels away (max ' + maxStep +
    ') — cliffs exist ONLY as the terrace band edges, never in the blend');
});

// ---------------------------------------------------------------------------
// THE RAMPWARD SLIDE (pure functions) + NO-TRAP.
// ---------------------------------------------------------------------------
S.check('the rampward slide: a blocked radial press moves toward the nearest ramp, never stalls', () => {
  const seed = 4242;
  const [x0, y0] = P(SPAN_MID, TER.r0 - 2);            // hugging the inner cliff
  const [nx, ny] = P(SPAN_MID, TER.r0 + 2);            // pressing straight at the face
  const [sx, sy] = reliefStep(x0, y0, nx, ny, seed, rel);
  assert(!(sx === x0 && sy === y0), 'a radial press does not stall at the cliff');
  assert(!reliefBlocked(x0, y0, sx, sy, seed, rel), 'the slide step itself is legal');
  const d0 = Math.min(Math.abs(angDistTo(SPAN_MID, TER.A0 - TER.rampW)),
                      Math.abs(angDistTo(SPAN_MID, TER.A1 + TER.rampW)));
  const sa = Math.atan2(sy, sx);
  const d1 = Math.min(Math.abs(angDistTo(sa, TER.A0 - TER.rampW)),
                      Math.abs(angDistTo(sa, TER.A1 + TER.rampW)));
  assert(d1 < d0 - 1e-9, 'the slide moves TOWARD the nearest ramp centre (angle-dist ' +
    d0.toFixed(3) + ' -> ' + d1.toFixed(3) + ')');
});
S.check('the funnel: sustained pressing crosses the band VIA A RAMP, both directions', () => {
  const seed = 4242;
  const [ax, ay] = P(SPAN_MID, 520);                   // inside, below the inner cliff
  let x = ax, y = ay, crossed = null, maxLv = 0;
  for (let i = 0; i < 12000; i++) {
    const r = Math.hypot(x, y);
    const lvB = reliefLevelAt(x, y, seed, rel);
    const [ux, uy] = reliefStep(x, y, ...P(Math.atan2(y, x), r + 3), seed, rel);
    if (ux === x && uy === y) break;
    x = ux; y = uy;
    const lv = reliefLevelAt(x, y, seed, rel);
    maxLv = Math.max(maxLv, lv);
    if (!crossed && r > TER.r1) crossed = { ang: Math.atan2(y, x), via: lvB };
  }
  assert(crossed, 'an inner radial presser circuits to a ramp and crosses the band');
  assert(maxLv === 2, 'the crossing touches the path top (max level ' + maxLv + ') — it CLIMBED');
  // And from outside pressing in: reaches the hollow floor.
  let ox = Math.cos(SPAN_MID) * 820, oy = Math.sin(SPAN_MID) * 820, hitHollow = false;
  for (let i = 0; i < 12000 && !hitHollow; i++) {
    const r = Math.hypot(ox, oy);
    const [ux, uy] = reliefStep(ox, oy, ...P(Math.atan2(oy, ox), r - 3), seed, rel);
    if (ux === ox && uy === oy) break;
    ox = ux; oy = uy;
    if (Math.hypot(ox, oy) < 520) hitHollow = true;
  }
  assert(hitHollow, 'an outside mover pressing in circuits to a ramp and enters the hollow');
});
S.check('NO-TRAP: the composite field is fully connected WITH the cliff set (flood fill)', () => {
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
      ') — the ramps bridge floor and top, no dead ends');
  }
});

// ---------------------------------------------------------------------------
// SAME RULE, BOTH SIDES — the live navigation bars.
// ---------------------------------------------------------------------------
S.check('BOTH SIDES: a live enemy climbs a ramp to a pilot standing on the top', () => {
  // FLAKE PIN (2026-09-18, v1's shape): startRun rolls an UNSEEDED
  // groundSeed, and the terrace field is a pure function of that seed —
  // seeded, the world (and the whole autoplay) is deterministic.
  const realRandom = Math.random;
  Math.random = mulberry32b(0x6a7e1);
  try {
    T.banners.suppressAll();
    T.startRun();
    h.pump(2);
    quietField();
    st.weapons.length = 0;               // disarmed: the ROUTE is the variable
    st.player.stats.projectiles = 0;
    st.player.stats.thorns = 0;
    st.player.stats.stormShards = false;
    const r2 = stageRelief(st.stage), seed = st.groundSeed || 0;
    assert(r2.TERRACE, 'the default run carries the terrace (stage ' + st.stage + ')');
    const p = st.player;
    const [px, py] = P(SPAN_MID, 630);
    p.x = px; p.y = py; p.invuln = 1e9;
    // A chaser from the hollow, off-tangential (the funnel approach; the
    // tangential-shadow orbit is the disclosed residue, below).
    const [ex, ey] = P(SPAN_MID - 2.4, 300);
    st.enemies.push({ typeId: 'CHASER', x: ex, y: ey,
      w: 10, hp: 1000, maxHp: 1000, speed: 60, mx: 0, my: 0, age: 0, elite: false });
    let minDist = 1e9, touchedTop = false;
    autoplay(60 * 60, () => {
      st.spawnTimer = 999;
      p.invuln = 1e9; p.x = px; p.y = py;
      const e = st.enemies[0];
      if (!e || e.hp <= 0) return;
      minDist = Math.min(minDist, Math.hypot(e.x - px, e.y - py));
      if (reliefLevelAt(e.x, e.y, seed, r2) === 2) touchedTop = true;
    });
    assert(touchedTop, 'the enemy CLIMBED to level 2 (the horde paths the ramps)');
    assert(minDist < 30, 'the funneled enemy reached the pilot on the top (min dist ' +
      minDist.toFixed(0) + ')');
  } finally { Math.random = realRandom; }
});
S.check('AUTO: the pilot routes up a ramp to a gem on the top, unattended', () => {
  const realRandom = Math.random;
  Math.random = mulberry32b(0x6a7e3);
  try {
    T.banners.suppressAll();
    T.startRun();
    h.pump(2);
    quietField();
    const seed = st.groundSeed || 0;
    const p = st.player;
    p.x = 0; p.y = 0; p.invuln = 1e9;
    const [gx, gy] = P(SPAN_MID, 630);
    st.gems.push({ x: gx, y: gy, xp: 5 });
    let climbed = false, minDist = 1e9;
    autoplay(60 * 120, () => {
      st.spawnTimer = 999;
      p.invuln = 1e9;
      minDist = Math.min(minDist, Math.hypot(p.x - gx, p.y - gy));
      if (reliefLevelAt(p.x, p.y, seed, stageRelief(st.stage)) === 2) climbed = true;
    });
    assert(st.gems.length === 0, 'the gem was collected (the pilot climbed for it)');
    assert(climbed, 'the pilot itself reached level 2 — AUTO uses the same ramps');
    console.log('  MEASURED AUTO route: closest approach ' + minDist.toFixed(0) +
      'px to the top-level gem; the climb was via a ramp');
  } finally { Math.random = realRandom; }
});
S.check('NIGHT: a terraced run clears the wave and auto-continues, unattended', () => {
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
S.check('the camera holds the pilot on screen at floor, ramp and top alike', () => {
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
    // The deadzone contract (C.CAMERA): SAFE margin inside every edge — the
    // ground plane under the pilot is visible, identical at every elevation
    // (the camera never reads the relief).
    const m = C.CAMERA.SAFE;
    const sx = p.x - st.cam.x, sy = p.y - st.cam.y;
    assert(sx >= m && sx <= C.VIEW_W - m && sy >= m && sy <= C.VIEW_H - m,
      label + ': the pilot is on screen with safe margin (screen ' + sx.toFixed(0) + ',' +
      sy.toFixed(0) + ' in [' + m + '..' + (C.VIEW_W - m) + ']x[' + m + '..' + (C.VIEW_H - m) + '])');
  };
  hold(0, 0, 'the hollow floor (level 0)');
  hold(...P(TER.A0 - TER.rampW, 630), 'the west ramp (the grade)');
  hold(...P(SPAN_MID, 630), 'the path top (level 2)');
});
S.check('the render paints the terrace on VERDANT and nothing on a terrace-less stage', () => {
  T.banners.suppressAll();
  T.startRun();
  h.pump(2);
  assert(st.stage === 'VERDANT_HOLLOW', 'the default run is on the terraced stage');
  h.pump(1);
  assert(T.renderer.terraceDrawn === true, 'drawTerrace painted the band this frame');
  // A terrace-less stage: the draw is inert (the other seven arenas untouched).
  T.renderer.terraceDrawn = false;
  T.renderer.drawTerrace(h.ctx, { stage: 'ASHEN_WASTE', groundSeed: 1 }, { x: 0, y: 0 });
  assert(!T.renderer.terraceDrawn, 'no terrace paint without an authored TERRACE block');
});
S.check('ANTI-SANCTUARY on the upper path: a DELAY, not a haven (measured, reported)', () => {
  // The park-and-measure from test_arena_scaleup (same disclosed fixtures:
  // seeded rng, banners suppressed, DISARMED arm — weapons stripped,
  // projectiles/thorns/stormShards zeroed — so the ground is the only
  // variable; p.invuln re-pinned each frame so nothing dies to the body).
  const park = (spot, secs) => {
    const realRandom = Math.random;
    Math.random = mulberry32b(0x5eed2);
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
  const topMid = { x: Math.cos(SPAN_MID) * 630, y: Math.sin(SPAN_MID) * 630 };
  const flatHeart = { x: 60, y: -40 };                                   // hollow floor
  const hi = park(topMid, 20), fl = park(flatHeart, 20), hi35 = park(topMid, 35);
  assert(fl.rate > 0.5, 'fixture sanity: the flat arm really measures contact (' +
    (fl.rate * 100).toFixed(1) + '%)');
  assert(hi.rate > 0, 'the horde REACHES the top over 20s (' +
    (hi.rate * 100).toFixed(1) + '%) — the ramps carry it up, no absolute sanctuary');
  assert(hi35.rate > hi.rate * 0.5 || hi35.rate > 0.2,
    'contact on the top is sustained, not a fluke (35s: ' + (hi35.rate * 100).toFixed(1) + '%)');
  // THE V2 REPORT (numbers, not tuning — no balance constants moved). The
  // v1 wall top measured a near-0% sanctuary; v2's ramps are the fix the
  // crux demanded. The tangential-shadow orbit residue is disclosed in
  // relief.js's slide comment and owned by the ranged anti-terrace tier.
  console.log('  MEASURED anti-sanctuary (parked, disarmed): contact-while-TOP ' +
    (hi.rate * 100).toFixed(1) + '% (20s) / ' + (hi35.rate * 100).toFixed(1) + '% (35s)' +
    ' vs contact-while-FLAT ' + (fl.rate * 100).toFixed(1) + '% — ratio ' +
    (fl.rate ? hi.rate / fl.rate : Infinity).toFixed(2) +
    ' at 20s (the ramp detour delay; REPORTED not tuned)');
});

S.done();
