# G13 BRIEF — THE ANIMATED CHARACTER SELECTOR (queue: G13, next after G12/G23)

Self-contained. Read this whole file first, then the files it names. You are the only writer in
`/home/claude/projects/hordes` for the duration of this task (the orchestrator holds the repo lock
and owns commits).

## HOUSE RULES (non-negotiable)
- No emojis anywhere. Integer pixels only, no smoothing, no blur — `image-rendering: pixelated` on
  any scaled bitmap/canvas, integer scale factors only.
- 60Hz AND 120Hz must both be correct; NOTHING may assume a fixed dt. Every animation timing comes
  from the frame dt already available in the loop, never from a frame count.
- Never weaken, skip or delete a test. A test may be retargeted to a replaced contract, never no-op'd.
- Do NOT run `git commit|checkout|reset|stash|clean`.
- Do NOT retune balance. Do NOT touch `src/heat.js`, `src/challenges.js`, `src/weapons.js`, or the
  `SHOP_UPGRADES`/economy tables in `src/meta.js`.
- One writer per file: `src/main.js` is yours alone (+ `index.html` for a small CSS addition; + `src/render.js`
  ONLY if you choose to paint on the shared canvas). Name every file you touched in your report.

## RECON ALREADY DONE (verified on this tree 2026-09-13 ~09:30Z by the pilot tick; trust it, re-check cheaply)
**The art EXISTS. Do not author any.** The A1 art track landed:

- `src/art/portraits.js:20` `CHARACTER_PORTRAITS` — one 32x32 integer-pixel bust per pilot, **2 idle
  frames each**, ids exactly `KNIGHT` / `WITCH` / `ROGUE` / `PALADIN`. Each asset is
  `{id, frames, palette, rows, frameCount, w, h}`; `CHARACTER_IDS` at :347; `characterPortrait(id)` at :349.
- Barrel: `src/art/index.js` re-exports `CHARACTER_PORTRAITS`, `CHARACTER_IDS`, `characterPortrait`
  (plus `CHARACTER_PORTRAITS` is in `ART_SECTIONS`). Format helpers in `src/art/format.js`.
- Art-lint already guards these assets: `test/test_art_lint.mjs`.

**The SCREEN exists but is text-only.** `src/main.js:3380` `showCharacters()` builds one text card per
pilot via `menuCard(name, sub, onclick, dim)`. It carries a fixed defect from the 0.98 feedback round:
an OWNED pilot's card must ALWAYS show `ch.desc` — the sub-line no longer swaps to the equip affordance.
**Do not regress that.** The unlock→equip-in-one-flow behaviour in that function (buy, equip, `saveProfile`)
must survive verbatim in behaviour.

Data you read from (`src/meta.js:681` `CHARACTERS`): `{id, name, unlockCost, desc, startingWeapon, skill,
startPotions, healOnChest, mods:{maxHp, maxMana, speedMult, manaCostMult}, defaultFocus}`. Current ladder:
Knight 0 / Rogue 2500 / Paladin 6000 / **Witch 9000** (she is the mana class: `manaCostMult: 0.5`,
`+50` maxMana, `-25` maxHp, `defaultFocus: 'SWARM'`). `applyCharacter(stats, id)` (`src/meta.js`, just
below `CHARACTERS`) is the PURE function the run itself uses to apply those mods — read it for the
displayed numbers so the screen cannot drift from the run.

Precedents for pixel art around a DOM overlay — read both, do NOT invent a third convention:
- the title screen: `render.js` `drawTitleScreen(g)` (canvas paint + a published geometry seam) with
  `showTitle()` in `main.js`; verified by `tools/verify_g12_title.mjs`.
- the trophy gallery: `src/render.js:1532+` (full-screen showcase painted on the canvas) with the
  gallery seam in `src/main.js:5293+`.
`src/main.js:3160` shows the existing offscreen-canvas pattern if you need to turn a grid into a
DOM-embedded canvas. `menuCard` is at `main.js:2720`, `openMenu(mode)` at `main.js:2729`.

