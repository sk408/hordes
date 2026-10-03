// HORDES — src/quests.js
//
// M5b slice 3: QUESTS. Three short goals per run from the camp's quest board,
// picked for you if you do nothing. Each counts an event the game already
// has (a shrine charged, a brazier broken, the vault opened...). A quest pays
// gold with the run's normal settlement (its own line on the end screen),
// scaled by the prestige tier like other run income; the two hard ones pay a
// joker offer the moment they are done instead.
// QUEST CHAINS run across runs (saved in profile.world.chains): finish the
// chain's step quest in a run to advance it; the last step unlocks a
// character through the achievement unlock path, or pays a joker offer on
// top of its gold when that character is already owned.
//
// Pure rules + data: no DOM, no Math.random (callers pass rng).

// ev = the event name the game reports; n = how many; gold or joker = the pay.
export const QUESTS = [
  { id: 'shrines2', text: 'Charge 2 shrines', ev: 'shrine', n: 2, gold: 80 },
  { id: 'braziers10', text: 'Break 10 braziers', ev: 'brazier', n: 10, gold: 60 },
  { id: 'vault', text: 'Open the vault', ev: 'vault', n: 1, joker: true },
  { id: 'yard', text: 'Loot the walled yard', ev: 'yard', n: 1, gold: 100 },
  { id: 'carrier', text: 'Kill the key carrier', ev: 'carrier', n: 1, gold: 80 },
  { id: 'eliteHigh', text: 'Kill an elite from high ground', ev: 'eliteHigh', n: 1, gold: 90 },
  { id: 'boss1Fast', text: 'Beat the wave-1 boss by 2:30', ev: 'boss1Fast', n: 1, gold: 100 },
  { id: 'fuse', text: 'Fuse a weapon', ev: 'fuse', n: 1, joker: true },
  { id: 'elites5', text: 'Kill 5 elites', ev: 'elite', n: 5, gold: 70 },
  { id: 'fountain', text: 'Drink from a fountain', ev: 'fountain', n: 1, gold: 50 },
  { id: 'crack', text: 'Break a cracked wall', ev: 'crack', n: 1, gold: 90 },
  { id: 'wave3', text: 'Reach wave 3', ev: 'wave', n: 3, gold: 70, max: true },
];
export const QUEST_BY_ID = Object.fromEntries(QUESTS.map(q => [q.id, q]));
export const QUESTS_PER_RUN = 3;

// Chains: each step names a quest; finishing it in a run advances the chain.
export const CHAINS = [
  { id: 'warden', name: "WARDEN'S PATH", steps: ['carrier', 'vault', 'yard'],
    unlock: { kind: 'character', id: 'PALADIN' } },
  { id: 'seeker', name: "SEEKER'S ROAD", steps: ['braziers10', 'crack', 'shrines2', 'boss1Fast'],
    unlock: { kind: 'character', id: 'ROGUE' } },
];
export const CHAIN_BY_ID = Object.fromEntries(CHAINS.map(c => [c.id, c]));

export const QUEST_HINTS = {
  board: 'The quest board picks three goals for each run; tap one to swap it, or just play.',
  tracker: 'Your three quests sit under the timer; done ones pay at the end of the run.',
};

// The chain step each chain wants next (null when the chain is done).
export function chainStep(world, chainId) {
  const c = CHAIN_BY_ID[chainId];
  const at = (world && world.chains && world.chains[chainId]) | 0;
  return c && at < c.steps.length ? c.steps[at] : null;
}
export function chainDone(world, chainId) {
  const c = CHAIN_BY_ID[chainId];
  return !!c && ((world && world.chains && world.chains[chainId]) | 0) >= c.steps.length;
}

// Roll the board: the open chain steps first (one each, at most two), then
// random quests to make three. `world` = profile.world; `avail` (optional) =
// a predicate on quest ids for what this stage offers.
export function rollBoard(rng, world, avail = null) {
  const ok = (id) => !avail || avail(id);
  const ids = [];
  for (const c of CHAINS) {
    const s = chainStep(world, c.id);
    if (s && ok(s) && !ids.includes(s) && ids.length < 2) ids.push(s);
  }
  const pool = QUESTS.map(q => q.id).filter(id => ok(id) && !ids.includes(id));
  while (ids.length < QUESTS_PER_RUN && pool.length) ids.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return ids;
}
// Swap one board entry for another quest not on the board.
export function swapQuest(rng, ids, idx, avail = null) {
  const pool = QUESTS.map(q => q.id).filter(id => !ids.includes(id) && (!avail || avail(id)));
  if (!pool.length || idx < 0 || idx >= ids.length) return ids;
  const out = ids.slice();
  out[idx] = pool[Math.floor(rng() * pool.length)];
  return out;
}

