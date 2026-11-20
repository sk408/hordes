// R6 stage value keys (docs/REVIEW_2026-11.md, R6; Steve's decision 5).
//   1. THE LADDER: each stage owns a value key. From dark to light: Void Reach
//      and Cinder Maw, Blood Rust, Verdant Hollow, Ashen Waste, Bone Desert,
//      Snowfield, Whiteout. The snow stages are genuinely light, the Bone
//      Desert warm and light, Cinder Maw and the Void Reach the darkest.
//   2. NO TWO ALIKE: every pair of floors stays apart (CIE76 distance of the
//      bases) under every wave light; a light floor stays light under every wave.
//   3. FEATURES: one feature kind per stage, drawn flat into the cached
//      underlay. Cinder Maw's embers stay well under a shot's brightness; the
//      Void Reach's rifts are violet, never the cyan-teal of a gem; drifts and
//      dunes are a lit mound and its shadow.
//   4. EVERYTHING READS: every thing on the ground (the hero, shots, gems,
//      potions, chests, numbers, the portal, every enemy as drawn) holds its
//      bar against every floor tone, by its body or by its edge
//      (tools/stage_keys_measure.mjs prints the table).
//   5. THE HERO AND SHOTS ON A LIGHT FLOOR: the hero wears a dark keyline
//      outside its warm-white ring, the shot orb a dark rim.
// Run: node test/test_stage_keys.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CONFIG as C } from '../src/config.js';
import { STAGE_IDS } from '../src/stages.js';
import {
  STAGE_GROUND_PALETTES, STAGE_GROUND_FEATURES, stageGroundPalette, groundIsLight, relLum, LIGHT_FLOOR, featureAt,
  WORLD_GROUND_TEST,
} from '../src/world_ground.js';
import { actorStyle, corpseStyle, FLASH_ON_LIGHT } from '../src/sprite_cache.js';
import { drawFeelEffects, FX_ON_LIGHT } from '../src/fx/feel_render.js';
import { drawSites, POP_PLATE } from '../src/sites_art.js';
import { SHOT_PAINT, STYLE_SHOT, STYLE_SHOT_LIGHT, FAN_EMPTY_TEXT, Renderer, CLOUD_BAND_RAMP } from '../src/render.js';
import { initWeather } from '../src/weather.js';
import { stageTable, lab, deltaE } from '../tools/stage_keys_measure.mjs';

let passed = 0;
const check = (label, fn) => { fn(); passed++; console.log('  ok - ' + label); };
const L = (hex) => lab(hex)[0];
const base = (id) => STAGE_GROUND_PALETTES[id].base;

check('one palette and one feature per stage', () => {
  assert.deepEqual(Object.keys(STAGE_GROUND_PALETTES).sort(), [...STAGE_IDS].sort());
  assert.deepEqual(Object.keys(STAGE_GROUND_FEATURES).sort(), [...STAGE_IDS].sort());
});

