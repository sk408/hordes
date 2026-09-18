// WAVE-21 tour tests — the ENGINE (pure) + the post-rework INTEGRATION contract.
// REWORKED 2026-09-16 (owner-approved onboarding rework): the 25-card tour is
// DELETED (7 title cards + 4 intermission + 10 timer/event-scheduled in-run
// cards — galaxy.click feedback: "tons of information thrown at you without
// context", "skipped like 8 tutorial blurbs because I was moving manually").
// What remains of the family: the ENGINE (unchanged), the FOUR kept event
// coaches (draft / death / settings / loadout), and the replacement
// integration contract below. The in-context hint layer that replaced the
// deleted cards lives in src/onboarding.js and is pinned by
// test/test_onboarding.mjs. Run: node test/test_tour.mjs
import assert from 'node:assert/strict';
import { Tour, TOUR_KEYS, tourFlag, setTourFlag, tourDone, clearTourFlags }
  from '../src/tour.js';

let passed = 0;
async function check(name, fn) {
  await fn();
  passed++;
  console.log(`  ok - ${name}`);
}

// ---- fakes -------------------------------------------------------------------
// A DOM element that supports everything tour.js touches: handler storage,
// innerHTML, appendChild/remove, querySelector for the tip-card controls
// ('.tour-skip' / '.tour-next' / '.tour-back' / '.tour-count'), and a NON-ZERO
// rect (a zero rect reads as "target missing" and the step would skip).
const handlers = new WeakMap();
function fakeEl(tag = 'div') {
  const el = {
    tagName: tag, className: '', id: '', style: {}, children: [], parentNode: null,
    _html: '',
    addEventListener(ev, cb) { const h = handlers.get(el) || {}; (h[ev] = h[ev] || []).push(cb); handlers.set(el, h); },
    removeEventListener(ev, cb) { const h = handlers.get(el) || {}; h[ev] = (h[ev] || []).filter(f => f !== cb); handlers.set(el, h); },
    fire(ev, arg) { for (const cb of (handlers.get(el)?.[ev] || [].slice())) cb(arg); },
    appendChild(c) { c.parentNode = el; el.children.push(c); return c; },
    remove() { if (el.parentNode) { const i = el.parentNode.children.indexOf(el); if (i >= 0) el.parentNode.children.splice(i, 1); el.parentNode = null; } },
    getBoundingClientRect() { return { left: 100, top: 50, right: 200, bottom: 100, width: 100, height: 50 }; },
    querySelector(sel) {
      // Controls are lazy children materialised from the rendered HTML —
      // one element per class, FRESH after every innerHTML set (a real DOM
      // replaces children on innerHTML, so handlers never accumulate).
      if (sel.startsWith('.tour-') && el._html.includes(sel.slice(1))) return controlFor(el, sel.slice(1));
      return null;
    },
  };
  Object.defineProperty(el, 'innerHTML', {
    get() { return el._html; },
    set(v) { el._html = String(v); if (v === '') el.children.length = 0; controls.delete(el); },
  });
  return el;
}
// tip element -> { className: fakeEl } — the tip-card controls.
const controls = new WeakMap();
function controlFor(tip, cls) {
  const m = controls.get(tip) || {};
  if (!m[cls]) { const a = fakeEl('a'); a.className = cls; m[cls] = a; controls.set(tip, m); }
  return m[cls];
}

function fakeDoc() {
  const body = fakeEl('body');
  const doc = {
    body,
    _keys: [],
    createElement: (t) => fakeEl(t),
    addEventListener(ev, cb) { doc._keys.push({ ev, cb }); },
    removeEventListener(ev, cb) { doc._keys = doc._keys.filter(k => !(k.ev === ev && k.cb === cb)); },
    fireKey(name, arg) { for (const k of doc._keys) if (k.ev === name) k.cb(arg); },
    defaultView: { innerWidth: 480, innerHeight: 300 },
  };
  return doc;
}
const fakeStorage = () => {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
};

