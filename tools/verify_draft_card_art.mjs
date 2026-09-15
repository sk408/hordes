// HORDES — CARD ART INTEGRATION verifier (R1, the brief's Verify bar #2).
//
// Real browser, 390x844 @dpr3 (Chrome for Testing over CDP, tools/browser.mjs):
//   1. boots the REAL game, presets ALL 19 TOUR_KEYS + hordes_onboarded (the
//      frozen-game trap: withPage's skipTour sets only 7), starts a run and
//      asserts state.time > 1.0 BEFORE anything is measured;
//   2. opens REAL drafts until an art-backed card is offered and asserts, on
//      the live DOM, that the OFFER CARD ITSELF carries the art canvas AND the
//      card's own name/desc text — the card is the whole interface;
//   3. captures ONE 1170x2532 PNG of the offer row (art + text ON the card),
//      verifies the pixels (dimensions + ink samples, never a "looks right"
//      claim), and lands it in docs/art/card-art-verify-2026-09-14/;
//   4. then TAPS the card ONCE and proves the single activation TOOK it (mode
//      left 'draft', pendingDrafts consumed) — the R2 inspect->confirm step was
//      RETIRED 2026-09-15 by owner directive ("the text boxes in the card
//      select, we don't need the confirm step... touching will choose that
//      card"), so the retired #draft-inspect element must be ABSENT from the
//      real DOM, not merely hidden.
import fs from 'node:fs';
import path from 'node:path';
import { withPage, ROOT, SHOT_DIR } from './browser.mjs';

const OUT_DIR = path.join(ROOT, 'docs', 'art', 'card-art-verify-2026-09-14');
const TOUR_IDS = ['stage1', 'hud', 'pilot', 'focus', 'stance', 'move', 'skills', 'potions',
  'stats', 'cog', 'draft', 'edge', 'chest', 'portal', 'arch', 'shrine',
  'intermission', 'death', 'settings'];   // all 19 (src/tour.js TOUR_KEYS)

const fail = (msg) => { console.error('FAIL: ' + msg); process.exit(1); };

