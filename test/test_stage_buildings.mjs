// HORDES — headless tests for src/stage_buildings.js + the render.js building seam
// (PORT SLICE E: landmark-scale buildings, original art; PORT SLICE J: per-biome
// kits + anchor+satellite composition, uncapped variety).
// Run: node test/test_stage_buildings.mjs
//
// WHAT THIS PINS:
//   1. FORMAT — every design is an integer rect list ([dx,dy,w,h,key],
//      key 1-9) inside its declared footprint, palette-complete, small
//      (<= 6 keys); anchors landmark-scale (60..120 x 60..110, COMPOSED
//      >= 12 rects), satellites outbuilding-scale (20..72, >= 8 rects),
//      always above the seam's >= 4 floor.
//   2. COPY — ids/names/blurbs are plain ASCII words (no emoji in game copy).
//   3. STAGE COVERAGE — every src/stages.js id resolves to an 8-design kit
//      (3 anchors + 5 satellites); buildingForStage still returns the
//      slice-E anchor; unknown / unset stages fall back to the hollow kit.
//   4. PAINT — paintBuilding paints through plain fillRects, honours x/y,
//      and reports the real rect count, for all 64 designs.
//   5. RENDER SEAM — drawLandmarks paints each stage's kit across the arena,
//      stays deterministic per seed, clips every footprint at the rim, keeps
//      every landmark COMPOSED, adds no STUMP/GATE/GROVE outside
//      VERDANT_HOLLOW, and covers the whole kit (all 8 designs place
//      somewhere within 12 seeds).
//   6. DENSITY INTERACTION — the slice-D prop floor (>= 150 prop cells per
//      stage at seed 4242) still holds: the building pass ADDS landmarks,
//      it replaces no prop. LANDMARK_CELL / LANDMARK_DENSITY are untouched.
//   7. VISUAL-ONLY — the module carries no gameplay numbers, touches no DOM,
//      reads no clock and no sim state; the render.js building block writes
//      no sim state either (source-scan, the test_controllers DOM-purity
//      precedent).
//   8. COMPOSITION (slice J grammar) — no density gate anywhere (the owner
//      "no limit" directive: BUILDING_DENSITY is gone, not retuned); every
//      arena carries >= 40 structures (>= 12 anchors — an order of magnitude
//      past "one in a field"); every kept pair holds the 16px separation
//      floor; the spawn view shows a whole cluster (anchor + >= 1
//      satellite), deterministic per (seed, stage).
import { readFileSync } from 'node:fs';
import {
  STAGE_BUILDINGS, STAGE_BUILDING_IDS, buildingForStage, designsForStage,
  paintBuilding, buildingPlacements, buildingFixedPoints,
  BUILDING_SEPARATION, MAX_SATELLITES,
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
const isAnchor = (b) => b.role !== 'satellite';

console.log('FORMAT (integer rects, palette-keyed, role-scaled):');
{
  ok(STAGE_BUILDING_IDS.length === 64, 'sixty-four designs ship (8 kits x 8, got ' + STAGE_BUILDING_IDS.length + ')');
  ok(new Set(STAGE_BUILDING_IDS).size === 64, 'design ids are unique');
  for (const id of STAGE_BUILDING_IDS) {
    const b = STAGE_BUILDINGS[id];
    const label = 'design/' + id;
    ok(b.id === id, label + ': id is stable');
    ok(b.role === 'anchor' || b.role === 'satellite', label + ': carries a composition role (' + b.role + ')');
    if (isAnchor(b)) {
      ok(b.rectCount === b.rects.length && b.rects.length >= 12,
        label + ': anchor COMPOSED with margin (' + b.rects.length + ' rects, floor 12)');
      ok(b.w >= 60 && b.w <= 120 && b.h >= 60 && b.h <= 110,
        label + ': anchor landmark-scale (' + b.w + 'x' + b.h + ')');
    } else {
      ok(b.rectCount === b.rects.length && b.rects.length >= 8,
        label + ': satellite COMPOSED with margin (' + b.rects.length + ' rects, floor 8)');
      ok(b.w >= 20 && b.w <= 72 && b.h >= 20 && b.h <= 72,
        label + ': satellite outbuilding-scale (' + b.w + 'x' + b.h + ')');
    }
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
      'design/' + id + ': id/name/blurb are plain ASCII');
    ok(b.name.length > 0 && b.blurb.length > 0, 'design/' + id + ': carries a name and a blurb');
  }
}

