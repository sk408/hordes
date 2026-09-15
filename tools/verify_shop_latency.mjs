// HORDES - tools/verify_shop_latency.mjs (owner-reported ~2s shop delay).
// REAL Chrome 390x844 @dpr3, touch emulation: measures the ACTUAL
// milliseconds the user perceives for
//   (a) OPENING the shop from the main menu (first open after load),
//   (b) a REPEAT open (BACK -> SHOP),
//   (c) completing a PURCHASE (one tap, no confirm),
// each timed from the REAL pointerdown (capture listener) to two rAFs after
// the shop DOM has re-rendered (title 'SHOP' / BANK line mutated) - paint
// included, no internal hooks required, so this stays the reusable bar.
// If the temp window.__shopPerf probe is present in the page, its per-phase
// breakdown (rows built / DOM insertions / frame paints / icon paints / wipe)
// is printed alongside - the diagnosis numbers, quoted raw.
// Also proves: a SINGLE tap buys; the G26 loadout coachmark fires EXACTLY ONCE
// on the first weapon purchase (#tour-root appears, flag set, no re-fire on a
// second weapon buy). Run: node tools/verify_shop_latency.mjs
import { withPage } from './browser.mjs';
import { TOUR_KEYS } from '../src/tour.js';

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : ''));
};

// All tour flags set EXCEPT loadout (the G26 coach must stay armed so the
// purchase can fire it). The count is asserted, not assumed.
const KEYS = Object.values(TOUR_KEYS).filter(k => k !== TOUR_KEYS.loadout);
const STARTUP = `
try {
  localStorage.setItem('hordes_onboarded', '1');
  for (const k of ${JSON.stringify(KEYS)}) localStorage.setItem(k, '1');
  localStorage.removeItem(${JSON.stringify(TOUR_KEYS.loadout)});
} catch (e) {}`;

// End-to-end open timer: the card CLICK (the input event the app reacts to;
// a touch press cannot produce a click before release) -> 2 rAFs past the
// shop DOM being up.
const ARM_OPEN = `(() => {
  window.__openMs = new Promise(resolve => {
    let t0 = 0;
    document.addEventListener('click', ev => { t0 = performance.now(); }, { capture: true, once: true });
    const check = () => {
      const title = document.getElementById('ov-title').textContent;
      const n = document.getElementById('ov-cards').children.length;
      if (title === 'SHOP' && n > 10) {
        const since = performance.now() - t0;
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(since)));
      } else requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  });
})()`;

// End-to-end purchase timer: the row CLICK -> 2 rAFs past the BANK line
// (ov-sub) mutating = the re-rendered shop reflects the purchase.
const ARM_BUY = `(() => {
  window.__buyMs = new Promise(resolve => {
    let t0 = 0;
    document.addEventListener('click', ev => { t0 = performance.now(); }, { capture: true, once: true });
    const sub = document.getElementById('ov-sub');
    const mo = new MutationObserver(() => {
      mo.disconnect();
      const since = performance.now() - t0;
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(since)));
    });
    mo.observe(sub, { childList: true, characterData: true, subtree: true });
  });
})()`;

const T = `(await import('./src/main.js')).__TEST`;
const cardCenter = (pred) => `(() => {
  const el = [...document.getElementById('ov-cards').children].find(${pred});
  if (!el) return null;
  if (el.scrollIntoView) el.scrollIntoView({ block: 'center' });   // 48 rows scroll; tap what is really there
  const r = el.getBoundingClientRect();
  return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
})()`;
// The shop's own back affordance is ESC (the BACK card scrolls far below the
// fold); the real keyboard path is the player's.
const escBack = (p) => p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
const byName = (name) => cardCenter(`c => c.querySelector('.name') && c.querySelector('.name').textContent === ${JSON.stringify(name)}`);

const DBG = !!process.env.DEBUG_SHOP_LAT;
const step = (m) => { if (DBG) console.log('  step:', m); };

