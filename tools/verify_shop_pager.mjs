// HORDES - tools/verify_shop_pager.mjs (SHOP PAGING build task, 2026-09-18).
// Drives the LIVE game at the acceptance sizes and pins the owner's rules:
//   * the GRID: >= 3 columns at EVERY size incl. 320-wide; cards resize
//     dynamically to (width - gaps)/cols; the card box NEVER exceeds today's
//     198px; nothing clips (no horizontal overflow, cards inside the viewport);
//   * the PAGER: page math matches the laid-out rows; edge arrows turn pages;
//     a horizontal swipe turns pages (touch); keyboard arrows turn pages
//     (desktop); a single page shows NO chrome; a BUY keeps you on your page;
//   * the BUY UI stays textual/stateful at every size (LV/MAXED/OWNED words).
// Shots land in docs/art/shop-paging-2026-09-18/shots/. Run:
//   node tools/verify_shop_pager.mjs
import { withPage } from './browser.mjs';
import { copyFileSync, mkdirSync } from 'node:fs';

const ART = '/home/claude/projects/hordes/docs/art/shop-paging-2026-09-18/shots';
mkdirSync(ART, { recursive: true });
let fails = 0;
function ok(cond, msg) {
  if (cond) { console.log('  ok  ' + msg); return true; }
  fails++; console.log('  FAIL ' + msg); return false;
}

async function openShop(p) {
  await p.waitFor("!!document.getElementById('game')", 15000);
  await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  await p.waitFor("(async()=> (await import('./src/main.js')).__TEST.state.mode !== 'intro')()", 15000);
  await p.waitFor("(async()=>{ const rv=(await import('./src/main.js')).__TEST.state.titleReveal; return !rv || rv.phase==='settled'; })()", 8000);
  await p.sleep(300);
  const opened = await p.evaluate("(() => { const el=[...document.getElementById('ov-cards').children].find(k=>(k.textContent||'').toUpperCase().includes('SHOP')); if (!el) return false; el.click(); return true; })()");
  if (!opened) throw new Error('no SHOP card on the title');
  await p.waitFor("/^SHOP$/.test(document.getElementById('ov-title').textContent)", 8000);
  await p.waitFor("(async()=> (await import('./src/main.js')).__TEST.shop.active())", 8000);
  await p.sleep(350);   // lazy frames + the pager's own rAF settle
}

const GRIDQ = `(() => {
  const ov = document.getElementById('overlay');
  const els = [...ov.querySelectorAll('#ov-cards > .card')];
  const vis = els.filter(k => k.style.display !== 'none');
  const rects = vis.map(k => k.getBoundingClientRect());
  const tops = [...new Set(rects.map(r => Math.round(r.top)))].sort((a,b)=>a-b);
  const row1 = rects.filter(r => Math.abs(r.top - rects[0].top) < 2);
  const widthSets = new Set(rects.map(r => Math.round(r.width)));
  const overflowX = els.some(k => { const r = k.getBoundingClientRect();
    return r.left < -1 || r.right > innerWidth + 1; });
  const fs = vis[0].querySelector('.desc') ? getComputedStyle(vis[0].querySelector('.desc')).fontSize : null;
  const arrL = document.getElementById('shop-prev'), arrR = document.getElementById('shop-next');
  const ind = document.getElementById('shop-ind');
  // the 320px-shot findings (2026-09-18): edge arrows must sit on NO card box
  // (a mid-height arrow hid the edge column's price text), and the abbreviated
  // buy line must hold ONE line (its span never overflows its own box).
  const arrRects = [...ov.querySelectorAll('.shop-arr')].map(k => k.getBoundingClientRect());
  const arrHit = arrRects.some(a => rects.some(r =>
    !(a.left >= r.right - 1 || a.right <= r.left + 1 || a.top >= r.bottom - 1 || a.bottom <= r.top + 1)));
  const buys = [...ov.querySelectorAll('.desc > .buy')];
  const buyOverflow = buys.filter(b => b.scrollWidth > b.clientWidth + 1).length;
  return { n: els.length, visible: vis.length, cols: row1.length, rows: tops.length,
    cardW: Math.round(rects[0].width), cardH: Math.round(rects[0].height),
    widthSets: [...widthSets], overflowX, descFont: fs,
    arrHit, arrLow: arrR ? (arrR.className || '').includes('low') : null,
    buyN: buys.length, buyOverflow, buyFs: buys.length ? getComputedStyle(buys[0]).fontSize : null,
    scrollW: document.getElementById('ov-cards').scrollWidth,
    clientW: document.getElementById('ov-cards').clientWidth,
    arrL: !!arrL, arrR: !!arrR, arrRect: arrR ? (r => ({w: Math.round(r.width), h: Math.round(r.height), edge: Math.round(innerWidth - r.right)}))(arrR.getBoundingClientRect()) : null,
    ind: ind ? ind.textContent : null };
})()`;

