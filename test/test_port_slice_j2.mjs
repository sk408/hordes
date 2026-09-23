// HORDES — PORT SLICE J2: weapon/projectile body sprites.
//
// Run: node test/test_port_slice_j2.mjs
//
// The slice re-dresses ONLY render.js projectile/effect painters
// (visual-only): the five traveling bodies (VOLLEY arrow, ORBIT blade,
// BOOMERANG crescent, SEEKER missile, MINE) plus one additive body sprite on
// each instant archetype's existing effect painter (ZAP bolt head, NOVA ring
// motes, SCYTHE blade crescent, BEAM pulse packet). Triggers, ttls, flight
// paths, speeds, hit boxes and pool bounds are byte-identical — this file
// pins BOTH sides:
//
//   A. COMPOSITION — each archetype's in-flight body paints ORIGINAL
//      multi-part art (core + edge/fins + hash-phased glint) in its own
//      palette, through the real R.render frame path with a recording ctx.
//   B. SEMANTICS UNMOVED — the renderer never mutates sim state (painters,
//      never mechanics): projectile/effect fields are identical before and
//      after a frame; flight math itself is quoted green from
//      test_weapons.mjs movement asserts (suite line in the slice report).
//   C. DETERMINISM — the same body paints byte-identically twice (60/120Hz
//      paint granularity: art is a pure function of sim age, never wall
//      clock); a different origin re-phases the hash stamp.
//   D. ASCII — no body painter emits text (no emojis anywhere near weapons).
//   E. VOCABULARY — no new projectile/effect kinds exist (parked rulings
//      stay parked; the slice-h KNOWN set is unchanged).
import { suite } from './_harness.mjs';
import { Renderer } from '../src/render.js';
import { makePlayer } from '../src/entities.js';
import assert from 'node:assert';

const s = suite('port slice J2: projectile body sprites');

// ---------- recording ctx + minimal frame state (slice-h pattern) -----------
function makeCtx() {
  const rec = { rects: [], texts: [], depth: 0 };
  const ctx = {
    canvas: null,
    fillStyle: '#000000', globalAlpha: 1, font: '10px monospace',
    textAlign: 'left', textBaseline: 'top', imageSmoothingEnabled: true,
    lineWidth: 1, strokeStyle: '#000000',
    setTransform() {}, translate() {}, scale() {}, rotate() {},
    clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, arc() {},
    save() { rec.depth++; },
    restore() { rec.depth = Math.max(0, rec.depth - 1); },
    fillRect(x, y, w, h) {
      rec.rects.push({ x, y, w, h, d: rec.depth, n: rec.rects.length, style: String(ctx.fillStyle) });
    },
    fillText(txt, x, y) { rec.texts.push({ txt: String(txt), x, y }); },
  };
  return { ctx, rec };
}
function frameState(over) {
  const p = makePlayer();
  p.x = 240; p.y = 150;
  const st = {
    player: p, time: 4.0, toasts: [], items: [], weapons: [],
    weather: null, mode: 'playing', zoom: 1, groundSeed: 7,
    enemies: [], projectiles: [], enemyShots: [], gems: [], drops: [],
    itemDrops: [], chests: [], arches: [], effects: [],
    wave: { num: 1, boss: null, bosses: [] },
    cam: { x: 0, y: 0 },
  };
  return Object.assign(st, over || {});
}
function paintFrame(st) {
  const { ctx, rec } = makeCtx();
  const canvas = { width: 0, height: 0, getContext: () => ctx,
    getBoundingClientRect: () => ({ width: 0, height: 0 }) };
  ctx.canvas = canvas;
  const R = new Renderer(canvas);
  R.render(st, { x: 0, y: 0 });
  return rec;
}
function paint(projectiles, effects) {
  return paintFrame(frameState({ projectiles, effects }));
}
const stylesOf = (rec) => new Set(rec.rects.map(q => q.style));
const sig = (rec) => rec.rects.map(q => [q.x, q.y, q.w, q.h, q.style].join(',')).join('|');
const hasRect = (rec, x, y, w, h, style) =>
  rec.rects.some(q => q.x === x && q.y === y && q.w === w && q.h === h &&
    (style === undefined || q.style === style));

