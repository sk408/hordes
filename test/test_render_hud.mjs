// HORDES — headless tests for src/render.js HUD legibility, ground decor and
// the removal of the doctrine (FOCUS / STANCE) readout. WAVE-24, agent A.
// Run: node test/test_render_hud.mjs
//
// Deliberately imports ONLY render.js / config.js / entities.js (never
// main.js): the canvas HUD must be provable while the game shell is being
// edited by other agents. The 2d context stub RECORDS style + geometry, so
// these tests can assert on CONTRAST (a dark plate behind every label), not
// just on where a rect landed.
import { Renderer, groundTheme } from '../src/render.js';
import { CONFIG as C } from '../src/config.js';
import { makePlayer } from '../src/entities.js';

let failed = 0;
function ok(cond, msg) {
  if (cond) { console.log('  PASS ' + msg); }
  else { failed++; console.error('  FAIL ' + msg); }
}

// ---------- recording 2d context ---------------------------------------------
function makeCtx() {
  const rec = { rects: [], texts: [], depth: 0 };
  const ctx = {
    canvas: null,
    fillStyle: '#000000', globalAlpha: 1, font: '10px monospace',
    textAlign: 'left', textBaseline: 'top', imageSmoothingEnabled: true,
    lineWidth: 1, strokeStyle: '#000000',
    setTransform() {}, translate() {}, scale() {}, rotate() {},
    clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
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
        align: ctx.textAlign,
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
    getBoundingClientRect: () => ({ width: 0, height: 0 }),  // headless path
  };
  ctx.canvas = canvas;
  return { R: new Renderer(canvas), rec, ctx };
}

// A dark "readability plate": low max channel, and opaque-ish when rgba.
function isDarkPlate(style) {
  const m = /rgba?\(([^)]+)\)/.exec(style);
  let r, g, b, a = 1;
  if (m) {
    const p = m[1].split(',').map(v => parseFloat(v));
    [r, g, b] = p; if (p.length > 3) a = p[3];
  } else if (/^#[0-9a-f]{6}$/i.test(style)) {
    r = parseInt(style.slice(1, 3), 16);
    g = parseInt(style.slice(3, 5), 16);
    b = parseInt(style.slice(5, 7), 16);
  } else { return false; }
  return Math.max(r, g, b) < 70 && a > 0.55;
}
// The plate that a text was painted on: a dark rect drawn BEFORE it that
// covers its origin box.
function plateFor(rec, text) {
  return rec.rects.find(q => q.n <= text.n && isDarkPlate(q.style) &&
    q.x <= text.x && q.x + q.w >= text.x + 6 &&
    q.y <= text.y + 8 && q.y + q.h >= text.y + 3);
}
const textOf = (rec, s) => rec.texts.find(t => t.txt === s);

// ---------- state fixture ----------------------------------------------------
function hudState(over) {
  const p = makePlayer();
  p.x = 240; p.y = 150;
  const st = {
    player: p, time: 0, toasts: [], items: [], weapons: [],
    weather: null, mode: 'playing', zoom: 1, groundSeed: 7,
    enemies: [], projectiles: [], enemyShots: [], gems: [], drops: [],
    itemDrops: [], chests: [], arches: [], effects: [],
    wave: { num: 1, boss: null, bosses: [] },
    cam: { x: 0, y: 0 },
  };
  return Object.assign(st, over || {});
}

