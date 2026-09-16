// HORDES — G6: THE COHERENCE INSTRUMENT (docs/briefs/G6_COHERENCE_INSTRUMENT.md).
// The SHARED, importable policy table for the `coherent` / `scatter` draft
// policies, read by tools/w7b_draft_ab.mjs at the SAME live seam (`el._draftOffer`)
// and by test/test_g6_coherence_policies.mjs — ONE module, so the two policies
// can never drift apart and the unit proof exercises the exact table the
// real-loop harness ships.
//
// WHY THIS FILE EXISTS (the brief allows ONE new tool file; the reason): the
// policy table cannot live importably in tools/w7b_draft_ab.mjs itself — that
// script executes its whole cohort at import (top-level `await bootReal(...)`),
// so any module that imported the table would boot Chrome first. The tier
// table therefore MOVED here verbatim (derived from the same live registries,
// same TIER_ORDER, same fallback chain) and w7b imports it back — one source
// of truth instead of two drifting copies. The good/bad POLICIES are
// unchanged in behaviour (byte-identical arm output, proven against pre-edit
// captures in the slice report); only their table's import path moved.
//
// THE INSTRUMENT (goals doc G6 charter, verbatim intent): "two policies that
// differ in BUILD COHERENCE (commit to one weapon family and its riders vs
// scatter across families), paired seeds, per-profile, hard-capped, stop at
// the sign". The design below: the two policies share ONE neutral (tier) rank
// block at IDENTICAL absolute ranks, so they differ ONLY on the coherence
// axis — any divergence the A/B measures cannot be re-read as "tier greed
// again" (suspicion point 4 against good/bad).
//
// POST-G26 DESIGN CONSTRAINT (owner 2026-09-15 re-scope): openDraft offers NO
// wpn_* grant cards; weapons enter the run ONLY through the pre-run LOADOUT,
// and the offer stream's weapon side is LEVEL-UP cards (`lvl_<TYPE>_<lv>`,
// weight 1) for exactly the brought kit. So:
//   - "new weapons when a slot is free" (coherent) and "new weapons over
//     level-ups" (scatter) have NO live surface — there are no grant offers to
//     rank. The available coherence axis is WHICH OWNED FAMILY the run
//     deepens (the committed weapon's level-up vs the other brought
//     weapons'), plus the G21 tag axis below.
//   - the tag axis: rewrite offers carry the G21 taxonomy (FROST / CHAIN /
//     ORBIT / BURN / CONDUCT) on `REWRITES[id].tags` — read THERE, never a
//     parallel taxonomy. The only places the LIVE CODE ties a tag to a weapon
//     type are the WIDE-ORBIT seams (rewrites.js `orbitEquipped` predicate:
//     offered only while an ORBIT weapon is equipped; weapons.js
//     wideOrbitRadiusMult/SpinMult read on the ORBIT update path; GLACIAL
//     ORBIT rides orbit contacts). WEAPON_TAG_LINK below is that derivation,
//     stated once: ORBIT <-> the ORBIT tag. Every other weapon type has NO
//     code-grounded tag today — an honest FINDING for the verdict (the tag
//     axis is wired for one weapon family out of nine), not something this
//     slice invents around.
//
// DETERMINISM: every export is a pure function of its arguments (the only
// state read is `state.weapons`); same inputs -> same ranks. The seeded
// pairing in w7b_draft_ab.mjs makes same-seed arms see identical offer
// streams until their picks diverge the game state.
//
// This module is import-safe: no DOM shims, no main.js import, no side effects.

import { UPGRADES, DRAFT_RARE_UPGRADES, DRAFT_MYTHIC_UPGRADES } from '../src/config.js';
import { DRAFT_RARITY } from '../src/meta.js';
import { RULE_IDS } from '../src/rules.js';
import { SKILL_PERK_IDS } from '../src/perks.js';
import { REWRITES, REWRITE_IDS } from '../src/rewrites.js';
import { FROST_CARD_ID } from '../src/frostcard.js';

