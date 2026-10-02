// The draft rules that make a weapon plan pay (config.js DRAFT_PLAN), through
// the real draft and the real forge:
//   - the LEAD weapon's level-up card grants two levels;
//   - the first copy of a partner stat card levels the weapon it evolves;
//   - an evolution and a fusion raise the whole kit's damage.
// Run: node test/test_draft_plan.mjs
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';
import { DRAFT_PLAN, EVOLUTION_HP_FRAC, runBase } from '../src/config.js';
import { EVOLUTION_DEFS, evolveWeapon } from '../src/evolutions.js';
import { fusionDef } from '../src/fusions.js';
import { WEAPON_MAX_LEVEL, makeWeapon } from '../src/weapons.js';

const s = suite('test_draft_plan');

s.check('the plan rules are pinned', () => {
  assert.deepEqual(DRAFT_PLAN, { LEAD_LEVELS: 2, PARTNER_LEVELS: 1, STACK_FROM: 2, STACK_MULT: 2, EVOLUTION_KIT_DMG: 0.2, FUSION_KIT_DMG: 0.3 });
});

const h = await boot();
const T = h.T, st = h.state;
const cardsNow = () => [...h.elements['ov-cards'].children];

// A quiet run with exactly these weapons at these levels.
function kit(levels) {
  T.banners.suppressAll();
  T.startRun();
  h.pump(2);
  st.spawnTimer = 1e9; st.enemies.length = 0;
  st.weapons.length = 0;
  for (const [t, lv] of Object.entries(levels)) { const w = makeWeapon(t); w.level = lv; w.cd = 1e9; st.weapons.push(w); }
  st.player.takenStats = {};
  st.player.rules = {};
  return st.player;
}
// Redraw the draft until a card with this id is offered; returns its element.
function offer(id) {
  for (let i = 0; i < 200; i++) {
    st.mode = 'playing'; st.pendingDrafts = 1; T.openDraft();
    const el = cardsNow().find(c => c._draftOffer && c._draftOffer.id === id);
    if (el) return el;
  }
  return null;
}
const weapon = (t) => st.weapons.find(w => w.type === t);

s.check('the LEAD weapon (highest level, ties to kit order) is the only card that grants two levels', () => {
  kit({ VOLLEY: 2, BOOMERANG: 4, ORBIT: 3 });
  const lead = offer('lvl_BOOMERANG_4');
  assert.ok(lead, 'the Boomerang card was offered');
  assert.equal(lead._draftOffer.leadText, 'LEAD WEAPON: +2 levels');
  assert.ok(lead.innerHTML.includes('LEAD WEAPON: +2 levels'), 'the card says so');
  for (const c of cardsNow()) {
    if (c !== lead && c._draftOffer.id.startsWith('lvl_')) assert.equal(c._draftOffer.leadText, '', c._draftOffer.id);
  }
  lead.click();
  assert.equal(weapon('BOOMERANG').level, 6, 'two levels');
  const other = offer('lvl_ORBIT_3');
  assert.equal(other._draftOffer.leadText, '');
  other.click();
  assert.equal(weapon('ORBIT').level, 4, 'one level for a weapon that is not the lead');
  // A tie goes to kit order: the Volley leads a fresh kit.
  kit({ VOLLEY: 2, BOOMERANG: 2 });
  assert.equal(offer('lvl_VOLLEY_2')._draftOffer.leadText, 'LEAD WEAPON: +2 levels');
  assert.equal(offer('lvl_BOOMERANG_2')._draftOffer.leadText, '');
});

s.check('the lead card never overshoots the cap, and its road text reads the level it lands on', () => {
  const p = kit({ VOLLEY: 2, BOOMERANG: 7 });
  const one = offer('lvl_BOOMERANG_7');
  assert.equal(one._draftOffer.leadText, '', 'one level left: an ordinary card');
  kit({ VOLLEY: 2, BOOMERANG: 6 });
  st.player.takenStats = { dmg: 1 };   // Whetstone, the Boomerang's partner
  const two = offer('lvl_BOOMERANG_6');
  assert.equal(two._draftOffer.leadText, 'LEAD WEAPON: +2 levels');
  assert.equal(two._draftOffer.evoReady, true, 'two levels reach Lv 8 with the partner owned');
  assert.ok(/EVOLVES NOW: Void Rang/.test(two._draftOffer.evoText), two._draftOffer.evoText);
  two.click();
  assert.equal(weapon('BOOMERANG').level, WEAPON_MAX_LEVEL);
  assert.ok(p);
});

s.check('an evolved or maxed weapon is never the lead; the next one takes over', () => {
  kit({ VOLLEY: 3, BOOMERANG: 8, ORBIT: 2 });
  assert.equal(offer('lvl_VOLLEY_3')._draftOffer.leadText, 'LEAD WEAPON: +2 levels', 'a maxed Boomerang hands the lead on');
});

s.check('ONE OF EACH pays its own bonus level instead of the lead bonus', () => {
  kit({ VOLLEY: 2, BOOMERANG: 4 });
  st.player.rules = { once: true };
  const c = offer('lvl_BOOMERANG_4');
  assert.equal(c._draftOffer.leadText, '');
  c.click();
  assert.equal(weapon('BOOMERANG').level, 6, 'the card level plus the rule\'s bonus level');
});

