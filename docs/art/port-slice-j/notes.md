# PORT SLICE J — evidence notes (map-layout composition + uncapped variety)

Owner directives (verbatim): "why only there one building and not much variety
inside a single biome... maybe we need a deeper look at a whole vs map to
understand what a real map layout is like" + "There shouldn't be a limit on
any number of structures. It's literally a somewhat of a more is better
situation here".

## Phase 1 — study (docs/MAP_LAYOUT_STUDY.md)

Read A.3 as maps. Honest headline: A.3 contains NO whole maps — ~22 packed
tileset atlases + ~4,240 single 32x32 st2u_* cells + bg swatches + stage
icons. Composition was reconstructed from the construction vocabulary:
atlases are ~70% repeating wall/floor modules + ~20% edges + ~10% feature
chunks (gates/stairs/towers/arches); grounds are flat quiet fill (bg_green,
bg_bonezone); every one of the 24 stage concepts (section 5) is
(tileset + ONE small destructible); props (section 6) are high-frequency
breakables (maxHp 1) + rare heavies (statues 5/100) + blocker doors (999);
icons compose architecture-band + prop-cluster every frame. Distilled into
the HORDES COMPOSITION GRAMMAR G1..G8 in the study doc. Zone progression /
landmark rhythm in px are UNMEASURED (no whole-map picture exists) and marked
HORDES-NATIVE decisions, not VS measurements.

## Phase 2 — implementation

- 64 original designs (8/biome: 3 anchors + 5 satellites), all fillRect-
  composed, one shared palette per biome (section-13 discipline).
- Every building-cell composes 1 anchor + 2..4 satellites (MAX_SATELLITES=4);
  the slice-E 0.22 density gate is REMOVED (config knob deleted, not
  retuned); pitch 576 -> 384 (2x LANDMARK_CELL).
- Single source: buildingPlacements(seed, stage) feeds paint, collision,
  loot filter, portal + chest clamps — the slice-F mirror retires.
- Lanes not counts: >= 16px edge gap between every kept pair (pilot ~14px),
  fixed order, deterministic drops; all cells' satellites + spawn cluster
  stand clear of the run's fixed floor points (ring + 1, binding).
- No-strand at density: unit pocket walk arrives (236 frames, 0 stall,
  0 penetration); 74-walk sweep worstStall 0, 0 penetrations; ALL REAL
  scenarios green (manual held, auto trap, patrol/flee, portal, horde).

## Per-biome distinct counts (all original, all pinned)

VERDANT_HOLLOW 8 (HOLLOW_LODGE, GROVE_HALL, LOOKOUT + WOODSHED, PALISADE,
LOGPILE, HERB_RACK, STUMP_SHRINE). ASHEN_WASTE 8 (EMBER_HALL, CINDER_GATE,
BASALT_SPIRE + EMBER_CAIRN, BROKEN_PIER, SLAG_HEAP, SCORCH_WALL, FIRE_BOWL).
SNOWFIELD 8 (DRIFT_CHAPEL, BELFRY, PILGRIM_HALL + SNOW_WALL, ICE_CAIRN,
SHRINE_POST, WAYMARK, FROST_STEP). BLOOD_RUST 8 (RUST_KEEP, PROFANE_GATE,
IDOL_TOWER + RUST_WALL, SMALL_IDOL, SPIKE_RACK, RUIN_STAIR, OFFERING_SLAB).
BONE_DESERT 8 (OSSUARY_ARCH, SAND_TOWER, RIB_VAULT + RIB_SPIKE, DUNE_WALL,
BONE_CAIRN, FALLEN_RIB, SANDSTEP). VOID_REACH 8 (VOID_ANNEX, STACK_HALL,
ASTRAL_STAIR + BROKEN_COLUMN, RUNE_SLAB, TOME_PILE, VOID_BRAZIER, ARCH_FRAG).
CINDER_MAW 8 (CINDER_KILN, MACHINE_HOUSE, EMBER_STACK + SLAG_BLOCK, PIPE_RUN,
COAL_HEAP, FURNACE_DOOR, GEAR_RACK). WHITEOUT 8 (CLOCKWAY_STUB, GEAR_HALL,
WHITE_TOWER + SNOW_RAMPART, VANE_POST, CLOCK_FRAG, FROST_CAIRN, LAMP_ROW).

## Perf (binding, slice-G method)

- budget = 14 structures/view at 1100 rects (pinned, fails past it).
- measured: max 12 structures/view, worst 697 rects/view coarse grid
  (816 fine grid), mean 3.08 structures/view (floor pinned >= 2.0),
  ~63 boxes/arena (min 50), tiles visited unchanged (<= 120).
- stopped at: full coverage (no gate) + 2..4 satellites + 384 pitch — the
  rect budget never bound (worst 816 vs 1100); the stop is strand-safety +
  cluster integrity, honestly reported (see unverified flags).

## Pins touched + justification

- test_stage_buildings.mjs: rewritten for kits (64 designs, role-scaled
  format floors, kit coverage, no-gate scans, cluster spawn guarantee,
  >= 40 structures / >= 12 anchors per arena, 16px separation sweep).
- test_building_collision.mjs: AGREEMENT kit-bidirectional, SPAWN cluster
  promise, +dense pocket walk, +74-walk no-stall/no-penetration sweep;
  REAL checks unchanged (all green at density).
- test_port_slice_j.mjs (new): grammar + budget (14 @ 1100) + tiles + floor.
- Retired by owner order: BUILDING_DENSITY knob, single-design spawn
  promise, paint==query mirror test shape (now single-sourced).

## Captures (standard contract, in-tree, live game, advancing clock)

docs/art/port-slice-j/: 16 shots — slice-j-<biome>-composition (densest
cluster of the run's seed, >= 3 whole structures, >= 2 designs, cluster
pair) + slice-j-<biome>-spawn (anchor + satellite whole in view + prop).
Reproduce: HORDES_SHOT_DIR=docs/art/port-slice-j node tools/capture_slice_j.mjs
(green twice, consecutive runs, distinct groundSeeds).

## OWNER-RULING additions (proposed, need owner sign-off)

1. No-count-cap doctrine confirmed for structures: future density work tunes
   pitch/separation/perf only — re-adding any count or density gate needs a
   new owner ruling (this slice deletes the knob so it cannot silently return).
2. Fixed-goal-forever arrival is NOT a pinned property (see flags); if the
   owner wants orbit-proofing (stateful wall-memory in the steer), that is a
   new motion-seam ruling with its own perf/purity review.

## Unverified flags

- Fixed-goal-forever greedy walks orbit concave clusters ~2% of the time
  (identical rate at 384 and 576 pitch; no-stall bound intact, worstStall 0;
  live marks always move — REAL arrivals all green). No stateful fix
  attempted: out of scope for a visual slice, needs ruling 2 above.
- Browser captures are phone-viewport only (390x844@dpr3, the standing
  capture pattern); desktop-wide composition follows the same field math
  (headless sweep covers all cameras) but was not screenshotted.
- test/smoke.mjs load-flake: see suite report (standalone rerun below).