async function arm(w, h, dpr, mobile, tag, landscapeShot) {
  return withPage({ w, h, dpr, mobile,
    startupScript: "try { localStorage.setItem('hordes_onboarded', '1'); } catch (e) {}" },
    async (p) => {
      console.log('[' + tag + ']');
      await openShop(p);
      const T = `(await import('./src/main.js')).__TEST`;
      const g = await p.evaluate(GRIDQ);
      const caps = await p.evaluate(`(async()=> (await ${T}).shop.caps)()`);
      const pages = await p.evaluate(`(async()=> (await ${T}).shop.pages())()`);
      const page = await p.evaluate(`(async()=> (await ${T}).shop.page())()`);

      // ---- the grid rules ----------------------------------------------------
      ok(g.cols >= caps.minCols, 'columns ' + g.cols + ' >= ' + caps.minCols + ' (owner floor)');
      ok(g.cardW <= caps.cardCap, 'card ' + g.cardW + 'px <= cap ' + caps.cardCap + 'px (never bigger than today)');
      ok(g.widthSets.length === 1, 'every card the same width (' + g.widthSets.join(',') + ')');
      // the frame canvas carries an authored +5px shadow spill (menu_frame.js
      // MENU_FRAME_SHADOW.dx) outside the card box — the CARD boxes themselves
      // must sit inside the viewport; the container may report that spill
      ok(!g.overflowX, 'every card box inside the viewport (no clipping)');
      ok(!g.arrHit, 'arrows sit on NO card box (edge prices readable; low=' + g.arrLow + ')');
      ok(g.buyOverflow === 0, 'abbreviated buy lines hold one line (' + g.buyN + ' spans at ' + (g.buyFs || 'n/a') + ', overflow ' + g.buyOverflow + ')');
      ok(g.scrollW <= g.clientW + 6, 'container overflow <= the authored 5px shadow spill (scroll ' + g.scrollW + ' vs client ' + g.clientW + ')');
      const plan = await p.evaluate(`(async()=> { const T=(await ${T}); const ov=document.getElementById('ov-cards');
        return T.shop.plan(ov.clientWidth); })()`);
      ok(plan.cols === g.cols, 'shopGridPlan(' + g.clientW + ') says ' + plan.cols + ' cols, layout agrees');
      ok(Math.abs(plan.cardW - g.cardW) <= 1, 'plan cardW ' + plan.cardW + ' ~= laid-out ' + g.cardW);

      // ---- the page math -----------------------------------------------------
      ok(pages >= 1, 'pager active: ' + pages + ' page(s), on page ' + page);
      ok(g.visible <= pages * g.cols * 8, 'visible ' + g.visible + ' sane for ' + pages + ' pages x ' + g.cols + ' cols');
      const onePage = pages <= 1;
      ok(onePage ? (!g.arrL && !g.arrR && !g.ind) : (g.arrL && g.arrR && !!g.ind),
        onePage ? 'single page: NO chrome (arrows/indicator absent)' : 'multi-page: arrows + indicator present');
      if (g.ind) ok(new RegExp('^' + page + ' / ' + pages + ' ').test(g.ind), 'indicator reads "' + g.ind + '"');
      if (g.arrRect) ok(g.arrRect.w >= 44 && g.arrRect.h >= 44 && g.arrRect.edge <= 60,
        'arrow target ' + g.arrRect.w + 'x' + g.arrRect.h + ', edge ' + g.arrRect.edge + 'px from viewport (44px floor, thumb reach)');

      // ---- the inputs --------------------------------------------------------
      if (!onePage) {
        // arrows
        await p.evaluate("document.getElementById('shop-next').click()");
        let p2 = await p.evaluate(`(async()=> (await ${T}).shop.page())()`);
        ok(p2 === page + 1, 'NEXT arrow turned to page ' + p2);
        await p.evaluate("document.getElementById('shop-prev').click()");
        p2 = await p.evaluate(`(async()=> (await ${T}).shop.page())()`);
        ok(p2 === page, 'PREV arrow turned back to ' + p2);
        // keyboard (desktop carries the interaction — works everywhere)
        await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))");
        p2 = await p.evaluate(`(async()=> (await ${T}).shop.page())()`);
        ok(p2 === page + 1, 'ArrowRight paged to ' + p2);
        await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}))");
        p2 = await p.evaluate(`(async()=> (await ${T}).shop.page())()`);
        ok(p2 === page, 'ArrowLeft paged back to ' + p2);
        // swipe (touch class only — desktop has no swipe)
        if (mobile) {
          await p.swipe(Math.round(w / 2), Math.round(h / 2), -120, 0);
          p2 = await p.evaluate(`(async()=> (await ${T}).shop.page())()`);
          ok(p2 === page + 1, 'left swipe paged to ' + p2);
          await p.swipe(Math.round(w / 2), Math.round(h / 2), 120, 0);
          p2 = await p.evaluate(`(async()=> (await ${T}).shop.page())()`);
          ok(p2 === page, 'right swipe paged back to ' + p2);
        }
        // a vertical swipe must NOT page (it is a scroll, not a turn)
        if (mobile) {
          await p.swipe(Math.round(w / 2), Math.round(h / 2), 0, -120);
          p2 = await p.evaluate(`(async()=> (await ${T}).shop.page())()`);
          ok(p2 === page, 'vertical swipe did not page (still ' + p2 + ')');
        }
      }

      // ---- the buy keeps the page (and stays textual) ------------------------
      // the gold bump needs a re-render for the dim states to clear; the
      // re-render itself must ALSO keep the page (it is the same code path a
      // buy takes). Then buy a real UPGRADE row on page 2.
      await p.evaluate(`(async()=>{ const t=(await ${T}); t.getProfile().gold = 999999; t.shop.open(); })()`);
      await p.sleep(350);
      if (!onePage) {
        await p.evaluate("document.getElementById('shop-next').click()");
      }
      const before = await p.evaluate(`(async()=> (await ${T}).shop.page())()`);
      const bought = await p.evaluate(`(() => {
        const cards = [...document.querySelectorAll('#ov-cards > .card')]
          .filter(k => k.style.display !== 'none' && !k.className.includes('dim')
            && /LV \\d+\\//.test((k.querySelector('.desc')||{}).textContent || ''));
        if (!cards.length) return null;
        cards[0].click(); return (cards[0].querySelector('.name')||{}).textContent || cards[0].textContent.slice(0,20);
      })()`);
      await p.sleep(400);
      const after = await p.evaluate(`(async()=> (await ${T}).shop.page())()`);
      const subTxt = await p.evaluate(`(() => {
        const cards = [...document.querySelectorAll('#ov-cards > .card')]
          .filter(k => k.style.display !== 'none');
        return cards.slice(0, 6).map(k => (k.querySelector('.desc')||{}).textContent || '').join(' | ');
      })()`);
      ok(bought && after === before, 'buying "' + bought + '" kept the page (' + before + ' -> ' + after + ')');
      ok(/LV \d+\/\d+/.test(subTxt), 'the buy line stays textual (' + (g.descFont || '?') + '): "' + subTxt.slice(0, 80) + '"');

      // ---- the shot ----------------------------------------------------------
      await p.sleep(150);
      const shot = await p.shot('shop-pager-' + tag);
      copyFileSync(shot, ART + '/live-' + (landscapeShot || tag) + '.png');
      console.log('[' + tag + '] shot live-' + (landscapeShot || tag) + '.png' +
        ' | GRID: ' + g.cols + ' cols x ' + g.rows + ' rows/page-visible, card ' + g.cardW + 'x' + g.cardH +
        ' desc ' + (g.descFont || '?') + ', pages ' + pages + (g.ind ? ', ind "' + g.ind + '"' : ''));
      if (p.errors.length) { console.log('[' + tag + '] PAGE ERRORS: ' + p.errors.join(' | ').slice(0, 300)); fails++; }
      return { tag, g, pages, plan };
    });
}

const results = [];
results.push(await arm(390, 844, 3, true, '390x844'));
results.push(await arm(320, 568, 3, true, '320x568'));
results.push(await arm(1280, 800, 1, false, 'desktop-1280x800'));
results.push(await arm(1920, 1080, 1, false, 'desktop-1920x1080'));

console.log('\n==== SUMMARY ====');
for (const r of results) {
  console.log(r.tag + ': ' + r.g.cols + ' cols of ' + r.g.cardW + 'px (cap 198), ' +
    r.pages + ' page(s), plan ' + JSON.stringify(r.plan));
}
console.log(fails ? fails + ' FAILURES' : 'ALL GREEN');
process.exit(fails ? 1 : 0);
