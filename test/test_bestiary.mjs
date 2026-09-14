// HORDES — G10 PART B: THE BESTIARY SCREEN (main.js mode 'bestiary' +
// render.js drawBestiary).
// Run: node test/test_bestiary.mjs
//
// Two halves, mirroring test_trophy_gallery exactly (the screen that shipped
// and is tested — the brief's "no second screen idiom"):
//
//   1. THE SHOWCASE (renderer.drawBestiary). Geometry is measured off a
//      recording 2d context (the test_render_hud pattern): a full-view dark
//      backdrop painted FIRST, the largest integer scale that fits the budget
//      box, the display case in the HUD's chrome vocabulary, and the MASK
//      contract — an undiscovered entry paints ONLY '#262636' art, a
//      discovered one paints the real palette / body / tier colour.
//   2. THE SCREEN (mode 'bestiary'). ONE entry at a time from the title card,
//      the ring wraps across the whole derived catalog, the caption prints
//      the model's own numbers (never a restatement), ??? for the undiscovered,
//      the overlay sheet cleared so the canvas owns the view — and every OTHER
//      screen gets the sheet back.
import assert from 'node:assert/strict';
import { Renderer } from '../src/render.js';
import { CONFIG as C, ladderEliteChance } from '../src/config.js';
import { ENEMY_TYPES, resolveLook } from '../src/enemy_types.js';
import { BOSSES, MIDBOSS, BOSS_SPRITES } from '../src/bosses.js';
import { RARITY } from '../src/rarity.js';
import { boot, suite } from './_harness.mjs';
import { ENCOUNTER_IDS, seenCount, totalEncounters, bestiaryModel, recordEncounter } from '../src/encounters.js';

const S = suite('test_bestiary');

// ---------- recording 2d context (the test_trophy_gallery pattern) ------------
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
const MASK = '#262636';
const view = (over = {}) => ({ id: 'probe', kind: 'enemy', ref: 'CHASER', discovered: true, ...over });

// ============================================================================
// 1. THE SHOWCASE GEOMETRY (standalone Renderer; no game shell needed)
// ============================================================================
S.check('no bestiaryView -> a null seam and an untouched canvas', () => {
  const { R, rec, ctx } = makeRenderer();
  R.bestiary = { scale: 9 };                     // poison: prove it is overwritten
  R.drawBestiary(ctx, {});
  assert.equal(R.bestiary, null, 'no payload -> the seam is null');
  assert.equal(rec.rects.length, 0, 'and nothing is painted at all');
  R.drawBestiary(ctx, null);                     // a missing state must not throw
  assert.equal(R.bestiary, null, 'a null state is safe too');
});

S.check('a full-view dark backdrop is painted FIRST (nothing shows through)', () => {
  const { R, rec, ctx } = makeRenderer();
  R.drawBestiary(ctx, { bestiaryView: view() });
  const first = rec.rects[0];
  assert.ok(first && first.w === C.VIEW_W && first.h === C.VIEW_H,
    'the first rect covers the whole view (' + (first && first.w + 'x' + first.h) + ')');
  assert.ok(isDarkPlate(first.style), 'and it is a dark backdrop (' + first.style + ')');
});

S.check('the display case is the HUD\'s own chrome vocabulary, surrounding the box', () => {
  const { R, rec, ctx } = makeRenderer();
  R.drawBestiary(ctx, { bestiaryView: view() });
  const sc = R.bestiary;
  assert.ok(sc, 'the seam is recorded');
  const case_ = rec.rects.slice(1, 4);           // backdrop, then FRAME / black / PLATE
  assert.equal(case_.length, 3, 'three chrome plates');
  assert.equal(case_[0].style.toLowerCase(), String(C.HUD.FRAME).toLowerCase(), 'frame colour');
  assert.equal(case_[1].style, '#000000', 'the black seam');
  assert.equal(case_[2].style.toLowerCase(), String(C.HUD.PLATE_SOLID).toLowerCase(), 'the plate');
  const PAD = 6;
  for (let i = 0; i < 3; i++) {
    const grow = 2 * (3 - i);                    // PAD+2, PAD+1, PAD
    const p = case_[i];
    assert.ok(Math.abs(p.x - (sc.x - PAD - (3 - i))) <= 1 && Math.abs(p.w - (sc.w + 2 * (PAD + (3 - i)))) <= 2,
      'plate ' + i + ' surrounds the box');
  }
  // Every chrome plate sits inside the view (the case never clips).
  for (const p of case_) {
    assert.ok(p.x >= 0 && p.y >= 0 && p.x + p.w <= C.VIEW_W && p.y + p.h <= C.VIEW_H,
      'the case is inside the view');
  }
});

