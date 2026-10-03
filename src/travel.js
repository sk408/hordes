// HORDES — src/travel.js
//
// TRAVEL (plan M5a: stages chained in one run). After every second wave
// before the maw's wave, the portal leads on to another stage: new ground,
// fresh sites, that stage's enemies. The build, the quests, the boss rules
// and the clock carry over; so does loot still lying on the field. The
// intermission's CONTINUE travels; STAY HERE keeps the field.
//
// Pure rules: no DOM, no Math.random (callers pass rng). main.js owns the run
// state and moves the run (travelTo).
import { STAGES } from './stages.js';

export const TRAVEL = { EVERY: 2 };

export const TRAVEL_HINT = 'The portal leads on to a new stage: new ground and fresh sites. Your build comes with you.';

// Does the portal that closes `wave` lead on? (waves 2, 4 ... below `endWave`)
export function travelDue(wave, endWave) {
  const w = Math.floor(wave);
  return w >= TRAVEL.EVERY && w < endWave && w % TRAVEL.EVERY === 0;
}

// The stages a run may travel to, in the ladder's order: every unlocked
// stage, and the first locked one after them (a look ahead).
export function travelPool(unlocked) {
  const ids = STAGES.map(s => s.id);
  let last = -1;
  ids.forEach((id, i) => { if (unlocked(id)) last = i; });
  return ids.filter((id, i) => unlocked(id) || i === last + 1);
}

// The run's travel order: the pool, shuffled with `rng`.
export function rollTravelOrder(rng, unlocked) {
  const ids = travelPool(unlocked);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids;
}

// Where the portal leads from `current`: the first stage of the order the
// run has not visited, else the first that is not the current one (a new
// field of a stage seen before). Null when the order holds nothing else.
export function travelDestination(order, current, seen = []) {
  const others = (order || []).filter(id => id !== current);
  return others.find(id => !seen.includes(id)) || others[0] || null;
}
