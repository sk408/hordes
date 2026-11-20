// Round 8: the portal movie is back, and the road shot keeps its place.
// Steve: "I like the portal movie. I think it should play the first boss each
// time." He chose: the full movie (6.9 s) at the first portal of each run, the
// short one (3.5 s) at later portals in the same run, and the 2.5 s beat on
// the battlefield removed.
//   1. the road shot's module (src/road_shot.js).
//   2. the real game, wave 2: the kill plays out on the field (no movie, no
//      slow beat), the cards open at the kill, the walk-in starts the movie in
//      full with the run's pilot and the boss killed, the bed ducks under the
//      portal cue, then the intermission; CONTINUE plays the road shot.
//   3. a later portal in the same run is the short movie (a double wave whose
//      first boss falls alone: it plays, the survivor is swept, the wave clears
//      once); a new run shows the full movie again; a road shot never counts.
//   4. the skip rule on the movie (key and tap), and a skip of one never skips
//      the other; a hidden tab and an unattended run; wave 1's chase.
//   5. reduced motion, the cue's tail, the Maw after the last wave's movie.
//   6. no beat is left (module, import, state, seam, precache).
// Run: node test/test_portal_movie.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { boot, suite } from './_harness.mjs';
import { mulberry32 } from '../src/weather.js';
import { stageOf } from '../src/stages.js';
import * as CINE from '../src/portal_cine.js';
import * as ROAD from '../src/road_shot.js';
import { CONFIG as C } from '../src/config.js';

Math.random = mulberry32(20261119);
const S = suite('R2 round 8: the portal movie and the road shot');

function recorder() {
  const rects = [], texts = [];
  let style = null;
  const g = {
    set fillStyle(v) { style = v; }, get fillStyle() { return style; },
    globalAlpha: 1, font: '', textAlign: '', textBaseline: '',
    fillRect(x, y, w, h) { rects.push({ x, y, w, h, style }); },
    fillText(t) { texts.push(String(t)); },
    measureText: (s) => ({ width: String(s).length * 5 }),
    save() {}, restore() {}, translate() {}, scale() {}, beginPath() {}, arc() {}, fill() {},
    drawImage() {}, createLinearGradient: () => ({ addColorStop() {} }),
  };
  return { g, rects, texts };
}

// ---- 1. the road shot's module ----------------------------------------------------
S.check('the road shot: 1.5 s of the next stage, its name, nobody chasing; reduced motion holds a still', () => {
  assert.equal(ROAD.DURATION, 1.5);
  assert.ok(!ROAD.isDone(1.49) && ROAD.isDone(1.5));
  const sc = ROAD.sceneFor({ seed: 7, stage: 'ASHEN_WASTE', character: 'WITCH' });
  assert.equal(sc.stage, 'ASHEN_WASTE'); assert.equal(sc.character, 'WITCH');
  assert.equal(sc.horde.length, 0, 'no horde on the road');
  const k = recorder();
  ROAD.render(k.g, 0.8, { scene: sc, name: 'ASHEN WASTE' });
  assert.ok(k.texts.includes('ASHEN WASTE') && k.texts.includes('NEXT STAGE'), k.texts.join('|'));
  assert.ok(k.rects.length > 100, 'the road is drawn');
  assert.equal(ROAD.blackAt(0), 1); assert.equal(ROAD.blackAt(0.8), 0); assert.equal(ROAD.blackAt(1.5), 1);
  const s1 = recorder(), s2 = recorder();
  ROAD.render(s1.g, 0.1, { scene: sc, name: 'X', reduced: true });
  ROAD.render(s2.g, 1.2, { scene: sc, name: 'X', reduced: true });
  assert.deepEqual(s1.rects.map(r => r.style + r.x + r.y), s2.rects.map(r => r.style + r.x + r.y), 'a still card');
  const v = recorder();
  ROAD.render(v.g, 0.8, { scene: ROAD.sceneFor({ seed: 7, stage: 'SNOWFIELD', character: 'WITCH' }), name: 'S' });
  const cols = (r) => new Set(r.rects.map(x => x.style));
  assert.notDeepEqual([...cols(k)].sort(), [...cols(v)].sort(), 'the next stage\'s own colours');
});

