// HORDES — unit tests for src/synergies.js (node, no DOM, no framework).
import assert from 'node:assert';
import { SYNERGIES, detectSynergies, describeSynergy } from '../src/synergies.js';
import { WEAPON_NAMES } from '../src/weapons.js';

const ALL = Object.keys(WEAPON_NAMES);   // the 9 archetypes

// ---------- table shape ----------
{
  assert.ok(SYNERGIES.length >= 6 && SYNERGIES.length <= 8, '6..8 pair passives');
  const seenPairs = new Set();
  const covered = new Set();
  for (const s of SYNERGIES) {
    assert.strictEqual(s.pair.length, 2, `${s.name} is a PAIR`);
    const [a, b] = s.pair;
    assert.notStrictEqual(a, b, `${s.name} no self-pairs`);
    assert.ok(WEAPON_NAMES[a], `${s.name} pair[0] '${a}' is a real archetype`);
    assert.ok(WEAPON_NAMES[b], `${s.name} pair[1] '${b}' is a real archetype`);
    const key = [a, b].sort().join('+');
    assert.ok(!seenPairs.has(key), `pair ${key} unique (no duplicate pairing)`);
    seenPairs.add(key);
    covered.add(a); covered.add(b);
    assert.ok(s.name.length > 3, `${s.name} has a name`);
    assert.ok(s.desc.length > 20, `${s.name} has flavor text`);
    // flags are PLAIN DATA: booleans/numbers only, never functions/objects.
    for (const [f, v] of Object.entries(s.flags)) {
      assert.ok(['boolean', 'number'].includes(typeof v), `${s.name} flag '${f}' is plain data`);
    }
    assert.ok(Object.keys(s.flags).length >= 1, `${s.name} carries at least one flag`);
  }
  for (const t of ALL) {
    assert.ok(covered.has(t), `archetype ${t} appears in at least one pairing`);
  }
  console.log('ok: table shape — 6..8 unique pairs, no self-pairs, all archetypes covered, plain-data flags');
}

// ---------- detection: both present vs one present ----------
{
  // VOLLEY+ORBIT both present -> exactly ORBITAL VOLLEY (plus nothing else:
  // ORBIT also pairs with NOVA_PULSE, which is absent here).
  let act = detectSynergies(['VOLLEY', 'ORBIT']);
  assert.strictEqual(act.length, 1);
  assert.strictEqual(act[0].name, 'Orbital Volley');

  // one partner only -> inactive.
  for (const t of ALL) {
    const solo = detectSynergies([t]);
    assert.strictEqual(solo.length, 0, `solo ${t} activates nothing`);
  }

  // richer loadout: NOVA_PULSE + ORBIT + MINE + BEAM + ZAP
  // -> Gravity Well (NOVA+ORBIT), Chain Reaction (NOVA+MINE),
  //    Fire Focus (MINE+BEAM), Superconductor (ZAP+BEAM)
  act = detectSynergies(['NOVA_PULSE', 'ORBIT', 'MINE', 'BEAM', 'ZAP']);
  assert.deepStrictEqual(act.map(s => s.name),
    ['Superconductor', 'Chain Reaction', 'Gravity Well', 'Fire Focus']);
  console.log('ok: detection — both-present activates, one-present never does');
}

// ---------- no duplicate activation + input normalization ----------
{
  // duplicate weapons in the list must not double-activate a synergy.
  const act = detectSynergies(['ZAP', 'BEAM', 'ZAP', 'BEAM', 'BEAM']);
  assert.strictEqual(act.length, 1);
  assert.strictEqual(act[0].name, 'Superconductor');

  // weapon INSTANCES (objects with .type) are accepted like bare strings.
  const byObj = detectSynergies([{ type: 'VOLLEY' }, { type: 'ORBIT', level: 8 }]);
  assert.deepStrictEqual(byObj.map(s => s.name), ['Orbital Volley']);

  // unknown/garbage types are ignored, not fatal.
  assert.strictEqual(detectSynergies(['GARBAGE', 'ORBIT', null, 7]).length, 0);
  assert.deepStrictEqual(detectSynergies(), []);
  assert.deepStrictEqual(detectSynergies(null), []);
  console.log('ok: duplicates single-fire; instances + garbage input normalized');
}

// ---------- order stability ----------
{
  // Result order follows TABLE order regardless of input order.
  const a = detectSynergies(['NOVA_PULSE', 'ORBIT', 'MINE', 'BEAM', 'ZAP']);
  const b = detectSynergies(['ZAP', 'MINE', 'BEAM', 'NOVA_PULSE', 'ORBIT']);
  assert.deepStrictEqual(a, b, 'input order never changes the result');
  // and the entries are the table refs themselves (hb1 can compare identity).
  assert.strictEqual(a[0], SYNERGIES.find(s => s.name === 'Superconductor'));
  console.log('ok: detection is order-stable (table order) and returns table refs');
}

// ---------- describeSynergy: HUD/draft cards ----------
{
  // by table entry
  const e = SYNERGIES.find(s => s.name === 'Gravity Well');
  let card = describeSynergy(e);
  assert.strictEqual(card.name, 'Gravity Well');
  assert.deepStrictEqual(card.pair, ['NOVA_PULSE', 'ORBIT']);
  assert.deepStrictEqual(card.pairNames, [WEAPON_NAMES.NOVA_PULSE, WEAPON_NAMES.ORBIT]);
  assert.strictEqual(card.flags.novaPull, 0.25);

  // by pair array (either direction)
  assert.strictEqual(describeSynergy(['ORBIT', 'NOVA_PULSE']).name, 'Gravity Well');
  assert.strictEqual(describeSynergy(['NOVA_PULSE', 'ORBIT']).name, 'Gravity Well');

  // by name
  assert.strictEqual(describeSynergy('Superconductor').flags.zapExtraForks, 1);

  // flags are copies — mutating a card never touches the table.
  card.flags.novaPull = 99;
  assert.strictEqual(e.flags.novaPull, 0.25);

  // unknown input renders nothing.
  assert.strictEqual(describeSynergy('NOPE'), null);
  assert.strictEqual(describeSynergy(['VOLLEY', 'ZAP']), null, 'unpaired combination');
  assert.strictEqual(describeSynergy(null), null);
  console.log('ok: describeSynergy cards (entry/pair/name), flag copies, null on unknown');
}

console.log('test_synergies: all assertions passed');
