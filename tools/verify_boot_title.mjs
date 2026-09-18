// BOOT GATE — proves the game loads to the title in a real browser BEFORE anything is pushed.
// Why this exists: the 2026-09-18 outage shipped because every harness here is node/stub-DOM.
// A top-level TDZ error in the browser bundle passed the whole suite, and Pages served a page
// that died before painting. This gate is the missing step.
// Usage: node tools/verify_boot_title.mjs      (exit 0 = booted to title, 1 = failed)
import { withPage } from './browser.mjs';

let mode = null, canvas = 0, text = '', errs = [];
try {
  await withPage({ w: 390, h: 844, skipTour: true, skipPrologue: true }, async ({ evaluate, errors, waitFor }) => {
    // the page has to reach the title on its own (past the intro) — a dead bundle never does
    await waitFor("(async()=>{ const T=(await import('./src/main.js')).__TEST; "
      + "return !!(T && T.state && T.state.mode && T.state.mode !== 'intro'); })()", 20000);
    const raw = await evaluate("(async()=>{ const T=(await import('./src/main.js')).__TEST;"
      + " const cv=document.querySelector('canvas');"
      + " return JSON.stringify({ mode: T.state.mode, cw: cv?cv.width:0, ch: cv?cv.height:0,"
      + " text: (document.body.innerText||'').replace(/\\s+/g,' ').trim().slice(0,140) }); })()");
    const r = JSON.parse(raw);
    mode = r.mode; canvas = r.cw * r.ch; text = r.text;
    errs = (errors && errors.length ? errors : []).slice(0, 5);
  });
} catch (e) {
  console.log('BOOT GATE: FAIL - the page never reached the title.');
  console.log('   ' + String(e.message).split('\n')[0]);
  process.exit(1);
}

if (errs.length) {
  console.log('BOOT GATE: FAIL - page errors were raised during load:');
  for (const x of errs) console.log('   ' + String(x).split('\n')[0]);
  process.exit(1);
}
if (!canvas) {
  console.log('BOOT GATE: FAIL - reached "' + mode + '" but painted no canvas.');
  process.exit(1);
}
console.log('BOOT GATE: PASS - loaded to the title in a real browser.');
console.log('   mode=' + mode + ' canvas=' + canvas + 'px | text=' + JSON.stringify(text));
process.exit(0);
