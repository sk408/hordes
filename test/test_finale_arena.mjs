// R7 THE FINALE ARENA (src/finale_arena.js; docs/REVIEW_2026-11.md R7):
//   1. WHEN: the arena shows in the Maw's fight and the screens over it, and
//      goes the moment the fight ends (a win, a new run). It fades in from
//      sim time (or the arrival sting's clock) and never steps back.
//   2. THE FLOOR: every stage's floor turns to the void, no lighter than the
//      Void Reach's own floor, so everything reads at least as well as there.
//   3. THE CRACKS: they run out from the Maw (so they point at it), the
//      pulse travels in toward it, a wind-up makes them brighter, reduced
//      motion stops the pulse, and their colours are palette violets far
//      from every reserved family.
//   4. THE SHAKE: each Maw attack its own weight, all under the shake cap;
//      the SHAKE setting and reduced motion turn it off.
//   5. NO CHANGE TO A RUN: drawing only; no random number; a seeded finale
//      plays the same with the arena drawn or held off.
// Run: node test/test_finale_arena.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { boot, suite } from './_harness.mjs';
import { CONFIG as C } from '../src/config.js';
import { relLum, groundIsLight } from '../src/world_ground.js';
import * as M from '../tools/stage_keys_measure.mjs';
import {
  ARENA, ARENA_DIM, arenaOn, arenaFade, ArenaMemo, arenaTone, crackSegments, crackLevel, windupOf,
  CRACK, CRACK_COLS, CRACK_EDGE, CRACK_GLOW, crackLights, drawCracks,
} from '../src/finale_arena.js';
import { FINAL_BOSS_PHASES as P } from '../src/final_boss.js';
import { inPalette, nearestReserved, RESERVED_DE } from '../src/palette.js';
import { FEEL, shakeOffset, setShakeEnabled, MAW_SHAKE } from '../src/fx/feel.js';
import { LightLayer } from '../src/light.js';

const { check, done } = suite('test_finale_arena');
const STAGES = Object.keys(ARENA_DIM);
const fight = (o = {}) => ({ mode: 'finale', finalBoss: { x: 0, y: 0, age: 3 }, mawDeadline: 100 + C.RUN.MAW_WINDOW, time: 100, ...o });

// ---- 1. when ------------------------------------------------------------------------
check('the arena shows in the fight and the screens over it, never without the Maw', () => {
  for (const m of ['finale', 'death-cine', 'dead', 'draft', 'settings']) assert.ok(arenaOn(fight({ mode: m })), m);
  for (const m of ['playing', 'menu', 'intermission', 'portal-cine', 'escape']) assert.ok(!arenaOn(fight({ mode: m })), m);
  assert.ok(!arenaOn(fight({ finalBoss: null })));
});
check('the fade runs on sim time over FADE_S, and on the sting clock from the Maw\'s rise', () => {
  assert.equal(arenaFade(fight({ time: 100 })), 0);
  assert.ok(Math.abs(arenaFade(fight({ time: 100 + ARENA.FADE_S / 2 })) - 0.5) < 1e-9);
  assert.equal(arenaFade(fight({ time: 100 + ARENA.FADE_S + 1 })), 1);
  // The sting holds the sim at its start: its own clock drives the fade.
  assert.equal(arenaFade(fight(), ARENA.STING_FROM), 0);
  assert.ok(arenaFade(fight(), ARENA.STING_FROM + ARENA.FADE_S / 2) > 0.49);
  assert.equal(arenaFade(fight(), 10), 1);
});
check('the fade never steps back within a fight, and starts again for the next one', () => {
  const memo = new ArenaMemo();
  const s = fight();
  assert.equal(memo.at(s, 3.0), 1);          // the sting ran it to the end
  assert.equal(memo.at(s, null), 1);         // the sting ended; the sim clock is still at the start
  assert.equal(memo.at({ ...s, mode: 'intermission' }), 0);   // the fight is over
  assert.equal(memo.at(fight({ mawDeadline: 500 + C.RUN.MAW_WINDOW, time: 500 })), 0);
});

