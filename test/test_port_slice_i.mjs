// HORDES — PORT SLICE I: UI chrome (meter housings, badge/plate trim,
// radar rim ticks, fullscreen keyline, held-banner trim).
// Run: node test/test_port_slice_i.mjs
//
// The slice re-dresses ONLY canvas HUD housings in src/render.js (visual-only,
// through src/art/hud_chrome.js ORIGINAL trim painters): every plain housing
// rectangle the HUD already painted keeps its exact record (coords + style +
// order) and gains 1px furniture strictly INSIDE its footprint — chamfered
// bar corners, rivet studs, inner keylines, radar rim ticks. Triggers, values,
// timings, text, layout and the canvas ladder are byte-identical. This file
// pins all four sides, headless through the real Renderer (the
// test_render_hud.mjs pattern — never main.js):
//
//   A. COMPOSITION — each dressed surface carries its marker inks
//      (CHROME_INKS.RIVET / KEYLINE, canvas-absent before this slice) at the
//      exact derived coords.
//   B. BOUNDS UNMOVED — every frozen housing record still lands with the same
//      x/y/w/h/style the existing UI contract tests pin, the chrome seam
//      reads the same fields, and EVERY marker rect is contained in a
//      previously-painted housing rect (trim overpaints housings, never the
//      world — plus the radar-circle special case, whose plate is a blit).
//   C. DETERMINISM — the same state paints byte-identically twice, on a fresh
//      renderer and a reused one.
//   D. ZERO NEW TEXT — the frame's text set is exactly the fixture's known
//      labels (no copy, no emojis, plain ASCII throughout).
import { Renderer } from '../src/render.js';
import { CONFIG as C } from '../src/config.js';
import { makePlayer } from '../src/entities.js';
import { CHROME_INKS } from '../src/art/hud_chrome.js';
import assert from 'node:assert/strict';

let failed = 0;
function ok(cond, msg) {
  if (cond) { console.log('  PASS ' + msg); }
  else { failed++; console.error('  FAIL ' + msg); }
}

// ---------- recording 2d context (test_render_hud pattern + drawImage) -------
function makeCtx() {
  const rec = { rects: [], texts: [], depth: 0 };
  const ctx = {
    canvas: null,
    fillStyle: '#000000', globalAlpha: 1, font: '10px monospace',
    textAlign: 'left', textBaseline: 'top', imageSmoothingEnabled: true,
    lineWidth: 1, strokeStyle: '#000000',
    setTransform() {}, translate() {}, scale() {}, rotate() {},
    clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, arc() {},
    drawImage() {},   // the radar-plate blit: a cached raster of its own paint
    save() { rec.depth++; },
    restore() { rec.depth = Math.max(0, rec.depth - 1); },
    fillRect(x, y, w, h) {
      rec.rects.push({
        x, y, w, h, d: rec.depth, n: rec.rects.length,
        style: String(ctx.fillStyle), alpha: ctx.globalAlpha,
      });
    },
    fillText(txt, x, y) {
      rec.texts.push({
        txt: String(txt), x, y, d: rec.depth, n: rec.rects.length,
        font: String(ctx.font), style: String(ctx.fillStyle),
      });
    },
  };
  return { ctx, rec };
}
function makeRenderer() {
  const { ctx, rec } = makeCtx();
  const canvas = {
    width: 0, height: 0,
    getContext: () => ctx,
    getBoundingClientRect: () => ({ width: 0, height: 0 }),
    // The radar's plate cache borrows a scratch canvas off the main canvas's
    // ownerDocument (the headless path — render.js never touches the DOM
    // global). The scratch paint stays in its own throwaway recorder: only
    // the blit-adjacent trim (rim ticks) and the dots land in this frame.
    ownerDocument: { createElement: () => {
      const sub = makeCtx();
      return { width: 0, height: 0, getContext: () => sub.ctx };
    } },
  };
  ctx.canvas = canvas;
  return { R: new Renderer(canvas), rec, ctx };
}
function hudState(over) {
  const p = makePlayer();
  p.x = 240; p.y = 150;
  p.level = 4; p.xp = 50; p.xpNext = 100;
  const st = {
    player: p, time: 900, toasts: [], items: [], weapons: [],
    weather: null, mode: 'playing', zoom: 1, groundSeed: 7,
    enemies: [], projectiles: [], enemyShots: [], gems: [], drops: [],
    itemDrops: [], chests: [], arches: [], effects: [],
    wave: { num: 1, boss: null, bosses: [] },
    cam: { x: 0, y: 0 },
  };
  return Object.assign(st, over || {});
}
// A full-HUD frame: chrome + radar + fs button + a HELD set-piece banner.
function fullFrame(over) {
  const { R, rec, ctx } = makeRenderer();
  const st = hudState(Object.assign({
    toasts: [{ msg: 'FOUND Whetstone', ttl: 3, tint: '#4a8cff' }],
    weapons: [{ type: 'VOLLEY', level: 3, xp: 0 }],
    radarOn: true,
    fsOverlay: { supported: true, visible: true, active: false },
    bossBanner: { title: 'GRAVELMAW', names: ['GRAVELMAW'], sub: 'THE WAVE BREAKS HERE', ttl: 2.0 },
  }, over || {}));
  R.drawHudChrome(ctx, st);
  R.drawRadar(ctx, st);
  R.drawFsButton(ctx, st);
  R.drawBossBanner(ctx, st);
  return { R, rec, ctx, st };
}
const hasRect = (rec, x, y, w, h, style) =>
  rec.rects.some(q => q.x === x && q.y === y && q.w === w && q.h === h && q.style === style);
