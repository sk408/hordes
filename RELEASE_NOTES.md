# HORDES — playtest build, 16 September 2026

**Play it:** https://sk408.github.io/hordes/ — hard-refresh when you load it (static site, aggressive caching).
Also embedded on galaxy.click.

---

## The draft is a deck of playing cards

- Every draft offer is a real **playing card**: **rank = rarity**, **suit = family**, and the two **jokers**
  are the rare 1-in-10 chasers (*Second Wind* red, *Storm Shards* black). Thirteen hand-authored motifs —
  no more plain-text offers.
- **Combos are face cards** (J/Q/K) and single rewrites take the freed number slots. The rewrite family is
  **14 cards** strong.
- **One tap takes the card.** The old select-then-confirm step is gone.

## The escape sequence — a side-scrolling change of pace

- A **~1-minute escape** that flips the game side-on. It arrives after a boss (through the portal), and
  **Settings → TEST: ESCAPE SEQUENCE** drops you straight into one if you'd rather not fight for it.
- **You are being chased by a literal horde.** There are never fewer than **3 pursuers** on you: they appear
  just off-screen, charge, and **match your speed as they arrive** — so they get genuinely close and then hang
  at your heels. They don't catch you. **Losing is the collapsing wall behind you, or your own fall.**
- **The pits are your weapon.** Pursuers can't jump, so a gap in the floor eats them — and new ones keep coming.
- Platforming is real: gravity, jump arcs, terraces and lethal gaps. **The finale** puts a boss between you and
  the portal, with an **upper route over it** as the way past — the boss owns the floor, not the whole screen.
- Colour and parallax: it's built to read like a **playable pixel movie**, with the portal and the horde's edge
  as the two brightest things on screen.
- **Shooting is dialled right down** (a fifth of what it was). The chase is the point; the gun is flavour.

## Choose your weapons before the run

The weapon menu is **something you find** in the shop, not something the game pushes at you. A coachmark fires
once, after your first weapon purchase, to make sure you know it exists.

## The shop became a project

- **48 items, ~60+ hours** of end-game income to buy the lot.
- Re-priced so the first real upgrade lands in **2–3 runs** instead of feeling out of reach.
- **Apex tier** for post-catalogue players: *The Mark of the Grind* and *Ascendant Arsenal*.
- **Heat pays now, on both channels** — running manual heat raises both your gold and your per-kill XP.

## Characters

- **Per-character upgrade rows** — each character grows differently.
- **Specialisation**: every character has families it's strong and weak against (KNIGHT HA/RA, WITCH CH/FL,
  ROGUE RA/HA, PALADIN FL/CH), shown on the character screens.

## Cinematics and new content

- A **death movie** and a **portal-entry cinematic**.
- A **per-run map screen**.
- A **new horde wave** with heavy and flying enemies, plus **shrines**.

## Fixed

- **Phone layout.** The on-screen controls used to sit over the playing field, and on landscape the view
  collapsed almost to nothing (as small as 11×7 px). The field is now bounded to the free space between the
  HUD and the pads — full 624×390 in landscape — and where things do overlap, you get a usable field rather
  than a broken one.
- **Shop responsiveness.** Opening the shop and buying from it no longer lags.
- **Fewer taps everywhere** — the draft confirm step is gone.

## Known issues — we know

- **A fresh profile still dies fast** (sometimes in single-digit minutes). The damage cap that pins
  hits-to-kill is being reworked; expect this to move.
- **Balance is deliberately unsettled in two places:** apex pricing and the escape's payout rate are queued
  for a tuning pass now that the escape is a minute rather than two. They are known, not forgotten.
- Some visual checks are **programmatic pixel reads** rather than a human pass, so odd-looking-but-correct
  edge cases can still slip through. If something looks wrong, it probably is — tell us.

## Testers: two things that will save you time

1. **Hard-refresh.** The build is a static site and caches hard. If a feature seems missing, that's usually why.
2. **The escape is one tap away** — Settings → TEST: ESCAPE SEQUENCE. No boss fight required.
