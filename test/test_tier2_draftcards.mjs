// HORDES — test/test_tier2_draftcards.mjs: TIER-2(b) NEW DRAFT CARDS (owner
// autopilot, 2026-09-23).
//
// Six new cards in the existing families (no new family, no new mechanic —
// the reroll/banish agency slice owns that):
//   RARE ladder   thorns ("Thornmail")     +6 thorns on contact, repeatable
//   rewrite combo shatter ("Shatter", FROST+CHAIN on rime+onkillboom)
//                 cinder  ("Cinder Orbit", BURN+ORBIT on ignite+wideorbit)
//                 frostwire ("Frost Wire", FROST+CONDUCT on rime+livewire)
//   MYTHIC ladder tempest ("Tempest")      +1 Chain Zap level
//                 killshot ("Killshot")     +0.5 crit damage (additive)
// Numbers by analogy to the existing magnitudes (loot.js affix base/
// legendary, meta.js shop perLevel) — tune-after, one line of rationale per
// card in src/config.js / src/rewrites.js. Exactly ONE RARE, by measurement:
// a second RARE at 0.12 shifts the G6 coherence fixture's scatter arm off
// stat:COMMON entirely (see src/config.js) — the batch rides combos (half
// weight) and mythics instead, and the deck is FULL after these six anyway.
//
// What is pinned here (all through the REAL seams):
//   1. REGISTRY: every card present in its live registry, unique, colliding
//      with nothing (stat UPGRADES, RULE_IDS, SKILL_PERK_IDS, each other).
//   2. EFFECT MATH: each apply() lands exactly its constant (crit cap 1.0,
//      thorns stacking, zapChain stacking, critMult on the house read), and
//      the two combos price through applyBlast / directHitMult — per-victim,
//      gated, stacking exactly as documented (shatter echo carries the BASE).
//   3. OFFER WEIGHT: the pool cards carry the declared weights — ladder cards
//      through draftLadderWeight (the seam openDraft reads), combos through
//      the REAL rewriteCards() (base x half).
//   4. ART JOINS BY NAME: every new offer id resolves through deckIdForOffer
//      to a REAL card whose NAME equals the registry name, on the mandated
//      rank (face = RARE, ace = MYTHIC).
//   5. COPY: names + descs are printable ASCII, real prose, no emojis.
//   6. CAPTURES: docs/art/tier2-draftcards/ holds one 96x136 PNG per new deck
//      card (24x34 @ OFFER_ART_SCALE), produced by
//      tools/capture_tier2_draftcards.mjs through the REAL drawCard.
//   7. THE REAL DRAFT: each card is offered through openDraft (mythics behind
//      the chase gate, combos behind their constituents) and lands through
//      the REAL pick().
//
// Run: node test/test_tier2_draftcards.mjs
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import {
  CONFIG as C, UPGRADES, DRAFT_LADDER, DRAFT_RARE_UPGRADES, DRAFT_MYTHIC_UPGRADES,
} from '../src/config.js';
import { makePlayer } from '../src/entities.js';
import { RULE_IDS } from '../src/rules.js';
import { SKILL_PERK_IDS } from '../src/perks.js';
import {
  REWRITES, REWRITE_IDS, REWRITE_CARD_WEIGHT, REWRITE_COMBO_WEIGHT_MULT,
  SHATTER_BLAST_MULT, CINDER_BURN_MULT, FROSTWIRE_SLOW_DURATION, FROSTWIRE_SLOW_FACTOR,
  grantRewrite, hasRewrite, rewriteCards, applyBlast, directHitMult, onWeaponHit,
} from '../src/rewrites.js';
import { draftLadderWeight, applyMetaBonuses } from '../src/meta.js';
import { cardArt } from '../src/art/cards.js';
import { deckIdForOffer, OFFER_ART_SCALE } from '../src/draft_card_art.js';
import { cardBox } from '../src/render_cards.js';
import { boot, suite } from './_harness.mjs';

const s = suite('test_tier2_draftcards');
const pOf = (over = {}) => ({ ...makePlayer(), ...over });
const stOf = (rewrites = {}) => ({ player: { ...makePlayer(), rewrites }, enemies: [], effects: [] });