const RIVET = CHROME_INKS.RIVET, KEY = CHROME_INKS.KEYLINE;

console.log('SLICE I / A — METER HOUSINGS (HP / MP / XP / clock limit bar)');
{
  const { R, rec } = fullFrame();
  // HP trough box (22,16,110,5): steel-frame chamfers + trough studs.
  for (const [x, y] of [[20, 14], [133, 14], [20, 22], [133, 22]])
    ok(hasRect(rec, x, y, 1, 1, KEY), 'HP housing chamfer at ' + x + ',' + y);
  for (const [x, y] of [[22, 16], [131, 16], [22, 20], [131, 20]])
    ok(hasRect(rec, x, y, 1, 1, RIVET), 'HP housing stud at ' + x + ',' + y);
  // MP trough box (22,26,110,5).
  for (const [x, y] of [[20, 24], [133, 24], [20, 32], [133, 32]])
    ok(hasRect(rec, x, y, 1, 1, KEY), 'MP housing chamfer at ' + x + ',' + y);
  for (const [x, y] of [[22, 26], [131, 26], [22, 30], [131, 30]])
    ok(hasRect(rec, x, y, 1, 1, RIVET), 'MP housing stud at ' + x + ',' + y);
  // XP trough box (22,37,134,6).
  for (const [x, y] of [[20, 35], [157, 35], [20, 44], [157, 44]])
    ok(hasRect(rec, x, y, 1, 1, KEY), 'XP housing chamfer at ' + x + ',' + y);
  for (const [x, y] of [[22, 37], [155, 37], [22, 42], [155, 42]])
    ok(hasRect(rec, x, y, 1, 1, RIVET), 'XP housing stud at ' + x + ',' + y);
  // Clock limit bar: derive its box from the red limit tick, then the trim.
  const tick = rec.rects.find(q => q.style === '#ff2f5e' && q.w === 1 && q.h === 4);
  ok(!!tick, 'the red limit tick paints (clock bar anchor)');
  const cbW = 39, cbXp = tick.x - cbW + 1, cbYp = tick.y;   // tick sits at cbX+cbW-1
  for (const [x, y] of [[cbXp - 2, cbYp - 2], [cbXp + cbW + 1, cbYp - 2],
                        [cbXp - 2, cbYp + 5], [cbXp + cbW + 1, cbYp + 5]])
    ok(hasRect(rec, x, y, 1, 1, KEY), 'clock housing chamfer at ' + x + ',' + y);
  ok(!!R.hudChrome.clock && R.hudChrome.clock.text === '15:00',
    'the clock seam still reads the sim time (15:00 at 900s)');
}

