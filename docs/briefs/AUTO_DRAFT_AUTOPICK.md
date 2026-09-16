# AUTO DRAFT AUTO-PICK — 6 second timeout, random card (owner request, 2026-09-16)

Owner, verbatim: **"Can we add so on auto, the card selection screen has a 6 second timeout and then it auto
picks a random card."**

## WHY THIS IS THE RIGHT SHAPE
This game is an auto-player (`main.js` :1 — "auto-playing survivors-like"): the pilot drives movement, the
potion hand and the cast hand. The DRAFT is the one screen that still stops the run dead and waits for a human,
so in AUTO the run parks on a modal until someone taps. This gives AUTO the hands-free continuation it is
missing. It is AUTO-ONLY by the owner's wording: a MANUAL player must see no countdown and get no auto-pick.

## SEAMS (measured on the current tree)
- `state.pilotMode` + `normalizePilotMode` — `main.js` :581-582. `PILOT_MODES = ['AUTO_ALL', 'AUTO_MOVE',
  'MANUAL']`; `'AUTO'` is the pre-(h) persisted alias of `AUTO_ALL`. So AUTO means
  `normalizePilotMode(state.pilotMode) !== 'MANUAL'`.
- Draft open: `openDraft()` :2697 sets `state.mode = 'draft'`, appends cards to `ovCards` (:2790-2825), and the
  overlay title is `ovTitle.textContent = 'LEVEL ' + state.player.level` (:2787).
- **The ONE activation seam: `activateDraftCard(u)` :2866 -> `pick(u)` :2892.** Both the tap
  (`el.onclick = () => activateDraftCard(u)`, :2812) and the 1-4 number keys route through it. The auto-pick
  MUST call this same seam so every side effect (the WAVE-11 taper, the `once` ledger, achievements, purse,
  audit) is byte-identical to a human tap.
- The draft coachmark: `startCoach({ id: 'draft', ... })` :2830 fires the first time a draft ever appears and
  rides ON TOP of the cards.
- Per-frame entry: `frame(now)` :7192 (rAF re-arms at :7241-7262). The sim is `update(dt)` :1657, and 'draft'
  mode already freezes the sim (:2828 comment) — so **the countdown cannot ride the sim clock**. Drive it from
  the frame's wall-clock dt, gated on `state.mode === 'draft'`.

## WHAT TO BUILD
1. **A 6.0s countdown that starts when the draft screen is presented in AUTO**, driven by the frame loop's dt —
   NOT `setTimeout`. A frame-driven timer stops on its own when the tab is hidden and is trivially gated.
2. **On expiry, pick UNIFORMLY AT RANDOM from the offered cards** (`choices`) and take it through
   `activateDraftCard(u)`. Use an INJECTABLE rng (`rng = Math.random` parameter) so a test can pin the index —
   several modules here already follow that pattern (e.g. `chests.js` :291, `choices.js` :228).
3. **SUSPEND the countdown — do not run it — while any of these hold:** the draft coachmark is up
   (`tour.active()`), any overlay/modal sits above the draft, `state.mode !== 'draft'`, or the document is
   hidden. RESUME where it left off once the obstruction clears: the player is owed 6 seconds of visible,
   unobstructed draft. Re-arm the countdown each time a draft is presented.
4. **Show the countdown** (my call — an auto-pick must never be a surprise): one small, unemphatic line on the
   draft screen, e.g. `AUTO-PICK IN 4.2s`, updating live. AUTO ONLY: a MANUAL run renders no such line.
5. **Never auto-pick in MANUAL. Never pick twice for one draft.** One presented draft = at most one auto-pick.
   A human tap during the countdown takes that card and cancels the timer.
6. Put the 6.0s in `CONFIG` (e.g. `CONFIG.AUTOPILOT.DRAFT_TIMEOUT`) with a comment recording the owner's
   request, following the file's convention of commented knobs (see `AUTO_DRINK` / `AUTO_CAST` :300-360).

## ACCEPTANCE
1. **Unit tests** (`test/test_auto_draft.mjs`) with a pinned rng: 5.9s of ticking -> NO pick and still
   `mode === 'draft'`; at 6.0s -> exactly ONE `activateDraftCard` call with the expected offer and the draft
   resolves; ticking while the coachmark is up -> no pick; ticking while `mode !== 'draft'` -> no pick;
   `pilotMode: 'MANUAL'` -> no pick at any elapsed time; the countdown line is present in AUTO and ABSENT in
   MANUAL; a tap before expiry cancels the timer and there is no second pick.
2. **Real-browser verifier** (`tools/verify_auto_draft.mjs`), real Chrome at 390x844 @dpr3, touch emulation:
   in AUTO, open a draft and tap NOTHING — assert within ~7s that a card was taken (read the LIVE run state:
   the taken stat/upgrade is present) and the draft closed; then in MANUAL assert that after 7s nothing has
   happened (still `mode === 'draft'`, no pick). Capture a PNG of the countdown line while it is up, and
   report the verifier's own measured expiry time.
3. `bash tools/run_suite.sh` ends `redfiles=0`; no existing assertion weakened or deleted.
4. Report: the measured expiry, which card was taken, files touched, and a `COULD NOT VERIFY` section. No sims,
   no cohorts — this is UI verification only.

## HOUSE RULES
No emojis (in UI code or reports). No `git commit/checkout/reset/stash/clean` — leave the tree dirty and report
the dirty count. Post `done:` / `blocked:` / `checkpoint:` to the hordes channel FIRST, then raw evidence.
Heartbeat `/tmp/autodraft_progress.log` before and after every step that can exceed a few seconds. Then END
YOUR RUN cleanly.