const RARE_NEW = ['thorns'];
const MYTHIC_NEW = ['tempest', 'killshot'];
const COMBO_NEW = ['shatter', 'cinder', 'frostwire'];
const OFFER_OF = {
  thorns: 'thorns',
  shatter: 'rewrite_shatter', cinder: 'rewrite_cinder', frostwire: 'rewrite_frostwire',
  tempest: 'tempest', killshot: 'killshot',
};
const REGISTRY_NAME = {
  thorns: 'thorns', shatter: 'shatter', cinder: 'cinder', frostwire: 'frostwire',
  tempest: 'tempest', killshot: 'killshot',
};
const registryOf = (id) =>
  DRAFT_RARE_UPGRADES.find((u) => u.id === id) || DRAFT_MYTHIC_UPGRADES.find((u) => u.id === id)
  || (REWRITES[id] && { id, name: REWRITES[id].name, desc: REWRITES[id].desc });

// ---- 1. registry presence ---------------------------------------------------
s.check('every new card is present in its live registry, unique, colliding with nothing', () => {
  for (const id of RARE_NEW) assert.ok(DRAFT_RARE_UPGRADES.some((u) => u.id === id), id + ' in DRAFT_RARE_UPGRADES');
  for (const id of MYTHIC_NEW) assert.ok(DRAFT_MYTHIC_UPGRADES.some((u) => u.id === id), id + ' in DRAFT_MYTHIC_UPGRADES');
  for (const id of COMBO_NEW) assert.ok(REWRITE_IDS.includes(id), id + ' in REWRITE_IDS');
  const all = [...RARE_NEW, ...MYTHIC_NEW, ...COMBO_NEW];
  assert.equal(new Set(all).size, all.length, 'new ids unique among themselves');
  const stats = new Set(UPGRADES.map((u) => u.id));
  for (const id of all) {
    assert.ok(!stats.has(id), id + ' would shadow a stat card');
    assert.ok(!RULE_IDS.includes(id), id + ' would shadow a rule card');
    assert.ok(!SKILL_PERK_IDS.includes(id), id + ' would shadow a perk card');
  }
  for (const id of [...RARE_NEW, ...MYTHIC_NEW]) {
    assert.ok(!REWRITE_IDS.includes(id), id + ' would shadow a rewrite');
  }
});

// ---- 2. effect math ---------------------------------------------------------
s.check('Thornmail: +6 flat thorns per pick, stacking (the Briarmail rung below)', () => {
  const p = pOf({ stats: { ...makePlayer().stats, thorns: 0 } });
  const def = DRAFT_RARE_UPGRADES.find((u) => u.id === 'thorns');
  def.apply(p);
  assert.equal(p.stats.thorns, 6, 'thorns ' + p.stats.thorns);
  def.apply(p);
  assert.equal(p.stats.thorns, 12, 'a repeat pick stacks');
});

s.check('Tempest: +1 zap chain level, stacking on the shop publish', () => {
  const p = pOf({ stats: { ...makePlayer().stats } });
  delete p.stats.zapChain;
  DRAFT_MYTHIC_UPGRADES.find((u) => u.id === 'tempest').apply(p);
  assert.equal(p.stats.zapChain, 1, 'arms the uncapped chain from zero');
  p.stats.zapChain = 5; // a maxed Storm Conduit shop row
  DRAFT_MYTHIC_UPGRADES.find((u) => u.id === 'tempest').apply(p);
  assert.equal(p.stats.zapChain, 6, 'stacks past the shop max (range keeps growing under MAX_HOPS)');
});

s.check('Killshot: +0.5 crit damage on the house read ((critMult || 1.5) + bonus)', () => {
  const def = DRAFT_MYTHIC_UPGRADES.find((u) => u.id === 'killshot');
  const p = pOf({ stats: { ...makePlayer().stats } });
  delete p.stats.critMult;
  def.apply(p);
  assert.equal(p.stats.critMult, 2.0, 'absent prices 1.5, the card makes it 2.0');
  const q = pOf({ stats: applyMetaBonuses(makePlayer().stats, {}) }); // a shop-L0 run
  def.apply(q);
  assert.equal(q.stats.critMult, 2.0, 'a run with no crit rows prices 1.5 too');
});

s.check('Shatter: a detonation deals x1.5 to a chilled body, x1.0 otherwise', () => {
  assert.equal(SHATTER_BLAST_MULT, 1.5, 'the constant the rationale prices');
  const mk = (slow) => stOf({ onkillboom: true, shatter: true });
  const cold = mk(); const warm = mk();
  cold.enemies.push({ x: 0, y: 0, hp: 1000, slow: 1 });
  warm.enemies.push({ x: 0, y: 0, hp: 1000 });
  applyBlast(cold, 0, 0, { radius: 40, damage: 100 });
  applyBlast(warm, 0, 0, { radius: 40, damage: 100 });
  assert.equal(cold.enemies[0].hp, 850, 'chilled body takes the shatter bonus');
  assert.equal(warm.enemies[0].hp, 900, 'unchilled body takes the base blast');
  const off = stOf({ onkillboom: true });
  off.enemies.push({ x: 0, y: 0, hp: 1000, slow: 5 });
  applyBlast(off, 0, 0, { radius: 40, damage: 100 });
  assert.equal(off.enemies[0].hp, 900, 'without the card a chilled body takes base');
});

