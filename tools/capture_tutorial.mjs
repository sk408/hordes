// Real-Chrome screenshots of every tutorial step on a fresh profile, at
// desktop 1280x720, phone landscape 844x390 and phone portrait 390x844.
//   HORDES_CHROME=<chrome.exe> node tools/capture_tutorial.mjs [outDir] [--vp desktop,phone,portrait]
// Writes <outDir>/<nn>-<step>-<viewport>.png (default docs/art/tutorial) and
// prints, per step, the panel rect, the ring rects and whether the panel
// overlaps a ring, an on-screen control, or the middle of the play area.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const vi = argv.indexOf('--vp');
const vpOnly = vi >= 0 ? argv.splice(vi, 2)[1].split(',') : null;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.resolve(argv[0] || path.join(ROOT, 'docs/art/tutorial'));
fs.mkdirSync(outDir, { recursive: true });
process.env.HORDES_SHOT_DIR = outDir;
const { withPage } = await import('./browser.mjs');

const VIEWPORTS = [
  { name: 'desktop', w: 1280, h: 720, dpr: 1, mobile: false },
  { name: 'phone', w: 844, h: 390, dpr: 2, mobile: true },
  { name: 'portrait', w: 390, h: 844, dpr: 2, mobile: true },
].filter((v) => !vpOnly || vpOnly.includes(v.name));

const BOOT = `(async () => { const m = await import('/src/main.js'); window.T = m.__TEST; return T.state.mode; })()`;
const key = (k) => `window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)} }))`;
const keyUp = (k) => `window.dispatchEvent(new KeyboardEvent('keyup', { key: ${JSON.stringify(k)} }))`;
const stepIs = (id) => `!!(T.tut.model && T.tut.model.id === ${JSON.stringify(id)})`;

// The panel against what it must not cover.
const REPORT = `(() => {
  const box = (el) => { const r = el.getBoundingClientRect(); return { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) }; };
  const vis = (el) => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
  const hit = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
  const panel = document.getElementById('tut-panel');
  if (!panel || !vis(panel)) return { panel: null };
  const p = box(panel);
  const rings = [...document.querySelectorAll('.tut-ring')].filter(vis).map(box);
  const pads = [...document.querySelectorAll('#touch button')].filter(vis).map(box);
  const cv = box(document.getElementById('game'));
  const mid = { l: cv.l + (cv.r - cv.l) * 0.3, r: cv.l + (cv.r - cv.l) * 0.7, t: cv.t + (cv.b - cv.t) * 0.36, b: cv.t + (cv.b - cv.t) * 0.64 };
  const text = panel.querySelector('.tut-text');
  const lh = parseFloat(getComputedStyle(text).lineHeight) || 18;
  return { id: T.tut.model && T.tut.model.id, panel: p, lines: Math.round(text.getBoundingClientRect().height / lh),
    rings, coversRing: rings.some((r) => hit(p, r)), coversControl: pads.some((r) => hit(p, r)),
    inMiddle: T.state.mode === 'playing' && hit(p, mid), offScreen: p.l < 0 || p.t < 0 || p.r > innerWidth || p.b > innerHeight };
})()`;