The screen-chrome gate: `chromeOn()` at `src/main.js:4638`, `syncChrome()` at `:4641`. Per the standing
engineering rule, **every new mode must be registered there** — a mode that early-returns before the
gate is exactly how wave-23 shipped the pad layer over the intro movie.

## THE OWNER'S ASK (verbatim intent)
> "animated character selector with the pixel art for the characters."

And a live oversight-board complaint this must close (player `Neutral_flower`):
> "ok I don't see what other character ability after I buy it"

## DO
1. **Portraits, drawn from the existing art.** Every pilot entry shows its `CHARACTER_PORTRAITS` bust.
   Paint through the game's integer-pixel grid path (or the offscreen-canvas pattern), never a
   CSS-stretched bitmap. Masked/unowned pilots must still be recognisable as a designed silhouette, not
   a broken box — state what you chose.
2. **Idle animation, dt-driven and dt-parity-correct.** Advance the 2 frames on a fixed wall-clock
   period of your choosing (state it in the report). The acceptance bar is numeric: over the same
   simulated time, a 60Hz replay and a 120Hz replay must advance the SAME frame index. No animation
   loop may run while the screen is closed (no rAF/interval leak after BACK to the title).
3. **THE KIT IS VISIBLE — this is the Neutral_flower fix.** Selecting a pilot shows its full kit as
   real numbers: base HP and the modded max HP, max mana (Witch 150), speed multiplier, starting weapon
   (print BASE VOLLEY when `startingWeapon` is null), the class skill in player-facing words, starting
   potions, and the unlock price when unowned. The displayed numbers MUST be derived from the same
   data/functions the run uses (`CHARACTERS` + `applyCharacter`), not hand-typed literals: a displayed
   value that disagrees with what `startRun` actually applies is a defect, and the verify tool below has
   to prove they agree.
4. **Unlock / equip behaviour preserved exactly** (buy → equip in one flow, gold deducted by exactly the
   price, `saveProfile` persisted, unaffordable pilots dimmed and non-buyable, equipped pilot marked).
5. **Register the mode in the chrome gate.** The touch pad, joystick and key-hints must NOT render over
   the character screen; ESC/BACK returns to the title; the first-run tour must not fire over it.
6. **PHONE FIRST** (the owner plays on his phone): at 390x844 every pilot entry and the selected kit must
   be reachable and readable by real touch, with nothing clipped.

## ACCEPTANCE BAR (all must hold; the verify tool is the evidence)
- `bash /tmp/run_all.sh` => `FAIL=0`, run it 3 times. New checks may be added; none weakened.
- A NEW `tools/verify_g13_selector.mjs`, modelled on `tools/verify_g12_title.mjs` and using
  `tools/browser.mjs` `withPage({w:390,h:844,dpr:3, startupScript})` + `readShot`. It must assert, in a
  REAL browser: 4 pilot entries exist; each portrait is actually painted (a canvas `getImageData` sample
  shows non-background pixels inside the portrait box, or an equivalent pixel-level proof); the kit
  panel's numbers EQUAL what the run computes for that pilot (call the same function in-page and compare);
  a REAL tap on an unowned+affordable pilot unlocks AND equips it with gold dropping by exactly the price;
  a REAL tap on a different owned pilot equips it (`profile.equippedCharacter` changes); the frame index
  advances identically at 60Hz and 120Hz over equal sim time; `errors: []`.
- Two PNGs under `docs/art/browser-verify-2026-09-12/`: `g13-selector-phone.png` and
  `g13-selector-phone-alt.png` (a second pilot selected).
- **Disclose honestly in your report:** there is NO vision model reachable from this host, so a human
  "looks right" judgement is impossible — the bar is DOM geometry + canvas pixel samples + real taps.

## OUT OF SCOPE
- **G14 (pixel-art icons on every shop row) is NOT this task** — a later slice.
- No new art authoring. No new screens. No balance/economy changes. No renames of existing test files.

## REPORT (finish with exactly this shape)
`done: <one line>` then: the suite result with the count, the `verify_g13_selector.mjs` output, the two
PNG paths, the displayed-vs-run numbers you compared, every file you touched, and an explicit list of
what you could NOT verify.
