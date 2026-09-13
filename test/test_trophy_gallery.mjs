// HORDES — G9 TROPHY GALLERY + THE RUN-END EARN HOOK.
// Run: node test/test_trophy_gallery.mjs
//
// Two halves, both driven through REAL seams:
//
//   1. THE SCREEN (mode 'trophies'). It is reached from the title cards, shows
//      ONE trophy at a time, wraps the ring across every authored entry, masks
//      an unearned trophy (LOCKED art + no name, but the goal still visible so
//      there is something to chase), and un-masks an earned one. Its overlay
//      must clear the sheet so the canvas art shows through — and every OTHER
//      screen must get the sheet back, which is why the reset lives in
//      openMenu() and is asserted here from a screen that ran after the
//      gallery.
//   2. THE SHOWCASE (renderer.drawTrophyShowcase). Geometry is measured off a
//      recording 2d context (test_render_hud precedent) rather than pixel-diffed
//      — integer scale, a scale x scale block per painted art pixel, the whole
//      emblem inside the view and centered, and a full-view dark backdrop
//      painted FIRST so nothing shows through.
//   3. THE EARN. settleRunGold is the single funnel every run end passes
//      through, so a run finished through the real seam must EARN the trophies
//      its summary justifies, GRANT what they unlock, and speak in at most two
//      toast lines. A second identical run must earn nothing twice.
//
// Gold-free granting has its own file (test/test_achievements.mjs) — this file
// asserts that a run end MOVES the purse forward (the payout) and grants, not
// the price arithmetic.
import assert from 'node:assert/strict';
import { Renderer } from '../src/render.js';
import { CONFIG as C } from '../src/config.js';
import { boot, suite } from './_harness.mjs';
import {
  ACHIEVEMENT_DISPLAY_IDS, ACHIEVEMENT_BY_ID, gallerySummary, isEarned, ownsUnlock,
} from '../src/achievements.js';
import { TROPHY_ART, TROPHY_FALLBACK_ID } from '../src/art/index.js';

const S = suite('test_trophy_gallery');

// ---------- recording 2d context (the test_render_hud pattern) --------------
// Records style + geometry, so "a dark backdrop covers the view" and "every
// painted pixel is a scale x scale block" are measurable, not eyeballed.
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
      rec.rects.push({ x, y, w, h, d: rec.depth, n: rec.rects.length, style: String(ctx.fillStyle) });
    },
    fillText(txt, x, y) { rec.texts.push({ txt: String(txt), x, y }); },
  };
  return { ctx, rec };
}
function makeRenderer() {
  const { ctx, rec } = makeCtx();
  const canvas = {
    width: 0, height: 0,
    getContext: () => ctx,
    getBoundingClientRect: () => ({ width: 0, height: 0 }),   // headless path
  };
  ctx.canvas = canvas;
  return { R: new Renderer(canvas), rec, ctx };
}
// A dark "readability plate": low max channel, opaque-ish when rgba.
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
const paintedCells = (grid) => grid.reduce((n, row) => n + row.filter(v => v).length, 0);
const BUDGET_W = Math.floor(C.VIEW_W * 0.72);
const BUDGET_H = Math.floor(C.VIEW_H * 0.62);

// ============================================================================
// 1. THE SHOWCASE GEOMETRY (standalone Renderer; no game shell needed)
// ============================================================================
S.check('no trophyView -> a null seam and an untouched canvas', () => {
  const { R, rec, ctx } = makeRenderer();
  R.trophyShowcase = { scale: 9 };                    // poison: prove it is overwritten
  R.drawTrophyShowcase(ctx, {});
  assert.equal(R.trophyShowcase, null, 'no payload -> the seam is null');
  assert.equal(rec.rects.length, 0, 'and nothing is painted at all');
  R.drawTrophyShowcase(ctx, null);                    // and a missing state must not throw
  assert.equal(R.trophyShowcase, null, 'a null state is safe too');
});

S.check('a full-view dark backdrop is painted FIRST (nothing shows through)', () => {
  const { R, rec, ctx } = makeRenderer();
  R.drawTrophyShowcase(ctx, { trophyView: { art: TROPHY_ART.FIRST_BLOOD, locked: false, id: 'FIRST_BLOOD' } });
  const first = rec.rects[0];
  assert.ok(first && first.w === C.VIEW_W && first.h === C.VIEW_H,
    'the first rect covers the whole view (' + (first && first.w + 'x' + first.h) + ')');
  assert.ok(isDarkPlate(first.style), 'and it is a dark backdrop (' + first.style + ')');
});

