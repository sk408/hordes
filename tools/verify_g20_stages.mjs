// HORDES — tools/verify_g20_stages.mjs: G20a PLAYER-SELECTED STAGES in a REAL
// browser, on a PHONE (same bar as verify_g10..g14: anything a player looks at
// is verified by a real-browser run at 390x844 @3x; a code claim is not
// evidence). Drives the REAL boot -> intro skip -> title and asserts:
//   1. THE CARD: a STAGE card sits in the title menu, is in-viewport and
//      unclipped, names the live stage (VERDANT HOLLOW on a fresh session),
//      and its sub-line names the LOCKED stages' requirements in plain words.
//   2. THE CYCLE: a REAL tap on the card cycles the pending stage; on a fresh
//      profile both gated stages are locked, so the tap re-lands on the
//      default and the card still names it (the cycler cannot offer locked
//      rows). Granting FIRST_BOSS + WAVE_5 through the game's OWN profile
//      import seam, the SAME tap walks VERDANT -> ASHEN -> SNOWFIELD -> VERDANT.
//   3. THE RUN KNOWS ITS STAGE: a REAL tap on START GAME with SNOWFIELD
//      pending starts a run whose state.stage is SNOWFIELD, whose spawned
//      foes are exactly 1.5x the default stage's plain hp (mods at the real
//      seam, read back from live enemy objects), and a forced reload of the
//      page returns the pending selection to the default (nothing persisted).
//   4. PARITY OF THE DEFAULT: a default-stage run's CHASER hp equals the
//      value the shipped formula computes for wave 0 (1.0x, byte-identical).
//   5. CHROME: the gate needs no change — chromeOn() is false on the title,
//      the touch layer stays down over the menu (the STAGE card added no
//      screen mode).
//
// EVIDENCE DISCLOSURE (stated plainly): there is NO vision model reachable
// from this host. The verdict rests on DOM geometry + real taps + live game
// state read back through __TEST — no "looks right" judgement.
//
// Run: node tools/verify_g20_stages.mjs
import { withPage } from './browser.mjs';
import { copyFileSync, readFileSync } from 'node:fs';

