# HOW TO PLAY — RESTRUCTURE: TWO MEASURED VARIANTS (MODELS ONLY)

Task msg_01M2SWS5FARJQN49V6T9JRPKJC · Owner, 2026-09-18 · **NO GAME CODE CHANGED.**
Both variants are standalone HTML models built by `build.mjs`, which extracts the game's
REAL stylesheet verbatim from `index.html` (`<style>` block, index.html:174-221 region —
the `.card.ref` / `.rr` / `.rl` / `.rv` / `.subhead` / `.gotit` classes and the
`#overlay.howto` rules) and re-emits it ahead of a small variant-only CSS block. What the
owner opens renders through the game's own card CSS — same look, no re-skinning.

**Files (open on the phone from the repo):**
- `docs/art/howtoplay-2026-09-18/variant-a-toc.html` — VARIANT A: one document + TOC
- `docs/art/howtoplay-2026-09-18/variant-b-accordion.html` — VARIANT B: accordion tabs
- `docs/art/howtoplay-2026-09-18/build.mjs` — reproducible builder (run from repo root)
- `docs/art/howtoplay-2026-09-18/shots/` — 8 screenshots (baseline + both variants,
  390x844 / 1440x900 / 320x568)

---

## 1. BASELINE — the owner's complaint, quantified (real Chrome, page 1 "HOW A RUN WORKS")

| viewport | text-area fraction | content card | nav stack (8 cards) | desc scroll |
|---|---|---|---|---|
| 390x844 (phone) | **44.1%** (346x420) | 55.4% | 511px = **60.5% of the screen** | 630px in 420px |
| 1440x900 | **17.2%** (532x420) | 22.7% | 2176px = **241.8%** | 585px in 420px |
| 1920x1080 | **10.8%** (532x420) | 12.6% | 2956px = **273.7%** | 585px in 420px |

The owner's "like 1/8th the screen" is exact at 1920x1080 (10.8%). The disease is not the
content card — it is the NAV WALL: every page carries 8 nav/footer cards (PREV/NEXT, four
CONTENTS buttons, REPLAY TOUR, GOT IT) stacked below one content card, and on desktop that
stack is 2.4-2.7 screens tall. Reaching "YOUR CONTROLS" costs 3 NEXT taps (or CONTENTS +
1 = 2) and a full page swap every time.

## 2. VARIANT A — ONE DOCUMENT + TABLE OF CONTENTS (the prose-flows hypothesis)

Mobile (<900px): ONE scrolling column of the four section cards, with a compact one-line
text jump-list under the subtitle (`HOW A RUN WORKS · OPTIONS AND MODES · …`, 374x45px =
5.1% of the phone screen). Desktop (>=900px): a 220px TOC sidebar (CONTENTS links, REPLAY
TOUR as the sidebar's quiet footer row) beside a scrollable content pane — no swipe
needed, click a link or scroll; the whole document is 0.6-1.0 screens of scroll.

| viewport | text visible on open | vs baseline | nav chrome | to reach YOUR CONTROLS |
|---|---|---|---|---|
| 390x844 | **59.4%** | +15.3pt (×1.35) | 45px = 5.1% | 1 tap (jump link) + scroll |
| 1440x900 | **29.0%** | +11.8pt (×1.7) | sidebar 220px | 1 click (TOC) |
| 1920x1080 | **22.8%** | +12.0pt (×2.1) | sidebar 220px | 1 click (TOC) |
| 320x568 | 48.3% | legible, 0 clipped rows, no horizontal overflow | 45px = 7.5% | 1 tap |

Whole manual = 158% of one phone screen of content total (vs baseline 4 page-swaps for 4
cards that each re-pay the nav wall). Nothing trimmed: every row of the live manual is
carried verbatim, including the sample "yours right now · AUTO · NEAREST · BALANCED" row
(the live page reads state at open time; a static model marks it as the sample).

## 3. VARIANT B — ACCORDION SECTION LIST (a genuinely different stance)

Four header tabs (2x2 grid on desktop, wrapping row on mobile); exactly one section open;
REPLAY TOUR stays a quiet inline row under the section. Desktop's open section renders as
a TWO-COLUMN reference sheet — a stance, not a re-coloured A. **Honest reading of the
numbers: B does not beat the metric.** Its first paint shows one section only:

| viewport | text visible on open | vs baseline | nav chrome (tab row) |
|---|---|---|---|
| 390x844 | 44.1% | same (one section either way) | 96px = 10.9% (vs baseline's 60.5% stack) |
| 1440x900 | 16.8% | same | 438px block = 13.8% |
| 1920x1080 | 10.5% | same | 8.6% |
| 320x568 | 32.5% | below (small pane) | **148px = 24.8% — tabs wrap to ~3 rows; B's worst size** |

What B buys: ONE tap swaps sections (no page swap, no re-scrolling the nav wall), the
desktop two-column sheet is the best single-section reading experience at a desk, and the
nav cost still collapses vs the 242-274% baseline stack.

## 4. RENDER VERIFICATION (real Chrome + vision pass on the screenshots)

- Dark game styling, gold subheads, `.rr/.rl/.rv` rows all render through the game's own
  CSS in every shot — no unstyled fallback anywhere.
- 0 clipped rows and no horizontal overflow on ANY variant at ANY size (measured, not
  eyeballed: `scrollWidth > clientWidth` check on every `.rl/.rv`).
- Bottom-of-screen text truncation in shots is normal scrolling, not clipping.
- Vision-pass nits, recorded honestly: (a) A's desktop pane is capped at 680px inside the
  1200px container, leaving ~30% empty right margin — deliberate reference-sheet width,
  one CSS line to widen or two-column if the owner wants; (b) the dim-grey lead line is
  the game's own `#ov-sub` styling carried verbatim; (c) B desktop's "GOT IT / back to
  the title" footer spacing is the game's own `.gotit` card markup — identical to live.

## 5. WHAT THE FIRST-RUN TOUR MAKES REDUNDANT (noted, NOT trimmed — owner's call)

The guided tour already walks: HUD, pilot mode, focus, stance, movement, skills (tour
keys `hud/pilot/focus/stance/move/skills`). So **OPTIONS AND MODES** and the
movement/skills half of **YOUR CONTROLS** re-teach what the tour just showed — the usual
candidates to compress to a "the tour covered this" pointer. **HOW A RUN WORKS** and
**THE FIELD** are NOT covered by the tour and stay fully loaded. No row was removed in
either model.

## 6. RECOMMENDATION — VARIANT A

1. **It is the only one that fixes the owner's metric everywhere**: text-on-open ×1.35 on
   the phone and ×2.1 on desktop, nav chrome 5.1%/0% vs 60.5%/242-274%. B ties baseline on
   the metric and its tab stack is 24.8% of a 320px screen.
2. **The hypothesis held**: prose flows. One document means "next" no longer exists; the
   jump-list/TOC is 1 tap anywhere, and desktop gets scroll + clicks (no swipe reliance).
3. **Cheapest to adopt**: A is a layout swap inside the existing `#overlay.howto` card
   flow (the four sections' HTML already exists in `manualGoto`, main.js:4777-4928 — same
   source this model quoted). B additionally needs open/close state and tab semantics.
4. Not implemented here, per the brief — both models are committed for the owner to open
   and pick. If A is picked, the known follow-up decision is the desktop pane width (§4a).

---
*Confirmations: no game file touched (build.mjs reads index.html, writes only into
docs/art/howtoplay-2026-09-18/); suite unchanged by this task — greenfiles=151 redfiles=0
verified at HEAD 5597b79 after the models were built.*
