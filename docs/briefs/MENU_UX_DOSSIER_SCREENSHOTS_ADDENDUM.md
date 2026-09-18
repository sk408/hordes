# MENU/UX DOSSIER — screenshots + measurement addendum (2026-09-18)

**This is an ADDENDUM to `docs/briefs/MENU_UX_DOSSIER_2026-09-17.md`** (the committed primary
deliverable for task msg_01M2R4ETCNAX9ZVQFM90MGX7FJ). A second lane independently produced a
research pass for the same task; rather than ship a competing dossier, this file keeps only what
the primary does not have: **downloaded screenshots** (the task brief's "2-4 screenshots per
reference") and a few **image-grounded measurements + one extra reference (Halls of Torment)**.
Findings that duplicate the primary are omitted. Feeds VJBFV the same way; decides nothing.

Screenshots live in `docs/art/menu-ux-dossier-2026-09-18/shots/` (12 public files, ~1 MB total).
No game files changed, no simulator run.

## 1. The screenshot pack

| ref | file | what it shows | source |
|---|---|---|---|
| VS | `vs-main-menu-basic.png` | progressive-disclosure "basic" menu (new player) | [VS wiki Main menu](https://vampire.survivors.wiki/Main_menu) |
| VS | `vs-main-menu-full.jpg` | fully unlocked menu, top bar + bottom utility row | same |
| VS | `vs-levelup-screen.jpg` | level-up draft: 3-4 choices, icons + names | [VS wiki Level up](https://vampire.survivors.wiki/Level_up) |
| VS | `vs-levelup-bar.jpg` | HUD XP bar (600px wide) | same |
| VS | `vs-levelup-maxed.jpg` | pool-empty fallback: Gold / Floor Chicken slots | same |
| Balatro | `balatro-game-settings.png` | Game tab: 6 rows (2 cycle + 1 slider + 3 toggle) | [Balatro wiki Settings](https://balatrowiki.org/Settings) |
| Balatro | `balatro-graphics-settings.png` | Graphics tab incl. CRT slider | same |
| Balatro | `balatro-shop.png` | full shop: 2 cards + 2 packs + voucher + reroll | [Balatro wiki Shop](https://balatrowiki.org/Shop) |
| StS | `sts-main-menu.jpg` | 6-entry flat main menu (1600px, orig 3840x2160) | [interfaceingame](https://interfaceingame.com/games/slay-the-spire/) |
| StS | `sts-choose-your-character.jpg` | character select = where difficulty (Ascension) lives | same |
| StS | `sts-rewards.jpg` | rewards pick screen — one decision per screen | same |
| StS | `sts-you-are-slain.jpg` | death/results screen | same |

Full-res StS originals follow the pattern
`https://interfaceingame.com/wp-content/uploads/slay-the-spire/slay-the-spire-<slug>.jpg`
(slugs observed: `main-menu`, `choose-your-character`, `rewards`, `you-are-slain`, `tutorial`,
`map`, `collection`, `credits`, `overall-statistics`, `choose-a-relic`, `the-city`, `tip`, …).
HoT settings shots exist at PCGW thumbnails (`HoT_DisplayWindow.png`, `HoT_Interface.png`,
`HoT_Input.png`, `HoT_Audio.png` under `https://thumbnails.pcgamingwiki.com/…/300px-…`) but are
bot-walled for automated pulls — clickable in a browser, not archived here.

## 2. Measurements not in the primary dossier

All counts read directly off the screenshots above:

- **Menu word budget (confirmed 15–30).** VS basic menu ≈ **15–18 words**; VS full unlocked menu
  ≈ **25–30 words**; StS main menu ≈ **16 words** (Play/Compendium/Statistics/Settings/Patch
  Notes/Quit + profile widget + version). Button counts: VS basic 5 (+4 top-bar), VS full ~9
  primary + 6 small utilities, StS 6, Balatro Game tab **6 rows**. This hardens the primary's
  "4-6 entries" claim with per-shot numbers.
- **Control-type matching (Balatro Game tab).** 6 rows = 2 cycle steppers (Game Speed, button
  position) + 1 slider (Screenshake) + 3 toggles (stake stickers, high contrast, reduced motion).
  Enums cycle, intensity slides, booleans toggle — no dropdowns anywhere.
- **Shop decision anatomy (Balatro).** Exactly 2 card slots + 2 booster packs + 1 voucher +
  1 reroll button; card faces carry 1–3 words + price, effect text hidden until inspect. Reroll
  $5 +$1/press, resets per shop, never restocks packs/voucher — bounded temptation by design.
- **Draft graceful degradation (VS).** When the pool is maxed/empty the level-up screen fills
  remaining slots with **Gold or Floor Chicken** instead of blanks or an auto-pick — the
  "nothing left" case is still a visible choice, and 2023 v1.6.0 backfills extra items at low
  levels so the screen is never sparse. ([Level up](https://vampire.survivors.wiki/Level_up))
- **Shop price curve as pacing (VS PowerUp).** +10%-of-base escalation per purchase on every
  PowerUp, all-or-nothing refund — the curve, not screen count, paces the meta shop.
- **Mobile-tuned defaults (Balatro).** Same options on mobile, different starting points: CRT
  30% (mobile) vs 70% (desktop), screenshake 50% vs 30%. Precedent for shipping
  device-appropriate defaults instead of hiding settings.

## 3. Extra reference: Halls of Torment

Swapped in where the primary used Luck be a Landlord (both stand; this adds a *settings-shape*
reference rather than a *minimal-surface* one).

- **Menu surface:** Enter Dungeon / Hall of Pain (meta upgrades as a *place*) / Shrine of
  Blessing / Register of Halls — meta shop is a location, not a settings tree.
- **Settings:** four labeled pages (Display / Interface / Input / Audio) with **separate
  Master/Music/SFX/Voice sliders**; **Damage Flash is an intensity slider, not a toggle**;
  **Ability Effect Opacity slider** exists specifically to cut combat clutter
  ([PCGW](https://www.pcgamingwiki.com/wiki/Halls_of_Torment),
  [Steam discussion](https://steamcommunity.com/app/2218750/discussions/0/599649070605201834)).
- **Persistence:** plain `settings.json` (`%APPDATA%\HallsOfTorment\` /
  `~/.local/share/HallsOfTorment/`) — readable, diffable, backupable.
- **Omits:** no difficulty menu (stage picks carry it), no keybinds beyond defaults, no purchase
  confirmations; one-time purchase, zero microtransactions.

**Adopt-list delta (extends the primary's list, does not replace it):** HoT's
sliders-for-intensity pattern (damage flash, effect opacity, audio bus split) strengthens the
primary's adopt-item 1 — if HORDES ever surfaces screenshake/flash settings, they should be
*sliders with a 0 position*, not bare toggles; and VS's Gold/Chicken fallback is the model if
HORDES' draft ever needs a pool-empty state that isn't an invisible auto-pick.

## 4. Confirmations

- Addendum + screenshots only; **no game files changed, no simulator run** (untracked files:
  this doc + `docs/art/menu-ux-dossier-2026-09-18/`; the goals-doc edit belongs to the pilot
  lane, not this one).
- The PC adb runbook is **not** duplicated here — see primary dossier §4 (its constraints stand:
  PC-only pull + decompile, owner's device only, never mirrors, no APK bytes on the VPS).