// The run's quest list from the board ids.
export function startQuests(ids) {
  return (ids || []).filter(id => QUEST_BY_ID[id]).map(id => ({ id, n: 0, done: false, paid: false }));
}

// Events only the open world gives: the maw closes its sites and secrets.
const WORLD_EVS = new Set(['shrine', 'brazier', 'vault', 'yard', 'carrier', 'fountain', 'crack']);
export const BOSS1_FAST_S = 150;   // the wave-1 race: 2:30

// Close the quests that can no longer be finished this run: the world ones
// once the maw has closed the sites, the wave-1 race once its time is up or
// the wave moved on. A closed quest stays on the tracker, greyed, and pays
// nothing. Returns the quests closed just now.
export function closeQuests(quests, { worldClosed = false, time = 0, wave = 1 } = {}) {
  const out = [];
  for (const q of quests || []) {
    if (q.done || q.closed) continue;
    const d = QUEST_BY_ID[q.id];
    if (!d) continue;
    if ((worldClosed && WORLD_EVS.has(d.ev)) || (d.ev === 'boss1Fast' && (time > BOSS1_FAST_S || wave > 1))) {
      q.closed = true;
      out.push(q);
    }
  }
  return out;
}

// Count one event. Returns the quests this completed (each once).
export function questEvent(quests, ev, amount = 1) {
  const done = [];
  for (const q of quests || []) {
    if (q.done || q.closed) continue;
    const d = QUEST_BY_ID[q.id];
    if (!d || d.ev !== ev) continue;
    q.n = d.max ? Math.max(q.n, amount) : q.n + amount;
    if (q.n >= d.n) { q.n = d.n; q.done = true; done.push(q); }
  }
  return done;
}

// The gold the run's done quests pay at settlement (joker quests pay 0 here).
// `mult` = the prestige gold multiplier; each quest pays what questPay showed.
export function questGold(quests, mult = 1) {
  let g = 0;
  for (const q of quests || []) if (q.done) g += Math.round((QUEST_BY_ID[q.id].gold || 0) * mult);
  return g;
}

// Fold the run into the saved chains: each chain whose current step was done
// this run advances one step. Returns the chains that finished just now.
export function advanceChains(world, quests) {
  const finished = [];
  const doneIds = new Set((quests || []).filter(q => q.done).map(q => q.id));
  for (const c of CHAINS) {
    const s = chainStep(world, c.id);
    if (s && doneIds.has(s)) {
      world.chains[c.id] = ((world.chains[c.id] | 0) + 1);
      if (world.chains[c.id] >= c.steps.length) finished.push(c);
    }
  }
  return finished;
}

// Short tracker line: "Charge 2 shrines 1/2".
export function questLine(q) {
  const d = QUEST_BY_ID[q.id];
  if (!d) return '';
  return d.text + (q.done ? ' - DONE' : q.closed ? ' - CLOSED' : d.n > 1 ? ' ' + q.n + '/' + d.n : '');
}
export function questPay(id, mult = 1) {
  const d = QUEST_BY_ID[id];
  return d ? (d.joker ? 'A JOKER' : Math.round(d.gold * mult) + 'G') : '';
}

// The chain that pays a joker for quest `id`: it is that chain's last step and
// its character is already owned. `owns` = a predicate on character ids.
export function chainJokerStep(world, id, owns) {
  for (const c of CHAINS) {
    const at = (world && world.chains && world.chains[c.id]) | 0;
    if (at === c.steps.length - 1 && c.steps[at] === id && owns(c.unlock.id)) return c;
  }
  return null;
}
// What finishing a chain pays, in the words the SECRETS shelf shows.
export function chainReward(c, owned) {
  const who = c.unlock.id.toLowerCase();
  return owned ? 'pays a joker (' + who + ' is yours)' : 'unlocks ' + who;
}
