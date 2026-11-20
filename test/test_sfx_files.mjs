// HORDES: recorded sound effects (R4, src/sfx_files.js, src/sfx_manifest.js, assets/sfx/).
//   - the source switch: SYNTH by default, remembered, the ADVANCED card in the real game;
//   - nothing loads before the first frame; then one file at a time; no new file in a movie;
//   - a failed fetch, a failed decode, a fetch that throws: that slot stays synth, no retry;
//     a context that cannot decode: everything synth, nothing fetched;
//   - a ready slot plays a file through the sfx bus with the mix's rules (rate limit,
//     variation as playback rate, the gem's combo climb); the old mix does not vary;
//   - the rotation never plays the same file twice in a row and makes no random draw;
//     a file play makes the same Math.random draws as the synth play it replaces;
//   - the manifest, the files on disk, CREDITS.md and sw.js agree; the size budget.
// Run: node test/test_sfx_files.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import * as A from '../src/audio.js';
import { SFX_PICKS, SFX_SLOTS, SFX_CANDIDATES, pickedSets, allSfxUrls, nextIndex, candidate, HOLD_SCENES } from '../src/sfx_files.js';
import { boot } from './_harness.mjs';

const { AUDIO_TEST, SFX, MIX } = A;
let passed = 0;
const check = async (label, fn) => {
  try { await fn(); } catch (err) { console.error('  FAIL ' + label); throw err; }
  passed++; console.log('  ok - ' + label);
};
const ROOT = new URL('../', import.meta.url);

// ---- fakes ----------------------------------------------------------------
class Param { constructor(v = 0) { this.value = v; } setValueAtTime(v) { this.value = v; } exponentialRampToValueAtTime() {} linearRampToValueAtTime() {} }
class Node { constructor(kind) { this.kind = kind; this.gain = new Param(1); this.out = []; } connect(d) { this.out.push(d); return d; } disconnect() { this.out = []; } }
class Ctx {
  constructor({ decode = 'ok' } = {}) {
    this.currentTime = 0; this.state = 'running'; this.sampleRate = 44100;
    this.destination = new Node('dest'); this.voices = [];
    this.decodes = 0;
    if (decode) {
      this.decodeAudioData = (ab) => {
        this.decodes++;
        if (decode === 'fail' || (typeof decode === 'function' && decode(ab.url))) return Promise.reject(new Error('bad data'));
        return Promise.resolve({ url: ab.url, duration: 0.1 });
      };
    }
  }
  createGain() { return new Node('gain'); }
  createWaveShaper() { return new Node('shaper'); }
  createBiquadFilter() { const n = new Node('filter'); n.frequency = new Param(); n.Q = new Param(); return n; }
  createOscillator() {
    const o = new Node('osc'); o.frequency = new Param(440);
    o.start = (t) => this.voices.push({ kind: 'osc', t }); o.stop = () => {};
    return o;
  }
  createBufferSource() {
    const n = new Node('src'); n.playbackRate = new Param(1);
    n.start = (t) => this.voices.push(n.buffer && n.buffer.url ? { kind: 'file', t, url: n.buffer.url, rate: n.playbackRate.value, node: n } : { kind: 'noise', t });
    n.stop = () => {};
    return n;
  }
  createBuffer() { return { getChannelData: () => new Float32Array(64) }; }
  resume() { return Promise.resolve(); }
}
const store = (init = []) => { const m = new Map(init); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };
// fetch: records every call; answers a microtask later. bad(url) -> 404, throws(url) -> throws.
function makeFetch({ bad = () => false, throws = () => false } = {}) {
  const calls = [];
  let open = 0, maxOpen = 0;
  const f = (url) => {
    calls.push(url);
    if (throws(url)) throw new Error('offline');
    open++; maxOpen = Math.max(maxOpen, open);
    return Promise.resolve().then(() => {
      open--;
      if (bad(url)) return { ok: false, status: 404 };
      return { ok: true, arrayBuffer: () => Promise.resolve({ url }) };
    });
  };
  f.calls = calls; f.maxOpen = () => maxOpen;
  return f;
}
const settle = async (n = 400) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };
function setup({ src = 'recorded', decode = 'ok', fetch = makeFetch(), st = store(), sets = null, buffers = null, rng = null } = {}) {
  const ctx = new Ctx({ decode });
  AUDIO_TEST.setDeps({ AudioContext: function () { return ctx; }, storage: st, fetch, rng });
  AUDIO_TEST.setSfxDeps({ sets, buffers });
  AUDIO_TEST.reset();
  A.init();
  A.setMusicSource('synth');      // the music loader stays out of these fetch counts
  if (src) A.setSfxSource(src);
  return { ctx, fetch, st };
}
const files = (ctx) => ctx.voices.filter((v) => v.kind === 'file');
const allBuffers = () => new Map(allSfxUrls().map((u) => [u, { url: u, duration: 0.1 }]));