check('the value ladder, dark to light', () => {
  const order = ['VOID_REACH', 'CINDER_MAW', 'BLOOD_RUST', 'VERDANT_HOLLOW', 'ASHEN_WASTE', 'BONE_DESERT', 'SNOWFIELD', 'WHITEOUT'];
  for (let i = 1; i < order.length; i++) {
    assert.ok(L(base(order[i])) > L(base(order[i - 1])) - 1.5,
      order[i] + ' (L* ' + L(base(order[i])).toFixed(1) + ') is not lighter than ' + order[i - 1] + ' (L* ' + L(base(order[i - 1])).toFixed(1) + ')');
  }
  assert.ok(L(base('SNOWFIELD')) >= 72 && L(base('WHITEOUT')) >= 85, 'the snow stages are genuinely light');
  assert.ok(lab(base('SNOWFIELD'))[2] < -8, 'Snowfield is pale BLUE snow');
  const bone = lab(base('BONE_DESERT'));
  assert.ok(bone[0] >= 55 && bone[2] > 15 && bone[1] >= 0, 'the Bone Desert is warm and light (L* ' + bone[0].toFixed(1) + ')');
  assert.ok(L(base('CINDER_MAW')) <= 12 && L(base('VOID_REACH')) <= 12, 'Cinder Maw and the Void Reach are the darkest');
  const ash = lab(base('ASHEN_WASTE'));
  assert.ok(Math.abs(ash[1]) < 3 && Math.abs(ash[2]) < 4, 'Ashen Waste is a grey ash (no tint)');
  const green = lab(base('VERDANT_HOLLOW'));
  assert.ok(green[1] < -12, 'Verdant Hollow is green');
  assert.ok(green[0] >= 44 && green[0] <= 56, 'Verdant Hollow is a MID green (L* ' + green[0].toFixed(1) + ')');
  assert.deepEqual(STAGE_IDS.filter(groundIsLight).sort(), ['ASHEN_WASTE', 'BONE_DESERT', 'SNOWFIELD', 'VERDANT_HOLLOW', 'WHITEOUT']);
});

check('no two floors alike, under every wave light', () => {
  let min = 99, at = '';
  for (const t of C.GROUND.THEMES) {
    for (let i = 0; i < STAGE_IDS.length; i++) for (let j = i + 1; j < STAGE_IDS.length; j++) {
      const d = deltaE(stageGroundPalette(STAGE_IDS[i], t).base, stageGroundPalette(STAGE_IDS[j], t).base);
      if (d < min) { min = d; at = STAGE_IDS[i] + '/' + STAGE_IDS[j] + ' in ' + t.name; }
    }
  }
  assert.ok(min >= 12, 'closest pair ' + at + ' dE ' + min.toFixed(1));
});

check('the wave still leans the floor, and a light floor stays light under every wave', () => {
  for (const id of STAGE_IDS) {
    const p1 = stageGroundPalette(id, C.GROUND.THEMES[0]), p4 = stageGroundPalette(id, C.GROUND.THEMES[3]);
    assert.notEqual(p1.base, p4.base, id + ': the wave leans the colour');
    for (const t of C.GROUND.THEMES) {
      const lum = relLum(stageGroundPalette(id, t).base);
      if (groundIsLight(id)) assert.ok(lum >= LIGHT_FLOOR, id + ' under ' + t.name + ' fell to ' + lum.toFixed(3));
      else assert.ok(lum < LIGHT_FLOOR, id + ' under ' + t.name + ' rose to ' + lum.toFixed(3));
    }
  }
});

check('features: the right kind per stage, drifts lit with a shadow', () => {
  const kinds = Object.fromEntries(STAGE_IDS.map(id => [id, STAGE_GROUND_FEATURES[id].kind]));
  assert.deepEqual(kinds, {
    VERDANT_HOLLOW: 'patches', ASHEN_WASTE: 'patches', SNOWFIELD: 'drifts', BLOOD_RUST: 'pools',
    BONE_DESERT: 'drifts', VOID_REACH: 'cracks', CINDER_MAW: 'cracks', WHITEOUT: 'drifts',
  });
  for (const id of STAGE_IDS) {
    const F = STAGE_GROUND_FEATURES[id], b = relLum(base(id));
    if (F.kind === 'drifts' || F.kind === 'patches') {
      assert.ok(relLum(F.light) > b && relLum(F.dark) < b, id + ': a lighter and a darker tone round the base');
    }
  }
  const D = STAGE_GROUND_FEATURES.SNOWFIELD;
  assert.equal(featureAt(D, 'drifts', D.cut + 0.05, 0, 0), 1, 'inside a mound: lit');
  assert.equal(featureAt(D, 'drifts', D.cut - 0.1, D.cut + 0.05, 0), 2, 'below and right of a mound: its shadow');
  assert.equal(featureAt(D, 'drifts', 0.2, 0.2, 0), 0, 'open snow: the base');
});

