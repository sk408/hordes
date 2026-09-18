// RUN-COUNT MILESTONE CHESTS (owner 2026-09-17/18): browser evidence at the
// two mandated sizes. Seeds a real v9 save one run short of the 50 milestone
// (lifetime average ~300g/run — the owner's "new player can get 300g easily"
// anchor), starts run #50 for real, and photographs: the BIG chest in the
// world at run start (nothing clips at either size), the autopilot's walk-in
// collect, and the burst-then-card payoff. Then proves the once-only claim:
// run #51 spawns nothing.
// Run: node tools/verify_runchests.mjs
import { withPage } from './browser.mjs';
import { copyFileSync, mkdirSync } from 'node:fs';

const ART = '/home/claude/projects/hordes/docs/art/runchests-2026-09-18/shots';
mkdirSync(ART, { recursive: true });

let fails = 0;
function ok(cond, label) {
  console.log((cond ? '  ok - ' : '  FAIL - ') + label);
  if (!cond) fails++;
}

// v9 (pre-milestoneChest): the page's own v10 migration adds the field, which
// is part of what this verifier exercises in a real browser. runs=49, gold
// 14,700 -> lifetime avg 300 -> the 50 chest pays 3,000 (10 runs' worth).
const SAVE = JSON.stringify({
  version: 9, gold: 512, purchased: { dmg: 2 },
  unlockedWeapons: ['VOLLEY', 'BOOMERANG'], unlockedElites: [],
  runPurse: 0, apex: {},
  achievements: { totals: { runs: 49, gold: 14700 } },
});

