// HORDES - tools/measure_shop_scroll.mjs (SHOP PAGING mockup task 7R4PW,
// 2026-09-18). MEASUREMENT ONLY — nothing in src/ changes. Boots the REAL game
// at the two acceptance phone sizes, opens the REAL shop, and measures the
// scroll cost the owner is reacting to ("the shop is very scroll heavy"):
//   * row count (the real SHOP_UPGRADES + doors the live screen renders);
//   * rendered list height vs the visible viewport (the scroll distance);
//   * how many REAL touch swipes it takes to reach the last row (empirical:
//     each swipe is a 250px upward flick through the real touch pipeline —
//     the gesture a thumb makes — counted until the scroller bottoms out).
// Run: node tools/measure_shop_scroll.mjs
import { withPage } from './browser.mjs';

const px = (v) => Math.round(v * 10) / 10;

async function arm(w, h, dpr, tag) {
  return withPage({ w, h, dpr, mobile: true,
    startupScript: "try { localStorage.setItem('hordes_onboarded', '1'); } catch (e) {}" },
    async (p) => {
      await p.waitFor("!!document.getElementById('game')", 15000);
      await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
      await p.waitFor("(async()=> (await import('./src/main.js')).__TEST.state.mode !== 'intro')()", 15000);
      await p.waitFor("(async()=>{ const rv=(await import('./src/main.js')).__TEST.state.titleReveal; return !rv || rv.phase==='settled'; })()", 8000);
      await p.sleep(400);
      // house pattern (verify_condense_after.mjs): drive the real onclick
      const opened = await p.evaluate("(() => { const el=[...document.getElementById('ov-cards').children].find(k=>(k.textContent||'').toUpperCase().includes('SHOP')); if (!el) return false; el.click(); return true; })()");
      if (!opened) throw new Error('no SHOP card on the title');
      await p.waitFor("/^SHOP$/.test(document.getElementById('ov-title').textContent)", 8000);
      await p.sleep(500);   // lazy frames paint after the browser's layout pass

      const m = await p.evaluate(`(() => {
        const ov = document.getElementById('overlay');
        const cards = [...ov.querySelectorAll('.card')];
        const first = cards[0] ? cards[0].getBoundingClientRect() : null;
        const names = [...ov.querySelectorAll('#ov-cards > .card')].map(k => (k.querySelector('.name')||{}).textContent||'');
        return { n: cards.length, names,
          scrollH: ov.scrollHeight, clientH: ov.clientHeight, top: ov.scrollTop,
          cardW: first && Math.round(first.width), cardH: first && Math.round(first.height) };
      })()`);

      // REAL swipes to the last row: 250px upward flicks, counted until the
      // scroller bottoms out. Cap at 40 so a broken scroller cannot spin.
      let swipes = 0;
      let perSwipe = [];
      for (;;) {
        const before = await p.evaluate("document.getElementById('overlay').scrollTop");
        if (before >= m.scrollH - m.clientH - 1) break;
        if (swipes >= 40) break;
        await p.swipe(Math.round(w / 2), Math.round(h * 0.7), 0, -250);
        const after = await p.evaluate("document.getElementById('overlay').scrollTop");
        perSwipe.push(after - before);
        swipes++;
        if (after - before <= 2) break;   // the scroller refuses: stop honestly
      }
      const shot = await p.shot('shop-scroll-' + tag + '-bottom');
      return { tag, w, h, m, swipes, perSwipe, errors: p.errors, shot };
    });
}

const out = {};
for (const [w, h, dpr, tag] of [[390, 844, 3, '390x844'], [320, 568, 3, '320x568']]) {
  const r = await arm(w, h, dpr, tag);
  out[tag] = r;
  const dist = r.m.scrollH - r.m.clientH;
  console.log('RAW ' + tag + ': cards=' + r.m.n +
    ' card=' + r.m.cardW + 'x' + r.m.cardH + 'px' +
    ' listHeight=' + r.m.scrollH + 'px visible=' + r.m.clientH + 'px' +
    ' scrollDistance=' + dist + 'px' +
    ' swipesToLastRow=' + r.swipes +
    ' perSwipePx=[' + r.perSwipe.map(px).join(', ') + ']' +
    ' errors=' + JSON.stringify(r.errors));
}
console.log('\nfirst/last rows: ' + out['390x844'].m.names.slice(0, 3).join(' | ') + '  ...  ' +
  out['390x844'].m.names.slice(-3).join(' | '));
