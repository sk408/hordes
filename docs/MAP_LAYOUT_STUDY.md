# MAP LAYOUT STUDY — what a real VS stage looks like end-to-end (PORT SLICE J, Phase 1)

Owner directives carried verbatim:
1. "why only there one building and not much variety inside a single biome...
   maybe we need a deeper look at a whole vs map to understand what a real map
   layout is like"
2. "There shouldn't be a limit on any number of structures. It's literally a
   somewhat of a more is better situation here"

Method: read `docs/vs_port_ref/` (Appendix A.3 = 4,264 stage frames, section 5
= 24 stage concepts, section 13 = tiles, section 6 = props) AS MAPS — asking
how a stage composes end-to-end — then distill what Phase 2 code follows.

## 1. FIRST, AN HONEST CORRECTION: A.3 contains no whole maps

Appendix A.3 ("Stages (4264 thumbs)") is NOT 4,264 pictures of maps. Counted
against the tree, it decomposes into three very different things:

- ~22 PACKED TILESET ATLASES (`atlas_ChapelTexturePacked`,
  `atlas_ForestTexturePacked`, `atlas_LibraryTexturePacked`,
  `atlas_MachineTexturePacked`, `atlas_TowerTexturePacked`,
  `atlas_TP_Stage1_CastleCourtyard`, `atlas_TP_Stage2_MarbleGallery`,
  `atlas_TP_Stage3_ProfaneChapel`, `atlas_TP_Stage4_Water_Level`,
  `atlas_TP_Stage5_ClockTower`, `atlas_bg_*` x6, `bg_*` x6) — construction
  kits, not composed scenes.
- ~4,240 `st2u_*` SLICES — each a SINGLE 32x32px map cell
  (e.g. `st2u_x0y0-w32h32.png`, a near-blank tile). The assembly vocabulary
  of one unified map, sampled one cell at a time.
- Zero composed whole-map screenshots. No start-area shot, no deep-field
  shot, no zoomed-out map exists anywhere in the corpus.

So "what a real map layout is like" CANNOT be measured from A.3 as distances,
zone progressions, or landmark rhythms — there is no end-to-end picture to
measure. What CAN be read is the CONSTRUCTION VOCABULARY (what pieces exist,
how they relate, what repeats, what anchors), plus the concept rows of
sections 5 / 6 / 13. That is what this study does. Where the corpus runs out,
the grammar below says so explicitly and marks the rule HORDES-NATIVE
(a composition decision, not a VS measurement).

## 2. OBSERVATIONS (cited)

### O1. Architecture is walls-plus-floors, never one object in a field
Viewed as pictures, the atlases are unmistakable:

- `atlas_TP_Stage3_ProfaneChapel.png` — ROWS of repeated brick/wall modules,
  arch mouths, stepped wall caps, stair chunks. A wall is a run of 5-20
  identical modules with feature chunks (arch, stair, cap) spliced in.
- `atlas_TP_Stage1_CastleCourtyard.png` — long crenellated wall runs, floor
  blocks, gate/tower chunks, rock outcrops: courtyard fabric, i.e. rooms and
  edges, not objects.
- `atlas_TP_Stage5_ClockTower.png` — stacked tower chunks, red roof features,
  pipe runs, balcony pieces: vertical compounds assembled from parts.
- `atlas_ChapelTexturePacked.png` / `atlas_TowerTexturePacked.png` — window
  bands (repeated stained-glass modules in a stone run), floor carpets,
  furniture/chunk pieces beside the architecture.
- `atlas_LibraryTexturePacked.png` — shelf WALLS (books as wall texture),
  desk/table chunks, carpet floors: the room IS the wall treatment.
- `atlas_ForestTexturePacked.png` — tree masses, water, path/clearing tiles,
  fence and hut chunks: even the "natural" stage is edge-and-clearing fabric.
- `atlas_MachineTexturePacked.png` — grate floors, pipe/wall runs, furnace
  mouths: industrial wall-plus-floor again.

In every atlas the ratio is the same: ~70% repeating wall/floor modules,
~20% edge/transition pieces, ~10% feature chunks (gate, stair, tower, arch).
A VS stage reads as BUILT FABRIC — continuous runs with features spliced in.
The HORDES slice-E shape (one freestanding 64-108px object per 576px cell,
0.22 density) has no counterpart here: nothing in the reference is a lone
object in an empty field.

### O2. The ground between architecture is flat, quiet fill
`bg_green.png` = uniform mottled green noise. `bg_bonezone.png` = uniform grey
speckle with a red seam cross (a zone-boundary tile, i.e. even seams are
authored). `atlas_bg_*` = the same fills cut as tiles. Implication: the field
carries NO identity — identity lives entirely in the structures. A biome must
therefore put structures everywhere the eye lands; empty ground is correct
only as the mortar between structures, never as the whole view.

### O3. Stage identity = one architecture family + ONE small prop, repeated
Section 5, all 24 rows, same shape: `FOREST = ForestTexturePacked + BRAZIER`,
`LIBRARY = LibraryTexturePacked + CANDELABRA`, `CHAPEL = ChapelTexturePacked
+ CANDELABRA`, `TOWER = TowerTexturePacked + CANDELABRA`,
`EX_WESTWOODS = FoscariTexturePacked + LANTERN`, etc. Every stage is
(tileset, exactly one destructible type). Section 6 explains the second half:
25 props, nearly all `maxHp` 1 (BRAZIER, BRAZIER2, CANDELABRA, LAMPOST,
LANTERN...), a middle band at 2-5 (CART 4, WINDOW 5, statues 5), heavies at
100 (KUJATASTATUE) and architectural blockers at 999 (LAB_DOOR_A/B,
LYCA_DOOR, TP_DOOR, levers). So the small prop is a HIGH-FREQUENCY repeat
(rows and clusters of braziers/lamps — the "roadside rows"), while mass comes
from the architecture plus rare heavies (statues) and blocker doors/gates.
Two rhythms, not one: dense small repeats + sparse big anchors.

