// Real-Chrome screenshots and measurements of the SHOP at phone and desktop
// sizes: how many columns, rows and cards a page shows, and how many pages.
//   HORDES_CHROME=<chrome.exe> node tools/capture_shop.mjs [outDir] [--gold N]
// Writes <outDir>/shop-<size>.png (default docs/art/shop) and prints one line
// per size.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const gi = argv.indexOf('--gold');
const gold = gi >= 0 ? Number(argv.splice(gi, 2)[1]) : 5000;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.resolve(argv[0] || path.join(ROOT, 'docs/art/shop'));
fs.mkdirSync(outDir, { recursive: true });
process.env.HORDES_SHOT_DIR = outDir;
const { withPage } = await import('./browser.mjs');

const SIZES = [
  { name: 'phone-844x390', w: 844, h: 390, dpr: 2, mobile: true },
  { name: 'phone-667x375', w: 667, h: 375, dpr: 2, mobile: true },
  { name: 'phone-932x430', w: 932, h: 430, dpr: 2, mobile: true },
  { name: 'portrait-390x844', w: 390, h: 844, dpr: 2, mobile: true },
  { name: 'portrait-360x740', w: 360, h: 740, dpr: 2, mobile: true },
  { name: 'tablet-1024x768', w: 1024, h: 768, dpr: 1, mobile: true },
  { name: 'desktop-1280x720', w: 1280, h: 720, dpr: 1, mobile: false },
];

const OPEN = (g) => `(async () => {
  const m = await import('/src/main.js');
  const T = m.__TEST; window.T = T;
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }));
  await new Promise(r => setTimeout(r, 900));
  T.getProfile().gold = ${g};
  T.shop.open();
  await new Promise(r => setTimeout(r, 700));
  return T.state.mode;
})()`;
const MEASURE = `(() => {
  const ov = document.getElementById('overlay'), cards = document.getElementById('ov-cards');
  const all = [...cards.children];
  const vis = all.filter(c => c.style.display !== 'none' && !/shop-footer/.test(c.className));
  const rects = vis.map(c => c.getBoundingClientRect());
  const tops = [...new Set(rects.map(r => Math.round(r.top)))];
  const firstRow = rects.filter(r => Math.round(r.top) === tops[0]);
  const foot = all.filter(c => /shop-footer/.test(c.className)).map(c => c.getBoundingClientRect());
  const ind = document.getElementById('shop-ind');
  return { vw: innerWidth, vh: innerHeight, total: all.length - foot.length, shown: vis.length,
    cols: firstRow.length, rows: tops.length, pages: window.T.shop.pages(), page: window.T.shop.page(),
    cardW: rects[0] ? Math.round(rects[0].width) : 0, cardH: rects.length ? Math.round(Math.max(...rects.map(r => r.height))) : 0,
    gridTop: rects.length ? Math.round(Math.min(...rects.map(r => r.top))) : 0,
    gridBottom: rects.length ? Math.round(Math.max(...rects.map(r => r.bottom))) : 0,
    footTop: foot.length ? Math.round(foot[0].top) : null, footBottom: foot.length ? Math.round(foot[0].bottom) : null,
    ind: ind ? ind.textContent : null, scroll: ov.scrollHeight + '/' + ov.clientHeight,
    title: document.getElementById('ov-title').getBoundingClientRect().bottom | 0,
    sub: document.getElementById('ov-sub').getBoundingClientRect().bottom | 0 };
})()`;

for (const vp of SIZES) {
  await withPage({ ...vp, timeoutMs: 60000 }, async (page) => {
    await page.sleep(600);
    const mode = await page.evaluate(OPEN(gold), true);
    const m = await page.evaluate(MEASURE);
    console.log(vp.name, mode, JSON.stringify(m));
    await page.shot('shop-' + vp.name);
    // The last page, a buy (it must keep the page), and BACK.
    const last = await page.evaluate(`(async () => {
      const T = window.T; T.shop.goto(99);
      await new Promise(r => setTimeout(r, 250));
      const vis = [...document.querySelectorAll('#ov-cards > .card')].filter(c => c.style.display !== 'none');
      return { page: T.shop.page(), names: vis.map(c => (c.querySelector('.name') || c).textContent) };
    })()`, true);
    await page.shot('shop-' + vp.name + '-last');
    const flow = await page.evaluate(`(async () => {
      const T = window.T; T.shop.goto(2);
      await new Promise(r => setTimeout(r, 200));
      const vis = [...document.querySelectorAll('#ov-cards > .card')].filter(c => c.style.display !== 'none' && !/shop-footer|dim/.test(c.className));
      const gold0 = T.getProfile().gold;
      if (vis[0]) vis[0].click();
      await new Promise(r => setTimeout(r, 400));
      const bought = gold0 - T.getProfile().gold, pageAfter = T.shop.page();
      const back = [...document.querySelectorAll('#ov-cards > .card.shop-footer')][0];
      const r = back.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      const onBack = !!(hit && (hit === back || back.contains(hit)));
      back.click();
      await new Promise(r2 => setTimeout(r2, 300));
      return { bought, pageAfter, backHit: onBack, backBox: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], modeAfterBack: T.state.mode,
        title: document.getElementById('ov-title').textContent };
    })()`, true);
    console.log(vp.name, 'last page', JSON.stringify(last), 'flow', JSON.stringify(flow));
    if (page.errors.length) console.log(vp.name, 'ERRORS:', JSON.stringify(page.errors.slice(0, 4)));
  });
}
console.log('wrote', outDir);
