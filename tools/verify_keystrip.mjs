// HORDES - tools/verify_keystrip.mjs (R9 "keys": the desktop key strip can be
// shown and hidden, and the game remembers the choice). Real headless Chrome.
//   1280x720, a veteran profile (12 finished runs), real mouse clicks:
//     - the strip starts folded into the corner KEYS chip
//     - a click on KEYS: the strip is up, no help mode, the clock runs, the
//       held D key is still held, the frame at the toggle is measured
//     - clicks on PILOT, FOCUS and STANCE each change the chip's value
//     - every chip is whole at 1280, 1100, 930, 825 and 800 px wide
//     - a click on HIDE folds it; a reload remembers HIDDEN; KEYS, a reload
//       remembers SHOWN
//     - the SETTINGS row (first page) reads and cycles the choice
//     - the ? key: help mode raises the strip, ? again returns to the choice
//   390x844 with touch: no strip, no row, the pads as before.
//   0 console errors. Ends ALL OK.
// The run is held steady (no level-up draft, no death), so every check sees a
// live fight and the strip on screen, whatever the timing.
// Run: HORDES_CHROME=<chrome> node tools/verify_keystrip.mjs [shotDir]
import path from 'node:path';

if (process.argv[2]) process.env.HORDES_SHOT_DIR = path.resolve(process.argv[2]);
const { withPage } = await import('./browser.mjs');

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok });
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : ''));
};
const VETERAN = "try { localStorage.setItem('hordes_onboarded', '1'); localStorage.setItem('hordes_profile_v1', JSON.stringify({ version: 8, lastPlayed: Date.now(), achievements: { totals: { runs: 12 } } })); } catch (e) {}";
const BOOTED = "(async () => { const T = (await import('./src/main.js')).__TEST; return T && T.state && T.state.mode === 'title' && (!T.state.titleReveal || T.state.titleReveal.phase === 'settled'); })()";
const START = `(async () => {
  const T = (await import('./src/main.js')).__TEST;
  window.__T = T;
  for (const e of document.querySelectorAll('.wn-over')) e.remove();
  T.banners && T.banners.suppressAll && T.banners.suppressAll();
  T.setPilotMode('AUTO_ALL');
  T.auto.on = false;
  T.startRun();
  return true;
})()`;
// No level-up draft and no death: a draft takes the strip off screen.
const STEADY = `(() => { const p = window.__T.state.player; p.xpNext = 1e12; p.xp = 0; p.hp = 1e6; p.invuln = 1e6; return true; })()`;
const LIVE = "window.__T.state.mode === 'playing' && !!window.__T.state.player";
// The canvas and the strip (the canvas keeps its shape, so on a narrow
// window it may end above the strip, never under it).
const FIT = `(() => {
  const cv = document.querySelector('canvas').getBoundingClientRect();
  const bar = document.getElementById('keybar').getBoundingClientRect();
  return { cvH: Math.round(cv.height), cvBottom: Math.round(cv.bottom), barTop: Math.round(bar.top), barH: Math.round(bar.height) };
})()`;
const PLAYING = "window.__T && window.__T.state.mode === 'playing' && window.__T.state.time > 0.5";
const folded = "document.getElementById('touch').classList.contains('kb-min')";
const stored = "localStorage.getItem('hordes_keystrip')";
// Every visible chip of the strip, whole inside the strip and the window.
const WHOLE = `(() => {
  const bar = document.getElementById('keybar').getBoundingClientRect();
  const out = { bar: [Math.round(bar.left), Math.round(bar.right), Math.round(bar.width), Math.round(bar.height)], clipped: [], chips: [] };
  for (const b of document.querySelectorAll('#keybar > button')) {
    const cs = getComputedStyle(b);
    if (cs.display === 'none') continue;
    const r = b.getBoundingClientRect();
    const name = b.textContent.trim();
    out.chips.push(name);
    if (r.left < bar.left - 0.5 || r.right > bar.right + 0.5 || r.left < 0 || r.right > innerWidth ||
        b.scrollWidth > b.clientWidth + 1) out.clipped.push(name);
  }
  // The HIDE chip must be measured, not just present: a real size on screen.
  const hr = document.getElementById('kb-hide').getBoundingClientRect();
  out.hideRect = [Math.round(hr.left), Math.round(hr.top), Math.round(hr.width), Math.round(hr.height)];
  out.hide = hr.width > 8 && hr.height > 8 && hr.right <= bar.right + 0.5 && hr.left >= 0;
  out.measured = bar.width > 0 && bar.height > 0 && out.chips.length >= 8;
  return out;
})()`;

