// R6 LIGHT: glow and a light layer (src/light.js; docs/REVIEW_2026-11.md R6).
//   1. THE FLOOR: at the darkest the layer goes, every thing on the ground
//      that is not lit by its own light still reads by the stage keys' bar
//      (body or edge, 3:1; the horde 2.75:1) on every floor tone under every
//      wave light; on a dark floor the darkness is darker than the floor.
//   2. THE NIGHT: dark stages are dark by day; every stage darkens with the
//      wave's light, and the light stages by day are as they were.
//   3. THE LIGHTS: the hero is always lit; lit windows, fires and lanterns are
//      found in the art; enemy shots get a red-orange halo laid on; the
//      player's own shots glow weaker and never in red-orange; LOW keeps the
//      threats and drops the small glows; OFF draws nothing.
//   4. THE ORDER: the layer is composed after the floor, the buildings and the
//      props and before every pickup, actor and shot; the HUD comes after.
//   5. NO CHANGE TO A RUN: the light reads state and writes none, draws no
//      random number, and a seeded run plays the same with it ON and OFF.
//   6. THE FALLBACK: slow frames step ON -> LOW -> OFF; it comes back only
//      after a long fast stretch, and a quick relapse doubles the wait.
//   7. THE SETTING: LIGHTING: ON / LOW / OFF on ADVANCED, remembered, default ON.
// Run: node test/test_light.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { boot, suite } from './_harness.mjs';
import { CONFIG as C } from '../src/config.js';
import { groundIsLight, relLum } from '../src/world_ground.js';
import * as M from '../tools/stage_keys_measure.mjs';
import {
  ambientFor, poolStrength, over, contrast, STAGE_DARK, LIGHT_STAGES,
  nightAt, nightOf, NIGHT, NIGHT_BLEND_S, designLights, gatherLights, GLOW, LightLayer, LightGovernor, GOV,
  lightingPref, nextLightingPref, KEY_LIGHTING, EMISSIVE,
} from '../src/light.js';
import * as PAL from '../src/palette.js';

const { check, done } = suite('test_light');

// The stage keys' bar (tools/stage_keys_measure.mjs) under a darkness of
// alpha a: the things that do not carry their own light.
const unlit = (light) => M.groundThings(light).filter(([lab]) => !/^hero|^enemy shot|^portal/.test(lab));
const reads = (st, a) => {
  const light = groundIsLight(st), tones = M.floorTones(st), col = STAGE_DARK[st].col;
  const dark = tones.map((t) => over(t, col, a));
  const r = (tt, body, edge) => Math.max(Math.min(...tt.map((t) => contrast(body, t))), Math.min(...tt.map((t) => contrast(edge, t))));
  return unlit(light).filter(([lab, body, edge]) => r(dark, body, edge) < Math.min(M.needOf(lab), r(tones, body, edge)) - 1e-9)
    .map(([lab, body, edge]) => st + ' ' + lab + ' ' + r(dark, body, edge).toFixed(2));
};
check('the floor: at the darkest, every thing on the ground still reads by the stage keys bar', () => {
  assert.deepEqual([...LIGHT_STAGES].sort(), Object.keys(STAGE_DARK).sort());
  const low = [];
  for (const id of LIGHT_STAGES) {
    const a = ambientFor(id, 1).a;
    assert.equal(a, STAGE_DARK[id].night);
    low.push(...reads(id, a));
    // A dark floor: the darkness is darker than every floor tone (a body only gains).
    if (!groundIsLight(id)) for (const t of M.floorTones(id)) assert.ok(relLum(STAGE_DARK[id].col) < relLum(t), id + ' darkness lighter than ' + t);
  }
  assert.deepEqual(low, [], 'under the bar at night: ' + low.join('; '));
  // On a light floor the night is as deep as the floor allows: 0.02 more breaks it.
  for (const id of LIGHT_STAGES.filter(groundIsLight)) assert.ok(reads(id, STAGE_DARK[id].night + 0.02).length > 0, id + ' could be darker');
  // The things left out carry their own light: the hero, each enemy shot, the portal.
  const L = gatherLights({ time: 1, player: { x: 0, y: 0 }, enemyShots: [{ x: 50, y: 0 }], portal: { x: -60, y: 0, age: 1 } }, { x: 0, y: 0 }, [], 1, true);
  for (const [x, y] of [[0, 0], [50, 0], [-60, 0]]) assert.ok(L.holes.some((h) => h.x === x && h.y === y && h.a >= 0.9), 'lit at ' + x);
});

