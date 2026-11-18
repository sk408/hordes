#!/usr/bin/env node
// HORDES: real-Chrome check of the service worker (R4). One headless Chrome at a time, never a window.
//   HORDES_CHROME="C:/Program Files/Google/Chrome/Application/chrome.exe" node tools/verify_sw.mjs
//       flows C1..C11 on a temporary copy of the tree served at /hordes/ (the repo is never written),
//       then L1: the --live check run against that local copy.
//   node tools/verify_sw.mjs --only C4,C5      some flows (C1..C9 build on each other: a later one runs its predecessors)
//   node tools/verify_sw.mjs --no-others       skip C11's rerun of the four existing verifiers
//   node tools/verify_sw.mjs --live https://sk408.github.io/hordes/ --expect <VERSION>
//       after a release: every FILES path of the live sw.js fetched with ?v=<VERSION> and hashed, then a fresh
//       profile loads the page twice (the second load controlled, its cache present, 0 console errors).
//       Retries every 30 s for up to 15 minutes while the CDN settles. --expect KILL checks the kill switch.
// Each flow's checks print as "ok"/"FAIL"; the exit code is 1 on any FAIL.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { withPage, serveRoot, ROOT } from './browser.mjs';
import { build, split, parseBlock, fileHash, KILL_MARK } from './gen_sw.mjs';

const argv = process.argv.slice(2);
const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = (x) => JSON.stringify(x);
const results = [];
let FLOW = '';
const ok = (name, pass, info) => {
  results.push({ flow: FLOW, name, pass: !!pass, info });
  console.log((pass ? '  ok   ' : '  FAIL ') + FLOW + ' ' + name + (info !== undefined ? '  ' + J(info) : ''));
  return !!pass;
};

// ---------------------------------------------------------------- the --live check
async function liveCheck(pageUrl, expect, { once = false } = {}) {
  const u = new URL(pageUrl);
  const base = u.origin + u.pathname.replace(/[^/]*$/, '');
  const scope = new URL(base).pathname;
  const deadline = Date.now() + (once ? 0 : 15 * 60000);
  for (let attempt = 1; ; attempt++) {
    const out = { attempt, problems: [] };
    try {
      const swText = await (await fetch(base + 'sw.js?t=' + Date.now(), { cache: 'no-store' })).text();
      if (expect === 'KILL') {
        const kill = fs.readFileSync(path.join(ROOT, 'tools/sw_killswitch.js'), 'utf8').replace(/\r\n/g, '\n');
        if (!swText.includes(KILL_MARK) || swText.replace(/\r\n/g, '\n') !== kill) out.problems.push('sw.js is not the kill switch yet');
      } else {
        const blk = parseBlock(split(swText).block);
        if (blk.VERSION !== expect) out.problems.push('sw.js VERSION ' + blk.VERSION + ', want ' + expect);
        else {
          const bad = [];
          for (const [p, h] of Object.entries(blk.FILES)) {
            const r = await fetch(base + p + '?v=' + expect, { cache: 'no-store' });
            const b = Buffer.from(await r.arrayBuffer());
            if (r.status !== 200 || fileHash(p, b) !== h) bad.push(p + (r.status !== 200 ? ' (' + r.status + ')' : ''));
          }
          if (bad.length) out.problems.push('files that differ from the release: ' + bad.join(', '));
          out.files = Object.keys(blk.FILES).length;
        }
      }
      if (!out.problems.length) {
        await withPage({ url: pageUrl, userGesture: false, timeoutMs: 60000 }, async (page) => {
          const first = await page.waitFor("(() => { const b = document.getElementById('boot-msg'); return !!(b && b.hidden); })()", 60000);
          if (!first) out.problems.push('first load never booted');
          if (expect === 'KILL') {
            await sleep(8000);
            await page.reload();
            await page.waitFor("(() => { const b = document.getElementById('boot-msg'); return !!(b && b.hidden); })()", 60000);
            await sleep(1500);
            const s = await page.evaluate("(async () => ({ reg: !!(await navigator.serviceWorker.getRegistration()), caches: (await caches.keys()).filter((k) => k.startsWith('hordes:')) }))()");
            if (s.reg || s.caches.length) out.problems.push('kill switch: ' + J(s));   // checked before the page's own +3 s register()
          } else {
            const act = await page.waitFor("navigator.serviceWorker.getRegistration().then((r) => !!(r && r.active && r.active.state === 'activated'))", 90000, 500);
            if (!act) out.problems.push('the worker never activated');
            await page.reload();
            await page.waitFor("(() => { const b = document.getElementById('boot-msg'); return !!(b && b.hidden); })()", 60000);
            const s = await page.evaluate("(async () => ({ controlled: !!navigator.serviceWorker.controller, caches: await caches.keys() }))()");
            out.second = s;
            if (!s.controlled) out.problems.push('second load not controlled');
            if (!s.caches.includes('hordes:' + scope + ':' + expect)) out.problems.push('no cache hordes:' + scope + ':' + expect);
          }
          if (page.errors.length) out.problems.push('console errors: ' + page.errors.join(' | '));
        });
      }
    } catch (e) { out.problems.push('error: ' + (e && e.message || e)); }
    if (!out.problems.length) { console.log('live check passed (attempt ' + attempt + ')' + (out.files ? ': ' + out.files + ' files' : '')); return { pass: true, ...out }; }
    console.log('live check attempt ' + attempt + ': ' + out.problems.join('; '));
    if (Date.now() + 30000 > deadline) return { pass: false, ...out };
    await sleep(30000);
  }
}

if (arg('--live')) {
  const r = await liveCheck(arg('--live'), arg('--expect') || '');
  process.exit(r.pass ? 0 : 1);
}

