# HORDES — Desktop Control Surface Audit (WAVE-22c)

**Question (Sk408):** "do you think the desktop controls are good? we focused a lot on mobile today."

**Verdict: the keyboard layer is genuinely good — the mouse layer is still mostly missing.** Every key is wired through one action seam, documentation strings were verified accurate key-by-key, and the hints panel is a real desktop answer. But a mouse-only desktop player can still only click 3 things in-run (cog, ?, overlay cards) versus 9 on touch, there is no pause/ESC out of live play, and two fine-grained traps remain: the W/S mode-dependent meaning split and a flat hints list that teaches "S stats" to a MANUAL player for whom S is "down".

All line numbers verified against the working tree on 2026-09-12 (post-wave-22). Companion doc: `docs/CONTROLS_INVENTORY.md` (control-by-control inventory; this audit checks the DESKTOP experience specifically).

---

## 1. Full desktop key map, and which keys change meaning with pilot mode

Verified against the single keydown handler `src/main.js:2506-2575` (plus mode branches), skill keys `src/config.js:63,73`, and `runAction` `src/main.js:2446-2504`.

**In-run (`playing`/`finale`), AUTO pilot (the default every run starts in — `startRun` re-engages AutoPilot, `src/main.js:152-160` comment):**

| Key | Action | Evidence |
|---|---|---|
| M | Toggle pilot AUTO↔MANUAL | main.js:2548 |
| TAB | Cycle focus doctrine (preventDefault — no focus escape) | main.js:2563, 2571 |
| G | Cycle stance | main.js:2563 |
| Q | Frost Nova | main.js:2564 ← config.js:63 |
| W | Overcharge | main.js:2565 ← config.js:73 |
| E | Overcharge (alias, both modes) | main.js:2566 |
| S | Open FIELD REPORT | main.js:2561 |
| I | Open FIELD REPORT (always) | main.js:2549 |
| H / N | HP / MP potion | main.js:2567 |
| + / = / − / _ | Cycle zoom in/out | main.js:2555-2556 |
| ? / F1 | Toggle hints panel | main.js:2551 |
| WASD / arrows | **Nothing in AUTO** (movement keys checked only in MANUAL, main.js:2557-2560) |

**In-run, MANUAL pilot — keys that CHANGE meaning (the full list, verified):**

| Key | AUTO meaning | MANUAL meaning | Evidence |
|---|---|---|---|
| **W** | Fire Overcharge | Held "up" movement (Overcharge unreachable; E is the only path) | main.js:2557-2560 vs 2565; KEY_DIRS main.js:164-169 |
| **S** | Open FIELD REPORT | Held "down" movement (stats unreachable; I is the only path) | main.js:2561 gate `state.pilotMode !== 'MANUAL'` |
| A / D | Nothing | Held left / right movement | KEY_DIRS main.js:167-168 |
| (arrows) | Nothing | Held movement | KEY_DIRS main.js:165-168 |

Note the asymmetry is deliberate and internally consistent (W/S are consumed by movement exactly when movement is live), and E/I give MANUAL permanent fallbacks — but see #4 for how the hints panel misrepresents it.

**Overlay modes (each branch is exclusive in the same handler):**

| Mode | Keys | Evidence |
|---|---|---|
| intro / portal-cine | ANY key skips (cine gated by CINE.SKIPPABLE) | main.js:2508-2512 |
| draft | 1 / 2 / 3 pick cards | main.js:2513-2515 |
| evolve | 1 / 2 / 3 / 4 pick cards + NOT NOW | main.js:2516-2518 |
| dead | R retry · T title | main.js:2519-2521 |
| intermission | C or Enter continue · 1-4 click cards | main.js:2522-2527 |
| menu (sub-screens) | ESC backs out to title | main.js:2528-2529 |
| settings | ESC closes/resumes | main.js:2530-2532 |
| stats | S / ESC / I close · 1-6 click cards | main.js:2533-2539 |

**Escape summary (verified — every branch):** works in menu/settings/stats. **Does nothing in `playing`/`finale` (no branch — there is no pause), and nothing in draft/evolve/intermission/dead (forced choices/screens by design, but a player who opens stats mid-fight and presses ESC is fine, while one wanting to pause live play has no key at all).**

