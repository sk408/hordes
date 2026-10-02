// HORDES — WEAPON FUSIONS.
// Pure data + requirement checks; main.js wires the offer overlay and the link
// behaviours, weapons.js runs both halves, render.js paints the marks. No DOM,
// no rng.
//
// Two EVOLVED weapons that form a listed pair fuse into ONE weapon:
//   - the host (pair[0]) stays in the kit and carries the other half on
//     `host.fused`; the other half leaves the weapon list, so its slot is free
//     (the Volley never takes a slot, so a Volley fusion frees the partner's);
//   - both halves keep attacking (weapons.js updateWeapons runs the pair) with
//     their damage multiplied by `mult`;
//   - the `flags` add the link behaviour that makes the two act as one weapon
//     (main.js wireFusions and the volley fire loop read them);
//   - `tint` and `mark` are the fused weapon's colours and its 5x5 emblem
//     ('a' = tint[0], 'b' = tint[1]), painted on every body it throws.
// A weapon fuses once. A weapon listed in two pairs fuses with whichever
// partner the player takes.

import { WEAPON_NAMES } from './weapons.js';

export const FUSION_MULT = 1.5;

export const FUSION_DEFS = [
  {
    id: 'ORBITAL_VOLLEY', pair: ['VOLLEY', 'ORBIT'], name: 'Orbital Volley',
    desc: 'Every round loops once around you with the blades, then flies at the nearest enemy and pierces one more body.',
    flags: { orbitVolley: true },
    tint: ['#9af0ff', '#3a8ad8'], mark: ['.aaa.', 'a...a', 'a.b.a', 'a...a', '.aaa.'],
  },
  {
    id: 'SUN_LANE', pair: ['VOLLEY', 'JAVELIN'], name: 'Sun Lane',
    desc: 'Every Volley salvo throws a half-strength spear down its lane, and every spear throw is flanked by two extra rounds.',
    flags: { volleySpear: 0.5, javelinEscort: 2 },
    tint: ['#fff0a0', '#ff9a2a'], mark: ['..a..', '..a..', 'bbabb', '..a..', '..a..'],
  },
  {
    id: 'SUPERCONDUCTOR', pair: ['ZAP', 'BEAM'], name: 'Superconductor',
    desc: 'Every beam grounds the storm: a free lightning chain leaps from the beam\'s target through four more enemies.',
    flags: { beamZapChain: 4 },
    tint: ['#ffffff', '#ff6ad8'], mark: ['a...b', '.a.b.', '..a..', '.b.a.', 'b...a'],
  },
  {
    id: 'BLOODHOUND_RANG', pair: ['BOOMERANG', 'SEEKER'], name: 'Bloodhound Rang',
    desc: 'The rang hunts on its way home: the return leg steers at the nearest enemy, and each catch launches a missile.',
    flags: { boomerangHoming: true, catchMissile: true },
    tint: ['#ffb0b0', '#d83a3a'], mark: ['a....', 'ab...', '.ab..', '..aba', '...aa'],
  },
  {
    id: 'CHAIN_REACTION', pair: ['NOVA_PULSE', 'MINE'], name: 'Chain Reaction',
    desc: 'Every pulse sets off all mines inside its ring at once.',
    flags: { novaDetonatesMines: true },
    tint: ['#ffe07a', '#b05ad8'], mark: ['.bbb.', 'b.a.b', 'baaab', 'b.a.b', '.bbb.'],
  },
  {
    id: 'HARVEST_FIRE', pair: ['SCYTHE', 'EMBER'], name: 'Harvest Fire',
    desc: 'Every enemy the sweep kills bursts like an ember kill and leaves burning ground.',
    flags: { scytheEmberBurst: true },
    tint: ['#ffd080', '#e0401a'], mark: ['..a..', '.aba.', 'abbba', '.bbb.', '..b..'],
  },
  {
    id: 'STORM_BOUNCE', pair: ['RICOCHET', 'ZAP'], name: 'Storm Bounce',
    desc: 'Every ricochet impact throws a lightning spark at the nearest enemy the shot has not touched.',
    flags: { ricochetZapFork: true },
    tint: ['#d8f4ff', '#5a7aff'], mark: ['..a..', '.ab..', 'aabaa', '..ba.', '..a..'],
  },
  {
    id: 'CRATER_FIELD', pair: ['METEOR', 'MINE'], name: 'Crater Field',
    desc: 'A landing meteor sets off every mine in its crater, and each crater seeds a fresh mine.',
    flags: { meteorDetonatesMines: true, craterMine: true },
    tint: ['#efe0ff', '#ff7a2a'], mark: ['b.b.b', '.aaa.', 'baaab', '.aaa.', 'b.b.b'],
  },
  {
    id: 'GRAVITY_WELL', pair: ['NOVA_PULSE', 'ORBIT'], name: 'Gravity Well',
    desc: 'Every pulse drags the enemies in its ring a quarter of the way onto your blades.',
    flags: { novaPull: 0.25 },
    tint: ['#c8a8ff', '#5a3ad8'], mark: ['a.a.a', '.b.b.', 'a.b.a', '.b.b.', 'a.a.a'],
  },
  {
    id: 'THRESHING_STORM', pair: ['SCYTHE', 'ZAP'], name: 'Threshing Storm',
    desc: 'Every sweep throws lightning from the arc\'s edge that chains through three enemies.',
    flags: { scytheArcZap: 3 },
    tint: ['#e8ffff', '#3ad8c0'], mark: ['aaa..', '..ba.', '...ba', '..ba.', 'aaa..'],
  },
  {
    id: 'FIRE_FOCUS', pair: ['MINE', 'BEAM'], name: 'Fire Focus',
    desc: 'The beam sets off every mine it sweeps, and each beam leaves a mine at its far end.',
    flags: { beamDetonatesMines: true, beamSeedsMine: true },
    tint: ['#ffd0d0', '#ff3a4a'], mark: ['....a', '...ab', '..ab.', '.ab..', 'bb...'],
  },
];

