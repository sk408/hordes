// REPLAY TOUR — the brief's acceptance (owner 2026-09-18, REPLAY-TOUR REWIRE):
// the manual's REPLAY TOUR card no longer re-arms coach flags only — it
// restarts THE SPECIAL LEVEL itself (the inert prologue run), IMMEDIATELY
// from the title, for a RETURNING player, with the kill switch OFF.
//
// What this file pins, through the REAL seams:
//   1. SETUP: a returning profile (achievements.totals.runs >= 1 — the
//      harness's own stamp) with C.PROLOGUE.ENABLED === false (the shipped
//      default);
//   2. THE CARD: HOW TO PLAY from the title carries REPLAY TOUR; clicking it
//      starts a NEW run RIGHT NOW with state.prologue live and
//      state.assistedRun === true (the deliberate opt-in bypasses the kill
//      switch); the level is INERT (no enemy spawns, the clock frozen at 0)
//      and stages its potion (state.prologue.potion);
//   3. THE AUTOMATIC GATE STAYS OFF: a second boot of the same returning
//      profile starting a run the PLAIN way gets no prologue
//      (state.prologue === null) and no assisted stamp;
//   4. THE ASSISTED EXCLUSION FLOWS: the run's end card is tagged ASSISTED,
//      and recordRun keeps full counters (runs bumps) but writes NO best-run
//      record (bestTime untouched) — source pins + the driven path.
// Run: node test/test_replay_tour.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { boot, suite } from './_harness.mjs';
import { CONFIG as C } from '../src/config.js';
import { TOUR_KEYS } from '../src/tour.js';

const s = suite('test_replay_tour');

// ---- 0. the shipped gate state this whole file stands on -------------------------
s.check('C.PROLOGUE.ENABLED ships false (the kill switch default)', () => {
  assert.equal(C.PROLOGUE.ENABLED, false);
});
s.check('the arm expression: assistedRun OR (ENABLED && fresh profile) — opt-in bypasses the park', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.ok(/state\.prologue = \(state\.assistedRun \|\| \(C\.PROLOGUE\.ENABLED && prologueRunsPlayed === 0\)\)/
    .test(main), 'the startRun arm expression changed');
  assert.ok(/if \(state\.assistedRun\) tags\.push\('ASSISTED'\)/.test(main),
    'the end screen must tag ASSISTED runs');
  const ach = readFileSync(new URL('../src/achievements.js', import.meta.url), 'utf8');
  assert.ok(/if \(r\.assisted !== true\) \{/.test(ach),
    'recordRun must gate best-run records on the assisted flag');
  assert.ok(/assisted: state\.assistedRun/.test(main),
    'the settle must pass the live assistedRun flag into recordRun');
});

// ---- 1+2. THE CARD: returning profile, title -> HOW TO PLAY -> REPLAY TOUR --------
const h = await boot({ storage: [['hordes_onboarded', '1']] });
const T = h.T, st = h.state, elements = h.elements, pump = h.pump, key = h.key;
T.banners.suppressAll();
const cards = () => [...(elements['ov-cards'].children || [])];
const byTitle = (t) => cards().find(c => (c.innerHTML || '').includes('>' + t + '<'));

for (let i = 0; i < 60 * 12 && cards().length === 0; i++) pump(1);
s.check('boot: a RETURNING profile on the title (runs >= 1)', () => {
  assert.equal(elements['ov-title'].textContent, 'HORDES');
  assert.ok((T.getProfile().achievements.totals.runs || 0) >= 1, 'the harness stamped the returning profile');
});
s.check('the title offers HOW TO PLAY and the manual carries the REPLAY TOUR card', () => {
  const htp = byTitle('HOW TO PLAY');
  assert.ok(htp, 'no HOW TO PLAY card on the title');
  htp.click();
  assert.equal(elements['ov-title'].textContent, 'HOW TO PLAY');
  assert.ok(byTitle('REPLAY TOUR'), 'no REPLAY TOUR card in the manual (non-gate context)');
});

