// HORDES - tools/verify_shop_paging_mock.mjs (SHOP PAGING task 7R4PW,
// 2026-09-18). Verifies the docs/ MOCKUP (docs/art/shop-paging-2026-09-18/
// mockup.html) in a REAL phone-class browser — the live game is never loaded
// beyond the CSS/data/art modules the mock imports from it:
//   1. the mock boots clean (no page errors) at 390x844 and 320x568;
//   2. ARROW PAGER: the REAL next-arrow tap turns the page (indicator and the
//      first row's name both change); a REAL horizontal swipe turns it back;
//      the edge arrows sit INSIDE the viewport (thumb reach);
//   3. BOOK: the spread turns by corner tap and by swipe; each page shows its
//      half-width slice (the measured legible-area cost);
//   4. the rows are the REAL catalogue (47 SHOP_UPGRADES render across pages)
//      and a REAL row tap buys (bank decrements) — the buy contract survives;
//   5. shots at both sizes for both variants land in docs/art.
// Run: node tools/verify_shop_paging_mock.mjs
import { withPage } from './browser.mjs';
import { copyFileSync, mkdirSync } from 'node:fs';
import { SHOP_UPGRADES } from '../src/meta.js';

const ART = '/home/claude/projects/hordes/docs/art/shop-paging-2026-09-18/shots';
mkdirSync(ART, { recursive: true });
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); };
const MOCK = 'docs/art/shop-paging-2026-09-18/mockup.html';

