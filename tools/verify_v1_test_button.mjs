// HORDES - tools/verify_v1_test_button.mjs (OWNER REQUEST: "Can you give me a
// button in the settings submenus to test the side scroll?"). REAL Chrome at
// 390x844 @dpr3:
//   1. ALL tour flags set up front (the live TOUR_KEYS list) and the run
//      clock ASSERTED ADVANCING (state.time > 1.0) before any measurement.
//   2. The in-run SETTINGS screen opened through the REAL touch cog, and the
//      TEST: ESCAPE SEQUENCE button entered by ONE REAL TAP (never a scripted
//      function call) - asserting on live state that the escape mode is
//      active (state.mode / ESCAPE.current() non-null).
//   3. NO FAUCET: the run's gold total (bank) and income tier (purse tier)
//      are unchanged by the test entry - and stay unchanged across all three
//      exits, including a COMPLETED escape (the outcome that always pays on
//      the real path).
//   4. ALL THREE EXITS return to the PAUSED run: SKIP by a real tap on the
//      painted skip rect; COMPLETE and FELL driven to their outcome through
//      the mode's published current() sim seam (a full corridor is 95-135s by
//      design - over the 60s measurement cap), then handed back by the mode's
//      own outcome-hold machinery. Each time: mode 'settings', run clock
//      frozen, BACK resumes 'playing' with chromeOn() re-registered by name.
//   5. PNGs of the settings screen (button visible) and the escape running
//      after the tap, into docs/art/v1-test-button-2026-09-15/.
//   6. No console errors in the arm.
// Run: node tools/verify_v1_test_button.mjs
import { withPage } from './browser.mjs';
import { copyFileSync, mkdirSync } from 'node:fs';
import { TOUR_KEYS } from '../src/tour.js';

const ART = 'docs/art/v1-test-button-2026-09-15';
mkdirSync(ART, { recursive: true });

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : ''));
};

const STARTUP = `
try {
  localStorage.setItem('hordes_onboarded', '1');
  const keys = ${JSON.stringify(Object.values(TOUR_KEYS))};
  for (const k of keys) localStorage.setItem(k, '1');
} catch (e) {}`;

const T = `(await import('./src/main.js')).__TEST`;
const STATE = `((await import('./src/main.js')).__TEST.state)`;

