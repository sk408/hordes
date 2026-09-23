// HORDES — STEP 3: dev autoplay policy runner (TOGGLE, SMART vs IMPULSIVE).
//
// PURE + inert: importing it changes nothing. Every behaviour (toggle prefs,
// dev-night payout exemption, auto-buy decisions) is armed by main.js behind
// the `?dev=1` gate, so the player build is byte-identical with the gate off.
//
// WHAT IT IS (owner-stated design, docs/DEV_EDITOR_PLAN.md:114-130):
//   - TOGGLE, not always-on: a dev-only switch (default OFF) enabling
//     unattended autoplay runs. Storage follows the slice-9 dev-pref seam
//     (localStorage bits `hordes_dev_*`, default OFF when absent — the same
//     fail-closed read main.js devPref() applies to TEST/FREE/SNAP).
//   - Dev-night mode = nightmare rules with the 50% banking cut REMOVED.
//     The cut itself (src/main.js settleRunGold, `state.nightRun ?
//     RUN_GOLD.NIGHT_PENALTY_PCT : 0`) is untouched for regular night mode;
//     main.js exempts only runs stamped `state.devNightRun`.
//   - Two auto-buy SHOP policies. The runner buys BETWEEN runs (out-of-run,
//     through the REAL meta.js buyUpgrade — ledger, gold gate and investment
//     accounting untouched), once per run, then snapshots.
//
// INCOME ESTIMATOR (the save-up rule's "runs of gold EARNED"):
//
//     est(H) = H empty ? RUN_GOLD.AWARD
//            : mean of the last SAVE_UP_WINDOW (= 5) gold_earned values of H
//
//   H is the runner's telemetry history (gold_earned per settled run, oldest
//   first). The empty-history seed is the shipped fresh-run floor
//   (RUN_GOLD.AWARD = 70, src/meta.js) — a run always banks at least the
//   award, so saving against at least one floor-run of income is never
//   divide-by-zero. Non-finite/negative entries are ignored (a corrupt
//   telemetry line must not flip a buy decision); an all-ignored history
//   falls back to the floor. Result is clamped to finite >= 0.
//
// SAVE-UP RULE (SMART): let gap = target.cost - profile.gold for the first
// (highest-priority) preferred target. When 0 < gap <= SAVE_UP_RUNS * est,
// the target is "affordable within 5 runs" — SMART buys NOTHING else (no
// filler dribble) until the target itself is affordable, at which point it
// buys the target. Higher-priority affordable preferred items still go first
// (priority order is the buy order); anything else waits.
//
// POLICIES:
//   SMART     — preferred lines first (weapons, then split, weapon slots,
//               damage), cheapest weapon first; save-up per above; filler
//               (any other buyable shop row, cheapest first) ONLY when no
//               preferred target is affordable within 5 estimated runs.
//   IMPULSIVE — buy whatever is affordable NOW, cheapest-first across the
//               whole buyable catalogue, no saving. The real-player baseline.
//
// SCOPE: shop rows only (SHOP_UPGRADES incl. kind weapon/elite dispatch —
// buyUpgrade owns the dispatch, so this module never re-lists prices).
// Character unlocks/upgrades are out of scope (never filler, never targets).
// granted-vs-earned split is a LATER slice — untouched here.
//
// RNG: the policies are deterministic (no rolls; ties break by catalogue
// order, then id). Paired-seed comparability between policies comes from the
// RUNNER (tools/autoplay_policy.mjs), which seeds the run's choice/shrine/
// draft streams identically per run index in both arms — documented there.
// Unseeded spawn/combat Math.random streams stay unseeded (the sim's limit,
// not a policy choice).
import {
  RUN_GOLD, SHOP_UPGRADES, SHOP_BY_ID, WEAPON_PRICES, ELITE_MODIFIERS,
  upgradeCost, canAfford, weaponUnlocked,
} from './meta.js';

// ---------- toggle storage (ONE home; main.js imports these) ----------------
// Same shape as the slice-7/8 pref bits (src/main.js DEV_LS_TEST/FREE/
// SNAPOFF/SPEED): localStorage '1' = on, anything else (incl. absent) = OFF.
export const DEV_LS_AUTO = 'hordes_dev_auto';
export const DEV_LS_DEVNIGHT = 'hordes_dev_devnight';
// K5 DEV DRAFT BAN LIST (owner report: autoplay "keeps taking" ONE OF EACH,
// which harms long-run testing): a dev-only pair of prefs — the arm bit (same
// '1'-bit shape as AUTO/DNIGHT, default OFF when absent) plus the banned draft
// offer ids as a comma-joined string. Exclusion happens in main.js openDraft's
// pool, gated on the autoplay dev context (session.autoplay === true, the same
// condition requireAutoplay enforces) AND the arm bit — a player game, or even
// a dev session with AUTO off, always draws the full pool.
export const DEV_LS_BAN_ON = 'hordes_dev_ban_on';
export const DEV_LS_BAN_IDS = 'hordes_dev_ban_ids';

// The default preset when the ids pref is ABSENT: ONE OF EACH's draft offer
// id. The rule id is 'once' (src/rules.js RULES); ruleCards() builds the pool
// card id as 'rule_' + id, so the offer id is 'rule_once'. Extensible to any
// offer id by persisting a comma list in DEV_LS_BAN_IDS.
export const DEFAULT_DRAFT_BAN_IDS = ['rule_once'];

