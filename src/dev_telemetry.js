// HORDES — SLICES 7-8: dev telemetry + run snapshots (gated on `?dev=1` ONLY),
// plus the dev-run speed control (slice 8: substepped Nx sim, speed-stamped
// schema_v 2 snapshots).
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
//      kind:'weapon' rows dispatch into (2) — same class.
//   2. unlockWeapon (meta.js) — weapon archetype unlocks. INVESTMENT.
//   3. (retired 2026-10-03: elite modifiers are no longer bought; the kill
//      trophies bring them.)
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
//   - settleRunGold banking, milestone/night payout terms:
//     income and payout modifiers, not spending.
//   - Achievement grants (grantWeapon/grantElite/grantShopRow/grantCharacter):
//     gold-free by design (the achievement IS the price).
//   - Level-up draft picks, free chest opens, intermission blessings,
//     potions, loadout/equip, character equip: cost no gold.
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
//
// SLICE 8 (schema_v 2): the dev-run speed control stamps the speed used as a
// `speed` field, appended AFTER the slice-7 keys (old fields keep their order
// and meaning). A fast run snapshots exactly like a 1x run plus this field.
// The reader accepts schema_v 1 (legacy: no speed required — history is never
// deleted, so old log lines must stay readable) and 2 (speed required); every
// other version is refused.
//
// SLICE 9 (still schema_v 2 — ADDITIVE OPTIONAL FIELDS ONLY, no version bump;
// nothing real logged yet except proof rows): the snapshot may carry three
// OPTIONAL top-level fields, appended AFTER `speed` (old fields keep their
// order and meaning):
//   choices   — the run's choice audit: every player-choice point's TAKEN pick
//               (and where cheap, the OFFERED set): drafts (offered vs taken
//               per draft), intermission blessings (offered vs taken per wave),
//               shrine buys (taken id + cost + wave), paid-chest gambles
//               (tier + cost + keep/leave/empty outcome), evolutions
//               (offered candidates vs taken/deferred). Shop purchases, character select + upgrades and
//               the loadout are the `upgrades` field (out-of-run build, taken);
//               skill/rule/rewrite picks are draft cards, so they ride the
//               drafts ledger, not a second ledger.
//               SLICE 10 (still schema_v 2 — additive entry INSIDE the optional
//               choices object, no version bump): `removals` — the dev-run shop
//               buy-backs journaled since the last snapshot, one entry per
//               removed level: {id, kind, characterId, level, refund}. kind is
//               'shop' (classic rows; weapon/elite singletons carry their row
//               kind), 'character' (with characterId), 'pilot' or 'apex'; level
//               is the 1-based level removed (1 for singletons); refund is the
//               exact gold credited back for that level (0 for free-built or
//               unledgered levels — the removal still applies and is recorded).
//   mode      — the run's mode label, read LIVE off the run flags at snapshot
//               time (night vs standard), never a hardcoded string.
//   modifiers — live-derived payout/build modifiers for the run
//               (e.g. the night banking-penalty percent read off the live
//               RUN_GOLD constant, stage/assisted/apex stamps).
//   policy    — STEP 3 (still schema_v 2 — ADDITIVE OPTIONAL FIELD ONLY, no
//               version bump): the autoplay policy that drove the between-run
//               buys for this snapshot's build ('smart' | 'impulsive').
//               Unset (null/absent) for hand-driven runs. Present values are
//               type-checked (non-empty string); absent validates fine.
//   draft_ban — K5 (still schema_v 2 — ADDITIVE OPTIONAL FIELD ONLY, no
//               version bump): the draft offer ids the dev ban list excluded
//               from this run's offer pool (array of non-empty strings).
//               Present ONLY when the autoplay gate AND the ban arm bit were
//               on; absent validates fine (player/hand runs never carry it).
// Absent optionals validate fine (old writers predate them); present optionals
// are type-checked. The version gate still owns compat, not key strictness.
export const SNAPSHOT_SCHEMA_V = 2;
export const SNAPSHOT_KEYS = ['schema_v', 'game_rev', 'seed', 'upgrades',
  'shrines', 'items', 'gold_earned', 'gold_spent', 'damage', 'wave', 'test',
  'speed'];

