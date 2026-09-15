// HORDES - tools/verify_g25_apex_gallery.mjs (G25 slice 2: the full-screen
// apex gallery is REAL in the browser at phone size).
//
// REAL Chrome, PHONE viewport 390x844 @dpr3, real finger taps + real key
// events. Proves:
//   A. GATE OPEN (completed save seeded through the REAL localStorage key, the
//      apex_mark item owned via the REAL buyApex buyer in-node - never a
//      hand-poked profile): a run starts via a REAL tap and the sim clock is
//      ASSERTED past 1.0s BEFORE anything is measured; then title -> SHOP ->
//      APEX -> GALLERY opens the apex screen.
//   B. the REUSED G9 showcase: renderer.trophyShowcase carries the box with
//      an INTEGER scale + screen coords, the selected id, the OWNED caption.
//   C. PREV/NEXT step the ring (real taps): the id changes; a LOCKED entry
//      paints the SHARED LOCKED mask (asserted by the mask's ART ID, not a
//      pixel guess) with a LOCKED + price caption; the ring wraps.
//   D. ESC (a real keydown on window) returns to the apex PANEL (ovTitle
//      APEX) and the showcase seam goes NULL.
//   E. the chrome gate: #hud, #hints, #touch, #joy are all display:none while
//      the gallery is open (chromeOn allowlist: playing/finale only).
//   F. a canvas INK READ-BACK inside the showcase box (non-background pixels
//      counted off the live canvas; > 0, printed) + the PNG 1170x2532 copied
//      to docs/art/browser-verify-2026-09-12/g25-apex-gallery-phone.png.
//   G. GATE CLOSED (fresh browser): the shop DOM has NO apex path, real key
//      events never enter mode 'apex', the showcase seam stays NULL; second
//      capture g25-apex-gallery-closed-phone.png.
// EVIDENCE DISCLOSURE: this host has NO vision tool in this job - the PNGs
// are read back by dimensions/ink counts and every claim is live-DOM/canvas
// state. "Looks right" is never claimed.
// Run: node tools/verify_g25_apex_gallery.mjs
import { withPage } from './browser.mjs';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  makeProfile, SHOP_UPGRADES, shopRowOwned, buyUpgrade, buyApex, APEX_BY_ID,
} from '../src/meta.js';

const ART = 'docs/art/browser-verify-2026-09-12';
mkdirSync(ART, { recursive: true });
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? '  PASS ' : '  FAIL ') + name + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : ''));
};

const TOUR19 = ['stage1', 'hud', 'pilot', 'focus', 'stance', 'move', 'skills', 'potions',
  'stats', 'cog', 'draft', 'edge', 'chest', 'portal', 'arch', 'shrine',
  'intermission', 'death', 'settings'];
const STARTUP = "try { localStorage.setItem('hordes_onboarded', '1'); } catch (e) {}\n" +
  'for (const k of ' + JSON.stringify(TOUR19) + ") { try { localStorage.setItem('hordes_tour_' + k, '1'); } catch (e) {} }";

// The completed+apex_mark-owned profile, built through the REAL buyers
// in-node (every shop row to its own ownership bar, then buyApex): ownership
// lands through the same code the player's tap runs, never a hand-poked field.
function ownedProfilePayload() {
  const p = makeProfile();
  p.gold = 1e12;
  for (const def of SHOP_UPGRADES) {
    let guard = 0;
    while (!shopRowOwned(p, def) && buyUpgrade(p, def.id)) {
      if (++guard > 100) throw new Error('runaway buy loop on ' + def.id);
    }
  }
  if (!buyApex(p, 'apex_mark')) throw new Error('fixture buy failed');
  p.gold = 100;
  return JSON.stringify({ ...p, version: 8 });
}

const centerOfExpr = (up) => `(() => {
  const el = [...document.getElementById('ov-cards').children]
    .find(k => (k.textContent || '').toUpperCase().includes(${JSON.stringify(up)}));
  if (!el) return null;
  let r = el.getBoundingClientRect();
  const ov = document.getElementById('overlay');
  if (ov) {
    if (r.bottom > innerHeight - 8) { ov.scrollTop += r.bottom - innerHeight + 24; r = el.getBoundingClientRect(); }
    else if (r.top < 8) { ov.scrollTop += r.top - 24; r = el.getBoundingClientRect(); }
  }
  if (r.bottom > innerHeight + 40 || r.top < -40 || r.right < 0 || r.left > innerWidth) return null;
  return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
})()`;
async function tapCard(p, up) {
  const c = await p.evaluate(centerOfExpr(up));
  if (!c) return null;
  await p.tap(c[0], c[1]);
  return c;
}
const cardTexts = (p) => p.evaluate(
  `(() => [...document.getElementById('ov-cards').children].map(c => (c.textContent || '').split('\\n')[0]))()`);
const T = `(await import('./src/main.js')).__TEST`;

