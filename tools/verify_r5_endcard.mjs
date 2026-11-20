// HORDES - tools/verify_r5_endcard.mjs (R5 the end card). Real headless
// Chrome at 1280x720, 844x390, 390x844, 375x667 and 320x568 (or the sizes named on the command line):
//   1. A death, the movie skipped with two key presses: the end card comes up
//      over the frozen frame, and the skipping press did not press RETRY.
//   2. The gold counts (part way at 0.5 s), a press lands it at once.
//   3. Every card fully on screen and the top element at its centre; no scroll.
//      The same with five trophies earned (the five longest names).
//   4. Keys: the arrows reach BUY NEXT last, Tab wraps to RETRY, Enter on
//      BUY NEXT opens the shop with the cursor on that row, the row on screen.
//   5. A real click (desktop) or tap (phones) on BUY NEXT does the same; one
//      on RETRY starts a run.
//   6. The win's card: RETRY first, BUY NEXT last, all on screen, no scroll.
//   7. 0 console errors.
// Run: HORDES_CHROME=<chrome> node tools/verify_r5_endcard.mjs
import { withPage } from './browser.mjs';

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok });
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : ''));
};
const STARTUP = "try { localStorage.setItem('hordes_onboarded', '1'); } catch (e) {}";
const ARMS = [
  { tag: '1280x720', w: 1280, h: 720, dpr: 1, mobile: false },
  { tag: '844x390', w: 844, h: 390, dpr: 2, mobile: true },
  { tag: '390x844', w: 390, h: 844, dpr: 3, mobile: true },
  // a short upright phone (font2: the old font wraps the card text to more lines)
  { tag: '375x667', w: 375, h: 667, dpr: 2, mobile: true },
  // the smallest upright phone (font2 review: the cards fell off it in monospace)
  { tag: '320x568', w: 320, h: 568, dpr: 2, mobile: true },
].filter((a) => process.argv.length <= 2 || process.argv.slice(2).includes(a.tag));
const key = (k) => `(window.dispatchEvent(new KeyboardEvent('keydown', { key: '${k}' })), window.dispatchEvent(new KeyboardEvent('keyup', { key: '${k}' })), true)`;
// The five longest trophy names, put into the stored end card, which is shown again.
const FIVE = `(async () => { const A = await import('./src/achievements.js'); const E = await import('./src/end_card.js'); const art = (await import('./src/art/index.js')).TROPHY_ART;
  const ts = A.ACHIEVEMENTS.map(a => ({ id: a.id, name: (art[a.id] && art[a.id].name) || a.id })).sort((x, y) => y.name.length - x.name.length).slice(0, 5);
  const d = document.createElement('div'); d.innerHTML = E.endCardHtml({ gold: 1, bank: 1, trophies: ts });
  const got = d.querySelector('.ec-got').outerHTML; const s = window.__T.state.endScreen;
  s.subHtml = s.subHtml.replace(/<div class="ec-more">/, got + '<div class="ec-more">'); window.__T.endCard.reshow(); return true; })()`;
const LAYOUT = `(() => {
  const vw = innerWidth, vh = innerHeight, ov = document.getElementById('overlay');
  const cards = [...document.querySelectorAll('#ov-cards .card')].filter(c => c.style.display !== 'none').map(c => { const r = c.getBoundingClientRect();
    const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { name: c.querySelector('.name').textContent, x: r.left + r.width / 2, y: r.top + r.height / 2, sel: c.classList.contains('sel'),
      inView: r.left >= 0 && r.right <= vw && r.top >= 0 && r.bottom <= vh, hit: !!(e && e.closest && e.closest('.card') === c) }; });
  return { cards, scroll: ov.scrollHeight - ov.clientHeight, hscroll: document.documentElement.scrollWidth > vw, title: document.getElementById('ov-title').textContent, mode: window.__T.state.mode };
})()`;

