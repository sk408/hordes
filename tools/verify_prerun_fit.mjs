// HORDES - tools/verify_prerun_fit.mjs: the run setup screen fits a landscape
// phone. Real Chrome, real layout: at 844x390 and 667x375 every card of the
// setup screen ends inside the viewport and the screen does not scroll, for
// a fresh profile and for the longest stage and quest texts, in the
// browser's own monospace, in a wide one (phone monospace fonts are 0.6em a
// letter), and in the wide one with every :has() rule removed (a browser
// without it). 1280x720 is checked too (the desktop layout keeps its hints).
//   HORDES_CHROME=<chrome.exe> node tools/verify_prerun_fit.mjs [shotDir] [tag]
// With a shotDir it also saves prerun-<tag>-<case>-<size>.png. Exit 1 on a miss.
import path from 'node:path';
import fs from 'node:fs';

const shotDir = process.argv[2] ? path.resolve(process.argv[2]) : null;
const tag = process.argv[3] || 'fit';
if (shotDir) { fs.mkdirSync(shotDir, { recursive: true }); process.env.HORDES_SHOT_DIR = shotDir; }
const { withPage } = await import('./browser.mjs');

const VIEWPORTS = [
  { name: '844x390', w: 844, h: 390, dpr: 2, mobile: true },
  { name: '667x375', w: 667, h: 375, dpr: 2, mobile: true },
  { name: '1280x720', w: 1280, h: 720, dpr: 1, mobile: false },
];
const BOOT = `(async () => { const m = await import('/src/main.js'); window.T = m.__TEST; return 1; })()`;
const WIDE_FONT = `(() => { const st = document.createElement('style');
  st.textContent = 'html, body { font-family: "Courier New", "DejaVu Sans Mono", monospace !important; }';
  document.head.appendChild(st); })()`;
// Drop every style rule that uses :has(), as an older browser would.
const NO_HAS = `(() => { const strip = (rules) => { for (let i = rules.length - 1; i >= 0; i--) { const r = rules[i];
  if (r.cssRules && r.cssRules.length) strip(r.cssRules);
  if (r.selectorText && r.selectorText.includes(':has(')) r.parentRule ? r.parentRule.deleteRule(i) : r.parentStyleSheet.deleteRule(i); } };
  for (const sh of document.styleSheets) strip(sh.cssRules); })()`;
const CASES = {
  fresh: `T.menus.showPreRun()`,
  longest: `(() => { T.stages.select('BLOOD_RUST');
    T.world.board = { ids: ['eliteHigh', 'boss1Fast', 'yard'], swapped: [] }; T.menus.showPreRun(); })()`,
};
const MEASURE = `(() => { const ov = document.getElementById('overlay');
  return { scroll: ov.scrollHeight, client: ov.clientHeight, vw: innerWidth, vh: innerHeight,
    cards: [...document.querySelectorAll('#ov-cards .card')].map(c => { const r = c.getBoundingClientRect();
      return { name: c.querySelector('.name').textContent, left: r.left, right: r.right, top: r.top, bottom: r.bottom }; }) }; })()`;

let failed = 0;
for (const vp of VIEWPORTS) {
  for (const font of ['browser font', 'wide font', 'wide font, no :has']) {
    await withPage({ ...vp, timeoutMs: 60000 }, async (page) => {
      await page.sleep(300);
      await page.evaluate(BOOT, true);
      if (font !== 'browser font') await page.evaluate(WIDE_FONT);
      if (font.endsWith('no :has')) await page.evaluate(NO_HAS);
      await page.sleep(400);
      for (const [name, open] of Object.entries(CASES)) {
        await page.evaluate(open);
        await page.sleep(500);
        const m = await page.evaluate(MEASURE);
        const cut = m.cards.filter(c => c.bottom > m.vh + 0.5 || c.top < 0 || c.left < 0 || c.right > m.vw + 0.5);
        // Without :has() the hidden sub line leaves its plate, which may scroll: the cards still must fit.
        const ok = m.cards.length === 5 && !cut.length && (m.scroll <= m.client + 1 || font.endsWith('no :has'));
        if (!ok) failed++;
        console.log((ok ? 'ok   ' : 'FAIL ') + vp.name + ' ' + name + ' (' + font + '): ' + m.cards.length + ' cards, lowest edge ' +
          Math.round(Math.max(...m.cards.map(c => c.bottom))) + ' of ' + m.vh + ', scroll ' + m.scroll + '/' + m.client +
          (cut.length ? ', cut off: ' + cut.map(c => c.name).join(', ') : ''));
        if (shotDir && font === 'browser font') await page.shot('prerun-' + tag + '-' + name + '-' + vp.name);
      }
      if (page.errors.length) { failed++; console.log('FAIL ' + vp.name + ' page errors: ' + page.errors.join(' | ')); }
    });
  }
}
console.log(failed ? 'verify_prerun_fit: ' + failed + ' FAILED' : 'verify_prerun_fit: all fit');
process.exit(failed ? 1 : 0);
