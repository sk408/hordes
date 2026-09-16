// DRAFT PICK CEREMONY (owner 2026-09-16) — the chosen card scales/brightens
// and settles; the others disintegrate with STEPPED (crackle) timing; the
// whole ceremony rides OVER an already-resolved draft and never delays it.
// Run: node test/test_draft_ceremony.mjs
//
// The contract under test (main.js ceremony block + index.html CSS):
//   - the PICK lands in pick() this frame: a MANUAL tap resumes the sim with
//     ZERO added latency (mode flips synchronously in the click), and the
//     G30 auto-pick timing/count/latch contracts are byte-identical;
//   - the overlay merely STAYS UP ~DRAFT_CEREMONY_S (<= 0.5s) over the LIVE
//     game, pointer-events off, then the frame loop tears it down;
//   - mid-ceremony DOM: the chosen card carries the chosen class, the others
//     the disintegration class, the overlay the ceremony flag — all gone
//     after (no leaks across many level-ups);
//   - a second tap on the still-visible cards is INERT (the ceremony guard);
//   - prefers-reduced-motion: cut to the resolved state, nothing left behind;
//   - v1 scope: LEVEL-UP drafts only — the evolve overlay and the
//     intermission CONTINUE are byte-identical (no ceremony engages there);
//   - a queued draft (pendingDrafts > 1) re-presents immediately, no ceremony
//     between the two presentations.
import { CONFIG } from '../src/config.js';
import { TOUR_KEYS } from '../src/tour.js';

let passed = 0;
function ok(name, cond, detail) {
  if (!cond) { console.error('  FAIL ' + name + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : '')); process.exit(1); }
  passed++;
  console.log('  ok - ' + name);
}

