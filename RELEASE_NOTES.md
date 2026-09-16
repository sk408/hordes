# HORDES 1.0 — 16 September 2026

**Play it:** https://sk408.github.io/hordes/ — hard-refresh when you load it (static site, aggressive caching).
Also embedded on galaxy.click.

HORDES is a pixel-art survivor game. You hold a shrinking arena against waves that keep escalating, draft a
build as you go, and bank your gold into permanent upgrades between runs. The run ends when you do — or when
you beat the boss, take the portal, and make the escape.

---

## How a run works

1. **Hold the arena.** Enemies arrive in waves and get heavier as the clock runs.
2. **Draft as you level.** Each level-up offers you cards. Take one.
3. **Kill the boss, take the portal.** Each boss you kill opens a portal, and the portal is a way out.
4. **Bank the gold.** Everything you earn between runs buys permanent upgrades. Death pays.

## The draft is a deck of playing cards

- Every offer is a real **playing card**: **rank = rarity**, **suit = family**.
- The two **jokers** are the rare 1-in-10 chasers — *Second Wind* (red) and *Storm Shards* (black).
- **Combos are the face cards** (J/Q/K); single rewrites take the number slots. Thirteen hand-authored
  motifs mean every card is drawn, never described.
- **One tap takes the card.**

## The escape sequence

- A **~1-minute escape** that flips the game side-on — a playable pixel movie, with colour and parallax, the
  portal and the horde's edge the two brightest things on screen.
- **You are being chased by a literal horde.** There are never fewer than **3 pursuers** on you. They appear
  just off-screen, charge, and **match your speed as they arrive** — so they get genuinely close, then hang at
  your heels. They don't take you. **You lose to the collapsing wall behind you, or to your own fall.**
- **The pits are your weapon.** Pursuers can't jump, so a gap in the floor eats them — and more keep coming.
- Platforming is real: gravity, jump arcs, terraces, lethal gaps.
- **The finale** puts a boss between you and the portal, with an **upper route over it** as the way past. The
  boss owns the floor, not the whole screen.
- **Shooting is deliberately sparse.** The chase is the point; the gun is flavour.

## You choose your weapons before the run

The weapon menu is **something you find** in the shop, not something the game hands you. A one-time coachmark
fires after your first weapon purchase so you know it's there.

## The shop is a long game

- **48 items** — roughly **60+ hours** of end-game income to buy the lot.
- Paced so the first real upgrade lands in **2–3 runs**.
- **Apex tier** for post-catalogue players: *The Mark of the Grind* and *Ascendant Arsenal*.
- **Heat pays on both channels** — running manual heat raises your gold *and* your per-kill XP.

## Characters

- **Per-character upgrade rows**, so each character grows differently.
- **Specialisation**: each character has families it is strong and weak against — KNIGHT HA/RA, WITCH CH/FL,
  ROGUE RA/HA, PALADIN FL/CH — shown on the character screens.

## Enemies, cinematics and extras

- A **horde wave** with heavy and flying enemies, plus **shrines**.
- A **death movie** and a **portal-entry cinematic**.
- A **per-run map screen**.

## On a phone

The playing field is bounded to the free space between the HUD and the on-screen controls, in portrait and in
landscape both, so the controls never sit over the action. Where space runs short you get a smaller field
rather than a broken one.

## Known issues

- **A fresh profile dies fast** — sometimes in single-digit minutes. The damage cap that pins hits-to-kill is
  being reworked; expect this to move.
- **Two balance dials are deliberately unsettled:** apex pricing, and the escape's payout rate, which is set
  for a longer escape than the minute it is now. Both are queued for a tuning pass.
- Some visual checks are **programmatic pixel reads** rather than a human pass, so odd-looking-but-correct
  edge cases can still slip through. If something looks wrong, it probably is — say so.

## Getting started

1. **Hard-refresh** when you load it. The build is a static site and caches hard; if something seems missing,
   that's usually why.
2. **The escape is one tap away** — Settings → TEST: ESCAPE SEQUENCE. No boss fight required.
