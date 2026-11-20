// HORDES - R2: the movies show your run, and they all skip the same way.
// Run: node test/test_movies.mjs
//
// Pins, through the movie modules and through the real game:
//   1. the cast lookup (src/movie_cast.js): each pilot, each boss, the killer;
//   2. every movie draws the pilot it is handed (each of the four), the portal
//      movie the boss it is handed, the death movie the killer it is handed;
//   3. the real game hands them the equipped pilot, the boss the player
//      really killed (on a double wave, the one that fell) and the enemy
//      that really dealt the killing hit;
//   4. the one skip rule (src/movie_skip.js) in all four movies, by key and
//      by tap: the guard, the first press shows SKIP, the second skips;
//   5. the seen count: the first viewing is as before, a repeat plays through
//      at full speed without the held beats; it lives in the settings storage;
//   6. reduced motion keeps the escape's still card; unattended runs pass the
//      movies by themselves and do not count them as seen.
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';
import { mulberry32 } from '../src/weather.js';
import { CHARACTER_SPRITES } from '../src/character_sprites.js';
import { BOSS_SPRITES } from '../src/bosses.js';
import { ENEMY_SPRITES } from '../src/enemy_sprites.js';
import { pilotLook, bossLook, killerLook, seenCount, noteSeen, isRepeat, SEEN_KEY } from '../src/movie_cast.js';
import * as SKIP from '../src/movie_skip.js';
import * as CINE from '../src/portal_cine.js';
import * as DCINE from '../src/death_cine.js';
import * as INTRO from '../src/intro.js';
import { makeTypedEnemy } from '../src/enemy_types.js';

Math.random = mulberry32(20261118);
const S = suite('R2 movies');
const PILOTS = Object.keys(CHARACTER_SPRITES);
const BOSSES = ['GRAVELMAW', 'CHOIR_MOTHER', 'PYRAXIS', 'HERALD'];

// A recording context: the colour of every filled rect, and every text.
function recorder() {
  const rects = [], texts = [];
  let style = null;
  const g = {
    set fillStyle(v) { style = v; }, get fillStyle() { return style; },
    globalAlpha: 1, font: '', textAlign: '', textBaseline: '',
    fillRect(x, y, w, h) { rects.push({ x, y, w, h, style }); },
    fillText(t) { texts.push(String(t)); },
    measureText: (s) => ({ width: String(s).length * 5 }),
    save() {}, restore() {}, translate() {}, beginPath() {}, arc() {}, fill() {},
  };
  return { g, rects, texts };
}
// The colours a grid really uses.
const usedColours = (frame, palette) => {
  const out = new Set();
  for (const row of frame) for (const v of row) if (v) out.add(palette[v]);
  return out;
};
const drawn = (rects) => new Set(rects.map(r => r.style));
const missing = (want, have) => [...want].filter(c => !have.has(c));

// ---- 1. the cast lookup ---------------------------------------------------------
S.check('pilotLook, bossLook and killerLook answer for every pilot, boss and killer', () => {
  for (const id of PILOTS) {
    const p = pilotLook(id);
    assert.equal(p.id, id);
    assert.equal(p.frames, CHARACTER_SPRITES[id].frames, id + ' frames are the run sprite');
    assert.equal(p.palette, CHARACTER_SPRITES[id].palette, id + ' colours are the run colours');
  }
  assert.equal(pilotLook('NOPE').id, 'KNIGHT'); assert.equal(pilotLook(undefined).id, 'KNIGHT');
  for (const id of BOSSES) {
    const b = bossLook(id);
    assert.equal(b.id, id); assert.equal(b.frames, BOSS_SPRITES[id].frames);
    assert.ok(typeof b.name === 'string' && b.name.length > 0, id + ' has its name');
  }
  assert.equal(bossLook(null).id, 'GRAVELMAW'); assert.equal(bossLook('NOPE').id, 'GRAVELMAW');
  assert.equal(killerLook({ cause: 'contact', typeId: 'BRUTE', bossId: 'PYRAXIS' }).id, 'PYRAXIS');
  assert.equal(killerLook({ cause: 'shot', typeId: 'SPITTER' }).id, 'SPITTER');
  assert.equal(killerLook({ cause: 'shot', typeId: 'SPITTER' }).frames, ENEMY_SPRITES.SPITTER.frames);
  // R2 death rebuild: the Maw is a look of its own (it kills the finale's runs).
  assert.equal(killerLook({ cause: 'contact', name: 'THE MAW' }).kind, 'maw');
  assert.equal(killerLook({ cause: 'contact', name: 'THE MAW' }).name, 'THE MAW');
  assert.equal(killerLook({ cause: 'shot', typeId: 'SPITTER' }).name, 'SPITTER', 'named as the end card names it');
  assert.equal(killerLook(null), null);
});

