// R1: AUTO-CONTINUE on the end card ("Runs don't auto-restart; I have to
// babysit it"). One card after RETRY and SHOP on every end card (death, the
// 30:00 win, END RUN) that turns the setting on and off, says what it does
// and what it pays, and counts down to the next run once on. Its states:
// off, on (counting), MANUAL pilot, dev night, an unattended run already on.
// Run: node test/test_endcard_auto_continue.mjs
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';
import { mulberry32 } from '../src/weather.js';

Math.random = mulberry32(20261118);

const S = suite('end card: auto-continue');
const h = await boot({ storage: [['hordes_onboarded', '1']] });
const T = h.T, st = h.state, el = h.elements;
T.banners.suppressAll();
const kdown = (k, extra = {}) => h.key('keydown', { key: k, preventDefault() {}, ...extra });
h.pump(3);
if (st.mode === 'intro') { h.skipMovie(); h.pump(2); }

const cards = () => [...el['ov-cards'].children];
const nameOf = (c) => ((c.innerHTML || '').match(/class="name">([^<]*)</) || [])[1] || '';
const descOf = (c) => ((c.innerHTML || '').match(/class="desc">([^<]*)</) || [])[1] || '';
const autoCard = () => cards().find(c => nameOf(c).startsWith('AUTO-CONTINUE'));
const PAY_TEXT = 'the first 3 in a row pay in full, then 75% gold';

const startRun = () => {
  T.startRun(); h.pump(2);
  st.spawnTimer = 1e9; st.wave.endsAt = st.time + 1e9; st.wave.midAt = st.time + 1e9;
};
// A real death: the movie plays, then the end card.
function dieToCard() {
  T.die();
  let g = 0;
  while (st.mode !== 'dead' && g++ < 60 * 20) h.pump(1);
  assert.equal(st.mode, 'dead');
  assert.equal(el['overlay'].style.display, 'flex', 'the end card is up');
}

S.check('OFF on the AUTO pilot: the third card (after RETRY and SHOP), says what it does and what it pays; nothing counts down', () => {
  T.auto.on = false;
  T.setPilotMode('AUTO_ALL');
  startRun();
  dieToCard();
  // R5: BUY NEXT follows TITLE, on its own line (test_end_card.mjs).
  assert.deepEqual(cards().map(nameOf), ['RETRY', 'SHOP', 'AUTO-CONTINUE: OFF', 'TITLE', 'BUY NEXT']);
  const c = autoCard();
  assert.ok(!(c.className || '').includes('dim'));
  assert.ok(descOf(c).includes('start the next run by itself'), descOf(c));
  assert.ok(descOf(c).includes(PAY_TEXT), descOf(c));
  assert.ok(!descOf(c).includes('[A]'), 'no letter key: A is a steering key');
  assert.equal(T.auto.restartLeft, null);
  h.pump(60 * 8);
  assert.equal(st.mode, 'dead', 'an OFF card waits for the player');
});

S.check('a click turns it ON: saved, the countdown starts (armAutoRestart) and the card shows it; the next run starts by itself', () => {
  autoCard().click();
  assert.equal(T.auto.on, true);
  assert.equal(h.storage.get('hordes_auto_continue'), '1', 'the setting itself is on');
  assert.equal(st.unattended, true);
  assert.equal(T.auto.restartLeft, T.auto.constants.RESTART_S);
  assert.equal(nameOf(autoCard()), 'AUTO-CONTINUE: ON');
  assert.match(descOf(autoCard()), /^next run in 5s\. Press to turn off$/);
  h.pump(Math.round(60 * 2.2));
  assert.match(descOf(autoCard()), /next run in 3s/, 'the card counts down');
  h.pump(Math.round(60 * 2.6));
  assert.equal(st.mode, 'dead');
  h.pump(30);
  assert.equal(st.mode, 'playing', 'the next run started by itself');
  assert.equal(st.autoStarted, true);
  assert.equal(st.unattended, true);
});

S.check('an unattended run already on: the card shows ON and counts; an input holds it 30 s', () => {
  dieToCard();
  assert.equal(nameOf(autoCard()), 'AUTO-CONTINUE: ON');
  h.pump(1);
  assert.match(descOf(autoCard()), /next run in 5s/);
  T.auto.input();
  assert.equal(T.auto.restartLeft, 30, 'the existing 30 s hold');
  h.pump(1);
  assert.match(descOf(autoCard()), /next run in 30s/);
  h.pump(60 * 25);
  assert.equal(st.mode, 'dead');
  h.pump(60 * 6);
  assert.equal(st.mode, 'playing', 'restarted 30 s after the input');
});

