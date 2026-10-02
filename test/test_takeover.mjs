// TAKING THE WHEEL (M3). On AUTO, a move key (desktop) or a field drag (touch)
// steers only while it is held; the pilot takes back WHEEL_HANDBACK_S after
// the release, with an on-screen cue counting down. The pilot MODE never
// changes this way: MANUAL is chosen only by the pilot button / O key (or the
// Advanced settings row), and only that choice is stored. One stray move key
// can no longer leave every later run on MANUAL.
// Pinned here, through the REAL seams:
//   1. HELD TO STEER: a held move key on AUTO moves the hero where it points,
//      the mode stays AUTO, nothing is stored.
//   2. THE HANDBACK: after the release the hero holds still, the cue reads
//      'AUTO in N.Ns', and after WHEEL_HANDBACK_S the pilot drives again.
//   3. MANUAL IS EXPLICIT: O toggles AUTO <-> MANUAL and persists; the old
//      storage key (which a stray key could flip) is ignored.
//   4. COPY: the tutorial's first card and the reference name the platform's
//      own input and say the steering lasts while held.
// Run: node test/test_takeover.mjs
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';
import { buildingRects } from '../src/stage_buildings.js';
import { CONTROLS, controlById } from '../src/controls_ref.js';

const S = suite('test_takeover');

const h = await boot({ storage: [['hordes_onboarded', '1'], ['hordes_pilot', 'MANUAL']] });
const T = h.T, st = T.state;
const kdown = (k) => h.key('keydown', { key: k, preventDefault() {} });
const kup = (k) => h.key('keyup', { key: k });
const quiet = () => { st.enemies.length = 0; st.gems.length = 0; st.spawnTimer = 999; st.wave.endsAt = st.time + 9999; };
const FPS = 60;

S.check('the old pilot key is ignored: a profile trapped on MANUAL starts on AUTO', () => {
  assert.notEqual(T.pilotPrefs.KEY_PILOT, 'hordes_pilot', 'the stored key was renamed');
  T.startRun();
  assert.equal(st.pilotMode, 'AUTO_ALL', 'the stale MANUAL under the old key is not read (got ' + st.pilotMode + ')');
});

T.startRun();
quiet();
st.player.stats.maxHp = 1e9; st.player.hp = 1e9;
h.pump(1);
assert.equal(st.mode, 'playing', 'fixture: a live run');
assert.equal(st.pilotMode, 'AUTO_ALL', 'fixture: AUTO');

// Stand the hero somewhere with no building to the right: the pilot-motion
// seam slides along building walls, which would read as a y drift here.
function clearStart() {
  const rects = buildingRects(st.groundSeed || 0, st.stage);
  const near = (x, y) => rects.some((r) => x + 160 > r.x - 40 && x - 40 < r.x + r.w + 40 && y + 60 > r.y - 40 && y - 60 < r.y + r.h + 40);
  for (let y = -300; y <= 300; y += 60) for (let x = -400; x <= 300; x += 60) {
    if (!near(x, y)) { st.player.x = x; st.player.y = y; return; }
  }
}

S.check('a HELD move key steers on AUTO: the hero goes where it points, the mode stays AUTO', () => {
  quiet();
  clearStart();
  const x0 = st.player.x, y0 = st.player.y;
  kdown('d');
  assert.equal(st.pilotMode, 'AUTO_ALL', 'the key does not change the pilot mode');
  assert.equal(T.pilotInput.right, true, 'the key holds its direction');
  h.pump(30, quiet);
  assert.ok(st.player.x > x0 + 10, 'half a second of D moved the hero right (' + (st.player.x - x0).toFixed(1) + ')');
  assert.ok(Math.abs(st.player.y - y0) < 1, 'and only right');
  assert.equal(T.wheel.t, T.wheel.handbackS, 'the hand-back timer is held full while the key is down');
  assert.equal(T.wheel.cue(), 'YOU STEER', 'the cue says who is steering');
  assert.equal(st.wheelCue, 'YOU STEER', 'and the renderer is handed the same text');
  assert.equal(T.pilotPrefs.storage.getItem(T.pilotPrefs.KEY_PILOT), null, 'nothing was stored');
});

