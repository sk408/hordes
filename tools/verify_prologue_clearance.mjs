// PROLOGUE BANNER / HUD CLEARANCE — REAL-BROWSER ACCEPTANCE
// (brief docs/briefs/PROLOGUE_BANNER_CLEARANCE.md, owner tutorial priority
// 2026-09-18). The disclosed defect: the prologue banner card band (view
// x 90..390, y 24..116) crossed the HUD's top-left readouts (HP/MP/XP bars,
// the LV badge + values) and the event feed's first lines. The fix (brief
// mechanism (b)): while the phase is LIVE the inert readouts are SUPPRESSED
// (hidden, never painted under the card) and the event feed drops to
// PROLOGUE_FEED_Y so its plate clears the card by exactly 8px; the drink
// restores everything byte-identically.
//
// The view is ALWAYS 480x300 world units letterboxed to the viewport, so one
// view-space geometry is probed at BOTH phone sizes. The prologue is armed the
// way a new player gets it: a REAL FRESH PROFILE (empty storage) -> START GAME
// -> the automatic arm (C.PROLOGUE.ENABLED has shipped true since 56e1a93).
//
// Per size (390x844 and 320x568, both @dpr3):
//   * banner UP (walk cadence met), phase armed, zero console errors;
//   * seam: hudChrome.prologueHud === true, no hpText/mpText/xpText painted,
//     the purse and the run clock still paint (they never shared the band);
//   * PIXELS (backing store): no HP fill (#ff5566), MP fill (#4a8cff) or XP
//     gold (#ffd75e) in the readout zones; the purse's gold STILL present;
//   * a REAL tap on the SKIP corner fires the confirm toast and the feed's
//     text pixels appear ONLY at or below the relocated feed line (never in
//     the card band, never in the 8px gap);
//   * the card rect clears the run clock by >= 8px and stays fully in view;
//   * the second SKIP tap skips, the potion sequence runs to its drink, and
//     the HP/MP/XP readouts are RESTORED (fill pixels back on the bars).
//
// Run: node tools/verify_prologue_clearance.mjs
import { withPage } from './browser.mjs';
import { copyFileSync, mkdirSync } from 'node:fs';

const ART = '/home/claude/projects/hordes/docs/art/prologue-2026-09-18/shots';
mkdirSync(ART, { recursive: true });

let fails = 0;
function ok(cond, label) {
  console.log((cond ? '  ok - ' : '  FAIL - ') + label);
  if (!cond) fails++;
}

const tx = (expr) => `(async () => { const t = (await import('./src/main.js')).__TEST; return (${expr}); })()`;

async function clickCard(p, text) {
  await p.evaluate(`(() => {
    const el = [...document.getElementById('ov-cards').children]
      .find(k => (k.textContent || '').toUpperCase().includes(${JSON.stringify(text)}) && !k.hidden);
    if (el) el.click(); })()`);
}

// Scan a view-space region of the game canvas backing store for an exact
// colour; returns the count and the topmost view-y it was seen at (or null).
const scanRegion = (x0, y0, x1, y1, hex) => `(async () => {
  const cv = document.getElementById('game');
  const g = cv.getContext('2d');
  const k = cv.width / 480;
  const R = parseInt('${hex}'.slice(1, 3), 16), G = parseInt('${hex}'.slice(3, 5), 16),
        B = parseInt('${hex}'.slice(5, 7), 16);
  const d = g.getImageData(Math.round(${x0} * k), Math.round(${y0} * k),
    Math.round((${x1} - ${x0}) * k), Math.round((${y1} - ${y0}) * k)).data;
  const w = Math.round((${x1} - ${x0}) * k);
  let count = 0, top = null;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] === R && d[i + 1] === G && d[i + 2] === B) {
      count++;
      const vy = (Math.floor(i / 4 / w)) / k + ${y0};
      if (top === null || vy < top) top = vy;
    }
  }
  return { count, top };
})()`;

