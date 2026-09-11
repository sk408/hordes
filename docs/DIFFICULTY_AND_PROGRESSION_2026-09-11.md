# HORDES — difficulty & meta-progression direction (2026-09-11, rev 2)

**Supersedes the "challenge" item in `PLAYTEST_FEEDBACK_2026-09-11.md`.**
That doc said "make the draft able to lose." This one says **how hard**, and what the
loss loop has to deliver.

**Source:** Sk408, after more galaxy.click feedback. The audience wants to **lose a lot of runs**
and **buy things in the shop to make progress**. They expect to feel **very weak at the start** and
to advance through (a) knowledge of the game and (b) shop unlocks.

---

## The reframe that matters: "simple/accessible" and "brutal" are NOT opposites

Sk408's instinct was simple + accessible. The platform audience wants punishing + grindy. These only
look like a conflict if you treat them as one dial. They're **two different dials**:

- **Accessibility = legibility.** Can you understand what's happening, what the numbers mean, and
  what your choice does? (This is the previous doc's business: XP readout, crisp text, defined arena,
  exit a run.) Get this RIGHT and the game is still simple.
- **Difficulty = stakes.** Can you lose, does it cost something, does the loss convert into progress?

Vampire Survivors is *both*: instantly readable, and it kills you constantly for the first hours.
That's the target. **Do not trade legibility away to buy difficulty**, and do not soften difficulty
to preserve "simplicity" — they are independent, and the audience checks the second one before it
will approve anything.

## What "hard enough" means, concretely

The acceptance bar is behavioural, not numeric. A build is hard enough when:

1. **A fresh save loses its first runs.** New player, no unlocks, no knowledge → the first several
   runs END in death. Not "eventually coasts"; not "shreds everything by minute 3." Early death is
   the expected, normal experience.
2. **The player starts meaningfully under-tooled.** The opening minutes should feel like scraping.
   The first real upgrade should feel like relief, not a formality.
3. **Death is attributable.** A player must be able to say *why* they died — out-scaled, a bad draft,
   a boss they weren't ready for. If the honest answer is "I watched and it just happened," that's
   the unfairness that makes people uninstall, and it is NOT what is being asked for.
4. **Losing always pays.** Every failed run converts into currency and a visible unlock path. The
   shop is the *reason* losing a lot is acceptable: the player is never actually stuck at zero.
5. **Knowledge pays.** A player who knows the synergies should get measurably further than one
   picking at random. This is the "incremental progress through knowledge" the audience expects —
   skill expression inside an auto-playing game.
6. **There's always a next thing to buy.** The shop needs an obvious, affordable next unlock
   visible at the moment of failure ("you can now afford X"), so the loss loop closes immediately.

## What "harder" must NOT be

- **Not bigger enemy HP.** That makes runs *longer*, not harder, and it's the lazy lever. Longer
  runs + the same outcome = more boredom, not more stakes.
- **Not random deaths.** Unfairness reads as "broken," not "hard." (See point 3.)
- **Not by removing the auto-play.** Movement remains the controller lane; difficulty is not the
  player suddenly needing to aim.
- **Not a difficulty slider bolted on top.** Tune the default experience; the audience plays the
  default.

## The loop to make real

    lose early  ->  earn currency  ->  shop unlock (permanent)  ->  next run is DIFFERENT
      ^                                                                    |
      +------------------------ knowledge accumulates ---------------------+

Every run must move at least one of the two arrows: a shop unlock, or the player's knowledge. A run
that moves neither is a wasted run and will be felt as such.

Suggested first diagnostic (cheap, honest, no guessing): **instrument what wave a typical run dies
at**, for a fresh save and for a partially-unlocked save, and compare. Pick target numbers from the
gap you actually measure, rather than picking a number and tuning blindly toward it.

## A way to keep the original vision alive (Sk408's call)

These two audiences can coexist: ship the **genre-correct default** (lose a lot, grind the shop) —
that's what earns platform approval and a regular-player audience — and expose the original
"simple and accessible" experience as an **alternate mode** (a lower-heat / casual setting reusing
the heat + meta levers that already exist). Default = what the platform wants; mode = what you
wanted. Not a compromise, just two doors.

## Relation to the other doc

- `PLAYTEST_FEEDBACK_2026-09-11.md` — legibility defects (XP bar, fuzzy text, exit run, map edge)
  and the first-run comprehension fixes. **Those still stand and are still the priority**, because
  a player who can't read the game can't perceive that it's hard — they'll just call it "all over
  the place."
- This doc — the stakes/difficulty target and the loss→shop→knowledge loop.
- Order: legibility first (or alongside), then tune difficulty against the instrumented death-wave
  numbers. **Do not tune difficulty blind.**

---

## REV 3 — Sk408's follow-up: die EARLIER (2026-09-11, verbatim)

> "It would be nice if the play testers could die easily sooner in the beginning though. They all
> mention that they like dying. At least I assume because they all talk about being overpowered."

**Requirement:** a FRESH SAVE's first runs should end in the **first few waves** — well before any
real build comes online. The early game must be lethal, not merely "a bit harder."

**Why this is the right read** of the tester feedback: "in a few minutes my character could just
shred literally everything" is the same complaint as "no challenge". The opening has no teeth, so
there is nothing to learn and nothing to want from the shop, which collapses the whole
loss → shop → knowledge loop this doc exists to create.

**Two constraints that keep it honest:**
1. **Death must stay legible** — the player can see what killed them. An early death that reads as
   arbitrary is *worse* than no death, because it teaches nothing. This is why legibility
   (`PLAYTEST_FEEDBACK`, XP bar / map edge / fuzzy text) still comes first: dying to something you
   couldn't see isn't difficulty, it's just noise.
2. **Do not inflate enemy HP or run length to get there.** That makes runs longer, not harder. The
   levers are early-wave pressure, starting stats, and the draft.

**Making death a feature, not just a wall:** if players are going to die in the first waves often,
the death moment has to carry information and momentum — what killed you, how far you got, what's
now within reach because of it. Dying early should feel like a step, not a stop.

**Success looks like:** fresh save dies around the first few waves; each unlock/purchase visibly
extends the reach; and a deliberately bad draft still loses. All three are measurable — report the
figures, don't assert them.
