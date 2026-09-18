# HOW-TO-PLAY SETTLED SHAPE — 2026-09-18

Owner's decision (settled): "just removing the supposed index buttons and
keeping prev and next and making sure they are underneath the instructions
is the best option right now" + "the main text over small forward and back
buttons". This is the report of that build. The earlier A/B variants (a
2-column TOC grid, an accordion) are moot — owner decided — but both of
those variants were THEMSELVES indexes, which is exactly the element the
owner called "the worst part of the how to play". TENSION NOTED FOR THE
RECORD: any variant that wins on paper by indexing better was competing
against the thing being removed; removal won on the owner's judgement, not
on the content-fraction metric (which is UNCHANGED — see 1).

## What changed

- **The CONTENTS row is GONE.** `manualGoto` in `src/main.js` no longer
  emits the four jump cards (A RUN / OPTIONS / CONTROLS / FIELD). There is
  no index anywhere in the manual on any page.
- **PREV/NEXT remain, SMALL, UNDER the instructions** (phone), as a
  side-by-side pair carrying the new `.nav` class
  (index.html `#overlay.howto .card.nav`: fixed 118px wide, 44px touch
  floor, 12px/10px type) — the manual text dominates the screen.
- Clicks page (the cards), **arrow keys page** (Left/Right, already wired
  at the real keydown seam — confirmed by test_manual).
- **REPLAY TOUR row stays** (unchanged card, same stack).
- No emojis anywhere in the manual (grep of card HTML; also asserted by
  the standing test).
- The PAGE subtitle `PAGE n / 4 — TITLE` is the position marker.

Tests: test/test_manual.mjs inverted (11 structure checks green) — no
index cards on ANY page, PREV/NEXT carry `.nav`, nav cards sit AFTER the
instructions card in reading order, dimming at the ends, arrow parity,
GOT IT flow footer, manualPage reset.

## Geometry (acceptance: content-area fraction vs the 10.8% baseline)

Measured live (real Chrome, tools/browser.mjs), same procedure as the
baseline report (docs/art/howtoplay-2026-09-18/REPORT.md): the
instructions card's .desc box area / (vw*vh), 2 samples each.

### 1. Content-area fraction — UNCHANGED (honest)

| viewport | text box | fraction before | fraction after |
|---|---|---|---|
| 390x844 (phone) | 346x420 | 44.1% | **44.1%** |
| 1440x900 (desktop) | 532x420 | 17.2% | **17.2%** |
| 1920x1080 (desktop) | 532x420 | 10.8% | **10.8%** |

The text box is a capped panel (max-width 560px, max-height
min(56vh,420px), internal scroll) — removing the CONTENTS row never
changed ITS size, only what sat under/around it. The fraction metric was
never the binding constraint on the settled shape; the NAV CHROME was.

### 2. The nav stack collapsed (the honest win)

Same bounding boxes, the height of the NAV cards under/around the text
(PREV + NEXT + REPLAY TOUR, 2 samples averaged):

| viewport | nav before (stacked under text) | nav after | screen height |
|---|---|---|---|
| 390x844 (phone) | 60.5% | **26.9%** | 844 |
| 1440x900 (desktop) | 241.8% | **161.3%** | 900 |
| 1920x1080 (desktop) | 273.7% | **173.0%** | 1080 |

DESKTOP CAVEAT (measured, not assumed — live rects at 1440x900): on a
desktop the flex row places PREV/NEXT/REPLAY TOUR BESIDE the 560px
content card, not under it (all y=247, each stretched to the row height;
GOT IT is its own 560x51 row below):

```
HOW A RUN WORKS  x=202  y=247  560x467
PREV             x=776  y=247  118x467
NEXT             x=908  y=247  118x467
REPLAY TOUR      x=1040 y=247  118x467
GOT IT           x=440  y=728  560x51
```

So the desktop "161.3%/173.0%" height-sum OVERCOUNTS same-row cards —
the honest desktop statement is ONE 467px content row (text beside three
118px buttons) + the GOT IT row. The phone is where the owner's directive
("underneath the instructions") physically binds, and there the nav stack
genuinely collapsed 60.5% -> 26.9%.

### 3. 320x568 legibility (the standing bar)

CONTROLS page (the longest, 39 rows): **0 rows clipped**, text box
276x318 (48.3% of the screen), PREV/NEXT 118px wide side-by-side under
it (nav stack 45.2% of the 568px height). Nothing runs off either edge
(the --fit-w clamp). Shot: shots/settled-p3-320x568.png.

## Position indicator (RECOMMENDATION ONLY)

The current build ALREADY shows one: the overlay subtitle reads
`PAGE n / 4 — TITLE` (e.g. "PAGE 3 / 4 — YOUR CONTROLS") on every page,
set by manualGoto. It is the owner's "2 / 4" idea in the "n / N" form,
already live. RECOMMENDATION: keep it as-is; it carries the page number
plus the page name at zero added chrome.

## Shots (docs/art/howtoplay-settled-2026-09-18/shots/)

- settled-p1-390x844.png, settled-p3-390x844.png (phone, pages 1 and 3)
- settled-p1-1440x900.png, settled-p3-1440x900.png (desktop)
- settled-p1-320x568.png, settled-p3-320x568.png (the small-phone bar)

## Incidental: verify_help_clearance pre-existing breakage (fixed)

While verifying, tools/verify_help_clearance.mjs was found RED at HEAD
93be14d (proven in a clean git worktree — NOT caused by this task):
- the FLOATING JOYSTICK change (cb4c463) stands the fixed #joy base down
  on touch paths, so its probe tapped (0,0) forever — now a disclosed
  BY-NAME skip (note line, not silent green);
- the FIRST-RUN PROLOGUE needs the runs=1 stamp to drive an ordinary run;
- the arm loop now bumps the transient-chrome reveal window with an
  inert key (F2) each retry or it can deadlock.
Result: PASS, 149 checks, 4 disclosed #joy skip notes.
