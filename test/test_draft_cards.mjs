// R5 DRAFT CARDS (src/draft_card_face.js, main.js presentDraft): each draft
// offer is drawn as a playing card.
//   - the face holds at most two effect lines; the rest is in the detail;
//   - the ribbon says NEW (and FREE PICK), EVOLUTION READY, RARE, MYTHIC, JOKER;
//   - the rarity comes from the card art (rank = rarity), jokers their own;
//   - the "makes FLUSH" tag tells the truth: every tag is compared with the
//     hand the REAL pick leaves, over many seeded drafts and every offer kind
//     (hand cards, jokers with room and with a full row, joker swaps);
//   - the deal-in is presentation only: all cards face up within 0.4 s, a
//     press during it picks, the auto-pick wait is the same, reduced motion
//     gets no flip and no card back;
//   - press-and-hold on touch opens the detail and picks nothing; a tap picks.
// Run: node test/test_draft_cards.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { boot, suite } from './_harness.mjs';
import { makeWeapon } from '../src/weapons.js';
import { CARD_DECK, CARD_EXPANSION, cardArt } from '../src/art/cards.js';
import { evaluateHand, handCardOf, handCards } from '../src/hands.js';
import { handOpts, JOKER_IDS } from '../src/jokers.js';
import { deckIdForOffer } from '../src/draft_card_art.js';
import {
  faceLines, offerRibbon, offerRarity, offerHandTag, handAfterPick, dealDelays, DEAL, FACE_LINES,
  cardBackArt, RARITY_BORDER,
} from '../src/draft_card_face.js';

const s = suite('test_draft_cards');

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ---- 1. the pure face -----------------------------------------------------------
s.check('the face carries at most two effect lines, short, without the weapon-level lead', () => {
  const lvl = { id: 'lvl_VOLLEY_2', desc: 'Volley Lv3 — +60% damage · Lv 2/8', leadText: 'LEAD WEAPON: +2 levels',
    evoText: 'evolves with Whetstone at Lv 8', fuseText: 'fuses with Orbit Blade' };
  // A weapon card names its evolution partner on the face (the guided first
  // draft says so); the LEAD bonus moves to the ribbon.
  assert.deepEqual(faceLines(lvl).map(l => l.text), ['+60% damage', 'evolves with Whetstone at Lv 8']);
  assert.equal(offerRibbon(lvl).text, 'LEAD: +2 LEVELS');
  const leadOnly = { id: 'lvl_VOLLEY_2', desc: 'Volley Lv3 — +60% damage · Lv 2/8', leadText: 'LEAD WEAPON: +2 levels' };
  assert.deepEqual(faceLines(leadOnly).map(l => l.text), ['+60% damage', 'LEAD WEAPON: +2 levels']);
  const plainLvl = { id: 'lvl_VOLLEY_2', desc: 'Volley Lv3 — +60% damage · Lv 2/8', evoText: 'evolves with X', fuseText: 'f' };
  assert.deepEqual(faceLines(plainLvl).map(l => l.text), ['+60% damage', 'evolves with X']);
  const maxedRoad = { id: 'lvl_VOLLEY_8', desc: '+10% weapon damage · MAXED', fuseText: 'f' };
  assert.deepEqual(faceLines(maxedRoad).map(l => l.text), ['+10% weapon damage', 'MAXED']);
  const partner = { id: 'dmg', desc: '+15% weapon damage', evoText: 'evolves Volley · +1 level: Volley' };
  assert.deepEqual(faceLines(partner).map(l => l.text), ['+15% weapon damage', 'evolves Volley']);
  const ready = { id: 'dmg', desc: '+15% weapon damage', evoReady: true, evoText: 'EVOLVES NOW: Storm · +1 level: Volley', stackText: 'STACKED' };
  assert.deepEqual(faceLines(ready).map(l => l.text), ['+15% weapon damage', 'EVOLVES NOW: Storm']);
  const kit = { id: 'wpn_BEAM', kitNew: true, desc: 'a long beam · from your loadout, joins at Lv 2 · FREE: then pick again' };
  assert.deepEqual(faceLines(kit).map(l => l.text), ['a long beam', 'joins at Lv 2']);
  const refill = { id: 'wpn_BEAM', refill: true, desc: 'a long beam · takes the free slot at Lv 4' };
  assert.deepEqual(faceLines(refill).map(l => l.text), ['a long beam', 'takes the free slot at Lv 4']);
  for (const u of [lvl, plainLvl, ready, kit, refill, { id: 'x', desc: 'a · b · c · d', leadText: 'l', stackText: 's', evoText: 'e' }]) {
    assert.ok(faceLines(u).length <= FACE_LINES, JSON.stringify(u));
  }
  assert.equal(FACE_LINES, 2);
});

