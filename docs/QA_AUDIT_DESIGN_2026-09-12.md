# HORDES — INDEPENDENT DESIGN-PASS AUDIT (WAVE-26)

**Verifier:** Agent H (independent, read-only)
**Repo:** `/home/claude/projects/hordes` @ `eb87d23` ("wave-26: design pass")
**Date:** 2026-09-12
**Method:** every `test/*.mjs` run individually via `node`; source read line-by-line; four
independent runtime probes driving the REAL module (`test/_harness.mjs` + `node`) written to
`/tmp` (no repo writes); one real-browser pass (`python3 -m http.server` + Camofox/CDP) of the
live run, desktop pads, ESC pause and intro chrome.

Constraint honoured: no source/test/config/doc modified. `git status` at end = clean except the
pre-existing untracked `docs/HORDES_GOALS_2026-09-12.md`. No `git commit/checkout/reset/stash/clean`.

---

## 1. TEST RESULTS — 42/42 PASS

`ls test/*.mjs | grep -v _harness | wc -l` → **42**. Each run individually
(`for f in test/*.mjs; do node "$f"; done`), all `exit=0`:

smoke, test_arch_buffs, test_arches, test_audio, test_boomerang_pierce, test_bosses,
test_chests_horde_typed, test_chests, test_choices_exclude, test_choices,
test_controller_dead_targets, test_controllers, test_death_screen, test_desktop_ui, test_draft_sim,
test_earned_moment, test_elite_mods, test_elite_split_count, test_enemy_types, test_evolution,
test_final_boss, test_fire_window, test_heat_ledger, test_heat, test_intro_impact, test_intro,
test_loot, test_meta, test_portal_cine, test_profile_validation, test_render_hud, test_shrines,
test_skills_contract, test_sprites, test_stance_bite, test_synergies, test_synergy_hint, test_tour,
test_wave26_crossfile, test_weapons_mine_chain, test_weapons, test_weather.

**tests_passed = 42, tests_failed = 0.**

---

## 2. FEATURE VERIFICATION

### F1 DEATH AS PAYOFF — VERIFIED GOOD, with one BUG (D1)

| Claim | Evidence | Verdict |
|---|---|---|
| Cause from a REAL recorded source | `die()` freezes `lastDamageSource` into `state.deathBy` (`main.js:1992-1999`); the three stamped paths are drain `1141`, contact `1253`, shot `1281` (each `lastDamageSource = {...shotSrc(e), cause}`) | partially — see D1 |
| Boss keeps its proper name / typed enemy its id | `deathCauseLabel` `main.js:1885-1894`; probe: `{typeId:'SPITTER',cause:'contact'}`→`SPITTER in melee`, `{name:'VYRN…'}`→`VYRN, THE HERALD in melee` | GOOD |
| Unknown source degrades honestly | probe `deathCauseLabel({cause:'unknown'})` → `THE HORDE`; `null` → `THE HORDE` | GOOD |
| Shop numbers are real meta data | `nextUnlockWithinReach` `main.js:1899-1908` iterates `SHOP_UPGRADES` (meta.js:287-333) + `upgradeCost`/`shopRowOwned` (meta.js:349/405) | GOOD |
| Wave-1 / zero-gold death readable | probe: `GOLD EARNED: +0 · purse 0` + `NEXT UNLOCK: Vitality 120g · 120g TO GO` — 4 lines, no crash | GOOD |
| Everything already bought | probe with whole catalogue maxed → `NEXT UNLOCK` line **omitted entirely** | GOOD |
| Shop catalogue empty (degenerate) | probe with `SHOP_UPGRADES.length = 0` → renders `WAVE 2 / KILLED BY THE HORDE / GOLD EARNED: +3`, no throw | GOOD |
| RETRY first, R retries | `main.js:2014-2015`; test_death_screen asserts card[0]=RETRY | GOOD |

