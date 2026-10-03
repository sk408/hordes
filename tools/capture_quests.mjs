// M5b slice 3 capture: real-Chrome screenshots of the quest board, the HUD
// quest tracker, the vault with its key carrier, the walled yard (shut and
// opening), a cracked wall (cracking and opened), the SECRETS shelf and the
// map, at desktop and phone sizes.
//   HORDES_CHROME=<chrome.exe> node tools/capture_quests.mjs [outDir]
// Scenes are staged: the hero is placed beside each object, enemies are
// cleared (bar the key carrier) and the pilot is MANUAL.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.resolve(process.argv[2] || path.join(ROOT, 'docs/art/quests'));
fs.mkdirSync(outDir, { recursive: true });
process.env.HORDES_SHOT_DIR = outDir;
const { withPage } = await import('./browser.mjs');

const VIEWPORTS = [
  { name: 'desktop', w: 1280, h: 720, dpr: 1, mobile: false },
  { name: 'phone', w: 844, h: 390, dpr: 2, mobile: true },
];
const BOOT = `(async () => { const m = await import('/src/main.js'); window.T = m.__TEST; return T.state.mode; })()`;
const key = (k) => `window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)} }))`;
const CLEAR = `(() => { const st = T.state; const c = st.poi && st.poi.carrier;
  st.enemies.length = 0; if (c) st.enemies.push(c); st.enemyShots.length = 0; st.spawnTimer = 999; })()`;
const goTo = (expr, dx, dy) => `(() => { const o = ${expr}; const p = T.state.player; p.x = o.x + ${dx}; p.y = o.y + ${dy};
  T.state.cam.x = p.x - 240; T.state.cam.y = p.y - 150; return [Math.round(o.x), Math.round(o.y)]; })()`;

for (const vp of VIEWPORTS) {
  await withPage({ ...vp, timeoutMs: 90000 }, async (page) => {
    const shot = (name) => page.shot(`quests-${name}-${vp.name}`);
    await page.sleep(300);
    await page.evaluate(BOOT, true);
    await page.evaluate(key('x'));
    await page.sleep(400);
    // The quest board (run setup -> QUESTS).
    await page.evaluate(`T.menus.showQuestBoard()`);
    await page.sleep(500);
    await shot('board');
    await page.evaluate(`T.menus.showPreRun()`);
    await page.sleep(400);
    await shot('prerun');
    await page.evaluate(`T.startRun()`);
    await page.sleep(1500);
    await page.evaluate(`(() => { T.setPilotMode('MANUAL'); const st = T.state; st.wave.endsAt = st.time + 9999;
      st.quests[0].n = 1; if (st.quests[2]) { st.quests[2].done = true; st.quests[2].n = 99; } })()`);
    // The vault with the key carrier beside it.
    await page.evaluate(`(() => { const st = T.state; let e = st.enemies.find(x => !x.boss);
      if (!e) return 'none';
      e.elite = true; e.keyCarrier = true; st.poi.carrier = e; st.poi.carrierSeen = true; e.speed = 0; e.hp = e.maxHp = 9999;
      e.x = st.poi.vault.x + 50; e.y = st.poi.vault.y + 10; return e.typeId; })()`);
    console.log(vp.name, 'vault', await page.evaluate(goTo('T.state.poi.vault', -40, 40)));
    await page.sleep(400);
    await page.evaluate(CLEAR);
    await page.evaluate(`(() => { const st = T.state, e = st.poi.carrier; if (e) { e.x = st.poi.vault.x + 50; e.y = st.poi.vault.y + 10; } })()`);
    await page.sleep(200);
    await shot('vault-carrier');
    // The yard, shut, from outside its gate.
    console.log(vp.name, 'yard', await page.evaluate(goTo('T.state.poi.yard', 0, 0) .replace('p.x = o.x + 0; p.y = o.y + 0;',
      `const g = { s: [0, 62], n: [0, -62], e: [70, 0], w: [-70, 0] }[o.gateSide]; p.x = o.x + g[0]; p.y = o.y + g[1];`)));
    await page.sleep(500);
    await page.evaluate(CLEAR);
    await shot('yard-shut');
    // Pull the lever (a quick visit), come back: the gate opens.
    await page.evaluate(`(() => { const st = T.state, L = st.poi.lever, p = st.player; const back = [p.x, p.y];
      p.x = L.x; p.y = L.y; T.world.tick(p, 1 / 60); p.x = back[0]; p.y = back[1]; return st.poi.yard.open; })()`);
    await page.sleep(700);
    await page.evaluate(CLEAR);
    await shot('yard-opening');
    // A cracked wall, half broken, then opened.
    const hasCrack = await page.evaluate(`!!(T.state.secrets || []).find(x => x.kind === 'crack')`);
    if (hasCrack) {
      await page.evaluate(`(() => { const c = T.state.secrets.find(x => x.kind === 'crack'); c.hits = 9; })()`);
      console.log(vp.name, 'crack', await page.evaluate(goTo(`T.state.secrets.find(x => x.kind === 'crack')`, 30, 30)));
      await page.sleep(500);
      await page.evaluate(CLEAR);
      await shot('crack');
      await page.evaluate(`(() => { const st = T.state, c = st.secrets.find(x => x.kind === 'crack'); c.hits = 99; st.secretRng = () => 0.9;
        st.projectiles.push({ x: c.x, y: c.wallY - 4, vx: 0, vy: 0, age: 0, hit: new Set() }); T.world.tick(st.player, 1 / 60); return c.state; })()`);
      await page.sleep(500);
      await page.evaluate(CLEAR);
      await shot('crack-open');
    }
    // The map: some fog lifted, the lever and yard known (the link), the carrier.
    await page.evaluate(`(() => {
      const st = T.state, a = st.atlas;
      for (let cy = 0; cy < a.side; cy++) for (let cx = 0; cx < a.side; cx++) if (Math.abs(cx - cy) < 8 || cx > a.side * 0.6) a.visited[cy * a.side + cx] = 1;
      for (const lm of a.landmarks) { if (lm.site && ['vault', 'lever', 'yard', 'shrine'].includes(lm.kind)) lm.discovered = true; else lm.seen = true; }
      st.mapOpen = true;
    })()`);
    await page.sleep(400);
    await page.evaluate(CLEAR);
    await shot('map');
    console.log(vp.name, 'map', JSON.stringify(await page.evaluate(`T.renderer.atlasMap && T.renderer.atlasMap.poi`)));
    await page.evaluate(`T.state.mapOpen = false`);
    // The SECRETS shelf, a few found.
    await page.evaluate(`(() => { const w = T.getProfile().world; w.secrets.crack = true; w.secrets.vault = true; w.glyphs = ['VERDANT_HOLLOW', 'ASHEN_WASTE', 'SNOWFIELD']; w.chains.warden = 1; T.state.mode = 'menu'; T.menus.showSecrets(); })()`);
    await page.sleep(500);
    await shot('secrets-shelf');
    const errs = Array.isArray(page.errors) ? page.errors : [];
    if (errs.length) console.log(vp.name, 'page errors:', errs);
  });
}
console.log('wrote', outDir);
