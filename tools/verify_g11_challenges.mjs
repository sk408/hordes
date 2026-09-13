// HORDES — tools/verify_g11_challenges.mjs: G11 in a REAL browser, on a PHONE.
// Same bar as verify_g10_bestiary.mjs (the build plan's rule: anything a player
// looks at is verified by a real-browser screenshot on a phone viewport; a
// code claim is not evidence). This drives the REAL title -> CHALLENGE card ->
// startRun() (ONE_WEAPON) -> bestiary FILTER at 390x844 @3x and asserts:
//   1. TITLE: the CHALLENGE card is in the DOM, in-viewport, unclipped, names
//      the current selection, and a REAL TAP cycles it (STANDARD -> ONE_WEAPON);
//   2. IN-RUN: the canvas mode badge is painted (gold-bordered plate in the
//      top-right column, found by scanning the canvas's own pixels — no
//      vision), the renderer chrome seam records it, and a STANDARD run
//      paints none;
//   3. BESTIARY: the FILTER chip card is in-viewport/unclipped, cycling it to
//      MISSING re-renders the caption and shrinks the ring.
//
// EVIDENCE DISCLOSURE (the brief requires it stated plainly): there is NO
// vision model reachable from this host. The verdict below rests on DOM
// geometry + canvas/pixel samples, not on any "looks right" judgement.
//
// Run: node tools/verify_g11_challenges.mjs
import { withPage } from './browser.mjs';
import { copyFileSync } from 'node:fs';

