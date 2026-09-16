// THE DEVICE IS A FIRST-CLASS INPUT (2026-09-16, orchestrator dispatch:
// "the suite ran as a desktop in EVERY boot — the harness built a
// plain-object window with no ontouchstart and a matchMedia that always
// reported false, so the only touch-wording tests SET the state the product
// is supposed to derive from the device. A stub that sets derived state is
// how this class of bug survives a green suite").
//
// WHAT THIS FILE PINS — every boot carries opts.device ('touch' /
// 'coarse-only' / 'desktop'), so main.js derives the touch layer's class
// from the device tells itself. NO test here ever touches #touch's class:
//   1. A TOUCH device gets '#touch.on' at MODULE INIT — before any tap or
//      pump (the state a new player first sees);
//   2. the wording that init state produces: the run-start move hint and the
//      per-control intros name TOUCH controls and carry NO keyboard token
//      (TAB / WASD / ESC / H / N / Q / E / I);
//   3. help mode follows the device too (the ? explainer + the HUD strip);
//   4. A COARSE-ONLY device (coarse pointer, no touch events) gets the SAME
//      class the CSS @media (pointer: coarse) already reveals — not
//      'cog-only' with keyboard wording (the residual gap this task fixed);
//   5. A DESKTOP keeps the keyboard table: 'cog-only', key-worded hints,
//      no touch-control names.
// Run: node test/test_device_input.mjs
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';
import { CONTROLS, introLine } from '../src/controls_ref.js';

const s = suite('test_device_input');
// Standalone uppercase tokens with non-letter boundaries — words inside a
// purpose ("hints", "report") never trip these.
const token = (k) => new RegExp('(^|[^A-Z])' + k + '([^A-Z]|$)');
const KEY_TOKENS = ['TAB', 'WASD', 'ESC', 'H', 'N', 'Q', 'E', 'I'];
const TOUCH_NAMES = ['PILOT', 'FOCUS', 'STANCE', 'STATS', 'MAP', 'RADAR', 'OVER', 'HP', 'MP', 'SETTINGS'];

// A calm leg + a strip reader per boot. The harness replaces the DOM
// globals on every boot(), so each arm captures its own body right after
// its boot and never pumps an earlier arm again.
const armFor = async (device, variant) => {
  const h = await boot({ device, variant, storage: [['hordes_onboarded', '1']] });
  const body = globalThis.document.body;
  const stripTexts = () => (body.children || []).filter(c => c.id === 'hint-strip').map(c => c.textContent);
  const stripEl = () => (body.children || []).find(c => c.id === 'hint-strip') || null;
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      h.pump(1);
      if (h.state.mode === 'draft') {
        const card = (h.elements['ov-cards'].children || [])[0];
        if (card && card.click) card.click();
      }
    }
  };
  const calmLeg = () => {
    // Quiet the field (test_helpq precedent) so the moment probes are the
    // only thing that can arm, and pre-know every control this file does
    // not test — the scheduler is one hint per ~20s and an armed-but-
    // untested control would eat the display slots the checks wait on.
    for (const id of ['skill-q', 'potion-mp', 'radar', 'focus', 'stance', 'pilot', 'stats', 'help'])
      h.T.onboarding.store.setDone(id);
    h.T.startRun();
    h.T.setPilotMode('MANUAL');
    const st = h.state;
    st.enemies.length = 0; st.gems.length = 0; st.spawnTimer = 999;
    st.wave.endsAt = st.time + 9999; st.wave.bosses = []; st.wave.boss = null; st.portal = null;
    st.player.stats.xpMult = 0;
    st.player.stats.maxHp = 1e9; st.player.hp = 1e9;
    st.player.mana = 0; st.player.potions.hp = 2; st.player.potions.mp = 2;
  };
  const pumpUntil = (pred, capSeconds) => {
    let waited = 0;
    while (waited < capSeconds) {
      step(1); waited += 1 / 60;
      if (pred(stripTexts())) return stripTexts();
    }
    return null;
  };
  return { ...h, stripTexts, stripEl, step, calmLeg, pumpUntil };
};

