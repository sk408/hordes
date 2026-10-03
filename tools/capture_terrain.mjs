// M5b landscape capture: one real-Chrome frame per stage, the hero parked
// beside the stage's main plateau (cliff face, ramp, drop edge, landmark),
// at desktop and phone sizes.
//   HORDES_CHROME=<chrome.exe> node tools/capture_terrain.mjs [outDir] [STAGE,...]
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.resolve(process.argv[2] || path.join(ROOT, 'docs/art/terrain'));
fs.mkdirSync(outDir, { recursive: true });
process.env.HORDES_SHOT_DIR = outDir;
const { withPage } = await import('./browser.mjs');
const { STAGES } = await import('../src/stages.js');
const only = process.argv[3] ? process.argv[3].split(',') : null;

const VIEWPORTS = [
  { name: 'desktop', w: 1280, h: 720, dpr: 1, mobile: false },
  { name: 'phone', w: 844, h: 390, dpr: 2, mobile: true },
];
const BOOT = `(async () => { const m = await import('/src/main.js'); window.T = m.__TEST; return T.state.mode; })()`;
const key = (k) => `window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)} }))`;
// Park the hero at the foot of the main plateau's first ramp, a few enemies around.
const PARK = `(async () => {
  const st = T.state, p = st.player;
  const { terrainFor } = await import('/src/terrain.js');
  const TER = terrainFor(st.groundSeed || 0, st.stage);
  T.setPilotMode('MANUAL');
  st.enemies.length = 0; st.spawnTimer = 999; st.wave.endsAt = st.time + 9999;
  st.chests.length = 0;
  let best = TER.plateaus[0];
  for (const q of TER.plateaus) if (q.upper || q.mark) { best = q; break; }
  // Just outside the plateau corner nearest the arena centre, so the face,
  // the lit edges, a ramp and the landmark share the frame.
  const cx = best.x + best.w / 2 < 0 ? best.x + best.w : best.x;
  const cy = best.y + best.h / 2 < 0 ? best.y + best.h : best.y;
  p.x = cx + Math.sign(-cx || 1) * 30 - Math.sign(-cx || 1) * Math.min(120, best.w * 0.4);
  p.y = cy + Math.sign(-cy || 1) * 60;
  p.tz = 0;
  return st.stage + ' ' + TER.plateaus.length + ' plateaus, park ' + Math.round(p.x) + ',' + Math.round(p.y);
})()`;
const CLEAR = `(() => { const st = T.state; st.enemies.length = 0; st.enemyShots.length = 0; })()`;

for (const vp of VIEWPORTS) {
  await withPage({ ...vp, timeoutMs: 120000 }, async (page) => {
    await page.sleep(300);
    await page.evaluate(BOOT, true);
    await page.evaluate(key('x'));
    await page.sleep(400);
    for (const s of STAGES) {
      if (only && !only.includes(s.id)) continue;
      await page.evaluate(`T.stages.select(${JSON.stringify(s.id)}); T.startRun()`);
      await page.sleep(500);
      console.log(vp.name, await page.evaluate(PARK, true));
      await page.sleep(700);
      await page.evaluate(CLEAR);
      await page.shot(`terrain-${s.id.toLowerCase()}-${vp.name}`);
      // The landmark on its plateau, the hero standing on the top beside it.
      const mk = await page.evaluate(`(async () => {
        const { terrainFor } = await import('/src/terrain.js');
        const st = T.state, TER = terrainFor(st.groundSeed || 0, st.stage);
        const m = TER.marks[0]; if (!m) return false;
        st.player.x = m.x + 40; st.player.y = m.y + 50; st.player.tz = m.tier;
        return true;
      })()`, true);
      if (mk) {
        await page.sleep(600);
        await page.evaluate(CLEAR);
        await page.shot(`terrain-${s.id.toLowerCase()}-mark-${vp.name}`);
      }
    }
  });
}
