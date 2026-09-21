// HORDES — SLICE 7: dev telemetry + run snapshots (gated on `?dev=1` ONLY).
//
// This module is PURE + inert: importing it changes nothing. Every behaviour
// (overlay, sampling, snapshots, free-build accounting) is armed by main.js
// behind the dev gate, so the player build is byte-identical with the gate
// off. No DOM here except the sparkline painter (canvas 2d only, defensive).
//
// ---------- GOLD-SINK INVENTORY (the plan's accounting rule) ----------------
// Rule (owner-stated): COUNTS = shop purchases, character unlocks/upgrades,
// other permanent-build spending. EXCLUDES = unspent purse, shrine spending,
// other in-run non-power sinks. Ambiguous sinks are flagged, never guessed.
//
// Exhaustiveness proof: bank gold leaves through exactly six `profile.gold -=`
// sites (rg "profile.gold -=" src/meta.js) and purse gold through exactly two
// debit sites (rg "runPurse -" src/main.js). Every site is classified below.
//
// BANK gold (profile.gold, out-of-run) — ALL INVESTMENT (permanent build):
//   1. buyUpgrade (meta.js) — every SHOP_UPGRADES row level: stat lines, the
//      'slots' ladder, 'arcade', 'escapeskip', 'zapchain'. INVESTMENT.
//      kind:'weapon'/kind:'elite' rows dispatch into (2)/(3) — same class.
//   2. unlockWeapon (meta.js) — weapon archetype unlocks. INVESTMENT.
//   3. unlockElite (meta.js) — elite modifier unlocks. INVESTMENT.
//   4. buyApex (meta.js) — apex prestige items (post-completion). INVESTMENT.
//   5. buyCharacterUpgrade (meta.js) — per-character rows. INVESTMENT
//      (character upgrades are named in the rule).
//   6. unlockCharacter (meta.js) — character unlocks. INVESTMENT (named).
// PURSE gold (profile.runPurse, in-run):
//   7. Shrine blessings via purseSpend (main.js shrine loop). EXCLUDED —
//      shrine spending is named in the rule.
//   8. Paid-chest gamble via the direct debit in buyPaidChest (main.js).
//      AMBIGUOUS — FLAGGED FOR THE OWNER, not guessed: it is in-run like a
//      shrine (and its items never persist past the run), but unlike a shrine
//      it grants POWER (items), so the "in-run non-power sinks" exclusion
//      does not cleanly cover it either. IMPLEMENTED AS COUNTED (gold_spent
//      includes the full chest price; shrine spend is subtracted out), on the
//      explicit-exclusion reading: the rule names shrines, and chests are not
//      shrines. If the owner rules the other way, the switch is one line in
//      main.js devGoldSpent() (move the chest bucket to the excluded side).
// NOT sinks (no gold leaves the purse or bank; verified by the same greps):
//   - Unspent purse: banked into profile.gold at settleRunGold (a transfer,
//     EXCLUDED by the "unspent" clause — never counted as spent).
//   - settleRunGold banking, milestone/challenge/heat/night payout terms:
//     income and payout modifiers, not spending.
//   - Achievement grants (grantWeapon/grantElite/grantShopRow/grantCharacter):
//     gold-free by design (the achievement IS the price).
//   - Level-up draft picks, free chest opens, intermission blessings,
//     RAISE THE STAKES, potions, loadout/equip, character equip: cost no gold.
//   - No draft-reroll, respec, repair or upkeep spend exists anywhere in src/.

// ---------- dev gate ---------------------------------------------------------
export const DEV_QUERY = 'dev';

// True only for `?dev=1` (editor.html links to index.html?dev=1). Takes the
// env explicitly so headless harnesses can inject it; anything missing or
// unparseable is gate-off (fail closed).
export function isDevGate(env) {
  try {
    const s = (env && env.location && env.location.search) || '';
    if (typeof s !== 'string' || s.length === 0) return false;
    return new URLSearchParams(s).get(DEV_QUERY) === '1';
  } catch {
    return false;
  }
}

