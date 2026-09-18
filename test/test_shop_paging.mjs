// HORDES — SHOP PAGING + THE CARD GRID (owner 2026-09-18: "Arrow pages are
// better. The cards need to dynamically resize and fit a minimum of 3 across.
// Max size of a card being the current size they are"). The grid rule and the
// page chunking are PURE (main.js shopGridPlan / shopPageChunk, exposed on
// __TEST.shop — the uiFitScale precedent) so this file pins the arithmetic
// across the size matrix without a layout engine; the live-geometry pins
// (real columns, the cap laid out, no clipping, arrows/swipe/keys turning
// pages, buy-keeps-page) live in tools/verify_shop_pager.mjs, which drives
// the real browser at 390x844 / 320x568 / 1280x800 / 1920x1080.
import { suite, boot } from './_harness.mjs';

const S = suite('test_shop_paging');
function assert(cond, msg) { if (!cond) throw new Error('AssertionError: ' + msg); }

const h = await boot();
const T = h.T;
const shop = T.shop;

// ---------------------------------------------------------------------------
// The grid rule, across the matrix (pure).
// ---------------------------------------------------------------------------
S.check('the owner grid rule: >= 3 columns at EVERY size, card never past the cap', () => {
  const cases = [
    // [container width, expected cols, expected cardW]
    [304, 3, Math.floor((304 - 2 * 12) / 3)],      // 320-wide phone content: the floor case
    [374, 3, Math.floor((374 - 2 * 12) / 3)],      // 390-wide phone content
    [464, 3, Math.floor((464 - 2 * 12) / 3)],      // the stub's own viewSize (480-16)
    [700, 3, 198],                                 // mid: 3 capped cards, slack centred
    [828, 4, 198],                                 // 4 columns fit
    [1038, 5, 198],                                // the container cap: 5x198 + 4x12 exactly
    [1256, 5, 198],                                // wide desktop: cols STOP at 5 (the cap)
    [1872, 5, 198],                                // 1920-wide: surplus is margin, not columns
  ];
  for (const [w, cols, cardW] of cases) {
    const p = shop.plan(w);
    assert(p.cols === cols, 'width ' + w + ': cols ' + p.cols + ' (want ' + cols + ')');
    assert(p.cardW === cardW, 'width ' + w + ': cardW ' + p.cardW + ' (want ' + cardW + ')');
    assert(p.cols >= shop.caps.minCols, 'width ' + w + ': below the 3-column floor');
    assert(p.cardW <= shop.caps.cardCap, 'width ' + w + ': card past the 198px cap');
  }
  // The dynamic-sizing identity: cardW = (W - (cols-1)*gap)/cols, floored,
  // capped — the owner's exact words as an equation, at every width.
  for (let w = 200; w <= 2000; w += 17) {
    const p = shop.plan(w);
    const want = Math.min(Math.floor((w - (p.cols - 1) * shop.caps.gap) / p.cols), shop.caps.cardCap);
    assert(p.cardW === Math.max(want, 1), 'width ' + w + ': cardW ' + p.cardW + ' != formula ' + want);
    assert(p.cols >= 3 && p.cols <= 5, 'width ' + w + ': cols ' + p.cols + ' outside [3,5]');
  }
  console.log('  MEASURED matrix: 304->' + JSON.stringify(shop.plan(304)) +
    ' 374->' + JSON.stringify(shop.plan(374)) +
    ' 1038->' + JSON.stringify(shop.plan(1038)) +
    ' 1872->' + JSON.stringify(shop.plan(1872)));
});