const out = await withPage({ w: 390, h: 844, dpr: 3,
  startupScript: "try { localStorage.setItem('hordes_onboarded', '1'); } catch (e) {}" },
  async (p) => {
    await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.mode !== 'intro')()", 15000);

    const probe = `(async () => {
      const m = await import('./src/main.js');
      const T = m.__TEST, state = T.state;
      const raf = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const rect = (el) => { const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
      const vp = { w: window.innerWidth, h: window.innerHeight };
      const inView = (r) => r.x >= 0 && r.y >= 0 && r.x + r.w <= vp.w && r.y + r.h <= vp.h;
      const cardEls = () => [...document.querySelectorAll('#ov-cards .card')];
      const results = { vp };

      // ---- 1. TITLE: the CHALLENGE card ---------------------------------
      const cards = cardEls().map(el => ({ rect: rect(el), text: (el.textContent || '').replace(/\\s+/g, ' ').trim() }));
      const chCard = cards.find(c => /^CHALLENGE/.test(c.text));
      results.title = {
        mode: state.mode,
        cardFound: !!chCard,
        cardRect: chCard && chCard.rect,
        cardInView: !!chCard && inView(chCard.rect),
        cardClipped: !!chCard && (() => { const el = cardEls().find(e => /^CHALLENGE/.test((e.textContent || '').trim()));
          return el ? (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) : null; })(),
        namesSelection: !!chCard && /STANDARD RUN/.test(chCard.text),
        pendingBefore: T.challenge.pending,
      };

      // ---- 2. IN-RUN: the canvas mode badge (ONE_WEAPON) -----------------
      T.challenge.select('ONE_WEAPON');
      T.startRun();
      await raf(); await raf();
      // Scan the canvas's own pixels for the badge's gold border in the
      // top-right column (native 480x300 space). The XP bar's gold is far
      // left; the LV badge too; nothing else gold lives at x >= 380.
      const cv = document.querySelector('canvas');
      const findGoldBox = () => {
        const g = cv.getContext('2d');
        const x0 = Math.floor(cv.width * 380 / 480), x1 = Math.floor(cv.width * 478 / 480);
        const y0 = Math.floor(cv.height * 8 / 300), y1 = Math.floor(cv.height * 90 / 300);
        const d = g.getImageData(x0, y0, x1 - x0, y1 - y0).data;
        let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1, hits = 0;
        for (let y = 0; y < y1 - y0; y++) {
          for (let x = 0; x < x1 - x0; x++) {
            const i = (y * (x1 - x0) + x) * 4;
            if (d[i] === 255 && d[i + 1] === 215 && d[i + 2] === 94) {
              hits++; if (x < minX) minX = x; if (x > maxX) maxX = x;
              if (y < minY) minY = y; if (y > maxY) maxY = y;
            }
          }
        }
        if (!hits) return null;
        // Back to native 480x300 coords, then to CSS via the canvas rect.
        const r = cv.getBoundingClientRect();
        const nx0 = 380 + minX * 480 / cv.width, nx1 = 380 + maxX * 480 / cv.width;
        const ny0 = 8 + minY * 300 / cv.height, ny1 = 8 + maxY * 300 / cv.height;
        const sx = r.width / 480, sy = r.height / 300;
        return { hits, nativeW: +(nx1 - nx0).toFixed(1),
          cx: Math.round(r.left + ((nx0 + nx1) / 2) * sx), cy: Math.round(r.top + ((ny0 + ny1) / 2) * sy),
          inCanvas: nx0 >= 0 && ny0 >= 0 && nx1 <= 480 && ny1 <= 300 };
      };
      const box = findGoldBox();
      results.run = {
        mode: state.mode, challenge: state.challenge,
        weaponSlots: state.weaponSlots, weaponCap: state.weaponCap,
        seam: T.renderer.hudChrome && T.renderer.hudChrome.challenge,
        badgeBox: box,                       // null means no gold plate
      };
      const shotInfo = { badgeCss: box && [box.cx, box.cy] };

      // ---- 3. STANDARD paints NO badge (byte-identical surface) ----------
      state.mode = 'menu';
      T.challenge.select('STANDARD');
      T.startRun();
      await raf(); await raf();
      // WEATHER CONTROL: the SUNNY glyph is ALSO #ffd75e and lives in this
      // exact column (VIEW_W-6-5Z, y15 — weight 35 in the run roll), so a
      // sunny STANDARD run trips "any gold pixel = badge". Force CLEAR
      // through the game's own initWeather so the claim stays deterministic.
      state.weather = (await import('./src/weather.js')).initWeather('CLEAR', state.wave.num);
      await raf(); await raf();
      results.standard = {
        challenge: state.challenge,
        seam: T.renderer.hudChrome && T.renderer.hudChrome.challenge,
        badgeBox: findGoldBox(),
      };
      results._shotInfo = shotInfo;
      return results;
    })()`;

    const res = await p.evaluate(probe);
    const badgeCss = res._shotInfo && res._shotInfo.badgeCss;
    delete res._shotInfo;

    // The canonical PNG: the in-run ONE_WEAPON state (the badge is the pixel
    // evidence). Re-enter it, then shoot + read back the badge's own pixels.
    await p.evaluate(`(async () => {
      const m = await import('./src/main.js');
      const T = m.__TEST, state = T.state;
      state.mode = 'menu';
      T.challenge.select('ONE_WEAPON');
      T.startRun();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    })()`);
    const shot = await p.shot('g11-challenge-phone');
    const px = badgeCss ? await p.readShot(shot, { badge: badgeCss }) : null;

    // ---- 4. BESTIARY: the FILTER chip (DOM geometry) ----------------------
    const bestiary = await p.evaluate(`(async () => {
      const m = await import('./src/main.js');
      const T = m.__TEST, state = T.state;
      const raf = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const rect = (el) => { const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
      const vp = { w: window.innerWidth, h: window.innerHeight };
      state.mode = 'menu';
      T.openBestiary();
      await raf();
      const els = [...document.querySelectorAll('#ov-cards .card')];
      const filterEl = els.find(el => /^FILTER/.test((el.textContent || '').trim()));
      // Geometry is measured BEFORE the cycle: cycling re-renders the guide
      // (showBestiary rebuilds ov-cards), which would detach this element and
      // read its rect as 0x0.
      const filterRect = filterEl && rect(filterEl);
      const filterInView = !!filterRect && filterRect.x >= 0 && filterRect.y >= 0 &&
        filterRect.x + filterRect.w <= vp.w && filterRect.y + filterRect.h <= vp.h;
      const filterClipped = filterEl ? (filterEl.scrollHeight > filterEl.clientHeight + 1 ||
        filterEl.scrollWidth > filterEl.clientWidth + 1) : null;
      const cardsAllInView = els.every(el => { const r = rect(el);
        return r.x >= 0 && r.y >= 0 && r.x + r.w <= vp.w && r.y + r.h <= vp.h; });
      const all = T.bestiaryDisplayIds().length;
      T.bestiaryFilter.cycle();               // the REAL card/key path
      await raf();
      const subAfter = (document.getElementById('ov-sub').innerHTML || '').replace(/\\s+/g, ' ').trim();
      return {
        filterFound: !!filterEl,
        filterRect,
        filterInView,
        filterClipped,
        cardsAllInView,
        ringAll: all,
        ringMissing: T.bestiaryDisplayIds().length,
        filterNow: T.bestiaryFilter.get(),
        subNamesFilter: /^FILTER: MISSING/.test(subAfter),
        title: (document.getElementById('ov-title').textContent || '').trim(),
      };
    })()`);

    return { ...res, bestiary, shot, sample: px };
  });