// ---- engine: start / spotlight / advance --------------------------------------
check('tour starts on step 0, spotlight + one-line tip rendered', () => {
  const a = fakeEl(), b = fakeEl();
  const doc = fakeDoc(), st = fakeStorage();
  const t = new Tour({
    doc, storage: st,
    steps: [{ id: 'a', text: 'First button', target: () => a }, { id: 'b', text: 'Second', target: () => b }],
  });
  t.start();
  assert.ok(t.active(), 'root mounted');
  assert.ok(t.tip._html.includes('First button'), 'step text shown');
  assert.ok(t.tip._html.includes('SKIP TOUR'), 'visible skip');
  // TUTORIAL_OVERLAY: explicit controls + counter, not a tap-anywhere hint.
  assert.ok(t.tip._html.includes('1 OF 2'), 'step counter on a multi-step tour');
  assert.ok(t.tip._html.includes('>NEXT<'), 'NEXT is the primary mid-tour');
  assert.ok(!t.tip._html.includes('tour-back'), 'BACK is absent on the first step (no dead button)');
  // shades laid out around the target rect (100,50)-(200,100) + pad 8
  const top = t.shades[0].style;
  assert.equal(top.height, (50 - 8) + 'px', 'shade above hole = target top - pad');
  t.skip();
});

// RETARGETED 2026-09-16 (TUTORIAL_OVERLAY; acceptance 1): this group asserted
// the OLD contract "clicking anywhere advances" (t.root pointerdown -> next).
// It now asserts the replacement contract: a shade tap is INERT (the player
// reaching for the thing the tip describes must not lose it — complaint 1),
// and the NEXT control advances.
check('a shade tap does NOT advance or dismiss; the NEXT control advances', () => {
  const a = fakeEl(), b = fakeEl();
  const doc = fakeDoc(), st = fakeStorage();
  let done = 0;
  const t = new Tour({
    doc, storage: st, onDone: () => done++,
    steps: [{ id: 'a', text: 'First', target: () => a }, { id: 'b', text: 'Second', target: () => b }],
  });
  t.start();
  // A tap on the shade (root, outside the card's controls): inert.
  t.root.fire('pointerdown', { stopPropagation() {} });
  assert.ok(t.active(), 'shade tap did not dismiss');
  assert.ok(t.tip._html.includes('First') && t.tip._html.includes('1 OF 2'), 'shade tap did not advance');
  assert.equal(done, 0, 'shade tap did not complete');
  // The NEXT control advances.
  t.tip.querySelector('.tour-next').fire('pointerdown', { stopPropagation() {}, preventDefault() {} });
  assert.ok(t.tip._html.includes('Second') && t.tip._html.includes('2 OF 2'), 'NEXT advanced to step 2');
  // A shade tap on the LAST step still does not finish the tour.
  t.root.fire('pointerdown', { stopPropagation() {} });
  assert.ok(t.active() && done === 0, 'shade tap on the final step is still inert');
  t.tip.querySelector('.tour-next').fire('pointerdown', { stopPropagation() {}, preventDefault() {} });
  assert.equal(done, 1, 'the final step primary completes the tour');
  assert.ok(!t.active(), 'torn down');
});