s.check('the ribbon: NEW (FREE PICK on the free one), EVOLUTION READY, the tier, the art rarity', () => {
  assert.equal(offerRibbon({ id: 'wpn_BEAM', kitNew: true }, { kitFree: true }).text, 'NEW: FREE PICK');
  assert.equal(offerRibbon({ id: 'wpn_BEAM', kitNew: true }, { kitFree: false }).text, 'NEW WEAPON');
  assert.equal(offerRibbon({ id: 'wpn_BEAM', refill: true }).text, 'NEW WEAPON');
  assert.equal(offerRibbon({ id: 'dmg', evoReady: true }).text, 'EVOLUTION READY');
  assert.equal(offerRibbon({ id: 'joker_rime', joker: 'rime', tier: 'JOKER' }).text, 'JOKER');
  assert.equal(offerRibbon({ id: 'hp_pct', tier: 'RARE' }).text, 'RARE');
  assert.equal(offerRibbon({ id: 'hp' }), null, 'a common card has no ribbon');
});

s.check('the rarity comes from the card art; jokers keep their own look', () => {
  for (const def of [...CARD_DECK, ...CARD_EXPANSION]) {
    const art = cardArt(def.id);
    if (!art || art.tier === 'CHASE') continue;
    // find an offer id that maps to this deck card
    const u = { id: def.id };
    if (deckIdForOffer(u.id) !== def.id) continue;
    const want = art.tier === 'MYTHIC' ? 'mythic' : art.tier === 'RARE' ? 'rare' : 'common';
    assert.equal(offerRarity(u), want, def.id);
  }
  assert.equal(offerRarity({ id: 'joker_rime', joker: 'rime' }), 'joker');
  assert.equal(offerRarity({ id: 'swap_rime', artId: 'joker_rime', jokerSwap: true }), 'joker');
  for (const k of ['common', 'rare', 'mythic', 'joker']) assert.match(RARITY_BORDER[k], /^#[0-9a-f]{6}$/i);
});

s.check('the deal-in: every card face up well under half a second, one after the other', () => {
  for (let n = 1; n <= 6; n++) {
    const d = dealDelays(n);
    assert.equal(d.length, n);
    assert.equal(d[0], 0);
    for (let i = 1; i < n; i++) assert.ok(d[i] > d[i - 1], 'one after the other');
    assert.ok(d[n - 1] + DEAL.FLIP_MS <= 400, n + ' cards: done by ' + (d[n - 1] + DEAL.FLIP_MS) + ' ms');
  }
  const back = cardBackArt();
  assert.equal(back.grid.length, 34);
  assert.ok(back.grid.every(r => r.length === 24 && r.every(v => Number.isInteger(v))), 'a whole-pixel grid');
});

s.check('the stylesheet: no flip and no shimmer under reduced motion; the detail opens on hover, cursor and hold', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const rm = html.slice(html.indexOf('.card.dcard.deal, .dcard.deal *'));
  assert.ok(/^\.card\.dcard\.deal, \.dcard\.deal \*, \.dcard \.face::after \{ animation: none !important; \}/.test(rm));
  assert.ok(html.lastIndexOf('@media (prefers-reduced-motion: reduce)', html.indexOf('.card.dcard.deal, .dcard.deal *')) >
    html.indexOf('@keyframes cardDealBack'), 'the reduced-motion rule comes after the deal rules');
  assert.ok(html.includes('@media (hover: hover) { .dcard:hover .detail { display: block; } }'));
  assert.ok(html.includes('.dcard.sel .detail, .dcard.peek .detail { display: block; }'));
  // the pick ceremony's animations are never overridden by the deal
  assert.ok(html.includes('.card.dcard.deal:not(.card-picked):not(.card-burn)'));
});

