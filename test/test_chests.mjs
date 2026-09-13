// HORDES — unit tests for src/chests.js (node, no DOM).
// Deterministic: all randomness driven by a sequence-stub rng that throws if
// the module draws more values than the test expects (catches rng-call drift).
//
// 2026-09-13 ECONOMY RE-TIER: the contents bands are the OWNER'S LADDER
// (CHESTS.RARITY_WEIGHTS = common 98 / rare 1.7 / epic 0.2 / legendary 0.02),
// GAMBLE is no longer a rarity but its own independent 1-in-10 roll, the
// evolution token is DECOUPLED (it has its own three-channel rate in
// EVOLUTION_TOKEN and no longer rides a chest band), and the 0.02% top band
// drops a hand-authored LEGENDARY item.
//
// DRAW ORDER (pinned at the bottom of every seq): 1 gamble draw FIRST, then --
// only when it is not a gamble -- 1 rarity draw, then the band's own contents
// draws. Every stub below is written to that order, so any added or reordered
// draw in the module makes the stub throw rather than silently shift an
// assertion.
import assert from 'node:assert';
import { CHESTS, EVOLUTION_TOKENS, EVOLUTION_TOKEN, pickRarity, isEliteish,
         maybeSpawnChest, rollContents, tickChests,
         tokenChance, rollEvolutionToken } from '../src/chests.js';
import { makePlayer, makeEnemy } from '../src/entities.js';
import { CONFIG as C } from '../src/config.js';
import { LEGENDARIES } from '../src/loot.js';
import { CHEST_RARITY_LADDER } from '../src/rules.js';

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

// ---- the owner's ladder, and the bands derived from it ----
{
  const L = CHESTS.RARITY_WEIGHTS;
  const tot = Object.values(L).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(tot - 99.92) < 1e-9, `the ladder declares its raw shares (got ${tot})`);
  assert.deepStrictEqual(L, { common: 98, rare: 1.7, epic: 0.2, legendary: 0.02 },
    'the chest bands ARE the owner ladder, rung for rung');
  assert.ok(Object.keys(L).length === 4, 'expected 4 rarities');
  // GAMBLE is not a band any more: the ladder names rarities only, and it is
  // the same order rules.js's HORDE BAIT bump walks.
  assert.deepStrictEqual(CHEST_RARITY_LADDER, Object.keys(L),
    'the bump ladder is exactly the declared band order');
  assert.ok(!('gamble' in L), 'gamble is not a rarity');
  assert.strictEqual(CHESTS.GAMBLE_CHANCE, 0.10, 'the gamble keeps its own 1-in-10 roll');

  // Band edges DERIVED from the ladder, probed either side of every boundary.
  const keys = Object.keys(L);
  const edge = (i) => keys.slice(0, i).reduce((s, k) => s + L[k], 0) / tot;
  for (let i = 1; i < keys.length; i++) {
    assert.strictEqual(pickRarity(seq([edge(i) - 1e-9])), keys[i - 1],
      `just below the ${keys[i]} edge is still ${keys[i - 1]}`);
    assert.strictEqual(pickRarity(seq([edge(i) + 1e-9])), keys[i],
      `just above the ${keys[i]} edge is ${keys[i]}`);
  }
  assert.strictEqual(pickRarity(seq([0.9999999])), 'legendary', 'the top rung is reachable at max rng');
  // pickRarity is the BAND roll only -- it never yields a gamble, whatever it
  // is handed (the gamble draw lives in rollContents and is taken first).
  for (const v of [0.0, 0.5, 0.9999999]) {
    assert.notStrictEqual(pickRarity(seq([v])), 'gamble', `pickRarity(${v}) is never a gamble`);
  }
  console.log('ok: owner ladder bands (98/1.7/0.2/0.02), edges derived, gamble not a rarity');
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