// ===========================================================================
// SESSION A - gate open, apex_mark owned: run first, then the gallery.
// ===========================================================================
const out = await withPage({ w: 390, h: 844, dpr: 3,
  startupScript: STARTUP +
    "try { localStorage.setItem('hordes_profile_v1', " + JSON.stringify(ownedProfilePayload()) + "); } catch (e) {}",
}, async (p) => {
  await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode !== 'intro')()`, 15000);
  await p.waitFor(`(async () => { const rv = (await import('./src/main.js')).__TEST.state.titleReveal; return !rv || rv.phase === 'settled'; })()`, 8000);

  // ---- A: a REAL run first (frozen-game rule: clock > 1.0s before measuring)
  const start = await tapCard(p, 'START GAME');
  check('A1 a REAL tap on START GAME boots the run', !!start);
  const advancing = await p.waitFor(
    `(async () => { const st = (await import('./src/main.js')).__TEST.state; return st.mode === 'playing' && st.time > 1.0; })()`, 12000, 200);
  check('A2 the sim clock is past 1.0s BEFORE any measurement', !!advancing, { advancing });
  await p.evaluate(`(async () => { ${T}.die(); })()`, true);
  await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode === 'dead')()`, 8000);
  await tapCard(p, 'TITLE');
  await tapCard(p, 'SHOP');
  const cards = await cardTexts(p);
  check('A3 title -> SHOP carries the gated APEX row', cards.some(t => /APEX/.test(t)), { cards: cards.slice(0, 6) });
  const panel = await tapCard(p, 'APEX');
  check('A4 the apex panel opens (ovTitle APEX)',
    !!panel && await p.evaluate(`(() => document.getElementById('ov-title').textContent)()`) === 'APEX');
  const panelCards = await cardTexts(p);
  check('A5 the panel carries the GALLERY card (the one door)', panelCards.some(t => /GALLERY/.test(t)), { panelCards });
  const gallery = await tapCard(p, 'GALLERY');
  const modeA = await p.evaluate(`(async () => (await import('./src/main.js')).__TEST.state.mode)()`);
  check('A6 one REAL tap on GALLERY opens the apex gallery (mode apex)', !!gallery && modeA === 'apex', { modeA });

  // ---- B: the reused G9 showcase, measured through the frame loop's own seam
  const live = await p.waitFor(`(async () => !!(await import('./src/main.js')).__TEST.renderer.trophyShowcase)()`, 8000, 100);
  const seam = await p.evaluate(`(async () => (await import('./src/main.js')).__TEST.renderer.trophyShowcase)()`, true);
  check('B1 renderer.trophyShowcase (the REUSED G9 seam) is populated with an INTEGER scale + coords',
    live && seam && Number.isInteger(seam.scale) && seam.scale >= 1 &&
    Number.isFinite(seam.x) && Number.isFinite(seam.y) && seam.w === 32 * seam.scale && seam.h === 32 * seam.scale,
    seam);
  const sel = await p.evaluate(`(async () => { const s = (await import('./src/main.js')).__TEST.state;
    return { id: s.trophyView.id, locked: s.trophyView.locked, artId: s.trophyView.art.id,
             sub: (document.getElementById('ov-sub').textContent || '') }; })()`, true);
  check('B2 the selected id is the catalogue head (apex_mark), OWNED: its OWN emblem + OWNED caption',
    sel.id === 'apex_mark' && sel.locked === false && sel.artId === 'apex_mark' &&
    sel.sub.includes('OWNED') && sel.sub.includes(String(APEX_BY_ID.apex_mark.removes).slice(0, 8)),
    { id: sel.id, locked: sel.locked, artId: sel.artId, sub: sel.sub.replace(/\n/g, ' | ') });

  // ---- C: PREV/NEXT step the ring (real taps); LOCKED paints the shared mask
  await tapCard(p, 'NEXT');
  await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.trophyView.id === 'apex_endless_fire')()`, 5000, 100);
  const locked = await p.evaluate(`(async () => { const s = (await import('./src/main.js')).__TEST.state;
    return { id: s.trophyView.id, locked: s.trophyView.locked, artId: s.trophyView.art.id,
             sub: (document.getElementById('ov-sub').textContent || '') }; })()`, true);
  check('C1 NEXT steps onto apex_endless_fire: LOCKED, painting the SHARED LOCKED mask (by ART ID) + price caption',
    locked.id === 'apex_endless_fire' && locked.locked === true && locked.artId === 'LOCKED' &&
    locked.sub.includes('LOCKED') && locked.sub.includes(String(APEX_BY_ID.apex_endless_fire.baseCost)),
    { id: locked.id, artId: locked.artId, sub: locked.sub.replace(/\n/g, ' | ') });
  await tapCard(p, 'NEXT');
  const wrapped = await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.trophyView.id === 'apex_mark')()`, 5000, 100);
  check('C2 NEXT past the end WRAPS the ring back to the head', !!wrapped);

  // ---- E: the chrome gate, read while the gallery is open. COMPUTED display,
  // because the gates differ per element (#hud/#touch/#joy carry inline
  // display:none from drawHud/syncChrome; #hints is stylesheet display:none
  // turned on ONLY by its .on class) - the computed value is the truth.
  const chrome = await p.evaluate(`(() => ({
    hud: getComputedStyle(document.getElementById('hud')).display,
    hints: getComputedStyle(document.getElementById('hints')).display,
    touch: getComputedStyle(document.getElementById('touch')).display,
    joy: getComputedStyle(document.getElementById('joy')).display }))()`);
  check('E1 chrome gate: #hud #hints #touch #joy all compute to display:none while the gallery is open',
    chrome.hud === 'none' && chrome.hints === 'none' && chrome.touch === 'none' && chrome.joy === 'none', chrome);

  // ---- F: a canvas ink read-back INSIDE the showcase box + the PNG
  const ink = await p.evaluate(`(async () => {
    const R = (await import('./src/main.js')).__TEST.renderer.trophyShowcase;
    const cv = document.getElementById('game');
    const r = cv.getBoundingClientRect();
    const sx = r.width / 480, sy = r.height / 300;
    const g = cv.getContext('2d');
    const x = Math.round(R.x * sx), y = Math.round(R.y * sy);
    const w = Math.round(R.w * sx), h = Math.round(R.h * sy);
    const d = g.getImageData(x, y, w, h).data;
    let nonBg = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      if (Math.abs(d[i] - 3) > 12 || Math.abs(d[i + 1] - 3) > 12 || Math.abs(d[i + 2] - 8) > 12) nonBg++;
    }
    return { box: { x, y, w, h }, nonBg };
  })()`, true);
  check('F1 canvas ink read-back inside the showcase box: non-background pixels > 0',
    ink.nonBg > 0, ink);
  const shot = await p.shot('g25-apex-gallery-phone');
  const dest = join(ART, 'g25-apex-gallery-phone.png');
  copyFileSync(shot, dest);
  const pngB64 = readFileSync(dest).toString('base64');
  const png = await p.evaluate(`(async () => {
    const img = await createImageBitmap(await (await fetch('data:image/png;base64,${pngB64}')).blob());
    return { w: img.width, h: img.height };
  })()`, true);
  check('F2 the capture is 1170x2532 (phone @dpr3)', png.w === 1170 && png.h === 2532, png);

  // ---- D: ESC (a real keydown) returns to the panel; the seam goes NULL
  await p.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
  const afterEsc = await p.waitFor(`(async () => { const t = (await import('./src/main.js')).__TEST;
    return t.state.mode !== 'apex' && t.renderer.trophyShowcase === null; })()`, 5000, 100);
  const panelAgain = await p.evaluate(`(() => document.getElementById('ov-title').textContent)()`);
  check('D1 ESC (real keydown) returns to the APEX PANEL and the showcase seam is NULL',
    !!afterEsc && panelAgain === 'APEX', { panelAgain });

  return { dest };
});

