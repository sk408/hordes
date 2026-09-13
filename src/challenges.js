// HORDES — challenges (G11: SELECTABLE RUN MODES).
//
// WHY THIS FILE EXISTS
// The owner asked for "challenge play modes". The opt-in DIFFICULTY axis
// already exists and is src/heat.js (G24's rule: harder pays more), so these
// modes are deliberately RULE changes, never stat multipliers — a constraint
// the player chooses, not a dial that pays. Nothing here touches heat.js and
// nothing here pays a gold bonus or penalty: a challenge run settles gold
// EXACTLY like a standard run with the same kills/time.
//
// THE CONTRACT (docs/briefs/G11_CHALLENGE_MODES.md PART B)
//   * Pure and declarative: no DOM, no game state, so a headless test owns it.
//   * rules.weaponSlots — the run's weapon-slot CEILING (ONE_WEAPON: 1).
//   * rules.potions     — the run's STARTING potion count, forced (NO_POTIONS: 0).
//   * Nothing about a challenge run is persisted: no profile field, no schema
//     bump, no storage key. main.js holds the pending choice in a module-level
//     let (session-scoped) and stamps it onto run-scoped state at startRun().
//     A reload returns to STANDARD by construction.
//
// Application is ONE seam per rule inside startRun() — this file never reads
// or writes the run itself, it only describes the constraint.

export const DEFAULT_CHALLENGE_ID = 'STANDARD';

export const CHALLENGES = [
  { id: 'STANDARD', name: 'STANDARD RUN', blurb: 'the game as designed', rules: {} },
  { id: 'ONE_WEAPON', name: 'ONE WEAPON', blurb: 'one weapon slot, the whole run', rules: { weaponSlots: 1 } },
  { id: 'NO_POTIONS', name: 'NO POTIONS', blurb: 'no potions, start to end', rules: { potions: 0 } },
];

export const CHALLENGE_IDS = CHALLENGES.map(c => c.id);
export const CHALLENGE_BY_ID = CHALLENGES.reduce((m, c) => { m[c.id] = c; return m; }, {});

// TOTAL over garbage: a missing/unknown id IS the standard run. A save that
// somehow names a mode this build deleted degrades to STANDARD, never throws.
export function challengeOf(id) {
  return CHALLENGE_BY_ID[id] || CHALLENGE_BY_ID[DEFAULT_CHALLENGE_ID];
}

export function isStandard(id) {
  return challengeOf(id).id === DEFAULT_CHALLENGE_ID;
}

// The rules object to apply. STANDARD (and any unknown id) applies {} — no
// rule, today's numbers. Callers get a FRESH object so they cannot mutate the
// catalog by editing the result.
export function challengeRules(id) {
  const rules = challengeOf(id).rules;
  return { ...rules };
}

// The cycle the title menu walks, wrapping both ways.
export function nextChallengeId(id) {
  const i = CHALLENGE_IDS.indexOf(challengeOf(id).id);
  return CHALLENGE_IDS[(i + 1) % CHALLENGE_IDS.length];
}

export function prevChallengeId(id) {
  const i = CHALLENGE_IDS.indexOf(challengeOf(id).id);
  return CHALLENGE_IDS[(i - 1 + CHALLENGE_IDS.length) % CHALLENGE_IDS.length];
}

// The one-line player-facing string. This is the ONLY sanctioned phrasing
// surface — the title card, the HUD badge and the end screen all render it so
// the three can never disagree about which mode is live.
export function describeChallenge(id) {
  const c = challengeOf(id);
  return c.id === DEFAULT_CHALLENGE_ID ? c.name : c.name + ' — ' + c.blurb;
}