// Build a snapshot with EXACTLY the schema keys (in order). Throws on any
// missing (or undefined) key so a half-built snapshot can never be saved or
// downloaded. Slice-9 optionals (choices/mode/modifiers) ride AFTER the
// required keys when supplied — never required, type-checked when present, so
// a snapshot built without them is byte-identical to a slice-8 one.
export function buildSnapshot(fields) {
  const f = fields || {};
  for (const k of SNAPSHOT_KEYS) {
    if (!(k in f) || f[k] === undefined) throw new Error('dev snapshot: missing key ' + k);
  }
  const snap = {
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
    speed: f.speed,
  };
  if ('choices' in f && f.choices !== undefined) {
    if (!f.choices || typeof f.choices !== 'object') throw new Error('dev snapshot: bad choices');
    snap.choices = f.choices;
  }
  if ('mode' in f && f.mode !== undefined) {
    if (typeof f.mode !== 'string' || f.mode.length === 0) throw new Error('dev snapshot: bad mode');
    snap.mode = f.mode;
  }
  if ('modifiers' in f && f.modifiers !== undefined) {
    if (!Array.isArray(f.modifiers) || f.modifiers.some(m => typeof m !== 'string')) {
      throw new Error('dev snapshot: bad modifiers');
    }
    snap.modifiers = f.modifiers;
  }
  if ('policy' in f && f.policy !== undefined && f.policy !== null) {
    if (typeof f.policy !== 'string' || f.policy.length === 0) throw new Error('dev snapshot: bad policy');
    snap.policy = f.policy;
  }
  if ('draft_ban' in f && f.draft_ban !== undefined && f.draft_ban !== null) {
    if (!Array.isArray(f.draft_ban) || f.draft_ban.some(id => typeof id !== 'string' || id.length === 0)) {
      throw new Error('dev snapshot: bad draft_ban');
    }
    snap.draft_ban = [...f.draft_ban];
  }
  return snap;
}

