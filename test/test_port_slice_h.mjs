// HORDES — PORT SLICE H: combat / hit VFX juice.
// Run: node test/test_port_slice_h.mjs
//
// The slice re-dresses ONLY the render.js effect painters (visual-only):
// weapon-hit impacts (hit_spark, orbit_hit, scythe_hit, seeker_pop,
// mine_hit, mine_fizzle, beam_hit, muzzle), kill/tell rings (nova,
// nova_pulse, boss_nova, mine_blast, colossus_shock + the loot-tell magnet),
// shrapnel/beam/zap/scythe accents. Triggers, ttls, radii, pool bounds and
// aging are byte-identical — this file pins BOTH sides:
//
//   A. COMPOSITION — each dressed kind paints ORIGINAL multi-part art
//      (core + cross/ring + hash-phased crackle), in its own palette,
//      through the real R.render frame path with a recording ctx.
//   B. SEMANTICS UNMOVED — live volley fire pushes hit_spark with the same
//      ttls as before (0.12 hit / 0.15 crit); planted effects age out by dt
//      at the same SIM time at 60Hz and 120Hz; no new effect kinds exist.
//   C. DETERMINISM — the same effect paints byte-identically twice;
//      a different origin phases differently (static hash stamp, no clock).
//   D. ASCII — no effect painter emits text (no emojis anywhere near the fx).
import { boot, suite } from './_harness.mjs';
import { Renderer } from '../src/render.js';
import { makePlayer } from '../src/entities.js';
import { makeTypedEnemy } from '../src/enemy_types.js';
import assert from 'node:assert';

const s = suite('port slice H: combat hit VFX');

// ---------- recording ctx + minimal frame state (test_render_hud pattern) ----
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
function paint(effects) {
  const { ctx, rec } = makeCtx();
  const canvas = { width: 0, height: 0, getContext: () => ctx,
    getBoundingClientRect: () => ({ width: 0, height: 0 }) };
  ctx.canvas = canvas;
  const R = new Renderer(canvas);
  const st = frameState({ effects: effects.map(e => ({ ...e })) });
  R.render(st, { x: 0, y: 0 });
  return rec;
}
const stylesOf = (rec) => new Set(rec.rects.map(q => q.style));

// A. COMPOSITION — one dressed kind per check, through the real frame path.
// Expected ORIGINAL bits per kind (kind -> [min new rects, marker styles]):
// hit_spark: white core + gold cross + #fff2c0 diagonal crackle (was: 1 square).
// orbit_hit: white core + #c8e8ff 8-tick ring + #5a9ad8 flecks (was: 1 square).
// boss_nova: outer ring + #ffd7e0 inner echo + crackle + ticks (was: 1 ring).
// mine_blast: outer amber ring + #fff2c0 echo + crackle (was: 1 ring).
// nova_pulse: violet ring + #efe0ff echo (was: 1 ring).
// beam_hit: white core + #ff5566 cross + #ff9e9e diagonals (was: 1 square).
// seeker_pop: gold core + ember halo (was: 1 square).
// scythe_hit: white core + #a8e0ff trailer (was: 1 square).
// mine_hit: gold core + ember cross + crackle (was: 1 square + fixed flecks).
// mine_fizzle: grey tri-mote puff (was: 1 square).
// muzzle: hot core + side ticks (was: 1 square).
const DRESSED = [
  ['hit_spark', { kind: 'hit_spark', x: 240, y: 150, age: 0.02, ttl: 0.12 }, 7, ['#ffffff', '#fff2c0']],
  ['orbit_hit', { kind: 'orbit_hit', x: 240, y: 150, age: 0.03, ttl: 0.1 }, 10, ['#ffffff', '#c8e8ff']],
  ['boss_nova', { kind: 'boss_nova', x: 240, y: 150, age: 0.1, ttl: 0.5, radius: 30 }, 60, ['#ffd7e0']],
  ['mine_blast', { kind: 'mine_blast', x: 240, y: 150, age: 0.07, ttl: 0.35, radius: 40 }, 60, ['#fff2c0']],
  ['nova_pulse', { kind: 'nova_pulse', x: 240, y: 150, age: 0.06, ttl: 0.3, radius: 24 }, 60, ['#efe0ff']],
  ['beam_hit', { kind: 'beam_hit', x: 240, y: 150, age: 0.02, ttl: 0.15 }, 7, ['#ffffff', '#ff9e9e']],
  ['seeker_pop', { kind: 'seeker_pop', x: 240, y: 150, age: 0.02, ttl: 0.12 }, 5, ['#ffdd7a']],
  ['scythe_hit', { kind: 'scythe_hit', x: 240, y: 150, age: 0.02, ttl: 0.15 }, 3, ['#ffffff', '#a8e0ff']],
  ['mine_hit', { kind: 'mine_hit', x: 240, y: 150, age: 0.02, ttl: 0.12 }, 7, ['#ffd75e']],
  ['mine_fizzle', { kind: 'mine_fizzle', x: 240, y: 150, age: 0.02, ttl: 0.15 }, 3, []],
  ['muzzle', { kind: 'muzzle', x: 248, y: 150, age: 0.02, ttl: 0.08 }, 3, ['#ffe9a8']],
];
{
  const base = paint([]);
  for (const [kind, fx, minRects, markers] of DRESSED) {
    const rec = paint([fx]);
    const delta = rec.rects.length - base.rects.length;
    const styles = stylesOf(rec);
    const baseStyles = stylesOf(base);
    s.check(kind + ' paints COMPOSED original art (+' + delta + ' rects, want >= ' + minRects + ')', () => {
      assert.ok(delta >= minRects, 'only +' + delta + ' rects for ' + kind);
    });
    for (const m of markers) {
      s.check(kind + ' carries its marker ink ' + m, () => {
        assert.ok(styles.has(m), kind + ' never paints ' + m);
        if (kind === 'boss_nova' || kind === 'mine_blast' || kind === 'nova_pulse' || kind === 'hit_spark') {
          assert.ok(!baseStyles.has(m), 'marker ' + m + ' must come from the effect, not the baseline frame');
        }
      });
    }
  }
}