// ---- 2. the movies draw what they are handed -----------------------------------------
S.check('the portal movie draws each pilot and each boss it is handed', () => {
  for (const pid of PILOTS) for (const bid of BOSSES) {
    const hero = pilotLook(pid), boss = bossLook(bid);
    const r = recorder();
    CINE.render(r.g, 300, { hero, boss });        // KILL, before the blow
    const have = drawn(r.rects);
    assert.deepEqual(missing(usedColours(hero.frames[0], hero.palette), have), [], pid + '/' + bid + ' hero colours');
    const both = [...usedColours(boss.frames[0], boss.palette)].filter(c => usedColours(boss.frames[1] || boss.frames[0], boss.palette).has(c));
    assert.deepEqual(missing(new Set(both), have), [], pid + '/' + bid + ' boss colours');
  }
});
S.check('the death movie draws each pilot (running, kneeling, fallen) and the killer', () => {
  // R2 rebuild ("the escape that fails"): wall ms on a repeat = scene ms.
  const SC = DCINE.DEATH_CINE_TEST.SCENE;
  for (const pid of PILOTS) {
    const hero = pilotLook(pid);
    const want = usedColours(hero.frames[0], hero.palette);
    for (const t of [SC.ROAD[0] + 300, SC.SLUMP[0] + 100, SC.SLUMP[1] - 100]) {   // run, kneel, fallen
      const r = recorder();
      DCINE.render(r.g, t, 'contact', { hero, repeat: true });
      const have = drawn(r.rects);
      assert.ok([...want].some(c => have.has(c)), pid + ' at ' + t + ' ms');
    }
    const r = recorder();
    DCINE.render(r.g, 300, 'contact', { hero, repeat: true });   // the freeze, no frozen frame: drawn standing
    assert.deepEqual(missing(want, drawn(r.rects)), [], pid + ' all colours on the freeze');
  }
  const poses = DCINE.heroPoses(pilotLook('WITCH'));
  assert.equal(poses.kneel.length, 16);
  const rowsUsed = (g) => g.filter(row => row.some(v => v)).length;
  assert.ok(rowsUsed(poses.kneel) < rowsUsed(poses.stand), 'the kneel is lower than the stand');
  assert.ok(poses.fallen[0].length > poses.fallen.length, 'the fall lies on its side');
  for (const [cause, killer] of [['contact', killerLook({ typeId: 'BRUTE', bossId: 'CHOIR_MOTHER' })],
    ['shot', killerLook({ typeId: 'SPITTER' })], ['drain', killerLook({ typeId: 'TICK' })]]) {
    for (const t of [300, SC.LUNGE[0] + 100]) {   // the freeze and the road
      const r = recorder();
      DCINE.render(r.g, t, cause, { hero: pilotLook('ROGUE'), killer, repeat: true });
      const kc = [...usedColours(killer.frames[0], killer.palette)].filter(c => usedColours(killer.frames[1] || killer.frames[0], killer.palette).has(c));
      assert.deepEqual(missing(new Set(kc), drawn(r.rects)), [],
        killer.id + ' (' + cause + ') is drawn in its own colours at ' + t);
    }
    const r0 = recorder();
    DCINE.render(r0.g, 300, cause, { hero: pilotLook('ROGUE'), repeat: true });
    assert.ok(!r0.texts.some(q => q === killer.name), 'and named only when handed');
  }
});
S.check('the intro draws each pilot it is handed', () => {
  for (const pid of PILOTS) {
    const hero = pilotLook(pid);
    const r = recorder();
    INTRO.render(r.g, 1000, { hero });
    const want = usedColours(hero.frames[1], hero.palette);
    assert.deepEqual(missing(want, drawn(r.rects)), [], pid);
  }
});

