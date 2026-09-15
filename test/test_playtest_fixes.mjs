// HORDES — playtest fixes (Sk408 test-player round).
//
// Four notes came back; three are code, one is a tuning verdict:
//   1. the wave-end modifiers vanished when taken — they must stay so the pick
//      can be CHANGED (only one is active per wave by design);
//   2. the boss-arrival animation blocks input, so a GREEDY player was destroyed
//      on a stance they could not change — the pilot now eases to
//      CONFIG.AUTOPILOT.BOSS_STANCE for the fight and hands it back after;
//   3. the coachmark tip could be pushed off-screen (the "galaxy embed");
//   4. the balance is bimodal — that one is measured by the sims/wave report,
//      not asserted here.
// Run: node test/test_playtest_fixes.mjs
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';
import { applyChoice } from '../src/choices.js';
import { CONFIG as C } from '../src/config.js';
import { Tour } from '../src/tour.js';

const S = suite('PLAYTEST FIXES');
const h = await boot();
const st = h.state;
const T = h.T;

// One frame with the hero kept alive (smoke.mjs trick) — these tests are about
// progression state, not about surviving.
const step = () => h.pump(1, () => { st.player.hp = st.player.stats.maxHp; });
const cards = () => (h.elements['ov-cards'] ? h.elements['ov-cards'].children : []);
const cardWith = (t) => cards().find(c => (c.innerHTML || '').includes(t));

function runToIntermission() {
  T.startRun();
  h.pump(2);
  st.wave.endsAt = st.time;                    // the wave boss is due NOW
  let g = 0;
  while (!(st.wave.bosses || []).some(b => b.hp > 0) && g++ < 900) step();
  assert.ok((st.wave.bosses || []).some(b => b.hp > 0), 'the wave cast spawned');
  st.wave.endsAt = st.time + 1e9;
  for (const b of st.wave.bosses) if (b.hp > 0) b.hp = 0;
  g = 0;
  while (st.mode !== 'intermission' && g++ < 8000) {
    if (st.mode === 'draft' || st.mode === 'evolve') {
      const c = cards()[0];
      if (c) { c.click(); continue; }
    }
    // RETARGETED 2026-09-15 (V1): the wave-1 boss now hands the run through
    // the ESCAPE before the intermission (95-135s of corridor — over this
    // loop's frame budget when it runs long). Skip it through the mode's own
    // seam (the contract the painted SKIP rect drives) and pump through the
    // outcome hold to the intermission this test is about.
    if (st.mode === 'escape') {
      T.escape.skip();
      step();
      continue;
    }
    step();
  }
}

// ============================================================================
S.check('the wave-end modifiers stay on screen and the pick can be CHANGED', () => {
  runToIntermission();
  assert.equal(st.mode, 'intermission', 'we are at a wave-end intermission');
  const offers = st.pendingChoiceOffers;
  assert.equal(offers.length, 3, 'three blessing offers are on the table');

  const before = { ...st.player.stats };
  const hpBefore = st.player.hp;
  // The oracle: what a card SHOULD do to this exact base, computed by the real
  // applyChoice on a probe — so "swapped" cannot be confused with "stacked".
  const oracle = (offer) => {
    const probe = { stats: { ...before }, hp: hpBefore, choices: null };
    applyChoice(probe, offer);
    return probe.stats;
  };

  const first = cardWith('BLESSING');
  assert.ok(first, 'a BLESSING card is on the intermission');
  first.click();                                   // take offer #1

  assert.equal(st.waveChoice && st.waveChoice.id, offers[0].id, 'the pick is recorded');
  assert.equal(cards().filter(c => (c.innerHTML || '').includes('BLESSING')).length, 3,
    'ALL THREE offers are still on screen after taking one');
  assert.ok(cardWith('[ACTIVE]'), 'the taken offer is marked ACTIVE');
  assert.deepEqual(st.player.stats, oracle(offers[0]), 'the first blessing applied exactly once');

  // Now CHANGE the pick: the second offer must REPLACE the first, not stack on it.
  const second = cards().find(c => (c.innerHTML || '').includes('BLESSING') &&
    !(c.innerHTML || '').includes('[ACTIVE]'));
  assert.ok(second, 'another offer is still pickable');
  second.click();
  assert.equal(st.waveChoice.id, offers[1].id, 'the pick changed');
  assert.deepEqual(st.player.stats, oracle(offers[1]),
    'the swap applies the new blessing on the ORIGINAL base (no stacking)');
  assert.ok(!st.takenChoices.includes(offers[0].id),
    'the swapped-out blessing is un-taken (it may be offered again later)');
  assert.ok(st.takenChoices.includes(offers[1].id), 'only the active pick is held');
  assert.equal(cards().filter(c => (c.innerHTML || '').includes('[ACTIVE]')).length, 1,
    'exactly one offer reads ACTIVE');
});