**D1 (BUG, top of list).** A **finale/maw death records a stale killer**, not the maw.
Both finale death paths call `die(true)` with **no `lastDamageSource` stamp** —
`main.js:3408` (barrage) and `main.js:3426` (body bite). `lastDamageSource` (`main.js:1990`) is
**never reset** in `startRun` (the reset block `2579-2597` clears `state.deathBy` but not it).
Probe (fresh run, no damage taken, then killed by the maw):
```
after maw death: mode= dead
deathBy = {"typeId":"SPITTER","cause":"contact","wave":1,...}   <-- from the PREVIOUS run
cause label = "SPITTER in melee"
ov-sub = "the maw swallowed the last hero<br>WAVE 1 …<span class="cause">KILLED BY SPITTER in melee</span>…"
```
So the climactic death screen names an unrelated earlier enemy, and a run that takes no damage
inherits the **previous run's** killer. This is exactly the "state not reset between runs" failure
mode the brief asked to hunt. Cause is a real recorded source — just the wrong one, and stale.

### F2 DRAFT SYNERGY HINTS — VERIFIED GOOD (the worst outcome did NOT occur)

- Hints are derived from `detectSynergies` — the same call the synergy tick uses
  (`synergyHintForCard` `main.js:757-789`; `refreshSynergies` `main.js:730-741`; table
  `synergies.js:41-77`). A hint can only name a table entry.
- **Every flag in the table is really implemented** (probe + source):
  `orbitVolley`→`main.js:311`; `zapExtraForks`→`main.js:851-869`; `boomerangHoming`→`938-952`;
  `novaDetonatesMines`→`872-892`; `scytheArcZap`→`921-934`; `novaPull`→`877-885`;
  `beamDetonatesMines`→`896-917`. Each applies real damage/effect; none is a stub.
- Probe: enumerated every card the helper can be handed over all archetype pairs →
  **19 hints emitted, 0 without a matching real SYNERGIES rule.**
- No-synergy path is silent: solo VOLLEY → `wpn_BEAM` hint `null`, `lvl_VOLLEY_1` hint `null`,
  non-weapon card (`multi`) `null`. Confirmed live in the browser: a solo-VOLLEY draft rendered
  3 cards with **no** `.syn` element.

### F3 STANCE THAT BITES — VERIFIED GOOD (behaviour); readout = OWNER-REMOVED (see §4)

What actually changed (config diff `config.js:108-115`):
- SAFE: `PICKUP_MULT 0.85`, TAG `KEEP CLEAR` (kite ×2.0, XP ×0.6 unchanged)
- BALANCED: baseline, TAG `EVEN ODDS`
- GREEDY: **XP_SPEED 1.0 → 1.35**, `LOOT_WEIGHT 0.65`, **PICKUP_MULT 1.35**, TAG `LOOT FIRST`
- New consequence wired at `main.js:1501-1508`: `pickR = basePickR * stanceDef.PICKUP_MULT`
  (manual + auto both hit this, because pickup is engine-side).
- Payoff toast: `main.js:1552-1572` — `greedyScoop` counts gems only the GREEDY radius reached,
  fires `GREEDY HAUL - N SNATCHED BEYOND REACH` at most once per 6 s
  (`state.stanceLootAt`). OWNER-REPORTED WORDING FIX 2026-09-13: the line used to
  say `N LOOT OUT OF REACH`, which inverted the event — it fires exactly when the
  loot WAS collected, so with a lone far gem it read as a warning about a gem the
  player was holding, and loot genuinely left beyond the radius never produced a
  line at all. Pinned by test_stance_bite.mjs.
- Observability: **yes** — a GREEDY player collects loot ~35 % further out and sees the haul
  toast; SAFE demonstrably keeps distance. `controllers.js:163/210/225/256` set `act`
  (FLEE/LOOT/PATROL/MANUAL) for the readout.

### F4 EARNED SLOW-MO + GLOW — VERIFIED GOOD

- **Triggers — exactly three, all intended.** Static enumeration of `triggerEarnedMoment('…')`:
  `["boss","evolution","finale"]`.
  - `main.js:1793` weapon **evolution** (on `res.ok` only)
  - `main.js:1348` **end-cast boss kill** — inside the `else if (e.boss)` branch; the per-wave
    mid-boss branch (`main.js:1315-1323`) deliberately does **not** trigger
  - `main.js:3503` **maw finale kill** (`mawDefeated`)
  - The only writes to `state.timeScale`/`dilation.scale` are `triggerDilation` (1835-1843),
    `advanceDilation` (1847-1860) and the `startRun` reset (`2542-2546`). **No extra trigger.**