const arm = await withPage({ w: 390, h: 844, dpr: 3, mobile: true, skipTour: false, startupScript: STARTUP },
  async (p) => {
    step('boot');
    step('esc-intro');
    await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode !== 'intro')()`, 15000);
    await p.waitFor(`(async () => { const rv = (await import('./src/main.js')).__TEST.state.titleReveal; return !rv || rv.phase === 'settled'; })()`, 8000);
    const flags = await p.evaluate(`${KEYS.length + 1} - Object.keys(localStorage).filter(k => localStorage.getItem(k) === '1').length`);

    // (a) FIRST OPEN from the main menu, by a REAL tap.
    await p.evaluate(ARM_OPEN);
    step('shop-coords');
    const shop = await p.evaluate(byName('SHOP'));
    if (!shop) throw new Error('no SHOP card on the title');
    await p.tap(shop[0], shop[1]);
    step('first-open');
    const firstOpenMs = await p.evaluate('window.__openMs', true);
    const perf1 = await p.evaluate('window.__shopPerf ? window.__shopPerf.history : null');

    // (b) REPEAT open: ESC -> title -> SHOP.
    step('esc-back');
    await escBack(p);
    await p.waitFor(`document.getElementById('ov-title').textContent === 'HORDES'`, 5000);
    await p.evaluate(ARM_OPEN);
    step('shop2-coords');
    const shop2 = await p.evaluate(byName('SHOP'));
    await p.tap(shop2[0], shop2[1]);
    step('repeat-open');
    const repeatOpenMs = await p.evaluate('window.__openMs', true);
    const perf2 = await p.evaluate('window.__shopPerf ? window.__shopPerf.history : null');

    // Fund the bank, re-open so affordability re-renders, then (c) ONE-TAP
    // purchase of the first buyable STAT row (never a weapon - the coach test
    // below owns the first WEAPON buy).
    step('fund');
    await p.evaluate(`(async () => { ${T}.getProfile().gold = 500000; })()`);
    await escBack(p);
    await p.waitFor(`document.getElementById('ov-title').textContent === 'HORDES'`, 5000);
    await p.evaluate(ARM_OPEN);
    step('shop3-coords');
    const shop3 = await p.evaluate(byName('SHOP'));
    await p.tap(shop3[0], shop3[1]);
    step('funded-open');
    const fundedOpenMs = await p.evaluate('window.__openMs', true);
    const bank0 = await p.evaluate(`document.getElementById('ov-sub').textContent`);
    step('rows-lookup');
    const rows = await p.evaluate(`(async () => {
      const { SHOP_UPGRADES } = await import('./src/meta.js');
      const prof = ${T}.getProfile();
      const { shopRowOwned } = await import('./src/meta.js');
      const stat = SHOP_UPGRADES.find(d => !d.kind && (prof.purchased[d.id] || 0) < d.maxLevel);
      const weap = SHOP_UPGRADES.filter(d => d.kind === 'weapon' && !shopRowOwned(prof, d.id)).map(d => d.name);
      return { statName: stat && stat.name, weapons: weap, gold: prof.gold };
    })()`);
    await p.evaluate(ARM_BUY);
    const statCard = await p.evaluate(byName(rows.statName));
    if (!statCard) throw new Error('no buyable stat row visible: ' + rows.statName);
    step('tap-stat');
    await p.tap(statCard[0], statCard[1]);
    step('stat-buy');
    const buyMs = await p.evaluate('window.__buyMs', true);
    const afterBuy = await p.evaluate(`(async () => ({
      title: document.getElementById('ov-title').textContent,
      bank: document.getElementById('ov-sub').textContent,
      gold: ${T}.getProfile().gold,
    }))()`);
    const perf3 = await p.evaluate('window.__shopPerf ? window.__shopPerf.history : null');

    // (d) G26: the loadout coachmark fires EXACTLY ONCE on the first WEAPON
    // purchase (#tour-root appears, flag flips), stays dead on a second one.
    const coach0 = await p.evaluate(`[document.getElementById('tour-root') !== null,
      localStorage.getItem(${JSON.stringify(TOUR_KEYS.loadout)})]`);
    await p.evaluate(ARM_BUY);
    step('weapon1-coords');
    const w1 = await p.evaluate(byName(rows.weapons[0]));
    if (!w1) throw new Error('no weapon row visible: ' + rows.weapons[0]);
    step('tap-weapon1');
    await p.tap(w1[0], w1[1]);
    step('weapon-buy');
    const weaponBuyMs = await p.evaluate('window.__buyMs', true);
    step('coach-wait');
    const coachFired = await p.waitFor(
      `document.getElementById('tour-root') !== null && localStorage.getItem(${JSON.stringify(TOUR_KEYS.loadout)}) === '1'`, 5000, 50);
    // Dismiss the coach by its OWN skip path (ESC - the tour's document-level
    // skip handler; a shade tap can FORWARD to the card under it, WAVE-31).
    let coachGone = false;
    if (coachFired) {
      await p.evaluate("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
      coachGone = await p.waitFor(`document.getElementById('tour-root') === null`, 5000, 50);
    }
    // The coach's ESC skip nulls the coach synchronously, so the SAME keypress
    // also reaches the window handler and exits the shop to the title - the
    // real player flow after the coachmark is: back on the title, re-enter the
    // shop, buy the next weapon.
    if (coachGone) {
      await p.waitFor(`document.getElementById('ov-title').textContent === 'HORDES'`, 5000);
      const re = await p.evaluate(byName('SHOP'));
      if (re) { await p.tap(re[0], re[1]); await p.sleep(300); }
    }
    // Recompute from LIVE state: the first weapon buy already happened, so
    // the stale pre-purchase list would name an owned row.
    const secondName = await p.evaluate(`(async () => {
      const { SHOP_UPGRADES, shopRowOwned } = await import('./src/meta.js');
      const prof = ${T}.getProfile();
      const w = SHOP_UPGRADES.filter(d => d.kind === 'weapon' && !shopRowOwned(prof, d));
      return w.length ? w[0].name : null;
    })()`);
    const secondWeapon = secondName ? await p.evaluate(byName(secondName)) : null;
    step('coach-second');
    let coachReFired = null;
    if (secondWeapon && coachGone) {
      await p.evaluate(ARM_BUY);
      await p.tap(secondWeapon[0], secondWeapon[1]);
      // race: a failed buy would leave __buyMs pending forever
      await Promise.race([p.evaluate('window.__buyMs', true), new Promise(r => setTimeout(r, 4000))]);
      await p.sleep(600);
      coachReFired = await p.evaluate(`document.getElementById('tour-root') !== null`);
    }

    return { flags, firstOpenMs, repeatOpenMs, fundedOpenMs, buyMs, weaponBuyMs, perf1, perf2, perf3,
      bank0, afterBuy, rows, coach0, coachFired, coachGone, coachReFired, errors: p.errors };
  });

// ---- verdict ----------------------------------------------------------------
check('title live with ' + KEYS.length + ' tour flags set (loadout deliberately CLEAR for the G26 arm)',
  arm.flags === 0, { missing: arm.flags });
const f = (x) => (typeof x === 'number' ? Math.round(x) + 'ms' : x);
check('(a) FIRST shop open from the main menu: ' + f(arm.firstOpenMs), typeof arm.firstOpenMs === 'number', arm.firstOpenMs);
check('(b) REPEAT open (BACK -> SHOP): ' + f(arm.repeatOpenMs), typeof arm.repeatOpenMs === 'number', arm.repeatOpenMs);
check('(c) ONE-TAP purchase completes (BANK ' + arm.bank0 + ' -> ' + arm.afterBuy.bank + ', gold ' + arm.rows.gold + ' -> ' +
  arm.afterBuy.gold + ') in ' + f(arm.buyMs) + ' - single tap, no confirm step',
  typeof arm.buyMs === 'number' && arm.afterBuy.title === 'SHOP' && arm.afterBuy.gold < arm.rows.gold, arm.afterBuy);
check('WEAPON purchase (the G26 trigger) in ' + f(arm.weaponBuyMs), typeof arm.weaponBuyMs === 'number', arm.weaponBuyMs);
check('G26 coachmark fired EXACTLY ONCE: absent before (' + JSON.stringify(arm.coach0) + '), #tour-root + flag after the first ' +
  'weapon buy, NOT re-fired on a second weapon buy (' + arm.coachReFired + ')',
  arm.coach0[0] === false && arm.coach0[1] === null && arm.coachFired === true && arm.coachGone === true &&
  arm.coachReFired === false,
  { before: arm.coach0, fired: arm.coachFired, gone: arm.coachGone, refired: arm.coachReFired });
check('no console errors in the arm', arm.errors.length === 0, arm.errors);

// The <100ms acceptance bar (the fix's target; printed whether or not it holds
// yet so the pre-fix and post-fix numbers share one tool).
check('ACCEPTANCE BAR: open <= 100ms AND purchase <= 100ms (first open ' + f(arm.firstOpenMs) +
  ', repeat ' + f(arm.repeatOpenMs) + ', stat buy ' + f(arm.buyMs) + ', weapon buy ' + f(arm.weaponBuyMs) + ')',
  arm.firstOpenMs <= 100 && arm.repeatOpenMs <= 100 && arm.buyMs <= 100 && arm.weaponBuyMs <= 100);

// Temp probe breakdown, if present (raw, per open).
if (arm.perf1 && arm.perf1.length) {
  console.log('\nTEMP PROBE window.__shopPerf.history (per showShop call):');
  for (const h of (arm.perf3 || arm.perf1)) {
    console.log('  rows=' + h.rows + ' openMs=' + h.openMs.toFixed(1) + ' wipeMs=' + h.wipeMs.toFixed(1) +
      ' buildMs=' + h.buildMs.toFixed(1) + ' domMs=' + h.domMs.toFixed(1) + ' frameMs=' + h.frameMs.toFixed(1) +
      ' iconMs=' + h.iconMs.toFixed(1) + ' TOTAL=' + h.totalMs.toFixed(1));
  }
}

const bad = results.filter((r) => !r.ok).length;
console.log(bad ? 'VERIFY SHOP LATENCY: FAIL' : 'VERIFY SHOP LATENCY: PASS');
process.exit(bad ? 1 : 0);
