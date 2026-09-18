// THE WHEEL IS YOURS (owner 2026-09-18: "'It's a good idea though to let the
// user break auto by using a movement key. But the instruction says drag the
// field so the desktop user will try it and it doesn't work.'"). The game has
// exactly two pilot states — a move key (desktop) or a field drag (touch)
// pressed while the pilot flies on AUTO IS the takeover: the mode SWITCHES TO
// MANUAL (no third 'borrowed' state), the announcement toast + the PILOT
// badge read state.pilotMode so both reflect it the same frame, and O / the
// PILOT button cycle back up the ladder (MANUAL -> AUTO ALL -> AUTO MOVE).
// The copy names only the input the player's platform has (the desktop never
// sees 'drag the field'). Pinned here, through the REAL seams:
//   1. KEY TAKEOVER: a move keydown in each AUTO mode switches to MANUAL,
//      sets the held direction, and the toast announces it; non-move keys
//      never take the wheel; keyup clears; the ladder climbs back.
//   2. COPY: banner 1's body is a platform getter — keys on a desktop path,
//      the drag on a touch path, 'The pilot flies for you' in both, and
//      neither variant mentions the other platform's input.
//   3. THE REFERENCE: the pilot row + the manual's move rows carry the
//      takeover in the same words on both paths.
// Real-browser evidence (desktop keypress, touch drag, exact copy on both,
// shots) lives in tools/verify_takeover.mjs.
// Run: node test/test_takeover.mjs
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';
import { CONTROLS, controlById } from '../src/controls_ref.js';

const S = suite('test_takeover');

// ---- 1. KEY TAKEOVER (desktop boot: no touch layer) --------------------------
const h = await boot({ storage: [["hordes_onboarded", "1"]] });
const mainMod = h.mod;
const T = h.T, st = T.state;
const kdown = (k) => h.key('keydown', { key: k, preventDefault() {} });
const kup = (k) => h.key('keyup', { key: k });

// straight into a run through the real seam
T.startRun();
st.enemies.length = 0; st.spawnTimer = 999; st.wave.endsAt = st.time + 9999;
T.setPilotMode('AUTO_ALL');
h.pump(1);
assert.equal(st.mode, 'playing', 'fixture: a live run in AUTO_ALL');

S.check('a MOVE KEY takes the wheel from AUTO_ALL — mode becomes MANUAL, direction held', () => {
  kdown('a');
  assert.equal(st.pilotMode, 'MANUAL', 'the takeover IS the mode switch (got ' + st.pilotMode + ')');
  assert.equal(T.pilotInput.left, true, 'the key holds its direction');
  kup('a');
  assert.equal(T.pilotInput.left, false, 'keyup clears it');
});
S.check('AUTO_MOVE too — every AUTO rung is breakable', () => {
  T.setPilotMode('AUTO_MOVE');
  h.pump(1);
  kdown('ArrowUp');
  assert.equal(st.pilotMode, 'MANUAL', 'AUTO_MOVE: the move key takes the wheel');
  kup('ArrowUp');
});
S.check('the takeover is ANNOUNCED (the toast names MANUAL)', () => {
  T.setPilotMode('AUTO_ALL');
  h.pump(1);
  st.toasts.length = 0;
  kdown('d'); kup('d');
  const t = st.toasts[st.toasts.length - 1];
  assert.ok(t && /MANUAL/.test(t.msg), 'toast: ' + (t && t.msg));
});
S.check('non-move keys never take the wheel', () => {
  T.setPilotMode('AUTO_ALL');
  h.pump(1);
  for (const k of ['o', 'i', 'm', 'r', 'q', 'e', 'h', 'n', 'g']) {
    kdown(k); kup(k);
    if (k !== 'o') assert.equal(st.pilotMode, 'AUTO_ALL', k + ' must not take the wheel');
    // (o legitimately climbs the ladder — reset between keys)
    T.setPilotMode('AUTO_ALL');
  }
  h.key('keydown', { key: 'Tab', preventDefault() {} });
  assert.equal(st.pilotMode, 'AUTO_ALL', 'Tab is a toggle, not a move key');
  // (the loop's 'i' opened the field report and 'm' the map — close both so
  // the next check's keydowns reach the playing branch again)
  if (st.mode === 'stats') mainMod.__TEST.closeStats();
  st.mapOpen = false;
  h.pump(1);
});
S.check('the way back: O / PILOT cycles the ladder (MANUAL -> AUTO ALL -> AUTO MOVE)', () => {
  T.setPilotMode('AUTO_ALL');
  kdown('a'); kup('a');
  assert.equal(st.pilotMode, 'MANUAL', 'fixture: taken over');
  // (each kdown/kup pair is ONE honest press — the stub carries no repeat
  // flag, and 'o' is REPEAT_GUARDED in the real browser besides)
  kdown('o'); kup('o');
  assert.equal(st.pilotMode, 'AUTO_ALL', 'one O press back to AUTO ALL');
  kdown('o'); kup('o');
  assert.equal(st.pilotMode, 'AUTO_MOVE', 'the ladder keeps its middle rung');
  T.setPilotMode('AUTO_ALL');
});
S.check('the takeover persists as the pilot pref (the next run starts MANUAL)', () => {
  T.setPilotMode('AUTO_ALL');
  kdown('s'); kup('s');
  assert.equal(st.pilotMode, 'MANUAL', 'fixture: taken over');
  T.startRun();
  assert.equal(st.pilotMode, 'MANUAL', 'G31 persistence reads the takeover (got ' + st.pilotMode + ')');
  T.setPilotMode('AUTO_ALL');
});

