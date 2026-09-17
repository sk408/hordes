// RSS8 gold-delta measurement: the Magnet Collector's income effect, measured
// on the REAL loop (tools/real_loop.mjs shims) with NO balance constant
// touched. Two arms, identical in every respect except one holds the card's
// run-local flag from run start (st.player.skills.magnet — the exact flag the
// drafted card sets; the draft pick itself is RNG-gated and would add noise,
// not signal). The AUTO pilot fires the sweep on its own floor-value policy
// in both arms' default AUTO_ALL mode.
//
// METRIC: the run's LIVE PURSE (profile.runPurse, the in-run wallet every
// kill pays into) sampled at a FIXED 180s truncation — maxed runs reach the
// END_WAVE finale ~190s and die inside the maw fight's death-cine without a
// settle, so end-of-run settlement reads 0 for BOTH arms; the purse rate
// (gold per second) is the honest comparable. Gems/potions do not despawn
// and the AUTO pilot already loots, so the expected delta is TIME-shaped
// (faster floor clears -> more combat uptime), not guaranteed-positive;
// the numbers are REPORTED, nothing is tuned.
//
// ONE ARM PER PROCESS — run twice and compare:
//   node tools/rss8_gold_delta.mjs noCard
//   node tools/rss8_gold_delta.mjs magnet
import { runRealCohort } from './real_loop.mjs';

const arm = process.argv[2];
if (arm !== 'noCard' && arm !== 'magnet') {
  console.error('usage: node tools/rss8_gold_delta.mjs noCard|magnet'); process.exit(2);
}
const armMagnet = arm === 'magnet';
const RUNS = 8;
const CAP_S = 180;

let liveSt = null;
let purseAtStart = 0;
const samples = [];   // [time, purse EARNED this run] — deltas, because a truncated
// run never settles and the unbanked purse would otherwise carry across runs
const recs = await runRealCohort('maxed', RUNS, {
  maxSeconds: CAP_S,
  onRunStart: (st) => { liveSt = st; purseAtStart = st.runPurse || 0; st.player.skills.magnet = armMagnet; },   // run-local, frame 1
  onRun: () => { samples.push([liveSt.time, (liveSt.runPurse || 0) - purseAtStart]); },
});
const rate = samples.map(([t, purse]) => purse / Math.max(1, t));
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const causes = recs.map(r => r.cause).join(',');
console.log(arm + ': purse/s mean ' + mean(rate).toFixed(1) +
  '  purse=[' + samples.map(s => Math.round(s[1])).join(',') + ']' +
  ' time=[' + samples.map(s => Math.round(s[0])).join(',') + '] causes=' + causes);