// Reader-side validation. Refuses unknown schema_v (accepts the known ones:
// 1 legacy, 2 current); requires every key with the documented type; IGNORES
// extra keys (forward-compat: additive fields under a future schema_v must
// not break this reader's accept path — the version gate is the compatibility
// mechanism, not key strictness).
export function validateSnapshot(obj) {
  const errors = [];
  if (!obj || typeof obj !== 'object') return { ok: false, errors: ['not an object'] };
  if (obj.schema_v !== 1 && obj.schema_v !== SNAPSHOT_SCHEMA_V) {
    return { ok: false, errors: ['unknown schema_v: ' + String(obj.schema_v)] };
  }
  const need = {
    game_rev: 'string', seed: 'number', upgrades: 'object', shrines: 'object',
    items: 'object', gold_earned: 'number', gold_spent: 'number',
    damage: 'number', wave: 'number', test: 'boolean',
  };
  // The speed field is required at schema_v 2, absent at 1 (legacy lines
  // predate the speed control). A v1 line carrying speed still validates —
  // the version gate owns compat, not key strictness.
  if (obj.schema_v === SNAPSHOT_SCHEMA_V) need.speed = 'number';
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
  // Slice-9 optionals: absent = fine (old writers predate them); present =
  // type-checked (same shapes buildSnapshot enforces).
  if ('choices' in obj && obj.choices !== undefined &&
      (!obj.choices || typeof obj.choices !== 'object')) {
    errors.push('bad type for choices: ' + typeof obj.choices);
  }
  if ('mode' in obj && obj.mode !== undefined &&
      (typeof obj.mode !== 'string' || obj.mode.length === 0)) {
    errors.push('bad type for mode: ' + typeof obj.mode);
  }
  if ('modifiers' in obj && obj.modifiers !== undefined &&
      (!Array.isArray(obj.modifiers) || obj.modifiers.some(m => typeof m !== 'string'))) {
    errors.push('bad type for modifiers');
  }
  if ('policy' in obj && obj.policy !== undefined && obj.policy !== null &&
      (typeof obj.policy !== 'string' || obj.policy.length === 0)) {
    errors.push('bad type for policy: ' + typeof obj.policy);
  }
  if ('draft_ban' in obj && obj.draft_ban !== undefined && obj.draft_ban !== null &&
      (!Array.isArray(obj.draft_ban) || obj.draft_ban.some(id => typeof id !== 'string' || id.length === 0))) {
    errors.push('bad type for draft_ban');
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
// EXCLUDED BY OWNER RULING (dev-editor damage bugfix, 2026-09-22): the two
// pickup-retaliation paths — Blood Harvest's hp-potion-pickup blast and Storm
// Shards'/Static Field's xp-gem-pickup chip (main.js pickup loop) — DEAL their
// damage (the hp debits are unchanged) but never COUNT it. A pickup fanning
// out over the horde scales with loot ingestion and enemy density, not with
// any player damage action, so counting it moves the metric "without doing
// damage" and corrupts cost-vs-damage analysis. Same family, still counted:
// thorns (combat contact) and every weapon/skill/burn/rider site.
let HIT_SINK = null;
export function devArm(sink) { HIT_SINK = sink || null; }
// Returns n UNCHANGED so damage sites wrap as `e.hp -= devHit(amount)` — one
// evaluation, one branch, one add. Disarmed the cost is the call + one
// predictable null check: no measurable frame impact (sample, don't trace).
export function devHit(n) {
  if (HIT_SINK && n > 0 && Number.isFinite(n)) HIT_SINK.dmg += n;
  return n;
}

// ---------- dev-run speed control (SLICE 8) ------------------------------------
// Offered multipliers, slowest first. The game runs N sim steps per rendered
// frame at Nx — substeps with the frame's dt UNCHANGED, never dt*N (large dt
// breaks the collision/tunneling assumptions the game is tuned around, and
// 60Hz and 120Hz must both stay correct). Only multipliers that verify clean
// in the determinism proof belong here; if a higher step diverges, it is cut
// from this list (the cap is the proof's verdict, not a preference).
export const DEV_SPEEDS = [1, 2, 4, 8];

// Normalize any stored/arbitrary value to an offered speed (fail closed: 1x).
export function devNormSpeed(n) {
  const v = Math.floor(Number(n));
  return DEV_SPEEDS.includes(v) ? v : 1;
}

// Cycle 1x -> 2x -> 4x -> 8x -> 1x (the overlay SPEED button drives this).
export function devNextSpeed(n) {
  const i = DEV_SPEEDS.indexOf(devNormSpeed(n));
  return DEV_SPEEDS[(i + 1) % DEV_SPEEDS.length];
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

// ---------- snapshot-log read (SLICE 11) ---------------------------------------
// Pure parse/filter over the append-only runs.jsonl, served whole by the saver
// backend (GET /snapshots -> {ok, mtime, count, raw}). No schema change: rows
// validate through validateSnapshot (v1 legacy + v2 current). Unparseable or
// invalid lines are KEPT as error rows ({index, error, raw}) — the log is
// never silently shortened, and the viewer flags them instead of dropping
// them. `index` is the 1-based non-blank line number (the run's log order).
export function parseSnapshotLog(raw) {
  const rows = [];
  let skipped = 0;
  if (typeof raw !== 'string' || raw.length === 0) return { rows, skipped };
  let index = 0;
  for (const line of raw.split('\n')) {
    if (line.trim() === '') { skipped++; continue; }
    index++;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      rows.push({ index, error: 'not JSON', raw: line.slice(0, 200) });
      continue;
    }
    const v = validateSnapshot(obj);
    if (!v.ok) rows.push({ index, error: v.errors.join('; '), raw: line.slice(0, 200) });
    else rows.push({ index, snap: obj });
  }
  return { rows, skipped };
}

// Subset rows for the viewer filters. mode: 'all' or an exact mode label
// (rows whose snapshot carries no mode — pre-slice-9 legacy — match 'all'
// only, never a guessed label). test: 'all' | 'test' | 'nontest' off the
// snapshot's boolean test flag. Error rows always pass (flagged, never
// hidden by a filter).
export function filterSnapshots(rows, opts = {}) {
  const mode = (opts && opts.mode) || 'all';
  const test = (opts && opts.test) || 'all';
  return (rows || []).filter((row) => {
    if (!row || !row.snap) return true;
    if (mode !== 'all' && row.snap.mode !== mode) return false;
    if (test === 'test' && row.snap.test !== true) return false;
    if (test === 'nontest' && row.snap.test !== false) return false;
    return true;
  });
}

// The log file mtime (ISO UTC from GET /snapshots) as a YYYY-MM-DD date for
// the viewer table. Snapshots carry no per-run clock (schema frozen), so the
// viewer labels the column as the log mtime — never a per-run claim.
export function snapshotLogDate(mtime) {
  if (typeof mtime !== 'string' || mtime.length < 10) return 'n/a';
  const d = mtime.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : 'n/a';
}

export async function fetchSnapshots(env) {
  try {
    const fetchFn = (env && env.fetch) || (typeof fetch === 'function' ? fetch : null);
    if (!fetchFn) return { ok: false, error: 'no fetch' };
    const res = await fetchFn(devApiBase(env) + '/snapshots');
    if (!res || !res.ok) return { ok: false, error: 'http ' + ((res && res.status) || 'no response') };
    const body = await res.json().catch(() => null);
    if (!body || body.ok !== true || typeof body.raw !== 'string') {
      return { ok: false, error: 'bad log payload' };
    }
    const { rows, skipped } = parseSnapshotLog(body.raw);
    return { ok: true, mtime: body.mtime ?? null, count: body.count ?? rows.length,
             raw: body.raw, rows, skipped };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err).slice(0, 200) };
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
