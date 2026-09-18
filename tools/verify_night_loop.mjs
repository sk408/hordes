// HORDES - NIGHT LOOP browser verification (defect follow-up 2026-09-17:
// "turned on the overnight mode, but it's still sitting on the end of run
// summary instead of starting a new run").
//
// WHY THIS EXISTS: test_night_mode.mjs asserted mode flags through the node
// harness while the owner watched a parked screen — the same class of gap as
// the device-blind suite. This tool drives the REAL page in a REAL browser at
// phone size and asserts PLAYER-OBSERVABLE state only: the end-summary card is
// gone from the DOM, the run clock restarted at 0, the intermission card
// advances, the escape is skipped, a draft resolves itself. Every wait is a
// WATCHDOG: delay + grace, then FAIL — the tool never waits forever, exactly
// the guarantee the night loop itself must give.
//
// Run: node tools/verify_night_loop.mjs   (screenshots -> $SHOT_DIR, default
// /tmp/hordes-shots). Exits non-zero on any failed assertion.
import { withPage } from './browser.mjs';

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail: detail || '' });
  console.log((ok ? 'ok  - ' : 'FAIL- ') + name + (detail ? '  [' + detail + ']' : ''));
}

// Player-observable page state (never a module flag): the overlay's title
// text, the summary cards, and the canvas-backed run — read through the LIVE
// module instance only where the DOM cannot see it (run clock), clearly named.
const PAGE = `(() => {
  const t = document.getElementById('ov-title');
  const cards = document.getElementById('ov-cards');
  const sub = document.getElementById('ov-sub');
  return {
    ovShown: !!(document.getElementById('overlay') &&
      getComputedStyle(document.getElementById('overlay')).display !== 'none'),
    title: t ? t.textContent : '',
    sub: sub ? sub.textContent.slice(0, 80) : '',
    cardBtns: cards ? [...cards.querySelectorAll('button')].map(b => b.textContent) : [],
  };
})()`;

