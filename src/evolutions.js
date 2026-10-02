// HORDES — WEAPON EVOLUTIONS.
// Pure data + requirement checks; main.js wires the overlay and the gameplay
// flags, weapons.js reads the flags and affixes. No DOM, no rng, no state.
//
// A weapon evolves when BOTH hold:
//   1. it is at max level (weapons.js WEAPON_MAX_LEVEL)
//   2. the run has taken its PARTNER card — one of the common stat cards in
//      config.js UPGRADES (the draft shows "evolves with <partner>" on every
//      weapon level-up card, and the partner card says which weapons it opens).
// No token, no item roll: a run that drafts toward an evolution gets it.
//
// AFFIXES are applied per weapon by weapons.js with the loot-stat convention:
//   damageMult  multiplies the weapon's damage
//   rateMult    multiplies its attack rate (cooldowns divide by it)
//   crit        additive crit chance for this weapon's hits
//   critMult    additive bonus to the crit damage multiplier
// FLAGS are the behaviour changes (two per form), read by the update paths.

import { WEAPON_MAX_LEVEL, WEAPON_NAMES } from './weapons.js';
import { UPGRADES } from './config.js';

export const EVOLUTION_DEFS = {
  VOLLEY: {
    id: 'NOVA_SHOT', weapon: 'VOLLEY', name: 'Nova Shot', partner: 'multi',
    desc: 'Every round pierces the whole lane and bursts into a nova on a kill.',
    affixes: { damageMult: 2, crit: 0.15 },
    flags: ['pierceAll', 'novaRounds'],
  },
  ORBIT: {
    id: 'TWIN_ORBIT', weapon: 'ORBIT', name: 'Twin Orbit', partner: 'rate',
    desc: 'A second counter-rotating blade ring; contact ticks come twice as often.',
    affixes: { damageMult: 1.5, rateMult: 1.25 },
    flags: ['twinOrbit', 'bladeStorm'],
  },
  BOOMERANG: {
    id: 'VOID_RANG', weapon: 'BOOMERANG', name: 'Void Rang', partner: 'dmg',
    desc: 'Thrown faster, both legs pass through everything, and every hit drags the victim toward you.',
    affixes: { damageMult: 2.0, rateMult: 1.5 },
    flags: ['pierceAll', 'voidPull'],
  },
  JAVELIN: {
    id: 'SOLAR_LANCE', weapon: 'JAVELIN', name: 'Solar Lance', partner: 'speed',
    desc: 'The spear flies 2.5x as far, and every enemy it passes bursts into a small sun.',
    affixes: { damageMult: 1.6, crit: 0.1 },
    flags: ['longLane', 'sunBurst'],
  },
  ZAP: {
    id: 'TESLA_TEMPEST', weapon: 'ZAP', name: 'Tesla Tempest', partner: 'pierce',
    desc: 'Chains fork at every jump, and a second bolt strikes the next-nearest enemy.',
    affixes: { damageMult: 1.8, critMult: 1.0 },
    flags: ['chainZap', 'forkBolt'],
  },
  NOVA_PULSE: {
    id: 'SUPERNOVA', weapon: 'NOVA_PULSE', name: 'Supernova', partner: 'pickup',
    desc: 'Pulses reach 1.5x as far and come twice as often.',
    affixes: { damageMult: 1.5 },
    flags: ['bigBoom', 'novaChain'],
  },
  SCYTHE: {
    id: 'GRAVE_HARVEST', weapon: 'SCYTHE', name: 'Grave Harvest', partner: 'hp',
    desc: 'The sweep becomes a full circle, and every kill in it heals you.',
    affixes: { damageMult: 1.5, crit: 0.20 },
    flags: ['wideReap', 'harvestSouls'],
  },
  EMBER: {
    id: 'INFERNO', weapon: 'EMBER', name: 'Inferno', partner: 'rate',
    desc: 'Fires faster; kill bursts pay full damage over 1.5x the radius and leave burning ground.',
    affixes: { damageMult: 1.7, rateMult: 1.3, crit: 0.1 },
    flags: ['bigBurst', 'burnGround'],
  },
  RICOCHET: {
    id: 'PRISM_SHOT', weapon: 'RICOCHET', name: 'Prism Shot', partner: 'multi',
    desc: 'Twice the bounces over 1.5x the range, and every impact throws a shard at the next enemy.',
    affixes: { damageMult: 1.4 },
    flags: ['splitBounce', 'endlessBounce'],
  },
  SEEKER: {
    id: 'HYDRA_SWARM', weapon: 'SEEKER', name: 'Hydra Swarm', partner: 'speed',
    desc: 'Every hit hatches two more missiles, and lost missiles hunt three times as long.',
    affixes: { damageMult: 2, rateMult: 1.3, critMult: 0.5 },
    flags: ['hydraSplit', 'eternalHunt'],
  },
  METEOR: {
    id: 'METEOR_STORM', weapon: 'METEOR', name: 'Meteor Storm', partner: 'dmg',
    desc: 'Twice the rocks fall faster, and every crater burns the ground.',
    affixes: { damageMult: 1.3 },
    flags: ['storm', 'crater'],
  },
  MINE: {
    id: 'VOLCANIC_FIELD', weapon: 'MINE', name: 'Volcanic Field', partner: 'hp',
    desc: 'Blasts reach 1.5x as far, and each detonation sets off its neighbours in a rolling chain.',
    affixes: { damageMult: 1.7 },
    flags: ['bigBoom', 'chainMine'],
  },
  BEAM: {
    id: 'GODLANCE', weapon: 'BEAM', name: 'Godlance', partner: 'pierce',
    desc: 'The beam splits into three lanes, each 30% wider.',
    affixes: { damageMult: 1.6, crit: 0.25 },
    flags: ['prismSplit', 'solarFlare'],
  },
};

