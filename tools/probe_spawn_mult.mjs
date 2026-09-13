// G20C follow-up probe: is the test_stages spawnMult tie (count(snow) < count(base))
// probe variance, or does the spawn seam leak spawnMult?
import { boot } from '../test/_harness.mjs';
import { DEFAULT_STAGE_ID } from '../src/stages.js';

const h = await boot();
const T = h.T, st = T.state;

function countSpawned(stageId, frames) {
  st.mode = 'menu';
  h.elements['ov-cards'].innerHTML = '';
  T.stages.select(stageId);
  T.startRun();
  const seen = new Set();
  h.pump(frames, () => { for (const e of st.enemies) seen.add(e); });
  return seen.size;
}

const N = 60;
let ties = 0, snowMore = 0;
const bs = [], ss = [];
for (let i = 0; i < N; i++) {
  const b = countSpawned(DEFAULT_STAGE_ID, 900);
  const s = countSpawned('SNOWFIELD', 900);
  bs.push(b); ss.push(s);
  if (s === b) ties++;
  if (s > b) snowMore++;
}
const stat = (a) => ({ min: Math.min(...a), max: Math.max(...a), mean: (a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) });
const mb = stat(bs), ms = stat(ss);
console.log('base  ', JSON.stringify(mb));
console.log('snow  ', JSON.stringify(ms));
console.log('mean ratio snow/base = ' + (Number(ms.mean) / Number(mb.mean)).toFixed(3) + '  (spawnMult 0.7 => expect ~0.70)');
console.log('ties ' + ties + '/' + N + '  snow>base ' + snowMore + '/' + N);
