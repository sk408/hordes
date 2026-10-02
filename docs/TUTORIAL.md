# HORDES — the new-player tutorial

Code: `src/tutorial.js` (steps, hints and rules, no DOM), `src/tutorial_ui.js` (the panel and rings),
the "New-player tutorial" block in `src/main.js` (the glue), a CSS block in `index.html`.
Tests: `test/test_tutorial_guided.mjs`. Screenshots: `docs/art/tutorial/` (`tools/capture_tutorial.mjs`).
Measurement: `tools/measure_tutorial.mjs`.

## Why it is shaped this way

The first players were dropped into the game with no idea what to do. The long tutorial that followed
threw information at them without context, closed on stray clicks, kept showing tips after "skip", timed
out, and skipped tips while they were steering. The three-card version that replaced it taught too little.

So: everything is taught by doing, one short sentence at a time, on the thing it is about; nothing can be
dismissed by accident; nothing times out; skipping is deliberate and final.

## A. The guided first run

Run 1 of a fresh profile opens with the guided part. While it is live:

- the field is live, with five harmless trainer enemies kept on it (ordinary spawns are off);
- the hero cannot be hurt (contact and shots are ignored); the only HP loss is the scripted hit in step 7;
- the run clock is held at 0:00, so the run that follows is a normal run 1;
- the XP bar stops at half and the purse stays at 0 until the gold step, so run 1 pays what it always paid;
- the pilot does not cast the skill or drink the potion by itself, and the draft does not auto-pick;
- first-time hints are off for that whole run.

| # | id | Text (desktop / touch) | Points at | Shows | Completes when |
|---|----|------------------------|-----------|-------|----------------|
| 1 | `hero` | Your hero fights on their own. You build them. | the hero | run start | the hero makes a kill (after a 2 s read) |
| 2 | `move` | Hold W A S D to steer. Let go and the pilot takes over. / Drag anywhere to steer. Let go and the pilot takes over. | the hero | after 1 | the player steers for 0.5 s and lets go, or presses JUST WATCH |
| 3 | `gems` | Enemies drop gems. Gems fill the XP bar. | the XP bar | after 2 | a gem is collected (after a 2 s read) |
| 4 | `draft` | Level up! Weapon cards add attacks; stat cards make you stronger. | the cards | after 3; the step grants the free level-up and the real draft opens | NEXT is pressed, or a card is picked |
| 5 | `evolve` | Weapon cards name their evolution partner. Pick 1 card. | the cards | after NEXT (not shown if the card was already picked) | a card is picked |
| 6 | `skill` | Skills cost mana. Press Q to fire yours. / Skills cost mana. Tap EARTH to fire yours. | the mana bar and the Q control | after 5; mana is filled and the skill made ready | the skill is fired |
| 7 | `potion` | You are hurt. Press H to drink a potion. / You are hurt. Tap HP to drink a potion. | the HP bar and the potion control | after 6; the hero is set to 40% HP with one potion | a health potion is drunk |
| 8 | `gold` | Kills and time survived earn gold. | the gold counter | after 7; kills start paying | the counter is above 0 (after a 2 s read) |
| 9 | `handover` | The horde will win this time. That is expected. Gold buys upgrades that last. | nothing | after 8 | BEGIN is pressed |

At the handover protection ends, HP and mana are refilled, the potion is given back, and the run clock starts.

Words a new player reads before the handover ends: 88 on desktop, 85 on touch. The longest step is 14 words
(the handover, and the desktop move step). Every step is one or two lines at 1280x720, 844x390 and 390x844.

After the first death:

| # | id | Text | Points at | Shows | Completes when |
|---|----|------|-----------|-------|----------------|
| 10 | `end` | You earned gold. Spend it in the SHOP. | the GOLD EARNED line and the SHOP card | the end screen, until the shop step is done | the shop is opened |
| 11 | `shop_buy` | Upgrades are permanent: every run from now on. Buy one. | the cheapest core upgrade the player can afford | the shop, when something is affordable | something is bought (the bank goes down) |
| 12 | `shop_back` | Bought. Now go BACK and press PLAY. | the BACK card | the shop, after the purchase | the title is reached |
| 13 | `play` | Press PLAY. You are stronger now. | the PLAY card | the title | a run starts |
| 14 | `run2` | Aim for a weapon's evolution: level it to 8 and hold its partner card. | nothing | the start of the next run; holds the sim | GOT IT |

RETRY and TITLE stay usable on the end screen. A player who never buys anything stops seeing steps 10 to 13
after their second run.

## B. First-time hints

One sentence, once per profile, the first time the thing appears. A hint holds the sim until its GOT IT is
pressed (or, hands-off, for 20 seconds). Settings has HINTS: on/off. A profile that had already finished three
or more runs when this version first loaded starts with the "basic" hints marked as seen.

