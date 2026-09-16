// HELP MODE + RETIRE THE OLD "?" PANEL (owner 2026-09-16: "We haven't removed
// the old version of the ? Button that was already there - that is the real
// problem" + "Weren't we making the question button allow the user to click a
// button to get help with it?"). One glyph, ONE behaviour, both input paths:
//
// WHAT THIS FILE PINS:
//   1. THE RETIREMENT - after "?" there is NO element carrying two or more
//      control entries (the old four-line key-list panel is GONE, not hidden).
//   2. HELP MODE ITSELF - "?" arms a quiet one-line strip ("tap a control to
//      learn it"); the sim is paused by the player's own invitation.
//   3. ONE EXPLAINER - tapping a control explains THAT control only, built
//      from the controls_ref rows (parity by construction).
//   4. INERTNESS - a tap in help mode NEVER activates: no potion drunk, no
//      skill fired, no draft card picked, no end-screen card navigated.
//   5. OBJECTS - a canvas-point tap picks the world object under it
//      (chest / portal / arch / shrine / ground potion); empty ground
//      explains nothing.
//   6. RETURN-TO-ORIGIN - leaving restores the live run (clock resumes),
//      the death screen, the victory screen and the title, unchanged.
//   7. DEVICE WORDING - the explainer names TOUCH controls on a
//      device-derived touch path (ontouchstart / maxTouchPoints, never a
//      hand-set game flag) and keys on the desktop path.
// Run: node test/test_helpmode.mjs
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';
import { CONTROLS, introLine } from '../src/controls_ref.js';

const S = suite('help mode + retired ? panel');

// Standalone-token test (word-boundary, case-exact) so words like "health"
// can never read as the key "H".
const KEY_TOKENS = CONTROLS.flatMap(c => c.keys).filter(k => k.length <= 5);
const TOUCH_TOKENS = [...new Set(CONTROLS.map(c => c.touch))];
const tokenRe = (k) => new RegExp('(^|[^A-Z0-9])' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^A-Z0-9]|$)');
const hits = (text, tokens) => tokens.filter(k => tokenRe(k).test(text));
// The sweep covers every game element. ONE disclosed exclusion: the opt-in
// TEXT HUD ('hud') — a stats readout that predates "?" and is not a help
// surface (and in a real browser it is absent unless the player opts in;
// the headless harness builds it because it has no layout API).
const allText = (h) => Object.entries(h.elements)
  .filter(([id]) => id !== 'hud')
  .map(([, e]) => (e.innerHTML || '') + ' ' + (e.textContent || ''));

// ---- desktop boot --------------------------------------------------------------
const h = await boot({ storage: [['hordes_onboarded', '1']] });
const T = h.T, st = h.state, elements = h.elements, pump = h.pump, key = h.key;
const tip = () => elements['help-tip'].innerHTML || '';
const strip = () => elements['help-hud'];
const quietField = () => {
  st.enemies.length = 0; st.gems.length = 0; st.drops.length = 0;
  st.spawnTimer = 999; st.wave.endsAt = st.time + 9999;
  st.wave.bosses = []; st.wave.boss = null; st.portal = null;
};
const probe = (act) => elements['touch']._ev['pointerdown']({
  preventDefault() {}, pointerId: 41, clientX: 10, clientY: 10,
  target: { closest: (sel) => sel === '[data-joy]' ? null
    : (sel === '[data-act]' ? { dataset: { act } } : null) },
});
const probeGround = (cx, cy) => elements['touch']._ev['pointerdown']({
  preventDefault() {}, pointerId: 42, clientX: cx, clientY: cy,
  target: { closest: () => null },
});

