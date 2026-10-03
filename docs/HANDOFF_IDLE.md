# Handoff: idle play (background play, auto-continue, camp)

Branch `claude/overhaul`. Status on 2026-10-02: **complete**, apart from the open items at the end. Nothing pushed.

Suite: 208 files, 208 green, twice in a row (`node tools/run_suite.mjs --par 12`).

## What shipped

| Item | Commits |
|---|---|
| Flaky tests, background play | `e53efa4`, `7c70287` (earlier worker) |
| Green suite, away tracking fix, end-card hold, auto-continue test | `0872683` |
| Away card styling | `73fe12a` |
| Camp save: schema 12, Starting Artifact refund | `6b0b886` |
| Camp on the title, camp screen, new hints | `3d3990e` |
| How to play page 2 | `49f04ba` |
| Screenshots and fixes found in them | `4af6222` |

## Auto-continue and the away summary

- Setting `AUTO-CONTINUE` (Settings, pref `hordes_auto_continue`, default off, needs the AUTO pilot).
- A run started by auto-continue pays 50%; a run the player starts pays in full.
- Restart 5 s after the end card. Any input on the end card holds it to 30 s.
- END RUN is the player's own: its end card never restarts by itself, input or not. The 30 s stall watchdog
  restarts only an end card whose countdown is still armed.
- After 20 auto-started runs with no input, the game stops on the title.
- Turning the setting off during a run takes effect for that run: nothing continues or restarts by itself
  (what the run pays stays as it started).
- The away card opens on an input 60 s or more after the last one, if an unattended run ended or a run ended
  in a hidden tab, or if the camp made something while the game was closed or hidden. A player watching a
  run, or idle on the title with the tab visible, gets no card. The first input of a session measures from
  `profile.lastPlayed`.
- The card opens only on the title or in a live run: never over the end screen (it waits for the next run or
  the title) and never while the tab is hidden (one already open goes back to waiting, and runs played hidden
  join it). It reads the camp when it opens. ESC and the touch cog collect it; any other screen clears it.
- Verified headless (`test/test_auto_continue.mjs`, 30 checks) and in real Chrome
  (`tools/capture_idle.mjs`: the away period is faked by an old `lastPlayed` and old camp stamps; the first
  key press opens the card through the real input path).

## Background play rules

`bgTick` and the block around `onVisibilityChange` in `src/main.js`; `test/test_background_play.mjs` and
`test/test_two_tabs.mjs` (two game instances over one storage).

- The ticker (a Worker, or an interval where there is none) exists only while the tab is hidden and something
  can run: the setting is on, the pilot is not MANUAL, the guided tutorial is not live, and no other tab has
  taken over (below). The setting and the pilot start and stop it.
- One tick steps at most `C.BACKGROUND.BUDGET_MS` (50 ms) of wall-clock time. Frames that do not fit are
  dropped (`bgStats.droppedS`), so a heavy run plays slower than real time in the background instead of
  working without a pause (about half of one core at most).
- Saves: the tab saves when it hides, a run in play saves every 10 s of run time and every `SAVE_S`, and the
  end of a run saves. The title and the end card write nothing while hidden.
- Two tabs, one save. The tab in front owns the save: opening or showing a tab writes `hordes_tab`, and a
  hidden tab that hears it stops playing and saving until it is shown again or that tab is closed (closing
  writes the key once more). A hidden tab that hears another tab change the save (more than its time stamp)
  never writes again and reloads when it is shown; the title then says NEWER SAVE LOADED. A visible tab
  keeps its save, as before. A tab the browser froze hears storage events late, so a hidden tab also compares
  the stored save with the one it last read or wrote, before each write and when it is shown.
- Music: showing the tab starts the music if a run is in play then, and stops it otherwise.
- No first-time hint opens in a hidden tab (see `docs/TUTORIAL.md`, C.8), and the first-draft coach does not
  start there (`test/test_draft_coach.mjs`).
- A hidden run does not stall (`test/test_bg_progression.mjs`): the escape cinematic ends at once and pays in
  full, and the milestone chest plays its burst without the card (the gold is already banked). The same goes
  for an unattended run in a visible tab. An unattended or hidden run's escape gold is added to the away summary.

## Camp

