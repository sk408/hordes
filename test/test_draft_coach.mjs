// The first-draft coach card and background play: the coach never starts in a
// hidden tab (nobody would see it, and it would hold the auto-pick), so it
// waits for a draft the player can see; a coach already up when the tab hides
// does not hold the background auto-pick either.
// Run: node test/test_draft_coach.mjs
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';
import { CONFIG as C } from '../src/config.js';
import { TOUR_KEYS } from '../src/tour.js';

const S = suite('test_draft_coach');
const h = await boot({ storage: [['hordes_onboarded', '1']] });
const T = h.T, st = h.state;
T.banners.suppressAll();

const hide = () => { document.visibilityState = 'hidden'; document.hidden = true; T.onVisibilityChange(); };
const show = () => { document.visibilityState = 'visible'; document.hidden = false; T.onVisibilityChange(); };
const bgFor = (seconds) => {
  for (let t = 0; t < seconds * 1000; t += C.BACKGROUND.TICK_MS) {
    h.advanceClock(C.BACKGROUND.TICK_MS);
    T.bg.tick(performance.now());
  }
};
const coachUp = () => (document.body.children || []).some(c => c.id === 'tour-root');
const openLevelDraft = () => { st.pendingDrafts = 1; T.openDraft(); };

T.startRun();
h.pump(5);
// A quiet run: no level-ups, sites or joker cards of its own.
st.enemies.length = 0; st.spawnTimer = 1e9;
st.player.invuln = 1e6;
st.player.stats.xpMult = 0;
st.sites = []; st.secrets = [];
T.jokers.draftWeight = 0;
for (const w of st.weapons) w.level = 1;   // no evolve offer after a pick
h.storage.delete(TOUR_KEYS.draft);

S.check('setup: AUTO, auto-continue off, the draft coach not seen yet', () => {
  assert.equal(st.mode, 'playing');
  assert.equal(st.pilotMode, 'AUTO_ALL');
  assert.equal(st.unattended, false);
  assert.equal(h.storage.has(TOUR_KEYS.draft), false);
});

S.check('hidden: no coach, the draft is auto-picked on the countdown, the coach is still owed', () => {
  hide();
  assert.equal(T.bg.runs, true);
  openLevelDraft();
  assert.equal(st.mode, 'draft');
  assert.equal(coachUp(), false, 'a coach started in a hidden tab');
  const c0 = T.draftAuto.count;
  bgFor(C.AUTOPILOT.DRAFT_TIMEOUT + 1);
  assert.equal(T.draftAuto.count, c0 + 1, 'no auto-pick (mode ' + st.mode + ', left ' + T.draftAuto.left + ')');
  assert.notEqual(st.mode, 'draft');
  assert.equal(h.storage.has(TOUR_KEYS.draft), false, 'the coach was used up unseen');
});

S.check('visible: the next draft shows the coach, and it holds the countdown', () => {
  show();
  for (let i = 0; i < 300 && st.mode !== 'playing'; i++) h.pump(1);
  assert.equal(st.mode, 'playing');
  openLevelDraft();
  assert.equal(coachUp(), true, 'no coach on a visible first draft');
  assert.equal(h.storage.get(TOUR_KEYS.draft), '1');
  const c0 = T.draftAuto.count;
  h.pump(60 * (C.AUTOPILOT.DRAFT_TIMEOUT + 1));
  assert.equal(T.draftAuto.count, c0, 'picked under a visible coach');
  assert.equal(st.mode, 'draft');
});

S.check('a coach already up does not hold the pick once the tab hides', () => {
  hide();
  const c0 = T.draftAuto.count;
  bgFor(C.AUTOPILOT.DRAFT_TIMEOUT + 1);
  assert.equal(T.draftAuto.count, c0 + 1, 'no auto-pick (mode ' + st.mode + ', left ' + T.draftAuto.left + ')');
  assert.notEqual(st.mode, 'draft');
  show();
});

S.done();
process.exit(0);
