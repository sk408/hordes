// HORDES — tools/verify_g12_title.mjs: G12 TITLE SCREEN in a REAL browser, on a
// PHONE (same bar as verify_g10/verify_g11: anything a player looks at is
// verified by a real-browser screenshot at 390x844 @3x; a code claim is not
// evidence). Drives the REAL boot -> intro skip -> title and asserts:
//   1. THE ART: what is painted behind the menu is the composed TITLE CARD,
//      not the game map — canvas getImageData samples at the sky bands
//      (#1b1130 / #3a1f45 from src/art/title.js's own palette) + gold
//      WORDMARK pixels in the x154-334 y88-125 region, plus the renderer
//      seam geometry. An in-run sample at the SAME points must differ.
//   2. THE CARDS: START GAME and EXIT GAME are in-viewport and unclipped at
//      the phone size (DOM geometry).
//   3. REAL TAPS: a real touch on START GAME starts a run; a real touch on
//      EXIT GAME runs its three steps and lands on the farewell screen.
//   4. THE FAREWELL renders (saved + close-this-tab copy, BACK card).
//
// EVIDENCE DISCLOSURE (stated plainly): there is NO vision model reachable
// from this host. The verdict rests on DOM geometry + canvas getImageData +
// readShot pixel samples of the captured PNG — no "looks right" judgement.
//
// Run: node tools/verify_g12_title.mjs
import { withPage } from './browser.mjs';
import { copyFileSync } from 'node:fs';

