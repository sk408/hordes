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
// innerHTML, appendChild/remove, querySelector('.tour-skip'), and a NON-ZERO
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
      if (sel === '.tour-skip' && el._html.includes('tour-skip')) return skipLinkFor(el);
      return null;
    },
  };
  Object.defineProperty(el, 'innerHTML', {
    get() { return el._html; },
    set(v) { el._html = String(v); if (v === '') el.children.length = 0; },
  });
  return el;
}
// The skip <a> is inside innerHTML — model it as a lazy child handler slot.
const skipLinks = new WeakMap();
function skipLinkFor(tip) {
  if (!skipLinks.has(tip)) {
    const a = fakeEl('a');
    a.className = 'tour-skip';
    skipLinks.set(tip, a);
  }
  return skipLinks.get(tip);
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
  assert.ok(t.tip._html.includes('TAP TO CONTINUE'), 'advance hint');
  assert.ok(t.tip._html.includes('SKIP TOUR'), 'visible skip');
  // shades laid out around the target rect (100,50)-(200,100) + pad 8
  const top = t.shades[0].style;
  assert.equal(top.height, (50 - 8) + 'px', 'shade above hole = target top - pad');
  t.skip();
});

check('clicking anywhere advances; tip text swaps to the next step', () => {
  const a = fakeEl(), b = fakeEl();
  const doc = fakeDoc(), st = fakeStorage();
  let done = 0;
  const t = new Tour({
    doc, storage: st, onDone: () => done++,
    steps: [{ id: 'a', text: 'First', target: () => a }, { id: 'b', text: 'Second', target: () => b }],
  });
  t.start();
  t.root.fire('pointerdown', { stopPropagation() {} });
  assert.ok(t.tip._html.includes('Second'), 'advanced to step 2');
  t.root.fire('pointerdown', { stopPropagation() {} });
  assert.equal(done, 1, 'past the last step -> onDone');
  assert.ok(!t.active(), 'torn down');
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
    skipLinks.get(t.tip).fire('pointerdown', { stopPropagation() {} });
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

check('WAVE-23: any non-Escape key advances; custom advanceHint renders', () => {
  const a = fakeEl(), b = fakeEl();
  const doc = fakeDoc(), st = fakeStorage();
  const t = new Tour({
    doc, storage: st,
    advanceHint: 'CLICK OR PRESS ANY KEY',
    steps: [{ id: 'a', text: 'First', target: () => a }, { id: 'b', text: 'Second', target: () => b }],
  });
  t.start();
  assert.ok(t.tip._html.includes('CLICK OR PRESS ANY KEY'), 'input-aware hint rendered');
  doc.fireKey('keydown', { key: 'm' });          // no preventDefault needed
  assert.ok(t.tip._html.includes('Second'), 'plain key advanced the step');
  doc.fireKey('keydown', { key: 'Escape', preventDefault() {} });
  assert.ok(!t.active(), 'Escape still skips');
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
  assert.equal(st.mode, 'menu', 'title screen up');

  // Stage 1 fired: a #tour-root element exists and points at PLAY.
  const root = () => elements['tour-root'];
  // the Tour appended its root to document.body
  const tourRoot = globalThis.document.body.children.find(c => c.id === 'tour-root');
  assert.ok(tourRoot, 'menu tour mounted');
  const tipOf = () => tourRoot.children.find(c => c.id === 'tour-tip');
  assert.ok(tipOf()._html.includes('PLAY'), 'first step spotlights PLAY');

  // Advance through all 5 steps by clicking (pointerdown contract).
  for (let i = 0; i < 5; i++) tourRoot.fire('pointerdown', { stopPropagation() {} });
  assert.equal(ls.get(TOUR_KEYS.stage1), '1', 'stage-1 flag persisted');
  assert.ok(!globalThis.document.body.children.includes(tourRoot), 'tour unmounted');

  // Into a run.
  const play = cardTitled('PLAY');
  assert.ok(play, 'PLAY card present');
  play.onclick ? play.onclick() : play.fire('click');
  assert.equal(st.mode, 'playing', 'run live');

  // Pump ~2s of frames: the HUD coachmark must fire and FREEZE the sim.
  for (let i = 0; i < 130; i++) frame();
  const coachRoot = globalThis.document.body.children.find(c => c.id === 'tour-root');
  assert.ok(coachRoot, 'HUD coachmark mounted');
  assert.ok(ls.get(TOUR_KEYS.hud) === '1', 'hud coachmark flag set');
  const frozenAt = st.time;
  for (let i = 0; i < 60; i++) frame();   // a full second of frames
  assert.equal(st.time, frozenAt, 'sim PAUSED under the coachmark');

  // Dismiss it; the sim resumes.
  coachRoot.fire('pointerdown', { stopPropagation() {} });
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
    let root2 = null;
    for (let i = 0; i < 60 * 30 && !root2; i++) {
      frame();
      if (st.mode === 'draft' || st.mode === 'evolve') {
        const kids = elements['ov-cards'] ? elements['ov-cards'].children : [];
        if (st.mode === 'evolve' && kids.length) kids[kids.length - 1].click();
        else if (kids.length) kids[0].click();
        else keyHandler({ key: '1' });
        continue;
      }
      if (st.mode === 'dead' || st.mode === 'intermission') {
        // WAVE-23 (#6): any-key advance means main.js swallows keys while a
        // tour is live — dismiss the coach root directly (death/intermission
        // coaches), then drive the screen key (r / c).
        const r = globalThis.document.body.children.find(c => c.id === 'tour-root');
        if (r) { r.fire('pointerdown', { stopPropagation() {} }); continue; }
        keyHandler({ key: st.mode === 'dead' ? 'r' : 'c' });
        continue;
      }
      const r = globalThis.document.body.children.find(c => c.id === 'tour-root');
      if (r) {
        const tip = r.children.find(c => c.id === 'tour-tip');
        if (tip && tip._html.includes(word)) root2 = r;
        else r.fire('pointerdown', { stopPropagation() {} });   // off-chain coach: dismiss
      }
    }
    assert.ok(root2, `coachmark for ${flagKey} mounted (stalled at mode=${st.mode}, t=${st.time.toFixed(0)}s)`);
    const tip = root2.children.find(c => c.id === 'tour-tip');
    assert.ok(tip._html.includes(word), `${flagKey} tip covers "${word}"`);
    // Caption TEXT stays one line-ish (~3 short lines on a 220px tip): strip
    // the hint/skip markup before measuring.
    const caption = tip._html.replace(/<[^>]+>/g, '').replace('TAP TO CONTINUE', '').replace('SKIP TOUR', '');
    assert.ok(caption.length < 200, `${flagKey} caption stays one line-ish (${caption.length} chars)`);
    assert.equal(ls.get(flagKey), '1', `${flagKey} flag persisted`);
    root2.fire('pointerdown', { stopPropagation() {} });   // dismiss -> resume
  }
});

console.log(`\n${passed} assertion groups passed — test_tour OK`);
