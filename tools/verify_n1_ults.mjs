// HORDES - tools/verify_n1_ults.mjs (N1 slice 3 acceptance bar item 3).
// REAL browser, PHONE viewport 390x844 @dpr3, real finger taps. Proves the
// three non-Witch ults end to end, one run per class:
//   1. the run boots through the game's OWN meta/import seam and a REAL tap
//      on START GAME; the sim clock is ASSERTED past 1.0s before anything is
//      measured (the tick-38 lesson: the shared browser.mjs startup sets only
//      7 of the 19 TOUR_KEYS and the frame loop gates on !coachActive(), so a
//      run reached that way is FROZEN - all 19 are set below).
//   2. #q-skill reads the ult's short LABEL (EARTH / AFTER / ALTAR) and the
//      label bbox stays INSIDE the fixed 96x64 H1 touch button (the H1
//      no-reflow contract - a 2-line label is a FAIL).
//   3. the tc-q badge reads the LIVE charge state: charging (n/KILLS) at run
//      start, RDY after the charge is banked through the PUBLISHED kills
//      field, and a cooling countdown (12.0s / 10.0s / 15.0s) after a REAL
//      tap on the Q button fires the ult through the real seam.
//   4. the cast is NON-mana in the live game: the pool never drops across the
//      tap (MANUAL pilot for the tap window, so only regen can move it).
//   5. the effect is REAL in state.effects: a nova at RADIUS 240
//      (EARTHSHATTER), rewrite_boom phantoms (AFTERIMAGE), or a 6s nova at
//      RADIUS 140 plus the live p.consecField (CONSECRATION).
//   6. one PNG per class, 1170x2532 (= 390x844 @3x), with the ink-bbox check
//      on the #q-skill label.
// EVIDENCE DISCLOSURE: no vision model is reachable from this host, so the
// verdict is DOM text + live-state measurement + PNG dimensions/ink, not a
// "looks right" judgement. Stated, not hidden.
// Run: node tools/verify_n1_ults.mjs
import { withPage } from './browser.mjs';
import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ART = 'docs/art/browser-verify-2026-09-12';
mkdirSync(ART, { recursive: true });
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); };

// All 19 TOUR_KEYS (src/tour.js:29-49) - the shared harness sets only 7.
const TOUR19 = ['stage1', 'hud', 'pilot', 'focus', 'stance', 'move', 'skills', 'potions',
  'stats', 'cog', 'draft', 'edge', 'chest', 'portal', 'arch', 'shrine',
  'intermission', 'death', 'settings'];

// Count ink pixels inside a viewport-space box of a captured PNG.
async function inkInBox(p, file, box) {
  const b64 = (await import('node:fs')).readFileSync(file).toString('base64');
  return p.evaluate(`(async () => {
    const img = await createImageBitmap(await (await fetch('data:image/png;base64,${b64}')).blob());
    const c = new OffscreenCanvas(img.width, img.height); const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const sx = img.width / innerWidth, sy = img.height / innerHeight;
    const x = Math.round(${box[0]} * sx), y = Math.round(${box[1]} * sy);
    const w = Math.round(${box[2]} * sx), h = Math.round(${box[3]} * sy);
    const d = g.getImageData(x, y, w, h).data;
    let ink = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (Math.max(d[i], d[i + 1], d[i + 2]) > 110) ink++;
    }
    return { imgW: img.width, imgH: img.height, ink };
  })()`, true);
}

