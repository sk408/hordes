// AUTO-PICK SWITCHES (owner 2026-11-17, verbatim: "I was thinking one for on
// off and one that cycles 1 to 6"). History: on 2026-09-16 the owner retired an
// INSTANT/6S/MANUAL settings row on a 'hordes_autopick' storage key, verbatim:
// "I didn't want the card choice to be instant because I wanted to slow
// progress for someone playing too idle so they dont miss the whole game and
// then complain they are too powerful when they didn't witness the growth".
// The switches keep that reason: there is no instant pick, and the default is
// the full C.AUTOPILOT.DRAFT_TIMEOUT. This file pins:
//   - the retired key is never read (a stored INSTANT changes nothing) and
//     never written; the SETTINGS screen carries no AUTO-PICK row;
//   - two switches on the draft screen in AUTO, both remembered:
//     AUTO-PICK ON/OFF [U] (OFF holds the draft) and WAIT 6s..1s [T] (steps
//     down, 1s wraps to 6s; the top step is DRAFT_TIMEOUT); stored values are
//     read at load, junk reads as the default;
//   - by default the window is the full timeout: 5.9s is not enough, ~6.0s
//     picks exactly once (the latch);
//   - a switch press restarts the open draft's countdown on the new wait;
//   - MANUAL pilot: no row, the keys do nothing, the countdown is suspended
//     (not reset) and never picks;
//   - the evolve offer follows the same switches;
//   - auto-continue with AUTO-PICK OFF: the draft waits, and the stall
//     watchdog takes it after AUTO_STALL_S; a switch press restarts that
//     watchdog too, so it never beats the countdown the row shows;
//   - the keys are bound nowhere in play: O (the pilot toggle) is ignored on
//     the draft, and U pressed just after the countdown ran out does nothing;
//   - a real evolve offer shows the row and follows both switches;
//   - a hand pick resolves the draft immediately.
// The wider auto-pick contracts (obstruction, re-arm, rng seam) stay in
// test/test_auto_draft.mjs.
// Run: node test/test_autopick_pref.mjs
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { TOUR_KEYS } from '../src/tour.js';
import { EVOLUTION_DEFS } from '../src/evolutions.js';
import { WEAPON_MAX_LEVEL } from '../src/weapons.js';

let passed = 0;
function ok(name, cond, detail) {
  if (!cond) { console.error('  FAIL ' + name + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : '')); process.exit(1); }
  passed++;
  console.log('  ok - ' + name);
}

// ---- stub DOM (test_auto_draft.mjs pattern) ----------------------------------
const noop = () => {};
const fakeCtx = new Proxy({}, {
  get(t, p) { if (p === 'fillStyle' || p === 'globalAlpha') return undefined; return typeof p === 'string' ? noop : undefined; },
  set() { return true; },
});
const handlers = new WeakMap();
const mk = () => {
  const el = {
    tagName: 'div', className: '', id: '', style: {}, children: [], parentNode: null, onclick: null,
    _html: '',
    addEventListener(ev, cb) { const h = handlers.get(el) || {}; (h[ev] = h[ev] || []).push(cb); handlers.set(el, h); },
    removeEventListener(ev, cb) { const h = handlers.get(el) || {}; h[ev] = (h[ev] || []).filter(f => f !== cb); },
    fire(ev, arg) { for (const cb of ((handlers.get(el) || {})[ev] || []).slice()) cb(arg); },
    appendChild(c) { c.parentNode = el; el.children.push(c); return c; },
    remove() { if (el.parentNode) { const i = el.parentNode.children.indexOf(el); if (i >= 0) el.parentNode.children.splice(i, 1); el.parentNode = null; } },
    getBoundingClientRect() { return { left: 10, top: 10, right: 90, bottom: 60, width: 80, height: 50 }; },
    click() { if (el.onclick) el.onclick(); el.fire('click'); },
    getContext: () => fakeCtx,
    width: 0, height: 0,
  };
  Object.defineProperty(el, 'innerHTML', {
    get() { return el._html; },
    set(v) { el._html = String(v); if (v === '') el.children.length = 0; },
  });
  return el;
};
const elements = {};
globalThis.document = {
  getElementById: (id) => elements[id] ?? (elements[id] = mk()),
  createElement: () => mk(),
  body: mk(),
  addEventListener() {},
};
let keyHandler = null;
globalThis.window = { addEventListener: (ev, cb) => { if (ev === 'keydown') keyHandler = cb; }, innerWidth: 480, innerHeight: 300 };
let now = 0;
globalThis.performance = { now: () => now };
const rafQueue = [];
globalThis.requestAnimationFrame = (cb) => { rafQueue.push(cb); return rafQueue.length; };
globalThis.location = { reload: noop };
// Onboarded + every tour flag (the kept coaches stay out of the way). NOTE:
// 'hordes_autopick=INSTANT' is DELIBERATELY present, as a returning browser's
// localStorage would carry it after the retired setting — the shipped code
// must ignore it.
const ls = new Map([['hordes_onboarded', '1'], ['hordes_autopick', 'INSTANT'],
  // The switches as a returning browser stored them: read at load.
  ['hordes_draft_auto', '0'], ['hordes_draft_wait', '4'],
  ...Object.values(TOUR_KEYS).map(k => [k, '1'])]);