// ---- 2. the floor -------------------------------------------------------------------
check('every stage\'s floor turns to a void no lighter than the Void Reach\'s own floor', () => {
  const voidMax = Math.max(...M.floorTones('VOID_REACH').map(relLum));
  for (const st of STAGES) {
    for (const t of M.floorTones(st)) {
      const a = arenaTone(st, t, 1);
      assert.ok(relLum(a) <= voidMax + 0.002, `${st} ${t} -> ${a} lum ${relLum(a).toFixed(4)} > void ${voidMax.toFixed(4)}`);
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
      assert.ok(b >= g && r >= g - 2, `${st} ${t} -> ${a} is not violet`);
    }
  }
});
check('the arena keeps a trace of the stage (no flat fill) and k=0 changes nothing', () => {
  for (const st of STAGES) {
    const tones = [...new Set(M.floorTones(st).map((t) => arenaTone(st, t, 1)))];
    assert.ok(tones.length > 1, st);
    for (const t of M.floorTones(st)) assert.equal(arenaTone(st, t, 0), t.toLowerCase());
  }
});

// ---- 3. the cracks ------------------------------------------------------------------
check('the cracks run out from the Maw: every segment ends farther from it than it starts', () => {
  const segs = crackSegments();
  assert.ok(segs.length > 100);
  let out = 0;
  for (const s of segs) if (Math.hypot(s.x1, s.y1) > Math.hypot(s.x0, s.y0)) out++;
  assert.ok(out / segs.length > 0.97, `${out}/${segs.length}`);
  // ...and all round it: every eighth of the circle has a crack.
  const oct = new Set(segs.map((s) => Math.floor(((Math.atan2(s.y1, s.x1) + Math.PI) / (Math.PI * 2)) * 8) % 8));
  assert.equal(oct.size, 8);
});
check('the pulse travels in toward the Maw', () => {
  const peak = (t) => { let best = 0, bd = 0; for (let d = 300; d < 300 + CRACK.WAVE; d++) { const v = crackLevel(d, t, 0, false); if (v > best) { best = v; bd = d; } } return bd; };
  const a = peak(10), b = peak(10.05);
  assert.ok(b < a && a - b < 20, `${a} -> ${b}`);
});
check('a wind-up makes the cracks brighter, most of all near the Maw', () => {
  const mean = (w, d0, d1) => { let s = 0, n = 0; for (let t = 0; t < 2; t += 0.05) for (let d = d0; d < d1; d += 7) { s += crackLevel(d, t, w, false); n++; } return s / n; };
  assert.ok(mean(1, 60, 200) > mean(0, 60, 200) * 1.6);
  assert.ok(mean(1, 60, 200) - mean(0, 60, 200) > mean(1, 450, 600) - mean(0, 450, 600));
  // The wind-up share comes from the Maw's own clock.
  assert.equal(windupOf({ telegraph: false, age: 9 }), 0);
  const end = P.GRACE + P.CYCLE - 0.001;
  assert.ok(windupOf({ telegraph: true, age: end }) > 0.99);
  assert.ok(Math.abs(windupOf({ telegraph: true, age: P.GRACE + P.CYCLE - P.TELEGRAPH / 2 }) - 0.5) < 1e-6);
});
check('reduced motion: no pulse (the cracks hold still in time)', () => {
  for (const d of [80, 200, 410]) for (const w of [0, 0.5]) {
    const v = crackLevel(d, 1, w, true);
    for (let t = 1; t < 3; t += 0.07) assert.equal(crackLevel(d, t, w, true), v);
  }
  let moved = false;
  for (let t = 1; t < 3; t += 0.07) if (crackLevel(200, t, 0, false) !== crackLevel(200, 1, 0, false)) moved = true;
  assert.ok(moved);
});
check('the cracks are palette violets, far from every reserved family (never a threat\'s red-orange)', () => {
  for (const c of [...CRACK_COLS, CRACK_EDGE, CRACK_GLOW]) {
    const n = nearestReserved(c);
    assert.ok(n.de >= RESERVED_DE, `${c} near ${n.fam} ${n.step} dE ${n.de.toFixed(1)}`);
  }
  for (const c of [...CRACK_COLS, CRACK_GLOW]) assert.ok(inPalette(c), c);
});
check('the cracks and their light are bounded: a view draws a capped number', () => {
  const st = fight({ finalBoss: { x: 0, y: 0, age: P.GRACE + P.CYCLE - 0.1, telegraph: true } });
  const view = { x0: -300, y0: -200, x1: 300, y1: 200 };
  const strokes = [];
  const g = { save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() { strokes.push(1); } };
  const r = drawCracks(g, st, { x: 0, y: 0 }, view, 1, false);
  assert.ok(r.segs > 50 && r.wind > 0.8, JSON.stringify(r));
  assert.ok(strokes.length <= CRACK_COLS.length + 1);
  assert.ok(crackLights(st, { x: 0, y: 0 }, view, 1, false).length <= 24);
  assert.equal(drawCracks(g, st, { x: 0, y: 0 }, view, 0, false).segs, 0);
});
check('the weather fades in the arena: no sky tint, its particles faint (they lit the void floor)', () => {
  const src = fs.readFileSync(new URL('../src/render.js', import.meta.url), 'utf8');
  assert.match(src, /g\.globalAlpha = 1 - this\.light\.arenaEase\(state\); this\.drawWeatherSky\(/);
  assert.match(src, /g\.globalAlpha = 1 - 0\.8 \* this\.light\.arenaEase\(state\); this\.drawWeatherParticles\(/);
  const L = new LightLayer();
  assert.equal(L.arenaEase({ mode: 'playing' }), 0);
  assert.equal(L.arenaEase(fight({ time: 200 })), 1);
});
// A context that records what it draws (what the eye would see).
const recorder = () => {
  const ops = [];
  const g = {
    save() {}, restore() {}, beginPath() { ops.push('B'); },
    moveTo(x, y) { ops.push('M' + x.toFixed(2) + ',' + y.toFixed(2)); },
    lineTo(x, y) { ops.push('L' + x.toFixed(2) + ',' + y.toFixed(2)); },
    stroke() { ops.push('S' + g.strokeStyle + '@' + (+g.globalAlpha).toFixed(4) + 'w' + g.lineWidth); },
    fillRect(x, y, w, h) { ops.push('F' + g.globalCompositeOperation + ' ' + g.fillStyle + '@' + (+g.globalAlpha).toFixed(4) + ' ' + [x, y, w, h].join(',')); },
    globalAlpha: 1, globalCompositeOperation: 'source-over',
  };
  return { g, ops };
};
check('LIGHTING OFF: the void floor and the cracks are still drawn (the floor change alone carries the arena)', () => {
  const st = { ...fight({ time: 100 + ARENA.FADE_S + 1 }), stage: 'BONE_DESERT', wave: { num: 10, endsAt: 0 } };
  const lay = new LightLayer();
  const { g, ops } = recorder();
  const out = lay.compose(g, st, { x: 0, y: 0 }, { x0: -300, y0: -200, x1: 300, y1: 200 }, [], [], 0, false);
  assert.equal(out.arena, 1);
  assert.equal(out.arenaFloor, true, 'the floor wash at level 0');
  assert.ok(ops.some((o) => o.startsWith('Fmultiply')), 'the stage floor is dimmed');
  assert.ok(ops.some((o) => o.startsWith('Fsource-over ' + ARENA.TINT)), 'the void violet is laid over');
  assert.ok(out.cracks && out.cracks.segs > 50, 'the cracks at level 0');
});
check('the cracks pulse on sim time only: the same state.time draws the same, whatever the wall clock says', () => {
  const st = fight({ time: 123.4, finalBoss: { x: 0, y: 0, age: P.GRACE + P.CYCLE - 0.3, telegraph: true } });
  const view = { x0: -300, y0: -200, x1: 300, y1: 200 };
  const realNow = performance.now, realDate = Date.now;
  const draw = (wall, time = st.time) => {
    performance.now = () => wall; Date.now = () => wall;
    try {
      const { g, ops } = recorder();
      drawCracks(g, { ...st, time }, { x: 0, y: 0 }, view, 1, false);
      return ops.join('|') + '#' + JSON.stringify(crackLights({ ...st, time }, { x: 0, y: 0 }, view, 1, false));
    } finally { performance.now = realNow; Date.now = realDate; }
  };
  const a = draw(1000), b = draw(1000 + 377.7), c = draw(5e6 + 13);
  assert.equal(a, b); assert.equal(a, c);
  assert.notEqual(draw(1000, st.time + 0.37), a, 'the picture does move with sim time');
});
check('the arena module draws no random number', () => {
  const src = fs.readFileSync(new URL('../src/finale_arena.js', import.meta.url), 'utf8');
  assert.ok(!/Math\.random/.test(src));
});

// ---- the game ------------------------------------------------------------------------
const h = await boot();
const T = h.T, S = T.state;
const startFinale = (stage) => {
  T.stages.select(stage);
  T.startRun();
  h.skipMovie();
  for (let i = 0; i < 30; i++) h.pump(1);
  S.wave.num = 10;
  T.deathCine.startFinale();
  S.finalBoss.hp = S.finalBoss.maxHp = 1e12;
};
const keep = (n) => { for (let i = 0; i < n; i++) { S.player.hp = S.player.stats.maxHp; h.pump(1); } };

check('the game: the floor fades in through the sting, holds for the fight, and the light goes to night', () => {
  startFinale('BONE_DESERT');
  const L = T.renderer.light;
  assert.equal(L.arenaK(S), 0);
  keep(60 * 5);
  assert.equal(S.mode, 'finale');
  assert.equal(L.arenaK(S), 1);
  assert.equal(T.renderer.groundLight, false, 'a light stage draws its actors as on a dark floor in the arena');
  assert.ok(T.renderer.lightOut && T.renderer.lightOut.arena === 1);
  assert.ok(T.renderer.lightOut.night > 0.999, 'night strength');
});
check('the game: the arena\'s floor and cracks never count in the light cost the governor reads', () => {
  // A wall clock that only moves while the arena draws: 40 ms each for the
  // floor and the cracks. The governor must read 0 ms for the light.
  const L = T.renderer.light, realNow = performance.now, realTimer = L.timer;
  let t = 1000, calls = 0;
  performance.now = () => t;
  L.timer = () => { calls++; if (calls % 2 === 0) t += 40; return t; };
  try {
    keep(1);
    assert.equal(L.arenaK(S), 1);
    // (the floor at least: headless Node has no light canvas, so at ON/LOW
    // compose stops before the cracks; the unit check above covers level 0)
    assert.ok(L.arenaMs >= 40 && L.arenaMs % 40 === 0, 'the arena drew and was timed: ' + L.arenaMs);
    assert.equal(T.renderer.lightMs, 0, 'the governor never sees the arena\'s share');
  } finally { performance.now = realNow; L.timer = realTimer; }
  keep(1);
  assert.ok(T.renderer.lightMs >= 0 && T.renderer.lightMs < 50);
});
check('the game: a win ends the arena at once', () => {
  S.finalBoss.hp = 0;   // the hero's last hit (updateFinale checks the pool every step)
  S.player.hp = S.player.stats.maxHp;
  h.pump(1);
  assert.notEqual(S.mode, 'finale');
  h.pump(1);
  assert.equal(T.renderer.light.arenaK(S), 0, S.mode);
});
check('the game: a death in the fight keeps the arena under the death movie; a new run clears it', () => {
  startFinale('VERDANT_HOLLOW');
  keep(60 * 5);
  // The Maw bites a hero on 1 hp (as test_death_movie.mjs does).
  const maw = S.finalBoss;
  for (let i = 0; i < 60 * 10 && S.mode === 'finale'; i++) {
    h.pump(1, () => { if (S.mode === 'finale') { S.player.hp = Math.min(S.player.hp, 1); maw.x = S.player.x; maw.y = S.player.y; } });
  }
  assert.ok(['death-cine', 'dead', 'stats'].includes(S.mode), S.mode);
  assert.equal(T.renderer.light.arenaK(S), 1);
  T.startRun(); h.skipMovie(); h.pump(2);
  assert.equal(T.renderer.light.arenaK(S), 0);
  assert.equal(T.renderer.groundLight !== undefined, true);
});
check('the shake: the wind-up rumbles, the barrage kicks harder, all under the cap; off by setting or reduced motion', () => {
  startFinale('VOID_REACH');
  keep(60 * 4);
  let tele = 0, barrage = 0, top = 0;
  const f = S.feel;
  for (let i = 0; i < 60 * 12; i++) {
    const before = S.enemyShots.filter((s) => s.kind === 'maw').length;
    S.player.hp = S.player.stats.maxHp; S.player.invuln = 1;
    h.pump(1);
    top = Math.max(top, f.shake);
    if (S.finalBoss.telegraph) tele = Math.max(tele, f.shake);
    const now = S.enemyShots.filter((s) => s.kind === 'maw' && s.age < 0.05).length;
    if (now > 0 && before < now) barrage = Math.max(barrage, f.shake);
  }
  assert.ok(tele >= MAW_SHAKE.WINDUP_MIN && tele <= MAW_SHAKE.WINDUP_MAX + 1e-9, `wind-up ${tele}`);
  assert.ok(barrage >= MAW_SHAKE.BARRAGE_FAR - 0.5 && barrage > tele, `barrage ${barrage} wind-up ${tele}`);
  assert.ok(top <= FEEL.SHAKE_MAX);
  assert.ok(MAW_SHAKE.BITE <= FEEL.SHAKE_MAX && MAW_SHAKE.BITE >= MAW_SHAKE.BARRAGE);
  f.shake = 4; f.shakeT = 0.37;
  assert.notDeepEqual(shakeOffset(S, false), { x: 0, y: 0 });
  assert.deepEqual(shakeOffset(S, true), { x: 0, y: 0 });
  setShakeEnabled(false);
  assert.deepEqual(shakeOffset(S, false), { x: 0, y: 0 });
  setShakeEnabled(true);
});
check('the shake: a bite (the Maw\'s body reaching the hero) is the heaviest', () => {
  startFinale('VOID_REACH');
  keep(60 * 4);
  const f = S.feel;
  f.shake = 0;
  S.player.invuln = 0;
  S.finalBoss.x = S.player.x; S.finalBoss.y = S.player.y;
  h.pump(1);
  assert.ok(typeof S.volleyMask === 'string' && S.volleyMask.startsWith('body'), String(S.volleyMask));
  assert.ok(f.shake >= MAW_SHAKE.BITE - 0.5, `bite ${f.shake}`);
});

// ---- 5. no change to a run ------------------------------------------------------------
const { spawnSync } = await import('node:child_process');
const play = (v) => {
  const r = spawnSync(process.execPath, ['--import', './test/_seed_random.mjs', 'test/_finale_run.mjs', v],
    { cwd: new URL('..', import.meta.url), env: { ...process.env, HORDES_RNG: '11' }, encoding: 'utf8', timeout: 120000 });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim().split(/\r?\n/).pop();
};
check('a seeded finale plays the same with the arena drawn, held off, and with the light OFF', () => {
  const on = play('ON'), off = play('HELD'), dark = play('OFF');
  const j = JSON.parse(on);
  assert.ok(j.frames > 600 && j.mawShots > 0, on);
  assert.equal(on, off);
  assert.equal(on, dark);
});
done();
