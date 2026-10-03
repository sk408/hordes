// PLAYER-REVIEW ROUND 1 (docs/feedback/2026-09-17-player-review.md) — the
// four mechanical/clarity items, each pinned by checks that failed before the
// fix. Design questions (auto-restart, progression curve, resource kinds,
// settings surface) are deliberately NOT here — they are owner calls tracked
// in docs/briefs/CONDENSE_PROPOSAL.md.
//
// ITEM 1 — TUTORIAL SKIP STILL SHOWS THE NEXT CHIPS (defect). Owner:
//   "clicking 'skip' still shows you the next chips." RETARGETED
//   (ONBOARDING RETIREMENT 2026-09-18): the hint chips are DELETED with the
//   layer, so the defect is now structurally impossible — pinned as source
//   absence + a zero-mount runtime leg. What stays live: SKIP still ends
//   the COACH sequence and toasts the replay pointer, and the REPLAY TOUR
//   card (rewired same-day to start the special prologue run) is pinned in
//   both its contexts (arm-next-run from a live run, immediate start from
//   the title).
// Run: node test/test_review_round1.mjs
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

let passed = 0;
function ok(name, cond, detail) {
  if (!cond) { console.error('  FAIL ' + name + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : '')); process.exit(1); }
  passed++;
  console.log('  ok - ' + name);
}

// ---- shared harness (the test_onboarding Part-B pattern) ------------------------
const noop = () => {};
const fakeCtx = new Proxy({}, {
  get(t, p) { if (p === 'fillStyle' || p === 'globalAlpha') return undefined; return typeof p === 'string' ? noop : undefined; },
  set() { return true; },
});
const domHandlers = new WeakMap();
const mk = () => {
  const el = {
    tagName: 'div', className: '', id: '', style: { cssText: '' }, children: [], parentNode: null, onclick: null,
    _html: '', _text: '',
    addEventListener(ev, cb) { const h = domHandlers.get(el) || {}; (h[ev] = h[ev] || []).push(cb); domHandlers.set(el, h); },
    removeEventListener(ev, cb) { const h = domHandlers.get(el) || {}; h[ev] = (h[ev] || []).filter(f => f !== cb); },
    fire(ev, arg) { for (const cb of ((domHandlers.get(el) || {})[ev] || []).slice()) cb(arg); },
    appendChild(c) { c.parentNode = el; el.children.push(c); return c; },
    remove() { if (el.parentNode) { const i = el.parentNode.children.indexOf(el); if (i >= 0) el.parentNode.children.splice(i, 1); } el.parentNode = null; },
    getBoundingClientRect() { return { left: 10, top: 10, right: 90, bottom: 60, width: 80, height: 50 }; },
    getContext: () => fakeCtx,
    click() { if (el.onclick) el.onclick(); el.fire('click'); },
    width: 0, height: 0,
  };
  // innerHTML = '' clears the children (the harness el() behavior — a stub
  // that keeps stale cards around lets a find() click a DEAD screen's card).
  Object.defineProperty(el, 'innerHTML', { get() { return el._html; },
    set(v) { el._html = String(v); if (v === '') el.children.length = 0; } });
  Object.defineProperty(el, 'textContent', { get() { return el._text; }, set(v) { el._text = String(v); } });
  return el;
};
const elements = {};
const docKeydowns = [];
globalThis.document = {
  getElementById: (id) => elements[id] ?? (elements[id] = mk()),
  createElement: () => mk(),
  body: mk(),
  addEventListener(ev, cb) { if (ev === 'keydown') docKeydowns.push(cb); },
};
let keyHandler = null;
globalThis.window = { addEventListener: (ev, cb) => { if (ev === 'keydown') keyHandler = cb; }, innerWidth: 480, innerHeight: 300 };
let now = 0;
globalThis.performance = { now: () => now };
const rafQueue = [];
globalThis.requestAnimationFrame = (cb) => { rafQueue.push(cb); return rafQueue.length; };
globalThis.location = { reload: noop };
// Fresh profile: onboarded, but NO tour flags (the draft coach must fire).
// ONBOARDING RETIREMENT 2026-09-18: the "hint flags" half of this comment is
// gone with the layer — there are no hint flags anymore.
const ls = new Map([['hordes_onboarded', '1'], ['hordes_hints_off', '1']]);   // first-time hints hold the sim; not this file's subject
globalThis.localStorage = {
  getItem: k => (ls.has(k) ? ls.get(k) : null),
  setItem: (k, v) => ls.set(k, String(v)),
  removeItem: k => ls.delete(k),
};

