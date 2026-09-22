// HORDES — headless tests for src/stage_buildings.js + the render.js building seam
// (PORT SLICE E: landmark-scale buildings, original art).
// Run: node test/test_stage_buildings.mjs
//
// WHAT THIS PINS:
//   1. FORMAT — every building is an integer rect list ([dx,dy,w,h,key],
//      key 1-9) inside its declared footprint, palette-complete, small
//      (<= 6 keys), landmark-scale (roughly half a LANDMARK_CELL — the whole
//      point of the slice), always COMPOSED (>= 12 rects, margin above the
//      seam's >= 4 floor).
//   2. COPY — ids/names/blurbs are plain ASCII words (no emoji in game copy).
//   3. STAGE COVERAGE — every src/stages.js id resolves to a building;
//      unknown / unset stages fall back to the hollow lodge (never throws).
//   4. PAINT — paintBuilding paints through plain fillRects, honours x/y,
//      and reports the real rect count.
//   5. RENDER SEAM — drawLandmarks paints each stage's building across the
//      arena, stays deterministic per seed, clips the FULL footprint at the
//      rim, keeps every landmark COMPOSED, adds no STUMP/GATE/GROVE outside
//      VERDANT_HOLLOW, and guarantees the stage's building inside the
//      initial spawn view for every seed tried (the slice-D promise,
//      extended — the prop cell is untouched).
//   6. DENSITY INTERACTION — the slice-D prop floor (>= 150 prop cells per
//      stage at seed 4242) still holds: the building pass ADDS landmarks,
//      it replaces no prop. LANDMARK_CELL / LANDMARK_DENSITY are untouched.
//   7. VISUAL-ONLY — the module carries no gameplay numbers, touches no DOM,
//      reads no clock and no sim state; the render.js building block writes
//      no sim state either (source-scan, the test_controllers DOM-purity
//      precedent).
import { readFileSync } from 'node:fs';
import {
  STAGE_BUILDINGS, STAGE_BUILDING_IDS, buildingForStage, paintBuilding,
} from '../src/stage_buildings.js';
import { propForStage } from '../src/stage_props.js';
import { Renderer, groundTheme } from '../src/render.js';
import { CONFIG as C } from '../src/config.js';
import { STAGES } from '../src/stages.js';

let failed = 0;
function ok(cond, msg) {
  if (cond) { console.log('  PASS ' + msg); }
  else { failed++; console.error('  FAIL ' + msg); }
}

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const ASCII = /^[\x20-\x7E]*$/;

console.log('FORMAT (integer rects, palette-keyed, landmark-scale):');
{
  ok(STAGE_BUILDING_IDS.length === 8, 'eight stage buildings ship (' + STAGE_BUILDING_IDS.join(',') + ')');
  ok(new Set(STAGE_BUILDING_IDS).size === 8, 'building ids are unique');
  for (const id of STAGE_BUILDING_IDS) {
    const b = STAGE_BUILDINGS[id];
    const label = 'building/' + id;
    ok(b.id === id, label + ': id is stable');
    ok(b.rectCount === b.rects.length && b.rects.length >= 12,
      label + ': COMPOSED with margin (' + b.rects.length + ' rects, floor 12)');
    ok(b.w >= 60 && b.w <= 120 && b.h >= 60 && b.h <= 110,
      label + ': landmark-scale footprint (' + b.w + 'x' + b.h + ', roughly half a 192px cell)');
    let badCell = 0, overflow = 0;
    const used = new Set();
    for (const r of b.rects) {
      if (!Array.isArray(r) || r.length !== 5 ||
        r.some(v => typeof v !== 'number' || !Number.isInteger(v))) badCell++;
      else {
        const [dx, dy, w, h, k] = r;
        if (w <= 0 || h <= 0 || k < 1 || k > 9) badCell++;
        else {
          used.add(k);
          if (dx < 0 || dy < 0 || dx + w > b.w || dy + h > b.h) overflow++;
        }
      }
    }
    ok(badCell === 0, label + ': every rect is [dx,dy,w,h,key] integers, positive size, key 1-9');
    ok(overflow === 0, label + ': every rect fits the declared footprint (the rim cull trusts it)');
    const keys = Object.keys(b.palette);
    ok(keys.length > 0 && keys.length <= 6, label + ': palette is small (' + keys.length + ' keys)');
    ok(keys.every(k => /^[1-9]$/.test(k)), label + ': palette keys are 1-9');
    ok(keys.every(k => HEX.test(String(b.palette[k]))), label + ': every palette value is #rgb/#rrggbb');
    ok([...used].every(v => b.palette[v]), label + ': every referenced index is defined');
  }
}