// The rules of the .dcard block, as [selector, body] pairs.
function dcardRules() {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const css = html.slice(html.indexOf('/* ---- R5 DRAFT CARDS'), html.indexOf('/* ---- G13 CHARACTER SELECTOR'));
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css))) out.push([m[1].replace(/\/\*[\s\S]*?\*\//g, '').trim(), m[2]]);
  return out;
}
s.check('the stylesheet: the face lines are never cut (no clamp, no ellipsis)', () => {
  for (const [sel, body] of dcardRules()) {
    if (!/\.fx\b/.test(sel)) continue;
    assert.ok(!/line-clamp|text-overflow|white-space:\s*nowrap|max-height/.test(body), sel + ' cuts its text: ' + body);
  }
});
s.check('the stylesheet: the flip turns the card contents, never the card box (its hit area keeps its size)', () => {
  const flips = dcardRules().filter(([, body]) => /cardDealFlip\s+\d/.test(body));
  assert.ok(flips.length >= 1, 'there is a flip');
  for (const [sel] of flips) {
    for (const one of sel.split(',')) {
      assert.ok(/>\s*(\.|:)/.test(one.trim()), 'the flip is on a child of the card, not the card: ' + one.trim());
    }
  }
});
s.check('the stylesheet: the compact card text is 10 px or more', () => {
  for (const [sel, body] of dcardRules()) {
    const fs = /font-size:\s*(\d+(?:\.\d+)?)px/.exec(body);
    if (fs && /\.dcard/.test(sel)) assert.ok(+fs[1] >= 10, sel + ' is ' + fs[1] + ' px');
  }
});
// cards2: the hand tag stays inside its card: it wraps between words, never
// past the card's edge, in every layout.
s.check('the stylesheet (cards2): the hand tag wraps inside its card, never runs past it', () => {
  const tags = dcardRules().filter(([sel]) => /\.tag\b/.test(sel));
  assert.ok(tags.length >= 1, 'there is a tag rule');
  for (const [sel, body] of tags) assert.ok(!/white-space:\s*nowrap/.test(body), sel + ' keeps the tag on one line: ' + body);
  const base = tags.find(([sel]) => /^\s*\.dcard \.tag\s*$/.test(sel));
  assert.ok(base && /max-width:\s*100%/.test(base[1]) && /white-space:\s*normal/.test(base[1]) && /box-sizing:\s*border-box/.test(base[1]),
    'the tag is no wider than its card');
  // beside a floated face (compact and rows) the tag is a table, so it sits
  // beside the face instead of under it
  for (const lay of ['compact', 'rows']) {
    const r = tags.find(([sel]) => sel.includes('#overlay.draft.' + lay + ' .dcard .tag'));
    assert.ok(r && /display:\s*table/.test(r[1]), lay + ': the tag sits beside the face');
  }
});
s.check('the stylesheet (cards2): the rows layout stacks the cards in a column with the face on the left', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(/#overlay\.draft\.rows \.cards \{[^}]*flex-direction: column/.test(html), 'one row per offer');
  assert.ok(/#overlay\.draft\.rows \.dcard \.face \{[^}]*float: left/.test(html), 'the face on the left');
});

// ---- 2. the live draft ------------------------------------------------------------
const h = await boot({ variant: 'cards' });
const T = h.T, st = h.state;
const cardsNow = () => [...h.elements['ov-cards'].children];
const cls = (el) => String(el.className || '');
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
function draft() {
  st.mode = 'playing'; st.pendingDrafts = 1; st.draftKind = null; T.openDraft();
  return cardsNow();
}

s.check('each offer is a playing card: ribbon, face with the art, name, at most two lines, the detail', () => {
  freshRun();
  const kids = draft();
  assert.ok(kids.length >= 3);
  for (const el of kids) {
    const u = el._draftOffer;
    assert.ok(/\bdcard\b/.test(cls(el)) && /\br-(common|rare|mythic|joker)\b/.test(cls(el)), cls(el));
    const face = el.children.find(c => c.className === 'face');
    assert.ok(face && face.children.some(c => c.className === 'card-art'), u.id + ': the art sits in the face');
    const html = el.innerHTML;
    assert.equal((html.match(/class="fx/g) || []).length, faceLines(u).length);
    assert.ok(faceLines(u).length <= 2);
    assert.ok(html.includes('<div class="detail">') && html.includes(u.desc), 'the full text is in the detail');
    assert.ok(html.includes('class="ribbon'), 'every card keeps the ribbon line (empty ones hold the height)');
    assert.ok(/<div class="name">\d\. /.test(html), 'the numbered name stays (the verifiers and keys read it)');
  }
});

s.check('the deal-in: cards are dealt with a delay each, and a press during the flip picks at once', () => {
  freshRun();
  const kids = draft();
  const want = dealDelays(kids.length);
  kids.forEach((el, i) => {
    assert.ok(/\bdeal\b/.test(cls(el)), 'dealt');
    assert.equal(el.style['--deal-delay'], want[i] + 'ms');
    const face = el.children.find(c => c.className === 'face');
    assert.ok(face.children.some(c => c.className === 'back'), 'the card back is there while it flips');
  });
  // No frame passes: the press lands in the first instant of the flip.
  kids[kids.length - 1].click();
  assert.equal(st.mode, 'playing', 'the press took the card');
  assert.equal(st.pendingDrafts, 0);
});

s.check('the deal-in does not lengthen the auto-pick wait', () => {
  freshRun();
  if (!T.draftAuto.on) T.draftAuto.toggle();
  draft();
  assert.equal(T.draftAuto.left, T.draftAuto.wait, 'the full wait, armed at the deal');
  let frames = 0;
  while (st.mode === 'draft' && frames < 2000) { h.pump(1); frames++; }
  const fps = 60;
  assert.ok(Math.abs(frames / fps - T.draftAuto.wait) < 0.1, 'auto-pick after its wait (' + frames + ' frames)');
  T.draftAuto.toggle();
});

s.check('press-and-hold opens the detail and picks nothing; a tap picks; a mouse never holds', () => {
  freshRun();
  let kids = draft();
  const el = kids[0];
  el._ev.pointerdown({ pointerType: 'touch' });
  h.pump(30);                               // 0.5 s on the clock
  el._ev.pointerup({ pointerType: 'touch' });
  el.click();
  assert.equal(st.mode, 'draft', 'the release after a hold picked nothing');
  assert.ok(!/\bpeek\b/.test(cls(el)), 'the detail closes on release');
  // A later plain tap picks (the hold mark never eats the next tap).
  el._ev.pointerdown({ pointerType: 'touch' });
  h.pump(3);
  el._ev.pointerup({ pointerType: 'touch' });
  el.click();
  assert.equal(st.mode, 'playing', 'a tap picks in one tap');
  // A long mouse press is a click.
  kids = draft();
  kids[1]._ev.pointerdown({ pointerType: 'mouse' });
  h.pump(30);
  kids[1]._ev.pointerup({ pointerType: 'mouse' });
  kids[1].click();
  assert.equal(st.mode, 'playing', 'a mouse click picks however long it is held');
  // A browser that sends no click after the hold: the next press clears the mark.
  kids = draft();
  kids[0]._ev.pointerdown({ pointerType: 'touch' });
  h.pump(30);
  kids[0]._ev.pointerup({ pointerType: 'touch' });
  kids[0]._ev.pointerdown({ pointerType: 'touch' });
  h.pump(2);
  kids[0]._ev.pointerup({ pointerType: 'touch' });
  kids[0].click();
  assert.equal(st.mode, 'playing');
});

s.check('on touch the header says a hold reads the card; a mouse screen does not', () => {
  freshRun();
  draft();
  assert.ok(!/hold/.test(h.elements['ov-sub'].textContent), h.elements['ov-sub'].textContent);
  cardsNow()[0].click();
  h.elements['touch'].classList.add('on');
  try {
    draft();
    assert.match(h.elements['ov-sub'].textContent, /^Pick 1: tap a card · hold to read$/);
    cardsNow()[0].click();
  } finally { h.elements['touch'].classList.remove('on'); }
});

// ---- 3. the tags tell the truth ----------------------------------------------------
// Every hand card of the deck, by an offer id that maps to it.
const HAND_IDS = [];
for (const def of [...CARD_DECK, ...CARD_EXPANSION]) {
  if (handCardOf(def.id)) HAND_IDS.push(def.id);
}
s.check('pure: the tag is exactly the better hand the cards would make (every deck card, many hands)', () => {
  const rng = mulberry32(99);
  let tags = 0;
  for (let trial = 0; trial < 400; trial++) {
    const p = { handCards: {}, jokers: [] };
    const n = Math.floor(rng() * 7);
    for (let i = 0; i < n; i++) {
      const c = handCardOf(HAND_IDS[Math.floor(rng() * HAND_IDS.length)]);
      p.handCards[c.key] = c;
    }
    if (rng() < 0.3) p.jokers.push(['shortcut', 'wildcard', 'doubledown'][Math.floor(rng() * 3)]);
    const state = { player: p, jokerSlots: 2 };
    const now = evaluateHand(handCards(p), handOpts(state));
    for (const id of HAND_IDS) {
      const tag = offerHandTag(state, { id });
      const c = handCardOf(id);
      const then = p.handCards[c.key] ? null : evaluateHand([...handCards(p), c], handOpts(state));
      const better = !!then && (!now || then.order > now.order);
      assert.equal(!!tag, better, id);
      if (tag) { tags++; assert.equal(tag.text, 'makes ' + then.name.toUpperCase()); }
    }
  }
  assert.ok(tags > 200, 'tags were seen (' + tags + ')');
});

// The live check: a seeded draft, a random card, the REAL pick. The tag on
// the card must name the hand the pick leaves, and a card with no tag must
// not leave a better hand. A joker swap screen that opens is checked the same.
function checkPick(el, seen) {
  const p = st.player;
  const u = el._draftOffer;
  const nowOrder = p.hand ? p.hand.order : 0;
  const tag = u.handText;
  const html = el.innerHTML;
  if (tag) assert.ok(html.includes('<div class="tag hand">' + tag + '</div>'), 'the tag is on the card');
  else assert.ok(!html.includes('class="tag'), 'no tag on the card');
  el.click();
  const after = p.hand ? p.hand.order : 0;
  if (tag) {
    seen.tagged++;
    seen.kinds.add(u.jokerSwap ? 'swap' : u.joker ? 'joker' : 'card');
    assert.ok(p.hand, u.id + ': a tag, so a hand');
    assert.equal(tag, 'makes ' + p.hand.name.toUpperCase(), u.id + ': the tag names the hand the pick made');
    assert.ok(after > nowOrder, u.id + ': and it is better than before');
  } else {
    seen.plain++;
    assert.ok(after <= nowOrder, u.id + ': no tag, so no better hand (' + nowOrder + ' -> ' + after + ')');
  }
}
s.check('live: every tag matches the hand the real pick leaves (hand cards, jokers, joker swaps)', () => {
  const real = Math.random;
  Math.random = mulberry32(2026);
  const seen = { tagged: 0, plain: 0, kinds: new Set() };
  try {
    for (let trial = 0; trial < 160; trial++) {
      const p = freshRun();
      T.jokers.draftWeight = trial % 3 === 0 ? 2 : 0;
      p.handCards = {};
      const n = Math.floor(Math.random() * 6);
      for (let i = 0; i < n; i++) {
        const c = handCardOf(HAND_IDS[Math.floor(Math.random() * HAND_IDS.length)]);
        p.handCards[c.key] = c;
      }
      // Some runs hold jokers: a hand joker, or a full row (a joker pick then
      // opens the swap screen).
      const r = Math.random();
      if (r < 0.25) T.jokers.take('shortcut');
      else if (r < 0.45) { T.jokers.take('rime'); T.jokers.take('ignite'); }
      T.hand.update(false);
      let kids;
      if (trial % 5 === 4) {
        st.mode = 'playing'; T.jokers.queueOffer(); T.jokers.openOffer();
        kids = cardsNow();
      } else kids = draft();
      if (!kids.length || st.mode !== 'draft') continue;
      // Half the time take a tagged card when there is one, so both sides are checked often.
      const tagged = kids.filter(k => k._draftOffer && k._draftOffer.handText);
      const pool = tagged.length && Math.random() < 0.5 ? tagged : kids;
      checkPick(pool[Math.floor(Math.random() * pool.length)], seen);
      // A joker taken with a full row opens the swap screen: check a swap too.
      for (let k = 0; k < 3 && st.mode === 'draft'; k++) {
        const more = cardsNow();
        if (!more.length) break;
        checkPick(more[Math.floor(Math.random() * more.length)], seen);
      }
    }
  } finally { Math.random = real; T.jokers.draftWeight = 0; }
  assert.ok(seen.tagged >= 20, 'tags were taken (' + seen.tagged + ')');
  assert.ok(seen.plain >= 20, 'untagged cards were taken (' + seen.plain + ')');
  assert.ok(seen.kinds.has('card'), 'a tagged hand card was checked');
});

s.check('live: a joker that changes how the hand counts is tagged, and the swap screen is tagged truthfully', () => {
  // Three hearts and a held run: Shortcut makes a flush of three.
  const p = freshRun();
  p.handCards = {};
  const hearts = HAND_IDS.map(handCardOf).filter(c => c.suit === 'hearts');
  const ranks = new Set();
  for (const c of hearts) { if (ranks.has(c.value) || Object.keys(p.handCards).length >= 3) continue; ranks.add(c.value); p.handCards[c.key] = c; }
  const vals = Object.values(p.handCards).map(c => c.value).sort((a, b) => a - b);
  T.hand.update(false);
  const now = evaluateHand(handCards(p), handOpts(st));
  const with3 = evaluateHand(handCards(p), { short: true });
  assert.ok(with3 && with3.id.includes('flush') && (!now || with3.order > now.order), 'the set-up: three hearts ' + vals);
  // The joker offer, with room on the row.
  const shortcut = { id: 'joker_shortcut', joker: 'shortcut', tier: 'JOKER', name: 'Shortcut', desc: 'x', apply() {} };
  const tag = offerHandTag(st, shortcut);
  assert.ok(tag && tag.text === 'makes ' + with3.name.toUpperCase(), JSON.stringify(tag));
  const held = { ...p.handCards };
  // The REAL pick of that joker makes exactly that hand.
  st.mode = 'draft'; st.pendingDrafts = 1; st.draftKind = 'joker';
  T.pickCard(shortcut);
  assert.equal('makes ' + p.hand.name.toUpperCase(), tag.text, 'the joker pick made the tagged hand');
  // A full row: no tag (the pick goes to the swap screen first)...
  const q = freshRun();
  q.handCards = { ...held };
  T.hand.update(false);
  T.jokers.take('rime'); T.jokers.take('ignite');
  assert.equal(offerHandTag(st, shortcut), null, 'a full row: nothing changes yet, so no tag');
  // ...and on the swap screen, each REPLACE card is tagged by the row it leaves.
  const swap = { id: 'swap_rime', jokerSwap: true, out: 'rime', in: 'shortcut', from: shortcut };
  assert.equal(offerHandTag(st, swap).text, tag.text);
  st.mode = 'draft'; st.pendingDrafts = 1; st.draftKind = 'joker';
  T.pickCard(swap);
  assert.equal('makes ' + q.hand.name.toUpperCase(), tag.text, 'the swap made the tagged hand');
  assert.equal(offerHandTag(st, { id: 'swap_keep', jokerSwap: true, keep: true, in: 'shortcut' }), null, 'KEEP: no tag');
  assert.equal(handAfterPick(st, { id: 'bless_x', blessing: true }), null, 'a shrine blessing: no tag');
});

s.check('the old level-only hint is gone from openDraft (one tag rule for every screen)', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.ok(!/handHint\(state\.player/.test(main));
  assert.ok(/const tag = offerHandTag\(state, u\);/.test(main));
});

// ---- 4. reduced motion --------------------------------------------------------------
const hr = await boot({ variant: 'cards-still', reducedMotion: true });
s.check('reduced motion: no flip, no card back; the cards are the same', () => {
  hr.T.banners.suppressAll();
  hr.T.startRun();
  hr.pump(2);
  hr.state.mode = 'playing'; hr.state.pendingDrafts = 1; hr.state.draftKind = null; hr.T.openDraft();
  const kids = [...hr.elements['ov-cards'].children];
  assert.ok(kids.length >= 3);
  for (const el of kids) {
    assert.ok(!/\bdeal\b/.test(String(el.className)), 'not dealt');
    assert.equal(el.style['--deal-delay'], undefined);
    const face = el.children.find(c => c.className === 'face');
    assert.ok(face && !face.children.some(c => c.className === 'back'), 'no card back');
    assert.ok(/\bdcard\b/.test(String(el.className)), 'still a playing card');
  }
});

s.done();
