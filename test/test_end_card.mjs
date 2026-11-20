// R5 THE END CARD (src/end_card.js, main.js composeEndScreen): over the death
// movie's frozen frame, the gold counting into the bank, trophies as icons,
// unlocks as cards, BUY NEXT as a shop shortcut.
// Run: node test/test_end_card.mjs
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';
import { mulberry32 } from '../src/weather.js';
import { LEDGER } from '../src/tutorial.js';
import { CONFIG as C } from '../src/config.js';
import * as EC from '../src/end_card.js';

Math.random = mulberry32(20261119);
const opts = { storage: [['hordes_onboarded', '1']] };
const h = await boot(opts);
const { T, state: st, elements: el } = h;
T.banners.suppressAll();
const S = suite('test_end_card');
const prof = T.getProfile();
const cards = () => [...el['ov-cards'].children];
const nameOf = (c) => ((c.innerHTML || '').match(/class="name">([^<]*)</) || [])[1] || '';
const descOf = (c) => ((c.innerHTML || '').match(/class="desc">([^<]*)</) || [])[1] || '';
const sub = () => el['ov-sub'].innerHTML || '';
const kdown = (key) => h.key('keydown', { key, preventDefault() {} });
// Every sound the game asks for, in order.
const sfx = [];
const audio = T.audio.get();
const spy = { ...audio, playSfx: (id, ...r) => { sfx.push(id); return audio.playSfx(id, ...r); },
  stopSfx: (id) => { sfx.push('stop:' + id); return typeof audio.stopSfx === 'function' ? audio.stopSfx(id) : false; } };
T.audio.set(spy);

const startRun = () => {
  if (st.mode !== 'title') T.showTitle();
  T.startRun(); h.pump(2);
  st.spawnTimer = 1e9; st.wave.endsAt = st.time + 1e9; st.wave.midAt = st.time + 1e9;
};
// A real death, the movie skipped the way a player skips it.
function dieToCard() {
  T.die();
  h.pump(2);   // the movie's first frames: the frozen frame is taken
  h.skipMovie();
  assert.equal(st.mode, 'dead');
  assert.equal(el.overlay.style.display, 'flex', 'the end card is up');
}
const pumpS = (s) => h.pump(Math.round(s * 60));

// ---- the pure half ----
S.check('the count: nothing before the delay, rises without stepping back, lands on the total', () => {
  assert.equal(EC.countShown(500, 0), 0);
  assert.equal(EC.countShown(500, EC.COUNT_DELAY_S), 0);
  assert.equal(EC.countShown(500, 0.15), 0, 'the eye lands first: +0 for 0.2 s');
  let prev = 0;
  for (let t = 0; t <= EC.COUNT_END_S + 0.1; t += 1 / 60) {
    const v = EC.countShown(500, t);
    assert.ok(v >= prev && v <= 500, 't=' + t + ': ' + v);
    prev = v;
  }
  assert.equal(EC.countShown(500, EC.COUNT_END_S), 500);
  assert.ok(EC.countShown(500, EC.COUNT_DELAY_S + EC.COUNT_S / 2) > 250, 'ease-out: past half at half time');
  // The bank fills by what the count shows: it ends on the bank, starts on the bank before the run.
  assert.deepEqual(EC.countFrame(120, 900, 0), { gold: 0, bank: 780 });
  assert.deepEqual(EC.countFrame(120, 900, EC.COUNT_END_S), { gold: 120, bank: 900 });
  // The cue's bell lands with the number.
  assert.ok(Math.abs(EC.COUNT_CUE_AT_S + EC.BANK_BELL_S - EC.COUNT_END_S) < 1e-9);
});
S.check('BUY NEXT words: the row and price, can afford it or what is missing; nothing when all is bought', () => {
  assert.deepEqual(EC.buyNextWords({ name: 'Vitality', cost: 40 }, 55),
    { name: 'BUY NEXT', desc: 'Vitality, 40 gold · you can afford it', afford: true });
  assert.deepEqual(EC.buyNextWords({ name: 'Vitality', cost: 40 }, 15),
    { name: 'BUY NEXT', desc: 'Vitality, 40 gold · 25 more to go', afford: false });
  assert.equal(EC.buyNextWords(null, 99), null);
});
S.check('the reading order: ending and killer, the gold, what was earned, then the details', () => {
  const html = EC.endCardHtml({ tags: ['AUTO-CONTINUE'], lead: '', cause: 'BRUTE in melee', gold: 12, bank: 40, firstClear: true,
    trophies: [{ id: 'FIRST_BLOOD', name: 'First Blood' }], unlocks: [{ kind: 'shopRow', id: 'weapon_orbit', label: 'Orbit' }],
    threats: ['Swift elites'], stats: 'TIME 00:31 · WAVE 1', parts: ['run award 10'], tip: 'TIP: x' });
  const at = (s) => { const i = html.indexOf(s); assert.ok(i >= 0, s + ' missing: ' + html); return i; };
  const order = ['AUTO-CONTINUE', 'KILLED BY BRUTE in melee', 'GOLD EARNED: +12', 'BANK 40', 'NEW BEST TIME!',
    'data-trophy="FIRST_BLOOD"', 'First Blood', 'data-shop="weapon_orbit"', 'UNLOCKED, FREE', 'NEW THREAT', 'Swift elites',
    'TIME 00:31', 'run award 10', 'TIP: x'];
  for (let i = 1; i < order.length; i++) assert.ok(at(order[i - 1]) < at(order[i]), order[i - 1] + ' before ' + order[i]);
});