// ======================= THE TIER TABLE (moved verbatim from ================
// ======================= tools/w7b_draft_ab.mjs — same registries) ===========
// TIER_ORDER is best -> worst for the good policy; a tier's INDEX is its good
// rank. All policies read this ONE list, so they can never drift apart.
export const TIER_ORDER = [
  'mythic',         // DRAFT_MYTHIC_UPGRADES (run-gated chase)
  'rare',           // DRAFT_RARE_UPGRADES (percent/scaling chase)
  'stat:RARE',      // flat family by DRAFT_RARITY (meta.js)
  'stat:UNCOMMON',
  'stat:COMMON',
  'weapon',         // NEW WEAPON grant + weapon level-up
  'family',         // RUN RULE / SKILL / REWRITE / Frost
  'unknown',
];
export const TIER_COUNT = TIER_ORDER.length;              // 8 — `bad` = 7 - good

export const ID_TIER = new Map();
for (const u of DRAFT_MYTHIC_UPGRADES) ID_TIER.set(u.id, 'mythic');
for (const u of DRAFT_RARE_UPGRADES) ID_TIER.set(u.id, 'rare');
for (const u of UPGRADES) ID_TIER.set(u.id, 'stat:' + (DRAFT_RARITY[u.id] || 'COMMON'));
for (const id of RULE_IDS) ID_TIER.set('rule_' + id, 'family');
for (const id of SKILL_PERK_IDS) ID_TIER.set('skill_' + id, 'family');
for (const id of REWRITE_IDS) ID_TIER.set('rewrite_' + id, 'family');
ID_TIER.set(FROST_CARD_ID, 'family');

// Markup fallback: classify off the LIVE rendered card markup only, exactly
// the way the offer is drawn by openDraft — badge first (so the RARE ladder's
// "Iron Heart" is never confused with the flat Iron Heart), then desc/name.
export function htmlTier(html) {
  const s = html || '';
  if (s.includes('>MYTHIC</div>')) return 'mythic';
  if (s.includes('>RARE</div>')) return 'rare';
  if (s.includes('NEW WEAPON')) return 'weapon';
  if (s.includes(' UP</div>')) return 'weapon';              // "<weapon> UP" name
  if (s.includes('RUN RULE') || s.includes('SKILL -')) return 'family';
  for (const u of DRAFT_RARE_UPGRADES) if (s.includes(u.name + '</div>')) return 'rare';
  for (const u of DRAFT_MYTHIC_UPGRADES) if (s.includes(u.name + '</div>')) return 'mythic';
  for (const u of UPGRADES) if (s.includes(u.name + '</div>')) return ID_TIER.get(u.id);
  return 'unknown';
}

/** Tier of one live offer: the offer OBJECT first (its id + the tier badge
 *  openDraft wrote), the rendered markup as the fallback. */
export function tierOf(offer, html) {
  if (offer) {
    if (offer.tier === 'MYTHIC') return 'mythic';
    if (offer.tier === 'RARE') return 'rare';
    if (offer.id) {
      const t = ID_TIER.get(offer.id);
      if (t) return t;
      if (offer.id.startsWith('wpn_') || offer.id.startsWith('lvl_')) return 'weapon';
    }
  }
  return htmlTier(html);
}

export const goodRank = (tier) => {
  const i = TIER_ORDER.indexOf(tier);
  return i < 0 ? TIER_COUNT - 1 : i;
};

// ==================== THE COHERENCE POLICIES (G6, additive) ==================
// The code-grounded weapon <-> G21-tag touch points (see header). If the game
// grows more linked weapons (e.g. a CONDUCT-linked ZAP), the link is added
// HERE and both policies move together.
export const WEAPON_TAG_LINK = { ORBIT: ['ORBIT'] };

/** The run's committed weapon family. Deterministic by construction: the
 *  FIRST non-VOLLEY weapon in `state.weapons` order (post-G26 that is the
 *  pre-run LOADOUT's first brought weapon — the commitment the player already
 *  made before the run; registry order breaks ties), falling back to VOLLEY
 *  when the kit is the default pair. No rng, no state mutation — same run,
 *  same commitment, every pick. */
export function committedWeapon(state) {
  const ws = (state && Array.isArray(state.weapons)) ? state.weapons : [];
  const first = ws.find(w => w && w.type && w.type !== 'VOLLEY');
  return (first || ws[0] || { type: 'VOLLEY' }).type;
}

/** Tags of one offer, read off the G21 taxonomy — null for anything that is
 *  not a rewrite card (stat/ladder/rule/skill/frost/level-up cards carry no
 *  taxonomy tags). */
