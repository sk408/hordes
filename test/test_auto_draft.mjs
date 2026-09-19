// HORDES — G30 AUTO DRAFT AUTO-PICK (owner 2026-09-16, verbatim: "Can we add
// so on auto, the card selection screen has a 6 second timeout and then it
// auto picks a random card.").
//
// Drives the REAL main.js loop (the test_g26_loadout.mjs stub-DOM pattern):
// every countdown second is 60 real frames through frame(), the pick goes
// through the live activateDraftCard seam, and the rng is PINNED so the
// taken card is exactly predictable. Contracts pinned here:
//   - 5.9s of ticking -> NO pick, still mode 'draft'; 6.0s -> EXACTLY ONE
//     auto-pick, the draft resolves;
//   - ticking under the draft coachmark -> no pick (SUSPEND), and the
//     countdown RESUMES where it left off once the coach is dismissed;
//   - ticking while mode !== 'draft' -> no pick (suspend, not reset);
//   - MANUAL -> no pick at any elapsed time, and no countdown line;
//   - the countdown line is present in AUTO, absent in MANUAL;
//   - a human tap before expiry takes the card, cancels the timer, and
//     there is never a second pick.
// Run: node test/test_auto_draft.mjs
import assert from 'node:assert/strict';
import { TOUR_KEYS } from '../src/tour.js';

let passed = 0;
function ok(name, cond, detail) {
  if (!cond) { console.error('  FAIL ' + name + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : '')); process.exit(1); }
  passed++;
  console.log('  ok - ' + name);
}