// ---- 1+2. RETIREMENT + ARMING --------------------------------------------------
S.check('the ? KEY enters help mode (no panel, a quiet one-line strip)', () => {
  T.startRun(); pump(3); quietField();
  key('keydown', { key: '?', preventDefault() {} });
  assert.equal(st.helpMode, true, 'armed');
  assert.equal(st.mode, 'playing', 'the mode is untouched (return-to-origin)');
  const s = strip();
  assert.ok(s.style.display !== 'none' && /HELP MODE/.test(s.textContent),
    'the leave strip is visible (' + s.textContent + ')');
  assert.ok(/LEAVE/i.test(s.textContent), 'it says how to leave');
  assert.ok(!(s.textContent + '').includes('\n'), 'one line');
});
S.check('RETIREMENT: NO element carries two or more control entries', () => {
  for (const t of allText(h)) {
    const found = [...new Set(hits(t, KEY_TOKENS).concat(hits(t, TOUCH_TOKENS)))];
    assert.ok(found.length < 2, 'an element still lists controls (' + found + '): ' + t.slice(0, 120));
  }
});
S.check('a held ? does not strobe the mode', () => {
  key('keydown', { key: '?', repeat: true, preventDefault() {} });
  assert.equal(st.helpMode, true);
});

// ---- 3+4. ONE EXPLAINER, FULLY INERT -------------------------------------------
S.check('tapping HP explains IT (keys wording on the desktop path) and drinks nothing', () => {
  const hp0 = st.player.potions.hp, hpStat0 = st.player.hp;
  probe('h');
  assert.equal(tip(), introLine('potion-hp', false), 'parity with controls_ref');
  assert.equal(hits(tip(), KEY_TOKENS).length, 1, 'exactly one control entry');
  pump(5);
  assert.equal(st.player.potions.hp, hp0, 'no potion was drunk');
  assert.equal(st.player.hp, hpStat0, 'no heal happened');
});
S.check('tapping a skill explains it and fires nothing; the sim stays invited-paused', () => {
  const mana0 = st.player.mana, cd0 = { ...st.player.skillCd }, t0 = st.time,
    x0 = st.player.x, y0 = st.player.y;
  probe('q');
  assert.equal(tip(), introLine('skill-q', false), 'parity with controls_ref');
  probe('w');
  assert.equal(tip(), introLine('skill-w', false), 'parity with controls_ref');
  pump(10);
  assert.equal(st.player.mana, mana0, 'no mana spent');
  assert.deepEqual({ ...st.player.skillCd }, cd0, 'no cooldown started');
  assert.equal(st.time, t0, 'the clock is frozen (the invited pause)');
  assert.equal(st.player.x, x0) && assert.equal(st.player.y, y0);
});
S.check('tapping SETTINGS explains the cog instead of pausing into the menu', () => {
  probe('settings');
  assert.ok(/SETTINGS/i.test(tip()) && /zoom/.test(tip()), 'the cog explained (' + tip() + ')');
  assert.notEqual(st.mode, 'settings', 'settings did not open');
});
S.check('tapping a DRAFT CARD explains it and picks nothing', () => {
  key('keydown', { key: '?', preventDefault() {} });   // leave help mode
  assert.equal(st.helpMode, false);
  pump(2);
  st.pendingDrafts = 1; T.openDraft();
  assert.equal(st.mode, 'draft', 'the draft is up');
  key('keydown', { key: '?', preventDefault() {} });   // help mode ON the draft
  assert.equal(st.helpMode, true, 'help mode arms on the draft screen too');
  const cards0 = elements['ov-cards'].children.length;
  const card = elements['ov-cards'].children[0];
  const name0 = ((card.innerHTML.match(/<div class="name">([^<]*)</) || [])[1] || '')
    .replace(/^\d+\.\s*/, '');   // the draft prefixes '1. ' to the offer name
  card.click();
  assert.ok(tip().includes(name0), 'the tap explained the card (' + tip() + ')');
  assert.equal(st.mode, 'draft', 'still drafting (no pick)');
  assert.equal(elements['ov-cards'].children.length, cards0, 'no card consumed');
  key('keydown', { key: '?' , preventDefault() {} });  // leave, then pick for real
  assert.equal(st.helpMode, false);
  card.click();
  assert.notEqual(st.mode, 'draft', 'a normal tap still takes the offer');
});