async function bootRun(p, charId) {
  // Seed a purse through the game's OWN import seam, then equip the class.
  await p.evaluate(`(async () => {
    const m = await import('./src/meta.js');
    const T = (await import('./src/main.js')).__TEST;
    const prof = m.makeProfile();
    prof.gold = 20000;
    m.unlockCharacter(prof, ${JSON.stringify(charId)});
    const ok = m.equipCharacter(prof, ${JSON.stringify(charId)});
    T.save.importText(JSON.stringify(m.exportProfile(prof)));
    window.__seeded = ok;
  })()`);
  const seeded = await p.evaluate('window.__seeded');
  // REAL TAP: title -> START GAME.
  const c = await p.evaluate(`(() => {
    const el = [...document.getElementById('ov-cards').children]
      .find(k => (k.textContent || '').toUpperCase().includes('START GAME'));
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
  })()`);
  if (!c) throw new Error('no START GAME card on the title');
  await p.tap(c[0], c[1]);
  const playing = await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.mode === 'playing')()", 8000);
  // the sim must actually ADVANCE: the tour coachmarks gate update(), so a
  // live clock past 1.0s is the proof the harness is looking at a running
  // game, not a frozen one.
  const advancing = await p.waitFor("(async () => { const st = (await import('./src/main.js')).__TEST.state; return st.mode === 'playing' && st.time > 1.0; })()", 10000, 200);
  return { seeded, playing, advancing };
}

const CLASSES = [
  // charId, ultId, LABEL, KILLS, effect probe (evaluated, returns true when
  // the ult's draw/live effect is present)
  ['KNIGHT', 'EARTHSHATTER', 'EARTH', 40,
    "T.state.effects.some(e => e.kind === 'nova' && e.radius === 240) && T.state.player.fortify > 0"],
  ['ROGUE', 'AFTERIMAGE', 'AFTER', 30,
    "T.state.effects.some(e => e.kind === 'rewrite_boom' && e.radius === 70) || (T.state.player.afterimageTicks || 0) > 0"],
  ['PALADIN', 'CONSECRATION', 'ALTAR', 40,
    "!!T.state.player.consecField && T.state.effects.some(e => e.kind === 'nova' && e.radius === 140)"],
];

