// SERVICE WORKER MANIFEST (R4, docs/CHECKPOINT.md "How a release is made"): sw.js's GENERATED
// block must match the tree, list exactly the precache rule's files, and name only files that
// GitHub Pages serves with the same bytes. A stale block means every player's install fails or
// serves an old file, so the suite goes red: run node tools/gen_sw.mjs.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  ROOT, KILL_MARK, MUSIC_RE, FORBIDDEN, build, split, fileHash, parseBlock, staleReport,
} from '../tools/gen_sw.mjs';

let passed = 0;
const check = (label, fn) => {
  try { fn(); } catch (err) { console.error('  FAIL ' + label); throw err; }
  passed++; console.log('  ok - ' + label);
};
const assert = (c, m) => { if (!c) throw new Error(m); };
const sha = (b) => createHash('sha256').update(b).digest('hex');
const read = (p) => fs.readFileSync(path.join(ROOT, p));

// ---- 1. sw.js exists, one GENERATED block, or exactly the kill switch ----
const swText = fs.existsSync(path.join(ROOT, 'sw.js')) ? read('sw.js').toString('utf8') : null;
check('1 sw.js exists', () => assert(swText !== null, 'sw.js is missing: never delete it (docs/CHECKPOINT.md)'));
const KILL = swText.includes(KILL_MARK);
if (KILL) {
  check('1 the kill switch is tools/sw_killswitch.js exactly', () => {
    const norm = (s) => s.replace(/\r\n/g, '\n');
    assert(norm(swText) === norm(read('tools/sw_killswitch.js').toString('utf8')), 'sw.js has the kill mark but differs from tools/sw_killswitch.js');
  });
  console.log('KILL SWITCH LIVE (sw.js is tools/sw_killswitch.js): the staleness, sensitivity and seam checks are skipped');
} else {
  check('1 exactly one GENERATED block', () => { split(swText); });
}

const r = KILL ? null : await build(ROOT);
const block = KILL ? null : parseBlock(split(swText).block);

// ---- 2. not stale ----
if (!KILL) {
  check('2 sw.js is current with the tree', () => {
    assert(r.current, 'sw.js STALE: run node tools/gen_sw.mjs\n' + staleReport(r).join('\n'));
  });
}

