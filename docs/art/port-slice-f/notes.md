# PORT SLICE F — evidence notes (building collision, owner-ruled 2026-09-22)

`traces.json` holds numeric position dumps from the REAL loop
(test/_harness.mjs boot of live src/main.js). All scenarios:
stage VERDANT_HOLLOW, seed 4242, forced footprint {"x":142,"y":87,"w":76,"h":68}.

- A-manual-held-east: held +x from (2,121). End (248.7,80): the walk got
  PAST the box (around, not through). maxPenetrationPx 0.000,
  minDistToBox 7.0 (honest contact at ring distance), worstStallTicks 0.
- B-auto-symmetric-mark: mark at (box east + 90, midY), pilot west.
  collectedAtFrame 310, worstStallTicks 0 — the old patrol-the-face cycle
  does not occur (corner-steer commits past the tip).
- C-auto-portal-across: portal at (box east + 150, midY), pilot west.
  enteredAtFrame 265 — entry across the wall, with the portal drift held
  out of footprints.
- D-pure-slide-edge-stop: nose-on +1px frames halt at x = 93.000 =
  rect.x - ring (7). The "position stops at footprint edge" pin, exact.

Reproduce: `node tools/capture_slice_f.mjs` (headless, in-tree).
Behavioral pins live in `test/test_building_collision.mjs` (16 checks).
