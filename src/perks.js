// HORDES — G8 STEP 4: GENERAL SKILL ITEMS (the perk card family).
//
// The owner's G8 decision (docs/HORDES_GOALS_2026-09-12.md) is option 6,
// sequenced 1 -> 3 -> 4 -> 2. Step 1 (luck touches the draft) landed in tick 4
// and step 3 (condition-shape run rules) in tick 5; this file is STEP 4: small
// ALWAYS-ON perks offered in the level-up draft, a card family distinct from
// the stat cards (bigger numbers) and the rule cards (persistent conditions).
//
// WHY THE MODULE IS CALLED `perks`, NOT `skills`: src/config.js already owns
// SKILLS = the player-triggered ACTIVE abilities (FROST_NOVA / OVERCHARGE on
// Q/W). A second code concept named SKILL would be ambiguous forever. The
// PLAYER-FACING label on a card in this family is still "SKILL - ...".
//
// THREE CARDS, each taken ONCE per run (the card leaves the pool after being
// taken, exactly like a run-rule card — so at most 3 can ever be held, which
// keeps the power increase bounded and measurable):
//
//   REGROWTH    (regrowth) — flat 0.7 HP/s, always on. Deliberately NOT a
//     percentage: a percent would scale into a long run exactly when the
//     x5.25 contact curve decides it; a flat rate decays instead.
//   FOCUS       (focus) — Q/W abilities cost 20% less mana and cool down 15%
//     faster. Touches the ability layer, which the draft pool had NEVER
//     touched before this family.
//   THICK SKIN  (thick) — incoming damage to the player is 12% lower. Scales
//     against the contact curve multiplicatively (every hostile path that
//     removes player HP funnels through damageTaken below).
//
// WHERE THE PERKS LIVE: on the RUN player (`state.player.skills`), exactly
// beside `rules` / `takenStats` (src/rules.js precedent), so a fresh
// makePlayer() is a fresh run and NOTHING enters the save schema (no
// migration, no persistence).
//
// PURE BY DESIGN: every helper here is a pure function of (state, value) — no
// rng, no DOM, no mutation outside the two writers the game calls
// (grantSkill, applyRegrowth). That is what lets test/test_perks.mjs measure
// the perks with no browser. The applied-value helpers (hpRegenPerSec,
// skillManaCost, skillCooldown, damageTakenMult) are the ONE source of truth
// the game reads, so the HUD cannot lie about what a perk changed.
import { CONFIG as C } from './config.js';
// G21 slice 1 (C2): the empty-rewrite-slot cooldown payment, read in exactly
// ONE place (skillCooldown below). rewrites.js imports config only, so this
// edge stays acyclic.
import { emptySlotCooldownMult } from './rewrites.js';

export const SKILL_PERKS = {
  regrowth: {
    id: 'regrowth',
    name: 'Regrowth',
    desc: 'SKILL - heal 0.7 HP per second, always on',
  },
  focus: {
    id: 'focus',
    name: 'Focus',
    desc: 'SKILL - skills cost 20% less mana and cool down 15% faster',
  },
  thick: {
    id: 'thick',
    name: 'Thick Skin',
    desc: 'SKILL - incoming damage to you is 12% lower',
  },
};
export const SKILL_PERK_IDS = Object.keys(SKILL_PERKS);

// ---------- effect constants (the knobs; ONE place to tune) ------------------
// Flat on purpose (see the header): a rate, never a fraction of anything.
export const REGROWTH_HP_PER_SEC = 0.7;
export const FOCUS_MANA_MULT = 0.8;        // -20% mana cost on Q/W
export const FOCUS_COOLDOWN_MULT = 0.85;   // -15% cooldown on Q/W
export const THICK_TAKEN_MULT = 0.88;      // -12% incoming damage

// The weight ONE skill card carries in the draft pool (three cards -> family
// weight 0.12). This is the ONE knob, and it is MEASURED, not guessed: at the
// originally sketched 0.10 (family 0.30) the two G8 content families together
// (0.60 added to a ~4.1-weight pool) dropped the good cohort's mean survival
// by ~20% and broke the draft sim's median divergence bar on most seeds —
// the run-level measurement that landed with this file. Tuned to 0.04
// alongside RULE_CARD_WEIGHT 0.15 -> 0.10 (family total 0.60 -> 0.32), the
// sim's canonical invocation passes again and the mean good/bad ratio holds
// 1.40-1.79 across 10 seeds x 60 runs. The full curve is in TICK NOTE 6 of
// docs/HORDES_GOALS_2026-09-12.md; change this constant only with a new curve.
export const SKILL_CARD_WEIGHT = 0.04;

