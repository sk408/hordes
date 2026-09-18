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

  // (c) REPLAY TOUR from a LIVE RUN's settings: arms the NEXT run + toasts
  // (never yanks the player out of a fight).
  keyHandler({ key: 'escape', preventDefault() {} });   // pause -> settings
  ok('1: settings open mid-run', st.mode === 'settings', st.mode);
  const ovCards1 = globalThis.document.getElementById('ov-cards');
  const htpRun = [...ovCards1.children].find(c => (c._html || '').includes('>HOW TO PLAY<'));
  ok('1: the in-run settings offers HOW TO PLAY', !!htpRun);
  htpRun.click();
  const replayInRun = [...ovCards1.children].find(c => (c._html || '').includes('>REPLAY TOUR<'));
  ok('1: the REPLAY TOUR card exists in the manual (non-gate context)', !!replayInRun);
  replayInRun.click();
  ok('1: REPLAY TOUR from a live run ARMS THE NEXT RUN and says so',
    (st.toasts || []).some(t => /GUIDED WALKTHROUGH ARMS AT NEXT RUN/.test(t.msg)),
    (st.toasts || []).map(t => t.msg));
  ok('1: ...and the live run was NOT yanked (still playing, no prologue)',
    st.mode === 'playing' && !st.prologue, st.mode);

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
  if (tourRoot()) docKey('Escape');   // a fresh death coach may own the keys
  keyHandler({ key: 't', preventDefault() {} });   // TITLE
  ok('1: back on the title', st.mode === 'title', st.mode);

  // (c) REPLAY TOUR from the TITLE: arms + STARTS the special prologue run
  // immediately (the opt-in bypasses C.PROLOGUE.ENABLED, which is OFF here).
  const htpTitle = [...ovCards1.children].find(c => (c._html || '').includes('>HOW TO PLAY<'));
  ok('1: the title offers HOW TO PLAY', !!htpTitle);
  htpTitle.click();
  const replayTitle = [...ovCards1.children].find(c => (c._html || '').includes('>REPLAY TOUR<'));
  ok('1: the REPLAY TOUR card is on the manual from the title too', !!replayTitle);
  replayTitle.click();
  tick(0.2);
  ok('1: REPLAY TOUR from the title STARTS the special run immediately (prologue live)',
    st.mode === 'playing' && !!st.prologue, { mode: st.mode, prologue: !!st.prologue });
  ok('1: the replayed run is flagged ASSISTED', st.assistedRun === true);
  ok('1: the special level stages its potion', !!(st.prologue && st.prologue.potion));
  {
    let maxEnemies = 0;
    for (let i = 0; i < 60 * 4; i++) {
      frame();
      maxEnemies = Math.max(maxEnemies, st.enemies.length);
    }
    ok('1: the special level is INERT — no enemies spawn while the prologue lives',
      maxEnemies === 0 && !!st.prologue, { maxEnemies, t: st.time });
    ok('1: the run clock is frozen while the prologue lives', st.time === 0, st.time);
  }
  // Reset into an ordinary run for ITEM 2 (the opt-in is CONSUMED by the arm).
  T.startRun();
  tick(0.5);
  ok('1: the next run is ordinary again (opt-in consumed, gate still OFF)',
    !st.prologue && st.assistedRun === false && st.mode === 'playing',
    { prologue: !!st.prologue, assisted: st.assistedRun, mode: st.mode });
}

console.log('test_review_round1: item 1 ' + passed + ' checks');