// Saver/proxy base the game POSTs snapshots to and GETs the live game_rev
// from. Browser default is the nginx-proxied same-origin path (the page must
// never default to a localhost URL); headless proofs override with
// globalThis.__DEV_API_BASE = 'http://127.0.0.1:PORT'.
export function devApiBase(env) {
  try {
    const o = (env && env.__DEV_API_BASE) || '';
    if (typeof o === 'string' && o.length > 0) return o;
  } catch { /* fall through to the default */ }
  return '/hordes-dev-api';
}

// ---------- game_rev ----------------------------------------------------------
// Format: "<full-commit-sha>:clean" | "<full-commit-sha>:dirty". Read LIVE
// from the saver backend (GET /rev runs git at request time); the literal
// 'unavailable' is the explicit fallback when the backend is unreachable
// (offline static hosts, file:// runs) — never a guessed SHA.
export function formatGameRev(sha, dirty) {
  if (typeof sha !== 'string' || !/^[0-9a-f]{4,64}$/i.test(sha)) return 'unavailable';
  return sha.toLowerCase() + (dirty ? ':dirty' : ':clean');
}

// ---------- snapshot schema ---------------------------------------------------
// Stable, append-only. Readers refuse unknown schema_v; old fields are never
// renamed (additive evolution only, behind a new schema_v).
export const SNAPSHOT_SCHEMA_V = 1;
export const SNAPSHOT_KEYS = ['schema_v', 'game_rev', 'seed', 'upgrades',
  'shrines', 'items', 'gold_earned', 'gold_spent', 'damage', 'wave', 'test'];

// Build a snapshot with EXACTLY the schema keys (in order). Throws on any
// missing (or undefined) key so a half-built snapshot can never be saved or
// downloaded.
export function buildSnapshot(fields) {
  const f = fields || {};
  for (const k of SNAPSHOT_KEYS) {
    if (!(k in f) || f[k] === undefined) throw new Error('dev snapshot: missing key ' + k);
  }
  return {
    schema_v: f.schema_v,
    game_rev: f.game_rev,
    seed: f.seed,
    upgrades: f.upgrades,
    shrines: f.shrines,
    items: f.items,
    gold_earned: f.gold_earned,
    gold_spent: f.gold_spent,
    damage: f.damage,
    wave: f.wave,
    test: f.test,
  };
}

// Reader-side validation. Refuses unknown schema_v; requires every key with
// the documented type; IGNORES extra keys (forward-compat: additive fields
// under a future schema_v must not break this reader's accept path — the
// version gate is the compatibility mechanism, not key strictness).
export function validateSnapshot(obj) {
  const errors = [];
  if (!obj || typeof obj !== 'object') return { ok: false, errors: ['not an object'] };
  if (obj.schema_v !== SNAPSHOT_SCHEMA_V) {
    return { ok: false, errors: ['unknown schema_v: ' + String(obj.schema_v)] };
  }
  const need = {
    game_rev: 'string', seed: 'number', upgrades: 'object', shrines: 'object',
    items: 'object', gold_earned: 'number', gold_spent: 'number',
    damage: 'number', wave: 'number', test: 'boolean',
  };
  for (const [k, t] of Object.entries(need)) {
    if (!(k in obj)) { errors.push('missing key: ' + k); continue; }
    const v = obj[k];
    if (t === 'object') {
      if (!v || typeof v !== 'object') errors.push('bad type for ' + k + ': ' + typeof v);
    } else if (typeof v !== t) {
      errors.push('bad type for ' + k + ': ' + typeof v);
    } else if (t === 'number' && !Number.isFinite(v)) {
      errors.push('non-finite number for ' + k);
    }
  }
  if (typeof obj.game_rev === 'string' && obj.game_rev.length === 0) {
    errors.push('empty game_rev');
  }
  if (Array.isArray(obj.upgrades) || !Array.isArray(obj.items)) {
    errors.push('upgrades must be an object, items must be an array');
  }
  return { ok: errors.length === 0, errors };
}

