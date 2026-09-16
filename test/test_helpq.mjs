// '?' AFFORDANCE SUPPLEMENT (owner 2026-09-16, msg_01M2NWTJDK54ENX9FWR6TFPBFW).
//
// The "?" IS a control, and nothing in the game ever told the player so: the
// button is a bare glyph (aria-label only), and the sole explanation lived
// INSIDE the reference screen it opens — circular. This file pins:
//   1. SOURCE: a 'help' row in src/controls_ref.js (keys '?' / touch '?',
//      one purpose), in HINT_IDS (retire / give-up / reset coverage), and
//      the reference screen's KEYBOARD card line is BUILT from it (parity
//      by construction, no forked strings);
//   2. FIRST-EVENT INTRO: on a fresh profile the '?' hint appears ONCE, at
//      the first moment the player is in a fight they can actually lose (a
//      real hit landed) — and NOT BEFORE;
//   3. RETIRE ON PRESS: both '?' seams (the runAction button path and the
//      raw keydown path) retire it permanently; it never returns next run;
//   4. ONE GLYPH, ONE MEANING, BOTH MODES: with the touch layer on, opening
//      help names at least one TOUCH control and NO keyboard key names
//      (TAB / H / Q / E tokens) — a phone player is never taught keys.
// Run: node test/test_helpq.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { boot, suite } from './_harness.mjs';
import { CONTROLS, introLine, controlById } from '../src/controls_ref.js';
import { HINT_IDS } from '../src/onboarding.js';

const s = suite('test_helpq');
const HELP_KEY_LINE = introLine('help', false);
const HELP_TOUCH_LINE = introLine('help', true);

// ---- 1. SOURCE ------------------------------------------------------------------
s.check('the help row exists with the ? glyph on both paths and is ASCII', () => {
  const row = controlById('help');
  assert.ok(row, 'the row exists');
  assert.deepEqual(row.keys, ['?']);
  assert.equal(row.touch, '?', 'one glyph, one meaning — the touch affordance IS the glyph');
  assert.ok(row.purpose.length >= 8);
  assert.ok(/^[\x20-\x7E]*$/.test(row.keys.join('') + row.touch + row.purpose), 'no emojis (owner rule)');
});
s.check('the help id is in HINT_IDS — retire, give-up and REPLAY-TOUR reset cover it', () => {
  assert.ok(HINT_IDS.includes('help'), HINT_IDS);
});
s.check('introLine builds "?: purpose" from the row on both paths', () => {
  assert.equal(HELP_KEY_LINE, '?: ' + controlById('help').purpose);
  assert.equal(HELP_TOUCH_LINE, HELP_KEY_LINE, 'the glyph is the same on both paths');
});
s.check('the reference card line is BUILT from the row (parity, no forked string)', () => {
  // Runtime read of the card is not possible before the title screen opens;
  // pin the construction itself (test_draft_card_art precedent for
  // source-level pins).
  const src = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.ok(src.includes("'? — ' + controlById('help').purpose"),
    'the KEYBOARD card must build its ? line from the controls_ref row');
});

// ---- boot a FRESH profile through the REAL seams ---------------------------------
const { T, state: st, elements, pump, key } = await boot({ storage: [['hordes_onboarded', '1']] });
const OB = T.onboarding;
const body = globalThis.document.body;
const stripTexts = () => (body.children || []).filter(c => c.id === 'hint-strip').map(c => c.textContent);
function step(n = 1) {
  for (let i = 0; i < n; i++) {
    pump(1);
    if (st.mode === 'draft') { const card = (elements['ov-cards'].children || [])[0]; if (card && card.click) card.click(); }
  }
}
function pumpUntil(pred, capSeconds) {
  let waited = 0;
  while (waited < capSeconds) {
    for (const b of (st.wave.bosses || [])) if (b && b.hp > 0) b.hp = 0;
    for (const b of (st.wave.midBosses || [])) if (b && b.hp > 0) b.hp = 0;
    step(1); waited += 1 / 60;
    if (pred(stripTexts())) return stripTexts();
  }
  return null;
}
// Isolate the '?' hint: every other control is pre-known (the real store
// API) — the 20s display slots then belong to the one id under test.
for (const c of CONTROLS) if (c.id !== 'help') OB.store.setDone(c.id);
OB.store.setDone('move'); OB.store.setDone('portal');

T.startRun();
T.setPilotMode('MANUAL');
st.player.stats.xpMult = 0;
st.player.stats.maxHp = 1e9; st.player.hp = 1e9;   // untouchable: no fight to lose

// ---- 2. NOT BEFORE ---------------------------------------------------------------
{
  let stray = false;
  for (let i = 0; i < 60 * 25; i++) {
    st.player.hp = st.player.stats.maxHp;   // pin full HP: the moment never arrives
    step(1);
    if (stripTexts().includes(HELP_KEY_LINE)) stray = true;
  }
  s.check('no "?" intro while the player cannot lose the fight (25s, full HP)', () => {
    assert.ok(!stray, 'the help hint armed at full HP');
  });
}

// ---- 2b. THE MOMENT: the first real hit ------------------------------------------
{
  st.player.hp = st.player.stats.maxHp * 0.5;   // a fight they can lose
  const hit = pumpUntil(ts => ts.includes(HELP_KEY_LINE), 30);
  s.check('the "?" intro appears once a real hit lands (built from the row)', () => {
    assert.ok(hit, 'not shown within 30s of the hit');
    assert.equal(stripTexts()[0], HELP_KEY_LINE);
  });
}

