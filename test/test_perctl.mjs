// PER-CONTROL INTRODUCTIONS (owner 2026-09-16: "It's the per button cards.
// We don't have to have cards, really, but at least something that shows
// people how to use them.") — every control names itself, once, at the
// moment it first matters, through the SAME hint-strip engine as the
// in-context touches (no second layer, no retired timer cards, no pauses).
//
// What this file pins, all through the REAL seams (boot + the onboarding
// test seam + the real runAction, never a restated copy):
//   1. SOURCE: src/controls_ref.js is the single source of truth — every row
//      has a key, a touch name and a purpose, is ASCII, and every row id is
//      in HINT_IDS (so the store's retire / give-up / REPLAY-TOUR reset all
//      cover it);
//   2. FIRST-EVENT triggers: a control's hint appears when its moment
//      arrives (HP actually dropped, a skill actually ready) and NOT
//      BEFORE — no clock brings one out;
//   3. PACING: at most one hint per ~20s of play, never during a boss
//      fight, never stacked;
//   4. DEMONSTRATE-THEN-RETIRE: using the control (runAction — the MANUAL
//      seam) retires its hint permanently;
//   5. MOBILE WORDING: with the touch layer on, the hint names the TOUCH
//      control (HP), never a key the player does not have;
//   6. CONTENT PARITY: the displayed lines are introLine() built FROM the
//      reference rows — no forked strings;
//   7. INVARIANTS re-asserted: the sim advances while a per-control hint is
//      visible, the strip is inert (pointer-events:none, zero listeners).
// Run: node test/test_perctl.mjs
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';
import { CONTROLS, introLine, controlById } from '../src/controls_ref.js';
import { HINT_IDS } from '../src/onboarding.js';

const s = suite('test_perctl');
const HINT_TEXTS = Object.fromEntries(CONTROLS.map(c => [c.id, {
  key: introLine(c.id, false), touch: introLine(c.id, true),
}]));

// ---- 1. the SOURCE -------------------------------------------------------------
s.check('every control row has keys, a touch name and a non-empty purpose', () => {
  assert.ok(CONTROLS.length >= 10, 'the button surface is covered');
  for (const c of CONTROLS) {
    assert.ok(Array.isArray(c.keys) && c.keys.length > 0 && c.keys.every(k => typeof k === 'string' && k.length), c.id);
    assert.ok(typeof c.touch === 'string' && c.touch.length, c.id);
    assert.ok(typeof c.purpose === 'string' && c.purpose.length >= 8, c.id);
  }
});
s.check('every row is ASCII (no emojis, owner rule)', () => {
  for (const c of CONTROLS) {
    assert.ok(/^[\x20-\x7E]*$/.test(c.keys.join('')), c.id);
    assert.ok(/^[\x20-\x7E]*$/.test(c.touch), c.id);
    assert.ok(/^[\x20-\x7E]*$/.test(c.purpose), c.id);
  }
});
s.check('introLine names the KEYS on a keyboard path and the TOUCH control on a touch path', () => {
  for (const c of CONTROLS) {
    assert.equal(introLine(c.id, false), c.keys.join(' / ').toUpperCase() + ': ' + c.purpose);
    assert.equal(introLine(c.id, true), c.touch.toUpperCase() + ': ' + c.purpose);
  }
  assert.equal(introLine('no-such-control', false), null, 'unknown id fails safe');
});
s.check('every control id is in HINT_IDS — retire, give-up and REPLAY-TOUR reset cover them all', () => {
  for (const c of CONTROLS) assert.ok(HINT_IDS.includes(c.id), c.id);
});

// ---- boot the REAL game --------------------------------------------------------
const { T, state: st, elements, pump } = await boot({ storage: [['hordes_onboarded', '1']] });
const OB = T.onboarding;
const body = globalThis.document.body;
const stripTexts = () => (body.children || []).filter(c => c.id === 'hint-strip').map(c => c.textContent);
const stripEl = () => (body.children || []).find(c => c.id === 'hint-strip') || null;

