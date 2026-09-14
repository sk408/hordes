// HORDES — chests & gamble moments (self-contained module).
// Chest lifecycle: elite-ish kills have a chance to drop a chest; the chest
// idles on the field until the player walks within PICKUP_RADIUS, then pops
// its contents. Contents rarity follows the owner's ladder
// (CHESTS.RARITY_WEIGHTS); the GAMBLE is NOT a rarity but its own independent
// 1-in-10 roll — the tension moment: 50/50 between a big payoff and nothing
// PLUS a mini horde spawned
// right on top of the player (typed CHASERs through the same chassis + heat
// scaling every other spawn uses — see applyEscalation below).
//
// Pure-ish by design: every randomness goes through an injectable `rng`
// (defaults to Math.random) so tests are deterministic. tickChests returns an
// events array instead of touching the DOM — integration (main.js/render.js)
// consumes those events later.
import { CONFIG as C } from './config.js';
import { makeTypedEnemy } from './enemy_types.js';
import { applyEscalation, clampLootToArena } from './entities.js';
// G8 step 3: the CONDITION-shape run rules. Pure helpers only (no rng, no
// mutation), so the chest keeps its documented rng draw order either way.
import { ruledChestRarity, hasRule } from './rules.js';
// The top chest band's reward: loot.js owns the hand-authored LEGENDARY items
// (one fixed named unique per slot). One-directional — loot.js imports meta.js
// only, so there is no cycle.
import { rollItemOfRarity } from './loot.js';

// All chest tuning lives here (NOT config.js — avoids collision with the
// glm-hb1-owned files during fan-out).
export const CHESTS = {
  DROP_CHANCE: 0.35,        // roll on each elite-ish kill
  ELITE_HP_MULT: 1.5,       // elite-ish: maxHp >= BASE_HP * this (or .elite flag)
  MAX_ACTIVE: 3,            // chests on the field at once
  PICKUP_RADIUS: 14,        // player must come this close to open one
  LIFETIME: 30,             // seconds before an unopened chest despawns

  // Contents rarity bands — the OWNER'S LADDER (2026-09-13), the SAME numbers
  // the world-drop table uses (meta.js BASE_RARITY_WEIGHTS): COMMON 98 /
  // RARE 1.7 / EPIC 0.2 / LEGENDARY 0.02. Deliberately the owner's raw shares,
  // not rescaled to 100 — pickRarity normalizes, so the ladder has one home and
  // one meaning ("share of chests at luck 0"). Measured at 53 chests a run:
  // 51.9 common / 0.90 rare / 0.11 epic / 0.01 legendary.
  RARITY_WEIGHTS: { common: 98, rare: 1.7, epic: 0.2, legendary: 0.02 },

  // GAMBLE IS NOT A RARITY (owner decision): it used to sit in the SAME table
  // as the bands, so a 4-tier ladder left it homeless — and folding it into the
  // ladder would have quietly turned the risk mechanic into the 0.02% slot. It
  // keeps its OWN independent roll at 1 in 10 chests instead.
  GAMBLE_CHANCE: 0.10,

  // Gamble branch: 50% big reward, 50% nothing + mini horde on the player.
  GAMBLE_WIN_CHANCE: 0.5,
  // "Big reward" under the pivot = a RARE item + both flasks refilled. (It used
  // to be 2 UPGRADES + both flasks; a band that still granted flat upgrades
  // would contradict the pivot below.) The gamble stays a gamble: no band, its
  // own 1-in-10 roll, and the loss still costs a horde.
  GAMBLE_WIN_ITEM_RARITY: 'RARE',
  GAMBLE_HORDE_COUNT: 6,    // the punishment horde
  GAMBLE_HORDE_RADIUS: 90,  // spawned on a ring around the player
};

