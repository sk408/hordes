// HORDES — chests & gamble moments (self-contained module).
// Chest lifecycle: elite-ish kills have a chance to drop a chest; the chest
// idles on the field until the player walks within PICKUP_RADIUS, then pops
// its contents. Contents rarity is weighted; the GAMBLE rarity is the tension
// moment — 50/50 between a big payoff and nothing PLUS a mini horde spawned
// right on top of the player.
//
// Pure-ish by design: every randomness goes through an injectable `rng`
// (defaults to Math.random) so tests are deterministic. tickChests returns an
// events array instead of touching the DOM — integration (main.js/render.js)
// consumes those events later.
import { CONFIG as C, UPGRADES } from './config.js';
import { makeEnemy } from './entities.js';

// All chest tuning lives here (NOT config.js — avoids collision with the
// glm-hb1-owned files during fan-out).
export const CHESTS = {
  DROP_CHANCE: 0.35,        // roll on each elite-ish kill
  ELITE_HP_MULT: 1.5,       // elite-ish: maxHp >= BASE_HP * this (or .elite flag)
  MAX_ACTIVE: 3,            // chests on the field at once
  PICKUP_RADIUS: 14,        // player must come this close to open one
  LIFETIME: 30,             // seconds before an unopened chest despawns

  // Contents rarity weights (must sum to 100).
  WEIGHTS: { common: 60, rare: 25, legendary: 5, gamble: 10 },

  // Gamble branch: 50% big reward, 50% nothing + mini horde on the player.
  GAMBLE_WIN_CHANCE: 0.5,
  GAMBLE_WIN_UPGRADES: 2,   // "big reward": upgrades + refilled potions
  GAMBLE_HORDE_COUNT: 6,    // the punishment horde
  GAMBLE_HORDE_RADIUS: 90,  // spawned on a ring around the player
};

// Placeholder evolution tokens (legendary offers a 1-of-N choice; the actual
// evolution system lands later — these are the offer payloads).
export const EVOLUTION_TOKENS = [
  { id: 'void',   name: 'Void Core',    desc: 'evolution token: whispers of the void' },
  { id: 'ember',  name: 'Ember Heart',  desc: 'evolution token: burns within' },
  { id: 'storm',  name: 'Storm Sigil',  desc: 'evolution token: crackling potential' },
];

let nextId = 1;

// Weighted rarity pick. rng() in [0,1); bands follow WEIGHTS key order.
export function pickRarity(rng) {
  let r = rng() * 100;
  for (const [kind, w] of Object.entries(CHESTS.WEIGHTS)) {
    if (r < w) return kind;
    r -= w;
  }
  return Object.keys(CHESTS.WEIGHTS).at(-1); // fp-drift fallback
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
  return enemy.maxHp >= C.ENEMY.BASE_HP * CHESTS.ELITE_HP_MULT;
}

// Called per enemy kill. Returns the spawned chest or null.
export function maybeSpawnChest(state, killedEnemy, rng = Math.random) {
  if (!isEliteish(killedEnemy)) return null;
  if (rng() >= CHESTS.DROP_CHANCE) return null;
  if (!Array.isArray(state.chests)) state.chests = [];
  if (state.chests.length >= CHESTS.MAX_ACTIVE) return null;
  const chest = { id: nextId++, x: killedEnemy.x, y: killedEnemy.y, age: 0 };
  state.chests.push(chest);
  return chest;
}

// Roll chest contents WITHOUT applying anything (pure given rng).
// Returns { rarity, upgrades[], potions{hp,mp}, tokenOptions[], gambleWin? }.
export function rollContents(state, rng = Math.random) {
  const rarity = pickRarity(rng);
  const base = { rarity, upgrades: [], potions: { hp: 0, mp: 0 }, tokenOptions: [] };

  if (rarity === 'common') {
    base.upgrades = sample(UPGRADES, 1, rng);
  } else if (rarity === 'rare') {
    base.upgrades = sample(UPGRADES, 1, rng);
    base.potions[rng() < 0.5 ? 'hp' : 'mp'] = 1;
  } else if (rarity === 'legendary') {
    base.upgrades = sample(UPGRADES, 2, rng);
    base.tokenOptions = [...EVOLUTION_TOKENS]; // the CHOICE is the player's
  } else { // gamble
    if (rng() < CHESTS.GAMBLE_WIN_CHANCE) {
      base.gambleWin = true;
      base.upgrades = sample(UPGRADES, CHESTS.GAMBLE_WIN_UPGRADES, rng);
      base.potions = { hp: 1, mp: 1 };
    } else {
      base.gambleWin = false;
    }
  }
  return base;
}

// Apply rolled contents to the player; returns events describing what the
// integration layer should surface (toasts, token-choice UI, horde warning).
function applyContents(state, contents, chest) {
  const p = state.player;
  const events = [{ kind: 'chestOpened', rarity: contents.rarity, x: chest.x, y: chest.y }];

  for (const u of contents.upgrades) u.apply(p);
  for (const k of ['hp', 'mp']) {
    p.potions[k] = Math.min(C.POTIONS.MAX_CARRIED, p.potions[k] + contents.potions[k]);
  }
  if (contents.tokenOptions.length > 0) {
    events.push({ kind: 'tokenOffer', options: contents.tokenOptions });
  }

  if (contents.rarity === 'gamble' && contents.gambleWin === false) {
    // The gamble tension: nothing AND a mini horde rings the player.
    const n = CHESTS.GAMBLE_HORDE_COUNT;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      state.enemies.push(makeEnemy(
        p.x + Math.cos(a) * CHESTS.GAMBLE_HORDE_RADIUS,
        p.y + Math.sin(a) * CHESTS.GAMBLE_HORDE_RADIUS,
        state.time
      ));
    }
    events.push({ kind: 'gambleHorde', count: n });
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
