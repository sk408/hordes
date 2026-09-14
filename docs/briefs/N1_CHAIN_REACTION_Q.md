# BRIEF - N1 slice 1: the Witch's Q = CHAIN REACTION  (OWNER-SPECCed, do not reopen the design)

Repo: /home/claude/projects/hordes (HEAD bfb56d7 at issue time).
READ FIRST: docs/HORDES_GOALS_2026-09-12.md, section '#### N1b - THE MANA PROGRESSION', item 3
and its sub-items (i)(ii)(iii) - that text is the AUTHORITATIVE spec (owner-confirmed). Below is
anchors and bounds, not a competing design. Also read the visual-verification note at the top of
that same doc.

## WHAT TO BUILD
The Witch's Q becomes CHAIN REACTION, her DEFINING move. From item 3:
(i)   A mana-fed chain attack cast at the nearest target, jumping FURTHER than her starting weapon
      with GENTLER falloff. Her gun is WEAPONS.ZAP (name 'Chain Zap', 1.4s CD, 3 jumps, CHAIN_RANGE
      90, FALLOFF 0.75). The Q must EXCEED it on jumps and reach and be gentler on falloff, so it
      reads as the big deliberate burst - not a second copy of her gun, which already auto-fires
      chain zaps on cooldown. If it reads flat against the gun, it is wrong.
(ii)  EVERY enemy the chain KILLS DETONATES. Reuse the existing onkillboom blast ('every kill
      detonates - the blast damages enemies nearby'); do NOT write a second blast. Mana per
      detonation at the ESTABLISHED 6-mana price (item 2). Do not invent or lower the price -
      item 2 is explicit that the relief valve is the shop, never a balance change.
(iii) FROST_NOVA's SLOW moves ONTO the chain: every enemy the chain TOUCHES takes the slow (85px
      radius, 2.5s, 0.45x speed). FROST_NOVA gets NO balance change; it leaves the Q slot and
      returns later as a DRAFTABLE card. That card is N1 slice 2 and is NOT part of this task.
Keep the existing Chain Reaction DRAFTABLE CARD in the pool for the other three classes - do not
remove or nerf it because the Witch has it built in (deliberate, item 3 iii). Leave her starting
WEAPON ZAP untouched.

## ANCHORS THAT ALREADY EXIST (pilot-verified at bfb56d7)
- src/main.js:4547 classSkillId(st) - the ONE place a class skill id is read. The per-class Q
  routing is ALREADY LIVE: :4577 act q -> useSkill(state, classSkillId(state)); :4578 w ->
  OVERCHARGE; :4691-4708 autopilot Q/E; :4840 keycap map; :5117 skill('tc-q', classSkillId(state));
  :5219 the text-HUD line. This task adds the SKILL the Witch id points at and its identity - it
  is NOT new plumbing.
- src/skills.js:16 useSkill(state, id) - the skill table and the FROST_NOVA slow live here.
- src/meta.js:751,758,769,776 - the four CHARACTERS rows, each still skill: 'FROST_NOVA'. The
  Witch row's skill id is the one that must point at the new Chain Reaction entry.
- index.html:319 - the Q touch button: the label text FROST sits in the span with id 'q-skill',
  beside the [Q] keycap and the 'tc-q' RDY badge. That FROST string is the ONE hardcoded skill
  literal in the UI. Check the tour's 'skills' coachmark copy for the same.

## A TRAP TO AVOID
Item 3's preamble says 'the Witch's Q is Chain Zap (already routed through classSkillId)' while the
owner-confirmed spec below says her Q = CHAIN REACTION. Not a conflict: 'Chain Zap' there names her
weapon/routing. Implement the Q as CHAIN REACTION and leave WEAPONS.ZAP exactly as it is.

## HARD BOUNDS
- Never weaken, move, delete or tolerate an assertion to go green. If a test reds, fix the code or
  STOP and report with the measurement. 60Hz and 120Hz must both stay correct; no fixed-dt assumption.
- No git state commands (commit/checkout/reset/stash/clean) - the orchestrator owns commits. No emojis.
- SERIALIZE BEFORE WRITING: run ~/projects/agent-hub/sdk/agentlock status. If HELD by another owner
  do NOT self-cancel: sleep 20s and re-check, up to 15 times (5 minutes); never edit while held.
  Only if still held after 5 minutes, post 'blocked:' and stop. Otherwise acquire it (agentlock
  acquire --note n1-chain-reaction), beat as you go, RELEASE at the end.
- Bounds: src/, index.html, and any tour copy the label change touches. Tests only if a NEW
  assertion for the new behaviour is genuinely needed - never an edit that loosens one.

## ACCEPTANCE BAR (evidence, not claims)
1. bash /tmp/run_all.sh THREE consecutive times, each ending redfiles=0, with the TREE: line pasted
   for each run (a green measured on a stale tree is the exact failure this suite was fixed for).
2. Standalone 20/20 tallies for every test file you touch.
3. MEASURED before/after on a real cohort, numbers not intentions: the Witch's detonation count and
   mana spent over a 120s run with the new Q vs the parent commit baseline; plus the chain's
   jumps/reach/falloff numbers next to WEAPONS.ZAP so 'it is the burst' is checkable.
4. A REAL-browser screenshot at the PHONE viewport 390x844 @dpr3 showing the Q button with the new
   label, and you must actually OPEN AND READ the PNG before claiming how it looks. Give the path.
   If no vision model is reachable, say so in COULD NOT VERIFY rather than describing what you
   assume it shows.
5. Report as a done: line plus: files touched; measured numbers; suite TREE+counts; screenshot path;
   and a COULD NOT VERIFY section (expected, not a failure).
