// The new-player tutorial (src/tutorial.js, src/tutorial_ui.js, docs/TUTORIAL.md):
//   - each guided step advances only on its own condition;
//   - a press that began before a panel appeared, or inside its guard time,
//     never advances it; clicks elsewhere never do;
//   - SKIP takes two presses and ends every guided step, menu steps included;
//   - a player who touches nothing still gets through (the idle rule), and a
//     player who is steering is never moved on;
//   - no step can end the run; run 1 still ends in death after the handover;
//   - each first-time hint shows once, and holds the sim while it is up;
//   - the shop step ends with the purchase made.
// Run: node test/test_tutorial_guided.mjs
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';
import { TUT, GUIDED_STEPS, HINTS, LEDGER, Guided, guidedWordStats, pressAllowed, menuStepFor } from '../src/tutorial.js';
import { placePanel } from '../src/tutorial_ui.js';

const S = suite('test_tutorial_guided');
const ids = GUIDED_STEPS.map(s => s.id);

// ---- pure rules ---------------------------------------------------------------------
S.check('the step list: nine steps in the order the player meets them, one short sentence each', () => {
  assert.deepEqual(ids, ['hero', 'move', 'gems', 'draft', 'evolve', 'skill', 'potion', 'gold', 'handover']);
  const w = guidedWordStats(false);
  assert.ok(w.longest <= 14, 'longest step ' + w.longest + ' words');
  assert.ok(w.total <= 95, 'total ' + w.total + ' words before the handover');
  for (const s of GUIDED_STEPS) if (s.perform) assert.ok(/^Watch: /.test(s.watch), s.id + ' has a Watch line');
  assert.equal(GUIDED_STEPS.find(s => s.id === 'handover').text(),
    'The horde will win this time. That is expected. Gold buys upgrades that last.');
  assert.equal(HINTS.run2.text, "Aim for a weapon's evolution: level it to 8 and hold its partner card.");
});

S.check('the guard: a press that began before the panel, or within 400ms of it, never counts', () => {
  assert.equal(pressAllowed(1000, 990), false, 'began before the panel');
  assert.equal(pressAllowed(1000, 1000 + TUT.GUARD_MS - 1), false, 'inside the guard');
  assert.equal(pressAllowed(1000, 1000 + TUT.GUARD_MS), true);
  assert.equal(pressAllowed(NaN, 5000), false, 'a panel that never showed');
});

S.check('no timer ends the guided part: an action step with a player steering waits forever', () => {
  const g = new Guided();
  const fx = { enter() {}, perform() { throw new Error('the pilot must not act while the player steers'); }, end() { throw new Error('ended'); } };
  g.i = ids.indexOf('skill');
  const f = { kills: 0, level: 1, xp: 0, draft: false, casts: 0, drinks: 0, purse: 0, steering: true };
  for (let t = 0; t < 600; t++) g.tick(1, f, t * 1000, fx);   // ten minutes of steering
  assert.equal(g.step.id, 'skill');
  assert.equal(g.watch, false);
});

S.check('the panel is placed clear of its targets, the pads and the middle of the play area', () => {
  const views = [[1280, 720], [844, 390], [390, 844]];
  for (const [w, h] of views) {
    const view = { left: 0, top: 0, right: w, bottom: h };
    const cw = Math.min(w, h * 1.6), ch = cw / 1.6;
    const cv = { left: (w - cw) / 2, top: 0, width: cw, height: ch, right: (w + cw) / 2, bottom: ch };
    const size = { w: Math.min(440, w - 16), h: 70 };
    const hero = { left: cv.left + cw / 2 - 20, right: cv.left + cw / 2 + 20, top: ch / 2 - 20, bottom: ch / 2 + 20 };
    const xp = { left: cv.left, right: cv.left + cw * 0.38, top: ch * 0.11, bottom: ch * 0.16 };
    for (const targets of [[hero], [xp], []]) {
      const p = placePanel(cv, view, size, targets, []);
      const box = { left: p.left, right: p.left + size.w, top: p.top, bottom: p.top + size.h };
      for (const t of targets) {
        assert.ok(box.bottom <= t.top || box.top >= t.bottom || box.right <= t.left || box.left >= t.right,
          w + 'x' + h + ' covers its target');
      }
      const midY = cv.top + ch / 2;
      assert.ok(box.bottom <= midY - 10 || box.top >= midY + 10, w + 'x' + h + ' sits on the middle of the field');
      assert.ok(box.top >= 0 && box.bottom <= h, w + 'x' + h + ' off screen');
    }
  }
});

