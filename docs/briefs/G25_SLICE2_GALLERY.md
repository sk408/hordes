# G25 SLICE 2 - THE APEX PROOF GALLERY: A FULL-SCREEN PIXEL-ART ENTRY FOR THE APEX TIER - BUILD BRIEF

**Slice:** G25 slice 2 (the apex tier's FULL-SCREEN PIXEL-ART GALLERY ENTRY - requirement 5's last clause,
chartered and deliberately deferred by `docs/briefs/G25_APEX_TIER.md` section 8).
READ FIRST, in this order: `docs/HORDES_GOALS_2026-09-12.md` :2597 (the G25 entry, authoritative - five
binding requirements plus the seven design rules) and `docs/DESIGN_TARGETS.md` section 6 (the apex
protections). This brief is the executable half of requirement 5: *"Ownership must be VISIBLE - aura, title,
HUD flourish, and a full-screen pixel-art gallery entry - or the grind has no trophy value."* Slice 1 owed
the HUD flourish + the run-end mark; THIS slice owes the gallery entry and the authored art it needs.

**Builder:** whichever lane answers the dispatch probe on `hub` (target form `cli:kimi-hordes-g8` or
`cli:glm-hordes-g8` - the COLON form; the `@`-underscore form returns success and delivers nothing).

**Brief authored by:** the goal pilot (tick 54, 2026-09-15 ~10:00 UTC) while G25 slice 1 was STILL RUNNING
(task `msg_01M2J7A8W382DHHJKYSNCJRWA5`, lane `cli:glm-hordes-g8`), so it is written OUTSIDE the repo and
every number below is AUTHOR-TIME and untrustworthy until the dispatch tick re-resolves it.

**AUTHOR-TIME STATE (read this before trusting any line number):** HEAD `c40abcb`, worktree DIRTY
(dirty=10-11: `src/main.js`, `src/meta.js`, `src/save.js`, `src/weapons.js`, `src/art/shop_icons.js`,
`test/test_art_lint.mjs`, `test/test_meta.mjs` modified + `docs/briefs/G25_APEX_TIER.md` untracked) -
that dirty tree IS G25 slice 1 MID-FLIGHT. **The dispatch tick MUST NOT issue this task until slice 1 is
pilot-verified and `bash tools/run_suite.sh` ends `redfiles=0`; it MUST then re-run the DISPATCH ANCHOR
CHECK below and correct every drifted line number IN PLACE before issuing.**

## HOUSE RULES (binding, unchanged)

- NO GIT STATE COMMANDS: no `git commit/checkout/reset/stash/clean/push`. The orchestrator (Remy) owns
  commits. Leave the tree dirty and report the dirty count.