// NEW (TUTORIAL_OVERLAY; acceptance 1): BACK returns; the final primary is
// labelled as a finish and carries the replay note; a single-step card hides
// BACK, shows no counter, and reads as a finish.
check('BACK returns to the previous step; final step primary is a labelled finish', () => {
  const a = fakeEl(), b = fakeEl();
  const doc = fakeDoc(), st = fakeStorage();
  let done = 0;
  const t = new Tour({
    doc, storage: st, onDone: () => done++,
    steps: [{ id: 'a', text: 'First', target: () => a }, { id: 'b', text: 'Second', target: () => b }],
  });
  t.start();
  t.next();
  assert.ok(t.tip._html.includes('tour-back'), 'BACK present on step 2');
  t.tip.querySelector('.tour-back').fire('pointerdown', { stopPropagation() {}, preventDefault() {} });
  assert.ok(t.tip._html.includes('First') && t.tip._html.includes('1 OF 2'), 'BACK returned to step 1');
  // Walk to the final step: the primary is the finish, and it names the replay path.
  t.next();
  assert.ok(t.tip._html.includes('>GOT IT<'), 'final step primary reads as the finish');
  assert.ok(t.tip._html.includes('Replay this any time from SETTINGS'), 'final card tells the player how to replay');
  assert.ok(!t.tip._html.includes('>NEXT<'), 'the final step is not labelled NEXT');
  t.tip.querySelector('.tour-next').fire('pointerdown', { stopPropagation() {}, preventDefault() {} });
  assert.equal(done, 1, 'GOT IT completes');
});

check('single-step tour: no BACK, no counter, primary reads as a finish', () => {
  const a = fakeEl();
  const doc = fakeDoc(), st = fakeStorage();
  let done = 0;
  const t = new Tour({ doc, storage: st, onDone: () => done++, steps: [{ id: 'a', text: 'Only', target: () => a }] });
  t.start();
  assert.ok(!t.tip._html.includes('tour-back'), 'no BACK on a single-step tour');
  assert.ok(!t.tip._html.includes('OF 1'), 'no counter on a single-step tour');
  assert.ok(t.tip._html.includes('>GOT IT<'), 'primary is the finish');
  t.tip.querySelector('.tour-next').fire('pointerdown', { stopPropagation() {}, preventDefault() {} });
  assert.equal(done, 1, 'GOT IT completes a single-step tour');
});

check('missing targets are skipped silently, never break', () => {
  const b = fakeEl();
  const doc = fakeDoc(), st = fakeStorage();
  const t = new Tour({
    doc, storage: st,
    steps: [
      { id: 'gone', text: 'not on screen', target: () => null },
      { id: 'thrower', text: 'broken getter', target: () => { throw new Error('boom'); } },
      { id: 'b', text: 'present', target: () => b },
    ],
  });
  t.start();
  assert.ok(t.tip._html.includes('present'), 'landed on the live step');
  t.skip();
});

check('SKIP link and Escape both exit early with onSkip', () => {
  // via the skip link
  {
    const doc = fakeDoc(), st = fakeStorage();
    let skipped = -1;
    const t = new Tour({
      doc, storage: st, onSkip: (i) => { skipped = i; },
      steps: [{ id: 'a', text: 'x', target: () => fakeEl() }, { id: 'b', text: 'y', target: () => fakeEl() }],
    });
    t.start();
    controlFor(t.tip, 'tour-skip').fire('pointerdown', { stopPropagation() {}, preventDefault() {} });
    assert.ok(!t.active(), 'skip link tore it down');
    assert.equal(skipped, 0, 'onSkip reports the step');
  }
  // via Escape
  {
    const doc = fakeDoc(), st = fakeStorage();
    let skipped = false;
    const t = new Tour({
      doc, storage: st, onSkip: () => { skipped = true; },
      steps: [{ id: 'a', text: 'x', target: () => fakeEl() }],
    });
    t.start();
    doc.fireKey('keydown', { key: 'Escape', preventDefault() {} });
    assert.ok(skipped && !t.active(), 'Escape skips');
  }
});

