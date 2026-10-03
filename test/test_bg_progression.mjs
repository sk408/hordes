// BACKGROUND PROGRESSION: a hidden tab carries a run through the screens that
// wait on a drawn frame or a click — the escape cinematic after the wave-1
// boss and the run-milestone chest card.
// Run: node test/test_bg_progression.mjs
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';
import { CONFIG as C } from '../src/config.js';
import { payoutFor } from '../src/escape_payout.js';
import { mulberry32 } from '../src/weather.js';

// A fixed run: startRun rolls the field and the arches from Math.random.
Math.random = mulberry32(20261002);

const S = suite('test_bg_progression');
const h = await boot({ storage: [['hordes_onboarded', '1']] });
const T = h.T, st = h.state;
T.banners.suppressAll();
const prof = T.getProfile();

const hide = () => { document.visibilityState = 'hidden'; document.hidden = true; T.onVisibilityChange(); };
const show = () => { document.visibilityState = 'visible'; document.hidden = false; T.onVisibilityChange(); };
const safe = () => { st.player.invuln = 1e6; st.player.hp = st.player.stats.maxHp; };
// Background ticks on the harness clock, the way the Worker's messages drive
// them. Stops early once `until()` holds; returns the hidden seconds used.
const bgUntil = (until, maxS) => {
  let s = 0;
  while (s < maxS && !until()) {
    h.advanceClock(C.BACKGROUND.TICK_MS);
    T.bg.tick(performance.now());
    s += C.BACKGROUND.TICK_MS / 1000;
    if (st.player) safe();
  }
  return s;
};
const freezeSpawns = () => {
  st.spawnTimer = 1e9;
  st.wave.endsAt = st.time + 1e9;
  st.wave.midAt = st.time + 1e9;
};

// ---- the escape ----
prof.achievements.totals.bestGold = 12000;
const PAY = payoutFor(12000);

S.check('hidden: an attended AUTO run\'s escape ends at once and pays, with no frame drawn', () => {
  T.auto.on = false;
  T.startRun(); h.pump(2);
  assert.equal(st.unattended, false);
  hide();
  const gold0 = prof.gold;
  T.escape.start();
  assert.equal(st.mode, 'escape');
  const s = bgUntil(() => st.mode !== 'escape', 5);
  assert.equal(st.mode, 'intermission', 'still ' + st.mode + ' after ' + s.toFixed(2) + ' s hidden');
  assert.ok(s <= 0.2, 'left the escape after ' + s.toFixed(2) + ' s');
  assert.equal(T.escape.payload.result, 'complete');
  assert.equal(T.escape.payload.payout, PAY);
  assert.equal(prof.gold - gold0, PAY, 'the payout reached the bank');
  bgUntil(() => false, 2);
  assert.equal(prof.gold - gold0, PAY, 'once');
  show();
});

S.check('hidden mid-escape: the movie ends there and pays the same, once', () => {
  T.startRun(); h.pump(2);
  const gold0 = prof.gold;
  T.escape.start();
  h.pump(60);   // a second of watching
  assert.equal(st.mode, 'escape');
  assert.ok(T.escape.cine.t > 0.9 && !T.escape.cine.ended, 'the movie is playing');
  assert.equal(prof.gold, gold0, 'nothing banked yet');
  hide();
  bgUntil(() => st.mode !== 'escape', 5);
  assert.equal(st.mode, 'intermission');
  assert.equal(T.escape.payload.result, 'complete');
  assert.equal(prof.gold - gold0, PAY);
  show();
  h.pump(30);
  assert.equal(prof.gold - gold0, PAY, 'showing the tab again pays nothing more');
});