export function offerTags(offer) {
  const id = (offer && offer.id) || '';
  if (!id.startsWith('rewrite_')) return null;
  return (REWRITES[id.slice('rewrite_'.length)] || {}).tags || [];
}

/** Coherence class of one offer relative to the committed family:
 *    'deepen'   — a level-up card for the COMMITTED weapon (deepens the family)
 *    'onfam'    — a rewrite card whose tags touch the committed weapon
 *    'otherlvl' — a level-up card for a different owned weapon (post-G26 this
 *                 is the scatter arm's "another family": all level-ups are
 *                 owned-kit cards; there are no grants)
 *    'offfam'   — a rewrite card whose tags do NOT touch the committed weapon
 *                 (untagged legacy rewrites included — they belong to no family)
 *    'neutral'  — everything else (ladder tiers, stat cards, rules, skills,
 *                 frost, unknown): no weapon-family read. */
export function coherenceClass(offer, committed) {
  const id = (offer && offer.id) || '';
  if (id.startsWith('lvl_')) {
    const m = /^lvl_(.+)_\d+$/.exec(id);
    if (m) return m[1] === committed ? 'deepen' : 'otherlvl';
  }
  if (id.startsWith('rewrite_')) {
    const tags = offerTags(offer) || [];
    const link = WEAPON_TAG_LINK[committed] || [];
    return tags.some(t => link.includes(t)) ? 'onfam' : 'offfam';
  }
  return 'neutral';
}
export const COH_CLASSES = ['deepen', 'onfam', 'otherlvl', 'offfam', 'neutral'];
export const isCoherencePolicy = (policy) => policy === 'coherent' || policy === 'scatter';

// The rank tables. The NEUTRAL block (every tier-ordered card) occupies the
// SAME absolute ranks in BOTH policies — a neutral offer's rank is
// NEUTRAL_BASE + goodRank(tier) whichever arm asks. The coherence classes
// wrap around it: coherent puts committed-family cards above the neutral
// block and everything off-family below it; scatter is the EXACT REVERSE of
// those four classes and NOTHING else. Tier greed is therefore IDENTICAL by
// construction between the two arms — the property
// test_g6_coherence_policies.mjs pins both structurally (per-offer rank
// equality on neutral classes) and empirically (tier-histogram overlap of the
// two arms' pick streams).
export const NEUTRAL_BASE = 2;
export const COH_RANK = {
  coherent: { deepen: 0, onfam: 1, otherlvl: 10, offfam: 11 },
  scatter: { otherlvl: 0, offfam: 1, deepen: 10, onfam: 11 },
};

/** Rank of one offer under a coherence policy (lower = picked first; ties
 *  resolve to the FIRST card in offer order, exactly like the good/bad loop).
 *  The neutral block reads the SAME goodRank the good/bad policies use —
 *  the tier table is never restated. */
export function g6Rank(policy, offer, tier, committed) {
  const cls = coherenceClass(offer, committed);
  if (cls === 'neutral') return NEUTRAL_BASE + goodRank(tier);
  const table = COH_RANK[policy];
  if (!table) throw new Error(`g6_coherence: unknown policy ${policy}`);
  return table[cls];
}

/** Pure pick over one draft's offers — the same comparison the w7b loop runs,
 *  factored so the unit test drives the EXACT policy table the harness ships.
 *  `cards` = [{ offer, html }]; returns the chosen INDEX. */
export function pickCoherence(policy, cards, committed) {
  let best = 0, bestRank = Infinity;
  for (let c = 0; c < cards.length; c++) {
    const offer = cards[c].offer;
    const tier = tierOf(offer, cards[c].html || '');
    const r = g6Rank(policy, offer, tier, committed);
    if (r < bestRank) { bestRank = r; best = c; }
  }
  return best;
}

/** The declared COHERENCE METRIC (brief: "share of picks that synergize with
 *  the run's committed family"): picks whose coherence class is `deepen` or
 *  `onfam` over all picks. Accepts offer objects or precomputed classes. */
export function coherenceShare(items, committed) {
  let hits = 0;
  for (const x of items || []) {
    const cls = typeof x === 'string' ? x : coherenceClass(x, committed);
    if (cls === 'deepen' || cls === 'onfam') hits++;
  }
  return (items || []).length ? hits / items.length : 0;
}
