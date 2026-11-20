// R2 row 4: the portal movie is a 2.5-second beat on the real battlefield
// (the boss dies in slow time, the portal opens where it fell, the pilot
// walks in), and before a stage change 1.5 s of road shows the next stage.
//   1. the beat's module: its timeline, caption, bars, the boss collapse, the
//      reduced-motion still card; the road shot's module.
//   2. the real game, wave 2: the beat plays in 'playing' mode over the live
//      field, shows the boss killed and the run's pilot, runs the sim in slow
//      time at first, ducks the music, holds the crossing until it ends, and
//      leaves the loot to the sweep and the floor.
//   3. a double wave whose first boss falls while the other lives: the beat
//      plays (it never did before), the survivor is swept.
//   4. the skip rule on the beat: ESC shows SKIP (no pause), ESC again skips.
//   5. a hidden tab ends the beat; an unattended run has none.
//   6. the road shot at CONTINUE on a travel wave: the new stage's name, 1.5 s,
//      then play; a CONTINUE that does not travel has none.
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';
import { mulberry32 } from '../src/weather.js';
import { bossLook } from '../src/movie_cast.js';
import { stageOf } from '../src/stages.js';
import * as BEAT from '../src/portal_beat.js';
import * as ROAD from '../src/road_shot.js';
import { CONFIG as C } from '../src/config.js';

Math.random = mulberry32(20261119);
const S = suite('R2 portal beat and road shot');

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

// ---- 1. the modules ------------------------------------------------------------
S.check('the beat: 2.5 s in three phases, first viewing and repeat alike', () => {
  assert.equal(BEAT.DURATION, 2.5);
  assert.equal(BEAT.durationOf({ repeat: true }), 2.5);
  assert.equal(BEAT.phaseAt(0), 'KILL');
  assert.equal(BEAT.phaseAt(1.0), 'OPEN');
  assert.equal(BEAT.phaseAt(2.0), 'WALK');
  assert.equal(BEAT.phaseAt(2.5), 'END');
  assert.ok(!BEAT.isDone(2.49) && BEAT.isDone(2.5));
  assert.equal(BEAT.SLOW_S, BEAT.PHASES.KILL[1]);
  assert.equal(BEAT.captionOf({ boss: bossLook('PYRAXIS') }), bossLook('PYRAXIS').name.toUpperCase() + ' FALLS');
  // The bars slide in, hold, and slide out by the end.
  assert.equal(BEAT.barsAt(0), 0);
  assert.equal(BEAT.barsAt(1.2), 1);
  assert.equal(BEAT.barsAt(2.5), 0);
  assert.equal(BEAT.barsAt(0, true), 1, 'reduced motion: the bars stand still');
  // The boss sinks and fades over the KILL phase, then it is gone.
  const a = BEAT.bossCollapseAt(0.05), b = BEAT.bossCollapseAt(0.6);
  assert.ok(a.flash && a.squash === 1 && a.alpha === 1);
  assert.ok(b.squash < 0.5 && b.alpha < 1 && !b.flash);
  assert.equal(BEAT.bossCollapseAt(0.9), null);
});

S.check('the beat draws the boss where it fell, the portal opening, the caption; reduced motion is a still card', () => {
  const boss = bossLook('CHOIR_MOTHER');
  const o = { boss, bx: 200, by: 150, px: 200, py: 150, hx: 260, hy: 160, zoom: 1 };
  const k = recorder();
  BEAT.render(k.g, 0.3, o);
  const pal = new Set(Object.values(boss.palette));
  assert.ok(k.rects.some(r => pal.has(r.style)) || k.rects.length > 40, 'the boss is drawn in its own colours');
  assert.ok(k.texts.includes(boss.name.toUpperCase() + ' FALLS'), 'the caption: ' + k.texts.join('|'));
  const open = recorder();
  BEAT.render(open.g, 1.1, o);
  assert.ok(open.rects.some(r => r.style === '#3fe6d2'), 'the portal opens in the reward colour');
  const late = recorder();
  BEAT.render(late.g, 1.1, { ...o, px: null, py: null });
  assert.ok(!late.rects.some(r => r.style === '#3fe6d2'), 'no portal: no opening drawn');
  const walk = recorder();
  BEAT.render(walk.g, 2.0, { ...o, entering: true });
  assert.ok(walk.rects.some(r => r.style === '#fff1d6'), 'the walk in: warm motes into the portal');
  const still = recorder();
  BEAT.render(still.g, 0.3, { ...o, reduced: true });
  assert.ok(still.texts.includes(boss.name.toUpperCase() + ' FALLS'));
  assert.ok(!still.rects.some(r => pal.has(r.style)), 'reduced motion: no collapsing boss');
  assert.ok(!still.rects.some(r => r.style === '#ffffff'), 'reduced motion: no flash');
  const after = recorder();
  BEAT.render(after.g, 2.5, o);
  assert.equal(after.rects.length, 0, 'nothing after the end');
});

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
  // Another stage has another ground.
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
const B = T.portalBeat;