// ---- 2. the real game -------------------------------------------------------------
const h = await boot({ storage: [['hordes_onboarded', '1']] });
const T = h.T, st = h.state, el = h.elements;
T.banners.suppressAll();
const prof = T.getProfile();
const kdown = (k) => h.key('keydown', { key: k, preventDefault() {} });
const tap = (x, y) => el['game']._ev.pointerdown({ clientX: x, clientY: y, stopPropagation() {}, preventDefault() {} });
function frameTexts() { h.rec.on = true; h.rec.texts.length = 0; h.pump(1); h.rec.on = false; return h.rec.texts.map(t => t.txt); }
const PC = T.portalCine;

// Each music cue main.js asks for (with its options), and each cue fade.
const audioLog = [];
{
  const real = T.audio.get();
  T.audio.set({
    ...real,
    playMusicCue(slot, opts) { audioLog.push({ slot, opts: opts || {}, mode: st.mode }); return real.playMusicCue(slot, opts); },
    fadeMusicCues() { audioLog.push({ fade: true, mode: st.mode }); if (real.fadeMusicCues) real.fadeMusicCues(); },
  });
}

h.skipMovie();   // the intro
const freeze = () => { st.spawnTimer = 1e9; st.wave.midAt = st.time + 1e9; };
function startRunAs(pilot, wave) {
  prof.equippedCharacter = pilot;
  T.startRun(); h.pump(2); freeze();
  setWave(wave);
}
function setWave(wave) {
  st.wave.num = wave;
  st.wave.endsAt = st.time + 1e9;
  st.player.invuln = 1e6;
}
// Spawn the wave's boss cast through the real path.
function bossCast() {
  st.wave.endsAt = st.time;
  let g = 0;
  while (!(st.wave.bosses || []).some(b => b.hp > 0) && g++ < 1800) h.pump(1);
  st.wave.endsAt = st.time + 1e9;
  return st.wave.bosses.slice();
}
// Kill the listed bosses in one frame, through the real reap.
function kill(bosses) {
  for (const b of bosses) b.hp = 0;
  let g = 0;
  while (!st.portal && g++ < 600) h.pump(1, () => { st.player.invuln = 1e6; });
  assert.ok(st.portal, 'the portal opened');
}
// The pilot walks in (moved onto the portal each frame); drafts on the way
// are picked. Returns the modes seen, in order.
function walkIn(max = 1200) {
  const seq = [st.mode];
  let n = 0;
  while ((st.mode === 'playing' || st.mode === 'draft' || st.mode === 'evolve') && n++ < max) {
    if (st.mode !== 'playing') kdown('1');
    else if (st.portal) { st.player.x = st.portal.x; st.player.y = st.portal.y; }
    h.pump(1, () => { st.player.invuln = 1e6; });
    if (seq[seq.length - 1] !== st.mode) seq.push(st.mode);
  }
  return seq;
}
// Let the movie in 'portal-cine' play out; the frames it took.
function playOut(max = 900) {
  let n = 0;
  while (st.mode === 'portal-cine' && n++ < max) h.pump(1);
  return n;
}
const near = (n, ms) => Math.abs(n - ms * 60 / 1000) <= 3;

