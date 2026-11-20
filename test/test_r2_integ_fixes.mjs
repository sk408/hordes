// R2/R3 integration fixes (the merged movies, readable fight and smaller HUD):
// the problems three reviewers found when the changes met, each pinned here
// through the real game (boot()).
//   1. A tutorial or hint panel keeps clear of the message lane under the
//      vitals block (it covered the line it was talking about at 1280x720).
//   2. The boss-arrival letterbox no longer hides HP, MP, the clock and the
//      boss rule plate: they step down under the band while it is in.
//   3. The movie SKIP prompt says "click" for a mouse and "tap" for a finger,
//      and on a phone held upright the button and the words are big enough
//      to read (at least 12 CSS px of text).
//   4. J (the quest list) is a key press like any other during a movie: it
//      shows SKIP and does not open the quests under the movie.
//   5. J is named in the key lists (CONTROLS, the compact key lines).
//   6. The FIELD REPORT's CLOSE stays in view when its cards overflow.
import assert from 'node:assert';
import fs from 'node:fs';
import { suite, boot } from './_harness.mjs';
import { CONFIG as C } from '../src/config.js';
import { placePanel } from '../src/tutorial_ui.js';
import { skipLayout, skipPrompt } from '../src/movie_skip.js';
import { controlById } from '../src/controls_ref.js';
import { LETTERBOX_BAND } from '../src/render.js';

const s = suite('test_r2_integ_fixes');
const h = await boot({ storage: [['hordes_onboarded', '1']] });
const T = h.T, st = h.state, el = h.elements;
T.banners.suppressAll();
const kdown = (k) => h.key('keydown', { key: k, preventDefault() {} });
const tap = (x, y, pointerType) => el['game']._ev.pointerdown({ clientX: x, clientY: y, pointerType,
  stopPropagation() {}, preventDefault() {} });
const frameRec = () => {
  h.rec.on = true; h.rec.rects.length = 0; h.rec.texts.length = 0;
  h.pump(1);
  h.rec.on = false;
  return { rects: h.rec.rects.slice(), texts: h.rec.texts.map(t => t.txt) };
};
const canvasRect = (r) => { el['game'].getBoundingClientRect = () => r; };
const RECT_480 = { left: 0, top: 0, right: 480, bottom: 300, width: 480, height: 300 };
const hits = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

// ---- the intro is up at boot: the movie checks first --------------------------
s.check('J during a movie is a press like any other: SKIP shows, the quests stay shut', () => {
  assert.equal(st.mode, 'intro');
  h.pump(30);                                     // past the guard
  const q0 = !!st.questsOpen;
  kdown('j');
  assert.equal(st.mode, 'intro', 'J does not leave the movie');
  assert.ok(T.movies.current.skip.ask > 0, 'J shows SKIP');
  assert.equal(!!st.questsOpen, q0, 'J does not open the quests under the movie');
  h.pump(2);
  T.movies.current.skip.ask = 0;                  // as if the prompt ran out
});

s.check('the skip prompt says click for a mouse and tap for a finger', () => {
  assert.equal(st.mode, 'intro');
  tap(240, 150, 'mouse');
  let f = frameRec();
  assert.ok(f.texts.includes('click SKIP or press ESC'), 'a mouse click: ' + f.texts.join('|'));
  assert.ok(!f.texts.includes('tap SKIP to skip'));
  T.movies.current.skip.ask = 0;
  tap(240, 150, 'touch');
  f = frameRec();
  assert.ok(f.texts.includes('tap SKIP to skip'), 'a finger: ' + f.texts.join('|'));
  T.movies.current.skip.ask = 0;
  kdown('x');
  f = frameRec();
  assert.ok(f.texts.includes('ESC or ENTER to skip'), 'a key: ' + f.texts.join('|'));
  assert.equal(skipPrompt('mouse'), 'click SKIP or press ESC');
  assert.equal(skipPrompt(true), 'tap SKIP to skip');
  assert.equal(skipPrompt(false), 'ESC or ENTER to skip');
  T.movies.current.skip.ask = 0;
});

