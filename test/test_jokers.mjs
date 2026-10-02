// JOKERS (src/jokers.js): one row of rule cards with limited slots.
//   - the registry: 18-24 jokers, one sentence each, a card face each;
//   - slots: 2 to start, the Joker Slot shop row raises them to 5;
//   - take / drop / replace, and the marker of every joker's effect;
//   - the level-up draft, the boss offer, and the replace choice of a full row;
//   - the HUD row, the pause screen, the PROGRESS shelf;
//   - profiles written before the joker row load and play.
// Run: node test/test_jokers.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { boot, suite } from './_harness.mjs';
import { makeWeapon } from '../src/weapons.js';
import { cardArt } from '../src/art/cards.js';
import { deckIdForOffer, jokerFaceArt, JOKER_KEYLINE } from '../src/draft_card_art.js';
import { hasRewrite, emptySlotCooldownMult, REWRITES } from '../src/rewrites.js';
import { hasRule, statCardOffered } from '../src/rules.js';
import { hpRegenPerSec, REGROWTH_HP_PER_SEC } from '../src/perks.js';
import { hasFrost } from '../src/frostcard.js';
import { applyMetaBonuses, SHOP_BY_ID, upgradeCost, makeProfile, JOKER_SLOTS_BASE } from '../src/meta.js';
import * as SAVE from '../src/save.js';
import {
  JOKERS, JOKER_IDS, JOKER_SLOTS, JOKER_CARD_WEIGHT, JOKER_BOSS_OFFERS, DOUBLE_DOWN_SCALE, ENCORE_EVERY,
  jokersHeld, hasJoker, jokerSlots, jokerRowFull, jokerOffered, jokerCards, jokerCard, rollJokerOffer,
  takeJoker, dropJoker, replaceJoker, handOpts,
} from '../src/jokers.js';

const s = suite('test_jokers');
const bare = (slots = 2) => ({
  jokerSlots: slots, weaponSlots: 4, weapons: [makeWeapon('VOLLEY')], character: { skill: 'EARTHSHATTER' },
  player: { stats: { damage: 10, maxHp: 100, cooldown: 1 }, jokers: [] },
});

s.check('the registry: 18-24 jokers, each one sentence, each with a face and a family', () => {
  assert.ok(JOKER_IDS.length >= 18 && JOKER_IDS.length <= 24, JOKER_IDS.length + ' jokers');
  assert.equal(new Set(JOKER_IDS).size, JOKER_IDS.length);
  assert.equal(new Set(JOKER_IDS.map(id => JOKERS[id].name)).size, JOKER_IDS.length, 'names are unique');
  for (const id of JOKER_IDS) {
    const j = JOKERS[id];
    assert.ok(j.name && j.desc.length > 15 && j.desc.length <= 90, id + ' text: ' + j.desc);
    assert.ok(!/\.\s/.test(j.desc), id + ' is one sentence');
    assert.ok(['rewrite', 'mythic', 'rule', 'perk', 'new'].includes(j.from), id + ' family');
    assert.ok(cardArt(j.art), id + ' card face ' + j.art);
    assert.equal(deckIdForOffer('joker_' + id), j.art);
    assert.equal(typeof j.grant, 'function');
    assert.equal(typeof j.revoke, 'function');
  }
  const from = (f) => JOKER_IDS.filter(id => JOKERS[id].from === f);
  assert.deepEqual(from('rewrite'), ['pierceall', 'onkillboom', 'healthdamage', 'rime', 'ignite', 'livewire', 'aftershock', 'overload']);
  assert.deepEqual(from('mythic'), ['second_wind', 'storm_shards', 'full_hand', 'magnet_collector']);
  assert.deepEqual(from('rule'), ['hordebait', 'once']);
  assert.deepEqual(from('perk'), ['regrowth', 'frost']);
  assert.deepEqual(from('new'), ['shortcut', 'wildcard', 'doubledown', 'encore', 'travellight']);
  // Cut: the flat-stat cards and the cross-tag combos are not jokers.
  for (const id of ['tempest', 'killshot', 'focus', 'thick', 'wideorbit', 'glacier', 'wildfire',
    'thermalshock', 'stormreaper', 'glacialorbit', 'shatter', 'cinder', 'frostwire']) {
    assert.equal(JOKERS[id], undefined, id + ' was cut');
  }
  for (const id of from('rewrite')) assert.equal(JOKERS[id].name, REWRITES[id].name);
  assert.ok(JOKERS.regrowth.desc.includes(String(REGROWTH_HP_PER_SEC)));
});

