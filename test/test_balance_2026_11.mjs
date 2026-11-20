// The balance review of 2026-11 (docs/BALANCE_REVIEW_2026-11.md): the numbers and
// rules it changed, pinned so a later edit has to mean it.
//   A1. The Maw is a fight: 7.5M hp, and the bar shows the same pool.
//   A2. The game's own auto-pick drafts toward evolutions.
//   A4. BUY NEXT names a weapon only while there is a free weapon slot.
// Run: node test/test_balance_2026_11.mjs
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';
import { CONFIG as C } from '../src/config.js';
import { DISPLAY_HP } from '../src/final_boss.js';
import { KIT_OFFER } from '../src/config.js';
import { readFileSync } from 'node:fs';
import * as META from '../src/meta.js';
import { STORAGE_KEY } from '../src/save.js';

const S = suite('test_balance_2026_11');

S.check('A1: the Maw has 7.5M hp, the window stays 90 s, and the bar shows the same pool', () => {
  assert.equal(C.RUN.MAW_HP, 7_500_000, 'at 250k every hero who reached it killed it in about a second');
  assert.equal(DISPLAY_HP, C.RUN.MAW_HP, 'final_boss DISPLAY_HP == CONFIG.RUN.MAW_HP');
  assert.equal(C.RUN.MAW_WINDOW, 90, 'a weak build sees it withdraw, it is never a wall');
});

const h = await boot({ storage: [['hordes_onboarded', '1']] });
const T = h.T, st = h.state;

S.check('A2: the auto-pick ranks joker, evolves-now, lead, weapon level, NEW, partner stat, RARE, first', () => {
  const pick = T.auto.pickIndex;
  T.startRun(); h.pump(1);
  st.player.jokers = []; st.jokerSlots = 2; st.kitFreeUsed = KIT_OFFER.FREE;
  const plain = { id: 'speed' };
  const rare = { id: 'crit', tier: 'RARE' };
  const partner = { id: 'pierce', evoText: 'evolves Volley' };
  const refill = { id: 'wpn_SEEKER', kitNew: true, refill: true, evoText: 'evolves with x' };
  const nw = { id: 'wpn_ORBIT', kitNew: true, evoText: 'evolves with x' };
  const lvl = { id: 'lvl_BOOMERANG_3' };
  const lead = { id: 'lvl_VOLLEY_4', leadText: 'LEAD WEAPON: +2 levels' };
  const evo = { id: 'lvl_VOLLEY_7', evoReady: true, evoText: 'EVOLVES NOW: x' };
  const joker = { id: 'j', tier: 'JOKER' };
  const order = [joker, evo, lead, lvl, nw, partner, rare, plain];
  for (let i = 0; i < order.length - 1; i++) {
    const rest = order.slice(i + 1);
    assert.equal(pick([...rest, order[i]]), rest.length, order[i].id + ' ranks above ' + rest.map(o => o.id).join(', '));
  }
  assert.equal(pick([plain, { id: 'agility' }]), 0, 'a tie keeps the first card');
  assert.equal(pick([rare, refill]), 1, 'a refill NEW card is a NEW card (AUTO_RANK), not a partner stat card');
  st.player.jokers = [{ id: 'a' }, { id: 'b' }];
  assert.equal(pick([joker, plain]), 1, 'a full joker row: the joker is the last pick');
  st.player.jokers = []; st.kitFreeUsed = 0;
  assert.equal(pick([nw, lvl]), 1, 'even the free NEW card waits behind a weapon level (measured: better)');
});

S.check('A4: BUY NEXT names a weapon only while the weapons owned are fewer than the weapon slots', () => {
  const p = META.makeProfile();
  assert.deepEqual(p.unlockedWeapons, ['VOLLEY', 'BOOMERANG'], 'a fresh profile: two weapons, three slots');
  // The tutorial's shop lesson (a fresh profile after run 1) points where it did.
  p.gold = 520;
  const fresh = META.bestNextPurchase(p);
  p.purchased.slots = 3;   // all the room there is: the rule as it was before
  assert.equal(META.bestNextPurchase(p).id, fresh.id, 'the same row as before the change: ' + fresh.id);
  p.purchased.slots = 0;
  // A third weapon fills the slots: damage and health come before a fourth.
  p.unlockedWeapons.push('ORBIT');
  p.gold = 1e9;
  p.purchased.hp = 3; p.purchased.dmg = 3;
  const full = META.bestNextPurchase(p);
  assert.ok(['hp', 'dmg'].includes(full.id), 'core is Vitality or Forged Edge, not a weapon: ' + full.id);
  // A bought slot makes room again: the cheapest weapon not owned is a core step.
  p.purchased.slots = 1;
  p.purchased.hp = META.SHOP_BY_ID.hp.maxLevel; p.purchased.dmg = META.SHOP_BY_ID.dmg.maxLevel;
  assert.ok(/^weapon_/.test(META.bestNextPurchase(p).id), 'room for a fourth weapon');
  p.purchased.slots = 0;
  assert.ok(!/^weapon_/.test(META.bestNextPurchase(p).id), 'no room: the cheapest other row');
});

S.done();
process.exit(0);