// ---- the switch ------------------------------------------------------------
await check('the source is SYNTH by default, remembered under its own key, read back at load', () => {
  const { st } = setup({ src: null });
  assert.equal(A.getSfxSource(), 'synth', 'synth by default');
  assert.equal(st.m.has('hordes_audio_sfx_src'), false, 'reading never writes');
  assert.equal(A.setSfxSource('recorded'), 'recorded');
  assert.equal(st.m.get('hordes_audio_sfx_src'), 'recorded', 'stored');
  assert.equal(A.setSfxSource('anything else'), 'synth', 'anything but recorded is synth');
  // A new page load reads it back (reset re-reads the store).
  setup({ src: null, st: store([['hordes_audio_sfx_src', 'recorded']]) });
  assert.equal(A.getSfxSource(), 'recorded', 'hydrated from storage');
  assert.equal(A.getMusicVolume(), 70, 'the switch touches no volume');
});

await check('SYNTH plays the synth voices and fetches nothing, even with every file ready', async () => {
  const { ctx, fetch } = setup({ src: 'synth', buffers: allBuffers() });
  A.setMusicContext({ scene: 'title' });
  for (const s of SFX_SLOTS) { ctx.currentTime += 1; assert.ok(A.playSfx(s, 0), s); }
  await settle(20);
  assert.equal(files(ctx).length, 0, 'no file played');
  assert.equal(fetch.calls.length, 0, 'nothing fetched');
  assert.equal(AUDIO_TEST.sfxBank(), null, 'no loader made');
});

// ---- the loader ------------------------------------------------------------
await check('nothing loads before the first frame; then one file at a time, every picked file once', async () => {
  const { ctx, fetch } = setup();
  for (let i = 0; i < 30; i++) { ctx.currentTime += 0.2; A.playSfx('hit'); A.playSfx('gem', i % 12); A.playSfx('levelup'); }
  await settle(20);
  assert.equal(fetch.calls.length, 0, 'no fetch before the first frame');
  assert.equal(files(ctx).length, 0, 'synth until loaded');
  A.setMusicContext({ scene: 'title' });       // the first frame
  assert.equal(fetch.calls.length, 1, 'one file in flight');
  for (let i = 0; i < 5; i++) A.setMusicContext({ scene: 'title' });
  assert.equal(fetch.calls.length, 1, 'still one: frames do not start a second load');
  await settle();
  const want = Object.values(pickedSets()).flat().map((f) => f.url);
  assert.deepEqual([...fetch.calls].sort(), [...want].sort(), 'every picked file fetched exactly once');
  assert.equal(fetch.maxOpen(), 1, 'never two fetches at once');
  assert.ok(!fetch.calls.some((u) => /music/.test(u)), 'only sound effects here');
  for (const s of SFX_SLOTS) {
    ctx.currentTime += 1;
    const before = files(ctx).length;
    A.playSfx(s, 0);
    assert.equal(files(ctx).length, before + 1, s + ' plays a file once loaded');
  }
});