async function arm(w, h, dpr, tag, minPer) {
  return withPage({ w, h, dpr, mobile: true, url: MOCK }, async (p) => {
    await p.waitFor('window.__mockReady === true', 15000);
    await p.sleep(400);   // frames paint on the next rAF

    const state = () => p.evaluate('window.__state()');
    const firstName = () => p.evaluate("document.querySelector('.pg-page:not(.left):not(.right) .card .name, .bk-page .card .name') ? (document.querySelector('.pg-page:not(.left):not(.right) .card .name') || document.querySelector('.bk-page .card .name')).textContent : null");

    // ---- ARROW PAGER ---------------------------------------------------------
    const a0 = await state();
    check(tag + ' arrow: boots at page 1 with computed pages', a0.page === 0 && a0.pages >= 2, a0);
    check(tag + ' arrow: a page holds the real rows (perPage >= ' + minPer + ' — measured, not assumed)', a0.perPage >= minPer, a0);
    const n0 = await firstName();
    const nextArrow = await p.evaluate("(() => { const r = document.getElementById('pg-next').getBoundingClientRect(); return [Math.round(r.x + r.width/2), Math.round(r.y + r.height/2), r.right, r.top, r.bottom]; })()");
    check(tag + ' arrow: the next arrow sits at the screen EDGE inside the viewport (thumb reach)',
      nextArrow[2] <= w && nextArrow[2] >= w - 60 && nextArrow[3] >= 0 && nextArrow[4] <= h, nextArrow);
    await p.tap(nextArrow[0], nextArrow[1]);
    await p.sleep(300);
    const a1 = await state();
    const n1 = await firstName();
    check(tag + ' arrow: a REAL next-arrow tap turns the page (indicator + first row change)',
      a1.page === 1 && n0 !== n1, { a0, a1, n0, n1 });
    // a REAL swipe turns back: carousel convention — finger RIGHT (dx > 0)
    // drags the previous page in (finger left = next). Swipe is the primary
    // phone gesture, so both directions get a real gesture, not a __turn call.
    await p.swipe(Math.round(w * 0.25), Math.round(h * 0.5), Math.round(w * 0.5), 0);
    await p.sleep(300);
    const a2 = await state();
    check(tag + ' arrow: a REAL right-swipe returns to page 1', a2.page === 0, a2);
    let shot = await p.shot('shop-paging-' + tag + '-arrow');
    copyFileSync(shot, ART + '/arrow-' + tag + '.png');

    // row tap = buy (the opt-out buy contract survives paging)
    const bank0 = await p.evaluate("document.getElementById('mock-bank').textContent");
    const rowTap = await p.evaluate("(() => { const el = document.querySelector('.pg-page:not(.left):not(.right) .card:not(.dim)'); if (!el) return null; const r = el.getBoundingClientRect(); return [Math.round(r.x + r.width/2), Math.round(r.y + r.height/2)]; })()");
    if (rowTap) {
      await p.tap(rowTap[0], rowTap[1]);
      await p.sleep(200);
      const bank1 = await p.evaluate("document.getElementById('mock-bank').textContent");
      check(tag + ' arrow: a REAL row tap BUYS (bank decrements)', bank0 !== bank1, { bank0, bank1 });
    } else {
      check(tag + ' arrow: a REAL row tap BUYS (bank decrements)', false, 'no affordable row on page 1?');
    }

    // ---- BOOK ------------------------------------------------------------------
    await p.evaluate("document.getElementById('sw-book').click()");
    await p.sleep(400);
    const b0 = await state();
    check(tag + ' book: the spread boots (perSide >= 2, pages >= 2)', b0.page === 0 && b0.pages >= 2 && b0.perSide >= 2, b0);
    const spine = await p.evaluate("(() => { const r = document.getElementById('spine').getBoundingClientRect(); return Math.round(r.x); })()");
    check(tag + ' book: the spine sits at the horizontal CENTRE (the spread halves the width)',
      Math.abs(spine - w / 2) <= 6, { spine, w });
    const corner = await p.evaluate("(() => { const el = [...document.querySelectorAll('.bk-corner')].find(c => c.textContent === '›'); const r = el.getBoundingClientRect(); return [Math.round(r.x + r.width/2), Math.round(r.y + r.height/2)]; })()");
    await p.tap(corner[0], corner[1]);
    await p.sleep(300);
    const b1 = await state();
    check(tag + ' book: a REAL page-corner tap turns the spread', b1.page === 1, b1);
    await p.swipe(Math.round(w * 0.25), Math.round(h * 0.5), Math.round(w * 0.5), 0);
    await p.sleep(300);
    const b2 = await state();
    check(tag + ' book: a REAL right-swipe turns back', b2.page === 0, b2);
    shot = await p.shot('shop-paging-' + tag + '-book');
    copyFileSync(shot, ART + '/book-' + tag + '.png');

    // the catalogue is the real one: the import is 47 rows (+2 doors), and the
    // pagination math covers exactly that count — last page partially filled.
    const st = await state();
    const total = st.pages * st.perPage;
    check(tag + ' catalogue: REAL SHOP_UPGRADES (' + SHOP_UPGRADES.length + ' rows + 2 doors) and the pages cover exactly them',
      SHOP_UPGRADES.length === 47 && total >= 49 && total - st.perPage < 49,
      { imported: SHOP_UPGRADES.length, pages: st.pages, perPage: st.perPage, covered: total });

    check(tag + ': no page errors', p.errors.length === 0, p.errors);
    return { a0, b0 };
  });
}

let meta = {};
// perPage floor per size is MEASURED (the 320-wide page honestly fits only 2
// of the ~185px rows — that small-screen cost is decision data, not a defect).
for (const [w, h, dpr, tag, minPer] of [[390, 844, 3, '390x844', 4], [320, 568, 3, '320x568', 2]]) {
  meta[tag] = await arm(w, h, dpr, tag, minPer);
}

// ---- summary -----------------------------------------------------------------
const fails = results.filter((r) => !r.ok);
for (const r of results) console.log((r.ok ? 'ok  ' : 'FAIL') + ' - ' + r.name + (r.ok ? '' : ' :: ' + JSON.stringify(r.detail)));
console.log('\nDECISION DATA (measured): arrow pager ' + JSON.stringify(meta['390x844'].a0) +
  ' @390x844, ' + JSON.stringify(meta['320x568'].a0) + ' @320x568; book ' +
  JSON.stringify(meta['390x844'].b0) + ' @390x844, ' + JSON.stringify(meta['320x568'].b0) + ' @320x568');
console.log('shop-paging mock verifier: ' + (results.length - fails.length) + '/' + results.length +
  ' checks passed' + (fails.length ? ' — RED' : ''));
console.log('shots: ' + ART);
process.exit(fails.length ? 1 : 0);
