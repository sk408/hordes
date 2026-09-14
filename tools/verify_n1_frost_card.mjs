// HORDES - tools/verify_n1_frost_card.mjs (N1 slice 2 acceptance bar item 3).
// REAL browser, PHONE viewport 390x844 @dpr3, real finger taps. Proves the
// draftable FROST_NOVA card ("Pocket Frost") end to end on a WITCH run (her
// Q is CHAIN_REACTION, so the card is offerable):
//   1. a real level-up opens the draft; the LIVE pool's ov-cards DOM is
//      scanned until the Frost Nova card appears (weighted draw: it is one
//      0.04-weight card among many, so drafts are cycled through the REAL
//      level-up seam - xp set to xpNext, the frame's own while-loop calls
//      levelUp() - never a DOM hack). Non-frost picks prefer pool-shrinking
//      cards (SKILL / RUN RULE / NEW WEAPON) so the search converges.
//   2. the card is taken with a REAL tap: the run-local flag reads true and
//      the NEXT draft's pool no longer contains it (taken-once contract).
//   3. #q-skill still reads CHAIN - the card did not hijack the Q readout.
//   4. the nova FIRES in the live loop: effect frames with kind 'nova' are
//      counted over a real window with the sim clock advance asserted.
//   5. the PNG is 1170x2532 (= 390x844 @3x) and the label bbox holds ink.
// CRITICAL (tick-38 lesson, restated in the brief): the shared browser.mjs
// startup script sets only 7 of the 19 TOUR_KEYS (src/tour.js:29-49) and
// frame() gates the sim on !coachActive() - all 19 keys are set here and
// state.time > 1.0 is ASSERTED before anything is measured.
// EVIDENCE DISCLOSURE: no vision model is reachable from this host, so the
// verdict is DOM text + flag + live-loop measurement + PNG dimensions/ink,
// not a "looks right" judgement. Stated, not hidden.
// Run: node tools/verify_n1_frost_card.mjs
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

// Count dark (ink) pixels inside a viewport-space box of a captured PNG.
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

