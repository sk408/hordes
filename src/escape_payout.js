// HORDES — the escape's payout. The escape after the wave-1 boss banks
// bestGold x K, plus the Escape Writ's bonus when the profile owns it. The
// credit is a direct bank write (profile.gold): it never enters the run purse
// or the run's settlement, so it can never appear in a run total.
import { ensureAchievements } from './achievements.js';

// One tunable constant. 12000 best gold banks 800 per escape.
export const PAYOUT_K = 1 / 15;

// The Escape Writ (shop row `escapeskip`): the escape pays this much more.
export const WRIT = { SHOP_ID: 'escapeskip', BONUS_PCT: 200 };

// The profile's best single-run gold (0 for a profile that never finished a run).
export function bestGoldOf(profile) {
  const a = ensureAchievements(profile);
  return a.totals.bestGold | 0;
}

export function hasWrit(profile) {
  return !!(profile && profile.purchased && (profile.purchased[WRIT.SHOP_ID] | 0) >= 1);
}

// The payout for a best-run gold. Floored once for the base, once for the bonus.
export function payoutFor(bestGold, writ = false) {
  const base = Math.floor(bestGold * PAYOUT_K);
  return writ ? base + Math.floor(base * WRIT.BONUS_PCT / 100) : base;
}

// What this profile's escape pays now.
export function escapeWorth(profile) {
  return payoutFor(bestGoldOf(profile), hasWrit(profile));
}

// Bank `amount` (the worth read when the escape began). Returns what was banked.
export function bankEscape(profile, amount) {
  const p = Math.max(0, amount | 0);
  if (p > 0) profile.gold += p;
  return p;
}
