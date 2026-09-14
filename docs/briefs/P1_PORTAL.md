# P1 - BOSS PORTAL: LINGER + AUTO-PATH + APPROACH INVULNERABILITY - BUILD BRIEF

**Slice:** P1, EXECUTION ORDER item 2 (`docs/HORDES_GOALS_2026-09-12.md:671-703`, owner-ordered
2026-09-14). Sits immediately after N1 slice 3 and before A1.
**Builder:** `cli:kimi-hordes-g8`. **Brief authored by:** the goal pilot, 2026-09-14, at
HEAD `6107ffe` (N1 slice 3 in flight, tree dirty=7). **The dispatch tick MUST re-verify every anchor
below on ITS tree** before issuing - the line numbers here were read at 6107ffe and the N1 slice-3
edit touches `src/main.js`, `src/skills.js`, `src/config.js`, `src/meta.js`.

## HOUSE RULES (read first - they override anything below that contradicts them)

- **Do NOT run any git state command** (no commit/checkout/reset/stash/clean) - the orchestrator owns
  commits. Leave the tree dirty and report. Landing is not your job.
- **Never weaken or delete an assertion to go green.** If the change legitimately invalidates an
  assertion, RETARGET it to the new invariant and SAY SO (file + line + why). Any retarget forced by
  this slice is named under ACCEPTANCE - anything else must stop and report.
- **A code claim is not evidence.** Every number must come from a command whose raw output you keep and
  quote. A builder self-report is a claim.
- **No emojis** anywhere (owner UI rule). Pixel-art integrity: integer pixels, no blur, no smoothing.
- **60Hz and 120Hz must both be correct**; nothing may assume a fixed dt.
- **Lock:** if `.agentlock` is held, sleep 20s and re-check, up to 15 times (5 min). Never edit while
  another owner holds it. Take the lock before your first edit and release it when done. Do not
  self-cancel on a transient hold.
- **Scope bound:** `src/main.js`, `src/controllers.js`, `src/config.js`, `src/render.js`, plus tests
  and one new verify tool. Do NOT touch `src/portal_cine.js` (the cinematic is a separate, shipped
  system and stays). If you believe a change outside this list is required, STOP and report.
- **Must NOT run in parallel with A1** - A1 also edits `src/controllers.js`. If the lock is held by an
  A1 owner, stop.

## THE OWNER DIRECTIVE (verbatim, 2026-09-14)

Sk408: *"the boss portal needs to be on the screen longer before the player enters and the cinematic
begins. Maybe it can be something that the auto pathing heads toward automatically, and give the player
a bit of invulnerability headed to the portal. Eventually with elevation we could place the portal on a
shrine too."*