// ---- stub DOM (test_g26_loadout.mjs pattern) --------------------------------
const noop = () => {};
const fakeCtx = new Proxy({}, {
  get(t, p) { if (p === 'fillStyle' || p === 'globalAlpha') return undefined; return typeof p === 'string' ? noop : undefined; },
  set() { return true; },
});
const handlers = new WeakMap();
// Tip-card controls (tour) materialise from rendered HTML — fresh per set.
const controls = new WeakMap();
const controlFor = (tip, cls) => {
  const m = controls.get(tip) || {};
  if (!m[cls]) { const a = mk(); a.className = cls; m[cls] = a; controls.set(tip, m); }
  return m[cls];
};
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
    querySelector(sel) {
      if (sel.startsWith('.tour-') && el._html.includes(sel.slice(1))) return controlFor(el, sel.slice(1));
      return null;
    },
    click() { if (el.onclick) el.onclick(); el.fire('click'); },
    getContext: () => fakeCtx,
    width: 0, height: 0,
  };
  Object.defineProperty(el, 'innerHTML', {
    get() { return el._html; },
    set(v) { el._html = String(v); if (v === '') el.children.length = 0; controls.delete(el); },
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
// Every tour flag preseeded (coaches stay out of the way except the ONE under
// test) + onboarded (no HOW TO PLAY pop).
const ls = new Map([['hordes_onboarded', '1'],
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
const tourRoot = () => globalThis.document.body.children.find(c => c.id === 'tour-root');

// Skip the intro -> title -> straight into a run (AUTO_ALL is the default
// pilot mode: state.pilotMode initial value).
// PROLOGUE NEUTRALIZATION (2026-09-18, same convention as test/_harness.mjs):
// since 56e1a93 the guided first run is live by default — this file boots a
// FRESH profile through startRun, which would arm the inert prologue phase
// (and with it the draft-coach absorb). These tests measure the AUTO-pick
// countdown on ORDINARY runs; stamp the returning-player counter so run #1
// here is ordinary, exactly like every harness-booted gameplay test.
T.getProfile().achievements.totals.runs = 1;
keyHandler({ key: 'x', preventDefault() {} });
tick(1);
T.startRun();
ok('the run is live in AUTO (default pilot mode)', st.mode === 'playing' && st.pilotMode === 'AUTO_ALL', [st.mode, st.pilotMode]);
// The run stays LIVE (the frame loop must really run), but no XP may be earned:
// a level-up would open the GAME's own draft mid-test and re-arm the countdown
// being measured. Only the drafts THIS test opens explicitly may exist.
// FLAKE HARDENING (docs/briefs/AUTO_DRAFT_PROLOGUE_HARDENING.md, defect 2):
// xpMult = 0 alone NEVER stopped gem XP — the kill-XP site reads
// (p.stats.xpMult || 1) (src/main.js:3396) and the falsy 0 falls through to
// 1.0x, so the run kept earning toward xpNext = 30. Reproduced with an
// instrumented copy (run 37/40): a level-2 levelUp opened the GAME's own
// draft at frame 134 of section 5's tick(6) and armDraftAutoPick built a
// FRESH countdown line (left 6 -> 2.25s at the assert) — the tap's own timer
// was correctly gone; the line belonged to the stray draft. Pin the LEVEL-UP
// gate itself: with xpNext beyond any earnable total the sweep at
// src/main.js:3399 can never fire levelUp — the ONLY pendingDrafts++ source
// (src/main.js:3473) — so no game draft can open regardless of XP flow.
st.player.stats.xpMult = 0;
st.player.xpNext = 1e18;

// ---- 1. AUTO expiry: 5.9s no pick, 6.0s exactly one pick --------------------
{
  T.draftAuto.rng = () => 0;              // pinned: ALWAYS the first offer
  st.pendingDrafts = 1;
  T.openDraft();
  ok('draft presented in AUTO', st.mode === 'draft', st.mode);
  const expectedId = cards()[0]._draftOffer.id;
  const c0 = T.draftAuto.count;
  tick(0.2);
  const line = countdownLine();
  ok('countdown line present in AUTO and live', !!line && /^AUTO-PICK IN \d+\.\ds$/.test(line.textContent || ''), line && line.textContent);
  tick(5.7);                              // 5.9s total
  ok('5.9s of ticking: NO pick, still on the draft',
    T.draftAuto.count === c0 && st.mode === 'draft', [T.draftAuto.count - c0, st.mode]);
  const line59 = countdownLine();
  ok('the line still counts down near expiry', !!line59 && /AUTO-PICK IN 0\.[0-3]s/.test(line59.textContent || ''), line59 && line59.textContent);
  tick(0.2);                              // 6.1s total: past the 6.0s timeout
  ok('6.0s: EXACTLY ONE auto-pick, through the activation seam, expected offer',
    T.draftAuto.count === c0 + 1 && T.draftAuto.lastId === expectedId && st.mode === 'playing',
    { count: T.draftAuto.count - c0, lastId: T.draftAuto.lastId, expectedId, mode: st.mode });
  ok('the draft resolved and the countdown line is gone', !countdownLine() && !T.draftAuto.armed);
  tick(3);                                // extra ticking after resolution
  ok('never a second pick after the draft resolved', T.draftAuto.count === c0 + 1, T.draftAuto.count - c0);
}

// ---- 2. SUSPEND under the draft coachmark; resume where it left off --------
{
  ls.delete(TOUR_KEYS.draft);             // the draft coach fires on open
  st.pendingDrafts = 1;
  T.openDraft();
  const c0 = T.draftAuto.count;
  ok('the draft coachmark rides on top of the cards', !!tourRoot());
  tick(30);                               // half a minute obstructed
  ok('ticking under the coachmark: no pick (SUSPEND)',
    T.draftAuto.count === c0 && st.mode === 'draft', [T.draftAuto.count - c0, st.mode]);
  ok('the countdown did not run while obstructed (full window still owed)', T.draftAuto.left > 5.9, T.draftAuto.left);
  // Dismiss the coach through its own primary (the TUTORIAL_OVERLAY contract).
  const tip = tourRoot().children.find(c => c.id === 'tour-tip');
  const btn = tip && tip.querySelector('.tour-next');
  ok('the coach card exposes its primary control', !!btn);
  btn.fire('pointerdown', { stopPropagation() {}, preventDefault() {} });
  ok('coach dismissed, draft still up', !tourRoot() && st.mode === 'draft', st.mode);
  tick(5.9);
  ok('after the coach: 5.9s more is NOT enough (the window resumed, not restarted)',
    T.draftAuto.count === c0 && st.mode === 'draft', [T.draftAuto.count - c0, st.mode]);
  tick(0.2);
  ok('the resumed countdown expires at the full 6.0s of VISIBLE draft',
    T.draftAuto.count === c0 + 1 && st.mode === 'playing', { count: T.draftAuto.count - c0, mode: st.mode });
  ls.set(TOUR_KEYS.draft, '1');           // re-seed: out of the way below
}

// ---- 3. mode gate: ticking while mode !== 'draft' -> suspend, not reset ----
{
  st.pendingDrafts = 1;
  T.openDraft();
  const c0 = T.draftAuto.count;
  tick(2);
  st.mode = 'playing';                    // another screen owns the player now
  tick(10);
  ok('ticking while mode !== draft: no pick', T.draftAuto.count === c0, T.draftAuto.count - c0);
  ok('the countdown line is hidden off-draft', !countdownLine());
  st.mode = 'draft';                      // back on the draft: RESUME
  tick(3.8);                              // 2 + 3.8 = 5.8s consumed
  ok('resumed countdown still short of the timeout', T.draftAuto.count === c0 && st.mode === 'draft');
  tick(0.3);                              // 6.1s consumed total
  ok('resumed countdown expires exactly once', T.draftAuto.count === c0 + 1 && st.mode === 'playing');
}

// ---- 4. MANUAL: no countdown line, no pick at any elapsed time -------------
{
  st.pilotMode = 'MANUAL';
  st.pendingDrafts = 1;
  T.openDraft();
  ok('draft presented in MANUAL', st.mode === 'draft', st.mode);
  const c0 = T.draftAuto.count;
  tick(60);                               // a FULL MINUTE
  ok('MANUAL: no auto-pick at any elapsed time', T.draftAuto.count === c0, T.draftAuto.count - c0);
  ok('MANUAL: no countdown line anywhere', !countdownLine());
  cards()[0].click();                     // the human takes the card
  ok('a human pick still resolves a MANUAL draft', st.mode === 'playing' && T.draftAuto.count === c0, st.mode);
  st.pilotMode = 'AUTO_ALL';              // restore for the arm below
}

// ---- 5. a human tap during the AUTO countdown cancels the timer ------------
{
  st.pendingDrafts = 1;
  T.openDraft();
  const c0 = T.draftAuto.count;
  tick(3);                                // halfway through the window
  cards()[1].click();                     // the human takes the SECOND card
  ok('the tap resolves the draft (not the timer)', st.mode === 'playing' && T.draftAuto.count === c0);
  tick(6);                                // long past where the timer would fire
  ok('the cancelled timer never fires: no second pick', T.draftAuto.count === c0, T.draftAuto.count - c0);
  ok('the countdown line left with the draft', !countdownLine());
}

console.log('test_auto_draft: all ' + passed + ' checks passed');