S.check('wave 2: the kill plays on the field, the walk-in starts the full movie with the run\'s pilot and the boss killed', () => {
  startRunAs('PALADIN', 2);
  const [boss] = bossCast();
  audioLog.length = 0;
  kill([boss]);
  assert.ok(['playing', 'draft', 'evolve'].includes(st.mode), 'the fight goes on at the kill (or a card it earned): ' + st.mode);
  assert.equal(PC.live, null, 'no movie at the kill');
  if (st.mode === 'playing') assert.equal(T.chromeOn(), true, 'the pads stay up at the kill');
  assert.notEqual(T.music.scene(), 'portal', 'no duck at the kill');
  assert.ok(!audioLog.some(a => a.slot === 'portal'), 'no portal cue at the kill');
  const seq = walkIn();
  assert.equal(st.mode, 'portal-cine', 'the walk-in starts the movie: ' + seq.join('>'));
  assert.equal(PC.live, 'portal');
  const m = T.movies.current;
  assert.equal(m.kind, 'portal');
  assert.equal(m.opts.boss.id, boss.bossId, 'the boss whose death won the wave');
  assert.equal(m.opts.hero.id, 'PALADIN', 'the run\'s pilot');
  assert.equal(m.opts.repeat, false, 'the first portal of the run: in full');
  assert.equal(PC.duration, CINE.CINE_DURATION);
  assert.equal(T.music.scene(), 'portal', 'the bed ducks for the movie');
  assert.ok(audioLog.some(a => a.slot === 'portal' && a.mode === 'portal-cine'), 'the portal cue plays with the movie');
  assert.equal(T.chromeOn(), false, 'no pads over the movie');
  // The movie owns the canvas: no HUD text is drawn over it.
  h.pump(20);
  const tx = frameTexts().filter(t => t !== 'SKIP');
  assert.deepEqual(tx, [], 'nothing of the fight\'s HUD over the movie: ' + tx.join('|'));
  const simT = st.time;
  const frames = 21 + playOut();
  assert.ok(near(frames, CINE.CINE_DURATION), 'the full movie, 6.9 s: ' + frames + ' frames');
  assert.equal(st.time, simT, 'the fight waited during the movie');
  assert.equal(st.mode, 'intermission', 'then the intermission');
  assert.equal(T.movies.runSeen('portal'), 1, 'counted in this run');
  assert.notEqual(T.music.scene(), 'portal', 'the duck is over');
});

S.check('CONTINUE after wave 2 plays the road shot; it is not counted as a portal movie', () => {
  assert.equal(st.mode, 'intermission');
  const from = st.stage;
  const road0 = T.movies.seen('road');
  kdown('c');
  assert.equal(st.mode, 'portal-cine', 'the road shot plays');
  assert.equal(PC.live, 'road');
  assert.notEqual(st.stage, from, 'the run is already on the next stage');
  assert.equal(st.wave.num, 3);
  const m = T.movies.current;
  assert.equal(m.kind, 'road');
  assert.equal(m.opts.repeat, false, 'the road shot has no short form');
  assert.equal(T.roadShot.name, String(stageOf(st.stage).name).toUpperCase());
  assert.equal(m.opts.scene.stage, st.stage);
  assert.equal(T.music.scene(), 'run', 'the road shot plays the new stage\'s bed, not the portal duck');
  const simT = st.time;
  h.pump(20);
  assert.ok(frameTexts().includes(T.roadShot.name), 'the name is drawn');
  // The seam's clock is the shot playing, not the portal movie that came before.
  assert.ok(Math.abs(PC.t - T.roadShot.t) < 1, 'portalCine.t is the road shot\'s clock: ' + PC.t + ' vs ' + T.roadShot.t);
  const n = 21 + playOut(300);
  assert.equal(st.mode, 'playing');
  assert.ok(near(n, ROAD.DURATION * 1000), 'about 1.5 s: ' + n + ' frames');
  assert.ok(st.time - simT < 0.1, 'the sim waited during the shot');
  assert.equal(T.movies.seen('road'), road0 + 1);
  assert.equal(T.movies.runSeen('portal'), 1, 'the road shot did not count as a portal movie');
  assert.equal(T.movies.runSeen('road'), 1);
});

