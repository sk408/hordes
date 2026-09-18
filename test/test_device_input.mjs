// THE DEVICE IS A FIRST-CLASS INPUT (2026-09-16, orchestrator dispatch:
// "the suite ran as a desktop in EVERY boot — the harness built a
// plain-object window with no ontouchstart and a matchMedia that always
// reported false, so the only touch-wording tests SET the state the product
// is supposed to derive from the device. A stub that sets derived state is
// how this class of bug survives a green suite").
//
// ONBOARDING RETIREMENT 2026-09-18: the in-run hint layer is GONE — there
// is no hint scheduler, no per-control intro moments, no '#hint-strip'
// element (see test/test_onboarding.mjs for the full retirement pins).
// The device-derived wording now surfaces through ONE live path: the "?"
// explainer (help mode), which forks its strings on the derived touch
// class. So this file pins:
//   1. A TOUCH device gets '#touch.on' at MODULE INIT — before any tap or
//      pump (the state a new player first sees);
//   2. the RETIREMENT holds per device: across ~60s of REAL pumped play on
//      a calm field (run start, an HP drop with potions in hand, mana
//      drained) NO element with id 'hint-strip' EVER mounts — the retired
//      layer cannot reappear on any device class;
//   3. help mode follows the device: the ? explainer names the TOUCH
//      control (introLine(id, true)) and the HUD strip says TAP A CONTROL
//      with NO keyboard token (TAB / WASD / ESC / H / N / Q / E / I);
//   4. A COARSE-ONLY device (coarse pointer, no touch events) gets the SAME
//      class the CSS @media (pointer: coarse) already reveals — not
//      'cog-only';
//   5. A DESKTOP keeps 'cog-only', and its live surfaces carry no
//      touch-control names.
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

// A calm leg + a strip-mount counter per boot. The harness replaces the DOM
// globals on every boot(), so each arm captures its own body right after
// its boot and never pumps an earlier arm again.
const armFor = async (device, variant) => {
  const h = await boot({ device, variant, storage: [['hordes_onboarded', '1']] });
  const body = globalThis.document.body;
  // ONBOARDING RETIREMENT 2026-09-18: ABSENCE probe — count the frames on
  // which ANY element with id 'hint-strip' is mounted. The retired layer
  // must never reappear, on any device class, under any pump.
  let stripFrames = 0;
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      h.pump(1);
      if ((body.children || []).some(c => c && c.id === 'hint-strip')) stripFrames++;
      if (h.state.mode === 'draft') {
        const card = (h.elements['ov-cards'].children || [])[0];
        if (card && card.click) card.click();
      }
    }
  };
  const calmLeg = () => {
    h.T.startRun();
    h.T.setPilotMode('MANUAL');
    const st = h.state;
    st.enemies.length = 0; st.gems.length = 0; st.spawnTimer = 999;
    st.wave.endsAt = st.time + 9999; st.wave.bosses = []; st.wave.boss = null; st.portal = null;
    st.player.stats.xpMult = 0;
    st.player.stats.maxHp = 1e9; st.player.hp = 1e9;
    st.player.mana = 0; st.player.potions.hp = 2; st.player.potions.mp = 2;
  };
  // The old layer's strongest moments, replayed on a calm field: run start,
  // then an HP drop with potions in hand — the two moments that used to
  // mount the move hint and the potion intro.
  const retirementProbe = () => {
    calmLeg();
    step(30 * 60);                       // 30s: run start, idle, full mana
    h.state.player.hp = h.state.player.stats.maxHp * 0.5;   // the HP drop
    step(30 * 60);                       // 30s more with a drinkable potion
    return stripFrames;
  };
  return { ...h, step, calmLeg, retirementProbe, stripCount: () => stripFrames };
};

// ---- 1+2. A TOUCH DEVICE: the class, then the retirement holds on it ----
const tp = await armFor('touch', 'dev-touch');
{
  s.check('a touch device derives #touch.on at MODULE INIT (no test-set class)', () => {
    assert.ok(tp.elements['touch'].classList.contains('on'), 'the product must add .on itself');
    assert.ok(!tp.elements['touch'].classList.contains('cog-only'));
    assert.equal(tp.T.onboarding.touchPath(), true, 'isTouchPath() reads the derived class');
  });
  s.check('touch device: RETIREMENT — no hint-strip ever mounts across the old layer\'s strongest moments', () => {
    const frames = tp.retirementProbe();
    assert.equal(frames, 0, frames + ' hint-strip frames mounted on a touch device');
  });
  // ---- 3. help mode follows the device (the ? explainer's wording) ----
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
// the residual gap this task fixed.
const co = await armFor('coarse-only', 'dev-coarse');
{
  s.check('a coarse-pointer device with no touch events gets #touch.on, not cog-only (the CSS agrees)', () => {
    assert.ok(globalThis.window.matchMedia('(pointer: coarse)').matches, 'the arm really is coarse');
    assert.ok(!('ontouchstart' in globalThis.window), 'and really has no touch events');
    assert.ok(co.elements['touch'].classList.contains('on'),
      'the class write must honour the same signal the CSS reads');
    assert.equal(co.T.onboarding.touchPath(), true);
  });
  s.check('coarse-only device: RETIREMENT — no hint-strip ever mounts either', () => {
    const frames = co.retirementProbe();
    assert.equal(frames, 0, frames + ' hint-strip frames mounted on a coarse-only device');
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
  s.check('desktop: RETIREMENT — no hint-strip ever mounts, and the ? explainer keeps the keyboard table', () => {
    const frames = dk.retirementProbe();
    assert.equal(frames, 0, frames + ' hint-strip frames mounted on a desktop');
    // The desktop's live explainer path: keyboard-worded, no touch names.
    dk.T.runAction('help');
    assert.ok(dk.state.helpMode, 'the glyph arms help mode');
    const hud = dk.elements['help-hud'].textContent || '';
    for (const n of TOUCH_NAMES) assert.ok(!token(n).test(hud), `the desktop help strip teaches the touch control "${n}"`);
    dk.T.runAction('help');
  });
}

// The canonical list still backs both wordings (source pin, both name sets).
s.check('every control row still names both paths (the device work forked no strings)', () => {
  for (const c of CONTROLS) {
    assert.ok(introLine(c.id, true) !== introLine(c.id, false) || c.keys.join('/') === c.touch, c.id);
  }
});

s.done();