// ---- 5. OBJECTS ------------------------------------------------------------------
S.check('a canvas tap picks the WORLD OBJECT under it (chest); empty ground explains nothing', () => {
  T.startRun(); pump(3); quietField();
  key('keydown', { key: '?', preventDefault() {} });
  const p = st.player;
  st.chests.length = 0;
  st.chests.push({ x: p.x, y: p.y, opened: false });
  // Project the chest the way the coachmark engine does (the REAL camera).
  const r = T.helpmode.region(p.x, p.y, 8).getBoundingClientRect();
  probeGround(r.left + r.width / 2, r.top + r.height / 2);
  assert.ok(/CHEST/i.test(tip()) && tip().length > 10, 'the chest explained (' + tip() + ')');
  st.chests.length = 0;
  const far = T.helpmode.region(p.x + 400, p.y + 400, 4).getBoundingClientRect();
  probeGround(far.left + far.width / 2, far.top + far.height / 2);
  assert.equal(tip(), '', 'empty ground explains nothing (no invented message)');
  key('keydown', { key: '?', preventDefault() {} });   // leave for the next check
});
S.check('the object explainers come from THE FIELD reference rows (parity)', () => {
  T.showTitle(); pump(2);
  // open the reference the real way: the title's own HOW TO PLAY card
  const byTitle = (t) => [...elements['ov-cards'].children]
    .find(c => (c.innerHTML || '').includes(t));
  byTitle('HOW TO PLAY').click(); pump(2);
  // MANUAL v2 (2026-09-16): the reference is paginated — THE FIELD rows live
  // on page 4, so the parity sweep collects ALL pages through the page seam.
  let refHtml = '';
  for (let p = 1; p <= 4; p++) {
    T.manual.goto(p);
    refHtml += [...elements['ov-cards'].children].map(c => c.innerHTML || '').join('\n') + '\n';
  }
  T.startRun(); pump(3); quietField();
  key('keydown', { key: '?', preventDefault() {} });
  st.shrines.length = 0;
  st.shrines.push({ x: st.player.x, y: st.player.y, used: false });
  const r = T.helpmode.region(st.player.x, st.player.y, 8).getBoundingClientRect();
  probeGround(r.left + r.width / 2, r.top + r.height / 2);
  assert.ok(/SHRINE/i.test(tip()), 'the shrine explained (' + tip() + ')');
  const purpose = tip().split('\u2014').pop().trim();   // 'NAME — purpose'
  assert.ok(purpose.length > 8 && refHtml.includes(purpose),
    'the explainer text IS a THE FIELD row (got "' + purpose + '")');
});

// ---- 6. RETURN-TO-ORIGIN, ALL FOUR ORIGINS ----------------------------------------
S.check('leaving a live run resumes the SAME run (clock runs again)', () => {
  T.startRun(); pump(3); quietField();
  key('keydown', { key: '?', preventDefault() {} });
  const t0 = st.time;
  probe('h');                                   // one explainer while here
  key('keydown', { key: 'Escape', preventDefault() {} });   // ESC leaves too
  assert.equal(st.helpMode, false, 'left');
  pump(10);
  assert.ok(st.time > t0, 'the clock resumed');
  assert.equal(st.mode, 'playing', 'the run is the same run');
});
S.check('gameplay keys are inert while help mode is up', () => {
  T.startRun(); pump(3); quietField();
  const hp0 = st.player.potions.hp, mana0 = st.player.mana;
  key('keydown', { key: '?', preventDefault() {} });
  for (const k of ['h', 'n', 'q', 'e', 'Tab', 'g', 'o', 'm', 'r', 'i']) {
    key('keydown', { key: k, preventDefault() {} });
  }
  pump(5);
  assert.equal(st.player.potions.hp, hp0, 'no potion via keys');
  assert.equal(st.player.mana, mana0, 'no skill via keys');
  assert.equal(st.mode, 'playing', 'no screen opened');
  key('keydown', { key: '?', preventDefault() {} });
});
S.check('the death screen: cards are explained not pressed; leaving restores it', () => {
  T.startRun(); pump(3); quietField();
  T.die();
  let guard = 0; while (st.mode === 'death-cine' && guard++ < 900) pump(1);
  assert.equal(st.mode, 'dead');
  const deadTitle = elements['ov-title'].textContent;
  key('keydown', { key: '?', preventDefault() {} });
  assert.equal(st.helpMode, true, 'help mode arms on the death screen');
  const cards = [...elements['ov-cards'].children];
  cards[0].click();   // RETRY
  assert.equal(st.mode, 'dead', 'RETRY was explained, not pressed');
  assert.ok(/RETRY/i.test(tip()), 'the explainer names the card (' + tip() + ')');
  key('keydown', { key: '?', preventDefault() {} });
  assert.equal(st.mode, 'dead', 'back on the death screen');
  assert.equal(elements['ov-title'].textContent, deadTitle, 'the SAME end card');
});
S.check('the victory screen and the title round-trip too', () => {
  T.startRun(); pump(3); quietField();
  T.run.runSurvived();
  assert.equal(st.mode, 'dead') && assert.equal(elements['ov-title'].textContent, 'RUN SURVIVED');
  key('keydown', { key: '?', preventDefault() {} });
  key('keydown', { key: '?', preventDefault() {} });
  assert.equal(elements['ov-title'].textContent, 'RUN SURVIVED', 'victory restored');
  T.showTitle(); pump(2);
  assert.equal(st.mode, 'title');
  key('keydown', { key: '?', preventDefault() {} });
  assert.equal(st.helpMode, true, 'arms on the title');
  key('keydown', { key: 'Escape', preventDefault() {} });
  assert.equal(st.mode, 'title', 'title restored');
});
S.check('? is inert on screens help mode cannot serve (settings)', () => {
  T.startRun(); pump(3); quietField();
  T.openSettings();
  key('keydown', { key: '?', preventDefault() {} });
  assert.equal(st.helpMode, false, 'not armed from the settings pause');
  T.closeSettings();
});