let bad = 0;
for (const vp of VIEWPORTS) {
  await withPage({ ...vp, skipPrologue: false, timeoutMs: 90000 }, async (page) => {
    let n = 0;
    const shot = async (name) => {
      await page.sleep(350);
      const rep = await page.evaluate(REPORT);
      const flags = ['coversRing', 'coversControl', 'inMiddle', 'offScreen'].filter((k) => rep && rep[k]);
      if (!rep || !rep.panel || flags.length || rep.lines > 2) bad++;
      console.log(vp.name, name, JSON.stringify(rep), flags.length ? 'PROBLEM: ' + flags.join(',') : 'ok');
      await page.shot(String(++n).padStart(2, '0') + '-' + name + '-' + vp.name);
    };
    const waitStep = (id, ms = 30000) => page.waitFor(stepIs(id), ms, 50);
    await page.sleep(300);
    await page.evaluate(BOOT, true);
    await page.evaluate(key('x'));
    await page.waitFor(`T.state.mode === 'title'`, 8000, 30);
    await page.sleep(600);
    await page.evaluate(`T.startRun()`);

    // ---- the guided part of run 1 ----
    await waitStep('hero'); await shot('hero');
    await waitStep('move'); await shot('move');
    await page.evaluate(key('d')); await page.sleep(700); await page.evaluate(keyUp('d'));
    await waitStep('gems'); await shot('gems');
    await waitStep('draft'); await page.sleep(500); await shot('draft');
    await page.evaluate(`T.tut.press(performance.now())`);
    await waitStep('evolve'); await shot('evolve');
    await page.evaluate(`document.querySelector('#ov-cards .card').click()`);
    await waitStep('skill'); await shot('skill');
    await page.evaluate(`T.runAction('q')`);
    await waitStep('potion'); await shot('potion');
    await page.evaluate(`T.runAction('h')`);
    await waitStep('gold'); await shot('gold');
    await waitStep('handover'); await shot('handover');
    await page.sleep(300);
    await page.evaluate(`T.tut.press(performance.now())`);
    await page.waitFor(`!T.tut.live`, 4000, 30);

    // ---- the first death, the shop, back to PLAY ----
    await page.evaluate(`T.die()`);
    await page.sleep(200);
    await page.evaluate(key('x'));
    await page.waitFor(`T.state.mode === 'dead'`, 12000, 50);
    await waitStep('menu:end'); await shot('end');
    await page.evaluate(`[...document.querySelectorAll('#ov-cards .card')].find((c) => /SHOP/.test(c.textContent)).click()`);
    await waitStep('menu:shop_buy'); await page.sleep(500); await shot('shop-buy');
    await page.evaluate(`[...document.querySelectorAll('#ov-cards .card')].find((c) => /Vitality/i.test(c.textContent)).click()`);
    if (!(await waitStep('menu:shop_back', 6000))) console.log(vp.name, 'DEBUG', JSON.stringify(await page.evaluate(`({ model: T.tut.model && T.tut.model.id, screen: T.tut.screen(), title: document.getElementById('ov-title').textContent, buy: T.tut.seen('tut:shop_buy'), play: T.tut.seen('tut:play'), gold: T.getProfile().gold, cards: [...document.querySelectorAll('#ov-cards .card')].slice(0, 4).map((c) => c.textContent.slice(0, 30)) })`)));
    await page.sleep(500); await shot('shop-back');
    await page.evaluate(`[...document.querySelectorAll('#ov-cards .card')].find((c) => /BACK/.test(c.textContent)).click()`);
    await waitStep('menu:play'); await page.sleep(500); await shot('play');

    // ---- first-time hints: the pre-run screen, the second-run line, a world hint ----
    await page.evaluate(`[...document.querySelectorAll('#ov-cards .card')].find((c) => /PLAY/.test(c.textContent)).click()`);
    await waitStep('hint:prerun'); await shot('hint-prerun');
    await page.evaluate(`T.startRun()`);
    await waitStep('hint:run2'); await shot('run2');
    await page.evaluate(`T.tut.hints.press(performance.now())`);
    await page.sleep(300);
    await page.evaluate(`(() => { const p = T.state.player; T.tut.hints.active = null; T.getProfile().banners['hint:chest'] = 0; T.tut.hint('chest', [T.camera.region(p.x + 60, p.y - 30, 20)]); })()`);
    await waitStep('hint:chest'); await shot('hint-chest');
    if (page.errors && page.errors.length) console.log(vp.name, 'PAGE ERRORS', JSON.stringify(page.errors.slice(0, 5)));
  });
}
console.log(bad ? bad + ' step(s) need a look' : 'all steps clear');