const BY_ID = Object.fromEntries(FUSION_DEFS.map(d => [d.id, d]));

/** A fusion def by id, or null. */
export function fusionDef(id) { return BY_ID[id] || null; }

/** Every weapon in the kit, fused halves included (for by-type lookups). */
export function kitWeapons(weapons) {
  const out = [];
  for (const w of weapons || []) {
    if (!w) continue;
    out.push(w);
    if (w.fused) out.push(w.fused);
  }
  return out;
}

/** The kit's weapon of this type, whether it holds a slot or rides a fusion. */
export function findKitWeapon(weapons, type) {
  return kitWeapons(weapons).find(w => w.type === type) || null;
}

/** The fusions this weapon type can enter. */
export function fusionsFor(type) {
  return FUSION_DEFS.filter(d => d.pair.includes(type));
}

function topLevel(weapons, type) {
  return (weapons || []).find(w => w && w.type === type) || null;
}

// ---------- fusionCandidates ------------------------------------------------
// Every fusion the kit can make right now, in table order:
//   [{ def, host, partner }] — both halves hold their own place in the list,
// both are evolved, neither is fused. `declined` (a Set of def ids) hides the
// offers the player deferred.
export function fusionCandidates(weapons, declined) {
  const out = [];
  for (const def of FUSION_DEFS) {
    if (declined && declined.has(def.id)) continue;
    const host = topLevel(weapons, def.pair[0]);
    const partner = topLevel(weapons, def.pair[1]);
    if (!host || !partner) continue;
    if (!host.evolutionId || !partner.evolutionId) continue;
    if (host.fusionId || partner.fusionId) continue;
    out.push({ def, host, partner });
  }
  return out;
}

// ---------- fuseWeapons -----------------------------------------------------
// fuseWeapons(weapons, defOrId) mutates the weapon LIST in place.
//   { ok: true, weapon, partner, name }  the host now carries the fusion and
//                                        the partner; the partner has left the
//                                        list (one slot is free)
//   { ok: false, reason }                nothing changed; reason:
//       'fusion'   unknown fusion
//       'pair'     a half is not in the list
//       'evolved'  a half is not evolved
//       'fused'    a half is already part of a fusion
export function fuseWeapons(weapons, defOrId) {
  const def = typeof defOrId === 'string' ? BY_ID[defOrId] : (defOrId && BY_ID[defOrId.id]);
  if (!def || !Array.isArray(weapons)) return { ok: false, reason: 'fusion' };
  const host = topLevel(weapons, def.pair[0]);
  const partner = topLevel(weapons, def.pair[1]);
  if (!host || !partner) return { ok: false, reason: 'pair' };
  if (host.fusionId || partner.fusionId) return { ok: false, reason: 'fused' };
  if (!host.evolutionId || !partner.evolutionId) return { ok: false, reason: 'evolved' };
  const copy = () => ({ id: def.id, name: def.name, desc: def.desc, pair: [...def.pair],
    mult: def.mult || FUSION_MULT, flags: { ...def.flags } });
  host.fusionId = def.id;
  host.fusion = copy();
  host.fused = partner;
  partner.fusionId = def.id;
  partner.fusion = copy();
  weapons.splice(weapons.indexOf(partner), 1);
  return { ok: true, weapon: host, partner, name: def.name };
}

