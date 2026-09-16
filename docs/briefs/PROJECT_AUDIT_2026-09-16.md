# PROJECT AUDIT — 2026-09-16

Findings-only audit. No source or test file was modified; the only new file is this
report. Method: three parallel static surveys (persistence/meta, core loop/input,
web/audio/render/economies) followed by personal verification of every candidate —
each finding below was confirmed by reading the cited code, and where possible by a
bounded reproduction (all repros: <60s wall, <60s sim). The suite baseline (109
files green as of G36, earlier today) was not re-run; nothing here depends on it.

Severity scale: blocker / serious / minor / nit.

---

## SERIOUS

### S1. The maw milestone double-settles the run (economy + achievement inflation)

**Severity:** serious

**Observed:** A player who slays the maw and then plays on (the run continues to
the 30:00 limit by design — `runSurvived` even prints "MAW SLAIN") has the run
settled TWICE: once at the maw (`mawDefeated`), and again at whichever ending the
run actually reaches (`runSurvived`, `die`, or `endRun`). Each settle pays the full
`RUN_GOLD.AWARD` again, banks the (already-banked) purse structure again, and folds
the FULL run summary into lifetime totals a second time.

**Evidence:**
- `src/main.js:7376` — `mawDefeated()` calls `settleRunGold({ winBonus: bonus })`
  and sets `state.mode = 'intermission'`; the run continues afterwards.
- `src/main.js:3437-3462` — `settleRunGold` has NO guard against being called more
  than once per run (the only idempotency is the purse zeroing at 3455, which
  protects the remainder — nothing else).
- `src/main.js:3489` (`runSurvived`), `src/main.js:3608` (`die`), `src/main.js:3548`
  (`endRun`) — every other ending calls `settleRunGold` again, gated only on mode,
  not on "already settled".
- `src/main.js:3459` — each settle calls `recordRunAchievements(gold)`.
- `src/achievements.js:350-366` — `recordRun`'s `bump` is read-then-add of the FULL
  run summary: `bump('kills', r.kills)` adds the whole run's kills again,
  `bump('gold', r.gold)` the whole payout again, `bump('runs', 1)` again.
- `src/main.js:3439-3440, 3449` — `firstClear` is "time > bestTime", and bestTime is
  updated at the FIRST settle; the second settle at a later time is again
  "firstClear" → `RUN_GOLD.FIRST_CLEAR` can pay twice in one run.

**Blast radius:** every maw-clearing run that plays past the milestone: double
award gold, double (or triple, if maw→die is followed by nothing else — it is
exactly double today) lifetime kills/gold/runs counts, premature cumulative
trophies (e.g. KILLS_10000) and their unlocks. Economy and achievement integrity.

**Suggested fix:** a `state.settled` flag set inside `settleRunGold` (or a
`state.runSettledAt` time) that makes the second call a no-op returning the first
settle's numbers; alternatively settle the maw milestone as a bonus WITHOUT the
full run fold and defer the fold to the run's real ending.

### S2. Audio is initialized once at module load — never on a user gesture (iOS: silent game)

**Severity:** serious (on iOS Safari; other browsers unaffected or self-healing)

**Observed:** On iOS Safari (and any browser with a strict autoplay policy), the
AudioContext is created suspended and can only be resumed inside a user gesture.
`audio.init()` runs exactly once, during ES-module evaluation — before any gesture.
The game is then permanently silent: no sound, no music, and no error anywhere.

**Evidence:**
- `src/main.js:155` — `try { audio.init(); } catch {...}` is the ONLY call site of
  `audio.init` in the tree (grep: 1 hit).
- `src/audio.js:223-242` — `init()` attempts `ctx.resume()` immediately at creation
  (238-240); it is idempotent and would resume a suspended context, but nothing
  ever calls it again.
- No `pointerdown`/`keydown`/`touchstart` handler anywhere references audio resume
  or init (grep over src/ for `audio.init`, `resume`, `unlock`).
- `src/audio.js:277-283` — `playSfx` returns `false` only when the ctx is missing;
  with a suspended ctx it "succeeds" silently into a frozen clock.

**Blast radius:** the entire audio surface on gesture-gated browsers. Also a
secondary wart: while suspended, `lastPlayed` rate limits (audio.js:281-283) and
the music scheduler compare against a frozen `ctx.currentTime`, so a context that
DOES resume later (desktop tab-suspend case) has bunched/dropped scheduled notes.

