// HORDES — art contact sheets in real Chrome (art-pass review tool).
//   HORDES_CHROME=<chrome.exe> node tools/art_sheet.mjs <tag> [outDir] [sets]
// Writes <outDir>/<tag>-sheet-<set>.png for each set (actors, bosses, menu,
// world, buildings, icons): every sprite at 1x on a ground swatch plus all
// frames enlarged. One headless Chrome, one page per set.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const tag = process.argv[2] || 'sheet';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.resolve(process.argv[3] || path.join(ROOT, 'docs/art/art-pass'));
const sets = (process.argv[4] || 'actors,bosses,menu,world,buildings,icons').split(',');
const ONLY = process.argv[5] || '';
const ZOOM = +(process.argv[6] || 0);
fs.mkdirSync(outDir, { recursive: true });
process.env.HORDES_SHOT_DIR = outDir;
const { withPage } = await import('./browser.mjs');

const nap = (ms) => new Promise((r) => setTimeout(r, ms));
for (const set of sets) {
  await nap(500);
  const scale = ZOOM || (set === 'bosses' ? 3 : set === 'icons' || set === 'world' ? 3 : 4);
  const W = set === 'buildings' ? 1400 : 1000;
  const url = `tools/art_sheet.html?set=${set}&scale=${scale}&w=${W}` + (ONLY ? '&only=' + ONLY : '');
  let H = 600;
  await withPage({ w: W, h: 400, dpr: 1, mobile: false, url }, async (page) => {
    await page.waitFor('window.__done !== undefined', 15000);
    H = Math.min(4000, await page.evaluate('document.getElementById("c").height'));
  });
  await nap(500);
  await withPage({ w: W, h: H, dpr: 1, mobile: false, url }, async (page) => {
    await page.waitFor('window.__done !== undefined', 15000);
    const n = await page.evaluate('window.__done');
    const h = await page.evaluate('document.getElementById("c").height');
    console.log(set, n, 'items, height', h);
    await page.shot(`${tag}-sheet-${set}` + (ONLY ? '-zoom' : ''));
    if (page.errors.length) console.log(set, 'errors:', page.errors.slice(0, 3));
  });
}
