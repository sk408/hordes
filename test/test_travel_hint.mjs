// HORDES - travel: the first intermission whose CONTINUE travels shows the
// first-time hint, once. (Its own file: the hint book needs hints switched on
// from the boot.)
// Run: node test/test_travel_hint.mjs
import assert from 'node:assert';
import { suite, boot } from './_harness.mjs';
import { TRAVEL_HINT } from '../src/travel.js';

const s = suite('test_travel_hint');
const h = await boot({ hints: true, storage: [['hordes_onboarded', '1']] });
const T = h.T, st = T.state;
T.banners.suppressAll();
st.mode = 'menu'; T.startRun();
h.pump(5);
const open = (wave) => {
  st.enemies.length = 0; st.wave.num = wave; st.wave.cinePending = false;
  T.travel.intermission();
  h.pump(2);
};

s.check('no travel, no hint: the intermission after wave 1', () => {
  open(1);
  assert.ok(!(T.tut.model && T.tut.model.id === 'hint:travel'));
});

s.check('the first travel intermission shows the hint, and only once', () => {
  open(2);
  assert.equal(T.tut.model && T.tut.model.id, 'hint:travel');
  assert.equal(T.tut.model.text, TRAVEL_HINT);
  T.tut.press(T.tut.model.shownMs + 2000);
  h.pump(2);
  open(2);
  assert.ok(!(T.tut.model && T.tut.model.id === 'hint:travel'), 'not a second time');
});

s.done();
