// Real-Chrome screenshots of the boss rules: the arrival banner with the rule
// in its small print, the plate under the boss bar during the fight, the
// boss-down line, and the intermission's line about the next rule.
//   HORDES_CHROME=<chrome.exe> node tools/capture_boss_rules.mjs [outDir]
// Writes <outDir>/<scene>-<viewport>.png (default docs/art/boss-rules).
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.resolve(process.argv[2] || path.join(ROOT, 'docs/art/boss-rules'));
fs.mkdirSync(outDir, { recursive: true });
process.env.HORDES_SHOT_DIR = outDir;
const { withPage } = await import('./browser.mjs');

// A fixed clock and random stream, so a scene is the same every time.
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
  window.__pump(2);
  return T.state.mode;
})()`;

// Wave `wave` with `rule` as its boss rule; the boss arrives now.
const ARRIVE = (wave, rule) => `(() => {
  const T = window.T, S = T.state;
  S.mode = 'menu'; T.startRun(); window.__pump(30);
  S.wave.num = ${wave};
  S.wave.endsAt = S.time + 1e9; S.wave.midAt = S.time + 1e9;
  const ids = ['stampede', 'chorus', 'guard', 'wall', 'silence', 'drought'];
  const order = ['${rule}', ...ids.filter(x => x !== '${rule}')];
  // Wave w reads order[(w - 2) % 6]: rotate so this wave gets the rule.
  for (let k = 0; k < (${wave} - 2) % 6; k++) order.unshift(order.pop());
  T.bossRules.order = order;
  T.bossRules.setWave(${wave});
  T.bossRules.spawnBoss();
  for (const b of S.wave.bosses) { b.hp = b.maxHp = 1e9; }
  return S.bossRule && S.bossRule.text;
})()`;
const HOLD = (frames) => `(() => {
  const S = window.T.state;
  for (let i = 0; i < ${frames}; i++) { window.__pump(1); S.player.hp = S.player.stats.maxHp; }
  return { mode: S.mode, banner: !!(S.bossBanner && S.bossBanner.ttl > 0), rule: S.bossRule && S.bossRule.live };
})()`;
const KILL = `(() => {
  const S = window.T.state;
  for (const b of S.wave.bosses) b.hp = 0;
  window.__pump(3);
  return { mode: S.mode, toasts: S.toasts.map(t => t.msg) };
})()`;
const INTERMISSION = `(() => {
  const T = window.T, S = T.state;
  let n = 0;
  while (S.mode !== 'intermission' && n++ < 1500) {
    if (S.mode === 'draft' || S.mode === 'evolve') { const c = document.querySelector('#ov-cards .card'); if (c) c.click(); }
    if (S.portal) { S.player.x = S.portal.x; S.player.y = S.portal.y; }
    S.player.hp = S.player.stats.maxHp;
    window.__pump(1);
  }
  return { mode: S.mode, frames: n, time: S.time, sub: document.getElementById('ov-sub').textContent };
})()`;

const VIEWPORTS = [
  { name: 'desktop', w: 1280, h: 720, dpr: 1, mobile: false },
  { name: 'phone', w: 844, h: 390, dpr: 2, mobile: true },
];

for (const vp of VIEWPORTS) {
  await withPage({ ...vp, startupScript: STARTUP, timeoutMs: 90000 }, async (page) => {
    await page.sleep(400);
    console.log(vp.name, 'boot:', await page.evaluate(BOOT, true));
    // A single boss with the longest rule line.
    console.log(vp.name, 'rule:', await page.evaluate(ARRIVE(2, 'chorus')));
    console.log(vp.name, JSON.stringify(await page.evaluate(HOLD(40))));
    await page.shot(`banner-chorus-${vp.name}`);
    console.log(vp.name, JSON.stringify(await page.evaluate(HOLD(170))));
    await page.shot(`plate-chorus-${vp.name}`);
    console.log(vp.name, JSON.stringify(await page.evaluate(KILL)));
    await page.shot(`beaten-chorus-${vp.name}`);
    console.log(vp.name, JSON.stringify(await page.evaluate(INTERMISSION)));
    await page.shot(`intermission-${vp.name}`);
    // A double wave: two names, the verb and the rule.
    console.log(vp.name, 'rule:', await page.evaluate(ARRIVE(3, 'drought')));
    console.log(vp.name, JSON.stringify(await page.evaluate(HOLD(40))));
    await page.shot(`banner-double-drought-${vp.name}`);
    console.log(vp.name, JSON.stringify(await page.evaluate(HOLD(170))));
    await page.shot(`plate-drought-${vp.name}`);
    if (page.errors.length) console.log(vp.name, 'ERRORS:', JSON.stringify(page.errors.slice(0, 6)));
  });
}
console.log('wrote', outDir);