S.check('a new wave resets the pick (a fresh set of offers)', () => {
  const before = { ...st.player.stats };
  const cont = cardWith('CONTINUE');
  assert.ok(cont, 'CONTINUE is offered');
  cont.click();
  assert.equal(st.mode, 'playing', 'the run continued');
  assert.equal(st.waveChoice, null, 'the pick is cleared for the new wave');
  assert.equal(st.waveChoiceSnap, null, 'and so is the snapshot');
  assert.deepEqual(st.player.stats, before, 'continuing does not touch the stats');
});

// ============================================================================
S.check('a boss arrival eases the stance, and the boss kill hands it back', () => {
  T.startRun();
  h.pump(2);
  T.controller.stance = 'GREEDY';
  assert.equal(T.stanceOf(), 'GREEDY', 'the player picked GREEDY');

  st.wave.endsAt = st.time;                        // boss incoming
  let g = 0;
  while (!(st.wave.bosses || []).some(b => b.hp > 0) && g++ < 900) step();
  assert.ok((st.wave.bosses || []).some(b => b.hp > 0), 'the wave cast spawned');
  assert.equal(T.stanceOf(), C.AUTOPILOT.BOSS_STANCE,
    'the pilot eased to the boss stance for the arrival (' + C.AUTOPILOT.BOSS_STANCE + ')');

  st.wave.endsAt = st.time + 1e9;
  for (const b of st.wave.bosses) if (b.hp > 0) b.hp = 0;
  step();
  assert.equal(T.stanceOf(), 'GREEDY', 'the doctrine is handed back once the cast is down');
});

S.check('a deliberate mid-fight change is NOT overridden', () => {
  T.startRun();
  h.pump(2);
  T.controller.stance = 'GREEDY';
  st.wave.endsAt = st.time;
  let g = 0;
  while (!(st.wave.bosses || []).some(b => b.hp > 0) && g++ < 900) step();
  assert.equal(T.stanceOf(), C.AUTOPILOT.BOSS_STANCE, 'eased for the boss');
  T.controller.stance = 'BALANCED';                // the player moves it mid-fight
  st.wave.endsAt = st.time + 1e9;
  for (const b of st.wave.bosses) if (b.hp > 0) b.hp = 0;
  step();
  assert.equal(T.stanceOf(), 'BALANCED', 'the player\'s mid-fight choice wins');
});

// ============================================================================
S.check('the coachmark tip is clamped INSIDE the viewport (the embed bug)', () => {
  const mkEl = () => {
    const e = {
      style: {}, children: [], className: '', id: '', innerHTML: '',
      offsetWidth: 0, offsetHeight: 0,
      appendChild(c) { this.children.push(c); return c; },
      addEventListener() {}, removeEventListener() {},
      remove() {},
    };
    return e;
  };
  const mkDoc = (w, hgt) => ({
    defaultView: { innerWidth: w, innerHeight: hgt },
    body: mkEl(),
    createElement: () => mkEl(),
    addEventListener() {}, removeEventListener() {},
    getElementById: () => null,
  });

  // The embed: a SHORT viewport with the target hugging the bottom edge — the
  // old clamp put the tip at B + 4 and let it run off the bottom.
  const doc = mkDoc(480, 300);
  let rect = { left: 300, top: 262, right: 340, bottom: 292, width: 40, height: 30 };
  const targetEl = { getBoundingClientRect: () => rect, offsetWidth: 40, offsetHeight: 30 };
  const tour = new Tour({ steps: [{ id: 'x', text: 'hi', target: () => targetEl }], doc });
  tour.start();
  assert.ok(tour.active(), 'the coachmark mounted with a live target');
  rect = { left: 300, top: 262, right: 340, bottom: 292, width: 40, height: 30 };
  tour._layout();
  const top = parseInt(tour.tip.style.top, 10);
  const left = parseInt(tour.tip.style.left, 10);
  const tipH = Math.max(24, tour.tip.offsetHeight || 46);
  const tipW = Math.max(120, tour.tip.offsetWidth || 190);
  assert.ok(top >= 4, 'the tip starts on screen (top ' + top + ')');
  assert.ok(top + tipH <= 301, `the tip FITS vertically (${top} + ${tipH} <= 300)`);
  assert.ok(left >= 4 && left + tipW <= 481, `the tip fits horizontally (${left} + ${tipW} <= 480)`);

  // A short viewport with a tiny target at the TOP: nothing may be pushed off.
  const doc2 = mkDoc(320, 200);
  const tour2 = new Tour({ steps: [{ id: 'x', text: 'hi', target: () => targetEl }], doc: doc2 });
  tour2.start();
  rect = { left: 0, top: 0, right: 12, bottom: 12, width: 12, height: 12 };
  tour2._layout();
  const t2 = parseInt(tour2.tip.style.top, 10);
  assert.ok(t2 >= 4 && t2 + tipH <= 201, `a top-edge target stays on screen (top ${t2})`);
  tour._teardown();
  tour2._teardown();
});

S.done();