// ---------------------------------------------------------------- the temporary tree
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'hordes-sw-'));
const H = path.join(T, 'hordes');
const cp = (rel, to = rel) => fs.cpSync(path.join(ROOT, rel), path.join(H, to), { recursive: true });
for (const p of ['index.html', 'manifest.webmanifest', 'sw.js', 'editor.html', 'src', 'assets']) cp(p);
cp('tools/sw_killswitch.js');
const put = (rel, s) => { fs.mkdirSync(path.dirname(path.join(H, rel)), { recursive: true }); fs.writeFileSync(path.join(H, rel), s); };
put('classic/index.html', '<!doctype html><title>classic</title><p>classic probe</p>\n');
put('docs/probe.html', '<!doctype html><title>docs</title><p>docs probe</p>\n');
put('tools/probe.txt', 'tools probe\n');
const ORIG_HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const ORIG_CONFIG = fs.readFileSync(path.join(ROOT, 'src/config.js'), 'utf8');
const ORIG_SW = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const rels = {};
// A release: a meta tag in index.html and a global at the end of src/config.js name it; sw.js is rebuilt.
async function release(tag, { urgent = false, mutate = null } = {}) {
  const html = ORIG_HTML.replace('<meta charset="UTF-8">', '<meta charset="UTF-8">\r\n<meta name="sw-test" content="' + tag + '">');
  if (html === ORIG_HTML) throw new Error('no charset meta to anchor the sw-test meta');
  put('index.html', html);
  const config = ORIG_CONFIG + "\r\nglobalThis.__swTestVer = '" + tag + "';\r\n";
  put('src/config.js', config);
  let sw = ORIG_SW.replace('const URGENT = false;', 'const URGENT = ' + urgent + ';');
  if (mutate) sw = mutate(sw);
  put('sw.js', sw);
  const r = await build(H);
  put('sw.js', r.text);
  rels[tag] = { version: r.version, files: new Set(r.files.map(([p]) => p)), config: Buffer.from(config), cache: 'hordes:/hordes/:' + r.version };
  return rels[tag];
}
const BROKEN = (sw) => {
  const a = 'async function fromCache(path, req) {\n';
  const t = sw.replace(/\r\n/g, '\n');
  if (!t.includes(a)) throw new Error('fromCache not found');
  return t.replace(a, a + "  if (/^src\\/.*\\.js$/.test(path)) return new Response('broken', { status: 500 });   // verify_sw C9: a broken worker\n");
};

// ---------------------------------------------------------------- page helpers
// Before the page's own scripts: wrap hordesBooted (record each boot's versions, mark the first frame,
// count save() calls), log every text the boot box shows (sessionStorage survives reloads), and
// optionally set the auto-apply guard (localStorage sw_test_noauto = '1').
const STARTUP = `(() => {
  const rec = (store, k, v) => { try { const a = JSON.parse(store.getItem(k) || '[]'); a.push(v); store.setItem(k, JSON.stringify(a)); } catch (e) {} };
  try { if (localStorage.getItem('sw_test_noauto') === '1') sessionStorage.setItem('hordes_sw_auto', String(Date.now())); } catch (e) {}
  let inner = null;
  function wrapped(h) {
    try {
      performance.mark('hordes-first-frame');
      const m = document.querySelector('meta[name=sw-test]');
      window.__swBoot = { at: performance.timeOrigin + performance.now(), ver: globalThis.__swTestVer || null, meta: m ? m.content : null,
        controlled: (() => { try { return !!(navigator.serviceWorker && navigator.serviceWorker.controller); } catch (e) { return null; } })() };
      rec(localStorage, 'sw_test_boots', window.__swBoot);
      rec(sessionStorage, 'sw_test_boots', window.__swBoot);
      if (h && h.save) { const s = h.save; h = Object.assign({}, h, { save: () => { rec(localStorage, 'sw_test_saves', Date.now()); return s(); } }); }
    } catch (e) {}
    return inner ? inner(h) : undefined;
  }
  try { Object.defineProperty(window, 'hordesBooted', { configurable: true, get() { return inner ? wrapped : undefined; }, set(f) { inner = f; } }); } catch (e) {}
  let last = null;
  try {
    new MutationObserver(() => {
      const b = document.getElementById('boot-msg');
      const t = b && !b.hidden ? b.textContent : null;
      if (t && t !== last) rec(sessionStorage, 'sw_test_msgs', t);
      last = t;
    }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden'] });
  } catch (e) {}
})();`;
const ST = `(async () => {
  const b = document.getElementById('boot-msg');
  const m = document.querySelector('meta[name=sw-test]');
  const c = navigator.serviceWorker;
  let reg = null;
  try { const r = await c.getRegistration(); reg = r ? { active: r.active && r.active.state, waiting: !!r.waiting, installing: !!r.installing,
    controllerIsActive: !!(c.controller && c.controller === r.active) } : null; } catch (e) {}
  const n = document.getElementById('sw-update');
  let ck = []; try { ck = (await caches.keys()).sort(); } catch (e) {}
  return { booted: !!(b && b.hidden && window.__swBoot), box: b && !b.hidden ? b.textContent : null, meta: m ? m.content : null,
    ver: globalThis.__swTestVer || null, controlled: !!(c && c.controller), reg, caches: ck, notice: !!(n && !n.hidden),
    sentinel: window.__sentinel || null, mode: window.__T ? window.__T.state.mode : null, path: location.pathname + location.search };
})()`;
const st = async (p) => { for (let i = 0; i < 20; i++) { try { return await p.evaluate(ST); } catch (e) { await sleep(250); } } return null; };
const vv = (s) => (s ? s.meta + '/' + s.ver : 'none');
const BOOTED = "(() => { const b = document.getElementById('boot-msg'); return !!(b && b.hidden && window.__swBoot); })()";
const waitBoot = (p, ms = 30000) => p.waitFor(BOOTED, ms);
const waitVer = (p, tag, ms = 30000) => p.waitFor("(() => { const b = document.getElementById('boot-msg'); const m = document.querySelector('meta[name=sw-test]'); return !!(b && b.hidden && window.__swBoot && m && m.content === " + J(tag) + " && globalThis.__swTestVer === " + J(tag) + "); })()", ms);
const update = (p) => p.evaluate("(async () => { const r = await navigator.serviceWorker.getRegistration(); if (!r) return 'none'; try { await r.update(); return 'ok'; } catch (e) { return 'ERR ' + e.message; } })()");
const waitWaiting = (p, ms = 30000) => p.waitFor("navigator.serviceWorker.getRegistration().then((r) => !!(r && r.waiting && r.waiting.state === 'installed'))", ms, 200);
const waitActive = (p, tag, ms = 30000) => p.waitFor("navigator.serviceWorker.getRegistration().then(async (r) => !!(r && r.active && r.active.state === 'activated' && !r.waiting && !r.installing && (await caches.keys()).includes(" + J(rels[tag].cache) + ")))", ms, 200);
const waitSettled = (p, ms = 30000) => p.waitFor("navigator.serviceWorker.getRegistration().then((r) => !!(r && !r.installing))", ms, 200);
const T_ = "(async () => { if (!window.__T) window.__T = (await import('/hordes/src/main.js')).__TEST; return true; })()";
const tapSel = async (p, sel) => { const r = await p.rectOf(sel); if (!r) return false; await p.tap(r[0], r[1]); return true; };
const noticeShown = (p, ms = 8000) => p.waitFor("(() => { const n = document.getElementById('sw-update'); return !!(n && !n.hidden); })()", ms);
const rel = (e) => (e.path.startsWith('/hordes/') ? e.path.slice('/hordes/'.length) : null);
const isMusic = (r) => /^assets\/music\/.*\.mp3$/.test(r);
const ls = (p, k, store = 'localStorage') => p.evaluate('JSON.parse(' + store + '.getItem(' + J(k) + ") || '[]')");
const flowErrors = (page, e0, allow = []) => page.errors.slice(e0).filter((e) => !allow.some((re) => re.test(e)));

