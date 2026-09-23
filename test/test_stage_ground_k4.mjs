// HORDES — headless tests for PORT SLICE K4: weather-reactive ground tiles
// (owner feedback 2026-09-23: "maybe have different tiles impacted by the
// weather also in a subtle way").
// Run: node test/test_stage_ground_k4.mjs
//
// WHAT THIS PINS (every K3 guarantee re-verified UNDER weather):
//   1. WEATHER STATES — GROUND_WEATHER_IDS matches src/weather.js
//      WEATHER_TYPES keys exactly (the ACTUAL states, not invented ones).
//   2. PER-STATE REACTION — each of the 6 non-CLEAR states measurably changes
//      the floor vs clear (rect-geometry proof) on VERDANT_HOLLOW and
//      BONE_DESERT (2 biomes) in the canonical view.
//   3. CLEAR RESTORATION — 'CLEAR'/undefined/null/unknown/{} all paint
//      byte-identically to the unweathered K3 floor (reversible); a weathered
//      view returned to CLEAR matches a fresh CLEAR view (stateless).
//   4. DETERMINISM — pure function of (seed, stage, wave, weather id): same
//      5-tuple repaints byte-identically; weather.time NEVER leaks into the
//      ground (a 100-step-aged storm grounds like a fresh one); the wx gate
//      is stable per (cell, seed, stage, weather).
//   5. K3 VARIETY HELD — the motif mix is weather-independent (same motifs
//      painted with/without weather) and every biome still paints >= 2
//      motifs in one view under RAIN.
//   6. RECOLOR HELD — under SNOW, same stage + seed at two waves: identical
//      geometry, different colors (all 8 stages recolor).
//   7. PERF SHAPE — worst view over 8 stages x 7 weathers paints < 1600 rects
//      (K3 bound retained; measured value printed).
//   8. RIM CLIP — no weathered ground rect paints past the arena rim.
//   9. PALETTE-KEYS-ONLY — every style in a weathered render is a value of
//      the active wave theme (ZERO new colors; the section-1 tile budget
//      holds); no rgba/hex literals leak through drawGround.
//  10. VISUAL-ONLY — the K4 helpers carry no sim numbers and read no clock.
import {
  STAGE_GROUND_IDS, stageGroundSpec,
  GROUND_WEATHER_IDS, normGroundWeather, groundWxFor,
} from '../src/stage_ground.js';
import { Renderer, groundTheme } from '../src/render.js';
import { CONFIG as C } from '../src/config.js';
import { STAGE_IDS } from '../src/stages.js';
import { WEATHER_TYPES, initWeather, update } from '../src/weather.js';

let failed = 0;
function ok(cond, msg) {
  if (cond) { console.log('  PASS ' + msg); }
  else { failed++; console.error('  FAIL ' + msg); }
}

// ---------- recording 2d context (the test_stage_ground.mjs pattern) --------
function makeRenderer() {
  const rec = { rects: [] };
  const ctx = {
    canvas: null,
    fillStyle: '#000000', globalAlpha: 1,
    setTransform() {}, translate() {}, scale() {}, save() {}, restore() {},
    fillRect(x, y, w, h) {
      rec.rects.push({ x, y, w, h, style: String(ctx.fillStyle) });
    },
  };
  const canvas = {
    width: 0, height: 0,
    getContext: () => ctx,
    getBoundingClientRect: () => ({ width: 0, height: 0 }),
  };
  ctx.canvas = canvas;
  return { R: new Renderer(canvas), rec, ctx };
}
const geo = (R, rec, ctx, seed, cam, wave, stage, wx) => {
  rec.rects.length = 0;
  R.drawGround(ctx, seed, cam, groundTheme(wave), stage, wx);
  return rec.rects.map(q => q.x + ',' + q.y + ',' + q.w + ',' + q.h).join('|');
};
const full = (R, rec, ctx, seed, cam, wave, stage, wx) => {
  rec.rects.length = 0;
  R.drawGround(ctx, seed, cam, groundTheme(wave), stage, wx);
  return rec.rects.map(q => q.x + ',' + q.y + ',' + q.w + ',' + q.h + ',' + q.style).join('|');
};
const styles = (R, rec, ctx, seed, cam, wave, stage, wx) => {
  rec.rects.length = 0;
  R.drawGround(ctx, seed, cam, groundTheme(wave), stage, wx);
  return [...new Set(rec.rects.map(q => q.style))].sort().join(' ');
};
const motifsPainted = (R, rec, ctx, seed, cam, wave, stage, wx) => {
  rec.rects.length = 0;
  R.drawGround(ctx, seed, cam, groundTheme(wave), stage, wx);
  return [...(R.groundMotifs || [])];
};