globalThis.localStorage = {
  getItem: k => (ls.has(k) ? ls.get(k) : null),
  setItem: (k, v) => ls.set(k, String(v)),
  removeItem: k => ls.delete(k),
};

const mainMod = await import('../src/main.js');
const T = mainMod.__TEST;
const st = T.state;
// Not about the tutorial: a settled profile, so run 1's guided part (which
// holds the auto-pick for its own draft step) does not arm.
T.getProfile().achievements.totals.runs = 1;
const frame = () => {
  now += 1000 / 60;
  const cb = rafQueue.shift();
  if (!cb) throw new Error('raf died');
  cb(now);
};
const tick = (s) => { for (let i = 0, n = Math.round(s * 60); i < n; i++) frame(); };
const cards = () => elements['ov-cards'] ? elements['ov-cards'].children : [];
const countdownLine = () => {
  const ov = elements['overlay'];
  return ov ? ov.children.find(c => c.id === 'draft-autopick') : null;
};
// The row's countdown text (its first child; the two switches follow it).
const lineText = (l) => ((l && l.children && l.children[0] && l.children[0].textContent) || '');
const TIMEOUT = CONFIG.AUTOPILOT.DRAFT_TIMEOUT;
const key = (k) => keyHandler({ key: k, preventDefault() {} });
const row = () => T.draftAuto.row;
const onChip = () => row() && row().children[1];
const waitChip = () => row() && row().children[2];
const chipText = (el) => String((el && el.innerHTML) || '').replace(/<[^>]+>/g, '');

// Straight into a live run (AUTO_ALL is the default pilot mode).
keyHandler({ key: 'x', preventDefault() {} });
tick(1);
T.startRun();
ok('the run is live on the default pilot (EXPLORE, an auto mode)', st.mode === 'playing' && st.pilotMode === 'EXPLORE', [st.mode, st.pilotMode]);
st.player.stats.xpMult = 0;   // no XP may be earned mid-test
T.draftAuto.rng = () => 0;

// ---- 0. the stored switches are read at load; junk reads as the default -----
{
  ok('a stored hordes_draft_auto=0 loads as AUTO-PICK OFF', T.draftAuto.on === false, T.draftAuto.on);
  ok('a stored hordes_draft_wait=4 loads as WAIT 4s', T.draftAuto.waitStep === 4 && T.draftAuto.wait === 4,
    [T.draftAuto.waitStep, T.draftAuto.wait]);
  const parse = mainMod.draftWaitFromPref;
  const junk = [null, undefined, '', '0', '7', '-1', '2.5', 'abc', 'INSTANT'];
  ok('junk stored WAIT values read as the default 6',
    junk.every(v => parse(v) === 6), junk.map(v => parse(v)));
  ok('stored WAIT values 1..6 read as themselves',
    ['1', '2', '3', '4', '5', '6'].every(v => parse(v) === Number(v)));
  // Back to the defaults through the switches themselves (no draft is open).
  T.draftAuto.toggle();
  for (let i = 0; i < 4; i++) T.draftAuto.cycle();   // 4 -> 3 -> 2 -> 1 -> 6
  ok('the switches store what they show (ON, WAIT 6s)',
    T.draftAuto.on === true && T.draftAuto.waitStep === 6 &&
    ls.get('hordes_draft_auto') === '1' && ls.get('hordes_draft_wait') === '6',
    [T.draftAuto.on, T.draftAuto.waitStep, ls.get('hordes_draft_auto'), ls.get('hordes_draft_wait')]);
  ok('the top WAIT step is the configured timeout', T.draftAuto.wait === TIMEOUT, T.draftAuto.wait);
}

