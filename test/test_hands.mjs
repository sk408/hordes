// HANDS (src/hands.js): the different cards a run drafts form a poker hand and
// the best one pays a run-long bonus.
//   - every draftable hand card carries a rank and a suit; jokers carry none;
//   - every hand type is detected, duplicates never count, and the best hand wins;
//   - the bonus goes on exactly once, and comes off / is replaced when the hand changes;
//   - draft cards carry a "makes:" hint, and the real pick() pays the hand;
//   - the HUD and the pause screen show the hand.
// Run: node test/test_hands.mjs
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';
import { UPGRADES, DRAFT_RARE_UPGRADES, runBase } from '../src/config.js';
import { WEAPON_TYPES, makeWeapon } from '../src/weapons.js';
import { cardArt } from '../src/art/cards.js';
import {
  HANDS, HAND_BY_ID, FLUSH_BOONS, STRAIGHT_SIZE, FLUSH_SIZE, WILD_KEY,
  handCardOf, addHandCard, handCards, evaluateHand, handBonus, describeHandBonus,
  refreshHand, handHint, handName,
} from '../src/hands.js';
import { JOKER_IDS, DOUBLE_DOWN_SCALE } from '../src/jokers.js';

const s = suite('test_hands');

// A hand from short codes: '2H' = rank 2 of hearts. Keys are unique per code.
const SUIT = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' };
const VAL = { J: 10, Q: 11, K: 12 };
const card = (code) => {
  const rank = code.slice(0, -1), suit = SUIT[code.slice(-1)];
  return { key: code, rank, value: VAL[rank] || Number(rank), suit, name: code };
};
const hand = (...codes) => evaluateHand(codes.map(card));
const player = () => ({
  hp: 100, base: { damage: 10, maxHp: 100 },
  stats: { damage: 10, maxHp: 100, cooldown: 1, purseKillMult: 1, xpMult: 1 },
});
const hold = (p, ...offerIds) => { for (const id of offerIds) addHandCard(p, id); return refreshHand(p); };

s.check('every draftable hand card has a rank and a suit; no two share both; jokers are not hand cards', () => {
  const ids = [...UPGRADES.map(u => u.id), ...DRAFT_RARE_UPGRADES.map(u => u.id),
    ...Object.keys(WEAPON_TYPES).map(t => 'lvl_' + t + '_1'), 'lvl_VOLLEY_1'];
  const seen = new Map();
  for (const id of ids) {
    const c = handCardOf(id);
    assert.ok(c, id + ' is a hand card');
    assert.ok(c.value >= 1 && c.value <= 12 && SUIT[c.suit[0].toUpperCase()], id + ' rank and suit');
    assert.equal(cardArt(c.key).rank, c.rank, id + ' reads the rank painted on its card');
    const k = c.rank + c.suit;
    assert.ok(!seen.has(k) || seen.get(k) === c.key, id + ' shares ' + k + ' with ' + seen.get(k));
    seen.set(k, c.key);
  }
  // A weapon's level-up card and its NEW card are the same hand card.
  assert.equal(handCardOf('lvl_ORBIT_3').key, handCardOf('wpn_ORBIT').key);
  for (const id of JOKER_IDS) assert.equal(handCardOf('joker_' + id), null, id + ' is not a hand card');
  assert.equal(handCardOf('nope'), null);
  // Every suit can reach a flush and four queens exist: the top hands are reachable.
  for (const suit of Object.values(SUIT)) {
    const n = new Set(ids.map(handCardOf).filter(c => c.suit === suit).map(c => c.key)).size;
    assert.ok(n >= FLUSH_SIZE, suit + ' has ' + n + ' cards (a flush needs ' + FLUSH_SIZE + ')');
  }
  const queens = ['dmg', 'gold_pct', 'edge', 'thorns'].map(handCardOf);
  assert.deepEqual(queens.map(c => c.rank), ['Q', 'Q', 'Q', 'Q']);
  assert.equal(new Set(queens.map(c => c.suit)).size, 4, 'four queens, four suits');
});

s.check('every hand type is detected', () => {
  assert.equal(hand('2H'), null);
  assert.equal(hand('2H', '5C', '9S'), null);
  assert.equal(hand('2H', '2S').id, 'pair');
  assert.equal(hand('2H', '2S', '5C', '5S').id, 'twopair');
  assert.equal(hand('3H', '3S', '3C').id, 'three');
  assert.equal(hand('5C', '6D', '7S', '8S').id, 'straight');
  assert.equal(hand('9S', 'JC', 'QD', 'KH').id, 'straight', '9-J-Q-K: J follows 9');
  assert.equal(hand('2S', '7S', '8S', 'QS').id, 'flush');
  assert.equal(hand('3H', '3S', '3C', '2H', '2S').id, 'fullhouse');
  assert.equal(hand('QS', 'QD', 'QH', 'QC').id, 'four');
  assert.deepEqual([STRAIGHT_SIZE, FLUSH_SIZE], [4, 4]);
  assert.deepEqual(HANDS.map(h => h.id), ['pair', 'twopair', 'three', 'straight', 'flush', 'fullhouse', 'four']);
});