// ---- 1+2. A TOUCH DEVICE: the class, the init composition, the wording ----
const tp = await armFor('touch', 'dev-touch');
{
  s.check('a touch device derives #touch.on at MODULE INIT (no test-set class)', () => {
    assert.ok(tp.elements['touch'].classList.contains('on'), 'the product must add .on itself');
    assert.ok(!tp.elements['touch'].classList.contains('cog-only'));
    assert.equal(tp.T.onboarding.touchPath(), true, 'isTouchPath() reads the derived class');
  });
  // INIT-TIME COMPOSITION: the first line a new player reads (the run-start
  // move hint, displayed with no tap involved) must follow the device.
  tp.calmLeg();
  const move = tp.pumpUntil(ts => ts.length > 0, 10);
  s.check('touch device: the run-start hint names the TOUCH move, no WASD token', () => {
    assert.ok(move, 'no run-start hint within 10s');
    assert.ok(/drag to move/.test(move[0]), move[0]);
    for (const k of KEY_TOKENS) assert.ok(!token(k).test(move[0]), `the move hint teaches the key "${k}": ${move[0]}`);
  });
  // The per-control intro moment: the HP drop brings the potion hint, and on
  // a device-derived touch path the line names the TOUCH control.
  tp.state.player.hp = tp.state.player.stats.maxHp * 0.5;
  const hit = tp.pumpUntil(ts => ts.includes(introLine('potion-hp', true)), 60);
  s.check('touch device: the per-control intros name TOUCH controls (HP, not H)', () => {
    assert.ok(hit, 'no hint within 60s of the HP drop');
    assert.equal(hit[0], introLine('potion-hp', true), hit[0]);
    assert.notEqual(hit[0], introLine('potion-hp', false));
  });
  s.check('touch device: no displayed hint ever carries a keyboard token', () => {
    // Sweep the whole window: everything the strip showed is device-worded.
    const seen = new Set(hit);
    for (let i = 0; i < 60 * 10; i++) { tp.step(1); for (const t of tp.stripTexts()) seen.add(t); }
    for (const t of seen) {
      for (const k of KEY_TOKENS) assert.ok(!token(k).test(t), `"${t}" teaches the key "${k}"`);
    }
    assert.ok([...seen].some(t => TOUCH_NAMES.some(n => token(n).test(t))),
      'at least one touch control must be named: ' + [...seen].join(' | '));
  });
  // ---- 3. help mode follows the device (the ? retirement's wording) ----
  s.check('touch device: help mode explains in TOUCH words (probe + HUD strip)', () => {
    tp.T.runAction('help');
    assert.ok(tp.state.helpMode, 'the glyph arms help mode');
    tp.elements['touch']._ev['pointerdown']({
      preventDefault() {}, pointerId: 71, clientX: 0, clientY: 0,
      target: {
        closest: (sel) => (sel === '[data-joy]') ? null
          : (sel === '[data-act]' ? { dataset: { act: 'pilot' } } : null),
      },
    });
    assert.equal(tp.elements['help-tip'].innerHTML, introLine('pilot', true),
      tp.elements['help-tip'].innerHTML);
    assert.ok(/TAP A CONTROL/.test(tp.elements['help-hud'].textContent || ''),
      tp.elements['help-hud'].textContent);
    for (const k of KEY_TOKENS) {
      assert.ok(!token(k).test(tp.elements['help-tip'].innerHTML),
        `the explainer teaches the key "${k}"`);
    }
    tp.T.runAction('help');   // leave, for whatever follows
  });
}

// ---- 4. A COARSE-ONLY DEVICE: the class write agrees with the CSS signal ----
// index.html's @media (pointer: coarse) reveals the pads on this device; the
// JS class write used to disagree ('cog-only' => keyboard wording) — that is
// the residual gap this task fixes.
const co = await armFor('coarse-only', 'dev-coarse');
{
  s.check('a coarse-pointer device with no touch events gets #touch.on, not cog-only (the CSS agrees)', () => {
    assert.ok(globalThis.window.matchMedia('(pointer: coarse)').matches, 'the arm really is coarse');
    assert.ok(!('ontouchstart' in globalThis.window), 'and really has no touch events');
    assert.ok(co.elements['touch'].classList.contains('on'),
      'the class write must honour the same signal the CSS reads');
    assert.equal(co.T.onboarding.touchPath(), true);
  });
  s.check('coarse-only device: the wording follows the class (touch words, no key tokens)', () => {
    co.calmLeg();
    const move = co.pumpUntil(ts => ts.length > 0, 10);
    assert.ok(move, 'no run-start hint within 10s');
    assert.ok(/drag to move/.test(move[0]), move[0]);
    co.state.player.hp = co.state.player.stats.maxHp * 0.5;
    const hit = co.pumpUntil(ts => ts.includes(introLine('potion-hp', true)), 60);
    assert.ok(hit, 'no hint within 60s of the HP drop');
    assert.equal(hit[0], introLine('potion-hp', true), hit[0]);
  });
}

// ---- 5. A DESKTOP: the keyboard table survives the device work ----
const dk = await armFor('desktop', 'dev-desktop');
{
  s.check('a desktop derives #touch.cog-only (the mouse cog path)', () => {
    assert.ok(dk.elements['touch'].classList.contains('cog-only'));
    assert.ok(!dk.elements['touch'].classList.contains('on'));
    assert.equal(dk.T.onboarding.touchPath(), false);
  });
  s.check('desktop: keyboard table — key-worded hints, no touch-control names', () => {
    dk.calmLeg();
    const move = dk.pumpUntil(ts => ts.length > 0, 10);
    assert.ok(move, 'no run-start hint within 10s');
    assert.ok(/WASD/.test(move[0]), 'the desktop move hint names the keys: ' + move[0]);
    dk.state.player.hp = dk.state.player.stats.maxHp * 0.5;
    const hit = dk.pumpUntil(ts => ts.includes(introLine('potion-hp', false)), 60);
    assert.ok(hit, 'no hint within 60s of the HP drop');
    assert.equal(hit[0], introLine('potion-hp', false), hit[0]);
    // Every line the desktop strip ever showed: key-worded, and no touch
    // control NAME (a phone player's button set is not taught here).
    const seen = new Set([...move, ...hit]);
    for (let i = 0; i < 60 * 10; i++) { dk.step(1); for (const t of dk.stripTexts()) seen.add(t); }
    for (const t of seen) {
      for (const n of TOUCH_NAMES) assert.ok(!token(n).test(t), `"${t}" teaches the touch control "${n}"`);
    }
  });
}

// The canonical list still backs both wordings (source pin, both name sets).
s.check('every control row still names both paths (the device work forked no strings)', () => {
  for (const c of CONTROLS) {
    assert.ok(introLine(c.id, true) !== introLine(c.id, false) || c.keys.join('/') === c.touch, c.id);
  }
});

s.done();
