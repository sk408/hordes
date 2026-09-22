// HORDES — headless tests for src/stage_props.js + the render.js landmark seam
// (PORT SLICE A: stage/prop objects, original art).
// Run: node test/test_stage_props.mjs
//
// WHAT THIS PINS:
//   1. FORMAT — every prop is integer grid data (0 = transparent, keys 1-9),
//      rectangular, palette-complete, small (<= 32px box, <= 6 keys), frames
//      share one box, animated pairs actually differ.
//   2. COPY — ids/names/blurbs are plain ASCII words (no emoji in game copy).
//   3. STAGE COVERAGE — every src/stages.js id resolves to a prop; unknown /
//      unset stages fall back to the trail lantern (never throws).
//   4. DETERMINISM — propFrame is a cell hash, not the clock; paintStageProp
//      paints through a drawGrid-shaped fn and reports the real pixel count.
//   5. RENDER SEAM — drawLandmarks paints each stage's prop kind across the
//      arena, stays deterministic per seed, clips at the rim, keeps every
//      landmark COMPOSED (>= 4 rects), and adds no STUMP/GATE/GROVE outside
//      VERDANT_HOLLOW (the authored set stays hollow-only).
//   5b. PORT SLICE D (owner-ruled 2026-09-22: "we can have more of them and
//      guarantee one near spawn" — an APPROVED visual-density change, NOT a
//      smuggled pacing change): the sweep pins the NEW owner-approved
//      density (props ~4x the slice-A field — moving these goalposts is the
//      owner order, said so explicitly), and every stage guarantees at least
//      one of its props inside the initial camera view of the spawn, for
//      every seed tried, deterministic per stage/seed.
//   6. VISUAL-ONLY — the module carries no gameplay numbers (no hp/dmg/cost
//      fields anywhere on a prop).
import {
  STAGE_PROPS, STAGE_PROP_IDS, propForStage, propFrame, paintStageProp,
} from '../src/stage_props.js';
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

console.log('FORMAT (integer grids, palette-keyed):');
{
  ok(STAGE_PROP_IDS.length === 6, 'six stage props ship (' + STAGE_PROP_IDS.join(',') + ')');
  ok(new Set(STAGE_PROP_IDS).size === 6, 'prop ids are unique');
  for (const id of STAGE_PROP_IDS) {
    const p = STAGE_PROPS[id];
    const label = 'prop/' + id;
    ok(p.id === id, label + ': id is stable');
    ok(p.frames.length === p.frameCount && p.frameCount >= 1, label + ': frameCount matches (' + p.frameCount + ')');
    const boxes = p.frames.map(f => ({ w: f[0].length, h: f.length }));
    ok(boxes.every(b => b.w === boxes[0].w && b.h === boxes[0].h),
      label + ': every frame is the same box (' + boxes[0].w + 'x' + boxes[0].h + ')');
    ok(boxes[0].w <= 32 && boxes[0].h <= 32,
      label + ': fits inside one 32px decor cell (' + boxes[0].w + 'x' + boxes[0].h + ')');
    ok(p.w === boxes[0].w && p.h === boxes[0].h, label + ': declared w/h match the pixels');
    ok(p.anchor.x === Math.floor(p.w / 2) && p.anchor.y === Math.floor(p.h / 2),
      label + ': anchor is the box center');
    let ragged = 0, badCell = 0, nonZero = 0;
    const used = new Set();
    for (const fr of p.frames) {
      for (const row of fr) {
        if (row.length !== boxes[0].w) ragged++;
        for (const v of row) {
          if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 9) badCell++;
          else if (v) { nonZero++; used.add(v); }
        }
      }
    }
    ok(ragged === 0, label + ': all rows are the same width');
    ok(badCell === 0, label + ': every cell is an integer palette index 0-9');
    ok(nonZero > 0, label + ': the grid actually has pixels (' + nonZero + ')');
    const keys = Object.keys(p.palette);
    ok(keys.length > 0 && keys.length <= 6, label + ': palette is small (' + keys.length + ' keys)');
    ok(keys.every(k => /^[1-9]$/.test(k)), label + ': palette keys are 1-9 (0 is transparent)');
    ok(keys.every(k => HEX.test(String(p.palette[k]))), label + ': every palette value is #rgb/#rrggbb');
    ok([...used].every(v => p.palette[v]), label + ': every referenced index is defined');
    if (p.frameCount > 1) {
      const sigs = new Set(p.frames.map(f => f.flat().join(',')));
      ok(sigs.size === p.frameCount, label + ': all ' + p.frameCount + ' frames differ (real flicker)');
    }
  }
}

