// Real-Chrome screenshots of every menu and overlay, plus a fit report per
// screen (text cut off, boxes off screen, an overlay that scrolls) and the
// page's font family. Made for the pixel font (R5) and kept for the sheets
// that compare trees (round 8 "font2" took the pixel font out again).
//   HORDES_CHROME=<chrome.exe> node tools/capture_font_menus.mjs <tag> <outDir> [--vp desktop,land,portrait,small] [--root <dir>] [--only a,b]
// Writes <outDir>/<tag>-<scene>-<vp>.png and <outDir>/<tag>-<vp>.json.
// --root serves another tree (the "before" pictures come from the base branch).
import path from 'node:path';
import fs from 'node:fs';

const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv.splice(i, 2)[1] : null; };
const vpOnly = (flag('--vp') || '').split(',').filter(Boolean);
const root = flag('--root');
const only = (flag('--only') || '').split(',').filter(Boolean);
const tag = argv[0] || 'font';
const outDir = path.resolve(argv[1] || 'font-shots');
fs.mkdirSync(outDir, { recursive: true });
process.env.HORDES_SHOT_DIR = outDir;
const { withPage } = await import('./browser.mjs');
const want = (s) => !only.length || only.includes(s);

const VIEWPORTS = [
  { name: 'desktop', w: 1280, h: 720, dpr: 1, mobile: false },
  { name: 'land', w: 844, h: 390, dpr: 2, mobile: true },
  { name: 'portrait', w: 390, h: 844, dpr: 2, mobile: true },
  { name: 'small', w: 375, h: 667, dpr: 2, mobile: true },
].filter((v) => !vpOnly.length || vpOnly.includes(v.name));

// A played profile: gold, a few weapons, the camp open (6 runs), on the
// current save schema with What's New not yet read (the title shows it once).
const PLAYED = `try { localStorage.setItem('hordes_profile_v1', JSON.stringify({ version: 11, lastPlayed: Date.now(),
  gold: 4240, bestTime: 296, unlockedWeapons: ['VOLLEY', 'BOOMERANG', 'ORBIT'],
  purchased: { hp: 2, dmg: 1, reroll: 1, skip: 1, banish: 1 },
  achievements: { totals: { runs: 6, bestGold: 610 } }, shopRefund: { version: 11, gold: 0, rows: 0 } }));
  localStorage.setItem('hordes_tour_draft', '1'); } catch (e) {}
  requestAnimationFrame(() => { window.__firstRaf = performance.now(); });`;
const BOOT = `(async () => { const m = await import('/src/main.js'); window.T = m.__TEST;
  window.__pump = (n) => { for (let i = 0; i < n; i++) T.runFrame ? T.runFrame(performance.now(), 1 / 60, true) : 0; };
  return T.state.mode; })()`;
const key = (k) => `window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)}, bubbles: true }))`;

// The fit report: every visible text box inside a shown overlay or panel.
const FIT = `(() => {
  const vw = innerWidth, vh = innerHeight;
  const roots = [...document.querySelectorAll('#overlay, #tut-panel, #tour-tip, #help-tip, .wn-over')]
    .filter((e) => { const cs = getComputedStyle(e); return cs.display !== 'none' && cs.visibility !== 'hidden'; });
  const cut = [], off = [];
  for (const r of roots) for (const el of r.querySelectorAll('*')) {
    if (el.tagName === 'CANVAS' || el.tagName === 'BR') continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!own) continue;
    const b = el.getBoundingClientRect();
    if (!b.width || !b.height) continue;
    const name = (el.className && typeof el.className === 'string' ? el.className.split(' ')[0] : el.tagName.toLowerCase()) + ':' + el.textContent.trim().slice(0, 18);
    if ((cs.overflow !== 'visible' || cs.textOverflow === 'ellipsis') && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)) cut.push(name);
    if (b.left < -0.5 || b.right > vw + 0.5 || b.top < -0.5 || b.bottom > vh + 0.5) off.push(name);
  }
  const ov = document.getElementById('overlay');
  return { fam: getComputedStyle(document.body).fontFamily,
    scrolls: ov.style.display !== 'none' && ov.scrollHeight > ov.clientHeight + 1,
    cut: cut.slice(0, 8), off: off.slice(0, 8) };
})()`;

