# PORT SLICE J2 — weapon/projectile body sprites (evidence notes)

Visual-only re-dress of every archetype's in-flight projectile body in the
integer-grid fillRect style. Zero mechanics changes (painters only).

## Mechanism (file:line, post-slice)

All art lives in `src/render.js` (raw-hex `fillStyle` + `fillRect`, the file's
existing convention — `test_art_lint.mjs` governs `src/art/` grids only, so
no `pal.*` rule applies here):

- Traveling bodies (projectile loop): `src/render.js` ~988-1085
  - VOLLEY arrow (kind-less): orientation from sim `vx/vy`, 8-way quantized.
  - BOOMERANG crescent (`p.kind === 'boomerang'`): shipped `age*20` spin kept.
  - SEEKER missile (`p.kind === 'seeker'`): shipped `p.ang` geometry kept.
  - MINE (`p.kind === 'mine'`): shipped `(age*2)` 1Hz lamp kept.
- Effect-loop bodies (additive, slice-h painters otherwise byte-identical):
  - ORBIT blade (`fx.kind === 'orbit'`): full redress of the flat dot.
  - ZAP bolt head (`fx.kind === 'zap'`): +5-rect diamond at `points[1]`.
  - NOVA motes (`fx.kind === 'nova_pulse'` only): +4 rects; all other ring
    kinds paint byte-identically to slice-h.
  - SCYTHE blade (`fx.kind === 'scythe_arc'`, landed sweep only): +3 rects;
    windup untouched.
  - BEAM pulse (`fx.kind === 'beam'`): +3-rect packet at `d = t*len`.

Flight paths, speeds, damage, cooldowns, hit boxes, ttls, triggers, pool
bounds: untouched. No new projectile/effect kinds (slice-h KNOWN sets hold).

## Reference rows (DESIGN_REFERENCE_VS.md section 12 / A.7, concepts only)

| Archetype | Reference vocabulary | Original treatment |
|---|---|---|
| VOLLEY arrows | SpearShape/SpearTip ice lance (A.7) | directional shaft + white head + ember fletch |
| ORBIT blades | fl00-fl88 flower/leaf + inner/outer pentagram rings | steel petal bar + white edge + blue fuller + glint |
| BOOMERANG | axes/crescents (sec 12 family) | steel crescent arms + white edge + blue core + glint |
| ZAP bolt | doi01-doi09 weapon-fx + SpearTip | white heart + 4 gold ticks on strike point |
| NOVA ring | Zodiac/moon luminaire orbs | 4 hash-phased motes inside the pulse |
| SCYTHE blade | SpearShape + ReportSlash strokes | white tip + 2 pale trailers at full reach |
| SEEKER | CrystalBig gem projectile | white nose + gold body + ember fins + exhaust |
| MINE | weapon-fx + train/cart hardware | steel rim + brass studs + 1Hz lamp + glint |
| BEAM pulse | CrystalBig gem projectile | white packet + pale cross riding the beam |

No VS pixels in `src/` (all art is original fillRect geometry).

## Per-projectile rect budgets (bounded, pools capped)

VOLLEY 6, ORBIT blade 5, BOOMERANG 6, SEEKER 6, MINE 9 (all <= 11);
additions: ZAP +5, NOVA +4, SCYTHE +3, BEAM +3. Phasing: position hash /
sim age / velocity / flight angle only — never wall clock, never
`Math.random`; pure functions of sim state, so 60/120Hz paint identically.

## Frozen evidence

- `test/test_port_slice_j2.mjs` section B: full-bodies frame leaves every
  projectile/effect field untouched (47 checks pass).
- Movement asserts green in `suite/test_weapons_after.log` (orbit contact,
  boomerang out/back/re-hit/despawn, zap chain, scythe range, seeker homing,
  beam pierce/length, mine blast radii).
- Slice-h pin intact: `test_port_slice_h.mjs` 35 checks pass.

## Pins touched + why

- NEW `test/test_port_slice_j2.mjs` (47 checks): per-archetype composition /
  palette / determinism / ASCII / read-only / vocabulary pins.
- `src/render.js` only (painters). No weapon, config, art-asset, or test
  edits — baseline reds below are byte-identical before/after.
- NEW `tools/capture_slice_j2.mjs` (slice-h capture pattern, real seams).

## Suite line

`bash tools/run_all_dev.sh`: greenfiles=183 redfiles=5
(REDLIST: evolution, night_mode, port_slice_k2, weapon_overrides, weapons).
j2 test file green (not in REDLIST). Baseline reds weapons/overrides/evolution
are pre-existing damage-ladder fixture drifts, identical before/after:

- weapons (8, same assertions): "volley: proj level adds no damage ...",
  "volley: 5 damage levels by Lv8 = +100%", "orbit: +15% damage per level",
  "boomerang: +12% flight speed per level", "zap: ladder is damage-only ...",
  "describeWeaponLevel returns card text", "scythe: +0.12 arc width ...",
  "seeker: +0.4 turn rate ..." (diff of FAIL lines before/after: empty).
- overrides (5, same): "no shipped weapon carries dmg overrides ...",
  "formula default at L8 ...", "override miss at L7 ...",
  "override on one weapon never leaks ...", "override table removed ..." (diff: empty).
- evolution: `AssertionError: instance def is a copy` (diff: empty).
- port_slice_k2: RED in suite, PASSES standalone
  (`suite/test_port_slice_k2_after.log`: ALL PORT SLICE K2 SHRINE TESTS
  PASSED) — ordering flake, standalone proof in-tree.
- night_mode: fails standalone identically (`actual: 'dead', expected:
  'playing'` watchdog-timing assert, `suite/test_night_mode_after.log`) —
  pre-existing, sim-timing only, no projectile-painter involvement
  (renderers are proven read-only by the j2 section-B pins).

Before/after logs: `baseline/` (before), `suite/` (after, standalone reruns).

## Captures (in-tree, standard contract, live seams)

- slice-j2-1-live-volley.png — real volley combat (arrows + muzzle/hit_spark
  via true triggers, nProj>0 sampled, clock +0.40s).
- slice-j2-2-orbit-boomerang.png — granted ORBIT+BOOMERANG (boomerang body +
  orbit dots live, clock advances).
- slice-j2-3-seeker-mine.png — granted SEEKER+MINE (missiles + armed mines +
  seeker_trail live).
- slice-j2-4-zap-nova.png — granted ZAP+NOVA_PULSE (zap polyline + nova_pulse
  live via true triggers).
- slice-j2-5-scythe-beam.png — granted SCYTHE+BEAM (scythe_arc + beam +
  beam_hit live).
- All via `tools/capture_slice_j2.mjs`: real tap, sim clock asserted on
  every shot, weapons are `makeWeapon` instances (the draft path's own
  object) fired by the game's own `updateWeapons`.

## OWNER-RULING additions

None requested. No evolution pairing, pacing, economy, or loadout rule was
touched; nothing new is `OWNER-RULING-REQUIRED`.

## Unverified flags

- Screenshot pixel-content was not machine-graded (presence + live-seam
  assertions only, slice-h contract); bodies are additionally pinned at the
  rect level by the j2 recording-ctx test.
- night_mode red is reported, not root-caused (out of slice scope; evidence
  of independence in-tree).