The authoritative directive section (measured current behaviour, the pilot's calls, the acceptance bar)
is **BOSS PORTAL - OWNER DIRECTIVE (2026-09-14)** at `docs/HORDES_GOALS_2026-09-12.md:464-521`. Read it
in full before coding; the summary below is faithful but the section is the spec.

## MEASURED CURRENT BEHAVIOUR (read from the tree at 6107ffe; the dispatch tick re-measures a before-number)

- `state.portal` is declared at `src/main.js:205` (`portal: null,`); it opens where the boss fell at
  `src/main.js:1901` (`state.portal = { x: state.wave.portalX || p.x, y: state.wave.portalY || p.y, age: 0 }`)
  with the toast `'THE PORTAL OPENS - WALK THROUGH'` at `:1902`.
- **The portal CHASES the player.** `src/main.js:1372-1385`:
  `poSpd = p.stats.speed * (p.stats.speedMult || 1) * am.speedMult + C.PORTAL.SPEED;` then it steps
  straight at the player each frame, and `if (len < C.PORTAL.RADIUS) { openIntermission(); return; }`.
  The code comment says outright the chase exists *"so the AutoPilot crosses it without touching the
  controller seam"* - i.e. **the chase is a substitute for pathing.**
- `src/config.js:373`: `PORTAL: { RADIUS: 16, SPEED: 60 },`. A 32px object on a fixed 480x300 view whose
  visible half-extents are only 240 x 150 - entry fires at <16px, so the portal engulfs the player
  within a second or two. **The toast promises a walk the player never gets to take.**
- `openIntermission()` is at `src/main.js:800`; it nulls `state.portal` (`:805`) and (if
  `state.wave.cinePending`) routes to `startPortalCine()` (`:804`). The portal cine is `src/portal_cine.js`.
- `p.invuln` seam: decremented at `src/main.js:1349` (and again in the finale loop at `:5501`); contact
  damage is gated `if (touchDmg > 0 && p.invuln <= 0)` at `:1664`, setting `p.invuln = 0.5` / `0.6` at
  `:1668`/`:1673`; boss shots gate the same way at `:1700-1707`. **The visible invuln tell already
  exists** at `src/render.js:823`: `if (pl.invuln > 0 && Math.floor(state.time * 20) % 2 === 0)` (a
  20Hz blink). Reuse it - do NOT add a second invuln visual.
- The AutoPilot is in `src/controllers.js`: `this.focus = 'NEAREST'` (`:43`), `pickTarget` (`:72`),
  `decide(p, state, cfg)` (`:123`, returns `{ moveX, moveY, target }`), and the MANUAL controller's
  `decide` at `:290`. The pilot is deliberately **PILOT-BLIND** - sees enemies only; the blindness
  contract is documented at `src/shrines.js:12` (shrines/chests/arches are all invisible to it). This
  slice is a **narrow, deliberate exception for the PORTAL ONLY.**
- Pinned tests that touch this surface: `test/test_portal_cine.mjs` (cinematic timing) and
  `test/smoke.mjs` (portal progression `:600-651`; portal-cine assertions `:808-887`). They must stay
  green or be retargeted honestly.

## WHAT TO BUILD (four requirements - all of them, in this one slice)

**R1 + R2 are one fix: PARK the portal and teach the pilot to walk to it.**

1. **Delete the chase; park at a standoff ring.** The portal must stop engulfing. Implement a ONE-WAY
   approach: the portal eases toward the player at a **slow fixed drift** and **halts once
   `len <= STANDOFF`, where `STANDOFF = 1.5 * C.PORTAL.RADIUS` (= 24px today)**. It NEVER advances
   closer than STANDOFF on its own; only the player/pilot moving into it can cross `RADIUS` (16px).
   So it lingers on screen, ~24px away, until entry becomes a deliberate act - exactly what the toast
   promises. Expose `APPROACH` (px/s, suggested ~40) and `STANDOFF` as fields in `C.PORTAL`
   (`src/config.js:373`) so both are tunable and testable; keep `RADIUS` at 16 (do NOT grow the trigger
   - "presence, not a bigger trigger"). Remove the `p.stats.speed + C.PORTAL.SPEED` term entirely.
   The burst of the chase existed ONLY to guarantee AUTO entry; R2 replaces that job - do not keep both.
2. **Teach the controller about the PORTAL ONLY.** In `AutoPilot.decide` (`src/controllers.js:123`),
   when `state.portal` is open, steer movement toward the portal so the AUTO run closes the last gap and
   enters deliberately. This is a **narrow exception to PILOT-BLIND**: the controller must NOT learn
   about shrines, chests or arches (`src/shrines.js:12` contract), and the MANUAL `decide` (`:290`)
   must NOT path to the portal. Gate the override so it does not fight survival: if the stance logic
   would flee a live threat, let it - the corridor is spawn-suppressed, but the priority order must be
   defensible and stated in your report. If the pilot is already within STANDOFF, it should simply close
   the final step (not orbit).

**R3 - APPROACH INVULNERABILITY, AUTO ONLY, reusing the existing seam.**

3. While `state.portal` is open AND **the pilot is driving movement**, refresh `p.invuln` to a small
   BOUNDED window each frame (e.g. keep it at ~0.1s while the condition holds, so it reads as one
   continuous window and lapses naturally when the portal closes). **The gate is "the pilot is steering",
   NOT "`state.pilotMode === 'AUTO_ALL'`"** - so `AUTO_ALL` AND `AUTO_MOVE` both get it, and `MANUAL`
   gets **nothing, ever** (Sk408: *"manual should not grant invulnerability period the way auto
   would"*). Use the codebase's existing single source of truth for "is the pilot steering"; if no such
   single predicate exists, STOP and report rather than inventing a second one. Make it VISIBLE purely
   by reusing `src/render.js:823` - no new tell. **Honest caveat to carry into your report:** the portal
   corridor is already safe *by construction* today (horde converts to gems, shots cleared, spawns
   suppressed, timer paused), so this is **insurance, not a fix** - it must be correct for the future
   case (a portal opening with live enemies). Do NOT "prove" it by hunting for damage that does not
   exist; prove the WINDOW is granted.

**R4 - a dwell beat on contact.**

4. On contact, hold a **visible ~0.35-0.5s beat** before the intermission/cinematic, so the crossing
   reads instead of teleporting (the N2 reveal precedent). Implement as a dt-based timer on the portal
   (e.g. `state.portal.entering` + `enteredAt`), and only call `openIntermission()` when it elapses.
   Must be correct at 60Hz AND 120Hz. **Presence:** give the portal a spawn-in growth/animation and a
   stronger tell while parked; keep the entry radius modest (R1).

## ACCEPTANCE (measurable - no adjectives)

- **The headline number: seconds the portal is on screen (portal-open -> intermission), before and
  after, as a NUMBER.** Measure the BEFORE on the pre-change tree (a real browser, one AUTO cohort,
  raw output kept); measure the AFTER the same way. The current chase should yield ~1-2s; the park plus
  the dwell should raise it materially. Report both, plus portal-open -> intermission for MANUAL.
- **NEW headless test `test/test_portal_park.mjs`** (node, no DOM), driving the REAL exported seams
  (not copies):
  - Chase removed: with the portal open and the player held stationary, the portal's distance to the
    player **never drops below STANDOFF** and never reaches `< RADIUS`; after settle its position deltas
    are ~0. (Assert numerically, both dt regimes.)
  - AUTO closes the distance and enters **with the chase removed**: run the real `AutoPilot.decide` at
    the real seam with a portal open, step the sim, assert `openIntermission` is reached.
  - Invuln granted to AUTO only: assert `p.invuln > 0` while the portal is open under `AUTO_ALL` AND
    under `AUTO_MOVE`; assert it stays 0 under `MANUAL` across the same span (state the exact predicate
    read).
  - Narrowed blindness: place a shrine/chest/arch and assert the controller's movement does not read
    them (portal-only exception pinned).
  - Dwell: assert the entry beat is >=0.35s and <=0.5s and identical in WALL-CLOCK at 60Hz and 120Hz.
- **NEW real-browser tool `tools/verify_p1_portal.mjs`**: 390x844 @dpr3, **all 19 `TOUR_KEYS` set and
  `state.time > 1.0` asserted BEFORE measuring anything** (the tick-38 harness defect that silently
  measures a FROZEN game - copy the guard from `tools/verify_h1_pad_reflow.mjs` / `verify_n1_chain_q.mjs`).
  It must: open a portal, record the sim/wall clock at open and at intermission, tap through, and write
  ONE PNG at 1170x2532 with an ink-bbox check on the portal label. READ the PNG and describe what is
  actually on screen in your report - dimensions alone are not a read.
- **Do not break pinned tests:** `test/test_portal_cine.mjs` must stay green unchanged. `test/smoke.mjs`'s
  portal progression (`:600-651`) and portal-cine (`:808-887`) blocks may legitimately need retargeting
  for the dwell frame count - **that is the ONLY pre-authorised retarget in this slice**; do it with an
  inline comment naming the dwell and the new frame count, never by weakening the assertion.
- `bash tools/run_suite.sh` => `redfiles=0` **three consecutive runs**, quoting the `TREE` line each time
  (tree + HEAD + every red).
- Before/after cohort: AUTO entry success rate over >=5 cohorts with the chase removed (must still enter).

## DO NOT

- Do not change `src/portal_cine.js`, the intermission menu, or the wave-end economy.
- Do not add shrine/chest/arch awareness to the controller, and do not delete the blindness test.
- Do not grow the entry radius to make entry "easier"; the fix is the park + the pathing + the dwell.
- Do not add a second invuln visual or second invuln machinery; reuse `p.invuln` and `render.js:823`.
- Do not soften or delete a test assertion to reach green. If something is genuinely broken, STOP and
  report `blocked:` with the raw evidence (command + output), and leave the tree dirty.

**DISPATCH ANCHOR CHECK (goal pilot, 2026-09-14 04:40 UTC, tree `6107ffe` dirty=24, N1 slice 3 landed
uncommitted):** every anchor above re-read on THIS tree - `src/config.js:373` PORTAL unchanged;
`state.portal` declared `src/main.js:205`, chase block now `:1372-1385`, entry test `:1385`
(`if (len < C.PORTAL.RADIUS)`), portal open + toast `:1901-1902`; `openIntermission` now `:800`
(was 795), `cinePending` route `:804`; `p.invuln` decrement `:1349`, contact gate `:1664`, boss-shot
gate `:1700`; invuln blink tell `src/render.js:823`; AutoPilot `src/controllers.js:43/72/123`, MANUAL
`decide` `:290` - all as written. Only the two line drift fixes above were needed.
