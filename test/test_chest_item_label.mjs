// HORDES — A CHEST ITEM'S LABEL MUST NAME ITS OWN RARITY.
// Run: node test/test_chest_item_label.mjs
//
// Owner-reported (2026-09-19): "The rarity prefix is fine, but you're wrong about
// how it works right now. I'm constantly seeing items that say LEGENDARY: WORN
// COIN, LEGENDARY: WORN BOOT".
//
// THE BUG. chests.js hands out ONE ITEM PER CHEST, built at the chest band's own
// rarity — "common 98% pays a common item, the 0.02% top band pays a hand-authored
// LEGENDARY unique" — and applyContents raises a 'chestItem' event for ANY band
// that carries one. main.js then announced it with a HARDCODED prefix:
//
//     toast('LEGENDARY: ' + ev.item.name.toUpperCase(), RARITY_TINTS.LEGENDARY);
//
// which was written on the assumption that the event only ever fired for the top
// band. It fires for every band. So a common chest's own common item was announced
// as LEGENDARY — a "WORN COIN" wearing a LEGENDARY label.
//
// THE INVARIANT THIS FILE PINS: the label's rarity and the item's rarity are the
// SAME THING, whatever band rolled. That is deliberately stated as equality rather
// than as a fixed expected string, because the point is that the label can never
// disagree with the drop again — not that any particular band is likely.
//
// Driven through the REAL path: a chest placed on the player, opened by the real
// tickChests, surfaced by the real event loop.
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';

const S = suite('test_chest_item_label');

const h = await boot({ storage: [['hordes_onboarded', '1']] });
const st = h.state;
const T = h.T;
const pump = h.pump;

const RARITIES = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY'];
const chestItemToast = () => st.toasts
  .map(t => t.msg)
  .find(m => RARITIES.some(r => m.startsWith(r + ': ')));

T.startRun();
pump(2);

S.check('every chest item is announced with the ITEM\'s own rarity', () => {
  const p = st.player;
  let checked = 0;
  const seen = new Set();

  for (let attempt = 0; attempt < 60 && checked < 8; attempt++) {
    st.toasts.length = 0;
    st.itemDrops.length = 0;
    st.chests.length = 0;
    st.enemies.length = 0;              // nothing can kill the player mid-check
    st.gems.length = 0;
    st.spawnTimer = 999;                // no ambient spawns
    // A chest the player is standing on (the entity is { id, x, y, age }).
    st.chests.push({ id: 90000 + attempt, x: p.x, y: p.y, age: 0 });
    pump(3);                            // the real tickChests opens it

    const label = chestItemToast();
    const drop = st.itemDrops[0];
    if (!label || !drop || !drop.item) continue;
    const item = drop.item;

    assert.ok(RARITIES.includes(item.rarity),
      'the item carries a real rarity (' + item.rarity + ')');
    assert.ok(label.startsWith(item.rarity + ': '),
      'the label names the ITEM\'s rarity — item is ' + item.rarity +
      ' but the label said "' + label + '"');
    assert.ok(label.includes(item.name.toUpperCase()),
      'and names the item that dropped ("' + label + '" vs ' + item.name + ')');
    checked++;
    seen.add(item.rarity);
  }

  assert.ok(checked > 0, 'chest items were announced at all (' + checked + ')');
  // THE POINT OF THE FIX: the old hardcoded label was only ever right for the top
  // band. If nothing but LEGENDARY shows up here, this test cannot tell the fixed
  // code from the broken one, so say that out loud rather than pass quietly.
  assert.ok(seen.size >= 1, 'at least one rarity was exercised');
  assert.ok([...seen].some(r => r !== 'LEGENDARY'),
    'a NON-legendary chest item was announced with its own rarity — the case the ' +
    'hardcoded label got wrong (rarities seen: ' + [...seen].join(', ') + ')');
});

S.check('a common chest item is NOT labelled LEGENDARY (the reported case)', () => {
  // Direct restatement of the owner's report, so the failure names the symptom.
  const p = st.player;
  let sawCommon = false;
  for (let attempt = 0; attempt < 60 && !sawCommon; attempt++) {
    st.toasts.length = 0;
    st.itemDrops.length = 0;
    st.chests.length = 0;
    st.enemies.length = 0;
    st.gems.length = 0;
    st.spawnTimer = 999;
    st.chests.push({ id: 95000 + attempt, x: p.x, y: p.y, age: 0 });
    pump(3);
    const drop = st.itemDrops[0];
    if (!drop || !drop.item || drop.item.rarity !== 'COMMON') continue;
    sawCommon = true;
    const label = chestItemToast();
    assert.ok(label, 'the common item was announced');
    assert.ok(label.startsWith('COMMON: '),
      'a COMMON item says COMMON, not LEGENDARY ("' + label + '")');
    assert.ok(!/^LEGENDARY: /.test(label),
      'and specifically never claims LEGENDARY ("' + label + '")');
  }
  assert.ok(sawCommon, 'a common chest item was produced (the reported case)');
});

S.done();
