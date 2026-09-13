# G14 BRIEF - PIXEL ART FOR EVERY SHOP ROW (queue: G14, next after G13)

Self-contained. Read this whole file first, then the files it names. You are the only writer in
`/home/claude/projects/hordes` for the duration of this task (the orchestrator holds the repo lock
and owns commits).

## HOUSE RULES (non-negotiable)
- No emojis anywhere. Integer pixels only, no smoothing, no blur - `image-rendering: pixelated` on
  any scaled bitmap/canvas, integer scale factors only.
- 60Hz AND 120Hz must both be correct; NOTHING may assume a fixed dt.
- Never weaken, skip or delete a test. A test may be retargeted to a replaced contract, never no-op'd.
- Do NOT run `git commit|checkout|reset|stash|clean`.
- Do NOT retune balance. Do NOT touch `src/heat.js`, `src/challenges.js`, `src/weapons.js`, or the
  `SHOP_UPGRADES` table / prices in `src/meta.js`.
- One writer per file: `src/main.js` is yours alone (+ `index.html` for a small CSS addition).
  Name every file you touched in your report.

## RECON ALREADY DONE (verified on this tree 2026-09-13 ~10:00Z by the pilot tick; trust it, re-check cheaply)
**The art EXISTS. Do NOT author any.** The A1/A2 art track landed `src/art/shop_icons.js`:
- `SHOP_ICONS` (line 19) - one 16x16 integer-pixel icon per shop row, assets shaped
  `{id, palette, grid, rows, w, h}` built by `makeAsset` from `src/art/format.js`.
- `SHOP_ICON_IDS` (:867), `SHOP_ICON_FALLBACK_ID = '__fallback'` (:870), `shopIcon(id)` (:872,
  returns the fallback when the id is unknown).
- Coverage is COMPLETE for the current table: dmg, hp, potions, regen, thrifty, well, siphon, xp,
  crit, critdmg, greed, alchemy, scav, artifact, luck, slots, arcade, the nine
  `weapon_*` rows (volley, orbit, boomerang, zap, nova_pulse, scythe, seeker, mine, beam) and the
  three `elite_*` rows (swift, splitting, vampiric) - 29 icons + `__fallback`.
- `test/test_art_lint.mjs` already guards these assets (dims/palette/integer parity). Do not break it.
- **Nothing in `src/` imports `shop_icons.js` yet** (only the `src/art/index.js` barrel). This task is
  WIRING, not art.

**The SCREEN exists but is text-only.** `src/main.js:3350` `showShop()` builds one text row per
`SHOP_UPGRADES` entry via `menuCard(name, `${def.desc}<br>${sub}`, onclick, dim)`:
- `sub` is `'LV n/max . cost gold'` for level rows, `'OWNED' | cost + ' gold'` for `kind` rows.
- `menuCard` is at `src/main.js:2720`, `openMenu(mode)` at `:2729`.
- Level rows use `upgradeCost(def, lvl)`; `kind` rows use `def.baseCost` with `shopRowOwned(profile, def)`.
- The purchase handler MUST survive verbatim: `if (buyUpgrade(profile, def.id)) { saveProfile(profile);
  showShop(); }`, and a capped row keeps `el.onclick = () => audio.playSfx('button')`.
- **Do not regress:** the row text (name, desc, LV/MAXED/OWNED/cost) and the disabled state are the
  contract the existing tests read. Add an icon; change nothing else about the row.

**THE PATTERN TO REUSE (landed by G13 in this same file - do not invent a second convention).**
`src/main.js:3378+` (the G13 characters block) turns a pixel grid into a LIVE DOM canvas: a 32x32
backing store painted with `renderer.drawGrid(g, asset.frames[i], asset.palette, 0, 0)`, scaled by an
INTEGER factor in CSS via `.card canvas.portrait` in `index.html` with
`image-rendering: pixelated`. `paintCharPortraits()` at `:3400` and the offscreen-canvas precedent at
`src/main.js:3160` are the two references. For 16x16 shop icons an integer 2x (32px) or 3x (48px)
scale is the range; pick ONE and state it.

The screen-chrome gate: `chromeOn()` at `src/main.js:4638`, `syncChrome()` at `:4641`. If you add no
new mode you need no gate change - but if you do add one, register it, per the standing rule.

## THE OWNER'S ASK (verbatim intent)
> "all the shops get a pixel art upgrade."
Shop rows are currently text cards; each upgrade/weapon/elite entry should carry its own pixel-art icon
so shopping reads as a designed screen.

## DO
1. Import `shopIcon` (or `SHOP_ICONS` + `SHOP_ICON_FALLBACK_ID`) from the art barrel `src/art/index.js`
   (add it to that barrel's re-exports if it is not already there - the barrel is a shared file; keep
   the change additive and say so in your report).
2. In `showShop()`, prepend a 16x16 icon canvas to EVERY row, painted through `renderer.drawGrid` from
   the row's own icon (`def.id`), with `shopIcon(def.id)` as the lookup so an unknown id gets the
   authored fallback rather than an empty box. Integer scale, `image-rendering: pixelated`.
3. Add a small CSS rule in `index.html` for the icon canvas (mirror `.card canvas.portrait`), integer
   pixel size in the phone layout (the owner plays on his phone).
4. Add a `__TEST.shopIcons` seam that reports, per row id, the painted canvas size, the integer scale
   and a non-empty pixel count, so the verifier can read it without DOM scraping heuristics.
5. Add the row's icon to the BACK row? NO - BACK stays a plain text row.
6. Write `tools/verify_g14_shop_icons.mjs` on the model of `tools/verify_g13_selector.mjs` (real
   browser, CDP, 390x844 @dpr3). It must assert, from the DOM + `getImageData`, that: (a) every one of
   the 29 SHOP_UPGRADES ids renders a canvas whose painted pixels are NON-EMPTY (sum > 0) and whose
   size is an exact integer multiple of 16; (b) the fallback path paints non-empty for an unknown id;
   (c) the row text (LV/MAXED/OWNED/cost) is unchanged; (d) a REAL tap on an affordable row still
   purchases (gold delta equals `upgradeCost(def, 0)` exactly) and a capped row does not; (e) the
   chrome gate is unaffected. Save the phone PNG to
   `docs/art/browser-verify-2026-09-12/g14-shop-icons-phone.png`. No vision model is reachable from
   this host - geometry + pixel samples + real taps is the bar, never a "looks right" judgement.

## NUMERIC ACCEPTANCE BAR
- `bash /tmp/run_all.sh` => PASS >= 72, FAIL=0, three consecutive runs.
- `node tools/verify_g14_shop_icons.mjs` => PASS, with 29 row canvases each non-empty and integer-scaled,
  and an exact-gold real-tap purchase.
- `node tools/verify_g13_selector.mjs` => still PASS (do not regress the G13 surface in the same file).

## OUT OF SCOPE
- Authoring or editing art. No new icons, no re-colouring. If an icon looks wrong to you, REPORT it -
  do not fix it here.
- Any balance/price/economy change. Any change to `SHOP_UPGRADES` rows or `meta.js` tables.
- Character select, trophy gallery, title screen (all already verified; do not touch).

## REPORT SHAPE (short, facts only)
Files touched; the integer scale chosen; the suite line x3 verbatim; the verifier's PASS line; the PNG
path + dimensions; anything you could NOT verify; anything you found broken and did not fix.