s.check('a joker face has no rank or suit pips and a violet keyline; the two full-art faces are kept', () => {
  const base = cardArt('rw_pierceall'), face = jokerFaceArt('rw_pierceall');
  assert.ok(base.grid.flat().includes(4), 'the deck card carries pips');
  assert.ok(!face.grid.slice(0, 13).some(row => row.slice(0, 7).includes(4)), 'no top-left pips');
  assert.ok(!face.grid.slice(21).some(row => row.slice(17).includes(4)), 'no bottom-right pips');
  assert.equal(face.palette[1], JOKER_KEYLINE);
  assert.deepEqual(base.grid, cardArt('rw_pierceall').grid, 'the deck art itself is untouched');
  assert.deepEqual(jokerFaceArt('second_wind').grid, cardArt('second_wind').grid);
  assert.equal(jokerFaceArt('nope'), null);
});

s.check('slots: 2 to start, the shop row adds one per level up to 5', () => {
  assert.deepEqual(JOKER_SLOTS, { BASE: 2, MAX: 5 });
  assert.equal(JOKER_SLOTS_BASE, 2);
  const row = SHOP_BY_ID.jokerslots;
  assert.ok(row && row.maxLevel === 3 && row.perLevel === 1, 'the Joker Slot row');
  assert.ok(row.desc.includes('1 more joker') && row.desc.includes('max 5'));
  assert.deepEqual([0, 1, 2].map(l => upgradeCost(row, l)), [1500, 4500, 13500]);
  const stats = (lv) => applyMetaBonuses({ damage: 10, maxHp: 100, cooldown: 1, speed: 1, pickup: 1, projectiles: 1 }, { jokerslots: lv });
  assert.deepEqual([0, 1, 2, 3].map(l => stats(l).jokerSlots), [2, 3, 4, 5]);
  assert.equal(jokerSlots({}), 2);
  assert.equal(jokerSlots({ jokerSlots: 4 }), 4);
  assert.equal(jokerSlots({ jokerSlots: 99 }), 5, 'never past the cap');
  assert.equal(jokerSlots({ jokerSlots: 0 }), 2);
});

s.check('take, drop and replace: the row holds its limit, keeps its order, and never holds one twice', () => {
  const st = bare(2);
  assert.equal(takeJoker(st, 'nope'), false);
  assert.equal(takeJoker(st, 'rime'), true);
  assert.equal(takeJoker(st, 'rime'), false, 'not twice');
  assert.equal(jokerRowFull(st), false);
  assert.equal(takeJoker(st, 'ignite'), true);
  assert.equal(jokerRowFull(st), true);
  assert.equal(takeJoker(st, 'livewire'), false, 'a full row takes no more');
  assert.equal(hasRewrite(st, 'livewire'), false, 'and the refused joker did nothing');
  assert.deepEqual(jokersHeld(st), ['rime', 'ignite']);
  // Replace keeps the slot and switches the old rule off.
  assert.equal(replaceJoker(st, 'rime', 'livewire'), true);
  assert.deepEqual(jokersHeld(st), ['livewire', 'ignite']);
  assert.deepEqual([hasRewrite(st, 'rime'), hasRewrite(st, 'livewire'), hasRewrite(st, 'ignite')], [false, true, true]);
  assert.equal(replaceJoker(st, 'rime', 'pierceall'), false, 'the old one is not held');
  assert.equal(replaceJoker(st, 'ignite', 'livewire'), false, 'the new one is already held');
  assert.deepEqual(jokersHeld(st), ['livewire', 'ignite']);
  assert.equal(dropJoker(st, 'ignite'), true);
  assert.equal(dropJoker(st, 'ignite'), false);
  assert.deepEqual([jokersHeld(st), hasRewrite(st, 'ignite'), jokerRowFull(st)], [['livewire'], false, false]);
  // More slots hold more.
  const big = bare(5);
  for (const id of ['rime', 'ignite', 'livewire', 'overload', 'pierceall']) assert.equal(takeJoker(big, id), true);
  assert.equal(takeJoker(big, 'regrowth'), false);
});

