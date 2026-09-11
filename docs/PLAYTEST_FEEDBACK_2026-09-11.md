# HORDES — playtest feedback & design direction (2026-09-11)

**Source:** galaxy.click playtest. Verbatim player feedback (one tester, unedited):

> i have no idea what is going on at all
> there's no xp bar (?!?!?!?!?!)
> there's no tutorial you're just thrust into the game and expected to know every single mechanic
> the large text is very fuzzy
> the balance is just nonexistent in a few minutes my character could just shred literally everything, there's no challenge
> there's no way to exit a run early
> the edge of the map is not clearly defined
> this could be something competent but right now it's just all over the place

**Sk408's read (keep in mind, don't argue with it):** idle/survivor games are *supposed* to be
low-tutorial and low-challenge-compared-to-action-games, so some of this is a genre-expectation
mismatch rather than a defect. That does not make it wrong — it means the fix is **legibility and
stakes**, not bolting on a tutorial or inflating enemy HP.

---

## Framing: separate DEFECT from DISAGREEMENT

Do not treat all eight lines as one bug list. Four are real defects, one is a rendering bug, and two
are genre-convention disagreements whose *symptom* is still real and worth fixing a different way.
The umbrella line ("i have no idea what is going on") is the thing to actually solve — the other
lines are its evidence.

| # | Feedback | Class | Response |
|---|---|---|---|
| 1 | no idea what's going on | comprehension | **Real — the umbrella.** Fix via legibility, not a tutorial |
| 2 | no xp bar | defect / legibility | **Real.** Verify whether an XP indicator exists at all |
| 3 | no tutorial | genre disagreement | Don't build a tutorial *wall*; make the loop self-evident |
| 4 | large text is very fuzzy | **rendering defect** | Real. Highest-confidence technical bug in the list |
| 5 | no challenge, shreds everything | genre disagreement + **real stakes problem** | Reframe: the DRAFT must be able to lose |
| 6 | no way to exit a run early | **defect** | Real, cheap |
| 7 | map edge not clearly defined | **defect** | Real. The bound exists; the wall isn't drawn |
| 8 | all over the place | coherence | Real, subjective — last, after 1–7 |

---

## Item-by-item direction

### 1 & 3 — "no idea what's going on" / "no tutorial"
**The goal is not a tutorial. The goal is that a first-run player can state the core loop within
60 seconds of watching.** In an auto-playing game the loop is: *it fights → kills drop things → you
spend those on upgrades → it fights better.* Every one of those four beats must be visually obvious.

- There is already an intro *movie* (`src/intro.js`, wired in `main.js` as mode `'intro'`, skippable).
  That establishes tone, not rules. Do NOT extend it into a text-wall tutorial.
- Prefer **in-place legibility**: name things on the HUD, make the first draft's purpose obvious,
  show a one-line why on each choice. Teach by being readable, not by explaining up front.
- **Acceptance:** a cold player, no instructions, can say what they're supposed to be doing —
  and what the numbers on screen mean — without leaving the page to look anything up.

### 2 — "there's no xp bar"
This is a capital-letters complaint, which means the player *looked* for it and found nothing.
There is XP machinery in the build (gems feed weapon XP; `xpScale`; the level-up/draft flow), and the
HUD draws text (`render.js` ~L782/785/850/895). So the question to answer with evidence is:
**does a persistent, obvious "progress to next upgrade" indicator exist, and can it be missed?**

- If it does not exist → add one. It is the single most important number in the genre.
- If it exists but is small, low-contrast, or shares space with other readouts → it is failing at its
  job and must be made unmistakable.
- **Acceptance:** at any moment during a run, a player can answer "*how close am I to my next
  upgrade?*" within ~2 seconds of looking at the screen.

### 4 — "the large text is very fuzzy"
Highest-confidence technical defect. Current state: the canvas is a **fixed resolution**
(`canvas.width = C.VIEW_W`, `imageSmoothingEnabled = false`) and HUD text is drawn in **small
monospace** (`bold 20px`, `9px`, `8px`). On a phone the canvas is CSS-scaled to the viewport, and at
non-integer scale factors / device-pixel-ratios, rasterised *text* resamples and blurs — switching
image smoothing off does not save glyphs the same way it saves pixel art.

