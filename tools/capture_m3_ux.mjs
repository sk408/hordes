// M3 "first minutes and menus" capture: real-Chrome screenshots of the menus,
// the first-run flow and the in-run HUD.
//   HORDES_CHROME=<chrome.exe> node tools/capture_m3_ux.mjs [tag] [outDir] [--only a,b] [--vp desktop,phone]
// Writes <outDir>/<tag>-<scene>-<viewport>.png (default docs/art/m3-ux).
// The page runs on its real clock and its own requestAnimationFrame; scenes are
// reached through the game's __TEST seams and real key events, then captured.
// Also prints, per viewport, any overlap between the in-run HUD's DOM controls
// and between those controls and the canvas clock.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv.splice(i, 2)[1].split(',') : null; };
const only = flag('--only');
const vpOnly = flag('--vp');
const tag = argv[0] || 'm3';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.resolve(argv[1] || path.join(ROOT, 'docs/art/m3-ux'));
fs.mkdirSync(outDir, { recursive: true });
process.env.HORDES_SHOT_DIR = outDir;
const { withPage } = await import('./browser.mjs');

const VIEWPORTS = [
  { name: 'desktop', w: 1280, h: 720, dpr: 1, mobile: false },
  { name: 'phone', w: 844, h: 390, dpr: 2, mobile: true },
  { name: 'desktop1080', w: 1920, h: 1080, dpr: 1, mobile: false, hudOnly: true },
  { name: 'portrait', w: 390, h: 844, dpr: 2, mobile: true, hudOnly: true },
].filter((v) => !vpOnly || vpOnly.includes(v.name));
const want = (s) => !only || only.includes(s);

// A profile that has played a few runs and owns a little, so the menus show
// their ordinary state: 1,240 gold, Orbit bought, one of each draft charge.
const PLAYED = `try { localStorage.setItem('hordes_profile_v1', JSON.stringify({ version: 11, lastPlayed: Date.now(),
  gold: 1240, bestTime: 96, unlockedWeapons: ['VOLLEY', 'BOOMERANG', 'ORBIT'],
  purchased: { hp: 2, dmg: 1, reroll: 1, skip: 1, banish: 1 },
  achievements: { totals: { runs: 6, bestGold: 610 } }, shopRefund: { version: 11, gold: 0, rows: 0 } })); } catch (e) {}`;

const BOOT = `(async () => { const m = await import('/src/main.js'); window.T = m.__TEST; return T.state.mode; })()`;
const key = (k) => `window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)} }))`;
const keyUp = (k) => `window.dispatchEvent(new KeyboardEvent('keyup', { key: ${JSON.stringify(k)} }))`;

// Rect overlap report for the in-run HUD: every visible DOM control against
// every other, and against the canvas clock.
const OVERLAPS = `(() => {
  const vis = (el) => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0.05 && r.width > 0 && r.height > 0; };
  const items = [];
  for (const el of document.querySelectorAll('#touch button, #touch .keybar')) {
    if (!vis(el) || (el.closest('.keybar') && el.tagName === 'BUTTON')) continue;
    const r = el.getBoundingClientRect();
    items.push({ name: el.id || el.className || el.textContent.trim().slice(0, 12), l: r.left, t: r.top, r: r.right, b: r.bottom });
  }
  const cv = document.getElementById('game').getBoundingClientRect();
  const hc = T.renderer.hudChrome && T.renderer.hudChrome.clock;
  const kx = cv.width / 480, ky = cv.height / 300;
  const hits = [];
  const hit = (a, b) => a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) if (hit(items[i], items[j])) hits.push(items[i].name + ' x ' + items[j].name);
  if (hc && hc.w) {
    const c = { name: 'clock', l: cv.left + hc.x * kx, t: cv.top + hc.y * ky, r: cv.left + (hc.x + hc.w) * kx, b: cv.top + (hc.y + hc.h) * ky };
    for (const it of items) if (hit(it, c)) hits.push(it.name + ' x clock');
  }
  const onCanvas = items.filter((it) => hit(it, { l: cv.left, t: cv.top, r: cv.right, b: cv.bottom })).map((it) => it.name);
  return { controls: items.length, overlaps: hits, onCanvas, canvas: [Math.round(cv.left), Math.round(cv.top), Math.round(cv.width), Math.round(cv.height)],
    clockInset: T.state.clockInset, layer: document.getElementById('touch').className };
})()`;

async function toTitle(page) {
  await page.sleep(300);
  await page.evaluate(BOOT, true);
  await page.evaluate(key('x'));   // any key skips the intro movie
  const t0 = Date.now();
  const ok = await page.waitFor(`T.state.mode === 'title' && getComputedStyle(document.getElementById('overlay')).pointerEvents !== 'none' && +getComputedStyle(document.getElementById('overlay')).opacity === 1`, 6000, 30);
  await page.sleep(200);
  return { ok, ms: Date.now() - t0 };
}

