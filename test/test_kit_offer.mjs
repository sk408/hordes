// Decision 7 (Steve, 2026-11-17): "i think i intended to have potential weapon
// loadout in the menu, i didn't mean for it to actually give those weapons to
// the player." The LOADOUT lists the weapons a run can offer. A run starts
// with the base volley and the loadout's first weapon; the others come as
// NEW cards in level-up drafts while a slot is free (config.js KIT_OFFER).
// Pinned here: the start kit, the offer rule and its guarantee, the slot cap,
// the auto-pick rank, RETRY, old saves, the hand, and the LOADOUT wording.
// Run: node test/test_kit_offer.mjs
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';
import { makeProfile, validateProfile, effectiveLoadout } from '../src/meta.js';
import { KIT_OFFER, CONFIG } from '../src/config.js';
import { HINTS } from '../src/tutorial.js';
import { handCardOf } from '../src/hands.js';
import { WEAPON_MAX_LEVEL, WEAPON_NAMES } from '../src/weapons.js';
import { EVOLUTION_DEFS } from '../src/evolutions.js';

const S = suite('test_kit_offer');
const h = await boot({ storage: [['hordes_onboarded', '1'], ['hordes_tour_draft', '1'], ['hordes_hints_off', '1']] });
const T = h.T, st = h.state;
const prof = T.getProfile();
const own = (...ws) => { for (const w of ws) if (!prof.unlockedWeapons.includes(w)) prof.unlockedWeapons.push(w); };
const types = () => st.weapons.map(w => w.type);
const cards = () => (h.elements['ov-cards'].children || []).filter(c => c._draftOffer);
const offers = () => cards().map(c => c._draftOffer);
// Open one level-up draft with no XP flowing (no stray drafts of the game's own).
// A new draft is never the deal again of a free NEW card (closeDraft clears it).
const draft = () => {
  st.player.stats.xpMult = 0; st.player.xpNext = 1e18;
  st.pendingDrafts = 1; st.draftKind = null; st.kitRedeal = false;
  T.openDraft();
  return offers();
};
const pickWhere = (fn) => {
  const cs = cards();
  const i = cs.findIndex(c => fn(c._draftOffer));
  cs[i >= 0 ? i : 0].click();
  h.pump(1);
};
const fresh = () => { prof.loadout = null; prof.unlockedWeapons = ['VOLLEY', 'BOOMERANG']; prof.purchased.slots = 0; };

S.check('a fresh profile: VOLLEY + BOOMERANG, nothing left to offer, no NEW card ever', () => {
  fresh();
  T.startRun(); h.pump(1);
  assert.deepEqual(types(), ['VOLLEY', 'BOOMERANG']);
  assert.deepEqual(T.loadout.pending(), []);
  for (let i = 0; i < 12; i++) {
    assert.ok(!draft().some(o => /^wpn_/.test(o.id)), 'no NEW card on a fresh profile');
    pickWhere(() => true);
  }
});

S.check('the run starts with the loadout\'s first weapon only; the rest wait in the kit', () => {
  fresh();
  own('ORBIT', 'BEAM', 'EMBER');
  prof.purchased.slots = 1;                 // 4 slots: the volley + 3
  prof.loadout = ['BEAM', 'ORBIT', 'BOOMERANG'];
  T.startRun(); h.pump(1);
  assert.deepEqual(types(), ['VOLLEY', 'BEAM']);
  assert.deepEqual(st.runKit, ['BEAM', 'ORBIT', 'BOOMERANG']);
  assert.deepEqual(T.loadout.pending(), ['ORBIT', 'BOOMERANG']);
});

S.check('NEW cards come only from the loadout (EMBER is owned but benched), marked kitNew', () => {
  const seen = new Set();
  for (let i = 0; i < 20; i++) {
    for (const o of draft()) if (/^wpn_/.test(o.id)) { seen.add(o.id); assert.ok(o.kitNew, o.id); assert.match(o.name, /^NEW: /); }
    pickWhere(o => !o.kitNew);              // never take one: the kit stays open
  }
  assert.deepEqual([...seen].sort(), ['wpn_BOOMERANG', 'wpn_ORBIT']);
});

S.check('the guarantee: never GAP drafts in a row without a NEW card while the kit is open', () => {
  T.startRun(); h.pump(1);
  let dry = 0, maxDry = 0;
  for (let i = 0; i < 40; i++) {
    const has = draft().some(o => o.kitNew);
    dry = has ? 0 : dry + 1;
    maxDry = Math.max(maxDry, dry);
    pickWhere(o => !o.kitNew);
  }
  assert.ok(maxDry <= KIT_OFFER.GAP - 1, 'longest dry spell ' + maxDry);
  // With the NEW cards' weight at 0, only the guarantee brings one: every GAP-th draft.
  const w0 = KIT_OFFER.WEIGHT;
  KIT_OFFER.WEIGHT = 0;
  try {
    T.startRun(); h.pump(1);
    const got = [];
    for (let i = 0; i < 3 * KIT_OFFER.GAP; i++) { got.push(draft().some(o => o.kitNew) ? 1 : 0); pickWhere(o => !o.kitNew); }
    // FIRST: the run's first draft holds one, then every GAP-th.
    const want = got.map((_x, i) => ((KIT_OFFER.FIRST ? i : i + 1) % KIT_OFFER.GAP === 0 ? 1 : 0));
    assert.equal(got[0], 1, 'the first draft of a run holds a NEW card');
    assert.deepEqual(got, want, 'the guarantee alone');
  } finally { KIT_OFFER.WEIGHT = w0; }
});

