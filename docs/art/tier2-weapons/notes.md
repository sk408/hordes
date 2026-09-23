# TIER-2 CONTENT (e) — capture notes (4 new weapon archetypes)

Owner autopilot lane: new weapons entering the existing draft ladder and price
ladder, numbers TUNE-AFTER. ORIGINAL instances of shipped behavior classes —
piercing / burst-on-kill / chain-with-body / bombardment (docs/vs_ref
SPEC-weapons "passes through enemies" / "boomerang effect" / "bounces around" /
bombardment + docs/mb_ref projectile vocabulary as CLASS sources only; no
foreign names, no foreign pixels, no text baked into sprite art).

## What shipped

- src/weapons.js: WEAPONS + updateJavelin/updateEmber/updateRicochet/
  updateMeteor + WEAPON_TYPES/WEAPON_NAMES/WEAPON_STEPS/WEAPON_LADDERS
  (additive). Effects ride EXISTING seams only: hurt :290, pierce budget :423,
  kill-detect :590, AoE apply :707, nearestEnemy :271, rateScale :227,
  dmgScale :250, critRoll :259, weaponLevelParams :1032, kind-tagged bodies
  :41-43, state.effects {kind,x,y,age,ttl} :45-49. No new stat surface, no new
  resource, no on-kill economy (EMBER's burst is damage only), no mid-flight
  homing. EVOLUTION: NONE stated for all four (EVOLUTION_DEFS has no row;
  evolveWeapon returns reason 'type', evolutions.js:134).
- src/meta.js WEAPON_PRICES: 4 additive rungs (JAVELIN 900 / EMBER 75000 /
  RICOCHET 165000 / METEOR 340000), each between its key-order neighbours.
  Existing rungs byte-unchanged. STARTER_WEAPONS untouched.
- src/art/cards.js: rank '1' NUMBER allowance (CONTRACT UPDATE in
  test_card_art_expansion.mjs) + 4 motifs + 4 CARD_EXPANSION weapon cards.
  src/draft_card_art.js WEAPON_OFFER_TO_DECK joins them for the LOADOUT menu.
- src/art/shop_icons.js: one ORIGINAL 16x16 icon per new shop row (A2 house
  rules). src/sprites.js WEAPON_ICONS: one 5x5 HUD icon per archetype.
- src/render.js: paintProjectileBody exported from the frame loop (same
  painters, same phase sources) so captures render through the REAL draw path.
- test/test_tier2_weapons.mjs: registry / price-ladder integrity / draft weight
  + computed odds / live-desc / unlock / evolution-NONE / fire path / ledger.

## Shots (all: real seam)

- weapon-<id>-icon.png — one PNG per new weapon (4), 16x16 at 16x on house bg,
  resolved through shopIcon(id) (the resolver showShop calls at src/main.js
  :7777) and painted with a drawGrid-shaped adapter.
- weapon-<id>-projectile.png — JAVELIN / EMBER / RICOCHET bodies, fired through
  the REAL updateWeapons against a planted foe and drawn through
  paintProjectileBody (src/render.js — the SAME painter the frame loop calls).
  METEOR ships icon-only: its fire path emits a nova_pulse tell + mine_blast
  land through existing effect seams (no persistent body) — the contract's
  "projectile + icon if iconed" allows this.
- tier2-weapons-sheet.png — 2x4 contact sheet, lane order, index tags 01..04:
  01 javelin (Sun Javelin), 02 ember (Ember Shot), 03 ricochet (Ricochet),
  04 meteor (Meteor, icon-only cell).
- Regenerate: node tools/capture_tier2_weapons.mjs (in-tree paths only).

## Frozen (pinned by test/test_tier2_weapons.mjs)

Registry presence, price-ladder key order + between-neighbour placement,
draft weight 1 + odds computed from the live tables (quoted in the report),
live-desc tracks WEAPON_STEPS via rebuildWeaponTable, unlock rows priced at
their WEAPON_PRICES rung, evolution NONE (reason 'type'), fire path bodies +
EMBER kill-burst (no gold/heal), RICOCHET bounce, METEOR telegraph+land,
ledger total 45,586,841g / 64 rows.