byTitle('REPLAY TOUR').click();
pump(2);
s.check('REPLAY TOUR from the title starts the special run IMMEDIATELY', () => {
  assert.equal(st.mode, 'playing', st.mode);
  assert.ok(st.prologue, 'state.prologue is null — the special level did not arm');
  assert.ok(T.prologue.active, 'the prologue phase is live');
});
s.check('the replayed run is flagged ASSISTED (the opt-in seam)', () => {
  assert.equal(st.assistedRun, true);
});
s.check('the special level stages its potion (state.prologue.potion, on screen)', () => {
  const po = T.prologue.potion;
  assert.ok(po, 'no potion');
  assert.ok(po.x >= 0 && po.x <= C.VIEW_W && po.y >= 0 && po.y <= C.VIEW_H,
    'the potion is on screen: ' + JSON.stringify(po));
});
{
  // REPLAY TOUR clearTourFlags()s — re-seal the coach flags so the level's
  // first draft (post-drink) cannot fire the draft coach mid-probe (this
  // file is not about the coaches; test_tour owns them).
  for (const k of Object.values(TOUR_KEYS)) globalThis.localStorage.setItem(k, '1');
  let maxEnemies = 0, clockMoved = false;
  for (let i = 0; i < 60 * 4; i++) {
    pump(1);
    maxEnemies = Math.max(maxEnemies, st.enemies.length);
    if (st.time !== 0) clockMoved = true;
  }
  s.check('the special level is INERT: no enemy spawns while the prologue is live', () => {
    assert.equal(maxEnemies, 0, maxEnemies + ' enemies spawned');
    assert.ok(T.prologue.active, 'the phase must still be live for the inertness to mean anything');
  });
  s.check('... and the run clock is frozen at 0 for the whole phase', () => {
    assert.ok(!clockMoved, 'state.time moved during the prologue');
  });
}

// ---- 4. THE ASSISTED EXCLUSION FLOWS (drive the real end) --------------------------
{
  // End the phase (the drink seam — the same payoff the walk-in fires), let
  // the run clock accrue a couple of seconds, then die through the real
  // ending. A NON-assisted run of t>0 would raise bestTime; the assisted
  // fold must not.
  T.prologue.drink();
  const step = (n) => {
    for (let i = 0; i < n; i++) {
      pump(1);
      if (st.mode === 'draft' || st.mode === 'evolve') {
        const c0 = cards()[0];
        if (c0 && c0.click) c0.click();
      }
    }
  };
  step(60 * 3);
  s.check('the phase ended at the drink and the clock runs', () => {
    assert.ok(!T.prologue.active, 'prologue still active after the drink');
    assert.ok(st.time > 1.5, 'the run clock accrued (t=' + st.time.toFixed(2) + ')');
  });
  const totals = T.getProfile().achievements.totals;
  const runs0 = totals.runs, best0 = totals.bestTime || 0;
  T.die();
  let guard = 0;
  while (st.mode === 'death-cine' && guard++ < 900) pump(1);
  s.check('the assisted run ended on the death screen, tagged ASSISTED', () => {
    assert.equal(st.mode, 'dead', st.mode);
    const html = cards().map(c => c.innerHTML || '').join('\n') +
      (elements['ov-sub'].innerHTML || '');
    assert.ok(html.includes('ASSISTED'), 'the end card carries the ASSISTED tag');
  });
  s.check('recordRun kept full counters (runs bumped) but wrote NO best-run record (bestTime untouched)', () => {
    assert.equal(totals.runs, runs0 + 1, 'the assisted run still counts as a run');
    assert.equal(totals.bestTime || 0, best0,
      'bestTime moved: ' + best0 + ' -> ' + totals.bestTime + ' (assisted runs set no records)');
  });
}

// ---- 3. THE AUTOMATIC GATE STAYS OFF (second boot, plain start) -------------------
// (A second boot replaces the DOM globals — nothing above may pump after this.)
{
  const h2 = await boot({ variant: 'replay-auto', storage: [['hordes_onboarded', '1']] });
  const T2 = h2.T, st2 = h2.state;
  T2.banners.suppressAll();
  assert.ok((T2.getProfile().achievements.totals.runs || 0) >= 1,
    'same returning-profile shape (the harness stamp)');
  T2.startRun();
  h2.pump(2);
  s.check('the plain start path arms NO prologue for a returning profile (automatic gate OFF)', () => {
    assert.equal(st2.prologue, null, 'a prologue armed without an opt-in');
    assert.equal(T2.prologue.active, false);
    assert.equal(st2.assistedRun, false, 'no assisted stamp without the opt-in');
    assert.equal(st2.mode, 'playing', st2.mode);
  });
  let spawned = false;
  for (let i = 0; i < 60 * 5; i++) { h2.pump(1); if (st2.enemies.length > 0) spawned = true; }
  s.check('... and the run is an ordinary live run (spawns, clock running)', () => {
    assert.ok(spawned, 'no enemies in 5s of an ordinary run');
    assert.ok(st2.time > 4, 'the clock runs from the start (t=' + st2.time.toFixed(1) + ')');
  });
}

s.done();