const out = await withPage({ w: 390, h: 844, dpr: 3,
  startupScript: "try { localStorage.setItem('hordes_onboarded', '1'); } catch (e) {}" + "\n" +
    'for (const k of ' + JSON.stringify(TOUR19) + ") { try { localStorage.setItem('hordes_tour_' + k, '1'); } catch (e) {} }" },
  async (p) => {
    const report = {};
    await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.mode !== 'intro')()", 15000);
    await p.waitFor("(async () => { const rv = (await import('./src/main.js')).__TEST.state.titleReveal; return !rv || rv.phase === 'settled'; })()", 8000);

    // Seed a purse through the game's OWN import seam, equip the WITCH.
    await p.evaluate(`(async () => {
      const m = await import('./src/meta.js');
      const T = (await import('./src/main.js')).__TEST;
      const prof = m.makeProfile();
      prof.gold = 20000;
      m.unlockCharacter(prof, 'WITCH');
      const ok = m.equipCharacter(prof, 'WITCH');
      T.save.importText(JSON.stringify(m.exportProfile(prof)));
      window.__seeded = ok;
    })()`);
    report.seeded = await p.evaluate('window.__seeded');

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
    report.playing = await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.mode === 'playing')()", 8000);
    // The sim must actually ADVANCE before ANYTHING is measured: the tour
    // coachmarks gate update(), so a live clock past 1.0s is the proof the
    // harness is looking at a running game, not a frozen one.
    report.advancing = await p.waitFor("(async () => { const st = (await import('./src/main.js')).__TEST.state; return st.mode === 'playing' && st.time > 1.0; })()", 10000, 200);
    check('WITCH: run started and the sim clock ADVANCED past 1.0s (not a frozen game)',
      report.seeded && report.playing && report.advancing, report);

    // ---- find the card: real level-ups, real drafts, real taps -------------
    // One level-up through the frame's OWN gem-pickup seam: a gem planted at
    // the player's feet is collected by the live loop, and ITS xp check calls
    // levelUp() -> openDraft(). Never a direct openDraft() call, never an xp
    // write (the while-loop only runs on pickup).
    const forceDraft = async () => {
      await p.evaluate("(async () => { const T = (await import('./src/main.js')).__TEST; const st = T.state; if (st.mode === 'playing') st.gems.push({ x: st.player.x, y: st.player.y, xp: st.player.xpNext }); })()");
      return p.waitFor("(async () => ['draft', 'evolve'].includes((await import('./src/main.js')).__TEST.state.mode))()", 20000, 150);
    };
    const scanPool = () => p.evaluate(`(() => {
      const kids = [...document.getElementById('ov-cards').children];
      return kids.map((k, i) => {
        const r = k.getBoundingClientRect();
        return { i, text: (k.textContent || '').slice(0, 90),
          cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2) };
      });
    })()`);

    let draftsSeen = 0, frostHit = null;
    const CAP = 250;
    while (!frostHit && draftsSeen < CAP) {
      const opened = await forceDraft();
      if (!opened) break;
      const cards = await scanPool();
      if (!cards.length) break;
      draftsSeen++;
      frostHit = cards.find(k => /frost nova/i.test(k.text));
      if (frostHit) break;
      // Not this draft: take a REAL tap on a pool-shrinking card when one is
      // offered (perk / rule / weapon grant leave the pool once taken), else
      // the first card.
      const shrink = cards.find(k => /SKILL -|RUN RULE|NEW WEAPON/i.test(k.text)) || cards[0];
      await p.tap(shrink.cx, shrink.cy);
      await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.mode === 'playing')()", 8000);
    }
    report.draftsSeen = draftsSeen;
    check('WITCH: the FROST card is present in the LIVE draft pool DOM', !!frostHit,
      { draftsSeen, frostHit: frostHit && frostHit.text });

    // ---- take it with a REAL tap -------------------------------------------
    if (frostHit) {
      await p.tap(frostHit.cx, frostHit.cy);
      await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.mode === 'playing')()", 8000);
      const held = await p.evaluate("(async () => { const T = (await import('./src/main.js')).__TEST; return !!(T.state.player.skills && T.state.player.skills.frost); })()");
      check('WITCH: the card was TAKEN by the real tap (run-local flag set)', held === true, { held });

      // taken-once: the NEXT draft's pool must not contain it.
      await forceDraft();
      const next = await scanPool();
      const stillThere = next.some(k => /frost nova/i.test(k.text));
      check('WITCH: the card is GONE from the next pool (taken once)', !stillThere, { nextPool: next.map(k => k.text) });
      // close that draft on whatever it offers, back to playing
      if (next.length) {
        await p.tap(next[0].cx, next[0].cy);
        await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.mode === 'playing')()", 8000);
      }
    }

    // ---- the Q readout is not hijacked --------------------------------------
    const lbl = await p.evaluate("(() => { const e = document.getElementById('q-skill'); const r = e.getBoundingClientRect(); return { text: e ? e.textContent : null, box: [Math.round(r.x) - 2, Math.round(r.y) - 2, Math.round(r.width) + 4, Math.round(r.height) + 4] }; })()");
    check('WITCH: #q-skill still reads CHAIN (the card did not touch the Q readout)', lbl.text === 'CHAIN', lbl.text);

    // ---- the nova FIRES in the live loop ------------------------------------
    // The headless phone at dpr3 renders ~1 sim-second per ~3 wall-seconds
    // (measured 4.7 sim-s in a 15s wall window on this host), so the window
    // is 40s wall to clear the >8 sim-seconds advance bar.
    const live = await p.evaluate(`(async () => {
      const T = (await import('./src/main.js')).__TEST;
      let novaFrames = 0, maxNova = 0; const t0sim = T.state.time;
      const t0 = performance.now();
      while (performance.now() - t0 < 40000) {
        const novas = T.state.effects.filter(e => e.kind === 'nova');
        if (novas.length) { novaFrames++; if (novas.length > maxNova) maxNova = novas.length; }
        await new Promise(r => requestAnimationFrame(r));
      }
      return { novaFrames, maxNova, simAdvanced: +(T.state.time - t0sim).toFixed(2),
        mana: Math.round(T.state.player.mana), cd: +(T.state.player.skillCd.FROST_NOVA || 0).toFixed(2) };
    })()`, true);
    report.live = live;
    check('WITCH: the nova FIRES in the live loop (>=1 frame with a nova effect)', live && live.novaFrames >= 1, live);
    check('WITCH: the live sim advanced during the window (not a frozen frame)', live && live.simAdvanced > 8, live);

    // HARDENING (tick 40, test-only, NO assertion changed): `#touch` is
    // display:none whenever chromeOn() is false (src/main.js:5077 — a draft is
    // NOT playing/finale), so a capture taken while a draft overlay happens to
    // be open reads a 0x0 label rect and 0 ink in the PNG. Measured once in the
    // two runs of tick 40 ([ -2,-2,4,4 ], ink 0) while check 5 (the DOM text
    // CHAIN) passed in the same run, i.e. a capture-timing artifact, not a
    // product fault. Dismiss any open overlay and capture ONLY from a live
    // 'playing' frame, so the ink check measures the HUD it names.
    for (let guard = 0; guard < 40; guard++) {
      const m = await p.evaluate("(async () => (await import('./src/main.js')).__TEST.state.mode)()");
      if (m === 'playing') break;
      const open = await scanPool().catch(() => []);
      if (open.length) await p.tap(open[0].cx, open[0].cy);
      else await p.evaluate("(async () => { const T = (await import('./src/main.js')).__TEST; const st = T.state; if (st.mode === 'playing') return; st.gems.push({ x: st.player.x, y: st.player.y, xp: st.player.xpNext }); })()");
      await new Promise((r) => setTimeout(r, 150));
    }
    const preShot = await p.evaluate("(async () => (await import('./src/main.js')).__TEST.state.mode)()");
    check('WITCH: the capture happens from a live playing frame (HUD visible)', preShot === 'playing', preShot);
    // ---- the artifact --------------------------------------------------------
    await p.evaluate("(async () => { for (let i = 0; i < 6; i++) await new Promise(r => requestAnimationFrame(r)); })()");
    const shotFile = await p.shot('n1-frost-card-witch');
    const dst = join(ART, 'n1-frost-card-phone.png');
    copyFileSync(shotFile, dst);
    // Re-read the label box AT capture time (the earlier read can be stale).
    const box = await p.evaluate("(() => { const e = document.getElementById('q-skill'); const r = e.getBoundingClientRect(); return [Math.round(r.x) - 2, Math.round(r.y) - 2, Math.round(r.width) + 4, Math.round(r.height) + 4]; })()");
    report.lblBox = box;
    const ink = await inkInBox(p, dst, box);
    report.png = { dst, ink };
    check('PNG is 1170x2532', ink.imgW === 1170 && ink.imgH === 2532, [ink.imgW, ink.imgH]);
    check('the #q-skill label bbox holds real ink in the PNG', ink.ink > 8, ink);
    if (p.errors.length) console.log('PAGE ERRORS: ' + JSON.stringify(p.errors));
    return report;
  });

for (const r of results) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name} :: ${JSON.stringify(r.detail)}`);
console.log(JSON.stringify(out, null, 1));
const bad = results.filter((r) => !r.ok).length;
console.log(`verify_n1_frost_card: ${results.length - bad}/${results.length} checks passed`);
process.exit(bad ? 1 : 0);