// RETARGETED 2026-09-16 (TUTORIAL_OVERLAY; acceptance 1): this group asserted
// the OLD WAVE-23 (#6) contract "any non-Escape key advances" (a plain 'm'
// keypress moved the step). It now asserts the replacement keyboard contract:
// Right/Enter/Space advance, Left backs, and NO other key does anything.
check('keyboard: Right/Enter/Space next, Left back, no other key advances', () => {
  const a = fakeEl(), b = fakeEl();
  const doc = fakeDoc(), st = fakeStorage();
  const t = new Tour({
    doc, storage: st,
    steps: [{ id: 'a', text: 'First', target: () => a }, { id: 'b', text: 'Second', target: () => b }],
  });
  t.start();
  doc.fireKey('keydown', { key: 'm' });          // a game key the OLD engine ate
  assert.ok(t.tip._html.includes('First'), 'a plain key does NOT advance');
  doc.fireKey('keydown', { key: 'ArrowRight', preventDefault() {} });
  assert.ok(t.tip._html.includes('Second'), 'ArrowRight advances');
  doc.fireKey('keydown', { key: 'ArrowLeft', preventDefault() {} });
  assert.ok(t.tip._html.includes('First'), 'ArrowLeft backs up');
  doc.fireKey('keydown', { key: 'Enter', preventDefault() {} });
  assert.ok(t.tip._html.includes('Second'), 'Enter advances');
  doc.fireKey('keydown', { key: 'Escape', preventDefault() {} });
  assert.ok(!t.active(), 'Escape still skips');
});

check('keyboard: Space advances; keys past the final step do nothing weird', () => {
  const a = fakeEl(), b = fakeEl();
  const doc = fakeDoc(), st = fakeStorage();
  let done = 0;
  const t = new Tour({
    doc, storage: st, onDone: () => done++,
    steps: [{ id: 'a', text: 'First', target: () => a }, { id: 'b', text: 'Second', target: () => b }],
  });
  t.start();
  doc.fireKey('keydown', { key: ' ', preventDefault() {} });
  assert.ok(t.tip._html.includes('Second'), 'Space advances');
  doc.fireKey('keydown', { key: ' ', preventDefault() {} });
  assert.equal(done, 1, 'Space on the final step completes the tour');
  doc.fireKey('keydown', { key: 'ArrowLeft', preventDefault() {} });   // dead tour
  assert.equal(done, 1, 'keys after teardown change nothing');
});

check('a target that disappears mid-step (zero rect) ends gracefully', () => {
  const a = fakeEl();
  const doc = fakeDoc(), st = fakeStorage();
  let done = false;
  const t = new Tour({ doc, storage: st, onDone: () => { done = true; }, steps: [{ id: 'a', text: 'x', target: () => a }] });
  t.start();
  a.getBoundingClientRect = () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 });
  t._layout();   // the 120ms tracker path
  assert.ok(done && !t.active(), 'vanished target -> clean teardown');
});

// ---- flags / persistence (REWRITTEN for the onboarding rework 2026-09-16) ------
// The flag family shrank from 22 keys to EXACTLY the four kept event coaches.
// Retired with the owner-approved tour deletion: stage1, hud, pilot, focus,
// stance, move, skills, potions, stats, cog, edge, chest, portal, arch,
// shrine, intermission — every scheduled title-walk or in-run card. This is
// an authorized retirement (dispatch 2026-09-16), recorded here so a stale
// flag can never quietly re-arm a deleted coach.
check('flag family is EXACTLY the four kept coaches; tourDone/clear compose', () => {
  const st = fakeStorage();
  assert.deepEqual(Object.keys(TOUR_KEYS).sort(), ['death', 'draft', 'loadout', 'settings'],
    'the family is exactly draft/death/settings/loadout, nothing else');
  for (const k of Object.values(TOUR_KEYS)) assert.ok(k.startsWith('hordes_tour_'), 'key shape: ' + k);
  assert.ok(!tourDone(st), 'fresh save: coaches armed');
  const keys = Object.values(TOUR_KEYS);
  for (const k of keys.slice(0, 2)) setTourFlag(k, true, st);
  assert.ok(!tourDone(st), 'partial flags: tour not done');
  for (const k of keys) setTourFlag(k, true, st);
  assert.ok(tourDone(st), 'all flags -> tour done');
  clearTourFlags(st);
  assert.ok(!tourDone(st), 'replay clears everything');
});

