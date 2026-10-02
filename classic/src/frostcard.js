// HORDES — N1 slice 2: the draftable FROST_NOVA card ("Pocket Frost").
//
// WHY (docs/briefs/N1_SLICE2_FROST_CARD.md): FROST_NOVA leaves the Q slot
// (the Witch moved to CHAIN_REACTION in slice 1; the other three classes move
// to their ults in slice 3) and returns as the DRAFTABLE card that keeps the
// shipped spell reachable for every class. Without this card, slice 3 would
// silently delete FROST_NOVA from the game.
//
// THE SHAPE: a run-owned, AUTO-FIRED frost nova. Take the card and, for the
// rest of the run, a FROST_NOVA erupts from the player whenever it is off
// cooldown and the pool can pay — driven through the EXISTING
// useSkill(state, 'FROST_NOVA') seam, at FROST_NOVA's OWN unchanged numbers
// (the owner ruled NO balance change; test_chain_q.mjs pins the constants).
//
// PAY-ONLY-WHEN-YOU-CAN: useSkill returns false and touches nothing when the
// cooldown is armed or the pool is short, so in a dry run the card is inert —
// the failure mode is "you do not see a nova", never "your mana is gone".
// ONE cooldown: the nova rides the existing p.skillCd.FROST_NOVA slot through
// skillCooldown (perks.js), so FOCUS's -15% applies and there is no second
// timer. NO new button, NO hijacked readout: the Q button and tc-q keep
// naming the class's own Q (classSkillId). Taken ONCE per run; the flag
// lives on the run-local p.skills bag (perks.js precedent — never in the
// save schema, no migration, nothing to persist).
//
// PURE WHERE IT CAN BE: no rng, no DOM, no timers of its own — the same
// discipline that lets test_perks.mjs measure without a browser.
import { skillManaCost } from './perks.js';
import { useSkill } from './skills.js';

export const FROST_CARD_ID = 'skill_frost';
// Same weight ONE skill card carries in the perk family (SKILL_CARD_WEIGHT
// 0.04, perks.js): that number is MEASURED (the draft-sim curve in TICK NOTE
// 6 of docs/HORDES_GOALS_2026-09-12.md), and this card is the same product
// shape — one always-on pickup among the perk cards — so it rides the same
// measured knob rather than inventing a second one.
export const FROST_CARD_WEIGHT = 0.04;

// The run's class-Q skill id. classSkillId is module-private in main.js (it
// is exposed only on the __TEST seam, and importing main.js here would close
// an import cycle), so read the id exactly the way main.js:4553 does.
function classQSkillId(state) {
  const ch = state && state.character;
  return (ch && ch.skill) || 'FROST_NOVA';
}

/** Offered exactly when the run does not already hold it AND the class Q is
 * not FROST_NOVA (a paid no-op there). Read against the LIVE class skill id,
 * never a hardcoded class list, so slice 3 needs no follow-up edit here. */
export function frostCardOffered(state) {
  if (!state) return false;
  return !hasFrost(state) && classQSkillId(state) !== 'FROST_NOVA';
}

/** The one card, shaped exactly like a skillCards (perks.js) entry so pick()
 * treats it as the same family: skill-keyed, apply(player), never in the
 * `once` stat ledger. The apply writes the run-local flag and nothing else. */
export function frostCard() {
  return {
    id: FROST_CARD_ID,
    skill: 'frost',
    name: 'Frost Nova',
    desc: 'SKILL - a frost nova erupts from you on its cooldown',
    weight: FROST_CARD_WEIGHT,
    apply: (p) => { if (!p.skills) p.skills = {}; p.skills.frost = true; },
  };
}

/** The writer. Returns true only for a real state. */
export function grantFrost(state) {
  if (!state || !state.player) return false;
  if (!state.player.skills) state.player.skills = {};
  state.player.skills.frost = true;
  return true;
}

/** The reader the tick and the HUD both use. */
export function hasFrost(state) {
  const p = state && state.player;
  return !!(p && p.skills && p.skills.frost);
}

/** The per-frame drive. Inert without the card or outside 'playing'.
 * Otherwise: when the nova's OWN cooldown slot is ready and the pool can pay
 * the SAME price useSkill would charge, fire through the real seam and
 * return its result; else return false. NO new timer, NO rng, NO DOM.
 * `dt` is accepted to prove dt-independence in the test and deliberately not
 * read: the cooldown is already dt-driven by the sim (updateResources ticks
 * p.skillCd down by dt), so the cast decision is an EVENT, not a rate — a
 * 60Hz and a 120Hz frame see the same cooldown and the same pool. */
export function frostCardTick(state, dt) {   // eslint-disable-line no-unused-vars
  if (!hasFrost(state)) return false;
  if (state.mode !== 'playing') return false;
  const p = state.player;
  if ((p.skillCd.FROST_NOVA || 0) > 0) return false;
  if (p.mana < skillManaCost('FROST_NOVA', state)) return false;
  return useSkill(state, 'FROST_NOVA');
}