console.log('WAVE-24 / #1 — XP BAR EMPTY STATE (0%)');
{
  const { R, rec, ctx } = makeRenderer();
  const st = hudState();
  st.player.xp = 0; st.player.xpNext = 100; st.player.level = 1;
  R.drawHudChrome(ctx, st);
  const xb = 22, yb = 37, wb = 134, hb = 6;

  ok(R.hudChrome.xpFrac === 0, 'seam: xpFrac is exactly 0 at run start');
  const trough = rec.rects.find(q => q.x === xb && q.y === yb && q.w === wb && q.h === hb);
  ok(!!trough && trough.style === C.HUD.TROUGH,
    'a 0% bar still paints a full-width dark TROUGH (' + (trough && trough.style) + ')');
  const frame = rec.rects.find(q => q.x === xb - 2 && q.y === yb - 2 && q.w === wb + 4 && q.h === hb + 4);
  ok(!!frame && frame.style === C.HUD.FRAME,
    'a 0% bar still paints its steel container FRAME (' + (frame && frame.style) + ')');
  const ticks = rec.rects.filter(q => q.style === C.HUD.TICK && q.w === 1 && q.y >= yb && q.y <= yb + hb);
  ok(ticks.length >= 10, 'tick marks run the FULL track at 0% (' + ticks.length + ' ticks)');
  ok(ticks.length > 0 && Math.max.apply(null, ticks.map(q => q.x)) >= xb + wb - 12,
    'the last tick sits near the far end, so the empty track reads as a scaled bar');
  const majors = rec.rects.filter(q => q.style === C.HUD.TICK_MAJOR && q.h === hb);
  ok(majors.length === 3, 'quarter ticks mark 25/50/75%');
  ok(rec.rects.some(q => q.style === '#ffd75e' && q.x === xb + wb - 1),
    'gold goal tick at the far end of an empty bar');
  ok(!!textOf(rec, 'XP'), 'the "XP" label is painted (empty bar is labelled)');
  ok(!!textOf(rec, 'LV 1'), 'the level badge reads LV 1');
  // And the fill still tracks the value (fill behaviour must not change).
  const st2 = hudState(); st2.player.xp = 50; st2.player.xpNext = 100;
  R.drawHudChrome(ctx, st2);
  const gold = rec.rects.filter(q => q.style === '#ffd75e' && q.y === yb && q.h === hb && q.w > 1);
  ok(gold.some(q => q.w === Math.round(wb * 0.5)),
    'the gold fill still tracks p.xp/p.xpNext (' + JSON.stringify(gold.map(q => q.w)) + ')');
}

console.log('WAVE-24 / #2 — CANVAS TEXT CONTRAST + SIZE');
{
  const { R, rec, ctx } = makeRenderer();
  const st = hudState({
    toasts: [{ msg: 'FOUND Whetstone', ttl: 3, tint: '#4a8cff' }],
    weapons: [{ type: 'VOLLEY', level: 3, xp: 0 }],
  });
  st.player.level = 4;
  R.drawHudChrome(ctx, st);

  ok(rec.texts.length >= 6, 'HUD paints its labels as text (' + rec.texts.length + ' runs)');
  const unplated = rec.texts.filter(t => !plateFor(rec, t));
  ok(unplated.length === 0,
    'every HUD label sits on a dark readability plate' +
    (unplated.length ? ' (missing: ' + unplated.map(t => t.txt).join(', ') + ')' : ''));

  const lv = textOf(rec, 'LV 4');
  ok(!!lv, 'the level badge is painted');
  const lvPx = lv ? parseInt(/bold (\d+)px/.exec(lv.font)[1], 10) : 0;
  ok(lvPx >= 10, 'the LV badge is >= 10px bold (was 9 — read as a placeholder), got ' + lvPx);
  const badgeBorder = rec.rects.find(q => q.style === '#ffd75e' && q.x > 150 && q.y < 60 && q.h >= 13);
  ok(!!badgeBorder, 'the LV badge has a gold border plate (contrast on every theme)');

  for (const lbl of ['HP', 'MP', 'XP']) {
    const t = textOf(rec, lbl);
    const px = t ? parseInt(/bold (\d+)px/.exec(t.font)[1], 10) : 0;
    ok(t && px >= C.HUD.LABEL_PX && px >= 9, lbl + ' bar label is >= 9px bold (got ' + px + ')');
  }
  const feed = textOf(rec, 'FOUND Whetstone');
  ok(feed && plateFor(rec, feed), 'event-feed lines still ride a plate at 9px+');
  const wlv = rec.texts.find(t => t.txt === '3');
  ok(!!wlv && plateFor(rec, wlv),
    'the weapon level number is painted on its own plate');

  // Boss banner: the title/sub print at SCREEN CENTER (over gameplay), so the
  // plate must exist or contrast depends on the scene behind it.
  const { R: R2, rec: rec2, ctx: ctx2 } = makeRenderer();
  R2.drawBossBanner(ctx2, hudState({
    bossBanner: { title: 'GRAVELMAW', sub: 'THE WAVE BREAKS HERE', ttl: 2.0 },
  }));
  const title = textOf(rec2, 'GRAVELMAW');
  ok(!!title, 'boss banner title painted');
  const bPlate = rec2.rects.find(q => isDarkPlate(q.style) &&
    q.w >= 'GRAVELMAW'.length * 12 && q.h >= 40 &&
    Math.abs((q.x + q.w / 2) - C.VIEW_W / 2) <= 2);
  ok(!!bPlate, 'the banner title/sub ride a centered dark plate');
  const subPx = title ? parseInt(/\d+px/.exec((textOf(rec2, 'THE WAVE BREAKS HERE') || {}).font || '0px')[0], 10) : 0;
  ok(subPx >= 10, 'banner sub-line is >= 10px (got ' + subPx + ')');
}

