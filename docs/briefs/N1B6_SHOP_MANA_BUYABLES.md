# N1b item 6 — the three MANA buyables (Thrifty Casting / Deep Well / Siphon)

Read `docs/HORDES_GOALS_2026-09-12.md` sections **N1b items 1, 2, 5, 6 and 7** before you
start. They are the RULE, not background: mana stays punishing at base and **the relief valve
is the SHOP, never a balance change**. You are adding the relief valve. You are NOT tuning any
existing mana number (Chain Reaction stays at 6, ZAP stays 4, base regen stays 0.5/s, the
Witch stays at `unlockCost` 9000).

## WHAT TO BUILD

Three new rows in `SHOP_UPGRADES` (`src/meta.js:313`, row shape `{id,name,desc,baseCost,
costGrowth,maxLevel,perLevel}` — copy the shape of the neighbouring `regen` row at `:321`):

1. `thrifty` — **Thrifty Casting**: `-% mana cost` per level.
2. `well`    — **Deep Well**: `+max mana` per level.
3. `siphon`  — **Siphon**: mana on kill. The Witch's native trait, sold to everyone else.

Content, not new machinery: all three fit the existing stat-field contract. Prices are yours
to set, but justify them against the neighbours (`regen` 200 base / 1.6 growth / max 4) and
against the ladder the owner set (Knight 0 -> Rogue 2500 -> Paladin 6000 -> Witch 9000). The
owner's words: *"mana weapons should be somewhat punishing... We should make up with buyables
in the shop"* and *"Witch is a buyable class"* — so a player who owns the Witch has already
bought support; these rows are how a NON-Witch buys their way into the mana game.

## THE SEAMS (use these, do not create a second one)

- **Cost**: there is exactly ONE weapon-cost seam, `weaponManaCost(id, state)` in
  `src/weapons.js` (N1a, ~`:386-401`), and one skill seam, `skillManaCost(defId, state)` in
  `src/perks.js:133`. A `manaCostMult` stat field ALREADY EXISTS and is threaded by
  `applyCharacter` (`src/meta.js:699`, multiplicative, neutral at 1; WITCH carries 0.5 at
  `:668`). `thrifty` must compose into that SAME field multiplicatively — one number, both
  seams. Do NOT add a second discount read inside `useSkill` or inside the weapons.
- **Stats contract**: `applyMetaBonuses` (`src/meta.js:609`) is PURE and carries a documented
  META STAT FIELD CONTRACT comment block above it (`:588-608`). Add the new fields there WITH
  their comment lines, so the contract stays complete: e.g. `manaCostMult` (default 1),
  `maxMana` (default from `makePlayer`), `manaOnKill` (default 0). All fields must be safe to
  read when unowned — every existing consumer reads `stats.X ?? default`.
- **max mana**: `well` adds to `stats.maxMana` in `applyMetaBonuses`. Note `applyCharacter`
  (`src/meta.js:688`) adds the character's `maxMana` mod AFTER meta bonuses; keep the ordering
  so the Witch's +50 still stacks as it does today.
- **Kill income**: the kill seam is `src/main.js:1721` (`p.kills++`). Grant `manaOnKill` there
  (or in a helper called from it), clamped to `stats.maxMana`, dt-free per kill (a kill is an
  event, not a frame — nothing may scale with frames; a 120Hz step must not grant twice).
- **Regen seam** for reference: the per-second grant is `src/main.js:1295-1303`.

## HARD CONSTRAINTS

- **AUTO and MANUAL both benefit.** These are stats, not AI: nothing here may be gated on
  `pilotMode`. The AUTO pilot already spends mana through `autoCastSkills` (N1b item 8,
  `src/main.js` ~`:4264`), so `siphon` + `thrifty` must help an AUTO run too.
- **No balance changes.** G5/G6 difficulty is measured separately; if a bar of yours seems to
  need an existing mana NUMBER moved, STOP and write `blocked:` with the measurement.
- **No emojis** anywhere in names/descs (owner UI rule). Player-facing desc strings are plain
  English, same voice as the neighbours on that table.
- 60Hz and 120Hz must both be correct — nothing counts frames.
- Do not touch: the ults (owner-gated on the Q-slot question), Chain Reaction's cost, the
  Witch's unlockCost, base regen, pool sizes.

## ACCEPTANCE BAR (numbers, not intentions)

- A NEW `test/test_shop_mana.mjs` with real assertions: each row exists with a sane
  `baseCost/costGrowth/maxLevel/perLevel`; `owning the row changes the applied stat at the
  RIGHT LEVEL` (level 0 = neutral, level N = the documented number); `thrifty` composes
  multiplicatively with the WITCH's 0.5 (assert the PRODUCT, e.g. a Witch with thrifty L3 pays
  ZAP 4 * 0.5 * discount); `well` moves `maxMana` by exactly its perLevel x level; `siphon`
  grants mana on a kill and NOT on a frame (kill the same enemy twice is impossible — assert
  the per-kill grant and that an idle frame grants nothing); a 60Hz vs 120Hz replay gives the
  SAME total siphon mana over the same scripted kills.
- **Measured before/after** for the two N1b item-7 bars, via `tools/real_loop.mjs`
  (`bootReal` + `stageProfile`, same profile both arms, AUTO mode, an instrumented `mana`
  getter/setter on `st.player` as in `/tmp/n1b_probe.mjs`): frames at zero under 20%, and mana
  spent as a share of income. Report the UNOWNED (today) numbers and the OWNED numbers
  (profile with the three rows bought) side by side, for a WITCH and for a KNIGHT.
  **Known state on this tree (pilot-measured this tick, do not re-derive from scratch):** AUTO
  on a fresh KNIGHT now reads zeroFrac 0.0% and share 97.9%; AUTO on a fresh WITCH zeroFrac
  0.0% and share 99.0%. The share sits ABOVE the 70-90% band and that is reported, not
  hidden — your job is to measure what the BUYABLES do to it, and to say plainly if they move
  it only a little.
- `node tools/verify_skill_keys.mjs` => PASS, and `bash /tmp/run_all.sh` THREE times, each
  `FAIL=0` (baseline on this tree: **PASS=71 FAIL=0**).
- If any shop rendering changes (new rows appear on the SHOP screen), verify in a REAL
  BROWSER at a PHONE viewport with `tools/browser.mjs` (390x844 @dpr3) and write the PNG to
  `docs/art/browser-verify-2026-09-12/` — geometry + `getImageData` samples, never "looks
  right". There is NO vision model on this host.

## LOCK

Run `~/projects/agent-hub/sdk/agentlock acquire --note "N1b item 6 shop mana buyables"` from
`/home/claude/projects/hordes` before editing; if it reports another owner, retry 20 times,
30s apart, then STOP and report that owner — never edit without the lock. Release from
`/home/claude/projects/hordes` when done, even on failure. Do NOT run git
commit/checkout/reset/stash/clean — the orchestrator owns commits.

## REPORT

Finish with a `done:` line naming: file:line per change, the three prices you chose and why,
the before/after cohort numbers and the two item-7 bars for BOTH classes, the three suite
results, the 120Hz check, and an explicit list of what you could NOT verify.