S.check('menu steps: end -> shop -> back -> play, and nothing for a skipped or finished profile', () => {
  const led = new Set([LEDGER.cohort]);
  const seen = (id) => led.has(id);
  assert.equal(menuStepFor('end', seen).id, 'end');
  assert.equal(menuStepFor('shop', seen).id, 'shop_buy');
  assert.equal(menuStepFor('shop', seen, { canBuy: false }), null, 'nothing affordable: no buy step');
  led.add(LEDGER.shopBuy);
  assert.equal(menuStepFor('shop', seen).id, 'shop_back');
  assert.equal(menuStepFor('title', seen).id, 'play');
  led.add(LEDGER.skipped);
  assert.equal(menuStepFor('title', seen), null);
});

// ---- the live game ----------------------------------------------------------------
async function fresh(variant) {
  const h = await boot({ tutorial: true, hints: true, variant, storage: [['hordes_onboarded', '1']] });
  h.pump(3);
  if (h.state.mode === 'intro') { h.key('keydown', { key: 'x', preventDefault() {} }); h.pump(2); }
  h.T.startRun();
  return h;
}
const until = (h, cond, max = 60 * 60) => { for (let i = 0; i < max && !cond(); i++) h.pump(1); return cond(); };
const stepId = (h) => (h.T.tut.model ? h.T.tut.model.id : null);