console.log('COPY (plain words, no emoji):');
{
  for (const id of STAGE_PROP_IDS) {
    const p = STAGE_PROPS[id];
    ok(ASCII.test(id) && ASCII.test(p.name) && ASCII.test(p.blurb),
      'prop/' + id + ': id/name/blurb are plain ASCII');
    ok(p.name.length > 0 && p.blurb.length > 0, 'prop/' + id + ': carries a name and a blurb');
  }
}

console.log('VISUAL-ONLY (no gameplay numbers):');
{
  const BANNED = ['hp', 'dmg', 'damage', 'cost', 'price', 'value', 'rarity', 'heal', 'xp'];
  for (const id of STAGE_PROP_IDS) {
    const fields = Object.keys(STAGE_PROPS[id]);
    const leak = fields.filter(f => BANNED.includes(f.toLowerCase()));
    ok(leak.length === 0, 'prop/' + id + ': carries no gameplay fields (' + fields.join(',') + ')');
  }
}

console.log('STAGE COVERAGE:');
{
  for (const s of STAGES) {
    let p = null;
    try { p = propForStage(s.id); } catch (e) { p = null; }
    ok(!!p && !!STAGE_PROPS[p.id], 'stage ' + s.id + ' resolves to prop ' + (p && p.id));
  }
  ok(propForStage(undefined).id === 'TRAIL_LANTERN', 'unset stage falls back to the trail lantern');
  ok(propForStage('NOT_A_STAGE').id === 'TRAIL_LANTERN', 'unknown stage falls back to the trail lantern');
  const served = new Set(STAGES.map(s => propForStage(s.id).id));
  ok(served.size >= 5, 'props serve at least 5 distinct stage identities (' + [...served].join(',') + ')');
}

console.log('FRAME + PAINT:');
{
  const braz = STAGE_PROPS.EMBER_BRAZIER;
  ok(propFrame(braz, 3, 5) === propFrame(braz, 3, 5), 'propFrame is stable per cell');
  ok([0, 1].includes(propFrame(braz, 3, 5)), 'propFrame is 0/1');
  ok(propFrame(braz, 0, 0) !== propFrame(braz, 0, 1) || propFrame(braz, 1, 1) !== propFrame(braz, 1, 2),
    'propFrame varies across cells (flicker field, not a still)');
  ok(propFrame(STAGE_PROPS.DUNE_CART, 9, 9) === 0, 'static props always read frame 0');
  const calls = [];
  const fakeDrawGrid = (g, grid, palette, x, y) => { calls.push({ grid, palette, x, y }); };
  const n = paintStageProp('G', fakeDrawGrid, 'EMBER_BRAZIER', 0, 10, 20);
  ok(calls.length === 1, 'paintStageProp issues one drawGrid call');
  ok(calls[0].x === 10 && calls[0].y === 20, 'paintStageProp honours x/y');
  ok(calls[0].palette === braz.palette, 'paintStageProp paints with the prop palette');
  let expect = 0;
  for (const row of braz.frames[0]) for (const v of row) if (v) expect++;
  ok(n === expect && n >= 4, 'paintStageProp reports the real pixel count (' + n + ', COMPOSED)');
  ok(paintStageProp('G', fakeDrawGrid, 'NOPE', 0, 0, 0) === 0, 'unknown prop id paints nothing (0)');
}