S.check('a boss paints its real sprite at the LARGEST INTEGER scale in the budget', () => {
  const { R, rec, ctx } = makeRenderer();
  const spr = BOSS_SPRITES.GRAVELMAW;
  const grid = spr.frames ? spr.frames[0] : spr.grid;   // the guide shows frame 0
  R.drawBestiary(ctx, { bestiaryView: view({ id: 'boss:GRAVELMAW', kind: 'boss', ref: 'GRAVELMAW' }) });
  const sc = R.bestiary;
  assert.ok(Number.isInteger(sc.scale) && sc.scale >= 1, 'integer scale >= 1');
  assert.equal(sc.w, spr.box.w * sc.scale, 'box width is a whole number of sprite pixels');
  assert.equal(sc.h, spr.box.h * sc.scale, 'box height too');
  assert.ok(sc.w <= BUDGET_W && sc.h <= BUDGET_H,
    'inside the budget (' + sc.w + 'x' + sc.h + ' <= ' + BUDGET_W + 'x' + BUDGET_H + ')');
  const next = sc.scale + 1;
  assert.ok(next * spr.box.w > BUDGET_W || next * spr.box.h > BUDGET_H,
    'and it is the LARGEST such scale');
  assert.ok(Math.abs(sc.x - Math.round((C.VIEW_W - sc.w) / 2)) <= 1 &&
    Math.abs(sc.y - Math.round((C.VIEW_H - sc.h) / 2)) <= 1, 'centered');
  const blocks = rec.rects.filter(q => q.w === sc.scale && q.h === sc.scale);
  assert.equal(blocks.length, paintedCells(grid),
    'one NxN block per painted sprite pixel (' + blocks.length + ')');
  const pal = Object.values(spr.palette).map(String);
  assert.ok(blocks.some(q => pal.includes(q.style)),
    'a discovered boss paints its REAL palette (' + blocks[0].style + '...)');
});

S.check('an UNDISCOVERED boss paints ONLY the mask colour (silhouette is the sprite)', () => {
  const { R, rec, ctx } = makeRenderer();
  R.drawBestiary(ctx, { bestiaryView: view({ id: 'boss:PYRAXIS', kind: 'boss', ref: 'PYRAXIS', discovered: false }) });
  const sc = R.bestiary;
  assert.equal(sc.discovered, false, 'the seam reports the mask');
  const blocks = rec.rects.filter(q => q.w === sc.scale && q.h === sc.scale);
  assert.equal(blocks.length, paintedCells(BOSS_SPRITES.PYRAXIS.frames[0]),
    'the full silhouette is painted');
  assert.ok(blocks.length > 0 && blocks.every(q => q.style === MASK),
    'every art pixel is the one flat MASK colour');
});

S.check('a minion paints its real look; masked it paints the mask', () => {
  const { R, rec, ctx } = makeRenderer();
  const look = resolveLook('CHASER', 0);
  R.drawBestiary(ctx, { bestiaryView: view({ id: 'enemy:CHASER', kind: 'enemy', ref: 'CHASER' }) });
  let sc = R.bestiary;
  assert.ok(Number.isInteger(sc.scale) && sc.scale >= 1, 'integer scale');
  assert.ok(sc.w <= BUDGET_W && sc.h <= BUDGET_H, 'inside the budget');
  // The shape fills the recorded box from its centre (fillRect-composable
  // shapes — block/round/diamond/tall/wide all land inside the case).
  const art = rec.rects.filter(q => q.style !== undefined && q.d === 0 && q.n > 3 &&
    !(q.w === C.VIEW_W));
  const painted = rec.rects.slice(4).filter(q => q.style === look.body);
  assert.ok(painted.length > 0, 'a discovered minion paints its real body colour (' + look.body + ')');
  // And the size budget respects the shape's overshoot (tall/wide paint 1.3x).
  const over = (look.shape === 'tall' || look.shape === 'wide') ? 1.3 : 1;
  const need = Math.floor(BUDGET_W / (C.ENEMY.W * look.sizeMult * over));
  assert.equal(sc.scale, Math.min(need,
    Math.floor(BUDGET_H / (C.ENEMY.H * look.sizeMult * over))), 'the scale is the budget fit');

  const rec2 = makeRenderer();
  rec2.R.drawBestiary(rec2.ctx, { bestiaryView: view({ discovered: false }) });
  const maskedPaint = rec2.rec.rects.slice(4).filter(q => q.style === MASK);
  assert.ok(maskedPaint.length > 0, 'a masked minion paints the MASK silhouette');
  assert.equal(rec2.rec.rects.slice(4).some(q => q.style === look.body), false,
    'and NOT its real colour');
});