S.check('the death movie is laid out for the pilot it is handed, and a shooter stands back', () => {
  // R2 rebuild: on the road a shooter stands further back than a contact
  // killer, and the freeze boxes the killer where it stood on the frozen frame.
  const kp = DCINE.DEATH_CINE_TEST.killerPose, SC = DCINE.DEATH_CINE_TEST.SCENE;
  const spit = killerLook({ typeId: 'SPITTER' });
  assert.ok(kp(SC.HIT[0], 'shot', spit).d > kp(SC.HIT[0], 'contact', spit).d + 1, 'the shooter stands back');
  const L = DCINE.DEATH_CINE_TEST.freezeLayout({ freeze: { scale: 2, hero: { x: 100, y: 150 }, killer: { x: 300, y: 140 } } }, spit);
  assert.deepEqual([L.hero.x, L.killer.x, L.killer.y], [100, 300, 140], 'where they stood');
  // Each pilot, and a 12-wide stand-in beside the 16-wide ones, is drawn
  // centred where it stood on the frozen frame (no frame copy: the movie draws
  // the pilot itself), whatever its width.
  const rogue = pilotLook('ROGUE');
  const narrow = { id: 'NARROW', palette: rogue.palette, frames: [rogue.frames[0].map(row => row.slice(2, 14))] };
  for (const hero of [...PILOTS.map(pilotLook), narrow]) {
    const grid = hero.frames[0], w = grid[0].length, cols = new Set(Object.values(hero.palette));
    let c0 = w;
    for (const row of grid) row.forEach((v, c) => { if (v) c0 = Math.min(c0, c); });
    const r = recorder();
    DCINE.render(r.g, 0, 'unknown', { hero, freeze: { scale: 2, hero: { x: 100, y: 150 } } });
    const mine = r.rects.filter(q => cols.has(q.style) && q.w === q.h && q.w <= 4);
    assert.ok(mine.length, hero.id + ' is drawn');
    const z = mine[0].w;
    const left = Math.min(...mine.map(q => q.x)) - c0 * z;   // the grid's left edge
    assert.ok(Math.abs(left + (w * z) / 2 - 100) <= 1, hero.id + ' centred on where it stood: ' + (left + (w * z) / 2));
  }
});
S.check('a repeat viewing is the same pictures at full speed, the held beats stepped over', () => {
  const hero = pilotLook('WITCH'), boss = bossLook('PYRAXIS'), killer = killerLook({ typeId: 'CHASER' });
  // The portal's vortex turns on the wall clock, so the portal compares the
  // actors only (the hero's and the boss's pixels).
  const actors = new Set([...Object.values(hero.palette), ...Object.values(boss.palette)]);
  const same = (fa, fb, label, only = null) => {
    const ra = recorder(), rb = recorder(); fa(ra.g); fb(rb.g);
    const keep = (r) => !only || (only.has(r.style) && r.w >= 5);   // actor pixels are 5-8 px, the portal's 3
    assert.deepEqual(ra.rects.filter(keep), rb.rects.filter(keep), label);
  };
  const sp = CINE.CINE_SPEED;
  // Portal: scene ms = wall ms before PAUSE; +700 (PAUSE) in DISSOLVE; +1300 in FADE.
  for (const [tr, ts] of [[500, 500], [1700, 1700], [2400, 3100], [3200, 4500]]) {
    same(g => CINE.render(g, tr, { hero, boss, repeat: true }), g => CINE.render(g, ts / sp, { hero, boss }), 'portal ' + tr, actors);
  }
  // Death (R2): the first viewing holds the freeze HOLD_MS; after it, the same pictures.
  for (const tr of [300, 900, 1600, 2000, 2600, 3300]) {
    const tf = tr < DCINE.REPEAT_PHASES.FREEZE[1] ? tr : tr + DCINE.HOLD_MS;
    same(g => DCINE.render(g, tr, 'contact', { hero, killer, repeat: true }),
      g => DCINE.render(g, tf, 'contact', { hero, killer }), 'death ' + tr);
  }
  assert.equal(CINE.phaseAt(2500, { repeat: true }), 'DISSOLVE');
  assert.equal(CINE.phaseAt(3100, { repeat: true }), 'FADE');
  assert.equal(CINE.isDone(CINE.REPEAT_DURATION, { repeat: true }), true);
  assert.equal(CINE.isDone(CINE.REPEAT_DURATION, {}), false, 'the first viewing is as long as before');
});