check('cracks are thin lines: a pixel 3 px off the line is plain floor, wherever the field is flat', () => {
  const F = STAGE_GROUND_FEATURES.CINDER_MAW;
  assert.equal(featureAt(F, 'cracks', 0.2, 0.9, 0), 3, 'the core where the cracks gather: hot');
  assert.equal(featureAt(F, 'cracks', 0.2, 0.5, 0), 1, 'the core');
  assert.equal(featureAt(F, 'cracks', 1.5, 0.9, 0), 2, 'the dark lip');
  assert.equal(featureAt(F, 'cracks', 3, 0.9, 0), 0, 'off the line');
  const src = fs.readFileSync(new URL('../src/world_ground.js', import.meta.url), 'utf8');
  assert.match(src, /sd\[k\] = \(shape\[k\] - 0\.5\) \/ Math\.max\(Math\.hypot\(gxv, gyv\)/, 'the crack test is a distance in px (offset over slope)');
});

check('the reserved colours stay reserved: embers are dim, rifts are not a gem', () => {
  const shotLums = Object.keys(SHOT_PAINT).map((k) => {
    let body = null;
    SHOT_PAINT[k]({ set fillStyle(v) { if (!body) body = v; }, fillRect() {} }, 0, 0);
    return relLum(body);
  });
  const cinder = STAGE_GROUND_FEATURES.CINDER_MAW;
  for (const c of [cinder.light, cinder.glow, cinder.hot]) {
    assert.ok(relLum(c) <= 0.6 * Math.min(...shotLums), 'ember ' + c + ' is too bright next to a shot (' + relLum(c).toFixed(3) + ')');
  }
  const hue = (hex) => { const [, a, b] = lab(hex); return (Math.atan2(b, a) * 180 / Math.PI + 360) % 360; };
  // cyan-teal gems sit near hue 190-200 in Lab; the rifts must be far from it.
  const gemHue = hue('#3ef0c0');
  const rift = STAGE_GROUND_FEATURES.VOID_REACH;
  for (const c of [rift.light, rift.glow, rift.hot]) {
    const d = Math.min(Math.abs(hue(c) - gemHue), 360 - Math.abs(hue(c) - gemHue));
    assert.ok(d > 90, 'rift ' + c + ' is too near the gem hue (' + d.toFixed(0) + ' deg)');
  }
});

check('everything on the ground reads on every floor (body or edge)', () => {
  const short = [];
  for (const [st, s] of Object.entries(stageTable())) {
    for (const r of s.rows) if (!r.reads) short.push(st + ' ' + r.label + ' ' + r.bodyRatio + '/' + r.edgeRatio + ' need ' + r.need);
  }
  assert.deepEqual(short, []);
});

check('the hero on a light floor: a dark keyline outside the warm ring; shots a dark rim', () => {
  const k = actorStyle(false, false, '#ffd8c4', true, false, true);
  assert.equal(k.outline3, '#0b0912');
  assert.equal(k.pad, 3);
  assert.equal(actorStyle(false, false, '#ffd8c4').outline3, null, 'no keyline by default');
  assert.equal(STYLE_SHOT.outline, '#ffffff');
  assert.equal(STYLE_SHOT_LIGHT.outline2, '#0b0912', 'the shot orb on a light floor: a dark outer rim');
  assert.equal(STYLE_SHOT_LIGHT.outline, '#ffffff', 'and the pale ring inside it, apart from the enemies\' plain dark outline');
  const src = fs.readFileSync(new URL('../src/render.js', import.meta.url), 'utf8');
  assert.match(src, /actorStyle\(hurt, false, HERO_WARM, true, false, !!this\.groundLight\)/, 'the hero blit asks for the keyline on a light floor');
  assert.match(src, /this\.groundLight \? STYLE_SHOT_LIGHT : STYLE_SHOT/, 'the shot blit picks the dark rim on a light floor');
  assert.match(src, /if \(this\.groundLight\) blitPainted\(g, 'heroRingK'/, 'the ring is keyed on a light floor');
});

// integ3: the white hit flash and the white kill pop vanished on snow (1.24 to
// 1 for a hurt hero on Whiteout). On a light floor they are dark instead.
check('on a light floor the hurt hero, a falling body and a kill puff are dark, not white', () => {
  const rl = (hex) => relLum(hex);
  const cr = (a, b) => (Math.max(rl(a), rl(b)) + 0.05) / (Math.min(rl(a), rl(b)) + 0.05);
  const hurt = actorStyle(true, false, '#ffd8c4', true, false, true);
  assert.equal(hurt.flash, FLASH_ON_LIGHT, 'the hurt hero on a light floor flashes dark');
  assert.equal(hurt.outline3, '#0b0912', 'and keeps its keyline');
  assert.equal(actorStyle(true, false, '#ffd8c4').flash, '#ffffff', 'on a dark floor the flash stays white');
  for (const id of STAGE_IDS.filter(groundIsLight)) {
    assert.ok(cr(FLASH_ON_LIGHT, base(id)) >= 3, id + ': the dark flash reads (3 to 1, a shape) ' + cr(FLASH_ON_LIGHT, base(id)).toFixed(2));
    assert.ok(cr(FX_ON_LIGHT.pop, base(id)) >= 3, id + ': the dark pop reads');
  }
  // The painters: a puff, a corpse fold and a spark, light floor and dark.
  const fills = (light) => {
    const seen = new Set();
    let fs0 = '';
    const g = { set fillStyle(v) { fs0 = v; }, get fillStyle() { return fs0; }, fillRect() { seen.add(fs0); }, globalAlpha: 1 };
    const state = { feel: { puffs: [0.05, 0.3, 0.5].map((a) => ({ x: 50, y: 50, age: a, ttl: 1, r: 8, cls: 1, rot: 0, colour: '#55aa55' })),
      sparks: [{ x: 40, y: 40, age: 0.1, ttl: 1, colour: '#ffcc00' }], bursts: [] } };
    drawFeelEffects(g, state, { x: 0, y: 0 }, false, light);
    return seen;
  };
  assert.ok(fills(false).has('#ffffff'), 'a dark floor keeps the white pop');
  const lit = fills(true);
  assert.ok(!lit.has('#ffffff'), 'no white on a light floor: ' + [...lit].join(' '));
  assert.ok(lit.has(FX_ON_LIGHT.pop) && lit.has(FX_ON_LIGHT.smoke));
  const src = fs.readFileSync(new URL('../src/render.js', import.meta.url), 'utf8');
  assert.match(src, /corpseStyle\(t < 0\.35, !!this\.groundLight, /, 'the corpse fold is told the floor');
  assert.match(src, /drawFeelEffects\(g, state, cam, prefersReducedMotion\(\), !!this\.groundLight\)/, 'the puffs are told the floor');
});

// polish P2: on a light floor the white outline on a dark body is the hurt
// hero's alone. A dying enemy's first beat is a plain dark silhouette there.
check('on a light floor a dying body is a plain dark silhouette, never the white outline of the hurt hero', () => {
  const hurt = actorStyle(true, false, '#ffd8c4', true, false, true);
  const fold = corpseStyle(true, true, true, true);
  assert.equal(hurt.outline, '#ffffff', 'the hurt hero keeps its white outline');
  assert.equal(fold.flash, FLASH_ON_LIGHT, 'the body is dark');
  assert.notEqual(fold.outline, '#ffffff', 'no white outline on the body: ' + fold.outline);
  assert.ok(relLum(fold.outline) < 0.05, 'its outline is dark: ' + fold.outline);
  assert.ok(!fold.outline2 && !fold.outline3, 'no ring, no keyline');
  assert.notEqual(fold.key, hurt.key, 'a different bake from the hurt hero');
  // Dark floors: as before, a white flash with a white outline.
  const dark = corpseStyle(true, false, true, true);
  assert.equal(dark, actorStyle(true, false, null, true, true));
  assert.equal(dark.flash, '#ffffff');
  // After the first beat, the body as it was, on any floor.
  assert.equal(corpseStyle(false, true, true, true), actorStyle(false, false, null, true, true));
});

// integ3: the HUD's see-through plate over a light floor left the blue find
// line (#4a8cff) at 2.9 to 1 on Whiteout and 'NO HAND YET' at 2.2 on
// Snowfield. On a light floor the plates go darker, and the empty-hand hint is
// lighter: every lane tint and the hint reach 4.5 on every floor.
check('HUD text on its plate reaches 4.5 to 1 on every floor', () => {
  const hx = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const rgba = (s) => { const m = /rgba\((\d+),(\d+),(\d+),([\d.]+)\)/.exec(s.replace(/\s/g, '')); return [[+m[1], +m[2], +m[3]], +m[4]]; };
  const over = (top, a, under) => top.map((v, i) => v * a + under[i] * (1 - a));
  const lumRgb = (c) => relLum('#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join(''));
  const cr = (a, b) => { const x = lumRgb(a), y = lumRgb(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const low = [];
  for (const id of STAGE_IDS) {
    const [pc, pa] = rgba(groundIsLight(id) ? C.HUD.PLATE_ON_LIGHT : C.HUD.PLATE);
    const bg = over(pc, pa, hx(base(id)));
    for (const [what, col] of [['find (blue)', '#4a8cff'], ['elite (red-orange)', '#ff7a4a'], ['NO HAND YET', FAN_EMPTY_TEXT], ['plain line', '#e4e4ee']]) {
      const r = cr(hx(col), bg);
      if (r < 4.5) low.push(id + ' ' + what + ' ' + r.toFixed(2));
    }
  }
  assert.deepEqual(low, []);
  const src = fs.readFileSync(new URL('../src/render.js', import.meta.url), 'utf8');
  assert.match(src, /const PLATE = this\.groundLight \? C\.HUD\.PLATE_ON_LIGHT : C\.HUD\.PLATE;/, 'the HUD picks its plate by the floor');
  assert.ok(!/g\.fillStyle = H\.PLATE;/.test(src.slice(src.indexOf('  drawHudChrome(g, state) {'), src.indexOf('chrome.hand = {'))), 'no HUD text plate ignores the floor');
});

// integ3: 'RULE BEATEN' and the other word pops read only by a thin shadow on snow.
check('a word pop (RULE BEATEN, +5G) has a dark plate on a light floor, none on a dark one', () => {
  const plates = (stage) => {
    const rects = [];
    let fs0 = '';
    const g = { set fillStyle(v) { fs0 = v; }, get fillStyle() { return fs0; }, fillRect(x, y, w, h) { rects.push(fs0); },
      fillText() {}, measureText: (t) => ({ width: t.length * 5 }), font: '', textAlign: '', textBaseline: '' };
    drawSites(g, { stage, sites: [{ kind: 'altar', x: -999, y: -999 }], sitePops: [{ x: 50, y: 50, text: 'RULE BEATEN', color: '#ffd75e', age: 0.1, ttl: 1.2 }] },
      { x: 0, y: 0 }, (x) => x < 0, true);   // the one site is off screen (pops draw after the sites)
    return rects.filter((c) => c === POP_PLATE).length;
  };
  assert.equal(plates('WHITEOUT'), 1);
  assert.equal(plates('SNOWFIELD'), 1);
  assert.equal(plates('VOID_REACH'), 0);
});

// polish P8: a stage with no sites returned before the pops were drawn.
check('the word pops show on a stage with no sites', () => {
  for (const sites of [[], undefined]) {
    const texts = [];
    const g = { fillStyle: '', fillRect() {}, fillText(t) { texts.push(t); }, measureText: (t) => ({ width: t.length * 5 }), font: '', textAlign: '', textBaseline: '' };
    drawSites(g, { stage: 'VOID_REACH', sites, sitePops: [{ x: 50, y: 50, text: 'RULE BEATEN', color: '#ffd75e', age: 0.1, ttl: 1.2 }] },
      { x: 0, y: 0 }, () => false, false);
    assert.ok(texts.includes('RULE BEATEN'), 'sites ' + JSON.stringify(sites) + ': ' + texts.join(','));
  }
});

// integ3: CLOUDY's bands had hard edges (grey stripes on the snow, 1.5 to 2.0 to 1).
check('CLOUDY bands fade at their edges, and are lighter on a light floor', () => {
  const draw = (groundLight) => {
    const fills = [];
    let fs0 = '';
    const g = { set fillStyle(v) { fs0 = v; }, get fillStyle() { return fs0; }, fillRect(x, y, w, h) { fills.push([fs0, y, h]); } };
    Renderer.prototype.drawWeatherSky.call({ groundLight }, g, initWeather('CLOUDY', 1), { x: 0, y: 0 });
    return fills.filter(([, , h]) => h === 2).map(([c, y, h]) => ({ a: +/,([\d.]+)\)$/.exec(c)[1], y, h }));   // the band strips (not the scene tint)
  };
  const dark = draw(false), light = draw(true);
  assert.ok(dark.length >= 8, 'strips, not one block per band');
  const band = dark.slice(0, CLOUD_BAND_RAMP.length);
  assert.ok(band[0].a <= 0.05 && band[band.length - 1].a <= 0.05, 'the edges are faint: ' + band.map(b => b.a));
  assert.ok(Math.max(...band.map(b => b.a)) <= 0.16, 'the middle no darker than before');
  assert.ok(Math.max(...light.map(b => b.a)) <= 0.1, 'lighter on a light floor');
});

// Paint four real underlay chunks of a stage (the cached path's painter, into
// a fake 2D context) and measure what the floor shows.
function paintStage(id) {
  const pal = stageGroundPalette(id, C.GROUND.THEMES[0]);
  const ft = new Set([pal.feat.light, pal.feat.dark, pal.feat.hot].filter(Boolean));
  const hx = (r, g, b) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
  const memo = new Map(), Ls = [];
  let n = 0, inFeat = 0, sl = 0, sa = 0, sb = 0;
  for (let k = 0; k < 4; k++) {
    const W = 256, d = new Uint8ClampedArray(W * W * 4);
    WORLD_GROUND_TEST.paintUnderlay({ getImageData: () => ({ data: d }), putImageData() {} }, W, W, (k & 1) * W + 1000, (k >> 1) * W + 700, pal, 12345);
    for (let i = 0; i < d.length; i += 4) {
      const h = hx(d[i], d[i + 1], d[i + 2]);
      let c = memo.get(h); if (!c) { c = lab(h); memo.set(h, c); }
      Ls.push(c[0]); sl += c[0]; sa += c[1]; sb += c[2]; n++;
      if (ft.has(h)) inFeat++;
    }
  }
  const med = Float64Array.from(Ls).sort()[Ls.length >> 1];
  return { mean: [sl / n, sa / n, sb / n], feat: inFeat / n, off: Ls.filter(L => Math.abs(L - med) > 4).length / n };
}
const painted = Object.fromEntries(STAGE_IDS.map(id => [id, paintStage(id)]));

check('the features are drawn into the floor, and the broad ones are not faint', () => {
  for (const id of STAGE_IDS) {
    const s = painted[id], kind = STAGE_GROUND_FEATURES[id].kind;
    assert.ok(s.feat >= 0.02, id + ': the feature tones cover ' + (s.feat * 100).toFixed(1) + '% of the painted floor');
    if (kind !== 'cracks') {
      // patches, pools, drifts: a real share of the floor, and a floor that is
      // not one flat tint (pixels more than 4 L* from the median)
      assert.ok(s.feat >= 0.2, id + ': ' + kind + ' cover only ' + (s.feat * 100).toFixed(1) + '%');
      assert.ok(s.off >= 0.2, id + ': only ' + (s.off * 100).toFixed(1) + '% of the floor is off the median tone');
    }
  }
});

check('no two floors alike as PAINTED (features in), with room for the weather tint', () => {
  // The weather tint and the decor take about 4 dE off a pair as drawn
  // (Snowfield/Whiteout: 15.2 painted, 11.1 in a SUNNY/SNOW frame), so the
  // painted means keep 15 apart, and the two snow stages 18.
  let min = 99, at = '';
  for (let i = 0; i < STAGE_IDS.length; i++) for (let j = i + 1; j < STAGE_IDS.length; j++) {
    const a = painted[STAGE_IDS[i]].mean, b = painted[STAGE_IDS[j]].mean;
    const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    if (d < min) { min = d; at = STAGE_IDS[i] + '/' + STAGE_IDS[j]; }
  }
  assert.ok(min >= 15, 'closest painted pair ' + at + ' dE ' + min.toFixed(1));
  const s = painted.SNOWFIELD.mean, w = painted.WHITEOUT.mean;
  const sw = Math.hypot(s[0] - w[0], s[1] - w[1], s[2] - w[2]);
  assert.ok(sw >= 18, 'Snowfield and Whiteout as painted are only ' + sw.toFixed(1) + ' apart');
  assert.ok(s[2] <= -12, 'Snowfield as painted keeps its blue (b* ' + s[2].toFixed(1) + ')');
});

const { boot } = await import('./_harness.mjs');
const H = await boot();
check('the renderer knows a light floor from the stage it draws', () => {
  for (const id of ['SNOWFIELD', 'VERDANT_HOLLOW', 'WHITEOUT', 'CINDER_MAW']) {
    H.T.stages.select(id);
    H.T.startRun();
    H.pump(2);
    assert.equal(H.state.stage, id);
    assert.equal(!!H.T.renderer.groundLight, groundIsLight(id), id);
    // integ3: the menus over the run know it too (a darker scrim, index.html).
    assert.equal(H.elements.overlay.classList.contains('floor-light'), groundIsLight(id), id + ': the overlay flag');
  }
});

// polish P4: the darker scrim is for a light-floor run behind the overlay only.
// The renderer remembers the last run's floor; the menus outside a run must not.
check('the light-floor scrim is on only while a light-floor run is behind the overlay', () => {
  const flag = () => H.elements.overlay.classList.contains('floor-light');
  H.T.stages.select('WHITEOUT');
  H.T.startRun();
  H.pump(2);
  assert.ok(flag(), 'in the run');
  H.T.openSettings();
  H.pump(1);
  assert.equal(H.state.mode, 'settings');
  assert.ok(flag(), 'in-run settings');
  H.T.menus.showHowToPlay({ inRun: true });
  H.pump(1);
  assert.ok(flag(), 'in-run help');
  H.T.menus.showTitle();
  H.pump(2);
  assert.ok(H.T.renderer.groundLight, 'the renderer still has the light floor');
  assert.ok(!flag(), 'the title');
  H.T.menus.showShop();
  H.pump(2);
  assert.ok(!flag(), 'the shop');
  H.T.menus.showSettings(true, false);
  H.pump(2);
  assert.ok(!flag(), 'settings from the title');
  H.T.menus.showHowToPlay({ inRun: false });
  H.pump(2);
  assert.ok(!flag(), 'help from the title');
  for (const m of ['showPreRun', 'showLoadout', 'showProgress']) {
    H.T.menus[m]();
    H.pump(2);
    assert.ok(!flag(), m + ' (' + H.state.mode + ')');
  }
  H.T.openTrophies();
  H.pump(2);
  assert.ok(!flag(), 'the trophies (' + H.state.mode + ')');
  H.T.stages.select('WHITEOUT');
  H.T.startRun();
  H.pump(2);
  assert.ok(flag(), 'a new run on a light floor turns it on again');
});

console.log('test_stage_keys: ' + passed + ' checks passed');