for (const vp of VIEWPORTS) {
  const shotOf = (page) => (name) => page.shot(`${tag}-${name}-${vp.name}`);

  // ---- menus, a draft and an end screen on a played profile ---------------
  await withPage({ ...vp, skipPrologue: false, startupScript: PLAYED, timeoutMs: 60000 }, async (page) => {
    const shot = shotOf(page);
    const tt = await toTitle(page);
    console.log(vp.name, 'title clickable after', tt.ms, 'ms', tt.ok ? '' : '(TIMED OUT)');
    if (!vp.hudOnly) {
      if (want('title')) await shot('title');
      if (want('prerun')) { await page.evaluate(`T.menus.showPreRun()`); await page.sleep(400); await shot('prerun'); }
      if (want('settings')) {
        await page.evaluate(`T.menus.showSettings()`); await page.sleep(400); await shot('settings');
        await page.evaluate(`T.menus.showAdvanced()`); await page.sleep(400); await shot('settings-advanced');
      }
      if (want('shop')) { await page.evaluate(`T.menus.showShop()`); await page.sleep(700); await shot('shop'); }
    }
    if (want('run') || want('draft') || want('end')) {
      await page.evaluate(`T.startRun()`);
      await page.sleep(5000);
      await page.evaluate(`T.state.player.hp = T.state.player.stats.maxHp`);
      if (want('run')) {
        await shot('run');
        console.log(vp.name, 'run HUD:', JSON.stringify(await page.evaluate(OVERLAPS)));
        // Take the wheel: hold D for a moment, then release and catch the cue.
        await page.evaluate(key('d')); await page.sleep(500);
        await shot('run-steering');
        await page.evaluate(keyUp('d')); await page.sleep(400);
        await shot('run-handback');
        if (vp.mobile) {
          // A tap reveals the transient top row on a landscape phone.
          await page.tap(Math.round(vp.w / 2), Math.round(vp.h / 2)); await page.sleep(250);
          await shot('run-toprow');
          console.log(vp.name, 'top row shown:', JSON.stringify(await page.evaluate(OVERLAPS)));
        }
      }
      if (!vp.hudOnly && want('draft')) {
        await page.evaluate(`(() => { const p = T.state.player; p.hp = p.stats.maxHp; p.xp = p.xpNext; })()`);
        await page.waitFor(`T.state.mode === 'draft'`, 4000, 30);
        await page.sleep(350);
        await shot('draft');
      }
      if (!vp.hudOnly && want('evolve')) {
        // A draft whose Volley card completes the evolution (Lv7 + Split Shot
        // owned): redraw until that card is offered, then the evolved weapon
        // in play after taking it.
        await page.evaluate(`(() => {
          const st = T.state; const v = st.weapons.find((w) => w.type === 'VOLLEY');
          v.level = 7; st.player.takenStats = { multi: 1 }; st.player.hp = st.player.stats.maxHp;
          for (let i = 0; i < 60; i++) {
            st.mode = 'playing'; st.pendingDrafts = 1; T.openDraft();
            if ([...document.querySelectorAll('#ov-cards .card')].some((c) => c._draftOffer && c._draftOffer.evoReady)) break;
          }
        })()`);
        await page.sleep(400);
        await shot('draft-evolve-ready');
        await page.evaluate(`(() => { const c = [...document.querySelectorAll('#ov-cards .card')].find((c) => c._draftOffer && c._draftOffer.evoReady); if (c) c.click(); })()`);
        await page.waitFor(`T.state.mode === 'evolve'`, 4000, 30);
        await page.sleep(400);
        await shot('evolve-offer');
        await page.evaluate(`(() => { const c = document.querySelector('#ov-cards .card'); if (c) c.click(); })()`);
        await page.waitFor(`T.state.mode === 'playing'`, 4000, 30);
        await page.evaluate(`(() => { T.state.bannerHold = 0; T.state.player.hp = T.state.player.stats.maxHp; })()`);
        await page.sleep(2500);
        await shot('run-evolved');
        await page.evaluate(key('i')); await page.sleep(400);   // the STATS overlay lists the weapons
        await shot('stats-evolved');
        await page.evaluate(key('i')); await page.sleep(300);
      }
      if (!vp.hudOnly && want('end')) {
        // Resolve the draft, play on a little, then die for real.
        await page.evaluate(`(() => { const c = document.querySelector('#ov-cards .card'); if (c) c.click(); })()`);
        await page.sleep(1500);
        await page.evaluate(`(() => { T.state.player.invuln = 0; T.die(); })()`);
        await page.evaluate(key('x'));   // skip the death movie
        await page.waitFor(`T.state.mode === 'dead'`, 4000, 30);
        await page.sleep(700);
        await shot('end');
      }
    }
    if (page.errors.length) console.log(vp.name, 'page errors:', page.errors.slice(0, 5));
  });

  // ---- the first-run tutorial on an empty profile --------------------------
  if (!vp.hudOnly && want('tutorial')) {
    await withPage({ ...vp, skipPrologue: false, skipTour: false, timeoutMs: 60000 }, async (page) => {
      const shot = shotOf(page);
      await toTitle(page);
      if (want('title')) await shot('title-fresh');
      // PLAY, then START: the run begins with no manual in between.
      await page.evaluate(`T.menus.showPreRun()`); await page.sleep(300);
      await shot('prerun-fresh');
      await page.evaluate(key('Enter'));
      await page.waitFor(`T.state.mode === 'playing' && T.prologue.active && T.prologue.paused`, 5000, 30);
      await page.sleep(250);
      await shot('tutorial-1-move');
      if (vp.mobile) { await page.swipe(Math.round(vp.w / 2), Math.round(vp.h / 2), 60, 0, 8); }
      else { await page.evaluate(key('d')); await page.sleep(250); await page.evaluate(keyUp('d')); }
      await page.waitFor(`T.state.mode === 'draft'`, 5000, 30);
      await page.sleep(400);
      await shot('tutorial-2-draft');
      await page.evaluate(`(() => { const c = document.querySelector('#ov-cards .card'); if (c) c.click(); })()`);
      await page.waitFor(`T.state.mode === 'playing' && T.prologue.active && T.prologue.bannerIdx === 2 && T.prologue.paused`, 5000, 30);
      await page.sleep(300);
      await shot('tutorial-3-potion');
      await page.waitFor(`!T.prologue.active`, 8000, 50);
      await page.sleep(1500);
      await shot('tutorial-done');
      if (page.errors.length) console.log(vp.name, 'tutorial page errors:', page.errors.slice(0, 5));
    });
  }
}
console.log('wrote', outDir);
