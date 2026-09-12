// HORDES - G9 TROPHY GALLERY, VERIFIED IN A REAL BROWSER AT PHONE SIZE.
// Closes the OPEN item the backlog has carried since the 11:10 tick: the trophy
// screen was asserted headlessly (suite 56/0) but never SEEN. Evidence = the PNG
// captured by real Chrome at 390x844 @ dpr 3, read back pixel by pixel, cross-checked
// against the live canvas.
//
// Harness facts learned the hard way, kept so the next probe does not repeat them:
//   * the page boots into the intro movie (state.mode 'intro'); a keydown skips it.
//   * a FRESH profile lands on the HOW TO PLAY onboarding (4 cards), not the title:
//     'hordes_onboarded' gates it. The title (with the TROPHIES card) needs that set.
//   * the canvas renders at DPR-NATIVE resolution (1170x729 here, NOT 480x300), so every
//     view coordinate must be projected through CONFIG.VIEW_W/VIEW_H.
//   * the rAF loop keeps drawing between a canvas read and Page.captureScreenshot, so
//     the canvas is sampled as a small NEIGHBOURHOOD and the PNG must match a member.
// Run: node tools/verify_g9_gallery.mjs
import { withPage, SHOT_DIR } from './browser.mjs';

let fails = 0;
const check = (name, ok, detail) => {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' :: ' + detail : ''));
  if (!ok) fails++;
};
const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
const near = (png, set, tol = 6) => set.some((c) =>
  Math.abs(c[0] - png[0]) <= tol && Math.abs(c[1] - png[1]) <= tol && Math.abs(c[2] - png[2]) <= tol);

// In-page probe: view-space labels -> CSS page points (for the PNG) + a 5x5 canvas
// neighbourhood per label, plus a brightness scan of the whole in-run HUD strip.
const PROBE = `async function probeState(V, labels) {
  const C = (await import('./src/config.js')).CONFIG;
  const g = document.getElementById('game'); const r = g.getBoundingClientRect();
  const ctx = g.getContext('2d');
  const kx = g.width / C.VIEW_W, ky = g.height / C.VIEW_H;
  const pts = {}, canvas = {};
  for (const label of Object.keys(labels)) {
    const [vx, vy] = labels[label];
    pts[label] = [r.left + vx * r.width / C.VIEW_W, r.top + vy * r.height / C.VIEW_H];
    const px = Math.round(vx * kx), py = Math.round(vy * ky);
    const set = [];
    for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
      try { set.push(Array.from(ctx.getImageData(px + dx, py + dy, 1, 1).data).slice(0, 3)); } catch (e) {}
    }
    canvas[label] = set;
  }
  // the in-run HUD strip is the top-left 120x30 of VIEW space: scan it whole
  const im = ctx.getImageData(0, 0, Math.round(120 * kx), Math.round(30 * ky));
  let max = 0, brightest = [0, 0, 0];
  for (let i = 0; i < im.data.length; i += 4) {
    const s = im.data[i] + im.data[i + 1] + im.data[i + 2];
    if (s > max) { max = s; brightest = [im.data[i], im.data[i + 1], im.data[i + 2]]; }
  }
  return { pts, canvas, hudStrip: { max, brightest }, internal: [g.width, g.height], css: [Math.round(r.width), Math.round(r.height)] };
}`;
// view-space points: the case bbox is 160..320 / 70..230, so these are absolute view coords.
const V_PTS = { caseCenter: [240, 150], caseTL: [162, 72], emblemTL: [192, 102], emblemC: [240, 150],
  emblemBR: [288, 198], outside: [240, 244], hudA: [2, 2], hudB: [30, 8], hudC: [60, 6], hudD: [90, 10],
  hudE: [14, 14], hudF: [45, 16], hudG: [70, 4], hudH: [100, 14], hudI: [8, 20], hudJ: [50, 22] };
const HUD_KEYS = ['hudA', 'hudB', 'hudC', 'hudD', 'hudE', 'hudF', 'hudG', 'hudH', 'hudI', 'hudJ'];

