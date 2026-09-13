# G12 BRIEF — FULL GAME TREATMENT: TITLE SCREEN, STARTUP MENU, EXIT + LOAD (build-plan W4)

Self-contained. Read this whole file first, then the files it names. You are the only writer in
`/home/claude/projects/hordes` while you hold the lock.

## HOUSE RULES (non-negotiable)
- No emojis anywhere. Integer pixels only, no smoothing, no blur.
- 60Hz AND 120Hz must both be correct; nothing may assume a fixed dt.
- Never weaken, skip or delete a test. A test may be retargeted to a replaced contract, never no-op'd.
- Do NOT run `git commit|checkout|reset|stash|clean` — the orchestrator owns commits.
- Do not retune balance, do not touch `src/heat.js`, do not touch `src/challenges.js`.
- Do not author new art: the title art already exists (see below). Layout + logic only.

## RECON ALREADY DONE (verified 2026-09-13 by the pilot tick — trust these, re-check cheaply)
- `src/art/title.js` EXPORTS `TITLE_WIDTH` 480, `TITLE_HEIGHT` 300, `TITLE_LAYERS`, `TITLE_ART`,
  `composeTitle`, `drawTitle` (its own header calls it "TITLE SCREEN CARD — 480x300, layered (menu
  overlays this)"). **NOTHING DRAWS IT:** `grep -rn "drawTitle\|TITLE_ART" src/main.js src/render.js`
  returns nothing. Today `showTitle()` (`src/main.js:3022`) calls `openMenu()` and paints DOM cards over
  the LIVE GAME MAP. The owner explicitly asked for a title graphic, "not on the map". That is the gap.
- Save export/import plumbing EXISTS in `src/save.js`: `buildExport` (809), `exportProfileText` (820),
  `downloadText` (893), `downloadProfile` (929), a `showSaveFilePicker` upgrade path (~937), and
  `importProfileText` (already used at `src/main.js:3145` for a settings restore, pure, so a bad file
  cannot damage the profile).
- The menu is a DOM overlay (`index.html` `#overlay`, `.cards`), built by the card factory
  `menuCard(name, sub, onclick, dim)` at `src/main.js:2670`. `showTitle()` set mode `'title'`.
  `openMenu()` / `closeMenu()` and the chrome gate `chromeOn()` / `syncChrome()` already exist.

## DO
1. **DRAW THE TITLE GRAPHIC BEHIND THE MENU**, instead of the map. Read `src/art/title.js` and use its
   own `composeTitle` / `drawTitle` (do not re-author the art). Integer scale, no smoothing, composes
   with the existing resolution modes. Expose a renderer seam (`this.titleScreen = {x,y,w,h,scale,...}`,
   null when not in the title) so a headless test owns the geometry.
2. **STARTUP MENU.** `PLAY` becomes `START GAME`. Add `EXIT GAME` as the LAST card. KEEP every card that
   exists today (SHOP / CHARACTERS / TROPHIES / BESTIARY / CHALLENGE / SETTINGS / HOW TO PLAY): the owner
   asked for a startup menu, not for the shop hub to disappear. Removing reachable content is a regression.
3. **EXIT GAME, HONESTLY.** In order: (a) autosave; (b) attempt `window.close()`; (c) when it does not
   close — it will not, for a tab the player opened — show a farewell screen ("progress saved, you can
   close this tab now"). A button that silently does nothing reads as broken. Make the three steps
   assertable (a seam or an event log), not a comment.
4. **START GAME: LOAD-FROM-DISK.** When NO local save exists (fresh browser), START GAME must offer
   load-from-disk, reading through the EXISTING `importProfileText`. When a save does exist, add no
   friction. The load-from-disk path must stay reachable either way (if SETTINGS is its cleaner home,
   put it there too and say so in your report).
5. **CHROME GATE + TOUR.** Register the mode in `chromeOn()` / `syncChrome()` (wave-23 shipped a
   regression by skipping this, over the intro movie). Confirm the first-run tour and the key-hints
   panel do NOT render over the title.
6. **AUTOSAVE before every exit path.**

## ACCEPTANCE (the pilot tick will re-run all of this itself; your self-report is a claim, not evidence)
- `bash /tmp/run_all.sh` => `FAIL=0`, THREE times. Add a new `test/test_title_screen.mjs` (or extend the
  closest existing test) covering: the title seam geometry when in title and null when not, the menu
  containing START GAME and EXIT GAME and still containing the existing cards, the EXIT step order, the
  no-local-save load offer, and the chrome-gate contract (chrome off in title).
- A REAL-BROWSER check at a PHONE viewport (390x844 @dpr3): either extend `tools/verify_phone.mjs` or add
  `tools/verify_g12_title.mjs`. It must PASS and assert, from DOM geometry + `getImageData` samples:
  (a) what is painted behind the menu is the title art, not the game map; (b) START GAME and EXIT GAME are
  inside the viewport and unclipped; (c) the flow is driven by real taps; (d) the farewell screen renders.
  Save the shot to `docs/art/browser-verify-2026-09-12/g12-title-phone.png` (1170x2532).
- Honest report line for anything you could not verify. No vision model is reachable from this host, so
  do NOT claim a "looks right" judgement — geometry and pixel samples only, stated as such.

## LOCK
From `/home/claude/projects/hordes`: `AGENT_HUB_PARTICIPANT=<you> ~/projects/agent-hub/sdk/agentlock acquire --note "G12 title screen"`.
If it prints rc=1 (or says HELD), sleep 20 and retry, up to 5 times; if still blocked, STOP and report
`blocked: <owner>` — never edit without the lock. Release with `~/projects/agent-hub/sdk/agentlock release`
**from `/home/claude/projects/hordes`** (it resolves the lock from CWD), even if you fail.

## REPORT
`done:` + the files you changed, the suite number, the exact verify output, the PNG path, and an explicit
list of what you could NOT verify. Nothing else.