// ---- 1. the window is the FIXED timeout, regardless of stored junk ---------
{
  st.pendingDrafts = 1;
  T.openDraft();
  ok('a stored hordes_autopick=INSTANT does NOT shorten the window: armed at the full '
    + TIMEOUT + 's', Math.abs(T.draftAuto.left - TIMEOUT) < 1e-9, T.draftAuto.left);
  const c0 = T.draftAuto.count;
  tick(TIMEOUT - 0.1);
  ok(TIMEOUT + 's: ' + (TIMEOUT - 0.1) + 's is NOT enough (the delay is the pacing feature)',
    T.draftAuto.count === c0 && st.mode === 'draft', [T.draftAuto.count - c0, st.mode]);
  ok('the countdown line renders for the AUTO player (no instant path hides it)',
    !!countdownLine(), lineText(countdownLine()));
  ok('the row carries the two switches: ON and WAIT 6s',
    /^ON/.test(chipText(onChip())) && /^WAIT 6s/.test(chipText(waitChip())),
    [chipText(onChip()), chipText(waitChip())]);
  tick(0.2);
  ok(TIMEOUT + 's: ~' + TIMEOUT + '.0s picks exactly once and resolves the draft',
    T.draftAuto.count === c0 + 1 && st.mode === 'playing',
    { count: T.draftAuto.count - c0, mode: st.mode });
  // The latch: the same draft can never pick twice (done latched BEFORE pick).
  tick(1);
  ok('no second pick lands for the resolved draft (the latch holds)',
    T.draftAuto.count === c0 + 1, T.draftAuto.count - c0);
}

// ---- 2. the key is never WRITTEN: runs / drafts / settings leave no trace ---
{
  ls.delete('hordes_autopick');
  st.pendingDrafts = 1;
  T.openDraft();
  cards()[0].click();
  T.startRun();                       // a whole run boundary
  st.player.stats.xpMult = 0;
  T.openSettings(true, true);         // the settings screen renders
  ok('no code path writes the retired hordes_autopick key',
    ls.get('hordes_autopick') === undefined, ls.get('hordes_autopick'));
  const settingsHtml = (elements['ov-cards'] ? elements['ov-cards'].children : [])
    .map(c => c.innerHTML || '').join('');
  ok('the SETTINGS screen carries no AUTO-PICK row',
    !settingsHtml.includes('AUTO-PICK'), settingsHtml.slice(0, 120));
  // A leftover key still buys nothing when present either.
  ls.set('hordes_autopick', 'INSTANT');
  st.pendingDrafts = 1;
  T.openDraft();
  ok('with the junk key present the window is STILL the full timeout',
    Math.abs(T.draftAuto.left - TIMEOUT) < 1e-9 && !!countdownLine(),
    { left: T.draftAuto.left, line: !!countdownLine() });
  cards()[0].click();
}

