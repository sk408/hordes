// HORDES - the launch movie in the real game (R2 row 5). A new player sees the
// 5 s road shot and lands on the title with only the menu fade left; a
// returning player (a finished run) sees the 1 s stamp and has the menu at
// 1.5 s; reduced motion gets the 1 s still; a skip keeps the title's own
// art beat; the What's New note still comes up on the title after the movie.
// Run: node test/test_intro_launch.mjs
import assert from 'node:assert/strict';
import { boot, suite, dtMs } from './_harness.mjs';

const S = suite('intro launch');
const PROFILE_KEY = 'hordes_profile_v1';
const veteran = (extra = {}) => JSON.stringify({ version: 8, lastPlayed: Date.now(), equippedCharacter: 'ROGUE',
  unlockedCharacters: ['KNIGHT', 'ROGUE'],
  achievements: { totals: { runs: 1 } }, ...extra });

// Pump until the movie ends; returns how long it ran, in ms of launch time.
function playOut(h, maxMs = 9000) {
  const st = h.state;
  const t0 = h.T.movies.current.t0;   // the launch
  let n = 0;
  while (st.mode === 'intro' && n * dtMs < maxMs) { h.pump(1); n++; }
  return performance.now() - t0;
}
// Is the What's New card somewhere under this element?
const hasNote = (e, d = 0) => !!e && d < 12 &&
  (String(e.className || '').includes('wn-over') || (e.children || []).some(c => hasNote(c, d + 1)));
// Pump until the title's reveal settles; returns the ms it took.
function settle(h, maxMs = 3000) {
  const t0 = performance.now();
  let n = 0;
  while (h.state.titleReveal && h.state.titleReveal.phase !== 'settled' && n * dtMs < maxMs) { h.pump(1); n++; }
  return performance.now() - t0;
}

{
  const h = await boot({ variant: 'fresh' });
  const T = h.T, st = h.state;
  S.check('a new player: the 5 s road, then the title with only the menu fade', () => {
    assert.equal(st.mode, 'intro');
    const o = T.movies.current.opts;
    assert.equal(o.returning, false, 'no finished run: not a returning player');
    assert.equal(o.reduced, false);
    assert.equal(o.hero.id, 'KNIGHT', 'the equipped hero (the Knight on a new profile)');
    assert.equal(T.whatsNew.tried, false, 'the note waits for the title');
    const ran = playOut(h);
    assert.ok(ran >= 5000 && ran < 5000 + 2 * dtMs, 'the road ran 5 s: ' + ran.toFixed(0));
    assert.equal(st.mode, 'title');
    assert.equal(st.titleReveal.phase, 'fade', 'the movie ended on the painting: no art-alone beat');
    const fade = settle(h);
    assert.ok(fade <= 500 + 2 * dtMs, 'the menu is up 0.5 s later: ' + fade.toFixed(0));
    assert.equal(T.whatsNew.tried, true, 'the title ran its launch checks');
    assert.equal(T.movies.seen('intro'), 1);
  });
}
{
  const h = await boot({ variant: 'skip' });
  const st = h.state;
  S.check('a skip lands on the title with its art beat (the painting was not shown yet)', () => {
    assert.equal(st.mode, 'intro');
    h.pump(60);
    h.key('keydown', { key: 'w', preventDefault() {} });
    h.key('keydown', { key: 'Enter', preventDefault() {} });
    assert.equal(st.mode, 'title', 'the second press skipped');
    assert.equal(st.titleReveal.phase, 'art', 'the art alone first, then the menu');
    assert.equal(h.T.uiGuard.armed(), true, 'the skipping press cannot also press a card');
  });
}
{
  const h = await boot({ variant: 'vet', storage: [[PROFILE_KEY, veteran()]] });
  const T = h.T, st = h.state;
  S.check('a returning player: the 1 s stamp, the menu at 1.5 s', () => {
    assert.equal(st.mode, 'intro');
    const o = T.movies.current.opts;
    assert.equal(o.returning, true, 'a finished run: a returning player');
    assert.equal(o.hero.id, 'ROGUE', 'the equipped hero is the movie\'s');
    const ran = playOut(h);
    assert.ok(ran >= 1000 && ran < 1000 + 2 * dtMs, 'the stamp ran 1 s: ' + ran.toFixed(0));
    assert.equal(st.titleReveal.phase, 'fade');
    const fade = settle(h);
    assert.ok(ran + fade <= 1500 + 3 * dtMs, 'the menu is up 1.5 s after launch: ' + (ran + fade).toFixed(0));
  });
}
{
  // The stamp's slam: the frame loop must ask phaseAt with the movie's
  // options, or the stamp reads as the road's CHASE and never slams.
  const h = await boot({ variant: 'vet-cue', storage: [[PROFILE_KEY, veteran()]] });
  const T = h.T, st = h.state;
  S.check('a returning player: the slam plays once, when the logo lands (0.5 s)', () => {
    assert.equal(st.mode, 'intro');
    const t0 = T.movies.current.t0;
    const cues = [];
    const real = T.audio.get();
    T.audio.set({ ...real, playIntroCue(ph) { cues.push([ph, performance.now() - t0]); return real.playIntroCue(ph); } });
    try { playOut(h); } finally { T.audio.set(real); }
    const slams = cues.filter(([ph]) => ph === 'TITLE');
    assert.equal(slams.length, 1, 'one slam: ' + JSON.stringify(cues));
    assert.ok(slams[0][1] >= 500 && slams[0][1] < 500 + 2 * dtMs, 'at the landing: ' + slams[0][1].toFixed(0));
    assert.ok(!cues.some(([ph]) => ph === 'CHASE' || ph === 'OVERTAKE' || ph === 'FADE'), 'no road cues on the stamp: ' + JSON.stringify(cues));
  });
}
{
  const h = await boot({ variant: 'note', storage: [[PROFILE_KEY, veteran({ lastPlayed: undefined })]] });
  const T = h.T, st = h.state;
  S.check('the What\'s New note comes up on the title after the movie', () => {
    const note = () => Object.values(h.elements).some(e => hasNote(e));
    assert.equal(T.whatsNew.tried, false);
    assert.equal(note(), false, 'no note over the movie');
    playOut(h);
    assert.equal(st.mode, 'title');
    assert.equal(T.whatsNew.tried, true, 'tried on the first title entry, after the movie');
    assert.equal(note(), true, 'the note card is on the title');
  });
}
{
  const h = await boot({ variant: 'still', reducedMotion: true });
  const T = h.T, st = h.state;
  S.check('reduced motion: the 1 s still of the title', () => {
    assert.equal(T.movies.current.opts.reduced, true);
    const ran = playOut(h);
    assert.ok(ran >= 1000 && ran < 1000 + 2 * dtMs, 'the still held 1 s: ' + ran.toFixed(0));
    assert.equal(st.mode, 'title');
  });
}
S.done();
