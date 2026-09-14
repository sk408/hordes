# A2 - THE RADAR: THE WIRING (draw + toggle + the A1 pairing) - BUILD BRIEF

**Slice:** A2, EXECUTION ORDER item 4 (`docs/HORDES_GOALS_2026-09-12.md`, the EXECUTION ORDER block
above the goal entries; the goal entry is `grep -n '^### A2'` - read it too). It follows A1 (code
landed) and precedes E1.
**Builder:** `cli:kimi-hordes-g8`. **Brief authored by:** the goal pilot, 2026-09-14.
**The dispatch tick re-verified the anchors below at HEAD `9bf8931` (clean tree) - but the tree moves,
so RE-VERIFY EVERY ANCHOR LINE ON YOUR OWN TREE BEFORE YOUR FIRST EDIT.** If an anchor is gone, STOP
and report; do not guess at a replacement.

## HOUSE RULES (read first - they override anything below that contradicts them)

- **Do NOT run any git state command** (no commit/checkout/reset/stash/clean) - the orchestrator owns
  commits. Leave the tree dirty and report. Landing is not your job.
- **Never weaken or delete an assertion to go green.** If this slice legitimately invalidates an
  assertion, RETARGET it to the new invariant and SAY SO (file + line + why). Nothing else.
- **A code claim is not evidence.** Every number must come from a command whose raw output you keep
  and quote. A builder self-report is a claim.
- **No emojis** anywhere (owner UI rule). Pixel-art integrity: **INTEGER pixels, no blur, no
  smoothing, no anti-aliased edge** - this is load-bearing here (see R1).
- **60Hz and 120Hz must both be correct**; nothing may assume a fixed dt.
- **Race/lock:** if `.agentlock` is held, sleep 20s and re-check, up to 15 times (5 min). Never edit
  while another owner holds it. Take the lock before your first edit and release it when done.
- **Scope bound:** `src/render.js` and `src/main.js` (the toggle + hints + `REPEAT_GUARDED` ONLY),
  plus one new test and one new probe tool. **Do NOT touch `src/radar.js` or `test/test_radar.mjs`** -
  the module is DONE and green; your job is to CONSUME it. If a change to either looks required, STOP
  and report. Do NOT touch `index.html` CSS / the touch pads / the M1 map screen / the shop UI.
- **This slice must NOT run in parallel with anything else editing `src/render.js` or `src/main.js`.**

## THE OWNER DIRECTIVE (verbatim, Sk408 2026-09-14)

*"What about a circle map on the screen, like some games use, with little dots that show the enemies?
It doesn't have to be a large radius that allows the player to see too far, but enough to see all the
enemies within the spawn radius."*

And the reason it is paired with A1 (already landed, `AUTOPILOT.FOCUS_RANGE = 100`): a 100px
engagement cap means enemies approach from an invisible edge with no warning. The radar is what makes
the cap read as INTENTIONAL rather than broken. That pairing is R5.

## MEASURED CURRENT STATE (verified 2026-09-14 at HEAD 9bf8931; re-measure, do not trust these lines)

- **THE MODULE EXISTS AND IS UNWIRED.** `src/radar.js` (8,000 bytes) exports: `SPAWN_DIST` (280, a
  mirror of `CONFIG.ENEMY.SPAWN_DIST`), `SPAWN_JITTER_MIN/MAX` (0.85/1.15), `SPAWN_RING_MAX` (322),
  `RADAR_RADIUS` (330, >= 322 so the whole spawn ring is covered), `DEFAULT_RADAR = {radius: 330,
  displayRadius: 330}`, `RADAR_TIERS = {CHAFF, ELITE, BOSS}`, `classifyTier(enemy)`, and
  `radarDots(player, enemies, config)` -> the dot set in **player-relative, y-DOWN (= world
  handedness), no mirror flip** radar space, one small object per dot, inputs never mutated.
- **NOTHING IMPORTS IT.** Orchestrator check at the current HEAD:
  `grep -rn "radar" src/*.js index.html | grep -v "^src/radar.js"` returns **empty**. As far as the
  game is concerned the radar does not exist yet.
- `test/test_radar.mjs` (13,481 bytes) is green and pins the data layer (radius vs the real
  `CONFIG.ENEMY.SPAWN_DIST`, containment, boundary, ordering, no-mutation, a 200-enemy bound). It must
  stay green UNCHANGED.
- **The render seam:** `Renderer.drawHudChrome(g, state)` at `src/render.js:1138`, called from the
  frame at `src/render.js:918` (after the world draw). `this.hudChrome` is **the honest test seam**
  (declared at `src/render.js:135`, set at `src/render.js:1533`, nulled at `:241`/`:915`) - it already
  carries `hpFrac`/`manaFrac`/`weaponIcons`/`clock`/`challenge` etc. **Publish the radar's rect and
  dot summary through it** (R1) so a headless test can assert geometry without a vision model.
