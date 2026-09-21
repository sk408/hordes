// HORDES — weapon registry shape guard (2026-09-21: a dev-branch edit replaced
// the NOVA_PULSE registry entry with a params stub {DMG, RADIUS}, so every
// nova pulse run crashed with `def.update is not a function`. Caught by the
// owner in a dev run, not by the suite — this test exists so it never recurs:
// every WEAPON_TYPES entry must carry id + name + a callable update.
import assert from 'node:assert';
import { WEAPON_TYPES } from '../src/weapons.js';

{
  const ids = Object.keys(WEAPON_TYPES);
  assert.ok(ids.length >= 8, 'registry holds all archetypes (got ' + ids.length + ')');
  for (const id of ids) {
    const def = WEAPON_TYPES[id];
    assert.equal(def.id, id, id + ' carries its own id');
    assert.equal(typeof def.name, 'string', id + ' carries a name');
    assert.equal(typeof def.update, 'function', id + ' carries a callable update');
  }
  console.log('weapon registry: ' + ids.length + ' entries, all with id/name/update');
}
