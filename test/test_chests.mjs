// HORDES — unit tests for src/chests.js (node, no DOM).
// Deterministic: all randomness driven by a sequence-stub rng that throws if
// the module draws more values than the test expects (catches rng-call drift).
import assert from 'node:assert';
import { CHESTS, EVOLUTION_TOKENS, pickRarity, isEliteish,
         maybeSpawnChest, rollContents, tickChests } from '../src/chests.js';
import { makePlayer, makeEnemy } from '../src/entities.js';
import { CONFIG as C } from '../src/config.js';

const seq = (vals) => {
  let i = 0;
  return () => {
    if (i >= vals.length) throw new Error(`rng exhausted (call ${i + 1}, have ${vals.length})`);
    return vals[i++];
  };
};

const makeState = () => ({
  player: makePlayer(),
  enemies: [],
  chests: [],
  effects: [],
  time: 30,
});

// ---- weights sum correctly ----
{
  const sum = Object.values(CHESTS.WEIGHTS).reduce((a, b) => a + b, 0);
  assert.strictEqual(sum, 100, `WEIGHTS must sum to 100, got ${sum}`);
  assert.ok(Object.keys(CHESTS.WEIGHTS).length === 4, 'expected 4 rarities');

  // Band edges: cumulative bands are common 0-60, rare 60-85, legendary 85-90,
  // gamble 90-100.
  assert.strictEqual(pickRarity(seq([0])), 'common');
  assert.strictEqual(pickRarity(seq([0.599])), 'common');
  assert.strictEqual(pickRarity(seq([0.60])), 'rare');
  assert.strictEqual(pickRarity(seq([0.849])), 'rare');
  assert.strictEqual(pickRarity(seq([0.85])), 'legendary');
  assert.strictEqual(pickRarity(seq([0.899])), 'legendary');
  assert.strictEqual(pickRarity(seq([0.90])), 'gamble');
  assert.strictEqual(pickRarity(seq([0.999999])), 'gamble');
  console.log('ok: weights sum to 100 and rarity bands are correct');
}

// ---- elite-ish detection & spawn gating ----
{
  const st = makeState();
  const elite = makeEnemy(10, 10, 120); // t=120 -> wave 4 -> maxHp 28.8 >= 18
  assert.ok(isEliteish(elite), 'high-hp enemy should be elite-ish');
  assert.ok(isEliteish({ ...makeEnemy(0, 0, 0), elite: true }), 'flagged enemy should be elite-ish');
  assert.ok(!isEliteish(makeEnemy(0, 0, 0)), 'base enemy should not be elite-ish');
  assert.ok(!isEliteish(null), 'null is not elite-ish');

  // Non-elite never spawns.
  assert.strictEqual(maybeSpawnChest(st, makeEnemy(5, 5, 0), seq([0])), null);
  // Elite but roll fails (>= DROP_CHANCE).
  assert.strictEqual(maybeSpawnChest(st, elite, seq([0.999])), null);
  // Elite + winning roll -> chest on the field at the kill site.
  const chest = maybeSpawnChest(st, elite, seq([0.0]));
  assert.ok(chest, 'elite kill with good roll should spawn a chest');
  assert.strictEqual(chest.x, 10); assert.strictEqual(chest.y, 10);
  assert.strictEqual(st.chests.length, 1);

  // MAX_ACTIVE cap.
  for (let i = 0; i < CHESTS.MAX_ACTIVE + 2; i++) {
    maybeSpawnChest(st, elite, seq([0.0]));
  }
  assert.strictEqual(st.chests.length, CHESTS.MAX_ACTIVE, 'chest count must respect MAX_ACTIVE');
  console.log('ok: spawn gating (elite-ish check, roll, cap)');
}

// ---- rollContents: each rarity ----
{
  // common: 1 rarity roll + 1 upgrade pick.
  const c = rollContents(makeState(), seq([0.0, 0.0]));
  assert.strictEqual(c.rarity, 'common');
  assert.strictEqual(c.upgrades.length, 1, 'common = 1 upgrade');
  assert.deepStrictEqual(c.potions, { hp: 0, mp: 0 });
  assert.strictEqual(c.tokenOptions.length, 0);

  // rare: rarity + upgrade + potion-kind roll (0.7 -> mp).
  const r = rollContents(makeState(), seq([0.7, 0.0, 0.7]));
  assert.strictEqual(r.rarity, 'rare');
  assert.strictEqual(r.upgrades.length, 1);
  assert.deepStrictEqual(r.potions, { hp: 0, mp: 1 }, 'rare = upgrade + 1 potion');
  // and the hp side of the potion coin (0.2 -> hp)
  const r2 = rollContents(makeState(), seq([0.7, 0.0, 0.2]));
  assert.deepStrictEqual(r2.potions, { hp: 1, mp: 0 });

  // legendary: 2 distinct upgrades + full token menu.
  const l = rollContents(makeState(), seq([0.86, 0.0, 0.0]));
  assert.strictEqual(l.rarity, 'legendary');
  assert.strictEqual(l.upgrades.length, 2, 'legendary = 2 upgrades');
  assert.notStrictEqual(l.upgrades[0].id, l.upgrades[1].id, 'legendary upgrades must be distinct');
  assert.deepStrictEqual(l.tokenOptions, EVOLUTION_TOKENS, 'legendary = choice of evolution token');
  assert.deepStrictEqual(l.potions, { hp: 0, mp: 0 });
  console.log('ok: rollContents common/rare/legendary');
}