async function leg(w, h, tag) {
  // A REAL FRESH PROFILE (empty storage, no seeded run count — the owner's own
  // cleared-data test): since 56e1a93 the gate is ON, so run #1 arms the
  // prologue AUTOMATICALLY — the exact path a new player hits. (The deliberate
  // REPLAY TOUR path exercises the same phase and stays pinned in
  // tools/verify_onboarding_surface.mjs and test_replay_tour.mjs.)
  await withPage({ w, h, dpr: 3, mobile: true, skipPrologue: false, skipTour: false,
    startupScript: `try { localStorage.clear(); } catch (e) {}` },
  async (p) => {
    await p.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
    await p.waitFor(tx("t.state.mode !== 'intro'"), 15000);
    await p.sleep(300);
    await clickCard(p, 'START GAME');
    await p.sleep(300);
    await clickCard(p, 'GOT IT');   // the fresh-profile reference gate, if it opened
    await p.waitFor(tx("t.state.mode === 'playing' && t.prologue.active === true"), 20000);
    // The phase self-walks; banner 1 rises after BANNER_WALK_S.
    const up = await p.waitFor(tx("t.prologue.paused === true"), 8000, 100);
    ok(up, '[' + tag + '] the prologue is armed and a banner is UP (walk cadence met)');

    const seam = await p.evaluate(tx('t.renderer.hudChrome'));
    ok(seam && seam.prologueHud === true,
      '[' + tag + '] seam: the suppression flag is live (prologueHud)');
    ok(seam.hpText === undefined && seam.mpText === undefined && seam.xpText === undefined,
      '[' + tag + '] seam: no HP/MP/XP values painted under the card');
    ok(seam.purse && typeof seam.purse.text === 'string' && seam.clock && seam.clock.text,
      '[' + tag + '] seam: the purse and the run clock still paint (they never shared the band)');

    // PIXELS — the suppressed zones carry no bar ink.
    const hp = await p.evaluate(scanRegion(20, 13, 136, 36, '#ff5566'));
    ok(hp.count === 0, '[' + tag + '] pixels: NO HP-fill ink in the HP/MP zone (' + hp.count + ' px)');
    const mp = await p.evaluate(scanRegion(20, 24, 136, 36, '#4a8cff'));
    ok(mp.count === 0, '[' + tag + '] pixels: NO MP-fill ink in the MP row (' + mp.count + ' px)');
    const xp = await p.evaluate(scanRegion(4, 32, 88, 49, '#ffd75e'));
    ok(xp.count === 0, '[' + tag + '] pixels: NO XP-gold ink in the XP/LV zone (' + xp.count + ' px)');
    const purse = await p.evaluate(scanRegion(6, 52, 66, 67, '#ffd75e'));
    ok(purse.count > 0, '[' + tag + '] pixels: the purse badge STILL paints (' + purse.count + ' gold px)');

    // The card vs the kept readouts: rect math on the shared seam.
    const rects = await p.evaluate(`(async () => {
      const R = await import('./src/render.js');
      const C = (await import('./src/config.js')).CONFIG;
      const card = R.prologueCardRect();
      const cw = '00:00'.length * Math.round(C.HUD.CLOCK_PX * 0.62) + 4;
      const clockLeft = (C.VIEW_W - 24 + 2 - cw) - 2;
      return { card, clockLeft, skip: R.prologueSkipRect(), feedY: R.prologueFeedY(),
        vw: C.VIEW_W, vh: C.VIEW_H }; })()`);
    ok(rects.clockLeft - (rects.card.x + rects.card.w) >= 8,
      '[' + tag + '] the card clears the run clock by >= 8px (' +
      (rects.clockLeft - rects.card.x - rects.card.w) + 'px)');
    ok(rects.skip.x >= rects.card.x + rects.card.w + 2,
      '[' + tag + '] the SKIP corner clears the card (' + rects.skip.x + ' vs ' +
      (rects.card.x + rects.card.w) + ')');
    ok(rects.card.x >= 0 && rects.card.y >= 0 &&
      rects.card.x + rects.card.w <= rects.vw && rects.card.y + rects.card.h <= rects.vh,
      '[' + tag + '] the card is fully inside the view');

    // A REAL tap on the SKIP corner arms the two-tap skip -> the confirm toast
    // lands in the RELOCATED feed (below the card, never under it).
    const skCss = await p.evaluate(tx(`(() => {
      const r = t.prologue.skipRect();
      const b = document.getElementById('game').getBoundingClientRect();
      return { x: b.left + (r.x + r.w / 2) * (b.width / 480),
               y: b.top + (r.y + r.h / 2) * (b.height / 300) }; })()`));
    await p.tap(skCss.x, skCss.y, 1);
    await p.sleep(400);
    const toastLive = await p.evaluate(tx("t.state.toasts.some(x => /SKIP/.test(x.msg))"));
    ok(toastLive, '[' + tag + '] the real SKIP tap fired the confirm toast (feed is live mid-banner)');
    // Feed text ink (#e4e4ee, the default tint) must appear ONLY at or below
    // the relocated feed line — never in the card band or the 8px gap.
    const band = await p.evaluate(scanRegion(5, 20, 88, rects.feedY - 1, '#e4e4ee'));
    ok(band.count === 0,
      '[' + tag + '] pixels: NO feed ink above the relocated feed line (' + band.count + ' px)');
    const feed = await p.evaluate(scanRegion(5, rects.feedY, 280, rects.feedY + 40, '#e4e4ee'));
    ok(feed.count > 0,
      '[' + tag + '] pixels: the feed DOES paint at the relocated line (' + feed.count +
      ' px, top y=' + (feed.top === null ? 'n/a' : feed.top.toFixed(1)) + ')');

    const shot = await p.shot('prologue-clearance-' + tag);
    copyFileSync(shot, ART + '/prologue-clearance-' + tag + '.png');
    ok(true, '[' + tag + '] shot: banner up, toast live, readouts hidden (prologue-clearance-' + tag + '.png)');

    // The second tap skips; the potion sequence runs to its drink and the
    // HUD readouts come back byte-identically.
    await p.tap(skCss.x, skCss.y, 1);
    await p.sleep(300);
    const skipped = await p.evaluate(tx("t.state.prologue && t.state.prologue.skipped === true"));
    ok(skipped, '[' + tag + '] the second SKIP tap skipped (the two-tap contract intact)');
    const drank = await p.waitFor(tx('t.prologue.active === false'), 30000, 250);
    ok(drank, '[' + tag + '] the potion sequence ran to its drink after the skip');
    const seam2 = await p.evaluate(tx('t.renderer.hudChrome'));
    ok(seam2 && seam2.prologueHud === undefined && typeof seam2.hpText === 'string' &&
      typeof seam2.mpText === 'string' && typeof seam2.xpText === 'string',
      '[' + tag + '] RESTORED: the suppression lifted at phase end (values back)');
    const hp2 = await p.evaluate(scanRegion(22, 16, 132, 21, '#ff5566'));
    ok(hp2.count > 0, '[' + tag + '] pixels: HP fill is BACK on the bar (' + hp2.count + ' px)');

    const errors = p.errors;
    if (errors.length) { console.log('[' + tag + '] PAGE ERRORS: ' + errors.join(' | ').slice(0, 300)); fails++; }
    else ok(true, '[' + tag + '] zero console errors');
  });
}

await leg(390, 844, '390x844');
await leg(320, 568, '320x568');
console.log(fails ? 'FAILURES: ' + fails : 'verify_prologue_clearance: ALL CHECKS PASSED');
process.exit(fails ? 1 : 0);