- **Frame-rate independent.** `frame()` measures `realDt` once (`main.js:3535`) and decays the
  window on real (wall-clock) dt (`3537`), scaling only the sim (`dt = realDt * timeScale`, `3538`).
  Probe over a 1 s window: 60 Hz sim `0.62083`, 120 Hz `0.61542`, 144 Hz `0.61181` (Δ60↔120 =
  `0.0054 s`, i.e. sub-frame discretisation), all end at **scale exactly 1**.
- **Cannot stack.** `triggerDilation` takes `scale = MIN`, `remaining = MAX` (`1839-1840`).
  Probe: 3 same-frame triggers (0.45/0.5, 0.35/0.6, 0.35/0.6) → `scale 0.35`, `remaining 0.6`,
  never a product/sum.
- **Returns to exactly 1.** Probe: after expiry `scale = 1`, `remaining = 0`, `timeScale = 1`,
  and stays 1 on later frames; `state.timeScale` is reset on `startRun` (`2542`) and the moment
  cleared (`2543`).
- **Pixel-art preserved.** `drawMoment` (`render.js:893-…`) is fillRect-only integer pixels (no
  gradients/shadowBlur/filter — test_earned_moment asserts it), and it is drawn **below** the HUD
  chrome (`render.js:802` then `803`), so readouts stay legible.

---

## 3. THE SIX CROSS-FILE LEFTOVERS — ALL SIX VERIFIED

1. **`state.zoomScale`** — `render.js:184-187` reads `state.zoomScale` with an identical derived
   fallback; `main.js:3104` publishes it every frame in `syncChrome`. `drawMoment` uses the same
   value (`render.js:905-906`). GOOD.
2. **`readDoctrine` DOM-free** — `render.js:872-878` reads only `state.focus`/`state.stance`;
   `grep document src/render.js` returns no DOM access (only `globalThis.window.devicePixelRatio`
   at `131`, unrelated). test_render_hud exercises it with a `getElementById` stub. GOOD.
3. **`final_boss` real speed default** — `MAW_SPEED_BASE = 400` (`final_boss.js:68`) × `speedMult
   0.35` (`:58`) = 140; `makeFinalBoss` stamps `speed` (`:277`). test_final_boss asserts finite,
   positive, and exactly `MAW_SPEED_BASE * speedMult`. GOOD.
4. **`PIERCE_ALL` not 999** — imported (`main.js:14`) and used (`main.js:309`); the literal 999
   now exists once, at its definition (`weapons.js:284`). GOOD.
5. **`synWeaponDmg` arch multiplier** — `main.js:819` applies `activeArchMods(state).damageMult`,
   so synergy bolts / mines get BERSERK. GOOD.
6. **`applyEscalation` single implementation** — lives in `entities.js:72`; `main.js` (7 call
   sites) and `chests.js:161` both import and delegate; the duplicated algebra is gone from
   `chests.js`. GOOD.

---

## 4. DOCTRINE READOUT — OWNER-REMOVED, PENDING IMPLEMENTATION (not scored)

Per the owner ruling, the canvas `FOCUS …` / `STANCE …` text is redundant with the overlay
badges and is **OWNER-REMOVED, pending implementation**. Reported here only as **what depends on
it**, so the removal is safe:

- **Rendering:** `render.js:1098-1117` — `readDoctrine(state)` → `drawHudChrome` paints
  `chrome.focus/stance/stanceAct` and the two canvas labels (`FOCUS <x>` at 1103, `STANCE <x> · <TAG>
  · <ACT>` at 1111-1114).
- **Tests that assert it (will need updating with the removal):**
  - `test_render_hud.mjs:237-289` (the "WAVE-24 / #4" block) asserts the canvas `FOCUS`/`STANCE`
    text, both readability plates, the CONFIG TAG, the live `stanceAct`, AND the null-DOM
    behaviour. This is the one file that pins the removed text.
  - `test_desktop_ui.mjs:147-155` asserts `state.focus`/`state.stance` are published every frame.
  - `test_stance_bite.mjs:175-176` asserts `state.stanceAct` is published.
  - `smoke.mjs` uses `hudChrome` heavily but **not** `.focus/.stance` — no change needed there.
