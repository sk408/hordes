// HORDES — G36 SHARED SUSTAINED-HEALING BUDGET (owner 2026-09-16: "Ok let's fix
// it, yeah"). ONE seam bounding every THROUGHPUT heal in the game.
//
// WHY ONE SEAM: the same defect appeared at two independent sites — the
// lifesteal heal (main.js, fixed first by the G34 token bucket) and the GRAVE
// HARVEST evolution's 2-HP-per-kill sweep heal (weapons.js:542-543, found by
// the G35 unseeded hunt) — both heal at a rate proportional to damage dealt or
// kills, which scales with the compounding damage shop while inbound damage is
// bounded (~0.83 x maxHp/s: 0.5x hit cap + 0.6s i-frames). Capping the sites
// one at a time just moves the symptom to the next site; the class is closed
// by making every throughput site SPEND from one shared per-run budget.
//
// THE BOUNDARY (deliberate, do not widen casually): the budget governs
// THROUGHPUT heals — heal proportional to damage dealt or kills. It does NOT
// govern:
//   - POTIONS (skills.js usePotion): a deliberate consumable burst escape,
//     stock-capped (3/kind) and supply-rate-bounded (G33 adaptive drops).
//   - REGROWTH (perks.js applyRegrowth): a flat 0.7 HP/s trickle, far below
//     any inbound rate that matters.
//   - THE CONSECRATION ALTAR (skills.js :238): already INDEPENDENTLY capped at
//     DPS*TICK per tick by its own design (config.js :236-237, "so it cannot
//     out-heal a boss") — the banked-and-capped precedent this budget copied.
//   - One-shot grants (level-up heal, healOnChest, Iron Heart cards, Second
//     Wind): event-bounded or once-per-run, not throughput.
// The completeness table for EVERY heal source lives in the G36 report entry
// (docs/HORDES_GOALS_2026-09-12.md, G36).
//
// Mechanics: state.healBudget (HP units) refills LINEARLY at
// CONFIG.HEAL_BUDGET.CAP_FRAC * maxHp per second (dt-driven, never wall clock),
// clamped to a one-second budget so a burst inside a second still lands in full
// while the SUSTAINED rate — from ALL throughput sites combined — is bounded.
// Both helpers are PURE and allocation-free; the caller owns the accumulator.
// Supersedes the G34 loot.js helpers (same bodies, shared name).

// One dt-driven refill step: bucket + budget*dt, clamped to the one-second
// budget (capFrac * maxHp). dt = 0 is a frozen no-op; a negative bucket (an
// over-debit bug elsewhere) is corrected here. PURE.
export function refillHealBudget(bucket, dt, maxHp, capFrac) {
  const budget = capFrac * maxHp;
  if (!(dt > 0)) return Math.min(budget, Math.max(0, bucket));
  return Math.min(budget, Math.max(0, bucket) + budget * dt);
}

// The amount a throughput heal actually grants: min(want, bucket). Below the
// cap this is EXACTLY the uncapped want (byte-identical to the pre-G34
// formulas); above it the shared bucket binds and the caller debits the
// returned amount. PURE.
export function healFromBudget(bucket, want) {
  return want > 0 ? Math.min(want, Math.max(0, bucket)) : 0;
}
