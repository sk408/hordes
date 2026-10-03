// World art makeover checks (docs/ART_PASS.md, "World"):
//   1. FOOTPRINTS — every structure keeps its footprint: the design sizes and
//      the placed collision rects (buildingRects) for 8 stages x 4 seeds equal
//      the list written by the build before the pass (fixture
//      test/fixtures/building_footprints_pre_world_art.json, from 3a01e88).
//   2. ART INSIDE THE BOX — every redrawn design paints inside [0,w)x[0,h).
//   3. GROUND PALETTES — each stage owns a material palette; its underlay
//      tones are never lighter than its base (actors keep their contrast) and
//      every base stays in the mid-dark band; the wave still leans the colour.
//   4. DIRECT PATH — without a real canvas the ground paints with fillRect
//      (the headless harness), and the chunk cache stays off.
import fs from 'node:fs';
import { STAGE_BUILDINGS, buildingRects } from '../src/stage_buildings.js';
import { STAGE_IDS } from '../src/stages.js';
import { STAGE_GROUND_PALETTES, stageGroundPalette, groundChunksOn } from '../src/world_ground.js';
import { CONFIG as C } from '../src/config.js';

let failed = 0;
const ok = (c, m) => { if (c) console.log('  PASS ' + m); else { failed++; console.error('  FAIL ' + m); } };

console.log('FOOTPRINTS (unchanged by the art pass):');
{
  const fix = JSON.parse(fs.readFileSync(new URL('./fixtures/building_footprints_pre_world_art.json', import.meta.url), 'utf8'));
  let same = 0, total = 0;
  for (const [id, wh] of Object.entries(fix.designs)) {
    total++;
    const b = STAGE_BUILDINGS[id];
    if (b && b.w === wh[0] && b.h === wh[1]) same++;
    else console.error('    design ' + id + ' was ' + wh + ' now ' + (b ? [b.w, b.h] : 'missing'));
  }
  ok(same === total && Object.keys(STAGE_BUILDINGS).length === total,
    'all ' + total + ' designs keep their size (' + same + '/' + total + ')');
  let rs = 0, rt = 0;
  for (const [k, v] of Object.entries(fix.rects)) {
    rt++;
    const [s, seed] = k.split(':');
    const now = buildingRects(+seed, s).map(r => [r.x, r.y, r.w, r.h].map(q => Math.round(q * 100) / 100).join(',')).join(';');
    if (now === v) rs++; else console.error('    rects differ for ' + k);
  }
  ok(rs === rt, 'placed collision rects identical for ' + rt + ' stage x seed cases (' + rs + '/' + rt + ')');
}

console.log('ART INSIDE THE BOX:');
{
  let bad = 0;
  for (const [id, b] of Object.entries(STAGE_BUILDINGS)) {
    for (const [x, y, w, h] of b.rects) if (x < 0 || y < 0 || x + w > b.w || y + h > b.h) { bad++; console.error('    ' + id + ' rect ' + [x, y, w, h]); }
  }
  ok(bad === 0, 'every design paints inside its footprint box (' + bad + ' strays)');
}

console.log('GROUND PALETTES (stage owns the material, wave leans it):');
{
  const lum = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
  };
  ok(Object.keys(STAGE_GROUND_PALETTES).sort().join() === [...STAGE_IDS].sort().join(), 'one ground palette per stage');
  for (const id of STAGE_IDS) {
    const P = STAGE_GROUND_PALETTES[id];
    ok(lum(P.base) >= 0.012 && lum(P.base) <= 0.046, id + ': base in the mid-dark band (L ' + lum(P.base).toFixed(3) + ')');
    ok(lum(P.patch) <= lum(P.base) + 1e-9 && lum(P.patch2) <= lum(P.base) + 0.002,
      id + ': underlay tones never lighter than the base (shadow, not highlight)');
    const p1 = stageGroundPalette(id, C.GROUND.THEMES[0]), p4 = stageGroundPalette(id, C.GROUND.THEMES[3]);
    ok(p1.base !== p4.base, id + ': the wave theme still leans the floor colour');
  }
  const bases = new Set(STAGE_IDS.map(id => STAGE_GROUND_PALETTES[id].base));
  ok(bases.size === 8, 'eight distinct stage floors');
}

console.log('DIRECT PATH (headless):');
ok(groundChunksOn() === false, 'no real canvas here: the ground chunk cache is off, drawGround paints with fillRect');

if (failed) { console.error('test_world_art: ' + failed + ' FAILED'); process.exit(1); }
console.log('test_world_art: all checks passed');
