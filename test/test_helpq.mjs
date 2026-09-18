// '?' AFFORDANCE (owner 2026-09-16, msg_01M2NWTJDK54ENX9FWR6TFPBFW) —
// RETARGETED for the ONBOARDING RETIREMENT (owner 2026-09-18). The '?' HINT
// (the intro chip that used to fire on the first losable fight) is gone with
// the hint layer; the '?' CONTROL — help MODE, the tap-to-learn inspector —
// is NOT retired. This file pins:
//   1. SOURCE: a 'help' row in src/controls_ref.js (keys '?' / touch '?',
//      one purpose), ASCII, and the reference screen's KEYBOARD card line
//      BUILT from it (parity by construction, no forked strings);
//   2. THE CONTROL LIVES: pressing '?' through the real keydown seam arms
//      help mode and ESC leaves it; the button path (runAction 'help') arms
//      it too;
//   3. RETIREMENT: the old hint's trigger (a real hit landed — the fight
//      became losable) across 25s of pumped play mounts ZERO 'hint-strip'
//      elements (the old layer showed the '?' intro inside this window);
//   4. ONE GLYPH, ONE MEANING, BOTH MODES: with the touch layer on, the
//      help-mode explainer names at least one TOUCH control and NO keyboard
//      key names (TAB / H / Q / E tokens) — a phone player is never taught
//      keys.
// Run: node test/test_helpq.mjs
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { boot, suite } from './_harness.mjs';
import { CONTROLS, introLine, controlById } from '../src/controls_ref.js';

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
// (The old HINT_IDS membership check is RETIRED with the layer — ONBOARDING
// RETIREMENT 2026-09-18: there is no hint store left to cover the id.)
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
const body = globalThis.document.body;
const stripEls = () => (body.children || []).filter(c => c && c.id === 'hint-strip');
function step(n = 1) {
  for (let i = 0; i < n; i++) {
    pump(1);
    if (st.mode === 'draft') { const card = (elements['ov-cards'].children || [])[0]; if (card && card.click) card.click(); }
  }
}

// ---- 2. THE CONTROL LIVES: '?' arms help mode, ESC leaves -------------------------
T.startRun();
T.setPilotMode('MANUAL');
st.player.stats.xpMult = 0;
st.player.stats.maxHp = 1e9; st.player.hp = 1e9;
step(2);
key('keydown', { key: '?', preventDefault() {} });
s.check('the raw ? KEYPRESS arms help mode (the control is not retired)', () => {
  assert.ok(st.helpMode === true, 'helpMode after ? keydown');
});
key('keydown', { key: 'Escape', preventDefault() {} });
s.check('ESC leaves help mode', () => {
  assert.ok(st.helpMode === false, 'helpMode after ESC');
});
T.runAction('help');
s.check('the ? BUTTON (runAction seam) arms help mode too', () => {
  assert.ok(st.helpMode === true, 'helpMode after runAction');
});
T.runAction('help');
assert.ok(st.helpMode === false, 'fixture: help mode left for the next leg');

// ---- 3. RETIREMENT: the old "?" HINT's trigger mounts nothing ---------------------
// The retired hint fired at the first losable fight (HP dropped). Force
// exactly that and pump 25s: the strip can never mount — the layer is gone.
{
  st.player.potions.hp = 2; st.player.potions.mp = 2;
  st.player.hp = st.player.stats.maxHp * 0.5;   // a fight they can lose (the old trigger)
  let mounts = 0;
  for (let i = 0; i < 60 * 25; i++) { step(1); mounts += stripEls().length; }
  s.check('no hint strip appears when HP drops (the ? hint is retired with the layer)', () => {
    assert.equal(mounts, 0, mounts + ' hint-strip frames in 25s after the hit');
    assert.ok(st.time > 20, 'the sim really ran the window (t=' + st.time.toFixed(1) + ')');
  });
}

// ---- 4. ONE GLYPH, ONE MEANING: touch-worded help ---------------------------------
// The help-mode explainer legs are UNTOUCHED by the retirement (help MODE is
// a live feature): a probe through the REAL pointer routing, one control at
// a time. The keyboard arm runs FIRST on this file's own desktop boot because
// a second boot() replaces the DOM globals: no earlier arm may pump
// afterwards.
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

// ---- 5. the layer the old ? hint rode on is GONE (source pin) ----------------------
s.check('the hint layer itself is deleted (src/onboarding.js absent)', () => {
  assert.equal(existsSync(new URL('../src/onboarding.js', import.meta.url)), false,
    'src/onboarding.js is still on disk');
});

s.done();