console.log('COPY (plain words, no emoji):');
{
  for (const id of STAGE_BUILDING_IDS) {
    const b = STAGE_BUILDINGS[id];
    ok(ASCII.test(id) && ASCII.test(b.name) && ASCII.test(b.blurb),
      'building/' + id + ': id/name/blurb are plain ASCII');
    ok(b.name.length > 0 && b.blurb.length > 0, 'building/' + id + ': carries a name and a blurb');
  }
}

console.log('VISUAL-ONLY (no gameplay numbers, no DOM, no clock, no sim):');
{
  const BANNED_FIELDS = ['hp', 'dmg', 'damage', 'cost', 'price', 'value', 'rarity', 'heal', 'xp'];
  for (const id of STAGE_BUILDING_IDS) {
    const fields = Object.keys(STAGE_BUILDINGS[id]);
    const leak = fields.filter(f => BANNED_FIELDS.includes(f.toLowerCase()));
    ok(leak.length === 0, 'building/' + id + ': carries no gameplay fields (' + fields.join(',') + ')');
  }
  const src = readFileSync(new URL('../src/stage_buildings.js', import.meta.url), 'utf8');
  for (const [pat, why] of [
    [/\bdocument\b/, 'no document access'], [/\bwindow\b/, 'no window access'],
    [/\bstate\b/, 'no sim-state reference'], [/\bplayer\b/, 'no player reference'],
    [/\benemies\b/, 'no enemy reference'], [/\bMath\.random\b/, 'no Math.random (hash field only)'],
    [/\bDate\.now\b/, 'no clock read (repaints are byte-identical)'],
    [/\bhp\b|\bdmg\b|\bdamage\b/, 'no combat numbers'],
  ]) ok(!pat.test(src), 'stage_buildings.js is painting-only: ' + why);
  // The render.js building block paints through g only: slice the block out
  // (PORT SLICE E marker .. the hollow's authored block) and prove it never
  // touches sim state, the DOM, or the clock.
  const rsrc = readFileSync(new URL('../src/render.js', import.meta.url), 'utf8');
  const start = rsrc.indexOf('PORT SLICE E (buildings');
  const end = rsrc.indexOf("THE HOLLOW'S AUTHORED LANDMARKS");
  ok(start > 0 && end > start, 'the slice-E block is delimited in render.js');
  const block = rsrc.slice(start, end);
  for (const [pat, why] of [
    [/state\./, 'never reads/writes sim state'], [/player/, 'never touches the player'],
    [/\benemies\b/, 'never touches enemies'], [/\bdocument\b/, 'no document access'],
    [/\bwindow\b/, 'no window access'], [/\bDate\.now\b/, 'never reads the clock'],
  ]) ok(!pat.test(block), 'render.js slice-E block is painting-only: ' + why);
}

console.log('STAGE COVERAGE:');
{
  for (const s of STAGES) {
    let b = null;
    try { b = buildingForStage(s.id); } catch (e) { b = null; }
    ok(!!b && !!STAGE_BUILDINGS[b.id], 'stage ' + s.id + ' resolves to building ' + (b && b.id));
  }
  ok(buildingForStage(undefined).id === 'HOLLOW_LODGE', 'unset stage falls back to the hollow lodge');
  ok(buildingForStage('NOT_A_STAGE').id === 'HOLLOW_LODGE', 'unknown stage falls back to the hollow lodge');
  const served = new Set(STAGES.map(s => buildingForStage(s.id).id));
  ok(served.size === 8, 'every stage owns a DISTINCT building (' + [...served].join(',') + ')');
}

console.log('KNOBS (new pass, old pins untouched):');
{
  ok(C.GROUND.BUILDING_CELL === 576, 'BUILDING_CELL is 3x LANDMARK_CELL (' + C.GROUND.BUILDING_CELL + ')');
  ok(C.GROUND.BUILDING_DENSITY === 0.22, 'BUILDING_DENSITY is the rare gate (' + C.GROUND.BUILDING_DENSITY + ')');
  ok(C.GROUND.LANDMARK_CELL === 192, 'LANDMARK_CELL untouched (192)');
  ok(C.GROUND.LANDMARK_DENSITY === 0.45, 'LANDMARK_DENSITY untouched (the slice-D owner ruling stands)');
}

