# PILOT PREFERENCE PERSISTENCE — "the selections they made for auto and manual" (owner-relayed player request, 2026-09-16)

Owner, verbatim: **"The players want the selections they made for auto and manual to persist between runs."**

## ROOT CAUSE — read out of the code, not guessed

`src/main.js` :560-563 — the pilot choice IS written, and then thrown away:

```js
// Last pilot choice per browser (hudText settings pattern). Write-only for
// the record — per the build directive EVERY run starts in AUTO regardless.
const KEY_PILOT = 'hordes_pilot';
function savePilotPref(mode) {
  try { prefStorage.setItem(KEY_PILOT, mode); } catch { /* shim */ }
}
```

1. **`KEY_PILOT` is never read.** `grep -rn KEY_PILOT src/` returns exactly two lines: the declaration and
   the write. There is no `getItem` call anywhere, so the stored preference has no effect.
2. **`startRun()` hard-forces AUTO.** `src/main.js` :5408 `swapPilotMode('AUTO_ALL')` — a player who chose
   MANUAL (or AUTO MOVE) is put back into AUTO ALL every single run.
3. **The doctrine stance is not persisted at all.** `controller.stance` starts `'BALANCED'`
   (`controllers.js` :62); the doctrine key cycles it (`main.js` :6007 -> `cycleStanceWithFeedback`). The two
   controllers are module-level singletons (`main.js` :545-547) so the choice survives *within* a session by
   accident, and a page reload loses it. There is no `KEY_STANCE` / `hordes_stance`.

The comment at :558-559 records a deliberate older directive ("EVERY run starts in AUTO regardless"). The
owner has now reversed it. **Update that comment** so the file does not document behaviour it no longer has.

## WHAT TO BUILD

1. **Read it back and apply it.** At run start, replace the hard `swapPilotMode('AUTO_ALL')` with the
   PERSISTED choice, normalized. Reuse the existing seam — apply through `swapPilotMode()` so the controller
   binding, `to.focus`/`to.stance` inheritance, held-input clearing, hint refresh and the toast all happen
   exactly as they do for a mid-run toggle. Do NOT hand-assign `state.pilotMode`.
   - Absent / unreadable / unrecognised value -> `AUTO_ALL` (today's behaviour for a fresh player).
   - `'AUTO'` -> `AUTO_ALL` via `normalizePilotMode` (the legacy persisted name, :583).
2. **Also apply it at boot**, not only at run start, so a reload keeps the player's mode (title + settings
   reflect it). Guard for the shim storage (every read here is `try { } catch { }`).
3. **Persist the doctrine stance too.** Add `KEY_STANCE = 'hordes_stance'` on the same `prefStorage` seam:
   write it whenever the doctrine key cycles the stance, read it back at run start and at boot, validate
   against `STANCES`, and fall back to `'BALANCED'` on anything unrecognised. Apply it to the LIVE controller
   (both controllers, so a mode swap inherits it — `swapPilotMode` already carries stance across).
4. **Make the mode selectable pre-run.** The pilot toggle is currently live mid-run only (:5874). Add the
   same cycle as a SETTINGS row available in the title settings as well as in-run, so a player can set the
   choice without having to reach it mid-run. Reuse the existing settings row helper; no new screen.
5. **Do NOT persist `state.focus`.** It is a tactical, moment-to-moment targeting setting, not a preference.
   Say so in the report so the omission is deliberate rather than overlooked.

## AUDIT (required, reported)
List every place that forces or assumes the pilot mode at run start, with file:line and a verdict, including
at minimum `startRun` :5408, anything AUTO-only (auto-drink `:1756`, auto-cast `:1761`, the AUTO-only
invulnerability window noted at `config.js` :406-408), and the escape sequence's own auto controller
(`main.js` :80, `src/escape/`). For each: does a persisted MANUAL player break it, or does it read
`pilotMode` correctly and simply do less? Report, do not silently "fix" anything outside this brief's scope.

## ACCEPTANCE
1. **Unit tests** (`test/test_pilot_pref.mjs`) against a fake/`prefStorage`-shimmed storage: stored `'MANUAL'`
   -> a run starts in MANUAL **and `controller` is the manual controller**; stored `'AUTO_MOVE'` -> AUTO_MOVE;
   nothing stored -> AUTO_ALL; stored `'AUTO'` -> AUTO_ALL; stored garbage -> AUTO_ALL; stance `'GREEDY'`
   round-trips into the live controller at run start; stored garbage stance -> BALANCED; applying the
   preference twice is a no-op (no duplicate toast/controller churn); cycling the doctrine key writes the
   stance key.
2. **Real-browser verifier** (`tools/verify_pilot_pref.mjs`), real Chrome at 390x844 @dpr3: (a) toggle to
   MANUAL mid-run, retire/end the run, start a new run -> assert it starts MANUAL and the joystick element is
   shown (the `wantJoy` rule, :6628); (b) **reload the page**, start a run -> still MANUAL (proves the
   storage path, not just in-memory state); (c) with a cleared storage, a fresh run starts AUTO_ALL; (d) the
   stance survives the same round trip. Report the observed mode at each step.
3. `bash tools/run_suite.sh` ends `redfiles=0`; no existing assertion weakened or deleted. If an existing
   test asserts "every run starts AUTO" (the old directive), report it with file:line and say what it now
   asserts — do not quietly delete it.
4. Report the audit table, files touched, and a `COULD NOT VERIFY` section. No sims, no cohorts.

## HOUSE RULES
No emojis. No `git commit/checkout/reset/stash/clean` — leave the tree dirty and report the dirty count. Post
`done:` / `blocked:` / `checkpoint:` to the hordes channel FIRST, then raw evidence. Heartbeat
`/tmp/pilotpref_progress.log` before and after every step that can exceed a few seconds. Then END YOUR RUN.