S.check('a later portal in the same run is the short movie: a double wave whose first boss falls alone', () => {
  freeze(); setWave(3);
  const cast = bossCast();
  assert.equal(cast.length, 2, 'wave 3 is a double wave');
  const clears = [];
  const wave0 = st.wave.num;
  kill([cast[1]]);
  assert.ok(!(st.wave.bosses || []).some(b => b.hp > 0) && !st.enemies.includes(cast[0]), 'the survivor was swept');
  const seq = walkIn();
  assert.equal(st.mode, 'portal-cine', 'the movie plays on a double wave: ' + seq.join('>'));
  assert.equal(T.movies.current.opts.boss.id, cast[1].bossId, 'showing the one that fell');
  assert.equal(T.movies.current.opts.repeat, true, 'seen in this run: the short form');
  assert.equal(PC.duration, CINE.REPEAT_DURATION);
  const n = playOut();
  assert.ok(near(n, CINE.REPEAT_DURATION), 'the short movie, 3.5 s: ' + n + ' frames');
  assert.equal(st.mode, 'intermission');
  clears.push(st.wave.num);
  // The wave cleared once: nothing reopens the portal or the movie.
  h.pump(30);
  assert.equal(st.mode, 'intermission');
  assert.equal(st.wave.cinePending, false);
  kdown('c');
  assert.equal(st.wave.num, wave0 + 1, 'CONTINUE moves one wave on');
  assert.equal(st.mode, 'playing', 'no road shot without a stage change');
  assert.equal(T.movies.runSeen('portal'), 2);
});

S.check('a new run shows the full movie again', () => {
  startRunAs('WITCH', 2);
  assert.equal(T.movies.runSeen('portal'), 0, 'a new run starts its own count');
  const [boss] = bossCast();
  kill([boss]);
  walkIn();
  assert.equal(st.mode, 'portal-cine');
  assert.equal(T.movies.current.opts.repeat, false, 'in full again');
  assert.equal(T.movies.current.opts.hero.id, 'WITCH');
  playOut();
  assert.equal(st.mode, 'intermission');
  kdown('c'); h.skipMovie(); T.uiGuard.standDown();
});

S.check('the cards a kill earns open at the kill, during play, never after the movie', () => {
  startRunAs('ROGUE', 2);
  const [boss] = bossCast();
  st.player.xp = st.player.xpNext;   // the kill's own gems level the hero
  kill([boss]);
  const seq = [st.mode];
  let n = 0;
  while (st.mode !== 'intermission' && n++ < 1500) {
    if (st.mode === 'draft' || st.mode === 'evolve') kdown('1');
    else if (st.mode === 'playing' && st.portal) { st.player.x = st.portal.x; st.player.y = st.portal.y; }
    h.pump(1, () => { st.player.invuln = 1e6; });
    if (seq[seq.length - 1] !== st.mode) seq.push(st.mode);
  }
  assert.ok(seq.indexOf('draft') >= 0 && seq.indexOf('draft') < seq.indexOf('portal-cine'), 'the level-up card came before the movie: ' + seq.join('>'));
  assert.equal(seq.filter(m => m === 'draft' || m === 'evolve').length > 0 && seq.lastIndexOf('draft') < seq.indexOf('portal-cine'), true, 'no card after the movie: ' + seq.join('>'));
  assert.equal(st.pendingDrafts, 0, 'no draft rides into the intermission');
  kdown('c'); h.skipMovie(); T.uiGuard.standDown();
});