async function toTitle(page) {
  await page.sleep(300);
  await page.evaluate(BOOT, true);
  await page.evaluate(key('x'));
  await page.waitFor(`T.state.mode === 'title' && getComputedStyle(document.getElementById('overlay')).pointerEvents !== 'none' && +getComputedStyle(document.getElementById('overlay')).opacity === 1`, 8000, 30);
  await page.sleep(250);
}
const clickCard = (name) => `(() => { const c = [...document.querySelectorAll('#ov-cards .card')].find((c) => (c.querySelector('.name') || {}).textContent.trim().startsWith(${JSON.stringify(name)})); if (c) c.click(); return !!c; })()`;

for (const vp of VIEWPORTS) {
  const report = { vp: vp.name, scenes: {} };
  const base = { ...vp, skipPrologue: false, startupScript: PLAYED, timeoutMs: 60000, ...(root ? { root: path.resolve(root) } : {}) };
  const take = async (page, scene) => {
    await page.sleep(350);
    await page.shot(`${tag}-${scene}-${vp.name}`);
    report.scenes[scene] = await page.evaluate(FIT);
  };

  // ---- the title and every screen it reaches --------------------------------
  await withPage(base, async (page) => {
    await toTitle(page);
    if (want('whatsnew')) await take(page, 'whatsnew');
    await page.evaluate(`document.querySelectorAll('.wn-over').forEach((e) => e.remove())`);
    if (want('title')) { await page.evaluate(`T.menus.showTitle()`); await take(page, 'title'); }
    if (want('prerun')) { await page.evaluate(`T.menus.showPreRun()`); await take(page, 'prerun'); }
    if (want('loadout')) { await page.evaluate(`T.menus.showLoadout('title')`); await take(page, 'loadout'); }
    if (want('shop')) { await page.evaluate(`T.menus.showShop()`); await page.sleep(400); await take(page, 'shop'); }
    if (want('camp')) { await page.evaluate(`T.menus.showTitle()`); await page.sleep(200); await page.evaluate(clickCard('CAMP')); await take(page, 'camp'); }
    if (want('characters')) { await page.evaluate(`T.menus.showTitle()`); await page.sleep(200); await page.evaluate(clickCard('CHARACTERS')); await take(page, 'characters'); }
    if (want('progress')) { await page.evaluate(`T.menus.showProgress()`); await take(page, 'progress'); }
    if (want('trophies')) { await page.evaluate(`T.openTrophies()`); await take(page, 'trophies'); await page.evaluate(`T.closeTrophies && T.closeTrophies()`); }
    if (want('bestiary')) { await page.evaluate(`T.openBestiary()`); await take(page, 'bestiary'); await page.evaluate(`T.closeBestiary && T.closeBestiary()`); }
    if (want('apex')) { await page.evaluate(`T.openApexGallery()`); await take(page, 'apex'); await page.evaluate(`T.closeApexGallery && T.closeApexGallery()`); }
    if (want('quests')) { await page.evaluate(`T.menus.showQuestBoard()`); await take(page, 'quests'); }
    if (want('settings')) { await page.evaluate(`T.menus.showSettings()`); await take(page, 'settings'); }
    if (want('advanced')) { await page.evaluate(`T.menus.showAdvanced()`); await take(page, 'advanced'); }
    if (want('help')) { await page.evaluate(`T.menus.showHowToPlay()`); await take(page, 'help'); }
    if (page.errors.length) report.errorsMenus = page.errors.slice(0, 6);
  });

  // ---- in a run: a draft, the pause screen, stats, the evolve offer, the
  // intermission and the end card -------------------------------------------
  await withPage(base, async (page) => {
    await toTitle(page);
    await page.evaluate(`T.startRun()`);
    await page.sleep(1500);
    await page.evaluate(`(() => { const p = T.state.player; p.stats.maxHp = 4000; p.hp = 4000; })()`);
    // A first-run hint panel (the pilot tip) is a tutorial banner: shoot it, then OK it.
    if (await page.evaluate(`(() => { const e = document.getElementById('tut-panel'); return !!e && getComputedStyle(e).display !== 'none' && e.textContent.trim().length > 0; })()`)) {
      if (want('tip')) await take(page, 'tip');
      await page.evaluate(`(() => { const b = document.querySelector('#tut-panel .tut-btn'); if (b) { b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); b.click(); } })()`);
      await page.sleep(300);
    }
    await page.evaluate(`(() => { const st = T.state; st.mode = 'playing'; st.pendingDrafts = 1; T.openDraft(); })()`);
    await page.waitFor(`T.state.mode === 'draft'`, 5000, 30);
    await page.sleep(700);   // past the deal-in
    if (want('draft')) await take(page, 'draft');
    await page.evaluate(`(() => { const c = document.querySelector('#ov-cards .card'); if (c) c.click(); })()`);
    await page.sleep(900);
    if (want('pause')) { await page.evaluate(key('Escape')); await page.waitFor(`T.state.mode === 'settings'`, 3000, 30); await take(page, 'pause'); await page.evaluate(key('Escape')); await page.sleep(300); }
    if (want('stats')) { await page.evaluate(`T.openStats()`); await take(page, 'stats'); await page.evaluate(`T.closeStats()`); }
    if (want('evolve')) {
      await page.evaluate(`(() => {
        const st = T.state; const v = st.weapons.find((w) => w.type === 'VOLLEY');
        v.level = 7; st.player.takenStats = { multi: 1 }; st.player.hp = st.player.stats.maxHp;
        for (let i = 0; i < 60; i++) {
          st.mode = 'playing'; st.pendingDrafts = 1; T.openDraft();
          if ([...document.querySelectorAll('#ov-cards .card')].some((c) => c._draftOffer && c._draftOffer.evoReady)) break;
        }
      })()`);
      await page.sleep(500);
      await page.evaluate(`(() => { const c = [...document.querySelectorAll('#ov-cards .card')].find((c) => c._draftOffer && c._draftOffer.evoReady); if (c) c.click(); })()`);
      await page.waitFor(`T.state.mode === 'evolve'`, 4000, 30);
      await take(page, 'evolve');
      await page.evaluate(`(() => { const c = document.querySelector('#ov-cards .card'); if (c) c.click(); })()`);
      await page.sleep(600);
    }
    if (want('intermission')) {
      await page.evaluate(`(() => { const S = T.state; S.enemies.length = 0; S.wave.num = 2; S.wave.cinePending = false; T.travel.intermission(); })()`);
      await page.waitFor(`T.state.mode === 'intermission' || document.getElementById('overlay').style.display === 'flex'`, 3000, 30);
      await take(page, 'intermission');
    }
    if (want('end')) {
      await page.evaluate(`(() => { T.state.mode = 'playing'; document.getElementById('overlay').style.display = 'none'; T.state.player.invuln = 0; T.die(); })()`);
      await page.evaluate(key('x'));
      await page.waitFor(`T.state.mode === 'dead'`, 5000, 30);
      await page.sleep(900);
      await take(page, 'end');
    }
    if (page.errors.length) report.errorsRun = page.errors.slice(0, 6);
  });

  // ---- a new player's first run: the tutorial's banners and the guided draft
  if (want('tutorial')) {
    await withPage({ ...base, startupScript: 'requestAnimationFrame(() => { window.__firstRaf = performance.now(); });', skipTour: false }, async (page) => {
      await toTitle(page);
      await take(page, 'title-fresh');
      await page.evaluate(`T.menus.showPreRun()`); await page.sleep(300);
      await page.evaluate(key('Enter'));
      await page.waitFor(`T.state.mode === 'playing' && T.prologue.active && T.prologue.paused`, 6000, 30);
      await take(page, 'tutorial-banner');
      if (vp.mobile) await page.swipe(Math.round(vp.w / 2), Math.round(vp.h / 2), 60, 0, 8);
      else { await page.evaluate(key('d')); await page.sleep(250); await page.evaluate(`window.dispatchEvent(new KeyboardEvent('keyup', { key: 'd' }))`); }
      await page.waitFor(`T.state.mode === 'draft'`, 6000, 30);
      await page.sleep(700);
      await take(page, 'tutorial-draft');
      if (page.errors.length) report.errorsTutorial = page.errors.slice(0, 6);
    });
  }
  fs.writeFileSync(path.join(outDir, `${tag}-${vp.name}.json`), JSON.stringify(report, null, 1));
  console.log(vp.name, Object.entries(report.scenes).map(([k, v]) =>
    k + (v.scrolls ? ' SCROLLS' : '') + (v.cut.length ? ' CUT ' + v.cut.join('|') : '') + (v.off.length ? ' OFF ' + v.off.join('|') : '')).join('; '));
  for (const k of ['errorsMenus', 'errorsRun', 'errorsTutorial']) if (report[k]) console.log(vp.name, k, report[k]);
}