// ---- desktop ----------------------------------------------------------------
await withPage({ w: 1280, h: 720, dpr: 1, mobile: false, startupScript: VETERAN }, async (pg) => {
  const { evaluate, waitFor, shot, click, key, rectOf, sleep, reload, setViewport, server } = pg;
  const startRun = async () => {
    check('boot to the title', await waitFor(BOOTED, 20000));
    await evaluate(START);
    check('a run is playing', await waitFor(PLAYING, 15000));
    await evaluate(STEADY);
  };
  const live = async (what) => check(what + ': the fight is live (no draft, no pause)', await waitFor(LIVE, 3000), await evaluate('window.__T.state.mode'));
  await startRun();
  check('the profile is a veteran', (await evaluate('window.__T.state.runsBefore')) >= 3, await evaluate('window.__T.state.runsBefore'));
  check('no stored choice yet, the strip is folded', await waitFor(folded, 3000) && (await evaluate(stored)) === null);
  await sleep(1500);
  await shot('desk-1280-folded');

  // Hold D (manual steer) through the toggle; record frame times.
  await evaluate("window.__T.setPilotMode('MANUAL'), true");
  await evaluate(`(() => {
    window.__ft = []; let last = performance.now();
    const f = (t) => { window.__ft.push(t - last); last = t; if (window.__ftOn) requestAnimationFrame(f); };
    window.__ftOn = true; requestAnimationFrame(f); return true;
  })()`);
  await evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' })), true");   // held: no keyup until after the toggle
  await sleep(400);
  const heldBefore = await evaluate('window.__T.pilotInput.right === true');
  const before = await evaluate(`({ pilot: document.getElementById('kb-pilot').textContent, focus: window.__T.state.focus, stance: window.__T.state.stance, t: window.__T.state.time, n: window.__ft.length })`);
  const more = await rectOf('#kb-more');
  check('the corner chip is on screen', more && more[2] > 20 && more[3] > 14, more);
  const label = await evaluate("(() => { const e = document.getElementById('kb-more'); const a = e.querySelector('.kb-arrow.up'); return e.textContent.trim() + (a && a.getBoundingClientRect().width > 0 ? ' +up-arrow' : ''); })()");
  check('the corner chip reads KEYS with an up arrow (no ?)', label === 'KEYS +up-arrow', label);
  const fit0 = await evaluate(FIT);
  await click(more[0], more[1]);
  await sleep(600);
  const fit1 = await evaluate(FIT);
  check('the canvas refits: smaller with the strip up, ending where the strip begins',
    fit1.cvH < fit0.cvH && fit1.barH > 20 && Math.abs(fit1.cvBottom - fit1.barTop) <= 1, { folded: fit0, shown: fit1 });
  const after = await evaluate(`({ pilot: document.getElementById('kb-pilot').textContent, focus: window.__T.state.focus, stance: window.__T.state.stance, t: window.__T.state.time, help: !!window.__T.state.helpMode, mode: window.__T.state.mode })`);
  check('a click on KEYS: the strip is up', !(await evaluate(folded)));
  check('no help mode, not paused, the clock runs', !after.help && after.mode === 'playing' && after.t > before.t + 0.3, { before: before.t, after: after.t, help: after.help, mode: after.mode });
  check('the click fired nothing else', after.focus === before.focus && after.stance === before.stance, { before, after });
  check('the held D key is still held', heldBefore && (await evaluate('window.__T.pilotInput.right === true')));
  await evaluate("window.dispatchEvent(new KeyboardEvent('keyup', { key: 'd' })), true");
  const ft = await evaluate(`(() => { window.__ftOn = false; return window.__ft; })()`);
  const pre = ft.slice(Math.max(0, before.n - 20), before.n).sort((a, b) => a - b);
  const med = pre[Math.floor(pre.length / 2)] || 16.7;
  const at = ft.slice(before.n, before.n + 10);
  const worst = Math.max(...at);
  check('no hitch at the toggle (worst frame after the click <= max(3x median, 50 ms))', worst <= Math.max(3 * med, 50), { median: +med.toFixed(1), worstAfter: +worst.toFixed(1), frames: at.map(x => +x.toFixed(1)) });
  check('remembered: shown', (await evaluate(stored)) === 'shown');
  await evaluate("window.__T.setPilotMode('AUTO_ALL'), true");
  await sleep(300);

  // PILOT, FOCUS, STANCE: a click each changes the value, the clock runs.
  for (const [act, id] of [['pilot', 'kb-pilot'], ['focus', 'kb-focus'], ['stance', 'kb-stance']]) {
    const v0 = await evaluate(`document.getElementById('${id}').textContent`);
    const t0 = await evaluate('window.__T.state.time');
    const r = await rectOf(`#keybar button[data-act="${act}"]`);
    await click(r[0], r[1]);
    await sleep(350);
    const v1 = await evaluate(`document.getElementById('${id}').textContent`);
    const t1 = await evaluate('window.__T.state.time');
    check(act.toUpperCase() + ' chip changes its value while the clock runs', v1 !== v0 && t1 > t0, { from: v0, to: v1, t0, t1 });
  }
  await evaluate("window.__T.setPilotMode('AUTO_ALL'), true");
  await sleep(800);
  await shot('desk-1280-shown');

  // Every width from 800 up: every chip whole, HIDE among them.
  await live('before the widths');
  for (const w of [1280, 1100, 930, 825, 800]) {
    await setViewport(w, 720);
    await sleep(350);
    const r = await evaluate(WHOLE);
    const f = await evaluate(FIT);
    check(w + ' px: the strip is measured, every chip whole, HIDE whole', r.measured && r.hide && r.clipped.length === 0, r);
    check(w + ' px: the canvas stays clear of the strip', f.barH > 20 && f.cvBottom <= f.barTop + 1, f);
    await shot('strip-' + w);
  }
  await setViewport(1280, 720);
  await sleep(300);

  // HIDE folds it.
  await live('before HIDE');
  const fit2 = await evaluate(FIT);
  const hide = await rectOf('#kb-hide');
  check('the HIDE chip is on screen', hide && hide[2] > 8 && hide[3] > 8, hide);
  const hideLabel = await evaluate("(() => { const e = document.getElementById('kb-hide'); const a = e.querySelector('.kb-arrow.dn'); return e.textContent.trim() + (a && a.getBoundingClientRect().width > 0 ? ' +down-arrow' : ''); })()");
  check('the hide chip reads HIDE with a down arrow', hideLabel === 'HIDE +down-arrow', hideLabel);
  await click(hide[0], hide[1]);
  await sleep(300);
  check('a click on HIDE folds the strip and remembers it', (await evaluate(folded)) && (await evaluate(stored)) === 'hidden');
  const fit3 = await evaluate(FIT);
  check('the canvas takes the band back', fit3.cvH > fit2.cvH, { shown: fit2, folded: fit3 });
  check('the ready line rides the vitals block', /^Q \S+  E \S+  H \d+  N \d+$/.test(await evaluate('window.__T.state.readyRow')), await evaluate('window.__T.state.readyRow'));

  // ? key: help mode shows the strip; ? again returns to the choice (HIDDEN).
  await key('?');
  await sleep(250);
  check('? : help mode, the strip is up', (await evaluate('!!window.__T.state.helpMode')) && !(await evaluate(folded)));
  await shot('desk-1280-help');
  await key('?');
  await sleep(250);
  check('? again: back to HIDDEN', !(await evaluate('!!window.__T.state.helpMode')) && (await evaluate(folded)));

  // Reload: HIDDEN is remembered.
  await reload();
  await startRun();
  await sleep(500);
  check('after a reload: still HIDDEN', (await evaluate(stored)) === 'hidden' && (await evaluate(folded)));
  // At 800 px the HIDE chip lands where KEYS was: a slow double click (520 ms,
  // inside the Windows double-click time) must not hide the strip again.
  await setViewport(800, 600);
  await sleep(400);
  await live('the slow double click');
  const more2 = await rectOf('#kb-more');
  await click(more2[0], more2[1]);
  await sleep(520);
  const under = await evaluate(`(() => { const e = document.elementFromPoint(${more2[0]}, ${more2[1]}); const b = e && e.closest('[data-act]'); return b ? b.dataset.act : null; })()`);
  await click(more2[0], more2[1]);
  await sleep(300);
  check('KEYS again: shown, and a second click 520 ms later on the same spot keeps it', !(await evaluate(folded)) && (await evaluate(stored)) === 'shown', { underTheCursor: under });
  await setViewport(1280, 720);
  await sleep(300);
  await reload();
  await startRun();
  await sleep(500);
  check('after a reload: still SHOWN, in a veteran run', (await evaluate(stored)) === 'shown' && !(await evaluate(folded)));
  await live('before the settings row');

  // SETTINGS row: first page, reads its state, a real click cycles it.
  await key('Escape');
  check('ESC opens settings', await waitFor("window.__T.state.mode === 'settings'", 3000));
  const rowText = "(() => { const c = [...document.querySelectorAll('#ov-cards .card')].find(e => /KEY STRIP/.test(e.textContent)); return c ? c.textContent : null; })()";
  const rowRect = "(() => { const c = [...document.querySelectorAll('#ov-cards .card')].find(e => /KEY STRIP/.test(e.textContent)); if (!c) return null; c.scrollIntoView({ block: 'center' }); const r = c.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, r.width, r.height]; })()";
  const t0 = await evaluate(rowText);
  check('the row is on the first settings page and reads SHOWN', /KEY STRIP: SHOWN/.test(t0 || ''), t0);
  await shot('settings-row-shown');
  let rr = await evaluate(rowRect);
  await click(rr[0], rr[1]);
  await sleep(250);
  const t1 = await evaluate(rowText);
  check('a click: HIDDEN, in plain words', /KEY STRIP: HIDDEN/.test(t1 || '') && /corner/.test(t1 || '') && (await evaluate(stored)) === 'hidden', t1);
  await shot('settings-row-hidden');
  rr = await evaluate(rowRect);
  await click(rr[0], rr[1]);
  await sleep(250);
  check('again: SHOWN', /KEY STRIP: SHOWN/.test((await evaluate(rowText)) || '') && (await evaluate(stored)) === 'shown');
  await key('Escape');
  await waitFor("window.__T.state.mode === 'playing'", 3000);
  if ((await evaluate('window.__T.state.mode')) === 'settings') await key('Escape');
  await sleep(300);
  check('back in the fight with the strip up', (await evaluate("window.__T.state.mode")) === 'playing' && !(await evaluate(folded)));
  check('1280x720: 0 console errors', pg.errors.length === 0, pg.errors.slice(0, 5));
  void server;
});