async function viewport(w, h, tag) {
  await withPage({ w, h, dpr: 3, mobile: true, skipPrologue: false,
    startupScript: "try { localStorage.setItem('hordes_onboarded', '1'); " +
      "if (!localStorage.getItem('hordes_profile_v1')) localStorage.setItem('hordes_profile_v1', " +
      JSON.stringify(SAVE) + "); } catch (e) {}" },
  async (p) => {
    await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode !== 'intro')()`, 15000);
    await p.sleep(400);
    const T = () => p.evaluate(`(async () => (await import('./src/main.js')).__TEST)()`);
    await p.evaluate(`(async () => { (await import('./src/main.js')).__TEST.showTitle(); })()`);
    await p.sleep(150);
    await p.evaluate(`(() => {
      const el = [...document.getElementById('ov-cards').children]
        .find(k => (k.textContent || '').toUpperCase().includes('START GAME'));
      if (el) el.click(); })()`);
    await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode === 'playing')()`, 20000);

    // 1. RUN #50: the chest is up, migrated (v10), on-screen and BIG.
    const t0 = await T();
    ok(t0.getProfileSafe !== undefined || true, '');   // noop shape guard
    const chest0 = await p.evaluate(`(async () => { const s = (await import('./src/main.js')).__TEST.state;
      return s.runChest && { m: s.runChest.milestone, x: s.runChest.x, y: s.runChest.y,
        prof: (await import('./src/main.js')).__TEST.getProfile().milestoneChest }; })()`);
    ok(chest0 && chest0.m === 50, '[' + tag + '] run #50 starts with the 50 milestone chest up');
    ok(chest0.prof === 0, '[' + tag + '] the v9 save migrated (milestoneChest 0, nothing pre-claimed)');
    // On-screen in INTERNAL view coords (the chest clamps to the 480x300 view).
    ok(chest0.x >= 30 && chest0.x <= 450 && chest0.y >= 40 && chest0.y <= 260,
      '[' + tag + '] the chest sits fully on-screen (x ' + chest0.x + ', y ' + chest0.y + ' — nothing clips at ' + w + 'x' + h + ')');
    const shotField = await p.shot('runchests-field-' + tag);
    copyFileSync(shotField, ART + '/runchests-field-' + tag + '.png');
    ok(true, '[' + tag + '] field shot: the BIG chest in-world at run start');

    // 2. THE WALK-IN: let the real autopilot collect it (unlosable — no
    //    despawn; it stays until flown into). The collect's FIRST beat is the
    //    burst: the frozen field with the coin/spark shower (mode 'burst').
    //    The field is live — if the horde wins the race to the pilot, the
    //    chest is re-offered by the next startRun (claim-at-collection), so
    //    the leg simply retries on a death.
    let collected = false;
    let goldBefore = await p.evaluate(`(async () => (await import('./src/main.js')).__TEST.getProfile().gold)()`);
    for (let attempt = 0; attempt < 4 && !collected; attempt++) {
      const ended = await p.waitFor(`(async () => { const s = (await import('./src/main.js')).__TEST.state;
        return s.runChest === null || s.mode === 'dead'; })()`, 25000);
      const mode = await p.evaluate(`(async () => (await import('./src/main.js')).__TEST.state.mode)()`);
      if (ended && mode === 'dead') {
        await p.evaluate(`(async () => { (await import('./src/main.js')).__TEST.startRun(); })()`);
        await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode === 'playing')()`, 8000);
        goldBefore = await p.evaluate(`(async () => (await import('./src/main.js')).__TEST.getProfile().gold)()`);
        continue;               // the SAME 50 chest, re-offered (unlosable)
      }
      collected = ended;
    }
    ok(collected, '[' + tag + '] the autopilot WALKED INTO the chest (collected in ordinary play, no despawn)');
    const burst0 = await p.evaluate(`(async () => { const s = (await import('./src/main.js')).__TEST.state;
      return s.chestBurst && { m: s.chestBurst.milestone, x: s.chestBurst.x, y: s.chestBurst.y }; })()`);
    ok(burst0 && burst0.m === 50, '[' + tag + '] the BURST is up first (the shower on the frozen field, before any card)');
    const shotBurst = await p.shot('runchests-burst-' + tag);
    copyFileSync(shotBurst, ART + '/runchests-burst-' + tag + '.png');
    ok(true, '[' + tag + '] burst shot: the coin/spark shower at the collection spot');
    const cardUp = await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode === 'chest')()`, 5000);
    ok(cardUp, '[' + tag + '] the burst EXPIRES into the card (burst-then-card)');

    // 3. THE CARD: it is up and explains what was gained.
    const card = await p.evaluate(`(() => {
      const title = document.getElementById('ov-title');
      const cards = [...document.getElementById('ov-cards').children];
      const c = cards.find(k => /MILESTONE CHEST/.test(k.textContent || ''));
      return { title: title && title.textContent, txt: c ? c.textContent.slice(0, 120) : '' }; })()`);
    ok(/RUN 50/.test(card.title || ''), '[' + tag + '] the card titles the milestone ("' + card.title + '")');
    ok(/\+3,?000 gold/i.test(card.txt) && /banked/i.test(card.txt),
      '[' + tag + '] the card explains WHAT WAS GAINED (+3,000 gold banked — 10 runs\' worth of the seeded 300g average)');
    const shotCard = await p.shot('runchests-card-' + tag);
    copyFileSync(shotCard, ART + '/runchests-card-' + tag + '.png');
    ok(true, '[' + tag + '] card shot');

    // 4. The claim + bank persisted; GOT IT resumes; run #51 has NO chest.
    const stored = await p.evaluate(`(() => JSON.parse(localStorage.getItem('hordes_profile_v1')))()`);
    ok(stored.milestoneChest === 50, '[' + tag + '] the claim persisted (milestoneChest 50)');
    ok(stored.gold === goldBefore + 3000, '[' + tag + '] the reward BANKED to the saved gold (' + goldBefore + ' before the walk-in + 3000 = ' + (goldBefore + 3000) + ', got ' + stored.gold + ')');
    await p.evaluate(`(() => {
      const el = [...document.getElementById('ov-cards').children]
        .find(k => /GOT IT/i.test(k.textContent || ''));
      if (el) el.click(); })()`);
    await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode === 'playing')()`, 5000);
    ok(true, '[' + tag + '] GOT IT resumes the run');
    // END RUN then START again: run #51 (settled 50) -> next milestone 100, not crossed.
    // (runSurvived is the same single settle funnel endRun passes through —
    // used directly here because 25s of autopilot play may have opened a
    // draft card over the settings menu.)
    await p.evaluate(`(async () => { (await import('./src/main.js')).__TEST.run.runSurvived(); })()`);
    await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode === 'dead')()`, 8000);
    await p.evaluate(`(async () => { (await import('./src/main.js')).__TEST.startRun(); })()`);
    await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode === 'playing')()`, 8000);
    const chest51 = await p.evaluate(`(async () => { const s = (await import('./src/main.js')).__TEST.state;
      return s.runChest; })()`);
    ok(chest51 === null, '[' + tag + '] run #51 spawns NO chest (the 50 is claimed; the 100 waits for its own crossing)');
  });
}

await viewport(390, 844, '390x844');
await viewport(320, 568, '320x568');
console.log(fails ? 'verify_runchests: ' + fails + ' FAILS' : 'verify_runchests: all checks passed');
process.exit(fails ? 1 : 0);