// ---------- readers -----------------------------------------------------------
export function perksOf(state) {
  const p = state && state.player;
  return (p && p.skills) || null;
}
export function hasSkill(state, id) {
  const s = perksOf(state);
  return !!(s && s[id]);
}
/** A perk can be TAKEN once; after that its card leaves the pool. */
export function skillCardOffered(id, state) {
  return !hasSkill(state, id);
}
/** The perk ids this run currently holds, in catalog order. */
export function skillsHeld(state) {
  const s = perksOf(state) || {};
  return SKILL_PERK_IDS.filter(id => s[id]);
}
/** The draft cards for every perk the run does not already hold. */
export function skillCards(state) {
  const out = [];
  for (const id of SKILL_PERK_IDS) {
    if (!skillCardOffered(id, state)) continue;
    const k = SKILL_PERKS[id];
    out.push({
      id: 'skill_' + id,
      skill: id,
      name: k.name,
      desc: k.desc,
      weight: SKILL_CARD_WEIGHT,
      // Same contract as every other draft card: apply(player).
      apply: (p) => { if (!p.skills) p.skills = {}; p.skills[id] = true; },
    });
  }
  return out;
}

// ---------- writers -----------------------------------------------------------
/** Grant a perk. Returns true only when the id is a real perk. */
export function grantSkill(state, id) {
  if (!SKILL_PERKS[id] || !state || !state.player) return false;
  if (!state.player.skills) state.player.skills = {};
  state.player.skills[id] = true;
  return true;
}

// ---------- the applied-value helpers the GAME reads --------------------------
// One source of truth, so the sim, the HUD and the damage funnel cannot
// disagree about what a perk is worth.
/** HP per second Regrowth heals (0 without the perk). */
export function hpRegenPerSec(state) {
  return hasSkill(state, 'regrowth') ? REGROWTH_HP_PER_SEC : 0;
}
/** Mana a skill costs AFTER Focus (unknown ids cost 0, like useSkill's guard).
 * N1b item 6: the meta/character manaCostMult (Thrifty Casting x the Witch's
 * 0.5) multiplies in here too — ONE discount number, BOTH cost seams (this and
 * weaponManaCost in weapons.js), never a second read inside useSkill. */
export function skillManaCost(defId, state) {
  const def = C.SKILLS[defId];
  if (!def) return 0;
  const mult = (hasSkill(state, 'focus') ? FOCUS_MANA_MULT : 1)
    * ((state && state.player && state.player.stats
      && state.player.stats.manaCostMult) || 1);
  return def.MANA * mult;
}
/** Cooldown a skill rolls onto AFTER Focus. */
export function skillCooldown(defId, state) {
  const def = C.SKILLS[defId];
  if (!def) return 0;
  // RSS8: a FLAT_CD def is EXACTLY its COOLDOWN — the Focus perk and the
  // empty-rewrite-slot economy do not touch it. The Magnet Collector card
  // states "30s cooldown" in its own draft copy, and a stated number the run
  // quietly shaves to 24s is precisely the "specials do not explain what you
  // get" complaint; the owner's 30s rhythm is the whole contract.
  if (def.FLAT_CD) return def.COOLDOWN;
  // G21 slice 1 (C2): the empty-rewrite-slot payment multiplies the COOLDOWN
  // part ONLY, HERE — the ONE applied-value read — so the game and the HUD
  // can never disagree. A kill-charged ult's KILL count never touches this
  // (its charge is kills banked on the player); its cooldown FLOOR rolls on
  // through this same line (useSkill), so the floor comes out after the mult.
  return def.COOLDOWN * (hasSkill(state, 'focus') ? FOCUS_COOLDOWN_MULT : 1) *
    emptySlotCooldownMult(state);
}
/** Multiplier on incoming damage AFTER Thick Skin (1 without the perk). */
export function damageTakenMult(state) {
  return hasSkill(state, 'thick') ? THICK_TAKEN_MULT : 1;
}
/** THE funnel: every path that removes player HP routes its amount through
 * here (drain / contact / shot / the boss-curse heal tax). PURE. */
export function damageTaken(state, amount) {
  return amount * damageTakenMult(state);
}

// ---------- the ONE per-frame regen step --------------------------------------
// Regrowth's HP regen, dt-scaled (nothing may assume a fixed dt: 60Hz and
// 120Hz must both be right). Called from BOTH existing resource seams in
// main.js (the play loop and the finale loop) — never duplicated inline.
// Returns the HP actually healed (0 without the perk or at full HP).
export function applyRegrowth(state, dt) {
  const p = state && state.player;
  if (!p) return 0;
  const heal = hpRegenPerSec(state) * dt;
  if (heal <= 0) return 0;
  const room = p.stats.maxHp - p.hp;
  if (room <= 0) return 0;
  const applied = Math.min(heal, room);
  p.hp += applied;
  return applied;
}
