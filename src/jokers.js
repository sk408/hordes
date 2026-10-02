// HORDES — JOKERS. One row of rule-changing cards with limited slots. A run
// starts with JOKER_SLOTS.BASE slots; the shop row `jokerslots` raises that to
// JOKER_SLOTS.MAX. Jokers are offered in level-up drafts at a low rate and
// after every wave boss; with a full row the player chooses which to replace.
//
// This row replaces four card families that used to sit side by side: the
// rewrites (rewrites.js), the mythic chase cards, the run rules (rules.js) and
// the skill perks (perks.js, frostcard.js). Those modules still hold each
// effect's numbers and readers; a joker switches its effect on and off through
// the flag that module reads, so an effect has one implementation.
//
// The row lives on the run player (`p.jokers`, in the order taken), so a new
// run starts empty. The profile only remembers which jokers it has ever held
// (the banner ledger, key 'joker:<id>').
import { JOKER_SLOTS_BASE } from './meta.js';
import { REWRITES } from './rewrites.js';
import { RULES } from './rules.js';

export const JOKER_SLOTS = { BASE: JOKER_SLOTS_BASE, MAX: 5 };

// The weight ONE joker card carries in the level-up pool (a weapon card is 1,
// a common stat card 0.3), and how many jokers a boss offers.
export const JOKER_CARD_WEIGHT = 0.02;
export const JOKER_BOSS_OFFERS = 3;

// The hand jokers' numbers.
export const DOUBLE_DOWN_SCALE = 1.5;   // the hand's bonus is worth this much
export const ENCORE_EVERY = 5;          // every Nth drafted card counts twice
// A joker that switches a boolean the game already reads: p[bag][key].
const flag = (bag, key) => ({
  grant: (p) => { if (!p[bag]) p[bag] = {}; p[bag][key] = true; },
  revoke: (p) => { if (p[bag]) delete p[bag][key]; },
});
// A joker that switches a boolean stat the shop can also grant: it is not
// offered while the stat is already on, so taking it off again is safe.
const stat = (key) => ({
  offered: (state) => !(state && state.player && state.player.stats[key]),
  grant: (p) => { p.stats[key] = true; },
  revoke: (p) => { p.stats[key] = false; },
});
const rewrite = (id, desc) => ({ id, name: REWRITES[id].name, desc: desc || REWRITES[id].desc, from: 'rewrite', ...flag('rewrites', id) });

// `from` names the family the joker came out of ('new' = made for this row).
// `offered(state)` keeps a joker out of offers while it could do nothing.
// `art` is the deck id of its card face (art/cards.js).
const DEFS = [
  // ---- from the rewrites ----------------------------------------------------
  { ...rewrite('pierceall', 'every shot pierces: nothing stops at the first body'), art: 'rw_pierceall' },
  { ...rewrite('onkillboom', 'every kill blows up and hurts enemies nearby (costs mana)'), art: 'rw_onkillboom' },
  { ...rewrite('healthdamage', 'a health potion you pick up also blasts enemies nearby'), art: 'rw_healthdamage' },
  { ...rewrite('rime', 'your weapon hits chill: enemies crawl for a moment'), art: 'rw_rime' },
  { ...rewrite('ignite', 'your weapon hits set enemies burning for 3s'), art: 'rw_ignite' },
  { ...rewrite('livewire', 'every 5th weapon hit zaps a nearby enemy'), art: 'rw_livewire' },
  { ...rewrite('aftershock', 'every blast echoes once, half size and half damage'), art: 'rw_aftershock',
    offered: (state) => REWRITES.aftershock.offered(state) },
  { ...rewrite('overload', 'every 20th weapon hit bursts into three zaps'), art: 'rw_overload' },
  // ---- from the mythic chase cards -------------------------------------------
  { id: 'second_wind', name: 'Second Wind', desc: 'revive once at half health', from: 'mythic', art: 'second_wind',
    ...stat('secondWind') },
  { id: 'storm_shards', name: 'Storm Shards', desc: 'gems you pick up also chip nearby enemies', from: 'mythic', art: 'storm_shards',
    ...stat('stormShards') },
  { id: 'full_hand', name: 'Full Hand', desc: '+1 card in every draft', from: 'mythic', art: 'full_hand',
    grant: (p) => { p.stats.draftOffers = (p.stats.draftOffers || 0) + 1; },
    revoke: (p) => { p.stats.draftOffers = Math.max(0, (p.stats.draftOffers || 0) - 1); } },
  { id: 'magnet_collector', name: 'Magnet Collector', desc: 'skill [X]: every gem, potion and item flies to you, 30s cooldown',
    from: 'mythic', art: 'magnet_collector', ...flag('skills', 'magnet') },
  // ---- from the run rules ----------------------------------------------------
  { id: 'hordebait', name: RULES.hordebait.name, desc: 'every chest is a horde, and every chest rolls one rarity higher',
    from: 'rule', art: 'rule_hordebait', ...flag('rules', 'hordebait') },
  { id: 'once', name: RULES.once.name, desc: 'no stat card twice; weapon cards give +1 level; maxed weapon cards give +10% damage',
    from: 'rule', art: 'rule_once', ...flag('rules', 'once') },
  // ---- from the skill perks --------------------------------------------------
  { id: 'regrowth', name: 'Regrowth', desc: 'you heal 0.7 HP every second',
    from: 'perk', art: 'skill_regrowth', ...flag('skills', 'regrowth') },
  { id: 'frost', name: 'Frost Nova', desc: 'a frost nova bursts from you whenever it is ready', from: 'perk', art: 'skill_frost',
    offered: (state) => ((state && state.character && state.character.skill) || 'FROST_NOVA') !== 'FROST_NOVA',
    ...flag('skills', 'frost') },
  // ---- new: the hand jokers and two rules ------------------------------------
  { id: 'shortcut', name: 'Shortcut', desc: 'straights and flushes need one card fewer', from: 'new', art: 'rw_wideorbit',
    ...flag('jokerFlags', 'shortcut') },
  { id: 'wildcard', name: 'Wild Card', desc: 'your hand counts one extra card of any rank and suit', from: 'new', art: 'rw_glacier',
    ...flag('jokerFlags', 'wildcard') },
  { id: 'doubledown', name: 'Double Down', desc: 'your hand pays half again as much', from: 'new', art: 'killshot',
    ...flag('jokerFlags', 'doubledown') },
  { id: 'encore', name: 'Encore', get desc() { return 'every ' + ENCORE_EVERY + 'th card you draft counts twice'; }, from: 'new', art: 'tempest',
    ...flag('jokerFlags', 'encore') },
  { id: 'travellight', name: 'Travel Light', desc: 'each empty weapon slot cools your skills 10% faster', from: 'new', art: 'skill_focus',
    ...flag('jokerFlags', 'travellight') },
];
export const JOKERS = DEFS.reduce((m, d) => { m[d.id] = d; return m; }, {});
export const JOKER_IDS = DEFS.map(d => d.id);
export const JOKER_OFFER_PREFIX = 'joker_';