console.log('RENDER SEAM (drawLandmarks paints the props):');
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
  const sweep = (R, ctx, seed, stage) => {
    const kinds = {};
    for (let cx = -900; cx <= 900; cx += 96) {
      for (let cy = -900; cy <= 900; cy += 96) {
        R.drawLandmarks(ctx, seed, { x: cx, y: cy }, groundTheme(1), stage);
        for (const l of R.landmarks) kinds[l.kind] = (kinds[l.kind] || 0) + 1;
      }
    }
    return kinds;
  };
  // Every stage's prop appears somewhere in the arena.
  // PORT SLICE D (owner-ruled 2026-09-22): the density floor moves with the
  // approved field — slice A read 63 prop cells per stage at seed 4242,
  // slice D reads 273. The >= 150 floor FAILS on the old field (63) and
  // passes on the new one (273) with margin: moving this goalpost is the
  // owner order, stated explicitly.
  for (const s of STAGES) {
    const { R, ctx } = mk();
    const kinds = sweep(R, ctx, 4242, s.id);
    const want = propForStage(s.id).id;
    ok((kinds[want] || 0) > 0, 'stage ' + s.id + ': ' + want + ' paints (' + (kinds[want] || 0) + ' cells)');
    ok((kinds[want] || 0) >= 150, 'stage ' + s.id + ': slice-D density holds (' + (kinds[want] || 0) + ' ' + want + ' cells, floor 150)');
  }
  // The unset-stage field paints lanterns too (the dev-run default view).
  {
    const { R, ctx } = mk();
    const kinds = sweep(R, ctx, 4242, undefined);
    ok((kinds.TRAIL_LANTERN || 0) > 0, 'unset stage: TRAIL_LANTERN paints (' + (kinds.TRAIL_LANTERN || 0) + ' cells)');
    ok((kinds.TRAIL_LANTERN || 0) >= 150, 'unset stage: slice-D density holds (' + (kinds.TRAIL_LANTERN || 0) + ' cells, floor 150)');
  }
  // Determinism + rim clip + composed + hollow-only authored set.
  {
    const snap = (seed, stage) => {
      const { R, ctx, rec } = mk();
      R.drawLandmarks(ctx, seed, { x: 128, y: 96 }, groundTheme(1), stage);
      return { seam: R.landmarks.map(l => l.kind + '@' + l.x + ',' + l.y).join('|'),
        rects: rec.rects.map(q => q.x + ',' + q.y + ',' + q.w + ',' + q.h).join('|'),
        kinds: R.landmarks.map(l => l.kind), counts: R.landmarks.map(l => l.rects) };
    };
    const a = snap(11, 'ASHEN_WASTE'), b = snap(11, 'ASHEN_WASTE'), c = snap(12, 'ASHEN_WASTE');
    ok(a.seam === b.seam && a.rects === b.rects, 'the prop field is deterministic per seed');
    ok(a.seam !== c.seam, 'different seeds paint different prop fields');
    const { R, ctx, rec } = mk();
    let minX = 1e9, maxX = -1e9, minRects = 99;
    for (let cx = -900; cx <= 900; cx += 96) {
      for (let cy = -900; cy <= 900; cy += 96) {
        const cam = { x: cx, y: cy };
        R.drawLandmarks(ctx, 4242, cam, groundTheme(1), 'BLOOD_RUST');
        for (const q of rec.rects) { minX = Math.min(minX, q.x + cam.x); maxX = Math.max(maxX, q.x + cam.x); }
        for (const l of R.landmarks) minRects = Math.min(minRects, l.rects);
        rec.rects.length = 0;
      }
    }
    ok(minX >= -C.GROUND.RIM && maxX <= C.GROUND.RIM,
      'props clip at the arena rim (+-' + C.GROUND.RIM + '), range ' + minX + '..' + maxX);
    ok(minRects >= 4, 'every landmark incl. props is COMPOSED (>= 4 rects); min ' + minRects);
    const { R: R2, ctx: ctx2 } = mk();
    R2.drawLandmarks(ctx2, 4242, { x: 0, y: 0 }, groundTheme(1), 'BLOOD_RUST');
    const authored = R2.landmarks.filter(l => l.kind === 'STUMP' || l.kind === 'GATE' || l.kind === 'GROVE');
    ok(authored.length === 0, 'no STUMP/GATE/GROVE outside VERDANT_HOLLOW');
    const { R: R3, ctx: ctx3 } = mk();
    R3.drawLandmarks(ctx3, 4242, { x: 0, y: 0 }, groundTheme(1), 'VERDANT_HOLLOW');
    const hk0 = new Set(R3.landmarks.map(l => l.kind));
    ok(hk0.has('STUMP'), 'the hollow keeps its authored STUMP at the heart');
    const { R: R4, ctx: ctx4 } = mk();
    R4.drawLandmarks(ctx4, 4242, { x: 0, y: -(C.GROUND.RIM - 150) }, groundTheme(1), 'VERDANT_HOLLOW');
    ok(R4.landmarks.some(l => l.kind === 'GATE'), 'the hollow keeps its GATE at the north cardinal');
    const { R: R5, ctx: ctx5 } = mk();
    const hollowKinds = sweep(R5, ctx5, 4242, 'VERDANT_HOLLOW');
    ok((hollowKinds.GROVE || 0) > 0, 'the hollow keeps GROVE stands (' + (hollowKinds.GROVE || 0) + ' cells)');
    ok((hollowKinds.TRAIL_LANTERN || 0) > 0,
      'the hollow grows TRAIL_LANTERN among the groves (' + (hollowKinds.TRAIL_LANTERN || 0) + ' cells)');
  }
}