// ---- 3. MANUAL pilot: suspended (not reset), never auto-picks --------------
{
  st.pendingDrafts = 1;
  T.openDraft();
  const c0 = T.draftAuto.count;
  // Spend ~2s of the window in AUTO first, so the resume can be told apart
  // from a reset (a reset would rewind to the full timeout).
  tick(2);
  let line = countdownLine();
  const spent = line ? parseFloat(/([\d.]+)s/.exec(lineText(line))[1]) : null;
  ok('AUTO: the line counts down (window spent)', spent !== null && spent < TIMEOUT, { spent, TIMEOUT });
  // MANUAL suspends: no line, no pick, however long the player waits.
  st.pilotMode = 'MANUAL';
  tick(TIMEOUT + 1);                             // past the whole timeout
  ok('MANUAL: the countdown line is suspended', !countdownLine());
  ok('MANUAL: never auto-picks (the draft stays open past the timeout)',
    T.draftAuto.count === c0 && st.mode === 'draft', [T.draftAuto.count - c0, st.mode]);
  // SUSPEND, NOT RESET: flip back to AUTO -> the UNSPENT remainder resumes.
  st.pilotMode = 'AUTO_ALL';
  tick(0.05);
  line = countdownLine();
  ok('flipping to AUTO mid-draft resumes the countdown line', !!line, lineText(line));
  const read = line ? parseFloat(/([\d.]+)s/.exec(lineText(line))[1]) : null;
  ok('the resumed window is the UNSPENT remainder (~' + spent + 's), not a reset',
    read !== null && Math.abs(read - spent) < 0.4, { read, spent });
  tick(read + 0.3);
  ok('the resumed countdown picks exactly once through the ONE activation seam',
    T.draftAuto.count === c0 + 1 && st.mode === 'playing',
    { count: T.draftAuto.count - c0, mode: st.mode });
  st.pilotMode = 'AUTO_ALL';
}

// ---- 4. a hand pick is immediate (the human never waits) --------------------
{
  st.pilotMode = 'MANUAL';                        // the pilot gate suspends auto
  st.pendingDrafts = 1;
  T.openDraft();
  const c0 = T.draftAuto.count;
  ok('draft presented', st.mode === 'draft', st.mode);
  cards()[0].click();                             // the human takes the card NOW
  ok('the hand pick is immediate and advances the run',
    st.mode === 'playing' && T.draftAuto.count === c0, [st.mode, T.draftAuto.count - c0]);
  st.pendingDrafts = 0;
}
st.pilotMode = 'AUTO_ALL';

// A joker taken on a full joker row opens a replace draft of its own, so the
// checks below take a plain card (auto and by hand): one pick is one draft.
// The run's free NEW weapon deals its draft again (KIT_OFFER.FREE), so it is
// marked used here: a NEW card the stall watchdog takes is one pick too.
const plainIdx = () => Math.max(0, cards().findIndex(c => c._draftOffer && c._draftOffer.tier !== 'JOKER'));
// The stall watchdog does not use the test's rng, and with no weapon held a
// NEW card would join at the start level and could open an evolve offer
// (HORDES_RNG=8): so these drafts hold no NEW card at all.
const openPlain = () => {
  st.kitFreeUsed = Infinity;
  st.runKit = [];
  st.pendingDrafts = 1;
  T.openDraft();
  const n = cards().length, i = plainIdx();
  T.draftAuto.rng = () => (i + 0.5) / n;
};

// ---- 5. AUTO-PICK OFF holds the draft; back ON restarts the full window ------
{
  // No weapons from here on: a picked level card could otherwise complete an
  // evolution and open the evolve offer between these drafts.
  st.weapons.length = 0;
  openPlain();
  const c0 = T.draftAuto.count;
  tick(1);
  onChip().click();                               // the switch, as tapped
  ok('the ON/OFF switch turns AUTO-PICK OFF and stores it',
    T.draftAuto.on === false && ls.get('hordes_draft_auto') === '0', [T.draftAuto.on, ls.get('hordes_draft_auto')]);
  ok('OFF shows on the switch and the line stops counting',
    /^OFF/.test(chipText(onChip())) && / off/.test(onChip().className) && lineText(countdownLine()) === 'AUTO-PICK',
    [chipText(onChip()), onChip().className, lineText(countdownLine())]);
  tick(TIMEOUT + 2);
  ok('OFF: no pick however long the draft stays up',
    T.draftAuto.count === c0 && st.mode === 'draft', [T.draftAuto.count - c0, st.mode]);
  onChip().click();
  ok('back ON: the full window restarts from now',
    T.draftAuto.on === true && Math.abs(T.draftAuto.left - TIMEOUT) < 1e-9, T.draftAuto.left);
  tick(TIMEOUT - 0.1);
  ok('back ON: still waiting just short of the window', T.draftAuto.count === c0 && st.mode === 'draft');
  tick(0.2);
  ok('back ON: picks exactly once at the window', T.draftAuto.count === c0 + 1 && st.mode === 'playing',
    [T.draftAuto.count - c0, st.mode]);
}