// Parse the ids pref. Absent (null/undefined) = the default preset; a stored
// string (even empty) is authoritative — comma-split, trimmed, empties and
// duplicates dropped, sorted so the snapshot stamp is deterministic.
export function parseDraftBanIds(raw) {
  if (raw === null || raw === undefined) return [...DEFAULT_DRAFT_BAN_IDS];
  const out = [];
  for (const part of String(raw).split(',')) {
    const id = part.trim();
    if (id && !out.includes(id)) out.push(id);
  }
  out.sort();
  return out;
}

export const AUTOPLAY_POLICIES = ['smart', 'impulsive'];

// Runs of estimated income inside which a preferred target triggers saving.
export const SAVE_UP_RUNS = 5;
// How many recent settled runs the estimator averages.
export const SAVE_UP_WINDOW = 5;

// ---------- income estimator -------------------------------------------------
export function estimateRunIncome(history) {
  const vals = [];
  if (Array.isArray(history)) {
    for (const v of history.slice(-SAVE_UP_WINDOW)) {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 0) vals.push(n);
    }
  }
  if (vals.length === 0) return RUN_GOLD.AWARD;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

// ---------- offer resolution (live catalogue, never restated prices) ---------
function eliteUnlocked(profile, eliteId) {
  return (profile.unlockedElites || []).includes(eliteId);
}

// Every CURRENTLY buyable shop offer: { id, cost }. Maxed/owned/unknown rows
// are absent (there is nothing to buy), so policies can never pick them.
export function offersFor(profile) {
  const out = [];
  const purchased = (profile && profile.purchased) || {};
  for (const def of SHOP_UPGRADES) {
    if (!def || !def.id) continue;
    if (def.kind === 'weapon') {
      if (weaponUnlocked(profile, def.weaponId)) continue;
      const price = WEAPON_PRICES[def.weaponId];
      if (price === undefined) continue;
      out.push({ id: def.id, cost: price });
      continue;
    }
    if (def.kind === 'elite') {
      if (eliteUnlocked(profile, def.eliteId)) continue;
      const price = ELITE_MODIFIERS[def.eliteId] && ELITE_MODIFIERS[def.eliteId].cost;
      if (price === undefined) continue;
      out.push({ id: def.id, cost: price });
      continue;
    }
    const level = Math.max(0, Number(purchased[def.id]) || 0);
    if (level >= def.maxLevel) continue;
    out.push({ id: def.id, cost: upgradeCost(def, level) });
  }
  return out;
}

// Preferred-line priority (owner-stated order): weapon unlocks first
// (cheapest first), then the split ladder, weapon slots, damage increases.
const LATE_PREFERRED = ['split', 'slots', 'dmg'];

export function preferredTargets(profile, offers) {
  const list = offers || offersFor(profile);
  const byId = new Map(list.map((o) => [o.id, o]));
  const out = [];
  const weapons = list
    .filter((o) => {
      const def = SHOP_BY_ID[o.id];
      return def && def.kind === 'weapon';
    })
    .sort((a, b) => a.cost - b.cost || (a.id < b.id ? -1 : 1));
  for (const w of weapons) out.push(w);
  for (const id of LATE_PREFERRED) {
    if (byId.has(id)) out.push(byId.get(id));
  }
  return out;
}

function cheapestAffordable(profile, offers) {
  let best = null;
  for (const o of offers) {
    if (!canAfford(profile, o.cost)) continue;
    if (!best || o.cost < best.cost || (o.cost === best.cost && o.id < best.id)) best = o;
  }
  return best;
}

// ---------- SMART ------------------------------------------------------------
export function smartNextBuy(profile, estIncome, offers) {
  const list = offers || offersFor(profile);
  const est = Number(estIncome);
  const horizon = Number.isFinite(est) && est > 0 ? SAVE_UP_RUNS * est : 0;
  const prefs = preferredTargets(profile, list);
  const prefIds = new Set(prefs.map((p) => p.id));
  const gold = Number(profile && profile.gold) || 0;

  // The save-up target: first preferred line that is unaffordable now but
  // affordable within SAVE_UP_RUNS estimated runs.
  let saveTarget = null;
  for (const p of prefs) {
    const gap = p.cost - gold;
    if (gap > 0 && gap <= horizon) { saveTarget = p; break; }
  }
  if (saveTarget) {
    // A higher-priority preferred line that IS affordable still goes first
    // (priority order is the buy order); everything else — filler included —
    // waits until the target is bought. Never dribble on filler while saving.
    for (const p of prefs) {
      if (p === saveTarget) break;
      if (canAfford(profile, p.cost)) return p.id;
    }
    return null;
  }
  // Not saving: first affordable preferred line in priority order ...
  for (const p of prefs) {
    if (canAfford(profile, p.cost)) return p.id;
  }
  // ... else the cheapest affordable filler (any other buyable row).
  const filler = cheapestAffordable(profile, list.filter((o) => !prefIds.has(o.id)));
  return filler ? filler.id : null;
}

// ---------- IMPULSIVE ----------------------------------------------------------
export function impulsiveNextBuy(profile, offers) {
  const list = offers || offersFor(profile);
  const best = cheapestAffordable(profile, list);
  return best ? best.id : null;
}

// ---------- runner gate --------------------------------------------------------
// The TOGGLE: the headless runner refuses to drive unattended runs unless the
// dev session carries autoplay ON (set through the real overlay/pref seam).
export function requireAutoplay(session) {
  if (!session || session.autoplay !== true) {
    throw new Error('autoplay runner: toggle is OFF (enable AUTO in the dev overlay first)');
  }
  return true;
}
