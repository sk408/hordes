# ELEVATION, CHOKE POINTS AND THE MIXED HORDE — DESIGN PROPOSAL (NO CODE)

Task date 2026-09-17 · Written 2026-09-18 at HEAD `5597b79` · **DESIGN ONLY: no game code
written, no balance constant changed, no relief altered.** Bounded 60s sanity sims were run
(method in §4); nothing was tuned.

---

## 0. PREMISE CORRECTION — the brief's first line is now half-true

The brief says "the relief that shipped has NO collision input." That was correct when
written. It was overtaken **within the same day** by the owner's own follow-on directive
(msg_01M2RK5B: "let's prototype elevation… add it in and then work on getting it right"),
which shipped as the **BLOCKING ELEVATION PROTOTYPE** (`src/relief.js:132-237`, commit
`394ddf0`, 2026-09-17 23:48): an authored rim-wall band (`r0=700..r1=760`, top level 2) with
four gate terraces at the cardinals (`gapHalf=0.10` rad ≈ 146px arc at r=730), ONE cliff rule
(a ≥2-level step blocks; a 1-level step is a ramp), a gateward slide (a blocked mover walks
the ring toward the nearest gate at its own speed — `relief.js:204-237`), a no-trap
flood-fill proof (`test/test_blocking_elevation.mjs`), wired into BOTH move seams
(`src/main.js:1132` pilot, `:2482` horde). Scoped to ONE stage (the starting arena,
`src/stages.js:57-71`); the other seven stages are byte-identical terrain.

So elevation that blocks **exists and is test-pinned**. What does NOT exist — and what this
proposal designs — is everything else in the owner's quote: the choke as a **net negative**,
the **mixed horde** whose strong tier accumulates there, and **stronger ranged enemies with
vertical reach**. The owner's "not ready to implement until we can balance it better" stands:
everything below is design + measurements for his decisions, not a build plan.

## 1. ELEVATION GEOMETRY (what exists, what to add)

**Exists (prototype):** hollow clearing (BASIN 560, flat level-0 heart) → natural terraces
(CELL 480, 3 levels) → rim wall ring [700,760] raised to the stage's tallest level → four
gates as 1-level terraces. Choke points live at the gates by construction: crossing the wall
means walking to a gate (`relief.js:222-236`).

**Reads on a phone:** the wall band is 60px thick and the gate arc ~146px wide against a
480×300 view — the wall reads as a wall, gates read as notches. Two additions the prototype
will want when it graduates (design, not built): (a) **gate shoulders** — the two authored
landmark stones already sit at the cardinals (render.js, RIM−150); move them to flank each
gate mouth so the opening reads as a door, not a gap in noise; (b) **cliff-face tint step** —
level-2 ground adjacent to a level-0 floor should render one accent edge (the render already
tints by composite level; the edge highlight is what makes "unclimbable" legible at 320×568).

Geometry families deliberately NOT proposed: bridges/overpasses (needs a z-order the flat
integrator doesn't have) and interior maze walls (multi-wall fields multiply the no-trap
proof burden). Terraces + ring wall + gates is the whole vocabulary.

## 2. THE CHOKE AS NET NEGATIVE (the owner's design call)

The failure mode to avoid: a gate becomes a **funnel-and-farm** — the player stands in the
gate mouth, weak chaff files through one at a time, AoE weapons mince the queue, strong
enemies never land a hit. The prototype's own probe already found the passive version of
this: enemies clustering under a wall-top attractor measured **0% wall-top contact vs 91% on
flat ground** (`relief.js:216-220`) — walls are ALREADY safe-ish to stand behind. That is
backwards from the owner's intent, and it is why the choke must be actively negative:

**The mechanism (three layers, one per timescale):**

1. **TOLL — the strong tier queues there.** Strong enemies that must cross spawn/loiter
   across the wall and arrive via gates (§3). The gate is where they bunch: gateward slide
   routes every blocked body to its nearest gate **at its own speed**, so slow heavies spend
   the longest in the funnel. The player pays for the wall's protection with a **concentrated
   strong-tier wave at the opening** instead of the diffuse trickle flat ground gives. Sim
   evidence §4: strong transit ×2.7, in-flight strong count 8-12 by 60s.