console.log('SLICE I / A — BADGES + PLATES (LV / purse / label plates / feed / slots)');
{
  const { R, rec } = fullFrame();
  // LV badge: gold border x>150 y<60 (the render_hud pattern) -> inset studs.
  const lv = rec.rects.find(q => q.style === '#ffd75e' && q.x > 150 && q.y < 60 && q.h >= 13);
  ok(!!lv, 'the LV gold border paints (badge anchor)');
  for (const [x, y] of [[lv.x + 1, lv.y + 1], [lv.x + lv.w - 2, lv.y + 1],
                        [lv.x + 1, lv.y + lv.h - 2], [lv.x + lv.w - 2, lv.y + lv.h - 2]])
    ok(hasRect(rec, x, y, 1, 1, RIVET), 'LV badge stud at ' + x + ',' + y);
  // Purse badge (gold border at y~52) -> inset studs; value reads the same field.
  const purse = rec.rects.find(q => q.style === '#ffd75e' && q.y >= 50 && q.y <= 56 && q.h >= 13);
  ok(!!purse, 'the purse gold border paints (badge anchor)');
  for (const [x, y] of [[purse.x + 1, purse.y + 1], [purse.x + purse.w - 2, purse.y + 1],
                        [purse.x + 1, purse.y + purse.h - 2], [purse.x + purse.w - 2, purse.y + purse.h - 2]])
    ok(hasRect(rec, x, y, 1, 1, RIVET), 'purse badge stud at ' + x + ',' + y);
  ok(!!R.hudChrome.purse && /^GOLD /.test(R.hudChrome.purse.text) && R.hudChrome.purse.value === 0,
    'the purse seam still carries the run wallet (' + R.hudChrome.purse.text + ')');
  // Label plates: the HP plate (4,13,16,14) carries corner studs.
  for (const [x, y] of [[4, 13], [19, 13], [4, 26], [19, 26]])
    ok(hasRect(rec, x, y, 1, 1, RIVET), 'HP label plate stud at ' + x + ',' + y);
  // Feed plate: dark plate under the toast line; its studs sit 1px INSIDE
  // (the x===5 column is the frozen plate query — see the render.js note).
  const feedPlate = rec.rects.find(q => q.x === 5 && q.y === 84 &&
    (q.style === C.HUD.PLATE || q.style === C.HUD.PLATE_SOLID));
  ok(!!feedPlate, 'the feed plate paints at the frozen row (5,84)');
  if (feedPlate) {
    for (const [x, y] of [[6, 85], [6 + feedPlate.w - 3, 85],
                          [6, 85 + feedPlate.h - 3], [6 + feedPlate.w - 3, 85 + feedPlate.h - 3]])
      ok(hasRect(rec, x, y, 1, 1, RIVET), 'feed plate stud at ' + x + ',' + y);
  }
  // Weapon slot frame (5,269,12,12 for wy=270, Z=2) carries corner studs.
  for (const [x, y] of [[5, 269], [16, 269], [5, 280], [16, 280]])
    ok(hasRect(rec, x, y, 1, 1, RIVET), 'weapon slot stud at ' + x + ',' + y);
  const slot = rec.rects.find(q => q.x === 5 && q.y === 269 && q.w === 12 && q.h === 12);
  ok(!!slot && slot.style === '#2a2a36', 'the slot frame keeps its shipped style');
}