`src/camp.js` (rules), `src/camp_art.js` (four 16x16 buildings drawn with `blitGrid`), the camp block in
`src/main.js` (`showCamp`). A CAMP card joins the title after two finished runs, with the strip on it
(not on a short landscape phone). The camp screen has one card per building, COLLECT and BACK.

| Building | Makes | Levels: price (output) | Limit |
|---|---|---|---|
| Gold Mine | gold an hour | 400 (150/h), 1,200 (300/h), 3,000 (500/h), 7,000 (750/h), 15,000 (1,000/h) | 8 hours stored |
| Forge | first weapon +1 level next run | 800 (8 h), 3,000 (4 h), 9,000 (2 h) | 1 charge |
| Library | 1 free reroll next run | 600 (8 h), 2,400 (4 h), 7,000 (2 h) | 1 charge |
| Shrine | a joker offer at run start | 2,000 (12 h), 6,000 (8 h), 15,000 (4 h) | 1 charge |

Prices unchanged after measuring: see "Idle income" in `docs/BALANCE_M1.md` (camp-only 150 to 1,000 gold an
hour against 4,600 to 9,500 for auto-continue and 6,700 to 18,800 active).

**The clock.** Production is counted from each building's `since` stamp, and the stamp does not move back: a
clock set forward and back again is never paid twice for the same time, the building waits until the clock passes
its stamp. One exception, once per building: a stamp more than one hour ahead of the clock (`CAMP_CLOCK_SLACK_H`)
was written by a wrong clock, or came with an imported save, so the first look restarts the count at the clock
instead of stopping the building for that long. `camp.pulled[id]` records that the building has used it; a later
stamp ahead of the clock waits, whatever its size. So a clock moved forward and back pays at most one store more
per building, once (`test_camp`: six forward-and-back cycles pay two stores). A clock set back by more than the
hour and then looked at uses the pull-back as well.

### Save (schema 12)

- `MIGRATIONS[11]`: empty camp; the Starting Artifact row is removed and refunded from the spend ledger
  (what was paid), or at the v11 list price (1,200 / 2,640 / 5,808 / 12,778) where the ledger has no entry;
  the ledger entry is dropped; `campRefund = { version: 12, gold }` marks the save and the title says so once.
- A v10 save had the row refunded at v10 prices by the v10 to v11 step, so it gets no second refund.
- `validateProfile` runs `sanitizeCamp` and reports `camp` when it repairs.
- The pre-update backup still triggers only for schema < 11.
- Fixtures: `test/fixtures/profile_v10_written_by_v10_build.json` and the new
  `test/fixtures/profile_v11_written_by_v11_build.json` (written by the v11 build at `3d274c3`: Starting
  Artifact Lv 2, ledger 1,200 + 2,640).
- The KILLS_500_UNDER_5MIN achievement no longer unlocks a row (its row was the Starting Artifact).

## Tests changed or added

`test_auto_continue` (rewritten), `test_camp` (new, 19 checks), `test_camp_ui` (new, 9 checks),
`test_background_play`, `test_arena_scaleup`, `test_m3_first_minutes` and `test_run_purse` (fixed random
stream; m3 also clears shrines; the purse parity check allows one boundary kill), `test_manual`,
`test_title_screen`, `test_meta`, `test_art_lint`, `test_timed_achievements` and the schema-version pins.

## Open items

- Dead prologue code: listed in `docs/TUTORIAL.md`, "Open items". Not removed.
- How to play: page 2 now carries YOUR BUILD and WHILE YOU ARE AWAY; pages 3 and 4 (controls, the field)
  were checked for cut systems and kept as they are. A full split into shorter pages would touch the many
  tests that pin those pages.
- The Library and Shrine charges have not been measured for value; they are not gold.
- The Worker path of background play is still verified only by the interval fallback (headless) and the
  screenshots; a real hidden-tab session in Chrome was not timed.
- The two-tab rules are verified headless only (two game instances, storage events delivered by the test);
  two real browser tabs were not driven.
- Other tests in the suite still run on an unseeded `Math.random` (for example `test_camera_deadzone`,
  `test_perks`, `test_tutorial_guided`, `test_audit_m3` each failed once under load during this work and
  passed alone); seeding them is the cure that worked here.
