# HORDES — On-Screen Controls & Interactive Elements Inventory

**Purpose:** exhaustive list of every on-screen control/interactive element, and which ones the existing first-run tour (`src/tour.js` + the step definitions in `src/main.js`) fails to introduce. Sk408's playtest verdict: the tour "didn't have an intro" for the on-screen controls — he specifically named "style and stance and etc." This document is the acceptance list for fixing that.

**WAVE-22 (rev 4) STATUS: ACCEPTANCE MET.** Every MUST-COACHMARK item reads **YES**, every PARTIAL is resolved (both targets spotlighted), and every remaining non-tour control reads **DOC** = deliberate non-goal routed to HOW TO PLAY (now exhaustive — `showHowToPlay` gained TAB/G/W-nuance/1-6/C/R-T keys and a THE FIELD card) and/or recorded in the NON-GOALS section at the bottom. The key-hint footer (`index.html:221`) was verified accurate key-by-key against the handlers.

**WAVE-23 addendum (Sk408 playtest round 2):** (a) the tour's advance wording is now input-aware — "TAP TO CONTINUE" on touch, "CLICK OR PRESS ANY KEY" on desktop — and ANY non-Escape key advances (`src/tour.js`); main.js swallows game keys while a tour is live so one press doesn't both advance and fire a skill. All tap-only phrasing was neutralized (footer, draft/pilot/settings captions, equip/reset subs). (b) New RESOLUTION settings card (4.11b) + real-size canvas backing store. (c) The `#hints` panel and all canvas HUD text were raised in size/contrast (2.36). (d) Non-touch devices now get the full touch layer as mouse-clickable buttons (2a header, 2.9).

**Tour = two parts:** the generic engine (`src/tour.js`) and the step definitions (`src/main.js` — stage 1 menu tour, stage 2 `updateTourCoach` timed chain + event hooks in `openDraft`/`openIntermission`/`die`/`endRun`/`showSettings`). "Covered by the tour" cites those steps.

---

## 1. MENU-SCREEN controls (title screen, first load)