check('the night: dark stages are dark by day, light stages as they were; night is darker', () => {
  for (const id of LIGHT_STAGES) {
    const day = ambientFor(id, 0).a, night = ambientFor(id, 1).a;
    if (groundIsLight(id)) assert.equal(day, 0, id + ' by day is as it was');
    else assert.ok(day >= 0.3, id + ' is dark by day');
    assert.ok(night > day + 0.15, id + ' night reads as night (' + day + ' -> ' + night + ')');
  }
  assert.equal(NIGHT.length, C.GROUND.THEMES.length, 'one light per wave theme');
  assert.equal(nightOf(1), 0, 'the first wave is day');
  assert.ok(Math.max(...NIGHT) === 1, 'a wave of deep night');
  // A new wave's light blends in on the sim clock.
  assert.equal(nightAt(4, 360, 360), nightOf(3),'at the wave start: the last wave\'s light');
  assert.equal(nightAt(4, 360 + NIGHT_BLEND_S, 360), nightOf(4));
  const mid = nightAt(4, 360 + NIGHT_BLEND_S / 2, 360);
  assert.ok(mid > Math.min(nightOf(3), nightOf(4)) && mid < Math.max(nightOf(3), nightOf(4)));
});

check('the art lights itself: windows, fires and lanterns are found in the buildings and props', () => {
  for (const id of ['HOLLOW_LODGE', 'EMBER_HALL', 'DRIFT_CHAPEL', 'VOID_ANNEX', 'CINDER_KILN', 'EMBER_BRAZIER', 'TRAIL_LANTERN']) {
    const L = designLights(id);
    assert.ok(L.length >= 1, id + ' has a light');
    for (const l of L) assert.ok(l.r > 10 && l.a > 0 && /^#[0-9a-f]{6}$/.test(l.col), id + ' light shape');
  }
  assert.equal(designLights('OSSUARY_ARCH').length, 0, 'a building with no lamp gives no light');
  assert.equal(designLights('NOT_A_DESIGN').length, 0);
});

const S0 = () => ({
  time: 100, stage: 'VOID_REACH', wave: { num: 4, endsAt: 200 },
  player: { x: 0, y: 0 }, enemies: [], gems: [], sites: [], portal: null,
  enemyShots: [{ x: 30, y: 0, kind: 'spit' }, { x: -30, y: 0, kind: 'bolt' }],
  projectiles: [{ x: 10, y: 10, kind: 'bullet' }, { x: 12, y: 10, kind: 'ember' }],
});
const cam = { x: -240, y: -150 };
const hexHue = (h) => { const n = parseInt(h.slice(1), 16); const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b); if (mx === mn) return 0;
  const d = mx - mn; let hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; hh *= 60; return hh < 0 ? hh + 360 : hh; };