s.check('on a phone held upright the SKIP button and its words can be read', () => {
  assert.equal(st.mode, 'intro');
  // 390x844: the canvas is a 390x243 band, 0.8125 CSS px per view px.
  const sc = 390 / C.VIEW_W;
  canvasRect({ left: 0, top: 300, right: 390, bottom: 543.75, width: 390, height: 243.75 });
  try {
    tap(240, 150, 'touch');
    const f = frameRec();
    const lay = skipLayout(sc);
    assert.ok(lay.font * sc >= 12, 'prompt text at least 12 CSS px: ' + lay.font * sc);
    // The gold button is the drawn rect at the top right.
    const btn = f.rects.find(r => r.x === lay.rect.x && r.y === lay.rect.y && r.w === lay.rect.w && r.h === lay.rect.h);
    assert.ok(btn, 'the button is drawn at its layout rect');
    assert.ok(btn.w * sc >= 48 && btn.h * sc >= 14, 'button ' + (btn.w * sc).toFixed(1) + 'x' + (btn.h * sc).toFixed(1) + ' CSS px');
    const strip = f.rects.find(r => r.x === 0 && r.w === C.VIEW_W && r.y + r.h === C.VIEW_H && r.h === lay.strip);
    assert.ok(strip && strip.h >= lay.font + 4, 'the prompt sits on a strip taller than its text');
    // The whole button is inside the tap box, so a tap on what you see skips.
    const cx = btn.x + btn.w / 2, cy = btn.y + btn.h / 2;
    tap(cx * sc, 300 + cy * sc, 'touch');
    assert.notEqual(st.mode, 'intro', 'a tap on the drawn button skips');
  } finally { canvasRect(RECT_480); }
  T.uiGuard.standDown();
  // Desktop keeps at least the 12 px the movies agent proposed.
  assert.ok(skipLayout(2.4).font >= 12 && skipLayout(2.4).rect.w >= 60);
  for (const k of [0.5, 0.8125, 1, 1.3, 2.4]) {
    const r = skipLayout(k).rect;
    assert.ok(r.x >= C.VIEW_W - 112 && r.x + r.w <= C.VIEW_W && r.y + r.h <= 46, 'inside SKIP_HIT at ' + k);
  }
});

// ---- a run --------------------------------------------------------------------
const fresh = () => {
  if (st.mode !== 'title' && st.mode !== 'menu') { st.mode = 'menu'; }
  T.startRun();
  st.enemies.length = 0; st.enemyShots.length = 0; st.spawnTimer = 1e9;
  st.wave.endsAt = st.time + 1e9; st.wave.midAt = st.time + 1e9;
  st.toasts.length = 0;
};
const keepAlive = () => { if (st.player) st.player.hp = st.player.stats.maxHp; };

s.check('a tutorial panel keeps clear of the message lane at 1280x720', () => {
  fresh();
  h.pump(2, keepAlive);
  assert.equal(st.mode, 'playing');
  // 1280x720: the canvas is 1152x720 at x 64 (2.4 CSS px per view px).
  canvasRect({ left: 64, top: 0, right: 1216, bottom: 720, width: 1152, height: 720 });
  const iw = window.innerWidth, ih = window.innerHeight;
  window.innerWidth = 1280; window.innerHeight = 720;
  try {
    h.pump(1, keepAlive);
    const ch = T.renderer.hudChrome;
    assert.ok(ch && ch.lane && ch.vitals, 'the HUD is up');
    const k = 2.4;
    const lane = { left: 64 + ch.lane.x * k, top: ch.lane.y * k, right: 64 + (C.VIEW_W - 9) * k, bottom: (ch.lane.y + 21) * k };
    const avoid = T.tut.avoid();
    assert.ok(avoid.some(r => Math.abs(r.top - lane.top) < 1 && r.bottom >= lane.bottom - 1 && r.right >= 64 + 400 * k),
      'the lane (two lines, full width) is a rect the panel avoids: ' + JSON.stringify(avoid));
    // The reviewers' cases. SKILL / POTION: the ring is on the key strip at the
    // bottom; the FOCUS hint: no ring. A real panel is about 440x86..107.
    const bounds = { left: 64, top: 0, right: 1216, bottom: 720, width: 1152, height: 720 };
    const view = { left: 0, top: 0, right: 1280, bottom: 720, width: 1280, height: 720 };
    const strip = { left: 470, right: 810, top: 684, bottom: 712 };
    // A ring low enough that the lower slot is taken too: the panel then
    // slides down under the lane instead of sitting on it.
    const pad = { left: 470, right: 810, top: 600, bottom: 712 };
    for (const size of [{ w: 358, h: 86 }, { w: 440, h: 107 }]) {
      for (const targets of [[strip], [pad], []]) {
        const p = placePanel(bounds, view, size, targets, avoid);
        const box = { left: p.left, top: p.top, right: p.left + size.w, bottom: p.top + size.h };
        assert.ok(!hits(box, lane), 'the panel covers the lane: ' + JSON.stringify({ box, lane, targets: targets.length }));
        for (const t of targets) assert.ok(!hits(box, t), 'the panel covers its ring');
        assert.ok(box.bottom <= 360 - 8 || box.top >= 360 + 8, 'not on the middle of the field');
      }
    }
    // And the live panel, placed by the game itself, for the FOCUS hint.
    T.tut.setHintsEnabled(true);
    assert.ok(T.tut.hint('focus', []), 'the focus hint shows');
    h.pump(1, keepAlive);
    const ui = T.tut.ui;
    assert.ok(ui && ui.pos, 'the panel is placed');
    const box = { left: ui.pos.left, top: ui.pos.top, right: ui.pos.left + 440, bottom: ui.pos.top + 64 };
    assert.ok(!hits(box, lane), 'the live panel covers the lane: ' + JSON.stringify({ box, lane }));
    T.tut.hints.active = null;                    // GOT IT
    T.tut.setHintsEnabled(false);
    h.pump(1, keepAlive);
  } finally {
    canvasRect(RECT_480);
    window.innerWidth = iw; window.innerHeight = ih;
  }
});

