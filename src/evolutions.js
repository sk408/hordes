// HORDES — WEAPON EVOLUTIONS (megabonk-style super-forms; Sk408-approved).
// Self-contained: this module owns requirement checks + data ONLY. hb1 wires
// the gameplay flags and the UI. Nothing here touches the DOM, rng, or other
// modules' state — pure logic, deterministic, headless-testable.
//
// REQUIREMENTS to evolve a weapon (all three, checked in this order):
//   1. weapon at max level (weapons.js WEAPON_MAX_LEVEL = Lv8)
//   2. one equipped rare item of the evolution's ITEM KIND equipped.
//      "Kind" = an AFFIX_POOL id from loot.js (e.g. 'crit' = any item whose
//      affixes include Keen Eye). Loose pairing by design; the full mapping
//      is documented per-def below and summarized in EVOLUTION_DEFS.
//   3. 1 EVOLUTION TOKEN (chests.js legendary chests already offer these via
//      EVOLUTION_TOKENS / the tokenOffer event — hb1 tracks the count).
//
// AFFIX SEAM: evolved forms reuse the same four fields loot.js puts on
// player.stats, but applied PER-WEAPON by hb1 (multiply into the weapon's
// damage/cooldown math exactly like dmgScale()/rateScale() do in weapons.js):
//   damageMult — multiplicative on the weapon's final damage
//   rateMult   — multiplicative on attack rate (cooldowns DIVIDE by it)
//   crit       — ADDITIVE crit chance for this weapon's hits (0..1)
//   critMult   — ADDITIVE bonus to the crit damage multiplier (e.g. 0.5 = +50%
//                crit damage; final = (player.critMult || 1.5) + this)
// Missing fields are neutral (absent => no change) — same convention as
// weapons.js loot wiring.
//
// BEHAVIOR FLAGS: at most 2 new pure-data flags per form (hb1 wires them into
// the update functions; unknown flags must be ignored so this file can ship
// ahead of the gameplay wiring).

import { WEAPON_MAX_LEVEL, WEAPON_NAMES } from './weapons.js';
import { AFFIX_POOL } from './loot.js';

// Item-kind pairing (loot.js AFFIX_POOL ids — one DISTINCT kind per weapon):
//   VOLLEY     -> crit       (Keen Eye:         the aimed kill shot)
//   ORBIT      -> rateMult   (Rapid Trigger:    blades spin faster)
//   BOOMERANG  -> damageMult (Brutal Edge:      a heavier edge returns harder)
//   ZAP        -> critMult   (Executioner:      voltage that executes)
//   NOVA_PULSE -> pickupMult (Loot Vortex:      the pull before the burst)
//   SCYTHE     -> lifesteal  (Vampiric:         the reaper's harvest)
//   SEEKER     -> speedMult  (Windwalker:       faster pursuit)
//   MINE       -> thorns     (Spiked Hide:      trap armor)
//   BEAM       -> xpMult     (Scholar's Mind:   focused study, focused light)
export const EVOLUTION_TOKEN_COST = 1;

export const EVOLUTION_DEFS = {
  VOLLEY: {
    id: 'NOVA_SHOT', weapon: 'VOLLEY', name: 'Nova Shot',
    desc: 'Split Shot maxed: every volley round pierces the whole lane and detonates a micro-nova on a kill.',
    itemKind: 'crit',
    affixes: { damageMult: 1.5, crit: 0.15 },
    flags: ['pierceAll', 'novaRounds'],
  },
  ORBIT: {
    id: 'TWIN_ORBIT', weapon: 'ORBIT', name: 'Twin Orbit',
    desc: 'A second counter-rotating blade ring; contact ticks come twice as often and twice as hard.',
    itemKind: 'rateMult',
    affixes: { damageMult: 1.4, rateMult: 1.25 },
    flags: ['twinOrbit', 'bladeStorm'],
  },
  BOOMERANG: {
    id: 'VOID_RANG', weapon: 'BOOMERANG', name: 'Void Rang',
    desc: 'The return leg phases through the void: full pierce both ways, and it drags enemies toward the thrower.',
    itemKind: 'damageMult',
    affixes: { damageMult: 1.6 },
    flags: ['pierceAll', 'voidPull'],
  },
  ZAP: {
    id: 'TESLA_TEMPEST', weapon: 'ZAP', name: 'Tesla Tempest',
    desc: 'Chains fork at every jump and crits execute — the storm decides who is finished.',
    itemKind: 'critMult',
    affixes: { damageMult: 1.3, critMult: 1.0 },
    flags: ['chainZap', 'forkBolt'],
  },
  NOVA_PULSE: {
    id: 'SUPERNOVA', weapon: 'NOVA_PULSE', name: 'Supernova',
    desc: 'Each pulse sucks the horde inward before the blast; pulses chain back-to-back.',
    itemKind: 'pickupMult',
    affixes: { damageMult: 1.8, rateMult: 1.2 },
    flags: ['bigBoom', 'novaChain'],
  },
  SCYTHE: {
    id: 'GRAVE_HARVEST', weapon: 'SCYTHE', name: 'Grave Harvest',
    desc: 'The sweep becomes a full circle and every kill harvests a sliver of life.',
    itemKind: 'lifesteal',
    affixes: { damageMult: 1.5, crit: 0.20 },
    flags: ['wideReap', 'harvestSouls'],
  },
  SEEKER: {
    id: 'HYDRA_SWARM', weapon: 'SEEKER', name: 'Hydra Swarm',
    desc: 'Cut one missile down and two more hatch — the hunt does not end while a target lives.',
    itemKind: 'speedMult',
    affixes: { rateMult: 1.3, critMult: 0.5 },
    flags: ['hydraSplit', 'eternalHunt'],
  },
  MINE: {
    id: 'VOLCANIC_FIELD', weapon: 'MINE', name: 'Volcanic Field',
    desc: 'Blasts crater-wide, and each detonation sets off its neighbors in a rolling chain.',
    itemKind: 'thorns',
    affixes: { damageMult: 1.7 },
    flags: ['bigBoom', 'chainMine'],
  },
  BEAM: {
    id: 'GODLANCE', weapon: 'BEAM', name: 'Godlance',
    desc: 'The beam splits through a prism of the first sunrise; everything in every lane burns.',
    itemKind: 'xpMult',
    affixes: { damageMult: 2.0, crit: 0.25 },
    flags: ['prismSplit', 'solarFlare'],
  },
};

