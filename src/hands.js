// HORDES — HANDS. The different cards a run has drafted form a hand. The best
// poker combination among them pays a run-long bonus, and only the best one
// pays: a better hand replaces the bonus of the one before it.
//
// Rank and suit come from the card art (art/cards.js: rank = rarity, suit =
// family), so the card on screen is the card in the hand. A second copy of a
// card adds nothing to the hand; jokers (jokers.js) are not hand cards.
//
// Pure: no rng, no DOM. The two writers are addHandCard and refreshHand.
import { cardArt, SUITS } from './art/cards.js';
import { deckIdForOffer } from './draft_card_art.js';
import { runBase } from './config.js';

// Rank order for straights. Aces and the two joker faces are joker art only.
const RANK_VALUE = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, J: 10, Q: 11, K: 12 };
export const SUIT_ORDER = ['spades', 'hearts', 'diamonds', 'clubs'];
export const SUIT_NAMES = { spades: 'Spade', hearts: 'Heart', diamonds: 'Diamond', clubs: 'Club' };
export const SUIT_GLYPHS = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' };

export const WILD_KEY = '*wild';

// How many cards a straight and a flush need.
export const STRAIGHT_SIZE = 4;
export const FLUSH_SIZE = 4;

// Every hand, weakest first. `dmg` and `hp` are shares of the run's starting
// damage and max HP; `cooldown` multiplies the attack cooldown.
export const HANDS = [
  { id: 'pair',      name: 'Pair',            need: 'two cards of one rank',            dmg: 0.10 },
  { id: 'twopair',   name: 'Two Pair',        need: 'two pairs',                        dmg: 0.20 },
  { id: 'three',     name: 'Three of a Kind', need: 'three cards of one rank',          dmg: 0.30 },
  { id: 'straight',  name: 'Straight',        need: STRAIGHT_SIZE + ' ranks in a row',  dmg: 0.30, cooldown: 0.90 },
  { id: 'flush',     name: 'Flush',           need: FLUSH_SIZE + ' cards of one suit',  dmg: 0.25 },
  { id: 'fullhouse', name: 'Full House',      need: 'three of a kind and a pair',       dmg: 0.50, hp: 0.25 },
  { id: 'four',      name: 'Four of a Kind',  need: 'four cards of one rank',           dmg: 0.60, hp: 0.30 },
];
export const HAND_BY_ID = HANDS.reduce((m, h, i) => { m[h.id] = { ...h, order: i + 1 }; return m; }, {});

// A flush also boosts its suit's family, on top of the flush's own damage.
export const FLUSH_BOONS = {
  spades:   { dmg: 0.25,               text: '+25% more weapon damage' },
  hearts:   { hp: 0.40,                text: '+40% max HP' },
  diamonds: { gold: 0.50, xp: 0.25,    text: '+50% gold from kills, +25% XP' },
  clubs:    { cooldown: 0.80,          text: 'weapons fire 20% faster' },
};

/** The hand card behind a draft offer id, or null (jokers, unknown ids). */
export function handCardOf(offerId) {
  if (typeof offerId !== 'string' || offerId.startsWith('joker_')) return null;
  const deckId = deckIdForOffer(offerId);
  const art = deckId && cardArt(deckId);
  if (!art || !art.suit || !RANK_VALUE[art.rank]) return null;
  return { key: deckId, rank: art.rank, value: RANK_VALUE[art.rank], suit: art.suit, name: art.name };
}

/** The run's hand cards (one per different card drafted), in draft order. */
export function handCards(p) {
  return Object.values((p && p.handCards) || {});
}

/** Add a drafted card to the hand. Returns the card when it is new, else null. */
export function addHandCard(p, offerId) {
  const c = handCardOf(offerId);
  if (!c || !p) return null;
  if (!p.handCards) p.handCards = {};
  if (p.handCards[c.key]) return null;
  p.handCards[c.key] = c;
  return c;
}

/**
 * The best hand among `cards`, or null. opts.short lowers the straight and
 * flush sizes by one (the Shortcut joker).
 * Returns { id, name, order, suit, cards } — `suit` on a flush only, `cards`
 * the keys of the cards that make the hand.
 */