S.check('hidden: an unattended run passes the escape at once, paid, and reaches wave 2', () => {
  T.auto.on = true;
  T.startRun(); h.pump(2);
  assert.equal(st.unattended, true);
  assert.equal(st.wave.num, 1);
  hide();
  freezeSpawns();
  const gold0 = prof.gold;
  // The wave-1 cast is down and the hero is in the portal: the real hand-over.
  st.wave.cinePending = true;
  st.portal = null;
  const out = bgUntil(() => st.mode === 'intermission', 2);
  assert.equal(st.mode, 'intermission', 'still ' + st.mode);
  assert.ok(out <= 0.5, 'through both movies after ' + out.toFixed(2) + ' s');
  assert.equal(T.escape.payload.result, 'complete');
  assert.equal(prof.gold - gold0, PAY, 'paid in full');
  bgUntil(() => st.mode === 'playing', 10);
  assert.equal(st.mode, 'playing');
  assert.equal(st.wave.num, 2);
  assert.equal(prof.gold - gold0, PAY);
  show();
});

S.check('the watchdog ends an escape that stands still, paid once', () => {
  T.auto.on = false;
  T.startRun(); h.pump(2);
  const gold0 = prof.gold;
  T.escape.start();
  T.escape.hold(3);   // a clock that does not move
  h.pump(10);
  assert.equal(st.mode, 'escape');
  st.unattended = true;
  T.auto.unstick('escape');
  assert.equal(st.mode, 'intermission');
  assert.equal(T.escape.payload.result, 'complete');
  assert.equal(prof.gold - gold0, PAY);
  T.auto.unstick('escape');
  assert.equal(prof.gold - gold0, PAY);
  T.auto.on = true;
});

// ---- the run-milestone chest ----
// The run after `runs` settled runs carries the next milestone (claimed: the last one).
const armMilestone = (runs, claimed = 0) => {
  prof.achievements.totals.runs = runs;
  prof.milestoneChest = claimed;
  T.startRun(); h.pump(1);
  assert.ok(st.runChest && st.runChest.milestone === runs + 1, 'the chest is on the field');
};

S.check('hidden: an unattended run collects its milestone chest and keeps playing', () => {
  T.auto.on = true;
  armMilestone(49);
  assert.equal(st.unattended, true);
  // An empty field, so the pilot walks straight to the chest.
  st.enemies.length = 0;
  freezeSpawns();
  hide();
  const gold0 = prof.gold;
  bgUntil(() => false, 30);
  assert.equal(st.runChest, null, 'the pilot collected the chest');
  assert.equal(prof.milestoneChest, 50, 'the claim is saved');
  assert.ok(prof.gold > gold0, 'the gold is banked');
  assert.ok(st.mode !== 'chest' && st.mode !== 'burst', 'stuck in ' + st.mode);
  assert.ok(st.time > 15, 'the run clock moved: ' + st.time.toFixed(1) + ' s');
  show();
});

S.check('visible unattended: the burst plays, then the run goes on with no card', () => {
  armMilestone(99, 50);
  T.runChests.collect();
  assert.equal(st.mode, 'burst');
  assert.ok(st.toasts.some(t => /MILESTONE CHEST: \+\d+ GOLD BANKED/.test(t.text || t.msg || '')), 'the gold is told');
  h.pump(Math.ceil(C.RUN_CHEST.BURST_TTL * 60) + 2);
  assert.equal(st.mode, 'playing');
});

S.check('hidden attended run: no card either; a player watching still gets it', () => {
  T.auto.on = false;
  armMilestone(199, 100);
  hide();
  T.runChests.collect();
  bgUntil(() => st.mode !== 'burst', 3);
  assert.equal(st.mode, 'playing');
  show();
  armMilestone(499, 200);
  T.runChests.collect();
  h.pump(Math.ceil(C.RUN_CHEST.BURST_TTL * 60) + 2);
  assert.equal(st.mode, 'chest', 'the card is up for the player');
  T.runChests.closeCard();
  assert.equal(st.mode, 'playing');
});

S.check('the watchdog closes a milestone card left open on an unattended run', () => {
  T.auto.on = true;
  armMilestone(49);
  T.runChests.collect();
  // A card that is already open (opened before the run went unattended).
  st.chestBurst = null;
  st.mode = 'chest';
  h.pump(Math.round(60 * (C.AUTOPILOT.AUTO_STALL_S - 1)));
  assert.equal(st.mode, 'chest');
  h.pump(90);
  assert.equal(st.mode, 'playing');
});

S.done();
process.exit(0);
