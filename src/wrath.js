// HORDES — WRATH: the horde answers the build.
// Difficulty scales with what the run TAKES: every weapon evolution and every
// item slot filled makes enemies tougher, more dangerous and more numerous.
// It is the game's main difficulty lever through a run (a career simulation
// without it runs five times as long by run 11).
//
// This file was the HEAT system. The player-facing half of heat is gone: the
// RAISE THE STAKES dial, its gold and XP payouts and its readouts. What is
// left is the part that was never a choice, under a plain name.
//
// GUARD: the hero exchanges items at the 4/4 cap constantly, so per-pickup
// scaling would run away. ITEM_EXCHANGE is permanently +0. Only a NEW
// empty-slot equip or a weapon EVOLUTION costs wrath.
//
// THE LEDGER lives on the run object (startRun seeds it, or the first
// addWrath call lazily creates it):
//   run.wrath = { total, events: Set<string> }
//     total   — accumulated wrath (soft-capped at WRATH_CAP)
//     events  — event ids already charged (so a tick that fires twice cannot
//               charge twice)
//
// PURE HELPERS: wrathMultipliers / describeWrath never mutate; the only
// mutator is addWrath (and it touches ONLY run.wrath). Nothing here is saved.

// ---------- Tuning ----------
export const WRATH_CAP = 20;

// Per-source costs. ITEM_EXCHANGE.amount MUST stay 0 (the guard above).
export const WRATH_SOURCES = {
  WEAPON_EVOLUTION: { id: 'WEAPON_EVOLUTION', amount: 2, label: 'Weapon evolved' },
  NEW_ITEM_SLOT:    { id: 'NEW_ITEM_SLOT',    amount: 1, label: 'Item equipped (new slot)' },
  ITEM_EXCHANGE:    { id: 'ITEM_EXCHANGE',    amount: 0, label: 'Item exchanged (free)' },
};

// Multiplier growth per point of wrath (linear in t).
export const WRATH_CURVES = {
  HP: 0.12,         // foe max hp       x (1 + 0.12 t)   -> +36% at wrath 3
  DAMAGE: 0.08,     // foe damage       x (1 + 0.08 t)
  SPAWN_RATE: 0.06, // spawn clock rate x (1 + 0.06 t)   (divide the interval)
};

// ---------- Multipliers (pure) ----------
// wrathMultipliers(wrath) -> { hp, damage, spawnRate }.
export function wrathMultipliers(wrath) {
  const t = Math.max(0, wrath || 0);
  return {
    hp:        1 + WRATH_CURVES.HP * t,
    damage:    1 + WRATH_CURVES.DAMAGE * t,
    spawnRate: 1 + WRATH_CURVES.SPAWN_RATE * t,
  };
}

// ---------- Ledger accessors ----------
export function wrathOf(run) {
  return (run && run.wrath && run.wrath.total) || 0;
}

// Explicit init for startRun (idempotent; addWrath also lazy-inits).
export function initWrath(run) {
  if (!run.wrath) run.wrath = { total: 0, events: new Set() };
  return run.wrath;
}

// ---------- The one mutator ----------
// addWrath(run, source, amount = null, eventId = null)
//   source  — WRATH_SOURCES key ('WEAPON_EVOLUTION' | 'NEW_ITEM_SLOT' |
//             'ITEM_EXCHANGE')
//   amount  — optional override of the source's tuned cost
//   eventId — optional dedupe id: if this id was already CHARGED, the call is
//             IGNORED. It is recorded only when the ledger actually moved, so
//             a call that added nothing (full ledger / non-positive amount)
//             never burns the id.
// Returns { applied, added, wrath, reason } — applied:false means the source
// was rejected ('source' unknown / 'duplicate' eventId). applied:true with
// added:0 is a successful no-charge: ITEM_EXCHANGE (always free, reason 'ok')
// or a capped / non-positive request (reason 'cap').
export function addWrath(run, source, amount = null, eventId = null) {
  const def = WRATH_SOURCES[source];
  if (!def) return { applied: false, added: 0, wrath: wrathOf(run), reason: 'source' };

  const ledger = initWrath(run);
  if (eventId != null && ledger.events.has(eventId)) {
    return { applied: false, added: 0, wrath: ledger.total, reason: 'duplicate' };
  }

  const want = amount == null ? def.amount : amount;
  // Soft cap: wrath never exceeds WRATH_CAP (partial fills allowed; the
  // excess is dropped, not banked).
  const room = Math.max(0, WRATH_CAP - ledger.total);
  const added = Math.min(room, Math.max(0, want));
  ledger.total += added;
  // The event id is charged ONLY when the ledger actually moved.
  if (eventId != null && added > 0) ledger.events.add(eventId);

  // reason 'cap' whenever the request could not be fully honoured — including
  // a NON-POSITIVE amount. ITEM_EXCHANGE's always-free +0 keeps 'ok' so the
  // equip path can call it on every 4/4 swap without special-casing.
  const short = added < want || (want < 0);
  return { applied: true, added, wrath: ledger.total, reason: short ? 'cap' : 'ok' };
}

// ---------- Readout ----------
// describeWrath(wrath) -> one line for the text HUD, e.g. 'WRATH 3 (+36% foe HP)'.
export function describeWrath(wrath) {
  const t = Math.max(0, wrath || 0);
  const pct = Math.round(WRATH_CURVES.HP * t * 100);
  return `WRATH ${t} (+${pct}% foe HP)`;
}