S.check('picking a NEW card adds that weapon at its join level, to the hand too; its level-up card is the same hand card', () => {
  T.startRun(); h.pump(1);
  let tries = 0;
  while (!draft().some(o => o.id === 'wpn_ORBIT') && tries++ < 30) pickWhere(o => !o.kitNew);
  assert.ok(offers().some(o => o.id === 'wpn_ORBIT'), 'ORBIT offered within 30 drafts');
  pickWhere(o => o.id === 'wpn_ORBIT');
  const w = st.weapons.find(x => x.type === 'ORBIT');
  assert.ok(w, 'ORBIT joined');
  assert.equal(w.level, T.loadout.joinLevel());
  assert.deepEqual(T.loadout.pending(), ['BOOMERANG']);
  const key = handCardOf('wpn_ORBIT').key;
  assert.ok(st.player.handCards && st.player.handCards[key], 'the NEW card is in the hand');
  assert.equal(handCardOf('lvl_ORBIT_' + w.level).key, key);
  assert.ok(!draft().some(o => o.id === 'wpn_ORBIT'), 'a held weapon is never offered NEW again');
  pickWhere(o => !o.kitNew);
});

// Balance tuning (2026-11-18): a NEW weapon now joins JOIN_ABOVE (1) level
// above the weakest held weapon, so these expectations moved up by one.
S.check('catch-up: a NEW weapon joins one level above the weakest held weapon, never below the start level, one short of the top', () => {
  assert.equal(KIT_OFFER.JOIN_ABOVE, 1);
  T.startRun(); h.pump(1);
  const lead = st.weapons[1], start = lead.level;
  assert.equal(T.loadout.joinLevel(), start + 1);
  lead.level = start + 2;
  assert.equal(T.loadout.joinLevel(), start + 3);
  lead.level = WEAPON_MAX_LEVEL - 1;
  assert.equal(T.loadout.joinLevel(), WEAPON_MAX_LEVEL - 1, 'one short of the top');
  lead.level = WEAPON_MAX_LEVEL;
  assert.equal(T.loadout.joinLevel(), WEAPON_MAX_LEVEL - 1);
});

S.check('the cap: with no free slot no NEW card is offered, though the kit still has weapons', () => {
  T.startRun(); h.pump(1);
  st.weaponSlots = 2;                       // the volley + the start weapon: full
  assert.equal(T.loadout.openSlots(), 0);
  for (let i = 0; i < 2 * KIT_OFFER.GAP + 2; i++) {
    assert.ok(!draft().some(o => /^wpn_/.test(o.id)), 'no NEW card with the slots full');
    pickWhere(() => true);
  }
});

S.check('the auto-pick takes a NEW kit card over a RARE and a plain card, not over a joker with room', () => {
  const pick = T.auto.pickIndex;
  st.player.jokers = []; st.jokerSlots = 2;
  // Balance review 2026-11: a weapon level comes before a NEW card (free or not).
  assert.equal(pick([{ id: 'dmg' }, { id: 'lvl_VOLLEY_1' }, { id: 'wpn_ORBIT', kitNew: true }]), 1);
  assert.equal(pick([{ id: 'r', tier: 'RARE' }, { id: 'wpn_ORBIT', kitNew: true }]), 1);
  assert.equal(pick([{ id: 'dmg' }, { id: 'wpn_ORBIT', kitNew: true }]), 1);
  assert.equal(pick([{ id: 'j', tier: 'JOKER' }, { id: 'wpn_ORBIT', kitNew: true }]), 0);
  assert.ok(KIT_OFFER.AUTO_RANK > 1.3 && KIT_OFFER.AUTO_RANK < 1.6, 'between a partner stat card and a weapon level');
});

S.check('RETRY (and auto-continue\'s restart) starts the same way: the first weapon only, the whole kit to come', () => {
  T.startRun(); h.pump(1);
  draft(); pickWhere(() => true);
  st.weapons.push({ ...st.weapons[1], type: 'ORBIT' });   // as if a NEW card was taken
  st.kitFreeUsed = 1; st.kitRedeal = true;              // as if it was the free one
  T.startRun(); h.pump(1);                 // RETRY is startRun (main.js autoRestart too)
  assert.deepEqual(types(), ['VOLLEY', 'BEAM']);
  assert.deepEqual(T.loadout.pending(), ['ORBIT', 'BOOMERANG']);
  assert.equal(st.kitDry, KIT_OFFER.GAP - 1, 'the first draft is owed a NEW card again');
  assert.equal(st.kitFreeUsed, 0, 'the free NEW card is owed again');
  assert.equal(st.kitRedeal, false);
});

