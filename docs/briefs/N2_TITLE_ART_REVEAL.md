# N2 BRIEF — SHOW THE TITLE ART: MENU FADE-IN + 1s ART HOLD (owner-ordered 2026-09-13, item 1)

Self-contained. Read this whole file first, then the files it names. You are the only writer in
`/home/claude/projects/hordes` while you hold the lock.

## HOUSE RULES (non-negotiable)
- No emojis anywhere. Integer pixels only, no smoothing, no blur.
- 60Hz AND 120Hz must both be correct; nothing may assume a fixed dt. Drive every timing value off
  the frame dt/delta already available in the render/update loop, never off a fixed frame count.
- Never weaken, skip or delete a test. A test may be retargeted to a replaced contract, never no-op'd.
- Do NOT run `git commit|checkout|reset|stash|clean` — the orchestrator owns commits.
- Do not retune balance, do not touch `src/heat.js`, `src/challenges.js`, `src/weapons.js`.
- Do not author new art: the title art already exists (`src/art/title.js`).
- One writer per file. Everything below lives in `src/main.js` (+ at most a small CSS addition in
  `index.html`); nothing else needs to move.

## RECON ALREADY DONE (verified 2026-09-13 04:45Z by the pilot tick — trust these, re-check cheaply)
The G12 half of this is ALREADY LANDED, so do NOT rebuild it. The pilot tick re-ran
`tools/verify_g12_title.mjs` on the current tree itself: PASS — title art pixel-proven behind the menu,
cards in viewport, real taps drive start + exit, farewell renders, PNG
`docs/art/browser-verify-2026-09-12/g12-title-phone.png`. Suite on this tree, pilot's own run:
`bash /tmp/run_all.sh` => `PASS=70 FAIL=0`.

What exists and where (line numbers are current):
- `src/render.js:214` `drawTitleScreen(g)` paints the authored card (integer scale, no smoothing) and
  publishes the seam `this.titleScreen = {x,y,w,h,scale}` (set at ~228, nulled at ~239 when not in
  title). Called from `render()` at ~244 when `state.mode === 'title'`.
- `src/main.js:3105` `showTitle()` — calls `openMenu('title')`, hides the DOM `<h1>`
  (`ovTitle.style.display = 'none'`), sets `overlay.style.background = 'transparent'`, then builds the
  cards (START GAME / [LOAD FROM DISK when fresh] / SHOP / CHARACTERS / TROPHIES / BESTIARY /
  CHALLENGE / SETTINGS / HOW TO PLAY / EXIT GAME last). Ends with `maybeStartMenuTour()`.
- `src/main.js:2702` `openMenu(mode)` — sets `overlay.style.display = 'flex'`, clears `ovCards`, and
  RESETS `overlay.style.background = ''`, `overlay.style.justifyContent = ''` and
  `ovTitle.style.display = ''`. It is SHARED by every meta screen (shop, characters, trophies,
  bestiary, settings, how-to-play, farewell). Any title-scoped styling override must be applied AFTER
  this call (the existing pattern) and must not survive it.
- `src/main.js:3084` `exitGame()`, `src/main.js:3379` `startRun()`, `src/main.js:4362` `chromeOn()`,
  `src/main.js:4365` `syncChrome()`, `src/main.js:2753` `maybeStartMenuTour()`,
  `src/main.js:4586-4605` the cinematic gesture guard `uiGuard` (`arm/armed/standDown/swallow`).
- Tests that must stay green and already cover this surface: `test/test_title_screen.mjs`,
  `test/test_tour.mjs`, `test/test_trophies.mjs`/`test_trophy_gallery.mjs`, `test_test_meta`-family.

## THE OWNER'S ASK (verbatim intent, 2026-09-13)
> "Ooh that's nice! We can't hide that permanently. The menu needs to fade in so players can see this!
> And then when they select a run, it should remain for 1 second. Maybe even animate it for that second."

## DO
1. **THE MENU FADES IN OVER THE ART (first thing the player sees is the art).** On entry to the title,
   paint the art, show it ALONE for a beat, then bring the DOM menu up to full opacity over ~400-600ms.
   Implementation should animate `#overlay` opacity (the art is a canvas paint behind a transparent
   overlay, so this is an opacity reveal, not a restructure). Expose the current overlay opacity as an
   ASSERTABLE seam the tests can read (e.g. `state.titleReveal = {t, dur, opacity, phase}` or a
   getter), because the acceptance bar is numeric.
   - **Do NOT replay the full 500ms fade on every return to the title.** Default: the reveal runs on the
     FIRST entry to the title after page load; returning from a submenu (SHOP -> BACK) may snap or use a
     short (<=150ms) fade. State in your report which you chose.
   - The fade must NOT leak: no other screen (`openMenu` family) may inherit a partial opacity, and
     leaving the title mid-fade must leave the overlay at full opacity for the next screen.