s.check('Shatter echo carries the BASE blast (an echo of the detonation, not the bonus)', () => {
  const st = stOf({ onkillboom: true, aftershock: true, shatter: true });
  st.enemies.push({ x: 0, y: 0, hp: 10000, slow: 2 });
  applyBlast(st, 0, 0, { radius: 40, damage: 100 });
  assert.equal(st.enemies[0].hp, 10000 - 150, 'the chilled body took x1.5');
  assert.equal((st.rewriteEchoes || []).length, 1, 'one echo scheduled');
  assert.equal(st.rewriteEchoes[0].damage, 50, 'echo damage is half the BASE (100 x 0.5), not of 150');
  assert.equal(st.rewriteEchoes[0].radius, 20, 'echo radius is half the base');
});

s.check('Cinder Orbit: orbit hits x1.25 on a burning body, x1.0 everywhere else', () => {
  assert.equal(CINDER_BURN_MULT, 1.25, 'the constant the rationale prices');
  const st = stOf({ ignite: true, wideorbit: true, cinder: true });
  const burning = { slow: 0, burn: 2, burnDps: 5 };
  assert.equal(directHitMult(st, burning, { orbit: true }), 1.25, 'orbit vs burning');
  assert.equal(directHitMult(st, { slow: 0 }, { orbit: true }), 1, 'orbit vs clean');
  assert.equal(directHitMult(st, burning), 1, 'non-orbit vs burning (rider path only)');
  assert.equal(directHitMult(st, { slow: 0, burn: 2, burnDps: 0 }, { orbit: true }), 1,
    'a spent burn (no dps) is not a burn');
  const bare = stOf({ ignite: true, wideorbit: true });
  assert.equal(directHitMult(bare, burning, { orbit: true }), 1, 'without the card, base');
  const stacked = stOf({ ignite: true, wideorbit: true, cinder: true, glacier: true, glacialorbit: true });
  assert.ok(Math.abs(directHitMult(stacked, { slow: 1, burn: 2, burnDps: 5 }, { orbit: true }) - 1.2 * 1.1 * 1.25) < 1e-12,
    'a burning AND chilled body under all three cards multiplies glacier x glacialorbit x cinder');
});

s.check('Frost Wire: zaps chill at the RIME grip, briefly, never truncating', () => {
  assert.equal(FROSTWIRE_SLOW_DURATION, 1.0, 'shorter than RIME (a two-combo engine piece prices in duration)');
  assert.equal(FROSTWIRE_SLOW_FACTOR, 0.75, 'the one chill grip');
  const zapState = () => {
    const st = stOf({ livewire: true, frostwire: true });
    st.player.livewireHits = 4; // the next hit is the 5th — the zap fires
    st.player.stats.damage = 24;
    st.enemies.push({ x: 0, y: 0, hp: 10000 }, { x: 50, y: 0, hp: 10000 });
    return st;
  };
  const st = zapState();
  onWeaponHit(st, st.enemies[0]);
  assert.equal(st.enemies[1].slow, FROSTWIRE_SLOW_DURATION, 'the zap victim chills');
  assert.equal(st.enemies[1].slowMult, FROSTWIRE_SLOW_FACTOR, 'at the RIME grip');
  const nova = zapState();
  nova.enemies[1].slow = 2.5; nova.enemies[1].slowMult = 0.45; // a FROST_NOVA window
  onWeaponHit(nova, nova.enemies[0]);
  assert.equal(nova.enemies[1].slow, 2.5, 'never truncates a longer slow already gripping');
  const noCard = stOf({ livewire: true });
  noCard.player.livewireHits = 4;
  noCard.player.stats.damage = 24;
  noCard.enemies.push({ x: 0, y: 0, hp: 10000 }, { x: 50, y: 0, hp: 10000 });
  onWeaponHit(noCard, noCard.enemies[0]);
  assert.equal(noCard.enemies[1].slow || 0, 0, 'without the card the zap does not chill');
  // The OVERLOAD discharge chills too.
  const ov = stOf({ overload: true, frostwire: true });
  ov.player.overloadHits = 19; // the next hit is the 20th — the discharge fires
  ov.player.stats.damage = 24;
  ov.enemies.push({ x: 0, y: 0, hp: 10000 }, { x: 40, y: 0, hp: 10000 });
  onWeaponHit(ov, ov.enemies[0]);
  assert.equal(ov.enemies[1].slow, FROSTWIRE_SLOW_DURATION, 'the discharge victim chills');
});