2. **TAX — the gate is the ranged killing floor.** The new ranged enemies (§5) hold AT
   RANGE from the gate mouth and shoot INTO the queue zone; a pilot camping the mouth is a
   stationary target at a known point. The choke converts the wall from cover into a shooting
   gallery — cover that the enemy owns.
3. **DECAY — no camping economy.** Nothing new needs building if (1)+(2) land, because the
   existing anti-sanctuary mechanics already deny farm value: chaff xp is ×0.25 with drops
   ×0.05 (E2, `config.js:958-968`), so mincing a queued chaff line pays almost nothing, while
   the strong tier queued behind it is mid-boss hp (`stampHeavy`, main.js:1274) — the farm
   crop is the one that kills you. If camping still pays after playtest, the smallest further
   dial is a **gate-queue surcharge**: bodies standing in a gate zone >4s gain the elite
   damage trim. Recommend holding that in reserve — do not build until measured.

**What stops funnel-and-farm, stated plainly:** the queue's composition inverts the farm —
cheap bodies are worthless (existing chaff economy), expensive bodies are the threat, and the
ranged tier punishes the camp point itself. The exploit would require killing mid-boss hp
bodies faster than the medium cadence delivers them WHILE eating aimed fire from two arcs —
that is just playing the game well, not an exploit.

## 3. THE MIXED HORDE — spawn table and the accumulation mechanism

**Why strong enemies actually accumulate (no hand-waving):** three conditions, all required,
all present in this design —
- **Spawned-beyond-the-choke:** when the pilot and a spawn point sit on opposite sides of the
  wall, the body MUST route through a gate (cliff rule). The spawn loop already draws a ring
  around the pilot; the rule only needs to notice which side of the wall each draw landed on
  (a `reliefLevelAt` read — no new rng, counts untouched).
- **Slower:** heavies move at 0.45-0.6× base (BRUTE 0.6, COLOSSUS 0.45), and the gateward
  slide runs at the body's own speed — the detour is a multiplier on a multiplier. Sim:
  BRUTE crossing time 6.7s direct-ring → **18.4s mean via the choke**.
- **Little's law does the rest:** in-flight count L = arrival rate λ × crossing time W.
  Doubling W doubles the standing strong count in the arena, and it concentrates at gates
  because that is where the slow bodies queue. Medium λ + long W = accumulation, without any
  "stack spawn" special case.

**Spawn-rate table (proposal — per wave band, default stage; wave = the 120s WAVE_LENGTH):**

| wave band | weak cadence (groups/tick, chaff-weighted) | strong cadence (heavy bodies) | strong crossing means | expected standing strong (λ×W) |
|---|---|---|---|---|
| 0-1 (0-4:00) | 1/tick, ×3 chaff density (E2, shipped) | rare: 1 per 6 groups, same side as pilot (no choke yet) | 4-7s direct | ~1 |
| 2-3 (4:00-8:00) | 1-2/tick | **medium: 1 per 3 groups, beyond-the-choke when walled** | 18-23s via gate | **4-6** (sim: 8 at cap, still filling) |
| 4+ (8:00+) | 2+/tick (ladder) | 1 per 2 groups, beyond-the-choke; COLOSSUS eligible | 20-25s | **8-12+** (sim arm 3: 12 in flight at 60s) |

The numbers in the right column are the sim's, not promises: the 60s cap truncates the
integral (arrival is steady but the first strong bodies only reach the gate from ~15s), so
the steady state is HIGHER than the cap reading at band 2.

## 4. SIM EVIDENCE (bounded: 60s cap, fresh deterministic build, arms stated)

Method: standalone sim (`/tmp/mixed_horde_sim.mjs`, read-only imports of the REAL
`relief.js`/`enemy_types.js`/`config.js`; no game file touched). Pilot camps just outside the
east gate at (800,0), AFK. Spawn interval from the shipped formula (`1.35 − t·0.008`,
floor 0.25), 1-2 groups/tick, default-stage pool weights, packs as shipped. Gate zone =
within 150px of a gate centre. Three arms:

- **BASE (current rates, player-ring spawns):** BRUTE mean transit 6.7s; gate-zone peak 7
  weak / 4 strong; **drains to 0-3 by cap. No accumulation — this is the defect the owner
  sensed: as shipped, the choke does nothing to composition.**
- **STRONG-BEYOND-CHOKE (1 BRUTE per 3 groups spawned across the wall):** BRUTE mean transit
  **18.4s** (×2.7), max 22.6s; **8 strong in flight at cap** vs 1 in base; gate zone holds
  2-5 strong while weak drains to 1. The choke works.
- **STRONG-BEYOND-CHOKE DOUBLE (band 4+ rate):** **12 strong in flight at cap**, sustained.

Little's law sanity: λ ≈ 14/60 ≈ 0.23/s × W 18.4s ≈ 4.3 predicted standing at 60s partial
fill — measured 8 and still climbing; the model UNDERSTATES, it does not hype.

## 5. RANGED ENEMIES — existing roster, then the additions

**Existing ranged roster (from game data, with numbers):**

| enemy | role | hold/range | cadence | projectile | notes |
|---|---|---|---|---|---|
| SPITTER | ranged chaff | holds 120px, fires ≤200px | 1.15s | 105 px/s, 10 dmg | retreats if crowded (`enemy_types.js:70-84`) |
| WARLOCK | ranged hunter | holds 150px, fires ≤260px | 1.6s move + **1.0s frozen telegraph** | 75 px/s, 17 dmg | the telegraph is the dodge window (`:107-120`) |
| PILLAR | stationary turret | planted at ring | steady slow shot, staggered | — | HERALD-only, never in the spawner mix (`:153-158`) |

Ranged share by stage (pool weights → `stageFacts`, stages.js:279; computed live): **0%**
ASHEN WASTE and BLOOD RUST, **10%** BONE DESERT, **14%** CINDER_MAW, **22%** VERDANT_HOLLOW
(the starting arena), **30%** WHITEOUT, **46%** SNOWFIELD, **70%** VOID REACH — the "0-70%"
the brief cites, now with names.

**Proposed additions (design; distinct from all three above):**

1. **MARKSMAN (the choke punisher).** A STRONG ranged body whose entire job is the gate
   mouth: holds at 300-340px from the gate (OUTSIDE melee reach, INSIDE its own arc), fires a
   FAST flat bolt (≈150 px/s, ~24 dmg) on a 2.2s cycle with a 0.8s laser-line telegraph aimed
   at a POINT, not the player — the point is where the player must not stand. It does not
   chase; it repositions along the wall ring to keep the gate between itself and approach
   vectors. Distinct from WARLOCK (hunter that follows you) and SPITTER (mobile chaff): the
   MARKSMAN is emplaced overwatch — it makes the choke's TAX layer real (§2.2).
2. **LOFTED / MORTAR BROOD (the elevation answer).** A slow (0.5×) strong ranged body that
   fires **arcing lob shots** — the vertical-reach weapon (§6). Distinct from everything
   shipped: the shot has a **landing marker** (a shrinking circle on the floor, 1.1s), so it
   punishes standing STILL (gate camping, rampart perching) and cannot hit a moving pilot at
   all. It never holds a fixed distance — it drifts to keep the wall's rampart between itself
   and the pilot when it can (it understands the same composite levels everyone else reads).

Both are STRONG tier (mid-boss hp via the existing `stampHeavy` seam, HEAVY_XP_KILLS 3 purse)
— they are the medium-cadence accumulated bodies, not chaff.

## 6. VERTICAL REACH — the model

Heights: the composite field is 3 levels (0 floor, 1 gate terrace, 2 rampart). Proposal:

- **MARKSMAN flat bolts:** can hit **at most one level above or below the shooter** (|Δlevel|
  ≤ 1); a target 2 levels away (pilot on the rampart top, marksman on the floor) is SAFE from
  flat fire — that is what keeps the rampart worth climbing. Line of sight = the existing
  composite-level read along the bolt path (sample `reliefLevelAt` every ~24px; a 2-level
  wall face blocks). Cooldown 2.2s, no damage falloff.
- **MORTAR lob shots:** ignore line of sight entirely (that is the point of a mortar) and hit
  **any level, up or down**, but only at the marked point after 1.1s. Limits: range band
  180-420px (no point-blank lobs), 3.0s cycle, one shot airborne per brood body.