// ---- ITEM 2: SPECIAL RUNS SAY WHAT YOU GET --------------------------------------
// Owner: "special (no potion, etc) runs don't clearly explain what you GET
// from doing them." Every restricted option must state restriction + reward +
// multiplier on the SELECTION surface itself, and the reward must be REAL
// (the settle pays it) — copy the code cannot disagree with.
{
  const { describeChallenge, challengeGoldBonusPct, CHALLENGES } = await import('../src/challenges.js');

  // The phrasing surface: restriction AND reward in one line, for every
  // non-standard mode; STANDARD (no restriction) promises nothing.
  for (const c of CHALLENGES) {
    const line = describeChallenge(c.id);
    if (c.id === 'STANDARD') {
      ok('2: STANDARD names itself without promising a reward', line.includes('STANDARD RUN') && !line.includes('REWARD'), line);
    } else {
      ok('2: ' + c.id + ' states the restriction', line.includes(c.name) && line.includes(c.blurb), line);
      ok('2: ' + c.id + ' states its REWARD with the multiplier',
        /REWARD: \+\d+% END-OF-RUN GOLD/.test(line), line);
      ok('2: ' + c.id + "'s copy matches its actual bonus points",
        line.includes('+' + challengeGoldBonusPct(c.id) + '%'), line);
    }
  }
  ok('2: garbage ids pay and promise nothing (total-over-garbage holds)',
    challengeGoldBonusPct('GARBAGE') === 0 && !describeChallenge('GARBAGE').includes('REWARD'));

  // The settle math: the reward is paid, on the AWARD component.
  const ovCards = globalThis.document.getElementById('ov-cards');
  const killAndSettle = () => {
    st.player.stats.goldMult = 1;                 // zero the persistent chain drift
    st.player.stats.maxHp = 1; st.player.hp = 1;
    let ended = false;
    for (let i = 0; i < 60 * 120 && !ended; i++) {
      frame();
      st.rampage.best = 0; st.rampage.streak = 0; // rampage re-accrues on kills
      ended = st.mode === 'death-cine' || st.mode === 'dead';
    }
    if (st.mode === 'death-cine') { keyHandler({ key: 'x', preventDefault() {} }); }
    // ITEM 1 retarget side effect (ONBOARDING RETIREMENT 2026-09-18): the real
    // REPLAY TOUR card clearTourFlags()s, so the KEPT death coach is re-armed
    // and mounts on this death screen — an undismissed coach freezes the NEXT
    // run's sim. Skip it through the same real Escape path as ITEM 1.
    if (tourRoot()) docKey('Escape');
    return st.runSettled;
  };
  T.getProfile().bestTime = 1e9;   // kill FIRST_CLEAR: isolate the award
  // Baseline first: whatever the run's own gold chain pays at STANDARD (the
  // session's earlier runs may have nudged persistent multipliers — the check
  // is the RATIO, the only thing the challenge should change).
  T.challenge.select('STANDARD');
  T.startRun();
  tick(1);
  let settled = killAndSettle();
  const stdAward = settled && settled.award;
  T.challenge.select('ONE_WEAPON');
  T.startRun();
  tick(1);
  settled = killAndSettle();
  const oneAward = settled && settled.award;
  ok('2: a ONE_WEAPON run settles the AWARD at exactly +200% over STANDARD (300% total)',
    stdAward === 70 && oneAward === Math.round(70 * 3),
    { std: stdAward, one: oneAward });
  ok('2: the settled goldPool reads the additive parts (challenge +2.00, summed)',
    settled && settled.goldPool && settled.goldPool.base === 1 &&
    settled.goldPool.challenge === 2 && settled.goldPool.heat === 0 &&
    settled.goldPool.total === 3, settled && settled.goldPool);

  // ADDITIVE STACKING with a known HEAT level (owner formula: 100% base +
  // challenge + heat, SUMMED — never multiplied). Heat at manual=2 pays
  // +60% (0.30/manual push), so pool = 1 + 2 + 0.6 = 3.6 — a multiplicative
  // misread would pay 1 x 3 x 1.6 = 4.8 instead.
  T.startRun();
  tick(1);
  st.heat.manual = 2;
  settled = killAndSettle();
  ok('2: heat stacks ADDITIVELY — ONE_WEAPON + heat(manual 2) settles at x3.6',
    settled && settled.award === 252 &&
    Math.abs(settled.goldPool.heat - 0.6) < 1e-9 &&
    Math.abs(settled.goldPool.total - 3.6) < 1e-9,
    settled && settled.goldPool);
  // The result screen states the multiplier: the end card's sub-panel carries
  // the GOLD POOL clause while the settled run is still displayed.
  tick(0.5);   // let the dead-screen overlay repaint
  const endSub = globalThis.document.getElementById('ov-sub');
  const endHtml = (endSub && endSub._html) || '';
  ok('2: the result screen shows the GOLD POOL multiplier clause',
    /GOLD POOL x3\.60/.test(endHtml) && endHtml.includes('CHALLENGE +200%') &&
    endHtml.includes('HEAT +60%'), endHtml.slice(0, 300));

  // The SELECTION surface shows the reward (the title CHALLENGE card renders
  // describeChallenge verbatim — sub text is the card's desc line).
  T.challenge.select('NO_POTIONS');
  keyHandler({ key: 't', preventDefault() {} });   // TITLE from the dead screen
  if (tourRoot()) docKey('Escape');                 // a fresh death coach may own the keys
  while (st.mode !== 'title' && st.mode !== 'menu') { keyHandler({ key: 't', preventDefault() {} }); tick(0.5); }
  tick(1);
  // The selection surface: the title SETUP card opens the page whose CHALLENGE
  // row renders describeChallenge verbatim (menuCard: name + desc).
  const setupCard = [...ovCards.children].find(c => (c._html || '').includes('SETUP'));
  ok('2: the title SETUP card is up', !!setupCard);
  setupCard && setupCard.click();
  tick(0.5);
  const chCard = [...ovCards.children].find(c => (c._html || '').includes('CHALLENGE'));
  ok('2: the CHALLENGE selection card is up', !!chCard);
  ok('2: the selection card itself carries the reward line (NO_POTIONS, +200%)',
    chCard && chCard._html.includes('REWARD: +200% END-OF-RUN GOLD'), chCard && chCard._html);

  // SINGLE-CONSTANT proof: the bonus lives in ONE place (RUN_GOLD.CHALLENGE_BONUS_PCT
  // in meta.js) and is never re-literalled in the challenge/selection code.
  const metaSrc = readFileSync(new URL('../src/meta.js', import.meta.url), 'utf8');
  const chSrc = readFileSync(new URL('../src/challenges.js', import.meta.url), 'utf8');
  const mainSrc = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  ok('2: CHALLENGE_BONUS_PCT is defined exactly once (meta.js)',
    (metaSrc.match(/CHALLENGE_BONUS_PCT\s*:/g) || []).length === 1);
  ok('2: the challenge/selection code reads the constant, not a duplicate literal',
    chSrc.includes('RUN_GOLD.CHALLENGE_BONUS_PCT') && !/:\s*200\b/.test(chSrc), chSrc.slice(0, 200));
  ok('2: the settle path reads the constant, not a duplicate literal',
    mainSrc.includes('challengeGoldBonusPct(state.challenge)'), '');
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
  ok('3: health potion effect stated and matches code (+' + P.HP_HEAL + ' HP)',
    F.includes('+' + P.HP_HEAL + ' HP'), F);
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
  // AUTO pilot: the HP line is the potion's heal (msg_01M2RE1V, 2026-09-17 —
  // the HP_FRACTION knob is retired); MP stays a fraction from config.
  ok('3: AUTO auto-drink thresholds stated and match code',
    F.includes("a potion's heal") && F.includes(Math.round(AD.MP_FRACTION * 100) + '%'), F);
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
    /health potion/.test(K) && K.includes('+' + P.HP_HEAL + ' HP'), K.slice(0, 400));
  ok('3: the mana-potion control row reads as a consumable with its amount',
    /mana potion/.test(K) && K.includes('+' + P.MP_RESTORE + ' MP'), K.slice(0, 400));
}

