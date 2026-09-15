// HORDES — G15 THE DEATH MOVIE (owner: "we also need a death movie if we
// don't have one").
// Run: node test/test_death_cine.mjs
//
// The movie plays on DEATH ONLY, between die()'s composition of the WAVE-26
// payoff overlay and that overlay's reveal. This file pins, through the REAL
// game (the same parked-enemy death path test_death_screen.mjs drives):
//   1. the pure timeline: phases are monotone, end exactly at the wall
//      duration, and isDone flips exactly once;
//   2. a real death enters 'death-cine' with the overlay HIDDEN and
//      chromeOn() false BY NAME (the WAVE-23 registration rule);
//   3. the payoff DOM after the hand-off is IDENTICAL to what die() composed
//      BEFORE the movie, gold settled EXACTLY ONCE, deathBy never re-stamped;
//   4. the key skip and the tap skip each exit the mode in ONE input, both
//      arming the uiGuard;
//   5. the WIN (runSurvived) and the deliberate exit (endRun) NEVER enter the
//      mode — instant overlay, as before;
//   6. 60Hz vs 120Hz parity: same elapsed wall time -> same phase, and the
//      natural (unskipped) exit lands at the same elapsed time.
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';
import * as DCINE from '../src/death_cine.js';
import { makeTypedEnemy } from '../src/enemy_types.js';

const S = suite('G15 death movie');
const h = await boot({ storage: [['hordes_onboarded', '1']] });
const st = h.state;
const T = h.T;
const elements = h.elements;
const overlay = elements['overlay'];

// ---- 1. the pure timeline -----------------------------------------------------
S.check('the phase timeline is monotone and ends exactly at the wall duration', () => {
  const ORDER = { BLOW: 0, COLLAPSE: 1, TAKEN: 2, HANDOFF: 3, DONE: 4 };
  let last = -1;
  for (let t = 0; t <= DCINE.CINE_DURATION + 1; t += 7) {   // off the frame grid
    const p = DCINE.phaseAt(t);
    const idx = ORDER[p];
    assert.ok(idx >= last, `phase went BACKWARD at t=${t}: ${p}`);
    last = idx;
  }
  assert.equal(DCINE.phaseAt(DCINE.CINE_DURATION), 'DONE', 'done at the wall duration');
  assert.equal(DCINE.PHASES.HANDOFF[1], DCINE.CINE_DURATION, 'the last phase ends at the wall duration');
  console.log('  MEASURED timeline: ' + Object.entries(DCINE.PHASES)
    .map(([k, v]) => k + ' ' + v[0] + '-' + v[1] + 'ms').join(', ')
    + ' | wall duration ' + DCINE.CINE_DURATION + 'ms ('
    + DCINE.CINE_DURATION / 1000 + 's, <= 6.0s)');
});
S.check('isDone flips exactly once over the whole timeline', () => {
  let flips = 0, prev = DCINE.isDone(-1);
  for (let t = 0; t <= DCINE.CINE_DURATION + 200; t += 7) {
    const now = DCINE.isDone(t);
    if (now !== prev) flips++;
    prev = now;
  }
  assert.equal(flips, 1, 'one false->true flip, never back');
  assert.equal(DCINE.isDone(DCINE.CINE_DURATION - 1), false, 'not done before the end');
  assert.equal(DCINE.isDone(DCINE.CINE_DURATION), true, 'done at the end');
});

// ---- a real death, the test_death_screen path ---------------------------------
// A typed enemy parked exactly on the hero: the contact path is the one real
// damage source a headless test can aim deterministically.
function realDeath(cause = 'SPITTER') {
  T.startRun();
  h.pump(3);
  assert.equal(st.mode, 'playing', 'run live');
  const p = st.player;
  p.hp = 1;                 // one contact hit is fatal
  p.invuln = 0;
  p.potions.hp = 0;         // the AUTO pilot cannot auto-drink the dip away
  st.spawnTimer = 999;      // no ambient spawns
  st.wave.endsAt = st.time + 9999;
  st.enemies.length = 0;
  const killer = makeTypedEnemy(cause, p.x, p.y, st.time);
  killer.hp = killer.maxHp = 1e6;   // survives the hero's own volley
  killer.speed = 0;                 // cannot drift off the hero
  st.enemies.push(killer);
  h.pump(30, () => { st.enemies.forEach(e => { e.speed = 0; e.x = p.x; e.y = p.y; }); });
  assert.equal(st.mode, 'death-cine', 'the death opened the movie');
  return killer;
}