h.skipMovie();   // the intro
const freeze = () => { st.spawnTimer = 1e9; st.wave.midAt = st.time + 1e9; };
function startRunAs(pilot, wave) {
  prof.equippedCharacter = pilot;
  T.startRun(); h.pump(2); freeze();
  st.wave.num = wave;
  st.wave.endsAt = st.time + 1e9;
  st.player.invuln = 1e6;
}
// Spawn the wave's boss cast through the real path; kill the ones listed
// (indexes) in one frame, through the real reap.
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
// The pilot walks in (moved onto the portal each frame, as a test can); count
// the frames until the intermission. Drafts on the way are picked.
function walkIn(max = 1200) {
  let n = 0, play = 0;
  while ((st.mode === 'playing' || st.mode === 'draft' || st.mode === 'evolve') && n++ < max) {
    if (st.mode !== 'playing') { kdown('1'); h.pump(1); continue; }
    if (st.portal) { st.player.x = st.portal.x; st.player.y = st.portal.y; }
    h.pump(1, () => { st.player.invuln = 1e6; });
    play++;
  }
  return play;
}

S.check('wave 2: the beat plays on the live battlefield with the boss killed and the run\'s pilot', () => {
  startRunAs('PALADIN', 2);
  const [boss] = bossCast();
  const at = { x: boss.x, y: boss.y };
  const t0 = st.time;
  kill([boss]);
  assert.equal(st.mode, 'playing', 'no cut away: the game is still playing');
  assert.ok(B.live, 'the beat is up');
  const m = T.movies.current;
  assert.equal(m.kind, 'portal');
  assert.equal(m.opts.boss.id, boss.bossId, 'the boss whose death won the wave');
  assert.equal(m.opts.hero.id, 'PALADIN');
  assert.ok(Math.hypot(m.spot.x - at.x, m.spot.y - at.y) < 1, 'filmed where it fell');
  assert.ok(Math.hypot(st.portal.x - at.x, st.portal.y - at.y) < 40, 'the portal opened on that spot');
  assert.equal(T.music.scene(), 'portal', 'the music ducks for the beat');
  assert.equal(T.chromeOn(), false, 'the pads, cog and ? step down for the beat');
  h.pump(6);
  assert.ok(st.timeScale < 1, 'the boss dies in slow time: ' + st.timeScale);
  assert.ok(st.time > t0, 'the sim runs under the beat');
  h.pump(15);   // the bars are in
  const tx = frameTexts();
  h.pump(25);   // about 0.75 s in: still the slow-time KILL phase
  assert.ok(B.t < BEAT.SLOW_S && st.timeScale < 1, 'slow time holds through the KILL phase: ' + st.timeScale + ' at ' + B.t);
  assert.ok(tx.includes(m.opts.boss.name.toUpperCase() + ' FALLS'), 'the caption is drawn: ' + tx.join('|'));
  assert.equal(T.movies.seen('portal'), 1, 'counted once it was drawn');
  // Loot from the boss: the chests it dropped are still in the world.
  const chests = st.chests.length;
  assert.ok(chests >= 2, 'the boss chests are on the floor: ' + chests);
  // The pilot walks in at once; the crossing waits for the beat.
  const left = BEAT.DURATION - B.t;
  const frames = walkIn();
  assert.equal(st.mode, 'intermission');
  const beatFrames = Math.round(left * 60);
  assert.ok(frames >= beatFrames - 3, 'the crossing waited for the beat: ' + frames + ' frames');
  assert.ok(frames <= beatFrames + 3, 'and then completed at once: ' + frames + ' frames');
  assert.ok(B.done, 'the beat is over');
  assert.notEqual(T.music.scene(), 'portal', 'the duck scene is over');
  assert.ok(st.chests.length + (st.runCounts.chests || 0) >= chests, 'no chest was lost to the beat');
  assert.equal(T.movies.seen('portal'), 1);
});

