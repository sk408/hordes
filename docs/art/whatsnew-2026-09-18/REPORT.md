# What's New for Returning Players — 2026-09-18

## The answer first: no, lastPlayed did not exist

Before this change, **nothing in the save system recorded when a profile was
last played.** The timestamps that did exist were all for other purposes:

- `main.js:3952` / `main.js:3965` — the night-session window check uses a
  **transient** `Date.now()` each load; it is never persisted.
- `main.js:10023` — the per-run seed entropy reads the clock; not stored.
- `achievements.js:402` — per-achievement `earned` times (trophy metadata
  only; cannot tell "this player was away").
- `audio.js` — a `lastPlayed` map for sound throttling, in-memory only.

So there was no way to distinguish a returning player from an active one, and
no way to gate "tell them what they missed." This change adds it.

## What shipped

### 1. `lastPlayed` + `lastSeenUpdate`, one schema bump (v9)

`src/save.js` — `PROFILE_VERSION` 8 → 9, one migration step (v8 → v9) that is
**pure and lossless**: both new fields are set to `null` when absent, nothing
else is touched, unknown fields keep surviving as before. Existing saves load
with `lastPlayed: null` — nothing is invented.

`validateProfile` repairs both fields with the same field-by-field,
never-invalidate-the-profile discipline: a finite number > 0 floors, anything
else becomes `null`, every repair is reported.

`src/main.js` gains a single save choke point — `persistProfile()` — which
stamps `profile.lastPlayed = Date.now()` and writes. All 17 former
`saveProfile(profile)` call sites (autosaves, shop buys, run end, pagehide
flush, ...) route through it, so **the timestamp moves on every save**. A
silent-failure test pins exactly that: save twice, the value must advance.

### 2. The "What's New" paper popup

A release constant in `main.js`:

```js
const WHATS_NEW = {
  id: '2026-09-18', dateMs: Date.UTC(2026, 8, 18), worthTelling: true, ...
};
```

At title-screen launch the game calls `whatsNewDueFor(profile, release,
freshBoot)`, which requires ALL of:

- the release is **marked** `worthTelling` (nothing pops for small ships);
- not a fresh boot;
- `profile.lastSeenUpdate !== release.id` (shown **once** — the dismissal
  persists it through the same choke point);
- `lastPlayed` is `null` **or** predates the release date (a missing
  timestamp counts as not-seen, per spec).

The gate runs **only at launch** (a `whatsNewTried` latch), never mid-session.

**Precedence rule (implemented and tested):** a brand-new profile gets the
first-run PROLOGUE, never the popup; a returning profile gets the popup,
never the prologue. The two are mutually exclusive by construction — the
prologue arms on `achievements.totals.runs === 0`, the popup requires a
non-fresh boot result.

The popup itself is a `div.card.paper-note` prepended as the first card on
the title menu: parchment gradient (`#fff6d6 → #e8d5a6 → #d2ba88`, fully
opaque), aged border, drop shadow + inner burn-in. Copy is a short plain
list of what the player GETS (the guided run + shielding potion, staged
controls, skipping keeps the shield, the card ceremony, shop paging). No
emojis. Always dismissible — tapping the note closes it and persists; it
never blocks the menu behind it.

### 3. Completely local

No network anywhere in the path: the release id/date live in code, the
shown-flag and timestamp live in the same localStorage profile.

## Addendum (owner 2026-09-17): one treatment, two audiences

> "We could even let older players have a one off run just like new players
> would have. ... And dismissing the popup should write a save so we know the
> player saw it"

### The one-off guided run

A returning player converting on a marked release gets the note AND the
**same one-off guided run a new player gets** — potion, banners, staged
controls, assisted start: the whole `state.prologue` machinery, nothing
veteran-specific. **No new field:** it keys off `lastSeenUpdate`.

The lifecycle, end to end:

- The note's dismissal writes `lastSeenUpdate = <release id>` **immediately**
  through the one save choke point (a player who closes the tab right after
  the tap never sees it again — the persisted BYTES change on the tap, which
  a test asserts the same way the timestamp's "prove it moved" discipline
  does).
- `veteranIntroDueFor` (pure, in `main.js`) says the guided run is due when
  `lastSeenUpdate === <release id>` (dismissed, run not yet taken) OR the
  note is due right now (the player tapped START GAME without dismissing —
  converting all the same).
- `startRun` arms the prologue for that player and **consumes the offer in
  the same breath**: it clears `lastSeenUpdate` and persists — so the run
  that opened with the tutorial IS the one-off, and the persist also stamps
  `lastPlayed` past the release date, closing the note's date gate too.
  One save path, no second writer.
- A player who dismisses but quits before running gets the guided run on
  their NEXT run, days later — the offer survives reloads because it lives
  in `lastSeenUpdate`, not in memory.