// ---- 4. the skip rule, and the two movies kept apart -------------------------------
S.check('the movie takes the one skip rule by key; a skip of the movie never skips the road shot', () => {
  startRunAs('ROGUE', 2);
  const [boss] = bossCast();
  kill([boss]);
  walkIn();
  assert.equal(PC.live, 'portal');
  audioLog.length = 0;
  kdown('Escape');
  assert.equal(T.movies.current.skip.ask, 0, 'a press in the first moments is ignored');
  h.pump(30);
  kdown('Escape');
  assert.equal(st.mode, 'portal-cine', 'the first press only shows SKIP');
  assert.ok(T.movies.current.skip.ask > 0 && frameTexts().includes('SKIP'));
  h.key('keydown', { key: ' ', repeat: true, preventDefault() {} });
  assert.equal(st.mode, 'portal-cine', 'a held key is not a second press');
  kdown('Enter');
  assert.equal(st.mode, 'intermission', 'the second press skips to the intermission');
  assert.equal(T.uiGuard.armed(), true, 'and the next screen is guarded');
  assert.ok(audioLog.some(a => a.fade), 'the skipped movie\'s cue fades with it');
  T.uiGuard.standDown();
  kdown('c');
  assert.equal(PC.live, 'road', 'the road shot still plays');
  assert.equal(T.movies.current.skip.ask, 0, 'with a skip of its own');
  h.pump(5);
  assert.equal(st.mode, 'portal-cine', 'not skipped by the movie\'s skip');
  h.pump(25);
  kdown('Escape');
  assert.equal(st.mode, 'portal-cine');
  kdown('Escape');
  assert.equal(st.mode, 'playing', 'the road shot skips by its own two presses');
  assert.equal(T.movies.runSeen('portal'), 1, 'one portal movie in this run');
  T.uiGuard.standDown();
  // The next portal in this run is the short movie; skipping the road shot did not touch it.
  freeze(); setWave(3);
  kill(bossCast());
  walkIn();
  assert.equal(PC.live, 'portal');
  assert.equal(T.movies.current.opts.repeat, true);
  h.skipMovie(); T.uiGuard.standDown();
  kdown('c'); T.uiGuard.standDown();
});

S.check('a tap shows SKIP and a tap on SKIP skips the movie (MANUAL too: the tap is not the stick)', () => {
  T.setPilotMode('MANUAL');
  startRunAs('ROGUE', 2);
  const [boss] = bossCast();
  kill([boss]);
  T.setPilotMode('AUTO_ALL');
  walkIn();
  T.setPilotMode('MANUAL');
  assert.equal(PC.live, 'portal');
  h.pump(30);
  tap(240, 150);
  assert.ok(st.mode === 'portal-cine' && T.movies.current.skip.ask > 0, 'the first tap shows SKIP');
  tap(455, 8);
  assert.equal(st.mode, 'intermission', 'a tap on SKIP skips');
  T.uiGuard.standDown();
  T.setPilotMode('AUTO_ALL');
  kdown('c'); h.skipMovie(); T.uiGuard.standDown();
});

S.check('a hidden tab passes the movie by, uncounted; an unattended run has none', () => {
  startRunAs('WITCH', 2);
  let [boss] = bossCast();
  kill([boss]);
  const seen = T.movies.seen('portal');
  const hide = (on) => { document.visibilityState = on ? 'hidden' : 'visible'; document.hidden = on; T.onVisibilityChange(); };
  // The walk-in happens while the tab is hidden (background play).
  st.player.x = st.portal.x; st.player.y = st.portal.y;
  hide(true);
  try {
    for (let i = 0; i < 80 && st.mode !== 'intermission'; i++) {
      if (st.mode === 'draft' || st.mode === 'evolve') kdown('1');   // a card the kill earned
      if (st.portal) { st.player.x = st.portal.x; st.player.y = st.portal.y; }
      h.advanceClock(50); T.bg.tick(performance.now());
    }
  } finally { hide(false); }
  h.pump(1);
  assert.equal(st.mode, 'intermission', 'the hidden tab went past the movie');
  assert.equal(T.movies.seen('portal'), seen, 'not counted');
  assert.equal(T.movies.runSeen('portal'), 0, 'and not counted in the run: the next one is in full');
  kdown('c'); h.skipMovie(); T.uiGuard.standDown();
  // Unattended: the next run is the auto pilot's own.
  T.auto.on = true;
  T.auto.runsInRow = 1;
  T.auto.restart();
  h.pump(2); freeze(); setWave(2);
  assert.equal(st.unattended, true);
  [boss] = bossCast();
  kill([boss]);
  const seq = walkIn();
  assert.equal(st.mode, 'intermission', 'no movie when nobody watches: ' + seq.join('>'));
  assert.ok(!seq.includes('portal-cine'));
  assert.equal(T.movies.seen('portal'), seen, 'not counted');
  T.auto.on = false;
});