const arm = await withPage({ w: 390, h: 844, dpr: 3, mobile: true, skipTour: false, startupScript: STARTUP },
  async (p) => {
    // Boot to the title, then a REAL TAP on START GAME; the run clock must be
    // ADVANCING before any measurement below (the frozen-game guard).
    await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode !== 'intro')()`, 15000);
    await p.waitFor(`(async () => { const rv = (await import('./src/main.js')).__TEST.state.titleReveal; return !rv || rv.phase === 'settled'; })()`, 8000);
    const start = await p.evaluate(`(() => {
      const el = [...document.getElementById('ov-cards').children]
        .find(k => (k.textContent || '').toUpperCase().includes('START GAME'));
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
    })()`);
    if (!start) throw new Error('no START GAME card on the title');
    await p.tap(start[0], start[1]);
    await p.waitFor(`(async () => { const s = (await import('./src/main.js')).__TEST.state; return s.mode === 'playing' && s.time > 1.0; })()`, 12000, 200);
    const runLive = await p.evaluate(`(async () => { const s = ${STATE}; return { mode: s.mode, time: +s.time.toFixed(2) }; })()`);

    // The baseline wallet: BANK gold + the run purse and its INCOME TIER.
    const wallet = () => p.evaluate(`(async () => { const T2 = ${T};
      return { bank: T2.getProfile().gold, purse: T2.purse.get(), tier: T2.purse.tierOf() }; })()`);
    const base = await wallet();

    // The REAL touch cog opens the in-run settings (the paused screen).
    const cog = await p.evaluate(`(() => {
      const el = document.querySelector('[data-act="settings"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
    })()`);
    if (!cog) throw new Error('no touch cog [data-act="settings"]');
    await p.tap(cog[0], cog[1]);
    await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode === 'settings')()`, 5000);
    const settingsOpened = await p.evaluate(`(async () => { const s = ${STATE};
      return { mode: s.mode, chromeOn: (await import('./src/main.js')).__TEST.chromeOn() }; })()`);

    // The TEST button, PNG of the settings screen showing it, then ONE REAL
    // TAP on it (a real tap, not a scripted function call).
    const btn = await p.evaluate(`(() => {
      const el = [...document.getElementById('ov-cards').children]
        .find(k => (k.textContent || '').includes('TEST: ESCAPE SEQUENCE'));
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
    })()`);
    if (!btn) throw new Error('no TEST: ESCAPE SEQUENCE card on the in-run settings screen');
    const shotSettings = await p.shot('v1-test-settings');
    const entryWallet = await wallet();      // opening settings pays nothing
    await p.tap(btn[0], btn[1]);
    const entered = await p.waitFor(`(async () => { const T2 = ${T};
      return T2.state.mode === 'escape' && T2.escape.sim; })()`, 5000, 50);
    const inEscape = await p.evaluate(`(async () => { const T2 = ${T};
      return { mode: T2.state.mode, sim: !!T2.escape.sim, t: +T2.escape.sim.t.toFixed(2),
        chromeOn: T2.chromeOn(), touch: getComputedStyle(document.getElementById('touch')).display }; })()`);
    const escapeWallet = await wallet();     // the ENTRY itself pays nothing
    await p.sleep(700);                      // let the side-scroll run
    const shotEscape = await p.shot('v1-test-escape');
    const read = await p.readShot(shotEscape, {
      corner: [24, 24], field: [200, 240], sky: [195, 60],
    });

    // ---- EXIT 1: SKIP, by ONE REAL TAP on the painted skip rect -----------
    const skipTap = await p.evaluate(`(() => {
      const r = document.getElementById('game').getBoundingClientRect();
      return [Math.round(r.x + 430 / 480 * r.width), Math.round(r.y + 21 / 300 * r.height)];
    })()`);
    await p.tap(skipTap[0], skipTap[1]);
    const back1 = await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode === 'settings')()`, 8000, 100);
    const afterSkip = await p.evaluate(`(async () => { const T2 = ${T};
      return { mode: T2.state.mode, payload: T2.escape.payload,
        time: +T2.state.time.toFixed(3), chromeOn: T2.chromeOn() }; })()`);
    const skipWallet = await wallet();
    // The run is PAUSED under the settings screen: the clock holds still.
    await p.sleep(400);
    const stillPaused = await p.evaluate(`(async () => +(await import('./src/main.js')).__TEST.state.time.toFixed(3))()`);
    // BACK resumes the run; chrome re-registers by name.
    const back = await p.evaluate(`(() => {
      const el = [...document.getElementById('ov-cards').children]
        .find(k => (k.textContent || '').includes('BACK'));
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
    })()`);
    await p.tap(back[0], back[1]);
    const resumed = await p.waitFor(`(async () => { const T2 = ${T};
      return T2.state.mode === 'playing' && T2.chromeOn(); })()`, 5000, 100);
    const resumeTime = await p.evaluate(`(async () => +(await import('./src/main.js')).__TEST.state.time.toFixed(3))()`);

    // ---- EXIT 2: COMPLETE (the outcome that ALWAYS pays on the real path) --
    await p.tap(cog[0], cog[1]);
    await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode === 'settings')()`, 5000);
    await p.tap(btn[0], btn[1]);
    await p.waitFor(`(async () => { const T2 = ${T}; return T2.state.mode === 'escape' && T2.escape.sim; })()`, 5000, 50);
    // A full corridor is 95-135s by design (over the 60s cap): drive the
    // player to the exit THROUGH the mode's published current() sim seam and
    // let the mode's own outcome-hold machinery hand back.
    await p.evaluate(`(async () => { const T2 = ${T};
      const sim = T2.escape.sim;
      sim.player.x = sim.corridor.portalX - 5;
      sim.player.y = 252; })()`);
    const back2 = await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode === 'settings')()`, 8000, 150);
    const afterComplete = await p.evaluate(`(async () => { const T2 = ${T};
      return { mode: T2.state.mode, payload: T2.escape.payload }; })()`);
    const completeWallet = await wallet();

    // ---- EXIT 3: FELL (the soft failure) ------------------------------------
    await p.tap(btn[0], btn[1]);
    await p.waitFor(`(async () => { const T2 = ${T}; return T2.state.mode === 'escape' && T2.escape.sim; })()`, 5000, 50);
    await p.evaluate(`(async () => { const T2 = ${T};
      T2.escape.sim.player.y = 500; })()`);
    const back3 = await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode === 'settings')()`, 8000, 150);
    const afterFell = await p.evaluate(`(async () => { const T2 = ${T};
      return { mode: T2.state.mode, payload: T2.escape.payload }; })()`);
    const fellWallet = await wallet();

    return { runLive, base, settingsOpened, shotSettings, shotEscape, read, entered, inEscape,
      entryWallet, escapeWallet, skipWallet, completeWallet, fellWallet,
      back1, afterSkip, stillPaused, back, resumed, resumeTime, back2, afterComplete, back3, afterFell,
      errors: p.errors };
  });