console.log('VISUAL-ONLY (no gameplay numbers, no DOM, no clock, no sim):');
{
  const BANNED_FIELDS = ['hp', 'dmg', 'damage', 'cost', 'price', 'value', 'rarity', 'heal', 'xp'];
  for (const id of STAGE_BUILDING_IDS) {
    const fields = Object.keys(STAGE_BUILDINGS[id]).filter(f => f !== 'role' && f !== 'rectCount');
    const leak = fields.filter(f => BANNED_FIELDS.includes(f.toLowerCase()));
    ok(leak.length === 0, 'design/' + id + ': carries no gameplay fields (' + fields.join(',') + ')');
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
  ok(start > 0 && end > start, 'the slice-E/J block is delimited in render.js');
  const block = rsrc.slice(start, end);
  for (const [pat, why] of [
    [/state\./, 'never reads/writes sim state'], [/player/, 'never touches the player'],
    [/\benemies\b/, 'never touches enemies'], [/\bdocument\b/, 'no document access'],
    [/\bwindow\b/, 'no window access'], [/\bDate\.now\b/, 'never reads the clock'],
  ]) ok(!pat.test(block), 'render.js slice-E/J block is painting-only: ' + why);
}

console.log('STAGE COVERAGE (8-design kits):');
{
  for (const s of STAGES) {
    const kit = designsForStage(s.id);
    ok(kit.length === 8, 'stage ' + s.id + ' owns 8 distinct designs (' + kit.map(b => b.id).join(',') + ')');
    ok(new Set(kit.map(b => b.id)).size === 8, 'stage ' + s.id + ': kit ids are distinct');
    ok(kit.filter(isAnchor).length === 3, 'stage ' + s.id + ': 3 anchors');
    ok(kit.filter(b => !isAnchor(b)).length === 5, 'stage ' + s.id + ': 5 satellites');
    let b = null;
    try { b = buildingForStage(s.id); } catch (e) { b = null; }
    ok(!!b && b.id === kit[0].id, 'stage ' + s.id + ': buildingForStage still returns the kit anchor (' + (b && b.id) + ')');
  }
  ok(buildingForStage(undefined).id === 'HOLLOW_LODGE', 'unset stage falls back to the hollow lodge');
  ok(buildingForStage('NOT_A_STAGE').id === 'HOLLOW_LODGE', 'unknown stage falls back to the hollow lodge');
  ok(designsForStage(undefined).length === 8, 'unset stage resolves a full hollow kit');
  const anchors = new Set(STAGES.map(s => buildingForStage(s.id).id));
  ok(anchors.size === 8, 'every stage owns a DISTINCT anchor (' + [...anchors].join(',') + ')');
}

console.log('KNOBS (composition pitch, old pins untouched, gate gone):');
{
  ok(C.GROUND.BUILDING_CELL === 384, 'BUILDING_CELL is 2x LANDMARK_CELL (' + C.GROUND.BUILDING_CELL + ' — slice-J composition rhythm)');
  ok(C.GROUND.BUILDING_DENSITY === undefined, 'BUILDING_DENSITY is GONE (owner: no artificial count cap — removed, not retuned)');
  ok(C.GROUND.LANDMARK_CELL === 192, 'LANDMARK_CELL untouched (192)');
  ok(C.GROUND.LANDMARK_DENSITY === 0.45, 'LANDMARK_DENSITY untouched (the slice-D owner ruling stands)');
  ok(MAX_SATELLITES === 4, 'clusters compose 1 anchor + 2..' + MAX_SATELLITES + ' satellites (measured stop point)');
  ok(BUILDING_SEPARATION === 16, 'the pilot-fit separation floor is 16px (pilot ~14px across)');
  const csrc = readFileSync(new URL('../src/config.js', import.meta.url), 'utf8');
  ok(!/BUILDING_DENSITY\s*:/.test(csrc), 'no BUILDING_DENSITY knob is defined in config.js');
  const rsrc = readFileSync(new URL('../src/render.js', import.meta.url), 'utf8');
  ok(!/GROUND\.BUILDING_DENSITY/.test(rsrc), 'the render.js paint pass reads no density gate');
  const bsrc = readFileSync(new URL('../src/stage_buildings.js', import.meta.url), 'utf8');
  ok(!/GROUND\.BUILDING_DENSITY/.test(bsrc), 'the placement field reads no density gate');
}

console.log('PAINT (all 64 designs):');
{
  const calls = [];
  const g = { fillStyle: '#000', fillRect(x, y, w, h) { calls.push({ x, y, w, h, style: String(this.fillStyle) }); } };
  for (const id of STAGE_BUILDING_IDS) {
    const b = STAGE_BUILDINGS[id];
    calls.length = 0;
    const n = paintBuilding(g, id, 10, 20);
    ok(n === b.rects.length && calls.length === b.rects.length,
      'paint/' + id + ': one fillRect per rect (' + n + ')');
    ok(calls.every((q, i) => q.x === 10 + b.rects[i][0] && q.y === 20 + b.rects[i][1]),
      'paint/' + id + ': honours x/y on every rect');
    ok(calls.every((q, i) => q.style === b.palette[b.rects[i][4]]),
      'paint/' + id + ': paints with the design palette');
  }
  ok(paintBuilding(g, 'NOPE', 0, 0) === 0, 'unknown design id paints nothing (0)');
}

console.log('RENDER SEAM (drawLandmarks paints the kits):');
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
  // Every stage's whole kit paints somewhere in the arena (across seeds —
  // satellites are hash-placed, so coverage is measured over 12 seeds).
  for (const s of STAGES) {
    const seen = new Set();
    for (let seed = 1; seed <= 12; seed++) {
      const kinds = sweepKinds(seed, s.id);
      for (const k of Object.keys(kinds)) seen.add(k);
    }
    for (const b of designsForStage(s.id)) {
      ok(seen.has(b.id), 'stage ' + s.id + ': kit design ' + b.id + ' paints somewhere (' + (seen.has(b.id) ? 'yes' : 'NO') + ')');
    }
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
    ok(a.seam === b.seam && a.rects === b.rects, 'the composed field is deterministic per seed');
    ok(a.seam !== c.seam, 'different seeds paint different composed fields');
    // Single source: the painted seam equals the placement field exactly.
    const { R, ctx } = mk();
    R.drawLandmarks(ctx, 4242, { x: 0, y: 0 }, groundTheme(1), 'BONE_DESERT');
    const painted = R.landmarks.filter(l => STAGE_BUILDINGS[l.kind])
      .map(l => l.kind + '@' + l.x + ',' + l.y).sort().join('|');
    const placed = buildingPlacements(4242, 'BONE_DESERT')
      .filter(p => p.x + p.w >= 0 && p.x <= C.VIEW_W && p.y + p.h >= 0 && p.y <= C.VIEW_H)
      .map(p => p.id + '@' + p.x + ',' + p.y).sort().join('|');
    ok(painted === placed, 'paint == placement at the spawn view (single source, no mirror)');
    const { R: R4, ctx: ctx4, rec } = mk();
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, minRects = 99;
    for (let cx = -900; cx <= 900; cx += 96) {
      for (let cy = -900; cy <= 900; cy += 96) {
        const cam = { x: cx, y: cy };
        R4.drawLandmarks(ctx4, 4242, cam, groundTheme(1), 'BLOOD_RUST');
        for (const q of rec.rects) {
          minX = Math.min(minX, q.x + cam.x); maxX = Math.max(maxX, q.x + cam.x);
          minY = Math.min(minY, q.y + cam.y); maxY = Math.max(maxY, q.y + cam.y);
        }
        for (const l of R4.landmarks) minRects = Math.min(minRects, l.rects);
        rec.rects.length = 0;
      }
    }
    ok(minX >= -C.GROUND.RIM && maxX <= C.GROUND.RIM &&
      minY >= -C.GROUND.RIM && maxY <= C.GROUND.RIM,
      'composition clips every footprint at the arena rim (+-' + C.GROUND.RIM +
      '), range ' + minX + '..' + maxX + ',' + minY + '..' + maxY);
    ok(minRects >= 4, 'every landmark incl. designs is COMPOSED (>= 4 rects); min ' + minRects);
    const { R: R2, ctx: ctx2 } = mk();
    R2.drawLandmarks(ctx2, 4242, { x: 0, y: 0 }, groundTheme(1), 'BLOOD_RUST');
    const authored = R2.landmarks.filter(l => l.kind === 'STUMP' || l.kind === 'GATE' || l.kind === 'GROVE');
    ok(authored.length === 0, 'no STUMP/GATE/GROVE outside VERDANT_HOLLOW (composition adds no authored leak)');
    const { R: R3, ctx: ctx3 } = mk();
    R3.drawLandmarks(ctx3, 4242, { x: 0, y: 0 }, groundTheme(1), 'VERDANT_HOLLOW');
    ok(R3.landmarks.some(l => l.kind === 'STUMP'), 'the hollow keeps its authored STUMP at the heart');
  }
  // DENSITY INTERACTION: the slice-D prop floor holds — composition replaces
  // no prop (the owner-approved density is carried, not renegotiated).
  for (const s of STAGES) {
    const kinds = sweepKinds(4242, s.id);
    const want = propForStage(s.id).id;
    ok((kinds[want] || 0) >= 150, 'stage ' + s.id + ': slice-D prop density holds (' +
      (kinds[want] || 0) + ' ' + want + ' cells, floor 150)');
  }
}

