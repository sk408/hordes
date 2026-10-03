// HORDES — src/boss_rules.js
//
// BOSS RULES. From wave 2 on, each wave's boss brings one named rule. The
// rule holds from the boss's arrival until the boss falls (on a double wave
// the first of the two: that death wins the wave), and beating the boss
// under it pays the reward the rule names. A run draws its
// rules from the pool below in a seeded order, so no rule repeats until every
// rule has come up. The intermission and the wave's first toast name the rule
// ahead of the fight; a plate under the boss bar shows it during the fight.
// The RULEBREAKER joker breaks a rule (no effect) and keeps its reward.
//
// Pure rules + data: no DOM, no Math.random (callers pass rng). main.js owns
// the run state (`state.bossRule`) and applies what a rule does.

export const BOSS_RULE_FIRST_WAVE = 2;   // wave 1's boss stays as it was

// fx: enemySpeed, spawnRate (groups per spawn tick) and bossHp are multipliers;
// guards is a count of elites that arrive with the boss; noPotions and
// noSkills block the action.
// reward: 'chest' | 'card' | 'heal'.
export const BOSS_RULES = [
  { id: 'stampede', name: 'THE STAMPEDE', rule: 'enemies move 25% faster', fx: { enemySpeed: 1.25 }, reward: 'chest' },
  { id: 'chorus', name: 'THE CHORUS', rule: 'enemies arrive 50% faster', fx: { spawnRate: 1.5 }, reward: 'chest' },
  { id: 'guard', name: 'THE GUARD', rule: 'two elites guard the boss', fx: { guards: 2 }, reward: 'chest' },
  { id: 'wall', name: 'THE WALL', rule: 'the boss has 50% more health', fx: { bossHp: 1.5 }, reward: 'card' },
  { id: 'silence', name: 'THE SILENCE', rule: 'skills are sealed', fx: { noSkills: true }, reward: 'card' },
  { id: 'drought', name: 'THE DROUGHT', rule: 'potions do nothing', fx: { noPotions: true }, reward: 'heal' },
];
export const BOSS_RULE_BY_ID = Object.fromEntries(BOSS_RULES.map(r => [r.id, r]));
export const BOSS_RULE_REWARDS = { chest: 'a chest', card: 'a free card', heal: 'a full heal and a potion' };

export const BOSS_RULE_HINT = 'This boss brings a rule. Beat the boss to win the reward on its banner.';

// The run's rule order: every rule once, shuffled with `rng`.
export function rollRuleOrder(rng) {
  const ids = BOSS_RULES.map(r => r.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids;
}

// Can this rule do anything in this run? `ctx.potions` = the run carries potions.
export function ruleApplies(id, ctx = {}) {
  if (id === 'drought') return ctx.potions !== false;
  return !!BOSS_RULE_BY_ID[id];
}

// The rule the boss of `wave` brings (null on wave 1, or with no order). A
// rule that cannot do anything in this run gives its turn to the next one.
export function ruleForWave(order, wave, ctx = {}) {
  const w = Math.floor(wave);
  if (!order || !order.length || !(w >= BOSS_RULE_FIRST_WAVE)) return null;
  for (let k = 0; k < order.length; k++) {
    const id = order[(w - BOSS_RULE_FIRST_WAVE + k) % order.length];
    if (ruleApplies(id, ctx)) return BOSS_RULE_BY_ID[id];
  }
  return null;
}

// "THE DROUGHT: potions do nothing" and "win a full heal and a potion".
export function ruleLine(def) { return def ? def.name + ': ' + def.rule : ''; }
export function rewardLine(def) { return def ? 'win ' + BOSS_RULE_REWARDS[def.reward] : ''; }

// The live rule's effects, or null: the rule is armed and not broken.
export function ruleFx(state) {
  const r = state && state.bossRule;
  if (!r || !r.live || r.broken) return null;
  const def = BOSS_RULE_BY_ID[r.id];
  return def ? def.fx : null;
}
// Does the live rule block `what` ('potions' | 'skills')?
export function ruleBlocks(state, what) {
  const fx = ruleFx(state);
  return !!fx && (what === 'potions' ? !!fx.noPotions : what === 'skills' ? !!fx.noSkills : false);
}
