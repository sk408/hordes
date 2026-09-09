// HORDES — WAVE-9/A: HEAT SYSTEM (megabonk-style difficulty ledger).
// Sk408: difficulty keeps scaling with what you TAKE — evolved weapons and
// items carry a built-in difficulty increase — plus a user-engaged dial.
//
// GUARD (Sk408, explicit): the hero exchanges items at the 4/4 cap
// constantly, so per-pickup scaling would run away. ITEM_EXCHANGE is
// permanently +0 heat. Only a NEW empty-slot equip, a weapon EVOLUTION, or a
// manual push costs heat.
//
// THE LEDGER lives on the run object (hb1 seeds it at startRun, or the first
// addHeat call lazily creates it):
//   run.heat = { total, manual, events: Set<string> }
//     total   — accumulated heat (soft-capped at HEAT_CAP)
//     manual  — count of APPLIED MANUAL_PUSHes (drives goldMult; see below)
//     events  — event ids already charged (idempotence guard so hb1 cannot
//               double-charge a level-up tick that fires twice)
//
// PURE HELPERS: heatMultipliers / goldMult / describeHeat never mutate; the
// only mutator is addHeat (and it touches ONLY run.heat).

// ---------- Tuning ----------
export const HEAT_CAP = 20;

// Per-source heat costs. ITEM_EXCHANGE.amount MUST stay 0 (the guard above).
export const HEAT_SOURCES = {
  WEAPON_EVOLUTION: { id: 'WEAPON_EVOLUTION', amount: 2, label: 'Weapon evolved' },
  NEW_ITEM_SLOT:    { id: 'NEW_ITEM_SLOT',    amount: 1, label: 'Item equipped (new slot)' },
  ITEM_EXCHANGE:    { id: 'ITEM_EXCHANGE',    amount: 0, label: 'Item exchanged (free)' },
  MANUAL_PUSH:      { id: 'MANUAL_PUSH',      amount: 1, label: 'Stakes raised' },
};

// Multiplier growth per point of heat (gentle, compounding-safe: linear in h).
export const HEAT_CURVES = {
  HP: 0.12,         // foe max hp       x (1 + 0.12 h)   -> +36% at heat 3
  DAMAGE: 0.08,     // foe damage       x (1 + 0.08 h)
  SPAWN_RATE: 0.06, // spawn clock rate x (1 + 0.06 h)   (divide the interval)
  GOLD: 0.30,       // MANUAL pushes ONLY — see goldMult
};

// ---------- Multipliers (pure) ----------
// heatMultipliers(heat, manualPushes = 0) -> { hp, damage, spawnRate, gold }.
// BUILT-IN heat (evolutions, new slots) does NOT inflate gold — the `gold`
// field is goldMult(manualPushes), so callers that only pass heat always get
// gold: 1. The gold reward exists to pay the player for using the dial, not
// to make free built-in power self-funding.
export function heatMultipliers(heat, manualPushes = 0) {
  const h = Math.max(0, heat || 0);
  return {
    hp:        1 + HEAT_CURVES.HP * h,
    damage:    1 + HEAT_CURVES.DAMAGE * h,
    spawnRate: 1 + HEAT_CURVES.SPAWN_RATE * h,
    gold:      goldMult(manualPushes),
  };
}

// goldMult(manualPushes) — driven by the MANUAL count ONLY, never by total
// heat: evolutions/new-slot equips must not inflate gold payouts.
export function goldMult(manualPushes = 0) {
  return 1 + HEAT_CURVES.GOLD * Math.max(0, manualPushes || 0);
}

// ---------- Ledger accessors ----------
export function heatOf(run) {
  return (run && run.heat && run.heat.total) || 0;
}

export function manualPushes(run) {
  return (run && run.heat && run.heat.manual) || 0;
}

// Explicit init for hb1's startRun (idempotent; addHeat also lazy-inits).
export function initHeat(run) {
  if (!run.heat) run.heat = { total: 0, manual: 0, events: new Set() };
  return run.heat;
}

// ---------- The one mutator ----------
// addHeat(run, source, amount = null, eventId = null)
//   source  — HEAT_SOURCES key ('WEAPON_EVOLUTION' | 'NEW_ITEM_SLOT' |
//             'ITEM_EXCHANGE' | 'MANUAL_PUSH')
//   amount  — optional override of the source's tuned cost
//   eventId — optional dedupe id: if this id was already charged, the call is
//             IGNORED (guards against a level-up tick firing twice)
// Returns { applied, added, heat, reason } — applied:false means the source
// was rejected ('source' unknown / 'duplicate' eventId). applied:true with
// added:0 is a successful no-charge: ITEM_EXCHANGE (always free) or a full
// ledger (reason 'cap'). ITEM_EXCHANGE always applies +0 so hb1 can call it
// on every swap without special-casing.
export function addHeat(run, source, amount = null, eventId = null) {
  const def = HEAT_SOURCES[source];
  if (!def) return { applied: false, added: 0, heat: heatOf(run), reason: 'source' };

  const ledger = initHeat(run);
  if (eventId != null) {
    if (ledger.events.has(eventId)) {
      return { applied: false, added: 0, heat: ledger.total, reason: 'duplicate' };
    }
    ledger.events.add(eventId);
  }

  const want = amount == null ? def.amount : amount;
  // Soft cap: heat never exceeds HEAT_CAP (partial fills allowed; the excess
  // is dropped, not banked).
  const room = Math.max(0, HEAT_CAP - ledger.total);
  const added = Math.min(room, Math.max(0, want));
  ledger.total += added;
  if (def.id === 'MANUAL_PUSH' && added > 0) ledger.manual += added;

  return { applied: true, added, heat: ledger.total, reason: added < want ? 'cap' : 'ok' };
}

// ---------- HUD ----------
// describeHeat(heat) -> one-liner for the HUD, e.g. 'HEAT 3 (+36% foe HP)'.
export function describeHeat(heat) {
  const h = Math.max(0, heat || 0);
  const pct = Math.round(HEAT_CURVES.HP * h * 100);
  return `HEAT ${h} (+${pct}% foe HP)`;
}