- **Other consumers:** none. `grep` shows `state.focus`/`state.stance` are read only by
  `readDoctrine`; `state.stanceAct` only by `render.js:1110`; `chrome.focus/stance/stanceAct` only
  by the tests above. So the publication becomes dead code after removal, and the two tests must
  be updated (or they fail).
- **Premise — are the overlay badges reliably visible?** Yes, while it matters. The badges
  `#tc-focus` / `#tc-stance` live in `#touch` (`index.html:258-259`) and are shown whenever
  `chromeOn()` is true (`playing`/`finale`, `main.js:3089-3109`); `updateTouchHud` repaints them
  every frame (`3117-3122`, called at `3582`). **Verified live in a browser:** during a run
  `#touch` computed `display:block` with `tc-focus=NEAREST`, `tc-stance=<stance>`, `tc-pilot=AUTO`.
  The badges are hidden in menu/intro/draft/intermission/death/settings/stats/portal-cine, but the
  canvas readout is not a live readout in those modes either (overlay covers the canvas), and the
  coachmarks that teach the levers already target the badges (`main.js:2289-2296`).
- **One caveat to weigh:** the stance **TAG** and live **activity** (FLEE/LOOT/PATROL) are carried
  *only* by the canvas text — the overlay badge shows the stance **name** only. Removing the text
  is mechanically safe, but F3's "legible meaning" is then reduced to the name unless the badge is
  extended. Flagging for the decision, not scoring it.

---

## 5. NEW INVESTIGATION — WALL / LOOT / PILOT / CAMERA

### 5.1 Loot/gem/chest spawn placement — can land outside the wall (NO clamp exists)

Spawn positions are the killed enemy's exact `(x,y)`; there is **no clamp anywhere**:

| Object | Site | Position |
|---|---|---|
| Gem | `main.js:1306`, `1412` → `entities.js:97-99 makeGem` | `(e.x, e.y)` verbatim |
| Potion drop | `main.js:1312-1314` | `(e.x, e.y)` |
| Item drop | `main.js:1333`, `1357` | `(e.x, e.y)` |
| Chest | `chests.js:105` `maybeSpawnChest` | `x:killedEnemy.x, y:killedEnemy.y` |

Enemies are spawned on a ring **280 px around the player** (`config.js:41 SPAWN_DIST`), not around
the arena, and enemies are **never rim-clamped** (the only clamps are the player `main.js:275`,
Pyraxis teleport `1215`, and the maw `3375`). So near a wall enemies appear beyond it, and any that
die out there drop loot out there. The drawn wall band is `RIM..RIM+12` (`render.js:1433, T=12`),
i.e. **600-612**, while the player clamp is exactly `±600` — loot in that band sits *on* the wall's
inner face, and loot past 612 is unreachable.

Probe evidence: enemy killed at `x=650` → gem `{x:650,y:40}`; `maybeSpawnChest` on a dead enemy at
`(700,-640)` → chest `{x:700,y:-640}`. Both outside `RIM = 600`.

**Smallest correct fix:** at each drop site (or inside `makeGem`/`maybeSpawnChest`) clamp the spawn
to `±(C.GROUND.RIM - margin)` so loot always lands inside the playable face — belongs in
`main.js` (a small `clampToArena(x,y)` helper) and `chests.js:105`.

### 5.2 Autopilot targeting vs the rim — no reachability test; pilot loiters at the wall

Target selection: `AutoPilotController.decide` (`controllers.js:122-231`) picks
`nearestEnemy` for firing (`pickTarget`, 128) and the nearest gem for movement (137-152), then
branches FLEE (164-198) / LOOT (202-217) / PATROL (222-230).

Two mechanisms make the pilot "press into the wall trying to reach loot beyond it":
1. **No reachability test + permanent gem stickiness.** The gem commit (`137-144`) holds one gem
   *by identity* until it leaves the field. A gem beyond `RIM` can never be collected, so the
   commit is never released and reachable gems are ignored. The wall-steer cancels the outward
   component only while `|x| > rim`, so the pilot still pushes outward until then.