// A: a player who does each thing.
{
  const h = await fresh('active');
  const T = h.T, st = h.state;
  const down = (k, extra = {}) => h.key('keydown', { key: k, preventDefault() {}, ...extra });
  const up = (k) => h.key('keyup', { key: k, preventDefault() {} });
  let hurtBeforePotion = false;
  const hp = () => st.player.hp;

  S.check('run 1 of a fresh profile opens the guided part over a live field; the clock is held', () => {
    assert.ok(T.tut.live);
    assert.ok(until(h, () => stepId(h) === 'hero', 10));
    assert.ok(until(h, () => st.enemies.length > 0, 120), 'trainers on the field');
    assert.equal(st.time, 0);
    assert.ok(st.quests && st.quests.length > 0, 'the run has its quests');
    assert.equal(T.renderer.hudChrome.quests, null, 'the quest tracker is not drawn during the guided part');
  });

  S.check('HERO: ends when the hero makes a kill on their own', () => {
    assert.ok(until(h, () => stepId(h) === 'move', 60 * 20), 'still ' + stepId(h));
    assert.ok(st.player.kills > 0);
  });

  S.check('MOVE: does not advance without steering; a press that began before it is not a steer', () => {
    h.pump(60 * 5);
    assert.equal(stepId(h), 'move', 'five hands-off seconds do not move it on');
    down('d'); h.pump(40); up('d'); h.pump(2);
    assert.ok(until(h, () => stepId(h) === 'gems', 10), 'steer-and-release moves on (' + stepId(h) + ')');
  });

  S.check('GEMS: ends on the first gem collected, after a short read', () => {
    assert.ok(until(h, () => stepId(h) === 'draft', 60 * 30), 'still ' + stepId(h));
    assert.equal(st.mode, 'draft', 'the free level-up opened the real draft');
  });

  S.check('DRAFT: a stray Enter (held from before) and an early press do not advance it', () => {
    const shown = T.tut.model.shownMs;
    down('Enter', { repeat: true });
    assert.equal(stepId(h), 'draft', 'a repeat (held key) never counts');
    assert.equal(T.tut.press(shown - 50), false, 'began before the panel');
    assert.equal(T.tut.press(shown + 100), false, 'inside the guard');
    // The DOM button: a click with no press on it, and a press right away, both fail.
    const btn = T.tut.ui.btnEl;
    btn._ev.click({});
    btn._ev.pointerdown({}); btn._ev.click({});
    assert.equal(stepId(h), 'draft');
    h.pump(30);
    btn._ev.pointerdown({}); btn._ev.click({});
    h.pump(1);
    assert.equal(stepId(h), 'evolve', 'its own button, pressed after the guard, advances it');
    assert.equal(st.mode, 'draft', 'the draft is still open for the pick');
  });

  S.check('EVOLVE: ends on the pick (the auto-pick countdown is held for the step)', () => {
    h.pump(60 * 8);
    assert.equal(st.mode, 'draft', 'no auto-pick under the step');
    h.elements['ov-cards'].children[0].click();
    assert.ok(until(h, () => stepId(h) === 'skill', 60 * 3), 'still ' + stepId(h));
  });

  S.check('SKILL: steering past the idle wait does not move it on; firing the skill does', () => {
    down('d'); h.pump(60 * (TUT.IDLE_WAIT_S + 3)); up('d');
    assert.equal(stepId(h), 'skill');
    assert.ok(!/^Watch/.test(T.tut.model.text), 'no Watch line while the player drives');
    T.runAction('q');
    assert.ok(until(h, () => stepId(h) === 'potion', 30), 'still ' + stepId(h));
  });

  S.check('POTION: the hero is hurt first; drinking ends it', () => {
    h.pump(2);
    hurtBeforePotion = hp() < st.player.stats.maxHp * 0.5;
    assert.ok(hurtBeforePotion, 'hp ' + hp());
    h.pump(60 * 3);
    assert.equal(stepId(h), 'potion');
    T.runAction('h');
    assert.ok(until(h, () => stepId(h) === 'gold', 30), 'still ' + stepId(h) + ' ' + JSON.stringify({ mode: st.mode, pot: st.player.potions, hp: hp(), max: st.player.stats.maxHp, hold: st.bannerHold }));
  });

  S.check('GOLD then HANDOVER: the handover waits for its button', () => {
    assert.ok(until(h, () => stepId(h) === 'handover', 60 * 20), 'still ' + stepId(h));
    h.pump(60 * 5);
    assert.equal(stepId(h), 'handover');
    h.pump(30);
    down('Enter');
    assert.equal(T.tut.live, false, 'BEGIN (Enter) hands over');
    assert.equal(st.player.hp, st.player.stats.maxHp, 'full bars for the real run');
    h.pump(1);
    if (st.mode === 'playing') assert.ok(T.renderer.hudChrome.quests, 'the quest tracker is back after the handover');
  });

  S.check('the hero was never hurt by the field during the guided part (only the scripted hit)', () => {
    assert.ok(st.mode === 'playing' || st.mode === 'draft');
    assert.ok(T.tut.lastGuidedS > 0);
  });
}