for (const arm of ARMS) {
  await withPage({ ...arm, startupScript: STARTUP }, async (pg) => {
    const { evaluate, waitFor, click, tap, sleep } = pg;
    const press = (x, y) => (arm.mobile ? tap(x, y) : click(x, y));
    await waitFor("(async () => { const T = (await import('./src/main.js')).__TEST; return T && T.state && T.state.mode === 'title' && (!T.state.titleReveal || T.state.titleReveal.phase === 'settled'); })()", 20000);
    await evaluate(`(async () => {
      const T = (await import('./src/main.js')).__TEST;
      window.__T = T;
      for (const e of document.querySelectorAll('.wn-over')) e.remove();
      T.banners && T.banners.suppressAll && T.banners.suppressAll();
      T.setPilotMode('AUTO_ALL');
      T.auto.on = false;
      T.getProfile().gold = 400;
      return true;
    })()`);
    async function death() {
      await evaluate("(window.__T.state.mode !== 'title' && window.__T.showTitle(), true)");
      await waitFor("(() => { const s = window.__T.state; return s.mode === 'title' && (!s.titleReveal || s.titleReveal.phase === 'settled'); })()", 15000);
      await evaluate("(window.__T.startRun(), true)");
      await waitFor("window.__T.state.mode === 'playing' && window.__T.state.time > 0.5", 15000);
      await evaluate("(window.__T.hurtBy({ cause: 'contact', typeId: 'GRUNT' }), window.__T.die(), true)");
      await sleep(500);
      await evaluate(key('Escape')); await sleep(120); await evaluate(key('Escape'));
      return waitFor("window.__T.state.mode === 'dead' && document.getElementById('overlay').style.display === 'flex'", 12000);
    }
    // 1-2. The movie skipped by keys, then the count.
    const up = await death();
    const c0 = await evaluate("({ done: window.__T.endCard.count().done, back: !!window.__T.endCard.backdrop() })");
    check(arm.tag + ' skip: the end card is up over the frozen frame', up && c0.back, c0);
    await sleep(500);
    const mid = await evaluate("({ mode: window.__T.state.mode, txt: document.querySelector('.ec-earned').textContent, gold: window.__T.state.runSettled.gold, done: window.__T.endCard.count().done })");
    check(arm.tag + ' the skipping press did not press RETRY', mid.mode === 'dead', mid.mode);
    const shown = +mid.txt.replace(/\D/g, '');
    check(arm.tag + ' the gold is part way at 0.5 s', !mid.done && shown > 0 && shown < mid.gold, mid);
    await evaluate(key('Shift'));
    const land = await evaluate("({ txt: document.querySelector('.ec-earned').textContent, bank: document.querySelector('.ec-bank').textContent, gold: window.__T.state.runSettled.gold, prof: window.__T.getProfile().gold })");
    check(arm.tag + ' a press lands the numbers', land.txt === 'GOLD EARNED: +' + land.gold && land.bank === 'BANK ' + land.prof, land);
    // 3. Layout.
    let lay = await evaluate(LAYOUT);
    check(arm.tag + ' death card: RETRY first, BUY NEXT last', lay.cards.map(c => c.name).join(',') === 'RETRY,SHOP,AUTO-CONTINUE: OFF,TITLE,BUY NEXT', lay.cards.map(c => c.name));
    check(arm.tag + ' death card: every card on screen and hit at its centre, no scroll', lay.cards.every(c => c.inView && c.hit) && lay.scroll <= 1 && !lay.hscroll,
      { scroll: lay.scroll, cards: lay.cards.map(c => [c.name, c.inView, c.hit]) });
    // 3b. Five trophies (the five longest names) put into this end card, shown again.
    // The 320x568 phone is the one size where five trophies may scroll (they did with
    // the pixel font too, 306 px); there every card must still be hit after scrolling.
    await evaluate(FIVE);
    await sleep(400);
    const five = await evaluate(LAYOUT);
    const got = await evaluate("document.querySelectorAll('#ov-sub .ec-trophy').length");
    if (arm.tag !== '320x568') {
      check(arm.tag + ' five trophies: every card on screen and hit at its centre, no scroll', got === 5 && five.cards.every(c => c.inView && c.hit) && five.scroll <= 1 && !five.hscroll,
        { got, scroll: five.scroll, cards: five.cards.map(c => [c.name, c.inView, c.hit]) });
    } else {
      const reach = await evaluate(`(() => { const ov = document.getElementById('overlay'); ov.scrollTop = ov.scrollHeight; const out = [...document.querySelectorAll('#ov-cards .card')].map(c => { const r = c.getBoundingClientRect();
        const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!(e && e.closest && e.closest('.card') === c); }); ov.scrollTop = 0; return out; })()`);
      check(arm.tag + ' five trophies: every card reachable by scrolling, scroll under 120 px', got === 5 && reach.every(Boolean) && five.scroll < 120 && !five.hscroll,
        { got, scroll: five.scroll, reach });
    }
    // 4. Keys.
    for (let i = 0; i < 5; i++) await evaluate(key('ArrowRight'));
    lay = await evaluate(LAYOUT);
    check(arm.tag + ' arrows: the fifth press is on BUY NEXT', lay.cards[4] && lay.cards[4].sel, lay.cards.map(c => c.sel));
    await evaluate(key('Tab'));
    lay = await evaluate(LAYOUT);
    check(arm.tag + ' Tab wraps to RETRY', lay.cards[0].sel, lay.cards.map(c => c.sel));
    await evaluate("(window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true })), true)");
    await evaluate(key('Enter'));
    await sleep(400);
    const goal = await evaluate("window.__T.menus.bestNextPurchase().name");
    lay = await evaluate(LAYOUT);
    const selRow = lay.cards.find(c => c.sel);
    check(arm.tag + ' Enter on BUY NEXT: the shop, the cursor on its row, the row on screen', lay.title === 'SHOP' && selRow && selRow.name === goal && selRow.inView, { title: lay.title, goal, sel: selRow });
    // 5. Real presses.
    await death();
    await evaluate(key('Shift'));
    lay = await evaluate(LAYOUT);
    const buy = lay.cards.find(c => c.name === 'BUY NEXT');
    await press(buy.x, buy.y);
    await sleep(400);
    lay = await evaluate(LAYOUT);
    const sel2 = lay.cards.find(c => c.sel);
    check(arm.tag + ' a real ' + (arm.mobile ? 'tap' : 'click') + ' on BUY NEXT: the shop on its row', lay.title === 'SHOP' && sel2 && sel2.name === goal && sel2.inView, { title: lay.title, sel: sel2 });
    await death();
    await sleep(1500);
    lay = await evaluate(LAYOUT);
    const retry = lay.cards.find(c => c.name === 'RETRY');
    await press(retry.x, retry.y);
    const back = await waitFor("window.__T.state.mode === 'playing'", 5000);
    check(arm.tag + ' a real ' + (arm.mobile ? 'tap' : 'click') + ' on RETRY starts a run', back);
    // 6. The win.
    await evaluate("(window.__T.run.runSurvived(), true)");
    await waitFor("window.__T.state.mode === 'dead' && document.getElementById('overlay').style.display === 'flex'", 10000);
    await sleep(1500);
    lay = await evaluate(LAYOUT);
    const names = lay.cards.map(c => c.name);
    check(arm.tag + ' win card: RETRY first, BUY NEXT last, all on screen and hit, no scroll',
      names[0] === 'RETRY' && names[names.length - 1] === 'BUY NEXT' && lay.cards.every(c => c.inView && c.hit) && lay.scroll <= 1,
      { scroll: lay.scroll, cards: lay.cards.map(c => [c.name, c.inView, c.hit]) });
    check(arm.tag + ' 0 console errors', pg.errors.length === 0, pg.errors.slice(0, 5));
  });
}
const bad = results.filter(r => !r.ok).length;
console.log((results.length - bad) + '/' + results.length + ' checks passed');
process.exit(bad ? 1 : 0);
