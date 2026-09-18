// THE CONTROLS-SURFACE CONTRACT (retargeted for the ONBOARDING RETIREMENT,
// owner 2026-09-18). This file used to pin the PER-CONTROL INTRODUCTIONS hint
// scheduler (first-event triggers, ~20s pacing, demonstrate-then-retire,
// mobile wording) — that layer is DELETED with src/onboarding.js ("a tutorial
// should happen mostly prior to full gameplay"). What this file pins now:
//   1. SOURCE OF TRUTH: src/controls_ref.js is unchanged and still canonical
//      — every CONTROLS row has keys + a touch name + a real purpose, is
//      ASCII, and introLine() builds its line FROM the row (key path names
//      the keys, touch path names the TOUCH control — never a forked
//      string). The manual's controls page and the prologue's staged
//      tooltips both read this table.
//   2. RETIREMENT (runtime): the OLD trigger conditions all forced at once —
//      HP dropped with potions carried, skills ready with live enemies, a
//      portal present, a 6+ crowd with some off-view, a chest off-view —
//      across ~30s of REAL pumped play mount ZERO 'hint-strip' elements
//      (the old scheduler showed its first hint inside ~1s of run start and
//      its first per-control line by ~20s — this leg was RED against it).
//   3. RETIREMENT on a TOUCH device too: the wording question is moot — the
//      strip is gone on every device class.
// Run: node test/test_perctl.mjs
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';
import { CONTROLS, introLine, controlById } from '../src/controls_ref.js';

const s = suite('test_perctl');

// ---- 1. the SOURCE OF TRUTH (carried over unchanged) ----------------------------
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
s.check('the touch path names the TOUCH control, never a key the player does not have', () => {
  for (const c of CONTROLS) {
    const line = introLine(c.id, true);
    assert.ok(line.startsWith(c.touch.toUpperCase() + ': '), c.id + ': ' + line);
  }
});
// The HINT_IDS membership check is RETIRED with the layer (ONBOARDING
// RETIREMENT 2026-09-18): there is no hint store left to cover the ids. The
// rows' teaching coverage now lives where the rows are read: the manual's
// controls page (test_manual.mjs, test_ref_access.mjs) and the prologue's
// staged tooltips (test_prologue.mjs).

// ---- 2. RETIREMENT, runtime: every old trigger condition live, zero mounts ------
const { T, state: st, elements, pump } = await boot({ storage: [['hordes_onboarded', '1']] });
const body = globalThis.document.body;
const stripEls = () => (body.children || []).filter(c => c && c.id === 'hint-strip');
let stripFrames = 0;
function step(n = 1) {
  for (let i = 0; i < n; i++) {
    pump(1);
    if (st.mode === 'draft') {   // a player picks a card and the run resumes
      const card = (elements['ov-cards'].children || [])[0];
      if (card && card.click) card.click();
    }
    stripFrames += stripEls().length;
  }
}

T.banners.suppressAll();
T.startRun();
step(2);
T.setPilotMode('MANUAL');
st.player.stats.xpMult = 0;
st.player.stats.maxHp = 1e9;
// EVERY old trigger condition at once:
st.player.potions.hp = 2; st.player.potions.mp = 2;     // potions carried...
st.player.hp = st.player.stats.maxHp * 0.5;             // ... with HP dropped
st.player.mana = st.player.stats.maxMana;               // skills ready...
for (let i = 0; i < 6; i++) {                           // ... with live enemies,
  st.enemies.push({ typeId: 'CHASER', x: st.player.x + 50 + i * 25, y: st.player.y + (i % 2 ? 30 : -30),
    w: 10, hp: 1e6, maxHp: 1e6, speed: 0, mx: 0, my: 0, age: 0, elite: false });
}
st.enemies.push({ typeId: 'CHASER', x: st.player.x + 5000, y: st.player.y,   // a 7th OFF-VIEW
  w: 10, hp: 1e6, maxHp: 1e6, speed: 0, mx: 0, my: 0, age: 0, elite: false });
st.portal = { x: st.player.x + 4000, y: st.player.y - 3000, age: 0 };        // a portal present (off-view: no walk-in)
st.chests.push({ x: st.player.x - 4000, y: st.player.y, age: 0 });           // a chest off-view
// (shrines seed with the run itself, off-view — the world's own.)

step(60 * 30);   // ~30s of real play — the old layer showed 2+ hints in this window
s.check('30s of play with every retired trigger live mounts ZERO hint strips', () => {
  assert.equal(stripFrames, 0, stripFrames + ' hint-strip frames mounted');
  assert.ok(st.time > 25, 'the sim really ran the window (t=' + st.time.toFixed(1) + ')');
});

// ---- 3. RETIREMENT on a TOUCH device too ------------------------------------------
{
  const td = await boot({ device: 'touch', variant: 'perctl-touch',
    storage: [['hordes_onboarded', '1']] });
  const tT = td.T, tst = td.state;
  const tBody = globalThis.document.body;
  const tStrips = () => (tBody.children || []).filter(c => c && c.id === 'hint-strip');
  let tStripFrames = 0;
  const tStep = (n = 1) => {
    for (let i = 0; i < n; i++) {
      td.pump(1);
      if (tst.mode === 'draft') {
        const card = (td.elements['ov-cards'].children || [])[0];
        if (card && card.click) card.click();
      }
      tStripFrames += tStrips().length;
    }
  };
  tT.banners.suppressAll();
  tT.startRun();
  tStep(2);
  tT.setPilotMode('MANUAL');
  tst.player.stats.xpMult = 0;
  tst.player.stats.maxHp = 1e9;
  tst.player.potions.hp = 2; tst.player.potions.mp = 2;
  tst.player.hp = tst.player.stats.maxHp * 0.4;   // the HP moment
  tst.player.mana = tst.player.stats.maxMana;     // the skill moment
  tStep(60 * 30);
  s.check('a touch DEVICE also mounts zero hint strips in 30s (the wording question is moot)', () => {
    assert.ok(tT.onboarding.touchPath(), 'the boot really is a touch device');
    assert.equal(tStripFrames, 0, tStripFrames + ' hint-strip frames mounted');
    assert.ok(tst.time > 25, 'the sim really ran the window (t=' + tst.time.toFixed(1) + ')');
  });
}

s.done();