const ONLY = (arg('--only') || '').split(',').filter(Boolean);
// C1..C9 build on each other: asking for any of them runs the whole chain.
const want = (f) => !ONLY.length || ONLY.some((o) => o === f || (/^C[1-9]$/.test(o) && /^C[1-9]$/.test(f)));

// ---------------------------------------------------------------- C1..C9: one profile, one tab story
async function mainFlows() {
  await release('A');
  await withPage({ root: T, url: 'hordes/?sw=on', startupScript: STARTUP, userGesture: false, timeoutMs: 60000 }, async (page) => {
    const L = page.server.log;
    let e0 = 0;
    const startFlow = (f) => { FLOW = f; e0 = page.errors.length; console.log('-- ' + f); };
    const endFlow = (allow = []) => { const errs = flowErrors(page, e0, allow); ok('0 page and console errors', errs.length === 0, errs.length ? errs.slice(0, 5) : undefined); };

    // ---- C1 first visit
    startFlow('C1');
    ok('boots A/A, uncontrolled', (await waitVer(page, 'A')) && !(await st(page)).controlled, await st(page));
    const act = await page.waitFor("navigator.serviceWorker.getRegistration().then((r) => !!(r && r.active && r.active.state === 'activated'))", 30000, 200);
    const boot = await page.evaluate('window.__swBoot');
    const firstSw = L.find((e) => e.path === '/hordes/sw.js');
    ok('the first sw.js request is >= 3 s after the first frame', firstSw && firstSw.t >= boot.at + 2900, { afterMs: firstSw && Math.round(firstSw.t - boot.at) });
    let s = await st(page);
    ok('the worker activated; the page is still uncontrolled', act && !s.controlled, s.reg);
    const n1 = await page.evaluate("(async () => (await (await caches.open(" + J(rels.A.cache) + ")).keys()).length)()");
    ok('caches = [A] holding every FILES entry', J(s.caches) === J([rels.A.cache]) && n1 === rels.A.files.size, { caches: s.caches, entries: n1, files: rels.A.files.size });
    ok('no music cache, no notice', !s.caches.some((k) => k.endsWith(':music')) && !s.notice);
    endFlow();

    // ---- C2 controlled reload, pass-through
    startFlow('C2');
    let m0 = L.length;
    await page.reload();
    s = (await waitVer(page, 'A')) && await st(page);
    ok('reload: controlled, A/A', s && s.controlled && vv(s) === 'A/A', s);
    await page.evaluate(T_);
    const titleUrl = await page.evaluate("(async () => (await import('/hordes/src/music_manifest.js')).MUSIC_TRACKS.title.url)()");
    const inMusic = "(async () => { if (!(await caches.has('hordes:/hordes/:music'))) return false; return !!(await (await caches.open('hordes:/hordes/:music')).match(" + J('/hordes/' + titleUrl) + ")); })()";
    const gotTitle = await page.waitFor(inMusic, 30000, 250);
    const since = L.slice(m0).map(rel).filter((r) => r !== null);
    const filesHit = since.filter((r) => rels.A.files.has(r));
    ok('the server saw no FILES path since the reload (only sw.js and music)', filesHit.length === 0 && since.every((r) => r === 'sw.js' || isMusic(r)), { since });
    ok('the title track is in hordes:/hordes/:music', gotTitle, { titleUrl });
    m0 = L.length;
    await page.reload(); await waitVer(page, 'A');
    await sleep(3000);
    const titleAgain = L.slice(m0).filter((e) => rel(e) === titleUrl).length;
    ok('one more reload: the title track never reaches the server', titleAgain === 0, { requests: titleAgain });
    // pass-through: navigations and a fetch outside the game
    const visit = async (u) => {
      const i = L.length;
      await page.evaluate('location.assign(' + J(u) + ')');
      await sleep(400);
      await page.waitFor("document.readyState === 'complete' && location.pathname + location.search === " + J(new URL(u, 'http://x/hordes/').pathname + new URL(u, 'http://x/hordes/').search), 20000);
      await sleep(1500);
      return L.slice(i).map((e) => e.path + (e.query ? '?' + e.query : ''));
    };
    const vc = await visit('/hordes/classic/');
    const ve = await visit('/hordes/editor.html');
    const vd = await visit('/hordes/docs/probe.html');
    const tp = await page.evaluate("fetch('/hordes/tools/probe.txt').then((r) => r.text())");
    const vdev = await visit('/hordes/index.html?dev=1&sw=on');
    ok('classic/, editor.html and docs/probe.html navigations reach the server', vc.includes('/hordes/classic/') && ve.includes('/hordes/editor.html') && vd.includes('/hordes/docs/probe.html'), { vc: vc.slice(0, 3), ve: ve.slice(0, 3), vd });
    ok("the editor's src/ imports reach the server", ve.some((p) => p.startsWith('/hordes/src/')), { n: ve.filter((p) => p.startsWith('/hordes/src/')).length });
    ok('fetch(tools/probe.txt) reaches the server', tp === 'tools probe\n' && L.some((e) => e.path === '/hordes/tools/probe.txt'));
    ok('index.html?dev=1 and its modules reach the server', vdev.includes('/hordes/index.html?dev=1&sw=on') && vdev.some((p) => p.startsWith('/hordes/src/main.js')), { n: vdev.length });
    const leaked = await page.evaluate("(async () => { const out = []; for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) if (/classic\\/|editor\\.html|docs\\/|tools\\//.test(r.url)) out.push(r.url); return out; })()");
    ok('none of them is in any cache', leaked.length === 0, leaked);
    await page.evaluate("location.assign('/hordes/?sw=on')");
    await sleep(500); await waitVer(page, 'A');
    endFlow([/editor|dev_|telemetry|snapshot/i]);

    // ---- C3 offline start
    startFlow('C3');
    // C2 let the loader store every slot it asked for; drop the first run track so one slot meets the offline 503.
    const dropped = await page.evaluate("(async () => { const c = await caches.open('hordes:/hordes/:music'); for (const r of await c.keys()) if (/run_wilds/.test(r.url)) { await c.delete(r); return r.url.replace(/^.*\\//, ''); } return null; })()");
    page.server.setOffline(true);
    await page.reload();
    s = (await waitVer(page, 'A', 30000)) && await st(page);
    ok('offline reload boots A/A from the cache', s && vv(s) === 'A/A' && s.controlled, s);
    await sleep(4000);
    const mus = await page.evaluate("performance.getEntriesByType('resource').filter((e) => /\\.mp3/.test(e.name)).map((e) => [e.name.replace(/^.*\\//, ''), e.responseStatus])");
    const stored = await page.evaluate("(async () => (await (await caches.open('hordes:/hordes/:music')).keys()).map((r) => r.url.replace(/^.*\\//, '')))()");
    const titleName = titleUrl.replace(/^.*\//, '');
    ok('music: the title track ok from the cache; a stored track plays, any other slot gets 503 (synth) or is never tried',
      mus.some(([n, c]) => n === titleName && c === 200) && mus.every(([n, c]) => (c === 200 && stored.includes(n)) || c === 503 || c === 0), { mus, stored });
    await page.evaluate(T_);
    await page.evaluate('(window.__T.startRun(), true)');
    await sleep(10000);
    s = await st(page);
    ok('a run plays 10 s offline', s && s.mode !== null && s.booted, { mode: s && s.mode });
    const mus2 = await page.evaluate("performance.getEntriesByType('resource').filter((e) => /\\.mp3/.test(e.name)).map((e) => [e.name.replace(/^.*\\//, ''), e.responseStatus])");
    const runMus = await page.evaluate("(async () => { const A = await import('/hordes/src/audio.js'); const m = A.AUDIO_TEST && A.AUDIO_TEST.music && A.AUDIO_TEST.music(); return m ? { cur: m.cur, failed: m.failed } : null; })()");
    ok('the dropped run track gets 503 offline and its slot falls back (the synth)', dropped && mus2.some(([n, c]) => n === dropped && c === 503), { dropped, mus: mus2.filter(([n]) => n === dropped), music: runMus });
    page.server.setOffline(false);
    endFlow([/503|Failed to fetch|ServiceWorker|sw\.js/i]);

    // ---- C4 update with the notice
    startFlow('C4');
    await page.reload(); await waitVer(page, 'A');
    await page.evaluate(T_);
    await page.evaluate("(window.__sentinel = 'c4', true)");
    await sleep(3500);   // the page registers 3 s after its first frame
    await release('B');
    m0 = L.length;
    ok('reg.update() and B waits', (await update(page)) === 'ok' && (await waitWaiting(page)), await st(page));
    ok('the notice is visible on the title', await noticeShown(page), { mode: (await st(page)).mode });
    const fetched = [...new Set(L.slice(m0).map(rel).filter((r) => r !== null && !isMusic(r)))].sort();
    ok("B's install fetched only the delta: index.html, src/config.js, sw.js", J(fetched) === J(['index.html', 'src/config.js', 'sw.js']), fetched);
    s = await st(page);
    ok('the page is still A/A with its sentinel', vv(s) === 'A/A' && s.sentinel === 'c4', s);
    // placement, on the title
    const place = async (where, vps = [[390, 844], [844, 390], [1280, 720]]) => {
      const out = [];
      for (const [vw, vh] of vps) {
        await page.setViewport(vw, vh); await sleep(700);
        const r = await page.evaluate(`(() => {
          const n = document.getElementById('sw-update'); const b = n.getBoundingClientRect();
          const inside = b.left >= 0 && b.top >= 0 && b.right <= innerWidth && b.bottom <= innerHeight && b.width > 0;
          const hits = [];
          for (const id of ['ov-title', 'ov-sub']) {     // the overlay's first rows: a heading, the shop's BANK line
            const e = document.getElementById(id); if (!e) continue;
            const q = e.getBoundingClientRect(); const st = getComputedStyle(e);
            if (q.width < 2 || q.height < 2 || st.display === 'none' || st.visibility === 'hidden' || !e.textContent.trim()) continue;
            if (q.left < b.right && b.left < q.right && q.top < b.bottom && b.top < q.bottom) hits.push('#' + id + ' ' + [Math.round(q.left), Math.round(q.top), Math.round(q.width), Math.round(q.height)].join(','));
          }
          for (const e of document.querySelectorAll('button, [role=button], .btn, #ov-cards .card')) {
            if (e === n || n.contains(e)) continue;
            const q = e.getBoundingClientRect(); if (q.width < 2 || q.height < 2) continue;
            const cx = q.left + q.width / 2, cy = q.top + q.height / 2;
            if (cx < 0 || cy < 0 || cx >= innerWidth || cy >= innerHeight) continue;
            const st = getComputedStyle(e); if (st.visibility === 'hidden' || st.display === 'none') continue;
            const at = document.elementFromPoint(cx, cy);
            if (at && (at === n || n.contains(at))) hits.push(e.id || e.className || e.textContent.slice(0, 20));
            else hits.push(null);
          }
          return { inside, rect: [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)], buttons: hits.length, covered: hits.filter(Boolean), ov: document.getElementById('overlay').className };
        })()`);
        out.push({ vp: vw + 'x' + vh, ...r });
      }
      await page.setViewport(390, 844); await sleep(500);
      ok('placement (' + where + '): inside the viewport, never over a button or card centre or the #ov-title / #ov-sub rows, at ' + vps.map((v) => v.join('x')).join(', '), out.every((o) => o.inside && o.buttons > 0 && o.covered.length === 0), out);
    };
    const cardsUp = () => page.waitFor("[...document.querySelectorAll('#ov-cards .card')].some((e) => { const r = e.getBoundingClientRect(); return r.width > 10 && r.height > 10; })", 15000);
    await page.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");   // past the intro movie to the title cards
    ok('the title cards are up, the notice still shows', (await cardsUp()) && (await noticeShown(page)), { mode: (await st(page)).mode });
    await place('title');
    // the shop: its compact phone layout puts the BANK line (#ov-sub) at the very top
    const cardText = (re) => "(() => { const c = [...document.querySelectorAll('#ov-cards .card')].find((e) => " + re + ".test(e.textContent)); if (!c) return false; c.click(); return true; })()";
    const inShop = "!!document.querySelector('#ov-cards.shopgrid')";
    ok('the shop opens from the title, the notice still shows', (await page.evaluate(cardText('/^\\s*SHOP/'))) && (await page.waitFor(inShop, 10000)) && (await noticeShown(page)), { ov: await page.evaluate("document.getElementById('overlay').className") });
    await place('shop', [[844, 390], [390, 844]]);
    if (!(await page.evaluate(cardText('/BACK/')))) await page.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    ok('back from the shop to the title cards', (await page.waitFor('!' + inShop, 10000)) && (await cardsUp()));
    await page.evaluate('(window.__T.startRun(), true)');
    const god = () => page.evaluate('(() => { const p = window.__T.state.player; if (p) { p.hp = 1e9; p.maxHp = 1e9; } return true; })()');
    await sleep(1200); await god();
    const nav0 = page.navigations();
    ok('in a run the notice is hidden', !(await st(page)).notice, { mode: (await st(page)).mode });
    for (let i = 0; i < 10; i++) { await sleep(2000); await god(); }
    s = await st(page);
    ok('20 s in the run: no navigation, the sentinel survives, the notice stays hidden', page.navigations() === nav0 && s.sentinel === 'c4' && !s.notice, { navs: page.navigations() - nav0, mode: s.mode });
    await page.evaluate('(() => { const p = window.__T.state.player; if (p) p.hp = 0; try { window.__T.die && window.__T.die(); } catch (e) {} return true; })()');
    let back = await noticeShown(page, 15000);
    if (!back) { await page.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))"); back = await noticeShown(page, 10000); }
    ok('the run ended: the notice is back', back, { mode: (await st(page)).mode });
    if (!(await page.waitFor("window.__T.state.mode === 'dead'", 12000))) await page.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    ok('the end card is up, the notice shows', (await cardsUp()) && (await noticeShown(page)), { mode: (await st(page)).mode });
    await place('end card');
    const saves0 = (await ls(page, 'sw_test_saves')).length;
    const navA = page.navigations();
    await tapSel(page, '#sw-update');
    const toB = await waitVer(page, 'B', 30000);
    await sleep(1500);
    s = await st(page);
    ok('a real tap: exactly one navigation, B/B, caches [B, music]', toB && page.navigations() - navA === 1 && vv(s) === 'B/B' && J(s.caches) === J([rels.B.cache, 'hordes:/hordes/:music'].sort()), { navs: page.navigations() - navA, v: vv(s), caches: s.caches });
    ok('save() ran for the tap', (await ls(page, 'sw_test_saves')).length > saves0);
    endFlow();

    // ---- C5 a stale CDN refused
    startFlow('C5');
    await sleep(3500);
    const B_CONFIG = rels.B.config;
    await release('C');
    page.server.hook = (p, q) => (p === '/hordes/src/config.js' && !q ? B_CONFIG : null);
    ok('C installs past a stale edge (the ?v= try)', (await update(page)) === 'ok' && (await waitWaiting(page)), (await st(page)).reg);
    const cconf = await page.evaluate("(async () => { const r = await (await caches.open(" + J(rels.C.cache) + ")).match('/hordes/src/config.js'); return r ? (await r.text()).slice(-40) : null; })()");
    ok("C's cache holds C's config.js", cconf && cconf.includes("__swTestVer = 'C'"), cconf);
    ok('the stale edge was asked first, then ?v=C', L.some((e) => e.path === '/hordes/src/config.js' && !e.query) && L.some((e) => e.path === '/hordes/src/config.js' && e.query === 'v=' + rels.C.version));
    await noticeShown(page);
    await tapSel(page, '#sw-update');
    ok('the tap takes C: C/C', await waitVer(page, 'C', 30000), vv(await st(page)));
    await sleep(3500);
    page.server.hook = (p) => (p === '/hordes/src/config.js' ? B_CONFIG : null);
    await release('D');
    await update(page);
    await waitSettled(page, 30000); await sleep(1000);
    s = await st(page);
    ok('every edge stale: D fails, nothing waits, no notice', s.reg && !s.reg.waiting && !s.reg.installing && !s.notice && !s.caches.includes(rels.D.cache), { reg: s.reg, notice: s.notice, caches: s.caches });
    await page.reload(); await waitBoot(page); await sleep(1500);
    s = await st(page);
    ok('after a reload the page stays C/C', vv(s) === 'C/C', vv(s));
    const cv = rels.C.version;
    ok('the tree back to C gives the same VERSION (deterministic)', (await release('C')).version === cv);
    page.server.hook = null;
    endFlow();

    // ---- C6 a player who only reloads
    startFlow('C6');
    await page.reload(); await waitVer(page, 'C'); await sleep(3500);
    await release('E');
    await update(page);
    ok('E waits', await waitWaiting(page));
    await page.evaluate("(sessionStorage.removeItem('sw_test_msgs'), sessionStorage.removeItem('hordes_sw_auto'), true)");
    let nv = page.navigations();
    await page.reload();
    const toE = await waitVer(page, 'E', 30000);
    await sleep(2000);
    const msgs = await ls(page, 'sw_test_msgs', 'sessionStorage');
    ok('untouched F5: exactly 2 navigations, UPDATING… seen, ends on E/E', toE && page.navigations() - nv === 2 && msgs.includes('UPDATING\u2026'), { navs: page.navigations() - nv, msgs, v: vv(await st(page)) });
    await sleep(2000);
    await release('G');
    await update(page);
    ok('G waits', await waitWaiting(page));
    await page.evaluate("(localStorage.setItem('sw_test_noauto', '1'), true)");
    nv = page.navigations();
    await page.reload(); await waitBoot(page);
    const shown = await noticeShown(page, 10000);
    s = await st(page);
    ok('with the guard set: one navigation, still E/E, the notice', page.navigations() - nv === 1 && vv(s) === 'E/E' && shown, { navs: page.navigations() - nv, v: vv(s), notice: shown });
    endFlow();

    // ---- C7 two tabs (X = E, Y = G)
    startFlow('C7');
    const tab2 = await page.newTab('hordes/?sw=on');
    const b2 = await waitVer(tab2, 'E', 30000);
    await sleep(3500);
    ok('tab 2 booted on E with G waiting and shows the notice', b2 && (await noticeShown(tab2)), vv(await st(tab2)));
    await tab2.evaluate("(window.__sentinel = 'tab2', true)");
    await page.bringToFront();
    const nav1 = page.navigations(), nav2 = tab2.navigations();
    await tapSel(page, '#sw-update');
    ok('a real tap in tab 1: tab 1 becomes G/G', await waitVer(page, 'G', 30000), vv(await st(page)));
    await sleep(1500);
    let s2 = await st(tab2);
    ok('tab 2 did not reload, is controlled by the G worker, shows the notice, still E/E', tab2.navigations() === nav2 && s2.sentinel === 'tab2' && s2.reg && s2.reg.controllerIsActive && !s2.reg.waiting && s2.notice && vv(s2) === 'E/E', { navs: tab2.navigations() - nav2, s2 });
    await tab2.bringToFront();
    await tapSel(tab2, '#sw-update');
    ok('a tap in tab 2 is a plain reload to G/G', (await waitVer(tab2, 'G', 30000)) && tab2.navigations() - nav2 === 1, { navs: tab2.navigations() - nav2, v: vv(await st(tab2)) });
    ok('tab 1 never navigated more than once', page.navigations() - nav1 === 1);
    await tab2.close();
    await page.bringToFront();
    endFlow();

    // ---- C8 a page loading while another tab takes the update (G1)
    startFlow('C8');
    await sleep(3500);
    await release('I');
    await update(page);
    ok('I waits; tab 1 booted on G', (await waitWaiting(page)) && vv(await st(page)) === 'G/G');
    await noticeShown(page);
    // Keep tab 2 loading: its worker (G) has no config.js, so the request reaches the server, which holds it 2 s.
    await page.evaluate("(async () => (await caches.open(" + J(rels.G.cache) + ")).delete('/hordes/src/config.js'))()");
    page.server.hook = (p, q, n) => (p === '/hordes/src/config.js' && n === 0 ? { delayMs: 2000 } : null);
    const cfgN = L.filter((e) => e.path === '/hordes/src/config.js').length;
    await page.evaluate("(localStorage.removeItem('sw_test_boots'), true)");
    const tab3 = await page.newTab('hordes/?sw=on', { wait: false });
    let loading = false;
    for (let i = 0; i < 60 && !loading; i++) { if (L.filter((e) => e.path === '/hordes/src/config.js').length > cfgN) loading = true; else await sleep(50); }
    ok('tab 2 is held loading on src/config.js', loading);
    await page.bringToFront();
    await tapSel(page, '#sw-update');
    const t1I = await waitVer(page, 'I', 30000);
    await tab3.bringToFront();   // a hidden tab never reaches its first frame
    const t3I = await waitVer(tab3, 'I', 30000);
    await sleep(1500);
    const boots = await ls(page, 'sw_test_boots');
    const boots3 = await ls(tab3, 'sw_test_boots', 'sessionStorage');
    const vis = [await page.evaluate('document.visibilityState'), await tab3.evaluate('document.visibilityState')];
    ok('tab 2 reloads before its first frame and ends I/I; no boot ever mixed versions', t1I && t3I && boots.concat(boots3).every((b) => b.meta === b.ver) && boots3.length === 1 && tab3.navigations() >= 2,
      { t1I, t3I, boots: boots.map((b) => b.meta + '/' + b.ver), tab2boots: boots3.map((b) => b.meta + '/' + b.ver), tab2navs: tab3.navigations(), vis });
    const s3 = await st(tab3);
    ok('tab 2 ends controlled, I/I', s3.controlled && vv(s3) === 'I/I', vv(s3));
    page.server.hook = null;
    await tab3.close();
    await page.bringToFront();
    endFlow();

    // ---- C9 recovery
    startFlow('C9');
    const box = "(() => { const b = document.getElementById('boot-msg'); return b && !b.hidden && b.className === 'tap' ? b.textContent : null; })()";
    const failText = 'HORDES DIDN\u2019T LOAD. IT MAY HAVE JUST UPDATED. TAP TO RELOAD';
    const reloadTo = async (cond, max = 3) => { for (let i = 0; i < max; i++) { await page.reload(); await sleep(2500); if (await page.evaluate(cond).catch(() => false)) return i + 1; } return 0; };
    const tapBox = async () => { await page.tap(195, 422); };
    // (a) a broken worker (URGENT), then a fix
    await sleep(3500);
    await release('BRK', { urgent: true, mutate: BROKEN });
    let loads = await reloadTo(box + ' === ' + J(failText));
    ok('(a) a broken worker: the failure screen, not a black page', loads > 0, { loads, box: await page.evaluate(box).catch(() => null) });
    await release('F');
    await page.reload(); await sleep(2500);
    const fw = await waitWaiting(page, 30000);
    ok('(a) F served, reload: the failure screen again and F waits', fw && (await page.evaluate(box)) === failText, { reg: (await st(page)).reg });
    await tapBox();
    ok('(a) a real tap on the box: F/F', await waitVer(page, 'F', 30000), vv(await st(page)));
    // (b) the same broken worker, no fix
    await sleep(3500);
    await release('BRK2', { urgent: true, mutate: BROKEN });
    loads = await reloadTo(box + ' === ' + J(failText));
    ok('(b) broken again: the failure screen', loads > 0, { loads });
    await release('J');   // what the network serves after the tap (the broken worker is still the active one)
    const mb = L.length;
    await tapBox();
    const bootedJ = await waitVer(page, 'J', 30000);
    const bootAt = await page.evaluate('window.__swBoot.at');
    const regAtBoot = await page.evaluate('navigator.serviceWorker.getRegistration().then((r) => !!r)');
    await sleep(4500);
    const after = L.slice(mb);
    const swReq = after.find((e) => e.path === '/hordes/sw.js');
    ok('(b) the tap drops the offline copy: src/ from the network, the page boots', bootedJ && after.some((e) => e.path.startsWith('/hordes/src/')), { srcRequests: after.filter((e) => e.path.startsWith('/hordes/src/')).length });
    ok('(b) no registration until 3 s after boot', !regAtBoot && swReq && swReq.t >= bootAt + 2900, { regAtBoot, swAfterMs: swReq && Math.round(swReq.t - bootAt) });
    // (c) the kill switch, from a healthy controlled page
    await waitActive(page, 'J', 30000);
    await page.reload(); await waitVer(page, 'J');
    ok('(c) a healthy controlled page (J)', (await st(page)).controlled);
    put('sw.js', fs.readFileSync(path.join(ROOT, 'tools/sw_killswitch.js')));
    await page.reload(); await sleep(3000);
    await page.reload(); await waitBoot(page);
    const killed = await page.waitFor("(async () => !(await navigator.serviceWorker.getRegistration()) && !(await caches.keys()).some((k) => k.startsWith('hordes:')))()", 20000, 250);
    const mk = L.length; await page.reload(); await waitBoot(page);
    ok('(c) kill switch: no registration, no hordes: caches, the page boots from the network', killed && L.slice(mk).some((e) => e.path === '/hordes/src/main.js'), await st(page));
    const gone = [];
    for (let i = 0; i < 2; i++) {     // past the +3 s register() of each load: the kill switch must not be revived
      await sleep(4500);
      const g = await page.waitFor("navigator.serviceWorker.getRegistration().then((r) => !r)", 10000, 250);
      gone.push({ gone: g, controlled: (await st(page)).controlled });
      await page.reload(); await waitBoot(page);
    }
    await sleep(1500);
    gone.push({ uncontrolled: !(await st(page)).controlled });
    ok('(c) kill switch: still unregistered after each load\'s own register(), the next loads uncontrolled', gone.every((x) => x.gone !== false && x.uncontrolled !== false), gone);
    // (d) URGENT, from X active
    await release('X');
    await page.reload(); await waitVer(page, 'X');
    ok('(d) X installs and activates', await waitActive(page, 'X', 30000));
    await page.reload(); await waitVer(page, 'X');
    ok('(d) X controls the page', (await st(page)).controlled);
    await sleep(3500);
    await release('U', { urgent: true });
    nv = page.navigations();
    await page.reload();
    const uAct = await waitActive(page, 'U', 30000);
    await waitBoot(page); await sleep(1500);
    s = await st(page);
    const viaNotice = vv(s) === 'X/X' && (await noticeShown(page, 5000));
    const viaG1 = vv(s) === 'U/U';
    ok('(d) URGENT U activates with no tap; the open page shows the notice (or, still loading, reloaded to U)', uAct && (viaNotice || viaG1), { v: vv(s), notice: s.notice, navs: page.navigations() - nv });
    if (!viaG1) { await page.reload(); }
    ok('(d) the next load is U/U (at most two loads after the fix was served)', (await waitVer(page, 'U', 30000)) && page.navigations() - nv <= 2, { navs: page.navigations() - nv });
    endFlow([/500|Failed to load module|ServiceWorker|sw\.js|MIME|Failed to fetch dynamically/i]);
  });
}

