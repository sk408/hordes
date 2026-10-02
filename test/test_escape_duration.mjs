// The escape minigame, measured headlessly: the AUTO runner finishes a corridor
// in about 25-30 s, the HUD shows the payout up front, and a skip states what
// it passes up (the Escape Writ keeps the payout on a skip).
// Run: node test/test_escape_duration.mjs
import assert from 'node:assert/strict';
import { suite } from './_harness.mjs';
import { createSim, step } from '../src/escape/sim.js';
import { inputFor } from '../src/escape/auto.js';
import { PACING } from '../src/escape/config.js';
import { payoutFor } from '../src/escape/payout.js';

const S = suite('test_escape_duration');

S.check('AUTO finishes the corridor in roughly 25-30 s (nominal) across seeds', () => {
  const secs = [];
  for (const seed of [1, 4, 9, 21, 33, 48]) {
    const sim = createSim(seed);
    let n = 0;
    while (!sim.outcome && n < 60 * 150) { step(sim, 1 / 60, inputFor(sim)); n++; }
    assert.equal(sim.outcome, 'complete', 'seed ' + seed + ' finished ' + sim.outcome);
    secs.push(sim.t);
  }
  const med = secs.slice().sort((a, b) => a - b)[Math.floor(secs.length / 2)];
  console.log('  MEASURED escape length (AUTO, 6 seeds): median ' + med.toFixed(1) + 's, range ' +
    Math.min(...secs).toFixed(1) + '-' + Math.max(...secs).toFixed(1) + 's');
  assert.ok(med >= PACING.MIN_SECONDS - 5 && med <= PACING.MAX_SECONDS + 10,
    'median ' + med.toFixed(1) + 's is about ' + PACING.MIN_SECONDS + '-' + PACING.MAX_SECONDS + 's');
  for (const s of secs) assert.ok(s <= 45, 'no seed runs long: ' + s.toFixed(1) + 's');
});

S.check('the payout is shown up front and a skip states what it passes up', async () => {
  const R = await import('../src/escape/render.js');
  const src = (await import('node:fs')).readFileSync(new URL('../src/escape/render.js', import.meta.url), 'utf8');
  assert.ok(/ESCAPE: \+' \+ worth \+ ' gold/.test(src), 'the HUD line says what finishing banks');
  assert.ok(/SKIP: lose ' \+ worth \+ 'g/.test(src), 'the skip button says what it loses');
  assert.ok(/SKIP: keep ' \+ worth \+ 'g/.test(src), 'with the writ the skip button says it keeps the gold');
  assert.ok(typeof R.draw === 'function');
  // The hand-back line (index.js) states the forgone amount on a plain skip and
  // the banked amount with the writ.
  const idx = (await import('node:fs')).readFileSync(new URL('../src/escape/index.js', import.meta.url), 'utf8');
  assert.ok(/gold passed up/.test(idx), 'skip hand-back names the forgone gold');
  assert.ok(/Escape Writ: \+' \+ worth \+ ' gold banked/.test(idx), 'writ hand-back names the banked gold');
  assert.ok(payoutFor(1500) > 0, 'a best-gold profile has a payout to show');
});

S.done();
