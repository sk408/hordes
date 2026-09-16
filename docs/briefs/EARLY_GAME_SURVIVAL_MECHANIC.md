# EARLY-GAME SURVIVAL MECHANIC — investigate (owner report, 2026-09-16)

## THE REPORT (this is all you get — deliberately)
A player reports that a mechanic reachable in the **early game** lets them stay alive while apparently taking
no damage. They described it to the owner as becoming invincible.

The owner's words: **"a mechanic in early game allows the user to stay alive and without taking apparent
damage"**

## METHOD — you are NOT being given hypotheses
Form your own. You are deliberately given **no candidate mechanics, no leads, no file:line pointers, and no
list of things to check**. Earlier attempts at this investigation were seeded with the owner's or the
orchestrator's guesses and chased those instead of the symptom. Do not ask for them, and do not anchor on
anything you may have read elsewhere in this repo's docs.

A method that works for this kind of question:
1. **Map the mechanism space yourself.** Find every code path where the player's HP decreases, and every path
   where damage to the player is gated, negated, reduced, or undone. Enumerate them from the code — that list
   is the search space.
2. **Map what the early game can reach.** Anything obtainable in roughly the first couple of hours of play:
   early shop rows, common draft cards, arches, shrines, chests, evolutions, rules, perks, character rows,
   meta/account upgrades. Anything expensive or late is out of scope — the report says early.
3. **Test candidates by prediction, not by vibes.** For each plausible candidate, state what it would predict
   about observable state, then test that prediction. Bounded: **<= 60 seconds of wall clock per command** (the
   owner's standing cap — a check that does not fit is DROPPED, never given a bigger timeout).
4. **Report what survives**, and say plainly what you ruled out and how.

"Apparently taking no damage" can mean any of these — hunt the whole family, not one of them:
- incoming damage negated entirely (a gate that blocks it)
- incoming damage reduced to a fraction that any incidental healing covers
- HP restored as fast as it is lost
- the lethal case prevented (something that stops death itself)
- a state the player can enter and then REMAIN in, which suppresses damage

## DELIVERABLE
1. **THE MECHANISM** — named, with file:line, how the player acquires it (and how early), and the reason it
   prevents damage.
2. **THE EVIDENCE** — raw output of whatever you ran: a bounded run against a CONTROL run of the same length
   (damage taken, HP floor, deaths), or a browser check, or a computed rate comparison with the numbers shown.
3. **A VERDICT** with your confidence, stated plainly. **"Could not reproduce; here is what I tested and ruled
   out" is a VALID and valuable result.** Do not fabricate a repro, and do not present a plausible story as a
   finding — an unproven story costs more than an honest null here.
4. Report anything else you find that is broken or unverified along the way, even if it is not the answer.

## HOUSE RULES
Read-only: do not edit game code, do not fix anything, do not change balance — the owner decides after seeing
the findings. No `git commit/checkout/reset/stash/clean`. Nothing may exceed 60 seconds of wall clock per
command. Post `done:` / `blocked:` / `checkpoint:` to the hordes channel FIRST, then raw evidence. Heartbeat
`/tmp/invuln_progress.log` before and after every step that can exceed a few seconds. Then END YOUR RUN cleanly.
