// Measures the new-player tutorial on fresh profiles: how long the guided part
// takes, how long run 1 survives after the handover, and what it pays.
//   node tools/measure_tutorial.mjs [runs=7] [mode=idle|active]
// idle   = no input at all (the pilot performs every step after the idle wait)
// active = a player who does each step about two seconds after it appears
import { boot } from '../test/_harness.mjs';

const N = Number(process.argv[2]) || 7;
const MODE = process.argv[3] || 'idle';
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[(s.length - 1) >> 1]; };
const rows = [];
for (let r = 0; r < N; r++) {
  const h = await boot({ tutorial: MODE !== 'none', variant: 'mt' + MODE + r, storage: [['hordes_onboarded', '1']] });
  const T = h.T, st = h.state;
  const key = (k) => h.key('keydown', { key: k, preventDefault() {} });
  const up = (k) => h.key('keyup', { key: k, preventDefault() {} });
  h.pump(3);
  if (st.mode === 'intro') { key('x'); h.pump(2); }
  T.startRun();
  let stepId = null, stepF = 0, f = 0;
  for (; f < 60 * 380 && st.mode !== 'dead'; f++) {
    if (st.mode === 'death-cine') key('x');
    if (MODE === 'active' && T.tut.live) {
      const m = T.tut.model;
      if (m && m.id !== stepId) { stepId = m.id; stepF = f; }
      const dt = f - stepF;
      if (m && m.id === 'move') { if (dt === 120) key('d'); if (dt === 170) up('d'); }
      if (m && dt === 120) {
        if (m.id === 'draft' || m.id === 'handover') T.tut.press(performance.now());
        if (m.id === 'evolve') h.elements['ov-cards'].children[0].click();
        if (m.id === 'skill') T.runAction('q');
        if (m.id === 'potion') T.runAction('h');
      }
    }
    h.pump(1);
  }
  const html = h.elements['ov-sub'].innerHTML || '';
  rows.push({ guidedS: +(T.tut.lastGuidedS || 0).toFixed(1), surviveS: +st.time.toFixed(1),
    gold: T.getProfile().gold, level: st.player.level, dead: st.mode === 'dead',
    parts: (html.match(/run award[^<]*/) || [''])[0] });
}
for (const r of rows) console.log(JSON.stringify(r));
console.log(MODE + ' n=' + N + ' median guided ' + med(rows.map(r => r.guidedS)) + 's, survival after handover ' +
  med(rows.map(r => r.surviveS)) + 's [' + Math.min(...rows.map(r => r.surviveS)) + '-' + Math.max(...rows.map(r => r.surviveS)) +
  '], gold ' + med(rows.map(r => r.gold)) + ' [' + Math.min(...rows.map(r => r.gold)) + '-' + Math.max(...rows.map(r => r.gold)) + ']');
process.exit(0);