s.check('combo predicates: shatter needs rime+onkillboom, cinder needs ignite+wideorbit, frostwire needs rime+livewire', () => {
  const ids = (held) => {
    const st = stOf(null);
    for (const id of held) grantRewrite(st, id);
    return rewriteCards(st).map((c) => c.rewrite);
  };
  assert.ok(!ids(['rime']).includes('shatter') && !ids(['onkillboom']).includes('shatter'), 'shatter needs both');
  assert.ok(ids(['rime', 'onkillboom']).includes('shatter'), 'shatter offered with both');
  assert.ok(!ids(['ignite']).includes('cinder') && !ids(['wideorbit']).includes('cinder'), 'cinder needs both');
  assert.ok(ids(['ignite', 'wideorbit']).includes('cinder'), 'cinder offered with both');
  assert.ok(!ids(['rime']).includes('frostwire') && !ids(['livewire']).includes('frostwire'), 'frostwire needs both');
  assert.ok(ids(['rime', 'livewire']).includes('frostwire'), 'frostwire offered with both');
  assert.ok(hasRewrite({ player: { rewrites: { shatter: true } } }, 'shatter'), 'hasRewrite reads the new cards');
});

// ---- 3. offer weight --------------------------------------------------------
s.check('ladder cards ride draftLadderWeight (the seam openDraft reads); combos ride base x half', () => {
  for (const id of RARE_NEW) {
    assert.equal(draftLadderWeight(id, 'RARE', 0), DRAFT_LADDER.RARE_WEIGHT, id + ' weighs RARE_WEIGHT at luck 0');
    assert.ok(draftLadderWeight(id, 'RARE', 1) > DRAFT_LADDER.RARE_WEIGHT, id + ' rises with Fortune');
  }
  for (const id of MYTHIC_NEW) {
    assert.equal(draftLadderWeight(id, 'MYTHIC', 0), DRAFT_LADDER.MYTHIC_WEIGHT, id + ' weighs MYTHIC_WEIGHT at luck 0');
  }
  const st = stOf(null);
  for (const id of ['rime', 'onkillboom']) grantRewrite(st, id);
  for (const id of ['ignite', 'wideorbit']) grantRewrite(st, id);
  // NOTE: four held closes the family (REWRITE_SLOTS) — check weights one pair
  // at a time so the pool stays open.
  for (const [pair, id] of [[['rime', 'onkillboom'], 'shatter'], [['ignite', 'wideorbit'], 'cinder'], [['rime', 'livewire'], 'frostwire']]) {
    const one = stOf(null);
    for (const h of pair) grantRewrite(one, h);
    const card = rewriteCards(one).find((c) => c.rewrite === id);
    assert.ok(card, id + ' reaches the pool');
    assert.equal(card.weight, REWRITE_CARD_WEIGHT * REWRITE_COMBO_WEIGHT_MULT,
      id + ' carries half the family base weight');
  }
  assert.equal(REWRITE_COMBO_WEIGHT_MULT, 0.5, 'combos price at half');
});

// ---- 4. art joins by NAME ---------------------------------------------------
s.check('every new offer resolves to a REAL card named from its registry, on its mandated rank', () => {
  const wantClass = { thorns: 'face', shatter: 'face', cinder: 'face', frostwire: 'face', tempest: 'ace', killshot: 'ace' };
  const wantTier = { thorns: 'RARE', shatter: 'RARE', cinder: 'RARE', frostwire: 'RARE', tempest: 'MYTHIC', killshot: 'MYTHIC' };
  for (const id of [...RARE_NEW, ...MYTHIC_NEW, ...COMBO_NEW]) {
    const deckId = deckIdForOffer(OFFER_OF[id]);
    assert.ok(deckId, id + ' resolves (never a plain-text fallback)');
    const art = cardArt(deckId);
    assert.ok(art, deckId + ' is a REAL card');
    assert.equal(art.name, registryOf(REGISTRY_NAME[id]).name, id + ' joins by NAME');
    assert.equal(art.rankClass, wantClass[id], id + ' is a ' + wantClass[id] + ' card (rank IS the rarity)');
    assert.equal(art.tier, wantTier[id], id + ' tier is ' + wantTier[id]);
  }
});

