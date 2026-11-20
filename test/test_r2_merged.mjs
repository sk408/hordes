// HORDES - the four R2 changes played together (the death movie, the portal
// beat (removed in round 8), the intro, the actor animation). Each check pins a defect the merged
// review found where two of them met:
//   1. the title painting paints in runs (one long frame as the title came up)
//   2. the death pop is a small capped star, and none under reduced motion
//   3. the death caption keeps a readable size on a phone held upright
//   4. the intro's clock waits while the tab is hidden
//   5. round 8 removed the portal beat: a boss dies its own death on the
//      field (a double wave's two as well), and no beat holds the field
//   6. the death freeze is the world without the HUD, the killer is drawn
//      over the hero in a contact death, a dead shooter is said to be dead,
//      and the copy is let go when the movie ends
//   7. an unattended escape is not counted as seen
// Run: node test/test_r2_merged.mjs
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';
import { mulberry32 } from '../src/weather.js';
import * as DCINE from '../src/death_cine.js';
import * as INTRO from '../src/intro.js';
import { pilotLook, killerLook } from '../src/movie_cast.js';
import { drawFeelEffects } from '../src/fx/feel_render.js';
import { makeTypedEnemy } from '../src/enemy_types.js';

Math.random = mulberry32(20261120);
const S = suite('R2 merged: the four changes together');

function recorder() {
  const rects = [], texts = [];
  let style = null, font = '';
  const g = {
    set fillStyle(v) { style = v; }, get fillStyle() { return style; },
    set font(v) { font = v; }, get font() { return font; },
    globalAlpha: 1, textAlign: '', textBaseline: '', imageSmoothingEnabled: true,
    fillRect(x, y, w, h) { rects.push({ x, y, w, h, style }); },
    fillText(t, x, y) { texts.push({ t: String(t), font, x, y }); },
    measureText: (s) => ({ width: String(s).length * 5 }),
    save() {}, restore() {}, translate() {}, scale() {}, beginPath() {}, arc() {}, fill() {},
    moveTo() {}, rect() {}, clip() {}, drawImage() {}, createLinearGradient: () => ({ addColorStop() {} }),
  };
  return { g, rects, texts };
}

// ---- 2. the death pop ----------------------------------------------------------------------
S.check('the death pop is a small star, capped, and left out under reduced motion', () => {
  const puff = () => ({ x: 200, y: 150, cls: 3, colour: '#884422', age: 0.02, ttl: 0.7, rot: 0, r: 0.6 * 52 });
  const run = (reduced) => {
    const r = recorder();
    drawFeelEffects(r.g, { feel: { puffs: [puff()], sparks: [], bursts: [], nums: [] } }, { x: 0, y: 0 }, reduced);
    return r.rects.filter(q => q.style === '#ffffff');
  };
  const white = run(false);
  assert.ok(white.length > 0, 'there is a pop');
  const big = Math.max(...white.map(q => q.w * q.h));
  assert.ok(big <= 12 * 3, 'no white block bigger than a thin bar: ' + big + ' px');
  assert.ok(Math.max(...white.map(q => q.w)) <= 12 && Math.max(...white.map(q => q.h)) <= 12, 'capped at 12 px across');
  const still = run(true);
  assert.ok(still.every(q => q.w <= 3 && q.h <= 3), 'reduced motion: shards only, no pop');
});

// ---- 3. the caption on a phone ---------------------------------------------------------------
S.check('the death caption keeps a readable size on a phone held upright', () => {
  const o = { hero: pilotLook('ROGUE'), killer: killerLook({ typeId: 'CHASER' }), repeat: true,
    freeze: { scale: 2, hero: { x: 200, y: 150 }, killer: { x: 210, y: 150 } } };
  const sizeOf = (capScale) => {
    const r = recorder();
    DCINE.render(r.g, 300, 'contact', { ...o, capScale });   // the freeze
    const lab = r.texts.find(x => x.t === 'KILLED BY');
    assert.ok(lab, 'the caption is up');
    return Number(/(\d+)px/.exec(lab.font)[1]) * capScale;   // CSS px on screen
  };
  assert.ok(sizeOf(390 / 480) >= 10, 'phone upright: the label reads at 10 CSS px or more: ' + sizeOf(390 / 480).toFixed(1));
  assert.equal(DCINE.captionScale({ capScale: 2.6 }), 1, 'a desktop keeps the authored size');
});

// ---- the real game ---------------------------------------------------------------------------
const h = await boot({ storage: [['hordes_onboarded', '1']] });
const T = h.T, st = h.state, el = h.elements;
const prof = T.getProfile();

// ---- 4. the intro's clock --------------------------------------------------------------------
S.check('the intro waits while the tab is hidden: the time away is not taken off the movie', () => {
  assert.equal(st.mode, 'intro');
  const mo = T.movies.current;
  const dur = INTRO.durationOf(mo.opts);   // the original 7 s movie, for every player
  assert.equal(dur, 7000);
  h.pump(6);
  h.advanceClock(dur + 3000);   // a hidden tab: no frames for longer than the movie
  h.pump(1);
  assert.equal(st.mode, 'intro', 'still on the movie after coming back');
  h.pump(Math.ceil(dur / (1000 / 60)) + 30);
  assert.notEqual(st.mode, 'intro', 'and it plays to its end');
});