S.check('the emblem is drawn at the LARGEST INTEGER scale that fits the budget box', () => {
  const { R, ctx } = makeRenderer();
  const art = TROPHY_ART.FIRST_BLOOD;
  R.drawTrophyShowcase(ctx, { trophyView: { art, locked: false, id: 'FIRST_BLOOD' } });
  const sc = R.trophyShowcase;
  assert.ok(sc, 'the seam is recorded');
  assert.ok(Number.isInteger(sc.scale) && sc.scale >= 1, 'integer scale >= 1 (got ' + sc.scale + ')');
  assert.equal(sc.w, art.w * sc.scale, 'box width is a whole number of art pixels');
  assert.equal(sc.h, art.h * sc.scale, 'box height is a whole number of art pixels');
  assert.ok(sc.w <= BUDGET_W && sc.h <= BUDGET_H,
    'inside the showcase budget (' + sc.w + 'x' + sc.h + ' <= ' + BUDGET_W + 'x' + BUDGET_H + ')');
  const next = sc.scale + 1;
  assert.ok(next * art.w > BUDGET_W || next * art.h > BUDGET_H,
    'and it is the LARGEST such scale (' + next + 'x would not fit)');
  assert.ok(sc.x >= 0 && sc.x + sc.w <= C.VIEW_W && sc.y >= 0 && sc.y + sc.h <= C.VIEW_H,
    'the whole emblem sits inside the view');
  assert.ok(Math.abs(sc.x - Math.round((C.VIEW_W - sc.w) / 2)) <= 1 &&
    Math.abs(sc.y - Math.round((C.VIEW_H - sc.h) / 2)) <= 1, 'and it is centered');
});

S.check('every painted art pixel is a scale x scale block inside the box (no smoothing)', () => {
  const { R, rec, ctx } = makeRenderer();
  const art = TROPHY_ART.KILLS_1000;
  R.drawTrophyShowcase(ctx, { trophyView: { art, locked: false, id: 'KILLS_1000' } });
  const sc = R.trophyShowcase;
  const blocks = rec.rects.filter(q => q.w === sc.scale && q.h === sc.scale);
  assert.equal(blocks.length, paintedCells(art.grid),
    'one NxN block per non-transparent art pixel (' + blocks.length + ' blocks)');
  assert.ok(blocks.length > 100, 'the emblem is a rich sprite (' + blocks.length + ' pixels)');
  const outside = blocks.filter(q => q.x < sc.x || q.x + q.w > sc.x + sc.w || q.y < sc.y || q.y + q.h > sc.y + sc.h);
  assert.equal(outside.length, 0, 'no art pixel paints outside the recorded box');
  const offGrid = blocks.filter(q => (q.x - sc.x) % sc.scale !== 0 || (q.y - sc.y) % sc.scale !== 0);
  assert.equal(offGrid.length, 0, 'and every block lands on the integer art grid');
});

S.check('an UNEARNED trophy gets the same display case in its LOCKED form', () => {
  const { R, rec, ctx } = makeRenderer();
  const locked = TROPHY_ART[TROPHY_FALLBACK_ID];
  R.drawTrophyShowcase(ctx, { trophyView: { art: locked, locked: true, id: 'WAVE_20' } });
  const sc = R.trophyShowcase;
  assert.equal(sc.locked, true, 'the seam reports the locked state');
  assert.equal(sc.id, 'WAVE_20', 'and the id it was handed');
  const blocks = rec.rects.filter(q => q.w === sc.scale && q.h === sc.scale);
  assert.equal(blocks.length, paintedCells(locked.grid), 'the silhouette is painted in full');
  assert.ok(rec.rects[0].w === C.VIEW_W, 'still over a full-view backdrop');
  assert.ok(sc.scale >= 1 && sc.x >= 0 && sc.x + sc.w <= C.VIEW_W && sc.y >= 0 && sc.y + sc.h <= C.VIEW_H,
    'and still inside the view');
});

// ============================================================================
// 2. THE GALLERY SCREEN (real src/main.js through the shared harness)
// ============================================================================
const h = await boot({ storage: [['hordes_onboarded', '1']] });
const st = h.state;
const T = h.T;
const ov = h.elements['overlay'];
const cards = () => (h.elements['ov-cards'] ? h.elements['ov-cards'].children : []);
const cardWith = (t) => cards().find(c => (c.innerHTML || '').includes(t));
const key = (k) => h.key('keydown', { key: k, preventDefault() {} });