// ---- 4a. the skip rule itself --------------------------------------------------------
S.check('movie_skip: the guard, the prompt, the confirm, the prompt running out', () => {
  const s = SKIP.createSkip();
  assert.equal(SKIP.pressSkip(s, 0.1, true), false); assert.equal(s.ask, 0, 'inside the guard: nothing');
  assert.equal(SKIP.pressSkip(s, 0.5, true), false); assert.equal(s.ask, SKIP.SKIP_ASK_S, 'the first press asks, even a skip key');
  assert.equal(SKIP.pressSkip(s, 0.6, false), false, 'a press that does not mean it asks again');
  assert.equal(SKIP.pressSkip(s, 0.7, true, true), true, 'a confirm while asked skips');
  const s2 = SKIP.createSkip();
  SKIP.pressSkip(s2, 1, false, true); assert.equal(s2.askTap, true);
  SKIP.tickSkip(s2, SKIP.SKIP_ASK_S + 0.01); assert.equal(s2.ask, 0, 'the prompt runs out');
  assert.equal(SKIP.pressSkip(s2, 4, true), false, 'then a skip key asks again');
  for (const k of ['Escape', 'Enter', ' ']) assert.equal(SKIP.isSkipKey(k), true, k);
  for (const k of ['x', 'w', 'a', '1', 'ArrowLeft', 'Shift']) assert.equal(SKIP.isSkipKey(k), false, k);
  assert.equal(SKIP.skipHit(455, 8), true); assert.equal(SKIP.skipHit(240, 150), false);
  const r = recorder();
  SKIP.drawSkip(r.g, SKIP.createSkip());
  assert.equal(r.texts.length, 0, 'nothing shows before a press');
  SKIP.drawSkip(r.g, { ask: 1, askTap: true });
  assert.ok(r.texts.includes('SKIP') && r.texts.includes('tap SKIP to skip'));
});

// ---- the real game --------------------------------------------------------------------
const h = await boot({ storage: [['hordes_onboarded', '1']] });
const T = h.T, st = h.state, el = h.elements;
T.banners.suppressAll();
const prof = T.getProfile();
const kdown = (k) => h.key('keydown', { key: k, preventDefault() {} });
const tap = (x, y) => el['game']._ev.pointerdown({ clientX: x, clientY: y, stopPropagation() {}, preventDefault() {} });
const texts = () => h.rec.texts.map(t => t.txt);
function frameTexts() { h.rec.on = true; h.rec.texts.length = 0; h.pump(1); h.rec.on = false; return texts(); }

// The two-press rule on whatever movie is up, by key (true) or by tap (false).
function checkSkipRule(mode, byKey) {
  assert.equal(st.mode, mode);
  const ask = () => (mode === 'escape' ? T.escape.cine.ask : T.movies.current.skip.ask);
  if (byKey) kdown('Escape'); else tap(455, 8);
  assert.equal(st.mode, mode, mode + ': a press in the first moments is ignored');
  assert.equal(ask(), 0, mode + ': not even the prompt');
  h.pump(30);                                     // 0.5 s: past the guard
  assert.ok(!frameTexts().some(t => /to skip/.test(t)), mode + ': no prompt before a press');
  if (byKey) { kdown('w'); kdown('x'); } else tap(240, 150);
  assert.equal(st.mode, mode, mode + ': the first press only shows SKIP');
  assert.ok(ask() > 0, mode + ': the prompt is up');
  const tx = frameTexts();
  assert.ok(tx.includes('SKIP'), mode + ': SKIP is drawn');
  assert.ok(tx.includes(byKey ? 'ESC or ENTER to skip' : 'tap SKIP to skip'), mode + ': it says how: ' + tx.join('|'));
  if (byKey) kdown('a'); else tap(200, 200);
  assert.equal(st.mode, mode, mode + ': a press that does not mean it does not skip');
  if (byKey) kdown('Enter'); else tap(455, 8);
  assert.notEqual(st.mode, mode, mode + ': the second press that means it skips');
  assert.equal(T.uiGuard.armed(), true, mode + ': and the next screen is guarded');
}

S.check('the intro is not counted as seen while the tab is hidden', () => {
  assert.equal(st.mode, 'intro');
  const hide = (on) => { document.visibilityState = on ? 'hidden' : 'visible'; document.hidden = on; T.onVisibilityChange(); };
  const mode0 = st.pilotMode;
  st.pilotMode = 'AUTO_ALL';   // so the hidden tab's ticker runs frames
  hide(true);
  let frames = 0;
  try {
    for (let i = 0; i < 20; i++) { h.advanceClock(100); frames += T.bg.tick(performance.now()); }
  } finally { hide(false); st.pilotMode = mode0; }
  assert.ok(frames > 30, 'the hidden tab ran frames: ' + frames);
  assert.equal(st.mode, 'intro', 'the title movie waits for someone to watch it');
  assert.equal(T.movies.seen('intro'), 0, 'not counted while nobody could see it');
  h.pump(1);
  assert.equal(T.movies.seen('intro'), 1, 'counted on the first frame drawn');
  T.movies.current.t0 = performance.now();   // the skip-rule check below starts the movie afresh
});