- **View geometry:** the canvas VIEW is `C.VIEW_W: 480` x `C.VIEW_H: 300` (`src/config.js:20-21`);
  `C.HUD` (label sizes, plate/frame/trough/tick colours) is at `src/config.js:494`.
- **Occupied canvas real estate - the radar must neither overlap nor displace any of it:**
  top-left = HP/MP/XP bars + the LV badge and its value plate; top-right = the RUN CLOCK plate + limit
  bar (`x = C.VIEW_W - 24 + 2 - cw`) with the G11 challenge badge under it; left = the 3-line event
  feed under the bars; boss bar = the top-centre zone. The canvas BOTTOM is free. **`drawHudChrome`
  only ever READS state and paints - it must stay that way.**
- **The in-run key branch** is the `state.mode === 'playing' || state.mode === 'finale'` branch inside
  the window `keydown` handler (handler at `src/main.js:4909`; the playing branch is ~`:4979-5018`).
  Keys already claimed in it: `m`, `i`, `?`/`f1`, `+`/`=`, `-`/`_`, `escape`/`p`, `tab`, `g`, the skill
  key (`q`), `w`, `e`, `h`, `n`, and the MANUAL movement keys (arrows/WASD + `s` as held "down").
  `REPEAT_GUARDED` is the `Set` at `src/main.js:4899`.

## REQUIREMENTS

### R1 - DRAW IT: a fixed-geometry pixel radar on the HUD layer
Add a circular radar to `drawHudChrome`, in the **canvas bottom-left** (the one region measured free).
Proposed geometry, to be confirmed against `drawHudChrome`'s own paint before you commit to it - state
the rect you ended with:
- `displayRadius = 48` HUD px, `scale = displayRadius / radius = 48 / 330` (~0.145 world->radar px);
  box = `104 x 104` at `x = 8`, `y = C.VIEW_H - 8 - 104 = 188`. **The box is a CONSTANT.**
- Paint: a dark trough disc, a 1px steel/bone outer ring, a 2x2 centre dot for the player, then the
  dots from `radarDots(p, state.enemies, {radius: RADAR_RADIUS, displayRadius: 48})`. Dot sizes by
  tier: `CHAFF` 2x2, `ELITE` 3x3, `BOSS` 4x4, each in a colour distinct from the others and from the
  existing HUD palette (reuse `C.HUD` colours where one fits; do not invent a new palette).
- **NO ANTI-ALIASED EDGE.** Do not stroke a circle with `ctx.arc` + `lineWidth` and call it pixel art.
  Build the disc from **integer row spans** (precompute the half-width per row from `r*r = x*x + y*y`,
  one `fillRect` per row; round, never sub-pixel). The ring is the outer 2 rows/cols of the same
  span table. A blurry circle is a failed delivery, not a style choice.
- Dots beyond the radius are **clamped to the rim or dropped** - decide, state which, and pin it.
  Never silently scale them in (that is a lie about distance).
- **Scope: enemy dots ONLY.** Landmark markers are M1's (the goals doc says the radar and the map
  screen are one system at two scales). Do NOT build landmark markers, and do not build a legend.

### R2 - IT MUST NOT REFLOW ANYTHING (the H1 contract)
The radar's box is fixed geometry on the canvas layer - it participates in no layout, and it must be
**byte-identical across every game state and every dot count**. Publish `chrome.radar = {x, y, w, h,
displayRadius, dotCount, tierCounts}` and pin the rect with the H1 acceptance pattern: measure the
rect in **12 live states** (the states `tools/verify_h1_pad_reflow.mjs` walks) and assert equality.
State the measured rect in the report. A radar that redraws at a different size when a boss spawns is
the H1 bug wearing a new hat.

### R3 - THE TOGGLE
- **`r` toggles the radar, default ON.** (Verified free in the playing branch as of `9bf8931`:
  `r` is claimed only in `state.mode === 'dead'` for RETRY, which is a different mode - if your tree
  has since claimed `r` in the playing branch, STOP and report rather than stealing another key.)
- Add `'r'` to `REPEAT_GUARDED` (`src/main.js:4899`) so a held key cannot strobe the toggle.
- Add it to the on-screen control-hints list (the WAVE-22c hint block under the cog - find it, it is
  the same comment cluster as `toggleHints()`) so desktop players can discover it.
- The toggle is a **render preference only**: no sim effect, no state-machine effect, and it must not
  break `test_tour`/`test_hints` (whatever pins the hint list - run the suite and see).

### R4 - RENDER-ONLY, AND FRAME-RATE PARITY
- The radar is a **read** of `state.enemies` and `state.player`. Zero writes to sim state; no dt, no
  `state.time` term anywhere in the drawing or the dot set; no `Math.random`.