console.log('PAINT:');
{
  const calls = [];
  const g = { fillStyle: '#000', fillRect(x, y, w, h) { calls.push({ x, y, w, h, style: String(this.fillStyle) }); } };
  const b = STAGE_BUILDINGS.EMBER_HALL;
  const n = paintBuilding(g, 'EMBER_HALL', 10, 20);
  ok(n === b.rects.length && calls.length === b.rects.length,
    'paintBuilding issues one fillRect per rect (' + n + ')');
  ok(calls.every((q, i) => q.x === 10 + b.rects[i][0] && q.y === 20 + b.rects[i][1]),
    'paintBuilding honours x/y on every rect');
  ok(calls.every((q, i) => q.style === b.palette[b.rects[i][4]]),
    'paintBuilding paints with the building palette');
  ok(paintBuilding(g, 'NOPE', 0, 0) === 0, 'unknown building id paints nothing (0)');
}

console.log('RENDER SEAM (drawLandmarks paints the buildings):');
{
  const mk = () => {
    const rec = { rects: [] };
    const ctx = {
      canvas: null, fillStyle: '#000', globalAlpha: 1, font: '10px monospace',
      textAlign: 'left', textBaseline: 'top', imageSmoothingEnabled: true,
      setTransform() {}, translate() {}, save() {}, restore() {}, clearRect() {},
      beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, arc() {},
      fillRect(x, y, w, h) { rec.rects.push({ x, y, w, h, style: String(this.fillStyle) }); },
      fillText() {},
    };
    const canvas = { width: 0, height: 0, getContext: () => ctx,
      getBoundingClientRect: () => ({ width: 0, height: 0 }) };
    ctx.canvas = canvas;
    return { R: new Renderer(canvas), rec, ctx };
  };
  const sweepKinds = (seed, stage) => {
    const { R, ctx } = mk();
    const kinds = {};
    for (let cx = -900; cx <= 900; cx += 96) {
      for (let cy = -900; cy <= 900; cy += 96) {
        R.drawLandmarks(ctx, seed, { x: cx, y: cy }, groundTheme(1), stage);
        for (const l of R.landmarks) kinds[l.kind] = (kinds[l.kind] || 0) + 1;
      }
    }
    return kinds;
  };
  // Every stage's building appears somewhere in the arena (rare by design —
  // the floor is 1, not 150: buildings ADD, props CARRY).
  for (const s of STAGES) {
    const { R, ctx } = mk();
    const kinds = sweepKinds(4242, s.id);
    const want = buildingForStage(s.id).id;
    ok((kinds[want] || 0) > 0, 'stage ' + s.id + ': ' + want + ' paints (' + (kinds[want] || 0) + ' cells)');
  }
  // Determinism + full-footprint rim clip + composed + hollow-only authored.
  {
    const snap = (seed, stage) => {
      const { R, ctx, rec } = mk();
      R.drawLandmarks(ctx, seed, { x: 128, y: 96 }, groundTheme(1), stage);
      return { seam: R.landmarks.map(l => l.kind + '@' + l.x + ',' + l.y).join('|'),
        rects: rec.rects.map(q => q.x + ',' + q.y + ',' + q.w + ',' + q.h).join('|'),
        counts: R.landmarks.map(l => l.rects) };
    };
    const a = snap(11, 'ASHEN_WASTE'), b = snap(11, 'ASHEN_WASTE'), c = snap(12, 'ASHEN_WASTE');
    ok(a.seam === b.seam && a.rects === b.rects, 'the building field is deterministic per seed');
    ok(a.seam !== c.seam, 'different seeds paint different building fields');
    const { R, ctx, rec } = mk();
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, minRects = 99;
    for (let cx = -900; cx <= 900; cx += 96) {
      for (let cy = -900; cy <= 900; cy += 96) {
        const cam = { x: cx, y: cy };
        R.drawLandmarks(ctx, 4242, cam, groundTheme(1), 'BLOOD_RUST');
        for (const q of rec.rects) {
          minX = Math.min(minX, q.x + cam.x); maxX = Math.max(maxX, q.x + cam.x);
          minY = Math.min(minY, q.y + cam.y); maxY = Math.max(maxY, q.y + cam.y);
        }
        for (const l of R.landmarks) minRects = Math.min(minRects, l.rects);
        rec.rects.length = 0;
      }
    }
    ok(minX >= -C.GROUND.RIM && maxX <= C.GROUND.RIM &&
      minY >= -C.GROUND.RIM && maxY <= C.GROUND.RIM,
      'buildings clip the full footprint at the arena rim (+-' + C.GROUND.RIM +
      '), range ' + minX + '..' + maxX + ',' + minY + '..' + maxY);
    ok(minRects >= 4, 'every landmark incl. buildings is COMPOSED (>= 4 rects); min ' + minRects);
    const { R: R2, ctx: ctx2 } = mk();
    R2.drawLandmarks(ctx2, 4242, { x: 0, y: 0 }, groundTheme(1), 'BLOOD_RUST');
    const authored = R2.landmarks.filter(l => l.kind === 'STUMP' || l.kind === 'GATE' || l.kind === 'GROVE');
    ok(authored.length === 0, 'no STUMP/GATE/GROVE outside VERDANT_HOLLOW (buildings add no authored leak)');
    const { R: R3, ctx: ctx3 } = mk();
    R3.drawLandmarks(ctx3, 4242, { x: 0, y: 0 }, groundTheme(1), 'VERDANT_HOLLOW');
    ok(R3.landmarks.some(l => l.kind === 'STUMP'), 'the hollow keeps its authored STUMP at the heart');
  }
  // DENSITY INTERACTION: the slice-D prop floor holds — buildings replace
  // no prop (the owner-approved density is carried, not renegotiated).
  for (const s of STAGES) {
    const kinds = sweepKinds(4242, s.id);
    const want = propForStage(s.id).id;
    ok((kinds[want] || 0) >= 150, 'stage ' + s.id + ': slice-D prop density holds (' +
      (kinds[want] || 0) + ' ' + want + ' cells, floor 150)');
  }
}