await check('no new file starts to load during the boss sting or the forge moment (hold)', async () => {
  const { fetch } = setup();
  A.setMusicContext({ scene: 'run', mode: 'playing', hold: true });
  await settle(30);
  assert.equal(fetch.calls.length, 0, 'nothing starts under a sting or the forge');
  A.setMusicContext({ scene: 'run', mode: 'playing', hold: false });
  assert.equal(fetch.calls.length, 1, 'loading starts after it');
  const src = (await import('node:fs')).readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(src, /hold: !!\(forge \|\| stingLive\(\)\),/, 'main.js reports the sting and the forge');
});

await check('no new file starts to load during a movie (intro, portal movie, escape, death)', async () => {
  for (const scene of ['none', 'portal', 'escape', 'death']) {
    assert.ok(HOLD_SCENES.has(scene), scene + ' holds');
    const { fetch } = setup();
    A.setMusicContext({ scene });
    await settle(30);
    assert.equal(fetch.calls.length, 0, 'nothing starts in ' + scene);
    A.setMusicContext({ scene: 'run' });
    assert.equal(fetch.calls.length, 1, 'loading starts after ' + scene);
    // A movie that starts while a file is in flight lets that one land, then holds.
    A.setMusicContext({ scene });
    await settle(30);
    assert.equal(fetch.calls.length, 1, 'the next file waits for the end of ' + scene);
  }
  for (const scene of ['title', 'run', 'intermission', 'pause', 'endcard', 'finale']) assert.ok(!HOLD_SCENES.has(scene), scene + ' loads');
});

await check('a failed fetch, a fetch that throws and a failed decode leave that slot synth, without a retry', async () => {
  const sets = pickedSets();
  const badHit = sets.hit[1].url, throwKill = sets.kill[0].url, badGem = sets.gem[2].url;
  const fetch = makeFetch({ bad: (u) => u === badHit, throws: (u) => u === throwKill });
  const { ctx } = setup({ fetch, decode: (u) => u === badGem });
  for (let i = 0; i < 40; i++) { A.setMusicContext({ scene: 'run' }); await settle(10); }
  for (const u of [badHit, throwKill, badGem]) assert.equal(fetch.calls.filter((x) => x === u).length, 1, 'tried once: ' + u);
  assert.deepEqual(AUDIO_TEST.sfxBank().failed.sort(), ['gem', 'hit', 'kill']);
  for (const s of ['hit', 'kill', 'gem']) {
    ctx.currentTime += 1;
    const n = files(ctx).length;
    assert.ok(A.playSfx(s, 0), s + ' still plays');
    assert.equal(files(ctx).length, n, s + ' is synth (a voice, not a file)');
  }
  ctx.currentTime += 1;
  const n = files(ctx).length;
  A.playSfx('levelup');
  assert.equal(files(ctx).length, n + 1, 'the other slots are recorded');
});

await check('a context that cannot decode, or no fetch: everything synth, nothing fetched', async () => {
  let { ctx, fetch } = setup({ decode: null });
  A.setMusicContext({ scene: 'run' }); await settle(20);
  A.playSfx('hit');
  assert.equal(fetch.calls.length, 0, 'no decode: no fetch');
  assert.equal(files(ctx).length, 0);
  ({ ctx } = setup({ fetch: null }));
  AUDIO_TEST.setDeps({ fetch: null });
  A.setMusicContext({ scene: 'run' }); await settle(20);
  assert.ok(A.playSfx('hit'), 'the synth plays');
  assert.equal(files(ctx).length, 0);
  AUDIO_TEST.setDeps({ fetch: undefined });
});

