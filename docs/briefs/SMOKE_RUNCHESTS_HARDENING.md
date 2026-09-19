# BRIEF: smoke mercy-rule + runchests walk-in flakes — same-class deterministic hardening (TEST-SIDE ONLY)

House rules: one writer (you hold the agentlock — ACQUIRE it first; RELEASE it when
your run ends — the kimi lane has leaked it TWICE, tick 88/89; release on run end is
now part of your contract). No git state commands. Never weaken an assertion to go
green; every retarget enumerated as file + line + why. 60s wall cap per command.
Owner's taste: no emojis, pixel-art integrity. The orchestrator owns commits; leave
the tree dirty and report.

## The class

Both legs assert over UNSEEDED run content and are green standalone but red under
suite runs. This is the same exposure class as the tour negative-window flake
(closed 2026-09-18, TICK NOTE 91) and the review_round1 modal class. Preserved
captures under /tmp/hordes_suite_failures/ (named per defect below).

## DEFECT 1 — test/smoke.mjs mercy-rule volley leg (failing assert :2167-2168)

The finale block pins the volleyId mercy arithmetic: `st.player.hp = full;
invuln = 0; volleyMask = null; potions.hp = 0`, then steps ONE frame per shot and
asserts STRICT hp equality (`hp === full - third`) after each. The failing assert:
"the second hit of the SAME volley must pass harmlessly (mercy rule)".

Captures: 20260918T162747Z_smoke.mjs.log (weather rolled: CLEAR) and
20260918T224242Z_smoke.mjs.log (weather rolled: MOONLIGHT). The test already prints
the rolled weather (smoke.mjs:661). TWO captures under TWO different weathers means
AT LEAST TWO interference sources exist — do not pin weather and call it done.

The mechanism class: any heal between the pinned frames breaks strict `===`.
Known candidates, in priority order:
  a. MOONLIGHT weather flat regen (+0.5/s HP — the TICK-23 shop_mana flake class;
     weather is rolled unseeded in startRun, src/main.js:7349).
  b. Lifesteal — the player weapon is live during the finale and the maw is the
     only enemy; if the driven build carries any lifesteal, a weapon hit that
     frame heals.
  c. Shrine altar heal — shrines are world-seeded static (S1); if the hero stands
     in a weak altar's radius during the pin block, the capped heal ticks.
  d. Anything else your instrumentation finds — enumerate ALL of them.

Step 1 — NAME THE CULPRITS. Instrument a scratch copy (or temporarily) to print,
on assert failure: st.weather.id, the hp delta vs expected, player lifesteal/regen
stats, and distance to each altar. Loop the file under load until it fires.
Report every source observed with its src/ line.

Step 2 — PIN EVERY SOURCE for the duration of the pin block, same philosophy as
the existing potion emptying (smoke.mjs:2153-2158, the WAVE-28 comment: the
feature working is not this check's subject). Expected shape: pin CLEAR weather
(test_shop_mana.mjs:254 idiom `st.weather = initWeather('CLEAR', 7)`, import at
:29), zero the player lifesteal/regen terms for the block, and if altars can
reach the hero, move the hero out of radius or neutralise the altars for the
block. The assertions themselves are UNTOUCHED — same values, same strictness.
Restore nothing afterwards: the hero dies at the end of the block by design.

## DEFECT 2 — test/test_runchests.mjs 9b walk-in leg (failing ok() :356-358)

The leg starts a real run at the RUN-100 milestone crossing and lets the REAL
autopilot beeline to the chest through the ordinary drop loop, budget 1200 frames
(20s): "the real autopilot WALKED INTO the chest (collected in NEVERs of ordinary
play)". FOUR captures TODAY: 210700Z, 224833Z, 232208Z, 232448Z (the last two fired
during the S1 builder's own suite runs — this flake is actively costing the lane).

The mechanism is named in the file itself: FLEE outranks CHEST (asserted as its
own check at :333-336, "the celebration never walks into a horde"). Unseeded
wave-1 spawn content near the beeline path keeps the pilot fleeing until the
budget expires. Frames are stepped synchronously, so this is spawn-content RNG,
not wall-clock load.

Fix — pin the field for the walk-in window with the TICK-91 rss8 idiom:
`st.enemies.length = 0; st.spawnTimer = 1e9;` inside the walk-in loop
(test_rss8_magnet.mjs:188 pin, :323/:328 per-frame loop idiom; spawnTimer is the
real spawn gate, src/main.js:1475-1476). The walk-in then exercises exactly what
the leg means: the chest collect through the real drop loop, the burst, the card,
the persistence (:360-380 asserts all UNTOUCHED and must still pass). The FLEE
precedence rule keeps its own dedicated check at :333-336, so NO coverage is lost.
Also pin CLEAR weather for the leg if your measurement shows wind/weather can
move the chest path (windDrift exists) — measure first, pin only what moves.

## Acceptance bar

- node test/smoke.mjs — green, 5/5 standalone runs.
- node test/test_runchests.mjs — green, 5/5 standalone runs.
- bash tools/run_suite.sh — THREE consecutive runs, each redfiles=0, TREE lines
  included.
- No assertion weakened; every pin/retarget enumerated as file + line + why.
- Report: for defect 1, EVERY heal source observed with its src/ trigger line and
  the pin applied to each; for defect 2, the pin applied and the measured
  collectedAt before/after (a before reading may need several runs to catch);
  check counts before/after; the three suite log paths; anything you could NOT
  make deterministic.

## DISPATCH ANCHOR CHECK (confirmed by the goal pilot at dispatch, live tree d12a4a5 + S1 dirty)

- Mercy-rule failing assert: test/smoke.mjs:2167-2168 — CONFIRMED
- Potion-emptying precedent + WAVE-28 comment: test/smoke.mjs:2153-2158 — CONFIRMED
- Weather print line: test/smoke.mjs:661 — CONFIRMED (used to read the captures)
- Unseeded weather roll: src/main.js:7349 `initWeather(rollWeather(), ...)` — CONFIRMED
- CLEAR-pin idiom: test/test_shop_mana.mjs:29 (import), :254 (pin), :251-253 (why) — CONFIRMED
- Walk-in failing ok(): test/test_runchests.mjs:356-358, loop at :351-355 — CONFIRMED
- FLEE>CHEST precedence check (kept, not touched): test/test_runchests.mjs:333-336 — CONFIRMED
- spawnTimer pin idiom: test/test_rss8_magnet.mjs:188, per-frame :323/:328 — CONFIRMED
