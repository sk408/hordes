// v9 WHAT'S NEW (owner 2026-09-17): "Have we timestamped last played for our
// auto saves yet? ... We can give them a fancy paper looking popup explaining
// new features." This verifier drives the REAL returning-player path on a
// real browser profile at both viewports: an OLD (pre-timestamp) save
// migrates, the paper note pops on the title at launch, a REAL finger tap
// dismisses it and PERSISTS lastSeenUpdate, the title stays fully playable,
// and a reload never pops it again. Screenshots of the parchment note are
// kept for the report. Run: node tools/verify_whatsnew.mjs
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

async function viewport(w, h, tag) {
  // The seed is GUARDED so the page-reload leg (step 3) keeps whatever the
  // dismiss persisted — addScriptToEvaluateOnNewDocument re-runs on reload.
  // skipPrologue: false — the default settle-seed would pre-empt this file's
  // OWN old-save seed (both run as new-document scripts, first-writer-wins),
  // and it stamps lastPlayed=now, which is exactly the ACTIVE player this
  // verifier must NOT be. The seeded save carries runs: 7, so no prologue.
  await withPage({ w, h, dpr: 3, mobile: true, skipPrologue: false,
    startupScript: "try { localStorage.setItem('hordes_onboarded', '1'); " +
      "if (!localStorage.getItem('hordes_profile_v1')) localStorage.setItem('hordes_profile_v1', " +
      JSON.stringify(OLD_SAVE) + "); } catch (e) {}" },
  async (p) => {
    await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode !== 'intro')()`, 15000);
    await p.sleep(600);   // the title reveal fade

    // 1. THE NOTE IS UP: the parchment card is the FIRST card on the title,
    //    the real menu sits under it, and the save migrated (v9, null stamp).
    const prof = () => p.evaluate(`(async () => { const T2 = (await import('./src/main.js')).__TEST;
      return T2.getProfile(); })()`);
    const t0 = await prof();
    ok(t0.lastPlayed === null && t0.lastSeenUpdate === null,
      '[' + tag + '] the old save migrated with null lastPlayed/lastSeenUpdate (returning player, not seen)');
    const noteInfo = await p.evaluate(`(() => {
      const cards = [...document.getElementById('ov-cards').children];
      const note = cards.find(c => c.className.includes('paper-note'));
      const cs = note ? getComputedStyle(note) : null;
      const r = note ? note.getBoundingClientRect() : null;
      return { first: cards[0] && cards[0].className, isNote: !!note,
        n: cards.length, bg: cs && cs.backgroundImage.slice(0, 30),
        border: cs && cs.borderColor, cursor: cs && cs.cursor,
        txt: note ? note.textContent.slice(0, 60) : '',
        rect: r ? { x: r.x, y: r.y, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight } : null }; })()`);
    ok(noteInfo.isNote && noteInfo.first.includes('paper-note'),
      '[' + tag + '] the paper note is the FIRST card on the title');
    ok(/WHAT'S NEW/.test(noteInfo.txt),
      '[' + tag + '] the note carries the release title ("' + noteInfo.txt + '")');
    ok(/linear-gradient/.test(noteInfo.bg) && noteInfo.cursor === 'pointer',
      '[' + tag + '] the parchment treatment is live (gradient tint, tap-to-dismiss cursor)');
    ok(noteInfo.rect && noteInfo.rect.x >= 0 && noteInfo.rect.y >= 0 &&
       noteInfo.rect.x + noteInfo.rect.w <= noteInfo.rect.vw + 1 &&
       noteInfo.rect.y + noteInfo.rect.h <= noteInfo.rect.vh + 1,
      '[' + tag + '] the note fits the viewport, nothing clipped (' +
      JSON.stringify(noteInfo.rect) + ')');
    ok(noteInfo.n >= 8, '[' + tag + '] the real menu is fully present under the note (' + noteInfo.n + ' cards)');
    const shot = await p.shot('whatsnew-' + tag);
    copyFileSync(shot, ART + '/whatsnew-' + tag + '.png');
    ok(true, '[' + tag + '] paper-note shot (parchment popup over the title)');

    // 2. THE DISMISS, through a REAL finger tap on the note.
    const noteRect = await p.evaluate(`(() => {
      const note = [...document.getElementById('ov-cards').children]
        .find(c => c.className.includes('paper-note'));
      const r = note.getBoundingClientRect();
      return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
    await p.tap(noteRect[0], noteRect[1], 2);
    await p.sleep(200);
    const after = await p.evaluate(`(() => {
      const cards = [...document.getElementById('ov-cards').children];
      return { note: cards.some(c => c.className.includes('paper-note')), n: cards.length,
        start: cards.some(c => (c.textContent || '').includes('START GAME')) }; })()`);
    ok(!after.note && after.start && after.n >= 7,
      '[' + tag + '] the real tap dismissed the note; the title is whole and playable');
    const persisted = await p.evaluate(`JSON.parse(localStorage.getItem('hordes_profile_v1')).lastSeenUpdate`);
    const relId = await p.evaluate(`(async () => (await import('./src/main.js')).__TEST.whatsNew.release.id)()`);
    ok(persisted === relId,
      '[' + tag + '] the dismiss PERSISTED lastSeenUpdate = this release ("' + persisted + '")');

    // 3. RELOAD: shown once — the note never pops again for this release.
    await p.evaluate("location.reload()");
    await p.sleep(2500);
    await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode !== 'intro')()`, 15000);
    await p.sleep(600);
    const reloaded = await p.evaluate(`(() => {
      const cards = [...document.getElementById('ov-cards').children];
      return { note: cards.some(c => c.className.includes('paper-note')),
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

    const errors = p.errors;
    if (errors.length) { console.log('[' + tag + '] PAGE ERRORS: ' + errors.join(' | ').slice(0, 300)); fails++; }
  });
}

await viewport(390, 844, '390x844');
await viewport(320, 568, '320x568');
console.log(fails ? 'FAILURES: ' + fails : 'ALL OK');
process.exit(fails ? 1 : 0);
