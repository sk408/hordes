// v9 WHAT'S NEW (owner 2026-09-17): "Have we timestamped last played for our
// auto saves yet? ... We can give them a fancy paper looking popup explaining
// new features." This verifier drives the REAL returning-player path on a
// real browser profile at both viewports: an OLD (pre-timestamp) save
// migrates, the paper note pops on the title at launch (carrying the OPT-IN
// offer button), a REAL finger tap dismisses it and PERSISTS lastSeenUpdate,
// the title stays fully playable, and a reload never pops it again. The
// opt-in legs: a DECLINED veteran plays normally (nothing automatic); a real
// tap on SHOW ME starts the guided run flagged ASSISTED (B6), the approved
// skip + drink still pays the shield, and the opt-in is consumed once.
// Screenshots of the parchment note are kept for the report.
// Run: node tools/verify_whatsnew.mjs
import { withPage } from './browser.mjs';
import { copyFileSync, mkdirSync } from 'node:fs';

const ART = '/home/claude/projects/hordes/docs/art/whatsnew-2026-09-18/shots';
mkdirSync(ART, { recursive: true });

let fails = 0;
function ok(cond, label) {
  console.log((cond ? '  ok - ' : '  FAIL - ') + label);
  if (!cond) fails++;
}

// A returning player's OLD save: v8 (pre-timestamp schema), real earned
// facts, never seen any release note. Seeded before the page's scripts run.
const OLD_SAVE = JSON.stringify({
  version: 8, gold: 512, purchased: { dmg: 2 },
  unlockedWeapons: ['VOLLEY', 'BOOMERANG'], unlockedElites: [],
  runPurse: 0, apex: {},
  achievements: { totals: { runs: 7 } },
});