// ---- INTEGRATION (RETIRED + REPLACEMENT, owner-approved 2026-09-16) ------------
// RETIRED ASSERTION — "the stage-1 tour teaches every title card" plus the
// 10-step in-run coachmark chain that followed. The 25-card tour was DELETED
// by the owner-approved onboarding rework (dispatch 2026-09-16; galaxy.click
// feedback: "tons of information thrown at you without context", "skipped
// like 8 tutorial blurbs because I was moving manually"). This is an
// AUTHORIZED retirement, not a weakening; the replacement contract pins what
// the rework actually promises, through the REAL main.js frame loop:
//   1. the title is SELF-LABELLING — no tour-root mounts on a fresh boot;
//   2. HOW TO PLAY is reachable from the title and returns cleanly;
//   3. NO scheduled in-run chain — 35 live sim-seconds mount nothing and
//      never pause the sim (the old hud/pilot/focus/stance/move/skills/
//      potions/stats/cog coaches each FROZE the run until dismissed);
//   4. the KEPT event coaches still fire — the draft card on the first draft
//      (TOUR_KEYS is exactly draft/death/settings/loadout; death/settings/
//      loadout are pinned where they live: test_run_rules, test_settings if
//      present, test_g26_loadout).
// The new in-context hint layer's six invariants are pinned in
// test/test_onboarding.mjs.
await check('integration: title self-labelling; HOW TO PLAY reachable; no in-run chain; draft coach kept', async () => {
  const noop = () => {};
  const fakeCtx = new Proxy({}, {
    get(t, p) { if (p === 'fillStyle' || p === 'globalAlpha') return undefined; return typeof p === 'string' ? noop : undefined; },
    set() { return true; },
  });
  const mk = () => {
    const el = fakeEl();
    // click() must run BOTH routes: main.js cards bind el.onclick (draft
    // picks etc.), the intro/menu also uses addEventListener('click').
    Object.assign(el, { width: 0, height: 0, getContext: () => fakeCtx,
      click() { if (el.onclick) el.onclick(); el.fire('click'); }, onclick: null });
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
  // Onboarded (skip the auto-HOW TO PLAY) but NO tour flags.
  const ls = new Map([['hordes_onboarded', '1']]);
  globalThis.localStorage = {
    getItem: k => (ls.has(k) ? ls.get(k) : null),
    setItem: (k, v) => ls.set(k, String(v)),
    removeItem: k => ls.delete(k),
  };

  const mainMod = await import('../src/main.js');
  const T = mainMod.__TEST;
  // FIRST-RUN PROLOGUE neutralization (the _harness.mjs convention,
  // 2026-09-18): fresh profile here, and run #1 would open INERT (frozen
  // clock, no spawns) — stamp runs=1 so the tour legs run an ordinary run.
  {
    const pr = T.getProfile();
    pr.achievements = pr.achievements || {};
    pr.achievements.totals = pr.achievements.totals || {};
    pr.achievements.totals.runs = 1;
  }
  const st = T.state;
  const dtMs = 1000 / 60;
  const frame = () => {
    now += dtMs;
    const cb = rafQueue.shift();
    if (!cb) throw new Error('raf died');
    cb(now);
  };
  const cards = () => elements['ov-cards'] ? elements['ov-cards'].children : [];
  const cardTitled = (t) => cards().find(c => (c._html || '').includes(t));
  const tourRoots = () => globalThis.document.body.children.filter(c => c.id === 'tour-root');
  const pressPrimary = (rootEl) => {
    const tip = rootEl.children.find(c => c.id === 'tour-tip');
    const btn = tip && tip.querySelector('.tour-next');
    if (btn) btn.fire('pointerdown', { stopPropagation() {}, preventDefault() {} });
  };
  const settleReveal = () => {
    for (let f = 0; f < 400 && !(st.titleReveal && st.titleReveal.phase === 'settled'); f++) frame();
  };

  // Skip the intro movie -> title; the reveal settles (N2) and NOTHING mounts.
  keyHandler({ key: 'x', preventDefault() {} });
  for (let i = 0; i < 5; i++) frame();
  assert.equal(st.mode, 'title', 'title screen up');
  settleReveal();
  for (let i = 0; i < 10; i++) frame();
  assert.equal(tourRoots().length, 0,
    'REPLACEMENT 1: no tour-root mounts on a fresh boot (the title walk is retired; the title is self-labelling)');

  // REPLACEMENT 2: HOW TO PLAY is a real title card, opens the reference
  // screen, and returns to the title through its own GOT IT.
  // MANUAL v2 (2026-09-16): the reference is paginated — page 3 is ONE merged
  // YOUR CONTROLS card teaching BOTH input schemes as subheads (the separate
  // TOUCH / KEYBOARD cards are retired).
  const htp = cardTitled('HOW TO PLAY');
  assert.ok(htp, 'HOW TO PLAY card present on the title');
  htp.click();
  T.manual.goto(3);
  const ctlCard = cardTitled('YOUR CONTROLS');
  assert.ok(ctlCard, 'the how-to screen carries the merged YOUR CONTROLS card');
  const ctlHtml = (ctlCard._html || ctlCard.innerHTML || '');
  assert.ok(/TOUCH CONTROLS/.test(ctlHtml) && /KEYBOARD CONTROLS/.test(ctlHtml),
    'the how-to card teaches BOTH input schemes');
  cardTitled('GOT IT').click();
  assert.equal(st.mode, 'title', 'GOT IT returns to the title');
  settleReveal();

  // REPLACEMENT 3: into a run — 35 live sim-seconds with NO coachmark and NO
  // pause. The old chain fired its first coach at t>1s and froze the sim
  // under every step; with xpMult 0 there is no draft (the draft coach is a
  // KEPT event coach, out of this leg) and a huge HP bar keeps the autopilot
  // from dying into the KEPT death card mid-window.
  cardTitled('START GAME').click();
  for (let i = 0; i < 200 && st.mode !== 'playing'; i++) frame();
  assert.equal(st.mode, 'playing', 'run live (no tour to walk first)');
  st.player.stats.xpMult = 0;
  st.player.stats.maxHp = 1e9;
  st.player.hp = 1e9;
  let sawTour = false;
  for (let i = 0; i < 60 * 36 && st.time < 35; i++) {
    frame();
    if (tourRoots().length) { sawTour = true; break; }
  }
  assert.ok(!sawTour, 'no scheduled in-run coachmark mounted in 35 sim-seconds');
  assert.ok(st.time >= 35, `the sim never paused for a coach (t=${st.time.toFixed(1)}s)`);

  // REPLACEMENT 4: the KEPT draft card still fires on the first draft and
  // never again after its flag is set. MANUAL pilot suspends the auto-pick
  // countdown so the coach is the only thing on the screen.
  st.pilotMode = 'MANUAL';
  st.player.stats.xpMult = 1;
  st.pendingDrafts = 1;
  T.openDraft();
  let roots = tourRoots();
  assert.equal(roots.length, 1, 'the draft coach fired on the first draft');
  const tip = roots[0].children.find(c => c.id === 'tour-tip');
  assert.ok(tip && tip._html.includes('THE DRAFT'), 'the coach names THE DRAFT');
  pressPrimary(roots[0]);
  assert.equal(ls.get(TOUR_KEYS.draft), '1', 'the draft flag persisted');
  cards()[0].click();
  assert.equal(st.mode, 'playing', 'the hand pick resolves the draft under the dismissed coach');
  // Once flagged, a second draft mounts nothing.
  st.pendingDrafts = 1;
  T.openDraft();
  assert.equal(tourRoots().length, 0, 'the flagged draft coach never repeats');
  cards()[0].click();
});

// ---- WAVE-31: a tap ON a title menu card reaches the card ---------------------
// The stage-1 tour spotlights one card at a time, but the player's finger may go
// somewhere else entirely. Before this change the tap was swallowed by the shade
// and merely advanced the tip (found in the phone screenshot review, tick note 2).
check('passThrough: a tap on a real control under the shade presses it and ends the tour', () => {
  const card = fakeEl();
  card.className = 'card';
  let pressed = 0;
  card.click = () => { pressed++; };
  card.closest = (sel) => (sel === '#ov-cards > .card' ? card : null);
  const doc = fakeDoc(), st = fakeStorage();
  doc.elementsFromPoint = () => ([fakeEl('div') /* the shade on top */, card]);
  let done = 0;
  const t = new Tour({
    doc, storage: st, steps: [{ id: 'a', text: 'First', target: () => fakeEl() }],
    passThrough: '#ov-cards > .card', onDone: () => { done++; },
  });
  t.start();
  assert.ok(t.active(), 'mounted');
  t.root.fire('pointerdown', { clientX: 275, clientY: 422, stopPropagation() {} });
  assert.equal(pressed, 1, 'the title menu card got the press');
  assert.equal(done, 1, 'the tour finished - the player chose their own path');
  assert.ok(!t.active(), 'torn down');
});

// The pass-through is OPT-IN: the in-run coachmarks pause the sim under the shade,
// so a tap over a draft card there must not press it. RETARGETED 2026-09-16
// (TUTORIAL_OVERLAY; acceptance 1): this group asserted the old outcome
// "a tap over a card still just ADVANCES". The tap is now INERT — it neither
// presses the card nor advances the tip (the whole point of the overlay).
check('passThrough is opt-in - without it a tap over a card is inert (no press, no advance)', () => {
  const card = fakeEl();
  card.className = 'card';
  let pressed = 0;
  card.click = () => { pressed++; };
  card.closest = (sel) => (sel === '#ov-cards > .card' ? card : null);
  const doc = fakeDoc(), st = fakeStorage();
  doc.elementsFromPoint = () => ([card]);
  const t = new Tour({
    doc, storage: st,
    steps: [{ id: 'a', text: 'First', target: () => fakeEl() }, { id: 'b', text: 'Second', target: () => fakeEl() }],
  });
  t.start();
  t.root.fire('pointerdown', { clientX: 10, clientY: 10, stopPropagation() {} });
  assert.equal(pressed, 0, 'no pass-through by default: the card is never pressed in-run');
  assert.ok(t.active() && t.tip._html.includes('First'), 'the tap did not advance or dismiss either');
  t.skip();   // tear down: the relayout interval is the only thing keeping node alive
});

// A fake doc / old browser with no elementsFromPoint must not break the swallow.
// RETARGETED 2026-09-16: the old group asserted "no hit-test -> plain advance
// -> tour completed". Without hit-test the pass-through simply never fires, so
// the tap is inert; the tour still ends cleanly through its own controls.
check('passThrough falls back safely when the doc cannot hit-test', () => {
  const doc = fakeDoc(), st = fakeStorage();
  let done = 0;
  const t = new Tour({
    doc, storage: st, steps: [{ id: 'a', text: 'First', target: () => fakeEl() }],
    passThrough: '#ov-cards > .card', onDone: () => { done++; },
  });
  t.start();
  t.root.fire('pointerdown', { clientX: 5, clientY: 5, stopPropagation() {} });
  assert.ok(t.active() && done === 0, 'no hit-test -> inert tap, tour still up');
  t.tip.querySelector('.tour-next').fire('pointerdown', { stopPropagation() {}, preventDefault() {} });
  assert.ok(!t.active() && done === 1, 'the primary control completes the tour');
});

console.log(`\n${passed} assertion groups passed — test_tour OK`);