- **Verify on a real phone** (not just a desktop browser), at native DPR, and compare against the
  desktop render. Confirm whether the backing store accounts for `devicePixelRatio`.
- **Acceptance:** HUD text is crisp — no blur — on a phone, and the largest text is the crispest,
  not the fuzziest. Test at more than one phone resolution.

### 5 — "no challenge / my character shreds everything"
**Reframe this, and it becomes the most valuable item in the list.** This is an auto-playing game:
the player doesn't control the fight, so **the draft IS the game**. If the character shreds
everything regardless of picks, then the player's choices have no consequences and the game has no
decisions in it — that is the real defect, and it exists independent of whether "challenge" is in
genre.

So: do not fix this by inflating enemy HP or adding artificial difficulty. Fix it by making the
**draft decidable** — an outcome should be attributable to the choices made.

- **Acceptance (the test to build):** a deliberately *bad* draft run must be able to fail, and a good
  draft must visibly outperform it. If two opposite draft strategies produce the same result at
  minute 10, the balance is broken no matter how the fights look.
- Difficulty should be legible and earnable (the heat/meta systems exist for this) — the player should
  be able to say *why* a run went badly, and it should not be "I watched and the outcome was random."

### 6 — "no way to exit a run early"
Real gap. There is an in-run settings screen (the wave-17 settings cog), but the player couldn't find
any way to leave a run. Somebody who is bored or done currently has no exit but a page reload, which
is also the fastest way to lose a player.

- **Acceptance:** a run can be deliberately ended from an in-run control, confirmed by the player, and
  the game returns to a sane state (menu/run-summary) without reloading the page.

### 7 — "the edge of the map is not clearly defined"
Real. There *is* a bound (`config.js`: `BOUND: 660`, player clamps to ±600, `render.js` culls decor
past the wall) — but a clamp with no visible wall reads to the player as a bug: "why did I stop?"

- **Acceptance:** the arena boundary is visually unambiguous at all times. A player should never be
  surprised by where they can and can't go; the edge should read as a designed wall, not an invisible
  wall.

### 8 — "all over the place"
Coherence/polish. Subjective, but it is the honest summary of the list above. Do this **last**, once
1–7 have landed: one visual language, one clear hierarchy of information, nothing on the HUD competing
with anything else.

---

## Suggested order of work (highest value first)

1. **XP/progress legibility** (#2) — absent or unmissable, it's the genre's core readout.
2. **Text crispness on phone** (#4) — a visible-quality defect; cheap to verify, cheap to fix.
3. **Exit a run** (#6) — trivial, and its absence is actively hostile to testers.
4. **Map edge** (#7) — small, removes a whole class of confusion.
5. **Draft stakes / balance** (#5) — the real design work; needs a run-comparison test to be honest.
6. **First-run legibility** (#1/#3) — after the above, since those fixes do most of the teaching.
7. **Coherence pass** (#8) — last.

## Explicit non-goals

- **~~Do not build a tutorial or an explanation wall.~~ AMENDED — see
  `FIRST_RUN_TOUR_2026-09-11.md`.** Sk408 has specified a first-run **interactive spotlight tour**
  (point at each button one at a time, one line each, click to advance). That is NOT the
  explanation wall this line was guarding against — it's progressive, interactive, and paced by the
  player. The tour doc supersedes this bullet; the ban on a *static text wall* still stands.
- **Do not fix "no challenge" by making enemies tankier.** That makes the game longer, not
  more meaningful. The lever is the draft.
- **Do not gold-plate.** The tester's last line — "this could be something competent" — is the actual
  signal: the foundation is fine, the clarity is not.

## Resources

- Play it yourself: https://claude.stevesinfo.com:8443/hordes/ (live) · https://sk408.github.io/hordes/ (public mirror)
- Design source of truth: `GAME_DESIGN.md` (this repo)
- Code: `src/` — HUD/draw in `render.js`, loop/state in `main.js`, tunables in `config.js`,
  arena bound at `config.js` `BOUND`, intro at `intro.js`
- Verification bar for anything visual: **a real phone**, not a desktop browser window.
