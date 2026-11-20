// HORDES - THE HAND FAN (R5). The cards that make the run's poker hand, shown
// in the HUD as a small fan of real card faces beside the hand's name.
//
// Which cards: the keys evaluateHand (hands.js) put in p.hand.cards, so the
// fan shows exactly the cards that make the hand. The Wild Card joker's extra
// card has no deck card (its key is WILD_KEY): it shows as the joker's own
// card, at the rank it stands for. A flush of more than five shows its
// highest five. With fewer than five cards held, every card held shows and
// the ones outside the hand are dimmed. With no hand yet, the fan shows the
// cards held (the last FAN_MAX drafted). Low ranks sit on the left, so a
// straight reads in order.
//
// The fan is pixel art: no rotation and whole-number block sizes only. Each
// card steps FAN_STEP card pixels right of the one before (enough to show its
// corner rank and suit) and the outer cards sit a little lower, like a hand
// of cards held up. Pure: no DOM, no rng.
import { cardArt, CARD_W, CARD_H } from './art/cards.js';
import { drawCardArt } from './render_cards.js';
import { handCards, WILD_KEY } from './hands.js';
import { JOKERS } from './jokers.js';
import { jokerFaceArt } from './draft_card_art.js';

export const FAN_MAX = 5;
export const FAN_STEP = 9;      // card pixels between two cards' left edges
export const FAN_DROP = 1;      // card pixels lower per step away from the middle
export const FAN_PULSE_S = 0.6; // the pulse when the hand improves, in seconds
export const FAN_LIFT = 3;      // card pixels the fan rises at the top of the pulse

const WILD_ART = JOKERS.wildcard ? JOKERS.wildcard.art : null;

/**
 * The cards the fan shows, as { key, value } in display order, and whether
 * they make a hand. p is the run's player.
 */
export function fanCards(p) {
  if (!p) return { made: false, cards: [] };
  const held = handCards(p);
  const byKey = new Map(held.map(c => [c.key, c]));
  const byValueDown = (a, b) => b.value - a.value || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  let cards;
  const made = !!(p.hand && p.hand.cards && p.hand.cards.length);
  if (made) {
    // The Wild Card stands for the rank evaluateHand gave it (hand.wild).
    const wildValue = p.hand.wild ? p.hand.wild.value : 99;
    cards = p.hand.cards.map(k => k === WILD_KEY ? { key: WILD_KEY, value: wildValue } : byKey.get(k)).filter(Boolean);
    // A flush can hold more than five cards: show its highest five.
    cards = cards.slice().sort(byValueDown).slice(0, FAN_MAX).map(c => ({ key: c.key, value: c.value }));
    // Fewer than five cards held: every card held shows, and the ones that
    // are not in the hand are dimmed (the bright cards are the hand).
    if (held.length < FAN_MAX) {
      const inHand = new Set(cards.map(c => c.key));
      for (const c of held) if (!inHand.has(c.key)) cards.push({ key: c.key, value: c.value, dim: true });
      cards = cards.slice(0, FAN_MAX);
    }
  } else {
    cards = held.slice(-FAN_MAX).map(c => ({ key: c.key, value: c.value }));
  }
  cards.sort((a, b) => a.value - b.value || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return { made, cards };
}

/** The art a fan card is painted with. The Wild Card shows its joker face
 * (no rank or suit in its corners, as the joker is drawn everywhere else):
 * it stands for whatever rank the hand gave it, not its art card's 7. */
export function fanArt(key) {
  return key === WILD_KEY ? jokerFaceArt(WILD_ART) : cardArt(key);
}

/** Card offsets in card pixels for n cards, and the fan's size. */
export function fanLayout(n) {
  const mid = (n - 1) / 2;
  const at = [];
  let h = 0;
  for (let i = 0; i < n; i++) {
    const dy = Math.round(Math.abs(i - mid)) * FAN_DROP;
    at.push({ x: i * FAN_STEP, y: dy });
    h = Math.max(h, dy + CARD_H);
  }
  return { at, w: n ? CARD_W + (n - 1) * FAN_STEP : 0, h: n ? h : 0 };
}

/**
 * Device pixels per card pixel. `vsx` is device pixels per view pixel, `cssW`
 * the canvas's CSS width. Normally the whole number nearest one view pixel.
 * When the view shows below 1:1 (a phone held upright, CSS width under the
 * view's 480) that left the ranks about 4 CSS px tall, so there a card pixel
 * is 1.5 CSS px: 3 device px at dpr 2, a card about 36x51 CSS px.
 */
export const FAN_UPRIGHT_CSS = 1.5;
export function fanBlock(vsx, cssW, viewW = 480) {
  const k = Math.max(1, Math.round(vsx || 1));
  if (!(cssW > 0) || cssW >= viewW) return k;
  const dpr = (vsx || 1) * viewW / cssW;
  return Math.max(k, Math.round(FAN_UPRIGHT_CSS * dpr));
}

/** The key the cached raster is kept under: the cards and the block size. */
export function fanKey(cards, k) {
  return cards.map(c => c.key + (c.dim ? '~' : '')).join(',') + '@' + k;
}

// A card held but not in the hand is painted in its own colours mixed toward
// the HUD's dark plate, so the hand's cards stand out.
const DIM_TO = [20, 20, 28];
const DIM_MIX = 0.55;
const dimCache = new WeakMap();
function dimColour(c) {
  if (typeof c !== 'string' || c[0] !== '#') return c;
  let h = c.slice(1);
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (h.length !== 6) return c;
  const out = [0, 1, 2].map(i => {
    const v = parseInt(h.slice(i * 2, i * 2 + 2), 16);
    return Math.round(v + (DIM_TO[i] - v) * DIM_MIX).toString(16).padStart(2, '0');
  });
  return '#' + out.join('');
}
function dimArt(art) {
  if (!art) return art;
  let d = dimCache.get(art);
  if (!d) {
    const pal = Array.isArray(art.palette) ? art.palette.map(dimColour)
      : Object.fromEntries(Object.entries(art.palette || {}).map(([k, v]) => [k, dimColour(v)]));
    d = { grid: art.grid, palette: pal };
    dimCache.set(art, d);
  }
  return d;
}

/**
 * Paint the fan at block size k (whole device pixels per card pixel) with its
 * top-left at (0, 0). Left to right, so each card covers the one before
 * except its corner rank and suit.
 */
export function paintFan(g, cards, k) {
  const L = fanLayout(cards.length);
  for (let i = 0; i < cards.length; i++) {
    const art = fanArt(cards[i].key);
    drawCardArt(g, cards[i].dim ? dimArt(art) : art, L.at[i].x * k, L.at[i].y * k, k);
  }
  return L;
}

/** How far into the pulse (0..1), or null when none is running. */
export function pulsePhase(pulse) {
  if (!pulse || !(pulse.t >= 0) || pulse.t >= FAN_PULSE_S) return null;
  return pulse.t / FAN_PULSE_S;
}

/**
 * How the pulse looks at phase ph (0..1, or null for none): the rim's alpha,
 * strong at the start and fading to nothing, and the lift in card pixels,
 * rising to FAN_LIFT halfway and back down.
 */
export function pulseLook(ph) {
  if (ph === null || ph === undefined) return { alpha: 0, lift: 0 };
  return { alpha: 0.85 * (1 - ph), lift: Math.round(Math.sin(Math.PI * ph) * FAN_LIFT) };
}