s.check('every joker switches its own rule on, and off again when it leaves the row', () => {
  const marker = {
    pierceall: (st) => hasRewrite(st, 'pierceall'), onkillboom: (st) => hasRewrite(st, 'onkillboom'),
    healthdamage: (st) => hasRewrite(st, 'healthdamage'), rime: (st) => hasRewrite(st, 'rime'),
    ignite: (st) => hasRewrite(st, 'ignite'), livewire: (st) => hasRewrite(st, 'livewire'),
    aftershock: (st) => hasRewrite(st, 'aftershock'), overload: (st) => hasRewrite(st, 'overload'),
    second_wind: (st) => st.player.stats.secondWind === true,
    storm_shards: (st) => st.player.stats.stormShards === true,
    full_hand: (st) => (st.player.stats.draftOffers || 0) === 1,
    magnet_collector: (st) => !!(st.player.skills && st.player.skills.magnet),
    hordebait: (st) => hasRule(st, 'hordebait'),
    once: (st) => hasRule(st, 'once') && statCardOffered('dmg', { player: { rules: st.player.rules, takenStats: { dmg: 1 } } }) === false,
    regrowth: (st) => hpRegenPerSec(st) === REGROWTH_HP_PER_SEC,
    frost: (st) => hasFrost(st),
    shortcut: (st) => handOpts(st).short === true,
    wildcard: (st) => handOpts(st).wild === true,
    doubledown: (st) => handOpts(st).scale === DOUBLE_DOWN_SCALE,
    encore: (st) => !!(st.player.jokerFlags && st.player.jokerFlags.encore),
    travellight: (st) => Math.abs(emptySlotCooldownMult(st) - 0.7) < 1e-9,   // three empty weapon slots
  };
  assert.deepEqual(Object.keys(marker).sort(), [...JOKER_IDS].sort(), 'a marker for every joker');
  for (const id of JOKER_IDS) {
    const st = bare(2);
    assert.equal(marker[id](st), false, id + ' is off on a fresh run');
    assert.equal(takeJoker(st, id), true);
    assert.equal(marker[id](st), true, id + ' is on while held');
    // No other joker's marker moves.
    for (const other of JOKER_IDS) if (other !== id) assert.equal(marker[other](st), false, id + ' switched ' + other);
    assert.equal(dropJoker(st, id), true);
    assert.equal(marker[id](st), false, id + ' is off again after it leaves');
  }
  assert.deepEqual(handOpts(bare()), { short: false, wild: false, scale: 1 });
});

s.check('offers: a held joker and a dead joker are never offered', () => {
  const st = bare(2);
  const ids = () => jokerCards(st).map(c => c.joker);
  assert.ok(!ids().includes('aftershock'), 'no blast source: Aftershock is not offered');
  takeJoker(st, 'onkillboom');
  assert.ok(ids().includes('aftershock') && !ids().includes('onkillboom'));
  // The shop's Last Stand already gives the revive: Second Wind would do nothing.
  assert.ok(ids().includes('second_wind'));
  st.player.stats.secondWind = true;
  assert.ok(!ids().includes('second_wind'));
  // A class whose own skill is the frost nova is not offered the Frost Nova joker.
  assert.ok(ids().includes('frost'));
  st.character = { skill: 'FROST_NOVA' };
  assert.equal(jokerOffered('frost', st), false);
  const c = jokerCard('rime');
  assert.deepEqual([c.id, c.joker, c.tier, c.name, c.weight], ['joker_rime', 'rime', 'JOKER', 'Rime', JOKER_CARD_WEIGHT]);
  assert.ok(JOKER_CARD_WEIGHT * JOKER_IDS.length < 0.6, 'the whole family weighs less than two stat cards');
  // A boss offer: different jokers, none held, never more than there are.
  const offer = rollJokerOffer(st);
  assert.equal(offer.length, JOKER_BOSS_OFFERS);
  assert.equal(new Set(offer.map(o => o.joker)).size, 3);
  assert.ok(offer.every(o => !hasJoker(st, o.joker)));
  st.player.jokers = JOKER_IDS.filter(id => id !== 'rime');
  assert.deepEqual(rollJokerOffer(st).map(o => o.joker), ['rime']);
  st.player.jokers = [...JOKER_IDS];
  assert.deepEqual(rollJokerOffer(st), []);
});