S.check('the title menu offers a TROPHIES card carrying the earned count', () => {
  if (st.mode === 'intro') key('x');                 // any key skips the intro movie
  assert.equal(st.mode, 'title', 'the title is up');
  const card = cardWith('TROPHIES');
  assert.ok(card, 'a TROPHIES card exists');
  const summary = gallerySummary(T.getProfile());
  assert.ok(card.innerHTML.includes(summary.earned + ' / ' + summary.total),
    'the card carries the earned count (' + summary.earned + ' / ' + summary.total + ')');
});

S.check('opening the gallery sets mode trophies with a live (masked) showcase', () => {
  cardWith('TROPHIES').click();
  assert.equal(st.mode, 'trophies', 'mode is trophies');
  assert.ok(st.trophyView && st.trophyView.art && st.trophyView.id, 'state.trophyView is populated');
  assert.equal(cards().length, 3, 'PREV / NEXT / BACK');
  assert.equal(st.trophyView.art, TROPHY_ART[TROPHY_FALLBACK_ID],
    'a fresh profile starts on the LOCKED silhouette (nothing earned yet)');
  assert.equal(st.trophyView.locked, true, 'and the payload says so');
  assert.equal(h.elements['ov-title'].textContent, 'LOCKED', 'the name is masked');
});

S.check('the gallery clears the overlay sheet so the canvas art is visible', () => {
  assert.equal(ov.style.background, 'transparent', 'no 75% black sheet over the art');
  assert.equal(ov.style.justifyContent, 'flex-end', 'the chrome is pushed to the bottom');
  assert.equal(ov.style.display, 'flex', 'and the overlay is up');
});

S.check('the pad-layer gate is OFF in trophies (chromeOn false, layer hidden)', () => {
  assert.equal(T.chromeOn(), false, 'chromeOn() is false in trophies');
  h.pump(1);                                          // syncChrome runs on every mode's first frame
  assert.equal(h.elements['touch'].style.display, 'none',
    'syncChrome hid the touch/pad layer (the wave-23 intro-movie regression cannot recur)');
});

S.check('frame() paints the selected trophy while the gallery is open, and stops after', () => {
  h.pump(1);
  assert.ok(T.renderer.trophyShowcase && T.renderer.trophyShowcase.id === st.trophyView.id,
    'the real frame path painted the selected trophy (' + (T.renderer.trophyShowcase || {}).id + ')');
  assert.ok(T.renderer.trophyShowcase.scale >= 1, 'with a real integer scale');
  T.closeTrophies();
  st.mode = 'menu';
  h.pump(1);
  assert.equal(T.renderer.trophyShowcase, null, 'a later frame paints no showcase');
  // Re-open for the navigation checks below (state.trophyIdx survives, so this
  // is also the "the ring remembers where you were" path).
  st.mode = 'menu';
  T.openTrophies();
});

S.check('PREV / NEXT step the ring and WRAP at both ends', () => {
  const n = ACHIEVEMENT_DISPLAY_IDS.length;
  assert.equal(n, gallerySummary(T.getProfile()).total, 'the ring is exactly the authored set');
  st.trophyIdx = 0; T.trophiesStep(0);
  T.trophiesStep(1);
  assert.equal(st.trophyIdx, 1, 'NEXT advances');
  T.trophiesStep(-1);
  assert.equal(st.trophyIdx, 0, 'PREV returns');
  T.trophiesStep(-1);
  assert.equal(st.trophyIdx, n - 1, 'PREV from the first entry wraps to the LAST');
  T.trophiesStep(1);
  assert.equal(st.trophyIdx, 0, 'NEXT from the last entry wraps to the FIRST');
  T.trophiesStep(n * 3 + 5);
  assert.equal(st.trophyIdx, 5, 'arbitrary step counts are normalised into the ring');
});

S.check('every entry paints the art its earned state deserves, in art order', () => {
  const model = gallerySummary(T.getProfile()).model;
  assert.equal(model.length, ACHIEVEMENT_DISPLAY_IDS.length, 'one gallery entry per display id');
  const seen = new Set();
  for (let i = 0; i < model.length; i++) {
    st.trophyIdx = i;
    T.trophiesStep(0);
    const v = st.trophyView;
    assert.equal(v.id, ACHIEVEMENT_DISPLAY_IDS[i], 'entry ' + i + ' is ' + ACHIEVEMENT_DISPLAY_IDS[i]);
    assert.equal(v.locked, !model[i].earned, 'the locked flag tracks the model');
    assert.equal(v.art, model[i].earned ? TROPHY_ART[v.id] : TROPHY_ART[TROPHY_FALLBACK_ID],
      'the art is the real emblem when earned and the silhouette when not');
    assert.equal(h.elements['ov-title'].textContent,
      model[i].earned ? TROPHY_ART[v.id].name : 'LOCKED', 'the caption agrees with the art');
    seen.add(v.id);
  }
  assert.equal(seen.size, model.length, 'every entry was visited exactly once');
});