export function evaluateHand(cards, opts = {}) {
  if (opts.wild) {
    // The Wild Card joker: one extra card of whatever rank and suit helps most.
    const rest = { ...opts, wild: false };
    let best = evaluateHand(cards, rest);
    for (const [rank, value] of Object.entries(RANK_VALUE)) {
      for (const suit of SUIT_ORDER) {
        const h = evaluateHand([...(cards || []), { key: WILD_KEY, rank, value, suit, name: 'Wild Card' }], rest);
        if (h && (!best || h.order > best.order)) best = h;
      }
    }
    return best;
  }
  const list = [];
  const seen = new Set();
  for (const c of cards || []) {
    if (!c || seen.has(c.key)) continue;   // a second copy never counts
    seen.add(c.key);
    list.push(c);
  }
  const less = opts.short ? 1 : 0;
  const byValue = new Map();
  for (const c of list) {
    if (!byValue.has(c.value)) byValue.set(c.value, []);
    byValue.get(c.value).push(c);
  }
  // Rank groups, biggest first; ties go to the higher rank.
  const groups = [...byValue.entries()].sort((a, b) => b[1].length - a[1].length || b[0] - a[0]);
  const keys = (cs) => cs.map(c => c.key);
  const made = (id, cs, suit = null) => ({ id, name: handName(id, suit), order: HAND_BY_ID[id].order, suit, cards: keys(cs) });

  if (groups.length && groups[0][1].length >= 4) return made('four', groups[0][1].slice(0, 4));
  if (groups.length > 1 && groups[0][1].length >= 3 && groups[1][1].length >= 2) {
    return made('fullhouse', [...groups[0][1].slice(0, 3), ...groups[1][1].slice(0, 2)]);
  }
  // Flush: the suit with the most cards; ties go to SUIT_ORDER.
  let flush = null;
  for (const s of SUIT_ORDER) {
    const cs = list.filter(c => c.suit === s);
    if (cs.length >= FLUSH_SIZE - less && (!flush || cs.length > flush.length)) flush = cs;
  }
  if (flush) return made('flush', flush, flush[0].suit);
  // Straight: the highest run of consecutive ranks.
  const values = [...byValue.keys()].sort((a, b) => b - a);
  const size = STRAIGHT_SIZE - less;
  for (let i = 0; i + size <= values.length; i++) {
    if (values[i] - values[i + size - 1] === size - 1) {
      return made('straight', values.slice(i, i + size).map(v => byValue.get(v)[0]));
    }
  }
  if (groups.length && groups[0][1].length >= 3) return made('three', groups[0][1].slice(0, 3));
  if (groups.length > 1 && groups[1][1].length >= 2) {
    return made('twopair', [...groups[0][1].slice(0, 2), ...groups[1][1].slice(0, 2)]);
  }
  if (groups.length && groups[0][1].length >= 2) return made('pair', groups[0][1].slice(0, 2));
  return null;
}

/** 'Flush' reads with its suit: 'Spade Flush'. */
export function handName(id, suit = null) {
  const h = HAND_BY_ID[id];
  if (!h) return '';
  return id === 'flush' && suit ? SUIT_NAMES[suit] + ' Flush' : h.name;
}

/** The bonus a hand pays: { dmg, hp, cooldown, gold, xp } (shares / multipliers). */
export function handBonus(hand, scale = 1) {
  const out = { dmg: 0, hp: 0, cooldown: 1, gold: 0, xp: 0 };
  if (!hand || !HAND_BY_ID[hand.id]) return out;
  const parts = [HAND_BY_ID[hand.id]];
  if (hand.id === 'flush' && FLUSH_BOONS[hand.suit]) parts.push(FLUSH_BOONS[hand.suit]);
  for (const b of parts) {
    out.dmg += (b.dmg || 0) * scale;
    out.hp += (b.hp || 0) * scale;
    out.gold += (b.gold || 0) * scale;
    out.xp += (b.xp || 0) * scale;
    if (b.cooldown) out.cooldown *= 1 - (1 - b.cooldown) * scale;
  }
  return out;
}

