# V1 — THE ESCAPE SEQUENCE (side-scrolling change of pace) — BUILD BRIEF

**Slice:** V1. **STATUS: NOT DISPATCHED — DESIGN RECORD.** Sequenced AFTER W11 (G7 elevation) and
E2 (the wave-2 horde, which ships the flying enemy). Its two prerequisites are its verbs: G7 gives
the leap/z substrate, E2 gives the flier.
**Builder:** TBD (whoever holds the lane when it is dispatched).
**Brief authored by:** Remy (orchestrator), 2026-09-14, at HEAD `89be109`, from five owner messages
recorded in full under THE OWNER DIRECTIVE below.
**The dispatch tick MUST re-verify every anchor below on ITS tree.** Nothing here has been measured
against a tree that contains the mode, because the mode does not exist yet; the anchors are the
systems it REUSES and they all move.

## HOUSE RULES (read first — they override anything below that contradicts them)

- **Do NOT run any git state command** (no commit/checkout/reset/stash/clean). The orchestrator owns
  commits. Leave the tree dirty and report.
- **Never weaken or delete an assertion to go green.** If this slice legitimately invalidates one,
  RETARGET it to the new invariant and SAY SO (file + line + why). Any retarget forced by this slice
  is named under ACCEPTANCE; anything else must stop and report.
- **A code claim is not evidence.** Every number comes from a command whose raw output you keep and
  quote.
- **No emojis.** Pixel-art integrity: integer pixels, no blur, no smoothing. 60Hz AND 120Hz correct;
  nothing may assume a fixed dt.
- **New mode = register it in the screen-chrome gate** (`chromeOn`/`syncChrome`) and verify in a real
  browser. Skipping this shipped a regression over the intro movie once already.
- **One writer per file.** Build the mode in NEW files under `src/escape/`; the integration into
  `src/main.js` is a narrow, single seam (see SCOPE). Do not restructure `main.js`.
- **THE MODE IS SELF-CONTAINED — this is a design rule, not a nicety:**
  - It must NOT read `p.stats`, `applyMetaBonuses`, the draft, loot affixes, or any meta bonus.
  - Its movement writes go in the ESCAPE'S OWN movement layer, never the shared overhead movement,
    so no assist can leak into the main game.
  - Nothing it does may change the run's economy, drafting, or shop.

## THE OWNER DIRECTIVE (verbatim, in order)

1. **The origin:** *"we could at some point take a lot of this framework and make a side scrolling
   game. Actually, that might be an interesting either game play mode or a kind of replacement for
   wave 2. Flop between side scrolling and overhead view. Definitely give a unique feel to the game."*
2. **The reframe that makes it affordable:** *"Think of the side scroller like this: an escape
   sequence. The pilot is running from the horde. We can skim down the mechanics by changing the
   framing and expectations. It's not a complete game. It's a change of pace."*
3. **Weapons and the boss:** *"auto pilot has to be able to play it. And we could have weapons and
   what not but they don't need to follow stats. Just add a bit of dimension to the experience. A
   shot or two kills any enemy.. maybe a boss comes but the player can just go around them somehow."*
4. **Platforming is IN:** *"Oh wouldn't we need gravity? I mean, it should still have some
   platforming elements to it. Different levels to run on and gaps to jump over sort of thing."*
5. **Length:** *"Well, not a 30 second sequence. More like 2 minutes."*
6. **The finale:** *"At the end, with the boss, we need a portal for the player to reach to move on.
   Biggest question will be how to make it so the player can reach the portal but not make the boss
   seem completely harmless."*
7. **The auto jump:** *"Jumps are easy. You just put an invisible jump box at the right spot to jump
   and it triggers if auto pilot is engaged. No timing needed."*
8. **The speed fudge:** *"we can fudge the speed for the jumps too. The jump box can add a bit of
   speed to pilot if needed. But should have a threshold so it doesn't look too silly."*

The authoritative design section is **V1 — THE ESCAPE SEQUENCE** in
`docs/HORDES_GOALS_2026-09-12.md`. Read it in full before coding; this brief is the buildable form
of it, not a substitute.