console.log('WAVE-24 / #3 — GROUND DECOR: LANDMARKS + RIM CLIP');
{
  const { R, ctx, rec } = makeRenderer();
  const kinds = {};
  let landmarks = 0, minRects = 99, minX = 1e9, maxX = -1e9;
  for (let wave = 1; wave <= 6; wave++) {
    const theme = groundTheme(wave);
    for (let cx = -600; cx <= 600; cx += 96) {
      for (let cy = -600; cy <= 600; cy += 96) {
        rec.rects.length = 0;
        const cam = { x: cx, y: cy };
        R.drawGround(ctx, 4242, cam, theme);
        R.drawLandmarks(ctx, 4242, cam, theme);
        for (const q of rec.rects) {
          minX = Math.min(minX, q.x + cam.x); maxX = Math.max(maxX, q.x + cam.x);
        }
        for (const lm of R.landmarks) {
          landmarks++;
          kinds[lm.kind] = (kinds[lm.kind] || 0) + 1;
          minRects = Math.min(minRects, lm.rects);
        }
      }
    }
  }
  ok(landmarks >= 20, 'the landmark layer paints structures across the arena (' + landmarks + ')');
  ok(minRects >= 4, 'every landmark is COMPOSED (>= 4 rects, not a glyph); min ' + minRects);
  ok(Object.keys(kinds).length >= 4,
    'several distinct structures (sense of place), kinds: ' + Object.keys(kinds).join(','));
  ok(minX >= -C.GROUND.RIM && maxX <= C.GROUND.RIM,
    'no ground piece or landmark paints past the arena rim (+-' + C.GROUND.RIM +
    '), range ' + minX + '..' + maxX);
  ok(!('BOUND' in C.GROUND), 'the old 660 BOUND is gone (it let decor spill into the gloom)');

  // Determinism: the same seed + camera paints the same field.
  const snap = (seed) => {
    rec.rects.length = 0;
    R.drawGround(ctx, seed, { x: 128, y: 96 }, groundTheme(1));
    R.drawLandmarks(ctx, seed, { x: 128, y: 96 }, groundTheme(1));
    return rec.rects.map(q => q.x + ',' + q.y + ',' + q.w + ',' + q.h).join('|');
  };
  ok(snap(11) === snap(11), 'the ground field is deterministic per seed');
  ok(snap(11) !== snap(12), 'different seeds paint different fields');

  // Quiet by contract: landmarks must establish place without carpeting the
  // floor (they sit under the play pieces).
  const per = [];
  for (let cx = -600; cx <= 600; cx += 96) {
    for (let cy = -600; cy <= 600; cy += 96) {
      R.drawLandmarks(ctx, 4242, { x: cx, y: cy }, groundTheme(1));
      per.push(R.landmarks.length);
    }
  }
  const avg = per.reduce((a, b) => a + b, 0) / per.length;
  ok(avg >= 0.5 && avg <= 6,
    'landmarks read as landmarks, not a carpet: ~' + avg.toFixed(2) + ' per 480x300 screen');
}