| id | Text | Trigger | Basic |
|----|------|---------|-------|
| `prerun` | Pick a stage and a modifier, or just press START. | the pre-run screen opens | yes |
| `chest` | Walk into a chest to open it. | a chest is on screen | yes |
| `shrine` | A shrine sells a blessing for gold. Stand in it to buy. | an unused shrine is on screen | yes |
| `arch` | Run through an arch for a short buff. | an arch is on screen | yes |
| `elite` | Glowing enemies are elites: tougher, with better loot. | an elite is on screen | yes |
| `midboss` | A mid-boss. Kill it for a chest. | a mid-boss is on screen | yes |
| `boss` | The wave boss. Kill it to open the portal. | the wave boss is on screen | yes |
| `portal` | The portal is open. Walk in to end the wave. | the portal is on screen | yes |
| `escape` | The escape: run right and jump the gaps for bonus gold. | the escape sequence starts | yes |
| `evoready` | This weapon is level 8 and you hold its partner: it evolves. | the evolve screen opens | no |
| `fusion` | Two evolved weapons can fuse into one stronger weapon. | **hook only**: call `tutHint('fusion', [element])` from the fusion overlay | no |
| `draftacts` | Reroll, skip or banish: each spends one charge. | a draft opens while a charge is owned | no |
| `focus` | Focus picks which enemy your weapons aim at first. | the player changes Focus | no |
| `stance` | Stance: SAFE keeps away, GREEDY chases loot. | the player changes Stance | no |
| `loadout` | You own a new weapon. LOADOUT chooses which ones you bring. | the pre-run screen, once a third weapon is owned | no |
| `prestige` | Prestige resets the shop for a permanent gold multiplier. | the end screen offers prestige | no |

Two older one-line tips stay as they were: the Focus line on the end screen after a death to an enemy shot,
and the Stance toast at the first boss after run 1.

## C. Control rules

1. **No accidental dismissal.** A panel's button ignores a press that went down before the panel appeared or
   within 400 ms of it (`TUT.GUARD_MS`). A button fires only if the pointer went down on that button. A held
   key (auto-repeat) never counts. The panel and its root take no pointer events, so taps and drags on the
   play field go to the game. Only the panel's own button, or doing the action, advances a step.
2. **Placement.** The panel is placed once per step: in a band above or below the middle of the play area,
   or in the strip under the field when the viewport is taller than the field. It never covers what it
   points at, the on-screen controls or the shop pager, and never sits on the middle of the field.
3. **No timers.** No tutorial clock can end the tutorial or the run. The only clocks are the 2 s minimum read
   on the three "watch it happen" steps, the idle rule (D) and the 4 s window for the second SKIP press.
4. **Skip.** SKIP TUTORIAL is on every guided and menu step. It takes two presses (the label changes to
   TAP AGAIN TO SKIP); Escape is its key twin. A confirmed skip ends every guided step, the menu steps and the
   second-run line, and no hint shows for the rest of that run.
5. **Steering.** While the player holds a move input the idle clock is reset, so no step is moved on and no
   hint closes itself.
6. **Replay.** Settings and the manual both have REPLAY TUTORIAL (it starts the guided run, or arms it for the
   next run when pressed mid-run). HOW TO PLAY stays under Settings; its first page opens with one line per
   tutorial step.
7. **Returning players.** A profile with a finished run never gets the guided run automatically. The
   what's-new note offers it once; REPLAY TUTORIAL is always there.

## D. Idle rule

A player who never touches anything must still get through. A step that needs an action waits 15 hands-off
seconds (`TUT.IDLE_WAIT_S`), then the pilot performs the action and the text changes to "Watch: ..." for
3 seconds: the pilot steers, picks the first card, fires the skill, drinks the potion. Steps with only a
button (NEXT, BEGIN) and the three event steps move on by themselves after the same wait. The menu steps
never act for the player: nothing runs while a menu is up, and spending gold is the player's call.

## E. Persistence

No save-schema change. Progress is kept in the profile's one-time-banner ledger (`profile.banners`):
`tut:cohort`, `tut:guided`, `tut:skipped`, `tut:shop_buy`, `tut:play`, `tut:hints_init` and `hint:<id>`.
The HINTS switch is the storage flag `hordes_hints_off` (`TOUR_KEYS.hintsOff`).

## Measured (tools/measure_tutorial.mjs, fresh profiles)

| | Guided part, median | Survival after the handover | Gold banked by run 1 |
|---|---|---|---|
| A player who does each step about 2 s after it appears (n=9) | 20 s | 24 s [17 to 48] | 388 [351 to 453] |
| A player who touches nothing (n=7) | 110 s | 39 s [17 to 63] | 471 [427 to 500] |
| No tutorial, same build, for comparison (n=9, settled profile) | 0 | 32 s [20 to 49] | 379 [336 to 419] |
