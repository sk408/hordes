# SHRINE ART RETHEME — capture notes (altar/shrine vocabulary)

Owner brief 2026-09-23: retheme the world shrines toward ALTAR/SHRINE using
the generated reference set in docs/gen_ref/shrine-altars/ as the vocabulary
source (replacing the retired megabonk+VS ember/idol/pylon read). Original
grids only — the five reference PNGs are READ-ONLY vocabulary; every pixel
below is hand-composed in hordes' integer-grid style (no foreign pixels, no
tracing, no imports from docs/gen_ref/).

## Variant selection (3 of 5 — SHRINE_WORLD_COUNT stays 3)

Chosen (they sit together in one field, so silhouette + hue separation rule):

- orb  <- docs/gen_ref/shrine-altars/01-energy-altar.png
  Floating cyan orb over a carved stone basin. Silhouette family: offering
  vessel with a detached round mass on top (the float gap is the read).
  Hue: aqua-cyan tell on warm tan sandstone — the only cool-dot variant.
- coil <- docs/gen_ref/shrine-altars/02-magnet-shrine.png
  Copper coil pillar under a hovering iron ring (see-through hole, spark
  flecks in the hover gap). Silhouette family: wide flat band on top of a
  striped column — the only top-wide/holed variant. Hue: copper body
  (marker) with blue-white spark tells — the only warm-mass variant.
- hood <- docs/gen_ref/shrine-altars/04-cursed-statue.png
  Hooded hunched statue with a sickly green chest-glow core. Silhouette
  family: humanoid figure (pointed hood + face void) — the only figure.
  Hue: sickly lime-green tell on green-tinted grey stone.

Dropped:

- 03-challenge-brazier.png — least change from the current set: it is the
  same brazier-bowl-on-pedestal read as the retired ember variant, and its
  bowl+base massing collides with the orb altar at 14x12 (both are wide
  vessel over stepped base). Owner asked for "a good change from the
  current shrines" — a fourth fire brazier is not that change.
- 05-king-statue.png — figure-on-plinth silhouette collides with the hood
  statue at 14x12 (two robed humanoid figures cannot be told apart at the
  real grid size; readability beats detail). Its gold trim also fights the
  coil's warm copper for the warm band of the hue wheel.

Marker-hue triangle (palette key 4): cyan #30d8f0 (orb, ~188deg) / copper
#d08848 (coil, ~28deg) / lime #7ae040 (hood, ~95deg). Tightest pair is
orb/hood (~93deg aqua-vs-lime) — mitigated by maximal silhouette contrast
(detached orb vs hooded figure), per the brief's readability-first rule.

## What shipped

- src/art/shrines.js — ROWS/PALETTES/GLINTS recomposed for
  SHRINE_VARIANTS = ['orb', 'coil', 'hood'] (was ['ember', 'idol', 'pylon']).
  14x12 kept; the stepped-plinth massing (rows 9-11) is shared by all three
  exactly as before. Format contract frozen: buildGrid/finish/SHRINE_ART/
  shrineArtFor/paintShrine unchanged in shape, SHRINE_SPENT greys untouched,
  glint pixels retained (2 per variant, painted in ink 5 when lit),
  paintShrine stays integer-fillRect-only (no text). Honest display intact:
  shrineArtFor resolves by POSITION in state.shrines only — zero blessing
  information (the hidden roll must not leak; no per-blessing colors).
- test/test_port_slice_k2.mjs — pin updates for the renamed variants (see
  REPORT of the brief cycle) + new coverage: palettes carry all 8 keys,
  glints in range. Semantics sections (cost, rearm, seeding, pool
  exhaustion) untouched.
- tools/capture_shrine_retheme.mjs — offline PNG writer (house pattern,
  no libs, no browser) rendering each variant through the REAL painter
  seam (paintShrine) via a fillStyle/fillRect adapter that magnifies the
  painter's 1x1 world rects by 16x (paintShrine is scale-free by contract;
  the magnification is capture chrome).

