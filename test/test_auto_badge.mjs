// The AUTO-CONTINUE badge: a run started by auto-continue banks less gold, and
// the HUD says so for the whole run (a blue badge in the right column's
// column). Any other run paints nothing there.
// Run: node test/test_auto_badge.mjs
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';

const S = suite('test_auto_badge');

const h = await boot({ storage: [['hordes_onboarded', '1']] });
const st = h.state;
const T = h.T;
const pump = h.pump;

// The harness's recording context starts DISABLED (rec.on gates every push), so
// switch it on. Recording ACCUMULATES across frames, hence the slice-from-a-mark.
h.rec.on = true;
const nightTexts = () => h.rec.texts.filter(t => t.txt === 'AUTO 50%');
const since = (n) => nightTexts().slice(n);

T.startRun();
pump(2);                       // a live run with a real HUD

S.check('an auto-started run paints the badge', () => {
  st.autoStarted = true;
  const n0 = nightTexts().length;
  pump(1);
  assert.equal(since(n0).length, 1, 'exactly one badge label is painted per frame');
  st.autoStarted = false;
});

S.check('a run the player started paints no badge', () => {
  // The other half of the invariant: nothing about the day HUD changes. (The
  // suite's existing paint comparisons are what enforce byte-identity across the
  // whole HUD; this pins that the badge specifically is absent.)
  const n0 = nightTexts().length;
  pump(1);
  assert.equal(since(n0).length, 0, 'no badge label');
});

S.check('the badge marks the RUN, not a moment — it holds frame after frame', () => {
  st.autoStarted = true;
  const n0 = nightTexts().length;
  pump(3);
  assert.equal(since(n0).length, 3, 'still painted on every frame of the run');
  st.autoStarted = false;
});

S.check('the badge goes with the stamp', () => {
  st.autoStarted = true;
  pump(1);
  const n0 = nightTexts().length;
  st.autoStarted = false;
  pump(1);
  assert.equal(since(n0).length, 0, 'gone with the stamp');
});

S.check('the badge is anchored in the HUD right column, under the clock', () => {
  // The badge slot is x = VIEW_W-24+2-w, y = cbY+cbH+8, and this badge
  // stacks BELOW it when both are live. Assert the right-edge anchoring rather
  // than an exact y — the y depends on the clock chrome above it, so pinning it
  // would fail on any unrelated HUD layout change.
  st.autoStarted = true;
  const n0 = nightTexts().length;
  pump(1);
  const [badge] = since(n0);
  assert.ok(badge, 'the badge painted');
  assert.ok(badge.x > 300, 'anchored in the right column (x=' + badge.x + ')');
  assert.ok(Number.isFinite(badge.y), 'and it has a real y (' + badge.y + ')');
  st.autoStarted = false;
});

S.check('an auto-started run is still a run — the badge does not disturb the sim', () => {
  // Cheap guard against the badge being wired to anything beyond presentation:
  // five frames of the run must leave the clock and the player intact.
  st.autoStarted = true;
  const t0 = st.time;
  const hp0 = st.player && st.player.hp;
  pump(5);
  assert.ok(st.time > t0, 'the run clock is still advancing');
  assert.ok(st.player.hp > 0, 'and the player is still alive');
  assert.equal(st.player.stats === undefined, false, 'stats still built');
  void hp0;
  st.autoStarted = false;
});

S.done();
