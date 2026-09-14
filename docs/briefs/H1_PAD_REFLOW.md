# H1 - THE CONTROL PADS MUST NOT REFLOW (owner-reported bug) - BUILD BRIEF

**Slice:** H1, first item of the EXECUTION ORDER at `docs/HORDES_GOALS_2026-09-12.md:671-703`.
**Builder:** `cli:kimi-hordes-g8`. **Brief authored/measured by:** the goal pilot, 2026-09-14, at
HEAD `a624078` (tree dirty=0).

## HOUSE RULES (read first - they override anything below that contradicts them)

- **Do NOT run any git state command** (no commit/checkout/reset/stash/clean) - the orchestrator owns
  commits. Leave the tree dirty and report; the landing is not your job.
- **Never weaken or delete an assertion to go green.** If the fix legitimately invalidates an
  assertion, RETARGET it to the new invariant and SAY SO in your report. Exactly one existing
  assertion is expected to need that (see ACCEPTANCE), and it is named.
- **A code claim is not evidence.** Every number you report must come from a command whose raw output
  you keep and quote.
- **No emojis** anywhere (owner's UI rule). Pixel-art integrity: integer pixels, no blur, no smoothing.
- 60Hz and 120Hz must both be correct; do not assume a fixed dt.
- **Lock:** if `.agentlock` is held, sleep 20s and re-check, up to 15 times (5 min). Never edit while
  another owner holds it. Take the lock yourself before the first edit and release it when done.
- **Scope bound:** this slice changes `index.html` (CSS only), `test/smoke.mjs`, and
  `tools/verify_skill_keys.mjs`, plus ONE new tool `tools/verify_h1_pad_reflow.mjs`. It must not touch
  game logic (`src/*.js`) at all. If you believe a `src/` change is required, STOP and report instead.

## THE BUG (owner report, verbatim)

Sk408, 2026-09-14: *"the on screen controls fluctuate in size during a run. I think it's the updates
to pilot status. Should be fixed to accommodate any change to pilot status."*

## MEASURED STATE (pilot-run this tick, real Chrome, 390x844 @dpr3, key spans live)

Probe: `/tmp/h1_probe2.mjs` (throwaway, outside the repo), raw output `/tmp/h1_probe2.log`. It set the
badge texts exactly as `updateTouchHud()` writes them (`src/main.js:5112-5141`) and read
`getBoundingClientRect()` per state. **Current, unpatched widths:**

| state (badge text)                | left pad w | right pad w | buttons w |
|-----------------------------------|-----------|-------------|-----------|
| MANUAL (pilot badge `MANUAL`)      | **74.97**  | 94.2        | 74.97 / 94.2 |
| AUTO_ALL + act PATROL (`AUTO_ALL \u00b7 PATROL`, 17 ch) | **140.59** | 94.2 | 140.59 / 94.2 |
| AUTO_MOVE + act PATROL (`AUTO_MOVE \u00b7 PATROL`)      | **147.22** | 94.2 | 147.22 / 94.2 |
| AUTO_ALL + act FLEE + cooldown 8.0s                 | **127.34** | 94.2 | 127.34 / 94.2 |
| counts 12 (`AUTO_MOVE \u00b7 LOOT`)                | **133.97** | 94.2 | 133.97 / 94.2 |

**The left pad swings 74.97 px -> 147.22 px (72.25 px, ~2x) inside a single run** as the pilot badge
text changes, and it drags all four left buttons with it. The pads were also never equal (140.59 vs
94.2) even though `index.html:155-159` claims "both pads are identical" - that comment is wrong today.

Cause, read from the markup: `#touch .pad` (`index.html:147-152`) is a shrink-wrapping flex column with
**no width**, and `#touch button` (`:196-202`) has only `min-width: 68px`; the `.badge` span
(`:204-206`) is `display:block` inside it, so the badge's max-content width sets the pad's width. The
badge text is written live by `updateTouchHud()`: `tc-focus` (NEAREST/TOUGHEST/SWARM/RANGED),
`tc-stance` (SAFE/BALANCED/GREEDY), `tc-pilot` (`state.pilotMode` and, when `state.stanceAct` differs,
`pilotMode + " \u00b7 " + act` - so `AUTO_MOVE \u00b7 PATROL`), `tc-q`/`tc-w` (RDY / LOW / `8.0s`),
`tc-h`/`tc-n` (potion counts, which reach 2 digits).

**Measured worst cases the fix must absorb** (same probe): longest badge string `AUTO_MOVE \u00b7 PATROL`,
badge scrollWidth **119.0 px** (AUTO_ALL \u00b7 PATROL 113.0, \u00b7 FLEE 99.0) against a 68 px content box;
badge box height is **14.3 px** on one line and **28.59 px** when it wraps to two.

The joystick is `left:50%; margin-left:-60px` (`index.html:164-176`) - viewport-centred and NOT moved by
pad width, so the visible symptom is the pad itself changing size (and, at the widest states, the left
pad's right edge reaching x=157 while the 120 px joystick spans 135-255 at 390 px - the pads must stay
inside the 96 px budget the repo's layout math assumes).

## REQUIRED FIX (pilot's call - implement this shape)

Make the pad geometry independent of text. All three parts, or it is not fixed:

1. **A fixed pad width.** `#touch .pad { width: 96px; }` - keep 96: it is the number
   `test/smoke.mjs:1620` and `tools/verify_skill_keys.mjs:190-196` already use as the budget, and at 96
   the joystick clears both pads at 360 px (gap 14 px) and 390 px (gap 29 px) by that same math. Both
   pads, same width, so the "equal pads" claim in `index.html:155-159` finally becomes true.
2. **Buttons that cannot size the pad.** `#touch .pad button { width: 100%; box-sizing: border-box; }`
   plus a fixed button HEIGHT (measure it; ~62-64 px fits a 16.9 px label line + a 2-line badge + the
   existing 6 px vertical padding - the shipped single-line height is 56 px and the two-line case
   measures 62.89/63.48 px). The `.cog-only` desktop variant (`index.html:144`) must be given the same
   guarantee; if that changes what any existing assertion measures, report it rather than weakening it.
3. **A badge that reserves its own box.** `#touch button .badge { display:block; min-height: 28.6px; }`
   (the measured 2-line height) with wrapping allowed (`white-space: normal; overflow-wrap: anywhere`).
   **Do NOT clip the badge text to win this:** the pilot badge is the doctrine's only on-screen home for
   FLEE/LOOT/PATROL (`src/main.js:5116-5125`) and the owner is asking for it to be readable at any
   value. A probe variant that clipped the overflow (`overflow:hidden; text-overflow:clip`) did make
   every rect constant, and it is REJECTED for exactly this reason - the text must be fully visible
   inside its reserved box, not truncated.

**Forbidden fixes:** shortening the pilot/status strings (`AUTO_MOVE \u00b7 PATROL` is the live contract);
deleting the badge from any button; a `max-width` that clips; hiding the live activity text; any change
to `src/*.js`; `transform: scale()` tricks that re-scale the text.

## ACCEPTANCE (all of it, measured - the bar is byte-identical dimensions)

1. **New tool `tools/verify_h1_pad_reflow.mjs`** - real browser, PHONE viewport **390x844 @dpr3**, and it
   must set **all 19 TOUR_KEYS** (`src/tour.js:29-49`; `tools/browser.mjs`'s startup sets only 7) and
   **assert `state.time > 1.0` BEFORE measuring anything** - the tick-38 lesson: a run reached with the
   coach gate active is frozen and every measurement is of a paused game.
   Harness note from this tick's probe: on a fresh profile a real tap on the title's START GAME card
   missed 4 times out of 4 (mode stayed `title`); `__TEST.startRun()` (`src/main.js:5749`) reached a
   live `playing` run. Assert the transition (mode `playing` and the clock advancing) either way instead
   of assuming a tap landed, and for a state you cannot reach through the real seam, set the PUBLISHED
   field the HUD reads (`state.pilotMode`, `controller.act`, `state.player.skillCd[...]`,
   `state.player.potions.*`) and wait a frame.
   It must capture `getBoundingClientRect()` (x, y, width, height, all four) for **both pads, every pad
   button AND `#joy`** in each of these states, and assert **exact equality** across all of them:
   - pilot `AUTO_ALL`, `AUTO_MOVE`, `MANUAL` (drive the mode through the REAL cycle seam,
     `runAction('pilot')`, `src/main.js:453-462`; `#joy` is `display:block` only in MANUAL, `:5105-5109`);
   - live act `PATROL`, `FLEE`, `LOOT` (the pilot badge's worst case is `AUTO_MOVE \u00b7 PATROL`);
   - focus `NEAREST` -> `TOUGHEST`, stance `BALANCED` -> `GREEDY`;
   - badge change `RDY` -> cooldown (`skillCd` 8.0 -> `8.0s`) and potion count `1` -> `12`;
   - and assert `#joy`'s rect is unchanged by any of the above in MANUAL.
   Print the per-state rect table and save a phone PNG (expect 1170x2532); report its dimensions.
2. **`test/smoke.mjs` (headless, the WAVE-17 block at `:1596-1627`)** - keep `BTN_W = 96` and the
   gapL===gapR / gapL>0 assertions EXACTLY as they are (at 96 the clearance assertions now hold with no
   slack, which is the point), and ADD static assertions from `index.html` that the no-reflow contract is
   in the markup: a fixed width on `#touch .pad`, `width: 100%` + `box-sizing: border-box` on pad
   buttons, and a reserved `min-height` on `button .badge`. Update the ":1617 Button box = 68 content +
   24 h-padding + 4 border" comment to say the pad width is now literally 96 px in CSS.
3. **`tools/verify_skill_keys.mjs`** - re-run it and report its numbers. **Line 197
   (`d.pads.left.w === d.before.padLeft`, "the left pad must be untouched") is EXPECTED to red**: a fixed
   96 px pad is precisely the change the owner asked for, and that assertion pins the old
   content-driven width. Retarget it honestly to the invariant that now matters and that WAVE-17 always
   wanted - left pad width === right pad width === the fixed 96 - and say so in the report. Do NOT
   touch lines 195 (`right <= 96`), 199 (`right >= before`) or 202-205 (joystick clearance): they must
   keep passing on their own.
4. **`bash tools/run_suite.sh` => `redfiles=0`, three consecutive runs**, each with its TREE line
   (tree + HEAD + dirty count) quoted. Report the tally for any test file you touched.
5. **Report, in the completion message:** the BEFORE table (mine, above) next to your AFTER table of the
   same states; the fixed pad/button/badge numbers you chose and where each came from; the suite tree
   lines; the PNG path and its dimensions; and anything you could NOT verify. A `done:` line without
   those numbers is not a completion.

## WHY THE BAR IS THIS STRICT

The bug is a measurement, not a look: "it looks the same" cannot distinguish 74.97 px from 147.22 px on
a moving phone screen. Byte-identical rects across every state is the only claim that means anything
here, and the owner's report is specifically that this changes DURING a run - so the proof has to
include the mid-run badge transitions, not just a fresh-start screenshot.