// ---- 2. mode, overlay hidden, chrome OFF by name --------------------------------
S.check('a real death enters death-cine: overlay HIDDEN, chromeOn false BY NAME', () => {
  realDeath('SPITTER');
  assert.equal(overlay.style.display, 'none', 'the payoff overlay is hidden during the movie');
  assert.equal(T.chromeOn(), false, 'chromeOn() is false while the movie plays (pads/cog inert)');
  assert.equal(st.deathBy.cause, 'contact', 'die() stamped the cause BEFORE the movie');
  assert.equal(st.deathBy.typeId, 'SPITTER', 'die() stamped the killer BEFORE the movie');
  T.deathCine.end();        // leave clean for the next check
  assert.equal(st.mode, 'dead', 'the seam hands back to the payoff screen');
});

// ---- 3. composition, single settle, no re-stamp ---------------------------------
S.check('the hand-off reveals the IDENTICAL payoff; gold settled ONCE; deathBy never re-stamped', () => {
  // Script some purse gold so the payout is non-trivial and countable.
  T.purse.credit({ typeId: 'BRUTE' });
  T.purse.credit({ typeId: 'BRUTE' });
  const goldBefore = T.getProfile().gold;
  realDeath('BRUTE');

  // What die() composed, and what it paid, captured MID-MOVIE.
  const mid = {
    title: elements['ov-title'].textContent,
    sub: elements['ov-sub'].innerHTML,
    cards: Array.from(elements['ov-cards'].children).map(c => c.innerHTML || ''),
    deathBy: JSON.parse(JSON.stringify(st.deathBy)),
    profileGold: T.getProfile().gold,
  };
  assert.equal(overlay.style.display, 'none', 'still hidden mid-movie');
  const m = /GOLD EARNED: \+(\d+)/.exec(mid.sub);
  assert.ok(m, 'the composed payoff carries a gold line');
  const earned = Number(m[1]);
  assert.ok(earned > 0, 'the scripted purse made the payout non-zero');
  assert.equal(mid.profileGold - goldBefore, earned,
    'die() settled EXACTLY the composed gold, exactly once (+' + earned + ')');

  // Play the movie out NATURALLY (no skip): frame by frame, recording the
  // elapsed clock at the exact frame the hand-off lands.
  let frames = 0, exitT = 0;
  while (st.mode !== 'dead' && frames < 600) { h.pump(1); frames++; exitT = T.deathCine.t; }
  assert.equal(st.mode, 'dead', 'the natural end hands back to the payoff screen');
  assert.ok(exitT >= T.deathCine.duration && exitT <= T.deathCine.duration + 1000 / 60 + 1,
    'the exit frame is the first one past the duration (t=' + exitT + ')');
  console.log('  MEASURED natural exit at t=' + exitT + 'ms wall, '
    + T.deathCine.duration + 'ms design duration, ' + frames + ' pumped frames');

  assert.equal(overlay.style.display, 'flex', 'the payoff overlay is revealed by the hand-off');
  assert.equal(elements['ov-title'].textContent, mid.title, 'the title is die()-composed, untouched');
  assert.equal(elements['ov-sub'].innerHTML, mid.sub, 'the payoff body is IDENTICAL to the pre-movie composition');
  assert.deepEqual(Array.from(elements['ov-cards'].children).map(c => c.innerHTML || ''), mid.cards,
    'the RETRY/TITLE cards are IDENTICAL');
  assert.equal(T.getProfile().gold, mid.profileGold, 'the movie never pays: wallet unchanged after the hand-off');
  assert.deepEqual(st.deathBy, mid.deathBy, 'deathBy was not re-stamped');
});