// ===========================================================================
// SESSION B - gate closed (fresh browser): NO path in.
// ===========================================================================
const closed = await withPage({ w: 390, h: 844, dpr: 3, startupScript: STARTUP }, async (p) => {
  await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode !== 'intro')()`, 15000);
  await p.waitFor(`(async () => { const rv = (await import('./src/main.js')).__TEST.state.titleReveal; return !rv || rv.phase === 'settled'; })()`, 8000);
  const noSave = await p.evaluate(`(async () => {
    const M = await import('./src/meta.js');
    return { gate: M.apexUnlocked(M.makeProfile()),
             save: !!(await import('./src/save.js')).detectStorage().getItem('hordes_profile_v1') }; })()`, true);
  check('G1 fresh browser: the live gate reads LOCKED, no save exists',
    noSave.gate === false && noSave.save === false, noSave);
  await tapCard(p, 'SHOP');
  const cards = await cardTexts(p);
  check('G2 the shop DOM has NO APEX row and NO GALLERY card', !cards.some(t => /APEX|GALLERY/.test(t)), { cards: cards.slice(0, 6) });
  // Real key events across the meta screens: none may enter mode 'apex'.
  const keyProbe = await p.evaluate(`(async () => {
    const t = (await import('./src/main.js')).__TEST;
    let entered = false;
    for (const k of ['ArrowLeft', 'ArrowRight', 'Escape', 'a', 'g']) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: k }));
      if (t.state.mode === 'apex') { entered = true; break; }
    }
    return { entered, mode: t.state.mode, seam: t.renderer.trophyShowcase }; })()`, true);
  check('G3 real key events NEVER enter the apex mode and the showcase seam stays NULL',
    keyProbe.entered === false && keyProbe.seam === null, keyProbe);
  const shotClosed = await p.shot('g25-apex-gallery-closed-phone');
  const destClosed = join(ART, 'g25-apex-gallery-closed-phone.png');
  copyFileSync(shotClosed, destClosed);
  return destClosed;
});

const bad = results.filter(r => !r.ok);
console.log('PNG: ' + out.dest);
console.log('PNG: ' + closed);
console.log(bad.length ? `VERIFY G25 APEX GALLERY: ${bad.length} FAILURES` : 'VERIFY G25 APEX GALLERY: ALL ' + results.length + ' CHECKS PASSED');
process.exit(bad.length ? 1 : 0);