S.check('the intro: the equipped pilot, and the one skip rule by key', () => {
  assert.equal(st.mode, 'intro', 'the page boots into the intro');
  assert.equal(T.movies.current.kind, 'intro');
  assert.equal(T.movies.current.opts.hero.id, prof.equippedCharacter || 'KNIGHT');
  assert.equal(T.movies.current.opts.repeat, false, 'a fresh player: the first viewing');
  checkSkipRule('intro', true);
  assert.equal(T.movies.seen('intro'), 1, 'the intro counted as seen once');
  T.uiGuard.standDown();
});

const freeze = () => { st.spawnTimer = 1e9; st.wave.midAt = st.time + 1e9; };
function startRunAs(pilot, wave = 1) {
  prof.equippedCharacter = pilot;
  T.startRun(); h.pump(2); freeze();
  st.wave.num = wave;
  st.wave.endsAt = st.time + 1e9;
  st.player.invuln = 1e6;
}
// The real boss path. `kill`: which of the cast to kill (index); the rest
// are swept when the wave is won.
function bossDown(kill = 0) {
  st.wave.endsAt = st.time;
  let g = 0;
  while (!(st.wave.bosses || []).some(b => b.hp > 0) && g++ < 1800) h.pump(1);
  st.wave.endsAt = st.time + 1e9;
  const cast = st.wave.bosses.map(b => b.bossId);
  // The whole cast dies in one frame (a double wave whose first boss falls
  // alone is pinned in test_portal_movie.mjs). `kill` is reaped
  // first, so it is the one whose death wins the wave.
  const first = st.wave.bosses[kill];
  st.enemies.splice(st.enemies.indexOf(first), 1);
  st.enemies.push(first);   // the reap walks the list from the end
  for (const b of st.wave.bosses) b.hp = 0;
  g = 0;
  while (!st.portal && g++ < 600) h.pump(1, () => { st.player.invuln = 1e6; });
  assert.ok(st.portal, 'the portal opened');
  return cast;
}
function enterPortal() {
  let g = 0;
  while ((st.mode === 'playing' || st.mode === 'draft' || st.mode === 'evolve') && g++ < 3600) {
    if (st.mode !== 'playing') { kdown('1'); h.pump(1); continue; }
    if (st.portal) { st.player.x = st.portal.x; st.player.y = st.portal.y; }
    h.pump(1, () => { st.player.invuln = 1e6; });
  }
}

S.check('the escape: the equipped pilot, the boss killed, and the one skip rule by tap', () => {
  startRunAs('ROGUE', 1);
  bossDown(0);
  enterPortal();
  assert.equal(st.mode, 'escape');
  assert.equal(T.escape.cine.scene.character, 'ROGUE');
  assert.equal(T.escape.cine.scene.bossId, 'GRAVELMAW');
  checkSkipRule('escape', false);
  assert.equal(T.movies.seen('escape'), 1);
});

S.check('the portal movie: the equipped pilot and the boss really killed (a double wave, the second of the pair)', () => {
  kdown('c'); h.skipMovie(); h.pump(2);   // CONTINUE out of the intermission
  T.uiGuard.standDown();
  startRunAs('WITCH', 3);
  const cast = bossDown(1);
  assert.equal(cast.length, 2, 'wave 3 is a double wave: ' + cast.join(','));
  assert.equal(st.wave.killedBossId, cast[1], 'the one that fell is recorded');
  enterPortal();
  assert.equal(st.mode, 'portal-cine');
  const o = T.movies.current.opts;
  assert.equal(o.hero.id, 'WITCH'); assert.equal(o.hero.palette, CHARACTER_SPRITES.WITCH.palette);
  assert.equal(o.boss.id, cast[1], 'the movie shows ' + cast[1] + ', not the wave\'s first boss ' + cast[0]);
  assert.notEqual(o.boss.id, cast[0]);
  assert.equal(o.repeat, false, 'the first portal movie');
  // The frame really carries the Witch and the boss.
  h.rec.on = true; h.rec.rects.length = 0; h.pump(1); h.rec.on = false;
  checkSkipRule('portal-cine', true);
  assert.equal(T.movies.seen('portal'), 1);
});