// ---- 5. copy ----------------------------------------------------------------
s.check('names + descs are printable ASCII prose, never emojis or the internal label', () => {
  const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
  const defs = [
    ...DRAFT_RARE_UPGRADES.filter((u) => RARE_NEW.includes(u.id)),
    ...DRAFT_MYTHIC_UPGRADES.filter((u) => MYTHIC_NEW.includes(u.id)),
  ];
  for (const d of defs) {
    for (const s of [d.name, d.desc]) {
      assert.ok(/^[ -~]+$/.test(s), d.id + ' copy is printable ASCII: ' + s);
      assert.ok(!EMOJI.test(s), d.id + ' copy carries no emoji');
    }
    assert.ok(d.desc.length > 10, d.id + ' desc is real copy');
  }
  for (const id of COMBO_NEW) {
    for (const str of [REWRITES[id].name, REWRITES[id].desc]) {
      assert.ok(/^[ -~]+$/.test(str), id + ' copy is printable ASCII: ' + str);
      assert.ok(!EMOJI.test(str), id + ' copy carries no emoji');
    }
    assert.ok(REWRITES[id].desc.length > 20, id + ' desc is real prose');
    assert.ok(!/rewrite/i.test(REWRITES[id].desc), id + ' desc never carries the internal family label');
  }
});

// ---- 6. captures ------------------------------------------------------------
s.check('docs/art/tier2-draftcards/ holds one 96x136 PNG per new deck card', () => {
  const { w, h } = cardBox(OFFER_ART_SCALE);
  assert.equal(w, 96, 'offer backing width at OFFER_ART_SCALE');
  assert.equal(h, 136, 'offer backing height at OFFER_ART_SCALE');
  for (const id of [...RARE_NEW, ...MYTHIC_NEW, ...COMBO_NEW]) {
    const deckId = deckIdForOffer(OFFER_OF[id]);
    const file = new URL('../docs/art/tier2-draftcards/' + deckId + '.png', import.meta.url);
    assert.ok(existsSync(file), deckId + '.png exists in-tree');
    const buf = readFileSync(file);
    assert.deepEqual([...buf.slice(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], deckId + ' is a PNG');
    assert.equal(buf.readUInt32BE(16), 96, deckId + ' capture width is 96');
    assert.equal(buf.readUInt32BE(20), 136, deckId + ' capture height is 136');
    assert.ok(buf.length > 300, deckId + ' capture is non-trivial (' + buf.length + ' bytes)');
  }
});

// ---- 7. the REAL draft ------------------------------------------------------
const { T, state, elements } = await boot({ storage: [['hordes_onboarded', '1']] });
const offerIds = () => Array.from(elements['ov-cards'].children).map((el) => el._draftOffer.id);
function draftUntil(pred, cap = 3000) {
  for (let i = 0; i < cap; i++) {
    state.mode = 'playing'; state.pendingDrafts = 1; T.openDraft();
    if (pred(offerIds())) { state.mode = 'playing'; return true; }
  }
  state.mode = 'playing';
  return false;
}

s.check('the RARE card offers through the REAL openDraft and lands through the REAL pick()', () => {
  T.startRun();
  assert.ok(draftUntil((ids) => ids.includes('thorns')), 'thorns offered within the cap');
  const p = state.player;
  p.stats.thorns = 0;
  T.pickCard({ ...DRAFT_RARE_UPGRADES.find((u) => u.id === 'thorns') });
  assert.equal(p.stats.thorns, 6, 'the Thornmail pick landed');
  assert.ok((p.takenStats || {}).thorns, 'the once ledger recorded it');
  state.mode = 'playing';
});

// The joker row replaced the mythic chase cards and the rewrite cards. Tempest
// and Killshot (flat stats) and the cross-tag combos were cut: the game never
// offers them, whatever the run holds.
s.check('the cut cards are never offered: Tempest, Killshot and the combo trio', () => {
  T.startRun();
  state.player.rewrites = { rime: true, onkillboom: true, ignite: true, wideorbit: true, livewire: true };
  const cut = [...MYTHIC_NEW, 'rewrite_shatter', 'rewrite_cinder', 'rewrite_frostwire',
    'joker_tempest', 'joker_killshot', 'joker_shatter', 'joker_cinder', 'joker_frostwire'];
  let seen = null;
  for (let i = 0; i < 400 && !seen; i++) {
    state.mode = 'playing'; state.pendingDrafts = 1; T.openDraft();
    seen = offerIds().find((id) => cut.includes(id)) || null;
  }
  state.mode = 'playing';
  assert.equal(seen, null, 'a cut card was offered');
});

s.done();