// ---------------------------------------------------------------- C10: a cross-site iframe (galaxy.click)
async function c10() {
  FLOW = 'C10'; console.log('-- C10');
  await release('K');
  const host = '<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#ffffff}header{height:60px;background:#22aa44}iframe{display:block;border:0;width:100%;height:calc(100vh - 60px)}</style>' +
    '<header></header><iframe id="g" allow="autoplay; fullscreen"></iframe>' +
    "<script>document.getElementById('g').src = 'http://localhost:' + location.port + '/hordes/?sw=on';</script>";
  await withPage({ root: T, url: 'host.html', extra: { '/host.html': host }, w: 844, h: 390, dpr: 1, startupScript: STARTUP, userGesture: false, timeoutMs: 60000 }, async (page) => {
    const L = page.server.log;
    const paints = async (name) => {
      await sleep(5000);
      const f = await page.shot('sw_c10_' + name);
      const pts = {}; for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) pts['p' + i + j] = [100 + i * 200, 110 + j * 100];
      const r = await page.readShot(f, pts);
      const cols = new Set(Object.values(r.px).map((c) => c.join(',')));
      return { painted: cols.size >= 2 && !cols.has('255,255,255'), colours: cols.size };
    };
    const p1 = await paints('online');
    ok('the game paints in the cross-site frame', p1.painted, p1);
    await sleep(4000);
    const swSeen = L.some((e) => e.path === '/hordes/sw.js');
    let m0 = L.length;
    await page.reload(); await sleep(6000);
    m0 = L.length;
    await page.reload(); await sleep(6000);
    const filesNet = L.slice(m0).map(rel).filter((r) => r && rels.K.files.has(r));
    const served = swSeen && filesNet.length === 0;
    page.server.setOffline((p) => p.startsWith('/hordes/'));
    await page.reload();
    const p2 = await paints('offline');
    page.server.setOffline(false);
    const verdict = served && p2.painted ? 'served offline by a partitioned worker' : 'refused';
    ok('frame worker: ' + verdict + ' (refused passes while the frame paints online)', p1.painted && (verdict === 'refused' || p2.painted), { swRequested: swSeen, filesFromNetworkOnThirdLoad: filesNet.length, offline: p2 });
    const e = page.errors.filter((x) => !/Failed to fetch|503|ServiceWorker|sw\.js|net::/i.test(x));
    ok('0 page and console errors', e.length === 0, e.slice(0, 5));
  });
  for (const [label, script] of [
    ['a throwing navigator.serviceWorker getter', "try { Object.defineProperty(Navigator.prototype, 'serviceWorker', { configurable: true, get() { throw new Error('denied'); } }); } catch (e) {}"],
    ['a register that rejects', "try { ServiceWorkerContainer.prototype.register = function () { return Promise.reject(new Error('refused')); }; } catch (e) {}"],
  ]) {
    await withPage({ root: T, url: 'hordes/?sw=on', startupScript: STARTUP + '\n' + script, userGesture: false, timeoutMs: 60000 }, async (page) => {
      const b = await waitVer(page, 'K', 30000);
      await sleep(5000);
      const s = await page.evaluate("({ notice: !!document.getElementById('sw-update'), mode: (window.__swBoot || {}).ver })");
      ok('refused (' + label + '): the game boots, no notice, 0 errors', b && !s.notice && page.errors.length === 0, { s, errors: page.errors.slice(0, 3) });
    });
  }
}