S.check('after the release the hero holds still, the cue counts down, then AUTO drives again', () => {
  kup('d');
  assert.equal(T.pilotInput.right, false, 'keyup clears the direction');
  const x1 = st.player.x, y1 = st.player.y;
  h.pump(Math.round(FPS * 0.5), quiet);
  assert.ok(T.wheel.t > 0 && T.wheel.t < T.wheel.handbackS, 'the hand-back is counting down (' + T.wheel.t.toFixed(2) + ')');
  assert.match(T.wheel.cue(), /^AUTO in \d\.\ds$/, 'the cue reads AUTO in N.Ns: ' + T.wheel.cue());
  assert.equal(st.wheelCue, T.wheel.cue(), 'on screen');
  assert.ok(Math.abs(st.player.x - x1) < 0.01 && Math.abs(st.player.y - y1) < 0.01, 'the hero waits where the player left it');
  // The rest of the window, plus a frame.
  h.pump(Math.round(FPS * (T.wheel.handbackS - 0.5)) + 2, quiet);
  assert.equal(T.wheel.t, 0, 'the wheel is back with the pilot after ' + T.wheel.handbackS + 's');
  assert.equal(T.wheel.cue(), '', 'the cue is gone');
  assert.equal(st.pilotMode, 'AUTO_ALL', 'and the mode never changed');
  // The pilot drives again: put a gem to one side and it walks for it.
  st.gems.push({ x: st.player.x - 60, y: st.player.y, xp: 1, age: 0 });
  const x2 = st.player.x;
  h.pump(60, () => { st.enemies.length = 0; st.spawnTimer = 999; });
  assert.ok(Math.abs(st.player.x - x2) > 1 || st.gems.length === 0, 'the pilot is moving the hero again');
});

S.check('a new key press inside the window takes the wheel straight back', () => {
  quiet();
  kdown('a'); h.pump(5, quiet); kup('a');
  h.pump(20, quiet);
  assert.ok(T.wheel.t > 0, 'counting down');
  const x0 = st.player.x;
  kdown('a'); h.pump(10, quiet);
  assert.equal(T.wheel.t, T.wheel.handbackS, 'held again: the timer is full again');
  assert.ok(st.player.x < x0 - 1, 'and the hero moves');
  kup('a');
  h.pump(Math.round(FPS * T.wheel.handbackS) + 3, quiet);
  assert.equal(T.wheel.t, 0);
});

S.check('AUTO MOVE steers the same way', () => {
  T.setPilotMode('AUTO_MOVE');
  h.pump(1, quiet);
  const y0 = st.player.y;
  kdown('ArrowUp'); h.pump(20, quiet);
  assert.equal(st.pilotMode, 'AUTO_MOVE', 'the mode stays AUTO MOVE');
  assert.ok(st.player.y < y0 - 5, 'the hero moved up');
  kup('ArrowUp');
  h.pump(Math.round(FPS * T.wheel.handbackS) + 3, quiet);
  T.setPilotMode('AUTO_ALL');
});

S.check('non-move keys never take the wheel', () => {
  for (const k of ['i', 'm', 'r', 'q', 'e', 'h', 'n', 'g']) {
    kdown(k); kup(k);
    if (st.mode === 'stats') T.closeStats();
    st.mapOpen = false;
    assert.equal(T.wheel.t, 0, k + ' must not take the wheel');
    assert.equal(st.pilotMode, 'AUTO_ALL', k + ' must not change the mode');
  }
  h.pump(1, quiet);
});

S.check('one stray move key does NOT make the next run MANUAL (the trap is gone)', () => {
  kdown('s'); h.pump(2, quiet); kup('s');
  T.startRun();
  assert.equal(st.pilotMode, 'AUTO_ALL', 'the next run starts on AUTO (got ' + st.pilotMode + ')');
  assert.equal(T.wheel.t, 0, 'and a new run starts with the pilot driving');
  quiet();
});

