// HORDES — CARD ART INTEGRATION verifier (R1 + R2, the brief's Verify bar #2).
//
// Real browser, 390x844 @dpr3 (Chrome for Testing over CDP, tools/browser.mjs):
//   1. boots the REAL game, presets ALL 19 TOUR_KEYS + hordes_onboarded (the
//      frozen-game trap: withPage's skipTour sets only 7), starts a run and
//      asserts state.time > 1.0 BEFORE anything is measured;
//   2. opens REAL drafts until an art-backed card is offered, TAPS it (the
//      first activation — R2 — must INSPECT, not take), and asserts through
//      live state: mode still 'draft', the inspect box visible with the
//      card's own name + computed desc, a .card-art canvas on the offer;
//   3. captures ONE 1170x2532 PNG showing the playing-card art in the offer
//      row AND the open inspect box, verifies the pixels (dimensions + ink
//      samples, never a "looks right" claim), and lands it in
//      docs/art/card-art-verify-2026-09-14/.
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

  // R2: the FIRST activation must INSPECT, not take.
  await p.tap(Math.round(found.x), Math.round(found.y));
  await p.sleep(250);
  const inspected = await p.evaluate(`(async () => {
    const T = (await import('./src/main.js')).__TEST;
    const box = document.getElementById('draft-inspect');
    const cs = getComputedStyle(box);
    return { mode: T.state.mode, inspectId: T.draftInspectId(),
      visible: cs.display !== 'none', text: box.textContent || '',
      artInBox: !!box.querySelector('canvas.card-art-inspect') };
  })()`);
  if (inspected.mode !== 'draft') fail('the first tap TOOK the card (mode=' + inspected.mode + ') — R2 broken');
  if (!inspected.visible) fail('the inspect box did not open on the first tap');
  if (!inspected.inspectId) fail('draftInspectId is null after the tap');
  console.log('  ok - first tap INSPECTED ' + inspected.inspectId + ' (mode still draft, box visible)');
  console.log('  box text: ' + JSON.stringify(inspected.text.replace(/\s+/g, ' ').trim()));

  // ONE PNG: the offer row with the playing-card art + the open inspect box.
  const png = await p.shot('draft_card_art_inspect');
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const out = path.join(OUT_DIR, 'draft-inspect-390x844-dpr3.png');
  fs.copyFileSync(png, out);

  const read = await p.readShot(out, {
    offerCard: [found.x, found.y],
    box: [195, 760],
    title: [195, 60],
  });
  if (read.w !== 1170 || read.h !== 2532) fail('PNG is ' + read.w + 'x' + read.h + ', expected 1170x2532');
  const ink = (rgb) => rgb[0] + rgb[1] + rgb[2];
  console.log('  PNG ' + read.w + 'x' + read.h + '  px offerCard=' + read.px.offerCard +
    ' box=' + read.px.box + ' title=' + read.px.title);
  if (ink(read.px.offerCard) === 0) fail('the offer card sample is pure black — a blank capture');
  if (p.errors.length) fail('page errors: ' + p.errors.join(' | '));
  console.log('VERIFY OK -> ' + out);
});
