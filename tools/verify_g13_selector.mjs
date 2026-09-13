// HORDES — tools/verify_g13_selector.mjs: G13 ANIMATED CHARACTER SELECTOR in a
// REAL browser, on a PHONE (same bar as verify_g10/g11/g12: anything a player
// looks at is verified by a real-browser run at 390x844 @3x; a code claim is
// not evidence). Drives the REAL boot -> intro skip -> title -> CHARACTERS and
// asserts:
//   1. THE SCREEN: mode 'characters', 4 pilot entries + the kit panel + BACK,
//      every card unclipped; chrome is OFF by name (__TEST.chromeOn() false,
//      the touch layer display none) — the mode is registered in the gate.
//   2. THE PORTRAITS ARE PAINTED: each pilot's live 32x32 canvas holds real
//      non-transparent pixels (getImageData); the OWNED pilot shows multiple
//      colours, the UNOWNED pilots show the one-tone silhouette palette.
//   3. THE KIT EQUALS THE RUN: the panel's data-kit numbers equal what the
//      SAME chain the run applies (makePlayer base -> applyMetaBonuses ->
//      applyCharacter, with the LIVE profile) computes in-page.
//   4. REAL TAPS: a real tap on an unowned+affordable pilot unlocks AND equips
//      it with gold dropping by exactly the price; a real tap on another owned
//      pilot re-equips it (equippedCharacter changes back).
//   5. 60Hz == 120Hz: the idle driver stepped at 1/60 x120 and 1/120 x240 (in
//      one atomic evaluate, resets between) advances the SAME frame index at
//      every checkpoint; and the LIVE loop advances the frame on wall-clock.
//   6. NO LEAK: after ESC back to the title the painted portraits freeze (the
//      pixel hash is stable past a frame boundary).
//
// EVIDENCE DISCLOSURE (stated plainly): there is NO vision model reachable
// from this host. The verdict rests on DOM geometry + canvas getImageData +
// real taps + readShot samples — no "looks right" judgement.
//
// Run: node tools/verify_g13_selector.mjs
import { withPage } from './browser.mjs';
import { copyFileSync } from 'node:fs';

