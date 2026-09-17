// RSS8 browser verifier: the Magnet Collector sweep in the REAL browser
// (390x844 phone — the touch MAG button is the mobile-first surface). The
// node battery (test/test_rss8_magnet.mjs) pins the contract headlessly;
// this file proves it survives the real DOM + real input routing:
//   1. granting the card REVEALS the touch MAG button (hidden without it)
//   2. a real tap on MAG fires the sweep: every seeded drop type flies in
//      and is credited through the normal pickup loop, and a MAGNET SWEEP
//      line with the per-type total DISPLAYS
//   3. the badge counts down from 30 and SPAM TAPS are refused mid-cooldown
//   4. the 'x' KEY fires it too (input parity)
//   5. the AUTO-PILOT fires it on the floor-value policy (>= 25 outstanding)
// Run: node tools/verify_rss8_magnet.mjs
import { withPage } from '/home/claude/projects/hordes/tools/browser.mjs';

let fails = 0;
function ok(cond, label) {
  console.log((cond ? '  ok - ' : '  FAIL - ') + label);
  if (!cond) fails++;
}

await withPage({ w: 390, h: 844, dpr: 3, mobile: true }, async (p) => {
  const T = `(await import('./src/main.js')).__TEST`;
  await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
  await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode !== 'intro')()`, 15000);
  await p.waitFor(`(async () => { const rv = (await import('./src/main.js')).__TEST.state.titleReveal; return !rv || rv.phase === 'settled'; })()`, 8000);
  // Coach suppression + a fast path into the run (same flags as the node
  // battery: onboarded + every tour stage seen, so nothing pauses the sim).
  await p.evaluate(`(async () => {
    localStorage.setItem('hordes_onboarded', '1');
    for (const k of Object.values((await import('./src/tour.js')).TOUR_KEYS))
      localStorage.setItem(k, '1'); })()`);
  // START GAME (onboarded: no reference gate) -> the art hold -> the live run.
  const startRect = await p.evaluate(`(() => {
    const el = [...document.getElementById('ov-cards').children]
      .find(k => (k.textContent || '').toUpperCase().includes('START GAME'));
    if (!el) return null;
    const q = el.getBoundingClientRect(); return [q.x + q.width / 2, q.y + q.height / 2]; })()`);
  await p.tap(startRect[0], startRect[1]);
  await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode === 'playing')()`, 15000, 200);
  await p.evaluate(`(async () => { const t = ${T}; t.state.player.stats.maxHp *= 50; t.state.player.hp = t.state.player.stats.maxHp; })()`);

  // Quiet the field, then seed every drop type FAR outside the pickup radius.
  const seed = async () => p.evaluate(`(async () => { const t = ${T}; const st = t.state;
    st.enemies.length = 0; st.gems.length = 0; st.drops.length = 0; st.itemDrops.length = 0;
    const p2 = st.player;
    for (let i = 0; i < 6; i++) t.m3.pushGem({ x: p2.x - 160 - i * 3, y: p2.y - 90 - i * 3, xp: 1 });
    for (let i = 0; i < 2; i++) t.m3.pushDrop({ x: p2.x + 150 + i * 3, y: p2.y - 100, kind: 'mp', count: 1 });
    t.m3.pushDrop({ x: p2.x + 140, y: p2.y + 90, kind: 'hp' });
    t.m3.pushItemDrop({ x: p2.x - 140, y: p2.y + 90, age: 0, item:
      { id: 'v_probe', name: 'Probe Charm', rarity: 'RARE', affixes: [] } });
    return { gems: st.gems.length, drops: st.drops.length, items: st.itemDrops.length }; })()`);

  const read = () => p.evaluate(`(async () => { const t = ${T}; const st = t.state; return {
    gems: st.gems.length, drops: st.drops.length, items: st.itemDrops.length,
    xp: st.player.xp, hpPot: st.player.potions.hp, mpPot: st.player.potions.mp,
    cd: st.player.skillCd.MAGNET_PULL || 0,
    sweep: st.player.magnetSweep || 0,
    toasts: (st.toasts || []).map(x => x.msg).join(' | ') }; })()`);

  // ---- 1. the card REVEALS the touch MAG button --------------------------------
  const hidden0 = await p.evaluate(`document.getElementById('tc-magnet').hidden`);
  ok(hidden0 === true, 'without the card the MAG button stays hidden');
  await p.evaluate(`(async () => { const t = ${T}; t.state.player.skills.magnet = true; })()`);
  await p.sleep(150);   // one touch-HUD sync frame
  const hidden1 = await p.evaluate(`document.getElementById('tc-magnet').hidden`);
  ok(hidden1 === false, 'holding the card REVEALS the MAG button');

  // ---- 2. a real tap fires the sweep + DISPLAYS the total ----------------------
  const seeded = await seed();
  ok(seeded.gems === 6 && seeded.drops === 3 && seeded.items === 1,
    'field seeded far from the pilot (' + JSON.stringify(seeded) + ')');
  const before = await read();
  const mag = await p.rectOf('#tc-magnet');
  await p.tap(mag[0], mag[1]);
  // The pull runs 0.45s; the completion toast fires at sweep end.
  await p.sleep(1600);
  const after = await read();
  ok(after.gems === 0 && after.drops === 0 && after.items === 0,
    'the sweep collected EVERY drop type (' + JSON.stringify(after) + ')');
  ok(after.xp > before.xp, 'gems credited XP through the pickup loop (' + before.xp + ' -> ' + after.xp + ')');
  ok(after.hpPot > before.hpPot && after.mpPot > before.mpPot,
    'both potion kinds credited through the potion path (hp ' + before.hpPot + '->' + after.hpPot +
    ', mp ' + before.mpPot + '->' + after.mpPot + ')');
  ok(/MAGNET SWEEP: .*GEM/i.test(after.toasts) && /POTION/i.test(after.toasts) && /ITEM/i.test(after.toasts),
    'a MAGNET SWEEP line DISPLAYS the per-type total ("' + after.toasts + '")');
  await p.shot('rss8-magnet-sweep');

  // ---- 3. 30s badge + spam refusal ---------------------------------------------
  await p.sleep(300);
  const badge1 = await p.evaluate(`document.getElementById('tc-mag').textContent`);
  const badgeSec = parseFloat(badge1);
  ok(Number.isFinite(badgeSec) && badgeSec > 20 && badgeSec <= 30,
    'the badge counts down from 30 ("' + badge1 + '")');
  await seed();
  const midSpam = await read();
  for (let i = 0; i < 4; i++) { await p.tap(mag[0], mag[1]); await p.sleep(120); }
  const postSpam = await read();
  ok(postSpam.gems === 6 && postSpam.cd > 25,
    'spam taps are REFUSED mid-cooldown (floor kept, cd ' + postSpam.cd.toFixed(1) + ')');
  ok(midSpam.cd > 25, 'cooldown armed at ~30 (' + midSpam.cd.toFixed(1) + ')');

  // ---- 4. 'x' key parity -------------------------------------------------------
  // (Cooldown shortcut: the node battery pins the FULL 30s value; here it is
  // advanced to 2s so the verifier stays fast — the key act is the subject.)
  await p.evaluate(`(async () => { const t = ${T}; t.state.player.skillCd.MAGNET_PULL = 2;
    t.state.player.potions.mp = 0;   // headroom so the seeded mp drops can credit
    t.state.player.potions.hp = 0; })()`);
  await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.player.skillCd.MAGNET_PULL <= 0)()`, 6000, 100);
  await seed();
  await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }))");
  await p.sleep(1600);
  const keyed = await read();
  ok(keyed.gems === 0 && keyed.drops === 0 && keyed.items === 0,
    "the 'x' KEY fires the sweep too (" + JSON.stringify({ g: keyed.gems, d: keyed.drops, i: keyed.items }) + ')');

  // ---- 5. AUTO-PILOT policy (>= 25 outstanding) --------------------------------
  await p.evaluate(`(async () => { const t = ${T}; t.state.player.skillCd.MAGNET_PULL = 0;
    for (let i = 0; i < 30; i++) t.m3.pushGem({ x: t.state.player.x - 100 - (i % 5) * 8, y: t.state.player.y - 80 - Math.floor(i / 5) * 8, xp: 1 }); })()`);
  await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.player.magnetSweep > 0)()`, 8000, 100);
  const auto = await read();
  ok(auto.sweep > 0, 'the AUTO-PILOT fires the sweep on the floor-value policy');

  ok(p.errors.length === 0, 'no page errors (' + p.errors.length + ')');
});

if (fails) { console.log('verify_rss8_magnet: ' + fails + ' FAILURES'); process.exit(1); }
console.log('verify_rss8_magnet: ALL CHECKS PASSED');
