# U1 — TITLE MENU: SUBNAV + THEMED BUTTONS

Owner directive (in session, 2026-09-14, verbatim):

> "I think we have too many buttons on the main menu. There should be more
> submenus to contain some and also we should have custom themed buttons
> instead of squares"

## State: LANDED (subnav + themed buttons + header art) — suite 78/78 green

**Themed buttons — DONE, uncommitted, verified.** `index.html` `.card` is now a
notched pixel plaque instead of a bordered box: 6px cut corners (`clip-path`),
a 4px hard 0-blur bevel (lit top/left, shaded bottom/right) driven by CSS custom
properties so hover/dim/selected only swap COLOURS and the silhouette cannot jump
between states, a black keyline, a gradient fill, a hard text-shadow on the name,
and a `::before` caret (pseudo-element, so `cardByTitle('X')` innerHTML matchers
and every `textContent` assertion still pass — verified).

Pixel proof (`/tmp/p1_pixel_proof.mjs`, 390x844 @dpr3, screenshot read back in-page):

```
lum: centre=25 topBevel=95 bottomBand=6 leftBevel=75 rightBand=11
corners: TL=12 TR=12 BL=12 BR=12      -> all four cut (darker than the fill)
VERDICT: cornersCut=true topBevelLit=true bottomShaded=true
```

Tests green afterwards: test_title_screen 19 groups, test_tour, smoke,
test_bestiary 22, test_challenges 16, test_stages 33, test_trophy_gallery 21,
test_save_v3_characters. No test asserts `border-color` anywhere (checked
`src/`, `test/`, `tools/`).

**Subnav — LANDED.** The split chosen and shipped:

- **Top level (6 cards, 7 on a fresh browser):** START GAME / [LOAD FROM DISK] /
  SHOP / CHARACTERS / **PROGRESS** / **SETUP** / EXIT GAME (last).
- **PROGRESS** → TROPHIES, BESTIARY, BACK. Sub-line: "emblems earned · enemies met".
- **SETUP** → CHALLENGE, STAGE, SETTINGS, HOW TO PLAY, BACK.
- The two cycling cards stay in SETUP and re-render the **submenu** after a press
  (not the title), so cycling does not bounce the player out of the door.

Real-browser walk (390x844 @dpr3, `/tmp/u1_header_probe.mjs`):

```
PROGRESS -> title="PROGRESS" names=[TROPHIES, BESTIARY, BACK]
SETUP    -> title="SETUP"    names=[CHALLENGE, STAGE, SETTINGS, HOW TO PLAY, BACK]
```

**Header art — LANDED (owner directive, same session):** the purse/equipped text
and the "the build IS the game" tagline are gone. The header is now a coin glyph
plus the gold number, and the equipped pilot as their OWN `CHARACTER_PORTRAITS[id]`
bust (32x32 backing, integer 2x, pixelated) — proven to track the equipped id
(Witch and Rogue give different pixel signatures), not a hardcoded image. ARCADE
PASS and the save-damage notice are preserved.

**The tests had to move with it, and two of the updates were STRENGTHENINGS:**

- `test_tour`'s contract `taught == titleCards - exempt` forces a coached step per
  title card, so the tour now coaches the two doors (naming their contents).
  `DISCOVERY_EXEMPT` is now **EMPTY** — stricter than before, since CHALLENGE and
  STAGE were the only exemptions and both are no longer title cards.
- `test/test_bestiary.mjs` asserted `cardWith('PLAY')`, which passed for a long
  time **only because the lookup is a substring match and the title carried "HOW TO
  PLAY"**. It now asserts `START GAME`. That was a latent test bug, not a goalpost
  move.
- Eight files reach a moved card and now walk its door first: `test_title_screen`,
  `test_tour` (via the steps), `smoke`, `test_save_ui`, `test_bestiary`,
  `test_trophy_gallery`, `test_challenges`, `test_stages`, `test_feedback_098`.

**Still open:** the truly authored pixel-art 9-slice frame (the CSS plaque is a
good approximation, but `clip-path` clips a 0-blur `drop-shadow`, so the cast
shadow needs an authored frame drawn through the repo's `drawGrid` pipeline).
Note for whoever picks that up: `drawGrid` frames are INTEGER grids where `0` is
the transparent cell — a string grid makes every cell truthy, `palette['.']` is
undefined, the invalid `fillStyle` assignment is silently ignored and the previous
colour paints every pixel (this is how the first cut of the coin rendered as a
solid block).

## Measured inventory — the title screen carries 11 cards

`src/main.js::showTitle()` (~line 3600), in order:

1. START GAME  ← **must stay top-level** (see contract below)
2. LOAD FROM DISK ← only rendered when `fresh` (no local save)
3. SHOP
4. CHARACTERS
5. TROPHIES
6. BESTIARY
7. CHALLENGE ← cycling card (press cycles the pending challenge)
8. STAGE ← cycling card (press cycles the pending stage)
9. SETTINGS
10. HOW TO PLAY
11. EXIT GAME ← **must stay LAST** (asserted)

`openMenu(mode)` + `menuCard(name, sub, onclick, dim)` are the only two seams a
submenu needs; a submenu screen is `openMenu('more')` + `menuCard(...)` rows +
a BACK card (`showTitle()`), exactly like `showHowToPlay()` / `showSettings()`.

## Contracts that MUST be preserved (this is the blast radius)

- `test/smoke.mjs:303` clicks `cards.children[0]` as START GAME → START GAME must
  remain the FIRST card.
- `test/test_title_screen.mjs:143` asserts the flat menu BY NAME: START GAME,
  SHOP, CHARACTERS, TROPHIES, BESTIARY, CHALLENGE, SETTINGS, HOW TO PLAY,
  EXIT GAME, plus "EXIT GAME is the LAST card" and "no card named PLAY". Moving
  any of those behind a submenu **must** update this assertion in the same
  change — it is a contract, not a flake.
- `src/main.js:3111-3139` — the tour walks the title cards one at a time via
  `cardByTitle('SHOP'|'CHARACTERS'|'TROPHIES'|'BESTIARY'|'SETTINGS'|'HOW TO PLAY'|'EXIT GAME')`.
  A card moved behind a submenu returns `undefined` → the tip loses its target.
  Retarget those steps (point them at the submenu card, or open the submenu in
  the step) in the same change.
- `tools/verify_p1_portal.mjs` finds START GAME by text in `#ov-cards` → fine as
  long as START GAME stays top-level.
- `test/test_bestiary.mjs:349` asserts the title cards come back after the guide
  (START GAME present) → fine.

## Suggested split (owner's call)

- Top level: START GAME, [LOAD FROM DISK], and a small number of doors —
  e.g. PLAY / PROGRESS / OPTIONS, or keep SHOP + CHARACTERS top-level and put
  ARCHIVE (TROPHIES, BESTIARY) + SETUP (CHALLENGE, STAGE, SETTINGS, HOW TO PLAY)
  behind two doors, EXIT GAME last.
- The two cycling cards (CHALLENGE, STAGE) are awkward top-level: they render a
  long sub-line, which is why STAGE is visibly taller than its row partner in
  the current 2-column layout. Both belong in the same submenu.

## Acceptance bar

- START GAME remains `cards.children[0]`; EXIT GAME remains last.
- `bash /tmp/run_all.sh` green (or the named reds identical across three runs).
- The tour still resolves every step's target (test_tour).
- One real-browser capture at 390x844 @dpr3 of the NEW submenu screen and the
  title, read back (no vision model dependency — sample the pixels).