// Display ledger for the pacing assertion: every MOUNT of a strip is a
// display event (one at a time by construction — the engine never stacks).
const displays = [];   // { t: state.time, text }
let lastMounted = null;
function step(n = 1) {
  for (let i = 0; i < n; i++) {
    pump(1);
    // A level-up draft PAUSES the hint layer (updateOnboarding ticks only in
    // 'playing') — a player picks a card and the run resumes; do the same
    // through the real click seam (test_draft_card_art precedent). The
    // draft-armed controls (focus/stance/stats) are pre-done above, so the
    // pick arms nothing new.
    if (st.mode === 'draft') {
      const card = (elements['ov-cards'].children || [])[0];
      if (card && card.click) card.click();
    }
    const el = stripEl();
    if (el && el !== lastMounted) { lastMounted = el; displays.push({ t: st.time, text: el.textContent }); }
    if (!el) lastMounted = null;
  }
}
function pumpUntil(pred, simSecondsCap) {
  let waited = 0;
  while (waited < simSecondsCap) {
    step(1); waited += 1 / 60;
    if (pred(stripTexts())) return stripTexts();
  }
  return null;
}
// Run-1 display waits: the run's own midbosses gate every hint (pinned
// below); this leg's player kills them the moment they appear, so the wait
// measures the pacing gate, not the boss timetable. Never touches
// state.finalBoss — the boss-gate check below sets that one deliberately.
// `pin` (optional) runs each frame BEFORE the pump: the not-before legs pin
// mana to 0 — regen is class-dependent and would otherwise re-arm the skill
// moment mid-window.
function pumpUntilCalm(pred, simSecondsCap, pin) {
  let waited = 0;
  while (waited < simSecondsCap) {
    if (pin) pin();
    for (const b of (st.wave.bosses || [])) if (b && b.hp > 0) b.hp = 0;
    for (const b of (st.wave.midBosses || [])) if (b && b.hp > 0) b.hp = 0;
    step(1); waited += 1 / 60;
    if (pred(stripTexts())) return stripTexts();
  }
  return null;
}
const leg = () => {   // a calm, interrupt-free run leg
  T.startRun();
  T.setPilotMode('MANUAL');
  st.player.stats.xpMult = 0;
  st.player.stats.maxHp = 1e9; st.player.hp = 1e9;
  st.player.potions.hp = 2; st.player.potions.mp = 2;
};
// Pre-demonstrate the controls this file does NOT test (the real store API —
// a player who already knows them): the scheduler is one-hint-per-20s, so an
// armed-but-untested control would eat the display slots the checks wait on.
// potion-mp included: whether it arms at all is CLASS-dependent (a
// mana-costed Q vs an ult-charged one), which made the timing flaky.
// Left LIVE on purpose: potion-hp, skill-w (stable across classes), map
// (the ambient pacing ledger wants real traffic). 'help' has its own file
// (test_helpq.mjs) and arms on the same HP drop as potion-hp.
for (const id of ['skill-q', 'potion-mp', 'radar', 'focus', 'stance', 'pilot', 'stats', 'help']) OB.store.setDone(id);

// ---- RUN 1 -----------------------------------------------------------------------
leg();
st.player.mana = 0;   // both skills UNREADY: the skill moment has not arrived

// 2. NOT BEFORE: full HP + no mana => neither the HP potion hint nor a skill
// hint may appear, whatever else the ambient layer does (25s covers the run
// move line, its fade, and the first per-control slot at ~20s).
{
  let strayPotion = false, straySkill = false;
  let waited = 0, maxStack = 0;
  while (waited < 25) {
    st.player.mana = 0;   // pinned: regen is class-dependent and would re-arm the skill moment
    step(1); waited += 1 / 60;
    maxStack = Math.max(maxStack, stripTexts().length);
    for (const t of stripTexts()) {
      if (t === HINT_TEXTS['potion-hp'].key) strayPotion = true;
      if (t === HINT_TEXTS['skill-w'].key) straySkill = true;
    }
  }
  s.check('no HP-potion or skill hint before its moment (25s, full HP, zero mana)', () => {
    assert.ok(!strayPotion, 'the HP potion hint appeared at full HP');
    assert.ok(!straySkill, 'the skill hint appeared with no mana for it');
  });
  s.check('hints never stack — at most ONE strip element at any frame', () => {
    assert.ok(maxStack <= 1, maxStack);
  });
}

// 2b. THE MOMENT ARRIVES: the first real HP drop brings the HP potion hint.
{
  st.player.hp = st.player.stats.maxHp * 0.5;
  const hit = pumpUntilCalm(ts => ts.includes(HINT_TEXTS['potion-hp'].key), 45, () => { st.player.mana = 0; });
  s.check('the HP potion hint appears once HP actually drops (keyboard wording)', () => {
    assert.ok(hit, 'not shown within 45s of the drop');
  });
  s.check('the displayed line is introLine() built FROM the reference row (no forked strings)', () => {
    assert.equal(stripTexts()[0], HINT_TEXTS['potion-hp'].key);
    assert.ok(stripTexts()[0].endsWith(controlById('potion-hp').purpose));
  });
  s.check('the sim ADVANCES while the per-control hint is visible (invariant 1)', () => {
    const t0 = st.time;
    step(30);
    assert.ok(st.time > t0 + 0.4, { was: t0, now: st.time });
  });
  s.check('the per-control strip is inert: pointer-events:none, zero listeners (invariant 2)', () => {
    const el = stripEl();
    assert.ok(el, 'the strip is mounted');
    assert.ok(/pointer-events:\s*none/.test(el.style.cssText || ''), el.style.cssText);
    assert.ok(!el._ev, 'no DOM listeners registered');
  });
}