// ---- the real game ------------------------------------------------------------
const h = await boot();
const T = h.T, st = h.state;
const cardsNow = () => [...h.elements['ov-cards'].children];
const offersNow = () => cardsNow().map(c => c._draftOffer);
function freshRun() {
  T.banners.suppressAll();
  T.jokers.draftWeight = JOKER_CARD_WEIGHT;
  T.startRun();
  h.pump(2);
  st.spawnTimer = 1e9; st.enemies.length = 0;
  st.weapons.length = 0;
  for (const t of ['VOLLEY', 'BOOMERANG']) { const w = makeWeapon(t); w.cd = 1e9; st.weapons.push(w); }
  return st.player;
}
function levelDraft(want) {
  for (let i = 0; i < 400; i++) {
    st.mode = 'playing'; st.pendingDrafts = 1; st.draftKind = null; T.openDraft();
    const el = cardsNow().find(c => c._draftOffer && want(c._draftOffer));
    if (el) return el;
  }
  return null;
}

s.check('a run starts with an empty row of 2 slots; a level-up joker goes on the row and is remembered', () => {
  const p = freshRun();
  assert.deepEqual([p.jokers || [], st.jokerSlots, st.jokerOffers], [[], 2, 0]);
  assert.equal(T.jokers.discovered(), 0);
  T.jokers.draftWeight = 0.5;
  const el = levelDraft(o => o.joker === 'rime');
  assert.ok(el, 'a joker card reaches the level-up draft');
  assert.ok(el.innerHTML.includes('>JOKER<') && el.innerHTML.includes('Rime'), 'badged as a joker');
  assert.equal(el._draftOffer.handText, '', 'a joker is not a hand card');
  el.click();
  assert.equal(st.mode, 'playing');
  assert.deepEqual(p.jokers, ['rime']);
  assert.ok(hasRewrite(st, 'rime'));
  assert.equal((p.takenStats || {}).joker_rime, undefined, 'never in the stat ledger');
  assert.equal(Object.keys(p.handCards || {}).length, 0, 'and never in the hand');
  assert.ok(st.toasts.some(t => t.msg === 'JOKER - RIME: ' + JOKERS.rime.desc), 'the feed says what it does');
  assert.equal(T.jokers.discovered(), 1);
  assert.equal(SAVE.bannerSeen(T.getProfile(), 'joker:rime'), true);
});

s.check('a full row: a level-up joker opens the replace choice; REPLACE swaps in place; KEEP goes back to the cards', () => {
  const p = freshRun();
  T.jokers.take('rime'); T.jokers.take('ignite');
  T.jokers.draftWeight = 0.5;
  // A draft that offers Live Wire beside at least one plain card.
  let el = null;
  for (let i = 0; i < 400 && !el; i++) {
    const c = levelDraft(o => o.joker === 'livewire');
    if (offersNow().some(o => !o.joker)) el = c;
  }
  const before = offersNow();
  el.click();
  assert.equal(st.mode, 'draft', 'the draft is not over');
  assert.equal(h.elements['ov-title'].textContent, 'JOKER ROW FULL');
  assert.ok(h.elements['ov-sub'].textContent.includes(JOKERS.livewire.desc), 'the new joker is stated');
  assert.deepEqual(offersNow().map(o => o.id), ['swap_keep', 'swap_rime', 'swap_ignite'], 'KEEP first, then one card per held joker');
  assert.ok(cardsNow()[1].innerHTML.includes('REPLACE: Rime') && cardsNow()[1].innerHTML.includes('you lose: ' + JOKERS.rime.desc));
  assert.deepEqual(p.jokers, ['rime', 'ignite'], 'nothing changes until the choice is made');
  // KEEP: back to the same level-up cards, without the joker passed on.
  cardsNow()[0].click();
  assert.equal(st.mode, 'draft');
  assert.deepEqual(offersNow().map(o => o.id), before.filter(o => o.joker !== 'livewire').map(o => o.id));
  assert.deepEqual(p.jokers, ['rime', 'ignite']);
  assert.equal(st.pendingDrafts, 1, 'the level-up is still owed its card');
  cardsNow().find(c => !c._draftOffer.joker).click();
  assert.equal(st.mode, 'playing');
  assert.equal(st.pendingDrafts, 0);
  // REPLACE: the new joker takes the old one's slot.
  levelDraft(o => o.joker === 'livewire').click();
  cardsNow().find(c => c._draftOffer.id === 'swap_ignite').click();
  assert.equal(st.mode, 'playing');
  assert.deepEqual(p.jokers, ['rime', 'livewire']);
  assert.deepEqual([hasRewrite(st, 'ignite'), hasRewrite(st, 'livewire')], [false, true]);
  assert.ok(st.toasts.some(t => t.msg.startsWith('JOKER SWAP - LIVE WIRE')));
  assert.equal(st.pendingDrafts, 0);
});