- Pin parity: for the SAME world snapshot, the dot set and the radar rect at 60Hz and at 120Hz are
  identical. `radarDots` already has no time term - prove the WIRING does not add one.

### R5 - THE A1 PAIRING (this is also A1's missing acceptance measurement)
A1 landed with fixtures but **no independent acceptance measurement** (the goals doc says so
explicitly). This slice closes that gap, and the numbers must come from the real seams:
- Build a synthetic field with enemies at 60 / 150 / 250 / 320 px from the player and, for each of the
  FOUR focus policies, read the REAL `AutoPilot.decide()` target (`src/controllers.js`): it must be
  `null` beyond `C.AUTOPILOT.FOCUS_RANGE` (100) and non-null within it.
- Against the same field, `radarDots()` must return a dot for every enemy inside 330 - i.e. **every
  enemy the pilot declines to shoot is visible as a dot**. Report the headline table:
  `distance | pilot target (per policy) | radar dot?`
- Report, too, what a real run looks like: on the browser probe (R6), read `state.enemies.length` and
  the radar's `dotCount` on the SAME frame while the pilot is at the 100px cap, and quote both. The
  claim to substantiate is "at the cap, N enemies are alive and the player can see N dots".

### R6 - VERIFY ON THE ARTIFACT, THE HOUSE WAY
- NEW `test/test_radar_wiring.mjs` (headless, no DOM): dot count == enemies within the radius for a
  synthetic field; the radar rect stable across the 12 H1 states; the toggle on/off (radar absent from
  `hudChrome` when off); 60Hz/120Hz parity; and a **radar-only-read pin** (snapshot `state`, run the
  draw, assert nothing in the snapshot changed).
- NEW `tools/verify_a2_radar.mjs` (real browser, the `verify_h1_pad_reflow.mjs` / `verify_p1_portal.mjs`
  pattern): **390x844 @dpr3, all 19 `TOUR_KEYS` set, `state.time > 1.0` ASSERTED BEFORE ANY
  MEASUREMENT**, drive a REAL run, toggle `r` off and on with real key events and assert the radar
  appears/disappears, ONE PNG **1170x2532** with an **ink-bbox check inside the radar's own screen
  box**, then **READ THE PNG and describe what is actually on screen** (a code claim is not evidence
  for something a player looks at). Copy the PNG into `docs/art/browser-verify-2026-09-12/`.
- Quote the raw command output for every number. If playback is flaky, say so - do not smooth it.

## ACCEPTANCE BAR
- `bash tools/run_suite.sh` => **`redfiles=0` THREE CONSECUTIVE RUNS, with the printed `TREE:` line
  quoted each time** (it names the tree + HEAD + dirty count; a green run whose TREE line you did not
  quote does not count).
- `node test/test_radar.mjs` and `node tools/verify_h1_pad_reflow.mjs` stay green **unchanged** (the
  module you are consuming and the no-reflow contract you are extending).
- No assertion weakened anywhere. Any retarget must be named with file + line + why.
- The R5 table and the R2 measured rect are quoted as raw output in the report, with the PNG path.

## WHAT NOT TO DO
- Do not rebuild or edit `src/radar.js` / `test/test_radar.mjs`.
- Do not add a landmark layer, a legend, a radar in a second corner, or a size that grows with dots.
- Do not use `ctx.arc` for a stroked circle (anti-aliasing), do not use gradients or shadows.
- Do not touch the shop, the M1 map screen, the touch pads (`index.html`), or the economy.
- Do not run any git state command.

## REPORT SHAPE
Files changed + line counts; raw command output for: the suite x3 (TREE lines quoted), `test_radar`,
`verify_h1_pad_reflow`, `test_radar_wiring`, the browser probe (13+ checks) and its HEADLINE numbers;
the R5 table; the R2 measured rect across the 12 states; the A1 pairing counts at the cap; the final
radar geometry (box, displayRadius, scale, dot sizes/colours, the clamp-or-drop decision); what did
NOT work; the PNG path + what you actually saw in it; and the lock-release line.

## DISPATCH ANCHOR CHECK (re-verify each on YOUR tree before editing)
1. `grep -rn "radar" src/*.js index.html | grep -v "^src/radar.js"` -> still empty (module unwired).
2. `grep -n "export function radarDots" src/radar.js` -> present; read its return shape.
3. `grep -n "drawHudChrome" src/render.js` -> the method + its call site + the `this.hudChrome` seam.
4. `grep -n "REPEAT_GUARDED" src/main.js` -> the `Set`; `grep -n "const keyMap" src/main.js`.
5. `grep -n "FOCUS_RANGE" src/config.js` -> the ONE engagement definition (should be 100).
6. `sed -n '1,40p' tools/verify_h1_pad_reflow.mjs` -> the 12-state walk + the real-browser guards to
   mirror in `tools/verify_a2_radar.mjs`.
