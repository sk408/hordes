# THE REACH-ROUTE FINALE — owner's preferred bypass shape (2026-09-18)

OWNER VERBATIM: "Ok the only other method would be the boss reaching to grab the
pilot and the pilot being able to run past. Has to look convincing."

## The shape adopted

The boss stands OUT IN THE OPEN on the finale floor and REACHES to grab; the
pilot runs past at boss level, dodging by timing. The 2026-09-18 floating-slab
detour (docs/art/escape-bypass-2026-09-18/) was the FALLBACK shape and is
SUPERSEDED — the fallback was not needed: the physics supports the run-past
outright (required jump distance **0px** against the 160px-tall reach gauntlet;
RUN_SPEED 200px/s crosses the whole combined ground zone in 0.20s). The finale
is ONE whole 900px floor: `finaleSegment` carries no gaps, no floats, no AUTO
bands — the floor IS the route (generator.js:287).

## "Convincing", criterion by criterion (all measured, all pinned)

The checkable form is `checkReachRoute(seg)` (generator.js:314); the behaviour
pins live in test/test_escape_reach.mjs (6 checks, green) and
test/test_v1_escape.mjs (34 checks, green).

### (a) the tell — every arm winds up in the open
Per-arm wind-up (striped landing zone at the band, claw raised overhead) runs
**0.65s (claw) / 0.70s (sickle) / 0.95s (tendril)** before ANY danger phase —
each ≥ 0.5s, the phone-readable floor. Ground arms stripe the floor at their
band; the sickle shimmers its AIR lane (it cannot hit the floor — the tell
teaches the lane). Evidence: `after-windup-{390x844,320x568}.png` — raised
claw + striped zone readable at both sizes.

### (b) the reach — tips land INSIDE the pilot's body, not short of it
Each arm's extended tip box is `[tipY−9, tipY+8]` above the floor
(config ARMS `tipY` — the ONE named place; the sim pin, the render's `extY`,
and the checker all read it). Against the pilot's 17px body span:

```
claw    tipY 14  → 12px of 17 overlap (torso grip)
sickle  tipY 76  → 14px of 17 overlap (inside its air lane, heights ≥70)
tendril tipY  6  → 14px of 17 overlap (ankle sweep)
```

The sickle row is a FIX, not a tune: the blade was drawn at 92px above the
floor while its hit predicate triggers at ≥70 — a blade drawn above the lane
it contacts is an invisible hitbox. tipY is NEW geometry naming, not a retune
of any reach/cadence constant (freeze pins below).

### (c) contact reads as contact
Contact is tested ONLY in extend/hold (pinned per arm × per phase: grabbed in
extend/hold, never in idle/windup/retract). On the grab, the pilot is pinned
INTO the closing palm — `p.x = tipX+4`, `p.y = tipY+10` (feet 10px under the
tip: the body sits IN the grip) — and the renderer draws the closed fingers
OVER the pilot (after the pilot sprite) with a 1px struggle jitter. The held
beat runs 0.7s before the soft `caught` outcome. Evidence:
`after-held-{390x844,320x568}.png` — the helmet/visor visibly inside the
closed knuckles at torso height, both sizes.

### (d) the clean miss reads as a near miss
Retract has NO hitbox (a pilot parked in the band through a whole retract +
idle is never touched), and a pilot who clears the band is never grabbed late
— pinned: 30px clear through windup+extend+hold → no grab, no invisible
hitbox. Evidence: `after-miss-{390x844,320x568}.png` — the claw extended at
the band, the pilot clearly past it.

### (e) a stated, learnable cadence
Every arm cycles idle→windup→extend→hold→retract on **GRAB_EVERY = 2.4s**,
staggered 0.0 / 0.8 / 1.6s (claw / sickle / tendril). Danger per arm =
extend+hold = 0.47 / 0.45 / 0.60s. The test walks the machine and asserts
the windup-to-windup spacing is 2.4s ±0.1s across 3 cycles.

## Dodge by TIMING, not luck — the window, stated

Combined ground zone (claw band [120,144] + tendril band [140,160] rel bossX)
= **40px = 0.20s crossing at run speed**. Ground-danger intervals per 2.4s
cycle: claw [1.53,2.00], tendril [0.50,1.10] → safe windows **0.50 / 0.43 /
0.40s linearly, plus the wrap window 0.90s contiguous across the cycle
boundary**. Best window 0.90s vs the stated human budget 0.40s reaction +
0.20s crossing = 0.60s required → **0.30s of slack**. No widening needed
(`checkReachRoute` fails the corridor if any seed's best window drops under
budget — 40 seeds checked).

Proven both ways: a scripted MANUAL brake-and-go controller (watch the cycle,
brake outside the zone, run the whole crossing on one clear window) completes
— MEASURED seed 9: manual finale 3.9s (13 brake frames) vs AUTO 3.7s, same
route, same clock. AUTO itself still completes on the same floor route,
untouched (seeds 4/9/21 + the 12-seed completion cohort in test_v1_escape).

## Art budget — the appendage, both sizes

Every phase is drawn as its own silhouette (claw: hide chain + gripping
fingers; sickle: rigid bone limb + steel crescent; tendril: sagging whip +
ember tip), keyed purely on the per-arm machine + sim.t — parity-safe by
construction. Windup raise → extend sweep (with streaks) → hold (fingers
close only on the arm's OWN grab) → retract coil, all verified in-shots at
**390x844 AND 320x568** (see shots/).

## Freeze confirmation (nothing outside the finale geometry changed)

`PAYOUT_K 1/15 · PACING 30/36s @200px/s · WALL 190→212 / gap 300 / width 46 ·
MAP 3×3×3000 · BAND 252/400 · PAID_SKIP 100000 'escapeskip' · GRAB_EVERY 2.4 ·
reaches 132/96/150` — all pinned in test_escape_reach check 6. The V1e
up-route, its bands and the 2026-09-18 floating slabs are removed with the
supersession recorded; `test_escape_bypass.mjs` is deleted;
`test_v1_escape.mjs`'s finale pins retarget to the open-floor shape
(disclosed in-file).

## Evidence

shots/ — before-layout{,-portal} (HEAD pre-change, via af9de62 checkout) and
after-layout{,-portal} at both sizes; after-windup / after-reach / after-held
/ after-miss at both sizes (one fresh run each, wall LIVE). Run log: held by
claw at t+0.35s both sizes; AUTO completions t=44.57s (390) / 44.58s (320),
pressure 537–541px at the portal.

SIM: ~470s of sim time across 12 arms (10 full completions, 15 phase-gating
probes, 40-seed reach table, 6 scripted manual finals).