console.log('SLICE I / A — the AUTO badge (it only exists on a run auto-continue started)');
{
  const { R, rec } = fullFrame({ autoStarted: true });
  ok(!!R.hudChrome.auto && R.hudChrome.challenge === undefined, 'the auto badge is live in the seam; there is no mode badge');
  const nborder = rec.rects.find(q => q.style === '#8fb8ff' && q.h >= 12 && q.x > 300);
  ok(!!nborder, 'the night blue border paints in the right column');
  if (nborder) {
    for (const [x, y] of [[nborder.x + 1, nborder.y + 1], [nborder.x + nborder.w - 2, nborder.y + 1],
                          [nborder.x + 1, nborder.y + nborder.h - 2],
                          [nborder.x + nborder.w - 2, nborder.y + nborder.h - 2]])
      ok(hasRect(rec, x, y, 1, 1, RIVET), 'night badge stud at ' + x + ',' + y);
  }
  // A STANDARD day run paints neither badge: no gold/blue badge border in the
  // badge rows (below the clock plate — the clock's own trim lives above).
  const { rec: rec2 } = fullFrame();
  ok(!rec2.rects.some(q => q.style === '#ffd75e' && q.x > 300 && q.y >= 30 && q.h >= 12),
    'no gold badge border paints in the column');
  ok(!rec2.rects.some(q => q.style === '#8fb8ff' && q.x > 300 && q.y >= 30 && q.h >= 12),
    'a day run paints no night badge in the column');
}

console.log('SLICE I / A — RADAR rim ticks + FULLSCREEN keyline + HELD banner trim');
{
  const { R, rec } = fullFrame();
  // Radar centre (436,256), R=34: 8 ticks on radius 33.
  const inRadar = rec.rects.filter(q => q.style === RIVET && q.w === 1 && q.h === 1 &&
    Math.hypot(q.x - 436, q.y - 256) >= 32 && Math.hypot(q.x - 436, q.y - 256) <= 34);
  ok(inRadar.length === 8, '8 rim ticks on the steel band (got ' + inRadar.length + ')');
  ok(!!R.radar && R.radar.cx === 436 && R.radar.cy === 256 && R.radar.r === 34,
    'the radar seam keeps its frozen centre + radius');
  // Fullscreen box (450,141,22,18): inner keyline.
  for (const [x, y, w, h] of [[451, 142, 20, 1], [451, 157, 20, 1], [451, 142, 1, 16], [470, 142, 1, 16]])
    ok(hasRect(rec, x, y, w, h, KEY), 'fs inner keyline ' + x + ',' + y + ' ' + w + 'x' + h);
  ok(!!R.fsButton && R.fsButton.w === 22 && R.fsButton.h === 18,
    'the fs seam keeps its frozen 22x18 box');
  // Held banner: the centred dark plate carries an inner keyline + studs.
  const plate = rec.rects.find(q =>
    (q.style === C.HUD.PLATE_SOLID || q.style === 'rgba(10,9,6,0.90)') &&
    q.w >= 'GRAVELMAW'.length * 12 && q.h >= 40 &&
    Math.abs((q.x + q.w / 2) - C.VIEW_W / 2) <= 2);
  ok(!!plate, 'the HELD banner keeps its centred dark plate');
  if (plate) {
    ok(hasRect(rec, plate.x + 1, plate.y + 1, plate.w - 2, 1, KEY),
      'banner inner keyline (top rule)');
    ok(hasRect(rec, plate.x + 1, plate.y + plate.h - 2, plate.w - 2, 1, KEY),
      'banner inner keyline (bottom rule)');
    for (const [x, y] of [[plate.x + 1, plate.y + 1], [plate.x + plate.w - 2, plate.y + 1],
                          [plate.x + 1, plate.y + plate.h - 2], [plate.x + plate.w - 2, plate.y + plate.h - 2]])
      ok(hasRect(rec, x, y, 1, 1, RIVET), 'banner stud at ' + x + ',' + y);
  }
}