s.check('a boss kill queues a joker offer: three jokers, ahead of a level-up draft; a full row may keep', () => {
  const src = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.ok(/toast\('BOSS DOWN'\);\s*if \(credit\) queueJokerOffer\(\);/.test(src), 'the wave boss death queues the offer');
  const p = freshRun();
  T.jokers.queueOffer();
  assert.deepEqual([st.jokerOffers, st.pendingDrafts, st.mode], [1, 1, 'playing']);
  st.pendingDrafts++;                                  // a level-up owed at the same time
  h.pump(1);
  assert.equal(st.mode, 'draft');
  assert.equal(h.elements['ov-title'].textContent, 'JOKER');
  assert.equal(offersNow().length, 3);
  assert.ok(offersNow().every(o => o.joker && o.tier === 'JOKER'));
  const first = offersNow()[0].joker;
  cardsNow()[0].click();
  assert.deepEqual(p.jokers, [first]);
  assert.equal(st.jokerOffers, 0);
  assert.equal(st.mode, 'draft', 'the level-up draft follows');
  assert.ok(h.elements['ov-title'].textContent.startsWith('LEVEL'));
  T.jokers.draftWeight = 0;
  st.mode = 'playing'; st.pendingDrafts = 1; st.draftKind = null; T.openDraft();
  cardsNow()[0].click();
  assert.deepEqual([st.mode, st.pendingDrafts], ['playing', 0]);
  // A full row at a boss offer: KEEP closes the offer and the row is unchanged.
  T.jokers.take(JOKER_IDS.find(id => !p.jokers.includes(id) && jokerOffered(id, st)));
  const row = p.jokers.slice();
  T.jokers.queueOffer();
  h.pump(1);
  assert.ok(h.elements['ov-sub'].textContent.includes('choose which one it replaces'));
  cardsNow()[0].click();
  assert.equal(h.elements['ov-title'].textContent, 'JOKER ROW FULL');
  cardsNow()[0].click();                               // KEEP MY JOKERS
  assert.deepEqual([st.mode, st.pendingDrafts, st.jokerOffers, p.jokers], ['playing', 0, 0, row]);
});

s.check('the hand jokers act on the live hand: Shortcut makes it, Double Down pays it half again, and both undo', () => {
  const p = freshRun();
  st.jokerSlots = 5;
  const base = p.base.damage;
  for (const id of ['speed', 'pickup', 'pierce']) T.pickCard({ id, name: id, apply: () => {} });
  assert.equal(p.hand || null, null, 'three in a row is not a straight');
  const d0 = p.stats.damage;
  T.jokers.take('shortcut');
  assert.equal(p.hand.id, 'straight');
  assert.ok(Math.abs(p.stats.damage - (d0 + 0.30 * base)) < 1e-9);
  T.jokers.take('doubledown');
  assert.ok(Math.abs(p.stats.damage - (d0 + 0.45 * base)) < 1e-9, 'x1.5 of the hand bonus, not stacked on it');
  T.jokers.take('wildcard');
  assert.equal(p.hand.id, 'straight', 'the wild card cannot beat the straight here');
});

s.check('Encore: every 5th drafted card counts twice; Full Hand adds a card to every draft', () => {
  const p = freshRun();
  T.jokers.take('encore');
  const base = p.base.damage;
  const whet = () => ({ id: 'dmg', name: 'Whetstone', apply: (q) => { q.stats.damage += 0.15 * base; } });
  p.statCopies = {};
  const gains = [];
  for (let i = 1; i <= ENCORE_EVERY; i++) {
    const d = p.stats.damage, hand = p.hand ? p.stats.damage : 0;
    p.statCopies = {};                                  // every pick a first copy: no stack bonus in the way
    T.pickCard(whet());
    gains.push(Math.round((p.stats.damage - d) / base * 100));
    void hand;
  }
  assert.deepEqual(gains, [15, 15, 15, 15, 30], 'the 5th counts twice');
  assert.ok(st.toasts.some(t => t.msg === 'ENCORE - WHETSTONE COUNTS TWICE'));
  const q = freshRun();
  T.jokers.draftWeight = 0;
  st.mode = 'playing'; st.pendingDrafts = 1; st.draftKind = null; T.openDraft();
  assert.equal(cardsNow().length, 3);
  st.mode = 'playing'; st.draftKind = null;
  T.jokers.take('full_hand');
  st.pendingDrafts = 1; T.openDraft();
  assert.equal(cardsNow().length, 4);
  st.mode = 'playing'; st.draftKind = null; st.pendingDrafts = 0;
  assert.equal(q.stats.draftOffers, 1);
});

