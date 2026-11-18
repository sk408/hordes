#!/usr/bin/env node
// HORDES — real-Chrome check of the recorded music (2026-11-17, spec section 6).
// One headless Chrome at a time (tools/browser.mjs). For a phone (390x844) and
// a desktop window it checks, on the real page:
//   - nothing mp3 is fetched before the first frame, then the tracks load one
//     at a time (fetch wrapper + the resource timing log);
//   - with a shipped title track, the press that skips the intro starts it (no
//     second press); without one the title stays silent (the
//     fallback). With a title slot (the boss stand-in mapped to it through the
//     test seam) the first gesture starts the title bed: an AnalyserNode on the
//     master shows signal;
//   - a run plays its stage's recorded track, a forced boss switches to the boss
//     track within one beat, killing it goes back after the debounce;
//   - title -> run crossfades over 1 s; a death in a boss fight followed by
//     RETRY opens the new run with its run track (never the boss bed);
//   - MUSIC: CLASSIC SYNTH gives today's synth in the run and silence on the title;
//   - no console errors.
// Run: HORDES_CHROME="C:/Program Files/Google/Chrome/Application/chrome.exe" node tools/verify_music.mjs
import { withPage } from './browser.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WRAP = `(() => {
  const of = window.fetch.bind(window);
  const r = window.__mf = { log: [], inflight: 0, max: 0, firstFrameAt: null };
  window.fetch = function (u, o) {
    const url = String((u && u.url) || u);
    if (!/\\.mp3/.test(url)) return of(u, o);
    r.inflight++; r.max = Math.max(r.max, r.inflight);
    const e = { url: url.replace(/^.*\\//, ''), t0: performance.now() }; r.log.push(e);
    return of(u, o).then((x) => x.arrayBuffer().then((ab) => { e.t1 = performance.now(); r.inflight--;
      return new Response(ab, { status: x.status }); }), (err) => { r.inflight--; throw err; });
  };
  requestAnimationFrame(() => { r.firstFrameAt = performance.now(); });
})();`;

const PROBE = `(async () => {
  const A = await import('/src/audio.js');
  const m = await import('/src/main.js');
  window.A = A; window.T = m.__TEST;
  window.__level = () => {
    const s = A.AUDIO_TEST.state();
    if (!s.ctx) return null;
    if (!window.__an || window.__anCtx !== s.ctx) {
      window.__an = s.ctx.createAnalyser(); window.__an.fftSize = 4096; window.__anCtx = s.ctx;
      s.master.connect(window.__an);
    }
    const d = new Float32Array(window.__an.fftSize); window.__an.getFloatTimeDomainData(d);
    let q = 0; for (const v of d) q += v * v;
    return q > 0 ? 10 * Math.log10(q / d.length) : -200;
  };
  return true;
})()`;

async function check(opts, label) {
  const res = { label, checks: [] };
  const okc = (name, pass, info) => { res.checks.push({ name, pass: !!pass, info }); console.log((pass ? '  ok   ' : '  FAIL ') + label + ': ' + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); };
  await withPage({ ...opts, startupScript: WRAP, timeoutMs: 60000 }, async (page) => {
    await page.waitFor('document.readyState === "complete"', 15000);
    await page.evaluate(PROBE, true);
    const level = async (ms = 400) => { await sleep(ms); return page.evaluate('window.__level()'); };
    const mus = () => page.evaluate('(() => { const m = A.AUDIO_TEST.music(); return m && { cur: m.cur, buffers: m.buffers, scene: m.scene.scene, recBoss: m.recBoss, failed: m.failed }; })()');
    const st0 = await page.evaluate('A.AUDIO_TEST.state().ctx && A.AUDIO_TEST.state().ctx.state');
    okc('the AudioContext exists at load', !!st0, st0);
    // Shipped manifest: wait for the preloads, check the order and pacing.
    await page.waitFor('window.__mf.log.length >= 2 && window.__mf.inflight === 0', 20000);
    const mf = await page.evaluate('JSON.parse(JSON.stringify(window.__mf))');
    okc('no mp3 before the first frame', mf.firstFrameAt !== null && mf.log.every((e) => e.t0 >= mf.firstFrameAt), { firstFrameAt: Math.round(mf.firstFrameAt), first: Math.round(mf.log[0].t0) });
    okc('one fetch in flight at a time', mf.max === 1 && mf.log.every((e, i) => i === 0 || e.t0 >= mf.log[i - 1].t1), mf.log.map((e) => e.url + ' ' + Math.round(e.t0) + '-' + Math.round(e.t1)));
    const res0 = await page.evaluate("performance.getEntriesByType('resource').filter(e => /\\.mp3/.test(e.name)).map(e => [e.name.replace(/^.*\\//, ''), Math.round(e.startTime), Math.round(e.responseEnd)])");
    okc('network log: each track fetched once, lazily', res0.length === mf.log.length, res0);
    // Skip the intro (first gesture) -> the title. No title slot shipped: silence.
    await page.click(195, 400);
    await page.waitFor("T.state.mode !== 'intro'", 10000);
    await sleep(600);
    const hasTitle = await page.evaluate("(async () => !!(await import('/src/music_manifest.js')).MUSIC_TRACKS.title)()", true);
    if (hasTitle) {
      // The shipped title track: the press that skipped the intro IS the gesture, so the
      // title bed must sound without a second press (allow a fade-in: up to 5 s).
      const m1 = await mus();
      let lv1 = -200, waited = 0;
      while (waited < 5000) { lv1 = await level(500); waited += 500; if (lv1 > -80) break; }
      okc('the shipped title track plays once the intro is skipped (that press is the gesture)', m1 && m1.cur === 'title' && lv1 > -80,
        { cur: m1 && m1.cur, scene: m1 && m1.scene, levelDb: lv1, afterMs: 600 + waited, mode: await page.evaluate('T.state.mode'), ctx: await page.evaluate('A.AUDIO_TEST.state().ctx.state') });
    } else {
      const m1 = await mus();
      const lv1 = await level(800);
      okc('title with the shipped manifest (no title slot): silent fallback', m1 && m1.cur === null && (lv1 === null || lv1 < -90), { cur: m1 && m1.cur, scene: m1 && m1.scene, levelDb: lv1, mode: await page.evaluate('T.state.mode') });
      // A title slot (the boss stand-in) through the test seam: the title bed plays.
      await page.evaluate("(async () => { const man = await import('/src/music_manifest.js'); A.AUDIO_TEST.setDeps({ tracks: { ...man.MUSIC_TRACKS, title: { ...man.MUSIC_TRACKS.boss } } }); return true; })()", true);
      await page.click(20, 20);
      const titleOk = await page.waitFor("(() => { const m = A.AUDIO_TEST.music(); return m && m.cur === 'title'; })()", 15000);
      const lv2 = await level(1800);
      okc('a title slot: the title bed plays after the gesture (signal at master)', titleOk && lv2 > -80, { levelDb: lv2, ctx: await page.evaluate('A.AUDIO_TEST.state().ctx.state') });
    }
    // A run: its stage's track.
    await page.evaluate('T.startRun()');
    const runOk = await page.waitFor("(() => { const m = A.AUDIO_TEST.music(); return m && m.cur === 'run_wilds'; })()", 15000);
    const lv3 = await level(1500);
    okc('a run plays the stage track (VERDANT HOLLOW -> run_wilds)', runOk && lv3 > -80, { cur: (await mus()).cur, stage: await page.evaluate('T.state.stage'), levelDb: lv3 });
    const xf = await page.evaluate("(() => { const m = A.AUDIO_TEST.music(); const v = m.voices.find((x) => x.slot === 'run_wilds' && !x.dead); return v && { fade: +(v.env.t1 - v.env.t0).toFixed(3), from: v.env.from }; })()");
    okc('title -> run: a 1 s crossfade from the title (not a cut and a start from silence)', xf && Math.abs(xf.fade - 1) < 1e-3, xf);
    // Force a boss: the boss track within one beat (128 bpm: 0.469 s).
    const t0 = await page.evaluate('performance.now()');
    await page.evaluate('T.bossRules.spawnBoss()');
    await page.waitFor("(() => { const m = A.AUDIO_TEST.music(); return m && m.cur === 'boss'; })()", 5000, 20);
    const sw = await page.evaluate(`(() => { const m = A.AUDIO_TEST.music(); const v = m.voices.filter(x => x.slot === 'boss' && !x.dead).pop();
      const ctx = A.AUDIO_TEST.state().ctx; return { cur: m.cur, startsIn: v ? v.t0 - ctx.currentTime : null, wallMs: performance.now() - ${t0} }; })()`);
    okc('a forced boss: the boss track, starting within one beat', sw.cur === 'boss' && sw.startsIn !== null && sw.startsIn <= 0.469 + 0.05, sw);
    const lv4 = await level(1200);
    okc('the boss bed sounds', lv4 > -80, { levelDb: lv4 });
    // Kill it: back to the run track after the one-bar debounce (1.875 s).
    await page.evaluate('(() => { for (const e of T.state.enemies) if (e.boss || e.finalBoss) e.hp = 0; return true; })()');
    const tk = Date.now();
    const back = await page.waitFor("(() => { const m = A.AUDIO_TEST.music(); return m && m.cur === 'run_wilds'; })()", 8000, 50);
    okc('boss killed: back to the run track after the debounce', back, { afterMs: Date.now() - tk, cur: (await mus()).cur, mode: await page.evaluate('T.state.mode') });
    // A death in a boss fight, then RETRY: the new run opens with its run track.
    const god = () => page.evaluate('(() => { const p = T.state.player; if (p) { p.hp = 1e9; p.maxHp = 1e9; } return true; })()');
    await god();
    await page.evaluate('T.bossRules.spawnBoss()');
    await page.waitFor("(() => { const m = A.AUDIO_TEST.music(); return m && m.cur === 'boss'; })()", 5000, 20);
    await sleep(800);
    await page.evaluate('T.die()');
    let dead = await page.waitFor("T.state.mode === 'dead'", 12000, 50);
    if (!dead) { await page.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))"); dead = await page.waitFor("T.state.mode === 'dead'", 6000, 50); }
    const staleMode = await page.evaluate('A.getMusicMode()');
    const tr = await page.evaluate('(T.startRun(), A.AUDIO_TEST.state().ctx.currentTime)');
    await god();
    const seen = new Set();
    const tw = Date.now();
    while (Date.now() - tw < 4000) {
      const s = await page.evaluate(`(() => { const m = A.AUDIO_TEST.music(); return { cur: m.cur, boss: m.voices.filter((v) => v.slot === 'boss' && v.t0 >= ${tr} - 1e-6).length }; })()`);
      seen.add(s.cur + (s.boss ? '+boss' : ''));
      await sleep(40);
    }
    okc('RETRY after a death in a boss fight: the run track, no boss bed', dead && [...seen].every((x) => x === 'run_wilds'), { dead, staleMode, seen: [...seen] });
    // CLASSIC SYNTH: today's synth in the run.
    await page.evaluate("A.setMusicSource('synth')");
    const syn = await page.waitFor("(() => { const m = A.AUDIO_TEST.music(); return m && m.cur === 'synth' && A.AUDIO_TEST.synthLevel(A.AUDIO_TEST.state().ctx.currentTime + 4) === 1; })()", 6000);
    const lv5 = await level(3000);
    okc('CLASSIC SYNTH: the synth plays the run at full level, the recorded bed is gone', syn && lv5 > -95 && (await page.evaluate("A.AUDIO_TEST.music().voices.filter(v => !v.dead).length")) === 0, { levelDb: lv5, running: await page.evaluate('A.isMusicRunning()') });
    await page.evaluate("A.setMusicSource('recorded')");
    const rec = await page.waitFor("(() => { const m = A.AUDIO_TEST.music(); return m && m.cur !== 'synth' && m.cur !== null; })()", 6000);
    okc('back to RECORDED: a recorded bed again', rec, await mus());
    const mf2 = await page.evaluate('JSON.parse(JSON.stringify(window.__mf))');
    okc('all fetches one at a time over the whole session', mf2.max === 1, mf2.log.map((e) => e.url));
    okc('no console errors', page.errors.length === 0, page.errors);
  });
  return res;
}

const all = [];
all.push(await check({ w: 390, h: 844, dpr: 2, mobile: true }, 'phone 390x844'));
all.push(await check({ w: 1280, h: 800, dpr: 1, mobile: false }, 'desktop 1280x800'));
const fails = all.flatMap((r) => r.checks.filter((c) => !c.pass).map((c) => r.label + ': ' + c.name));
console.log(fails.length ? 'verify_music: ' + fails.length + ' FAILED\n  ' + fails.join('\n  ') : 'verify_music: all ' + all.reduce((a, r) => a + r.checks.length, 0) + ' checks passed');
process.exit(fails.length ? 1 : 0);