| # | Name | What it does | When it appears | How activated | Source | Tour? |
|---|------|--------------|-----------------|---------------|--------|-------|
| 1.1 | **PLAY** card | Starts a run | Title screen (`state.mode==='menu'`) | Tap/click the DOM card | `src/main.js:1967` (card built by `menuCard()` at `src/main.js:1825`) | **YES** — stage-1 step `PLAY` (`src/main.js:1881`) |
| 1.2 | **SHOP** card | Opens the permanent-upgrade shop (gold from every run) | Title screen | Tap/click DOM card | `src/main.js:1968` | **YES** — stage-1 step `SHOP` (`src/main.js:1883`) |
| 1.3 | **CHARACTERS** card | Unlock & equip pilots with different starting kits | Title screen | Tap/click DOM card | `src/main.js:1969` | **YES** — stage-1 step `CHARACTERS` (`src/main.js:1885`) |
| 1.4 | **SETTINGS** card | Opens settings (audio, HUD, zoom, replay tour, reset) | Title screen | Tap/click DOM card | `src/main.js:1970` | **YES** — stage-1 step `SETTINGS` (`src/main.js:1887`) |
| 1.5 | **HOW TO PLAY** card | Opens the static control reference screen | Title screen | Tap/click DOM card | `src/main.js:1971` | **YES** — stage-1 step `HOW TO PLAY` (`src/main.js:1889`) |
| 1.6 | **ESC (menu back)** | Any sub-menu backs out to the title | `state.mode==='menu'` on any sub-screen | Keyboard `Escape` | `src/main.js:2396-2397` | **DOC** — HOW TO PLAY KEYBOARD card ("ESC — close"); deliberate non-goal for the tour (universal convention) |
| 1.7 | **Intro-movie skip** | Skips the title cinematic to the menu | Only on page load (`state.mode==='intro'`) | Any key, or tap/click the canvas | key: `src/main.js:2376`; pointer: `src/main.js:2699-2702` | **DOC** — deliberate non-goal (any input skips; self-evident, and the doc says "do not rely on the movie to teach") |
| 1.8 | **MENU KEYBOARD NAVIGATION** (NEW 2026-09-19) | Walks a visible cursor over the cards of any card menu and activates the focused one — mouse-free menu operation | Every card menu: the title (`state.mode==='title'`), and the sub-screens (the manual/HOW TO PLAY, SHOP, CHARACTERS, LOADOUT, and the in-run SETTINGS pause) | **Tab** / **Shift+Tab** step forward/back; **arrows** step (Left/Right only where no pager claims them — the shop pager and the manual pager sit earlier in the keydown chain and keep their arrows); **Enter** or **Space** activates | cursor `menuFocus` + `menuFocusStep()` + `isDimCard()`; activation `menuFocusActivate()` (routes through `menuCard`'s own `onclick`, so the help-mode intercept and the sfx stay one seam); reset in `openMenu()`; keydown branch for title/menu/farewell/characters/loadout + the settings branch — all `src/main.js` | **DOC** — a keyboard affordance, not a first-minute decision. Vocabulary deliberately MATCHES `tour.js` (which already advances on Right/Enter/Space): no new letters invented |

**ALSO COVERED by 1.8 (2026-09-19, second pass):** the in-run overlays. The RUN-ENDED screen (a death, a deliberate END RUN, and the RUN SURVIVED win all land on `state.mode==='dead'`), the in-run SETTINGS pause, the FIELD REPORT (`stats`), and the EVOLVE and INTERMISSION overlays. The EVOLVE overlay was **digit-only** (it printed `[1..4]` hints and nothing else moved) and the intermission had **no** arrows at all; both now route through the same cursor, and their existing keys are unchanged — the intermission keeps `c` (and Enter==CONTINUE whenever no cursor is up, so card order cannot break that contract) and all of them keep their digit quick-picks.

The DRAFT offer row keeps its own cursor (`draftFocus`) because a draft offer is activated through `activateDraftCard`, not a card click — but it now **shares the same visible marker**, and it had the same invisible-cursor defect: `el.focus()` paints nothing on a card, so the draft cursor was never visible either. Tab now works there too.

**NOT covered by 1.8, by design:** the galleries (TROPHIES / BESTIARY / APEX) keep Left/Right *ring-stepping*; the CHEST card keeps its single `GOT IT` key (one card, nothing to move between). DIM cards (a pager end, a locked row) are **skipped** by the cursor, so Enter can never fire a card the pointer would refuse.

**PAGING IS NO LONGER ON THE ARROWS (owner 2026-09-19).** The shop and the manual used to page on Left/Right (the "desktop has no swipe" addendum). The owner found that wrong once the cursor existed — *"navigation through the shop and how to play by keyboard are a bit strange because it automatically flips the pages instead of moving across the screen. might be better to have it not flip the pages."* **Paging is now PageUp/PageDown**; the arrows belong to the cursor. The edge arrows, swipe, the PREV/NEXT cards and the page indicator are all unchanged, so a pointer-free desktop can still page. Retargeted in `test/test_manual.mjs` with the change.

**TWO-PRESS CARDS KEEP THE CURSOR.** A card whose first press re-composes the same screen (END RUN, RESET PROFILE) used to lose the selection: `openMenu` clears `ovCards` and the marker died with the old elements, so the player had to navigate back to press it again. Both are now re-marked when — and only when — the mode is unchanged and the card count is identical; a press that navigates still opens the next screen with no cursor.

**SHOP FOOTER: BACK IS ON EVERY PAGE.** `BACK` is tagged `shop-footer`, which `finalizeShopPager` excludes from the paged rows and `shopPageGoto` re-shows on every page. Untagged it was just the last card, so the row-chunker put it on the final page only. Owner: *"we still need the shop to have the back button underneath the list of buyables on each page instead of once at the end."*

**THE RADAR IS ON BY DEFAULT AND PERSISTS.** `state.radarOn` defaults **true** and the `R` key's choice is written to `hordes_radar` (the `KEY_ZOOM` pattern; an absent key keeps the default). Owner: *"when the player selects the radar to be on, it should persist. maybe we should make the radar on by default instead."* Defaulting it ON exposed a latent crash: `drawRadar` reached for `this.canvas.ownerDocument` and **threw** on any canvas stub that defines neither that nor `OffscreenCanvas` — invisible while the radar defaulted off, 19 headless tests when it didn't. `render.js` now skips the radar plate gracefully instead (unreachable in a browser, and the WAVE-27 "never touch the DOM global" pin is kept). `test/test_radar_wiring.mjs` retargeted with the change.

Note: the tour doc's "mode select (IDLER vs STORY)" and "division/chip selector" have **no on-screen elements** in the shipped game (confirmed `src/main.js:1849-1851` comment); they are correctly absent from both the UI and the tour.

---

## 2. IN-RUN HUD / controls (`state.mode==='playing'` or `'finale'`)

### 2a. Touch-layer DOM buttons (`#touch`; `index.html:201-216`, handlers `src/main.js:2521-2534`). WAVE-23 (#6): non-touch devices get the FULL layer via `.cog-only` — the pads are real mouse-clickable buttons (cursor pointer/grab), no more 0x0 px ghosts; the joystick mouse-drags when MANUAL is bound.

| # | Name | What it does | When it appears | How activated | Source | Tour? |
|---|------|--------------|-----------------|---------------|--------|-------|
| 2.1 | **FOCUS** button (`tc-focus`) | Cycles volley targeting doctrine: NEAREST → TOUGHEST → SWARM → RANGED; badge shows current mode | Touch layer, in-run only (layer visible on touch devices; `src/main.js:2557`) | Tap DOM button `data-act="focus"` | `index.html:203`; action `src/main.js:2338`; badge update `src/main.js:2568` | **YES** — WAVE-22 coachmark `focus` (t>7s, `updateTourCoach`): spotlights the real `tc-focus` button, names TAB, teaches the four doctrines ("the headline gap" closed) |
| 2.2 | **STANCE** button (`tc-stance`) | Cycles risk dial SAFE → BALANCED → GREEDY (kite distance vs loot greed) | Touch layer, in-run only | Tap DOM button `data-act="stance"` | `index.html:204`; action `src/main.js:2339`; badge `src/main.js:2569` | **YES** — WAVE-22 coachmark `stance` (t>10s): spotlights `tc-stance`, names G, framed as a choice ("pick the run you want"), not a setting |
| 2.3 | **PILOT** button (`tc-pilot`) | Toggles AUTO ↔ MANUAL pilot; badge shows current mode | Touch layer, in-run only | Tap DOM button `data-act="pilot"` | `index.html:205`; action `src/main.js:2332-2334`; toggle `src/main.js:204-206` | **YES** — stage-2 coachmark `pilot` (`src/main.js:1926-1929`, "PILOT: AUTO flies for you — tap here (or M)...") |
| 2.4 | **STATS** button (`tc-stats`) | Opens the FIELD REPORT (loadout/gear/stats overlay); pauses the sim | Touch layer, in-run only | Tap DOM button `data-act="stats"` | `index.html:206` (id added WAVE-22); action `src/main.js:2319-2323`; opener `src/main.js:2227` | **YES** — WAVE-22 coachmark `stats` (t>22s): spotlights `tc-stats` via `statsTarget()` (falls back to the loadout canvas region on keyboard-only devices), names the STATS button + I |
| 2.5 | **FROST** skill button (`tc-q`) | Fires Frost Nova (AoE freeze/slow, 30 mana); badge shows cooldown or RDY/LOW; label carries the `[Q]` key cap (WAVE-28) | Touch layer, in-run only | Tap DOM button `data-act="q"` (multi-touch safe) | `index.html:211`; action `src/main.js:2340` | **YES** — stage-2 coachmark `skills` step 1 (t>16s, targets `tc-q`) |
| 2.6 | **OVER** skill button (`tc-w`) | Fires Overcharge (attack-rate buff, 25 mana); badge shows cooldown/RDY; label carries the `[E]` key cap (WAVE-28 — the letter is the key the game shares with MANUAL, see 2.14) | Touch layer, in-run only | Tap DOM button `data-act="w"` | `index.html:212`; action `src/main.js:2341` | **YES** — WAVE-22: `skills` is now a TWO-step coach; step 2 spotlights `tc-w` itself and names the W-in-AUTO / E-always subtlety |
| 2.7 | **HP potion** button (`tc-h`) | Drinks a health potion (heals 35 base; halved during a boss); badge = carried count, max 3 | Touch layer, in-run only | Tap DOM button `data-act="h"` | `index.html:212`; action `src/main.js:2342-2359` | **YES** — `potions` coach step 1 (t>19s, targets `tc-h`, names H) |
| 2.8 | **MP potion** button (`tc-n`) | Drinks a mana potion (restores 40 base); badge = carried count, max 3 | Touch layer, in-run only | Tap DOM button `data-act="n"` | `index.html:213`; action `src/main.js:2360-2371` | **YES** — WAVE-22: `potions` is now a TWO-step coach; step 2 spotlights `tc-n` itself and names the N key |
| 2.9 | **Settings cog** (`tc-cog`) | Opens the in-run SETTINGS pause screen (zoom, END RUN, audio, replay tour) | In-run, pinned top-right — **all devices** since WAVE-22b: touch devices get the full layer, non-touch devices get `.cog-only` (cog alone, mouse-clickable; pads/joystick stay touch-only) | Tap/click DOM button `data-act="settings"` | `index.html:215` (CSS cog `index.html:151-186`, `.cog-only` rules); JS gate `src/main.js` (hasTouch → `on` / else `cog-only`); action `src/main.js:2325-2329`; opener `src/main.js:2300-2304` | **YES** — stage-2 coachmark `cog` (t>25s); HOW TO PLAY KEYBOARD card now notes the mouse path |

### 2b. Joystick (touch, MANUAL only)

| # | Name | What it does | When it appears | How activated | Source | Tour? |
|---|------|--------------|-----------------|---------------|--------|-------|
| 2.10 | **Joystick** (`#joy` + `#joy-knob`) | Analog movement in MANUAL pilot: drag vector = direction, deflection = speed (15% dead zone, release recenters); pointer captured by ID so other fingers work the buttons | Only while `pilotMode==='MANUAL'` in-run (`src/main.js:2562-2564`) | Touch-drag on the 120px base (`data-joy="1"`); pointerdown captures, move steers, up/cancel recenters | `index.html:208,108-139`; handlers `src/main.js:2481-2551`; controller `src/controllers.js:225-256`, `JOY_DEAD_ZONE` `src/controllers.js:223` | **YES** — stage-2 coachmark `move` (`src/main.js:1930-1933`, targets `joyTarget()` = the joy element or its screen region `src/main.js:1909-1913`) |

### 2c. Keyboard controls (in-run)

| # | Name | What it does | When it appears | How activated | Source | Tour? |
|---|------|--------------|-----------------|---------------|--------|-------|
| 2.11 | **WASD / arrow keys** | MANUAL movement (digital, mag 1; diagonals normalized) | In-run, effective only in MANUAL | Hold keys | `src/main.js:168-173` (KEY_DIRS), `2423-2426`; keyup clears `src/main.js:2446-2449` | **YES** — named in the `move` coachmark text (`src/main.js:1932`) |
| 2.12 | **M** — pilot toggle | Same as the PILOT button: AUTO ↔ MANUAL mid-run | In-run (playing/finale) | Press `M` | `src/main.js:2416` | **YES** — named in the `pilot` coachmark text (`src/main.js:1928`) |
| 2.13 | **Q** — Frost Nova | Fires Frost Nova | In-run | Press `Q` (`C.SKILLS.FROST_NOVA.KEY`) | `src/main.js:2430`; config `src/config.js:63` | **YES** — `skills` coachmark (`src/main.js:1936`) |
| 2.14 | **W / E** — Overcharge | Fires Overcharge (W works in AUTO; E works in both — W is "up" in MANUAL) | In-run | Press `W` (AUTO) or `E` (always) | `src/main.js:2431-2432`; config `src/config.js:73` | **YES** — WAVE-22: `skills` step 2 caption is "OVERCHARGE (E — or W in AUTO) speeds your fire"; HOW TO PLAY names it too |
| 2.15 | **H / N** — potions | Drinks HP / MP potion (same seam as the buttons, incl. boss-curse halving) | In-run | Press `H` / `N` | `src/main.js:2342-2371`, keyMap `src/main.js:2433` | **YES** — WAVE-22: both potion coach steps name their key ("Button, or H" / "Button, or N") — no more touch-only "tap to drink" framing |
| 2.16 | **TAB** — focus doctrine | Cycles FOCUS (NEAREST/TOUGHEST/SWARM/RANGED) | In-run (playing/finale) | Press `Tab` (preventDefault) | `src/main.js:2429,2437` | **YES** — named in the `focus` coachmark |
| 2.17 | **G** — stance dial | Cycles STANCE (SAFE/BALANCED/GREEDY) | In-run (playing/finale) | Press `G` | `src/main.js:2429` | **YES** — named in the `stance` coachmark |
| 2.18 | **I** — Field Report | Opens the stats overlay. `I` is the ONE stats key in EVERY mode (owner rule, 2026-09-13); `S` is held "down" movement in MANUAL and never opens a screen | In-run | Press `I` | `src/main.js:3965` (close), opener via `openStats` | **YES** — named in the `stats` coachmark |
| 2.19 | **+ / −** — zoom | Cycles world zoom live (1/2/3/4/6/8 ladder) without opening settings | In-run | Press `+`/`=` or `-`/`_` | `src/main.js:2421-2422`; `cycleZoom` `src/main.js:1766-1772` | **DOC** — HOW TO PLAY KEYBOARD card + footer; deliberate non-goal for the tour (not a first-minute decision, per the rev-4 doc's explicit non-goals list) |

### 2d. Canvas HUD readouts (non-interactive but tour-relevant)

| # | Name | What it does | When it appears | How activated | Source | Tour? |
|---|------|--------------|-----------------|---------------|--------|-------|
| 2.20 | **HP bar** | Player health (red, 110px, damage-flash segment) | Always in-run, canvas top-left | — (readout; damage/heal moves it) | `src/render.js:863` (`drawBar` 844-862) | **YES** — the `hud` coachmark ("Health and XP, top-left", `src/main.js:1922-1925`, spotlight `canvasRegion(0,4,150,44)`) |
| 2.21 | **Mana bar** | Skill mana pool (blue) | Always in-run, canvas top-left | — (readout) | `src/render.js:864` | **YES** — WAVE-22: the `hud` caption now reads "Health, mana and XP, top-left" (was inside the rect but unnamed) |
| 2.22 | **XP bar + LV badge** | Progress to next level (drafts); 150px gold bar with level number | Always in-run | — (readout) | `src/render.js:866-891` | **YES** — named in the `hud` coachmark text |
| 2.23 | **Manual-pilot "M" badge** | Tiny canvas M plate beside the bars showing MANUAL is bound | Only while `pilotMode==='MANUAL'` | — (status readout) | `src/main.js:2652-2660` | **DOC** — non-goal (passive readout; the `pilot` coach already teaches M) |
| 2.24 | **Event feed** (toasts) | Last 3 event lines (finds, chests, buffs) fading under the bars | Always in-run | — (readout) | `src/render.js:893-915`; stream `src/main.js:1462-1465` | **DOC** — non-goal (passive readout, self-explanatory) |
| 2.25 | **Weapon icon row** | Owned weapons, levels, per-weapon XP progress, gold frame when evolved | Always in-run, canvas bottom-left | — (readout; see 4.16 stats) | `src/render.js:938-975` | **DOC** — non-goal (passive readout; the `stats` coach opens the FIELD REPORT where the same info is itemized) |
| 2.26 | **Item icon row** | Equipped rare items as rarity-tinted gems | Always in-run, above weapon row | — (readout) | `src/render.js:917-936` | **DOC** — non-goal (passive readout; detail lives in FIELD REPORT) |
| 2.27 | **Weather glyph** | Current weather icon, canvas top-right | Always in-run (when weather active) | — (readout) | `src/render.js:977-991` | **DOC** — non-goal (ambient) |
| 2.28 | **Text HUD** (`#hud`) | Legacy full-stats text block (opt-in, off by default; includes potions/focus/stance/pilot/wave/kills lines) | In-run, only if TEXT HUD setting is ON | — (readout; toggle in settings 4.10) | `index.html:24-29,200`; drawn `src/main.js:2634-2648`; toggle `src/main.js:2056-2060` | **DOC** — non-goal (opt-in legacy readout; the settings card is self-labeled) |
| 2.29 | **Arena boundary / walls** | Painted stone rim at the ±600 clamp so the wall doesn't read as a bug | Always in-run (visible near edges) | — (environment) | `src/render.js:1033+` (drawArenaWall); clamp `src/main.js` update | **YES** — stage-2 coachmark `edge` (`src/main.js` `updateTourCoach`) |
| 2.30 | **Overlay key-hint footer** | Static line under every overlay: "1/2/3 or pick a card · TAB focus · G stance · Q frost / E overcharge · H/N potions · M pilot (WASD+arrows manual) · +/- zoom · I stats · ESC close / pause · ? key hints · or the on-screen buttons" | Visible whenever the overlay is up (menus/drafts/death) | — (static text, not a control) | `index.html:221` | **VERIFIED** (WAVE-22; re-verified WAVE-23 after the "tap a card"→"pick a card" wording neutralization) — every key on the line checked against the handlers: all accurate. Non-goal as a tour target (static cheat line) |

### 2e. In-run world interactables (proximity-activated, no button)

| # | Name | What it does | When it appears | How activated | Source | Tour? |
|---|------|--------------|-----------------|---------------|--------|-------|
| 2.31 | **Chests** | Walk within PICKUP_RADIUS (14px) to pop: item / upgrades / gamble (50% nothing + mini-horde); despawn after 30s; drift toward the player | Random drop on elite-ish kills (35%), max 3 on field | Walk into it (autopilot or manual) | `src/chests.js:22-34,138+`; drift `src/main.js:1302-1307` | **YES** — WAVE-22 coachmark `chest`: fires the moment the first chest exists, spotlights it ON THE FIELD via `worldRegion()` (cam+zoom projection) |
| 2.32 | **Wave portal** | Walk in to clear the wave → intermission; toast "THE PORTAL OPENS - WALK THROUGH" | After the wave's boss dies | Walk into it (portal chases the player) | `src/main.js:1294-1295`; chase `src/main.js:881-899` | **YES** — WAVE-22 coachmark `portal`: fires when the portal spawns, spotlights it in-world |
| 2.33 | **Arches** | Gates that grant timed buffs when crossed (SWIFT/BERSERK etc.); lean toward the player at ~6px/s | Spawned per wave (`spawnWaveArches`) | Walk through | `src/main.js:1313-1318`; buffs tracked as `state.archBuffs` (HUD "ARCH" line `src/main.js:2629-2633`) | **YES** — WAVE-22 coachmark `arch` (t>2s gate so the gauges intro goes first — arches exist from wave start) |
| 2.34 | **Shrines** | Proximity altar (<26px) that auto-buys one random blessing for gold; toasts the result ("THE SHRINE REQUIRES N GOLD" if broke) | ~60% of waves, one per wave | Walk near it with enough gold | `src/main.js:1325-1352`; `src/shrines.js` | **YES** — WAVE-22 coachmark `shrine`: fires on the wave's first unused shrine |
| 2.35 | **Portal-entry cinematic skip** | Skips the post-boss movie | Only in `state.mode==='portal-cine'` | Any key or tap/click the canvas | `src/main.js:2377-2380, 2699-2702` | **DOC** — non-goal (any input skips; same convention as the intro skip) |
| 2.36 | **"?" hints button + panel** (WAVE-22c; legibility WAVE-23 #6) | Toggles the compact on-screen key list (`#hints`, top-right under the cog) — the desktop answer to touch's self-labeled buttons. WAVE-23: 14px full-contrast `#e8e8f0` text with a black knock-out shadow on a 0.88-dark plate (was ~11px low-grey — the least readable thing on screen). Persisted pref (`hordes_hints`); default ON for non-touch, OFF for touch | In-run, all devices (button rides the touch layer incl. `.cog-only`) | Tap/click `tc-help` (`data-act="help"`), or press `?` / `F1` in-run | DOM `index.html` (`#hints`, `#tc-help`); CSS `.cog.help` + `#hints`; seam `src/main.js` `runAction('help')` → `toggleHints()`; key branch in the playing/finale handler | **YES** — self-introducing (the panel's last line is "? hide this"); footer + HOW TO PLAY name the `?` key |

---

## 3. AUTOPILOT LEVERS (doctrine controls — available in BOTH pilot modes)

The two "general vs. pilot" levers. State lives on the controller (`src/controllers.js:12-13,31-51`); tuning in `src/config.js:94-103` (STANCES: SAFE kite x2.0, BALANCED x1.0, GREEDY x0.5 + loot weight 0.65; FOCUS_RANGE 260).

| # | Name | What it does | When it appears | How activated | Source | Tour? |
|---|------|--------------|-----------------|---------------|--------|-------|
| 3.1 | **FOCUS lever** | Which enemy the auto-aim volley targets: NEAREST / TOUGHEST (highest max-hp in 260px) / SWARM (densest cluster) / RANGED (nearest SPITTER/WARLOCK at any range) | Always in-run; on HUD via the FOCUS touch button badge + text-HUD line | `TAB` key or the FOCUS touch button | Modes `src/controllers.js:12`; `cycleFocus` `src/controllers.js:43-46`; `pickTarget` `src/controllers.js:55-98`; keys `src/main.js:2429`; touch `index.html:203` | **YES** — WAVE-22 coachmark `focus` (t>7s): "FOCUS steers your volleys: NEAREST, TOUGHEST, SWARM or RANGED — cycle with TAB." The headline gap is closed |
| 3.2 | **STANCE lever** | Risk appetite for kiting vs. looting: SAFE / BALANCED / GREEDY — sets kite distance multiplier, XP-drift speed, and GREEDY's loot-vs-flee blend weight | Always in-run; on HUD via the STANCE touch button badge + text-HUD line | `G` key or the STANCE touch button | `STANCES` `src/controllers.js:13`; `cycleStance` `src/controllers.js:48-51`; behavior `src/controllers.js:109-207`; config `src/config.js:98-102`; keys `src/main.js:2429`; touch `index.html:204` | **YES** — WAVE-22 coachmark `stance` (t>10s): "STANCE is how bold you fly: SAFE kites far, GREEDY hugs the loot. G cycles — pick the run you want." (taught as a choice, per the doc) |
| 3.3 | **AUTO auto-drink** (not a player control — the pilot spends the player's potions) | In AUTO only, the pilot drinks an HP potion once HP is strictly below WHAT THE POTION WOULD HEAL (`HP_HEAL` x the healMult the drink applies — Alchemy + choice potionHealMult; owner msg_01M2RE1V 2026-09-17, the `HP_FRACTION`-of-max knob is retired), and an MP potion once mana is strictly below `MP_FRACTION` AND a skill is off cooldown but short of its cost. One drink per kind per `COOLDOWN` seconds; never at or above a line, never at 0 count. MANUAL is untouched. It never reads or writes the stance, so the BOSS_STANCE ease and the kite/retreat logic are unaffected | In-run, AUTO pilot only | automatic | `CONFIG.AUTOPILOT.AUTO_DRINK` `src/config.js` (HP gate computed in `autoDrinkPotions`); `autoDrinkPotions` + the shared potion seam (`drinkHealthPotion`/`drinkManaPotion`) `src/main.js` (called from both resource seams of `update`/`updateFinale`); proof `test/test_autodrink.mjs` + `test/test_potion_tune.mjs` | **DOC** — no coachmark: a passive behaviour with no button, and the AUTO hints line already frames the pilot as flying for you |

---

## 4. MENU / OVERLAY SCREENS (sub-screens reached from the title or mid-run)

### 4a. HOW TO PLAY (`showHowToPlay`, auto-pops once on first boot)

| # | Name | What it does | When it appears | How activated | Source | Tour? |
|---|------|--------------|-----------------|---------------|--------|-------|
| 4.1 | **TOUCH card** | Static reference for every touch control (joystick, FOCUS, STANCE, PILOT, STATS, skills, potions, cog) | HOW TO PLAY screen (first boot + title menu) | Tap (informational; click plays sfx only) | `src/main.js` `showHowToPlay` | **DOC** — this screen IS the exhaustive reference (rev-4 design rule); stage-1 spotlights the HOW TO PLAY card itself. Non-goal as a tour target |
| 4.2 | **KEYBOARD card** | Static reference for every key (now incl. TAB, G, W-in-AUTO, 1-6, C, R/T) | HOW TO PLAY screen | Tap (informational) | `src/main.js` `showHowToPlay` | **DOC** — WAVE-22 made it exhaustive vs this inventory (TAB/G and the W nuance were missing; 1-6/C/R-T lines added) |
| 4.3 | **GOT IT card** | Dismisses onboarding, sets the once-flag, returns to title | HOW TO PLAY screen | Tap/click | `src/main.js:1818-1821` | **DOC** — non-goal (self-evident dismiss) |
| 4.3b | **THE FIELD card** (WAVE-22) | Reference for the non-button world: chests, portal, arches, shrines, intermission economy, evolve tokens | HOW TO PLAY screen | Tap (informational) | `src/main.js` `showHowToPlay` | **DOC** — carries the exhaustive interactables list the tour only coaches once each |

### 4b. SHOP (`showShop`)

| # | Name | What it does | When it appears | How activated | Source | Tour? |
|---|------|--------------|-----------------|---------------|--------|-------|
| 4.4 | **Upgrade/unlock rows** (e.g. weapon & elite unlocks, stat lines) | Buys permanent profile upgrades or single-purchase unlocks with gold; dimmed when unaffordable/maxed | SHOP screen | Tap/click a card | `src/main.js:1980-2001`; purchase path `src/meta.js` (`buyUpgrade`) | **DOC** — deliberate non-goal (rev-4 explicit list: shop contents are reference, not first-minute decisions); stage 1 spotlights the SHOP card |
| 4.5 | **BACK card** | Returns to title (ESC also works) | SHOP screen | Tap/click or `ESC` | `src/main.js:2002` | **DOC** — non-goal (self-evident; ESC documented in HOW TO PLAY) |

### 4c. CHARACTERS (`showCharacters`)

| # | Name | What it does | When it appears | How activated | Source | Tour? |
|---|------|--------------|-----------------|---------------|--------|-------|
| 4.6 | **Character cards** | Unlock (buy, auto-equips) or equip a pilot; "EQUIPPED"/"tap to equip"/cost sub-line | CHARACTERS screen | Tap/click a card | `src/main.js:2010-2033` | **DOC** — non-goal (rev-4 explicit list); stage 1 spotlights the CHARACTERS card |
| 4.7 | **BACK card** | Returns to title | CHARACTERS screen | Tap/click or `ESC` | `src/main.js:2034` | **DOC** — non-goal (self-evident) |

### 4d. SETTINGS (`showSettings`, title or in-run via the cog)

| # | Name | What it does | When it appears | How activated | Source | Tour? |
|---|------|--------------|-----------------|---------------|--------|-------|
| 4.8 | **MUSIC card** | Toggles music ON/OFF | SETTINGS (always) | Tap/click | `src/main.js:2048-2051` | **DOC** — non-goal (rev-4 explicit list: settings contents) |
| 4.9 | **SFX card** | Toggles sound effects ON/OFF | SETTINGS (always) | Tap/click | `src/main.js:2052-2055` | **DOC** — non-goal (same) |
| 4.10 | **TEXT HUD card** | Opts in to the legacy text HUD readout | SETTINGS (always) | Tap/click | `src/main.js:2056-2060` | **DOC** — non-goal (same) |
| 4.11 | **ZOOM card** | Cycles world zoom (same 1/2/3/4/6/8 ladder; also +/- live in-run) | SETTINGS (always) | Tap/click | `src/main.js:2061-2065` | **DOC** — zoom documented in HOW TO PLAY + footer; tour non-goal per rev-4 |
| 4.11b | **RESOLUTION card** (WAVE-23) | Cycles pixel-scale mode AUTO (fit window) / PIXEL-PERFECT (integer snap, uniform art pixels) / 2x / 3x / 4x; sizes the canvas backing store to the real displayed pixels (CSS×dpr) so canvas text rasterizes crisp; persisted `hordes_resolution`, re-fits live | SETTINGS (always), right after ZOOM | Tap/click | `src/main.js` (`RES_MODES`/`displayScale`/`fitCanvas` + the card); backing store `src/render.js` `resize()` | **DOC** — self-labeled with the current mode; perf note on the forced modes ("integer scale, pricier") |
| 4.12 | **REPLAY TOUR card** | Clears all tour flags and restarts the walkthrough | SETTINGS (always) | Tap/click | `src/main.js:2066-2075` | **DOC** — non-goal (self-labeled) |
| 4.13 | **RESET PROFILE / CONFIRM RESET?** | Two-tap-armed profile wipe (gold, upgrades, unlocks) | SETTINGS (always) | Tap twice to confirm | `src/main.js:2076-2084` | **DOC** — non-goal (destructive control; deliberately quiet) |
| 4.14 | **END RUN / CONFIRM END RUN?** | Two-tap-armed early exit that banks gold and ends the run | SETTINGS, **only when opened in-run** via the cog | Tap twice to confirm | `src/main.js:2088-2096`; `endRun` `src/main.js:1682-1701` | **YES** — WAVE-22 resolved the PARTIAL: a one-time `settings` coachmark fires on the FIRST in-run settings visit and spotlights the real END RUN card ("two taps to confirm"); the `cog` coach still names it at t>25s |
| 4.15 | **BACK card** (in-run variant) | Resumes the paused run | SETTINGS opened in-run | Tap/click or `ESC` | `src/main.js:2099` (in-run), close `src/main.js:2305-2309`, ESC `src/main.js:2398-2400` | **DOC** — non-goal (self-evident) |

### 4e. FIELD REPORT / stats (`openStats`)

| # | Name | What it does | When it appears | How activated | Source | Tour? |
|---|------|--------------|-----------------|---------------|--------|-------|
| 4.16 | **WEAPONS / ITEMS / SYNERGIES / THE NUMBERS cards** | Read-only loadout detail: weapons + evolutions, equipped items + affixes, active synergies, rampage/core stats | FIELD REPORT overlay (I key or STATS button) | Tap/click (informational) | `src/main.js:2252,2264,2272,2276` | **DOC** — the screen is introduced by the `stats` coachmark (2.4/2.18); the informational cards are non-goals |
| 4.17 | **CLOSE card** | Resumes the run (S/ESC/I also) | FIELD REPORT overlay | Tap/click, or `S`/`ESC`/`I` | `src/main.js:2285`; keys `src/main.js:2401-2403` | **DOC** — non-goal (self-evident; S/ESC/I in HOW TO PLAY) |
| 4.18 | **Card number keys 1-6** | Clicks the Nth overlay card from the keyboard | FIELD REPORT overlay | Press `1`-`6` | `src/main.js:2404-2407` | **DOC** — WAVE-22: HOW TO PLAY now says "1 – 6 — pick cards & stat tabs"; footer carries "1/2/3 or tap a card" |

### 4f. DRAFT / level-up (`openDraft`)

| # | Name | What it does | When it appears | How activated | Source | Tour? |
|---|------|--------------|-----------------|---------------|--------|-------|
| 4.19 | **Draft cards** (3) | The run's build decisions: new weapons / weapon level-ups / stat cards (tapered repeats) | On every level-up (`state.mode==='draft'`) | Tap/click a card, or press `1`/`2`/`3` | cards `src/main.js:1536-1541`; keys `src/main.js:2381-2383`; pick `src/main.js:1575-1592` | **YES** — stage-2 coachmark `draft` fired from `openDraft`; WAVE-22 caption now names the keys ("Tap a card or press 1 / 2 / 3") |

### 4g. EVOLUTION (`maybeOpenEvolve`)

| # | Name | What it does | When it appears | How activated | Source | Tour? |
|---|------|--------------|-----------------|---------------|--------|-------|
| 4.20 | **EVOLVE card(s)** | Spends a token to evolve a maxed weapon (needs Lv8 + item kind + token) | When a weapon qualifies (`state.mode==='evolve'`) | Tap/click, or press `1`-`4` | `src/main.js:1624-1644`; keys `src/main.js:2384-2386` | **DOC** — THE FIELD card documents tokens evolving maxed weapons; the screen is self-labeled (EVOLVE / NOT NOW). Non-goal per rev-4 |
| 4.21 | **NOT NOW card** | Declines, keeps the token; re-offered on next token/item | EVOLUTION screen | Tap/click | `src/main.js:1646-1649` | **DOC** — non-goal (self-labeled decline) |

### 4h. INTERMISSION / wave cleared (`openIntermission`)

| # | Name | What it does | When it appears | How activated | Source | Tour? |
|---|------|--------------|-----------------|---------------|--------|-------|
| 4.22 | **CONTINUE card** | Starts the next wave | After walking through the portal (`state.mode==='intermission'`) | Tap/click, or `C`/`Enter` | `src/main.js:467`; keys `src/main.js:2390-2391` | **YES** — WAVE-22 intermission coach (once, first intermission): step 1 spotlights the real CONTINUE card, names C / Enter |
| 4.23 | **BRONZE / SILVER / GOLD CHEST cards** | Gold gamble for an item (40%/25%/10% nothing); dimmed when broke; Merchant's Pact surcharge shown as "CURSED PRICES" | Intermission | Tap/click | `src/main.js:468-475`; tiers `src/loot.js:251-256` | **YES** — intermission coach step 2 spotlights the BRONZE card and states the real odds (40 / 25 / 10% nothing by tier) |
| 4.24 | **Blessing/curse offer cards** | Take the wave's rolled blessing/curse (applies run choice) | Intermission (1+ per wave) | Tap/click, or `1`-`4` | `src/main.js:482-486`; keys `src/main.js:2392-2395` | **YES** — intermission coach step 3 spotlights the first blessing card ("free run powers — take one each wave, or leave it") |
| 4.25 | **RAISE THE STAKES card** | +1 heat (harder, faster foes) in exchange for a permanent run gold multiplier; hidden at heat cap (20) | Intermission, while heat < HEAT_CAP | Tap/click | `src/main.js:490-500`; `HEAT_CAP` `src/heat.js:22` | **YES** — intermission coach step 4 spotlights the card and explains the trade |

### 4i. End-of-run screens (death / END RUN / maw slain)

| # | Name | What it does | When it appears | How activated | Source | Tour? |
|---|------|--------------|-----------------|---------------|--------|-------|
| 4.26 | **RETRY card** | Immediately starts a new run | Death / RUN ENDED / maw screens (`state.mode==='dead'`) | Tap/click, or press `R` | `src/main.js:1698,1727,2938`; key `src/main.js:2388` | **YES** — WAVE-22 death coach (once, first death/end-run; fires from both `die()` and `endRun()`): spotlights RETRY, names R and T, teaches "every death funds the next run" |
| 4.27 | **TITLE card** | Returns to the title menu (gold kept) | Same screens | Tap/click, or press `T` | `src/main.js:1699,1728,2939`; key `src/main.js:2389` | **YES** — named in the same death coach caption ("TITLE (T) to spend it") |

---

## RESOLVED (WAVE-22, rev 4) — former gaps, now closed

The fix list below is implemented; the coverage column above is the per-control record.

1. **FOCUS lever** — coachmark `focus` (t>7s): real `tc-focus` button + TAB named.
2. **STANCE lever** — coachmark `stance` (t>10s): real `tc-stance` button + G named, framed as a choice.
3. **STATS / FIELD REPORT** — coachmark `stats` (t>22s): button (or loadout region fallback) + I named.
4. **Zoom** — remains a tour non-goal BY DESIGN (rev-4 explicit list); documented in HOW TO PLAY + verified footer.
5. **World interactables** — coaches `chest` / `portal` / `arch` / `shrine`, each firing the moment the thing first exists, spotlighting it in-world via `worldRegion()` (cam + zoom projected through `canvasRegion`).
6. **Intermission** — one-time 4-step coach from `openIntermission`: CONTINUE (C/Enter), paid chests with real odds, blessings, RAISE THE STAKES.
7. **End-of-run** — one-time death coach from `die()` + `endRun()`: RETRY (R) / TITLE (T), "every death funds the next run".
8. **END RUN card PARTIAL** — one-time `settings` coach on first in-run settings visit spotlights the two-tap card.
9. **Dual-target PARTIALs** — `skills` and `potions` are now TWO-step coaches (both buttons get their own spotlight); W-in-AUTO and H/N keys are named.
10. **Draft keys** — draft caption names 1 / 2 / 3.

## DELIBERATE NON-GOALS (recorded per the rev-4 acceptance bar)

Controls intentionally NOT coachmarked — each is either documented in HOW TO PLAY (made exhaustive WAVE-22: TAB, G, W-in-AUTO, 1-6, C, R/T, THE FIELD card) and/or the verified key-hint footer, or is self-evident at point of use:

- **Menu/sub-screen contents**: SHOP rows (4.4-4.5), CHARACTERS (4.6-4.7), SETTINGS contents (4.8-4.13, 4.15), HOW TO PLAY contents (4.1-4.3b) — reference material, per the rev-4 design rule; stage 1 spotlights the cards that open these screens.
- **Evolution screen** (4.20-4.21) — self-labeled EVOLVE / NOT NOW; tokens documented in THE FIELD card.
- **FIELD REPORT cards** (4.16-4.18) — informational; the screen is introduced by the `stats` coach; 1-6 keys documented.
- **Zoom** (`+`/`-` 2.19, ZOOM card 4.11) — not a first-minute decision; documented in HOW TO PLAY + footer.
- **Cinematic skips** (1.7, 2.35) — any input skips both movies; self-evident.
- **ESC behaviors** (1.6, 4.15, 4.17) — universal convention; documented in HOW TO PLAY.
- **Passive HUD readouts** (2.23-2.28: M badge, event feed, weapon/item rows, weather glyph, text HUD) — readouts, not controls; the detail lives in the FIELD REPORT.
- **Key-hint footer** (2.30) — static cheat line, not a tour target; contents VERIFIED accurate WAVE-22.