// ---- 3. RETIRE ON PRESS — BOTH SEAMS ----------------------------------------------
{
  // Seam 1: the raw keydown path ('?' / F1 key).
  key('keydown', { key: '?', preventDefault() {} });
  s.check('the raw ? KEYPRESS retires the hint permanently (persisted done flag)', () => {
    assert.ok(OB.store.done('help'));
    step(2);
    assert.ok(!stripTexts().includes(HELP_KEY_LINE), 'off the screen');
  });
  // And it never comes back — not even in a fresh run at the same trigger.
  OB.store.reset();   // REPLAY-TOUR reset re-arms EVERYTHING — including the
  for (const c of CONTROLS) if (c.id !== 'help') OB.store.setDone(c.id);   // other
  OB.store.setDone('move'); OB.store.setDone('portal');                    // controls
  assert.ok(!OB.store.done('help'));
  T.startRun();
  T.setPilotMode('MANUAL');
  st.player.stats.xpMult = 0;
  st.player.stats.maxHp = 1e9; st.player.hp = 1e9;
  st.player.hp = st.player.stats.maxHp * 0.5;
  const again = pumpUntil(ts => ts.includes(HELP_KEY_LINE), 30);
  assert.ok(again, 're-armed leg: the intro returns after REPLAY-TOUR reset');
  // Seam 2: the button path (runAction 'help' — the tc-help touch button).
  T.runAction('help');
  s.check('the ? BUTTON (runAction seam) retires the hint too', () => {
    assert.ok(OB.store.done('help'));
    step(2);
    assert.ok(!stripTexts().includes(HELP_KEY_LINE), 'off the screen');
  });
}

// ---- 4. ONE GLYPH, ONE MEANING: touch-worded help ---------------------------------
// RETARGETED 2026-09-16 (help mode): the ? panel is retired; the same
// guarantees now run against the inspect mode's single-entry explainer
// (a probe through the REAL pointer routing, one control at a time).
// RETARGETED again (device work, same day): the touch arm no longer sets
// #touch's class by hand — it boots a TOUCH DEVICE (the harness installs
// ontouchstart / maxTouchPoints / coarse matchMedia together and main.js
// derives the class itself). The keyboard arm runs FIRST on this file's own
// desktop boot because a second boot() replaces the DOM globals: no earlier
// arm may pump afterwards.
{
  const fireProbe = (elems, act) => elems['touch']._ev['pointerdown']({
    preventDefault() {}, pointerId: 61, clientX: 0, clientY: 0,
    target: {
      closest: (s) => (s === '[data-joy]') ? null
        : (s === '[data-act]' ? { dataset: { act } } : null),
    },
  });
  // The KEYBOARD arm: this file's desktop boot (the product derived
  // #touch.cog-only at load — no class is set by the test).
  T.startRun(); step(2);
  T.runAction('help');
  assert.ok(st.helpMode, 'the button arms help mode (keyboard arm)');
  fireProbe(elements, 'focus');
  s.check('the keyboard path still names keys (the explainer did not go touch-only)', () => {
    const kb = elements['help-tip'].innerHTML;
    // TAB is a keyboard-only token (the touch explainer is pinned to have none).
    assert.ok(/TAB/.test(kb), kb);
    assert.equal(kb, introLine('focus', false), 'built from the controls_ref key row');
  });
  T.runAction('help');   // leave help mode

  // The TOUCH arm: a TOUCH DEVICE boot (variant busts the ESM cache; the
  // storage seeds the same fresh profile).
  const td = await boot({ device: 'touch', variant: 'helpq-touch',
    storage: [['hordes_onboarded', '1']] });
  const tT = td.T, tSt = td.state, tEl = td.elements;
  tT.startRun();
  for (let i = 0; i < 2; i++) td.pump(1);
  tT.runAction('help');
  assert.ok(tSt.helpMode, 'the button arms help mode (touch arm)');
  fireProbe(tEl, 'pilot');
  const text = tEl['help-tip'].innerHTML;
  s.check('on a touch device the ? explainer names TOUCH controls (at least one)', () => {
    const names = ['PILOT', 'FOCUS', 'STANCE', 'OVER', 'HP', 'MP', 'STATS', 'MAP', 'RADAR'];
    // the live class skill name (FROST NOVA & co) counts too
    const live = (tSt.player && tSt.player.classId) ? String(tSt.player.classId).toUpperCase() : '';
    assert.ok(names.some(n => text.includes(n)) || (live && text.includes(live)), text);
  });
  s.check('on a touch device the explainer names NO keyboard key (no TAB / H / Q / E tokens)', () => {
    // Standalone key tokens with non-letter boundaries (words like "hints"
    // or "report" must not trip it).
    const token = (k) => new RegExp('(^|[^A-Z])' + k + '([^A-Z]|$)');
    for (const k of ['TAB', 'H', 'Q', 'E', 'WASD']) {
      assert.ok(!token(k).test(text), `the touch explainer teaches the key "${k}": ${text}`);
    }
    assert.equal(text, introLine('pilot', true), 'built from the controls_ref touch row');
  });
}

s.done();