S.check('wave 1 has no portal movie: the walk-in goes straight to the escape chase', () => {
  T.auto.on = false;
  startRunAs('ROGUE', 1);
  const [boss] = bossCast();
  kill([boss]);
  const seq = walkIn();
  assert.equal(st.mode, 'escape', seq.join('>'));
  h.skipMovie();
  assert.equal(st.mode, 'intermission');
  assert.equal(T.movies.runSeen('portal'), 0, 'the chase is not a portal movie');
  kdown('c'); h.skipMovie(); T.uiGuard.standDown();
});

// ---- 5. reduced motion, the cue, the Maw ---------------------------------------------
S.check('reduced motion: the movie is its still card', () => {
  const mm = window.matchMedia;
  window.matchMedia = (q) => ({ matches: /prefers-reduced-motion/.test(String(q)) });
  try {
    startRunAs('WITCH', 2);
    const [boss] = bossCast();
    kill([boss]);
    walkIn();
    assert.equal(PC.live, 'portal');
    assert.equal(T.movies.current.opts.reduced, true, 'the still card');
    assert.equal(PC.duration, CINE.STILL_DURATION);
    const n = playOut();
    assert.ok(near(n, CINE.STILL_DURATION), '1.5 s: ' + n + ' frames');
    assert.equal(st.mode, 'intermission');
  } finally { window.matchMedia = mm; }
  kdown('c'); h.skipMovie(); T.uiGuard.standDown();
});

S.check('the cue: the full movie holds all of it; the short one fades it as it ends', () => {
  startRunAs('WITCH', 2);
  kill(bossCast());
  walkIn();
  audioLog.length = 0;
  // (the cue was asked for at the walk-in; this run's first movie)
  playOut();
  assert.equal(st.mode, 'intermission');
  kdown('c'); h.skipMovie(); T.uiGuard.standDown();
  freeze(); setWave(3);
  kill(bossCast());
  audioLog.length = 0;
  walkIn();
  assert.ok(audioLog.some(a => a.slot === 'portal'), 'the short movie has the cue too');
  const iCue = audioLog.findIndex(a => a.slot === 'portal');
  playOut();
  assert.equal(st.mode, 'intermission');
  const iFade = audioLog.findIndex(a => a.fade);
  assert.ok(iFade > iCue && audioLog[iFade].mode === 'portal-cine', 'the cue fades as the short movie ends, before the intermission');
  kdown('c'); T.uiGuard.standDown();
});

S.check('the last wave: the movie plays, then the Maw', () => {
  startRunAs('WITCH', C.ESCALATION.END_WAVE);
  bossCast();
  kill(st.wave.bosses.filter(b => b.hp > 0));
  const seq = walkIn();
  assert.equal(st.mode, 'portal-cine', seq.join('>'));
  playOut();
  assert.equal(st.mode, 'finale', 'the Maw comes after the movie');
});

// ---- 6. no beat is left -----------------------------------------------------------
S.check('no beat is left: no module, no import, no state, no seam, no precache entry', () => {
  assert.equal(fs.existsSync(new URL('../src/portal_beat.js', import.meta.url)), false, 'src/portal_beat.js is gone');
  const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.ok(!/portal_beat|portalBeat|beatLive|beatHudDrop|quietDeath/.test(main), 'main.js names no beat');
  const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  assert.ok(!sw.includes('portal_beat'), 'sw.js does not precache it');
  assert.ok(sw.includes('src/portal_cine.js'), 'sw.js precaches the movie');
  assert.equal(T.portalBeat, undefined, 'no test seam');
  assert.ok(!('beatHudDrop' in st), 'no state');
  for (const f of ['src/fx/feel.js', 'src/render.js', 'src/audio.js', 'src/movie_cast.js']) {
    const s = fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    assert.ok(!/portal_beat|quietDeath|beatHudDrop/.test(s), f + ' names no beat');
  }
});

S.done();