S.check('an UNEARNED entry shows the LOCKED art, hides the name, keeps the goal', () => {
  const lockedId = ACHIEVEMENT_DISPLAY_IDS.find(id => !isEarned(T.getProfile(), id));
  assert.ok(lockedId, 'a fresh profile has unearned trophies to show');
  st.trophyIdx = ACHIEVEMENT_DISPLAY_IDS.indexOf(lockedId);
  T.trophiesStep(0);
  assert.equal(st.trophyView.art, TROPHY_ART[TROPHY_FALLBACK_ID], 'the silhouette, not the emblem');
  assert.equal(st.trophyView.locked, true, 'locked: true');
  assert.equal(h.elements['ov-title'].textContent, 'LOCKED', 'no name leak');
  const body = h.elements['ov-sub'].innerHTML;
  const art = TROPHY_ART[lockedId];
  assert.ok(!body.includes(art.name), 'the real name is not printed anywhere');
  assert.ok(!body.includes(art.desc), 'and neither is the real description');
  const goal = ACHIEVEMENT_BY_ID[lockedId].goal;
  if (goal.kind !== 'state') {
    assert.ok(/\d+ \/ \d+/.test(body), 'the numeric goal progress is shown (the chase): ' + body.split('<br>')[2]);
  }
});

S.check('closing restores the previous mode and every overlay override resets', () => {
  cardWith('BACK').click();                           // the real BACK path
  assert.equal(st.mode, 'title', 'BACK returns to the title');
  assert.equal(st.trophyView, null, 'the showcase payload is cleared (nothing paints over the title)');
  // G12: the title's OWN sheet is transparent (the art shows through) — the
  // gallery's flex-end override is what must be gone.
  assert.equal(ov.style.background, 'transparent', 'the title sheet is its own transparent one');
  assert.equal(ov.style.justifyContent, '', 'openMenu restored the alignment');
  assert.ok(cardWith('SHOP'), 'and the title cards are back (no leaked gallery chrome)');

  // The return mode is STASHED, not assumed: entering from a live run and
  // closing must come back to the run (openStats' contract).
  st.mode = 'playing';
  T.openTrophies();
  assert.equal(st.mode, 'trophies', 'open again');
  T.closeTrophies();
  assert.equal(st.mode, 'playing', 'closeTrophies restored the mode it was opened from');
  assert.equal(ov.style.display, 'none', 'and hid the overlay (the run is live behind it)');
});

S.check('ESC backs out of the gallery to the title', () => {
  st.mode = 'menu';
  T.openTrophies();
  assert.equal(st.mode, 'trophies', 'gallery open');
  key('escape');
  assert.equal(st.mode, 'title', 'ESC lands on the title');
  assert.equal(st.trophyView, null, 'the gallery payload is gone');
  assert.ok(cardWith('START GAME'), 'the title cards are rebuilt');
});

S.check('the gallery paints NO play HUD (the canvas half of the chrome gate)', () => {
  // G9 FOLLOW-UP: the parent found the in-run readouts bleeding through the
  // showcase. The gate is drawPlayHud, so it is asserted directly on the real
  // renderer: a live run builds the chrome, and 'trophies' must build none.
  T.startRun();
  h.pump(2);
  assert.equal(st.mode, 'playing', 'a run is live');
  const { R, ctx } = makeRenderer();
  R.drawPlayHud(ctx, st);
  assert.ok(R.hudChrome, 'the play readouts ARE built for a live run');
  st.mode = 'trophies';
  R.drawPlayHud(ctx, st);
  assert.equal(R.hudChrome, null, 'and NONE are built while the gallery is up');
  assert.equal(R.bossBanner, null, 'nor a boss banner');
  st.mode = 'playing';
});