const out = await withPage({ w: 390, h: 844, dpr: 3,
  startupScript: "try { localStorage.setItem('hordes_onboarded', '1'); } catch (e) {}" },
  async (p) => {
    await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.mode !== 'intro')()", 15000);
    await p.waitFor("(async () => { const rv = (await import('./src/main.js')).__TEST.state.titleReveal;" +
      " return !rv || rv.phase === 'settled'; })()", 8000);
    // Seed a purse through the game's OWN import seam: 10000 gold, fresh
    // profile (Knight owned/equipped, the other three locked).
    await p.evaluate(`(async () => {
      const m = await import('./src/meta.js');
      const prof = m.makeProfile();
      prof.gold = 10000;
      const T = (await import('./src/main.js')).__TEST;
      T.save.importText(JSON.stringify(m.exportProfile(prof)));
    })()`);

    // REAL TAP: title -> CHARACTERS.
    const charCenter = await p.evaluate(`(() => {
      const el = [...document.getElementById('ov-cards').children]
        .find(c => (c.innerHTML || '').includes('>CHARACTERS<'));
      const r = el.getBoundingClientRect();
      return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
    })()`);
    await p.tap(charCenter[0], charCenter[1]);
    await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.mode === 'characters')()", 5000);
    // Let a couple of real frames paint the portraits.
    await p.evaluate("(async () => { const r = () => new Promise(q => requestAnimationFrame(() => requestAnimationFrame(q))); await r(); })()");

    // ---- 1+2+3: screen, chrome, painted portraits, kit-vs-run -------------
    const probe = await p.evaluate(`(async () => {
      const m = await import('./src/main.js');
      const meta = await import('./src/meta.js');
      const ent = await import('./src/entities.js');
      const T = m.__TEST, prof = T.getProfile();
      const vp = { w: innerWidth, h: innerHeight };
      const cards = [...document.querySelectorAll('#ov-cards .card')];
      const pilots = cards.filter(c => c.hasAttribute && c.hasAttribute('data-pilot'));
      const rect = (el) => { const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
      // Unclipped = the card's own content fits its box; the overlay scrolls,
      // so below-the-fold cards are REACHABLE (we scrollIntoView before taps).
      const clipped = (el) => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1;
      // Portrait pixels: count non-transparent + distinct colours.
      const portrait = (id) => {
        const card = pilots.find(c => c.getAttribute('data-pilot') === id);
        if (!card) return { present: false };
        const cv = card.querySelector('canvas');
        const g = cv.getContext('2d');
        const d = g.getImageData(0, 0, cv.width, cv.height).data;
        let painted = 0; const cols = new Set();
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] > 0) { painted++; cols.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]); }
        }
        return { present: true, painted, colours: cols.size, rect: rect(card),
                 clipped: clipped(card), canvasCss: cv.getBoundingClientRect().width };
      };
      // Kit equality: recompute through the SAME chain the run applies.
      const base = ent.makePlayer().stats;
      const expected = {};
      for (const id of Object.keys(meta.CHARACTERS)) {
        const ch = meta.CHARACTERS[id];
        const st = meta.applyCharacter(meta.applyMetaBonuses({ ...base }, prof.purchased), id);
        expected[id] = {
          maxHp: st.maxHp, maxMana: st.maxMana,
          speedMult: +(st.speed / base.speed).toFixed(2),
          spellCostMult: st.manaCostMult || 1,
          potions: ch.startPotions + (prof.purchased.potions || 0),
        };
      }
      const kitEl = document.getElementById('char-kit');
      const shown = kitEl ? JSON.parse(kitEl.getAttribute('data-kit')) : null;
      return {
        mode: T.state.mode, vp, chromeOn: T.chromeOn(),
        touchDisplay: (document.getElementById('touch') || { style: {} }).style.display,
        pilotCount: pilots.length, expected, shown,
        selected: T.charSelect.selected,
        portraits: { KNIGHT: portrait('KNIGHT'), WITCH: portrait('WITCH'),
                     ROGUE: portrait('ROGUE'), PALADIN: portrait('PALADIN') },
        kitRect: kitEl ? rect(kitEl) : null, kitClipped: kitEl ? clipped(kitEl) : null,
        hasBack: cards.some(c => /^>BACK<|^BACK$/.test((c.textContent || '').trim()) || (c.innerHTML || '').includes('>BACK<')),
        _centers: Object.fromEntries(['KNIGHT', 'WITCH'].map(id => {
          const card = pilots.find(c => c.getAttribute('data-pilot') === id);
          return [id, card ? rect(card) : null];
        })),
      };
    })()`);

    // ---- canonical PNG #1: the initial selector (Knight selected) ----------
    const shot1 = await p.shot('g13-selector-phone');

    // ---- 4a. REAL TAP on the unowned+affordable WITCH -> unlock AND equip --
    // (scrollIntoView first: the overlay scrolls, the card may sit below fold)
    await p.evaluate(`(() => {
      const card = [...document.querySelectorAll('#ov-cards .card')]
        .find(c => c.getAttribute && c.getAttribute('data-pilot') === 'WITCH');
      card.scrollIntoView({ block: 'center' });
    })()`);
    await p.sleep(150);
    const witchRect = probe._centers.WITCH;
    // re-read the post-scroll rect
    const witchCenterNow = await p.evaluate(`(() => {
      const card = [...document.querySelectorAll('#ov-cards .card')]
        .find(c => c.getAttribute && c.getAttribute('data-pilot') === 'WITCH');
      const r = card.getBoundingClientRect();
      return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
    })()`);
    const goldBefore = await p.evaluate("(async () => (await import('./src/main.js')).__TEST.getProfile().gold)()");
    await p.tap(witchCenterNow[0], witchCenterNow[1]);
    await p.waitFor("(async () => (await import('./src/main.js')).__TEST.getProfile().equippedCharacter === 'WITCH')()", 5000);
    const afterWitch = await p.evaluate(`(async () => {
      const m = await import('./src/main.js'); const T = m.__TEST; const prof = T.getProfile();
      const card = [...document.querySelectorAll('#ov-cards .card')]
        .find(c => c.getAttribute && c.getAttribute('data-pilot') === 'WITCH');
      const cv = card.querySelector('canvas');
      const g = cv.getContext('2d');
      const d = g.getImageData(0, 0, cv.width, cv.height).data;
      let painted = 0; const cols = new Set();
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] > 0) { painted++; cols.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]); }
      }
      return { gold: prof.gold, unlocked: prof.unlockedCharacters.includes('WITCH'),
               equipped: prof.equippedCharacter, selected: T.charSelect.selected,
               kitPilot: document.getElementById('char-kit').getAttribute('data-char-kit'),
               witchPortrait: { painted, colours: cols.size } };
    })()`);

    // ---- canonical PNG #2: the selector with the second pilot selected -----
    const shot2 = await p.shot('g13-selector-phone-alt');

    // ---- 4b. REAL TAP on the owned KNIGHT -> re-equip -----------------------
    const knightCenterNow = await p.evaluate(`(() => {
      const card = [...document.querySelectorAll('#ov-cards .card')]
        .find(c => c.getAttribute && c.getAttribute('data-pilot') === 'KNIGHT');
      card.scrollIntoView({ block: 'center' });
      const r = card.getBoundingClientRect();
      return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
    })()`);
    await p.sleep(150);
    await p.tap(knightCenterNow[0], knightCenterNow[1]);
    await p.waitFor("(async () => (await import('./src/main.js')).__TEST.getProfile().equippedCharacter === 'KNIGHT')()", 5000);
    const afterKnight = await p.evaluate(`(async () => {
      const T = (await import('./src/main.js')).__TEST; const prof = T.getProfile();
      return { equipped: prof.equippedCharacter, gold: prof.gold };
    })()`);

    // ---- 5. 60Hz == 120Hz parity + live advance ----------------------------
    // Checkpoints sit INSIDE idle frames, never on a period boundary: at an
    // exact tie (t = k * period) the two rates' float accumulations can differ
    // by one ULP and legitimately land on opposite sides — the parity claim is
    // about progression over equal sim time, not about tie-breaking at
    // measure-zero instants (disclosed in the report).
    const parity = await p.evaluate(`(async () => {
      const idle = (await import('./src/main.js')).__TEST.charSelect.idle;
      // Both replays run inside this ONE evaluate (atomic — the live rAF loop
      // cannot interleave), each from a reset.
      const run = (dt, steps, marks) => {
        idle.reset();
        const frames = [];
        for (let i = 1; i <= steps; i++) {
          idle.step(dt);
          if (marks.includes(i)) frames.push(idle.frame);
        }
        return frames;
      };
      // interior sample times: 0.9s 1.7s 2.9s 4.1s 5.3s 5.9s
      const times = [0.9, 1.7, 2.9, 4.1, 5.3, 5.9];
      const at60 = run(1 / 60, 360, times.map(t => Math.round(t * 60)));
      const at120 = run(1 / 120, 720, times.map(t => Math.round(t * 120)));
      // Live: poll the frame the loop's own wall-clock dt drives, and require
      // it to actually MOVE over ~1.6s (a whole-window sample can alias to the
      // same parity, so the SEQUENCE is the evidence, not the endpoints).
      const seen = new Set([idle.frame]);
      for (let i = 0; i < 16; i++) {
        await new Promise(r => setTimeout(r, 100));
        seen.add(idle.frame);
      }
      return { period: idle.period, at60, at120, liveFrames: [...seen] };
    })()`);

    // ---- 6. NO LEAK after ESC ------------------------------------------------
    const frozen = await p.evaluate(`(async () => {
      // Grab the canvas refs FIRST — they survive the card rebuild as detached
      // objects with their pixels intact, which is exactly what we hash.
      const card = [...document.querySelectorAll('#ov-cards .card')]
        .find(c => c.getAttribute && c.getAttribute('data-pilot') === 'KNIGHT');
      const cv = card && card.querySelector('canvas');
      const T = (await import('./src/main.js')).__TEST;
      const hash = () => { const d = cv.getContext('2d').getImageData(0, 0, 32, 32).data;
        let s = 0; for (let i = 0; i < d.length; i += 4) s = (s * 31 + d[i] + d[i + 1] * 7 + d[i + 2] * 13 + d[i + 3]) | 0;
        return s; };
      const h0 = cv ? hash() : null;
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await new Promise(r => setTimeout(r, 1400));            // past a frame boundary
      return { mode: T.state.mode, h0, h1: cv ? hash() : null };
    })()`);

    return { ...probe, goldBefore, afterWitch, afterKnight, parity, frozen,
             shots: [shot1, shot2], errors: p.errors };
  });