// ---- 4. both skips, one input each ----------------------------------------------
S.check('the KEY skip exits the mode in one input and arms the guard', () => {
  realDeath('TICK');
  T.uiGuard.standDown();
  h.key('keydown', { key: 'x', preventDefault() {} });      // ONE input
  assert.equal(st.mode, 'dead', 'one keydown ended the movie');
  assert.equal(overlay.style.display, 'flex', 'and revealed the payoff');
  assert.equal(T.uiGuard.armed(), true, 'the same gesture cannot also press RETRY');
});
S.check('the TAP skip exits the mode in one input and arms the guard', () => {
  realDeath('CHASER');
  T.uiGuard.standDown();
  const tap = elements['game']._ev && elements['game']._ev.pointerdown;
  assert.ok(tap, 'the canvas pointerdown seam is registered');
  tap({ clientX: 240, clientY: 150, stopPropagation() {}, preventDefault() {} });   // ONE input
  assert.equal(st.mode, 'dead', 'one tap ended the movie');
  assert.equal(overlay.style.display, 'flex', 'and revealed the payoff');
  assert.equal(T.uiGuard.armed(), true, 'the guard is armed on the tap path too');
});

// ---- 5. the win and the deliberate exit never get the movie -----------------------
S.check('the WIN path never enters death-cine', () => {
  T.startRun();
  h.pump(2);
  T.run.runSurvived();
  assert.equal(st.mode, 'dead', 'the win lands on the payoff screen directly');
  assert.equal(elements['ov-title'].textContent, 'RUN SURVIVED', 'the win end card');
});
S.check('the deliberate exit (endRun) never enters death-cine', () => {
  T.startRun();
  h.pump(2);
  T.openSettings();
  const byTitle = (t) => Array.from(elements['ov-cards'].children)
    .find(c => (c.innerHTML || '').includes(t));
  byTitle('END RUN').click();
  byTitle('CONFIRM END RUN?').click();
  assert.equal(st.mode, 'dead', 'END RUN lands on the payoff screen directly');
  assert.equal(elements['ov-title'].textContent, 'RUN ENDED', 'the deliberate-exit end card');
});

// ---- 6. 60Hz vs 120Hz parity -------------------------------------------------------
S.check('60Hz and 120Hz agree: same elapsed time -> same phase, same natural exit', () => {
  const at = (frameMs) => {
    h.setFrameMs(frameMs);
    realDeath('BRUTE');
    // Advance to a fixed ELAPSED wall time: mid-TAKEN on the design timeline.
    const target = DCINE.PHASES.TAKEN[0] + 200;
    while (T.deathCine.t < target) h.pump(1);
    const phase = DCINE.phaseAt(T.deathCine.t);
    const tAtPhase = T.deathCine.t;
    // Natural exit from there: record the elapsed wall time at hand-off.
    while (st.mode !== 'dead') h.pump(1);
    h.setFrameMs(1000 / 60);
    return { phase, tAtPhase, exitT: T.deathCine.t };
  };
  const hz60 = at(1000 / 60);
  const hz120 = at(1000 / 120);
  assert.equal(hz60.phase, hz120.phase, `same phase at the same elapsed time (${hz60.phase})`);
  assert.ok(Math.abs(hz60.tAtPhase - hz120.tAtPhase) <= 1000 / 60 + 1,
    `the sampling frame is within one 60Hz frame (${hz60.tAtPhase} vs ${hz120.tAtPhase})`);
  assert.ok(Math.abs(hz60.exitT - hz120.exitT) <= 1000 / 60 + 1,
    `the natural exit lands at the same wall time within one 60Hz frame (${hz60.exitT} vs ${hz120.exitT})`);
  assert.ok(hz60.exitT <= 6100 && hz120.exitT <= 6100, 'both exits inside the <= 6.0s bar');
  console.log('  MEASURED 60Hz: phase ' + hz60.phase + ' at ' + hz60.tAtPhase + 'ms, exit ' + hz60.exitT
    + 'ms | 120Hz: phase ' + hz120.phase + ' at ' + hz120.tAtPhase + 'ms, exit ' + hz120.exitT + 'ms');
});

S.done();