console.log('SLICE I / B — FROZEN LAYOUT (spot-checks from the existing contract)');
{
  const { R, rec, st } = fullFrame();
  const xb = 22, yb = 37, wb = 134, hb = 6;
  const trough = rec.rects.find(q => q.x === xb && q.y === yb && q.w === wb && q.h === hb);
  ok(!!trough && trough.style === C.HUD.TROUGH, 'XP trough: same box, same TROUGH ink');
  const frame = rec.rects.find(q => q.x === xb - 2 && q.y === yb - 2 && q.w === wb + 4 && q.h === hb + 4);
  ok(!!frame && frame.style === C.HUD.FRAME, 'XP frame: same box, same FRAME ink');
  const hpTrough = rec.rects.find(q => q.x === 22 && q.y === 16 && q.w === 110 && q.h === 5);
  ok(!!hpTrough && hpTrough.style === C.HUD.TROUGH, 'HP trough: same box, same ink');
  const majors = rec.rects.filter(q => q.style === C.HUD.TICK_MAJOR && q.h === hb);
  ok(majors.length === 3, 'quarter ticks still mark 25/50/75% (exactly 3)');
  ok(rec.rects.some(q => q.style === '#ffd75e' && q.x === xb + wb - 1),
    'gold goal tick still at the far end');
  ok(rec.rects.some(q => q.style === '#ff2f5e'), 'the red limit tick still paints');
  ok(!!rec.texts.find(t => t.txt === 'LV 4'), 'the level badge still reads LV 4');
  // Seam values: the readouts keep reading the same fields.
  const p = st.player;
  const wantHp = Math.max(0, Math.min(1, p.hp / p.stats.maxHp));
  ok(Math.abs(R.hudChrome.hpFrac - wantHp) < 1e-9 && R.hudChrome.level === 4 &&
    Math.abs(R.hudChrome.xpFrac - 0.5) < 1e-9,
    'seam: hpFrac tracks hp/maxHp, level 4, xpFrac exactly 0.5 (50/100)');
  ok(/^\d+\/\d+$/.test(R.hudChrome.hpText) && /^\d+\/\d+$/.test(R.hudChrome.mpText),
    'seam: hp/mp value texts keep their shipped shape (' +
    R.hudChrome.hpText + ' / ' + R.hudChrome.mpText + ')');
  ok(R.hudChrome.xpText === '50/100', 'seam: xp value text unchanged (50/100)');
}

console.log('SLICE I / B — MARKER CONTAINMENT (trim overpaints housings, never the world)');
{
  const { rec } = fullFrame();
  // Every RIVET/KEYLINE rect must sit inside a previously-painted housing rect
  // (frame / trough / seam / plate / inset / badge border / slot frame), or —
  // for the radar ticks — on the rim circle (the disc itself is a blit).
  const HOUSING = new Set([C.HUD.FRAME, C.HUD.TROUGH, C.HUD.PLATE, C.HUD.PLATE_SOLID,
    '#000000', '#ffd75e', '#2a2a36', 'rgba(10,9,6,0.90)']);
  const housings = rec.rects.filter(q => HOUSING.has(q.style));
  const strays = [];
  for (const m of rec.rects) {
    if (m.style !== RIVET && m.style !== KEY) continue;
    const onRim = Math.hypot(m.x - 436, m.y - 256) >= 32 &&
      Math.hypot(m.x - 436, m.y - 256) <= 34;
    if (onRim) continue;
    const inside = housings.some(q => q.n < m.n &&
      q.x <= m.x && q.y <= m.y && q.x + q.w >= m.x + m.w && q.y + q.h >= m.y + m.h);
    if (!inside) strays.push(m);
  }
  ok(strays.length === 0, 'all trim sits inside a housing footprint' +
    (strays.length ? ' (strays: ' + JSON.stringify(strays.slice(0, 3)) + ')' : ''));
  // And no trim escapes the view (the ladder's integer pins hold).
  const outside = rec.rects.filter(q => (q.style === RIVET || q.style === KEY) &&
    (q.x < 0 || q.y < 0 || q.x + q.w > C.VIEW_W || q.y + q.h > C.VIEW_H));
  ok(outside.length === 0, 'no trim pixel leaves the 480x300 view');
}