S.check('the first portal movie of a run plays in full even when seen in an earlier run, and the count stays in the settings', () => {
  kdown('c'); h.skipMovie(); h.pump(2); T.uiGuard.standDown();
  startRunAs('PALADIN', 2);
  const cast = bossDown(0);
  enterPortal();
  assert.equal(st.mode, 'portal-cine');
  const o = T.movies.current.opts;
  assert.equal(T.movies.seen('portal'), 1, 'seen once before');
  assert.equal(o.repeat, false, 'seen in an earlier run, but it is the first in THIS run: full length');
  assert.equal(o.boss.id, cast[0]); assert.equal(o.hero.id, 'PALADIN');
  assert.equal(T.portalCine.duration, CINE.CINE_DURATION);
  assert.ok(CINE.CINE_DURATION > 6000);
  const phases = new Set();
  let frames = 0;
  while (st.mode === 'portal-cine' && frames++ < 600) h.pump(1, () => { if (st.mode === 'portal-cine') phases.add(CINE.phaseAt(T.portalCine.t, o)); });
  assert.ok(phases.has('PAUSE') && phases.has('LINGER'), 'the held beats are kept: ' + [...phases].join(','));
  assert.ok(phases.has('KILL') && phases.has('DISSOLVE') && phases.has('FADE'));
  assert.ok(frames / 60 > 6.5 && frames / 60 < 7.3, 'it played its full length: ' + (frames / 60).toFixed(2) + ' s');
  assert.equal(st.mode, 'intermission');
  assert.equal(T.movies.seen('portal'), 2);
  const raw = h.storage.get(SEEN_KEY);
  assert.ok(raw && JSON.parse(raw).portal === 2, 'kept under its own settings key');
  for (const [k, v] of h.storage) if (k !== SEEN_KEY) assert.ok(!String(v).includes('"portal":2'), 'not in ' + k);
});

// Steve, 2026-11-18: "the shorter movie is fine if it's been seen during a run already".
S.check('a second portal movie in the SAME run is the short one; a new run starts in full again', () => {
  assert.equal(st.mode, 'intermission', 'still in the run of the check above');
  assert.equal(st.runMoviesSeen.portal, 1, 'one portal movie shown in this run');
  kdown('c'); h.skipMovie(); h.pump(2); T.uiGuard.standDown();   // CONTINUE into the next wave
  assert.equal(st.mode, 'playing');
  freeze(); st.wave.endsAt = st.time + 1e9; st.player.invuln = 1e6;
  bossDown(0);
  enterPortal();
  assert.equal(st.mode, 'portal-cine');
  const o = T.movies.current.opts;
  assert.equal(o.repeat, true, 'seen earlier in this run: the short one');
  assert.equal(T.portalCine.duration, CINE.REPEAT_DURATION);
  const phases = new Set();
  let frames = 0;
  while (st.mode === 'portal-cine' && frames++ < 600) h.pump(1, () => { if (st.mode === 'portal-cine') phases.add(CINE.phaseAt(T.portalCine.t, o)); });
  assert.ok(!phases.has('PAUSE') && !phases.has('LINGER'), 'no held beats: ' + [...phases].join(','));
  assert.ok(frames / 60 < 3.7, 'it played through in ' + (frames / 60).toFixed(2) + ' s');
  assert.equal(st.runMoviesSeen.portal, 2);
  // A new run: the count starts again, so its first portal movie is in full.
  kdown('c'); h.skipMovie(); h.pump(2); T.uiGuard.standDown();
  startRunAs('WITCH', 2);
  assert.deepEqual(st.runMoviesSeen, {}, 'a new run has shown no movie');
  bossDown(0);
  enterPortal();
  assert.equal(T.movies.current.opts.repeat, false, 'first in the new run: full length');
  assert.equal(T.portalCine.duration, CINE.CINE_DURATION);
  h.skipMovie();
});