S.check('a new player\'s first end card leads to SHOP alone: no BUY NEXT while the lesson is owed', () => {
  T.tut.mark(LEDGER.cohort);
  startRun();
  dieToCard();
  const names = cards().map(nameOf);
  assert.ok(!names.includes('BUY NEXT'), names.join(','));
  assert.deepEqual(names.slice(0, 2), ['RETRY', 'SHOP']);
  assert.ok(sub().includes('class="ec-gold earn"'), 'the lesson\'s gold target is there');
  // The old card said BUY NEXT as a line: it stays, in the quieter block.
  const goal = T.menus.bestNextPurchase();
  assert.ok(goal, 'something to buy');
  const more = sub().indexOf('class="ec-more"');
  assert.ok(more >= 0 && sub().slice(more).includes('BUY NEXT: ' + EC.buyNextWords(goal, prof.gold).desc), sub());
  kdown('b');
  assert.equal(st.mode, 'dead', 'B does nothing without the card');
  T.tut.mark(LEDGER.skipped);   // the rest of this file is a settled player
});
// ---- a death through the real loop ----
S.check('a death: the card sits over the movie\'s frozen frame and the count waits for the card', () => {
  T.setPilotMode('AUTO_ALL');
  T.auto.on = false;
  startRun();
  prof.gold = 1000;
  T.die();
  h.pump(2);
  assert.equal(st.mode, 'death-cine');
  const c = T.endCard.count();
  assert.ok(c && !c.done && c.t === 0, 'composed under the movie, not counting yet');
  h.pump(20);
  assert.equal(T.endCard.count().t, 0, 'the count waits while the movie plays');
  h.skipMovie();
  assert.equal(st.mode, 'dead');
  const snap = T.endCard.backdrop();
  assert.ok(snap && snap.width > 0, 'the movie\'s frozen frame is kept for the card');
  // The frame paints that picture and does not re-render the world.
  h.rec.on = true; h.rec.rects.length = 0;
  h.pump(1);
  h.rec.on = false;
  assert.ok(h.rec.rects.some(r => r.w === snap.width), 'the frozen frame is drawn');
});
S.check('the gold counts over its length on the wall clock; the bank cue plays once, as the number lands', () => {
  sfx.length = 0;
  pumpS(EC.COUNT_CUE_AT_S - 0.15);
  const c = T.endCard.count();
  assert.ok(!c.done && c.t > 0, 'counting');
  assert.ok(!sfx.includes('goldBank'), 'no cue yet');
  pumpS(0.3);
  assert.equal(sfx.filter(x => x === 'goldBank').length, 1, 'the cue started');
  assert.ok(!T.endCard.count().done, 'and the count is still running under it');
  pumpS(0.5);
  assert.ok(T.endCard.count().done, 'landed');
  pumpS(1);
  assert.equal(sfx.filter(x => x === 'goldBank').length, 1, 'once');
});
S.check('the summary keeps every fact: killer, gold, bank, time, wave, level, kills, the gold parts', () => {
  const html = sub();
  assert.match(html, /KILLED BY /);
  assert.match(html, new RegExp('GOLD EARNED: \\+' + st.runSettled.gold));
  assert.ok(html.includes('BANK ' + prof.gold));
  assert.match(html, /TIME \d\d:\d\d · WAVE \d+ · LEVEL \d+ · \d+ KILLS/);
  assert.match(html, /run award \d+ · survival \d+ · kills \d+/);
});
S.check('BUY NEXT: the last card names the best purchase and its price', () => {
  const goal = T.menus.bestNextPurchase();
  assert.ok(goal, 'something to buy');
  const names = cards().map(nameOf);
  assert.deepEqual(names, ['RETRY', 'SHOP', 'AUTO-CONTINUE: OFF', 'TITLE', 'BUY NEXT']);
  const buy = cards()[4];
  assert.equal(descOf(buy), goal.name + ', ' + goal.cost + ' gold · ' +
    (prof.gold >= goal.cost ? 'you can afford it' : (goal.cost - prof.gold) + ' more to go') + ' [B]');
  // Keyboard: the cursor reaches it last, RETRY stays the default.
  assert.equal(T.menuFocus(), -1);
  for (let i = 0; i < 5; i++) kdown('ArrowRight');
  assert.equal(T.menuFocus(), 4, 'the fifth arrow press is on BUY NEXT');
  kdown('ArrowRight');
  assert.equal(T.menuFocus(), 0, 'and the cursor wraps to RETRY');
});
S.check('B (or the card) opens the shop with the cursor on that row; Enter buys it', () => {
  const goal = T.menus.bestNextPurchase();
  const gold0 = prof.gold;
  kdown('b');
  assert.equal(st.mode, 'menu');
  assert.equal(el['ov-title'].textContent, 'SHOP');
  const sel = T.endCard.shopSel();
  assert.ok(sel && (sel.innerHTML || '').includes('class="name">' + goal.name + '<'), 'the cursor is on ' + goal.name);
  kdown('Enter');
  assert.equal(prof.gold, gold0 - goal.cost, 'Enter bought it');
});
S.check('the cursor is for that one visit: BACK, then SHOP opens with no cursor on the row', () => {
  const back = cards().find(c => nameOf(c) === 'BACK');
  assert.ok(back, 'the shop has BACK');
  back.click();
  assert.equal(st.mode, 'title');
  const shop = cards().find(c => nameOf(c) === 'SHOP');
  assert.ok(shop, 'the title has SHOP');
  shop.click();
  assert.equal(el['ov-title'].textContent, 'SHOP');
  assert.equal(T.endCard.shopSel(), null, 'no cursor');
});
S.check('a press during the count lands the numbers at once, silently', () => {
  startRun();
  dieToCard();
  sfx.length = 0;
  pumpS(0.4);
  assert.ok(!T.endCard.count().done);
  kdown('ArrowDown');
  assert.ok(T.endCard.count().done, 'landed on the press');
  pumpS(1.5);
  assert.ok(!sfx.includes('goldBank'), 'no cue after a press');
});
S.check('a press after the cue started stops it: the bell does not ring after the numbers landed', () => {
  startRun();
  dieToCard();
  sfx.length = 0;
  pumpS(EC.COUNT_CUE_AT_S + 0.06);
  assert.ok(sfx.includes('goldBank'), 'the cue started');
  assert.ok(!T.endCard.count().done);
  kdown('ArrowDown');
  assert.ok(T.endCard.count().done, 'landed on the press');
  assert.deepEqual(sfx.filter(x => x.startsWith('stop:')), ['stop:goldBank'], 'and the cue was cut');
});
S.check('a press before the cue stops nothing; a count that lands on its own stops nothing', () => {
  startRun();
  dieToCard();
  sfx.length = 0;
  pumpS(0.3);
  kdown('ArrowDown');
  pumpS(EC.COUNT_END_S + 0.5);
  assert.deepEqual(sfx, [], 'no cue, no stop');
  startRun();
  dieToCard();
  sfx.length = 0;
  pumpS(EC.COUNT_END_S + 0.2);
  kdown('ArrowDown');
  assert.deepEqual(sfx, ['goldBank'], 'the cue played whole');
});
S.check('the frozen frame stays while the card exists: a trip away and back finds it; the title lets it go', () => {
  startRun();
  dieToCard();
  const snap = T.endCard.backdrop();
  assert.ok(snap);
  T.menus.showSettings();
  h.pump(2);
  T.endCard.reshow();
  assert.equal(st.mode, 'dead');
  h.rec.on = true; h.rec.rects.length = 0;
  h.pump(1);
  h.rec.on = false;
  assert.equal(T.endCard.backdrop(), snap, 'the same picture');
  assert.ok(h.rec.rects.some(r => r.w === snap.width), 'and it is drawn');
  T.showTitle();
  assert.equal(T.endCard.backdrop(), null, 'gone with the title');
});
S.check('the frozen frame is drawn only under the end card, and is let go when the end screen is', () => {
  startRun();
  dieToCard();
  const snap = T.endCard.backdrop();
  assert.ok(snap);
  // The world is drawn (renderer.render) exactly when the picture is not.
  const R = T.renderer;
  let worldDraws = 0;
  R.render = function (...a) { worldDraws++; return Object.getPrototypeOf(this).render.apply(this, a); };
  try {
    h.pump(1);
    assert.equal(worldDraws, 0, 'under the end card: the picture, not the world');
    // Another screen over the card (settings): the picture is kept, not drawn.
    T.menus.showSettings();
    h.pump(1);
    assert.equal(T.endCard.backdrop(), snap, 'kept for the way back');
    assert.equal(worldDraws, 1, 'under another screen the world is drawn');
    // The end screen goes without a new run: the picture goes with it.
    T.endCard.reshow();
    st.endScreen = null;
    h.pump(1);
    assert.equal(T.endCard.backdrop(), null, 'no end screen, no frozen frame');
    assert.equal(worldDraws, 2, 'and the world is drawn');
  } finally { delete R.render; }
  T.showTitle();
});
S.check('BUY NEXT names a row that can be bought now when the core is out of reach; missing gold only when nothing is', () => {
  const keep = { gold: prof.gold, purchased: prof.purchased };
  try {
    prof.purchased = { hp: 3, dmg: 2 };
    prof.gold = 140;
    const g = T.menus.bestNextPurchase();
    assert.equal(g.id, 'focus', 'the cheapest row in reach: ' + g.name + ' ' + g.cost);
    assert.ok(EC.buyNextWords(g, prof.gold).afford);
    prof.gold = 40;
    const g2 = T.menus.bestNextPurchase();
    assert.ok(g2.cost > 40 && (g2.id === 'hp' || g2.id === 'dmg' || /^weapon_/.test(g2.id)), 'broke: the cheapest core step, ' + g2.id);
    assert.match(EC.buyNextWords(g2, prof.gold).desc, /more to go$/);
  } finally { prof.gold = keep.gold; prof.purchased = keep.purchased; }
});
S.check('a hidden tab lands the count', () => {
  startRun();
  dieToCard();
  T.endCard.countFrame(0.1, false);
  assert.ok(T.endCard.count().done, 'hidden: final at once');
});
S.check('reduced motion: final numbers at once, no cue', () => {
  opts.reducedMotion = true;
  try {
    startRun();
    sfx.length = 0;
    dieToCard();
    assert.ok(T.endCard.count().done, 'no count under reduced motion');
    pumpS(1.5);
    assert.ok(!sfx.includes('goldBank'));
    assert.ok(T.endCard.backdrop(), 'the still\'s frozen frame stays under the card');
  } finally { opts.reducedMotion = false; }
});
S.check('the win: RETRY first, BUY NEXT last (after PRESTIGE when offered); no frozen frame', () => {
  startRun();
  prof.gold = 5;
  T.run.runSurvived();
  assert.equal(st.mode, 'dead');
  assert.equal(el['ov-title'].textContent, 'RUN SURVIVED');
  const names = cards().map(nameOf);
  assert.equal(names[0], 'RETRY');
  assert.equal(names[names.length - 1], 'BUY NEXT');
  const goal = T.menus.bestNextPurchase();
  assert.equal(descOf(cards()[names.length - 1]), EC.buyNextWords(goal, prof.gold).desc + ' [B]');
  assert.equal(T.endCard.backdrop(), null);
  assert.match(sub(), /You lasted the full/);
});
S.check('an unattended run nobody watches: the count is final at once and the restart keeps its time', () => {
  T.auto.on = true;
  startRun();
  st.unattended = true;
  T.die();   // unattended: the movie is skipped in the same call
  assert.equal(st.mode, 'dead');
  assert.equal(T.auto.restartLeft, C.AUTOPILOT.AUTO_RESTART_S, 'the countdown starts at its full length');
  // The next run starts after exactly that much wall time (60 frames a second).
  let n = 0;
  while (st.mode === 'dead' && n < 60 * 20) { h.pump(1); n++; }
  assert.equal(st.mode, 'playing');
  assert.ok(Math.abs(n - C.AUTOPILOT.AUTO_RESTART_S * 60) <= 1, 'restart after ' + n + ' frames');
  // A run auto-continue started, with no input since: nobody is watching.
  st.spawnTimer = 1e9; st.wave.endsAt = st.time + 1e9;
  sfx.length = 0;
  T.die();
  assert.equal(st.mode, 'dead');
  assert.ok(T.endCard.count().done, 'final at once');
  h.pump(90);
  assert.ok(!sfx.includes('goldBank'), 'no cue for nobody');
  T.auto.on = false;
  st.unattended = false;
});
S.done();