const out = await withPage({ w: 390, h: 844, dpr: 3,
  startupScript: "try { localStorage.setItem('hordes_onboarded', '1'); } catch (e) {}" + "\n" +
    'for (const k of ' + JSON.stringify(TOUR19) + ") { try { localStorage.setItem('hordes_tour_' + k, '1'); } catch (e) {} }" },
  async (p) => {
    const report = {};
    let first = true;
    for (const [charId, ultId, label, kills, probe] of CLASSES) {
      if (!first) { // same browser, fresh boot: profile swap
        await p.evaluate('location.reload()');
        await p.waitFor("!!document.getElementById('ov-cards')", 15000);
        await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
      }
      first = false;
      await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.mode !== 'intro')()", 15000);
      await p.waitFor("(async () => { const rv = (await import('./src/main.js')).__TEST.state.titleReveal; return !rv || rv.phase === 'settled'; })()", 8000);
      const boot = await bootRun(p, charId);
      check(charId + ': run started and the sim clock ADVANCED past 1.0s (not a frozen game)',
        boot.seeded && boot.playing && boot.advancing, boot);

      // MANUAL pilot for the measurement window: the AUTO cast/drink hands
      // stay out of the mana and badge reads (the pilot's own auto-cast of
      // the ult is covered headless in test_ults.mjs).
      await p.evaluate("(async () => { (await import('./src/main.js')).__TEST.setPilotMode('MANUAL'); })()");

      // ---- the label, and the H1 fit contract -------------------------------
      const lbl = await p.evaluate(`(() => {
        const e = document.getElementById('q-skill');
        const b = document.querySelector('#touch button[data-act="q"]');
        const r = e.getBoundingClientRect(), br = b.getBoundingClientRect();
        return { text: e.textContent,
          box: [Math.round(r.x) - 2, Math.round(r.y) - 2, Math.round(r.width) + 4, Math.round(r.height) + 4],
          rect: { x: r.x, y: r.y, right: r.right, bottom: r.bottom, w: r.width, h: r.height },
          btn: { x: br.x, y: br.y, right: br.right, bottom: br.bottom, w: br.width, h: br.height } };
      })()`);
      check(charId + ': #q-skill reads ' + label, lbl.text === label, lbl.text);
      const inside = lbl.rect.x >= lbl.btn.x - 1 && lbl.rect.right <= lbl.btn.right + 1 &&
        lbl.rect.y >= lbl.btn.y - 1 && lbl.rect.bottom <= lbl.btn.bottom + 1;
      check(charId + ': the label stays INSIDE the fixed 96x64 button (H1 no-reflow)',
        inside && lbl.rect.h <= 20, { rect: lbl.rect, btn: lbl.btn });

      // ---- the LIVE badge: charging -> RDY -> cooling -----------------------
      const badge0 = await p.evaluate("(() => document.getElementById('tc-q').textContent)()");
      check(charId + ': the tc-q badge shows CHARGING at run start',
        new RegExp('^\\d+/' + kills + '$').test(badge0), badge0);
      // Bank the charge through the PUBLISHED kills field, read RDY live.
      await p.evaluate(`(async () => { (await import('./src/main.js')).__TEST.state.player.kills = ${kills}; })()`);
      const badgeRdy = await p.waitFor(`(async () => {
        (await import('./src/main.js')).__TEST.state.player.kills = ${kills};
        const t = document.getElementById('tc-q').textContent;
        return t === 'RDY' ? t : false;
      })()`, 8000, 150);
      check(charId + ': the tc-q badge shows RDY at full charge', !!badgeRdy, badge0 + ' -> RDY');

      // ---- a REAL tap on the Q button fires the ult --------------------------
      const manaBefore = await p.evaluate("(async () => (await import('./src/main.js')).__TEST.state.player.mana)()");
      const qBtn = await p.evaluate(`(() => {
        const b = document.querySelector('#touch button[data-act="q"]');
        const r = b.getBoundingClientRect();
        return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
      })()`);
      await p.tap(qBtn[0], qBtn[1]);
      const fired = await p.waitFor(`(async () => {
        const T = (await import('./src/main.js')).__TEST;
        return (T.state.player.skillCd.${ultId} || 0) > 0;
      })()`, 5000, 100);
      check(charId + ': a REAL Q tap fired ' + ultId + ' (the cooldown armed)', !!fired, fired);
      const manaAfter = await p.evaluate("(async () => (await import('./src/main.js')).__TEST.state.player.mana)()");
      check(charId + ': the cast spent NO mana (pool never drops across the tap)',
        manaAfter >= manaBefore - 0.01, { manaBefore, manaAfter });
      const badgeCd = await p.evaluate("(() => document.getElementById('tc-q').textContent)()");
      check(charId + ': the tc-q badge shows the COOLING countdown after the cast',
        /^\d+\.\ds$/.test(badgeCd), badgeCd);

      // ---- the effect is REAL in the live loop -------------------------------
      const effectSeen = await p.waitFor(`(async () => {
        const T = (await import('./src/main.js')).__TEST;
        return (${probe}) || false;
      })()`, 10000, 150);
      check(charId + ': the ult effect is present in the LIVE loop', !!effectSeen, probe);

      // ---- the artifact -------------------------------------------------------
      await p.evaluate("(async () => { for (let i = 0; i < 6; i++) await new Promise(r => requestAnimationFrame(r)); })()");
      const shotFile = await p.shot('n1-ult-' + charId.toLowerCase());
      const dst = join(ART, 'n1-ult-' + charId.toLowerCase() + '-phone.png');
      copyFileSync(shotFile, dst);
      const box = await p.evaluate("(() => { const e = document.getElementById('q-skill'); const r = e.getBoundingClientRect(); return [Math.round(r.x) - 2, Math.round(r.y) - 2, Math.round(r.width) + 4, Math.round(r.height) + 4]; })()");
      const ink = await inkInBox(p, dst, box);
      report[charId] = { boot, lbl, badge0, badgeRdy, badgeCd, manaBefore, manaAfter, png: dst, ink };
      check(charId + ': PNG is 1170x2532', ink.imgW === 1170 && ink.imgH === 2532, [ink.imgW, ink.imgH]);
      check(charId + ': the #q-skill label bbox holds real ink in the PNG', ink.ink > 8, ink);
    }
    if (p.errors.length) console.log('PAGE ERRORS: ' + JSON.stringify(p.errors));
    return report;
  });

for (const r of results) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name} :: ${JSON.stringify(r.detail)}`);
const bad = results.filter((r) => !r.ok).length;
console.log(`verify_n1_ults: ${results.length - bad}/${results.length} checks passed`);
process.exit(bad ? 1 : 0);