// ---- rollContents: each band, and the 0.02% top band's ITEM ----
{
  const GAMBLE_MISS = 0.5;   // >= GAMBLE_CHANCE: not a gamble

  // common: gamble-miss + rarity + 1 upgrade pick.
  const c = rollContents(makeState(), seq([GAMBLE_MISS, 0.0, 0.0]));
  assert.strictEqual(c.rarity, 'common');
  assert.strictEqual(c.upgrades.length, 1, 'common = 1 upgrade');
  assert.deepStrictEqual(c.potions, { hp: 0, mp: 0 });
  assert.strictEqual(c.item, null, 'a common chest drops no equipment');

  // rare: gamble-miss + rarity + upgrade + potion-kind roll (0.7 -> mp).
  const r = rollContents(makeState(), seq([GAMBLE_MISS, 0.99, 0.0, 0.7]));
  assert.strictEqual(r.rarity, 'rare');
  assert.strictEqual(r.upgrades.length, 1);
  assert.deepStrictEqual(r.potions, { hp: 0, mp: 1 }, 'rare = upgrade + 1 potion');
  // and the hp side of the potion coin (0.2 -> hp)
  const r2 = rollContents(makeState(), seq([GAMBLE_MISS, 0.99, 0.0, 0.2]));
  assert.deepStrictEqual(r2.potions, { hp: 1, mp: 0 });

  // epic (0.2% rung): 2 distinct upgrades, and NO token offer -- the token is
  // its own decoupled drop now. This is the rung the old 5% "legendary" chest's
  // contents landed on, kept EXACTLY as they were minus the token.
  const e = rollContents(makeState(), seq([GAMBLE_MISS, 0.9985, 0.0, 0.0]));
  assert.strictEqual(e.rarity, 'epic');
  assert.strictEqual(e.upgrades.length, 2, 'epic = 2 upgrades');
  assert.notStrictEqual(e.upgrades[0].id, e.upgrades[1].id, 'epic upgrades must be distinct');
  assert.strictEqual(e.item, null, 'the epic rung has NO replacement reward yet (open owner decision)');
  assert.ok(!('tokenOptions' in e), 'the token offer is gone from the chest contents shape');

  // legendary (0.02% top rung): a hand-authored LEGENDARY ITEM, no upgrades.
  // 1 extra draw = the slot pick (0.5 -> index 2 -> BOOTS).
  const l = rollContents(makeState(), seq([GAMBLE_MISS, 0.9999, 0.5]));
  assert.strictEqual(l.rarity, 'legendary');
  assert.ok(l.item, 'the top band drops an item');
  assert.strictEqual(l.item.rarity, 'LEGENDARY');
  assert.strictEqual(l.item.slot, 'BOOTS');
  assert.strictEqual(l.item.name, LEGENDARIES.BOOTS.name, 'the drop is a hand-authored unique');
  assert.strictEqual(l.upgrades.length, 0, 'the item IS the reward');
  assert.deepStrictEqual(l.potions, { hp: 0, mp: 0 });
  console.log('ok: rollContents common/rare/epic/legendary (top band drops a named LEGENDARY item)');
}

// ---- gamble branch: both outcomes, via its OWN independent roll ----
{
  // Win: gamble draw (0.05 < 0.10 HITS) + coin(0.3 < 0.5) + 2 upgrade picks.
  const win = rollContents(makeState(), seq([0.05, 0.3, 0.1, 0.9]));
  assert.strictEqual(win.rarity, 'gamble');
  assert.strictEqual(win.gambleWin, true, 'coin < 0.5 should win the gamble');
  assert.strictEqual(win.upgrades.length, CHESTS.GAMBLE_WIN_UPGRADES, 'gamble win = big reward (2 upgrades)');
  assert.deepStrictEqual(win.potions, { hp: 1, mp: 1 }, 'gamble win refills both potions');

  // Lose: gamble draw + coin(0.7 >= 0.5) — exactly 2 rng draws, no more.
  const lose = rollContents(makeState(), seq([0.05, 0.7]));
  assert.strictEqual(lose.rarity, 'gamble');
  assert.strictEqual(lose.gambleWin, false, 'coin >= 0.5 should lose the gamble');
  assert.strictEqual(lose.upgrades.length, 0, 'gamble loss grants nothing');

  // The gamble roll is INDEPENDENT of the ladder: the worst possible band roll
  // (0.9999999, the top rung) is still a gamble when the gamble draw hits, and
  // the best band roll is a band when it misses.
  assert.strictEqual(rollContents(makeState(), seq([0.05, 0.7])).rarity, 'gamble',
    'a gamble roll cannot be displaced by the rarity draw');
  assert.strictEqual(rollContents(makeState(), seq([0.9999999, 0.0, 0.0])).rarity, 'common',
    'a missed gamble still rolls the band');
  console.log('ok: gamble branch win + lose, on its own independent roll');
}

