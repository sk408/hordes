// R5 menu font: what the player sees when the font arrives late, and when it
// never arrives. Real Chrome; the font file is held back by the test server.
//   HORDES_CHROME=<chrome.exe> node tools/measure_font_shift.mjs [w h]
//   1. late: the font comes 2.5 s after the request, while the title is up.
//      It must not switch under the player's eyes (no shift on that screen);
//      the next screen opens in the font. Reports the size of the change
//      between the two title layouts (what a switch in place would have moved).
//   2. failed: the font request is dropped. The menus stay in today's font,
//      the game runs on, no page error.
import { withPage } from './browser.mjs';

const w = +(process.argv[2] || 390), h = +(process.argv[3] || 844);
const BOOT = `(async () => { const m = await import('/src/main.js'); window.T = m.__TEST; window.MF = await import('/src/menu_font.js'); return T.state.mode; })()`;
const RECTS = `[...document.querySelectorAll('#ov-cards .card')].map((c) => { const r = c.getBoundingClientRect(); return [c.querySelector('.name').textContent, Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; })`;
const toTitle = async (p) => {
  await p.sleep(300);
  await p.evaluate(BOOT, true);
  await p.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }))`);
  await p.waitFor(`T.state.mode === 'title' && +getComputedStyle(document.getElementById('overlay')).opacity === 1`, 8000, 30);
  await p.sleep(200);
  await p.evaluate(`document.querySelectorAll('.wn-over').forEach((e) => e.remove())`);
};
let bad = 0;
const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) bad++; };

await withPage({ w, h, dpr: 2, mobile: w < 900, startupScript: "try { localStorage.setItem('hordes_onboarded', '1'); } catch (e) {}" }, async (p) => {
  p.server.hook = (path) => (/PixelifySans/.test(path) ? { delayMs: 2500 } : null);
  await toTitle(p);
  const st0 = await p.evaluate(`MF.menuFontState().status`);
  const a = await p.evaluate(RECTS);
  await p.waitFor(`MF.menuFontState().status !== 'loading'`, 8000, 50);
  await p.sleep(300);
  const st1 = await p.evaluate(`({ s: MF.menuFontState().status, on: document.documentElement.classList.contains('px-font') })`);
  const b = await p.evaluate(RECTS);
  const moved = a.reduce((m, r, i) => Math.max(m, ...r.slice(1).map((v, k) => Math.abs(v - (b[i] || [])[k + 1]))), 0);
  check(st0 === 'loading', `late font: the title shows while it loads (status ${st0})`);
  check(st1.s === 'ready' && !st1.on, `late font: it arrived with the title up and waits (status ${st1.s}, class ${st1.on})`);
  check(moved === 0, `late font: nothing on the title moved when it arrived (max ${moved}px)`);
  await p.evaluate(`T.menus.showSettings()`);
  await p.evaluate(`T.menus.showTitle()`);
  await p.sleep(300);
  const c = await p.evaluate(RECTS);
  const on = await p.evaluate(`document.documentElement.classList.contains('px-font')`);
  check(on, 'late font: the next screen opens in it');
  const d = a.map((r, i) => [r[0], ...(c[i] || []).slice(1).map((v, k) => v - r[k + 1])]);
  console.log('     title, fallback -> font, per card [name, dx, dy, dw, dh]:', JSON.stringify(d));
  // A real tap on the main button opens the pre-run screen; ESC comes back.
  const r = await p.rectOf('#ov-cards .card.main');
  await p.tap(Math.round(r[0]), Math.round(r[1]));
  await p.sleep(300);
  const pre = await p.evaluate(`({ mode: T.state.mode, setup: document.querySelectorAll('#ov-cards .card.setup').length })`);
  check(pre.setup > 0, 'a real tap on PLAY opens the pre-run screen ' + JSON.stringify(pre));
  const font = await p.evaluate(`(() => { const e = performance.getEntriesByType('resource').find((r) => /PixelifySans/.test(r.name)); return e ? { start: Math.round(e.startTime), end: Math.round(e.responseEnd), bytes: e.encodedBodySize } : null; })()`);
  console.log('     font request:', JSON.stringify(font));
  check(!p.errors.length, 'late font: no page errors ' + JSON.stringify(p.errors.slice(0, 3)));
});

await withPage({ w, h, dpr: 2, mobile: w < 900, startupScript: "try { localStorage.setItem('hordes_onboarded', '1'); } catch (e) {}" }, async (p) => {
  p.server.setOffline((path) => /PixelifySans/.test(path));
  await toTitle(p);
  await p.waitFor(`MF.menuFontState().status === 'failed'`, 8000, 50);
  await p.evaluate(`T.menus.showSettings()`);
  await p.sleep(200);
  const s = await p.evaluate(`({ s: MF.menuFontState().status, on: document.documentElement.classList.contains('px-font'), fam: getComputedStyle(document.querySelector('#ov-cards .card .name')).fontFamily, mode: T.state.mode })`);
  check(s.s === 'failed' && !s.on && /monospace/.test(s.fam) && !/Pixelify/.test(s.fam), 'failed font: menus stay in today\'s font ' + JSON.stringify(s));
  await p.evaluate(`T.startRun()`);
  await p.sleep(1200);
  const run = await p.evaluate(`T.state.mode`);
  check(run === 'playing' || run === 'draft', 'failed font: a run starts and plays (' + run + ')');
  check(!p.errors.length, 'failed font: no page errors ' + JSON.stringify(p.errors.slice(0, 3)));
});
console.log(bad ? bad + ' FAILURES' : 'measure_font_shift: all ok');
process.exit(bad ? 1 : 0);