console.log('SPAWN GUARANTEE (slice E: one building in the initial view, all 8 stages):');
{
  // startRun parks the pilot at (VIEW_W/2, VIEW_H/2) with cam {0,0}, so the
  // initial camera view is the world rect [0,VIEW_W]x[0,VIEW_H]. The pin
  // reads the same seam the renderer paints: the stage's building with its
  // FULL footprint inside that rect — deterministic per stage/seed, never
  // the clock — while the slice-D prop promise holds beside it.
  const mk2 = () => {
    const rec = { rects: [] };
    const ctx = {
      canvas: null, fillStyle: '#000', globalAlpha: 1, font: '10px monospace',
      textAlign: 'left', textBaseline: 'top', imageSmoothingEnabled: true,
      setTransform() {}, translate() {}, save() {}, restore() {}, clearRect() {},
      beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, arc() {},
      fillRect(x, y, w, h) { rec.rects.push({ x, y, w, h, style: String(this.fillStyle) }); },
      fillText() {},
    };
    const canvas = { width: 0, height: 0, getContext: () => ctx,
      getBoundingClientRect: () => ({ width: 0, height: 0 }) };
    ctx.canvas = canvas;
    return { R: new Renderer(canvas), rec, ctx };
  };
  const seeds = [1, 7, 11, 12, 4242, 99999];
  for (const s of STAGES) {
    const b = buildingForStage(s.id);
    const prop = propForStage(s.id).id;
    for (const seed of seeds) {
      const { R, ctx } = mk2();
      R.drawLandmarks(ctx, seed, { x: 0, y: 0 }, groundTheme(1), s.id);
      const hits = R.landmarks.filter(l => l.kind === b.id &&
        l.x >= 0 && l.y >= 0 && l.x + b.w <= C.VIEW_W && l.y + b.h <= C.VIEW_H);
      ok(hits.length >= 1, 'stage ' + s.id + ' seed ' + seed + ': ' + b.id +
        ' sits whole in the initial spawn view (' + hits.length + ' at ' +
        hits.map(h => h.x + ',' + h.y).join(';') + ')');
      const phits = R.landmarks.filter(l => l.kind === prop &&
        l.x >= 0 && l.y >= 0 && l.x + 20 <= C.VIEW_W && l.y + 20 <= C.VIEW_H);
      ok(phits.length >= 1, 'stage ' + s.id + ' seed ' + seed + ': slice-D prop ' + prop +
        ' still guaranteed beside it (' + phits.length + ' in view)');
    }
    const snapSpawn = (seed) => {
      const { R, ctx } = mk2();
      R.drawLandmarks(ctx, seed, { x: 0, y: 0 }, groundTheme(1), s.id);
      return R.landmarks.map(l => l.kind + '@' + l.x + ',' + l.y).join('|');
    };
    ok(snapSpawn(4242) === snapSpawn(4242),
      'stage ' + s.id + ': the spawn-view field is deterministic per seed');
  }
  {
    const { R, ctx } = mk2();
    R.drawLandmarks(ctx, 4242, { x: 0, y: 0 }, groundTheme(1), undefined);
    const b = buildingForStage(undefined);
    ok(R.landmarks.some(l => l.kind === b.id &&
      l.x >= 0 && l.y >= 0 && l.x + b.w <= C.VIEW_W && l.y + b.h <= C.VIEW_H),
      'unset stage: a ' + b.id + ' sits in the initial spawn view');
  }
}

console.log('');
if (failed) { console.error('test_stage_buildings: ' + failed + ' FAILED check(s)'); process.exitCode = 1; }
else { console.log('test_stage_buildings: all checks passed'); }