## WHAT THIS REUSES (re-verify at dispatch — all of these MOVE)

- **The portal (P1).** `src/config.js` `PORTAL: { RADIUS: 16, SPEED: 60 }`; opened in
  `src/main.js` where the boss fell; `openIntermission()` ends the wave. P1 parks it and teaches the
  pilot to walk to it, with **bounded i-frames for AUTO only and none for manual**. **The escape's
  exit IS that portal entity and those rules** — do not build a second lookalike.
- **The invuln tell.** `src/render.js` already blinks at 20Hz while `pl.invuln > 0`. Reuse it; never
  add a second invuln visual.
- **The controller seam.** `src/controllers.js`: `AutoPilot.decide(p, state, cfg)` returns
  `{ moveX, moveY, target }`; the MANUAL controller has its own `decide`. The pilot is deliberately
  PILOT-BLIND (enemies only). The escape is a **new mode with its own controller input**, not a new
  branch inside the overhead `decide`.
- **The flier (E2)** — the upper-band threat that ignores gaps.
- **The leap / z-axis (G7)** — the jump verb and its shadow convention.
- **The screen-chrome gate**, `tools/run_suite.sh`, `tools/browser.mjs` (NOTE: `withPage` sets only
  7 of 19 `TOUR_KEYS` and `frame()` gates on `!coachActive()`, so a run booted through it can be
  FROZEN — set all 19 and assert `state.time` advances before measuring), and the established
  `tools/verify_*.mjs` pattern (real Chrome, 390x844 @dpr3, PNG 1170x2532).

## WHAT THE FRAMING CUTS — do not build these

Level DESIGN (hand-authored maps), vertical aiming, any weapon re-read, the arena rim, the radar
(meaningless side-on), and the draft/shop/meta/chests/shrines — none of them run inside the escape.
That last one is what makes it a change of pace AND keeps the slice self-contained.

## THE MODE

**A generated platformer corridor, run left-to-right, ~2 minutes, ending at the exit portal.**

- **Weapons: cosmetic-plus, ZERO stat coupling.** Auto-fire, a shot or two kills anything, flat,
  regardless of build. They exist to add dimension. The escape must not read `stats.damage`.
  Consequence, and it is intended: a maxed profile cannot trivialise it, so the tension survives the
  late game.
- **One verb: dash/dodge** (plus jump, which is authored — see AUTO). One verb is also what keeps it
  playable by the pilot.
- **Horde pressure readout** replaces the radar: how close the wall of pursuers is behind you. It
  should read as a visible wall, never as an invisible timer.

## SPATIAL MODEL (gravity and platforming are IN — Remy's earlier "no gravity" claim is retracted)

- Gravity, jump arcs, and platform collision. **Land-from-above is sufficient for ledges**; full
  solid-side resolution is not required.
- **Different elevations to run on, and gaps to jump.** Falling into a gap is lethal.
- The corridor is a **bounded band** (a floor, a ceiling-ish limit, x running one way) — not an open
  arena and not a full 2D platformer.

## THE GENERATOR (this is what replaces level design)

- A handful of corridor **segment templates**: flat run / raised terrace / gap / platform pair /
  boss beat, assembled in sequence near-zero authoring cost and real per-run variety.
- **Templates carry a DIFFICULTY TIER and the sequence RAMPS — it must not shuffle.** At ~200px/s a
  two-minute run covers 20,000+px, so this is dozens of segments: a handful of templates alone will
  not sustain two minutes.
- **Each template authors its own SPEED WINDOW** `[v_min, v_max]` (see AUTO).

## PACING (two minutes of the same thing is a failure mode)

1. **0:00-0:30 — WARM-UP.** Flat ground, one easy gap, the horde visible but not yet lethal. Where
   the player AND the pilot learn the verb.
2. **0:30-1:10 — ESCALATION.** Terraces and taller drops, harder gaps, the pressure wall closing,
   first FLIERS. Difficulty ramps here.