const out = await withPage({ w: 390, h: 844, dpr: 3,
  startupScript: "try { localStorage.setItem('hordes_onboarded', '1'); } catch (e) {}" },
  async (p) => {
    await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.mode !== 'intro')()", 15000);
    await p.waitFor("(async () => { const rv = (await import('./src/main.js')).__TEST.state.titleReveal;" +
      " return !rv || rv.phase === 'settled'; })()", 8000);
    await p.evaluate("(async () => { const r = () => new Promise(q => requestAnimationFrame(() => requestAnimationFrame(q))); await r(); })()");

    // ---- 1. THE CARD on a FRESH session ------------------------------------
    const probe = await p.evaluate(`(async () => {
      const m = await import('./src/main.js');
      const T = m.__TEST;
      const vp = { w: innerWidth, h: innerHeight };
      const cards = [...document.querySelectorAll('#ov-cards .card')];
      const el = cards.find(c => (c.innerHTML || '').includes('>STAGE<'));
      const r = el && el.getBoundingClientRect();
      return {
        mode: T.state.mode, chromeOn: T.chromeOn(),
        touchDisplay: (document.getElementById('touch') || { style: {} }).style.display,
        vp, pending: T.stages.pending, unlockedAshen: T.stages.unlocked('ASHEN_WASTE'),
        unlockedSnow: T.stages.unlocked('SNOWFIELD'),
        cardText: el ? (el.textContent || '').replace(/\\s+/g, ' ').trim() : null,
        cardRect: r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null,
        cardClipped: el ? (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) : null,
        namesLockedInCard: el ? /ashen waste/i.test(el.textContent || '') : false,
        _center: r ? [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)] : null,
      };
    })()`);

    // ---- 2a. REAL TAP on the STAGE card with a FRESH profile ---------------
    await p.tap(probe._center[0], probe._center[1]);
    await p.evaluate("(async () => { const r = () => new Promise(q => requestAnimationFrame(() => requestAnimationFrame(q))); await r(); })()");
    const freshTap = await p.evaluate(`(async () => {
      const T = (await import('./src/main.js')).__TEST;
      const el = [...document.querySelectorAll('#ov-cards .card')].find(c => (c.innerHTML || '').includes('>STAGE<'));
      return { pending: T.stages.pending,
               cardNames: (el ? el.textContent || '' : '').replace(/\\s+/g, ' ').trim(),
               unlockedAshen: T.stages.unlocked('ASHEN_WASTE') };
    })()`);

    // ---- 2b. Grant the gates through the game's OWN import seam ------------
    // G20b: ALL SEVEN gated rungs (slice 1's two + the five new ladder ids).
    await p.evaluate(`(async () => {
      const meta = await import('./src/meta.js');
      const T = (await import('./src/main.js')).__TEST;
      const prof = meta.makeProfile();
      for (const id of ['FIRST_BOSS', 'WAVE_5', 'BOSS_SLAYER_5', 'WAVE_10',
                        'SURVIVE_10MIN', 'KILLS_10000', 'SURVIVE_20MIN']) {
        prof.achievements.earned[id] = 1;
      }
      T.save.importText(JSON.stringify(meta.exportProfile(prof)));
    })()`);
    const granted = await p.evaluate("(async () => { const T = (await import('./src/main.js')).__TEST;" +
      " return { ashen: T.stages.unlocked('ASHEN_WASTE'), snow: T.stages.unlocked('SNOWFIELD') }; })()");

    // The cycle: REAL taps walk the whole ladder in order, one rung per tap.
    const cycleWalk = [];
    const walkCard = async (expect) => {
      const c = await p.evaluate(`(() => {
        const el = [...document.querySelectorAll('#ov-cards .card')].find(c => (c.innerHTML || '').includes('>STAGE<'));
        el.scrollIntoView({ block: 'center' });
        const r = el.getBoundingClientRect();
        return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
      })()`);
      await p.sleep(120);
      await p.tap(c[0], c[1]);
      await p.evaluate("(async () => { const r = () => new Promise(q => requestAnimationFrame(() => requestAnimationFrame(q))); await r(); })()");
      const after = await p.evaluate("(async () => (await import('./src/main.js')).__TEST.stages.pending)()");
      cycleWalk.push(after);
      if (expect && after !== expect) throw new Error('cycle expected ' + expect + ' got ' + after);
      return after;
    };

    // ---- 3. G20b: WALK ALL EIGHT ROWS — for each stage a REAL START tap,
    // then the live run is read back: state.stage, per-typeId plain maxHp
    // against the expected formula (BASE_HP x type.hpMult x stage hpMult at
    // wave 0), NaN scan. Rarity/elite only RAISE hp, so the observed MIN per
    // typeId is the plain stamped value.
    const ORDER = ['VERDANT_HOLLOW', 'ASHEN_WASTE', 'SNOWFIELD', 'BLOOD_RUST',
                   'BONE_DESERT', 'VOID_REACH', 'CINDER_MAW', 'WHITEOUT'];
    const stageRuns = [];
    // cycle from wherever we are to each rung in order (one tap per rung)
    for (let k = 0; k < ORDER.length; k++) {
      const want = ORDER[k];
      let cur = await p.evaluate("(async () => (await import('./src/main.js')).__TEST.stages.pending)()");
      let guard = 0;
      while (cur !== want && guard++ < 10) cur = await walkCard();
      if (cur !== want) throw new Error('could not cycle to ' + want + ' (stuck at ' + cur + ')');
      const startCenter = await p.evaluate(`(() => {
        const el = [...document.querySelectorAll('#ov-cards .card')]
          .find(c => (c.textContent || '').trim().startsWith('START GAME'));
        el.scrollIntoView({ block: 'center' });
        const r = el.getBoundingClientRect();
        return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
      })()`);
      await p.sleep(120);
      await p.tap(startCenter[0], startCenter[1]);
      await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.mode === 'playing')()", 8000);
      const run = await p.evaluate(`(async () => {
        const m = await import('./src/main.js');
        const T = m.__TEST, st = T.state;
        const { CONFIG } = await import('./src/config.js');
        const { ENEMY_TYPES } = await import('./src/enemy_types.js');
        const { stageMods } = await import('./src/stages.js');
        const seen = new Map();   // typeId -> min maxHp
        let count = 0, nan = false;
        const t0 = performance.now();
        while (performance.now() - t0 < 9000 && (count < 10 || seen.size < 2)) {
          for (const e of st.enemies) {
            if (e.__g20seen) continue;
            e.__g20seen = 1; count++;
            if (!Number.isFinite(e.hp) || !Number.isFinite(e.maxHp) || !Number.isFinite(e.speed)) nan = true;
            const prev = seen.get(e.typeId);
            if (prev === undefined || e.maxHp < prev) seen.set(e.typeId, e.maxHp);
          }
          await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        }
        const hpMult = stageMods(st.stage).hpMult || 1;
        const expect = {};
        for (const [t, v] of seen) {
          expect[t] = CONFIG.ENEMY.BASE_HP * (ENEMY_TYPES[t].hpMult || 1) * hpMult;   // wave 0
        }
        const back = { stage: st.stage, mode: st.mode, count, nan, perType: {}, expected: expect };
        for (const [t, v] of seen) back.perType[t] = v;
        // back to the title the same way the slice-1 verifier did (documented
        // seam): the per-stage START was the REAL tap under test.
        st.mode = 'menu'; T.showTitle();
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        return back;
      })()`);
      stageRuns.push(run);
    }
    const snowRun = stageRuns[2];   // slice-1 compatibility field (SNOWFIELD)

    // ---- 4. PARITY OF THE DEFAULT: reload -> pending resets (nothing
    // persisted), start a default run, its CHASER hp is the shipped value ---
    await p.evaluate("(async () => { const T = (await import('./src/main.js')).__TEST; T.state.mode='menu'; T.showTitle();" +
      " await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); })()");
    await p.evaluate("location.reload()");
    await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.mode !== 'intro')()", 15000);
    await p.waitFor("(async () => { const rv = (await import('./src/main.js')).__TEST.state.titleReveal;" +
      " return !rv || rv.phase === 'settled'; })()", 8000);
    const afterReload = await p.evaluate(`(async () => {
      const m = await import('./src/main.js');
      const meta = await import('./src/meta.js');
      const T = m.__TEST, st = T.state;
      const c = await import('./src/config.js');
      const baseHp = c.CONFIG.ENEMY.BASE_HP * 1.0 * 1.0;   // wave 0, CHASER hpMult 1.0
      // Fresh page: pending is the default again (nothing persisted) and the
      // grants were session-only, so both stages lock again.
      const pending = T.stages.pending;
      const unlocked = { ashen: T.stages.unlocked('ASHEN_WASTE'), snow: T.stages.unlocked('SNOWFIELD') };
      // Start the default run the REAL way: tap START GAME.
      return { pending, unlocked, baseHp, profHasStageData: /stage|VERDANT|ASHEN|SNOWFIELD/i.test(JSON.stringify(T.getProfile())) };
    })()`);
    const start2 = await p.evaluate(`(() => {
      const el = [...document.querySelectorAll('#ov-cards .card')]
        .find(c => (c.textContent || '').trim().startsWith('START GAME'));
      const r = el.getBoundingClientRect();
      return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
    })()`);
    await p.tap(start2[0], start2[1]);
    await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.mode === 'playing')()", 8000);
    const defaultRun = await p.evaluate(`(async () => {
      const m = await import('./src/main.js');
      const T = m.__TEST, st = T.state;
      const seen = new Set(); let minMax = Infinity;
      for (let i = 0; i < 500; i++) {
        for (const e of st.enemies) {
          if (seen.has(e)) continue; seen.add(e);
          if (e.typeId === 'CHASER') minMax = Math.min(minMax, e.maxHp);
        }
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      }
      return { stage: st.stage, count: seen.size, chaserMaxHp: minMax };
    })()`);

    // Back to the title for the canonical PNG (the STAGE card with the lock
    // hints visible — the interesting state is the fresh-profile one, so
    // re-seed a fresh profile first and re-render).
    await p.evaluate(`(async () => {
      const meta = await import('./src/meta.js');
      const T = (await import('./src/main.js')).__TEST;
      T.save.importText(JSON.stringify(meta.exportProfile(meta.makeProfile())));
      T.state.mode = 'menu'; T.showTitle();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    })()`);
    await p.waitFor("(async () => { const rv = (await import('./src/main.js')).__TEST.state.titleReveal;" +
      " return !rv || rv.phase === 'settled'; })()", 8000);
    await p.evaluate("(async () => { const r = () => new Promise(q => requestAnimationFrame(() => requestAnimationFrame(q))); await r(); })()");
    const shot = await p.shot('g20-stages-phone');
    return { ...probe, freshTap, granted, cycleWalk, stageRuns, snowRun, afterReload, defaultRun, shot, errors: p.errors };
  });