const CAM = { x: 0, y: 0 };
const WX6 = GROUND_WEATHER_IDS.filter(w => w !== 'CLEAR');

console.log('WEATHER STATES (the actual hordes states, not invented ones):');
{
  const wkeys = Object.keys(WEATHER_TYPES);
  ok(JSON.stringify([...GROUND_WEATHER_IDS].sort()) === JSON.stringify([...wkeys].sort()),
    'GROUND_WEATHER_IDS matches WEATHER_TYPES keys (' + GROUND_WEATHER_IDS.join(',') + ')');
  ok(WX6.length === 6, 'six non-CLEAR weather states react (' + WX6.join(',') + ')');
  ok(normGroundWeather('RAIN') === 'RAIN', 'string id normalizes to itself');
  ok(normGroundWeather(undefined) === 'CLEAR', 'undefined normalizes to CLEAR');
  ok(normGroundWeather(null) === 'CLEAR', 'null normalizes to CLEAR');
  ok(normGroundWeather('HURRICANE') === 'CLEAR', 'unknown id normalizes to CLEAR (never throws)');
  ok(normGroundWeather({}) === 'CLEAR', 'garbage object normalizes to CLEAR');
  const w = initWeather('SNOW', 9);
  ok(normGroundWeather(w) === 'SNOW', 'a weather.js instance normalizes via its id');
  ok(normGroundWeather({ def: { id: 'WIND' } }) === 'WIND', 'a { def: { id } } shape normalizes too');
}

console.log('PER-STATE REACTION (each weather measurably changes the floor vs clear):');
{
  const { R, rec, ctx } = makeRenderer();
  for (const wx of WX6) {
    // Canonical view, two biomes (the brief's "per state x at least 2 biomes").
    for (const stage of ['VERDANT_HOLLOW', 'BONE_DESERT']) {
      const a = geo(R, rec, ctx, 4242, CAM, 1, stage);
      const b = geo(R, rec, ctx, 4242, CAM, 1, stage, wx);
      ok(a !== b, wx + '/' + stage + ': floor differs vs clear in the canonical view');
    }
    // No dead weather anywhere: every state answers on EVERY biome over a
    // small seed/camera scan (no state is a no-op on any terrain).
    let answered = 0;
    for (const stage of STAGE_IDS) {
      let diff = false;
      for (const seed of [4242, 11]) for (const cam of [CAM, { x: 480, y: 300 }]) {
        if (geo(R, rec, ctx, seed, cam, 1, stage) !== geo(R, rec, ctx, seed, cam, 1, stage, wx)) { diff = true; break; }
      }
      if (diff) answered++;
    }
    ok(answered === 8, wx + ': answers on all 8 biomes (' + answered + '/8)');
  }
}

console.log('CLEAR RESTORATION (weather clears -> floor byte-returns):');
{
  const { R, rec, ctx } = makeRenderer();
  for (const stage of ['VERDANT_HOLLOW', 'BONE_DESERT', 'SNOWFIELD']) {
    const base = full(R, rec, ctx, 4242, CAM, 1, stage);
    ok(full(R, rec, ctx, 4242, CAM, 1, stage, 'CLEAR') === base,
      stage + ': CLEAR restores byte-identically (geometry + color)');
    ok(full(R, rec, ctx, 4242, CAM, 1, stage, undefined) === base,
      stage + ': absent weather is byte-identical to unweathered (VERDANT back-compat)');
    ok(full(R, rec, ctx, 4242, CAM, 1, stage, null) === base,
      stage + ': null weather is byte-identical to unweathered');
    ok(full(R, rec, ctx, 4242, CAM, 1, stage, 'HURRICANE') === base,
      stage + ': unknown weather is byte-identical to unweathered');
    ok(full(R, rec, ctx, 4242, CAM, 1, stage, {}) === base,
      stage + ': garbage weather is byte-identical to unweathered');
  }
  // Stateless round-trip: weather on, weather off == fresh off.
  for (const wx of WX6) {
    geo(R, rec, ctx, 4242, CAM, 1, 'VOID_REACH', wx);   // weathered view first
    const back = full(R, rec, ctx, 4242, CAM, 1, 'VOID_REACH', 'CLEAR');
    const fresh = full(R, rec, ctx, 4242, CAM, 1, 'VOID_REACH');
    ok(back === fresh, wx + ' -> CLEAR round-trips to a fresh unweathered view (no residue)');
  }
}

