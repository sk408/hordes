# MENU/UX REFERENCE DOSSIER — lean games vs HORDES (2026-09-17)

Task MGX7FJ (msg_01M2R4ETCNAX9ZVQFM90MGX7FJ + the PC-side addition msg_01M2R4M06YVCXJRKV7RGNBMERV).
SCOPE: research + this document ONLY. Nothing in the game changed, no simulator
was run, no APK was touched. The inventory of HORDES' current surfaces is NOT
repeated here — it lives in docs/briefs/CONDENSE_PROPOSAL.md §9 (title 9 cards
fresh / 8 with save; SETUP 5; SETTINGS 12 in-run / up to 14 title; shop 46 rows
+ 8 character rows; heat dial; draft 3-4 cards). This dossier says what the
result SHOULD look like; task VJBFV (CONDENSE_PROPOSAL §10-12) decides what to
delete.

## 1. THE FIVE REFERENCES (public material, URLs cited)

### Vampire Survivors (the teaching-without-a-manual reference)
- **Top-level menu:** ~5 buttons on a clean title (Play, (Unlocks/Collection
  behind unlocks), Options, DLC/Account row) — several entries APPEAR only
  after unlocks. [VS wiki Main menu](https://vampire.survivors.wiki/w/Main_menu)
- **Settings screen:** six sections (Favorites, Display, Sound, Gameplay,
  Co-op, Account), ~30-35 options total, but a "Favorites" section duplicates
  the ~5 you actually touch so the effective surface is tiny. Exact option
  names: [VS wiki Options](https://vampire.survivors.wiki/w/Options)
- **Shop/upgrade decisions:** the level-up screen pauses the game and offers
  3-4 choices, one decision at a time. [VS wiki Level up](https://vampire-survivors.fandom.com/wiki/Level_up)
- **Toggle vs contextual:** real toggles are persistent preferences (V-Sync,
  flashing VFX, damage numbers, joystick type); everything contextual (stage
  modes Hyper/Hurry/Inverse/Endless) lives on the STAGE SELECT card, not in
  settings.
- **Teaching:** no tutorial; first level-up lands inside 1-2 minutes and IS
  the lesson (one-button controls, choices teach the build system).
  [KokuTech design analysis](https://www.kokutech.com/blog/gamedev/design-patterns/power-fantasy/vampire-survivors)
- **Text density:** 2-4 words + an icon per row; phone-portrait native.
- **WHAT THEY OMIT:** no difficulty setting anywhere, no key rebinding, no
  brightness/contrast, no UI-scale/text-size, no graphics presets; the mobile
  build omits resolution/window mode entirely (orientation instead); Delete
  Save is HIDDEN (tap the Account button 6-7 times).
  [PCGamingWiki](https://www.pcgamingwiki.com/wiki/Vampire_Survivors)

### Balatro (the few-but-meaningful-choices reference)
- **Top-level menu:** 5 buttons (Play / Options / Stats / deck customize /
  mods-adjacent) around one draggable card. [Balatro wiki Main menu](https://balatrowiki.org/w/Main_menu)
- **Settings screen:** 17 settings in 4 categories — Game 6 (speed, button
  order, screenshake, stake stickers, high contrast, reduced motion), Video 4
  (desktop-only), Graphics 4, Audio 3. [Balatro wiki Settings](https://balatrowiki.org/w/Settings)
- **Shop decisions:** the shop offers ~4 buyable things per visit (2 jokers +
  consumable slots + packs); every purchase is one tap with the price on the
  card. (Screenshots: [Game UI Database — Balatro](https://www.gameuidatabase.com/gameData.php?id=1935))
- **Toggle vs contextual:** Game Speed is a real ladder toggle (0.5/1/2/4);
  Play/Discard button ORDER is a genuine handedness preference — the only
  "control" setting, and it is a choice of two, not a rebinder.
- **Teaching:** the run teaches; the only "manual" text is on the run-info
  screen you open deliberately.
- **Text density:** one line per setting, ~3 words + current value.
- **WHAT THEY OMIT:** no key rebinding, no language option on the settings
  page, no difficulty, no assists beyond high-contrast + reduced motion; video
  settings are ABSENT on mobile entirely.

### Brotato (the between-wave shop reference)
- **Top-level menu:** Play / Characters / Options / (Unlocks inside character
  select) — ~4 entries. [Brotato wiki](https://brotato.wiki.spellsandguns.com/Brotato_Wiki)
- **Settings screen:** compact video/audio + the accessibility section is the
  stand-out: highlight toggles per THING (characters, weapons, projectiles,
  turrets, pets) and recolorable HP/EXP/rarity colors.
  [PCGamingWiki — Brotato](https://www.pcgamingwiki.com/wiki/Brotato)
- **Shop decisions:** up to 4 items per between-wave shop + lock + reroll +
  weapon-slot buys — a bounded hand of ~4 simultaneous decisions.
  [Brotato wiki Shop](https://brotato.wiki.spellsandguns.com/Shop); the
  community's "best setting" discussions are about ONE contextual option
  (Manual Aim on Mouse Press) — [r/brotato](https://www.reddit.com/r/brotato/comments/1q9o59m/what_are_the_best_settings_in_the_options_menu/)
- **Toggle vs contextual:** aim-mode and retry-on-death are real toggles
  ([r/brotato retry](https://www.reddit.com/r/brotato/comments/1rq6fcu/turn_on_the_retry_function_in_the_options_menu/));
  wave-to-wave weapons recycling is contextual, not a setting.
- **Teaching:** waves are 20-60s; death recap + the 4-item shop teach by
  repetition.
- **WHAT THEY OMIT:** no difficulty slider (difficulty IS the character pick),
  no graphics ladder, no rebinding.

### Slay the Spire (the menu-hierarchy reference)
- **Top-level menu:** 6 main-menu screens total in the UI database's count
  (title + climb/continue + stats + settings + etc.). [Interface in Game — StS](https://interfaceingame.com/games/slay-the-spire/)
- **Settings:** 3 settings screens in the same database count — settings are
  split and SMALL (video / audio / gameplay), never one 14-row wall.
- **Shop decisions:** the shop offers ~5 buyables (3 cards + 2 relics/potions
  + removal service); the map is a FORK choice, not a menu.
- **Toggle vs contextual:** Ascension (difficulty) lives on the CHARACTER
  select, not in settings; key binds exist but on their own sub-screen.
- **Teaching:** the first act IS the tutorial; keywords are inline tooltips.
- **WHAT THEY OMIT:** no brightness/contrast, no UI scale, no gameplay assists.

### Luck be a Landlord (the minimal-surface reference)
- **Top-level menu:** effectively Play / (deck) / Options — reviewers
  consistently praise it for distilling the genre "to its absolute core".
  [Rogueliker review](https://rogueliker.com/luck-be-a-landlord-review/),
  [Push Square review](https://www.pushsquare.com/reviews/ps4/luck-be-a-landlord)
- **Settings:** near-empty by roguelite standards; the notable entries are
  accessibility-only (screen-reader support flagged on the store page).
  [Steam store page](https://store.steampowered.com/app/1404850/)
- **Shop decisions:** after each spin, pick 1 of 3 symbols or skip — ONE
  decision per beat.
- **WHAT THEY OMIT:** everything that is not audio or accessibility; no
  difficulty, no video settings to speak of, no rebinding.

## 2. THE DELTA TABLE (what they do / what HORDES does / the delta)

| dimension | the references | HORDES today (per CONDENSE_PROPOSAL §9) | delta |
|---|---|---|---|
| title entries | 4-6 (VS/StS/Balatro/LbaL) | 9 cards fresh, 8 with a save | HORDES is ~2x the reference count |
| settings screen | 3-4 small category screens, ~6-17 REAL toggles; the wall never exceeds one thumb-scroll | ONE screen, 12 in-run / up to 14 on title | same order of magnitude, wrong SHAPE: one uncategorized wall |
| contextual vs toggle | contextual choices (difficulty, stage modes, aim) live on the surface that uses them; settings hold only persistent prefs | zoom + resolution + hud-text sit in settings as if they were preferences | HORDES promotes contextual controls to settings |
| shop decisions at once | 4-5 visible buyables (Brotato 4 + lock/reroll; Balatro ~4; StS ~5) | 46 shop rows + 8 character rows on one catalog | HORDES shows 10x the simultaneous decisions |
| draft/upgrade decisions | 3-4 cards, one decision (VS 3-4; LbaL 1-of-3) | 3-4 cards | AT the reference — keep |
| teaching | first choice lands <2min in; the choice teaches; no manual pages | help card + coachmarks exist; runs start in ~6s | at/near reference; keep the choice-time teaching |
| text density (phone) | one line, 2-4 words + value per row | several rows carry sentence-length copy | HORDES is wordier per row |
| hidden dangerous ops | Delete Save hidden behind 6-7 taps (VS) | reset exposed as a settings row | HORDES exposes the destructive op |
| what they omit | difficulty, rebinding, brightness, UI scale, video ladders on mobile | HORDES carries zoom ladder + resolution ladder + hud-text in-run | the references OMIT the category HORDES is heaviest in |

## 3. ADOPT-LIST (each item tied to a HORDES surface; feeds VJBFV, decides nothing here)

1. **Settings screen -> 3 category tabs (DISPLAY / AUDIO / GAMEPLAY)**, ~6-8
   real toggles total, one line per row, 2-4 words + current value. (Balatro's
   17-in-4-categories is the ceiling; LbaL the floor.)
2. **Zoom + resolution + hud-text (the contextual trio) -> leave settings**,
   become DISPLAY presets at most (VS mobile omits the whole category; Balatro
   mobile omits video entirely). Exactly CONDENSE_PROPOSAL §10's DEMOTE tier —
   the references agree with it.
3. **Title cards 9 -> ~6**: keep the run door, shop door, options, and at most
   two meta doors; the duplicates the prune proposal deletes are also the ones
   no reference carries twice.
4. **Shop: bound the visible hand.** One tab/category visible at a time with
   ~5-8 rows on screen (Brotato's 4 + the character page pattern), the
   full catalog reachable by scroll/tab but never the simultaneous surface.
   `nextUnlockWithinReach` (already in meta.js) becomes the "featured" row.
5. **Dangerous ops -> hidden confirm**: reset/save-wipe moves behind a
   SAVE DATA group with a typed/stepped confirm (VS hides Delete Save behind
   6-7 taps for exactly this reason).
6. **Stage/challenge choices stay on SETUP, not settings** — VS's Hyper/Hurry
   modes are the model: contextual toggles on the door you enter the run
   through. HORDES already does this for challenge/stage/night; keep it that
   way and resist graduating them into settings.
7. **Draft screens: unchanged** — 3-4 cards one decision at a time IS the
   genre answer; keep the effect text to one line (VS density), which the
   cards already approach.
8. **Teaching: keep coachmarks + choice-time text, add no manual pages** —
   every reference teaches exclusively through the first 2 minutes of play.

## 4. THE APK PASS — runbook for the PC (PLAN ONLY; do not attempt now)

Per msgs 01M2R4ET + 01M2R4M0: the pull AND the decompile run on the PC (it
has the space and the RE tooling); the VPS stays research/docs only; NO APK
files on the VPS. Owner: "It's 1.2gb ... we'll need to wait until PC is
available."

Preconditions on the PC: adb in PATH, USB debugging authorized, jadx + apktool
installed (they already are), >=10 GB free per game (pull ~1.2 GB for VS;
decompiled trees run several times the APK size).

```bash
# 0. confirm the device is seen          -> yields: serial number, authorized
adb devices

# 1. find the installed packages         -> yields: the exact package names
adb shell pm list packages | grep -iE 'surviv|balatro|poncle|playstack'

# 2. locate the APK splits for a game    -> yields: base.apk + split paths
adb shell pm path <package>

# 3. pull them from THE OWNER'S DEVICE (his purchases — never a mirror)
#    -> yields: the APK set on the PC, ~1.2 GB total for VS
mkdir -p ~/RE_Vault/apk/<game> && cd ~/RE_Vault/apk/<game>
adb pull <each path from step 2> .

# 4. static recon BEFORE deep decompile:
#    load the `android-apk-static-recon` and `mobile-app-data-extraction`
#    skills first (per the task directive), then:
jadx-gui base.apk        # or: jadx -d out/ base.apk   (3-5x APK size on disk)
apktool d base.apk -o apktool_out/

# 5. where the menu evidence lives, in likely-first order:
#    - res/values/strings*.xml   -> the FULL settings/menu option lists, named
#    - assets/ + res/layout*     -> menu scene layouts / atlases (Unity games
#      keep most UI in assets/resources.assets — string tables + atlases there)
#    - AndroidManifest.xml       -> activities = the screen inventory
```

Rules that survive contact: if a file cannot come from the owner's device,
STOP AND ASK (no mirrors, no aggregators, no "free APK" sites); the VPS copy
of this task never stores APK bytes; disk cost is checked before step 3, not
after.

## 5. CONFIRMATIONS

- Nothing in the game changed (this file + research only; `git status` shows
  only the potion-tune work from the parallel task).
- No simulator runs were performed for this dossier.
- Screenshot references (public, phone sizes where they exist): Balatro
  settings/shop screens — Game UI Database entry cited above; Slay the Spire
  menus — Interface in Game entry cited above; VS/Brotato — Steam store pages
  and wikis cited inline. When the PC APK pass happens, replace citations with
  pulled-from-device captures of the SAME screens.