const pct = (v) => Math.round(v * 100);
/** The bonus as one short line: '+50% damage, +25% max HP'. `dmgShown`
 * overrides the damage share (the HUD's count-up). */
export function describeHandBonus(hand, scale = 1, dmgShown = null) {
  const b = handBonus(hand, scale);
  const parts = [];
  if (b.dmg) parts.push('+' + pct(dmgShown === null ? b.dmg : dmgShown) + '% damage');
  if (b.hp) parts.push('+' + pct(b.hp) + '% max HP');
  if (b.cooldown !== 1) parts.push('fire ' + pct(1 - b.cooldown) + '% faster');
  if (b.gold) parts.push('+' + pct(b.gold) + '% gold');
  if (b.xp) parts.push('+' + pct(b.xp) + '% XP');
  return parts.join(', ');
}

// Take the applied bonus back off the player's stats.
function removeHandBonus(p) {
  const a = p.hand && p.hand.applied;
  if (!a) return;
  p.stats.damage -= a.damage;
  p.stats.maxHp -= a.maxHp;
  if (p.hp > p.stats.maxHp) p.hp = p.stats.maxHp;
  p.stats.cooldown /= a.cooldown;
  p.stats.purseKillMult = (p.stats.purseKillMult || 1) - a.gold;
  p.stats.xpMult = (p.stats.xpMult || 1) - a.xp;
}

// Put a hand's bonus on the player's stats and remember exactly what was added.
function applyHandBonus(p, hand, scale) {
  const b = handBonus(hand, scale);
  const base = runBase(p);
  const a = { damage: b.dmg * base.damage, maxHp: b.hp * base.maxHp, cooldown: b.cooldown, gold: b.gold, xp: b.xp };
  p.stats.damage += a.damage;
  p.stats.maxHp += a.maxHp;
  p.stats.cooldown *= a.cooldown;
  if (a.gold) p.stats.purseKillMult = (p.stats.purseKillMult || 1) + a.gold;
  if (a.xp) p.stats.xpMult = (p.stats.xpMult || 1) + a.xp;
  p.hand = { id: hand.id, suit: hand.suit, name: hand.name, order: hand.order, cards: hand.cards, scale, applied: a };
}

/**
 * Re-evaluate the run's hand and make its bonus match: the old bonus comes
 * off, the new one goes on, and nothing moves when the hand is the same.
 * opts: { short, scale } (the Shortcut and Double Down jokers).
 * Returns { changed, upgraded, hand, prev }.
 */
export function refreshHand(p, opts = {}) {
  const scale = opts.scale || 1;
  const prev = p.hand || null;
  const hand = evaluateHand(handCards(p), opts);
  const same = (!hand && !prev) ||
    (hand && prev && hand.id === prev.id && hand.suit === prev.suit && prev.scale === scale);
  if (same) {
    if (hand && prev) prev.cards = hand.cards;
    return { changed: false, upgraded: false, hand: prev, prev };
  }
  removeHandBonus(p);
  p.hand = null;
  if (hand) applyHandBonus(p, hand, scale);
  return {
    changed: true,
    upgraded: !!hand && (!prev || hand.order > prev.order),
    hand: p.hand,
    prev,
  };
}

/**
 * What picking `offerId` would do to the hand: the hand it makes when that is
 * a new or better hand than the current one, else null.
 */
export function handHint(p, offerId, opts = {}) {
  const c = handCardOf(offerId);
  if (!c || (p.handCards && p.handCards[c.key])) return null;
  const now = evaluateHand(handCards(p), opts);
  const then = evaluateHand([...handCards(p), c], opts);
  if (!then || (now && then.order <= now.order)) return null;
  return { hand: then, text: 'makes: ' + then.name.toUpperCase() };
}

/** Every suit's family word, for the cards screen. */
export function suitFamily(suit) {
  return SUITS[suit] ? SUITS[suit].family : '';
}