s.check('edge cases: duplicates, near misses, and the order of the best hand', () => {
  // A second copy of the same card adds nothing.
  assert.equal(evaluateHand([card('2H'), card('2H')]), null);
  assert.equal(evaluateHand([card('2H'), card('2H'), card('2S')]).id, 'pair');
  // Three in a row is not a straight; three of a suit is not a flush; a gap breaks a run.
  assert.equal(hand('5C', '6D', '7S'), null);
  assert.equal(hand('5C', '6D', '8S', '9S'), null);
  assert.equal(hand('2S', '7S', '8S', '3H'), null);
  // A pair inside a straight still counts the straight (one card per rank).
  assert.equal(hand('5C', '5S', '6D', '7S', '8S').id, 'straight');
  // The best hand wins: flush over straight over three; full house over flush; four over all.
  assert.equal(hand('5S', '6S', '7S', '8S').id, 'flush');
  assert.equal(hand('3H', '3S', '3C', '5C', '6D', '7S', '8H').id, 'straight');
  assert.equal(hand('3H', '3S', '3C', '2H', '2S', '7H', '8H').id, 'fullhouse', 'full house beats the heart flush');
  assert.equal(hand('QS', 'QD', 'QH', 'QC', '2H', '2S').id, 'four');
  // Two flushes: the bigger suit; a tie goes to spades, hearts, diamonds, clubs.
  assert.equal(hand('2H', '3H', '6H', 'KH', '2S', '7S', '8S', 'QS', '9S').suit, 'spades');
  assert.equal(hand('2H', '3H', '6H', 'KH', '5C', '3C', 'QC', '7C').suit, 'hearts');
  // The cards that make the hand are named; the pair picked is the higher one.
  assert.deepEqual(hand('2H', '2S', '9S', 'QS', 'QD').cards.sort(), ['2H', '2S', 'QD', 'QS']);
  assert.deepEqual(hand('2H', '2S', 'KH', 'KS', '5C', '5S').cards.sort(), ['5C', '5S', 'KH', 'KS']);
  assert.equal(handName('flush', 'clubs'), 'Club Flush');
  // Shortcut: one card fewer for straights and flushes only.
  assert.equal(evaluateHand(['5C', '6D', '7S'].map(card), { short: true }).id, 'straight');
  assert.equal(evaluateHand(['2S', '7S', '8S'].map(card), { short: true }).id, 'flush');
  assert.equal(evaluateHand(['2S', '7H'].map(card), { short: true }), null);
  // Wild Card: one extra card of whatever helps most.
  assert.equal(evaluateHand([card('2H')], { wild: true }).id, 'pair');
  assert.equal(evaluateHand(['QS', 'QD', 'QH'].map(card), { wild: true }).id, 'four');
  assert.ok(evaluateHand([card('2H')], { wild: true }).cards.includes(WILD_KEY));
});

s.check('the bonus table: +10% to +60% damage, and a flush boosts its suit\'s family', () => {
  for (const h of HANDS) assert.ok(h.dmg >= 0.10 && h.dmg <= 0.60, h.id + ' ' + h.dmg);
  for (let i = 1; i < HANDS.length; i++) assert.equal(HAND_BY_ID[HANDS[i].id].order, i + 1);
  assert.deepEqual(handBonus(hand('2H', '2S')), { dmg: 0.10, hp: 0, cooldown: 1, gold: 0, xp: 0 });
  assert.deepEqual(handBonus(hand('QS', 'QD', 'QH', 'QC')), { dmg: 0.60, hp: 0.30, cooldown: 1, gold: 0, xp: 0 });
  assert.equal(handBonus(hand('2S', '7S', '8S', 'QS')).dmg, 0.50, 'spades: damage');
  assert.equal(handBonus(hand('2H', '3H', '6H', 'KH')).hp, FLUSH_BOONS.hearts.hp);
  assert.equal(handBonus(hand('6D', 'JD', 'QD', '1D')).gold, 0.50);
  assert.equal(handBonus(hand('3C', '5C', 'QC', '7C')).cooldown, 0.80);
  assert.equal(describeHandBonus(hand('3H', '3S', '3C', '2H', '2S')), '+50% damage, +25% max HP');
  assert.equal(describeHandBonus(hand('5C', '6D', '7S', '8S')), '+30% damage, fire 10% faster');
  assert.equal(describeHandBonus(hand('2H', '2S'), DOUBLE_DOWN_SCALE), '+15% damage');
  assert.equal(describeHandBonus(hand('2H', '2S'), 1, 0.04), '+4% damage', 'the count-up override');
});