// D. ASCII — the dressed painters emit geometry only, never text.
{
  const rec = paint(DRESSED.map(d => d[1]));
  const base = paint([]);
  s.check('effects paint zero text (no copy, no emojis in VFX)', () => {
    assert.equal(rec.texts.length, base.texts.length, 'an effect painted text');
  });
}

// C. DETERMINISM — same effect, same age: byte-identical rects at 60/120Hz
// paint granularity; a different origin re-phases (never wall clock).
{
  const fx = { kind: 'hit_spark', x: 240, y: 150, age: 0.02, ttl: 0.12 };
  const a = paint([fx]).rects.map(q => [q.x, q.y, q.w, q.h, q.style].join(',')).join('|');
  const b = paint([{ ...fx }]).rects.map(q => [q.x, q.y, q.w, q.h, q.style].join(',')).join('|');
  s.check('same hit_spark paints byte-identically twice', () => {
    assert.equal(a, b, 'repaint drifted');
  });
  const moved = paint([{ ...fx, x: 251, y: 163 }]).rects
    .map(q => [q.x, q.y, q.w, q.h, q.style].join(',')).join('|');
  s.check('a different origin re-phases the crackle (static hash, not clock)', () => {
    assert.notEqual(a, moved, 'origin change did not re-phase');
  });
  const ring = { kind: 'boss_nova', x: 240, y: 150, age: 0.1, ttl: 0.5, radius: 30 };
  const r1 = paint([ring]).rects.map(q => [q.x, q.y, q.w, q.h, q.style].join(',')).join('|');
  const r2 = paint([{ ...ring }]).rects.map(q => [q.x, q.y, q.w, q.h, q.style].join(',')).join('|');
  s.check('same boss_nova paints byte-identically twice', () => {
    assert.equal(r1, r2, 'ring repaint drifted');
  });
}