// ---------- EVOLUTION TOKENS: their own drop, decoupled (owner spec) --------
// The token used to ride the legendary chest band (53 chests x 5% = ~2.7
// tokens/run), which made its rate a hostage of the chest rarity table: any
// retune of the ladder silently retuned the token too. It is now a SEPARATE
// drop with three independently tunable channels, so 1/500 has exactly one
// home and the chest ladder can move without moving it.
//
// THE DENOMINATOR IS THE WHOLE RATE (owner decision 2026-09-13), measured per
// FRESH RUN on the shipped build (834 kills, 53 chests, 280 world drops on a
// short run; 6232 kills on a long one):
//   per kill  1/1200 -> 0.69 on a short run, 5.19 on a long one
//   per chest 1/200  -> 0.27
//   per drop  1/500  -> 0.56
// => ~1.5 tokens on a typical short run, ~6 on a long one. That is the owner's
// intent: "should be something a new player can get... not right away, but
// shouldn't take multiple runs to have a chance at a single one."
// FLAGGED, not a defect: the per-kill channel rides run length, so a
// snowballing run pulls 5+ from kills alone. If the rate should stay flat it
// needs a per-run cap or a normalisation; that is a tuning choice for the owner.
export const EVOLUTION_TOKEN = {
  PER_KILL: 1200,
  PER_CHEST: 200,
  PER_DROP: 500,
};
// channel -> the knob that owns its denominator. 'kill' = an enemy death,
// 'chest' = a chest opened, 'drop' = a world item drop created.
const TOKEN_DENOM = { kill: 'PER_KILL', chest: 'PER_CHEST', drop: 'PER_DROP' };

/** Chance per event for a token channel. Unknown channel => 0 (never rolls).
 *  PURE — and consumes NO rng when it returns 0. */
export function tokenChance(channel) {
  const key = TOKEN_DENOM[channel];
  return key ? 1 / EVOLUTION_TOKEN[key] : 0;
}

/** Roll one token channel. Unknown channel draws nothing and returns false. */
export function rollEvolutionToken(rng = Math.random, channel) {
  const c = tokenChance(channel);
  return c > 0 && rng() < c;   // short-circuit: no draw for a dead channel
}

// ---------- Typed horde spawn (main.js spawnWave parity) -------------------
// Wave-25 (agent F): the gamble punishment horde used to spawn through
// entities.makeEnemy(), so its enemies had no typeId / variant / w / h / age,
// skipped the HEAT hp multiplier, and could never be flash-drop eligible
// (loot.isFlashEligibleKill needs a CHASER/SWARMER typeId). It now spawns
// through the SAME typed construction the regular spawner uses:
//   enemy_types.makeTypedEnemy -> a real CHASER chassis (typeId/w/h/age/pack)
//   the CONFIG.ESCALATION re-scale -> the same hp/xp curves as every spawn
//   heatMultipliers(heatOf(state)).hp -> the run's heat ledger
// Deliberately NO rng: the factory's default variant is used, so the chest
// keeps its documented 2-draw rng order and no caller's stream shifts.
// WAVE-26: the re-scale algebra used to be duplicated here and in main.js;
// both now delegate to the ONE shared entities.applyEscalation helper, so the
// curves can never desync between the chest horde and the ambient spawner.
// BALANCE NOTE (wave-25, measured — no numbers were retuned): putting the
// gamble horde on the typed path also puts it on CONFIG.ESCALATION, which
// COMPOUNDS from wave 4. Its hp vs the old makeEnemy chassis: x1.41 at wave 1,
// x1.65 at wave 2, x1.92 at wave 4, x7.2 at wave 8 (x1.36 more at heat 3);
// xp follows the same curve (x1.47 at wave 2, x1.70 at wave 4, x4.72 at wave
// 8). That is exactly the curve every
// ambient spawn uses, so the punishment horde now matches the field it lands
// in (and counts as elite-ish for chest rolls from wave 1 instead of wave 2).
// If the owner wants the old "scare, not a threat" feel at high waves, dial
// CHESTS.GAMBLE_HORDE_COUNT (or add a multiplier here) — do not revert the
// typed path, which is what made the horde a real citizen.

// Placeholder evolution tokens (legendary offers a 1-of-N choice; the actual
// evolution system lands later — these are the offer payloads).
export const EVOLUTION_TOKENS = [
  { id: 'void',   name: 'Void Core',    desc: 'evolution token: whispers of the void' },
  { id: 'ember',  name: 'Ember Heart',  desc: 'evolution token: burns within' },
  { id: 'storm',  name: 'Storm Sigil',  desc: 'evolution token: crackling potential' },
];

let nextId = 1;

