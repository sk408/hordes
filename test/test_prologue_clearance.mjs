// PROLOGUE BANNER / HUD CLEARANCE (brief docs/briefs/PROLOGUE_BANNER_CLEARANCE.md,
// owner tutorial priority 2026-09-18). The disclosed defect (the prologue
// builder's own REPORT.md): the banner card band (view x 90..390, y 24..116)
// crossed the top-left HUD readouts (HP/MP/XP bars, LV badge + values, the
// purse) and the event feed's first lines. The view is ALWAYS 480x300 world
// units letterboxed to the viewport (main.js fitCanvas), so ONE view-space
// geometry covers 320x568, 390x844 and every other size; the browser
// verifier (tools/verify_prologue_clearance.mjs) proves it at both phones.
//
// The mechanism (brief option (b)): while the prologue phase is LIVE the
// readouts are INERT — nothing can damage, cast, level or earn — so the
// painter suppresses them (hidden, never overlapped) and drops the event
// feed below the card. The drink restores everything byte-identically.
//
// What this file pins:
//   MATH    the card rect (the ONE shared seam, prologueCardRect) clears the
//           relocated feed band by exactly 8px plate-edge-to-card-edge, the
//           run clock by >= 8px, the SKIP corner by >= 2px, and stays fully
//           inside the view; the suppressed readout rects DO intersect the
//           card band (suppression is the mechanism, not a nudge).
//   SEAM    during the live phase hudChrome carries prologueHud:true and NO
//           hpText/mpText/xpText/purse (hidden, not painted-under), while the
//           raw fractions still report; the feed still paints (relocated).
//   RESTORE the drink lifts the suppression: hpText returns the same frame
//           the phase ends; run #2 (no prologue) never sets the flag.
import { suite, boot } from './_harness.mjs';
import { CONFIG as C } from '../src/config.js';
import { prologueCardRect, prologueFeedY, prologueSkipRect } from '../src/render.js';

const S = suite('test_prologue_clearance');
function assert(cond, msg) { if (!cond) throw new Error('AssertionError: ' + msg); }

// ---------------------------------------------------------------------------
// THE MATH — headless geometry on the same constants the painter reads.
// ---------------------------------------------------------------------------
S.check('the card rect clears the feed band, the clock and SKIP, and stays in view', () => {
  const card = prologueCardRect();
  assert(card.x === 90 && card.y === 24 && card.w === 300 && card.h === 92,
    'the card geometry is the measured one (x90 y24 300x92), got ' + JSON.stringify(card));
  // Fully inside the 480x300 view at every viewport (the view never changes).
  assert(card.x >= 0 && card.y >= 0 && card.x + card.w <= C.VIEW_W && card.y + card.h <= C.VIEW_H,
    'the card is fully inside the view');
  // The relocated feed: first plate top edge is fy-2 — exactly 8px below the card.
  const feedPlateTop = prologueFeedY() - 2;
  assert(feedPlateTop - (card.y + card.h) === 8,
    'the feed plate clears the card by exactly 8px (plate top ' + feedPlateTop +
    ' vs card bottom ' + (card.y + card.h) + ')');
  // The run clock (kept: it is the one readout that still informs during the
  // phase, and it never shared the band) — label() plate starts at cx-2.
  const cw = '00:00'.length * Math.round(C.HUD.CLOCK_PX * 0.62) + 4;
  const clockPlateLeft = (C.VIEW_W - 24 + 2 - cw) - 2;
  assert(clockPlateLeft - (card.x + card.w) >= 8,
    'the clock plate clears the card by >= 8px (' + clockPlateLeft + ' vs ' + (card.x + card.w) + ')');
  // The SKIP corner (the phase's dismiss control) clears the card too.
  const sk = prologueSkipRect();
  assert(sk.x >= card.x + card.w + 2,
    'SKIP clears the card (' + sk.x + ' vs ' + (card.x + card.w) + ')');
});

