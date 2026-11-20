// HORDES - the launch movie in the real game. Steve (2026-11): "I like the
// original movie" and "The game needs some branding. Some soul to it." So
// every player, new or returning (a finished run), sees the same original
// 7 s movie (src/intro.js), then the title with its own art beat; the slam
// lands with the stamp at 4.3 s; reduced motion gets a 1 s still of that
// movie; a skip keeps the title's art beat; the What's New note still comes
// up on the title after the movie.
// Run: node test/test_intro_launch.mjs
import assert from 'node:assert/strict';
import { boot, suite, dtMs } from './_harness.mjs';
import { INTRO_DURATION, TITLE_IMPACT, STILL_DURATION, durationOf } from '../src/intro.js';

const S = suite('intro launch');
const PROFILE_KEY = 'hordes_profile_v1';
const veteran = (extra = {}) => JSON.stringify({ version: 8, lastPlayed: Date.now(), equippedCharacter: 'ROGUE',
  unlockedCharacters: ['KNIGHT', 'ROGUE'],
  achievements: { totals: { runs: 1 } }, ...extra });

// Pump until the movie ends; returns how long it ran, in ms of launch time.
function playOut(h, maxMs = 12000) {
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
  // The harness stamps one finished run on every boot (to keep the first-run
  // prologue out of other tests). Take it back: this player is new.
  T.getProfile().achievements.totals.runs = 0;
  S.check('a new player: the original 7 s movie, then the title with its art beat', () => {
    assert.equal(st.mode, 'intro');
    assert.equal(T.getProfile().achievements.totals.runs, 0, 'a profile with no finished run');
    const o = T.movies.current.opts;
    assert.deepEqual(Object.keys(o).filter(k => k !== 'repeat').sort(), ['hero', 'reduced'], 'the movie has no cut for a returning player');
    assert.equal(o.reduced, false);
    assert.equal(o.hero.id, 'KNIGHT', 'the equipped hero (the Knight on a new profile)');
    assert.equal(T.whatsNew.tried, false, 'the note waits for the title');
    assert.equal(INTRO_DURATION, 7000, 'the original movie is 7 s');
    const ran = playOut(h);
    assert.ok(ran >= 7000 && ran < 7000 + 2 * dtMs, 'the movie ran 7 s: ' + ran.toFixed(0));
    assert.equal(st.mode, 'title');
    assert.equal(st.titleReveal.phase, 'art', 'the movie ends on black: the title shows its art first');
    settle(h);
    assert.equal(st.titleReveal.phase, 'settled', 'the menu came up');
    assert.equal(T.whatsNew.tried, true, 'the title ran its launch checks');
    assert.equal(T.movies.seen('intro'), 1);
  });
}
{
  // A tab opened in the background: no frame at all until it is shown.
  // The time before its first frame is not taken off the movie.
  const h = await boot({ variant: 'bg-tab' });
  const T = h.T, st = h.state;
  S.check('a tab hidden from the launch plays the whole movie once it is shown', () => {
    assert.equal(st.mode, 'intro');
    h.advanceClock(INTRO_DURATION + 3000);   // hidden: no frames, longer than the movie
    const shown = performance.now();
    h.pump(1);
    assert.equal(st.mode, 'intro', 'still on the movie on its first frame');
    let n = 0;
    while (st.mode === 'intro' && n * dtMs < 12000) { h.pump(1); n++; }
    const ran = performance.now() - shown;
    assert.ok(ran >= INTRO_DURATION - 2 * dtMs && ran < INTRO_DURATION + 2 * dtMs,
      'the movie ran its 7 s after the tab was shown: ' + ran.toFixed(0));
    assert.equal(st.mode, 'title');
    assert.equal(T.movies.seen('intro'), 1);
  });
}
{
  const h = await boot({ variant: 'skip' });
  const st = h.state;
  S.check('a skip lands on the title with its art beat', () => {
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
  S.check('a returning player: the same full 7 s movie as a new one', () => {
    assert.equal(st.mode, 'intro');
    const o = T.movies.current.opts;
    assert.deepEqual(Object.keys(o).filter(k => k !== 'repeat').sort(), ['hero', 'reduced'], 'nothing in the movie knows the player has finished runs');
    assert.equal(durationOf(o), INTRO_DURATION, 'its length is the original one');
    assert.equal(o.hero.id, 'ROGUE', 'the equipped hero is the movie\'s');
    const ran = playOut(h);
    assert.ok(ran >= 7000 && ran < 7000 + 2 * dtMs, 'the movie ran 7 s, as for a new player: ' + ran.toFixed(0));
    assert.equal(st.mode, 'title');
    assert.equal(st.titleReveal.phase, 'art', 'the title shows its art first');
  });
}
{
  // The stingers of the original movie, for a returning player too: the
  // rising drone at 2.5 s, the slam when the stamp lands, the sweep at 6 s.
  const h = await boot({ variant: 'vet-cue', storage: [[PROFILE_KEY, veteran()]] });
  const T = h.T, st = h.state;
  S.check('a returning player: the drone, the slam when HORDES lands (4.3 s), the sweep', () => {
    assert.equal(st.mode, 'intro');
    const t0 = T.movies.current.t0;
    const cues = [];
    const real = T.audio.get();
    T.audio.set({ ...real, playIntroCue(ph) { cues.push([ph, performance.now() - t0]); return real.playIntroCue(ph); } });
    try { playOut(h); } finally { T.audio.set(real); }
    const slams = cues.filter(([ph]) => ph === 'TITLE');
    assert.equal(slams.length, 1, 'one slam: ' + JSON.stringify(cues));
    assert.ok(slams[0][1] >= TITLE_IMPACT && slams[0][1] < TITLE_IMPACT + 2 * dtMs, 'at the landing: ' + slams[0][1].toFixed(0));
    assert.deepEqual(cues.map(([ph]) => ph).filter(ph => ph !== 'DONE'), ['CHASE', 'OVERTAKE', 'TITLE', 'FADE'],
      'the original\'s cues in order: ' + JSON.stringify(cues));
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
  S.check('reduced motion: a 1 s still of the movie', () => {
    assert.equal(T.movies.current.opts.reduced, true);
    const ran = playOut(h);
    assert.ok(ran >= STILL_DURATION && ran < STILL_DURATION + 2 * dtMs, 'the still held 1 s: ' + ran.toFixed(0));
    assert.equal(st.mode, 'title');
  });
}
S.done();