2. **ON START GAME: FADE OUT, HOLD THE ART ~1s, THEN START.** Pressing START GAME must: fade the menu
   OUT, keep `state.mode === 'title'` so the canvas keeps painting the art, hold for about a second,
   then call `startRun()`.
   - Must be IDEMPOTENT against a double-tap / a key-repeat / a second pointer event: use the existing
     `uiGuard` (arm on the hold, `standDown()` semantics) rather than a new boolean, and make sure the
     hold can never be entered twice (no two `startRun()` calls, no stuck state).
   - Must FAIL SAFE: if anything throws or the hold is cancelled, the overlay must not be left hidden —
     the player must never get a blank screen with no way back.
   - Scope it to the TITLE's START GAME only. End-of-run retry / "play again" paths keep their current
     timing (a 1s tax on every retry is a regression; state the measured before/after call time).
3. **OPTIONAL (owner said "maybe"): animate the art during that second.** The art is PAINT-ONCE by
   design (invalidated only on resize / mode-leave — see `drawTitleScreen`), so either repaint
   deliberately for that beat or use a cheap effect on the existing pixels (a glow / shimmer / a
   brightness flash). NO transforms that resample, NO smoothing, integer-safe. Respect the standing
   juice rule: glow/crackle yes; slow-motion and shake are rare and earned only — do NOT shake the
   title. If you skip this, say so explicitly rather than implying it.
4. **THE FIRST-RUN TOUR MUST NOT FIGHT THE FADE.** `maybeStartMenuTour()` fires from `showTitle()`.
   A coachmark popping up half-way through the reveal reads as a glitch. Start the tour only once the
   reveal has settled (or fade the coachmark in with the menu), and keep `test/test_tour.mjs` green.
5. **THE 120Hz/60Hz RULE APPLIES TO THE FADE AND THE HOLD.** The 1s hold measured on a 120Hz display
   must land within a tight band of the same wall-clock second on 60Hz.

## ACCEPTANCE (the pilot tick re-runs all of this itself; your self-report is a CLAIM, not evidence)
- `bash /tmp/run_all.sh` => `FAIL=0`, THREE times.
- EXTEND `test/test_title_screen.mjs` (do not fork a parallel file unless you must) to cover, reading
  real seams rather than grepping source: (a) the reveal starts below full opacity and reaches 1.0 after
  its duration when driven by the loop's own dt; (b) the SAME contract holds at a 120Hz-step dt and a
  60Hz-step dt (no fixed-dt assumption); (c) START GAME does not call `startRun()` before the hold has
  elapsed and DOES call it exactly once after, including when the activation is fired TWICE in the same
  tick; (d) leaving the title mid-fade leaves the overlay at full opacity (no leak into `openMenu`);
  (e) the title art seam (`renderer.titleScreen`) is non-null in `mode 'title'` and null after
  `startRun()`.
- A REAL-BROWSER check at a PHONE viewport (390x844 @dpr3) — extend `tools/verify_g12_title.mjs` or add
  `tools/verify_n2_reveal.mjs`. It must PASS and, from DOM geometry + `getImageData` samples, assert:
  the overlay opacity at t=0 is below its settled value and reaches it; the title ART (not the map) is
  what is behind the menu at t=0, mid-fade and settled; the menu is still readable (opacity 1) before
  the run starts; the run actually starts after the hold. Save the shot to
  `docs/art/browser-verify-2026-09-12/n2-reveal-phone.png` (1170x2532).
- Honest report line for anything you could not verify. **No vision model is reachable from this host**,
  so do NOT claim a "looks right" judgement — geometry, opacity and pixel samples only, stated as such.
- Report measured numbers for the hold length and the fade duration as observed in the browser run.

## LOCK
From `/home/claude/projects/hordes`:
`AGENT_HUB_PARTICIPANT=cli:glm-hordes-g8 ~/projects/agent-hub/sdk/agentlock acquire --note "N2 title art reveal"`
The pilot tick holds the lock while it writes this brief and releases it at the end of the tick, a
couple of minutes after this task is posted. **Retry up to 20 times, sleeping 30s between attempts**, and
only then report `blocked: <owner>`. Never edit without the lock. Release with
`~/projects/agent-hub/sdk/agentlock release` **from `/home/claude/projects/hordes`** (it resolves the lock
from CWD), even if you fail.

## REPORT
`done:` + the files you changed, the three suite numbers, the exact browser-verify output, the measured
fade duration and hold length, the PNG path, which of the optional/deferred choices you made
(re-fade on return? art animation?), and an explicit list of what you could NOT verify. Nothing else.