// B. SEMANTICS UNMOVED — the live volley seam still fires hit_spark with the
// shipped ttls (0.12 per hit, 0.15 crit variant); aging is dt-driven (a 0.12s
// spark clears in 8 frames at 60Hz and 16 at 120Hz — same SIM time); the
// effect pool stays bounded in live combat; no new kinds exist.
const KNOWN = new Set(['nova', 'nova_pulse', 'boss_nova', 'mine_blast', 'colossus_shock',
  'rewrite_boom', 'rewrite_harvest', 'magnet', 'scythe_windup', 'scythe_arc',
  'seeker_trail', 'mine_shrap', 'beam', 'zap', 'orbit', 'orbit_hit', 'hit_spark',
  'muzzle', 'scythe_hit', 'seeker_pop', 'mine_hit', 'mine_fizzle', 'beam_hit',
  'flash', 'charge']);
{
  const h = await boot({ variant: 'slice-h-live' });
  h.T.startRun();
  const st = h.state, p = st.player;
  st.spawnTimer = 9999;
  if (st.wave) st.wave.endsAt = st.time + 9999;
  st.enemies.length = 0;
  p.stats.crit = 0;   // crits off: every spark must be the plain-hit ttl
  for (let i = 0; i < 3; i++) {
    const e = makeTypedEnemy('GRUNT', p.x + 40 + i * 30, p.y, st.time);
    e.hp = e.maxHp = 1e9; e.speed = 0;
    st.enemies.push(e);
  }
  st.effects.length = 0;
  let sawSpark = false;
  const sparkTtls = new Set(), kinds = new Set();
  let maxAlive = 0;
  h.pump(240, () => {   // 4s of live volley fire; sample EVERY frame (ttl 0.12 ≈ 7 frames)
    for (const fx of st.effects) {
      kinds.add(fx.kind);
      if (fx.kind === 'hit_spark') { sawSpark = true; sparkTtls.add(fx.ttl); }
    }
    if (st.effects.length > maxAlive) maxAlive = st.effects.length;
  });
  const sparks = st.effects.filter(fx => fx.kind === 'hit_spark');
  s.check('live volley fire pushes hit_spark through the real seam', () => {
    assert.ok(sawSpark, 'no hit_spark from 4s of live volley fire');
  });
  s.check('every live hit_spark carries a shipped ttl (0.12 hit / 0.15 crit: ' + [...sparkTtls].join(',') + ')', () => {
    assert.ok(sparkTtls.size > 0, 'no spark ttls sampled');
    for (const ttl of sparkTtls) {
      assert.ok(ttl === 0.12 || ttl === 0.15, 'hit_spark ttl moved: ' + ttl);
    }
  });
  s.check('no new effect kinds exist (pool vocabulary unchanged)', () => {
    for (const k of kinds) assert.ok(KNOWN.has(k), 'unknown effect kind: ' + k);
  });
  s.check('the live effect pool stays bounded (max ' + maxAlive + ' alive)', () => {
    assert.ok(maxAlive < 500, 'pool unbounded: ' + maxAlive);
  });
}
{
  // dt-driven aging: plant one spark, pump at both rates, compare SIM time.
  const plant = async (frameMs) => {
    const h = await boot({ variant: 'slice-h-age-' + frameMs });
    h.T.startRun();
    const st = h.state;
    st.spawnTimer = 9999;
    if (st.wave) st.wave.endsAt = st.time + 9999;
    st.enemies.length = 0;
    st.effects.length = 0;
    const mine = { kind: 'hit_spark', x: st.player.x, y: st.player.y, age: 0, ttl: 0.12 };
    st.effects.push(mine);
    h.setFrameMs(frameMs);
    const t0 = st.time;
    let frames = 0;
    while (st.effects.includes(mine) && frames < 100) { h.pump(1); frames++; }
    return { frames, simMs: (st.time - t0) * 1000 };
  };
  const at60 = await plant(1000 / 60);
  const at120 = await plant(1000 / 120);
  s.check('a 0.12s spark clears after ~120ms of SIM time at 60Hz (' + at60.simMs.toFixed(1) + 'ms)', () => {
    assert.ok(at60.simMs >= 110 && at60.simMs <= 160, 'cleared at ' + at60.simMs + 'ms sim');
  });
  s.check('same at 120Hz (' + at120.simMs.toFixed(1) + 'ms, ' + at120.frames + ' frames vs ' + at60.frames + ' at 60Hz) — aging rides dt, not frames', () => {
    assert.ok(at120.simMs >= 110 && at120.simMs <= 160, 'cleared at ' + at120.simMs + 'ms sim');
    assert.ok(Math.abs(at120.frames - at60.frames * 2) <= 1, at120.frames + ' vs 2x' + at60.frames + ' frames');
  });
}

s.done();
