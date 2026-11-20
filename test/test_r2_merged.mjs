// HORDES - the four R2 changes played together (the death movie, the portal
// beat, the intro, the actor animation). Each check pins a defect the merged
// review found where two of them met:
//   1. the title painting paints in runs (one long frame as the title came up)
//   2. the death pop is a small capped star, and none under reduced motion
//   3. the death caption keeps a readable size on a phone held upright
//   4. the intro's clock waits while the tab is hidden
//   5. the portal beat: its boss dies once (no corpse, no puff under it), it
//      is drawn under the HUD with the vitals stepped below its bar, the pads
//      hide without moving the canvas, and a skip ends its slow time
//   6. the death freeze is the world without the HUD, the killer is drawn
//      over the hero in a contact death, a dead shooter is said to be dead,
//      and the copy is let go when the movie ends
//   7. an unattended escape is not counted as seen
// Run: node test/test_r2_merged.mjs
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';
import { mulberry32 } from '../src/weather.js';
import * as BEAT from '../src/portal_beat.js';
import * as DCINE from '../src/death_cine.js';
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
  const dur = mo.opts.returning ? 1000 : 5000;
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

// ---- 5. the portal beat ----------------------------------------------------------------------
S.check('a double wave: the boss that fell is the beat\'s, the swept one dies its own death', () => {
  startRunAs('PALADIN', 3);
  const cast = bossCast();
  assert.ok(cast.length >= 2, 'wave 3 brings two bosses: ' + cast.length);
  const [fell, swept] = cast;
  // Stand both by the hero: a death far off screen leaves no mark at all.
  fell.x = st.player.x + 40; fell.y = st.player.y;
  swept.x = st.player.x - 40; swept.y = st.player.y;
  h.pump(2, () => { st.player.invuln = 1e6; fell.x = st.player.x + 40; fell.y = st.player.y; swept.x = st.player.x - 40; swept.y = st.player.y; });
  kill([fell]);
  assert.ok(T.portalBeat.live, 'the beat is up');
  h.pump(3, () => { st.player.invuln = 1e6; });
  assert.equal(fell.quietDeath, true, 'the boss that fell dies in the beat only');
  assert.ok(!swept.quietDeath, 'the swept boss is not quiet');
  assert.ok(!st.enemies.includes(swept), 'the clear swept the other boss');
  const f = st.feel;
  assert.ok(!f.corpses.some(c => c.e === fell), 'no corpse of the boss the beat draws');
  assert.ok(f.corpses.some(c => c.e === swept) || f.puffs.some(p => p.cls === 3),
    'the swept boss leaves its own death on the field: corpses ' + f.corpses.length + ', puffs ' + f.puffs.length);
  let g = 0;
  while (T.portalBeat.live && g++ < 400) h.pump(1, () => { st.player.invuln = 1e6; });
});
S.check('reduced motion: the beat is a still card, so its boss keeps a death on the field', () => {
  const mm0 = globalThis.window.matchMedia;
  globalThis.window.matchMedia = (q) => ({ matches: /prefers-reduced-motion/.test(String(q)), addEventListener() {}, removeEventListener() {} });
  try {
    startRunAs('PALADIN', 2);
    const [boss] = bossCast();
    boss.x = st.player.x + 40; boss.y = st.player.y;
    h.pump(2, () => { st.player.invuln = 1e6; boss.x = st.player.x + 40; boss.y = st.player.y; });
    kill([boss]);
    assert.ok(T.portalBeat.live, 'the beat is up');
    assert.ok(!boss.quietDeath, 'not quiet: nothing else would show the boss dying');
    let g = 0;
    while (T.portalBeat.live && g++ < 400) h.pump(1, () => { st.player.invuln = 1e6; });
  } finally { globalThis.window.matchMedia = mm0; }
});
S.check('the beat\'s boss dies once: no fold and no puff of its own under the beat', () => {
  startRunAs('PALADIN', 2);
  const [boss] = bossCast();
  kill([boss]);
  assert.ok(T.portalBeat.live, 'the beat is up');
  h.pump(30, () => { st.player.invuln = 1e6; });
  const f = st.feel;
  assert.ok(!f.corpses.some(c => c.e === boss), 'no corpse of the boss');
  assert.ok(!f.puffs.some(p => p.cls === 3), 'no boss puff');
  // The run goes on: walk to the end of the beat.
  let g = 0;
  while (T.portalBeat.live && g++ < 400) h.pump(1, () => { st.player.invuln = 1e6; });
});

S.check('the beat is drawn under the HUD, the vitals step below its bar, the pads keep their room', () => {
  startRunAs('ROGUE', 2);
  const [boss] = bossCast();
  kill([boss]);
  let g = 0;
  while (T.portalBeat.live && T.portalBeat.t < 1.0 && g++ < 200) h.pump(1, () => { st.player.invuln = 1e6; });
  assert.ok(T.portalBeat.live && BEAT.barsAt(T.portalBeat.t) === 1, 'the bars are in');
  const R = T.renderer;
  const orig = R.drawPlayHud;
  let hudAt = -1;
  R.drawPlayHud = function (gg, s) { hudAt = h.rec.rects.length; return orig.call(this, gg, s); };
  h.rec.on = true; h.rec.rects.length = 0; h.pump(1, () => { st.player.invuln = 1e6; }); h.rec.on = false;
  R.drawPlayHud = orig;
  const bar = h.rec.rects.findIndex(q => q.x === 0 && q.y === 0 && q.w === 480 && q.h === BEAT.BAR);
  assert.ok(bar >= 0 && hudAt >= 0, 'the top bar and the HUD were drawn: ' + bar + ' ' + hudAt);
  assert.ok(bar < hudAt, 'the top bar is drawn before the HUD: bar ' + bar + ', HUD from ' + hudAt);
  const vb = R.hudChrome && R.hudChrome.vitals;
  assert.ok(vb && vb.y >= BEAT.BAR, 'the vitals block sits below the bar: y ' + (vb && vb.y));
  const touch = el['touch'];
  assert.equal(touch.style.display, '', 'the pads keep their room in the layout');
  assert.equal(touch.style.visibility, 'hidden', 'and are hidden for the beat');
  while (T.portalBeat.live && g++ < 400) h.pump(1, () => { st.player.invuln = 1e6; });
  h.pump(2);
  if (st.mode === 'playing') assert.equal(touch.style.visibility, '', 'the pads come back');
});

S.check('a skipped beat takes its slow time with it', () => {
  startRunAs('WITCH', 2);
  st.pendingDrafts = 0;
  const [boss] = bossCast();
  kill([boss]);
  st.pendingDrafts = 0; st.jokerOffers = 0;
  let g = 0;
  while (T.portalBeat.t < 0.45 && g++ < 200) h.pump(1, () => { st.player.invuln = 1e6; st.pendingDrafts = 0; });
  assert.ok(st.timeScale < 1, 'slow time is on: ' + st.timeScale);
  kdown('Escape'); kdown('Escape');
  assert.ok(T.portalBeat.done, 'the beat was skipped');
  h.pump(2, () => { st.player.invuln = 1e6; });
  assert.equal(st.timeScale, 1, 'the field runs at full speed again');
  g = 0;
  while ((st.mode === 'draft' || st.mode === 'evolve') && g++ < 20) { kdown('1'); h.pump(1); }
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