// ---- 7. DEVICE-DERIVED WORDING (touch path) ---------------------------------------
// The device surface - ontouchstart / maxTouchPoints / matchMedia - is set by
// the harness BEFORE main.js loads; the game derives its own touch class. No
// game state is set by hand anywhere in this file.
const ht = await boot({ device: 'touch', variant: 'touch', storage: [['hordes_onboarded', '1']] });
const TT = ht.T, tst = ht.state, tel = ht.elements, tpump = ht.pump;
const tti = () => tel['help-tip'].innerHTML || '';
const tprobe = (act) => tel['touch']._ev['pointerdown']({
  preventDefault() {}, pointerId: 51, clientX: 10, clientY: 10,
  target: { closest: (sel) => sel === '[data-joy]' ? null
    : (sel === '[data-act]' ? { dataset: { act } } : null) },
});
S.check('a touch DEVICE boots the touch path (derived, never hand-set)', () => {
  assert.ok(TT.onboarding.touchPath(), 'the touch layer is on');
});
S.check('the touch path: the ? BUTTON arms help mode and the explainer is touch-worded', () => {
  TT.startRun(); tpump(3);
  tst.enemies.length = 0; tst.spawnTimer = 999; tst.wave.endsAt = tst.time + 9999;
  TT.runAction('help');
  assert.equal(tst.helpMode, true, 'the touch button arms it');
  assert.ok(/TAP/.test(tel['help-hud'].textContent), 'touch-worded strip');
  tprobe('h');
  assert.equal(tti(), introLine('potion-hp', true), 'parity with controls_ref (touch row)');
  for (const k of ['TAB', 'Q', 'E', 'H', 'N', 'WASD']) {
    assert.ok(!hits(tti(), [k]).length, 'no key token ' + k + ' on the touch path (' + tti() + ')');
  }
  assert.ok(!hits(tel['help-hud'].textContent, KEY_TOKENS).length,
    'the strip names no keys either (' + tel['help-hud'].textContent + ')');
});
S.check('the touch path: tapping the joystick explains movement; tapping ? leaves', () => {
  tel['touch']._ev['pointerdown']({
    preventDefault() {}, pointerId: 52, clientX: 10, clientY: 10,
    target: { closest: (sel) => sel === '[data-joy]' ? {} : null },
  });
  assert.ok(/joystick/i.test(tti()), 'the joystick explained (' + tti() + ')');
  tprobe('help');   // the ? button is the one act that LEAVES
  assert.equal(tst.helpMode, false, 'one glyph, one door');
  tpump(5);
  assert.ok(tst.mode === 'playing', 'the run is live again');
});

S.done();
