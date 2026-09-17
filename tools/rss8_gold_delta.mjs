// RSS8 gold-delta measurement: the Magnet Collector's income effect, measured
// on the REAL loop (tools/real_loop.mjs shims) with NO balance constant
// touched. Two arms, identical in every respect except one holds the card's
// run-local flag from frame 1 (st.player.skills.magnet — the exact flag the
// drafted card sets; the draft pick itself is RNG-gated and would add noise,
// not signal). The AUTO pilot fires the sweep on its own floor-value policy
// in both arms' default AUTO_ALL mode.
//
// Metric: the record's REAL settled gold per run + run time. Gems/potions do
// not despawn and the AUTO pilot already loots, so the expected delta is
// TIME-shaped (faster floor clears -> more combat uptime), not
// guaranteed-positive; the numbers are REPORTED, nothing is tuned.
// Run: node tools/rss8_gold_delta.mjs
import { bootReal, runRealCohort } from './real_loop.mjs';

// runRealCohort owns its loop and offers no run-start hook, but its bootReal
// resolves to the SAME cached main.js module — so __TEST (and its startRun
// seam) is shared and can be wrapped to arm the flag at every run start.
const h = await bootReal('maxed');
const T = (await import('../src/main.js')).__TEST;
if (T.state !== h.state) throw new Error('module cache assumption broken — abort');

const RUNS = 8;
const origStart = T.startRun;
const stats = (recs) => {
  const gold = recs.map(r => r.gold);
  const time = recs.map(r => r.time);
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  return { goldMean: mean(gold), timeMean: mean(time), n: recs.length,
    gold: gold.map(g => Math.round(g)), time: time.map(t => Math.round(t)) };
};

let armMagnet = false;
T.startRun = (...a) => {
  const r = origStart.apply(T, a);
  T.state.player.skills.magnet = armMagnet;   // the drafted card's own flag
  return r;
};

const out = {};
for (const [name, flag] of [['no-card', false], ['magnet', true]]) {
  armMagnet = flag;
  const recs = await runRealCohort('maxed', RUNS, { maxSeconds: 240 });
  out[name] = stats(recs);
  console.log(name + ': gold/run mean ' + out[name].goldMean.toFixed(0) +
    ' time mean ' + out[name].timeMean.toFixed(0) + 's  gold=[' + out[name].gold.join(',') + '] time=[' + out[name].time.join(',') + ']');
}
const dGold = out.magnet.goldMean - out.noCard.goldMean;
const dPct = out.noCard.goldMean ? (dGold / out.noCard.goldMean * 100) : 0;
console.log('DELTA: gold/run ' + dGold.toFixed(0) + ' (' + (dPct >= 0 ? '+' : '') + dPct.toFixed(1) +
  '%), time/run ' + (out.magnet.timeMean - out.noCard.timeMean).toFixed(0) + 's — reported, no constant tuned');
T.startRun = origStart;
