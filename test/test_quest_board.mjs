// THE QUEST BOARD: its keys (Enter starts, Esc goes back to the run setup),
// what a quest pays at each prestige tier, and what a chain pays when its
// character is already owned.
// Run: node test/test_quest_board.mjs
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';
import { mulberry32 } from '../src/weather.js';
import * as Q from '../src/quests.js';
import { prestigeGoldMult, setPrestige } from '../src/prestige.js';
import { RUN_GOLD } from '../src/meta.js';

const { QUEST_BY_ID, CHAINS } = Q;

Math.random = mulberry32(20261002);

const h = await boot({ storage: [['hordes_onboarded', '1']] });
const T = h.T;
const st = T.state;
const S = suite('test_quest_board');
T.banners.suppressAll();
T.tut.setHintsEnabled(false);

const key = (k) => h.key('keydown', { key: k, preventDefault() {} });
const cards = () => [...h.elements['ov-cards'].children];
const cardName = (c) => ((c.innerHTML || '').match(/class="name">([^<]*)</) || [])[1] || '';
const cardText = (c) => (c.innerHTML || '').replace(/<[^>]+>/g, ' ');
const title = () => h.elements['ov-title'].textContent;
const world = () => T.getProfile().world;

// ---- 1. keys ----
S.check('START is the first card; the three quests follow; BACK is last', () => {
  T.menus.showTitle();
  T.world.board = null;
  T.menus.showQuestBoard();
  const names = cards().map(cardName);
  assert.equal(names.length, 5);
  assert.equal(names[0], 'START');
  assert.equal(names[4], 'BACK');
  assert.deepEqual(names.slice(1, 4), T.world.peekBoard().ids.map(id => QUEST_BY_ID[id].text.toUpperCase()));
  assert.ok(/\[ENTER\]/.test(cardText(cards()[0])) && /\[ESC\]/.test(cardText(cards()[4])));
});
S.check('Enter with no cursor presses START: the run begins with the board untouched', () => {
  T.menus.showTitle();
  T.world.board = null;
  T.menus.showQuestBoard();
  const ids = T.world.peekBoard().ids.slice();
  key('Enter');
  assert.equal(st.mode, 'playing', 'the run started (mode ' + st.mode + ')');
  assert.deepEqual(st.quests.map(q => q.id), ids, 'no quest was swapped away');
});
S.check('Esc goes back to the run setup, not the title', () => {
  T.menus.showTitle();
  T.menus.showPreRun();
  T.menus.showQuestBoard();
  assert.equal(title(), 'QUEST BOARD');
  key('Escape');
  assert.equal(st.mode, 'setup');
  assert.equal(title(), 'NEXT RUN', 'the run setup is showing');
  key('Escape');
  assert.equal(st.mode, 'title', 'Esc on the run setup still goes to the title');
});
S.check('a swap with the keyboard keeps the cursor on that quest, and spends only its own swap', () => {
  T.menus.showTitle();
  T.world.board = null;
  T.menus.showQuestBoard();
  key('ArrowDown'); key('ArrowDown');   // START, then the first quest
  key('Enter');
  assert.equal(st.mode, 'setup');
  assert.deepEqual(T.world.peekBoard().swapped, [0]);
  assert.ok(/\bdim\b/.test(cards()[1].className), 'the swapped quest is spent');
  T.menus.showTitle();
});

// ---- 2. quest gold scales with the prestige tier ----
function settledQuestGold(tier, byAuto = false) {
  setPrestige(T.getProfile(), tier);
  T.world.board = { ids: ['yard', 'fountain', 'vault'], swapped: [] };
  T.auto.on = byAuto;
  if (byAuto) { T.auto.runsInRow = 0; T.auto.restart(); } else T.startRun();
  h.pump(2);
  T.world.quest('yard');
  T.world.quest('fountain');
  const r = T.purse.settle();
  st.mode = 'title';
  T.auto.on = false;
  return r.breakdown.quests;
}
S.check('prestige 0: the two gold quests pay their listed 150', () => {
  assert.equal(settledQuestGold(0), 150);
});
S.check('prestige 2: each quest pays its gold x the tier gold multiplier', () => {
  const m = prestigeGoldMult(2);
  assert.ok(m > 1, 'the tier multiplies gold (x' + m + ')');
  assert.equal(settledQuestGold(2), Math.round(100 * m) + Math.round(50 * m));
});
S.check('an auto-continue run still takes its cut of the scaled quest gold', () => {
  const m = prestigeGoldMult(2);
  assert.equal(settledQuestGold(2, true),
    Math.round((Math.round(100 * m) + Math.round(50 * m)) * (1 - RUN_GOLD.AUTO_CONTINUE_PENALTY_PCT / 100)));
});
S.check('the board, the run setup and the done toast show the scaled pay', () => {
  const m = prestigeGoldMult(2);
  setPrestige(T.getProfile(), 2);
  assert.equal(Q.questPay('yard'), '100G');
  assert.equal(Q.questPay('yard', m), Math.round(100 * m) + 'G');
  assert.equal(Q.questPay('vault', m), 'A JOKER');
  T.world.board = { ids: ['yard', 'fountain', 'vault'], swapped: [] };
  T.menus.showQuestBoard();
  const yard = cards().find(c => cardName(c) === 'LOOT THE WALLED YARD');
  assert.ok(new RegExp('pays ' + Math.round(100 * m) + 'g').test(cardText(yard)), cardText(yard));
  T.menus.showPreRun();
  const q = cards().find(c => cardName(c) === 'QUESTS');
  assert.ok(cardText(q).includes('(' + Math.round(100 * m) + 'G)'), cardText(q));
  T.startRun(); h.pump(2);
  T.world.quest('yard');
  assert.ok(st.toasts.some(x => x.msg.includes('+' + Math.round(100 * m) + 'G AT THE END')), JSON.stringify(st.toasts));
  T.purse.settle();
  T.menus.showTitle();
  setPrestige(T.getProfile(), 0);
});

