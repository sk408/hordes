// HORDES - REAL-BROWSER PROBE HARNESS (G9 visual verification + W10 publish checks).
//
// Why this exists: the standing rule says a code claim is not evidence for anything a
// player looks at, and the 11:10 tick recorded the trophy screen as UNVERIFIED because
// "no browser on this host". There IS one - Chrome for Testing ships in the playwright
// cache - so this drives it over CDP, serves the project over http (ES modules need a
// real origin), takes a PHONE-sized screenshot, and then READS THAT PNG BACK pixel by
// pixel. The screenshot is the artifact; the pixel samples are the evidence.
//
// withPage({w,h,dpr}, fn) -> fn({ evaluate, waitFor, shot, readShot, click, errors })
//   evaluate(expr)          run JS in the live page, awaited, returned by value
//   waitFor(expr, ms)       poll an expression until truthy
//   shot(name)              Page.captureScreenshot -> <SHOT_DIR>/<name>.png
//   readShot(path, samples) decode that PNG in-page, sample it, return { label: [r,g,b] }
//   click(x, y)             real composited left click at CSS-pixel x,y
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SHOT_DIR = process.env.HORDES_SHOT_DIR || '/tmp/hordes-shots';
const CHROME = process.env.HORDES_CHROME || path.join(os.homedir(),
  '.cache/ms-playwright/chromium-1243/chrome-linux64/chrome');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

export async function serveRoot(root = ROOT, extra = {}) {
  const srv = http.createServer((req, res) => {
    const rel = decodeURIComponent(String(req.url).split('?')[0]);
    // HOST-PAGE SIMULATION (verify_host_fit.mjs): extra maps a served path to
    // inline HTML — a page that embeds the game in an iframe under a header,
    // the galaxy.click scenario, without writing a file into the repo.
    if (Object.prototype.hasOwnProperty.call(extra, rel)) {
      res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' });
      return res.end(extra[rel]);
    }
    const f = path.join(root, rel === '/' ? 'index.html' : rel);
    let st = null;
    try { st = fs.statSync(f); } catch { /* 404 below */ }
    if (!f.startsWith(root) || !st || st.isDirectory()) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { port: srv.address().port, close: () => srv.close() };
}

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.session = null; this.pending = new Map(); this.errors = [];
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { res, rej } = this.pending.get(m.id); this.pending.delete(m.id);
        if (m.error) rej(new Error('CDP ' + JSON.stringify(m.error))); else res(m.result);
        return;
      }
      if (m.method === 'Runtime.exceptionThrown') {
        const e = m.params && m.params.exceptionDetails;
        this.errors.push('uncaught: ' + ((e && e.exception && e.exception.description) || (e && e.text) || '?'));
      }
      if (m.method === 'Runtime.consoleAPICalled' && m.params && m.params.type === 'error') {
        this.errors.push('console.error: ' + (m.params.args || []).map((a) => a.value || a.description || '').join(' '));
      }
    });
  }
  send(method, params, sessionId) {
    const id = ++this.id;
    const sid = sessionId === undefined ? this.session : sessionId;
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params: params || {}, ...(sid ? { sessionId: sid } : {}) }));
    });
  }
}