S.check('a click turns it OFF: saved, the countdown stops, the card waits', () => {
  dieToCard();
  assert.ok(T.auto.restartLeft > 0);
  autoCard().click();
  assert.equal(T.auto.on, false);
  assert.equal(h.storage.get('hordes_auto_continue'), '0');
  assert.equal(T.auto.restartLeft, null);
  assert.equal(st.unattended, false);
  assert.equal(nameOf(autoCard()), 'AUTO-CONTINUE: OFF');
  h.pump(60 * 35);
  assert.equal(st.mode, 'dead', 'past the 5 s restart and the 30 s watchdog');
});

S.check('a click that starts the countdown, then another input: held 30 s like any end card', () => {
  autoCard().click();
  assert.equal(T.auto.restartLeft, 5);
  h.pump(60);
  cards().find(c => nameOf(c) === 'SHOP') && T.auto.input();
  assert.equal(T.auto.restartLeft, 30);
  autoCard().click();   // and off again
  assert.equal(T.auto.restartLeft, null);
});

S.check('keyboard: the steering keys (WASD) leave it alone; the arrows plus Enter reach the card', () => {
  assert.equal(T.auto.on, false);
  // A player still steering when the card appears: one stray tap of A must not
  // save the setting and start a run nobody asked for (review R1 flow).
  for (const k of ['w', 's', 'd', 'a']) { kdown(k); h.key('keyup', { key: k, preventDefault() {} }); }
  assert.equal(T.auto.on, false, 'a steering key does not turn it on');
  assert.equal(h.storage.get('hordes_auto_continue'), '0', 'the saved setting is unchanged');
  assert.equal(T.auto.restartLeft, null, 'nothing counts down');
  assert.equal(st.mode, 'dead');
  let g = 0;
  while (!(autoCard().className || '').includes('sel') && g++ < 6) kdown('ArrowDown');
  assert.ok((autoCard().className || '').includes('sel'), 'the cursor reaches the card');
  kdown('Enter');
  assert.equal(T.auto.on, true, 'Enter on the card turns it on');
  kdown('Enter');
  assert.equal(T.auto.on, false);
  assert.equal(st.mode, 'dead');
});

S.check('MANUAL pilot: the card says so instead of offering; a press changes nothing', () => {
  T.setPilotMode('MANUAL');
  startRun();
  dieToCard();
  const c = autoCard();
  assert.equal(nameOf(c), 'AUTO-CONTINUE');
  assert.ok((c.className || '').includes('dim'));
  assert.match(descOf(c), /needs the AUTO pilot/);
  c.click();
  kdown('a');
  assert.equal(T.auto.on, false);
  assert.equal(T.auto.restartLeft, null);
  h.pump(60 * 6);
  assert.equal(st.mode, 'dead');
  T.setPilotMode('AUTO_ALL');
});

S.check('dev night: the card names it and a press changes nothing; the night run still goes on', () => {
  startRun();
  st.devNightRun = true; st.unattended = true;
  T.die();
  assert.equal(st.mode, 'dead', 'unattended: no movie');
  const c = autoCard();
  assert.equal(nameOf(c), 'AUTO-CONTINUE: DEV NIGHT');
  assert.ok((c.className || '').includes('dim'));
  c.click();
  assert.equal(T.auto.on, false, 'the setting is untouched');
  assert.equal(T.auto.restartLeft, 30, 'still armed (the press is an input: the 30 s hold)');
  h.pump(60 * 31);
  assert.equal(st.mode, 'playing');
  st.devNightRun = false;
});

S.check('the 30:00 win and END RUN offer it too', () => {
  T.auto.on = false;
  startRun();
  T.run.runSurvived();
  assert.equal(st.mode, 'dead');
  assert.equal(nameOf(cards()[2]), 'AUTO-CONTINUE: OFF');
  // Still dodging with WASD when the 30:00 win lands (no movie here).
  for (const k of ['d', 'a']) { kdown(k); h.key('keyup', { key: k, preventDefault() {} }); }
  assert.equal(T.auto.on, false, 'a steering key on the win card does not turn it on');
  assert.equal(T.auto.restartLeft, null);
  autoCard().click();
  assert.equal(T.auto.restartLeft, 5, 'turned on from the win card: counting');
  autoCard().click();
  startRun();
  T.openSettings();
  const card = (t) => cards().find(c => (c.innerHTML || '').includes(t));
  card('END RUN').click();
  card('CONFIRM END RUN?').click();
  assert.equal(el['ov-title'].textContent, 'RUN ENDED');
  assert.equal(nameOf(cards()[2]), 'AUTO-CONTINUE: OFF');
  assert.equal(T.auto.restartLeft, null, 'END RUN never arms by itself');
  autoCard().click();
  assert.equal(T.auto.restartLeft, 5, 'turned on from the END RUN card: the player asked, so it counts');
  autoCard().click();
});

S.done();