// ---- 3. a chain whose character is already owned ----
const warden = CHAINS.find(c => c.id === 'warden');
const lastStep = warden.steps[warden.steps.length - 1];
function runLastStep(owned) {
  const prof = T.getProfile();
  prof.unlockedCharacters = prof.unlockedCharacters.filter(id => id !== warden.unlock.id);
  if (owned) prof.unlockedCharacters.push(warden.unlock.id);
  world().chains[warden.id] = warden.steps.length - 1;
  T.world.board = { ids: [lastStep, 'fountain', 'wave3'], swapped: [] };
  T.startRun(); h.pump(2);
  const offers0 = st.jokerOffers;
  T.world.quest(QUEST_BY_ID[lastStep].ev);
  return { offers: st.jokerOffers - offers0, settled: T.purse.settle(), line: T.world.endLine() };
}
S.check('not owned: the last step unlocks the character, no joker', () => {
  const r = runLastStep(false);
  assert.equal(r.offers, 0);
  assert.ok(T.getProfile().unlockedCharacters.includes(warden.unlock.id));
  assert.equal(r.settled.breakdown.quests, QUEST_BY_ID[lastStep].gold);
  assert.ok(r.line.includes(warden.name + ' complete: ' + warden.unlock.id + ' unlocked'), r.line);
  st.mode = 'title';
});
S.check('owned: the last step pays a joker offer and its gold, and the end line says so', () => {
  const r = runLastStep(true);
  assert.equal(r.offers, 1, 'one joker offer queued when the step is done');
  assert.equal(r.settled.breakdown.quests, QUEST_BY_ID[lastStep].gold, 'the step gold is paid as well');
  assert.equal(world().chains[warden.id], warden.steps.length, 'the chain is complete');
  assert.ok(r.line.includes(warden.name + ' complete: a joker (' + warden.unlock.id + ' was already yours)'), r.line);
  assert.ok(!/unlocked/.test(r.line), 'no unlock is claimed: ' + r.line);
  st.mode = 'title';
});
S.check('owned: the joker offer opens in the run and names the chain', () => {
  const prof = T.getProfile();
  if (!prof.unlockedCharacters.includes(warden.unlock.id)) prof.unlockedCharacters.push(warden.unlock.id);
  world().chains[warden.id] = warden.steps.length - 1;
  T.world.board = { ids: [lastStep, 'fountain', 'wave3'], swapped: [] };
  T.startRun(); h.pump(2);
  T.world.quest(QUEST_BY_ID[lastStep].ev);
  assert.ok(st.toasts.some(x => x.msg === warden.name + ' DONE: A JOKER'), JSON.stringify(st.toasts));
  let guard = 0;
  while (st.mode !== 'draft' && guard++ < 120) h.pump(1, () => { st.player.hp = st.player.stats.maxHp; });
  assert.equal(st.mode, 'draft');
  assert.equal(st.draftKind, 'joker');
  assert.equal(h.elements['ov-sub'].textContent, "warden's path is done: take 1 joker");
  T.purse.settle();
  st.mode = 'title';
});
S.check('pure: the joker step is the last step of a chain whose character is owned', () => {
  const w = { chains: { warden: warden.steps.length - 1, seeker: 0 } };
  const owns = (id) => id === warden.unlock.id;
  assert.equal(Q.chainJokerStep(w, lastStep, owns), warden);
  assert.equal(Q.chainJokerStep(w, lastStep, () => false), null, 'not owned: the character is the reward');
  assert.equal(Q.chainJokerStep({ chains: { warden: 0 } }, warden.steps[0], owns), null, 'an earlier step');
  assert.equal(Q.chainJokerStep(w, 'fountain', owns), null, 'not a chain step');
  assert.equal(Q.chainReward(warden, false), 'unlocks paladin');
  assert.equal(Q.chainReward(warden, true), 'pays a joker (paladin is yours)');
});
S.check('the board and the SECRETS shelf say what the chain pays', () => {
  const prof = T.getProfile();
  world().chains[warden.id] = warden.steps.length - 1;
  T.world.board = { ids: [lastStep, 'fountain', 'wave3'], swapped: [] };
  T.menus.showQuestBoard();
  const step = () => cardText(cards().find(c => cardName(c) === QUEST_BY_ID[lastStep].text.toUpperCase()));
  assert.ok(/pays 100g and a joker/.test(step()) && /warden's path step/.test(step()), step());
  prof.unlockedCharacters = prof.unlockedCharacters.filter(id => id !== warden.unlock.id);
  T.menus.showQuestBoard();
  assert.ok(/pays 100g /.test(step()) && !/joker/.test(step()), step());
  T.menus.showSecrets();
  const shelf = () => cardText(cards().find(c => cardName(c).startsWith(warden.name)));
  assert.ok(/unlocks paladin/.test(shelf()), shelf());
  prof.unlockedCharacters.push(warden.unlock.id);
  T.menus.showSecrets();
  assert.ok(/pays a joker \(paladin is yours\)/.test(shelf()), shelf());
  T.menus.showTitle();
});

S.done();
process.exit(0);