// ---- playing a file -----------------------------------------------------------
await check('a file plays by the synth rules: rate limit, sfx bus, variation, the combo climb; the old mix does not vary', () => {
  const { ctx } = setup({ buffers: allBuffers(), rng: () => 0 });   // r1 = 0: pitch down by the full range; r2 = 0: no volume change
  A.setMusicContext({ scene: 'run' });
  ctx.currentTime = 10;
  assert.equal(A.playSfx('hit'), true);
  assert.equal(A.playSfx('hit'), false, 'the hit rate limit holds file plays too');
  const v = files(ctx).at(-1);
  assert.ok(Math.abs(v.rate - Math.pow(2, -MIX.vary.hit.semis / 12)) < 1e-9, 'pitch variation as playback rate: ' + v.rate);
  const gain = v.node.out[0];
  assert.equal(gain.out[0], AUDIO_TEST.state().sfxBus, 'file -> its gain -> the sfx bus (and the limiter)');
  ctx.currentTime = 11; A.playSfx('gem', 6);
  assert.ok(Math.abs(files(ctx).at(-1).rate - 2) < 1e-9, 'gem combo step 6 is an octave up, as the synth');
  ctx.currentTime = 12; A.playSfx('fire_blast');
  assert.ok(Math.abs(files(ctx).at(-1).node.out[0].gain.value - Math.pow(10, MIX.trimDb.fire_blast / 20)) < 1e-9, 'the MIX trim applies');
  A.setMixMode('old');
  ctx.currentTime = 13; A.playSfx('hit');
  assert.equal(files(ctx).at(-1).rate, 1, 'the old mix plays the file as it is');
  assert.equal(files(ctx).at(-1).node.out[0].gain.value, 1);
  A.setHiddenMute(true);
  ctx.currentTime = 14;
  assert.equal(A.playSfx('hit'), false, 'a hidden tab is silent');
  A.setHiddenMute(false);
});

await check('the rotation never repeats a file twice in a row and uses every file; no random draw', () => {
  for (const n of [2, 3, 4, 5]) {
    let last = -1; const seen = new Set();
    for (let c = 0; c < 400; c++) {
      const i = nextIndex(last, c, n);
      assert.ok(i >= 0 && i < n);
      if (last >= 0) assert.notEqual(i, last, 'n=' + n + ' play ' + c);
      seen.add(i); last = i;
    }
    assert.equal(seen.size, n, 'every file of ' + n + ' plays');
  }
  assert.equal(nextIndex(-1, 0, 1), 0); assert.equal(nextIndex(0, 5, 1), 0);
  const { ctx } = setup({ buffers: allBuffers() });
  A.setMusicContext({ scene: 'run' });
  const keep = Math.random; let draws = 0;
  Math.random = () => { draws++; return keep(); };
  try {
    AUDIO_TEST.setDeps({ rng: () => 0.5 });   // the variation's draws go here, not to Math.random
    A.setMixMode('old');                       // and the old mix makes none
    for (let i = 0; i < 200; i++) { ctx.currentTime += 0.1; A.playSfx('kill'); }
  } finally { Math.random = keep; AUDIO_TEST.setDeps({ rng: null }); }
  const urls = files(ctx).map((v) => v.url);
  assert.equal(urls.length, 200);
  for (let i = 1; i < urls.length; i++) assert.notEqual(urls[i], urls[i - 1], 'play ' + i);
  assert.equal(new Set(urls).size, pickedSets().kill.length, 'all variations heard');
  assert.equal(draws, 4410, 'only the one noise buffer fill (0.1 s at 44.1 kHz), which the synth kill makes too');
});