// Weighted rarity pick over CHESTS.RARITY_WEIGHTS (the owner's ladder). The
// bands are the raw shares, so the roll is normalised by their total: the
// ladder's rungs and the band edges can never drift apart. rng() in [0,1).
// GAMBLE IS NOT HERE — it is its own roll in rollContents (CHESTS.GAMBLE_CHANCE).
export function pickRarity(rng) {
  const table = CHESTS.RARITY_WEIGHTS;
  const total = Object.values(table).reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (const [kind, w] of Object.entries(table)) {
    if (r < w) return kind;
    r -= w;
  }
  return Object.keys(table).at(-1); // fp-drift fallback
}

// n distinct items from arr, rng-driven.
function sample(arr, n, rng) {
  const pool = [...arr];
  const out = [];
  for (let i = 0; i < n && pool.length > 0; i++) {
    out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  return out;
}

// Does this dead enemy count as elite-ish?
export function isEliteish(enemy) {
  if (!enemy) return false;
  if (enemy.elite) return true;
  // G20C: read the PRE-stage hp. The test used to read the stage-stamped
  // maxHp, so on a hpMult 1.5 stage (SNOWFIELD) EVERY plain CHASER read
  // elite-ish and the whole chest economy leaked open (measured: 22/25
  // 900-frame cohorts opened chests vs 0/25 on the default stage).
  // spawnWave's stampStageStats records preStageMaxHp on every spawn; the
  // fallback keeps the default stage byte-identical (preStage === max there).
  const hp = enemy.preStageMaxHp ?? enemy.maxHp;
  return hp >= C.ENEMY.BASE_HP * CHESTS.ELITE_HP_MULT;
}

// Called per enemy kill. Returns the spawned chest or null.
// chanceMult scales the DROP_CHANCE roll only (E2: the wave-2 horde's plain
// chaff pays near-zero); every existing caller reads the default 1.
export function maybeSpawnChest(state, killedEnemy, rng = Math.random, chanceMult = 1) {
  if (!isEliteish(killedEnemy)) return null;
  if (rng() >= CHESTS.DROP_CHANCE * chanceMult) return null;
  if (!Array.isArray(state.chests)) state.chests = [];
  if (state.chests.length >= CHESTS.MAX_ACTIVE) return null;
  // WAVE-27: a chest dropped by a kill outside the wall is unreachable — clamp
  // it into the playable face (entities.clampLootToArena: rim minus the wall
  // band minus the pickup radius). Same clamp every other drop uses.
  const at = clampLootToArena(killedEnemy.x, killedEnemy.y);
  const chest = { id: nextId++, x: at.x, y: at.y, age: 0 };
  state.chests.push(chest);
  return chest;
}

// Roll chest contents WITHOUT applying anything (pure given rng).
// Returns { rarity, item|null, potions{hp,mp}, gambleWin? }.
//
// THE PIVOT (owner, 2026-09-13): "chests don't need to grant upgrades at all
// though. That should be handled through buyables and level upgrades. The
// equipment they drop should be the thing that adds stat, damage, etc
// modifiers." So a chest band IS an item rarity and the ITEM is the reward --
// no band hands out UPGRADES (the flat stat bumps) any more. Flat growth lives
// in the shop buyables and the level-up draft; a chest contributes EQUIPMENT,
// whose affixes are the modifier system (loot.js applyAffixes).
//
// DRAW ORDER (tests pin it): 1 gamble draw FIRST -- a chest is either a gamble
// or a rarity band, never both -- then 1 rarity draw when it is not a gamble,
// then the band's item (1-3 draws), then the rare band's potion coin.
export function rollContents(state, rng = Math.random) {
  if (rng() < CHESTS.GAMBLE_CHANCE) {
    const g = { rarity: 'gamble', item: null, potions: { hp: 0, mp: 0 } };
    if (rng() < CHESTS.GAMBLE_WIN_CHANCE) {
      g.gambleWin = true;
      g.item = rollItemOfRarity(CHESTS.GAMBLE_WIN_ITEM_RARITY, rng);
      g.potions = { hp: 1, mp: 1 };
    } else {
      g.gambleWin = false;
    }
    return g;
  }

  // G8 step 3: HORDE BAIT moves the rolled band ONE STEP UP (see rules.js).
  // It reads the rules off the state this function already receives, so no
  // caller signature changes and NO extra rng draw is taken.
  const rarity = ruledChestRarity(pickRarity(rng), state);
  const base = { rarity, item: null, potions: { hp: 0, mp: 0 } };

  // THE BAND IS THE ITEM RARITY. One item per chest, built at the band's own
  // rarity: common 98% pays a common item, the 0.02% top band pays a
  // hand-authored LEGENDARY unique. This also ANSWERS the previously-open
  // "replacement top reward" question for the upper band: under the pivot the
  // item IS the reward, so no separate bonus had to be invented for it.
  base.item = rollItemOfRarity(rarity.toUpperCase(), rng);
  // The rare band keeps its flask: potions are the run's SUSTAIN, not a stat
  // grant, and a fresh run is meant to be weak with the shop as the answer.
  if (rarity === 'rare') base.potions[rng() < 0.5 ? 'hp' : 'mp'] = 1;
  return base;
}

// Apply rolled contents to the player; returns events describing what the
// integration layer should surface (toasts, token-choice UI, horde warning).
// The mini horde, extracted so HORDE BAIT can fire it on EVERY chest through
// the same code the lost gamble used. Unchanged in behaviour: typed CHASER
// chassis, a ring around the player, the shared escalation, and NO rng draw.
function spawnPunishmentHorde(state) {
  const p = state.player;
  const n = CHESTS.GAMBLE_HORDE_COUNT;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const e = makeTypedEnemy(
      'CHASER',
      p.x + Math.cos(a) * CHESTS.GAMBLE_HORDE_RADIUS,
      p.y + Math.sin(a) * CHESTS.GAMBLE_HORDE_RADIUS,
      state.time
    );
    applyEscalation(state, e);
    state.enemies.push(e);
  }
  return n;
}

