# P1b — THE RIM-PIN: A PORTAL CAN SPAWN UNREACHABLE (unwinnable run)

**Builder:** kimi lane. **Read this whole brief before touching anything.**

## Load this first

- Skill: `~/.hermes/skills/software-development/hordes-project-ops/SKILL.md` — this
  repo's traps. Read it before you start.

## The defect (measured, not theorised)

The boss portal can open at a position the AUTO pilot can never reach, which makes the
run **literally unwinnable** — no error, no crash, the pilot just walks against an
invisible wall forever.

The mechanism, measured by the orchestrator with a `/tmp` probe:

- `spawnBoss` places the boss at `player + SPAWN_DIST*0.7` on a random angle, and the
  portal opens at that spot **UNCLAMPED**.
- `put()` refuses outward motion past `lootLimit()` = 566, while the player may legally
  stand at `RIM` = 600.
- `PORTAL.STANDOFF` is 24 and `PORTAL.RADIUS` is 16.

So a portal landing past ~590 pins the pilot at 566 with the portal at 590: the distance
freezes at 24 and never reaches 16.

Probe result: portal forced to `x=900` with the player at `x=400` → `d` frozen at 24.0
for 20s, never entering. Control (normal portal) enters in 0.5s.

**Latent, not urgent:** `portalBeyondEdge:false` in all 74 tool runs so far. But it is
real, and it is the kind of bug a playtester hits once and reports as "the game is
broken".

## Goal

Make an unreachable portal impossible. Clamp the portal spawn inside reachability (or
make the rim reachable) — your call which, but justify it in your report.

## Files you may modify (do not touch anything else)

`src/bosses.js`, `src/controllers.js`, `src/config.js`, `test/test_portal_park.mjs`, and
you may ADD a new test file (e.g. `test/test_portal_reach.mjs`).

**DO NOT TOUCH:** `src/main.js`, `src/render.js`, `src/radar.js`, `index.html` — another
builder owns those files right now.

## Do NOT regress the owner's portal behaviour (all of this is pinned by tests)

- The pilot **ignores flee status during the portal sequence**: the FLEE branch in
  `src/controllers.js` is gated on `!state.portal` (owner, verbatim: *"Pilot should
  ignore flee status during the portal sequence. That's why we made it invulnerability"*).
- `test/test_portal_park.mjs` pins BOTH directions: portal open → PORTAL through an
  in-kite-line threat; no portal → FLEE. Do not weaken it.
- `test/test_controllers.mjs` scans `src/controllers.js` SOURCE TEXT for
  `/\b(document|window)\b/` (DOM purity) — comment prose counts. Do not write "window"
  in a comment there.

## Acceptance bar (all of it, with numbers)

1. **Show the fix is real:** demonstrate the bug on the current code, then show it gone.
   A test that passes on the broken build pins nothing.
2. **A test that asserts a portal is always enterable from the worst-case legal player
   position** — including the rim case. Construct the worst case explicitly; do not rely
   on luck.
3. **Suite green:** `bash /tmp/run_all.sh` — quote the summary line
   (`SUITE greenfiles=N redfiles=M`) and name any red.
4. Confirm `tools/verify_p1_portal.mjs` still passes 13/13 (it is the P1 acceptance tool;
   P1 shipped in `b8818d6`).

## Reporting

Report what changed, the measured numbers before/after, and **explicitly flag anything
you could not verify.** An honest gap beats a plausible claim.

**Do not run any git command.** Leave the tree dirty; the orchestrator lands it. Do not
edit `docs/HORDES_GOALS_*.md` (the orchestrator owns the queue markers).