await check('a seeded run makes the same Math.random draws with RECORDED as with SYNTH', () => {
  const plays = ['kill', 'hit', 'gem', 'fire_blast', 'fire_bolt', 'levelup', 'uiMove', 'draftPick', 'hit', 'kill', 'gem', 'fire_zap', 'uiConfirm', 'fire_arc', 'fire_seek', 'hurt', 'chest'];
  const count = (src) => {
    const { ctx } = setup({ src, buffers: allBuffers() });
    A.setMusicContext({ scene: 'run' });
    const keep = Math.random; const seq = [];
    let s = 1;
    Math.random = () => { s = (s * 16807) % 2147483647; seq.push(s); return s / 2147483647; };
    try { for (const p of plays) { ctx.currentTime += 0.3; A.playSfx(p, 3); } } finally { Math.random = keep; }
    return { n: seq.length, files: files(ctx).length };
  };
  const syn = count('synth'), rec = count('recorded');
  assert.equal(rec.files > 10, true, 'recorded played files: ' + rec.files);
  assert.equal(syn.files, 0);
  assert.equal(rec.n, syn.n, 'same number of draws: ' + rec.n + ' / ' + syn.n);
});

// ---- the manifest, the files, the credits, sw.js -------------------------------
await check('every slot is a real sound with 3 to 5 candidates; hit, kill and gem sets of 3 to 4; the picks exist', () => {
  for (const s of SFX_SLOTS) {
    assert.ok(SFX[s], s + ' is a synth sound');
    const list = SFX_CANDIDATES[s];
    assert.ok(list.length >= 3 && list.length <= 5, s + ' has ' + list.length + ' candidates');
    assert.equal(new Set(list.map((c) => c.id)).size, list.length, s + ' ids are distinct');
    for (const c of list) {
      const want = ['hit', 'kill', 'gem'].includes(s) ? [3, 4] : [1, 1];
      assert.ok(c.files.length >= want[0] && c.files.length <= want[1], s + '/' + c.id + ' has ' + c.files.length + ' files');
      for (const f of c.files) assert.ok(f.gain > 0 && f.gain <= 4, f.url + ' gain');
    }
    assert.ok(candidate(s, SFX_PICKS[s]), s + ' pick ' + SFX_PICKS[s] + ' exists');
    assert.equal(SFX_PICKS[s], list[0].id, s + ': until Steve picks, the first candidate');
  }
  assert.deepEqual(Object.keys(SFX_PICKS).sort(), [...SFX_SLOTS].sort(), 'one pick per slot');
  for (const fam of ['fire_bolt', 'fire_arc', 'fire_blast', 'fire_zap', 'fire_seek']) assert.ok(SFX_SLOTS.includes(fam), fam);
});