Verified no `ev.repeat` guard exists anywhere in the handler (searched). Practical effect is small (all actions are idempotent toggles/cycles or no-ops when unavailable — e.g. `usePotion` refuses at full HP, skills.js:40) but key-hold auto-repeat will spam focus/stance cycling.

## 2. Conflicts and dead ends (verified)

1. **Desktop has NO pause and no in-run ESC** — CONFIRMED. The playing/finale branch (main.js:2540-2573) handles no escape; the cog's settings screen is the only pause, and on desktop the cog is a 46×46px pixel-art button top-right (index.html:166-173). Mouse-only players must find a small gear to pause; keyboard players cannot pause at all without also using the mouse.
2. **W/S mode traps (real but mitigated):** a player who learned "W = Overcharge" in AUTO, toggles to MANUAL, and holds W gets silent movement instead — W fires nothing (main.js:2557-2560 consumes it as 'up' before the keyMap is reached). Mitigations that exist and were verified: E always fires Overcharge (main.js:2566), I always opens stats (main.js:2549), and swapPilotMode toasts "MANUAL PILOT — WASD / arrows or the joystick" (main.js:202). Remaining cost: the toast does not mention E-for-Overcharge, so the substitution is only discoverable via the footer/HOW TO PLAY.
3. **Movement keys are dead in AUTO with zero feedback** — a desktop player who never toggles pilot presses WASD/arrows and nothing happens, no toast, no hint. (By design — the game is an idle — but it's the most likely first-minute desktop confusion.)
4. **Menu number keys documented but unwired (minor doc bug):** the overlay footer says "1 / 2 / 3 or tap a card" (index.html:256) and HOW TO PLAY says "1 – 6 — pick cards & stat tabs" (main.js:1850), but the number keys only work in draft/evolve/intermission/stats (main.js:2513-2539). On the TITLE, SHOP, CHARACTERS, SETTINGS, and HOW TO PLAY screens there is no number branch — the footer is visible on every overlay including these (it's static in index.html:256) and is wrong there. Only ESC is wired in menus.
5. **Evolve screen key labels are wrong when there is more than one candidate (verified):** every EVOLVE card is hardcoded `<div class="key">[1]</div>` regardless of position (main.js:1650) while keys 1-4 are all wired (main.js:2516-2518). With 2+ candidates the on-screen labels lie (both say [1]). Single-candidate case is fine.
6. **Potions can be silently wasted via key-hold auto-repeat** — no `ev.repeat` guard; H at exactly full HP is refused (skills.js:40) but a repeat between 99% and 100% can burn potions faster than intended. Low severity, easy guard.
7. Not conflicts, verified clean: TAB preventDefault (no focus escape, main.js:2571); arrows/space never scroll the page (body overflow hidden, index.html:10; no branch handles space/arrows outside MANUAL movement where they're consumed); keyup always clears held dirs regardless of mode/overlay and window blur clears everything (main.js:2577-2586) — no stuck-key ghosting; draft/evolve/intermission pick via `card.click()` so keyboard and mouse run the identical path.

## 3. Mouse/pointer parity — what a mouse-only desktop player can actually click

Verified in index.html CSS + main.js (not assumed):

- **Touch layer gating:** `#touch` is `display:none; pointer-events:none` by default (index.html:85-88). Non-touch devices get class `.cog-only` (main.js:2601-2605: `hasTouch ? 'on' : 'cog-only'`, hasTouch = ontouchstart || maxTouchPoints>0). `.cog-only` shows ONLY the cog; both pads are `display:none` (index.html:98) and the joystick is force-hidden (index.html:99). The `?` help button is `button.cog.help` (index.html:200-203, 244) — matches `.cog-only button.cog { cursor: pointer }` (index.html:100), and `pointer-events: auto` on `button.cog` (index.html:172). **So desktop can click exactly two in-run buttons: the cog and the `?`.**
- **CONFIRMED UNCLICKABLE on desktop (mouse):** FOCUS, STANCE, PILOT, STATS, FROST, OVER, HP potion, MP potion — all 8 live inside `.pad` (index.html:230-242), hidden by `.cog-only .pad { display:none }` (index.html:98). Keyboard-only alternatives exist for all 8 (TAB/G/M/I or S/Q/E/H/N), but a mouse-only player (trackpad user who never touches keys, or someone expecting clickable HUD like the mobile UI promises) can do NONE of: switch pilot, change focus/stance, fire skills, drink potions, open stats mid-fight.
- **Clickable:** all overlay cards (menu/shop/draft/evolve/intermission/dead — `el.onclick`, main.js:1874 etc.), the canvas click skips cinematics (main.js:2860-2863), and the hints panel itself is `pointer-events: none` (index.html:212) so it never blocks clicks.
- Nuance worth stating: on the finale (`finale` mode) the same playing/finale branch applies, so parity is identical there.

This is the single biggest desktop gap: touch has 9 clickable in-run controls; mouse has 2. Hybrid touch laptops get everything (hasTouch true → full layer), which is correct.

## 4. Hints panel (#hints) accuracy — checked string by string

The panel is static HTML (index.html:246-251):

```
M pilot · TAB focus · G stance
Q / E skills · H / N potions
S / I stats · + / - zoom · 1-6 cards
? hide this
```

Line-by-line against the verified bindings: M✓ (2548) · TAB✓ (2563) · G✓ (2563) · Q/E skills✓ — and notably it says Q/E, NOT W, so it does NOT perpetuate the W trap (correct choice; E works in both modes) · H/N✓ (2567) · +/−✓ (2555-2556) · 1-6 cards — PARTIALLY accurate: true in draft/evolve/intermission/stats, false on title/shop/characters/settings (see #2.4) · "? hide this"✓ (2551).

**Two real problems:**

1. **Not mode-aware — CONFIRMED.** The string "S / I stats" is false in MANUAL, where S is held "down" (main.js:2561) and only I works. The panel is one static DOM block with no pilot-mode re-render (toggleHints only flips a class, main.js:2620-2628). A MANUAL player reading the panel will press S mid-fight and move down instead of opening stats. This is the exact W/S trap the CONTROLS_INVENTORY flags, now baked into the always-on default desktop HUD. It should either render "I stats (S in AUTO)" or re-render on pilot toggle.
2. **Shows in-run keys while overlays are up, and hides the actual overlay context.** `#hints` is a sibling of `#touch` (index.html:246) whose visibility is driven purely by the `hintsOn` pref class (main.js:2620-2628) — nothing hides it when a draft/intermission/death overlay opens (the overlay is a separate dimmed layer, index.html:252). So during a draft the panel still lists "Q / E skills · H / N potions", which are dead in that mode (runAction gates to playing/finale, main.js:2469), while the keys that ARE live (1-3) appear only as "1-6 cards". Cosmetic, low priority.

Otherwise the hints system itself is solid: persisted pref defaulting ON for non-touch (main.js:2614-2619), toggled by ?/F1 AND the clickable button, self-dismissing instruction in its last line.

**Footer (index.html:256) re-verified accurate** as the inventory claims, with the same two nitpicks: it's shown on menus where "1/2/3" is unwired, and "S or I stats" has the MANUAL caveat written elsewhere in the same line ("WASD+arrows manual") but not attached to the S claim.

## 5. Discoverability — the read-nothing desktop player

Layered, and reasonably deep (verified):

1. First boot pops HOW TO PLAY automatically (endIntro → showHowToPlay, main.js:2855) with an exhaustive KEYBOARD card (main.js:1845-1852 — every key including the W-in-AUTO nuance, `?`, and the mouse cog path).
2. Default-ON hints panel on non-touch (main.js:2617) — a persistent cheat sheet without reading a word of docs.
3. First-run tour: menu-card stage + in-run coach chain (updateTourCoach) naming TAB/G/S/W-vs-E/H/N/M with the cog and buttons spotlighted; intermission, death, first-settings coaches all fire from their openers (evidence cited throughout CONTROLS_INVENTORY; engine src/tour.js).
4. Point-of-use toasts: pilot toggle toasts the new mode's controls (main.js:202).
5. Overlay footer cheat line under every overlay (index.html:256).

A read-nothing player still plays fine (AUTO is the default; drafts are clickable cards), and the three highest-value secrets (TAB/G/M) are all coachmarked. The residual gaps: a player who skips the tour and closes the hints can miss focus/stance entirely (they're only visible in the canvas-HUD-less default — the doctrine state is NOT drawn on the canvas HUD; it lives only in the opt-in text HUD (main.js:2799) and the touch badges. So on desktop with TEXT HUD off, changing TAB/G gives no visible confirmation anywhere except a toast — VERIFY: I confirmed no canvas draw of focus/stance in drawHud (main.js:2743-2800); toast on cycle — I did not verify a toast exists for TAB/G; if none, this is a real feedback gap).

## 6. Desktop-specific ergonomics

- **Click-to-focus: NOT a bug here.** Keydown/keyup are registered on `window` (main.js:2506, 2580), not the canvas — keys work the instant the page loads, no canvas focus required. (Also blur clears held input, main.js:2584-2586.) Verified, not assumed.
- **No pause key** — covered in #2.1; the ergonomic cost is desktop-specific (alt-tab works via the browser but keeps the run logic-frozen only if an overlay happens to be up).
- **Mouse+keyboard mixing:** in-run, the mouse can only hit cog/? (top-right, 46px each) while all gameplay keys sit on the keyboard — fine for the design, but the cog's hover state is only `:active` (no `:hover`), so it doesn't afford clickability on desktop; minor.
- **Scroll/zoom gestures:** body is `overflow:hidden` + `user-scalable=no` (index.html:5,10) — no page scroll, no pinch artifacts; arrows/space are consumed by the MANUAL movement branch or fall through harmlessly (no default scroll because nothing scrolls). Verified.
- **F11/fullscreen:** no fullscreen handling anywhere (no requestFullscreen in src — searched keydown paths only; low confidence, but nothing in the input surface references fullscreen). Browser-default; fine.
- **Held keys across overlays:** properly cleared (keyup always processes, blur clears all — main.js:2577-2586). Good.
- **46×46px cog with no hover affordance and no tooltip** (index.html:166-173, 243) — below common 48px comfort target; it's the ONLY route to END RUN for mouse users on desktop.

---

## Ranked fixes (impact-ordered)

1. **Make the in-run HUD buttons clickable on desktop (drop `.cog-only .pad { display:none }` or add a desktop `.pad-visible` mode with pointer-events:auto, keeping them out of the joystick zone).** Highest impact: restores full mouse parity for all 8 actions (pilot/focus/stance/stats/skills/potions) that touch already has; everything is already routed through the same `runAction` seam so wiring is CSS + a class toggle, not new logic.
2. **Add ESC = pause (or an explicit P) in playing/finale that opens the settings pause screen.** Currently no keyboard pause exists at all; the settings pause contract already exists (`openSettings`, main.js:2430-2434) so this is a two-line branch.
3. **Fix the hints panel's "S / I stats" for MANUAL** (render "I stats" + "(S in AUTO)" or re-render the line on pilot toggle). The panel is default-ON on every desktop and currently teaches a key that moves you into danger in MANUAL.
4. **Show focus/stance state on the default (canvas) HUD or toast on TAB/G cycle.** With TEXT HUD off — the default — desktop players get no visible confirmation these levers did anything.
5. **Wire number keys on menu screens or scope the footer text.** The static footer (index.html:256) promises "1 / 2 / 3 or tap a card" on screens where the keys are dead (title/shop/characters/settings).
6. **Fix the evolve card `[1]` label to use the card index** (main.js:1650) — one-string fix; labels currently lie whenever 2+ evolutions are offered.
7. **Add `if (ev.repeat) return;` for potion/skill/doctrine keys** — prevents key-hold auto-repeat potion waste and doctrine spam.

## Confidence labels

- VERIFIED with certainty: full key map and mode-dependence (#1), all conflicts in #2 (no-pause/ESC, W/S traps, dead menu number keys vs footer, evolve [1] labels, TAB preventDefault, stuck-key hygiene), mouse parity set exactly = {cog, ?} in-run (#3), hints panel strings + non-mode-awareness + overlay behavior (#4), window-level keydown (no focus requirement), footer accuracy (#6).
- NOT fully verified: whether a toast fires on TAB/G focus/stance cycling (I confirmed the text-HUD line and touch badges update, but did not trace a toast in the cycle path); F11/fullscreen behavior (nothing in the input surface references it, but I did not exhaustively search render/audio code). Both flagged inline above.
