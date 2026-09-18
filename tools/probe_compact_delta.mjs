// One-off (2026-09-18, maximize-canvas report): the step-2 COMPACT delta —
// canvas rect with the ladder pinned OFF (persistent, full pads) vs AUTO
// (compact where it pays), plus the LIVE pilot badge text proving the A1/A2/M
// abbreviations render on the button. Size is argv (default 480x320) — the
// PAYS-FOR-ITSELF addendum re-runs it at portrait sizes to prove BOTH
// sacrifices refuse to engage there (gain 0, full labels, persistent strip).
// Run: node tools/probe_compact_delta.mjs [w] [h] [dpr]
import { withPage } from './browser.mjs';

const W = +(process.argv[2] || 480), H = +(process.argv[3] || 320);
const DPR = +(process.argv[4] || 1);
const LABEL = W + 'x' + H;

const MEASURE = `(async () => {
  const T = (await import('./src/main.js')).__TEST;
  const r = document.getElementById('game').getBoundingClientRect();
  const pad = document.querySelector('#touch .pad.left [data-act="pilot"]');
  const pr = pad.getBoundingClientRect();
  return { canvas: { w: +r.width.toFixed(2), h: +r.height.toFixed(2) },
    ladder: T.ladder, uiFit: T.uiFit,
    pilotBadge: pad.textContent.trim(),
    padW: +pr.width.toFixed(1), btnH: +pr.height.toFixed(1) };
})()`;
const SET_OVERRIDE = (v) => `(async () => { (await import('./src/main.js')).__TEST.setLadderOverride(${JSON.stringify(v)}); return true; })()`;

await withPage({ w: W, h: H, dpr: DPR, url: 'index.html',
  startupScript: "try { localStorage.setItem('hordes_onboarded', '1'); } catch (e) {}" },
  async (p) => {
    await p.waitFor("!!document.getElementById('game')", 15000);
    await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
    await p.waitFor("(async()=> (await import('./src/main.js')).__TEST.state.mode !== 'intro')()", 15000);
    await p.waitFor("(async()=>{ const rv=(await import('./src/main.js')).__TEST.state.titleReveal; return !rv || rv.phase==='settled'; })()", 8000);
    await p.sleep(120);
    const c = await p.evaluate("(()=>{ const el=[...document.getElementById('ov-cards').children].find(k=>(k.textContent||'').toUpperCase().includes('START GAME')); el.scrollIntoView({block:'center'}); const r=el.getBoundingClientRect(); return [Math.round(r.x+r.width/2), Math.round(r.y+r.height/2)]; })()");
    await p.tap(c[0], c[1]);
    await p.waitFor("(async()=>{ const st=(await import('./src/main.js')).__TEST.state; return st.mode==='playing' && st.time > 1.0; })()", 10000, 200);

    await p.evaluate(SET_OVERRIDE('off'));
    await p.sleep(80);
    const before = await p.evaluate(MEASURE);
    await p.evaluate(SET_OVERRIDE(null));
    await p.sleep(80);
    const after = await p.evaluate(MEASURE);
    // cycle pilot to AUTO_MOVE so the badge shows A2 (starts AUTO_ALL -> A1)
    const padT = await p.evaluate("(()=>{ const r=document.querySelector('#touch .pad.left [data-act=\\'pilot\\']').getBoundingClientRect(); return [Math.round(r.x+r.width/2), Math.round(r.y+r.height/2)]; })()");
    await p.tap(padT[0], padT[1]);
    await p.sleep(250);
    const after2 = await p.evaluate(MEASURE);
    await p.shot('compact-' + LABEL);
    console.log('RAW ' + LABEL + ' before(off) ' + JSON.stringify(before));
    console.log('RAW ' + LABEL + ' after(auto) ' + JSON.stringify(after));
    console.log('RAW ' + LABEL + ' after(pilot tap) ' + JSON.stringify(after2));
    console.log('errors: ' + JSON.stringify(p.errors));
  });