export async function withPage(opts, fn) {
  const { w = 390, h = 844, dpr = 3, mobile = true, url = 'index.html', skipTour = true,
    // FIRST-RUN PROLOGUE neutralization (the _harness.mjs / real_loop.mjs
    // convention, 2026-09-18): a fresh browser profile's run #1 opens the
    // choreographed prologue, and since the addendum (the pilot PAUSES at
    // banners until OK) an unattended run STALLS at banner #1 — every
    // ordinary-run verifier would hang on its first waitFor. Default: seed a
    // settled profile (achievements.totals.runs = 1, the same stamp
    // verify_blocking_elevation / verify_help_clearance apply in-page) BEFORE
    // the page's own scripts run. The seed is a valid current-version payload
    // (version 8, sparse fields filled by validation), never clobbers a
    // profile the verifier seeded itself, and verify_prologue.mjs opts out
    // with skipPrologue: false — the phase is ITS subject.
    skipPrologue = true,
    startupScript = '', timeoutMs = 30000 } = opts || {};
  if (!fs.existsSync(CHROME)) throw new Error('no chrome binary at ' + CHROME);
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const srv = await serveRoot(ROOT, opts.extra || {});
  const dir = fs.mkdtempSync('/tmp/hordes-chrome-');
  const args = ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio',
    '--user-data-dir=' + dir, '--remote-debugging-port=0', 'about:blank'];
  const proc = spawn(CHROME, args, { stdio: 'ignore' });
  let cdp = null;
  try {
    const portFile = path.join(dir, 'DevToolsActivePort');
    const t0 = Date.now();
    while (!fs.existsSync(portFile)) {
      if (Date.now() - t0 > timeoutMs) throw new Error('chrome never wrote DevToolsActivePort');
      await sleep(100);
    }
    const port = fs.readFileSync(portFile, 'utf8').split('\n')[0].trim();
    const ver = await (await fetch('http://127.0.0.1:' + port + '/json/version')).json();
    const ws = new WebSocket(ver.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.addEventListener('open', res, { once: true });
      ws.addEventListener('error', rej, { once: true });
    });
    cdp = new CDP(ws);
    const tgt = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const att = await cdp.send('Target.attachToTarget', { targetId: tgt.targetId, flatten: true });
    cdp.session = att.sessionId;
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile });
    if (mobile) await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

    // Flags the page must see BEFORE its own scripts run: the first-run tour covers the
    // screen (z-index 50) and would ruin every screenshot, so mark every stage as seen.
    const pre = [];
    if (skipTour) pre.push("for (const k of ['stage1','hud','pilot','focus','stance','move','skills']) { try { localStorage.setItem('hordes_tour_' + k, '1'); } catch (e) {} }");
    // v9: the seeded settle-stamp also carries lastPlayed = now, so the harness
    // profile reads as an ACTIVE player — the What's-New launch note (gated on
    // lastPlayed predating the current release) must not pop in every verifier.
    if (skipPrologue) pre.push("try { if (!localStorage.getItem('hordes_profile_v1')) localStorage.setItem('hordes_profile_v1', JSON.stringify({ version: 8, lastPlayed: Date.now(), achievements: { totals: { runs: 1 } } })); } catch (e) {}");
    if (startupScript) pre.push(startupScript);
    if (pre.length) await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: pre.join('\n') });

    await cdp.send('Page.navigate', { url: 'http://127.0.0.1:' + srv.port + '/' + url });

    const evaluate = async (expression, awaitPromise) => {
      const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: awaitPromise !== false,
        returnByValue: true, userGesture: true });
      if (r.exceptionDetails) {
        const e = r.exceptionDetails;
        const d = (e.exception && e.exception.description) || e.text || 'evaluate failed';
        throw new Error('page threw: ' + String(d).split('\n')[0]);
      }
      return r.result.value;
    };
    const waitFor = async (expr, ms, step) => {
      const lim = ms || 8000; const st = step || 100; const t = Date.now();
      for (;;) {
        try { if (await evaluate(expr)) return true; } catch (e) { /* keep polling */ }
        if (Date.now() - t > lim) return false;
        await sleep(st);
      }
    };
    const shot = async (name) => {
      const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
      const f = path.join(SHOT_DIR, name + '.png');
      fs.writeFileSync(f, Buffer.from(r.data, 'base64'));
      return f;
    };
    // READ THE SCREENSHOT: decode the captured PNG inside the page, sample named points.
    const readShot = async (file, samples) => {
      const b64 = fs.readFileSync(file).toString('base64');
      const src = "(async () => {\n" +
        "  const img = await createImageBitmap(await (await fetch('data:image/png;base64," + b64 + "')).blob());\n" +
        "  const c = new OffscreenCanvas(img.width, img.height);\n" +
        "  const g = c.getContext('2d'); g.drawImage(img, 0, 0);\n" +
        "  const out = { w: img.width, h: img.height, px: {} };\n" +
        "  const sx = img.width / " + w + ", sy = img.height / " + h + ";\n" +
        "  const spec = " + JSON.stringify(samples) + ";\n" +
        "  for (const label of Object.keys(spec)) {\n" +
        "    const pt = spec[label];\n" +
        "    const d = g.getImageData(Math.round(pt[0] * sx), Math.round(pt[1] * sy), 1, 1).data;\n" +
        "    out.px[label] = [d[0], d[1], d[2]];\n" +
        "  }\n" +
        "  return out;\n" +
        "})()";
      return evaluate(src, true);
    };
    const click = async (x, y) => {
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 });
    };
    // A REAL finger tap: pointerdown -> pointerup -> click is what the game's own
    // overlay handlers and its cinematic gesture guard are written against.
    // radius (CSS px, default 8) is the touch disc: Chromium hit-tests by the
    // disc, so a point whose disc overlaps a neighbouring control hands the
    // touch to THAT control before any game handler runs (2026-09-18, the fs
    // hit-box right edge 6 CSS px from the right pad's W at 844x390). A
    // centre-point tap (iOS's hit-test) is tap(x, y, 1).
    const tap = async (x, y, radius = 8) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, radiusX: radius, radiusY: radius, force: 1 }] });
      await sleep(40);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    // A REAL drag/swipe through the same touch pipeline: touchStart at (x,y0),
    // stepped touchMoves to (x+dx, y0+dy), touchEnd. The browser's own scroll
    // physics engage (this is how a thumb flicks a list); steps keep the
    // gesture continuous so it is never read as a jump. Positive dy = downward
    // drag (scrolls up); negative dy = upward flick (scrolls down the list).
    const swipe = async (x, y0, dx, dy, steps = 6) => {
      const pt = (t) => ({ x: Math.round(x + dx * t), y: Math.round(y0 + dy * t), force: 1 });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(0)] });
      for (let i = 1; i <= steps; i++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt(i / steps)] });
        await sleep(16);
      }
      await sleep(30);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await sleep(220);   // let inertial scrolling settle
    };
    const rectOf = (sel) => evaluate("(() => { const e = document.querySelector(" + JSON.stringify(sel) +
      "); if (!e) return null; const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, r.width, r.height]; })()");
    const api = { evaluate, waitFor, shot, readShot, click, tap, swipe, rectOf, sleep, port: srv.port, viewport: { w, h, dpr } };
    Object.defineProperty(api, 'errors', { get: () => cdp.errors });
    return await fn(api);
  } finally {
    try { if (cdp) cdp.ws.close(); } catch (e) {}
    try { proc.kill('SIGKILL'); } catch (e) {}
    try { srv.close(); } catch (e) {}
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
  }
}
