// HORDES — G8 STEP 3: CONDITION-SHAPE RUN-ALTERING CARDS ("run rules").
//
// The owner's G8 decision (docs/HORDES_GOALS_2026-09-12.md) is option 6,
// sequenced 1 -> 3 -> 4 -> 2. Step 1 (luck touches the draft) landed in tick 4;
// this file is STEP 3: run-altering items in the CONDITION shape — cards that
// add a persistent RULE to the run instead of a bigger number.
//
// TWO CARDS, each a real trade the player can read in one line:
//
//   HORDE BAIT  (hordebait) — every chest is a horde, and every chest rolls ONE
//     RARITY HIGHER. The rule is the price: no chest can be opened any more
//     without a horde landing on the player. The payout is the bump
//     (common -> rare -> legendary -> gamble), so the chest you take is always
//     the better one. Hooked through src/chests.js rollContents/applyContents.
//   ONE OF EACH (once) — no stat card is ever offered twice: a stat card the
//     run has already taken leaves the draft pool for the rest of the run. It
//     removes the stat-STACKING axis (the axis tick 4 measured), and the pool
//     TILTS TOWARD WEAPONS as the stats run out. G8 step 2 RETUNE (the debt
//     TICK NOTE 7 measured at 0.65x baseline survival; the retune measures
//     1.31x, sims at tools/draft_sim.mjs): under the rule the tilt actually
//     PAYS — a weapon level-up card grants +1 BONUS level, a weapon grant
//     lands at Lv2, and the ladder never ends: an at-cap level-up card stays
//     offered and converts to +10% weapon damage (src/main.js pick(), the
//     multi/volleyAtProjCap precedent). The +10% is the measured flat of the
//     conversion grid (5%/8%/10% all 1.31x; 12% 1.48x; 15% 3.53x; 20% 8.76x —
//     the compounding cliff starts past 10%, so 10% ships with margin).
//
// WHERE THE RULES LIVE: on the RUN player (`state.player.rules` and
// `state.player.takenStats`), exactly like the draft-taper counters, so a fresh
// makePlayer() means a fresh run and none of it enters the save schema.
//
// PURE BY DESIGN: every helper here is a pure function of (state, value) — no
// rng, no DOM, no mutation outside the two writers the game calls. That is what
// lets test/test_run_rules.mjs measure the rules with no browser and no sim.
export const RULES = {
  hordebait: {
    id: 'hordebait',
    name: 'Horde Bait',
    desc: 'RUN RULE - every chest is a horde; every chest rolls one rarity higher',
  },
  once: {
    id: 'once',
    name: 'One of Each',
    desc: 'RUN RULE - no stat card twice; weapon picks +1 bonus level; maxed picks +10% damage',
  },
};
export const RULE_IDS = Object.keys(RULES);

// The chest rarity ladder, LOW to HIGH. src/chests.js declares
// CHESTS.RARITY_WEIGHTS in this same order; test/test_run_rules.mjs asserts the
// two agree, so the ladder cannot silently drift out of the bump.
// GAMBLE IS DELIBERATELY ABSENT: it is not a rarity any more, it is its own
// independent roll (CHESTS.GAMBLE_CHANCE), so HORDE BAIT cannot bump a chest
// into it — and no chest can be bumped OUT of it either.
export const CHEST_RARITY_LADDER = ['common', 'rare', 'epic', 'legendary'];

// The weight ONE run-rule card carries in the draft pool. Deliberately low: a
// rule is a run-defining pick and must never crowd out the weapon economy (the
// draft sim's lever L1 measures the weapon/stat ratio, and it stays true).
export const RULE_CARD_WEIGHT = 0.10;

// ---------- readers --------------------------------------------------------
export function rulesOf(state) {
  const p = state && state.player;
  return (p && p.rules) || null;
}
export function hasRule(state, id) {
  const r = rulesOf(state);
  return !!(r && r[id]);
}
/** One step UP the chest ladder; the top band holds (gamble stays gamble). */
export function chestRarityBump(rarity) {
  const i = CHEST_RARITY_LADDER.indexOf(rarity);
  if (i < 0 || i >= CHEST_RARITY_LADDER.length - 1) return rarity;
  return CHEST_RARITY_LADDER[i + 1];
}
/** The rarity a chest actually rolls, with the HORDE BAIT rule applied. */
export function ruledChestRarity(rarity, state) {
  return hasRule(state, 'hordebait') ? chestRarityBump(rarity) : rarity;
}
/** Is this stat card still allowed in the level-up pool? */
export function statCardOffered(id, state) {
  if (!hasRule(state, 'once')) return true;
  const taken = (state.player && state.player.takenStats) || {};
  return !taken[id];
}
/** A rule can be TAKEN once; after that its card leaves the pool. */
export function ruleCardOffered(id, state) {
  return !hasRule(state, id);
}

// ---------- writers -------------------------------------------------------
/** Record that the run has taken this stat card (read only by `once`). */
export function markStatTaken(state, id) {
  if (!state || !state.player || !id) return;
  if (!state.player.takenStats) state.player.takenStats = {};
  state.player.takenStats[id] = 1;
}
/** Grant a rule. Returns true only when the id is a real rule. */
export function grantRule(state, id) {
  if (!RULES[id] || !state || !state.player) return false;
  if (!state.player.rules) state.player.rules = {};
  state.player.rules[id] = true;
  return true;
}
/** The draft cards for every rule the run does not already hold. */
export function ruleCards(state) {
  const out = [];
  for (const id of RULE_IDS) {
    if (!ruleCardOffered(id, state)) continue;
    const r = RULES[id];
    out.push({
      id: 'rule_' + id,
      rule: id,
      name: r.name,
      desc: r.desc,
      weight: RULE_CARD_WEIGHT,
      // Same contract as every other draft card: apply(player).
      apply: (p) => { if (!p.rules) p.rules = {}; p.rules[id] = true; },
    });
  }
  return out;
}
