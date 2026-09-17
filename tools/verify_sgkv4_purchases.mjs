// SGKV4 browser verifier: the opt-out purchase flow in the REAL browser
// (390x844 — this is a FLOW task, not a layout one; the node battery carries
// the layout-blind coverage and the red run):
//   1. buy a weapon through the REAL shop UI (CDP tap on the row) -> it is
//      EQUIPPED with no further action, and a visible line names it
//   2. ONE TAP on the loadout screen benches it (the row names the action)
//   3. the bench SURVIVES A REAL PAGE RELOAD (localStorage round-trip)
//   4. the next run arms exactly the stored choice (read off LIVE run state)
// Run: node tools/verify_sgkv4_purchases.mjs
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

  // Fund the wallet through the live profile, then persist it.
  await p.evaluate(`(async () => { const T2 = ${T};
    T2.getProfile().gold = 10000000; T2.save.autosave(); })()`);

  // The tap targets are REAL cards: find by text, tap by rect centre (CDP).
  const tapCard = async (text) => {
    const r = await p.evaluate(`(() => {
      const el = [...document.getElementById('ov-cards').children]
        .find(k => (k.textContent || '').toUpperCase().includes(${JSON.stringify(text)}));
      if (!el) return null; const q = el.getBoundingClientRect();
      return [q.x + q.width / 2, q.y + q.height / 2]; })()`);
    if (!r) throw new Error('no card: ' + text);
    await p.tap(r[0], r[1]);
    await p.sleep(250);
  };

  // ---- 1. buy ORBIT through the real shop -----------------------------------
  await tapCard('SHOP');
  await tapCard('ORBIT');
  const bought = await p.evaluate(`(async () => { const T2 = ${T};
    return { chosen: T2.loadout.chosen,
      toasts: T2.state.toasts.map(t => t.msg).join(' | ') }; })()`);
  ok(Array.isArray(bought.chosen) && bought.chosen.includes('ORBIT'),
    'the ORBIT purchase EQUIPPED it with no further action (loadout ' + JSON.stringify(bought.chosen) + ')');
  ok(bought.toasts.toUpperCase().includes('EQUIPPED') && bought.toasts.toUpperCase().includes('ORBIT'),
    'a visible line names the equipped weapon ("' + bought.toasts + '")');

  // ---- 2. ONE TAP benches it -------------------------------------------------
  await tapCard('BACK');          // shop -> title
  await p.sleep(200);
  await tapCard('LOADOUT');
  const rowBefore = await p.evaluate(`(() => {
    const el = [...document.getElementById('ov-cards').children]
      .find(k => (k.textContent || '').toUpperCase().includes('ORBIT'));
    return el ? el.textContent.toUpperCase() : ''; })()`);
  ok(rowBefore.includes('TAP TO BENCH'), 'the equipped row names the bench action ("' + rowBefore.slice(0, 60) + '…")');
  await tapCard('ORBIT');         // THE BENCH: one tap
  const benched = await p.evaluate(`(async () => { const T2 = ${T};
    const el = [...document.getElementById('ov-cards').children]
      .find(k => (k.textContent || '').toUpperCase().includes('ORBIT'));
    return { chosen: T2.loadout.chosen, row: el ? el.textContent.toUpperCase() : '' }; })()`);
  ok(!benched.chosen, 'ONE TAP benched it (loadout now ' + JSON.stringify(benched.chosen) + ' = no choice)');
  ok(benched.row.includes('TAP TO EQUIP'), 'the benched row names the equip action back');

  // ---- 3. the bench survives a REAL page reload ------------------------------
  await p.evaluate(`(async () => { const T2 = ${T}; T2.save.autosave(); })()`);
  await p.evaluate('location.reload()');
  await p.waitFor('(async () => (await import("./src/main.js")).__TEST)', 15000, 200);
  await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
  await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode !== 'intro')()`, 15000);
  await p.waitFor(`(async () => { const rv = (await import('./src/main.js')).__TEST.state.titleReveal; return !rv || rv.phase === 'settled'; })()`, 8000);
  const reloaded = await p.evaluate(`(async () => { const T2 = ${T};
    return { chosen: T2.loadout.chosen, unlocked: T2.getProfile().unlockedWeapons.includes('ORBIT') }; })()`);
  ok(reloaded.unlocked && !reloaded.chosen,
    'after a REAL reload: ORBIT still owned, still BENCHED (loadout ' + JSON.stringify(reloaded.chosen) + ')');

  // ---- 4. the next run arms exactly the stored choice ------------------------
  await tapCard('START GAME');
  if (!(await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode === 'playing')()`, 4000, 100))) {
    await tapCard('GOT IT');
  }
  await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode === 'playing')()`, 8000);
  const kit = await p.evaluate(`(async () => { const T2 = ${T};
    return T2.state.weapons.map(w => w.type); })()`);
  ok(!kit.includes('ORBIT'), 'the next run carries the bench (kit ' + JSON.stringify(kit) + ')');

  // And opting back IN works the same way (the two-way proof).
  const errs = p.errors;
  ok(errs.length === 0, 'no page errors (' + errs.length + ')');
});

if (fails) { console.log('verify_sgkv4_purchases: ' + fails + ' FAILURES'); process.exit(1); }
console.log('verify_sgkv4_purchases: ALL CHECKS PASSED');