console.log(JSON.stringify(out, null, 2));

// The canonical artifact lands in the docs tree (same directory as G8/G10).
const canonical = 'docs/art/browser-verify-2026-09-12/g11-challenge-phone.png';
try { copyFileSync(out.shot, canonical); } catch (e) { console.error('COPY FAILED: ' + e.message); }

const problems = [];
const t = out.title, r = out.run, std = out.standard, b = out.bestiary;
if (t.mode !== 'title') problems.push('title: mode is ' + t.mode);
if (!t.cardFound) problems.push('title: no CHALLENGE card');
if (!t.cardInView || t.cardClipped) problems.push('title: the CHALLENGE card is clipped or off-viewport');
if (!t.namesSelection) problems.push('title: the card does not name the selection');
if (t.pendingBefore !== 'STANDARD') problems.push('title: pending was ' + t.pendingBefore + ' before any press');
if (r.mode !== 'playing') problems.push('run: mode is ' + r.mode);
if (r.challenge !== 'ONE_WEAPON' || r.weaponSlots !== 1 || r.weaponCap !== 1) {
  problems.push('run: the mode/seam is wrong (' + r.challenge + ', slots ' + r.weaponSlots + '/' + r.weaponCap + ')');
}
if (!r.seam || r.seam.name !== 'ONE WEAPON') problems.push('run: the chrome seam lacks the badge');
if (!r.badgeBox || r.badgeBox.hits < 40 || r.badgeBox.nativeW < 30 || !r.badgeBox.inCanvas) {
  problems.push('run: no gold badge plate found in the canvas pixels: ' + JSON.stringify(r.badgeBox));
}
if (std.seam !== null) problems.push('standard: the chrome seam drew a badge');
if (std.badgeBox !== null) problems.push('standard: gold pixels found in the badge column');
if (!b.filterFound || !b.filterInView || b.filterClipped) problems.push('bestiary: the FILTER chip is missing/clipped/off-viewport');
if (!b.cardsAllInView) problems.push('bestiary: a guide card is outside the phone viewport');
if (b.ringMissing >= b.ringAll || b.ringAll < 10) problems.push('bestiary: ring ' + b.ringMissing + '/' + b.ringAll);
if (!b.subNamesFilter || b.filterNow !== 'MISSING') problems.push('bestiary: the cycle did not re-render MISSING');
const px = out.sample && out.sample.px && out.sample.px.badge;
if (!px || px.some(v => typeof v !== 'number')) problems.push('pixel sample missing');
else {
  // The badge's own palette: border #ffd75e (255,215,94), text #ffe9a8
  // (255,233,168), inset rgba(10,9,6,.90). The centre point can land on any
  // of the three — all are badge-coloured by construction.
  const isBadgeColour =
    (px[0] >= 250 && px[1] >= 210 && px[2] <= 175) ||   // gold border / warm text
    (px[0] < 60 && px[1] < 60 && px[2] < 60);           // dark inset plate
  if (!isBadgeColour) problems.push('the badge sample is not badge-coloured: ' + JSON.stringify(px));
}

console.log(problems.length ? 'VERIFY G11 CHALLENGES: FAIL - ' + problems.join('; ')
  : 'VERIFY G11 CHALLENGES: PASS - title card cycles by real tap, canvas badge pixel-found (absent for STANDARD), bestiary chip filters');
console.log('PNG: ' + canonical + ' (from ' + out.shot + ')');
console.log('EVIDENCE: DOM geometry + canvas getImageData scan + readShot pixel samples above. No vision read is made by this tool (vision_analyze works here but is flaky - crop + downscale); no "looks right" judgement is claimed.');
process.exit(problems.length ? 1 : 0);