- **Telegraphs:** MARKSMAN = laser line along the bolt path for 0.8s before firing (the
  WARLOCK freeze precedent — the player reads it or eats it); MORTAR = the shrinking landing
  circle (the DASHER lunge precedent: deterministic, dodgeable by moving, punishes only
  stillness).

**Balance intent:** high ground (level 2) stops being safe (mortars land there; marksmen on
level 1 still reach it) without becoming useless (flat fire from the floor still cannot touch
a rampart pilot; VISION_MULT 1.5 and the spawn-distance headroom remain the climb's reward).
The rule "vertical safety costs horizontal dodging" is the whole trade.

## 7. EXPECTED BALANCE IMPACT (prediction only)

**The invariant:** kill rate → run value (the standing chain-zap rule; same authority here).
Predicted effects, direction and rough size, NOTHING tuned:

- **Choke-camping pilots: kill rate DOWN.** The strong tier arrives as concentrated gate
  waves (4-12 bodies) instead of a trickle; a build that mined the trickle meets a wall of
  mid-boss hp at a predictable point. Rough size: strong-tier share of the threat at the
  camp spot goes from ~1 standing body to 4-12 (sim), i.e. the local pressure ×4-×10 —
  expect camp deaths to spike in band 2+ and camping to stop being the default.
- **Roaming pilots: roughly NEUTRAL, slightly up.** The mixed horde's total rate is
  unchanged (weak cadence untouched; strong = the same heavy budget at medium cadence); a
  mover fights the same bodies in the field, spread out. Slightly up because mortars tax
  any pause, and horde-likes' pilots pause.
- **Run value:** mildly UP for skilled play (heavies pay HEAVY_XP_KILLS 3 purses — more
  standing strong bodies near gates is more concentrated value for players who fight the
  choke deliberately), mildly DOWN for the camp strategy. That inversion IS the owner's
  "make the choke a negative."
- Ledger rows come with the implementation task, not this one.

## 8. RECOMMENDATION — the shipped grade (the one decision the brief demands)

**KEEP. Both halves.** The grade term (GRADE_COST 0.12/level, cap 0.36, both sides, one
seam) is 3 days old, suite-pinned, and is the substrate every §2-§6 mechanism reads; hiding
it strands the prototype's tests and saves nothing. The blocking prototype stays live on the
starting arena ONLY — it is the elevation-identity stage and its geometry is what this whole
design was measured against; the other seven stages ship no wall today, which is exactly the
"held back" state while balance is unfinished. NOT recommended: a config flag — the wall is
stage-scoped declarative data (`stages.js` relief.WALL), so per-stage adoption already IS
the flag; a second mechanism would duplicate it. If the owner wants it darker before the
mixed horde lands, the cheapest dial is deleting `WALL:` from the starting stage's relief
(one-line revert, tests retarget) — but the sim says the wall is currently composition-neutral
(base arm), so there is nothing to fear from leaving it lit.

## 9. DECISIONS THE OWNER MUST MAKE

1. **Adopt the choke-negative stack?** Toll (strong queue) + Tax (MARKSMAN overwatch) — the
   two-layer version, or hold the Decay surcharge in reserve? (Recommend: two layers now,
   surcharge only if playtest shows camping still pays.)
2. **The spawn table bands** (§3): is "1 strong per 3 groups, beyond-the-choke, from wave 2"
   the right starting medium cadence, or hotter/cooler?
3. **Approve the two ranged bodies?** MARKSMAN (flat, gate overwatch) and MORTAR BROOD (lob,
   punishes stillness) — names, silhouettes, and the |Δlevel|≤1 flat-fire rule are all
   open to his taste.
4. **Vertical safety rule:** is "rampart top is safe from flat fire, not from mortars" the
   trade he wants, or should mortars also be level-capped?
5. **The grade (§8):** keep as recommended, or dark-until-balanced (the one-line revert)?

---

*Confirmations: no game code written, no balance constant moved, no relief altered. Sim was
standalone in /tmp with read-only imports (arms and method in §4). Suite greenfiles=151
redfiles=0 at HEAD at write time.*
