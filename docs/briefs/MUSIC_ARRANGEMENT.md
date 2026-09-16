# MUSIC ARRANGEMENT — "the music loops too fast" (owner request, 2026-09-16)

## THE PROBLEM — measured, not guessed

`src/audio.js` :56-69 is the whole tune:

```
const BPM = 132;
const STEPS = 16;
const STEP_DUR = 60 / BPM / 4;              // 16th note, 0.1136s
const BASS = [110, 0, 110, 0, 130.8, 0, 130.8, 0, 87.3, 0, 87.3, 0, 98, 0, 98, 0];
const LEAD = [440, 0, 523.3, 587.3, 659.3, 0, 587.3, 0, 523.3, 440, 0, 349.2, 392, 440, 0, 0];
const HAT_STEPS = [2, 6, 10, 14];
```

16 steps x 0.1136s = **1.818 seconds**, and both `BASS` and `LEAD` are exactly 16 entries, so the bass
line, the melody AND the hats all repeat every 1.82 seconds — about **33 repetitions per minute**. That is
the entire complaint. Nothing is broken; the tune is simply one bar long.

## WHAT TO BUILD — turn the bar into a song

Keep the synthesis exactly as it is: procedural chiptune, `tone()` square bass / triangle lead / noise hats,
zero audio files, master gain unchanged. Keep the character (the owner called the airy feel "perfect"). The
work is ARRANGEMENT, not synthesis.

### 1. Structure (required)

- Introduce a SONG made of SECTIONS. One bar = the existing 16 steps @ 132 BPM = 1.818s.
- A SECTION is a run of bars with its own bass line, lead line and hat pattern.
- **Minimum 8 distinct sections, 8-16 bars each.**
- **The full song cycle must be >= 180 seconds** (>= 99 bars) before it returns to its start. State the
  computed total in the report.
- Include a real shape, not 8 variations of the same idea: an opening (sparse, establishes the airy theme),
  a main body, a movement/turn, a tension section, and a return to the opening that is varied rather than
  copy-pasted. The progression should move, not just the melody: the current Am-C-F-G per bar is the
  starting point, extend it (Am-F-C-G, Am-G-F-E, etc.) so sections are harmonically different.

### 2. Distinctness (required, and provable)

No two sections may share an identical (bass, lead, hat) signature. This must be asserted in a test, not
eyeballed. Every section must be reachable and every bar in the song accounted for exactly once.

### 3. The loop point must be seamless (required)

The last bar of the cycle has to resolve back into the first: end on a chord that leads to the opening's
root (the opening is A-minor based, so end on G or E, then land on Am). Prove continuity across the seam:
compare the tail of the final bar with the head of bar 1 and assert no discontinuity (max sample delta and
RMS continuity below a stated threshold) in the offline render, so the loop point does not click.

### 4. Scheduler integrity (required)

The existing scheduler is sample-accurate and must stay that way: `nextNoteTime` accumulation, LOOKAHEAD
0.12s, TICK_MS 25ms, no per-note `setTimeout`. The arrangement must be resolved by a PURE function
(step -> {section, bar, stepInBar, chord}) that a test can call directly. No drift, no allocation churn in
the hot path.

### 5. Keep the public surface compatible (required)

`startMusic()`, `stopMusic()`, the music toggle and the SFX toggle behave exactly as now. The phase cue
functions (`playIntroCue`, `playPortalCue`) stay SFX-class and unchanged. The `MUSIC` export must keep
`BPM`, `STEPS`, `BASS`, `LEAD`, `HAT_STEPS` (other code and tests read them) and may add `SONG`/`SECTIONS`
plus the pure mapper.

### 6. Phase awareness (STRETCH — only if the core above is done and green)

The owner likes intensity to match the moment. If, and only if, the core lands: let the run phase pick the
section set, so boss/escape play the tense sections and ordinary waves play the calm ones. This is additive
and must not change the required structure or its tests.

## ACCEPTANCE

1. `node test/test_audio.mjs` passes, with NEW assertions: cycle length >= 180s computed from the constants
   (not a hardcoded literal), >= 8 sections all mutually distinct, every bar accounted for exactly once,
   the step->position mapper returns correct values for first bar / section boundaries / final bar, and the
   final bar resolves to the opening root.
2. `bash tools/run_suite.sh` ends `redfiles=0` — and NO existing assertion may be weakened or deleted to get
   there. If an old assertion contradicts the new structure, say so in the report with file:line instead of
   editing it away.
3. **A render the owner can actually listen to**, produced through the REAL synthesis path (not a
   re-implementation): render one full song cycle offline in real Chrome with `OfflineAudioContext`, import
   `src/audio.js` itself, and write:
   - `/tmp/hordes_music_full.wav` — the entire cycle, and report its measured duration in seconds;
   - `/tmp/hordes_music_30s.wav` — a 30s excerpt from the middle so the owner can sample it quickly.
   Do NOT commit audio files to the repo (a multi-minute WAV is tens of MB). Commit only the tool and the
   text/CSV/PNG structure map.
4. A structure map committed to `docs/art/audio/music-map.txt`: one row per bar — bar index, section name,
   chord, bar count — so the arrangement can be checked without listening. Plus the per-section bar counts
   and the total cycle length in seconds.
5. The render must be reproducible: the tool takes the cycle length from the same constants the game uses,
   so changing BPM or a section updates both.
6. Report the seam measurement (max sample delta / RMS across the loop point) and the exact thresholds used.

## EVIDENCE / REPORT FORMAT

- `TREE @ <HEAD> | dirty=<n>` (no git state commands — leave the tree dirty and report the count).
- The suite banner verbatim (`greenfiles=N redfiles=0`).
- The cycle arithmetic: BPM, STEPS, bars, sections, per-section seconds, TOTAL seconds (the headline number
  the owner asked for: how long before it repeats).
- The two WAV paths with their measured durations, and the structure map path.
- The seam numbers, raw.
- Files touched, and a `COULD NOT VERIFY` section — if you could not render (no Chrome, no
  OfflineAudioContext), say so plainly and deliver the structure map only. A missing render is a reportable
  finding, not something to fake.

## HOUSE RULES

No emojis. No `git commit/checkout/reset/stash/clean` — leave the tree dirty for the orchestrator. Post
`done:` / `blocked:` / `checkpoint:` to the hordes channel FIRST, then the raw evidence. Append a timestamped
heartbeat line to `/tmp/music_progress.log` before and after every step that can exceed a few seconds. No
sims and no long cohorts: this task has no measurement arm at all. Then END YOUR RUN cleanly.