const out = await withPage({ w: 390, h: 844, dpr: 3,
  startupScript: "try { localStorage.setItem('hordes_onboarded', '1'); } catch (e) {}" },
  async (p) => {
    await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.mode !== 'intro')()", 15000);
    // Let a couple of real frames paint the composed title card.
    await p.evaluate("(async () => { const r = () => new Promise(q => requestAnimationFrame(() => requestAnimationFrame(q))); await r(); await r(); })()");

    const probe = `(async () => {
      const m = await import('./src/main.js');
      const T = m.__TEST, state = T.state;
      const raf = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const vp = { w: window.innerWidth, h: window.innerHeight };
      const rect = (el) => { const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
      const inView = (r) => r.x >= 0 && r.y >= 0 && r.x + r.w <= vp.w && r.y + r.h <= vp.h;
      const cardEls = () => [...document.querySelectorAll('#ov-cards .card')];
      const results = { vp };

      // ---- 1. THE ART: canvas pixels + the renderer seam ----------------
      const cv = document.querySelector('canvas');
      const cvr = cv.getBoundingClientRect();
      // Sample the canvas's OWN pixels at NATIVE 480x300 coordinates. The
      // backing store is CSS x dpr, so map view -> backing the same way the
      // renderer does. Bands come from src/art/title.js's SKY palette.
      const pxAt = (nx, ny) => {
        const g = cv.getContext('2d');
        const x = Math.floor(nx * cv.width / 480), y = Math.floor(ny * cv.height / 300);
        const d = g.getImageData(x, y, 1, 1).data;
        return [d[0], d[1], d[2]];
      };
      results.art = {
        mode: state.mode,
        seam: T.renderer.titleScreen,
        canvasRect: { x: Math.round(cvr.x), y: Math.round(cvr.y),
          w: Math.round(cvr.width), h: Math.round(cvr.height) },
        // Native y 0-11 is the FRAME's own dark/gold border; band 2's
        // interior (#1b1130) shows from y~12 down to y35 (SKY rows 0-8 x4).
        skyTop: pxAt(240, 20),         // SKY band 2: #1b1130 (27,17,48)
        skyMid: pxAt(240, 42),         // SKY band 3: #3a1f45 (58,31,69)
        goldInWordmark: (() => {       // WORDMARK golds #ffd54a/#fff2c8
          const g = cv.getContext('2d');
          const x0 = Math.floor(154 * cv.width / 480), x1 = Math.floor(334 * cv.width / 480);
          const y0 = Math.floor(88 * cv.height / 300), y1 = Math.floor(125 * cv.height / 300);
          const d = g.getImageData(x0, y0, x1 - x0, y1 - y0).data;
          let hits = 0;
          for (let i = 0; i < d.length; i += 4) {
            if (d[i] > 200 && d[i + 1] > 150 && d[i + 2] < 140) hits++;   // warm gold
          }
          return hits;
        })(),
        domSheet: getComputedStyle(document.getElementById('overlay')).backgroundColor,
      };

      // ---- 2. THE CARDS: START GAME + EXIT GAME in-viewport, unclipped ----
      const cards = cardEls().map(el => ({ rect: rect(el), text: (el.textContent || '').replace(/\\s+/g, ' ').trim() }));
      const pick = (re) => cards.find(c => re.test(c.text));
      const clipOf = (re) => { const el = cardEls().find(e => re.test((e.textContent || '').trim()));
        return el ? (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) : null; };
      results.cards = {
        names: cards.map(c => c.text.split(' ')[0]),
        startCard: pick(/^START GAME/), exitCard: pick(/^EXIT GAME/),
        loadOffer: pick(/^LOAD FROM DISK/) || null,
        startClipped: clipOf(/^START GAME/), exitClipped: clipOf(/^EXIT GAME/),
        allInView: cards.every(c => inView(c.rect)),
      };
      results._centers = {
        start: pick(/^START GAME/) && [pick(/^START GAME/).rect.x + pick(/^START GAME/).rect.w / 2,
                                       pick(/^START GAME/).rect.y + pick(/^START GAME/).rect.h / 2],
        exit: pick(/^EXIT GAME/) && [pick(/^EXIT GAME/).rect.x + pick(/^EXIT GAME/).rect.w / 2,
                                     pick(/^EXIT GAME/).rect.y + pick(/^EXIT GAME/).rect.h / 2],
      };

      // ---- 3a. REAL TAP on START GAME -> a run ---------------------------
      const startCenter = results._centers.start;
      results.tapStart = { center: startCenter };
      return results;
    })()`;

    const res = await p.evaluate(probe);
    const startCenter = res._centers.start, exitCenter = res._centers.exit;
    delete res._centers;

    // REAL TAP: START GAME starts the run.
    await p.tap(Math.round(startCenter[0]), Math.round(startCenter[1]));
    const runState = await p.evaluate("(async () => { const m = await import('./src/main.js');" +
      " const T = m.__TEST; await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));" +
      " const cv = document.querySelector('canvas'); const g = cv.getContext('2d');" +
      " const px = (nx, ny) => { const d = g.getImageData(Math.floor(nx * cv.width / 480)," +
      " Math.floor(ny * cv.height / 300), 1, 1).data; return [d[0], d[1], d[2]]; };" +
      " return { mode: T.state.mode, seam: T.renderer.titleScreen, skyTop: px(240, 1), skyMid: px(240, 42) }; })()");

    // Back to the title for the EXIT tap (the in-run settings path is not
    // this feature's subject).
    await p.evaluate("(async () => { const m = await import('./src/main.js'); const T = m.__TEST;" +
      " T.state.mode = 'menu'; T.showTitle(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); })()");

    // ---- 3b. REAL TAP on EXIT GAME -> autosave, close attempt, farewell ----
    const exitCenterNow = await p.evaluate("(() => { const els = [...document.querySelectorAll('#ov-cards .card')];" +
      " const el = els.find(e => /^EXIT GAME/.test((e.textContent || '').trim())); const r = el.getBoundingClientRect();" +
      " return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)]; })()");
    await p.tap(exitCenterNow[0], exitCenterNow[1]);
    const farewell = await p.evaluate("(async () => { const m = await import('./src/main.js'); const T = m.__TEST;" +
      " await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));" +
      " return { mode: T.state.mode, steps: T.exit.steps, hasSave: T.hasLocalSave()," +
      "  title: (document.getElementById('ov-title').textContent || '').trim()," +
      "  sub: (document.getElementById('ov-sub').textContent || '').replace(/\\s+/g, ' ').trim()," +
      "  cards: [...document.querySelectorAll('#ov-cards .card')].map(e => (e.textContent || '').trim()) }; })()");

    // The canonical PNG: the TITLE screen itself (shot before the taps would
    // have been ideal; re-enter the title and shoot the composed card).
    await p.evaluate("(async () => { const m = await import('./src/main.js'); const T = m.__TEST;" +
      " T.state.mode = 'menu'; T.showTitle(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); })()");
    const shot = await p.shot('g12-title-phone');
    const skyCss = res.art.canvasRect;
    const px = await p.readShot(shot, {
      // CSS coords of the native sky samples (canvas rect + view fraction).
      skyTop: [skyCss.x + skyCss.w * 240 / 480, skyCss.y + skyCss.h * 20.5 / 300],
      skyMid: [skyCss.x + skyCss.w * 240 / 480, skyCss.y + skyCss.h * 42.5 / 300],
    });

    return { ...res, runState, farewell, shot, sample: px };
  });

console.log(JSON.stringify(out, null, 2));

// The canonical artifact lands in the docs tree (same directory as G8-G11).
const canonical = 'docs/art/browser-verify-2026-09-12/g12-title-phone.png';
try { copyFileSync(out.shot, canonical); } catch (e) { console.error('COPY FAILED: ' + e.message); }