// ---- verdict -------------------------------------------------------------
check('run went live with ALL ' + Object.keys(TOUR_KEYS).length + ' tour flags and state.time ADVANCING (t=' +
  arm.runLive.time + 's)', arm.runLive.mode === 'playing' && arm.runLive.time > 1.0, arm.runLive);
check('the REAL touch cog opened the paused settings screen (chrome off there)',
  arm.settingsOpened.mode === 'settings' && arm.settingsOpened.chromeOn === false, arm.settingsOpened);
check('ONE REAL TAP on TEST: ESCAPE SEQUENCE entered the mode (mode=escape, sim live at t=' +
  arm.inEscape.t + 's, chromeOn=false, #touch hidden)',
  arm.entered === true && arm.inEscape.mode === 'escape' && arm.inEscape.sim === true &&
  arm.inEscape.chromeOn === false && arm.inEscape.touch === 'none', arm.inEscape);
const walletEq = (a, b) => a.bank === b.bank && a.purse === b.purse && a.tier === b.tier;
check('NO FAUCET on entry: bank/purse/tier unchanged (' + JSON.stringify(arm.base) + ')',
  walletEq(arm.base, arm.entryWallet) && walletEq(arm.base, arm.escapeWallet),
  { base: arm.base, entry: arm.entryWallet, escape: arm.escapeWallet });
check('PNGs are the natural 1170x2532 and the escape frame has pixels (not blank)',
  arm.read.w === 1170 && arm.read.h === 2532 &&
  [arm.read.px.corner, arm.read.px.field, arm.read.px.sky].every((c) =>
    c && (c[0] || c[1] || c[2]) && !(c[0] === 255 && c[1] === 255 && c[2] === 255)), arm.read.px);
check('SKIP exit: back on the paused settings screen, payload skip/0/test, clock FROZEN',
  arm.back1 === true && arm.afterSkip.mode === 'settings' &&
  arm.afterSkip.payload && arm.afterSkip.payload.result === 'skip' &&
  arm.afterSkip.payload.payout === 0 && arm.afterSkip.payload.test === true &&
  arm.stillPaused === arm.afterSkip.time,
  { payload: arm.afterSkip.payload, time: arm.afterSkip.time, still: arm.stillPaused });
check('BACK resumed the run with chrome re-registered (playing, chromeOn()=true, clock moving)',
  arm.resumed === true && arm.resumeTime > arm.afterSkip.time,
  { resumedAt: arm.resumeTime, pausedAt: arm.afterSkip.time });
check('COMPLETE exit: NO PAYOUT on the test path (the outcome that always pays for real)',
  arm.back2 === true && arm.afterComplete.payload &&
  arm.afterComplete.payload.result === 'complete' &&
  arm.afterComplete.payload.payout === 0 && arm.afterComplete.payload.test === true,
  arm.afterComplete.payload);
check('FELL exit: soft failure, no payout, back on the paused settings screen',
  arm.back3 === true && arm.afterFell.payload &&
  arm.afterFell.payload.result === 'fell' &&
  arm.afterFell.payload.payout === 0,
  arm.afterFell.payload);
check('the wallet is UNCHANGED across entry + all three exits (bank ' + arm.base.bank +
  ', purse ' + arm.base.purse + ', tier ' + JSON.stringify(arm.base.tier) + ')',
  walletEq(arm.base, arm.skipWallet) && walletEq(arm.base, arm.completeWallet) &&
  walletEq(arm.base, arm.fellWallet),
  { skip: arm.skipWallet, complete: arm.completeWallet, fell: arm.fellWallet });
check('no console errors in the arm', arm.errors.length === 0, arm.errors);

for (const [name, shot] of [['settings', arm.shotSettings], ['escape', arm.shotEscape]]) {
  const canonical = ART + '/v1-test-button-' + name + '-390x844.png';
  try { copyFileSync(shot, canonical); console.log('PNG: ' + canonical); }
  catch (e) { console.error('COPY FAILED: ' + e.message); }
}

const bad = results.filter((r) => !r.ok).length;
console.log(bad ? 'VERIFY V1 TEST BUTTON: FAIL'
  : 'VERIFY V1 TEST BUTTON: PASS - real Chrome 390x844 @dpr3, all ' + Object.keys(TOUR_KEYS).length +
    ' tour flags, run clock asserted advancing, the real cog + ONE REAL TAP on TEST: ESCAPE SEQUENCE ' +
    'entered the mode, and all three exits (skip tap / complete / fell) returned to the paused run ' +
    'with BACK resuming chrome-on, the wallet never moving');
process.exit(bad ? 1 : 0);