**Suggested fix:** on the first `pointerdown`/`keydown` (the game already has
global listeners), call `audio.init()` again — it is idempotent and resumes a
suspended context; alternatively re-attempt resume inside `playSfx`/`startMusic`
when `ctx.state === 'suspended'`.

---

## MINOR

### M1. `preBossStance` is never restored after a maw victory, and leaks into the next run

**Observed:** After slaying the maw, the pilot doctrine/stance saved on the maw's
arrival is never handed back (contrast the maw-withdrawal path, which does). The
stale saved stance then survives into the NEXT run (nothing in `startRun` clears
it), where the first boss approach refuses to save the new run's own stance, and a
later restore hands back the PREVIOUS run's stance.

**Evidence:**
- `src/main.js:7144` — maw arrival calls `easeToBossStance()` (saves
  `state.preBossStance`, main.js:5996-5997).
- `src/main.js:7359-7385` — `mawDefeated()` contains NO `restoreBossStance` call.
- `src/main.js:7398` — `mawWithdrew()` DOES call it (the asymmetry).
- Grep `preBossStance`: exactly 5 refs (5996, 5997, 6005-6007); none in
  `startRun()` (main.js:5385-5627) — the field is dynamically added and never
  reset per run.

**Blast radius:** AUTO-pilot stance behaves as the boss-approach stance between
maw victory and the player's next manual stance change; one stale stance restore
per affected run. Self-corrects after one stance cycle.

**Suggested fix:** call `restoreBossStance()` in `mawDefeated()` (next to the
field-clearing at 7360-7364), and add `state.preBossStance = null;` to startRun.

### M2. `lastDamageSource` is stale on maw deaths and across runs

**Observed:** A player killed by the maw sees a death screen crediting an earlier,
unrelated hit (or, after a page-session reload boundary in a long session, the
previous run's last attacker; on a fresh session with no prior hit, "unknown").

**Evidence:**
- `src/main.js:3579` — module-level `let lastDamageSource = null;`, never reset
  per run (grep: stamps only at 1976, 2103, 2132; consumer at 3602).
- `src/main.js:7265, 7283` — both finale maw-death paths call `die(true)` bare,
  with no stamp; `die` spreads whatever `lastDamageSource` still holds
  (main.js:3601-3605).

**Blast radius:** cosmetic (death-card cause line only), but player-facing and
misleading on the run's final screen.

**Suggested fix:** stamp `lastDamageSource = { cause: 'maw' }` before the two
`die(true)` calls, and clear it in `startRun()`.

### M3. Ground-item arrays (`gems`, `drops`, `itemDrops`) are unbounded — measured linear frame cost

**Observed:** Gems (XP chips), potion drops, and rare item drops have no cap, no
expiry, and no magnet; they are removed only when the player walks within pickup
radius. A long run that kites away from kill sites (or leaves a portal-clear's gem
burst behind) accumulates ground items indefinitely; per-frame pickup scans grow
linearly with the pile and eventually eat frame budget.

**Evidence:**
- Removal is pickup-only: `src/main.js:2498-2524` (drops), `2530-2539` (itemDrops),
  `2558-2569` (gems) — all distance-gated splices; no length cap or ttl filter
  anywhere (contrast `enemyShots` filtered at 2135, `effects` ttl at 2549, toasts
  capped at 2655).
- Bounded measurement (headless real-loop harness, fresh profile, field quieted,
  synthetic gems placed 5,000px from the player, 300 frames per sample):

  | gems on ground | ms / frame (sim update only) |
  |---:|---:|
  | 100 | 0.25 |
  | 5,000 | 1.37 |
  | 20,000 | 2.93 |

  Linear scaling, and the lengths were unchanged after every run — no cap, no
  expiry. (Driver: /tmp/audit_arrays.mjs; note the harness shims
  `performance.now`, so wall clock was measured with `Date.now`.) In-browser cost
  is higher: render iterates the same arrays (render.js gem/drop draw passes).

**Blast radius:** late-run frame-time degradation on long survival runs,
worse on low-end/mobile hardware; no crash, no state corruption.

**Suggested fix:** cap each ground array (e.g. trim the OLDEST entries past a few
hundred) or give entries an age/ttl decremented in the same pass that draws them.

### M4. Digit-key auto-repeat is unguarded in intermission/evolve — held key re-buys

**Observed:** Holding `1`-`4` (or Enter/C) during the intermission overlay
re-fires the numbered card's `click()` on every key auto-repeat tick (~30/s after
the initial ~500ms delay). Over a paid-chest card this repeats the purchase until
the purse is empty; the key-repeat swallow-list does not cover digits.