const problems = [];
const a = out.art, c = out.cards, r = out.runState, f = out.farewell;
const near = (px, want, tol) => px && px.every((v, i) => Math.abs(v - want[i]) <= tol);
// 1. the art
if (a.mode !== 'title') problems.push('art: mode is ' + a.mode);
if (!a.seam || a.seam.x !== 0 || a.seam.y !== 0 || a.seam.w !== 480 || a.seam.h !== 300 || a.seam.scale !== 1) {
  problems.push('art: the title seam geometry is wrong: ' + JSON.stringify(a.seam));
}
if (!near(a.skyTop, [27, 17, 48], 24)) problems.push('art: sky band 1 is not #1b1130: ' + JSON.stringify(a.skyTop));
if (!near(a.skyMid, [58, 31, 69], 24)) problems.push('art: sky band 2 is not #3a1f45: ' + JSON.stringify(a.skyMid));
if (!a.goldInWordmark || a.goldInWordmark < 30) {
  problems.push('art: no gold WORDMARK pixels in the title region (' + a.goldInWordmark + ')');
}
if (a.domSheet !== 'rgba(0, 0, 0, 0)') problems.push('art: the overlay sheet is not transparent: ' + a.domSheet);
// 1b. the in-run contrast: the SAME points must NOT be the title sky.
const titleSky = [a.skyTop, a.skyMid];
const runDiff = r.skyTop && titleSky[0] &&
  (Math.abs(r.skyTop[0] - titleSky[0][0]) + Math.abs(r.skyTop[1] - titleSky[0][1]) + Math.abs(r.skyTop[2] - titleSky[0][2]) > 40 ||
   Math.abs(r.skyMid[0] - titleSky[1][0]) + Math.abs(r.skyMid[1] - titleSky[1][1]) + Math.abs(r.skyMid[2] - titleSky[1][2]) > 40);
if (r.mode !== 'playing') problems.push('tap: START GAME did not start a run (mode=' + r.mode + ')');
if (r.seam !== null) problems.push('tap: the title seam survived into the run');
if (!runDiff) problems.push('art: the in-run pixels at the sky points match the title (map not distinct?)');
// 2. the cards
if (!c.startCard || !c.exitCard) problems.push('cards: START GAME or EXIT GAME missing');
for (const [k, card] of [['START GAME', c.startCard], ['EXIT GAME', c.exitCard]]) {
  if (!card) continue;
  const inVp = card.rect.x >= 0 && card.rect.y >= 0 &&
    card.rect.x + card.rect.w <= out.vp.w && card.rect.y + card.rect.h <= out.vp.h;
  if (!inVp) problems.push('cards: ' + k + ' is off-viewport: ' + JSON.stringify(card.rect));
}
if (c.startClipped || c.exitClipped) problems.push('cards: START/EXIT card is clipped');
if (!c.allInView) problems.push('cards: some title card is outside the phone viewport');
if (c.names[c.names.length - 1] !== 'EXIT') problems.push('cards: EXIT GAME is not the LAST card');
// 3. the exit tap
if (f.mode !== 'farewell') problems.push('exit: mode is ' + f.mode);
if (JSON.stringify(f.steps) !== JSON.stringify(['autosave', 'window.close', 'farewell'])) {
  problems.push('exit: steps are ' + JSON.stringify(f.steps));
}
if (!f.hasSave) problems.push('exit: the autosave step left no save');
// 4. the farewell
if (!/saved/i.test(f.sub)) problems.push('farewell: does not say saved: ' + f.sub);
if (!/close this tab/i.test(f.sub)) problems.push('farewell: does not say the tab can be closed: ' + f.sub);
if (!f.cards.some(t => /^BACK/.test(t))) problems.push('farewell: no BACK card: ' + JSON.stringify(f.cards));
// the PNG readback
const s = out.sample && out.sample.px;
if (!s || !s.skyTop || !s.skyMid) problems.push('pixel sample missing');
else {
  if (!near(s.skyTop, [27, 17, 48], 40)) problems.push('png: sky band 1 sample is ' + JSON.stringify(s.skyTop));
  if (!near(s.skyMid, [58, 31, 69], 40)) problems.push('png: sky band 2 sample is ' + JSON.stringify(s.skyMid));
}

console.log(problems.length ? 'VERIFY G12 TITLE: FAIL - ' + problems.join('; ')
  : 'VERIFY G12 TITLE: PASS - title art pixel-proven behind the menu (map absent in-run), cards in-viewport, real taps drive start + exit, farewell renders');
console.log('PNG: ' + canonical + ' (from ' + out.shot + ')');
console.log('EVIDENCE: DOM geometry + canvas getImageData + readShot pixel samples above. No vision model is ' +
  'reachable from this host; no "looks right" judgement is claimed. window.close() real closure cannot be ' +
  'observed over CDP in a headless tab - the attempt is step-logged, and the farewell (which a real player ' +
  'would never see if the close succeeded) is the honest fallback.');

process.exit(problems.length ? 1 : 0);
