// WAVE-21 first-run tour tests — pure engine tests + one full integration
// pass through the REAL main.js frame loop (menu tour -> in-run coachmark
// -> sim pauses -> dismiss -> sim resumes). Run: node test/test_tour.mjs
import assert from 'node:assert/strict';
import { Tour, TOUR_KEYS, tourFlag, setTourFlag, tourStage1Done, tourDone, clearTourFlags }
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

// ---- flags / persistence -------------------------------------------------------
check('flags persist through storage; stage1/tourDone/clear compose', () => {
  const st = fakeStorage();
  assert.ok(!tourStage1Done(st), 'fresh save: no stage-1 flag');
  setTourFlag(TOUR_KEYS.stage1, true, st);
  assert.ok(tourStage1Done(st), 'returning player never sees the menu tour again');
  assert.ok(!tourDone(st), 'stage-2 coachmarks still armed');
  // every stage-2 flag (the coverage checklist) participates in tourDone.
  // WAVE-22 (rev 4): the inventory's MUST-COACHMARK list sets the floor —
  // the doctrine levers, STATS, the interactables, intermission and death.
  const stage2 = Object.values(TOUR_KEYS).filter(k => k !== TOUR_KEYS.stage1);
  for (const need of ['focus', 'stance', 'stats', 'chest', 'portal', 'arch', 'shrine', 'intermission', 'death', 'settings'])
    assert.ok(TOUR_KEYS[need], `coverage key present: ${need}`);
  assert.ok(stage2.length >= 18, 'coverage checklist: 18+ coachmark flags exist, got ' + stage2.length);
  for (const k of stage2) setTourFlag(k, true, st);
  assert.ok(tourDone(st), 'all flags -> tour done');
  clearTourFlags(st);
  assert.ok(!tourStage1Done(st) && !tourDone(st), 'replay clears everything');
});