// ---- 3. the list rules ----
if (!KILL) {
  check('3 FILES = index.html, manifest, src/** and assets/** minus music and *.md (walked here independently)', () => {
    const want = ['index.html', 'manifest.webmanifest'];
    const walk = (d) => {
      const abs = path.join(ROOT, d); if (!fs.existsSync(abs)) return;
      for (const n of fs.readdirSync(abs)) {
        const p = d + '/' + n;
        if (fs.statSync(path.join(ROOT, p)).isDirectory()) walk(p); else want.push(p);
      }
    };
    walk('src'); walk('assets');
    const exp = want.filter((p) => !/^assets\/music\//.test(p) && !/\.md$/.test(p)).sort();
    const got = Object.keys(block.FILES);
    assert(JSON.stringify(got) === JSON.stringify(exp), 'FILES keys differ from the precache rule: ' +
      JSON.stringify({ missing: exp.filter((p) => !got.includes(p)), extra: got.filter((p) => !exp.includes(p)) }));
  });
  check('3 nothing forbidden, no Jekyll-dropped segment, plain path characters', () => {
    for (const p of Object.keys(block.FILES)) {
      assert(!FORBIDDEN.test(p), 'forbidden path in FILES: ' + p);
      assert(!p.split('/').some((s) => /^[_.#~]/.test(s)), 'Jekyll would drop ' + p + ' (a segment starting with _ . # ~)');
      assert(/^[A-Za-z0-9._/-]+$/.test(p), 'path with unusual characters: ' + p);
    }
  });
}

// ---- 4. the hash rule ----
check('4 fileHash: CRLF and LF text hash the same; a lone CR stays; a .png is not normalised', () => {
  assert(fileHash('a.js', Buffer.from('x\r\ny\r\n')) === fileHash('a.js', Buffer.from('x\ny\n')), 'CRLF != LF for .js');
  assert(fileHash('a.js', Buffer.from('a\rb')) !== fileHash('a.js', Buffer.from('ab')), 'a lone CR was dropped');
  assert(fileHash('a.png', Buffer.from('x\r\ny')) !== fileHash('a.png', Buffer.from('x\ny')), '.png was normalised');
  assert(fileHash('a.png', Buffer.from('x\r\ny')) === sha(Buffer.from('x\r\ny')), '.png hash is not the raw SHA-256');
});

// ---- 5. in git, with the bytes Pages serves ----
const files = KILL ? [] : Object.keys(block.FILES);
const git = spawnSync('git', ['--version'], { cwd: ROOT });
if (git.status !== 0 || !fs.existsSync(path.join(ROOT, '.git'))) {
  console.log('  (git unavailable: the tracked-files check is skipped)');
} else if (!KILL) {
  check('5 every FILES path is tracked by git (Pages would 404 it and every install would fail)', () => {
    const tracked = new Set(execFileSync('git', ['ls-files', '-z', '--', ...files], { cwd: ROOT }).toString('utf8').split('\0').filter(Boolean));
    const un = files.filter((p) => !tracked.has(p));
    assert(un.length === 0, 'untracked precached file(s): ' + un.join(', ') + ': git add it or delete it');
  });
  check('5 every unchanged FILES path has the bytes of its HEAD blob', () => {
    const dirty = new Set(execFileSync('git', ['diff', '--name-only', 'HEAD', '--', ...files], { cwd: ROOT }).toString('utf8').split(/\r?\n/).filter(Boolean));
    const clean = files.filter((p) => !dirty.has(p));
    const out = execFileSync('git', ['cat-file', '--batch'], { cwd: ROOT, input: clean.map((p) => 'HEAD:' + p).join('\n') + '\n', maxBuffer: 64 << 20 });
    let i = 0; const bad = [];
    for (const p of clean) {
      const nl = out.indexOf(10, i); const head = out.subarray(i, nl).toString('utf8').split(' ');
      assert(head[1] === 'blob', 'git cat-file: ' + head.join(' ') + ' for ' + p);
      const size = Number(head[2]); const blob = out.subarray(nl + 1, nl + 1 + size); i = nl + 1 + size + 1;
      // The worker hashes what Pages serves (the blob) with the same rule: text is LF-normalised.
      if (fileHash(p, blob) !== block.FILES[p]) bad.push(p);
    }
    assert(bad.length === 0, 'the worktree differs from the HEAD blob for: ' + bad.join(', '));
    console.log('    (' + clean.length + ' clean files compared with git, ' + dirty.size + ' changed locally)');
  });
}

// ---- 6. music ----
if (!KILL) {
  const { MUSIC_TRACKS } = await import('../src/music_manifest.js');
  check('6 MUSIC equals the sorted MUSIC_TRACKS urls', () => {
    const want = Object.values(MUSIC_TRACKS).map((t) => t.url).sort();
    assert(JSON.stringify(block.MUSIC) === JSON.stringify(want), 'MUSIC differs from src/music_manifest.js');
  });
  check('6 every music name matches <slot>.<hash8>.mp3, exists and has that hash; none in FILES', () => {
    for (const u of block.MUSIC) {
      const m = MUSIC_RE.exec(u); assert(m, 'bad music name ' + u);
      assert(fs.existsSync(path.join(ROOT, u)), 'missing ' + u);
      assert(sha(read(u)).slice(0, 8) === m[1], u + ' does not match its name');
      assert(!(u in block.FILES), u + ' is precached');
    }
  });
}

// ---- 7. sensitivity, on temporary mini trees ----
if (!KILL) {
  const tmps = [];
  const mini = (eol = '\n', tweak = null) => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'hordes-swman-')); tmps.push(d);
    const mp3 = Buffer.from('ID3 fake mp3 bytes for the manifest test');
    const name = 'assets/music/title.' + sha(mp3).slice(0, 8) + '.mp3';
    const t = {
      'index.html': '<!doctype html>\n<script type="module" src="src/a.js"></script>\n',
      'manifest.webmanifest': '{ "start_url": "./" }\n',
      'src/a.js': "import './music_manifest.js';\nexport const A = 1;\n",
      'src/music_manifest.js': "export const MUSIC_TRACKS = {\n  title: { url: '" + name + "', kind: 'loop' },\n};\n",
      'sw.js': read('sw.js').toString('utf8').replace(/\r\n/g, '\n'),
    };
    if (tweak) tweak(t);
    for (const [p, s] of Object.entries(t)) {
      fs.mkdirSync(path.dirname(path.join(d, p)), { recursive: true });
      fs.writeFileSync(path.join(d, p), s.replace(/\n/g, eol));
    }
    fs.mkdirSync(path.join(d, 'assets/music'), { recursive: true });
    fs.writeFileSync(path.join(d, name), mp3);
    return d;
  };
  try {
    const base = await build(mini());
    const one = await build(mini('\n', (t) => { t['src/a.js'] = t['src/a.js'].replace('A = 1', 'A = 2'); }));
    check('7 one changed byte in src/a.js changes its hash line and VERSION', () => {
      const h0 = Object.fromEntries(base.files), h1 = Object.fromEntries(one.files);
      assert(h0['src/a.js'] !== h1['src/a.js'] && h0['index.html'] === h1['index.html'], 'hash lines');
      assert(base.version !== one.version, 'VERSION did not change');
    });
    const add = await build(mini('\n', (t) => { t['src/b.js'] = 'export const B = 1;\n'; }));
    const del = await build(mini('\n', (t) => { delete t['src/a.js']; }));
    check('7 a new file is listed, a deleted one is not', () => {
      assert(add.files.some(([p]) => p === 'src/b.js'), 'src/b.js not listed');
      assert(!del.files.some(([p]) => p === 'src/a.js') && del.version !== base.version, 'deleted file still listed');
    });
    const mus = await (async () => {
      const d = mini(); const mp3 = Buffer.from('another take');
      const name = 'assets/music/title.' + sha(mp3).slice(0, 8) + '.mp3';
      fs.writeFileSync(path.join(d, name), mp3);
      fs.writeFileSync(path.join(d, 'src/music_manifest.js'), "export const MUSIC_TRACKS = {\n  title: { url: '" + name + "', kind: 'loop' },\n};\n");
      return build(d);
    })();
    check('7 a changed music url changes MUSIC and VERSION', () => {
      assert(JSON.stringify(mus.music) !== JSON.stringify(base.music) && mus.version !== base.version, 'no change');
    });
    const core = await build(mini('\n', (t) => { t['sw.js'] = t['sw.js'].replace('const URGENT = false;', 'const URGENT = false; '); }));
    check('7 one character changed in sw.js outside the block changes VERSION', () => {
      assert(core.version !== base.version, 'VERSION ignores the worker code');
    });
    const crlf = await build(mini('\r\n'));
    check('7 a CRLF copy and an LF copy of the tree give the same VERSION', () => {
      assert(crlf.version === base.version, crlf.version + ' != ' + base.version);
      assert(crlf.text.includes('\r\n') && !base.text.includes('\r\n'), 'the line endings of sw.js were not kept');
    });
    const d2 = mini();
    const b1 = await build(d2), b2 = await build(d2);
    check('7 build twice gives identical text', () => assert(b1.text === b2.text, 'not deterministic'));
    fs.writeFileSync(path.join(d2, 'sw.js'), b1.text);
    const b3 = await build(d2);
    check('7 writing build().text and building again is current', () => assert(b3.current && !b1.current, 'not current after write'));
  } finally {
    for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* temp */ } }
  }
}