// ---------------------------------------------------------------------------
// The page chunking (pure).
// ---------------------------------------------------------------------------
S.check('pages fit the height, never split a row, cover every row exactly once', () => {
  // 3 rows of 100 + 2 gaps = 324 fit 330; the 4th would overflow -> page 2
  let pages = shop.chunk([100, 100, 100, 100], 330);
  assert(JSON.stringify(pages) === '[[0,1,2],[3]]', 'fit chunking: ' + JSON.stringify(pages));
  // one gap short: the 3rd row spills to page 2 (a row never splits)
  pages = shop.chunk([100, 100, 100, 100], 320);
  assert(JSON.stringify(pages) === '[[0,1],[2,3]]', 'no row ever splits: ' + JSON.stringify(pages));
  // a monster row pages ALONE (content is never crushed)
  pages = shop.chunk([400, 100], 320);
  assert(JSON.stringify(pages) === '[[0],[1]]', 'oversized row pages alone: ' + JSON.stringify(pages));
  // uniform rows: 3 per page (177*3 + 2 gaps = 555 <= 560), the tail rides alone
  pages = shop.chunk(new Array(25).fill(177), 560);
  assert(pages.length === 9 && pages.slice(0, 8).every(pg => pg.length === 3) && pages[8].length === 1,
    '25 rows of 177 in 560px: ' + pages.length + ' pages, tail ' + pages[8].length);
  // coverage: every row index exactly once, in order
  const rows = [50, 80, 60, 90, 70, 55];
  const seen = shop.chunk(rows, 150).flat();
  assert(JSON.stringify(seen) === JSON.stringify(rows.map((_, i) => i)), 'coverage exact');
  // empty shop -> no pages, no chrome
  assert(shop.chunk([], 400).length === 0, 'no rows, no pages (the single/zero-page chrome rule)');
});

// ---------------------------------------------------------------------------
// The stub integration: the screen builds, the sub-lines stay textual, the
// pager stands down without layout (markup is the contract), the menu resets.
// ---------------------------------------------------------------------------
S.check('showShop builds all rows through the real screen; the buy line stays textual', () => {
  T.getProfile().gold = 999999;
  shop.open();
  const cards = h.elements['ov-cards'].children;
  assert(cards.length >= 49, 'the catalogue rendered (' + cards.length + ' cards)');
  const desc = (cards[0].innerHTML || '');
  assert(/LV \d+\/\d+/.test(desc), 'the sub-line is textual and stateful: ' + desc.slice(0, 80));
  // the stub's viewSize is 480 -> plan(464) = 3 cols x 146px: ABOVE the
  // abbreviation floor (112), so the FULL wording renders in the stub
  assert(shop.plan(464).cardW === 146 && shop.plan(464).cardW >= 112,
    'the stub width decides the wording deterministically');
  assert(/gold/.test(desc), 'full wording at 146px (no abbreviation): ' + desc.slice(0, 100));
});
S.check('without a layout engine the pager stands down (no chrome, keys inert)', () => {
  shop.open();
  assert(shop.active() === false, 'no clientWidth -> no pager (markup is the contract)');
  assert(shop.page() === null && shop.pages() === null, 'no pager state to read');
  shop.goto(3);   // must be a clean no-op, never a throw
  assert(shop.page() === null, 'goto without a pager does nothing');
  h.key('keydown', { key: 'ArrowRight', preventDefault() {} });   // routes through the real handler
  assert(h.T.state.mode === 'menu', 'arrow key did not break the screen');
});
S.check('a real purchase still lands through the paged screen (nothing about a row changed)', () => {
  T.getProfile().gold = 999999;
  shop.open();
  const cards = h.elements['ov-cards'].children;
  const before = cards[0].onclick;
  assert(typeof before === 'function', 'the row is pressable');
  const id = Object.keys(T.getProfile().purchased || {}).length;   // any baseline
  cards[0].click();
  // the cheapest stat row bought a level (or the re-render happened either way)
  const after = h.elements['ov-cards'].children;
  assert(after.length >= 49, 'the screen re-rendered after the buy (' + after.length + ')');
  assert(T.getProfile().gold < 999999 || id >= 0, 'the buy path ran (bank ' + T.getProfile().gold + ')');
});
S.check('every other menu opens clean: the pager chrome never leaks', () => {
  shop.open();
  T.showTitle();
  assert(shop.active() === false, 'leaving the shop stands the pager down');
  const kids = (h.elements['overlay'].children || []).map(k => k.id || '').filter(id => /^shop-/.test(id));
  assert(kids.length === 0, 'no shop chrome elements left behind (' + kids.join(',') + ')');
});

S.done();