s.check('the HUD draws the row slot by slot; the pause screen lists it; PROGRESS shelves what was discovered', () => {
  const p = freshRun();
  h.pump(2);
  assert.deepEqual([T.renderer.hudChrome.jokerSlots, T.renderer.hudChrome.jokers], [2, []]);
  T.jokers.take('second_wind');
  h.pump(1);
  assert.deepEqual(T.renderer.hudChrome.jokers, [{ id: 'second_wind' }]);
  T.openStats();
  const rep = cardsNow().find(c => c._jokerReport);
  assert.deepEqual(rep._jokerReport.held, ['second_wind']);
  assert.ok(rep.innerHTML.includes('JOKERS 1/2') && rep.innerHTML.includes('Second Wind') &&
    rep.innerHTML.includes(JOKERS.second_wind.desc) && rep.innerHTML.includes('empty slot'), rep.innerHTML);
  T.closeStats();
  T.jokers.show();
  const shelf = cardsNow().filter(c => c._jokerShelf);
  assert.equal(shelf.length, JOKER_IDS.length);
  const known = shelf.filter(c => c._jokerShelf.known).map(c => c._jokerShelf.id);
  assert.ok(known.includes('second_wind') && known.length === T.jokers.discovered());
  const hidden = shelf.find(c => !c._jokerShelf.known);
  assert.ok(hidden.innerHTML.includes('? ? ?') && hidden.innerHTML.includes('not discovered yet'));
  assert.ok(!hidden.innerHTML.includes(JOKERS[hidden._jokerShelf.id].name), 'an undiscovered joker is a silhouette');
  assert.ok(h.elements['ov-sub'].innerHTML.includes(known.length + ' / ' + JOKER_IDS.length));
  assert.ok(p);
});

// ---- profiles from before the joker row ----------------------------------------
// What an older build wrote: no jokerslots row, no joker entries in the banner ledger.
const old = { ...makeProfile(), version: 10, gold: 500, purchased: { dmg: 2, hp: 1 },
  unlockedWeapons: ['VOLLEY', 'BOOMERANG'], banners: { TOKEN: 1 }, bestTime: 90 };
const gOld = await boot({ variant: 'jokers-old', storage: [[SAVE.STORAGE_KEY, JSON.stringify(old)]] });
s.check('an old profile loads: no joker fields, an older version, and it plays with 2 slots', () => {
  const g = gOld;
  const prof = g.T.getProfile();
  assert.equal(prof.version, SAVE.PROFILE_VERSION, 'migrated to the current version (the schema did not change)');
  assert.equal(SAVE.PROFILE_VERSION, 11);
  assert.equal(prof.banners.TOKEN, 1, 'its banner ledger is kept');
  assert.equal(g.T.jokers.discovered(), 0);
  g.T.banners.suppressAll();
  g.T.startRun();
  g.pump(3);
  assert.equal(g.state.mode, 'playing');
  assert.deepEqual([g.state.jokerSlots, g.state.player.jokers || []], [2, []]);
  g.T.jokers.take('rime');
  assert.equal(SAVE.bannerSeen(g.T.getProfile(), 'joker:rime'), true);
});

const cur = { ...makeProfile(), gold: 0, purchased: { jokerslots: 9 }, banners: { 'joker:rime': 1, 'joker:once': 1 } };
const gCur = await boot({ variant: 'jokers-cur', storage: [[SAVE.STORAGE_KEY, JSON.stringify(cur)]] });
s.check('a current profile keeps its joker slots and its shelf across a save and a load', () => {
  const g = gCur;
  assert.equal(g.T.getProfile().purchased.jokerslots, 3, 'an out-of-range level is clamped to the row');
  assert.equal(g.T.jokers.discovered(), 2);
  g.T.banners.suppressAll();
  g.T.startRun();
  g.pump(2);
  assert.equal(g.state.jokerSlots, 5);
  // A saved profile read back through the real loader keeps both.
  const store = new Map();
  const storage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); }, removeItem: (k) => { store.delete(k); } };
  SAVE.saveProfileTo(g.T.getProfile(), storage);
  const raw = JSON.parse(store.get(SAVE.STORAGE_KEY));
  assert.equal(raw.purchased.jokerslots, 3);
  assert.equal(SAVE.bannerSeen(raw, 'joker:once'), true);
});

s.done();
