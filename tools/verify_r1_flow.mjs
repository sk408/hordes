// HORDES - tools/verify_r1_flow.mjs (R1 "flow"). Real headless Chrome at
// 1280x720, 844x390 and 390x844:
//   1. A death lands on the end card; the AUTO-CONTINUE card is there (after
//      RETRY and SHOP), fully on screen with the other cards, and says OFF.
//   2. A REAL click (desktop) or tap (phones) on it turns it on: the card reads
//      ON and counts down, and the next run starts by itself.
//   3. (1280x720) wave 1: the portal entry goes straight to the escape chase,
//      no portal movie.
//   4. 0 console errors.
// Run: HORDES_CHROME=<chrome> node tools/verify_r1_flow.mjs
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
];

for (const arm of ARMS) {
  await withPage({ ...arm, startupScript: STARTUP }, async (pg) => {
    const { evaluate, waitFor, shot, click, tap, sleep } = pg;
    await waitFor("(async () => { const T = (await import('./src/main.js')).__TEST; return T && T.state && T.state.mode === 'title' && (!T.state.titleReveal || T.state.titleReveal.phase === 'settled'); })()", 20000);
    await evaluate(`(async () => {
      const T = (await import('./src/main.js')).__TEST;
      window.__T = T;
      // A seeded old profile gets the WHAT'S NEW note on the title, and on this
      // branch it stays over the end card (the 'returning' item clears it when a
      // run starts). Close it the way its dismiss does, so the taps reach the card.
      for (const e of document.querySelectorAll('.wn-over')) e.remove();
      T.banners && T.banners.suppressAll && T.banners.suppressAll();
      T.setPilotMode('AUTO_ALL');
      T.auto.on = false;
      T.startRun();
      return true;
    })()`);
    await waitFor("window.__T.state.mode === 'playing' && window.__T.state.time > 0.5", 15000);

    if (arm.tag === '1280x720') {
      // Wave 1: queue the portal entry and record every frame's mode.
      await evaluate(`(() => {
        const s = window.__T.state;
        window.__modes = new Set();
        const rec = () => { window.__modes.add(s.mode); if (window.__rec) requestAnimationFrame(rec); };
        window.__rec = true; rec();
        s.player.invuln = 1e6;
        s.wave.cinePending = true; s.portal = null;
        return true;
      })()`);
      const esc = await waitFor("window.__T.state.mode === 'escape'", 5000);
      await sleep(300);
      const modes = await evaluate("(window.__rec = false, [...window.__modes])");
      check(arm.tag + ' wave 1: portal entry -> escape chase, no portal movie', esc && !modes.includes('portal-cine'), modes);
      await evaluate("window.__T.escape.skip ? window.__T.escape.skip() : null");
      await waitFor("window.__T.state.mode === 'intermission'", 8000);
      await evaluate("(window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c' })), true)");
      await waitFor("window.__T.state.mode === 'playing'", 5000);
      await sleep(200);
    }

    // A death, then the end card.
    await evaluate("(window.__T.state.mode !== 'playing' && window.__T.startRun(), window.__T.die(), true)");
    const dead = await waitFor("window.__T.state.mode === 'dead' && document.getElementById('overlay').style.display === 'flex'", 15000);
    check(arm.tag + ' end card up', dead);
    await sleep(400);
    const lay = await evaluate(`(() => {
      const cards = [...document.querySelectorAll('#ov-cards .card')];
      const vw = innerWidth, vh = innerHeight;
      return cards.map(c => { const r = c.getBoundingClientRect();
        return { name: c.querySelector('.name').textContent, desc: c.querySelector('.desc').textContent,
          x: r.left + r.width / 2, y: r.top + r.height / 2, inView: r.left >= 0 && r.right <= vw && r.top >= 0 && r.bottom <= vh,
          w: Math.round(r.width), h: Math.round(r.height) }; });
    })()`);
    const ac = lay.find(c => c.name.startsWith('AUTO-CONTINUE'));
    check(arm.tag + ' cards in order with AUTO-CONTINUE: OFF third', lay.map(c => c.name).join(',') === 'RETRY,SHOP,AUTO-CONTINUE: OFF,TITLE,BUY NEXT', lay.map(c => c.name));   // R5: BUY NEXT last
    check(arm.tag + ' every card fully on screen', lay.every(c => c.inView), lay.map(c => [c.name, c.inView, c.w + 'x' + c.h]));
    check(arm.tag + ' the card says what it does and pays', ac && /next run by itself/.test(ac.desc) && /pay in full, then 75% gold/.test(ac.desc), ac && ac.desc);
    const hScroll = await evaluate("document.documentElement.scrollWidth > innerWidth");
    check(arm.tag + ' no horizontal scroll', !hScroll);
    await shot('r1flow_' + arm.tag + '_off');

    // The real press.
    const top = await evaluate(`(() => { const e = document.elementFromPoint(${ac.x}, ${ac.y}); const c = e && e.closest('.card'); return c ? c.querySelector('.name').textContent : (e && e.className); })()`);
    check(arm.tag + ' nothing covers the card (hit test at its centre)', /^AUTO-CONTINUE/.test(top), top);
    if (arm.mobile) await tap(ac.x, ac.y); else await click(ac.x, ac.y);
    await sleep(250);
    const on = await evaluate("({ on: window.__T.auto.on, left: window.__T.auto.restartLeft, mode: window.__T.state.mode, " +
      "txt: [...document.querySelectorAll('#ov-cards .card')].map(c => c.textContent).find(t => t.startsWith('AUTO-CONTINUE')), pe: document.getElementById('overlay').style.pointerEvents })");
    check(arm.tag + ' a real ' + (arm.mobile ? 'tap' : 'click') + ' turns it ON and starts the countdown',
      on.on === true && on.left > 3 && on.left <= 5 && /AUTO-CONTINUE: ON/.test(on.txt) && /next run in \ds/.test(on.txt), on);
    await shot('r1flow_' + arm.tag + '_on');
    const next = await waitFor("window.__T.state.mode === 'playing' && window.__T.state.autoStarted === true", 9000);
    await sleep(500);
    const t = await evaluate("window.__T.state.time");
    check(arm.tag + ' the next run started by itself', next && t > 0.2, { t });

    // The RUN SURVIVED card has five cards (PRESTIGE last): all of them on
    // screen, none needing a scroll, each one the top element at its centre.
    await evaluate("(window.__T.auto.on = false, window.__T.run.runSurvived(), true)");
    const won = await waitFor("window.__T.state.mode === 'dead' && document.getElementById('overlay').style.display === 'flex'", 10000);
    await sleep(400);
    const wl = await evaluate(`(() => {
      const vw = innerWidth, vh = innerHeight, ov = document.getElementById('overlay');
      const cards = [...document.querySelectorAll('#ov-cards .card')].map(c => { const r = c.getBoundingClientRect();
        const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { name: c.querySelector('.name').textContent, top: Math.round(r.top), bottom: Math.round(r.bottom),
          inView: r.left >= 0 && r.right <= vw && r.top >= 0 && r.bottom <= vh, hit: !!(e && e.closest && e.closest('.card') === c) }; });
      return { cards, scroll: ov.scrollHeight, client: ov.clientHeight };
    })()`);
    check(arm.tag + ' win card: RETRY, SHOP, AUTO-CONTINUE, TITLE, PRESTIGE', won && wl.cards.map(c => c.name.replace(/:.*/, '')).join(',') === 'RETRY,SHOP,AUTO-CONTINUE,TITLE,PRESTIGE 1,BUY NEXT', wl.cards.map(c => c.name));
    check(arm.tag + ' win card: every card fully on screen and hit at its centre, no scroll', wl.cards.every(c => c.inView && c.hit) && wl.scroll <= wl.client + 1,
      { scroll: wl.scroll, client: wl.client, cards: wl.cards.map(c => [c.name, c.top, c.bottom, c.inView, c.hit]) });
    await shot('r1flow_' + arm.tag + '_win');
    check(arm.tag + ' 0 console errors', pg.errors.length === 0, pg.errors.slice(0, 5));
  });
}
const bad = results.filter(r => !r.ok).length;
console.log((results.length - bad) + '/' + results.length + ' checks passed');
process.exit(bad ? 1 : 0);