// ---- INTEGRATION: the real main.js loop ---------------------------------------
// Menu tour starts on the title screen after first boot; the HUD coachmark
// fires at t>1s in-run and PAUSES the sim until dismissed.
await check('integration: menu tour -> run -> coachmark pauses -> dismiss resumes', async () => {
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
    getElementById: (id) => elements[id] ?? (elements[id] = id === 'game' ? mk() : mk()),
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
  // Onboarded (skip HOW TO PLAY) but NO tour flags: the tour must fire.
  const ls = new Map([['hordes_onboarded', '1']]);
  globalThis.localStorage = {
    getItem: k => (ls.has(k) ? ls.get(k) : null),
    setItem: (k, v) => ls.set(k, String(v)),
    removeItem: k => ls.delete(k),
  };

  const mainMod = await import('../src/main.js');
  const st = mainMod.__TEST.state;
  const dtMs = 1000 / 60;
  const frame = () => {
    now += dtMs;
    const cb = rafQueue.shift();
    if (!cb) throw new Error('raf died');
    cb(now);
  };
  const cards = () => elements['ov-cards'] ? elements['ov-cards'].children : [];
  const cardTitled = (t) => cards().find(c => (c._html || '').includes(t));

  // Skip the intro movie -> title.
  keyHandler({ key: 'x', preventDefault() {} });
  for (let i = 0; i < 5; i++) frame();
  assert.equal(st.mode, 'title', 'title screen up');

  // N2 (docs/briefs/N2_TITLE_ART_REVEAL.md DO 4): the reveal owns the first
  // beat — the art alone, then the menu fade — and the tour mounts only once
  // it settles. A coachmark popping mid-fade would read as a glitch.
  assert.ok(!globalThis.document.body.children.find(c => c.id === 'tour-root'),
    'no tour while the reveal is still running (the art-alone beat)');
  for (let f = 0; f < 120 && !(st.titleReveal && st.titleReveal.phase === 'settled'); f++) frame();
  assert.ok(st.titleReveal && st.titleReveal.phase === 'settled',
    'the N2 reveal settled before the tour fires');

  // Stage 1 fired: a #tour-root element exists and points at START GAME.
  const root = () => elements['tour-root'];
  // the Tour appended its root to document.body
  const tourRoot = globalThis.document.body.children.find(c => c.id === 'tour-root');
  assert.ok(tourRoot, 'menu tour mounted');
  const tipOf = () => tourRoot.children.find(c => c.id === 'tour-tip');
  assert.ok(tipOf()._html.includes('START GAME'), 'first step spotlights START GAME');
  // TUTORIAL_OVERLAY: tours advance on the tip card's OWN primary control
  // (NEXT / GOT IT) — a root pointerdown is now an inert shade tap.
  const pressPrimary = (rootEl) => {
    const tip = rootEl.children.find(c => c.id === 'tour-tip');
    const btn = tip && tip.querySelector('.tour-next');
    if (btn) btn.fire('pointerdown', { stopPropagation() {}, preventDefault() {} });
  };
  const dismissTour = (rootEl) => {
    for (let i = 0; i < 8 && globalThis.document.body.children.includes(rootEl); i++) pressPrimary(rootEl);
  };

  // Advance through every step by clicking (pointerdown contract). WAVE-31: the
  // tour is no longer a fixed 5 - TROPHIES shipped after the tour was written and
  // is taught now - so the count is DERIVED from the menu and the assertion is
  // about WHAT it teaches: every title card, the gallery included. A new menu
  // screen that nobody teaches fails here instead of shipping silently.
  //
  // G11: the ONE sanctioned exception is a RECORDED discovery decision. The
  // builder brief (docs/briefs/G11_CHALLENGE_MODES.md B5) rules the CHALLENGE
  // selector is left to discovery — the card's sub-line already names the
  // selection, so a coachmark adds nothing. An exemption is a list entry with
  // a reason, never a deleted assertion: a card that is neither taught nor
  // listed here still fails.
  // G20a: STAGE joins the same exemption for the same reason — it is the
  // CHALLENGE card's exact pattern (a cycling selector whose sub-line names
  // the live selection and, when stages are locked, says what unlocks them),
  // so a coachmark would repeat the card's own text.
  // U1 (owner 2026-09-14): the list is now EMPTY, and that is a tightening, not
  // a relaxation. CHALLENGE and STAGE were title cards whose coachmarks were
  // exempted; both moved behind the SETUP door, so no title card holds an
  // exemption any more and `taught == cards().length` must hold exactly. The
  // mechanism stays so a future title card that nobody teaches still fails.
  // G26 (2026-09-15): the LOADOUT door is the first card since to re-open the
  // list — it is EVENT-TAUGHT instead (the just-in-time coach fires the first
  // time the unlocked-weapon set grows beyond the starter kit, owner's own
  // timing pick), so the title walk must not teach it. The exemption is PAID
  // FOR by the dedicated event test in test/test_g26_loadout.mjs: no coach
  // before the growth, exactly ONE after, the flag prevents a repeat, and the
  // door reachable by real taps with the coach never fired.
  const DISCOVERY_EXEMPT = ['LOADOUT'];
  const seen = [];
  for (let i = 0; i < 12 && globalThis.document.body.children.includes(tourRoot); i++) {
    seen.push(tipOf()._html);
    pressPrimary(tourRoot);
  }
  const taught = seen.length;
  const exempt = cards().filter(c => DISCOVERY_EXEMPT.some(t => (c._html || '').includes('>' + t + '<'))).length;
  assert.equal(exempt, DISCOVERY_EXEMPT.length,
    'every recorded discovery exemption names a real title card');
  assert.equal(taught, cards().length - exempt,
    'stage-1 tour teaches every title card (or holds a recorded exemption for it)');
  assert.ok(seen.some(h => h.includes('TROPHIES')), 'the trophy gallery is taught, not left to luck');
  assert.equal(ls.get(TOUR_KEYS.stage1), '1', 'stage-1 flag persisted');
  assert.ok(!globalThis.document.body.children.includes(tourRoot), 'tour unmounted');

  // Into a run. (G12: PLAY is START GAME now — the retargeted contract. N2:
  // the press fades the menu out and holds the art ~1s before the run.)
  const play = cardTitled('START GAME');
  assert.ok(play, 'START GAME card present');
  play.onclick ? play.onclick() : play.fire('click');
  assert.equal(st.mode, 'title', 'the N2 art hold keeps the title up on the press tick');
  for (let i = 0; i < 130 && st.mode !== 'playing'; i++) frame();
  assert.equal(st.mode, 'playing', 'run live after the art hold');

  // Pump ~2s of frames: the HUD coachmark must fire and FREEZE the sim.
  for (let i = 0; i < 130; i++) frame();
  const coachRoot = globalThis.document.body.children.find(c => c.id === 'tour-root');
  assert.ok(coachRoot, 'HUD coachmark mounted');
  assert.ok(ls.get(TOUR_KEYS.hud) === '1', 'hud coachmark flag set');
  const frozenAt = st.time;
  for (let i = 0; i < 60; i++) frame();   // a full second of frames
  assert.equal(st.time, frozenAt, 'sim PAUSED under the coachmark');

  // Dismiss it through its own primary (GOT IT — a single-step coach); the sim resumes.
  pressPrimary(coachRoot);
  const t0 = st.time;
  for (let i = 0; i < 60; i++) frame();
  assert.ok(st.time > t0, 'sim resumed after dismiss');

  // WAVE-22 (rev 4): the FULL coachmark chain walks in player-flow order —
  // pilot, FOCUS, STANCE, movement, skills (2 steps), potions (2 steps),
  // STATS, cog — each pausing until dismissed. Interactable coaches (chest
  // etc.) may interrupt mid-chain: the off-chain dismissal below absorbs
  // them (their flags get set, coverage unaffected).
  const expect = [
    ['hordes_tour_pilot', 'PILOT'],
    ['hordes_tour_focus', 'FOCUS'],
    ['hordes_tour_stance', 'STANCE'],
    ['hordes_tour_move', 'joystick'],
    ['hordes_tour_skills', 'FROST'],
    ['hordes_tour_potions', 'HP potion'],
    ['hordes_tour_stats', 'FIELD REPORT'],
    ['hordes_tour_cog', 'END RUN'],
  ];
  for (const [flagKey, word] of expect) {
    // pump until the next coachmark mounts (each fires at its time gate).
    // A level-up can open the DRAFT overlay mid-chain: its coachmark (and the
    // overlay itself) is off-chain here — dismiss the coach, pick a card, and
    // keep pumping until OUR step mounts with its own caption.
    // SUITE-REDS R4: this budget used to be a bare 60*30 FRAMES, but
    // coachmarks PAUSE the sim and drafts/intermissions eat frames without
    // advancing state.time — and a death-restart REWINDS the clock to 0 — so
    // a frame count is not time (measured stalls at t=17s/9s/5s, 2 red / 1
    // green). Budget by SIM TIME ACTUALLY ADVANCED instead: the ceiling is 60
    // frames per cumulative lived sim-second (counted monotonically across
    // death-rewinds) plus a generous 60*30 slack for paused frames. Every
    // chain gate is a state.time threshold (the last, hordes_tour_cog, is
    // > 25s), so a healthy run needs ~30 cumulative sim-seconds; death
    // rewinds only ADD to the cumulative count, never subtract. A genuinely
    // stuck sim still hits the ceiling and names itself in the assert below.
    let root2 = null;
    let frames = 0;
    let simLived = 0;
    let lastT = st.time;
    while (!root2 && frames < 60 * Math.ceil(simLived + 31)) {
      frame();
      frames++;
      if (st.time > lastT) { simLived += st.time - lastT; }
      lastT = st.time;
      if (st.mode === 'draft' || st.mode === 'evolve') {
        const kids = elements['ov-cards'] ? elements['ov-cards'].children : [];
        if (st.mode === 'evolve' && kids.length) kids[kids.length - 1].click();
        else if (kids.length) kids[0].click();
        else keyHandler({ key: '1' });
        continue;
      }
      if (st.mode === 'death-cine') {
        // RETARGETED 2026-09-15 (G15 death movie): a death now plays the
        // short cinematic before 'dead' — skip it with any key (the movie's
        // own skip contract); the 'dead' branch below then restarts the run.
        keyHandler({ key: 'x' });
        continue;
      }
      if (st.mode === 'dead' || st.mode === 'intermission') {
        // main.js swallows game keys while a tour is live — dismiss the
        // coach root through its own controls (death/intermission coaches),
        // then drive the screen key (r / c).
        const r = globalThis.document.body.children.find(c => c.id === 'tour-root');
        if (r) { dismissTour(r); continue; }
        keyHandler({ key: st.mode === 'dead' ? 'r' : 'c' });
        continue;
      }
      const r = globalThis.document.body.children.find(c => c.id === 'tour-root');
      if (r) {
        const tip = r.children.find(c => c.id === 'tour-tip');
        if (tip && tip._html.includes(word)) root2 = r;
        else dismissTour(r);   // off-chain coach: dismiss through its controls
      }
    }
    assert.ok(root2, `coachmark for ${flagKey} mounted (stalled at mode=${st.mode}, t=${st.time.toFixed(0)}s)`);
    const tip = root2.children.find(c => c.id === 'tour-tip');
    assert.ok(tip._html.includes(word), `${flagKey} tip covers "${word}"`);
    // Caption TEXT stays one line-ish (~3 short lines on a 220px tip): strip
    // the counter/control markup before measuring.
    const caption = tip._html.replace(/<[^>]+>/g, '')
      .replace(/\d+ OF \d+/g, '')
      .replace(/GOT IT|NEXT|BACK|SKIP TOUR|Replay this any time from SETTINGS/g, '');
    assert.ok(caption.length < 200, `${flagKey} caption stays one line-ish (${caption.length} chars)`);
    assert.equal(ls.get(flagKey), '1', `${flagKey} flag persisted`);
    dismissTour(root2);   // dismiss -> resume
  }
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