check('the lights of a frame: the hero always, a halo on each enemy shot, weaker player glows', () => {
  const L = gatherLights(S0(), cam, [], 2, false);
  assert.ok(L.holes.some((h) => h.x === 240 && h.y === 150 && h.r >= 60 && h.a === 1), 'the hero stands in light');
  const halos = L.glows.filter((w) => w.col === GLOW.enemyShot && w.op === 'source-over');
  assert.equal(halos.length, 2, 'every enemy shot wears a halo laid on (shows on any floor)');
  const mine = L.glows.filter((w) => !w.pool && w.col !== GLOW.enemyShot && w.col !== GLOW.hero);
  assert.equal(mine.length, 2, 'the player\'s shots glow');
  for (const w of mine) {
    assert.ok(w.a < Math.min(...halos.map((h) => h.a)) && w.r < Math.min(...halos.map((h) => h.r)), 'weaker than a threat');
    const hue = hexHue(w.col);
    assert.ok(hue > 25 || hue < 0.1, w.col + ' is not red-orange (hue ' + hue.toFixed(0) + ')');
  }
  assert.ok(hexHue(GLOW.enemyShot) < 20, 'the threat glow is red-orange');
  const tealH = hexHue(GLOW.portal);
  assert.ok(tealH > 160 && tealH < 190, 'the portal glows cyan-teal');
  // LOW: the threats stay, the player's shots go.
  const low = gatherLights(S0(), cam, [], 1, false);
  assert.equal(low.glows.filter((w) => w.col === GLOW.enemyShot && w.op === 'source-over').length, 2);
  assert.equal(low.glows.filter((w) => w.col === GLOW.shot || w.col === GLOW.fire).length, 0);
});

// integ4: a light keeps a reserved colour only with its meaning. The enemy shots glow
// danger, the hero warm white, the portal reward; every other glow (fires, braziers,
// windows, lanterns, shrines, the player's shots) stays out of all three families.
check('the light colours: only the threat, the hero and the portal glow in a reserved family', () => {
  const bad = [];
  const want = { enemyShot: 'DANGER', hero: 'HERO', portal: 'REWARD' };
  for (const [k, col] of Object.entries(GLOW)) {
    const r = PAL.nearestReserved(col);
    if (want[k]) { if (r.fam !== want[k] || r.de >= PAL.RESERVED_DE) bad.push(k + ' ' + col + ' is not ' + want[k]); }
    else if (r.de < PAL.RESERVED_DE) bad.push('GLOW.' + k + ' ' + col + ' sits ' + r.de.toFixed(1) + ' from ' + r.fam);
  }
  for (const [art, col] of Object.entries(EMISSIVE)) {
    const r = PAL.nearestReserved(col);
    if (r.de < PAL.RESERVED_DE) bad.push('EMISSIVE ' + art + ' -> ' + col + ' sits ' + r.de.toFixed(1) + ' from ' + r.fam);
  }
  assert.deepEqual(bad, []);
});