S.check('a tier paints its tell colour; ELITE gold, RARE cyan, MYTHIC violet', () => {
  const { R, rec, ctx } = makeRenderer();
  const expect = { ELITE: '#ffd75e', RARE: RARITY.RARE.tell.outline, MYTHIC: RARITY.MYTHIC.tell.outline };
  for (const [ref, colour] of Object.entries(expect)) {
    rec.rects.length = 0;
    R.drawBestiary(ctx, { bestiaryView: view({ id: 'tier:' + ref, kind: 'tier', ref }) });
    const sc = R.bestiary;
    assert.ok(sc.w <= BUDGET_W && sc.h <= BUDGET_H, ref + ' diamond in budget');
    assert.ok(rec.rects.slice(4).some(q => q.style === colour),
      ref + ' paints its own colour (' + colour + ')');
  }
  rec.rects.length = 0;
  R.drawBestiary(ctx, { bestiaryView: view({ id: 'tier:MYTHIC', kind: 'tier', ref: 'MYTHIC', discovered: false }) });
  assert.ok(rec.rects.slice(4).some(q => q.style === MASK) &&
    !rec.rects.slice(4).some(q => q.style === expect.MYTHIC),
    'a masked tier paints the mask, never its colour');
});

// ============================================================================
// 2. THE SCREEN (real src/main.js through the shared harness)
// ============================================================================
const h = await boot({ storage: [['hordes_onboarded', '1']] });
const st = h.state;
const T = h.T;
const ov = h.elements['overlay'];
const cards = () => (h.elements['ov-cards'] ? h.elements['ov-cards'].children : []);
const cardWith = (t) => cards().find(c => (c.innerHTML || '').includes(t));
const key = (k) => h.key('keydown', { key: k, preventDefault() {} });

S.check('the title menu offers a BESTIARY card carrying the honest count', () => {
  if (st.mode === 'intro') key('x');                 // any key skips the intro movie
  assert.equal(st.mode, 'title', 'the title is up');
  T.showTitle();
  cardWith('PROGRESS').click();            // U1: the guide's card lives behind PROGRESS
  const card = cardWith('BESTIARY');
  assert.ok(card, 'a BESTIARY card exists');
  const seen = seenCount(T.getProfile());
  assert.ok(card.innerHTML.includes(seen + ' / ' + totalEncounters() + ' discovered'),
    'the card carries the KNOWN-id count (' + seen + ' / ' + totalEncounters() + ')');
});

S.check('opening the guide sets mode bestiary with a masked first entry', () => {
  T.showTitle();
  cardWith('PROGRESS').click();            // U1: behind the PROGRESS door
  cardWith('BESTIARY').click();
  assert.equal(st.mode, 'bestiary', 'mode is bestiary');
  assert.ok(st.bestiaryView && st.bestiaryView.id, 'state.bestiaryView is populated');
  assert.equal(cards().length, 4, 'FILTER / PREV / NEXT / BACK');
  assert.equal(st.bestiaryView.discovered, false, 'a fresh profile starts masked');
  assert.equal(h.elements['ov-title'].textContent, '???', 'the name is masked');
  const body = h.elements['ov-sub'].innerHTML;
  assert.ok(body.includes('not yet encountered'), 'no stats, no behaviour lines');
  assert.ok(/^FILTER: ALL<br>\d+ \/ \d+<br>/.test(body),
    'the caption names the filter, then the ring position');
});

S.check('the guide clears the overlay sheet so the canvas art is visible', () => {
  assert.equal(ov.style.background, 'transparent', 'no sheet over the art');
  assert.equal(ov.style.justifyContent, 'flex-end', 'the chrome is pushed to the bottom');
  assert.equal(ov.style.display, 'flex', 'and the overlay is up');
});