### O4. The vignettes compose architecture-band + prop-cluster + actors
The `docs/thumbs/ui/stage_*.png` icons are the only in-game composed shots:
`stage_forest` = trees + brazier + creatures together in one 140px frame;
`stage_chapel` = a full window-wall band; `stage_library` = shelf wall +
candelabra + statue + beast; `stage_tower` = floor + candelabra + furniture.
No icon shows an empty field or a single object: every frame has a backdrop
run (wall/trees/shelves) AND a prop cluster in front of it. Foreground and
backdrop are different pieces, composed together, every screen.

### O5. Edges and transitions are first-class pieces
Section 13: 32px autotile sets, 8-16 variants per motif, palette swaps across
stages (`TP_Tileset_Refactor_1_Castle` gothic / `_2_Chapel` same pitch,
different palette / `_3_Reuse` + `_4_ReuseExtra` shared filler). The refactors
share filler across stages and re-skin by palette — i.e. variety comes from
RECOMBINING a small kit, and rims/transitions get their own tiles. For HORDES:
rim behavior and palette discipline per biome are load-bearing, and
recombination (not one-offs) is the honest variety engine.

### O6. What the corpus does NOT say (gaps, marked HORDES-NATIVE below)
No whole-map picture means: start-area vs deep-field zoning, landmark spacing
in px, corridor/path widths, and big-anchor cadence are UNMEASURED. The
grammar fills these with HORDES-native decisions driven by our own constraints
(spawn legibility, pilot fit, measured rect budget) — stated as such.

## 3. HORDES COMPOSITION GRAMMAR (what Phase 2 code follows)

- G1 CATALOG DEPTH (from O1, O3, O5): every biome ships a RECOMBINANT kit —
  3 large anchors + 5 satellite outbuildings = 8 distinct structures minimum —
  sharing one palette (the section-13 palette-swap discipline). No preset cap
  on counts anywhere; the bounds are measured perf (G7) and pilot fit (G6).
- G2 ANCHOR + SATELLITES (from O1, O4): every building-cell composes
  1 anchor + 2..4 satellites — a hamlet/compound/ruin/cluster, never a
  singleton. Satellites are smaller (20-72px vs 60-120px anchors), placed at
  compass slots around the anchor with hash jitter, edge gaps 16-64px.
- G3 FULL COVERAGE, RHYTHM BY GEOMETRY (from O2, owner directive 2): EVERY
  building-cell composes — the rare-gate (slice-E 0.22) is REMOVED. Spacing
  rhythm comes from the 384px cell pitch (2x LANDMARK_CELL — moved in from
  576 during the slice because the measured per-view budget never bound, and
  hamlets should punctuate most views; cluster spans <= ~380px, so lanes
  survive between clusters): hamlets with lanes between them, not carpet.
  O(view) by construction — off-screen cells are never visited, so
  "uncapped" still costs only what the camera sees. Measured stop point:
  2..4 satellites/cell, ~63 boxes/arena, worst view 8 structures at
  816 rects against the 1200-rect landmark budget (test_port_slice_j.mjs).
- G4 SPAWN SHOWS THE COMPOSITION (from O6 + the slice-D promise): the initial
  view always contains a WHOLE cluster (anchor + >= 1 satellite, deterministic
  per seed/stage), rigid-clamped into the spawn view, with the run's fixed
  floor points (footing, first-run draught, milestone chest slot) cleared by a
  rigid cluster shift. Generalizes slice-E's one-building promise.
- G5 LANES, NOT COUNTS (from O6 + slice-F strand work): separation is the only
  placement floor — >= 16px edge gap between every pair of kept boxes
  (the pilot is ~14px; ring 7px), enforced arena-wide in fixed order, drops
  deterministic. If density ever breaks the no-strand property, placement
  yields ALONG PATHS (wider gaps), never a count cap — abundance in freedom,
  never a trapped pilot.
- G6 SINGLE SOURCE (from the slice-F mirror warning): one pure function of
  (seed, stage) emits every placed box; paint, collision, loot-filter, portal
  and chest clamps all read it. Paint == query by construction, no mirror to
  drift.
- G7 MEASURED BUDGET (from O2 + slice-G method): placement density is pushed
  until the measured per-frame bound; the budget is stated as
  "N structures/view at M rects" with tiles-visited unchanged, pinned by a
  test that fails past it.
- G8 PER-BIOME CHARACTER (from O1-O4; satellite roles per biome):
  VERDANT_HOLLOW hamlet (timber lodge + sheds/palisades/log piles);
  ASHEN_WASTE ruin-field (basalt hall + piers/walls/ember blocks);
  SNOWFIELD chapel-close (chapel + belfry/halls/walls/shrines);
  BLOOD_RUST keep-compound (keep + gates/walls/idols/stairs);
  BONE_DESERT ossuary-field (arch + rib vaults/towers/spikes/cairns);
  VOID_REACH library-court (annex + stack halls/stairs/columns/slabs);
  CINDER_MAW kiln-yard (kiln + machine houses/stacks/pipes/slag);
  WHITEOUT clock-compound (clock stub + gear halls/towers/vanes/walls).