// ---------- readers ------------------------------------------------------------
/** The run's joker row, in the order taken. */
export function jokersHeld(state) {
  const p = state && state.player;
  return (p && p.jokers) || [];
}
export function hasJoker(state, id) {
  return jokersHeld(state).includes(id);
}
/** How many jokers this run may hold. */
export function jokerSlots(state) {
  const n = Number(state && state.jokerSlots) || JOKER_SLOTS.BASE;
  return Math.max(JOKER_SLOTS.BASE, Math.min(JOKER_SLOTS.MAX, n));
}
export function jokerRowFull(state) {
  return jokersHeld(state).length >= jokerSlots(state);
}
/** Could this joker be offered now? (not held, and not a dead card) */
export function jokerOffered(id, state) {
  const j = JOKERS[id];
  if (!j || hasJoker(state, id)) return false;
  return !j.offered || !!j.offered(state);
}
/** What the hand evaluation reads from the row (hands.js opts). */
export function handOpts(state) {
  return {
    short: hasJoker(state, 'shortcut'),
    wild: hasJoker(state, 'wildcard'),
    scale: hasJoker(state, 'doubledown') ? DOUBLE_DOWN_SCALE : 1,
  };
}
// ---------- offers -------------------------------------------------------------
/** One draft card per joker on offer. Each card's apply() is a no-op: taking a
 * joker goes through takeJoker / replaceJoker, which know about the slots. */
export function jokerCards(state, weight = JOKER_CARD_WEIGHT) {
  return JOKER_IDS.filter(id => jokerOffered(id, state)).map(id => jokerCard(id, weight));
}
export function jokerCard(id, weight = JOKER_CARD_WEIGHT) {
  const j = JOKERS[id];
  return { id: JOKER_OFFER_PREFIX + id, joker: id, tier: 'JOKER', name: j.name, desc: j.desc, weight, apply: () => {} };
}
/** `n` different jokers on offer, drawn with `rng`. */
export function rollJokerOffer(state, n = JOKER_BOSS_OFFERS, rng = Math.random) {
  const pool = jokerCards(state);
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return out;
}

// ---------- writers ------------------------------------------------------------
/** Put a joker in a free slot. False when the row is full or the id is unknown or held. */
export function takeJoker(state, id) {
  const j = JOKERS[id], p = state && state.player;
  if (!j || !p || hasJoker(state, id) || jokerRowFull(state)) return false;
  if (!p.jokers) p.jokers = [];
  p.jokers.push(id);
  j.grant(p);
  return true;
}
/** Take a joker off the row and switch its rule off. */
export function dropJoker(state, id) {
  const j = JOKERS[id], p = state && state.player;
  if (!j || !p || !hasJoker(state, id)) return false;
  p.jokers.splice(p.jokers.indexOf(id), 1);
  j.revoke(p);
  return true;
}
/** Swap `outId` for `inId` in the same slot. */
export function replaceJoker(state, outId, inId) {
  const p = state && state.player;
  if (!p || !JOKERS[inId] || hasJoker(state, inId) || !hasJoker(state, outId)) return false;
  const at = p.jokers.indexOf(outId);
  JOKERS[outId].revoke(p);
  p.jokers[at] = inId;
  JOKERS[inId].grant(p);
  return true;
}