// ---- 8. the seams ----
const html = read('index.html').toString('utf8');
if (!KILL) {
  check('8 index.html registers sw.js with updateViaCache none; the BOOT AND UPDATES script is the only classic script', () => {
    assert(html.includes("register('sw.js', { updateViaCache: 'none' })"), 'register call missing or changed');
    assert(html.includes('BOOT AND UPDATES'), 'BOOT AND UPDATES marker missing');
    const tags = [...html.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1]);
    const classic = tags.filter((a) => !/type\s*=\s*"module"/.test(a));
    assert(classic.length === 1, 'expected exactly one non-module script, found ' + classic.length);
  });
  check('8 src/main.js reports the first frame inside function frame', () => {
    const src = read('src/main.js').toString('utf8');
    const i = src.indexOf('function frame(now)'); const j = src.indexOf('\n}', i);
    assert(i >= 0 && src.slice(i, j).includes('globalThis.hordesBooted('), 'the boot report is not inside frame()');
  });
}
check('8 sw.js is under 64 KB', () => assert(Buffer.byteLength(swText) < 65536, 'sw.js is ' + Buffer.byteLength(swText) + ' bytes'));
if (!KILL) {
  check('8 sw.js has const URGENT', () => {
    const m = /const URGENT = (true|false);/.exec(swText);
    assert(m, 'const URGENT = true|false; missing');
    if (m[1] === 'true') console.log('URGENT RELEASE: sw.js takes over at install (docs/CHECKPOINT.md: Steve\'s OK, and back to false next release)');
  });
}