s.check('the first copy of a partner card levels the weapon it evolves, and says so; a second copy does not', () => {
  const p = kit({ VOLLEY: 2, BOOMERANG: 3 });
  const dmg0 = p.stats.damage;
  const card = offer('dmg');   // Whetstone: the Boomerang's partner
  assert.ok(card, 'Whetstone was offered');
  assert.ok(/evolves Boomerang · \+1 level: Boomerang/.test(card._draftOffer.evoText), card._draftOffer.evoText);
  card.click();
  assert.equal(weapon('BOOMERANG').level, 4, 'the partner card gave the Boomerang a level');
  assert.equal(weapon('VOLLEY').level, 2, 'and nothing to a weapon it is not the partner of');
  assert.ok(p.stats.damage > dmg0, 'on top of its own effect');
  const again = offer('dmg');
  assert.equal(again._draftOffer.evoText, '', 'an owned partner card makes no second promise');
  again.click();
  assert.equal(weapon('BOOMERANG').level, 4, 'a second copy gives no level');
});

s.check('a partner card for a maxed weapon opens the evolution instead of levelling it', () => {
  kit({ VOLLEY: 2, BOOMERANG: 8 });
  const card = offer('dmg');
  assert.ok(/^EVOLVES NOW: Void Rang$/.test(card._draftOffer.evoText), card._draftOffer.evoText);
  card.click();
  assert.equal(weapon('BOOMERANG').level, 8);
  for (let i = 0; i < 40 && st.mode !== 'evolve'; i++) h.pump(1, () => { st.player.hp = st.player.stats.maxHp; });
  assert.equal(st.mode, 'evolve');
});

s.check('an evolution raises the whole kit\'s damage and restores the hero; the card says so', () => {
  const p = kit({ VOLLEY: 2, BOOMERANG: 8 });
  p.takenStats = { dmg: 1 };
  const base = runBase(p).damage, hp0 = p.stats.maxHp, dmg0 = p.stats.damage;
  p.hp = 1;
  for (let i = 0; i < 6 && st.mode === 'playing'; i++) h.pump(1);
  assert.equal(st.mode, 'evolve');
  const card = cardsNow()[0];
  assert.ok(card.innerHTML.includes('whole kit +20% damage'), card.innerHTML);
  card.click();
  assert.ok(Math.abs(p.stats.damage - (dmg0 + DRAFT_PLAN.EVOLUTION_KIT_DMG * base)) < 1e-9, 'kit damage +20% of the run\'s starting damage');
  assert.ok(Math.abs(p.stats.maxHp - (hp0 + EVOLUTION_HP_FRAC * runBase(p).maxHp)) < 1e-9);
  assert.equal(p.hp, p.stats.maxHp, 'full health');
});

s.check('a fusion raises the kit\'s damage by more than an evolution', () => {
  const p = kit({ VOLLEY: 2 });
  for (const t of ['SCYTHE', 'ZAP']) {
    const w = makeWeapon(t); w.level = WEAPON_MAX_LEVEL; w.cd = 1e9;
    evolveWeapon(w, { [EVOLUTION_DEFS[t].partner]: 1 });
    st.weapons.push(w);
  }
  const dmg0 = p.stats.damage;
  for (let i = 0; i < 6 && st.mode === 'playing'; i++) h.pump(1);
  assert.equal(st.mode, 'evolve');
  const card = cardsNow().find(c => c._fusionOffer === 'THRESHING_STORM');
  assert.ok(card.innerHTML.includes('whole kit +30% damage'), card.innerHTML);
  card.click();
  assert.ok(Math.abs(p.stats.damage - (dmg0 + DRAFT_PLAN.FUSION_KIT_DMG * runBase(p).damage)) < 1e-9);
  assert.ok(DRAFT_PLAN.FUSION_KIT_DMG > DRAFT_PLAN.EVOLUTION_KIT_DMG);
  assert.ok(fusionDef('THRESHING_STORM'));
});
s.check('a repeat copy of a common stat card counts double; single copies of different cards do not', () => {
  const p = kit({ VOLLEY: 2 });
  const base = runBase(p).damage;
  let d = p.stats.damage;
  const first = offer('dmg');
  assert.equal(first._draftOffer.stackText, '', 'a first copy is an ordinary card');
  first.click();
  assert.ok(Math.abs(p.stats.damage - (d + 0.15 * base)) < 1e-9, 'first Whetstone: +15%');
  d = p.stats.damage;
  const second = offer('dmg');
  assert.equal(second._draftOffer.stackText, 'STACKED: counts double');
  assert.ok(second.innerHTML.includes('STACKED: counts double'), 'the card says so');
  second.click();
  assert.ok(Math.abs(p.stats.damage - (d + 0.30 * base)) < 1e-9, 'second Whetstone: +30%');
  assert.equal(p.statCopies.dmg, 2);
  // A different card is a first copy again.
  const hp0 = p.stats.maxHp;
  const heart = offer('hp');
  assert.equal(heart._draftOffer.stackText, '');
  heart.click();
  assert.equal(p.stats.maxHp, hp0 + 25);
  // Weapon cards never stack this way.
  const lv = offer('lvl_VOLLEY_' + weapon('VOLLEY').level);
  assert.equal(lv._draftOffer.stackText, undefined);
});
s.done();