// ---- stub DOM (test_autopick_pref.mjs pattern) --------------------------------
const noop = () => {};
const fakeCtx = new Proxy({}, {
  get(t, p) { if (p === 'fillStyle' || p === 'globalAlpha') return undefined; return typeof p === 'string' ? noop : undefined; },
  set() { return true; },
});
const handlers = new WeakMap();
const mk = () => {
  const el = {
    tagName: 'div', className: '', id: '', style: { cssText: '' }, children: [], parentNode: null, onclick: null,
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
// The ceremony's reduced-motion query is mutable so one boot covers both
// halves of the contract.
let REDUCE = false;
globalThis.window = {
  addEventListener: (ev, cb) => { if (ev === 'keydown') keyHandler = cb; },
  innerWidth: 480, innerHeight: 300,
  matchMedia: () => ({ get matches() { return REDUCE; } }),
};
let now = 0;
globalThis.performance = { now: () => now };
const rafQueue = [];
globalThis.requestAnimationFrame = (cb) => { rafQueue.push(cb); return rafQueue.length; };
globalThis.location = { reload: noop };
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
const overlay = () => elements['overlay'];
const CER = T.ceremony;
const TIMEOUT = CONFIG.AUTOPILOT.DRAFT_TIMEOUT;
// "Clean" = the ceremony's own residue is gone (overlay hidden, pointer gate
// lifted, flag stripped). Hidden legacy cards may linger until the next
// presenter wipes them — that is the pre-ceremony contract, not a leak.
const overlayClean = () => overlay().style.display === 'none' &&
  (overlay().style.pointerEvents === undefined || overlay().style.pointerEvents === '') &&
  !String(overlay().className || '').includes(CER.classes.flag);

ok('the ceremony timing constant is <= 0.5s (spec cap)', CER.S <= 0.5, CER.S);

// Straight into a live run (AUTO_ALL is the default pilot mode).
keyHandler({ key: 'x', preventDefault() {} });
tick(1);
T.startRun();
ok('the run is live in AUTO (default pilot mode)', st.mode === 'playing' && st.pilotMode === 'AUTO_ALL', [st.mode, st.pilotMode]);
st.player.stats.xpMult = 0;   // no XP may be earned mid-test
T.draftAuto.rng = () => 0;

// ---- 1. AUTO: pick timing/count/latch IDENTICAL, ceremony rides on top ------
{
  st.pendingDrafts = 1;
  T.openDraft();
  const c0 = T.draftAuto.count;
  tick(TIMEOUT - 0.1);
  ok('AUTO: ' + (TIMEOUT - 0.1) + 's is still not enough (timing unchanged)',
    T.draftAuto.count === c0 && st.mode === 'draft', [T.draftAuto.count - c0, st.mode]);
  tick(0.2);
  ok('AUTO: ~' + TIMEOUT + '.0s picks exactly once and resolves the draft (timing unchanged)',
    T.draftAuto.count === c0 + 1 && st.mode === 'playing',
    { count: T.draftAuto.count - c0, mode: st.mode });
  ok('the ceremony is riding (state live, constant-ish left)', CER.active && CER.left <= CER.S, CER.left);
  ok('the overlay STAYS UP through the ceremony (full ceremony, not a flash)',
    overlay().style.display === 'flex', overlay().style.display);
  ok('the overlay is tap-through while the sim runs underneath',
    overlay().style.pointerEvents === 'none', overlay().style.pointerEvents);
  ok('the countdown line is gone at the pick (clearDraftAutoPick unchanged)',
    !overlay().children.some(c => c.id === 'draft-autopick'));
  tick(1);
  ok('AUTO: no second pick lands (the latch holds through the ceremony)',
    T.draftAuto.count === c0 + 1, T.draftAuto.count - c0);
}

// ---- 2. MANUAL TAP: zero added latency + mid-ceremony DOM + inert 2nd tap ---
{
  T.setPilotMode('MANUAL');
  st.pendingDrafts = 1;
  T.openDraft();
  const c0 = T.draftAuto.count;
  const pickedEl = cards()[0];
  const burnEls = [...cards()].slice(1);
  const t0 = st.time;
  pickedEl.click();                       // the human takes the card NOW
  // ZERO LATENCY: resolved IN the click, before a single frame is pumped.
  ok('MANUAL TAP: mode is playing the instant the tap lands (zero added latency)',
    st.mode === 'playing' && st.pendingDrafts === 0, [st.mode, st.pendingDrafts]);
  ok('MANUAL TAP: no auto-pick fired (a hand pick resolves the draft)',
    T.draftAuto.count === c0, T.draftAuto.count - c0);
  // Mid-ceremony DOM: the chosen card is marked, the others disintegrate.
  ok('the chosen card carries the chosen-class marker',
    String(pickedEl.className).includes(CER.classes.chosen), pickedEl.className);
  ok('every other card carries the disintegration marker',
    burnEls.length >= 2 && burnEls.every(el => String(el.className).includes(CER.classes.others)),
    burnEls.map(el => el.className));
  ok('the overlay carries the ceremony flag class',
    String(overlay().className).includes(CER.classes.flag), overlay().className);
  ok('exactly one chosen card and the rest burn (no card is both/neither)',
    cards().filter(el => String(el.className).includes(CER.classes.chosen)).length === 1 &&
    cards().every(el => String(el.className).includes(CER.classes.chosen) ||
                        String(el.className).includes(CER.classes.others)));
  // The SIM RUNS UNDERNEATH the ceremony.
  tick(0.3);
  ok('the sim advances under the ceremony (resume is real, not deferred)',
    st.time > t0 + 0.25, { t0, now: st.time });
  ok('mid-ceremony the overlay is still up', overlay().style.display === 'flex' && CER.active);
  // SECOND TAP: the cards are still visible — the tap must be inert.
  const pendBefore = st.pendingDrafts;
  cards()[1] && cards()[1].click();
  keyHandler({ key: '1' });               // the keyboard path under an open overlay: not draft-routed
  ok('a second tap (and a stray key) during the ceremony picks NOTHING',
    st.pendingDrafts === pendBefore && st.mode === 'playing' && T.draftAuto.count === c0,
    [st.pendingDrafts, st.mode, T.draftAuto.count - c0]);
  // Teardown: everything goes, nothing leaks.
  tick(CER.S);
  ok('the ceremony tears down on time (overlay hidden, cards cleared, flag gone)',
    !CER.active && overlayClean() && cards().length === 0,
    { active: CER.active, display: overlay().style.display, kids: cards().length, cls: overlay().className });
  ok('no ceremony class survives on any element',
    [...cards()].every(el => !String(el.className).includes(CER.classes.chosen) &&
                             !String(el.className).includes(CER.classes.others)) && cards().length === 0);
  T.setPilotMode('AUTO_ALL');
}

// ---- 3. no leaks across MANY level-ups ---------------------------------------
{
  for (let n = 0; n < 5; n++) {
    st.pendingDrafts = 1;
    T.openDraft();
    ok('cycle ' + n + ': the draft re-presents fresh cards', cards().length >= 3, cards().length);
    cards()[n % cards().length].click();
    ok('cycle ' + n + ': resolved instantly', st.mode === 'playing', st.mode);
    tick(CER.S + 0.1);   // margin: teardown fires at left <= 0, tick() rounds to frames
    ok('cycle ' + n + ': clean teardown, nothing accumulated',
      !CER.active && overlayClean() && cards().length === 0,
      { kids: cards().length, cls: overlay().className });
  }
}

// ---- 4. prefers-reduced-motion: cut to the resolved state --------------------
{
  REDUCE = true;
  st.pendingDrafts = 1;
  T.openDraft();
  cards()[0].click();
  // BYTE-IDENTICAL pre-ceremony behaviour: the overlay drops at the pick (the
  // hidden cards themselves linger until the next presenter wipes them — that
  // is the legacy contract, unchanged here; the ceremony path is what clears).
  ok('reduced motion: no ceremony engages at all (overlay dropped at the pick)',
    !CER.active && overlay().style.display === 'none',
    { active: CER.active, display: overlay().style.display });
  ok('reduced motion: no ceremony class was ever stamped (cards or overlay)',
    !String(overlay().className || '').includes(CER.classes.flag) &&
    cards().every(el => !String(el.className).includes(CER.classes.chosen) &&
                        !String(el.className).includes(CER.classes.others)),
    { cls: overlay().className, kids: cards().map(el => el.className) });
  tick(1);   // and a later frame finds nothing to tear down
  ok('reduced motion: the later frame is a clean no-op', overlayClean() && !CER.active);
  REDUCE = false;
}

// ---- 5. a QUEUED draft re-presents immediately (no ceremony between) --------
{
  st.pendingDrafts = 2;
  T.openDraft();
  cards()[0].click();
  ok('a queued draft re-presents the next screen at once (mode back to draft)',
    st.mode === 'draft' && st.pendingDrafts === 1, [st.mode, st.pendingDrafts]);
  ok('no ceremony runs between the queued presentations',
    !CER.active && cards().length >= 3, { active: CER.active, kids: cards().length });
  ok('the fresh cards carry no ceremony classes',
    cards().every(el => !String(el.className).includes(CER.classes.chosen) &&
                        !String(el.className).includes(CER.classes.others)),
    cards().map(el => el.className));
  cards()[0].click();
  ok('the final pick of the queue resolves and rides the ceremony',
    st.mode === 'playing' && CER.active, [st.mode, CER.active]);
  tick(CER.S + 0.1);
  ok('queue drain teardown is clean', overlayClean() && !CER.active && cards().length === 0,
    { kids: cards().length, active: CER.active });
}

// ---- 6. v1 scope: EVOLVE is untouched ----------------------------------------
{
  const volley = st.weapons.find(w => w.type === 'VOLLEY');
  ok('the evolve probe has a VOLLEY', !!volley);
  if (volley) volley.level = 8;   // maxed
  st.items.push({ id: 'probe_crit', name: 'Probe Eye', rarity: 'RARE',
    affixes: [{ id: 'crit', name: 'Keen Eye', field: 'crit', magnitude: 0.08 }] });
  st.evoTokens = 1;
  let evolved = false;
  for (let i = 0; i < 30 && !evolved; i++) {
    frame();
    if (st.mode === 'evolve') {
      const kids = cards();
      const evolveCard = kids[0];
      ok('the evolve overlay presented its card', /EVOLVE/.test(evolveCard.innerHTML || ''), evolveCard.innerHTML);
      evolveCard.click();
      // BYTE-IDENTICAL pre-ceremony behaviour: hidden in the click, no ride.
      ok('evolve: the overlay hides IN the click (unchanged — no ceremony)',
        overlay().style.display === 'none' && !CER.active,
        { display: overlay().style.display, active: CER.active });
      evolved = true;
    }
  }
  ok('the evolve overlay must open for the scope probe', evolved);
  ok('evolving actually spent the token (the real path ran)', st.evoTokens === 0, st.evoTokens);
  // teardown hygiene for the rest of the file
  tick(CER.S);
}

// ---- 7. v1 scope: INTERMISSION CONTINUE is untouched --------------------------
{
  st.mode = 'intermission';       // the CONTINUE seam, driven the way 'c' drives it
  keyHandler({ key: 'c' });
  ok('intermission CONTINUE: resumes instantly, overlay hidden in the call',
    st.mode === 'playing' && overlay().style.display === 'none',
    [st.mode, overlay().style.display]);
  ok('intermission CONTINUE: no ceremony ever engaged',
    !CER.active && !String(overlay().className || '').includes(CER.classes.flag),
    { active: CER.active, cls: overlay().className });
  tick(1);
  ok('and the next frame stays clean', overlayClean() && !CER.active);
}

console.log('test_draft_ceremony: all ' + passed + ' checks passed');
