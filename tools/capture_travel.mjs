// Real-Chrome screenshots of travel: the intermission after wave 2 (CONTINUE
// names where the portal leads, STAY HERE is offered) and the first frames on
// the new stage.
//   HORDES_CHROME=<chrome.exe> node tools/capture_travel.mjs [outDir]
// Writes <outDir>/<scene>-<viewport>.png (default docs/art/travel).
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.resolve(process.argv[2] || path.join(ROOT, 'docs/art/travel'));
fs.mkdirSync(outDir, { recursive: true });
process.env.HORDES_SHOT_DIR = outDir;
const { withPage } = await import('./browser.mjs');

// A fixed clock and random stream, so a scene is the same every time. The old
// coachmarks are marked seen: they would hold the sim.
const STARTUP = `
(() => {
  let s = 20261003;
  Math.random = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  let now = 1000; const q = [];
  performance.now = () => now;
  window.requestAnimationFrame = (cb) => { q.push(cb); return q.length; };
  window.__pump = (n) => { for (let i = 0; i < n; i++) { now += 1000 / 60; const cb = q.shift(); if (!cb) return i; cb(now); } return n; };
  try { localStorage.setItem('hordes_onboarded', '1'); localStorage.setItem('hordes_pilot2', 'AUTO_ALL'); } catch (e) {}
  for (const k of ['stage1','hud','pilot','focus','stance','move','skills','radar','map','zoom','draft','shop','chest','portal','arch','shrine','potion','elite','boss']) {
    try { localStorage.setItem('hordes_tour_' + k, '1'); } catch (e) {}
  }
})();`;

const BOOT = `(async () => {
  const m = await import('/src/main.js');
  const T = m.__TEST; window.T = T;
  if (T.banners && T.banners.suppressAll) T.banners.suppressAll();
  window.__pump(5);
  T.startRun();
  window.__pump(40);
  return T.state.mode;
})()`;
// The intermission after wave 2, with the travel hint dismissed or not.
const INTERMISSION = (dest) => `(() => {
  const T = window.T, S = T.state;
  S.enemies.length = 0;
  S.wave.num = 2; S.wave.cinePending = false;
  ${dest ? `T.travel.order = ['${dest}', ...T.travel.order.filter(x => x !== '${dest}')];` : ''}
  T.travel.intermission();
  window.__pump(3);
  return { mode: S.mode, dest: T.travel.target(), cards: [...document.querySelectorAll('#ov-cards .card .name')].map(e => e.textContent) };
})()`;
const HINT_OK = `(() => { const b = document.querySelector('.tut-btn'); if (b) { b.dispatchEvent(new PointerEvent('pointerdown')); b.click(); } window.__pump(3); return !!b; })()`;
const GO = `(() => {
  const T = window.T, S = T.state;
  T.run.nextWave();
  for (let i = 0; i < 150; i++) { window.__pump(1); S.player.hp = S.player.stats.maxHp; }
  return { mode: S.mode, stage: S.stage, seen: S.stagesSeen, wave: S.wave.num, sites: S.sites.length, enemies: S.enemies.length };
})()`;

const VIEWPORTS = [
  { name: 'desktop', w: 1280, h: 720, dpr: 1, mobile: false },
  { name: 'phone', w: 844, h: 390, dpr: 2, mobile: true },
];
const DESTS = ['SNOWFIELD', 'ASHEN_WASTE'];

for (const vp of VIEWPORTS) {
  for (const dest of (vp.name === 'desktop' ? DESTS : DESTS.slice(0, 1))) {
    await withPage({ ...vp, startupScript: STARTUP, timeoutMs: 90000 }, async (page) => {
      await page.sleep(400);
      console.log(vp.name, 'boot:', await page.evaluate(BOOT, true));
      console.log(vp.name, JSON.stringify(await page.evaluate(INTERMISSION(dest))));
      await page.sleep(100);
      await page.evaluate(`window.__pump(40)`);
      await page.shot(`intermission-hint-${dest.toLowerCase()}-${vp.name}`);
      console.log(vp.name, 'hint closed:', await page.evaluate(HINT_OK));
      await page.evaluate(`window.__pump(40)`);
      await page.shot(`intermission-${dest.toLowerCase()}-${vp.name}`);
      console.log(vp.name, JSON.stringify(await page.evaluate(GO)));
      await page.shot(`arrived-${dest.toLowerCase()}-${vp.name}`);
      if (page.errors.length) console.log(vp.name, 'ERRORS:', JSON.stringify(page.errors.slice(0, 6)));
    });
  }
}
console.log('wrote', outDir);