// ---- phone ------------------------------------------------------------------
await withPage({ w: 390, h: 844, dpr: 3, mobile: true, startupScript: VETERAN + "try { localStorage.setItem('hordes_keystrip', 'shown'); } catch (e) {}" }, async (pg) => {
  const { evaluate, waitFor, shot, sleep, tap, rectOf } = pg;
  check('390x844: boot', await waitFor(BOOTED, 20000));
  await evaluate(START);
  check('390x844: a run is playing', await waitFor(PLAYING, 15000));
  // A first tap, the way a phone player's thumb arrives.
  await tap(195, 400);
  await sleep(500);
  const r = await evaluate(`(() => {
    const tl = document.getElementById('touch');
    const bar = document.getElementById('keybar');
    const pads = [...document.querySelectorAll('#touch .pad')].map(p => getComputedStyle(p).display);
    return { on: tl.classList.contains('on'), cog: tl.classList.contains('cog-only'),
      bar: getComputedStyle(bar).display, pads };
  })()`);
  check('390x844: the pads, no strip (even with SHOWN stored)', r.on && !r.cog && r.bar === 'none' && r.pads.every(d => d !== 'none'), r);
  await shot('phone-390-fight');
  const cog = await rectOf('#tc-cog');
  await tap(cog[0], cog[1]);
  check('390x844: SETTINGS opens', await waitFor("window.__T.state.mode === 'settings'", 3000));
  const row = await evaluate("[...document.querySelectorAll('#ov-cards .card')].some(e => /KEY STRIP/.test(e.textContent))");
  check('390x844: no KEY STRIP row', !row);
  await shot('phone-390-settings');
  check('390x844: 0 console errors', pg.errors.length === 0, pg.errors.slice(0, 5));
});

const bad = results.filter(r => !r.ok);
console.log(bad.length ? 'FAILED ' + bad.length + ' of ' + results.length : 'ALL OK (' + results.length + ' checks)');
process.exit(bad.length ? 1 : 0);
