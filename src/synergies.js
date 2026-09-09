// HORDES — WEAPON SYNERGIES (pair passives; Sk408-approved WAVE-11/3).
// Self-contained: table + pure detection ONLY. hb1 wires gameplay + UI. No
// DOM, no rng, no state mutation — headless-testable.
//
// MODEL: each entry is a PAIR passive across two of the 9 weapon archetypes
// (weapons.js: VOLLEY, ORBIT, BOOMERANG, ZAP, NOVA_PULSE, SCYTHE, SEEKER,
// MINE, BEAM). When BOTH weapons of a pair are equipped, the passive is
// ACTIVE and its data flags modify BOTH weapons' behavior (hb1's call).
//
// PARTICIPATION RULES (deliberate):
//   - a weapon may hold MULTIPLE active synergies at once (slots permitting)
//   - each PAIR appears at most once in the table (no duplicate pairs)
//   - no self-pairs (pair[0] !== pair[1])
//
// RE-EVALUATION CONTRACT: synergies are DERIVED state, never granted
// permanently. hb1 re-calls detectSynergies(...) with the equipped weapon
// type list EVERY time weapons change (grant, evolve, slot swap) and stores
// the result (e.g. state.synergies = detectSynergies(...)). A synergy's
// effects apply to both weapons ONLY while both remain equipped — losing a
// partner weapon deactivates the passive automatically on the next
// re-evaluation. Evolution (evolutions.js) is orthogonal: a weapon's
// evolution affixes and its synergy flags stack.
//
// FLAGS: plain data (booleans/numbers) per entry, documented inline below.
// hb1 must IGNORE unknown flags so this table can grow ahead of gameplay
// wiring (same convention as evolutions.js behavior flags).

import { WEAPON_NAMES } from './weapons.js';

// flag docs (per entry, what hb1 wires):
//   orbitVolley        volley projectiles orbit the player once (~1 rev) before
//                      flying out along their aim vector
//   zapExtraForks      +N extra fork jumps on chain zap (stacks with level jumps)
//   boomerangHoming    boomerang return leg homes weakly (seeker turn rate * 0.5)
//   novaDetonatesMines nova pulse blasts detonate every mine inside the radius
//   scytheArcZap       each landed scythe sweep zaps the nearest enemy from the
//                      arc's edge (zap damage at 50% falloff)
//   novaPull           nova pulse drags enemies inward by this fraction of their
//                      distance before the blast lands (feeds orbit blades)
//   beamDetonatesMines beam hits detonate any mine within the beam's width
export const SYNERGIES = [
  {
    pair: ['VOLLEY', 'ORBIT'], name: 'Orbital Volley',
    desc: 'Shots loop one full orbit around you before screaming off down their lane.',
    flags: { orbitVolley: true },
  },
  {
    pair: ['ZAP', 'BEAM'], name: 'Superconductor',
    desc: 'The beam grounds the storm: chain zap forks +1 extra jump per strike.',
    flags: { zapExtraForks: 1 },
  },
  {
    pair: ['BOOMERANG', 'SEEKER'], name: 'Bloodhound Rang',
    desc: 'The rang learns the hunt — its return leg tracks the nearest survivor home.',
    flags: { boomerangHoming: true },
  },
  {
    pair: ['NOVA_PULSE', 'MINE'], name: 'Chain Reaction',
    desc: 'Every nova pulse cooks off any mine caught inside the ring.',
    flags: { novaDetonatesMines: true },
  },
  {
    pair: ['SCYTHE', 'ZAP'], name: 'Threshing Storm',
    desc: 'Each sweep crackles: the arc lashes the nearest foe with grounded lightning.',
    flags: { scytheArcZap: true },
  },
  {
    pair: ['NOVA_PULSE', 'ORBIT'], name: 'Gravity Well',
    desc: 'The pulse drags the horde a quarter-step inward before it breaks on your blades.',
    flags: { novaPull: 0.25 },
  },
  {
    pair: ['MINE', 'BEAM'], name: 'Fire Focus',
    desc: 'The beam finds the triggers: sweeping a mine sets it off where it lies.',
    flags: { beamDetonatesMines: true },
  },
];

// ---------- detectSynergies ------------------------------------------------
// PURE + order-stable. Accepts a list of weapon TYPE ids ('ORBIT', ...) or
// weapon instances ({ type: 'ORBIT', ... }) in any order, with any number of
// duplicates. Returns the ACTIVE SYNERGIES entries (table references, in
// TABLE order — input order never changes the result) for every pair whose
// two weapons are both present. Unknown types are ignored.
export function detectSynergies(weaponTypes) {
  const have = new Set();
  for (const w of weaponTypes || []) {
    const t = typeof w === 'string' ? w : (w && w.type);
    if (t && WEAPON_NAMES[t]) have.add(t);   // only real archetypes count
  }
  const out = [];
  for (const s of SYNERGIES) {
    if (have.has(s.pair[0]) && have.has(s.pair[1])) out.push(s);
  }
  return out;
}

// ---------- describeSynergy ------------------------------------------------
// HUD/draft card. Accepts a SYNERGIES entry, an entry name ('Superconductor'),
// or a 2-array of types (convenience: describe what's live for a pair).
// Returns { name, desc, pair, pairNames, flags } (flags is a copy) or null
// for unknown input — render nothing.
export function describeSynergy(entry) {
  let def = null;
  if (typeof entry === 'string') {
    def = SYNERGIES.find(s => s.name === entry);
  } else if (Array.isArray(entry) && entry.length === 2) {
    def = SYNERGIES.find(s =>
      (s.pair[0] === entry[0] && s.pair[1] === entry[1]) ||
      (s.pair[0] === entry[1] && s.pair[1] === entry[0]));
  } else if (entry && Array.isArray(entry.pair)) {
    def = SYNERGIES.find(s => s.name === entry.name && s.pair[0] === entry.pair[0]);
  }
  if (!def) return null;
  return {
    name: def.name,
    desc: def.desc,
    pair: [...def.pair],
    pairNames: [WEAPON_NAMES[def.pair[0]], WEAPON_NAMES[def.pair[1]]],
    flags: { ...def.flags },
  };
}