s.check('the bonus is applied exactly once, replaced when the hand improves, and removed when it goes', () => {
  const p = player();
  assert.equal(hold(p, 'hp').changed, false, 'one card: no hand, nothing moves');
  assert.equal(p.stats.damage, 10);
  let r = hold(p, 'lvl_VOLLEY_1');                       // 2 of hearts + 2 of spades
  assert.deepEqual([r.changed, r.upgraded, r.hand.id], [true, true, 'pair']);
  assert.ok(Math.abs(p.stats.damage - 11) < 1e-9, 'pair: +10% of the run\'s starting damage');
  // The same hand again: nothing is added a second time.
  for (let i = 0; i < 5; i++) assert.equal(refreshHand(p).changed, false);
  assert.equal(hold(p, 'lvl_VOLLEY_2', 'hp').changed, false, 'copies of held cards change nothing');
  assert.ok(Math.abs(p.stats.damage - 11) < 1e-9);
  assert.equal(handCards(p).length, 2);
  // A better hand replaces the bonus, it does not stack on it.
  r = hold(p, 'dmg', 'gold_pct');                        // two queens: two pair
  assert.deepEqual([r.hand.id, r.prev.id, r.upgraded], ['twopair', 'pair', true]);
  assert.ok(Math.abs(p.stats.damage - 12) < 1e-9, 'two pair: +20%, not +30%');
  r = hold(p, 'edge');                                   // three queens + the pair of twos
  assert.equal(r.hand.id, 'fullhouse');
  assert.ok(Math.abs(p.stats.damage - 15) < 1e-9 && Math.abs(p.stats.maxHp - 125) < 1e-9);
  r = hold(p, 'thorns');
  assert.equal(r.hand.id, 'four');
  assert.ok(Math.abs(p.stats.damage - 16) < 1e-9 && Math.abs(p.stats.maxHp - 130) < 1e-9);
  // Multiplicative and additive parts come off exactly.
  const q = player();
  hold(q, 'speed', 'rate', 'thorns', 'lvl_MINE_1');      // four clubs
  assert.equal(q.hand.id + ':' + q.hand.suit, 'flush:clubs');
  assert.ok(Math.abs(q.stats.cooldown - 0.8) < 1e-12 && Math.abs(q.stats.damage - 12.5) < 1e-9);
  q.hp = q.stats.maxHp;
  q.handCards = {};
  r = refreshHand(q);
  assert.deepEqual([r.changed, r.upgraded, r.hand], [true, false, null]);
  assert.ok(Math.abs(q.stats.cooldown - 1) < 1e-12 && Math.abs(q.stats.damage - 10) < 1e-9, 'back to the start');
  // Hearts: max HP goes on, and comes off without leaving hp above the cap.
  const h = player();
  hold(h, 'hp', 'hp_pct', 'edge', 'lvl_EMBER_1');
  assert.ok(Math.abs(h.stats.maxHp - 140) < 1e-9);
  h.hp = 140; h.handCards = {}; refreshHand(h);
  assert.deepEqual([h.stats.maxHp, h.hp], [100, 100]);
  // Diamonds: gold and XP.
  const d = player();
  hold(d, 'pickup', 'gold_pct', 'xp_pct', 'lvl_METEOR_1');
  assert.ok(Math.abs(d.stats.purseKillMult - 1.5) < 1e-12 && Math.abs(d.stats.xpMult - 1.25) < 1e-12);
  // Double Down: the same hand at a new scale is re-applied at that scale, once.
  const dd = player();
  hold(dd, 'hp', 'lvl_VOLLEY_1');
  assert.equal(refreshHand(dd, { scale: DOUBLE_DOWN_SCALE }).changed, true);
  assert.ok(Math.abs(dd.stats.damage - 11.5) < 1e-9);
  assert.equal(refreshHand(dd, { scale: DOUBLE_DOWN_SCALE }).changed, false);
  assert.equal(refreshHand(dd).changed, true);
  assert.ok(Math.abs(dd.stats.damage - 11) < 1e-9);
});

