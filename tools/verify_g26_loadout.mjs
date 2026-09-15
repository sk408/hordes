// HORDES - tools/verify_g26_loadout.mjs (G26 PRE-RUN WEAPON LOADOUT, real
// browser, 390x844 @dpr3). Everything the acceptance bar asks of the browser:
//   1. ALL tour flags set up front (incl. the new hordes_tour_loadout) so no
//      coachmark interferes - and so the door's reachability is proven WITHOUT
//      the coach ever firing.
//   2. ZERO-PENALTY + NO-DETOUR half FIRST: START GAME tapped from a bare
//      title (no stored loadout) goes straight to a run (mode polled the whole
//      way - never 'loadout') and arms EXACTLY today's default kit.
//   3. THE CHOICE half: real taps - LOADOUT door -> tap ORBIT -> tap ZAP ->
//      BACK -> START GAME - then the weapons are read back off LIVE run state
//      (state.weapons, never the menu's own bookkeeping), with
//      state.time > 1.0 asserted BEFORE any measurement.
//   4. ONE PNG at the device's natural 1170x2532, read back by pixel/state
//      sampling only (no vision claim): exact backing-store size, gameplay
//      pixels present at the field, saved to docs/art/g26-loadout-<date>/.
//   5. No console errors in any arm.
// The H1 pad geometry is covered separately: tools/verify_h1_pad_reflow.mjs
// is re-run against this same tree (the loadout screen never shows the pads -
// chromeOn() is playing/finale only - but the bar asks for the re-run).
// Run: node tools/verify_g26_loadout.mjs
import { withPage } from './browser.mjs';
import { copyFileSync, mkdirSync } from 'node:fs';

const ART = 'docs/art/g26-loadout-2026-09-15';
mkdirSync(ART, { recursive: true });

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : ''));
};

// Every tour flag (the full TOUR_KEYS set, the new loadout key included) +
// onboarded, before any game script runs. The key list is spelled out so a
// future TOUR_KEYS entry makes this visibly stale rather than silently short.
const STARTUP = `
try {
  localStorage.setItem('hordes_onboarded', '1');
  const keys = ['stage1','hud','pilot','focus','stance','move','skills','potions','stats',
    'cog','draft','edge','chest','portal','arch','shrine','intermission','death','settings','loadout'];
  for (const k of keys) localStorage.setItem('hordes_tour_' + k, '1');
} catch (e) {}`;

const MAIN = "(async () => (await import('./src/main.js')).__TEST)()";
const cardCenter = (title) => `(() => {
  const el = [...document.getElementById('ov-cards').children]
    .find(k => (k.textContent || '').includes(${JSON.stringify(title)}));
  if (!el) return null;
  el.scrollIntoView({ block: 'center' });
  const r = el.getBoundingClientRect();
  return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
})()`;