2. **Wall-steer rim is a hardcoded 560** (`controllers.js:174` and `:206`), duplicating the
   `C.GROUND.RIM` (600) knob — the classic "hardcoded value that duplicates CONFIG" pattern.

Probe: player at `x=595`, an unreachable gem at `x=760` → after 6 s the player oscillates around
`x≈560.6`, the gem is still on the field, `controller.gem` is still committed, activities seen
`PATROL,LOOT` (never resolves). Control probe: a *reachable* gem at the wall IS collected. The
brief's separate note holds — **enemies approaching from outside the rim is intended and
unaffected**: `pickTarget` only *fires* at them (no movement toward them), and FLEE moves away.

**Smallest correct fix:** skip unreachable candidates in the gem pick loop (`controllers.js:137-144`)
— e.g. `if (Math.abs(gm.x) > RIM || Math.abs(gm.y) > RIM) continue;` — and replace the two
`560` literals with `C.GROUND.RIM - margin`. Belongs in `controllers.js`.

### 5.3 Camera lock — player is hard-centred (lag only, no deadzone/lead)

Follow math (identical in `update` and the finale tail):
`main.js:1575-1576` and `3488-3489`:
```
state.cam.x += ((p.x - C.VIEW_W/2) - state.cam.x) * Math.min(1, dt * 5);
```
That is exponential smoothing with a ~0.2 s time constant converging to `p - VIEW/2`, i.e. the
player is **pinned to screen centre** once settled. The world transform is
`render.js:213-216` (`translate(cx,cy) · scale(Z) · translate(-cx,-cy)`) with `cam` subtracted, and
`Z` from `state.zoomScale`. There is **no deadzone and no look-ahead**. Probe: with the player at
the clamp, `cam` converges to `p - VIEW_W/2` (player screen-x → 240 = centre). So near a wall the
wall can only appear at the screen edge; the player never decouples from centre.

**Smallest correct fix:** clamp the camera to the arena bounds so the view stops at the wall and
the player drifts toward the screen edge —
`cam.x = clamp(cam.x, -(RIM - VIEW_W/2), RIM - VIEW_W/2)` (mirror for y) — belongs in the camera
follow in `main.js:1575-1576` / `3488-3489`.

---

## 6. REGRESSION GUARDS — NO REGRESSIONS FOUND

- **Desktop mouse-clickable pads** — `#touch` is shown for desktop (`main.js:3089-3109`) and
  handled via delegated `pointerdown` (`main.js:3054-3057`). Live browser: a synthetic
  `pointerdown` on `#touch button[data-act="stance"]` advanced the stance `SAFE → BALANCED`.
  `test_desktop_ui.mjs` passes.
- **ESC / P pause** — `'escape','p'` in `REPEAT_GUARDED` (`main.js:2820`); handler opens the same
  settings pause (`2872`). Live browser: Escape → overlay `SETTINGS — audio, hud & profile`,
  `#touch` hidden. `test_desktop_ui.mjs` passes.
- **Held-key repeat guards** — `if (ev.repeat && REPEAT_GUARDED.has(k)) return;` (`main.js:2831`)
  guards tab/g/h/n/escape/p/m/i/s/?/f1/+/-. `test_desktop_ui.mjs` (repeated TAB/G must not cycle)
  passes.
- **Canvas HUD legibility** — every label rides a dark `H.PLATE` (`render.js:991-995`); the flare is
  drawn under the chrome (`802` before `803`). `test_render_hud.mjs` passes.
- **Ground landmarks** — landmark pass intact (`render.js:1308-1331`); `test_render_hud.mjs`
  paints them through the real 588-frame path. Passes.
- **Resolution modes / zoom** — `ZOOM_LADDER` + `zoomScale()` published as `state.zoomScale`
  (`main.js:3104`); `test_render_hud.mjs` + smoke zoom probes pass.
- **Intro-overlay regression (wave-25)** — `syncChrome()` now runs before the `intro`/`portal-cine`
  early returns (`main.js:3550`). Live browser: during the intro `#touch` computed
  `display:none`; the chrome only appears once a run is live. Not regressed.

---

