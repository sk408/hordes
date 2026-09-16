// AUTO-PICK — THE PREFERENCE IS RETIRED (owner 2026-09-16, verbatim: "I
// didn't want the card choice to be instant because I wanted to slow progress
// for someone playing too idle so they dont miss the whole game and then
// complain they are too powerful when they didn't witness the growth").
//
// An earlier (CANCELLED) brief shipped an INSTANT/6S/MANUAL settings row on a
// 'hordes_autopick' storage key; this file previously pinned THAT contract.
// It is rewritten deliberately — not deleted — to pin the SHIPPED behaviour
// the owner reaffirmed:
//   - the draft window is the FIXED C.AUTOPILOT.DRAFT_TIMEOUT (6s) for every
//     reachable state: 5.9s is not enough, ~6.0s picks exactly once;
//   - a stored 'hordes_autopick=INSTANT' (left over in a returning browser's
//     localStorage) changes NOTHING — the timer still arms at the full
//     timeout and the countdown line still renders (no instant path exists
//     in any form; the key is never read);
//   - the key is never WRITTEN either: no runs, no settings visits, no
//     drafts may create it;
//   - the SETTINGS screen carries no AUTO-PICK row;
//   - MANUAL pilot suspends the countdown (not resets: a mid-draft flip to
//     AUTO resumes the unspent window) and never auto-picks — a full minute
//     past the timeout the draft is still open;
//   - a hand pick resolves the draft immediately (the human is never made to
//     wait), and no second pick can land for the same draft (the latch).
// The wider auto-pick contracts (obstruction, re-arm, rng seam) stay in
// test/test_auto_draft.mjs, unchanged.
// Run: node test/test_autopick_pref.mjs
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { TOUR_KEYS } from '../src/tour.js';

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
  ...Object.values(TOUR_KEYS).map(k => [k, '1'])]);
globalThis.localStorage = {
  getItem: k => (ls.has(k) ? ls.get(k) : null),
  setItem: (k, v) => ls.set(k, String(v)),
  removeItem: k => ls.delete(k),
};

const mainMod = await import('../src/main.js');
const T = mainMod.__TEST;
const st = T.state;
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
const TIMEOUT = CONFIG.AUTOPILOT.DRAFT_TIMEOUT;

// Straight into a live run (AUTO_ALL is the default pilot mode).
keyHandler({ key: 'x', preventDefault() {} });
tick(1);
T.startRun();
ok('the run is live in AUTO (default pilot mode)', st.mode === 'playing' && st.pilotMode === 'AUTO_ALL', [st.mode, st.pilotMode]);
st.player.stats.xpMult = 0;   // no XP may be earned mid-test
T.draftAuto.rng = () => 0;

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
    !!countdownLine(), countdownLine() && countdownLine().textContent);
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
  const spent = line ? parseFloat(/([\d.]+)s/.exec(line.textContent)[1]) : null;
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
  ok('flipping to AUTO mid-draft resumes the countdown line', !!line, line && line.textContent);
  const read = line ? parseFloat(/([\d.]+)s/.exec(line.textContent)[1]) : null;
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

console.log('test_autopick_pref: all ' + passed + ' checks passed');