// ---- 6. WAIT steps down 6 -> 1 and wraps; a press restarts the countdown ------
{
  openPlain();
  const c0 = T.draftAuto.count;
  tick(2);
  waitChip().click();
  ok('one press: WAIT 5s, stored, and the open draft restarts on 5s',
    T.draftAuto.waitStep === 5 && ls.get('hordes_draft_wait') === '5' &&
    Math.abs(T.draftAuto.left - 5) < 1e-9 && /^WAIT 5s/.test(chipText(waitChip())),
    [T.draftAuto.waitStep, ls.get('hordes_draft_wait'), T.draftAuto.left, chipText(waitChip())]);
  tick(4.9);
  ok('WAIT 5s: 4.9s is not enough', T.draftAuto.count === c0 && st.mode === 'draft');
  tick(0.2);
  ok('WAIT 5s: picks once at 5s', T.draftAuto.count === c0 + 1 && st.mode === 'playing');
  openPlain();
  ok('the next draft arms at the stored WAIT', Math.abs(T.draftAuto.left - 5) < 1e-9, T.draftAuto.left);
  for (let i = 0; i < 4; i++) key('t');           // 5 -> 4 -> 3 -> 2 -> 1
  ok('the T key steps the same switch: WAIT 1s', T.draftAuto.waitStep === 1 && Math.abs(T.draftAuto.left - 1) < 1e-9,
    [T.draftAuto.waitStep, T.draftAuto.left]);
  const c1 = T.draftAuto.count;
  tick(0.9);
  ok('WAIT 1s is the shortest: nothing is instant (0.9s is not enough)',
    T.draftAuto.count === c1 && st.mode === 'draft', [T.draftAuto.count - c1, st.mode]);
  tick(0.2);
  ok('WAIT 1s: picks once at 1s', T.draftAuto.count === c1 + 1 && st.mode === 'playing');
  openPlain();
  key('t');
  ok('from 1s the next press wraps to 6s (the configured timeout)',
    T.draftAuto.waitStep === 6 && T.draftAuto.wait === TIMEOUT && ls.get('hordes_draft_wait') === '6' &&
    Math.abs(T.draftAuto.left - TIMEOUT) < 1e-9,
    [T.draftAuto.waitStep, T.draftAuto.wait, ls.get('hordes_draft_wait'), T.draftAuto.left]);
  key('u');
  ok('the U key is the ON/OFF switch', T.draftAuto.on === false, T.draftAuto.on);
  keyHandler({ key: 'u', repeat: true, preventDefault() {} });
  ok('a held U key does not flip it back', T.draftAuto.on === false, T.draftAuto.on);
  key('u');
  ok('U again: back ON', T.draftAuto.on === true, T.draftAuto.on);
  cards()[plainIdx()].click();
  ok('a tap still takes the card at once', st.mode === 'playing', st.mode);
}

// ---- 7. MANUAL: no row, and the keys do nothing -----------------------------
{
  st.pilotMode = 'MANUAL';
  openPlain();
  tick(0.1);
  key('u'); key('t');
  ok('MANUAL: no AUTO-PICK row', !countdownLine());
  ok('MANUAL: U and T change nothing', T.draftAuto.on === true && T.draftAuto.waitStep === 6,
    [T.draftAuto.on, T.draftAuto.waitStep]);
  cards()[plainIdx()].click();
  st.pilotMode = 'AUTO_ALL';
}

