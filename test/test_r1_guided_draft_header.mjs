// R1 integration review: the guided run's DRAFT step asks for NEXT (the
// panel reads the cards first). The draft header must not tell the player to
// press 1/2/3 there: a pick skips the EVOLVE lesson. It keeps the old quiet
// "pick 1 of N"; every later draft names its keys again.
// Run: node test/test_r1_guided_draft_header.mjs
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';
import { mulberry32 } from '../src/weather.js';

Math.random = mulberry32(20261120);

const S = suite('r1 guided draft header');
const h = await boot({ tutorial: true, hints: true, variant: 'active', storage: [['hordes_onboarded', '1']] });
const T = h.T, st = h.state, el = h.elements;
h.pump(3);
if (st.mode === 'intro') { h.skipMovie(); h.pump(2); }
T.startRun();
const until = (cond, max = 60 * 60) => { for (let i = 0; i < max && !cond(); i++) h.pump(1); return cond(); };
const stepId = () => (T.tut.model ? T.tut.model.id : null);
const header = () => el['ov-sub'].textContent || el['ov-sub'].innerHTML;

S.check('the guided DRAFT step: the header does not name the pick keys', () => {
  assert.ok(T.tut.live, 'the guided run is on');
  h.key('keydown', { key: 'd', preventDefault() {} }); h.pump(40);
  h.key('keyup', { key: 'd', preventDefault() {} }); h.pump(2);
  assert.ok(until(() => stepId() === 'draft', 60 * 60), 'reached the DRAFT step: ' + stepId());
  assert.equal(st.mode, 'draft');
  assert.equal(header(), 'pick 1 of ' + el['ov-cards'].children.length);
  assert.ok(!/press|tap/i.test(header()), header());
});

S.check('NEXT moves on to EVOLVE on the same draft; a later draft names its keys', () => {
  T.tut.press(T.tut.model.shownMs + 2000);
  h.pump(2);
  assert.equal(stepId(), 'evolve');
  // The EVOLVE step says weapon cards name their evolution partner: the face
  // of every weapon card (not only the hidden detail) must show that road.
  const words = T.tut.model.text || '';
  assert.ok(/evolution partner/.test(JSON.stringify(T.tut.model)) || /evolution partner/.test(words), 'the step teaches the partner');
  const weapons = [...el['ov-cards'].children].filter(c => /^(lvl_|wpn_)/.test(String(c._draftOffer && c._draftOffer.id)));
  assert.ok(weapons.length >= 1, 'the guided draft holds a weapon card');
  for (const c of weapons) {
    const u = c._draftOffer;
    if (!u.evoText) continue;
    const faceHtml = c.innerHTML.split('<div class="detail">')[0];
    assert.ok(/class="fx[^"]*">evolves /.test(faceHtml), u.id + ' shows its evolution road on the face: ' + faceHtml);
  }
  assert.ok(weapons.some(c => c._draftOffer.evoText), 'at least one weapon card has a road to name');
  el['ov-cards'].children[0].click();
  h.pump(2);
  assert.notEqual(st.mode, 'draft');
  // The guided run is past its DRAFT step: the next offer reads as usual.
  T.openDraft();
  assert.equal(st.mode, 'draft');
  assert.ok(/^Pick 1: /.test(header()), header());
});

S.done();