3. **1:10-1:35 — THE BOSS BEAT.** The obstacle-boss arrives, telegraphed, passed above/below/over.
   The climax.
4. **1:35-2:00 — THE FINAL SPRINT.** Max pressure, simplest terrain, a straight run to safety.
   Reward surviving to here; do not surprise.

Indicative timings — tune by measurement.

## THREAT MODEL

- **The horde wall behind is the real timer.** It is what makes time matter.
- **Ground pursuers cannot platform, so GAPS DOUBLE AS ENEMY FILTERS.** Route choice becomes a
  verb beyond dodging: the player picks a line that breaks up the wall.
- **FLIERS IGNORE GAPS** (E2's enemy) — the counter to gap-kiting. Two threat types with opposite
  answers is the mode's texture.
- **The boss is an OBSTACLE, not a fight, and it is UNKILLABLE by construction** (no stats). That
  makes the design question *"how expensive is the bypass"*, not *"how strong is it"*. Three levers,
  use them rather than damage: **(1) it costs TIME** (its body and telegraphs occupy the corridor, so
  passing costs seconds and seconds are what the wall punishes — it can kill you indirectly without
  ever dealing unavoidable damage); **(2) it destroys terrain** (tear out platforms, so the finale is
  a race against the damage and the boss reads as powerful the moment it lands); **(3) it constrains
  the route** (telegraphed passes over/under/through, so it cannot be walked past by accident).

## THE FINALE

- **The portal is a VISIBLE BEACON from a distance.** The goal must be legible — same fairness rule
  as the gaps.
- **The boss guards the APPROACH, not the exit. The danger ENDS where the reward begins:** the boss
  never touches the portal area, and contact with the portal ends the sequence immediately.
- **Reuse P1's portal entity and rules**, including auto-only bounded i-frames and manual getting
  none.

## AUTO PILOT (confirmed required by the owner)

- **Invisible jump-trigger volumes, owned by the segment TEMPLATE** and emitted with its geometry, so
  trigger and gap can never disagree. **Firing rule: inside the trigger AND auto engaged AND moving
  forward.** Deterministic — no lookahead, no prediction, no tuning.
- **The trigger also CLAMPS approach speed INTO the template's window — both ways.** Too slow drops
  the pilot in the gap; too fast OVERSHOOTS the landing platform (a fixed arc plus higher horizontal
  speed carries you past the ledge). One clamp kills both, and it makes **template playability
  speed-independent by construction** — which matters because the mode shares the player entity and a
  maxed build's speed would otherwise break the geometry.
- **THE SILLINESS THRESHOLD:** cap the fudge at a small fraction of current speed (start ~25-30%,
  then measure), applied as a single small clamp at the trigger rather than a visible acceleration
  ramp. It should read as the player bracing for the jump, not as the game taking the controls. **If
  a template needs more than the cap, THE TEMPLATE IS MISDESIGNED** — that is the signal, not a
  reason to raise the cap.
- **AUTO ONLY.** A manual player getting nudged would feel like the game playing for them. Same
  assist rule as the portal i-frames and the invisible trigger: auto-assisted, manual unassisted.
- **The boss beat needs NO triggers** — weaving is spatial steering, the controller's home turf.
- Trigger edge cases: a BAND, not a point (so a slowed or knocked-back player cannot slide past the
  firing line); never double-fire (not mid-air, not while falling); one-way per segment.

## SKIP (owner directive, 2026-09-14 — a first-class feature, not a courtesy)

Sk408: *"For now we should have a skip method available for the players, so it just feels like an
interactive cinematic than a required game. That way they are less critical if it feels underdeveloped."*

- **Visible from the FIRST FRAME, one input, no waiting, no hidden gesture.** A skip nobody notices does
  not buy the immunity it exists for.
- **Skippable at the start AND mid-escape.** Never trap a player for two minutes.
- **NEVER A GATE.** Progress, the run, and the run's normal payout are identical either way.
- **FAILURE IS SOFT, NOT DEATH:** the escape ends (no escape bonus) and the RUN CONTINUES. This removes
  the fairness risk of a two-minute platformer entirely — a mistimed jump cannot end a run. The AUTO
  pilot's failure takes the same path, so an auto run can never be ended by V1.
- **SKIP = FORGO THE PAYOUT. That is the light punishment, and the ONLY punishment** — no run penalty,
  no death, no gate. Owner refinement 2026-09-14: *"Missing the payout is the light punishment. Should have
  enough of a reward that people want to play it, otherwise it's an auto skip after the first play."*
- **THE PAYOUT: SCALED TO THE PLAYER, SET BY THEIR OWN BEST RUN.** The owner set the INTENT — *"Should pay
  at like 1/3 the normal rate of time spent in a run of that length for that player... 2 min equals 40
  seconds payout. It's an easy stage so can't pay too much"* — and then set the MECHANISM: *"We could even
  store best gold per run for a player and use that as the guide... Best rate doesn't feel right. Best run
  feels right."* Implementation is `payout = bestGold x K` with K tuned so it lands near the 1/3 intent;
  the "40 seconds" figure is how K is CHOSEN, not a stored or recomputed value. The 1/3 discount is also
  anti-exploit: the stage is EASY, so a full-rate payout would make it a better farm than the run itself.
  Remy's earlier "beat the opportunity cost plus a margin" rule is **WITHDRAWN**, as is the stored-rate
  version (`bestGoldSecs`).
- **⚠ THE TRIGGER DECIDES WHETHER PLAYING IS ATTRACTIVE — strong argument for DEAD TIME (the intermission /
  wave-boundary seam).** In dead time the player is earning nothing anyway, so the payout is pure upside
  and skipping costs real income (the intended light punishment). If the escape instead consumes
  run-earning time, playing it pays LESS than the playtime is worth, so most players will skip — which is
  now a PERMITTED choice (see "legitimate choice" above), but it also means the mode is rarely seen.
  **Settle this with the trigger question; Remy recommends the intermission seam.**
- **Reward SHAPE (Remy's recommendation, owner decides):** prefer a meaningful, REPEATABLE payout
  (currency / chest-equivalent / evo tokens) over a one-off meta-collectible — repeat play must be
  motivated by the payout, and a one-off goes quiet once collected. **M1's collectible set stays OUT of the
  escape** (at most one of several routes to a piece): gating a required collectible re-creates the
  mandatory-feel pressure the skip exists to avoid.
- **Measured as the SKIP RATE ON REPEAT ENCOUNTERS**, not first: repeat skips are what reveal "auto skip
  after the first play".

## INCOME SEPARATION (owner caveat, 2026-09-14 — non-negotiable)

Sk408: *"We do need to make one caveat. This income can't count toward run total."*

**It blocks a feedback loop:** the payout is `bestGold x K`, and `bestGold` is the best single-run total. If
escape income entered the run's gold, each payout would raise the guide for its own next payout — play the
escape, get paid, the guide rises, the next escape pays more, with no gameplay in between. The mode would
become the best income source in the game and the 1/3 discount would evaporate within a few runs.

- **`bestGold` = gold the RUN earned. Escape income is excluded BY CONSTRUCTION** — never added and then
  subtracted, never allowed into the run's accounting at all.
- **The payout credits the PROFILE / BANKED meta purse at escape completion**, outside the run purse and
  outside the end-of-run award.
- It therefore cannot move `INCOME_TIERS` or `computeRunGold`. **The escape does not touch the RUN economy
  at all** — which is exactly why the owner's economy waiver needs no modelling.
- **No extra multipliers** (recommendation): `goldMult` etc. are already in the best-run basis. If a
  multiplier is wanted, it belongs in K.
- **Show the credit as its own line at escape completion** so the two currencies never blur.

## ACCEPTANCE (measurable — no adjectives)

1. **Generator invariant, asserted across generated corridors:** for EVERY template its
   (gap width, authored speed window) must **clear** the gap at the clamp floor AND **land within**
   the platform at the clamp ceiling. This is deterministic and is the whole reason the auto jump is
   cheap — fail here is a template bug, not an AI problem.
2. **AUTO completion rate through the escape**, as a TEMPLATE REGRESSION CHECK — plus the completion
   rate AT THE BOSS BEAT specifically (weaving plus jump timing is where an auto run dies).
1a. **SEPARATION IS ASSERTED, not assumed — and the compounding test is the sharp one:** (a) completing an
   escape is asserted to leave the run's gold total, its income tier and the end-of-run award UNCHANGED;
   (b) **run the escape twice in a row with no gameplay between and assert the second payout EQUALS the
   first** — if it grew, escape income is leaking into `bestGold` and the loop is live. That second clause
   is the one that catches the failure mode, because it fails loudly the moment the leak exists.
1b. **THE PAYOUT SHARE — one number, no modelling:** report the escape's measured payout as a share of the
   player's run income. The owner has explicitly waived economy rebalancing for this (*"It's a known
   quantity.. if it messes things up, we just multiply the economy by 1.3 or something"*), because a payout
   keyed to the player's own best run is a PROPORTIONAL faucet — it shifts the whole ladder together, so a
   global multiplier is the right-shaped fix. This measurement exists only so that decision is informed
   rather than guessed, and it is NOT a reason to couple V1 to W7a. Report it; do not model it.
2b. **THE SKIP RATE, reported alongside completion.** For a skippable mode this is the honest signal of
   whether it earns its two minutes: a high skip rate is the intended outcome (nobody resents it), a low
   skip rate with a high completion rate proves it is fun. Assert only that the skip WORKS from the first
   frame and mid-escape, that it never blocks progress, and that a failure soft-ends rather than ending
   the run.
3. **THE BOSS BEAT'S COST, BOTH ENDS:** the time/HP cost of the boss beat versus the rest of the
   escape. If it is ~0 the boss is decoration; if completion collapses it is unfair. Report both
   numbers.
4. **DURATION: measured 1:45-2:15** for a completed escape. Not asserted from a constant.
5. **Invuln-assist and mode-registration checks:** the mode is registered in the screen-chrome gate and
   verified in a real browser; no leaked writes into the overhead movement (assert the overhead sim
   is byte-identical with and without the escape code path exercised).
6. **The escape reads NO stats:** assert it cannot — e.g. a test that the mode's damage is identical
   at base and at a maxed loadout.
7. **60Hz and 120Hz** both correct; measured, both.
8. **Phone form factor:** 390x844 @dpr3, PNG 1170x2532, with all 19 `TOUR_KEYS` set and `state.time`
   asserted to advance before any measurement.
9. **No blind drops, no off-screen holes, no unavoidable damage** — demonstrated by walking a
   generated corridor, not asserted.
10. Suite `redfiles=0`, with any retarget named (file + line + why). No assertion weakened.

## OPEN OWNER QUESTIONS (ask before dispatch, not during)

1. **TRIGGER — now LOAD-BEARING, recommend the intermission / wave-boundary seam.** It was open for
   three reasons and is now decisive for a fourth: (a) a view swap is only safe there; (b) the owner's
   *"replacement for wave 2"* reading suggests a scheduled beat; (c) a fresh run dies at ~35s, so an
   ungated two-minute escape is content a new player never sees; and **(d) NEW — the 1/3 payout rate only
   functions as a reward in DEAD TIME.** At the intermission the player earns nothing anyway, so 40
   seconds of income is pure upside and skipping genuinely costs them. If the escape consumed
   run-earning time instead, 1/3 of the rate would make skipping rational and the mode would guarantee its
   own "auto skip after the first play" failure. **Remy recommends the wave-boundary/intermission seam.**
2. ~~**STAKES** — is failure death, or a lost reward?~~ **ANSWERED by the owner's skip directive
   (2026-09-14): failure is SOFT.** The escape ends, no escape bonus, the run continues — never death.
   See the SKIP section. Do not build a lethal failure path.
3. **REWARD — RATE SET BY THE OWNER (1/3 of the player's normal rate, i.e. 40 seconds for a 2-minute
   escape; see the SKIP section).** What remains open is only the SHAPE and the exact derivation:
   - Prefer a **repeatable payout** (currency / chest-equivalent / evo tokens) over a one-off
     meta-collectible, so repeat play is motivated by the payout itself.
   - **Assume it triggers in dead time** (see the trigger question) — that is the condition under which
     the rate works.
   - **M1's collectible set stays OUT of the escape.**
   - **"That player's rate" = their own BEST RUN (owner, 2026-09-14).** Store ONE integer — `bestGold`,
    the best single-run gold total — and pay `bestGold x K`, K tuned so the payout lands near the owner's
    1/3 intent. **A stored RATE is WITHDRAWN** (*"Best rate doesn't feel right... could break easier or have
    some unforeseen consequences with some other balance changes"*): a rate is derived and drifts silently
    when the gold formula or run lengths shift, whereas a best-run total moves with the economy. It also
    sidesteps the integer-flooring trap below entirely (no division). Retuning is a one-line constant, so
    **tuning lives in a constant, not in the save.** Update at RUN END only. Rides **W1** (`src/save.js`
    version bump + migration tolerating a missing value + validation: finite, non-negative, capped) and
    folds at **`recordRun`** (`src/achievements.js:338`) into **`TOTALS_ZERO`** (`:120-123`), beside
    `bestTime`/`bestWave`.

  **CONCRETE ANCHORS (read from the tree at HEAD `08fb127` — re-verify at dispatch):**
  - The fold-a-finished-run entry point already exists: **`recordRun(profile, run)` at
    `src/achievements.js:338`**, described in-file as "the one entry point main.js calls when a run ends".
    The new stat is folded THERE — no new hook.
  - **`TOTALS_ZERO` at `src/achievements.js:120-123`** is the totals contract, and `bestTime` and `bestWave`
    are ALREADY in it — so an "all-time best" counter is an established pattern. The contract states
    "anything a run reports that is not listed here is ignored", so a new key must be ADDED to it.
  - **⚠ THE CONTRACT IS INTEGER-ONLY, AND THAT BREAKS A STORED RATE.** `intOr` at `:134`
    (`Math.max(0, Math.floor(Number(v)))`) floors every value, and `normalizeAchievements` at `:157` runs
    every totals entry through it. So a gold-per-SECOND figure stored directly would be silently floored
    (4.7 -> 4) and **a rate below 1 gold/sec would be repaired to 0** — the payout would then read as zero
    and the escape would pay nothing, with nothing in the logs to show why.
  - **THEREFORE STORE NO RATE AT ALL — and the owner's best-run model already satisfies this.** Add ONE
    integer, `bestGold`, to `TOTALS_ZERO` and pay `bestGold x K`. **There is no division, so the trap above
    cannot fire.** (An earlier Remy version stored `bestGold` + `bestGoldSecs` and derived a rate at read
    time; it is WITHDRAWN — the owner preferred the raw total precisely because a derived rate can drift
    under later balance changes, and the divide-free version cannot floor to zero at all.)
  - `bestTime` remains unrelated to this: it is the LONGEST run, not the best-gold run. Do not substitute
    one for the other.
  - Schema work rides **`src/save.js`** (the schema + validation live there; it is already at v3 after G19's
    per-character namespace). A new totals key needs the version bump, the migration tolerating a missing
    value on old saves, and validation.


## DO NOT

- Do NOT read stats, the draft, loot or meta bonuses anywhere in the mode.
- Do NOT write to the shared overhead movement layer, or to any `p.stats` field.
- Do NOT hand-author levels; use templates.
- Do NOT build a second portal entity — reuse P1's.
- Do NOT add a second invuln visual — reuse the 20Hz blink.
- Do NOT branch the escape inside the overhead `decide()`; give the mode its own controller input.
- Do NOT raise the speed-fudge cap to make a template pass; fix the template.
- Do NOT dispatch this before G7 (W11) and E2 ship.
- Do NOT weaken an assertion, delete a test, or turn one into a no-op.