console.log('COMPOSITION (no gate, abundance, separation — 48 seeds x 8 stages):');
{
  const gap2 = (x, y) => {
    const ox = Math.max(x.x, y.x) < Math.min(x.x + x.w, y.x + y.w);
    const oy = Math.max(x.y, y.y) < Math.min(x.y + x.h, y.y + y.h);
    if (ox && oy) return 0;
    const dx = Math.max(0, Math.max(x.x - (y.x + y.w), y.x - (x.x + x.w)));
    const dy = Math.max(0, Math.max(x.y - (y.y + y.h), y.y - (x.y + x.h)));
    if (ox) return dy;
    if (oy) return dx;
    return Math.hypot(dx, dy);
  };
  let minBoxes = Infinity, minAnchors = Infinity, sepBad = 0;
  for (const s of STAGES) {
    for (let seed = 1; seed <= 48; seed++) {
      const pl = buildingPlacements(seed, s.id);
      minBoxes = Math.min(minBoxes, pl.length);
      minAnchors = Math.min(minAnchors,
        pl.filter(p => STAGE_BUILDINGS[p.id].role !== 'satellite').length);
      for (let i = 0; i < pl.length; i++) {
        for (let j = i + 1; j < pl.length; j++) {
          if (gap2(pl[i], pl[j]) < BUILDING_SEPARATION - 1e-9) sepBad++;
        }
      }
    }
  }
  // M5b landscape: buildings keep off plateaus, ramps and bridges, so the
  // floors are 32 structures / 8 anchors (were 40 / 12 on flat arenas).
  ok(minBoxes >= 32, 'every arena carries >= 32 structures (min ' + minBoxes + ' — an order of magnitude past one-in-a-field)');
  ok(minAnchors >= 8, 'every arena carries >= 8 anchors (min ' + minAnchors + ')');
  ok(sepBad === 0, 'the 16px separation floor holds for every kept pair (' + sepBad + ' violations)');
}

