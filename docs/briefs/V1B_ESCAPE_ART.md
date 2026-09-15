# V1b — ESCAPE ART + STYLING (environment, enemies, and making the pursuit READ)

**Owner request, verbatim:** *"It's good. Now the escape needs art and styling to the environment and
enemies. And needs enemies that try to catch up from behind and fall in the pits. Things like that."*

## READ THIS FIRST — THE MECHANICS ALREADY EXIST

The behaviours named in the request are **already implemented**; what is missing is that they are
**invisible**. Verify these anchors yourself before you start:

- `src/escape/config.js` :69-76 — `PURSUER_HP: 1`, `PURSUER_SPEED: 236` (*"faster than the wall; they
  fall in gaps (the filter)"*), `FLIER_SPEED: 96` (*"dives on a sine; ignores gaps (the gap-kiting
  counter)"*).
- `src/escape/sim.js` :124-151 — the spawn schedule and the movement (pursuers run right at 236 px/s
  from the wall, so they DO catch up from behind).
- `src/escape/sim.js` :144 — *"Enemy filter: no ground under a pursuer -> it falls (removed)"*, i.e.
  pursuers DO fall in the pits.
- `src/escape/render.js` — **every single thing is a bare `fillRect`**: the wall :49-56, platforms :63,
  the exit beacon :70-71, the boss :80-82, pursuers :100, fliers :107, shots :114, the void edges
  :121-123. That is the whole problem: a rectangle that is silently deleted mid-screen does not read as
  "it fell in the pit", and a pursuing wall of rectangles does not read as a horde.

**So this slice is STYLING PLUS READABILITY, not new mechanics.** Do not rewrite the sim's behaviour.
If you believe a behaviour is genuinely wrong (a pursuer that should catch up but never does), that is a
finding to REPORT, not to tune silently.

## WHAT TO BUILD

**1. ENVIRONMENT.** Give the corridor a place:
- Layered background (parallax): a far band and a near band that scroll at different rates off the
  existing camera x. Keep it cheap — this runs on a phone.
- Platform tops with a lit edge and a visible underside so "standable" is obvious, and **pits that
  read as lethal voids** (a dark depth, a lip, maybe a distant parallax through the hole) rather than
  simply missing floor.
- The chasing wall rendered as a **horde mass** — many overlapping bodies/dust at the leading edge, not
  a slab — so the pressure is visible before it kills.
- The exit portal as a destination: distinct silhouette + glow, unmistakably the goal.

**2. ENEMIES.** Replace the rectangles with actual sprites:
- **PURSUER** (ground, chases from behind) and **FLIER** (dives) must be visually DIFFERENT at a glance,
  each with at least a 2-frame animation, silhouettes readable at the mode's scale (480x300 virtual).
- Match the game's existing art language and palette (`src/art/`), integer pixels only, no blur, no
  smoothing, `image-rendering: pixelated`.

**3. MAKE THE MECHANICS READ (this is the actual point):**
- A pursuer reaching a gap must **visibly FALL**: a drop arc into the void with a shrinking/tumbling
  frame, not an instant pop. Falling must also be distinguishable from a shot kill.
- The wall's approach must be legible: mass shape, dust/trailing debris, and the **HORDE PRESSURE
  readout actually drawn** (it replaces the radar side-on).
- The flier's dive must read as an attack, not a drift.

**4. KEEP IT SELF-CONTAINED.** No reads of `p.stats`, `applyMetaBonuses`, the draft or loot. Movement
writes stay in the escape's own layer. Nothing here may change the run's economy, drafting or shop. The
mode stays registered in the screen-chrome gate.

## ACCEPTANCE (functional and visual — NO SIMS, owner's 60-second cap)

1. **Real Chrome, 390x844 @dpr3 AND 844x390 @dpr3** (the owner plays on a phone in both orientations):
   the escape renders with the new art, saved as PNGs into `docs/art/v1-escape-art-<date>/`. Generate
   them by entering through the settings test button or the `__TEST` seam — a few seconds of frames, not
   a played run.
2. **Readability is asserted, not asserted-about:** the PNGs must show the wall mass, a pursuer, a
   flier, platforms with pits, and the exit — and you must list what each PNG demonstrates.
3. **The pit-fall is proven deterministically and cheaply:** a unit check that a pursuer positioned over
   a gap is removed by falling (and that its falling state is a distinct renderable state from a kill).
   Stepping the sim a few hundred frames in-process is a unit test, not a sim run — that is fine.
4. **Art lint covers the new sprites** (`test/test_art_lint.mjs`), and the palette/ink expectations are
   met rather than waived.
5. `bash tools/run_suite.sh` to `redfiles=0`; no assertion weakened; every retarget named file + line +
   why.
6. 60Hz AND 120Hz parity still holds (the sim's purity contract must survive whatever the render does).

## HOUSE RULES

No emojis. Integer pixels; no blur or smoothing. Do NOT restructure `src/main.js` — this slice lives in
`src/escape/`. No git state commands: leave the tree dirty and report the dirty count. Post
done:/blocked:/checkpoint: to hordes FIRST, then raw evidence. Heartbeat file
`/tmp/v1b_art_heartbeat.log` before every long step; keep every command bounded.

**Order of work, so partial progress is visible:** environment first, then enemy sprites, then the
readability pass (fall animation, wall mass, pressure readout).