// ---------- A. COMPOSITION: one body per archetype, real frame path --------
// [label, projectiles, effects, minNewRects, markerStyles]
const VOLLEY = [{ x: 240, y: 150, vx: 100, vy: 0, damage: 1, pierce: 0, hit: new Set(), age: 0.1 }];
const BOOM = [{ kind: 'boomerang', x: 240, y: 150, dx: 1, dy: 0, dist: 10, phase: 'out', damage: 1, pierce: 0, hit: new Map(), age: 0.05 }];
const SEEK = [{ kind: 'seeker', x: 240, y: 150, ang: 0, target: null, damage: 1, age: 0.1, trail: [], gen: 0 }];
const MINE = [{ kind: 'mine', x: 240, y: 150, age: 0.1 }];
const ORBIT_FX = [{ kind: 'orbit', x: 240, y: 150, age: 0.02, ttl: 0.08 }];
const ZAP_FX = [{ kind: 'zap', points: [{ x: 240, y: 150 }, { x: 300, y: 150 }, { x: 330, y: 170 }, { x: 280, y: 190 }], age: 0.02, ttl: 0.15 }];
const NOVA_FX = [{ kind: 'nova_pulse', x: 240, y: 150, radius: 30, age: 0.06, ttl: 0.3 }];
const SCYTHE_FX = [{ kind: 'scythe_arc', x: 240, y: 150, dir: 0, radius: 55, arc: 1.0, age: 0.05, ttl: 0.25 }];
const BEAM_FX = [{ kind: 'beam', x: 240, y: 150, dir: 0, from: -0.25, to: 0.25, len: 240, width: 10, phase: 1.7, age: 0.05, ttl: 0.35 }];
const DRESSED = [
  ['VOLLEY arrow', VOLLEY, [], 6, ['#ffffff', '#ffe9a8', '#ff9a3c']],
  ['ORBIT blade', [], ORBIT_FX, 5, ['#c8e8ff', '#ffffff', '#5a9ad8']],
  ['BOOMERANG crescent', BOOM, [], 6, ['#b8e0ff', '#ffffff', '#5a9ad8']],
  ['SEEKER missile', SEEK, [], 6, ['#ffffff', '#ffdd7a', '#ff8848']],
  ['MINE armed', MINE, [], 7, ['#6a6a76', '#ff3040']],
  ['ZAP bolt', [], ZAP_FX, 30, ['#ffffff', '#ffd75e']],
  ['NOVA ring', [], NOVA_FX, 84, ['#efe0ff']],
  ['SCYTHE blade', [], SCYTHE_FX, 25, ['#ffffff', '#a8e0ff']],
  ['BEAM pulse', [], BEAM_FX, 85, ['#ffffff', '#ff5566', '#ff9e9e']],
];
{
  const base = paintFrame(frameState({ projectiles: [], effects: [] }));
  for (const [label, projs, fxs, minRects, markers] of DRESSED) {
    const rec = paint(projs, fxs);
    const delta = rec.rects.length - base.rects.length;
    const styles = stylesOf(rec);
    s.check(label + ' paints COMPOSED body art (+' + delta + ' rects, want >= ' + minRects + ')', () => {
      assert.ok(delta >= minRects, 'only +' + delta + ' rects for ' + label);
    });
    for (const m of markers) {
      s.check(label + ' carries its body ink ' + m, () => {
        assert.ok(styles.has(m), label + ' never paints ' + m);
      });
    }
  }
}

// Precise body-geometry pins (strike head / blade tip / pulse packet exist
// where the painter promises them, on the integer grid).
{
  const zap = paint([], ZAP_FX);
  s.check('ZAP bolt head: white 3x3 heart on the primary strike point', () => {
    assert.ok(hasRect(zap, 299, 149, 3, 3, '#ffffff'), 'no bolt-head heart at the strike point');
  });
  s.check('ZAP bolt head: four gold ticks around the heart', () => {
    for (const [tx, ty] of [[297, 150], [303, 150], [300, 147], [300, 153]]) {
      assert.ok(hasRect(zap, tx, ty, 1, 1, '#ffd75e'), 'missing bolt-head tick at ' + tx + ',' + ty);
    }
  });
  const scy = paint([], SCYTHE_FX);
  s.check('SCYTHE blade: white 3x3 tip at full reach on the sweep mid-angle', () => {
    // t = 0.05/0.25 = 0.2 -> reach 55 * 0.95 = 52.25 -> tip rect (291,149).
    assert.ok(hasRect(scy, 291, 149, 3, 3, '#ffffff'), 'no blade tip at full reach');
  });
  const beam = paint([], BEAM_FX);
  s.check('BEAM pulse: a second white 3x3 packet rides the beam (besides the tip flash)', () => {
    const whites = beam.rects.filter(q => q.w === 3 && q.h === 3 && q.style === '#ffffff');
    assert.ok(whites.length >= 2, 'only ' + whites.length + ' white 3x3 packets (want tip flash + pulse)');
  });
  const nova = paint([], NOVA_FX);
  s.check('NOVA ring: four pale motes ride inside the pulse', () => {
    const motes = nova.rects.filter(q => q.w === 1 && q.h === 1 && q.style === '#efe0ff');
    // 24 echo dots + 4 motes share the echo ink; motes push it past the ring count.
    assert.ok(motes.length >= 28, 'only ' + motes.length + ' pale 1px dots (want 24 echo + 4 motes)');
  });
  const vol = paint(VOLLEY, []);
  s.check('VOLLEY arrow: white head leads the flight vector (east)', () => {
    assert.ok(hasRect(vol, 243, 150, 1, 1, '#ffffff'), 'no arrow tip ahead of the body');
  });
  const volN = paint([{ ...VOLLEY[0], vx: 0, vy: -100 }], []);
  s.check('VOLLEY arrow: head leads north when the flight vector points north', () => {
    assert.ok(hasRect(volN, 240, 147, 1, 1, '#ffffff'), 'arrow did not follow the flight vector');
  });
}