// ---- gamble branch: both outcomes ----
{
  // Win: rarity(0.95) + coin(0.3 < 0.5) + 2 upgrade picks.
  const win = rollContents(makeState(), seq([0.95, 0.3, 0.1, 0.9]));
  assert.strictEqual(win.rarity, 'gamble');
  assert.strictEqual(win.gambleWin, true, 'coin < 0.5 should win the gamble');
  assert.strictEqual(win.upgrades.length, CHESTS.GAMBLE_WIN_UPGRADES, 'gamble win = big reward (2 upgrades)');
  assert.deepStrictEqual(win.potions, { hp: 1, mp: 1 }, 'gamble win refills both potions');

  // Lose: rarity(0.95) + coin(0.7 >= 0.5) — exactly 2 rng draws, no more.
  const lose = rollContents(makeState(), seq([0.95, 0.7]));
  assert.strictEqual(lose.rarity, 'gamble');
  assert.strictEqual(lose.gambleWin, false, 'coin >= 0.5 should lose the gamble');
  assert.strictEqual(lose.upgrades.length, 0, 'gamble loss grants nothing');
  console.log('ok: gamble branch win + lose');
}

// ---- chest opens within pickup radius ----
{
  const st = makeState();
  const before = { damage: st.player.stats.damage, potions: { ...st.player.potions } };
  st.chests.push({ id: 1, x: st.player.x + CHESTS.PICKUP_RADIUS - 1, y: st.player.y, age: 0 });

  // Force common + first upgrade (index 0 = 'dmg' at r=0 with 7 in pool).
  const events = tickChests(st, 0.016, seq([0.0, 0.0]));
  assert.strictEqual(st.chests.length, 0, 'chest should be consumed on open');
  const opened = events.find(e => e.kind === 'chestOpened');
  assert.ok(opened, 'open should emit chestOpened event');
  assert.strictEqual(opened.rarity, 'common');
  assert.ok(st.player.stats.damage > before.damage, 'common upgrade should apply to the player');

  // Out of radius: chest stays put and ages.
  const st2 = makeState();
  st2.chests.push({ id: 2, x: st2.player.x + 500, y: st2.player.y, age: 0 });
  const ev2 = tickChests(st2, 0.016, seq([])); // zero rng draws: nothing should roll
  assert.strictEqual(st2.chests.length, 1, 'far chest must not open');
  assert.strictEqual(st2.chests[0].age, 0.016, 'chest should age while idle');
  assert.strictEqual(ev2.length, 0);

  // Expiry: past LIFETIME it despawns with an event, never opening.
  st2.chests[0].age = CHESTS.LIFETIME;
  const ev3 = tickChests(st2, 0.016, seq([]));
  assert.strictEqual(st2.chests.length, 0, 'expired chest should despawn');
  assert.ok(ev3.some(e => e.kind === 'chestExpired'));
  console.log('ok: open in radius / idle aging / expiry');
}

// ---- gamble loss via tickChests spawns the mini horde ----
{
  const st = makeState();
  st.chests.push({ id: 3, x: st.player.x, y: st.player.y, age: 0 });
  const enemiesBefore = st.enemies.length;
  // rarity -> gamble (0.95), coin -> lose (0.7).
  const events = tickChests(st, 0.016, seq([0.95, 0.7]));
  assert.ok(events.some(e => e.kind === 'chestOpened' && e.rarity === 'gamble'));
  const horde = events.find(e => e.kind === 'gambleHorde');
  assert.ok(horde, 'gamble loss should emit gambleHorde event');
  assert.strictEqual(horde.count, CHESTS.GAMBLE_HORDE_COUNT);
  assert.strictEqual(st.enemies.length, enemiesBefore + CHESTS.GAMBLE_HORDE_COUNT,
    'gamble loss should ring the player with a mini horde');
  for (const e of st.enemies.slice(enemiesBefore)) {
    const d = Math.hypot(e.x - st.player.x, e.y - st.player.y);
    assert.ok(Math.abs(d - CHESTS.GAMBLE_HORDE_RADIUS) < 2, `horde enemy should sit on the ring (d=${d})`);
  }
  console.log('ok: gamble loss spawns mini horde around player');
}

// ---- legendary via tickChests: 2 upgrades applied + token offer event ----
{
  const st = makeState();
  const dmgBefore = st.player.stats.damage;
  st.chests.push({ id: 4, x: st.player.x, y: st.player.y, age: 0 });
  // rarity -> legendary (0.86), then two upgrade picks.
  const events = tickChests(st, 0.016, seq([0.86, 0.0, 0.0]));
  assert.ok(events.some(e => e.kind === 'chestOpened' && e.rarity === 'legendary'));
  const offer = events.find(e => e.kind === 'tokenOffer');
  assert.ok(offer, 'legendary should emit a tokenOffer event');
  assert.deepStrictEqual(offer.options, EVOLUTION_TOKENS);
  // 2 upgrades applied: 'dmg' + 'rate' (indices 0 and 0-of-6-remaining -> id order
  // guarantees two distinct applies; verify both stat effects landed).
  assert.ok(st.player.stats.damage > dmgBefore, 'first legendary upgrade applied');
  assert.ok(st.player.stats.cooldown < C.WEAPON.COOLDOWN, 'second legendary upgrade applied');
  console.log('ok: legendary grants 2 upgrades + evolution token offer');
}

console.log('CHESTS TESTS PASSED');