/** The partner card's display name (config.js UPGRADES), or the id. */
export function partnerName(cardId) {
  const u = UPGRADES.find(x => x.id === cardId);
  return u ? u.name : cardId;
}

/** Weapon ids whose evolution a stat card opens (for the card's own text). */
export function weaponsOpenedBy(cardId) {
  return Object.values(EVOLUTION_DEFS).filter(d => d.partner === cardId).map(d => d.weapon);
}

// ownedCards: the run's takenStats ledger ({ id: 1 }), a Set, or an array.
function hasCard(ownedCards, id) {
  if (!ownedCards) return false;
  if (ownedCards instanceof Set) return ownedCards.has(id);
  if (Array.isArray(ownedCards)) return ownedCards.includes(id);
  return !!ownedCards[id];
}

// ---------- evolutionProgress ---------------------------------------------
// What a weapon still needs. Null for a weapon with no evolution.
//   { def, level, levelReq, partner, partnerName, partnerOwned, levelsLeft, ready, evolved }
export function evolutionProgress(weapon, ownedCards) {
  const def = weapon && EVOLUTION_DEFS[weapon.type];
  if (!def) return null;
  const level = weapon.level || 1;
  const partnerOwned = hasCard(ownedCards, def.partner);
  const evolved = !!weapon.evolutionId;
  return {
    def, level, levelReq: WEAPON_MAX_LEVEL,
    partner: def.partner, partnerName: partnerName(def.partner), partnerOwned,
    levelsLeft: Math.max(0, WEAPON_MAX_LEVEL - level),
    ready: !evolved && level >= WEAPON_MAX_LEVEL && partnerOwned,
    evolved,
  };
}

// ---------- evolveWeapon ---------------------------------------------------
// evolveWeapon(weapon, ownedCards). Never throws on bad input.
//   { ok: true,  weapon, name }   the SAME instance, mutated in place with
//                                 evolutionId + evolution (a def copy)
//   { ok: false, reason, weapon } weapon untouched; reason:
//       'type'     unknown weapon / no evolution defined
//       'evolved'  already evolved (idempotent no-op)
//       'level'    below WEAPON_MAX_LEVEL
//       'partner'  the partner card has not been taken this run
export function evolveWeapon(weapon, ownedCards) {
  const def = weapon && EVOLUTION_DEFS[weapon.type];
  if (!def) return { ok: false, reason: 'type', weapon: weapon || null };
  if (weapon.evolutionId) return { ok: false, reason: 'evolved', weapon };
  if ((weapon.level || 1) < WEAPON_MAX_LEVEL) return { ok: false, reason: 'level', weapon };
  if (!hasCard(ownedCards, def.partner)) return { ok: false, reason: 'partner', weapon };
  weapon.evolutionId = def.id;
  weapon.evolution = { ...def, affixes: { ...def.affixes }, flags: [...def.flags] };
  return { ok: true, weapon, name: def.name };
}

// ---------- describeEvolution ----------------------------------------------
// UI card for the evolve screen and the weapon list. Accepts a weapon instance
// or a weapon id string; null for unknown ids.
export function describeEvolution(weaponOrId) {
  const id = typeof weaponOrId === 'string' ? weaponOrId : (weaponOrId && weaponOrId.type);
  const def = EVOLUTION_DEFS[id];
  if (!def) return null;
  return {
    id: def.id,
    weaponId: def.weapon,
    weaponName: WEAPON_NAMES[def.weapon] || def.weapon,
    name: def.name,
    desc: def.desc,
    partner: def.partner,
    partnerName: partnerName(def.partner),
    levelReq: WEAPON_MAX_LEVEL,
    affixes: { ...def.affixes },
    flags: [...def.flags],
    evolved: typeof weaponOrId === 'object' ? Boolean(weaponOrId.evolutionId === def.id) : false,
  };
}