console.log('SPAWN GUARANTEE (slice J: a whole cluster in the initial view, all 8 stages):');
{
  // startRun parks the pilot at (VIEW_W/2, VIEW_H/2) with cam {0,0}, so the
  // initial camera view is the world rect [0,VIEW_W]x[0,VIEW_H]. The pin
  // reads the same seam the renderer paints: a spawn-flagged anchor AND a
  // spawn-flagged satellite, each with its FULL footprint inside that rect —
  // deterministic per stage/seed, never the clock — while the slice-D prop
  // promise holds beside it.
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
  const seeds = [];
  for (let i = 1; i <= 24; i++) seeds.push(i);
  seeds.push(4242, 99999);
  for (const s of STAGES) {
    const prop = propForStage(s.id).id;
    for (const seed of seeds) {
      const pl = buildingPlacements(seed, s.id);
      const inView = pl.filter(p => p.x >= 0 && p.y >= 0 &&
        p.x + STAGE_BUILDINGS[p.id].w <= C.VIEW_W && p.y + STAGE_BUILDINGS[p.id].h <= C.VIEW_H);
      const cluster = inView.filter(p => p.spawn);
      const anchors = cluster.filter(p => STAGE_BUILDINGS[p.id].role !== 'satellite');
      const sats = cluster.filter(p => STAGE_BUILDINGS[p.id].role === 'satellite');
      ok(anchors.length >= 1, 'stage ' + s.id + ' seed ' + seed + ': a cluster anchor sits whole in the spawn view (' +
        anchors.map(h => h.id + '@' + h.x + ',' + h.y).join(';') + ')');
      ok(sats.length >= 1, 'stage ' + s.id + ' seed ' + seed + ': >= 1 cluster satellite sits whole beside it (' +
        sats.map(h => h.id + '@' + h.x + ',' + h.y).join(';') + ')');
      // The fixed floor points stand clear of every placed box (binding rule).
      for (const [px, py] of buildingFixedPoints()) {
        for (const r of pl) {
          const cx = Math.max(r.x, Math.min(px, r.x + r.w));
          const cy = Math.max(r.y, Math.min(py, r.y + r.h));
          if (!(Math.hypot(px - cx, py - cy) >= 8 - 1e-9)) {
            ok(false, 'stage ' + s.id + ' seed ' + seed + ': point (' + px + ',' + py +
              ') stands clear of ' + r.id + ' ' + r.x + ',' + r.y);
          }
        }
      }
    }
    // The slice-D prop promise holds beside the cluster (render path, every
    // seed in theSpawn set above would be slow — the 6-seed slice-E set).
    for (const seed of [1, 7, 11, 12, 4242, 99999]) {
      const { R, ctx } = mk2();
      R.drawLandmarks(ctx, seed, { x: 0, y: 0 }, groundTheme(1), s.id);
      const phits = R.landmarks.filter(l => l.kind === prop &&
        l.x >= 0 && l.y >= 0 && l.x + 20 <= C.VIEW_W && l.y + 20 <= C.VIEW_H);
      ok(phits.length >= 1, 'stage ' + s.id + ' seed ' + seed + ': slice-D prop ' + prop +
        ' still guaranteed beside the cluster (' + phits.length + ' in view)');
      // The spawn-view cluster reads through the paint seam too.
      const bhits = R.landmarks.filter(l => STAGE_BUILDINGS[l.kind] &&
        l.x >= 0 && l.y >= 0 && l.x + STAGE_BUILDINGS[l.kind].w <= C.VIEW_W &&
        l.y + STAGE_BUILDINGS[l.kind].h <= C.VIEW_H);
      ok(bhits.length >= 2, 'stage ' + s.id + ' seed ' + seed + ': the paint seam shows a cluster in view (' +
        bhits.length + ' whole designs: ' + bhits.map(h => h.kind).join(',') + ')');
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
    const hits = R.landmarks.filter(l => STAGE_BUILDINGS[l.kind] &&
      l.x >= 0 && l.y >= 0 && l.x + STAGE_BUILDINGS[l.kind].w <= C.VIEW_W &&
      l.y + STAGE_BUILDINGS[l.kind].h <= C.VIEW_H);
    ok(hits.length >= 2, 'unset stage: a cluster sits in the initial spawn view (' + hits.length + ')');
  }
}

console.log('');
if (failed) { console.error('test_stage_buildings: ' + failed + ' FAILED check(s)'); process.exitCode = 1; }
else { console.log('test_stage_buildings: all checks passed'); }
