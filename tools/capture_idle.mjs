// Idle-play capture: real-Chrome screenshots of the away summary, the title
// with the camp, the camp screen and Settings (KEEP PLAYING, AUTO-CONTINUE).
//   HORDES_CHROME=<chrome.exe> node tools/capture_idle.mjs [outDir]
// The away period is faked by the saved profile: lastPlayed and the camp's
// production stamps are three to nine hours old, and the away tracker is
// handed a few unattended runs before the first key press. That key press is
// the real input path that opens the card.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.resolve(process.argv[2] || path.join(ROOT, 'docs/art/idle'));
fs.mkdirSync(outDir, { recursive: true });
process.env.HORDES_SHOT_DIR = outDir;
const { withPage } = await import('./browser.mjs');

const VIEWPORTS = [
  { name: 'desktop', w: 1280, h: 720, dpr: 1, mobile: false },
  { name: 'phone', w: 844, h: 390, dpr: 2, mobile: true },
];
const H = 3600 * 1000;
const PROFILE = `try { const now = Date.now(); localStorage.setItem('hordes_profile_v1', JSON.stringify({ version: 12,
  lastPlayed: now - 3 * ${H}, gold: 4860, bestTime: 412, unlockedWeapons: ['VOLLEY', 'BOOMERANG', 'ORBIT'],
  purchased: { hp: 2, dmg: 1 }, achievements: { totals: { runs: 14, bestGold: 1610 } },
  shopRefund: { version: 11, gold: 0, rows: 0 },
  camp: { levels: { mine: 2, forge: 1, library: 0, shrine: 0 },
    since: { mine: now - 3 * ${H}, forge: now - 9 * ${H}, library: 0, shrine: 0 },
    charges: { forge: 0, library: 0, shrine: 0 } } }));
  localStorage.setItem('hordes_auto_continue', '1'); } catch (e) {}`;
const BOOT = `(async () => { const m = await import('/src/main.js'); window.T = m.__TEST; return T.state.mode; })()`;
const key = (k) => `window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)} }))`;

// Every visible card and text block inside the viewport, and no two overlapping.
const FIT = `(() => {
  const box = (el, name) => { const r = el.getBoundingClientRect(); return { name, l: r.left, t: r.top, r: r.right, b: r.bottom }; };
  const els = [...document.querySelectorAll('#ov-title, #ov-sub, #ov-cards .card')].filter((e) => {
    const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); return cs.display !== 'none' && r.width > 0 && r.height > 0; });
  const items = els.map((e, i) => box(e, e.id || ('card' + i + ':' + (e.querySelector('.name') || {}).textContent)));
  const hit = (a, b) => a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;
  const overlaps = [];
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) if (hit(items[i], items[j])) overlaps.push(items[i].name + ' x ' + items[j].name);
  const ov = document.getElementById('overlay');
  return { overlaps, outside: items.filter((it) => it.r > innerWidth + 0.5 || it.l < -0.5).map((it) => it.name),
    scrolls: ov.scrollHeight > ov.clientHeight + 1 };
})()`;

for (const vp of VIEWPORTS) {
  await withPage({ ...vp, skipPrologue: false, startupScript: PROFILE, timeoutMs: 60000 }, async (page) => {
    const shot = (name) => page.shot(`idle-${name}-${vp.name}`);
    const report = async (name) => console.log(vp.name, name, JSON.stringify(await page.evaluate(FIT)));
    await page.sleep(300);
    await page.evaluate(BOOT, true);
    // Hand the tracker the unattended runs that happened while away.
    await page.evaluate(`(() => { const a = T.auto.away; a.runs = 12; a.gold = 8420; a.bestS = 412; a.stopped = false; })()`);
    await page.evaluate(key('x'));   // skips the intro; the first input of the session
    const ok = await page.waitFor(`!!T.auto.card`, 8000, 30);
    console.log(vp.name, 'away card opened:', ok, await page.evaluate(`T.state.mode`));
    await page.sleep(1900);          // the gold line finishes counting
    await shot('away'); await report('away');
    await page.evaluate(`T.auto.collect()`);
    await page.waitFor(`T.state.mode === 'title' && +getComputedStyle(document.getElementById('overlay')).opacity === 1`, 6000, 30);
    await page.sleep(400);
    await shot('title'); await report('title');
    await page.evaluate(`[...document.querySelectorAll('#ov-cards .card')].find((c) => c.textContent.startsWith('CAMP')).click()`);
    await page.sleep(500);
    await shot('camp'); await report('camp');
    // Close the camp hint with a real press on its button before Settings.
    const r = await page.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'GOT IT' && x.getBoundingClientRect().width > 0);
      if (!b) return null; const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
    if (r) { await page.click(r[0], r[1]); await page.sleep(300); }
    await page.evaluate(`T.menus.showSettings()`);
    await page.sleep(500);
    await shot('settings'); await report('settings');
    const errs = Array.isArray(page.errors) ? page.errors : [];
    if (errs && errs.length) console.log(vp.name, 'page errors:', errs);
  });
}
console.log('wrote', outDir);