// ============================================================================
// 3. THE RUN-END EARN HOOK (settleRunGold, through the real win funnel)
// ============================================================================
S.check('a run finished through the real funnel EARNS its trophies', () => {
  T.startRun();
  h.pump(2);
  assert.equal(st.mode, 'playing', 'run live');
  st.player.kills = 100;
  st.wave.num = 6;
  st.time = 700;                                   // 11:40 — past SURVIVE_10MIN
  const toastsBefore = st.toasts.length;
  T.run.runSurvived();                             // -> settleRunGold -> achievements
  assert.equal(st.mode, 'dead', 'the run ended through the same funnel a death uses');
  for (const id of ['FIRST_BLOOD', 'KILLS_100', 'WAVE_5', 'SURVIVE_10MIN']) {
    assert.ok(isEarned(T.getProfile(), id), id + ' was earned by the run summary');
  }
  assert.ok(!isEarned(T.getProfile(), 'KILLS_1000'),
    'and a counter the run did not reach stays unearned');
  const delta = st.toasts.length - toastsBefore;
  assert.ok(delta >= 1 && delta <= 2, 'at most two toast lines for a multi-earn run (' + delta + ')');
  const line = st.toasts.map(t => t.msg).find(m => /^TROPHY: /.test(m));
  assert.ok(line, 'a TROPHY toast was pushed (' + st.toasts.map(t => t.msg).join(' | ') + ')');
  assert.ok(line.includes(TROPHY_ART.KILLS_100.name),
    'and it names the trophy by its ART name (' + TROPHY_ART.KILLS_100.name + ')');
});

S.check('the earn GRANTS the unlock it promised (and the purse only grows)', () => {
  const profile = T.getProfile();
  for (const id of ['KILLS_100', 'WAVE_5', 'SURVIVE_10MIN']) {
    const u = ACHIEVEMENT_BY_ID[id].unlock;
    assert.ok(u, id + ' promises an unlock');
    assert.ok(ownsUnlock(profile, u), 'the unlock is owned: ' + u.kind + ' ' + u.id);
  }
  assert.ok(profile.gold > 0, 'the run paid out (' + profile.gold + 'g) — the grant itself is gold-free');
  const unlockLine = st.toasts.map(t => t.msg).find(m => /^UNLOCKED: /.test(m));
  assert.ok(unlockLine, 'and the new content is announced (' + st.toasts.map(t => t.msg).join(' | ') + ')');
});

S.check('a second identical run earns nothing twice (no re-earn, no re-grant, no toast)', () => {
  const profile = T.getProfile();
  const earnedBefore = gallerySummary(profile).earned;
  assert.ok(earnedBefore > 0, 'the first run banked trophies');
  T.startRun();
  h.pump(2);
  st.player.kills = 100;
  st.wave.num = 6;
  st.time = 700;
  const toastsBefore = st.toasts.length;
  T.run.runSurvived();
  assert.equal(gallerySummary(profile).earned, earnedBefore, 'the earned count did not move');
  assert.equal(st.toasts.length, toastsBefore,
    'and nothing was toasted: neither a re-earned trophy nor an already-owned unlock');
});

S.check('the title card count reflects the new trophies', () => {
  st.mode = 'dead';
  cardWith('TITLE').click();                        // the death screen's own TITLE path
  assert.equal(st.mode, 'title', 'back at the title');
  const summary = gallerySummary(T.getProfile());
  const card = cardWith('TROPHIES');
  assert.ok(card.innerHTML.includes(summary.earned + ' / ' + summary.total),
    'the card count is live (' + summary.earned + ' / ' + summary.total + ')');
  assert.ok(summary.earned > 0, 'and it is no longer zero');
});

S.check('an EARNED entry shows the real art, name and description', () => {
  cardWith('TROPHIES').click();
  assert.equal(st.mode, 'trophies', 'gallery open from the title');
  st.trophyIdx = ACHIEVEMENT_DISPLAY_IDS.indexOf('KILLS_100');
  T.trophiesStep(0);
  const v = st.trophyView;
  const art = TROPHY_ART.KILLS_100;
  assert.equal(v.id, 'KILLS_100', 'the earned trophy is selected');
  assert.equal(v.locked, false, 'and it is NOT masked');
  assert.equal(v.art, art, 'the real emblem, not the silhouette');
  assert.equal(h.elements['ov-title'].textContent, art.name, 'the art name is the caption');
  const body = h.elements['ov-sub'].innerHTML;
  assert.ok(body.includes(art.desc), 'the art description is shown');
  assert.ok(body.includes('already owned'), 'the unlock line reports ownership, not a promise');
  assert.ok(/earned /.test(body), 'and the earned date is printed');
  // A trophy still unearned in the same profile is still masked.
  st.trophyIdx = ACHIEVEMENT_DISPLAY_IDS.indexOf('KILLS_10000');
  T.trophiesStep(0);
  assert.equal(st.trophyView.art, TROPHY_ART[TROPHY_FALLBACK_ID], 'the unearned one is still locked art');
  assert.equal(h.elements['ov-title'].textContent, 'LOCKED', 'and still unnamed');
});

S.done();