// ---- 8. the evolve offer follows the same switches --------------------------
{
  const was = st.mode;
  st.mode = 'evolve';
  T.draftAuto.armEvolve();
  ok('evolve, attended AUTO: the offer waits the WAIT (default: the timeout)',
    T.auto.evolveLeft === TIMEOUT, T.auto.evolveLeft);
  T.draftAuto.cycle(); T.draftAuto.cycle(); T.draftAuto.cycle();   // 6 -> 3
  ok('evolve: a WAIT press re-arms the open offer on the new wait', T.auto.evolveLeft === 3, T.auto.evolveLeft);
  T.draftAuto.toggle();
  ok('evolve: AUTO-PICK OFF holds the offer', T.auto.evolveLeft === null, T.auto.evolveLeft);
  T.draftAuto.toggle();
  ok('evolve: back ON re-arms it', T.auto.evolveLeft === 3, T.auto.evolveLeft);
  st.unattended = true;
  T.draftAuto.armEvolve();
  ok('evolve, unattended and ON: its own short AUTO_EVOLVE_S',
    T.auto.evolveLeft === CONFIG.AUTOPILOT.AUTO_EVOLVE_S, T.auto.evolveLeft);
  st.unattended = false;
  T.draftAuto.cycle(); T.draftAuto.cycle(); T.draftAuto.cycle();   // 3 -> 2 -> 1 -> 6
  st.mode = was;
  tick(0.1);
  ok('back to the default WAIT, and the row left with the evolve screen',
    T.draftAuto.waitStep === 6 && !countdownLine(), [T.draftAuto.waitStep, !!countdownLine()]);
}

// ---- 9. auto-continue + OFF: the draft waits, the stall watchdog takes it ----
{
  st.unattended = true;
  T.draftAuto.toggle();                            // OFF
  openPlain();
  const c0 = T.draftAuto.count;
  tick(1);
  ok('the line says when auto-continue will take it',
    /^AUTO-CONTINUE IN \d+s$/.test(lineText(countdownLine())), lineText(countdownLine()));
  tick(CONFIG.AUTOPILOT.AUTO_STALL_S - 2);
  ok('auto-continue + OFF: no pick before the stall watchdog',
    T.draftAuto.count === c0 && st.mode === 'draft', [T.draftAuto.count - c0, st.mode]);
  tick(1.5);
  ok('the stall watchdog takes the card once', T.draftAuto.count === c0 + 1 && st.mode === 'playing',
    [T.draftAuto.count - c0, st.mode]);
  st.unattended = false;
  T.draftAuto.toggle();                            // ON
  ok('nothing wrote the retired key along the way', ls.get('hordes_autopick') === 'INSTANT' || ls.get('hordes_autopick') === undefined,
    ls.get('hordes_autopick'));
}

// ---- 10. the keys never reach the pilot, and a press restarts the watchdog ---
{
  const pilot0 = st.pilotMode;
  openPlain();
  key('o');
  ok('O (the in-run pilot toggle) is ignored on the draft: neither switch nor pilot moves',
    T.draftAuto.on === true && st.pilotMode === pilot0 && ls.get('hordes_draft_auto') === '1',
    [T.draftAuto.on, st.pilotMode, ls.get('hordes_draft_auto')]);
  const c0 = T.draftAuto.count;
  tick(TIMEOUT + 0.05);                            // the countdown ran out: the pick ceremony is up
  ok('the countdown picked', T.draftAuto.count === c0 + 1 && st.mode === 'playing', [T.draftAuto.count - c0, st.mode]);
  const stored = ls.get('hordes_pilot2');
  key('u'); key('t');                               // pressed a beat too late
  ok('U and T a beat after the pick change nothing (no pilot flip, no switch)',
    st.pilotMode === pilot0 && ls.get('hordes_pilot2') === stored && T.draftAuto.on === true && T.draftAuto.waitStep === 6,
    [st.pilotMode, ls.get('hordes_pilot2'), T.draftAuto.on, T.draftAuto.waitStep]);
  tick(1);

  // auto-continue + OFF: 28 s in, back ON -> the full WAIT, not the watchdog's 2 s
  st.unattended = true;
  T.draftAuto.toggle();                             // OFF
  openPlain();
  const c1 = T.draftAuto.count;
  tick(CONFIG.AUTOPILOT.AUTO_STALL_S - 2);
  key('u');                                         // back ON
  ok('back ON in an auto-continue run: the row shows the full wait',
    T.draftAuto.on === true && /^AUTO-PICK IN 6\.0s$/.test(lineText(countdownLine())), lineText(countdownLine()));
  tick(TIMEOUT - 0.2);
  ok('the stall watchdog did not beat the countdown the row showed',
    T.draftAuto.count === c1 && st.mode === 'draft', [T.draftAuto.count - c1, st.mode]);
  tick(0.4);
  ok('the countdown took the card once, on time', T.draftAuto.count === c1 + 1 && st.mode === 'playing',
    [T.draftAuto.count - c1, st.mode]);
  // OFF pressed mid-draft reads the watchdog's full window at once
  T.draftAuto.toggle();                             // OFF (no draft open)
  openPlain();
  tick(10);
  key('u'); key('u');                               // ON, then OFF again 10 s in
  ok('OFF pressed mid-draft restarts the auto-continue window: AUTO-CONTINUE IN 30s',
    lineText(countdownLine()) === 'AUTO-CONTINUE IN ' + CONFIG.AUTOPILOT.AUTO_STALL_S + 's', lineText(countdownLine()));
  const c2 = T.draftAuto.count;
  tick(CONFIG.AUTOPILOT.AUTO_STALL_S - 1);
  ok('...and holds that long', T.draftAuto.count === c2 && st.mode === 'draft', [T.draftAuto.count - c2, st.mode]);
  tick(1.5);
  ok('...then auto-continue takes it', T.draftAuto.count === c2 + 1 && st.mode === 'playing');
  st.unattended = false;
  T.draftAuto.toggle();                             // ON
}