S.check('old saves: a stored loadout keeps its order (its first weapon starts the run); no choice = the hero\'s own weapon first', () => {
  const old = validateProfile({ ...makeProfile(), unlockedWeapons: ['VOLLEY', 'BOOMERANG', 'ORBIT', 'ZAP'], loadout: ['ZAP', 'ORBIT'] });
  assert.deepEqual(old.profile.loadout, ['ZAP', 'ORBIT'], 'nothing reset, nothing reordered');
  const p = makeProfile();
  p.unlockedWeapons.push('ORBIT', 'SEEKER');
  p.unlockedCharacters.push('PALADIN'); p.equippedCharacter = 'PALADIN';
  assert.equal(effectiveLoadout(p)[0], 'ORBIT', "the Paladin's Orbit starts his run");
  fresh(); own('ORBIT', 'ZAP'); prof.purchased.slots = 1;
  prof.loadout = ['ZAP', 'ORBIT'];
  T.startRun(); h.pump(1);
  assert.deepEqual(types(), ['VOLLEY', 'ZAP']);
});

S.check('the LOADOUT screen says what it does, and the START card changes the first weapon', () => {
  fresh(); own('ORBIT', 'BEAM'); prof.purchased.slots = 1;
  prof.loadout = ['BEAM', 'ORBIT', 'BOOMERANG'];
  T.loadout.open('title');
  const sub = h.elements['ov-sub'].textContent;
  assert.match(sub, /Weapons your run can offer/);
  assert.match(sub, /start with one/);
  assert.match(sub, /the rest come as NEW cards in drafts/);
  assert.match(sub, /the first one is a free pick/);
  const menu = () => h.elements['ov-cards'].children;
  const start = () => menu().find(c => /START: /.test(c.innerHTML || ''));
  assert.ok(start(), 'a START card');
  assert.match(start().innerHTML, /START: Beam/);
  const row = (name) => menu().find(c => (c.innerHTML || '').includes(name + '<') || (c.innerHTML || '').includes('>' + name));
  assert.ok(menu().some(c => /START WEAPON/.test(c.innerHTML || '')), 'the start row is named');
  assert.ok(menu().some(c => /IN DRAFTS/.test(c.innerHTML || '')), 'the others say they come in drafts');
  start().click();
  assert.deepEqual(prof.loadout, ['ORBIT', 'BOOMERANG', 'BEAM']);
  assert.match(start().innerHTML, /START: Orbit/);
  T.startRun(); h.pump(1);
  assert.deepEqual(types(), ['VOLLEY', 'ORBIT'], 'the run starts with the new choice');
  void row;
});

S.check('the pre-run summary names the start weapon and the draft weapons', () => {
  prof.loadout = ['ORBIT', 'BOOMERANG', 'BEAM'];
  const s = T.loadoutSummary ? T.loadoutSummary() : h.T.menus && h.T.menus.loadoutSummary();
  assert.match(s, /^Start: Volley \+ Orbit Blade\. In drafts: Boomerang, Beam\./);
});

S.check('the hints teach it: the LOADOUT hint and a NEW-card hint', () => {
  assert.match(HINTS.loadout.text, /a run can offer/);
  assert.ok(HINTS.newweapon && /NEW card/.test(HINTS.newweapon.text));
  assert.match(HINTS.newweapon.text, /The first one is free/);
});

S.check('teaching by doing: the first NEW card in a draft brings its hint, pointing at that card', () => {
  T.tut.setHintsEnabled(true);
  fresh(); own('ORBIT'); prof.purchased.slots = 1;
  prof.loadout = ['BOOMERANG', 'ORBIT'];
  T.startRun(); h.pump(1);
  if (T.tut.hints.active) T.tut.hints.active = null;
  const offs = draft();
  const i = offs.findIndex(o => o.kitNew);
  assert.ok(i >= 0, 'the first draft holds a NEW card');
  h.pump(2);
  const a = T.tut.hints.active;
  assert.equal(a && a.id, 'newweapon');
  assert.equal(a.targets[0], cards()[i], 'the hint points at the NEW card');
});

