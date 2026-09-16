# V1e — THE FINALE: work the boss in, with an UPPER LEVEL over it to the portal

**Owner, verbatim:** *"Also need to work the boss into the end with an upper level that allows the pilot to get
over and get to the portal."*

This answers the V1 brief's own open question — how the portal is reachable without the boss seeming harmless.

## THE SHAPE
- The corridor ends at the BOSS. The ground route is the boss's ground: going through it is what makes the boss
  dangerous, and it must read that way (telegraphs, authority over the floor, the wall closing behind you).
- An **UPPER LEVEL** (terrace/overpass) is the way past: the pilot jumps UP onto it, crosses OVER the boss, and
  drops to the portal beyond. Generator-side, this is a designed finale segment — not a random tier.
- Reaching the portal must NOT require godlike timing: the AUTO pilot has to complete it.

## AUTO MUST BE ABLE TO DO IT (owner's own mechanism, from the V1 brief)
- The invisible JUMP BOX at the right spot, triggered when AUTO is engaged — no timing skill required.
- The speed FUDGE may add a little speed to the pilot for the jump, with a THRESHOLD so it never looks silly.
- Both were specified by the owner in the V1 brief (:34-58) — reuse them; do not invent a second mechanism.

## THE BOSS MUST NOT READ AS HARMLESS
- It threatens the ground route: a pilot who misses the up-route is put back in its reach, or loses ground to
  the closing wall — a real cost, never instant death (failure stays SOFT; that contract is untouched).
- It has presence: size, silhouette, animation, its own telegraph, and it should be the loudest thing on screen
  at that moment.

## REACHABILITY IS A GENERATOR INVARIANT (the existing pattern)
Author the finale segment the way `gapSegment` already does: the jump arc at the speed-window FLOOR must clear
the up-route approach and at the CEILING must land inside the upper platform — asserted across the templates,
so a finale that cannot be completed is a template bug, not a bad run.

## ACCEPTANCE
1. **In-process (no wall-clock sims — owner's 60s cap; `sim.step()` is pure, so a whole run costs ms):** a
   seeded AUTO run stepped to completion REACHES THE PORTAL VIA THE UPPER ROUTE, with the frames/steps for the
   jump, the crossing and the drop reported raw. Include a counter-case: an AUTO run that deliberately misses
   the up-route does not reach the portal (proving the route is load-bearing and the check can fail).
2. The generator invariant above, asserted for every finale template.
3. Real-Chrome PNGs at **390x844 @dpr3 AND 844x390 @dpr3** into `docs/art/v1e-finale-<date>/` showing the boss,
   the upper level, and the portal — each labelled with what it shows.
4. `test_art_lint.mjs` covers any new art; `bash tools/run_suite.sh` to `redfiles=0`; no assertion weakened;
   every retarget named file + line + why; 60Hz and 120Hz parity holds.
5. The mode stays self-contained and registered in the screen-chrome gate.

## HOUSE RULES
No emojis. Integer pixels. Work in `src/escape/` and `src/art/` only; a narrow seam in `src/main.js` if one is
needed, never a restructure. No git state commands (leave the tree dirty, report the dirty count). Post
done:/blocked:/checkpoint: to hordes FIRST, then raw evidence. Heartbeat `/tmp/v1e_heartbeat.log`.


---

## OWNER SPEC UPDATE (2026-09-15): THE FINALE NOW LANDS INSIDE A 60-SECOND ESCAPE

**Owner, verbatim:** *"Let's cut escape to 1 minute."* The finale (boss + upper level + portal) must therefore be
reached and completed inside a ~60-second run — compress the approach to it accordingly, and keep the
reachability invariant authored for the speed window that now applies. Everything else in this brief stands:
the ground is the boss's, the upper level is the way past, AUTO completes it via the invisible jump box + speed
fudge, and a finale that cannot be completed is a template bug rather than a bad run. Also note the new horde
spec in the V1d brief (never fewer than 3 chasers, off-screen spawn, speed-match on approach): the finale must
still hold that floor while the boss owns the floor of the corridor.