// ---- 11. a REAL evolve offer: the row, both switches, the pick at the WAIT ---
{
  T.startRun();
  st.player.stats.xpMult = 0;
  tick(0.1);
  const w = st.weapons.find(x => EVOLUTION_DEFS[x.type]);
  ok('the run has a weapon that can evolve', !!w);
  w.level = WEAPON_MAX_LEVEL;
  st.player.takenStats = { [EVOLUTION_DEFS[w.type].partner]: 1 };
  tick(1 / 60);
  ok('the evolve offer opened', st.mode === 'evolve', st.mode);
  tick(1 / 60);
  ok('the evolve offer shows the AUTO-PICK row with its countdown',
    !!countdownLine() && /^AUTO-PICK IN \d+\.\ds$/.test(lineText(countdownLine())), lineText(countdownLine()));
  key('t'); key('t'); key('t');                     // 6 -> 3
  ok('T on the evolve offer: WAIT 3s, re-armed on 3s',
    T.draftAuto.waitStep === 3 && Math.abs(T.auto.evolveLeft - 3) < 1e-9 && ls.get('hordes_draft_wait') === '3',
    [T.draftAuto.waitStep, T.auto.evolveLeft, ls.get('hordes_draft_wait')]);
  key('u');
  ok('U on the evolve offer: OFF holds it', T.auto.evolveLeft === null && lineText(countdownLine()) === 'AUTO-PICK',
    [T.auto.evolveLeft, lineText(countdownLine())]);
  tick(TIMEOUT + 1);
  ok('OFF: the evolve offer is still up', st.mode === 'evolve', st.mode);
  key('u');
  tick(2.8);
  ok('back ON: still up just short of WAIT 3s', st.mode === 'evolve', st.mode);
  tick(0.4);
  ok('back ON: taken at WAIT 3s, and the row left with it',
    st.mode === 'playing' && !!w.evolutionId && !countdownLine(), [st.mode, w.evolutionId, !!countdownLine()]);
  key('t'); key('t'); key('t');                     // 3 -> 2 -> 1 -> 6 (no row: nothing changes)
  ok('T off the draft and evolve screens does nothing', T.draftAuto.waitStep === 3, T.draftAuto.waitStep);
  T.draftAuto.cycle(); T.draftAuto.cycle(); T.draftAuto.cycle();
  ok('back to WAIT 6s', T.draftAuto.waitStep === 6, T.draftAuto.waitStep);
}

console.log('test_autopick_pref: all ' + passed + ' checks passed');