// ---- Review fixes (R1 review of decision 7) ----------------------------------
const txtOf = (e) => (e ? (e.innerHTML || '') + ' ' + (e.textContent || '') + ' ' + (e.children || []).map(txtOf).join(' ') : '');
const rowText = (r) => (r.innerHTML || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const kitRun = (loadout, slots = 1) => {
  fresh(); own('ORBIT', 'BEAM', 'ZAP'); prof.purchased.slots = slots;
  prof.loadout = loadout.slice();
  st.toasts = [];
  T.startRun(); h.pump(1);
};
const untilNew = (want = (o) => o.kitNew) => {
  let tries = 0, offs = draft();
  while (!offs.some(want) && tries++ < 30) { pickWhere(o => !o.kitNew && !o.refill); offs = draft(); }
  assert.ok(offs.some(want), 'the card came within 30 drafts');
  return offs.find(want);
};

S.check('ENCORE on a NEW card: one copy joins (one level up), the slot count is right, the rest of the kit still comes', () => {
  kitRun(['BEAM', 'ORBIT', 'ZAP']);
  if (!(st.player.jokers || []).some(j => (j.id || j) === 'encore')) T.jokers.take('encore');
  const o = untilNew();
  const t = o.id.slice(4), joinLv = T.loadout.joinLevel();
  st.player.draftPicks = 4;                 // the next pick is the 5th: it counts twice
  st.toasts = [];
  pickWhere(x => x.id === o.id);
  const copies = st.weapons.filter(w => w.type === t);
  assert.equal(copies.length, 1, 'one ' + t + ', not two: ' + types().join(','));
  assert.equal(copies[0].level, joinLv + 1, 'the second count is a level');
  assert.equal(T.loadout.openSlots(), 1, 'one slot left for the last kit weapon');
  assert.equal(T.loadout.pending().length, 1);
  assert.equal(st.toasts.filter(x => /^NEW WEAPON/.test(x.msg)).length, 1, 'one NEW WEAPON toast');
});

S.check('ENCORE on a fusion refill card: one copy, one refill used', () => {
  kitRun(['BEAM']);
  if (!(st.player.jokers || []).some(j => (j.id || j) === 'encore')) T.jokers.take('encore');
  st.fusionsMade = 1; st.fusionRefills = 0;
  const o = untilNew(x => x.refill);
  st.player.draftPicks = 4;
  pickWhere(x => x.id === o.id);
  assert.equal(st.weapons.filter(w => w.type === o.id.slice(4)).length, 1, types().join(','));
  assert.equal(st.fusionRefills, 1);
});

S.check('ONE OF EACH: a late NEW weapon\'s bonus level stops one short of the top', () => {
  kitRun(['BEAM', 'ORBIT', 'ZAP']);
  T.jokers.take('once');
  st.weapons[1].level = WEAPON_MAX_LEVEL;
  const o = untilNew();
  st.weapons[1].level = WEAPON_MAX_LEVEL;
  assert.equal(T.loadout.joinLevel(), WEAPON_MAX_LEVEL - 1);
  pickWhere(x => x.id === o.id);
  assert.equal(st.weapons.find(w => w.type === o.id.slice(4)).level, WEAPON_MAX_LEVEL - 1);
  // Below the cap the bonus still pays (+1).
  kitRun(['BEAM', 'ORBIT', 'ZAP']);
  T.jokers.take('once');
  const o2 = untilNew();
  const j2 = T.loadout.joinLevel();
  pickWhere(x => x.id === o2.id);
  assert.equal(st.weapons.find(w => w.type === o2.id.slice(4)).level, j2 + 1);
});

S.check('a banished NEW card is gone: not pending, the field report drops it, and a fusion\'s free slot gets its refill', () => {
  kitRun(['BEAM', 'ORBIT']);
  const o = untilNew(x => x.id === 'wpn_ORBIT');
  st.draftCharges.banish = 1;
  T.draftActions.banish(o);
  pickWhere(x => !x.kitNew && !x.refill);
  assert.deepEqual(T.loadout.pending(), []);
  st.fusionsMade = 1; st.fusionRefills = 0;
  untilNew(x => x.refill);
  st.mode = 'playing'; T.openStats(); h.pump(1);
  assert.ok(!/still to come[^<]*Orbit/.test(txtOf(h.elements['ov-cards'])), 'the field report does not promise ORBIT');
  T.closeStats(); h.pump(1);
});

S.check('the refill waits while the loadout still has a weapon to offer', () => {
  kitRun(['BEAM', 'ORBIT']);
  st.fusionsMade = 1; st.fusionRefills = 0;
  for (let i = 0; i < 25; i++) {
    assert.ok(!draft().some(x => x.refill), 'no refill card while ORBIT is to come');
    pickWhere(x => !x.kitNew);
  }
});

S.check('the NEW cards share WEIGHT: two pending weapons take the same share of the draw as one', () => {
  // Sweep the first draw's random number over [0, 1): the share of it that
  // lands on a NEW card is exactly their weight over the pool's. The pool is
  // the same in both runs except for the NEW cards, so a shared WEIGHT gives
  // the same share with one or two pending.
  const share = (loadout) => {
    kitRun(loadout);
    const N = 400, rnd = Math.random;
    let hit = 0;
    try {
      for (let i = 0; i < N; i++) {
        const u = (i + 0.5) / N;
        Math.random = () => u;
        st.kitDry = -1e9;                   // the guarantee stays out of it
        if (draft()[0].kitNew) hit++;
      }
    } finally { Math.random = rnd; }
    return hit / N;
  };
  const one = share(['BEAM', 'ORBIT']), two = share(['BEAM', 'ORBIT', 'ZAP']);
  assert.ok(one > 0.05, 'a NEW card takes a share of the draw (' + one + ')');
  assert.ok(Math.abs(two - one) <= 3 / 400, 'shared weight: ' + two + ' with two pending vs ' + one + ' with one');
});

S.check('the guarantee puts its card in the last place, and a natural NEW card resets the count', () => {
  const w0 = KIT_OFFER.WEIGHT;
  KIT_OFFER.WEIGHT = 0;
  try {
    kitRun(['BEAM', 'ORBIT']);
    const offs = draft();
    assert.equal(offs.findIndex(x => x.kitNew), offs.length - 1, 'the forced card is last');
  } finally { KIT_OFFER.WEIGHT = w0; }
  kitRun(['BEAM', 'ORBIT']);
  let seen = false;
  for (let i = 0; i < 60 && !seen; i++) {
    st.kitDry = KIT_OFFER.GAP - 2;          // one short of a forced card
    if (draft().some(x => x.kitNew)) { seen = true; assert.equal(st.kitDry, 0, 'a natural NEW card resets the count'); }
    else pickWhere(() => true);
  }
  assert.ok(seen, 'a natural NEW card came in 60 drafts');
});

S.check('catch-up reads the weakest held weapon, not the strongest', () => {
  kitRun(['BEAM', 'ORBIT', 'ZAP']);
  const o = untilNew();
  pickWhere(x => x.id === o.id);
  const held = st.weapons.filter(w => w.type !== 'VOLLEY');
  assert.equal(held.length, 2);
  held[0].level = 6; held[1].level = 4;
  assert.equal(T.loadout.joinLevel(), 4 + KIT_OFFER.JOIN_ABOVE);
  held[0].level = 4; held[1].level = 6;
  assert.equal(T.loadout.joinLevel(), 4 + KIT_OFFER.JOIN_ABOVE);
});

S.check('the field report: "still to come as NEW cards" with a free slot, "no free slot" without', () => {
  kitRun(['BEAM', 'ORBIT']);
  st.mode = 'playing'; T.openStats(); h.pump(1);
  assert.match(txtOf(h.elements['ov-cards']), /still to come as NEW cards: Orbit Blade/);
  T.closeStats(); h.pump(1);
  st.weaponSlots = 2;
  st.mode = 'playing'; T.openStats(); h.pump(1);
  const t = txtOf(h.elements['ov-cards']);
  assert.match(t, /in your loadout, no free slot: Orbit Blade/);
  assert.ok(!/still to come/.test(t));
  T.closeStats(); h.pump(1);
});

S.check('the pick of a NEW card says so: a NEW WEAPON toast', () => {
  kitRun(['BEAM', 'ORBIT']);
  const o = untilNew();
  st.toasts = [];
  pickWhere(x => x.id === o.id);
  assert.ok(st.toasts.some(x => x.msg === 'NEW WEAPON: ORBIT BLADE'), JSON.stringify(st.toasts.map(x => x.msg)));
});

S.check('the shop tells the new rule: a slot is one more weapon a run can offer, a bought weapon comes in drafts', () => {
  fresh(); own('ORBIT');
  prof.gold = 1e7; prof.purchased.slots = 1;   // a free slot: nothing is benched
  prof.loadout = ['BOOMERANG', 'ORBIT'];
  const rows = () => (h.elements['ov-cards'].children || []);
  T.menus.showShop();
  const slot = rows().find(r => /Weapon Slot/.test(rowText(r)));
  assert.match(rowText(slot), /One more weapon your runs can offer in drafts/);
  assert.ok(!/Bring 1 more|equipped when/i.test(rows().map(rowText).join(' | ')), 'no old wording in the shop');
  const beam = rows().find(r => /^Beam\b/.test(rowText(r)));
  assert.match(rowText(beam), /New weapon for your LOADOUT: runs offer it in drafts/);
  st.toasts = [];
  beam.click(); h.pump(1);
  const msgs = st.toasts.map(x => x.msg).join(' | ');
  assert.match(msgs, /ADDED Beam to your LOADOUT: it comes in drafts/);
  assert.ok(!/EQUIPPED/.test(msgs), msgs);
  T.startRun(); h.pump(1);
  assert.deepEqual(types(), ['VOLLEY', 'BOOMERANG'], 'and that is what the run does');
  assert.ok(T.loadout.pending().includes('BEAM'));
});

S.check('the CHARACTERS screen STARTS line names the weapon the run starts with', () => {
  fresh(); own('ORBIT', 'BEAM', 'ZAP');
  prof.loadout = ['BEAM', 'ORBIT'];
  const ids = ['KNIGHT', 'PALADIN', 'WITCH'];
  for (const id of ids) if (!prof.unlockedCharacters.includes(id)) prof.unlockedCharacters.push(id);
  for (const id of ids) {
    const kit = T.charSelect.kit(id);
    assert.equal(kit.weapon, 'Beam', id + ' with loadout [BEAM, ORBIT]');
  }
  prof.loadout = null;
  for (const id of ids) {
    const was = prof.equippedCharacter;
    prof.equippedCharacter = id;
    T.startRun(); h.pump(1);
    const start = st.weapons[1] && st.weapons[1].type;
    prof.equippedCharacter = was;
    assert.ok(start, id + ' starts with a weapon');
    assert.equal(T.charSelect.kit(id).weapon, WEAPON_NAMES[start], id + ' with no stored choice')
  }
});

// ---- Balance tuning (2026-11-18) ------------------------------------------------
// The run's first NEW weapon is a free pick (KIT_OFFER.FREE): the draft is dealt
// again without NEW cards and the level-up still buys a card. Later NEW cards
// cost the pick, as before.
S.check('the first NEW weapon is free: the draft deals again with no NEW card, and the level-up still buys a card', () => {
  assert.equal(KIT_OFFER.FREE, 1);
  kitRun(['BEAM', 'ORBIT', 'ZAP']);
  const o = untilNew();
  assert.match(o.desc, /FREE: then pick again/, 'the free NEW card says so');
  const dry = st.kitDry, pend = st.pendingDrafts, lvl = st.player.level;
  pickWhere(x => x.id === o.id);
  assert.ok(st.weapons.some(w => w.type === o.id.slice(4)), 'the weapon joined');
  assert.equal(st.mode, 'draft', 'the draft is still open');
  assert.equal(st.kitRedeal, true);
  assert.equal(st.pendingDrafts, pend, 'the level-up is not used up');
  assert.equal(st.player.level, lvl);
  assert.ok(offers().length >= 3, 'a full hand again');
  assert.ok(!offers().some(x => /^wpn_/.test(x.id)), 'no NEW card in the deal again');
  assert.equal(st.kitDry, dry, 'the deal again does not count toward the guarantee');
  assert.match(h.elements['ov-sub'].textContent, /the NEW weapon was free/);
  // A reroll in the deal again (it reopens the draft) still holds no NEW card.
  st.draftCharges = { ...(st.draftCharges || {}), reroll: 1 };
  assert.ok(T.draftActions.reroll(), 'the reroll ran');
  assert.ok(!offers().some(x => /^wpn_/.test(x.id)), 'no NEW card after a reroll either');
  // The second card closes the draft.
  pickWhere(x => x.id.startsWith('lvl_'));
  assert.notEqual(st.mode, 'draft', 'the second card closes the draft');
  assert.equal(st.kitRedeal, false);
  assert.equal(st.kitFreeUsed, 1);
  // The next NEW card costs the pick: the draft closes.
  const o2 = untilNew();
  assert.ok(!/FREE/.test(o2.desc), 'only the first NEW card is free');
  pickWhere(x => x.id === o2.id);
  assert.notEqual(st.mode, 'draft', 'the second NEW card used up the level-up');
  assert.deepEqual(T.loadout.pending(), []);
});

// Verification fix: a fusion made before the run's first NEW card (VOLLEY+ORBIT,
// VOLLEY+JAVELIN) left a refill owed. The deal again forced its NEW list empty,
// so the refill guard opened and offered "NEW: <any weapon>" cards there, and a
// weapon outside the loadout could take the last slot.
S.check('a fusion before the first NEW card: the deal again holds no refill card either', () => {
  for (const [loadout, slots] of [[['BEAM', 'ORBIT', 'ZAP'], 1], [['BEAM', 'ORBIT'], 2]]) {
    for (let k = 0; k < 12; k++) {
      kitRun(loadout, slots);
      st.fusionsMade = 1; st.fusionRefills = 0;   // as if VOLLEY had fused already
      const o = untilNew();
      pickWhere(x => x.id === o.id);
      assert.equal(st.kitRedeal, true, 'this is the deal again');
      assert.ok(!offers().some(x => /^wpn_/.test(x.id)),
        'no NEW card of any kind in the deal again: ' + offers().map(x => x.name).join(', '));
      pickWhere(x => true);
    }
  }
  // After the deal again, the refill still comes once the loadout is all in.
  kitRun(['BEAM', 'ORBIT'], 2);
  st.fusionsMade = 1; st.fusionRefills = 0;
  const first = untilNew();
  pickWhere(x => x.id === first.id);
  pickWhere(x => true);
  assert.ok(untilNew(x => x.refill), 'the refill comes in a later draft');
});

// Verification fix: the free pick must not eat a second queued level-up.
S.check('the free NEW card with two level-ups queued: both still to pay, then one', () => {
  kitRun(['BEAM', 'ORBIT']);
  const o = untilNew();
  st.pendingDrafts = 2;
  pickWhere(x => x.id === o.id);
  assert.equal(st.kitRedeal, true);
  assert.equal(st.pendingDrafts, 2, 'the free pick used no level-up');
  pickWhere(x => x.id.startsWith('lvl_'));
  assert.equal(st.pendingDrafts, 1, 'the second card used one level-up');
  assert.equal(st.kitRedeal, false);
  st.pendingDrafts = 0; st.mode = 'playing';
});

S.check('the free NEW card in a real level-up: one draft takes two cards, the run goes on after', () => {
  kitRun(['BEAM', 'ORBIT']);
  st.player.stats.xpMult = 0; st.player.xpNext = 1e18;
  st.pendingDrafts = 1; st.draftKind = null; st.kitRedeal = false;
  T.openDraft();                            // the first draft holds a NEW card (FIRST)
  const i = offers().findIndex(x => x.kitNew);
  assert.ok(i >= 0);
  cards()[i].click(); h.pump(1);
  assert.equal(st.mode, 'draft');
  cards()[0].click(); h.pump(1);
  assert.notEqual(st.mode, 'draft', 'two picks, then back to the run');
  assert.deepEqual(types(), ['VOLLEY', 'BEAM', 'ORBIT']);
});

// ---- Integration review fixes (r1/integ2) ------------------------------------
const sub = () => h.elements['ov-sub'].textContent;
const keysFor = (n) => Array.from({ length: n }, (_, i) => i + 1).join('/');
const pressKey = (k) => { h.key('keydown', { key: k, preventDefault() {} }); h.pump(1); };

S.check('the deal again names exactly its own keys (3 cards; 4 with Full Hand)', () => {
  for (const extra of [0, 1]) {
    kitRun(['BEAM', 'ORBIT', 'ZAP']);
    st.player.stats.draftOffers = extra;
    const o = untilNew();
    pickWhere(x => x.id === o.id);
    assert.equal(st.kitRedeal, true);
    assert.equal(offers().length, 3 + extra);
    assert.equal(sub(), 'the NEW weapon was free · Pick 1: click or press ' + keysFor(3 + extra));
    pickWhere(x => true);
    st.player.stats.draftOffers = 0;
  }
});

// The first NEW card brings the newweapon hint. A hint holds the keys, but
// the draft header names 1/2/3: those keys pick under it.
const hintRun = () => {
  T.tut.setHintsEnabled(true);
  delete prof.banners['hint:newweapon'];
  kitRun(['BEAM', 'ORBIT', 'ZAP']);
  if (T.tut.hints.active) T.tut.hints.active = null;
  const offs = draft();
  h.pump(2);
  const a = T.tut.hints.active;
  assert.equal(a && a.id, 'newweapon', 'the hint is up on the first NEW draft');
  return offs.findIndex(x => x.kitNew);
};

S.check('newweapon hint: the digit key the header names takes the NEW card under it, and the hint goes', () => {
  const i = hintRun();
  assert.match(sub(), /press 1\/2\/3/);
  pressKey(String(i + 1));
  assert.equal(st.kitRedeal, true, 'the key took the NEW card');
  assert.equal(T.tut.hints.active, null, 'the hint is answered');
  pressKey('1');
  assert.notEqual(st.mode, 'draft', 'key 1 takes a card in the deal again');
  T.tut.setHintsEnabled(false);
});

S.check('newweapon hint: a click on the NEW card deals again, and the hint leaves with the card', () => {
  const i = hintRun();
  cards()[i].click(); h.pump(2);
  assert.equal(st.kitRedeal, true);
  assert.equal(T.tut.hints.active, null, 'no NEW-card hint over a deal again with no NEW card');
  pickWhere(x => true);
  T.tut.setHintsEnabled(false);
});

S.check('newweapon hint: the AUTO-PICK countdown waits while it is read, then runs', () => {
  hintRun();
  assert.equal(T.draftAuto.on, true);
  const left0 = T.draftAuto.left;
  h.pump(120);
  assert.equal(st.mode, 'draft');
  assert.equal(T.draftAuto.left, left0, 'the countdown held under the hint');
  T.tut.hints.active = null;   // GOT IT
  h.pump(60);
  assert.ok(T.draftAuto.left < left0 - 0.5, 'the countdown runs after GOT IT');
  pickWhere(x => !x.kitNew);
  T.tut.setHintsEnabled(false);
});

S.check('an unattended run raises no newweapon hint (nobody is there to read it)', () => {
  T.tut.setHintsEnabled(true);
  delete prof.banners['hint:newweapon'];
  kitRun(['BEAM', 'ORBIT', 'ZAP']);
  st.unattended = true;
  if (T.tut.hints.active) T.tut.hints.active = null;
  const offs = draft();
  assert.ok(offs.some(x => x.kitNew), 'the first draft holds the NEW card');
  h.pump(3);
  assert.ok(!(T.tut.hints.active && T.tut.hints.active.id === 'newweapon'), 'no hint');
  assert.ok(!T.tut.seen('hint:newweapon'), 'the hint is still owed to the player');
  st.unattended = false;
  pickWhere(x => !x.kitNew);
  T.tut.setHintsEnabled(false);
});

S.check('unattended with AUTO-PICK OFF: the free NEW card goes at the stall limit, and the deal again gets its own full wait', () => {
  const STALL = CONFIG.AUTOPILOT.AUTO_STALL_S;
  kitRun(['BEAM', 'ORBIT', 'ZAP']);
  // A full joker row: a joker with room outranks the NEW card for the auto-pick (by design),
  // and about 1 seed in 6 dealt one into this draft, so the watchdog took the joker and the
  // check failed at random (seeds 6, 12, 22). With the row full a joker ranks last.
  // The auto-pick also takes a weapon level before a NEW card (balance review 2026-11),
  // so the weapons held are maxed here. A maxed weapon makes its partner card EVOLVES NOW,
  // which the auto-pick ranks first (that failed this check on 11 seeds in 24), so they are
  // evolved too: then nothing in the draft outranks the NEW card.
  const fullJokerRow = () => {
    st.jokerSlots = 2; st.player.jokers = ['rime', 'ignite'];
    for (const w of st.weapons) {
      w.level = WEAPON_MAX_LEVEL;
      const def = EVOLUTION_DEFS[w.type];
      if (def && !w.evolutionId) w.evolutionId = def.id;
    }
  };
  fullJokerRow();
  st.unattended = true;
  T.draftAuto.toggle();                    // OFF
  assert.equal(T.draftAuto.on, false);
  const offs = draft();
  assert.ok(offs.some(x => x.kitNew));
  h.pump(STALL * 60 - 60);
  assert.equal(st.mode, 'draft'); assert.equal(st.kitRedeal, false, 'held until the stall limit');
  h.pump(90);
  assert.equal(st.kitRedeal, true, 'the watchdog took the NEW card (nothing ranks above it)');
  assert.equal(st.mode, 'draft');
  h.pump(STALL * 60 - 60);
  assert.equal(st.mode, 'draft', 'the deal again waits its own full window');
  h.pump(90);
  assert.notEqual(st.mode, 'draft', 'then the watchdog takes a card');
  // Someone watching takes the NEW card late (5 s before the limit): the deal
  // again is a new draft, with the full window, not the 5 s left over.
  kitRun(['BEAM', 'ORBIT', 'ZAP']);
  fullJokerRow();
  st.unattended = true;
  assert.ok(draft().some(x => x.kitNew));
  h.pump((STALL - 5) * 60);
  pickWhere(x => x.kitNew);
  assert.equal(st.kitRedeal, true);
  h.pump((STALL - 1) * 60);
  assert.equal(st.mode, 'draft', 'the deal again still waits after 29 s');
  h.pump(90);
  assert.notEqual(st.mode, 'draft', 'then the watchdog takes a card');
  T.draftAuto.toggle();                    // ON
  st.unattended = false;
});

S.check('LOADOUT on a phone: short rows with small art (so BACK stays on screen); full art on a desktop', () => {
  fresh(); own('ORBIT', 'BEAM', 'ZAP', 'SCYTHE', 'METEOR'); prof.purchased.slots = 2;
  const ov = h.elements['overlay'];
  const artW = () => {
    const c = h.elements['ov-cards'].children.find(x => (x.children || []).some(k => k.className === 'card-art'));
    return c.children.find(k => k.className === 'card-art').width;
  };
  const w0 = globalThis.window.innerWidth, h0 = globalThis.window.innerHeight;
  const sizes = [[1280, 720, false], [844, 390, true], [390, 844, true], [1280, 720, false]];
  const widths = {};
  try {
    for (const [w, hh, tight] of sizes) {
      globalThis.window.innerWidth = w; globalThis.window.innerHeight = hh;
      T.loadout.open('title');
      assert.equal(ov.classList.contains('loadout-tight'), tight, w + 'x' + hh);
      widths[tight] = artW();
    }
    assert.equal(widths[true] * 2, widths[false], 'the phone art is half size');
    T.showTitle ? T.showTitle() : T.loadout.open('title');
    globalThis.window.innerWidth = 844; globalThis.window.innerHeight = 390;
    T.loadout.open('title');
    h.key('keydown', { key: 'Escape', preventDefault() {} }); h.pump(1);
    assert.notEqual(st.mode, 'loadout');
    assert.equal(ov.classList.contains('loadout-tight'), false, 'the next screen does not inherit it');
  } finally {
    globalThis.window.innerWidth = w0; globalThis.window.innerHeight = h0;
  }
});

S.check('REPLAY TUTORIAL with a loadout: the guided drafts hold no NEW card; the first draft after it does', () => {
  kitRun(['BEAM', 'ORBIT', 'ZAP']);
  T.tut.replay(false); h.pump(2);
  assert.equal(T.tut.live, true, 'the guided run is live');
  assert.deepEqual(T.loadout.pending(), ['ORBIT', 'ZAP']);
  for (let k = 0; k < 4; k++) {
    assert.ok(!draft().some(x => /^wpn_/.test(x.id)), 'no NEW card in a guided draft');
    pickWhere(x => true);
  }
  const far = performance.now() + 1e6;
  T.tut.skip(far); T.tut.skip(far + 1);
  assert.equal(T.tut.live, false, 'the guided run is over');
  assert.ok(draft().some(x => x.kitNew), 'the next draft holds the NEW card (FIRST)');
  pickWhere(x => !x.kitNew);
});

S.done();
process.exit(0);
