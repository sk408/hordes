// HORDES — V1 escape PAYOUT (owner mechanism 2026-09-14): a completed escape
// pays bestGold x K as repeatable currency, K ONE tunable constant. The credit
// is a DIRECT bank write (profile.gold) — never runPurse, never the run
// settlement — so escape income can never enter a run total (the E1 purse
// separation test asserts exactly this shape). bestGold rides the achievements
// namespace (TOTALS_ZERO + the recordRun fold), an integer MAX: no rate is
// stored anywhere, so the intOr floor trap cannot fire at read time.
import { ensureAchievements } from '../achievements.js';
import { PAYOUT_K } from './config.js';

// The profile's best single-run gold (the achievements totals fold maintains
// it; a profile that never ran reads 0).
export function bestGoldOf(profile) {
  const a = ensureAchievements(profile);
  return a.totals.bestGold | 0;
}

// K is applied by MULTIPLICATION then floored ONCE, here — the only division
// in the mechanism, never at read time.
export function payoutFor(bestGold) {
  return Math.floor(bestGold * PAYOUT_K);
}

// Collect the payout into the BANK. Purely additive, repeatable: a veteran
// with bestGold 12000 collects 400 per completed escape, forever (the
// twice-in-a-row clause: the second collection is IDENTICAL — bestGold is a
// max, so collecting cannot grow it).
export function collect(profile) {
  const p = payoutFor(bestGoldOf(profile));
  if (p > 0) profile.gold += p;
  return p;
}