console.log('DETERMINISM (seed/stage/wave/weather — never the clock):');
{
  const { R, rec, ctx } = makeRenderer();
  ok(full(R, rec, ctx, 11, { x: 128, y: 96 }, 2, 'BONE_DESERT', 'RAIN') ===
     full(R, rec, ctx, 11, { x: 128, y: 96 }, 2, 'BONE_DESERT', 'RAIN'),
    'same (seed, stage, wave, weather, cam) repaints byte-identically');
  // weather.time never leaks: an aged storm grounds like a fresh one.
  for (const wx of ['RAIN', 'SNOW', 'WIND', 'MOONLIGHT']) {
    const aged = initWeather(wx, 5);
    for (let i = 0; i < 100; i++) update(null, aged, 1 / 30);
    const freshW = initWeather(wx, 5);
    ok(full(R, rec, ctx, 4242, CAM, 1, 'VERDANT_HOLLOW', aged) ===
       full(R, rec, ctx, 4242, CAM, 1, 'VERDANT_HOLLOW', freshW),
      wx + ': weather.time does not leak into the ground (aged == fresh)');
  }
  // String id and live instance agree (the render seam reads the id only).
  const live = initWeather('CLOUDY', 77);
  ok(full(R, rec, ctx, 4242, CAM, 1, 'CINDER_MAW', live) ===
     full(R, rec, ctx, 4242, CAM, 1, 'CINDER_MAW', 'CLOUDY'),
    'instance and id string paint identically (id-only seam)');
  ok(groundWxFor(3, -5, 4242, 'VOID_REACH', 'SNOW') ===
     groundWxFor(3, -5, 4242, 'VOID_REACH', 'SNOW'),
    'wx gate is stable for the same (cell, seed, stage, weather)');
  ok(groundWxFor(3, -5, 4242, 'VOID_REACH', 'CLEAR') === 0,
    'wx gate is 0 under CLEAR (the rest state paints nothing)');
  ok(groundWxFor(3, -5, 4242, 'VOID_REACH', 'NOPE') === 0,
    'wx gate is 0 for unknown weather');
  let varied = false;
  for (let cx = -8; cx < 8 && !varied; cx++) for (let cy = -8; cy < 8 && !varied; cy++) {
    if (groundWxFor(cx, cy, 4242, 'VOID_REACH', 'RAIN') !== groundWxFor(0, 0, 4242, 'VOID_REACH', 'RAIN')) varied = true;
  }
  ok(varied, 'wx gate varies per cell (the reaction is spatial, not a wash)');
  // The gate only ever names 0..2 (the subtle contract: at most two rects).
  let bad = 0;
  for (const wx of WX6) for (let cx = -16; cx < 16; cx++) for (let cy = -16; cy < 12; cy++) {
    const n = groundWxFor(cx, cy, 4242, 'WHITEOUT', wx);
    if (n < 0 || n > 2 || !Number.isInteger(n)) bad++;
  }
  ok(bad === 0, 'wx gate only ever names 0, 1 or 2 extra rects (' + bad + ' violations over the scan)');
}

console.log('K3 VARIETY HELD UNDER WEATHER (stage still sets the motifs):');
{
  const { R, rec, ctx } = makeRenderer();
  // The motif MIX is weather-independent (weather adds speckle, never motifs).
  let mixHeld = 0;
  for (const id of STAGE_IDS) {
    const dry = motifsPainted(R, rec, ctx, 4242, CAM, 1, id).join(',');
    let held = dry === motifsPainted(R, rec, ctx, 4242, CAM, 1, id, 'RAIN').join(',') &&
                dry === motifsPainted(R, rec, ctx, 4242, CAM, 1, id, 'SNOW').join(',');
    if (held) mixHeld++;
  }
  ok(mixHeld === 8, 'all 8 stages hold their motif mix under weather (' + mixHeld + '/8)');
  // One weathered view still carries variety (>= 2 motifs per biome).
  for (const id of STAGE_IDS) {
    const painted = new Set(motifsPainted(R, rec, ctx, 4242, CAM, 1, id, 'RAIN'));
    ok(painted.size >= 2, id + ': one RAIN view still paints >= 2 motifs (' + [...painted].join(',') + ')');
  }
  ok(STAGE_GROUND_IDS.length === 8, 'eight stage grounds still ship (K3 spec untouched)');
  const all = STAGE_GROUND_IDS.flatMap(id => stageGroundSpec(id).motifs);
  ok(all.length === 24 && new Set(all).size === 24, '24 distinct motifs still ship (K3 variety untouched)');
}