// ---- 1. the title painting -------------------------------------------------------------------
S.check('the title painting comes up in runs, not one call per pixel', () => {
  h.skipMovie();
  let n = 0, g = 0;
  while (st.mode !== 'title' && st.mode !== 'setup' && g++ < 120) h.pump(1);
  // Force the title's first paint again and count its calls.
  T.renderer._titlePainted = false;
  h.rec.on = true; h.rec.rects.length = 0; h.pump(1); h.rec.on = false;
  n = h.rec.rects.length;
  assert.ok(T.renderer.titleScreen, 'the title was painted (mode ' + st.mode + ')');
  assert.ok(n > 1000 && n < 60000, 'fillRect calls for the title: ' + n);
});

T.banners.suppressAll();
h.skipMovie();
const kdown = (k) => h.key('keydown', { key: k, preventDefault() {} });
const freeze = () => { st.spawnTimer = 1e9; st.wave.midAt = st.time + 1e9; };
function startRunAs(pilot, wave) {
  prof.equippedCharacter = pilot;
  T.startRun(); h.pump(2); freeze();
  st.wave.num = wave;
  st.wave.endsAt = st.time + 1e9;
  st.player.invuln = 1e6;
}
function bossCast() {
  st.wave.endsAt = st.time;
  let g = 0;
  while (!(st.wave.bosses || []).some(b => b.hp > 0) && g++ < 1800) h.pump(1);
  st.wave.endsAt = st.time + 1e9;
  return st.wave.bosses.slice();
}
function kill(bosses) {
  for (const b of bosses) b.hp = 0;
  let g = 0;
  while (!st.portal && g++ < 600) h.pump(1, () => { st.player.invuln = 1e6; });
  assert.ok(st.portal, 'the portal opened');
}

// ---- 5. the boss death with no beat (round 8: the portal beat is gone) ----------------------
// Every boss dies its own death on the field (the fold and the puff), as
// every enemy does; nothing marks a boss quiet, no slow beat holds the field,
// the pads stay, and the portal movie waits for the walk-in.
function walkInAndPass() {
  let g = 0;
  while ((st.mode === 'playing' || st.mode === 'draft' || st.mode === 'evolve') && g++ < 1200) {
    if (st.mode !== 'playing') kdown('1');
    else if (st.portal) { st.player.x = st.portal.x; st.player.y = st.portal.y; }
    h.pump(1, () => { st.player.invuln = 1e6; });
  }
  assert.equal(st.mode, 'portal-cine', 'the walk-in starts the portal movie');
  h.skipMovie(); T.uiGuard.standDown();
  if (st.mode === 'intermission') { kdown('c'); h.skipMovie(); T.uiGuard.standDown(); }
}
S.check('a double wave: the boss that fell and the swept one each die their own death', () => {
  startRunAs('PALADIN', 3);
  const cast = bossCast();
  assert.ok(cast.length >= 2, 'wave 3 brings two bosses: ' + cast.length);
  const [fell, swept] = cast;
  // Stand both by the hero: a death far off screen leaves no mark at all.
  fell.x = st.player.x + 40; fell.y = st.player.y;
  swept.x = st.player.x - 40; swept.y = st.player.y;
  h.pump(2, () => { st.player.invuln = 1e6; fell.x = st.player.x + 40; fell.y = st.player.y; swept.x = st.player.x - 40; swept.y = st.player.y; });
  kill([fell]);
  h.pump(3, () => { st.player.invuln = 1e6; });
  assert.ok(!('quietDeath' in fell) && !('quietDeath' in swept), 'no boss is marked quiet');
  assert.ok(!st.enemies.includes(swept), 'the clear swept the other boss');
  const f = st.feel;
  const marks = (e) => f.corpses.some(c => c.e === e);
  assert.ok(marks(fell) || f.puffs.some(p => p.cls === 3), 'the boss that fell folds on the field: corpses ' + f.corpses.length);
  assert.ok(marks(swept) || f.puffs.some(p => p.cls === 3), 'the swept boss leaves its own death on the field');
  if (marks(fell) || marks(swept)) assert.ok(marks(fell) && marks(swept), 'both fold, not one');
  walkInAndPass();
});
S.check('a boss kill holds no beat: no slow time past its own moment, the pads stay, the vitals stay put', () => {
  startRunAs('ROGUE', 2);
  st.pendingDrafts = 0;
  const [boss] = bossCast();
  kill([boss]);
  st.pendingDrafts = 0; st.jokerOffers = 0;
  h.pump(45, () => { st.player.invuln = 1e6; st.pendingDrafts = 0; });
  let g = 0;
  while ((st.mode === 'draft' || st.mode === 'evolve') && g++ < 20) { kdown('1'); h.pump(1); }
  assert.equal(st.mode, 'playing');
  assert.equal(st.timeScale, 1, 'the field runs at full speed after the kill\'s own moment');
  assert.equal(T.chromeOn(), true, 'the pads, cog and ? stay up');
  const touch = el['touch'];
  assert.equal(touch.style.display, '', 'the pads keep their room');
  assert.equal(touch.style.visibility, '', 'and are shown');
  assert.equal(st.barHudDrop | 0, 0, 'no bars push the vitals down');
  walkInAndPass();
});

