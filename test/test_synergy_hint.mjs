// HORDES — WAVE-26 FEATURE 2: DRAFT SYNERGY HINTS.
// Run: node test/test_synergy_hint.mjs
//
// The draft is the game's main knowledge surface. A hint may appear ONLY when
// the pick creates or feeds a pair the run ACTUALLY implements — the hint is
// derived from synergies.js (single source of truth), never from a hand-written
// rule. Cards with no real synergy must render NO hint at all.
import assert from 'node:assert/strict';
import { SYNERGIES, detectSynergies } from '../src/synergies.js';
import { WEAPON_NAMES } from '../src/weapons.js';
import { makeWeapon } from '../src/weapons.js';
import { boot, suite } from './_harness.mjs';

const S = suite('wave-26 draft synergy hints');
const { T, state, elements } = await boot({
  storage: [['hordes_onboarded', '1']],
});

function setWeapons(types) {
  state.weapons = types.map(t => makeWeapon(t));
  T.refreshSynergies();
}

// ---- negatives first: silence when there is nothing real to say --------------
S.check('a new-weapon card with no owned partner shows NOTHING', () => {
  setWeapons(['VOLLEY']);                       // ZAP's partners: BEAM, SCYTHE
  assert.equal(T.synergyHintForCard({ id: 'wpn_ZAP' }), null);
  assert.equal(T.synergyHintForCard({ id: 'wpn_MINE' }), null);   // partner NOVA_PULSE/BEAM
  assert.equal(T.synergyHintForCard({ id: 'wpn_SEEKER' }), null); // partner BOOMERANG
});
S.check('stat cards and unknown ids never get a hint', () => {
  setWeapons(['VOLLEY', 'BEAM']);
  for (const id of ['dmg', 'hp', 'multi', 'pierce', '', 'lvl_NOPE_3', 'wpn_FAKE']) {
    assert.equal(T.synergyHintForCard({ id }), null, 'no hint for ' + JSON.stringify(id));
  }
  assert.equal(T.synergyHintForCard(null), null);
});
S.check('a level-up card with no LIVE pair shows NOTHING', () => {
  setWeapons(['VOLLEY', 'BEAM']);               // no synergy active
  assert.equal(state.synergies.length, 0, 'no live synergy in this build');
  assert.equal(T.synergyHintForCard({ id: 'lvl_BEAM_2' }), null);
});

// ---- positives: only real, code-backed pairs --------------------------------
S.check('a new-weapon card names the partner it would pair with', () => {
  setWeapons(['VOLLEY', 'BEAM']);
  const hint = T.synergyHintForCard({ id: 'wpn_ZAP' });
  assert.ok(hint, 'hint present');
  assert.ok(/PAIRS WITH/.test(hint), 'reads as a pairing (' + hint + ')');
  const up = hint.toUpperCase();
  assert.ok(up.includes(WEAPON_NAMES.BEAM.toUpperCase()), 'names the OWNED partner');
  assert.ok(up.includes('SUPERCONDUCTOR'), 'names the real synergy');
});
S.check('the level-up hint tracks the LIVE synergy, not a guess', () => {
  setWeapons(['VOLLEY', 'ZAP', 'BEAM']);
  assert.equal(state.synergies.length, 1, 'Superconductor is live');
  const hint = T.synergyHintForCard({ id: 'lvl_ZAP_3' });
  assert.ok(hint && hint.includes('SUPERCONDUCTOR'), 'level-up feeds the live pair (' + hint + ')');
  assert.equal(T.synergyHintForCard({ id: 'lvl_VOLLEY_3' }), null,
    'an unrelated weapon still shows nothing');
});
S.check('losing the partner silences the hint again (derived, never sticky)', () => {
  setWeapons(['VOLLEY', 'ZAP', 'BEAM']);
  assert.ok(T.synergyHintForCard({ id: 'lvl_ZAP_3' }));
  setWeapons(['VOLLEY', 'ZAP']);                 // BEAM dropped
  assert.equal(state.synergies.length, 0, 'pair deactivated');
  assert.equal(T.synergyHintForCard({ id: 'lvl_ZAP_3' }), null, 'hint gone');
});
S.check('EVERY hint the helper can emit corresponds to a real SYNERGIES entry', () => {
  // Brute force over every archetype x every owned-set of size <= 2: the hint
  // must always name a synergy name from the table, and its partner must be
  // one of that entry's pair members.
  const types = Object.keys(WEAPON_NAMES);
  const names = new Set(SYNERGIES.map(s => s.name));
  let checked = 0;
  for (const owned of types) {
    for (const cand of types) {
      if (cand === owned) continue;
      setWeapons([owned]);
      const hint = T.synergyHintForCard({ id: 'wpn_' + cand });
      if (!hint) continue;
      checked++;
      const entry = SYNERGIES.find(s => s.name.toUpperCase() === hint.split('\u00b7')[1].trim().toUpperCase());
      assert.ok(names.has(entry && entry.name), 'hint names a real synergy: ' + hint);
      assert.ok(entry.pair.includes(cand) && entry.pair.includes(owned),
        'and only for a pair the player can actually complete: ' + hint);
      // …and the pair must really activate once both are owned.
      setWeapons([owned, cand]);
      assert.ok(detectSynergies(state.weapons).some(s => s.name === entry.name),
        'the promised pair actually activates');
    }
  }
  assert.ok(checked >= 4, 'the sweep exercised real hints (' + checked + ')');
});

// ---- integration: the DRAFT renders the hint, and only where it is real ------
S.check('the draft card HTML carries the hint line only for a real pair', () => {
  setWeapons(['VOLLEY', 'BEAM']);
  // Deterministic draw: weight walk always lands on the head of the pool.
  const realRandom = Math.random;
  Math.random = () => 0;
  try {
    T.openDraft();
  } finally {
    Math.random = realRandom;
  }
  const cards = Array.from(elements['ov-cards'].children);
  assert.ok(cards.length === 3, 'three draft cards');
  const withSyn = cards.filter(c => (c.innerHTML || '').includes('class="syn"'));
  // Every rendered hint must quote a real synergy name.
  const names = SYNERGIES.map(s => s.name.toUpperCase());
  for (const c of withSyn) {
    assert.ok(names.some(n => c.innerHTML.includes(n)),
      'rendered hint names a real synergy: ' + c.innerHTML);
  }
  // The hint is a SEPARATE line — the card's own name/desc are untouched, so the
  // smoke probes ('NEW WEAPON', 'UP' labels) keep working.
  for (const c of cards) {
    assert.ok(/class="(name|desc|key)"|class="syn"/.test(c.innerHTML), 'card structure intact');
  }
  T.startRun();   // leave the draft
});

S.done();
