// M3 "first minutes and menus" capture: real-Chrome screenshots of the menus,
// the first-run flow and the in-run HUD.
//   HORDES_CHROME=<chrome.exe> node tools/capture_m3_ux.mjs [tag] [outDir] [--only a,b]
// Writes <outDir>/<tag>-<scene>-<viewport>.png (default docs/art/m3-ux).
// The page runs on its real clock; scenes are reached through the game's own
// __TEST seams and real clicks, then captured.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const onlyI = argv.indexOf('--only');
const only = onlyI >= 0 ? argv.splice(onlyI, 2)[1].split(',') : null;
const vpI = argv.indexOf('--vp');
const vpOnly = vpI >= 0 ? argv.splice(vpI, 2)[1].split(',') : null;
const tag = argv[0] || 'm3';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.resolve(argv[1] || path.join(ROOT, 'docs/art/m3-ux'));
fs.mkdirSync(outDir, { recursive: true });
process.env.HORDES_SHOT_DIR = outDir;
const { withPage } = await import('./browser.mjs');

const VIEWPORTS = [
  { name: 'desktop', w: 1280, h: 720, dpr: 1, mobile: false },
  { name: 'desktop1080', w: 1920, h: 1080, dpr: 1, mobile: false },
  { name: 'phone', w: 844, h: 390, dpr: 2, mobile: true },
  { name: 'portrait', w: 390, h: 844, dpr: 2, mobile: true },
].filter((v) => !vpOnly || vpOnly.includes(v.name));

const BOOT = `(async () => {
  const m = await import('/src/main.js');
  window.T = m.__TEST;
  return window.T.state.mode;
})()`;
const want = (s) => !only || only.includes(s);

// A profile that has finished one run and owns a little, so the menus show
// their ordinary (not first-boot) state.
const SEEDED = (extra = {}) => `try { localStorage.setItem('hordes_profile_v1', JSON.stringify(${JSON.stringify({
  version: 8, lastPlayed: 0, gold: 1240, achievements: { totals: { runs: 3 } }, ...extra })}.lastPlayed ? {} : Object.assign(${JSON.stringify({
  version: 8, gold: 1240, achievements: { totals: { runs: 3 } }, ...extra })}, { lastPlayed: Date.now() }))); } catch (e) {}`;

async function scenes(vp, page, fresh) {
  const shot = (name) => page.shot(`${tag}-${name}-${vp.name}`);
  await page.sleep(300);
  await page.evaluate(BOOT, true);
  // Skip the intro movie, then wait for the title to become clickable.
  await page.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }))`);
  await page.waitFor(`T.state.mode === 'title' && getComputedStyle(document.getElementById('overlay')).pointerEvents !== 'none' && +getComputedStyle(document.getElementById('overlay')).opacity === 1`, 6000);
  await page.sleep(250);
  return shot;
}

for (const vp of VIEWPORTS) {
  // ---- menus on a played profile ------------------------------------------
  await withPage({ ...vp, skipPrologue: false, startupScript: SEEDED(), timeoutMs: 60000 }, async (page) => {
    const shot = await scenes(vp, page);
    if (want('title')) await shot('title');
    if (want('prerun') && await page.evaluate(`!!T.menus && !!T.menus.showPreRun`)) {
      await page.evaluate(`T.menus.showPreRun()`); await page.sleep(350); await shot('prerun');
    }
    if (want('settings') && await page.evaluate(`!!T.menus`)) {
      await page.evaluate(`T.menus.showSettings()`); await page.sleep(350); await shot('settings');
      await page.evaluate(`T.menus.showAdvanced()`); await page.sleep(350); await shot('settings-advanced');
    }
    if (want('shop') && await page.evaluate(`!!T.menus`)) {
      await page.evaluate(`T.menus.showShop()`); await page.sleep(600); await shot('shop');
    }
    if (want('run')) {
      await page.evaluate(`T.startRun()`);
      await page.sleep(6000);
      await page.evaluate(`T.state.player.hp = T.state.player.stats.maxHp`);
      await shot('run');
    }
    if (page.errors.length) console.log(vp.name, 'page errors:', page.errors.slice(0, 5));
  });
}
console.log('wrote', outDir);