// ---- chest opens within pickup radius ----
{
  const st = makeState();
  const before = { damage: st.player.stats.damage, potions: { ...st.player.potions } };
  st.chests.push({ id: 1, x: st.player.x + CHESTS.PICKUP_RADIUS - 1, y: st.player.y, age: 0 });

  // Force common + first upgrade (index 0 = 'dmg' at r=0 with 7 in pool).
  const events = tickChests(st, 0.016, seq([0.5, 0.0, 0.0]));
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
  // gamble draw 0.05 -> HIT, coin 0.7 -> lose.
  const events = tickChests(st, 0.016, seq([0.05, 0.7]));
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

// ---- the 0.02% top band via tickChests: a chestItem event, no upgrades ----
{
  const st = makeState();
  const dmgBefore = st.player.stats.damage;
  st.chests.push({ id: 4, x: st.player.x, y: st.player.y, age: 0 });
  // gamble-miss (0.5), top-rung band (0.9999), slot pick 0.0 -> WEAPON.
  const events = tickChests(st, 0.016, seq([0.5, 0.9999, 0.0]));
  const opened = events.find(e => e.kind === 'chestOpened');
  assert.ok(opened && opened.rarity === 'legendary', 'the open is reported as the top band');
  // The item is DELIVERED as an event (main.js routes it onto the ground so the
  // one world-drop pickup path owns the equip decision), not applied here.
  const drop = events.find(e => e.kind === 'chestItem');
  assert.ok(drop, 'the top band emits a chestItem event');
  assert.strictEqual(drop.item.name, LEGENDARIES.WEAPON.name);
  assert.strictEqual(drop.x, st.player.x, 'the drop lands where the chest was');
  assert.strictEqual(drop.y, st.player.y);
  assert.ok(!events.some(e => e.kind === 'tokenOffer'), 'no chest emits a token offer any more');
  assert.strictEqual(st.player.stats.damage, dmgBefore, 'the top band grants no upgrades');
  console.log('ok: top band drops a hand-authored LEGENDARY item through the pickup path');
}

// ---- EVOLUTION TOKEN: decoupled, three channels, one home each ----
{
  assert.deepStrictEqual(EVOLUTION_TOKEN, { PER_KILL: 1200, PER_CHEST: 200, PER_DROP: 500 },
    'the three channel denominators are declared together');
  // Per-channel chances, from the declared denominators (never re-typed here).
  assert.strictEqual(tokenChance('kill'), 1 / EVOLUTION_TOKEN.PER_KILL);
  assert.strictEqual(tokenChance('chest'), 1 / EVOLUTION_TOKEN.PER_CHEST);
  assert.strictEqual(tokenChance('drop'), 1 / EVOLUTION_TOKEN.PER_DROP);
  // An unknown channel can never pay, and draws NOTHING (a dead channel must not
  // shift the caller's rng stream).
  assert.strictEqual(tokenChance('nonsense'), 0);
  assert.strictEqual(rollEvolutionToken(seq([]), 'nonsense'), false, 'unknown channel: zero draws');
  assert.strictEqual(rollEvolutionToken(seq([]), undefined), false, 'missing channel: zero draws');

  // The boundary, both sides, per channel.
  for (const ch of ['kill', 'chest', 'drop']) {
    const p = tokenChance(ch);
    assert.strictEqual(rollEvolutionToken(seq([p - 1e-12]), ch), true, `${ch}: just under the rate pays`);
    assert.strictEqual(rollEvolutionToken(seq([p]), ch), false, `${ch}: exactly the rate does not`);
    assert.strictEqual(rollEvolutionToken(seq([0.9999999]), ch), false, `${ch}: a near-1 roll misses`);
  }

  // WHAT THE RECIPIENT ACTUALLY GETS: the rates converted to per-run counts at
  // the measured volumes. This is the number the owner tunes, not the per-roll
  // probability — 1/1200 reads rare, and rides the kill count.
  const runs = [
    { label: 'short run (834 kills, 53 chests, 280 drops)', kills: 834, chests: 53, drops: 280 },
    { label: 'long run (6232 kills, 53 chests, 297 drops)', kills: 6232, chests: 53, drops: 297 },
  ];
  const perRun = runs.map((r) => ({
    ...r,
    total: r.kills / EVOLUTION_TOKEN.PER_KILL +
           r.chests / EVOLUTION_TOKEN.PER_CHEST +
           r.drops / EVOLUTION_TOKEN.PER_DROP,
  }));
  assert.ok(perRun[0].total > 1 && perRun[0].total < 2,
    `a short run pays "one, with a chance of a second" (got ${perRun[0].total.toFixed(2)})`);
  assert.ok(perRun[1].total > 5,
    `a long run pays a handful (got ${perRun[1].total.toFixed(2)}) — tracked, not a defect`);
  // And the volume trap this decoupling exists to avoid: the SAME 1/500 reads
  // ~0.56/run on drops and ~12/run if it rode kills. Named so it cannot be
  // re-introduced by moving a rate to the high-volume stream.
  assert.ok(6232 / 500 > 10, 'the same 1/500 rides two orders of magnitude in per-run outcome');
  for (const r of perRun) {
    console.log(`    token channels ${r.label} => ${(r.kills / EVOLUTION_TOKEN.PER_KILL).toFixed(2)} kill + ` +
      `${(r.chests / EVOLUTION_TOKEN.PER_CHEST).toFixed(2)} chest + ` +
      `${(r.drops / EVOLUTION_TOKEN.PER_DROP).toFixed(2)} drop = ${r.total.toFixed(2)} per run`);
  }
  // The flavour list stays exported for the banner/evolve UI, but it is NO
  // LONGER what a chest offers.
  assert.strictEqual(EVOLUTION_TOKENS.length, 3, 'the token flavour list is still exported as data');
  console.log('ok: evolution token is its own three-channel drop, decoupled from the chest ladder');
}

console.log('CHESTS TESTS PASSED');