console.log('RECOLOR HELD UNDER WEATHER (wave still sets the color):');
{
  const { R, rec, ctx } = makeRenderer();
  const g1 = geo(R, rec, ctx, 4242, CAM, 1, 'VERDANT_HOLLOW', 'SNOW');
  const g4 = geo(R, rec, ctx, 4242, CAM, 4, 'VERDANT_HOLLOW', 'SNOW');
  ok(g1 === g4, 'SNOW geometry is wave-independent (stage + weather set shape)');
  let recolored = 0;
  for (const id of STAGE_IDS) {
    if (styles(R, rec, ctx, 4242, CAM, 1, id, 'SNOW') !==
        styles(R, rec, ctx, 4242, CAM, 4, id, 'SNOW')) recolored++;
  }
  ok(recolored === 8, 'all 8 stages recolor across waves under SNOW (' + recolored + '/8)');
}

console.log('PERF SHAPE (K3 bound retained under weather):');
{
  const { R, rec, ctx } = makeRenderer();
  let worst = 0, where = '';
  for (const id of STAGE_IDS) {
    for (const wx of [undefined, ...GROUND_WEATHER_IDS]) {
      rec.rects.length = 0;
      R.drawGround(ctx, 4242, CAM, groundTheme(1), id, wx);
      if (rec.rects.length > worst) { worst = rec.rects.length; where = id + '/' + (wx || 'unweathered'); }
    }
  }
  ok(worst < 1600, 'worst view over 8 stages x 8 weather lanes paints < 1600 rects (worst ' + worst + ' on ' + where + ')');
}

console.log('RIM CLIP (no weathered ground rect past the arena rim):');
{
  const { R, rec, ctx } = makeRenderer();
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (const wx of ['RAIN', 'SNOW']) {
    for (const id of STAGE_IDS) {
      for (let cx = -C.GROUND.RIM - 200; cx <= C.GROUND.RIM + 200; cx += 96) {
        for (let cy = -C.GROUND.RIM - 200; cy <= C.GROUND.RIM + 200; cy += 96) {
          const cam = { x: cx, y: cy };
          rec.rects.length = 0;
          R.drawGround(ctx, 4242, cam, groundTheme(1), id, wx);
          for (const q of rec.rects) {
            minX = Math.min(minX, q.x + cam.x); maxX = Math.max(maxX, q.x + cam.x);
            minY = Math.min(minY, q.y + cam.y); maxY = Math.max(maxY, q.y + cam.y);
          }
        }
      }
    }
  }
  ok(minX >= -C.GROUND.RIM && maxX <= C.GROUND.RIM &&
     minY >= -C.GROUND.RIM && maxY <= C.GROUND.RIM,
    'weathered ground (RAIN + SNOW, all stages) stays inside +-' + C.GROUND.RIM +
    ' (x ' + minX + '..' + maxX + ', y ' + minY + '..' + maxY + ')');
}

console.log('PALETTE-KEYS-ONLY (ZERO new colors — the section-1 tile budget holds):');
{
  const { R, rec, ctx } = makeRenderer();
  for (const wave of [1, 4]) {
    const themeVals = new Set(Object.values(groundTheme(wave)));
    for (const id of STAGE_IDS) {
      for (const wx of WX6) {
        rec.rects.length = 0;
        R.drawGround(ctx, 4242, CAM, groundTheme(wave), id, wx);
        const alien = rec.rects.map(q => q.style).filter(s => !themeVals.has(s));
        ok(alien.length === 0,
          id + '/' + wx + '/wave' + wave + ': every rect is a theme palette value' +
          (alien.length ? ' (alien: ' + [...new Set(alien)].join(',') + ')' : ''));
      }
    }
  }
}

console.log('VISUAL-ONLY (no sim numbers, no clock in the K4 seam):');
{
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../src/stage_ground.js', import.meta.url), 'utf8');
  ok(!/Date\.now|performance\.now/.test(src), 'stage_ground.js reads no clock');
  const k4src = src.slice(src.indexOf('groundWxFor'));
  ok(!/(damage|xpMult|spawn|price|cost|gold|heal|enemySpeed|fireRange)/i.test(k4src),
    'the K4 gate source carries no sim numbers (hash + gate only)');
  const blob = JSON.stringify(GROUND_WEATHER_IDS).toLowerCase();
  ok(!/(hp|dmg|damage|spawn|price|cost|gold|heal|speed)/.test(blob),
    'weather id list is visual-only vocabulary');
}

if (failed) { console.error('test_stage_ground_k4: ' + failed + ' FAILED'); process.exit(1); }
console.log('test_stage_ground_k4: all checks passed');