// ---------- damage accumulator (sample, don't trace) --------------------------
// Damage sites call devHit(appliedAmount) — ONE null-check branch and one
// float add per event, no allocation, no per-event records. The 1 Hz sampler
// in main.js snapshots the scalar into ring buffers; the overlay and the
// snapshot read the buffers, never the event stream. Disarmed (null sink)
// the cost is a single predictable branch — no measurable frame impact.
// Overkill counts as dealt (damage dealt, not damage effective); burn, thorns
// and rider bursts are player-dealt and count; player-TAKEN damage never
// reaches this function (no call site on any p.hp debit).
let HIT_SINK = null;
export function devArm(sink) { HIT_SINK = sink || null; }
// Returns n UNCHANGED so damage sites wrap as `e.hp -= devHit(amount)` — one
// evaluation, one branch, one add. Disarmed the cost is the call + one
// predictable null check: no measurable frame impact (sample, don't trace).
export function devHit(n) {
  if (HIT_SINK && n > 0 && Number.isFinite(n)) HIT_SINK.dmg += n;
  return n;
}

// ---------- sparkline painter -------------------------------------------------
// Minimal canvas line chart: one or two series + an optional horizontal
// reference line (the best-gold line). Defensive: any DOM absence or stub
// context degrades to a no-op rather than throwing into the frame loop.
export function drawSparkline(canvas, seriesList, opts = {}) {
  try {
    if (!canvas || typeof canvas.getContext !== 'function') return;
    const g = canvas.getContext('2d');
    if (!g) return;
    const W = canvas.width || 120, H = canvas.height || 28;
    if (typeof g.clearRect === 'function') g.clearRect(0, 0, W, H);
    const all = [];
    for (const s of seriesList || []) {
      if (Array.isArray(s && s.data)) for (const v of s.data) all.push(v);
    }
    if (opts.ref != null && Number.isFinite(opts.ref)) all.push(opts.ref, 0);
    else all.push(0);
    let max = 0;
    for (const v of all) if (Number.isFinite(v) && v > max) max = v;
    if (max <= 0) max = 1;
    const yOf = v => H - 2 - (Math.max(0, v) / max) * (H - 4);
    if (opts.ref != null && Number.isFinite(opts.ref) && typeof g.fillRect === 'function') {
      g.fillStyle = opts.refColor || '#ffd75e';
      g.fillRect(0, Math.round(yOf(opts.ref)), W, 1);
    }
    const cols = opts.colors || ['#7ad0ff', '#ff9d5e'];
    (seriesList || []).forEach((s, si) => {
      const d = (s && s.data) || [];
      if (d.length === 0 || typeof g.fillRect !== 'function') return;
      g.fillStyle = cols[si % cols.length];
      const n = d.length;
      for (let i = 0; i < n; i++) {
        const x = Math.floor((i / Math.max(1, (opts.span || 120) - 1)) * (W - 1));
        const y = Math.round(yOf(d[i]));
        g.fillRect(x, y, 1, H - y);
      }
    });
  } catch { /* telemetry must never break the frame loop */ }
}

// ---------- backend I/O (snapshot POST + live rev GET) -------------------------
// Both degrade to explicit fallbacks when fetch or the backend is absent
// (headless runs without a server, file://) — never throw into the caller.
export async function fetchGameRev(env) {
  try {
    const fetchFn = (env && env.fetch) || (typeof fetch === 'function' ? fetch : null);
    if (!fetchFn) return 'unavailable';
    const res = await fetchFn(devApiBase(env) + '/rev');
    if (!res || !res.ok) return 'unavailable';
    const body = await res.json();
    if (!body || typeof body.game_rev !== 'string') return 'unavailable';
    return body.game_rev;
  } catch {
    return 'unavailable';
  }
}

export async function postSnapshot(env, snap) {
  const v = validateSnapshot(snap);
  if (!v.ok) return { ok: false, error: 'client refused invalid snapshot: ' + v.errors.join('; ') };
  try {
    const fetchFn = (env && env.fetch) || (typeof fetch === 'function' ? fetch : null);
    if (!fetchFn) return { ok: false, error: 'no fetch' };
    const res = await fetchFn(devApiBase(env) + '/snapshot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snap),
    });
    if (!res) return { ok: false, error: 'no response' };
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body || body.ok !== true) {
      return { ok: false, error: 'server refused: ' + JSON.stringify(body).slice(0, 200) };
    }
    return { ok: true, lines: body.lines };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err).slice(0, 200) };
  }
}