// ---- 9. G2: after its first frame a page fetches no precached file ----
function stripComments(s) {   // strings and templates kept whole; comments removed
  let out = ''; let i = 0; const n = s.length;
  while (i < n) {
    const c = s[i], d = s[i + 1];
    if (c === '/' && d === '/') { while (i < n && s[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { const e = s.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < n && s[j] !== c) { if (s[j] === '\\') j++; else if (c !== '`' && s[j] === '\n') break; j++; }
      out += s.slice(i, j + 1); i = j + 1; continue;
    }
    out += c; i++;
  }
  return out;
}
const srcFiles = [];
(function walk(d) { for (const n of fs.readdirSync(path.join(ROOT, d))) { const p = d + '/' + n; if (fs.statSync(path.join(ROOT, p)).isDirectory()) walk(p); else if (/\.m?js$/.test(p)) srcFiles.push(p); } })('src');
const IMPORT_ALLOW = { 'src/main.js': ["'./audio.js'"] };   // top-level await during boot, before the first frame
const FETCH_ALLOW = [];                                        // files besides src/music_files.js
check('9 every dynamic import() in src/ is on the allowlist (G2)', () => {
  const bad = [];
  for (const p of srcFiles) {
    const s = stripComments(read(p).toString('utf8'));
    for (const m of s.matchAll(/\bimport\s*\(\s*([^)]*?)\s*\)/g)) {
      if (!(IMPORT_ALLOW[p] || []).includes(m[1])) bad.push(p + ': import(' + m[1] + ')');
    }
  }
  assert(bad.length === 0, 'a dynamic import after boot could load another release\'s file after an update; load it statically, or prove it runs before the first frame and add it here: ' + bad.join('; '));
});
check('9 every fetch( in src/ is in src/music_files.js or on the allowlist (G2)', () => {
  const bad = [];
  for (const p of srcFiles) {
    if (p === 'src/music_files.js' || FETCH_ALLOW.includes(p)) continue;
    if (/\bfetch\s*\(/.test(stripComments(read(p).toString('utf8')))) bad.push(p);
  }
  assert(bad.length === 0, 'fetch( outside src/music_files.js could load a precached file after an update: ' + bad.join(', '));
});

// Every other way a page loads a file after boot: a worker (its own imports always go to the
// network, sw.js row 5), importScripts, an injected script / link / img / audio / video / iframe /
// source, new Image / new Audio, a src= / href= assignment or setAttribute, and a CSS url( in a
// string. A src= / href= set to URL.createObjectURL(...) loads nothing. LOADER_ALLOW lists the
// rest by file and matched text.
const LOADER_ALLOW = {
  'src/main.js': ['new Worker(url)'],   // the blob timer worker: a blob: URL, no file
  'src/save.js': ['.href = url'],       // the save download link: a blob: or data: URL
};
const LOADERS = [
  /\bnew\s+(?:Shared)?Worker\s*\([^)]*\)/g,
  /\bimportScripts\s*\(/g,
  /\bcreateElement\s*\(\s*['"`](?:script|link|img|image|audio|video|iframe|source|embed|object)['"`]/gi,
  /\bnew\s+(?:Image|Audio)\s*\(/g,
  /\.(?:src|href|srcset|data)\s*=(?!=)\s*(?!\s|URL\.createObjectURL\()[^;\n]*/g,
  /\bsetAttribute\s*\(\s*['"`](?:src|href|srcset)['"`]/g,
  /['"`][^'"`\n]*\burl\(\s*['"]?(?!data:|blob:|#)[^'"`\n]*/g,
];
check('9 every other post-boot loader in src/ (Worker, importScripts, injected elements, src= / href=, CSS url) is on the allowlist (G2)', () => {
  const bad = [];
  for (const p of srcFiles) {
    const s = stripComments(read(p).toString('utf8'));
    for (const re of LOADERS) for (const m of s.matchAll(re)) {
      const t = m[0].trim();
      if (!(LOADER_ALLOW[p] || []).includes(t)) bad.push(p + ': ' + t.slice(0, 80));
    }
  }
  assert(bad.length === 0, 'a load after boot could fetch another release\'s file after an update; load it statically, or prove it loads no precached file and add it here: ' + bad.join('; '));
});
check('9 the loader scan finds a module worker, an img.src and an injected script (self-test)', () => {
  const probe = stripComments("const w = new Worker(new URL('./sim_worker.js', import.meta.url), { type: 'module' });\nimg.src = 'assets/ui/panel.png';\nconst sc = document.createElement('script');\nel.style.background = 'url(assets/x.png)';\na.href = URL.createObjectURL(blob);\n");
  const hits = LOADERS.map((re) => [...probe.matchAll(re)].length);
  assert(hits[0] === 1 && hits[2] === 1 && hits[4] === 1 && hits[6] === 1, 'scan misses: ' + JSON.stringify(hits));
});

// ---- 10. every relative src= / href= in index.html is precached ----
if (!KILL) {
  check('10 every relative src= and href= in index.html is in FILES', () => {
    const refs = [...html.matchAll(/\b(?:src|href)\s*=\s*"([^"]*)"/g)].map((m) => m[1])
      .filter((u) => u && !/^(?:[a-z]+:|\/\/|#|data:)/i.test(u));
    assert(refs.length >= 2, 'expected at least src/main.js and the manifest, found ' + refs.join(', '));
    const miss = refs.map((u) => u.split(/[?#]/)[0]).filter((u) => !(u in block.FILES));
    assert(miss.length === 0, 'not precached: ' + miss.join(', '));
  });
}

console.log('test_sw_manifest: ' + passed + ' checks passed' + (KILL ? ' (KILL SWITCH LIVE)' : '') + (r ? ' (VERSION ' + r.version + ')' : ''));