// ---------- fusionProgress --------------------------------------------------
// Where a weapon stands on its fusion roads. Null for a weapon with none.
//   { fused, selfEvolved, options: [{ def, partner, partnerName, inKit,
//     partnerEvolved, ready }] }
// `inKit` = the partner holds its own place in the list and is not fused.
export function fusionProgress(weapon, weapons) {
  if (!weapon) return null;
  const defs = fusionsFor(weapon.type);
  if (!defs.length) return null;
  const selfEvolved = !!weapon.evolutionId;
  const options = defs.map(def => {
    const partner = def.pair[0] === weapon.type ? def.pair[1] : def.pair[0];
    const pw = topLevel(weapons, partner);
    const inKit = !!pw && !pw.fusionId;
    const partnerEvolved = inKit && !!pw.evolutionId;
    return { def, partner, partnerName: WEAPON_NAMES[partner] || partner, inKit, partnerEvolved,
      ready: !weapon.fusionId && selfEvolved && partnerEvolved };
  });
  return { fused: !!weapon.fusionId, selfEvolved, options };
}

// ---------- fusionRoadText --------------------------------------------------
// The one line a weapon card and the STATS screen show. By default only the
// partners in the kit count (a draft card must not promise a weapon the run
// cannot have); `all` lists every partner. '' when there is nothing to say.
export function fusionRoadText(weapon, weapons, all = false) {
  const pr = fusionProgress(weapon, weapons);
  if (!pr || pr.fused) return '';
  const ready = pr.options.filter(o => o.ready);
  if (ready.length) return 'FUSES NOW: ' + ready.map(o => o.def.name).join(' or ');
  const inKit = pr.options.filter(o => o.inKit);
  const list = inKit.length ? inKit : (all ? pr.options : []);
  if (!list.length) return '';
  return 'fuses with ' + list.map(o => o.partnerName).join(' or ') + ' once both are evolved' +
    (inKit.length ? '' : ' (not in this kit)');
}

// ---------- describeFusion --------------------------------------------------
// UI card for the fusion offer and the collection shelf. Accepts a def or an
// id; null for unknown input.
export function describeFusion(defOrId) {
  const def = typeof defOrId === 'string' ? BY_ID[defOrId] : (defOrId && BY_ID[defOrId.id]);
  if (!def) return null;
  return {
    id: def.id, name: def.name, desc: def.desc,
    pair: [...def.pair],
    pairNames: [WEAPON_NAMES[def.pair[0]] || def.pair[0], WEAPON_NAMES[def.pair[1]] || def.pair[1]],
    mult: def.mult || FUSION_MULT,
    flags: { ...def.flags },
    tint: [...def.tint],
    mark: [...def.mark],
  };
}

/** The fusion a body kind belongs to in this kit ('volley' for kindless shots). */
const BODY_WEAPON = {
  volley: 'VOLLEY', boomerang: 'BOOMERANG', seeker: 'SEEKER', mine: 'MINE',
  javelin: 'JAVELIN', ember: 'EMBER', ricochet: 'RICOCHET',
  orbit: 'ORBIT', nova_pulse: 'NOVA_PULSE', beam: 'BEAM', zap: 'ZAP', scythe_arc: 'SCYTHE',
};
export function fusionByBodyKind(weapons) {
  const byType = {};
  for (const w of kitWeapons(weapons)) if (w.fusionId) byType[w.type] = BY_ID[w.fusionId];
  const out = {};
  let any = false;
  for (const [kind, type] of Object.entries(BODY_WEAPON)) {
    if (byType[type]) { out[kind] = byType[type]; any = true; }
  }
  return any ? out : null;
}