S.check('the pad-layer gate is OFF in bestiary (chromeOn false, layer hidden)', () => {
  assert.equal(T.chromeOn(), false, 'chromeOn() is false in bestiary');
  h.pump(1);                                          // syncChrome runs on the mode's first frame
  assert.equal(h.elements['touch'].style.display, 'none',
    'syncChrome hid the touch/pad layer');
});

S.check('frame() paints the selected entry while the guide is open, and stops after', () => {
  h.pump(1);
  assert.ok(T.renderer.bestiary && T.renderer.bestiary.id === st.bestiaryView.id,
    'the real frame path painted the entry (' + (T.renderer.bestiary || {}).id + ')');
  assert.ok(T.renderer.bestiary.scale >= 1, 'with a real integer scale');
  T.closeBestiary();
  st.mode = 'menu';
  h.pump(1);
  assert.equal(T.renderer.bestiary, null, 'a later frame paints no bestiary');
  st.mode = 'menu';
  T.openBestiary();
});

S.check('PREV / NEXT step the ring and WRAP; the ring is the whole derived catalog', () => {
  const ids = T.bestiaryDisplayIds();
  const n = ids.length;
  assert.deepEqual(ids, ENCOUNTER_IDS, 'the display ring is the derived catalog');
  assert.equal(n, totalEncounters(), 'and totals agree');
  st.bestiaryIdx = 0; T.bestiaryStep(0);
  T.bestiaryStep(1);
  assert.equal(st.bestiaryIdx, 1, 'NEXT advances');
  T.bestiaryStep(-1);
  assert.equal(st.bestiaryIdx, 0, 'PREV returns');
  T.bestiaryStep(-1);
  assert.equal(st.bestiaryIdx, n - 1, 'PREV from the first wraps to the LAST');
  T.bestiaryStep(1);
  assert.equal(st.bestiaryIdx, 0, 'NEXT from the last wraps to the FIRST');
  T.bestiaryStep(n * 3 + 5);
  assert.equal(st.bestiaryIdx, 5, 'arbitrary step counts are normalised');
});

S.check('a short live run DISCOVERS entries; the caption prints the model\'s own numbers', () => {
  T.closeBestiary();
  T.startRun();
  h.pump(1);
  assert.equal(st.mode, 'playing', 'a run is live');
  // Drafts pause the sim — clear them; ~6s of spawns is enough for CHASER
  // (recorded AT SPAWN, never the kill funnel).
  for (let i = 0; i < 60 * 12 && seenCount(T.getProfile()) < 1; i++) {
    if (st.mode === 'draft' || st.mode === 'evolve') {
      const c = h.elements['ov-cards'].children[0];
      if (c) { c.click(); continue; }
    }
    h.pump(1);
  }
  const seen = seenCount(T.getProfile());
  assert.ok(seen >= 1, 'the run recorded sightings (' + seen + ')');
  st.mode = 'menu';                                   // leave the run without the death screen
  T.openBestiary();
  const ids = T.bestiaryDisplayIds();
  const model = bestiaryModel(T.getProfile());
  const disc = model.findIndex(e => e.discovered);
  assert.ok(disc >= 0, 'a discovered entry exists in the ring');
  st.bestiaryIdx = disc; T.bestiaryStep(0);
  const e = model[disc];
  assert.equal(st.bestiaryView.id, ids[disc], 'the ring position selects it');
  assert.equal(st.bestiaryView.discovered, true, 'and the mask is off');
  assert.equal(h.elements['ov-title'].textContent, e.name, 'the caption names it');
  const body = h.elements['ov-sub'].innerHTML;
  assert.ok(body.includes('encountered ' + e.kills), 'the sighting count is live');
  assert.ok(body.includes('first wave ' + e.firstWave), 'the first wave too');
  for (const line of e.info) assert.ok(body.includes(line), 'the model\'s line verbatim: ' + line);
});