- The approved SKIP works from this entry point (tested): skipping stops
  the explaining, the phase stays armed in skipped mode, and the drink still
  pays the 45s shield.

### Converting players without a timestamp: the documented sentinel

`lastPlayed === null` is the **documented sentinel** meaning "played before
we tracked this" (`src/save.js`, v8→v9 migration step). It is an honest
unknown — never a fabricated plausible-looking date (false data would be
worse). The first real save stamps a true timestamp over it.

### The population rules, plainly

| profile state | treatment |
|---|---|
| no `lastPlayed` + other save data | older player → note + one-off guided run |
| no `lastPlayed` + no save at all | fresh profile → prologue, no note |
| `lastPlayed` present | normal rules (`lastSeenUpdate` decides) |

Two fields total, one version bump (v9), one migration step — unchanged.

## Verification

### Headless tests (`test/test_whatsnew.mjs`, 46 checks)

- the timestamp MOVES between saves (silent-failure trap);
- a v8 save migrates losslessly (gold, purchases, unlocks verbatim) with both
  fields `null`; garbage values repair to `null` and are reported;
- the pure gate matrix: marked + old → shown; unmarked → never; fresh
  profile → never; already-seen → never; active player (recent lastPlayed) →
  never; missing lastPlayed → shown;
- the REAL title path renders the note as the first card; a real tap dismisses
  and persists `lastSeenUpdate`; the game stays on the playable title screen;
- launch-only (a mid-session state change does not summon it);
- prologue precedence both ways;
- the dismiss WRITES THE SAVE (the persisted bytes change on the tap);
- the veteran matrix: older player → run due; dismissed-not-run → due;
  fresh profile → not due; active player → not due; unmarked → not due;
  `lastPlayed` present → `lastSeenUpdate` decides;
- the REAL arm: `startRun` on the returning profile arms the full treatment
  (potion, stage-clean, buttons locked) and CONSUMES the one-off in the same
  breath (`lastSeenUpdate` cleared + persisted, `lastPlayed` stamped);
- skip from this entry point stays armed in skipped mode, the drink pays the
  shield and ends the phase;
- the next `startRun` is a normal run (once);
- dismissed-but-never-ran arms again on a later run (the offer survives).

Schema pins across the suite were bumped to the **literal 9** with
intentional-pin comments (`test_save.mjs`, `test_g19_character_upgrades.mjs`,
`test_save_v3_characters.mjs`, `test_encounters.mjs`), and the stub-DOM
element factories that the note's `insertBefore` prepend needs were extended
(`test/_harness.mjs`, `test_pilot_pref.mjs`, `test_rss8_magnet.mjs`,
`test_ult_mana.mjs`).

**Full suite: `greenfiles=153 redfiles=0`.**

### Browser verifier (`tools/verify_whatsnew.mjs`) — ALL OK at both viewports

Seeds a real v8 profile, loads the real page in Chromium (CDP), and proves:
migration on load, the note is the first card, the parchment gradient +
cursor styles are live, the card fits the viewport with the menu reachable
behind it, a real tap dismisses + persists, a reload does not re-pop, the
lastPlayed stamp moves across the session — and (the addendum leg) the
dismissed veteran arms the full guided run on START GAME, the arm consumes
the one-off persistently, the approved skip + drink pays the shield, and the
next run is a normal run.

### Screenshots

- `shots/whatsnew-390x844.png` — phone (390×844 @3x)
- `shots/whatsnew-320x568.png` — small phone (320×568 @3x)

Legibility was checked with pixel ground truth, not just eyeballs: in the
text-free margin band inside the card there are **0 dark background pixels**
— the parchment is fully opaque, no bleed-through — and the bottom padding
measures 22 CSS px. (An automated vision pass claimed transparency and
"zero padding"; pixel sampling disproved both, and the same pass read the
game's title as "HEROES".)

## Files

- `src/save.js` — v9 bump, migration step (null sentinel, documented),
  validation for both fields
- `src/main.js` — `WHATS_NEW` constant, `whatsNewDueFor`,
  `veteranIntroDueFor` (the addendum's one-off-run gate), `persistProfile`
  choke point, `addWhatsNewCard` / `dismissWhatsNew` (dismiss writes the
  save immediately), the startRun veteran arm + consume, launch gate,
  `__TEST.whatsNew` seam
- `index.html` — `.card.paper-note` parchment CSS
- `test/test_whatsnew.mjs` — new
- `test/test_save.mjs`, `test_g19_character_upgrades.mjs`,
  `test_save_v3_characters.mjs`, `test_encounters.mjs`,
  `test/_harness.mjs`, `test_pilot_pref.mjs`, `test_rss8_magnet.mjs`,
  `test_ult_mana.mjs` — pins + stub `insertBefore`
- `tools/browser.mjs` — harness profiles seeded as active players
- `tools/verify_whatsnew.mjs` — new browser verifier