const AFFIX_SEAM = ['damageMult', 'rateMult', 'crit', 'critMult'];
const KINDS = new Set(AFFIX_POOL.map(a => a.id));

// ---------- evolveWeapon ---------------------------------------------------
// evolveWeapon(weapon, equippedItemKinds, tokenCount)
//   weapon            weapon instance ({ type, level }) from weapons.js
//   equippedItemKinds array OR Set of AFFIX_POOL ids the player has equipped
//                     (hb1 derives it: inventory.flatMap(it => it.affixes.map(a => a.id)))
//   tokenCount        number of evolution tokens the player holds
//
// Returns (rollPaidChest-style result object; NEVER throws on bad input):
//   { ok: true,  weapon, name, tokens }  — success: weapon is the SAME instance,
//                                          mutated in place with evolutionId +
//                                          evolution (a def copy); tokens is the
//                                          count AFTER spending (tokenCount - cost).
//   { ok: false, reason, weapon }        — failure; weapon is UNTOUCHED.
//     reason: 'type'     unknown weapon id / no evolution defined
//             'evolved' already evolved (idempotent no-op; no token spent)
//             'level'    below WEAPON_MAX_LEVEL
//             'item'     required item kind not equipped
//             'token'    not enough tokens
export function evolveWeapon(weapon, equippedItemKinds, tokenCount) {
  const def = weapon && EVOLUTION_DEFS[weapon.type];
  if (!def) return { ok: false, reason: 'type', weapon: weapon || null };
  if (weapon.evolutionId) return { ok: false, reason: 'evolved', weapon };

  if ((weapon.level || 1) < WEAPON_MAX_LEVEL) return { ok: false, reason: 'level', weapon };

  const kinds = equippedItemKinds instanceof Set ? equippedItemKinds : (equippedItemKinds || []);
  const hasKind = typeof kinds.has === 'function' ? kinds.has(def.itemKind) : kinds.includes(def.itemKind);
  if (!hasKind) return { ok: false, reason: 'item', weapon };

  const cost = EVOLUTION_TOKEN_COST;
  if ((tokenCount || 0) < cost) return { ok: false, reason: 'token', weapon };

  // Success: mutate the instance (levelUpWeapon precedent) + spend the token.
  weapon.evolutionId = def.id;
  weapon.evolution = { ...def, affixes: { ...def.affixes }, flags: [...def.flags] };
  return { ok: true, weapon, name: def.name, tokens: (tokenCount || 0) - cost };
}

// ---------- describeEvolution ----------------------------------------------
// UI card for the evolution screen. Accepts a weapon instance OR a weapon id
// string. Pre-evolved weapons come back with evolved: true so the card can
// render as "ACHIEVED". Returns null for unknown ids (render nothing).
export function describeEvolution(weaponOrId) {
  const id = typeof weaponOrId === 'string' ? weaponOrId : (weaponOrId && weaponOrId.type);
  const def = EVOLUTION_DEFS[id];
  if (!def) return null;
  const kind = AFFIX_POOL.find(a => a.id === def.itemKind);
  return {
    id: def.id,
    weaponId: def.weapon,
    weaponName: WEAPON_NAMES[def.weapon] || def.weapon,
    name: def.name,
    desc: def.desc,
    itemKind: def.itemKind,
    itemKindName: kind ? kind.name : def.itemKind,
    levelReq: WEAPON_MAX_LEVEL,
    tokenCost: EVOLUTION_TOKEN_COST,
    affixes: { ...def.affixes },
    flags: [...def.flags],
    evolved: typeof weaponOrId === 'object' ? Boolean(weaponOrId.evolutionId === def.id) : false,
  };
}