const mainMod = await import('../src/main.js');
const T = mainMod.__TEST;
// FIRST-RUN PROLOGUE neutralization (the _harness.mjs convention,
// 2026-09-18): fresh profile here, and run #1 would open INERT (frozen
// clock, hints gated) — stamp runs=1 so the review legs run an ordinary run.
{
  const pr = T.getProfile();
  pr.achievements = pr.achievements || {};
  pr.achievements.totals = pr.achievements.totals || {};
  pr.achievements.totals.runs = 1;
}
const st = T.state;
const frame = () => { now += 1000 / 60; const cb = rafQueue.shift(); if (!cb) throw new Error('raf died'); cb(now); };
const tick = (s) => { for (let i = 0, n = Math.round(s * 60); i < n; i++) frame(); };
const stripEls = () => globalThis.document.body.children.filter(c => c.id === 'hint-strip');
const tourRoot = () => globalThis.document.body.children.find(c => c.id === 'tour-root');
const docKey = (key) => { for (const cb of docKeydowns.slice()) cb({ key, preventDefault: noop }); };

// ---- SHARED PHASE-BOUNDARY GUARD (LOAD-FLAKE HARDENING, 2026-09-18) ----------
// Brief docs/briefs/REVIEW_ROUND1_HARDENING.md: this file reded three times in
// one day under suite load, on three DIFFERENT legs, each green standalone —
// one CLASS: a modal overlay (death/settings coach, prologue banner, level-up
// draft) mounts asynchronously, lands inside a later leg's window, the sim
// pauses, and whatever that leg waited for never happens (the 21:43 red:
// killAndSettle pumped 7200 frames with no death because a re-armed coach had
// frozen the sim). sweepOverlays() dismisses ANY live overlay through its
// REAL path — doc-level Escape for a coach (the Tour.skip funnel; the game
// pause is WINDOW-level, so docKey cannot open settings), a real card click
// for a draft, the real two-tap window-level Escape SKIP for a live prologue
// banner (main.js window keydown -> prologueSkip) — and ensureSimLive() then
// PROVES the sim is unpaused: mode is 'playing' and the run clock advances
// across a tick. A boundary that cannot be unpaused through the real paths is
// a GAME bug — the ok() below goes red; nothing here papers over it.
const draftCard = () => [...globalThis.document.getElementById('ov-cards').children]
  .find(c => c.onclick || (domHandlers.get(c) || {}).click);
const sweepOverlays = () => {
  let swept = false;
  for (let i = 0; i < 40; i++) {
    if (tourRoot()) { docKey('Escape'); tick(0.1); swept = true; continue; }
    if (st.mode === 'draft') {
      const c = draftCard();
      if (c) { c.click(); tick(0.1); swept = true; continue; }
      tick(0.2); continue;   // cards mount asynchronously under load — give the renderer frames
    }
    if (T.tut.hints.active) {   // a first-time hint (e.g. the second-run line) holds the sim
      tick(0.5); keyHandler({ key: 'Enter', preventDefault: noop }); tick(0.1);
      swept = true; continue;
    }
    if (T.tut.live) {
      keyHandler({ key: 'Escape', preventDefault: noop }); tick(0.1);   // tap 1: arm
      keyHandler({ key: 'Escape', preventDefault: noop }); tick(0.1);   // tap 2: confirm
      swept = true; continue;
    }
    break;
  }
  return swept;
};
const ensureSimLive = (tag) => {
  sweepOverlays();
  ok(tag + ': the boundary is live play (overlay-free)', st.mode === 'playing', st.mode);
  const t0 = st.time;
  tick(0.25);
  ok(tag + ': the sim is UNPAUSED (the run clock advances)', st.time > t0,
    { mode: st.mode, t0, t: st.time, coach: !!tourRoot() });
};