- NEVER weaken an assertion to make a suite go green. If a number moves, retarget it EXPLICITLY and
  enumerate every retarget as `file + line + why` in the report. The art-format contract in
  `test/test_art_lint.mjs` is HARDCODED ON PURPOSE ("the test owns the contract, the module only holds a
  copy") - you may ADD a section to it, you may NEVER widen or relax an existing entry to make new art pass.
- Every claim in the report needs MEASURED evidence (command + its real output). "Looks right" is not
  evidence. Red = red: report it, do not hide it.
- NO EMOJIS in any app UI, copy, or DOM string (owner rule). Plain, terse, uppercase HUD voice, matching
  the existing gallery strings (`TROPHIES`, `PREV`, `NEXT`, `BACK`).
- ONE WRITER PER FILE. This slice owns: a NEW `src/art/apex.js`, the registration lines in
  `src/art/index.js`, a NEW gallery-screen block in `src/main.js`, a NEW `tools/verify_g25_apex_gallery.mjs`,
  and the added section in `test/test_art_lint.mjs`. It does NOT re-edit `src/meta.js`, `src/save.js`,
  `src/weapons.js` (slice 1's files) - read them, never rewrite them. Any needed change there is a FLAG in
  the report, not a silent edit.
- Deterministic only. NOTHING in this screen rolls dice; ownership is a read of `profile.apex.owned`.
- Do not reprice, retune or "balance" anything. Other goals own those numbers.

## WHAT ALREADY EXISTS (measured by the pilot at author time - re-verify, do not trust)

- **The G9 gallery seam is the one grid-showcase idiom and this slice REUSES it** (the bestiary comment at
  `src/render.js` :1845 says so out loud: "Mirrors drawTrophyShowcase EXACTLY ... no second screen idiom").
  - `src/render.js` :1805 `drawTrophyShowcase(g, state)` reads `state.trophyView = { art, locked, id } | null`,
    paints a full-view backdrop (`rgba(3,3,8,0.94)`), then a case in the HUD's own chrome vocabulary
    (`CONFIG.HUD.FRAME` / `PLATE_SOLID`), the grid at the LARGEST INTEGER scale that fits (centered, one
    block per painted pixel, no smoothing), and sets the measurable seam
    `this.trophyShowcase = { scale, x, y, w, h, id, locked }` (null when nothing is selected).
    It is a NO-OP when `trophyView` is null, so it is safe to call in every mode.
  - Call site: `src/main.js` :6636 (inside `frame()`), guarded everywhere but a no-op when the view is null.
  - Trophy side: `src/main.js` :5050-5165 - mode `'trophies'`, `trophiesModel()` :5063,
    `refreshTrophyView()` :5087 (writes `state.trophyView` at :5101), `trophiesStep(delta)` :5148,
    `closeTrophies()` :5159 (nulls the view at :5160). Key contract in the input handler at :5633
    (`escape` -> out, `arrowleft`/`arrowright` -> step). State fields declared at `src/main.js` :367-373.
- **The art system** (`src/art/`): `format.js` (`makeAsset`), `trophies.js` (32x32 emblems, house rules in
  the header comment: 1 ink outline `#0a0a0e`, 2 base, 3 rim light TOP-LEFT, 4 shade BOTTOM-RIGHT, 5 accent,
  6 tier pip; ONE lighting direction; silhouette fills 45-75% of the box; `rows` is DERIVED from `grid`,
  never authored twice), `index.js` (`ART_SECTIONS` -> `ART_ASSETS` / `ART_COUNTS`, plus the re-export list),
  `shop_icons.js` (`SHOP_ICONS`, `SHOP_ICON_IDS`, `SHOP_ICON_FALLBACK_ID`, `shopIcon(id)`; 12-16px
  convention - slice 1 already added `apex_mark` + `apex_endless_fire` icon rows, the lint's expected-shop
  list names them).
- **`test/test_art_lint.mjs`** is the format contract: hardcoded `LIMITS`
  (`TROPHY` 32x32, `PORTRAIT` 32x32, `SHOP_ICON` 12-16, `PORTAL` 48x48, `TITLE_LAYER`) +
  `SECTION_LIMIT` (`trophies`/`portraits`/`shop`/`title`/`portal`) + hardcoded id lists
  (e.g. `EXPECTED_TROPHIES`, `EXPECTED_SHOP`). It imports from `src/art/index.js` and asserts row/grid
  parity, integer palette keys that exist, and that every asset's id matches its key.
- **`src/achievements.js`** :505-520 - how a gallery lists entries WITHOUT leaking locked content:
  `ACHIEVEMENT_DISPLAY_IDS = TROPHY_IDS.filter(id => id !== TROPHY_FALLBACK_ID)` and `galleryModel(profile)`
  masks unearned entries by handing back the LOCKED silhouette as `art`. `TROPHY_FALLBACK_ID = 'LOCKED'`
  is the codebase's ONE mask (`src/art/trophies.js` :1221, `trophyArt(id)` :1223 falls back to it).
- **The chrome gate**: every new mode must be registered where `chromeOn`/`syncChrome` decide HUD/DOM
  visibility, or the wave-23 regression (chrome over the intro movie) repeats. Verify in a real browser.

## THE GAP THIS SLICE CLOSES

Slice 1 makes ownership VISIBLE only in-run (a HUD flourish line) and at the run end (the `APEX` clause).
Requirement 5 wants a TROPHY - a thing to look at when the grind pays off, in the game's own pixel-art
idiom, reachable from the tier it belongs to. Nothing about the apex tier is viewable as a screen today:
`grep -rn "apex" src/render.js` is empty and the apex panel (slice 1) is a LIST of rows, not a showcase.

## SCOPE (chartered - ONE slice, end to end)

### 1. THE ART - a NEW `src/art/apex.js`, exactly two emblems + NO second mask

- `APEX_ART` with two 32x32 entries keyed by the LIVE apex item ids from slice 1's catalogue
  (`apex_endless_fire`, `apex_mark` - read the ids off `APEX_UPGRADES` in `src/meta.js`; if slice 1 named
  them differently, FOLLOW THE CODE and report the difference, do not invent ids).
- Follow the `src/art/trophies.js` house rules exactly: `makeAsset`, integer palette indices, `1` = ink
  outline `#0a0a0e`, ONE lighting direction (rim light top-left, shade bottom-right), the silhouette a solid
  mass filling 45-75% of the box, and `rows` DERIVED from `grid` (never authored twice).
- These are the TOP tier: keep the house tier-pip idiom legible at 32px and do NOT invent a new pip legend
  - read the pip contract in `trophies.js`'s header and in `test_art_lint.mjs` and follow what is asserted
  there. If the lint asserts pip counts only for the `trophies` section, the apex section carries its own
  contract entries (next bullet) rather than redefining the trophy legend.
- Export `APEX_IDS`, `APEX_FALLBACK_ID`, `apexArt(id)` mirroring `trophies.js`'s
  (`trophyArt` falls back to the LOCKED emblem rather than returning undefined).
- **THE MASK IS REUSED, NOT RE-AUTHORED:** an unowned/undrawn apex entry uses the EXISTING LOCKED
  silhouette (`trophyArt(TROPHY_FALLBACK_ID)`), so the codebase keeps ONE mask concept. Do not author a
  second silhouette and do not add a second fallback emblem for apex.
- **REGISTER IT:** add an `apex` section to `ART_SECTIONS` in `src/art/index.js` (so `ART_ASSETS` /
  `ART_COUNTS` derive it with no extra wiring), export the new names from `index.js`, and add the matching
  hardcoded entries to `test/test_art_lint.mjs` (`LIMITS`/`SECTION_LIMIT` + the expected-id list for the new
  section). ADD only - every pre-existing entry stays byte-identical.

### 2. THE SCREEN - a full-screen apex gallery that REUSES the showcase renderer

- A new mode (name it `'apex'`) in `src/main.js` that shows ONE apex item at a time FULL-SCREEN in the SAME
  case the trophy gallery uses. **Reuse `renderer.drawTrophyShowcase`** - the payload it reads
  (`{ art, locked, id }`) is already the right shape. PREFERRED: write the same `state.trophyView` contract
  (one grid-showcase contract in the codebase, exactly as the bestiary chose to mirror rather than
  duplicate); if you find a hard reason that does not work, report the reason and your alternative rather
  than silently adding a third showcase renderer. Whatever you choose, `drawTrophyShowcase`'s
  `this.trophyShowcase` seam MUST be populated while the screen is open and NULL on every exit path.
- Title `APEX`, a one-line sub that names the SELECTED item and its effect (read the `removes` text off the
  apex catalogue - ONE table, never restated here), `PREV` / `NEXT` / `BACK` cards exactly like the trophy
  gallery (`menuCard`, the same card vocabulary - do not invent a widget), and one caption line stating
  OWNED or LOCKED for the selected item.
- The ring walks the WHOLE apex set (slice 1 ships two items; slice 2's ring must be derived from the
  catalogue so items 3..6 appear with no further wiring), wrapping at both ends like `trophiesStep`.
- Keys: `escape` backs out, `arrowleft`/`arrowright` step - the gallery's exact key contract.
- **Reachability: ONLY through the gated apex panel.** With the gate closed (`apexUnlocked(profile)`
  false) the screen must be UNREACHABLE (no card, no key, no path) - requirement 4's "cannot be bought
  early or by accident" extends to being LISTED early. From the panel, one activation opens it; BACK
  returns to the panel, not the title.
- Register the mode in the screen-chrome gate (`chromeOn`/`syncChrome`): the play HUD, hints, touch
  controls and joystick are OFF while it is open, and the gallery's own overlay chrome is on.

### 3. LOCKED IS TANTALISING, NEVER BLANK

An apex item that is not owned paints the REUSED LOCKED silhouette (a shape to chase) with a `LOCKED`
caption, exactly the convention `galleryModel` already sets. Nothing in this screen may leak an unowned
item's name/effect beyond what the apex panel itself already shows to an UNLOCKED gate user - state your
rule in the report.

## ACCEPTANCE BAR (all of it, each item with the command that proves it)

1. **Suite green on the artifact:** `bash tools/run_suite.sh` => `TREE: ... | dirty=N` and
   `SUITE greenfiles=N redfiles=0` (N >= slice 1's count; if redfiles > 0, STOP and report `blocked:`).
   Also run `node test/test_art_lint.mjs` standalone and paste its PASS/FAIL tail, including the new apex
   section's assertions.
2. **The art contract is ADDED TO, never relaxed:** paste the `git diff --stat test/test_art_lint.mjs` and
   enumerate every changed line as add-or-retarget with a WHY. Zero changed lines in the pre-existing
   trophy/portrait/shop/portal/title entries.
3. **REAL-BROWSER PHONE PROOF - a NEW `tools/verify_g25_apex_gallery.mjs`:** real Chrome, viewport
   390x844 @ dpr3 (PNG 1170x2532). It must: start a run with a REAL tap, assert `state.time > 1.0` BEFORE
   measuring anything, seed ownership through the REAL profile path (an apex-owned profile that passes the
   gate - do NOT hand-poke internals), open the apex panel, activate the gallery entry, then assert and
   print: the `renderer.trophyShowcase` box with its INTEGER scale and screen coords, the selected id, the
   OWNED/LOCKED caption string, a PREV/NEXT step changing the id, a step onto a LOCKED entry painting the
   SAME LOCKED silhouette (assert the mask id, not a pixel guess), ESC returning to the panel, the chrome
   gate state (`#hud`, `#hints`, `#touch`, `#joy` all `display:none`), and a canvas INK READ-BACK inside
   the showcase box (count non-background pixels; assert > 0 and print the number). Save the capture to
   `docs/art/browser-verify-2026-09-12/g25-apex-gallery-phone.png` and a second capture with the gate
   CLOSED showing there is NO path in. NOTE: this host has NO vision tool in this job - the PNG is read
   back by ink/state/geometry, and that limitation is DISCLOSED in the report, not papered over.
4. **The clean clear stays clean (requirement 5's integrity rule):** with apex not owned (or apex OFF), the
   title, menu, shop DOM, run-end screen and the trophy gallery render BYTE-IDENTICALLY to before this
   slice - assert STRING EQUALITY of the built strings, and assert the apex screen cannot be entered by any
   key or card. Do not assert this by eye.
5. **The showcase seam is honest:** `renderer.trophyShowcase` is NULL whenever the screen is closed
   (including after every exit path: BACK, ESC, panel re-entry), asserted in the harness.
6. **Chrome gate verified in the real browser** (item 3 prints it) for the new mode, per the standing
   BUILD_PLAN rule that a mode skipping the gate is the wave-23 regression.
7. **No new randomness, no new price, no new effect:** `grep -rn "Math.random" src/art/apex.js` empty and the
   new screen adds no roll; every number it shows is read from the slice-1 catalogue.

## DISPATCH ANCHOR CHECK (run this FIRST, in the repo, and paste the output in the report)

0. `git status --short` then `bash tools/run_suite.sh` - do NOT start on a red tree or on a tree that still
   contains slice 1 mid-flight.
1. `git log --oneline -1` (record HEAD; do NOT change it) and `git status --short | wc -l` (record dirty).
2. `grep -n "export function drawTrophyShowcase\|drawTrophyShowcase(renderer.ctx" src/render.js src/main.js`
3. `grep -n "function trophiesModel\|function refreshTrophyView\|function trophiesStep\|function closeTrophies\|state.mode === 'trophies'\|trophyView:" src/main.js`
4. `grep -n "APEX_UPGRADES\|apexUnlocked\|apexEnabled" src/meta.js src/main.js src/save.js | head -30` (slice 1's
   real seams - these ARE the ids and the gate this slice reads)
5. `grep -n "export const ART_SECTIONS\|ART_LIMITS\|export \* from\|export {" src/art/index.js | head -20`
6. `grep -n "TROPHY_ART\|TROPHY_IDS\|TROPHY_FALLBACK_ID\|export function trophyArt" src/art/trophies.js`
7. `grep -n "SECTION_LIMIT\|EXPECTED_\|const LIMITS" test/test_art_lint.mjs | head -20`
8. `grep -rn "apex" src/render.js src/art/ || echo "NO APEX IN RENDER/ART (expected pre-slice-2 in render.js; the ART side is slice 1's shop icons)"`
Correct every drifted line number IN PLACE in this brief before issuing, or note the correction in the
dispatch record.

## REPORT FORMAT (post as the task answer)

1. `done:` / `blocked:` / `partial:` one line first.
2. HEAD + dirty count at start and at end, plus the suite tail verbatim.
3. The DISPATCH ANCHOR CHECK output, and every anchor you corrected.
4. Files touched: created vs modified, one line each with what it does.
5. Acceptance bar 1-7, each with the command run and its REAL output tail (numbers, not adjectives).
6. Every retarget as `file + line + why`, and every pre-existing art entry you did NOT touch (say so).
7. Flags: anything measured that disagrees with this brief, anything you could not verify, and anything you
   think belongs to another goal.

## OUT OF SCOPE - named so it is visibly deferred, not silently dropped

- Apex items 3..6, the aura and the title flourish (slice 3 if the owner wants them).
- Any repricing, any change to the gate, the toggle or the save schema (slice 1's).
- Any edit to `src/heat.js`, the HUD heat line, or the G21 card deck.

## DISPATCH RE-ANCHOR (measured by the goal pilot ON THIS TREE at dispatch, 2026-09-15 10:25 UTC)

- HEAD `c40abcb`. Tree DIRTY=19 (G25 slice 1's landed-but-uncommitted work, plus this brief and its own new
  files). Do NOT run any git state command - leave the tree dirty and report the dirty count.
- `bash tools/run_suite.sh` => `TREE: /home/claude/projects/hordes @ c40abcb | dirty=19` /
  `SUITE greenfiles=92 redfiles=0`. Run the suite SERIALLY (see the transient-red note below).
- TRANSIENT RED, NOT A REGRESSION: one pilot suite run reported `RED test/test_rewrites.mjs :: no assertion
  line captured` while `/tmp/hordes_suite/test_rewrites.log` did not exist; the file passes standalone
  (`rewrites: PASS=56 FAIL=0`) and the pilot re-run is 92/0. Cause is a `/tmp/hordes_suite` clobber race when
  two suite runs overlap. If you see a red with no assertion line, check the log file exists before believing it.
- SLICE 1 IS LANDED AND PILOT-VERIFIED on this tree - it is YOUR BASELINE, do not revert or rewrite it:
  `src/meta.js` (APEX_UPGRADES own array :629, APEX_BY_ID :657, apex_mark :642, apex_endless_fire :649),
  `src/save.js` (v7->v8 migration :239, apex normalize/repair :618-645), `src/weapons.js` (the ONE re-arm
  seam, `if (state.apexFire) return 0;` :204), `src/main.js` (+86: the apex panel, the stamps, the HUD
  flourish line), `src/art/shop_icons.js` (both apex icon rows), plus `test/test_apex.mjs` (new),
  `test/test_meta.mjs`, `test/test_save.mjs`, `test/test_save_v3_characters.mjs`, `test/test_encounters.mjs`,
  `test/test_art_lint.mjs`, `tools/balance_sim.mjs`, `docs/DESIGN_TARGETS.md`.
  Pilot evidence for slice 1: `node tools/verify_g25_apex.mjs` => `VERIFY G25 APEX: ALL 19 CHECKS PASSED` in a
  real browser at 390x844 @dpr3 (real taps; byte-identity of `endScreenBody` with apex OFF; 1170x2532 PNGs).
- LIVE APEX IDS ARE EXACTLY `apex_mark` and `apex_endless_fire`; `profile.apex` is
  `{ owned: [], enabled: false }` at save version 8. Build the gallery against THOSE ids only.
- LINE-ANCHOR WARNING: every anchor in this brief that names `src/main.js`, `src/meta.js`, `src/save.js`,
  `src/weapons.js`, `src/art/shop_icons.js` or `test/test_art_lint.mjs` was measured while slice 1 was
  landing and IS DRIFTED (`main.js` and `save.js` both grew by dozens of lines). Re-measure each in the
  DISPATCH ANCHOR CHECK and correct it in place before building. `src/render.js` was NOT touched by slice 1 -
  its G9 gallery anchors should still hold, but verify them too.