S.check('the model\'s numbers ARE the source constants (no restatement anywhere)', () => {
  const model = Object.fromEntries(bestiaryModel(T.getProfile()).map(e => [e.ref, e]));
  // ELITE: every number read from the config constants (brief C2).
  const elite = model.ELITE.info;
  assert.ok(elite[0].includes(Math.round(C.SPAWNER.ELITE_CHANCE * 100) + '% of spawns after ' +
    C.SPAWNER.ELITE_TIME + 's'), 'the ELITE rate line is built from the constants');
  assert.ok(elite[2].includes((ladderEliteChance(600) * 100).toFixed(1) + '%'),
    'the measured 10:00 chance is ladderEliteChance(600) itself');
  // RARE: the rate + mults are the rarity table's own fields.
  const rare = model.RARE.info;
  const pct = Math.round(RARITY.RARE.chance * 1000) / 10;
  assert.ok(rare[0].includes(pct + '% of spawns'), 'the RARE rate is the tier table\'s');
  assert.ok(rare[1].includes('hp x' + RARITY.RARE.hpMult) && rare[1].includes('xp x' + RARITY.RARE.xpMult),
    'and so are the mults');
  // CHASER: the stat line is ENEMY_TYPES' own multipliers.
  const t = ENEMY_TYPES.CHASER;
  const pctF = x => 'x' + String(x).replace(/0$/, '');
  assert.equal(model.CHASER.info[0],
    `hp ${pctF(t.hpMult)} - speed ${pctF(t.speedMult)} - contact ${pctF(t.contactDamageMult)} - xp ${pctF(t.xpMult)}`,
    'the minion stat line is derived, not retyped');
  // A boss row carries the boss table's own flavour line.
  assert.ok(model.GRAVELMAW.info.includes(BOSSES.GRAVELMAW.flavor), 'boss flavour verbatim');
  assert.ok(model.HERALD.info.includes(MIDBOSS.HERALD.flavor), 'herald flavour verbatim');
});

S.check('BACK restores the title and every overlay override resets', () => {
  cardWith('BACK').click();                           // the real BACK path
  assert.equal(st.mode, 'title', 'BACK returns to the title');
  assert.equal(st.bestiaryView, null, 'the payload is cleared (nothing paints over the title)');
  // G12: the title's OWN sheet is transparent (the art shows through) — the
  // guide's flex-end override is what must be gone.
  assert.equal(ov.style.background, 'transparent', 'the title sheet is its own transparent one');
  assert.equal(ov.style.justifyContent, '', 'openMenu restored the alignment');
  assert.ok(cardWith('START GAME'), 'and the title cards are back (no leaked guide chrome)');
  cardWith('PROGRESS').click();            // U1: the guide's card lives behind PROGRESS
  assert.ok(cardWith('BESTIARY').innerHTML.includes(seenCount(T.getProfile()) + ' / ' +
    totalEncounters() + ' discovered'), 'the card count is live after the run');
  cardWith('BACK').click();                // back to the title for the next check

  // The return mode is STASHED, not assumed: entering from a live run and
  // closing must come back to the run.
  st.mode = 'playing';
  T.openBestiary();
  assert.equal(st.mode, 'bestiary', 'open again');
  T.closeBestiary();
  assert.equal(st.mode, 'playing', 'closeBestiary restored the mode it was opened from');
  assert.equal(ov.style.display, 'none', 'and hid the overlay (the run is live behind it)');
  st.mode = 'menu';
});

S.check('ESC backs out to the title; arrows walk the ring', () => {
  T.openBestiary();
  assert.equal(st.mode, 'bestiary', 'guide open');
  const before = st.bestiaryIdx;
  key('arrowright');
  assert.equal(st.bestiaryIdx, before + 1, 'ARROW-RIGHT steps forward');
  key('arrowleft');
  assert.equal(st.bestiaryIdx, before, 'ARROW-LEFT steps back');
  key('escape');
  assert.equal(st.mode, 'title', 'ESC lands on the title');
  assert.equal(st.bestiaryView, null, 'the guide payload is gone');
  // U1: this used to assert cardWith('PLAY') — which only passed because the
  // old title carried "HOW TO PLAY" and the lookup is a SUBSTRING match. The
  // real card is START GAME; assert that instead of an accidental match.
  assert.ok(cardWith('START GAME'), 'the title cards are rebuilt');
});

S.check('the guide paints NO play HUD (the canvas half of the chrome gate)', () => {
  T.startRun();
  h.pump(2);
  assert.equal(st.mode, 'playing', 'a run is live');
  const { R, ctx } = makeRenderer();
  R.drawPlayHud(ctx, st);
  assert.ok(R.hudChrome, 'the play readouts ARE built for a live run');
  st.mode = 'bestiary';
  R.drawPlayHud(ctx, st);
  assert.equal(R.hudChrome, null, 'and NONE are built while the guide is up');
  st.mode = 'playing';
});