**Evidence:**
- `src/main.js:6256-6266` — `REPEAT_GUARDED` covers tab/g/h/n/escape/p/o/m/r/i/?/f1/s/zoom
  keys — not `1`-`4`, `c`, or `enter`.
- `src/main.js:6340-6345` — intermission mode: `['1','2','3','4'].includes(ev.key)`
  → `card.click()`; same shape for evolve at 6334-6336.
- Purchases are affordability-gated (`src/main.js:1160-1161`), so this cannot go
  negative — but it drains the purse one chest at a time while the key is held.

**Blast radius:** manual (not AUTO) input path only; wasted in-run gold on an
accidentally-held key. Evolve cards are consumed by the first click, so that
variant is harmless.

**Suggested fix:** add the digits (`c`, `enter`) to `REPEAT_GUARDED`, or gate the
intermission digit handler on `!ev.repeat`.

### M5. NaN gold would bypass purchase gates and then wipe the bank on next load (hardening; no entry vector found)

**Observed (hypothetical):** if `profile.gold` ever became NaN, every purchase
check passes (`NaN < cost` is false), items/unlocks are granted "for free", and on
the next load the validator repairs non-finite gold to 0 — the whole bank is
destroyed, silently, as a "repair".

**Evidence:**
- `src/meta.js:611` and `src/meta.js:627` — `if (profile.gold < cost) return false;`
  is the only gate; NaN defeats it, then `profile.gold -= cost` poisons the field.
- `src/save.js:302-307` — `validateProfile` maps non-finite gold to 0 (repair, not
  error), so the poisoned bank becomes an empty bank on reload.
- Entry vector: NONE FOUND. Every current writer was traced and is finite: the
  settle multiplier chain is bounded (`src/main.js:1048-1053` rampage mults,
  `src/heat.js:65-67` goldMult), the purse is int32-coerced on every read/write
  (`src/main.js:1081, 1093-1094`), awards are `Math.round`-ed
  (`src/main.js:3449-3451`).

**Blast radius:** total bank loss IF a NaN ever enters; today it cannot (verified
statically). Filed as minor because the consequence is catastrophic and the guard
is one line, not because it is reachable.

**Suggested fix:** `Number.isFinite` guard in `buyUpgrade`/`unlockWeapon` (or a
`profile.gold = intOr(profile.gold, 0)` access wrapper), and repair NaN to the last
finite value rather than 0 in `validateProfile`.

---

## NITS

- **N1.** `runPurse` numeric-domain disagreement: reads/writes coerce with `|0`
  (int32; wraps negative past 2^31 — `src/main.js:1081, 1093-1094, 3450`) while
  `validateProfile` allows up to `MAX_SAFE_INTEGER` (`src/save.js:310-315`).
  Unreachable organically (the purse zeroes at every settle; ~75.5k gold/run
  measured previously). Fix: drop the `|0` or clamp consistently to 2^31.
- **N2.** `saveProfileTo` ignores the custom-key option that `loadProfileFrom`
  honors (`src/save.js:879` vs `935`) — a profile loaded from another slot would
  save back to the DEFAULT slot. Dormant: no caller passes `opts.key`. Fix: thread
  the key through, or remove the option.
- **N3.** `normalizeAchievements` drops ids unknown to the live catalog
  (`src/achievements.js:149, 172`) while save.js deliberately preserves unknown
  achievement fields for newer builds; a same-version newer build's trophies would
  be silently lost on the first structural repair (`ensureAchievements`,
  achievements.js:206-208). Downgrade scenario only — future-VERSION saves are
  refused outright (`src/save.js:905-913`).
- **N4.** Timed-goal text says "under mm:ss" (`src/achievements.js:508`) but the
  boundary is inclusive (`rt === within` earns, `src/achievements.js:378`).
  Cosmetic.
