**DISPATCH HEADER (goal pilot tick, 2026-09-16 ~23:40 UTC): issued on HEAD `7eaedf3` dirty=0 (suite greenfiles=129 redfiles=0 this tick). Pilot re-verified the cited sites BY READING them this tick: N1 sites live at src/main.js:1138 and :1150-1151 (still `| 0`), N2 at src/save.js:932 (saveProfileTo still hardcodes STORAGE_KEY), N3/N4 in src/achievements.js, N5 at the RECOVERY_KEY setItem in src/save.js. NOTE: the F1 vampiric-elite cap and M3 ground-item caps referenced under OUT OF SCOPE have LANDED in the interim (F1: config.js ELITE_VAMP_CAP_FRAC + main.js:2143 block; M3: bb32bda, config GROUND_ITEMS caps + pushGroundCapped) - they stay out of scope, now because they are DONE, not because they are separate.**

# NITS BUNDLE — N1-N6 from the 2026-09-16 audit (owner: "dispatch the fixes as you would recommend")

SOURCE: `docs/briefs/PROJECT_AUDIT_2026-09-16.md` section NITS. That audit is the
spec; this brief is the execution contract. Anchor by SYMBOL, not line number —
several audit fix rounds have landed since and line refs have drifted. Verify each
cited site still reads as described BEFORE editing; if a site has moved or been
fixed by an earlier round, say so and skip that item (do not re-fix).

LAND ALL APPLICABLE ITEMS IN ONE PASS. If one proves infeasible, land the rest and
name the blocked one with its evidence. EACH ITEM NEEDS A TEST THAT FAILS WITHOUT
THE FIX. Never weaken or retarget an existing assertion.

## ITEM N1 — runPurse numeric-domain disagreement
Reads/writes of the run purse coerce with `|0` (int32, wraps negative past 2^31)
in `src/main.js` (search `runPurse` — the audit cited :1081, :1093-1094, :3450)
while `validateProfile` (`src/save.js`, search `MAX_SAFE_INTEGER`) allows far
larger. Unreachable organically (purse zeroes at every settle; ~75.5k gold/run
measured). FIX: make the domains agree — prefer clamping consistently (a shared
clamp helper or the same bound at both ends) over dropping the coercion, so the
purse can never wrap negative regardless of writer. Do NOT change the
repair-to-valid policy in `validateProfile` for genuinely bad input.
TEST: a purse value at/past 2^31 cannot wrap negative through the real
read-modify-write path; a normal purse still settles exactly.

## ITEM N2 — saveProfileTo drops the custom-key option
`loadProfileFrom` honors `opts.key`; `saveProfileTo` ignores it (`src/save.js` —
the audit cited :879 vs :935), so a profile loaded from a non-default slot saves
back to the DEFAULT slot. Dormant (no caller passes `opts.key`) but it is a
loaded gun. FIX: thread the key through `saveProfileTo` (preferred — the option
exists to be symmetric) — do not remove the option, since load-side callers may
grow. Keep the default-slot behaviour byte-identical when no key is passed.
TEST: save with a custom key lands under that key and NOT the default; load with
the same key round-trips; a no-key save still hits the default slot.

## ITEM N3 — normalizeAchievements drops unknown ids
`normalizeAchievements` (`src/achievements.js`, the audit cited :149, :172) drops
achievement ids unknown to the live catalog, while save.js deliberately preserves
unknown achievement fields for newer builds. On a same-version downgrade, a
structural repair (`ensureAchievements`) silently destroys the newer build's
trophies. FIX: preserve unknown ids through normalization (carry them verbatim,
exactly the policy save.js already states) while still repairing malformed
KNOWN entries. Do not change the future-VERSION refusal (`src/save.js` version
gate) — that stays.
TEST: a profile carrying an unknown-id achievement survives a normalize +
ensureAchievements pass with the unknown id intact; a malformed KNOWN entry is
still repaired; the catalog's own ids are untouched.