// B: a player who touches nothing.
{
  const h = await fresh('idle');
  const T = h.T, st = h.state;
  const seq = [];
  let ended = false, minHp = Infinity, watch = new Set();
  for (let i = 0; i < 60 * 300 && T.tut.live; i++) {
    h.pump(1);
    const m = T.tut.model;
    if (m && seq[seq.length - 1] !== m.id) seq.push(m.id);
    if (m && /^Watch: /.test(m.text)) watch.add(m.id);
    if (st.mode === 'dead' || st.mode === 'death-cine') ended = true;
    minHp = Math.min(minHp, st.player.hp);
  }
  S.check('IDLE: the whole guided part completes with no input, every step shown in order', () => {
    assert.equal(T.tut.live, false, 'the guided part finished');
    assert.deepEqual(seq, ids);
    assert.deepEqual([...watch].sort(), ['evolve', 'move', 'potion', 'skill'], 'the pilot showed each action');
    assert.equal(T.tut.guided.skipped, false);
  });
  S.check('IDLE: no step ended the run, and the hero never dropped below the scripted hit', () => {
    assert.ok(!ended);
    assert.ok(minHp > 0, 'min hp ' + minHp);
    assert.ok(st.time < 0.1, 'the run clock started only at the handover (' + st.time + ')');
  });
  const gold0 = T.getProfile().gold;
  let t = 0;
  for (; t < 60 * 240 && st.mode !== 'dead'; t++) {
    if (st.mode === 'death-cine') h.key('keydown', { key: 'x', preventDefault() {} });
    h.pump(1);
  }
  S.check('run 1 still ends in death soon after the handover, and pays about what it always did', () => {
    assert.equal(st.mode, 'dead');
    assert.ok(st.time < 150, 'survived ' + st.time.toFixed(1) + 's after the handover');
    const paid = T.getProfile().gold - gold0;
    assert.ok(paid >= 280 && paid <= 750, 'paid ' + paid);
  });

  // The menu steps, on the same profile.
  const cards = () => [...h.elements['ov-cards'].children];
  const card = (name) => cards().find(c => (c.innerHTML || '').includes('class="name">' + name + '<'));
  S.check('END SCREEN: points at the gold and the SHOP; RETRY is not taken away', () => {
    h.pump(2);
    assert.equal(stepId(h), 'menu:end');
    assert.ok(card('RETRY') && card('SHOP'));
  });
  S.check('SHOP: points at an affordable upgrade; buying it is what ends the step', () => {
    card('SHOP').click(); h.pump(6);
    assert.equal(stepId(h), 'menu:shop_buy');
    const prof = T.getProfile();
    const goal = T.menus.bestNextPurchase();
    assert.ok(goal && prof.gold >= goal.cost, 'something affordable');
    prof.gold = goal.cost;   // the purchase leaves nothing else affordable: the step must still complete
    const before = prof.gold;
    card(goal.name).click(); h.pump(6);   // the shop re-render queues its own frames
    assert.ok(prof.gold < before, 'the purchase was made');
    assert.ok(T.tut.seen(LEDGER.shopBuy));
    assert.equal(stepId(h), 'menu:shop_back', JSON.stringify({ screen: T.tut.screen(), mode: st.mode, title: h.elements['ov-title'].textContent, play: T.tut.seen(LEDGER.play), sk: T.tut.seen(LEDGER.skipped) }));
  });
  S.check('BACK and PLAY: the title points at PLAY; run 2 opens with the evolution line', () => {
    card('BACK').click(); h.pump(6);
    assert.equal(stepId(h), 'menu:play');
    T.startRun(); h.pump(2);
    assert.ok(T.tut.seen(LEDGER.play));
    assert.equal(stepId(h), 'hint:run2');
    assert.ok(T.tut.pausesSim, 'the line holds the sim');
    const t0 = st.time; h.pump(30);
    assert.equal(st.time, t0, 'nothing moves under it');
    h.key('keydown', { key: 'Enter', preventDefault() {} }); h.pump(1);
    assert.notEqual(stepId(h), 'hint:run2', 'GOT IT (Enter) closed it');
    // Clear whatever else is on screen for the first time (a shrine, an arch).
    for (let i = 0; i < 10 && stepId(h); i++) { h.pump(30); T.tut.press(performance.now()); h.pump(1); }
  });

  S.check('HINTS: each shows once; a hint is dismissed only by its own button after the guard', () => {
    const p = st.player;
    p.stats.maxHp = 1e9; p.hp = 1e9;   // this check is about hints, not survival
    const settle = () => {
      for (let i = 0; i < 20 && (stepId(h) || st.mode !== 'playing'); i++) {
        if (st.mode === 'draft' || st.mode === 'evolve') h.elements['ov-cards'].children[0].click();
        h.pump(30); T.tut.press(performance.now()); h.pump(1);
      }
    };
    settle();
    st.chests.push({ id: 999, x: p.x + 30, y: p.y, age: 0 });
    assert.ok(until(h, () => stepId(h) === 'hint:chest', 5), 'the first chest on screen (' + stepId(h) + ', ' + st.mode + ')');
    const shown = T.tut.model.shownMs;
    assert.equal(T.tut.press(shown + 10), false, 'too early');
    h.pump(30);
    assert.equal(T.tut.press(performance.now()), true);
    st.chests.length = 0;
    settle();
    st.chests.push({ id: 998, x: p.x - 30, y: p.y, age: 0 });
    h.pump(5);
    assert.notEqual(stepId(h), 'hint:chest', 'never twice');
    assert.equal(T.tut.hint('chest'), false);
    st.chests.length = 0;
  });
  S.check('HINTS: every hint id shows exactly once per profile', () => {
    for (let i = 0; i < 10 && stepId(h); i++) { h.pump(30); T.tut.press(performance.now()); h.pump(1); }
    const banners = T.getProfile().banners;
    for (const id of Object.keys(HINTS)) {
      if (id === 'fusion') continue;                 // its own check below
      delete banners['hint:' + id];                  // whatever this run already met
      assert.equal(T.tut.hint(id), true, id + ' shows the first time');
      h.pump(1);
      assert.equal(stepId(h), 'hint:' + id);
      assert.equal(T.tut.model.button, 'GOT IT');
      assert.ok(T.tut.model.text.split(/s+/).length <= 14, id + ' is one short sentence');
      h.pump(30); assert.equal(T.tut.press(performance.now()), true); h.pump(1);
      assert.equal(T.tut.hint(id), false, id + ' never shows again');
    }
  });
  S.check('HINTS: the fusion hook point has its hint; Settings "HINTS: off" stops new ones', () => {
    for (let i = 0; i < 10 && stepId(h); i++) { h.pump(30); T.tut.press(performance.now()); h.pump(1); }
    T.tut.setHintsEnabled(false);
    assert.equal(T.tut.hint('fusion'), false, 'off');
    T.tut.setHintsEnabled(true);
    assert.equal(T.tut.hint('fusion'), true);
    h.pump(1);
    assert.equal(stepId(h), 'hint:fusion');
    h.pump(30); T.tut.press(performance.now());
    assert.equal(T.tut.hint('fusion'), false, 'once');
  });
}