const out = await withPage({ w: 390, h: 844, dpr: 3, mobile: true, skipTour: false, startupScript: STARTUP },
  async (p) => {
    // Boot to the title (intro skip -> reveal settle), the standard pair.
    await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode !== 'intro')()`, 15000);
    await p.waitFor(`(async () => { const rv = (await import('./src/main.js')).__TEST.state.titleReveal; return !rv || rv.phase === 'settled'; })()`, 8000);

    // Give the save a real unlock set (simulating prior ownership - the shop
    // path is not what this verifier measures): ORBIT + ZAP beyond starters.
    await p.evaluate(`(async () => {
      const T = (await import('./src/main.js')).__TEST;
      const prof = T.getProfile();
      for (const w of ['ORBIT', 'ZAP']) if (!prof.unlockedWeapons.includes(w)) prof.unlockedWeapons.push(w);
      return prof.unlockedWeapons.join(',');
    })()`);

    // ---- arm 1: ZERO PENALTY / NO DETOUR (no stored loadout) ----------------
    await p.evaluate(`(async () => (await import('./src/main.js')).__TEST.getProfile().loadout === null)()`);
    let c = await p.evaluate(cardCenter('START GAME'));
    if (!c) throw new Error('no START GAME card on the title');
    // Poll the mode the whole way: a detour through the loadout screen would
    // observe mode === 'loadout' between the tap and the run.
    let detoured = false;
    const modePoll = p.waitFor(`(async () => { const m = (await import('./src/main.js')).__TEST.state.mode;
      if (m === 'loadout') return 'DETOUR'; return m === 'playing' ? 'UP' : ''; })()`, 12000, 40);
    await p.tap(c[0], c[1]);
    const m1 = await modePoll;
    detoured = m1 === 'DETOUR';
    await p.waitFor(`(async () => { const s = (await import('./src/main.js')).__TEST.state; return s.mode === 'playing' && s.time > 1.0; })()`, 12000, 200);
    const arm1 = await p.evaluate(`(async () => { const T = (await import('./src/main.js')).__TEST;
      return { time: T.state.time, kit: T.state.weapons.map(w => w.type),
        chStart: T.state.character && T.state.character.startingWeapon }; })()`);
    const T1 = await p.evaluate(MAIN);
    const expectDefault = ['VOLLEY'].concat(
      arm1.chStart && T1.getProfile().unlockedWeapons.includes(arm1.chStart) ? [arm1.chStart] : []);

    // Back to the title through the REAL END RUN path (two taps), no seams.
    await p.evaluate(`(async () => (await import('./src/main.js')).__TEST.openSettings())()`);
    await p.sleep(150);
    let e = await p.evaluate(cardCenter('END RUN'));
    await p.tap(e[0], e[1]);
    await p.sleep(200);
    e = await p.evaluate(cardCenter('CONFIRM END RUN'));
    if (e) { await p.tap(e[0], e[1]); }
    await p.waitFor(`(async () => ['dead','title','intermission'].includes((await import('./src/main.js')).__TEST.state.mode))()`, 8000);
    await p.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 't', bubbles: true }))`);
    await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode === 'title')()`, 8000);
    await p.waitFor(`(async () => { const rv = (await import('./src/main.js')).__TEST.state.titleReveal; return !rv || rv.phase === 'settled'; })()`, 8000);

    // ---- arm 2: THE CHOICE (real taps through the screen) -------------------
    c = await p.evaluate(cardCenter('LOADOUT'));
    if (!c) throw new Error('no LOADOUT door on the title');
    await p.tap(c[0], c[1]);
    await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode === 'loadout')()`, 5000);
    const screenRows = await p.evaluate(`(() => [...document.getElementById('ov-cards').children].length)()`);
    const sel = await p.evaluate(`(async () => (await import('./src/weapons.js')).WEAPON_NAMES)()`);
    for (const type of ['ORBIT', 'ZAP']) {
      await p.sleep(150);
      const wc = await p.evaluate(cardCenter(sel[type]));
      if (!wc) throw new Error('no row for ' + type + ' on the loadout screen');
      await p.tap(wc[0], wc[1]);
    }
    await p.sleep(150);
    const stored = await p.evaluate(`(async () => (await import('./src/main.js')).__TEST.getProfile().loadout)()`);
    const back = await p.evaluate(cardCenter('BACK'));
    await p.tap(back[0], back[1]);
    await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode === 'title')()`, 5000);

    // START GAME with the chosen loadout - time > 1.0 asserted BEFORE measuring.
    c = await p.evaluate(cardCenter('START GAME'));
    const poll2 = p.waitFor(`(async () => { const s = (await import('./src/main.js')).__TEST.state; return s.mode === 'playing' && s.time > 1.0; })()`, 12000, 100);
    await p.tap(c[0], c[1]);
    const live = await poll2;
    const arm2 = await p.evaluate(`(async () => { const T = (await import('./src/main.js')).__TEST;
      return { time: T.state.time, kit: T.state.weapons.map(w => w.type), mode: T.state.mode }; })()`);

    // The PNG + its readback. At t~1s the field is legitimately one dark
    // ground tone at MOST points (measured: single-point samples all read the
    // same ground colour), so the "gameplay pixels present" evidence is a GRID
    // SCAN of the canvas region (ground decor + sprites + HUD bars cannot all
    // quantise to one colour) plus the letterbox band for contrast. The STATE
    // readback rides the live run: state.synergies names the ORBITAL VOLLEY
    // pair the chosen kit switched on.
    const shot = await p.shot('g26-loadout-390x844');
    const px = await p.readShot(shot, { ground: [60, 120], topEdge: [195, 30] });
    const b64 = (await import('node:fs')).readFileSync(shot).toString('base64');
    const scan = await p.evaluate(`(async () => {
      const img = await createImageBitmap(await (await fetch('data:image/png;base64,' + ${JSON.stringify(b64)} + '')).blob());
      const c = new OffscreenCanvas(img.width, img.height);
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const cv = document.getElementById('game').getBoundingClientRect();
      const sx = img.width / innerWidth, sy = img.height / innerHeight;
      const colours = new Set();
      for (let gx = 0; gx < 13; gx++) for (let gy = 0; gy < 9; gy++) {
        const x = Math.round((cv.x + 8 + gx * (cv.width - 16) / 12) * sx);
        const y = Math.round((cv.y + 8 + gy * (cv.height - 16) / 8) * sy);
        const d = g.getImageData(x, y, 1, 1).data;
        colours.add((d[0] >> 4) + ',' + (d[1] >> 4) + ',' + (d[2] >> 4));
      }
      return { distinct: colours.size, canvas: { x: Math.round(cv.x), y: Math.round(cv.y),
        w: Math.round(cv.width), h: Math.round(cv.height) } };
    })()`);
    const syn = await p.evaluate(`(async () => (await import('./src/main.js')).__TEST.state.synergies.map(s => s.name))()`);
    return { detoured, arm1, expectDefault, screenRows, stored, live, arm2, shot, px, scan, syn, errors: p.errors };
  });

// ---- verdict -----------------------------------------------------------------
check('arm 1 (no stored loadout): START GAME from the title NEVER detours through the loadout screen (mode polled the whole way)',
  out.detoured === false && !!out.arm1, out.detoured);
check('arm 1: the default kit is EXACTLY today\'s fresh-account kit (' + out.expectDefault.join('+') + ')',
  JSON.stringify(out.arm1.kit) === JSON.stringify(out.expectDefault), out.arm1);
check('arm 2: the LOADOUT door is reachable by REAL taps (mode loadout, ' + out.screenRows + ' rows)',
  out.screenRows >= 4, out.screenRows);
check('arm 2: tapping ORBIT + ZAP stores exactly that choice',
  JSON.stringify(out.stored) === JSON.stringify(['ORBIT', 'ZAP']), out.stored);
check('arm 2: state.time > 1.0 asserted BEFORE measuring (t=' + (out.arm2.time && out.arm2.time.toFixed(2)) + 's)',
  out.live === true && out.arm2.time > 1.0, out.arm2.time);
check('CHOICE PROOF: the run carries VOLLEY+ORBIT+ZAP read off LIVE state (not menu bookkeeping)',
  JSON.stringify(out.arm2.kit) === JSON.stringify(['VOLLEY', 'ORBIT', 'ZAP']), out.arm2.kit);
check('PNG backing store is exactly 1170x2532 (390x844 @dpr3)', out.px.w === 1170 && out.px.h === 2532,
  [out.px.w, out.px.h]);
check('PNG pixel readback: gameplay pixels on the field (13x9 grid scan across the canvas: '
    + out.scan.distinct + ' distinct colours - ground decor + sprites + HUD cannot all quantise to one tone)',
  out.scan.distinct >= 3, out.scan);
check('PNG pixel readback: the letterbox band reads the page background, not the ground',
  JSON.stringify(out.px.px.topEdge) !== JSON.stringify(out.px.px.ground), out.px.px);
check('STATE readback: the live run names the Orbital Volley synergy the chosen kit switched on',
  out.syn.some(n => /orbital volley/i.test(n)), out.syn);
check('no console errors in any arm', out.errors.length === 0, out.errors);

copyFileSync(out.shot, ART + '/g26-loadout-390x844.png');
console.log('PNG: ' + ART + '/g26-loadout-390x844.png');

const bad = results.filter(r => !r.ok).length;
if (bad) {
  console.error('VERIFY G26 LOADOUT: ' + bad + ' FAILED check(s)');
  process.exit(1);
}
console.log('VERIFY G26 LOADOUT: ALL ' + results.length + ' CHECKS PASSED ' +
  '(real taps through the door at 390x844 @dpr3; zero-penalty default and no-detour proven; ' +
  'the chosen kit read off live state; 1170x2532 PNG sampled by pixel)');
