// BEFORE-grid measurement for the shop pager task (2026-09-18): boots the REAL
// game, opens the REAL shop, reports the laid-out grid — columns (distinct row
// tops), card box, list height — at the acceptance sizes + one desktop case.
// MEASUREMENT ONLY. Run: node tools/measure_shop_grid.mjs
import { withPage } from './browser.mjs';

async function arm(w, h, dpr, mobile, tag) {
  return withPage({ w, h, dpr, mobile,
    startupScript: "try { localStorage.setItem('hordes_onboarded', '1'); } catch (e) {}" },
    async (p) => {
      await p.waitFor("!!document.getElementById('game')", 15000);
      await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
      await p.waitFor("(async()=> (await import('./src/main.js')).__TEST.state.mode !== 'intro')()", 15000);
      await p.waitFor("(async()=>{ const rv=(await import('./src/main.js')).__TEST.state.titleReveal; return !rv || rv.phase==='settled'; })()", 8000);
      await p.sleep(400);
      const opened = await p.evaluate("(() => { const el=[...document.getElementById('ov-cards').children].find(k=>(k.textContent||'').toUpperCase().includes('SHOP')); if (!el) return false; el.click(); return true; })()");
      if (!opened) throw new Error('no SHOP card');
      await p.waitFor("/^SHOP$/.test(document.getElementById('ov-title').textContent)", 8000);
      await p.sleep(500);
      const m = await p.evaluate(`(() => {
        const ov = document.getElementById('overlay');
        const cs = getComputedStyle(ov.querySelector('.cards'));
        const els = [...ov.querySelectorAll('#ov-cards > .card')];
        const rects = els.map(k => k.getBoundingClientRect());
        const first = rects[0];
        // columns = cards sharing the first row's top (within 2px)
        const row1 = rects.filter(r => Math.abs(r.top - first.top) < 2);
        return { n: rects.length, cols: row1.length,
          vw: innerWidth, ovW: ov.clientWidth, ovH: ov.clientHeight,
          scrollH: ov.scrollHeight, gap: cs.gap,
          cardW: Math.round(first.width), cardH: Math.round(first.height),
          fontSizeName: getComputedStyle(els[0].querySelector('.name')).fontSize,
          fontSizeDesc: getComputedStyle(els[0].querySelector('.desc')).fontSize };
      })()`);
      return { tag, m, errors: p.errors };
    });
}

for (const [w, h, dpr, mobile, tag] of [
  [390, 844, 3, true, '390x844'],
  [320, 568, 3, true, '320x568'],
  [1280, 800, 1, false, 'desktop-1280x800'],
]) {
  const r = await arm(w, h, dpr, mobile, tag);
  console.log(tag + ': cards=' + r.m.n + ' cols=' + r.m.cols +
    ' card=' + r.m.cardW + 'x' + r.m.cardH + ' gap=' + r.m.gap +
    ' overlay=' + r.m.ovW + 'x' + r.m.ovH + ' list=' + r.m.scrollH +
    ' fonts=' + r.m.fontSizeName + '/' + r.m.fontSizeDesc +
    ' errors=' + JSON.stringify(r.errors));
}