## ITEM N4 — timed-goal text lies about the boundary
`src/achievements.js` timed-goal text says "under mm:ss" (audit: :508) but the
earn check is inclusive (`rt === within` earns, audit: :378). Cosmetic. FIX the
TEXT, not the boundary — the inclusive read is the kinder one and changing the
earn logic would silently un-earn boundary cases. "under mm:ss" -> wording that matches
the inclusive check (e.g. "in mm:ss or less" / "within mm:ss"). Check every
timed-goal string that flows through this path, not just the one cited.
TEST: the rendered/described text for a timed goal matches the inclusive
boundary; a run at exactly `within` still earns (existing behaviour pinned).

## ITEM N5 — single recovery slot gets overwritten
A second corrupt/future payload overwrites the first (`src/save.js`, the audit
cited :830-837 — unconditional `setItem` on `RECOVERY_KEY`). Only the latest
incident is recoverable. FIX (shape is pinned, do not freelances): TWO slots.
When a new incident arrives and `RECOVERY_KEY` is occupied, move the existing
payload to `RECOVERY_KEY + '.prev'` (overwriting any older `.prev`) and write
the new payload to `RECOVERY_KEY`. Latest stays primary, prior incident stays
recoverable, storage stays bounded at two. Whatever reads/offers recovery must
surface BOTH slots when both exist (check the recovery-offer path — if it only
reads the primary key, say so and extend it minimally).
TEST: two sequential corrupt payloads leave both slots populated and the latest
primary; a third rotates the oldest out; single-incident behaviour is unchanged.

## ITEM N6 — per-frame refit/repaint caches (MEASURE-FIRST, optional landing)
Two static-content draw paths redo work every frame (`src/render.js`):
(a) the boss-banner text is re-fitted via repeated `measureText` per frame of
its life (`fitPx` walks the px ladder per call — audit cited :1194-1212);
(b) the radar plate/rim repaints ~4,700 sqrt-gated 1px fills per frame for a
static disc (audit cited :1011-1023).
NEITHER was measured in-browser (audit's own disclosure). So: MEASURE FIRST.
Instrument the real per-frame cost of both paths in real Chrome at 390x844
(drive a boss banner live; radar on; read ms/frame through the existing perf
idioms). THEN:
- If a path is >= 0.1 ms/frame: land the cache (banner: sizes are a pure
  function of the strings — cache per banner; radar: prerender the static
  plate/rim to an offscreen canvas once, blit per frame) and re-measure.
- If a path is < 0.1 ms/frame: DO NOT LAND that half. Report the number and
  leave the code alone — an unneeded cache is complexity for nothing.
PIXEL-PARITY BAR for any landed half: the rendered output must be byte-identical
before/after the cache (same canvas hash/ink-count comparison idiom the suite
already uses for the radar OFF1/OFF2 check). A cache that changes one pixel is
a regression, not an optimisation.
TEST: cache hit path proven (second frame does not re-run `measureText`/the fill
loop — a counter or spy at the real seam); pixel parity before/after; measured
ms/frame numbers printed, before and after.

## EXPLICITLY OUT OF SCOPE
- N7 (`index.html` pinch-zoom meta): the audit itself marks it deliberate for a
  game, noted for the record. Do NOT touch the meta tag.
- The CREDIBLE BUT UNVERIFIED list (S2 audio bunching, itemDrops dead `age`
  field) — no fix without a demonstrated entry vector; do not touch.
- F4 finale-loop parity gap, fresh-run floor (G18), HUD gold clamp: owner has
  NOT called these. Do not touch.
- F1 vampiric elite heal and M3 ground-item cap: separate tasks/briefs. Do not
  touch.

## HOUSE RULES
Post `done:` / `blocked:` / `checkpoint:` to the hordes channel FIRST, then the
raw evidence. No emojis. Heartbeat at least once per long step to
/tmp/auditfix_nits.log. Nothing longer than 60 seconds of wall clock or sim time
per command. No git state commands. Leave the tree dirty and report the dirty
count with the files you touched. Full suite (`bash tools/run_suite.sh`) must
finish redfiles=0; run it once, and if a known-intermittent file goes red, retry
that one file once and say so. Do NOT weaken or retarget any existing assertion.

## REPORT
Per item: the fix shape chosen, the test name + result (and proof it fails
without the fix), files touched, and anything you COULD NOT VERIFY. For N6:
the measured numbers decide and must be printed either way.