// ---------------------------------------------------------------- C11: the dev default
async function c11() {
  FLOW = 'C11'; console.log('-- C11');
  await withPage({ timeoutMs: 60000 }, async (page) => {
    const b = await page.waitFor("(() => { const e = document.getElementById('boot-msg'); return !!(e && e.hidden); })()", 30000);
    await sleep(6000);
    const reg = await page.evaluate('navigator.serviceWorker.getRegistration().then((r) => !!r)');
    ok('a plain withPage (no sw=on): boots, no sw.js request, no registration', b && !page.server.log.some((e) => e.path.endsWith('/sw.js')) && !reg, { reg });
    ok('0 page and console errors', page.errors.length === 0, page.errors.slice(0, 3));
  });
  if (argv.includes('--no-others')) { console.log('  (the four existing verifiers were skipped: --no-others)'); return; }
  for (const v of ['verify_boot_title.mjs', 'verify_g12_title.mjs', 'verify_host_fit.mjs', 'verify_music.mjs']) {
    const t0 = Date.now();
    const code = await new Promise((res) => {
      const p = spawn(process.execPath, [path.join(ROOT, 'tools', v)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '';
      p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
      p.on('close', (c) => { fs.writeFileSync(path.join(T, v + '.log'), out); res({ c, tail: out.trim().split(/\r?\n/).slice(-2).join(' | ') }); });
    });
    ok(v + ' passes unchanged', code.c === 0, { secs: Math.round((Date.now() - t0) / 1000), tail: code.tail.slice(0, 240) });
  }
}

// ---------------------------------------------------------------- L1: the live check against the local copy
async function l1() {
  FLOW = 'L1'; console.log('-- L1 (the --live check, run against the local copy)');
  const r = await release('L');
  const srv = await serveRoot(T);
  try {
    const res = await liveCheck('http://127.0.0.1:' + srv.port + '/hordes/?sw=on', r.version, { once: true });
    ok('--live passes on a matching tree', res.pass, res.problems);
    fs.writeFileSync(path.join(H, 'src/config.js'), ORIG_CONFIG + '\r\n// drift\r\n');
    const bad = await liveCheck('http://127.0.0.1:' + srv.port + '/hordes/?sw=on', r.version, { once: true });
    ok('--live names a file that differs', !bad.pass && bad.problems.some((p) => p.includes('src/config.js')), bad.problems);
  } finally { srv.close(); }
}

const t0 = Date.now();
try {
  if (['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9'].some(want)) await mainFlows();
  if (want('C10')) await c10();
  if (want('C11')) await c11();
  if (!ONLY.length || ONLY.includes('L1')) await l1();
} catch (e) {
  ok('the verifier ran to the end', false, String(e && e.stack || e).split('\n').slice(0, 4).join(' / '));
} finally {
  try { fs.rmSync(T, { recursive: true, force: true }); } catch { /* temp */ }
}
const fails = results.filter((r) => !r.pass);
console.log('\nverify_sw: ' + (results.length - fails.length) + '/' + results.length + ' checks passed in ' + Math.round((Date.now() - t0) / 1000) + ' s' + (fails.length ? '; FAILED: ' + fails.map((f) => f.flow + ' ' + f.name).join(' | ') : ''));
process.exit(fails.length ? 1 : 0);