S.check('MANUAL is an explicit choice: O toggles AUTO <-> MANUAL and it persists', () => {
  st.toasts.length = 0;
  kdown('o'); kup('o');
  assert.equal(st.pilotMode, 'MANUAL', 'O chooses MANUAL');
  assert.ok(/MANUAL/.test(st.toasts[st.toasts.length - 1].msg), 'and says so');
  assert.equal(T.pilotPrefs.storage.getItem(T.pilotPrefs.KEY_PILOT), 'MANUAL', 'the choice is stored');
  assert.equal(T.wheel.cue(), '', 'no hand-back cue on MANUAL');
  T.startRun(); quiet();
  assert.equal(st.pilotMode, 'MANUAL', 'the next run starts on MANUAL');
  kdown('o'); kup('o');
  assert.equal(st.pilotMode, 'AUTO_ALL', 'O again returns to AUTO: two visible options');
  assert.equal(T.pilotPrefs.storage.getItem(T.pilotPrefs.KEY_PILOT), 'AUTO_ALL');
});

S.check('AUTO MOVE is the Advanced auto flavour: O returns to it, never cycles through it', () => {
  T.wheel.setAutoFlavor('AUTO_MOVE');
  assert.equal(st.pilotMode, 'AUTO_MOVE');
  kdown('o'); kup('o');
  assert.equal(st.pilotMode, 'MANUAL');
  kdown('o'); kup('o');
  assert.equal(st.pilotMode, 'AUTO_MOVE', 'O returns to the chosen auto flavour');
  T.wheel.setAutoFlavor('AUTO_ALL');
  assert.equal(st.pilotMode, 'AUTO_ALL');
});

// ---- COPY ----------------------------------------------------------------------
const B = T.prologue.banners;
const touchEl = h.elements['touch'];
S.check('desktop copy: hold a move key. The drag line is never shown', () => {
  touchEl.classList.remove('on');
  const body = B[0].body;
  assert.ok(/pilot fights for you/i.test(body), body);
  assert.ok(/hold a move key/i.test(body), 'the key instruction: ' + body);
  assert.ok(!/drag/i.test(body), 'a desktop user must not be told to drag: ' + body);
});
S.check('touch copy: drag. No key instruction', () => {
  touchEl.classList.add('on');
  const body = B[0].body;
  assert.ok(/pilot fights for you/i.test(body), body);
  assert.ok(/drag anywhere/i.test(body), 'the drag instruction: ' + body);
  assert.ok(!/key/i.test(body + B[0].cue), 'a touch player is never told to press a key: ' + body + ' / ' + B[0].cue);
  touchEl.classList.remove('on');
});
S.check('the PILOT row and the manual say the steering lasts while held', () => {
  const row = controlById('pilot');
  assert.ok(/AUTO \/ MANUAL/i.test(row.purpose) && /hold a move key or drag/i.test(row.purpose), row.purpose);
  assert.equal(CONTROLS.filter(c => c.id === 'pilot').length, 1, 'one row, one source');
  T.manual.goto(3);
  const html = h.elements['ov-cards'].children.map(c => c.innerHTML || '').join('\n');
  assert.ok(/move \(on AUTO: steer while held\)/.test(html), 'the keyboard move row');
  assert.ok(/move \(on AUTO: steer while you drag\)/.test(html), 'the touch move row');
  T.manual.goto(2);
  const html2 = h.elements['ov-cards'].children.map(c => c.innerHTML || '').join('\n');
  assert.ok(/takes over again \d(\.\d)?s after you let go/.test(html2), 'page 2 states the hand-back');
  assert.ok(/Only the PILOT button or O chooses it/.test(html2), 'and that MANUAL is an explicit choice');
});

if (S.done() > 0) process.exit(1);
process.exit(0);