s.check('hints: a card says what it would make, only when that is a new or better hand', () => {
  const p = player();
  assert.equal(handHint(p, 'hp'), null, 'a first card makes nothing');
  hold(p, 'hp');
  assert.equal(handHint(p, 'lvl_VOLLEY_1').text, 'makes: PAIR');
  assert.equal(handHint(p, 'hp'), null, 'a card already held');
  assert.equal(handHint(p, 'speed'), null, 'no hand from it');
  assert.equal(handHint(p, 'joker_rime'), null, 'a joker never makes a hand');
  hold(p, 'lvl_VOLLEY_1', 'dmg');
  assert.equal(handHint(p, 'gold_pct').text, 'makes: TWO PAIR');
  assert.equal(handHint(p, 'lvl_MINE_1').text, 'makes: THREE OF A KIND');
  hold(p, 'pierce', 'multi');                            // 2S 7S 8S QS: a spade flush
  assert.equal(p.hand.id, 'flush');
  assert.equal(handHint(p, 'lvl_MINE_1'), null, 'three of a kind is not better than the flush held');
  assert.equal(handHint(p, 'gold_pct'), null);
  const q = player();
  hold(q, 'speed', 'pickup', 'pierce');
  assert.equal(handHint(q, 'multi').text, 'makes: STRAIGHT');
  assert.equal(handHint(q, 'lvl_ZAP_1').text, 'makes: PAIR', 'with no hand held, a pair is a new hand');
});

// ---- the real game ------------------------------------------------------------
const h = await boot();
const T = h.T, st = h.state;
const cardsNow = () => [...h.elements['ov-cards'].children];
function freshRun() {
  T.banners.suppressAll();
  T.jokers.draftWeight = 0;
  T.startRun();
  h.pump(2);
  st.spawnTimer = 1e9; st.enemies.length = 0;
  st.weapons.length = 0;
  for (const t of ['VOLLEY', 'BOOMERANG']) { const w = makeWeapon(t); w.cd = 1e9; st.weapons.push(w); }
  return st.player;
}
function offer(id) {
  for (let i = 0; i < 300; i++) {
    st.mode = 'playing'; st.pendingDrafts = 1; st.draftKind = null; T.openDraft();
    const el = cardsNow().find(c => c._draftOffer && c._draftOffer.id === id);
    if (el) return el;
  }
  return null;
}

s.check('the real pick() builds the hand, pays it once, and the draft card says "makes:"', () => {
  const p = freshRun();
  assert.equal(p.hand || null, null);
  const base = runBase(p).damage;
  offer('hp').click();
  assert.equal(p.hand || null, null, 'one card');
  assert.equal(st.handFx || null, null);
  const volley = offer('lvl_VOLLEY_1');
  assert.equal(volley._draftOffer.handText, 'makes: PAIR');
  assert.ok(volley.innerHTML.includes('makes: PAIR'), 'the card shows the hint');
  for (const c of cardsNow()) if (c !== volley) assert.notEqual(c._draftOffer.handText, 'makes: PAIR');
  const d0 = p.stats.damage;
  volley.click();
  assert.equal(p.hand.id, 'pair');
  assert.ok(Math.abs(p.stats.damage - (d0 + 0.10 * base)) < 1e-9, 'the pair pays +10%');
  assert.ok(st.toasts.some(t => /^HAND: PAIR - \+10% damage$/.test(t.msg)), 'the feed names the hand and its bonus');
  // The count-up: from +0% to +10% over COUNT_S, then it clears.
  assert.deepEqual([st.handFx.from, st.handFx.to, st.handFx.t], [0, 0.10, 0]);
  T.hand.tick(T.hand.COUNT_S / 2);
  assert.ok(st.handFx && st.handFx.t > 0);
  T.hand.tick(T.hand.COUNT_S + 1);
  assert.equal(st.handFx, null, 'the count-up ends');
  // A copy of a held card: no new hand, no second payment, no hint.
  const again = offer('hp');
  assert.equal(again._draftOffer.handText, '');
  const d1 = p.stats.damage;
  again.click();
  assert.equal(p.hand.id, 'pair');
  assert.equal(p.stats.damage, d1, 'Iron Heart adds HP, and the pair is not paid twice');
  assert.equal(st.handFx, null);
});

s.check('the HUD shows the hand and its bonus; the pause screen lists the hand and its cards', () => {
  const p = freshRun();
  h.pump(2);
  assert.equal(T.renderer.hudChrome.hand, null, 'no cards: no plate');
  offer('hp').click();
  h.pump(2);
  assert.equal(T.renderer.hudChrome.hand.text, 'NO HAND YET');
  offer('lvl_VOLLEY_1').click();
  h.pump(1);
  assert.equal(T.renderer.hudChrome.hand.id, 'pair');
  assert.ok(T.renderer.hudChrome.hand.counting, 'the plate counts up right after the hand is made');
  T.hand.tick(T.hand.COUNT_S + 1);
  h.pump(1);
  assert.deepEqual(T.renderer.hudChrome.hand, { id: 'pair', text: 'PAIR  +10% damage', counting: false });
  T.openStats();
  const rep = cardsNow().find(c => c._handReport);
  assert.equal(rep._handReport.id, 'pair');
  assert.ok(rep.innerHTML.includes('Pair') && rep.innerHTML.includes('+10% damage') && rep.innerHTML.includes('Iron Heart'), rep.innerHTML);
  T.closeStats();
  assert.equal(p.hand.id, 'pair');
});

s.done();