function realDeath(pilot, typeId, extra = {}) {
  kdown('c'); h.skipMovie(); h.pump(2); T.uiGuard.standDown();
  startRunAs(pilot, 1);
  const p = st.player;
  p.hp = 1; p.invuln = 0; p.potions.hp = 0;
  st.enemies.length = 0;
  const killer = makeTypedEnemy(typeId, p.x, p.y, st.time);
  killer.hp = killer.maxHp = 1e6; killer.speed = 0;
  Object.assign(killer, extra);
  st.enemies.push(killer);
  for (let i = 0; i < 30 && st.mode !== 'death-cine'; i++) {
    h.pump(1, () => { st.enemies.forEach(e => { e.speed = 0; e.x = p.x; e.y = p.y; }); });
  }
  assert.equal(st.mode, 'death-cine', 'the death opened the movie');
}
S.check('the death movie: the equipped pilot, the real killer, and the one skip rule (key and tap)', () => {
  realDeath('WITCH', 'CHASER');
  let o = T.movies.current.opts;
  assert.equal(o.hero.id, 'WITCH'); assert.equal(o.killer.id, 'CHASER');
  assert.equal(o.repeat, false);
  checkSkipRule('death-cine', true);
  assert.equal(st.mode, 'dead');
  realDeath('KNIGHT', 'BRUTE', { bossId: 'PYRAXIS' });
  o = T.movies.current.opts;
  assert.equal(o.killer.kind, 'boss'); assert.equal(o.killer.id, 'PYRAXIS', 'a boss that killed is the boss');
  assert.equal(o.repeat, true, 'the second death movie is a repeat');
  assert.equal(T.deathCine.duration, DCINE.REPEAT_DURATION);
  assert.ok(DCINE.REPEAT_DURATION < DCINE.CINE_DURATION);
  checkSkipRule('death-cine', false);
  realDeath('ROGUE', 'SPITTER');
  let frames = 0;
  while (st.mode === 'death-cine' && frames++ < 600) h.pump(1);
  assert.ok(frames / 60 <= DCINE.REPEAT_DURATION / 1000 + 0.1, 'a repeat plays through at full speed: ' + (frames / 60).toFixed(2) + ' s');
  assert.equal(st.mode, 'dead');
});

// A key held down: its auto-repeat is not a second press. And '?' or F1 is a
// press like any other in every movie (it does not open help under a movie).
function checkHeldAndHelp(mode) {
  const ask = () => (mode === 'escape' ? T.escape.cine.ask : T.movies.current.skip.ask);
  h.pump(30);                                     // past the guard
  h.key('keydown', { key: ' ', preventDefault() {} });
  assert.ok(ask() > 0, mode + ': the first press shows SKIP');
  for (let i = 0; i < 5; i++) h.key('keydown', { key: ' ', repeat: true, preventDefault() {} });
  assert.equal(st.mode, mode, mode + ': holding the key does not skip');
  h.pump(160);                                    // the prompt runs out
  assert.equal(ask(), 0);
  kdown('?');
  assert.equal(st.mode, mode, mode + ': ? does not leave the movie');
  assert.ok(!st.helpMode, mode + ': and does not open help under it');
  assert.ok(ask() > 0, mode + ': ? shows SKIP like any key');
  kdown('Escape');
  assert.notEqual(st.mode, mode, mode + ': then one skip key skips');
  T.uiGuard.standDown();
}
S.check('in every movie a held key is one press, and ? shows SKIP', () => {
  kdown('c'); h.skipMovie(); h.pump(2); T.uiGuard.standDown();
  startRunAs('KNIGHT', 1);
  bossDown(0);
  enterPortal();
  assert.equal(st.mode, 'escape');
  checkHeldAndHelp('escape');
  kdown('c'); h.skipMovie(); h.pump(2); T.uiGuard.standDown();
  startRunAs('ROGUE', 2);
  bossDown(0);
  enterPortal();
  assert.equal(st.mode, 'portal-cine');
  checkHeldAndHelp('portal-cine');
  realDeath('PALADIN', 'CHASER');
  checkHeldAndHelp('death-cine');
});

// J opens the quest list in a run. Under a movie it is a press like any other:
// it shows SKIP, the movie keeps playing and the quests stay as they were.
function checkJ(mode) {
  const ask = () => (mode === 'escape' ? T.escape.cine.ask : T.movies.current.skip.ask);
  h.pump(30);                                     // past the guard
  const q0 = !!st.questsOpen;
  kdown('j');
  assert.equal(st.mode, mode, mode + ': J does not leave the movie');
  assert.ok(ask() > 0, mode + ': J shows SKIP');
  assert.equal(!!st.questsOpen, q0, mode + ': J does not open the quests under the movie');
  kdown('Escape');
  assert.notEqual(st.mode, mode);
  T.uiGuard.standDown();
}
S.check('in every movie J is a press: SKIP shows and the quests stay shut', () => {
  kdown('c'); h.skipMovie(); h.pump(2); T.uiGuard.standDown();
  startRunAs('KNIGHT', 1);
  bossDown(0);
  enterPortal();
  assert.equal(st.mode, 'escape');
  checkJ('escape');
  kdown('c'); h.skipMovie(); h.pump(2); T.uiGuard.standDown();
  startRunAs('ROGUE', 2);
  bossDown(0);
  enterPortal();
  assert.equal(st.mode, 'portal-cine');
  checkJ('portal-cine');
  realDeath('PALADIN', 'CHASER');
  checkJ('death-cine');
});