async function viewport(w, h, tag, mobile = true) {
  // The seed is GUARDED so the page-reload leg (step 3) keeps whatever the
  // dismiss persisted — addScriptToEvaluateOnNewDocument re-runs on reload.
  // skipPrologue: false — the default settle-seed would pre-empt this file's
  // OWN old-save seed (both run as new-document scripts, first-writer-wins),
  // and it stamps lastPlayed=now, which is exactly the ACTIVE player this
  // verifier must NOT be. The seeded save carries runs: 7, so no prologue.
  await withPage({ w, h, dpr: mobile ? 3 : 1, mobile, skipPrologue: false,
    startupScript: "try { localStorage.setItem('hordes_onboarded', '1'); " +
      "if (!localStorage.getItem('hordes_profile_v1')) localStorage.setItem('hordes_profile_v1', " +
      JSON.stringify(OLD_SAVE) + "); } catch (e) {}" },
  async (p) => {
    await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode !== 'intro')()`, 15000);
    await p.sleep(600);   // the title reveal fade

    // 1. THE NOTE IS UP: the parchment card floats ON THE OVERLAY SHEET —
    //    OVER the title, out of the card flow (owner 2026-09-18: "the update
    //    message should overlay the title screen instead of pushing it
    //    down"), the real menu sits UNMOVED under it, and the save migrated.
    const prof = () => p.evaluate(`(async () => { const T2 = (await import('./src/main.js')).__TEST;
      return T2.getProfile(); })()`);
    const t0 = await prof();
    ok(t0.lastPlayed === null && t0.lastSeenUpdate === null,
      '[' + tag + '] the old save migrated with null lastPlayed/lastSeenUpdate (returning player, not seen)');
    const noteInfo = await p.evaluate(`(() => {
      const cards = [...document.getElementById('ov-cards').children];
      const note = document.querySelector('#overlay .paper-note');
      const cs = note ? getComputedStyle(note) : null;
      const r = note ? note.getBoundingClientRect() : null;
      const start = cards.find(c => (c.textContent || '').toUpperCase().includes('START GAME'));
      const sr = start ? start.getBoundingClientRect() : null;
      return { first: cards[0] && cards[0].className, isNote: !!note,
        inFlow: !!note && cards.includes(note), position: cs && cs.position,
        n: cards.length, bg: cs && cs.backgroundImage.slice(0, 30),
        cursor: cs && cs.cursor,
        txt: note ? note.textContent : '',
        startTop: sr && sr.top, startLeft: sr && sr.left,
        rect: r ? { x: r.x, y: r.y, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight } : null }; })()`);
    ok(noteInfo.isNote && !noteInfo.inFlow,
      '[' + tag + '] the paper note floats on #overlay, OUT of the title card flow');
    ok(noteInfo.position === 'absolute',
      '[' + tag + '] the note is positioned over the title (computed position: ' + noteInfo.position + ')');
    ok(/WHAT'S NEW/.test(noteInfo.txt),
      '[' + tag + '] the note carries the release title');
    ok(/index buttons are gone/i.test(noteInfo.txt) && /prev and next/i.test(noteInfo.txt) &&
      /under the text/i.test(noteInfo.txt),
      '[' + tag + '] the ENTRY tells the HOW TO PLAY fix (index gone, prev/next under the text)');
    ok(/CLOSE/.test(noteInfo.txt),
      '[' + tag + '] the note carries an OBVIOUS dismiss button');
    ok(!/SHOW ME/.test(noteInfo.txt) && !/guided run/i.test(noteInfo.txt),
      '[' + tag + '] no guided-run offer or copy while the prologue gate is off');
    ok(/linear-gradient/.test(noteInfo.bg) && noteInfo.cursor === 'pointer',
      '[' + tag + '] the parchment treatment is live (gradient tint, tap-to-dismiss cursor)');
    ok(noteInfo.rect && noteInfo.rect.x >= 0 && noteInfo.rect.y >= 0 &&
       noteInfo.rect.x + noteInfo.rect.w <= noteInfo.rect.vw + 1 &&
       noteInfo.rect.y + noteInfo.rect.h <= noteInfo.rect.vh + 1,
      '[' + tag + '] the note fits the viewport, nothing clipped (' +
      JSON.stringify(noteInfo.rect) + ')');
    ok(noteInfo.n >= 7, '[' + tag + '] the real menu is fully present under the note (' + noteInfo.n + ' cards)');
    const shot = await p.shot('whatsnew-' + tag);
    copyFileSync(shot, ART + '/whatsnew-' + tag + '.png');
    ok(true, '[' + tag + '] paper-note shot (parchment popup OVERLAYING the title)');

    // 2. THE DISMISS, through a REAL finger tap on the CLOSE button — and
    //    the title must not move a pixel (overlay, not reflow).
    const bytesBefore = await p.evaluate(`localStorage.getItem('hordes_profile_v1')`);
    // A CDP touch tap can land soft intermittently; retry the REAL tap (a
    // second real gesture, not a synthetic click) while the note stands.
    for (let attempt = 0; attempt < 3; attempt++) {
      const noteRect = await p.evaluate(`(() => {
        const btn = document.querySelector('#overlay .paper-note .wn-close');
        if (!btn) return null;
        const r = btn.getBoundingClientRect();
        return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      if (!noteRect) break;
      await p.tap(noteRect[0], noteRect[1], 2);
      await p.sleep(250);
    }
    await p.sleep(200);
    const after = await p.evaluate(`(() => {
      const cards = [...document.getElementById('ov-cards').children];
      const start = cards.find(c => (c.textContent || '').toUpperCase().includes('START GAME'));
      const sr = start ? start.getBoundingClientRect() : null;
      return { note: !!document.querySelector('#overlay .paper-note'), n: cards.length,
        startTop: sr && sr.top, startLeft: sr && sr.left,
        start: !!start }; })()`);
    ok(!after.note && after.start && after.n >= 7,
      '[' + tag + '] the real tap on CLOSE dismissed the note; the title is whole and playable');
    ok(Math.abs((after.startTop || 0) - (noteInfo.startTop || 0)) < 0.5 &&
      Math.abs((after.startLeft || 0) - (noteInfo.startLeft || 0)) < 0.5,
      '[' + tag + '] the title did NOT reflow: START GAME top ' + noteInfo.startTop +
      ' -> ' + after.startTop + ' (identical with the note up and after dismiss)');
    const persisted = await p.evaluate(`JSON.parse(localStorage.getItem('hordes_profile_v1')).lastSeenUpdate`);
    const relId = await p.evaluate(`(async () => (await import('./src/main.js')).__TEST.whatsNew.release.id)()`);
    ok(persisted === relId,
      '[' + tag + '] the dismiss PERSISTED lastSeenUpdate = this release ("' + persisted + '")');
    ok(await p.evaluate(`localStorage.getItem('hordes_profile_v1')`) !== bytesBefore,
      '[' + tag + '] the persisted BYTES changed on the dismiss tap');

    // 3. RELOAD: shown once — the note never pops again for this release.
    await p.evaluate("location.reload()");
    await p.sleep(2500);
    await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode !== 'intro')()`, 15000);
    await p.sleep(600);
    const reloaded = await p.evaluate(`(() => {
      const cards = [...document.getElementById('ov-cards').children];
      return { note: !!document.querySelector('#overlay .paper-note'),
        start: cards.some(c => (c.textContent || '').includes('START GAME')) }; })()`);
    ok(!reloaded.note && reloaded.start,
      '[' + tag + '] after reload the note does NOT pop again (shown once per release)');

    // 4. THE STAMP: the save path stamps lastPlayed on the real profile, and
    //    the value MOVES between saves (a later save reads later).
    const stamp1 = await p.evaluate(`(async () => { const m = await import('./src/main.js');
      m.autosave('exit');
      return JSON.parse(localStorage.getItem('hordes_profile_v1')).lastPlayed; })()`);
    await p.sleep(1100);
    const stamp2 = await p.evaluate(`(async () => { const m = await import('./src/main.js');
      m.autosave('exit');
      return JSON.parse(localStorage.getItem('hordes_profile_v1')).lastPlayed; })()`);
    ok(typeof stamp1 === 'number' && stamp1 > 0,
      '[' + tag + '] the save path stamps lastPlayed on the real profile (' + stamp1 + ')');
    ok(stamp2 > stamp1,
      '[' + tag + '] the timestamp MOVES between saves (' + stamp1 + ' -> ' + stamp2 + ')');

    // 5. OPT-IN (addendum: "would have to be opt-in. Ask them if they want to
    //    see it"): this profile DECLINED (dismissed) — nothing automatic may
    //    happen. CDP returnByValue strips functions, so every seam call runs
    //    inline.
    const declined = await p.evaluate(`(async () => { const T2 = (await import('./src/main.js')).__TEST;
      T2.startRun();
      return { active: T2.prologue.active, assisted: T2.state.assistedRun,
        mode: T2.state.mode }; })()`);
    ok(declined.active === false && declined.assisted === false && declined.mode === 'playing',
      '[' + tag + '] a DECLINED veteran plays normally (no prologue, no assist, nothing automatic)');
    // 5b. THE GATE (owner 2026-09-18): while C.PROLOGUE.ENABLED is off the
    //     note makes NO offer — it cannot advertise a run it cannot start.
    const gated = await p.evaluate(`(async () => { const T2 = (await import('./src/main.js')).__TEST;
      const CFG = await import('./src/config.js');
      T2.getProfile().lastPlayed = null; T2.getProfile().lastSeenUpdate = null;
      T2.whatsNew.tried = false; T2.showTitle();
      const note = document.querySelector('#overlay .paper-note');
      const gateOff = CFG.CONFIG.PROLOGUE.ENABLED === false;
      const offerless = note && !note.querySelector('.offer') && !/SHOW ME/.test(note.textContent);
      // Then the gate ON, in-page (the kill switch flips back at the leg's end):
      // the SAME note now offers.
      const n = note; if (n && n.remove) n.remove();
      T2.getProfile().lastPlayed = null; T2.getProfile().lastSeenUpdate = null;
      T2.whatsNew.tried = false;
      CFG.CONFIG.PROLOGUE.ENABLED = true;
      T2.showTitle();
      const note2 = document.querySelector('#overlay .paper-note');
      const offer = note2 && note2.querySelector('.offer');
      const r = offer ? offer.getBoundingClientRect() : null;
      const cs = offer ? getComputedStyle(offer) : null;
      return { gateOff, offerless, note: !!note2, offer: !!offer, txt: offer ? offer.textContent : '',
        rect: r ? { x: r.x, y: r.y, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight } : null,
        cursor: cs && cs.cursor }; })()`);
    ok(gated.gateOff && gated.offerless,
      '[' + tag + '] GATE OFF (the shipped default): the note carries NO offer button');
    ok(gated.note && gated.offer,
      '[' + tag + '] GATE ON: the note carries the OFFER button ("' + gated.txt + '")');
    ok(gated.cursor === 'pointer' && gated.rect && gated.rect.x >= 0 &&
       gated.rect.y >= 0 && gated.rect.x + gated.rect.w <= gated.rect.vw + 1 &&
       gated.rect.y + gated.rect.h <= gated.rect.vh + 1,
      '[' + tag + '] the offer button is legible + hittable, nothing clipped (' +
      JSON.stringify(gated.rect) + ')');

    // 6. ACCEPT through a REAL tap on the offer button: the guided run starts
    //    NOW, flagged ASSISTED (B6), the ask marked seen, the skip still safe.
    const offerRect = await p.evaluate(`(() => {
      const offer = document.querySelector('#overlay .paper-note .offer');
      const r = offer.getBoundingClientRect();
      return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
    await p.tap(offerRect[0], offerRect[1], 2);
    await p.sleep(300);
    const accepted = await p.evaluate(`(async () => { const T2 = (await import('./src/main.js')).__TEST;
      return { active: T2.prologue.active, potion: T2.prologue.potion,
        assisted: T2.state.assistedRun, mode: T2.state.mode,
        seen: JSON.parse(localStorage.getItem('hordes_profile_v1')).lastSeenUpdate,
        noteGone: !document.querySelector('#overlay .paper-note') }; })()`);
    ok(accepted.active === true && !!accepted.potion && accepted.mode === 'playing',
      '[' + tag + '] the real tap on SHOW ME starts the guided run (potion on screen, run live)');
    ok(accepted.assisted === true,
      '[' + tag + '] the accepted run is flagged ASSISTED (B6: the run-scoped stamp)');
    ok(accepted.seen === relId && accepted.noteGone,
      '[' + tag + '] the accept marked the release seen (asked once) and closed the note');
    const skipDrink = await p.evaluate(`(async () => { const T2 = (await import('./src/main.js')).__TEST;
      // the skip is a TWO-PRESS gesture since the 2026-09-18 rework
      T2.prologue.skip(); T2.prologue.skip(); T2.prologue.drink();
      return { active: T2.prologue.active, shieldT: T2.prologue.shieldT,
        mode: T2.state.mode }; })()`);
    ok(skipDrink.active === false && skipDrink.shieldT > 0 && skipDrink.mode === 'playing',
      '[' + tag + '] skip (two-press) + drink from this entry point: shield paid, run live');
    const next = await p.evaluate(`(async () => { const T2 = (await import('./src/main.js')).__TEST;
      const CFG = await import('./src/config.js');
      CFG.CONFIG.PROLOGUE.ENABLED = false;   // back to the shipped default
      T2.startRun();
      return { active: T2.prologue.active, assisted: T2.state.assistedRun }; })()`);
    ok(next.active === false && next.assisted === false,
      '[' + tag + '] the opt-in is consumed: the next run is a normal run');

    const errors = p.errors;
    if (errors.length) { console.log('[' + tag + '] PAGE ERRORS: ' + errors.join(' | ').slice(0, 300)); fails++; }
  });
}

await viewport(390, 844, '390x844');
await viewport(320, 568, '320x568');
await viewport(1280, 800, 'desktop-1280x800', false);
console.log(fails ? 'FAILURES: ' + fails : 'ALL OK');
process.exit(fails ? 1 : 0);