S.check('the road shot: CONTINUE on a travel wave shows the next stage, then play', () => {
  assert.equal(st.mode, 'intermission');
  const from = st.stage;
  kdown('c');
  assert.equal(st.mode, 'portal-cine', 'the road shot plays');
  assert.notEqual(st.stage, from, 'the run is already on the next stage');
  assert.equal(st.wave.num, 3);
  const m = T.movies.current;
  assert.equal(m.kind, 'road');
  assert.equal(T.roadShot.name, String(stageOf(st.stage).name).toUpperCase());
  assert.equal(m.opts.scene.stage, st.stage, 'the road is the new stage\'s');
  assert.equal(m.opts.scene.character, 'PALADIN');
  const simT = st.time;
  h.pump(20);
  const tx = frameTexts();
  assert.ok(tx.includes(T.roadShot.name), 'the name is drawn: ' + tx.join('|'));
  let n = 21;
  while (st.mode === 'portal-cine' && n++ < 300) h.pump(1);
  assert.equal(st.mode, 'playing');
  assert.ok(n >= 85 && n <= 95, 'about 1.5 s: ' + n + ' frames');
  assert.ok(st.time - simT < 0.1, 'the sim waited during the shot');
  assert.equal(T.movies.seen('road'), 1);
});

S.check('a double wave whose first boss falls alone: the beat plays and the survivor is swept', () => {
  startRunAs('WITCH', 3);
  const cast = bossCast();
  assert.equal(cast.length, 2, 'wave 3 is a double wave');
  kill([cast[1]]);
  assert.ok(B.live, 'the beat plays on a double wave');
  assert.equal(T.movies.current.opts.boss.id, cast[1].bossId, 'showing the one that fell');
  assert.ok(!(st.wave.bosses || []).some(b => b.hp > 0) && !st.enemies.includes(cast[0]), 'the survivor was swept');
  walkIn();
  assert.equal(st.mode, 'intermission');
  // CONTINUE from wave 3 does not travel: no road shot.
  kdown('c');
  assert.equal(st.mode, 'playing', 'no road shot without a stage change');
});

S.check('the beat takes the one skip rule: ESC shows SKIP (no pause), ESC again skips; play goes on', () => {
  startRunAs('ROGUE', 2);
  const [boss] = bossCast();
  kill([boss]);
  assert.ok(B.live);
  kdown('Escape');
  assert.equal(T.movies.current.skip.ask, 0, 'a press in the first moments is ignored');
  h.pump(30);
  kdown('Escape');
  assert.equal(st.mode, 'playing', 'ESC under the beat does not pause');
  assert.ok(T.movies.current.skip.ask > 0, 'the first press shows SKIP');
  assert.ok(frameTexts().includes('SKIP'));
  kdown('Escape');
  assert.ok(!B.live && B.done, 'the second press skips the beat');
  if (st.mode === 'playing') assert.equal(T.chromeOn(), true, 'the play chrome is back');
  assert.ok(st.mode === 'playing' || st.mode === 'draft', 'and play goes on (or a held card opens now): ' + st.mode);
  T.uiGuard.standDown();
  const frames = walkIn();
  assert.equal(st.mode, 'intermission');
  assert.ok(frames < 60, 'with the beat gone the crossing is the plain dwell: ' + frames);
  kdown('c'); h.skipMovie(); T.uiGuard.standDown();
});

S.check('a tap shows SKIP and a tap on SKIP skips the beat (MANUAL too: the tap is not the stick)', () => {
  T.setPilotMode('MANUAL');
  startRunAs('ROGUE', 2);
  const [boss] = bossCast();
  kill([boss]);
  h.pump(30);
  tap(240, 150);
  assert.ok(B.live && T.movies.current.skip.ask > 0, 'the first tap shows SKIP');
  tap(455, 8);
  assert.ok(B.done, 'a tap on SKIP skips');
  T.uiGuard.standDown();
  T.setPilotMode('AUTO_ALL');
  walkIn();
  kdown('c'); h.skipMovie(); T.uiGuard.standDown();
});