console.log('SLICE I / B — PERIPHERAL banner untouched (zero play-area pixels)');
{
  // The repeated mid-combat warning keeps its contract: strip + edge cue,
  // nothing inside the play area — and this slice dresses it with nothing.
  const peri = () => hudState({
    bossBanner: { title: 'GRAVELMAW', names: ['GRAVELMAW'], sub: 'THE WAVE BREAKS HERE',
      peripheral: true, ttl: 2.0, dur: 2.0, edges: ['right'] },
  });
  const { R: R2, rec: rec2, ctx: ctx2 } = makeRenderer();
  R2.drawBossBanner(ctx2, peri());
  const WN = C.HUD.WARNING;
  const E = WN.EDGE_PX + 1;
  const offenders = rec2.rects.filter(q =>
    q.x + q.w > E && q.x < C.VIEW_W - E &&
    q.y + q.h > WN.STRIP_Y + WN.STRIP_H && q.y < C.VIEW_H - E);
  ok(offenders.length === 0, 'no banner rect enters the play area');
  ok(!rec2.rects.some(q => q.style === RIVET || q.style === KEY),
    'the peripheral warning carries zero chrome trim');
  ok(R2.bossBanner && R2.bossBanner.peripheral === true, 'the seam still reads peripheral');
}

console.log('SLICE I / C — DETERMINISM (same state, same pixels, both renderers)');
{
  const snap = (R, rec, ctx, st) => {
    rec.rects.length = 0; rec.texts.length = 0;
    R.drawHudChrome(ctx, st);
    R.drawRadar(ctx, st);
    R.drawFsButton(ctx, st);
    R.drawBossBanner(ctx, st);
    return rec.rects.map(q => [q.x, q.y, q.w, q.h, q.style].join(',')).join('|') +
      '#' + rec.texts.map(t => [t.txt, t.x, t.y, t.font].join(',')).join('|');
  };
  const a = makeRenderer(), b = makeRenderer();
  const sa = hudState({ radarOn: true,
    fsOverlay: { supported: true, visible: true, active: true },
    bossBanner: { title: 'GRAVELMAW', names: ['GRAVELMAW'], sub: 'THE WAVE BREAKS HERE', ttl: 2.0 } });
  const sb = hudState({ radarOn: true,
    fsOverlay: { supported: true, visible: true, active: true },
    bossBanner: { title: 'GRAVELMAW', names: ['GRAVELMAW'], sub: 'THE WAVE BREAKS HERE', ttl: 2.0 } });
  const s1 = snap(a.R, a.rec, a.ctx, sa);
  const s2 = snap(b.R, b.rec, b.ctx, sb);
  ok(s1 === s2, 'two fresh renderers paint byte-identically');
  const s3 = snap(a.R, a.rec, a.ctx, sa);
  ok(s1 === s3, 'a repaint on the same renderer is stable (no counters, no clock)');
}

console.log('SLICE I / D — ZERO NEW TEXT (no copy, no emojis, plain ASCII)');
{
  const { R, rec } = fullFrame();
  const texts = rec.texts.map(t => t.txt);
  const expected = ['HP', 'MP', R.hudChrome.hpText, R.hudChrome.mpText, 'XP', 'LV 4',
    R.hudChrome.xpText, R.hudChrome.purse.text, '15:00', 'FOUND Whetstone', '3',
    'GRAVELMAW', 'THE WAVE BREAKS HERE'];
  const missing = expected.filter(e => e && !texts.includes(e));
  const extra = texts.filter(t => !expected.includes(t));
  ok(missing.length === 0, 'every frozen label still paints' +
    (missing.length ? ' (missing: ' + missing.join(', ') + ')' : ''));
  ok(extra.length === 0, 'zero new text nodes' +
    (extra.length ? ' (extra: ' + extra.join(', ') + ')' : ''));
  const nonAscii = texts.filter(t => /[^\x20-\x7E]/.test(t));
  ok(nonAscii.length === 0, 'all HUD text is plain ASCII (no emojis anywhere)');
}

if (failed) { console.error('\n' + failed + ' FAILURES'); process.exit(1); }
console.log('\nALL PORT SLICE I TESTS PASSED');
