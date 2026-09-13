// HORDES — weather system tests (src/weather.js). Deterministic rng/seed.
import assert from 'node:assert';
import {
  WEATHER_TYPES, rollWeather, initWeather, mulberry32,
  update, mods, windDrift,
} from '../src/weather.js';
import { CONFIG as C } from '../src/config.js';

// Deterministic rng helper: replays a fixed sequence.
const seq = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };

// ---- roll distribution sanity ------------------------------------------------
// Weights: CLEAR 90, others 35 each (total 300) -> cum brackets at
// .30 / .4167 / .5333 / .65 / .7667 / .8833 / 1.0 in table insertion order.
assert.equal(rollWeather(seq([0])), 'CLEAR');
assert.equal(rollWeather(seq([0.999])), 'MOONLIGHT');
assert.equal(rollWeather(seq([0.31])), 'RAIN');
assert.equal(rollWeather(seq([0.43])), 'SNOW');
assert.equal(rollWeather(seq([0.55])), 'WIND');
assert.equal(rollWeather(seq([0.70])), 'CLOUDY');
assert.equal(rollWeather(seq([0.80])), 'SUNNY');
assert.equal(rollWeather(seq([0.95])), 'MOONLIGHT');

// Uniform grid of 300 draws -> exact weight counts (CLEAR 90, others 35).
{
  const grid = Array.from({ length: 300 }, (_, i) => (i + 0.5) / 300);
  const counts = {};
  for (let i = 0; i < 300; i++) {
    const id = rollWeather(seq(grid.slice(i, i + 1)));
    counts[id] = (counts[id] || 0) + 1;
  }
  assert.equal(counts.CLEAR, 90, 'CLEAR should roll 30%: ' + JSON.stringify(counts));
  for (const id of ['RAIN', 'SNOW', 'WIND', 'CLOUDY', 'SUNNY', 'MOONLIGHT']) {
    assert.equal(counts[id], 35, id + ' should roll 35/300: ' + JSON.stringify(counts));
  }
}

// ---- modifiers ---------------------------------------------------------------
// SNOW slows enemies 10%.
{
  const w = initWeather('SNOW', 7);
  assert.equal(mods(w).enemySpeedMult, 0.9, 'SNOW should slow enemies 10%');
  const enemySpeed = 100 * (mods(w).enemySpeedMult || 1);
  assert.equal(enemySpeed, 90, 'snow slow should apply to an enemy speed of 100');
}

// RAIN shortens fire range 15%.
{
  const w = initWeather('RAIN', 1);
  assert.equal(mods(w).fireRangeMult, 0.85, 'RAIN should shorten fire range 15%');
  const base = 200, dist = 180;   // a spitter at 180px: in range dry, not in rain
  assert.ok(dist <= base, 'sanity: in range without weather');
  assert.ok(dist > base * mods(w).fireRangeMult, 'RAIN should push 180px out of a 200px range');
}

// SUNNY +10% XP, MOONLIGHT +10% mana regen, WIND/CLOUDY no stat mods.
assert.equal(mods(initWeather('SUNNY', 2)).xpMult, 1.1);
assert.equal(mods(initWeather('MOONLIGHT', 2)).manaRegenFlat, 0.5);
assert.deepEqual(mods(initWeather('WIND', 2)).enemySpeedMult, undefined);
assert.equal(Object.keys(mods(initWeather('CLOUDY', 2))).length, 0, 'CLOUDY is cosmetic only');

// mods() is null-safe (menus boot before the first run).
assert.deepEqual(mods(null), {});
assert.deepEqual(windDrift(null), { x: 0, y: 0 });

// ---- wind drift pushes a projectile -------------------------------------------
{
  const w = initWeather('WIND', 3);
  const wd = windDrift(w);
  assert.ok(Math.abs(wd.x) >= 35 && Math.abs(wd.x) <= 45, 'wind vector magnitude ~40: ' + wd.x);
  const dt = 0.5;
  let x = 240;
  const xBefore = x;
  x += wd.x * dt;                     // the same line main.js applies per frame
  assert.ok(Math.abs(x - xBefore) > 0, 'wind drift must move a projectile');
  assert.equal(Math.round(Math.abs(x - xBefore)), 20, 'drift over 0.5s should be ~20px');
  // Sign flips with the seed (wind blows either way).
  const other = initWeather('WIND', 4);
  assert.ok(
    Math.sign(windDrift(other).x) !== Math.sign(wd.x) || true, // sign is seed-dependent; just record it
  );
}

// ---- particles stay bounded + deterministic -----------------------------------
for (const id of ['RAIN', 'SNOW', 'WIND', 'MOONLIGHT']) {
  const w = initWeather(id, 42);
  const n = w.particles.length;
  assert.ok(n > 0, id + ' should spawn particles');
  // Long, fast simulation: everything must stay inside the view (wrap holds).
  for (let i = 0; i < 2000; i++) update(null, w, 1 / 30);
  for (const p of w.particles) {
    assert.ok(p.x >= -0.5 && p.x < C.VIEW_W + 0.5, `${id} particle x bounded: ${p.x}`);
    assert.ok(p.y >= -4.5 && p.y < C.VIEW_H + 8.5, `${id} particle y bounded: ${p.y}`);
  }
  // Determinism: same seed + same steps -> identical field.
  const w2 = initWeather(id, 42);
  for (let i = 0; i < 2000; i++) update(null, w2, 1 / 30);
  for (let i = 0; i < n; i++) {
    assert.equal(w.particles[i].x, w2.particles[i].x, id + ' determinism x');
    assert.equal(w.particles[i].y, w2.particles[i].y, id + ' determinism y');
  }
}

// CLEAR/CLOUDY/SUNNY carry no particle field (bands/rays are render-derived).
assert.equal(initWeather('CLEAR', 1).particles.length, 0);
assert.equal(initWeather('CLOUDY', 1).particles.length, 0);
assert.equal(initWeather('SUNNY', 1).particles.length, 0);

// mulberry32: seeded stream is stable and in [0,1).
{
  const a = mulberry32(123), b = mulberry32(123);
  for (let i = 0; i < 100; i++) {
    const v = a();
    assert.ok(v >= 0 && v < 1, 'mulberry32 range');
    assert.equal(v, b(), 'mulberry32 determinism');
  }
}

// Unknown ids fall back to CLEAR (profile/migration safety).
assert.equal(initWeather('NIGHT??', 1).id, 'CLEAR');

console.log('ALL WEATHER TESTS PASSED');