s.check('the boss-arrival letterbox: HP, MP, the clock and the rule plate step down under it', () => {
  fresh();
  st.wave.num = 2;
  T.bossRules.setWave(2);
  T.bossRules.spawnBoss();
  assert.ok(st.bossBanner && st.bossBanner.ttl > 0 && !st.bossBanner.peripheral, 'the arrival banner is up');
  assert.ok(st.bossRule && st.bossRule.live, 'the wave rule is live');
  h.pump(30, keepAlive);                          // the band is fully in
  let ch = T.renderer.hudChrome;
  const edge = LETTERBOX_BAND + 1;                // the band and its red line
  for (const k of ['vitals', 'clock', 'rule']) {
    assert.ok(ch[k], k + ' is painted');
    assert.ok(ch[k].y >= edge, k + ' sits under the letterbox (y ' + ch[k].y + ')');
  }
  assert.ok(ch.lane.y > ch.vitals.y + ch.vitals.h, 'the lane still sits under the vitals block');
  // The banner gone, the HUD is back where it lives.
  for (let i = 0; i < 400 && st.bossBanner && st.bossBanner.ttl > 0; i++) h.pump(1, keepAlive);
  h.pump(2, keepAlive);
  ch = T.renderer.hudChrome;
  assert.equal(ch.vitals.y, 10, 'the vitals block is back at the top');
  assert.ok(!ch.letterboxDrop, 'no drop without the band');
});

s.check('J is named in the key lists', () => {
  const row = controlById('quests');
  assert.ok(row && row.keys.includes('J'), 'CONTROLS has the J row');
  const src = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const table = src.slice(src.indexOf('const HINT_LINES = {'), src.indexOf('HINT_LINES.AUTO = HINT_LINES.AUTO_ALL'));
  for (const mode of ['AUTO_ALL', 'AUTO_MOVE', 'EXPLORE', 'MANUAL']) {
    const block = table.slice(table.indexOf(mode + ': ['), table.indexOf('],', table.indexOf(mode + ': [')));
    assert.ok(/J quests/.test(block), mode + ' key lines name J');
  }
});

s.check('the FIELD REPORT keeps CLOSE in view when the cards overflow', () => {
  fresh();
  h.pump(1, keepAlive);
  T.openStats();
  assert.equal(st.mode, 'stats');
  const close = [...el['ov-cards'].children].find(k => (k.innerHTML || '').includes('>CLOSE<'));
  assert.ok(close, 'a CLOSE card');
  assert.ok(close.classList.contains('pin-close'), 'CLOSE is pinned');
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(/#overlay \.card\.pin-close \{[^}]*position: sticky;[^}]*bottom:/.test(html), 'the pin is sticky at the bottom');
  T.closeStats();
});

s.done();