await withPage({ w: 390, h: 844, dpr: 3,
  startupScript:
    "try { localStorage.setItem('hordes_onboarded','1'); } catch (e) {}\n" +
    TOUR_IDS.map(id => `try { localStorage.setItem('hordes_tour_${id}','1'); } catch (e) {}`).join('\n'),
}, async (p) => {
  await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.mode !== 'intro')()", 15000);
  // The title reveal gates overlay pointer-events until it SETTLES (real
  // players can only tap START GAME after it) — a programmatic startRun
  // before that leaves the overlay click-dead. Wait for the real gate.
  const settled = await p.waitFor("(async () => { const rv = (await import('./src/main.js')).__TEST.state.titleReveal;" +
    " return !rv || rv.phase === 'settled'; })()", 15000);
  if (!settled) fail('the title reveal never settled — the overlay stays click-dead');

  // A REAL run, ticking — the frozen-game assertion comes FIRST.
  await p.evaluate("(async () => { const T = (await import('./src/main.js')).__TEST; T.startRun(); })()");
  const ticking = await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.time > 1.0)()", 10000);
  if (!ticking) fail('state.time never passed 1.0 — the game is frozen (tour gate?), nothing was measured');
  console.log('  ok - state.time > 1.0 (the sim is genuinely ticking)');

  // Open REAL drafts until an art-backed offer shows (the pool is weighted).
  const found = await p.evaluate(`(async () => {
    const T = (await import('./src/main.js')).__TEST;
    const st = T.state;
    for (let i = 0; i < 200; i++) {
      st.mode = 'playing'; st.pendingDrafts = 1;
      T.openDraft();
      const kids = [...document.querySelectorAll('#ov-cards .card')];
      const idx = kids.findIndex(el => el.querySelector('canvas.card-art'));
      if (idx >= 0) {
        const r = kids[idx].getBoundingClientRect();
        return { idx, x: r.left + r.width / 2, y: r.top + r.height / 2,
          id: kids[idx].querySelector('canvas.card-art').getAttribute('data-card') };
      }
    }
    return null;
  })()`);
  if (!found) fail('no art-backed offer appeared in 200 drafts');
  console.log('  ok - an art-backed offer is up: ' + found.id + ' (card ' + (found.idx + 1) + ')');

  // The offer must carry its OWN art AND its own text: the retired inspect box
  // held the name/desc; now the card does, so this is what replaced it.
  const offerState = await p.evaluate(`(async () => {
    const T = (await import('./src/main.js')).__TEST;
    const kids = [...document.querySelectorAll('#ov-cards .card')];
    const el = kids[${found.idx}];
    const cv = el.querySelector('canvas.card-art');
    return {
      mode: T.state.mode, pending: T.state.pendingDrafts,
      hasArt: !!cv, artW: cv ? cv.width : 0, artH: cv ? cv.height : 0,
      hasName: !!(el.querySelector('.name') || {}).textContent,
      hasDesc: !!(el.querySelector('.desc') || {}).textContent,
      name: ((el.querySelector('.name') || {}).textContent || '').replace(/^\\d+\\.\\s*/, ''),
      desc: (el.querySelector('.desc') || {}).textContent || '',
      retiredBoxInDom: document.getElementById('draft-inspect') !== null,
    };
  })()`, true);
  if (!offerState.hasArt) fail('the offer has no .card-art canvas');
  if (offerState.artW !== 96 || offerState.artH !== 136) fail('offer art backing is ' + offerState.artW + 'x' + offerState.artH + ', expected 96x136');
  if (!offerState.hasName || !offerState.hasDesc) fail('the offer card does not carry its own text');
  if (offerState.retiredBoxInDom) fail('the retired #draft-inspect element is still in the DOM — the confirm step was RE-ADDED');
  console.log('  ok - the offer card carries art (96x136) + its own text: ' +
    JSON.stringify(offerState.name) + ' / ' + JSON.stringify(offerState.desc));
  console.log('  ok - the retired #draft-inspect box is ABSENT from the real DOM');

  // ONE PNG: the offer row with the playing-card art + the text ON the card.
  const png = await p.shot('draft_card_art_offer');
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const out = path.join(OUT_DIR, 'draft-offer-390x844-dpr3.png');
  fs.copyFileSync(png, out);

  const read = await p.readShot(out, {
    offerCard: [found.x, found.y],
    title: [195, 60],
  });
  if (read.w !== 1170 || read.h !== 2532) fail('PNG is ' + read.w + 'x' + read.h + ', expected 1170x2532');
  const ink = (rgb) => rgb[0] + rgb[1] + rgb[2];
  console.log('  PNG ' + read.w + 'x' + read.h + '  px offerCard=' + read.px.offerCard +
    ' title=' + read.px.title);
  if (ink(read.px.offerCard) === 0) fail('the offer card sample is pure black — a blank capture');

  // ONE TAP TAKES IT (the 2026-09-15 directive): no second activation.
  await p.tap(Math.round(found.x), Math.round(found.y));
  await p.sleep(250);
  const after = await p.evaluate(`(async () => {
    const T = (await import('./src/main.js')).__TEST;
    return { mode: T.state.mode, pending: T.state.pendingDrafts };
  })()`, true);
  if (after.mode === 'draft' || after.pending !== 0) {
    fail('the single tap did NOT take the card (mode=' + after.mode + ', pending=' + after.pending +
      ') — a confirm step is back');
  }
  console.log('  ok - ONE tap TOOK the card (mode=' + after.mode + ', pendingDrafts=' + after.pending + ')');
  if (p.errors.length) fail('page errors: ' + p.errors.join(' | '));
  console.log('VERIFY OK -> ' + out);
});
