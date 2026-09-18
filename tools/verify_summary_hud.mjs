// END-OF-RUN SUMMARY HUD SUPPRESSION (owner 2026-09-17, msg_01M2RVD9HHZZDSR7F
// + addendum): while the run summary is up the HUD and every status message
// must be hidden — asserted GEOMETRICALLY, in real Chrome, at both phone
// sizes. The shipped defects (death cause printed over the stat bars, the
// GOLD counter over the gold line) are painted HUD chrome showing through
// behind the DOM summary: the RED run is hudDrawn === true in 'dead' mode,
// plus the un-purged late toast queue.
// Usage: node tools/verify_summary_hud.mjs [label]   (label: 'before'/'after')
import { withPage } from './browser.mjs';
import { copyFileSync, mkdirSync } from 'node:fs';
import { TOUR_KEYS } from '../src/tour.js';

const LABEL = process.argv[2] || 'run';
const ART = 'docs/art/summary-hud-2026-09-17/shots';
mkdirSync(ART, { recursive: true });

const STARTUP = `
try {
  localStorage.setItem('hordes_onboarded', '1');
  const keys = ${JSON.stringify(Object.values(TOUR_KEYS))};
  for (const k of keys) localStorage.setItem(k, '1');
} catch (e) {}`;

// A parked killer (the test_death_screen.mjs death path) with a LATE TOAST
// queued on the very frame of the death — the known pop-through source.
const KILL = `(async () => {
  const T = (await import('./src/main.js')).__TEST;
  const { makeTypedEnemy } = await import('./src/enemy_types.js');
  const s = T.state, p = s.player;
  T.startRun();
  p.hp = 1; p.invuln = 0; p.potions.hp = 0;
  s.spawnTimer = 999; s.wave.endsAt = s.time + 9999;
  s.enemies.length = 0;
  const k = makeTypedEnemy('SPITTER', p.x, p.y, s.time);
  k.hp = k.maxHp = 1e6; k.speed = 0;
  s.enemies.push(k);
  window.__park = true;
  const park = () => {
    if (!window.__park) return;
    const st = T.state;
    if (st.mode === 'death-cine' || st.mode === 'dead') { window.__park = false; return; }
    const e = st.enemies[0];
    if (e && e.hp > 0) { e.x = st.player.x; e.y = st.player.y; e.speed = 0; }
    requestAnimationFrame(park);
  };
  park();
  return true;
})()`;

let fails = 0;
function ok(cond, label) {
  console.log((cond ? '  ok - ' : '  FAIL - ') + label);
  if (!cond) fails++;
}

