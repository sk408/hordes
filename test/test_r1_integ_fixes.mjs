// R1 integration review fixes for the end card's AUTO-CONTINUE.
// 1. A new player's end cards lead to the SHOP: while the tutorial still owes
//    its menu steps the card is dim and no countdown arms (one press used to
//    start every later run by itself and skip the shop lesson for good).
// 2. AUTO-CONTINUE turned on in Settings during a run: the end card said ON
//    and nothing ever started. Now it counts down (after the death movie).
//    On but not counting (a deliberate END RUN), it says one press starts it.
// 3. A tap anywhere on the end card holds the restart, not only a card press.
// Run: node test/test_r1_integ_fixes.mjs
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';
import { mulberry32 } from '../src/weather.js';

Math.random = mulberry32(20261119);

const S = suite('r1 integration fixes: end card auto-continue');
const h = await boot({ storage: [['hordes_onboarded', '1']] });
const T = h.T, st = h.state, el = h.elements;
T.banners.suppressAll();
const kdown = (k) => h.key('keydown', { key: k, preventDefault() {} });
h.pump(3);
if (st.mode === 'intro') { kdown('x'); h.pump(2); }
const L = T.tut.LEDGER;

const cards = () => [...el['ov-cards'].children];
const nameOf = (c) => ((c.innerHTML || '').match(/class="name">([^<]*)</) || [])[1] || '';
const descOf = (c) => ((c.innerHTML || '').match(/class="desc">([^<]*)</) || [])[1] || '';
const autoCard = () => cards().find(c => nameOf(c).startsWith('AUTO-CONTINUE'));
const isDim = (c) => /\bdim\b/.test(c.className || '');
const runs = () => T.getProfile().achievements.totals.runs;

const startRun = () => {
  T.startRun(); h.pump(2);
  st.spawnTimer = 1e9; st.wave.endsAt = st.time + 1e9; st.wave.midAt = st.time + 1e9;
};
function dieToCard() {
  T.die();
  let g = 0;
  while (st.mode !== 'dead' && g++ < 60 * 20) h.pump(1);
  assert.equal(st.mode, 'dead');
  h.pump(2);   // the frame repaints the card
}

T.setPilotMode('AUTO_ALL');

// The harness profile has one finished run: the next run start is the one
// that still owes the menu steps (the third start ends them).
S.check('tutorial menu steps owed: an unattended run does not arm; the card is dim, names the SHOP, and a press neither saves nor arms', () => {
  T.tut.mark(L.cohort);
  T.auto.on = true;
  startRun();
  assert.equal(T.tut.seen(L.play), false, 'the menu steps are still owed');
  assert.equal(st.unattended, true);
  dieToCard();
  assert.equal(T.auto.restartLeft, null, 'the shop lesson comes first');
  const c = autoCard();
  assert.ok(isDim(c), 'dim while the menu steps are owed');
  assert.equal(nameOf(c), 'AUTO-CONTINUE');
  assert.ok(/SHOP/.test(descOf(c)), descOf(c));
  T.auto.on = false;
  c.click();
  assert.equal(T.auto.on, false, 'the press does not turn it on');
  assert.equal(h.storage.get('hordes_auto_continue'), '0');
  assert.equal(T.auto.restartLeft, null, 'nothing counts down');
  h.pump(60 * 8);
  assert.equal(st.mode, 'dead', 'the end card waits for the player');
});

S.check('SKIP TUTORIAL frees the card at once (dim goes, the setting can be turned on)', () => {
  T.tut.mark(L.skipped);
  h.pump(2);
  const c = autoCard();
  assert.ok(!isDim(c), 'no longer dim');
  assert.equal(nameOf(c), 'AUTO-CONTINUE: OFF');
  c.click();
  assert.equal(T.auto.on, true);
  assert.equal(T.auto.restartLeft, 5);
  c.click();
  assert.equal(T.auto.on, false);
});

S.check('turned on in Settings mid-run: the run stays the player\'s (death movie plays), then the end card counts down and the next run starts', () => {
  T.auto.on = false;
  startRun();
  T.auto.press();   // the Settings card's own press
  assert.equal(T.auto.on, true);
  assert.equal(st.unattended, false, 'the live run stays attended');
  T.die();
  assert.equal(st.mode, 'death-cine', 'the death movie plays for a run the player started');
  let g = 0;
  while (st.mode !== 'dead' && g++ < 60 * 20) h.pump(1);
  h.pump(2);
  assert.ok(T.auto.restartLeft > 0 && T.auto.restartLeft <= 5, 'counting: ' + T.auto.restartLeft);
  assert.ok(/^next run in \ds\. Press to turn off$/.test(descOf(autoCard())), descOf(autoCard()));
  h.pump(60 * 6);
  assert.equal(st.mode, 'playing', 'the next run started by itself');
  assert.equal(st.autoStarted, true);
});

S.check('a tap on the end card\'s text (not a card) holds the countdown like any input', () => {
  assert.equal(T.auto.on, true);
  dieToCard();
  assert.ok(T.auto.restartLeft > 0 && T.auto.restartLeft <= 5);
  const down = el['overlay']._ev && el['overlay']._ev.pointerdown;
  assert.equal(typeof down, 'function', 'the overlay listens for pointerdown');
  down({ target: el['ov-title'] });
  assert.ok(T.auto.restartLeft > 20, 'held: ' + T.auto.restartLeft);
  h.pump(60 * 6);
  assert.equal(st.mode, 'dead', 'still on the card 6 s later');
});

S.check('ON but not counting (a deliberate END RUN): the card says one press starts it, and that press arms', () => {
  assert.equal(T.auto.on, true);
  startRun();
  T.openSettings();
  const card = (t) => cards().find(c => (c.innerHTML || '').includes(t));
  card('END RUN').click();
  card('CONFIRM END RUN?').click();
  assert.equal(el['ov-title'].textContent, 'RUN ENDED');
  assert.equal(T.auto.restartLeft, null, 'END RUN never arms by itself');
  h.pump(2);
  const c = autoCard();
  assert.equal(nameOf(c), 'AUTO-CONTINUE: ON');
  assert.equal(descOf(c), 'Press to start the next run by itself');
  c.click();
  assert.equal(T.auto.on, true, 'the press does not turn it off');
  assert.equal(T.auto.restartLeft, 5, 'it counts down');
  c.click();
  assert.equal(T.auto.on, false, 'a press while counting turns it off');
  assert.equal(T.auto.restartLeft, null);
});

S.done();