## Palette rows (lit; SHRINE_SPENT shared greys used when spent)

orb  (01-energy-altar.png): 1 ink #1c1610 | 2 stone-dark #5c4e3c |
  3 stone #8c7a5e | 4 trim/marker #30d8f0 (orb body) | 5 trim-hi/glint
  #d8ffff (orb core) | 6 dark detail #3a2e22 (basin hollow, carved mark) |
  7 bright tell #7af0e8 (orb reflection in the basin) | 8 shadow #0e0a08.
  Glint: (5,1)(6,1) on the orb core.

coil (02-magnet-shrine.png): 1 ink #14100c | 2 stone-dark #4a4a54 |
  3 stone #7a7a88 (iron ring + plinth) | 4 trim/marker #d08848 (copper
  coil) | 5 trim-hi/glint #ffc888 (ridge highlight) | 6 dark detail
  #2a2a32 (coil ridges) | 7 bright tell #9ad8ff (blue-white sparks) |
  8 shadow #0a0a0e. Glint: (5,4)(6,4) on the ridge highlight.

hood (04-cursed-statue.png): 1 ink #101410 | 2 stone-dark #3a4a3a |
  3 stone #5a6e5a | 4 trim/marker #7ae040 (chest glow) | 5 trim-hi/glint
  #c8ffa8 (glow core) | 6 dark detail #243024 (face void, sash) |
  7 bright tell #8aff70 (glow ring) | 8 shadow #0a0e0a (under-hood).
  Glint: (6,6)(7,6) on the chest core.

## Shots (all: REAL painter path — paintShrine on a capture adapter)

- shrine-retheme-<orb|coil|hood>-lit.png — 240x208 (14x12 at 16x + 8px pad),
  house bg #0a090e.
- shrine-retheme-<orb|coil|hood>-spent.png — same grids in SHRINE_SPENT,
  no glints (the frozen darkening semantics: lit = !sh.used).
- shrine-retheme-sheet.png — 720x416, 3 cols (orb, coil, hood) x 2 rows
  (lit top / spent bottom), index tags 01..03 in col order.
- Regenerate: node tools/capture_shrine_retheme.mjs (in-tree paths only).

## Not reproducible at 14x12 (disclosed losses)

- 01-energy-altar: the shallow birdbath proportions compress into a chunky
  3-row basin+drum mass; the skull-face carving on the drum is reduced to
  two dark slits (row 8). The orb keeps its float gap (row 3) — the
  reference's key read. GUESS: the basin hollow's oval read (a 10px dark
  band is the whole opening).
- 02-magnet-shrine: the torus hole is 6px of transparency in one row
  (r1) — a true ellipse cannot exist at this grid size. Individual coil
  rings become 2-row stripe pairs (copper row + dark ridge row) rather
  than distinct toruses. The reference's ~20 ring ridges compress to 4
  copper bands. GUESS: spark scatter positions (reference is random
  spray; two static flecks placed at the hover gap and the coil flank).
- 04-cursed-statue: the gaunt face (closed eyes, sunken cheeks) is lost —
  the face reads as a hood-shadow void (row 3). Clawed hands and green
  claws reduce to shoulder/arm masses with no digits. GUESS: the chest
  cavity's cracked-rib surround (a 4x2 glow core stands in for it).
- All three: the reference midtone banding (6-8 stone tones) compresses to
  the house 8-key contract (1 ink / 2 stone-dark / 3 stone / 4 marker /
  5 glint / 6 detail / 7 tell / 8 shadow).

## Frozen (byte-identical, pinned by test/test_port_slice_k2.mjs)

Purse debit rules, re-arm latch (one sale per approach), blessing
pool/roll/rng order, cost curve, darkening-on-exhausted semantics; aura
pulse + coin-glyph blink timing; radar/map gold marks (#ffd75e); art-lint
counts (module still not enumerated). Honest display: variant = index in
state.shrines, never the blessing (K2-R1 per-blessing colors stay REJECTED
— see docs/art/port-slice-k2/notes.md OWNER-RULING).