S.check('a hidden tab ends the beat; an unattended run has none', () => {
  startRunAs('WITCH', 2);
  let [boss] = bossCast();
  kill([boss]);
  assert.ok(B.live);
  const hide = (on) => { document.visibilityState = on ? 'hidden' : 'visible'; document.hidden = on; T.onVisibilityChange(); };
  T.setPilotMode('AUTO_ALL');
  hide(true);
  let frames = 0;
  try {
    for (let i = 0; i < 3; i++) { h.advanceClock(50); frames += T.bg.tick(performance.now()); }
  } finally { hide(false); }
  assert.ok(frames > 2, 'the hidden tab ran frames: ' + frames);
  h.pump(1);
  assert.ok(!B.live, 'the beat ended in the hidden tab');
  walkIn();
  kdown('c'); h.skipMovie(); T.uiGuard.standDown();
  // Unattended: the next run is the auto pilot's own.
  T.auto.on = true;
  T.auto.runsInRow = 1;
  T.auto.restart();
  h.pump(2); freeze(); st.wave.endsAt = st.time + 1e9; st.player.invuln = 1e6;
  assert.equal(st.unattended, true);
  st.wave.num = 2;
  const seen = T.movies.seen('portal');
  [boss] = bossCast();
  kill([boss]);
  assert.ok(!B.live, 'no beat when nobody watches');
  walkIn();
  assert.equal(st.mode, 'intermission');
  assert.equal(T.movies.seen('portal'), seen, 'not counted');
});

S.check('wave 1 has no beat: the walk-in goes straight to the escape chase', () => {
  startRunAs('ROGUE', 1);
  const [boss] = bossCast();
  kill([boss]);
  assert.ok(!B.live, 'no beat at wave 1');
  walkIn();
  assert.equal(st.mode, 'escape');
  h.skipMovie();
  assert.equal(st.mode, 'intermission');
  kdown('c'); h.skipMovie(); T.uiGuard.standDown();
});

S.check('a held key under the beat is one press; the road shot takes the two-press skip', () => {
  T.auto.on = false;
  T.setPilotMode('AUTO_ALL');
  startRunAs('KNIGHT', 2);
  assert.equal(st.unattended, false);
  const [boss] = bossCast();
  kill([boss]);
  assert.ok(B.live);
  h.pump(30);
  h.key('keydown', { key: ' ', preventDefault() {} });
  assert.ok(T.movies.current.skip.ask > 0, 'the first press shows SKIP');
  for (let i = 0; i < 5; i++) h.key('keydown', { key: ' ', repeat: true, preventDefault() {} });
  assert.ok(B.live, 'holding the key does not skip');
  walkIn();
  assert.equal(st.mode, 'intermission');
  kdown('c');
  assert.equal(st.mode, 'portal-cine', 'the road shot');
  kdown('Escape');
  assert.equal(st.mode, 'portal-cine', 'a press in the first moments is ignored');
  h.pump(30);
  kdown('Escape');
  assert.equal(st.mode, 'portal-cine', 'the first press only shows SKIP');
  assert.ok(T.movies.current.skip.ask > 0);
  kdown('Enter');
  assert.equal(st.mode, 'playing', 'the second skips into play on the new stage');
  assert.equal(T.uiGuard.armed(), true, 'and the next screen is guarded');
  T.uiGuard.standDown();
});

// ---- 7. review fixes ----------------------------------------------------------------
// Each music cue main.js asks for (with its options), and each cue fade.
const audioLog = [];
{
  const real = T.audio.get();
  T.audio.set({
    ...real,
    playMusicCue(slot, opts) { audioLog.push({ slot, opts: opts || {} }); return real.playMusicCue(slot, opts); },
    fadeMusicCues() { audioLog.push({ fade: true }); if (real.fadeMusicCues) real.fadeMusicCues(); },
  });
}
const caption = () => T.movies.current.opts.boss.name.toUpperCase() + ' FALLS';