S.check('the escape preview in the settings is not counted as seen', () => {
  kdown('c'); h.skipMovie(); h.pump(2); T.uiGuard.standDown();
  startRunAs('WITCH', 2);
  const e0 = T.movies.seen('escape');
  T.escape.start({ test: true });
  assert.equal(st.mode, 'escape');
  h.pump(20);
  assert.equal(T.movies.seen('escape'), e0, 'a preview is not a showing');
  T.escape.finishNow(); h.pump(2);
  // A real escape still counts.
  kdown('Escape'); h.pump(2); T.uiGuard.standDown();
  startRunAs('WITCH', 1);
  bossDown(0);
  enterPortal();
  assert.equal(st.mode, 'escape');
  h.pump(2);
  assert.equal(T.movies.seen('escape'), e0 + 1, 'a real escape is counted');
  h.skipMovie();
});

S.check('the movies take the pilot of the run, not the one picked since', () => {
  kdown('c'); h.skipMovie(); h.pump(2); T.uiGuard.standDown();
  startRunAs('PALADIN', 2);
  prof.equippedCharacter = 'WITCH';   // changed on the profile after the run began
  bossDown(0);
  enterPortal();
  assert.equal(st.mode, 'portal-cine');
  assert.equal(T.movies.current.opts.hero.id, 'PALADIN', 'the run\'s own pilot');
  h.skipMovie();
});

S.check('the seen count: per kind, read before the showing, counted once', () => {
  const store = new Map();
  const ls = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  assert.equal(seenCount(ls, 'portal'), 0); assert.equal(isRepeat(ls, 'portal'), false);
  noteSeen(ls, 'portal'); noteSeen(ls, 'portal'); noteSeen(ls, 'death');
  assert.equal(seenCount(ls, 'portal'), 2); assert.equal(seenCount(ls, 'death'), 1); assert.equal(seenCount(ls, 'intro'), 0);
  assert.equal(isRepeat(ls, 'death'), true); assert.equal(isRepeat(ls, 'escape'), false);
  store.set(SEEN_KEY, 'not json');
  assert.equal(seenCount(ls, 'portal'), 0, 'a broken value reads as never seen');
  assert.equal(seenCount(null, 'portal'), 0, 'no storage: never seen');
});

S.check('reduced motion keeps the escape\'s still card, seen before or not', () => {
  kdown('c'); h.skipMovie(); h.pump(2); T.uiGuard.standDown();
  const mm = window.matchMedia;
  window.matchMedia = (q) => ({ matches: /prefers-reduced-motion/.test(String(q)) });
  try {
    assert.ok(T.movies.seen('escape') >= 1);
    startRunAs('KNIGHT', 1);
    bossDown(0);
    enterPortal();
    assert.equal(st.mode, 'escape');
    assert.equal(T.escape.cine.reduced, true, 'the still card');
    h.skipMovie();
  } finally { window.matchMedia = mm; }
});

S.check('unattended runs pass the portal and death movies by themselves, uncounted', () => {
  kdown('c'); h.skipMovie(); h.pump(2); T.uiGuard.standDown();
  const p0 = T.movies.seen('portal'), d0 = T.movies.seen('death');
  T.auto.on = true;
  T.setPilotMode('AUTO_ALL');
  T.auto.runsInRow = 1;
  T.auto.restart();
  h.pump(2); freeze(); st.wave.endsAt = st.time + 1e9; st.player.invuln = 1e6;
  assert.equal(st.unattended, true);
  st.wave.num = 2;
  bossDown(0);
  const modes = new Set();
  let g = 0;
  // (A draft on the way resolves itself on an unattended run.)
  while ((st.mode === 'playing' || st.mode === 'draft' || st.mode === 'evolve') && g++ < 3600) {
    if (st.portal) { st.player.x = st.portal.x; st.player.y = st.portal.y; }
    h.pump(1, () => { modes.add(st.mode); st.player.invuln = 1e6; });
  }
  assert.ok(!modes.has('portal-cine'), 'no portal movie frame: ' + [...modes].join(','));
  assert.equal(st.mode, 'intermission');
  st.mode = 'playing'; st.player.invuln = 0; st.player.hp = 1; st.player.potions.hp = 0;
  T.die();
  assert.equal(st.mode, 'dead', 'the death movie passes by itself');
  assert.equal(T.movies.seen('portal'), p0, 'not counted'); assert.equal(T.movies.seen('death'), d0);
  T.auto.on = false;
});

S.done();