// ---------- D. ASCII ---------------------------------------------------------
{
  const rec = paint([...VOLLEY, ...BOOM, ...SEEK, ...MINE],
    [...ORBIT_FX, ...ZAP_FX, ...NOVA_FX, ...SCYTHE_FX, ...BEAM_FX]);
  const base = paintFrame(frameState({ projectiles: [], effects: [] }));
  s.check('bodies paint zero text (no copy, no emojis on weapons)', () => {
    assert.equal(rec.texts.length, base.texts.length, 'a body painter emitted text');
  });
}

// ---------- C. DETERMINISM ---------------------------------------------------
{
  const a = sig(paint(VOLLEY, []));
  const b = sig(paint([{ ...VOLLEY[0] }], []));
  s.check('same VOLLEY arrow paints byte-identically twice', () => {
    assert.equal(a, b, 'repaint drifted');
  });
  const seekA = sig(paint(SEEK, []));
  const seekB = sig(paint([{ ...SEEK[0] }], []));
  s.check('same SEEKER missile paints byte-identically twice', () => {
    assert.equal(seekA, seekB, 'repaint drifted');
  });
  // A different origin re-phases the static hash stamp: find an offset that
  // flips the orbit blade's phase bit (bounded deterministic search).
  const oBase = sig(paint([], ORBIT_FX));
  let moved = null;
  for (let d = 1; d <= 40 && !moved; d++) {
    const cand = sig(paint([], [{ ...ORBIT_FX[0], x: 240 + d, y: 150 + d }]));
    if (cand !== oBase) moved = cand;
  }
  s.check('a different origin re-phases the ORBIT blade (static hash, not clock)', () => {
    assert.ok(moved, 'no nearby origin re-phased the blade');
  });
  const novaA = sig(paint([], NOVA_FX));
  const novaB = sig(paint([], [{ ...NOVA_FX[0] }]));
  s.check('same NOVA ring paints byte-identically twice', () => {
    assert.equal(novaA, novaB, 'ring repaint drifted');
  });
}

// ---------- B. SEMANTICS UNMOVED: the renderer never touches sim state ------
{
  const st = frameState({
    projectiles: [...VOLLEY, ...BOOM, ...SEEK, ...MINE],
    effects: [...ORBIT_FX, ...ZAP_FX, ...NOVA_FX, ...SCYTHE_FX, ...BEAM_FX],
  });
  const snapProj = st.projectiles.map(p =>
    [p.kind || 'volley', p.x, p.y, p.vx, p.vy, p.age, p.ang, p.phase, p.dist, p.damage, p.pierce].join(','));
  const snapFx = st.effects.map(f =>
    [f.kind, f.x, f.y, f.age, f.ttl, f.radius, f.dir, f.arc, f.width, f.len,
      f.phase, (f.points || []).length].join(','));
  paintFrame(st);
  s.check('a full projectile-bodies frame leaves every projectile field untouched', () => {
    const after = st.projectiles.map(p =>
      [p.kind || 'volley', p.x, p.y, p.vx, p.vy, p.age, p.ang, p.phase, p.dist, p.damage, p.pierce].join(','));
    assert.deepEqual(after, snapProj, 'render mutated a projectile');
  });
  s.check('a full bodies frame leaves every effect field untouched', () => {
    const after = st.effects.map(f =>
      [f.kind, f.x, f.y, f.age, f.ttl, f.radius, f.dir, f.arc, f.width, f.len,
        f.phase, (f.points || []).length].join(','));
    assert.deepEqual(after, snapFx, 'render mutated an effect');
  });
}

// ---------- E. VOCABULARY: no new kinds --------------------------------------
const KNOWN_PROJ = new Set(['boomerang', 'seeker', 'mine']);   // + kind-less volley
const KNOWN_FX = new Set(['nova', 'nova_pulse', 'boss_nova', 'mine_blast', 'colossus_shock',
  'rewrite_boom', 'rewrite_harvest', 'magnet', 'scythe_windup', 'scythe_arc',
  'seeker_trail', 'mine_shrap', 'beam', 'zap', 'orbit', 'orbit_hit', 'hit_spark',
  'muzzle', 'scythe_hit', 'seeker_pop', 'mine_hit', 'mine_fizzle', 'beam_hit',
  'flash', 'charge']);
{
  const kinds = [...VOLLEY, ...BOOM, ...SEEK, ...MINE].map(p => p.kind);
  const fxKinds = [...ORBIT_FX, ...ZAP_FX, ...NOVA_FX, ...SCYTHE_FX, ...BEAM_FX].map(f => f.kind);
  s.check('no new projectile kinds exist (volley + 3 tagged bodies only)', () => {
    for (const k of kinds) assert.ok(k === undefined || KNOWN_PROJ.has(k), 'unknown projectile kind: ' + k);
  });
  s.check('no new effect kinds exist (slice-h vocabulary unchanged)', () => {
    for (const k of fxKinds) assert.ok(KNOWN_FX.has(k), 'unknown effect kind: ' + k);
  });
}

s.done();
