# TUTORIAL OVERLAY — "the popups go away too easily" (player feedback, owner-relayed 2026-09-16)

## THE COMPLAINTS (owner's words)
1. "People are still mad at the tutorial. They are mad that the popups go away too easily when they try to push
   other things."
2. Owner's proposed fix: "maybe there should be a full on screen overlay that has next and back buttons when
   showing multiple popups at the same time."
3. "And also notify the user that they can replay the tutorial."
4. "And they feel like the information is without context."

## ROOT CAUSE — read out of the code, not guessed
`src/tour.js` :156-170. The tour's shade advances on ANY pointerdown:

```js
this.onPointerDown = (ev) => {
  if (ev && ev.stopPropagation) ev.stopPropagation();
  const under = this._underlyingControl(ev);
  if (under) { this._teardown(); this.onDone(); if (typeof under.click === 'function') under.click(); return; }
  this.next();          // <-- ANY tap anywhere = advance
};
```

A player reaching for the thing the tip is describing dismisses the tip instead. Multi-step coachmarks
(`startCoach`, `main.js` :3824 — "multi-step = spotlight") burn through their steps one stray tap at a time.
Any key advances too (:172-179); Escape skips.

That is complaint 1 — and it is most of complaint 4 as well: a tip that disappears the instant you touch
anything never gets read at the moment it was written for, so it reads as information without context.

**A REPLAY PATH ALREADY EXISTS.** `src/main.js` :5123 in SETTINGS:
`menuCard('REPLAY TOUR', 'run the walkthrough again from the start', ...)` -> `clearTourFlags()` and re-arm.
Complaint 3 is DISCOVERABILITY, not absence. Do NOT build a second replay mechanism.

## DO NOT BREAK THESE (each is deliberate and commented)
- **WAVE-31** (:158-168): a tap that lands on a real title menu card under the shade must PRESS THAT CARD and
  end the tour. The title tour is the ONLY pass-through site (`passThrough`). In-run coachmarks must NOT pass
  through: the comment at :110-114 records why (a pass-through in-run would silently pick a draft card).
- In-run coachmarks PAUSE the sim while they are up. Keep that.
- A step whose target is missing is skipped silently and never throws (:201-206).
- `setTourFlag(key, true)` marks a step seen even when its target was missing.

## WHAT TO BUILD

### A. The overlay and its controls (the core)
Replace "any tap advances" with an explicit, discoverable control set:

- A real overlay: the dimmed shade SWALLOWS taps — a tap that is not on a control of the tip card does NOT
  advance and does NOT dismiss. This is the whole point of the change.
- The tip card carries real buttons: **BACK** and **NEXT** (and the existing SKIP, clearly labelled). NEXT on
  the final step completes the tour (label it as the finish, e.g. GOT IT / DONE, not NEXT).
- A step counter on any tour with more than one step ("2 of 5"). On a single-step coachmark, hide BACK (do not
  show a dead button) and make the primary action read as a finish.
- Keyboard: Right/Enter/Space = next, Left = back, Escape = skip. No other key advances.
- Buttons must be real, hit-testable controls — big enough to tap on a phone (>= 44px), inside the card, and
  never under the shade. Use pointerdown-or-click consistently with the rest of the game's input plumbing.
- The sim must stay paused for the whole tour, exactly as now.

### B. Replay discoverability (do not rebuild it)
- When a tour completes OR is skipped, the player is TOLD they can run it again: a single line on the final
  card (e.g. "You can replay this any time from SETTINGS"), and a toast/line after a skip.
- Make it findable where a confused player looks: the title menu's HOW TO PLAY card text should name the
  replay path, since HOW TO PLAY is already the onboarding surface (:3542-3554, :4305).
- REPLAY TOUR in SETTINGS keeps working and must actually re-arm: `clearTourFlags()` then the tour fires again.

### C. Context audit (report, then fix only mechanical misalignment)
For EVERY `TOUR_KEYS` entry, produce a table: key | where it fires (file:line) | what the tip text explains |
the moment the player is in when it fires | VERDICT (the tip describes something on screen right now / it
describes something not yet seen or long gone).
- Fix ONLY mechanical misalignment: a tip that fires before the thing it describes exists, or long after the
  player has already done it. Report every such move with before/after.
- Do NOT rewrite tip copy for tone. Content is the owner's call: if a card reads flat, say so in the report
  with the current text and a proposed line, and leave the text as it is.

## ACCEPTANCE
1. `node test/test_tour.mjs` passes with NEW assertions: a tap on the shade outside the card does NOT advance
   and does NOT dismiss; NEXT advances; BACK returns; BACK is absent/disabled on the first step; the final
   step's primary completes the tour; the counter reads correctly on a multi-step tour; Escape still skips;
   **the WAVE-31 contract still holds** (a title-menu card press under the shade fires the card and ends the
   tour); REPLAY TOUR clears the flags and re-arms.
2. A real-browser verifier (`tools/verify_tour_overlay.mjs`) driving REAL taps in real Chrome at 390x844 @dpr3
   with touch emulation, and at least ONE landscape size: assert the shade tap is inert, NEXT/BACK work, the
   buttons are >=44px and fully on-screen (no chrome off-viewport), and capture PNGs of a multi-step card.
   The mobile rule stands: overlap is the acceptable failure mode, never an unusable control.
3. Suite `bash tools/run_suite.sh` to `redfiles=0`; NO existing assertion weakened or deleted. If an existing
   tour assertion encodes the old "any tap advances" behaviour, report it with file:line and say what it now
   asserts instead of quietly deleting it.
4. Report the context audit table (section C) in full, plus every retarget you made.

## EVIDENCE / REPORT FORMAT
- `TREE @ <HEAD> | dirty=<n>` (no git state commands; leave the tree dirty and report the count).
- Suite banner verbatim.
- The verifier's own output line + PNG paths.
- The audit table and the retarget list.
- A `COULD NOT VERIFY` section. No sims, no cohorts, no measurement arms — this is UI verification only.

## HOUSE RULES
No emojis in the UI (an unprofessional tell). No `git commit/checkout/reset/stash/clean`. Post
`done:` / `blocked:` / `checkpoint:` to the hordes channel FIRST, then raw evidence. Heartbeat
`/tmp/tutorial_progress.log` before and after every step that can exceed a few seconds. Then END YOUR RUN.