// C: SKIP.
{
  const h = await fresh('skip');
  const T = h.T, st = h.state;
  until(h, () => stepId(h) === 'hero', 10);
  h.pump(30);
  S.check('SKIP: one press only arms it', () => {
    assert.equal(T.tut.skip(performance.now()), 'armed');
    assert.equal(T.tut.live, true);
    h.pump(1);
    assert.equal(T.tut.model.skip, 'TAP AGAIN TO SKIP');
  });
  S.check('SKIP: the second press ends every guided step for the run', () => {
    assert.equal(T.tut.skip(performance.now()), 'skipped');
    assert.equal(T.tut.live, false);
    h.pump(60 * 3);
    assert.ok(st.time > 2, 'the ordinary run started');
    assert.equal(stepId(h), null);
    T.die();
    for (let i = 0; i < 900 && st.mode !== 'dead'; i++) { if (st.mode === 'death-cine') h.key('keydown', { key: 'x', preventDefault() {} }); h.pump(1); }
    h.pump(2);
    assert.equal(stepId(h), null, 'no end-screen step after a skip');
    T.startRun(); h.pump(3);
    assert.notEqual(stepId(h), 'hint:run2', 'no second-run line after a skip');
  });
  S.check('Escape is the key twin of SKIP and also needs two presses', () => {
    const h2 = T;   // same boot: replay the guided run
    T.tut.replay(false); h.pump(40);
    assert.equal(h2.tut.live, true);
    h.key('keydown', { key: 'Escape', preventDefault() {} });
    assert.equal(h2.tut.live, true);
    h.key('keydown', { key: 'Escape', preventDefault() {} });
    assert.equal(h2.tut.live, false);
  });
}

S.done();
process.exit(0);
