# V1d — ESCAPE SPECTACLE: color, intensity, a real chase, and near-misses that never cheat

**Owner, verbatim:** *"The escape sequence needs more art, more intensity, more enemies chasing. Make sure they
get really close but don't catch the pilot. Needs some color to it. Like a pixel movie but as a playable."*

## 1. COLOR — "a pixel movie, but playable"
The escape currently reads as bare rects on a dark field. Give it a LOOK:
- An authored palette for the mode (extend the escape's own config, do not reach into the arena's art): a
  colored sky/biome gradient, parallax bands in actual color and silhouette, a lit horizon, and a distinct
  palette shift across the two minutes so the run travels somewhere.
- Platforms with real material (lit top edge, shaded side, wear), voids with depth and a colored far side.
- Emissive treatment on the portal and on the horde's leading edge so the two poles of the scene (where you
  are going / what is behind you) are the two brightest things on screen.
- Pixel-art law holds: integer pixels, no blur, no smoothing, `image-rendering: pixelated`, 480x300 virtual.
- Everything authored in `src/art/` style, covered by `test/test_art_lint.mjs`.

## 2. INTENSITY + MORE ENEMIES
- A PACK, not a trickle: raise pursuer density so the chase reads as a horde pressing in behind the wall.
- Escalate across the run (the generator already has tiers): threat density and tempo ramp so the last 30
  seconds feel different from the first 30.
- Juice, sparingly and per the owner's taste: glowy/crackly feedback yes; screen shake and slow-mo are RARE
  and EARNED, never per-frame.

## 3. NEAR-MISSES, NEVER UNFAIR CATCHES — the load-bearing requirement
*"Make sure they get really close but don't catch the pilot."*
- Pursuers must visibly close to within a hair of the runner, repeatedly, so the threat is felt.
- Every approach must be READABLE and dodgeable: telegraph the lunge, no undodgeable damage, and contact
  stays the SOFT 'caught' end (never death) exactly as the mode already specifies.
- The AUTO pilot must still complete the escape. This constraint outranks the drama: if a density bump makes
  the AUTO arm fail, the bump is wrong, not the AUTO arm.

## 4. HOW TO PROVE IT WITHOUT WALL-CLOCK SIMS (owner's 60s cap)
`sim.step()` is pure and dt-driven, so stepping a whole 2-minute escape IN-PROCESS costs milliseconds. That is
a unit test, NOT a sim run — it is the required evidence here:
- a seeded AUTO run stepped to completion in-process, asserting it REACHES THE PORTAL;
- the same run recording the MINIMUM pursuer-to-runner distance, asserted to get really close (state the px
  figure you chose and why) at least once — that is "they got close";
- the same run asserting ZERO contact/catch events — that is "and they did not catch the pilot";
- a counter-case: a deliberately passive run (no dash, no jump) that DOES get caught, proving the threat is
  real and the check can fail.
Report the raw numbers for all four.

## ACCEPTANCE
1. The four in-process numbers above, with the actual px/contact figures.
2. Real-Chrome PNGs at **390x844 @dpr3 AND 844x390 @dpr3** into `docs/art/v1d-spectacle-<date>/`, each
   labelled with what it shows (color, a pursuer pack, a near-miss, the portal).
3. `test_art_lint.mjs` covers the new art; no expectation waived.
4. `bash tools/run_suite.sh` to `redfiles=0`; no assertion weakened; every retarget named file + line + why.
5. 60Hz AND 120Hz parity holds; the mode stays self-contained (no stat/meta reads) and registered in the
   screen-chrome gate.

## HOUSE RULES
No emojis. Integer pixels. Work in `src/escape/` and `src/art/` only — do NOT restructure `src/main.js`. No git
state commands (leave the tree dirty, report the dirty count). Post done:/blocked:/checkpoint: to hordes FIRST,
then raw evidence. Heartbeat `/tmp/v1d_heartbeat.log` before every long step.


---

## OWNER SPEC UPDATE (2026-09-15, later the same day — THIS SUPERSEDES any conflicting pacing or enemy-count language above)

**Owner, verbatim:** *"Let's cut escape to 1 minute. Cut either the shooting altogether or cut the shooting rate to 1/5th of
current. The idea is there should be a literal horde chasing the pilot. There should never be less than 3 enemies trying to
run after pilot. They appear slightly off screen and charge towards pilot but match pilots speed right before catching
pilot."*

1. **DURATION: ONE MINUTE.** The escape is a ~60-second sequence, not two minutes. Everything above that reads
   "two minutes" (the palette shift, the pacing ramp, the escalation) now spans **60 seconds** — so the beats
   compress and the ramp has to be quicker. The finale must still fit inside that minute.
2. **SHOOTING: RATE CUT TO 1/5.** The owner offered "cut shooting altogether OR 1/5th the rate"; we take **1/5th**,
   the reversible option, because his own earlier directive keeps weapons as flavour ("a shot or two kills any
   enemy... just add a bit of dimension") and a gun that never fires would read as a stub. A hit may momentarily
   thin the pack — that is fine, the horde floor (below) refills.
3. **A LITERAL HORDE — NEVER FEWER THAN 3 CHASING.** At EVERY moment of the escape there must be **at least 3
   pursuers actively chasing the runner**. This is a hard floor on live chasers, not an average: when one falls in
   a pit or is shot, the spawner must replace it. Assert the MINIMUM live-chaser count across the whole run,
   sampled every frame, and assert it never drops below 3.
4. **SPAWN OFF-SCREEN, CHARGE IN, THEN MATCH THE PILOT'S SPEED.** The signature behaviour:
   - chasers appear **slightly off-screen** (behind the camera edge — remember `CAM_LEAD`; they must enter
     from outside the visible band, never pop into existence on screen);
   - they **charge** toward the runner at speed;
   - and **when they are just about to reach the pilot, they match the pilot's speed** — so they close to a
     hair, hang there, and never actually take them. Throttling to the pilot's speed means a chaser can never
     overtake or pass through the runner: contact becomes structurally impossible rather than unlikely.
   - It must still look like a charge, not a slide: keep the fast approach, and give the moment they settle
     onto the runner's tail a readable tell (lunge/rear-up/dust) so the near-miss is sold.
5. **PITS STILL WORK, AND THE FLOOR STILL HOLDS.** Pursuers still fall into gaps (that is the player's tactic),
   but the ≥3 floor is maintained by respawning — so a pit buys relief, never silence.
6. **LOSING IS THE WALL, NOT THE HORDE.** With speed-matching chasers, the only way to fail is the collapsing
   wall (or falling yourself). That is the correct shape: the horde is the DRAMA, the wall is the TIMER.

### ADDITIONAL ASSERTIONS FOR THIS SPEC (all in-process — `sim.step()` is pure, so a full 60s run costs ms)
- **min live chasers >= 3**, sampled every step across a full run;
- **max chaser-to-runner distance at spawn > the visible band** (they started off-screen) and **min distance
  reached < a stated px** (they got really close) — report both numbers;
- **ZERO catch events** across a full AUTO run (speed-matching makes contact structurally impossible), with a
  counter-case proving the check bites: a run where the speed-match is deliberately disabled DOES produce a
  catch (so the assertion is not vacuous);
- **duration ~60s** for a completed run, reported as the actual step count / seconds figure;
- **fire rate** measured at ~1/5 the previous cadence, reported as shots-per-run before vs after.

**PARKED, DO NOT TUNE (balance is frozen):** halving the escape's length doubles the payout-per-hour for the same
`bestGold x K`. That is a known, deliberate debt for a later balance pass — RECORD it in the report, do not
adjust K now.
