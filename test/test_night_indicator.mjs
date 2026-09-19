// HORDES — NIGHT MODE ON-SCREEN INDICATOR.
// Run: node test/test_night_indicator.mjs
//
// Owner (2026-09-19): "there should be an overlay on the screen with nightmode is
// on so the player knows."
//
// Before this, src/render.js contained NO reference to night at all. A night run
// changes what the run is WORTH (the gold pool pays NIGHT_PENALTY_PCT) and the
// only sign was the NIGHT RUN tag on the end card — i.e. after the run was over.
// The indicator is a HUD badge in the same language as the G11 challenge badge
// (gold border, dark inset, bold monospace), read BLUE so the two can be live at
// once without reading as one two-line badge.
//
// The invariant borrowed from that badge, and the reason this is safe to add to a
// long-tested HUD: a DAY run renders byte-identically to before. The badge paints
// only while state.nightRun is live, so every existing paint comparison in the
// suite is untouched — check 2 pins the other half of that.
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';

const S = suite('test_night_indicator');

const h = await boot({ storage: [['hordes_onboarded', '1']] });
const st = h.state;
const T = h.T;
const pump = h.pump;

// The harness's recording context starts DISABLED (rec.on gates every push), so
// switch it on. Recording ACCUMULATES across frames, hence the slice-from-a-mark.
h.rec.on = true;
const nightTexts = () => h.rec.texts.filter(t => t.txt === 'NIGHT');
const since = (n) => nightTexts().slice(n);

T.startRun();
pump(2);                       // a live run with a real HUD

S.check('a NIGHT run paints the indicator', () => {
  st.nightRun = true;
  const n0 = nightTexts().length;
  pump(1);
  assert.equal(since(n0).length, 1, 'exactly one NIGHT label is painted per frame');
  st.nightRun = false;
});

S.check('a DAY run paints NO indicator', () => {
  // The other half of the invariant: nothing about the day HUD changes. (The
  // suite's existing paint comparisons are what enforce byte-identity across the
  // whole HUD; this pins that the badge specifically is absent.)
  const n0 = nightTexts().length;
  pump(1);
  assert.equal(since(n0).length, 0, 'a day run paints no NIGHT label');
});

S.check('the badge marks the RUN, not a moment — it holds frame after frame', () => {
  st.nightRun = true;
  const n0 = nightTexts().length;
  pump(3);
  assert.equal(since(n0).length, 3, 'still painted on every frame of the night run');
  st.nightRun = false;
});

S.check('ending the night takes the badge away again', () => {
  st.nightRun = true;
  pump(1);
  const n0 = nightTexts().length;
  st.nightRun = false;
  pump(1);
  assert.equal(since(n0).length, 0, 'gone the moment the night run ends');
});

S.check('the badge is anchored in the HUD right column, under the clock', () => {
  // The challenge badge's slot is x = VIEW_W-24+2-w, y = cbY+cbH+8, and night
  // stacks BELOW it when both are live. Assert the right-edge anchoring rather
  // than an exact y — the y depends on the clock chrome above it, so pinning it
  // would fail on any unrelated HUD layout change.
  st.nightRun = true;
  const n0 = nightTexts().length;
  pump(1);
  const [badge] = since(n0);
  assert.ok(badge, 'the badge painted');
  assert.ok(badge.x > 300, 'anchored in the right column (x=' + badge.x + ')');
  assert.ok(Number.isFinite(badge.y), 'and it has a real y (' + badge.y + ')');
  st.nightRun = false;
});

S.check('a NIGHT run is still a run — the badge does not disturb the sim', () => {
  // Cheap guard against the badge being wired to anything beyond presentation:
  // five frames of a night run must leave the clock and the player intact.
  st.nightRun = true;
  const t0 = st.time;
  const hp0 = st.player && st.player.hp;
  pump(5);
  assert.ok(st.time > t0, 'the run clock is still advancing');
  assert.ok(st.player.hp > 0, 'and the player is still alive');
  assert.equal(st.player.stats === undefined, false, 'stats still built');
  void hp0;
  st.nightRun = false;
});

S.done();
