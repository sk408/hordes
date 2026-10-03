// M5b sites capture: real-Chrome screenshots of the sites in the field, a
// shrine charging, the cursed statue's prompt, the map (fog, icons, "?",
// waypoint) and the waypoint's edge arrow, at desktop and phone sizes.
//   HORDES_CHROME=<chrome.exe> node tools/capture_sites.mjs [outDir]
// The scene is staged: the run's own sites are moved next to the hero so one
// frame shows several; enemies are cleared and the pilot is MANUAL so nothing
// walks out of frame.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.resolve(process.argv[2] || path.join(ROOT, 'docs/art/sites'));
fs.mkdirSync(outDir, { recursive: true });
process.env.HORDES_SHOT_DIR = outDir;
const { withPage } = await import('./browser.mjs');

const VIEWPORTS = [
  { name: 'desktop', w: 1280, h: 720, dpr: 1, mobile: false },
  { name: 'phone', w: 844, h: 390, dpr: 2, mobile: true },
];
const BOOT = `(async () => { const m = await import('/src/main.js'); window.T = m.__TEST; return T.state.mode; })()`;
const key = (k) => `window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)} }))`;
// Stage the sites around the hero (offsets in world px).
const STAGE = `(() => {
  const st = T.state, p = st.player;
  T.setPilotMode('MANUAL');
  st.enemies.length = 0; st.spawnTimer = 999; st.wave.endsAt = st.time + 9999;
  const at = (s, dx, dy) => { s.x = Math.round(p.x + dx); s.y = Math.round(p.y + dy); };
  const of = (k) => st.sites.filter(s => s.kind === k);
  at(of('shrine')[0], -70, -22);
  at(of('fountain')[0], 75, -30);
  at(of('altar')[0], 0, 42);
  at(of('statue')[0], -95, 40);
  const br = of('brazier').slice(0, 4);
  br.forEach((b, i) => at(b, 70 + (i % 2) * 16, 28 + Math.floor(i / 2) * 14));
  st.chests.length = 0;
  for (const lm of st.atlas.landmarks) if (lm.site) { lm.x = lm.site.x; lm.y = lm.site.y; }
  return st.sites.length;
})()`;
const CLEAR = `(() => { const st = T.state; st.enemies.length = 0; st.enemyShots.length = 0; })()`;

for (const vp of VIEWPORTS) {
  await withPage({ ...vp, timeoutMs: 60000 }, async (page) => {
    const shot = (name) => page.shot(`sites-${name}-${vp.name}`);
    await page.sleep(300);
    await page.evaluate(BOOT, true);
    await page.evaluate(key('x'));
    await page.sleep(400);
    await page.evaluate(`T.startRun()`);
    await page.sleep(600);
    console.log(vp.name, 'sites', await page.evaluate(STAGE));
    await page.sleep(500);
    await page.evaluate(CLEAR);
    await shot('field');
    // A shrine charging: stand in its ring.
    await page.evaluate(`(() => { const s = T.state.sites.find(x => x.kind === 'shrine'); T.state.player.x = s.x; T.state.player.y = s.y + 6; })()`);
    await page.sleep(1500);
    await page.evaluate(CLEAR);
    await shot('shrine-charging');
    console.log(vp.name, 'charge', await page.evaluate(`T.state.sites.find(x => x.kind === 'shrine').charge.toFixed(2)`));
    // The cursed statue's prompt: approach without touching.
    await page.evaluate(`(() => { const s = T.state.sites.find(x => x.kind === 'statue'); T.state.player.x = s.x + 34; T.state.player.y = s.y - 6; })()`);
    await page.sleep(400);
    await page.evaluate(CLEAR);
    await shot('statue-prompt');
    // The map: a walked band of fog lifted, sites found and seen, a waypoint.
    await page.evaluate(`(() => {
      const st = T.state, a = st.atlas;
      for (let cy = 0; cy < a.side; cy++) for (let cx = 0; cx < a.side; cx++) {
        if (Math.abs(cx - cy) < 7 || (cy > a.side * 0.55 && cx < a.side * 0.4)) a.visited[cy * a.side + cx] = 1;
      }
      a.landmarks.forEach((lm, i) => { if (i % 3 === 0) lm.discovered = true; else if (i % 3 === 1) lm.seen = true; });
      const far = st.sites.filter(s => s.kind !== 'statue').sort((x, y) => Math.hypot(y.x - st.player.x, y.y - st.player.y) - Math.hypot(x.x - st.player.x, x.y - st.player.y))[0];
      const lm = a.landmarks.find(l => l.site === far); lm.discovered = true;
      T.sites.setWaypoint(far);
      st.mapOpen = true;
      return far.kind;
    })()`);
    await page.sleep(400);
    await page.evaluate(CLEAR);
    await shot('map');
    console.log(vp.name, 'map', JSON.stringify(await page.evaluate(`(() => { const m = T.renderer.atlasMap; return { x: m.x, y: m.y, size: m.size, marks: m.landmarks.length, clear: !!m.clearBtn }; })()`)));
    // Close the map: the waypoint's edge arrow points at the far site.
    await page.evaluate(`T.state.mapOpen = false`);
    await page.sleep(300);
    await page.evaluate(CLEAR);
    await shot('waypoint-arrow');
    console.log(vp.name, 'arrow', JSON.stringify(await page.evaluate(`({ m: T.renderer.waypointMark, wv: T.renderer.worldView, wp: [T.state.waypoint.x, T.state.waypoint.y], p: [T.state.player.x, T.state.player.y], cam: T.state.cam })`)));
    const errs = Array.isArray(page.errors) ? page.errors : [];
    if (errs.length) console.log(vp.name, 'page errors:', errs);
  });
}
console.log('wrote', outDir);