async function viewport(w, h, tag) {
  await withPage({ w, h, dpr: 3, mobile: true, startupScript: STARTUP }, async (p) => {
    await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode !== 'intro')()`, 15000);
    await p.sleep(300);
    await p.evaluate(`(() => {
      const el = [...document.getElementById('ov-cards').children]
        .find(k => (k.textContent || '').toUpperCase().includes('START GAME'));
      if (el) el.click(); })()`);
    await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode === 'playing')()`, 20000);
    await p.sleep(600);

    await p.evaluate(KILL);
    await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode === 'death-cine')()`, 8000, 50);
    // A toast queued at the moment of death (ttl frozen outside update()).
    await p.evaluate(`(async () => { const T = (await import('./src/main.js')).__TEST;
      T.state.toasts.push({ msg: 'LATE QUEUED TOAST', ttl: 9, tint: null }); return true; })()`);
    await p.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }))`);
    await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode === 'dead')()`, 5000, 50);
    await p.sleep(500);   // two+ rAF frames paint (or do not paint) the HUD

    const shot = await p.shot('summary-hud-' + LABEL + '-' + tag);
    copyFileSync(shot, ART + '/summary-' + LABEL + '-' + tag + '.png');

    // THE GEOMETRY, read from the live page.
    const geo = await p.evaluate(`(async () => {
      const T = (await import('./src/main.js')).__TEST;
      const st = T.state;
      const overlay = document.getElementById('overlay');
      const sub = document.getElementById('ov-sub');
      const cards = [...document.getElementById('ov-cards').children];
      // every VISIBLE text-bearing element outside #overlay (stray status text)
      const stray = [];
      for (const el of document.body.querySelectorAll('*')) {
        if (el.closest('#overlay')) continue;
        if (el.children.length > 0) continue;
        const txt = (el.textContent || '').trim();
        if (!txt) continue;
        const r = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || r.width === 0) continue;
        stray.push({ tag: el.tagName, id: el.id, txt: txt.slice(0, 30) });
      }
      const subRect = sub.getBoundingClientRect();
      const inter = [];
      for (const c of cards) {
        const r = c.getBoundingClientRect();
        const ox = Math.max(0, Math.min(subRect.right, r.right) - Math.max(subRect.left, r.left));
        const oy = Math.max(0, Math.min(subRect.bottom, r.bottom) - Math.max(subRect.top, r.top));
        if (ox > 1 && oy > 1) inter.push((c.textContent || '').slice(0, 12));
      }
      const earnSpans = [...sub.querySelectorAll('.earn')];
      const goldNumbers = earnSpans.reduce((n, sp) =>
        n + ((sp.textContent || '').match(/\\d[\\d,]*/g) || []).length, 0);
      return {
        mode: st.mode,
        hudDrawn: T.renderer.hudDrawn,
        toasts: st.toasts.length,
        bossBanner: !!st.bossBanner,
        overlayShown: overlay.style.display,
        subLines: st.endScreen ? st.endScreen.subHtml.split('<br>').length : 99,
        earnLines: earnSpans.length,
        goldNumbers,
        hasCause: /KILLED BY/.test(sub.innerHTML),
        strayText: stray,
        cardIntersects: inter,
        cards: cards.length,
      }; })()`);

    ok(geo.mode === 'dead' && geo.overlayShown === 'flex', '[' + tag + '] the summary is up');
    ok(geo.hudDrawn === false,
      '[' + tag + '] the play HUD did NOT paint behind the summary (hudDrawn ' + geo.hudDrawn + ') — ' +
      'the owner defect: cause over the stat bars, GOLD counter over the gold line');
    ok(geo.toasts === 0 && !geo.bossBanner,
      '[' + tag + '] no status message survives the summary (toasts ' + geo.toasts +
      ', banner ' + geo.bossBanner + ') — the late-queued toast is purged');
    ok(geo.strayText.length === 0,
      '[' + tag + '] no visible text outside the summary ' +
      (geo.strayText.length ? ':: ' + JSON.stringify(geo.strayText).slice(0, 160) : ''));
    ok(geo.subLines <= 5, '[' + tag + '] at most 5 lines above the buttons (' + geo.subLines + ')');
    ok(geo.earnLines <= 1 && geo.goldNumbers <= 2,
      '[' + tag + '] ONE gold line, at most two numbers (' + geo.earnLines + ' lines, ' +
      geo.goldNumbers + ' numbers)');
    ok(geo.hasCause, '[' + tag + '] the death cause reads as its own label');
    ok(geo.cardIntersects.length === 0 && geo.cards === 3,
      '[' + tag + '] 3 buttons, none intersecting the text (' + geo.cards + ' cards' +
      (geo.cardIntersects.length ? ', intersect: ' + geo.cardIntersects.join(',') : '') + ')');

    const errors = p.errors;
    if (errors.length) { console.log('[' + tag + '] PAGE ERRORS: ' + errors.join(' | ').slice(0, 300)); fails++; }
  });
}

await viewport(390, 844, '390x844');
await viewport(320, 568, '320x568');
console.log(fails ? 'FAILURES: ' + fails : 'ALL OK');
process.exit(fails ? 1 : 0);
