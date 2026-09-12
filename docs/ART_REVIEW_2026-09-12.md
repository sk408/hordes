# HORDES — art review, A1 assets (2026-09-12)

By remy (run lead), using a real browser + vision read. **This is the first time these assets have
actually been seen.** A1's own report said so plainly: the format was machine-verified (1,746 lint checks)
but "no human has looked at its pixels yet."

## Why nobody could see the art before: two bugs in the preview page

Both in `tools/art_preview.html`, both found and fixed by remy this session.

1. **Flat assets never drew at all.** The grid loop used `const frames = a.frames || [a]`. A flat asset
   (`{id, grid, palette, …}`) has no `.frames`, so the fallback handed `drawGrid` the whole asset *object* —
   and `for (let ry = 0; ry < grid.length; ry++)` on an object iterates `undefined`, so the loop never ran.
   **All 22 trophies and all 27 shop icons rendered as nothing but their labels.** Animated assets
   (portraits, portal) were unaffected, which is why they were the only sections with visible content.
   Measured: trophy grid ink 10,435 px before → **154,275 px** after; shop icons 7,555 → **58,563**.
   Fix: `const frames = a.frames || [a.grid];`
2. **The zoom never applied to sprites.** `drawGrid` paints one 1×1 rect per pixel, so scale has to come from
   a canvas transform — and only the title path set one. Grid cells were laid out at `scale` while sprites
   drew at native size, and the "FULL-SCREEN READ" panel drew a 32px sprite in the corner of a 256px box
   (194 ink pixels; it now shows a real 256px sprite at 15,232 px ≈ 23% fill, matching the lint's ≥20%
   silhouette floor). Fix: `g.setTransform(scale, 0, 0, scale, …)` around both draw paths.

**Lesson for the process:** a stub-DOM harness that counts `fillRect` calls passes happily while the real
page draws nothing. Counting non-transparent pixels is also worthless — every canvas measured 100% opaque
because the background is painted. The only measurement that worked was **counting pixels that are neither
background nor checkerboard**, plus a real screenshot. A code claim is not evidence for art.

## The verdict on the icons (aux vision at 4×, labels visible)

Read as: **a competent prototype / asset-pack set**, not a shipped first-party set. Consistent house palette
and flat cel-shade, so it is not a random pile — but **the labels are doing most of the semantic work.**
With labels, ~80% interpretable; without them, roughly 60–65%.

**Shipping quality:** `KILLS_100/1000/10000` (gold medallions with I/II/III — the cleanest in the set),
`FIRST_BOSS` (crown + gem), `CHESTS_25` (chest with spilling coins), `SHOP_MASTER` (balance scales),
`FULL_BUILD` (goblet + star), `SURVIVE_10MIN/20MIN` (hourglass), `FIRST_BLOOD` (blood drop).

**Rejected in review — these do not read:**
| icon | what it actually looks like |
|---|---|
| `ARCADE_PASS` | red/orange column with a white top and yellow band — a token stack, lollipop, joystick or fire hydrant. Not a pass/ticket. |
| `FIRST_EVOLUTION` | purple angular shards in a V — lightning, a DNA strand, a shard, a cursor. Nothing says "evolution". |
| `ALL_CHARACTERS` | grey mask-helmet with yellow dashes and a cross cutout — helmet, shield, robot face or hazard sign. |
| `GOLD_10K` | a muddy blob of three gold clusters with white glints; not obviously coins, and no sense of "10k". |
| `BOSS_SLAYER` | a gold X over a lump. Not clearly a skull or a slain boss. |
| `WAVE_5/10/20` | red kite gems with white zigzag lines — **the zigzag reads as cracks/damage, not a wave.** The size escalation works; the metaphor is wrong. |
| `MAX_WEAPON` | readable-ish as a sword but the thinnest silhouette weight in the set. |
| `UNTOUCHED_WAVE` | shield + heart is a clear concept, but the heart's two black dots read as eyes, making it look like a mascot. |

**Systemic issues, not per-icon ones:**
- **No colour hierarchy.** Gold + red cover ~70% of the set, so nothing stands out by tier.
- **Weight is inconsistent.** Thin strokes (`MAX_WEAPON`, `SHOP_MASTER`) vs full-block masses (`WAVE_20`,
  `ALL_CHARACTERS`); some fill the box edge-to-edge, others float in dead space.
- **Detail and lighting are inconsistent.** Coins are dithered and riveted with top-left highlights; the
  gems scatter theirs; the hourglass is flat and nearly unlit. (Line work is the one strong unifying
  decision: minimal outline, pure fill shapes.)
- **Thematic mismatch:** it is called a trophy set but only `FULL_BUILD` is a trophy; the rest are coins,
  gems, hourglasses and shields.
- One accidental win worth keeping: the recurring small **red square rivet/gem** on crown, boss, chest and
  goblet ties the set together.

**Caveat:** this is an auxiliary vision model's read at 4×, not the owner's eye. The specific per-icon
failures are actionable, but the final call on shipped art belongs to Sk408.