console.log('test_review_round1: items 1-3 ' + passed + ' checks');

// ---- ITEM 4: MINIGAME LENGTH VS PAYOUT -------------------------------------------
// Owner: "The minigame is a nice idea but, for me, just breaks the experience.
// Too long, not enough payout means I always click skip." Shorten the
// interaction (one act fewer, corridor ~halved) and raise the payout (K 1/30
// -> 1/15). Declining stays free and instant-then-carded (skip pays 0 without
// the paid writ, ends after the 1.4s outcome card).
{
  const { PACING, PAYOUT_K } = await import('../src/escape/config.js');
  const { generateCorridor } = await import('../src/escape/generator.js');
  const { nominalSeconds } = await import('../src/escape/sim.js');
  const { payoutFor } = await import('../src/escape/payout.js');

  // BEFORE (read at RED time): 5 acts, nominal 54-66s, K = 1/30.
  ok('4: the escape is FOUR acts (was five)', PACING.ACTS.length === 4,
    PACING.ACTS.map(a => a.name));
  let worst = 0, bestS = Infinity;
  for (let seed = 1; seed <= 20; seed++) {
    const s = nominalSeconds(generateCorridor(seed));
    worst = Math.max(worst, s); bestS = Math.min(bestS, s);
  }
  // RETARGET (map scale-up 2026-09-17, disclosed): this pin read "<= 40s" off
  // the review's corridor-halving; later the SAME DAY the owner directed the
  // bigger map (msg_01M2R8SM: 4 -> 9 units, "report the duration change, never
  // retune it away") and the extent is units-based now, so the honest pin is
  // the units bound (3 x 3000px at 200px/s, +20% authored variance) — the
  // review's tier/payout pins below are untouched, and the duration
  // consequence is reported in docs/art/escape-scaleup-2026-09-17/REPORT.md.
  const { MAP } = await import('../src/escape/config.js');
  const durHi = MAP.UNITS_X * MAP.UNIT_W / PACING.NOMINAL_SPEED *
    (1 + (PACING.MAX_SECONDS - PACING.MIN_SECONDS) / PACING.MIN_SECONDS) + 4;
  ok('4: nominal escape duration is units-based — every seed inside the 3-unit bound (was <= 40s at 2 units)',
    worst <= durHi, { bestS, worst, durHi });
  ok('4: the tier ramp is intact (tiers never decrease, sprint last)',
    PACING.ACTS.every((a, i) => i === 0 || a.tier >= PACING.ACTS[i - 1].tier) &&
    PACING.ACTS[PACING.ACTS.length - 1].tier === 3);
  ok('4: payout raised — K = 1/15 (was 1/30)',
    Math.abs(PAYOUT_K - 1 / 15) < 1e-12, PAYOUT_K);
  ok('4: payoutFor pays floor(bestGold/15) — 12000 banks 800 (was 400)',
    payoutFor(12000) === 800, payoutFor(12000));
  // Gold per second of escape time: before bestGold/(30x~60s) = /1800; after
  // bestGold/(15x~33s) = /495 — >3.6x per minute spent, for a completion.
  // RETARGET (map scale-up 2026-09-17, disclosed): the same-day owner
  // directive grew the map 4 -> 9 units, so the worst case is ~54-58s not
  // ~33s and the honest multiple vs the old baseline is >2x (K's raise to
  // 1/15 is untouched; the duration consequence is reported, not retuned —
  // docs/art/escape-scaleup-2026-09-17/REPORT.md).
  ok('4: payout-per-second at least DOUBLES vs the old length x old K',
    (1 / 15) / (worst || 1) > 2 * (1 / 30) / 60, { worst });

  // Declining stays FREE (and ends after the short outcome card, no corridor):
  // drive the real escape module headlessly, skip on frame one.
  const ESCAPE = await import('../src/escape/index.js');
  let end = null;
  ESCAPE.begin({ seed: 7, ctx: null, auto: false, onEnd: (e) => { end = e; }, test: false });
  ESCAPE.skip();
  for (let i = 0; i < 120 && !end; i++) ESCAPE.frame(null, 1 / 60);
  ok('4: skip ends the sequence without playing it out', end && end.result === 'skip', end);
  ok('4: declining pays NOTHING (no writ held)', end && end.payout === 0, end);
  ok('4: declining is quick — under 3s wall of outcome card, no corridor time',
    end && end.seconds < 3, end && end.seconds);
}

console.log('test_review_round1: ' + passed + ' checks passed (items 1-4)');