## 7. RE-CHECK OF THE TWO EDITED PRE-EXISTING TESTS — OWNER'S JUDGMENT IS CORRECT

`git show eb87d23 -- test/test_final_boss.mjs test/test_render_hud.mjs`:

- **`test/test_final_boss.mjs`** — the pinned key set gained `'speed'` **and** two new assertions
  (`Number.isFinite(e.speed) && e.speed > 0`; `e.speed === MAW_SPEED_BASE * FINAL_BOSS.speedMult`).
  The exact-key-set assertion is retained (just updated). Strictly more coverage.
- **`test/test_render_hud.mjs`** — the exact-match `textOf(rec,'STANCE GREEDY')` became a
  prefix match **plus** an exact `STANCE GREEDY · <TAG>` assertion **plus** a new `stanceAct`
  assertion; the old DOM-badge-fallback assertion was replaced by its inverse (the bridge must be
  **gone**: `focus===null`, `stance===null`, nothing painted) while the DOM stub is still installed.
  Again strictly more coverage of the new contract.

**No coverage was weakened, deleted, or made vacuous.** Both files grew; the pre-existing
assertions were retargeted to the behaviour the change ordered replaced, and both still run the
real render/factory paths. The owner's judgment stands.

---

## 8. PRIORITIZED DEFECT LIST

1. **BUG — `main.js:3408` & `main.js:3426`** (with `main.js:1990`): the maw/finale death calls
   `die(true)` without stamping `lastDamageSource`, and `lastDamageSource` is never reset in
   `startRun` (`2579-2597` only clears `state.deathBy`). The end screen then shows
   `KILLED BY <a stale earlier enemy>` on the climactic death — and inherits the previous run's
   killer if this run took no damage. (F1 claim "the cause is a real recorded source" is only
   true for the drain/contact/shot paths.) One-line fix: stamp the maw before `die(true)` and/or
   `lastDamageSource = null` in `startRun`.
2. **BUG — `main.js:1306/1312-1314/1333/1357`, `entities.js:97-99 makeGem`, `chests.js:105`**:
   loot/gems/chests/items spawn at the killed enemy's position with **no clamp**; enemies spawn
   280 px around the player (`config.js:41`) and are never rim-clamped, so loot lands outside
   `RIM=600` and in the `600-612` wall band (probe: gem at `x=650`, chest at `(700,-640)`).
   Uncollectible loot + visible "loot on the wall".
3. **BUG — `controllers.js:137-144` (+ `174`, `206`)**: the autopilot has **no reachability test**
   and the gem stickiness commits to a gem outside the rim forever; the wall-steer uses a
   hardcoded `rim = 560` instead of `C.GROUND.RIM`. Probe: 6 s loitering at `x≈560` on an
   unreachable gem, `controller.gem` never released. (Enemies from outside the rim remain fine.)
4. **POLISH — `main.js:1575-1576` & `3488-3489`**: the camera is hard player-locked (lerp to
   `p - VIEW/2`, no deadzone or lead). Near walls the player is pinned to centre; the wall is only
   ever at the screen edge. Clamp `cam` to the arena bounds to decouple.
5. **POLISH — `test_render_hud.mjs:237-289` / `test_desktop_ui.mjs:147-155`** (dependent on the
   owner-removed doctrine readout): these will fail when the canvas `FOCUS/STANCE` text is removed;
   update them with the removal, and note the stance TAG + live activity have no badge equivalent.

---

## 9. PUBLISH GO / NO-GO

**GO — publish to `sk408.github.io/hordes/`.** All 42 test files pass; the four features work as
claimed (F2 in particular is honest: no hint promises an unimplemented rule); all six cross-file
leftovers are real; the wave-25 intro-overlay fix and every listed guard (pads, ESC/P, repeat
guards, HUD plates, landmarks, zoom) hold in a real browser. No crash, no content loss, no
regression found.

The one thing to fix, and I would fix it before or immediately with publish because it is a
one-line change on the most-seen climactic screen: **defect #1** (finale death reports a stale
killer). Defects #2/#3/#4 are pre-existing gameplay/labelling annoyances worth scheduling, not
publish blockers.

---

*Independent audit. No fixes applied — findings only.*