await check('assets/sfx holds exactly the manifest files, CREDITS.md a row for each, sw.js precaches each; under 300 KB', () => {
  const urls = allSfxUrls();
  assert.equal(new Set(urls).size, urls.length, 'no file in two candidates');
  const disk = fs.readdirSync(new URL('assets/sfx/', ROOT));
  const mp3 = disk.filter((n) => n.endsWith('.mp3'));
  assert.deepEqual(mp3.map((n) => 'assets/sfx/' + n).sort(), [...urls].sort(), 'the files on disk are the manifest');
  assert.deepEqual(disk.filter((n) => !n.endsWith('.mp3')), ['CREDITS.md'], 'and the credits');
  let total = 0;
  for (const n of mp3) {
    assert.match(n, /^[A-Za-z_]+(?:_[a-z0-9]+)*\.[0-9a-f]{8}\.mp3$/, n + ' carries its content hash');
    const b = fs.readFileSync(new URL('assets/sfx/' + n, ROOT));
    total += b.length;
    // The name's hash is the file's own (sw.js G2: a precached file fetched after the first
    // frame must have the same bytes in every release that lists its name).
    assert.equal(n.split('.')[1], createHash('sha256').update(b).digest('hex').slice(0, 8), n + ' hash matches its bytes');
    assert.ok(b.length > 200 && (b[0] === 0xff || (b[0] === 0x49 && b[1] === 0x44)), n + ' is an mp3');
  }
  assert.ok(total < 300 * 1024, 'total ' + total + ' bytes');
  const credits = fs.readFileSync(new URL('assets/sfx/CREDITS.md', ROOT), 'utf8');
  for (const n of mp3) assert.ok(credits.includes('| `' + n + '` | Kenney '), n + ' has a credits row');
  const rows = credits.split(/\r?\n/).filter((l) => /^\| `/.test(l));
  assert.equal(rows.length, mp3.length, 'one row per file');
  for (const r of rows) assert.ok(/\| CC0 \|/.test(r), 'CC0: ' + r);
  const sw = fs.readFileSync(new URL('sw.js', ROOT), 'utf8');
  for (const u of urls) assert.ok(sw.includes("'" + u + "'"), 'sw.js precaches ' + u);
  for (const p of ['src/sfx_files.js', 'src/sfx_manifest.js']) assert.ok(sw.includes("'" + p + "'"), 'sw.js precaches ' + p);
  assert.ok(!sw.includes('assets/sfx/CREDITS.md'), 'not the credits');
});

// ---- the ADVANCED card in the real game ------------------------------------------
const mem = new Map([['hordes_onboarded', '1']]);
const h = await boot({ storage: [...mem] });
await check('ADVANCED: SOUND EFFECTS: SYNTH by default; a press turns RECORDED (PREVIEW) on and is remembered', () => {
  const T = h.T;
  T.banners.suppressAll();
  const st = store();
  AUDIO_TEST.setDeps({ storage: st });
  AUDIO_TEST.reset();
  T.startRun(); h.pump(2);
  T.openSettings();
  const cards = () => [...h.elements['ov-cards'].children];
  const named = (t) => cards().find((x) => (x._html || x.innerHTML || '').includes(t));
  named('ADVANCED').click();
  const row = named('SOUND EFFECTS: SYNTH');
  assert.ok(row, 'the ADVANCED page has a SOUND EFFECTS: SYNTH row');
  assert.ok(!named('RECORDED (PREVIEW)'), 'not recorded by default');
  row.click();
  assert.equal(A.getSfxSource(), 'recorded');
  assert.equal(st.m.get('hordes_audio_sfx_src'), 'recorded', 'the choice is stored');
  assert.ok(named('SOUND EFFECTS: RECORDED (PREVIEW)'), 'the row now reads RECORDED (PREVIEW)');
  assert.ok(named('MUSIC: '), 'the music row is still there');
  named('SOUND EFFECTS: RECORDED (PREVIEW)').click();
  assert.equal(A.getSfxSource(), 'synth');
  assert.equal(st.m.get('hordes_audio_sfx_src'), 'synth');
});

// The real game says where it is (main.js syncMusic); that context goes to the
// loader. Every movie main.js plays holds it, including the road shot, whose
// music scene is 'run'; a fight and the finale (a fight, not a movie) load.
await check('the game\'s own context holds the loader in every movie (intro, portal movie, road shot, escape, death); a fight loads', () => {
  const T = h.T, st = h.state;
  const real = T.audio.get();
  let seen = null;
  T.audio.set({ ...real, setMusicContext: (c) => { seen = c; } });
  const keepMode = st.mode;
  const contextIn = (mode, kind) => {
    st.mode = mode;
    if (kind) T.movies.begin(kind);
    seen = null; T.music.sync();
    assert.ok(seen, 'main.js reports a context in ' + mode);
    return seen;
  };
  const loads = (c) => { const { fetch } = setup(); A.setMusicContext(c); return fetch.calls.length; };
  try {
    for (const [mode, kind] of [['intro'], ['portal-cine', 'portal'], ['portal-cine', 'road'], ['escape'], ['death-cine']]) {
      const c = contextIn(mode, kind);
      assert.equal(loads(c), 0, 'no file starts in ' + mode + (kind ? '/' + kind : '') + ' (scene ' + c.scene + ')');
    }
    T.movies.current && (T.movies.current.done = true);
    for (const mode of ['playing', 'finale', 'intermission', 'draft', 'settings']) {
      const c = contextIn(mode);
      assert.equal(loads(c), 1, 'loading goes on in ' + mode + ' (scene ' + c.scene + ')');
    }
  } finally { st.mode = keepMode; T.audio.set(real); }
});

// Source comments say what the code does; they do not cite commercial games or
// their asset packs ("Risks: Licences" in docs/REVIEW_2026-11.md).
await check('no source file under src/ cites a commercial game or its reference assets', () => {
  const bad = /megabonk|vampire survivors|balatro|ball ?x ?pit|vs_ref|mb_ref|vs_port/i;
  const hits = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = new URL(e.name + (e.isDirectory() ? '/' : ''), dir);
      if (e.isDirectory()) walk(p);
      else if (/\.js$/.test(e.name)) fs.readFileSync(p, 'utf8').split(/\r?\n/).forEach((l, i) => { if (bad.test(l)) hits.push(e.name + ':' + (i + 1)); });
    }
  };
  walk(new URL('src/', ROOT));
  assert.deepEqual(hits, [], 'citations left');
});

// The measuring tool's verdict (tools/measure_sfx_files.mjs exits 1 on any FAIL):
// a good measurement passes; each broken rule fails on its own.
await check('the measurement verdict: RECORDED at most 1 dB louder, no clipping, every file decoded, the pick group works', async () => {
  const { verdict } = await import('../tools/sfx_files_verdict.mjs');
  const line = 'SFX picks: hit=woodtap, kill=synth, gem=?';
  const good = () => ({
    load: { files: 86, failed: [] },
    fight: {
      synth: { busiestSecondLufs: -30.6, peakDb: -10.5 }, recorded: { busiestSecondLufs: -31.1, peakDb: -15.6 },
      synthMeaning: { busiestSecondLufs: -30.1, peakDb: -9.5 }, recordedMeaning: { busiestSecondLufs: -30.6, peakDb: -14.3 },
    },
    worst: { synth: { peakDb: -4 }, recorded: { peakDb: -4.1 } },
    slots: { hit: { cands: { punch: { scenePeak: -12 }, woodtap: { scenePeak: -11 } } } },
    ui: { line, lineAfterReload: line, copied: 'Copied.', game: null, played: ['gem:glasstink', 'uiMove:click2:menu'], sideways: false },
    errors: [],
  });
  assert.deepEqual(verdict(good()), [], 'the real numbers pass');
  const breaks = {
    'a decode failed': (r) => { r.load.failed = ['assets/sfx/x.mp3']; },
    'RECORDED 1.1 dB louder': (r) => { r.fight.recorded.busiestSecondLufs = r.fight.synth.busiestSecondLufs + 1.1; },
    'RECORDED louder with the R4 cues': (r) => { r.fight.recordedMeaning.busiestSecondLufs = -28; },
    'the worst case clips': (r) => { r.worst.recorded.peakDb = 0; },
    'a candidate clips in its scene': (r) => { r.slots.hit.cands.woodtap.scenePeak = 0.2; },
    'the picks line is wrong': (r) => { r.ui.line = r.ui.lineAfterReload = 'SFX picks: hit=?, kill=?'; },
    'the picks are forgotten': (r) => { r.ui.lineAfterReload = 'SFX picks: hit=?'; },
    'COPY does nothing': (r) => { r.ui.copied = ''; },
    'the page sets the game source': (r) => { r.ui.game = 'recorded'; },
    'a console error': (r) => { r.errors = ['boom']; },
  };
  for (const [name, brk] of Object.entries(breaks)) {
    const r = good(); brk(r);
    assert.ok(verdict(r).length >= 1, 'fails when ' + name);
  }
  assert.equal(verdict({ ...good(), fight: { ...good().fight, recorded: { busiestSecondLufs: -29.6, peakDb: -10 } } }).length, 0, 'exactly 1 dB louder still passes');
});

AUDIO_TEST.setDeps({ fetch: undefined, rng: null });
AUDIO_TEST.setSfxDeps({ sets: null, buffers: null });
AUDIO_TEST.reset();
console.log('test_sfx_files: ' + passed + ' checks passed');