console.log('SPAWN GUARANTEE (slice D: one prop in the initial view, all 8 stages):');
{
  // startRun parks the pilot at (VIEW_W/2, VIEW_H/2) with cam {0,0}, so the
  // initial camera view is the world rect [0,VIEW_W]x[0,VIEW_H]. The pin
  // reads the same seam the renderer paints: the stage's prop kind with an
  // anchor fully inside that rect — deterministic per stage/seed, never the
  // clock (the same seed repaints the same cell).
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
  const inView = (l) => l.x >= 0 && l.y >= 0 &&
    l.x + 20 <= C.VIEW_W && l.y + 20 <= C.VIEW_H;
  const snapSpawn = (R, ctx, seed, stage) => {
    R.drawLandmarks(ctx, seed, { x: 0, y: 0 }, groundTheme(1), stage);
    return R.landmarks.map(l => l.kind + '@' + l.x + ',' + l.y).join('|');
  };
  const seeds = [1, 7, 11, 12, 4242, 99999];
  for (const s of STAGES) {
    const want = propForStage(s.id).id;
    for (const seed of seeds) {
      const { R, ctx } = mk2();
      R.drawLandmarks(ctx, seed, { x: 0, y: 0 }, groundTheme(1), s.id);
      const hits = R.landmarks.filter(l => l.kind === want && inView(l));
      ok(hits.length >= 1, 'stage ' + s.id + ' seed ' + seed + ': ' + want +
        ' sits in the initial spawn view (' + hits.length + ' at ' +
        hits.map(h => h.x + ',' + h.y).join(';') + ')');
    }
    const { R: Ra, ctx: cxa } = mk2();
    const { R: Rb, ctx: cxb } = mk2();
    ok(snapSpawn(Ra, cxa, 4242, s.id) === snapSpawn(Rb, cxb, 4242, s.id),
      'stage ' + s.id + ': the spawn-view field is deterministic per seed');
  }
  // The unset-stage default view guarantees a lantern too.
  {
    const { R, ctx } = mk2();
    R.drawLandmarks(ctx, 4242, { x: 0, y: 0 }, groundTheme(1), undefined);
    ok(R.landmarks.some(l => l.kind === 'TRAIL_LANTERN' && inView(l)),
      'unset stage: a TRAIL_LANTERN sits in the initial spawn view');
  }
}

console.log('');
if (failed) { console.error('test_stage_props: ' + failed + ' FAILED check(s)'); process.exitCode = 1; }
else { console.log('test_stage_props: all checks passed'); }