// ---- 6. the death freeze ---------------------------------------------------------------------
function dieByContact(typeId) {
  startRunAs('ROGUE', 3);
  const p = st.player;
  const e = makeTypedEnemy(typeId, p.x + 6, p.y, st.time);
  e.speed = 0;
  st.enemies.push(e);
  p.hp = 1; p.invuln = 0; p.potions.hp = 0;
  let g = 0;
  while (st.mode !== 'death-cine' && g++ < 120) h.pump(1, () => { e.x = p.x + 6; e.y = p.y; });
  assert.equal(st.mode, 'death-cine', 'died to the ' + typeId);
  return e;
}
S.check('the frozen frame is the world without the HUD; the killer is drawn over the hero; it is let go at the end', () => {
  const cv = el['game'];
  const w0 = cv.width, h0 = cv.height;
  cv.width = 480; cv.height = 300;   // a canvas that can be copied
  try {
    st.bossBanner = { names: ['X'], verb: 'APPROACHES', title: 'THE BOSS', sub: 'SUB', ttl: 2 };
    dieByContact('CHASER');
    // The copy must be of a frame drawn NOW, in the movie's mode (no HUD, no banner): the last
    // frame left on the canvas had both. So the world is drawn once more before the copy.
    const render0 = T.renderer.render;
    const draws = [];
    T.renderer.render = function (...a) { draws.push(st.mode); return render0.apply(this, a); };
    try { h.pump(1); } finally { T.renderer.render = render0; }
    assert.ok(draws.includes('death-cine'), 'the world was drawn again for the copy, in the movie\'s mode: ' + JSON.stringify(draws));
    const f = T.movies.current.opts.freeze;
    assert.ok(f.snap, 'the frame was copied');
    assert.equal(f.hudInShot, false, 'with no HUD and no banner in it');
    h.pump(20);
    assert.equal(f.cutout, true, 'the killer standing on the hero is drawn over the hero');
    T.deathCine.end();
    assert.equal(st.mode, 'dead');
    assert.equal(T.movies.current.opts.freeze.snap, null, 'the copy is let go');
  } finally { cv.width = w0; cv.height = h0; }
});

S.check('a shooter dead before its shot landed: no box, and the caption says it is dead', () => {
  T.uiGuard.standDown();
  startRunAs('ROGUE', 2);
  const p = st.player;
  const shooter = makeTypedEnemy('SPITTER', p.x + 90, p.y - 40, st.time);
  st.enemies.push(shooter);
  shooter.hp = 0;
  for (let i = 0; i < 10 && st.enemies.includes(shooter); i++) h.pump(1);
  p.hp = 1; p.invuln = 0; p.potions.hp = 0;
  st.enemyShots.push({ x: p.x, y: p.y, vx: 0, vy: 0, damage: 999, age: 0, kind: 'spit',
    src: { typeId: 'SPITTER', bossId: null, name: null, midBoss: false }, from: shooter });
  for (let i = 0; i < 10 && st.mode !== 'death-cine'; i++) h.pump(1);
  assert.equal(st.mode, 'death-cine');
  const o = T.movies.current.opts;
  assert.equal(o.freeze.killer, null, 'no box over empty ground');
  assert.equal(o.freeze.killerGone, true);
  const r = recorder();
  DCINE.render(r.g, 300, 'shot', o);
  const all = r.texts.map(x => x.t).join('|');
  assert.ok(all.includes('SPITTER') && all.includes('now dead'), all);
  T.deathCine.end();
});

// ---- 7. the escape, unattended ----------------------------------------------------------------
S.check('an unattended escape is not counted as seen', () => {
  T.uiGuard.standDown();
  const e0 = T.movies.seen('escape');
  T.auto.on = true;
  T.setPilotMode('AUTO_ALL');
  T.auto.runsInRow = 0;
  T.auto.restart();
  T.auto.runsInRow = 0;   // the first run of a chain: the escape still plays
  h.pump(2); freeze(); st.wave.endsAt = st.time + 1e9; st.player.invuln = 1e6;
  assert.equal(st.unattended, true);
  const [boss] = bossCast();
  kill([boss]);
  let g = 0, sawEscape = false;
  const modes = new Set();
  while (st.mode !== 'intermission' && g++ < 3600) {
    if (st.portal) { st.player.x = st.portal.x; st.player.y = st.portal.y; }
    h.pump(1, () => { modes.add(st.mode); if (st.mode === 'escape') sawEscape = true; st.player.invuln = 1e6; });
  }
  assert.ok(sawEscape, 'the escape played: ' + [...modes].join(',') + ' wave ' + st.wave.num + ' rows ' + T.auto.runsInRow);
  assert.equal(T.movies.seen('escape'), e0, 'not counted');
  T.auto.on = false;
});

S.done();