// 2c. THE SKILL MOMENT: mana restored + a live enemy (the run's own horde —
// enemies spawn on their own) brings the OVERCHARGE hint — but only after
// the ~20s pacing gap behind the potion hint above.
{
  st.player.mana = st.player.stats.maxMana;   // the skill is ready now
  const potionShownAt = st.time;
  const tooEarly = OB.spacing - 6;
  step(Math.ceil(tooEarly * 60));
  s.check('a second armed hint WAITS for the ~20s spacing gap', () => {
    assert.ok(!stripTexts().includes(HINT_TEXTS['skill-w'].key),
      stripTexts() + ' shown only ' + (st.time - potionShownAt).toFixed(1) + 's after the previous hint');
  });
  const hit = pumpUntilCalm(ts => ts.includes(HINT_TEXTS['skill-w'].key), 15);
  s.check('the skill hint appears once a skill is actually ready with combat live', () => {
    assert.ok(hit, 'not shown within 15s more');
    assert.ok(st.time - potionShownAt >= OB.spacing - 0.5,
      `displayed ${(st.time - potionShownAt).toFixed(1)}s after the previous (spacing ${OB.spacing})`);
  });
}

// 4. DEMONSTRATE-THEN-RETIRE, through the REAL manual action seam: casting
// OVERCHARGE (runAction 'w') retires the skill hint permanently.
{
  assert.equal(OB.store.done('skill-w'), false, 'not demonstrated yet');
  T.runAction('w');
  s.check('using the control retires its hint permanently (persisted done flag)', () => {
    assert.ok(OB.store.done('skill-w'), 'the store flag is set by runAction');
    assert.ok(!OB.pending().includes('skill-w'), 'no longer pending');
    step(2);
    assert.ok(!stripTexts().includes(HINT_TEXTS['skill-w'].key), 'off the screen');
  });
}

// ---- RUN 2: the boss gate FIRST (fresh run => the pacing clock reset), then
// mobile wording + the demonstrated control stays retired -------------------------
{
  elements['touch'].classList.add('on');   // the touch layer is the live path read
  leg();
  st.player.mana = 0;   // skills unready: the armed queue is potions/map only

  // 3. NEVER DURING A BOSS FIGHT: startRun reset the pacing clock
  // (hintLastShownAt = -inf), the strip is idle, and map + potion-mp re-arm
  // (they were DISPLAYED in run 1, never demonstrated) — so with a boss live,
  // the boss gate is the ONLY thing holding them. The finale boss object is
  // inert outside 'finale'; here it is exactly the boss-gate's read.
  st.finalBoss = { hp: 100 };
  assert.ok(OB.bossFightLive(), 'the boss gate sees the live boss');
  let showed = false;
  const cap = Math.ceil((OB.spacing + 12) * 60);
  for (let i = 0; i < cap; i++) {
    // wave bosses stay alive too: a boss fight is a boss fight
    step(1);
    if (stripTexts().length > 0) showed = true;
  }
  s.check('NO hint displays while a boss fight is live', () => {
    assert.ok(!showed, stripTexts());
    assert.ok(OB.pending().length > 0, 'the armed hints are waiting, not lost');
  });
  st.finalBoss.hp = 0;   // the cast is down
  const after = pumpUntilCalm(ts => ts.length > 0, 15);
  s.check('the waiting hint displays once the boss fight ends', () => {
    assert.ok(after, 'nothing displayed within 15s of the boss dying');
  });

  // 5. MOBILE WORDING: with the touch layer on, the hint names the TOUCH
  // control — the HP moment returns and the line must read "HP: ...".
  st.player.hp = st.player.stats.maxHp * 0.4;
  const hit = pumpUntilCalm(ts => ts.some(t => t === HINT_TEXTS['potion-hp'].touch), 60);
  s.check('with the touch layer on, the hint names the TOUCH control (HP, not H)', () => {
    assert.ok(hit, 'no HP: line within 60s');
    assert.ok(!hit.includes(HINT_TEXTS['potion-hp'].key), 'the keyboard wording must not be the one shown');
  });
  let skillReturned = false;
  s.check('a demonstrated control never introduces itself again (next run)', () => {
    // scan the rest of the window for the retired skill hint
    for (let i = 0; i < 60 * 20; i++) {
      step(1);
      if (stripTexts().includes(HINT_TEXTS['skill-w'].key) ||
          stripTexts().includes(HINT_TEXTS['skill-w'].touch)) skillReturned = true;
    }
    assert.ok(!skillReturned, 'the OVERCHARGE hint returned after demonstration');
  });
  elements['touch'].classList.remove('on');
}

// 3b. PACING across the whole file: consecutive display events are >= the
// spacing apart (per run; the run boundary resets the clock by design).
{
  const byRun = [];
  let runStartIdx = 0;
  for (let i = 1; i < displays.length; i++) {
    // run 2's displays start after a big time drop (startRun resets state.time)
    if (displays[i].t < displays[i - 1].t - 1) { byRun.push(displays.slice(runStartIdx, i)); runStartIdx = i; }
  }
  byRun.push(displays.slice(runStartIdx));
  s.check('pacing: consecutive hint displays are >= the spacing apart, in every run', () => {
    assert.ok(byRun.length >= 2, byRun.length + ' runs recorded');
    for (const run of byRun) {
      for (let i = 1; i < run.length; i++) {
        assert.ok(run[i].t - run[i - 1].t >= OB.spacing - 0.5,
          `"${run[i].text}" followed "${run[i - 1].text}" after ${(run[i].t - run[i - 1].t).toFixed(1)}s`);
      }
    }
  });
}

s.done();