console.log(JSON.stringify(out, null, 2));

// The canonical artifacts land in the docs tree (same directory as G8-G12).
const dir = 'docs/art/browser-verify-2026-09-12/';
for (const [shot, name] of [[out.shots[0], 'g13-selector-phone.png'],
                            [out.shots[1], 'g13-selector-phone-alt.png']]) {
  try { copyFileSync(shot, dir + name); } catch (e) { console.error('COPY FAILED: ' + e.message); }
}

// ---------------------------------------------------------------- verdict --
const problems = [];
if (out.mode !== 'characters') problems.push('screen: mode is ' + out.mode);
if (out.pilotCount !== 4) problems.push('screen: ' + out.pilotCount + ' pilot entries (want 4)');
if (!out.hasBack) problems.push('screen: no BACK card');
if (out.chromeOn !== false) problems.push('chrome: chromeOn() is true over the selector');
if (out.touchDisplay !== 'none') problems.push('chrome: touch layer display=' + out.touchDisplay);
if (out.kitClipped) problems.push('screen: the kit panel is clipped');
// portraits painted
for (const [id, pr] of Object.entries(out.portraits)) {
  if (!pr.present) problems.push('portrait: ' + id + ' card missing');
  else {
    if (!pr.painted || pr.painted < 40) problems.push('portrait: ' + id + ' has ' + pr.painted + ' painted pixels (want >=40)');
    if (pr.clipped) problems.push('portrait: ' + id + ' card is clipped');
    if (pr.canvasCss !== 64) problems.push('portrait: ' + id + ' canvas CSS width is ' + pr.canvasCss + ' (want integer 2x = 64)');
  }
}
if (out.portraits.KNIGHT && out.portraits.KNIGHT.colours !== undefined) {
  if (out.portraits.KNIGHT.colours < 4) problems.push('portrait: owned KNIGHT shows ' + out.portraits.KNIGHT.colours + ' colours (want the full palette)');
  for (const id of ['WITCH', 'ROGUE', 'PALADIN']) {
    const c = out.portraits[id] && out.portraits[id].colours;
    if (c === undefined) continue;
    if (c > 4) problems.push('portrait: unowned ' + id + ' shows ' + c + ' colours (want the one-tone silhouette, <=4)');
  }
}
// kit == run
if (!out.shown) problems.push('kit: no kit panel');
else {
  const e = out.expected[out.shown.id];
  for (const k of ['maxHp', 'maxMana', 'speedMult', 'spellCostMult', 'potions']) {
    if (out.shown[k] !== e[k]) problems.push('kit: ' + k + ' shows ' + out.shown[k] + ', run computes ' + e[k]);
  }
  if (out.selected !== out.shown.id) problems.push('kit: panel shows ' + out.shown.id + ' but selection is ' + out.selected);
}
// taps
if (out.afterWitch.unlocked !== true || out.afterWitch.equipped !== 'WITCH') {
  problems.push('tap: the WITCH tap did not unlock+equip: ' + JSON.stringify(out.afterWitch));
}
if (out.goldBefore - out.afterWitch.gold !== 9000) {
  problems.push('tap: gold moved ' + out.goldBefore + ' -> ' + out.afterWitch.gold + ' (want exactly -9000)');
}
if (out.afterWitch.kitPilot !== 'WITCH') problems.push('tap: the kit panel still shows ' + out.afterWitch.kitPilot);
if (out.afterWitch.witchPortrait.painted < 40 || out.afterWitch.witchPortrait.colours < 4) {
  problems.push('tap: the newly-owned WITCH portrait is not repainted in colour: ' + JSON.stringify(out.afterWitch.witchPortrait));
}
if (out.afterKnight.equipped !== 'KNIGHT' || out.afterKnight.gold !== out.afterWitch.gold) {
  problems.push('tap: the KNIGHT re-equip tap failed: ' + JSON.stringify(out.afterKnight));
}
// parity
const P = out.parity;
if (!P.period || P.period <= 0) problems.push('parity: no idle period');
if (JSON.stringify(P.at60) !== JSON.stringify(P.at120)) {
  problems.push('parity: 60Hz ' + JSON.stringify(P.at60) + ' != 120Hz ' + JSON.stringify(P.at120));
}
if (!P.liveFrames || P.liveFrames.length < 2) problems.push('parity: the live loop did not advance the idle frame (' + JSON.stringify(P.liveFrames) + ')');
// no leak
if (out.frozen.mode !== 'title' && out.frozen.mode !== 'menu') {
  problems.push('leak: ESC did not return to the title (mode=' + out.frozen.mode + ')');
}
if (out.frozen.h1 !== undefined && out.frozen.h0 !== out.frozen.h1) {
  problems.push('leak: the portrait kept animating after ESC');
}
if (out.errors && out.errors.length) problems.push('console errors: ' + out.errors.join(' | '));

console.log(problems.length ? 'VERIFY G13 SELECTOR: FAIL - ' + problems.join('; ')
  : 'VERIFY G13 SELECTOR: PASS - 4 animated portraits pixel-proven (owned full-colour, locked silhouette), kit numbers equal the run chain, real taps unlock+equip (-9000 exactly) and re-equip, idle parity 60Hz==120Hz, chrome off, no leak after ESC');
console.log('PNG: ' + dir + 'g13-selector-phone.png + g13-selector-phone-alt.png');
console.log('EVIDENCE: DOM geometry + canvas getImageData + real taps + wall-clock frame advance above. No vision model is ' +
  'reachable from this host; no "looks right" judgement is claimed.');

process.exit(problems.length ? 1 : 0);