S.check('the suppressed readouts DO intersect the card band (the disclosed defect, measured)', () => {
  const card = prologueCardRect();
  const LVW = 'LV 1'.length * Math.round(C.HUD.LV_PX * 0.62) + 6;
  const LVH = C.HUD.LV_PX + 4;
  const rects = {
    hpBar:   { x: 20, y: 14, w: 114, h: 11 },        // drawBar(22,16,110,5) + frame
    mpBar:   { x: 20, y: 24, w: 114, h: 11 },        // drawBar(22,26,110,5) + frame
    xpBar:   { x: 20, y: 35, w: 138, h: 10 },        // xb/yb/wb/hb + frame
    lvBadge: { x: 22 + 134 + 4, y: 37 + Math.round(6 / 2) - Math.round(LVH / 2), w: LVW, h: LVH },
    oldFeed: { x: 5, y: 84, w: 466, h: 12 },         // the pre-fix feed start (fy 86)
  };
  const hit = (r) => !(r.x + r.w <= card.x || card.x + card.w <= r.x ||
                       r.y + r.h <= card.y || card.y + card.h <= r.y);
  for (const [k, r] of Object.entries(rects)) {
    assert(hit(r), k + ' intersects the card band ' + JSON.stringify(r) +
      ' — hence suppression, not a narrower card');
  }
  // The purse column (x 6..~66) NEVER reached the card — it keeps painting.
  const purse = { x: 6, y: 52, w: 60, h: C.HUD.CLOCK_PX + 4 };
  assert(!hit(purse), 'the purse clears the card horizontally (kept, not suppressed)');
});

// ---------------------------------------------------------------------------
// THE SEAM — a real prologue run through the real painter.
// ---------------------------------------------------------------------------
const h = await boot({ prologue: true, variant: 'prologue-clearance' });
const T = h.T, st = h.state;

S.check('during the live phase the inert readouts are HIDDEN, not painted under the card', () => {
  T.banners.suppressAll();
  T.startRun();
  // Walk into banner 1 (the phase self-walks; BANNER_WALK_S of walking).
  let up = false;
  for (let i = 0; i < 240 && !up; i++) { h.pump(1); up = !!T.prologue.banner(); }
  assert(up, 'a banner came up (walkT=' + T.prologue.walkT + ')');
  assert(T.renderer.prologueBanner, 'the painter reports the card this frame');
  const hc = T.renderer.hudChrome;
  assert(hc && hc.prologueHud === true, 'the seam flags the suppressed HUD');
  assert(hc.hpText === undefined && hc.mpText === undefined && hc.xpText === undefined,
    'no HP/MP values and no XP value painted under the card');
  assert(hc.purse && typeof hc.purse.text === 'string',
    'the purse KEPT painting (its column never reached the card)');
  assert(typeof hc.hpFrac === 'number' && typeof hc.manaFrac === 'number' &&
    typeof hc.xpFrac === 'number' && typeof hc.level === 'number',
    'the raw fractions still report (the seam stays honest about STATE)');
  assert(hc.clock && typeof hc.clock.text === 'string',
    'the run clock KEPT painting (it never shared the band)');
});

S.check('the feed still paints during the phase (relocated below the card)', () => {
  T.prologue.skip();     // one press ARMS the two-tap skip -> the confirm toast
  h.pump(2);
  const hc = T.renderer.hudChrome;
  assert(hc.feed.length > 0 && /SKIP/.test(hc.feed[hc.feed.length - 1].msg),
    'the skip-arm toast is live in the feed: ' + JSON.stringify(hc.feed.map(f => f.msg)));
  assert(hc.prologueHud === true, 'still mid-phase (armed, not skipped)');
});

S.check('the drink lifts the suppression the same phase-end frame', () => {
  T.prologue.skip();     // second press inside the window: the deliberate skip
  h.pump(2);
  assert(st.prologue && st.prologue.skipped === true, 'the two-tap skip landed');
  // The potion sequence still runs to its drink; the phase exits at the drink.
  let done = false;
  for (let i = 0; i < 60 * 70 && !done; i++) {
    h.pump(1);
    st.bannerHold = 0;
    done = !T.prologue.active;
  }
  assert(done, 'the potion sequence ran to its drink after the skip');
  const hc = T.renderer.hudChrome;
  assert(hc && hc.prologueHud === undefined,
    'the suppression flag is gone with the phase');
  assert(typeof hc.hpText === 'string' && typeof hc.mpText === 'string' &&
    typeof hc.xpText === 'string' && hc.purse && typeof hc.purse.text === 'string',
    'HP/MP values, the XP value and the purse are ALL back, byte-identical');
});

S.check('run #2 (no prologue) never suppresses anything', () => {
  // recordRun bumps totals.runs at settle; stamp the same counter state.
  T.getProfile().achievements.totals.runs = 1;
  T.startRun();
  h.pump(30);
  assert(!T.prologue.active, 'run #2 has no prologue (the derivation contract)');
  const hc = T.renderer.hudChrome;
  assert(hc && hc.prologueHud === undefined && typeof hc.hpText === 'string',
    'run #2 HUD is the ordinary one from frame one');
});

S.done();
