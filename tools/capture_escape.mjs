// Escape cinematic capture: real-Chrome screenshots of the movie at fixed
// times, for several stages and pilots, at desktop and phone sizes.
//   HORDES_CHROME=<chrome.exe> node tools/capture_escape.mjs [outDir] [filter]
// Each case starts a real run on that stage with that pilot, hands over to
// the cinematic through the game's own startEscape, pins its clock and shoots.
// `filter` keeps the cases whose name contains it (e.g. "verdant" or "phone").
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.resolve(process.argv[2] || path.join(ROOT, 'docs/art/escape'));
const filter = (process.argv[3] || '').toLowerCase();
fs.mkdirSync(outDir, { recursive: true });
process.env.HORDES_SHOT_DIR = outDir;
const { withPage } = await import('./browser.mjs');

const VIEWPORTS = [
  { name: 'desktop', w: 1280, h: 720, dpr: 1, mobile: false },
  { name: 'phone', w: 844, h: 390, dpr: 2, mobile: true },
];
// stage, pilot, the enemy types the run met (null: the stage's own pool),
// best gold, Escape Writ. `phone`: also shot at the phone size.
const CASES = [
  { stage: 'VERDANT_HOLLOW', pilot: 'KNIGHT', met: ['CHASER', 'SWARMER', 'BRUTE', 'DASHER', 'TICK'], best: 1800, phone: true },
  { stage: 'SNOWFIELD', pilot: 'WITCH', met: null, best: 12000, writ: true, phone: true },
  { stage: 'ASHEN_WASTE', pilot: 'ROGUE', met: ['CHASER', 'DASHER', 'BRUTE', 'COLOSSUS'], best: 5400 },
  { stage: 'BONE_DESERT', pilot: 'PALADIN', met: ['SWARMER', 'TICK', 'SPITTER', 'CHASER'], best: 900 },
];
// Seconds into the movie: establish, the wave over the crest, the glance, a
// lunge, the boss risen, its wind-up, the lunge and dive, the slam, the card.
const TIMES = [0.5, 2, 2.5, 4, 6, 6.85, 7.3, 7.5, 8.6];

const BOOT = `(async () => { const m = await import('/src/main.js'); window.T = m.__TEST; return T.state.mode; })()`;
const key = (k) => `window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)} }))`;

for (const vp of VIEWPORTS) {
  if (filter && /^(desktop|phone)$/.test(filter) && filter !== vp.name) continue;
  await withPage({ ...vp, timeoutMs: 90000 }, async (page) => {
    await page.sleep(300);
    await page.evaluate(BOOT, true);
    await page.evaluate(key('x'));
    await page.sleep(400);
    for (const c of CASES) {
      const name = c.stage.toLowerCase().replace('_', '-') + '-' + c.pilot.toLowerCase();
      if (filter && !/^(desktop|phone)$/.test(filter) && !name.includes(filter)) continue;
      if (vp.name === 'phone' && !c.phone && !filter) continue;
      const info = await page.evaluate(`(() => {
        const p = T.getProfile();
        p.equippedCharacter = ${JSON.stringify(c.pilot)};
        p.achievements.totals.bestGold = ${c.best};
        p.purchased.escapeskip = ${c.writ ? 1 : 0};
        T.stages.select(${JSON.stringify(c.stage)});
        T.auto.on = false;
        T.startRun();
        const st = T.state;
        st.wave.met = ${c.met ? JSON.stringify(Object.fromEntries(c.met.map(m => [m, 1]))) : 'undefined'};
        T.escape.start();
        const s = T.escape.cine.scene;
        return { mode: st.mode, stage: s.stage, pilot: s.character, cast: s.cast, boss: s.bossId, payout: s.payout };
      })()`);
      console.log(vp.name, name, JSON.stringify(info));
      for (const t of TIMES) {
        await page.evaluate(`T.escape.hold(${t})`);
        await page.sleep(140);
        await page.shot(`escape-${name}-${String(t).replace('.', '_')}-${vp.name}`);
      }
      await page.evaluate(`T.escape.skip()`);
      await page.sleep(120);
    }
    const errs = Array.isArray(page.errors) ? page.errors : [];
    if (errs.length) console.log(vp.name, 'page errors:', errs);
  });
}
console.log('wrote', outDir);