S.check('a first-ever banner during the beat holds the beat\'s clock and the screen; then the beat plays in full', () => {
  T.auto.on = false;
  startRunAs('WITCH', 2);
  const [boss] = bossCast();
  kill([boss]);
  assert.ok(B.live);
  h.pump(3);
  // The boss's item drop, swept to the pilot, is a first-ever legendary:
  // its banner holds the sim for 2.5 s (maybeTopTierBanner).
  st.bossBanner = { names: ['TEST RELIC'], verb: 'LEGENDARY', title: 'TEST RELIC', sub: 'LEGENDARY ITEM ACQUIRED', ttl: 2.5 };
  st.bannerHold = 2.5;
  const t0 = B.t, simT = st.time;
  const tx = frameTexts();
  assert.ok(!tx.includes(caption()), 'the beat is not drawn over the banner: ' + tx.join('|'));
  h.pump(60);
  assert.equal(st.time, simT, 'the banner holds the sim');
  assert.ok(Math.abs(B.t - t0) < 1e-9, 'and the beat waits with it: ' + B.t + ' vs ' + t0);
  assert.ok(B.live && B.holds, 'the beat is still to come');
  let n = 0;
  while (st.bannerHold > 0 && n++ < 400) h.pump(1);
  // The skip runs on the beat's own clock: a press right after the hold is
  // still in the beat's first moments.
  kdown('Escape');
  assert.equal(T.movies.current.skip.ask, 0, 'a press in the beat\'s first moments is ignored');
  h.pump(2);
  assert.ok(st.timeScale < 1, 'slow time is back for the rest of the KILL phase: ' + st.timeScale);
  h.pump(15);
  assert.ok(frameTexts().includes(caption()), 'the beat is drawn again');
  const left = BEAT.DURATION - B.t;
  const frames = walkIn();
  assert.equal(st.mode, 'intermission');
  assert.ok(frames >= Math.round(left * 60) - 3, 'the beat plays its whole length after the banner: ' + frames + ' frames');
  kdown('c'); h.skipMovie(); T.uiGuard.standDown();
});

S.check('help mode during the beat: the beat waits, and ESC leaves help mode', () => {
  startRunAs('ROGUE', 2);
  const [boss] = bossCast();
  kill([boss]);
  h.pump(20);
  kdown('?');
  assert.equal(st.helpMode, true, '? arms help mode');
  const t0 = B.t;
  h.pump(30);
  assert.ok(Math.abs(B.t - t0) < 1e-9, 'the beat\'s clock holds in help mode');
  kdown('Escape');
  assert.equal(st.helpMode, false, 'ESC leaves help mode');
  assert.ok(B.live, 'and does not touch the beat');
  assert.equal(T.movies.current.skip.ask, 0, 'no SKIP was asked');
  walkIn();
  kdown('c'); h.skipMovie(); T.uiGuard.standDown();
});

S.check('a quick kill: the boss\'s APPROACHES banner goes when the beat starts', () => {
  startRunAs('WITCH', 2);
  const [boss] = bossCast();
  assert.ok(st.bossBanner && /^APPROACH/.test(st.bossBanner.verb), 'the arrival banner is up');
  kill([boss]);
  assert.ok(B.live);
  assert.ok(!(st.bossBanner && /^APPROACH/.test(st.bossBanner.verb)), 'the arrival banner is gone: ' + (st.bossBanner && st.bossBanner.title));
  walkIn();
  kdown('c'); h.skipMovie(); T.uiGuard.standDown();
});

S.check('the cards the beat held open when it ends, before the crossing', () => {
  startRunAs('WITCH', 2);
  const [boss] = bossCast();
  kill([boss]);
  assert.ok(B.live);
  // A level-up from the swept gems waits for the beat.
  st.pendingDrafts = Math.max(1, st.pendingDrafts);
  h.pump(2);
  assert.equal(st.mode, 'playing', 'no card cuts into the beat');
  const seq = [];
  let n = 0;
  while (st.mode !== 'intermission' && n++ < 1200) {
    if (st.mode === 'playing' && st.portal) { st.player.x = st.portal.x; st.player.y = st.portal.y; }
    h.pump(1, () => { st.player.invuln = 1e6; });
    if (seq[seq.length - 1] !== st.mode) seq.push(st.mode);
    if (st.mode === 'draft' || st.mode === 'evolve') kdown('1');
  }
  assert.equal(st.mode, 'intermission');
  assert.ok(seq.indexOf('draft') >= 0 && seq.indexOf('draft') < seq.indexOf('intermission'), 'the held draft opened before the crossing: ' + seq.join('>'));
  assert.equal(st.pendingDrafts, 0, 'no draft rides into the intermission');
  assert.equal(st.jokerOffers || 0, 0, 'no joker card rides into the intermission');
  kdown('c'); h.skipMovie(); T.uiGuard.standDown();
});