console.log('WAVE-27 — NO CANVAS DOCTRINE TEXT (the overlay badges carry it)');
{
  // Owner ruling (WAVE-27): the big canvas "FOCUS <x>" / "STANCE <x> · <TAG> ·
  // <ACT>" lines are redundant with the overlay buttons' badges, so the
  // renderer must paint NO doctrine text even when the published state carries
  // it — and the chrome seam must not carry doctrine fields either. This
  // replaces the WAVE-24/#4 block (which pinned the old readout) with the new
  // contract; the rest of the HUD is unchanged.
  const { R, rec, ctx } = makeRenderer();
  const st = hudState({ focus: 'SWARM', stance: 'GREEDY', stanceAct: 'FLEE' });
  R.drawHudChrome(ctx, st);
  const doctrine = rec.texts.filter(t => /^FOCUS |^STANCE /.test(t.txt));
  ok(doctrine.length === 0, 'no FOCUS/STANCE text on the canvas (' + doctrine.length + ' painted)');
  ok(R.hudChrome && !('focus' in R.hudChrome) && !('stance' in R.hudChrome) &&
     !('stanceAct' in R.hudChrome),
    'the chrome seam carries no doctrine fields any more');
  // Everything ELSE the HUD paints is untouched (removal, not a rewrite).
  ok(!!textOf(rec, 'XP') && !!textOf(rec, 'LV 1'), 'the rest of the HUD chrome still paints');

  // The renderer must be DOM-free now (the old badge bridge is gone for good):
  // a document that THROWS on any access must never be touched, through the
  // real full-frame render path.
  const savedDoc = globalThis.document;
  globalThis.document = { getElementById: () => { throw new Error('renderer must be DOM-free'); } };
  const { R: R3, rec: rec3, ctx: ctx3 } = makeRenderer();
  try {
    R3.render(hudState({ focus: 'RANGED', stance: 'SAFE', stanceAct: 'PATROL' }), { x: 0, y: 0 });
  } finally {
    globalThis.document = savedDoc;
  }
  ok(!rec3.texts.some(t => /^FOCUS |^STANCE /.test(t.txt)),
    'a full render() frame with doctrine in state paints no doctrine text');
  ok(rec3.rects.some(q => q.d === 1), 'render(): the ground/decor layer is still inside the zoom transform');

  // The doctrine block used to sit above the ground/landmark pass; removing it
  // must not disturb the world layer. Same sweep the old block ran.
  const { R: R5 } = makeRenderer();
  let lmFrames = 0;
  for (let sx = -560; sx <= 560; sx += 40) {
    for (let sy = -560; sy <= 560; sy += 40) {
      const s5 = hudState({ focus: 'NEAREST', stance: 'BALANCED',
        cam: { x: sx, y: sy }, player: Object.assign(makePlayer(), { x: sx + 240, y: sy + 150 }) });
      s5.groundSeed = 4242;
      R5.render(s5, { x: sx, y: sy });
      if (Array.isArray(R5.landmarks) && R5.landmarks.length > 0) lmFrames++;
    }
  }
  ok(lmFrames > 0, 'render(): landmarks are painted through the real frame path (' + lmFrames + ' frames)');
}

// ============================================================================
// SURVIVAL-GAP wave — THE RUN CLOCK ON THE CANVAS HUD
// ============================================================================
// The 30:00 limit is the run's core structure; the always-on canvas HUD must
// always show where the run stands. Same contract as every other HUD label:
// painted text, on a dark plate, and reported through the chrome seam.
console.log('SURVIVAL-GAP — RUN CLOCK ON THE CANVAS HUD');
{
  const { R, rec, ctx } = makeRenderer();
  R.drawHudChrome(ctx, hudState({ time: 0 }));
  const t0 = textOf(rec, '00:00');
  ok(!!t0, 'the run clock is painted at 00:00 at run start');
  ok(t0 && plateFor(rec, t0), 'the clock rides a dark plate like every other HUD label');
  ok(!!R.hudChrome.clock && R.hudChrome.clock.text === '00:00' && R.hudChrome.clock.frac === 0,
    'the chrome seam reports the clock + the limit fraction');

  const { R: R2, rec: rec2, ctx: ctx2 } = makeRenderer();
  R2.drawHudChrome(ctx2, hudState({ time: 900 }));
  ok(!!textOf(rec2, '15:00'), 'the clock reads the sim time (15:00 at 900s)');

  const { R: R3, rec: rec3, ctx: ctx3 } = makeRenderer();
  R3.drawHudChrome(ctx3, hudState({ time: C.RUN.LIMIT - 1 }));
  ok(!!textOf(rec3, '29:59'), 'one second before the limit the clock reads 29:59');
  ok(R3.hudChrome.clock.frac > 0.99, 'the limit bar is ~full at 29:59');
  ok(rec3.rects.some(q => q.style === '#ff2f5e'), 'the limit tick is painted at the far end');
  ok(R3.hudChrome.clock.finalCall === true,
    'past FINAL_CALL_AT the clock is flagged for the last-minute colour');

  // Frame-rate independence: the clock is a pure function of state.time (sim
  // seconds), so the SAME sim time paints the SAME text whatever the cadence.
  const { R: R4, rec: rec4, ctx: ctx4 } = makeRenderer();
  R4.drawHudChrome(ctx4, hudState({ time: 123.456 }));
  ok(!!textOf(rec4, '02:03'), 'a fractional sim time floors into the clock (123.456 -> 02:03)');
  const { R: R5, rec: rec5, ctx: ctx5 } = makeRenderer();
  R5.drawHudChrome(ctx5, hudState({ time: 123.456 }));
  ok(JSON.stringify(rec5.texts) === JSON.stringify(rec4.texts),
    'the same sim time paints a byte-identical readout (no frame counters)');
}

if (failed) { console.error('\n' + failed + ' FAILURES'); process.exit(1); }
console.log('\nALL RENDER HUD TESTS PASSED');
