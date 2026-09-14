// HORDES — M1 R2 determinism probe (child of test/test_atlas.mjs).
//
// NOT a test file: the runner globs test/test_*.mjs + test/smoke.mjs, so this
// helper is never executed on its own. The atlas R2 proof needs each arm in
// a FRESH process: within one process, kill/achievement UNLOCKS persist
// across startRun and change later runs' draft pools (measured: seeded run 2
// vs run 3 in one process diverge 94 kills vs 4 — process state, not the
// atlas). Usage: node test/_atlas_det_probe.mjs <on|off>
import { boot } from './_harness.mjs';
import { mulberry32 } from '../src/weather.js';

const atlasOn = process.argv[2] !== 'off';
const h = await boot({ storage: [['hordes_onboarded', '1']] });
const T = h.T, st = T.state;
T.banners.suppressAll();

Math.random = mulberry32(20260914);
st.mode = 'menu';
h.elements['ov-cards'].innerHTML = '';
T.startRun();
const p = st.player;
p.invuln = 1e9;                     // test pin: stretch the spawn stream (both arms)
if (!atlasOn) st.atlas = null;
let hash = 0;
for (let i = 0; i < 3600; i++) {
  h.pump(1);
  const ov = h.elements['overlay'];
  const cards = h.elements['ov-cards'] ? h.elements['ov-cards'].children : [];
  if (ov && ov.style.display === 'flex' && cards.length > 0) {
    if (st.mode === 'draft' || st.mode === 'evolve') {
      h.key('keydown', { key: '1', preventDefault() {} });
    } else {
      const cont = cards.find(c => (c.innerHTML || '').includes('CONTINUE'));
      if (cont) cont.click(); else h.key('keydown', { key: '1', preventDefault() {} });
    }
  }
  hash = (((hash * 31) + st.enemies.length + p.kills + (p.x | 0) + (p.y | 0)) | 0);
  if (st.mode === 'dead') break;
}
console.log([st.time.toFixed(3), st.mode, p.kills, p.level, st.wave.num,
  st.enemies.length, (T.getProfile().runPurse | 0), hash].join('|'));
process.exit(0);