// ---- ITEM 1: SKIP ENDS THE SEQUENCE (RETARGETED, ONBOARDING RETIREMENT 2026-09-18)
// The original item pinned the hint chips (a visible chip + a queued one
// cancelled by the skip, session suppression, REPLAY TOUR re-arm). The hint
// layer is DELETED, so the item's surviving surfaces are pinned instead:
//   a. SKIP still ends the COACH sequence and still TOASTS the replay
//      pointer ('TOUR SKIPPED — REPLAY IT ANY TIME IN SETTINGS');
//   b. "no chips after skip" is now STRUCTURAL — there is no hint layer to
//      mount one (source pin), and the pumped play after the skip mounts no
//      'hint-strip' element (runtime pin);
//   c. REPLAY TOUR is REWIRED (owner 2026-09-18): from a live run's settings
//      it arms the NEXT run and toasts; from the TITLE it starts the special
//      prologue run IMMEDIATELY (state.prologue live, state.assistedRun,
//      inert world, frozen clock — the kill switch bypassed by the opt-in).
{
  keyHandler({ key: 'x', preventDefault() {} });   // skip the intro movie
  tick(1);
  T.startRun();
  ok('1: the run is live', st.mode === 'playing', st.mode);
  // AUTO pilot (the default): the draft auto-picks after its window, so no
  // card clicking is needed after the skip.
  st.player.stats.xpMult = 0;
  st.player.stats.maxHp = 1000; st.player.hp = 600;
  st.player.potions.hp = 1;
  tick(1.0);
  // BOUNDARY GUARD: a boot/title coach mounting here would freeze the run
  // before the gem-push below — the draft would never open (the 12:29-class
  // red). Prove the sim is live before waiting on sim progress.
  ensureSimLive('1: run start');

  // The tour: the first draft (a level-up) coaches through the REAL path —
  // xp crosses the bar through the REAL gem-pickup loop, not a state write.
  st.player.xp = st.player.xpNext - 1;
  T.m3.pushGem({ x: st.player.x, y: st.player.y, xp: 10 });
  tick(0.5);
  ok('1: the draft opened', st.mode === 'draft', st.mode);
  ok('1: the draft coachmark tour is mounted', !!tourRoot());

  // SKIP — the real keyboard path (Escape; the SKIP TOUR control funnels to
  // the same Tour.skip()).
  docKey('Escape');
  ok('1: the tour is gone after skip', !tourRoot());
  ok('1: the skip TOASTS the replay pointer (the tour layer\'s own contract)',
    (st.toasts || []).some(t => /TOUR SKIPPED/.test(t.msg)),
    (st.toasts || []).map(t => t.msg));

  // (b) STRUCTURAL "no chips after skip": there is no hint layer left to
  // mount a chip — not suppressed, DELETED.
  const src = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  ok('1: no chips can exist after a skip — the hint layer is DELETED (source pin)',
    !existsSync(new URL('../src/onboarding.js', import.meta.url)) &&
    !/\bmaybeHint\s*\(|\bpumpHints\s*\(|\bupdateOnboarding\s*\(|\bhintsSuppressed\b/.test(src) &&
    !src.includes("'hint-strip'") && !src.includes('#hint-strip'), '');

  // (b, runtime half) The draft resolves itself (AUTO window) and the rest
  // of the run mounts no hint-strip — the stripEls readout stays empty
  // because the element kind no longer exists.
  let playing = false;
  for (let i = 0; i < 60 * 15 && !playing; i++) { frame(); playing = st.mode === 'playing'; }
  ok('1: the draft auto-resolved after the skip (run continues)', playing, st.mode);
  st.player.stats.maxHp = 1e9; st.player.hp = 1e9;   // untouchable for the sweep
  let leaked = null;
  for (let i = 0; i < 60 * 15; i++) {
    frame();
    if (stripEls().length) { leaked = stripEls().map(e => e.textContent); break; }
  }
  ok('1: NO hint-strip element appears for the rest of the run after skip', leaked === null, leaked);

  // BOUNDARY GUARD (the 20:54 red: the Escape reached a queued draft, not the
  // settings — 'settings open mid-run :: "draft"'). The 15s sweep above can
  // queue a level-up draft/evolve or a coach; dismiss ANY of it through the
  // real paths and prove the sim is unpaused before the pause key lands.
  ensureSimLive('1: pre-pause boundary');

  // (c) REPLAY TOUR from a LIVE RUN's settings: arms the NEXT run + toasts
  // (never yanks the player out of a fight).
  keyHandler({ key: 'escape', preventDefault() {} });   // pause -> settings
  ok('1: settings open mid-run', st.mode === 'settings', st.mode);
  const ovCards1 = globalThis.document.getElementById('ov-cards');
  const htpRun = [...ovCards1.children].find(c => (c._html || '').includes('>HOW TO PLAY<'));
  ok('1: the in-run settings offers HOW TO PLAY', !!htpRun);
  htpRun.click();
  const replayInRun = [...ovCards1.children].find(c => (c._html || '').includes('>REPLAY TUTORIAL<'));
  ok('1: the REPLAY TOUR card exists in the manual (non-gate context)', !!replayInRun);
  replayInRun.click();
  // BOUNDARY GUARD: the arm must leave live play live (nothing modal may be
  // holding the sim when the 'not yanked' check reads the mode).
  ensureSimLive('1: post-REPLAY-arm boundary');
  ok('1: REPLAY TOUR from a live run ARMS THE NEXT RUN and says so',
    (st.toasts || []).some(t => /tutorial starts with your next run/.test(t.msg)),
    (st.toasts || []).map(t => t.msg));
  ok('1: ...and the live run was NOT yanked (still playing, no guided part)',
    st.mode === 'playing' && !T.tut.live, st.mode);

  // End the run through the real path (END RUN -> CONFIRM -> TITLE).
  // NOTE: this file's boot seeds NO tour flags, so the first settings open
  // fired the KEPT settings coach — and while any coach is live the keydown
  // handler yields EVERY key to the tour (coachActive() swallows). Reopen
  // the pause through T.openSettings(), the same function the Escape branch
  // calls (the coach is dismissed below, before the TITLE key).
  T.openSettings();
  const endCard = [...ovCards1.children].find(c => (c._html || '').includes('>END RUN<'));
  ok('1: END RUN card present in settings', !!endCard,
    { mode: st.mode, cards: [...ovCards1.children].map(c => (c._html || '').slice(0, 60)) });
  endCard.click();
  const confirm = [...ovCards1.children].find(c => (c._html || '').includes('CONFIRM END RUN'));
  confirm && confirm.click();
  ok('1: the run ended', st.mode === 'dead', st.mode);
  // BOUNDARY GUARD: the death coach mounts on the death screen ASYNCHRONOUSLY
  // — under load the one-frame-late mount lands after an immediate check and
  // swallows the TITLE key. Let it mount, then dismiss it via the real path.
  tick(0.3);
  sweepOverlays();
  keyHandler({ key: 't', preventDefault() {} });   // TITLE
  ok('1: back on the title', st.mode === 'title', st.mode);

  // (c) REPLAY TOUR from the TITLE: arms + STARTS the special prologue run
  // immediately (the opt-in bypasses C.PROLOGUE.ENABLED, which is OFF here).
  const settingsTitle = [...ovCards1.children].find(c => (c._html || '').includes('>SETTINGS<'));
  ok('1: the title offers SETTINGS', !!settingsTitle);
  settingsTitle.click();
  const htpTitle = [...ovCards1.children].find(c => (c._html || '').includes('>HOW TO PLAY<'));
  ok('1: SETTINGS offers HOW TO PLAY', !!htpTitle);
  htpTitle.click();
  const replayTitle = [...ovCards1.children].find(c => (c._html || '').includes('>REPLAY TUTORIAL<'));
  ok('1: the REPLAY TOUR card is on the manual from the title too', !!replayTitle);
  replayTitle.click();
  tick(0.2);
  ok('1: REPLAY TUTORIAL from the title STARTS the guided run immediately',
    st.mode === 'playing' && T.tut.live, { mode: st.mode, live: T.tut.live });
  ok('1: the replayed run is flagged ASSISTED', st.assistedRun === true);
  ok('1: the guided run shows its first step', !!T.tut.model);
  {
    let maxEnemies = 0;
    for (let i = 0; i < 60 * 4; i++) {
      frame();
      maxEnemies = Math.max(maxEnemies, st.enemies.length);
    }
    ok('1: the guided run fields only a few harmless trainers',
      maxEnemies <= T.tut.TUT.TRAINERS && T.tut.live, { maxEnemies, t: st.time });
    ok('1: the run clock is held at 0 while the guided part lives', st.time === 0, st.time);
  }
  // Reset into an ordinary run for ITEM 2 (the opt-in is CONSUMED by the arm).
  T.startRun();
  tick(0.5);
  // BOUNDARY GUARD: the special run's phase END must not leave anything modal
  // behind (a stale banner/coach here freezes every ITEM 2 leg downstream).
  ensureSimLive('1: ordinary-run reset');
  ok('1: the next run is ordinary again (opt-in consumed, gate still OFF)',
    !T.tut.live && st.assistedRun === false && st.mode === 'playing',
    { live: T.tut.live, assisted: st.assistedRun, mode: st.mode });
}

console.log('test_review_round1: item 1 ' + passed + ' checks');

// ---- ITEM 2: SPECIAL RUNS (removed) ----------------------------------------------
// Owner (2026-09-17): "special (no potion, etc) runs don't clearly explain what
// you GET from doing them." Those modifier runs were removed with the heat dial
// in the world update (2026-10-03): boss rules took their place, and each rule
// states its reward on the boss's banner. What is left to hold here: nothing of
// the old systems is offered or paid.
{
  const metaSrc = readFileSync(new URL('../src/meta.js', import.meta.url), 'utf8');
  const mainSrc = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  ok('2: no challenge module, no bonus constant, no MODIFIER card, no stakes card',
    !existsSync(new URL('../src/challenges.js', import.meta.url)) && !/CHALLENGE_BONUS_PCT/.test(metaSrc) &&
    !mainSrc.includes('MODIFIER: ') && !mainSrc.includes("menuCard('RAISE THE STAKES'"));
}

console.log('test_review_round1: items 1-2 ' + passed + ' checks');

// ---- ITEM 3: POTIONS EXPLAINED IN THE MANUAL -------------------------------------
// Owner: "Potions are illusory - there's always enough on the ground and it's
// not clear how they work." The manual (existing 4-page HOW TO PLAY, no new
// panel) must explain pickup, capacity, effect and refill, and the wording
// must match the CODE — the numbers below are read from config at test time,
// so a future config change that leaves the copy stale fails here.
{
  const ovCards = globalThis.document.getElementById('ov-cards');
  const { CONFIG } = await import('../src/config.js');
  const P = CONFIG.POTIONS;
  const AD = CONFIG.AUTOPILOT.AUTO_DRINK;

  // The manual's page 4 (THE FIELD) is where the field's objects live.
  // BOUNDARY GUARD: clear any lingering title coach before driving the manual
  // surface (a live tour swallows keys and its overlay outlives the leg).
  sweepOverlays();
  T.manual.goto(4);
  tick(0.2);
  const fieldCard = [...ovCards.children].find(c => (c._html || '').includes('THE FIELD'));
  ok('3: the manual FIELD page is up', !!fieldCard);
  const F = (fieldCard && fieldCard._html) || '';
  // Pickup: automatic in range; at cap the potion STAYS on the ground.
  ok('3: pickup is explained as automatic', /automatic/.test(F), F.slice(0, 200));
  ok('3: cap behaviour explained — full inventory leaves them on the ground',
    /ON THE GROUND/.test(F) && F.includes(String(P.MAX_CARRIED)), F.slice(0, 300));
  // Effect: exact amounts, straight from config.
  const healPct = Math.round(P.HP_HEAL_FRAC * 100) + '% of max HP';
  ok('3: health potion effect stated and matches code (+' + healPct + ')',
    F.includes('+' + healPct), F);
  ok('3: mana potion effect stated and matches code (+' + P.MP_RESTORE + ' MP)',
    F.includes('+' + P.MP_RESTORE + ' MP'), F);
  ok('3: no spend at full is stated (charges are never wasted)', /never spent at full|not at full/.test(F), F);
  // Refill: drop chance per kill, adaptive scarcity, run start, Travel Pack.
  // POTION TUNE RETARGET (2026-09-17): the copy now prints 0.6% via toFixed(1)
  // (Math.round would show "1%" for the new 0.006 chance).
  ok('3: refill stated and matches code (' + (P.DROP_CHANCE * 100).toFixed(1) + '% per kill)',
    F.includes((P.DROP_CHANCE * 100).toFixed(1) + '% per kill'), F);
  ok('3: dense swarms drop fewer (adaptive scarcity is named)', /swarm/.test(F), F);
  ok('3: run start count stated (' + P.START + ' of each)', F.includes('starts with ' + P.START + ' of each'), F);
  // AUTO pilot: both lines are fractions of max, read from config.
  ok('3: AUTO auto-drink thresholds stated and match code',
    F.includes('HP at ' + Math.round(AD.HP_FRACTION * 100) + '% of max or less') &&
    F.includes('MP under ' + Math.round(AD.MP_FRACTION * 100) + '% of max'), F);
  // The boss curse: a live boss halves the heal (main.js drinkHealthPotion).
  ok('3: the boss curse is stated (boss live = health potions heal half)',
    /boss curse/i.test(F) && /half/i.test(F), F);

  // The controls page: the H/N rows must read as CONSUMABLES (carried
  // charges with amounts), matching the same config numbers.
  T.manual.goto(3);
  tick(0.2);
  const ctlCard = [...ovCards.children].find(c => (c._html || '').includes('YOUR CONTROLS'));
  ok('3: the manual CONTROLS page is up', !!ctlCard);
  const K = (ctlCard && ctlCard._html) || '';
  ok('3: the health-potion control row reads as a consumable with its amount',
    /health potion/.test(K) && K.includes('+' + healPct), K.slice(0, 400));
  ok('3: the mana-potion control row reads as a consumable with its amount',
    /mana potion/.test(K) && K.includes('+' + P.MP_RESTORE + ' MP'), K.slice(0, 400));
}

console.log('test_review_round1: items 1-3 ' + passed + ' checks');

// ---- ITEM 4: MINIGAME LENGTH VS PAYOUT -------------------------------------------
// Owner: "The minigame is a nice idea but, for me, just breaks the experience.
// Too long, not enough payout means I always click skip." The minigame is gone:
// the escape is a 9 s cinematic that pays in full whether it is watched or
// skipped (src/escape_cine.js). The payout rule kept its raise (K 1/30 -> 1/15).
{
  const ESCAPE = await import('../src/escape_cine.js');
  const { payoutFor, PAYOUT_K } = await import('../src/escape_payout.js');
  ok('4: the escape is a movie of 8-10 s (was a 25-60 s minigame)',
    ESCAPE.DURATION >= 8 && ESCAPE.DURATION <= 10, ESCAPE.DURATION);
  ok('4: payout raised — K = 1/15 (was 1/30)',
    Math.abs(PAYOUT_K - 1 / 15) < 1e-12, PAYOUT_K);
  ok('4: payoutFor pays floor(bestGold/15) — 12000 banks 800 (was 400)',
    payoutFor(12000) === 800, payoutFor(12000));
  // Skipping costs nothing: the same gold, at once.
  const prof = { gold: 0, purchased: {}, achievements: { totals: { bestGold: 12000 } } };
  let end = null;
  ESCAPE.begin({ profile: prof, onEnd: (e) => { end = e; } });
  for (let i = 0; i < 30; i++) ESCAPE.frame(null, 1 / 60);
  ESCAPE.press();
  ok('4: a skip ends the escape at once', end && end.result === 'skip' && end.seconds < 1, end);
  ok('4: a skip pays in full (it used to pay nothing without the writ)',
    end && end.payout === 800 && prof.gold === 800, end);
}

console.log('test_review_round1: ' + passed + ' checks passed (items 1-4)');