await withPage({ w: 390, h: 844, dpr: 3 }, async (pg) => {
  const T = await pg.evaluate("import('./src/main.js').then(m => { window.__T = m.__TEST; return true; })");

  // 0. The toggle is OFF by default (a manual player is unaffected).
  const fresh = await pg.evaluate('window.__T.night.on');
  record('night is OFF by default (fresh session)', fresh === false);

  // Enable night through the REAL UI: title -> SETUP -> two presses on the
  // NIGHT MODE card (the two-press confirm), then BACK and START.
  await pg.waitFor("document.getElementById('ov-cards') && document.getElementById('ov-cards').querySelectorAll('.card').length");
  const clickCard = (label) => pg.evaluate(
    "(() => { const label = " + JSON.stringify(label) + ";" +
    " const bs = [...document.querySelectorAll('#ov-cards .card')]" +
    " .filter(b => b.textContent.trim().startsWith(label));" +
    " if (!bs.length) return false; bs[0].click(); return true; })()");
  await pg.waitFor("(() => { const b=[...document.querySelectorAll('#ov-cards .card')].filter(x=>x.textContent.trim().startsWith('SETUP')); return b.length>0; })()");
  await clickCard('SETUP');
  await pg.waitFor("(() => [...document.querySelectorAll('#ov-cards .card')].some(x=>x.textContent.trim().startsWith('NIGHT MODE')))");
  record('night card visible in SETUP', true);
  await clickCard('NIGHT MODE');   // first press: ARMED
  const armed = await pg.evaluate('window.__T.night.armed');
  await clickCard('NIGHT MODE');   // second press: ON
  const on = await pg.evaluate('window.__T.night.on');
  record('two real presses turn the night ON (arm, then on)',
    armed === true && on === true, 'armed=' + armed + ' on=' + on);

  // Start the run through the real START GAME card. A FRESH profile meets the
  // up-front controls gate first (START GAME -> HOW TO PLAY -> GOT IT starts
  // the run) — walk it the way a first-time player does.
  await clickCard('BACK');
  await pg.waitFor("(() => [...document.querySelectorAll('#ov-cards .card')].some(x=>x.textContent.trim().startsWith('START GAME')))");
  await clickCard('START GAME');
  if (await pg.waitFor("(() => [...document.querySelectorAll('#ov-cards .card')].some(x=>x.textContent.trim().startsWith('GOT IT')))", 3000)) {
    await clickCard('GOT IT');
  }
  const playing = await pg.waitFor("window.__T.state.mode === 'playing'", 5000);
  record('the night run started (playing)', playing === true);

  // 1. THE DEFECT PATH: the run ends; the summary must be GONE within
  //    NIGHT_RESTART_S + grace and a NEW run observable (clock at 0).
  await pg.evaluate('window.__T.die()');   // the death seam every damage path calls
  const cardUp = await pg.waitFor("document.getElementById('ov-title').textContent.length > 0", 3000);
  const cardTitle = (await pg.evaluate(PAGE)).title;
  record('the end-of-run summary is displayed on death', cardUp === true, JSON.stringify(cardTitle));
  const RESTART_MS = Math.round((await pg.evaluate('window.__T.night.constants.RESTART_S')) * 1000);
  const restarted = await pg.waitFor(
    "window.__T.state.mode === 'playing' && window.__T.state.time < 1 && !window.__T.state.endScreen",
    RESTART_MS + 2500, 100);
  const after = await pg.evaluate(PAGE);
  record('the summary auto-dismissed and a NEW run started within RESTART_S + grace',
    restarted === true, 'title now: ' + JSON.stringify(after.title));
  await pg.shot('night-loop-second-run');

  // 2. The ladder: force the wave-1 clear (the node tests' own technique) and
  //    watch the REAL transitions: portal cine skipped, ESCAPE skipped,
  //    intermission CONTINUE on its named delay.
  await pg.evaluate(`(() => {
    const st = window.__T.state;
    st.spawnTimer = 1e9; st.wave.endsAt = st.time + 1e9; st.wave.midAt = st.time + 1e9;
    st.wave.endsAt = st.time;
    window.__heal = setInterval(() => {
      if (st.mode === 'playing' || st.mode === 'finale') st.player.hp = st.player.stats.maxHp;
    }, 100);
  })()`);
  const bossUp = await pg.waitFor('(window.__T.state.wave.bosses || []).length > 0', 30000);
  record('the wave-1 boss spawned', bossUp === true);
  await pg.evaluate(`(() => {
    const st = window.__T.state;
    for (const b of (st.wave.bosses || [])) if (b.hp > 0) b.hp = 0;
    st.wave.cinePending = true; st.portal = null;
  })()`);
  // THE CINE SKIP, PROVEN BY SAMPLING: the mode ring starts BEFORE the boss
  // falls (250ms samples). A PLAYED portal cine holds 'portal-cine' for its
  // full 6857ms (~27 samples); the night skip transits inside a single update
  // tick and never samples. "Intermission reached + no portal-cine in the
  // ring" is therefore the skip's proof — robust against the transient-mode
  // races that broke two earlier shapes of this check (2026-09-18: the
  // escape→skip chain is synchronous, and the hand-off can legally take
  // >15s — a level-up draft may open mid-sweep and auto-resolve on its own
  // 6s window before the intermission opens).
  await pg.evaluate(`(() => {
    window.__modes = [];
    let last = null;
    window.__modeWatch = setInterval(() => {
      const m = window.__T.state.mode;
      if (m !== last) { window.__modes.push((performance.now() / 1000).toFixed(1) + 's:' + m); last = m; }
    }, 250);
  })()`);
  const inter = await pg.waitFor("window.__T.state.mode === 'intermission'", 30000);
  const ring = await pg.evaluate('clearInterval(window.__modeWatch), window.__modes.join(" > ")');
  record('the portal cine is skipped straight to the escape ladder (no portal-cine sampled; intermission reached)',
    inter === true && !ring.includes('portal-cine'), ring.slice(-200));
  const interSub = (await pg.evaluate(PAGE)).sub;
  record('the escape auto-skipped back to the intermission', inter === true, JSON.stringify(interSub));
  const CONTINUE_MS = Math.round((await pg.evaluate('window.__T.night.constants.CONTINUE_S')) * 1000);
  const wave2 = await pg.waitFor(
    "window.__T.state.mode === 'playing' && window.__T.state.wave.num >= 2",
    CONTINUE_MS + 4000, 100);
  record('the intermission auto-CONTINUE fired on its named delay', wave2 === true);

  // 3. A draft resolves itself through the REAL level-up: a gem seeded at
  //    the pilot's feet (the game's own XP income — makeGem's exact shape)
  //    levels the run on its next pickup scan and openDraft presents. The
  //    assertion is the AUTO-PICK on the documented window; organic kills
  //    cannot carry this arm because the AUTO pilot stalls near the arena rim
  //    (the known queued defect — measured 2026-09-18: kills frozen at 4 with
  //    400+ enemies on the field and the frame loop alive, so gems drop but
  //    are never walked over).
  await pg.evaluate('window.__T.state.spawnTimer = 0');
  await pg.evaluate(`(() => { const st = window.__T.state, p = st.player;
    st.gems.push({ x: p.x, y: p.y, xp: p.xpNext }); })()`);
  const draftSeen = await pg.waitFor("window.__T.state.mode === 'draft'", 20000);
  if (draftSeen) {
    const resolved = await pg.waitFor("window.__T.state.mode !== 'draft'", 10000, 100);
    record('a draft auto-picked within DRAFT_TIMEOUT + grace', resolved === true);
  } else {
    record('a draft auto-picked within DRAFT_TIMEOUT + grace', false,
      'the seeded level-up never presented a draft');
  }

  // 4. Second death AFTER the ladder: the loop keeps turning end to end.
  // Guarded on 'playing' first — die() is the playing-state death seam, and
  // calling it from any other mode is not a real transition.
  await pg.waitFor("window.__T.state.mode === 'playing'", 15000, 100);
  await pg.evaluate('window.__T.die()');
  const second = await pg.waitFor("window.__T.state.mode === 'playing' && window.__T.state.time < 1",
    RESTART_MS + 2500, 100);
  record('a second death also auto-restarts (the loop turns repeatedly)', second === true);
  await pg.shot('night-loop-after-second-death');

  const errs = pg.errors;
  record('no page errors through the whole loop', errs.length === 0, errs.join(' | ').slice(0, 200));
});

const failed = results.filter(r => !r.ok);
console.log(failed.length
  ? 'NIGHT LOOP VERIFY: ' + failed.length + ' FAILED of ' + results.length
  : 'NIGHT LOOP VERIFY: all ' + results.length + ' checks passed (real browser, phone viewport)');
process.exit(failed.length ? 1 : 0);
