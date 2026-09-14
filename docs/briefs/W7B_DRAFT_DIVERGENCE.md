# W7b — DRAFT DIVERGENCE, REDESIGNED (rarity ladder + chase cards)

**Builder:** kimi lane. **Read this whole brief before touching anything.**

## Load this first

- Skill: `~/.hermes/skills/software-development/hordes-project-ops/SKILL.md` — this
  repo's traps (suite command, drawGrid integer grids, the DOM purity source scan,
  the measured-evidence bar). Read it before you start.

## Status: this is a REDESIGN, not a continuation

The first W7b attempt — L1 (stat-weight flood 0.3→0.5) + L2 (Iron Heart flat +25 →
+25%) — was **SHELVED** (`git stash`, labelled "W7b L1+L2 SHELVED") because the
real-loop A/B measured it **narrowing** draft divergence, not widening it:

```
baseline (L1/L2 reverted):  good 1279s  vs  bad 514.5s  median survival = x2.49
with L1+L2:                 good 834.5s vs  bad 682.5s                   = x1.22
```

Mechanism: L1 diluted the weapon pool the GREED_DAMAGE archetype wants (good got
worse), L2 made a card uniformly stronger (bad got a free ride). The sim claimed
x1.80 MET BOTH — but the sim is **2x off the real baseline** (x1.36 sim vs x2.49
real on the same behaviour). **The sim cannot validate this slice. The acceptance
gate is the REAL LOOP (paired-seed A/B, below), never the sim.**

## The design (owner direction + orchestrator recommendation)

Make the draft a **rarity-laddered choice**, not a stat-card flood. The weapon
level-up stays the common reliable pick (weight 1, unchanged); the divergence comes
from rare scaling cards and mythic build-definers that beat a weapon level-up **at
the right moment**. Two hard rules learned from the failed attempt:

- **NO DILUTION** — the chase cards are low-weight rares, not a pool flood. Weapon
  cards keep weight 1 and full access. Add decision points at the rare end, not
  volume at the common end.
- **NO UNIFORM STRENGTH** — no card is strictly better in all states. Every chase
  card's value is state-dependent (timing, opportunity cost, build commitment).

### The ladder

- **COMMON — flat, early stabilization** (existing, unchanged): Iron Heart +25,
  Light Boots, Gem Magnet, Sharpened Tips, Split Shot. Tempo cards; they decay late.
- **RARE — percent/scaling** (NEW): the chase tier. **Fixed = common, percent = rare,
  and the two COEXIST — never a conversion.**
- **MYTHIC — build-definers** (NEW): the chase.

### The cards

**RARE** (percent/scaling, timing-gated — the drafter split is the point):

- **Iron Heart +25% max HP + heal 25%** — the anchor; coexists with the flat +25.
- **Whetstone — +15% damage.** Good after the weapon is leveled; dead wave 1.
- **Scholar's Stone — +20% XP.** Good early (compounds → more drafts → more cards,
  the L4 fix as a choice); dead at minute 25.
- **Gilded Palm — +30% purse gold per kill.** Good early (compounds into the E1
  purse); dead late.
- **Crimson Edge — +3% lifesteal.** Build-commitment: scales with your damage
  output, so GREED_DAMAGE wants it and a defensive build wastes it.

**MYTHIC** (build-definers):

- **Second Wind — revive once at 50% max HP. OFFERED IN ~1/10 RUNS (owner's spec).**
- **Storm Shards — picking up XP deals chip damage to enemies. OFFERED IN ~1/10
  RUNS (owner's spec).** Chip damage = a small amount to enemies in a radius (pick
  a sensible default, state it, mark it tunable). Scales with XP farming.
- **Full Hand — +1 draft offer for the rest of the run** (a compounding draft
  investment; worth it early, dead late).

### L3 ride-along (cheap, unambiguous): the dead Split Shot card

The projectile cap is 3, so a THIRD Split Shot does nothing. Fix it — cap 3→4, or
overflow picks convert to +20% damage (your call, justify it). A card you can pick
with no effect is the purest form of a fake choice.

### Luck extension

Today Fortune only shifts **stat**-card rarity (`draftCardWeight` returns 1 for
weapon cards). Extend it: Fortune raises the odds of RARE and MYTHIC offers across
**every** card kind. Buying Fortune becomes a run-long investment in draft quality.

## The two 1/10 chase cards (owner's exact spec)

- **Second Wind** — revive once at 50% max HP, offered in ~1/10 of runs.
- **Storm Shards** — chip damage to enemies on XP pickup, offered in ~1/10 of runs.

Implementation: a run-seeded probability (~0.1) that the card is added to the draft
pool for that run at all. A run then has ~10% chance of seeing each, ~1% both.

## The measurement gate (this is what makes or breaks it)

**Do NOT use the sim.** Use a **paired-seed real-loop A/B**: run the SAME seed
twice, once with the good draft policy and once with the bad one, take the per-seed
divergence ratio, then aggregate across seeds. The spawn variance that made the
earlier n=8 cohorts bimodal cancels inside each pair, so a powered read needs far
fewer runs. Report the divergence ratio **BEFORE** (HEAD behaviour) vs **AFTER**
(this slice), with the reproduce command.

## Files you may modify

`src/config.js`, `src/meta.js`, `src/main.js`, `src/render.js`, `src/save.js` (**only
if** a new card needs a persisted field — see below), plus new files under `test/`
and `tools/`. **DO NOT touch** `src/radar.js`, `src/controllers.js`, `src/bosses.js`,
`index.html`, or `docs/` — other work owns those.

Save note: if a new card must persist (a taken chase card, a revive-used flag), that
is a persisted field on a versioned save — **bump PROFILE_VERSION and add the
migration**; never silently change the shape.

## House rules

No emojis in app copy. Pixel-art integrity (integer scaling, `image-rendering:
pixelated`, no smoothing, no blur). 60Hz and 120Hz both correct — nothing may assume
a fixed dt. Run the suite with `flock /tmp/hordes_suite.lock -c "bash /tmp/run_all.sh"`
THREE times and quote all three TREE and SUITE lines. Do not run any git command —
leave the tree dirty; the orchestrator lands it. A code claim is NOT evidence for
anything a player sees: prove visuals in a real browser at 390x844 @dpr3 with all 19
TOUR_KEYS set and `state.time` asserted advancing BEFORE measuring.

## Acceptance bar

1. The rarity ladder is live — a draft can offer a common flat card, a rare percent
   card, and a mythic chase, verified in a real browser.
2. The two 1/10 chasers offer at the measured rate (~0.1/run each), measured across
   a seeded run sample.
3. L3: a third Split Shot is no longer a dead pick (cap raised or overflow converts).
4. Paired-seed real-loop A/B: the before/after divergence ratio, with the reproduce
   command.
5. Suite: three consecutive runs, `redfiles=0`, quote the TREE + SUITE lines.
6. No assertion weakened anywhere; fixture retargets only where behaviour
   legitimately changed, and said out loud.

## Staging

The two 1/10 chasers + L3 are the priority. If the full slice is too big for one
pass, land the ladder + the two chasers + L3 first and report the rare percent tier,
the luck extension and Full Hand as follow-ups — do not half-land a broken ladder.

## Reporting

Measured numbers, the reproduce command, and an explicit list of what you could NOT
verify. A fabricated or "looks right" claim is worse than an honest gap.
