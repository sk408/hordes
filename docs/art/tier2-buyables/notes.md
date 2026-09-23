# TIER-2 CONTENT (c) — capture notes (10 new shop buyable rows)

Owner autopilot lane: new BUYABLE rows on stat surfaces the shop already
sells, numbers by analogy to the shipped neighbour rows, tune-after in the
review phase. Reference vocabularies used as magnitude sources only (no
copied strings, no VS/MB pixels): docs/vs_ref power-up rows (POWER 5%,
MAXHEALTH, COOLDOWN, MOVESPEED, MAGNET, GROWTH, GREED) + docs/mb_ref
passives (Bullseye crit damage, Vampire lifesteal, Hoarder potion drops).

## What shipped

- src/meta.js SHOP_UPGRADES +10 classic stat rows (might, toughness,
  cooldown, marathon, magnetism, growth, avarice, bullseye, vampire,
  hoarder), each with a live-desc getter (the shop can never lie about a
  number) and each feeding a consumed applyMetaBonuses seam — no new stat
  surface, no dead row. Bucket OTHER; MID/TOP tier lists untouched.
- src/art/shop_icons.js: one ORIGINAL 16x16 icon per row (A2 house rules:
  1 ink outline, 2 base, 3 rim light, 4 shade, 5 accent; five palette keys
  maximum), registered in test_art_lint EXPECTED_SHOP — never the fallback.
- test/test_tier2_buyables.mjs: registry / live-desc / cost-curve /
  seam-reachability / investment-accounting / ledger-total / icon-per-row
  checks. test_meta stat-line count retargeted 35 -> 45.

## Shots (all: real seam — shopIcon(id), the resolver showShop calls at
## src/main.js:7777, painted with a renderer.drawGrid-shaped adapter)

- buyable-<rowid>.png — one PNG per row (10), 16x16 at 16x on house bg.
- buyables-sheet.png — 5x2 contact sheet, SHOP_UPGRADES order, tags 01..10:
  01 might (sword), 02 toughness (shield-heart), 03 cooldown (clock),
  04 marathon (wing), 05 magnetism (horseshoe magnet), 06 growth (sprout),
  07 avarice (coin stack), 08 bullseye (target), 09 vampire (fang + drop),
  10 hoarder (stash pot).
- Regenerate: node tools/capture_tier2_buyables.mjs (in-tree paths only).