check('flicker reads the sim clock (none in reduced motion); nothing is written to the state', () => {
  const s = S0();
  s.sites = [{ kind: 'brazier', x: 50, y: 50, state: 'unused' }];
  const snap = JSON.stringify(s);
  const real = Math.random;
  Math.random = () => { throw new Error('the light drew a random number'); };
  try {
    const a = gatherLights(s, cam, [], 2, false), b = gatherLights(s, cam, [], 2, false);
    assert.deepEqual(a, b, 'the same sim time gives the same light');
    s.time += 0.1;
    const c = gatherLights(s, cam, [], 2, false);
    assert.notDeepEqual(a.holes.find((h) => h.x === 290), c.holes.find((h) => h.x === 290), 'the fire moves with the sim clock');
    const r1 = gatherLights(s, cam, [], 2, true); s.time += 0.37;
    const r2 = gatherLights(s, cam, [], 2, true);
    assert.deepEqual(r1.holes.find((h) => h.x === 290), r2.holes.find((h) => h.x === 290), 'reduced motion: no flicker');
    const lay = new LightLayer();
    lay.compose({ drawImage() {}, save() {}, restore() {} }, s, cam, { x0: 0, y0: 0, x1: 480, y1: 300 }, [], [], 2, false);
  } finally { Math.random = real; }
  s.time -= 0.47;
  assert.equal(JSON.stringify(s), snap, 'the state is unchanged');
  const src = fs.readFileSync(new URL('../src/light.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /Math\.random|performance\.now|Date\.now/, 'no random draw, no wall clock in the picture');
});

check('the order: floor, buildings and props, then the layer, then pickups and actors; the HUD last', () => {
  const src = fs.readFileSync(new URL('../src/render.js', import.meta.url), 'utf8');
  const at = (re) => { const m = src.search(re); assert.ok(m > 0, 'missing ' + re); return m; };
  const layer = at(/this\.lightOut = this\.light\.compose\(/);
  assert.ok(at(/this\.drawGround\(g, state\.groundSeed/) < layer);
  assert.ok(at(/this\.drawLandmarks\(g, state\.groundSeed/) < layer);
  assert.ok(at(/this\.drawArenaWall\(g, cam, gpal\)/) < layer);
  assert.ok(layer < at(/sink\.gems = \[\]/), 'gems above the layer');
  assert.ok(layer < at(/drawSites\(g, state, cam, cull/), 'sites above');
  assert.ok(layer < at(/Enemy projectiles \(SHOT_PAINT\)/), 'enemy shots above');
  assert.ok(layer < at(/sink\.order\.push\('hero'\)/), 'the hero above');
  assert.ok(layer < at(/this\.drawPlayHud\(g, state\)/), 'the HUD above');
  assert.ok(layer < at(/this\.drawHudChrome\(g, state\)/), 'the HUD chrome above');
  // integ4: the layer is composed in one place only, so no second compose can land over the HUD.
  assert.equal((src.match(/\.light\.compose\(/g) || []).length, 1, 'the light layer is composed once');
});

check('the governor: slow frames step ON -> LOW -> OFF; a long fast stretch brings it back; no flapping', () => {
  const gv = new LightGovernor();
  const run = (ms, s, cap = 2) => { let lv; for (let t = 0; t < s; t += 1 / 60) lv = gv.sample(ms, 1 / 60, cap); return lv; };
  assert.equal(run(5, 10), 2, 'fast frames: ON');
  assert.equal(run(30, GOV.DOWN_AFTER_S * 0.5), 2, 'a short stall does nothing');
  assert.equal(run(30, GOV.DOWN_AFTER_S + 0.6), 1, 'slow: LOW first');
  assert.equal(run(30, GOV.DOWN_AFTER_S + 0.1), 0, 'still slow: OFF');
  assert.equal(run(30, 20), 0, 'it stays off');
  assert.equal(run(5, GOV.UP_AFTER_S - 1), 0, 'not back at once');
  assert.equal(run(5, 1.5), 1, 'a long fast stretch: one step back');
  // A relapse within FLAP_S of the step up doubles the next wait.
  assert.equal(run(30, GOV.DOWN_AFTER_S + 1), 0);
  assert.equal(gv.upWait, GOV.UP_AFTER_S * 2, 'the wait doubled');
  assert.equal(run(5, GOV.UP_AFTER_S + 1), 0, 'the old wait is not enough now');
  assert.equal(run(5, GOV.UP_AFTER_S), 1);
  // The player's setting caps it.
  const g2 = new LightGovernor();
  assert.equal(g2.sample(1, 1 / 60, 1), 1, 'LOW is LOW');
  assert.equal(g2.sample(1, 1 / 60, 0), 0, 'OFF is OFF');
});

check('the setting: ON / LOW / OFF, default ON, remembered', () => {
  const store = new Map();
  const st = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) };
  assert.equal(lightingPref(st), 'ON');
  store.set(KEY_LIGHTING, 'LOW'); assert.equal(lightingPref(st), 'LOW');
  store.set(KEY_LIGHTING, 'junk'); assert.equal(lightingPref(st), 'ON');
  assert.equal(lightingPref({ getItem() { throw new Error('blocked'); } }), 'ON');
  assert.deepEqual([nextLightingPref('ON'), nextLightingPref('LOW'), nextLightingPref('OFF')], ['LOW', 'OFF', 'ON']);
});

// ---- review fixes ----------------------------------------------------------------
// A canvas that records what is drawn on it (no raster): enough for compose.
const drawLog = [];
let canvasId = 0;
class MockCanvas {
  constructor(w, h) {
    this.width = w; this.height = h; this.id = 'c' + (++canvasId);
    const self = this;
    this.ctx = {
      globalAlpha: 1, globalCompositeOperation: 'source-over', imageSmoothingEnabled: true, fillStyle: '',
      fillRect() {}, clearRect() {}, save() {}, restore() {}, putImageData() {},
      createImageData: (w2, h2) => ({ data: new Uint8ClampedArray(w2 * h2 * 4) }),
      getImageData: () => ({ data: new Uint8ClampedArray([255, 255, 255, 255]) }),
      createRadialGradient: () => ({ addColorStop() {} }),
      drawImage(img, x, y, w2, h2) { drawLog.push({ on: self.id, img: img && img.id, op: this.globalCompositeOperation, a: this.globalAlpha, x, y, w: w2, h: h2 }); },
    };
  }
  getContext() { return this.ctx; }
}
const { SPRITE_CACHE_TEST } = await import('../src/sprite_cache.js');
const { lightRect, SHADE, LIGHT_W, LIGHT_H, GLOW_W, GLOW_H, MID_W, MID_H, KEY_LIGHT_AUTO, lightAutoPref } = await import('../src/light.js');
const { EMIT_LIGHT, STAGE_GROUND_PALETTES } = await import('../src/world_ground.js');
const withMock = (fn) => {
  globalThis.OffscreenCanvas = MockCanvas;
  SPRITE_CACHE_TEST.reprobe();
  try { return fn(); } finally { delete globalThis.OffscreenCanvas; SPRITE_CACHE_TEST.reprobe(); }
};
const VIEW = { x0: 0, y0: 0, x1: 480, y1: 300 };
// Compose one frame on a recording canvas; returns { out, main } (what the main canvas got, in order).
const composeOn = (s, level, mix = null) => withMock(() => {
  const g = new MockCanvas(960, 600);
  const lay = new LightLayer();
  drawLog.length = 0;
  const out = lay.compose(g.ctx, s, cam, VIEW, [], [], level, false, mix);
  return { out, lay, main: drawLog.filter((d) => d.on === g.id) };
});
const night = (stage) => ({ ...S0(), stage, wave: { num: 4, endsAt: 100 + C.ESCALATION.WAVE_LENGTH - 30 } });

check('a threat on a lit dark floor: each enemy shot lays a shade under its halo, dark enough on any light', () => {
  // On every dark stage each enemy shot carries a shade; a light floor needs none.
  for (const id of LIGHT_STAGES) {
    const L = gatherLights({ ...S0(), stage: id }, cam, [], 2, false);
    assert.equal(L.shades.length, !groundIsLight(id) && poolStrength(id) > 0.5 ? 2 : 0, id + ' shades');
  }
  assert.equal(gatherLights({ ...S0(), stage: 'CINDER_MAW' }, cam, [], 2, false).shades.length, 2, 'Cinder Maw shades');
  for (const id of LIGHT_STAGES) {
    // A stage without shades keeps its floor dark round a shot: weak pools.
    if (!groundIsLight(id) && !(poolStrength(id) > 0.5)) assert.ok(poolStrength(id) <= 0.5, id);
  }
  // The shade's flat middle reaches past the orb's rim (spit r 6, bolt 8 px),
  // and over ANY lit floor (white, the threat's own colour, an amber pool) it
  // leaves the orb at 3:1 or more against what is just behind it.
  assert.ok(SHADE.r * 0.5 >= 6 && SHADE.bigR * 0.5 >= 8, 'the flat core covers the rim');
  for (const lit of ['#ffffff', GLOW.enemyShot, '#ffd88a', EMIT_LIGHT.CINDER_MAW]) {
    const behind = over(lit, SHADE.col, SHADE.core);
    assert.ok(contrast(GLOW.enemyShot, behind) >= 3, 'orb vs shaded ' + lit + ': ' + contrast(GLOW.enemyShot, behind).toFixed(2));
    assert.ok(contrast('#ffffff', behind) >= 7, 'white rim vs shaded ' + lit);
  }
  // In compose: the shades go on after the glow canvas and before the halos, at ON and at LOW.
  for (const lv of [2, 1]) {
    const { out, main } = composeOn(night('CINDER_MAW'), lv);
    assert.equal(out.shades, 2, 'level ' + lv + ': two shades');
    const iShade = main.findIndex((d) => d.w === SHADE.r * 2 || d.w === SHADE.bigR * 2);
    const iHalo = main.findIndex((d) => d.w === 26 || d.w === 20);
    assert.ok(iShade >= 0 && iHalo > iShade, 'shade before halo');
    if (lv === 2) assert.ok(main.findIndex((d) => d.op === 'lighter') < iShade, 'glow canvas before the shade');
  }
});

check('the ember cracks glow amber, away from the threat red-orange', () => {
  const th = hexHue(GLOW.enemyShot);
  for (const [id, pal] of Object.entries(STAGE_GROUND_PALETTES)) {
    const f = pal.feat;
    if (!f || f.kind !== 'cracks') continue;
    const col = EMIT_LIGHT[id] || f.hot || f.glow || f.light;
    const d = Math.abs(hexHue(col) - th), dh = Math.min(d, 360 - d);
    assert.ok(dh >= 15, id + ' crack light ' + col + ' only ' + dh.toFixed(0) + ' deg from the threat');
  }
  // ...and the chunk's glow mask is painted in that light.
  const wg = fs.readFileSync(new URL('../src/world_ground.js', import.meta.url), 'utf8');
  assert.match(wg, /img\.emit = emitCanvas\(em, pal\.feat, EMIT_LIGHT\[st\]\)/);
  assert.match(wg, /const G = hexRgb\(col \|\| feat\.hot/);
});

check('the player\'s weapon effects glow in their own colours, weaker than a threat; an enemy\'s do not', () => {
  const s = S0();
  s.effects = [
    { kind: 'nova', x: 0, y: 0, radius: 80, age: 0.1, ttl: 0.4 },
    { kind: 'zap', points: [{ x: 0, y: 0 }, { x: 40, y: 10 }, { x: 80, y: -5 }], age: 0, ttl: 0.15 },
    { kind: 'beam', x: 0, y: 0, dir: 0, from: -0.2, to: 0.2, len: 160, width: 4, age: 0.1, ttl: 0.35 },
    { kind: 'scythe_arc', x: 0, y: 0, dir: 1, radius: 60, arc: 2, age: 0, ttl: 0.25 },
    { kind: 'boss_nova', x: 0, y: 0, radius: 30, age: 0, ttl: 0.5 },
    { kind: 'colossus_shock', x: 0, y: 0, radius: 30, age: 0, ttl: 0.5 },
  ];
  const base = gatherLights(S0(), cam, [], 2, false).glows.length;
  const L = gatherLights(s, cam, [], 2, false);
  const fx = L.glows.slice(base + 0);
  assert.equal(fx.length, 1 + 3 + 4 + 1, 'a nova, three zap points, four beam lights, a sweep; nothing for the boss');
  for (const w of fx) {
    assert.ok(w.op === 'lighter' && w.a < 0.6, 'weaker than a threat halo');
    const h = hexHue(w.col);
    assert.ok(h > 25, w.col + ' is not red-orange');
  }
  assert.equal(gatherLights(s, cam, [], 1, false).glows.length, gatherLights(S0(), cam, [], 1, false).glows.length, 'LOW: no effect glow');
});

check('chests and potions carry a little light (a pale floor at night keeps their outline)', () => {
  const s = { ...S0(), chests: [{ x: 70, y: 70 }], drops: [{ x: -70, y: 70 }] };
  const L = gatherLights(s, cam, [], 1, false);
  for (const [x, y] of [[310, 220], [170, 220]]) assert.ok(L.holes.some((h) => h.x === x && h.y === y && h.a >= 0.9), 'lit at ' + x);
});

check('LOW draws no glow canvas; ON does; reduced motion: the portal does not pulse', () => {
  assert.equal(composeOn(night('VOID_REACH'), 1).out.glowCanvas, false, 'LOW: no glow canvas');
  assert.equal(composeOn(night('VOID_REACH'), 2).out.glowCanvas, true, 'ON: the glow canvas');
  const s = { ...S0(), portal: { x: 0, y: 0, age: 2 } };
  const r1 = gatherLights(s, cam, [], 2, true).holes[1].r;
  s.time += 0.4;
  assert.equal(gatherLights(s, cam, [], 2, true).holes[1].r, r1, 'no portal pulse in reduced motion');
  assert.notEqual(gatherLights(s, cam, [], 2, false).holes[1].r, r1, 'it pulses otherwise');
});

check('a step of the light fades: the top part is drawn at the fade\'s share', () => {
  const full = composeOn(night('VOID_REACH'), 2).main.find((d) => d.op === 'lighter');
  const half = composeOn(night('VOID_REACH'), 2, 1.5).main.find((d) => d.op === 'lighter');
  assert.equal(full.a, 1);
  assert.ok(Math.abs(half.a - 0.5) < 1e-9, 'the glow canvas at half');
  assert.ok(Math.abs(composeOn(night('VOID_REACH'), 1, 0.25).out.a - ambientFor('VOID_REACH', 1).a * 0.25) < 1e-9, 'the darkness at a quarter');
});

check('the layers are pinned to the world: a pan does not resample the cracks\' glow', () => {
  const R0 = lightRect(VIEW, { x: 0, y: 0 });
  // One snap step is a whole number of cells of every canvas.
  for (const [n, W] of [[LIGHT_W, 16], [GLOW_W, 16], [MID_W, 16]]) assert.ok(Number.isInteger(n / W), n + ' / 16');
  for (const n of [LIGHT_H, GLOW_H, MID_H]) assert.ok(Number.isInteger(n / 10), n + ' / 10');
  for (const c of [{ x: 0, y: 0 }, { x: 13, y: -7 }, { x: 101.5, y: 37.25 }, { x: -999, y: 444 }]) {
    const R = lightRect(VIEW, c);
    assert.ok(Math.abs(R.vw - R0.vw) < 1e-9 && Math.abs(R.vh - R0.vh) < 1e-9, 'same size');
    const fx = (R.x0 + c.x) / R.stx, fy = (R.y0 + c.y) / R.sty;
    assert.ok(Math.abs(fx - Math.round(fx)) < 1e-6 && Math.abs(fy - Math.round(fy)) < 1e-6, 'on the world grid');
    assert.ok(R.x0 <= VIEW.x0 && R.y0 <= VIEW.y0 && R.x0 + R.vw >= VIEW.x1 && R.y0 + R.vh >= VIEW.y1, 'covers the view');
  }
  const { out } = composeOn(night('VOID_REACH'), 2);
  assert.deepEqual(out.rect, (({ x0, y0, vw, vh }) => ({ x0, y0, vw, vh }))(lightRect(VIEW, cam)), 'compose uses it');
});

check('the governor watches the light\'s own cost: dear light steps down, cheap light stays', () => {
  const run = (gv, ms, light, s, cap = 2) => { let lv; for (let t = 0; t < s; t += 1 / 60) lv = gv.sample(ms, 1 / 60, cap, light); return lv; };
  const gpu = new LightGovernor();
  assert.equal(run(gpu, 4, 0.3, 60), 2, 'a GPU canvas: the light is cheap, ON stays');
  const soft = new LightGovernor();
  assert.equal(run(soft, 5.7, 1.2, GOV.DOWN_AFTER_S + 0.5), 1, 'fast frames, but the light costs 1.2 ms: LOW');
  assert.equal(run(soft, 4.3, 0.7, 60), 1, 'LOW at 0.7 ms holds; not cheap enough to try ON again');
  const lowDear = new LightGovernor(1);
  assert.equal(run(lowDear, 4, 1.6, GOV.DOWN_AFTER_S + 0.5), 0, 'LOW still dear: OFF');
  assert.equal(lightAutoPref({ getItem: () => '0' }), 0);
  assert.equal(lightAutoPref({ getItem: () => '1' }), 1);
  assert.equal(lightAutoPref({ getItem: () => null }), 2);
  assert.equal(new LightGovernor(1).level, 1, 'it starts where it was left');
});

const H = await boot();
check('the game: the ADVANCED card cycles the setting and remembers it; a slowed clock steps the light down', () => {
  const T = H.T;
  assert.equal(T.light.setting, 'ON', 'default ON');
  T.light.setLighting('LOW');
  assert.equal(H.storage.get(KEY_LIGHTING), 'LOW', 'remembered');
  T.light.setLighting('ON');
  T.startRun(); H.skipMovie();
  assert.equal(T.state.mode, 'playing');
  // A slowed clock: every render costs 25 ms of wall time.
  const r = T.renderer, orig = r.render.bind(r);
  r.render = (...a) => { H.advanceClock(25); return orig(...a); };
  H.pump(60 * (GOV.DOWN_AFTER_S * 2 + 1));
  r.render = orig;
  assert.equal(r.lightLevel, 0, 'slow frames turned the light off');
  assert.equal(T.light.setting, 'ON', 'the player\'s setting is not changed by it');
  assert.equal(H.storage.get(KEY_LIGHT_AUTO), '0', 'the fallback is remembered');
  // A choice by the player starts afresh, and the step fades in (no pop).
  T.light.setLighting('ON');
  assert.equal(H.storage.has(KEY_LIGHT_AUTO), false, 'cleared by the player\'s choice');
  H.pump(1);
  assert.ok(r.lightMix > 0 && r.lightMix < 1 && r.lightLevel === 1, 'fading in: ' + r.lightMix);
  H.pump(60 * 2);
  assert.equal(r.lightMix, 2);
  assert.equal(r.lightLevel, 2);
});
const H2 = await boot({ variant: 'auto', storage: [[KEY_LIGHT_AUTO, '1']] });
check('a reload starts the light where the fallback left it', () => {
  assert.equal(H2.T.light.gov.level, 1);
});
// integ4: the setting said ON while the fallback drew LOW; the card now says so.
const H3 = await boot({ variant: 'card', storage: [['hordes_onboarded', '1'], [KEY_LIGHT_AUTO, '1']] });
check('the LIGHTING card says when the fallback draws lower than the setting', () => {
  const T = H3.T;
  T.startRun(); H3.skipMovie();
  const card = () => {
    H3.key('keydown', { key: 'Escape' });
    if (T.state.mode !== 'settings') H3.key('keydown', { key: 'Escape' });
    H3.elements['ov-cards'].children.find((c) => /ADVANCED/.test(c.innerHTML)).click();
    const c = H3.elements['ov-cards'].children.find((x) => /LIGHTING/.test(x.innerHTML));
    assert.ok(c, 'the LIGHTING card');
    return c;
  };
  const c1 = card();
  assert.equal(T.light.setting, 'ON');
  assert.match(c1.innerHTML, /LIGHTING: ON/);
  assert.match(c1.innerHTML, /now LOW/, 'the drawn level: ' + c1.innerHTML);
  c1.click();   // the player's choice clears the fallback: LOW, drawn at LOW
  const c2 = H3.elements['ov-cards'].children.find((x) => /LIGHTING/.test(x.innerHTML));
  assert.match(c2.innerHTML, /LIGHTING: LOW/);
  assert.doesNotMatch(c2.innerHTML, /now /, 'no note when the setting is what is drawn');
});

// The same seed, light ON and OFF, in two fresh processes (test/_light_run.mjs).
const { spawnSync } = await import('node:child_process');
const play = (v) => {
  const r = spawnSync(process.execPath, ['--import', './test/_seed_random.mjs', 'test/_light_run.mjs', v],
    { cwd: new URL('..', import.meta.url), env: { ...process.env, HORDES_RNG: '7' }, encoding: 'utf8', timeout: 120000 });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim().split(/\r?\n/).pop();
};
check('a seeded run plays the same with the light ON and OFF', () => {
  const on = play('ON'), off = play('OFF');
  assert.ok(JSON.parse(on).frames > 0);
  assert.equal(on, off);
});
done();