S.check('a pause holds the beat\'s clock; the arrows still steer under the beat', () => {
  startRunAs('ROGUE', 2);
  const [boss] = bossCast();
  kill([boss]);
  h.pump(5);
  const t0 = B.t;
  st.mode = 'settings';
  h.pump(30);
  st.mode = 'playing';
  assert.ok(Math.abs(B.t - t0) < 1e-9, 'no beat clock in a pause: ' + B.t + ' vs ' + t0);
  T.setPilotMode('MANUAL');
  const x0 = st.player.x;
  h.key('keydown', { key: 'ArrowLeft', preventDefault() {} });
  h.pump(20);
  h.key('keyup', { key: 'ArrowLeft', preventDefault() {} });
  assert.ok(B.live, 'the beat plays on');
  assert.ok(st.player.x < x0 - 3, 'the arrow key moved the pilot: ' + (st.player.x - x0).toFixed(1));
  T.setPilotMode('AUTO_ALL');
  walkIn();
  kdown('c'); h.skipMovie(); T.uiGuard.standDown();
});

S.check('reduced motion: the beat holds no slow time of its own', () => {
  const mm = window.matchMedia;
  window.matchMedia = (q) => ({ matches: /prefers-reduced-motion/.test(String(q)) });
  try {
    startRunAs('WITCH', 2);
    const [boss] = bossCast();
    kill([boss]);
    assert.ok(B.live && T.movies.current.reduced, 'a reduced-motion beat');
    // The boss kill's own earned moment (0.6 s) is not the beat's; the beat
    // holds no slow time of its own past it.
    h.pump(45);
    assert.equal(st.timeScale, 1, 'no slow time held by the beat');
  } finally { window.matchMedia = mm; }
  walkIn();
  kdown('c'); h.skipMovie(); T.uiGuard.standDown();
});

S.check('a hidden tab ends the road shot', () => {
  startRunAs('WITCH', 2);
  const [boss] = bossCast();
  kill([boss]);
  walkIn();
  assert.equal(st.mode, 'intermission');
  kdown('c');
  assert.equal(st.mode, 'portal-cine', 'the road shot');
  const hide = (on) => { document.visibilityState = on ? 'hidden' : 'visible'; document.hidden = on; T.onVisibilityChange(); };
  hide(true);
  try { for (let i = 0; i < 3; i++) { h.advanceClock(50); T.bg.tick(performance.now()); } } finally { hide(false); }
  h.pump(1);
  assert.equal(st.mode, 'playing', 'the hidden tab ended the road shot');
  T.uiGuard.standDown();
});

S.check('an unattended run that travels has no road shot', () => {
  T.auto.on = true;
  T.auto.runsInRow = 1;
  T.auto.restart();
  h.pump(2); freeze(); st.wave.endsAt = st.time + 1e9; st.player.invuln = 1e6;
  assert.equal(st.unattended, true);
  st.wave.num = 2;
  const stage0 = st.stage, road0 = T.movies.seen('road');
  const [boss] = bossCast();
  kill([boss]);
  walkIn();
  assert.equal(st.mode, 'intermission');
  let n = 0, road = false;
  while (st.mode === 'intermission' && n++ < 2400) { h.pump(1); if (st.mode === 'portal-cine') road = true; }
  if (st.mode === 'intermission') kdown('c');
  if (st.mode === 'portal-cine') road = true;
  assert.notEqual(st.stage, stage0, 'the run travelled');
  assert.ok(!road, 'no road shot when nobody watches');
  assert.equal(T.movies.seen('road'), road0, 'not counted');
  T.auto.on = false;
});

S.check('the portal cue ducks the bed; at the last wave its tail fades when the Maw comes', () => {
  T.auto.on = false;
  startRunAs('WITCH', 2);
  let [boss] = bossCast();
  audioLog.length = 0;
  kill([boss]);
  const cue = audioLog.find(a => a.slot === 'portal');
  assert.ok(cue, 'the portal cue plays at the kill');
  assert.equal(cue.opts.duckDb, -12, 'with its -12 dB duck');
  walkIn();
  assert.equal(st.mode, 'intermission');
  assert.ok(!audioLog.some(a => a.fade), 'at an intermission the tail plays on');
  kdown('c'); h.skipMovie(); T.uiGuard.standDown();
  startRunAs('WITCH', C.ESCALATION.END_WAVE);
  [boss] = bossCast();
  audioLog.length = 0;
  kill(st.wave.bosses.filter(b => b.hp > 0));
  assert.ok(audioLog.some(a => a.slot === 'portal'), 'the last wave\'s beat has its cue');
  walkIn();
  assert.equal(st.mode, 'finale');
  const iCue = audioLog.findIndex(a => a.slot === 'portal'), iFade = audioLog.findIndex(a => a.fade);
  assert.ok(iFade > iCue, 'the cue fades (and its duck lifts) when the finale starts');
});

S.done();