// ---- G23/G11: the ALL/MISSING filter (the guide's remaining open item) -----
S.check('the filter defaults to ALL; MISSING lists only undiscovered entries', () => {
  st.mode = 'menu';                                     // leave the run cleanly
  T.openBestiary();
  assert.equal(T.bestiaryFilter.get(), 'ALL', 'default is ALL');
  const all = T.bestiaryDisplayIds();
  const model = bestiaryModel(T.getProfile());
  assert.ok(model.some(e => e.discovered), 'this profile has discoveries (a run happened)');
  const missingModel = model.filter(e => !e.discovered);
  T.bestiaryFilter.cycle();                             // the REAL card/key path
  assert.equal(T.bestiaryFilter.get(), 'MISSING', 'the cycle flipped it');
  assert.deepEqual(T.bestiaryDisplayIds(), missingModel.map(e => e.id),
    'MISSING is exactly the undiscovered slice of the same model');
  assert.ok(T.bestiaryDisplayIds().length < all.length, 'and it is strictly smaller here');
  assert.ok(h.elements['ov-sub'].innerHTML.startsWith('FILTER: MISSING'),
    'the caption names the live filter');
});

S.check('the ring wraps INSIDE the filtered list; a switch re-normalises the index', () => {
  const ids = T.bestiaryDisplayIds();
  const n = ids.length;
  assert.ok(n >= 2, 'the filtered list is walkable (' + n + ' entries)');
  st.bestiaryIdx = 0; T.bestiaryStep(0);
  T.bestiaryStep(-1);
  assert.equal(st.bestiaryIdx, n - 1, 'PREV from the first wraps to the filtered LAST');
  T.bestiaryStep(1);
  assert.equal(st.bestiaryIdx, 0, 'NEXT from the last wraps to the filtered FIRST');
  assert.equal(st.bestiaryView.id, ids[0], 'the view is the filtered list\'s own first entry');
  // A stale out-of-range index (from the longer ALL list) must be normalised
  // by the switch, never index past the shorter list.
  st.bestiaryIdx = 999;
  T.bestiaryFilter.cycle();                             // back to ALL
  assert.ok(st.bestiaryIdx < T.bestiaryDisplayIds().length,
    'the switch normalised the stale index into range');
});

S.check('the F key cycles the filter (the FILTER card\'s key twin)', () => {
  T.bestiaryFilter.cycle();                             // ALL -> MISSING
  assert.equal(T.bestiaryFilter.get(), 'MISSING');
  key('f');
  assert.equal(T.bestiaryFilter.get(), 'ALL', 'F cycles it back');
  assert.ok(cardWith('FILTER').innerHTML.includes('every entry'), 'the card names ALL');
  key('f');
  assert.ok(cardWith('FILTER').innerHTML.includes('undiscovered'), 'the card names MISSING');
  key('f');                                             // leave it on ALL
});

S.check('MISSING with everything discovered is an HONEST empty state', () => {
  const profile = T.getProfile();
  for (const e of bestiaryModel(profile)) {
    if (!e.discovered) recordEncounter(profile, e.id, { wave: 1, at: 1 });
  }
  assert.equal(seenCount(profile), totalEncounters(), 'the profile discovered everything');
  T.bestiaryFilter.cycle();                             // ALL -> MISSING: empty
  assert.equal(T.bestiaryDisplayIds().length, 0, 'the filtered list is empty');
  assert.equal(st.bestiaryView, null, 'no payload paints');
  assert.equal(h.elements['ov-title'].textContent, 'BESTIARY', 'the title is honest');
  assert.ok(h.elements['ov-sub'].textContent.includes('everything discovered'),
    'the caption says what happened, not "broken"');
  T.bestiaryStep(1);                                    // PREV/NEXT must not crash
  T.bestiaryStep(-1);
  assert.equal(T.bestiaryDisplayIds().length, 0, 'still empty, still walkable');
  key('f');                                             // back to ALL
  assert.equal(T.bestiaryDisplayIds().length, totalEncounters(), 'ALL still lists everything');
  // The overlay-reset contract holds across the whole filter walk: BACK
  // restores the title and clears the payload.
  cardWith('BACK').click();
  assert.equal(st.mode, 'title', 'BACK returns to the title from a filtered guide');
  assert.equal(st.bestiaryView, null, 'the payload is cleared');
  assert.equal(ov.style.background, 'transparent', 'the title sheet is its own transparent one');
});

S.done();