- **N5.** One recovery slot: a second corrupt/future payload overwrites the first
  (`src/save.js:830-837` — unconditional `setItem` on `RECOVERY_KEY`). Only the
  latest incident is recoverable.
- **N6.** Boss-banner text is re-fitted via repeated `measureText` every frame of
  its life (`src/render.js:1194-1212` — `fitPx` walks the px ladder per call);
  sizes are a pure function of the strings and could be cached per banner.
  Similarly, the radar plate/rim repaints ~4,700 `sqrt`-gated 1px fills per frame
  for a static disc (`src/render.js:1011-1023`) — cacheable to an offscreen canvas.
  Neither was measured in-browser (see Unverified).
- **N7.** `index.html:5` — `maximum-scale=1.0, user-scalable=no` blocks pinch-zoom
  (WCAG 1.4.4). Deliberate for a game; noted for the record.

---

## CREDIBLE BUT UNVERIFIED

- **S2 secondary:** music/sfx note bunching after a desktop tab-suspend-resume
  (schedulers and rate limits keyed on frozen `ctx.currentTime`,
  `src/audio.js:281-283` and the `scheduleAhead` step) — the code path is real but
  I could not demonstrate the audible result headlessly, and no iOS device is on
  this VPS to confirm the primary silence either (the autoplay policy itself is
  the well-documented browser behavior; the missing-gesture code path is verified).
- **Render perf N6 impact:** the per-frame cost of the banner refit and radar
  repaint is static evidence only — the headless harness cannot run the real
  canvas pipeline within the 60s caps. My M3 measurement shows the SIM side of
  per-frame scaling; the DRAW side is extrapolated, not measured.
- **`itemDrops` `age` field** (`src/main.js:2480`, `age: 0`) appears to be
  dead — nothing increments it (grep found no reader). High confidence from
  greps; not exhaustively proven by execution.

## TRIED TO BREAK AND COULD NOT (found solid)

- **dt spike on tab restore:** `frame()` clamps `realDt = Math.min(0.05,
  Math.max(0, ...))` (`src/main.js:7412`) — no accumulator exists to drain; a
  hidden-tab return cannot feed the sim a giant step.
- **Save layer robustness:** every `JSON.parse` is try/caught (`src/save.js:894`);
  corrupt and future-version payloads are preserved under a recovery key and the
  original key left untouched (`save.js:896-913`); `UNSAFE_KEYS` prototype-
  pollution filter runs on inbound collections (`save.js:325`).
- **Purse arithmetic:** every read/write int32-coerces; the paid-chest path guards
  affordability before rolling and cannot go negative (`src/main.js:1270-1277`);
  the settle zeroes the purse so the remainder can never double-bank
  (`main.js:3453-3455`) — the maw double-settle (S1) is the one hole, and it is
  the fold, not the purse.
- **NaN into gold via legitimate play:** all multiplier sources bounded
  (`main.js:1048-1053`, `heat.js:65-67`); `recordRun`'s `bump` is intOr-read-then-
  add, explicitly NaN-proof (`achievements.js:350`).
- **Splice-during-iteration:** all mutation-while-iterating sites found use
  backwards index loops or iterate a filter copy (verified in the pickup/drops/
  effects passes read for M3; survey concurs tree-wide).
- **Input hygiene:** blur clears pilot input; keyup always clears directions;
  touch handlers preventDefault and capture by pointer id; no gamepad polling to
  go stale (survey-verified across `src/main.js` input block + `controllers.js`).
- **AUTO/manual spend symmetry:** auto-drink and auto-cast gate on the same
  runAction/draftObstruction conditions as manual keys, tick only inside update();
  draft auto-pick suspends on hidden document (survey-verified; spot-checked call
  sites).
- **Escape minigame imports:** all `src/escape/` imports resolve; the repeatable
  bestGold/30 payout is a flagged-intentional faucet ("PARKED, DO NOT TUNE",
  `src/config.js:144`).

## DROPPED (did not fit the caps)

- In-browser (real canvas) frame-time profiling of the render findings — no
  browser harness on the box fits the 60s cap with meaningful results; N6 impact
  left as unverified.
- Full 30:00-scale survival measurement of ground-item accumulation in a real
  played run (60s sim cap); the synthetic 20k-entry measurement bounds the
  per-frame cost, but the organic accumulation RATE over a real run was not
  measured.
- A live iOS audio check (no device).