await withPage({ w: 390, h: 844, dpr: 3, startupScript: "try { localStorage.setItem('hordes_onboarded', '1'); } catch (e) {}" },
  async (p) => {
    // ---------- 0. boot: skip the intro movie, reach the title ----------
    await p.waitFor("document.getElementById('game') && document.getElementById('game').width > 0", 10000);
    const bootMode = await p.evaluate("(async () => (await import('./src/main.js')).__TEST.state.mode)()");
    await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    const leftIntro = await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.mode !== 'intro')()", 15000);
    await p.waitFor("document.querySelectorAll('#ov-cards .card').length > 0", 10000);
    const boot = await p.evaluate(`(() => { const c = document.getElementById('game'); const r = c.getBoundingClientRect();
      return { internal: [c.width, c.height], css: [Math.round(r.width), Math.round(r.height)], dpr: devicePixelRatio,
        vp: [innerWidth, innerHeight], tour: !!document.getElementById('tour-root'), mode: 'x' }; })()`);
    check('intro movie (' + bootMode + ') skips to the menus', leftIntro);
    check('phone form factor, no tour overlay in the shot',
      boot.vp[0] === 390 && boot.vp[1] === 844 && !boot.tour, JSON.stringify(boot));

    const titleShot = await p.shot('g9-01-title-phone');
    const cards = await p.evaluate(`[...document.querySelectorAll('#ov-cards .card')].map(c => c.textContent.replace(/\\s+/g, ' ').trim())`);
    const trophyCard = cards.find((c) => /TROPHIES/.test(c)) || '';
    console.log('title card: ' + JSON.stringify(await p.evaluate("document.getElementById('ov-title').textContent")) +
      ' | cards: ' + JSON.stringify(cards));
    check('title offers a TROPHIES card labelled with the live earned count',
      /TROPHIES/.test(trophyCard) && /0 \/ \d+ earned/.test(trophyCard), JSON.stringify(trophyCard));

    // ---------- 1. LOCKED gallery (fresh profile), reached from the title card ---
    // A real finger tap on the real card, AFTER the cinematic gesture guard's 400ms
    // window (main.js UI_GUARD_MS) - the guard swallows the tail of the gesture that
    // skipped the intro, and a synthetic click inside that window is eaten by design.
    await p.sleep(600);
    const cardAt = await p.rectOf('#ov-cards .card:nth-child(4)');
    console.log('tapping the TROPHIES card at ' + JSON.stringify(cardAt && cardAt.slice(0, 2)) + ' (rect ' + JSON.stringify(cardAt && cardAt.slice(2)) + ')');
    await p.tap(cardAt[0], cardAt[1]);
    const opened = await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.mode === 'trophies')()", 4000);
    const locked = await p.evaluate(`(async () => {
      const m = await import('./src/main.js'); const T = m.__TEST;
      ${PROBE}
      T.renderer.render(T.state, T.state.cam); T.renderer.drawTrophyShowcase(T.renderer.ctx, T.state);
      const v = T.renderer.trophyShowcase;
      const ov = getComputedStyle(document.getElementById('overlay'));
      const s = await probeState(v, ${JSON.stringify(V_PTS)});
      return { mode: T.state.mode, chrome: T.chromeOn(), view: v, ovBg: ov.backgroundColor, ovAlign: ov.justifyContent,
        title: document.getElementById('ov-title').textContent,
        sub: document.getElementById('ov-sub').innerText.replace(/\\s+/g, ' ').trim(),
        pad: document.getElementById('touch').className, title4: '', ...s };
    })()`);
    const lockedShot = await p.shot('g9-02-trophies-locked-phone');
    const lockedRead = await p.readShot(lockedShot, locked.pts);
    const dark = (c) => c[0] < 60 && c[1] < 60 && c[2] < 60;
    console.log('locked: ' + locked.mode + ' | chromeOn=' + locked.chrome + ' | overlay=' + locked.ovBg + ' / ' + locked.ovAlign +
      ' | canvas ' + locked.internal.join('x') + ' css ' + locked.css.join('x') + ' | view=' + JSON.stringify(locked.view));
    console.log('locked caption: ' + JSON.stringify(locked.title) + ' ' + JSON.stringify(locked.sub.slice(0, 90)));
    console.log('locked canvas HUD strip: max ' + locked.hudStrip.max + '/765 brightest ' + hex(locked.hudStrip.brightest) +
      ' | png strip: ' + HUD_KEYS.map((k) => hex(lockedRead.px[k])).join(' '));
    check('a real finger tap on the TROPHIES title card opens the gallery',
      opened === true && locked.mode === 'trophies', 'mode=' + locked.mode);
    check('the pad layer is gated off in the gallery', locked.chrome === false, 'pad class "' + locked.pad + '"');
    check('gallery clears the dim sheet so the canvas art shows through', locked.ovBg === 'rgba(0, 0, 0, 0)', locked.ovBg);
    check('locked trophy shows LOCKED and still shows its goal',
      /LOCKED/.test(locked.title) && locked.sub.length > 10, JSON.stringify(locked.sub.slice(0, 70)));
    check('CANVAS: the in-run HUD strip is fully covered by the gallery backdrop (no bleed)',
      locked.hudStrip.max < 270, 'brightest pixel in the 120x30 HUD strip = ' + hex(locked.hudStrip.brightest));
    check('SCREENSHOT: the same HUD strip is dark in the composited PNG',
      HUD_KEYS.every((k) => dark(lockedRead.px[k])), HUD_KEYS.map((k) => hex(lockedRead.px[k])).join(' '));
    check('canvas: the display case is painted (centre differs from outside the case)',
      !near(locked.canvas.caseCenter[0], locked.canvas.outside[0], 2),
      'centre=' + hex(locked.canvas.caseCenter[0]) + ' outside=' + hex(locked.canvas.outside[0]));
    check('SCREENSHOT matches the live canvas inside the case (within 1 canvas px)',
      near(lockedRead.px.caseCenter, locked.canvas.caseCenter), 'png=' + hex(lockedRead.px.caseCenter));
    console.log('shot: ' + lockedShot + ' | ' + lockedRead.w + 'x' + lockedRead.h + ' device px');

    // ---------- 2. EARNED gallery, through the REAL achievement hook ------------
    const earned = await p.evaluate(`(async () => {
      const m = await import('./src/main.js'); const T = m.__TEST;
      const ach = await import('./src/achievements.js');
      ${PROBE}
      const P = T.getProfile();
      const before = ach.isEarned(P, 'FIRST_BLOOD');
      ach.recordRun(P, { kills: 1, wave: 1, time: 1 });     // the real evaluation function
      const after = ach.isEarned(P, 'FIRST_BLOOD');
      T.closeTrophies(); T.openTrophies();
      const idx = ach.ACHIEVEMENT_DISPLAY_IDS.indexOf('FIRST_BLOOD');
      for (let i = 0; i < (idx < 0 ? 0 : idx); i++) T.trophiesStep(1);
      T.renderer.render(T.state, T.state.cam); T.renderer.drawTrophyShowcase(T.renderer.ctx, T.state);
      const v = T.renderer.trophyShowcase;
      const s = await probeState(v, ${JSON.stringify(V_PTS)});
      return { before, after, mode: T.state.mode, chrome: T.chromeOn(), view: v,
        title: document.getElementById('ov-title').textContent,
        sub: document.getElementById('ov-sub').innerText.replace(/\\s+/g, ' ').trim(), ...s };
    })()`);
    const earnedShot = await p.shot('g9-03-trophies-earned-phone');
    const earnedRead = await p.readShot(earnedShot, earned.pts);
    const grid = ['caseTL', 'emblemTL', 'emblemC', 'emblemBR'].map((k) => hex(earnedRead.px[k]));
    console.log('earned: ' + JSON.stringify(earned.view) + ' | caption ' + JSON.stringify(earned.title) + ' ' + JSON.stringify(earned.sub.slice(0, 80)));
    console.log('earned from the PNG: caseTL ' + grid[0] + ' emblem ' + grid.slice(1).join(' ') + ' | canvas HUD strip max ' + earned.hudStrip.max);
    check('the real achievement hook flips FIRST_BLOOD unearned -> earned',
      earned.before === false && earned.after === true);
    check('gallery un-masks the earned trophy (real name, no LOCKED)',
      !/LOCKED/.test(earned.title + earned.sub) && /first blood/i.test(earned.title + earned.sub), JSON.stringify(earned.title));
    check('SCREENSHOT paints the emblem art in the display case (>= 2 distinct colours)',
      new Set(grid.slice(1)).size >= 2, grid.slice(1).join(' '));
    check('SCREENSHOT emblem matches the live canvas at the emblem centre (within 1 canvas px)',
      near(earnedRead.px.emblemC, earned.canvas.emblemC), 'png=' + hex(earnedRead.px.emblemC));
    check('CANVAS: HUD strip stays covered on the earned screen too', earned.hudStrip.max < 270,
      'brightest = ' + hex(earned.hudStrip.brightest));
    check('no uncaught page errors for the whole run', p.errors.length === 0, p.errors.join(' | ').slice(0, 240));
    console.log('shot: ' + earnedShot);
  });

console.log('\nG9 GALLERY VISUAL VERIFICATION: ' + (fails === 0 ? 'ALL PASS' : fails + ' FAIL'));
console.log('screenshots in ' + SHOT_DIR);
process.exit(fails === 0 ? 0 : 1);