function applyContents(state, contents, chest) {
  const p = state.player;
  const events = [{ kind: 'chestOpened', rarity: contents.rarity, x: chest.x, y: chest.y }];

  for (const k of ['hp', 'mp']) {
    // G11: the run's rule ceiling (NO_POTIONS stays at 0 — no chest refills a
    // forbidden flask). startRun always sets state.potionCap before a run.
    p.potions[k] = Math.min(state.potionCap, p.potions[k] + contents.potions[k]);
  }
  if (contents.item) {
    // The 0.02% top band's reward is EQUIPMENT. Emitted as its own event rather
    // than applied here: main.js pushes it onto state.itemDrops so the ONE
    // world-drop pickup path (decideEquip / applyItemAffixes) owns the equip
    // decision, and a full 4/4 belt still gets the normal swap-or-ignore rule.
    events.push({ kind: 'chestItem', item: contents.item, x: chest.x, y: chest.y });
  }

  if (contents.rarity === 'gamble' && contents.gambleWin === false) {
    // The gamble tension: nothing AND a mini horde rings the player.
    events.push({ kind: 'gambleHorde', count: spawnPunishmentHorde(state) });
  } else if (hasRule(state, 'hordebait')) {
    // G8 step 3: HORDE BAIT paid a better chest and answers with a horde.
    // The `else` is load-bearing — a lost gamble already paid its horde, so a
    // chest is NEVER worth two hordes (asserted in test_run_rules).
    events.push({ kind: 'hordeBait', count: spawnPunishmentHorde(state) });
  }
  return events;
}

// Per-frame: age chests, despawn expired ones, open any the player touches.
// Returns the aggregated events array for this tick.
export function tickChests(state, dt, rng = Math.random) {
  if (!Array.isArray(state.chests)) { state.chests = []; return []; }
  const p = state.player;
  const events = [];

  for (let i = state.chests.length - 1; i >= 0; i--) {
    const chest = state.chests[i];
    chest.age += dt;
    if (chest.age >= CHESTS.LIFETIME) {
      state.chests.splice(i, 1);
      events.push({ kind: 'chestExpired', x: chest.x, y: chest.y });
      continue;
    }
    if (Math.hypot(chest.x - p.x, chest.y - p.y) <= CHESTS.PICKUP_RADIUS) {
      const contents = rollContents(state, rng);
      events.push(...applyContents(state, contents, chest));
      state.chests.splice(i, 1);
    }
  }
  return events;
}