// ---- 2. COPY: banner 1 is a platform getter ----------------------------------
const B = T.prologue.banners;
const touchEl = h.elements['touch'];
S.check('desktop copy: keys take the wheel — the DRAG line is never shown', () => {
  touchEl.classList.remove('on');
  const body = B[0].body;
  assert.ok(/pilot flies for you/i.test(body), body);
  assert.ok(/move key/i.test(body), 'the key instruction: ' + body);
  assert.ok(!/drag/i.test(body), 'a desktop user must not be told to drag: ' + body);
  assert.ok(body.length <= 100, 'house rule: ' + body.length + ' chars');
});
S.check('touch copy: the drag takes the wheel — no key instruction', () => {
  touchEl.classList.add('on');
  const body = B[0].body;
  assert.ok(/pilot flies for you/i.test(body), body);
  assert.ok(/drag the field/i.test(body), 'the drag instruction: ' + body);
  assert.ok(!/key/i.test(body), 'a touch player is never told to press a key: ' + body);
  assert.ok(body.length <= 100, 'house rule: ' + body.length + ' chars');
  touchEl.classList.remove('on');
});

// ---- 3. THE REFERENCE carries the takeover on both paths ---------------------
S.check('the PILOT row names the takeover and the way back', () => {
  const row = controlById('pilot');
  assert.ok(/takes the wheel/i.test(row.purpose), row.purpose);
  assert.ok(/AUTO \/ MANUAL/i.test(row.purpose), row.purpose);
  assert.equal(CONTROLS.filter(c => c.id === 'pilot').length, 1, 'one row, one source');
});
S.check('the manual move rows teach the takeover per path', () => {
  // the manual's own page seam (manualGoto rebuilds the cards — the same
  // builder the title's HOW TO PLAY card lands on; the card navigation is
  // pinned by smoke.mjs). Page 3 is YOUR CONTROLS.
  mainMod.__TEST.manual.goto(3);
  const html = h.elements['ov-cards'].children.map(c => c.innerHTML || '').join('\n');
  assert.ok(/move \(a move key also takes the wheel from AUTO\)/.test(html),
    'the keyboard move row names the key takeover');
  assert.ok(/move \(a drag also takes the wheel from AUTO\)/.test(html),
    'the touch move row names the drag takeover');
  assert.ok(/joystick/.test(html) && /arrows \/ WASD/.test(html),
    'both input paths stay documented');
  // page 2 (OPTIONS AND MODES): the PILOT row states the takeover too
  mainMod.__TEST.manual.goto(2);
  const html2 = h.elements['ov-cards'].children.map(c => c.innerHTML || '').join('\n');
  assert.ok(/a move key or drag takes the wheel/.test(html2),
    'the OPTIONS page carries the same rule: ' + html2.slice(0, 0) + '(checked)');
});

if (S.done() > 0) process.exit(1);