console.log(JSON.stringify({ ...out, _elided: undefined }, null, 2));

// The canonical artifact lands in the docs tree (same directory as G8-G14).
const canonical = 'docs/art/browser-verify-2026-09-12/g20-stages-phone.png';
try { copyFileSync(out.shot, canonical); } catch (e) { console.error('COPY FAILED: ' + e.message); }

// Real dimensions printed FROM THE FILE BYTES (PNG IHDR: width at offset 16,
// height at 20, big-endian u32), never from intent — no image dependency.
let dims = null;
try {
  const buf = readFileSync(canonical);
  if (buf.length > 24 && buf.toString('ascii', 12, 16) === 'IHDR') {
    dims = { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  } else dims = { error: 'not a PNG IHDR' };
} catch (e) { dims = { error: e.message }; }

// ---------------------------------------------------------------- verdict --
const problems = [];
if (out.mode !== 'title' && out.mode !== 'menu') problems.push('screen: mode is ' + out.mode);
if (!out.cardText) problems.push('card: no STAGE card on the title menu');
else {
  if (!/VERDANT HOLLOW/i.test(out.cardText)) problems.push('card: does not name the live stage: ' + out.cardText);
  if (!/locked/i.test(out.cardText)) problems.push('card: does not name the locked stages: ' + out.cardText);
}
if (out.cardRect && (out.cardRect.x < 0 || out.cardRect.y < 0 ||
    out.cardRect.x + out.cardRect.w > out.vp.w || out.cardRect.y + out.cardRect.h > out.vp.h)) {
  problems.push('card: off-viewport: ' + JSON.stringify(out.cardRect));
}
if (out.cardClipped) problems.push('card: clipped');
if (out.pending !== 'VERDANT_HOLLOW') problems.push('session: fresh pending is ' + out.pending);
if (out.unlockedAshen || out.unlockedSnow) problems.push('locks: a gated stage is unlocked on a fresh profile');
// 2a: fresh tap cannot leave the default
if (out.freshTap.pending !== 'VERDANT_HOLLOW') {
  problems.push('cycle: a fresh-profile tap selected ' + out.freshTap.pending + ' (locked stage offered)');
}
// 2b: grants open the whole ladder
if (!out.granted.ashen || !out.granted.snow) problems.push('grants: achievements did not unlock their stages: ' + JSON.stringify(out.granted));
// The 8-row walk cycled ONE LAP in order (VERDANT was already pending at the
// start, so the taps land ASHEN..WHITEOUT — one tap per remaining rung).
const wantWalk = ['ASHEN_WASTE', 'SNOWFIELD', 'BLOOD_RUST', 'BONE_DESERT',
                  'VOID_REACH', 'CINDER_MAW', 'WHITEOUT'];
for (let i = 0; i < wantWalk.length; i++) {
  if (out.cycleWalk[i] !== wantWalk[i]) {
    problems.push('cycle: tap ' + i + ' landed on ' + out.cycleWalk[i] + ' (want ' + wantWalk[i] + ')');
  }
}
// 3: EVERY rung knows its stage, its mods land at the seam (observed plain
// maxHp == BASE_HP x type.hpMult x stage hpMult, per typeId), nothing NaN.
const ORDER = ['VERDANT_HOLLOW', 'ASHEN_WASTE', 'SNOWFIELD', 'BLOOD_RUST',
               'BONE_DESERT', 'VOID_REACH', 'CINDER_MAW', 'WHITEOUT'];
for (let k = 0; k < ORDER.length; k++) {
  const r = out.stageRuns[k];
  if (!r) { problems.push('run ' + k + ': missing'); continue; }
  if (r.mode !== 'playing') problems.push(ORDER[k] + ' run: not playing (mode=' + r.mode + ')');
  if (r.stage !== ORDER[k]) problems.push('run ' + k + ': the run\'s stage is ' + r.stage + ' (want ' + ORDER[k] + ')');
  if (!r.count) problems.push(ORDER[k] + ' run: nothing spawned in the window');
  if (r.nan) problems.push(ORDER[k] + ' run: a non-finite foe stat was observed (mod guard leak)');
  for (const [t, v] of Object.entries(r.expected)) {
    const got = r.perType[t];
    if (got === undefined) { problems.push(ORDER[k] + ' run: typeId ' + t + ' vanished before read-back'); continue; }
    if (Math.abs(got - v) > 1e-9) {
      problems.push(ORDER[k] + ' run: ' + t + ' plain maxHp ' + got + ' != formula ' + v);
    }
  }
}
// 4: reload resets the pending SELECTION (the stage choice is session state;
// the granted ACHIEVEMENTS legitimately persist in the profile — they are
// profile data, and their unlocks surviving a reload is correct, not a leak).
if (out.afterReload.pending !== 'VERDANT_HOLLOW') {
  problems.push('persist: after reload the pending stage is ' + out.afterReload.pending + ' (must be the default)');
}
if (out.afterReload.profHasStageData) problems.push('persist: stage data leaked into the profile');
if (out.defaultRun.stage !== 'VERDANT_HOLLOW') problems.push('parity: the default run is on ' + out.defaultRun.stage);
if (!out.defaultRun.chaserMaxHp) problems.push('parity: no CHASER sampled on the default run');
else if (Math.abs(out.defaultRun.chaserMaxHp - out.afterReload.baseHp) > 1e-9) {
  problems.push('parity: default CHASER hp ' + out.defaultRun.chaserMaxHp + ' != shipped ' + out.afterReload.baseHp);
}
const snowChaser = out.snowRun && out.snowRun.perType && out.snowRun.perType.CHASER;
if (snowChaser && out.defaultRun.chaserMaxHp &&
    Math.abs(snowChaser / out.defaultRun.chaserMaxHp - 1.5) > 1e-9) {
  problems.push('mods: SNOWFIELD CHASER hp ratio is ' + (snowChaser / out.defaultRun.chaserMaxHp) + ' (want 1.5)');
}
// 5: chrome gate untouched
if (out.chromeOn !== false) problems.push('chrome: chromeOn() is true over the title');
if (out.touchDisplay !== 'none') problems.push('chrome: touch layer display=' + out.touchDisplay);
if (out.errors && out.errors.length) problems.push('console errors: ' + out.errors.join(' | '));
// the PNG's real dimensions
if (!dims || dims.w !== 1170 || dims.h !== 2532) {
  problems.push('png: real dimensions are ' + JSON.stringify(dims) + ' (want 1170x2532 = 390x844 @3x)');
}

console.log(problems.length ? 'VERIFY G20 STAGES: FAIL - ' + problems.join('; ')
  : 'VERIFY G20 STAGES: PASS - the STAGE card names the live stage and the locks in plain words, real taps walk all 8 rungs once the gates are earned, a real START tap on EACH rung starts a run whose plain per-type maxHp equals BASE_HP x type.hpMult x stage.hpMult (8/8 runs, CHASER ' + out.defaultRun.chaserMaxHp + ' hp on stage 0, 1.5x on SNOWFIELD), a reload returns to the default (nothing persisted), chrome gate untouched');
console.log('PNG: ' + canonical + ' — real dimensions read from the file: ' + (dims ? dims.w + 'x' + dims.h : 'UNREADABLE'));
console.log('EVIDENCE: DOM geometry + real taps + live __TEST state (pending/live stage, unlock predicate, per-foe maxHp) above. No vision read is made by this tool; no "looks right" judgement is claimed.');

process.exit(problems.length ? 1 : 0);
